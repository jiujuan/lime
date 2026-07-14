# S6c 重复 Agent Session Store 删除证据

> date: 2026-07-14
> slice: S6c-dead-agent-session-store
> owner: root

## 事实源

Session 的唯一 current 产品链是：

```text
Electron Desktop Host -> App Server JSON-RPC -> RuntimeCore
  -> ThreadStore / ProjectionStore -> Thread / Turn / Item read model -> GUI
```

`lime-agent/session_store` 不在这条链上。它仅对 core DAO/旧 timeline 直接做 CRUD、history read 和 subagent 聚合，并由 `lime-agent` crate root 重导出。Rust 全仓搜索未发现其他 crate 对其公开函数或 DTO 的生产 import；App Server、scheduler 和 server 对 `lime-agent` 的反向依赖编译也不需要该 surface。

## 已删除

删除 `lime-rs/crates/agent/src/session_store.rs`、11 个 `session_store_*` sibling 和 `session_state_snapshot.rs`，同时移除 `agent/src/lib.rs` 的 module declaration 与 crate-root CRUD/read/DTO export。

总计删除 4,182 行，包括：

- 同步 create/list/get/update/delete session API；
- 旧 `agent_messages` / timeline history projection；
- session runtime detail、provider routing、todo 和 subagent aggregation；
- 全部内嵌正向 tests；
- 仅服务上述 family 的 `SessionStateSnapshot`。

未修改 current `thread-store` 的 session repository、runtime snapshot 或 task board，也未触碰 App Server runtime、Electron、Renderer、协议或 GUI。

## 消费者证明

- 搜索 `lime_agent::{create_session_sync, get_runtime_session_detail, list_sessions_sync, SessionDetail, SessionInfo, SessionStateSnapshot}` 等完整公开 surface，在 `lime-rs/crates/agent` 外为零生产命中。
- 搜索 `mod session_store;`、`mod session_state_snapshot;` 和对应 crate-root export，删除后为零命中。
- `cargo tree -i lime-agent` 的反向依赖为 `app-server`、`lime-scheduler` 和 `lime-server`；三者均在删除后完成编译。

## 守卫与验证

- `agentMigrationBoundary.test.ts` 的 deleted-agent path 列表覆盖整个物理删除 family。
- `rust-retired-agent-session-store-family` 以 `dead` 分类禁止 module declaration、crate-root export 与代表性 CRUD/read symbol 回流。
- `cargo test --manifest-path lime-rs/Cargo.toml -p lime-agent --lib -q`：通过，265 tests。
- `cargo check --manifest-path lime-rs/Cargo.toml -p lime-agent`：通过。
- `cargo check --manifest-path lime-rs/Cargo.toml -p app-server -p lime-scheduler -p lime-server`：通过。
- `npx vitest run src/lib/governance/legacySurfaceCatalog.test.ts`：通过，200 tests。
- `npx vitest run src/lib/governance/agentMigrationBoundary.test.ts --testNamePattern "已删除的 lime-agent Agent adapter 不得恢复"`：通过。
- `npm run governance:legacy-report`：通过，零引用候选 0、分类漂移 0、边界违规 0。
- S6c 精确写集 `git diff --check`：通过。

当前完整 `agentMigrationBoundary.test.ts` 另有两个 MCP ownership assertion 随 S4r9 registry/turn 模块拆分失效；它们不读取或覆盖 S6c 的删除路径，已单独运行本 slice 的 deleted-path assertion 通过，不将该并行热区问题归因为 session store 删除。

## 分类

- `current`：App Server RuntimeCore、ThreadStore、ProjectionStore 与其 read model。
- `compat` / `deprecated`：本 slice 未保留或新增。
- `dead / deleted / forbidden-to-restore`：`lime-agent` session store CRUD/read/subagent aggregation family、`SessionStateSnapshot` 和 crate-root public export。

本 slice 不改变 GUI、Electron、App Server JSON-RPC 或当前 protocol wire，因此 GUI smoke 与 Gate B 不适用。删除后显现的 `session_execution_runtime` / `subagent_control` 未使用 helper 是独立候选，未在本 slice 夹带删除。
