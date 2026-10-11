# keydriver 现有技术方案评估与战略转向建议

> 评估人：高见远（架构师）
> 评估日期：2026-10-12
> 输入依据：`docs/ARCHITECTURE.md`（v1.0，§0–§10）、`docs/HANDOVER.md`（§1–§15）、`docs/research-via-protocol.md`（§D 键码分段、§6.2 坑点）、`docs/PRD.md`（US7、R-P0-01）、源文件实测（`constants.ts` / `modTap.ts` / `KeycodeFormatter.ts` / `AnyKeycodeParser.ts` / `KeycodeTable.ts` / `groups.ts` / `DefinitionRepository.ts` / `KeycodeFormatter.test.ts`）。
>
> **核心结论先行**：现有架构的「分层纪律」与「定义驱动 UI」两大支柱完全成立、应完整继承；唯一需要立刻裁决并修正的是 **Bug C（新/老协议键码表冲突）**，它卡着两条必修缺陷。战略转向「静电容优先」**不推翻**现有 VIA 路径——因为当前目标键盘 Em60 本身就是静电容且经 VIA V3 驱动；真正要做的是把 VIA 从「唯一协议」降级为「多厂商协议适配之一」。

---

## 0. 评估范围与关键事实锚定

1. **现状基线**（HANDOVER §2，实测）：492 用例 / 480 通过 / 12 失败（12 红全为 QA 刻意保留的缺陷探针）；`tsc` 仅 1 个 error（`SimulatedFirmware.ts:24` 未用变量）；构建 OK。
2. **已落地里程碑**：M1（核心逻辑层）+ T04（菜单引擎）。T05（真机 WebHID）未做。
3. **目标键盘即静电容**：`definitions/7-19-Em60_cn.json` 是 VIA V3 定义文件，PRD `US7` 明确写「静电容键盘用户 → 触底校准/底噪校准/切换触发模式」——即**现有架构已在用 VIA 协议驱动一块静电容键盘**。这一点对战略评估是定海神针（见 §3.1）。
4. **Bug C 三方口径冲突（HANDOVER §6）已实测确认**：
   - `src/core/protocol/constants.ts:75` 声明 `MOD_TAP: 0x6000`（**老协议**值）；
   - 但 `constants.ts:77-86` 同时声明 `MIDI:0x7100` / `SEQUENCER:0x7200` / `PROGRAMMABLE_BUTTON:0x7400` / `RGB:0x7800`——这些是**新协议**值，`research-via-protocol.md §D(1270-1336)` 确认新协议 `QK_MOD_TAP=0x2000~0x3FFF`、`QK_LIGHTING=0x7800~0x78FF`；
   - `src/keycodes/modTap.ts:30` `MT(modBit,kc)=(QK_PAGE.MOD_TAP|((modBit&0x1f)<<8)|(kc&0xff))`，`MT(0x18,0)=0x7800` 恰好吃掉 `RGB` 页基址（精确表优先）；
   - `src/keycodes/KeycodeFormatter.ts:55` 把整个 `0x6000–0x7FFF` 判为 Mod-Tap（老协议假设）；
   - `src/keycodes/__tests__/KeycodeFormatter.test.ts:43` 断言 `LCTL_T(KC_A)===0x6104`（老协议）；`0x6104` 在新协议里落在 `0x6000–0x6FFF` 的「legacy hole」，根本不是 Mod-Tap。

---

## 1. 主要技术决策评估矩阵

