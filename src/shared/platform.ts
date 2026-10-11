// 快捷键平台层（T06-9）：accelerator 按键组合与「人看」的显示标签**同源生成**，
// 保证注册用的按键组合与帮助面板展示的标签永远一致，不会各写各的。
//
// 显示约定：macOS 用 ⌘/⇧/⌥，其它平台用 Ctrl/Shift/Alt。

export type Platform = 'mac' | 'other';

export interface HotkeyMods {
  readonly meta?: boolean; // macOS ⌘ / 其它平台 Win 键
  readonly ctrl?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

/** 单个快捷键定义：组合（机器用）与 label（人看）由 makeHotkey 一次性生成。 */
export interface HotkeyDef {
  readonly id: string;
  /** 键盘事件 KeyboardEvent.key 的小写形态（如 's'、'z'、'1'） */
  readonly key: string;
  readonly mods: HotkeyMods;
  /** 平台相关显示标签：mac '⌘S'，其它 'Ctrl+S'（由同一数据生成，见 displayLabel） */
  readonly label: string;
}

/** 探测当前平台；无 navigator（SSR / 测试）按 'other' 处理。 */
export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  return /mac|iphone|ipad|ipod/i.test(ua) ? 'mac' : 'other';
}

/** 修饰键 → 显示前缀（mac 用符号且 ⌘ 领先；其它平台用文字）。只收录显式为 true 的标志。 */
function modPrefixes(mods: HotkeyMods, platform: Platform): readonly string[] {
  if (platform === 'mac') {
    const parts: string[] = [];
    if (mods.meta) parts.push('⌘');
    if (mods.shift) parts.push('⇧');
    if (mods.alt) parts.push('⌥');
    if (mods.ctrl) parts.push('⌃');
    return parts;
  }
  const parts: string[] = [];
  if (mods.meta) parts.push('Win');
  if (mods.ctrl) parts.push('Ctrl');
  if (mods.alt) parts.push('Alt');
  if (mods.shift) parts.push('Shift');
  return parts;
}

/** 由组合生成显示标签（同源：注册与展示共用这一个函数）。mac 符号连写，其它平台用 + 连接。 */
export function displayLabel(key: string, mods: HotkeyMods, platform: Platform): string {
  const shown = key.length === 1 ? key.toUpperCase() : key;
  const prefixes = modPrefixes(mods, platform);
  if (platform === 'mac') return [...prefixes, shown].join('');
  return [...prefixes, shown].join('+');
}

/**
 * 定义一个快捷键：组合与标签同源生成。
 * 默认主修饰键：mac 走 ⌘（meta），其它平台走 Ctrl——调用方只声明「意图」；
 * 需要无修饰键的裸键（如数字键切面板）时显式传 { meta: false, ctrl: false }。
 * @param id 稳定 id（测试 / 帮助面板引用）
 * @param key KeyboardEvent.key 的小写形态
 * @param mods 修饰键覆盖（显式 false 表示不需要该修饰键）
 * @param platform 显式传平台用于单测；缺省探测当前平台
 */
export function makeHotkey(
  id: string,
  key: string,
  mods: HotkeyMods = {},
  platform: Platform = detectPlatform(),
): HotkeyDef {
  const resolved: HotkeyMods =
    platform === 'mac'
      ? { ...mods, meta: mods.meta ?? true, ctrl: mods.ctrl ?? false }
      : { ...mods, ctrl: mods.ctrl ?? true, meta: mods.meta ?? false };
  return { id, key: key.toLowerCase(), mods: resolved, label: displayLabel(key, resolved, platform) };
}

/** 键盘事件是否命中某个快捷键定义（注册与展示同源的另一半）。 */
export function matchesHotkey(
  event: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  def: HotkeyDef,
): boolean {
  return (
    event.key.toLowerCase() === def.key &&
    event.metaKey === (def.mods.meta ?? false) &&
    event.ctrlKey === (def.mods.ctrl ?? false) &&
    event.shiftKey === (def.mods.shift ?? false) &&
    event.altKey === (def.mods.alt ?? false)
  );
}
