// 连接失败路径的断连监听清理锁定（QA 回归轮 1 修复）：
//
// 不变量：connect() 失败（catch 路径，facade.connect() 抛错）⇒ 本次订阅的
// transport.onDisconnect 必须已退订。否则被丢弃的 transport 在用户之后拔设备时
// 触发残留回调 → handleLost 把 'error' 态误报成 'lost' 并弹「设备已断开」Toast。
//
// 实现方式：独立测试文件 + vi.mock('@/core/device') 局部替换 createDeviceFacade，
// 返回一个 connect() 必败的门面桩，从而**确定性**命中 catch 路径（不与
// simulateDisconnect 竞态，那是 qa-device-lost-probe.test.ts 场景 A 的写法），
// 并通过桩捕获 transport 引用，供失败后验证残留回调已被清理。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRealDefinitionRaw } from '@/definition/__tests__/fixtures/realDefinition';
import { useDefinitionStore } from '@/store/useDefinitionStore';
import { useDeviceStore, getFacade } from '@/store/useDeviceStore';
import { useKeymapStore } from '@/store/useKeymapStore';
import { useMenuStore } from '@/store/useMenuStore';
import { useDebugStore } from '@/store/useDebugStore';
import { toast } from '@/ui/primitives/Toast';
import type { DummyTransport } from '@/core/hid/DummyTransport';
import type { DeviceFacade } from '@/core/device';

// vi.mock 提升到文件顶部执行，捕获变量必须走 vi.hoisted
const captured = vi.hoisted(() => ({
  transport: null as DummyTransport | null,
}));

vi.mock('@/core/device', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/device')>();
  return {
    ...actual,
    createDeviceFacade: (transport: Parameters<typeof actual.createDeviceFacade>[0]) => {
      captured.transport = transport as DummyTransport;
      // connect() 必败的桩：命中 useDeviceStore.connect 的 catch 路径
      return {
        connect: () => Promise.reject(new Error('模拟握手失败')),
      } as unknown as DeviceFacade;
    },
  };
});

describe('connect 失败后断连监听必须清理', () => {
  let toastErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    useDefinitionStore.getState().loadFromJson(loadRealDefinitionRaw(), '测试定义');
    if (!useDefinitionStore.getState().definition) throw new Error('测试定义解析失败');
    useDeviceStore.setState({ transportKind: 'dummy' });
    captured.transport = null;
    toastErrorSpy = vi.spyOn(toast, 'error');
  });

  afterEach(async () => {
    toastErrorSpy.mockRestore();
    useDeviceStore.setState({ transportKind: 'dummy' });
    await useDeviceStore.getState().disconnect();
    useKeymapStore.getState().reset();
    useMenuStore.getState().reset();
    useDebugStore.getState().clearFrames();
  });

  it('connect 抛错 → 终态 error；其后再触发 transport 断连 → 不进入 lost、不弹 Toast', async () => {
    // 前置：确实走到了订阅之后才失败（transport 已被桩捕获，且连接已返回失败）
    const ok = await useDeviceStore.getState().connect();
    expect(ok).toBe(false);
    expect(captured.transport).not.toBeNull(); // 订阅发生在此 transport 上
    expect(useDeviceStore.getState().state).toBe('error');
    expect(getFacade()).toBeNull();

    // 被丢弃的 transport 触发断连回调：残留订阅（修复前）会误报 lost
    captured.transport?.simulateDisconnect();
    await Promise.resolve();

    const state = useDeviceStore.getState();
    expect(state.state).toBe('error');
    expect(state.state).not.toBe('lost');
    expect(state.handshake).toBeNull();
    // 不弹「设备已断开」Toast
    expect(toastErrorSpy).not.toHaveBeenCalledWith('设备已断开');
    expect(toastErrorSpy).not.toHaveBeenCalled();
  });
});
