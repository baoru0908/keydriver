// 主题 provider：把当前主题同步到 <html> class，并经 IPC bridge 同步原生窗口底色（T06-10）。
import { useEffect, type ReactNode } from 'react';
import { useUiStore } from '@/store/useUiStore';
import { getBridge } from '@/shared/bridge';

/** 各主题的窗口底色：直接读 @theme 令牌的当前计算值，避免在 JS 里硬编码 hex。 */
function currentBg(root: HTMLElement): string | null {
  const bg = getComputedStyle(root).getPropertyValue('--color-bg').trim();
  return /^#[0-9a-f]{6}$/i.test(bg) ? bg : null;
}

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('theme-dark', theme === 'dark');
    root.classList.toggle('theme-light', theme === 'light');
    root.style.colorScheme = theme;
    // T06-10：Electron 下经唯一 bridge 同步窗口 backgroundColor（消除主题切换时的边缝闪色）；
    // 浏览器无 bridge，由 CSS body 背景承载（main.cjs 会校验颜色合法性）。
    const bridge = getBridge();
    if (bridge) {
      const bg = currentBg(root);
      if (bg) bridge.setBackgroundColor(bg);
    }
  }, [theme]);

  return <>{children}</>;
}
