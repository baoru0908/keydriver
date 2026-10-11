// QA 独立验证 · KLE 行压紧（高危点 6）：5 种配列底行恒为 4；整行被过滤时不得留空行或键位重叠。
import { describe, expect, it } from 'vitest';
import { loadRealParsedDefinition } from './fixtures/realDefinition';
import { selectKeys } from '@/definition/DefinitionParser';
import { setOption, totalBits, getOption } from '@/definition/LayoutOptions';
import { UNIT, compactRows, boundingBox } from '@/definition/KleGeometry';
import type { KleKey } from '@/definition/schema';

const def = loadRealParsedDefinition();
const groups = def.layoutLabels;

/** 行内 x 空洞判定阈值（单位 u）：小于它视为浮点噪声，不算洞。 */
const HOLE_TOLERANCE = 0.02;

/** 逐行扫描 x 方向的空洞，返回 [行号, 空洞宽度, 空洞起点]。 */
function intraRowHoles(keys: readonly KleKey[]): [number, number, number][] {
  const out: [number, number, number][] = [];
  const rows = rowsOf(keys);
  for (const [y, list] of rows) {
    const sorted = [...list].sort((a, b) => a.x - b.x);
    let cursor = sorted[0]?.x ?? 0;
    for (const k of sorted) {
      if (k.x - cursor > HOLE_TOLERANCE) out.push([y, k.x - cursor, cursor]);
      cursor = Math.max(cursor, k.x + k.w);
    }
  }
  return out;
}

/** 枚举全部布局选项位段组合（含定义文件中未被任何键引用的取值）。 */
function allOptionValues(): number[] {
  const values: number[] = [0];
  for (let i = 0; i < groups.length; i += 1) {
    const bits = groups[i]?.bitWidth ?? 1;
    const next: number[] = [];
    for (const v of values) {
      for (let opt = 0; opt < 1 << bits; opt += 1) next.push(setOption(groups, v, i, opt));
    }
    values.length = 0;
    values.push(...next);
  }
  return values;
}

function rowsOf(keys: readonly KleKey[]): Map<number, KleKey[]> {
  const rows = new Map<number, KleKey[]>();
  for (const k of keys) {
    const list = rows.get(k.y) ?? [];
    list.push(k);
    rows.set(k.y, list);
  }
  return rows;
}

describe('QA · 布局位段', () => {
  it('5 组的位宽与偏移符合 VIA 官方算法（按选项个数取 ceil(log2)，不含组名）', () => {
    // ⚠️ 旧断言为 [2,1,1,2,3] / 偏移 [0,2,3,4,6] / 合计 9 位：那是按 labels 数组整体长度
    // （含组名）算的。VIA 规范按**选项个数**取 ceil(log2)：组0、组3 各 2 个选项 → 各 1 位。
    expect(groups.map((g) => [g.index, g.label, g.bitWidth, g.bitOffset])).toEqual([
      [0, '退格键', 1, 0],
      [1, '分裂左shift', 1, 1],
      [2, '大回车', 1, 2],
      [3, '右shift', 1, 3],
      [4, '配列选择', 3, 4],
    ]);
    expect(totalBits(groups)).toBe(7);
  });

  it('组形态：string → toggle（开关），string[] → select（下拉）', () => {
    expect(groups.map((g) => g.kind)).toEqual(['select', 'toggle', 'toggle', 'select', 'select']);
    for (const g of groups) {
      // 位宽必须能容纳全部选项，且不能靠 options.length 猜测控件形态
      expect(1 << g.bitWidth).toBeGreaterThanOrEqual(g.options.length);
      expect(g.options.length).toBeGreaterThan(0);
    }
  });

  it('set/get 位段往返且不影响其它组', () => {
    let v = 0;
    v = setOption(groups, v, 4, 3);
    expect(getOption(groups, v, 4)).toBe(3);
    // 组0 为 1 位，合法取值 0 / 1（旧实现给了 2 位才能存下 2，属越界值）
    v = setOption(groups, v, 0, 1);
    expect(getOption(groups, v, 4)).toBe(3);
    expect(getOption(groups, v, 0)).toBe(1);
  });

  it('越界选项值被位掩码裁剪（不污染相邻组）', () => {
    const v = setOption(groups, 0, 4, 0xff);
    expect(getOption(groups, v, 4)).toBe(7);
    expect(getOption(groups, v, 3)).toBe(0);
  });
});

