// dropdown 控件：支持两种 options 形态（解析层已统一归一化为 { label, value }[]）。
//   - string[]        → value = 下标
//   - [label, value][] → value = 显式值
import type { ControlSpec } from '@/definition/schema';
import { Select } from '@/ui/primitives/Select';
import { useControlValue } from '@/store/useMenuStore';
import { useDeviceStore } from '@/store/useDeviceStore';

export interface DropdownControlProps {
  readonly control: ControlSpec;
  readonly disabled?: boolean;
}

export function DropdownControl({ control, disabled }: DropdownControlProps): React.JSX.Element {
  const value = useControlValue(control);
  const menuCommit = useDeviceStore((s) => s.menuCommit);
  const items = control.options.kind === 'enum' ? control.options.items : [];

  if (items.length === 0) {
    return <span className="font-mono text-[11px] text-fg-dim">无选项</span>;
  }

  return (
    <div className="w-56">
      <Select
        value={value}
        options={items}
        disabled={disabled}
        ariaLabel={control.label || control.valueKey}
        onChange={(next) => void menuCommit(control, next)}
      />
    </div>
  );
}
