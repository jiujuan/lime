# S4ad targeted SubAgent producer evidence

日期：2026-07-14

> S4ae 后续收口说明：本文件原先把旧七值判为 historical-read-only，是 S4ad producer
> 切片中的临时兼容决定。仓库没有外部用户或历史数据兼容约束，且 Codex canonical contract
> 只有 `Started/Interacted/Interrupted`；S4ae 已将旧七值改判为
> `dead / forbidden-to-restore`。以下 producer 证据仍有效，十值兼容结论不再有效。

## 结论

AgentControl targeted 操作已形成完整 canonical producer：

```text
App Server gateway resolved durable ThreadId/path
  -> typed SubAgentProjectionFact
  -> RuntimeToolExecutionResult / NormalizedToolOutput serde-skipped internal field
  -> ordinary Tool terminal Item
  -> distinct completed SubAgent Item
  -> App Server canonical store/read + generated TS
```

- spawn -> `Started`
- send_message / followup_task -> `Interacted`
- interrupt_agent -> `Interrupted`
- wait_agent 保持 canonical Collab Wait；list_agents 保持 generic Tool。
- 失败、started phase、空/多 fact、tool/activity mismatch 不产生 SubAgent Item。
- facts 不进入 model-visible output、structured content 或普通 Tool metadata。
- SubAgent Item ID 由 source call 稳定派生，与普通 Tool Item ID 不同；sequence 紧随 Tool，ordinal 独立。
- target path 只作为 gateway 解析输入和 activity detail；`child_thread_id` 只使用 durable identity owner 返回的 `ThreadId`。

`Started/Interacted/Interrupted` 是唯一 current producer 写入值。旧
`Spawned/MessageSent/Waiting/Resumed/Completed/Failed/Closed` 已由 S4ae 从 Rust enum、JSON
Schema 和 generated TS 中删除，并由负向反序列化回归阻止回流。child terminal
completed/failed 继续由 S4aa Result mailbox 表达，S4ad 不恢复旧 activity producer。

## 验证

- tool-runtime `agent_control`：5/5。
- agent-protocol current/historical activity serde：1/1。
- lime-agent `agent_control`：5/5；`current_provider_turn`：14/14。
- App Server `agent_control`：12/12。
- App Server protocol schema fixture：1/1。
- Rust schema exporter 与 `npm run generate:protocol-types`：S4ad 当时生成十值 union；该结果已被
  S4ae 的 Codex 三值 schema/client 取代，不再是 current contract。
- `cargo check -p app-server --lib`、`npm run test:contracts`、
  `npm run smoke:agent-runtime-current-fixture` 与最终 rustfmt/diff：收尾门禁中，结果在本文件
  完成时更新。

## 范围

`current` 是 durable target resolution、typed internal fact、ordinary Tool + canonical SubAgent Item
和三值 current activity。旧七值、旧 Team 工具与 V1 alias 均是
`dead / deleted / forbidden-to-restore`；`compat` 与 `deprecated` 无新增。S4ad 不新增 JSON-RPC、
Electron、Renderer 或 GUI fallback，也不声明 Multi-Agent Gate B；typed GUI cold/live consumer 与
真实 Electron闭环归 S4ae。