| # | 决策 | 优点 | 缺点 | 当前适用性（VIA-first 机械） | 战略转向后适用性（静电-first） | 建议 |
|---|------|------|------|------|------|------|
| D1 | **React19+TS+Vite+Zustand+Tailwind+Radix 前端栈** | 与 via-app 同源可借鉴；声明式天然适配定义驱动 UI；Zustand 按 controlId 精确订阅是 349 控件的性能刚需（R8）；Tailwind 100% 落地深色主题且无第三方主题战争 | 团队需熟悉 Radix 行为层；无 SSR/路由库 | 完全成立 | **仍成立**（UI 与协议无关，静电适配不改 UI 栈） | **继承**，不调整 |
| D2 | **WebHID 为主 + Dummy 必做 + node-hid 降 P2** | 零原生编译、零二进制下载，规避 `raw.githubusercontent` 不可达与 Apple Silicon node-gyp 双重硬风险；`HidTransport` 可插拔是核心风险对冲（R3） | 仅 Chrome/Edge；无独立安装包；Safari/Firefox 用户不可用（R10）；原生后端实际为零 | 成立（Em60 经 WebHID 跑通） | **部分成立**：静电市场含大量非技术用户，WebHID「需 Chrome」是分发短板；但 HHKB/Realforce/NiZ 经 WebHID 仍可通信 | 保留 WebHID 为默认；把 Electron 从「M4+ 可选」**提升为静电路线必做分发层**（见 §6） |
| D3 | **本期不做 Electron（改用 Chrome `--app`）** | 零成本拿到无边框桌面窗；彻底规避 Electron postinstall 的 GitHub 100MB 下载死锁（R4） | 无法分发安装包；首次授权弹窗；无离线自治 | 成立（开发期零成本） | **短期仍成立，中期必须补**：静电用户要「双击安装」体验，不能要求会开 Chrome `--app` | 本期继续用；中期补最小 Electron 骨架（架构 §1.2 已留零改造路径） |
| D4 | **定义驱动 UI + `check-no-hardcode.mjs` 守卫** | 彻底解耦具体键盘特征词，换键盘只换定义文件；硬守卫进 `npm run check` + pre-commit，防回归 | 任何「为某键盘特例」的捷径都被堵死，需走定义文件 | 成立（129 文件扫描通过） | **更关键**：静电厂商各家命令集不同，无硬编码是泛化的前提 | **继承并强化**（守卫要覆盖新增的 vendor 协议层） |
| D5 | **Zustand 6 slice + 按 controlId 精确订阅** | 349 控件懒加载 + 精确订阅避免全量重渲染（R8）；valueKey 重复问题用 controlId 绕过（F1/R5） | 切片边界需纪律；`byCodeMap()` 每次全量重建有性能债（HANDOVER §12-9） | 成立 | **成立且更重要**：多协议下值订阅语义不变 | 继承；补 `byCodeMap` 缓存 |
| D6 | **VIA 协议 v11/v3 方言、仅 V3 不 V2、Dummy 在传输层收发 32B 原始帧** | V3 单方言避免「发错方言静默失败」翻倍（R2/Q2）；Dummy 在传输层使全链路代码有/无硬件同一份、风险最低（A4） | **隐含 VIA 中心化**：`ViaProtocol`/`DeviceFacade` 与 VIA 紧耦合，未留多协议扩展点（见 §3.3） | 成立 | **部分成立**：Em60 是 VIA 静电容特例；主流静电（HHKB/Realforce/NiZ 原厂）不讲 VIA | 保留 V3 单方言；**抽 `DeviceProtocol` 接口**使 VIA 成为实现之一 |
| D7 | **分层依赖铁律**（协议/传输不依赖 React；UI 经 DeviceFacade；单向向下） | 协议/传输层可在 Node 下单测（Vitest），与 UI 解耦；调试面板统一记报文 | 跨层需经门面，初写略繁琐 | 成立 | **成立且是泛化的骨架**：vendor 协议层复用同铁律即可零改造接入 | **继承**（泛化时严守） |

---

## 2. 关键风险点再评估

### 2.1 WebHID 仅 Chrome/Edge 支持——「本地驱动软件」定位是否成立？

