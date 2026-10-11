// 错误状态原语（design-tokens.md §7.3）：
// AlertTriangle（danger 40px）→ 标题（title/fg）→ 描述（caption/fg-muted）
// → 可选详情（caption/fg-dim，等宽字体展示错误码/原因）→ 重试按钮（secondary）。
// a11y：容器 role="alert" + aria-live="assertive"；重试按钮键盘可达（Button 自带焦点环）。
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/shared/cn';

export interface ErrorStateProps {
  readonly title?: string;
  readonly description?: string;
  /** 可选详情（错误码 / 字段级原因），等宽字体展示。 */
  readonly detail?: string;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  readonly className?: string;
}

export function ErrorState({
  title = '操作失败',
  description,
  detail,
  onRetry,
  retryLabel = '重试',
  className,
}: ErrorStateProps): React.JSX.Element {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'flex min-h-40 flex-col items-center justify-center gap-2 px-6 py-8 text-center',
        className,
      )}
    >
      <AlertTriangle size={40} aria-hidden className="text-danger" />
      <p className="text-title text-fg">{title}</p>
      {description ? (
        <p className="max-w-[280px] text-caption text-fg-muted">{description}</p>
      ) : null}
      {detail ? (
        <p className="max-w-[280px] break-all font-mono text-caption text-fg-dim">{detail}</p>
      ) : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
