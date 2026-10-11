// 未保存改动数的聚合与推送（T06-3 关窗拦截的渲染进程侧）。
//
// 设计：把「订阅两个 store → 聚合脏计数 → 经 bridge 推给主进程」收敛成一个可单测的
// 小模块；AppShell 只负责组装。bridge 不可用（浏览器 / 测试）时全部 no-op。
//
// ⚠️ 来源必须是 getter：zustand 每次变更会生成新的 Set 实例，
// 捕获旧快照会读到过期数据，因此按需 getState() 取最新集合。
export interface DirtySource {
  readonly size: number;
}

export interface DirtyReporter {
  /** 立即读取并推送一次（挂载时调用，防主进程残留旧计数）。 */
  push(): void;
  /** 解除订阅。 */
  dispose(): void;
}

/** 聚合脏计数：负数 / 非有限值一律按 0 处理（防御主进程收到脏数据）。 */
export function totalDirtyCount(a: number, b: number): number {
  const clamp = (n: number): number => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  return clamp(a) + clamp(b);
}

/**
 * 创建脏计数上报器：经 getter 读取两个来源的最新值，订阅回调里重算并推送。
 * @param bridge IPC bridge（可为 null / undefined → no-op）
 * @param getSourceA 键位脏集合 getter（useKeymapStore.getState().dirtyKeys）
 * @param getSourceB 菜单脏集合 getter（useMenuStore.getState().dirty）
 * @param subscribe zustand subscribe 的可注入实现（默认必传；测试可注入假实现）
 */
export function createDirtyReporter(
  bridge: { setDirtyCount(count: number): void } | null | undefined,
  getSourceA: () => DirtySource,
  getSourceB: () => DirtySource,
  subscribe: (listener: () => void) => () => void,
): DirtyReporter {
  const compute = (): number => totalDirtyCount(getSourceA().size, getSourceB().size);
  const push = (): void => bridge?.setDirtyCount(compute());

  if (!bridge) {
    return { push: () => undefined, dispose: () => undefined };
  }

  const unsubscribe = subscribe(push);
  return { push, dispose: unsubscribe };
}
