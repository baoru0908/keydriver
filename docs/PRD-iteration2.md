# KeyDriver 迭代 2 增量 PRD：功能打磨 · UI 现代化 P1 · 多平台适配

> **来源**：用户原话「先暂时不做 [Tauri 迁移]，先优化本体功能和 UI，记得多平台的适配性，同步 git」。
> **定位**：增量 PRD，基于迭代 1 已落地的 P0（design-tokens.md 令牌基座、主题切换、useViewTransition、懒加载、微动效、公证钩子、spacing 守卫）继续演进。
> **本轮不做**：Tauri 迁移 / Spike；竞品分析；移动端适配。
> **约束**：零硬编码原则、深色默认主题策略不变；git 由主理人处理；2 空格缩进、src 下分号结尾。
> **证据标注**：所有「现状」均来自本轮代码核查（文件:行），实现与 QA 可直接回查。

---

## 一、产品目标

1. **补齐关键体验断点**：消除「断连无感知」「关窗丢改动」两类数据/状态风险，让高频操作（改键、存菜单、备份）全程有反馈、可挽回。
2. **UI 现代化完成 P1 档**：按 `docs/design-tokens.md` 基准落地状态范式与 elevation/组件补全，使观感达到 Wootility 同档的「打磨感」。
3. **桌面三平台可靠可用**：macOS / Windows / Linux 下窗口行为、快捷键、DPI 渲染、明暗表现一致，不因平台差异产生可用性缺口。

## 二、用户故事

1. **As a 键盘用户**, I want 拔线/关机后应用立即感知并恢复到可重连状态, so that 我不会在假连接状态下继续写入导致保存失败困惑。
2. **As a 已改动多项配置的用户**, I want 关闭窗口前被提醒有未保存改动, so that 我不会误关丢失辛苦调好的配置。
3. **As a 等待数据加载的用户**, I want 骨架屏与明确的加载/空/错误三态, so that 我始终知道应用在做什么、下一步该做什么。
4. **As a Windows/Linux 用户**, I want 窗口缩到很小时界面仍可用、快捷键提示符合平台习惯（Ctrl 而非 ⌘）, so that 我感觉这是原生应用而非网页套壳。
5. **As a 深色主题用户**, I want 应用启动无白屏闪烁、标题栏与应用底色一致, so that 观感一体、现代。

---

## 三、需求池

### A 线：本体功能打磨

#### P0（本轮必做）

| # | 需求 | 现状证据 | 要求 |
|---|---|---|---|
| A0-1 | **设备断连感知与状态恢复**：拔线 / 设备关机 / 系统休眠唤醒后，应用自动感知并将连接态置为「已断开 + 可重连」，停用写入类操作并给出明确提示 | `WebHidTransport.ts:154-163` 已有全局 disconnect 事件并暴露 `onDisconnect(cb)`；但 `DeviceFacade.ts` 全文无 `onDisconnect` 订阅（grep 证实），`useDeviceStore.ts:212-219` 仅在用户主动 `disconnect()` 时复位状态。**断连后 state 恒为 'connected'，写入静默失败** | 在 DeviceFacade/会话层订阅 transport `onDisconnect` → 上抛至 useDeviceStore 置 `state='disconnected'`（或新增 `'lost'` 语义）+ Toast 提示；busy 中的写队列安全终止；状态栏/横幅同步；一键重连入口 |
| A0-2 | **未保存改动关窗拦截**：keymap/menu 存在脏值时关闭窗口前弹确认（放弃/取消），防数据丢失 | `StatusBar.tsx` 已展示「未保存 N 项」；但全仓 grep 无 `beforeunload`/拦截逻辑（证实缺失） | 渲染层监听 `beforeunload`（Electron 下 dialog 确认或 event.preventDefault）仅当 `dirtyKeys.size + menu.dirty.size > 0` 时拦截；确认文案含改动计数与「建议先保存」 |

#### P1

