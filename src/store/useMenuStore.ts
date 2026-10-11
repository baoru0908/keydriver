// 菜单状态：控件值（按 controlId 索引 + 按 ValueAddress 索引）、showIf 求值上下文、脏集合与懒加载进度。
//
// ⚠️ 两条铁律（架构 F1 / 本轮需求）：
//  1) 控件状态一律按 controlId 索引——valueKey 在定义文件中不唯一（实测 347/349）。
//  2) 值的「真值来源」是 ValueAddress，不是 controlId。定义文件中存在两个不同分组的控件
//     指向同一地址（厂商有意做的快捷入口），改一处必须两处同步刷新；
//     因此 addressValues 为唯一真值，values 只是按 controlId 的展示缓存。
import { create } from 'zustand';
import type { ControlSpec, MenuNode, ParsedDefinition } from '@/definition/schema';
import { evaluate } from '@/definition/ShowIfEvaluator';
import { addressKey } from '@/core/protocol/CustomValueCodec';
import { defaultValueOf } from '@/core/device/DeviceFacade';

export type MenuStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ValueEntry {
  readonly control: ControlSpec;
  readonly value: number;
}

interface MenuState {
  /** key = controlId（唯一）；value = 展示缓存值（同地址控件会被一起刷新） */
  values: Readonly<Record<string, number>>;
  /** key = addressKey（真值来源）；value = 当前值 */
  addressValues: Readonly<Record<string, number>>;
  /** key = valueKey（可能重复，仅供 showIf 求值）；value = 当前值 */
  showIfContext: Readonly<Record<string, number>>;
  dirty: ReadonlySet<string>;
  loadedMenus: ReadonlySet<string>;
  /** key = addressKey；value = 指向该地址的全部 controlId（快捷入口需要双向同步） */
  controlIdsByAddress: Readonly<Record<string, readonly string[]>>;
  status: MenuStatus;
  progress: number;
  error: string | null;
  /** 载入定义文件时建立「地址 → controlId[]」索引。 */
  indexControls: (definition: ParsedDefinition | null) => void;
  setValue: (control: ControlSpec, value: number) => void;
  setMany: (entries: readonly ValueEntry[]) => void;
  /** 懒加载完成某菜单后落库，并标记已加载。 */
  hydrate: (menuId: string, entries: readonly ValueEntry[]) => void;
  markDirty: (controlId: string) => void;
  markClean: (controlId: string) => void;
  clearDirty: () => void;
  markMenuLoaded: (menuId: string) => void;
  setStatus: (status: MenuStatus, progress?: number, error?: string | null) => void;
  reset: () => void;
}

const EMPTY_NUMBERS: Readonly<Record<string, number>> = Object.freeze({});
const EMPTY_DIRTY: ReadonlySet<string> = new Set();
const EMPTY_LOADED: ReadonlySet<string> = new Set();
const EMPTY_INDEX: Readonly<Record<string, readonly string[]>> = Object.freeze({});

