# Phase 6 剩余项跟踪（第一段）

状态：frozen  
创建时间：2026-07-09  
冻结时间：2026-07-09  
上一份历史执行计划：`aster-capability-intake-execution-plan.md`  
续跟踪文件：`phase6-continuation-tracker.md`  
口径：Codex 有则迁，Codex 没有则删；不保无用户兼容。

## 用途

`aster-capability-intake-execution-plan.md` 已超过 2800 行，本文件承接了 2026-07-09 Phase 6 第一段进度。随着 R2/R3 连续多刀推进，本文件也开始变长，后续不再继续追加长进度。

2026-07-09 起，新的 active tracker 改为 [`phase6-continuation-tracker.md`](./phase6-continuation-tracker.md)。本文件只保留：

- 剩余 blocker。
- 下一刀顺序。
- 第一段进度日志。
- 第一段验证状态。

历史细节仍保留在旧执行计划、`refactor-v1-impact-audit.md` 和新的续跟踪文件中，这里不重复搬运。

## 当前结论

整体目标完成度仍按约 `95%` 口径追踪，不能报 `99%` 或完成态。Aster 已不再是 Lime current runtime owner，但 root `aster` dependency 仍存在，`lime-agent` 仍通过多条 compat adapter 编译依赖 Aster。

已确认的剩余主 blocker：

| ID  | 状态 | 分类            | 剩余项                                                                                                                                                      | current owner / 退出条件                                                                                                                                                  |
| --- | ---- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | open | deprecated      | `lime-rs/Cargo.toml` 仍有 `aster = { package = "aster-core", path = "crates/agent-compat" }`，`lime-agent` 仍有 `aster.workspace = true`                    | 全部生产 `use aster::` 清零后删除 root dependency                                                                                                                         |
| R2  | open | compat blocker  | Aster `Agent::reply` / `reply_with_provider` / `Message` / `AgentEvent` 仍是 reply source backend                                                           | `agent-runtime` / `model-provider` 直接执行 current reply backend，删除 Aster reply adapters                                                                              |
| R3  | open | compat blocker  | `credential_bridge/runtime_provider_adapter.rs` 仍持有 Aster provider trait object，并在最内层 compat backend lowering 到 Aster `Message` / `SessionConfig` | provider trait object / provider stream execution 迁到 `model-provider` current backend                                                                                   |
| R4  | open | compat blocker  | Aster `ToolRegistry` / `Tool` / `ToolContext` / `ToolResult` 仍服务未迁出的 reply loop native tool execution                                                | reply loop 改为直接调用 `tool-runtime::native_dispatch` / gateway executor，删除 `runtime_tool_bridge.rs` / `runtime_overlay.rs` / `gateway_bridge.rs` 的 Aster `Tool` 壳 |
| R5  | open | compat blocker  | Aster `SessionStore` trait、`ThreadRuntimeStore`、runtime store DTO、queue store adapter 仍在 `lime-agent` / `agent-compat` 边界                            | Thread / Turn / Item persistence 只消费 `thread-store` / `agent-runtime` / App Server read model                                                                          |
| R6  | open | compat blocker  | runtime conversation / timeline / event converter 仍从 Aster `TurnRuntime` / `ItemRuntimePayload` / `AgentEvent` 做 source adapter                          | current runtime events 和 Item projection 不再解析 Aster runtime DTO                                                                                                      |
| R7  | open | compat blocker  | Aster `McpClientTrait` / extension manager / built-in extension clients 仍是 reply loop MCP bridge 形状                                                     | MCP request forwarding 和 inventory 全部归 `lime-mcp` / App Server current gateway                                                                                        |
| R8  | open | compat blocker  | `context_mgmt::compact_messages*` 仍被 Aster overflow / slash command path 使用                                                                             | 如果 Codex 对应语义需要，迁到 `agent-runtime` context compaction owner；否则删除 Aster public surface                                                                     |
| R9  | open | cleanup blocker | `agent-compat/src/agents/agent.rs`、`tools/registry.rs`、`session/runtime_store.rs`、`execution/manager.rs` 仍是大体量 staging 文件                         | 前述 R2-R8 迁完后按目录删除或拆到 current owner                                                                                                                           |

## 刚完成的 context 收口

