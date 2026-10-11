// 设备门面单测：Dummy 上跑通握手 8 步、键位读写回读一致、防抖写入（架构 T03.2）。
import { describe, expect, it } from 'vitest';
import { DeviceFacade } from '@/core/device/DeviceFacade';
import { DummyTransport } from '@/core/hid/DummyTransport';
import type { ProtocolWarning } from '@/core/device/handshake';
import { loadRealParsedDefinition } from '@/definition/__tests__/fixtures/realDefinition';
import { IncompatibleProtocolError } from '@/core/protocol/errors';
import type { ParsedDefinition } from '@/definition/schema';
import { VIA_CMD } from '@/core/protocol/constants';

const definition: ParsedDefinition = loadRealParsedDefinition();

async function connected(config: Partial<ConstructorParameters<typeof DummyTransport>[0]> = {}) {
  const warnings: ProtocolWarning[] = [];
  const frames: { commandId: number; dir: string }[] = [];
  const transport = new DummyTransport({
    vendorId: definition.vid,
    productId: definition.pid,
    rows: definition.matrix.rows,
    cols: definition.matrix.cols,
    layerCount: 4,
    ...config,
  });
  const device = (await transport.listDevices())[0];
  if (!device) throw new Error('Dummy 设备列表为空');
  const facade = new DeviceFacade(transport, device, {
    definition,
    onWarning: (w) => warnings.push(w),
    onFrame: (r) => frames.push({ commandId: r.commandId, dir: r.dir }),
  });
  const result = await facade.connect();
  return { transport, facade, result, warnings, frames };
}

describe('DeviceFacade · 握手', () => {
  it('PRD §5.6 全部 8 步跑通，探针通过', async () => {
    const { result } = await connected();
    expect(result.protocolVersion).toBe(11);
    expect(result.layerCount).toBe(4);
    expect(result.layoutOptions).toBe(0);
    expect(result.probe.passed).toBe(true);
  });

  it('未加载定义文件时跳过探针且连接不阻断', async () => {
    const transport = new DummyTransport({});
    const device = (await transport.listDevices())[0];
    if (!device) throw new Error('Dummy 设备列表为空');
    const facade = new DeviceFacade(transport, device, { definition: null });
    const result = await facade.connect();
    expect(result.protocolVersion).toBe(11);
    expect(result.probe.passed).toBe(true);
    expect(result.probe.detail).toContain('跳过');
  });

  it('方言整体错位一位时连协议版本都读不出来 → 明确报错而不是静默降级', async () => {
    // echoOffset 让固件把所有响应左移 1 字节，属于「命令码相同但帧格式不同」的极端情况
    await expect(connected({ echoOffset: 1 })).rejects.toBeInstanceOf(IncompatibleProtocolError);
  });

  it('探针通道未处理时探针失败，但连接仍成功并产生告警', async () => {
    const probe = definition.controls.find((c) => c.type === 'keycode');
    if (!probe) throw new Error('定义文件缺少 keycode 控件');
    const { result, warnings } = await connected({ unhandledChannels: [probe.address.channel] });
    expect(result.probe.passed).toBe(false);
    expect(result.protocolVersion).toBe(11);
    expect(warnings.some((w) => w.level === 'warn')).toBe(true);
    expect(result.probe.responseHex).toBeDefined();
  });

  it('协议 ≥ 13 时先读键码字典版本（0x02+0x06，BCD）', async () => {
    const { result } = await connected({ protocolVersion: 13 });
    expect(result.keycodesVersion).toBe(0x0000_0009);
  });

  it('协议 < 13 时不读键码字典版本（返回 null）', async () => {
    const { result } = await connected({ protocolVersion: 12 });
    expect(result.keycodesVersion).toBeNull();
  });

  it('Dummy 使用定义文件的 VID/PID', async () => {
    const { transport } = await connected();
    const device = (await transport.listDevices())[0];
    expect(device?.vendorId).toBe(definition.vid);
    expect(device?.productId).toBe(definition.pid);
  });
});

describe('DeviceFacade · 键位', () => {
  it('整层键位拉取长度 = rows × cols', async () => {
    const { facade } = await connected();
    const keymap = await facade.getKeymap(0);
    expect(keymap).toHaveLength(definition.matrix.rows * definition.matrix.cols);
  });

  it('改键后回读一致（R-P0-08）', async () => {
    const { facade } = await connected();
    await facade.setKeycode(2, 1, 3, 0x0104);
    await expect(facade.protocol.getKeycode(2, 1, 3)).resolves.toBe(0x0104);
    const layer2 = await facade.getKeymap(2);
    expect(layer2[1 * definition.matrix.cols + 3]).toBe(0x0104);
  });

  it('变更入撤销栈（R-P1-07）', async () => {
    const { facade } = await connected();
    await facade.setKeycode(0, 0, 0, 0x0029);
    expect(facade.session.undoDepth).toBe(1);
    const entry = facade.session.popChange();
    expect(entry?.after).toBe(0x0029);
  });

  it('布局选项读写', async () => {
    const { facade } = await connected();
    await facade.setLayoutOptions(0x0042);
    await expect(facade.getLayoutOptions()).resolves.toBe(0x42);
  });
});

describe('DeviceFacade · 自定义值与防抖', () => {
  it('读取 Dummy 预置值（按控件默认值生成）', async () => {
    const { facade } = await connected();
    const control = definition.controls.find((c) => c.type === 'range');
    if (!control) throw new Error('定义文件缺少 range 控件');
    const value = await facade.readValue(control);
    expect(value).toBeGreaterThanOrEqual(control.options.kind === 'range' ? control.options.min : 0);
  });

  it('写入后立即回读一致', async () => {
    const { facade } = await connected();
    const control = definition.controls.find((c) => c.type === 'keycode');
    if (!control) throw new Error('定义文件缺少 keycode 控件');
    await facade.writeValueNow(control, 0x0029);
    await expect(facade.readValue(control)).resolves.toBe(0x0029);
  });

  it('连续 100 次防抖写入只产生 1 次 HID 写', async () => {
    const { facade, frames } = await connected();
    const control = definition.controls.find((c) => c.type === 'range');
    if (!control) throw new Error('定义文件缺少 range 控件');
    const before = frames.filter((f) => f.commandId === VIA_CMD.CUSTOM_SET_VALUE).length;
    for (let i = 0; i < 100; i += 1) {
      facade.writeValueDebounced(control, 100 + i);
    }
    await facade.flushWrites();
    const after = frames.filter((f) => f.commandId === VIA_CMD.CUSTOM_SET_VALUE).length;
    // 防抖窗口内只保留最后一次：1 次 SET（首次写入另有一次回读自校验的 SET）
    expect(after - before).toBeLessThanOrEqual(2);
    await expect(facade.readValue(control)).resolves.toBe(199);
  });

  it('保存到 EEPROM 后值进入快照', async () => {
    const { facade, transport } = await connected();
    const control = definition.controls.find((c) => c.type === 'keycode');
    if (!control) throw new Error('定义文件缺少 keycode 控件');
    await facade.writeValueNow(control, 0x002a);
    await facade.saveValue(control);
    expect(transport.firmware.eeprom.get(control.address.key)).toBe(0x002a);
  });

  it('断开后会话重置', async () => {
    const { facade } = await connected();
    expect(facade.isConnected).toBe(true);
    await facade.disconnect();
    expect(facade.isConnected).toBe(false);
    expect(facade.session.handshake).toBeNull();
  });
});
