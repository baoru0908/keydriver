// 层操作键码（S1 必做）：MO/TO/TG/DF/OSL/TT/LT 参数化定义（架构 §8.10）。
import { QK_PAGE } from '@/core/protocol/constants';
import type { KeycodeDef } from './types';

/** 参与层操作的键码页及其显示前缀。 */
const LAYER_PAGES: readonly { readonly page: number; readonly prefix: string; readonly name: string }[] = [
  { page: QK_PAGE.TO, prefix: 'TO', name: 'TO' },
  { page: QK_PAGE.MOMENTARY, prefix: 'MO', name: 'MO' },
  { page: QK_PAGE.DEF_LAYER, prefix: 'DF', name: 'DF' },
  { page: QK_PAGE.TOGGLE_LAYER, prefix: 'TG', name: 'TG' },
  { page: QK_PAGE.ONE_SHOT_LAYER, prefix: 'OSL', name: 'OSL' },
  { page: QK_PAGE.LAYER_TAP_TOGGLE, prefix: 'TT', name: 'TT' },
];

/** LT(layer, kc)：layer 占 4 位，kc 占低 8 位。 */
export function LT(layer: number, kc: number): number {
  return (QK_PAGE.LAYER_TAP | ((layer & 0x0f) << 8) | (kc & 0xff)) & 0xffff;
}

export function MO(layer: number): number {
  return (QK_PAGE.MOMENTARY | (layer & 0xff)) & 0xffff;
}
export function TO(layer: number): number {
  return (QK_PAGE.TO | (layer & 0xff)) & 0xffff;
}
export function TG(layer: number): number {
  return (QK_PAGE.TOGGLE_LAYER | (layer & 0xff)) & 0xffff;
}
export function DF(layer: number): number {
  return (QK_PAGE.DEF_LAYER | (layer & 0xff)) & 0xffff;
}
export function OSL(layer: number): number {
  return (QK_PAGE.ONE_SHOT_LAYER | (layer & 0xff)) & 0xffff;
}
export function TT(layer: number): number {
  return (QK_PAGE.LAYER_TAP_TOGGLE | (layer & 0xff)) & 0xffff;
}

/** 默认展示的层数上限（键码面板生成 MO(0)…MO(15) 等）。 */
export const DEFAULT_MAX_LAYERS = 16;

/** 生成层操作键码表：每类展开 DEFAULT_MAX_LAYERS 个；LT 为参数化（需内层键码）。 */
export function buildLayerKeycodes(maxLayers: number = DEFAULT_MAX_LAYERS): KeycodeDef[] {
  const out: KeycodeDef[] = [];
  for (const p of LAYER_PAGES) {
    for (let layer = 0; layer < maxLayers; layer += 1) {
      out.push({
        code: (p.page | (layer & 0xff)) & 0xffff,
        name: `${p.name}(${layer})`,
        label: `${p.prefix}(${layer})`,
        short: `${p.prefix}${layer}`,
        group: 'layers',
        aliases: [`${p.name}_${layer}`],
      });
    }
  }
  // LT 需要额外参数（内层键码），用 param 描述
  out.push({
    code: LT(0, 0),
    name: 'LT',
    label: 'LT(n,kc)',
    short: 'LT',
    group: 'layers',
    aliases: ['LT'],
    param: {
      kind: 'layer',
      min: 0,
      max: maxLayers - 1,
      build: (param, arg) => LT(param, arg ?? 0),
    },
  });
  return out;
}

export const LAYER_KEYCODES: readonly KeycodeDef[] = buildLayerKeycodes();