- `agent-compat/src/context` 已收成 17 行：`mod.rs` + `trace.rs`，只保留 `ContextTraceStep`。
- 已删除 `context_service.rs`、`context_uri.rs`、`pruner.rs`、`token_estimator.rs`、`tool_io.rs`、`types.rs` 等 Aster-only / duplicate helper。
- `tool-runtime::tool_io` 是 tool I/O / token / truncation current owner。
- `OverflowHandler` 已删除零调用 progressive pruning path、`OverflowResult` 和 `compaction_attempted()` getter。

验证状态：

- `rg` 残留扫描：`ProgressivePruner|TokenEstimator|ToolIo|PruningConfig|PruningLevel|handle_overflow_with_pruning|OverflowResult|compaction_attempted` 在 `agent-compat/src/context` 和 `overflow_handler.rs` 无命中。
- `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check`：最终已通过。
- `npx prettier --check ...`：已通过。
- `npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`：已通过，`144 passed`。
- `CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="/tmp/lime-aster-context-service-clean-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`：最终复验通过，`Finished dev profile ... in 2m 11s`；仅保留既有 `reqwest default-features` workspace warning。

## 下一刀顺序

优先级按“能最快删除 root `aster` dependency”的杠杆排序：

1. R2 / R3：继续 provider/reply loop。目标是让 `agent-runtime` current backend 直接产出 `RuntimeReplyStreamEvent`，缩短 `aster_reply_backend_adapter.rs`、`aster_reply_message_adapter.rs`、`aster_reply_stream_adapter.rs`。
2. R4：reply loop native tool execution 从 Aster `ToolRegistry` 切到 `tool-runtime` current dispatch，删除临时 `Tool` trait wrapper。
3. R5 / R6：把剩余 session/runtime store source adapter 从 Aster `ThreadRuntimeStore` 迁到 `thread-store` / `agent-runtime`。
4. R7 / R8：MCP extension 和 context compaction 只保留 Codex-current 语义；Codex 无对应或 Lime 无真实消费的 Aster public surface 直接删。
5. R1：生产 `use aster::` 清零后，删除 `lime-agent` 的 `aster.workspace = true` 和 root workspace `aster` dependency。

## 进度日志

### 2026-07-09：拆分 active tracker

- `completed`：冻结 `aster-capability-intake-execution-plan.md` 的长进度日志；后续 Phase 6 剩余项改写入本文件。
- `completed`：列出 R1-R9 剩余 blocker，作为后续继续迁移的 active checklist。
- `completed`：把 context 收口的最终状态和验证状态汇总到本文件，避免继续向旧长计划追加细节。

### 2026-07-09：R2/R3 provider source binding 上提

- `completed`：`agent-runtime::reply_backend` 新增 `RuntimeReplyProviderSourceBindingError` 与 `RuntimeReplyProviderCall::required_provider(...)`，把 provider source path 的“必须存在 configured provider” fail-closed 规则放回 Turn reply backend current owner。
- `completed`：`request_tool_policy/aster_reply_backend_adapter.rs::CompatReplySourceExecutor` 不再用本地 `expect("provider run path requires configured provider")` 持有 provider path 语义，只调用 current `required_provider(...)` 后进入最后一跳 Aster `reply_with_provider(...)`。
- `completed`：`asterMigrationBoundary.test.ts` 增加守卫，要求 provider binding contract 存在于 `agent-runtime`，并禁止 Aster backend adapter 恢复本地 provider path panic。
- `classification`：`current` = `agent-runtime::reply_backend` provider source binding；`compat blocker` = `CompatReplySourceExecutor` 仍调用 Aster `Agent::reply(...)` / `reply_with_provider(...)`；`dead` = adapter 本地 provider path `expect`。
- `next`：继续 R2/R3，把 Aster provider trait object 和 Aster `Message` lowering 再向 `model-provider` / current provider stream backend 收缩；R4 native tool registry 仍排在下一主 blocker。

### 2026-07-09：R2/R3 provider source request payload 上提

