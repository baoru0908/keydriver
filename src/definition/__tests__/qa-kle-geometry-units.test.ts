// QA 独立验证 · KLE 几何与位段的纯函数边界（parseKeyName / colorTone / 游标语义 / 包围盒）。
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEY_COLOR,
  GAP,
  UNIT,
  boundingBox,
  colorTone,
  computeKeys,
  fitScale,
  parseKeyName,
  rectOf,
} from '@/definition/KleGeometry';
import { bitWidthFor } from '@/definition/LayoutOptions';
import { loadRealParsedDefinition } from './fixtures/realDefinition';
import { selectKeys } from '@/definition/DefinitionParser';

const def = loadRealParsedDefinition();

describe('QA · parseKeyName（键名 → 矩阵坐标 + 布局选项）', () => {
  it('纯坐标键名：group/option 均为 null（无条件生效）', () => {
    expect(parseKeyName('0,14')).toEqual({ matrix: { row: 0, col: 14 }, group: null, option: null });
    expect(parseKeyName('12,3')).toEqual({ matrix: { row: 12, col: 3 }, group: null, option: null });
  });

  it('四段键名：第 4 段为 group,option', () => {
    expect(parseKeyName('0,14\n\n\n0,1')).toEqual({
      matrix: { row: 0, col: 14 },
      group: 0,
      option: 1,
    });
    expect(parseKeyName('4,6\n\n\n4,0')).toEqual({
      matrix: { row: 4, col: 6 },
      group: 4,
      option: 0,
    });
  });

  it('（已知限制）图例内部含空格时不会被识别为布局选项，退化成无条件键', () => {
    // 正则写作 /^\d+,\d+$/ 且只 trim 两端 → " 4 , 1 " trim 后为 "4 , 1"，仍含内空格 → 不匹配
    // 后果：该类键在**所有**配列下同时出现（本定义文件中不存在这种写法，故当前不受影响）
    expect(parseKeyName('0,14\n\n\n 4 , 1 ').group).toBeNull();
    // 但两端空格是被容忍的
    expect(parseKeyName('0,14\n\n\n 4,1 ').group).toBe(4);
    expect(parseKeyName('0,14\n\n\n 4,1 ').option).toBe(1);
  });

  it('退化路径：坐标非法 / 图例非数字 → 不抛异常', () => {
    expect(parseKeyName('').matrix).toEqual({ row: 0, col: 0 });
    expect(parseKeyName('abc,def').matrix).toEqual({ row: 0, col: 0 });
    expect(parseKeyName('1,2\n\n\nA,B').group).toBeNull();
    expect(parseKeyName('1,2\n\n\n4').group).toBeNull();
    expect(parseKeyName('1,2\n\n\n4,').group).toBeNull();
  });
});

describe('QA · colorTone（键帽色 → 三档主题色）', () => {
  it('亮度阈值边界：>0xBB accent / >0x88 mod / >0x55 alpha / 其余 special', () => {
    expect(colorTone('#ffffff')).toBe('accent');
    expect(colorTone('#cccccc')).toBe('accent'); // 0.299*204+0.587*204+0.114*204 = 204 > 187
    expect(colorTone('#aaaaaa')).toBe('mod'); // 170
    expect(colorTone('#777777')).toBe('alpha'); // 119
    expect(colorTone('#000000')).toBe('special');
  });

  it('缺省色与非法色都退化为默认色（不得产生 undefined 主题）', () => {
    expect(colorTone('')).toBe(colorTone(DEFAULT_KEY_COLOR));
    expect(colorTone('#12345')).toBe(colorTone(DEFAULT_KEY_COLOR));
    expect(colorTone('rgb(1,2,3)')).toBe(colorTone(DEFAULT_KEY_COLOR));
    expect(colorTone('#GGG')).toBe(colorTone(DEFAULT_KEY_COLOR));
  });

  it('真实定义文件的全部键位都落在四档之一', () => {
    const tones = new Set(def.allKeys.map((k) => k.tone));
    for (const t of tones) expect(['accent', 'mod', 'alpha', 'special']).toContain(t);
  });
});

