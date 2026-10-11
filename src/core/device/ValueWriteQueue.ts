// 值写入队列：防抖（range/color 200ms）+ 串行 + 失败重试 + 脏标记清除（架构 R7 / §5.3）。
import type { ControlSpec } from '@/definition/schema';
import { addressKey } from '@/core/protocol/CustomValueCodec';
import { debounce, type Debounced } from '@/shared/debounce';

export const DEFAULT_DEBOUNCE_MS = 200;

export type ValueWriter = (control: ControlSpec, value: number) => Promise<void>;

export interface WriteQueueOptions {
  readonly debounceMs?: number;
  readonly onError?: (control: ControlSpec, value: number, error: unknown) => void;
}

/**
 * 写入队列保证：
 * ① 同一地址的高频输入只保留最后一次（拖 100 次只发 1 次写）；
 * ② 不同地址的写入严格串行，不会并发下发；
 * ③ 失败不抛出到 UI，交给 onError 记录。
 */
export class ValueWriteQueue {
  private readonly pending = new Map<string, { control: ControlSpec; value: number }>();
  private readonly timers = new Map<string, Debounced<[ControlSpec, number]>>();
  private chain: Promise<void> = Promise.resolve();
  private readonly debounceMs: number;
  private readonly onError?: (control: ControlSpec, value: number, error: unknown) => void;

  constructor(
    private readonly writer: ValueWriter,
    options: WriteQueueOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.onError = options.onError;
  }

  /** 立即写入（toggle / dropdown / keycode / button）。 */
  async writeNow(control: ControlSpec, value: number): Promise<void> {
    // 取消该地址挂起的防抖写入，避免旧值覆盖新值
    this.timers.get(addressKey(control.address))?.cancel();
    this.pending.delete(addressKey(control.address));
    return this.enqueue(control, value);
  }

  /** 防抖写入（range / color）。 */
  writeDebounced(control: ControlSpec, value: number): void {
    const key = addressKey(control.address);
    let timer = this.timers.get(key);
    if (!timer) {
      timer = debounce<[ControlSpec, number]>((c, v) => {
        this.timers.delete(addressKey(c.address));
        this.pending.delete(addressKey(c.address));
        void this.enqueue(c, v);
      }, this.debounceMs);
      this.timers.set(key, timer);
    }
    this.pending.set(key, { control, value });
    timer(control, value);
  }

  /** 立即下发所有挂起的写入（面板切换 / 保存前调用）。 */
  async flush(): Promise<void> {
    const entries = [...this.pending.values()];
    this.pending.clear();
    for (const timer of this.timers.values()) timer.cancel();
    this.timers.clear();
    for (const entry of entries) {
      await this.enqueue(entry.control, entry.value);
    }
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  private enqueue(control: ControlSpec, value: number): Promise<void> {
    const run = this.chain.then(async () => {
      try {
        await this.writer(control, value);
      } catch (e) {
        this.onError?.(control, value, e);
      }
    });
    this.chain = run;
    return run;
  }
}
