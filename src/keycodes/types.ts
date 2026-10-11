// 键码层类型定义（架构 §4.2.6）。
export type KeycodeGroupId =
  | 'basic'
  | 'media'
  | 'layers'
  | 'modtap'
  | 'quantum'
  | 'lighting'
  | 'macro'
  | 'custom'
  | 'any';

export interface KeycodeDef {
  /** 16 位 QMK 键码 */
  readonly code: number;
  /** QMK 常量名，用于搜索与 Any 输入，如 'KC_LCTL' */
  readonly name: string;
  /** 界面显示名，如 'L Ctrl'；缺省时用 name 去除 KC_ 前缀 */
  readonly label?: string;
  /** 键帽短名，超长时用于截断 */
  readonly short?: string;
  readonly group: KeycodeGroupId;
  /** Any 输入的别名，如 ['LCTL'] */
  readonly aliases?: readonly string[];
  /** 需要额外参数的键码（LT/MOD_TAP/TD…），提供参数范围生成器 */
  readonly param?: KeycodeParamSpec;
}

export interface KeycodeParamSpec {
  readonly kind: 'layer' | 'modtap' | 'tapDance' | 'macro' | 'rgb';
  readonly min: number;
  readonly max: number;
  /** 由参数生成最终键码 */
  readonly build: (param: number, arg?: number) => number;
}

export interface KeycodeGroupDef {
  readonly id: KeycodeGroupId;
  /** 界面 Tab 名 */
  readonly label: string;
  readonly order: number;
  readonly items: readonly KeycodeDef[];
}
