// 定义库：已导入 JSON 的记忆管理（列出 / 切换 / 删除）。
//
// 与「设备自动识别」配套：连接设备时 useDeviceStore.connect 会按 VID/PID 在定义库里查找，
// 命中即自动切换到对应配置（换一把键盘插上就能直接用它自己的配置，无需重新导入）。
// 所有展示信息来自 IndexedDB 中保存的 meta，不硬编码任何具体键盘特征。
// T06-4：加载态走 Skeleton、空态走 EmptyState（design-tokens.md §7.1–7.2）。
import { useCallback, useEffect, useState } from 'react';
import { Check, Library, Trash2 } from 'lucide-react';
import {
  getDefinitionById,
  listDefinitions,
  removeDefinition,
  setCurrentDefinitionId,
  type DefinitionMeta,
} from '@/definition/DefinitionRepository';
import { parseId } from '@/definition/validate';
import { useDefinitionStore } from '@/store/useDefinitionStore';
import { useDeviceStore } from '@/store/useDeviceStore';
import { toast } from '@/ui/primitives/Toast';
import { Card } from '@/ui/primitives/Card';
import { EmptyState } from '@/ui/primitives/EmptyState';
import { Skeleton, SkeletonGroup } from '@/ui/primitives/Skeleton';
import { cn } from '@/shared/cn';

function hex4(value: number): string {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(4, '0')}`;
}

export function DefinitionLibrary(): React.JSX.Element {
  const [items, setItems] = useState<readonly DefinitionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const definition = useDefinitionStore((s) => s.definition);
  const loadFromJson = useDefinitionStore((s) => s.loadFromJson);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setItems(await listDefinitions());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const currentKey = definition ? `${definition.vid}:${definition.pid}` : null;

  const onSwitch = async (meta: DefinitionMeta): Promise<void> => {
    const record = await getDefinitionById(meta.id);
    if (!record?.raw) {
      toast.error('该定义已不存在，请重新导入');
      void refresh();
      return;
    }
    const result = loadFromJson(record.raw, record.meta.name);
    if (!result.ok) {
      toast.error('定义解析失败，无法切换');
      return;
    }
    await setCurrentDefinitionId(meta.id);
    await useDeviceStore.getState().refreshDevices();
    toast.success(`已切换到 ${record.meta.name}`);
    void refresh();
  };

  const onRemove = async (meta: DefinitionMeta): Promise<void> => {
    await removeDefinition(meta.id);
    toast.success(`已从定义库删除 ${meta.name}`);
    void refresh();
  };

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-fg">
        <Library size={15} className="text-accent" /> 定义库
      </h2>
      <p className="mb-3 text-caption text-fg-muted">
        已导入的定义文件会记在这里。连接设备时会按 VID/PID 自动切换到对应配置。
      </p>

      {loading ? (
        <SkeletonGroup label="定义库加载中">
          <Skeleton variant="block" className="h-12" />
          <Skeleton variant="block" className="h-12" />
          <Skeleton variant="block" className="h-12" />
        </SkeletonGroup>
      ) : null}

      {!loading && items.length === 0 ? (
        <EmptyState
          icon={Library}
          title="定义库还是空的"
          description="可把 JSON 拖到下方投放区，或点顶部「导入定义」。导入过的定义会按 VID/PID 自动匹配。"
        />
      ) : null}

      <ul className="flex flex-col gap-1.5">
        {items.map((meta) => {
          const vid = parseId(meta.vendorId);
          const pid = parseId(meta.productId);
          const active = currentKey === `${vid}:${pid}`;
          return (
            <li
              key={meta.id}
              className={cn(
                'flex items-center gap-2 rounded-card border px-2.5 py-2',
                active ? 'border-accent bg-accent-soft' : 'border-border bg-elevated',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs text-fg">{meta.name}</span>
                  {active ? (
                    <span className="flex shrink-0 items-center gap-0.5 text-caption text-accent">
                      <Check size={10} /> 当前
                    </span>
                  ) : null}
                </div>
                <div className="font-mono text-caption text-fg-dim">
                  {hex4(vid)} : {hex4(pid)} · {new Date(meta.savedAt).toLocaleString()}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void onSwitch(meta)}
                disabled={active}
                title={active ? '已是当前定义' : '切换到这份定义'}
                className="shrink-0 rounded-card border border-border bg-surface px-2 py-1 text-caption text-fg enabled:hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-40"
              >
                切换
              </button>
              <button
                type="button"
                onClick={() => void onRemove(meta)}
                title="从定义库删除"
                className="shrink-0 rounded-card border border-border bg-surface p-1.5 text-fg-muted hover:border-danger hover:text-danger"
              >
                <Trash2 size={12} />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
