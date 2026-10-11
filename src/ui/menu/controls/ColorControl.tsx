// color 控件：24 位色值 + 色空间可切（RGB / HSV / GRB，默认 HSV）。
//
// 色空间决定「三个字节各自代表什么」，而不是改变存储宽度（恒 3 字节）：
//   rgb → [R, G, B]；grb → [G, R, B]（部分灯带走 GRB 顺序）；hsv → [H, S, V]
// 取色器统一在 RGB 域工作，进出时按当前色空间换算。
import type { ControlSpec } from '@/definition/schema';
import type { ColorSpace } from '@/store/useUiStore';
import { useUiStore } from '@/store/useUiStore';
import { useControlValue } from '@/store/useMenuStore';
import { useDeviceStore } from '@/store/useDeviceStore';
import { ColorPicker } from '@/ui/primitives/ColorPicker';
import { cn } from '@/shared/cn';

export interface ColorControlProps {
  readonly control: ControlSpec;
  readonly disabled?: boolean;
}

const SPACES: readonly ColorSpace[] = ['hsv', 'rgb', 'grb'];

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** 按色空间把 24 位值解成 RGB 三元组（供取色器显示）。 */
export function decodeColor(value: number, space: ColorSpace): Rgb {
  const hi = (value >> 16) & 0xff;
  const mid = (value >> 8) & 0xff;
  const lo = value & 0xff;
  if (space === 'grb') return { r: mid, g: hi, b: lo };
  if (space === 'hsv') return hsvToRgb(hi, mid, lo);
  return { r: hi, g: mid, b: lo };
}

/** 把 RGB 三元组按色空间编码回 24 位值（供写入设备）。 */
export function encodeColor(rgb: Rgb, space: ColorSpace): number {
  const r = clamp255(rgb.r);
  const g = clamp255(rgb.g);
  const b = clamp255(rgb.b);
  if (space === 'grb') return ((g << 16) | (r << 8) | b) >>> 0;
  if (space === 'hsv') {
    const [h, s, v] = rgbToHsv(r, g, b);
    return ((h << 16) | (s << 8) | v) >>> 0;
  }
  return ((r << 16) | (g << 8) | b) >>> 0;
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = clamp255(r) / 255;
  const gn = clamp255(g) / 255;
  const bn = clamp255(b) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [clamp255(Math.round(h)), clamp255(Math.round(s * 255)), clamp255(Math.round(max * 255))];
}

export function hsvToRgb(h: number, s: number, v: number): Rgb {
  const hn = ((clamp255(h) / 255) * 360) % 360;
  const sn = clamp255(s) / 255;
  const vn = clamp255(v) / 255;
  const c = vn * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = vn - c;
  let rgb: [number, number, number];
  if (hn < 60) rgb = [c, x, 0];
  else if (hn < 120) rgb = [x, c, 0];
  else if (hn < 180) rgb = [0, c, x];
  else if (hn < 240) rgb = [0, x, c];
  else if (hn < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return {
    r: clamp255((rgb[0] + m) * 255),
    g: clamp255((rgb[1] + m) * 255),
    b: clamp255((rgb[2] + m) * 255),
  };
}

function toHex(rgb: Rgb): string {
  return `#${((1 << 24) | (clamp255(rgb.r) << 16) | (clamp255(rgb.g) << 8) | clamp255(rgb.b))
    .toString(16)
    .slice(1)}`;
}

export function ColorControl({ control, disabled }: ColorControlProps): React.JSX.Element {
  const value = useControlValue(control);
  const menuCommit = useDeviceStore((s) => s.menuCommit);
  const colorSpace = useUiStore((s) => s.colorSpace);
  const setPref = useUiStore((s) => s.setPref);
  const rgb = decodeColor(value, colorSpace);
  const hex = toHex(rgb);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-1">
        {SPACES.map((space) => (
          <button
            key={space}
            type="button"
            disabled={disabled}
            className={cn(
              'rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors',
              space === colorSpace
                ? 'bg-accent-soft text-accent'
                : 'bg-elevated text-fg-dim hover:text-fg',
            )}
            onClick={() => setPref('colorSpace', space)}
            title={`按 ${space.toUpperCase()} 解释这三个字节`}
          >
            {space.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-end gap-1">
          <div
            className="h-8 w-16 rounded-card border border-border"
            style={{ backgroundColor: hex }}
          />
          <span className="font-mono text-[10px] text-fg-dim">{hex.toUpperCase()}</span>
        </div>
        <div className={disabled ? 'pointer-events-none opacity-50' : ''}>
          <ColorPicker
            value={(clamp255(rgb.r) << 16) | (clamp255(rgb.g) << 8) | clamp255(rgb.b)}
            onChange={(next) => {
              const nextRgb: Rgb = {
                r: (next >> 16) & 0xff,
                g: (next >> 8) & 0xff,
                b: next & 0xff,
              };
              void menuCommit(control, encodeColor(nextRgb, colorSpace));
            }}
          />
        </div>
      </div>
    </div>
  );
}
