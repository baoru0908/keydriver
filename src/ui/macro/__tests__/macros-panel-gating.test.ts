// 宏面板「菜单就绪门控」测试：菜单控件值没读完之前，不得把 MenuGenerator 渲染出去。
//
// 背景（真实缺陷）：本面板有懒加载 effect，但渲染处缺少就绪门控，
// 于是菜单尚未加载完成时就先把生成器渲染出去 —— 此时 showIfContext 里该菜单的
// 变量全部缺失 → 按 0 求值 → 条件控件会**先灰一下再亮起来**（闪一下）。
// 正确做法与 MenuPane 一致：loadedMenus 命中后才渲染，未就绪时给占位空态。
//
// 两个取舍：
// 1) 用 vi.mock + 假快照：SSR 下 zustand 走 getInitialState 分支，setState 改不动渲染结果；
//    把 hook 换成「读一份可注入的假快照」才能真正构造「加载中 / 已加载」两种场景。
// 2) 把 MenuGenerator 换成只会打标记的桩：被测对象是「这一层的门控」，不是生成器内部；
//    真实生成器的语义由 src/ui/menu/__tests__ 覆盖。顺带避开整个 radix 控件依赖图，
//    让本文件不至于在并行跑时被 SSR 冷启动挤出假超时。
import { describe, expect, it, vi } from 'vitest';
import type { DeviceFacade } from '@/core/device';
import type { MenuDef, MenuNodeRaw, ParsedDefinition } from '@/definition/schema';
import type { MenuGeneratorProps } from '@/ui/menu/MenuGenerator';
import { flattenMenus } from '@/definition/MenuFlattener';

/** 设备 store 假快照：已连接 + 菜单加载函数（SSR 下 effect 不跑，这里只防空引用）。 */
const fakeDevice = vi.hoisted(() => ({
  snapshot: {
    state: 'connected',
    busy: false,
    error: null,
    menuLoad: async () => undefined,
    menuCommit: async () => true,
    menuTrigger: async () => true,
  } as Record<string, unknown>,
}));

/** 定义 store 假快照：只有 definition 字段被用到。 */
const fakeDefinition = vi.hoisted(() => ({
  snapshot: { definition: null } as Record<string, unknown>,
}));

/** 菜单 store 假快照：loadedMenus 由用例按需切换，模拟「加载中 / 已加载」。 */
const fakeMenu = vi.hoisted(() => ({
  snapshot: {
    values: {} as Record<string, number>,
    addressValues: {} as Record<string, number>,
    showIfContext: {} as Record<string, number>,
    loadedMenus: new Set<string>(),
    dirty: new Set<string>(),
    status: 'idle',
    progress: 0,
    error: null,
  } as Record<string, unknown>,
}));

/** 把 zustand hook 替身：选择器直接跑在我们注入的假快照上。 */
function makeHook(snapshot: Record<string, unknown>): (selector?: (s: unknown) => unknown) => unknown {
  return Object.assign((selector?: (s: unknown) => unknown) => (selector ? selector(snapshot) : snapshot), {
    getState: () => snapshot,
    setState: () => undefined,
    subscribe: () => () => undefined,
    getInitialState: () => snapshot,
    destroy: () => undefined,
  });
}

/**
 * 设备 store：不引真实模块（会拖进 hid / 定义库整张图），只给面板与控件需要的字段。
 * getFacade 必须返回非 null，否则面板会走「未连接」早退分支。
 */
vi.mock('@/store/useDeviceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/useDeviceStore')>();
  const facade = {
    getMacroSize: async (): Promise<number> => 64,
    getMacroBuffer: async (_offset: number, size: number): Promise<Uint8Array> =>
      new Uint8Array(size),
    setMacroBuffer: async (): Promise<void> => undefined,
  } as unknown as DeviceFacade;
  return {
    ...actual,
    useDeviceStore: makeHook(fakeDevice.snapshot) as unknown as typeof actual.useDeviceStore,
    getFacade: () => facade,
  };
});

vi.mock('@/store/useDefinitionStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/useDefinitionStore')>();
  return {
    ...actual,
    useDefinitionStore: makeHook(fakeDefinition.snapshot) as unknown as typeof actual.useDefinitionStore,
  };
});

