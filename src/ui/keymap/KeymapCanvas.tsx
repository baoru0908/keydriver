// 键位画布：按 KleKey.rect 绝对定位渲染，自动计算包围盒与缩放（架构 §8.6 / A3）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDefinitionStore } from '@/store/useDefinitionStore';
import { useDeviceStore } from '@/store/useDeviceStore';
import { useKeymapStore, selectKeycode } from '@/store/useKeymapStore';
import { selectKeys } from '@/definition/DefinitionParser';
import { boundingBox, fitScale } from '@/definition/KleGeometry';
import { KeyWidget } from './KeyWidget';
import { ProgressBar } from '@/ui/primitives/ProgressBar';

export function KeymapCanvas(): React.JSX.Element {
  const definition = useDefinitionStore((s) => s.definition);
  const layoutOptions = useDeviceStore((s) => s.layoutOptions);
  const currentLayer = useKeymapStore((s) => s.currentLayer);
  const selected = useKeymapStore((s) => s.selected);
  const select = useKeymapStore((s) => s.select);
  const loading = useKeymapStore((s) => s.loading);
  const loadProgress = useKeymapStore((s) => s.loadProgress);
  const keymapState = useKeymapStore();

  const [containerWidth, setContainerWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  /**
   * 用 **callback ref** 而非 useRef + useEffect([]) 测量容器宽度：
   * `loading` 为 true 时本组件提前 return 进度条（见下方），真正的容器 div 还没渲染，
   * 若用 deps=[] 的 effect，那一帧 containerRef.current 为 null → effect 直接 return，
   * 之后容器才挂载但 effect 不会再跑 → containerWidth 永远是 0 → scale 恒为 1 →
   * 画布按 954px 原始像素宽度渲染，出现常驻横向滚动条且右侧键位被截断。
   * callback ref 在节点每次挂载/卸载时都会被调用，天然覆盖这种延迟挂载。
   */
  const measureRef = useCallback((node: HTMLDivElement | null): void => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) {
      setContainerWidth(0);
      return;
    }
    const update = (): void => setContainerWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    },
    [],
  );

  // 布局选项变化后必须重新压紧行号，否则底行位置会错乱（A3）
  const keys = useMemo(
    () => (definition ? selectKeys(definition, layoutOptions) : []),
    [definition, layoutOptions],
  );

  const box = useMemo(() => boundingBox(keys), [keys]);
  const scale = containerWidth > 0 ? fitScale(box.width, containerWidth) : 1;

  if (!definition) return <></>;

  if (loading) {
    return (
      <div className="rounded-card border border-border bg-surface p-6">
        <ProgressBar value={loadProgress} label="正在读取键位…" />
      </div>
    );
  }

  return (
    // ⚠️ padding 必须放在外层：被测量的元素自身不能有 padding，
    // 否则 clientWidth（content + padding）比内容区大 32px，缩放后恒定溢出 32px。
    <div className="rounded-card border border-border bg-surface p-4">
      <div ref={measureRef} className="min-w-0 overflow-x-auto">
        <div
          className="relative"
          style={{
            width: box.width * scale,
            height: box.height * scale,
            // 首帧尚未测到宽度时 scale 退化为 1，先隐藏，避免闪一下超宽画布
            visibility: containerWidth > 0 ? 'visible' : 'hidden',
          }}
        >
          {keys.map((key) => {
            const keycode = selectKeycode(keymapState, currentLayer, key.matrix.row, key.matrix.col);
            const isSelected =
              selected !== null && selected.row === key.matrix.row && selected.col === key.matrix.col;
            return (
              <KeyWidget
                key={`${key.matrix.row},${key.matrix.col},${key.group ?? 'x'},${key.option ?? 'x'}`}
                kleKey={key}
                keycode={keycode}
                scale={scale}
                selected={isSelected}
                originX={box.minX}
                originY={box.minY}
                onSelect={() => select({ row: key.matrix.row, col: key.matrix.col })}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
