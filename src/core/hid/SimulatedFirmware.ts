// 模拟固件：Dummy 设备的状态机。收发 32 字节原始帧，语义与真实 VIA 固件对齐（架构附录 A）。
import {
  VIA_CMD,
  KB_VALUE_ID,
  KEYCODES_VERSION_PROTOCOL_MIN,
  MIN_PROTOCOL_VERSION,
} from '@/core/protocol/constants';
import { MSG_LEN } from './HidTransport';
// 地址键必须复用协议层的单一事实来源（QA 缺陷 A）：
// 旧实现用 `[channel, valueId, ...indexes].join(':')`，与 addressKey 的 `indexes.join('.')` 不一致，
// 导致 content 长度为 5（二维索引，形如 [n][k]）的控件读写落到降级地址。
import { addressKey } from '@/core/protocol/CustomValueCodec';

export interface MatrixPosLike {
  readonly row: number;
  readonly col: number;
}

export interface FirmwareConfig {
  readonly rows: number;
  readonly cols: number;
  readonly layerCount: number;
  readonly protocolVersion: number;
  readonly firmwareVersion: number;
  /** 键码字典版本（BCD），协议 ≥ 13 时由主机读取 */
  readonly keycodesVersion: number;
  readonly layoutOptions: number;
  /** 人为延迟（ms），用于触发 TimeoutError */
  readonly latencyMs: number;
  /** 丢包率 [0,1)，用于触发 TimeoutError */
  readonly dropRate: number;
  /** 命中这些 channel 的自定义值命令一律回显 0xFF */
  readonly unhandledChannels: readonly number[];
  /** 回显整体偏移 N 字节，用于模拟「方言错位」 */
  readonly echoOffset: number;
}

export const DEFAULT_FIRMWARE_CONFIG: FirmwareConfig = {
  rows: 5,
  cols: 15,
  layerCount: 4,
  protocolVersion: MIN_PROTOCOL_VERSION,
  firmwareVersion: 0x0001_0000,
  keycodesVersion: 0x0000_0009,
  layoutOptions: 0,
  latencyMs: 0,
  dropRate: 0,
  unhandledChannels: [],
  echoOffset: 0,
};

/** 通用 QWERTY 键码序列（HID usage 页 0x00），用于给 Dummy 铺一层可读的默认键位。 */
const DEFAULT_LAYOUT_KEYCODES: readonly number[] = [
  0x0029, 0x001e, 0x001f, 0x0020, 0x0021, 0x0022, 0x0023, 0x0024, 0x0025, 0x0026, 0x0027, 0x002d,
  0x002e, 0x002a, 0x002b, 0x0014, 0x001a, 0x0008, 0x0015, 0x0017, 0x001c, 0x0018, 0x000c, 0x0012,
  0x0013, 0x002f, 0x0030, 0x0031, 0x0039, 0x0004, 0x0016, 0x0007, 0x0009, 0x000a, 0x000b, 0x000d,
  0x000e, 0x000f, 0x0033, 0x0034, 0x0028, 0x0005, 0x0011, 0x0010, 0x002c, 0x0006, 0x0019, 0x001d,
  0x001b, 0x002f, 0x0035, 0x0036, 0x0037, 0x0038, 0xe001, 0xe000, 0xe002, 0xe003, 0x002c, 0x002c,
];

const KC_NO = 0x0000;
const KC_TRNS = 0x0001;
/** 未预置地址的默认回显宽度（真实固件按 channel 语义决定，Dummy 取 2 以覆盖多数场景）。 */
const DEFAULT_VALUE_WIDTH = 2;
/** VIA 宏缓冲区总字节数（与 GET_BUFFER_SIZE 桩值 0x40 一致）。16 个宏槽共享这段缓冲区。 */
const DEFAULT_MACRO_BUFFER_SIZE = 0x40;

