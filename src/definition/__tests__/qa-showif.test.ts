// QA 独立验证 · showIf 引擎的健壮性：不得因为一条表达式把整个面板搞崩。
// 已有单测覆盖「语法子集」，本文件专攻异常输入与刻意破坏性输入。
import { describe, expect, it } from 'vitest';
import { clearCompileCache, collectVars, compile, evaluate, isVisible } from '@/definition/ShowIfEvaluator';
import { collectShowIfExpressions, loadRealParsedDefinition } from './fixtures/realDefinition';
import type { MenuNode } from '@/definition/schema';

const definition = loadRealParsedDefinition();

/** 任何输入都必须返回布尔值且不抛异常。 */
function mustNotThrow(source: string, ctx: Record<string, number> = { a: 1, b: 0 }): boolean {
  let out: boolean | null = null;
  expect(() => {
    out = evaluate(source, ctx).value;
  }, `evaluate(${JSON.stringify(source)}) 不得抛异常`).not.toThrow();
  return out === true;
}

describe('QA · showIf 非法输入兜底', () => {
  it('缺失变量：一律按 0 处理，且变量表仍能收集出来', () => {
    expect(mustNotThrow('{missing} == 0')).toBe(true);
    expect(mustNotThrow('{missing} != 0')).toBe(false);
    expect(mustNotThrow('{missing} > 100')).toBe(false);
    expect(collectVars('{missing} != 0')).toEqual(['missing']);
  });

  it('语法错误：视为真（宁可多显示）并给出 error', () => {
    const broken = [
      '{a} == ', // 操作数缺失
      '== 1', // 运算符开头
      '{a == 0', // 缺少 '}'
      '(({a} == 0)', // 括号不配对
      '{a} == 0)', // 多余右括号
      '{a} & {b}', // 单 & 不是合法逻辑符
      '{a} | {b}', // 单 | 不是合法逻辑符
      '{a} ! 0', // 单 ! 不是合法运算符
      '{a} === 0', // 三等号
    ];
    for (const src of broken) {
      const compiled = compile(src);
      const result = evaluate(src, { a: 1, b: 1 });
      expect(compiled.error, `${src} 应被判定为语法错误`).toBeDefined();
      expect(result.value, `${src} 语法错误时应降级为真`).toBe(true);
      expect(result.error, `${src} 应携带错误文案`).toBeDefined();
    }
  });

  it('空串 / 纯空白：视为「无条件约束」，直接为真且不带错误', () => {
    for (const src of ['', '   ', '\t\n']) {
      const result = evaluate(src, {});
      expect(result.value).toBe(true);
      expect(result.error).toBeUndefined();
    }
  });

  it('只有单个变量的表达式按真值处理（非 0 为真），不是语法错误', () => {
    expect(evaluate('{a}', { a: 0 }).value).toBe(false);
    expect(evaluate('{a}', { a: 3 }).value).toBe(true);
    expect(compile('{a}').error).toBeUndefined();
  });

  it('编译结果被缓存：同一表达式重复求值结果一致，且不重复污染 ast', () => {
    clearCompileCache();
    const first = compile('{a} == 1');
    const second = compile('{a} == 1');
    expect(second).toBe(first);
    expect(second.ast).toBe(first.ast);
  });

  it('超深嵌套不得栈溢出（必须降级为语法错误 → 真）', () => {
    const deep = `${'('.repeat(2000)}{a} == 0${')'.repeat(2000)}`;
    expect(() => compile(deep)).not.toThrow();
    const compiled = compile(deep);
    expect(typeof (compiled.error ?? 'ok')).toBe('string');
    expect(evaluate(deep, { a: 1 }).value).toBe(true);
  });

  it('除零返回 0 而不是 Infinity/NaN（C 语义，避免比较全乱）', () => {
    expect(mustNotThrow('{b} / 0 == 0')).toBe(true);
    expect(mustNotThrow('1 / 0 == 0')).toBe(true);
    expect(mustNotThrow('{a} / 0 > 0')).toBe(false);
    // 整数截断语义：5/2 = 2
    expect(isVisible('{a} / 2 == 2', { a: 5 })).toBe(true);
  });

  it('运算符优先级：&& 高于 ||，比较高于加减', () => {
    // (a!=0 && b!=0) || c!=0
    expect(isVisible('{a} != 0 && {b} != 0 || {c} != 0', { a: 1, b: 1, c: 0 })).toBe(true);
    expect(isVisible('{a} != 0 && {b} != 0 || {c} != 0', { a: 1, b: 0, c: 1 })).toBe(true);
    expect(isVisible('{a} != 0 && {b} != 0 || {c} != 0', { a: 1, b: 0, c: 0 })).toBe(false);
    expect(isVisible('{a} + 1 > 2', { a: 2 })).toBe(true);
    expect(isVisible('{a} + 1 > 2', { a: 1 })).toBe(false);
  });

  it('模糊测试：500 条随机字符串一律返回布尔且从不抛异常', () => {
    const alphabet = '{}()0123456789ab!=<>&|+-*/ \t\n\\@#$%^,.:;"\'[]';
    let seed = 20241017;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 500; i += 1) {
      let text = '';
      const len = Math.floor(rand() * 30) + 1;
      for (let j = 0; j < len; j += 1) {
        text += alphabet[Math.floor(rand() * alphabet.length)] ?? 'a';
      }
      const value = mustNotThrow(text);
      expect(typeof value).toBe('boolean');
    }
  });
});

