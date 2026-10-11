// 键码分组定义：id / 显示名 / 排序。Custom 分组由定义文件动态注入（架构 A5 / §8.10）。
import type { KeycodeGroupDef, KeycodeGroupId } from './types';

export const KEYCODE_GROUPS: readonly Omit<KeycodeGroupDef, 'items'>[] = [
  { id: 'basic', label: '基础键', order: 10 },
  { id: 'layers', label: '层操作', order: 20 },
  { id: 'modtap', label: 'Mod-Tap', order: 30 },
  { id: 'media', label: '多媒体', order: 40 },
  { id: 'lighting', label: '灯光', order: 50 },
  { id: 'quantum', label: '特殊', order: 60 },
  { id: 'macro', label: '宏', order: 70 },
  { id: 'custom', label: '自定义', order: 80 },
  { id: 'any', label: 'Any', order: 90 },
];

export function groupLabel(id: KeycodeGroupId): string {
  return KEYCODE_GROUPS.find((g) => g.id === id)?.label ?? id;
}

export function groupOrder(id: KeycodeGroupId): number {
  return KEYCODE_GROUPS.find((g) => g.id === id)?.order ?? 999;
}
