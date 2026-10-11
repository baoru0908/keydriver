// 取色器：react-colorful + HSV/RGB 双数值显示（Q4：色空间可切换）。
import { HexColorPicker } from 'react-colorful';
import { useUiStore } from '@/store/useUiStore';

export interface ColorPickerProps {
  /** 0xRRGGBB */
  readonly value: number;
  readonly onChange: (value: number) => void;
}

function toHex(value: number): string {
  return `#${(value & 0xffffff).toString(16).padStart(6, '0')}`;
}

function fromHex(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16) & 0xffffff;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
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
  return [Math.round(h), Math.round(s * 100), Math.round(max * 100)];
}

export function ColorPicker({ value, onChange }: ColorPickerProps): React.JSX.Element {
  const colorSpace = useUiStore((s) => s.colorSpace);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  const [h, s, v] = rgbToHsv(r, g, b);

  return (
    <div className="flex items-start gap-3">
      <HexColorPicker color={toHex(value)} onChange={(hex) => onChange(fromHex(hex))} />
      <div className="flex flex-col gap-1 font-mono text-[11px] text-fg-muted">
        <div className="flex h-8 w-16 items-center justify-center rounded-card border border-border" style={{ backgroundColor: toHex(value) }}>
          <span className="text-bg">{toHex(value).toUpperCase()}</span>
        </div>
        <div>RGB {r},{g},{b}</div>
        <div>HSV {h},{s},{v}</div>
        <div>色空间 {colorSpace.toUpperCase()}</div>
      </div>
    </div>
  );
}
