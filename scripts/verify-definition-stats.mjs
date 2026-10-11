#!/usr/bin/env node
/**
 * 定义文件实测统计校验脚本
 *
 * 用途（二合一）：
 *   1. 流程约定落地：PRD / 架构文档中的**所有数字必须以本脚本输出为准**，禁止人工归并。
 *      （历史上出现过两次人工归并错误，故立此脚本为唯一事实来源）
 *   2. T02 冒烟验收：node scripts/verify-definition-stats.mjs <定义文件路径>
 *
 * 用法：
 *   node scripts/verify-definition-stats.mjs definitions/7-19-Em60_cn.json
 *
 * 退出码：0 = 全部断言通过；1 = 有断言失败
 */

import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('用法: node scripts/verify-definition-stats.mjs <定义文件路径>');
  process.exit(1);
}

const def = JSON.parse(readFileSync(file, 'utf8'));

// —— 遍历菜单树：有 type = 叶子控件，否则 = 分组节点 ——
const groups = [];
const leaves = [];
let maxDepth = 0;

function walk(nodes, path = [], depth = 0) {
  for (const n of nodes) {
    const label = n.label ?? '(无 label)';
    const p = [...path, label];
    if (n.type) {
      leaves.push({ node: n, path: p, depth });
      maxDepth = Math.max(maxDepth, depth);
    } else {
      groups.push({ node: n, path: p, depth });
      const children = n.content ?? n.children ?? [];
      if (Array.isArray(children)) walk(children, p, depth + 1);
    }
  }
}
walk(def.menus ?? []);

// —— 统计 ——
const byType = {};
for (const { node } of leaves) byType[node.type] = (byType[node.type] ?? 0) + 1;

const contentLens = {};
for (const { node } of leaves) {
  const k = `${node.type}:${node.content.length}`;
  contentLens[k] = (contentLens[k] ?? 0) + 1;
}

const buttons = leaves.filter((l) => l.node.type === 'button');
const buttonOpts = {};
for (const { node } of buttons) {
  const k = node.options == null ? 'null' : JSON.stringify(node.options);
  buttonOpts[k] = (buttonOpts[k] ?? 0) + 1;
}

const ranges = leaves.filter((l) => l.node.type === 'range');
const rangeCombos = {};
for (const { node } of ranges) {
  const k = JSON.stringify(node.options);
  rangeCombos[k] = (rangeCombos[k] ?? 0) + 1;
}
const minIs1 = ranges.filter((l) => l.node.options[0] === 1);
const width2 = ranges.filter((l) => l.node.options[1] > 255);
const intersection = ranges.filter(
  (l) => l.node.options[0] === 1 && l.node.options[1] > 255
);

const showIfOnGroup = groups.filter((g) => g.node.showIf != null);
const showIfOnLeaf = leaves.filter((l) => l.node.showIf != null);
const groupNoLabel = groups.filter((g) => !('label' in g.node));

const valueKeys = leaves.map((l) => l.node.content[0]);
const dupValueKeys = [...new Set(valueKeys)].filter(
  (k) => valueKeys.filter((x) => x === k).length > 1
);

// KLE 键位条目数
const kleItems = (def.layouts?.keymap ?? []).reduce(
  (acc, row) => acc + row.filter((x) => typeof x === 'string').length,
  0
);

