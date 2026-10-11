// 键码表：分组汇总 + 值→定义 索引 + Custom 动态注入（架构 §4.2.6 / A5）。
import { QK_PAGE } from '@/core/protocol/constants';
import type { KeycodeDef, KeycodeGroupDef, KeycodeGroupId } from './types';
import { KEYCODE_GROUPS, groupOrder } from './groups';
import { BASIC_KEYCODES } from './basic';
import { LAYER_KEYCODES } from './layers';
import { MOD_TAP_KEYCODES } from './modTap';
import { MEDIA_KEYCODES } from './media';
import { QUANTUM_KEYCODES } from './quantum';

/** 与定义文件 customKeycodes 结构兼容的最小形态（键码层不 import 定义层，保持零依赖）。 */
export interface CustomKeycodeLike {
  readonly name: string;
  readonly title?: string;
  readonly shortName?: string;
}

/** Custom 键码基址（架构 A5 假设：QK_KB 0x7E00 + index），可在设置中覆盖。 */
export let CUSTOM_KEYCODE_BASE: number = QK_PAGE.KB;

export function setCustomKeycodeBase(base: number): void {
  CUSTOM_KEYCODE_BASE = base & 0xff00;
}

export class KeycodeTable {
  private static customItems: KeycodeDef[] = [];

  /** 静态内置键码（Basic + Layers + Mod-Tap + Media + Quantum）。 */
  static builtins(): KeycodeDef[] {
    return [
      ...BASIC_KEYCODES,
      ...LAYER_KEYCODES,
      ...MOD_TAP_KEYCODES,
      ...MEDIA_KEYCODES,
      ...QUANTUM_KEYCODES,
    ];
  }

  /** 已注册的自定义键码。 */
  static custom(): readonly KeycodeDef[] {
    return KeycodeTable.customItems;
  }

  /**
   * 动态注入定义文件的 customKeycodes（架构 A5：键码 = 基址 + 出现顺序）。
   * 键码层不解释语义，只按 index 分配，避免硬编码任何具体键盘的键名。
   */
  static registerCustom(items: readonly CustomKeycodeLike[], base?: number): void {
    if (base !== undefined) setCustomKeycodeBase(base);
    KeycodeTable.customItems = items.map((kc, i) => ({
      code: (CUSTOM_KEYCODE_BASE + i) & 0xffff,
      name: `CUSTOM_${i}`,
      label: kc.title ?? kc.name,
      short: kc.shortName ?? kc.name,
      group: 'custom' as const,
      aliases: [kc.name],
    }));
  }

  static resetCustom(): void {
    KeycodeTable.customItems = [];
  }

  /** 全部键码（内置 + 自定义）。 */
  static all(): KeycodeDef[] {
    return [...KeycodeTable.builtins(), ...KeycodeTable.customItems];
  }

  /** 按分组汇总，分组按 order 排序；空分组不返回。 */
  static groups(): KeycodeGroupDef[] {
    const items = KeycodeTable.all();
    const out: KeycodeGroupDef[] = [];
    for (const g of KEYCODE_GROUPS) {
      const groupItems = items.filter((it) => it.group === g.id);
      if (groupItems.length === 0) continue;
      out.push({ id: g.id, label: g.label, order: g.order, items: groupItems });
    }
    return out.sort((a, b) => a.order - b.order);
  }

  /** code → 定义 的索引（惰性重建，注册 Custom 后自动失效）。 */
  static byCodeMap(): Map<number, KeycodeDef> {
    const map = new Map<number, KeycodeDef>();
    for (const def of KeycodeTable.all()) {
      if (!map.has(def.code)) map.set(def.code, def);
    }
    return map;
  }

  /** 按常量名或别名查找（大小写不敏感）。 */
  static findByName(name: string): KeycodeDef | undefined {
    const target = name.trim().toUpperCase();
    return KeycodeTable.all().find(
      (def) =>
        def.name.toUpperCase() === target ||
        (def.aliases ?? []).some((a) => a.toUpperCase() === target),
    );
  }

  /** 模糊搜索：按常量名、别名与显示名匹配。 */
  static search(query: string, limit = 50): KeycodeDef[] {
    const q = query.trim().toUpperCase();
    if (q === '') return [];
    const scored: { def: KeycodeDef; score: number }[] = [];
    for (const def of KeycodeTable.all()) {
      const name = def.name.toUpperCase();
      const label = (def.label ?? '').toUpperCase();
      const aliases = (def.aliases ?? []).map((a) => a.toUpperCase());
      let score = -1;
      if (name === q || aliases.includes(q)) score = 0;
      else if (name.startsWith(q) || label.startsWith(q)) score = 1;
      else if (aliases.some((a) => a.startsWith(q))) score = 2;
      else if (name.includes(q) || label.includes(q)) score = 3;
      if (score >= 0) scored.push({ def, score });
    }
    scored.sort((a, b) => a.score - b.score || groupOrder(a.def.group) - groupOrder(b.def.group));
    return scored.slice(0, limit).map((s) => s.def);
  }

  /** 取某分组的键码列表。 */
  static itemsOf(group: KeycodeGroupId): readonly KeycodeDef[] {
    return KeycodeTable.all().filter((d) => d.group === group);
  }
}
