// 布局选项栏：labels ↔ 32 位 bitfield，开关用 Switch、n 选用 Select（文案全部来自定义文件）。
//
// ⚠️ 用 Switch 还是 Select 由 group.kind 决定（来自 labels 的形态：string → toggle，string[] → select），
// 不能再用 options.length 猜测 —— 否则「2 个选项的 n 选组」会被误降级成开关，选项名永远不显示。
import { useDefinitionStore } from '@/store/useDefinitionStore';
import { useDeviceStore } from '@/store/useDeviceStore';
import { getOption, setOption } from '@/definition/LayoutOptions';
import type { LayoutOptionGroup } from '@/definition/schema';
import { Switch } from '@/ui/primitives/Switch';
import { Select } from '@/ui/primitives/Select';
import { toast } from '@/ui/primitives/Toast';

export interface LayoutOptionsBarProps {
  /** 独立展示（布局面板）时竖排并带标题 */
  readonly full?: boolean;
}

export function LayoutOptionsBar({ full = false }: LayoutOptionsBarProps): React.JSX.Element {
  const definition = useDefinitionStore((s) => s.definition);
  const layoutOptions = useDeviceStore((s) => s.layoutOptions);
  const applyLayoutOptions = useDeviceStore((s) => s.applyLayoutOptions);

  const groups = definition?.layoutLabels ?? [];

  if (groups.length === 0) {
    return full ? <p className="text-xs text-fg-dim">当前定义文件没有布局选项</p> : <></>;
  }

  const handleChange = (index: number, option: number): void => {
    const next = setOption(groups, layoutOptions, index, option);
    void applyLayoutOptions(next).then(() => {
      const value = useDeviceStore.getState().layoutOptions;
      if (value !== next) toast.error('布局选项写入失败');
    });
  };

  /** 按组的形态渲染控件：toggle → Switch，select → Select（选项名全部来自定义文件）。 */
  const renderControl = (group: LayoutOptionGroup, selectWidthClass: string): React.JSX.Element =>
    group.kind === 'toggle' ? (
      <Switch
        checked={getOption(groups, layoutOptions, group.index) !== 0}
        ariaLabel={group.label}
        onCheckedChange={(checked) => handleChange(group.index, checked ? 1 : 0)}
      />
    ) : (
      <div className={selectWidthClass}>
        <Select
          value={getOption(groups, layoutOptions, group.index)}
          ariaLabel={group.label}
          options={group.options.map((option, i) => ({ label: option, value: i }))}
          onChange={(value) => handleChange(group.index, value)}
        />
      </div>
    );

  if (full) {
    return (
      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3">
        <h1 className="text-sm font-medium text-fg">布局</h1>
        <p className="text-[11px] text-fg-dim">
          layout_options = {layoutOptions}（0x{layoutOptions.toString(16).toUpperCase()}）
        </p>
        {groups.map((group) => (
          <label key={group.index} className="flex items-center justify-between gap-3">
            <span className="text-xs text-fg">{group.label}</span>
            {renderControl(group, 'w-40')}
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {groups.map((group) => (
        <div key={group.index} className="flex items-center gap-1.5">
          <span className="text-[11px] text-fg-muted">{group.label}</span>
          {renderControl(group, 'w-32')}
        </div>
      ))}
    </div>
  );
}
