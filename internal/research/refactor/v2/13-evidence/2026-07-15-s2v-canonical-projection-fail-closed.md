# S2v Canonical projection fail closed

## 结论

普通 canonical ThreadStore projection 失败不再被 warning 吞掉。append 仍先写 EventLog；若 canonical projection 失败，调用返回明确错误，不返回 live notification，也不把失败 tail 推进到内存 session history。后续 restart/repair 可以从 durable EventLog tail 恢复。

## 改动

- `event_store.rs` 将 non-mailbox/non-terminal 的 `apply_canonical_events` warning 改为 `RuntimeCoreError::Backend`。
- mailbox Item 和 child terminal 的既有 fail-closed 文案与顺序保持不变。
- non-canonical `projection_store.apply_events` 继续使用原 best-effort warning policy。
- 负向回归在 temp SQLite 注入 `(thread_id, ordinal)` 冲突，证明 EventLog 已持久化、内存未前进且调用失败。

## 验证

- projection failure focused：`1/1` passed。
- external event sequence：`5/5` passed。
- App Server library：`1118/1118` passed。
- claimed Rust files `rustfmt --check`：passed。
- claimed write set `git diff --check`：passed。

## 治理分类

- `current`：EventLog-first -> canonical ThreadStore apply -> memory/live notification success。
- `dead / forbidden-to-restore`：canonical projection error warning-and-continue。
- `compat` / `deprecated`：无新增。
