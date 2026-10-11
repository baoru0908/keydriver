// 单键渲染：主/副矩形（w2/h2）、c 色三档映射、选中态、键码显示名、decal 态。
import type { KleKey } from '@/definition/schema';
import { formatKeycap } from '@/keycodes/KeycodeFormatter';
import { cn } from '@/shared/cn';

export interface KeyWidgetProps {
  readonly kleKey: KleKey;
  readonly keycode: number;
  readonly scale: number;
  readonly selected: boolean;
  readonly onSelect: () => void;
  /** 画布原点（包围盒左上角，像素）：键位坐标需减去它才能贴齐画布左上角（默认 0） */
  readonly originX?: number;
  readonly originY?: number;
}

const TONE_CLASS = {
  accent: 'bg-key-accent text-fg',
  mod: 'bg-key-mod text-fg',
  alpha: 'bg-key-base text-fg',
  special: 'bg-key-special text-fg-muted',
} as const;

export function KeyWidget({
  kleKey,
  keycode,
  scale,
  selected,
  onSelect,
  originX = 0,
  originY = 0,
}: KeyWidgetProps): React.JSX.Element {
  const { rect, rect2, decal } = kleKey;
  const lines = formatKeycap(keycode);

  const styleOf = (r: { x: number; y: number; w: number; h: number }): React.CSSProperties => ({
    left: (r.x - originX) * scale,
    top: (r.y - originY) * scale,
    width: r.w * scale,
    height: r.h * scale,
  });

  const base = cn(
    'absolute flex flex-col items-center justify-center overflow-hidden rounded-key border text-[10px] leading-tight transition-colors',
    'border-black/25 keycap-base',
    selected ? 'ring-2 ring-accent' : 'hover:brightness-110',
    // 装饰键也要带 tone 底色：keycap-base 只有 box-shadow，没有底色，
    // 去掉 tone 后装饰键会变成「透明空洞」，被误读成键位图缺键。
    decal ? cn('opacity-60', TONE_CLASS[kleKey.tone]) : TONE_CLASS[kleKey.tone],
  );

  return (
    <>
      {rect2 ? (
        <div className={cn(base, 'pointer-events-none')} style={styleOf(rect2)} aria-hidden />
      ) : null}
      <button
        type="button"
        className={base}
        style={styleOf(rect)}
        onClick={onSelect}
        title={`矩阵 (${kleKey.matrix.row},${kleKey.matrix.col})`}
        aria-label={decal ? `装饰键 矩阵 (${kleKey.matrix.row},${kleKey.matrix.col})` : undefined}
      >
        {decal ? null : (
          <span className="flex flex-col items-center px-0.5 text-center">
            {lines.map((line, i) => (
              <span key={i} className="max-w-full truncate">
                {line}
              </span>
            ))}
          </span>
        )}
      </button>
    </>
  );
}
