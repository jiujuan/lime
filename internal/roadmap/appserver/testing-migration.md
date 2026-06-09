# App Server / Electron 测试迁移口径

> 状态：current testing source
> 更新时间：2026-06-08
> 作用：定义 Tauri GUI 退场后，测试用例如何迁到 Electron Desktop Host + App Server JSON-RPC current。

## 1. 结论

测试需要全面更新口径，但不做一次性批量改名。

优先顺序：

1. 先把 current 事实源守住：Electron Desktop Host、App Server JSON-RPC、`src/lib/desktop-host/` mock、`packages/app-server-client`。
2. 再迁会影响交付判断的 GUI / bridge / runtime 主路径测试。
3. 最后清理只剩历史命名的 standalone Tauri artifact adapter 测试。

不接受的做法：

1. 用 Tauri GUI smoke 证明 Desktop current 可交付。
2. 新增测试继续把 production artifact build 称为 `Tauri build`。
3. 新 Agent / runtime 测试绕过 App Server JSON-RPC，直接压到 legacy command glue。
4. 为了让旧测试通过，在 `lime-rs/src/commands/**` 新增 stub、compat wrapper、mock fallback 或业务逻辑。

## 2. 当前测试事实源

| 分类                          | 测试事实源                                                      | 说明                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `current`                     | `scripts/electron/current-entrypoints.test.mjs`                 | 固定 `dev / build / preview / verify:gui-smoke` 默认走 Electron。                                                                             |
| `current`                     | `scripts/lib/electron-dev-sidecar.test.mjs`                     | 验证 Electron dev sidecar 的 app-server binary 解析与构建入口。                                                                               |
| `current`                     | `scripts/lib/electron-app-server-assets.test.mjs`               | 验证 Electron packaged app-server resources 和 release manifest。                                                                             |
| `current`                     | `electron/ipcChannels.test.ts`                                  | 验证 Electron IPC channel catalog。                                                                                                           |
| `current`                     | `src/features/agent-app/architecture/importBoundaries.test.ts`  | 阻止 Agent App current 代码直接 import legacy Tauri host API。                                                                                |
| `current`                     | `packages/app-server-client/tests/client.test.mjs`              | 验证外部 App 通过 App Server client 消费协议。                                                                                                |
| `current`                     | `scripts/lib/agent-qc-process-owner-current.test.mjs`           | 验证 raw process owner sidecar 识别 Electron smoke / dev runtime，不再只围绕 Tauri dev 判断。                                                 |
| `current`                     | `scripts/electron/current-docs-guard.test.mjs`                  | 阻止 current 测试文档、GUI 续测 skill 和 qcloop 当前操作段继续推荐 Tauri GUI 启动、Tauri E2E 框架或把 Tauri 壳写成 GUI smoke 证据。           |
| `current`                     | `scripts/electron/current-rules-guard.test.mjs`                 | 验证根规则、`internal/aiprompts` 与核心 skills 已锁定 Electron / App Server current、禁止新增品牌前缀命名，并要求新 Agent 逻辑走 App Server。 |
| `current`                     | `scripts/lib/agent-qc-report-core.test.ts`                      | 验证 Agent QC package script fixture 中的 `verify:gui-smoke` 指向 `smoke:electron`，不再把旧 `scripts/verify-gui-smoke.mjs` 当 current 证据。 |
| `current`                     | `scripts/lib/gui-smoke-run-lock.test.mjs`                       | 验证 GUI smoke run lock owner fixture 使用 `npm run smoke:electron`，不再把旧脚本路径写进 current owner metadata。                            |
| `current`                     | `scripts/verify-gui-smoke.mjs`                                  | 保留旧文件名作为兼容入口，但直接委托 `npm run smoke:electron`，直接执行也只验证 Electron Desktop Host。                                       |
| `compat cleanup guard`        | `src/lib/governance/rustCommandsCurrentBoundary.test.ts`         | 锁定 `lime-rs/src/commands/**` 只能作为旧 wrapper 清理区，防止 in-process bridge / runtime 新实现回流到 Tauri command。                      |
| `deprecated guard`            | `scripts/standalone-deprecated-artifact-adapter-guard.test.mjs` | 验证旧 standalone artifact adapter 默认 blocked，且不回流 current release evidence / GUI 证据。                                               |
| `deprecated artifact adapter` | `scripts/lib/agent-app-standalone-native-*.test.mjs`            | 只允许证明 standalone artifact adapter fail-closed，不作为 current 发布链证据。                                                               |
| `dead guard`                  | `scripts/electron/current-entrypoints.test.mjs`                 | 验证 root Tauri GUI app entry files 已删除，不能重新作为 Desktop current 或 deprecated runner 入口回流。                                      |

