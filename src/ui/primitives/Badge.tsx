// 徽标（T06-5）：语义色 + soft 底档（design-tokens.md §5 / §0），替代散落的软色小标签。
import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/shared/cn';

const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-caption',
  {
    variants: {
      tone: {
        neutral: 'bg-elevated text-fg-muted',
        accent: 'bg-accent-soft text-accent',
        success: 'bg-success-soft text-success',
        info: 'bg-info-soft text-info',
        warn: 'bg-warn-soft text-warn',
        danger: 'bg-danger-soft text-danger',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps): React.JSX.Element {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
