// Mod-Tap 键码（S1 必做）：LCTL_T(kc) 等 8 个参数化定义（架构 §8.10）。
import { QK_PAGE } from '@/core/protocol/constants';
import type { KeycodeDef } from './types';

/** QMK MOD_* 常量（与 `MT(mod, kc) = QK_MOD_TAP | (mod << 8) | kc` 一致）。 */
export const MOD_BITS = {
  LCTL: 0x01,
  LSFT: 0x02,
  LALT: 0x04,
  LGUI: 0x08,
  RCTL: 0x11,
  RSFT: 0x12,
  RALT: 0x14,
  RGUI: 0x18,
} as const;

export type ModName = keyof typeof MOD_BITS;

export const MOD_TAP_DEFS: readonly { readonly name: ModName; readonly bit: number; readonly label: string }[] = [
  { name: 'LCTL', bit: MOD_BITS.LCTL, label: 'L Ctrl' },
  { name: 'LSFT', bit: MOD_BITS.LSFT, label: 'L Shift' },
  { name: 'LALT', bit: MOD_BITS.LALT, label: 'L Alt' },
  { name: 'LGUI', bit: MOD_BITS.LGUI, label: 'L Win' },
  { name: 'RCTL', bit: MOD_BITS.RCTL, label: 'R Ctrl' },
  { name: 'RSFT', bit: MOD_BITS.RSFT, label: 'R Shift' },
  { name: 'RALT', bit: MOD_BITS.RALT, label: 'R Alt' },
  { name: 'RGUI', bit: MOD_BITS.RGUI, label: 'R Win' },
];

export function MT(modBit: number, kc: number): number {
  return (QK_PAGE.MOD_TAP | ((modBit & 0x1f) << 8) | (kc & 0xff)) & 0xffff;
}

export function LCTL_T(kc: number): number {
  return MT(MOD_BITS.LCTL, kc);
}
export function LSFT_T(kc: number): number {
  return MT(MOD_BITS.LSFT, kc);
}
export function LALT_T(kc: number): number {
  return MT(MOD_BITS.LALT, kc);
}
export function LGUI_T(kc: number): number {
  return MT(MOD_BITS.LGUI, kc);
}
export function RCTL_T(kc: number): number {
  return MT(MOD_BITS.RCTL, kc);
}
export function RSFT_T(kc: number): number {
  return MT(MOD_BITS.RSFT, kc);
}
export function RALT_T(kc: number): number {
  return MT(MOD_BITS.RALT, kc);
}
export function RGUI_T(kc: number): number {
  return MT(MOD_BITS.RGUI, kc);
}

/** 生成 8 个 Mod-Tap 参数化定义（内层键码作为参数）。 */
export function buildModTapKeycodes(): KeycodeDef[] {
  return MOD_TAP_DEFS.map((m) => ({
    code: MT(m.bit, 0),
    name: `${m.name}_T`,
    label: `${m.name}_T(kc)`,
    short: `${m.name}_T`,
    group: 'modtap' as const,
    aliases: [`${m.name}_T`],
    param: {
      kind: 'modtap' as const,
      min: 0,
      max: 0xff,
      build: (_param, arg) => MT(m.bit, arg ?? 0),
    },
  }));
}

export const MOD_TAP_KEYCODES: readonly KeycodeDef[] = buildModTapKeycodes();