/** Dummy 固件：keymap 三维数组 + layoutOptions + customValues + EEPROM 快照。 */
export class SimulatedFirmware {
  readonly config: FirmwareConfig;
  readonly keymap: Uint16Array;
  readonly customValues: Map<string, number>;
  readonly customWidths: Map<string, number>;
  readonly eeprom: Map<string, number>;
  /** VIA 宏缓冲区：16 个宏槽共享，按 0x00 结尾片段组织（架构 §VIA-MACRO）。 */
  readonly macroBuffer: Uint8Array;
  /**
   * 固件「认识」的地址集合（规范化后的地址键）。
   * ⚠️ 真实固件的地址空间是编译期确定的，EEPROM 复位只清用户数据、不会让固件忘记地址。
   * 没有这张表时，复位后 Dummy 会对二维索引地址退化解析（少回显索引字节），
   * 触发第二道防线误报 EchoParamMismatchError，导致「复位 → 重新读取」整条链路不可用。
   */
  readonly addressShapes: Set<string>;
  layoutOptions: number;
  private readonly uptimeBase = Date.now();

  constructor(config: Partial<FirmwareConfig> = {}) {
    this.config = { ...DEFAULT_FIRMWARE_CONFIG, ...config };
    this.keymap = new Uint16Array(this.config.layerCount * this.config.rows * this.config.cols);
    this.customValues = new Map();
    this.customWidths = new Map();
    this.eeprom = new Map();
    this.addressShapes = new Set();
    this.layoutOptions = this.config.layoutOptions;
    this.macroBuffer = new Uint8Array(DEFAULT_MACRO_BUFFER_SIZE);
    this.resetKeymap();
  }

  /** 用默认布局重建全部层：layer0 = QWERTY 序列，其余层全透明。 */
  resetKeymap(): void {
    const { rows, cols } = this.config;
    this.keymap.fill(KC_TRNS);
    for (let i = 0; i < rows * cols; i += 1) {
      this.keymap[i] = DEFAULT_LAYOUT_KEYCODES[i] ?? KC_NO;
    }
  }

  /**
   * 按定义文件的键位顺序重新铺 layer0——使 Dummy 的默认键位与键位图视觉顺序一致。
   * 传入顺序来自 definition.keys 的 matrix 坐标。
   */
  seedLayer0(order: readonly MatrixPosLike[]): void {
    const { rows, cols } = this.config;
    this.keymap.fill(KC_TRNS);
    order.forEach((pos, i) => {
      if (pos.row < rows && pos.col < cols) {
        this.keymap[pos.row * cols + pos.col] = DEFAULT_LAYOUT_KEYCODES[i] ?? KC_NO;
      }
    });
  }

  /** 预置一个自定义值（同时写入内存与 EEPROM 快照），width 决定 GET 回显字节数。 */
  seedValue(key: string, value: number, width: number = DEFAULT_VALUE_WIDTH): void {
    // 按调用方传入的字面量入库（不做规范化）：固件只认 canonical 形态，
    // 用旧拼法播种的地址因此不会被解析命中——这正是「修复不可回退」的反向守卫。
    this.addressShapes.add(key);
    this.customValues.set(key, value >>> 0);
    this.customWidths.set(key, width);
    this.eeprom.set(key, value >>> 0);
  }

  private index(layer: number, row: number, col: number): number {
    return (layer * this.config.rows + row) * this.config.cols + col;
  }

  getKeycode(layer: number, row: number, col: number): number {
    return this.keymap[this.index(layer, row, col)] ?? KC_NO;
  }

  setKeycode(layer: number, row: number, col: number, keycode: number): void {
    this.keymap[this.index(layer, row, col)] = keycode & 0xffff;
  }

