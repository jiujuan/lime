# Phase 6 Session Todo 迁移跟踪

状态：in_progress  
更新时间：2026-07-12  
父计划：[`aster-runtime-codex-style-migration-plan.md`](./aster-runtime-codex-style-migration-plan.md)

## 目标

让 Session Detail 的 todo 读取不再依赖 Aster `ExtensionData`、task board DTO 或 helper，同时保持 GUI Task Center 的现有读取链可用。计划执行与实时展示继续以 Codex 风格 `update_plan -> App Server plan.final -> GUI projection` 为 current 主链。

## 当前分类

- `current`：`tool-runtime::update_plan`、App Server `plan.final`、`thread-store::task_board` 纯投影和 GUI Task Center 消费链。
- `compat blocker`：`session_store_todo_aster_adapter.rs` 文件名及 `task_list.v1` / `todo.v1` / `todo.v0` 只读快照格式。文件内部已无 Aster 类型或调用；保留文件名仅因共享治理守卫正在并行修改。
- `dead / deleted`：该 adapter 内的 `LimeSessionStore::load_extension_data_from_conn`、`aster::resolve_task_board_state`、`TaskBoardItem`、`TaskBoardItemStatus` 转换链，禁止恢复。

## 2026-07-12 进度

- `completed`：Session todo 读取改为直接调用 `agent_session_repository::get_session_extension_data_json(...)`。
- `completed`：历史 task/todo JSON 只转换为 `thread-store::task_board::TaskBoardItemRecord`，subject trim、空项过滤、active form 和状态投影继续由 current owner 处理。
- `completed`：移除该生产路径对 Aster session store、task board resolver 和 task DTO 的依赖。
- `completed`：删除迁出后零引用的 `LimeSessionStore::load_extension_data_from_conn(...)` 及其 repository import，不保留 dead helper 或 warning suppression。
- `guarded`：现有 `asterMigrationBoundary.test.ts` 通过，`183/183`。
- `verified`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过。
- `blocked-verification`：`cargo test -p lime-agent session_todo_compat --lib` 被并行写集 `native_tools/runtime_tool_bridge.rs` 的 `PermissionCheckResult::{is_denied,is_allowed}` 测试编译错误阻塞；未接管该热区。

## 退出条件

1. App Server 的 durable Thread / Turn / Item 投影可从 `plan.final` 恢复 Task Center 状态。
2. 前端不再消费 legacy Session Detail `todo_items` 字段。
3. 删除只读 `task_list.v1` / `todo.v1` / `todo.v0` 解析及 `SessionTodo*` legacy DTO。
4. 删除或重命名 `session_store_todo_aster_adapter.rs`，同步把共享守卫改成 forbidden-to-restore。

## 进度口径

本刀只减少 R5/R6 session source 的一个 Aster 读取点，不解除 R2/R3 reply backend、MCP execution、session durable source 或 root `aster` dependency。整体迁移完成度保持保守口径，不因该局部收口上调到 99%。
