// QA 独立验证 · ViaProtocol 边界与错误路径（高危点 2/3 + 0x12/0x13 分块边界）。
import { describe, expect, it } from 'vitest';
import { ViaProtocol, type FrameRecord } from '@/core/protocol/ViaProtocol';
import { DummyTransport } from '@/core/hid/DummyTransport';
import { addressKey, makeAddress } from '@/core/protocol/CustomValueCodec';
import {
  EchoParamMismatchError,
  TimeoutError,
  UnhandledCommandError,
} from '@/core/protocol/errors';
import { VIA_CMD, KB_VALUE_ID, KEYMAP_BUFFER_CHUNK } from '@/core/protocol/constants';
import { loadRealParsedDefinition } from '@/definition/__tests__/fixtures/realDefinition';
import type { HidTransport } from '@/core/hid/HidTransport';

async function setup(config: Partial<ConstructorParameters<typeof DummyTransport>[0]> = {}) {
  const frames: FrameRecord[] = [];
  const transport = new DummyTransport(config);
  const [device] = await transport.listDevices();
  if (!device) throw new Error('Dummy 设备列表为空');
  await transport.open(device);
  const protocol = new ViaProtocol(transport, { onFrame: (r) => frames.push(r) });
  return { transport, protocol, frames };
}

describe('QA · 响应有效性双防御（高危点 2）', () => {
  it('方言错位（echoOffset=1）：不是静默返回 0，而是抛 EchoParamMismatchError', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    await expect(protocol.customGetValue(makeAddress(9, 1, [2]), 2)).rejects.toBeInstanceOf(
      EchoParamMismatchError,
    );
  });

  it('第一道防线：0xFF 回显抛 UnhandledCommandError（优先级高于回显校验）', async () => {
    const { protocol } = await setup({ unhandledChannels: [9] });
    await expect(protocol.customGetValue(makeAddress(9, 1, [2]), 2)).rejects.toBeInstanceOf(
      UnhandledCommandError,
    );
  });

  it('第二道防线覆盖 0x12/0x13/0x04/0x05：参数非零时错位必须报错', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    await expect(protocol.getKeycode(1, 2, 3)).rejects.toBeInstanceOf(EchoParamMismatchError);
    await expect(protocol.getKeymapBuffer(150, 28)).rejects.toBeInstanceOf(EchoParamMismatchError);
    await expect(protocol.setKeycode(1, 2, 3, 0x0004)).rejects.toBeInstanceOf(
      EchoParamMismatchError,
    );
  });

  it('（已知限制）参数为全 0 时方言错位不可检出 —— 探针必须挑非 0 地址', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    // layer/row/col 全为 0，整体左移 1 字节后参数区仍然相等，第二道防线失效
    await expect(protocol.getKeycode(0, 0, 0)).resolves.toBe(0);
    // 而 layer=1 即可检出
    await expect(protocol.getKeycode(1, 0, 0)).rejects.toBeInstanceOf(EchoParamMismatchError);
  });

  it('自校验探针所选的 keycode 控件地址必须非零（否则探针空跑）', () => {
    const definition = loadRealParsedDefinition();
    const probeTarget = definition.controls.find((c) => c.type === 'keycode');
    expect(probeTarget).toBeDefined();
    // channel/valueId 都不为 0，保证回显错位能被第二道防线命中
    expect(probeTarget?.address.channel).not.toBe(0);
    expect(probeTarget?.address.valueId).not.toBe(0);
  });

  it('错误详情必须携带原始报文 hex（用于调试面板归因）', async () => {
    const { protocol } = await setup({ unhandledChannels: [9] });
    const error = await protocol
      .customGetValue(makeAddress(9, 1, [2]), 2)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnhandledCommandError);
    expect((error as { rawHex?: string }).rawHex).toMatch(/^FF/);
  });

  it('回声正确时不抛错：0x08 参数区含 cmd+channel+valueId+indexes', async () => {
    const { protocol, transport } = await setup();
    const addr = makeAddress(9, 1, [2]);
    // 播种键一律走 addressKey（与 SimulatedFirmware 修复后的内部键格式同源），
    // 避免手写拼接在索引个数变化时与固件键分叉
    transport.firmware.seedValue(addressKey(addr), 0x0104, 2);
    await expect(protocol.customGetValue(addr, 2)).resolves.toBe(0x0104);
  });
});

