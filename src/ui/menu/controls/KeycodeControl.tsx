// keycode 控件：显示当前键码名，点击后把右侧键码面板的目标切到本控件（复用已做好的 KeycodePanel）。
import type { ControlSpec } from '@/definition/schema';
import { format } from '@/keycodes/KeycodeFormatter';
import { toHex16 } from '@/shared/hex';
import { useControlValue } from '@/store/useMenuStore';
import { useUiStore } from '@/store/useUiStore';
import { Button } from '@/ui/primitives/Button';

export interface KeycodeControlProps {
  readonly control: ControlSpec;
  readonly disabled?: boolean;
}

export function KeycodeControl({ control, disabled }: KeycodeControlProps): React.JSX.Element {
  const value = useControlValue(control);
  const requestKeycode = useUiStore((s) => s.requestKeycode);
  const keycodeTarget = useUiStore((s) => s.keycodeTarget);
  const active = keycodeTarget === control.id;

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="font-mono text-[10px] text-fg-dim">{toHex16(value)}</span>
      <Button
        variant={active ? 'primary' : 'outline'}
        size="sm"
        disabled={disabled}
        onClick={() => requestKeycode(control.id)}
        title={active ? '已在右侧键码面板中选键' : '点击后在右侧键码面板选键'}
      >
        {format(value & 0xffff)}
      </Button>
    </div>
  );
}