| # | 需求 | 现状证据 | 要求 |
|---|---|---|---|
| A1-1 | 连接错误分类与重试引导：区分「未找到设备 / 超时 / 授权拒绝 / 已断开」并给出针对性建议 | `useDeviceStore.ts:180,186,200` 统一 set error 字符串；`ConnectBanner.tsx:42-43` 仅展示原文 | 错误结构化（code+message），横幅按类别显示建议 + 显式「重试」按钮 |
| A1-2 | 死代码清理：PanelPlaceholder 已无引用且内容过时（称 T04 未实现，实际 MenuPane 已上线） | `PanelPlaceholder.tsx:21`；全仓 grep 仅自身定义、无 import | 删除该文件及相关测试引用 |
| A1-3 | 断连/重连过程 UI 完整性：DevicePanel、KeyTester、KeymapCanvas 在断连后回到引导态而非残留旧数据 | `KeymapPanel.tsx:38` 以 `state==='connected'` 门控画布（正确）；需逐面板核查断连瞬间残留（如宏/菜单缓存值） | 断连后各面板统一回落引导态；保留脏值以支持重连后继续编辑 |
| A1-4 | 备份导出/导入失败的错误透出统一走 Toast + ErrorState，不带裸 alert/静默 catch | `BackupPanel.tsx` 已用 ConfirmDialog/Toast（基础良好）；核查失败分支覆盖 | 失败分支 100% 有反馈；导入格式错误给出字段级原因 |

#### P2

| # | 需求 | 现状证据 | 要求 |
|---|---|---|---|
| A2-1 | 快捷键体系（保存/撤销/面板切换），标签按平台渲染 ⌘/Ctrl | 全仓 grep 无 keydown/metaKey/ctrlKey（证实无任何快捷键） | Cmd/Ctrl+S=保存、Cmd/Ctrl+Z=撤销、数字键切面板；帮助入口列出全部快捷键 |
| A2-2 | KeyTester 在未连接时的门控与提示一致性 | `KeyTester.tsx`（未核查连接门控，需随 A1-3 一并核查） | 未连接时显示引导而非空白 |

### B 线：UI 现代化 P1（对应 T03-6…T03-10 + 状态范式）

验收基准统一为 `docs/design-tokens.md`；此处列验收钩子。

| # | 内容 | 验收标准 |
|---|---|---|
| B1 (T03-6) | **状态范式原语**：EmptyState / Skeleton / ErrorState 按 §7 规格实现并接入 DefinitionLibrary、MenuPane 加载流、BackupPanel、MacrosPanel | §7.4 四项钩子全过：走 token、双主题对比度达标（正文≥4.5:1）、reduced-motion 无位移动画、键盘可达；Skeleton 替换 `DefinitionLibrary.tsx:79` 裸「加载中…」与 `AppShell.tsx:35-41` PanelFallback |
| B2 (T03-7) | **Tabs**：`@radix-ui/react-tabs` 接入 KeycodeGroupTabs 等分组场景（唯一新依赖） | 键盘方向键可切换；aria 正确；样式走 token；无手搓 tab 逻辑残留 |
| B3 (T03-6) | **Card / Badge**：cva 手写，替换各面板重复的 `rounded-card border bg-surface p-*` 组合 | 无重复类串；variant 覆盖 default/elevated |
| B4 (T03-8) | **Elevation 落地**：Modal/Select 下拉/Tooltip/Toast 按 e2–e4 绑定阴影，模态遮罩用 `--blur-overlay` | 弹层有可见浮起感；`html.light`（theme-light）下阴影同步生效且对比一致 |
| B5 (T03-9) | **Reduced-motion**：`@media (prefers-reduced-motion: reduce)` 全局降级 | 开启后无 translate/scale 动画、无 pulse；功能不降级 |
| B6 (T03-10) | **编排抛光**：Toast 滑入、面板切换转场统一 emphasized easing；列表增删过渡 | 全部时长/缓动引用 motion 令牌（§4），无裸 ms/裸 cubic-bezier |

### C 线：多平台适配（macOS / Windows / Linux；不含移动端）

#### P0

| # | 需求 | 现状证据 | 要求 |
|---|---|---|---|
| C0-1 | **窗口最小尺寸**：防止窄窗口下布局破坏 | `electron/main.cjs:72-81` BrowserWindow 仅 width/height，无 `minWidth/minHeight`（证实缺失）；`AppShell.tsx:74` 右侧键码面板 `w-80 shrink-0`、SideNav 固定宽，窄窗口挤压主画布 | 设 `minWidth: 960, minHeight: 640`（数值待主理人确认，见 §五） |
| C0-2 | **启动白闪消除**：暗色默认主题下窗口创建到首帧之间的白底闪烁 | `main.cjs:72-81` 未设 `backgroundColor`（证实缺失）；应用底色 `--color-bg: #0f1115` | BrowserWindow 设 `backgroundColor: '#0f1115'`（与令牌基值一致，随主题策略注释说明来源） |

