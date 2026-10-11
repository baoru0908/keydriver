// 配置备份：导出 / 解析 / 逐项比对（架构 T04.4）。
//
// ⚠️ 主键必须是 controlId，不能用 valueKey：定义文件中存在 2 处重复 valueKey
// （实测 347/349 唯一），用 valueKey 做主键会在导入时丢失其中一份配置。
import type { ControlSpec, ParsedDefinition } from '@/definition/schema';

export const BACKUP_FORMAT = 'keydriver-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  readonly format: typeof BACKUP_FORMAT;
  readonly version: number;
  /** 来源定义文件名（仅作展示与提示，不参与匹配） */
  readonly definitionName: string;
  readonly exportedAt: string;
  readonly matrix: { readonly rows: number; readonly cols: number };
  readonly layerCount: number;
  readonly layoutOptions: number;
  /** 每层一个 rows×cols 键码数组，大端无符号 16 位 */
  readonly layers: readonly (readonly number[])[];
  /** key = controlId（唯一）；value = 控件值 */
  readonly values: Readonly<Record<string, number>>;
}

export interface BackupBuildInput {
  readonly definition: ParsedDefinition;
  readonly layers: readonly Uint16Array[];
  readonly layoutOptions: number;
  /** key = controlId */
  readonly values: Readonly<Record<string, number>>;
}

/** 由当前会话状态构建备份对象。 */
export function buildBackup(input: BackupBuildInput): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    definitionName: input.definition.name,
    exportedAt: new Date().toISOString(),
    matrix: { rows: input.definition.matrix.rows, cols: input.definition.matrix.cols },
    layerCount: input.layers.length,
    layoutOptions: input.layoutOptions >>> 0,
    layers: input.layers.map((layer) => Array.from(layer)),
    values: { ...input.values },
  };
}

/** 序列化为可下载的 JSON 文本（2 空格缩进，便于人工比对）。 */
export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

export type ParseBackupResult =
  | { readonly ok: true; readonly backup: BackupFile }
  | { readonly ok: false; readonly error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 解析备份文本；任何字段缺失/类型不符都给出人话错误，不抛异常。 */
export function parseBackup(text: string): ParseBackupResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: '不是合法 JSON 文件' };
  }
  if (!isRecord(raw)) return { ok: false, error: '备份文件顶层应为对象' };
  if (raw['format'] !== BACKUP_FORMAT) {
    return { ok: false, error: '不是 keydriver 备份文件（format 字段不符）' };
  }
  if (typeof raw['version'] !== 'number') return { ok: false, error: '缺少 version 字段' };
  if (raw['version'] > BACKUP_VERSION) {
    return { ok: false, error: `备份版本 v${String(raw['version'])} 高于当前程序支持的最高版本` };
  }
  if (!Array.isArray(raw['layers'])) return { ok: false, error: '缺少 layers 数组' };
  if (!isRecord(raw['values'])) return { ok: false, error: '缺少 values 对象' };
  if (!isRecord(raw['matrix'])) return { ok: false, error: '缺少 matrix 对象' };

  const matrix = raw['matrix'];
  const rows = typeof matrix['rows'] === 'number' ? matrix['rows'] : 0;
  const cols = typeof matrix['cols'] === 'number' ? matrix['cols'] : 0;

  const layers: number[][] = [];
  for (const layer of raw['layers'] as readonly unknown[]) {
    if (!Array.isArray(layer)) return { ok: false, error: 'layers 中某一层不是数组' };
    layers.push(layer.map((v) => Number(v) & 0xffff));
  }

  const values: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw['values'] as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) values[key] = value >>> 0;
  }

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: raw['version'],
      definitionName: typeof raw['definitionName'] === 'string' ? raw['definitionName'] : '',
      exportedAt: typeof raw['exportedAt'] === 'string' ? raw['exportedAt'] : '',
      matrix: { rows, cols },
      layerCount: typeof raw['layerCount'] === 'number' ? raw['layerCount'] : layers.length,
      layoutOptions: typeof raw['layoutOptions'] === 'number' ? raw['layoutOptions'] >>> 0 : 0,
      layers,
      values,
    },
  };
}

export interface BackupEntry {
  readonly control: ControlSpec;
  readonly value: number;
}

export interface ApplyResult {
  readonly entries: readonly BackupEntry[];
  /** 备份里存在、但当前定义文件中没有对应控件的 controlId 数量 */
  readonly missing: number;
}

/** 把备份中的值映射回当前定义文件的控件（按 controlId 匹配）。 */
export function applyBackup(definition: ParsedDefinition, backup: BackupFile): ApplyResult {
  const entries: BackupEntry[] = [];
  let missing = 0;
  for (const [controlId, value] of Object.entries(backup.values)) {
    const control = definition.controlById.get(controlId);
    if (!control) {
      missing += 1;
      continue;
    }
    entries.push({ control, value });
  }
  return { entries, missing };
}

export interface BackupDiff {
  readonly controlId: string;
  readonly label: string;
  readonly expected: number;
  readonly actual: number;
}

/**
 * 逐项比对：备份值 vs 实际读回值（验收「导出 → 复位 → 导入 → 逐项一致」）。
 * 返回不一致项列表；为空即完全一致。
 */
export function diffBackup(
  definition: ParsedDefinition,
  backup: BackupFile,
  actual: Readonly<Record<string, number>>,
): BackupDiff[] {
  const out: BackupDiff[] = [];
  for (const [controlId, expected] of Object.entries(backup.values)) {
    const control = definition.controlById.get(controlId);
    if (!control) continue;
    const got = actual[controlId];
    if (got === undefined || (got >>> 0) !== (expected >>> 0)) {
      out.push({
        controlId,
        label: control.label || control.valueKey,
        expected: expected >>> 0,
        actual: got === undefined ? -1 : got >>> 0,
      });
    }
  }
  return out;
}

/** 备份摘要（导入前给用户确认用）。 */
export function describeBackup(backup: BackupFile): string {
  return [
    `定义文件：${backup.definitionName || '（未记录）'}`,
    `导出时间：${backup.exportedAt || '（未记录）'}`,
    `矩阵：${backup.matrix.rows} × ${backup.matrix.cols}`,
    `层数：${backup.layerCount}`,
    `布局选项：0x${(backup.layoutOptions >>> 0).toString(16).toUpperCase()}`,
    `控件值：${Object.keys(backup.values).length} 项`,
  ].join(' · ');
}
