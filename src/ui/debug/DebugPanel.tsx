// 调试面板：协议告警置顶（探针失败不阻断连接）+ 原始报文表 + 日志。
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useDebugStore } from '@/store/useDebugStore';
import { useDeviceStore } from '@/store/useDeviceStore';
import { Button } from '@/ui/primitives/Button';
import { shouldShowConnectionInfo } from '@/ui/device/connectionInfo';
import { FrameLogTable } from './FrameLogTable';

export interface DebugPanelProps {
  /** 作为主面板内嵌展示时留白更少 */
  readonly embedded?: boolean;
}

export function DebugPanel({ embedded = false }: DebugPanelProps): React.JSX.Element {
  const frames = useDebugStore((s) => s.frames);
  const warnings = useDebugStore((s) => s.warnings);
  const logs = useDebugStore((s) => s.logs);
  const clearFrames = useDebugStore((s) => s.clearFrames);
  const clearWarnings = useDebugStore((s) => s.clearWarnings);
  const handshake = useDeviceStore((s) => s.handshake);
  const state = useDeviceStore((s) => s.state);
  // 握手结论区是连接态信息：未连接时整块不渲染，只保留告警/报文/日志
  const showHandshake = shouldShowConnectionInfo(state) && handshake !== null;

  return (
    <div className={embedded ? 'flex h-full min-h-0 flex-col gap-3' : 'flex flex-col gap-3 p-4'}>
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-medium text-fg">调试</h1>
        <span className="text-[11px] text-fg-dim">{frames.length} 条报文</span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={clearWarnings}>
            清空告警
          </Button>
          <Button variant="ghost" size="sm" onClick={clearFrames}>
            <Trash2 size={12} /> 清空报文
          </Button>
        </div>
      </div>

      {showHandshake && handshake ? (
        <div className="rounded-card border border-border bg-surface px-3 py-2 text-[11px]">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-fg-muted">
            <span>
              协议版本 <span className="font-mono text-fg">v{handshake.protocolVersion}</span>
            </span>
            <span>
              层数 <span className="font-mono text-fg">{handshake.layerCount}</span>
            </span>
            <span>
              固件版本{' '}
              <span className="font-mono text-fg">
                0x{handshake.firmwareVersion.toString(16).toUpperCase().padStart(8, '0')}
              </span>
            </span>
            <span>
              layout_options{' '}
              <span className="font-mono text-fg">0x{handshake.layoutOptions.toString(16).toUpperCase()}</span>
            </span>
            <span>
              键码字典{' '}
              <span className="font-mono text-fg">
                {handshake.keycodesVersion === null
                  ? '—（协议 < 13）'
                  : `0x${handshake.keycodesVersion.toString(16).toUpperCase().padStart(8, '0')}`}
              </span>
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={handshake.probe.passed ? 'text-accent' : 'text-warn'}>
              自校验探针：{handshake.probe.passed ? '通过（回显前缀与请求一致）' : '未通过'}
            </span>
            {handshake.probe.addressKey ? (
              <span className="font-mono text-fg-dim">探针地址 {handshake.probe.addressKey}</span>
            ) : null}
          </div>
          {handshake.probe.detail ? (
            <p className="mt-1 text-fg-dim">{handshake.probe.detail}</p>
          ) : null}
          {handshake.probe.requestHex ? (
            <p className="mt-1 font-mono text-fg-dim">TX {handshake.probe.requestHex}</p>
          ) : null}
          {handshake.probe.responseHex ? (
            <p className="mt-1 font-mono text-fg-dim">RX {handshake.probe.responseHex}</p>
          ) : null}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="flex flex-col gap-1">
          {warnings.map((warning) => (
            <div
              key={warning.id}
              className={`flex items-start gap-2 rounded-card border px-3 py-2 text-[11px] ${
                warning.level === 'warn'
                  ? 'border-warn/40 bg-warn-soft text-warn'
                  : 'border-border bg-elevated text-fg-muted'
              }`}
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{warning.title}</div>
                <div className="text-fg-muted">{warning.detail}</div>
                {warning.rawHex ? (
                  <div className="mt-1 break-all font-mono text-fg-dim">{warning.rawHex}</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className={embedded ? 'min-h-0 flex-1 overflow-auto' : ''}>
        <FrameLogTable frames={frames} />
      </div>

      {logs.length > 0 ? (
        <div className="max-h-32 overflow-auto rounded-card border border-border bg-surface p-2">
          {logs.map((log) => (
            <div key={log.id} className="font-mono text-[10px] text-fg-dim">
              [{log.level}] {log.scope}: {log.message}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
