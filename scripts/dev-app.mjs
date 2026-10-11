// 一键启动桌面程序开发模式：先起 Vite 开发服务器，就绪后拉起 Electron 加载 localhost。
// 用法（需先 npm i 装好 electron）：npm run dev:app
// 在 Electron 窗口内通过 Vite HMR 实时预览代码改动。
import { spawn } from 'node:child_process';
import http from 'node:http';
import process from 'node:process';

const PORT = 5173;
const vite = spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true });

let electron = null;
const tryConnect = () => {
  const req = http.get({ host: 'localhost', port: PORT, path: '/' }, (res) => {
    res.resume();
    electron = spawn('npx', ['electron', '.', '--dev'], { stdio: 'inherit', shell: true });
    electron.on('exit', () => shutdown());
  });
  req.on('error', () => setTimeout(tryConnect, 500));
};
tryConnect();

function shutdown() {
  try { vite.kill('SIGTERM'); } catch {}
  try { if (electron) electron.kill('SIGTERM'); } catch {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