  /** 处理一帧请求，返回 32 字节响应（未识别命令按真实固件行为置首字节 0xFF）。 */
  handle(request: Uint8Array): Uint8Array {
    const cmd = request[0] ?? 0;

    // 模拟「方言错位」：整体左移 echoOffset 字节，制造回显前缀不匹配。
    if (this.config.echoOffset > 0) {
      const shifted = new Uint8Array(MSG_LEN);
      for (let i = 0; i < MSG_LEN - this.config.echoOffset; i += 1) {
        shifted[i] = request[i + this.config.echoOffset] ?? 0;
      }
      return shifted;
    }

    switch (cmd) {
      case VIA_CMD.GET_PROTOCOL_VERSION:
        return this.reply([
          VIA_CMD.GET_PROTOCOL_VERSION,
          0x00,
          (this.config.protocolVersion >> 8) & 0xff,
          this.config.protocolVersion & 0xff,
        ]);
      case VIA_CMD.GET_KEYBOARD_VALUE:
        return this.handleGetKeyboardValue(request);
      case VIA_CMD.SET_KEYBOARD_VALUE:
        return this.handleSetKeyboardValue(request);
      case VIA_CMD.KEYMAP_GET_KEYCODE:
        return this.handleGetKeycode(request);
      case VIA_CMD.KEYMAP_SET_KEYCODE:
        return this.handleSetKeycode(request);
      case VIA_CMD.KEYMAP_RESET:
        this.resetKeymap();
        return this.reply([VIA_CMD.KEYMAP_RESET]);
      case VIA_CMD.KEYMAP_GET_LAYER_COUNT:
        return this.reply([VIA_CMD.KEYMAP_GET_LAYER_COUNT, this.config.layerCount & 0xff]);
      case VIA_CMD.KEYMAP_GET_BUFFER:
        return this.handleGetBuffer(request);
      case VIA_CMD.KEYMAP_SET_BUFFER:
        return this.handleSetBuffer(request);
      case VIA_CMD.CUSTOM_GET_VALUE:
        return this.handleCustomGet(request);
      case VIA_CMD.CUSTOM_SET_VALUE:
        return this.handleCustomSet(request);
      case VIA_CMD.CUSTOM_SAVE:
        return this.handleCustomSave(request);
      case VIA_CMD.EEPROM_RESET:
        // 只清用户数据：值 + EEPROM 快照 + 键位。
        // customWidths 与 addressShapes 描述的是固件的地址布局，属于固件实现而非用户数据，
        // 复位后必须保留（否则固件会「忘记」二维索引地址，回显参数区长度就错了）。
        this.customValues.clear();
        this.eeprom.clear();
        this.resetKeymap();
        this.layoutOptions = this.config.layoutOptions;
        return this.reply([VIA_CMD.EEPROM_RESET]);
      case VIA_CMD.BOOTLOADER_JUMP:
        return this.reply([VIA_CMD.BOOTLOADER_JUMP]);
      case VIA_CMD.MACRO_GET_COUNT:
        return this.reply([VIA_CMD.MACRO_GET_COUNT, 16]);
      case VIA_CMD.MACRO_GET_BUFFER_SIZE:
        return this.reply([
          VIA_CMD.MACRO_GET_BUFFER_SIZE,
          (this.macroBuffer.length >> 8) & 0xff,
          this.macroBuffer.length & 0xff,
        ]);
      case VIA_CMD.MACRO_GET_BUFFER:
        return this.handleGetMacroBuffer(request);
      case VIA_CMD.MACRO_SET_BUFFER:
        return this.handleSetMacroBuffer(request);
      default:
        return this.unhandled(request);
    }
  }

  private handleGetKeyboardValue(request: Uint8Array): Uint8Array {
    const valueId = request[1] ?? 0;
    const value = this.readKeyboardValue(valueId);
    return this.reply([
      VIA_CMD.GET_KEYBOARD_VALUE,
      valueId,
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    ]);
  }

  private handleSetKeyboardValue(request: Uint8Array): Uint8Array {
    const valueId = request[1] ?? 0;
    const value =
      (((request[2] ?? 0) << 24) |
        ((request[3] ?? 0) << 16) |
        ((request[4] ?? 0) << 8) |
        (request[5] ?? 0)) >>>
      0;
    if (valueId === KB_VALUE_ID.LAYOUT_OPTIONS) {
      this.layoutOptions = value;
    }
    return this.reply(Array.from(request.subarray(0, 6)));
  }

  private handleGetKeycode(request: Uint8Array): Uint8Array {
    const layer = request[1] ?? 0;
    const row = request[2] ?? 0;
    const col = request[3] ?? 0;
    const kc = this.getKeycode(layer, row, col);
    return this.reply([VIA_CMD.KEYMAP_GET_KEYCODE, layer, row, col, (kc >> 8) & 0xff, kc & 0xff]);
  }

  private handleSetKeycode(request: Uint8Array): Uint8Array {
    const layer = request[1] ?? 0;
    const row = request[2] ?? 0;
    const col = request[3] ?? 0;
    const kc = ((request[4] ?? 0) << 8) | (request[5] ?? 0);
    this.setKeycode(layer, row, col, kc);
    return this.reply([VIA_CMD.KEYMAP_SET_KEYCODE, layer, row, col, (kc >> 8) & 0xff, kc & 0xff]);
  }

