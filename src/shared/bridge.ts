// electron/preload.cjs 经 contextBridge 暴露的 `window.keydriver` 的类型与守卫。
//
// ⚠️ bridge 只在 Electron（加载 preload）环境存在；浏览器 / 测试 / SSR 环境为 undefined，
// 任何调用方都必须经 getBridge() 判空，禁止直接摸 window.keydriver。
//
// 通道约定（唯一 IPC 面，全部 `keydriver:` 前缀，主进程 electron/main.cjs 接收）：
//   - setDirtyCount      → 'keydriver:setDirtyCount'      关窗拦截门控
//   - setBackgroundColor → 'keydriver:setBackgroundColor' 主题同步窗口底色
export interface KeydriverBridge {
  setDirtyCount(count: number): void;
  setBackgroundColor(color: string): void;
}

declare global {
  interface Window {
    keydriver?: KeydriverBridge;
  }
}

/** 取 IPC bridge；不可用（浏览器 / 测试 / SSR）时返回 null。 */
export function getBridge(): KeydriverBridge | null {
  if (typeof window === 'undefined') return null;
  return window.keydriver ?? null;
}
