// QA 独立验证 · MenuFlattener 的 options 归一化与退化路径（已有单测只跑真实文件，不覆盖畸形输入）。
import { describe, expect, it } from 'vitest';
import { flattenMenus, makeAddress, normalizeOptions } from '@/definition/MenuFlattener';
import { parseViaDefinition } from '@/definition/DefinitionParser';
import { inferWidth } from '@/core/protocol/ValueWidth';
import type { MenuNodeRaw } from '@/definition/schema';

describe('QA · normalizeOptions：range', () => {
  it('[min,max] 正常形态', () => {
    expect(normalizeOptions('range', [1, 1000])).toEqual({ kind: 'range', min: 1, max: 1000 });
  });

  it('字符串形态也能被 Number() 接受（定义文件字段形态不统一）', () => {
    expect(normalizeOptions('range', ['0', '255'])).toEqual({ kind: 'range', min: 0, max: 255 });
  });

  it('元素不足 / 非数字 / NaN：退化为 [0,255] 且宽度为 1 字节（不得抛异常）', () => {
    expect(normalizeOptions('range', [1])).toEqual({ kind: 'range', min: 0, max: 255 });
    expect(normalizeOptions('range', ['abc', 10])).toEqual({ kind: 'range', min: 0, max: 255 });
    expect(normalizeOptions('range', null)).toEqual({ kind: 'range', min: 0, max: 255 });
    expect(normalizeOptions('range', [1, Number.NaN])).toEqual({ kind: 'range', min: 0, max: 255 });
  });

  it('负 min / 超大 max 不抛异常（宽度仍按 max>255 判定）', () => {
    expect(normalizeOptions('range', [-10, 65535])).toEqual({ kind: 'range', min: -10, max: 65535 });
  });
});

describe('QA · normalizeOptions：dropdown / button', () => {
  it('string[] → 索引即值（宽度恒 1 字节）', () => {
    expect(normalizeOptions('dropdown', ['A', 'B', 'C'])).toEqual({
      kind: 'enum',
      items: [
        { label: 'A', value: 0 },
        { label: 'B', value: 1 },
        { label: 'C', value: 2 },
      ],
    });
  });

  it('[label,value][] → 值来自第二项', () => {
    expect(normalizeOptions('dropdown', [['关闭', 0], ['呼吸', 5]])).toEqual({
      kind: 'enum',
      items: [
        { label: '关闭', value: 0 },
        { label: '呼吸', value: 5 },
      ],
    });
  });

  it('[label,value][] 里的字符串值也能转数字', () => {
    expect(normalizeOptions('dropdown', [['1分钟', '1']])).toEqual({
      kind: 'enum',
      items: [{ label: '1分钟', value: 1 }],
    });
  });

  it('非法 value 退化为索引（而不是 NaN 污染宽度推断）', () => {
    expect(normalizeOptions('dropdown', [['A', 'x'], ['B', 'y']])).toEqual({
      kind: 'enum',
      items: [
        { label: 'A', value: 0 },
        { label: 'B', value: 1 },
      ],
    });
  });

  it('button 的 options 原样保留（含多字节与非数字）', () => {
    expect(normalizeOptions('button', [1])).toEqual({ kind: 'action', args: [1] });
    expect(normalizeOptions('button', [0, 1])).toEqual({ kind: 'action', args: [0, 1] });
    expect(normalizeOptions('button', null)).toEqual({ kind: 'action', args: [] });
    expect(normalizeOptions('button', ['x'])).toEqual({ kind: 'action', args: [0] });
  });

  it('非 button/range/dropdown 一律 kind:none', () => {
    expect(normalizeOptions('toggle', [1, 2])).toEqual({ kind: 'none' });
    expect(normalizeOptions('color', [1, 2])).toEqual({ kind: 'none' });
    expect(normalizeOptions('keycode', [1, 2])).toEqual({ kind: 'none' });
  });
});

