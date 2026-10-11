# keydriver 项目交接文档

> 生成时间：2026-10-10 20:45
> 生成方式：**主理人磁盘实测 + 各成员汇报交叉核对**。所有数字均来自实际命令输出，未采用任何口头估计值。

---

## 一、一句话现状

一个读取 VIA 键盘定义文件、通过 USB HID 与键盘通信的**本地跨平台键盘驱动 GUI**，已完成 M1（核心逻辑层）与 T04（菜单引擎），**无硬件即可跑通全部界面**；真机接入（T05）尚未开始，键码表有一处待裁决的协议冲突。

---

## 二、实测健康基线（交接接手请先重跑这四条）

```bash
cd /Users/baoru/Downloads/AI/keydriver
export PATH="/Users/baoru/.workbuddy/binaries/node/versions/22.22.2-6/bin:$PATH"

npx vitest run      # 测试
npx tsc --noEmit    # 类型检查
npm run check       # 硬编码扫描 + 定义文件统计断言 + tsc
npx vite build      # 构建
```

| 检查项 | 实测结果 | 状态 |
| --- | --- | --- |
| `npx vitest run` | **38 个测试文件 / 492 用例 / 480 通过 / 12 失败** | 12 条红全是刻意保留的缺陷复现，见 §5 |
| `npx tsc --noEmit` | **1 个 error** | ⚠️ `SimulatedFirmware.ts(24,10): 'canonicalAddressKey' 声明后未使用`（重构遗留，1 分钟可清） |
| `npm run check` | 硬编码扫描 129 文件通过；定义文件统计断言全部通过 | ✅ |
| `npx vite build` | `✓ built in 9.64s` | ✅（产物 `dist/`，JS 约 543 kB，有 >500kB chunk 警告，未做代码分割） |

> **⚠️ 跑测试前必读**：确认没有进程正在写入 `src/`。开发过程中曾出现 10~16 条「假红」，原因是测试全量跑的同时工程师正在重写源文件，撞上落盘中间态。源码稳定后全部自动转绿。

---

## 三、项目规模（磁盘实测）

```
keydriver/
├── src/           130 个文件（其中 38 个测试文件）
├── docs/          PRD.md · ARCHITECTURE.md · research-via-protocol.md · ELECTRON.md
├── scripts/       verify-definition-stats.mjs（基线断言）· check-no-hardcode.mjs
├── definitions/   7-19-Em60_cn.json（目标键盘定义文件，唯一测试样本）
└── dist/          构建产物
```

| 模块 | 文件数 | 职责 |
| --- | --- | --- |
| `src/core/hid/` | 8 | 传输层：32 字节帧编解码、Dummy 模拟固件、传输接口 |
| `src/core/protocol/` | 17 | VIA 协议层：命令封装、键码编解码、值宽度推断、自定义值编解码 |
| `src/core/device/` | 10 | 设备门面：握手、会话管理、写值防抖队列 |
| `src/definition/` | 20 | 定义文件解析：schema 校验、菜单扁平化、showIf 求值、KLE 几何、布局选项 |
| `src/keycodes/` | 13 | 键码层：键码表、格式化、Any 输入解析 |
| `src/store/` | 6 | Zustand 状态：设备/定义/键位/菜单/UI/调试 |
| `src/ui/` | 45 | 界面：布局骨架、基础控件、键位区、键码面板、**菜单引擎**、调试面板 |
| `src/io/` | 2 | 配置导入导出 |
| `src/shared/` | 5 | 工具：结果类型、防抖、hex、日志、i18n 骨架 |

---

## 四、已完成里程碑

### M1 · 核心逻辑层 ✅
传输层 / 协议层 / 设备门面 / 定义解析 / 键码层 + 四区 UI 骨架 + 10 个基础控件 + Dummy 模拟设备。

**目标达成**：无键盘也能导入定义文件 → 选 Dummy 设备 → 连接 → 顶部显示 `VID 0x5594 · PID 0x0005 · v11` → 键位图正确渲染 → 改键回读一致。

### T04 · 菜单引擎 ✅（刚落盘，未收到工程师完整汇报）
`src/ui/menu/` 已具备：`MenuPane` / `MenuGenerator` / `MenuSection` / `ControlRenderer` / `SaveBar` + 6 类控件（`Toggle` / `Range` / `Dropdown` / `Color` / `Keycode` / `Button`）+ 配套 `menu-engine.test.ts`。
`src/io/` 的 `backup.ts` / `download.ts`（配置导入导出）已就位。

