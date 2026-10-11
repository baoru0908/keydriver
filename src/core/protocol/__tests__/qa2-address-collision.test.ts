// QA2 · 「索引个数不同 = 不同地址」这条断言的深入核查。
// 结论前提：content 长度 4（1 个索引）与 5（2 个索引）若索引尾部为 0，编码出的 32 字节帧完全相同，
// 前缀比对在原理上无法区分。因此要验证的是：真实定义文件里是否真的存在这种「同帧不同地址」的碰撞。
import { describe, expect, it } from 'vitest';
import { encodeGet, makeAddress } from '@/core/protocol/CustomValueCodec';
import { loadRealParsedDefinition } from '@/definition/__tests__/fixtures/realDefinition';

/** 把 32 字节帧折叠成可比较的字符串键。 */
function frameKey(frame: Uint8Array): string {
  return Array.from(frame).join(',');
}

describe('QA2 · 索引个数不同的地址在前缀比对下的可区分性', () => {
  it('尾索引为 0 时，1 索引与 2 索引编码出的帧完全相同（原理性限制，非实现缺陷）', () => {
    const one = makeAddress(10, 1, [0]);
    const two = makeAddress(10, 1, [0, 0]);
    expect(frameKey(encodeGet(one))).toBe(frameKey(encodeGet(two)));
  });

  it('首个索引不同时可以区分', () => {
    const one = makeAddress(10, 1, [1]);
    const three = makeAddress(10, 1, [2, 0]);
    expect(frameKey(encodeGet(one))).not.toBe(frameKey(encodeGet(three)));
  });

  it('真实定义文件：不存在「同一帧对应两个不同地址键」的碰撞', () => {
    const controls = loadRealParsedDefinition().controls;
    const byFrame = new Map<string, Set<string>>();
    for (const c of controls) {
      const k = frameKey(encodeGet(c.address));
      const set = byFrame.get(k) ?? new Set<string>();
      set.add(c.address.key);
      byFrame.set(k, set);
    }
    const collisions = [...byFrame.entries()]
      .filter(([, keys]) => keys.size > 1)
      .map(([frame, keys]) => ({ frame, keys: [...keys].sort() }));
    expect(collisions, `同帧碰撞：${JSON.stringify(collisions.slice(0, 5))}`).toEqual([]);
  });

  it('真实定义文件：不存在「1 索引地址 与 2 索引地址 共享同一 channel/valueId 且首索引相同」的组合', () => {
    const controls = loadRealParsedDefinition().controls;
    const groups = new Map<string, number[]>();
    for (const c of controls) {
      const base = `${c.address.channel}:${c.address.valueId}`;
      const list = groups.get(base) ?? [];
      list.push(c.address.indexes.length);
      groups.set(base, list);
    }
    // 同一个 (channel, valueId) 下的控件，索引个数必须一致；混用意味着帧布局歧义
    const mixed = [...groups.entries()]
      .filter(([, lens]) => new Set(lens).size > 1)
      .map(([base, lens]) => ({ base, lens: [...new Set(lens)].sort() }));
    expect(mixed, `索引个数混用：${JSON.stringify(mixed.slice(0, 5))}`).toEqual([]);
  });
});
