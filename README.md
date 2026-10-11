# KeyDriver

键盘配置工具（Electron + Vite + React 19 + TypeScript + Tailwind v4），VIA V3 协议 / WebHID。

- **键位编辑**：多层键映射，按 VID/PID 自动匹配本地定义库
- **灯光与菜单**：QMK 标准语义（brightness / effect / effect_speed / **color = [hue, sat] 两字节**，与 VIA 官方一致）
- **读优先**：连接后读取设备当前配置呈现，**零写入**；改动后空闲 1.5s 自动落盘 EEPROM
- **热插拔**：未连接时 2s 轮询设备列表，插入即出现；记忆设备自动重连（强制 VIA usage 匹配）
- **断连感知**：拔出即进入 lost 态并保留脏值，重连后可继续编辑
- **宏 / 布局选项 / 备份导出导入 / EEPROM 复位 / 撤销**
- 关窗前脏值拦截提示，避免未保存即退出

> 轻量分发变体见 [keydriver-lite](https://github.com/baoru0908/keydriver-lite)：
> Tauri v2 + 原生 hidapi 桥，**3.5 MB**、免浏览器授权、支持热插拔自动重连。

## 开发

```bash
npm install
npm run dev            # Vite（http://localhost:5173）
npm run check          # 硬编码守卫 + 定义统计校验 + tsc
npx vitest run --maxWorkers=1 --minWorkers=1   # 串行测试（必须串行）
npm run build          # tsc --noEmit + vite build
npm run app            # 构建 + 打包出 release/KeyDriver.app
```

浏览器要求：WebHID 需 Chromium 内核（Chrome / Edge），且必须由用户手势触发授权（点「授权键盘…」）。

## 结构

```
src/core/hid/       传输层（WebHidTransport / Dummy 模拟固件）
src/core/protocol/  VIA V3 协议编解码、值宽度推断
src/definition/     定义文件解析、菜单扁平化、本地定义库
src/store/          zustand 状态（设备 / 键位 / 菜单 / 调试）
src/ui/             界面（布局 / 菜单控件 / 键位 / 调试面板）
docs/               架构、PRD、协议调研、体积评估、交接文档
```

## 文档

- `docs/ARCHITECTURE.md`：分层与关键决策
- `docs/HANDOVER.md`：交接与当前进度
- `docs/SIZE-REDUCTION-EVAL.md`：体积评估（阶段 A 裁剪 / 阶段 B Tauri）
- `docs/research-via-protocol.md`：VIA 协议调研

## 已知限制

- WebHID 需要授权且仅限 Chromium 系浏览器；不支持 Safari / Firefox。
- 打包体积较大（Electron 运行时 ~288M，裁剪版 ~223M）；追求小体积请用 Lite。
- 拖放导入定义在部分浏览器受限，可用文件选择对话框兜底。