vi.mock('@/store/useMenuStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/useMenuStore')>();
  return {
    ...actual,
    useMenuStore: makeHook(fakeMenu.snapshot) as unknown as typeof actual.useMenuStore,
  };
});

/** 生成器桩：只留一个可断言的标记，断言「到底有没有被渲染」最干净。 */
vi.mock('@/ui/menu/MenuGenerator', async () => {
  const React = await import('react');
  return {
    MenuGenerator: (props: MenuGeneratorProps) =>
      React.createElement('div', { 'data-menu-generator': props.menu.id }),
  };
});

/** 用与定义文件完全相同的结构拼一个宏类菜单，走真实解析器。 */
function buildMacrosMenu(): MenuDef {
  const rawMenus: readonly MenuNodeRaw[] = [
    {
      label: '宏菜单',
      content: [
        {
          label: '宏分组',
          content: [{ label: '宏开关', type: 'toggle', content: ['k_macro_src', 1, 1] }],
        },
      ],
    },
  ];
  const result = flattenMenus(rawMenus);
  const errors = result.issues.filter((i) => i.level === 'error');
  expect(errors, `定义解析不应报错：${JSON.stringify(errors)}`).toEqual([]);
  const menu = result.menus[0];
  if (!menu) throw new Error('菜单构建失败');
  // category 归属来自导航配置，这里显式标注为宏类（面板按该字段筛选）
  return { ...menu, category: 'macros' };
}

/** 只保留面板用到的字段，其余字段与本用例无关。 */
function buildDefinition(menus: readonly MenuDef[]): ParsedDefinition {
  return { menus } as unknown as ParsedDefinition;
}

/** 渲染面板为静态 HTML 字符串（node 环境，无 DOM）。 */
async function renderPanel(): Promise<string> {
  const { MacrosPanel } = await import('../MacrosPanel');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const React = await import('react');
  return renderToStaticMarkup(React.createElement(MacrosPanel));
}

/** 统计生成器桩（含菜单 id）被渲染了几次。 */
function generatorMarks(html: string, menuId: string): number {
  return html.split(`data-menu-generator="${menuId}"`).length - 1;
}

describe('宏面板 · 菜单未就绪时不渲染条件控件', () => {
  it('未就绪：不渲染生成器（不会先灰后亮），并给出占位空态而不是白屏', async () => {
    const menu = buildMacrosMenu();
    fakeDefinition.snapshot.definition = buildDefinition([menu]);
    fakeMenu.snapshot.loadedMenus = new Set<string>(); // 尚未加载完成

    const html = await renderPanel();

    // 菜单标题来自定义文件，属于静态骨架，始终在
    expect(html).toContain('宏菜单');
    // 核心断言：生成器一个都没渲染 —— 否则就会拿缺失变量先求值一次，条件控件先灰后亮
    expect(generatorMarks(html, menu.id)).toBe(0);
    // 占位空态必须给出来，不能白屏
    expect(html).toContain('控件值尚未读取完成');
  }, 60000);

  it('已就绪：loadedMenus 命中后正常渲染生成器', async () => {
    const menu = buildMacrosMenu();
    fakeDefinition.snapshot.definition = buildDefinition([menu]);
    fakeMenu.snapshot.loadedMenus = new Set<string>([menu.id]);

    const html = await renderPanel();

    expect(generatorMarks(html, menu.id)).toBe(1);
    expect(html).not.toContain('控件值尚未读取完成');
  }, 60000);

  it('多菜单场景：只有就绪的那一个渲染生成器，另一个仍是占位', async () => {
    const ready = buildMacrosMenu();
    const pending: MenuDef = {
      ...buildMacrosMenu(),
      id: `${ready.id}-pending`,
      label: '待加载菜单',
    };
    fakeDefinition.snapshot.definition = buildDefinition([ready, pending]);
    fakeMenu.snapshot.loadedMenus = new Set<string>([ready.id]);

    const html = await renderPanel();

    expect(html).toContain('待加载菜单');
    expect(generatorMarks(html, ready.id)).toBe(1);
    expect(generatorMarks(html, pending.id)).toBe(0);
    // 恰好一条占位：未就绪的那个仍然不渲染
    expect(html.split('控件值尚未读取完成').length - 1).toBe(1);
  }, 60000);
});