- **事实**：WebHID 当前仅 Chromium 系（Chrome/Edge 113+）。Safari/Firefox 不支持（R10）。无 Electron 则无独立安装包，`npm run desktop` 仍是「Chrome `--app` 拉起 localhost」。
- **定位再评估**：作为「**开发期与爱好者向**的本地驱动」定位完全成立（Em60 已跑通全界面）。但作为「**面向普通静电容用户的产品**」定位**偏弱**——普通用户不会开 Chrome 跑 localhost。
- **裁决**：定位分两层——**本期**维持「Web 驱动工具」成立；**静电优先战略下中期必须补 Electron 分发层**，否则「普通用户可用」是空话。Electron 零前端改造（架构 §1.2），风险已对冲，应提升优先级。

### 2.2 node-hid 被网络阻塞，原生后端实际为零——跨平台交付真实路径？

- **事实**：`NodeHidBridgeTransport` 仅留接口与文档（ARCHITECTURE §3.3），`node-hid` 需 node-gyp + GitHub 二进制，本机 `raw.githubusercontent.com` 不可达（R3/R4）。即**当前的「跨平台原生后端」交付能力=0**。
- **真实路径**：① 短期——WebHID（Chromium 全平台可用，mac/win/linux 都行，只是要 Chrome）；② 中期——Electron 内嵌 Chromium，WebHID 原样复用，得安装包；③ 远期——若必须脱离浏览器（如系统级驱动），需重新评估 Tauri/原生，但当前网络与工具链条件不支持，**不作为本期选项**。
- **结论**：跨平台交付真实路径 = **WebHID（开发/爱好者）+ Electron（分发）**，两者共用同一套 `WebHidTransport`，零重复劳动。原生 node-hid 在「无网络可装二进制」环境下应**正式降为丢弃项**，不要再占用决策带宽。

### 2.3 Bug C 决策僵局——架构师明确裁决（三问，不回避）

> 这是接手第一优先（HANDOVER §6）。此前两次催办未决，现给出**不可撤销裁决**。

**问一：该键盘用新协议还是老协议键码表？**
→ **用新协议（QK_MOD_TAP = 0x2000–0x3FFF）。** 证据链：
1. `research-via-protocol.md §D(1270-1336)` 新协议枚举 `QK_MOD_TAP=0x2000`；老协议（`vial-gui` v5，同文档 1383 行）才是 `_QK_MOD_TAP:0x6000`。
2. 定义文件已用新协议值：菜单 label `按键复用(0)-0X5700`=`QK_TAP_DANCE=0x5700`（新）、`customKeycodes`→`QK_KB+N=0x7E00+N`（新）——HANDOVER §6。
3. 产品握手要求 protocol ≥ 11，当前 QMK 为 13（新协议）。
4. `constants.ts` 自身 MIDI/SEQUENCER/PROGRAMMABLE_BUTTON/RGB 已是新协议值（`0x7100/0x7200/0x7400/0x7800`），全代码库**只有 `MOD_TAP:0x6000` 与 `KeycodeFormatter:55` 的 `0x6000–0x7FFF` 还停留在老协议**，属于未完成的迁移残留，不是「固件用老协议」。

**问二：若新协议，`0x6000–0x7FFF` 如何拆？`0x6104` 那条断言是错了还是固件返回老协议值？**
→ 按新协议分段（`research-via-protocol.md §D 1300-1336` + 1586-1593）：
- `0x6000–0x6FFF`：**legacy hole**（新协议无 QK 页，老协议 Mod-Tap 的旧址）→ 兜底 hex；
- `0x7000–0x70FF` QK_MAGIC；`0x7100–0x71FF` QK_MIDI；`0x7200–0x73FF` QK_SEQUENCER；`0x7400–0x743F` QK_JOYSTICK；`0x7440–0x747F` QK_PROGRAMMABLE_BUTTON；`0x7480–0x74BF` QK_AUDIO；`0x74C0–0x751F` QK_STENO；
- `0x7700–0x777F` QK_MACRO；`0x7780–0x77BF` QK_CONNECTION；`0x77C0–0x77FF` QK_COMMUNITY_MODULE；
- `0x7800–0x78FF` QK_LIGHTING；`0x7C00–0x7DFF` QK_QUANTUM；`0x7E00–0x7E3F` QK_KB（custom）；`0x7E40–0x7FFF` QK_USER。
- **Mod-Tap 整体迁到 `0x2000–0x3FFF`**：因此 `QK_PAGE.MOD_TAP` 必须由 `0x6000`→`0x2000`。
- **`0x6104` 断言是错了，不是固件返回老协议值。** 新协议下 `LCTL_T(KC_A)=MT(0x01,0x04)=0x2000|0x0100|0x04=0x2104`。该测试（`:43`）反映的是老协议假设残留，应改为 `expect(LCTL_T(KC_A)).toBe(0x2104)`。这同时印证 HANDOVER §6 的自问：「断言错了还是固件返回老协议值？」→ **断言错了，固件（定义文件）是新协议**。

