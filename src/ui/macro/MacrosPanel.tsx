// 宏面板：VIA 宏缓冲区编辑器 + 高级输入（复用 mechanism，由定义文件驱动）。
//
// 说明（架构约定）：本面板包含「VIA 宏」与「高级输入」两部分。
// - VIA 宏区：直接读写固件的 VIA 宏缓冲区（0x0e/0x0f/0x0d），与具体键盘无关。
// - 高级输入区：渲染定义文件中 category==='macros' 的菜单（其文案来自定义文件，零硬编码）。
import { useEffect, useMemo, useState } from 'react';
import { Usb } from 'lucide-react';
import { useDeviceStore, getFacade } from '@/store/useDeviceStore';
import { useDefinitionStore } from '@/store/useDefinitionStore';
import { useMenuStore } from '@/store/useMenuStore';
import { MenuGenerator } from '@/ui/menu/MenuGenerator';
import { Card } from '@/ui/primitives/Card';
import { EmptyState } from '@/ui/primitives/EmptyState';
import { Skeleton, SkeletonGroup } from '@/ui/primitives/Skeleton';
import type { MenuDef } from '@/definition/schema';

/** 宏槽数量（与固件 MACRO_GET_COUNT 一致）。 */
const MACRO_SLOT_COUNT = 16;
/** 单个宏槽最多容纳的键码字节数。 */
const MACRO_SLOT_MAX_BYTES = 28;
/** 宏缓冲区默认总字节数（与 Dummy 的 MACRO_GET_BUFFER_SIZE 一致）。 */
const DEFAULT_MACRO_BUFFER_SIZE = 64;

/**
 * 把宏缓冲区按「0x00 结尾片段」拆成 N 个宏槽。
 * 连续的 0x00 会被当作空槽的结束符，因此默认全 0 的缓冲区会解析为 N 个空槽。
 */
function parseSlots(buffer: Uint8Array, slotCount: number): number[][] {
  const slots: number[][] = [];
  let cur: number[] = [];
  for (let i = 0; i < buffer.length && slots.length < slotCount; i += 1) {
    const b = buffer[i] ?? 0;
    if (b === 0) {
      cur.push(0);
      slots.push(cur);
      cur = [];
    } else {
      cur.push(b);
    }
  }
  while (slots.length < slotCount) slots.push([0]);
  return slots;
}

/** 宏槽 → 可编辑文本（空槽显示为空字符串）。 */
function slotToText(slot: readonly number[]): string {
  if (slot.length === 1 && slot[0] === 0) return '';
  return slot.join(', ');
}

/**
 * 解析用户输入的十进制键码序列：
 * - 忽略非数字片段；
 * - 钳制到 [0, 255]（Uint8）；
 * - 去掉尾部多余的 0（结束符在保存时统一补齐）；
 * - 上限 MACRO_SLOT_MAX_BYTES 个键码。
 */
function parseSlotText(text: string): number[] {
  const parts = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const nums: number[] = [];
  for (const p of parts) {
    const n = Number.parseInt(p, 10);
    if (Number.isNaN(n)) continue;
    nums.push(Math.max(0, Math.min(255, n & 0xff)));
  }
  while (nums.length > 0 && nums[nums.length - 1] === 0) nums.pop();
  return nums.slice(0, MACRO_SLOT_MAX_BYTES);
}

/** 把 N 个宏槽序列化回连续缓冲区（每个槽以 0x00 结尾）。 */
function serializeSlots(slots: readonly number[][], size: number): Uint8Array {
  const out = new Uint8Array(size);
  let offset = 0;
  for (const seq of slots) {
    for (const b of seq) {
      if (offset >= size) break;
      out[offset++] = b & 0xff;
    }
    if (offset >= size) break;
    out[offset++] = 0; // 结束符
  }
  return out;
}

