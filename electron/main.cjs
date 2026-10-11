// KeyDriver 桌面外壳主进程（Electron / CommonJS）。
// 职责：仅作为原生窗口外壳，承载现有 Web 构建产物（dist/）。
// 不实现任何业务/协议逻辑，不引用任何具体设备特征词。
'use strict';

const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');

// ⚠️ 关键：Chromium 自带一份 HID 屏蔽名单（默认会拦掉某些 HID 设备，**其中包含不少键盘**，
// 目的是防键盘记录）。被拦的设备在 navigator.hid.requestDevice() 里**根本不会出现**，
// 表现就是「官方 VIA 能识别、我们的应用读不到设备」。Electron 官方文档给出的解法就是关掉它。
app.commandLine.appendSwitch('disable-hid-blocklist');

let mainWindow = null;

/**
 * WebHID 授权钩子（关键，缺一不可）。
 *
 * ⚠️ 浏览器（Chrome）里 navigator.hid.requestDevice() 由浏览器自己弹选择器，
 * 但 **Electron 不会**——必须由主进程接管，否则点了「授权设备」也是静默无反应。
 * 三个钩子缺一不可（钩子挂在窗口自己的 session 上，官方推荐写法）：
 *   1. select-hid-device         —— requestDevice() 被调用时，由主进程决定选哪个设备
 *   2. setPermissionCheckHandler —— 允许 'hid' 权限查询
 *   3. setDevicePermissionHandler —— 给渲染进程授予该 HID 设备的访问权
 */
function setupWebHidPermissions(ses) {
  // 1. 设备选择：单个直接选；多个弹原生对话框让用户挑（避免误选鼠标等其他 HID）
  ses.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    const list = (details && details.deviceList) || [];
    // 排查用日志：从终端运行（npm run dev:app）时可见；打包应用可在「控制台.app」里看
    console.log(`[KeyDriver] select-hid-device 触发，候选设备 ${list.length} 台`);
    for (const d of list) {
      console.log(`  · ${d.name || '未命名'} VID=${d.vendorId} PID=${d.productId}`);
    }
    if (list.length === 0) {
      callback(undefined);
      return;
    }
    if (list.length === 1) {
      callback(list[0].deviceId);
      return;
    }
    dialog
      .showMessageBox(mainWindow, {
        type: 'question',
        message: '选择要连接的 HID 设备',
        detail: list
          .map((d, i) => `${i + 1}. ${d.name || '未命名设备'}  [VID ${d.vendorId} / PID ${d.productId}]`)
          .join('\n'),
        buttons: list.map((d) => d.name || '未命名设备'),
        cancelId: -1,
      })
      .then(({ response }) => {
        callback(response >= 0 && response < list.length ? list[response].deviceId : undefined);
      })
      .catch(() => callback(undefined));
  });

  // 2. 权限查询：允许 hid（file:// 生产模式与 http://localhost 开发模式都放行）
  ses.setPermissionCheckHandler((_webContents, permission) => permission === 'hid');

  // 3. 设备授权：授予 HID 设备访问权（作用域是用户选中的那台）
  ses.setDevicePermissionHandler((details) => details.deviceType === 'hid');
}

/**
 * 创建并配置原生应用窗口。
 * 开发模式加载 localhost（Vite dev server）；生产模式加载打包后的本地 HTML。
 */
function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'KeyDriver',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow = win;

  // 钩子必须挂在**这个窗口**的 session 上（官方推荐；默认 partition 下即 defaultSession）
  setupWebHidPermissions(win.webContents.session);

  const isDev = process.argv.includes('--dev');
  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
}

// 标准应用生命周期。
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