describe('QA · keycodes version（高危点 3）', () => {
  it('协议 ≥ 13 时能读到 BCD 版本号（大端，位于响应 data[2..6]）', async () => {
    const { protocol } = await setup({ protocolVersion: 13, keycodesVersion: 0x0000_0009 });
    await expect(protocol.getKeycodesVersion()).resolves.toBe(0x0000_0009);
  });

  it('请求帧为 0x02 + value_id 0x06', async () => {
    const { protocol, frames } = await setup({ protocolVersion: 13 });
    await protocol.getKeycodesVersion();
    const tx = frames.find((f) => f.dir === 'tx');
    expect(tx?.hex.startsWith('02 06 00 00')).toBe(true);
    expect(tx?.commandId).toBe(VIA_CMD.GET_KEYBOARD_VALUE);
  });

  it('协议 < 13 时固件侧返回 0（该版本没有键码字典版本这个概念）', async () => {
    const { protocol } = await setup({ protocolVersion: 12, keycodesVersion: 0x0000_0009 });
    await expect(protocol.getKeycodesVersion()).resolves.toBe(0);
  });

  it('越界 BCD（0x0000000A）与非 BCD（0x0000001F）都能被原样读出（由握手层判定告警）', async () => {
    const { protocol: p1 } = await setup({ protocolVersion: 13, keycodesVersion: 0x0000_000a });
    await expect(p1.getKeycodesVersion()).resolves.toBe(0x0000_000a);

    const { protocol: p2 } = await setup({ protocolVersion: 13, keycodesVersion: 0x0000_001f });
    await expect(p2.getKeycodesVersion()).resolves.toBe(0x0000_001f);
  });

  it('0x02 的参数回声错位时报错（value_id 回显不一致）', async () => {
    const { protocol } = await setup({ echoOffset: 1, protocolVersion: 13 });
    await expect(protocol.getKeycodesVersion()).rejects.toBeInstanceOf(EchoParamMismatchError);
  });

  it('getKeyboardValue(FIRMWARE_VERSION) 为 4 字节大端', async () => {
    const { protocol } = await setup({ firmwareVersion: 0x0001_0203 });
    await expect(protocol.getKeyboardValue(KB_VALUE_ID.FIRMWARE_VERSION)).resolves.toBe(0x0001_0203);
  });
});