describe('QA · 行压紧：底行 y 恒为 4（高危点 6）', () => {
  it('5 种配列（group4 = 0..4）下，底行 y 均为 4', () => {
    const bottoms: number[] = [];
    for (let option = 0; option <= 4; option += 1) {
      const layoutOptions = setOption(groups, 0, 4, option);
      const keys = selectKeys(def, layoutOptions);
      const maxY = Math.max(...keys.map((k) => k.y));
      bottoms.push(maxY);
      // 底行必须存在且非空
      expect(keys.filter((k) => k.y === maxY).length).toBeGreaterThan(0);
    }
    expect(bottoms).toEqual([4, 4, 4, 4, 4]);
  });

  it('底行按键数随配列变化（评测点：行压紧前后的键位必须来自被选中的那一套）', () => {
    const counts: number[] = [];
    for (let option = 0; option <= 4; option += 1) {
      const keys = selectKeys(def, setOption(groups, 0, 4, option));
      counts.push(keys.filter((k) => k.y === 4).length);
    }
    expect(counts).toEqual([8, 8, 7, 7, 7]);
  });
});

describe('QA · 行压紧：边界条件', () => {
  it('group4 = 5..7（定义文件未定义的配列）：底行整行消失，不得留下空行', () => {
    for (let option = 5; option <= 7; option += 1) {
      const keys = selectKeys(def, setOption(groups, 0, 4, option));
      const ys = [...new Set(keys.map((k) => k.y))].sort((a, b) => a - b);
      // 压紧后必须从 0 连续到最大值，无空洞
      expect(ys).toEqual([0, 1, 2, 3]);
    }
  });

  // 组合数 = 2^7 = 128（位宽总和由 9 位修正为 7 位后，穷举空间同步变小）
  it('全部 128 种位段组合：压紧后 y 始终连续且从 0 开始，且与 rect 一致', () => {
    const combos = allOptionValues();
    expect(combos).toHaveLength(1 << totalBits(groups));
    expect(combos).toHaveLength(128);
    for (const value of combos) {
      const keys = selectKeys(def, value);
      expect(keys.length).toBeGreaterThan(0);
      const ys = [...new Set(keys.map((k) => k.y))].sort((a, b) => a - b);
      expect(ys[0]).toBe(0);
      expect(ys).toEqual(ys.map((_, i) => i));
      for (const k of keys) {
        expect(k.rect.y, `矩形行号必须来自压紧后的 y（value=${value}）`).toBe(k.y * UNIT);
        expect(k.rect.x).toBe(k.x * UNIT);
      }
    }
  });

  it('全部 512 种组合：同一行内不得出现键位重叠', () => {
    for (const value of allOptionValues()) {
      const keys = selectKeys(def, value);
      const rows = rowsOf(keys);
      for (const [y, list] of rows) {
        const sorted = [...list].sort((a, b) => a.x - b.x);
        for (let i = 0; i + 1 < sorted.length; i += 1) {
          const cur = sorted[i];
          const next = sorted[i + 1];
          if (!cur || !next) continue;
          const overlap = cur.x + cur.w - next.x;
          expect(
            overlap,
            `value=${value} 行 ${y}：${cur.matrix.row},${cur.matrix.col} 与 ${next.matrix.row},${next.matrix.col} 重叠 ${overlap}u`,
          ).toBeLessThanOrEqual(1e-9);
        }
      }
    }
  });

  it('压紧是保序压缩：压紧后的 y 序与原始 y 序完全一致（不重排、不合并不同行）', () => {
    for (const value of allOptionValues()) {
      const keys = selectKeys(def, value);
      // compactRows 保持输入顺序，因此可与「按定义顺序筛出的原始键集」逐项对齐
      const activeRaw = def.allKeys.filter(
        (k) => k.group === null || getOption(groups, value, k.group) === k.option,
      );
      expect(activeRaw).toHaveLength(keys.length);

      const rawToCompact = new Map<number, number>();
      for (let i = 0; i < activeRaw.length; i += 1) {
        const rawY = activeRaw[i]?.y;
        const compactY = keys[i]?.y;
        if (rawY === undefined || compactY === undefined) continue;
        const seen = rawToCompact.get(rawY);
        if (seen !== undefined) {
          expect(compactY, `value=${value}：同一原始行的键值必须映射到同一压紧行`).toBe(seen);
        } else {
          rawToCompact.set(rawY, compactY);
        }
      }
      // 映射必须严格保序
      const ordered = [...rawToCompact.entries()].sort((a, b) => a[0] - b[0]);
      expect(ordered.map(([, c]) => c)).toEqual(ordered.map((_, i) => i));
    }
  });

  it('异形键（rect2）的第二矩形在当前定义中不跨行，因此不受行压紧影响', () => {
    let steppedKeys = 0;
    for (const k of def.allKeys) {
      if (!k.rect2) continue;
      steppedKeys += 1;
      expect(k.y2, '当前定义文件的异形键第二矩形均落在同一行').toBe(k.y);
    }
    expect(steppedKeys).toBeGreaterThan(0);
  });
});