## 3. 迁移规则

### 3.1 GUI 测试

默认：

```bash
npm run verify:gui-smoke
```

必须验证 Electron GUI。若需要排查 legacy adapter，只能使用显式 legacy 脚本或单独说明，不得把结果写成 Desktop current 交付证据。

### 3.2 命令 / Bridge 测试

涉及 IPC、preload、`safeInvoke`、App Server method、mock 或 frontend API gateway 时，最低验证：

```bash
npm run test:contracts
```

测试断言应覆盖：

1. Electron host / preload 白名单。
2. App Server JSON-RPC method / client。
3. `src/lib/desktop-host/` mock。
4. legacy adapter 只在 compat / deprecated 语境出现。

### 3.3 Agent / runtime 测试

新增 Agent 逻辑必须优先覆盖 App Server current：

1. Rust protocol / runtime core fixture。
2. `packages/app-server-client` client contract。
3. Electron main sidecar lifecycle。
4. renderer API gateway。

旧 `agent_runtime_*` 测试只证明 Desktop compat adapter 委托，不再作为新增业务逻辑的主要证据。

`lime-rs/src/commands/**` 相关测试只允许作为 cleanup guard：证明旧 wrapper 已删除、已迁出、已撤注册或没有回流。新增 Agent / runtime / workspace / artifact / evidence / Knowledge / MCP 能力的正向测试必须覆盖 App Server protocol / RuntimeCore / client / Electron Host current 链路；新增桌面壳能力的正向测试必须覆盖 Electron main / preload / desktop-host API。不能把 legacy Rust command 注册测试当作 GUI current 可交付证据，也不能用 stub / compat wrapper 测试替代 current 交付证据。

## 4. 下一批迁移

优先处理：

1. DevBridge transport 测试，确保 `electron-ipc -> App Server -> mock` 顺序可观测。
2. Agent QC / raw process owner sidecar 输出继续使用 Electron current 字段；legacy `passiveTauriRuntime` 只作为过渡期观察上下文。
3. 等 Forge / Electron release 链路完成真实 package evidence 后，删除仍只作为 deprecated guard 存在的 standalone artifact adapter。

暂缓处理：

1. `src/lib/governance/legacySurfaceCatalog.json` 当前也在并行进程 staged 写集，本轮不覆盖；后续需要补脚本级 surface，覆盖 legacy smoke / artifact adapter，并限制 allowed paths 只允许 dead guard、deprecated guard 与历史说明。
2. 只剩历史命名的 package materializer 只能作为 deprecated adapter 依赖，不得重新进入 current release 证据。
3. Rust crate 内依赖 host state 的 Aster backend 测试，等 RuntimeCore / ExecutionBackend 解耦后再迁。
4. `lime-rs/src/commands/**` 的剩余 wrapper 清理按命令族分批推进；等待 App Server / Electron Host current 覆盖后删除，不再为它们补新正向用例。

## 5. 当前验证证据

2026-06-06 已跑通：

```bash
npm test -- "scripts/electron/current-entrypoints.test.mjs" "src/features/agent-app/architecture/importBoundaries.test.ts" "src/features/agent-app/packaging/releasePipeline.test.ts" "scripts/lib/agent-app-standalone-release-evidence-core.test.mjs" "scripts/lib/electron-dev-sidecar.test.mjs" "scripts/lib/electron-app-server-assets.test.mjs" "electron/ipcChannels.test.ts"
npm run test:contracts
npm run test:bridge
npm --prefix "packages/app-server-client" test
npm run verify:gui-smoke
npm run docs:boundary
```

2026-06-06 追加 docs current guard：

```bash
node --check "scripts/electron/current-docs-guard.test.mjs"
npm test -- "scripts/electron/current-docs-guard.test.mjs" "scripts/electron/current-entrypoints.test.mjs"
git diff --check -- "internal/testing/skills-e2e-testing.md" "internal/tests/lime-agent-qc-rollout-plan.md" "scripts/electron/current-docs-guard.test.mjs"
```

2026-06-06 追加 Agent QC fixture current guard：

