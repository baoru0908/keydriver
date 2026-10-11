# KeyDriver 桌面外壳：Electron 方案说明

本文档说明如何把现有 React + Vite Web 应用（读取 VIA 定义文件、通过 WebHID 与设备通信）包装成可双击打开的桌面程序（macOS `.app` / `.dmg`，以后 Windows `.exe` / NSIS）。

**核心原则：Electron 只是外壳层，复用以有的全部 Web 代码、VIA 协议层、定义解析、设备门面与菜单引擎，零重写业务逻辑。**

---

## 一、为什么选 Electron

| 维度 | Electron | Tauri |
| --- | --- | --- |
| 内嵌内核 | 内置 Chromium | macOS 用系统 WebKit |
| WebHID 支持 | ✅ 默认可用（加 `enable-features=WebHID` 即开） | ❌ WebKit 在 macOS 不支持 WebHID |
| 前端改造 | 零改造（直接承载 `dist/`） | 需重写/替换通信层 |
| 原生窗口 | ✅ 真正的原生窗口（Mac/Win） | ✅ 但内核受限 |

- **WebHID 是硬约束**：本应用依赖 WebHID 与设备通信。Tauri 在 macOS 上基于 WebKit，不支持 WebHID，因此无法直接复用现有通信层。Electron 内嵌 Chromium，WebHID 经开关即可启用，前端代码零改造。
- **跨平台真原生窗口**：macOS（现在优先）与 Windows（以后）都能产出真原生应用，窗口、菜单、系统集成一致。
- **前端零重写**：现有 `src/` 的 UI、VIA 协议层（`ViaProtocol` / `HidTransport` / `DeviceFacade`）、定义解析、菜单引擎全部原样复用，桌面层只新建 `electron/` 目录 + 构建配置 + 本文档。

---

## 二、目录与文件结构（增量）

```
keydriver/
├── package.json          # 新增 main / scripts / optionalDependencies / devDependencies / build
├── vite.config.ts        # 新增 base: './'，使打包产物用相对路径
├── electron/
│   └── main.cjs          # Electron 主进程（CommonJS 外壳窗口逻辑）
├── dist/                 # vite build 产物（由 Electron 加载）
└── docs/
    └── ELECTRON.md       # 本文件
```

`electron/` 不在 `tsconfig.json` 的 `include`（仅 `["src","scripts"]`）中，因此 **Electron 外壳不参与 `tsc --noEmit` 与现有 `npm run check`**，不会破坏现有校验链路。

---

## 三、开发运行

### 一键便捷验证（推荐）

```bash
npm run dev:app
```

一条命令同时拉起 Vite 开发服务器与 Electron 桌面窗口：`scripts/dev-app.mjs` 先起 Vite（默认 `http://localhost:5173`），待端口就绪后自动拉起 Electron 加载 localhost。**前提：需先 `npm i` 装好 electron**（`dev-app.mjs` 仅用 Node 内置 `node:child_process` + `node:http`，零新增依赖）。窗口内走 Vite HMR，修改 `src/` 后实时刷新，便于快速验证程序。

> 沙箱环境因 GitHub 被墙装不上 electron，请在用户真机（macOS 有网）先 `npm install` 再运行。

### 两步法（备选）

1. 起 Vite 开发服务器（终端 A）：
   ```bash
   npm run dev
   ```
   默认监听 `http://localhost:5173`。

2. 另开终端（终端 B）启动桌面窗口，加载 localhost：
   ```bash
   npm run electron:dev -- --dev
   ```
   `--dev` 参数让 Electron 加载 `http://localhost:5173` 而非本地 `dist/`。

> 热更新：修改 `src/` 后 Vite HMR 自动刷新，Electron 窗口同步更新。

### UX 体验基准（重要）

- **体验标杆 = Wootility（Wooting 官方驱动）**：本项目的 UI / 交互体验以 Wootility 为对标对象——清晰的设备状态呈现、可视化改键、固件与配置管理的一体化体验。
- **不参考 usevia.app**：用户刻意避开 usevia，其重做思路不纳入本项目的体验参考。
- **Realforce / HHKB 仅作功能 / 能力分类参考**：用于界定"要支持哪些键盘能力 / 功能分类"，不作为 UI 风格或交互细节的参照。

---

## 四、打包发布

两种方式，按网络条件选择。

