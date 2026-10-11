// QA 独立验证 · Any 键码输入的边界与兜底（已有单测只覆盖 happy path）。
import { describe, expect, it } from 'vitest';
import { parseAnyKeycode, tryParse } from '@/keycodes/AnyKeycodeParser';
import { format, formatKeycap, formatShort, parseKeycode } from '@/keycodes/KeycodeFormatter';
import { KeycodeTable } from '@/keycodes/KeycodeTable';
import { QK_PAGE } from '@/core/protocol/constants';

const KC_A = 0x0004;

describe('QA · AnyKeycodeParser 四种形态 + 大小写/空白容忍', () => {
  it('常量名（带 KC_ 前缀 / 别名 / 大小写混合 / 前后空白）', () => {
    expect(tryParse('KC_A')).toBe(KC_A);
    expect(tryParse(' kc_a ')).toBe(KC_A);
    expect(tryParse('LAlt')).toBe(0x00e2);
    expect(tryParse('LWIN')).toBe(0x00e3);
  });

  it('十六进制（0x / 0X / 大小写 / 1–4 位）', () => {
    expect(tryParse('0x4')).toBe(0x0004);
    expect(tryParse('0X0004')).toBe(0x0004);
    expect(tryParse('0xABCD')).toBe(0xabcd);
    expect(tryParse('0xffff')).toBe(0xffff);
  });

  it('十进制（含边界 65535；单个数字 0-9 归数字键）', () => {
    expect(tryParse('65535')).toBe(0xffff);
    expect(tryParse('321')).toBe(0x0141);
    expect(tryParse('10')).toBe(0x000a);
    // 单个数字按显示名优先 → 解析为数字键，而不是十进制数值
    expect(tryParse('0')).toBe(0x0027);
    expect(tryParse('5')).toBe(0x0022);
    // 要表示「禁用键」有三条等价写法（原版 VIA 也没有裸十进制约定）
    expect(tryParse('KC_NO')).toBe(0x0000);
    expect(tryParse('0x0000')).toBe(0x0000);
    expect(tryParse('禁用')).toBe(0x0000);
  });

  it('函数式：修饰组合 / 层操作 / Mod-Tap / Layer-Tap', () => {
    expect(tryParse('LCTL(KC_A)')).toBe((QK_PAGE.LCTL | KC_A) & 0xffff);
    expect(tryParse('RGUI(KC_A)')).toBe((0x1800 | KC_A) & 0xffff);
    expect(tryParse('MO(3)')).toBe(0x5103);
    expect(tryParse('OSL(2)')).toBe(0x5402);
    expect(tryParse('TG(15)')).toBe(0x530f);
    expect(tryParse('LCTL_T(KC_A)')).toBe(0x6104);
    expect(tryParse('LT(1,KC_A)')).toBe(0x4104);
  });

  it('函数参数支持嵌套原子（数字 / hex / 常量名均可）', () => {
    expect(tryParse('LT(1,0x04)')).toBe(0x4104);
    expect(tryParse('MO(255)')).toBe(0x51ff);
    expect(tryParse('QMKSYMBOLWITHOUTNAME(KC_A)')).toBeNull();
  });
});

describe('QA · AnyKeycodeParser 非法输入兜底', () => {
  const bad: { input: string; why: string }[] = [
    { input: '', why: '空输入' },
    { input: '   ', why: '纯空白' },
    { input: 'KC_XXX', why: '不存在的常量名' },
    { input: '0x12345', why: 'hex 超过 4 位' },
    { input: '65536', why: '十进制超过 0xFFFF' },
    { input: '999999', why: '远越界十进制' },
    { input: '0x', why: '空 hex' },
    { input: 'LCTL(', why: '缺右括号' },
    { input: 'LCTL()', why: '空参数' },
    { input: 'LCTL(KC_XXX)', why: '参数无法解析' },
    { input: 'LCTL(KC_A', why: '括号不配对' },
    { input: 'MT(1,KC_A)', why: '不支持裸 MT' },
    { input: 'LT(1)', why: 'LT 缺第二个参数' },
    { input: 'LCTL(KC_A,KC_B)', why: '参数个数过多' },
    { input: '😀', why: '非 ASCII' },
    { input: 'KC_A);DROP TABLE keymap;--', why: '注入串（解析器不得执行任何脚本）' },
  ];

  for (const { input, why } of bad) {
    it(`${why}：返回失败且不抛异常`, () => {
      const result = parseAnyKeycode(input);
      expect(result.ok).toBe(false);
      expect(result.keycode).toBeUndefined();
      expect(result.message.length).toBeGreaterThan(0);
      expect(tryParse(input)).toBeNull();
    });
  }

  it('超长输入不得拖垮解析（10k 字符立即失败）', () => {
    const input = `0x${'f'.repeat(10000)}`;
    expect(parseAnyKeycode(input).ok).toBe(false);
  });
});

