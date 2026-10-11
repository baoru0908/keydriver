// 快捷键同源单测（T06-9）：显示标签与注册组合由同一份数据生成，永不漂移。
import { describe, expect, it } from 'vitest';
import { displayLabel, makeHotkey, matchesHotkey } from '@/shared/platform';
import { HOTKEY_ENTRIES } from '@/hooks/useHotkeys';

describe('displayLabel / makeHotkey（平台同源）', () => {
  it('mac 用 ⌘，其它平台用 Ctrl', () => {
    expect(makeHotkey('t1', 's', {}, 'mac').label).toBe('⌘S');
    expect(makeHotkey('t2', 's', {}, 'other').label).toBe('Ctrl+S');
  });

  it('shift / alt 修饰按平台呈现', () => {
    expect(makeHotkey('t3', 'z', { shift: true }, 'mac').label).toBe('⌘⇧Z');
    expect(makeHotkey('t4', 'z', { shift: true, alt: true }, 'other').label).toBe('Ctrl+Alt+Shift+Z');
  });

  it('显式无修饰键的裸键（数字切面板）不产生前缀', () => {
    expect(makeHotkey('t5', '1', { meta: false, ctrl: false }, 'mac').label).toBe('1');
    expect(makeHotkey('t6', '3', { meta: false, ctrl: false }, 'other').label).toBe('3');
  });

  it('displayLabel 与 makeHotkey 输出一致（同一函数同源）', () => {
    const def = makeHotkey('t7', 's', {}, 'mac');
    expect(def.label).toBe(displayLabel(def.key, def.mods, 'mac'));
  });
});

describe('matchesHotkey（注册与标签同源的另一半）', () => {
  it('mac 注册的 ⌘S 命中 metaKey 事件、不命中 ctrlKey 事件', () => {
    const def = makeHotkey('t8', 's', {}, 'mac');
    const base = { key: 's', metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
    expect(matchesHotkey({ ...base, metaKey: true }, def)).toBe(true);
    expect(matchesHotkey({ ...base, ctrlKey: true }, def)).toBe(false);
  });

  it('key 大小写不敏感；修饰不符不命中', () => {
    const def = makeHotkey('t9', 's', {}, 'other');
    const base = { key: 'S', metaKey: false, ctrlKey: true, shiftKey: false, altKey: false };
    expect(matchesHotkey(base, def)).toBe(true);
    expect(matchesHotkey({ ...base, shiftKey: true }, def)).toBe(false);
  });
});

describe('HOTKEY_ENTRIES（帮助面板 = 注册表，同源校验）', () => {
  it('每个条目的 label 均由其组合生成（防手写漂移）', () => {
    for (const entry of HOTKEY_ENTRIES) {
      const mac = makeHotkey(entry.def.id, entry.def.key, entry.def.mods, 'mac');
      expect(mac.label).toBe(displayLabel(entry.def.key, entry.def.mods, 'mac'));
      expect(entry.def.label.length).toBeGreaterThan(0);
    }
  });

  it('id 唯一（帮助面板 key 复用）', () => {
    const ids = HOTKEY_ENTRIES.map((e) => e.def.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('包含保存 / 撤销 / 帮助与 7 个面板切换', () => {
    const ids = new Set(HOTKEY_ENTRIES.map((e) => e.def.id));
    expect(ids.has('save-all')).toBe(true);
    expect(ids.has('undo')).toBe(true);
    expect(ids.has('help')).toBe(true);
    for (let i = 1; i <= 7; i += 1) expect(ids.has(`panel-${i}`)).toBe(true);
  });
});
