// button 控件：一次性动作。options 字节原样透传（含那个 [1]）。
//
// ⚠️ 全部 button 一律二次确认——它们都是设备侧不可逆动作（刷机 / 复位 / 校准 / 保存阈值）。
// 这里不做「按标签关键字判断」，因为标签来自定义文件、随键盘而变，关键字判定会漏；
// 统一确认是零硬编码且不会漏判的做法。
import { useState } from 'react';
import { Play } from 'lucide-react';
import type { ControlSpec } from '@/definition/schema';
import { Button } from '@/ui/primitives/Button';
import { ConfirmDialog } from '@/ui/primitives/ConfirmDialog';
import { toast } from '@/ui/primitives/Toast';
import { useDeviceStore } from '@/store/useDeviceStore';

export interface ButtonControlProps {
  readonly control: ControlSpec;
  readonly disabled?: boolean;
}

/** 动作参数的可读形式：`[1]` / `[0]` / `[]`（无 options 时透传空数组）。 */
function describeArgs(control: ControlSpec): string {
  if (control.options.kind !== 'action') return '[]';
  return `[${control.options.args.join(', ')}]`;
}

export function ButtonControl({ control, disabled }: ButtonControlProps): React.JSX.Element {
  const menuTrigger = useDeviceStore((s) => s.menuTrigger);
  const busy = useDeviceStore((s) => s.busy);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const run = async (): Promise<void> => {
    const ok = await menuTrigger(control);
    if (ok) toast.success(`已执行：${control.label || control.valueKey}`);
    else toast.error(useDeviceStore.getState().error ?? '动作执行失败');
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <span
        className="font-mono text-[10px] text-fg-dim"
        title="下发到设备的参数字节，原样取自定义文件的 options"
      >
        {describeArgs(control)}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || busy}
        onClick={() => setConfirmOpen(true)}
        aria-label={control.label || control.valueKey}
      >
        <Play size={12} />
        执行
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        danger
        title="确认执行该动作？"
        description={`「${control.label || control.valueKey}」会立即下发到设备并生效，且不可撤销。参数字节：${describeArgs(control)}`}
        confirmLabel="执行"
        onConfirm={() => void run()}
      />
    </div>
  );
}
