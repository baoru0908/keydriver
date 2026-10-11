// 连接引导横幅：未连接/无定义时的引导，含运行环境自检提示（Q10 / R10）。
import { AlertCircle, FileJson, Usb } from 'lucide-react';
import { Button } from '@/ui/primitives/Button';
import { useDeviceStore } from '@/store/useDeviceStore';
import { useDefinitionStore } from '@/store/useDefinitionStore';

export interface ConnectBannerProps {
  readonly onImportDefinition: () => void;
  readonly onOpenDevicePicker: () => void;
}

/** 运行环境自检：是否需要安全上下文、是否支持 WebHID（Q10）。 */
function environmentHints(): string[] {
  const hints: string[] = [];
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    hints.push('当前不是安全上下文（需 https 或 localhost），浏览器会禁用 WebHID。');
  }
  if (typeof navigator !== 'undefined' && !('hid' in navigator)) {
    hints.push('当前浏览器不支持 WebHID，请使用 Chrome / Edge 113+。');
  }
  return hints;
}

export function ConnectBanner({
  onImportDefinition,
  onOpenDevicePicker,
}: ConnectBannerProps): React.JSX.Element {
  const state = useDeviceStore((s) => s.state);
  const error = useDeviceStore((s) => s.error);
  const definition = useDefinitionStore((s) => s.definition);
  const hints = environmentHints();

  if (state === 'connected') return <></>;

  return (
    <div className="mb-3 flex flex-col gap-2 rounded-card border border-border bg-elevated px-3 py-3">
      <div className="flex items-start gap-2">
        <AlertCircle size={15} className="mt-0.5 shrink-0 text-warn" />
        <div className="min-w-0 flex-1 text-xs text-fg-muted">
          {!definition ? (
            <p>尚未加载定义文件。请先导入一份 VIA V3 定义 JSON，所有界面文案与控件都由它驱动。</p>
          ) : state === 'error' ? (
            <p className="text-danger">{error ?? '连接失败'}</p>
          ) : (
            <p>已加载定义，但未连接设备。可选择 Dummy 模拟设备在无硬件情况下体验完整流程。</p>
          )}
          {hints.map((hint) => (
            <p key={hint} className="mt-1 text-[11px] text-fg-dim">
              {hint}
            </p>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        {!definition ? (
          <Button variant="primary" size="sm" onClick={onImportDefinition}>
            <FileJson size={13} /> 导入定义文件
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={onOpenDevicePicker}>
            <Usb size={13} /> 选择设备
          </Button>
        )}
      </div>
    </div>
  );
}
