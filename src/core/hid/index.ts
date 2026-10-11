// 传输层工厂：按 kind 创建具体实现。WebHID 与 node-hid 桥接在 T05/P2 落地。
import type { HidTransport, TransportKind } from './HidTransport';
import { DummyTransport, type DummyConfig } from './DummyTransport';
import { WebHidTransport } from './WebHidTransport';

export * from './HidTransport';
export * from './frame';
export * from './viaFilter';
export { DummyTransport, DEFAULT_DUMMY_CONFIG } from './DummyTransport';
export type { DummyConfig } from './DummyTransport';
export { WebHidTransport } from './WebHidTransport';
export { SimulatedFirmware, DEFAULT_FIRMWARE_CONFIG } from './SimulatedFirmware';
export type { FirmwareConfig } from './SimulatedFirmware';

export interface CreateTransportOptions {
  readonly kind: TransportKind;
  readonly dummy?: Partial<DummyConfig>;
}

export function createTransport(options: CreateTransportOptions): HidTransport {
  switch (options.kind) {
    case 'dummy':
      return new DummyTransport(options.dummy ?? {});
    case 'webhid':
      return new WebHidTransport();
    case 'nodehid':
      throw new Error('NodeHidBridgeTransport 为 P2 预留，尚未实现');
    default:
      throw new Error(`未知传输类型：${String(options.kind)}`);
  }
}
