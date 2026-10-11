// VIA 官方预设菜单（官方实现称之为 commonMenus）。
// 定义文件的 `menus` 数组允许直接写预设菜单的 id 字符串（如 `"menus": ["qmk_rgblight"]`），
// 官方 the-via/app 在 `menusSlice.tryResolveCommonMenu` 里把字符串展开成完整菜单对象。
// 本文件只落「数据 + 展开函数」，不含任何与具体键盘相关的逻辑。
//
// 数据来源：@the-via/reader 的 common-menus 产物（官方 npm 包），原样转写为 TS 常量。
import type { DefinitionIssue, MenuEntryRaw, MenuNodeRaw, ValueContent } from './schema';

/** 官方支持的 5 个预设菜单 id。 */
export type CommonMenuKey =
  | 'qmk_audio'
  | 'qmk_backlight'
  | 'qmk_backlight_rgblight'
  | 'qmk_rgb_matrix'
  | 'qmk_rgblight';

const QMK_AUDIO: readonly MenuNodeRaw[] = [
  {
    label: 'Audio',
    content: [
      {
        label: 'General',
        content: [
          { label: 'Audio Enable', type: 'toggle', content: ['id_qmk_audio_enable', 4, 1] },
          { label: 'Audio Clicky Enable', type: 'toggle', content: ['id_qmk_audio_clicky_enable', 4, 2] },
        ],
      },
    ],
  },
];

const QMK_BACKLIGHT: readonly MenuNodeRaw[] = [
  {
    label: 'Lighting',
    content: [
      {
        label: 'Backlight',
        content: [
          {
            label: 'Backlight Brightness',
            type: 'range',
            options: [0, 255],
            content: ['id_qmk_backlight_brightness', 1, 1],
          },
          {
            label: 'Backlight Effect',
            type: 'dropdown',
            content: ['id_qmk_backlight_effect', 1, 2],
            options: [
              ['Off', 0],
              ['Breathing', 1],
            ],
          },
        ],
      },
    ],
  },
];

/** qmk_backlight 与 qmk_rgblight 都用到的 RGBLIGHT 下拉选项（保持与官方取值顺序一致）。 */
const RGBLIGHT_EFFECT_OPTIONS: readonly string[] = [
  'All Off',
  'Solid Color',
  'Breathing 1',
  'Breathing 2',
  'Breathing 3',
  'Breathing 4',
  'Rainbow Mood 1',
  'Rainbow Mood 2',
  'Rainbow Mood 3',
  'Rainbow Swirl 1',
  'Rainbow Swirl 2',
  'Rainbow Swirl 3',
  'Rainbow Swirl 4',
  'Rainbow Swirl 5',
  'Rainbow Swirl 6',
  'Snake 1',
  'Snake 2',
  'Snake 3',
  'Snake 4',
  'Snake 5',
  'Snake 6',
  'Knight 1',
  'Knight 2',
  'Knight 3',
  'Christmas',
  'Gradient 1',
  'Gradient 2',
  'Gradient 3',
  'Gradient 4',
  'Gradient 5',
  'Gradient 6',
  'Gradient 7',
  'Gradient 8',
  'Gradient 9',
  'Gradient 10',
  'RGB Test',
  'Alternating',
  'Twinkle 1',
  'Twinkle 2',
  'Twinkle 3',
  'Twinkle 4',
  'Twinkle 5',
  'Twinkle 6',
];

const QMK_BACKLIGHT_RGBLIGHT: readonly MenuNodeRaw[] = [
  {
    label: 'Lighting',
    content: [
      {
        label: 'Backlight',
        content: [
          {
            label: 'Backlight Brightness',
            type: 'range',
            options: [0, 255],
            content: ['id_qmk_backlight_brightness', 1, 1],
          },
          {
            label: 'Backlight Effect',
            type: 'dropdown',
            content: ['id_qmk_backlight_effect', 1, 2],
            options: [
              ['Off', 0],
              ['Breathing', 1],
            ],
          },
        ],
      },
      {
        label: 'Underglow',
        content: [
          {
            label: 'Brightness',
            type: 'range',
            options: [0, 255],
            content: ['id_qmk_rgblight_brightness', 2, 1],
          },
          {
            label: 'Effect',
            type: 'dropdown',
            content: ['id_qmk_rgblight_effect', 2, 2],
            options: RGBLIGHT_EFFECT_OPTIONS,
          },
          {
            showIf: '{id_qmk_rgblight_effect} != 0',
            label: 'Effect Speed',
            type: 'range',
            options: [0, 255],
            content: ['id_qmk_rgblight_effect_speed', 2, 3],
          },
          {
            showIf: '{id_qmk_rgblight_effect} != 0 && {id_qmk_rgblight_effect} != 35',
            label: 'Color',
            type: 'color',
            content: ['id_qmk_rgblight_color', 2, 4],
          },
        ],
      },
    ],
  },
];

