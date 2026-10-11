// QA 独立验证 · 官方预设菜单（commonMenus）的字符串引用。
// 背景：VIA V3 定义文件的 `menus` 元素允许写成预设菜单 id 字符串；
// 修复前 parseViaDefinition 会整份判定失败（一个键都读不出来），这里逐条锁住修复后的行为。
import { describe, expect, it } from 'vitest';
import {
  COMMON_MENUS,
  COMMON_MENU_KEYS,
  isCommonMenuKey,
  resolveCommonMenus,
} from '@/definition/commonMenus';
import { parseViaDefinition } from '@/definition/DefinitionParser';
import { flattenMenus } from '@/definition/MenuFlattener';
import { validateDefinition } from '@/definition/validate';
import type { MenuNodeRaw, ViaDefinition } from '@/definition/schema';

/** 最小合法定义骨架（menus 单独注入）。 */
function buildDefinition(menus: readonly unknown[]): ViaDefinition {
  return {
    name: 'QA 键盘',
    vendorId: '0x1234',
    productId: '0x0001',
    matrix: { rows: 2, cols: 3 },
    menus: menus as ViaDefinition['menus'],
    layouts: { keymap: [['0,0', '0,1', '0,2']] },
  };
}

/** 统计一棵菜单树里的叶子控件数（含被 showIf 隐藏的）。 */
function countControls(nodes: readonly MenuNodeRaw[]): number {
  let n = 0;
  const walk = (node: MenuNodeRaw): void => {
    if (typeof node.type === 'string') {
      n += 1;
      return;
    }
    const children = node.content ?? node.children;
    if (!Array.isArray(children)) return;
    for (const child of children) {
      if (typeof child === 'object' && child !== null) walk(child);
    }
  };
  for (const node of nodes) walk(node);
  return n;
}

describe('QA · 五个官方预设菜单的展开产物', () => {
  const expected: ReadonlyArray<[string, number]> = [
    ['qmk_audio', 2],
    ['qmk_backlight', 2],
    ['qmk_backlight_rgblight', 6],
    ['qmk_rgb_matrix', 4],
    ['qmk_rgblight', 4],
  ];

  it('预设 id 集合与官方一致（5 个）', () => {
    expect([...COMMON_MENU_KEYS].sort()).toEqual(
      ['qmk_audio', 'qmk_backlight', 'qmk_backlight_rgblight', 'qmk_rgb_matrix', 'qmk_rgblight'].sort(),
    );
    expect(COMMON_MENU_KEYS.length).toBe(5);
    expect(isCommonMenuKey('qmk_rgblight')).toBe(true);
    expect(isCommonMenuKey('qmk_not_exist')).toBe(false);
  });

  it.each(expected)('%s 展开出 1 个顶层菜单 / %i 个控件', (key, controls) => {
    const result = flattenMenus(
      resolveCommonMenus([key]).menus,
      resolveCommonMenus([key]).commonKeys,
    );
    expect(result.menus).toHaveLength(1);
    expect(result.controls).toHaveLength(controls);
    expect(result.menus[0]?.commonKey).toBe(key);
    expect(result.issues).toHaveLength(0);
  });

  it('预设里的控件类型全部落在 ControlType 内（不产生「未知类型」告警）', () => {
    const all = COMMON_MENU_KEYS.flatMap((key) => resolveCommonMenus([key]).menus);
    const result = flattenMenus(all);
    expect(result.issues).toEqual([]);
    const types = result.controls.map((c) => c.type);
    expect(types.every((t) => ['toggle', 'range', 'dropdown', 'color'].includes(t))).toBe(true);
    expect(countControls(all)).toBe(18);
  });

  it('预设数据的节点总数与官方一致（29 个节点 = 11 分组 + 18 控件）', () => {
    const all = COMMON_MENU_KEYS.flatMap((key) => resolveCommonMenus([key]).menus);
    const result = flattenMenus(all);
    expect(result.groupCount).toBe(11);
    expect(result.controls).toHaveLength(18);
    expect(countControls(all)).toBe(18);
  });

  it('长选项下拉的条数与官方逐条对齐（防止转写缺项）', () => {
    const rgblight = flattenMenus(resolveCommonMenus(['qmk_rgblight']).menus);
    const effect = rgblight.controls.find((c) => c.valueKey === 'id_qmk_rgblight_effect');
    expect(effect?.options.kind).toBe('enum');
    if (effect?.options.kind !== 'enum') throw new Error('rgblight Effect 不是下拉');
    expect(effect.options.items).toHaveLength(43);
    expect(effect.options.items[0]).toEqual({ label: 'All Off', value: 0 });
    expect(effect.options.items.at(-1)).toEqual({ label: 'Twinkle 6', value: 42 });

    const matrix = flattenMenus(resolveCommonMenus(['qmk_rgb_matrix']).menus);
    const matrixEffect = matrix.controls.find((c) => c.valueKey === 'id_qmk_rgb_matrix_effect');
    if (matrixEffect?.options.kind !== 'enum') throw new Error('rgb_matrix Effect 不是下拉');
    expect(matrixEffect.options.items).toHaveLength(45);
    expect(matrixEffect.options.items.at(-1)).toEqual({ label: 'Solid Multi Splash', value: 44 });

    // 元组形态的 options（[label, value][]）也必须转成 { label, value }
    const backlight = flattenMenus(resolveCommonMenus(['qmk_backlight']).menus);
    const blEffect = backlight.controls.find((c) => c.valueKey === 'id_qmk_backlight_effect');
    expect(blEffect?.options).toEqual({
      kind: 'enum',
      items: [
        { label: 'Off', value: 0 },
        { label: 'Breathing', value: 1 },
      ],
    });
  });

  it('showIf 表达式被保留下来（预设菜单确有依赖显示的控件）', () => {
    const result = flattenMenus(resolveCommonMenus(['qmk_rgblight']).menus);
    const hidden = result.controls.filter((c) => c.showIf !== undefined);
    expect(hidden.map((c) => c.valueKey)).toEqual(['id_qmk_rgblight_effect_speed', 'id_qmk_rgblight_color']);
  });

  it('同一份预设被引用两次：展开出两份独立副本（不污染模块级常量）', () => {
    const result = flattenMenus(resolveCommonMenus(['qmk_audio', 'qmk_audio']).menus);
    expect(result.menus).toHaveLength(2);
    expect(result.controls).toHaveLength(4);
    expect(COMMON_MENUS.qmk_audio).toHaveLength(1);
    expect(COMMON_MENUS.qmk_audio[0]?.content).toHaveLength(1);
  });
});

