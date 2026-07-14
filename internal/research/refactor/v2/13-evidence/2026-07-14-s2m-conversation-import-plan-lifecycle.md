# S2m Conversation Import Plan Lifecycle Evidence

## 结论

Codex `item_completed` 携带的 `TurnItem::Plan.id` 是 completed Plan 的 authoritative identity。
S2m 将同一 ID 写入 imported runtime event 的 `itemId`、`planId`、`revisionId` 与
`sourceItemId`，materializer 对 `sourceClient=codex` 且显式带 ID 的 Plan 使用该 identity，
不再按 turn/event 合成另一条 canonical Item。

presentation read 与 canonical `thread_read.thread_items` 现在都得到 `item-plan-1`，status 为
completed，revisionId 仍为 `item-plan-1`。`turn.completed` 不创建或补全 Plan；完成事实只来自
`item_completed`。

## 写集与并行边界

- `conversation_import/codex/events.rs`：只认领 completed Plan identity lowering hunk。
- `conversation_import/codex/events/tests.rs`：只认领 authoritative Plan regression；同文件 SubAgent
  activity test 属于 S4af 相邻改动。
- `conversation_import/tests/runtime_events.rs`：只认领 completed Plan commit/read hunk；同文件
  user/agent message lifecycle 与 ordinal collision tests 属于 active S2n 相邻改动。
- `thread_item_projection/materializer.rs`：只认领 imported Codex Plan explicit identity boundary。
- 未修改 provider、Electron、protocol/schema、generated client 或 Renderer。

## 分类

- `current`：Codex `item_completed(Plan.id)` -> imported `plan.final` -> canonical Plan Item/revision。
- `compat`：无新增。
- `deprecated`：无新增。
- `dead / forbidden-to-restore`：completed Plan 的 turn/event-derived synthetic ID、
  `turn.completed` 补 Plan、把 completed Plan 降成 legacy `update_plan` Tool Item。

## 验证

```text
RUST_MIN_STACK=8388608 cargo test -p app-server \
  codex_completed_plan_preserves_authoritative_item_identity --lib
=> 1/1 passed

RUST_MIN_STACK=8388608 cargo test -p app-server \
  commit_preserves_imported_completed_plan_item --lib
=> 1/1 passed

RUST_MIN_STACK=8388608 npm run test:rust:related -- <S2m Rust paths>
=> app-server 1097/1097 passed
```

- exact `rustfmt --check` passed。
- claimed Rust write set `git diff --check` passed。
- 4 条 warning 来自未触及的 `runtime_backend/tests.rs` unused/dead test helpers，不属于 S2m。

## 文件体量退出条件

`conversation_import/codex/events.rs` 当前为 1002 行，已经超过非生成文件硬阈值。本 slice 不再
向该文件追加业务逻辑；下一次触碰 Codex 非 tool specialized event 前，必须先把对应事件族迁入
职责子模块并把 root 文件降到 1000 行以下。禁止用 compat wrapper、重复 parser 或删除必要可读性
空行规避阈值。

## 路线图关系

S2l handoff 的唯一 related Rust 失败已关闭；canonical history repair 与 conversation import 的
completed Plan identity 现在使用同一 Item/revision 事实源。
