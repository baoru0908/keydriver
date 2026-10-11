// QA 独立验证 · 定义文件校验（validate.ts 目前没有独立测试文件，本文件补齐）
// 覆盖：字段级错误收集、V2 遗留字段告警、ID 字符串归一化的等价类。
import { describe, expect, it } from 'vitest';
import { parseId, validateDefinition } from '@/definition/validate';
import { loadRealParsedDefinition, loadRealDefinitionRaw } from './fixtures/realDefinition';

const base = {
  name: '测试键盘',
  vendorId: '0x5594',
  productId: '0x0005',
  matrix: { rows: 5, cols: 15 },
  layouts: { keymap: [['0,0']] },
};

describe('QA · parseId 三种形态', () => {
  it('0x 前缀 / 十进制字符串 / 数字', () => {
    expect(parseId('0x5594')).toBe(0x5594);
    expect(parseId('0X5594')).toBe(0x5594);
    expect(parseId('  0x5594  ')).toBe(0x5594);
    expect(parseId('21908')).toBe(0x5594);
    expect(parseId(0x5594)).toBe(0x5594);
  });

  it('非法输入回落 0 而不是 NaN', () => {
    expect(parseId('')).toBe(0);
    expect(parseId('abc')).toBe(0);
    expect(parseId('0xZZ')).toBe(0);
    expect(Number.isNaN(parseId('not a number'))).toBe(false);
  });

  it('目标定义文件：vid/pid 解析结果与其字面量一致', () => {
    const raw = loadRealDefinitionRaw();
    expect(raw.vendorId).toBe('0x5594');
    expect(raw.productId).toBe('0x0005');
    expect(parseId(raw.vendorId)).toBe(0x5594);
    expect(parseId(raw.productId)).toBe(0x0005);
    const parsed = loadRealParsedDefinition();
    expect([parsed.vid, parsed.pid]).toEqual([0x5594, 0x0005]);
  });

  it('（发现参考）大小写 / 补零差异都能归一到同一个数值', () => {
    const forms = ['0x5594', '0X5594', '0x5594', '21908'];
    for (const form of forms) expect(parseId(form)).toBe(0x5594);
    // 但 DefinitionRepository 用原始字符串拼 ${vid}:${pid} 作为主键，
    // 这些等价写法会变成不同的键 —— 见报告「VidPid 等价类」条目。
  });
});

describe('QA · validateDefinition 字段级错误', () => {
  it('合法定义通过且不产生 error', () => {
    const result = validateDefinition(base);
    expect(result.ok).toBe(true);
    expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('缺少必需字段时给出路径级错误，而不是抛异常', () => {
    const result = validateDefinition({});
    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
    const paths = result.issues.map((i) => i.path);
    expect(paths).toContain('name');
    expect(paths).toContain('vendorId');
    expect(paths).toContain('matrix');
    expect(paths).toContain('layouts');
    for (const issue of result.issues) expect(issue.level).toBe('error');
  });

  it('matrix / layouts.keymap 类型错误也能定位', () => {
    const badMatrix = validateDefinition({ ...base, matrix: { rows: '5', cols: 15 } });
    expect(badMatrix.ok).toBe(false);
    expect(badMatrix.issues.some((i) => i.path === 'matrix.rows')).toBe(true);

    const badKeymap = validateDefinition({ ...base, layouts: { keymap: 'not-an-array' } });
    expect(badKeymap.ok).toBe(false);
    expect(badKeymap.issues.some((i) => i.path === 'layouts.keymap')).toBe(true);
  });

  it('V2 遗留字段 lighting：告警但通过', () => {
    const result = validateDefinition({ ...base, menus: [], lighting: { effects: [] } });
    expect(result.ok).toBe(true);
    expect(result.issues).toContainEqual({
      level: 'warn',
      path: 'lighting',
      message: '检测到 V2 遗留字段 lighting，V3 不使用，已忽略',
    });
    expect(result.issues.every((i) => i.level === 'warn')).toBe(true);
  });

  it('空 menus：告警但通过', () => {
    const result = validateDefinition({ ...base, menus: [] });
    expect(result.ok).toBe(true);
    expect(result.issues.some((i) => i.path === 'menus' && i.level === 'warn')).toBe(true);
  });

  it('未知字段（passthrough）不会被丢弃', () => {
    const result = validateDefinition({ ...base, futureField: 1 });
    expect(result.ok).toBe(true);
    expect((result.data as Record<string, unknown> | undefined)?.['futureField']).toBe(1);
  });

  it('目标定义文件通过校验（无 error；无 category 的顶层菜单各产生一条 warn）', () => {
    const raw = loadRealDefinitionRaw();
    const result = validateDefinition(raw);
    expect(result.ok).toBe(true);
    expect(result.issues.filter((i) => i.level === 'error')).toEqual([]);
    // category 是我们加的导航扩展字段，VIA 规范不要求：缺它的菜单仍合法，只提示会落进中性分组。
    const expected = (raw.menus ?? []).filter((m) => typeof m === 'object' && !m.category).length;
    const menuWarns = result.issues.filter((i) => /^menus\[\d+\]$/.test(i.path));
    expect(expected).toBeGreaterThan(0);
    expect(menuWarns).toHaveLength(expected);
    for (const warn of menuWarns) expect(warn.level).toBe('warn');
    // 其余告警也必须是 warn（不允许把合法定义判成 error）
    expect(result.issues.every((i) => i.level === 'warn')).toBe(true);
  });
});