describe('QA · keymap buffer（0x12/0x13）分块边界', () => {
  it('size 恰好 28（单帧上限）：读写完整', async () => {
    const { protocol } = await setup({ rows: 5, cols: 15, layerCount: 2 });
    const data = new Uint8Array(KEYMAP_BUFFER_CHUNK);
    for (let i = 0; i < KEYMAP_BUFFER_CHUNK; i += 2) {
      data[i] = 0x01;
      data[i + 1] = 0x04 + i;
    }
    await protocol.setKeymapBuffer(0, data);
    const read = await protocol.getKeymapBuffer(0, KEYMAP_BUFFER_CHUNK);
    expect(Array.from(read)).toEqual(Array.from(data));
  });

  it('offset 跨 28 字节边界（层尾 layout：150 字节/层 → chunk 起点 140/150/168 等不对齐）', async () => {
    const { protocol } = await setup({ rows: 5, cols: 15, layerCount: 4 });
    const byteTotal = 5 * 15 * 2; // 150，非 28 的整数倍
    // 先把全部 keymap 写成可辨识的形状：第 i 个键 = 0x1000 + i
    for (let layer = 0; layer < 4; layer += 1) {
      for (let key = 0; key < 75; key += 1) {
        await protocol.setKeycode(layer, Math.floor(key / 15), key % 15, 0x1000 + layer * 100 + key);
      }
    }
    // 按 28 字节逐块读回，允许最后一个块不足 28
    for (let offset = 0; offset < byteTotal; offset += KEYMAP_BUFFER_CHUNK) {
      const size = Math.min(KEYMAP_BUFFER_CHUNK, byteTotal - offset);
      const chunk = await protocol.getKeymapBuffer(byteTotal * 2 + offset, size);
      expect(chunk).toHaveLength(size);
      for (let i = 0; i + 1 < size; i += 2) {
        const kc = ((chunk[i] ?? 0) << 8) | (chunk[i + 1] ?? 0);
        const keyIndex = (offset + i) / 2;
        expect(kc).toBe(0x1000 + 2 * 100 + keyIndex);
      }
    }
  });

  it('size 超过 28 时被静默截断到 28（记录当前行为：调用方必须自行分块）', async () => {
    const { protocol } = await setup({ rows: 5, cols: 15, layerCount: 2 });
    const data = new Uint8Array(32);
    data.set([0x01, 0x04, 0x01, 0x05], 0);
    await expect(protocol.setKeymapBuffer(0, data)).resolves.toBeUndefined();
    const read = await protocol.getKeymapBuffer(0, 32);
    expect(read).toHaveLength(KEYMAP_BUFFER_CHUNK);
  });

  it('奇数 size：最后一个不完整键被忽略，不产生半个字节污染', async () => {
    const { protocol } = await setup({ rows: 5, cols: 15, layerCount: 2 });
    await protocol.setKeycode(0, 0, 0, 0x0104);
    const before = await protocol.getKeycode(0, 0, 0);
    expect(before).toBe(0x0104);
    const data = new Uint8Array(3);
    data.set([0x00, 0x2a, 0x00]);
    await protocol.setKeymapBuffer(0, data);
    await expect(protocol.getKeycode(0, 0, 0)).resolves.toBe(0x002a);
    // 第二个键不应被此次写入破坏
    await expect(protocol.getKeycode(0, 0, 1)).resolves.not.toBe(0x0000);
  });
});

describe('QA · 传输重试与报文记录', () => {
  it('注入 dropRate=1 时按 maxRetries 重试，最终抛 TimeoutError', async () => {
    const attempts = { n: 0 };
    const base = new DummyTransport({ dropRate: 1 });
    const [device] = await base.listDevices();
    if (!device) throw new Error('Dummy 设备列表为空');
    await base.open(device);
    const counting = new Proxy(base, {
      get(target, prop, receiver) {
        if (prop === 'transfer') {
          return async (req: Uint8Array, ms?: number) => {
            attempts.n += 1;
            return target.transfer(req, ms);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as HidTransport;
    const protocol = new ViaProtocol(counting, { maxRetries: 2 });
    await expect(protocol.getProtocolVersion()).rejects.toBeInstanceOf(TimeoutError);
    expect(attempts.n).toBe(3); // 首次 + 2 次重试
  });

  it('注入 latencyMs 小于超时上限时不报错，超过则超时', async () => {
    const ok = await setup({ latencyMs: 20 });
    await expect(ok.protocol.getProtocolVersion()).resolves.toBe(11);
    const slow = await setup({ latencyMs: 5000 });
    await expect(slow.protocol.getProtocolVersion()).rejects.toBeInstanceOf(TimeoutError);
  });

  it('rawCommand 不参与双防御判定，原样返回帧（供探针使用）', async () => {
    const { protocol } = await setup({ unhandledChannels: [9] });
    const resp = await protocol.rawCommand([0x99, 0x01]);
    expect(resp[0]).toBe(VIA_CMD.UNHANDLED);
  });
});
