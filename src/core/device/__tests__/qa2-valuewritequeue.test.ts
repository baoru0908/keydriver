// QA2 · ValueWriteQueue 边界：防抖合并 / 串行 / writeNow 抢占 / flush / 失败隔离。
import { describe, expect, it } from 'vitest';
import { ValueWriteQueue, DEFAULT_DEBOUNCE_MS } from '@/core/device/ValueWriteQueue';
import { makeAddress } from '@/core/protocol/CustomValueCodec';
import type { ControlSpec } from '@/definition/schema';

function control(channel: number, valueId: number, id = `c${channel}-${valueId}`): ControlSpec {
  return {
    id,
    valueKey: `vk_${id}`,
    label: id,
    type: 'range',
    options: { kind: 'range', min: 0, max: 1000 },
    address: makeAddress(channel, valueId, []),
    menuId: 'm0',
    path: [],
    widthHint: 2,
  };
}

interface Recorder {
  calls: Array<{ id: string; value: number }>;
  /** 并发进入计数（>1 说明串行保证被破坏） */
  maxConcurrent: number;
}

function recorder(failOn?: (id: string, value: number) => boolean): {
  rec: Recorder;
  writer: (c: ControlSpec, v: number) => Promise<void>;
} {
  const rec: Recorder = { calls: [], maxConcurrent: 0 };
  let active = 0;
  const writer = async (c: ControlSpec, v: number): Promise<void> => {
    active += 1;
    rec.maxConcurrent = Math.max(rec.maxConcurrent, active);
    await Promise.resolve();
    if (failOn?.(c.id, v)) throw new Error(`写入失败 ${c.id}=${v}`);
    rec.calls.push({ id: c.id, value: v });
    active -= 1;
  };
  return { rec, writer };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('QA2 · 防抖合并（拖 100 次只发 1 次）', () => {
  it('同一地址高频写入只落最后一次，且只调用 writer 一次', async () => {
    const { rec, writer } = recorder();
    const q = new ValueWriteQueue(writer, { debounceMs: 10 });
    for (let v = 1; v <= 100; v += 1) q.writeDebounced(control(0, 1), v);
    expect(q.pendingCount).toBe(1);
    await sleep(40);
    expect(rec.calls).toEqual([{ id: 'c0-1', value: 100 }]);
  });

  it('不同地址的防抖互相独立，各自保留最后值', async () => {
    const { rec, writer } = recorder();
    const q = new ValueWriteQueue(writer, { debounceMs: 10 });
    for (let v = 1; v <= 5; v += 1) {
      q.writeDebounced(control(0, 1), v);
      q.writeDebounced(control(0, 2), v * 10);
    }
    expect(q.pendingCount).toBe(2);
    await sleep(40);
    expect(rec.calls).toHaveLength(2);
    expect(rec.calls.find((c) => c.id === 'c0-1')?.value).toBe(5);
    expect(rec.calls.find((c) => c.id === 'c0-2')?.value).toBe(50);
  });

  it('窗口外的第二次输入另起一次写入（防抖不应无限合并）', async () => {
    const { rec, writer } = recorder();
    const q = new ValueWriteQueue(writer, { debounceMs: 10 });
    q.writeDebounced(control(0, 1), 1);
    await sleep(40);
    q.writeDebounced(control(0, 1), 2);
    await sleep(40);
    expect(rec.calls).toEqual([
      { id: 'c0-1', value: 1 },
      { id: 'c0-1', value: 2 },
    ]);
  });

  it('默认防抖窗口为 200ms', () => {
    expect(DEFAULT_DEBOUNCE_MS).toBe(200);
    const { writer } = recorder();
    const q = new ValueWriteQueue(writer);
    q.writeDebounced(control(0, 1), 1);
    // 远小于默认窗口时尚未下发
    expect(q.pendingCount).toBe(1);
  });
});

describe('QA2 · 写入串行化', () => {
  it('不同地址的写入严格串行，不出现并发下发', async () => {
    const { rec, writer } = recorder();
    const q = new ValueWriteQueue(writer, { debounceMs: 1 });
    await Promise.all([
      q.writeNow(control(0, 1), 1),
      q.writeNow(control(0, 2), 2),
      q.writeNow(control(0, 3), 3),
    ]);
    expect(rec.maxConcurrent).toBe(1);
    expect(rec.calls.map((c) => c.id)).toEqual(['c0-1', 'c0-2', 'c0-3']);
  });

  it('writeNow 按调用顺序下发（先到先写）', async () => {
    const { rec, writer } = recorder();
    const q = new ValueWriteQueue(writer);
    await Promise.all([q.writeNow(control(0, 1), 10), q.writeNow(control(0, 1), 20)]);
    expect(rec.calls.map((c) => c.value)).toEqual([10, 20]);
  });

  it('writeNow 返回 Promise 解析时，该次写入已完成', async () => {
    const { rec, writer } = recorder();
    const q = new ValueWriteQueue(writer);
    await q.writeNow(control(0, 1), 42);
    expect(rec.calls).toEqual([{ id: 'c0-1', value: 42 }]);
  });
});

describe('QA2 · writeNow 抢占挂起的防抖写入', () => {
  it('writeNow 后，同地址挂起的旧值不得再写入（旧值不覆盖新值）', async () => {
    const { rec, writer } = recorder();
    const q = new ValueWriteQueue(writer, { debounceMs: 20 });
    q.writeDebounced(control(0, 1), 111);
    await q.writeNow(control(0, 1), 222);
    await sleep(60);
    expect(rec.calls).toEqual([{ id: 'c0-1', value: 222 }]);
  });

  it('writeNow 后 pendingCount 归零', async () => {
    const { writer } = recorder();
    const q = new ValueWriteQueue(writer, { debounceMs: 20 });
    q.writeDebounced(control(0, 1), 1);
    expect(q.pendingCount).toBe(1);
    await q.writeNow(control(0, 1), 2);
    expect(q.pendingCount).toBe(0);
  });

  it('抢占后同地址仍可再次使用防抖写入（复用被取消的 timer 不影响后续）', async () => {
    const { rec, writer } = recorder();
    const q = new ValueWriteQueue(writer, { debounceMs: 15 });
    q.writeDebounced(control(0, 1), 1);
    await q.writeNow(control(0, 1), 2);
    q.writeDebounced(control(0, 1), 3);
    await sleep(60);
    expect(rec.calls.map((c) => c.value)).toEqual([2, 3]);
  });
});

describe('QA2 · flush 立即下发', () => {
  it('flush 下发全部挂起值并清空 pending', async () => {
    const { rec, writer } = recorder();
    const q = new ValueWriteQueue(writer, { debounceMs: 500 });
    q.writeDebounced(control(0, 1), 7);
    q.writeDebounced(control(0, 2), 8);
    expect(q.pendingCount).toBe(2);
    await q.flush();
    expect(q.pendingCount).toBe(0);
    expect(rec.calls).toEqual([
      { id: 'c0-1', value: 7 },
      { id: 'c0-2', value: 8 },
    ]);
  });

  it('flush 取消挂起的防抖回调，避免重复下发同一值', async () => {
    const { rec, writer } = recorder();
    const q = new ValueWriteQueue(writer, { debounceMs: 20 });
    q.writeDebounced(control(0, 1), 5);
    await q.flush();
    await sleep(60);
    expect(rec.calls).toEqual([{ id: 'c0-1', value: 5 }]);
  });

  it('无挂起项时 flush 是空操作', async () => {
    const { rec, writer } = recorder();
    const q = new ValueWriteQueue(writer);
    await q.flush();
    expect(rec.calls).toEqual([]);
  });
});

describe('QA2 · 失败隔离', () => {
  it('writer 抛错不冒泡到调用方，改由 onError 记录', async () => {
    const { writer } = recorder((_id, v) => v === 2);
    const errors: Array<{ id: string; value: number; message: string }> = [];
    const q = new ValueWriteQueue(writer, {
      onError: (c, v, e) =>
        errors.push({ id: c.id, value: v, message: e instanceof Error ? e.message : String(e) }),
    });
    await expect(q.writeNow(control(0, 1), 2)).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.value).toBe(2);
  });

  it('单次失败不得中断后续写入（串行链保持存活）', async () => {
    const { rec, writer } = recorder((_id, v) => v === 2);
    const q = new ValueWriteQueue(writer, { onError: () => undefined });
    await q.writeNow(control(0, 1), 1);
    await q.writeNow(control(0, 1), 2);
    await q.writeNow(control(0, 1), 3);
    expect(rec.calls.map((c) => c.value)).toEqual([1, 3]);
  });

  it('防抖写入失败同样走 onError，不影响其它地址', async () => {
    const { rec, writer } = recorder((id) => id === 'c0-1');
    const errors: string[] = [];
    const q = new ValueWriteQueue(writer, { debounceMs: 10, onError: (c) => errors.push(c.id) });
    q.writeDebounced(control(0, 1), 1);
    q.writeDebounced(control(0, 2), 2);
    await sleep(40);
    expect(errors).toEqual(['c0-1']);
    expect(rec.calls.map((c) => c.id)).toEqual(['c0-2']);
  });
});
