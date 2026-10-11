// 空状态原语（design-tokens.md §7.1）：
// 图标（fg-dim 40px）→ 标题（title/fg）→ 描述（caption/fg-muted，max-width 280px）→ 可选主操作。
// a11y：容器 role="status"；图标 aria-hidden。垂直留白 = spacing-8（py-10）。
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/cn';

export interface EmptyStateProps {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description?: string;
  /** 可选主操作按钮（primary），由调用方组装语义。 */
  readonly action?: ReactNode;
  readonly className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps): React.JSX.Element {
  return (
    <div
      role="status"
      className={cn(
        'flex min-h-40 flex-col items-center justify-center gap-2 px-6 py-10 text-center',
        className,
      )}
    >
      <Icon size={40} aria-hidden className="text-fg-dim" />
      <p className="text-title text-fg">{title}</p>
      {description ? (
        <p className="max-w-[280px] text-caption text-fg-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
