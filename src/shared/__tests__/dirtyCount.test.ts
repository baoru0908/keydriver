// 脏计数上报单测（T06-3 渲染进程侧门控）：
// 聚合口径、bridge 缺失降级 no-op、getter 取最新值（防 zustand Set 快照过期）。
import { describe, expect, it } from 'vitest';
import { createDirtyReporter, totalDirtyCount } from '@/shared/dirtyCount';

function makeBridge() {
  const calls: number[] = [];
  return {
    calls,
    setDirtyCount(count: number): void {
      calls.push(count);
    },
  };
}

describe('totalDirtyCount 聚合口径', () => {
  it('正常求和', () => {
    expect(totalDirtyCount(3, 4)).toBe(7);
  });

  it('负数 / 非有限值按 0 处理，结果不小于 0', () => {
    expect(totalDirtyCount(-2, 5)).toBe(5);
    expect(totalDirtyCount(Number.NaN, 2)).toBe(2);
    expect(totalDirtyCount(Number.POSITIVE_INFINITY, 1)).toBe(1);
    expect(totalDirtyCount(0, 0)).toBe(0);
  });
});

describe('createDirtyReporter（IPC 门控）', () => {
  it('push 立即推送一次聚合值；订阅回调触发重推', () => {
    const bridge = makeBridge();
    let keymapDirty = 2;
    let menuDirty = 0;
    // 模拟 zustand subscribe：只注册、不立即触发（真 store 亦如此）
    const notifyRef: { current: (() => void) | null } = { current: null };
    const reporter = createDirtyReporter(
      bridge,
      () => ({ size: keymapDirty }),
      () => ({ size: menuDirty }),
      (listener) => {
        notifyRef.current = listener;
        return () => {
          notifyRef.current = null;
        };
      },
    );
    reporter.push();
    expect(bridge.calls).toEqual([2]);

    keymapDirty = 3;
    menuDirty = 1;
    notifyRef.current?.();
    expect(bridge.calls).toEqual([2, 4]);
  });

  it('bridge 缺失（浏览器 / 测试环境）时整体 no-op，不抛错', () => {
    const reporter = createDirtyReporter(
      null,
      () => ({ size: 5 }),
      () => ({ size: 5 }),
      () => () => undefined,
    );
    expect(() => reporter.push()).not.toThrow();
    reporter.dispose();
  });

  it('getter 在 push 时才取值（读到最新集合，非挂载期快照）', () => {
    const bridge = makeBridge();
    const sets: Array<{ size: number }> = [{ size: 0 }];
    const reporter = createDirtyReporter(
      bridge,
      () => sets[sets.length - 1] ?? { size: 0 },
      () => ({ size: 0 }),
      () => () => undefined,
    );
    sets.push({ size: 9 });
    reporter.push();
    expect(bridge.calls).toEqual([9]);
  });

  it('dispose 退订后不再推送', () => {
    const bridge = makeBridge();
    let listeners = 0;
    const reporter = createDirtyReporter(
      bridge,
      () => ({ size: 1 }),
      () => ({ size: 1 }),
      (listener) => {
        listeners += 1;
        void listener;
        return () => {
          listeners -= 1;
        };
      },
    );
    expect(listeners).toBe(1);
    reporter.dispose();
    expect(listeners).toBe(0);
  });
});
