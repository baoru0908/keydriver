// QA 独立验证 · 自定义值帧编解码边界（content 3/4/5 + button options 原样透传）。
import { describe, expect, it } from 'vitest';
import { loadRealParsedDefinition } from '@/definition/__tests__/fixtures/realDefinition';
import {
  addressKey,
  decodeValue,
  encodeAction,
  encodeGet,
  encodeSet,
  makeAddress,
  matchesPrefix,
  valueOffset,
} from '@/core/protocol/CustomValueCodec';
import { SimulatedFirmware } from '@/core/hid/SimulatedFirmware';
import { MSG_LEN } from '@/core/hid/HidTransport';
import { VIA_CMD } from '@/core/protocol/constants';
import type { ControlSpec } from '@/definition/schema';

const def = loadRealParsedDefinition();

// ⚠️ 「编解码 → 模拟固件 → 回读」 的闭环只对 0/1 个索引成立；
// 5 元素（二维索引）的固件侧往返已知缺陷，见
// src/core/hid/__tests__/qa-regression-combos-2d-index.test.ts
describe('QA · content 长度 3/4 与固件往返', () => {
  const cases = [
    { name: '3 元素（Combos 之外的普通控件）', indexes: [] as number[], width: 1, value: 0x7f },
    { name: '4 元素（单索引，如按键复用 tap_dance[0]）', indexes: [3] as number[], width: 2, value: 0x0104 },
  ];

  for (const c of cases) {
    it(`${c.name}：encodeSet → 固件 → encodeGet → decodeValue 往返一致`, () => {
      const firmware = new SimulatedFirmware({});
      const addr = makeAddress(10, 1, c.indexes);
      firmware.seedValue(addressKey(addr), 0, c.width);

      const written = firmware.handle(encodeSet(addr, c.value, c.width));
      expect(written[0]).toBe(VIA_CMD.CUSTOM_SET_VALUE);
      expect(decodeValue(written, addr, c.width)).toBe(c.value);

      const read = firmware.handle(encodeGet(addr));
      expect(matchesPrefix(read, addr, VIA_CMD.CUSTOM_GET_VALUE)).toBe(true);
      expect(decodeValue(read, addr, c.width)).toBe(c.value);
    });

    it(`${c.name}：值字节起始偏移 = 3 + 索引个数`, () => {
      const addr = makeAddress(10, 1, c.indexes);
      expect(valueOffset(addr)).toBe(3 + c.indexes.length);
    });
  }

  it('5 元素（二维索引 [n][k]）纯编解码层往返一致：值字节偏移 = 3 + 索引个数', () => {
    const addr = makeAddress(10, 1, [2, 3]);
    expect(addressKey(addr)).toBe('10:1:2.3');
    const frame = encodeSet(addr, 0x5700, 2);
    expect(frame[5]).toBe(0x57);
    expect(frame[6]).toBe(0x00);
    expect(decodeValue(frame, addr, 2)).toBe(0x5700);

    const get = encodeGet(addr);
    expect(get[3]).toBe(2);
    expect(get[4]).toBe(3);
    expect(matchesPrefix(get, addr, VIA_CMD.CUSTOM_GET_VALUE)).toBe(true);
  });

  it('二维索引的地址空间互不相等（编解码层）', () => {
    const a = makeAddress(10, 1, [0, 0]);
    const b = makeAddress(10, 1, [0, 1]);
    const c = makeAddress(10, 1, [1, 0]);
    expect(new Set([addressKey(a), addressKey(b), addressKey(c)]).size).toBe(3);
    expect(decodeValue(encodeSet(a, 0x5700, 2), a, 2)).toBe(0x5700);
    expect(decodeValue(encodeSet(b, 0x1234, 2), b, 2)).toBe(0x1234);
  });

  it('3 字节 color 分量原序（R,G,B 不能被打乱或截断）', () => {
    const firmware = new SimulatedFirmware({});
    const addr = makeAddress(3, 7, []);
    firmware.seedValue(addressKey(addr), 0, 3);
    firmware.handle(encodeSet(addr, 0xff8000, 3));
    const read = firmware.handle(encodeGet(addr));
    expect(decodeValue(read, addr, 3)).toBe(0xff8000);
  });

  it('越界 value 被截断到对应宽度（不污染后续字节）', () => {
    const addr = makeAddress(0, 1, []);
    const frame = encodeSet(addr, 0x1_00ff, 1);
    expect(frame[3]).toBe(0xff);
    expect(frame[4]).toBe(0x00);
    expect(frame).toHaveLength(MSG_LEN);
  });
});