```bash
npm test -- "scripts/lib/agent-qc-report-core.test.ts" "scripts/electron/current-docs-guard.test.mjs" "scripts/electron/current-entrypoints.test.mjs"
git diff --check -- "internal/testing/skills-e2e-testing.md" "internal/tests/lime-agent-qc-rollout-plan.md" "internal/tests/lime-agent-qc-qcloop-operations.md" "scripts/lib/agent-qc-report-core.test.ts"
```

2026-06-06 追加 GUI smoke run lock fixture current guard：

```bash
npm test -- "scripts/lib/gui-smoke-run-lock.test.mjs" "scripts/lib/agent-qc-report-core.test.ts" "scripts/electron/current-docs-guard.test.mjs" "scripts/electron/current-entrypoints.test.mjs"
git diff --check -- "scripts/lib/gui-smoke-run-lock.test.mjs" "scripts/lib/agent-qc-report-core.test.ts"
```

2026-06-06 追加 process owner 与 Skills E2E current guard：

```bash
node --check "scripts/electron/current-docs-guard.test.mjs"
npm test -- "scripts/lib/agent-qc-process-owner-current.test.mjs" "scripts/electron/current-docs-guard.test.mjs" "scripts/lib/gui-smoke-run-lock.test.mjs" "scripts/lib/agent-qc-report-core.test.ts"
rg -n "Tauri 的测试框架|npm run tauri(?::dev)?\\b|\\btauri dev\\b|headless Tauri|验证 Tauri 壳" "internal/testing/skills-e2e-testing.md" "internal/tests/lime-agent-qc-rollout-plan.md" "internal/tests/lime-agent-qc-qcloop-operations.md" "scripts/electron/current-docs-guard.test.mjs"
git diff --check -- "internal/testing/skills-e2e-testing.md" "scripts/electron/current-docs-guard.test.mjs" "scripts/lib/agent-qc-process-owner-current.test.mjs" "scripts/lib/gui-smoke-run-lock.test.mjs" "scripts/lib/agent-qc-report-core.test.ts"
```

2026-06-06 追加旧 runner dead guard：

```bash
npx vitest run "scripts/electron/current-entrypoints.test.mjs"
npm run verify:app-version
rg -n "tauri dev|tauri\.conf|src-tauri|npm run tauri|@tauri-apps/cli" "package.json" "forge.config.mjs" "scripts/electron/current-entrypoints.test.mjs"
```

这组证据证明：

1. `verify:gui-smoke` 已经走 Electron build / Electron smoke / App Server initialize。
2. App Server client、Electron sidecar assets、Electron IPC catalog、Bridge 合同均可在 current 口径下通过。
3. 旧 Tauri GUI entrypoint 已退到 deprecated guard，不再作为默认 GUI smoke 证据。
4. current 测试文档、GUI 续测 skill 和 qcloop 当前操作段不再推荐 `tauri dev` / `headless Tauri`，也不再把 Tauri 壳写成 GUI smoke 交付证据。
5. Agent QC 报告测试 fixture 不再把 `verify:gui-smoke` 映射到 legacy `scripts/verify-gui-smoke.mjs`。
6. GUI smoke run lock 的 owner fixture 不再写入 legacy `scripts/verify-gui-smoke.mjs`。
7. Skills E2E 的未来自动化测试方向已改为 Playwright / Electron smoke / App Server contract，不再推荐 Tauri 测试框架。
8. raw process owner sidecar 已覆盖 Electron smoke active owner 与 Electron dev host passive desktop runtime；旧 `tauri dev` 只保留 `deprecatedTauriRuntime` 旁路观测，不再计入 current desktop runtime 或 Cargo/Rust blocker。
9. 旧 runner 根入口已删除；current 入口只允许 Electron / Forge。
10. `scripts/update-version.sh` 只更新 `package.json`、`packages/lime-cli-npm/package.json` 与 `lime-rs/Cargo.toml`，不再写 `tauri.conf`。

2026-06-09 追加前端 API error envelope fail-closed 守卫：

