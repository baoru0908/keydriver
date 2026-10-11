// 可控制设备过滤（官方 VIA 口径）：isViaHidDevice / filterControllableDevices / knownIdKey。
//
// 这些用例锁的是「过滤口径」本身，而不是某个具体键盘：
//   ① VIA usage 不在 collections[0] 时必须照样认（真实键盘普遍如此，只看 [0] 是历史 bug）；
//   ② 只有普通键盘 usage 的鼠标/手柄不得混进来；
//   ③ includeAll 是调试旁路，过滤态只留「声明了 VIA usage」或「已登记定义」的设备，且前者排前。
import { describe, expect, it } from 'vitest';
import type { HidDeviceInfo } from '@/core/hid/HidTransport';
import { VIA_USAGE, VIA_USAGE_PAGE } from '@/core/hid/HidTransport';
import {
  VIA_HID_FILTERS,
  filterControllableDevices,
  isViaHidDevice,
  knownIdKey,
} from '@/core/hid/viaFilter';

/** 构造最小可用的设备描述（只填过滤会读到的字段）。 */
function mkInfo(id: string, vendorId: number, productId: number, viaCapable?: boolean): HidDeviceInfo {
  return {
    id,
    vendorId,
    productId,
    productName: id,
    ...(viaCapable === undefined ? {} : { viaCapable }),
    kind: 'webhid',
  };
}

describe('isViaHidDevice · 遍历全部 collections', () => {
  it('VIA usage 在 collections[1]（而非 [0]）时返回 true', () => {
    expect(
      isViaHidDevice({
        collections: [
          { usagePage: 0x01, usage: 0x06 }, // 标准键盘接口，排在最前
          { usagePage: VIA_USAGE_PAGE, usage: VIA_USAGE }, // VIA RAW HID 接口
        ],
      }),
    ).toBe(true);
  });

  it('VIA usage 在 collections[0] 时同样返回 true（回归保护）', () => {
    expect(
      isViaHidDevice({
        collections: [
          { usagePage: VIA_USAGE_PAGE, usage: VIA_USAGE },
          { usagePage: 0x01, usage: 0x06 },
        ],
      }),
    ).toBe(true);
  });

  it('只有普通键盘 usage（0x01 / 0x06）时返回 false', () => {
    expect(isViaHidDevice({ collections: [{ usagePage: 0x01, usage: 0x06 }] })).toBe(false);
  });

  it('usage page 对但 usage 不对（0xFF60 / 0x62）时返回 false', () => {
    expect(isViaHidDevice({ collections: [{ usagePage: VIA_USAGE_PAGE, usage: VIA_USAGE + 1 }] })).toBe(false);
  });

  it('无任何 collection 时返回 false（不抛异常）', () => {
    expect(isViaHidDevice({})).toBe(false);
    expect(isViaHidDevice({ collections: [] })).toBe(false);
  });
});

describe('VIA_HID_FILTERS · 授权过滤器', () => {
  it('只含一条 VIA RAW HID usage 过滤器', () => {
    expect(VIA_HID_FILTERS).toEqual([{ usagePage: VIA_USAGE_PAGE, usage: VIA_USAGE }]);
  });
});

describe('knownIdKey · 已登记定义键', () => {
  it('十进制拼接 "vid:pid"', () => {
    expect(knownIdKey(0x1234, 0x5678)).toBe('4660:22136');
    expect(knownIdKey(0, 0)).toBe('0:0');
  });
});

const VIA_KEYBOARD = mkInfo('via', 0x1234, 0x0001, true);
const PLAIN_MOUSE = mkInfo('mouse', 0x1234, 0x0002, false);
const KNOWN_FIRMWARE = mkInfo('known', 0x1234, 0x0003, false);

describe('filterControllableDevices · 过滤与排序', () => {
  it('includeAll = true 时不过滤，且保持原顺序', () => {
    const infos = [PLAIN_MOUSE, VIA_KEYBOARD, KNOWN_FIRMWARE];
    expect(filterControllableDevices(infos, { includeAll: true })).toEqual(infos);
  });

  it('默认过滤：只保留 viaCapable 或命中 knownIds 的设备', () => {
    const out = filterControllableDevices([PLAIN_MOUSE, VIA_KEYBOARD, KNOWN_FIRMWARE], {
      knownIds: [knownIdKey(KNOWN_FIRMWARE.vendorId, KNOWN_FIRMWARE.productId)],
    });
    expect(out.map((d) => d.id)).toEqual(['via', 'known']);
  });

  it('未命中 knownIds 且未声明 VIA usage 的设备被过滤掉', () => {
    const out = filterControllableDevices([PLAIN_MOUSE, VIA_KEYBOARD]);
    expect(out.map((d) => d.id)).toEqual(['via']);
  });

  it('viaCapable 排在命中 knownIds 的设备之前（其余保持原顺序）', () => {
    const knownA = mkInfo('known-a', 0x2000, 0x0001, false);
    const knownB = mkInfo('known-b', 0x2000, 0x0002, false);
    const infos = [knownA, PLAIN_MOUSE, knownB, VIA_KEYBOARD];
    const out = filterControllableDevices(infos, {
      knownIds: [knownIdKey(knownA.vendorId, knownA.productId), knownIdKey(knownB.vendorId, knownB.productId)],
    });
    expect(out.map((d) => d.id)).toEqual(['via', 'known-a', 'known-b']);
  });

  it('无选项、无 viaCapable 时结果为空', () => {
    expect(filterControllableDevices([PLAIN_MOUSE])).toEqual([]);
  });

  it('不修改传入数组（返回新数组）', () => {
    const infos = [PLAIN_MOUSE, VIA_KEYBOARD];
    const out = filterControllableDevices(infos);
    expect(out).not.toBe(infos);
    expect(infos.map((d) => d.id)).toEqual(['mouse', 'via']);
  });
});
