// 卡片容器（T06-5）：统一收编各面板重复的 `rounded-card border bg-surface p-*` 类串。
// variant：default（平铺表面）/ elevated（抬升块，e2 阴影，design-tokens.md §3.1）。
import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/shared/cn';

const cardVariants = cva('rounded-card border border-border', {
  variants: {
    variant: {
      default: 'bg-surface',
      elevated: 'bg-elevated shadow-e2',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, variant, ...props }: CardProps): React.JSX.Element {
  return <div className={cn(cardVariants({ variant }), className)} {...props} />;
}
