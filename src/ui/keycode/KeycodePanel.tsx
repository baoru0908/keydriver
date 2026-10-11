// 键码面板容器：当前选中键 + 分组 Tab + 搜索 + Any 输入；选中后写入设备并回读校验。
import { useMemo, useState } from 'react';
import { useDefinitionStore } from '@/store/useDefinitionStore';
import { useKeymapStore, selectKeycode } from '@/store/useKeymapStore';
import { useDeviceStore } from '@/store/useDeviceStore';
import { readValue, useMenuStore } from '@/store/useMenuStore';
import { useUiStore } from '@/store/useUiStore';
import { KeycodeTable } from '@/keycodes/KeycodeTable';
import { format } from '@/keycodes/KeycodeFormatter';
import { toHex16Short } from '@/shared/hex';
import { toast } from '@/ui/primitives/Toast';
import { Button } from '@/ui/primitives/Button';
import { KeycodeGroupTabs } from './KeycodeGroupTabs';
import { KeycodeGrid } from './KeycodeGrid';
import { AnyKeycodeInput } from './AnyKeycodeInput';
import { KeycodeSearch } from './KeycodeSearch';
import type { KeycodeDef, KeycodeGroupId } from '@/keycodes/types';

export function KeycodePanel(): React.JSX.Element {
  const definition = useDefinitionStore((s) => s.definition);
  const selected = useKeymapStore((s) => s.selected);
  const currentLayer = useKeymapStore((s) => s.currentLayer);
  const keymapState = useKeymapStore();
  const applyKeycode = useDeviceStore((s) => s.applyKeycode);
  const menuCommit = useDeviceStore((s) => s.menuCommit);
  const setKeycodePanelOpen = useUiStore((s) => s.setKeycodePanelOpen);
  const keycodeTarget = useUiStore((s) => s.keycodeTarget);
  const clearKeycodeTarget = useUiStore((s) => s.clearKeycodeTarget);
  const [group, setGroup] = useState<KeycodeGroupId>('basic');
  const [query, setQuery] = useState('');

  /** keycodeTarget 为某个 controlId 时，面板服务于菜单里的 keycode 控件（T04）。 */
  const targetControl =
    keycodeTarget !== null && keycodeTarget !== 'keymap'
      ? (definition?.controlById.get(keycodeTarget) ?? null)
      : null;

  const menuKeyValue = useMenuStore((s) => (targetControl ? readValue(s, targetControl) : 0));
  const currentKeycode: number | null = targetControl
    ? menuKeyValue
    : definition && selected
      ? selectKeycode(keymapState, currentLayer, selected.row, selected.col)
      : null;

  const groups = useMemo(() => KeycodeTable.groups(), [definition]);
  const items = useMemo(() => {
    if (query.trim() !== '') return KeycodeTable.search(query);
    return KeycodeTable.itemsOf(group);
  }, [group, query, definition]);

  const apply = async (def: KeycodeDef): Promise<void> => {
    if (targetControl) {
      const ok = await menuCommit(targetControl, def.code);
      if (ok) toast.success(`已写入 ${format(def.code)}`);
      else toast.error(useDeviceStore.getState().error ?? '写入失败');
      return;
    }
    if (!selected) {
      toast.info('请先在键位图上点选一个键');
      return;
    }
    const ok = await applyKeycode(currentLayer, selected.row, selected.col, def.code);
    if (ok) toast.success(`已写入 ${format(def.code)}`);
    else toast.error(useDeviceStore.getState().error ?? '写入失败');
  };

  const applyRaw = async (keycode: number): Promise<void> => {
    if (targetControl) {
      const ok = await menuCommit(targetControl, keycode);
      if (ok) toast.success(`已写入 0x${toHex16Short(keycode)}`);
      else toast.error(useDeviceStore.getState().error ?? '写入失败');
      return;
    }
    if (!selected) {
      toast.info('请先在键位图上点选一个键');
      return;
    }
    const ok = await applyKeycode(currentLayer, selected.row, selected.col, keycode);
    if (ok) toast.success(`已写入 0x${toHex16Short(keycode)}`);
    else toast.error(useDeviceStore.getState().error ?? '写入失败');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-fg">键码</span>
        <Button variant="ghost" size="icon" className="ml-auto" onClick={() => setKeycodePanelOpen(false)} aria-label="收起键码面板">
          ×
        </Button>
      </div>

      <div className="border-b border-border px-3 py-2 text-[11px]">
        {targetControl ? (
          <div className="flex items-center gap-2">
            <span className="text-fg-dim">目标控件</span>
            <span className="min-w-0 flex-1 truncate text-fg">
              {targetControl.label || targetControl.valueKey}
            </span>
            <span className="font-mono text-accent">
              {currentKeycode !== null ? `0x${toHex16Short(currentKeycode)}` : '—'}
            </span>
            <Button variant="ghost" size="sm" onClick={clearKeycodeTarget}>
              取消
            </Button>
          </div>
        ) : selected ? (
          <div className="flex items-center gap-2">
            <span className="text-fg-dim">选中</span>
            <span className="font-mono text-fg">
              ({selected.row},{selected.col}) · L{currentLayer}
            </span>
            <span className="ml-auto font-mono text-accent">
              {currentKeycode !== null ? `0x${toHex16Short(currentKeycode)}` : '—'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void (async () => {
                  if (currentKeycode !== null) await applyRaw(currentKeycode);
                })()
              }
            >
              回读
            </Button>
          </div>
        ) : (
          <span className="text-fg-dim">未选中键位——点击左侧键位图中任意键开始改键</span>
        )}
      </div>

      <div className="border-b border-border px-3 py-2">
        <KeycodeSearch value={query} onChange={setQuery} />
      </div>

      <div className="border-b border-border px-2 py-2">
        <KeycodeGroupTabs groups={groups} active={group} onChange={setGroup} />
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        <KeycodeGrid items={items} activeCode={currentKeycode} onPick={(def) => void apply(def)} />
      </div>

      <div className="border-t border-border px-3 py-2">
        <AnyKeycodeInput onApply={(keycode) => void applyRaw(keycode)} />
      </div>
    </div>
  );
}
