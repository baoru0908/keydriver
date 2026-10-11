// 定义解析入口：原始 JSON → ParsedDefinition（菜单树、控件表、KLE 几何、布局标签）。
import type {
  CustomKeycode,
  DefinitionIssue,
  KleKey,
  LayoutOptionGroup,
  MenuNode,
  ParsedDefinition,
  ViaDefinition,
} from './schema';
import { parseId, validateDefinition, type ValidateResult } from './validate';
import { resolveCommonMenus } from './commonMenus';
import { flattenMenus, type FlattenResult } from './MenuFlattener';
import { compactRows, computeKeys } from './KleGeometry';
import { computeLayoutGroups, toOptionArray } from './LayoutOptions';

export interface ParseResult {
  readonly ok: boolean;
  readonly definition?: ParsedDefinition;
  readonly issues: readonly DefinitionIssue[];
}

/** 解析一份 VIA V3 定义 JSON。永不抛异常：失败时返回字段级 issue 列表。 */
export function parseViaDefinition(input: unknown): ParseResult {
  const validated: ValidateResult = validateDefinition(input);
  if (!validated.ok || !validated.data) {
    return { ok: false, issues: validated.issues };
  }
  return buildParsed(validated.data, validated.issues);
}

function buildParsed(raw: ViaDefinition, baseIssues: readonly DefinitionIssue[]): ParseResult {
  const issues: DefinitionIssue[] = [...baseIssues];
  // menus 里的字符串元素先展开成官方预设菜单（未知 id 只告警、不阻断加载）
  const resolved = resolveCommonMenus(raw.menus ?? []);
  issues.push(...resolved.issues);
  const flattened: FlattenResult = flattenMenus(resolved.menus, resolved.commonKeys);
  issues.push(...flattened.issues);

  const labels = raw.layouts.labels ?? [];
  const layoutLabels: LayoutOptionGroup[] = computeLayoutGroups(labels);
  const allKeys: KleKey[] = computeKeys(raw.layouts.keymap ?? []);
  const keys = compactRows(allKeys, toOptionArray(layoutLabels, 0));

  const customKeycodes: CustomKeycode[] = (raw.customKeycodes ?? []).map((kc) => ({
    name: kc.name,
    title: kc.title ?? kc.name,
    shortName: kc.shortName ?? kc.name,
  }));

  const controlById = new Map(flattened.controls.map((c) => [c.id, c]));
  const controlsByMenu = new Map(flattened.menus.map((m) => [m.id, m.controls]));

  const definition: ParsedDefinition = {
    raw,
    name: raw.name,
    vid: parseId(raw.vendorId),
    pid: parseId(raw.productId),
    matrix: { rows: raw.matrix.rows, cols: raw.matrix.cols },
    menus: flattened.menus,
    controls: flattened.controls,
    controlById,
    controlsByMenu,
    keys,
    allKeys,
    layoutLabels,
    customKeycodes,
    issues,
  };
  return { ok: true, definition, issues };
}

/**
 * 按当前 layout_options 重新计算可见键位（行压紧后）。
 * 键位图随布局选项变化时必须走这里，否则底行位置会错乱（架构 A3）。
 */
export function selectKeys(definition: ParsedDefinition, layoutOptions: number): KleKey[] {
  return compactRows(definition.allKeys, toOptionArray(definition.layoutLabels, layoutOptions));
}

/** 控件类型分布统计（冒烟脚本与调试面板使用）。 */
export function controlStats(definition: ParsedDefinition): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const c of definition.controls) {
    stats[c.type] = (stats[c.type] ?? 0) + 1;
  }
  return stats;
}

/** 统计全部分组节点数量（含顶层菜单根节点，不含叶子控件）。 */
export function countGroupNodes(definition: ParsedDefinition): number {
  let n = 0;
  const walk = (node: MenuNode): void => {
    if (node.kind !== 'group') return;
    n += 1;
    for (const child of node.children) walk(child);
  };
  for (const menu of definition.menus) walk(menu.root);
  return n;
}