- `completed`：`agent-runtime::reply_backend` 新增 `RuntimeReplyProviderSourceRequest<M, C>` 与 `RuntimeReplyProviderCall::into_source_request(...)`，把 provider path 进入 source backend 前的 message / session config / cancel token request payload 放回 Turn owner。
- `completed`：`credential_bridge/runtime_provider_adapter.rs::CompatAsterReplyProviderBackend` 不再直接 `provider_call.into_parts()` 拆 provider start / message / session config / cancel token 四元组；它只消费 current `source_request` 后进入最后一跳 Aster `Agent::reply_with_provider(...)`。
- `completed`：`asterMigrationBoundary.test.ts` 增加守卫，要求 provider source request contract 存在于 `agent-runtime`，并禁止 credential bridge 恢复直接拆 provider call。
- `classification`：`current` = `agent-runtime::reply_backend` provider source request payload；`compat blocker` = `CompatAsterReplyProviderBackend` 仍持有 Aster provider trait object 并调用 `reply_with_provider(...)`；`dead` = credential bridge 直接拆 `provider_call.into_parts()`。
- `next`：继续 R2/R3，把 Aster provider trait object stream execution 迁到 `model-provider` current backend，随后才能删除 `ConfiguredReplyProvider::stream_reply_with_agent(...)` 和 `CompatAsterReplyProviderBackend`。

### 2026-07-09：R2/R3 provider source call boundary 收缩

- `completed`：`request_tool_policy/aster_reply_backend_adapter.rs::CompatReplySourceExecutor` 成为 mapped `RuntimeReplyProviderCall<Message, aster::agents::SessionConfig>` 的唯一 compat 消费点；provider trace 日志、`required_provider(...)` 与 `into_source_request(...)` 均停在 Turn source executor 边界。
- `completed`：`credential_bridge/runtime_provider_adapter.rs::ConfiguredReplyProvider` / `CompatAsterReplyProviderBackend` 不再 import 或接收 `RuntimeReplyProviderCall`，只接收 `RuntimeReplyProviderSourceRequest<Message, aster::agents::SessionConfig>` 后调用最后一跳 Aster `Agent::reply_with_provider(...)`。
- `completed`：`asterMigrationBoundary.test.ts` 增加守卫，禁止 credential bridge 恢复 `RuntimeReplyProviderCall`、`provider_call.trace()` 或 `provider_call.into_source_request()`，并要求 `CompatReplySourceExecutor` 持有 trace / source request handoff。
- `classification`：`current` = `agent-runtime::reply_backend` provider source call / source request contract；`compat blocker` = Aster source executor 与 Aster provider trait object 仍是最后执行边界；`dead` = credential bridge 接收 `RuntimeReplyProviderCall`、读取 provider call trace 或 materialize source request。
- `next`：继续 R2/R3，把 `CompatAsterReplyProviderBackend` 的 Aster provider trait object stream execution 迁到 `model-provider` current backend；R4 native tool registry 仍排在其后。

### 2026-07-09：R2/R3 provider source backend contract 上提

- `completed`：`model-provider::provider_stream` 新增 不依赖 Aster `RuntimeReplyProviderSourceBackendCall<R>`、`RuntimeReplyProviderSourceFuture<'a, S, E>` 与 `RuntimeReplyProviderSourceBackend<H, R>`，把 provider source backend execution contract 放到 provider stream current owner；该 contract 只持有 host/request 泛型，不引入 Aster 类型。
- `completed`：`credential_bridge/runtime_provider_adapter.rs::CompatAsterReplyProviderBackend` 不再用 inherent `stream_reply_with_agent(...)` 承接 execution 语义，改为实现 `RuntimeReplyProviderSourceBackend<Agent, RuntimeReplyProviderSourceRequest<Message, aster::agents::SessionConfig>>`；`ConfiguredReplyProvider::stream_reply_with_agent(...)` 只创建 `RuntimeReplyProviderSourceBackendCall` 并委托 trait impl。
- `completed`：`model-provider` provider stream 单测新增 不依赖 Aster backend contract 回归；`asterMigrationBoundary.test.ts` 要求 source backend contract 存在于 `model-provider`，并禁止 credential bridge 的 compat backend inherent impl 继续持有 `RuntimeReplyProviderSourceRequest` 或直接调用 `reply_with_provider(...)`。
- `classification`：`current` = `model-provider::provider_stream` provider source backend contract；`compat blocker` = Aster `Agent::reply_with_provider(...)`、Aster `Provider` trait object、Aster `Message` / `SessionConfig` 仍在 `lime-agent` compat implementation 内；`dead` = `CompatAsterReplyProviderBackend` 本地 inherent stream execution owner。
- `next`：继续 R2/R3，把 source request payload 中的 Aster `Message` / `SessionConfig` lowering 和 Aster `Agent::reply_with_provider(...)` 最后一跳替换为 current provider/reply backend；之后再进入 R4 native tool registry。

