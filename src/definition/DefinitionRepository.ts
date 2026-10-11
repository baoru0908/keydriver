// 定义库持久化：IndexedDB（idb-keyval）+ `{vid}:{pid}` 索引 + 最近使用列表（架构 Q9 / §3.6）。
import { get, set, del, keys, createStore } from 'idb-keyval';
import type { ViaDefinition } from './schema';
import { parseId } from './validate';

const STORE = createStore('keydriver', 'definitions');
const RECENT_KEY = 'index:recent';
const CURRENT_PREFIX = 'current:';

export interface DefinitionMeta {
  readonly id: string;
  readonly name: string;
  readonly vendorId: string;
  readonly productId: string;
  readonly savedAt: number;
}

export interface DefinitionRecord {
  readonly meta: DefinitionMeta;
  readonly raw: ViaDefinition;
}

function definitionId(raw: ViaDefinition): string {
  return `${raw.vendorId}:${raw.productId}`;
}

/** 保存一份定义文件并写入 VID/PID 索引。 */
export async function saveDefinition(raw: ViaDefinition): Promise<DefinitionMeta> {
  const id = definitionId(raw);
  const meta: DefinitionMeta = {
    id,
    name: raw.name,
    vendorId: raw.vendorId,
    productId: raw.productId,
    savedAt: Date.now(),
  };
  await set(id, { meta, raw }, STORE);
  const list = await listDefinitions();
  await set(RECENT_KEY, [meta.id, ...list.map((m) => m.id).filter((x) => x !== id)].slice(0, 10), STORE);
  return meta;
}

/** 列出全部已保存定义的元信息。 */
export async function listDefinitions(): Promise<DefinitionMeta[]> {
  const allKeys = await keys(STORE);
  const out: DefinitionMeta[] = [];
  for (const key of allKeys) {
    if (typeof key !== 'string' || key.startsWith('index:') || key.startsWith(CURRENT_PREFIX)) continue;
    const record = await get<DefinitionRecord>(key, STORE);
    if (record?.meta) out.push(record.meta);
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * 按 VID/PID 取回定义。
 *
 * ⚠️ 旧实现靠「猜测 ID 字符串形态」去撞库（小写 / 大写 / 补零组合），与同模块 parseId
 * 「大小写、0x、十进制都认」的口径不一致：定义文件用大写 hex（如 0X1A2B）或未补零时就会
 * 静默取不回，表现为「设备连上了但没有任何控件」。
 * 现在改为：全量扫描已存定义，用 parseId 归一化后**按数值比较**——任何书写形态都能命中。
 */
export async function findByVidPid(vid: number, pid: number): Promise<DefinitionRecord | null> {
  const targetVid = vid >>> 0;
  const targetPid = pid >>> 0;
  for (const meta of await listDefinitions()) {
    if (parseId(meta.vendorId) === targetVid && parseId(meta.productId) === targetPid) {
      const record = await get<DefinitionRecord>(meta.id, STORE);
      if (record?.raw) return record;
    }
  }
  return null;
}

/** 按 ID 取回一份已保存的定义（定义库「切换」用）。 */
export async function getDefinitionById(id: string): Promise<DefinitionRecord | null> {
  const record = await get<DefinitionRecord>(id, STORE);
  return record ?? null;
}

/** 记录「当前使用的定义」，启动时用于自动恢复。 */
export async function setCurrentDefinitionId(id: string): Promise<void> {
  await set(`${CURRENT_PREFIX}active`, id, STORE);
}

export async function getCurrentDefinitionId(): Promise<string | null> {
  const value = await get<string>(`${CURRENT_PREFIX}active`, STORE);
  return value ?? null;
}

/** 读取最近一次使用的定义。 */
export async function loadRecentDefinition(): Promise<DefinitionRecord | null> {
  const id = await getCurrentDefinitionId();
  if (!id) {
    const list = await listDefinitions();
    const first = list[0];
    if (!first) return null;
    return (await get<DefinitionRecord>(first.id, STORE)) ?? null;
  }
  const record = await get<DefinitionRecord>(id, STORE);
  return record ?? null;
}

export async function removeDefinition(id: string): Promise<void> {
  await del(id, STORE);
}
