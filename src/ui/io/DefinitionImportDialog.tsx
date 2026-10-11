// 定义文件导入弹窗：选择本地 JSON → 解析 → 展示字段级错误（R-P0-01：不白屏）。
import { useRef, useState } from 'react';
import { FileJson, Upload } from 'lucide-react';
import { Modal } from '@/ui/primitives/Modal';
import { Button } from '@/ui/primitives/Button';
import { useDefinitionStore } from '@/store/useDefinitionStore';
import { saveDefinition } from '@/definition/DefinitionRepository';
import { toast } from '@/ui/primitives/Toast';
import { useDeviceStore } from '@/store/useDeviceStore';

export interface DefinitionImportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function DefinitionImportDialog({
  open,
  onOpenChange,
}: DefinitionImportDialogProps): React.JSX.Element {
  const loadFromJson = useDefinitionStore((s) => s.loadFromJson);
  const issues = useDefinitionStore((s) => s.issues);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File): Promise<void> => {
    try {
      const text = await file.text();
      const json: unknown = JSON.parse(text);
      const result = loadFromJson(json, file.name);
      if (!result.ok) {
        toast.error('定义文件解析失败，请查看下方字段级错误');
        return;
      }
      // 持久化到 IndexedDB，下次启动自动恢复（Q9）
      await saveDefinition(json as Parameters<typeof saveDefinition>[0]);
      await useDeviceStore.getState().refreshDevices();
      toast.success(`已加载定义：${useDefinitionStore.getState().sourceName ?? file.name}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(`文件读取失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="导入 VIA 定义文件"
      description="选择或拖入一份 VIA V3 定义 JSON（*.json）。界面全部文案与控件都来自该文件。"
      footer={
        <Button variant="ghost" size="md" onClick={() => onOpenChange(false)}>
          关闭
        </Button>
      }
    >
      <div
        className={`flex flex-col items-center gap-2 rounded-card border border-dashed px-4 py-8 transition-colors ${
          dragging ? 'border-accent bg-accent-soft' : 'border-border'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
      >
        <FileJson size={22} className="text-fg-dim" />
        <p className="text-xs text-fg-muted">把定义文件拖到这里，或点击下方按钮选择</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <Button variant="primary" size="md" onClick={() => inputRef.current?.click()}>
          <Upload size={13} /> 选择文件
        </Button>
      </div>

      {issues.length > 0 ? (
        <div className="mt-3 max-h-40 overflow-auto rounded-card border border-border bg-elevated p-2">
          <div className="mb-1 text-[11px] text-fg-dim">解析告警 / 错误（{issues.length}）</div>
          <ul className="flex flex-col gap-1">
            {issues.slice(0, 50).map((issue, index) => (
              <li key={`${issue.path}-${index}`} className="text-[11px]">
                <span className={issue.level === 'error' ? 'text-danger' : 'text-warn'}>
                  [{issue.level}]
                </span>{' '}
                <span className="font-mono text-fg-muted">{issue.path}</span> {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Modal>
  );
}