describe('QA · 畸形菜单节点的退化路径', () => {
  it('未知 type 降级为 toggle 并留下 warn（不丢控件、不抛异常）', () => {
    const result = flattenMenus([
      { label: 'M', content: [{ label: 'X', type: 'slider', content: ['k', 1, 2] }] },
    ]);
    expect(result.controls).toHaveLength(1);
    expect(result.controls[0]?.type).toBe('toggle');
    expect(result.controls[0]?.widthHint).toBe(1);
    expect(result.issues.some((i) => i.level === 'warn' && i.message.includes('slider'))).toBe(true);
  });

  it('缺少 content 的控件被丢弃并留下 error 级 issue', () => {
    const result = flattenMenus([{ label: 'M', content: [{ label: 'X', type: 'toggle' }] }]);
    expect(result.controls).toHaveLength(0);
    expect(result.issues.filter((i) => i.level === 'error')).toHaveLength(1);
  });

  it('content 首元素非字符串（值为数字开头）时同样丢弃', () => {
    const node = {
      label: 'X',
      type: 'toggle',
      content: [1, 2, 3],
    } as unknown as MenuNodeRaw;
    // 显式标注为 MenuNodeRaw[]：content 是「子节点数组 | 值内容元组」的联合类型，
    // 不标注时 TS 会去匹配元组分支并把 node 与 string 比对，产生误报
    const children: MenuNodeRaw[] = [node];
    const result = flattenMenus([{ label: 'M', content: children }]);
    expect(result.controls).toHaveLength(0);
    expect(result.issues.some((i) => i.level === 'error')).toBe(true);
  });

  it('顶层菜单同名时，根分组 id 因 menuId 前缀不同而不会撞车', () => {
    const result = flattenMenus([
      { label: '同名', content: [{ label: 'A', type: 'toggle', content: ['k1', 1, 1] }] },
      { label: '同名', content: [{ label: 'A', type: 'toggle', content: ['k2', 1, 2] }] },
    ]);
    const rootIds = result.menus.map((m) => m.root.id);
    expect(new Set(rootIds).size).toBe(2);
  });

  it('空菜单 / 空分组不产生控件也不抛异常', () => {
    expect(flattenMenus([]).controls).toHaveLength(0);
    const result = flattenMenus([{ label: 'M', content: [] }, { label: 'N' }]);
    expect(result.controls).toHaveLength(0);
    expect(result.menus).toHaveLength(2);
  });

  it('多层嵌套下 path 逐级累积，controlId 保持唯一', () => {
    const deep: MenuNodeRaw = {
      label: 'L1',
      content: [
        {
          label: 'L2',
          content: [{ label: 'L3', content: [{ type: 'toggle', content: ['k', 1, 1] }] }],
        },
      ],
    };
    const result = flattenMenus([deep]);
    expect(result.controls[0]?.path).toEqual(['L1', 'L2', 'L3']);
    expect(new Set(result.controls.map((c) => c.id)).size).toBe(result.controls.length);
  });
});

describe('QA · 解析幂等性与地址一致性', () => {
  it('同一份 JSON 解析两次：controlId 与 widthHint 完全一致（Store 复用控件的前提）', () => {
    const raw = {
      name: 'X',
      vendorId: '0x1234',
      productId: '0x0001',
      matrix: { rows: 2, cols: 2 },
      layouts: { keymap: [] },
      menus: [
        {
          label: 'M',
          content: [
            { label: 'A', type: 'range', options: [0, 1000], content: ['ka', 1, 1] },
            { label: 'B', type: 'toggle', content: ['kb', 1, 2] },
          ],
        },
      ],
    };
    const first = parseViaDefinition(raw);
    const second = parseViaDefinition(JSON.parse(JSON.stringify(raw)));
    expect(first.ok && second.ok).toBe(true);
    expect(first.definition?.controls.map((c) => c.id)).toEqual(
      second.definition?.controls.map((c) => c.id),
    );
    expect(first.definition?.controls.map((c) => c.widthHint)).toEqual([2, 1]);
  });

  it('makeAddress：索引被 &0xff 裁剪，且 key 与 indexes 保持一致', () => {
    const addr = makeAddress(['k', 0x1ff, 0x1ff, 0x1ff, 2]);
    expect(addr.channel).toBe(0xff);
    expect(addr.valueId).toBe(0xff);
    expect(addr.indexes).toEqual([0xff, 2]);
    expect(addr.key).toBe('255:255:255.2');
  });

  it('widthHint 与 inferWidth 在畸形 options 下也不漂移', () => {
    const result = flattenMenus([
      {
        label: 'M',
        content: [
          { label: 'R', type: 'range', options: ['x', 'y'], content: ['kr', 1, 1] },
          { label: 'D', type: 'dropdown', content: ['kd', 1, 2] },
        ],
      },
    ]);
    for (const c of result.controls) {
      expect(c.widthHint).toBe(inferWidth(c, {}));
    }
  });
});