**问三：`KeycodeTable` 当前只有 basic/layers/modtap，缺 media/lighting/quantum/macro，是否要补？**
→ **补，但定为 S2（完成 VIA 路径），不作为静电转向的阻塞项。** 理由：
- `groups.ts:8-11` 已声明 `media/lighting/quantum/macro` 四个分组槽位，只是 `media.ts/quantum.ts/lighting.ts/macro.ts` 从未创建（S2 被推迟），`KeycodeTable.builtins()` 只 import 了 basic/layers/modtap → 这四个分组因零键码被 `groups()` 过滤掉（KeycodeTable.ts:67）。
- 补它们**不与静电适配冲突**，且能让 Em60 的 Lighting 菜单选到 RGB 键（HANDOVER §6 Q3）。
- 但静电主流（Topre/Realforce/NiZ 原厂）多无 RGB，故优先级低于「协议泛化」。建议：**S2 顺手补 media/lighting/quantum/macro 键码数据**，让 VIA 路径完整；静电转向的真正工作在第 3 节。

**Bug C 最小修复清单（精确到行）**：
1. `constants.ts:75` `MOD_TAP: 0x6000` → `MOD_TAP: 0x2000`（MOD_TAP base 改新协议）。
2. `KeycodeFormatter.ts:54-58`：把「`kc>=0x6000 && kc<=0x7fff` 全当 Mod-Tap」改为「Mod-Tap 判 `0x2000–0x3FFF`」+ 新增 `0x7000–0x7FFF` 的分段表（Magic/MIDI/Sequencer/Joystick/ProgButton/Audio/Steno/Macro/Connection/Community/Lighting/Quantum/KB/User）。注意 `LAYER_TAP`/`layerPages`（0x4000/0x5000/0x5700/0x7700 等）**已是新协议值，无需动**。
3. `KeycodeFormatter.test.ts:43` `0x6104` → `0x2104`（`:42` 的 `format(LCTL_T(KC_A))` 在新值下仍得 `LCTL_T(A)`，自动通过）。
4. 随后修 Bug D（显示名↔Any 输入往返，见 §5）。

### 2.4 12 条红测试长期挂着 + 1 个 tsc error 的影响

- **代码健康**：12 红是「探针」本意良善（HANDOVER §5：「修好源码会转绿，别改断言」），但**长期全量红**会：① 掩盖真实回归（真回归淹没在已知红里）；② CI 无法用「全绿」作门禁；③ `byCodeMap` 之类性能债（HANDOVER §12-9）被红海掩盖。
- **接手方心理**：12 条红 = 「broken is normal」的暗示，新人不敢动核心；且「红=故意」无机器可读标记，新人易误判。
- **裁决**：**保留探针，但改用 `test.failing` / `it.skip` + 关联 Bug ID 标注**，使其不污染 pass/fail 基线（vitest 的 `test.failing` 在「意外变绿」或「失败形态变化」时反而会报警，比裸红更安全）。1 个 tsc error（`SimulatedFirmware.ts:24`）立即清（半天内，HANDOVER §12-1）。

