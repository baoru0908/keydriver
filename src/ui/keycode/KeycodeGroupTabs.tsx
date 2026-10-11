// 键码分组 Tab：分组名与条目全部来自 KeycodeTable（Custom 由定义文件动态注入）。
import type { KeycodeGroupDef, KeycodeGroupId } from '@/keycodes/types';
import { cn } from '@/shared/cn';

export interface KeycodeGroupTabsProps {
  readonly groups: readonly KeycodeGroupDef[];
  readonly active: KeycodeGroupId;
  readonly onChange: (group: KeycodeGroupId) => void;
}

export function KeycodeGroupTabs({ groups, active, onChange }: KeycodeGroupTabsProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-1">
      {groups
        .filter((g) => g.id !== 'any')
        .map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onChange(g.id)}
            className={cn(
              'rounded px-2 py-1 text-[11px] transition-colors',
              g.id === active ? 'bg-accent text-bg' : 'bg-elevated text-fg-muted hover:text-fg',
            )}
          >
            {g.label}
            <span className="ml-1 opacity-60">{g.items.length}</span>
          </button>
        ))}
    </div>
  );
}
