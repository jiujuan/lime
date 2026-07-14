# S2j Projection Thread Identity

日期：2026-07-13

状态：completed / focused-validated

## 结论

`ProjectionStore` 不再把缺失的 `AgentEvent.thread_id` 伪造成
`session_id`。session 首个投影事件必须携带非空 canonical thread identity；同一
session 后续事件缺失 thread identity 时，只能精确继承已投影 session owner。显式
thread 冲突、跨 session/thread 重用 turn id、或 repair replay 中身份冲突均 fail
closed，SQLite 事务回滚，已有 projection 不被清空或污染。

这是 current read/recovery guard，不改变 protocol，也不新建 compat 路径。

## 动机与边界

`RuntimeCore` 的 production `EventStore` 已在生成事件时携带 thread id。此前
`ProjectionStore` 的 `unwrap_or(session_id)` 只会为历史、fixture 或损坏输入制造
假的 thread owner，并经 projection repair/hydration 回流到 current session state。

本 slice 只修改：

- `lime-rs/crates/app-server/src/runtime/projection_store.rs`
- `lime-rs/crates/app-server/src/runtime/projection_store_tests.rs`

它不触碰正在并行修正的 Electron synthetic admission response，也不触碰 MCP
runtime、protocol、schema 或 `LocalAppDataSource` fixture 热区。

## 规则

1. 第一个 session event 没有有效 thread id，拒绝写入。
2. 已存在 session 的缺失 thread id 精确继承已持久化 owner；不是 `session_id`
   fallback。
3. 已持久化 session owner 不可改写；后续 event 与其不一致立即拒绝。
4. `turn_id` 已存在时，incoming `(session_id, thread_id)` 必须完全一致。
5. `repair_session` 清空与 replay 在同一事务中；任何 identity error 都回滚清空。

## 验证

```text
cargo test --manifest-path lime-rs/Cargo.toml -p app-server projection_store_tests --lib
  23 passed

rustfmt --edition 2021 --check projection_store.rs projection_store_tests.rs
  passed

git diff --check -- projection_store.rs projection_store_tests.rs
  passed
```

App Server test crate 同时报告四个 `runtime_backend/tests.rs` 的 unused warnings，属于
并行 MCP 测试模块，S2j 文件无 warning。

## 相邻 Host 审计

并行只读审计确认工作树中已在途的 `electron/appServerHost.ts` 修复，已删除
synthetic accepted reply 的 `threadId = sessionId` 伪造，改为从 canonical event 或
`agentSession/read` 取得 identity，并拒绝不一致响应。该文件是外部脏热区，S2j
没有夹写。

剩余应由 Host owner 单独处理：first notification 可能属于旧 turn；应先按原
`sessionId + turnId` 过滤，不匹配时再走 canonical read fallback，并覆盖 timeout
read fallback。该事项不是 ProjectionStore 的回退理由。

## 治理分类

- `current`：session-bound immutable thread identity、exact missing-field inheritance、
  transactional repair guard。
- `compat`：无。
- `deprecated`：无新增。
- `dead / forbidden-to-restore`：`thread_id = session_id` fallback、后续事件改写
  session thread owner、跨 session turn reuse、repair 后继续读取污染 projection。