---

## 3. 战略适配性评估（重点）

### 3.1 当前「VIA 协议为中心」的架构，面对「静电优先」是否仍成立？

**成立，但需重新定性。** 关键发现（§0-3）：**当前目标键盘 Em60 就是静电容，且已通过 VIA V3 定义文件 + VIA 协议驱动**。因此：
- VIA 路径**不是**与静电无关的「机械键盘专用层」，而是**已经跑通的静电驱动样例**。
- 「战略转向静电优先」的真实含义是：**不要把资源铺到「更多机械/QMK 键盘」，而是深耕静电**——而 Em60 这条 VIA 路径恰好是深耕的起点。
- 所以 VIA 中心化**不推翻**，只需**解除「VIA 唯一」的隐含假设**。

### 3.2 静电容键盘协议现实（为什么需要泛化）

- **Em60 类**：静电容硬件 + VIA 兼容固件 → 现有 VIA 路径直接覆盖（特例，已 work）。
- **HHKB / Realforce（Topre）、NiZ 等原厂静电**：**通常不是 QMK、不暴露 VIA 协议**，各有专有 HID 命令集（如 HHKB 自有配置 HID 报文、NiZ 自有软件协议）。它们的可配置项更少且更固定（触发点/键映射/宏/RGB），**不具 VIA 的开放 `menus` 模型**。
- 结论：**VIA 只是静电生态的「子集兼容层」，不能代表整个静电市场**。现有架构若仅留 VIA，则只能吃下「恰好讲 VIA 的静电板」，吃不下 HHKB/Realforce/NiZ 原厂。

### 3.3 `ViaProtocol` / `HidTransport` / `DeviceFacade` 能否平滑泛化为多厂商协议适配？

- `HidTransport`（传输层接口）：**已可插拔**（WebHid/Dummy/NodeHid 三实现），与协议无关。**无需改**。
- `ViaProtocol`（协议层）：**当前是 VIA 硬编码的单体**，`DeviceFacade` 直接依赖它（ARCHITECTURE §4.1 `DeviceFacade *-- ViaProtocol`）。这是泛化的唯一堵点。
- `DeviceFacade`（门面层）：方法签名（`getKeymap`/`readValue(addr,width)`/`writeValue`/`saveValue`/`eepromReset`/`exportState`）已是**与协议无关的语义 API**——这是好消息，门面本身可保留。
- **泛化插入点**：在 `DeviceFacade` 与 `ViaProtocol` 之间抽一层 **`DeviceProtocol` 接口**（能力集：handshake / getKeymap / setKeycode / readCustomValue(ValueAddress) / writeCustomValue / save / reset / getLayoutOptions / setLayoutOptions）。`ViaProtocol` 实现该接口；新增 `NizProtocol` / `TopreProtocol` 各实现该接口，各自翻译到自家 HID 命令，但**复用同一个 `HidTransport`**。

### 3.4 三条演进路线对比

| 路线 | 做法 | 优点 | 缺点 | 裁决 |
|------|------|------|------|------|
| **A. 保留 VIA 作为其一，新增厂商协议适配** | 抽 `DeviceProtocol` 接口；`ViaProtocol` 落地；按厂商加 `NizProtocol`/`TopreProtocol`；定义层加 `vendor` 标签 + 厂商能力清单 | 复用 90% 现有代码（门面/传输/UI/键码）；分层铁律零改造延续；Em60 路径不动 | 需定义「厂商能力清单」如何映射到现有 menu/ValueAddress 模型（HHKB/NiZ 无开放 menus） | **✅ 推荐主路线** |
| B. 另起炉灶做厂商 SDK | 为每个静电厂商单独写 UI+协议 | 最贴合单厂商体验 | 重复造轮子；违背「定义驱动 UI/无硬编码」支柱；与现有 480 绿测试资产割裂 | ❌ 否决 |
| C. 只做 VIA，放弃原厂静电 | 维持现状 | 零改动 | 吃不下 HHKB/Realforce/NiZ 原厂，与「静电优先」战略背道而驰 | ❌ 否决 |

