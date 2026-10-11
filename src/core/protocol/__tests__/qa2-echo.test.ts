// QA 高危点 2：响应有效性「双防御」——重点验证第二道防线（参数回声一致性）。
// 目标：固件认识命令码（resp[0] !== 0xFF）但参数回显错位时，必须抛 EchoParamMismatchError，
// 而不是静默返回 0 / 静默成功。
import { describe, expect, it } from 'vitest';
import { ViaProtocol, type FrameRecord } from '@/core/protocol/ViaProtocol';
import { DummyTransport } from '@/core/hid/DummyTransport';
import { echoMatches, echoPrefixMatches, isUnhandled } from '@/core/hid/frame';
import { makeAddress, addressKey } from '@/core/protocol/CustomValueCodec';
import {
  EchoParamMismatchError,
  UnhandledCommandError,
} from '@/core/protocol/errors';
import { MSG_LEN } from '@/core/hid/HidTransport';
import { VIA_CMD } from '@/core/protocol/constants';

type DummyConfig = ConstructorParameters<typeof DummyTransport>[0];

async function setup(config: DummyConfig = {}) {
  const frames: FrameRecord[] = [];
  const transport = new DummyTransport(config);
  const devices = await transport.listDevices();
  const device = devices[0];
  if (!device) throw new Error('Dummy 设备列表为空');
  await transport.open(device);
  const protocol = new ViaProtocol(transport, { onFrame: (r) => frames.push(r) });
  return { transport, protocol, frames };
}

/**
 * 协议方言替身：在响应 index=1 处插入一个额外的 channel 字节（V3 帧多带一个 channel），
 * 其余字节整体右移。命令码仍被保留在 resp[0]，因此第一道防线（0xFF）不会触发，
 * 只有第二道防线（参数回声）能识别这种错位。
 */
class DialectTransport extends DummyTransport {
  constructor(private readonly extraByte: number, config: DummyConfig = {}) {
    super(config);
  }

  override async transfer(request: Uint8Array, timeoutMs?: number): Promise<Uint8Array> {
    const response = await super.transfer(request, timeoutMs);
    const out = new Uint8Array(MSG_LEN);
    out[0] = response[0] ?? 0;
    out[1] = this.extraByte & 0xff;
    for (let i = 1; i < MSG_LEN - 1; i += 1) out[i + 1] = response[i] ?? 0;
    return out;
  }
}

async function setupDialect(extraByte: number, config: DummyConfig = {}) {
  const frames: FrameRecord[] = [];
  const transport = new DialectTransport(extraByte, config);
  const devices = await transport.listDevices();
  const device = devices[0];
  if (!device) throw new Error('Dummy 设备列表为空');
  await transport.open(device);
  const protocol = new ViaProtocol(transport, { onFrame: (r) => frames.push(r) });
  return { transport, protocol, frames };
}

/** 断言抛出的正是 EchoParamMismatchError，且携带错误码与原始报文。 */
function expectEchoMismatch(err: unknown): EchoParamMismatchError {
  expect(err).toBeInstanceOf(EchoParamMismatchError);
  expect(err).not.toBeInstanceOf(UnhandledCommandError);
  const e = err as EchoParamMismatchError;
  expect(e.code).toBe('E_PROTO_ECHO_MISMATCH');
  expect(e.name).toBe('EchoParamMismatchError');
  expect(typeof e.rawHex).toBe('string');
  expect(e.rawHex?.length).toBeGreaterThan(0);
  return e;
}

/** 取最后一次 rx 报文的 hex（大写前两位即响应首字节）。 */
function lastRxHex(frames: readonly FrameRecord[]): string {
  const rx = frames.filter((f) => f.dir === 'rx');
  const last = rx[rx.length - 1];
  expect(last).toBeDefined();
  return (last?.hex ?? '').toUpperCase();
}

