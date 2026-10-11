// showIf 表达式引擎：递归下降 Parser → AST → 求值（架构 §8.5）。语法错误视为「真」以宁可多显示。

export type Expr =
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 'var'; readonly name: string }
  | { readonly kind: 'binary'; readonly op: BinaryOp; readonly left: Expr; readonly right: Expr };

export type BinaryOp =
  | '=='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | '&&'
  | '||'
  | '+'
  | '-'
  | '*'
  | '/';

export type ShowIfContext = Readonly<Record<string, number>>;

export interface CompiledExpr {
  readonly source: string;
  readonly ast: Expr | null;
  /** 常量表达式在编译期折叠后的结果（无变量依赖时为 true/false） */
  readonly folded: boolean | null;
  readonly error?: string;
}

export interface EvalResult {
  /** 求值结果（C 语义：非 0 为真） */
  readonly value: boolean;
  readonly error?: string;
}

const cache = new Map<string, CompiledExpr>();

const CMP_OPS: readonly string[] = ['==', '!=', '>=', '<=', '>', '<'];
const LOGIC_OPS: readonly string[] = ['&&', '||'];
const ADD_OPS: readonly string[] = ['+', '-'];
const MUL_OPS: readonly string[] = ['*', '/'];

interface Token {
  readonly type: 'num' | 'var' | 'op' | 'lparen' | 'rparen';
  readonly text: string;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i] ?? '';
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen', text: '(' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', text: ')' });
      i += 1;
      continue;
    }
    if (ch === '{') {
      const end = input.indexOf('}', i);
      if (end < 0) throw new Error(`变量缺少 '}'：${input}`);
      tokens.push({ type: 'var', text: input.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9]/.test(input[j] ?? '')) j += 1;
      tokens.push({ type: 'num', text: input.slice(i, j) });
      i = j;
      continue;
    }
    // 标识符（裸变量名，VIA 也允许不带花括号的写法）
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j] ?? '')) j += 1;
      tokens.push({ type: 'var', text: input.slice(i, j) });
      i = j;
      continue;
    }
    const two = input.slice(i, i + 2);
    const matched = [...CMP_OPS, ...LOGIC_OPS, ...ADD_OPS, ...MUL_OPS].find((op) => two.startsWith(op));
    if (matched) {
      tokens.push({ type: 'op', text: matched });
      i += matched.length;
      continue;
    }
    const one = ch;
    if ([...CMP_OPS, ...ADD_OPS, ...MUL_OPS].includes(one)) {
      tokens.push({ type: 'op', text: one });
      i += 1;
      continue;
    }
    throw new Error(`无法识别的字符 '${ch}'：${input}`);
  }
  return tokens;
}

class Parser {
  private pos = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  parse(): Expr {
    const expr = this.parseOr();
    if (this.pos < this.tokens.length) {
      throw new Error(`表达式尾部有多余内容：${JSON.stringify(this.tokens.slice(this.pos))}`);
    }
    return expr;
  }

