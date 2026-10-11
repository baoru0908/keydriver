// 连接态可见性：统一判定「是否可以显示只有连上以后才有意义的字段」。
//
// 背景：未连接时这些字段没有数据源（handshake 为 null），若照常渲染会铺满「—」占位符，
// 既误导用户（以为读到了值），也让界面显得杂乱。因此所有面板统一走这里判定，
// 并且用**条件渲染**（不产生 DOM 节点）而不是 CSS 隐藏，便于测试断言。
import type { ConnectionState } from '@/store/useDeviceStore';

/**
 * 是否显示连接态信息（连接状态 / 协议版本 / 固件版本 / 层数 / 键码字典版本 / 最近报文摘要等）。
 * 仅 state === 'connected' 为真：
 * - disconnected：设备已断开，握手结论已清空；
 * - connecting：尚未完成握手，取值没有意义；
 * - error：连接失败，此时残留的旧握手数据不可信。
 */
export function shouldShowConnectionInfo(state: ConnectionState): boolean {
  return state === 'connected';
}

/**
 * 连接状态 → 中文标签。
 * 只在「确实要显示连接态信息」时调用，故不使用「—」之类的占位符。
 */
export function connectionStateLabel(state: ConnectionState): string {
  if (state === 'connected') return '已连接';
  if (state === 'connecting') return '连接中';
  if (state === 'error') return '连接异常';
  return '未连接';
}

/** 常驻字段标签：数据来自定义文件，与是否连接无关（顺序即渲染顺序）。 */
export const DEFINITION_INFO_LABELS: readonly string[] = ['定义名称', 'VID', 'PID'];

/** 连接态字段标签：只有连上设备后才渲染（顺序即渲染顺序）。 */
export const CONNECTION_INFO_LABELS: readonly string[] = [
  '连接状态',
  '协议版本',
  '固件版本',
  '层数',
  '键码字典版本',
];

/** 未连接时设备信息卡底部的提示文案。 */
export const CONNECTION_INFO_HINT = '连接设备后显示协议版本、固件版本、层数等实时信息';
