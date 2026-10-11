// QA 独立验证 · 值宽度推断（高危点 1：宽度只由 max 决定，与 min 完全无关）。
// 用真实定义文件 78 个 range 控件做统计验证，而非只用 5 个人造用例。
import { describe, expect, it } from 'vitest';
import { loadRealParsedDefinition } from '@/definition/__tests__/fixtures/realDefinition';
import { describeWidth, inferWidth } from '@/core/protocol/ValueWidth';
import type { ControlSpec } from '@/definition/schema';

const def = loadRealParsedDefinition();
const ranges = def.controls.filter((c) => c.type === 'range');

function combo(c: ControlSpec): string {
  return c.options.kind === 'range' ? `[${c.options.min},${c.options.max}]` : '(非 range)';
}

describe('QA · range 宽度与 min 解耦（目标定义文件 78 个实例）', () => {
  it('range 组合分布与实测基线一致', () => {
    const counts = new Map<string, number>();
    for (const c of ranges) counts.set(combo(c), (counts.get(combo(c)) ?? 0) + 1);
    expect(Object.fromEntries(counts)).toEqual({
      '[0,255]': 21,
      '[1,255]': 22,
      '[0,1000]': 22,
      '[1,1000]': 10,
      '[1,1023]': 3,
    });
  });

  it('【高危 1】min 相同的两组必须给出不同宽度：[1,255] → 1 字节，[1,1023] → 2 字节', () => {
    const narrow = ranges.filter((c) => combo(c) === '[1,255]');
    const wide = ranges.filter((c) => combo(c) === '[1,1023]');
    expect(narrow).toHaveLength(22);
    expect(wide).toHaveLength(3);
    for (const c of narrow) expect(c.widthHint).toBe(1);
    for (const c of wide) expect(c.widthHint).toBe(2);
  });

  it('【高危 1】min 不同的两组必须给出相同宽度：[0,1000] 与 [1,1000] 均 2 字节', () => {
    const a = ranges.filter((c) => combo(c) === '[0,1000]');
    const b = ranges.filter((c) => combo(c) === '[1,1000]');
    expect(a).toHaveLength(22);
    expect(b).toHaveLength(10);
    for (const c of [...a, ...b]) expect(c.widthHint).toBe(2);
  });

  it('【高危 1】量化两个 35 的数值巧合：min=1 集合与 2 字节集合交集仅 13 个', () => {
    const min1 = ranges.filter((c) => c.options.kind === 'range' && c.options.min === 1);
    const width2 = ranges.filter((c) => c.widthHint === 2);
    expect(min1).toHaveLength(35);
    expect(width2).toHaveLength(35);
    const intersection = min1.filter((c) => c.widthHint === 2);
    expect(intersection).toHaveLength(13);
    // 若误把「min=1」当作「需 2 字节」，误判面为 44/78
    const misjudged = ranges.filter((c) => {
      if (c.options.kind !== 'range') return false;
      const byMin = c.options.min === 1 ? 2 : 1;
      return byMin !== c.widthHint;
    });
    expect(misjudged).toHaveLength(44);
  });

  it('推断规则本身：宽度由 max>255 决定，与 min 无关（人造边界：254/255/256）', () => {
    const base: ControlSpec = {
      id: 'm0/x#0',
      valueKey: 'k',
      label: 'x',
      type: 'range',
      options: { kind: 'range', min: 0, max: 255 },
      address: { channel: 0, valueId: 1, indexes: [], key: '0:1:' },
      menuId: 'm0',
      path: ['x'],
      widthHint: 1,
    };
    const mk = (min: number, max: number): ControlSpec => ({
      ...base,
      options: { kind: 'range', min, max },
    });
    expect(inferWidth(mk(0, 255), {})).toBe(1);
    expect(inferWidth(mk(1, 255), {})).toBe(1);
    expect(inferWidth(mk(0, 254), {})).toBe(1);
    expect(inferWidth(mk(1, 256), {})).toBe(2);
    expect(inferWidth(mk(0, 256), {})).toBe(2);
    expect(inferWidth(mk(255, 255), {})).toBe(1);
    expect(inferWidth(mk(0, 0xffff), {})).toBe(2);
  });

  it('dropdown：按选项值上限判定；目标定义文件中不存在 > 255 的选项', () => {
    const dropdowns = def.controls.filter((c) => c.type === 'dropdown');
    expect(dropdowns).toHaveLength(33);
    for (const c of dropdowns) {
      expect(c.widthHint, `${c.id} 的 widthHint 与选项上限不符`).toBe(1);
    }
    const wide = dropdowns[0];
    if (wide && wide.options.kind === 'enum') {
      expect(inferWidth(wide, {})).toBe(1);
    }
  });
});

describe('QA · 覆盖表（override）', () => {
  const toggle = {
    id: 'm0/x#0',
    valueKey: 'id_probe',
    label: 'x',
    type: 'toggle' as const,
    options: { kind: 'none' } as const,
    address: { channel: 7, valueId: 12, indexes: [], key: '7:12:' },
    menuId: 'm0',
    path: ['x'],
    widthHint: 1,
  } satisfies ControlSpec;

  it('手工覆盖优先于推断规则（地址键 > valueKey > 推断）', () => {
    expect(inferWidth(toggle, { '7:12:': 2 })).toBe(2);
    expect(inferWidth(toggle, { id_probe: 3 })).toBe(3);
    expect(inferWidth(toggle, { '7:12:': 2, id_probe: 3 })).toBe(2);
    expect(inferWidth(toggle, {})).toBe(1);
  });

  it('describeWidth 标注来源与字节数', () => {
    expect(describeWidth(toggle, { '7:12:': 2 })).toBe('2 字节 · 手动覆盖（地址）');
    expect(describeWidth(toggle, { id_probe: 2 })).toBe('2 字节 · 手动覆盖（变量名）');
    expect(describeWidth(toggle, {})).toBe('1 字节 · 自动推断');
  });

  it('覆盖表能修正被误判的 range（例如把 [1,255] 强制改为 2 字节）', () => {
    const target = ranges.find((c) => combo(c) === '[1,255]');
    expect(target).toBeDefined();
    if (!target) return;
    expect(inferWidth(target, {})).toBe(1);
    expect(inferWidth(target, { [target.address.key]: 2 })).toBe(2);
  });
});
