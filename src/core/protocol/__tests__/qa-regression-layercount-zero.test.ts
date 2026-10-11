// 【QA 缺陷复现 · 团队裁决第 1 条】getLayerCount 返回 0 必须抛错，不得静默返回 0。
//
// 背景：KEYMAP_GET_LAYER_COUNT(0x11) 是无参数命令，参数区为 [1,1) 空区间，
// 因此第二道防线（参数回声比对）对它在原理上无能为力——整体错位 1 字节时它静默返回 0 层。
// 但「一把键盘层数恒 ≥ 1」是语义层可判定的事实：0 层在物理上不可能，
// 真机上会表现为「键位图全空、层切换器没有层」，用户会误以为是 UI bug。
//
// 落点：不改 frame.echoMatches（它没错），而是在协议层加结果合理性校验。
// 本文件为保留的失败回归测试，修复前应保持红。
import { describe, expect, it } from 'vitest';
import { ViaProtocol } from '@/core/protocol/ViaProtocol';
import { DummyTransport } from '@/core/hid/DummyTransport';

async function setup(config: ConstructorParameters<typeof DummyTransport>[0] = {}) {
  const transport = new DummyTransport(config);
  const [device] = await transport.listDevices();
  if (!device) throw new Error('Dummy 设备列表为空');
  await transport.open(device);
  return { transport, protocol: new ViaProtocol(transport) };
}

describe('qa-regression · getLayerCount 不得静默返回 0 层', () => {
  it('最小复现：固件报告 0 层时，getLayerCount 必须抛错而不是返回 0', async () => {
    const { protocol } = await setup({ layerCount: 0 });
    await expect(protocol.getLayerCount()).rejects.toThrow();
  });

  it('回显整体错位 1 字节时，getLayerCount 必须抛错而不是返回 0', async () => {
    const { protocol } = await setup({ echoOffset: 1 });
    await expect(protocol.getLayerCount()).rejects.toThrow();
  });

  it('正对照：合法层数（4 层）正常返回，不得误伤', async () => {
    const { protocol } = await setup({ layerCount: 4 });
    await expect(protocol.getLayerCount()).resolves.toBe(4);
  });

  it('边界：1 层是合法最小值，必须返回 1 而不是被判为异常', async () => {
    const { protocol } = await setup({ layerCount: 1 });
    await expect(protocol.getLayerCount()).resolves.toBe(1);
  });
});
