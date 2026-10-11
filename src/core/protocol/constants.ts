// VIA 协议常量：命令 ID、键盘值 ID、通道、QMK 键码页。零依赖叶子模块，可被任意层引用。

export const VIA_CMD = {
  GET_PROTOCOL_VERSION: 0x01,
  GET_KEYBOARD_VALUE: 0x02,
  SET_KEYBOARD_VALUE: 0x03,
  KEYMAP_GET_KEYCODE: 0x04,
  KEYMAP_SET_KEYCODE: 0x05,
  KEYMAP_RESET: 0x06,
  CUSTOM_SET_VALUE: 0x07,
  CUSTOM_GET_VALUE: 0x08,
  CUSTOM_SAVE: 0x09,
  EEPROM_RESET: 0x0a,
  BOOTLOADER_JUMP: 0x0b,
  MACRO_GET_COUNT: 0x0c,
  MACRO_GET_BUFFER_SIZE: 0x0d,
  MACRO_GET_BUFFER: 0x0e,
  MACRO_SET_BUFFER: 0x0f,
  MACRO_RESET: 0x10,
  KEYMAP_GET_LAYER_COUNT: 0x11,
  KEYMAP_GET_BUFFER: 0x12,
  KEYMAP_SET_BUFFER: 0x13,
  ENCODER_GET: 0x14,
  ENCODER_SET: 0x15,
  UNHANDLED: 0xff,
} as const;

export type ViaCommandId = (typeof VIA_CMD)[keyof typeof VIA_CMD];

/** 0x02 / 0x03 的键盘值 ID */
export const KB_VALUE_ID = {
  UPTIME: 0x01,
  LAYOUT_OPTIONS: 0x02,
  SWITCH_MATRIX_STATE: 0x03,
  FIRMWARE_VERSION: 0x04,
  DEVICE_INDICATION: 0x05,
  /** 键码字典版本（BCD）。协议 ≥ 13 时必须先读它，再决定用哪套键码字典 */
  KEYCODES_VERSION: 0x06,
} as const;

/** 键码字典版本的有效区间（BCD 编码） */
export const KEYCODES_VERSION_MIN = 0x0000_0008;
export const KEYCODES_VERSION_MAX = 0x0000_0009;

/** 需要读键码字典版本的最低协议版本 */
export const KEYCODES_VERSION_PROTOCOL_MIN = 13;

/** 已知语义的标准通道；其余通道为厂商自定义，UI 不解释（架构 U6）。 */
export const VIA_CHANNEL = {
  CUSTOM: 0,
  QMK_BACKLIGHT: 1,
  QMK_RGBLIGHT: 2,
  QMK_RGB_MATRIX: 3,
  QMK_AUDIO: 4,
  QMK_LED_MATRIX: 5,
} as const;

/** QMK 键码页（高 8 位）。用于 Custom 键码分配与 Any 键码解析。 */
export const QK_PAGE = {
  LCTL: 0x0100,
  LSFT: 0x0200,
  LALT: 0x0400,
  LGUI: 0x0800,
  MODS_MAX: 0x1fff,
  FUNCTION: 0x2000,
  LAYER_TAP: 0x4000,
  TO: 0x5000,
  MOMENTARY: 0x5100,
  DEF_LAYER: 0x5200,
  TOGGLE_LAYER: 0x5300,
  ONE_SHOT_LAYER: 0x5400,
  ONE_SHOT_MOD: 0x5500,
  TAP_DANCE: 0x5700,
  LAYER_TAP_TOGGLE: 0x5800,
  MOD_TAP: 0x6000,
  QUANTUM: 0x7000,
  MIDI: 0x7100,
  SEQUENCER: 0x7200,
  JOYSTICK: 0x7300,
  PROGRAMMABLE_BUTTON: 0x7400,
  AUDIO: 0x7500,
  STENO: 0x7600,
  MACRO: 0x7700,
  RGB: 0x7800,
  KB: 0x7e00,
  USER: 0x7f00,
  UNICODE: 0x8000,
} as const;

/** 本产品要求的最低协议版本（架构 Q2：只支持 V3 / v11+）。 */
export const MIN_PROTOCOL_VERSION = 11;

/** 键位缓冲区单次传输上限（32 字节帧 - 4 字节头）。 */
export const KEYMAP_BUFFER_CHUNK = 28;
