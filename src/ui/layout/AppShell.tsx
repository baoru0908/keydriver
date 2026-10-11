// 四区栅格骨架：顶部设备栏 / 左侧导航 / 中央工作区 / 右侧面板 + 底部状态栏。
// T02 感知性能：重面板用 React.lazy 分包，配合 Suspense 轻量占位，减小首屏体积。
import { Suspense, lazy } from 'react';
import { useUiStore } from '@/store/useUiStore';
import { TopBar } from './TopBar';
import { SideNav } from './SideNav';
import { StatusBar } from './StatusBar';
import { KeycodePanel } from '@/ui/keycode/KeycodePanel';

// 重面板懒加载（各自独立 chunk，首屏只加载当前面板）。
const KeymapPanel = lazy(() =>
  import('@/ui/keymap/KeymapPanel').then((m) => ({ default: m.KeymapPanel })),
);
const LayoutOptionsBar = lazy(() =>
  import('@/ui/keymap/LayoutOptionsBar').then((m) => ({ default: m.LayoutOptionsBar })),
);
const DebugPanel = lazy(() =>
  import('@/ui/debug/DebugPanel').then((m) => ({ default: m.DebugPanel })),
);
const MenuPane = lazy(() => import('@/ui/menu/MenuPane').then((m) => ({ default: m.MenuPane })));
const MacrosPanel = lazy(() =>
  import('@/ui/macro/MacrosPanel').then((m) => ({ default: m.MacrosPanel })),
);
const BackupPanel = lazy(() =>
  import('@/ui/io/BackupPanel').then((m) => ({ default: m.BackupPanel })),
);
const DefinitionDropzone = lazy(() =>
  import('@/ui/io/DefinitionDropzone').then((m) => ({ default: m.DefinitionDropzone })),
);
const DevicePanel = lazy(() =>
  import('@/ui/device/DevicePanel').then((m) => ({ default: m.DevicePanel })),
);

/** 面板级懒加载占位（T03-5/P1 将升级为 Skeleton 骨架屏，此处先用轻量 placeholder）。 */
function PanelFallback(): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center text-xs text-fg-dim">
      <span className="animate-fade">加载中…</span>
    </div>
  );
}

export interface AppShellProps {
  readonly onImportDefinition: () => void;
}

export function AppShell({ onImportDefinition }: AppShellProps): React.JSX.Element {
  const currentPanel = useUiStore((s) => s.currentPanel);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const keycodePanelOpen = useUiStore((s) => s.keycodePanelOpen);

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg text-fg">
      <TopBar onImportDefinition={onImportDefinition} />
      <div className="flex min-h-0 flex-1">
        {sidebarOpen ? <SideNav /> : null}
        <main className="min-w-0 flex-1 overflow-auto p-4">
          <Suspense fallback={<PanelFallback />}>
            {currentPanel === 'keymap' ? <KeymapPanel /> : null}
            {currentPanel === 'layout' ? <LayoutOptionsBar full /> : null}
            {currentPanel === 'debug' ? <DebugPanel embedded /> : null}
            {currentPanel === 'menu' ? <MenuPane /> : null}
            {currentPanel === 'backup' ? (
              <div className="flex flex-col gap-3">
                <BackupPanel />
                <DefinitionDropzone />
              </div>
            ) : null}
            {currentPanel === 'device' ? <DevicePanel /> : null}
            {currentPanel === 'macros' ? <MacrosPanel /> : null}
          </Suspense>
        </main>
        {keycodePanelOpen && (currentPanel === 'keymap' || currentPanel === 'menu') ? (
          <aside className="w-80 shrink-0 border-l border-border bg-surface">
            <KeycodePanel />
          </aside>
        ) : null}
      </div>
      <StatusBar />
    </div>
  );
}
