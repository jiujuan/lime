# S6h 无调用 Lime-Agent Execution Runtime Session Query 删除证据

> date: 2026-07-14
> slice: S6h-dead-agent-runtime-session-query
> owner: root

## 事实源

GUI execution runtime 只允许读取 current App Server read model：

```text
App Server RuntimeCore -> Thread / Turn / Item read model
  -> session_metadata / model_routing / permission projection -> GUI
```

`agent-runtime/session_execution.rs` 继续拥有通用的 session execution projection；App Server
`runtime/read_model/session_metadata.rs` 继续将 current metadata 投影为 GUI 所需的
`execution_runtime`。它们不依赖 `lime-agent` 对 `agent_sessions` 的直接查询。

## 已删除

- 删除 `lime-agent/src/session_execution_runtime_query.rs` 的直接 SQLite
  `agent_sessions` execution-runtime query 与测试；
- 从 `lime-agent` crate root 移除该 module declaration；
- 移除 `session_execution_runtime.rs` 中仅供该 query 使用的
  `SessionExecutionRuntimeSessionProjection` alias 和 `session_recent` re-export；
- 保留 `SessionExecutionRuntimeTaskProfile`、`RoutingDecision`、`LimitState`、`CostState`
  与 `LimitEvent`，它们仍是 current `AgentEvent` wire DTO；
- 在 deleted-path catalog 和 `rust-retired-agent-runtime-session-query` dead guard 中禁止
  direct query 回流。

本切片未变更 App Server runtime、ThreadStore、协议、Electron、Renderer 或 token usage
projection。`session_usage_projection.rs` 和 `session_record_sql.rs` 继续由现役 direct text
generation 路径拥有。

## 守卫同步

并行 MCP 重构已将连接注册与调用分开：`McpConnectionRegistry` 构造 per-turn
`McpStepSnapshot`，snapshot 才 dispatch 已捕获的 route。治理断言同步检查这两个 owner。

同样，`request_user_input` 定义和执行已经分别在
`current_provider_turn/mcp_step_snapshot.rs`、`tool_executor.rs` 接入 `tool-runtime`；
session-scoped pending state 和 GUI notification bridge 继续分别由
`agent-runtime/action_required.rs`、`request_user_input_bridge.rs` 拥有。治理测试不再指向
已迁出的 provider-turn 单文件或 retired confirmation-only API。

## 验证

- 删除 API 的 Rust 搜索只命中 dead guard / test，以及 current
  `agent-runtime::SessionExecutionRuntimeSessionProjection`；
- `npx vitest run src/lib/governance/agentMigrationBoundary.test.ts src/lib/governance/legacySurfaceCatalog.test.ts`：215 tests 通过；
- `npm run governance:legacy-report`：零引用候选 0、分类漂移 0、边界违规 0；
- 精确写集 `git diff --check`：通过；
- `cargo check --manifest-path lime-rs/Cargo.toml -p lime-agent -q`：通过；
- `cargo test --manifest-path lime-rs/Cargo.toml -p lime-agent --lib -q`：259 tests 通过；
- `cargo check --manifest-path lime-rs/Cargo.toml -p app-server -p lime-scheduler -p lime-server -q`：通过。
  输出包含 S4w 正在施工的 `agent_control` / `agent_mailbox_delivery` 未使用项 warning，
  不属于本 slice，也不影响编译成功。
- `rustfmt --edition 2021 --check lime-rs/crates/agent/src/session_execution_runtime.rs`：通过。
  全 crate `cargo fmt --check -p lime-agent` 仍被 S4 MCP 并行文件的既有格式差异阻断，
  本 slice 未修改这些文件。

## 分类

- `current`：App Server RuntimeCore/read model、`agent-runtime` generic session execution
  projection、保留的 `AgentEvent` task/routing/cost/limit DTO；
- `compat` / `deprecated`：本 slice 不保留；
- `dead / deleted / forbidden-to-restore`：`lime-agent` direct execution-runtime session query
  及其专属 projection alias/re-export。
