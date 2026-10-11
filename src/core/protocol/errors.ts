// 协议层错误层次：传输错误之上叠加「未处理 / 版本不兼容 / 回读不一致」三类（架构 §8.8）。
import { TransportError } from '@/core/hid/HidTransport';
import type { ErrorCode } from '@/shared/result';

export { TransportError, TimeoutError, DisconnectedError } from '@/core/hid/HidTransport';

/** 协议层错误基类，统一携带错误码与原始报文 hex。 */
export class ProtocolError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, readonly rawHex?: string) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
  }

  toErrorInfo(): { code: ErrorCode; message: string; rawHex?: string; detail?: string } {
    return { code: this.code, message: this.message, rawHex: this.rawHex, detail: this.stack };
  }
}

/** 固件回显 0xFF：命令不被支持。 */
export class UnhandledCommandError extends ProtocolError {
  constructor(commandId: number, rawHex?: string) {
    super(
      'E_PROTO_UNHANDLED',
      `固件未响应命令 0x${commandId.toString(16).toUpperCase().padStart(2, '0')}（回显 0xFF）`,
      rawHex,
    );
    this.name = 'UnhandledCommandError';
  }
}

/** 协议版本低于 11：不支持 V2 方言。 */
export class IncompatibleProtocolError extends ProtocolError {
  constructor(readonly version: number, rawHex?: string) {
    super(
      'E_PROTO_INCOMPATIBLE',
      `固件协议版本 v${version} 过低，本定义文件需要 VIA 协议 v${11}+，请升级固件`,
      rawHex,
    );
    this.name = 'IncompatibleProtocolError';
  }
}

/** 写入后回读与写入值不一致。 */
export class EchoMismatchError extends ProtocolError {
  constructor(
    readonly expected: number,
    readonly actual: number,
    rawHex?: string,
  ) {
    super(
      'E_PROTO_ECHO_MISMATCH',
      `回读不一致：写入 ${expected}（0x${expected.toString(16)}），读回 ${actual}（0x${actual.toString(16)}）`,
      rawHex,
    );
    this.name = 'EchoMismatchError';
  }
}

/** 响应参数回声与请求不一致（第二道防线）。 */
export class EchoParamMismatchError extends ProtocolError {
  constructor(commandId: number, rawHex?: string) {
    super(
      'E_PROTO_ECHO_MISMATCH',
      `命令 0x${commandId.toString(16).toUpperCase().padStart(2, '0')} 的参数回声与请求不一致`,
      rawHex,
    );
    this.name = 'EchoParamMismatchError';
  }
}

/**
 * 响应语法合法，但结果在语义上不可能（团队裁决：不得静默接受，也不得钳到合法值）。
 * 典型场景：KEYMAP_GET_LAYER_COUNT(0x11) 无参数，第二道防线（参数回声）对它无能为力，
 * 整体错位 1 字节时会静默返回 0 层——而一把键盘层数恒 ≥ 1。
 */
export class ProtocolSanityError extends ProtocolError {
  constructor(readonly field: string, readonly actual: number, rawHex?: string) {
    super(
      'E_PROTO_SANITY',
      `固件返回的 ${field} 为 ${actual}，该值在语义上不可能，疑似协议方言错位或固件异常`,
      rawHex,
    );
    this.name = 'ProtocolSanityError';
  }
}

/** 值宽度无法判定。 */
export class ValueWidthUnknownError extends ProtocolError {
  constructor(message: string, rawHex?: string) {
    super('E_VALUE_WIDTH_UNKNOWN', message, rawHex);
    this.name = 'ValueWidthUnknownError';
  }
}

export function isTransportError(e: unknown): e is TransportError {
  return e instanceof TransportError;
}
