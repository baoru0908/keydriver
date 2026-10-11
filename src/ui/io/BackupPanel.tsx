// 备份面板：导出当前配置 → JSON 文件；选择备份文件 → 导入并逐项校验（架构 T04.4）。
import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { useDefinitionStore } from '@/store/useDefinitionStore';
import { useDeviceStore } from '@/store/useDeviceStore';
import { useMenuStore, readValue } from '@/store/useMenuStore';
import { Button } from '@/ui/primitives/Button';
import { ConfirmDialog } from '@/ui/primitives/ConfirmDialog';
import { toast } from '@/ui/primitives/Toast';
import { downloadBackup, pickBackupFile } from '@/io/download';
import { describeBackup, diffBackup, type BackupFile } from '@/io/backup';

export interface BackupPanelProps {
  readonly disabled?: boolean;
}

interface DiffRow {
  readonly controlId: string;
  readonly label: string;
  readonly expected: number;
  readonly actual: number;
}

export function BackupPanel({ disabled }: BackupPanelProps): React.JSX.Element {
  const definition = useDefinitionStore((s) => s.definition);
  const backupExport = useDeviceStore((s) => s.backupExport);
  const backupImport = useDeviceStore((s) => s.backupImport);
  const busy = useDeviceStore((s) => s.busy);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [diff, setDiff] = useState<readonly DiffRow[] | null>(null);

  const onExport = (): void => {
    const backup = backupExport();
    if (!backup) {
      toast.error('尚未加载定义文件，无法导出');
      return;
    }
    if (downloadBackup(backup)) toast.success(`已导出 ${Object.keys(backup.values).length} 项配置`);
    else toast.error('当前环境不支持文件下载');
  };

  const onPick = async (): Promise<void> => {
    const parsed = await pickBackupFile();
    if (parsed === null) return;
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    setPending(parsed.backup);
    setDiff(null);
  };

  const onConfirmImport = async (): Promise<void> => {
    if (!pending) return;
    const result = await backupImport({ ok: true, backup: pending });
    if (result.applied === 0) {
      toast.error('没有任何控件被还原——备份与当前定义文件可能不匹配');
      return;
    }
    // 导入后逐项读回比对（验收 3：导出 → 复位 → 导入 → 逐项一致）
    const definitionNow = useDefinitionStore.getState().definition;
    if (!definitionNow) return;
    const actual: Record<string, number> = {};
    for (const control of definitionNow.controls) {
      actual[control.id] = readValue(useMenuStore.getState(), control);
    }
    const rows = diffBackup(definitionNow, pending, actual);
    setDiff(rows);
    if (rows.length === 0) {
      toast.success(`已还原 ${result.applied} 项，逐项比对完全一致`);
    } else {
      toast.error(`${rows.length} 项与备份不一致，请见下方明细`);
    }
    if (result.missing > 0) {
      toast.info(`备份中有 ${result.missing} 项在当前定义文件中不存在，已跳过`);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium text-fg">配置备份</h2>
        <span className="text-[11px] text-fg-dim">
          主键为 controlId（valueKey 有 2 处重名，不能做主键）
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled={disabled || busy} onClick={onExport}>
            <Download size={12} />
            导出
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={disabled || busy || !definition}
            onClick={() => void onPick()}
          >
            <Upload size={12} />
            导入
          </Button>
        </div>
      </div>

      {pending ? (
        <div className="rounded border border-border bg-elevated px-3 py-2 text-[11px] text-fg-muted">
          {describeBackup(pending)}
        </div>
      ) : null}

      {diff !== null ? (
        <div className="max-h-56 overflow-auto rounded border border-border">
          {diff.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-accent">逐项比对通过，完全一致</div>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-elevated text-fg-dim">
                <tr>
                  <th className="px-2 py-1 text-left font-normal">控件</th>
                  <th className="px-2 py-1 text-right font-normal">备份值</th>
                  <th className="px-2 py-1 text-right font-normal">实际值</th>
                </tr>
              </thead>
              <tbody>
                {diff.map((row) => (
                  <tr key={row.controlId} className="border-t border-border">
                    <td className="px-2 py-1 text-fg-muted">{row.label}</td>
                    <td className="px-2 py-1 text-right font-mono text-fg">{row.expected}</td>
                    <td className="px-2 py-1 text-right font-mono text-danger">{row.actual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title="确认导入这份备份？"
        description={pending ? `${describeBackup(pending)}。导入会覆写键盘上对应的全部控件值。` : ''}
        confirmLabel="导入"
        onConfirm={() => void onConfirmImport()}
      />
    </div>
  );
}
