// 文件下载 / 选择：备份导出与导入的文件通道（浏览器环境专用，SSR 下安全降级）。
import type { BackupFile } from './backup';
import { parseBackup, serializeBackup, type ParseBackupResult } from './backup';

/** 触发浏览器下载（SSR 或不支持时静默失败，不影响主流程）。 */
export function downloadText(filename: string, text: string, mime = 'application/json'): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
  try {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

/** 下载备份文件。文件名带时间戳，避免覆盖历史备份。 */
export function downloadBackup(backup: BackupFile): boolean {
  const stamp = backup.exportedAt.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const safeName = (backup.definitionName || 'keyboard').replace(/[^\w一-龥-]+/g, '_');
  return downloadText(`${safeName}-${stamp}.keydriver.json`, serializeBackup(backup));
}

/** 弹出文件选择框读取文本；用户取消时返回 null。 */
export function pickTextFile(accept = '.json,application/json'): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      document.body.removeChild(input);
      resolve(value);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        finish(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => finish(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => finish(null);
      reader.readAsText(file);
    });
    // 部分浏览器无 cancel 事件，用 window focus 兜底
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

/** 选择并解析一个备份文件。 */
export async function pickBackupFile(): Promise<ParseBackupResult | null> {
  const text = await pickTextFile();
  if (text === null) return null;
  return parseBackup(text);
}

/** 读取任意 JSON 文件（定义文件导入用）。 */
export async function pickJsonObject(): Promise<{ name: string; json: unknown } | null> {
  if (typeof document === 'undefined') return null;
  const text = await pickTextFile();
  if (text === null) return null;
  try {
    return { name: 'pasted.json', json: JSON.parse(text) as unknown };
  } catch {
    return null;
  }
}
