#!/usr/bin/env node
// electron-builder afterSign 钩子（T01 分发合规）。
//
// 触发：electron-builder 完成 macOS 代码签名后调用（仅 darwin 平台进入本逻辑）。
// 职责：在「凭据齐备」时执行公证(notarization)；否则打印清晰提示并安全跳过，不报错中断。
//
// ── 环境门控 ───────────────────────────────────────────────────────────────
// 1) 正式签名：electron-builder 读取 CSC_LINK + CSC_KEY_PASSWORD（Developer ID 证书）
//    自动完成，本脚本不负责签名，只负责其后的公证。
// 2) 公证：需要 APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID 三者齐备。
//
// ── 真实分发所需完整凭据 ──────────────────────────────────────────────────
//   A. Apple Developer ID Application 证书（导出为 .p12）
//        → CSC_LINK      = p12 文件路径或 base64 内容
//        → CSC_KEY_PASSWORD = p12 口令
//   B. 公证专用：App Store Connect 专用密码
//        → APPLE_ID                    = 开发者账号邮箱
//        → APPLE_APP_SPECIFIC_PASSWORD = app-specific password
//        → APPLE_TEAM_ID               = 10 位团队 ID
//   缺少任一即视为「本机无正式签名/公证能力」，回退 ad-hoc/未签名，构建不中断。
import { execFileSync } from 'node:child_process';

const APP_NAME = 'KeyDriver';

/**
 * electron-builder afterSign 入口。签名后由打包器以默认导出方式调用。
 * @param {{ appOutDir?: string, electronPlatformName?: string }} context
 */
export default async function afterSign(context) {
  const { appOutDir, electronPlatformName } = context ?? {};
  // 仅 macOS 产物需要公证；其它平台直接跳过。
  if (electronPlatformName !== 'darwin') return;

  const hasSigning = Boolean(process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD);
  const hasNotarize = Boolean(
    process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID,
  );

  if (!hasSigning) {
    console.log('\n[afterSign] ⚠️ 未检测到 Developer ID 证书（CSC_LINK / CSC_KEY_PASSWORD 缺失）。');
    console.log('[afterSign] 本次构建为 ad-hoc / 未正式签名构件，仅可用于本机自测，无法对外分发。');
    console.log('[afterSign] 如需正式签名，请设置 CSC_LINK 与 CSC_KEY_PASSWORD 后重新构建。\n');
  }

  if (!hasNotarize) {
    console.log('[afterSign] ⚠️ 跳过公证(notarization)：缺少 APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID。');
    console.log('[afterSign] 构件未公证；分发给他人 Mac 时会被 Gatekeeper 拦截。\n');
    return;
  }

  const appPath = `${appOutDir ?? '.'}/${APP_NAME}.app`;
  console.log(`[afterSign] 开始公证 ${appPath} …`);
  try {
    execFileSync(
      'xcrun',
      [
        'notarytool',
        'submit',
        appPath,
        '--apple-id',
        String(process.env.APPLE_ID),
        '--password',
        String(process.env.APPLE_APP_SPECIFIC_PASSWORD),
        '--team-id',
        String(process.env.APPLE_TEAM_ID),
        '--wait',
      ],
      { stdio: 'inherit' },
    );
    execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' });
    console.log('[afterSign] ✓ 公证完成并已 stapled。');
  } catch (e) {
    // 公证失败不阻断打包：构件仍可本地运行，仅无法分发。
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[afterSign] ✗ 公证失败：${msg}（不影响本地构件，可稍后手动 xcrun notarytool 重试）`);
  }
}
