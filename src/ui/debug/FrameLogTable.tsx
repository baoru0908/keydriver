// 报文表格：32 字节原始 hex、方向、耗时，可一键复制单条。
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import type { FrameEntry } from '@/store/useDebugStore';
import { Button } from '@/ui/primitives/Button';
import { cn } from '@/shared/cn';

export interface FrameLogTableProps {
  readonly frames: readonly FrameEntry[];
}

/** 按命令 ID 给出可读名称，便于人工核对（名称来自协议常量，与键盘无关）。 */
const CMD_NAMES: Readonly<Record<number, string>> = {
  0x01: 'GET_PROTOCOL_VERSION',
  0x02: 'GET_KEYBOARD_VALUE',
  0x03: 'SET_KEYBOARD_VALUE',
  0x04: 'KEYMAP_GET_KEYCODE',
  0x05: 'KEYMAP_SET_KEYCODE',
  0x06: 'KEYMAP_RESET',
  0x07: 'CUSTOM_SET_VALUE',
  0x08: 'CUSTOM_GET_VALUE',
  0x09: 'CUSTOM_SAVE',
  0x0a: 'EEPROM_RESET',
  0x0b: 'BOOTLOADER_JUMP',
  0x11: 'KEYMAP_GET_LAYER_COUNT',
  0x12: 'KEYMAP_GET_BUFFER',
  0x13: 'KEYMAP_SET_BUFFER',
  0xff: 'UNHANDLED',
};

/**
 * 命令列展示：查表命中显示命令名，未命中显示 `0x{十六进制}`。
 *
 * ⚠️ 报文记录来自协议层与外部数据，commandId 在运行时可能缺失（undefined / null）
 * 或不是合法数值。这里先把值归一化成安全整数再查表，绝不直接对空值调 toString()——
 * 否则调试面板整块崩溃，反而看不到现场。未知命令必须显示成十六进制而非空白，
 * 这样人工才能定位到是哪条命令没被识别。
 */
export function formatCommandName(commandId: number | undefined | null): string {
  const usable =
    typeof commandId === 'number' && Number.isFinite(commandId) && commandId >= 0
      ? Math.trunc(commandId)
      : 0;
  return CMD_NAMES[usable] ?? `0x${usable.toString(16)}`;
}

/**
 * 方向列展示：与命令列同源的空值风险（`.toUpperCase()` 同样会在空值上抛异常）。
 * 有值就照原样大写（含 tx / rx 之外的历史写法），缺失时才退化为占位符。
 */
function formatDirection(dir: FrameEntry['dir'] | undefined | null): string {
  return typeof dir === 'string' && dir.length > 0 ? dir.toUpperCase() : '—';
}

export function FrameLogTable({ frames }: FrameLogTableProps): React.JSX.Element {
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const copy = async (entry: FrameEntry): Promise<void> => {
    try {
      await navigator.clipboard.writeText(entry.hex);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId((id) => (id === entry.id ? null : id)), 1200);
    } catch {
      // 剪贴板不可用时不阻断
    }
  };

  if (frames.length === 0) {
    return <p className="py-6 text-center text-[11px] text-fg-dim">暂无报文</p>;
  }

  return (
    <div className="overflow-auto rounded-card border border-border">
      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 bg-elevated text-fg-dim">
          <tr>
            <th className="px-2 py-1 text-left font-medium">#</th>
            <th className="px-2 py-1 text-left font-medium">方向</th>
            <th className="px-2 py-1 text-left font-medium">命令</th>
            <th className="px-2 py-1 text-left font-medium">报文（32B hex）</th>
            <th className="px-2 py-1 text-right font-medium">耗时</th>
            <th className="px-2 py-1 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {frames
            .slice()
            .reverse()
            .map((entry) => (
              <tr key={entry.id} className="border-t border-border hover:bg-elevated/60">
                <td className="px-2 py-1 font-mono text-fg-dim">{entry.id}</td>
                <td
                  className={cn(
                    'px-2 py-1 font-mono font-medium',
                    entry.dir === 'tx' ? 'text-warn' : 'text-accent',
                  )}
                >
                  {formatDirection(entry.dir)}
                </td>
                <td className="px-2 py-1 text-fg-muted">{formatCommandName(entry.commandId)}</td>
                <td className="px-2 py-1 font-mono text-fg">{entry.hex}</td>
                <td className="px-2 py-1 text-right font-mono text-fg-dim">
                  {entry.durationMs !== undefined ? `${entry.durationMs}ms` : '—'}
                </td>
                <td className="px-2 py-1 text-right">
                  <Button variant="ghost" size="icon" onClick={() => void copy(entry)} aria-label="复制报文">
                    {copiedId === entry.id ? <Check size={12} className="text-accent" /> : <Copy size={12} />}
                  </Button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
