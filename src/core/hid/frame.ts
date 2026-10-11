// 32 字节 RAW HID 帧工具：补齐 / hex 化 / 未处理判定 / 回显前缀比对（架构 §3.3）。
import { MSG_LEN } from './HidTransport';
import { toHex } from '@/shared/hex';

/** 把任意长度请求补齐（截断）到 32 字节。 */
export function pad32(bytes: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(MSG_LEN);
  const n = Math.min(bytes.length, MSG_LEN);
  for (let i = 0; i < n; i += 1) out[i] = bytes[i] ?? 0;
  return out;
}

/** 报文 hex 化（调试面板与错误详情统一走这里）。 */
export function frameToHex(bytes: ArrayLike<number>): string {
  return toHex(bytes);
}

/** 响应是否为「固件无法识别」的回显（首字节 0xFF）。 */
export function isUnhandled(response: ArrayLike<number>): boolean {
  return (response[0] ?? 0) === 0xff;
}

/**
 * 校验响应前缀是否等于请求前缀（自校验探针的核心判定，架构 §8.4）。
 * 「命令码相同但帧格式不同」时固件会原样回显，只有前缀比对能识别方言错位。
 */
export function echoPrefixMatches(response: ArrayLike<number>, request: ArrayLike<number>, length: number): boolean {
  if (response.length < length) return false;
  for (let i = 0; i < length; i += 1) {
    if ((response[i] ?? -1) !== (request[i] ?? -1)) return false;
  }
  return true;
}

/**
 * 第二道防线：参数回声一致性校验——响应的参数字节必须等于请求的参数字节。
 * 与「首字节 0xFF」共同构成响应有效性判定；仅比较参数区（不含载荷区）。
 */
export function echoMatches(
  response: ArrayLike<number>,
  request: ArrayLike<number>,
  from: number,
  to: number,
): boolean {
  for (let i = from; i < to; i += 1) {
    if ((response[i] ?? -1) !== (request[i] ?? -1)) return false;
  }
  return true;
}

/** 取报文前 n 字节的 hex，用于探针告警展示。 */
export function prefixHex(bytes: ArrayLike<number>, n: number): string {
  return toHex(bytes, n);
}
