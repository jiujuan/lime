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

## 2026-06-09 12:17 CST

主计划文件 `internal/exec-plans/production-command-current-migration-plan.md` 仍是 `MM` shared staged / working-tree 分歧，本刀继续不夹写主计划。

本刀写集：

- `src/lib/api/frontendCrash.ts`
- `src/lib/api/frontendCrash.test.ts`
- `src/lib/api/frontendDebug.ts`
- `src/lib/api/frontendDebug.test.ts`

### 目标

P16 frontend crash / frontend debug 上报尚未接入 current diagnostics surface 时，前端不能继续通过旧 `report_frontend_crash` / `report_frontend_debug_log` Tauri/Electron command façade 把上报伪装成成功。

后续事实源只允许收敛到：

`Frontend API gateway -> Electron Desktop Host or App Server JSON-RPC current diagnostics surface`

### 改动

- `reportFrontendCrash(...)` 不再导入 `safeInvoke` / `isDevBridgeAvailable`，也不再调用旧 `report_frontend_crash`。
- `reportFrontendDebugLog(...)` 不再导入 `safeInvoke` / `isDevBridgeAvailable`，也不再调用旧 `report_frontend_debug_log`。
- 两个前端 API 在 current surface 缺失时统一 fail closed，并在错误中说明不能通过旧 Tauri/Electron 命令上报。
- 对应测试从旧命令 positive-shape / diagnostic façade 断言改为负向守卫：current 缺失时抛错，且不调用 `safeInvoke`。

### 分类

- `src/lib/api/frontendCrash.ts` / `src/lib/api/frontendDebug.ts`：`deprecated/fail-closed-current-missing`
- `report_frontend_crash` / `report_frontend_debug_log` 前端生产正向面：`dead frontend-positive-surface-removed`
- `electron/ipcChannels.ts` / `electron/hostCommands.ts` 对应命令：`cleanup-only residual / not-touched`，当前文件是并行热区，后续单独撤白名单与 handler
- `lime-rs/src/app/commands/logs.rs` / `lime-rs/src/app/runner.rs` 对应注册：`cleanup-only residual / not-touched`，后续撤旧 runner 注册

### 验证

- `npx vitest run "src/lib/api/frontendCrash.test.ts" "src/lib/api/frontendDebug.test.ts" --silent=passed-only --disableConsoleIntercept` 通过，2 files / 2 tests。
- `node "scripts/check-command-contracts.mjs"` 通过，frontend commands `50`、Electron host commands `90`、mock priority `0`、DevBridge truth `64`。
- `npm run test:contracts` 通过，App Server client contract `243 checks`。
- `git diff --check -- "src/lib/api/frontendCrash.ts" "src/lib/api/frontendCrash.test.ts" "src/lib/api/frontendDebug.ts" "src/lib/api/frontendDebug.test.ts" "internal/exec-plans/p16-diagnostics-current-fail-closed-progress.md"` 通过。

### 剩余退出条件

1. 设计并落地 frontend crash / frontend debug 的 current diagnostics surface。
2. 同步 Electron Desktop Host 或 App Server JSON-RPC、前端 API、契约守卫、diagnostics UI / crash buffer 回归。
3. 撤除旧 `report_frontend_crash` / `report_frontend_debug_log` Electron IPC 白名单、Host handler、Rust runner 注册和 Rust command residual。
