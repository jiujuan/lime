# Aster 能力接收迁移执行计划

状态：in_progress  
创建时间：2026-07-05  
策略文档：`internal/roadmap/astermigration/aster-capability-intake-strategy.md`  
路线图：`internal/roadmap/astermigration/README.md`

## 主目标

按能力接收矩阵继续迁移 Aster：把 Lime 当前需要的 agent / provider / tool / session 能力迁入 Lime-owned current crates，迁完一批就删除 vendored Aster 中对应重复实现和测试，并用治理守卫阻止回流。Aster 只保留仍被 `lime-agent` compat adapter 编译依赖的最小面，最终删除 root workspace `aster` dependency。

## 本计划的事实源声明

后续迁移只能向以下 current owner 收敛：

- `agent-runtime`：turn orchestration、agent action、subagent 编排、runtime event stream。
- `agent-protocol`：稳定 wire DTO、event/action/read model、provider/tool/session 共享协议。
- `model-provider`：provider registry、provider request/response、reply stream、模型能力描述。
- `tool-runtime`：tool definition、registry executor、permission preflight、shell/process/MCP bridge、tool result/error。
- `thread-store`：session、thread、turn、message、runtime snapshot、artifact/checkpoint persistence。
- App Server JSON-RPC：桌面 GUI / evidence / replay / analysis 的唯一 runtime 入口。

vendored Aster 只允许作为 `compat-blocker` 或 `valuable-reference`，不得继续作为 current runtime 事实源。

## 当前基线

最新校准口径：整体目标完成度约 `93%`，不能按 `99%` 汇报。

已完成：

- `agent-protocol`、`model-provider`、`thread-store`、`tool-runtime`、`agent-runtime` 一等 workspace crate 骨架已建立。
- `app-server` / `services` / `server` / `scheduler` 已基本迁出 direct Aster dependency。
- tool execution policy、shell/path/process/shell runtime 等多批能力已迁入 `tool-runtime`。
- WebSearch / WebFetch current executor 已进入 `tool-runtime`；WebSearch 已被 WebSearch preflight 与 workspace patch host 两条 Lime 后端主链真实消费，WebFetch 通过 vendor Aster tool adapter 进入当前 Aster reply loop 工具调用面。
- `agent_tools/tool_orchestrator/aster_registry_adapter.rs` 已删除；`tool_orchestrator` 工具批执行不再依赖 Aster `ToolRegistry` / `ToolContext` / `SandboxConfig`。
- vendored Aster 中已迁出的 `path_guard`、`command_semantics`、`subprocess`、`shell_runtime`、WebFetch/WebSearch fetch/search/cache/content 等重复实现已删除或替换为 current owner 委托，并已有守卫防回流。
- provider stream current handle 已进入现有 `provider_trace` 后端 / 前端 / metrics 主链；这不是空 DTO 迁移，但 Aster provider/reply adapter 仍未删除。
- `RuntimeReplyStreamRequest` 已进入 pinned provider stream 执行入参，`ConfiguredReplyProvider::stream_reply_with_agent(...)` 会校验并记录 current request；不再只是 `aster_reply_adapter.rs` 的 debug-only DTO。
- `ReplyInput` / `ReplyInputImage` / `ActionRequiredResponseInput` / `ReplyAttemptInput` 已迁到 `agent-runtime::reply_input` current owner；`request_tool_policy.rs` 与 `agent_reply_stream.rs` 直接消费 current input contract。
- `RuntimeReplyStreamEvent` 已迁到 `agent-runtime::reply_stream` current owner；`aster_reply_adapter.rs` 只产出该 current envelope，不再定义 reply stream event enum。
- `agent_reply_stream.rs` 主循环已只消费 `RuntimeReplyStreamEvent` / `RuntimeAgentEvent` current stream；Aster event projection 与 inline provider error suppression 已收回到 `aster_reply_adapter.rs` / `aster_event_adapter.rs` compat 边界。
- `RuntimeReplyStreamHost` / `RuntimeReplyPolicyHost` / `RuntimeReplyStartError` 已迁到 `agent-runtime::reply_host` current owner；`request_tool_policy.rs` 的 stream policy 主编排只接收 current host contract，不再知道 `AsterReplyRuntimeHost` 具体类型。
- `RuntimeReplyAttemptError` / `RuntimeReplyExecution` 已迁到 `agent-runtime::reply_execution` current owner；`request_tool_policy.rs` 只保留 `ReplyAttemptError` / `StreamReplyExecution` re-export，不再本地定义 runtime execution DTO。
- `turn_context_configuration.rs` 已只保留 Lime current `AgentTurnContext` builder / helper；Aster `TurnContextOverride` 双向转换收进 `turn_context_configuration/aster_adapter.rs` compat 边界。
- `agent-runtime::session_recent` / `agent-runtime::session_execution` 已承接 session recent DTO、session execution projection DTO 与 runtime timeline snapshot projection contract；`lime-agent` 只保留类型别名和 Aster adapter 转换。
- `session_store_runtime_detail.rs` 已改为消费 `runtime_support::load_runtime_snapshot_overlay` 返回的 current runtime overlay，不再直接读取 Aster `SessionRuntimeSnapshot` 或调用 Aster projection 函数。

仍阻塞 Phase 6：

- root workspace 仍有 `aster = { package = "aster-core", path = "vendor/aster-rust/crates/aster" }`。
- `lime-agent` 仍有 `aster.workspace = true`。
- `lime-agent` 内 provider/reply、native tool overlay/tool inventory、session/thread store、agent turn loop 仍存在 Aster compat adapter；WebFetch/WebSearch 已不再是 vendor duplicate blocker，但仍通过 Aster `Tool` trait 注册壳服务未迁出的 reply loop。`Agent::reply` / Aster `Message` / provider trait 仍未迁出，root `aster` dependency 还不能删。

## 写集边界

默认允许写集：

- `internal/roadmap/astermigration/**`
- `src/lib/governance/asterMigrationBoundary.test.ts`
- `lime-rs/crates/agent-protocol/**`
- `lime-rs/crates/model-provider/**`
- `lime-rs/crates/tool-runtime/**`
- `lime-rs/crates/thread-store/**`
- `lime-rs/crates/agent-runtime/**`
- `lime-rs/crates/agent/src/**` 中明确列入本计划的 compat adapter 和调用点
- `lime-rs/vendor/aster-rust/crates/aster/**` 中已迁能力的重复实现、re-export、测试和依赖
- 相关 `Cargo.toml` / `Cargo.lock`

