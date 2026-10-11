// 键码搜索：按常量名与显示名模糊匹配。
import { Search, X } from 'lucide-react';

export interface KeycodeSearchProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export function KeycodeSearch({ value, onChange }: KeycodeSearchProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5 rounded-card border border-border bg-elevated px-2">
      <Search size={13} className="text-fg-dim" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="搜索键码，如 LCTL / MO_1 / Enter"
        className="h-7 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fg-dim"
      />
      {value !== '' ? (
        <button type="button" onClick={() => onChange('')} aria-label="清空搜索" className="text-fg-dim hover:text-fg">
          <X size={13} />
        </button>
      ) : null}
    </div>
  );
}