#### P1

| # | 需求 | 现状证据 | 要求 |
|---|---|---|---|
| C1-1 | **窄窗口响应式行为**：低于阈值时侧栏自动折叠、键码面板改为覆盖层或互斥展开 | `AppShell.tsx:56,73-77` 折叠仅由用户手动 `sidebarOpen` 控制，无宽度联动 | `window resize` 断点联动（阈值随 C0-1 定）；键码面板与画布不互相挤压 |
| C1-2 | **快捷键平台差异**：accelerator 注册与展示文案区分 macOS（⌘/Option）与 Win/Linux（Ctrl/Alt） | 现无快捷键（见 A2-1），随快捷键体系一并做 | 统一 accelerator 工具（`process.platform` 分支）；帮助文案同源生成，避免两套硬编码 |
| C1-3 | **DPI / 字体渲染**：Windows 高分屏缩放与 Linux 字体渲染核查 | `index.css:68-69` 基准 13px + antialiased；多处 `text-[11px]`/`text-[10px]` 裸小字号（如 `StatusBar.tsx`、`ConnectBanner.tsx:48`） | 小字号收敛到 type scale（caption 12px 起）；Windows 125%/150% 缩放与 Linux 下截图走查无发虚/截断；Electron 缩放因子不被用户误锁 |
| C1-4 | **明暗色跟随核查（三平台）**：原生部分（标题栏/菜单栏/滚动条）与主题一致 | `ThemeProvider.tsx:8-13` 已同步 html class + `colorScheme`；`main.cjs` 未随主题设 titleBarOverlay/背景色 | `colorScheme` 已覆盖滚动条等原生控件；P1 补：主题切换时同步窗口背景色（IPC 或 CSS body 承载即可），标题栏平台差异走查记录 |
| C1-5 | **window-all-closed / activate 行为核查** | `main.cjs:110-114` 已正确区分 darwin（保留）与其他平台（退出） | 维持现状，纳入回归清单 |

#### P2 / 提醒（不展开）

- Linux 分发 target 未配置：`package.json` build 仅 `mac: dmg` + `win: nsis`（`package.json:69-77`）。**提醒**：若本轮承诺 Linux 可用，需补 AppImage/deb target 与 WebHID udev 规则说明；是否纳入请主理人确认。
- 窗口尺寸/位置持久化（`main.cjs` 无保存逻辑）→ 记入积压。
- 安装器差异（nsis/dmg 已配置）仅提醒，不展开。

---

## 四、验收标准（汇总）

1. **A 线**：拔线后 ≤1s 状态栏变为「未连接」且 Toast 提示；带脏值时 Cmd/Ctrl+W 或点关闭弹出确认；放弃后重连无残留旧态；所有失败操作均有可见反馈。
2. **B 线**：design-tokens.md §7.4 四项钩子 + §8 走查清单全过；新依赖仅 `@radix-ui/react-tabs`；产物体积增量 < 5KB gz。
3. **C 线**：三平台各过一轮手动走查（窗口拖至最小尺寸、125%/150% DPI、明暗切换、快捷键提示）；启动无白闪；`window-all-closed` 行为回归通过。
4. **通用**：零硬编码检查（`check` 脚本）通过；584+ 测试全绿；新增逻辑含单测（断连状态机、beforeunload 门控、响应式断点）。

## 五、待确认问题

1. **窗口最小尺寸取值**：建议 `960×640`，是否认可？键码面板窄窗口下「压缩」还是「覆盖层」？（影响 C0-1/C1-1 实现）
2. **beforeunload 拦截形式**：Electron 原生 dialog（更原生）vs 浏览器 beforeunload 弹窗（更简单）？建议前者。
3. **Linux 分发**是否纳入本轮承诺（影响 C 线收尾范围与 udev 文档）？
4. **断连语义**：新增 `'lost'` 连接态（与主动断开区分，便于文案「设备已断开」vs「已断开连接」）还是复用 `'disconnected'`？建议新增，成本低、文案友好。
5. **快捷键集合**首版范围：保存 / 撤销 / 面板切换三项是否足够？（A2-1）