```bash
npx vitest run "src/lib/api/hintRoutes.test.ts" "src/lib/api/agentAppRuntime.test.ts" "src/lib/api/companion.test.ts" "src/lib/api/tray.test.ts" --silent=passed-only --disableConsoleIntercept
npx eslint --max-warnings 0 "src/lib/api/hintRoutes.ts" "src/lib/api/hintRoutes.test.ts" "src/lib/api/agentAppRuntime.ts" "src/lib/api/agentAppRuntime.test.ts" "src/lib/api/companion.ts" "src/lib/api/companion.test.ts" "src/lib/api/tray.ts" "src/lib/api/tray.test.ts"
npm run test:contracts
git diff --check -- "src/lib/api/hintRoutes.ts" "src/lib/api/hintRoutes.test.ts" "src/lib/api/agentAppRuntime.ts" "src/lib/api/agentAppRuntime.test.ts" "src/lib/api/companion.ts" "src/lib/api/companion.test.ts" "src/lib/api/tray.ts" "src/lib/api/tray.test.ts" "internal/roadmap/appserver/testing-migration.md"
```

这组证据证明：

1. `get_hint_routes` 在 optional legacy UX 网关中拒绝顶层和数组项 error envelope，不再把 unsupported / fallback 响应混成真实提示路由。
2. `agent_app_runtime_*` current Electron Host -> App Server 投影网关拒绝顶层 error envelope 与 `taskEvents[]` 项 error envelope，不再把伪 task 状态当作真实 Agent App runtime 数据。
3. `companion_*` 前端网关拒绝顶层 error envelope，不再把桌宠状态 / 启动 / 命令投递 fallback 当作真实成功。
4. `sync_tray_model_shortcuts` 前端网关拒绝顶层 error envelope，不再把托盘壳能力 fallback 当作同步成功。
5. 本轮只补未被并行写集占用的 API fail-closed 守卫；P15 `materials` / `session-files`、P14 `asrProvider` / `voiceModels`、P12 `agentApps` 仍需等对应 API 文件释放后补同类守卫，或在 Electron Host / App Server / Rust runner / contract 热区释放后成组 current 化。

2026-06-06 追加 direct GUI smoke current wrapper：

```bash
node --check "scripts/verify-gui-smoke.mjs"
npx vitest run "scripts/electron/current-entrypoints.test.mjs" "scripts/electron/current-docs-guard.test.mjs"
rg -n "tauri dev|tauri\.conf|src-tauri|headless Tauri|node_modules/.bin/tauri" "scripts/verify-gui-smoke.mjs" "scripts/electron/current-entrypoints.test.mjs" "internal/roadmap/appserver/testing-migration.md"
```

这组证据证明：

1. 直接执行 `scripts/verify-gui-smoke.mjs` 也只委托 `npm run smoke:electron`，不再启动 legacy GUI 宿主。
2. `scripts/electron/current-entrypoints.test.mjs` 已锁定旧脚本名不能重新引入 `tauri.conf`、headless 启动链或 CLI 直连。

2026-06-06 追加 standalone deprecated artifact adapter guard：

```bash
node --check "scripts/standalone-deprecated-artifact-adapter-guard.test.mjs"
npm test -- "scripts/standalone-deprecated-artifact-adapter-guard.test.mjs" "scripts/lib/agent-app-standalone-native-shell-config-writer-core.test.mjs" "scripts/lib/agent-app-standalone-native-build-runner-core.test.mjs" "scripts/electron/current-entrypoints.test.mjs" "scripts/lib/agent-app-standalone-release-evidence-core.test.mjs" "src/features/agent-app/packaging/releasePipeline.test.ts"
rg -n "npm run tauri|run\", \"tauri|tauri -- build|node_modules/.bin/tauri|agent-app-standalone-tauri-(config-writer|build-runner).*--execute" "scripts/agent-app/standalone-native-shell-config-writer.mjs" "scripts/agent-app/standalone-native-build-runner.mjs" "scripts/lib/agent-app-standalone-native-shell-config-writer-core.mjs" "scripts/lib/agent-app-standalone-native-build-runner-core.mjs" "scripts/standalone-deprecated-artifact-adapter-guard.test.mjs"
git diff --check -- "scripts/standalone-deprecated-artifact-adapter-guard.test.mjs" "scripts/agent-app/standalone-native-shell-config-writer.mjs" "scripts/agent-app/standalone-native-build-runner.mjs" "scripts/lib/agent-app-standalone-native-shell-config-writer-core.mjs" "scripts/lib/agent-app-standalone-native-build-runner-core.mjs" "internal/roadmap/appserver/testing-migration.md"
```

这组证据证明：

1. standalone artifact adapter CLI 只能进入 deprecated gate，不再执行真实构建。
2. standalone native shell config / build core helper 默认 `blocked`，且 core 内不再包含旧宿主可执行命令计划。
3. current release evidence、macOS release command、updater publisher、standalone evidence pack 与 release pipeline 不再引用旧 standalone artifact adapter 作为 current 证据名。

