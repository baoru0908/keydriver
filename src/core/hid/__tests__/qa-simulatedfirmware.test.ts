// QA 独立验证 · 模拟固件的故障注入语义（latencyMs / dropRate / unhandledChannels / echoOffset）。
import { describe, expect, it } from 'vitest';
import { SimulatedFirmware, DEFAULT_FIRMWARE_CONFIG } from '@/core/hid/SimulatedFirmware';
import { DummyTransport } from '@/core/hid/DummyTransport';
import { TimeoutError } from '@/core/hid/HidTransport';
import {
  encodeGet,
  encodeSave,
  encodeSet,
  decodeValue,
  makeAddress,
  addressKey,
} from '@/core/protocol/CustomValueCodec';
import { VIA_CMD, KB_VALUE_ID } from '@/core/protocol/constants';
import { MSG_LEN } from '@/core/hid/HidTransport';

async function openTransport(config: Partial<ConstructorParameters<typeof DummyTransport>[0]>) {
  const transport = new DummyTransport(config);
  const [device] = await transport.listDevices();
  if (!device) throw new Error('Dummy 设备列表为空');
  await transport.open(device);
  return transport;
}

describe('QA · SimulatedFirmware 默认行为', () => {
  it('默认配置：协议 v11 / 4 层 / 5×15 矩阵', () => {
    const firmware = new SimulatedFirmware({});
    expect(firmware.config.protocolVersion).toBe(DEFAULT_FIRMWARE_CONFIG.protocolVersion);
    expect(firmware.config.layerCount).toBe(4);
    expect(firmware.keymap).toHaveLength(4 * 5 * 15);
  });

  it('未知命令一律回显 0xFF（且其余字节原样回显请求）', () => {
    const firmware = new SimulatedFirmware({});
    const request = new Uint8Array(MSG_LEN);
    request[0] = 0x99;
    request[1] = 0x42;
    const response = firmware.handle(request);
    expect(response[0]).toBe(VIA_CMD.UNHANDLED);
    expect(response[1]).toBe(0x42);
  });

  it('未预置的自定义值默认为 2 字节宽、值为 0', () => {
    const firmware = new SimulatedFirmware({});
    const addr = makeAddress(1, 2, []);
    const response = firmware.handle(encodeGet(addr));
    expect(decodeValue(response, addr, 2)).toBe(0);
    expect(decodeValue(response, addr, 1)).toBe(0);
  });

  it('写内存 ≠ 落 EEPROM：只有 0x09 保存后才同步', () => {
    const firmware = new SimulatedFirmware({});
    const addr = makeAddress(4, 5, []);
    const key = addressKey(addr);
    firmware.seedValue(key, 0x11, 1); // seedDummy 的做法：同时写内存与 EEPROM 快照
    firmware.handle(encodeSet(addr, 0x2a, 1));

    expect(firmware.customValues.get(key)).toBe(0x2a);
    expect(firmware.eeprom.get(key), '未保存时 EEPROM 必须保持旧值').toBe(0x11);

    firmware.handle(encodeSave(addr));
    expect(firmware.eeprom.get(key), '0x09 之后才应刷新 EEPROM').toBe(0x2a);
  });

  it('（已知行为）未预置宽度的地址按 2 字节解释 → 用 1 字节写会读回 高位', () => {
    const firmware = new SimulatedFirmware({});
    const addr = makeAddress(4, 5, []);
    firmware.handle(encodeSet(addr, 0x2a, 1));
    // 真实固件按 channel 语义知道宽度；Dummy 未预置时取 DEFAULT_VALUE_WIDTH = 2
    expect(firmware.customValues.get(addressKey(addr))).toBe(0x2a00);
    expect(firmware.customWidths.get(addressKey(addr))).toBe(2);
  });

  it('eepromReset 清空内存值与 EEPROM 并把 layoutOptions 复位，但保留地址布局', () => {
    const firmware = new SimulatedFirmware({ layoutOptions: 0x1234 });
    const addr = makeAddress(4, 5, []);
    firmware.seedValue(addressKey(addr), 7, 1);
    firmware.layoutOptions = 0x9999;
    firmware.handle(new Uint8Array([VIA_CMD.EEPROM_RESET]));
    expect(firmware.customValues.size).toBe(0);
    expect(firmware.eeprom.size).toBe(0);
    expect(firmware.layoutOptions).toBe(0x1234);
    // ⚠️ customWidths / addressShapes 描述的是固件自身知道的地址布局，不是用户数据；
    //    真实固件 EEPROM 复位不会「忘记」地址，因此这两张表必须保留——
    //    否则复位后二维索引地址会被退化解析，回显少一个索引字节，触发 EchoParamMismatchError。
    expect(firmware.customWidths.size).toBeGreaterThan(0);
    expect(firmware.addressShapes.size).toBeGreaterThan(0);

    // 功能验证：复位后「已被播种过」的二维索引地址仍然读写正常（回显索引字节数不变）。
    // 注意前提：地址形状必须曾在 seedValue/写入时登记过——生产路径由 DeviceFacade.seedDummy
    // 在 connect 时把 349 个控件全部播种，因此复位后这些地址都能被正确解析。
    // （从未登记过的陌生地址仍会退化成无索引解析，这是 Dummy 反解地址的固有限制，非本次回归。）
    const two = makeAddress(10, 1, [2, 3]);
    firmware.seedValue(addressKey(two), 0x1111, 2);
    firmware.handle(new Uint8Array([VIA_CMD.EEPROM_RESET]));
    firmware.handle(encodeSet(two, 0x5700, 2));
    expect(decodeValue(firmware.handle(encodeGet(two)), two, 2)).toBe(0x5700);
  });

  it('布局选项通过 0x03 写入后可由 0x02 读回', () => {
    const firmware = new SimulatedFirmware({});
    const req = new Uint8Array(MSG_LEN);
    req[0] = VIA_CMD.SET_KEYBOARD_VALUE;
    req[1] = KB_VALUE_ID.LAYOUT_OPTIONS;
    req[5] = 0x1f;
    firmware.handle(req);
    expect(firmware.layoutOptions).toBe(0x1f);
    const getReq = new Uint8Array(MSG_LEN);
    getReq[0] = VIA_CMD.GET_KEYBOARD_VALUE;
    getReq[1] = KB_VALUE_ID.LAYOUT_OPTIONS;
    const resp = firmware.handle(getReq);
    expect(resp[5]).toBe(0x1f);
  });
});

