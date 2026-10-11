// 防抖 / 节流工具：range、color 控件高频写入的防抖窗口（架构 R7）。

export interface Debounced<A extends readonly unknown[]> {
  (...args: A): void;
  /** 立即执行挂起中的调用（面板失焦 / 保存前调用，避免丢最后一次值）。 */
  flush(): void;
  /** 丢弃挂起中的调用。 */
  cancel(): void;
  /** 当前是否有挂起调用。 */
  readonly pending: boolean;
}

/**
 * 创建防抖函数。窗口内新参数覆盖旧参数（只保留最后一次），
 * 窗口到期后才真正执行——满足「拖 100 次只发 1 次写」。
 */
export function debounce<A extends readonly unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;

  const flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (lastArgs !== null) {
      const args = lastArgs;
      lastArgs = null;
      fn(...args);
    }
  };

  const debounced = (...args: A): void => {
    lastArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, waitMs);
  };

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
  };

  return Object.assign(debounced, {
    flush,
    cancel,
    get pending(): boolean {
      return lastArgs !== null;
    },
  });
}

/** 节流：保证每 waitMs 内最多执行一次，首次立即执行。 */
export function throttle<A extends readonly unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
): (...args: A) => void {
  let last = 0;
  return (...args: A): void => {
    const now = Date.now();
    if (now - last >= waitMs) {
      last = now;
      fn(...args);
    }
  };
}
