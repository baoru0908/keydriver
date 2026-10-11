// Any 键码输入：QMK 常量名 / hex / 十进制 / 函数式，带实时解析反馈。
import { useState } from 'react';
import { parseAnyKeycode } from '@/keycodes/AnyKeycodeParser';
import { Button } from '@/ui/primitives/Button';
import { cn } from '@/shared/cn';

export interface AnyKeycodeInputProps {
  readonly onApply: (keycode: number) => void;
}

export function AnyKeycodeInput({ onApply }: AnyKeycodeInputProps): React.JSX.Element {
  const [text, setText] = useState('');
  const result = text.trim() === '' ? null : parseAnyKeycode(text);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Any：KC_A / LCTL(KC_A) / 0x0141 / 321"
          className={cn(
            'h-7 flex-1 rounded-card border bg-elevated px-2 font-mono text-xs text-fg outline-none placeholder:font-sans placeholder:text-fg-dim',
            result && !result.ok ? 'border-danger' : 'border-border',
          )}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={!result?.ok}
          onClick={() => {
            if (result?.ok && result.keycode !== undefined) onApply(result.keycode);
          }}
        >
          应用
        </Button>
      </div>
      <div className={cn('text-[11px]', result && !result.ok ? 'text-danger' : 'text-fg-dim')}>
        {result === null
          ? '支持 QMK 常量名、十六进制、十进制与函数式写法'
          : result.ok
            ? `解析结果 0x${(result.keycode ?? 0).toString(16).toUpperCase().padStart(4, '0')}`
            : result.message}
      </div>
    </div>
  );
}
