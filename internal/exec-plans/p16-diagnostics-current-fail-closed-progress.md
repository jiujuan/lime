# P16 Diagnostics Current Fail-Closed Progress

## 2026-06-09 10:40 CST

主计划：`internal/exec-plans/production-command-current-migration-plan.md` 的 P16 Diagnostics / Logs / Support bundle / Config residual / Usage stats。

本刀写集：

- `src/lib/api/serverRuntime.ts`
- `src/lib/api/serverRuntime.test.ts`

主计划文件当前为 `MM` shared staged / working-tree 分歧，本刀不在主计划中夹写，避免覆盖并行进程内容。

## 目标

P16 diagnostics / support bundle / Windows startup diagnostics 尚未接入 App Server / Electron current 通道时，前端不能继续把旧 Tauri command 的真实形状返回当作生产成功。

后续事实源只允许收敛到：

`Frontend API gateway -> Electron Desktop Host or App Server JSON-RPC current diagnostics surface`

旧 `get_server_diagnostics`、`get_log_storage_diagnostics`、`export_support_bundle`、`get_windows_startup_diagnostics` 在本刀中从前端生产正向面撤下，保持 fail closed。

## 改动

- `serverRuntime.ts` 不再导入 `safeInvoke` 或调用四条旧 diagnostics command。
- `getServerDiagnostics()`、`getLogStorageDiagnostics()`、`exportSupportBundle()`、`getWindowsStartupDiagnostics()` 统一通过 `requestDiagnosticsCurrent(...)` fail closed。
- `serverRuntime.test.ts` 删除旧 Tauri positive-shape 断言，改为断言四条命令未接入 current 时抛出明确错误，且不调用 legacy `safeInvoke`。

## 分类

- P16 diagnostics frontend gateway：`deprecated/fail-closed-current-missing`
- 四条旧 Tauri diagnostics command：`dead-candidate frontend-positive-surface-removed`
- `src/lib/api/logs.ts` 日志读取 / 清理：`compat-fail-closed-on-diagnostic-and-shape`
- Electron Host / App Server diagnostics current method：`pending`
- Rust `lime-rs/src/app/commands/logs.rs`、`lime-rs/src/app/commands/server.rs`、`lime-rs/src/commands/windows_startup_cmd.rs`：`cleanup-only residual / not-touched`

## 验证

- `npx vitest run "src/lib/api/serverRuntime.test.ts" "src/lib/api/logs.test.ts" --silent=passed-only --disableConsoleIntercept` 通过，2 files / 9 tests。
- `npx eslint --max-warnings 0 "src/lib/api/serverRuntime.ts" "src/lib/api/serverRuntime.test.ts"` 通过。
- `node "scripts/check-command-contracts.mjs"` 通过，frontend commands `52`、Electron host commands `92`、mock priority `0`、DevBridge truth `72`。
- `npm run test:contracts` 通过，App Server client contract `243 checks`。
- `npx vitest run "src/components/settings-v2/system/developer/index.test.tsx" "src/components/settings-v2/system/experimental/index.test.tsx" "src/hooks/useAppStartupEffects.test.tsx" --silent=passed-only --disableConsoleIntercept` 通过，3 files / 21 tests。
- `git diff --check -- "src/lib/api/serverRuntime.ts" "src/lib/api/serverRuntime.test.ts"` 通过。

未完成：

- `npx tsc --noEmit --pretty false --project tsconfig.json` 运行数分钟无输出且未退出；已终止本次进程，未作为本刀通过证据。
- 未跑 GUI smoke；本刀只撤前端旧 diagnostics positive surface，不实现新的 current diagnostics 产品链路。

## 剩余退出条件

1. 为 diagnostics / logs / support bundle / Windows startup 设计并落地 current Electron Desktop Host 或 App Server JSON-RPC method。
2. 同步前端网关、协议 / host bridge、契约守卫和设置页回归。
3. 撤除旧 Rust runner / DevBridge / command module residual，禁止在 `lime-rs/src/commands/**` 新增业务逻辑或 compat wrapper。
4. 运行 `npm run test:contracts`、受影响前端回归，并在真实 Desktop Host / DevBridge 可用时补 GUI smoke 或页面级诊断回归。

## 2026-06-09 12:17 CST（2026-06-09 23:15 CST 事实源修正）

主计划文件 `internal/exec-plans/production-command-current-migration-plan.md` 仍是 `MM` shared staged / working-tree 分歧，本刀继续不夹写主计划。

本刀写集：

- `src/lib/api/frontendCrash.ts`
- `src/lib/api/frontendCrash.test.ts`
- `src/lib/api/frontendDebug.ts`
- `src/lib/api/frontendDebug.test.ts`
- `src/lib/api/frontendDiagnostics.current-boundary.test.ts`

### 目标

P16 frontend crash / frontend debug 上报的 current 事实源是 Electron Desktop Host 壳能力，不进入 App Server，也不得回流旧 Rust / Tauri command facade。前端可以继续通过 `src/lib/api/frontendCrash.ts` / `src/lib/api/frontendDebug.ts -> safeInvoke(...) -> Electron Host` 上报，但必须 fail closed，不允许 DevBridge truth、desktop-host mock、legacy Rust runner 或旧 Tauri dispatcher 伪造成功。

后续事实源只允许收敛到：

`Frontend API gateway -> Electron Desktop Host diagnostics shell command`

### 改动

