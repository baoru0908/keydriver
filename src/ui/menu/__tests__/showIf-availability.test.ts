// showIf 可用性验收测试（官方 VIA 语义：置灰可见，而不是隐藏）。
//
// 官方 menu-generator.tsx 的三档语义：
//   · 菜单根级 showIf 不满足 → 整块不渲染；
//   · 分组级 / 控件级 showIf 不满足 → 仍然渲染，只是置灰 + 不可交互 + 固件版本提示；
//   · 一个菜单内全部组都不可用 → 兜底文案。
// 本文件同时守住一条关键不变量：**被置灰的控件，其值必须仍在 showIf 上下文里**，
// 否则「兄弟控件联动」会恒为假、控件永远灰着。
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MenuDef, MenuNode, MenuNodeRaw } from '@/definition/schema';
import { collectVars } from '@/definition/ShowIfEvaluator';
import { flattenMenus } from '@/definition/MenuFlattener';
import { loadRealParsedDefinition } from '@/definition/__tests__/fixtures/realDefinition';
import {
  UNAVAILABLE_HINT,
  computeAvailability,
  flattenAvailability,
  findAvailability,
  type AvailableGroupNode,
  type AvailableNode,
} from '../availability';
import { MenuGenerator } from '../MenuGenerator';
import { useMenuStore } from '@/store/useMenuStore';

/** 用与定义文件完全相同的结构（content 数组形态）拼一个菜单，走真实解析器。 */
function buildMenu(rawMenus: readonly MenuNodeRaw[]): MenuDef {
  const result = flattenMenus(rawMenus);
  const errors = result.issues.filter((i) => i.level === 'error');
  expect(errors, `定义解析不应报错：${JSON.stringify(errors)}`).toEqual([]);
  const menu = result.menus[0];
  if (!menu) throw new Error('菜单构建失败');
  return menu;
}

/** 按分组的 showIf 原文找到该分组节点（分组 id 是生成的，用 showIf 定位更稳）。 */
function findGroup(nodes: readonly AvailableNode[], showIf: string): AvailableGroupNode | null {
  for (const node of nodes) {
    if (node.kind === 'group') {
      if (node.node.showIf === showIf) return node;
      const hit = findGroup(node.children, showIf);
      if (hit) return hit;
    }
  }
  return null;
}

function countNodes(nodes: readonly AvailableNode[]): number {
  return flattenAvailability(nodes).length;
}

/** 收集定义文件中全部「分组级」showIf（官方语义里分组级不满足是置灰而非隐藏）。 */
function collectGroupShowIfs(nodes: readonly MenuNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.kind !== 'group') continue;
    if (node.showIf) out.push(node.showIf);
    out.push(...collectGroupShowIfs(node.children));
  }
  return out;
}

describe('showIf 语义 · 分组级不满足 → 置灰可见，不隐藏', () => {
  const menu = buildMenu([
    {
      label: '置灰菜单',
      content: [
        {
          showIf: '{k_src} == 1',
          content: [{ label: '组内控件', type: 'toggle', content: ['k_inner', 1, 2] }],
        },
      ],
    },
  ]);

  it('条件分组在上下文不满足时仍然存在于输出中，且被标记为不可用', () => {
    const availability = computeAvailability(menu.root, { k_src: 0 });
    const group = findGroup(availability.children, '{k_src} == 1');

    // 核心断言：分组没有消失，只是被标注为不可用
    expect(group).not.toBeNull();
    if (!group) return;
    expect(group.enabled).toBe(false);
    expect(group.interactive).toBe(false);
    // 组内控件也一并保留，只是继承了不可用
    expect(group.children.length).toBe(1);
    expect(group.children[0]?.interactive).toBe(false);
    expect(availability.hasAvailable).toBe(false);
  });

  it('上下文翻转后同一个分组变为可交互（不是恒真也不是恒假）', () => {
    const availability = computeAvailability(menu.root, { k_src: 1 });
    const group = findGroup(availability.children, '{k_src} == 1');
    expect(group?.enabled).toBe(true);
    expect(group?.interactive).toBe(true);
    expect(group?.children[0]?.interactive).toBe(true);
    expect(availability.hasAvailable).toBe(true);
  });

  it('渲染产物里分组仍在 DOM 中、带不可用标记与固件提示', () => {
    const html = renderToStaticMarkup(
      createElement(MenuGenerator, { menu, context: { k_src: 0 } }),
    );
    expect(html).toContain('条件分组');
    expect(html).toContain('组内控件');
    expect(html).toContain('data-unavailable="true"');
    expect(html).toContain(UNAVAILABLE_HINT);
    expect(html).toContain('cursor-not-allowed');
  });
});