  private peek(): Token | null {
    return this.tokens[this.pos] ?? null;
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    for (;;) {
      const t = this.peek();
      if (!t || t.type !== 'op' || t.text !== '||') break;
      this.pos += 1;
      left = { kind: 'binary', op: '||', left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseCmp();
    for (;;) {
      const t = this.peek();
      if (!t || t.type !== 'op' || t.text !== '&&') break;
      this.pos += 1;
      left = { kind: 'binary', op: '&&', left, right: this.parseCmp() };
    }
    return left;
  }

  private parseCmp(): Expr {
    let left = this.parseAdd();
    for (;;) {
      const t = this.peek();
      if (!t || t.type !== 'op' || !CMP_OPS.includes(t.text)) break;
      this.pos += 1;
      const op = t.text as BinaryOp;
      left = { kind: 'binary', op, left, right: this.parseAdd() };
    }
    return left;
  }

  private parseAdd(): Expr {
    let left = this.parseMul();
    for (;;) {
      const t = this.peek();
      if (!t || t.type !== 'op' || !ADD_OPS.includes(t.text)) break;
      this.pos += 1;
      const op = t.text as BinaryOp;
      left = { kind: 'binary', op, left, right: this.parseMul() };
    }
    return left;
  }

  private parseMul(): Expr {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (!t || t.type !== 'op' || !MUL_OPS.includes(t.text)) break;
      this.pos += 1;
      const op = t.text as BinaryOp;
      left = { kind: 'binary', op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Expr {
    const t = this.peek();
    if (!t) throw new Error('表达式意外结束');
    if (t.type === 'num') {
      this.pos += 1;
      return { kind: 'num', value: Number.parseInt(t.text, 10) };
    }
    if (t.type === 'var') {
      this.pos += 1;
      return { kind: 'var', name: t.text };
    }
    if (t.type === 'lparen') {
      this.pos += 1;
      const inner = this.parseOr();
      const close = this.peek();
      if (!close || close.type !== 'rparen') throw new Error("缺少 ')'");
      this.pos += 1;
      return inner;
    }
    if (t.type === 'op' && (t.text === '-' || t.text === '+')) {
      this.pos += 1;
      const operand = this.parseUnary();
      return {
        kind: 'binary',
        op: t.text === '-' ? '-' : '+',
        left: { kind: 'num', value: 0 },
        right: operand,
      };
    }
    throw new Error(`意外的 token：${t.text}`);
  }
}

function hasVar(expr: Expr): boolean {
  if (expr.kind === 'var') return true;
  if (expr.kind === 'num') return false;
  return hasVar(expr.left) || hasVar(expr.right);
}

function evalExpr(expr: Expr, ctx: ShowIfContext): number {
  switch (expr.kind) {
    case 'num':
      return expr.value;
    case 'var':
      // 变量缺失时视为 0（架构 §8.5 规则 1：避免首屏未加载完时闪烁）
      return ctx[expr.name] ?? 0;
    case 'binary': {
      const l = evalExpr(expr.left, ctx);
      const r = evalExpr(expr.right, ctx);
      switch (expr.op) {
        case '==':
          return l === r ? 1 : 0;
        case '!=':
          return l !== r ? 1 : 0;
        case '>':
          return l > r ? 1 : 0;
        case '>=':
          return l >= r ? 1 : 0;
        case '<':
          return l < r ? 1 : 0;
        case '<=':
          return l <= r ? 1 : 0;
        case '&&':
          return l !== 0 && r !== 0 ? 1 : 0;
        case '||':
          return l !== 0 || r !== 0 ? 1 : 0;
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          return r === 0 ? 0 : Math.trunc(l / r);
        default:
          return 0;
      }
    }
    default:
      return 0;
  }
}

/** 编译表达式（带缓存）。语法错误时不抛异常，错误记录在 CompiledExpr.error。 */
export function compile(source: string): CompiledExpr {
  const cached = cache.get(source);
  if (cached) return cached;
  let compiled: CompiledExpr;
  try {
    const ast = new Parser(tokenize(source)).parse();
    const folded = hasVar(ast) ? null : evalExpr(ast, {}) !== 0;
    compiled = { source, ast, folded };
  } catch (e) {
    compiled = { source, ast: null, folded: null, error: e instanceof Error ? e.message : String(e) };
  }
  cache.set(source, compiled);
  return compiled;
}

/** 求值一条 showIf；语法错误视为真（架构 §8.5 规则 4：宁可多显示）。 */
export function evaluate(source: string | undefined, ctx: ShowIfContext): EvalResult {
  if (source === undefined || source.trim() === '') return { value: true };
  const compiled = compile(source);
  if (compiled.ast === null) return { value: true, error: compiled.error };
  if (compiled.folded !== null) return { value: compiled.folded };
  return { value: evalExpr(compiled.ast, ctx) !== 0 };
}

/** 布尔化判断：给 group / leaf 双层求值使用的便捷入口。 */
export function isVisible(source: string | undefined, ctx: ShowIfContext): boolean {
  return evaluate(source, ctx).value;
}

/** 收集表达式引用的变量名（用于懒加载时确定需要读取哪些控件）。 */
export function collectVars(source: string | undefined): string[] {
  if (!source) return [];
  const compiled = compile(source);
  if (!compiled.ast) return [];
  const out = new Set<string>();
  const walk = (expr: Expr): void => {
    if (expr.kind === 'var') out.add(expr.name);
    else if (expr.kind === 'binary') {
      walk(expr.left);
      walk(expr.right);
    }
  };
  walk(compiled.ast);
  return [...out];
}

/** 清空编译缓存（仅测试用）。 */
export function clearCompileCache(): void {
  cache.clear();
}
