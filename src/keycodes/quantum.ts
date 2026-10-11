// 特殊键：鼠标键等（QMK 基础键码区 0x00CD–0x00DF）。
//
// ⚠️ 数值来源：QMK 官方「Raw QMK keycodes」对照表（十进制 → 此处转十六进制），不是估算。
// VIA 的「Special」分类里就有鼠标键，此前我们完全没有，键码面板选不到。
import type { KeycodeDef } from './types';

interface QuantumEntry {
  readonly name: string;
  readonly label: string;
  readonly short: string;
  readonly code: number;
}

const ENTRIES: readonly QuantumEntry[] = [
  // 鼠标移动
  { name: 'KC_MS_UP', label: '鼠标上移', short: 'M↑', code: 0x00cd },
  { name: 'KC_MS_DOWN', label: '鼠标下移', short: 'M↓', code: 0x00ce },
  { name: 'KC_MS_LEFT', label: '鼠标左移', short: 'M←', code: 0x00cf },
  { name: 'KC_MS_RIGHT', label: '鼠标右移', short: 'M→', code: 0x00d0 },
  // 鼠标按键
  { name: 'KC_BTN1', label: '鼠标左键', short: 'MB1', code: 0x00d1 },
  { name: 'KC_BTN2', label: '鼠标右键', short: 'MB2', code: 0x00d2 },
  { name: 'KC_BTN3', label: '鼠标中键', short: 'MB3', code: 0x00d3 },
  { name: 'KC_BTN4', label: '鼠标键 4', short: 'MB4', code: 0x00d4 },
  { name: 'KC_BTN5', label: '鼠标键 5', short: 'MB5', code: 0x00d5 },
  // 滚轮
  { name: 'KC_WH_U', label: '滚轮上', short: 'W↑', code: 0x00d9 },
  { name: 'KC_WH_D', label: '滚轮下', short: 'W↓', code: 0x00da },
  { name: 'KC_WH_L', label: '滚轮左', short: 'W←', code: 0x00db },
  { name: 'KC_WH_R', label: '滚轮右', short: 'W→', code: 0x00dc },
  // 加速度
  { name: 'KC_ACL0', label: '鼠标加速 0', short: 'ACL0', code: 0x00dd },
  { name: 'KC_ACL1', label: '鼠标加速 1', short: 'ACL1', code: 0x00de },
  { name: 'KC_ACL2', label: '鼠标加速 2', short: 'ACL2', code: 0x00df },
];

/** 特殊键码表（group = 'quantum'，界面显示为「特殊」）。 */
export const QUANTUM_KEYCODES: readonly KeycodeDef[] = ENTRIES.map((e) => ({
  code: e.code,
  name: e.name,
  label: e.label,
  short: e.short,
  group: 'quantum' as const,
  aliases: [e.name.replace(/^KC_/, '')],
}));
