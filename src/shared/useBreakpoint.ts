// 单一断点源（T06-8）：窄窗判定只允许从这里取，禁止各组件各自再写一版阈值。
//
// 断点语义（与 T06-1 对齐）：
//   - width < NARROW_BREAKPOINT（1080px）：侧栏折叠为图标态、键码面板折叠为抽屉；
//   - 最小窗口 960px（electron/main.cjs），即 960–1080 为窄窗区间。
import { useEffect, useState } from 'react';

export const NARROW_BREAKPOINT = 1080;

/** 纯函数：宽度是否落入窄窗区间（可单测）。 */
export function isNarrow(width: number, breakpoint: number = NARROW_BREAKPOINT): boolean {
  return Number.isFinite(width) && width < breakpoint;
}

/** 当前窗口宽度；无 window 环境（SSR / 测试）返回 Infinity（恒为宽窗，不触发折叠）。 */
export function useWindowWidth(): number {
  const read = (): number => (typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth);
  const [width, setWidth] = useState(read);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = (): void => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return width;
}

/** 窄窗判定 hook：单一断点源，AppShell / SideNav 统一使用。 */
export function useBreakpoint(breakpoint: number = NARROW_BREAKPOINT): boolean {
  const width = useWindowWidth();
  return isNarrow(width, breakpoint);
}