describe('QA · button options 原样透传（高危点 5）', () => {
  it('options=[1] 的动作帧参数字节必须是 01，不得被抹成 00', () => {
    const buttons = def.controls.filter((c) => c.type === 'button');
    const withOne = buttons.find(
      (c) => c.options.kind === 'action' && c.options.args.length === 1 && c.options.args[0] === 1,
    );
    expect(withOne, '目标定义文件中应存在一个 options=[1] 的 button').toBeDefined();
    if (!withOne || withOne.options.kind !== 'action') return;

    const frame = encodeAction(withOne.address, withOne.options.args);
    expect(frame[0]).toBe(VIA_CMD.CUSTOM_SET_VALUE);
    expect(frame[3]).toBe(0x01);
  });

  it('options=[0] 的动作帧为 00；options 缺失时补 00', () => {
    const buttons = def.controls.filter((c) => c.type === 'button');
    const zero = buttons.find(
      (c) => c.options.kind === 'action' && c.options.args.join(',') === '0',
    );
    const none = buttons.find(
      (c) => c.options.kind === 'action' && c.options.args.length === 0,
    );
    expect(zero).toBeDefined();
    expect(none).toBeDefined();
    if (zero && zero.options.kind === 'action') {
      expect(encodeAction(zero.address, zero.options.args)[3]).toBe(0x00);
    }
    if (none && none.options.kind === 'action') {
      expect(encodeAction(none.address, none.options.args)[3]).toBe(0x00);
    }
  });

  it('两个同名 valueKey 的 button（同地址）必须产出不同的报文', () => {
    const pair = def.controls.filter((c) => c.valueKey === 'id_save_threshold_data');
    expect(pair).toHaveLength(2);
    const frames = pair.map((c) =>
      encodeAction(c.address, c.options.kind === 'action' ? c.options.args : []),
    );
    expect(frames[0]).not.toEqual(frames[1]);
    expect(frames.some((f) => f[3] === 0x01)).toBe(true);
    expect(frames.some((f) => f[3] === 0x00)).toBe(true);
  });

  // 注：定义文件里第 9 个 button 是 options 字段缺失（不是 JSON null），
  // 归一化后是空数组 []，发帧时补 00。基线文案里的「null」按「空数组」理解。
  it('9 个 button 的 options 分布符合基线：7×[0] / 1×[1] / 1×[]（字段缺失）', () => {
    const buttons = def.controls.filter((c) => c.type === 'button');
    const dist = buttons.map((c) => (c.options.kind === 'action' ? JSON.stringify(c.options.args) : '?'));
    expect(dist.filter((d) => d === '[0]')).toHaveLength(7);
    expect(dist.filter((d) => d === '[1]')).toHaveLength(1);
    expect(dist.filter((d) => d === '[]')).toHaveLength(1);
  });
});

describe('QA · 前缀校验的判定边界', () => {
  it('仅首字节错（0xFF）不算前缀不匹配，交给第一道防线处理', () => {
    const addr = makeAddress(9, 1, [2]);
    const req = encodeGet(addr);
    const resp = Uint8Array.from(req);
    resp[0] = 0xff;
    expect(matchesPrefix(resp, addr, VIA_CMD.CUSTOM_GET_VALUE)).toBe(false);
  });

  it('载荷区不参与前缀比对（只比 cmd/channel/valueId/indexes）', () => {
    const addr = makeAddress(9, 1, [2]);
    const req = encodeGet(addr);
    const resp = Uint8Array.from(req);
    expect(matchesPrefix(resp, addr, VIA_CMD.CUSTOM_GET_VALUE)).toBe(true);

    const payload = encodeSet(addr, 0xbeef, 2);
    // 值字节位于 3 + indexes.length
    expect(payload[4]).toBe(0xbe);
    expect(payload[5]).toBe(0xef);
    expect(matchesPrefix(payload, addr, VIA_CMD.CUSTOM_SET_VALUE)).toBe(true);
  });

  it('（已知限制）前缀比对无法区分「短地址」与「多一个 0 的长地址」', () => {
    const one = makeAddress(10, 1, [0]);
    const two = makeAddress(10, 1, [0, 0]);
    expect(addressKey(one)).not.toBe(addressKey(two));
    // 两者前 4 字节完全相同，因此前缀比对结果为 true —— 只能靠 addressKey 区分这两个地址
    expect(matchesPrefix(encodeGet(two), one, VIA_CMD.CUSTOM_GET_VALUE)).toBe(true);
    expect(matchesPrefix(encodeGet(one), two, VIA_CMD.CUSTOM_GET_VALUE)).toBe(true);
    // 索引非零时可以区分
    const three = makeAddress(10, 1, [1, 0]);
    expect(matchesPrefix(encodeGet(three), one, VIA_CMD.CUSTOM_GET_VALUE)).toBe(false);
  });

  it('防御：控件 ID 对应的字节不得超过 32 字节帧长度', () => {
    for (const c of def.controls as readonly ControlSpec[]) {
      const frame = encodeSet(c.address, 0xffff, c.widthHint);
      expect(frame).toHaveLength(MSG_LEN);
    }
  });
});
