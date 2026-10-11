// 菜单可用性计算：按 showIf 上下文给菜单树的每个节点标注「可用 / 不可用」。
//
// 语义严格照搬官方 VIA（src/components/panes/configure-panes/custom/menu-generator.tsx）：
//   · 菜单根级 showIf 不满足 → 整块不渲染（官方对整块 submenu 的处理）；
//   · 分组 / 控件级 showIf 不满足 → **仍然渲染**，只是置灰 + 不可交互 + 给出固件版本提示；
//     官方原文是 "This feature is not available for this firmware version."，界面是中文，
//     这里统一用「当前固件版本不支持该功能」。
//   · 一个菜单内没有任何可交互分组时 → 兜底文案「当前固件版本不提供任何可用功能」，
//     对应官方 "No features available for this firmware version."。
//
// ⚠️ 本模块只「标注」不「过滤」：任何节点都不会从树上消失——这是本次改造的核心。
//    官方 VIA 的 showIf 绝大多数是「兄弟控件联动」（形如 `{xxx} != 0`，变量名是另一个
//    控件的 valueKey），如果被依赖的控件被隐藏、值不再进入上下文，联动会恒为假、
//    控件永远灰着；所以置灰的控件照样读值、照样写进 showIf 上下文
//    （useMenuStore 的 hydrate / setValue 对**全部**控件写 showIfContext，
//    useDeviceStore.menuLoad 也用 controlsByMenu 遍历**全部**控件）。
//    「置灰不可写」与「作为条件变量」必须同时成立，二者不互斥。
import type { ControlSpec, MenuGroupNode, MenuNode } from '@/definition/schema';
import { evaluate, type ShowIfContext } from '@/definition/ShowIfEvaluator';

/** 单个节点不可用时展示的提示（通用状态文案，与具体键盘无关）。 */
export const UNAVAILABLE_HINT = '当前固件版本不支持该功能';

/** 整个菜单没有任何可用功能时的兜底文案。 */
export const NO_AVAILABLE_HINT = '当前固件版本不提供任何可用功能';

export interface AvailableGroupNode {
  readonly kind: 'group';
  readonly id: string;
  readonly node: MenuGroupNode;
  /** 节点自身 showIf 的求值结果（false = 自身条件不满足） */
  readonly enabled: boolean;
  /** 是否可交互：自身条件满足**且**全部祖先也都满足 */
  readonly interactive: boolean;
  readonly children: readonly AvailableNode[];
}

export interface AvailableControlNode {
  readonly kind: 'control';
  readonly id: string;
  readonly control: ControlSpec;
  /** 控件自身 showIf 的求值结果 */
  readonly enabled: boolean;
  /** 是否可交互：自身条件满足且所在分组链全部可用 */
  readonly interactive: boolean;
}

export type AvailableNode = AvailableGroupNode | AvailableControlNode;

export interface MenuAvailability {
  /** 菜单根级 showIf 结果；为 false 时整块不渲染 */
  readonly rootEnabled: boolean;
  /** 顶层子节点（无论可用与否，一律保留） */
  readonly children: readonly AvailableNode[];
  /** 是否存在至少一个可交互的顶层子节点 */
  readonly hasAvailable: boolean;
  /** 可交互的控件数量 */
  readonly availableControlCount: number;
  /** 菜单内控件总数（与上下文无关，用于证明「只置灰不隐藏」） */
  readonly controlCount: number;
}

/**
 * 递归标注一个节点。
 * @param node 菜单树节点（分组或控件）
 * @param context showIf 求值上下文（valueKey → 值）
 * @param ancestorEnabled 全部祖先的可用性；为 false 时后代一律不可交互
 */
export function computeNodeAvailability(
  node: MenuNode,
  context: ShowIfContext,
  ancestorEnabled = true,
): AvailableNode {
  if (node.kind === 'control') {
    const enabled = evaluate(node.control.showIf, context).value;
    return {
      kind: 'control',
      id: node.control.id,
      control: node.control,
      enabled,
      interactive: ancestorEnabled && enabled,
    };
  }
  const enabled = evaluate(node.showIf, context).value;
  const interactive = ancestorEnabled && enabled;
  return {
    kind: 'group',
    id: node.id,
    node,
    enabled,
    interactive,
    children: node.children.map((child) => computeNodeAvailability(child, context, interactive)),
  };
}

/** 计算整个菜单的可用性树（根节点 + 全部子节点，一律保留）。 */
export function computeAvailability(
  root: MenuGroupNode,
  context: ShowIfContext,
): MenuAvailability {
  const rootEnabled = evaluate(root.showIf, context).value;
  const children = root.children.map((child) =>
    computeNodeAvailability(child, context, rootEnabled),
  );
  const flat = flattenAvailability(children);
  let availableControlCount = 0;
  let controlCount = 0;
  for (const item of flat) {
    if (item.kind !== 'control') continue;
    controlCount += 1;
    if (item.interactive) availableControlCount += 1;
  }
  return {
    rootEnabled,
    children,
    hasAvailable: children.some((child) => child.interactive),
    availableControlCount,
    controlCount,
  };
}

/** 深度优先展开可用性树（统计与测试用）。 */
export function flattenAvailability(
  nodes: readonly AvailableNode[],
  out: AvailableNode[] = [],
): AvailableNode[] {
  for (const node of nodes) {
    out.push(node);
    if (node.kind === 'group') flattenAvailability(node.children, out);
  }
  return out;
}

/** 按 id 在可用性树中查找节点（测试与调试用）。 */
export function findAvailability(
  nodes: readonly AvailableNode[],
  id: string,
): AvailableNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.kind === 'group') {
      const hit = findAvailability(node.children, id);
      if (hit) return hit;
    }
  }
  return null;
}
