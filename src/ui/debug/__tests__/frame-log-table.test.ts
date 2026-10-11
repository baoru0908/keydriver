// 报文表格「命令列」空值兜底测试。
//
// 背景（真实缺陷）：命令列原先写成
//   {CMD_NAMES[entry.commandId] ?? `0x${entry.commandId.toString(16)}`}
// 当 entry.commandId 在运行时为 undefined 时，`??` 的右侧**依然会被求值**，
// `undefined.toString()` 直接抛 TypeError，整个调试面板崩掉
// （device-info-gating 里的 DebugPanel 用例正是被这一句挂住的）。
// 报文记录来自协议层与外部数据，类型上是 number 不代表运行时一定有值，
// 因此本文件刻意构造「字段缺失」的记录来证伪。
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FrameEntry } from '@/store/useDebugStore';
import { FrameLogTable, formatCommandName } from '../FrameLogTable';

/**
 * 构造一条报文记录。
 * 参数用 Partial<FrameEntry>：`exactOptionalPropertyTypes` 关闭，
 * 因此可以显式传 undefined 来模拟运行时缺失字段（这正是缺陷触发条件）。
 */
function makeFrame(overrides: Partial<FrameEntry> = {}): FrameEntry {
  return {
    id: 1,
    dir: 'tx',
    hex: 'AA55',
    at: 0,
    durationMs: 3,
    commandId: 0x0b,
    ...overrides,
  };
}

/** 渲染表格为静态 HTML 字符串（node 环境，无 DOM）。 */
function renderTable(frames: readonly FrameEntry[]): string {
  return renderToStaticMarkup(createElement(FrameLogTable, { frames }));
}

/** 命令列在表头里的位置：# / 方向 / 命令 / 报文 / 耗时 / 操作。 */
const COMMAND_COLUMN = 2;
const DIRECTION_COLUMN = 1;

/** 取出每一行指定列的纯文本（去掉标签），用于精确断言「这一列到底显示了什么」。 */
function columnTexts(html: string, column: number): string[] {
  const out: string[] = [];
  const rowPattern = /<tr[\s\S]*?<\/tr>/g;
  let row = rowPattern.exec(html);
  while (row !== null) {
    const cells = [...row[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) =>
      (cell[1] ?? '').replace(/<[^>]*>/g, ''),
    );
    const value = cells[column];
    // 表头用的是 <th>，取不到 <td> 的行会被自然跳过
    if (value !== undefined) out.push(value);
    row = rowPattern.exec(html);
  }
  return out;
}

describe('报文表格 · 命令列空值兜底', () => {
  it('commandId 为 undefined 时不抛异常，且命令列显示十六进制而非留白', () => {
    const html = renderTable([makeFrame({ commandId: undefined })]);
    expect(columnTexts(html, COMMAND_COLUMN)).toEqual(['0x0']);
    // 其余列照常渲染：崩溃时会整块没有输出，这里必须还能看到报文本体
    expect(html).toContain('AA55');
  }, 30000);

  it('commandId 为 undefined 时表格仍渲染出完整一行（不是空串 / 不是异常）', () => {
    const html = renderTable([makeFrame({ commandId: undefined, hex: 'BB66' })]);
    expect(html).toContain('<table');
    expect(html).toContain('BB66');
    expect(columnTexts(html, DIRECTION_COLUMN)).toEqual(['TX']);
  }, 30000);

  it('已知命令显示命令名（查表命中）', () => {
    const html = renderTable([
      makeFrame({ id: 1, commandId: 0x01 }),
      makeFrame({ id: 2, commandId: 0x0b }),
      makeFrame({ id: 3, commandId: 0xff }),
    ]);
    // 表格内部会 reverse，最新的一条排在最前
    expect(columnTexts(html, COMMAND_COLUMN)).toEqual([
      'UNHANDLED',
      'BOOTLOADER_JUMP',
      'GET_PROTOCOL_VERSION',
    ]);
  }, 30000);

  it('未知命令显示十六进制（查表未命中，便于人工定位）', () => {
    const html = renderTable([makeFrame({ commandId: 0x0c }), makeFrame({ id: 2, commandId: 0x2a })]);
    expect(columnTexts(html, COMMAND_COLUMN)).toEqual(['0x2a', '0xc']);
  }, 30000);

  it('越界 / 非法数值（NaN、负数、超大值）都不抛异常', () => {
    const html = renderTable([
      makeFrame({ id: 1, commandId: Number.NaN }),
      makeFrame({ id: 2, commandId: -1 }),
      makeFrame({ id: 3, commandId: 1_000_000_000 }),
    ]);
    expect(columnTexts(html, COMMAND_COLUMN)).toEqual(['0x3b9aca00', '0x0', '0x0']);
  }, 30000);

  it('formatCommandName：null / undefined 同样安全，且返回结果永远非空', () => {
    for (const broken of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      const text = formatCommandName(broken);
      expect(text.length).toBeGreaterThan(0);
    }
    expect(formatCommandName(null)).toBe('0x0');
    expect(formatCommandName(undefined)).toBe('0x0');
    expect(formatCommandName(0x08)).toBe('CUSTOM_GET_VALUE');
  }, 30000);

  it('方向缺失时退化为占位符，不因空值抛异常', () => {
    const html = renderTable([makeFrame({ dir: undefined, commandId: 0x01 })]);
    expect(columnTexts(html, COMMAND_COLUMN)).toEqual(['GET_PROTOCOL_VERSION']);
    expect(columnTexts(html, DIRECTION_COLUMN)).toEqual(['—']);
  }, 30000);

  it('空报文列表仍给出空态文案', () => {
    expect(renderTable([])).toContain('暂无报文');
  }, 30000);
});
