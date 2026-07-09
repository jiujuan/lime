# Aster Phase 6 Provider Reply Backend Plan

> 状态：active  
> 更新时间：2026-07-10  
> 主路线图：`internal/roadmap/astermigration/phase6-continuation-tracker.md`  
> 当前阶段：R2/R3 provider / reply loop 去 Aster  
> 写集边界：`lime-rs/crates/agent-runtime/src/reply_stream.rs`、`lime-rs/crates/agent/src/request_tool_policy/**`、`src/lib/governance/asterMigrationBoundary.test.ts`、`internal/roadmap/astermigration/phase6-continuation-tracker.md`、`internal/roadmap/astermigration/refactor-v1-impact-audit.md`

## 目标

把 R2/R3 最后一跳固定为明确的 `provider_reply_exit_source` 私有退场模块，并继续为后续把 provider trait object execution 迁到 `model-provider` current backend 做准备。同时补上 Codex-style response event materializer，让非文本 delta、item lifecycle、completed 与 rate limits 先进入 Lime current projection 链。`agent-compat` 是要迁移走的 staging / compat blocker，不是 current owner；本计划不得再把 compat 命名或 `agent-compat` 方向当成完成态。

## Current / Compat / Dead

- `current`：`agent-runtime` provider source request / run call / execution payload contract，`model-provider` provider source backend trait 与 execution wrapper，`agent-runtime::reply_stream::RuntimeReplyResponseEvent` / `RuntimeReplyResponseMaterializer`。
- `transitional current adapter`：`request_tool_policy/agent_reply_stream.rs::runtime_agent_events_from_response_event(...)`，暂时把 response projection 转进现有 `RuntimeAgentEvent` / timeline item 主链；`request_tool_policy/aster_reply_stream_adapter.rs::AsterReplyStreamProjector` 只作为 Aster source adapter，把 Aster message/direct tool-input delta 前移成 current `RuntimeReplyResponseEvent`。
- `compat blocker`：`request_tool_policy/provider_reply_exit_source.rs::ProviderReplyExitSource`，只允许作为删除前唯一私有 Aster provider reply exit source implementation；其退出条件是 provider trait object / provider stream execution 迁到 `model-provider` current backend 后删除。
- `dead / guarded`：`compat_provider_reply_backend.rs`、`CompatProviderReplyBackend`、`CompatReplySource*`、`run_compat_provider_reply_backend(...)`、`Aster*ReplySource`，把 `agent-compat` 当作 current owner 或让 `agent-compat` 新增 current owner 依赖的任何改动，以及 response event 只消费 text delta、吞掉 tool input / reasoning / item / completed / rate limits 的旧形状。

## 本轮任务

1. 源码只保留 `provider_reply_exit_source.rs`，模块入口为 `mod provider_reply_exit_source;`。
2. 退场模块内部命名固定为 `ReplyExitSource`、`ReplyExitSourceExecutor`、`ProviderReplyExitSource`、私有 `run_provider_reply_exit_source(...)`。
3. `aster_reply_backend_adapter.rs` 只能引用 `super::provider_reply_exit_source::ReplyExitSource`，不得恢复 provider source backend impl 或 Aster provider trait import。
4. 治理测试必须同时断言 `provider_reply_exit_source.rs` 存在、`compat_provider_reply_backend.rs` 不存在、旧 `Compat*` / `Aster*ReplySource` 类型和函数名不回流。
5. `lime-rs/crates/agent-compat/**` 只允许发生迁出、删除或减少依赖的改动；不得新增 `agent-compat` 到 current owner 的依赖，也不得把 `agent-compat` 当作 owner 继续补 reply loop / provider / tool / session 逻辑。`agent-compat` 现存 `document-preview` / `model-provider` / `tool-runtime` 本地依赖只是 burn-down allowlist，退出条件是迁出对应调用并删除。
6. `RuntimeReplyResponseMaterializer` 必须覆盖 `OutputItemAdded`、`OutputItemDone`、`ToolCallInputDelta`、`ReasoningDelta`、`Completed`、`RateLimits` 的 current projection，并由 `agent_reply_stream.rs` 消费到现有 runtime event / timeline item 主链。
7. `AsterReplyStreamProjector` 必须把 Aster Message text/thinking/tool-input delta、direct `AgentEvent::ToolInputDelta` 和可表达的 item lifecycle 转为 `RuntimeReplyResponseEvent`，不得继续把这些非文本/工具参数流或 provider response item 直接输出为 legacy-shaped runtime delta。
8. 本轮不宣称删除 `Agent::reply_with_provider(...)`；该最后一跳仍是 R2/R3 compat blocker。

