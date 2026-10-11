// 主题 provider：把当前主题同步到 <html> class，并提供 children 透传（架构 T01.2）。
import { useEffect, type ReactNode } from 'react';
import { useUiStore } from '@/store/useUiStore';

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('theme-dark', theme === 'dark');
    root.classList.toggle('theme-light', theme === 'light');
    root.style.colorScheme = theme;
  }, [theme]);

  return <>{children}</>;
}
