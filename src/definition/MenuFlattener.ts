// 菜单扁平化：menus 递归遍历 → MenuDef[] + 扁平控件表，生成稳定唯一 controlId（架构 F1/F2/F3）。
import type {
  CategoryId,
  ControlOptions,
  ControlSpec,
  ControlType,
  DefinitionIssue,
  MenuDef,
  MenuGroupNode,
  MenuNode,
  MenuNodeRaw,
  ValueAddress,
  ValueContent,
} from './schema';
import { CONTROL_TYPES } from './schema';
import { inferWidth } from '@/core/protocol/ValueWidth';

export interface FlattenResult {
  readonly menus: readonly MenuDef[];
  readonly controls: readonly ControlSpec[];
  readonly issues: readonly DefinitionIssue[];
  /** 分组节点总数（含 8 个顶层菜单根节点） */
  readonly groupCount: number;
}

interface FlattenState {
  readonly issues: DefinitionIssue[];
  readonly controls: ControlSpec[];
  controlSeq: number;
  groupSeq: number;
  groupCount: number;
}

const DEFAULT_TYPE: ControlType = 'toggle';

/** 子节点数组：同时兼容 `content` 与 `children` 两种写法（架构 F3）。 */
function childrenOf(node: MenuNodeRaw): MenuNodeRaw[] {
  const raw = node.content ?? node.children;
  if (!Array.isArray(raw)) return [];
  // content 既可能是子节点数组也可能是值内容，按元素形态判别
  return raw.filter((item): item is MenuNodeRaw => typeof item === 'object' && item !== null);
}

/** content 数组：仅当首元素是字符串时为值内容。 */
function valueContentOf(node: MenuNodeRaw): ValueContent | null {
  const raw = node.content;
  if (!Array.isArray(raw) || raw.length < 3) return null;
  if (typeof raw[0] !== 'string') return null;
  return raw as ValueContent;
}

export function makeAddress(valueContent: ValueContent): ValueAddress {
  const [valueKey, channel, valueId, ...indexes] = valueContent;
  void valueKey;
  return {
    channel: channel & 0xff,
    valueId: valueId & 0xff,
    indexes: indexes.map((i) => i & 0xff),
    key: `${channel & 0xff}:${valueId & 0xff}:${indexes.map((i) => i & 0xff).join('.')}`,
  };
}

/** 归一化 options：dropdown 支持 string[] 与 [label,value][]；range 恒为 [min,max]；其余忽略。 */
export function normalizeOptions(type: ControlType, raw: unknown): ControlOptions {
  switch (type) {
    case 'range': {
      if (Array.isArray(raw) && raw.length >= 2) {
        const min = Number(raw[0] ?? 0);
        const max = Number(raw[1] ?? 0);
        if (Number.isFinite(min) && Number.isFinite(max)) return { kind: 'range', min, max };
      }
      return { kind: 'range', min: 0, max: 255 };
    }
    case 'dropdown': {
      if (Array.isArray(raw)) {
        const items = raw.map((item, i) => {
          if (Array.isArray(item)) {
            const label = String(item[0] ?? '');
            const value = Number(item[1] ?? i);
            return { label, value: Number.isFinite(value) ? value : i };
          }
          return { label: String(item), value: i };
        });
        return { kind: 'enum', items };
      }
      return { kind: 'enum', items: [] };
    }
    case 'button': {
      const args = Array.isArray(raw) ? raw.map((v) => Number(v) || 0) : [];
      return { kind: 'action', args };
    }
    default:
      return { kind: 'none' };
  }
}

function normalizeType(raw: string | undefined, path: string, issues: DefinitionIssue[]): ControlType {
  const t = (raw ?? '').toLowerCase();
  if ((CONTROL_TYPES as readonly string[]).includes(t)) return t as ControlType;
  issues.push({
    level: 'warn',
    path,
    message: `未知控件类型 "${raw ?? ''}"，已按 ${DEFAULT_TYPE} 处理`,
  });
  return DEFAULT_TYPE;
}

