# S6w Dead Surface Audit

## 结论

只读盘点确认三组 surface 属于 `dead / forbidden-to-restore` 删除候选，但本轮不执行删除：

1. `src/lib/api/agentRuntime/requestTypes.ts:198-295` 的
   `AgentRuntimeSpawnSubagent*`、`AgentRuntimeSendSubagent*`、
   `AgentRuntimeWaitSubagents*`、`AgentRuntimeResumeSubagent*`、
   `AgentRuntimeCloseSubagent*` 与 `AgentRuntimeStatusSnapshot` DTO 没有生产 consumer。
   相关命令已在 command policy / App Server contract 中标为 retired，当前保留只会让旧
   facade 类型继续看起来像可用 API。
2. `lime-rs/crates/thread-store/src/subagent_tree.rs` 只由自身测试和
   `thread-store/src/lib.rs` 的 `pub mod` 暴露；当前生产 roster owner 是
   `thread-store/src/agent_graph.rs` 的 `AgentGraphStore`，无外部 symbol consumer。
3. `lime-rs/crates/agent/src/team_runtime_governor.rs` 只由自身测试与 crate root 的
   module/re-export 引用；在 `lime-rs/crates` 内没有外部 consumer。current team/runtime
   owner 已在 App Server agent control 与 AgentGraph 链路。

## 分类与下一步

- `current`：`AgentGraphStore`、App Server canonical roster 与现有 Thread/Turn/Item 主链。
- `dead / forbidden-to-restore`：以上三组 DTO/module surface，待一次性删除并补物理缺失
  guard。
- `compat / deprecated`：`parentSessionId` 与 `parentThreadId` 的历史/证据兼容残余不属于
  本轮，需独立评估 evidence/history 语义后再处理。
- `test-only`：现有 retired-key negative guards 与本审计 evidence。

本轮没有修改 `legacySurfaceCatalog.json`、协议、Electron、GUI 或 active runtime 文件。
待用户明确允许删除后，下一 owner 的窄写集应只包含三组 dead 文件、对应 crate root
module/re-export 行、`agentMigrationBoundary.test.ts` 的物理缺失守卫，以及对应 Rust/TS
定向验证。

## 证据

- `rg` 在 `src`、`packages`、`scripts` 中只找到 requestTypes DTO 的声明；同名命令只存在
  于 retired contract/negative guard 语境。
- `rg` 在 `lime-rs/crates` 中只找到 `subagent_tree` 的 crate root module 行与自身文件，
  以及 `team_runtime_governor` 的 crate root module/re-export 行与自身文件。
- `S6t` / `S6v` 已完成 canonical roster reader 收敛，不能把这些零 consumer 声明误判成
  current 兼容层。

## 并行边界

本 slice 只写 claim、lock、evidence、handoff 元数据；没有删除文件、修改 Rust/TS source
或接触 active `S2t` catalog。S2s、S4i4、S4l active owner 继续独立收尾。