const QMK_RGB_MATRIX: readonly MenuNodeRaw[] = [
  {
    label: 'Lighting',
    content: [
      {
        label: 'Backlight',
        content: [
          {
            label: 'Brightness',
            type: 'range',
            options: [0, 255],
            content: ['id_qmk_rgb_matrix_brightness', 3, 1],
          },
          {
            label: 'Effect',
            type: 'dropdown',
            content: ['id_qmk_rgb_matrix_effect', 3, 2],
            options: [
              'All Off',
              'Solid Color',
              'Alphas Mods',
              'Gradient Up/Down',
              'Gradient Left/Right',
              'Breathing',
              'Band Sat.',
              'Band Val.',
              'Pinwheel Sat.',
              'Pinwheel Val.',
              'Spiral Sat.',
              'Spiral Val.',
              'Cycle All',
              'Cycle Left/Right',
              'Cycle Up/Down',
              'Rainbow Moving Chevron',
              'Cycle Out/In',
              'Cycle Out/In Dual',
              'Cycle Pinwheel',
              'Cycle Spiral',
              'Dual Beacon',
              'Rainbow Beacon',
              'Rainbow Pinwheels',
              'Raindrops',
              'Jellybean Raindrops',
              'Hue Breathing',
              'Hue Pendulum',
              'Hue Wave',
              'Pixel Rain',
              'Pixel Flow',
              'Pixel Fractal',
              'Typing Heatmap',
              'Digital Rain',
              'Solid Reactive Simple',
              'Solid Reactive',
              'Solid Reactive Wide',
              'Solid Reactive Multi Wide',
              'Solid Reactive Cross',
              'Solid Reactive Multi Cross',
              'Solid Reactive Nexus',
              'Solid Reactive Multi Nexus',
              'Splash',
              'Multi Splash',
              'Solid Splash',
              'Solid Multi Splash',
            ],
          },
          {
            showIf: '{id_qmk_rgb_matrix_effect} != 0',
            label: 'Effect Speed',
            type: 'range',
            options: [0, 255],
            content: ['id_qmk_rgb_matrix_effect_speed', 3, 3],
          },
          {
            showIf:
              '{id_qmk_rgb_matrix_effect} != 0 && {id_qmk_rgb_matrix_effect} != 24 && {id_qmk_rgb_matrix_effect} != 28 && {id_qmk_rgb_matrix_effect} != 29 && {id_qmk_rgb_matrix_effect} != 32',
            label: 'Color',
            type: 'color',
            content: ['id_qmk_rgb_matrix_color', 3, 4],
          },
        ],
      },
    ],
  },
];

const QMK_RGBLIGHT: readonly MenuNodeRaw[] = [
  {
    label: 'Lighting',
    content: [
      {
        label: 'Underglow',
        content: [
          {
            label: 'Brightness',
            type: 'range',
            options: [0, 255],
            content: ['id_qmk_rgblight_brightness', 2, 1],
          },
          {
            label: 'Effect',
            type: 'dropdown',
            content: ['id_qmk_rgblight_effect', 2, 2],
            options: RGBLIGHT_EFFECT_OPTIONS,
          },
          {
            showIf: '{id_qmk_rgblight_effect} != 0',
            label: 'Effect Speed',
            type: 'range',
            options: [0, 255],
            content: ['id_qmk_rgblight_effect_speed', 2, 3],
          },
          {
            showIf: '{id_qmk_rgblight_effect} != 0 && {id_qmk_rgblight_effect} != 35',
            label: 'Color',
            type: 'color',
            content: ['id_qmk_rgblight_color', 2, 4],
          },
        ],
      },
    ],
  },
];

