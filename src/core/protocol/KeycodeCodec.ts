// 键码 ↔ 2 字节大端编解码（架构 §8.2：所有多字节编解码必须走这里，禁止在 UI/Store 手写 << 8）。

export const KC_NO = 0x0000;
export const KC_TRNS = 0x0001;

/** 键码 → 2 字节大端。 */
export function encodeKeycode(keycode: number): [number, number] {
  const v = keycode & 0xffff;
  return [(v >> 8) & 0xff, v & 0xff];
}

/** 2 字节大端 → 键码。 */
export function decodeKeycode(hi: number, lo: number): number {
  return (((hi & 0xff) << 8) | (lo & 0xff)) & 0xffff;
}

/** 从报文的指定偏移读一个键码（大端）。 */
export function readKeycode(data: ArrayLike<number>, offset: number): number {
  return decodeKeycode(data[offset] ?? 0, data[offset + 1] ?? 0);
}

/** 把键码写入报文的指定偏移（大端）。 */
export function writeKeycode(data: Uint8Array, offset: number, keycode: number): void {
  const [hi, lo] = encodeKeycode(keycode);
  data[offset] = hi;
  data[offset + 1] = lo;
}

/** 16 位大端偏移写入（用于 keymap buffer offset）。 */
export function writeU16BE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = (value >> 8) & 0xff;
  data[offset + 1] = value & 0xff;
}

/** 从报文的指定偏移读一个 16 位大端整数（用于宏缓冲区总字节数等）。 */
export function readU16BE(data: ArrayLike<number>, offset: number): number {
  return (((data[offset] ?? 0) & 0xff) << 8) | ((data[offset + 1] ?? 0) & 0xff);
}

/** 32 位大端读写（layout_options / firmware_version）。 */
export function readU32BE(data: ArrayLike<number>, offset: number): number {
  return (
    (((data[offset] ?? 0) << 24) |
      ((data[offset + 1] ?? 0) << 16) |
      ((data[offset + 2] ?? 0) << 8) |
      (data[offset + 3] ?? 0)) >>>
    0
  );
}

export function writeU32BE(data: Uint8Array, offset: number, value: number): void {
  const v = value >>> 0;
  data[offset] = (v >>> 24) & 0xff;
  data[offset + 1] = (v >>> 16) & 0xff;
  data[offset + 2] = (v >>> 8) & 0xff;
  data[offset + 3] = v & 0xff;
}