describe('QA · 列归一化：切换配列不得在行内留空洞（变体键在 KLE 里是横排的）', () => {
  /**
   * 背景：本定义把同一槽位的多个配列变体**横着排开**写——前一个变体后面加一段间隔游标
   * （行0 +2.25u、行1 +3u、行2 +2u、行3 +1.5u）再摆下一个变体。只过滤未选中的变体时，
   * 那段间隔会变成行中间的洞，并把画布撑宽约 28%（806px → 1036px）。
   */
  it('全部 128 种位段组合：任意一行内都不得出现 x 空洞', () => {
    for (const value of allOptionValues()) {
      const keys = selectKeys(def, value);
      const holes = intraRowHoles(keys);
      expect(
        holes,
        `value=${value} 出现行内空洞 ${holes.map(([y, w, at]) => `行${y}:${w.toFixed(2)}u@${at.toFixed(2)}`).join(' ')}`,
      ).toEqual([]);
    }
  });

  it('同一底行配列下，切换上排变体不再改变画布宽度（此前会撑宽）', () => {
    for (let bottom = 0; bottom <= 4; bottom += 1) {
      const widths = new Set<string>();
      for (const value of allOptionValues()) {
        if (getOption(groups, value, groups.length - 1) !== bottom) continue;
        const box = boundingBox(selectKeys(def, value));
        widths.add((box.width / UNIT).toFixed(2));
      }
      expect([...widths], `底行配列 ${bottom} 的画布宽度应唯一`).toHaveLength(1);
    }
  });

  it('默认配列（位段全 0）几何不回归', () => {
    const keys = selectKeys(def, 0);
    expect(keys).toHaveLength(63);
    const box = boundingBox(keys);
    expect(box.minX / UNIT).toBeCloseTo(2.75, 6);
    expect(box.width / UNIT).toBeCloseTo(14.93, 2);
  });

  it('变体块被间隔游标排开时，生效的那个要贴回槽位（人造用例）', () => {
    const make = (
      x: number,
      w: number,
      option: number,
      group: number | null = 0,
    ): KleKey =>
      ({
        matrix: { row: 0, col: 0 },
        group,
        option: group === null ? null : option,
        x,
        y: 0,
        w,
        h: 1,
        x2: x,
        y2: 0,
        w2: w,
        h2: 1,
        color: '#cccccc',
        decal: false,
        rect: { x: 0, y: 0, w: 0, h: 0 },
        tone: 'alpha',
      }) as KleKey;

    // 槽位在 2.75u、宽 2.25u；选项0 是整体键，选项1 是分裂键（1.25u + 1u，被排在 x=0）
    const all = [
      make(0, 1.25, 1),
      make(1.25, 1, 1),
      make(2.75, 2.25, 0),
      make(5, 1, 0, null), // 后锚：常驻键
    ];
    // 两个选项都必须落在同一个槽位起点 2.75u，且后锚位置不动
    expect(compactRows(all, [0]).map((k) => k.x)).toEqual([2.75, 5]);
    expect(compactRows(all, [1]).map((k) => k.x)).toEqual([2.75, 4, 5]);
  });

  it('整行就是一个变体、无常驻键可参照时，保持自身 x 不动（人造用例）', () => {
    const make = (x: number, w: number): KleKey =>
      ({
        matrix: { row: 0, col: 0 },
        group: 0,
        option: 0,
        x,
        y: 0,
        w,
        h: 1,
        x2: x,
        y2: 0,
        w2: w,
        h2: 1,
        color: '#cccccc',
        decal: false,
        rect: { x: 0, y: 0, w: 0, h: 0 },
        tone: 'alpha',
      }) as KleKey;
    const all = [make(2.75, 1.5), make(4.25, 1.5)];
    expect(compactRows(all, [0]).map((k) => k.x)).toEqual([2.75, 4.25]);
  });

  it('x2 随 x 同步平移（异形键的第二块不得错位）', () => {
    const make = (x: number, group: number | null, option: number): KleKey =>
      ({
        matrix: { row: 0, col: 0 },
        group,
        option: group === null ? null : option,
        x,
        y: 0,
        w: 1,
        h: 1,
        x2: x - 0.25, // 第二块相对主矩形左偏 0.25u
        y2: 0,
        w2: 1.5,
        h2: 1,
        color: '#cccccc',
        decal: false,
        rect: { x: 0, y: 0, w: 0, h: 0 },
        tone: 'alpha',
      }) as KleKey;
    const all = [
      make(0, null, 0),
      make(8, 0, 1), // 被间隔游标排到 8u，应拉回 1u
      make(3, null, 0),
    ];
    const [stepped] = compactRows(all, [1]).filter((k) => k.group === 0);
    expect(stepped?.x).toBeCloseTo(1, 6);
    expect(stepped?.x2).toBeCloseTo(0.75, 6);
  });
});

