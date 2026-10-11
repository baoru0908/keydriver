// Any 键码输入解析单测：常量名 / hex / 十进制 / 函数式四种形态（架构 §8.10）。
import { describe, expect, it } from 'vitest';
import { parseAnyKeycode, tryParse } from '@/keycodes/AnyKeycodeParser';
import { KeycodeTable, CUSTOM_KEYCODE_BASE } from '@/keycodes/KeycodeTable';
import { LT } from '@/keycodes/layers';
import { LCTL_T } from '@/keycodes/modTap';

const KC_A = 0x0004;

describe('AnyKeycodeParser · 四种输入形态', () => {
  it('QMK 常量名', () => {
    expect(parseAnyKeycode('KC_LCTL').keycode).toBe(0x00e0);
    expect(parseAnyKeycode('KC_A').keycode).toBe(KC_A);
    expect(parseAnyKeycode('lctl').keycode).toBe(0x00e0);
  });

  it('别名', () => {
    expect(parseAnyKeycode('LCTL').keycode).toBe(0x00e0);
    expect(parseAnyKeycode('MO_1').keycode).toBe(0x5101);
  });

  it('十六进制', () => {
    expect(parseAnyKeycode('0x0141').keycode).toBe(0x0141);
    expect(parseAnyKeycode('0X5700').keycode).toBe(0x5700);
  });

  it('十进制', () => {
    expect(parseAnyKeycode('321').keycode).toBe(321);
    expect(parseAnyKeycode('65535').keycode).toBe(0xffff);
  });

  it('函数式：LCTL(KC_A) / LT(1,KC_A) / TD(0)', () => {
    expect(parseAnyKeycode('LCTL(KC_A)').keycode).toBe((0x0100 | KC_A) & 0xffff);
    expect(parseAnyKeycode('LT(1,KC_A)').keycode).toBe(LT(1, KC_A));
    expect(parseAnyKeycode('TD(0)').keycode).toBe(0x5700);
    expect(parseAnyKeycode('MO(3)').keycode).toBe(0x5103);
  });

  it('Mod-Tap 函数式', () => {
    expect(parseAnyKeycode('LCTL_T(KC_A)').keycode).toBe(LCTL_T(KC_A));
    expect(parseAnyKeycode('RCTL_T(KC_A)').keycode).toBe(0x7104);
  });

  it('非法输入返回失败与提示文案', () => {
    const bad = parseAnyKeycode('不存在的键');
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain('无法解析');
    expect(tryParse('不存在的键')).toBeNull();
    expect(parseAnyKeycode('').ok).toBe(false);
    expect(parseAnyKeycode('FOO(KC_A)').ok).toBe(false);
    expect(parseAnyKeycode('999999').ok).toBe(false);
  });
});

describe('AnyKeycodeParser · 与 Custom 键码协作', () => {
  it('可用自定义键名直接输入', () => {
    KeycodeTable.registerCustom([{ name: 'MY_KEY', title: '我的键' }]);
    expect(parseAnyKeycode('MY_KEY').keycode).toBe(CUSTOM_KEYCODE_BASE);
    KeycodeTable.resetCustom();
  });
});
