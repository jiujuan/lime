# S2n Conversation Import Message Lifecycle Evidence

## 结论

Codex conversation import 的 User / Agent Message 已进入 canonical Item lifecycle。每条导入消息
使用 source call ID 或 `sourceEventSeq` 派生的稳定 Item identity，并使用 rollout
`sourceEventSeq` 作为 ordinal；App Server 自身的 event sequence 不再替代来源顺序。

导入链现在为同一 Item 依次写入 `item.started`、既有 presentation message event 与
`item.completed`。`turn.completed` 只关闭 Turn，不再合成或补全 Message Item。current
`importVersion=2` 保留 source ordinal；只有没有版本标记的旧 Codex import 才在历史修复时使用
持久化 event-sequence domain。

## 写集与并行边界

- `conversation_import/commit.rs`：从 User / Agent source provenance 构造稳定 message draft。
- `conversation_import/commit_events.rs`：为 current Codex import 写入 `importVersion=2`。
- `conversation_import/commit_events/tool_lowering.rs`：lower User / Agent canonical lifecycle，保留
  presentation event 和 source ordinal。
- `conversation_import/tests/runtime_events.rs`：覆盖 canonical lifecycle 与 source/runtime ordinal
  collision。
- `thread_item_projection/materializer.rs`：仅对无版本的历史 Codex import 使用 legacy ordinal 修复。
- 未修改 provider、Electron、protocol/schema、generated client 或 Renderer。

## 分类

- `current`：Codex source provenance -> stable User / Agent Item identity ->
  `item.started` / presentation / `item.completed` -> canonical thread read。
- `compat`：无新增。
- `deprecated`：无版本标记的历史 Codex import ordinal 修复，仅供读取旧数据。
- `dead / forbidden-to-restore`：用 App Server event sequence 覆盖 source ordinal、由
  `turn.completed` 合成 Message、只写 presentation event 而没有 canonical Item lifecycle。

## 验证

```text
RUST_MIN_STACK=8388608 cargo test -p app-server \
  commit_imports_user_and_agent_items_with_canonical_lifecycle --lib
=> 1/1 passed

RUST_MIN_STACK=8388608 cargo test -p app-server \
  commit_avoids_source_and_runtime_ordinal_collision --lib
=> 1/1 passed
```

- App Server shared related suite：1097/1097 passed（当前 S2m/S2n 共享工作树）。
- exact `rustfmt --check` passed。
- claimed Rust write set `git diff --check` passed。
- history replay Electron fixture 已验证 imported Message / Reasoning / Tool 的完整 DOM 恢复，
  reasoning summary 单实例、2 个图片附件、1 个 MCP tool row，console error 为 0。

## 路线图关系

S2m 已关闭 imported completed Plan identity；S2n 继续关闭 imported User / Agent Message identity、
lifecycle 与 ordinal。conversation import 的 Message、Plan、Reasoning 和 Tool 现在共享 canonical
Thread/Turn/Item ordering 事实源，不新增第二套 import read model。
