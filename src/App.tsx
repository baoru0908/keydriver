// 根组件：主题应用 + 启动引导（恢复上次定义） + 挂载四区骨架与全局提示层。
import { useEffect, useState } from 'react';
import { AppShell } from '@/ui/layout/AppShell';
import { ToastHost } from '@/ui/primitives/Toast';
import { DefinitionImportDialog } from '@/ui/io/DefinitionImportDialog';
import { useUiStore } from '@/store/useUiStore';
import { useDefinitionStore } from '@/store/useDefinitionStore';
import { loadRecentDefinition } from '@/definition/DefinitionRepository';
import { useDeviceStore } from '@/store/useDeviceStore';
import { useMenuStore } from '@/store/useMenuStore';

export default function App(): React.JSX.Element {
  const theme = useUiStore((s) => s.theme);
  const [importOpen, setImportOpen] = useState(false);
  const definition = useDefinitionStore((s) => s.definition);

  // 主题落到 <html> 上，深浅切换由 CSS 变量覆盖实现（T03-3：.theme-dark / .theme-light）
  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', theme === 'dark');
    document.documentElement.classList.toggle('theme-light', theme === 'light');
  }, [theme]);

  // 启动时恢复上次使用的定义文件（IndexedDB）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const record = await loadRecentDefinition();
        if (cancelled || !record) return;
        if (useDefinitionStore.getState().definition) return;
        useDefinitionStore.getState().loadFromJson(record.raw, record.meta.name);
      } catch {
        // 恢复失败不阻断启动，用户可手工导入
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 定义文件变化时：重建「地址 → controlId[]」索引（快捷入口双向同步的前提），并刷新设备列表
  useEffect(() => {
    useMenuStore.getState().indexControls(definition);
    void useDeviceStore.getState().refreshDevices();
  }, [definition]);

  return (
    <>
      <AppShell onImportDefinition={() => setImportOpen(true)} />
      <DefinitionImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ToastHost />
    </>
  );
}
