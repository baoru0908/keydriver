// 多媒体 / 系统 / 应用启动 键码（QMK 基础键码区 0x00A5–0x00C2）。
//
// ⚠️ 数值来源：QMK 官方「Raw QMK keycodes」对照表（十进制 → 此处转十六进制），
// 不是估算。这一组此前完全缺失，导致键码面板里选不到任何多媒体键（VIA 有「Media」分类）。
import type { KeycodeDef } from './types';

/** 单个条目：QMK 常量名 / 显示名 / 键帽短名 / 键码。 */
interface MediaEntry {
  readonly name: string;
  readonly label: string;
  readonly short: string;
  readonly code: number;
}

const ENTRIES: readonly MediaEntry[] = [
  // 系统电源键（KC_PWR / KC_SLEP / KC_WAKE）**不在此处定义**：
  // basic.ts 里已有同名条目（值不同），若重复定义会导致按名反查取到错误键码
  // （QA 往返用例已抓到过一次 KC_WAKE 冲突）。需要调整时请直接改 basic.ts 的那几条。
  // 音频
  { name: 'KC_MUTE', label: '静音', short: 'MUTE', code: 0x00a8 },
  { name: 'KC_VOLU', label: '音量 +', short: 'VOL+', code: 0x00a9 },
  { name: 'KC_VOLD', label: '音量 −', short: 'VOL−', code: 0x00aa },
  // 播放控制
  { name: 'KC_MNXT', label: '下一曲', short: '▶▶', code: 0x00ab },
  { name: 'KC_MPRV', label: '上一曲', short: '◀◀', code: 0x00ac },
  { name: 'KC_MSTP', label: '停止', short: '■', code: 0x00ad },
  { name: 'KC_MPLY', label: '播放 / 暂停', short: '▶‖', code: 0x00ae },
  { name: 'KC_MSEL', label: '媒体播放器', short: 'MSEL', code: 0x00af },
  { name: 'KC_EJCT', label: '弹出', short: 'EJCT', code: 0x00b0 },
  { name: 'KC_MFFD', label: '快进', short: '▶▶|', code: 0x00bb },
  { name: 'KC_MRWD', label: '快退', short: '|◀◀', code: 0x00bc },
  // 应用与浏览器
  { name: 'KC_MAIL', label: '邮件', short: 'MAIL', code: 0x00b1 },
  { name: 'KC_CALC', label: '计算器', short: 'CALC', code: 0x00b2 },
  { name: 'KC_MYCM', label: '我的电脑', short: 'MYCM', code: 0x00b3 },
  { name: 'KC_WSCH', label: '搜索', short: 'SRCH', code: 0x00b4 },
  { name: 'KC_WHOM', label: '浏览器主页', short: 'HOME', code: 0x00b5 },
  { name: 'KC_WBAK', label: '后退', short: '←WEB', code: 0x00b6 },
  { name: 'KC_WFWD', label: '前进', short: 'WEB→', code: 0x00b7 },
  { name: 'KC_WSTP', label: '停止加载', short: 'WSTP', code: 0x00b8 },
  { name: 'KC_WREF', label: '刷新', short: 'WREF', code: 0x00b9 },
  { name: 'KC_WFAV', label: '收藏夹', short: 'FAV', code: 0x00ba },
  // 亮度与系统面板
  { name: 'KC_BRIU', label: '亮度 +', short: 'BRI+', code: 0x00bd },
  { name: 'KC_BRID', label: '亮度 −', short: 'BRI−', code: 0x00be },
  { name: 'KC_CPNL', label: '控制面板', short: 'CPNL', code: 0x00bf },
  { name: 'KC_ASST', label: '语音助手', short: 'ASST', code: 0x00c0 },
  { name: 'KC_MCTL', label: '调度中心', short: 'MCTL', code: 0x00c1 },
  { name: 'KC_LPAD', label: '启动台', short: 'LPAD', code: 0x00c2 },
];

/** 多媒体 / 系统 / 应用键码表（group = 'media'）。 */
export const MEDIA_KEYCODES: readonly KeycodeDef[] = ENTRIES.map((e) => ({
  code: e.code,
  name: e.name,
  label: e.label,
  short: e.short,
  group: 'media' as const,
  aliases: [e.name.replace(/^KC_/, '')],
}));