describe('QA-2 第二道防线：echoOffset 制造整体错位（命令码仍被识别）', () => {
  it('customGetValue：参数回显错位 → 抛 EchoParamMismatchError，不得静默返回 0', async () => {
    const { protocol, frames } = await setup({ echoOffset: 1 });
    const addr = makeAddress(0, 1, []);
    const err = await protocol.customGetValue(addr, 2).catch((e: unknown) => e);
    expectEchoMismatch(err);
    // 第一道防线未被触发：响应首字节不是 0xFF
    expect(lastRxHex(frames).startsWith('FF')).toBe(false);
  });

  it('customGetValue：错位时确实「不返回 0」——承诺必须 reject', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    await expect(protocol.customGetValue(makeAddress(0, 1, []), 2)).rejects.toBeInstanceOf(
      EchoParamMismatchError,
    );
  });

  it('customSetValue：参数回显错位 → 抛 EchoParamMismatchError', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    const err = await protocol.customSetValue(makeAddress(0, 1, []), 0x1234, 2).catch((e: unknown) => e);
    expectEchoMismatch(err);
  });

  it('customSave：参数回显错位 → 抛 EchoParamMismatchError', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    const err = await protocol.customSave(makeAddress(0, 1, [])).catch((e: unknown) => e);
    expectEchoMismatch(err);
  });

  it('customTrigger（button 动作帧）：参数回显错位 → 抛 EchoParamMismatchError', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    const err = await protocol.customTrigger(makeAddress(0, 4, []), [1]).catch((e: unknown) => e);
    expectEchoMismatch(err);
  });

  it('getKeycode（0x04）：参数回显错位 → 抛 EchoParamMismatchError', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    // layer/row/col 取非零值：参数区右移一位后逐字节不再相同
    const err = await protocol.getKeycode(1, 2, 3).catch((e: unknown) => e);
    expectEchoMismatch(err);
  });

  it('setKeycode（0x05）：参数回显错位 → 抛 EchoParamMismatchError', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    const err = await protocol.setKeycode(0, 0, 0, 0x0004).catch((e: unknown) => e);
    expectEchoMismatch(err);
  });

  it('getKeyboardValue（0x02）：参数回显错位 → 抛 EchoParamMismatchError', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    const err = await protocol.getKeyboardValue(0x02).catch((e: unknown) => e);
    expectEchoMismatch(err);
  });

  it('setKeyboardValue（0x03）：参数回显错位 → 抛 EchoParamMismatchError', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    const err = await protocol.setKeyboardValue(0x02, 0x1ff).catch((e: unknown) => e);
    expectEchoMismatch(err);
  });

  it('getKeycodesVersion（0x02/valueId=0x06）：参数回显错位 → 抛 EchoParamMismatchError', async () => {
    const { protocol } = await setup({ echoOffset: 1, protocolVersion: 13 });
    const err = await protocol.getKeycodesVersion().catch((e: unknown) => e);
    expectEchoMismatch(err);
  });

  it('getKeymapBuffer（0x12）：参数回显错位 → 抛 EchoParamMismatchError', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    const err = await protocol.getKeymapBuffer(0, 8).catch((e: unknown) => e);
    expectEchoMismatch(err);
  });

  it('setKeymapBuffer（0x13）：参数回显错位 → 抛 EchoParamMismatchError', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    const err = await protocol
      .setKeymapBuffer(0, new Uint8Array([0, 4, 0, 5]))
      .catch((e: unknown) => e);
    expectEchoMismatch(err);
  });

  it('echoOffset=2 / 3 同样被抓到', async () => {
    for (const offset of [2, 3]) {
      const { protocol } = await setup({ echoOffset: offset });
      const err = await protocol.customGetValue(makeAddress(0, 1, []), 2).catch((e: unknown) => e);
      expectEchoMismatch(err);
    }
  });

  it('带索引地址（二维索引 [n][k]）错位同样被抓到', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    const addr = makeAddress(10, 0, [2, 3]);
    const err = await protocol.customGetValue(addr, 1).catch((e: unknown) => e);
    expectEchoMismatch(err);
  });
});

