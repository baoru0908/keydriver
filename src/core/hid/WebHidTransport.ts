// WebHID 传输：真实键盘的接入实现（T05）。
//
// 与 DummyTransport 实现同一个 HidTransport 接口，因此 ViaProtocol / DeviceFacade
// 在有硬件与无硬件时跑的是完全同一份代码——这是当初把传输层抽象出来的意义。
//
// 关键约定：
//   · VIA 走 RAW HID，reportId = 0，收发固定 32 字节帧；
//   · 请求授权（requestDevice）必须由用户手势触发（点击），浏览器安全策略要求；
//   · getDevices() 只返回「之前已授权」的设备，所以首次必须走 requestAccess()。
import {
  MSG_LEN,
  SerialQueue,
  TimeoutError,
  TransportError,
  type HidDeviceInfo,
  type HidTransport,
  type ListDevicesOptions,
  type ScanSummary,
  type Unsubscribe,
} from './HidTransport';
import { VIA_HID_FILTERS, filterControllableDevices, isViaHidDevice } from './viaFilter';
import { pad32, frameToHex } from './frame';

/** VIA 原始 HID 的报告 ID。 */
const VIA_REPORT_ID = 0;
const DEFAULT_TIMEOUT_MS = 1000;

export interface WebHidDeviceInfo extends HidDeviceInfo {
  readonly kind: 'webhid';
}

/**
 * 把 WebHID 的 HIDDevice 映射成本项目的 HidDeviceInfo（native 里保留原句柄供 open 使用）。
 *
 * ⚠️ usage 取自**声明了 VIA RAW HID 的那个 collection**，而不是写死 collections[0]：
 * 多数键盘把标准键盘接口排在最前，VIA 接口在其后，取 [0] 会导致 usagePage/usage 记录错误，
 * 进而让「是否可控制」的判定失真。找不到 VIA collection 时才回退到第 0 个。
 */
function toInfo(device: HIDDevice, index: number): HidDeviceInfo {
  const collections: readonly HIDCollectionInfo[] = device.collections ?? [];
  const viaCollection = collections.find((collection) => isViaHidDevice({ collections: [collection] }));
  const picked = viaCollection ?? collections[0];
  return {
    id: `webhid:${device.vendorId.toString(16)}:${device.productId.toString(16)}:${device.productName ?? ''}:${index}`,
    vendorId: device.vendorId,
    productId: device.productId,
    productName: device.productName ?? '未命名 HID 设备',
    ...(picked?.usagePage !== undefined ? { usagePage: picked.usagePage } : {}),
    ...(picked?.usage !== undefined ? { usage: picked.usage } : {}),
    viaCapable: isViaHidDevice({ collections }),
    kind: 'webhid',
    native: device,
  };
}

export class WebHidTransport implements HidTransport {
  readonly kind = 'webhid' as const;

  private readonly queue = new SerialQueue();
  private readonly disconnectCbs = new Set<(info: HidDeviceInfo) => void>();
  private readonly timeoutMs: number;
  private device: HIDDevice | null = null;
  private current: HidDeviceInfo | null = null;
  /** disconnect 监听只挂一次，避免每次调用 onDisconnect 都重复注册。 */
  private disconnectBound = false;
  /** 最近一次扫描摘要：已授权 HID 总数 / 其中可控制台数（UI 用它解释「为什么列表是空的」）。 */
  private scan: ScanSummary | null = null;

  constructor(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs;
  }

  get lastScan(): ScanSummary | null {
    return this.scan;
  }

