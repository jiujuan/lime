# S4ag effective child route evidence

日期：2026-07-15

## 结论

AgentControl child 不再只复制 parent 的 renderer 显式 runtime request。current 唯一链为：

```text
RuntimeBackend effective-options preflight
  -> StoredSession.turn_runtime_options[parent_turn]
  -> per-turn AgentControl gateway
  -> child turn runtime options
```

preflight 复用既有 model selection、reasoning policy、App Server turn policy、workspace 与 search
policy。没有新增 route map/resolver，没有复制 `business_object_ref` 或 session metadata。

child 继续删除 parent-only `event_name`、`queued_turn_id`、`expected_output`、
`structured_output` 与 `output_schema`。warm followup 使用目标 child 最近 Turn 的 effective route。

## 验证

- effective session-default/profile route：2/2。
- App Server AgentControl：14/14。
- scoped Rustfmt 与全仓 `git diff --check`：通过。

## 分类

- `current`：backend preflight -> unique turn options map -> gateway -> child。
- `compat`：无。
- `deprecated`：无。
- `dead / forbidden-to-restore`：第二 route map、session metadata route 复制、child parent-only output contract。
