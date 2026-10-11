#!/usr/bin/env node
// 硬编码守卫（架构 A6）：扫描源码中是否出现「具体键盘」的特征词，命中即退出码 1。
// 白名单：测试目录（__tests__）。断言必须写具体值才能验证解析结果——
// 例如「parseId('0x5594') === 0x5594」这种用例，不写具体 VID 就无法证明解析是对的。
// 生产代码（src/core、src/ui、src/store、src/io、src/definition 的非测试文件）一律不许出现。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(process.cwd());
const SCAN_DIRS = ['src'];
const WHITELIST = ['src/definition/__tests__/fixtures'];
/** 路径中出现该目录段即视为测试夹具，豁免扫描。 */
const TEST_DIR_MARKER = `${sep}__tests__${sep}`;
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

/** 特征词表：英文词用词边界匹配，中文子串直接匹配。 */
const TERMS = [
  { pattern: /\bEC_BM60\b/g, desc: '键盘型号' },
  { pattern: /\bEC-BM60\b/g, desc: '键盘型号' },
  { pattern: /\b0x5594\b/gi, desc: '厂商 VID' },
  { pattern: /\b5594\b/g, desc: '厂商 VID' },
  // 注意：不检测 0x0005 —— 它与 HID usage（KC_B）等合法键码常量冲突，误报率过高
  { pattern: /\bRT\b/g, desc: '具体菜单名' },
  { pattern: /\bSOCD\b/g, desc: '具体菜单名' },
  { pattern: /\bCombos\b/g, desc: '具体菜单名' },
  { pattern: /\bTap\s+Dance\b/g, desc: '具体功能名' },
  { pattern: /静电容/g, desc: '具体菜单名' },
  { pattern: /键盘锁/g, desc: '自定义键名' },
  { pattern: /WIN锁/g, desc: '自定义键名' },
  { pattern: /组合键/g, desc: '具体菜单名' },
  { pattern: /按键复用/g, desc: '具体菜单名' },
  { pattern: /按键连发/g, desc: '具体菜单名' },
  { pattern: /Magic设置/g, desc: '具体菜单名' },
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(full, out);
    } else if (EXTENSIONS.some((ext) => name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
const hits = [];

for (const file of files) {
  const rel = relative(ROOT, file).split('\\').join('/');
  if (WHITELIST.some((w) => rel.startsWith(w))) continue;
  if (`${sep}${rel.split('/').join(sep)}${sep}`.includes(TEST_DIR_MARKER)) continue;
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    for (const term of TERMS) {
      term.pattern.lastIndex = 0;
      if (term.pattern.test(line)) {
        hits.push({ file: rel, line: index + 1, desc: term.desc, text: line.trim().slice(0, 120) });
      }
    }
  });
}

if (hits.length > 0) {
  console.error(`✗ 硬编码检查失败：命中 ${hits.length} 处与具体键盘耦合的特征词`);
  for (const hit of hits) {
    console.error(`  ${hit.file}:${hit.line} [${hit.desc}] ${hit.text}`);
  }
  console.error('\n说明：所有文案必须来自定义文件。测试夹具请放在 __tests__ 目录内。');
  process.exit(1);
}

console.log(`✓ 硬编码检查通过：扫描 ${files.length} 个文件，未发现具体键盘特征词`);
process.exit(0);
