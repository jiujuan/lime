# Electron Release / Updater 边界

> 状态：current planning source
> 更新时间：2026-06-07
> 作用：固定 Lime Desktop 下线上一代前端宿主后的 release、签名、公证、updater feed 与平稳迁移口径。

## 1. 事实源

Lime Desktop 的发布与更新链路由 Electron current 接管：

| 边界             | current 事实源                                  | 负责                                                                                            |
| ---------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Desktop host     | `electron/main.ts`、`electron/updateHost.ts`    | updater IPC、下载、安装会话、用户可见状态                                   |
| 打包配置         | `forge.config.mjs`                              | Electron Forge package / make、appId、productName、icon、协议、签名、公证、installer 与 generic feed |
| Windows maker    | `electron/forge/nsisMaker.mjs`                  | 在 Forge maker 管线内生成 NSIS installer，保持 Windows updater 兼容语义      |
| 发布 CI          | `.github/workflows/release.yml`                 | 多平台构建、签名、公证、staging、GitHub Release、Cloudflare R2 feed         |
| 资产 staging     | `scripts/stage-electron-release-assets.mjs`     | 从 `release-electron` 提取 installer、metadata 与 blockmap                  |
| updater 上传计划 | `scripts/plan-electron-updater-r2-upload.mjs`   | 生成按 feed 与版本隔离的 R2 upload plan                                     |
| 包资源校验       | `scripts/verify-electron-package-resources.mjs` | 校验 packaged app 内 desktop assets、App Server sidecar 与 release manifest |

Codex CLI / `codex-rs` 只作为 App Server protocol / daemon lifecycle / client 分层参考；release、updater、tray、Dock、窗口和桌面产品交互都以 Lime Electron Desktop Host 为事实源，不从 Codex App UI 推断。

`electron-builder.yml`、`electron-builder` CLI 与 builder yml 事实源已按 `dead` 处理，不再作为 release、updater、签名、公证、CI、i18n app metadata 或版本同步输入。

## 2. 架构图

```mermaid
flowchart TB
    Renderer["Renderer About / Settings"] --> SafeInvoke["safeInvoke"]
    SafeInvoke --> Ipc["Electron Desktop Host IPC"]
    Ipc --> UpdateHost["ElectronUpdateHost"]
    UpdateHost --> ElectronUpdater["electron-updater autoUpdater"]
    ElectronUpdater --> Feed["generic feed<br/>LIME_ELECTRON_UPDATES_URL"]
    Feed --> R2["Cloudflare R2<br/>lime/stable/<feed>/..."]

    Tag["Git tag / workflow_dispatch"] --> ReleaseWorkflow[".github/workflows/release.yml"]
    ReleaseWorkflow --> Forge["Electron Forge make"]
    Forge --> Makers["MakerDMG / MakerZIP / MakerNsis"]
    Makers --> SignedApp["signed / notarized installers"]
    Makers --> Metadata["latest-mac.yml / latest.yml / blockmap"]
    SignedApp --> Stage["stage-electron-release-assets"]
    Metadata --> Stage
    Stage --> GitHubRelease["GitHub Release archive"]
    Stage --> R2Plan["plan-electron-updater-r2-upload"]
    R2Plan --> R2
```

更新检查、下载和安装是 Desktop Host 壳能力，不进入 App Server JSON-RPC，也不进入 RuntimeCore。App Server sidecar 只作为 packaged resource 随 Electron 包发布，不能反向承担 updater 或签名职责。

## 3. Feed 与资产

默认更新入口：

```text
https://updates.limecloud.com/lime/stable/<feed>/
```

当前 feed 固定为：

| 平台        | feed           | metadata         | installer                          |
| ----------- | -------------- | ---------------- | ---------------------------------- |
| macOS arm64 | `darwin-arm64` | `latest-mac.yml` | `Lime_<version>_aarch64.dmg` / zip |
| macOS x64   | `darwin-x64`   | `latest-mac.yml` | `Lime_<version>_x64.dmg` / zip     |
| Windows x64 | `win32-x64`    | `latest.yml`     | `Lime_<version>_x64-setup.exe`     |

R2 同时保留 current feed 与版本化路径：

```text
lime/stable/<feed>/<asset>
lime/stable/vX.Y.Z/<feed>/<asset>
```

`latest-mac.yml` / `latest.yml` 使用短缓存；installer、zip、blockmap 使用长缓存。GitHub Release 是归档和人工下载入口，客户端热路径直接读 R2 自域名。

## 4. 打包与签名

发布使用 Electron Forge 的 `package` / `make` 管线：

