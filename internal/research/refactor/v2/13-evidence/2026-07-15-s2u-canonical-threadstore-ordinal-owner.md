# S2u Canonical ThreadStore ordinal owner

## 结论

App Server canonical materializer 现在是 Thread Item ordinal 的唯一事实源：首次 Item 事件使用 Lime outer `AgentEvent.sequence`，同 Item 后续 lifecycle 通过 merge 保留首次 ordinal。Tool、Message、Reasoning、Plan、import 不再把各自 producer ordinal 带入 SQLite 唯一索引。

Codex import 的 `sourceEventSeq` 继续保留在 provenance/metadata，但不再作为 canonical ordinal。import 按 source 顺序 append 到 Lime EventLog，因此相对顺序不变；imported session 继续 live Turn 时也不会与稀疏 source ordinal 落入两个数值域。

## 根因与改动

- live Tool emitter 维护独立 `next_ordinal`，Message/Reasoning 使用 App Server event sequence；两者都从 `1` 开始时会撞 `UNIQUE(thread_id, ordinal)`。
- materializer 过去只覆盖 nested Item 的 outer sequence/identity/time，保留 producer ordinal。
- materializer 现在对 raw/nested/current import/legacy import 统一使用 outer event sequence。
- lifecycle merge 和 SQLite upsert 继续保留首次 Item ordinal；没有 store-side renumbering、冲突抑制或 schema 放宽。
- import 回归从精确 `sourceEventSeq` 数值改为 event-domain 唯一、稳定和 source-relative order。

## 验证

- `thread_item_projection::`：`40/40` passed。
- `canonical_thread_store_tests::`：`10/10` passed。
- `conversation_import::tests::runtime_events::`：`13/13` passed。
- import ordinal `20` 后继续 live outer sequence `20`，分批 apply、completion、reopen/read：`1/1` passed；最终 ordinals 为 `1, 20`。
- App Server library：`1116/1117`；唯一失败是未触及的 execution-process 状态竞争，单独复跑 `1/1` passed。
- claimed Rust files `rustfmt --check`：passed。
- claimed write set `git diff --check`：passed。

## 治理分类

- `current`：Lime EventLog sequence -> App Server materializer -> stable first Item ordinal -> ThreadStore/read model。
- `current provenance only`：Codex `sourceEventSeq`。
- `dead / forbidden-to-restore`：Tool/Message/import producer ordinal 作为 canonical persistence/order 事实源。
- `compat`：无新增。

## 独立 residual

`event_store.rs` 的普通 canonical projection 写失败仍只记录 warning；mailbox/terminal 特殊路径已经 fail closed。该错误策略不属于 ordinal owner 写集，应另开窄 slice，不能通过恢复 producer ordinal、store renumbering或放宽唯一约束处理。
