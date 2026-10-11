// 自定义值帧编解码：ValueAddress ↔ 0x07/0x08/0x09 帧（含 3/4/5 长度 content，架构 §4.2.4）。
import type { ValueAddress } from '@/definition/schema';
import { VIA_CMD } from './constants';
import { MSG_LEN } from '@/core/hid/HidTransport';

/** 地址键：`${channel}:${valueId}:${indexes.join('.')}`（架构 §8.1）。 */
export function addressKey(addr: ValueAddress): string {
  return `${addr.channel}:${addr.valueId}:${addr.indexes.join('.')}`;
}

export function makeAddress(channel: number, valueId: number, indexes: readonly number[] = []): ValueAddress {
  return { channel, valueId, indexes, key: `${channel}:${valueId}:${indexes.join('.')}` };
}

/** 帧头长度：`[cmd, channel, valueId, ...indexes]` */
function prefix(addr: ValueAddress, cmd: number): number[] {
  return [cmd, addr.channel & 0xff, addr.valueId & 0xff, ...addr.indexes.map((i) => i & 0xff)];
}

/** 0x08 读值请求帧。 */
export function encodeGet(addr: ValueAddress): Uint8Array {
  const frame = new Uint8Array(MSG_LEN);
  frame.set(prefix(addr, VIA_CMD.CUSTOM_GET_VALUE), 0);
  return frame;
}

/** 0x07 写值请求帧；value 按 width 字节大端编码。 */
export function encodeSet(addr: ValueAddress, value: number, width: number): Uint8Array {
  const frame = new Uint8Array(MSG_LEN);
  const head = prefix(addr, VIA_CMD.CUSTOM_SET_VALUE);
  frame.set(head, 0);
  const v = value >>> 0;
  for (let b = 0; b < width; b += 1) {
    const shift = (width - 1 - b) * 8;
    if (head.length + b < MSG_LEN) frame[head.length + b] = (v >>> shift) & 0xff;
  }
  return frame;
}

/** 0x09 保存到 EEPROM 请求帧。 */
export function encodeSave(addr: ValueAddress): Uint8Array {
  const frame = new Uint8Array(MSG_LEN);
  frame.set(prefix(addr, VIA_CMD.CUSTOM_SAVE), 0);
  return frame;
}

/** button 类动作帧：把 options 字节原样透传（架构 U3）。 */
export function encodeAction(addr: ValueAddress, args: readonly number[]): Uint8Array {
  const frame = new Uint8Array(MSG_LEN);
  const head = prefix(addr, VIA_CMD.CUSTOM_SET_VALUE);
  frame.set(head, 0);
  const bytes = args.length > 0 ? args : [0];
  bytes.forEach((b, i) => {
    if (head.length + i < MSG_LEN) frame[head.length + i] = b & 0xff;
  });
  return frame;
}

/** 值字节起始下标。 */
export function valueOffset(addr: ValueAddress): number {
  return 3 + addr.indexes.length;
}

/** 从响应帧解出值（大端，宽度 width）。 */
export function decodeValue(response: ArrayLike<number>, addr: ValueAddress, width: number): number {
  const start = valueOffset(addr);
  let value = 0;
  for (let b = 0; b < width; b += 1) {
    value = ((value << 8) | ((response[start + b] ?? 0) & 0xff)) >>> 0;
  }
  return value;
}

/**
 * 校验响应前缀是否等于请求前缀（自校验探针核心判定，架构 §8.4）。
 * 命令码相同但帧格式不同时固件会原样回显，只有前缀比对能识别方言错位。
 */
export function matchesPrefix(response: ArrayLike<number>, addr: ValueAddress, cmd: number): boolean {
  const expect = prefix(addr, cmd);
  for (let i = 0; i < expect.length; i += 1) {
    if ((response[i] ?? -1) !== expect[i]) return false;
  }
  return true;
}
