# 静电容键盘驱动调研备忘录

> 调研人：许清楚（产品经理）  ·  日期：2026-10-10
> 背景：keydriver 项目战略转向——**首期优先适配静电容键盘（electrostatic capacitive keyboard）**，而非机械键盘。本备忘录调研各厂商驱动做法、VIA/QMK 对静电容的适用性、现代驱动架构范式，并给出对现有「VIA 协议为中心」架构的调整建议。
> 说明：凡命令字节、协议细节不确定的，一律标注「待实机/厂商文档验证」，未杜撰。

---

## 一、调研发现摘要（核心结论）

1. **主流量产静电容键盘（HHKB / Realforce / NiZ / Leopold / Varmilo EC 线）全部使用厂商专有 HID 命令集，没有一台出厂即暴露 VIA（QMK）协议。** HHKB 走的是 vendor usage page `0xFF00`（不是 VIA 的 `0xFF60`），Realforce、NiZ 各自有未公开的专有协议。VIA = QMK 固件的动态键位协议，对量产静电容不适用。

2. **QMK 对静电容（Topre/NiZ）的支持仅存在于第三方「替换 PCB」项目**（如 Cipulot EC87、qmk_firmware 中 `viktus/styrka_topre`），靠定制传感电路把 Topre/NiZ 轴接入 QMK；原厂成品键盘不刷 QMK。Geekhack Faraday60 社区明确：「Topre 难接入 QMK，因为它为接触式开关设计」。

3. **静电容键盘「可配置能力」比机械 VIA 键盘多出两项关键维度：触发点/触发压力调节（APC / Actuation Point Changer）与触发参数校准。** 这是静电容的差异化卖点（Realforce APC 0.8–3.0mm 连续可调、NiZ 校验软件调底层触发参数、Wooting 磁轴触发点），而 VIA 协议完全不建模这两个能力——这正是现有架构最大的能力缺口。

4. **现代驱动软件的跨平台范式高度收敛为「WebHID 网页端 + Electron 桌面端」双形态**（VIA usevia.app、Wootility、Ducky Hub、Realforce Linux Web Tool 均如此）。应用层（React/Vite）可复用，**真正需要按厂商分化的是「传输/协议层」**，而非 UI。

5. **配置普遍要求「有线 USB 连接」才能改键/写固件**（VIA、HHKB、NiZ、Realforce 均如此，蓝牙多用于配对与切换，少数新固件支持无线配置但非主流）。因此 WebHID+USB 作为首期传输主通道是合理的。

---

## 二、厂商对比表

