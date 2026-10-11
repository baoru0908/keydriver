# VIA 键盘协议与官方实现调研

> 采集时间：2026-10-10
> 采集方式：直接抓取 GitHub 源码（原始 URL 见每节末尾）
> 说明：所有常量/代码片段均**逐字复制**自官方仓库 `main` / `master` 分支，未经改写。无法确认的内容统一放在 [第 5 节](#5-未能确认的信息)。
>
> 名词约定（避免混淆，这两个版本号是**两套不同的东西**）：
> - **VIA 协议版本（protocol version）**：固件返回的 16-bit 数，QMK 当前为 `0x000D`（13）。决定「能用哪些 HID 命令」。
> - **定义文件版本（definition version）**：`KeyboardDefinitionV2` / `V3` JSON 格式的差异。决定「JSON 长什么样」。
> - **QMK keycodes 版本**：另一个独立的 BCD 版本号（`0x00000008`/`0x00000009`），决定「同一个 keycode 名字对应哪个整数」。

---

## 1. VIA HID 协议

### 1.1 报告（Raw HID packet）结构与长度

**结论：单次交互的报告负载固定 32 字节，report id 为 `0x00`。**

权威来源 1 —— QMK 固件侧（`quantum/via.c`），收到即回同样的 buffer：

```c
// https://raw.githubusercontent.com/qmk/qmk_firmware/master/quantum/via.c
void raw_hid_receive(uint8_t *data, uint8_t length) {
    uint8_t *command_id   = &(data[0]);
    uint8_t *command_data = &(data[1]);
    ...
    switch (*command_id) { ... }
    // Return the same buffer, optionally with values changed
    // (i.e. returning state to the host, or the unhandled state).
    raw_hid_send(data, length);
}
```

权威来源 2 —— via-app 主机侧（`src/utils/keyboard-api.ts`），构造 33 字节数组（首位是 report id），写出去时砍掉首位：

```ts
// https://raw.githubusercontent.com/the-via/app/main/src/utils/keyboard-api.ts
async _hidCommand(command, bytes = [], commandName?, reportErrors = true): Promise<any> {
    const commandBytes = [...[COMMAND_START, command], ...bytes];
    const paddedArray = new Array(33).fill(0);
    commandBytes.forEach((val, idx) => { paddedArray[idx] = val; });

    await this.getHID().write(paddedArray);

    const buffer = Array.from(await this.getByteBuffer());
    const bufferCommandBytes = buffer.slice(0, commandBytes.length - 1);
    logCommand(this.kbAddr, commandBytes, buffer);
    if (!eqArr(commandBytes.slice(1), bufferCommandBytes)) {
      ...
      throw new Error('Receiving incorrect response for command');
    }
    return buffer;
}
```

**→ 结论（字节布局）：**

```
主机 → 设备（32 字节 payload，reportId = 0x00）
  offset 0  : command id        （如下节命令表）
  offset 1..: 命令参数（本次请求的参数）

设备 → 主机（32 字节 payload，reportId = 0x00）
  offset 0  : command id 回声   （= 请求里的 command id）
  offset 1..: 请求参数回声      （原样回显）
  offset n..: 返回值（若有）

若固件不认识该 command / value id：把 buffer[0]（command id 回声）改成 0xFF 返回
                                  （见 via.c 里的 `*command_id = id_unhandled;`）
```

因此 via-app 里所有响应解析都是「跳过 (1 + 请求参数个数) 再取数据」。举例 `getKey()`：请求 `[0x04, layer, row, col]`（3 个参数），响应 `[0x04, layer, row, col, hi, lo]`，所以取 `buffer[4], buffer[5]`。

> ⚠️ **平台差异（很关键）**
> - **WebHID**（via-app，浏览器）：`device.sendReport(0, data)`，report id 是**独立参数**，`data` 不含 report id；`inputreport` 事件的 `e.data` **也不含** report id。
>   ```ts
>   // https://raw.githubusercontent.com/the-via/app/main/src/shims/node-hid.ts
>   async write(arr: number[]) {
>     ...
>     const data = new Uint8Array(arr.slice(1));   // 砍掉 arr[0] = COMMAND_START
>     lastWriteTimestamp = Date.now();
>     await this._hidDevice?._device.sendReport(0, data);
>   }
>   ```
> - **hidapi**（vial-gui，桌面）：report id 是 buffer 的**第一个字节**，所以要写 33 字节：
>   ```python
>   # https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/util.py
>   MSG_LEN = 32
>   def hid_send(dev, msg, retries=1):
>       if len(msg) > MSG_LEN:
>           raise RuntimeError("message must be less than 32 bytes")
>       msg += b"\x00" * (MSG_LEN - len(msg))
>       ...
>           # add 00 at start for hidapi report id
>           if dev.write(b"\x00" + msg) != MSG_LEN + 1:
>               continue
>           data = bytes(dev.read(MSG_LEN, timeout_ms=500))
>   ```

> **单次最大数据长度 = 28 字节**（32 − 1 command − 2 offset − 1 size）。via-app 明确限制：
> ```ts
> async getKeymapBuffer(offset: number, size: number): Promise<number[]> {
>   if (size > 28) { throw new Error('Max data length is 28'); }
>   // id_dynamic_keymap_get_buffer <offset> <size> ^<data>
>   // offset is 16bit. size is 8bit. data is 16bit keycode values, maximum 28 bytes.
> ```

### 1.2 VIA 命令 id 完整列表（权威：QMK `quantum/via.h`）

```c
// https://raw.githubusercontent.com/qmk/qmk_firmware/master/quantum/via.h
enum via_command_id {
    id_get_protocol_version                 = 0x01, // always 0x01
    id_get_keyboard_value                   = 0x02,
    id_set_keyboard_value                   = 0x03,
    id_dynamic_keymap_get_keycode           = 0x04,
    id_dynamic_keymap_set_keycode           = 0x05,
    id_dynamic_keymap_reset                 = 0x06,
    id_custom_set_value                     = 0x07,
    id_custom_get_value                     = 0x08,
    id_custom_save                          = 0x09,
    id_eeprom_reset                         = 0x0A,
    id_bootloader_jump                      = 0x0B,
    id_dynamic_keymap_macro_get_count       = 0x0C,
    id_dynamic_keymap_macro_get_buffer_size = 0x0D,
    id_dynamic_keymap_macro_get_buffer      = 0x0E,
    id_dynamic_keymap_macro_set_buffer      = 0x0F,
    id_dynamic_keymap_macro_reset           = 0x10,
    id_dynamic_keymap_get_layer_count       = 0x11,
    id_dynamic_keymap_get_buffer            = 0x12,
    id_dynamic_keymap_set_buffer            = 0x13,
    id_dynamic_keymap_get_encoder           = 0x14,
    id_dynamic_keymap_set_encoder           = 0x15,
    id_unhandled                            = 0xFF,
};
```

via-app 里对应的 TS 枚举（`src/utils/keyboard-api.ts`），**两者完全一致**，只是命名不同、并额外带一个 VIA 自定义 firmware 才支持的 `0x16`：

```ts
const COMMAND_START = 0x00; // This is really a HID Report ID
const PER_KEY_RGB_CHANNEL_COMMAND = [0, 1];

enum APICommand {
  GET_PROTOCOL_VERSION = 0x01,
  GET_KEYBOARD_VALUE = 0x02,
  SET_KEYBOARD_VALUE = 0x03,
  DYNAMIC_KEYMAP_GET_KEYCODE = 0x04,
  DYNAMIC_KEYMAP_SET_KEYCODE = 0x05,
  //  DYNAMIC_KEYMAP_CLEAR_ALL = 0x06,
  CUSTOM_MENU_SET_VALUE = 0x07,
  CUSTOM_MENU_GET_VALUE = 0x08,
  CUSTOM_MENU_SAVE = 0x09,

  EEPROM_RESET = 0x0a,
  BOOTLOADER_JUMP = 0x0b,
  DYNAMIC_KEYMAP_MACRO_GET_COUNT = 0x0c,
  DYNAMIC_KEYMAP_MACRO_GET_BUFFER_SIZE = 0x0d,
  DYNAMIC_KEYMAP_MACRO_GET_BUFFER = 0x0e,
  DYNAMIC_KEYMAP_MACRO_SET_BUFFER = 0x0f,
  DYNAMIC_KEYMAP_MACRO_RESET = 0x10,
  DYNAMIC_KEYMAP_GET_LAYER_COUNT = 0x11,
  DYNAMIC_KEYMAP_GET_BUFFER = 0x12,
  DYNAMIC_KEYMAP_SET_BUFFER = 0x13,
  DYNAMIC_KEYMAP_GET_ENCODER = 0x14,
  DYNAMIC_KEYMAP_SET_ENCODER = 0x15,

  UI_SYNC_REQUEST = 0x16,

  // DEPRECATED:
  BACKLIGHT_CONFIG_SET_VALUE = 0x07,
  BACKLIGHT_CONFIG_GET_VALUE = 0x08,
  BACKLIGHT_CONFIG_SAVE = 0x09,
}
```

> 注意 `0x07/0x08/0x09` 是**同义复用**：旧固件里它们是 `BACKLIGHT_CONFIG_*`（不带 channel），新固件里它们是 `CUSTOM_*`（必须带 channel）。见 1.5 节。

### 1.3 每个命令的请求 / 响应字节格式

下面 `req` / `resp` 均按**报告 payload**（不含 report id）编号，`n` = 响应里返回值的起始下标。全部原样抄自 `quantum/via.c` 的 `raw_hid_receive()`。

| cmd | 名称 | 请求 | 响应 | 备注 |
|---|---|---|---|---|
| `0x01` | GET_PROTOCOL_VERSION | `[01]` | `[01, v_hi, v_lo]` | QMK 当前 `VIA_PROTOCOL_VERSION 0x000D` |
| `0x02` | GET_KEYBOARD_VALUE | `[02, value_id, params…]` | `[02, value_id, params…, data…]` | value_id 见 1.4 |
| `0x03` | SET_KEYBOARD_VALUE | `[03, value_id, value…]` | 回显 | 只有 `id_layout_options`(4B BE) 与 `id_device_indication`(1B) |
| `0x04` | GET_KEYCODE | `[04, layer, row, col]` | `[04, layer, row, col, kc_hi, kc_lo]` | keycode = `(resp[4]<<8)|resp[5]` |
| `0x05` | SET_KEYCODE | `[05, layer, row, col, kc_hi, kc_lo]` | 回显 | |
| `0x06` | DYNAMIC_KEYMAP_RESET | `[06]` | 回显 | via-app 未使用（注释掉了） |
| `0x07` | CUSTOM_SET_VALUE | `[07, channel, value_id, v…]` | 回显 | |
| `0x08` | CUSTOM_GET_VALUE | `[08, channel, value_id, extras…]` | `[08, channel, value_id, extras…, v…]` | |
| `0x09` | CUSTOM_SAVE | `[09, channel]` | 回显 | 改完某个 channel 的值后必须调用才会写 EEPROM |
| `0x0A` | EEPROM_RESET | `[0A]` | 回显 | QMK 里被 `#ifdef VIA_EEPROM_ALLOW_RESET` 包住 |
| `0x0B` | BOOTLOADER_JUMP | `[0B]` | 回显 | 跳转后设备消失，响应可能收不到 |
| `0x0C` | MACRO_GET_COUNT | `[0C]` | `[0C, count]` | 返回的是**最大可存数量**，不是当前数量 |
| `0x0D` | MACRO_GET_BUFFER_SIZE | `[0D]` | `[0D, size_hi, size_lo]` | 16-bit |
| `0x0E` | MACRO_GET_BUFFER | `[0E, off_hi, off_lo, size]` | `[0E, off_hi, off_lo, size, data…]` | `size ≤ 28` |
| `0x0F` | MACRO_SET_BUFFER | `[0F, off_hi, off_lo, size, data…]` | 回显 | `size ≤ 28` |
| `0x10` | MACRO_RESET | `[10]` | 回显 | |
| `0x11` | GET_LAYER_COUNT | `[11]` | `[11, count]` | 协议 < 8 时不存在，则假定 4 |
| `0x12` | KEYMAP_GET_BUFFER | `[12, off_hi, off_lo, size]` | `[12, off_hi, off_lo, size, data…]` | keycode **大端** 16-bit，一次最多 14 个 |
| `0x13` | KEYMAP_SET_BUFFER | `[13, off_hi, off_lo, size, data…]` | 回显 | |
| `0x14` | GET_ENCODER | `[14, layer, encoder_id, clockwise]` | `[14, layer, id, cw, kc_hi, kc_lo]` | `#ifdef ENCODER_MAP_ENABLE` |
| `0x15` | SET_ENCODER | `[15, layer, id, clockwise, kc_hi, kc_lo]` | 回显 | |
| `0xFF` | id_unhandled | — | `[FF, …]` | 固件不认识时的返回值 |

关键片段（`via.c`，逐字）：

```c
        case id_get_protocol_version: {
            command_data[0] = VIA_PROTOCOL_VERSION >> 8;
            command_data[1] = VIA_PROTOCOL_VERSION & 0xFF;
            break;
        }
        case id_dynamic_keymap_get_keycode: {
            uint16_t keycode = dynamic_keymap_get_keycode(command_data[0], command_data[1], command_data[2]);
            command_data[3]  = keycode >> 8;
            command_data[4]  = keycode & 0xFF;
            break;
        }
        case id_dynamic_keymap_macro_get_buffer: {
            uint16_t offset = (command_data[0] << 8) | command_data[1];
            uint16_t size   = command_data[2]; // size <= 28
            dynamic_keymap_macro_get_buffer(offset, size, &command_data[3]);
            break;
        }
        case id_dynamic_keymap_get_buffer: {
            uint16_t offset = (command_data[0] << 8) | command_data[1];
            uint16_t size   = command_data[2]; // size <= 28
            dynamic_keymap_get_buffer(offset, size, &command_data[3]);
            break;
        }
#ifdef ENCODER_MAP_ENABLE
        case id_dynamic_keymap_get_encoder: {
            uint16_t keycode = dynamic_keymap_get_encoder(command_data[0], command_data[1], command_data[2] != 0);
            command_data[3]  = keycode >> 8;
            command_data[4]  = keycode & 0xFF;
            break;
        }
#endif
        default: {
            // The command ID is not known
            // Return the unhandled state
            *command_id = id_unhandled;
            break;
        }
```

**keymap buffer 的偏移公式**（权威注释 + vial-gui 实现，两者一致）：

```c
// https://raw.githubusercontent.com/qmk/qmk_firmware/master/quantum/dynamic_keymap.h
// Data is big-endian 16-bit values (the keycodes)
// Order is by layer/row/column
// Thus offset 0 = 0,0,0, offset MATRIX_COLS*2 = 0,1,0, offset MATRIX_ROWS*MATRIX_COLS*2 = 1,0,0
// Note the *2, because offset is in bytes and keycodes are two bytes
```

```python
# https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/protocol/keyboard_comm.py
offset = layer * self.rows * self.cols * 2 + row * self.cols * 2 + col * 2
keycode = Keycode.serialize(struct.unpack(">H", keymap[offset:offset+2])[0])
```

**macro buffer 的写入流程**（有「写保护」握手，必须照做）：

```c
// quantum/dynamic_keymap.h
// Users writing to the buffer must first set the last byte of the buffer
// to non-zero (i.e. 0xFF). After (or during) the final write, set the
// last byte of the buffer to zero.
// ...the last byte must be a null when at maximum capacity,
// and it not being null means the buffer can be considered in an
// invalid state.
```

via-app 的实现（`keyboard-api.ts::setMacroBytes`）：先 `resetMacros()` → 在 `size-1` 偏移写 `0xFF` → 按 28 字节分块写 → 最后在 `size-1` 写 `0x00`。

### 1.4 `GET_KEYBOARD_VALUE` / `SET_KEYBOARD_VALUE` 的 value_id

```c
// https://raw.githubusercontent.com/qmk/qmk_firmware/master/quantum/via.h
enum via_keyboard_value_id {
    id_uptime              = 0x01,
    id_layout_options      = 0x02,
    id_switch_matrix_state = 0x03,
    id_firmware_version    = 0x04,
    id_device_indication   = 0x05,
    id_keycodes_version    = 0x06,
};
```

via-app 的对应枚举（完全一致）：

```ts
// https://raw.githubusercontent.com/the-via/app/main/src/utils/keyboard-values.ts
export enum KeyboardValue {
  UPTIME = 0x01,
  LAYOUT_OPTIONS = 0x02,
  SWITCH_MATRIX_STATE = 0x03,
  FIRMWARE_VERSION = 0x04,
  DEVICE_INDICATION = 0x05,
  KEYCODES_VERSION = 0x06,
}
```

返回字节数（via.c）：`uptime` / `layout_options` / `firmware_version` / `keycodes_version` 均返回 **4 字节大端**；`switch_matrix_state` 需要 1 字节 `offset` 参数，最多回 28 字节的行位图（且受 `#ifdef VIA_INSECURE` / `SECURE_ENABLE` 限制，默认全 0）。

`id_keycodes_version` 的解析规则（via-app `src/utils/keycodes-version.ts`，**BCD 校验**很重要）：

```ts
export const MINIMUM_SUPPORTED_KEYCODES_VERSION = 0x00000008;
export const MAXIMUM_SUPPORTED_KEYCODES_VERSION = 0x00000009;
...
  const version =
    ((result[0] << 24) | (result[1] << 16) | (result[2] << 8) | result[3]) >>> 0;
  const isBCD = result.every((byte) => byte >> 4 <= 9 && (byte & 0x0f) <= 9);
  if (version === 0) { throw new KeycodesVersionProtocolError('Version response must not be zero', result); }
  if (!isBCD) { throw new KeycodesVersionProtocolError('Version response is not valid BCD', result); }
```

### 1.5 channel id 语义（权威：QMK `via.h`）

```c
enum via_channel_id {
    id_custom_channel         = 0,
    id_qmk_backlight_channel  = 1,
    id_qmk_rgblight_channel   = 2,
    id_qmk_rgb_matrix_channel = 3,
    id_qmk_audio_channel      = 4,
    id_qmk_led_matrix_channel = 5,
};

enum via_qmk_backlight_value {
    id_qmk_backlight_brightness = 1,
    id_qmk_backlight_effect     = 2,
};

enum via_qmk_rgblight_value {
    id_qmk_rgblight_brightness   = 1,
    id_qmk_rgblight_effect       = 2,
    id_qmk_rgblight_effect_speed = 3,
    id_qmk_rgblight_color        = 4,
};

enum via_qmk_rgb_matrix_value {
    id_qmk_rgb_matrix_brightness   = 1,
    id_qmk_rgb_matrix_effect       = 2,
    id_qmk_rgb_matrix_effect_speed = 3,
    id_qmk_rgb_matrix_color        = 4,
};

enum via_qmk_led_matrix_value {
    id_qmk_led_matrix_brightness   = 1,
    id_qmk_led_matrix_effect       = 2,
    id_qmk_led_matrix_effect_speed = 3,
};
```

分发逻辑（`via.c`）：

```c
__attribute__((weak)) void via_custom_value_command(uint8_t *data, uint8_t length) {
    // data = [ command_id, channel_id, value_id, value_data ]
    uint8_t *channel_id = &(data[1]);

#if defined(BACKLIGHT_ENABLE)
    if (*channel_id == id_qmk_backlight_channel)  { via_qmk_backlight_command(data, length);  return; }
#endif
#if defined(RGBLIGHT_ENABLE)
    if (*channel_id == id_qmk_rgblight_channel)   { via_qmk_rgblight_command(data, length);   return; }
#endif
#if defined(RGB_MATRIX_ENABLE)
    if (*channel_id == id_qmk_rgb_matrix_channel) { via_qmk_rgb_matrix_command(data, length); return; }
#endif
#if defined(LED_MATRIX_ENABLE)
    if (*channel_id == id_qmk_led_matrix_channel) { via_qmk_led_matrix_command(data, length); return; }
#endif
#if defined(AUDIO_ENABLE)
    if (*channel_id == id_qmk_audio_channel)      { via_qmk_audio_command(data, length);      return; }
#endif
    via_custom_value_command_kb(data, length);   // 未知 channel → 交给键盘自定义（默认返回 0xFF unhandled）
}
```

> **注意**：`channel = 0`（`id_custom_channel`）**没有内建实现**，就是留给键盘厂商自定义的 `via_custom_value_command_kb()`。VIA 的 per-key RGB 也走 channel 0：
> ```ts
> const PER_KEY_RGB_CHANNEL_COMMAND = [0, 1];   // channel 0, value_id 1
> ```

### 1.6 协议版本号含义，以及「定义 v2 / v3」与「读取方式」的关系

via-app 里出现的 3 个内部阈值常量：

```ts
// https://raw.githubusercontent.com/the-via/app/main/src/utils/keyboard-api.ts
export const PROTOCOL_ALPHA = 7;
export const PROTOCOL_BETA = 8;
export const PROTOCOL_GAMMA = 9;
```

**① 定义文件版本是按协议版本选的（不是按用户喜好）**：

```ts
// https://raw.githubusercontent.com/the-via/app/main/src/store/devicesThunks.ts
requiredDefinitionVersion: protocol >= 11 ? 'v3' : 'v2',
```

**② keymap 读/写方式是另一个开关（`>= PROTOCOL_BETA`，即 protocol ≥ 8）**：

```ts
async readRawMatrix(matrix: MatrixInfo, layer: number): Promise<Keymap> {
    const version = await this.getProtocolVersion();
    if (version >= PROTOCOL_BETA) { return this.fastReadRawMatrix(matrix, layer); }
    if (version === PROTOCOL_ALPHA) { return this.slowReadRawMatrix(matrix, layer); }
    throw new Error('Unsupported protocol version');
}
```

- `slowReadRawMatrix`（protocol == 7）：对 `rows*cols` 个键逐个发 `0x04 GET_KEYCODE`。
- `fastReadRawMatrix`（protocol >= 8）：按 14 个 keycode（28 字节）分块发 `0x12 GET_BUFFER`。

> ⚠️ 这两条线**互相独立**：一个 protocol 10 的 v2 定义键盘，也会用 `GET_BUFFER` 快速读；一个 protocol 11+ 的 v3 定义键盘必然支持 `GET_BUFFER`。所以「v2 用 GET_KEYCODE、v3 用 buffer」的说法**不准确**，准确说法是「**protocol ≥ 8 才有 GET/SET_BUFFER**」。

**③ 灯光/菜单路径也是按协议版本切的**：

```ts
// src/store/devicesThunks.ts
if (protocol < 11) {
  await dispatch(updateLightingData(connectedDevice));          // 旧路径：0x07/0x08/0x09 无 channel
} else if (protocol >= 11) {
  await dispatch(loadDefinitionName(connectedDevice));
  await dispatch(loadFirmwareVersion(connectedDevice));
  await dispatch(updateV3MenuData(connectedDevice));            // 新路径：0x07/0x08/0x09 必须带 channel
}
```

旧路径（`protocol < 11`）用的 value_id 常量（来自 `the-via/reader/src/types.v2.ts`）：

```ts
export enum LightingValue {
  BACKLIGHT_USE_SPLIT_BACKSPACE = 0x01, ...
  BACKLIGHT_BRIGHTNESS = 0x09,
  BACKLIGHT_EFFECT = 0x0a,
  BACKLIGHT_EFFECT_SPEED = 0x0b,
  BACKLIGHT_COLOR_1 = 0x0c,
  BACKLIGHT_COLOR_2 = 0x0d,
  ...
  BACKLIGHT_CUSTOM_COLOR = 0x17,
  // QMK RGBLIGHT
  QMK_RGBLIGHT_BRIGHTNESS = 0x80,
  QMK_RGBLIGHT_EFFECT = 0x81,
  QMK_RGBLIGHT_EFFECT_SPEED = 0x82,
  QMK_RGBLIGHT_COLOR = 0x83,
}
```

**④ 层数量命令 `0x11` 在 protocol < 8 时不存在**，app 直接假定 4：

```ts
async getLayerCount() {
    const version = await this.getProtocolVersion();
    if (version >= PROTOCOL_BETA) {
      const [, count] = await this.hidCommand(APICommand.DYNAMIC_KEYMAP_GET_LAYER_COUNT);
      return count;
    }
    return 4;
}
```

**⑤ protocol ≥ 13 必须先读 keycodes version**（否则报 0xFF/错 keycode）：

```ts
// https://raw.githubusercontent.com/the-via/app/main/src/utils/key-to-byte/dictionary-store.ts
export function getBasicKeyDict(protocol: number, keycodesVersion?: number): Record<string, number> {
  if (protocol >= 13) {
    if (keycodesVersion === undefined) {
      throw new Error(`VIA protocol ${protocol} requires a QMK keycodes version`);
    }
    return v13BasicKeyToByte;
  }
  switch (protocol) {
    case 12: { return v12BasicKeyToByte; }
    case 11: { return v11BasicKeyToByte; }
    case 10: { return v10BasicKeyToByte; }
    default: { return basicKeyToByte; }
  }
}
```

### 1.7 设备枚举：WebHID / hidapi 过滤条件 + VID/PID 匹配

**usagePage / usage（两处实现完全一致）**：

```ts
// https://raw.githubusercontent.com/the-via/app/main/src/shims/node-hid.ts (the-via/app 的 WebHID 适配层)
const filterHIDDevices = (devices: HIDDevice[]) =>
  devices.filter((device) =>
    device.collections?.some(
      (collection) => collection.usage === 0x61 && collection.usagePage === 0xff60,
    ),
  );

export const QMK_CONSOLE_FILTER = { usagePage: 0xff31, usage: 0x74 };

ExtendedHID.requestDevice = async () => {
    const requestedDevice = await navigator.hid.requestDevice({
      filters: [
        { usagePage: 0xff60, usage: 0x61 },
        QMK_CONSOLE_FILTER,
      ],
    });
    ...
};
```

```python
# https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/util.py
def is_rawhid(desc, quiet):
    if desc["usage_page"] != 0xFF60 or desc["usage"] != 0x61:
        ...
        return False
```

**VID/PID → 定义文件的 key 就是 `vid * 65536 + pid`（十进制拼串）**：

```ts
// https://raw.githubusercontent.com/the-via/app/main/src/utils/hid-keyboards.ts
export function getVendorProductId(vendorId: number, productId: number) {
  // JS bitwise operations is only 32-bit so we lose numbers if we shift too high
  return vendorId * 65536 + productId;
}

export const getRecognisedDevices = async (vpidMap, forceRequest = false) => {
  const usbDevices = await scanDevices(forceRequest);
  return usbDevices.filter((device) => {
    const validVendorProduct = idExists(device, vpidMap);
    // attempt connection
    return (validVendorProduct || forceRequest) && canConnect(device);
  });
};
```

```python
# https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/vial_device.py
self.via_id = str(dev["vendor_id"] * 65536 + dev["product_id"])
```

VIA app 的**完整挑选链路**（`src/store/devicesThunks.ts`）：

1. `getRecognisedDevices(supportedIds, forceRequest)` → usagePage/usage 过滤 + VPID 是否在 `supported_kbs.json` 里 + `canConnect()` 尝试真连；
2. `new KeyboardAPI(path).getProtocolVersion()` → 拿不到（返回 `-1`）的设备被丢进 `updateInvalidProtocolDevices`；
3. 按 protocol 决定 `requiredDefinitionVersion`（≥11 → v3）；
4. 从 `/definitions/{version}/{vpid}.json` 拉定义（`src/utils/device-store.ts`）。

`supported_kbs.json` 的 shape（`the-via/reader/src/types.common.ts`）：

```ts
export type KeyboardDefinitionIndex = {
  generatedAt: number;
  version: string;
  theme: ThemeDefinition;
  vendorProductIds: {[key in DefinitionVersion]: number[]};
  // The idea here is that anything in 'v2' will have both v2 and v3 defs
  // so 'v3' only contains defs that aren't v2
};
```

并在 `device-store.ts` 里有注释：`// v3 is a superset of v2 - if the def is avail in v2, it is also avail in v3`。

**vial 的设备识别是「USB 序列号魔法串」而非依赖 VID/PID 表**（值得借鉴的做法）：

```python
# https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/util.py
# For Vial keyboard
VIAL_SERIAL_NUMBER_MAGIC = "vial:f64c2b3c"
# For bootloader
VIBL_SERIAL_NUMBER_MAGIC = "vibl:d4f8159c"
...
    elif VIAL_SERIAL_NUMBER_MAGIC in dev["serial_number"]:
        ... filtered.append(VialKeyboard(dev))
    elif VIBL_SERIAL_NUMBER_MAGIC in dev["serial_number"]:
        ... filtered.append(VialBootloader(dev))
    elif str(dev["vendor_id"] * 65536 + dev["product_id"]) in via_stack_json["definitions"]:
        ... filtered.append(VialKeyboard(dev, via_stack=True))
```

### 1.8 设备主动发起的输入报告：`UI_SYNC_REQUEST = 0x16`

**这是 QMK 核心里没有的**，只见于 via-app —— 是某些 VIA 固件在自身状态变化时主动推给主机的 32 字节 input report。via-app 用独立的 handler 拦截它：

```ts
export enum UISyncRequestType {
  CUSTOM_MENU_ALL = 0x00,
  CUSTOM_MENU_COMMANDS = 0x01,
  CUSTOM_MENU_COMMAND_IDS = 0x02,
}

const UI_SYNC_REQUEST_VERSION = 0x01;

const parseUISyncRequest = (buffer: Uint8Array): UISyncRequest | undefined => {
  const [command, version, type, count] = buffer;
  if (command !== APICommand.UI_SYNC_REQUEST || version !== UI_SYNC_REQUEST_VERSION) {
    return undefined;
  }
  if (type === UISyncRequestType.CUSTOM_MENU_ALL) { return {type}; }
  if (type === UISyncRequestType.CUSTOM_MENU_COMMAND_IDS) {
    return { type, commandIds: Array.from(buffer.slice(4, 4 + count)) };
  }
  if (type !== UISyncRequestType.CUSTOM_MENU_COMMANDS) { return undefined; }

  const targets: UISyncCustomMenuCommandTarget[] = [];
  for (let targetIdx = 0; targetIdx < count; targetIdx++) {
    const offset = 4 + targetIdx * 2;
    const channelId = buffer[offset];
    const commandId = buffer[offset + 1];
    ...
  }
  return {type, targets};
};
```

字节格式：`[0x16, 0x01, type, count, payload…]`；`type=0x01` 时 payload 是 `count` 组 `(channel, command_id)`。

### 1.9 并发模型（很容易踩坑）

via-app **对所有 HID 命令做串行队列**，因为 WebHID 的 inputreport 是「事件流」而不是「同步 read」：

```ts
const globalCommandQueue: {
  [kbAddr: string]: {isFlushing: boolean; commandQueue: CommandQueue};
} = {};

async flushQueue() {
    if (this.commandQueueWrapper.isFlushing === true) { return; }
    this.commandQueueWrapper.isFlushing = true;
    while (this.commandQueueWrapper.commandQueue.length !== 0) {
      const {res, rej, args} = this.commandQueueWrapper.commandQueue.shift() as CommandQueueEntry;
      // This allows us to queue promises in between hid commands, useful for timeouts
      if (typeof args === 'function') { await args(); res(); }
      else { try { const ans = await this._hidCommand(...args); res(ans); } catch (e) { ... rej(e); } }
    }
    this.commandQueueWrapper.isFlushing = false;
}
```

并且用「时间戳快进」丢弃过期输入报告（`src/shims/node-hid.ts` 的 `fastForwardGlobalBuffer`）。

vial-gui 用同步 read+timeout(500ms)，天然串行，靠 `retries=20` + `time.sleep(0.5)` 兜底：

```python
def hid_send(dev, msg, retries=1):
    ...
    while retries > 0:
        retries -= 1
        if not first:
            time.sleep(0.5)
        first = False
        try:
            if dev.write(b"\x00" + msg) != MSG_LEN + 1: continue
            data = bytes(dev.read(MSG_LEN, timeout_ms=500))
            if not data: continue
        except OSError:
            continue
        break
    if not data:
        raise RuntimeError("failed to communicate with the device")
    return data
```

---

## 2. 定义文件（VIA JSON）规范

权威 schema 在独立仓库 **`the-via/reader`**（via-app 通过 npm 包 `@the-via/reader` 依赖它）：
`src/types.common.ts` / `src/types.v2.ts` / `src/types.v3.ts` / `src/menu-types.ts` / `src/kle-parser.ts`。

### 2.1 v1 / v2 / v3 字段差异

v1 已彻底废弃，`reader` 里不再有 v1 类型。保留的两种 **`KeyboardDefinition`（源码 raw）** 与 **`VIADefinition`（构建后、给 app 用）**：

```ts
// https://raw.githubusercontent.com/the-via/reader/master/src/types.v2.ts
export type KeyboardDefinitionV2 = {
  name: string;
  vendorId: string;
  productId: string;
  lighting: LightingTypeDefinitionV2;
  matrix: MatrixInfo;
  customFeatures?: CustomFeaturesV2[];
  customKeycodes?: CustomKeycode[];
  customMenus?: VIAMenu[];
  layouts: {
    keymap: KLELayoutDefinition;
    labels?: LayoutLabel[];
    presets?: { [preset: string]: number[]; };
  };
};

export type VIADefinitionV2 = {
  name: string;
  vendorProductId: number;
  lighting: LightingTypeDefinitionV2;
  matrix: MatrixInfo;
  customFeatures?: CustomFeaturesV2[];
  customKeycodes?: CustomKeycode[];
  customMenus?: VIAMenu[];
  layouts: {
    width: number;
    height: number;
    presets?: { [preset: string]: number[]; };
    labels?: LayoutLabel[];
    keys: VIAKey[];
    optionKeys: {[g: string]: {[o: string]: VIAKey[]}};
  };
};
```

```ts
// https://raw.githubusercontent.com/the-via/reader/master/src/types.v3.ts
export enum BuiltInKeycodeModule {
  QMKLighting = 'qmk_lighting',
  QMKBacklightKeycodes = 'qmk_backlight_keycodes',
  QMKRGBLightKeycodes = 'qmk_rgblight_keycodes',
  QMKRGBMatrixKeycodes = 'qmk_rgb_matrix_keycodes',
  QMKBacklightRGBLightKeycodes = 'qmk_backlight_rgblight_keycodes',
  WTLighting = 'wt_lighting',
}

export type DefinitionName = string | DynamicDefinitionName;

export type KeyboardDefinitionV3 = {
  name: DefinitionName;
  vendorId: string;
  productId: string;
  firmwareVersion?: number;
  matrix: MatrixInfo;
  menus?: (VIAMenu<DisplayLabel> | string)[];   // ← 字符串可以是内建菜单名
  keycodes?: BuiltInKeycodeModule[];
  customKeycodes?: CustomKeycode[];
  layouts: {
    keymap: KLELayoutDefinition;
    labels?: LayoutLabel[];
    presets?: { [preset: string]: number[]; };
  };
};

export type VIADefinitionV3 = {
  name: DefinitionName;
  vendorProductId: number;
  firmwareVersion: number;
  matrix: MatrixInfo;
  menus: (VIAMenu<DisplayLabel> | string)[];
  keycodes: BuiltInKeycodeModule[];
  customKeycodes?: CustomKeycode[];
  layouts: {
    width: number; height: number;
    presets?: { [preset: string]: number[]; };
    labels?: LayoutLabel[];
    keys: VIAKey[];
    optionKeys: {[g: string]: {[o: string]: VIAKey[]}};
  };
};
```

**一句话对比：**

| 能力 | v2 | v3 |
|---|---|---|
| 灯光 | 顶层 `lighting: "none" \| "qmk_backlight" \| "qmk_rgblight" \| "qmk_backlight_rgblight" \| "wt_rgb_backlight" \| "wt_mono_backlight"` | 无 `lighting`，改为 `menus` 里引用内建菜单字符串 + `keycodes: BuiltInKeycodeModule[]` |
| 菜单 | `customMenus?: VIAMenu[]`（只有自定义） | `menus: (VIAMenu<DisplayLabel> \| string)[]`（**可混入内建菜单名**，也支持 `DisplayLabel` 类型条目） |
| 固件版本 | 无 | `firmwareVersion: number`，用于 `showIf` 做版本门控 |
| 键盘名 | 只能是 `string` | 可以是 `{options: [...], content: CommandDef}` 动态名（从固件读回显示） |
| 编码器 | `customFeatures: ['rotary-encoder']` | 无此字段，编码器在 KLE 里用 `eN` 表达，通过 `0x14/0x15` 读写 |
| `type: 'label'` 控件（只读展示） | 不支持 | 支持 |

**运行时如何选**：见 1.6 ①，`protocol >= 11 ? 'v3' : 'v2'`。

### 2.2 `menus` 的完整 schema（权威：`the-via/reader/src/menu-types.ts`，逐字）

```ts
type Label = { label: string; };

// A property that describes the byte-length of the setting value
type ByteLength = { bytes?: 1 | 2 | 3 | 4; };   // default should be 1

type RawExpr = string;

// A property that when present, provides the option of not evaluating the block it represents
type Conditional = { showIf?: RawExpr; };

// A structure that allows a grouping of items, generally useful for conditionally rendering a block of controls
// that share the same render condition
type Group<A> = Conditional & Content<A[]>;

// The "parameter" of the render function
type Content<A> = { content: A; };

type TextContent = Content<string>;
type StaticDisplayContent = Content<[string]>;

// Specifies the get-set command prefix
// For fetching the current value: <CustomCommand> <BindableContent>
// For setting the current value: <CustomCommand> <BindableContent> <NewValue>
type BindableContent = Content<CommandDef>;

// token_id, channel_id, command_id
export type CommandDef = [string, number, number];

export type RangeConstraint = {
  operator: '<' | '<=' | '>' | '>=';
  reference: string | CommandDef;
  offset?: number;
  onViolation?: 'clamp' | 'push';
};

// VIA controls
type NumNumArray = number | number[]; // needed to shoehorn wtrgb enable caps/hhkb/etc lighting for now

export type Button       = { type: 'button';        options?: [number]; };
export type Toggle       = { type: 'toggle';        options?: [NumNumArray, NumNumArray]; };
export type Dropdown     = { type: 'dropdown';      options: string[] | [string, number, ...number[]][]; };
export type Range        = { type: 'range';         options: [number, number]; unit?: string; constraints?: RangeConstraint[]; };
export type Keycode      = { type: 'keycode'; };
export type Color        = { type: 'color'; };
export type ColorPalette = { type: 'color-palette'; };

// An atomic unit that represents a renderable unit - usually a Control
type Item<A> = Label & Conditional & ByteLength & A;
type Control = Keycode | Color | Toggle | Dropdown | Range | Button;
type UniqueControl = ColorPalette;
export type DisplayLabel = Item<StaticDisplayContent | BindableContent> & { type: 'label'; };

// The standard VIA control
export type VIAControlItem = Control & Item<BindableContent>;
export type VIAUniqueControlItem = UniqueControl & Item<BindableContent>;
// For displaying text like headers or static springs
export type VIATextItem = Item<TextContent>;

// VIA Groups
export type VIAItem<ExtraItem = never> =
  | VIATextItem | VIAControlItem | VIAUniqueControlItem | ExtraItem;
export type VIAItemSlice<ExtraItem = never> = Group<VIAItem<ExtraItem>>;
export type VIASubmenuSlice<ExtraItem = never> = Group<VIASubmenu<ExtraItem>>;
export type VIASubmenu<ExtraItem = never> = Label & Group<VIAItem<ExtraItem> | VIAItemSlice<ExtraItem>>;
export type VIAMenu<ExtraItem = never> = Label & Group<VIASubmenu<ExtraItem> | VIASubmenuSlice<ExtraItem>>;
```

#### `type` 支持清单 + 控件行为（via-app 渲染代码）

来源：`src/components/panes/configure-panes/custom/custom-control.tsx`（逐字摘录关键分支）：

- **`toggle`** — 默认 `options = [0, 1]`；可传多字节数组。判定「是否已勾选」用 `options[1]` 逐字节比对：
  ```tsx
  const boxOrArr = <N extends any>(elem: N | N[]) => Array.isArray(elem) ? elem : [elem];
  // we can compare value against option[1], that way corrupted values are false
  const valueIsChecked = (option: number | number[], value: number[]) =>
    boxOrArr(option).every((o, i) => o == value[i]);
  ...
  case 'toggle': {
    const toggleOptions: any[] = options || [0, 1];
    return <AccentSlider isChecked={valueIsChecked(toggleOptions[1], props.value)}
      onChange={(val) => props.updateValue(name, ...command, ...boxOrArr(toggleOptions[+val]))} />;
  }
  ```
- **`dropdown`** — `options` 两种形式：**字符串数组**（value 自动取下标 `idx`）或 **`[label, value]` 数组**：
  ```tsx
  case 'dropdown': {
    const selectOptions = options.map((option: [string, number] | string, idx: number) => {
      const [label, value] = typeof option === 'string' ? [option, idx] : option;
      return { value: value || idx, label: t(label) };
    });
    ...
  }
  ```
- **`range`** — `options: [min, max]`；`max > 255` 时读写 16-bit 大端：
  ```tsx
  const getRangeValue = (value: number[], max: number) => {
    if (max > 255) { return shiftTo16Bit([value[0], value[1]]); } else { return value[0]; }
  };
  ```
  配套 `src/utils/range-constraints.ts`：
  ```ts
  export const decodeRangeValue = (value: number[], max: number) =>
    max > 255 ? (value[0] << 8) | value[1] : value[0];
  export const encodeRangeValue = (value: number, max: number) =>
    max > 255 ? [value >> 8, value & 255] : [value];
  export const encodeRangeCommand = (content, value, max) => {
    const [, ...command] = content;
    return [...command, ...encodeRangeValue(value, max)];
  };
  ```
- **`color`** — 读回 `[hue, sat]`，写入 `...command, hue, sat`（**只有 hue/sat，没有 val**）。
- **`keycode`** — 读写 16-bit 大端。
- **`button`** — `options[0]`（默认 1）作为一次性写入值。
- **`label`** — v3 专有，`content` 长度为 1 时直接当 i18n key 展示，否则把读回的字节当 UTF-8（以 0 截断）字符串显示：
  ```tsx
  const decodeNullTerminatedUTF8 = (value?: number[]) => {
    if (!value || value.length === 0) return '';
    const terminatorIdx = value.indexOf(0);
    const bytes = value.slice(0, terminatorIdx === -1 ? undefined : terminatorIdx);
    return new TextDecoder().decode(new Uint8Array(bytes));
  };
  case 'label': {
    return <RangeValueDisplay>{content.length === 1 ? t(content[0]) : decodeNullTerminatedUTF8(value)}</RangeValueDisplay>;
  }
  ```
- **`color-palette`** — per-key RGB 涂色控件（配合 KLE 里的 LED 索引 `li`）。

#### `content` 数组的含义

`CommandDef = [token_id, channel_id, command_id]`，加上可选的额外数字形参。via-app 的判断：

```ts
// https://raw.githubusercontent.com/the-via/app/main/src/utils/custom-menu.ts
export const isCustomMenuCommandContent = (content: unknown): content is [string, number, number, ...number[]] =>
  Array.isArray(content) && content.length >= 3 &&
  typeof content[0] === 'string' && content.slice(1).every((value) => typeof value === 'number');
```

下发到 HID 的是 **去掉第 0 项后的其余部分**：

```ts
// https://raw.githubusercontent.com/the-via/app/main/src/store/menusSlice.ts
const commands = menus.flatMap((menu) => extractCommands(menu, firmwareVersion));
const commandPromises = commands.map(([name, channelId, ...command]) => ({
  command: name,
  promise: api.getCustomMenuValue([channelId].concat(command)),
}));
```

所以 `content: ['id_qmk_rgblight_brightness', 2, 1]` → 实际报文 `[0x08, 0x02, 0x01]`。

#### `showIf` 表达式语法

由独立 npm 包 **`@the-via/pelpi`** 求值，语法见 `src/instr.ts` 头部注释：

```ts
/* Operator Precedence - Hi to Lo
  {} - Substitution
  .  - Access
  () - Grouping
  !  - Not
  <  - Less Than
  <= - Less Than or Equal
  >  - Greater Than
  >= - Greater Than or Equal
  == - Equals
  != - Not Equals
  && - And
  || - Or
*/

enum Op {
  ExprStart, NumCont, VarDecl, Op,
  Get = "get", Seperator = " ", Or = "||", And = "&&", Eq = "==",
  LT = "<", LTE = "<=", GT = ">", GTE = ">=",
  Not = "!", NotEq = "!=", GetStart = "{", GetEnd = "}", Prop = ".",
  BracketStart = "(", BracketEnd = ")",
}
```

用法：`{token_id}` 做变量替换，token 即某个控件的 `content[0]`；`.` 做属性访问；值可以是数组，比较时对数组元素做比较。真实例子：

```ts
// https://raw.githubusercontent.com/the-via/reader/master/src/common-menus/qmk_rgblight.ts
{
  showIf: '{id_qmk_rgblight_effect} != 0',
  label: 'Effect Speed', type: 'range', options: [0, 255],
  content: ['id_qmk_rgblight_effect_speed', 2, 3],
},
{
  showIf: '{id_qmk_rgblight_effect} != 0 && {id_qmk_rgblight_effect} != 35',
  label: 'Color', type: 'color',
  content: ['id_qmk_rgblight_color', 2, 4],
},
```

`showIf` 可以挂在 **menu / submenu / slice / item** 四层任意一层，四处的判断逻辑都在 `menu-generator.tsx` 里：

```tsx
// 整个 menu
if ('showIf' in props.viaMenu && !evalExpr(props.viaMenu.showIf as string, props.selectedCustomMenuData)) return [];
// submenu / submenuSlice
const isHidden = 'showIf' in elem && !evalExpr(elem.showIf as string, props.selectedCustomMenuData);
// item / itemSlice
if ('showIf' in elem && !evalExpr(elem.showIf as string, props.selectedCustomMenuData)) return [];
```

另外还有一个「只依赖固件版本」的快速剪枝优化（避免向设备查询不必要的值）：

```ts
// Returns true if the showIf expression references only id_firmware_version
const isFirmwareOnlyExpr = (showIf: string): boolean => {
  try {
    const {state} = parseExpr(showIf);
    const keys = Object.keys(state);
    return keys.length > 0 && keys.every((key) => key === 'id_firmware_version');
  } catch { return false; }
};
```

### 2.3 `customKeycodes`

```ts
// https://raw.githubusercontent.com/the-via/reader/master/src/types.common.ts
/* This specifically does not include code */
export type CustomKeycode = {
  name: string;
  title: string;
  shortName?: string;
};
```

语义：**按数组下标**依次对应 `QK_KB_0 / USER00 / USER01 …`。vial-gui 的实现解释得最直白：

```python
# https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/keycodes/keycodes.py
def create_custom_user_keycodes(custom_keycodes):
    KEYCODES_USER.clear()
    for x, c_keycode in enumerate(custom_keycodes):
        KEYCODES_USER.append(
            Keycode(
                "USER{:02}".format(x),
                c_keycode.get("shortName", "USER{:02}".format(x)),
                c_keycode.get("title",     "USER{:02}".format(x)),
                alias=[c_keycode.get("name", "USER{:02}".format(x))]
            )
        )
```

即第 N 项 → `USER{N:02}` → 整数值 `QK_KB + N`（QMK 里 `QK_KB = 0x7E00`）。

### 2.4 `layouts.keymap` —— KLE 格式规范

**KLE 元素形式**（`the-via/reader/src/types.common.ts`）：

```ts
export type KLEDimensions = Rotation & { a: number; x: number; w: number; h: number; y: number; };
export type OptionalDimensions = Partial<{ x2: number; y2: number; h2: number; w2: number; }>;
export type Result = {h: number; w: number} & Formatting & Dimensions & OptionalDimensions &
  Cursor & Rotation & MatrixPosition & Decal & GroupMeta;

export type KLEElem =
  | Partial<KLEDimensions & OptionalDimensions & Formatting & Ghosted & Stepped & Homing & Decal & TextSize & Profile & SwitchInfo>
  | string;

export type KLELayoutDefinition = (KLEMeta | (string | KLEElem)[])[];
```

也就是：**外层是行数组，行内元素要么是属性对象（作用于后续键）要么是键名字符串**。支持的属性键：`a x y w h x2 y2 w2 h2 r rx ry c t d g l n p sm sb st f f2 fa`。解析器只识别这些（且只对指定几个做「继承到下一个键」的处理，见 `kle-parser.ts` 里 `['y2','x2','w2','h2','r','rx','ry','h','w']`）。

**键名（含 `\n` 的多行形式）→ 语义（重点）**

KLE 的键名用 `\n` 分成若干 legend。VIA **不用原始 legend 下标**，而是先按 KLE 的对齐规则（`align` 字段，`a` 属性，默认 4 = center front）重排到一个 12 槽位的数组：

```python
# https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/kle_serial.py
    labelMap = [
        # 0  1  2  3  4  5  6  7  8  9 10 11   # align flags
        [ 0, 6, 2, 8, 9,11, 3, 5, 1, 4, 7,10], # 0 = no centering
        [ 1, 7,-1,-1, 9,11, 4,-1,-1,-1,-1,10], # 1 = center x
        [ 3,-1, 5,-1, 9,11,-1,-1, 4,-1,-1,10], # 2 = center y
        [ 4,-1,-1,-1, 9,11,-1,-1,-1,-1,-1,10], # 3 = center x & y
        [ 0, 6, 2, 8,10,-1, 3, 5, 1, 4, 7,-1], # 4 = center front (default)
        [ 1, 7,-1,-1,10,-1, 4,-1,-1,-1,-1,-1], # 5 = center front & x
        [ 3,-1, 5,-1,10,-1,-1,-1, 4,-1,-1,-1], # 6 = center front & y
        [ 4,-1,-1,-1,10,-1,-1,-1,-1,-1,-1,-1], # 7 = center front & x & y
    ]
    def reorderLabelsIn(self, labels, align):
        ret = [None] * 12
        for i in range(len(labels)):
            if labels[i]:
                ret[self.labelMap[align][i]] = labels[i]
        return ret
```

重排后的语义槽位（两边实现一致）：

```ts
// https://raw.githubusercontent.com/the-via/reader/master/src/kle-parser.ts
enum KeyDataIndex {
  LED = 6,
  ROWCOL = 0,
  GROUP = 8,
  ENCODER = 4,
}

const ENCODER_REGEX = /^[eE]\d+\s*$/;
const LED_REGEX = /^[lL]\d+\s*$/;

const getKeyData = (normalizedLabels: string[], isDecal?: boolean) => {
  let keyData = {} as any;
  const fakeRowCol = [-1, -1];
  const fakeGroupOption = [-1, 0];

  const encoderLabel = normalizedLabels[KeyDataIndex.ENCODER];
  if (encoderLabel && ENCODER_REGEX.test(encoderLabel)) {
    keyData['ei'] = +encoderLabel.slice(1);
  }
  const ledLabel = normalizedLabels[KeyDataIndex.LED];
  if (ledLabel && LED_REGEX.test(ledLabel)) {
    keyData['li'] = +ledLabel.slice(1);
  }
  const rowColLabel = normalizedLabels[KeyDataIndex.ROWCOL];
  const [row, col] =
    isDecal || (keyData['ei'] !== undefined && !rowColLabel)
      ? fakeRowCol
      : extractPair(rowColLabel);

  const groupLabel = normalizedLabels[KeyDataIndex.GROUP];
  const [group, option] = groupLabel ? extractPair(groupLabel) : fakeGroupOption;
  return { ...keyData, group: {key: group, option}, row, col };
};

// Expects pairs to be in the format "x,y" else throws exception
function extractPair(pair: string) {
  if (!pair) {
    throw new Error(`'Row,col' pairs must be placed in the top-left legend in the KLE keymap provided in the definition.`);
  }
  const arr = pair.split(/[，,]/);      // 注意：同时支持半角与全角逗号
  invariant(arr.length === 2, `${pair} is not a pair`);
  ...
}
```

换算回**默认对齐（a=4）下的 KLE legend 下标**：

| KLE legend 下标 | 重排后槽位 | 含义 | 正则 |
|---|---|---|---|
| 0 | 0 | `"<row>,<col>"` 矩阵坐标 | — |
| 3 | 8 | `"<group>,<option>"` 布局选项分组 | — |
| 6 | 6 | `"l<N>"` LED 索引（per-key RGB） | `/^[lL]\d+\s*$/` |
| 9 | 4 | `"e<N>"` 编码器索引（VIA） | `/^[eE]\d+\s*$/` |

真实定义文件佐证（`the-via/keyboards`，`layouts.keymap` 第一行）：

```json
[[{"x": 2.75, "c": "#777777"}, "0,0", {"c": "#cccccc"}, "0,1", "0,2", ...,
  {"c": "#aaaaaa", "w": 2}, "0,14\n\n\n0,0",
  {"x": 0.5, "c": "#cccccc"}, "0,13\n\n\n0,1", "0,14\n\n\n0,1"], ...]
```
（来源：`https://raw.githubusercontent.com/the-via/keyboards/main/src/duck/eagle_viper/v2/eagle_viper.json`）
→ `"0,14\n\n\n0,0"` = legend[0]=`0,14`（row,col），legend[3]=`0,0`（group 0, option 0）。

**vial 的编码器约定与 VIA 略有差异**（写解析器时要注意）：

```python
# https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/protocol/keyboard_comm.py
for key in kb.keys:
    key.row = key.col = None
    key.encoder_idx = key.encoder_dir = None
    if key.labels[4] == "e":
        idx, direction = key.labels[0].split(",")
        idx, direction = int(idx), int(direction)
        key.encoder_idx = idx
        key.encoder_dir = direction
        ...
    elif key.decal or (key.labels[0] and "," in key.labels[0]):
        row, col = 0, 0
        if key.labels[0] and "," in key.labels[0]:
            row, col = key.labels[0].split(",")
            row, col = int(row), int(col)
        ...
    # bottom right corner determines layout index and option in this layout
    key.layout_index = -1
    key.layout_option = -1
    if key.labels[8]:
        idx, opt = key.labels[8].split(",")
        key.layout_index, key.layout_option = int(idx), int(opt)
```

即 vial 用 `labels[4] == "e"` 做**标记**，`labels[0]` 存 `"<idx>,<direction>"`；VIA 用 `labels[4] == "e<idx>"`。两者下标位置一致（都是重排后槽位 4）。

**解析器输出（给 UI 用）**：

```ts
export type VIALayout = {
  width: number; height: number;
  keys: VIAKey[];
  optionKeys: {[g: string]: {[o: string]: VIAKey[]}};
};
export type VIAKey = Omit<Result, keyof Formatting | 'group'> & { color: KeyColorType; };
export type MatrixPosition = { row: number; col: number; ei?: number; li?: number; };
```

`optionKeys`：所有 `group.key != -1` 的键按 `group → option` 两级收好；`keys`（默认组）是 `group.key === -1` 且 `group.option === 0` 的键；坐标统一平移到原点。

还有一条**颜色校验规则**（超过 3 种颜色会被拒绝，用于给键着色分类）：

```ts
if (colorCountKeys.length > 3) {
  throw new Error('Please correct layout, too many colors:' + '\n' + inspect(colorCount));
}
const colorMap = {
  [colorCountKeys[0]]: KeyColorType.Alpha,
  [colorCountKeys[1]]: KeyColorType.Mod,
  [colorCountKeys[2]]: KeyColorType.Accent,
};
```

#### `labels` 与 `presets`

```ts
export type LayoutLabel = string | string[];    // labels[i] 可为 "组名" 或 ["组名", "选项1", "选项2", ...]
```

真实样例（`eagle_viper.json`）：

```json
"labels": [["Backspace", "Default", "Split"], ["Enter Key", "ANSI", "ISO"],
           ["Left Shift", "Default", "Split"], ["Right Shift", "Default", "Split"],
           ["Bottom Row", "Eagle", "Tsangan", "Viper"]]
```

`labels[i]` 的第 0 项是分组显示名，第 1..n 项是该组各选项的名字；`presets: { [name]: number[] }` 是「预设 → 每组选第几个」的下标数组。

### 2.5 内建菜单（真实可用的 `menus` 示例）

`https://raw.githubusercontent.com/the-via/reader/master/src/common-menus/qmk_backlight.ts`：

```ts
export const qmk_backlight: VIAMenu[] = [
  { label: 'Lighting',
    content: [
      { label: 'Backlight',
        content: [
          { label: 'Backlight Brightness', type: 'range', options: [0, 255],
            content: ['id_qmk_backlight_brightness', 1, 1] },
          { label: 'Backlight Effect', type: 'dropdown',
            content: ['id_qmk_backlight_effect', 1, 2],
            options: [ ['Off', 0], ['Breathing', 1] ] },
        ] },
    ] },
];
```

`qmk_rgblight`：`content: ['id_qmk_rgblight_brightness', 2, 1]` …（channel 2）
`qmk_rgb_matrix`：`content: ['id_qmk_rgb_matrix_brightness', 3, 1]` …（channel 3）

键名到模块的映射：

```ts
export const commonMenus = {
  qmk_audio, qmk_backlight_rgblight, qmk_backlight, qmk_rgb_matrix, qmk_rgblight,
};
```

v3 定义的 `menus` 里写这些字符串即被展开（`menusSlice.ts` 的 `tryResolveCommonMenu`）。

---

## 3. Keycode 体系

### 3.1 权威来源

- **QMK 分段常量**：`https://raw.githubusercontent.com/qmk/qmk_firmware/master/quantum/keycodes.h`（`enum qk_keycode_ranges` + `enum qk_keycode_defines`），这是整数值的唯一真源。文件开头还有版本号：
  ```c
  #define QMK_KEYCODES_VERSION     "0.0.9"
  #define QMK_KEYCODES_VERSION_BCD 0x00000009
  ```
- **via-app 侧的表**：`src/utils/key-to-byte/{default,v10,v11,v12,v13}.ts`（**手维护，随协议/固件版本切换**）。
- **vial-gui 侧的表**：`src/main/python/keycodes/{keycodes_v5,keycodes_v6}.py`。

### 3.2 QMK 分段表（逐字复制 `quantum/keycodes.h`）

```c
enum qk_keycode_ranges {
// Ranges
    QK_BASIC                       = 0x0000,
    QK_BASIC_MAX                   = 0x00FF,
    QK_MODS                        = 0x0100,
    QK_MODS_MAX                    = 0x1FFF,
    QK_MOD_TAP                     = 0x2000,
    QK_MOD_TAP_MAX                 = 0x3FFF,
    QK_LAYER_TAP                   = 0x4000,
    QK_LAYER_TAP_MAX               = 0x4FFF,
    QK_LAYER_MOD                   = 0x5000,
    QK_LAYER_MOD_MAX               = 0x51FF,
    QK_TO                          = 0x5200,
    QK_TO_MAX                      = 0x521F,
    QK_MOMENTARY                   = 0x5220,
    QK_MOMENTARY_MAX               = 0x523F,
    QK_DEF_LAYER                   = 0x5240,
    QK_DEF_LAYER_MAX               = 0x525F,
    QK_TOGGLE_LAYER                = 0x5260,
    QK_TOGGLE_LAYER_MAX            = 0x527F,
    QK_ONE_SHOT_LAYER              = 0x5280,
    QK_ONE_SHOT_LAYER_MAX          = 0x529F,
    QK_ONE_SHOT_MOD                = 0x52A0,
    QK_ONE_SHOT_MOD_MAX            = 0x52BF,
    QK_LAYER_TAP_TOGGLE            = 0x52C0,
    QK_LAYER_TAP_TOGGLE_MAX        = 0x52DF,
    QK_PERSISTENT_DEF_LAYER        = 0x52E0,
    QK_PERSISTENT_DEF_LAYER_MAX    = 0x52FF,
    QK_SWAP_HANDS                  = 0x5600,
    QK_SWAP_HANDS_MAX              = 0x56FF,
    QK_TAP_DANCE                   = 0x5700,
    QK_TAP_DANCE_MAX               = 0x57FF,
    QK_MAGIC                       = 0x7000,
    QK_MAGIC_MAX                   = 0x70FF,
    QK_MIDI                        = 0x7100,
    QK_MIDI_MAX                    = 0x71FF,
    QK_SEQUENCER                   = 0x7200,
    QK_SEQUENCER_MAX               = 0x73FF,
    QK_JOYSTICK                    = 0x7400,
    QK_JOYSTICK_MAX                = 0x743F,
    QK_PROGRAMMABLE_BUTTON         = 0x7440,
    QK_PROGRAMMABLE_BUTTON_MAX     = 0x747F,
    QK_AUDIO                       = 0x7480,
    QK_AUDIO_MAX                   = 0x74BF,
    QK_STENO                       = 0x74C0,
    QK_STENO_MAX                   = 0x751F,
    QK_MACRO                       = 0x7700,
    QK_MACRO_MAX                   = 0x777F,
    QK_CONNECTION                  = 0x7780,
    QK_CONNECTION_MAX              = 0x77BF,
    QK_COMMUNITY_MODULE            = 0x77C0,
    QK_COMMUNITY_MODULE_MAX        = 0x77FF,
    QK_LIGHTING                    = 0x7800,
    QK_LIGHTING_MAX                = 0x78FF,
    QK_QUANTUM                     = 0x7C00,
    QK_QUANTUM_MAX                 = 0x7DFF,
    QK_KB                          = 0x7E00,
    QK_KB_MAX                      = 0x7E3F,
    QK_USER                        = 0x7E40,
    QK_USER_MAX                    = 0x7FFF,
    QK_UNICODEMAP                  = 0x8000,
    QK_UNICODEMAP_MAX              = 0xBFFF,
    QK_UNICODE                     = 0x8000,
    QK_UNICODE_MAX                 = 0xFFFF,
    QK_UNICODEMAP_PAIR             = 0xC000,
    QK_UNICODEMAP_PAIR_MAX         = 0xFFFF,
};
```

Basic 段逐个 keycode（`enum qk_keycode_defines`，摘录开头）：

```c
    KC_NO = 0x0000,
    KC_TRANSPARENT = 0x0001,
    KC_A = 0x0004, KC_B = 0x0005, KC_C = 0x0006, KC_D = 0x0007, KC_E = 0x0008,
    KC_F = 0x0009, KC_G = 0x000A, KC_H = 0x000B, KC_I = 0x000C, KC_J = 0x000D,
    KC_K = 0x000E, KC_L = 0x000F, KC_M = 0x0010, KC_N = 0x0011, KC_O = 0x0012,
    KC_P = 0x0013, KC_Q = 0x0014, KC_R = 0x0015, KC_S = 0x0016, KC_T = 0x0017,
    KC_U = 0x0018, KC_V = 0x0019, KC_W = 0x001A, KC_X = 0x001B, KC_Y = 0x001C,
    KC_Z = 0x001D, KC_1 = 0x001E, ...
```

### 3.3 ⚠️ 同名不同值：协议/固件版本切换

via-app 有两套完全不同的「同名」分区常量。**`key-to-byte/v12.ts`（新，和 QMK master 一致）**：

```ts
// Keycodes starting with _ are not real keycodes.
// They are used to version constants used in
// advanced keycodes.
export default {
  _QK_MODS: 0x0100,                  _QK_MODS_MAX: 0x1fff,
  _QK_MOD_TAP: 0x2000,               _QK_MOD_TAP_MAX: 0x3fff,
  _QK_LAYER_TAP: 0x4000,             _QK_LAYER_TAP_MAX: 0x4fff,
  _QK_LAYER_MOD: 0x5000,             _QK_LAYER_MOD_MAX: 0x51ff,
  _QK_TO: 0x5200,                    _QK_TO_MAX: 0x521f,
  _QK_MOMENTARY: 0x5220,             _QK_MOMENTARY_MAX: 0x523f,
  _QK_DEF_LAYER: 0x5240,             _QK_DEF_LAYER_MAX: 0x525f,
  _QK_TOGGLE_LAYER: 0x5260,          _QK_TOGGLE_LAYER_MAX: 0x527f,
  _QK_ONE_SHOT_LAYER: 0x5280,        _QK_ONE_SHOT_LAYER_MAX: 0x529f,
  _QK_ONE_SHOT_MOD: 0x52a0,          _QK_ONE_SHOT_MOD_MAX: 0x52bf,
  _QK_LAYER_TAP_TOGGLE: 0x52c0,      _QK_LAYER_TAP_TOGGLE_MAX: 0x52df,
  _QK_LAYER_MOD_MASK: 0x1f,
  _QK_MACRO: 0x7700,                 _QK_MACRO_MAX: 0x777f,
  _QK_KB: 0x7e00,                    _QK_KB_MAX: 0x7eff,
  KC_NO: 0x0000, KC_TRNS: 0x0001, KC_A: 0x0004, ...
```

**`key-to-byte/default.ts`（老）**：

```ts
export default {
  _QK_MODS: 0x0100,                  _QK_MODS_MAX: 0x1fff,
  _QK_MOD_TAP: 0x6000,               _QK_MOD_TAP_MAX: 0x7fff,     // ← 不同！
  _QK_LAYER_TAP: 0x4000,             _QK_LAYER_TAP_MAX: 0x4fff,
  _QK_LAYER_MOD: 0x5900,             _QK_LAYER_MOD_MAX: 0x59ff,   // ← 不同！
  _QK_TO: 0x5010,                    _QK_TO_MAX: 0x501f,          // ← 不同！
  _QK_MOMENTARY: 0x5100,             _QK_MOMENTARY_MAX: 0x511f,   // ← 不同！
  _QK_DEF_LAYER: 0x5200,             _QK_DEF_LAYER_MAX: 0x521f,
  _QK_TOGGLE_LAYER: 0x5300,          _QK_TOGGLE_LAYER_MAX: 0x531f,// ← 不同！
  _QK_ONE_SHOT_LAYER: 0x5400,        _QK_ONE_SHOT_LAYER_MAX: 0x541f,// ← 不同！
  _QK_ONE_SHOT_MOD: 0x5500,          _QK_ONE_SHOT_MOD_MAX: 0x55ff,// ← 不同！
  _QK_LAYER_TAP_TOGGLE: 0x5800,      _QK_LAYER_TAP_TOGGLE_MAX: 0x581f,// ← 不同！
  _QK_LAYER_MOD_MASK: 0x0f,                                        // ← 不同！
  _QK_MACRO: 0x5f12,                 _QK_MACRO_MAX: 0x5f21,        // ← 不同！
  _QK_KB: 0x5f80,                    _QK_KB_MAX: 0x5f8f,           // ← 不同！
  ...
```

vial-gui 也有同样的两套（`keycodes_v5.py` vs `keycodes_v6.py` 的 `kc` 字典）。

**选择逻辑**：via-app 按 protocol 版本选表（`dictionary-store.ts`，见 1.6 ⑤）；vial-gui 按 `Keycode.protocol` 选：

```python
# https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/keycodes/keycodes.py
    @classmethod
    def resolve(cls, qmk_constant):
        """ Translates a qmk_constant into firmware-specific integer keycode or macro constant """
        if cls.protocol == 6: kc = keycodes_v6.kc
        else:                 kc = keycodes_v5.kc
        if qmk_constant not in kc:
            raise RuntimeError("unable to resolve qmk_id={}".format(qmk_constant))
        return kc[qmk_constant]
```

### 3.4 Modifier 位掩码（app 侧常量）

via-app（`src/utils/advanced-keys.ts`）：

```ts
const modCodes = {
  QK_LCTL: 0x0100, QK_LSFT: 0x0200, QK_LALT: 0x0400, QK_LGUI: 0x0800,
  QK_RMODS_MIN: 0x1000,
  QK_RCTL: 0x1100, QK_RSFT: 0x1200, QK_RALT: 0x1400, QK_RGUI: 0x1800,
};

const modMasks = {
  MOD_LCTL: 0x0001, MOD_LSFT: 0x0002, MOD_LALT: 0x0004, MOD_LGUI: 0x0008,
  MOD_RCTL: 0x0011, MOD_RSFT: 0x0012, MOD_RALT: 0x0014, MOD_RGUI: 0x0018,
  MOD_HYPR: 0x000f, MOD_MEH:  0x0007,
};
```

QMK 侧（`keycodes.h` 里 `MOD_*` 是一致的 4-bit 掩码；`QK_*MODS` 是 QK_MODS 段里的实际值）。

### 3.5 各类 keycode 的编码 / 解码公式（位运算）

via-app `src/utils/advanced-keys.ts` 的 `parseTopLevelMacro` 里把每个宏的 C 定义作为注释写死了，**这是最可靠的一手资料**：

```ts
    case 'MO': case 'DF': case 'TG': case 'OSL': case 'TT': case 'TO':
      layer = Number.parseInt(parameter);
      if (layer < 0) { return 0; }
      return basicKeyToByte[topLevelMacroToValue[topLevelKey]] | (layer & 0xff);

    case 'OSM': //#define OSM(mod) (QK_ONE_SHOT_MOD | ((mod)&0xFF))
      mods = parseMods(parameter);
      if (mods === 0) { return 0; }
      return basicKeyToByte[topLevelMacroToValue[topLevelKey]] | (mods & 0xff);

    case 'LM': //#define LM(layer, mod) (QK_LAYER_MOD | (((layer)&0xF) << 4) | ((mod)&0xF))
      [param1, param2] = parameter.split(',').map((s) => s.trim());
      let mask = basicKeyToByte._QK_LAYER_MOD_MASK;
      let shift = Math.log2(mask + 1);
      layer = Number.parseInt(param1);
      mods = parseMods(param2);
      if (layer < 0 || mods === 0) { return 0; }
      return basicKeyToByte[topLevelMacroToValue[topLevelKey]] | ((layer & 0xf) << shift) | (mods & mask);

    case 'LT': //#define LT(layer, kc) (QK_LAYER_TAP | (((layer)&0xF) << 8) | ((kc)&0xFF))
      [param1, param2] = parameter.split(',').map((s) => s.trim());
      layer = Number.parseInt(param1);
      if (layer < 0 || !basicKeyToByte.hasOwnProperty(param2)) { return 0; }
      return basicKeyToByte[topLevelMacroToValue[topLevelKey]] | ((layer & 0xf) << 8) | basicKeyToByte[param2];

    case 'MT': // #define MT(mod, kc) (QK_MOD_TAP | (((mod)&0x1F) << 8) | ((kc)&0xFF))
      [param1, param2] = parameter.split(',').map((s) => s.trim());
      mods = parseMods(param1);
      if (mods === 0 || !basicKeyToByte.hasOwnProperty(param2)) { return 0; }
      return basicKeyToByte[topLevelMacroToValue[topLevelKey]] | ((mods & 0x1f) << 8) | (basicKeyToByte[param2] & 0xff);

    case 'CUSTOM': {
      const n = Number.parseInt(parameter);
      const nMax = basicKeyToByte._QK_KB_MAX - basicKeyToByte._QK_KB;
      if (n >= 0 && n <= nMax) { return basicKeyToByte[topLevelMacroToValue[topLevelKey]] + n; }
      return 0;
    }
    case 'MACRO': {
      const n = Number.parseInt(parameter);
      const nMax = basicKeyToByte._QK_MACRO_MAX - basicKeyToByte._QK_MACRO;
      if (n >= 0 && n <= nMax) { return basicKeyToByte[topLevelMacroToValue[topLevelKey]] + n; }
      return 0;
    }
```

名字 → 分区的映射表：

```ts
const topLevelMacroToValue = {
  MT: '_QK_MOD_TAP',          // MT(mod, kc)
  LT: '_QK_LAYER_TAP',        // LT(layer, kc)
  LM: '_QK_LAYER_MOD',        // LM(layer, mod)
  TO: '_QK_TO',               // TO(layer)
  MO: '_QK_MOMENTARY',        // MO(layer)
  DF: '_QK_DEF_LAYER',        // DF(layer)
  TG: '_QK_TOGGLE_LAYER',     // TG(layer)
  OSL: '_QK_ONE_SHOT_LAYER',  // OSL(layer)
  OSM: '_QK_ONE_SHOT_MOD',    // OSM(mod)
  TT: '_QK_LAYER_TAP_TOGGLE', // TT(layer)
  CUSTOM: '_QK_KB',           // CUSTOM(n)
  MACRO: '_QK_MACRO',         // MACRO(n)
};
```

**整数 → 字符串** 的核心是「先找区间，再剥高位的和」：

```ts
export const advancedKeycodeToString = (inputKeycode, basicKeyToByte, byteToKey): string | null => {
  let valueToRange: [number, string][] = Object.entries(quantumRanges(basicKeyToByte))
    .map(([key, value]) => [value, key]);

  /* Find the range we are in first */
  let lastRange = null;
  let lastValue: number = -1;
  for (let i = 0; i < valueToRange.length; i += 2) {
    if (inputKeycode >= valueToRange[i][0] && inputKeycode <= valueToRange[i + 1][0]) {
      lastRange = valueToRange[i][1];
      lastValue = +valueToRange[i][0];
    }
  }

  const topLevelModKeys = ['_QK_MODS'];
  if (topLevelModKeys.includes(lastRange as string)) {
    return topLevelModToString(inputKeycode, byteToKey);
  }
  let humanReadable: string | null = (topLevelValueToMacro(basicKeyToByte) as any)[lastValue] + '(';
  let remainder = inputKeycode & ~lastValue;
  ...
  switch (lastRange) {
    case '_QK_KB':
    case '_QK_MACRO':   humanReadable += inputKeycode - lastValue + ')'; break;
    case '_QK_MOMENTARY': case '_QK_DEF_LAYER': case '_QK_TOGGLE_LAYER':
    case '_QK_ONE_SHOT_LAYER': case '_QK_LAYER_TAP_TOGGLE': case '_QK_TO':
      humanReadable += remainder + ')'; break;
    case '_QK_LAYER_TAP':
      layer = remainder >> 8; keycode = byteToKey[remainder & 0xff];
      humanReadable += layer + ',' + keycode + ')'; break;
    case '_QK_ONE_SHOT_MOD':
      humanReadable += modValueToString(remainder) + ')'; break;
    case '_QK_LAYER_MOD':
      let mask = basicKeyToByte._QK_LAYER_MOD_MASK;
      let shift = Math.log2(mask + 1);
      layer = remainder >> shift; modValue = remainder & mask;
      humanReadable += layer + ',' + modValueToString(modValue) + ')'; break;
    case '_QK_MOD_TAP':
      modValue = (remainder >> 8) & 0x1f; keycode = byteToKey[remainder & 0xff];
      humanReadable += modValueToString(modValue) + ',' + keycode + ')'; break;
    default: humanReadable = null;
  }
  return humanReadable;
};
```

`_QK_MODS`（含所有 `LCTL(kc)` 之类）的解码：

```ts
const topLevelModToString = (keycode: number, byteToKey: Record<number, string>): string => {
  const containedKeycode = byteToKey[keycode & 0x00ff];
  const modifierValue = keycode & 0x1f00;
  // if we find an exact match (like HYPR or MEH or LAG), use that
  const modifierKey = modifierValueToKey[modifierValue];
  if (modifierKey != undefined) { return modifierKey + '(' + containedKeycode + ')'; }

  // Left and right mods are mutually exclusive.
  // Test the bit which is common to all right mods,
  // and generate the string from one of two lookups.
  const enabledMods = Object.entries(
    modifierValue & modCodes.QK_RMODS_MIN ? rightModifierValueToKey : leftModifierValueToKey,
  ).filter((part) => {
      const current = Number.parseInt(part[0]);
      return (current & modifierValue) === current;
    }).map((part) => part[1]);
  return enabledMods.join('(') + '(' + containedKeycode + ')'.repeat(enabledMods.length);
};
```

**「判断一个 keycode 属于哪一类」的最简位运算判据**（从上面代码反推出的实践结论）：

```
keycode < 0x0100                                     → Basic / HID usage (KC_xxx)
(keycode & 0x1F00) 非零 且 keycode < 0x2000           → QK_MODS：Modify+Basic
0x2000 ≤ keycode ≤ 0x3FFF                            → QK_MOD_TAP：MT(mod, kc)
0x4000 ≤ keycode ≤ 0x4FFF                            → QK_LAYER_TAP：LT(layer, kc)
0x5000 ≤ keycode ≤ 0x51FF                            → QK_LAYER_MOD：LM(layer, mod)
0x5200 ≤ keycode ≤ 0x52FF                            → TO / MO / DF / TG / OSL / OSM / TT / PDF 等
0x5600 ≤ keycode ≤ 0x56FF                            → Swap hands
0x5700 ≤ keycode ≤ 0x57FF                            → Tap dance  TD(n)
0x7000 ≤ keycode ≤ 0x70FF                            → Magic
0x7700 ≤ keycode ≤ 0x777F                            → Macro  M(n)
0x7800 ≤ keycode ≤ 0x78FF                            → Lighting (RGB/RM/UG)
0x7C00 ≤ keycode ≤ 0x7DFF                            → Quantum 杂项
0x7E00 ≤ keycode ≤ 0x7E3F                            → QK_KB / USERnn（对应 customKeycodes）
0x7E40 ≤ keycode ≤ 0x7FFF                            → QK_USER
≥ 0x8000                                             → Unicode / UnicodeMap
```

**注意 `_QK_MODS` 与 `QK_MOD_TAP` 的边界**：分区判定必须**按「从 MIN 到 MAX 的成对区间」线性扫描**（如 `advancedKeycodeToString` 那样），不能只看高位，因为老版本的区间划分（0x6000 才是 MOD_TAP）完全不同。

### 3.6 vial-gui 的「mask keycode」抽象（值得直接抄）

vial 用一个巧妙的办法统一处理「带子 keycode 的 keycode」：名字里带 `(kc)` 后缀的 keycode，都被登记进 `masked` 集合，**keycode 的高 8 位是 outer、低 8 位是 inner**：

```python
# https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/keycodes/keycodes.py
    @classmethod
    def serialize(cls, code):
        """ Converts integer keycode to string """
        if cls.protocol == 6: masked = keycodes_v6.masked
        else:                 masked = keycodes_v5.masked

        if (code & 0xFF00) not in masked:
            kc = RAWCODES_MAP.get(code)
            if kc is not None: return kc.qmk_id
        else:
            outer = RAWCODES_MAP.get(code & 0xFF00)
            inner = RAWCODES_MAP.get(code & 0x00FF)
            if outer is not None and inner is not None:
                return outer.qmk_id.replace("kc", inner.qmk_id)
        return hex(code)

    @classmethod
    def find_outer_keycode(cls, qmk_id):
        """ Finds outer keycode, i.e. if it is masked like 0x5Fxx, just return the 0x5F00 portion """
        if cls.is_mask(qmk_id): qmk_id = qmk_id[:qmk_id.find("(")]
        return cls.find(qmk_id)

    @classmethod
    def find_inner_keycode(cls, qmk_id):
        """ Finds inner keycode, i.e. if it is masked like 0x5F12, just return the 0x12 portion """
        if cls.is_mask(qmk_id): qmk_id = qmk_id[qmk_id.find("(")+1:-1]
        return cls.find(qmk_id)
```

```python
# https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/keycodes/keycodes_v5.py（末尾）
for name, val in keycodes_v5.kc.items():
    if name.endswith("(kc)"):
        keycodes_v5.masked.add(val)
```

动态生成（可枚举范围随设备层/宏数变化）：

```python
for x in range(256):
    keycodes_v5.kc["M{}".format(x)]      = keycodes_v5.kc["QK_MACRO"] + x
    keycodes_v5.kc["TD({})".format(x)]   = keycodes_v5.kc["QK_TAP_DANCE"] + x
for x in range(32):
    keycodes_v5.kc["MO({})".format(x)]   = keycodes_v5.kc["QK_MOMENTARY"] | x
    keycodes_v5.kc["DF({})".format(x)]   = keycodes_v5.kc["QK_DEF_LAYER"] | x
    keycodes_v5.kc["TG({})".format(x)]   = keycodes_v5.kc["QK_TOGGLE_LAYER"] | x
    keycodes_v5.kc["TT({})".format(x)]   = keycodes_v5.kc["QK_LAYER_TAP_TOGGLE"] | x
    keycodes_v5.kc["OSL({})".format(x)]  = keycodes_v5.kc["QK_ONE_SHOT_LAYER"] | x
    keycodes_v5.kc["TO({})".format(x)]   = keycodes_v5.kc["QK_TO"] | (1 << 4) | x
    keycodes_v5.kc["PDF({})".format(x)]  = keycodes_v5.kc["QK_PERSISTENT_DEF_LAYER"] + x
for x in range(16):
    keycodes_v5.kc["LT{}(kc)".format(x)] = keycodes_v5.kc["QK_LAYER_TAP"] | (((x) & 0xF) << 8)
for x in range(64):
    keycodes_v5.kc["USER{:02}".format(x)] = keycodes_v5.kc["QK_KB"] + x
```

> 注意 `TO(x)` 的老公式是 `QK_TO | (1 << 4) | x`（因为老 schema 里 QK_TO=0x5000 且 TO 从 0x5010 开始），新 schema（v12/v13 + QMK master）是 `QK_TO | x`。**这是典型坑点。**

---

## 4. vial-gui 模块划分（本地桌面版参考）

仓库：`https://github.com/vial-kb/vial-gui`（Python + PyQt5）。

### 4.1 目录结构（`src/main/python/`）

```
src/main/python/
├── main.py                      # 入口：QApplication / 命令行参数（--sideload 等）
├── webmain.py                   # emscripten(Web 版) 入口
├── main_window.py               # QMainWindow：设备下拉框 + Tab 装载 + 重载/保存/flash 菜单
├── vial_device.py               # 设备抽象：VialDevice(base) / VialKeyboard / VialBootloader / VialDummyKeyboard
├── hidproxy.py                  # hid 后端代理：linux→hidraw，emscripten→vialglue，其它→hid(cython-hidapi)
├── util.py                      # hid_send()/MSG_LEN/is_rawhid/find_vial_devices/KeycodeDisplay
├── unlocker.py                  # 安全键盘解锁（按住组合键）
├── constants.py                 # WINDOW_WIDTH / WINDOW_HEIGHT
├── kle_serial.py                # KLE → 几何对象（移植自 ijprest/kle-serial）
├── keymaps.py                   # 各国 keymap 覆盖（显示标签）
├── tabbed_keycodes.py           # 左侧「按分类分 Tab 的 keycode 面板」
├── about_keyboard.py            # 键盘信息（JSON dump 窗口）
├── themes.py
├── protocol/                    # ★ 协议层（只做字节收发 + 状态解析）
│   ├── constants.py             # 所有命令常量、VIAL_PROTOCOL_* 能力阈值、BUFFER_FETCH_CHUNK
│   ├── base_protocol.py         # BaseProtocol：动态条目通用读取
│   ├── keyboard_comm.py         # ★ Keyboard 类（mixin 组合）：核心，聚合全部能力
│   ├── dynamic.py               # 动态条目数量查询
│   ├── combo.py / tap_dance.py / key_override.py / alt_repeat_key.py
│   ├── macro.py                 # VIA/Macro 读写 + v1/v2 序列化
│   └── dummy_keyboard.py        # 离线假设备
├── keycodes/
│   ├── keycodes.py              # ★ Keycode 类 + 所有 KEYCODES_* 分组列表 + Map + 动态重建
│   ├── keycodes_v5.py           # 老一套 {名字:整数} 表
│   └── keycodes_v6.py           # 新一套 {名字:整数} 表
├── editor/                      # ★ UI 编辑器（每个 Tab 一个）
│   ├── basic_editor.py          # 基类：valid()/rebuild()/on_container_clicked()
│   ├── keymap_editor.py         # 键位 Tab
│   ├── layout_editor.py         # 布局选项 Tab
│   ├── macro_recorder.py        # 宏 Tab
│   ├── combos.py / tap_dance.py / key_override.py / alt_repeat_key.py
│   ├── qmk_settings.py          # QMK Settings Tab
│   ├── rgb_configurator.py      # RGB Tab
│   ├── firmware_flasher.py      # 刷机 Tab（VIBL bootloader）
│   └── matrix_test.py           # 按键矩阵测试 Tab
├── macro/
│   ├── macro_action.py          # SS_* 动作协议常量 + ActionText/Tap/Down/Up/Delay 类
│   ├── macro_action_ui.py
│   ├── macro_line.py / macro_key.py / macro_optimizer.py / macro_tab.py
│   └── macro_recorder_linux.py / macro_recorder_windows.py
├── widgets/                     # 自绘控件
│   ├── keyboard_widget.py       # ★ 键盘渲染（缩放/拖动/选中/per-key 涂色）
│   ├── key_widget.py            # 单键渲染（mask 显示等）
│   ├── editor_container.py      # 编辑器 + 左侧面板容器
│   ├── tab_widget_keycodes.py
│   ├── display_keyboard.py / display_keyboard_defs.py
│   ├── flowlayout.py / square_button.py / clickable_label.py / checkbox_no_padding.py
└── autorefresh/                 # 自动检测设备插拔（autorefresh_thread / _win / _web）
```

### 4.2 主要模块职责

| 模块 | 职责 | 关键摘录 |
|---|---|---|
| `vial_device.py` | **设备 + 生命周期**。`VialKeyboard.open()` 里同时构造 `Keyboard` 并 `reload()`；`send()`/`recv()` 封装 hidapi | `self.keyboard = Keyboard(self.dev); self.keyboard.reload(override_json)` |
| `hidproxy.py` | **跨平台 HID 后端**。linux 用 `hidraw`，Web 用 `vialglue`（JS bridge），其余用 `hid` | `if sys.platform == "emscripten": ... elif sys.platform.startswith("linux"): import hidraw as hid else: import hid` |
| `util.py::hid_send` | **唯一的原子收发原语**：padding 到 32、`\x00`+msg 写入、500ms read、`retries` | 见 1.9 |
| `util.py::find_vial_devices` | **设备发现**（序列号魔法串 / VIA VPID 兜底） | 见 1.7 |
| `util.py::KeycodeDisplay` | **显示名解耦**：国家 keymap 可覆盖 keycode 标签 | `cls.keymap_override[Keycode.find_outer_keycode(code).qmk_id]` |
| `protocol/keyboard_comm.py::Keyboard` | **协议状态机**（最重要的类）。用 mixin 组合能力：`class Keyboard(ProtocolMacro, ProtocolDynamic, ProtocolTapDance, ProtocolCombo, ProtocolKeyOverride, ProtocolAltRepeatKey)` | `reload()` 里严格分阶段：先 layout→layers→macros→rgb→settings→dynamic，**然后 `recreate_keyboard_keycodes(self)`**，最后才 `reload_keymap()` |
| `protocol/constants.py` | 全部命令 id + VIAL 能力阈值 | `VIAL_PROTOCOL_ADVANCED_MACROS=2` / `MATRIX_TESTER=3` / `DYNAMIC=4` / `QMK_SETTINGS=4` / `EXT_MACROS=5` / `KEY_OVERRIDE=5` |
| `keycodes/keycodes.py` | **keycode 元数据中心**：类定义 + 分组列表 + 双向 Map + 随设备动态重建 | `recreate_keyboard_keycodes(keyboard)` |
| `kle_serial.py` | KLE → Key 对象（含 labelMap 重排） | 见 2.4 |
| `widgets/keyboard_widget.py` | 键盘自绘，`KeycodeDisplay.display_keycode` 负责给每个键上文本 | — |
| `editor/basic_editor.py` | Tab 基类，**极其精简** | 下面摘录 |

```python
# https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/editor/basic_editor.py
class BasicEditor(QWidget):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.keyboard = None

    def valid(self, layout):
        return True

    def rebuild(self, device_id):
        self.keyboard = None

    def on_container_clicked(self):
        pass

    def deactivate(self):
        pass
```

### 4.3 vial 是怎么做「定义驱动 UI」的

这是整个项目最有参考价值的一点，和 via-app 的思路**完全相反**：

1. **定义文件不存在磁盘上，而是存在固件里**，通过扩展命令拉取（LZMA 压缩的 JSON）：
   ```python
   # protocol/keyboard_comm.py
   data = self.usb_send(self.dev, struct.pack("BB", CMD_VIA_VIAL_PREFIX, CMD_VIAL_GET_KEYBOARD_ID), retries=20)
   self.vial_protocol, self.keyboard_id = struct.unpack("<IQ", data[0:12])

   data = self.usb_send(self.dev, struct.pack("BB", CMD_VIA_VIAL_PREFIX, CMD_VIAL_GET_SIZE), retries=20)
   sz = struct.unpack("<I", data[0:4])[0]

   payload = b""
   block = 0
   while sz > 0:
       data = self.usb_send(self.dev, struct.pack("<BBI", CMD_VIA_VIAL_PREFIX, CMD_VIAL_GET_DEFINITION, block), retries=20)
       if sz < MSG_LEN: data = data[:sz]
       payload += data; block += 1; sz -= MSG_LEN

   payload = json.loads(lzma.decompress(payload))
   ```
   （也支持 `sideload_json` 从本地文件加载 —— 这对离线/自定义设备非常有用）

2. **「UI 元素数量由固件能力决定，而不是由 JSON 决定」**：
   ```python
   def recreate_keyboard_keycodes(keyboard):
       """ Generates keycodes based on information the keyboard provides (e.g. layer keycodes, macros) """
       Keycode.protocol = keyboard.vial_protocol
       layers = keyboard.layers
       def generate_keycodes_for_mask(label, description, requires_feature=None):
           keycodes = []
           for layer in range(layers):
               lbl = "{}({})".format(label, layer)
               keycodes.append(Keycode(lbl, lbl, description, requires_feature=requires_feature))
           return keycodes
       KEYCODES_LAYERS.extend(generate_keycodes_for_mask("MO", ...))
       KEYCODES_LAYERS.extend(generate_keycodes_for_mask("DF", ...))
       ...
       for x in range(keyboard.macro_count):
           KEYCODES_MACRO.append(Keycode("M{}".format(x), ...))
       for x in range(keyboard.tap_dance_count):
           KEYCODES_TAP_DANCE.append(Keycode("TD({})".format(x), ...))
       # Check if custom keycodes are defined in keyboard, and if so add them to user keycodes
       if keyboard.custom_keycodes is not None and len(keyboard.custom_keycodes) > 0:
           create_custom_user_keycodes(keyboard.custom_keycodes)
       else:
           create_user_keycodes()
       create_midi_keycodes(keyboard.midi)
       recreate_keycodes()
       # Hide keycodes where .requires_feature isn't supported by the keyboard.
       for kc in KEYCODES:
           kc.hidden = not kc.is_supported_by(keyboard)
   ```

3. **QMK Settings 也是「问固件有什么，再渲染」**（枚举式发现，不需要定义文件描述）：
   ```python
   cur = 0
   while cur != 0xFFFF:
       data = self.usb_send(self.dev, struct.pack("<BBH", CMD_VIA_VIAL_PREFIX, CMD_VIAL_QMK_SETTINGS_QUERY, cur), retries=20)
       for x in range(0, len(data), 2):
           qsid = int.from_bytes(data[x:x+2], byteorder="little")
           cur = max(cur, qsid)
           if qsid != 0xFFFF: self.supported_settings.add(qsid)
   ```

4. **VIAL 自己的命令走 `0xFE` 前缀namespace**（不污染标准 VIA 命令空间），这点和 v-app 的 `UI_SYNC_REQUEST 0x16` 是同类做法：
   ```python
   CMD_VIA_VIAL_PREFIX = 0xFE
   CMD_VIAL_GET_KEYBOARD_ID = 0x00
   CMD_VIAL_GET_SIZE = 0x01
   CMD_VIAL_GET_DEFINITION = 0x02
   CMD_VIAL_GET_ENCODER = 0x03
   CMD_VIAL_SET_ENCODER = 0x04
   CMD_VIAL_GET_UNLOCK_STATUS = 0x05
   CMD_VIAL_UNLOCK_START = 0x06
   CMD_VIAL_UNLOCK_POLL = 0x07
   CMD_VIAL_LOCK = 0x08
   CMD_VIAL_QMK_SETTINGS_QUERY = 0x09
   CMD_VIAL_QMK_SETTINGS_GET = 0x0A
   CMD_VIAL_QMK_SETTINGS_SET = 0x0B
   CMD_VIAL_QMK_SETTINGS_RESET = 0x0C
   CMD_VIAL_DYNAMIC_ENTRY_OP = 0x0D
   ```

5. **Macro 字节流 Protocol**（`macro/macro_action.py` + `protocol/macro.py`）：
   ```python
   SS_QMK_PREFIX = 1
   SS_TAP_CODE = 1
   SS_DOWN_CODE = 2
   SS_UP_CODE = 3
   SS_DELAY_CODE = 4
   VIAL_MACRO_EXT_TAP = 5
   VIAL_MACRO_EXT_DOWN = 6
   VIAL_MACRO_EXT_UP = 7
   ```
   v1（无前缀）：`[SS_TAP_CODE, kc]`，普通字节即 UTF-8 文本。
   v2（有 `SS_QMK_PREFIX=1` 前缀）：`[1, act, kc]`，扩展 keycode（>255）用 `VIAL_MACRO_EXT_*` + 两个字节。
   切换到 v2 的阈值是 `VIAL_PROTOCOL_ADVANCED_MACROS = 2`。

---

## 5. 未能确认的信息

以下条目在本次采集中**没有拿到权威依据**，请勿当作事实使用：

| # | 内容 | 尝试过的 URL / 方法 | 现状 |
|---|---|---|---|
| 1 | **VIA 协议版本号的完整历史 changelog**（每个版本到底引入了哪些命令，逐字官方说明） | QMK `quantum/via.h` / `via.c` 里**没有**版本历史注释；`https://www.caniusevia.com/docs/protocol`（未成功抓取）；`the-via/docs` 仓库在 jsDelivr 返回 404 | 只确认了代码里的行为阈值（7/8/11/13），没有官方的文字版历史表。1.6 节的结论是**从代码行为反推**的 |
| 2 | **`UI_SYNC_REQUEST = 0x16` 的固件侧实现** | QMK 核心 `via.c` 里**没有** 0x16 | 只见于 via-app 客户端（`parseUISyncRequest`）。推测是 VIA 自有固件（非 QMK）特性，**无法确认报文的确切来源与触发时机** |
| 3 | **`CustomFeaturesV2.RotaryEncoder = 'rotary-encoder'` 具体如何改变 UI 行为** | 只在 `types.v2.ts` 看到枚举定义；未在 via-app 中找到消费 `customFeatures` 的代码 | 未确认 |
| 4 | **v3 定义的 `DynamicDefinitionName`（从固件读名字）的实际 `options`/`content` 用法** | 类型定义见到了，但没找到解析它的代码路径（`loadDefinitionName` 在 `definitionNameSlice.ts`，未抓取） | 未确认 |
| 5 | **`RangeConstraint` 的 `onViolation: 'clamp' \| 'push'` 在 `range-constraints.ts` 之外的语义** | 抓取了 `range-constraints.ts` 的前 30 行，`resolveRangeChange` / `getRangeBounds` 实现未完整阅读 | 部分确认（encode/decode 确认，约束求解未确认） |
| 6 | **`menus` 里 `type: 'label'` + `BindableContent` 组合时到底如何取值显示** | 代码里两个分支都看到了，但没有真机/样例 JSON 佐证 | 部分确认 |
| 7 | **带 `customMenus` 的真实 VIA JSON 定义样例** | 已检查 `the-via/keyboards` 的 `duck/eagle_viper`、`other/hub16`、`other/dz60`、`other/id80` 等，全部**只有 `name/vendorId/productId/lighting/matrix/layouts`**，无 `customMenus`；repo 里也**没有 `v3/` 目录**（v3 定义是构建期生成的） | 未取到真实 `menus` JSON；本章的示例来自 `the-via/reader/src/common-menus/*.ts`（TS 源码），JSON 形式需按 TS 字面量结构推导 |
| 8 | **`the-via/keycodes` 这个仓库是否存在及其内容** | GitHub API 未直接验证（被限流）；via-app 实际使用的是 `src/utils/key-to-byte/*.ts`（手维护 TS 表） | 未确认；**建议把 `key-to-byte/*.ts` 当作 via-app 侧的真源** |
| 9 | **`VIA_PROTOCOL_VERSION = 0x000D`（13）下 `_QK_*` 具体哪些变了** | `v13.ts` 拿到了（在 v12 基础上把 `RGB_*` 换成 `RM_*`/`UG_*`），但没做逐值与 QMK `keycodes.h` 的完整比对 | 未逐项核对 |
| 10 | **`id_switch_matrix_state` 的响应在 VIA 默认固件下是否真的全 0** | `via.c` 里看到 `#if defined(VIA_INSECURE) ... #else matrix_row_t value = 0;` | 代码已明确（默认是 0），但「有哪些键盘开了 VIA_INSECURE」未确认 |
| 11 | **vial-gui 的 `kle_serial.py` 里 `labels[4]` 的编码器约定是否适用于最新 vial 固件** | 只读了 `keyboard_comm.py` 当前版本 | 代码确认为「当前」，不保证历史 JSON 兼容 |

### 采集环境备注

- `raw.githubusercontent.com` **时通时不通**（多次 `CONNECT tunnel failed, response 502`），本次实际是通过 **jsDelivr CDN**（`https://cdn.jsdelivr.net/gh/<repo>@<branch>/<path>`）与 **GitHub Contents API** 取到的；已抽样验证 jsdelivr 内容与 raw 完全一致（`diff` 无差异）。
- GitHub REST API 匿名限流为 **60 次/小时**，导致 `quantum/dynamic_keymap.c` 等少量文件首轮失败（已全部通过 jsdelivr 补齐）。
- 因代理问题，`WebFetch` 对 caniusevia.com 未成功。

---

## 6. 给架构师的建议

### 6.1 可以直接抄的

1. **32 字节 / report id `0x00` / 「回显 buffer」的模型**。这是整个协议最优雅的地方：**响应 = 请求 + 追加的返回值**，所以解析极其简单且天然具备「命令序列号」语义（校验 `[0]` 和参数回显就能防串包）。务必照做：
   ```
   resp[0] === req[0] && resp.slice(1, req.length) === req.slice(1)   → 有效
   resp[0] === 0xFF                                                    → 固件不支持
   ```
2. **命令常量表**（1.2 节）与 **value_id 表**（1.4 节）：一字不改照抄。
3. **channel / value_id 分层**（1.5 节）：用 `(channel, value_id)` 二级寻址代替「一个大 flat 枚举」，是扩展性最好的设计。
4. **大 buffer 的分块 + 「写完成握手」**：keymap/macro 均 28 字节分块；macro 写完必须 `(size-1)←0xFF` → 写 → `(size-1)←0x00`（否则固件认为 buffer 处于非法态）。
5. **keymap 线性偏移公式** `offset = layer*rows*cols*2 + row*cols*2 + col*2`，大端 16-bit。
6. **命令串行队列**：哪怕底层 HID 库是「同步 read」（如 hidapi），也建议保留一个串行队列 + 重试 + 超时，否则长事务（读满 keymap）会被并发写污染。
7. **「定义文件驱动 UI」的 VIA 三层结构**：`menus` schema（`label / type / content / options / showIf / bytes`）+ KLE layout + `customKeycodes`。这套 schema 已经足够表达所有灯光/自定义功能，**不需要自己发明一套 DSL**。
8. **`content: [token, channel, command_id, …extras]` 的形式**：token 既是 UI 取值/写值的 key，又是 `showIf` 表达式里的变量名。这个「一个标识符打通 UI / 表达式 / HID」的设计非常省事。
9. **KLE label 重排表**（2.4 节 `labelMap`）：直接从 kle-serial 抄，别自己写。
10. **vial 的 `Keycode` 抽象**（3.6 节）：把「名字带 `(kc)`」作为 mask 标记 + 高/低 8 位切分，比 VIA 的「逐个 switch 区间」实现要干净得多，且天然支持任意新分区。
11. **vial 的 `CPrefix namespace`**（`0xFE` 前缀）：如果要加私有扩展命令，**一定用前缀子命名空间**，不要占用 0x01–0x15。

### 6.2 明确的坑

1. **⚠️ 最大的坑：同名 `_QK_*` 常量在不同协议版本下值完全不同。**
   `_QK_MOD_TAP` 老表是 `0x6000`、新表是 `0x2000`；`_QK_MACRO` 老表 `0x5f12`、新表 `0x7700`。**必须在连接后先 `GET_PROTOCOL_VERSION`，再选 keycode 表**，否则写进去的 keycode 全是错的。而且 `TO(n)` 的老公式是 `QK_TO | (1<<4) | n`。
   建议：**内部一律用「结构化表示」**（`{kind: 'MO', layer: 3}`、`{kind:'MT', mod:'MOD_LCTL', kc:'KC_A'}`），只在最后一米才编/解码成整数，并用一个明确版本的 `KeycodeTable` 对象做转换。
2. **⚠️ 「定义 v2 / v3」和「用 GET_KEYCODE 还是 GET_BUFFER」是两回事。**
   前者由 `protocol >= 11` 决定；后者由 `protocol >= 8` 决定。**不要**把两者绑定成一个分支，否则 protocol 8/9/10 的 v2 定义键盘会以极慢的方式（每个键一次往返）读取 keymap。
3. **⚠️ protocol ≥ 13 必须先读 `KEYCODES_VERSION`（value_id 0x06），且要做 BCD 校验**（`min 0x00000008 / max 0x00000009`），否则 VIA app 会直接抛错。
4. **⚠️ WebHID 与 hidapi 的 report id 处理方式相反**（前者独立参数、后者首字节），且 WebHID 的 `inputreport` 是**事件流**而不是同步 read。跨平台 HID 层必须在一开始就隔离掉这个差异（via-app 用「全局 buffer + 时间戳快进」兜的，`util.py::hid_send` 用阻塞 read 兜的 —— 两种都可行，但**不能混**）。
5. **⚠️ `CUSTOM_SET_VALUE` / `GET_VALUE` / `SAVE`（0x07/0x08/0x09）必须与 channel 一起使用；旧固件里同样三个 id 是 `BACKLIGHT_CONFIG_*` 且不带 channel。** 判断依据只能用 protocol（`>= 11` 走带 channel 的路径）。
6. **⚠️ 改完任何 channel 的值之后必须发 `0x09 CUSTOM_SAVE <channel>` 才会持久化。**（灯光要 `BACKLIGHT_CONFIG_SAVE` / 各 channel 的 save。）忘了这一步的数据掉电即丢。
7. **⚠️ `0x0A EEPROM_RESET` 在 QMK 里默认不编译**（`#ifdef VIA_EEPROM_ALLOW_RESET`），`0x0B BOOTLOADER_JUMP` 之后设备会消失（收不到响应）。这两个命令要做「超时不算失败」的特判。
8. **⚠️ `0x0C MACRO_GET_COUNT` 返回的是「最大可存数量」而不是「当前已有数量」**（`dynamic_keymap.h` 注释明确写了）。当前宏的实际内容要靠解析 macro buffer 里的 null 分隔串得到。
9. **⚠️ `switch_matrix_state` 在默认编译下返回全 0**（`#else matrix_row_t value = 0;`）。做「按键测试」功能前要确认固件是否开了 `VIA_INSECURE` / `SECURE_ENABLE`，否则会误判为「按不出任何键」。
10. **⚠️ keymap buffer 里的 offset 是「字节偏移」且包含所有 layer**，所以读整份 keymap 需要 `layers*rows*cols*2 / 28` 次往返（默认 4 层 60 键 ≈ 18 次）。可以像 via-app 那样用 `Promise.all` 并行发（但要确保底层串行队列不会溢出缓冲）。
11. **⚠️ `showIf` 表达式的取值可能来自「还没同步过的设备值」**，所以 VIA 在加载时一次性把所有 command 的当前值拉下来（`updateV3MenuData` 里 batch `Promise.all`），然后才渲染。**别做成「用到才读」**，否则第一次渲染必然闪烁/错误。
12. **⚠️ 多字节 range 的边界是「`max > 255` 时用 16-bit」**（`decodeRangeValue`/`encodeRangeValue`），这个 magic number 分散在 3 个文件里，务必统一到一个地方。
13. **⚠️ `customKeycodes` 是「按数组下标」映射到 `USER00…`**，不是按 `name` 字段。`name` 只是 alias（用于搜索/显示）。
14. **⚠️ KLE 里 row/col pair 同时支持半角和全角逗号**（`pair.split(/[，,]/)`），因为很多定义文件是从中文输入法里产出的。解析器一定要兼容。
15. **⚠️ KLE 超过 3 种颜色会直接抛错**（`too many colors`），这是 VIA 在用 `c`/`t` 颜色对做「alpha / mod / accent」着色分类，属于隐式协议的一部分。

### 6.3 关于「定义文件 vs 固件自描述」的选型建议

两条路线都已验证可行：

| | via-app 路线（定义文件） | vial-gui 路线（定义存在固件里） |
|---|---|---|
| 定义来源 | CDN 上的 `{vid*65536+pid}.json` | 固件内 LZMA 压缩 JSON，靠 `0xFE 0x00/0x01/0x02` 拉取 |
| 优点 | 无需改固件即可修正布局；CDN 分发、可离线缓存 | 插上就一定匹配，不会「下错定义」；支持 `sideload` 本地 JSON |
| 缺点 | VID/PID 冲突时必然出错；新键盘得走 PR 合并流程 | 占用固件 Flash；改布局要重新编译刷机 |
| 适配建议 | **如果要兼容现有 VIA 生态必须支持** | 可作为「高级模式 / sideload」的补充 |

**推荐混合方案**（vial-gui 已经在做）：优先尝试从设备读取 → 失败则回落到 VID/PID 查本地/远端定义 → 再失败则允许用户「sideload」自定义 JSON。三条路径同时保留，成本不高但鲁棒性最好。

---

## 附：本文档引用的全部源文件

| 主题 | URL |
|---|---|
| VIA HID 命令 + 字节格式（app 侧） | `https://raw.githubusercontent.com/the-via/app/main/src/utils/keyboard-api.ts` |
| WebHID 过滤 / report id 处理 | `https://raw.githubusercontent.com/the-via/app/main/src/shims/node-hid.ts` |
| VID/PID → 定义 key | `https://raw.githubusercontent.com/the-via/app/main/src/utils/hid-keyboards.ts` |
| keyboard value id 枚举 | `https://raw.githubusercontent.com/the-via/app/main/src/utils/keyboard-values.ts` |
| keycodes version 校验 | `https://raw.githubusercontent.com/the-via/app/main/src/utils/keycodes-version.ts` |
| keycode 表选择与版本切换 | `https://raw.githubusercontent.com/the-via/app/main/src/utils/key-to-byte/dictionary-store.ts` |
| 新/老 keycode 分区表 | `.../key-to-byte/v12.ts`、`.../key-to-byte/v13.ts`、`.../key-to-byte/default.ts` |
| 高级 keycode 编解码 | `https://raw.githubusercontent.com/the-via/app/main/src/utils/advanced-keys.ts` |
| 设备发现 / 定义版本决策 | `https://raw.githubusercontent.com/the-via/app/main/src/store/devicesThunks.ts` |
| 定义索引与本地缓存 | `https://raw.githubusercontent.com/the-via/app/main/src/utils/device-store.ts` |
| menus 数据流 | `https://raw.githubusercontent.com/the-via/app/main/src/store/menusSlice.ts` |
| menus 渲染 / showIf | `https://raw.githubusercontent.com/the-via/app/main/src/components/panes/configure-panes/custom/menu-generator.tsx` |
| type → 控件 | `https://raw.githubusercontent.com/the-via/app/main/src/components/panes/configure-panes/custom/custom-control.tsx` |
| range 约束 | `https://raw.githubusercontent.com/the-via/app/main/src/utils/range-constraints.ts` |
| showIf 表达式语法 | `https://raw.githubusercontent.com/the-via/pelpi/master/src/instr.ts` |
| 定义 schema 公共类型 | `https://raw.githubusercontent.com/the-via/reader/master/src/types.common.ts` |
| V2 schema + LightingValue | `https://raw.githubusercontent.com/the-via/reader/master/src/types.v2.ts` |
| V3 schema | `https://raw.githubusercontent.com/the-via/reader/master/src/types.v3.ts` |
| menus schema | `https://raw.githubusercontent.com/the-via/reader/master/src/menu-types.ts` |
| KLE 解析器 | `https://raw.githubusercontent.com/the-via/reader/master/src/kle-parser.ts` |
| 内建菜单（含 channel id） | `.../common-menus/qmk_backlight.ts`、`qmk_rgblight.ts`、`qmk_rgb_matrix.ts`、`qmk_audio.ts` |
| 真实 V2 定义样例 | `https://raw.githubusercontent.com/the-via/keyboards/main/src/duck/eagle_viper/v2/eagle_viper.json` |
| VIA 命令 / value / channel 枚举 | `https://raw.githubusercontent.com/qmk/qmk_firmware/master/quantum/via.h` |
| VIA 命令处理实现 | `https://raw.githubusercontent.com/qmk/qmk_firmware/master/quantum/via.c` |
| keymap/macro buffer 语义 | `https://raw.githubusercontent.com/qmk/qmk_firmware/master/quantum/dynamic_keymap.h` |
| QMK keycode 分段表 | `https://raw.githubusercontent.com/qmk/qmk_firmware/master/quantum/keycodes.h` |
| vial 命令常量 | `https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/protocol/constants.py` |
| vial 核心协议 + 定义自描述 | `https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/protocol/keyboard_comm.py` |
| vial HID 收发 / 设备发现 | `https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/util.py` |
| vial 设备抽象 | `https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/vial_device.py` |
| vial HID 后端代理 | `https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/hidproxy.py` |
| vial keycode 体系 | `.../keycodes/keycodes.py`、`.../keycodes/keycodes_v5.py`、`.../keycodes/keycodes_v6.py` |
| vial KLE 解析（labelMap） | `https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/kle_serial.py` |
| vial macro 动作协议 | `https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/macro/macro_action.py` |
| vial macro 读写 | `https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/protocol/macro.py` |
| vial 主窗口 | `https://raw.githubusercontent.com/vial-kb/vial-gui/main/src/main/python/main_window.py` |