describe('QA · 字符串形式的 menus 不再阻断加载', () => {
  it('menus: ["qmk_rgblight"] → ok:true，1 个菜单 / 4 个控件', () => {
    const result = parseViaDefinition(buildDefinition(['qmk_rgblight']));
    expect(result.ok).toBe(true);
    expect(result.definition).toBeDefined();
    expect(result.definition?.menus).toHaveLength(1);
    expect(result.definition?.menus[0]?.label).toBe('Lighting');
    expect(result.definition?.controls).toHaveLength(4);
    expect(result.definition?.controlById.size).toBe(4);
    expect((result.definition?.controlsByMenu.get('m0') ?? []).length).toBe(4);
    // 不是「生成空占位」：控件地址与类型都对得上
    const byType = (result.definition?.controls ?? []).reduce<Record<string, number>>((acc, c) => {
      acc[c.type] = (acc[c.type] ?? 0) + 1;
      return acc;
    }, {});
    expect(byType).toEqual({ range: 2, dropdown: 1, color: 1 });
    expect(result.definition?.controls.map((c) => c.valueKey)).toEqual([
      'id_qmk_rgblight_brightness',
      'id_qmk_rgblight_effect',
      'id_qmk_rgblight_effect_speed',
      'id_qmk_rgblight_color',
    ]);
    // 除「缺少 category」类提示外不应把合法定义判成 error
    expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('validateDefinition 单独也不再报 expected object, received string', () => {
    const result = validateDefinition(buildDefinition(['qmk_rgblight']));
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('未知预设 id：不阻断加载，产出一条 warn，其余字段照常解析', () => {
    const result = parseViaDefinition(buildDefinition(['不存在的菜单名']));
    expect(result.ok).toBe(true);
    expect(result.definition).toBeDefined();
    // 该菜单被跳过，但键盘本体（VID/PID/matrix/键位）照样解析出来
    expect(result.definition?.menus).toHaveLength(0);
    expect(result.definition?.vid).toBe(0x1234);
    expect(result.definition?.matrix).toEqual({ rows: 2, cols: 3 });
    expect(result.definition?.keys).toHaveLength(3);

    const warns = (result.issues ?? []).filter(
      (i) => i.path === 'menus[0]' && i.level === 'warn' && i.message.includes('不存在的菜单名'),
    );
    expect(warns).toHaveLength(1);
    expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('未知 id 与已知 id 混写：未知者跳过，已知者照常展开', () => {
    const result = parseViaDefinition(buildDefinition(['不存在的菜单名', 'qmk_audio']));
    expect(result.ok).toBe(true);
    expect(result.definition?.menus).toHaveLength(1);
    expect(result.definition?.controls).toHaveLength(2);
    expect(result.definition?.menus[0]?.commonKey).toBe('qmk_audio');
  });

  it('字符串与内联菜单对象混写：两种形态共存且保持定义文件里的顺序', () => {
    const inline: MenuNodeRaw = {
      label: 'QA 内联菜单',
      category: 'lighting',
      content: [
        {
          label: 'QA 分组',
          content: [
            { label: 'QA 开关', type: 'toggle', content: ['id_qa_toggle', 1, 9] },
            { label: 'QA 滑杆', type: 'range', options: [0, 255], content: ['id_qa_range', 1, 10] },
          ],
        },
      ],
    };
    const result = parseViaDefinition(buildDefinition(['qmk_audio', inline]));
    expect(result.ok).toBe(true);
    expect(result.definition?.menus).toHaveLength(2);
    expect(result.definition?.menus.map((m) => m.label)).toEqual(['Audio', 'QA 内联菜单']);
    expect(result.definition?.controls).toHaveLength(4);
    // 顺序：预设在前、内联在后
    expect(result.definition?.controls.map((c) => c.menuId)).toEqual(['m0', 'm0', 'm1', 'm1']);
    expect(result.definition?.menus[1]?.category).toBe('lighting');
    expect(result.definition?.menus[1]?.commonKey).toBeUndefined();
    // 内联菜单缺少 category 的告警只针对内联对象，不由预设菜单触发
    expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
  });
});

describe('QA · 展开后 id 唯一性（三个预设的顶层 label 都叫 Lighting）', () => {
  const allLighting = buildDefinition([
    'qmk_backlight',
    'qmk_rgblight',
    'qmk_rgb_matrix',
    'qmk_backlight_rgblight',
    'qmk_audio',
  ]);

  it('反证前提：顶层 label 确实会撞名（若拿 label 当 key 必然冲突）', () => {
    const result = parseViaDefinition(allLighting);
    const labels = result.definition?.menus.map((m) => m.label) ?? [];
    expect(labels.filter((l) => l === 'Lighting')).toHaveLength(4);
    expect(new Set(labels).size).toBeLessThan(labels.length);
  });

  it('同一份定义里的菜单 id / 根分组 id / 控件 id 全部唯一', () => {
    const result = parseViaDefinition(allLighting);
    expect(result.ok).toBe(true);
    const menus = result.definition?.menus ?? [];
    expect(menus).toHaveLength(5);
    expect(new Set(menus.map((m) => m.id)).size).toBe(5);
    expect(new Set(menus.map((m) => m.root.id)).size).toBe(5);
    const ids = result.definition?.controls.map((c) => c.id) ?? [];
    expect(ids).toHaveLength(18);
    expect(new Set(ids).size).toBe(18);
  });

  it('每个菜单都能在 controlsByMenu / controlById 里按 id 精确取回', () => {
    const result = parseViaDefinition(allLighting);
    const definition = result.definition;
    expect(definition).toBeDefined();
    if (!definition) return;
    for (const menu of definition.menus) {
      expect(definition.controlsByMenu.get(menu.id)?.length).toBe(menu.root.controlCount);
      expect(menu.controls.every((c) => definition.controlById.get(c.id)?.id === c.id)).toBe(true);
    }
  });

  it('预设展开产物的 commonKey 与引用顺序一一对应且互不为空', () => {
    const resolved = resolveCommonMenus(['qmk_rgblight', 'qmk_audio']);
    expect(resolved.commonKeys).toEqual(['qmk_rgblight', 'qmk_audio']);
    expect(resolved.menus).toHaveLength(2);
    expect(resolved.issues).toEqual([]);
  });
});
