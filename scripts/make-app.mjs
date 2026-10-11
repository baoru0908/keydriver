#!/usr/bin/env node
// 把 Electron 二进制 + Web 构建产物组装成可双击运行的 macOS .app。
//
// 为什么手工组装而不是 electron-builder：
//   electron-builder 需要从 GitHub 下载自己的工具链（app-builder / dmg 工具等），
//   在 GitHub 不可达的环境里必然失败。这里直接复用 node_modules/electron/dist/Electron.app
//   ——它本身就是一个完整的 Electron 宿主应用——只需把我们的应用资源注入
//   Contents/Resources 即可，全程零额外下载。
//
// 产物布局（与 electron/main.cjs 的生产加载路径严格对应）：
//   KeyDriver.app/Contents/Resources/app/main.cjs   ← 主进程
//   KeyDriver.app/Contents/Resources/dist/index.html ← 渲染进程（main.cjs 用 '../dist' 取）
//   main.cjs 中 __dirname = .../Resources/app，故 '../dist' = .../Resources/dist ✓
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const ELECTRON_APP = path.join(ROOT, 'node_modules/electron/dist/Electron.app');
const OUT_DIR = path.join(ROOT, 'release');
const OUT_APP = path.join(OUT_DIR, 'KeyDriver.app');
const PLIST = path.join(OUT_APP, 'Contents/Info.plist');

const APP_ID = 'com.keydriver.app';
const APP_NAME = 'KeyDriver';

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function main() {
  // 1. 前置检查
  if (!(await exists(ELECTRON_APP))) {
    fail(
      '未找到 Electron 二进制：node_modules/electron/dist/Electron.app\n' +
        '  请先安装：ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/ npm install electron\n' +
        '  若二进制下载失败，可手动下载 zip 后解压到 node_modules/electron/dist/，' +
        '并写入 path.txt = "Electron.app/Contents/MacOS/Electron"',
    );
  }
  const distIndex = path.join(ROOT, 'dist/index.html');
  if (!(await exists(distIndex))) {
    fail('未找到构建产物 dist/index.html，请先运行 npm run build');
  }

  // 2. 清旧产物并复制 Electron 宿主
  //
  // ⚠️ 必须带 -X（不复制扩展属性）：npm 重新下载 Electron 后，bundle 内文件会带上
  // com.apple.provenance 扩展属性，该属性是系统保护的（xattr -cr 删不掉），
  // 普通 cp -R 尝试读取它时会被拒绝，报
  //   "cp: .../Resources/default_app.asar: Operation not permitted"
  // 从而让整个打包失败。-X 让 cp 跳过扩展属性即可绕开。
  await rm(OUT_APP, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  try {
    execFileSync('cp', ['-RX', ELECTRON_APP, OUT_APP]);
  } catch (e) {
    // 兜底：极少数环境（非 macOS 的 cp）仍可能失败，退化为逐目录 rsync 语义的 ditto
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`⚠️ cp -RX 失败（${msg.split('\n')[0]}），改用 ditto --noextattr 重试`);
    execFileSync('ditto', ['--noextattr', ELECTRON_APP, OUT_APP]);
  }
  console.log('✓ 已复制 Electron 宿主');

  // 3. 注入应用资源
  const resApp = path.join(OUT_APP, 'Contents/Resources/app');
  await mkdir(resApp, { recursive: true });

  const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  await writeFile(
    path.join(resApp, 'package.json'),
    JSON.stringify(
      { name: 'keydriver', productName: APP_NAME, version: pkg.version ?? '0.1.0', main: 'main.cjs' },
      null,
      2,
    ),
  );
  execFileSync('cp', [path.join(ROOT, 'electron/main.cjs'), path.join(resApp, 'main.cjs')]);
  // T06-3：preload.cjs 是唯一 IPC bridge，必须随主进程一并注入（main.cjs 以 __dirname 定位它）
  execFileSync('cp', [path.join(ROOT, 'electron/preload.cjs'), path.join(resApp, 'preload.cjs')]);

  // dist 放 Resources/dist（与 main.cjs 的 '../dist' 对应）
  await rm(path.join(OUT_APP, 'Contents/Resources/dist'), { recursive: true, force: true });
  execFileSync('cp', ['-R', path.join(ROOT, 'dist'), path.join(OUT_APP, 'Contents/Resources/dist')]);
  console.log('✓ 已注入主进程与构建产物');

  // 4. 改写应用身份信息
  for (const [key, value] of [
    ['CFBundleDisplayName', APP_NAME],
    ['CFBundleName', APP_NAME],
    ['CFBundleIdentifier', APP_ID],
    ['CFBundleShortVersionString', String(pkg.version ?? '0.1.0')],
  ]) {
    execFileSync('plutil', ['-replace', key, '-string', value, PLIST]);
  }
  console.log('✓ 已设置应用名称与标识');

  // 5. 重新签名（ad-hoc）：我们改写了 Info.plist 并向 bundle 内塞入了自己的资源，
  //    这会**破坏 Electron.app 原有的代码签名**。Electron 启动时会校验自身签名
  //    （shell/common/mac/codesign_util.cc），签名失效会导致进程直接退出、窗口不出现。
  //    因此必须用「-」做一次 ad-hoc 重签——这是手工打包 Electron 的必要步骤。
  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', OUT_APP]);
    console.log('✓ 已重新签名（ad-hoc，修复「改包后启动即退出」）');
  } catch (e) {
    console.log(`· 重新签名失败（codesign 不可用或受限）：${e instanceof Error ? e.message : String(e)}`);
  }

  // 6. 去掉隔离属性：否则 Gatekeeper 会把从网络下载的应用拦为「已损坏」
  try {
    execFileSync('xattr', ['-cr', OUT_APP]);
    console.log('✓ 已清除隔离属性（避免「应用已损坏」）');
  } catch {
    console.log('· 跳过清除隔离属性（xattr 不可用，不影响打包结果）');
  }

  // 7. 附带定义文件，方便用户首次导入
  const defSrc = path.join(ROOT, 'definitions');
  if (await exists(defSrc)) {
    await rm(path.join(OUT_DIR, 'definitions'), { recursive: true, force: true });
    execFileSync('cp', ['-R', defSrc, path.join(OUT_DIR, 'definitions')]);
    console.log('✓ 已附带 definitions/（首次启动可拖拽导入）');
  }

  const size = execFileSync('du', ['-sh', OUT_APP]).toString().trim().split('\t')[0];
  console.log(`\n✓ 封装完成：${OUT_APP}（${size}）`);
  console.log('  双击即可运行；首次启动需导入一份键盘定义文件（release/definitions/ 里已备好）。');
}

main().catch((e) => {
  console.error('✗ 封装失败：', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
