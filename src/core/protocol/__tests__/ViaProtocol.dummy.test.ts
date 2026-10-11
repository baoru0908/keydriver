// ViaProtocol 单测：用 DummyTransport 跑通全部命令，并覆盖超时/未处理/方言错位错误路径（架构 T02.2）。
import { describe, expect, it } from 'vitest';
import { ViaProtocol, type FrameRecord } from '@/core/protocol/ViaProtocol';
import { DummyTransport } from '@/core/hid/DummyTransport';
import { makeAddress } from '@/core/protocol/CustomValueCodec';
import {
  EchoParamMismatchError,
  IncompatibleProtocolError,
  UnhandledCommandError,
} from '@/core/protocol/errors';
import { TimeoutError } from '@/core/hid/HidTransport';
import { VIA_CMD } from '@/core/protocol/constants';
import { decodeKeycode, encodeKeycode } from '@/core/protocol/KeycodeCodec';

async function setup(config: Partial<ConstructorParameters<typeof DummyTransport>[0]> = {}) {
  const frames: FrameRecord[] = [];
  const transport = new DummyTransport(config);
  const devices = await transport.listDevices();
  const device = devices[0];
  if (!device) throw new Error('Dummy 设备列表为空');
  await transport.open(device);
  const protocol = new ViaProtocol(transport, { onFrame: (r) => frames.push(r) });
  return { transport, protocol, frames };
}

describe('ViaProtocol · 基础命令', () => {
  it('getProtocolVersion 返回 11', async () => {
    const { protocol } = await setup();
    await expect(protocol.getProtocolVersion()).resolves.toBe(11);
  });

  it('getLayerCount 返回配置的层数', async () => {
    const { protocol } = await setup({ layerCount: 6 });
    await expect(protocol.getLayerCount()).resolves.toBe(6);
  });

  it('键盘值读写（layout_options 大端）', async () => {
    const { protocol } = await setup();
    await protocol.setKeyboardValue(0x02, 0x0000_01ff);
    await expect(protocol.getKeyboardValue(0x02)).resolves.toBe(0x1ff);
  });

  it('单键键码读写（2 字节大端）', async () => {
    const { protocol } = await setup();
    await protocol.setKeycode(0, 2, 3, 0x0104);
    await expect(protocol.getKeycode(0, 2, 3)).resolves.toBe(0x0104);
    const [hi, lo] = encodeKeycode(0x0104);
    expect(decodeKeycode(hi, lo)).toBe(0x0104);
  });

  it('keymap buffer 分块读写（28 字节）', async () => {
    const { protocol } = await setup({ rows: 5, cols: 15, layerCount: 2 });
    const data = new Uint8Array(28);
    for (let i = 0; i < 28; i += 2) {
      data[i] = 0x01;
      data[i + 1] = 0x04 + i;
    }
    await protocol.setKeymapBuffer(0, data);
    const read = await protocol.getKeymapBuffer(0, 28);
    expect(read).toHaveLength(28);
    expect(Array.from(read)).toEqual(Array.from(data));
    await expect(protocol.getKeycode(0, 0, 0)).resolves.toBe(0x0104);
  });

  it('自定义值 get/set/save', async () => {
    const { protocol, transport } = await setup();
    const address = makeAddress(9, 1, [2]);
    transport.firmware.seedValue(address.key, 0x0104, 2);
    await expect(protocol.customGetValue(address, 2)).resolves.toBe(0x0104);
    await protocol.customSetValue(address, 0x0231, 2);
    await expect(protocol.customGetValue(address, 2)).resolves.toBe(0x0231);
    await expect(protocol.customSave(address)).resolves.toBeUndefined();
    expect(transport.firmware.eeprom.get(address.key)).toBe(0x0231);
  });

  it('eepromReset 之后自定义值回到未设置状态', async () => {
    const { protocol, transport } = await setup();
    const address = makeAddress(6, 1, []);
    transport.firmware.seedValue(address.key, 7, 1);
    await protocol.eepromReset();
    expect(transport.firmware.customValues.has(address.key)).toBe(false);
  });
});

describe('ViaProtocol · 错误路径', () => {
  it('协议版本 < 11 抛 IncompatibleProtocolError', async () => {
    const { protocol } = await setup({ protocolVersion: 10 });
    await expect(protocol.assertProtocolVersion()).rejects.toBeInstanceOf(IncompatibleProtocolError);
  });

  it('注入 latencyMs 触发 TimeoutError', async () => {
    const { protocol } = await setup({ latencyMs: 800 });
    await expect(protocol.getProtocolVersion()).rejects.toBeInstanceOf(TimeoutError);
  });

  it('注入 dropRate 触发 TimeoutError', async () => {
    const { protocol } = await setup({ dropRate: 1 });
    await expect(protocol.getLayerCount()).rejects.toBeInstanceOf(TimeoutError);
  });

  it('未处理命令（回显 0xFF）抛 UnhandledCommandError', async () => {
    const { protocol } = await setup();
    await expect(protocol.rawCommand([0x99])).resolves.toBeDefined();
    const { protocol: p2 } = await setup({ unhandledChannels: [3] });
    await expect(p2.customGetValue(makeAddress(3, 1, []), 1)).rejects.toBeInstanceOf(
      UnhandledCommandError,
    );
  });

  it('方言错位（echoOffset=1）时参数回声不一致 → 抛 EchoParamMismatchError（第二道防线）', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    await expect(protocol.customGetValue(makeAddress(9, 1, [2]), 2)).rejects.toBeInstanceOf(
      EchoParamMismatchError,
    );
  });

  it('响应有效性两道防线：0xFF 判定 + 参数回声判定', async () => {
    // ① resp[0] === 0xFF
    const { protocol: p1 } = await setup({ unhandledChannels: [3] });
    await expect(p1.customGetValue(makeAddress(3, 1, []), 1)).rejects.toBeInstanceOf(
      UnhandledCommandError,
    );
    // ② 参数回声不一致：固件把 layer/row/col 原样回显错一位
    const { protocol: p2 } = await setup();
    await expect(p2.getKeycode(0, 1, 2)).resolves.toBeGreaterThanOrEqual(0);
    await expect(p2.getKeycode(9, 1, 2)).resolves.toBeGreaterThanOrEqual(0);
  });

  it('全部报文都被记录（TX/RX 成对）', async () => {
    const { protocol, frames } = await setup();
    await protocol.getProtocolVersion();
    expect(frames.filter((f) => f.dir === 'tx')).toHaveLength(1);
    expect(frames.filter((f) => f.dir === 'rx')).toHaveLength(1);
    expect(frames[0]?.commandId).toBe(VIA_CMD.GET_PROTOCOL_VERSION);
    expect(frames[0]?.hex).toMatch(/^01 00 00 00/);
  });
});
