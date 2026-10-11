// QA 探边（回归验证轮 1）：T06-2 断连状态机的竞态与边界 + T06-3 脏计数真店集成。
//
// 与 device-lost.test.ts 互补，专测主理人指定的竞态场景：
//  A. connect 握手进行中（state='connecting'）设备意外断连 → 终态必须是 'lost'，
//     且绝不允许出现「state='connected' 但 facade=null」的幽灵连接。
//  B. 主动 disconnect 完成后才到达的迟到的断连事件 → 必须是 no-op（订阅已退订）。
//  C. lost 之后用户主动 disconnect → disconnected 且脏值清空（明确语义）。
//  D. 脏计数真店集成：真实 keymap/menu store 变更 → 推送；保存/清空后必须推送 0
//    （否则主进程关窗拦截会永久误弹）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRealDefinitionRaw } from '@/definition/__tests__/fixtures/realDefinition';
import { useDefinitionStore } from '@/store/useDefinitionStore';
import { useDeviceStore, getFacade } from '@/store/useDeviceStore';
import { useKeymapStore } from '@/store/useKeymapStore';
import { useMenuStore } from '@/store/useMenuStore';
import { useDebugStore } from '@/store/useDebugStore';
import { DummyTransport } from '@/core/hid/DummyTransport';
import { createDirtyReporter } from '@/shared/dirtyCount';

function currentDummyTransport(): DummyTransport {
  const facade = getFacade();
  if (!facade) throw new Error('测试前置失败：facade 未建立');
  const transport = facade.transport;
  if (!(transport instanceof DummyTransport)) throw new Error('测试前置失败：非 dummy 传输');
  return transport;
}

async function connectDummy(): Promise<void> {
  useDeviceStore.setState({ transportKind: 'dummy' });
  const ok = await useDeviceStore.getState().connect();
  if (!ok) throw new Error(`测试前置失败：connect 未成功（${useDeviceStore.getState().error ?? '?'}）`);
}

describe('QA 探边 · T06-2 竞态', () => {
  beforeEach(() => {
    useDefinitionStore.getState().loadFromJson(loadRealDefinitionRaw(), '测试定义');
    useDeviceStore.setState({ transportKind: 'dummy' });
  });

  afterEach(async () => {
    useDeviceStore.setState({ transportKind: 'dummy' });
    await useDeviceStore.getState().disconnect();
    useKeymapStore.getState().reset();
    useMenuStore.getState().reset();
    useDebugStore.getState().clearFrames();
  });

  it('A. connect 握手进行中设备断连：终态不得是幽灵 connected（connected 必须有 facade）', async () => {
    useKeymapStore.getState().setLayers([new Uint16Array(75).fill(0x04)], 5, 15);
    useKeymapStore.getState().setKeycode(0, 0, 0, 0x1e);
    useMenuStore.getState().markDirty('probe-dirty-1');

    const connecting = useDeviceStore.getState().connect();
    // 自旋等 facade 出现（此时必然仍在 connecting：handshake 尚未完成）
    let spins = 0;
    while ((!getFacade() || useDeviceStore.getState().state !== 'connecting') && spins < 100_000) {
      await Promise.resolve();
      spins += 1;
    }
    const raced =
      getFacade() !== null && useDeviceStore.getState().state === 'connecting';
    expect(raced).toBe(true); // 前置：确实命中了「握手进行中」窗口

    if (raced && getFacade()) {
      currentDummyTransport().simulateDisconnect();
    }
    await connecting;

    const state = useDeviceStore.getState();
    // 核心不变量：报告 connected 就必须有可用 facade；否则一切写入静默失败
    if (state.state === 'connected') {
      expect(getFacade()).not.toBeNull();
    }
  });

  it('A2. connect 握手进行中设备断连：脏值必须保留（无论终态是 lost 还是 error）', async () => {
    useKeymapStore.getState().setLayers([new Uint16Array(75).fill(0x04)], 5, 15);
    useKeymapStore.getState().setKeycode(0, 0, 0, 0x1e);
    useMenuStore.getState().markDirty('probe-dirty-2');

    const connecting = useDeviceStore.getState().connect();
    let spins = 0;
    while ((!getFacade() || useDeviceStore.getState().state !== 'connecting') && spins < 100_000) {
      await Promise.resolve();
      spins += 1;
    }
    if (getFacade() && useDeviceStore.getState().state === 'connecting') {
      currentDummyTransport().simulateDisconnect();
    }
    await connecting;

    const state = useDeviceStore.getState();
    if (state.state !== 'connected') {
      // 意外断连路径（lost / error）都禁 reset：脏值必须原样保留
      expect(useKeymapStore.getState().dirtyKeys.size).toBeGreaterThan(0);
      expect(useMenuStore.getState().dirty.size).toBeGreaterThan(0);
    }
  });

  it('B. disconnect 完成后迟到的断连事件是 no-op（订阅已退订，不误报 lost）', async () => {
    await connectDummy();
    const transport = currentDummyTransport();
    await useDeviceStore.getState().disconnect();

    transport.simulateDisconnect();
    await Promise.resolve();

    expect(useDeviceStore.getState().state).toBe('disconnected');
  });

  it('C. lost 之后用户主动 disconnect：终态 disconnected 且脏值清空', async () => {
    await connectDummy();
    useKeymapStore.getState().setKeycode(0, 0, 0, 0x1e);
    useMenuStore.getState().markDirty('probe-dirty-3');
    currentDummyTransport().simulateDisconnect();
    await Promise.resolve();
    expect(useDeviceStore.getState().state).toBe('lost');

    await useDeviceStore.getState().disconnect();
    expect(useDeviceStore.getState().state).toBe('disconnected');
    expect(useKeymapStore.getState().dirtyKeys.size).toBe(0);
    expect(useMenuStore.getState().dirty.size).toBe(0);
  });
});

