// 控件分发器：按 control.type 选择对应渲染器（6 类全覆盖，架构 T04.2）。
import type { ControlSpec } from '@/definition/schema';
import { DropdownControl } from './controls/DropdownControl';
import { RangeControl } from './controls/RangeControl';
import { ToggleControl } from './controls/ToggleControl';
import { ButtonControl } from './controls/ButtonControl';
import { ColorControl } from './controls/ColorControl';
import { KeycodeControl } from './controls/KeycodeControl';

export interface ControlRendererProps {
  readonly control: ControlSpec;
  readonly disabled?: boolean;
}

export function ControlRenderer({ control, disabled }: ControlRendererProps): React.JSX.Element {
  switch (control.type) {
    case 'toggle':
      return <ToggleControl control={control} disabled={disabled} />;
    case 'dropdown':
      return <DropdownControl control={control} disabled={disabled} />;
    case 'range':
      return <RangeControl control={control} disabled={disabled} />;
    case 'button':
      return <ButtonControl control={control} disabled={disabled} />;
    case 'color':
      return <ColorControl control={control} disabled={disabled} />;
    case 'keycode':
      return <KeycodeControl control={control} disabled={disabled} />;
    default:
      return <span className="font-mono text-[11px] text-danger">未知类型</span>;
  }
}
