// 统一的 Result 返回类型：门面层对 UI 只返回 Result，不抛异常（架构 §8.8）。

export type Result<T, E = ErrorInfo> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** 结构化错误信息：UI 层可据此渲染 Toast / 红色横幅 / 跳转调试面板。 */
export interface ErrorInfo {
  /** 架构 §8.8 错误码表中的码值 */
  readonly code: ErrorCode;
  readonly message: string;
  /** 触发错误的原始报文 hex（可复制给固件开发者） */
  readonly rawHex?: string;
  readonly detail?: string;
}

export type ErrorCode =
  | 'E_TRANSPORT_TIMEOUT'
  | 'E_TRANSPORT_DISCONNECT'
  | 'E_PROTO_UNHANDLED'
  | 'E_PROTO_INCOMPATIBLE'
  | 'E_PROTO_ECHO_MISMATCH'
  /** 响应语法合法但结果在语义上不可能（如层数 0） */
  | 'E_PROTO_SANITY'
  | 'E_DEFINITION_PARSE'
  | 'E_DEFINITION_NO_MATCH'
  | 'E_VALUE_WIDTH_UNKNOWN'
  | 'E_NOT_CONNECTED'
  | 'E_UNKNOWN';

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E = ErrorInfo>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** 把任意异常归一成 ErrorInfo；未知异常也绝不静默吞掉。 */
export function toErrorInfo(e: unknown): ErrorInfo {
  if (isErrorInfo(e)) return e;
  if (e instanceof Error) {
    const code = (e as Error & { code?: ErrorCode }).code;
    return {
      code: code ?? 'E_UNKNOWN',
      message: e.message,
      detail: e.stack,
    };
  }
  return { code: 'E_UNKNOWN', message: String(e) };
}

function isErrorInfo(e: unknown): e is ErrorInfo {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    'message' in e &&
    typeof (e as { code: unknown }).code === 'string'
  );
}