- `reportFrontendCrash(...)` 保留 `safeInvoke("report_frontend_crash")`，要求 Electron Host current 返回 `null / undefined / { success: true }`，遇到 degraded diagnostic facade 或异常形态 fail closed。
- `reportFrontendDebugLog(...)` 保留 `safeInvoke("report_frontend_debug_log")`，要求 Electron Host current 返回 `null / undefined`，遇到 degraded diagnostic facade 或异常形态 fail closed。
- `frontendDiagnostics.current-boundary.test.ts` 固定三侧边界：前端诊断 API 走 Electron Host current gateway；Electron Host / IPC 继续拥有这两个壳命令；DevBridge truth、mock、agent catalog、Rust runner 与 Rust dispatcher 不得恢复旧 Tauri facade。
- 23:15 CST 审计发现本条原记录误写为 `current-missing / frontend-positive-surface-removed`，已修正为 `current Electron Host shell command`，避免后续进程误删 current 白名单 / handler。

### 分类

- `src/lib/api/frontendCrash.ts` / `src/lib/api/frontendDebug.ts`：`current frontend gateway with diagnostic fail-closed`
- `report_frontend_crash` / `report_frontend_debug_log` Electron Host / IPC：`current Electron Desktop Host diagnostics shell command`
- DevBridge truth / mock priority / desktop-host mock / agent catalog：`dead / absent from production truth`
- legacy Rust runner / Rust DevBridge dispatcher：`dead / retired guard-only`

### 验证

- `npx vitest run "src/lib/api/frontendCrash.test.ts" "src/lib/api/frontendDebug.test.ts" "src/lib/api/frontendDiagnostics.current-boundary.test.ts"` 通过，3 files / 7 tests。
- `node "scripts/check-command-contracts.mjs"` 通过，frontend commands `51`、Electron host commands `95`、mock priority `0`、DevBridge truth `39`。
- `npm run test:contracts` 通过。

### 剩余退出条件

1. 若后续要把 frontend diagnostics 持久化到文件、support bundle 或 App Server，需要新增明确 current diagnostics method；不能恢复旧 Rust / Tauri command facade。
2. 继续保持 contract guard：这两个命令只允许出现在 Electron Host / IPC、前端 API gateway 和 current boundary test，不得回到 DevBridge truth、mock priority、agent catalog 或 `lime-rs/src/**` 旧注册。

## 2026-06-09 23:00 CST

主计划文件 `internal/exec-plans/production-command-current-migration-plan.md` 仍是 `MM` shared staged / working-tree 分歧，本刀不夹写主计划；本记录作为 P16 content-preview residual 的可追踪进度工件。

本刀写集：

- `src/components/artifact/ArtifactToolbar.tsx`
- `src/components/artifact/ArtifactToolbar.ui.test.tsx`
- `internal/exec-plans/p16-diagnostics-current-fail-closed-progress.md`

### 目标

P16 外链 / 窗口旁路审计中，`ArtifactToolbar` 的 `window.open("", "_blank") + document.write(...)` 不是 http(s) 外部 URL，不能盲迁到 `open_external_url`。本刀把它收窄为：

`ArtifactToolbar -> openHtmlPreviewWindow(...) -> Desktop Host WebviewWindow`

仅当 artifact 元数据存在绝对本地 HTML / SVG 路径时走 Desktop Host 独立预览窗口；没有本地路径或 Desktop Host 预览窗口不可用时，才保留原内存内容预览 fallback。

### 改动

- `ArtifactToolbar` 新增本地预览路径解析，读取 `filePath / absoluteFilePath / outputPath` 等 artifact metadata，并复用 `resolveArtifactProtocolFilePath(...)`。
- 对 `html`、`svg` 和 `code + html/svg language` artifact，若解析到绝对本地路径，优先调用 `openHtmlPreviewWindow(path, { title })`。
- 无绝对本地路径时不调用 Desktop Host 文件预览，也不接 `open_external_url`，继续使用现有内存内容预览窗口。
- `ArtifactToolbar.ui.test.tsx` 增加两条守卫：本地绝对 HTML 路径走 Desktop Host 独立窗口且不 `window.open`；相对路径保持内存预览且不误走文件预览。

### 分类

- `openHtmlPreviewWindow` / Desktop Host `WebviewWindow` 本地文件预览：`current Electron Desktop Host internal preview window capability`
- `ArtifactToolbar` 有绝对本地 HTML / SVG 路径的打开动作：`current GUI caller through file preview gateway`
- `ArtifactToolbar` 无本地路径的 `window.open + document.write`：`content-preview residual / browser-memory fallback`
- `open_external_url`：`current external URL shell command`，本入口不属于它
- 测试 mock：`test-only API gateway fixture`

### 验证

- `npx vitest run "src/components/artifact/ArtifactToolbar.ui.test.tsx" "src/components/artifact/ArtifactToolbar.test.ts" "src/lib/api/fileSystem.test.ts"` 通过，3 files / 26 tests。
- `npx eslint "src/components/artifact/ArtifactToolbar.tsx" "src/components/artifact/ArtifactToolbar.ui.test.tsx"` 通过。
- `npx prettier --check "src/components/artifact/ArtifactToolbar.tsx" "src/components/artifact/ArtifactToolbar.ui.test.tsx"` 通过。
- `node "scripts/check-command-contracts.mjs"` 通过，frontend commands `51`、Electron host commands `95`、mock priority `0`、DevBridge truth `39`。
- `node "scripts/check-app-server-client-contract.mjs"` 通过，`248 checks`。
- `npm run test:contracts` 通过。

### 剩余退出条件

1. 若产品要求所有 artifact 内存预览都进入 Electron internal window，需要新增明确的 current preview content owner；不能把内容预览接到 `open_external_url`。
2. `MarkdownRenderer` 的 data/base64 内容预览和 OEM browser-only OAuth popup 仍是独立 residual，后续按语义分类或产品路径单独处理。
3. P16 diagnostics / support bundle 的 current diagnostics surface 仍未完整落地，本记录只完成 Artifact content-preview residual 的一刀收口。