  private handleGetBuffer(request: Uint8Array): Uint8Array {
    const offset = ((request[1] ?? 0) << 8) | (request[2] ?? 0);
    const size = Math.min(request[3] ?? 0, MSG_LEN - 4);
    const out = [VIA_CMD.KEYMAP_GET_BUFFER, (offset >> 8) & 0xff, offset & 0xff, size];
    for (let i = 0; i < size; i += 1) {
      out.push(this.keymapByteAt(offset + i));
    }
    return this.reply(out);
  }

  private handleSetBuffer(request: Uint8Array): Uint8Array {
    const offset = ((request[1] ?? 0) << 8) | (request[2] ?? 0);
    const size = Math.min(request[3] ?? 0, MSG_LEN - 4);
    for (let i = 0; i + 1 < size; i += 2) {
      const hi = request[4 + i] ?? 0;
      const lo = request[5 + i] ?? 0;
      const keyIndex = Math.floor((offset + i) / 2);
      if (keyIndex >= 0 && keyIndex < this.keymap.length) {
        this.keymap[keyIndex] = ((hi & 0xff) << 8) | (lo & 0xff);
      }
    }
    return this.reply(Array.from(request.subarray(0, 4 + size)));
  }

  /** 0x0e：按偏移从宏缓冲区取片段（默认全 0）。 */
  private handleGetMacroBuffer(request: Uint8Array): Uint8Array {
    const offset = ((request[1] ?? 0) << 8) | (request[2] ?? 0);
    const size = Math.min(request[3] ?? 0, MSG_LEN - 4);
    const out = [VIA_CMD.MACRO_GET_BUFFER, (offset >> 8) & 0xff, offset & 0xff, size];
    for (let i = 0; i < size; i += 1) {
      out.push(this.macroBuffer[offset + i] ?? 0);
    }
    return this.reply(out);
  }

  /** 0x0f：按偏移把请求载荷写入宏缓冲区。 */
  private handleSetMacroBuffer(request: Uint8Array): Uint8Array {
    const offset = ((request[1] ?? 0) << 8) | (request[2] ?? 0);
    const size = Math.min(request[3] ?? 0, MSG_LEN - 4);
    for (let i = 0; i < size; i += 1) {
      const idx = offset + i;
      if (idx >= 0 && idx < this.macroBuffer.length) {
        this.macroBuffer[idx] = request[4 + i] ?? 0;
      }
    }
    return this.reply(Array.from(request.subarray(0, 4 + size)));
  }

  /** 按字节偏移取键码的某一个字节（高位在前，大端）。 */
  private keymapByteAt(byteOffset: number): number {
    const keyIndex = Math.floor(byteOffset / 2);
    const kc = this.keymap[keyIndex] ?? KC_NO;
    return byteOffset % 2 === 0 ? (kc >> 8) & 0xff : kc & 0xff;
  }

  private handleCustomGet(request: Uint8Array): Uint8Array {
    const channel = request[1] ?? 0;
    if (this.config.unhandledChannels.includes(channel)) return this.unhandled(request);
    const { key, indexes } = this.resolveAddress(request);
    const width = this.customWidths.get(key) ?? DEFAULT_VALUE_WIDTH;
    const value = this.customValues.get(key) ?? 0;
    const bytes = [VIA_CMD.CUSTOM_GET_VALUE, channel, request[2] ?? 0, ...indexes];
    for (let b = width - 1; b >= 0; b -= 1) {
      bytes.push((value >>> (b * 8)) & 0xff);
    }
    return this.reply(bytes);
  }

  private handleCustomSet(request: Uint8Array): Uint8Array {
    const channel = request[1] ?? 0;
    if (this.config.unhandledChannels.includes(channel)) return this.unhandled(request);
    const { key, indexes, valueStart } = this.resolveAddress(request);
    // 真实固件按 channel 语义知道值宽度；Dummy 用预置宽度表，未预置时取默认值。
    const width = this.customWidths.get(key) ?? DEFAULT_VALUE_WIDTH;
    const valueBytes = Array.from(request.subarray(valueStart, valueStart + width));
    let value = 0;
    for (const b of valueBytes) value = ((value << 8) | (b & 0xff)) >>> 0;
    if (valueBytes.length > 0) this.customWidths.set(key, Math.min(4, valueBytes.length));
    this.addressShapes.add(key);
    this.customValues.set(key, value);
    return this.reply([VIA_CMD.CUSTOM_SET_VALUE, channel, request[2] ?? 0, ...indexes, ...valueBytes]);
  }

