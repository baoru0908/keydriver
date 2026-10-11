// 冒烟脚本：加载目标定义文件并打印关键统计 + 唯一性断言。
// 运行：npm run smoke（等价于 vitest run scripts/smoke.test.ts）
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseViaDefinition } from '@/definition/DefinitionParser';
import { countGroupNodes, controlStats, selectKeys } from '@/definition/DefinitionParser';
import { toOptionArray } from '@/definition/LayoutOptions';
import { KeycodeTable } from '@/keycodes/KeycodeTable';
import { format } from '@/keycodes/KeycodeFormatter';

const FILE = 'definitions/7-19-Em60_cn.json';

describe('冒烟 · 目标定义文件', () => {
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), FILE), 'utf8')) as unknown;
  const result = parseViaDefinition(raw);

  it('解析成功且无 error 级告警', () => {
    expect(result.ok).toBe(true);
    expect(result.issues.filter((i) => i.level === 'error')).toHaveLength(0);
  });

  it('打印统计并断言 8 / 67 / 349 / 98', () => {
    const definition = result.definition;
    if (!definition) throw new Error('解析失败');
    const groups = countGroupNodes(definition);
    const stats = controlStats(definition);
    const ids = definition.controls.map((c) => c.id);
    const uniqueIds = new Set(ids).size;
    const valueKeys = new Set(definition.controls.map((c) => c.valueKey)).size;

    console.log('');
    console.log('===== keydriver 冒烟统计 =====');
    console.log(`定义文件        : ${FILE}`);
    console.log(`设备名称        : ${definition.name}`);
    console.log(`VID / PID       : 0x${definition.vid.toString(16).toUpperCase()} / 0x${definition.pid.toString(16).toUpperCase().padStart(4, '0')}`);
    console.log(`矩阵            : ${definition.matrix.rows} × ${definition.matrix.cols}`);
    console.log(`顶层菜单        : ${definition.menus.length}`);
    console.log(`分组节点        : ${groups}`);
    console.log(`叶子控件        : ${definition.controls.length}`);
    console.log(`控件类型分布    : ${JSON.stringify(stats)}`);
    console.log(`键位条目        : ${definition.allKeys.length}`);
    console.log(`布局选项组      : ${definition.layoutLabels.length}`);
    console.log(`自定义键码      : ${definition.customKeycodes.length}`);
    console.log(`controlId 唯一  : ${uniqueIds} / ${ids.length}`);
    console.log(`valueKey 唯一   : ${valueKeys} / ${ids.length}  ← 证明不能用 valueKey 做主键`);

    expect(definition.menus.length).toBe(8);
    expect(groups).toBe(67);
    expect(definition.controls.length).toBe(349);
    expect(definition.allKeys.length).toBe(98);

    // F1：349 个 controlId 必须唯一
    expect(uniqueIds).toBe(349);
    expect(valueKeys).toBeLessThan(349);

    // A3：5 种配列下底行恒为 y=4
    const bottomRows = [0, 1, 2, 3, 4].map((option) => {
      const opts = toOptionArray(definition.layoutLabels, option);
      opts[4] = option;
      let value = 0;
      definition.layoutLabels.forEach((g, i) => {
        value |= (opts[i] ?? 0) << g.bitOffset;
      });
      const keys = selectKeys(definition, value >>> 0);
      return Math.max(...keys.map((k) => k.y));
    });
    console.log(`5 种配列底行 y  : [${bottomRows.join(', ')}]  ← 行压紧生效`);
    expect(bottomRows).toEqual([4, 4, 4, 4, 4]);

    // Custom 键码动态注入（不硬编码任何键名）
    KeycodeTable.registerCustom(definition.customKeycodes);
    const customCodes = KeycodeTable.custom().map((c) => `0x${c.code.toString(16).toUpperCase()}=${format(c.code)}`);
    console.log(`Custom 键码注入 : ${customCodes.join(' | ')}`);
    expect(KeycodeTable.custom()).toHaveLength(definition.customKeycodes.length);
    console.log('================================');
    console.log('');
  });
});
