// 菜单面板占位：菜单引擎（T04）实现前给出明确说明，不做半成品渲染。
import { useDefinitionStore } from '@/store/useDefinitionStore';
import { countGroupNodes } from '@/definition/DefinitionParser';

export function PanelPlaceholder(): React.JSX.Element {
  const definition = useDefinitionStore((s) => s.definition);

  if (!definition) {
    return (
      <div className="rounded-card border border-border bg-surface p-6 text-xs text-fg-muted">
        请先导入定义文件。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-6">
      <h1 className="text-sm font-medium text-fg">自定义菜单</h1>
      <p className="text-xs text-fg-muted">
        定义文件已解析出 {definition.menus.length} 个顶层菜单 / {countGroupNodes(definition)} 个分组 /{' '}
        {definition.controls.length} 个控件。菜单引擎与 6 类控件渲染在下一阶段（T04）实现。
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {definition.menus.map((menu) => (
          <li key={menu.id} className="flex items-center gap-2 text-xs text-fg-muted">
            <span className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-fg-dim">
              {menu.id}
            </span>
            <span className="flex-1 truncate">{menu.label}</span>
            <span className="text-fg-dim">{menu.controls.length} 个控件</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