| 厂商 | 键盘类型 | 驱动软件 | 通信协议 | 可配置能力 | 是否 VIA |
|---|---|---|---|---|---|
| **HHKB（PFU / Topre）** | 静电容 Topre | HHKB Keymap Tool（Win）/ HHKB Studio 专用工具（Mac，型号专用） | 专有 USB HID：vendor usage page **0xFF00**，64-byte in/out 报告；请求 `AA AA`/响应 `55 55`（社区逆向，PFU 未公开）。蓝牙仅用于配对/多设备切换，**不改键** | 键位重映射（3 模式×2 层）、DIP 状态读取、恢复出厂、固件读取/部分刷写、板载存储；Studio 支持最多 4 个配置文件；**无宏** | 否 |
| **Realforce（Topre）** | 静电容 Topre | Realforce Software / Realforce Connect（Win 11+ / macOS 14.5+ / Linux 有 Web Tool） | 专有 HID（未公开，社区未见逆向）；Linux 走网页工具 | **APC 触发点调节**（0.8–3.0mm，0.1mm 步进 / GX1 达 30 级）、键位重映射、配列 A/B 切换、宏、热图（heat map）、ECO、固件升级、RGB（GX1）、Dynamic Mode/RT/SOCD（GX1）、板载存储 | 否 |
| **NiZ 宁芝（Topre-style）** | 静电容 NiZ EC | NiZ 编程软件 / 校验软件（Win + Mac） | 专有 HID；USB / PS2 / 2.4G 接收器（Milsky LL Dongle，伪装 Apple VID:PID `05ac:0220`）；**有线改键** | 键位重映射（单/组合，≤6 键）、宏、模拟击键、背光 RGB、固件升级（.bin）、按键计数、2 层（左/右 FN）、**触发参数校准**、板载存储；L84 达 8kHz 回报率 | 否 |
| **Varmilo 机械线（VA80 / VA100）** | 机械 MX | VIA（QMK/VIA） | VIA（0xFF60）/ QMK | 键位重映射、宏、层、灯光 | 是（机械线） |
| **Varmilo EC 静电容线（MA87M / CMYK VEM108 / Sword 2-108）** | 静电容 Varmilo EC V2/V3 | Varmilo 专有 Web Driver（**2024.10 起 EC V3 推出网页驱动**） | 专有（**非 VIA**） | 热插拔（EC V3）、改键、灯光（部分）、宏（部分）；不支持 QMK/VIA | 否（静电容线） |
| **Durgod** | 机械 MX | Zeus Engine / Hera Compiler（专有） | 专有 HID | 重映射、宏、RGB、固件 | 否 |
| **Ducky** | 机械 MX | Ducky Hub（Web，Chrome + USB）/ Ducky Macro Manager | WebHID 风格专有通道（需 USB） | RGB、触发力、多点触发、宏、键位 | 否 |
| **Leopold FC660C** | 静电容 Topre | 无官方软件；社区 web TMK configurator / Hasu 替换控制器；DIP 开关 | —（改键依赖替换控制器或有限 Fn 层） | DIP 布局切换、Fn 层、有限改键 | 否 |
| **Keychron（标杆·机械）** | 机械 MX | VIA（usevia.app 网页 + 桌面 Electron） | VIA（0xFF60）/ QMK | 键位重映射、宏、层（4）、灯光、固件 | 是 |
| **Wooting（标杆·磁轴，体验标杆）** | 霍尔磁轴 | Wootility（Web + 桌面 Electron） | 专有 HID（WebHID/原生；USB 配对后无线上板载生效） | 每键触发点、Rapid Trigger、SOCD/Rappy Snappy、DKS、Remap、Mod Tap、模拟摇杆、RGB、4 个板载配置 | 否（但其架构范式最值得借鉴） |

> 关键区分：**Varmilo 机械线支持 VIA，而其 EC 静电容线不支持**——切勿把「Varmilo 支持 VIA」误推广到静电容品类。同理，任何声称「静电容 + VIA」的成品，几乎都是第三方替换 PCB（如 EC87），非原厂。

---

## 三、核心判定：VIA/QMK 是否适用于静电容键盘？（证据）

**结论：量产静电容键盘不使用 VIA/QMK；VIA 协议对它们不适用。**

**证据链：**

1. **VIA 协议的本质 = QMK 固件的动态键位协议，通过 HID 识别。**
   - 设备识别特征为 HID usage page **`0xFF60`** + usage **`0x61`**（via-protocol Rust crate、web-Via DeepWiki 均明确）。VIA 命令集依赖 QMK 固件内建的 dynamic keymap / lighting / macro 实现。

2. **原厂静电容固件是专有固件，不是 QMK，也不暴露 0xFF60。**
   - HHKB 逆向工程（github.com/oxidme/HHKB-reverse-engineering）显示其控制通道为第三个 HID 接口，vendor usage page **`0xFF00`**（与 VIA 的 `0xFF60` 不同），有独立命令集（读信息/DIP/键位、写键位、恢复出厂、读固件），且「PFU documents none of this」。这是一手逆向证据。
   - Realforce、NiZ 的协议从未公开，社区未见类似 VIA 的标准化逆向，均属厂商私有。

3. **QMK 对 Topre/NiZ 的支持是「替换 PCB」级别的社区项目，非原厂。**
   - `qmk_firmware/keyboards/viktus/styrka_topre/ec.c` 与 Cipulot 的 EC87 PCB 通过**定制主动传感电路**把 Topre/NiZ 轴接入 QMK，并可挂 VIA/VIAL。这属于客制化改造。
   - Geekhack Faraday60（IC 帖）直言：Topre「hard to integrate into QMK because it is specifically designed for contact-based switches；no everlasting efforts to make Topre QMK-compatible and none widely adopted」。