describe('QA · 行压紧：人造边界（整行被过滤 + 跨行第二矩形）', () => {
  function key(partial: Partial<KleKey> & Pick<KleKey, 'x' | 'y'>): KleKey {
    const w = partial.w ?? 1;
    const h = partial.h ?? 1;
    return {
      matrix: { row: 0, col: 0 },
      group: null,
      option: null,
      w,
      h,
      x2: partial.x2 ?? partial.x ?? 0,
      y2: partial.y2 ?? partial.y,
      w2: partial.w2 ?? w,
      h2: partial.h2 ?? h,
      color: '#cccccc',
      decal: false,
      rect: { x: 0, y: 0, w: 0, h: 0 },
      tone: 'alpha',
      ...partial,
    } as KleKey;
  }

  it('中间整行被全部过滤 → 行号重排为 0/1/2，不留空行', () => {
    const all = [
      key({ x: 0, y: 0.25, group: null }),
      key({ x: 0, y: 1.25, group: 0, option: 0 }),
      key({ x: 0, y: 2.25, group: null }),
    ];
    // 只有 group0 == 1 时中间行消失
    const visible = compactRows(all, [1]);
    expect(visible).toHaveLength(2);
    expect(visible.map((k) => k.y)).toEqual([0, 1]);
    expect(visible[1]?.rect.y).toBe(UNIT);
  });

  it('（语义待确认）第二矩形落在被过滤掉的行上时，y2 不会被压紧而是保留原值', () => {
    const all = [
      key({ x: 0, y: 0.25, group: null, h: 2, y2: 1.25, h2: 1, w2: 1.5 }),
      key({ x: 0, y: 1.25, group: 0, option: 0 }),
    ];
    const visible = compactRows(all, [1]);
    expect(visible).toHaveLength(1);
    const stepped = visible[0];
    expect(stepped?.y).toBe(0);
    // 当前实现：yMap 中查不到 1.25 → 保留原始 1.25（第二矩形落在第 1 行）
    expect(stepped?.y2).toBe(1.25);
    expect(stepped?.rect2?.y).toBe(1.25 * UNIT);
  });
});
