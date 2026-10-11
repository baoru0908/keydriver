// 对 document.startViewTransition 的薄封装（T03-2 零成本动效）。
//
// 设计目标：
//   - 零运行时依赖，纯 DOM API 封装；
//   - 在不支持 View Transitions API 的环境（旧浏览器 / SSR / 测试 / Node）下，直接同步执行
//     更新函数，等价于「无转场」，绝不抛错或中断交互；
//   - 与 T03-1 的动效令牌、T03-2 的 keyframes 配合，用于 SideNav / 面板切换转场。
//
// 用法：
//   const transition = useViewTransition();
//   transition(() => setCurrentPanel('menu'));   // 面板切换带转场
// 或脱离 React 直接用 withViewTransition(() => { ... })。
import { useCallback } from 'react';

/** 当前环境是否支持 View Transitions API（TS DOM lib 已提供 startViewTransition 类型）。 */
function supportsViewTransition(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  return typeof document.startViewTransition === 'function';
}

/**
 * 包裹一次 DOM 更新，优先使用 View Transitions API；
 * 不支持时降级为直接执行（无动画但不报错）。返回 void，调用方无需 await。
 */
export function withViewTransition(update: () => void | Promise<void>): void {
  if (!supportsViewTransition()) {
    void update();
    return;
  }
  void document.startViewTransition(() => Promise.resolve(update()));
}

/**
 * React 钩子：返回稳定的转场封装函数，供组件内调用（避免每次渲染新建闭包）。
 */
export function useViewTransition(): (update: () => void | Promise<void>) => void {
  return useCallback((update: () => void | Promise<void>) => {
    withViewTransition(update);
  }, []);
}
