// KLE 几何单测：98 条目、行压紧后底行恒为 y=4、异形键与色档映射（架构 §8.6 / A3 / R6）。
import { describe, expect, it } from 'vitest';
import { compactRows, colorTone, parseKeyName, fitScale } from '@/definition/KleGeometry';
import { computeLayoutGroups, getOption, setOption, toOptionArray } from '@/definition/LayoutOptions';
import { loadRealParsedDefinition } from './fixtures/realDefinition';
import { selectKeys } from '@/definition/DefinitionParser';

const definition = loadRealParsedDefinition();

describe('KleGeometry · 解析', () => {
  it('解析出 98 个键位条目', () => {
    expect(definition.allKeys).toHaveLength(98);
  });

  it('键名解析出矩阵坐标与布局选项条件', () => {
    expect(parseKeyName('0,14')).toEqual({ matrix: { row: 0, col: 14 }, group: null, option: null });
    expect(parseKeyName('0,14\n\n\n0,1')).toEqual({
      matrix: { row: 0, col: 14 },
      group: 0,
      option: 1,
    });
    expect(parseKeyName('4,6\n\n\n4,3')).toEqual({ matrix: { row: 4, col: 6 }, group: 4, option: 3 });
  });

  it('首行 y=0.25、末行 y=8.25（KLE 游标语义）', () => {
    const ys = definition.allKeys.map((k) => k.y);
    expect(Math.min(...ys)).toBe(0.25);
    expect(Math.max(...ys)).toBe(8.25);
  });

  it('异形键：ISO 回车带第二矩形', () => {
    const iso = definition.allKeys.find(
      (k) => k.w === 1.25 && k.h === 2 && k.w2 === 1.5 && k.h2 === 1,
    );
    expect(iso).toBeDefined();
    expect(iso?.rect2).toBeDefined();
    expect(iso?.x2).toBe((iso?.x ?? 0) - 0.25);
  });

  it('色档映射：亮度三档 + 特殊档', () => {
    expect(colorTone('#cccccc')).toBe('accent');
    expect(colorTone('#aaaaaa')).toBe('mod');
    expect(colorTone('#777777')).toBe('alpha');
    expect(colorTone('#333333')).toBe('special');
  });

  it('decal 键被标记（装饰键不参与改键）', () => {
    expect(definition.allKeys.some((k) => k.decal)).toBe(true);
  });
});

describe('KleGeometry · 行压紧（A3）', () => {
  it('5 种配列下底行恒为 y=4', () => {
    for (let option = 0; option < 5; option += 1) {
      const layoutOptions = toOptionArray(definition.layoutLabels, 0);
      layoutOptions[4] = option;
      const keys = selectKeys(definition, encodeOptions(definition.raw.layouts.labels ?? [], layoutOptions));
      const maxY = Math.max(...keys.map((k) => k.y));
      expect(maxY).toBe(4);
      // 主区 4 行 + 底行
      expect([...new Set(keys.map((k) => k.y))].sort()).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it('压紧后每种配列的底行键数正确', () => {
    const counts = [0, 1, 2, 3, 4].map((option) => {
      const keys = selectKeys(
        definition,
        encodeOptions(definition.raw.layouts.labels ?? [], [0, 0, 0, 0, option]),
      );
      return keys.filter((k) => k.y === 4).length;
    });
    // 5 种底行变体的键数（含 decal）来自定义文件本身
    expect(counts).toEqual([8, 8, 7, 7, 7]);
  });

  it('未压紧时底行会掉到下方（证明压紧是必需的）', () => {
    const layoutOptions = toOptionArray(definition.layoutLabels, 0);
    layoutOptions[4] = 4;
    const filtered = definition.allKeys.filter(
      (k) => k.group === null || layoutOptions[k.group] === k.option,
    );
    const maxRawY = Math.max(...filtered.map((k) => k.y));
    expect(maxRawY).toBe(8.25);
  });

  it('compactRows 对空布局组也能安全压紧', () => {
    const keys = compactRows(definition.allKeys, [0, 0, 0, 0, 0]);
    expect(keys.length).toBeGreaterThan(0);
    expect(Math.max(...keys.map((k) => k.y))).toBe(4);
  });

  it('缩放钳制在 [0.5, 1.2]', () => {
    expect(fitScale(1000, 500)).toBe(0.5);
    expect(fitScale(1000, 5000)).toBe(1.2);
    expect(fitScale(1000, 900)).toBeCloseTo(0.9);
  });
});

describe('LayoutOptions · 位段', () => {
  // ⚠️ 位宽按「选项个数」取 ceil(log2)，不含组名（VIA 规范）。
  // 早期实现按 labels 数组整体长度取（含组名），组0/组3 被多算 1 位，合计 9 位 —— 属错误行为，已修正为 7 位。
  it('5 组位段无重叠，合计 7 位', () => {
    const groups = computeLayoutGroups(definition.raw.layouts.labels ?? []);
    expect(groups).toHaveLength(5);
    expect(groups.map((g) => g.bitWidth)).toEqual([1, 1, 1, 1, 3]);
    let cursor = 0;
    for (const g of groups) {
      expect(g.bitOffset).toBe(cursor);
      cursor += g.bitWidth;
    }
    expect(cursor).toBe(7);
  });

  it('n 选组按 ceil(log2(选项个数)) 分配位数（不含组名）', () => {
    // 5 个选项 → 3 位；2 个选项 → 1 位（不是 2 位）
    expect(computeLayoutGroups([['组', 'A', 'B', 'C', 'D', 'E']])[0]?.bitWidth).toBe(3);
    expect(computeLayoutGroups([['组', 'A', 'B']])[0]?.bitWidth).toBe(1);
    expect(computeLayoutGroups(['开关'])[0]?.bitWidth).toBe(1);
  });

  it('组形态决定 kind：string → toggle，string[] → select（UI 据此选 Switch / Select）', () => {
    const groups = computeLayoutGroups(definition.raw.layouts.labels ?? []);
    expect(groups.map((g) => g.kind)).toEqual(['select', 'toggle', 'toggle', 'select', 'select']);
    // 2 个选项的 n 选组必须是下拉，否则两个选项名永远显示不出来
    expect(groups[0]?.options).toHaveLength(2);
    expect(groups[3]?.options).toHaveLength(2);
    // 开关组的取值是 Off / On，恒 1 位
    expect(groups[1]?.options).toEqual(['Off', 'On']);
    expect(groups[4]?.options).toHaveLength(5);
  });

  it('读写位段互不干扰', () => {
    const groups = computeLayoutGroups(definition.raw.layouts.labels ?? []);
    let value = 0;
    value = setOption(groups, value, 4, 3);
    // 组0 只有 2 个选项 → 1 位，合法取值为 0 / 1（旧实现下写 2 才会被保留，属越界值）
    value = setOption(groups, value, 0, 1);
    expect(getOption(groups, value, 4)).toBe(3);
    expect(getOption(groups, value, 0)).toBe(1);
    expect(getOption(groups, value, 1)).toBe(0);
  });
});

/** 把选项数组编码为 layout_options 数值。 */
function encodeOptions(
  labels: readonly (string | string[])[],
  options: readonly number[],
): number {
  const groups = computeLayoutGroups(labels);
  let value = 0;
  groups.forEach((g, i) => {
    value |= (options[i] ?? 0) << g.bitOffset;
  });
  return value >>> 0;
}
