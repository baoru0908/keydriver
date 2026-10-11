// 通用按钮：variant / size 由 CVA 管理，键盘可操作。
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/shared/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-card font-medium transition-[background-color,color,box-shadow,transform] duration-fast ease-standard active:scale-[0.97] active:brightness-95 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-bg hover:bg-accent-strong',
        secondary: 'bg-elevated text-fg hover:bg-border',
        ghost: 'text-fg-muted hover:bg-elevated hover:text-fg',
        danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-bg',
        outline: 'border border-border-strong text-fg hover:bg-elevated',
      },
      size: {
        sm: 'h-6 px-2 text-[11px]',
        md: 'h-7 px-2.5 text-xs',
        lg: 'h-9 px-4 text-sm',
        icon: 'h-7 w-7',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  readonly children?: ReactNode;
}

export function Button({ className, variant, size, type, ...props }: ButtonProps): React.JSX.Element {
  return (
    <button type={type ?? 'button'} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export { buttonVariants };