## 验证门槛

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check
npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "internal/exec-plans/aster-phase6-provider-reply-backend-plan.md"
npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
CARGO_TARGET_DIR=".lime/cargo-target/response-event-nontext-agent-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib -j 1 -- --nocapture
CARGO_TARGET_DIR=".lime/cargo-target/response-event-nontext-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture
git diff --check -- "lime-rs/crates/agent-runtime/src/reply_stream.rs" "lime-rs/crates/agent/src/request_tool_policy/agent_reply_stream.rs" "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "internal/exec-plans/aster-phase6-provider-reply-backend-plan.md"
```

## 进度日志

- 2026-07-09：创建计划。并行写集曾把旧 `provider_reply_exit_source.rs` / `ReplyExitSource` 命名回流；本计划固定本轮只收口 R2/R3 provider reply backend 命名和守卫，不在 `agent-compat` staging crate 内补 provider / reply loop 业务逻辑，但后续仍必须继续迁出、删除和减少依赖。
- 2026-07-09：按 `agent-compat` 要迁移走的口径纠偏。撤回 `compat_provider_reply_backend.rs` / `Compat*` 命名方向，固定 `provider_reply_exit_source.rs` 是唯一私有退场点；下一刀继续把 `run_provider_reply_exit_source(...)` 内的 Aster provider trait object execution 迁到 current backend。
- 2026-07-10：Codex 对照确认 response event 由 Turn loop 消费后再 materialize item/tool/reasoning/completed；本轮把 Lime response event materializer 接到现有 runtime event / timeline projection，覆盖非文本 delta、item lifecycle、completed 和 rate limits。`ProviderReplyExitSource` / `run_provider_reply_exit_source(...)` 仍是 compat blocker，`agent-compat` 不得作为 current owner。
- 2026-07-10：验证通过：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check`；`npx prettier --check ...`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" ...`，`144 passed`；`agent-runtime reply_stream`，`20 passed`；`lime-agent request_tool_policy`，`77 passed`。`lime-agent` 首次冷编译被 SIGTERM 结束，退出码 `143`，无源码错误；复用同一 target dir 重跑通过。
- 2026-07-10：巨型文件风险登记：`src/lib/governance/asterMigrationBoundary.test.ts` 已是既有超大治理守卫文件。本轮只在 response-event 守卫附近追加断言，未做拆分，原因是当前主线目标是 R2/R3 provider/reply loop 收口，拆分整个治理套件会扩大写集并干扰并行迁移。退出条件：下一次治理测试结构化整理时，把 response event / provider reply exit source 守卫抽成独立 helper 或分域测试文件，保留当前 `144 passed` 守卫覆盖。
- 2026-07-10：修正 `agent-compat` 执行口径：它不是冻结目录，允许迁出、删除或减少依赖；禁止的是新增本地 path dependency 或 current owner 依赖给 staging crate 续命。`asterMigrationBoundary.test.ts` 已增加 `agent-compat/Cargo.toml` 本地 path dependency burn-down allowlist 守卫。
- 2026-07-10：再次纠偏：`agent-compat` 是迁移对象，不是保护区。本计划所有“暂缓改 staging”类表述都必须解释为“不得在 staging 内补新业务逻辑”，不能解释为停止迁出或停止删除。
- 2026-07-10：继续 R2/R3 response event 前移。`AsterReplyStreamProjector` 的转换入口从 Message-only 扩展到所有 Aster projector runtime events，direct `AgentEvent::ToolInputDelta` 也会进入 `RuntimeReplyResponseEvent::ToolCallInputDelta`，避免工具参数流绕过 current materializer。`asterMigrationBoundary.test.ts` 增加守卫并允许已删除的 `agent-compat/src/hooks/{loader,types}.rs` 作为更收口的 dead 状态。验证：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过；`CARGO_TARGET_DIR=".lime/cargo-target/aster-projector-response-event-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib -j 1 -- --nocapture` 通过，`22 passed`；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" ...` 通过，`146 passed`；`git diff --check -- ...` 通过。阻塞：`lime-agent request_tool_policy` Rust 定向测试在编译 `aster-core` 时因当前 `agent-compat` 脏树缺失 `subagent_execution_tool`、`subagent_scheduler`、`communication`、`monitor`、`specialized`、`error_handling`、`recipe/build_recipe` 与 `scheduler/types.rs` 失败，未触达本次 adapter 用例；按本计划不在 `agent-compat` 补逻辑。
- 2026-07-10：继续前移 provider response item lifecycle。`AsterReplyStreamProjector` 现在把 `RuntimeAgentEvent::ItemStarted` / `ItemCompleted` 中可表达为 provider response item 的 `AgentMessage` / `Reasoning` / `ToolCall` payload 映射为 `OutputItemAdded` / `OutputItemDone`；`Warning` 等不属于 provider response item 的 payload 保持原 runtime event，避免信息丢失。`agent-compat` 未修改。
- 2026-07-10：继续补齐 Turn-side response item materialization。`RuntimeReplyResponseMaterializer` 现在会在 `ToolCallInputDelta` 带有工具名，或此前 `OutputItemAdded` 已记录同一 `call_id` 工具名时，同步投影 `ItemUpdated` 工具项，并把累积参数解析为 JSON，无法解析时保留原始字符串；未知工具名保持只发 `ToolInputDelta`，避免伪造 item。该改动让工具参数流进入 current Item/read model 过渡投影，但 provider source 仍未直接产出 Lime-owned response event，`ProviderReplyExitSource` / Aster `Agent::reply_with_provider(...)` 仍是 compat blocker。
- 2026-07-10：解除 `lime-agent request_tool_policy` 定向验证阻塞。只在 `agent-compat` staging crate 内做最小编译清障：删除/注释已不存在模块声明后的残留引用，局部化 `OverflowHandler`，把 recipe / prompt / sandbox / image / user-message / repetition inspector 等已退场 helper 对齐为 no-op 或解析型 shim；没有恢复 `subagent_execution_tool`、`subagent_scheduler`、`communication`、`monitor`、`specialized`、`error_handling` 等旧目录，也没有新增 `agent-compat` -> current owner 依赖。分类：`compat blocker` 编译清障，不是 current owner 或完成证据。验证通过：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent --package aster-core -- --check`；`CARGO_TARGET_DIR=".lime/cargo-target/response-event-mapper-agent-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib -j 1 -- --nocapture`，`26 passed`；`CARGO_TARGET_DIR=".lime/cargo-target/response-event-nontext-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" ...`，`147 passed`。
- 2026-07-10：继续 R2/R3 provider execution owner 纠偏。`model-provider::provider_stream` 现在持有 `RuntimeReplyProviderExecutionRunner<R>`、`RuntimeReplyProviderExecutionSource<R>` 与 `run_provider_source_execution(...)`，provider source backend wrapper 不再归 `agent-runtime`；`agent-runtime::reply_backend::RuntimeReplyProviderSourceExecution` 只保留 Turn execution payload 和 `from_source_request(...)` / `from_run_call(...)` materialization。`ProviderReplyExitSource` 仍是 Aster 最后一跳 compat blocker，但只能消费 model-provider wrapper，不能把执行 wrapper 塞回 `agent-runtime` 或 `agent-compat`。