export function MacrosPanel(): React.JSX.Element {
  const connectionState = useDeviceStore((s) => s.state);
  const menuLoad = useDeviceStore((s) => s.menuLoad);
  const definition = useDefinitionStore((s) => s.definition);
  const showIfContext = useMenuStore((s) => s.showIfContext);
  const loadedMenus = useMenuStore((s) => s.loadedMenus);

  const connected = connectionState === 'connected';
  const facade = getFacade();

  const [size, setSize] = useState(DEFAULT_MACRO_BUFFER_SIZE);
  const [buffer, setBuffer] = useState<Uint8Array>(new Uint8Array(DEFAULT_MACRO_BUFFER_SIZE));
  const [slotTexts, setSlotTexts] = useState<string[]>(() =>
    Array.from({ length: MACRO_SLOT_COUNT }, () => ''),
  );
  const [status, setStatus] = useState('');

  // 找到全部宏类菜单（数据驱动，文案来自定义文件，TS 中零硬编码）。
  // 一个 category 下可能存在多个菜单，因此渲染全部而不是只取第一个。
  const macrosMenus: readonly MenuDef[] = useMemo(() => {
    if (!definition) return [];
    return definition.menus.filter((m) => m.category === 'macros');
  }, [definition]);

  const readBuffer = async (): Promise<void> => {
    if (!facade) return;
    try {
      const s = (await facade.getMacroSize()) || DEFAULT_MACRO_BUFFER_SIZE;
      setSize(s);
      const data = await facade.getMacroBuffer(0, s);
      setBuffer(data);
      setSlotTexts(parseSlots(data, MACRO_SLOT_COUNT).map(slotToText));
      setStatus('已读取宏缓冲区');
    } catch (e) {
      setStatus(`读取失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const saveAll = async (): Promise<void> => {
    if (!facade) return;
    try {
      const slots = slotTexts.map((t) => parseSlotText(t));
      const data = serializeSlots(slots, size);
      await facade.setMacroBuffer(0, data);
      setBuffer(data);
      setStatus('已保存全部宏');
    } catch (e) {
      setStatus(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const onSlotChange = (idx: number, value: string): void => {
    setSlotTexts((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  // 组件挂载且已连接时读取一次；未连接时静默跳过（守卫点由 connectionState 触发重渲染）。
  useEffect(() => {
    if (connected && facade) void readBuffer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // 高级输入区：懒加载全部宏类菜单的控件值（与菜单面板共用同一份菜单状态）。
  useEffect(() => {
    if (!connected) return;
    for (const menu of macrosMenus) {
      if (!loadedMenus.has(menu.id)) void menuLoad(menu.id);
    }
  }, [connected, macrosMenus, loadedMenus, menuLoad]);

  if (!connected || !facade) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={Usb}
          title="未连接设备"
          description="请在「设备」面板连接键盘后再编辑宏。"
        />
      </Card>
    );
  }

  const allZero = buffer.every((b) => b === 0);

  return (
    <div className="flex flex-col gap-5">
      {/* VIA 宏缓冲区编辑器 */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">VIA 宏缓冲区</h2>
          <p className="mt-1 text-[11px] text-fg-muted">
            本面板包含「VIA 宏」与「高级输入」两部分。下方为固件 VIA 宏缓冲区，按 0x00 结尾切片展示为
            {MACRO_SLOT_COUNT} 个宏槽；每槽填写十进制键码序列（如 4, 22），保存时整段写回。
          </p>
        </div>

        {allZero ? (
          <div className="rounded-card border border-border bg-elevated px-3 py-2 text-[11px] text-fg-dim">
            当前键盘未提供 VIA 宏数据（Em60 通过复用机制实现高级输入）。你仍可直接编辑并保存，写回后会被固件回显。
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!connected}
            onClick={() => void readBuffer()}
            className="flex items-center gap-1.5 rounded-card border border-border bg-elevated px-3 py-1.5 text-xs text-fg enabled:hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            读取
          </button>
          <button
            type="button"
            disabled={!connected}
            onClick={() => void saveAll()}
            className="flex items-center gap-1.5 rounded-card border border-border bg-elevated px-3 py-1.5 text-xs text-fg enabled:hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            保存全部
          </button>
          {status ? <span className="text-[11px] text-fg-muted">{status}</span> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          {slotTexts.map((text, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-right text-[11px] text-fg-dim">槽 {idx + 1}</span>
              <input
                value={text}
                onChange={(e) => onSlotChange(idx, e.target.value)}
                placeholder="十进制键码序列，如 4, 22, 0"
                spellCheck={false}
                className="w-full rounded-card border border-border bg-surface px-2 py-1 font-mono text-[12px] text-fg outline-none focus:border-border-strong"
              />
            </div>
          ))}
        </div>
      </section>

      {/* 高级输入区：渲染全部宏类菜单（标题与内容均来自定义文件） */}
      {macrosMenus.map((menu) => (
        <section key={menu.id} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-fg">{menu.label}</h2>
          <p className="text-[11px] text-fg-dim">来自定义文件 · {menu.controls.length} 个控件</p>
          {/* 官方 menu-generator.tsx 的同款就绪门控（与 MenuPane 一致）：
              菜单值未读取完成时先不渲染，否则 showIfContext 里该菜单的变量全部缺失 →
              按 0 求值 → 条件控件会先灰一下再亮起来。 */}
          {loadedMenus.has(menu.id) ? (
            <MenuGenerator menu={menu} context={showIfContext} disabled={!connected} />
          ) : (
            <SkeletonGroup label={`正在加载 ${menu.label}`} className="gap-2">
              <Skeleton variant="block" className="h-12" />
              <Skeleton variant="block" className="h-12" />
            </SkeletonGroup>
          )}
        </section>
      ))}
    </div>
  );
}