> ⚠️ **T04 尚未正式验收**：工程师未提交完整汇报，T04 的三条验收标准（349 控件全可读写、灯光 All Off 联动、导出→复位→导入一致）**尚未逐条实测**。接手后请优先补这一步。

### 未做
- **T05 · 真机 WebHID**（`WebHidTransport` 尚未实现，目前只有 Dummy 后端）
- 拖拽换位、批量编辑
- 宏编辑（本键盘定义里无该菜单）

---

## 五、当前 12 条失败用例（全部是刻意保留的缺陷复现，不是回归）

这些是 QA 主动留下的红色「探针」，用于证明缺陷真实存在。**修好源码后它们会转绿，不要为了变绿去改断言。**

| 缺陷 | 位置 | 现象 | 状态 |
| --- | --- | --- | --- |
| **Bug C · Quantum 页键码被误判为 Mod-Tap** | `src/keycodes/KeycodeFormatter.ts:55` | `format(0x7800)` 显示 `RGUI_T(kc)`，实为 RGB 灯效页；`0x7100` MIDI 页、`0x7200` 音序器页、`0x7400` 可编程键页同样中招 | 🔴 **待架构裁决** |
| **Bug D · 显示名 ↔ Any 输入不是同一套词表** | `src/keycodes/AnyKeycodeParser.ts:48-58` vs `KeycodeFormatter.ts:28-32` | **215 个内置键码中 119 个**的显示名无法被 Any 输入解析回原键码。用户复制界面键名粘贴 → 「改了没反应」 | 🔴 已判必修，排在 Bug C 后 |
| **Bug F · `findByVidPid` 不认大写 hex** | `src/definition/DefinitionRepository.ts:55-66` | 定义文件写 `0X1A2B` / `0x1A2b` 时 VID/PID 查不回 → 「设备重连自动加载定义」静默失效 | 🔴 已判必修，可立即修 |

### 已修复的 5 个（回归测试已转绿，可作为回归基线）

| 编号 | 内容 |
| --- | --- |
| Bug A | `SimulatedFirmware` 地址键格式（`10:1:2:3`）与 `CustomValueCodec.addressKey`（`10:1:2.3`）不一致 → **40 个 Combos 二维索引控件在 Dummy 模式读写全错** |
| Bug B | `getLayerCount` 静默返回 0 层 → 已加「层数恒 ≥1」合理性校验，抛 `ProtocolSanityError` |
| Bug E | `getProtocolVersion` 第二方言兜底失效（返回 **2816 而非 11**，且 2816 ≥ 13 会误触发读键码字典版本）→ 已加方言错位判定 + 上限 |
| — | 二维索引地址形状在 `eepromReset` 后被保留（有意语义变更，见 §7） |
| — | `scripts/ui-render.test.ts` 超时（曾因整棵 App 模块图冷启动 transform 超 5s 默认值） |

---

## 六、⚠️ 卡住的关键决策：键码表新老协议冲突

**这是接手后第一优先要解决的事**，它卡着 Bug C 与 Bug D 两条必修。

**三方口径不一致**：
- `src/core/protocol/constants.ts:66-86` 声明 `0x7100=QK_MIDI`、`0x7200=QK_SEQUENCER`、`0x7400=QK_PROGRAMMABLE_BUTTON`、`0x7800=QK_RGB`
- `src/keycodes/modTap.ts:62` 用 `MT(m.bit, 0)` 注册基准码，而 `MT(0x11,0)=0x7100`、`MT(0x12,0)=0x7200`、`MT(0x14,0)=0x7400`、`MT(0x18,0)=0x7800` —— **恰好把四个页的基址吃掉了**（精确表优先）
- `src/keycodes/KeycodeFormatter.ts:55` 把整个 `0x7000–0x7FFF` 判为 Mod-Tap

**冲突所在**：`MT()` 允许右侧修饰到 `0x18`（→ 最高 `0x78FF`），与「`0x7800` 是 RGB 页」这两条假设**不可能同时成立**。

