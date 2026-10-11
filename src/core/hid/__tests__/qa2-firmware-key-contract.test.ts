// QA2 · 地址键格式契约（team-lead 要求）：SimulatedFirmware 的内部键必须恒等于 CustomValueCodec.addressKey。
//
// 为什么需要这个文件：
// Bug A 修复后，一批「当初为了迁就内部实现而用冒号键播种」的夹具会变红——说明它们耦合了实现而非契约。
// 更危险的是反向情况：修复后两侧变成同一种拼法，原本能暴露不一致的用例可能失去分辨力（假绿）。
// 因此这里从**正反两个方向**直接锁契约：
//   ① 正向：用 canonical 键播种 → 固件必须认得；写入后 customValues 里必须有 canonical 键
//   ② 反向：用旧冒号键播种 → 固件必须**不认得**；customValues 里不得出现旧格式键
// 任一侧被改回不一致，本文件立刻变红。
import { describe, expect, it } from 'vitest';
import { SimulatedFirmware } from '@/core/hid/SimulatedFirmware';
import { MSG_LEN } from '@/core/hid/HidTransport';
import {
  addressKey,
  decodeValue,
  encodeGet,
  encodeSet,
  makeAddress,
} from '@/core/protocol/CustomValueCodec';
import type { ValueAddress } from '@/definition/schema';

/** 旧实现（修复前）的键拼法：`join(':')`，且 0 索引时无尾冒号。 */
function legacyKey(addr: ValueAddress): string {
  return [addr.channel, addr.valueId, ...addr.indexes].join(':');
}

/** 所有与 canonical 不同的候选键（用于反向断言「不得出现」）。 */
function divergentKeys(addr: ValueAddress): string[] {
  const canonical = addressKey(addr);
  return [...new Set([legacyKey(addr)])].filter((k) => k !== canonical);
}

const CASES: ReadonlyArray<{ name: string; addr: ValueAddress }> = [
  { name: '0 索引（content 3 元素）', addr: makeAddress(0, 1, []) },
  { name: '1 索引（content 4 元素）', addr: makeAddress(10, 0, [7]) },
  { name: '2 索引（content 5 元素，二维 [n][k]）', addr: makeAddress(10, 0, [2, 3]) },
  { name: '3 索引（防御性：超出当前定义文件用法）', addr: makeAddress(10, 0, [1, 2, 3]) },
];

describe('QA2 · canonical 地址键的字面量契约', () => {
  it('indexes.join(".") 且 0 索引保留尾冒号', () => {
    expect(addressKey(makeAddress(0, 1, []))).toBe('0:1:');
    expect(addressKey(makeAddress(10, 0, [7]))).toBe('10:0:7');
    expect(addressKey(makeAddress(10, 0, [2, 3]))).toBe('10:0:2.3');
    expect(addressKey(makeAddress(10, 0, [1, 2, 3]))).toBe('10:0:1.2.3');
  });

  it('0 索引与 ≥2 索引时，旧冒号拼法必须与 canonical 不同（否则本文件的反向断言无意义）', () => {
    expect(divergentKeys(makeAddress(0, 1, [])).length).toBeGreaterThan(0);
    expect(divergentKeys(makeAddress(10, 0, [2, 3])).length).toBeGreaterThan(0);
    expect(divergentKeys(makeAddress(10, 0, [1, 2, 3])).length).toBeGreaterThan(0);
  });
});

describe('QA2 · 正向：SimulatedFirmware 必须认 canonical 键', () => {
  for (const { name, addr } of CASES) {
    it(`${name}：按 canonical 键预置后，GET 必须读回该值`, () => {
      const firmware = new SimulatedFirmware({});
      firmware.seedValue(addressKey(addr), 0x1234, 2);
      const read = firmware.handle(encodeGet(addr));
      expect(decodeValue(read, addr, 2)).toBe(0x1234);
    });

    it(`${name}：写入后 customValues 中必须存在 canonical 键`, () => {
      const firmware = new SimulatedFirmware({});
      // 模拟器按「已预置的已知 key 表」反推索引个数，未预置会退化为无索引（设计如此），故先预置
      firmware.seedValue(addressKey(addr), 0, 2);
      firmware.handle(encodeSet(addr, 0x00ab, 2));
      expect(firmware.customValues.has(addressKey(addr))).toBe(true);
      expect([...firmware.customValues.keys()]).toContain(addressKey(addr));
    });
  }
});

describe('QA2 · 反向：SimulatedFirmware 不得认旧冒号键（防止修复被回退）', () => {
  for (const { name, addr } of CASES) {
    const others = divergentKeys(addr);
    if (others.length === 0) continue; // 1 索引时两种拼法恰好相同，无分辨力，跳过
    it(`${name}：用旧键 ${others.join(' / ')} 播种，固件必须读不到该值`, () => {
      const firmware = new SimulatedFirmware({});
      for (const k of others) firmware.seedValue(k, 0x1234, 2);
      const read = firmware.handle(encodeGet(addr));
      expect(decodeValue(read, addr, 2)).toBe(0);
    });
  }

  it('2 索引写入后，customValues 中不得出现任何旧格式键', () => {
    const firmware = new SimulatedFirmware({});
    const addr = makeAddress(10, 0, [2, 3]);
    firmware.seedValue(addressKey(addr), 0, 2);
    firmware.handle(encodeSet(addr, 0x00ab, 2));
    for (const k of divergentKeys(addr)) {
      expect(firmware.customValues.has(k), `不应出现旧格式键 ${k}`).toBe(false);
    }
    expect([...firmware.customValues.keys()]).toEqual([addressKey(addr)]);
  });

  it('2 索引写入不得退化到 0 索引地址（不得产生 ${channel}:${valueId}: 兜底键）', () => {
    const firmware = new SimulatedFirmware({});
    const addr = makeAddress(10, 0, [2, 3]);
    firmware.seedValue(addressKey(addr), 0, 2);
    firmware.handle(encodeSet(addr, 0x00ab, 2));
    expect(firmware.customValues.has('10:0:')).toBe(false);
    expect(firmware.customWidths.has('10:0:')).toBe(false);
    // 值字节起点必须是 3 + 索引个数，而不是兜底的 3
    const response = firmware.handle(encodeGet(addr));
    expect(response).toHaveLength(MSG_LEN);
    expect(decodeValue(response, addr, 2)).toBe(0x00ab);
  });
});

describe('QA2 · 相邻二维索引不得互相污染（契约层复核）', () => {
  it('[n][k] 与 [n][k+1] 是两个独立键值', () => {
    const firmware = new SimulatedFirmware({});
    const a = makeAddress(10, 0, [2, 0]);
    const b = makeAddress(10, 0, [2, 1]);
    firmware.seedValue(addressKey(a), 0, 2);
    firmware.seedValue(addressKey(b), 0, 2);

    firmware.handle(encodeSet(a, 0x5700, 2));
    firmware.handle(encodeSet(b, 0x1234, 2));

    expect(firmware.customValues.get(addressKey(a))).toBe(0x5700);
    expect(firmware.customValues.get(addressKey(b))).toBe(0x1234);
    expect(decodeValue(firmware.handle(encodeGet(a)), a, 2)).toBe(0x5700);
    expect(decodeValue(firmware.handle(encodeGet(b)), b, 2)).toBe(0x1234);
  });
});