describe('QA · computeKeys 游标语义（x/y 累加，新行 y+1、x 归零）', () => {
  it('首行 y 从 0 起（内部初值 -1），行内 x 随键宽累加', () => {
    const keys = computeKeys([['0,0', '0,1', '0,2']]);
    expect(keys.map((k) => [k.x, k.y])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
  });

  it('props 的 x/y 是累加偏移（不是绝对坐标）', () => {
    const keys = computeKeys([[{ x: 0.5 }, '0,0', { y: 0.25 }, '1,0']]);
    expect(keys[0]?.x).toBeCloseTo(0.5);
    expect(keys[0]?.y).toBe(0);
    expect(keys[1]?.y).toBeCloseTo(0.25);
  });

  it('新行：y +1、x 归零；props 的 y 在同一行内继续累加', () => {
    const keys = computeKeys([['0,0'], ['1,0']]);
    expect(keys.map((k) => k.y)).toEqual([0, 1]);
    expect(keys[1]?.x).toBe(0);
  });

  it('键宽/键高在出键后复位为 1（不污染后续键）', () => {
    const keys = computeKeys([[{ w: 2 }, '0,0', '0,1']]);
    expect(keys[0]?.w).toBe(2);
    expect(keys[1]?.w).toBe(1);
    expect(keys[1]?.x).toBe(2);
  });

  it('decal 标记与颜色沿用最近一次 props（跨键继承）', () => {
    const keys = computeKeys([[{ c: '#ff0000', d: true }, '0,0', '0,1']]);
    expect(keys[0]?.decal).toBe(true);
    expect(keys[1]?.decal).toBe(true);
    expect(keys[1]?.color).toBe('#ff0000');
  });

  it('异形键的第二矩形：缺省等于主矩形，显式时生成 rect2', () => {
    const plain = computeKeys([[{ w: 2 }, '0,0']]);
    expect(plain[0]?.rect2).toBeUndefined();
    const stepped = computeKeys([[{ w: 1.25, h: 2, w2: 1.5, h2: 1, x2: -0.25 }, '0,0']]);
    expect(stepped[0]?.w2).toBe(1.5);
    expect(stepped[0]?.h2).toBe(1);
    expect(stepped[0]?.rect2).toBeDefined();
    expect(stepped[0]?.rect2?.w).toBeCloseTo(1.5 * UNIT - GAP);
  });

  it('空行与只有 props 的行不产生键位', () => {
    expect(computeKeys([[{ x: 1 }]])).toHaveLength(0);
    expect(computeKeys([])).toHaveLength(0);
  });
});

describe('QA · 像素几何：rectOf / boundingBox / fitScale', () => {
  it('rectOf 按 UNIT 缩放并扣掉 GAP', () => {
    expect(rectOf(0, 0, 1, 1)).toEqual({ x: 0, y: 0, w: UNIT - GAP, h: UNIT - GAP });
    expect(rectOf(1, 2, 2, 1)).toEqual({ x: UNIT, y: 2 * UNIT, w: 2 * UNIT - GAP, h: UNIT - GAP });
  });

  it('boundingBox 覆盖全部键（含第二矩形）', () => {
    const keys = computeKeys([[{ w: 2 }, '0,0'], ['1,0']]);
    const box = boundingBox(keys);
    expect(box.width).toBeGreaterThan(UNIT);
    expect(box.height).toBeGreaterThan(UNIT);
  });

  it('空键集：包围盒为 0，fitScale 退化为 1（不得出现 NaN / Infinity）', () => {
    // boundingBox 现在同时返回原点 minX/minY（渲染时需要平移），故空集也带原点 0
    expect(boundingBox([])).toEqual({ minX: 0, minY: 0, width: 0, height: 0 });
    expect(fitScale(0, 1000)).toBe(1);
    expect(fitScale(100, 0)).toBe(1);
  });

  it('fitScale 钳制在 [0.5, 1.2]', () => {
    expect(fitScale(100, 1000)).toBe(1.2);
    expect(fitScale(1000, 100)).toBe(0.5);
    expect(fitScale(1000, 800)).toBeCloseTo(0.8);
  });
});

describe('QA · 布局位宽算法 bitWidthFor', () => {
  it('2 选开关 → 1 位；n 选按选项个数取 ceil(log2)（不含组名）', () => {
    expect(bitWidthFor(1)).toBe(1);
    expect(bitWidthFor(2)).toBe(1);
    expect(bitWidthFor(3)).toBe(2);
    expect(bitWidthFor(4)).toBe(2);
    expect(bitWidthFor(5)).toBe(3);
    expect(bitWidthFor(6)).toBe(3);
    expect(bitWidthFor(9)).toBe(4);
  });

  it('真实定义文件：5 组总位宽 7 位，未超出 32 位 field', () => {
    // ⚠️ 旧断言为 9 位：那是按 labels 数组整体长度（含组名）算的结果，与 VIA 规范不符
    // （规范按选项个数取 ceil(log2)）。组0/组3 各 2 个选项 → 各 1 位，故合计 7 位。
    const total = def.layoutLabels.reduce((sum, g) => sum + g.bitWidth, 0);
    expect(total).toBe(7);
    expect(total).toBeLessThanOrEqual(32);
  });
});

describe('QA · definition.keys 与 selectKeys 的一致性', () => {
  it('definition.keys 等价于 layout_options=0 时的 selectKeys 结果', () => {
    expect(selectKeys(def, 0)).toEqual(def.keys);
  });

  it('layout_options 变化只影响带 group 的键，null-group 键恒定存在', () => {
    const base = selectKeys(def, 0);
    const other = selectKeys(def, 0b0001_0000_00); // group4 = 4
    const nullKeys = def.allKeys.filter((k) => k.group === null);
    expect(base.filter((k) => k.group === null)).toHaveLength(nullKeys.length);
    expect(other.filter((k) => k.group === null)).toHaveLength(nullKeys.length);
  });
});