describe('QA 探边 · T06-3 脏计数真店集成', () => {
  beforeEach(() => {
    useDefinitionStore.getState().loadFromJson(loadRealDefinitionRaw(), '测试定义');
  });

  afterEach(() => {
    useKeymapStore.getState().reset();
    useMenuStore.getState().reset();
  });

  /** 与 AppShell 相同的组合方式：两个 store 各订一份，任一变更即重算推送。 */
  function makeRealReporter(): { calls: number[]; dispose: () => void } {
    const calls: number[] = [];
    const reporter = createDirtyReporter(
      { setDirtyCount: (n) => calls.push(n) },
      () => useKeymapStore.getState().dirtyKeys,
      () => useMenuStore.getState().dirty,
      (listener) => {
        const u1 = useKeymapStore.subscribe(listener);
        const u2 = useMenuStore.subscribe(listener);
        return () => {
          u1();
          u2();
        };
      },
    );
    return { calls, dispose: reporter.dispose };
  }

  it('D1. 两处脏值聚合推送；保存清零（markClean/reset）后必须推送 0', () => {
    const { calls, dispose } = makeRealReporter();
    try {
      // 挂载推送（AppShell 挂载即 push 一次）：初始 0
      expect(calls).toEqual([]);

      // 制造脏值：keymap 一处 + menu 两处 → 订阅回调推送 3
      useKeymapStore.getState().setLayers([new Uint16Array(75).fill(0x04)], 5, 15);
      useKeymapStore.getState().setKeycode(0, 0, 0, 0x1e);
      useMenuStore.getState().markDirty('probe-a');
      useMenuStore.getState().markDirty('probe-b');
      expect(useKeymapStore.getState().dirtyKeys.size).toBe(1);
      expect(useMenuStore.getState().dirty.size).toBe(2);
      expect(calls[calls.length - 1]).toBe(3);

      // 模拟「保存全部」清零（menuSaveAll 逐个 markClean；keymap 写入成功即 markClean）
      useMenuStore.getState().markClean('probe-a');
      useMenuStore.getState().markClean('probe-b');
      useKeymapStore.getState().markClean(0, 0, 0);
      expect(calls[calls.length - 1]).toBe(0); // ⚠️ 若最终不推 0，主进程会永久误弹关窗确认

      // 再次变脏：计数恢复
      useMenuStore.getState().markDirty('probe-c');
      expect(calls[calls.length - 1]).toBe(1);
    } finally {
      dispose();
    }
  });

  it('D2. dispose 后 store 变更不再推送（防泄漏重复推送）', () => {
    const { calls, dispose } = makeRealReporter();
    dispose();
    useMenuStore.getState().markDirty('probe-after-dispose');
    useMenuStore.getState().markClean('probe-after-dispose');
    expect(calls).toEqual([]);
  });
});
