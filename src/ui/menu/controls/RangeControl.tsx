// range 控件：下限取 options[0]（35 个控件下限是 1，写死 0 会越界），宽度由 ValueWidth 推断。
// 拖动属高频输入 → 走 200ms 防抖写入，不得把 EEPROM 写穿。
import type { ControlSpec } from '@/definition/schema';
import { Slider } from '@/ui/primitives/Slider';
import { describeWidth } from '@/core/protocol/ValueWidth';
import { useControlValue } from '@/store/useMenuStore';
import { useDeviceStore } from '@/store/useDeviceStore';

export interface RangeControlProps {
  readonly control: ControlSpec;
  readonly disabled?: boolean;
}

export function RangeControl({ control, disabled }: RangeControlProps): React.JSX.Element {
  const value = useControlValue(control);
  const menuCommit = useDeviceStore((s) => s.menuCommit);
  const range = control.options.kind === 'range' ? control.options : { min: 0, max: 255 };
  const min = range.min;
  const max = range.max;
  const clamped = Math.min(max, Math.max(min, value));

  return (
    <div className="flex w-full items-center gap-3">
      <div className="min-w-0 flex-1">
        <Slider
          value={clamped}
          min={min}
          max={max}
          disabled={disabled}
          ariaLabel={control.label || control.valueKey}
          onChange={(next) => void menuCommit(control, next)}
        />
      </div>
      <span
        className="shrink-0 font-mono text-[10px] text-fg-dim"
        title={`下限 ${min} / 上限 ${max} · ${describeWidth(control)}`}
      >
        {min}–{max}
      </span>
    </div>
  );
}
