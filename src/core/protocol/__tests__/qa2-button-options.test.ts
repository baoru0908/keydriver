// QA 高危点 3：button 的 options 原样透传（抓包级）+ content 长度 3/4/5 编解码往返一致。
// 抓包级验证：直接断言经由 ViaProtocol 发出的帧字节，两个 UI 上完全同形的 button 只有报文能区分。
import { describe, expect, it } from 'vitest';
import { ViaProtocol, type FrameRecord } from '@/core/protocol/ViaProtocol';
import { DummyTransport } from '@/core/hid/DummyTransport';
import {
  addressKey,
  decodeValue,
  encodeAction,
  encodeGet,
  encodeSave,
  encodeSet,
  makeAddress,
  matchesPrefix,
  valueOffset,
} from '@/core/protocol/CustomValueCodec';
import { inferWidth } from '@/core/protocol/ValueWidth';
import { parseHex } from '@/shared/hex';
import { MSG_LEN } from '@/core/hid/HidTransport';
import { VIA_CMD } from '@/core/protocol/constants';
import { loadRealParsedDefinition } from '@/definition/__tests__/fixtures/realDefinition';
import type { ControlSpec, ValueAddress } from '@/definition/schema';

async function setup() {
  const frames: FrameRecord[] = [];
  const transport = new DummyTransport();
  const devices = await transport.listDevices();
  const device = devices[0];
  if (!device) throw new Error('Dummy 设备列表为空');
  await transport.open(device);
  const protocol = new ViaProtocol(transport, { onFrame: (r) => frames.push(r) });
  return { transport, protocol, frames };
}

/** 取 button 的动作参数（非 button 返回 null）。 */
function actionArgs(control: ControlSpec): readonly number[] | null {
  const o = control.options;
  return o.kind === 'action' ? o.args : null;
}

function buttons(): ControlSpec[] {
  return loadRealParsedDefinition().controls.filter((c) => c.type === 'button');
}

/** 固件回显模型：响应 = 命令回声 + 参数回声 + 返回值（大端 width 字节）。 */
function echoResponse(request: Uint8Array, addr: ValueAddress, value: number, width: number): Uint8Array {
  const off = valueOffset(addr);
  const resp = new Uint8Array(MSG_LEN);
  resp.set(request.subarray(0, off), 0);
  for (let b = 0; b < width; b += 1) {
    resp[off + b] = (value >>> ((width - 1 - b) * 8)) & 0xff;
  }
  return resp;
}

/** 取最后一次 tx 报文的字节数组（抓包）。 */
function lastTxBytes(frames: readonly FrameRecord[]): Uint8Array {
  const tx = frames.filter((f) => f.dir === 'tx');
  const last = tx[tx.length - 1];
  expect(last).toBeDefined();
  return parseHex(last?.hex ?? '');
}

describe('QA-3 定义文件 button 的 options 分布（实测基线）', () => {
  it('共 9 个 button，options 分布为 [0]×7 / [1]×1 / []×1', () => {
    const list = buttons();
    expect(list).toHaveLength(9);
    const hist: Record<string, number> = {};
    for (const b of list) {
      const args = actionArgs(b);
      expect(args).not.toBeNull();
      const k = JSON.stringify(args);
      hist[k] = (hist[k] ?? 0) + 1;
    }
    expect(hist).toEqual({ '[0]': 7, '[1]': 1, '[]': 1 });
  });

  it('options=[1] 的 button 唯一，且与同形 button 共用同一地址', () => {
    const list = buttons();
    const withOne = list.filter((b) => {
      const args = actionArgs(b);
      return args !== null && args.length === 1 && args[0] === 1;
    });
    expect(withOne).toHaveLength(1);

    const target = withOne[0];
    if (!target) throw new Error('未找到 options=[1] 的 button');
    // 存在另一个 label 相同、地址相同、但 args=[0] 的 button —— UI 上完全同形
    const twins = list.filter(
      (b) =>
        b !== target &&
        b.address.key === target.address.key &&
        JSON.stringify(actionArgs(b)) !== JSON.stringify(actionArgs(target)),
    );
    expect(twins.length).toBeGreaterThanOrEqual(1);
    const twin = twins[0];
    if (!twin) throw new Error('未找到同形 button');
    expect(twin.label).toBe(target.label);
    expect(JSON.stringify(actionArgs(twin))).toBe('[0]');
  });
});

