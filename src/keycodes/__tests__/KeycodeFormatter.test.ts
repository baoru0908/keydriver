// 键码格式化单测：参数化键码往返、Custom 动态注入、特殊图标（架构 §8.10 / T02.6）。
import { beforeEach, describe, expect, it } from 'vitest';
import { format, formatKeycap, formatShort, isSpecial } from '@/keycodes/KeycodeFormatter';
import { KeycodeTable, CUSTOM_KEYCODE_BASE } from '@/keycodes/KeycodeTable';
import { LT } from '@/keycodes/layers';
import { LCTL_T, MT, MOD_BITS } from '@/keycodes/modTap';

const KC_A = 0x0004;
const KC_LCTL = 0x00e0;

describe('KeycodeFormatter · 精确表', () => {
  it('基础键与修饰键显示名', () => {
    expect(format(KC_A)).toBe('A');
    expect(format(KC_LCTL)).toBe('L Ctrl');
    expect(format(0x0000)).toBe('禁用');
    expect(format(0x0001)).toBe('透明');
  });

  it('层操作键显示为 MO(n) / TO(n)', () => {
    expect(format(0x5101)).toBe('MO(1)');
    expect(format(0x5002)).toBe('TO(2)');
    expect(format(0x5300)).toBe('TG(0)');
  });

  it('未知键码兜底为 hex', () => {
    expect(format(0x7f01)).toBe('0x7F01');
  });
});

describe('KeycodeFormatter · 参数化键码', () => {
  it('MOD(kc) 组合：LCTL(A)', () => {
    const kc = (0x0100 | KC_A) & 0xffff;
    expect(format(kc)).toBe('LCTL(A)');
  });

  it('LT(layer, kc)：LT1(A)', () => {
    expect(format(LT(1, KC_A))).toBe('LT1(A)');
    expect(LT(1, KC_A)).toBe(0x4104);
  });

  it('Mod-Tap：LCTL_T(A)', () => {
    expect(format(LCTL_T(KC_A))).toBe('LCTL_T(A)');
    expect(LCTL_T(KC_A)).toBe(0x6104);
    expect(MT(MOD_BITS.RCTL, KC_A)).toBe(0x7104);
    expect(format(MT(MOD_BITS.RCTL, KC_A))).toBe('RCTL_T(A)');
  });

  it('TD / Macro 页', () => {
    expect(format(0x5700)).toBe('TD(0)');
    expect(format(0x7702)).toBe('M(2)');
  });

  it('键帽短名与截断', () => {
    expect(formatKeycap(KC_A)).toEqual(['A']);
    expect(formatKeycap(0x0000)).toEqual(['✕']);
    expect(formatKeycap(0x0001)).toEqual(['▽']);
    expect(formatShort(0x0104, 8)).toBe('LCTL(A)');
    expect(formatShort(0x0104, 4).length).toBeLessThanOrEqual(4);
    expect(isSpecial(0x0000)).toBe(true);
    expect(isSpecial(KC_A)).toBe(false);
  });
});

describe('KeycodeFormatter · Custom 动态注入', () => {
  beforeEach(() => {
    KeycodeTable.resetCustom();
  });

  it('按出现顺序分配键码（QK_KB 0x7E00 + index）', () => {
    KeycodeTable.registerCustom([
      { name: '锁定一', title: '锁定一', shortName: '锁定\n一' },
      { name: '锁定二', title: '锁定二', shortName: '锁定\n二' },
    ]);
    expect(KeycodeTable.custom()[0]?.code).toBe(CUSTOM_KEYCODE_BASE);
    expect(KeycodeTable.custom()[1]?.code).toBe(CUSTOM_KEYCODE_BASE + 1);
    // 自定义键码不依赖任何硬编码键名，只按 index 取值
    expect(format(CUSTOM_KEYCODE_BASE)).toBe('锁定\n一');
    expect(format(CUSTOM_KEYCODE_BASE + 1)).toBe('锁定\n二');
    expect(formatKeycap(CUSTOM_KEYCODE_BASE)).toEqual(['锁定', '一']);
  });

  it('Custom 分组出现在分组列表中', () => {
    KeycodeTable.registerCustom([{ name: 'X', title: 'X', shortName: 'X' }]);
    const groups = KeycodeTable.groups();
    expect(groups.some((g) => g.id === 'custom')).toBe(true);
  });

  it('未被索引到的自定义键码回落为 hex', () => {
    KeycodeTable.registerCustom([{ name: 'X' }]);
    expect(format(CUSTOM_KEYCODE_BASE + 9)).toBe(`0x${(CUSTOM_KEYCODE_BASE + 9).toString(16).toUpperCase().padStart(4, '0')}`);
  });
});
