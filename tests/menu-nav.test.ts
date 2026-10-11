// buildDefinitionNavSections 单测：证明侧栏「定义栏目」完全由定义文件驱动，且菜单守恒。
// ⚠️ 用例中的 label 一律用中性占位（m0…m7），避免出现任何具体键盘特征词。
import { describe, expect, it } from 'vitest';
import { buildDefinitionNavSections } from '@/definition/menuNav';
import type { CategoryId } from '@/definition/schema';
import type { MenuNavItem } from '@/store/useDefinitionStore';

/** 构造一个顶层菜单导航项；category 缺省即「不参与分组」。 */
function menu(id: string, category?: CategoryId, controlCount = 1): MenuNavItem {
  return category === undefined
    ? { id, label: id, controlCount }
    : { id, label: id, controlCount, category };
}

/** 展开成扁平菜单 id 列表，用于守恒 / 保序断言。 */
function flattenIds(sections: readonly { readonly menus: readonly MenuNavItem[] }[]): string[] {
  return sections.flatMap((section) => section.menus.map((m) => m.id));
}

describe('buildDefinitionNavSections · 真实形态（4 带 category / 4 不带）', () => {
  // 顺序与当前定义文件的顶层菜单一致（只保留 category 与顺序，菜单名取中性值）。
  const menus: readonly MenuNavItem[] = [
    menu('m0', 'actuation', 3),
    menu('m1', 'lighting', 3),
    menu('m2', 'profiles', 8),
    menu('m3', 'macros', 16),
    menu('m4', undefined, 11),
    menu('m5', undefined, 5),
    menu('m6', undefined, 5),
    menu('m7', undefined, 6),
  ];

  it('生成 8 个 section：3 个分组 + 5 个独立行', () => {
    const sections = buildDefinitionNavSections(menus);
    expect(sections).toHaveLength(8);
  });

  it('分组标题按首次出现顺序排列，独立行无标题', () => {
    const sections = buildDefinitionNavSections(menus);
    expect(sections.map((s) => s.label)).toEqual([
      '性能',
      '灯光',
      '配置',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('平台级固定栏目的 category（macros）降级为独立行，不建分组', () => {
    const sections = buildDefinitionNavSections(menus);
    const standalone = sections.filter((s) => s.label === undefined);
    // m3（macros 属平台固定栏目）+ m4…m7（无 category）
    expect(standalone).toHaveLength(5);
    expect(flattenIds(standalone)).toEqual(['m3', 'm4', 'm5', 'm6', 'm7']);
  });

  it('守恒：所有 section 的菜单数之和等于输入数（8）', () => {
    const sections = buildDefinitionNavSections(menus);
    const total = sections.reduce((sum, s) => sum + s.menus.length, 0);
    expect(total).toBe(menus.length);
    expect(total).toBe(8);
  });

  it('保序：展开后的菜单顺序与输入完全一致', () => {
    const sections = buildDefinitionNavSections(menus);
    expect(flattenIds(sections)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']);
  });

  it('每个 section 至少含 1 个菜单，且 key 唯一', () => {
    const sections = buildDefinitionNavSections(menus);
    expect(sections.every((s) => s.menus.length >= 1)).toBe(true);
    expect(new Set(sections.map((s) => s.key)).size).toBe(sections.length);
  });

  it('不出现任何写死的「其他」分组', () => {
    const sections = buildDefinitionNavSections(menus);
    expect(sections.some((s) => s.label === '其他')).toBe(false);
  });
});

describe('buildDefinitionNavSections · 极端形态', () => {
  it('全部无 category：N 个菜单生成 N 个独立 section，不丢菜单', () => {
    const menus = [menu('m0'), menu('m1'), menu('m2'), menu('m3')];
    const sections = buildDefinitionNavSections(menus);
    expect(sections).toHaveLength(4);
    expect(sections.every((s) => s.label === undefined)).toBe(true);
    expect(sections.every((s) => s.menus.length === 1)).toBe(true);
    expect(sections.every((s) => s.iconKey === 'capability')).toBe(true);
    expect(flattenIds(sections)).toEqual(['m0', 'm1', 'm2', 'm3']);
    expect(sections.some((s) => s.label === '其他')).toBe(false);
  });

  it('未知 category 值：不崩溃，降级为独立行且总数守恒', () => {
    const menus = [
      menu('m0', 'lighting'),
      menu('m1', 'foo' as CategoryId),
      menu('m2', 'actuation'),
      menu('m3'),
    ];
    const sections = buildDefinitionNavSections(menus);
    expect(sections.map((s) => s.label)).toEqual(['灯光', undefined, '性能', undefined]);
    expect(flattenIds(sections)).toEqual(['m0', 'm1', 'm2', 'm3']);
    expect(sections.reduce((sum, s) => sum + s.menus.length, 0)).toBe(4);
  });

  it('同一分组内多个菜单：合并为一个 section 并保持相对顺序', () => {
    const menus = [menu('m0', 'lighting'), menu('m1', 'actuation'), menu('m2', 'lighting')];
    const sections = buildDefinitionNavSections(menus);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.label).toBe('灯光');
    expect(flattenIds(sections).slice(0, 2)).toEqual(['m0', 'm2']);
    expect(flattenIds(sections)).toEqual(['m0', 'm2', 'm1']);
    expect(sections[0]?.key).toBe('cat:lighting');
  });

  it('平台级固定栏目 category 全部降级为独立行', () => {
    const menus = [
      menu('m0', 'keycaps'),
      menu('m1', 'device'),
      menu('m2', 'macros'),
    ];
    const sections = buildDefinitionNavSections(menus);
    expect(sections).toHaveLength(3);
    expect(sections.every((s) => s.label === undefined)).toBe(true);
    expect(flattenIds(sections)).toEqual(['m0', 'm1', 'm2']);
  });

  it('空输入返回空数组', () => {
    expect(buildDefinitionNavSections([])).toEqual([]);
  });

  it('纯函数：不修改传入的数组', () => {
    const menus = [menu('m0', 'lighting'), menu('m1')];
    const snapshot = menus.map((m) => m.id);
    buildDefinitionNavSections(menus);
    expect(menus.map((m) => m.id)).toEqual(snapshot);
  });
});
