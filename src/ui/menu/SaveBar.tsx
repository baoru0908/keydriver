// 保存栏：脏值计数、一键持久化（0x09）、撤销上一步、EEPROM 复位。
import { RotateCcw, Save, Undo2 } from 'lucide-react';
import { useMenuStore } from '@/store/useMenuStore';
import { useDeviceStore } from '@/store/useDeviceStore';
import { useUiStore } from '@/store/useUiStore';
import { Button } from '@/ui/primitives/Button';
import { ConfirmDialog } from '@/ui/primitives/ConfirmDialog';
import { toast } from '@/ui/primitives/Toast';
import { useState } from 'react';

export interface SaveBarProps {
  readonly disabled?: boolean;
}

export function SaveBar({ disabled }: SaveBarProps): React.JSX.Element {
  const dirtyCount = useMenuStore((s) => s.dirty.size);
  const menuSaveAll = useDeviceStore((s) => s.menuSaveAll);
  const undoLast = useDeviceStore((s) => s.undoLast);
  const deviceEepromReset = useDeviceStore((s) => s.deviceEepromReset);
  const busy = useDeviceStore((s) => s.busy);
  const openMenu = useUiStore((s) => s.openMenu);
  const currentMenuId = useUiStore((s) => s.currentMenuId);
  const [resetOpen, setResetOpen] = useState(false);

  const onSave = async (): Promise<void> => {
    const n = await menuSaveAll();
    if (n > 0) toast.success(`已保存 ${n} 个地址到键盘`);
    else toast.info('没有待保存的改动');
  };

  const onUndo = async (): Promise<void> => {
    const ok = await undoLast();
    if (!ok) toast.info('没有可撤销的改动');
  };

  const onReset = async (): Promise<void> => {
    const ok = await deviceEepromReset();
    if (ok && currentMenuId) openMenu(currentMenuId);
    if (ok) toast.success('EEPROM 已复位');
    else toast.error(useDeviceStore.getState().error ?? '复位失败');
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface px-3 py-2">
      <span className="text-xs text-fg-muted">
        {dirtyCount > 0 ? `${dirtyCount} 个控件待保存` : '全部已保存'}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" disabled={disabled || busy} onClick={() => void onUndo()}>
          <Undo2 size={12} />
          撤销
        </Button>
        <Button
          variant={dirtyCount > 0 ? 'primary' : 'secondary'}
          size="sm"
          disabled={disabled || busy}
          onClick={() => void onSave()}
        >
          <Save size={12} />
          保存到键盘
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={disabled || busy}
          onClick={() => setResetOpen(true)}
        >
          <RotateCcw size={12} />
          EEPROM 复位
        </Button>
      </div>
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        danger
        title="确认复位 EEPROM？"
        description="键盘上保存的全部自定义配置会被清除并恢复固件默认值。建议先导出备份。"
        confirmLabel="复位"
        onConfirm={() => void onReset()}
      />
    </div>
  );
}
