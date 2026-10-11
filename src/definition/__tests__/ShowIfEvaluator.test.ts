// showIf 引擎单测：覆盖语法子集、缺失变量语义、语法错误兜底，以及目标文件全部真实表达式（架构 §8.5）。
import { describe, expect, it } from 'vitest';
import { collectVars, compile, evaluate, isVisible } from '@/definition/ShowIfEvaluator';
import type { ShowIfContext } from '@/definition/ShowIfEvaluator';
import { collectShowIfExpressions, loadRealParsedDefinition } from './fixtures/realDefinition';
import type { MenuGroupNode, MenuNode } from '@/definition/schema';

const definition = loadRealParsedDefinition();

describe('ShowIfEvaluator · 语法子集', () => {
  it('相等 / 不等', () => {
    expect(isVisible('{a} == 0', { a: 0 })).toBe(true);
    expect(isVisible('{a} == 0', { a: 1 })).toBe(false);
    expect(isVisible('{a} != 0', { a: 0 })).toBe(false);
    expect(isVisible('{a} != 0', { a: 7 })).toBe(true);
  });

  it('逻辑与 / 或（C 语义：非 0 为真）', () => {
    expect(isVisible('{a} != 0 && {b} != 0', { a: 1, b: 1 })).toBe(true);
    expect(isVisible('{a} != 0 && {b} != 0', { a: 1, b: 0 })).toBe(false);
    expect(isVisible('{a} != 0 || {b} != 0', { a: 0, b: 3 })).toBe(true);
    expect(isVisible('{a} != 0 || {b} != 0', { a: 0, b: 0 })).toBe(false);
  });

  it('比较运算符与算术、括号、一元负号', () => {
    expect(isVisible('{a} > 5', { a: 6 })).toBe(true);
    expect(isVisible('{a} >= 5', { a: 5 })).toBe(true);
    expect(isVisible('{a} < 5', { a: 4 })).toBe(true);
    expect(isVisible('{a} <= 5', { a: 6 })).toBe(false);
    expect(isVisible('({a} + 2) * 3 == 15', { a: 3 })).toBe(true);
    expect(isVisible('{a} - 10 / 2 == 0', { a: 5 })).toBe(true);
    expect(isVisible('-3 == {a}', { a: -3 })).toBe(true);
  });

  it('裸标识符（不带花括号）也能解析', () => {
    expect(isVisible('a == 1', { a: 1 })).toBe(true);
  });

  it('变量缺失时视为 0，不抛错', () => {
    expect(isVisible('{missing} == 0', {})).toBe(true);
    expect(isVisible('{missing} != 0', {})).toBe(false);
  });

  it('语法错误时视为真（宁可多显示），并记录错误', () => {
    const result = evaluate('{a} == ', { a: 1 });
    expect(result.value).toBe(true);
    expect(result.error).toBeDefined();
  });

  it('常量表达式在编译期折叠', () => {
    expect(compile('1 == 1').folded).toBe(true);
    expect(compile('1 == 2').folded).toBe(false);
    expect(compile('{a} == 1').folded).toBeNull();
  });

  it('收集表达式引用的变量', () => {
    expect(collectVars('{a} != 0 && {b} == 1')).toEqual(['a', 'b']);
  });
});

describe('ShowIfEvaluator · 目标定义文件的真实表达式', () => {
  const expressions = collectShowIfExpressions(definition);

  it('全部真实表达式均无语法错误', () => {
    expect(expressions.length).toBeGreaterThan(0);
    for (const expr of expressions) {
      const compiled = compile(expr);
      expect(compiled.error, `${expr} 不应有语法错误`).toBeUndefined();
      expect(compiled.ast).not.toBeNull();
    }
  });

  it('覆盖文件中出现的全部 showIf（分组 2 条 + 叶子 58 条）', () => {
    const allShowIfCount =
      definition.controls.filter((c) => c.showIf).length +
      countGroupShowIf(definition.menus.map((m) => m.root));
    expect(allShowIfCount).toBe(60);
  });

  it('条件分组表达式在两种取值下互斥', () => {
    const zero: ShowIfContext = { id_actuation_mode: 0 };
    const one: ShowIfContext = { id_actuation_mode: 1 };
    expect(isVisible('{id_actuation_mode} == 0', zero)).toBe(true);
    expect(isVisible('{id_actuation_mode} == 0', one)).toBe(false);
    expect(isVisible('{id_actuation_mode} == 1', one)).toBe(true);
    expect(isVisible('{id_actuation_mode} == 1', zero)).toBe(false);
  });

  it('多段 AND 链按每个阈值正确判定', () => {
    const expr = '{e} != 0 && {e} != 24 && {e} != 28 && {e} != 29 && {e} != 32';
    for (const v of [1, 5, 23, 25, 30, 33, 255]) {
      expect(isVisible(expr, { e: v })).toBe(true);
    }
    for (const v of [0, 24, 28, 29, 32]) {
      expect(isVisible(expr, { e: v })).toBe(false);
    }
  });

  it('全部真实表达式在「变量全 0」与「变量全 1」两种上下文下都返回布尔值', () => {
    for (const expr of expressions) {
      const vars = collectVars(expr);
      const zeroCtx: Record<string, number> = {};
      const oneCtx: Record<string, number> = {};
      for (const v of vars) {
        zeroCtx[v] = 0;
        oneCtx[v] = 1;
      }
      expect(typeof isVisible(expr, zeroCtx)).toBe('boolean');
      expect(typeof isVisible(expr, oneCtx)).toBe('boolean');
    }
  });
});

/** 只统计分组节点（含顶层菜单根节点）上的 showIf，叶子控件不计入。 */
function countGroupShowIf(roots: readonly MenuGroupNode[]): number {
  let n = 0;
  const visit = (node: MenuNode): void => {
    if (node.kind !== 'group') return;
    if (node.showIf !== undefined) n += 1;
    for (const child of node.children) visit(child);
  };
  for (const root of roots) {
    if (root.showIf !== undefined) n += 1;
    for (const child of root.children) visit(child);
  }
  return n;
}
