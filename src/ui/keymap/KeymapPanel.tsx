// 键位面板容器：连接引导 + 层切换器 + 布局选项栏 + 键位画布。
import { useState } from 'react';
import { useDefinitionStore } from '@/store/useDefinitionStore';
import { useUiStore } from '@/store/useUiStore';
import { ConnectBanner } from '@/ui/device/ConnectBanner';
import { DevicePicker } from '@/ui/device/DevicePicker';
import { LayerSwitcher } from './LayerSwitcher';
import { LayoutOptionsBar } from './LayoutOptionsBar';
import { KeymapCanvas } from './KeymapCanvas';
import { useDeviceStore } from '@/store/useDeviceStore';

export function KeymapPanel(): React.JSX.Element {
  const definition = useDefinitionStore((s) => s.definition);
  const setImportDialogOpen = useUiStore((s) => s.setImportDialogOpen);
  const state = useDeviceStore((s) => s.state);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-medium text-fg">键位</h1>
        {definition ? (
          <span className="text-[11px] text-fg-dim">
            {definition.matrix.rows} × {definition.matrix.cols} 矩阵 · {definition.allKeys.length} 个键位条目
          </span>
        ) : null}
        <span className="ml-auto text-[11px] text-fg-dim">
          点击键位选中 → 右侧键码面板选新键码，写入后自动回读校验
        </span>
      </div>

      <ConnectBanner
        onImportDefinition={() => setImportDialogOpen(true)}
        onOpenDevicePicker={() => setPickerOpen(true)}
      />
      <DevicePicker open={pickerOpen} onOpenChange={setPickerOpen} />

      {definition && state === 'connected' ? (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-3 py-2">
            <LayerSwitcher />
            <div className="h-5 w-px bg-border" />
            <LayoutOptionsBar />
          </div>
          <KeymapCanvas />
        </>
      ) : null}
    </div>
  );
}
