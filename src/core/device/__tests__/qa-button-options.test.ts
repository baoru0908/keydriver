// QA 独立验证 · button 动作的「报文级」原样透传（高危点 5）。
// UI 上两个「应用并保存更改」长得一模一样，只有抓到的报文能证伪，这里走 DeviceFacade + Dummy 全链路抓帧。
//
// 分工：帧字节级的逐字节比对以严过关-2 的 `qa2-button-options.test.ts` 为准；
// 本文件只证明「生产路径（DeviceFacade.triggerAction → ViaProtocol.customTrigger）没有把 options 抹掉」，
// 即控件经解析归一化后 args 仍能原样到达报文。
import { describe, expect, it } from 'vitest';
import { DummyTransport } from '@/core/hid/DummyTransport';
import { DeviceFacade } from '@/core/device/DeviceFacade';
import { VIA_CMD } from '@/core/protocol/constants';
import { loadRealParsedDefinition } from '@/definition/__tests__/fixtures/realDefinition';
import type { FrameRecord } from '@/core/protocol/ViaProtocol';
import type { ControlSpec } from '@/definition/schema';

const def = loadRealParsedDefinition();

async function connect() {
  const frames: FrameRecord[] = [];
  const transport = new DummyTransport({});
  const [device] = await transport.listDevices();
  if (!device) throw new Error('Dummy 设备列表为空');
  await transport.open(device);
  const facade = new DeviceFacade(transport, device, {
    definition: def,
    onFrame: (r) => frames.push(r),
  });
  await facade.connect();
  return { transport, facade, frames };
}

/** 取某次请求的第一个 TX 帧的命令字节数组。 */
function txBytes(frame: FrameRecord): number[] {
  return frame.hex.split(' ').map((b) => Number.parseInt(b, 16));
}

describe('QA · button 动作落到报文上必须保留 options（高危点 5）', () => {
  it('options=[1] 的 button：0x07 帧参数字节为 01', async () => {
    const { facade, frames } = await connect();
    const button = def.controls.find(
      (c) =>
        c.type === 'button' &&
        c.options.kind === 'action' &&
        c.options.args.length === 1 &&
        c.options.args[0] === 1,
    );
    expect(button).toBeDefined();
    if (!button) return;

    frames.length = 0;
    await facade.triggerAction(button as ControlSpec);
    const tx = frames.find((f) => f.dir === 'tx');
    expect(tx?.commandId).toBe(VIA_CMD.CUSTOM_SET_VALUE);
    const bytes = txBytes(tx ?? { hex: '' } as FrameRecord);
    expect(bytes[0]).toBe(VIA_CMD.CUSTOM_SET_VALUE);
    expect(bytes[1]).toBe(button.address.channel);
    expect(bytes[2]).toBe(button.address.valueId);
    // ⚠️ 关键断言：不能被抹成 00
    expect(bytes[3]).toBe(0x01);
  });

  it('options=[0] 的 button：0x07 帧参数字节为 00', async () => {
    const { facade, frames } = await connect();
    const button = def.controls.find(
      (c) =>
        c.type === 'button' &&
        c.options.kind === 'action' &&
        c.options.args.join(',') === '0',
    );
    expect(button).toBeDefined();
    if (!button) return;
    frames.length = 0;
    await facade.triggerAction(button as ControlSpec);
    const bytes = txBytes(frames.find((f) => f.dir === 'tx') ?? ({ hex: '' } as FrameRecord));
    expect(bytes[3]).toBe(0x00);
  });

  it('options 字段缺失的 button：补 00，且不得被当成普通值写入宽度 0', async () => {
    const { facade, frames } = await connect();
    const button = def.controls.find(
      (c) => c.type === 'button' && c.options.kind === 'action' && c.options.args.length === 0,
    );
    expect(button).toBeDefined();
    if (!button) return;
    frames.length = 0;
    await facade.triggerAction(button as ControlSpec);
    const bytes = txBytes(frames.find((f) => f.dir === 'tx') ?? ({ hex: '' } as FrameRecord));
    expect(bytes[3]).toBe(0x00);
    expect(bytes).toHaveLength(32);
  });

  it('两个同 valueKey 的 button 必须能产出不同的报文，且都能正确执行', async () => {
    const { facade, frames } = await connect();
    const pair = def.controls.filter((c) => c.valueKey === 'id_save_threshold_data');
    expect(pair).toHaveLength(2);
    expect(pair[0]?.id).not.toBe(pair[1]?.id);

    const bytesOf = async (control: ControlSpec): Promise<number[]> => {
      frames.length = 0;
      await facade.triggerAction(control);
      return txBytes(frames.find((f) => f.dir === 'tx') ?? ({ hex: '' } as FrameRecord));
    };
    const first = await bytesOf(pair[0] as ControlSpec);
    const second = await bytesOf(pair[1] as ControlSpec);
    expect(first.slice(0, 3)).toEqual(second.slice(0, 3)); // 同一地址
    expect(first[3]).not.toBe(second[3]); // 但参数不同
  });

  it('传入显式 arg 时覆盖 options（但该控件必须是 action 类型）', async () => {
    const { facade, frames } = await connect();
    const button = def.controls.find(
      (c) => c.type === 'button' && c.options.kind === 'action' && c.options.args.length === 1,
    );
    expect(button).toBeDefined();
    if (!button) return;
    frames.length = 0;
    await facade.triggerAction(button as ControlSpec, 0x7f);
    const bytes = txBytes(frames.find((f) => f.dir === 'tx') ?? ({ hex: '' } as FrameRecord));
    expect(bytes[3]).toBe(0x7f);
  });

  it('对非 button 控件调用 triggerAction：退化为空 args（写 00），不抛异常', async () => {
    const { facade, frames } = await connect();
    const toggle = def.controls.find((c) => c.type === 'toggle');
    expect(toggle).toBeDefined();
    if (!toggle) return;
    frames.length = 0;
    await expect(facade.triggerAction(toggle as ControlSpec)).resolves.toBeUndefined();
    const bytes = txBytes(frames.find((f) => f.dir === 'tx') ?? ({ hex: '' } as FrameRecord));
    expect(bytes[3]).toBe(0x00);
  });
});
