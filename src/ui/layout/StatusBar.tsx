// 底部状态栏：连接/写入状态、最近一条报文摘要、脏计数、告警入口。
import { Activity, AlertTriangle, CheckCircle2, Loader2, Terminal } from 'lucide-react';
import { useDeviceStore } from '@/store/useDeviceStore';
import { useDebugStore } from '@/store/useDebugStore';
import { useKeymapStore } from '@/store/useKeymapStore';
import { useMenuStore } from '@/store/useMenuStore';
import { useUiStore } from '@/store/useUiStore';
import { Button } from '@/ui/primitives/Button';
import { shouldShowConnectionInfo } from '@/ui/device/connectionInfo';

export function StatusBar(): React.JSX.Element {
  const state = useDeviceStore((s) => s.state);
  const error = useDeviceStore((s) => s.error);
  const busy = useDeviceStore((s) => s.busy);
  const lastFrame = useDebugStore((s) => s.frames[s.frames.length - 1]);
  const warningCount = useDebugStore((s) => s.warnings.length);
  const keymapDirty = useKeymapStore((s) => s.dirtyKeys.size);
  const menuDirty = useMenuStore((s) => s.dirty.size);
  const setCurrentPanel = useUiStore((s) => s.setCurrentPanel);

  const text =
    state === 'connected'
      ? busy
        ? '写入中…'
        : '就绪'
      : state === 'connecting'
        ? '连接中…'
        : state === 'error'
          ? (error ?? '连接错误')
          : state === 'lost'
            ? '设备已断开'
            : '未连接';

  const connected = shouldShowConnectionInfo(state);
  const gotoDebug = (): void => setCurrentPanel('debug');

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border bg-surface px-3 text-caption text-fg-muted">
      {connected ? (
        busy ? (
          <Loader2 size={12} className="animate-spin text-warn" />
        ) : (
          <CheckCircle2 size={12} className="text-accent" />
        )
      ) : state === 'lost' ? (
        <AlertTriangle size={12} className="text-danger" />
      ) : (
        <Activity size={12} />
      )}
      <span>{text}</span>

      {/* 最近一条报文摘要属于连接态信息：未连接时（哪怕缓冲里还留着旧报文）不显示 */}
      {connected && lastFrame ? (
        <span className="hidden truncate font-mono md:inline">
          {lastFrame.dir.toUpperCase()} {lastFrame.hex.slice(0, 23)}
          {lastFrame.durationMs !== undefined ? ` (${lastFrame.durationMs}ms)` : ''}
        </span>
      ) : null}

      <span className="ml-auto flex items-center gap-3">
        {keymapDirty + menuDirty > 0 ? (
          <span className="text-warn">未保存 {keymapDirty + menuDirty} 项</span>
        ) : null}
        {warningCount > 0 ? (
          <button type="button" className="flex items-center gap-1 text-warn hover:underline" onClick={gotoDebug}>
            <AlertTriangle size={12} /> 告警 {warningCount}
          </button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={gotoDebug}>
          <Terminal size={12} /> 调试
        </Button>
      </span>
    </footer>
  );
}
