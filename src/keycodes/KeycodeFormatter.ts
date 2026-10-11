// keycode → 显示名（含参数化键码格式化、Custom 短名、特殊图标，架构 §8.10）。
import { QK_PAGE } from '@/core/protocol/constants';
import { toHex16Short } from '@/shared/hex';
import { KeycodeTable, CUSTOM_KEYCODE_BASE } from './KeycodeTable';
import { MOD_TAP_DEFS } from './modTap';

/** 修饰键页（LCTL/LSFT/LALT/LGUI 的 `MOD(kc)` 组合）。 */
const MOD_PAGES: readonly { readonly page: number; readonly prefix: string }[] = [
  { page: QK_PAGE.LCTL, prefix: 'LCTL' },
  { page: QK_PAGE.LSFT, prefix: 'LSFT' },
  { page: QK_PAGE.LALT, prefix: 'LALT' },
  { page: QK_PAGE.LGUI, prefix: 'LGUI' },
];

const MOD_BIT_TO_NAME = new Map<number, string>(
  MOD_TAP_DEFS.map((m) => [m.bit, m.name] as const),
);

/** 参数化键码解析结果：外层前缀 + 参数 + 内层键码。 */
export interface ParsedKeycode {
  readonly kind: 'exact' | 'mod' | 'modtap' | 'layertap' | 'layer' | 'custom' | 'raw';
  readonly prefix: string;
  readonly param?: number;
  readonly inner?: number;
  readonly def?: import('./types').KeycodeDef;
}

function innerName(inner: number): string {
  const def = KeycodeTable.byCodeMap().get(inner & 0xff);
  if (def) return def.short ?? def.label ?? def.name.replace(/^KC_/, '');
  return toHex16Short(inner);
}

/** 解析任意 16 位键码的结构（先精确表，再按页解析）。 */
export function parseKeycode(keycode: number): ParsedKeycode {
  const kc = keycode & 0xffff;
  const exact = KeycodeTable.byCodeMap().get(kc);
  // 退化的 Mod-Tap 基码（MT(mod, KC_NO)）不参与精确匹配。
  // 它恰好等于 MIDI / 音序器 / 可编程按键 / RGB 等 Quantum 页的基址（0x7100/0x7200/0x7400/0x7800），
  // 命中会把固件下发的灯效键、多媒体键显示成 "RGUI_T(kc)" 这类错误名字。
  // 排除后交给下面的按页解析处理，内层为 0 时回落为原始 hex。
  const isDegenerateModTap = exact?.group === 'modtap' && (kc & 0xff) === 0x00;
  // Custom 键码优先显示键帽短名（可含换行），与键帽渲染保持一致
  if (exact && !isDegenerateModTap) {
    return {
      kind: 'exact',
      prefix: exact.group === 'custom' ? (exact.short ?? exact.label ?? exact.name) : (exact.label ?? exact.name),
      def: exact,
    };
  }

  // 修饰键组合 LCTL(kc) 等
  for (const m of MOD_PAGES) {
    if ((kc & 0xff00) === m.page) {
      return { kind: 'mod', prefix: m.prefix, inner: kc & 0xff };
    }
  }

  // Mod-Tap：QK_MOD_TAP(0x6000) | ((MOD_*) << 8) | kc，mod 占 5 位。
  //
  // ⚠️ 判定必须排除退化的内层键码：MT(mod, KC_NO=0x00) 与 MT(mod, KC_TRNS=0x01)
  // 不是有意义的按键（固件不会下发），却恰好落在 Quantum 页基址及其 +1 偏移上。
  // 若不排除，0x7100/0x7101 这类 MIDI 页键码会被误判为 Mod-Tap 并显示成 *_T(kc)。
  // 排除后：0x7100/0x7101 回落为原始值，而 0x7104（RCTL_T(A)）仍正确识别为 Mod-Tap。
  if (kc >= QK_PAGE.MOD_TAP && kc <= 0x7fff) {
    const inner = kc & 0xff;
    if (inner !== 0x00 && inner !== 0x01) {
      const modName = MOD_BIT_TO_NAME.get((kc >> 8) & 0x1f);
      if (modName) return { kind: 'modtap', prefix: `${modName}_T`, inner };
    }
  }

  // Layer-Tap：QK_LAYER_TAP(0x4000) | (layer << 8) | kc
  if ((kc & 0xf000) === QK_PAGE.LAYER_TAP) {
    return { kind: 'layertap', prefix: 'LT', param: (kc >> 8) & 0x0f, inner: kc & 0xff };
  }

  // 层操作页
  const layerPages: readonly { readonly page: number; readonly prefix: string }[] = [
    { page: QK_PAGE.TO, prefix: 'TO' },
    { page: QK_PAGE.MOMENTARY, prefix: 'MO' },
    { page: QK_PAGE.DEF_LAYER, prefix: 'DF' },
    { page: QK_PAGE.TOGGLE_LAYER, prefix: 'TG' },
    { page: QK_PAGE.ONE_SHOT_LAYER, prefix: 'OSL' },
    { page: QK_PAGE.LAYER_TAP_TOGGLE, prefix: 'TT' },
    { page: QK_PAGE.ONE_SHOT_MOD, prefix: 'OSM' },
    { page: QK_PAGE.TAP_DANCE, prefix: 'TD' },
    { page: QK_PAGE.MACRO, prefix: 'M' },
  ];
  for (const p of layerPages) {
    if ((kc & 0xff00) === p.page) {
      return { kind: 'layer', prefix: p.prefix, param: kc & 0xff };
    }
  }

  // Custom：基址 + index（架构 A5）
  if ((kc & 0xff00) === CUSTOM_KEYCODE_BASE) {
    const index = kc & 0xff;
    const def = KeycodeTable.custom()[index];
    if (def) return { kind: 'custom', prefix: def.short ?? def.label ?? def.name, def };
  }

  return { kind: 'raw', prefix: `0x${toHex16Short(kc)}` };
}

/** 完整显示名（键码面板与键帽悬浮提示使用）。 */
export function format(keycode: number): string {
  const p = parseKeycode(keycode);
  switch (p.kind) {
    case 'exact':
      return p.prefix;
    case 'mod':
      return `${p.prefix}(${innerName(p.inner ?? 0)})`;
    case 'modtap':
      return `${p.prefix}(${innerName(p.inner ?? 0)})`;
    case 'layertap':
      return `LT${p.param ?? 0}(${innerName(p.inner ?? 0)})`;
    case 'layer':
      return `${p.prefix}(${p.param ?? 0})`;
    case 'custom':
      return p.prefix;
    default:
      return p.prefix;
  }
}

/** 键帽短名：优先 shortName（可含 \n），其次截断。 */
export function formatShort(keycode: number, maxLength = 8): string {
  const text = format(keycode);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

/** 键帽显示用：把短名按换行切成两行文本。 */
export function formatKeycap(keycode: number): string[] {
  const p = parseKeycode(keycode);
  // 自定义键码的 shortName 可含换行，渲染为两行
  if (p.def?.group === 'custom' && p.def.short) return p.def.short.split('\n');
  if (p.kind === 'exact') {
    if (keycode === 0x0000) return ['✕'];
    if (keycode === 0x0001) return ['▽'];
    return [p.def?.short ?? p.def?.label ?? p.prefix];
  }
  return [formatShort(keycode)];
}

/** 是否为「特殊」键码（透明 / 禁用），UI 用不同底色标识。 */
export function isSpecial(keycode: number): boolean {
  return keycode === 0x0000 || keycode === 0x0001;
}
