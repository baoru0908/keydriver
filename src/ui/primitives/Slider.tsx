// 滑块：Radix Slider 包装，支持数值气泡与键盘操作。
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/shared/cn';

export interface SliderProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly disabled?: boolean;
  readonly onChange: (value: number) => void;
  readonly ariaLabel?: string;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
  ariaLabel,
}: SliderProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <SliderPrimitive.Root
        className={cn('relative flex h-4 w-full touch-none items-center', disabled && 'opacity-50')}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={ariaLabel}
        onValueChange={(next) => onChange(next[0] ?? min)}
      >
        <SliderPrimitive.Track className="relative h-1 w-full grow rounded-full bg-border">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-accent" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block h-3.5 w-3.5 rounded-full border-2 border-accent bg-surface transition-colors hover:bg-accent-soft" />
      </SliderPrimitive.Root>
      <span className="w-12 shrink-0 text-right font-mono text-xs text-fg-muted">{value}</span>
    </div>
  );
}