**关键线索（指向新协议）**：
- 架构调研文档 `docs/research-via-protocol.md` §D 写明新协议 `QK_MOD_TAP = 0x2000–0x3FFF`，老协议才是 `0x6000`
- 定义文件菜单 label 出现 `按键复用(0)-0X5700` → `QK_TAP_DANCE = 0x5700`（新协议值）
- `customKeycodes` 映射到 `QK_KB + N = 0x7E00 + N`（新协议值）
- 本产品握手要求 protocol ≥ 11，当前 QMK 为 13

**反证**：现有单测 `src/keycodes/__tests__/KeycodeFormatter.test.ts` 断言 `0x6104 → LCTL_T(A)`，用的是老协议口径。

**已提请架构师裁决，两次催办未回复。** 接手后可直接查阅 `docs/research-via-protocol.md` §D 与 `docs/ARCHITECTURE.md` 自行判定，或重新问架构师。裁决需要回答三问：
1. 该键盘用新协议还是老协议键码表？
2. 若新协议：`0x6000–0x7FFF` 段如何拆分（Magic/MIDI/Lighting/Quantum 各页，或兜底 hex）？`0x6104` 那条断言是错了还是固件确实返回老协议值？
3. `KeycodeTable` 目前只有 basic/layers/modtap 三类，**缺 media/lighting/quantum/macro**，导致改键时选不到灯效键——S2 的 Lighting 是否要提前？

---

## 七、必须知道的 7 条实现约束（都是踩过坑才定下来的）

1. **界面文案禁止硬编码**。代码中不得出现 `EC_BM60` / `0x5594` / `静电容` / `Tap Dance` / `Combos` / `SOCD` 等与具体键盘耦合的字样。`npm run check` 会扫描 129 个文件，命中即失败（当前通过）。所有文案必须来自定义文件。

2. **`content[0]`（valueKey）不唯一**，实测 2 处重名：
   - `id_save_threshold_data` —— 两个 button，同地址，`options` 分别 `[0]` 和 `[1]`
   - `id_magic_oneshot_enable` —— 两个 toggle，**指向同一地址 `7:12`**（厂商有意做的双入口快捷方式，已确认非笔误）
   
   → **控件唯一 ID 必须由「菜单路径 + 序号」生成**；**值订阅必须按 `ValueAddress` 而非 controlId**（否则改一处另一处不刷新）；**备份文件主键用 controlId**（用 valueKey 会丢数据）。

3. **`showIf` 双层求值**。实测 60 条：58 条在叶子控件、**2 条在分组节点**，且这 2 个分组**没有 `label` 字段**。漏掉分组层求值会导致「静电容工具 → 触发模式切换」整组失效。分组 label 缺省时内联展开、不渲染空标题。

4. **菜单用 `content` 承载子节点，没有 `children` 字段**。靠「有无 `type` 字段」判别是分组还是控件。Parser 需兼容两种写法。

5. **`range` 的 `min` 与字节宽度是两个独立维度**。78 个 range 中「min=1 的 35 个」与「需 2 字节的 35 个」**数值巧合但交集仅 13 个**。若误推成「min=1 就用 2 字节」，78 个里会错 **44 个**。滑块下限必须取 `options[0]`（**写死 0 和写死 1 都是错的**）。

6. **`button` 的 `options` 是真参数，不能假设恒为 `[0]`**。实测 `[0]×7`、`[1]×1`、字段缺失×1（归一化为 `[]`）。那个 `[1]` 必须原样透传，否则用户在模式 1 下点「应用并保存」下发的仍是 0，**点了没反应且不报错**。

7. **KLE 必须行压紧**。定义文件第 4–8 行是底行的 5 种配列变体，KLE 里分占 y=4.25…8.25。过滤后必须按离散 y 重新分配紧凑行号，否则底行掉到 y=8、中间空 4 行。已用 512 种位段组合穷举验证「压紧后底行恒为 y=4」。

---

## 八、协议实现要点（照抄即可，勿重新推导）