function buildControl(
  node: MenuNodeRaw,
  menuId: string,
  path: readonly string[],
  seq: number,
  issues: DefinitionIssue[],
): ControlSpec | null {
  const content = valueContentOf(node);
  const nodePath = path.join('/');
  if (!content) {
    issues.push({
      level: 'error',
      path: `${menuId}/${nodePath}`,
      message: '控件缺少 content（应为 [valueKey, channel, valueId, ...indexes]）',
    });
    return null;
  }
  const type = normalizeType(node.type, `${menuId}/${nodePath}`, issues);
  const address = makeAddress(content);
  const options = normalizeOptions(type, node.options);
  const spec: ControlSpec = {
    id: `${menuId}/${nodePath}#${seq}`,
    valueKey: String(content[0] ?? ''),
    label: node.label ?? '',
    type,
    options,
    address,
    showIf: node.showIf,
    menuId,
    path,
    widthHint: 1,
  };
  // widthHint 依赖 options，需二次写入（ControlSpec 只读，故重建一次）
  return { ...spec, widthHint: inferWidth(spec, {}) };
}

/**
 * 递归遍历 menus：
 * - 有 `type` → 叶子控件
 * - 否则 → 分组（label 可缺省，条件分组内联展开，架构 F2）
 */
function walk(
  node: MenuNodeRaw,
  menuId: string,
  path: readonly string[],
  state: FlattenState,
): MenuNode | null {
  if (node && typeof node === 'object' && typeof node.type === 'string') {
    const control = buildControl(node, menuId, path, state.controlSeq, state.issues);
    if (!control) return null;
    state.controlSeq += 1;
    state.controls.push(control);
    return { kind: 'control', control };
  }

  const segment = node.label ?? `(${state.groupSeq})`;
  const nextPath = [...path, segment];
  const groupId = `${menuId}/${nextPath.join('/')}#g${state.groupSeq}`;
  state.groupSeq += 1;
  state.groupCount += 1;

  const children: MenuNode[] = [];
  for (const child of childrenOf(node)) {
    if (child === null || typeof child !== 'object') continue;
    const built = walk(child, menuId, nextPath, state);
    if (built) children.push(built);
  }

  const group: MenuGroupNode = {
    kind: 'group',
    id: groupId,
    label: node.label,
    showIf: node.showIf,
    children,
    controlCount: countControls(children),
  };
  return group;
}

function countControls(nodes: readonly MenuNode[]): number {
  let n = 0;
  for (const node of nodes) {
    if (node.kind === 'control') n += 1;
    else n += node.controlCount;
  }
  return n;
}

/**
 * 把定义文件的 menus 递归展开为菜单树 + 扁平控件表。
 *
 * @param menus 已展开的顶层菜单（字符串形式的官方预设菜单由 resolveCommonMenus 先行展开）
 * @param commonKeys 与 menus 一一对应的来源标记（预设菜单 id / undefined）
 */
export function flattenMenus(
  menus: readonly MenuNodeRaw[],
  commonKeys: readonly (string | undefined)[] = [],
): FlattenResult {
  const state: FlattenState = {
    issues: [],
    controls: [],
    controlSeq: 0,
    groupSeq: 0,
    groupCount: 0,
  };
  const out: MenuDef[] = [];

  menus.forEach((menuRaw, index) => {
    const menuId = `m${index}`;
    const label = menuRaw.label ?? `菜单 ${index + 1}`;
    const before = state.controls.length;
    // 顶层菜单自身即为一个分组节点（统计口径：8 个顶层菜单计入 67 个分组）
    state.groupCount += 1;
    state.groupSeq += 1;
    const children: MenuNode[] = [];
    for (const child of childrenOf(menuRaw)) {
      if (child === null || typeof child !== 'object') continue;
      const built = walk(child, menuId, [label], state);
      if (built) children.push(built);
    }
    const root: MenuGroupNode = {
      kind: 'group',
      id: `${menuId}/${label}#g0`,
      label,
      showIf: menuRaw.showIf,
      children,
      controlCount: countControls(children),
    };
    out.push({
      id: menuId,
      label,
      category: menuRaw.category as CategoryId | undefined,
      commonKey: commonKeys[index],
      root,
      controls: state.controls.slice(before),
    });
  });

  return {
    menus: out,
    controls: state.controls,
    issues: state.issues,
    groupCount: state.groupCount,
  };
}