describe('QA-2 第二道防线：V3 帧多带一个 channel 字节（方言替身）', () => {
  it('customGetValue：命令码被识别但多出一个 channel 字节 → EchoParamMismatchError', async () => {
    const { protocol, frames } = await setupDialect(0x01);
    const err = await protocol.customGetValue(makeAddress(0, 1, []), 2).catch((e: unknown) => e);
    expectEchoMismatch(err);
    expect(lastRxHex(frames).startsWith('FF')).toBe(false);
    // 响应首字节仍是请求命令码 0x08 —— 证明第一道防线无法识别该错位
    expect(lastRxHex(frames).startsWith('08')).toBe(true);
  });

  it('customSetValue：同上被第二道防线抓到', async () => {
    const { protocol } = await setupDialect(0x01);
    const err = await protocol.customSetValue(makeAddress(0, 1, []), 7, 2).catch((e: unknown) => e);
    expectEchoMismatch(err);
  });

  it('额外字节值不同（0x00 以外的 0x7F）也逃不过比对', async () => {
    const { protocol } = await setupDialect(0x7f);
    const err = await protocol.customGetValue(makeAddress(0, 1, []), 2).catch((e: unknown) => e);
    expectEchoMismatch(err);
  });
});

describe('QA-2 第一道防线：unhandledChannels（0xFF 回显）', () => {
  it('命中的 channel → UnhandledCommandError，且不误报为 EchoParamMismatchError', async () => {
    const { protocol } = await setup({ unhandledChannels: [0] });
    const err = await protocol.customGetValue(makeAddress(0, 1, []), 2).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnhandledCommandError);
    expect(err).not.toBeInstanceOf(EchoParamMismatchError);
    expect((err as UnhandledCommandError).code).toBe('E_PROTO_UNHANDLED');
  });

  it('customSetValue / customSave 命中未处理 channel 同样抛 UnhandledCommandError', async () => {
    const { protocol } = await setup({ unhandledChannels: [3] });
    const addr = makeAddress(3, 1, []);
    await expect(protocol.customSetValue(addr, 1, 2)).rejects.toBeInstanceOf(UnhandledCommandError);
    await expect(protocol.customSave(addr)).rejects.toBeInstanceOf(UnhandledCommandError);
  });

  it('未命中的 channel 正常工作（两道防线都不触发）', async () => {
    const { protocol } = await setup({ unhandledChannels: [9] });
    await protocol.customSetValue(makeAddress(0, 1, []), 0x1234, 2);
    await expect(protocol.customGetValue(makeAddress(0, 1, []), 2)).resolves.toBe(0x1234);
  });
});

describe('QA-2 正对照：无错位时一切正常（证明上面的报错确由回显错位引起）', () => {
  it('echoOffset=0 + 无 unhandled channel → 自定义值读写往返一致', async () => {
    const { protocol } = await setup();
    const addr = makeAddress(0, 1, []);
    await protocol.customSetValue(addr, 0x1234, 2);
    await expect(protocol.customGetValue(addr, 2)).resolves.toBe(0x1234);
  });

  it('预置值读取不被误判为回声不一致', async () => {
    const { protocol, transport } = await setup();
    transport.firmware.seedValue(addressKey(makeAddress(0, 1, [])), 0x00ff, 2);
    await expect(protocol.customGetValue(makeAddress(0, 1, []), 2)).resolves.toBe(0x00ff);
  });

  it('写入值与请求值不同字节数的情况下，只要参数区一致就不报错', async () => {
    const { protocol } = await setup();
    // 参数区 = [channel, valueId]；载荷差异不应影响回声校验
    await protocol.customSetValue(makeAddress(1, 2, []), 0x00, 1);
    await protocol.customSetValue(makeAddress(1, 2, []), 0xffff, 2);
    await expect(protocol.customGetValue(makeAddress(1, 2, []), 2)).resolves.toBe(0xffff);
  });
});

