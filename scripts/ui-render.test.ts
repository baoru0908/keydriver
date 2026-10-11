// UI 渲染冒烟：在 Node 中把组件树渲染为字符串，验证模块图与首屏无异常（无硬件条件下的最小保障）。
// ⚠️ SSR 下 zustand 走 getInitialState，故本测试只验证「可渲染」，不验证交互后的状态。
import { describe, expect, it } from 'vitest';

class StorageStub {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

(globalThis as unknown as { localStorage: Storage }).localStorage = new StorageStub() as unknown as Storage;
(globalThis as unknown as { document: unknown }).document = {
  documentElement: {
    classList: { toggle: () => undefined, add: () => undefined, remove: () => undefined },
    style: {},
  },
};

describe('UI 渲染冒烟', () => {
  // ⚠️ 首次 import('@/App') 需要按需 transform 整张组件图（react-dom/server + AppShell
  // + 全部 primitives + Radix），冷启动开销远超 vitest 默认 5s 超时。
  // 这是 transform 成本而非代码 hang，故显式放宽超时（勿删本用例，其价值真实存在）。
  it(
    'App 组件树可渲染，四区骨架齐全',
    async () => {
      const { renderToString } = await import('react-dom/server');
      const React = await import('react');
      const App = (await import('@/App')).default;
      const html = renderToString(React.createElement(App));
      expect(html).toContain('keydriver');
      expect(html).toContain('键位');
      expect(html).toContain('布局');
      expect(html).toContain('调试');
      expect(html).toContain('未连接');
    },
    30000,
  );

  it('KeyWidget 按定义文件的 KLE 条目渲染键帽', async () => {
    const { renderToString } = await import('react-dom/server');
    const React = await import('react');
    const { loadRealParsedDefinition } = await import(
      '@/definition/__tests__/fixtures/realDefinition'
    );
    const { KeyWidget } = await import('@/ui/keymap/KeyWidget');

    const definition = loadRealParsedDefinition();
    const key = definition.keys[0];
    if (!key) throw new Error('定义文件没有键位条目');
    const html = renderToString(
      React.createElement(KeyWidget, {
        kleKey: key,
        keycode: 0x0004,
        scale: 1,
        selected: false,
        onSelect: () => undefined,
      }),
    );
    expect(html).toContain('A');
    // 定位方式为「absolute 类 + 内联 left/top/width/height」（来自 KleKey.rect）
    expect(html).toMatch(/class="[^"]*\babsolute\b/);
    expect(html).toMatch(/style="left:[^"]*top:[^"]*width:[^"]*height:/);
  });

  it('键位图在 5 种配列下行压紧后底行恒为第 5 行', async () => {
    const { loadRealParsedDefinition } = await import(
      '@/definition/__tests__/fixtures/realDefinition'
    );
    const { selectKeys } = await import('@/definition/DefinitionParser');
    const { toOptionArray } = await import('@/definition/LayoutOptions');
    const definition = loadRealParsedDefinition();
    for (let option = 0; option < 5; option += 1) {
      const opts = toOptionArray(definition.layoutLabels, 0);
      opts[4] = option;
      let value = 0;
      definition.layoutLabels.forEach((g, i) => {
        value |= (opts[i] ?? 0) << g.bitOffset;
      });
      const keys = selectKeys(definition, value >>> 0);
      const maxY = Math.max(...keys.map((k) => k.y));
      expect(maxY).toBe(4);
      expect(keys.length).toBeGreaterThan(55);
    }
  });
});