避让规则：

- 并行进程正在改的 Rust 文件，动手前先 `git status --short -- <path>` 和 `sed -n` 读取现状。
- 不回退用户或其他进程改动。
- 同一批只收一条主链，避免同时改 provider、tool、session 三条大链造成冲突。

## 批次计划

### Batch A：Provider / Reply Loop 接收

状态：in_progress

目标：

- 把 reply stream、provider request/response、provider metadata 从 Aster DTO 收敛到 `model-provider` / `agent-runtime`。
- 让 `request_tool_policy/aster_reply_adapter.rs` 与 `credential_bridge/runtime_provider_adapter.rs` 退化为最小边界 adapter，随后删除。

主要写集：

- `lime-rs/crates/model-provider/**`
- `lime-rs/crates/agent-runtime/**`
- `lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs`
- `lime-rs/crates/agent/src/credential_bridge/runtime_provider_adapter.rs`
- `src/lib/governance/asterMigrationBoundary.test.ts`

退出条件：

- current provider stream contract 不 import Aster。
- current provider handle metadata 必须进入 App Server / 前端已消费的 `provider_trace` 主链，不能只停在后端 debug log。
- `lime-agent` provider/reply 生产调用只消费 Lime DTO。
- Aster provider DTO 只允许出现在单一 compat adapter，且 adapter 有删除条件。
- 对应定向 Rust 测试和治理守卫通过。

