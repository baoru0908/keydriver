// 【QA 缺陷复现 · 暂定 P2】键码显示名与 Any 输入解析名不是同一套词汇表，
// 导致「界面上看到的键名」无法被解析回同一个键码（复制 → 粘贴 → 无效）。
//
// 典型症状（M2 真机遇到的形态）：
//   改键面板 hover 显示 "LT1(A)" / "LCTL_T(A)" / "Enter"，
//   用户把这段文字粘进 Any 输入框 → 解析失败 → 「改了没反应」。
import { describe, expect, it } from 'vitest';
import { KeycodeTable } from '@/keycodes/KeycodeTable';
import { format } from '@/keycodes/KeycodeFormatter';
import { tryParse } from '@/keycodes/AnyKeycodeParser';

describe('qa-regression · 显示名 ↔ Any 输入名 的往返一致性', () => {
  it('全部内置键码的显示名都应能被 Any 输入解析回原键码', () => {
    const builtins = KeycodeTable.builtins();
    const failures: { code: string; text: string }[] = [];
    for (const def of builtins) {
      const text = format(def.code);
      const parsed = tryParse(text);
      if (parsed !== (def.code & 0xffff)) {
        failures.push({ code: `0x${def.code.toString(16)}`, text });
      }
    }
    // 期望：0 失败（显示名应当可被机器识别，或解析器补充 label 反查）
    expect(failures, `共 ${failures.length}/${builtins.length} 个键码的显示名无法被解析`).toHaveLength(0);
  });

  it('参数化键码（LT / Mod-Tap）的显示名应能被解析回原键码', () => {
    // LT(1,KC_A) 与 LCTL_T(KC_A) 是 Any 输入的推荐写法，界面上却显示 LT1(A) / LCTL_T(A)
    expect(format(0x4104)).toBe('LT1(A)');
    expect(tryParse('LT1(A)')).toBe(0x4104);

    expect(format(0x6104)).toBe('LCTL_T(A)');
    expect(tryParse('LCTL_T(A)')).toBe(0x6104);
  });
});
