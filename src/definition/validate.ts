// 定义文件校验：Zod schema + 字段级错误收集（架构 R-P0-01：解析失败要字段级提示，不白屏）。
import { z } from 'zod';
import type { DefinitionIssue, ViaDefinition } from './schema';

const KlePropsSchema = z
  .object({
    x: z.number().optional(),
    y: z.number().optional(),
    w: z.number().optional(),
    h: z.number().optional(),
    x2: z.number().optional(),
    y2: z.number().optional(),
    w2: z.number().optional(),
    h2: z.number().optional(),
    c: z.string().optional(),
    d: z.boolean().optional(),
    r: z.number().optional(),
    rx: z.number().optional(),
    ry: z.number().optional(),
  })
  .passthrough();

const KleItemSchema = z.union([z.string(), KlePropsSchema]);
const KleRowSchema = z.array(KleItemSchema);

/** content 作为值内容时的形态：[valueKey, channel, valueId, ...indexes] */
const ValueContentSchema = z.array(z.union([z.string(), z.number()])).min(3);

/** 递归节点的宽松形态（content 可能是子节点数组或值内容，无法用单一 TS 类型精确表达）。 */
export interface MenuNodeLike {
  label?: string;
  type?: string;
  options?: unknown;
  content?: unknown;
  showIf?: string;
  children?: unknown;
}

// 递归 schema：z.lazy 自引用会导致隐式 any，故显式断言为宽松类型
const MenuNodeSchema = z.lazy(() =>
  z
    .object({
      label: z.string().optional(),
      type: z.string().optional(),
      options: z.unknown().optional(),
      content: z.union([z.array(MenuNodeSchema), ValueContentSchema]).optional(),
      showIf: z.string().optional(),
      children: z.array(MenuNodeSchema).optional(),
    })
    .passthrough(),
) as unknown as z.ZodType<MenuNodeLike>;

const CustomKeycodeSchema = z
  .object({
    name: z.string(),
    title: z.string().optional(),
    shortName: z.string().optional(),
  })
  .passthrough();

export const ViaDefinitionSchema = z
  .object({
    name: z.string(),
    vendorId: z.union([z.string(), z.number()]),
    productId: z.union([z.string(), z.number()]),
    matrix: z.object({ rows: z.number(), cols: z.number() }),
    customKeycodes: z.array(CustomKeycodeSchema).optional(),
    // menus 的元素允许是官方预设菜单的 id 字符串（如 "qmk_rgblight"），
    // 展开动作在 DefinitionParser 里由 resolveCommonMenus 完成（对齐官方 flatMap 语义）。
    menus: z.array(z.union([z.string(), MenuNodeSchema])).optional(),
    layouts: z.object({
      labels: z.array(z.union([z.string(), z.array(z.string())])).optional(),
      keymap: z.array(KleRowSchema),
    }),
    lighting: z.unknown().optional(),
  })
  .passthrough();

export interface ValidateResult {
  readonly ok: boolean;
  readonly data?: ViaDefinition;
  readonly issues: readonly DefinitionIssue[];
}

function pathToString(path: readonly (string | number | symbol)[]): string {
  if (path.length === 0) return 'root';
  return path
    .map((seg, i) => (typeof seg === 'number' ? `[${seg}]` : i === 0 ? String(seg) : `.${String(seg)}`))
    .join('');
}

/** 校验并归一化一份定义文件；失败时返回字段级 issue 列表。 */
export function validateDefinition(input: unknown): ValidateResult {
  const result = ViaDefinitionSchema.safeParse(input);
  if (result.success) {
    const data = result.data as ViaDefinition;
    const issues: DefinitionIssue[] = [];
    if (data.lighting !== undefined) {
      issues.push({
        level: 'warn',
        path: 'lighting',
        message: '检测到 V2 遗留字段 lighting，V3 不使用，已忽略',
      });
    }
    if (!data.menus || data.menus.length === 0) {
      issues.push({ level: 'warn', path: 'menus', message: '定义文件没有 menus，仅可使用改键功能' });
    } else {
      // category 是我们加的导航扩展字段，VIA 规范并不要求：缺它的菜单仍属合法顶层 Tab，
      // 只是会落到侧栏的中性分组里，因此提醒而非报错（文案取自数据本身）。
      data.menus.forEach((menu, index) => {
        // 字符串形式的预设菜单此刻还没展开，label 未知，交由展开步骤处理（未知 id 会产出 warn）
        if (typeof menu === 'string') return;
        if (menu.category) return;
        const name = menu.label ?? `#${index}`;
        issues.push({
          level: 'warn',
          path: `menus[${index}]`,
          message: `菜单「${name}」没有 category 字段，将显示在侧栏的中性分组中（VIA 规范里 menus 即为顶层 Tab，缺少该扩展字段属正常）`,
        });
      });
    }
    return { ok: true, data, issues };
  }
  const issues: DefinitionIssue[] = result.error.issues.map((issue) => ({
    level: 'error' as const,
    path: pathToString(issue.path),
    message: issue.message,
  }));
  return { ok: false, issues };
}

/** 解析 `0x1234` / `"4660"` / `4660` 三种形态的 ID（定义文件字段形态不统一）。 */
export function parseId(value: string | number): number {
  if (typeof value === 'number') return value >>> 0;
  const text = value.trim();
  if (/^0[xX][0-9a-fA-F]+$/.test(text)) return Number.parseInt(text.slice(2), 16) >>> 0;
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) ? n >>> 0 : 0;
}