describe('QA-2 已知盲区（现状记录，非本次断言目标）', () => {
  it('盲区 A：参数区全为 0 时右移不可辨识——getKeycode(0,0,0) 不报错并返回值', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    // req=[04,00,00,00,...]，右移后参数区仍全 0，回声比对必然通过
    const value = await protocol.getKeycode(0, 0, 0);
    expect(typeof value).toBe('number');
  });

  it('盲区 B：无参数命令（参数区为空）第二道防线恒定通过', async () => {
    // getLayerCount：参数区 [1,1) 为空，错位本身不会被 echoMatches 识别。
    // 但「返回 0 层」已被裁决为必须修复的语义缺陷，见 qa-regression-layercount-zero.test.ts。
    expect(echoMatches([0x11, 0x09], [0x11, 0x04], 1, 1)).toBe(true);
  });

  it('盲区 C：无参数命令 eepromReset / bootloaderJump 错位时不报错（静默成功）', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    await expect(protocol.eepromReset()).resolves.toBeUndefined();
    await expect(protocol.bootloaderJump()).resolves.toBeUndefined();
  });

  it('getProtocolVersion 在整体错位下不会静默返回版本号（解析为 0 → 抛错）', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    await expect(protocol.getProtocolVersion()).rejects.toThrow();
  });
});

describe('QA-2 frame.echoMatches 边界语义（第二道防线的判定核心）', () => {
  const req = [0x08, 0x00, 0x01, 0x02, 0xaa, 0xbb];

  it('参数区逐字节相同 → true', () => {
    expect(echoMatches([0x08, 0x00, 0x01, 0x02, 0xaa, 0xbb], req, 1, 4)).toBe(true);
  });

  it('参数区任意一字节不同 → false', () => {
    expect(echoMatches([0x08, 0x00, 0x09, 0x02, 0xaa, 0xbb], req, 1, 4)).toBe(false);
    expect(echoMatches([0x08, 0x00, 0x01, 0x03, 0xaa, 0xbb], req, 1, 4)).toBe(false);
  });

  it('仅载荷区（下标 ≥ to）不同 → true（载荷不参与比对）', () => {
    expect(echoMatches([0x08, 0x00, 0x01, 0x02, 0x11, 0x22], req, 1, 4)).toBe(true);
  });

  it('仅下标 < from（命令码）不同 → true（命令码由第一道防线负责）', () => {
    expect(echoMatches([0xff, 0x00, 0x01, 0x02, 0xaa, 0xbb], req, 1, 4)).toBe(true);
  });

  it('响应短于参数区 → false（缺失字节视为 -1）', () => {
    expect(echoMatches([0x08, 0x00], req, 1, 4)).toBe(false);
  });

  it('空参数区（from === to）恒为 true —— 无参数命令不参与第二道防线', () => {
    expect(echoMatches([0x11, 0x09], [0x11, 0x04], 1, 1)).toBe(true);
  });
});

describe('QA-2 frame.isUnhandled / echoPrefixMatches', () => {
  it('首字节 0xFF → true；其它值 → false', () => {
    expect(isUnhandled([0xff, 0x01])).toBe(true);
    expect(isUnhandled([0x01, 0xff])).toBe(false);
    expect(isUnhandled([0x00])).toBe(false);
  });

  it('echoPrefixMatches 逐字节比对前 n 字节；响应过短 → false', () => {
    expect(echoPrefixMatches([1, 2, 3, 4], [1, 2, 3, 4], 3)).toBe(true);
    expect(echoPrefixMatches([1, 2, 9, 4], [1, 2, 3, 4], 3)).toBe(false);
    expect(echoPrefixMatches([1, 2], [1, 2, 3], 3)).toBe(false);
  });
});

describe('QA-2 命令码与参数区划分的一致性', () => {
  it('带索引的自定义值命令，参数区长度 = 3 + 索引个数（不含载荷）', () => {
    expect(VIA_CMD.CUSTOM_GET_VALUE).toBe(0x08);
    expect(VIA_CMD.CUSTOM_SET_VALUE).toBe(0x07);
    expect(VIA_CMD.CUSTOM_SAVE).toBe(0x09);
    // 0 索引 → 参数区 [1,3)；2 索引 → 参数区 [1,5)
    expect(3 + makeAddress(0, 1, []).indexes.length).toBe(3);
    expect(3 + makeAddress(10, 0, [2, 3]).indexes.length).toBe(5);
  });
});
