// hex 格式化与解析工具：报文可视化、备份文件、Any 键码输入共用。

/** 把字节数组格式化成 `01 02 FF` 形态；maxBytes 用于截断长报文。 */
export function toHex(bytes: ArrayLike<number>, maxBytes?: number): string {
  const n = maxBytes === undefined ? bytes.length : Math.min(bytes.length, maxBytes);
  const parts: string[] = [];
  for (let i = 0; i < n; i += 1) {
    parts.push(((bytes[i] ?? 0) & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(' ');
}

/** 把 `01 02 FF` / `0102FF` 形态解析为字节数组；非法字符被忽略。 */
export function parseHex(text: string): Uint8Array {
  const clean = text.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length % 2 !== 0) {
    throw new Error(`hex 长度必须为偶数，实际为 ${clean.length}`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** `0x` 前缀的 16 位值字符串，用于键码展示（如 `0x7E00`）。 */
export function toHex16(value: number): string {
  return `0x${(value & 0xffff).toString(16).toUpperCase().padStart(4, '0')}`;
}

/** 无前缀的 16 位大写 hex，用于键码面板的紧凑展示。 */
export function toHex16Short(value: number): string {
  return (value & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}
