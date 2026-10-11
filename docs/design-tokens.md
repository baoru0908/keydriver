# KeyDriver 设计令牌规范（Design Tokens Spec）

> **定位**：本文档是 KeyDriver UI 现代化（T03）的**设计令牌与状态范式基准 spec**，作为工程实现与 QA 回归的共同依据。
> **来源**：UI 现代化评估 PRD（许清楚）定稿版；现有令牌以 `src/styles/index.css`（`@theme` + `html.light` 覆盖）为事实基准。
> **范围**：本文为纯规范（token 定义 / 主题策略 / 动效曲线 / 状态范式），**不含实现代码**。实现细节由 T03-1…T03-10 落地。
> **约定**：所有令牌以 CSS 自定义属性（`--*`，Tailwind v4 CSS-first）表达；`.theme-light` 为亮色覆盖类，暗色为 `@theme` 基值。

---

## 0. 现有令牌基准（@theme 事实状态，供参照）

下列为当前已实现并生效的令牌，**新增令牌在第 1–4 节**，请勿重复定义已有项、仅做扩展。

| 分类 | 令牌 | 暗色（基值） |
|---|---|---|
| 背景 | `--color-bg` | `#0f1115` |
| 背景 | `--color-surface` | `#161a21` |
| 背景 | `--color-panel` | `#1a1d24` |
| 背景 | `--color-elevated` | `#21262f` |
| 边框 | `--color-border` | `#2a313d` |
| 边框 | `--color-border-strong` | `#3a4353` |
| 前景 | `--color-fg` | `#e6e8ee` |
| 前景 | `--color-fg-muted` | `#98a2b3` |
| 前景 | `--color-fg-dim` | `#6b7484` |
| 强调 | `--color-accent` | `#4dd4c0` |
| 强调 | `--color-accent-strong` | `#35b8a5` |
| 强调 | `--color-accent-soft` | `#16342f` |
| 危险 | `--color-danger` | `#ff6b6b` |
| 危险 | `--color-danger-soft` | `#3a1f22` |
| 警告 | `--color-warn` | `#ffb86b` |
| 警告 | `--color-warn-soft` | `#3a2c1a` |
| 键帽 | `--color-key-base` | `#2a303b` |
| 键帽 | `--color-key-mod` | `#333b48` |
| 键帽 | `--color-key-accent` | `#3d4757` |
| 键帽 | `--color-key-special` | `#232833` |
| 圆角 | `--radius-card` | `8px` |
| 圆角 | `--radius-key` | `5px` |

**亮色覆盖（`html.light`）现状**：`bg/surface/panel/elevated/border/border-strong/fg/fg-muted/fg-dim/accent/accent-strong/accent-soft/danger-soft/warn-soft/key-*` 已覆盖；**缺口**：`--color-danger`、`--color-warn` 在亮色下未覆盖（仍继承暗色值，浅底上偏艳），见 §5 覆盖要求。

---

## 1. 间距标尺（Spacing Scale）

统一替换现有 182 处裸数值间距（`p-2` / `gap-3` 等），消除节奏不一。

| 步档 | 令牌 | 取值 | 典型用途 |
|---|---|---|---|
| 1 | `--spacing-1` | `4px` | 紧邻元素内间距、图标与文字间隙 |
| 2 | `--spacing-2` | `8px` | 相关控件间距、紧凑列表行内间隙 |
| 3 | `--spacing-3` | `12px` | 组件内 padding（默认）、标签与输入间距 |
| 4 | `--spacing-4` | `16px` | 面板内 padding、控件组间距 |
| 5 | `--spacing-5` | `20px` | 区块 padding、分组标题与内容间距 |
| 6 | `--spacing-6` | `24px` | 面板/卡片外间距、主区块分隔 |
| 7 | `--spacing-7` | `32px` | 大区块分隔、对话框内边距 |
| 8 | `--spacing-8` | `40px` | 页面级留白、空状态上下留白 |

**规则**：禁止裸数值间距；所有 `padding/margin/gap` 必须引用 `--spacing-*`（或 Tailwind 对应步档工具类）。回归见 T03 lint 规则（禁用裸 px 间距）。

---

## 2. 字号阶梯（Type Scale）

替代零散 `text-sm` / `text-[12px]`，建立语义化层级。基准字号保持 `13px`。

| 角色 | 令牌（语义） | 字号 | 字重 | 行高 | 用途 | 默认色 |
|---|---|---|---|---|---|---|
| Display | `--text-display` | `20px` | `600` | `1.3` | 页面/面板主标题 | `fg` |
| Title | `--text-title` | `15px` | `600` | `1.4` | 分组标题、导航组、弹窗标题 | `fg` |
| Body | `--text-body` | `13px` | `400` | `1.5` | 正文（默认） | `fg` |
| Caption | `--text-caption` | `12px` | `400` | `1.4` | 辅助文字、标签、元信息 | `fg-muted` |

