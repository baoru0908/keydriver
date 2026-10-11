// QA 独立验证 · 定义库持久化（DefinitionRepository）：0% 覆盖的唯一盲区，且属于
// 「重连自动加载」路径——失败时症状是「连上了但没有定义文件可用」，用户只会以为 UI 抽风。
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

// eslint-disable-next-line import/first
import {
  findByVidPid,
  getCurrentDefinitionId,
  listDefinitions,
  loadRecentDefinition,
  removeDefinition,
  saveDefinition,
  setCurrentDefinitionId,
  type DefinitionRecord,
} from '@/definition/DefinitionRepository';
import type { ViaDefinition } from '@/definition/schema';

function makeRaw(name: string, vendorId: string, productId: string): ViaDefinition {
  return {
    name,
    vendorId,
    productId,
    matrix: { rows: 5, cols: 15 },
    layouts: { keymap: [] },
  };
}

describe('QA · 定义库存取', () => {
  beforeEach(() => {
    memory.clear();
  });

  it('saveDefinition：以 `${vendorId}:${productId}` 建索引，并写入 meta', async () => {
    const meta = await saveDefinition(makeRaw('kbd-a', '0x1234', '0x0001'));
    expect(meta.id).toBe('0x1234:0x0001');
    expect(meta.name).toBe('kbd-a');
    expect(meta.vendorId).toBe('0x1234');
    expect(memory.has('0x1234:0x0001')).toBe(true);
    const record = memory.get('0x1234:0x0001') as DefinitionRecord | undefined;
    expect(record?.raw.name).toBe('kbd-a');
  });

  it('同一 VID/PID 重复导入不产生第二条记录（按 id 覆盖）', async () => {
    await saveDefinition(makeRaw('kbd-a', '0x1234', '0x0001'));
    await saveDefinition(makeRaw('kbd-a-v2', '0x1234', '0x0001'));
    await expect(listDefinitions()).resolves.toHaveLength(1);
    const list = await listDefinitions();
    expect(list[0]?.name).toBe('kbd-a-v2');
  });

  it('listDefinitions 按最近保存排序，且不把索引键当定义返回', async () => {
    await saveDefinition(makeRaw('older', '0x1111', '0x0001'));
    await new Promise((r) => setTimeout(r, 5));
    await saveDefinition(makeRaw('newer', '0x2222', '0x0002'));
    await setCurrentDefinitionId('0x2222:0x0002');

    const list = await listDefinitions();
    expect(list.map((m) => m.name)).toEqual(['newer', 'older']);
    expect(list.map((m) => m.id).some((id) => id.startsWith('index:'))).toBe(false);
    expect(list.map((m) => m.id).some((id) => id.startsWith('current:'))).toBe(false);
  });

  it('当前定义 / 最近定义：显式指定优先，未指定时回落到最近保存的那条', async () => {
    await saveDefinition(makeRaw('a', '0x1111', '0x0001'));
    await new Promise((r) => setTimeout(r, 5));
    await saveDefinition(makeRaw('b', '0x2222', '0x0002'));

    await expect(getCurrentDefinitionId()).resolves.toBeNull();
    const fallback = await loadRecentDefinition();
    expect(fallback?.meta.name).toBe('b'); // ↑ 最近保存

    await setCurrentDefinitionId('0x1111:0x0001');
    await expect(getCurrentDefinitionId()).resolves.toBe('0x1111:0x0001');
    expect((await loadRecentDefinition())?.meta.name).toBe('a');
  });

  it('（已知行为）savedAt 打到同一毫秒时，「最近」退化为键序（0x1111 先于 0x2222）', async () => {
    // listDefinitions 只按 savedAt 倒序，同毫秒时依赖 IndexedDB keys() 的升序 + sort 稳定性，
    // 结论：同一毫秒连续导入两份定义，重连时自动加载到的不一定是最后那份。
    await saveDefinition(makeRaw('a', '0x1111', '0x0001'));
    await saveDefinition(makeRaw('b', '0x2222', '0x0002'));
    expect((await loadRecentDefinition())?.meta.name).toBe('a');
  });

  it('removeDefinition 之后查不到，也不再出现在列表里', async () => {
    await saveDefinition(makeRaw('a', '0x1111', '0x0001'));
    await removeDefinition('0x1111:0x0001');
    await expect(listDefinitions()).resolves.toHaveLength(0);
    await expect(loadRecentDefinition()).resolves.toBeNull();
  });

  it('findByVidPid：对同一组 VID/PID 的多种字符串写法都要能取回', async () => {
    await saveDefinition(makeRaw('decimal', '4660', '1'));
    await saveDefinition(makeRaw('lower-hex', '0x1234', '0x2222'));
    await saveDefinition(makeRaw('padded', '0x1235', '0x0003'));

    expect((await findByVidPid(0x1234, 0x01))?.meta.name).toBe('decimal');
    expect((await findByVidPid(0x1234, 0x2222))?.meta.name).toBe('lower-hex');
    expect((await findByVidPid(0x1235, 0x0003))?.meta.name).toBe('padded');
  });

  it('找不到时返回 null（不得抛异常，UI 要据此走导入引导）', async () => {
    await expect(findByVidPid(0x9999, 0x9999)).resolves.toBeNull();
    await expect(loadRecentDefinition()).resolves.toBeNull();
  });
});