2026-06-06 追加 Electron current rules guard：

```bash
node --check "scripts/electron/current-rules-guard.test.mjs"
npm test -- "scripts/electron/current-rules-guard.test.mjs"
```

这组证据证明：

1. 根 `AGENTS.md`、`internal/aiprompts/README.md`、命令边界、治理和质量工作流文档已经把 Electron Desktop Host + App Server 作为 current 事实源。
2. 三个核心 skills：`lime-command-boundary`、`lime-governance`、`lime-quality-workflow` 都已声明新增命名不得添加 `Lime` / `lime_` / `lime-` 品牌前缀。
3. 新 AI Agent / runtime / host integration / 跨 App 复用能力必须走 App Server JSON-RPC current 主链，`agent_runtime_*` 只作为兼容适配层。

2026-06-06 追加 legacy profiling docs guard：

```bash
node --check "scripts/electron/current-docs-guard.test.mjs"
npm test -- "scripts/electron/current-docs-guard.test.mjs"
```

这组证据证明：

1. `internal/aiprompts/performance-profiling.md` 中的 `npm run tauri:dev:profile:*` 只允许保留为 legacy profiling 口径。
2. Electron profiling 入口补齐前，旧 profiling 脚本不能被写成 current Electron 证据。
3. current GUI / DevBridge / qcloop 文档守卫与 profiling 文档守卫共用同一个 `scripts/electron/current-docs-guard.test.mjs`。

2026-06-06 追加 internal testing entrypoint current guard：

```bash
node --check "scripts/electron/current-docs-guard.test.mjs"
npm test -- "scripts/electron/current-docs-guard.test.mjs"
```

这组证据证明：

1. `internal/test/README.md` 已把测试体系事实源固定为 Electron Desktop Host、App Server JSON-RPC、`packages/app-server-client`、`src/lib/desktop-host/` 与 `smoke:electron` / `verify:gui-smoke`。
2. `internal/tests/agent-qc-p0-scenarios.md` 的 P0 场景最低入口不再引用 Tauri GUI 启动，`release-package-startup-smoke` 只要求 release / GUI startup smoke 与版本一致性证据。
3. `internal/tests/lime-agent-autonomous-test-execution-matrix.md` 只把 legacy Tauri runtime 当作 owner gate 旁路上下文，不再作为 current desktop runtime 证据。

2026-06-06 追加 E2E / testing strategy current section guard：

```bash
node --check "scripts/electron/current-docs-guard.test.mjs"
npm test -- "scripts/electron/current-docs-guard.test.mjs"
```

这组证据证明：

1. `internal/test/e2e-tests.md` 的 `current` 小节只允许 Electron dev、Electron smoke、Bridge health、App Server / runtime surface smoke 等 current 入口。
2. `internal/test/testing-strategy-2026.md` 的 `current` 小节已固定 Electron Desktop Host、App Server JSON-RPC、`packages/app-server-client`、`src/lib/desktop-host/`、`smoke:electron` 与 `verify:gui-smoke`。
3. 旧 Tauri headless / Tauri GUI smoke / Tauri-only E2E 只能出现在 deprecated / dead 语境，不能回流到 current 测试事实源。

2026-06-06 追加 Vitest smoke runner current naming guard：

```bash
node --check "scripts/lib/vitest-smoke-runner.mjs" "scripts/electron/current-rules-guard.test.mjs"
node --check "scripts/lib/vitest-smoke-runner.test.mjs"
npm test -- "scripts/lib/vitest-smoke-runner.test.mjs" "scripts/electron/current-rules-guard.test.mjs"
```

这组证据证明：

1. `scripts/lib/vitest-smoke-runner.mjs` 的 mock alias 已使用 `desktopHostAliasPatterns` / `desktopHostDir`，事实源仍是 `src/lib/desktop-host`。
2. 旧 `TauriAliasPatterns` / `tauriMockDir` / `src/lib/tauri-mock` 命名不能回流到 current Vitest smoke runner。
3. 新临时目录命名不再使用 `lime-` 品牌前缀，符合新增命名禁止品牌前缀规则。
4. `scripts/lib/vitest-smoke-runner.test.mjs` 已直接验证临时 Vitest config 生成的 alias 指向 `src/lib/desktop-host`，且 cleanup 会移除临时配置。

