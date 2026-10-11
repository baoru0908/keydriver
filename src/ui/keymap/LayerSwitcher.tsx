// 层切换器：Layer 0..N（N 来自握手读到的 layerCount，不硬编码）。
import { useDeviceStore } from '@/store/useDeviceStore';
import { useKeymapStore } from '@/store/useKeymapStore';
import { shouldShowConnectionInfo } from '@/ui/device/connectionInfo';
import { cn } from '@/shared/cn';

export function LayerSwitcher(): React.JSX.Element | null {
  const handshake = useDeviceStore((s) => s.handshake);
  const state = useDeviceStore((s) => s.state);
  const currentLayer = useKeymapStore((s) => s.currentLayer);
  const setCurrentLayer = useKeymapStore((s) => s.setCurrentLayer);
  const count = handshake?.layerCount ?? 0;

  // 层数来自握手结论，属于连接态信息：未连接时整块不渲染（不显示「层数未知」占位）
  if (!shouldShowConnectionInfo(state)) return null;

  if (count === 0) return <span className="text-[11px] text-fg-dim">层数未知</span>;

  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-[11px] text-fg-dim">层</span>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => setCurrentLayer(i)}
          aria-pressed={i === currentLayer}
          className={cn(
            'h-6 min-w-6 rounded px-1.5 text-[11px] font-mono transition-colors',
            i === currentLayer
              ? 'bg-accent text-bg'
              : 'bg-elevated text-fg-muted hover:bg-border hover:text-fg',
          )}
        >
          {i}
        </button>
      ))}
    </div>
  );
}