describe('QA · 故障注入：unhandledChannels', () => {
  it('命中 channel 的自定义值命令回显 0xFF，其余 channel 正常', () => {
    const firmware = new SimulatedFirmware({ unhandledChannels: [3] });
    const inList = firmware.handle(encodeGet(makeAddress(3, 1, [])));
    const outList = firmware.handle(encodeGet(makeAddress(2, 1, [])));
    expect(inList[0]).toBe(VIA_CMD.UNHANDLED);
    expect(outList[0]).toBe(VIA_CMD.CUSTOM_GET_VALUE);
  });

  it('多个 channel 同时注入 / 空列表不影响任何 channel', () => {
    const multi = new SimulatedFirmware({ unhandledChannels: [1, 5, 9] });
    for (const ch of [1, 5, 9]) {
      expect(multi.handle(encodeGet(makeAddress(ch, 1, [])))[0]).toBe(VIA_CMD.UNHANDLED);
    }
    expect(multi.handle(encodeGet(makeAddress(0, 1, [])))[0]).toBe(VIA_CMD.CUSTOM_GET_VALUE);
  });
});

describe('QA · 故障注入：latencyMs / dropRate', () => {
  it('latencyMs < 超时：正常返回；latencyMs ≥ 超时：抛 TimeoutError', async () => {
    const fast = await openTransport({ latencyMs: 5, timeoutMs: 200 });
    await expect(fast.transfer(new Uint8Array([VIA_CMD.GET_PROTOCOL_VERSION]))).resolves.toBeDefined();

    const slow = await openTransport({ latencyMs: 300, timeoutMs: 10 });
    await expect(slow.transfer(new Uint8Array([VIA_CMD.GET_PROTOCOL_VERSION]))).rejects.toBeInstanceOf(
      TimeoutError,
    );
  });

  it('dropRate = 1：必丢包；dropRate = 0：不丢包', async () => {
    const always = await openTransport({ dropRate: 1 });
    await expect(always.transfer(new Uint8Array([VIA_CMD.GET_PROTOCOL_VERSION]))).rejects.toBeInstanceOf(
      TimeoutError,
    );
    const never = await openTransport({ dropRate: 0 });
    await expect(never.transfer(new Uint8Array([VIA_CMD.GET_PROTOCOL_VERSION]))).resolves.toBeDefined();
  });

  it('未 open 时抛传输错误（模拟拔线）', async () => {
    const transport = new DummyTransport({});
    await expect(transport.transfer(new Uint8Array(MSG_LEN))).rejects.toThrowError(/未连接/);
  });

  it('simulateDisconnect 触发回调且 isOpen 变 false', async () => {
    const transport = await openTransport({});
    const seen: string[] = [];
    transport.onDisconnect((info) => seen.push(info.id));
    transport.simulateDisconnect();
    expect(transport.isOpen).toBe(false);
    expect(seen).toHaveLength(1);
  });
});

describe('QA · 故障注入：echoOffset（方言错位）', () => {
  it('echoOffset = 1：整帧左移，响应首字节来自请求参数区', () => {
    const firmware = new SimulatedFirmware({ echoOffset: 1 });
    const request = encodeGet(makeAddress(9, 1, [2]));
    const response = firmware.handle(request);
    expect(response[0]).toBe(request[1]);
    expect(response[1]).toBe(request[2]);
    // 末字节补 0，帧长不变
    expect(response).toHaveLength(MSG_LEN);
    expect(response[MSG_LEN - 1]).toBe(0);
  });

  it('echoOffset > 0 时所有命令都被污染（含 0x01 取版本）', () => {
    const firmware = new SimulatedFirmware({ echoOffset: 2 });
    const request = new Uint8Array(MSG_LEN);
    request[0] = VIA_CMD.GET_PROTOCOL_VERSION;
    const response = firmware.handle(request);
    expect(response[0]).toBe(0);
    expect(Array.from(response)).toEqual(Array.from(request.slice(2)).concat(0, 0));
  });
});
