// 菜单面板：菜单 Tab（来自定义文件）+ 懒加载进度 + 生成器 + 保存栏。
import { useEffect, useMemo } from 'react';
import { FileJson, Usb } from 'lucide-react';
import { useDefinitionStore } from '@/store/useDefinitionStore';
import { useDeviceStore } from '@/store/useDeviceStore';
import { useMenuStore } from '@/store/useMenuStore';
import { useUiStore } from '@/store/useUiStore';
import { Button } from '@/ui/primitives/Button';
import { ProgressBar } from '@/ui/primitives/ProgressBar';
import { Card } from '@/ui/primitives/Card';
import { EmptyState } from '@/ui/primitives/EmptyState';
import { Skeleton, SkeletonGroup } from '@/ui/primitives/Skeleton';
import { ConnectBanner } from '@/ui/device/ConnectBanner';
import { DevicePicker } from '@/ui/device/DevicePicker';
import { useState } from 'react';
import { MenuGenerator } from './MenuGenerator';
import { SaveBar } from './SaveBar';
import { cn } from '@/shared/cn';

export function MenuPane(): React.JSX.Element {
  const definition = useDefinitionStore((s) => s.definition);
  const setImportDialogOpen = useUiStore((s) => s.setImportDialogOpen);
  const currentMenuId = useUiStore((s) => s.currentMenuId);
  const openMenu = useUiStore((s) => s.openMenu);
  const connectionState = useDeviceStore((s) => s.state);
  const menuLoad = useDeviceStore((s) => s.menuLoad);
  const showIfContext = useMenuStore((s) => s.showIfContext);
  const status = useMenuStore((s) => s.status);
  const progress = useMenuStore((s) => s.progress);
  const loadedMenus = useMenuStore((s) => s.loadedMenus);
  const [pickerOpen, setPickerOpen] = useState(false);

  const menus = definition?.menus ?? [];
  const activeMenuId =
    currentMenuId && menus.some((m) => m.id === currentMenuId) ? currentMenuId : menus[0]?.id ?? null;
  const activeMenu = useMemo(
    () => menus.find((m) => m.id === activeMenuId) ?? null,
    [menus, activeMenuId],
  );
  // 官方 menu-generator.tsx :74/:96/:146 —— 数据未就绪时不渲染，
  // 否则会拿未初始化的值去做 showIf 判断，导致控件首屏闪现。
  const menuReady = activeMenuId !== null && loadedMenus.has(activeMenuId);

  // 打开菜单时懒加载全部控件值（含被 showIf 隐藏的，因为它们要当条件变量）
  useEffect(() => {
    if (!activeMenuId || connectionState !== 'connected') return;
    if (loadedMenus.has(activeMenuId)) return;
    void menuLoad(activeMenuId);
  }, [activeMenuId, connectionState, loadedMenus, menuLoad]);

  if (!definition) {
    return (
      <EmptyState
        icon={FileJson}
        title="尚未加载定义文件"
        description="请先导入一份 VIA V3 定义 JSON，所有菜单文案与控件都由它驱动。"
        action={
          <Button variant="primary" size="sm" onClick={() => setImportDialogOpen(true)}>
            导入定义
          </Button>
        }
      />
    );
  }

  const connected = connectionState === 'connected';

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1 border-b border-border pb-2">
        {menus.map((menu) => (
          <button
            key={menu.id}
            type="button"
            className={cn(
              'rounded-card px-2.5 py-1 text-xs transition-colors',
              menu.id === activeMenuId
                ? 'bg-accent-soft text-accent'
                : 'text-fg-muted hover:bg-elevated hover:text-fg',
            )}
            onClick={() => openMenu(menu.id)}
          >
            {menu.label}
            <span className="ml-1 text-[10px] text-fg-dim">{menu.controls.length}</span>
          </button>
        ))}
      </div>

      <ConnectBanner
        onImportDefinition={() => setImportDialogOpen(true)}
        onOpenDevicePicker={() => setPickerOpen(true)}
      />
      <DevicePicker open={pickerOpen} onOpenChange={setPickerOpen} />

      {connected && activeMenu ? (
        <>
          <SaveBar />
          {status === 'loading' ? (
            <ProgressBar value={progress} label={`正在读取 ${activeMenu.label} 的控件值…`} />
          ) : menuReady ? (
            <MenuGenerator menu={activeMenu} context={showIfContext} />
          ) : (
            <SkeletonGroup label={`正在加载 ${activeMenu.label}`} className="gap-3">
              <Skeleton variant="text" className="w-56" />
              <Skeleton variant="block" className="h-16" />
              <Skeleton variant="block" className="h-16" />
            </SkeletonGroup>
          )}
        </>
      ) : (
        <Card className="p-6">
          <EmptyState
            icon={Usb}
            title="未连接设备"
            description="连接设备后即可读写该菜单下的控件。"
            action={
              <Button variant="primary" size="sm" onClick={() => setPickerOpen(true)}>
                选择设备
              </Button>
            }
          />
        </Card>
      )}
    </div>
  );
}
