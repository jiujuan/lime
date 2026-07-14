# S6g 无调用 Lime-Agent Aggregate Runtime 删除证据

> date: 2026-07-14
> slice: S6g-dead-agent-runtime-aggregate
> owner: root

## 事实源

GUI 的 execution runtime 继续由 current App Server read model 投影：

```text
App Server RuntimeCore -> Thread / Turn / Item read model
  -> session_metadata / model_routing / permission projection -> GUI
```

`app-server/runtime/read_model/session_metadata.rs` 直接从 current session metadata 投影
`execution_runtime`。routing、permission 和 usage 也分别由 RuntimeCore、runtime backend 与 read
model owner 投影，不经过 `lime-agent` 的 aggregate builder。

## 已删除

- 删除 `session_execution_runtime/runtime_payload.rs`，其中包含旧 `lime_runtime` metadata parser、
  cost 再计算和错误文本限额猜测；
- 从 `session_execution_runtime.rs` 删除 aggregate `SessionExecutionRuntime` builder、runtime
  source、permission/OEM/summary DTO、snapshot alias 与 permission fallback；
- 删除 crate-root aggregate helper/DTO export；
- App Server runtime boundary 不再把已删除的 `runtime_payload`、测试目录和 adapter 当作 current
  owner；
- deleted-path 与 `rust-retired-agent-runtime-aggregate` dead guard 禁止回流。

以下仍保留：`SessionExecutionRuntimeTaskProfile`、`RoutingDecision`、`LimitState`、`CostState` 和
`LimitEvent`。它们仍是 `AgentEvent` 的 task/routing/cost/limit wire DTO，TypeScript parser、事件
类型和 GUI projection 仍依赖它们。本 slice 不碰 protocol、App Server、Renderer 或 wire contract。

## 验证

- aggregate builder、fallback、`runtime_payload` module 与 aggregate-only DTO 的 Rust 搜索：删除后零命中；
- `cargo test --manifest-path lime-rs/Cargo.toml -p lime-agent --lib -q`：262 tests 通过；
- `cargo check --manifest-path lime-rs/Cargo.toml -p lime-agent`：通过；
- `cargo check --manifest-path lime-rs/Cargo.toml -p lime-agent -p app-server`：通过；
- `npx vitest run src/lib/governance/legacySurfaceCatalog.test.ts --silent=passed-only`：203 tests 通过；
- `npx vitest run src/lib/governance/agentMigrationBoundary.test.ts --testNamePattern "已删除的 lime-agent Agent adapter 不得恢复" --silent=passed-only`：通过；
- `npx vitest run src/lib/governance/appServerRuntimeBoundary.test.ts --testNamePattern "P1-5 UI execution runtime projection owner" --silent=passed-only`：通过；
- `npm run governance:legacy-report`：零引用候选 0、分类漂移 0、边界违规 0；
- catalog JSON parse 与 S6g 精确写集 `git diff --check`：通过。

完整 `appServerRuntimeBoundary.test.ts` 当前有 8 条共享工作树失败：S4w App Server mailbox 热区的
direct-coupling / provider initialization / line-count 变化，以及多个早已删除 adapter 的历史断言。
它们不读取 S6g 删除的 aggregate helper；S6g 的直接 P1-5 boundary assertion 已单独通过。

## 分类

- `current`：App Server read model、RuntimeCore routing/permission projection、agent-runtime
  generic session projection 与保留的 AgentEvent DTO；
- `compat` / `deprecated`：本 slice 未保留或新增；
- `dead / deleted / forbidden-to-restore`：lime-agent aggregate execution runtime builder、
  `lime_runtime` aggregate metadata parser、permission fallback 与对应专属 DTO。
