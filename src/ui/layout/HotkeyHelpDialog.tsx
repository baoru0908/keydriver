// 快捷键帮助弹窗（T06-9）：条目直接来自 HOTKEY_ENTRIES（注册同源，永不漂移）。
import { HOTKEY_ENTRIES } from '@/hooks/useHotkeys';
import { useUiStore } from '@/store/useUiStore';
import { Modal } from '@/ui/primitives/Modal';

export function HotkeyHelpDialog(): React.JSX.Element {
  const open = useUiStore((s) => s.hotkeyHelpOpen);
  const setOpen = useUiStore((s) => s.setHotkeyHelpOpen);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="键盘快捷键"
      description="标签随平台生成：macOS 显示 ⌘，Windows / Linux 显示 Ctrl。"
      width="max-w-sm"
    >
      <ul className="flex flex-col gap-2">
        {HOTKEY_ENTRIES.map((entry) => (
          <li key={entry.def.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0 flex-1 text-caption text-fg-muted">{entry.description}</span>
            <kbd className="shrink-0 rounded bg-elevated px-1.5 py-0.5 font-mono text-caption text-fg">
              {entry.def.label}
            </kbd>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