4. **反向佐证：VIA 官方兼容列表（caniusevia.com）与厂商文档中，HHKB/Realforce/NiZ/Leopold 均不在列；Varmilo 仅机械线在列。** Durgod 官方也声明「Does Durgod support QMK or VIA? No」（mkbguide 2026）。

> 待实机/厂商文档验证：Realforce、NiZ 的具体 HID 报告格式与命令字节（公开资料不足，本文未杜撰）。HHKB 的 `0xFF00` 命令集细节可参考上述开源逆向项目，但每个型号（Classic/Hybrid/Studio）命令支持度不同，需逐型号核对。

---

## 四、对 keydriver 项目的建议（基于「首期适配静电容」战略）

现有架构以 VIA 协议为中心（WebHID + usage page 0xFF60 + VIA 定义 JSON + QMK 动态键位）。**由于静电容键盘没有一台走 VIA，必须泛化传输层、抽出 vendor/protocol 适配层，否则无法接入任何目标设备。** 以下是具体、可落地的改造建议：

### 建议 1：抽象出「传输/协议适配层」（最核心）
- 定义统一的设备接口（与具体协议无关）：
  `discover()`、`open()`、`read(report)`、`write(report)`、`getDeviceInfo()`、`getKeymap(layer,row,col)`、`setKeycode(...)`、`save()`、`factoryReset()`、`firmwareUpdate()`、`getCapabilities()`。
- 现有 VIA 实现改造为 `ViaProtocolAdapter`（保留，作为机械键盘通道）。
- 新增静电容适配器：`HhkbAdapter`（0xFF00，逆向资料最全，建议作为第一个参考实现）、`RealforceAdapter`、`NizAdapter`（协议相对简单、国内社区活跃，可作为低成本切入）。
- **设备发现不能再用单一 `0xFF60` 过滤器**：每个适配器自带 usage page / VID:PID 过滤条件（0xFF60 VIA、0xFF00 HHKB、NiZ 的 05ac:0220 接收器等）。

### 建议 2：用「能力描述符（Capabilities）」取代硬编码的 VIA 字段
- 每个适配器暴露一个 `Capabilities` 对象，例如：
  `{ remap, layers:n, macros, lighting:schema|null, actuationPoint:{min,max,step}|null, triggerCalibration, profiles:n, fwUpdate, heatmap, rtSocd }`。
- **菜单引擎改为数据驱动**：只渲染设备声明支持的能力。这直接对接我们已有的「菜单引擎」需求，并补齐 VIA 缺失的两个静电容关键维度——**触发点/APC 调节**与**触发参数校准**。
- 这是本次战略转向最关键的设计点：静电容的差异化能力（Realforce APC 0.8–3.0mm 连续可调、NiZ 底层触发参数）必须在数据模型里有一席之地，否则「适配静电容」只是空话。

### 建议 3：VIA 定义 JSON → 厂商中立的「设备 Profile」格式
- 保留 VIA JSON 作为 VIA 设备的来源之一，但泛化为 `DeviceProfile` 模式（matrix 布局、keycodes、lighting 模型、capability 标志）。
- 适配器负责把各自协议「翻译」成统一的 DeviceProfile，UI 只消费 DeviceProfile，不感知协议差异。

### 建议 4：Dummy 适配器作为统一接口的 Mock，继续保留并强化
- 现有 Dummy 必做项恰好应实现同一套设备接口，作为无硬件时验证各适配器的测试桩。建议把 Dummy 也挂在适配层之下，而非特例。

### 建议 5：传输主通道维持 WebHID + USB（首期够用）
- 所有目标厂商都用 USB HID，WebHID 仍是跨平台（Chrome/Edge/Chromium）最佳主通道。
- 蓝牙配置暂不纳入首期：VIA 与静电容厂商均要求有线改键/刷固件，无线多为配对/切换。后续如需无线配置，再评估 WebHID over BLE（如 genokolar 新固件方案），但非 P0。
- 本期不做 Electron，则需注意：Safari/Firefox 无 WebHID，应给出「请用 Chrome/Edge」的明确引导与降级提示（与 VIA 网页端一致）。

