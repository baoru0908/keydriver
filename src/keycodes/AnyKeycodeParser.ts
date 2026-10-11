// "Any" 键码输入解析：QMK 常量名 / hex / 十进制 / 函数式（架构 §8.10）。
import { KeycodeTable } from './KeycodeTable';
import { format } from './KeycodeFormatter';
import { QK_PAGE } from '@/core/protocol/constants';
import { MT, MOD_BITS } from './modTap';
import { LT } from './layers';

export interface ParseResult {
  readonly ok: boolean;
  readonly keycode?: number;
  readonly message: string;
}

/** MOD(kc) 组合页：左修饰 0x0100/0x0200/0x0400/0x0800，右修饰在其基础上 +0x1000。 */
const MOD_FN = new Map<string, number>([
  ['LCTL', QK_PAGE.LCTL],
  ['LSFT', QK_PAGE.LSFT],
  ['LALT', QK_PAGE.LALT],
  ['LGUI', QK_PAGE.LGUI],
  ['RCTL', QK_PAGE.LCTL | 0x1000],
  ['RSFT', QK_PAGE.LSFT | 0x1000],
  ['RALT', QK_PAGE.LALT | 0x1000],
  ['RGUI', QK_PAGE.LGUI | 0x1000],
]);

const MOD_TAP_FN = new Map<string, number>([
  ['LCTL_T', MOD_BITS.LCTL],
  ['LSFT_T', MOD_BITS.LSFT],
  ['LALT_T', MOD_BITS.LALT],
  ['LGUI_T', MOD_BITS.LGUI],
  ['RCTL_T', MOD_BITS.RCTL],
  ['RSFT_T', MOD_BITS.RSFT],
  ['RALT_T', MOD_BITS.RALT],
  ['RGUI_T', MOD_BITS.RGUI],
]);

const LAYER_FN = new Map<string, number>([
  ['MO', QK_PAGE.MOMENTARY],
  ['TO', QK_PAGE.TO],
  ['TG', QK_PAGE.TOGGLE_LAYER],
  ['DF', QK_PAGE.DEF_LAYER],
  ['OSL', QK_PAGE.ONE_SHOT_LAYER],
  ['TT', QK_PAGE.LAYER_TAP_TOGGLE],
  ['OSM', QK_PAGE.ONE_SHOT_MOD],
  ['TD', QK_PAGE.TAP_DANCE],
]);

/**
 * 解析单个原子（非函数式）：hex / 十进制 / 常量名 / 显示名。
 *
 * ⚠️ 顺序至关重要：函数参数（层号、参数位）复用同一个 parseAtom，
 * 因此**数值串必须按十进制优先返回**——否则 LT(1,KC_A) 的层号 '1' 会被解析成数字键 KC_1。
 * 显示名反查只对非数值 token 生效（'A' / 'Enter' / 'Bksp' 这类）。
 */
function parseAtom(text: string): number | null {
  const t = text.trim();
  if (/^0[xX][0-9a-fA-F]{1,4}$/.test(t)) return Number.parseInt(t.slice(2), 16);
  if (/^\d{1,5}$/.test(t)) {
    const n = Number.parseInt(t, 10);
    return n <= 0xffff ? n : null;
  }
  const def = KeycodeTable.findByName(t);
  if (def) return def.code;
  return findByDisplay(t);
}

/**
 * 按显示名反查键码（QA Bug D：显示名 ↔ Any 输入名 往返）。
 * 显示名有两套取法，必须都认：
 *   · 作为独立键时 format() 取 label（如 KC_NO → '禁用'、KC_BSPC → 'Backspace'）
 *   · 作为 MT()/LT() 内层键时取 short（如 KC_BSPC → 'Bksp'）
 * 因此 short / label / 去 KC_ 前缀的常量名 三者任一命中即可。
 */
function findByDisplay(text: string): number | null {
  const target = text.trim().toUpperCase();
  if (target === '') return null;
  const def = KeycodeTable.all().find((d) => {
    const candidates = [d.short, d.label, d.name.replace(/^KC_/, '')];
    return candidates.some((c) => typeof c === 'string' && c !== '' && c.toUpperCase() === target);
  });
  return def ? def.code & 0xffff : null;
}

/** 末级兜底：按 format() 的完整显示名反查（参数化条目会显示成 'LT(n,kc)' 这类提示串）。 */
function findByFormattedName(text: string): number | null {
  const target = text.trim();
  if (target === '') return null;
  for (const def of KeycodeTable.all()) {
    if (format(def.code) === target) return def.code & 0xffff;
  }
  return null;
}