describe('QA-3 抓包级：options=[1] 的 button 参数字节必须是 01，不得被抹成 00', () => {
  it('encodeAction 直接编码：参数字节为 01（不是 00）', () => {
    const addr = makeAddress(0, 4, []);
    const frame = encodeAction(addr, [1]);
    expect(frame).toHaveLength(MSG_LEN);
    expect(frame[0]).toBe(VIA_CMD.CUSTOM_SET_VALUE);
    expect(frame[1]).toBe(0x00);
    expect(frame[2]).toBe(0x04);
    expect(frame[3]).toBe(0x01);
    expect(frame[3]).not.toBe(0x00);
  });

  it('经 ViaProtocol 发出的真实帧（抓 TX 报文）：第 3 字节为 01', async () => {
    const { protocol, frames } = await setup();
    const target = buttons().find((b) => {
      const args = actionArgs(b);
      return args !== null && args.length === 1 && args[0] === 1;
    });
    if (!target) throw new Error('未找到 options=[1] 的 button');
    await protocol.customTrigger(target.address, [1]);

    const bytes = lastTxBytes(frames);
    expect(bytes).toHaveLength(MSG_LEN);
    expect(bytes[0]).toBe(0x07);
    expect(bytes[1]).toBe(target.address.channel);
    expect(bytes[2]).toBe(target.address.valueId);
    // 核心断言：参数字节 01 必须原样出现在报文里
    expect(bytes[3]).toBe(0x01);
    expect(bytes[3]).not.toBe(0x00);
  });

  it('同形对照：args=[0] 与 args=[1] 的两个 button，报文仅第 3 字节不同', async () => {
    const first = await setup();
    const target = buttons().find((b) => {
      const args = actionArgs(b);
      return args !== null && args.length === 1 && args[0] === 1;
    });
    if (!target) throw new Error('未找到 options=[1] 的 button');
    await first.protocol.customTrigger(target.address, [1]);
    const frameOne = lastTxBytes(first.frames);

    const second = await setup();
    await second.protocol.customTrigger(target.address, [0]);
    const frameZero = lastTxBytes(second.frames);

    expect(frameOne[3]).toBe(0x01);
    expect(frameZero[3]).toBe(0x00);
    const diff: number[] = [];
    for (let i = 0; i < MSG_LEN; i += 1) if (frameOne[i] !== frameZero[i]) diff.push(i);
    expect(diff).toEqual([3]);
  });

  it('端到端：固件侧收到的值因 args 不同而不同（证明参数未被抹零）', async () => {
    const a = await setup();
    const target = buttons().find((b) => {
      const args = actionArgs(b);
      return args !== null && args.length === 1 && args[0] === 1;
    });
    if (!target) throw new Error('未找到 options=[1] 的 button');
    const key = `${target.address.channel}:${target.address.valueId}:`;
    await a.protocol.customTrigger(target.address, [1]);
    const withArg1 = a.transport.firmware.customValues.get(key);

    const b = await setup();
    await b.protocol.customTrigger(target.address, [0]);
    const withArg0 = b.transport.firmware.customValues.get(key);

    expect(withArg1).toBeDefined();
    expect(withArg0).toBeDefined();
    expect(withArg1).not.toBe(withArg0);
    // 大端 2 字节：01 出现在高字节位
    expect(((withArg1 ?? 0) >>> 8) & 0xff).toBe(0x01);
  });

  it('options=[] 的 button 补一个 00 参数字节，不因空数组而省略', () => {
    const addr = makeAddress(0, 4, []);
    const frame = encodeAction(addr, []);
    expect(frame[3]).toBe(0x00);
    expect(Array.from(frame.subarray(4))).toEqual(new Array(MSG_LEN - 4).fill(0));
  });

  it('多字节 args 按顺序原样透传', () => {
    const addr = makeAddress(0, 4, []);
    const frame = encodeAction(addr, [1, 2, 3]);
    expect(frame[3]).toBe(0x01);
    expect(frame[4]).toBe(0x02);
    expect(frame[5]).toBe(0x03);
  });

  it('args 超出单字节范围时按 & 0xff 截断，且不越界写入 32 字节帧', () => {
    const addr = makeAddress(0, 4, []);
    const frame = encodeAction(addr, [0x1ff, 0x100]);
    expect(frame[3]).toBe(0xff);
    expect(frame[4]).toBe(0x00);
    expect(frame).toHaveLength(MSG_LEN);

    // 超长 args 不得越界：带 2 个索引时参数起点为 5，35 个参数只写入到帧尾
    const wide = makeAddress(0, 4, [1, 2]);
    const many = encodeAction(wide, new Array(40).fill(0xab));
    expect(many).toHaveLength(MSG_LEN);
    expect(many[5]).toBe(0xab);
    expect(many[MSG_LEN - 1]).toBe(0xab);
  });

  it('button 宽度为 1 字节，动作参数透传不受宽度推断影响', () => {
    const target = buttons().find((b) => {
      const args = actionArgs(b);
      return args !== null && args.length === 1 && args[0] === 1;
    });
    if (!target) throw new Error('未找到 options=[1] 的 button');
    expect(inferWidth(target, {})).toBe(1);
    expect(encodeAction(target.address, [1])[3 + target.address.indexes.length]).toBe(0x01);
  });

  it('动作帧可通过回声校验（参数区与请求一致）', () => {
    const addr = makeAddress(0, 4, []);
    const frame = encodeAction(addr, [1]);
    const resp = echoResponse(frame, addr, 0x01, 1);
    expect(matchesPrefix(resp, addr, VIA_CMD.CUSTOM_SET_VALUE)).toBe(true);
    expect(decodeValue(resp, addr, 1)).toBe(0x01);
  });
});