// —— 输出（这是文档数字的唯一事实来源）——
console.log(`定义文件: ${file}`);
console.log(`name      : ${def.name}  (VID ${def.vendorId} / PID ${def.productId})`);
console.log(`matrix    : ${def.matrix.rows} x ${def.matrix.cols}`);
console.log(
  `menus     : ${(def.menus ?? []).length} 顶层 / ${groups.length} 分组节点 / ${leaves.length} 叶子控件`
);
console.log(`最大嵌套深度: ${maxDepth + 1} 层`);
console.log(`控件类型  : ${JSON.stringify(byType)}`);
console.log(`content 长度: ${JSON.stringify(contentLens)}`);
console.log(`showIf    : 分组 ${showIfOnGroup.length} 条 / 叶子 ${showIfOnLeaf.length} 条`);
console.log(`无 label 的分组节点: ${groupNoLabel.length}`);
console.log(`重复的 valueKey   : ${JSON.stringify(dupValueKeys)}`);
console.log(`button options    : ${JSON.stringify(buttonOpts)}`);
console.log(`range 组合        : ${JSON.stringify(rangeCombos)}`);
console.log(`  min 维度    : min=0 → ${ranges.length - minIs1.length}   min=1 → ${minIs1.length}`);
console.log(
  `  字节宽度维度: 1字节 → ${ranges.length - width2.length}   2字节 → ${width2.length}`
);
// 若错误地认为「min=1 ⟺ 需 2 字节」会误判多少个？（量化该陷阱的破坏面）
const misAsWidth2 = ranges.filter((l) => l.node.options[0] === 1 && l.node.options[1] <= 255);
const misAsMin1 = ranges.filter((l) => l.node.options[0] === 0 && l.node.options[1] > 255);
const neither = ranges.filter((l) => l.node.options[0] === 0 && l.node.options[1] <= 255);

console.log(
  `  ⚠️ 两维度均为 ${ranges.length - minIs1.length}/${minIs1.length} 属数值巧合：` +
    `min=1 集合与 2 字节集合交集仅 ${intersection.length} 个，非同一批控件`
);
console.log(`  若误把两维度当一回事，误判面为 ${misAsWidth2.length + misAsMin1.length}/${ranges.length}（过半）：`);
console.log(`    min=1 但实为 1 字节 → 被误判成 2 字节 : ${misAsWidth2.length} 个  [1,255]`);
console.log(`    min=0 但实为 2 字节 → 被误判成 min=1 : ${misAsMin1.length} 个  [0,1000]`);
console.log(`    不受影响（同属两集合）               : ${intersection.length} 个`);
console.log(`    不受影响（均不属）                   : ${neither.length} 个  [0,255]`);
console.log(
  `    校验: ${misAsWidth2.length}+${misAsMin1.length}+${intersection.length}+${neither.length} = ` +
    `${misAsWidth2.length + misAsMin1.length + intersection.length + neither.length}`
);
console.log(`KLE 键位条目: ${kleItems}`);
console.log(`layouts.labels: ${(def.layouts?.labels ?? []).length} 组`);

// —— 断言（针对 EC_BM60 的已知基线；换定义文件时按需调整）——
const expectations = [
  ['顶层菜单数', (def.menus ?? []).length, 8],
  ['分组节点数', groups.length, 67],
  ['叶子控件数', leaves.length, 349],
  ['keycode 数', byType.keycode ?? 0, 131],
  ['toggle 数', byType.toggle ?? 0, 90],
  ['range 数', byType.range ?? 0, 78],
  ['dropdown 数', byType.dropdown ?? 0, 33],
  ['button 数', byType.button ?? 0, 9],
  ['color 数', byType.color ?? 0, 8],
  ['showIf 总数', showIfOnGroup.length + showIfOnLeaf.length, 60],
  ['分组级 showIf', showIfOnGroup.length, 2],
  ['重复 valueKey 数', dupValueKeys.length, 2],
  ['button [1] 个数', buttonOpts['[1]'] ?? 0, 1],
  ['button null 个数', buttonOpts.null ?? 0, 1],
  ['range min=1 个数', minIs1.length, 35],
  ['range 需 2 字节个数', width2.length, 35],
  ['两维度集合交集', intersection.length, 13],
  ['误判面（若混为一谈）', misAsWidth2.length + misAsMin1.length, 44],
  ['  其中 [1,255] 被误判为 2 字节', misAsWidth2.length, 22],
  ['  其中 [0,1000] 被误判为 min=1', misAsMin1.length, 22],
  ['不受影响（均不属）[0,255]', neither.length, 21],
  ['KLE 键位条目数', kleItems, 98],
  ['labels 组数', (def.layouts?.labels ?? []).length, 5],
];

let failed = 0;
console.log('\n—— 断言 ——');
for (const [name, actual, expected] of expectations) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}: ${actual}${ok ? '' : ` (期望 ${expected})`}`);
}

console.log(failed === 0 ? '\n全部断言通过。' : `\n${failed} 条断言失败。`);
process.exit(failed === 0 ? 0 : 1);
