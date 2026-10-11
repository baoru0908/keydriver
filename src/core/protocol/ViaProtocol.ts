// VIA 协议封装：0x01–0x15 全命令、串行化队列、超时重试、原始报文记录（架构 §4.2.4）。
import type { ValueAddress } from '@/definition/schema';
import {
  DisconnectedError,
  MSG_LEN,
  SerialQueue,
  TimeoutError,
  TransportError,
  type HidTransport,
} from '@/core/hid/HidTransport';
import { echoMatches, frameToHex, isUnhandled } from '@/core/hid/frame';
import { VIA_CMD, KEYMAP_BUFFER_CHUNK, KB_VALUE_ID, MIN_PROTOCOL_VERSION } from './constants';
import {
  EchoParamMismatchError,
  IncompatibleProtocolError,
  ProtocolSanityError,
  UnhandledCommandError,
} from './errors';
import { decodeKeycode, encodeKeycode, readU16BE, readU32BE, writeU32BE } from './KeycodeCodec';
import {
  addressKey,
  encodeAction,
  encodeGet,
  encodeSave,
  encodeSet,
  matchesPrefix,
  valueOffset,
} from './CustomValueCodec';

export interface FrameRecord {
  readonly dir: 'tx' | 'rx';
  readonly hex: string;
  readonly at: number;
  readonly durationMs?: number;
  readonly commandId: number;
}

export interface ViaProtocolOptions {
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly onFrame?: (record: FrameRecord) => void;
}

/** 架构 §4.2.4 的协议接口（类 ViaProtocol 实现之）。 */
export interface ViaProtocolLike {
  getProtocolVersion(): Promise<number>;
  getKeyboardValue(valueId: number): Promise<number>;
  setKeyboardValue(valueId: number, value: number): Promise<void>;
  /** 0x02 + 0x06：键码字典版本（BCD，协议 ≥ 13 时握手必读） */
  getKeycodesVersion(): Promise<number>;
  getLayerCount(): Promise<number>;
  getKeycode(layer: number, row: number, col: number): Promise<number>;
  setKeycode(layer: number, row: number, col: number, keycode: number): Promise<void>;
  getKeymapBuffer(offset: number, size: number): Promise<Uint8Array>;
  setKeymapBuffer(offset: number, data: Uint8Array): Promise<void>;
  /** 0x0e：读取 VIA 宏缓冲区片段（按偏移 + 长度） */
  getMacroBuffer(offset: number, size: number): Promise<Uint8Array>;
  /** 0x0f：写入 VIA 宏缓冲区片段（按偏移 + 数据） */
  setMacroBuffer(offset: number, data: Uint8Array): Promise<void>;
  /** 0x0d：读取 VIA 宏缓冲区总字节数 */
  getMacroSize(): Promise<number>;
  customGetValue(addr: ValueAddress, width: number): Promise<number>;
  customSetValue(addr: ValueAddress, value: number, width: number): Promise<void>;
  customSave(addr: ValueAddress): Promise<void>;
  eepromReset(): Promise<void>;
  bootloaderJump(): Promise<void>;
  rawCommand(bytes: ArrayLike<number>): Promise<Uint8Array>;
}

export const DEFAULT_TIMEOUT_MS = 500;
export const DEFAULT_MAX_RETRIES = 2;

/**
 * 协议版本的可信上界。VIA 协议版本是 u16，但现实固件只到 v11–v13，
 * 一旦解析出 ≥ 0x0100 的数，几乎必然是「版本字段整体错位一个字节」的方言差异。
 */
export const MAX_PLAUSIBLE_PROTOCOL_VERSION = 0x00ff;

export class ViaProtocol implements ViaProtocolLike {
  private readonly queue = new SerialQueue();
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly onFrame?: (record: FrameRecord) => void;

  constructor(
    readonly transport: HidTransport,
    options: ViaProtocolOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.onFrame = options.onFrame;
  }

