// 键码网格：CSS Grid 渲染（≤500 节点无需虚拟化，架构 R8）。
import type { KeycodeDef } from '@/keycodes/types';
import { toHex16Short } from '@/shared/hex';
import { cn } from '@/shared/cn';

export interface KeycodeGridProps {
  readonly items: readonly KeycodeDef[];
  readonly activeCode: number | null;
  readonly onPick: (def: KeycodeDef) => void;
}

export function KeycodeGrid({ items, activeCode, onPick }: KeycodeGridProps): React.JSX.Element {
  if (items.length === 0) {
    return <p className="py-6 text-center text-[11px] text-fg-dim">没有匹配的键码</p>;
  }
  return (
    <div className="grid grid-cols-3 gap-1">
      {items.map((def) => (
        <button
          key={`${def.group}-${def.code}-${def.name}`}
          type="button"
          onClick={() => onPick(def)}
          className={cn(
            'flex flex-col items-start rounded-card border px-1.5 py-1 text-left transition-colors',
            def.code === activeCode
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-border bg-elevated text-fg hover:border-border-strong',
          )}
          title={`${def.name} · 0x${toHex16Short(def.code)}`}
        >
          <span className="max-w-full truncate text-[11px]">{def.label}</span>
          <span className="font-mono text-[10px] text-fg-dim">{toHex16Short(def.code)}</span>
        </button>
      ))}
    </div>
  );
}