describe('QA · 静默截断：超出位宽的参数被静默取模（记录当前行为）', () => {
  it('LT(20,KC_A) 被截断为 LT(4,KC_A)（layer 只有 4 位）', () => {
    // 期望：UI 输入层应在提交前校验 layer ∈ [0,15]，协议层这里没有告警，属于「改了没反应」的成因之一
    expect(tryParse('LT(20,KC_A)')).toBe(tryParse('LT(4,KC_A)'));
    expect(tryParse('LT(20,KC_A)')).toBe(0x4404);
  });

  it('MO(300) 与 MO(44) 等价（只取低 8 位）', () => {
    expect(tryParse('MO(300)')).toBe(tryParse('MO(44)'));
  });
});

describe('QA · 键码 ↔ 显示名往返', () => {
  it('参数化键码显示名可由解析器还原（MO / OSL / TG）', () => {
    for (const kc of [0x5103, 0x5402, 0x530f]) {
      const text = format(kc);
      expect(parseAnyKeycode(text).keycode, `${text} 应回到 0x${kc.toString(16)}`).toBe(kc);
    }
  });

  it('基本键：显示名是给人看的（label），可解析名是给机器看的（name/alias）', () => {
    // format(KC_A) === 'A'（label）；解析器除 'KC_A'（name/alias）外也认显示名
    expect(format(0x0004)).toBe('A');
    expect(tryParse('KC_A')).toBe(0x0004);
    // Bug D 修复前这里为 null：「界面显示名无法解析回去」，往返不一致由
    // qa-regression-formatter-roundtrip.test.ts 量化。
    // 修复后解析器补充了显示名反查（short / label / 去前缀常量名），
    // 用户把界面上看到的 'A' 粘回 Any 输入框即可正确解析。
    expect(tryParse('A')).toBe(0x0004);
  });

  it('（对照）任意 16 位值都能以 0xXXXX 形态往返', () => {
    for (const kc of [0x0000, 0x0001, 0x00e0, 0x4104, 0x6104, 0xffff]) {
      expect(tryParse(`0x${kc.toString(16).toUpperCase().padStart(4, '0')}`)).toBe(kc);
    }
  });

  it('parseKeycode 对 Mod-Tap 的解析结果要与 layers/modTap 的构造器一致', () => {
    const parsed = parseKeycode(0x6104);
    expect(parsed.kind).toBe('modtap');
    expect(parsed.prefix).toBe('LCTL_T');
    expect(parsed.inner).toBe(KC_A);
  });

  it('未注册的键码显示原始 hex', () => {
    expect(format(0x00ff)).toBe('0x00FF');
    expect(parseKeycode(0x00ff).kind).toBe('raw');
  });

  it('键帽短名：禁用 / 透明 / 超长三种', () => {
    expect(formatKeycap(0x0000)).toEqual(['✕']);
    expect(formatKeycap(0x0001)).toEqual(['▽']);
    const long = formatShort(0x4104, 8);
    expect(long.length).toBeLessThanOrEqual(8);
  });

  it('Custom 键码注册后：短名含换行时能拆成两行', () => {
    KeycodeTable.registerCustom([
      { name: 'WIN锁', title: 'WIN 锁', shortName: 'WIN\n锁' },
    ]);
    const base = KeycodeTable.custom()[0]?.code ?? 0;
    expect(format(base)).toBe('WIN\n锁');
    expect(formatKeycap(base)).toEqual(['WIN', '锁']);
    KeycodeTable.resetCustom();
  });
});
