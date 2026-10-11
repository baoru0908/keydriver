// 设备门面层工厂与统一导出。
import type { HidDeviceInfo, HidTransport } from '@/core/hid/HidTransport';
import { DeviceFacade, type DeviceFacadeOptions } from './DeviceFacade';

export * from './DeviceFacade';
export { DeviceSession } from './DeviceSession';
export { ValueWriteQueue, DEFAULT_DEBOUNCE_MS } from './ValueWriteQueue';
export { runHandshake, runProbe } from './handshake';
export type { HandshakeResult, ProbeResult, ProtocolWarning } from './handshake';

export function createDeviceFacade(
  transport: HidTransport,
  device: HidDeviceInfo,
  options: DeviceFacadeOptions = {},
): DeviceFacade {
  return new DeviceFacade(transport, device, options);
}
