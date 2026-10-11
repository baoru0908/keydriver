// 可控制设备过滤（官方 VIA 口径）：只把「我们能用 VIA 协议控制」的键盘列给用户。
//
// 官方 VIA（the-via/app）的 filterHIDDevices 判定：遍历 device.collections，
// 只要**任意一个** collection 声明了 VIA 的 RAW HID usage（0xFF60 / 0x61）就算可控制。
// 本项目照搬该口径，并补充一条「已登记定义」白名单：设备的 VID/PID 命中定义库里
// 已保存的定义，同样视为可控制（覆盖固件未规范声明 usage 的情况）。
//
// ⚠️ 必须遍历全部 collections，不能只看 collections[0]：
// 真实键盘普遍把标准键盘接口（usagePage 0x01 / usage 0x06）排在第一个 collection，
// VIA 的 RAW HID 接口排在后面。只看第 0 个会把这些设备误判成不可控制，
// 症状就是「官方 VIA 能识别、我们不行」。
import { VIA_USAGE_PAGE, VIA_USAGE, type HidDeviceInfo } from './HidTransport';

/** 传给 navigator.hid.requestDevice() 的过滤器：只列出声明了 VIA RAW HID usage 的设备。 */
export const VIA_HID_FILTERS: HIDDeviceFilter[] = [{ usagePage: VIA_USAGE_PAGE, usage: VIA_USAGE }];

/** 过滤函数只依赖 collection 的 usage 字段，便于单测用裸对象构造夹具。 */
export interface UsageCollectionCandidate {
  readonly collections?: readonly {
    readonly usagePage?: number;
    readonly usage?: number;
  }[];
}

/** 是否声明了 VIA 的 RAW HID usage（遍历全部 collections，命中任意一个即真）。 */
export function isViaHidDevice(candidate: UsageCollectionCandidate): boolean {
  for (const collection of candidate.collections ?? []) {
    if (collection.usagePage === VIA_USAGE_PAGE && collection.usage === VIA_USAGE) return true;
  }
  return false;
}

/** 已登记定义的键：`"${vendorId}:${productId}"`（十进制，与定义库的 VID/PID 数值口径一致）。 */
export function knownIdKey(vendorId: number, productId: number): string {
  return `${vendorId}:${productId}`;
}

/**
 * 过滤出「可控制」的设备。
 *
 * 保留条件（满足任一）：
 *   ① includeAll === true —— 调试/救急旁路，不过滤；
 *   ② info.viaCapable === true —— 固件声明了 VIA RAW HID usage；
 *   ③ VID/PID 命中 knownIds —— 定义库里已登记过该设备。
 *
 * 排序：viaCapable 的排在最前，其余保持传入顺序（不引入额外抖动）。
 */
export function filterControllableDevices(
  infos: readonly HidDeviceInfo[],
  opts: { readonly includeAll?: boolean; readonly knownIds?: readonly string[] } = {},
): HidDeviceInfo[] {
  if (opts.includeAll === true) return [...infos];
  const knownIds = new Set(opts.knownIds ?? []);
  const viaCapableList: HidDeviceInfo[] = [];
  const knownList: HidDeviceInfo[] = [];
  for (const info of infos) {
    const isVia = info.viaCapable === true;
    const isKnown = knownIds.has(knownIdKey(info.vendorId, info.productId));
    if (!isVia && !isKnown) continue;
    if (isVia) viaCapableList.push(info);
    else knownList.push(info);
  }
  return [...viaCapableList, ...knownList];
}