describe('QA-3 content 长度 3/4/5（索引 0/1/2 个）编解码往返一致', () => {
  it('valueOffset = 3 + 索引个数：content 3/4/5 元素分别对应偏移 3/4/5', () => {
    expect(valueOffset(makeAddress(0, 1, []))).toBe(3);
    expect(valueOffset(makeAddress(0, 1, [7]))).toBe(4);
    expect(valueOffset(makeAddress(0, 1, [2, 3]))).toBe(5);
  });

  it('三种索引个数 × 宽度 1/2 的编解码往返一致（回显 buffer 模型）', () => {
    const cases: Array<{ addr: ValueAddress; value: number; width: number }> = [
      { addr: makeAddress(0, 1, []), value: 0x00, width: 1 },
      { addr: makeAddress(0, 1, []), value: 0xff, width: 1 },
      { addr: makeAddress(0, 1, []), value: 0x0100, width: 2 },
      { addr: makeAddress(0, 1, []), value: 0xffff, width: 2 },
      { addr: makeAddress(1, 2, [7]), value: 0x7f, width: 1 },
      { addr: makeAddress(1, 2, [255]), value: 0x03, width: 1 },
      { addr: makeAddress(1, 2, [7]), value: 0x1234, width: 2 },
      { addr: makeAddress(10, 0, [2, 3]), value: 0x05, width: 1 },
      { addr: makeAddress(10, 0, [15, 31]), value: 0x0400, width: 2 },
      { addr: makeAddress(10, 0, [0, 0]), value: 0x0000, width: 2 },
    ];
    for (const { addr, value, width } of cases) {
      const request = encodeSet(addr, value, width);
      const response = echoResponse(request, addr, value, width);
      expect(decodeValue(response, addr, width)).toBe(value);
      expect(matchesPrefix(response, addr, VIA_CMD.CUSTOM_SET_VALUE)).toBe(true);
    }
  });

  it('content 5 元素（二维索引 [n][k]）的帧布局：[cmd, channel, valueId, n, k, ...值]', () => {
    const addr = makeAddress(10, 0, [2, 3]);
    const frame = encodeSet(addr, 0x0100, 2);
    expect(Array.from(frame.subarray(0, 5))).toEqual([0x07, 0x0a, 0x00, 0x02, 0x03]);
    expect(Array.from(frame.subarray(5, 7))).toEqual([0x01, 0x00]);
    expect(frame).toHaveLength(MSG_LEN);
  });

  it('GET / SAVE 帧在三种索引个数下均为 32 字节且前缀正确', () => {
    for (const addr of [makeAddress(0, 1, []), makeAddress(1, 2, [7]), makeAddress(10, 0, [2, 3])]) {
      const get = encodeGet(addr);
      const save = encodeSave(addr);
      expect(get).toHaveLength(MSG_LEN);
      expect(save).toHaveLength(MSG_LEN);
      expect(get[0]).toBe(VIA_CMD.CUSTOM_GET_VALUE);
      expect(save[0]).toBe(VIA_CMD.CUSTOM_SAVE);
      expect(Array.from(get.subarray(1, 3 + addr.indexes.length))).toEqual([
        addr.channel,
        addr.valueId,
        ...addr.indexes,
      ]);
      expect(matchesPrefix(get, addr, VIA_CMD.CUSTOM_GET_VALUE)).toBe(true);
      expect(matchesPrefix(save, addr, VIA_CMD.CUSTOM_SAVE)).toBe(true);
    }
  });

  it('真实定义文件中三类 content 长度均存在（0/1/2 索引 = 61/248/40）', () => {
    const controls = loadRealParsedDefinition().controls;
    const hist: Record<number, number> = {};
    for (const c of controls) {
      const n = 2 + c.address.indexes.length;
      hist[n] = (hist[n] ?? 0) + 1;
    }
    expect(hist).toEqual({ 2: 61, 3: 248, 4: 40 });
  });

  it('真实定义文件中的二维索引控件：端到端读写往返一致', async () => {
    const { protocol, transport } = await setup();
    const two = loadRealParsedDefinition().controls.find((c) => c.address.indexes.length === 2);
    if (!two) throw new Error('定义文件中不存在二维索引控件');
    const addr = two.address;
    // 固件内部键必须与 CustomValueCodec.addressKey 一致（契约，见 qa2-firmware-key-contract.test.ts）
    const fwKey = addressKey(addr);
    transport.firmware.seedValue(fwKey, 0, 1);

    await protocol.customSetValue(addr, 0x7f, 1);
    await expect(protocol.customGetValue(addr, 1)).resolves.toBe(0x7f);
    expect(transport.firmware.customValues.get(fwKey)).toBe(0x7f);
    expect(addressKey(addr)).toBe(addr.key);
  });

  it('一维索引控件：端到端读写往返一致（宽度 2）', async () => {
    const { protocol, transport } = await setup();
    const one = loadRealParsedDefinition().controls.find(
      (c) => c.address.indexes.length === 1,
    );
    if (!one) throw new Error('定义文件中不存在一维索引控件');
    const addr = one.address;
    const fwKey = `${addr.channel}:${addr.valueId}:${addr.indexes.join(':')}`;
    transport.firmware.seedValue(fwKey, 0, 2);

    await protocol.customSetValue(addr, 0x1234, 2);
    await expect(protocol.customGetValue(addr, 2)).resolves.toBe(0x1234);
  });

  it('无索引控件：端到端读写往返一致（宽度 1）', async () => {
    const { protocol, transport } = await setup();
    const zero = loadRealParsedDefinition().controls.find(
      (c) => c.address.indexes.length === 0 && c.type !== 'button',
    );
    if (!zero) throw new Error('定义文件中不存在无索引控件');
    const addr = zero.address;
    const fwKey = `${addr.channel}:${addr.valueId}:`;
    transport.firmware.seedValue(fwKey, 0, 1);

    await protocol.customSetValue(addr, 0x2a, 1);
    await expect(protocol.customGetValue(addr, 1)).resolves.toBe(0x2a);
  });
});