export const useMenuStore = create<MenuState>((set) => ({
  values: EMPTY_NUMBERS,
  addressValues: EMPTY_NUMBERS,
  showIfContext: EMPTY_NUMBERS,
  dirty: EMPTY_DIRTY,
  loadedMenus: EMPTY_LOADED,
  controlIdsByAddress: EMPTY_INDEX,
  status: 'idle',
  progress: 0,
  error: null,

  indexControls: (definition) => {
    if (!definition) {
      set({ controlIdsByAddress: EMPTY_INDEX });
      return;
    }
    const byAddress: Record<string, string[]> = {};
    for (const control of definition.controls) {
      const key = addressKey(control.address);
      const list = byAddress[key];
      if (list) list.push(control.id);
      else byAddress[key] = [control.id];
    }
    set({ controlIdsByAddress: byAddress });
  },

  setValue: (control, value) =>
    set((state) => {
      const key = addressKey(control.address);
      const next = value >>> 0;
      // ① 真值落在地址上
      const addressValues = { ...state.addressValues, [key]: next };
      // ② 指向同一地址的全部控件一起刷新（快捷入口：改一处两处同步）
      const values = { ...state.values };
      for (const id of state.controlIdsByAddress[key] ?? [control.id]) values[id] = next;
      values[control.id] = next;
      // ③ showIf 上下文按 valueKey 存值：重复的 valueKey 指向同一地址，语义正确（F1）
      const showIfContext = { ...state.showIfContext, [control.valueKey]: next };
      const dirty = new Set(state.dirty);
      for (const id of state.controlIdsByAddress[key] ?? [control.id]) dirty.add(id);
      return { values, addressValues, showIfContext, dirty };
    }),

  setMany: (entries) =>
    set((state) => {
      const values = { ...state.values };
      const addressValues = { ...state.addressValues };
      const showIfContext = { ...state.showIfContext };
      for (const entry of entries) {
        const key = addressKey(entry.control.address);
        const next = entry.value >>> 0;
        addressValues[key] = next;
        for (const id of state.controlIdsByAddress[key] ?? [entry.control.id]) values[id] = next;
        values[entry.control.id] = next;
        showIfContext[entry.control.valueKey] = next;
      }
      return { values, addressValues, showIfContext };
    }),

  hydrate: (menuId, entries) =>
    set((state) => {
      const values = { ...state.values };
      const addressValues = { ...state.addressValues };
      const showIfContext = { ...state.showIfContext };
      for (const entry of entries) {
        const key = addressKey(entry.control.address);
        const next = entry.value >>> 0;
        addressValues[key] = next;
        for (const id of state.controlIdsByAddress[key] ?? [entry.control.id]) values[id] = next;
        values[entry.control.id] = next;
        showIfContext[entry.control.valueKey] = next;
      }
      return {
        values,
        addressValues,
        showIfContext,
        loadedMenus: new Set(state.loadedMenus).add(menuId),
      };
    }),

  markDirty: (controlId) => set((state) => ({ dirty: new Set(state.dirty).add(controlId) })),

  markClean: (controlId) =>
    set((state) => {
      if (!state.dirty.has(controlId)) return state;
      const next = new Set(state.dirty);
      next.delete(controlId);
      return { dirty: next };
    }),

  clearDirty: () => set({ dirty: EMPTY_DIRTY }),

  markMenuLoaded: (menuId) => set((state) => ({ loadedMenus: new Set(state.loadedMenus).add(menuId) })),

  setStatus: (status, progress, error) =>
    set((state) => ({
      status,
      progress: progress ?? state.progress,
      error: error === undefined ? state.error : error,
    })),

  reset: () =>
    set({
      values: EMPTY_NUMBERS,
      addressValues: EMPTY_NUMBERS,
      showIfContext: EMPTY_NUMBERS,
      dirty: EMPTY_DIRTY,
      loadedMenus: EMPTY_LOADED,
      status: 'idle',
      progress: 0,
      error: null,
    }),
}));

/**
 * 读取某控件的当前值。
 * 优先级：地址真值 → controlId 缓存 → 控件默认値（保证 349 个控件 100% 有值可渲染）。
 */
export function readValue(
  state: Pick<MenuState, 'values' | 'addressValues'>,
  control: ControlSpec,
): number {
  const byAddress = state.addressValues[addressKey(control.address)];
  if (byAddress !== undefined) return byAddress;
  const byId = state.values[control.id];
  if (byId !== undefined) return byId;
  return defaultValueOf(control);
}

/** 组件内按 controlId 订阅值（返回原始值，引用稳定，不会引发多余重渲染）。 */
export function useControlValue(control: ControlSpec): number {
  return useMenuStore((s) => readValue(s, control));
}

/**
 * 计算某菜单当前可见的控件（group 层与 leaf 层双层求值，架构 F2）。
 * 分组 showIf 为假 → 整棵子树跳过，其控件不参与懒加载与导出。
 */
export function visibleControls(
  definition: ParsedDefinition,
  menuId: string,
  context: Readonly<Record<string, number>>,
): ControlSpec[] {
  const menu = definition.menus.find((m) => m.id === menuId);
  if (!menu) return [];
  const out: ControlSpec[] = [];
  const visit = (node: MenuNode): void => {
    if (node.kind !== 'group') {
      if (evaluate(node.control.showIf, context).value) out.push(node.control);
      return;
    }
    if (!evaluate(node.showIf, context).value) return;
    for (const child of node.children) visit(child);
  };
  if (!evaluate(menu.root.showIf, context).value) return out;
  for (const child of menu.root.children) visit(child);
  return out;
}

/** 按当前 showIf 上下文收集某分组下「应当显示」的子节点（分组级 + 叶子级双层求值）。 */
export function visibleChildren(
  group: MenuNode & { readonly kind: 'group' },
  context: Readonly<Record<string, number>>,
): MenuNode[] {
  if (!evaluate(group.showIf, context).value) return [];
  return group.children.filter((child) =>
    child.kind === 'group'
      ? evaluate(child.showIf, context).value
      : evaluate(child.control.showIf, context).value,
  );
}