### 2026-07-09：R2/R3 provider source current payload 下压

- `completed`：`AsterReplySource` 不再把整条 `RuntimeReplySourceRun` 通过 `call.map(lower_aster_reply_message, to_aster_session_config)` 提前 lowering 成 Aster DTO；`CompatReplySourceExecutor` 直接实现 `RuntimeReplySourceExecutor<RuntimeReplyMessage, AgentSessionConfig>`，default path 只在调用 Aster `Agent::reply(...)` 前 lowering。
- `completed`：`ConfiguredReplyProvider::stream_reply_with_agent(...)` 和 `CompatAsterReplyProviderBackend` 改为消费 `RuntimeReplyProviderSourceRequest<RuntimeReplyMessage, AgentSessionConfig>`；provider path 的 Aster `Message` / `SessionConfig` lowering 被压到 `CompatAsterReplyProviderBackend::stream_reply(...)` 内部、紧贴最后一跳 `Agent::reply_with_provider(...)`。
- `completed`：`asterMigrationBoundary.test.ts` 增加守卫，禁止 `RuntimeReplyProviderSourceRequest<Message, aster::agents::SessionConfig>` 回到 credential bridge / source backend contract，并禁止 Aster source runner 恢复 `call.map(...)` 的提前 lowering。
- `classification`：`current` = provider source request payload 继续保持 `RuntimeReplyMessage` / `AgentSessionConfig` 到 credential bridge handoff；`compat blocker` = `CompatAsterReplyProviderBackend` 内部仍持有 Aster provider trait object、调用 `Agent::reply_with_provider(...)`，并在最内层 lowering Aster DTO；`dead` = provider source path 在 `AsterReplySource` / `CompatReplySourceExecutor` 层提前 materialize Aster `RuntimeReplyProviderSourceRequest<Message, aster::agents::SessionConfig>`。
- `validation`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package agent-runtime --package lime-agent -- --check` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -- --nocapture` 通过，`20 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -- --nocapture` 通过，`18 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -- --nocapture` 通过，`68 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`144 passed`；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-remaining-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过；`git diff --check -- <本轮写集>` 通过。
- `next`：继续 R2/R3，删除 `ConfiguredReplyProvider::stream_reply_with_agent(...)` 这一层 Aster-host 命名 facade，进一步把 provider trait object execution 替换为 `model-provider` current backend；完成后再进入 R4 native tool registry。

### 2026-07-09：R2/R3 configured provider source backend facade 删除

- `completed`：删除 `ConfiguredReplyProvider::stream_reply_with_agent(...)` 这一层 Aster-host 命名 facade；`ConfiguredReplyProvider` 改为直接实现 `model-provider::provider_stream::RuntimeReplyProviderSourceBackend<Agent, RuntimeReplyProviderSourceRequest<RuntimeReplyMessage, AgentSessionConfig>>`。
- `completed`：`CompatReplySourceExecutor::run_provider(...)` 不再调用 `.stream_reply_with_agent(...)`，改为通过 current `RuntimeReplyProviderSourceBackend::stream_reply(...)` 和 `RuntimeReplyProviderSourceBackendCall::new(source_request)` 委托 configured provider。
- `completed`：`asterMigrationBoundary.test.ts` 增加守卫，禁止 `pub(crate) async fn stream_reply_with_agent` 与 `.stream_reply_with_agent(` 回流；要求 `ConfiguredReplyProvider` 和 `CompatAsterReplyProviderBackend` 都只能通过 `RuntimeReplyProviderSourceBackend` contract 交接。
- `classification`：`current` = `model-provider::provider_stream` source backend contract 现在覆盖 configured provider handoff 与 compat backend implementation 两层；`compat blocker` = `CompatAsterReplyProviderBackend` 内部仍持有 Aster provider trait object、调用 `Agent::reply_with_provider(...)` 并做最内层 Aster DTO lowering；`dead` = `ConfiguredReplyProvider::stream_reply_with_agent(...)` Aster-host facade。
- `validation`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -- --nocapture` 通过，`20 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -- --nocapture` 通过，`68 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`144 passed`。
- `next`：继续 R2/R3，把 `CompatAsterReplyProviderBackend` 的 Aster provider trait object execution 替换为 current provider/reply backend；完成后再进入 R4 native tool registry。