describe('showIf 语义 · 控件级不满足 → 置灰不可交互，不隐藏', () => {
  const menu = buildMenu([
    {
      label: '控件菜单',
      content: [
        {
          label: '分组甲',
          content: [
            { label: '源开关', type: 'toggle', content: ['k_source', 1, 1] },
            {
              label: '联动开关',
              type: 'toggle',
              content: ['k_dep', 1, 2],
              showIf: '{k_source} != 0',
            },
          ],
        },
      ],
    },
  ]);

  it('控件级 showIf 为假时控件仍在，且 interactive=false', () => {
    const availability = computeAvailability(menu.root, { k_source: 0 });
    const node = findAvailability(availability.children, menu.controls[1]?.id ?? '');
    expect(node).not.toBeNull();
    expect(node?.kind).toBe('control');
    expect(node?.enabled).toBe(false);
    expect(node?.interactive).toBe(false);
    // 总数不变：一个都没被过滤掉
    expect(countNodes(availability.children)).toBe(countNodes(
      computeAvailability(menu.root, { k_source: 1 }).children,
    ));
  });

  it('渲染产物里不可用控件带 aria-disabled 与 pointer-events-none 双保险', () => {
    const html = renderToStaticMarkup(
      createElement(MenuGenerator, { menu, context: { k_source: 0 } }),
    );
    expect(html).toContain('联动开关');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('pointer-events-none');
    expect(html).toContain(UNAVAILABLE_HINT);
  });

  it('可用的控件不会被误标为不可用', () => {
    const availability = computeAvailability(menu.root, { k_source: 1 });
    const node = findAvailability(availability.children, menu.controls[1]?.id ?? '');
    expect(node?.enabled).toBe(true);
    expect(node?.interactive).toBe(true);
  });
});

describe('showIf 语义 · 菜单根级不满足 → 整块不渲染', () => {
  const menu = buildMenu([
    {
      label: '根条件菜单',
      showIf: '{k_root} != 0',
      content: [
        {
          label: '分组乙',
          content: [{ label: '普通控件', type: 'toggle', content: ['k_plain', 1, 1] }],
        },
      ],
    },
  ]);

  it('rootEnabled 为假，且渲染产物为空', () => {
    const availability = computeAvailability(menu.root, { k_root: 0 });
    expect(availability.rootEnabled).toBe(false);
    expect(availability.children.length).toBe(1);
    expect(availability.children[0]?.interactive).toBe(false);

    const html = renderToStaticMarkup(
      createElement(MenuGenerator, { menu, context: { k_root: 0 } }),
    );
    expect(html).toBe('');
  });

  it('rootEnabled 为真时正常渲染', () => {
    const availability = computeAvailability(menu.root, { k_root: 1 });
    expect(availability.rootEnabled).toBe(true);
    const html = renderToStaticMarkup(
      createElement(MenuGenerator, { menu, context: { k_root: 1 } }),
    );
    expect(html).toContain('普通控件');
  });
});

