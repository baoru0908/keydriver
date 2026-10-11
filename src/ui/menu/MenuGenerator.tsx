// 菜单生成器：把某菜单的根节点递归渲染为分组区块（名称与结构全部来自定义文件）。
//
// 可见性语义照搬官方 VIA（官方 menu-generator.tsx）：
//   · 菜单根级 showIf 不满足 → 整块不渲染；
//   · 分组 / 控件级 showIf 不满足 → 照样渲染，只是置灰 + 不可交互（**不隐藏**）；
//   · 一个菜单内全部顶层分组都不可用时 → 额外给出兜底文案（官方
//     "No features available for this firmware version."）。
import { useMemo } from 'react';
import type { MenuDef } from '@/definition/schema';
import { computeAvailability, NO_AVAILABLE_HINT } from './availability';
import { MenuSection } from './MenuSection';

export interface MenuGeneratorProps {
  readonly menu: MenuDef;
  readonly context: Readonly<Record<string, number>>;
  readonly disabled?: boolean;
}

export function MenuGenerator({ menu, context, disabled }: MenuGeneratorProps): React.JSX.Element {
  const availability = useMemo(
    () => computeAvailability(menu.root, context),
    [menu.root, context],
  );

  // 菜单根级条件不满足 → 整块不渲染（官方对整块 submenu 的处理）
  if (!availability.rootEnabled) return <></>;

  return (
    <div className="flex flex-col gap-2">
      {availability.children.length > 0 && !availability.hasAvailable ? (
        <div className="rounded-card border border-border bg-surface p-4 text-xs text-fg-dim">
          {NO_AVAILABLE_HINT}
        </div>
      ) : null}
      {availability.children.map((child) => (
        <MenuSection key={child.id} node={child} disabled={disabled} defaultOpen />
      ))}
    </div>
  );
}
