// 测试夹具：从项目内的目标定义文件加载真实数据（唯一允许出现键盘特征词的目录，架构 A6）。
// 该文件不内联任何键盘名称，只负责定位与读取 JSON，因此硬编码守卫对源码的约束依然成立。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ParsedDefinition, ViaDefinition } from '@/definition/schema';
import { parseViaDefinition } from '@/definition/DefinitionParser';

const CANDIDATES = [
  'definitions/7-19-Em60_cn.json',
  '../definitions/7-19-Em60_cn.json',
  '../../definitions/7-19-Em60_cn.json',
  '../../../definitions/7-19-Em60_cn.json',
];

let cachedRaw: ViaDefinition | null = null;

/** 读取目标定义文件的原始 JSON。 */
export function loadRealDefinitionRaw(): ViaDefinition {
  if (cachedRaw) return cachedRaw;
  for (const rel of CANDIDATES) {
    try {
      const text = readFileSync(resolve(process.cwd(), rel), 'utf8');
      cachedRaw = JSON.parse(text) as ViaDefinition;
      return cachedRaw;
    } catch {
      // 继续尝试下一个候选路径
    }
  }
  throw new Error('未找到目标定义文件 definitions/7-19-Em60_cn.json（请在项目根目录运行测试）');
}

let cachedParsed: ParsedDefinition | null = null;

/** 解析目标定义文件（带缓存，避免重复解析 349 个控件）。 */
export function loadRealParsedDefinition(): ParsedDefinition {
  if (cachedParsed) return cachedParsed;
  const result = parseViaDefinition(loadRealDefinitionRaw());
  if (!result.ok || !result.definition) {
    throw new Error(`目标定义文件解析失败：${JSON.stringify(result.issues.slice(0, 5))}`);
  }
  cachedParsed = result.definition;
  return cachedParsed;
}

/** 收集定义文件中全部 showIf 表达式（含分组与叶子）。 */
export function collectShowIfExpressions(definition: ParsedDefinition): string[] {
  const out = new Set<string>();
  const visit = (node: { readonly kind: string } & Record<string, unknown>): void => {
    if (typeof node.showIf === 'string' && node.showIf.length > 0) out.add(node.showIf);
    const children = node.children;
    if (Array.isArray(children)) {
      for (const child of children) visit(child as { readonly kind: string } & Record<string, unknown>);
    }
  };
  for (const menu of definition.menus) {
    if (menu.root.showIf) out.add(menu.root.showIf);
    for (const child of menu.root.children) {
      visit(child as unknown as { readonly kind: string } & Record<string, unknown>);
    }
  }
  return [...out];
}