### 方式 A：手工组装（推荐；GitHub 不可达时唯一可行）

```bash
npm run app     # = npm run build && node scripts/make-app.mjs
```

产出 `release/KeyDriver.app`（双击即可运行）+ `release/definitions/`（首次启动要用的键盘定义文件）。

原理：直接复用 `node_modules/electron/dist/Electron.app` 这个现成的 Electron 宿主，
把我们的主进程与构建产物注入 `Contents/Resources`：

```
KeyDriver.app/Contents/Resources/app/main.cjs     ← electron/main.cjs
KeyDriver.app/Contents/Resources/app/package.json ← { name, version, main: 'main.cjs' }
KeyDriver.app/Contents/Resources/dist/index.html  ← vite build 产物
```

> 路径对应关系（改布局时必须同步改 main.cjs）：
> `main.cjs` 生产模式加载 `path.join(__dirname, '../dist/index.html')`，
> 其 `__dirname` 为 `.../Resources/app`，故 `../dist` 即 `.../Resources/dist`。

为何不用 electron-builder：它需要从 GitHub 下载自己的工具链，网络受限时必然失败；方式 A 全程零额外下载。

### 方式 B：electron-builder（网络通畅时用，可出 dmg）

```bash
npm install          # 安装 electron + electron-builder
npm run dist         # Mac 出 dmg，Win 出 nsis
```

- macOS：`release/KeyDriver-*.dmg`（`public.app-category.utilities`）。
- Windows（以后启用）：`release/KeyDriver-${version}-setup.exe`（NSIS）。
- 产物经 `asar` 打包；`files` 仅包含 `dist/**/*` 与 `electron/**/*`。

仅生成未压缩目录（调试用）：`npm run pack`。

---

## 五、electron 二进制安装（GitHub 不可达时的解法）

electron 的 postinstall 默认从 GitHub 拉二进制，被墙时会失败——表现为
`node_modules/electron/dist/` 不存在、`path.txt` 缺失。解法是指定国内镜像：

```bash
ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/ npm install electron
```

若 postinstall 仍失败，可手动下载后解压（以 arm64 + v37.10.3 为例）：

```bash
curl -L -o /tmp/electron.zip \
  https://registry.npmmirror.com/-/binary/electron/v37.10.3/electron-v37.10.3-darwin-arm64.zip
mkdir -p node_modules/electron/dist
unzip -q -o /tmp/electron.zip -d node_modules/electron/dist
printf 'Electron.app/Contents/MacOS/Electron' > node_modules/electron/path.txt
xattr -cr node_modules/electron/dist/Electron.app   # 去隔离属性，避免「应用已损坏」
```

验证：`node_modules/electron/dist/Electron.app/Contents/MacOS/Electron --version`

---

## 六、已验证事项与已知限制

已验证（本机沙箱，2026-10-10）：

- `npm run check` / `npm run build` 均通过；`base: './'` 已生效（`dist/index.html` 用相对路径引用资源）。
- `release/KeyDriver.app` 结构正确：`Resources/app/main.cjs`、`Resources/dist/index.html` 就位，
  `CFBundleName=KeyDriver`、`CFBundleIdentifier=com.keydriver.app`。
- Electron 二进制可执行（`dist/version` = 37.10.3）。

已知限制：

- **沙箱内无法验证 GUI 窗口**：本环境没有图形窗口会话且 `ps` 被禁用，只能验证「产物结构正确 + 二进制可执行」。
  双击后窗口是否正常，需在你本机确认。
- **首次启动需导入一份定义文件**：程序不在运行时从 `definitions/` 加载（定义文件由用户导入并存入 IndexedDB，
  之后自动恢复）。`release/definitions/` 已随包附带，拖入窗口或用它导入即可。
- **未做代码签名**：首次打开可能需在「系统设置 → 隐私与安全性」允许，或右键选择「打开」。

---

## 七、与现有 Web 模式的关系

- Electron 仅替换“外壳”，`src/` 业务逻辑与 UI **完全复用**，无重复代码、无业务分支。
- 原有的 `npm run dev`（浏览器 `localhost`）**仍作为纯开发/预览模式保留**，可与 Electron 开发模式并行使用。
- 部署形态由“运行时入口”决定：浏览器走 Vite dev/preview；桌面走 Electron 加载 `dist/`。两者共享同一份 Web 构建产物。