/** id → 菜单数组（官方结构：每个预设是一个长度为 1 的菜单数组，故展开必须用 flatMap）。 */
export const COMMON_MENUS: Readonly<Record<CommonMenuKey, readonly MenuNodeRaw[]>> = {
  qmk_audio: QMK_AUDIO,
  qmk_backlight: QMK_BACKLIGHT,
  qmk_backlight_rgblight: QMK_BACKLIGHT_RGBLIGHT,
  qmk_rgb_matrix: QMK_RGB_MATRIX,
  qmk_rgblight: QMK_RGBLIGHT,
};

/** 全部预设 id，顺序与官方定义一致（用于告警文案，文案取自数据本身）。 */
export const COMMON_MENU_KEYS: readonly CommonMenuKey[] = [
  'qmk_audio',
  'qmk_backlight',
  'qmk_backlight_rgblight',
  'qmk_rgb_matrix',
  'qmk_rgblight',
];

/** 类型守卫：该 id 是否落入官方预设集合（对应官方的 Object.keys(commonMenus).includes(menu)）。 */
export function isCommonMenuKey(key: string): key is CommonMenuKey {
  return (COMMON_MENU_KEYS as readonly string[]).includes(key);
}

/** menus 元素是否为官方预设 id。 */
export function isMenuEntryRef(entry: MenuEntryRaw): entry is string {
  return typeof entry === 'string';
}

function isMenuNode(value: unknown): value is MenuNodeRaw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneUnknown(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => cloneUnknown(item));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = cloneUnknown(v);
    return out;
  }
  return value;
}

/**
 * 复制 content 数组。
 * 判别口径与 MenuFlattener 一致：首元素为字符串 → 值内容元组；否则视为子节点数组。
 */
function cloneContent(raw: readonly unknown[]): MenuNodeRaw['content'] {
  if (typeof raw[0] === 'string') return raw.slice() as ValueContent;
  return raw.filter(isMenuNode).map(cloneMenuTree);
}

/**
 * 深拷贝一个菜单节点。预设数据是模块级共享常量，同一份定义里可能被引用多次
 * （甚至同一个 id 写两遍），下游一旦就地修改就会污染后续展开，故每次展开都先复制。
 */
function cloneMenuTree(node: MenuNodeRaw): MenuNodeRaw {
  const copy: MenuNodeRaw = {};
  if (node.label !== undefined) copy.label = node.label;
  if (node.category !== undefined) copy.category = node.category;
  if (node.type !== undefined) copy.type = node.type;
  if (node.options !== undefined) copy.options = cloneUnknown(node.options);
  if (node.showIf !== undefined) copy.showIf = node.showIf;
  if (Array.isArray(node.content)) copy.content = cloneContent(node.content);
  if (Array.isArray(node.children)) copy.children = node.children.filter(isMenuNode).map(cloneMenuTree);
  return copy;
}

export interface ResolvedMenuEntries {
  /** 展开后的 menus（与定义文件里内联的菜单同级、保序）。 */
  readonly menus: readonly MenuNodeRaw[];
  /** 与 menus 一一对应的来源标记：来自预设时为预设 id，内联菜单为 undefined。 */
  readonly commonKeys: readonly (string | undefined)[];
  readonly issues: readonly DefinitionIssue[];
}

/**
 * 把 `menus` 里的字符串元素展开为官方预设菜单（等价于官方实现里的
 * `definition.menus.flatMap(tryResolveCommonMenu)`）。
 *
 * 未知 id 不阻断整份定义文件：记一条 warn 并跳过该菜单，其余菜单照常展开。
 */
export function resolveCommonMenus(entries: readonly MenuEntryRaw[]): ResolvedMenuEntries {
  const menus: MenuNodeRaw[] = [];
  const commonKeys: (string | undefined)[] = [];
  const issues: DefinitionIssue[] = [];

  entries.forEach((entry, index) => {
    if (!isMenuEntryRef(entry)) {
      menus.push(entry);
      commonKeys.push(undefined);
      return;
    }
    if (!isCommonMenuKey(entry)) {
      issues.push({
        level: 'warn',
        path: `menus[${index}]`,
        message: `未知的官方预设菜单 id「${entry}」，已跳过该菜单；当前支持的预设：${COMMON_MENU_KEYS.join('、')}`,
      });
      return;
    }
    for (const node of COMMON_MENUS[entry]) {
      menus.push(cloneMenuTree(node));
      commonKeys.push(entry);
    }
  });

  return { menus, commonKeys, issues };
}