  /** 底层发帧：串行 + 重试 + 报文记录。0xFF 由调用方判定，不在此抛错。 */
  private async transfer(request: Uint8Array): Promise<Uint8Array> {
    const txAt = Date.now();
    const commandId = request[0] ?? 0;
    this.emit({ dir: 'tx', hex: frameToHex(request), at: txAt, commandId });
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.queue.enqueue(() => this.transport.transfer(request, this.timeoutMs));
        this.emit({
          dir: 'rx',
          hex: frameToHex(response),
          at: Date.now(),
          durationMs: Date.now() - txAt,
          commandId,
        });
        return response;
      } catch (e) {
        lastError = e;
        // 断开不需要重试；仅超时重试
        if (e instanceof DisconnectedError) break;
        if (!(e instanceof TimeoutError)) break;
      }
    }
    const hex = frameToHex(request);
    if (lastError instanceof TransportError) {
      lastError.rawHex = lastError.rawHex ?? hex;
      throw lastError;
    }
    throw new TimeoutError(`传输超时（已重试 ${this.maxRetries} 次）`, hex);
  }

  private emit(record: FrameRecord): void {
    this.onFrame?.(record);
  }

  /**
   * 响应有效性两道防线：
   *  ① resp[0] === 0xFF → 固件未识别该命令；
   *  ② resp 的参数区 === req 的参数区 → 参数回声一致（否则说明方言/帧格式不匹配）。
   * paramTo 为参数区结束下标（不含），载荷区不参与比对。
   */
  private assertValid(response: Uint8Array, request: Uint8Array, commandId: number, paramTo: number): Uint8Array {
    if (isUnhandled(response) && commandId !== VIA_CMD.UNHANDLED) {
      throw new UnhandledCommandError(commandId, frameToHex(response));
    }
    if (!echoMatches(response, request, 1, paramTo)) {
      throw new EchoParamMismatchError(commandId, frameToHex(response));
    }
    return response;
  }

  async getProtocolVersion(): Promise<number> {
    const req = frame([VIA_CMD.GET_PROTOCOL_VERSION]);
    const response = this.assertValid(
      await this.transfer(req),
      req,
      VIA_CMD.GET_PROTOCOL_VERSION,
      1,
    );
    // 架构 §8.2：u16 大端，位于 data[2..4]
    const version = decodeKeycode(response[2] ?? 0, response[3] ?? 0);
    // 方言兜底：部分固件把版本放在 data[1..3]。
    // ⚠️ 旧实现的兜底条件是 `version === 0`，对该方言永远不成立——
    // 该方言下 data[3] 恒为 0，主流解析会得到 lo<<8（如 v11 → 0x0B00 = 2816）≠ 0，
    // 于是 v11/v12/v13（高字节恒为 0）全被解错，且 2816 ≥ 13 会让握手误判为「需要读键码字典版本」。
    // 判定依据：真实协议版本恒 < 0x0100，一旦主流解析出高字节非零，即为方言错位。
    if (version === 0 || version > MAX_PLAUSIBLE_PROTOCOL_VERSION) {
      const alt = decodeKeycode(response[1] ?? 0, response[2] ?? 0);
      if (alt > 0 && alt <= MAX_PLAUSIBLE_PROTOCOL_VERSION) return alt;
      if (version > MAX_PLAUSIBLE_PROTOCOL_VERSION) {
        // 两种方言都解不出合理值：宁可报错，也不要把一个荒谬的版本号当真
        throw new IncompatibleProtocolError(version, frameToHex(response));
      }
      throw new IncompatibleProtocolError(0, frameToHex(response));
    }
    return version;
  }

  /** 校验协议版本是否满足 V3 要求（Q2：只支持 v11+）。 */
  async assertProtocolVersion(): Promise<number> {
    const version = await this.getProtocolVersion();
    if (version < MIN_PROTOCOL_VERSION) {
      throw new IncompatibleProtocolError(version);
    }
    return version;
  }

  /** 0x02 + 0x06：键码字典版本（BCD）。协议 ≥ 13 时握手必须先读它，再决定用哪套键码字典。 */
  async getKeycodesVersion(): Promise<number> {
    const req = frame([VIA_CMD.GET_KEYBOARD_VALUE, KB_VALUE_ID.KEYCODES_VERSION]);
    const response = this.assertValid(await this.transfer(req), req, VIA_CMD.GET_KEYBOARD_VALUE, 2);
    return readU32BE(response, 2);
  }

  async getKeyboardValue(valueId: number): Promise<number> {
    const req = frame([VIA_CMD.GET_KEYBOARD_VALUE, valueId]);
    const response = this.assertValid(await this.transfer(req), req, VIA_CMD.GET_KEYBOARD_VALUE, 2);
    return readU32BE(response, 2);
  }

  async setKeyboardValue(valueId: number, value: number): Promise<void> {
    const req = new Uint8Array(MSG_LEN);
    req[0] = VIA_CMD.SET_KEYBOARD_VALUE;
    req[1] = valueId & 0xff;
    writeU32BE(req, 2, value);
    this.assertValid(await this.transfer(req), req, VIA_CMD.SET_KEYBOARD_VALUE, 6);
  }

  async getLayerCount(): Promise<number> {
    const req = frame([VIA_CMD.KEYMAP_GET_LAYER_COUNT]);
    const response = this.assertValid(
      await this.transfer(req),
      req,
      VIA_CMD.KEYMAP_GET_LAYER_COUNT,
      1,
    );
    const count = response[1] ?? 0;
    // 结果合理性校验（团队裁决）：本命令无参数，参数回声防线对它无效，
    // 整体错位 1 字节时会静默得到 0 层。层数恒 ≥ 1，0 在物理上不可能 → 必须抛错，不钳到 1。
    if (count < 1) {
      throw new ProtocolSanityError('层数', count, frameToHex(response));
    }
    return count;
  }

  async getKeycode(layer: number, row: number, col: number): Promise<number> {
    const req = frame([VIA_CMD.KEYMAP_GET_KEYCODE, layer, row, col]);
    const response = this.assertValid(await this.transfer(req), req, VIA_CMD.KEYMAP_GET_KEYCODE, 4);
    return decodeKeycode(response[4] ?? 0, response[5] ?? 0);
  }

  async setKeycode(layer: number, row: number, col: number, keycode: number): Promise<void> {
    const [hi, lo] = encodeKeycode(keycode);
    const req = frame([VIA_CMD.KEYMAP_SET_KEYCODE, layer, row, col, hi, lo]);
    this.assertValid(await this.transfer(req), req, VIA_CMD.KEYMAP_SET_KEYCODE, 6);
  }

  async resetKeymap(): Promise<void> {
    const req = frame([VIA_CMD.KEYMAP_RESET]);
    this.assertValid(await this.transfer(req), req, VIA_CMD.KEYMAP_RESET, 1);
  }

  async getKeymapBuffer(offset: number, size: number): Promise<Uint8Array> {
    const n = Math.min(size, KEYMAP_BUFFER_CHUNK);
    const req = frame([VIA_CMD.KEYMAP_GET_BUFFER, (offset >> 8) & 0xff, offset & 0xff, n]);
    const response = this.assertValid(await this.transfer(req), req, VIA_CMD.KEYMAP_GET_BUFFER, 4);
    return response.slice(4, 4 + n);
  }

  async setKeymapBuffer(offset: number, data: Uint8Array): Promise<void> {
    const n = Math.min(data.length, KEYMAP_BUFFER_CHUNK);
    const req = new Uint8Array(MSG_LEN);
    req[0] = VIA_CMD.KEYMAP_SET_BUFFER;
    req[1] = (offset >> 8) & 0xff;
    req[2] = offset & 0xff;
    req[3] = n;
    req.set(data.subarray(0, n), 4);
    this.assertValid(await this.transfer(req), req, VIA_CMD.KEYMAP_SET_BUFFER, 4);
  }

  async getMacroBuffer(offset: number, size: number): Promise<Uint8Array> {
    const n = Math.min(size, KEYMAP_BUFFER_CHUNK);
    const req = frame([VIA_CMD.MACRO_GET_BUFFER, (offset >> 8) & 0xff, offset & 0xff, n]);
    const response = this.assertValid(await this.transfer(req), req, VIA_CMD.MACRO_GET_BUFFER, 4);
    return response.slice(4, 4 + n);
  }

  async setMacroBuffer(offset: number, data: Uint8Array): Promise<void> {
    const n = Math.min(data.length, KEYMAP_BUFFER_CHUNK);
    const req = new Uint8Array(MSG_LEN);
    req[0] = VIA_CMD.MACRO_SET_BUFFER;
    req[1] = (offset >> 8) & 0xff;
    req[2] = offset & 0xff;
    req[3] = n;
    req.set(data.subarray(0, n), 4);
    this.assertValid(await this.transfer(req), req, VIA_CMD.MACRO_SET_BUFFER, 4);
  }

  async getMacroSize(): Promise<number> {
    const req = frame([VIA_CMD.MACRO_GET_BUFFER_SIZE]);
    const response = this.assertValid(await this.transfer(req), req, VIA_CMD.MACRO_GET_BUFFER_SIZE, 1);
    return readU16BE(response, 1);
  }

  async customGetValue(addr: ValueAddress, width: number): Promise<number> {
    const request = encodeGet(addr);
    const response = this.assertValid(
      await this.transfer(request),
      request,
      VIA_CMD.CUSTOM_GET_VALUE,
      3 + addr.indexes.length,
    );
    if (!matchesPrefix(response, addr, VIA_CMD.CUSTOM_GET_VALUE)) {
      throw new UnhandledCommandError(VIA_CMD.CUSTOM_GET_VALUE, frameToHex(response));
    }
    const start = valueOffset(addr);
    let value = 0;
    for (let b = 0; b < width; b += 1) {
      value = ((value << 8) | ((response[start + b] ?? 0) & 0xff)) >>> 0;
    }
    return value;
  }

  async customSetValue(addr: ValueAddress, value: number, width: number): Promise<void> {
    const request = encodeSet(addr, value, width);
    const response = this.assertValid(
      await this.transfer(request),
      request,
      VIA_CMD.CUSTOM_SET_VALUE,
      3 + addr.indexes.length,
    );
    if (!matchesPrefix(response, addr, VIA_CMD.CUSTOM_SET_VALUE)) {
      throw new UnhandledCommandError(VIA_CMD.CUSTOM_SET_VALUE, frameToHex(response));
    }
  }

  /** button 类动作：把 options 字节原样透传（U3）。 */
  async customTrigger(addr: ValueAddress, args: readonly number[]): Promise<void> {
    const request = encodeAction(addr, args);
    const response = this.assertValid(
      await this.transfer(request),
      request,
      VIA_CMD.CUSTOM_SET_VALUE,
      3 + addr.indexes.length,
    );
    if (!matchesPrefix(response, addr, VIA_CMD.CUSTOM_SET_VALUE)) {
      throw new UnhandledCommandError(VIA_CMD.CUSTOM_SET_VALUE, frameToHex(response));
    }
  }

  async customSave(addr: ValueAddress): Promise<void> {
    const request = encodeSave(addr);
    const response = this.assertValid(
      await this.transfer(request),
      request,
      VIA_CMD.CUSTOM_SAVE,
      3 + addr.indexes.length,
    );
    if (!matchesPrefix(response, addr, VIA_CMD.CUSTOM_SAVE)) {
      throw new UnhandledCommandError(VIA_CMD.CUSTOM_SAVE, frameToHex(response));
    }
  }

  async eepromReset(): Promise<void> {
    const req = frame([VIA_CMD.EEPROM_RESET]);
    this.assertValid(await this.transfer(req), req, VIA_CMD.EEPROM_RESET, 1);
  }

  async bootloaderJump(): Promise<void> {
    const req = frame([VIA_CMD.BOOTLOADER_JUMP]);
    this.assertValid(await this.transfer(req), req, VIA_CMD.BOOTLOADER_JUMP, 1);
  }

  /** 调试面板专用：下发任意原始命令并记录报文。 */
  async rawCommand(bytes: ArrayLike<number>): Promise<Uint8Array> {
    const req = new Uint8Array(MSG_LEN);
    for (let i = 0; i < Math.min(bytes.length, MSG_LEN); i += 1) req[i] = bytes[i] ?? 0;
    return this.transfer(req);
  }

  /** 便捷：地址键（与 CustomValueCodec 保持一致）。 */
  static addressKeyOf(addr: ValueAddress): string {
    return addressKey(addr);
  }
}

function frame(bytes: number[]): Uint8Array {
  const out = new Uint8Array(MSG_LEN);
  out.set(bytes, 0);
  return out;
}