  private handleCustomSave(request: Uint8Array): Uint8Array {
    const channel = request[1] ?? 0;
    if (this.config.unhandledChannels.includes(channel)) return this.unhandled(request);
    const { key, indexes } = this.resolveAddress(request);
    // 真实固件语义：save 把该地址（含同前缀）的内存值刷入 EEPROM。
    for (const [k, v] of this.customValues) {
      if (k === key || k.startsWith(`${key}:`)) this.eeprom.set(k, v);
    }
    if (!this.eeprom.has(key) && this.customValues.has(key)) {
      this.eeprom.set(key, this.customValues.get(key) ?? 0);
    }
    return this.reply([VIA_CMD.CUSTOM_SAVE, channel, request[2] ?? 0, ...indexes]);
  }

  /**
   * 从请求帧反解值地址：按「最长前缀匹配已预置的 key」确定索引字节数。
   * 真实固件按 channel 语义知道索引个数；Dummy 用已知 key 表反推，未命中时退化为无索引。
   *
   * ⚠️ 地址键一律由 CustomValueCodec.addressKey 生成（QA 缺陷 A 的根治，单一事实来源）：
   * 历史上这里用 `[channel, valueId, ...indexes].join(':')` 自己拼键，
   * 而 addressKey 用 `indexes.join('.')` —— 两种拼法在 0/1 个索引时偶然一致、
   * 在 2 个索引时必然不等，导致二维索引控件（content 长度 5）读写全错。
   * 现在不再各拼各的：外部以任何拼法传入的 key 都会先被规范化成 addressKey 形态再入库，
   * 比对时只认这一种形态（旧拼法一律不认，防止修复被回退）。
   */
  private resolveAddress(request: Uint8Array): {
    key: string;
    indexes: number[];
    valueStart: number;
  } {
    const channel = request[1] ?? 0;
    const valueId = request[2] ?? 0;
    const tail = Array.from(request.subarray(3, 7));
    for (let n = Math.min(3, tail.length); n >= 0; n -= 1) {
      const indexes = tail.slice(0, n);
      const key = addressKey({ channel, valueId, indexes, key: '' });
      if (this.addressShapes.has(key) || this.customValues.has(key) || this.customWidths.has(key)) {
        return { key, indexes, valueStart: 3 + n };
      }
    }
    // 未预置的地址：退化为「无索引」，值字节从 data[3] 开始。
    return { key: addressKey({ channel, valueId, indexes: [], key: '' }), indexes: [], valueStart: 3 };
  }

  private readKeyboardValue(valueId: number): number {
    switch (valueId) {
      case KB_VALUE_ID.UPTIME:
        return Math.floor((Date.now() - this.uptimeBase) / 1000);
      case KB_VALUE_ID.LAYOUT_OPTIONS:
        return this.layoutOptions >>> 0;
      case KB_VALUE_ID.SWITCH_MATRIX_STATE:
        return 0;
      case KB_VALUE_ID.FIRMWARE_VERSION:
        return this.config.firmwareVersion >>> 0;
      case KB_VALUE_ID.DEVICE_INDICATION:
        return 0;
      case KB_VALUE_ID.KEYCODES_VERSION:
        // 键码字典版本为 BCD 编码；协议 ≥ 13 时主机必须先读它再选键码字典
        return this.config.protocolVersion >= KEYCODES_VERSION_PROTOCOL_MIN
          ? this.config.keycodesVersion
          : 0;
      default:
        return 0;
    }
  }

  private reply(bytes: number[]): Uint8Array {
    const out = new Uint8Array(MSG_LEN);
    for (let i = 0; i < Math.min(bytes.length, MSG_LEN); i += 1) out[i] = bytes[i] ?? 0;
    return out;
  }

  private unhandled(request: Uint8Array): Uint8Array {
    const out = new Uint8Array(MSG_LEN);
    out.set(request.subarray(0, MSG_LEN));
    out[0] = VIA_CMD.UNHANDLED;
    return out;
  }
}