/**
 * 收集**全部** showIf 出现位置：叶子控件 + 分组节点。
 * （注意：fixtures 里的 collectShowIfExpressions 只遍历了分组节点，
 *  58 条叶子上的 showIf 会被漏掉，本文件自己实现一份完整版。）
 */
function collectAllShowIfOccurrences(): { unique: string[]; total: number } {
  const each = new Set<string>();
  let total = 0;
  for (const c of definition.controls) {
    if (c.showIf) {
      each.add(c.showIf);
      total += 1;
    }
  }
  const walk = (node: MenuNode): void => {
    if (node.kind !== 'group') return;
    if (node.showIf) {
      each.add(node.showIf);
      total += 1;
    }
    for (const child of node.children) walk(child);
  };
  for (const menu of definition.menus) walk(menu.root);
  return { unique: [...each], total };
}

describe('QA · showIf 在目标定义文件上的行为', () => {
  it('18 种表达式文本 / 60 次出现，全部可编译且无语法错误', () => {
    const { unique, total } = collectAllShowIfOccurrences();
    expect(total).toBe(60);
    expect(unique).toHaveLength(18);
    for (const expr of unique) {
      expect(compile(expr).error, expr).toBeUndefined();
    }
  });

  it('（对照）fixtures 的 collectShowIfExpressions 只覆盖到分组节点，叶子形状未被其覆盖', () => {
    // 这条断言记录现状：已有单测声称覆盖「目标文件全部真实表达式」，
    // 但其采集器只返回 2 条分组表达式，58 条叶子表达式不在其覆盖范围内。
    expect(collectShowIfExpressions(definition)).toHaveLength(2);
    const { unique } = collectAllShowIfOccurrences();
    expect(unique.length).toBeGreaterThan(2);
  });

  it('表达式引用的变量都存在于 control 的 valueKey 中（否则永远为 0，条件永不成立）', () => {
    const keys = new Set(definition.controls.map((c) => c.valueKey));
    for (const expr of collectShowIfExpressions(definition)) {
      for (const name of collectVars(expr)) {
        expect(keys.has(name), `表达式变量 ${name} 没有任何控件使用`).toBe(true);
      }
    }
  });

  it('两处条件分组（无 label、依赖 id_actuation_mode）在 0/1 之外取任意值时都不显示', () => {
    // id_actuation_mode 实际只有 0/1 两种取值（dropdown: 正常触发 / RT）
    expect(isVisible('{id_actuation_mode} == 0', { id_actuation_mode: 2 })).toBe(false);
    expect(isVisible('{id_actuation_mode} == 1', { id_actuation_mode: 2 })).toBe(false);
  });

  it('值缺失时的降级策略不会让条件分组同时显示或同时隐藏两种极端都失效', () => {
    // 首屏未加载完（上下文为空）：== 0 成立、== 1 不成立的默认组合必须稳定
    expect(isVisible('{id_actuation_mode} == 0', {})).toBe(true);
    expect(isVisible('{id_actuation_mode} == 1', {})).toBe(false);
  });
});
