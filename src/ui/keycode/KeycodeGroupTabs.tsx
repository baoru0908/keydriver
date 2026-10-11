// 键码分组 Tab（T06-5）：分组名与条目全部来自 KeycodeTable（Custom 由定义文件动态注入）。
// 行为层交给 Radix Tabs（无手搓 tab 逻辑）；外观走令牌，选中态由 data-state 驱动。
import type { KeycodeGroupDef, KeycodeGroupId } from '@/keycodes/types';
import { Tabs, TabsList, TabsTrigger } from '@/ui/primitives/Tabs';

export interface KeycodeGroupTabsProps {
  readonly groups: readonly KeycodeGroupDef[];
  readonly active: KeycodeGroupId;
  readonly onChange: (group: KeycodeGroupId) => void;
}

export function KeycodeGroupTabs({ groups, active, onChange }: KeycodeGroupTabsProps): React.JSX.Element {
  return (
    <Tabs value={active} onValueChange={(value) => onChange(value as KeycodeGroupId)}>
      <TabsList>
        {groups
          .filter((g) => g.id !== 'any')
          .map((g) => (
            <TabsTrigger key={g.id} value={g.id} title={g.label}>
              {g.label}
              <span className="ml-1 opacity-60">{g.items.length}</span>
            </TabsTrigger>
          ))}
      </TabsList>
    </Tabs>
  );
}
