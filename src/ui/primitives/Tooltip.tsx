// 文字提示：Radix Tooltip 包装（无业务语义，仅行为层）。
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

export interface TooltipProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
}

export function Tooltip({ label, children, side = 'bottom' }: TooltipProps): React.JSX.Element {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className="z-50 rounded bg-elevated px-2 py-1 text-[11px] text-fg shadow-lg"
          >
            {label}
            <TooltipPrimitive.Arrow className="fill-elevated" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