### 建议 6：落地优先级（P0 / P1 / P2）
- **P0**：定义设备接口 + Capabilities 描述符 + 菜单引擎数据驱动改造 + Dummy 适配器 + 保住现有 VIA 适配器不回归。
- **P1**：实现首个静电容参考适配器（推荐 **HHKB 0xFF00**，逆向公开度最高；或 **NiZ**，协议简单且中文社区资料多）；打通「发现→读键位→改键→写板载」最小闭环。
- **P2**：Realforce（APC/热图/宏）、Varmilo EC 线（Web Driver）适配器；补齐触发点/校准 UI。

### 建议 7：UI 层尽量不重建
- React19 + Zustand + Tailwind + Radix 这套 UI 可继续复用；Zustand store 改为持有「归一化设备模型 + Capabilities」，组件从该模型渲染。菜单引擎从 capabilities 生成，而非写死 VIA 字段。

---

## 五、关键来源 URL（一手/高可信优先）

- HHKB 协议逆向（0xFF00 一手证据）：https://github.com/oxidme/HHKB-reverse-engineering
- HHKB 可编程/Keymap Tool 官方说明：http://hhkeyboard.us/resources/features/fully-programmable-keyboards
- Realforce R4 能力与 APC（厂商/零售页）：https://www.mechanicalkeyboards.com/products/Topre-Realforce-R4-45g-Wireless-Keyboard ；GX1 Dynamic/RT/SOCD：https://halleffectcontroller.com/product/topre-realforce-gx1-mechanical-keyboard
- NiZ 用户手册（编程软件/宏/固件）：https://manualspro.net/242721-niz-108ec-xrgb-electrostatic-capacity-switch-keyboard-series-user-manual ；NiZ 官网：https://www.niz.store/en
- NiZ 接收器伪装 Apple VID:PID（Linux 内核补丁，协议侧证）：https://lore-kernel.gnuweeb.org/linux-input/20260403161806.31908-1-utzcoz@gmail.com/T/
- Varmilo EC 静电容开关与网页驱动（非 VIA）：https://varmilo.com/zh/pages/switches-parameter ；MA87M 不支持 QMK/VIA：https://gearpicker.gg/varmilo-ma87m-summit-r2/alternatives
- Varmilo 机械线 QMK/VIA：https://www.keystrook.com/products/keyboard-va80-hygge
- Durgod 不支持 QMK/VIA（mkbguide 2026）：https://mkbguide.com/blog/durgod-keyboards-guide-taurus-hades-series-explained-2026
- Ducky Hub 网页驱动（Web，Chrome+USB）：https://www.overclockers.co.uk/blog/how-to-use-ducky-hub-software/
- Leopold FC660C 无软件/Topre：https://pcper.com/2021/09/the-elusive-leopold-fc660c-capacitive-keyboard/ ；https://www.techpowerup.com/review/leopold-fc660c-low-noise-electrostatic-capacitive-keyboard
- VIA 协议识别（usage page 0xFF60 / 0x61）：https://deepwiki.com/jeromeli002/web-Via/4.1-device-discovery-and-connection ；via-protocol crate：https://crates.io/crates/via-protocol
- VIA 跨平台/WebHID 限制指南：https://mechanicalkeyboard.net?p=2938/ ；https://genokolar.github.io/configurator
- WebHID 配置软件范式（Developex）：https://developex.com/webhid-configuration-software-development/
- Wooting Wootility 能力/架构（Web+桌面）：https://wooting.io/wooting-60he-module ；https://www.digitaltrends.com/computing/wooting-80he-review/
- Keychron VIA 用法（QMK/VIA）：https://manualspro.net/315497-keychron-v1-wired-custom-mechanical-keyboard-user-manual
- QMK 对 Topre 的社区替换 PCB（非原厂）：https://kbd.news/EC87-1385.html ；https://geekhack.org/index.php?topic=105035 ；https://github.com/qmk/qmk_firmware/blob/master/keyboards/viktus/styrka_topre/ec.c
- 静电容品类与厂商格局综述：https://mkbguide.com/blog/hhkb-topre-keyboards-deep-dive ；https://it.sohu.com/a/892662256_404443
