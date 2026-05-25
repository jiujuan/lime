## Lime v1.50.0

发布日期：`2026-05-25`
递交范围：`v1.49.0` 之后的发布收口与 Managed Objective / Task Center 主线推进。本版只保留当前 release note 事实源，旧 `v1.49.0` 发布说明不再作为当前发布说明保留。

### 发布概览

- 应用版本从 `1.49.0` 升级到 `1.50.0`，同步 `package.json`、`package-lock.json`、`packages/lime-cli-npm/package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 与 `src-tauri/tauri.conf.headless.json`。
- Managed Objective 主链落地：新增 objective client / API、objective 面板、task center tab projection、continue / pause / resume / clear 操作，以及相关 workspace 预取与导航 runtime。
- Runtime turn 与 session store 收口：补齐 objective、subagent context、auto compaction、evidence / replay / handoff 相关投影，统一 agent runtime 读模型与前端协议。
- GUI / smoke / governance 配套同步：agent runtime client、command manifest、mock priority、governance schema 与 i18n 文案一并更新，发布前冒烟链路更稳定。

### 用户可见更新

- Task Center / Workspace 能直接查看和操作 Managed Objective，支持设置目标、继续推进、暂停、恢复、清除与完成状态切换。
- 历史会话、任务标签页和输入栏上下文切换更稳，减少旧预取链路对当前会话的干扰。
- Agent runtime 相关状态、按钮文案与提示在五种语言资源中同步更新。

### 开发者与治理更新

- `src/lib/api/agentRuntime` 新增 objective 客户端与类型导出，前后端协议更完整。
- `src/lib/governance/agentCommandCatalog.json`、`src/lib/governance/agentRuntimeCommandSchema.json`、`src/lib/tauri-mock/*` 与生成的客户端声明同步刷新。
- GUI smoke 相关脚本补了更稳的锁、种子和预取策略，降低并发与环境差异带来的误报。

### 当前校验状态

- 通过：`cargo fmt --manifest-path "src-tauri/Cargo.toml" --all -- --check`
- 通过：`CARGO_TARGET_DIR="/tmp/lime-codex-target" cargo test --manifest-path "src-tauri/Cargo.toml"`
- 通过：`CARGO_TARGET_DIR="/tmp/lime-codex-target" cargo clippy --manifest-path "src-tauri/Cargo.toml" --all-targets -- -D warnings`
- 通过：`npm run lint`
- 通过：`npm test`
- 通过：`npm run test:contracts`
- 通过：`npm run verify:app-version`
- 通过：`git diff --check`
- 通过：`npm run bridge:health -- --timeout-ms 120000`
- 通过：`npm run verify:gui-smoke -- --reuse-running --timeout-ms 900000`

**完整变更**: `v1.49.0` -> `v1.50.0`
