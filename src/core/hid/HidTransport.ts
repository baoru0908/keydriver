// 传输层抽象：定义 32 字节 RAW HID 帧收发的统一接口与错误类型（架构 §4.2.3）。

export const MSG_LEN = 32;
export const PAYLOAD_MAX = 28;
export const VIA_USAGE_PAGE = 0xff60;
export const VIA_USAGE = 0x61;

export type TransportKind = 'webhid' | 'nodehid' | 'dummy';

/** 设备描述：业务层只允许读取字段，禁止访问 native 句柄。 */
export interface HidDeviceInfo {
  /** 稳定 ID：`${vid}:${pid}:${productName}:${index}` */
  readonly id: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  readonly manufacturerName?: string;
  readonly serialNumber?: string;
  readonly usagePage?: number;
  readonly usage?: number;
  /** 是否声明了 VIA 的 RAW HID usage（0xFF60 / 0x61），用于「只显示可控制设备」过滤 */
  readonly viaCapable?: boolean;
  readonly kind: TransportKind;
  readonly native?: unknown;
}

export type Unsubscribe = () => void;

/** 最近一次设备扫描的摘要：已授权 HID 总数与其中可控制的台数（供 UI 回显）。 */
export interface ScanSummary {
  readonly total: number;
  readonly matched: number;
}

/** 枚举设备的可选项。 */
export interface ListDevicesOptions {
  /** true = 列出全部已授权 HID（调试用），不做可控制性过滤 */
  readonly includeAll?: boolean;
  /** 已登记定义的 "vid:pid"（十进制）列表，命中即视为可控制 */
  readonly knownIds?: readonly string[];
}

/** 传输层错误：只含超时与断开，不解释 0xFF（那是协议层职责）。 */
export class TransportError extends Error {
  readonly code: 'E_TRANSPORT_TIMEOUT' | 'E_TRANSPORT_DISCONNECT';

  constructor(
    code: 'E_TRANSPORT_TIMEOUT' | 'E_TRANSPORT_DISCONNECT',
    message: string,
    public rawHex?: string,
  ) {
    super(message);
    this.name = 'TransportError';
    this.code = code;
  }
}

export class TimeoutError extends TransportError {
  constructor(message: string, rawHex?: string) {
    super('E_TRANSPORT_TIMEOUT', message, rawHex);
    this.name = 'TimeoutError';
  }
}

export class DisconnectedError extends TransportError {
  constructor(message: string, rawHex?: string) {
    super('E_TRANSPORT_DISCONNECT', message, rawHex);
    this.name = 'DisconnectedError';
  }
}

export interface HidTransport {
  readonly kind: TransportKind;
  readonly isOpen: boolean;

  /** 当前运行环境是否支持该后端 */
  isSupported(): boolean;

  /** 最近一次扫描的摘要（未扫描过或实现不支持时为 undefined / null） */
  readonly lastScan?: ScanSummary | null;

  /** 枚举可用设备（默认只返回可控制的：VIA usage 命中或已登记定义） */
  listDevices(options?: ListDevicesOptions): Promise<HidDeviceInfo[]>;

  /** WebHID 专用：请求用户授权；其它后端为 no-op */
  requestAccess?(options?: { readonly includeAll?: boolean }): Promise<HidDeviceInfo[]>;

  open(info: HidDeviceInfo): Promise<void>;
  close(): Promise<void>;

  /**
   * 同步请求-响应。实现必须保证：① 并发调用严格串行化；
   * ② 超时抛 TimeoutError；③ 响应首字节为 0xFF 时**不抛错**（交由协议层判定）。
   */
  transfer(request: Uint8Array, timeoutMs?: number): Promise<Uint8Array>;

  onDisconnect(cb: (info: HidDeviceInfo) => void): Unsubscribe;
}

/** 串行化 promise 队列：保证同一传输上不会出现并发请求串包。 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(task, task);
    this.tail = run.catch(() => undefined);
    return run;
  }
}
