// 快捷键体系（T06-9）：注册、动作与帮助面板共用同一份 HOTKEY_ENTRIES（同源）。
//
// 设计：
//   - 组合与显示标签由 @/shared/platform.makeHotkey 同源生成；
//   - 动作直接驱动既有 store（menuSaveAll / undoLast / setCurrentPanel）；
//   - 输入框聚焦时不抢无修饰键的数字键（有修饰键的 ⌘S / ⌘Z 全局可用）；
//   - 帮助面板（TopBar 入口 + ⌘/ ）从 HOTKEY_ENTRIES 渲染，永不与注册漂移。
import { useEffect } from 'react';
import { matchesHotkey, makeHotkey, type HotkeyDef } from '@/shared/platform';
import { useMenuStore } from '@/store/useMenuStore';
import { useDeviceStore } from '@/store/useDeviceStore';
import { useUiStore, type PanelId } from '@/store/useUiStore';
import { toast } from '@/ui/primitives/Toast';

// —— 平台固定栏目：与 SideNav 固定导航一致的顺序（导航结构词，非设备特征） ——
const PANEL_ORDER: readonly { readonly panel: PanelId; readonly label: string }[] = [
  { panel: 'keymap', label: '键位图' },
  { panel: 'layout', label: '布局' },
  { panel: 'debug', label: '调试' },
  { panel: 'menu', label: '菜单' },
  { panel: 'backup', label: '备份' },
  { panel: 'device', label: '设备' },
  { panel: 'macros', label: '宏' },
];

const SAVE_HOTKEY: HotkeyDef = makeHotkey('save-all', 's');
const UNDO_HOTKEY: HotkeyDef = makeHotkey('undo', 'z');
const HELP_HOTKEY: HotkeyDef = makeHotkey('help', '/');

/** 数字键 1..7 切换面板：无修饰键的裸键（输入框聚焦时不抢）。 */
const PANEL_HOTKEYS: readonly {
  readonly panel: PanelId;
  readonly label: string;
  readonly def: HotkeyDef;
}[] = PANEL_ORDER.map((entry, index) => ({
  ...entry,
  def: makeHotkey(`panel-${index + 1}`, String(index + 1), { meta: false, ctrl: false }),
}));

export interface HotkeyEntry {
  readonly def: HotkeyDef;
  readonly description: string;
}

/** 全量快捷键清单：注册与帮助面板共用（同源，防漂移）。 */
export const HOTKEY_ENTRIES: readonly HotkeyEntry[] = [
  { def: SAVE_HOTKEY, description: '保存全部改动（无改动时提示）' },
  { def: UNDO_HOTKEY, description: '撤销最近一次变更' },
  ...PANEL_HOTKEYS.map((entry) => ({ def: entry.def, description: `切换到「${entry.label}」面板` })),
  { def: HELP_HOTKEY, description: '显示快捷键帮助' },
];

/** ⌘/Ctrl+S：菜单脏值落设备并逐地址持久化；无脏值时 no-op 提示。 */
async function handleSaveAll(): Promise<void> {
  if (useMenuStore.getState().dirty.size === 0) {
    toast.info('没有需要保存的更改');
    return;
  }
  const saved = await useDeviceStore.getState().menuSaveAll();
  if (saved > 0) toast.success(`已保存 ${saved} 项`);
  else toast.error(useDeviceStore.getState().error ?? '保存失败');
}

/** ⌘/Ctrl+Z：撤销会话内最近一次变更（undo 栈为空时提示）。 */
async function handleUndo(): Promise<void> {
  if (useDeviceStore.getState().undoDepth() === 0) {
    toast.info('没有可撤销的变更');
    return;
  }
  const ok = await useDeviceStore.getState().undoLast();
  if (ok) toast.success('已撤销');
  else toast.error(useDeviceStore.getState().error ?? '撤销失败');
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

/** 全局键盘处理：命中即消费（preventDefault），未命中放行。 */
function onKeyDown(event: KeyboardEvent): void {
  if (matchesHotkey(event, HELP_HOTKEY)) {
    event.preventDefault();
    useUiStore.getState().setHotkeyHelpOpen(true);
    return;
  }
  if (matchesHotkey(event, SAVE_HOTKEY)) {
    event.preventDefault();
    void handleSaveAll();
    return;
  }
  if (matchesHotkey(event, UNDO_HOTKEY)) {
    event.preventDefault();
    void handleUndo();
    return;
  }
  // 数字键是无修饰键的裸键：输入框聚焦时绝不抢（否则没法正常打数字）
  if (isEditableTarget(event.target)) return;
  for (const entry of PANEL_HOTKEYS) {
    if (matchesHotkey(event, entry.def)) {
      event.preventDefault();
      useUiStore.getState().setCurrentPanel(entry.panel);
      return;
    }
  }
}

/** 挂载全局快捷键监听（AppShell 挂一次即可；SSR / 测试无 window 时为 no-op）。 */
export function useHotkeys(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
