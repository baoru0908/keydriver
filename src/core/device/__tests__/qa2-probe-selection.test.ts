// QA2 · 握手自校验探针的选取与有效性（team-lead 裁决第 2 条）。
// 问题：探针挑的键位参数是否非全 0？若全 0，错位时探针还能不能抓到？
import { describe, expect, it } from 'vitest';
import { ViaProtocol } from '@/core/protocol/ViaProtocol';
import { DummyTransport } from '@/core/hid/DummyTransport';
import { MSG_LEN } from '@/core/hid/HidTransport';
import { runProbe } from '@/core/device/handshake';
import { loadRealParsedDefinition } from '@/definition/__tests__/fixtures/realDefinition';
import type { ControlSpec } from '@/definition/schema';

type DummyConfig = ConstructorParameters<typeof DummyTransport>[0];

async function setup(config: DummyConfig = {}) {
  const transport = new DummyTransport(config);
  const [device] = await transport.listDevices();
  if (!device) throw new Error('Dummy 设备列表为空');
  await transport.open(device);
  return { transport, protocol: new ViaProtocol(transport) };
}

/** 协议方言替身：在响应 index=1 插入一个额外 channel 字节，其余整体右移。 */
class DialectTransport extends DummyTransport {
  constructor(private readonly extraByte: number, config: DummyConfig = {}) {
    super(config);
  }

  override async transfer(request: Uint8Array, timeoutMs?: number): Promise<Uint8Array> {
    const response = await super.transfer(request, timeoutMs);
    const out = new Uint8Array(MSG_LEN);
    out[0] = response[0] ?? 0;
    out[1] = this.extraByte & 0xff;
    for (let i = 1; i < MSG_LEN - 1; i += 1) out[i + 1] = response[i] ?? 0;
    return out;
  }
}

/** 与 handshake.runProbe 完全一致的取控件逻辑：第一个 keycode 控件。 */
function probeControl(): ControlSpec | undefined {
  return loadRealParsedDefinition().controls.find((c) => c.type === 'keycode');
}

describe('QA2 · 探针所选键位的参数区', () => {
  it('探针取的是定义文件中第一个 keycode 控件', () => {
    const control = probeControl();
    expect(control).toBeDefined();
    expect(control?.type).toBe('keycode');
  });

  it('探针键位的参数区不得全为 0（channel / valueId / 索引至少有一个非零）', () => {
    const control = probeControl();
    if (!control) throw new Error('定义文件中没有 keycode 控件');
    const { channel, valueId, indexes } = control.address;
    const params = [channel, valueId, ...indexes];
    expect(
      params.some((b) => b !== 0),
      `探针地址 ${control.address.key} 的参数区为 [${params.join(', ')}]，全 0 时回声比对可能失效`,
    ).toBe(true);
  });
});

describe('QA2 · 探针能否真正抓到回显错位（行为验证）', () => {
  it('无错位：探针通过（passed=true）', async () => {
    const { protocol } = await setup();
    const result = await runProbe(protocol, { definition: loadRealParsedDefinition() });
    expect(result.passed).toBe(true);
    expect(result.addressKey).toBe(probeControl()?.address.key);
  });

  it('echoOffset=1（整体错位 1 字节）：探针必须判定失败', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    const result = await runProbe(protocol, { definition: loadRealParsedDefinition() });
    expect(result.passed).toBe(false);
    expect(result.detail).toBeTruthy();
    expect(result.requestHex).toBeTruthy();
    expect(result.responseHex).toBeTruthy();
  });

  it('echoOffset=2 / 3：探针同样必须判定失败', async () => {
    for (const echoOffset of [2, 3]) {
      const { protocol } = await setup({ echoOffset });
      const result = await runProbe(protocol, { definition: loadRealParsedDefinition() });
      expect(result.passed, `echoOffset=${echoOffset} 未被探针识别`).toBe(false);
    }
  });

  it('方言替身（多带一个 channel 字节）：探针必须判定失败', async () => {
    const transport = new DialectTransport(0x01);
    const [device] = await transport.listDevices();
    if (!device) throw new Error('Dummy 设备列表为空');
    await transport.open(device);
    const protocol = new ViaProtocol(transport);
    const result = await runProbe(protocol, { definition: loadRealParsedDefinition() });
    expect(result.passed).toBe(false);
  });

  it('探针失败时不抛异常（不阻断连接），只返回结果与告警', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    const warnings: Array<{ level: string; title: string }> = [];
    const result = await runProbe(protocol, {
      definition: loadRealParsedDefinition(),
      onWarning: (w) => warnings.push({ level: w.level, title: w.title }),
    });
    expect(result.passed).toBe(false);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]?.level).toBe('warn');
  });

  it('固件回显 0xFF（命令不被识别）：探针判定失败并给出对应告警', async () => {
    const control = probeControl();
    if (!control) throw new Error('定义文件中没有 keycode 控件');
    const { protocol } = await setup({ unhandledChannels: [control.address.channel] });
    const warnings: string[] = [];
    const result = await runProbe(protocol, {
      definition: loadRealParsedDefinition(),
      onWarning: (w) => warnings.push(w.title),
    });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain('未被固件处理');
    expect(warnings.some((t) => t.includes('0xFF'))).toBe(true);
  });
});
