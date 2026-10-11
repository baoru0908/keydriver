// toggle 控件：布尔开关（值非零即真）。
import type { ControlSpec } from '@/definition/schema';
import { Switch } from '@/ui/primitives/Switch';
import { useControlValue } from '@/store/useMenuStore';
import { useDeviceStore } from '@/store/useDeviceStore';

export interface ToggleControlProps {
  readonly control: ControlSpec;
  readonly disabled?: boolean;
}

export function ToggleControl({ control, disabled }: ToggleControlProps): React.JSX.Element {
  const value = useControlValue(control);
  const menuCommit = useDeviceStore((s) => s.menuCommit);
  const checked = (value & 0xff) !== 0;

  return (
    <div className="flex items-center justify-end">
      <Switch
        checked={checked}
        disabled={disabled}
        ariaLabel={control.label || control.valueKey}
        onCheckedChange={(next) => void menuCommit(control, next ? 1 : 0)}
      />
    </div>
  );
}