| 项 | 值 |
| --- | --- |
| 传输 | USB Raw HID，Usage Page `0xFF60` / Usage `0x61` |
| 报文 | 固定 32 字节；单包有效载荷 28 字节，缓冲区命令必须分块 |
| 交互模型 | 同步请求-响应，固件**回显 buffer**（响应 = 命令回声 + 参数回声 + 返回值） |
| 未识别 | `resp[0] === 0xFF` → `UnhandledCommandError` |
| **方言错位** | `resp.slice(1, req.length) !== req.slice(1)` → `EchoParamMismatchError`（**发错方言不会报错，只会读回全是 0，这是唯一防线**） |
| 字节序 | 键码 / layout_options / buffer offset 均为**大端** |
| 键位偏移 | `offset = layer*rows*cols*2 + row*cols*2 + col*2` |
| 版本握手 | `0x01` 读协议版本，**≥ 11 走 V3 方言（带 channel 字节）** |
| 键码字典 | **protocol ≥ 13 必须先读 `0x02` + value_id `0x06`**，4 字节大端 BCD，合法范围 `0x00000008–0x00000009` |
| 定义文件 | 本项目按 **VIA V3 / 协议 v11+** 处理（含 `menus` 字段即为 V3） |
| 自定义值 | `content = [valueKey, channel_id, value_id, ...indexes]`，长度 3/4/5 三种 |

---

## 九、目标设备与配置基线

**定义文件**：`definitions/7-19-Em60_cn.json`

```
8 顶层菜单 / 67 分组节点 / 349 叶子控件 / 98 个 KLE 键位条目 / 5 布局选项组 / 2 自定义键码
控件类型分布：keycode 131 · toggle 90 · range 78 · dropdown 33 · button 9 · color 8
content 长度：3 / 4 / 5 三种（其中 40 个 5 元素 = Combos 二维索引）
range 组合：[0,255]×21 [1,255]×22 [0,1000]×22 [1,1000]×10 [1,1023]×3
```

> 这些数字**不要手工修改**。`scripts/verify-definition-stats.mjs` 是唯一事实来源（已接入 `npm run check`），换定义文件时以脚本输出更新文档，**禁止反过来改断言迁就文档**。

---

## 十、启动方式

```bash
cd /Users/baoru/Downloads/AI/keydriver
export PATH="/Users/baoru/.workbuddy/binaries/node/versions/22.22.2-6/bin:$PATH"

npm run dev        # http://localhost:5173  （推荐，带 HMR）
npm run desktop    # Chrome 无边框 app 窗口（已实测可拉起）
npm run test       # 单元测试
npm run check      # 硬编码扫描 + 定义统计断言 + tsc
npm run build      # tsc --noEmit && vite build
```

**上手路径**：设备选择器选 Dummy → 连接 → 顶栏显示 `VID 0x5594 · PID 0x0005 · v11` → 调试面板看握手报文 → 键位区切 5 种配列看底行 → 点键改码看 `0x05` 写帧 → 左侧菜单切到 8 个菜单逐个点。

---

## 十一、技术选型与运行形态（已定，勿轻易推翻）

| 项 | 选择 | 关键理由 |
| --- | --- | --- |
| UI | React 19 + TS 5.9 + Tailwind 4 + Radix primitives | **否决 MUI**：其 Material 观感偏「后台管理系统」，与「现代化简洁」有距离，深度定制成本高于直接写 Tailwind |
| 状态 | Zustand 5（6 个 slice） | 349 个控件需按 controlId 精确订阅，Redux boilerplate 无收益 |
| HID 后端 | **WebHID 为主 + Dummy 必做** | 规避 Apple Silicon 上 node-gyp 原生编译风险；传输层为可插拔接口，Tauri/Electron 后续零改造接入 |
| 应用外壳 | **Electron 为主外壳（已落地 `electron/main.cjs`）** | 用户要求真正的桌面程序（现在 Mac、以后 Windows），非浏览器网页。Electron 内嵌 Chromium → WebHID 零改造、前端零重写、Mac/Windows 真原生窗口。沙箱 GitHub 被墙故放 `optionalDependencies` 防御性安装；用户真机 `npm i` 即可打包。Tauri 因 Mac WebKit 不支持 WebHID 不适合。 | 见 `docs/ELECTRON.md`：开发 `npm run electron:dev -- --dev`、打包 `npm run dist`（dmg/nsis）。原 `npm run dev` 浏览器预览保留。 |
| 持久化 | IndexedDB（`idb-keyval`）+ localStorage，抽象为 `DefinitionRepository` 接口 | 未来可换 fs |
| node-hid | 降为 P2 预留（`NodeHidBridgeTransport` 仅留接口） | 同上，编译风险 |

---

## 十二、接手后建议的行动顺序

