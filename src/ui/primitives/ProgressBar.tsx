// 进度条：懒加载 / 导出导入进度展示。
import { cn } from '@/shared/cn';

export interface ProgressBarProps {
  readonly value: number;
  readonly max?: number;
  readonly label?: string;
  readonly className?: string;
}

export function ProgressBar({ value, max = 100, label, className }: ProgressBarProps): React.JSX.Element {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      {label ? <span className="w-32 shrink-0 truncate text-[11px] text-fg-muted">{label}</span> : (
        <span className="w-10 shrink-0 text-right font-mono text-[11px] text-fg-muted">
          {Math.round(percent)}%
        </span>
      )}
    </div>
  );
}
