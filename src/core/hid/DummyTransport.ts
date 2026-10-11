// Dummy 传输：无硬件时的全链路替身。内嵌 SimulatedFirmware，收发 32 字节原始帧（架构 A4）。
import {
  MSG_LEN,
  SerialQueue,
  TimeoutError,
  TransportError,
  type HidDeviceInfo,
  type HidTransport,
  type ListDevicesOptions,
  type Unsubscribe,
} from './HidTransport';
import { SimulatedFirmware, type FirmwareConfig } from './SimulatedFirmware';
import { pad32, frameToHex } from './frame';

export interface DummyConfig extends Partial<FirmwareConfig> {
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  readonly manufacturerName: string;
  readonly serialNumber: string;
  /** 单次 transfer 的超时上限（ms） */
  readonly timeoutMs: number;
}

export const DEFAULT_DUMMY_CONFIG: DummyConfig = {
  vendorId: 0x0000,
  productId: 0x0000,
  productName: 'Dummy 设备（模拟固件）',
  manufacturerName: 'keydriver',
  serialNumber: 'dummy-0001',
  timeoutMs: 1000,
};

export interface DummyDeviceInfo extends HidDeviceInfo {
  readonly kind: 'dummy';
}

/**
 * Dummy 传输实现。
 * 与 WebHidTransport 实现同一个接口，因此 ViaProtocol 在有/无硬件时跑完全同一份代码。
 */
export class DummyTransport implements HidTransport {
  readonly kind = 'dummy' as const;
  readonly firmware: SimulatedFirmware;

  private readonly config: DummyConfig;
  private readonly queue = new SerialQueue();
  private readonly disconnectCbs = new Set<(info: HidDeviceInfo) => void>();
  private opened = false;
  private current: HidDeviceInfo | null = null;

  constructor(config: Partial<DummyConfig> = {}) {
    this.config = { ...DEFAULT_DUMMY_CONFIG, ...config };
    this.firmware = new SimulatedFirmware(config);
  }

  get isOpen(): boolean {
    return this.opened;
  }

  /** 取固件配置（供 UI 展示注入的故障模式）。 */
  get firmwareConfig(): FirmwareConfig {
    return this.firmware.config;
  }

  isSupported(): boolean {
    return true;
  }

  /** 模拟设备恒定「可控制」：过滤开关对它无影响（options 仅为对齐接口签名）。 */
  async listDevices(_options?: ListDevicesOptions): Promise<HidDeviceInfo[]> {
    return [this.describe()];
  }

  async requestAccess(_options?: { readonly includeAll?: boolean }): Promise<HidDeviceInfo[]> {
    return [this.describe()];
  }

  async open(info: HidDeviceInfo): Promise<void> {
    if (info.kind !== 'dummy') {
      throw new TransportError('E_TRANSPORT_DISCONNECT', `DummyTransport 无法打开 ${info.kind} 设备`);
    }
    this.current = info;
    this.opened = true;
  }

  async close(): Promise<void> {
    this.opened = false;
    this.current = null;
  }

  /** 模拟拔线：触发 onDisconnect 回调（用于测试 R9 设备断开路径）。 */
  simulateDisconnect(): void {
    const info = this.current;
    this.opened = false;
    this.current = null;
    if (info) {
      for (const cb of this.disconnectCbs) cb(info);
    }
  }

  transfer(request: Uint8Array, timeoutMs?: number): Promise<Uint8Array> {
    return this.queue.enqueue(() => this.transferOnce(request, timeoutMs));
  }

  onDisconnect(cb: (info: HidDeviceInfo) => void): Unsubscribe {
    this.disconnectCbs.add(cb);
    return () => {
      this.disconnectCbs.delete(cb);
    };
  }

  private async transferOnce(request: Uint8Array, timeoutMs?: number): Promise<Uint8Array> {
    if (!this.opened) {
      throw new TransportError('E_TRANSPORT_DISCONNECT', 'Dummy 设备未连接');
    }
    const frame = pad32(request);
    const limit = timeoutMs ?? this.config.timeoutMs;
    const latency = this.firmware.config.latencyMs;

    if (this.firmware.config.dropRate > 0 && Math.random() < this.firmware.config.dropRate) {
      if (latency > 0) await sleep(latency);
      throw new TimeoutError('Dummy 设备丢包（注入 dropRate）', frameToHex(frame));
    }

    if (latency > 0) {
      if (latency >= limit) {
        throw new TimeoutError(`Dummy 设备响应超时（注入 latencyMs=${latency}）`, frameToHex(frame));
      }
      await sleep(latency);
    }
    return this.firmware.handle(frame);
  }

  private describe(): HidDeviceInfo {
    return {
      id: `dummy:${this.config.vendorId.toString(16)}:${this.config.productId.toString(16)}`,
      vendorId: this.config.vendorId,
      productId: this.config.productId,
      productName: this.config.productName,
      manufacturerName: this.config.manufacturerName,
      serialNumber: this.config.serialNumber,
      // 模拟设备永远可被控制，否则「只显示可控制设备」开关会把它过滤掉，全链路演练无法进行
      viaCapable: true,
      kind: 'dummy',
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const DUMMY_MSG_LEN = MSG_LEN;