describe('showIf 联动 · 被置灰控件的值仍在上下文中', () => {
  const menu = buildMenu([
    {
      label: '联动菜单',
      content: [
        { label: '总开关', type: 'toggle', content: ['k_root_switch', 1, 1] },
        {
          label: '受控开关',
          type: 'toggle',
          content: ['k_gate', 1, 2],
          showIf: '{k_root_switch} != 0',
        },
        {
          showIf: '{k_gate} != 0',
          content: [{ label: '联动控件', type: 'range', options: [0, 10], content: ['k_linked', 1, 3] }],
        },
      ],
    },
  ]);

  it('A 控件的值改变 → 依赖它的 B 组可用性随之翻转', () => {
    const off = computeAvailability(menu.root, { k_root_switch: 0, k_gate: 0 });
    const on = computeAvailability(menu.root, { k_root_switch: 0, k_gate: 1 });
    expect(findGroup(off.children, '{k_gate} != 0')?.interactive).toBe(false);
    expect(findGroup(on.children, '{k_gate} != 0')?.interactive).toBe(true);
  });

  it('置灰控件写值后仍进入 showIf 上下文，并被依赖方读到', () => {
    useMenuStore.getState().reset();
    const gate = menu.controls.find((c) => c.valueKey === 'k_gate');
    expect(gate).toBeDefined();
    if (!gate) return;

    // gate 自身的 showIf（{k_root_switch} != 0）不满足 → 它会被置灰不可交互
    useMenuStore.getState().setValue(gate, 1);
    const context = useMenuStore.getState().showIfContext;
    expect(context['k_gate']).toBe(1);

    const availability = computeAvailability(menu.root, context);
    // ① 它自己确实被置灰了
    const gateNode = findAvailability(availability.children, gate.id);
    expect(gateNode?.enabled).toBe(false);
    expect(gateNode?.interactive).toBe(false);
    // ② 但依赖它的分组照常可用 —— 证明「置灰」与「作为条件变量」不互斥
    expect(findGroup(availability.children, '{k_gate} != 0')?.interactive).toBe(true);
  });
});

describe('showIf 语义 · 真实定义文件全量回归', () => {
  const definition = loadRealParsedDefinition();

  it('任意上下文下控件总数恒定（只置灰，绝不隐藏）', () => {
    for (const menu of definition.menus) {
      const empty = computeAvailability(menu.root, {});
      expect(empty.controlCount).toBe(menu.root.controlCount);
      expect(empty.rootEnabled).toBe(true);

      // 把该菜单用到的全部 showIf 变量置 0（让尽可能多的条件为假）
      const vars = new Set<string>();
      for (const control of menu.controls) {
        for (const name of collectVars(control.showIf)) vars.add(name);
      }
      for (const name of collectVars(menu.root.showIf)) vars.add(name);
      const zeroed: Record<string, number> = {};
      for (const name of vars) zeroed[name] = 0;
      const zeroedAvailability = computeAvailability(menu.root, zeroed);

      // 关键：条件全假时控件一个都不少，只是可用数下降
      expect(zeroedAvailability.controlCount).toBe(menu.root.controlCount);
      expect(zeroedAvailability.availableControlCount).toBeLessThanOrEqual(
        menu.root.controlCount,
      );
      expect(countNodes(zeroedAvailability.children)).toBe(countNodes(empty.children));
    }
  });

  it('两个分组级 showIf 互斥：一侧置灰时另一侧可用，且两者都留在输出里', () => {
    const groupShowIfs = collectGroupShowIfs(
      definition.menus.flatMap((m) => m.root.children),
    );
    expect(groupShowIfs.length).toBe(2);
    const varNames = groupShowIfs.flatMap((expr) => collectVars(expr));
    expect(new Set(varNames).size).toBe(1);
    const varName = varNames[0] ?? '';

    const owner = definition.menus.find(
      (m) => collectGroupShowIfs(m.root.children).length === groupShowIfs.length,
    );
    expect(owner).toBeDefined();
    if (!owner) return;

    const first = computeAvailability(owner.root, { [varName]: 0 });
    const second = computeAvailability(owner.root, { [varName]: 1 });

    for (const expr of groupShowIfs) {
      const a = findGroup(first.children, expr);
      const b = findGroup(second.children, expr);
      // 两侧都必须在（不被过滤）
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      // 且恰好一侧可用
      expect(a?.interactive === true || b?.interactive === true).toBe(true);
      expect(a?.interactive === true && b?.interactive === true).toBe(false);
    }
  });
});
