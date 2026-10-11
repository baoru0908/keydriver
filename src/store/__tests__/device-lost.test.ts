// 断连状态机单测（T06-2）：lost 与主动 disconnect 刻意区分，intentionalClose 守卫防误报。
//
// 覆盖点（跨文件共享约定 #1/#2）：
//  1. 意外断连（Dummy simulateDisconnect）→ ≤1s 进入 'lost'、清 facade/handshake；
//  2. lost 路径**禁调** useKeymapStore.reset / useMenuStore.reset（脏值保留）；
//  3. 主动 disconnect 全程 intentionalClose 置位 → 竞态断连事件不误报 lost，且走全量重置；
//  4. lost 后写操作被门控拒绝（facade 已清空）；
//  5. lost → 重连成功后脏值仍在。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRealDefinitionRaw } from '@/definition/__tests__/fixtures/realDefinition';
import { useDefinitionStore } from '@/store/useDefinitionStore';
import { useDeviceStore, getFacade } from '@/store/useDeviceStore';
import { useKeymapStore } from '@/store/useKeymapStore';
import { useMenuStore } from '@/store/useMenuStore';
import { useDebugStore } from '@/store/useDebugStore';
import { DummyTransport } from '@/core/hid/DummyTransport';

/** 取当前连接所用 DummyTransport（facade 创建后即为 DummyTransport）。 */
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

/** 给键位与菜单各制造一个脏值。 */
function primeDirty(): void {
  useKeymapStore.getState().setLayers([new Uint16Array(75).fill(0x04)], 5, 15);
  useKeymapStore.getState().setKeycode(0, 0, 0, 0x1e);
  useMenuStore.getState().markDirty('dirty-control-1');
}

describe('断连状态机（T06-2）', () => {
  beforeEach(() => {
    useDefinitionStore.getState().loadFromJson(loadRealDefinitionRaw(), '测试定义');
    if (!useDefinitionStore.getState().definition) throw new Error('测试定义解析失败');
  });

  afterEach(async () => {
    // 强制复位：无论用例走到哪一步，都把连接与本地态清干净
    useDeviceStore.setState({ transportKind: 'dummy' });
    await useDeviceStore.getState().disconnect();
    useKeymapStore.getState().reset();
    useMenuStore.getState().reset();
    useDebugStore.getState().clearFrames();
  });

  it('意外断连 → ≤1s 进入 lost，handshake 清空且 busy 复位', async () => {
    await connectDummy();
    expect(useDeviceStore.getState().state).toBe('connected');

    currentDummyTransport().simulateDisconnect();
    // onDisconnect 回调是同步派发，微任务后断言即远小于 1s
    await Promise.resolve();

    const state = useDeviceStore.getState();
    expect(state.state).toBe('lost');
    expect(state.handshake).toBeNull();
    expect(state.busy).toBe(false);
    expect(getFacade()).toBeNull();
  });

  it('lost 路径保留键位与菜单脏值（刻意与主动断开区分）', async () => {
    await connectDummy();
    primeDirty();
    expect(useKeymapStore.getState().dirtyKeys.size).toBeGreaterThan(0);
    expect(useMenuStore.getState().dirty.size).toBeGreaterThan(0);

    currentDummyTransport().simulateDisconnect();
    await Promise.resolve();

    expect(useDeviceStore.getState().state).toBe('lost');
    // ⚠️ 约定：lost 不 reset keymap/menu store
    expect(useKeymapStore.getState().dirtyKeys.size).toBeGreaterThan(0);
    expect(useMenuStore.getState().dirty.size).toBeGreaterThan(0);
  });

  it('主动 disconnect 期间冒出的断连事件不误报 lost（intentionalClose 守卫）', async () => {
    await connectDummy();
    primeDirty();

    const closing = useDeviceStore.getState().disconnect();
    // disconnect 尚未完成（intentionalClose 已置位）：此刻的意外断连必须被守卫吞掉
    currentDummyTransport().simulateDisconnect();
    await closing;

    const state = useDeviceStore.getState();
    expect(state.state).toBe('disconnected');
    expect(state.state).not.toBe('lost');
    // 主动断开走全量重置
    expect(useKeymapStore.getState().dirtyKeys.size).toBe(0);
    expect(useMenuStore.getState().dirty.size).toBe(0);
  });

  it('lost 后写操作被门控拒绝', async () => {
    await connectDummy();
    currentDummyTransport().simulateDisconnect();
    await Promise.resolve();

    await expect(useDeviceStore.getState().applyKeycode(0, 0, 0, 0x04)).resolves.toBe(false);
    const control = useDefinitionStore.getState().definition?.controls[0];
    if (!control) throw new Error('测试定义没有控件');
    await expect(useDeviceStore.getState().menuCommit(control, 1)).resolves.toBe(false);
  });

  it('lost → 一键重连成功后脏值仍在', async () => {
    await connectDummy();
    primeDirty();
    currentDummyTransport().simulateDisconnect();
    await Promise.resolve();
    expect(useDeviceStore.getState().state).toBe('lost');

    await connectDummy();
    const state = useDeviceStore.getState();
    expect(state.state).toBe('connected');
    expect(useKeymapStore.getState().dirtyKeys.size).toBeGreaterThan(0);
    expect(useMenuStore.getState().dirty.size).toBeGreaterThan(0);
  });
});
