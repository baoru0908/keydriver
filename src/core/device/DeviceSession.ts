// 设备会话：握手结论、变更追踪（撤销栈，R-P1-07）、脏标记（架构 §3.5）。
import type { HandshakeResult } from './handshake';

export type ChangeKind = 'keycode' | 'layoutOptions' | 'value';

export interface ChangeEntry {
  readonly kind: ChangeKind;
  /** 变更对象标识：键位为 `${layer}:${row}:${col}`，值为 controlId */
  readonly target: string;
  readonly before: number;
  readonly after: number;
  readonly at: number;
}

const MAX_UNDO = 100;

export class DeviceSession {
  private handshakeResult: HandshakeResult | null = null;
  private readonly undoStack: ChangeEntry[] = [];
  private readonly dirty = new Set<string>();

  get handshake(): HandshakeResult | null {
    return this.handshakeResult;
  }

  setHandshake(result: HandshakeResult | null): void {
    this.handshakeResult = result;
  }

  get isConnected(): boolean {
    return this.handshakeResult !== null;
  }

  /** 记录一次变更（入撤销栈 + 标脏）。 */
  pushChange(entry: Omit<ChangeEntry, 'at'>): void {
    this.undoStack.push({ ...entry, at: Date.now() });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.dirty.add(`${entry.kind}:${entry.target}`);
  }

  /** 弹出最近一次变更（撤销）。 */
  popChange(): ChangeEntry | null {
    const entry = this.undoStack.pop() ?? null;
    if (entry) this.dirty.delete(`${entry.kind}:${entry.target}`);
    return entry;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  markDirty(kind: ChangeKind, target: string): void {
    this.dirty.add(`${kind}:${target}`);
  }

  clearDirty(kind: ChangeKind, target: string): void {
    this.dirty.delete(`${kind}:${target}`);
  }

  clearAllDirty(): void {
    this.dirty.clear();
  }

  isDirty(kind: ChangeKind, target: string): boolean {
    return this.dirty.has(`${kind}:${target}`);
  }

  get dirtyCount(): number {
    return this.dirty.size;
  }

  /** 断开/重连时重置全部会话态。 */
  reset(): void {
    this.handshakeResult = null;
    this.undoStack.length = 0;
    this.dirty.clear();
  }
}
