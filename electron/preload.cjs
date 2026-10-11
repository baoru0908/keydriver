// KeyDriver 唯一 IPC bridge（T06-3/T06-10）。
// 通过 contextBridge 暴露 `window.keydriver`，通道一律 `keydriver:` 前缀。
// 渲染进程侧的类型与守卫见 src/shared/bridge.ts（browser 环境下该对象不存在，必须判空）。
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('keydriver', {
  /** 推送未保存改动数（关窗拦截门控依据）。单向 send，无返回值。 */
  setDirtyCount: (count) => ipcRenderer.send('keydriver:setDirtyCount', count),
  /** 主题切换时同步窗口底色（#rrggbb；主进程会校验合法性）。 */
  setBackgroundColor: (color) => ipcRenderer.send('keydriver:setBackgroundColor', color),
});
