// 断点单测（T06-8）：isNarrow 纯函数 + 单一断点源常量。
import { describe, expect, it } from 'vitest';
import { NARROW_BREAKPOINT, isNarrow } from '@/shared/useBreakpoint';

describe('isNarrow（T06-8 单一断点源）', () => {
  it('默认断点 1080：960（最小窗口）与 1080 以下均为窄窗', () => {
    expect(NARROW_BREAKPOINT).toBe(1080);
    expect(isNarrow(960)).toBe(true);
    expect(isNarrow(1079)).toBe(true);
    expect(isNarrow(1080)).toBe(false);
    expect(isNarrow(1081)).toBe(false);
    expect(isNarrow(1200)).toBe(false);
  });

  it('自定义断点生效（测试可注入）', () => {
    expect(isNarrow(500, 600)).toBe(true);
    expect(isNarrow(600, 600)).toBe(false);
  });

  it('非有限宽度（SSR / 无 window）恒为宽窗，不触发折叠', () => {
    expect(isNarrow(Number.NaN)).toBe(false);
    expect(isNarrow(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
