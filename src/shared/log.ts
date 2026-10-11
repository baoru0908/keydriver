// 结构化日志：默认输出到 console，由 useDebugStore 注册 sink 后同步写入调试面板（架构 §8.8：禁止静默失败）。

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  readonly level: LogLevel;
  readonly scope: string;
  readonly message: string;
  readonly at: number;
  readonly data?: unknown;
}

type LogSink = (record: LogRecord) => void;

const sinks: LogSink[] = [];

/** 注册日志消费者（useDebugStore 在初始化时调用）。返回取消函数。 */
export function registerLogSink(sink: LogSink): () => void {
  sinks.push(sink);
  return () => {
    const i = sinks.indexOf(sink);
    if (i >= 0) sinks.splice(i, 1);
  };
}

function emit(level: LogLevel, scope: string, message: string, data?: unknown): void {
  const record: LogRecord = { level, scope, message, at: Date.now(), data };
  for (const sink of sinks) {
    try {
      sink(record);
    } catch {
      // sink 自身失败不得影响主流程
    }
  }
  if (import.meta.env?.DEV !== false && level !== 'debug') {
    const prefix = `[${scope}]`;
    if (level === 'error') console.error(prefix, message, data ?? '');
    else if (level === 'warn') console.warn(prefix, message, data ?? '');
    else console.info(prefix, message, data ?? '');
  }
}

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, data) => emit('debug', scope, message, data),
    info: (message, data) => emit('info', scope, message, data),
    warn: (message, data) => emit('warn', scope, message, data),
    error: (message, data) => emit('error', scope, message, data),
  };
}
