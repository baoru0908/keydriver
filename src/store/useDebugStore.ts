// 调试状态：原始报文环形缓冲（上限 500）+ 协议告警（架构 §8.8：禁止静默失败）。
import { create } from 'zustand';
import type { FrameRecord } from '@/core/protocol/ViaProtocol';
import type { ProtocolWarning } from '@/core/device/handshake';

export const FRAME_LOG_LIMIT = 500;

export interface FrameEntry extends FrameRecord {
  readonly id: number;
}

export interface WarningEntry extends ProtocolWarning {
  readonly id: number;
  readonly at: number;
}

export interface LogEntry {
  readonly id: number;
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly scope: string;
  readonly message: string;
  readonly at: number;
}

interface DebugState {
  frames: readonly FrameEntry[];
  warnings: readonly WarningEntry[];
  logs: readonly LogEntry[];
  debugPanelOpen: boolean;
  pushFrame: (record: FrameRecord) => void;
  pushWarning: (warning: ProtocolWarning) => void;
  pushLog: (entry: Omit<LogEntry, 'id'>) => void;
  clearFrames: () => void;
  clearWarnings: () => void;
  toggleDebugPanel: (open?: boolean) => void;
}

let frameSeq = 0;
let warnSeq = 0;
let logSeq = 0;

const EMPTY_FRAMES: readonly FrameEntry[] = [];
const EMPTY_WARNINGS: readonly WarningEntry[] = [];
const EMPTY_LOGS: readonly LogEntry[] = [];

export const useDebugStore = create<DebugState>((set) => ({
  frames: EMPTY_FRAMES,
  warnings: EMPTY_WARNINGS,
  logs: EMPTY_LOGS,
  debugPanelOpen: false,

  pushFrame: (record) =>
    set((state) => {
      frameSeq += 1;
      const next = [...state.frames, { ...record, id: frameSeq }];
      return { frames: next.length > FRAME_LOG_LIMIT ? next.slice(-FRAME_LOG_LIMIT) : next };
    }),

  pushWarning: (warning) =>
    set((state) => {
      warnSeq += 1;
      const next = [{ ...warning, id: warnSeq, at: Date.now() }, ...state.warnings];
      return { warnings: next.slice(0, 100) };
    }),

  pushLog: (entry) =>
    set((state) => {
      logSeq += 1;
      const next = [{ ...entry, id: logSeq }, ...state.logs];
      return { logs: next.slice(0, 200) };
    }),

  clearFrames: () => set({ frames: EMPTY_FRAMES }),
  clearWarnings: () => set({ warnings: EMPTY_WARNINGS }),
  toggleDebugPanel: (open) => set((state) => ({ debugPanelOpen: open ?? !state.debugPanelOpen })),
}));

/** 供纯逻辑层直接调用的便捷函数（无需 React hook）。 */
export const debugActions = {
  frame: (record: FrameRecord): void => useDebugStore.getState().pushFrame(record),
  warning: (warning: ProtocolWarning): void => useDebugStore.getState().pushWarning(warning),
  log: (entry: Omit<LogEntry, 'id'>): void => useDebugStore.getState().pushLog(entry),
  open: (open = true): void => useDebugStore.getState().toggleDebugPanel(open),
};