| 平台        | Forge maker                    | 说明                                                       |
| ----------- | ------------------------------ | ---------------------------------------------------------- |
| macOS       | `@electron-forge/maker-dmg`    | 生成 DMG 安装包                                            |
| macOS       | `@electron-forge/maker-zip`    | 生成供 `electron-updater` 使用的 ZIP updater archive       |
| Windows x64 | `electron/forge/nsisMaker.mjs` | 在 Forge maker 内委托 `app-builder-lib` 生成 NSIS installer |

`forge.config.mjs` 会在 package 阶段把 `app-server.release.json`、`app-server/` 与 `desktop-assets/` 放入 Electron resources，并写入 `app-update.yml`。`scripts/stage-electron-release-assets.mjs` 在 staging 阶段生成 `latest-mac.yml` / `latest.yml`，并复制 installer、ZIP 与 blockmap。

macOS 发布签名 / 公证由 release workflow 显式启用：

| GitHub secret                | Forge / packager env          | 用途                               |
| ---------------------------- | ----------------------------- | ---------------------------------- |
| `APPLE_CERTIFICATE`          | 导入临时 keychain             | Developer ID Application 证书      |
| `APPLE_CERTIFICATE_PASSWORD` | 导入临时 keychain             | 证书解锁                           |
| 临时 keychain path           | `LIME_MACOS_KEYCHAIN`         | Forge packager signing keychain    |
| release workflow             | `LIME_ELECTRON_SIGN=1`        | 显式打开签名 / 公证                |
| `APPLE_ID`                   | `APPLE_ID`                    | notarization Apple ID              |
| `APPLE_PASSWORD`             | `APPLE_APP_SPECIFIC_PASSWORD` | notarization app-specific password |
| `APPLE_TEAM_ID`              | `APPLE_TEAM_ID`               | Team 绑定                          |

`.github/workflows/release.yml` 在 macOS matrix 中先校验这些 secret，缺失时直接失败，不等到打包或公证中途才暴露问题。

Windows 当前通过 `npx electron-forge make --platform win32 --arch x64 --targets nsis` 生成 NSIS installer；后续若接入 Windows code signing，必须在 `forge.config.mjs`、`electron/forge/nsisMaker.mjs`、release workflow、secret preflight 和本文档中成组更新。

## 5. 客户端命令

Renderer 仍通过既有命令名进入更新体验，但实现 owner 已切到 Electron：

| 命令                           | current owner                              |
| ------------------------------ | ------------------------------------------ |
| `check_for_updates`            | `ElectronUpdateHost.checkForUpdates()`     |
| `download_update`              | `ElectronUpdateHost.downloadUpdate()`      |
| `start_update_install_session` | `ElectronUpdateHost.startInstallSession()` |
| `get_update_install_session`   | `ElectronUpdateHost` 内存会话投影          |
| `get_update_check_settings`    | Electron updater 设置投影                  |

开发态默认不启用真实 updater。只有显式设置 `LIME_ELECTRON_ENABLE_DEV_UPDATER=1` 时才允许在开发包里调用 `electron-updater`，避免开发环境误连生产 feed。

## 6. 平稳迁移要求

下个版本发布必须保持以下稳定标识：

1. `forge.config.mjs#APP_ID` 继续为 `com.limecloud.lime`。
2. `forge.config.mjs#PRODUCT_NAME` 继续为 `Lime`，Dock、菜单、托盘和安装器展示不能退回默认 `Electron`。
3. URL scheme 继续为 `lime`。
4. macOS icon 继续走 `lime-rs/icons/icon.icns`，Windows icon 继续走 `lime-rs/icons/icon.ico`。
5. `extraResources` 必须包含 `app-server.release.json` 与 `app-server/` sidecar，发布包启动后仍能完成 App Server JSON-RPC `initialize`。
6. `stage-electron-release-assets` 必须在 `release-electron` staging 阶段 fail-fast 拒绝旧 updater 资产，不能静默忽略 `*.app.tar.gz`、`*.sig` 或 `latest.json`。
7. `prepare-github-release-assets` 与 release workflow 必须拒绝旧 updater 资产进入 Electron 发布物；current workflow 只发布 Electron installer、`latest-mac.yml` / `latest.yml`、blockmap 与 GitHub Release 归档资产。

## 7. 验证入口

涉及发布、签名、updater、App Server packaged resources 或版本号时，最小验证为：

```bash
npm run verify:app-version
npm run typecheck:electron
npm test -- "scripts/release-updater-manifest.test.mjs" "scripts/electron-current-docs-guard.test.mjs"
npm run electron:verify:package
```

GUI 可交付证据仍以 Electron 为准：

```bash
npm run smoke:electron
```

如果本地没有真实 `release-electron` package，先运行：

```bash
npm run electron:package:dir
```
