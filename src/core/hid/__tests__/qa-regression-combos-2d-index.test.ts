// 【QA 缺陷复现 · 暂定 P0】SimulatedFirmware 的地址键格式与 CustomValueCodec 不一致，
// 导致所有 content 长度为 5（二维索引，如 Combos 的 [n][k]）的控件在 Dummy 上读写错位。
//
// 复现依据（只读，不修源码）：
//   CustomValueCodec.addressKey → `${channel}:${valueId}:${indexes.join('.')}`  （10:1:2.3）
//   SimulatedFirmware.resolveAddress → `[channel, valueId, ...indexes].join(':')` （10:1:2:3）
//   两者在「0 / 1 个索引」时偶然一致，在「2 个及以上索引」时必然不等。
//
// 受影响面的精确边界（与严过关-2 交叉确认一致）：
//   0 索引：规范键 `X:Y:` 与 resolveAddress 的兜底键恰好相等 → 侥幸可用（不是匹配上了，是兜底撞对了）
//   1 索引：join('.') 与 join(':') 结果相同 → 正常
//   ≥2 索引：必然不等 → 全部坏（本文件即针对这 40 个控件）
// 因此影响面 = 定义文件中 40 个二维索引控件，不含 61 个 0 索引控件。
//
// 这不是「测试播种姿势不对」而是生产路径缺陷：DeviceFacade.seedDummy
// （src/core/device/DeviceFacade.ts:252-258）用 addressKey（点号键）为全部 349 个控件播种，
// 而 resolveAddress 查的是冒号键 → Dummy 一 connect，那 40 个控件的默认值就永不生效。
// 本文件最后一条用例走的就是这条生产路径（DeviceFacade.connect → seedDummy → 写 → 读）。
import { describe, expect, it } from 'vitest';
import { SimulatedFirmware } from '@/core/hid/SimulatedFirmware';
import { DummyTransport } from '@/core/hid/DummyTransport';
import { DeviceFacade } from '@/core/device/DeviceFacade';
import { addressKey, encodeGet, encodeSet, decodeValue, makeAddress } from '@/core/protocol/CustomValueCodec';
import { VIA_CMD } from '@/core/protocol/constants';
import { loadRealParsedDefinition } from '@/definition/__tests__/fixtures/realDefinition';
import type { ControlSpec } from '@/definition/schema';

const def = loadRealParsedDefinition();

async function connectDummy() {
  const transport = new DummyTransport({ rows: 5, cols: 15, layerCount: 4 });
  const [device] = await transport.listDevices();
  if (!device) throw new Error('Dummy 设备列表为空');
  await transport.open(device);
  const facade = new DeviceFacade(transport, device, { definition: def });
  await facade.connect();
  return { transport, facade };
}

describe('qa-regression · SimulatedFirmware 二维索引地址（Combos [n][k]）', () => {
  it('地址键格式的契约： SimulatedFirmware 必须沿用 CustomValueCodec.addressKey', () => {
    const firmware = new SimulatedFirmware({});
    const addr = makeAddress(10, 1, [2, 3]);
    firmware.seedValue(addressKey(addr), 0, 2);
    firmware.handle(encodeSet(addr, 0x5700, 2));
    const response = firmware.handle(encodeGet(addr));
    expect(response[0]).toBe(VIA_CMD.CUSTOM_GET_VALUE);
    // 期望：写进去的值能按同一地址读回来
    expect(decodeValue(response, addr, 2)).toBe(0x5700);
    // 期望：值必须落在定义地址键上，而不是被降级到别处
    expect(firmware.customValues.get(addressKey(addr))).toBe(0x5700);
  });

  it('二维索引的两个相邻地址不得互相污染', () => {
    const firmware = new SimulatedFirmware({});
    const a = makeAddress(10, 1, [0, 0]);
    const b = makeAddress(10, 1, [0, 1]);
    firmware.seedValue(addressKey(a), 0, 2);
    firmware.seedValue(addressKey(b), 0, 2);

    firmware.handle(encodeSet(a, 0x5700, 2));
    firmware.handle(encodeSet(b, 0x1234, 2));

    expect(decodeValue(firmware.handle(encodeGet(a)), a, 2)).toBe(0x5700);
    expect(decodeValue(firmware.handle(encodeGet(b)), b, 2)).toBe(0x1234);
  });

  it('已修复：父地址（1 索引）与子地址（2 索引）同时存在时不得串地址', () => {
    const firmware = new SimulatedFirmware({});
    const parent = makeAddress(10, 1, [2]);
    const child = makeAddress(10, 1, [2, 3]);
    firmware.seedValue(addressKey(parent), 0xaaaa, 2);
    firmware.seedValue(addressKey(child), 0xbbbb, 2);

    firmware.handle(encodeSet(child, 0x1234, 2));

    expect(firmware.customValues.get(addressKey(child))).toBe(0x1234);
    expect(firmware.customValues.get(addressKey(parent)), '父地址不得被写入').toBe(0xaaaa);
    expect(decodeValue(firmware.handle(encodeGet(parent)), parent, 2)).toBe(0xaaaa);
  });

  it('（残留限制）从未登记过的陌生二维地址：首次写入仍被按「0 索引」解析', () => {
    // SimulatedFirmware 只能从已注册地址（seedValue / 写过的）反推索引个数；
    // 真实固件是编译期静态知道的。生产路径 DeviceFacade.seedDummy 会先播种 349 个控件，
    // 因此不影响正常使用，但「未播种先写」的路径仍然降级——此处记录现状，供 M2 真机对照。
    const firmware = new SimulatedFirmware({});
    const two = makeAddress(10, 1, [2, 3]);
    firmware.handle(encodeSet(two, 0x5700, 2));
    expect(decodeValue(firmware.handle(encodeGet(two)), two, 2)).not.toBe(0x5700);
    // 一旦地址形状被登记（播种或写一次），后续即恢复正常
    firmware.seedValue(addressKey(two), 0, 2);
    firmware.handle(encodeSet(two, 0x5700, 2));
    expect(decodeValue(firmware.handle(encodeGet(two)), two, 2)).toBe(0x5700);
  });

  it('端到端（Dummy 全链路）：Combos 键码写入后必须能原值读回', async () => {
    const { facade } = await connectDummy();
    const combos = def.controls.filter(
      (c) => c.address.channel === 10 && c.address.indexes.length === 2,
    );
    expect(combos.length).toBeGreaterThan(0);

    const target = combos.find((c) => c.valueKey === 'id_dynamic_combos_keys[0][0]');
    const neighbour = combos.find((c) => c.valueKey === 'id_dynamic_combos_keys[0][1]');
    expect(target).toBeDefined();
    expect(neighbour).toBeDefined();
    if (!target || !neighbour) return;

    await facade.writeValueNow(target as ControlSpec, 0x5700);
    await expect(facade.readValue(target as ControlSpec)).resolves.toBe(0x5700);

    // 相邻键位不应被带着写坏
    await expect(facade.readValue(neighbour as ControlSpec)).resolves.toBe(0x0001);
  });
});