**路线 A 的关键子问题——「厂商能力」如何不破坏定义驱动 UI**：
- Em60（VIA）：继续用 VIA V3 json `menus`。
- 原厂静电（HHKB/NiZ）：没有 VIA `menus`，改为**厂商能力清单（capability manifest）**——一份声明「本键盘支持哪些可调项 + 每项 HID 命令 + 取值范围」的 JSON，由 `NizProtocol`/`TopreProtocol` 消费，并**动态生成与 VIA `menus` 同构的 `ControlSpec[]`**，从而复用同一套菜单引擎/UI。**这正是「定义驱动 UI」的自然延伸，不硬编码任何键盘特征**（D4 守卫继续生效）。

---

## 4. 关键风险登记表（更新版，基于 ARCHITECTURE §9 增补战略项）

| # | 风险 | 影响 | 概率 | 原缓解 | **战略转向后新增/变更缓解** |
|---|------|------|------|--------|------|
| R1 | 无法实机验证协议字节格式 | 写值静默失败 | 高 | ValueWidth+覆盖表+回读自校验+Dummy | 不变；静电厂商命令集更封闭，需厂商文档/样机 |
| R2 | 发错方言静默失败 | 看似成功实则全 0 | 中 | 握手读 0x01+自校验探针+仅 V3 | **新增**：多协议下探针须校验「协议标识/厂商握手」，不只 VIA version |
| R3 | 原生模块编译 | 项目停滞 | 中 | WebHID 主+node-hid P2 | **node-hid 正式降为丢弃**，跨平台走 WebHID+Electron |
| R4 | Electron 下载失败 | npm 装不上 | 中 | 本期不引入+optionalDeps | **中期必做**，需配 ELECTRON_MIRROR/手动下载预案 |
| R5 | valueKey 重复串号 | 状态串号 | 已确认 | controlId 生成 | 不变（厂商清单同样禁用特征词做主键） |
| R6 | KLE 行压紧 | 配列错乱 | 中 | compactRows+单测 | 原厂静电若无 KLE 布局，需厂商键位图或退化为列表 |
| R7 | EEPROM 寿命 | 硬件损坏 | 中 | 200ms 防抖+串行队列 | 不变 |
| R8 | 349 控件性能 | 卡顿 | 低 | controlId 精确订阅+懒加载 | 不变；`byCodeMap` 缓存待补 |
| R9 | button 致断连 | 假连接 | 中 | 二次确认+onDisconnect | 不变 |
| R10 | WebHID 浏览器兼容 | 部分用户不可用 | 低→**中** | isSupported 提示+README | **静电普通用户放大该风险**→ 中期 Electron |
| R11 | 定义/固件不匹配 | 写错语义 | 中 | 握手比对+侧载匹配 | **新增 R13**：厂商清单与固件版本不匹配 |
| R12 | Custom 键码基址假设 | 行为不符 | 中 | 设置可覆盖 | 不变 |
| **R13（新）** | **VIA 中心化阻塞多厂商** | 吃不下原厂静电 | 高 | — | **抽 `DeviceProtocol` 接口（路线 A）；厂商清单驱动 UI** |
| **R14（新）** | **Bug C 老协议残留致键码误判** | RGB/Magic 页被当 Mod-Tap | 已触发 | — | **立即按 §2.3 裁决修**（constants:75 + Formatter:55 + test:43） |

---

## 5. 明确的 Bug C 裁决建议（单独成节，供接手方直接执行）

见 §2.3。三问答案：
1. **新协议**（QK_MOD_TAP=0x2000–0x3FFF）。
2. `0x6000–0x7FFF` 按 research §D 分段（0x6000–0x6FFF 兜底 hex，0x7000+ 拆 Magic/MIDI/…/USER）；Mod-Tap 迁 0x2000–0x3FFF；**`0x6104` 断言是错的，改 `0x2104`**。
3. **补 media/lighting/quantum/macro**（S2，非阻塞），让 VIA 路径完整。