2026-06-06 追加 process owner deprecated Tauri runtime 分离：

```bash
node --check "scripts/agent-qc/process-owner-check.mjs" "scripts/lib/agent-qc-process-owner-core.mjs" "scripts/lib/agent-qc-process-owner-current.test.mjs"
npx vitest run "scripts/lib/agent-qc-process-owner-core.test.ts" "scripts/lib/agent-qc-process-owner-current.test.mjs"
rg -n "passiveTauriRuntime=|Passive Tauri dev runtime|passiveDesktopRuntime.*Tauri|isPassiveElectronRuntime\\(entry\\) \\|\\| isPassiveTauriRuntime" "scripts/lib/agent-qc-process-owner-core.mjs" "scripts/lib/agent-qc-process-owner-core.test.ts" "scripts/lib/agent-qc-process-owner-current.test.mjs" "scripts/agent-qc/process-owner-check.mjs"
git diff --check -- "scripts/lib/agent-qc-process-owner-core.mjs" "scripts/lib/agent-qc-process-owner-core.test.ts" "scripts/lib/agent-qc-process-owner-current.test.mjs" "scripts/agent-qc/process-owner-check.mjs"
```

这组证据证明：

1. Electron smoke 仍作为 active GUI owner，Electron dev host 作为 passive desktop runtime。
2. 旧 `tauri dev` 只作为 `deprecatedTauriRuntime` 旁路观测，不再出现在 summary 的 `passiveTauriRuntime=` 字段。
3. 旧 `tauri dev` 不再计入 `passiveDesktopRuntime` 或 `cargoOrRust`，单独存在时不阻断 current heavy gate。

2026-06-06 追加 Electron package monitor current guard：

```bash
bash -n "scripts/monitor-build.sh"
npx vitest run "scripts/electron/current-entrypoints.test.mjs"
rg -n "Tauri 打包|tauri build|/tmp/tauri-build|src-tauri/target|lime-rs/target/release/bundle" "scripts/monitor-build.sh" "scripts/electron/current-entrypoints.test.mjs"
git diff --check -- "scripts/monitor-build.sh" "scripts/electron/current-entrypoints.test.mjs"
```

这组证据证明：

1. `scripts/monitor-build.sh` 已监控 Electron package output `release-electron`，不再监控旧 Tauri bundle 目录。
2. build log 入口已从 `/tmp/tauri-build.log` 改为 `/tmp/electron-build.log`。
3. 进程判断已从 `tauri build` 改为 `electron-forge|electron:package:dir|electron:dist`。

2026-06-06 追加 sherpa runtime Rust workspace 口径收口：

```bash
node --check "scripts/prepare-sherpa-onnx-runtime.mjs" "scripts/prepare-sherpa-onnx-runtime.test.mjs"
npx vitest run "scripts/prepare-sherpa-onnx-runtime.test.mjs"
rg -n "srcTauri|SRC_TAURI|src-tauri|--src-tauri-dir|DEFAULT_SRC_TAURI_DIR" "scripts/prepare-sherpa-onnx-runtime.mjs" "scripts/prepare-sherpa-onnx-runtime.test.mjs"
git diff --check -- "scripts/prepare-sherpa-onnx-runtime.mjs" "scripts/prepare-sherpa-onnx-runtime.test.mjs"
```

这组证据证明：

1. sherpa-onnx runtime 准备脚本默认读取 `lime-rs/Cargo.lock`，不再以 `src-tauri` 作为运行时目录事实源。
2. 公开函数参数已从旧 host 命名收敛为 `rustWorkspaceDir`。
3. CLI 只暴露 `--lime-rs-dir`，不再暴露 `--src-tauri-dir`。

2026-06-06 追加 Vite DevBridge bootstrap current guard：

```bash
node --check "scripts/lib/vite-dev-server-bootstrap.mjs" "scripts/lib/vite-dev-server-bootstrap.test.mjs"
npx vitest run "scripts/lib/vite-dev-server-bootstrap.test.mjs"
rg -n "TAURI_ENV_PLATFORM|vite-tauri|Tauri 原生模式|Tauri dev server|Tauri 抢跑|Tauri dialog|TAURI_DIALOG|browserBridge: false" "scripts/lib/vite-dev-server-bootstrap.mjs" "scripts/lib/vite-dev-server-bootstrap.test.mjs"
git diff --check -- "scripts/lib/vite-dev-server-bootstrap.mjs" "scripts/lib/vite-dev-server-bootstrap.test.mjs"
```