### 立即（半天内）
1. ~~清掉 1 个 tsc error~~ ✅ **已完成**：删除 `src/core/hid/SimulatedFirmware.ts` 的 `canonicalAddressKey` 死代码，`npm run build` 与 `npm run check` 现已全绿，`dist/` 可一键产出。
2. **做键码表裁决**（§6）—— 卡着两条必修缺陷，问架构师或依 §6 线索自行判定
3. **补 T04 正式验收**（§4）—— 349 控件全可读写、灯光 All Off 联动、导出→复位→导入一致

### 短期（1–2 天）
4. 修 **Bug F**（VID/PID 大小写，复用 `parseId` 归一化，单点低成本）
5. 按裁决结果修 **Bug C**（键码表区间），随后修 **Bug D**（显示名 ↔ Any 输入往返）
6. 补 `KeycodeTable` 的 media / lighting / quantum / macro 分组（否则选不到灯效键）
7. **T05 真机接入**：实现 `WebHidTransport`（`navigator.hid.requestDevice` + `0xFF60/0x61` 过滤），标注「未实测」直到有硬件

### 中期
8. UI 层与 store 层测试（**当前是 QA 覆盖盲区**，两位 QA 都只覆盖了逻辑层）
9. `KeycodeTable.byCodeMap()` 每次调用全量重建 Map，98 个键帽渲染会重建 98 次 —— 加缓存（QA 怀疑这贡献了 `ui-render` 超时）
10. 代码分割（JS 543 kB 有 chunk 警告）、`ValueWriteQueue` 边界测试

### 真机联调第一件事
**抓 `0x01` 的响应字节，确认协议版本的主流方言**（Bug E 修复后的正确性依赖这个）。同时验证：protocol ≥ 13 时能正确读出 keycodes version。

---

## 十三、遗留待确认的语义（QA 已记录现状，未派修）

1. `compactRows` 对异形键第二矩形的 `y2` 用同一张 yMap，若落在被过滤掉的行上会保留原始坐标不压紧。当前定义文件异形键 `y2 == y`，不触发。
2. `parseKeyName` 图例内空格（`"4 , 1"`）不识别。当前定义文件无此写法。
3. `getKeymapBuffer/setKeymapBuffer` 对 `size > 28` 静默 `Math.min` 截断无告警。调用方 `DeviceFacade.getKeymap` 已正确分块，暂无实害。
4. 地址形状只对**曾播种/写入过**的地址生效；陌生二维地址首次写入按 0 索引解析。生产路径靠 `DeviceFacade.seedDummy` 在 connect 时播种全部 349 个控件，不受影响。
5. `listDefinitions` 只按 `savedAt` 倒序，同毫秒连续导入两份时「最近」会退化为键序。

---

## 十四、团队协作纪律（本次项目沉淀，接手请沿用）

本项目三位 QA 与一位架构师在协作中踩过的坑，规则已固化进 `npm run check`：

1. **统计数字以脚本输出为唯一出处**。三轮交叉复核中，人工归并统计导致 6 处错误（3 处「已算对但转述错」、3 处「建模遗漏」）。已建立 `scripts/verify-definition-stats.mjs`（23 条断言）作为基线。
2. **脚本化只能防「数错」，防不了「想不到」**。建模推断类错误必须靠交叉复核 —— 这是两条不同的防线，不可互相替代。
3. **口头/消息中的数字不具权威性**，任何人都可以随时跑脚本证伪。文档也不豁免。
4. **同一事实只在一处产生**，其余全部引用。发现同一事实在两处表述打架时，立刻上报，不要各自选一边改代码或改测试。
5. **写失败测试是描述缺陷的最有效方式**，比文字描述更不可辩驳。
6. **域划分**：QA 严过关-1 负责 `definition/` + `keycodes/`；严过关-2 负责 `core/{protocol,hid,device}`。冲突已按「谁的文件谁维护」裁决。

---

## 十五、文档索引

| 文件 | 内容 |
| --- | --- |
| `docs/PRD.md` | 产品需求：调研结论、配置实测、需求池 P0×16/P1×8/P2×6、16 条验收断言 |
| `docs/ARCHITECTURE.md` | 技术选型、文件清单、核心接口、时序图、风险登记表、12 条风险 |
| `docs/research-via-protocol.md` | VIA 协议一手源码采集（1983 行）：命令常量、HID 报告格式、**keycode 分段规则**、vial-gui 模块划分 |
| `scripts/verify-definition-stats.mjs` | 定义文件基线断言（唯一事实来源） |
| `scripts/check-no-hardcode.mjs` | 硬编码特征词扫描 |