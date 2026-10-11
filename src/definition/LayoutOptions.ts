// layout_options 位段：labels ↔ 32 位 bitfield 的读写与位段计算（架构 §8.7 / U4）。
import type { LayoutLabel, LayoutOptionGroup } from './schema';

/** 开关组的两个取值文案（VIA 规范：string 形态的组是 0/1 二选一）。 */
const TOGGLE_OPTIONS: readonly string[] = ['Off', 'On'];

/**
 * n 个选项所需的位数：ceil(log2(n))，最小 1 位。
 *
 * ⚠️ n 取**选项个数**，不含组名（VIA 规范）：
 *   "开关"           → 2 个取值（0/1）        → 1 bit
 *   ["组名","A","B"] → 2 个选项              → ceil(log2(2)) = 1 bit
 *   ["组名","A".."E"] → 5 个选项             → ceil(log2(5)) = 3 bits
 * 早期实现误用 labels 数组的整体长度（含组名），会把 2 选项的组算成 2 bits，
 * 导致非零 layout_options 的读写整体错位。
 */
export function bitWidthFor(count: number): number {
  if (count <= 1) return 1;
  let bits = 0;
  let n = count - 1;
  while (n > 0) {
    bits += 1;
    n >>= 1;
  }
  return Math.max(1, bits);
}

/** 由 labels 计算每组的位段（从 bit0 起依次分配）。 */
export function computeLayoutGroups(labels: readonly LayoutLabel[]): LayoutOptionGroup[] {
  const groups: LayoutOptionGroup[] = [];
  let bitOffset = 0;
  labels.forEach((label, index) => {
    if (typeof label === 'string') {
      // string 形态：组名即标签，恒为 2 选开关 → 1 bit
      groups.push({
        index,
        label,
        kind: 'toggle',
        options: TOGGLE_OPTIONS,
        bitWidth: 1,
        bitOffset,
      });
      bitOffset += 1;
      return;
    }
    // array 形态：[0] 是组名，[1..] 是选项；位宽按**选项个数**计算（VIA 规范）
    const [name = '', ...options] = label;
    // 退化形态：数组里只有组名（0 个选项）→ 按开关处理，避免出现没有选项的下拉
    if (options.length === 0) {
      groups.push({
        index,
        label: name,
        kind: 'toggle',
        options: TOGGLE_OPTIONS,
        bitWidth: 1,
        bitOffset,
      });
      bitOffset += 1;
      return;
    }
    const width = bitWidthFor(options.length);
    groups.push({ index, label: name, kind: 'select', options, bitWidth: width, bitOffset });
    bitOffset += width;
  });
  return groups;
}

/** 读取某一组的当前选项值。 */
export function getOption(groups: readonly LayoutOptionGroup[], value: number, index: number): number {
  const g = groups[index];
  if (!g) return 0;
  const mask = (1 << g.bitWidth) - 1;
  return (value >>> g.bitOffset) & mask;
}

/** 写入某一组的选项值（其余位保持）。 */
export function setOption(
  groups: readonly LayoutOptionGroup[],
  value: number,
  index: number,
  option: number,
): number {
  const g = groups[index];
  if (!g) return value;
  const mask = ((1 << g.bitWidth) - 1) << g.bitOffset;
  const cleared = value & ~mask;
  return (cleared | ((option << g.bitOffset) & mask)) >>> 0;
}

/** 位段展开为数组（供 KleGeometry.compactRows 使用）。 */
export function toOptionArray(groups: readonly LayoutOptionGroup[], value: number): number[] {
  return groups.map((_, i) => getOption(groups, value, i));
}

/** 位段总位数（校验是否溢出 32 位）。 */
export function totalBits(groups: readonly LayoutOptionGroup[]): number {
  return groups.reduce((sum, g) => sum + g.bitWidth, 0);
}