**Bug D（紧随 Bug C）**：根因是「显示名词表」（`KeycodeFormatter.format` 输出的 `label/name`）与「解析词表」（`AnyKeycodeParser.parseAtom` 经 `KeycodeTable.findByName` 查 `name+aliases`）是**两套未同步的词表**（HANDOVER §5：215 内置键码中 119 个显示名无法被 Any 输入解析回）。修复原则：① 显示名必须取自 `KeycodeDef.name/aliases` 之一（单一词表，format 与 parse 共用）；② 或在 `KeycodeTable` 增加 `displayName→code` 反向索引并让 `AnyKeycodeParser` 也用它。不要两表各写一份。

**Bug F（可立即修）**：`DefinitionRepository.ts:55-66` `findByVidPid` 已生成 3 种候选 key，但仍不认 `0X1A2B`/`0x1A2b` 这类大小写混写——应统一 `parseId` 归一化（去 `0x` 前缀、转小写、补零）后再匹配，单点低成本。

---

## 6. 架构演进路线图

### 短期（接手后 1–3 天，继承 + 止血）
1. 清 `tsc` 1 error（`SimulatedFirmware.ts:24`）。
2. **执行 Bug C 裁决**（§2.3 四步），让 `0x7800` 不再被误判为 `RGUI_T`。
3. 修 Bug D（单一词表）、Bug F（VID/PID 归一化）。
4. 补 `KeycodeTable` 的 media/lighting/quantum/macro 键码数据（S2，让 Em60 Lighting 可选 RGB 键）。
5. 12 红测试改为 `test.failing`/`it.skip` + Bug ID 标注，恢复「全绿基线」可用。
6. 补 T04 正式验收（349 控件全读写、All Off 联动、导出→复位→导入一致，HANDOVER §4）。
7. T05 实现 `WebHidTransport`（标注「未实测」直至有硬件）。

### 中期（1–3 周，泛化 + 分发）
1. **抽 `DeviceProtocol` 接口**（§3.3），`ViaProtocol` 落地该接口；`DeviceFacade` 改为依赖接口而非具体类。
2. 定义**厂商能力清单（capability manifest）** schema，使其能生成与 VIA `menus` 同构的 `ControlSpec[]`，复用菜单引擎（路线 A）。
3. 实现首个原厂静电适配（建议 **NiZ** 或 **HHKB** 其一作样板）：`NizProtocol`/`TopreProtocol` 经同一 `HidTransport` 翻译自家 HID 命令。
4. **Electron 最小分发骨架**（`electron/main.ts` + `docs/ELECTRON.md` 配镜像），把「静电普通用户可安装」从空话变现实（R4/R10 中期缓解）。
5. 补 `byCodeMap` 缓存、UI/store 层测试（HANDOVER §12-8/9）、代码分割（543kB chunk 警告）。

### 长期（可选）
- Tauri/原生后端：仅在「必须脱离浏览器」且网络条件改善后评估，当前不排期。

---

## 7. 给团队的关键结论（一句话版）

- **继承**：分层铁律、定义驱动 UI + 无硬编码守卫、Zustand 精确订阅、WebHID+Dummy 可插拔、VIA V3 单方言——全部保留。
- **立刻裁决**：Bug C 用新协议，`MOD_TAP` 0x6000→0x2000，`0x6104` 测试改 `0x2104`，`KeycodeFormatter:55` 分段重写。
- **战略转向不推翻 VIA**：Em60 已是「VIA 驱动的静电容」样板；真正要做的是**把 VIA 降为 `DeviceProtocol` 的一种实现**，并新增原厂静电厂商协议适配（路线 A），用厂商能力清单复用同一套 UI。
- **分发补课**：静电普通用户需要安装包，中期必须补 Electron（零前端改造，已规划）。