  get isOpen(): boolean {
    return this.device !== null && this.device.opened;
  }

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'hid' in navigator;
  }

  /**
   * 只返回之前授权过的设备；首次使用需先调用 requestAccess()。
   *
   * 默认按「可控制」过滤（官方 VIA 口径：声明 VIA RAW HID usage，或命中已登记定义），
   * 传 includeAll = true 可旁路过滤列出全部已授权 HID（调试/救急用）。
   * 每次调用都会刷新 lastScan，UI 据此提示「共 N 台已授权设备，其中 M 台可控制」。
   */
  async listDevices(options?: ListDevicesOptions): Promise<HidDeviceInfo[]> {
    if (!this.isSupported()) return [];
    const devices = await navigator.hid.getDevices();
    const infos = devices.map((device, index) => toInfo(device, index));
    // 摘要里的 matched 恒为「真正可控的台数」，即使本次按 includeAll 全量列出也不虚报
    const controllable = filterControllableDevices(infos, { knownIds: options?.knownIds });
    this.scan = { total: infos.length, matched: controllable.length };
    return options?.includeAll === true ? infos : controllable;
  }

  /**
   * 请求授权：必须由用户手势（点击）触发。
   *
   * 默认按官方 VIA 的 RAW HID usage（0xFF60 / 0x61）过滤，选择器里只出现声明了该 usage 的
   * 设备——这样鼠标、手柄、触摸板等无关 HID 不会再混进来。
   * 少数固件未声明该 usage（表现为「官方 VIA 能识别、我们搜不到」），
   * 此时传 includeAll = true 用空过滤器旁路，列出全部 HID 设备让用户手工挑。
   */
  async requestAccess(options?: { readonly includeAll?: boolean }): Promise<HidDeviceInfo[]> {
    if (!this.isSupported()) {
      throw new TransportError('E_TRANSPORT_DISCONNECT', '当前环境不支持 WebHID（需 Chrome / Edge 113+，或 https / localhost）');
    }
    const filters = options?.includeAll === true ? [] : VIA_HID_FILTERS;
    const devices = await navigator.hid.requestDevice({ filters });
    return devices.map((device, index) => toInfo(device, index));
  }

  async open(info: HidDeviceInfo): Promise<void> {
    const native = info.native as HIDDevice | undefined;
    const device =
      native ??
      (await navigator.hid.getDevices()).find(
        (d) => d.vendorId === info.vendorId && d.productId === info.productId && d.productName === info.productName,
      );
    if (!device) {
      throw new TransportError('E_TRANSPORT_DISCONNECT', '未找到该 WebHID 设备，请重新授权');
    }
    if (!device.opened) await device.open();
    this.device = device;
    this.current = info;
    this.bindDisconnect();
  }

  async close(): Promise<void> {
    const device = this.device;
    this.device = null;
    this.current = null;
    if (device && device.opened) await device.close();
  }

  transfer(request: Uint8Array, timeoutMs?: number): Promise<Uint8Array> {
    return this.queue.enqueue(() => this.transferOnce(request, timeoutMs));
  }

  onDisconnect(cb: (info: HidDeviceInfo) => void): Unsubscribe {
    this.disconnectCbs.add(cb);
    this.bindDisconnect();
    return () => {
      this.disconnectCbs.delete(cb);
    };
  }

  /** 挂一次全局 disconnect 监听（WebHID 的事件是挂在 navigator.hid 上的）。 */
  private bindDisconnect(): void {
    if (this.disconnectBound || typeof navigator === 'undefined' || !('hid' in navigator)) return;
    this.disconnectBound = true;
    navigator.hid.addEventListener('disconnect', (event: HIDConnectionEvent) => {
      const info = this.current;
      if (info && event.device && event.device.vendorId === info.vendorId && event.device.productId === info.productId) {
        this.device = null;
        this.current = null;
        for (const cb of this.disconnectCbs) cb(info);
      }
    });
  }

  private async transferOnce(request: Uint8Array, timeoutMs?: number): Promise<Uint8Array> {
    const device = this.device;
    if (!device || !device.opened) {
      throw new TransportError('E_TRANSPORT_DISCONNECT', 'WebHID 设备未连接');
    }
    const frame = pad32(request);
    const limit = timeoutMs ?? this.timeoutMs;

    return new Promise<Uint8Array>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = (): void => {
        if (timer !== undefined) clearTimeout(timer);
        device.removeEventListener('inputreport', onInput);
      };

      const onInput = (event: HIDInputReportEvent): void => {
        if (event.reportId !== VIA_REPORT_ID) return;
        const view = event.data;
        const data = new Uint8Array(view.byteLength);
        for (let i = 0; i < view.byteLength; i += 1) data[i] = view.getUint8(i);
        cleanup();
        // 固件若返回不足 32 字节，补齐以免上层越界（真实 VIA 固固定 32 字节）
        resolve(pad32(data));
      };

      device.addEventListener('inputreport', onInput);
      timer = setTimeout(() => {
        cleanup();
        reject(new TimeoutError('WebHID 设备响应超时', frameToHex(frame)));
      }, limit);

      // sendReport 要求 ArrayBufferView<ArrayBuffer>；pad32 的结果可能是 ArrayBufferLike 视图，
      // 这里复制一份确保底层是普通 ArrayBuffer
      device.sendReport(VIA_REPORT_ID, new Uint8Array(frame)).catch((e: unknown) => {
        cleanup();
        reject(
          new TransportError(
            'E_TRANSPORT_DISCONNECT',
            `发送失败：${e instanceof Error ? e.message : String(e)}`,
            frameToHex(frame),
          ),
        );
      });
    });
  }
}

export const WEBHID_MSG_LEN = MSG_LEN;