这组证据证明：

1. `scripts/lib/vite-dev-server-bootstrap.mjs` 只支持 browser DevBridge mock current 模式。
2. 非 browserBridge 旧宿主模式直接拒绝，并提示使用 Electron current entrypoints。
3. 脚本不再设置 `TAURI_ENV_PLATFORM`，也不再使用 `.vite-tauri` 优化依赖目录或 “Tauri 原生模式” 文案。

2026-06-06 追加 Agent App production artifact build 命名收口：

```bash
npx vitest run "src/features/agent-app/packaging/packageDescriptor.test.ts" "src/features/agent-app/packaging/releasePipeline.test.ts"
rg -n "tauri_config_writer|tauri_build_runner|TAURI_CONFIG_MATERIALIZER_MISSING|TAURI_CONFIG_MATERIALIZATION_BLOCKED|TAURI_CONFIG_WRITE_PLAN_BLOCKED" "src/features/agent-app/packaging/artifactBuilder.ts" "src/features/agent-app/packaging/packageDescriptor.test.ts"
rg -n "native_shell_config_writer|electron_artifact_builder|NATIVE_SHELL_CONFIG" "src/features/agent-app/packaging/artifactBuilder.ts" "src/features/agent-app/packaging/packageDescriptor.test.ts"
git diff --check -- "src/features/agent-app/packaging/artifactBuilder.ts" "src/features/agent-app/packaging/packageDescriptor.test.ts"
```

这组证据证明：

1. `buildStandaloneArtifactBuildPlan(...)` 的 current `requiredAdapters` 不再输出 `tauri_config_writer` / `tauri_build_runner`，改为 `native_shell_config_writer` / `electron_artifact_builder`。
2. production artifact build blocker code 从 `TAURI_CONFIG_*` 收敛为 `NATIVE_SHELL_CONFIG_*`，避免 current release 证据继续把 Tauri config 当成构建事实源。
3. 底层 `tauriConfigWritePlan` / `tauriConfigMaterializer` 仍保留为 deprecated adapter 依赖，退出条件是 Agent App standalone packaging 完成 Electron/native shell config materializer 后再集中改名或删除。

2026-06-06 追加 Vitest layer classifier current / legacy desktop host contract 分离：

```bash
node --check "scripts/lib/vitest-layer-classifier.mjs" "scripts/lib/vitest-layer-classifier.unit.test.mjs" "scripts/electron/current-rules-guard.test.mjs"
npx vitest run "scripts/lib/vitest-layer-classifier.unit.test.mjs" "scripts/electron/current-rules-guard.test.mjs"
rg -n "desktop-host-api|legacy-desktop-host-api|@tauri-apps/api|__TAURI__" "scripts/lib/vitest-layer-classifier.mjs" "scripts/lib/vitest-layer-classifier.unit.test.mjs" "scripts/electron/current-rules-guard.test.mjs"
git diff --check -- "scripts/lib/vitest-layer-classifier.mjs" "scripts/lib/vitest-layer-classifier.unit.test.mjs" "scripts/electron/current-rules-guard.test.mjs" "internal/roadmap/appserver/testing-migration.md"
```

这组证据证明：

1. Vitest 分层统计中的 `desktop-host-api` 只匹配 Electron Desktop Host current 信号。
2. `@tauri-apps/api` 与 `__TAURI__` 已单独归为 `legacy-desktop-host-api` contract 信号，只能用于 legacy / deprecated adapter 守卫。
3. `scripts/electron/current-rules-guard.test.mjs` 已阻止旧 Tauri API 被重新标成 desktop-host current 证据。

2026-06-06 追加 Electron / App Server current 闭环定向验证：

```bash
npm test -- "scripts/electron/current-entrypoints.test.mjs" "scripts/electron/current-rules-guard.test.mjs" "scripts/electron/current-docs-guard.test.mjs" "scripts/lib/electron-dev-sidecar.test.mjs" "scripts/lib/electron-app-server-assets.test.mjs"
npm --prefix "packages/app-server-client" test
npm run test:contracts
npm run verify:app-version
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server-protocol -p app-server-client -p app-server-transport
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server --lib
npm run smoke:electron
git diff --check -- "lime-rs/crates/app-server-protocol/src/protocol/v0.rs" "scripts/electron/current-rules-guard.test.mjs" "internal/roadmap/appserver/testing-migration.md"
```

