// 自定义值帧编解码单测：content 长度 3/4/5 往返一致、地址键稳定、前缀校验（架构 T02.1）。
import { describe, expect, it } from 'vitest';
import {
  addressKey,
  decodeValue,
  encodeAction,
  encodeGet,
  encodeSave,
  encodeSet,
  makeAddress,
  matchesPrefix,
  valueOffset,
} from '@/core/protocol/CustomValueCodec';
import { VIA_CMD } from '@/core/protocol/constants';
import { SimulatedFirmware } from '@/core/hid/SimulatedFirmware';
import { MSG_LEN } from '@/core/hid/HidTransport';

describe('CustomValueCodec · 地址键', () => {
  it('地址键格式稳定：`${channel}:${valueId}:${indexes.join(".")}`', () => {
    expect(addressKey(makeAddress(10, 1, [0, 3]))).toBe('10:1:0.3');
    expect(addressKey(makeAddress(0, 33, []))).toBe('0:33:');
    expect(addressKey(makeAddress(7, 12, [2]))).toBe('7:12:2');
  });

  it('值字节起始偏移随索引数量变化', () => {
    expect(valueOffset(makeAddress(1, 2, []))).toBe(3);
    expect(valueOffset(makeAddress(1, 2, [5]))).toBe(4);
    expect(valueOffset(makeAddress(1, 2, [5, 6]))).toBe(5);
  });
});

describe('CustomValueCodec · content 长度 3/4/5 往返', () => {
  const cases: { name: string; address: ReturnType<typeof makeAddress>; width: number }[] = [
    { name: '3 长度（无索引）', address: makeAddress(0, 1, []), width: 1 },
    { name: '4 长度（单索引）', address: makeAddress(9, 2, [3]), width: 2 },
    { name: '5 长度（双索引）', address: makeAddress(10, 1, [0, 3]), width: 2 },
  ];

  for (const c of cases) {
    it(`${c.name}：encodeSet → decodeValue 往返一致`, () => {
      const value = c.width === 1 ? 0x7f : 0x03ff;
      const frame = encodeSet(c.address, value, c.width);
      expect(frame).toHaveLength(MSG_LEN);
      expect(frame[0]).toBe(VIA_CMD.CUSTOM_SET_VALUE);
      expect(decodeValue(frame, c.address, c.width)).toBe(value);
    });

    it(`${c.name}：GET / SAVE 前缀正确`, () => {
      const get = encodeGet(c.address);
      expect(get[0]).toBe(VIA_CMD.CUSTOM_GET_VALUE);
      expect(matchesPrefix(get, c.address, VIA_CMD.CUSTOM_GET_VALUE)).toBe(true);
      const save = encodeSave(c.address);
      expect(save[0]).toBe(VIA_CMD.CUSTOM_SAVE);
      expect(matchesPrefix(save, c.address, VIA_CMD.CUSTOM_SAVE)).toBe(true);
    });
  }

  it('多字节值为大端', () => {
    const address = makeAddress(6, 1, []);
    const frame = encodeSet(address, 0x1234, 2);
    expect(frame[3]).toBe(0x12);
    expect(frame[4]).toBe(0x34);
    expect(decodeValue(frame, address, 2)).toBe(0x1234);
  });

  it('3 字节 color 保持分量原序', () => {
    const address = makeAddress(3, 7, []);
    const frame = encodeSet(address, 0x112233, 3);
    expect(frame[3]).toBe(0x11);
    expect(frame[4]).toBe(0x22);
    expect(frame[5]).toBe(0x33);
  });

  it('button 动作帧：options 原样透传（U3）', () => {
    const address = makeAddress(0, 4, []);
    const frame = encodeAction(address, [0]);
    expect(frame[0]).toBe(VIA_CMD.CUSTOM_SET_VALUE);
    expect(frame[3]).toBe(0x00);
    // options 为 null 时补 0x00
    expect(encodeAction(address, [])[3]).toBe(0x00);
  });

  it('前缀校验能识别方言错位（回显偏移）', () => {
    const address = makeAddress(9, 1, [2]);
    const request = encodeGet(address);
    const shifted = request.slice(1);
    expect(matchesPrefix(shifted, address, VIA_CMD.CUSTOM_GET_VALUE)).toBe(false);
  });
});

describe('CustomValueCodec · 与模拟固件联调', () => {
  it('写入后按同样宽度读回一致', () => {
    const firmware = new SimulatedFirmware({});
    const address = makeAddress(9, 1, [2]);
    firmware.seedValue(addressKey(address), 0x0104, 2);
    firmware.handle(encodeSet(address, 0x0231, 2));
    const response = firmware.handle(encodeGet(address));
    expect(matchesPrefix(response, address, VIA_CMD.CUSTOM_GET_VALUE)).toBe(true);
    expect(decodeValue(response, address, 2)).toBe(0x0231);
  });

  it('未识别命令回显首字节 0xFF', () => {
    const firmware = new SimulatedFirmware({});
    const response = firmware.handle(new Uint8Array(MSG_LEN).fill(0x77));
    expect(response[0]).toBe(VIA_CMD.UNHANDLED);
  });

  it('注入 unhandledChannels 时自定义值命令回显 0xFF', () => {
    const firmware = new SimulatedFirmware({ unhandledChannels: [9] });
    const response = firmware.handle(encodeGet(makeAddress(9, 1, [2])));
    expect(response[0]).toBe(VIA_CMD.UNHANDLED);
  });
});
