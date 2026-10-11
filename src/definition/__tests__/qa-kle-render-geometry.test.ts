// QA 独立验证 · 渲染几何三处修复：decal 作用域 / 副矩形判据 / 包围盒原点。
//
// 背景（用户实测缺陷）：
//   1) 底行整行变成无文字、无底色的空白宽格 → decal 被当成粘性属性，污染整行；
//   2) 几乎每个键都多渲染一个与主矩形重合的 rect2 → 副矩形判据用了绝对坐标跟 0 比较；
//   3) 键位图整体偏宽、右侧被截断、出现横向滚动条 → 包围盒没有扣掉左侧死区（minX）。
import { describe, expect, it } from 'vitest';
import { UNIT, boundingBox, computeKeys, fitScale } from '@/definition/KleGeometry';
import { loadRealParsedDefinition } from './fixtures/realDefinition';
import { selectKeys } from '@/definition/DefinitionParser';
import type { KleKey } from '@/definition/schema';

const def = loadRealParsedDefinition();

/** 键位的可读标识：矩阵 (row,col)。 */
function positionOf(key: KleKey): string {
  return `${key.matrix.row},${key.matrix.col}`;
}

describe('QA · decal 是 props 块作用域，不是粘性属性', () => {
  it('同一 props 块内的多个键都生效，出现下一个 props 块即复位', () => {
    const keys = computeKeys([[{ d: true }, '0,0', '0,1', { w: 2 }, '0,2']]);
    expect(keys.map((k) => k.decal)).toEqual([true, true, false]);
  });

  it('decal 不跨行继承', () => {
    const keys = computeKeys([[{ d: true }, '0,0'], ['1,0']]);
    expect(keys[0]?.decal).toBe(true);
    expect(keys[1]?.decal).toBe(false);
  });

  it('颜色 c 仍是粘性属性（跨键、跨 props 块继承），不得被一起改掉', () => {
    const keys = computeKeys([
      [{ c: '#ff0000' }, '0,0', { w: 2 }, '0,1', { c: '#00ff00' }, '0,2'],
    ]);
    expect(keys.map((k) => k.color)).toEqual(['#ff0000', '#ff0000', '#00ff00']);
  });

  it('真实定义：装饰键收敛为 9 个（修复前为 37 个），且只出现在底行的配列变体里', () => {
    expect(def.allKeys).toHaveLength(98);
    const decals = def.allKeys.filter((k) => k.decal);
    expect(decals).toHaveLength(9);
    expect(decals.every((k) => k.matrix.row === 4 && k.group === 4)).toBe(true);
  });

  it('默认配列底行：只有 4,0 / 4,1 / 4,12 / 4,14 是装饰块，6u 空格与其余修饰键是真实键', () => {
    const bottom = selectKeys(def, 0)
      .filter((k) => k.y === 4)
      .sort((a, b) => a.x - b.x);
    expect(bottom.map(positionOf)).toEqual([
      '4,0',
      '4,1',
      '4,2',
      '4,6',
      '4,10',
      '4,11',
      '4,12',
      '4,14',
    ]);
    expect(bottom.filter((k) => k.decal).map(positionOf)).toEqual([
      '4,0',
      '4,1',
      '4,12',
      '4,14',
    ]);
    const space = bottom.find((k) => k.matrix.col === 6);
    expect(space?.w).toBe(6);
    expect(space?.decal).toBe(false);
  });
});

describe('QA · 副矩形判据：只有真声明了不同的 x2/y2/w2/h2 才算异形键', () => {
  it('不在原点的普通键不得被误判为异形键（修复前 x2/y2 是绝对坐标，与 0 比较恒为真）', () => {
    const keys = computeKeys([[{ x: 2.75, w: 1.5 }, '0,0']]);
    expect(keys[0]?.x).toBeCloseTo(2.75);
    expect(keys[0]?.rect2).toBeUndefined();
  });

  it('真实定义：98 个键里只有 1 个异形键（大回车）带 rect2（修复前为 97 个）', () => {
    const stepped = def.allKeys.filter((k) => k.rect2);
    expect(stepped).toHaveLength(1);
    expect(stepped[0]?.h).toBe(2);
    expect(stepped[0]?.w2).toBe(1.5);
    expect(stepped[0]?.h2).toBe(1);
  });
});

describe('QA · 包围盒带原点：画布宽度不含左侧死区', () => {
  it('默认配列：minX = 2.75u，宽度取可见键帽的实际跨度 806px（修复前为 954.5px）', () => {
    const keys = selectKeys(def, 0);
    const box = boundingBox(keys);
    expect(box.minX).toBeCloseTo(2.75 * UNIT);
    expect(box.minY).toBe(0);
    expect(box.width).toBeCloseTo(806);
    expect(box.height).toBeCloseTo(266);
  });

  it('平移到原点后：左边界贴 0，右边界正好等于 width', () => {
    const keys = selectKeys(def, 0);
    const box = boundingBox(keys);
    let maxRight = 0;
    for (const key of keys) {
      const left = key.rect.x - box.minX;
      expect(left).toBeGreaterThanOrEqual(0);
      maxRight = Math.max(maxRight, left + key.rect.w);
    }
    expect(maxRight).toBeCloseTo(box.width);
  });

  it('缩放后画布宽度不超过容器宽度（不产生横向滚动条）', () => {
    const box = boundingBox(selectKeys(def, 0));
    for (const containerWidth of [640, 768, 936, 1200]) {
      const scale = fitScale(box.width, containerWidth);
      expect(box.width * scale).toBeLessThanOrEqual(containerWidth + 1e-6);
    }
  });
});