验证入口：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package agent-runtime --package lime-agent -- --check
cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib
npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
```

### Batch B：Tool Registry Executor 接收

状态：mostly_completed / residual_in_reply_loop

目标：

- 保持 `tool_orchestrator` 工具批执行只调用 Lime `RuntimeToolExecutor`，不得恢复 Aster registry adapter。
- 把 Aster reply loop 内 native tool registry、WebFetch / WebSearch `Tool` trait adapter 和剩余 tool result 映射继续迁入 `tool-runtime`。

主要写集：

- `lime-rs/crates/tool-runtime/**`
- `lime-rs/crates/agent/src/agent_tools/**`
- `lime-rs/crates/agent/src/native_tools/**`
- `lime-rs/vendor/aster-rust/crates/aster/src/tools/**` 中已迁重复实现
- `src/lib/governance/asterMigrationBoundary.test.ts`

退出条件：

- `tool_orchestrator` 生产代码不再直接构造 Aster registry/context/error，且 `agent_tools/tool_orchestrator/aster_registry_adapter.rs` 保持不存在。
- `tool-runtime` 提供 current tool definition、execution request、execution result、error 分类和 policy metadata。
- Aster reply loop 内 WebFetch / WebSearch / native tool 调用不再依赖 Aster `Tool` trait 注册壳。
- 已迁 vendor tool runtime 重复实现和测试删除。
- 守卫禁止恢复 vendor public wrapper、`tool_orchestrator` direct Aster registry import 和已删除 registry adapter 文件。

验证入口：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check
cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator --lib
cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core tools::bash --lib
npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
```

### Batch C：Session / Thread Store 接收

状态：in_progress

目标：

- 把 Aster session/thread/turn/message/runtime snapshot DTO 和 persistence contract 下沉到 `thread-store` / `agent-protocol`。
- 删除 `aster_session_store` 和 session/subagent runtime snapshot compat adapter。

主要写集：

- `lime-rs/crates/thread-store/**`
- `lime-rs/crates/agent-protocol/**`
- `lime-rs/crates/agent/src/aster_session_store/**`
- `lime-rs/crates/agent/src/session_*`
- `lime-rs/crates/agent/src/subagent_*`
- `src/lib/governance/asterMigrationBoundary.test.ts`

退出条件：

- session read model、runtime snapshot、thread persistence 不暴露 Aster public type。
- `aster_session_store` 无生产消费者后删除。
- `thread-store` 覆盖原 vendor session 行为测试的必要场景。
- root `aster` dependency 删除前的 session 阻塞项清零。

验证入口：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" --package thread-store --package agent-protocol --package lime-agent -- --check
cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_store --lib
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_execution_runtime --lib
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent subagent --lib
npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
```

### Batch D：Agent Turn Loop / Subagent Runtime 接收

状态：pending

目标：

- 把 agent turn executor、runtime event stream、subagent control 迁到 `agent-runtime`。
- 让 App Server 只依赖 Lime runtime interface，不通过 `lime-agent` 暴露 Aster turn loop 语义。

主要写集：

- `lime-rs/crates/agent-runtime/**`
- `lime-rs/crates/agent-protocol/**`
- `lime-rs/crates/agent/src/runtime_facade.rs`
- `lime-rs/crates/agent/src/aster_runtime_projection*`
- `lime-rs/crates/app-server/**` 中 runtime interface 调用点
- `src/lib/governance/asterMigrationBoundary.test.ts`

退出条件：

- App Server runtime backend 不依赖 Aster event/session/provider/tool 类型。
- `lime-agent` 中 Aster turn loop 只剩删除前 adapter 或完全移除。
- GUI、evidence、replay、analysis 继续消费 current read model。

验证入口：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package agent-protocol --package lime-agent --package app-server -- --check
cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent event_converter --lib
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend --lib
npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
```

### Batch E：Valuable Reference 盘点与 Vendor 清空

状态：pending

目标：

- 对 MCP、skills、hooks、memory/context 等暂未完整产品化能力做接收判断。
- 需要的能力迁入 current owner；不需要作为 current 的能力只留设计记录，不保留编译依赖。
- 删除 root workspace `aster` dependency 和 `lime-agent` 的 `aster.workspace = true`。

主要写集：

- `internal/roadmap/astermigration/**`
- `lime-rs/Cargo.toml`
- `lime-rs/crates/agent/Cargo.toml`
- `lime-rs/vendor/aster-rust/**`
- `src/lib/governance/asterMigrationBoundary.test.ts`

退出条件：

- `rg -n "use aster::|aster::|aster_models::|aster.workspace|package = \"aster-core\"" "lime-rs/crates"` 无 production 命中。
- `lime-rs/Cargo.toml` 不再声明 root `aster` workspace dependency。
- vendored Aster 不再参与 Lime workspace 编译。
- 治理守卫把 `lime-rs/crates/aster-rust/**` 和 `vendor/aster-rust` 回流都判为 forbidden-to-restore。

验证入口：

```bash
cargo metadata --manifest-path "lime-rs/Cargo.toml" --format-version 1 --no-deps
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent
npm run test:rust:changed
npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
```

## 进度日志

### 2026-07-06：Batch C session execution runtime Aster trait 泄漏收口

- `completed`：`session_execution_runtime.rs` 删除对 `aster::session::ExtensionState` 的直接依赖；`SessionExecutionRuntimeAccessMode` 由 `agent-runtime::session_recent` 提供，不再在 `lime-agent` 主 DTO 文件实现 Aster trait。
- `completed`：最近 access mode / preferences / team selection / harness context DTO 与 metadata parser 已迁入 `agent-runtime::session_recent` current owner；`lime-rs/crates/agent/src/session_execution_runtime/recent_context.rs` 与 `lime-rs/crates/agent/src/session_execution_runtime/recent_settings.rs` 已删除。
- `completed`：`SessionExecutionRuntimeSessionProjection` / `SessionExecutionRuntimeSnapshotProjection` / `SessionExecutionRuntimeTurnProjection` 已迁入 `agent-runtime::session_execution` current owner；`session_execution_runtime.rs` 只保留绑定 `AgentTokenUsage` / `AgentTurnContext` 的 crate 内类型别名。
- `completed`：`RuntimeTimelineSnapshotProjection` 已迁入 `agent-runtime::session_execution`，通过泛型避免 `agent-runtime` 反向依赖 `lime-core` DAO；`runtime_snapshot_adapter.rs` 只保留 Aster snapshot 到 current projection 的转换。
- `completed`：新增 `RuntimeSessionSnapshotOverlay` current contract；`runtime_support::load_runtime_snapshot_overlay(...)` 在兼容边界内读取 Aster snapshot 后立即投影为 execution snapshot + timeline snapshot。
- `completed`：`session_store_runtime_detail.rs` 改为只消费 current overlay；该主链不再直接 import / call `project_aster_runtime_snapshot`、`project_aster_session_execution_runtime_snapshot` 或 `load_runtime_snapshot`。
- `completed`：Aster extension data 的读取兼容实现集中到 `session_execution_runtime_adapter.rs`；该 adapter 改为按 versioned key 显式读取 JSON，不再要求 current DTO 实现 Aster `ExtensionState` trait。
- `completed`：`asterMigrationBoundary.test.ts` 已把 `session_execution_runtime.rs`、`agent-runtime/src/session_recent.rs` 与 `agent-runtime/src/session_execution.rs` 纳入“已迁文件不得重新直接依赖 Aster”守卫。
- `completed`：`asterMigrationBoundary.test.ts` 已补 `session_store_runtime_detail` overlay 守卫，防止主链重新消费 Aster snapshot DTO 或直接调用 Aster projection 函数。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check`。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime`，20 个测试通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime session_execution --lib`，3 个 current owner 单测通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime session_recent --lib`，4 个 current owner 单测通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_execution_runtime --lib`，24 个相关测试通过；仍有既有 `WorkspaceToolSurface` unused import warning。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`。
- `remaining`：`runtime_support.rs` 仍在 compat 边界内读取 Aster `SessionRuntimeSnapshot`；`subagent_control.rs` 仍通过 `load_runtime_snapshot` + `subagent_runtime_adapter.rs` 消费 Aster snapshot。下一刀应把 subagent latest-turn projection 也收进 current overlay 或 runtime_support 投影入口。

### 2026-07-06：文档事实源校准

- `completed`：同步 `README.md`、`2026-07-05-progress-reality-check.md`、能力接收策略和本执行计划的当前口径：整体目标完成度按退出条件约 `89%`，不能按 `99%` 或完成态汇报。
- `completed`：把已删除的 `agent_tools/tool_orchestrator/aster_registry_adapter.rs` 从 `compat-blocker` 移入 `dead / deleted` 口径；`tool_orchestrator` 工具批执行不得恢复 Aster registry adapter。
- `completed`：把剩余 tool blocker 改写为 Aster reply loop 内 native tool registry / WebFetch / WebSearch `Tool` trait adapter，而不是继续指向已删除的 `tool_orchestrator` adapter。
- `remaining`：root workspace `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster `Agent::reply` / provider trait / Message / AgentEvent 转换、session store / subagent adapter 仍是 Phase 6 blocker。
- `next`：下一刀优先 Batch A/D provider / reply loop；如切工具链，只处理 Aster reply loop native tool 注册壳，不再围绕已迁 shell helper 或已删除 adapter 做小修。

### 2026-07-05：计划文件创建

- `completed`：新增本执行计划，把 `aster-capability-intake-strategy.md` 中的能力接收矩阵转成 Batch A-E 可执行迁移批次。
- `completed`：明确下一刀优先从 Batch A Provider / Reply Loop 开始，而不是继续清零散 helper。
- `guardrail`：本计划要求每批迁移都同步 current owner、调用点、vendor 删除、守卫和验证；不允许只平移 adapter 或只删 vendor。

### 2026-07-06：Batch A/D reply host current 抽象落地

- `completed`：新增 `agent-runtime::reply_host`，承接 `RuntimeReplyStreamHost`、`RuntimeReplyStartError`、`RuntimeReplyStream` / `RuntimeReplyStartResult` current contract；该 crate 不依赖 Aster。
- `completed`：`RuntimeReplyPolicyHost` 已上移到 `agent-runtime::reply_host`，承接 runtime status emission 与 cancelled turn marker policy hook；`lime-agent` 不再本地定义该 host trait。
- `completed`：`request_tool_policy.rs` 的 `stream_message_reply_with_policy_with_options(...)` 与 runtime status retry 逻辑改为接收 `agent-runtime` current host contract，不再 import / 接收 `AsterReplyRuntimeHost` 具体类型。
- `completed`：`AsterReplyRuntimeHost` 退回 `aster_reply_adapter.rs` compat 边界，只负责 Aster `Agent::reply` / `Message` / event projection / cancel marker 的适配，实现 current host contract。
- `completed`：治理守卫补充 `request_tool_policy.rs` 不得回退 `AsterReplyRuntimeHost` 具体类型、`agent_reply_stream.rs` 必须走 current reply host contract、Aster provider backend 只能停在 compat adapter。
- `verified`：
  - `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check`
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime`
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib`
  - `npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`
- `remaining`：Aster `Agent::reply`、Aster `Message`、Aster `AgentEvent`、Aster provider trait object 仍在 `aster_reply_adapter.rs` / `credential_bridge/runtime_provider_adapter.rs` compat 边界，root `aster` dependency 仍不能删除。
- `next`：继续 Batch A，优先把 provider backend / reply stream request 的 Aster trait object 创建再收窄；随后再切 Batch B 的 reply loop native tool registry 壳。

### 2026-07-06：Batch A/D reply execution result current owner 落地

- `completed`：新增 `agent-runtime::reply_execution`，承接 `RuntimeReplyAttemptError` 与 `RuntimeReplyExecution`。这些类型描述 reply 执行结果、错误 emission 状态、attempt summary 和 cancel 状态，不依赖 Aster。
- `completed`：`request_tool_policy.rs` 删除本地 `ReplyAttemptError` / `StreamReplyExecution` struct，改为 re-export `agent-runtime` current owner；现有 `lime-agent` public surface 通过别名维持调用侧类型名，但事实源已经迁出 Aster-adjacent 策略主文件。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `agent-runtime/src/lib.rs` 导出 `reply_execution`，要求 `agent-runtime/src/reply_execution.rs` 定义 current DTO 且不含 Aster，并禁止 `request_tool_policy.rs` 恢复本地 reply execution DTO。
- `verified`：
  - `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check`
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime`
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib`
  - `npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`
- `remaining`：这一步继续削薄 Batch A/D 的 Lime-owned reply contract，但没有删除 root `aster` dependency。Aster `Agent::reply` / `Message` / `AgentEvent` / provider trait object 仍留在 compat adapter；下一刀继续向 provider backend / session-store 或 turn-loop 接收推进。

### 2026-07-06：Turn context Aster conversion 收回 compat 子模块

- `completed`：`turn_context_configuration.rs` 不再直接构造或解析 Aster `TurnContextOverride` / `TurnOutputSchemaSource`；该文件只保留 `AgentTurnContext` request builder、output schema helper 与 metadata helper。
- `completed`：新增 `turn_context_configuration/aster_adapter.rs`，作为唯一 Aster turn context conversion 边界，供现有 `session_config_adapter.rs`、`runtime_facade.rs`、`event_converter.rs`、`session_execution_runtime_adapter.rs` 继续通过原 re-export 消费。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `turn_context_configuration.rs` 纳入已迁 current 文件，禁止其恢复 `aster::session::TurnContextOverride` / `TurnOutputSchemaSource`；同时要求 Aster DTO conversion 只能出现在 `turn_context_configuration/aster_adapter.rs`。
- `verified`：
  - `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check`
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_state_support --lib`
  - `cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server`
  - `npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`
- `classification`：`current` 是 `turn_context_configuration.rs` / `agent_protocol::turn_context::TurnContextOverride`；`compat` 是 `turn_context_configuration/aster_adapter.rs`；`dead / guarded` 是 current helper 文件直接引用 Aster turn context DTO。
- `remaining`：runtime facade 与 session adapters 仍会通过 re-export 调用 Aster conversion，root `aster` dependency 不因此删除。下一刀应继续把 session/runtime snapshot adapter 或 provider/reply loop adapter 收窄。
- `next`：进入 Batch A，先盘点 `request_tool_policy/aster_reply_adapter.rs` 与 `credential_bridge/runtime_provider_adapter.rs` 的 Aster DTO 面，再定义 `model-provider` / `agent-runtime` current provider stream contract。

### 2026-07-05：Batch A provider stream handle current contract

- `completed`：新增 `model-provider::provider_stream`，定义 `RuntimeReplyProviderHandle`、`RuntimeReplyProviderIdentity`、`RuntimeReplyProviderCapabilities`、`RuntimeReplyStreamRequest`、`RuntimeReplyInputKind` 与 `RuntimeProviderBackend`。这些 DTO 不依赖 Aster，作为 provider/reply stream 后续接收的 current contract。
- `completed`：`ConfiguredReplyProvider` 现在同时持有 current `RuntimeReplyProviderHandle` 和内部 Aster `Provider` trait object；Aster provider trait 仍只作为 `RuntimeProviderBackend::AsterCompat` 的内部 backend，不再是唯一可传递 handle。
- `completed`：`request_tool_policy/aster_reply_adapter.rs` 在启动 reply stream 前构造 `RuntimeReplyStreamRequest`，用 current DTO 记录 session、input kind、message chars 与 pinned provider handle；Aster message / event 转换仍保留在该 compat adapter。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 provider stream contract 守卫，要求 `provider_stream` 归属 `model-provider` 且不引入 Aster 类型，并要求 `ConfiguredReplyProvider` 持有 current handle。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package lime-agent -- --check` 通过。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider` 通过，`19 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，`27 passed`；存在既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，`61 passed`；同样存在既有 unused import warning。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`81 passed`。
- `remaining`：Batch A 尚未完成。Aster `Provider` trait、`Agent::reply_with_provider`、Aster `Message` / `AgentEvent` 仍在 `runtime_provider_adapter.rs` 与 `aster_reply_adapter.rs` 内部 compat 面；下一刀要把 provider request/response/stream event contract 继续迁到 `model-provider` / `agent-runtime`，再压缩或删除这两个 adapter。

### 2026-07-05：Batch A provider handle 接入 provider_trace 主链

- `completed`：`RuntimeProviderBackend` 增加稳定 wire value；pinned provider reply stream 在 `agent_reply_stream` 中把 current `RuntimeReplyProviderHandle` 投射进现有 `provider_trace` 事件，包含 `runtime_provider_backend`、`runtime_provider_selector`、`runtime_provider_protocol`、`runtime_provider_active_model`。
- `completed`：App Server 继续通过既有 `runtime_backend/tool_events.rs` 把 `provider_trace` 发给 RuntimeCore / GUI，不新增第二种 provider 事件；前端 `agentProtocol`、`appServerEventStream`、`agentStreamRuntimeMetricsController` 与 `agentStreamTurnEventBinding` 已读取并记录这些 provider handle metadata。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 provider stream 守卫，要求 current provider handle metadata 必须经过 Rust protocol、App Server provider event、前端协议 normalizer 和 metrics 绑定；禁止 provider handle 只停留在 debug log。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package lime-agent --package app-server -- --check` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider` 通过，`19 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，`61 passed`；仍有既有 `WorkspaceToolSurface` unused import warning。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server provider_trace_stage_maps_to_provider_runtime_event --lib` 通过，`1 passed`。
- `verified`：`npx vitest run "src/lib/api/agentRuntime/appServerEventStream.test.ts" "src/lib/api/agentProtocol.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeMetricsController.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`40 passed`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`81 passed`。
- `remaining`：Batch A 仍是 `in_progress`。Aster `Provider` trait、Aster `Message` / `AgentEvent` 转换、`Agent::reply` / `reply_with_provider` 调用仍集中在 `credential_bridge/runtime_provider_adapter.rs`、`request_tool_policy/aster_reply_adapter.rs` 与 `event_converter.rs`；这些是后续删除 root `aster` dependency 的 provider/reply `compat-blocker`。

### 2026-07-05：MCP bridge Aster client public surface 收窄

- `completed`：`lime-agent` 根 API 不再 `pub mod mcp_bridge`；MCP bridge 仍通过 `AgentRuntimeState::sync_mcp_bridges(...)` 作为 current 同步入口被 runtime 内部消费。
- `completed`：`mcp_bridge::McpBridgeClient` 和构造函数从 public API 收为 private；Aster `McpClientTrait` / `ExtensionConfig::Builtin` 只留在 `mcp_bridge` 这个 compat runtime registry 内部，不再作为跨 crate 可见 surface。
- `completed`：删除 `McpBridgeClient` 未读 `name` 字段；bridge 名称只在 Aster extension manager 注册阶段使用，不再保留无行为状态。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `pub mod mcp_bridge;` 回流，并要求 `McpBridgeClient` 不得重新 public。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `verified`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`81 passed`。
- `remaining`：这只是 MCP / extension compat 面收窄，不等于删除 Aster MCP bridge。真正退出条件是 current `tool-runtime` / MCP bridge runtime 接管 extension manager 注册和 tool execution 后，删除 Aster `McpClientTrait` adapter 与 `ExtensionConfig::Builtin` 构造。

### 2026-07-05：Batch B tool execution result/error contract 接收

- `completed`：新增 `tool-runtime::tool_executor`，定义 `RuntimeToolExecutionResult`、`RuntimeToolExecutionError`、`RuntimeToolPolicyErrorKind` 与 `RuntimeToolPolicyErrorClassification`。这批类型直接服务当前工具执行结果、permission denied、policy denied、sandbox blocked 元数据，不是无消费者 DTO。
- `completed`：`agent_tools/tool_orchestrator.rs` 不再定义本地 `ToolPolicyErrorKind` / policy error classifier；shell permission preflight 与 registry executor 错误都消费 `tool-runtime` 的 current 分类结果。
- `completed`：`tool_orchestrator/aster_registry_adapter.rs` 删除 `AsterToolExecutionResult`、`AsterToolExecutionError`、`AsterToolPolicyErrorKind` 这些 Lime 侧重复包装；Aster `ToolResult` / `ToolError` 只在 adapter 内部翻译成 current contract。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `tool_executor` 归属 `tool-runtime`，并禁止 `tool_orchestrator.rs` 恢复本地 `ToolPolicyErrorKind` 或 `AsterToolPolicyErrorKind`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime` 通过，`87 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator --lib` 通过，`15 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`81 passed`。
- `remaining`：Batch B 未完成。`AsterToolRegistryAdapter` 仍依赖 Aster `ToolRegistry` / `ToolContext` / `SandboxConfig`，因此 vendor `tools` core 类型暂不能删除；下一刀应迁 registry executor trait，让 `ToolExecutionBatchInput` 不再持有 `AsterToolRegistryAdapter`。

### 2026-07-05：Batch B tool execution context/request contract 接收

- `completed`：`tool-runtime::tool_executor` 增加 `RuntimeToolExecutionContextInput`、`RuntimeToolExecutionContext`、`RuntimeWorkspaceSandboxInput` 与 `RuntimeToolExecutionRequest`，承接 working directory、session id、cancel token、workspace sandbox metadata 和 registry request contract。
- `completed`：`agent_tools/tool_orchestrator.rs` 的 shell permission preflight、live process、registry fallback 全部改为消费 `RuntimeToolExecutionContext` / `RuntimeToolExecutionRequest`，不再构造 `AsterToolContextInput` / `AsterToolExecutionContext` / `AsterToolExecutionRequest` / `AsterWorkspaceSandboxInput`。
- `completed`：`tool_orchestrator/aster_registry_adapter.rs` 内部把 current context 局部转换为 Aster `ToolContext`，Aster `ToolContext` / `SandboxConfig` / `with_turn_context` 继续只留在 compat adapter 内部。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `tool-runtime` 提供 current context/request contract，要求 `tool_orchestrator.rs` 真实消费这些类型，并禁止 `AsterTool*Context/Input/Request/WorkspaceSandboxInput` 回流到主编排。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime` 通过，`88 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator --lib` 通过，`15 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`81 passed`。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"` 通过。
- `remaining`：Batch B 仍未完成。`ToolExecutionBatchInput.registry` 仍是 `AsterToolRegistryAdapter`，adapter 仍依赖 Aster `ToolRegistry` / `ToolContext` / `SandboxConfig`。下一刀应定义 `RuntimeToolExecutor` trait / executor handle，让 `tool_orchestrator` 只持有 current executor，再把 Aster registry adapter 降为 trait 实现。

### 2026-07-05：Batch B runtime tool executor trait 接收

- `completed`：`tool-runtime::tool_executor` 增加 `RuntimeToolExecutor`、`RuntimeToolExecutorHandle`、`RuntimeToolExecutionFuture` 与 `RuntimeToolTurnContext`，tool execution executor contract 现在归属 current owner。
- `completed`：`ToolExecutionBatchInput` 从 `registry: AsterToolRegistryAdapter` 改为 `executor: RuntimeToolExecutorHandle`；`tool_orchestrator.rs` 只调用 current executor handle，不再持有 Aster registry adapter 类型。
- `completed`：`tool_orchestrator/aster_registry_adapter.rs` 改为 `RuntimeToolExecutor` 的 compat 实现，并删除旧的 `From<Arc<RwLock<ToolRegistry>>> for AsterToolRegistryAdapter` `.into()` 迁移入口；Aster turn context 转换也局限在 adapter 内。
- `completed`：`web_search_preflight` 与 `workspace_patch_runtime_adapter` 的生产调用点改为通过 `runtime_tool_executor_from_aster_registry(...)` 构造 current executor handle，迁移边界显式集中在 adapter helper。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `tool-runtime` 提供 executor trait/handle，要求 `ToolExecutionBatchInput` 持有 `RuntimeToolExecutorHandle`，并禁止主编排恢复 `pub registry: AsterToolRegistryAdapter`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime` 通过，`89 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator --lib` 通过，`15 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`81 passed`。
- `remaining`：Batch B 仍未完成。当前 Aster registry adapter 仍是唯一 executor trait 实现，且仍依赖 Aster `ToolRegistry` / `ToolContext` / `SandboxConfig`；下一刀应把 first-party shell / native tool registry 逐步迁入 current executor 实现，减少 `runtime_tool_executor_from_aster_registry(...)` 的生产调用点。

### 2026-07-05：Batch B WebSearch current executor 与 Aster registry adapter 删除

- `completed`：新增 `tool-runtime::web_search` current owner，提供 `RuntimeWebSearchExecutor`、`runtime_web_search_executor_handle()`、`WEB_SEARCH_TOOL_NAME`、`web_search_tool_definition()` 与 WebSearch 输入 / 搜索结果结构。该实现承接 Aster WebSearch 的 provider 优先级、Tavily / Multi Search Engine / Bing / Google / DuckDuckGo 搜索、域名过滤、TTL cache、结构化 output 与 `web_search` metadata。
- `completed`：`tool-runtime::web_search` 按 facade + `web_search/support.rs` 拆分，两个非生成 Rust 文件分别约 `686` / `706` 行，避免新增超过 `1000` 行的中心文件。
- `completed`：`request_tool_policy/web_search_preflight.rs` 不再通过 `AsterReplyRuntimeHost::tool_registry()` 查 Aster registry，也不再构造 `runtime_tool_executor_from_aster_registry(...)`；预检索现在直接执行 `runtime_web_search_executor_handle()`。`WebSearchPreflightRequest` 去掉 Aster host 字段。
- `completed`：`agent_tools/workspace_patch_runtime_adapter.rs` 不再读取 `AgentRuntimeState -> Agent -> tool_registry()`；workspace patch host tool plan 的 `WebSearch` 执行现在直接走 current WebSearch executor，前端 / App Server 继续通过原有 workspace patch host evidence 主链消费真实检索结果。
- `completed`：删除 `request_tool_policy/aster_reply_adapter.rs` 上已经无生产消费者的 `tool_registry()` escape hatch。
- `completed`：删除 `agent_tools/tool_orchestrator/aster_registry_adapter.rs`。`tool_orchestrator` 单测改用 current `RuntimeToolExecutor` fixture，Aster `ToolRegistry` / `ToolContext` / `SandboxConfig` 不再出现在工具批执行主编排或其测试中。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `tool-runtime` 暴露 `web_search` current module，禁止 `web_search_preflight` / workspace patch runtime adapter 恢复 `runtime_tool_executor_from_aster_registry`、`host.tool_registry()` 或 Aster host/registry 依赖，并要求 `tool_orchestrator/aster_registry_adapter.rs` 文件保持不存在。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime` 通过，`94 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator --lib` 通过，`14 passed`；删除的 1 个测试只覆盖已删除的 Aster sandbox adapter。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent web_search_preflight --lib` 通过，`7 passed`；仍有既有 `WorkspaceToolSurface` unused import warning。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent workspace_patch_host --lib` 通过，`4 passed`；同样存在既有 unused import warning。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`81 passed`。
- `classification`：`current` 是 `tool-runtime::web_search` 与 `RuntimeToolExecutor`；`dead / deleted` 是 `tool_orchestrator/aster_registry_adapter.rs`、`AsterReplyRuntimeHost::tool_registry()`、WebSearch preflight / workspace patch 对 Aster registry executor 的生产调用；`compat-blocker` 仍是 Aster reply loop 内部的 native tool registry。
- `remaining`：不能直接删除 `vendor/aster-rust/crates/aster/src/tools/web.rs` 中的 WebSearch/WebFetch 实现，因为 Aster `Agent::reply` 主循环仍可能让模型直接调用 Aster registry 中注册的 WebSearch/WebFetch。下一刀应在 Batch B / D 交界处处理 Aster reply loop 的 tool call 执行入口：要么让 Aster reply loop 的 WebSearch/WebFetch 调用转发到 current `tool-runtime::web_search` / 后续 `web_fetch`，要么把 reply loop 本身迁到 `agent-runtime` 后再删除 vendor web tool。

### 2026-07-05：Batch B WebFetch current executor 与 vendored Web tool 重复实现清理

- `completed`：新增 `tool-runtime::web_fetch` current owner，提供 `RuntimeWebFetchExecutor`、`runtime_web_fetch_executor_handle()`、`WEB_FETCH_TOOL_NAME`、`web_fetch_tool_definition()`、`WebFetchInput` 与预批准 host 策略。该实现承接 Aster WebFetch 的 HTTPS 升级、私网 / metadata host 阻断、same-host/www redirect、10MB 响应限制、HTML to text、JSON pretty print、动态过滤、15 分钟 TTL cache、结构化 `bytes/code/codeText/result/durationMs/url` output 和 metadata。
- `completed`：`tool-runtime::web_fetch` 按 facade + `web_fetch/content.rs` 拆分，当前文件体量约 `452` / `638` 行，未继续向中心文件堆叠。
- `completed`：`vendor/aster-rust/crates/aster/src/tools/web.rs` 从约 `2700+` 行 WebFetch/WebSearch 执行实现压缩为约 `433` 行 Aster `Tool` trait adapter；Aster reply loop 暂时仍注册 `WebFetchTool` / `WebSearchTool`，但执行已委托 `tool-runtime::web_fetch` / `tool-runtime::web_search` current executor，结果继续通过现有 App Server / GUI tool event 主链被前端消费，不新增 mock 或平行展示入口。
- `deleted`：`vendor/aster-rust/crates/aster/src/tools/web_fetch_content.rs` 已删除，`tools/mod.rs` 移除 `mod web_fetch_content;`。vendored Aster 不再维护 WebFetch 内容清洗 / 动态过滤第二份实现。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `web_fetch.rs` / `web_fetch/content.rs` 纳入已迁移文件 Aster import 守卫；要求 `tool-runtime` 暴露 WebFetch current module；新增 vendored web tool 守卫，禁止恢复 `fetch_url`、`SearchProviderStrategy`、`MultiSearchEngineConfig`、provider-specific `search_with_*`、`web_fetch_content`、`LruCache`、`reqwest` / `scraper` 直接执行等重复实现。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime -- --check` 通过。
- `verified`：`cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" --package aster-core -- --check` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime` 通过，`104 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core tools::web::tests:: --lib` 通过，`8 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent web_search_preflight --lib` 通过，`7 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`82 passed`。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"` 通过。
- `classification`：`current` 是 `tool-runtime::web_fetch` / `tool-runtime::web_search` executor；`compat` 是 vendored Aster `WebFetchTool` / `WebSearchTool` 的 `Tool` trait adapter；`dead / deleted` 是 vendored WebFetch/WebSearch fetch/search/provider/cache/content 重复实现与 `web_fetch_content.rs`；`compat-blocker` 仍是未迁出的 Aster `Agent::reply` native tool registry 注册面。
- `remaining`：Batch B 的 Web tool 重复实现已清，但整体 Aster 依赖还不能删除。下一刀应回到 Batch A / D：迁出 provider/reply loop 的 Aster `Agent::reply` 调用或 native tool registry 注册面，让 WebFetch/WebSearch 的 Aster `Tool` trait adapter 也能进入 `dead / deleted`。

### 2026-07-05：Batch A/D reply stream current event boundary 收窄

- `completed`：`agent_reply_stream.rs` 主循环只消费 `RuntimeReplyStreamEvent` / `RuntimeAgentEvent`，不再直接读取 `AsterAgentEvent`，也不再持有 `RuntimeEventProjector`。
- `completed`：Aster event projection、auto-compaction projection 与 inline provider error suppression 已收回 `aster_reply_adapter.rs` / `aster_event_adapter.rs` compat 边界；`agent_reply_stream.rs` 继续负责 current event 流控、provider trace metadata 补齐、web retrieval synthesis cutover 与 artifact event emission。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `agent_reply_stream.rs` 恢复 `RuntimeEventProjector`、`AsterAgentEvent`、`project_aster_runtime_event`、`project_aster_auto_compaction_event`、`extract_inline_agent_provider_error` 或 `runtime_event_projector.project`，并要求 `aster_reply_adapter.rs` 持有 `RuntimeReplyStreamEvent`、`project_aster_reply_stream`、`RuntimeEventProjector::new` 与 `SuppressedInlineProviderError`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，`61 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`82 passed`。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"` 通过。
- `classification`：`current` 是 `agent_reply_stream.rs` 的 `RuntimeAgentEvent` policy/stream loop；`compat` 是 `aster_reply_adapter.rs` 启动 Aster stream 并投影成 current event；`dead / guarded` 是 `agent_reply_stream.rs` 直接做 Aster event projection 的 surface。
- `remaining`：Batch A/D 尚未完成。真正的 `Agent::reply` / Aster `Message` / provider trait 仍未迁出，root workspace `aster` dependency 和 `lime-agent` 的 `aster.workspace = true` 还不能删除；下一刀应把 reply loop 的 request/response/event contract 继续迁入 `agent-runtime` / `model-provider`，而不是继续只压缩 compat 壳。

### 2026-07-05：Batch A/D reply stream envelope 迁入 agent-runtime

- `completed`：新增 `agent-runtime::reply_stream::RuntimeReplyStreamEvent<E>`，作为 reply stream 的 current envelope contract；该类型不依赖 Aster，也不反向依赖 `lime-agent` 本地协议。
- `completed`：`agent_reply_stream.rs` 改为从 `agent-runtime` 导入 `RuntimeReplyStreamEvent`；`aster_reply_adapter.rs` 删除本地 enum，只负责把 Aster `AgentEvent` 投影成 `RuntimeReplyStreamEvent<RuntimeAgentEvent>`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `agent-runtime/src/lib.rs` 导出 `reply_stream`、要求 `agent-runtime/src/reply_stream.rs` 定义 `RuntimeReplyStreamEvent<E>` 且不含 `aster::`，并禁止 `aster_reply_adapter.rs` 恢复 `enum RuntimeReplyStreamEvent`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime` 通过，`6 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，`61 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`82 passed`。
- `classification`：`current` 是 `agent-runtime::reply_stream::RuntimeReplyStreamEvent<E>`；`compat` 是 `aster_reply_adapter.rs` 中 `BoxStream<anyhow::Result<RuntimeReplyStreamEvent<RuntimeAgentEvent>>>` 的 Aster projection bridge；`dead / guarded` 是 `aster_reply_adapter.rs` 本地 reply stream event enum。
- `remaining`：这仍不是完整 reply loop 迁移。`Agent::reply`、Aster `Message` 构造、Aster provider trait object 与 provider safety wrapper 仍在 compat 边界；下一刀应继续把 reply request/action response input 或 provider stream execution trait 迁到 current owner，并让 Lime 主链真实消费。

### 2026-07-05：Batch A/D reply input contract 迁入 agent-runtime

- `completed`：新增 `agent-runtime::reply_input`，承接 `RuntimeReplyInput`、`RuntimeReplyInputImage`、`RuntimeActionRequiredResponseInput` 与 `RuntimeReplyAttemptInput`。这些类型不依赖 Aster，`RuntimeReplyAttemptInput::runtime_input_kind()` 直接返回 `model-provider` 的 `RuntimeReplyInputKind`。
- `completed`：`request_tool_policy.rs` 删除本地 `ReplyInput` / `ReplyInputImage` 定义，改为 re-export current input contract；`agent_reply_stream.rs` 直接导入 `RuntimeReplyAttemptInput`；`aster_reply_adapter.rs` 删除本地 `ActionRequiredResponseInput` / `ReplyAttemptInput` enum，只保留 `build_aster_reply_attempt_message(...)` 边界转换。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `agent-runtime/src/reply_input.rs` 提供 current input DTO 且不含 `aster::`，要求 `request_tool_policy.rs` 消费 `agent_runtime::reply_input`，并禁止 `aster_reply_adapter.rs` 恢复 `struct ActionRequiredResponseInput`、`enum ReplyAttemptInput` 或 `impl From<ReplyInput> for ReplyAttemptInput`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime` 通过，`8 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，`61 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "provider reply stream handle contract|request_tool_policy 主文件不得重新承接 Aster reply stream loop" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`2 passed`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check` 通过。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"` 通过。
- `blocked`：完整 `npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 当前剩余 1 个失败，落在并行脏写集 `lime-rs/crates/agent/src/session_store_subagent_context.rs` / `session_store_subagent_aster_adapter.rs` 的 subagent session-store 守卫，不属于本 Batch A/D 写集；本轮未夹写该区域。
- `classification`：`current` 是 `agent-runtime::reply_input`；`compat` 是 `aster_reply_adapter.rs` 的 Aster `Message` 转换函数；`dead / guarded` 是 request policy / Aster adapter 本地 reply input DTO。
- `remaining`：`Agent::reply` 调用、Aster `Message` 后端格式、Aster `Provider` trait object 与 provider safety wrapper 仍在 compat 边界。下一刀应把 provider stream execution trait / request execution contract 迁入 current owner，或继续处理 session-store 并行守卫失败后再回到 Batch A/D。

### 2026-07-06：Batch A/D provider stream request 进入执行边界

- `completed`：`ConfiguredReplyProvider::stream_reply_with_agent(...)` 现在接收 `&RuntimeReplyStreamRequest`，在执行 pinned provider stream 前用 current request 校验 provider handle，并记录 `session_id`、`input_kind`、`message_chars`、provider backend/name/model。
- `completed`：`aster_reply_adapter.rs` 启动 Aster reply stream 时把已构造的 `RuntimeReplyStreamRequest` 传入 provider adapter；该 DTO 现在是 provider stream 执行边界入参，不再只用于 debug log。
- `resolved`：把 `session_store_subagent_context.rs` 中错误回流的 Aster `resolve_subagent_session_metadata` / `AsterSession` / customization 解析移回 `session_store_subagent_aster_adapter.rs`；完整 Aster migration boundary 的 1 个遗留失败已清零。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `ConfiguredReplyProvider` 消费 `RuntimeReplyStreamRequest`，并继续要求 `session_store_subagent_context.rs` 不得直接 import Aster session metadata。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package agent-runtime -- --check` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，`27 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，`61 passed`；仍有同一既有 warning。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent build_child_subagent_session --lib` 通过，`2 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime` 通过，`8 passed`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`82 passed`。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"` 通过。
- `classification`：`current` 是 `model-provider::provider_stream::RuntimeReplyStreamRequest` 作为 pinned provider stream 执行入参，以及 `session_store_subagent_context.rs` 的 Lime-owned `SubagentSessionProjection`；`compat` 是 `ConfiguredReplyProvider` 内部 Aster Provider trait object 和 `session_store_subagent_aster_adapter.rs` 的 Aster session projection；`dead / guarded` 是 debug-only provider stream request、current context 直接解析 Aster subagent metadata。
- `remaining`：root `aster` dependency 仍不能删除。`Agent::reply` / `Agent::reply_with_provider`、Aster `Message`、Aster `AgentEvent`、Aster `Provider` trait object 仍在 compat 边界；下一刀应继续把 provider stream execution result/error 或 Aster reply loop host trait 向 `agent-runtime` 收敛，并保持 current DTO 有真实消费者。

### 2026-07-06：Batch A/D pinned provider backend 私有化

- `completed`：`ConfiguredReplyProvider` 不再直接保存 `Arc<dyn aster::providers::base::Provider>`；它现在只保存 `RuntimeReplyProviderHandle` 和私有 `CompatAsterReplyProviderBackend`。
- `completed`：`CompatAsterReplyProviderBackend` 承接 Aster provider trait object 创建、capabilities 读取和 `Agent::reply_with_provider(...)` 调用。裸 Aster provider trait object 继续存在，但只作为 `runtime_provider_adapter.rs` 内部 compat backend，不再是 provider 配置 / request policy 可扩散字段。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `ConfiguredReplyProvider` 持有 `backend: CompatAsterReplyProviderBackend`，并新增结构体级断言，禁止 `ConfiguredReplyProvider` 重新直接保存 `Arc<dyn Provider>`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，`27 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 首次在并行构建锁释放后出现 1 个 provider idle 时序失败；单测重跑通过，完整过滤重跑通过，最终 `61 passed`。该失败未稳定复现，暂不作为本批 blocker。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`82 passed`。
- `classification`：`current` 是 `RuntimeReplyProviderHandle` / `RuntimeReplyStreamRequest`；`compat` 是私有 `CompatAsterReplyProviderBackend`；`dead / guarded` 是 `ConfiguredReplyProvider` 直接持有裸 Aster provider trait object 的字段面。
- `remaining`：这一步没有删除 root `aster` dependency。`Agent::reply` / `Agent::reply_with_provider`、Aster `Message`、Aster `AgentEvent` 与 provider stream body 仍在 compat 边界；下一刀应把 reply execution host/stream runner 继续抽到 `agent-runtime` current contract，或开始迁出 Aster `Agent::reply` 内部 turn loop。

### 2026-07-06：Batch A/D session config current owner 迁入 agent-runtime

- `completed`：新增 `agent-runtime::session_config`，承接 `AgentSessionConfig`、`AgentSessionConfigurationRequest`、`build_agent_session_config(...)` 与 `SessionConfigBuilder`。这些 DTO / builder 不依赖 Aster。
- `completed`：`lime-agent/src/session_configuration.rs` 降为 re-export 入口，不再本地定义 session config DTO 或 builder；`runtime_state_support.rs` 删除本地 `SessionConfigBuilder` 实现。
- `completed`：`session_config_adapter.rs`、`request_tool_policy.rs`、`agent_reply_stream.rs` 与 `aster_reply_adapter.rs` 的内部调用改为直接消费 `agent_runtime::session_config::AgentSessionConfig`；Aster `SessionConfig` 转换仍只留在 `session_config_adapter.rs`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `agent-runtime/src/lib.rs` 导出 `session_config`，要求 `agent-runtime/src/session_config.rs` 提供 DTO / builder 且不含 Aster，并要求 `lime-agent/src/session_configuration.rs` 只 re-export current owner。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime` 通过，`10 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_state_support --lib` 通过，`5 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，`61 passed`；仍有同一既有 warning。
- `verified`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`82 passed`。
- `classification`：`current` 是 `agent-runtime::session_config`；`compat` 是 `lime-agent/src/session_configuration.rs` re-export 和 `session_config_adapter.rs` 的 Aster conversion；`dead / guarded` 是 `runtime_state_support.rs` 本地 builder 实现与 `lime-agent` 本地 session config DTO。
- `remaining`：这一步继续减少 Lime 主链对 Aster DTO 的外层依赖，但 root `aster` dependency 仍由 `Agent::reply` / `Message` / `AgentEvent` / native tool registry / session store compat 持有。下一刀应回到 reply execution host 或 session/thread store，继续把实际 turn loop 和 persistence contract 迁出。
