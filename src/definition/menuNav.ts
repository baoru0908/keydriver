// 左侧导航「定义栏目」的分组计算：完全由当前加载的定义文件驱动，源码零硬编码任何菜单名。
// 换成任何一份 VIA 定义文件（菜单数量、菜单名、category 取值都可能不同）都能自己长出导航。
//
// 不变量（务必保持，单测在 tests/menu-nav.test.ts 中逐条断言）：
//   1. 守恒：所有 section 的 menus 数量之和 === 输入 menus 数量（不丢菜单、不复制菜单）；
//   2. 保序：分组会「归堆」重排，但把 sections 按序展开后，菜单的相对顺序与输入完全一致；
//            （同一分组内部同样保持定义文件中的出现顺序）
//   3. 非空：每个 section 的 menus 至少 1 个。
import type { MenuNavItem } from '@/store/useDefinitionStore';
import type { CategoryId } from './schema';

/** 导航行所用的图标语义键（不直接依赖 lucide，保持本模块可单测）。 */
export type NavIconKey = 'capability' | 'lighting' | 'actuation' | 'profiles';

/** 侧栏的一个分组；独立行时 label 为 undefined。 */
export interface NavSection {
  /** 稳定唯一 key（分组：`cat:<category>`；独立行：`menu:<menuId>`）。 */
  readonly key: string;
  /** 分组标题；独立行（无标题）时为 undefined。 */
  readonly label?: string;
  readonly iconKey: NavIconKey;
  /** 至少 1 个。 */
  readonly menus: readonly MenuNavItem[];
}

/**
 * 参与「合并成带标题分组」的 category 集合。
 *
 * 只有这三个值会把多个菜单归堆成一个分组；其余情况一律渲染成独立行。
 * 原因：keycaps / device / macros 属于**平台级固定栏目**（键位 / 设备 / 宏在侧栏另有常驻入口），
 * 定义文件里带这几个 category 的菜单一律作为独立行渲染，避免导航与固定栏目耦合。
 * 未知的 category 值（未来新增）同样降级为独立行——宁可多一行，也绝不能丢菜单。
 */
const GROUPED_CATEGORIES: ReadonlySet<CategoryId> = new Set<CategoryId>([
  'lighting',
  'actuation',
  'profiles',
]);

/** 分组标题：导航结构词（对应 Wootility 的 灯光 / 性能 / 配置），不是任何键盘特征词。 */
const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  lighting: '灯光',
  actuation: '性能',
  profiles: '配置',
};

/** 分组 category 与图标键的对应（值为约定俗成的语义图标）。 */
const CATEGORY_ICON_KEYS: Readonly<Record<string, NavIconKey>> = {
  lighting: 'lighting',
  actuation: 'actuation',
  profiles: 'profiles',
};

/** 计算过程中可变的 section（构建完毕后以 NavSection 只读形态返回）。 */
interface MutableNavSection {
  readonly key: string;
  readonly label?: string;
  readonly iconKey: NavIconKey;
  readonly menus: MenuNavItem[];
}

/**
 * 由定义文件的顶层菜单生成侧栏分组。
 *
 * 算法：
 *   · 按菜单在定义文件中的出现顺序遍历；
 *   · category 属于 GROUPED_CATEGORIES → 归入该 category 的分组，分组按首次出现顺序排列；
 *   · 无 category、或 category 不在 GROUPED_CATEGORIES 内（含未知值）→ 生成独立 section
 *     （label 为 undefined，iconKey 为 'capability'，menus 只含它自己）。
 *
 * @param menus 定义文件的顶层菜单列表（来自 selectMenuNavItems）
 * @returns 可直接渲染的导航分组列表
 */
export function buildDefinitionNavSections(
  menus: readonly MenuNavItem[],
): readonly NavSection[] {
  const sections: MutableNavSection[] = [];
  /** 已建分组的索引，保证同一 category 只建一次且可追加菜单。 */
  const grouped = new Map<CategoryId, MutableNavSection>();

  for (const menu of menus) {
    const category = menu.category;
    if (category !== undefined && GROUPED_CATEGORIES.has(category)) {
      const existing = grouped.get(category);
      if (existing !== undefined) {
        existing.menus.push(menu);
        continue;
      }
      const section: MutableNavSection = {
        key: `cat:${category}`,
        label: CATEGORY_LABELS[category] ?? menu.label,
        iconKey: CATEGORY_ICON_KEYS[category] ?? 'capability',
        menus: [menu],
      };
      grouped.set(category, section);
      sections.push(section);
      continue;
    }
    // 无 category / 平台级固定栏目 category / 未知 category → 独立行
    sections.push({
      key: `menu:${menu.id}`,
      label: undefined,
      iconKey: 'capability',
      menus: [menu],
    });
  }

  return sections;
}