**规则**：标题与正文至少一级字号 + 字重差；辅助文字统一用 Caption + `fg-muted`/`fg-dim`；禁止再出现 `text-[12px]` 等裸数值字号。

---

## 3. 深度与材质（Elevation）

现有阴影仅用于键帽（`keycap-base`）。新增 elevation 令牌，让浮层（弹窗/下拉/Toast）靠「深度」区分，而非平铺色块。

### 3.1 暗色（基值）

| 令牌 | 取值 | 用途 |
|---|---|---|
| `--shadow-e1` | `0 1px 2px rgb(0 0 0 / 0.30)` | 面板内轻微分隔、内嵌层 |
| `--shadow-e2` | `0 2px 8px rgb(0 0 0 / 0.35)` | 卡片 / 抬升块 |
| `--shadow-e3` | `0 8px 24px rgb(0 0 0 / 0.40)` | 下拉 / 弹出层（Select、Tooltip、菜单） |
| `--shadow-e4` | `0 16px 48px rgb(0 0 0 / 0.45)` | 模态框 / 对话框 |
| `--ring-focus` | `0 0 0 2px var(--color-accent)` | 焦点环（配合 `:focus-visible`） |
| `--blur-overlay` | `8px` | 模态遮罩 backdrop-filter 模糊值 |

### 3.2 亮色覆盖（`.theme-light`）

| 令牌 | 取值 |
|---|---|
| `--shadow-e1` | `0 1px 2px rgb(16 24 40 / 0.06)` |
| `--shadow-e2` | `0 2px 8px rgb(16 24 40 / 0.08)` |
| `--shadow-e3` | `0 8px 24px rgb(16 24 40 / 0.10)` |
| `--shadow-e4` | `0 16px 48px rgb(16 24 40 / 0.12)` |
| `--ring-focus` | `0 0 0 2px var(--color-accent)`（亮色 accent 已调整） |
| `--blur-overlay` | `8px` |

**规则**：浮层必须显式绑定 e 级阴影（不可仅靠 background 差异）；模态遮罩使用 `bg-bg/60 + backdrop-filter: blur(var(--blur-overlay))`。

---

## 4. 动效（Motion）

零 JS 增量方案（CSS transition + Tailwind 动画 + View Transitions API）。新增 motion 令牌，统一时长与缓动，避免各写各的。

| 令牌 | 取值 | 说明 |
|---|---|---|
| `--duration-fast` | `120ms` | 微反馈（按压、开关、hover） |
| `--duration-base` | `200ms` | 通用过渡（入场、淡入） |
| `--duration-slow` | `320ms` | 位移/布局过渡（面板切换、下拉） |
| `--ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | 标准减速 |
| `--ease-emphasized` | `cubic-bezier(0.2, 0, 0, 1)` | 强调减速（入场/弹出更有层次） |
| `--motion-reduce` | 开关标志 | 见 §4.4；`prefers-reduced-motion: reduce` 时所有过渡时长归零、禁用位移 |

### 4.1 动效曲线表（关键帧）

| 曲线 | 关键帧（语义） | 时长 | 缓动 | 应用位置 |
|---|---|---|---|---|
| **fade** | `opacity: 0 → 1` | `--duration-base` | `--ease-standard` | 模态入场、Toast 出现、内容淡入 |
| **slide** | `translateY(8px) → 0` + `opacity 0 → 1`（面板也可 `translateX`） | `--duration-slow` | `--ease-emphasized` | 面板/路由切换（View Transitions 封装）、下拉、Toast 滑入 |
| **scale** | `scale(0.96) → 1` + `opacity 0 → 1`；按压反向 `1 → 0.98` | `--duration-fast`/`--duration-base` | `--ease-emphasized` | 模态弹出、按钮 `:active` 反馈 |

### 4.2 View Transitions

面板 / 路由切换经统一 `useViewTransition` hook 调用 `document.startViewTransition`，使用 **slide + fade** 交叉过渡，避免组件内散落原生 API。

### 4.3 应用映射（供实现引用）

- 导航 / 面板切换 → `slide` + `fade`（slow / emphasized）
- 按钮 hover/press → `scale` 反向（fast）
- Switch 旋钮 → 已有 `transition-transform`（保留，归入 fast/standard）
- 模态 / 对话框 → `scale` + `fade`（base / emphasized）
- Toast → `slide`（slow/emphasized）+ `fade`
- 下拉 / 弹出 → `slide` 小幅 + `fade`（base）

### 4.4 Reduced Motion

`@media (prefers-reduced-motion: reduce)` 下：所有过渡时长置 `0ms`、禁用 `translate/scale` 位移，仅保留必要 `opacity` 即时切换；`--motion-reduce` 作为集中开关由 `@layer utilities` 统一处理。

---

## 5. 语义状态色（Semantic Colors）

补齐 success / info 及其 soft 档（danger / warn 已存在，见 §0）。

| 令牌 | 暗色（基值） | 亮色覆盖（`.theme-light`） | 用途 |
|---|---|---|---|
| `--color-success` | `#34d399` | `#159c74` | 成功态图标/文本 |
| `--color-success-soft` | `#14342b` | `#e3f8ef` | 成功态背景徽标 |
| `--color-info` | `#60a5fa` | `#2f7fd6` | 信息态图标/文本 |
| `--color-info-soft` | `#16263b` | `#e9f2fd` | 信息态背景徽标 |

