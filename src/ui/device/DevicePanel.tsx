// 设备面板（第二阶段，设备侧）：连接引导 + 设备信息卡 + 真实 Key Tester + 配置备份。
// 所有展示信息均来自 store（定义名 / VID / PID / 连接态 / 握手结论），不硬编码任何具体键盘特征。
//
// 连接态字段（连接状态 / 协议版本 / 固件版本 / 层数 / 键码字典版本）由 DeviceInfoCard 统一门控：
// 未连接时不渲染这些行（DOM 里没有节点），避免铺一屏「—」占位符误导用户。
import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { ConnectBanner } from '@/ui/device/ConnectBanner';
import { DevicePicker } from '@/ui/device/DevicePicker';
import { KeyTester } from '@/ui/device/KeyTester';
import { DefinitionLibrary } from '@/ui/device/DefinitionLibrary';
import { DeviceInfoCard } from '@/ui/device/DeviceInfoCard';
import { shouldShowConnectionInfo } from '@/ui/device/connectionInfo';
import { useDefinitionStore } from '@/store/useDefinitionStore';
import { useDeviceStore } from '@/store/useDeviceStore';
import { useUiStore } from '@/store/useUiStore';
import { parseBackup, type BackupFile, type ParseBackupResult } from '@/io/backup';
import { downloadBackup } from '@/io/download';
import { cn } from '@/shared/cn';

interface ImportMessage {
  readonly kind: 'ok' | 'error';
  readonly text: string;
}

export function DevicePanel(): React.JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false);
  const definition = useDefinitionStore((s) => s.definition);
  const deviceState = useDeviceStore((s) => s.state);
  const handshake = useDeviceStore((s) => s.handshake);
  const setImportDialogOpen = useUiStore((s) => s.setImportDialogOpen);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<ImportMessage | null>(null);

  const defName = definition?.name ?? null;
  const vid = definition?.vid ?? null;
  const pid = definition?.pid ?? null;
  const connected = shouldShowConnectionInfo(deviceState);

  const handleExport = (): void => {
    const backup: BackupFile | null = useDeviceStore.getState().backupExport();
    if (!backup) return;
    downloadBackup(backup);
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = ''; // 允许再次选择同一文件
    if (!file) return;
    try {
      const text = await file.text();
      const parsed: ParseBackupResult = parseBackup(text);
      if (!parsed.ok) {
        setImportMsg({ kind: 'error', text: parsed.error });
        return;
      }
      await useDeviceStore.getState().backupImport(parsed);
      setImportMsg({ kind: 'ok', text: '已导入' });
    } catch (err) {
      setImportMsg({
        kind: 'error',
        text: `导入失败：${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <ConnectBanner
        onImportDefinition={() => setImportDialogOpen(true)}
        onOpenDevicePicker={() => setPickerOpen(true)}
      />
      <DevicePicker open={pickerOpen} onOpenChange={setPickerOpen} />

      {/* 设备信息卡：未连接时只显示定义侧信息，连接态行由卡片内部条件渲染 */}
      <DeviceInfoCard
        definitionName={defName}
        vid={vid}
        pid={pid}
        state={deviceState}
        handshake={handshake}
      />

      {/* 定义库：已导入 JSON 的记忆管理（连接设备时按 VID/PID 自动切换） */}
      <DefinitionLibrary />

      {/* 真实 Key Tester */}
      <KeyTester />

      {/* 配置备份 */}
      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
          <Download size={15} className="text-accent" /> 配置备份
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!connected}
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-card border border-border bg-elevated px-3 py-1.5 text-xs text-fg enabled:hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={13} /> 导出配置
          </button>
          <button
            type="button"
            disabled={!connected}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-card border border-border bg-elevated px-3 py-1.5 text-xs text-fg enabled:hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Upload size={13} /> 导入配置
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => void handleImportFile(e)}
          />
        </div>
        {importMsg ? (
          <p className={cn('mt-2 text-[11px]', importMsg.kind === 'ok' ? 'text-fg-muted' : 'text-danger')}>
            {importMsg.text}
          </p>
        ) : null}
      </section>
    </div>
  );
}