/**
 * 解析任意形态输入，返回键码或失败原因。
 * 支持：`KC_LCTL` / `LCTL` / `0x0141` / `321` / `LCTL(KC_A)` / `LT(1,KC_A)` / `TD(0)`。
 */
export function parseAnyKeycode(input: string): ParseResult {
  const text = input.trim();
  if (text === '') return { ok: false, message: '请输入键码' };

  // 紧凑形态 LTn(kc)：界面上显示的就是这个样子（如 LT1(A)），
  // 必须能原样解析回去，否则「复制显示名 → 粘贴」无效。层号 0–15。
  const ltCompact = /^LT(\d{1,2})\s*\((.+)\)$/.exec(text);
  if (ltCompact) {
    const layer = Number.parseInt(ltCompact[1] ?? '', 10);
    const inner = parseAtom(ltCompact[2] ?? '');
    if (inner !== null && Number.isFinite(layer) && layer >= 0 && layer <= 15) {
      const keycode = LT(layer, inner) & 0xffff;
      return { ok: true, keycode, message: `LT${layer}(${inner})` };
    }
  }

  // 函数式：NAME(arg) 或 NAME(a,b)
  const fnMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*\((.+)\)$/.exec(text);
  if (fnMatch) {
    const fnName = (fnMatch[1] ?? '').toUpperCase();
    const argsRaw = fnMatch[2] ?? '';
    const args = argsRaw
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a !== '');

    if (fnName === 'LT' && args.length === 2) {
      const layer = parseAtom(args[0] ?? '');
      const inner = parseAtom(args[1] ?? '');
      if (layer !== null && inner !== null) {
        return { ok: true, keycode: LT(layer, inner), message: `LT${layer}(${inner})` };
      }
      // 参数解析失败不立即报错：可能是参数化条目的提示串（如 'LT(n,kc)'），
      // 交由底部的显示名兜底还原
    }

    const modTapBit = MOD_TAP_FN.get(fnName);
    if (modTapBit !== undefined && args.length === 1) {
      const inner = parseAtom(args[0] ?? '');
      if (inner === null) return { ok: false, message: `${fnName} 参数无法解析：${argsRaw}` };
      return { ok: true, keycode: MT(modTapBit, inner), message: `${fnName}(${inner})` };
    }

    const modPage = MOD_FN.get(fnName);
    if (modPage !== undefined && args.length === 1) {
      const inner = parseAtom(args[0] ?? '');
      if (inner === null) return { ok: false, message: `${fnName} 参数无法解析：${argsRaw}` };
      return { ok: true, keycode: (modPage | (inner & 0xff)) & 0xffff, message: `${fnName}(${inner})` };
    }

    const layerPage = LAYER_FN.get(fnName);
    if (layerPage !== undefined && args.length === 1) {
      const param = parseAtom(args[0] ?? '');
      if (param === null) return { ok: false, message: `${fnName} 参数无法解析：${argsRaw}` };
      return {
        ok: true,
        keycode: (layerPage | (param & 0xff)) & 0xffff,
        message: `${fnName}(${param})`,
      };
    }
    // 无法按函数式解析：不立即报错，交给下面的原子解析与显示名兜底
  }

  // 顶层输入：数字串优先按「数字键」解释（界面上 KC_0..KC_9 就显示成 '0'..'9'），
  // 这样复制界面键名再粘贴才有效（Bug D）。
  // 单个数字命中数字键；多位数字（如 '321'）不会命中任何显示名，自然落回十进制。
  // 要表示「禁用键」请用 KC_NO / 0x0000 / '禁用'——原版 VIA 也没有裸十进制约定。
  let value: number | null = null;
  if (/^\d{1,5}$/.test(text)) {
    value = findByDisplay(text);
  }
  if (value === null) value = parseAtom(text);

  if (value === null) {
    // 末级兜底：按 format() 的完整显示名反查，覆盖参数化条目的提示串（如 'LT(n,kc)'）
    const byFormatted = findByFormattedName(text);
    if (byFormatted !== null) {
      return { ok: true, keycode: byFormatted, message: `显示名 ${text}` };
    }
    return { ok: false, message: '无法解析，支持 KC_XXX / 0xXXXX / 十进制 / LCTL(KC_A)' };
  }
  return { ok: true, keycode: value & 0xffff, message: `0x${(value & 0xffff).toString(16).toUpperCase().padStart(4, '0')}` };
}

/** 便捷入口：解析失败返回 null。 */
export function tryParse(input: string): number | null {
  const r = parseAnyKeycode(input);
  return r.ok ? (r.keycode ?? null) : null;
}