这组证据证明：

1. Electron current entrypoints、Electron dev sidecar 与 packaged app-server assets 的脚本级守卫通过。
2. `packages/app-server-client` 的 TypeScript build 与 31 个 client / sidecar lifecycle / schema manifest 测试通过。
3. `npm run test:contracts` 通过，覆盖 App Server client contract、command contracts、harness contracts、modality contracts 与 docs boundary。
4. App Server Rust protocol / client / transport 定向测试通过，`app-server` lib 56 个测试通过。
5. `npm run smoke:electron` 通过，完成 renderer production build、Electron host build、app-server sidecar 准备，并输出 renderer loaded 与 app-server initialized。

2026-06-06 追加 Electron current build / release / CI runtime input guard：

```bash
node --check "scripts/electron/current-entrypoints.test.mjs"
npx vitest run "scripts/electron/current-entrypoints.test.mjs" --silent=passed-only --disableConsoleIntercept
npx vitest run "scripts/electron/current-docs-guard.test.mjs" "scripts/electron/current-rules-guard.test.mjs" --silent=passed-only --disableConsoleIntercept
npx prettier --check "scripts/electron/current-entrypoints.test.mjs"
npm run test:contracts
git diff --check -- "scripts/electron/current-entrypoints.test.mjs" "internal/roadmap/appserver/testing-migration.md"
```

这组证据证明：

1. `scripts/electron/current-entrypoints.test.mjs` 已递归扫描 `.github/` 与 `electron/`，并覆盖 Electron build / package / release / updater / smoke / version current 入口。
2. current Electron 构建、发布、CI 与 host 文件不得重新消费旧宿主 config、CLI、全局对象、runtime marker 或命令宏。
3. `npm run test:contracts` 通过，`mock priority commands: 0`，确认这次守卫补强没有让生产 bridge 回退 mock 或旧宿主路径。

2026-06-06 追加 root Tauri GUI app 删除与 Rust layer virtual workspace 口径：

```bash
node --check "scripts/rust-test-layer-classifier.mjs" "scripts/run-rust-layer.mjs" "scripts/electron/current-entrypoints.test.mjs"
npx vitest run "scripts/rust-test-layer-classifier.test.mjs" "scripts/lib/legacy-surface-report-core.test.ts" "scripts/electron/current-entrypoints.test.mjs" --silent=passed-only --disableConsoleIntercept
node "scripts/run-rust-layer.mjs" unit --list --json
```

这组证据证明：

1. `lime-rs/build.rs`、`lime-rs/src/main.rs`、`lime-rs/src/lib.rs`、`lime-rs/tauri.conf.json`、`lime-rs/tauri.conf.headless.json` 已按 `dead` root GUI app entry 删除。
2. `scripts/electron/current-entrypoints.test.mjs` 已守住这些 root app entry files 不能重新出现；Desktop current 只允许 Electron / App Server 入口。
3. Rust layer classifier 现在按 virtual workspace 事实源识别真实 `crates/*` package；无 root `[package]` 时，`lime-rs/src` 残留旧模块只计为 `unmanaged-root` 治理统计，不再进入默认 Rust test 执行口径。

2026-06-07 追加 retired Windows host config current 回流守卫：

```bash
node --check "scripts/electron/current-entrypoints.test.mjs"
npx vitest run "scripts/electron/current-entrypoints.test.mjs" --silent=passed-only --disableConsoleIntercept
rg -n "lime-rs/tauri.windows.conf|tauri.windows.conf" "package.json" "forge.config.mjs" ".github" "electron" "scripts/check-app-version-consistency.mjs"
git diff --check -- "scripts/electron/current-entrypoints.test.mjs" "internal/roadmap/appserver/testing-migration.md"
```

这组证据证明：

1. `lime-rs/tauri.windows.conf.json` 已按 `dead` Windows 旧宿主配置删除，不能回流 package scripts、Electron Forge、CI、Electron host、版本一致性检查或 i18n app metadata evidence。
2. `scripts/electron/current-entrypoints.test.mjs` 已把该 Windows 旧宿主配置加入 retired build input 禁止词，并扫描 Electron current build / release / CI / host 文件。
3. `scripts/electron/release-workflow-guard.mjs` 同步阻止旧 Tauri / NSIS 配置文件实体回流；后续只允许 Forge Squirrel 与 `RELEASES` / `.nupkg` / Setup 作为 Windows current release surface。
