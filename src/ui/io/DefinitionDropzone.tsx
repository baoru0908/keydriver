// 定义文件投放区：拖拽或点选导入 VIA V3 JSON；解析失败时列出字段级错误，绝不白屏。
import { useRef, useState } from 'react';
import { FileJson, Upload } from 'lucide-react';
import { useDefinitionStore } from '@/store/useDefinitionStore';
import { useDeviceStore } from '@/store/useDeviceStore';
import { saveDefinition } from '@/definition/DefinitionRepository';
import { toast } from '@/ui/primitives/Toast';
import { cn } from '@/shared/cn';

export interface DefinitionDropzoneProps {
  readonly className?: string;
}

export function DefinitionDropzone({ className }: DefinitionDropzoneProps): React.JSX.Element {
  const loadFromJson = useDefinitionStore((s) => s.loadFromJson);
  const issues = useDefinitionStore((s) => s.issues);
  const sourceName = useDefinitionStore((s) => s.sourceName);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const ingest = async (file: File): Promise<void> => {
    try {
      const text = await file.text();
      const json: unknown = JSON.parse(text) as unknown;
      const result = loadFromJson(json, file.name);
      if (result.ok) {
        // 持久化到定义库：否则拖拽导入的文件不会被记住——
        // 下次启动无法恢复，也无法在连接设备时按 VID/PID 自动切换到它。
        await saveDefinition(json as Parameters<typeof saveDefinition>[0]);
        await useDeviceStore.getState().refreshDevices();
        const errorCount = result.issues.filter((i) => i.level === 'error').length;
        toast.success(
          errorCount > 0
            ? `已导入 ${file.name}（含 ${errorCount} 条告警，详见下方）`
            : `已导入 ${file.name}`,
        );
      } else {
        toast.error('定义文件解析失败，详见下方字段级错误列表');
      }
    } catch {
      toast.error('不是合法的 JSON 文件');
    }
  };

  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void ingest(file);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-card border border-dashed px-4 py-6 transition-colors',
          dragging ? 'border-accent bg-accent-soft' : 'border-border-strong hover:bg-elevated',
        )}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      >
        <FileJson size={20} className="text-fg-dim" />
        <span className="text-xs text-fg-muted">把定义文件拖到这里，或点击选择文件</span>
        {sourceName ? <span className="text-[11px] text-fg-dim">当前：{sourceName}</span> : null}
        <span className="flex items-center gap-1 text-[11px] text-fg-dim">
          <Upload size={11} />
          支持 VIA V3 JSON
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void ingest(file);
          e.target.value = '';
        }}
      />

      {errors.length > 0 ? (
        <div className="rounded border border-danger bg-danger-soft px-3 py-2">
          <div className="text-[11px] font-medium text-danger">
            {errors.length} 条字段级错误（未阻断渲染）
          </div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {errors.slice(0, 12).map((issue) => (
              <li key={`${issue.path}-${issue.message}`} className="font-mono text-[10px] text-danger">
                {issue.path}：{issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {warns.length > 0 ? (
        <div className="rounded border border-border bg-elevated px-3 py-2">
          <div className="text-[11px] font-medium text-fg-muted">{warns.length} 条告警</div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {warns.slice(0, 8).map((issue) => (
              <li key={`${issue.path}-${issue.message}`} className="font-mono text-[10px] text-fg-dim">
                {issue.path}：{issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
