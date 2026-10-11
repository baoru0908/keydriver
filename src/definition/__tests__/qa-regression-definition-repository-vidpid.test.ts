// 【QA 缺陷复现 · 候选】findByVidPid 只对「小写 0x + 补零 pid」形态做兜底，
// 与同模块的 parseId（大小写/多种形态都认）口径不一致。
// 后果：定义文件用大写 hex 写 VID/PID 时，「设备重连 → 自动加载定义」静默失效，
// 用户看到的是「连上了但没有任何控件」，只能重新手动导入。
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { memory } = vi.hoisted(() => ({ memory: new Map<string, unknown>() }));

vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({ mock: 'store' })),
  get: vi.fn(async (key: string) => memory.get(String(key))),
  set: vi.fn(async (key: string, value: unknown) => {
    memory.set(String(key), value);
  }),
  del: vi.fn(async (key: string) => {
    memory.delete(String(key));
  }),
  keys: vi.fn(async () => [...memory.keys()]),
}));

import { findByVidPid, saveDefinition } from '@/definition/DefinitionRepository';
import type { ViaDefinition } from '@/definition/schema';

function makeRaw(name: string, vendorId: string, productId: string): ViaDefinition {
  return { name, vendorId, productId, matrix: { rows: 5, cols: 15 }, layouts: { keymap: [] } };
}

describe('qa-regression · findByVidPid 的 ID 形态兜底', () => {
  beforeEach(() => {
    memory.clear();
  });

  it('定义文件用大写 hex 写 ID 时，仍要能按数值 VID/PID 取回', async () => {
    await saveDefinition(makeRaw('upper', '0X1A2B', '0X0001'));
    const found = await findByVidPid(0x1a2b, 0x0001);
    expect(found?.meta.name, '期望命中 0X1A2B:0X0001').toBe('upper');
  });

  it('定义文件混合大小写时，仍要能按数值 VID/PID 取回', async () => {
    await saveDefinition(makeRaw('mixed', '0x1A2b', '0x00A1'));
    const found = await findByVidPid(0x1a2b, 0x00a1);
    expect(found?.meta.name, '期望命中 0x1A2b:0x00A1').toBe('mixed');
  });

  it('VID 未补零时（如 0x1 而非 0x0001），仍要能取回', async () => {
    await saveDefinition(makeRaw('short', '0x1', '0x2'));
    const found = await findByVidPid(0x0001, 0x0002);
    expect(found?.meta.name).toBe('short');
  });

  it('（对照）小写 + 补零 pid 的常规形态必须命中', async () => {
    await saveDefinition(makeRaw('normal', '0x1234', '0x0001'));
    expect((await findByVidPid(0x1234, 0x0001))?.meta.name).toBe('normal');
  });
});