**覆盖缺口补齐（必做）**：在 `.theme-light` 下补充覆盖 `--color-danger`、`--color-warn`（当前继承暗色值，浅底偏艳），建议亮色取值 `--color-danger: #d64545`、`--color-warn: #c97e2e`，以保证双主题对比度一致。

---

## 6. 主题策略（Theme Strategy）

| 项 | 决策 |
|---|---|
| **默认主题** | 深色（Dark）——契合键盘/RGB 工具调性，与 `@theme` 暗色基值一致，即当前无 class 时的表现 |
| **切换方式** | class 策略：`.theme-dark` / `.theme-light` 显式双 class，由 **TopBar 主题开关**控制 |
| **持久化** | 选择写入 `localStorage`（如 `keydriver:theme`），启动时读取 |
| **跟随系统** | **仅首次启动**跟随 `prefers-color-scheme`；一旦用户手动选择即锁定，不再随系统跳变 |
| **令牌组织** | 暗色作 `@theme` 基值；亮色值放 `.theme-light` 覆盖；`prefers-color-scheme` 仅作「未显式选择时的回退」 |
| **一致性** | elevation（§3.2）、语义色（§5）均在该 theme class 下覆盖，保证双主题层次与对比一致 |
| **清理项** | 移除半成品 `@custom-variant dark`（当前未对称使用），统一为 `.theme-dark`/`.theme-light` 双 class |

---

## 7. 状态范式（State Patterns，P1 原语）

`EmptyState` / `Skeleton` / `ErrorState` 为 P1 统一原语，替代当前分散的局部 `loading` / 纯文字「加载中…」。供工程实现与 QA 验证。

### 7.1 EmptyState（空状态）

- **布局**：容器居中；lucide 图标（`fg-dim`，`40px`）→ 标题（`--text-title`，`fg`）→ 描述（`--text-caption`，`fg-muted`，`max-width: 280px`，居中）→ 可选主操作按钮（primary）。
- **占位**：最小高度撑满父容器（避免「塌陷」），垂直留白用 `--spacing-8`。
- **触发**：集合 / 列表项数为 0（如 `DefinitionLibrary` 空库、宏列表为空）。
- **a11y**：容器 `role="status"`；图标 `aria-hidden`。

### 7.2 Skeleton（骨架屏）

- **形态**：用 `animate-pulse`（或 shimmer 渐变）占位块，圆角 `--radius-card`，底色 `elevated`。
- **变体**：`text`（单行高度 = caption 行高）、`block`（矩形区域）、`circle`（头像/图标位）。
- **触发**：异步加载期（替换裸「加载中…」文字），如 `MenuStatus === 'loading'`、定义加载。
- **a11y / 降级**：容器 `aria-busy="true"`；`prefers-reduced-motion` 下静态（无 pulse/shimmer）。

### 7.3 ErrorState（错误状态）

- **布局**：lucide `AlertTriangle`（`--color-danger`，`40px`）→ 标题（`--text-title`，`fg`）→ 描述（`--text-caption`，`fg-muted`）→ 重试按钮（secondary）+ 可选详情（`--text-caption`，`fg-dim`，等宽字体展示错误码/原因）。
- **触发**：加载 / 操作失败（`MenuStatus === 'error'`、HID 通信失败等）。
- **a11y**：容器 `role="alert"` + `aria-live="assertive"`；重试按钮聚焦可见。

### 7.4 QA 回归钩子（通用）

- 三态均须走对应 token（颜色/间距/字号），不得裸数值；
- 暗 / 亮双主题下对比度达标（正文 ≥ 4.5:1，辅助 ≥ 3:1）；
- 开启 `prefers-reduced-motion` 后无位移动画、无持续 pulse；
- 键盘可达：可聚焦元素有 `--ring-focus` 焦点环，操作按钮可 Tab 抵达并触发。

---

## 8. 回归与变更纪律

- 新增视觉属性**必须先加令牌**，禁止组件内硬编码颜色/间距/阴影/时长。
- spacing 收敛（§1）须配 lint 规则（禁用裸 px 间距）+ 分批提交 + 键帽 / 导航布局人工核对（防回归，见 T03 风险项）。
- 任何令牌变更需同步更新本文件，并通知 QA 更新走查清单（层级 / 间距 / 动效 / 状态 / 双主题对比度）。
