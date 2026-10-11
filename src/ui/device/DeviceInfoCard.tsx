// 设备信息卡（纯展示组件）：常驻字段来自定义文件，连接态字段仅在已连接时渲染。
//
// 为什么抽成纯组件：它不读任何 store，全部数据由 props 传入，
// 测试可以直接按 props 渲染（SSR 字符串）并断言「DOM 里到底有没有某个节点」，
// 不必和 zustand 的 SSR 初始快照纠缠。
import { Cpu, Usb } from 'lucide-react';
import type { HandshakeResult } from '@/core/device/handshake';
import type { ConnectionState } from '@/store/useDeviceStore';
import { cn } from '@/shared/cn';
import {
  CONNECTION_INFO_HINT,
  connectionStateLabel,
  shouldShowConnectionInfo,
} from '@/ui/device/connectionInfo';

function formatHex(value: number | null): string {
  if (value === null) return '—';
  return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;
}

/** 固件版本：0 视为未知，显示占位符。 */
function formatFirmwareVersion(value: number): string {
  if (value === 0) return '—';
  return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * 信息行：统一细分割线 + 右对齐取值。
 * 设备信息行一多就分不清归属；加分割线后长列表更易读，
 * 也让各面板的信息列表保持同一套视觉语言。
 */
function InfoRow({
  label,
  value,
  mono,
  children,
}: {
  readonly label: string;
  readonly value?: string;
  readonly mono?: boolean;
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between border-b border-border py-1.5 last:border-b-0">
      <dt className="text-fg-muted">{label}</dt>
      <dd className={cn('text-fg', mono ? 'font-mono' : undefined)}>{children ?? value}</dd>
    </div>
  );
}

export interface DeviceInfoCardProps {
  /** 定义文件中的名称（未加载定义时为 null） */
  readonly definitionName: string | null;
  readonly vid: number | null;
  readonly pid: number | null;
  /** 当前连接状态：决定是否渲染连接态字段 */
  readonly state: ConnectionState;
  /** 握手结论：仅 state === 'connected' 时应有值 */
  readonly handshake: HandshakeResult | null;
}

export function DeviceInfoCard({
  definitionName,
  vid,
  pid,
  state,
  handshake,
}: DeviceInfoCardProps): React.JSX.Element {
  const showConnectionInfo = shouldShowConnectionInfo(state);
  const connected = state === 'connected';

  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
        <Cpu size={15} className="text-accent" /> 设备信息
      </h2>
      <dl className="flex flex-col text-sm">
        {/* 常驻：定义侧信息，与是否连接无关 */}
        <InfoRow label="定义名称" value={definitionName ?? '—'} mono />
        <InfoRow label="VID" value={formatHex(vid)} mono />
        <InfoRow label="PID" value={formatHex(pid)} mono />

        {/* 连接态：仅连接后渲染（未连接时 DOM 里完全不存在这些行） */}
        {showConnectionInfo ? (
          <InfoRow label="连接状态">
            <span className="flex items-center gap-1.5 text-accent">
              <Usb size={13} /> {connectionStateLabel(state)}
            </span>
          </InfoRow>
        ) : null}
        {/* 握手结论：连上了但没有 handshake 时也不铺占位符，宁缺毋滥 */}
        {showConnectionInfo && handshake ? (
          <>
            <InfoRow label="协议版本" value={`v${handshake.protocolVersion}`} mono />
            <InfoRow label="固件版本" value={formatFirmwareVersion(handshake.firmwareVersion)} mono />
            <InfoRow label="层数" value={String(handshake.layerCount)} mono />
            <InfoRow
              label="键码字典版本"
              value={handshake.keycodesVersion !== null ? `v${handshake.keycodesVersion}` : '—'}
              mono
            />
          </>
        ) : null}
      </dl>
      {!showConnectionInfo && !connected ? (
        <p className="text-[11px] text-fg-dim">{CONNECTION_INFO_HINT}</p>
      ) : null}
    </section>
  );
}
