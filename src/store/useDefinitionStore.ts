// 定义状态：当前 ParsedDefinition、解析告警、来源文件。UI 只允许消费这里的产物（架构 §2 铁律 3）。
import { create } from 'zustand';
import type { CategoryId, DefinitionIssue, ParsedDefinition } from '@/definition/schema';
import { parseViaDefinition } from '@/definition/DefinitionParser';
import { KeycodeTable } from '@/keycodes/KeycodeTable';
import { useDebugStore } from './useDebugStore';

export type PanelKind = 'keymap' | 'layout' | 'debug';

export interface MenuNavItem {
  readonly id: string;
  readonly label: string;
  readonly controlCount: number;
  /** 六类导航分组归属（来自定义文件） */
  readonly category?: CategoryId;
}

interface DefinitionState {
  definition: ParsedDefinition | null;
  sourceName: string | null;
  issues: readonly DefinitionIssue[];
  parsing: boolean;
  loadFromJson: (json: unknown, sourceName?: string) => { ok: boolean; issues: readonly DefinitionIssue[] };
  clear: () => void;
}

export const useDefinitionStore = create<DefinitionState>((set) => ({
  definition: null,
  sourceName: null,
  issues: [],
  parsing: false,

  loadFromJson: (json, sourceName) => {
    set({ parsing: true });
    const result = parseViaDefinition(json);
    if (!result.ok || !result.definition) {
      set({ parsing: false, issues: result.issues });
      useDebugStore.getState().pushWarning({
        level: 'warn',
        title: '定义文件解析失败',
        detail: result.issues.map((i) => `${i.path}：${i.message}`).join('；') || '未知原因',
      });
      return { ok: false, issues: result.issues };
    }
    const definition = result.definition;
    // Custom 键码必须由定义文件动态注入，代码中不得出现任何具体键名（A5 / 铁律 3）
    KeycodeTable.registerCustom(definition.customKeycodes);
    set({ definition, sourceName: sourceName ?? definition.name, issues: result.issues, parsing: false });
    return { ok: true, issues: result.issues };
  },

  clear: () => {
    KeycodeTable.resetCustom();
    set({ definition: null, sourceName: null, issues: [], parsing: false });
  },
}));

/** 左侧导航的固定入口 + 来自定义文件的动态菜单项。 */
export function selectMenuNavItems(definition: ParsedDefinition | null): MenuNavItem[] {
  if (!definition) return [];
  return definition.menus.map((menu) => ({
    id: menu.id,
    label: menu.label,
    controlCount: menu.controls.length,
    category: menu.category,
  }));
}
