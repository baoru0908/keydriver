#!/usr/bin/env node
// 间距裸值守卫（T03-4 防回潮）：扫描 src 下的任意 px 间距工具类，命中即退出码 1。
//
// 规则：禁止 `(p|m|gap|space)-[xytrbl]?-[Npx]` 这类任意值间距（如 p-[12px]、gap-[3px]、
// mt-[2px]、space-x-[2px]）。它们绕过了设计令牌的 spacing 标尺（4/8/12/16/20/24/32/40px
// 对应 p-1…p-10），应在代码评审阶段就拦截。
//
// 注意：本守卫只针对「间距」语义，不碰 `text-[11px]` 这类字号任意值（那是字号，非间距）。
//
// 用法：
//   node scripts/codemod-spacing.mjs           # 仅检查，发现违规即非零退出
//   node scripts/codemod-spacing.mjs --fix     # 把命中且能映射的值改写为标尺类（如 p-[12px]→p-3）
//
// 已对齐 Tailwind 默认 spacing 语义的映射：4→1, 8→2, 12→3, 16→4, 20→5, 24→6, 32→8, 40→10。
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(process.cwd());
const SCAN_ROOT = join(ROOT, 'src');
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

// 需要跳过的目录段（测试夹具、第三方代码等，与 check-no-hardcode 策略一致）。
const SKIP_MARKERS = [`${sep}__tests__${sep}`, `${sep}fixtures${sep}`];

// 仅匹配「间距」语义的任意 px（前缀前后需为非单词边界，避免误伤 opacity-[...] 等）。
const SPACING_RE = /(?:^|[\s"'`:])((?:p|m|gap|space)-[xytrbl]?-\[(\d+)px\])/g;

// 标尺映射：任意 px → 语义间距类后缀（4→1, 8→2, …）。
const SCALE_MAP = new Map([
  [4, '1'],
  [8, '2'],
  [12, '3'],
  [16, '4'],
  [20, '5'],
  [24, '6'],
  [32, '8'],
  [40, '10'],
]);

async function collect(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = join(cur, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (name === 'node_modules' || name === 'dist') continue;
        stack.push(full);
      } else if (EXTENSIONS.some((ext) => name.endsWith(ext))) {
        out.push(full);
      }
    }
  }
  return out;
}

const fix = process.argv.includes('--fix');
const files = await collect(SCAN_ROOT);

let violations = 0;
let fixed = 0;

for (const file of files) {
  const rel = relative(ROOT, file).split('\\').join('/');
  if (SKIP_MARKERS.some((m) => rel.includes(m))) continue;

  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  let fileChanged = false;

  lines.forEach((line, index) => {
    const matches = [...line.matchAll(SPACING_RE)];
    if (matches.length === 0) return;
    for (const m of matches) {
      const token = m[1];
      const px = Number(m[2]);
      violations += 1;
      const mapTo = SCALE_MAP.get(px);
      if (fix && mapTo) {
        // 推导前缀后缀：形如 p-[12px] / gap-x-[8px] / mt-[2px]
        const base = token.replace(/\[\d+px\]$/, '');
        const replacement = `${base}-${mapTo}`;
        lines[index] = lines[index].replace(token, replacement);
        fileChanged = true;
        fixed += 1;
        console.log(`  ~ ${rel}:${index + 1} ${token} → ${replacement}`);
      } else {
        console.error(`  ✗ ${rel}:${index + 1} 禁止的任意 px 间距：${token}`);
      }
    }
  });

  if (fileChanged) {
    writeFileSync(file, lines.join('\n'), 'utf8');
  }
}

if (violations === 0) {
  console.log('✓ 间距裸值守卫通过：未发现任意 px 间距（src 已收敛到 spacing 标尺）。');
  process.exit(0);
}

if (fix) {
  console.error(`\n⚠️ 已自动改写 ${fixed}/${violations} 处；仍有 ${violations - fixed} 处需手工处理（非标准 px 值）。`);
  process.exit(violations - fixed > 0 ? 1 : 0);
}

console.error(`\n✗ 间距裸值守卫失败：命中 ${violations} 处任意 px 间距，请改为语义类（如 p-[12px]→p-3）。`);
console.error('  运行 `node scripts/codemod-spacing.mjs --fix` 可自动改写标准值。');
process.exit(1);
