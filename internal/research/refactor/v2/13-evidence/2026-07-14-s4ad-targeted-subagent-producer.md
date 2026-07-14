# S4ad targeted SubAgent producer evidence

日期：2026-07-14

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
`Spawned/MessageSent/Waiting/Resumed/Completed/Failed/Closed` 继续保留在 Rust enum、JSON
Schema 和 generated TS 中，仅用于历史 canonical Item 的 decode/re-emit，分类为
`deprecated / historical-read-only`。child terminal completed/failed 继续由 S4aa Result mailbox
表达，S4ad 不恢复旧 activity producer。

## 验证

- tool-runtime `agent_control`：5/5。
- agent-protocol current/historical activity serde：1/1。
- lime-agent `agent_control`：5/5；`current_provider_turn`：14/14。
- App Server `agent_control`：12/12。
- App Server protocol schema fixture：1/1。
- Rust schema exporter与 `npm run generate:protocol-types`：通过；`SubAgentActivityKind` 为
  3 current + 7 historical 的十值 union。
- `cargo check -p app-server --lib`、`npm run test:contracts`、
  `npm run smoke:agent-runtime-current-fixture` 与最终 rustfmt/diff：收尾门禁中，结果在本文件
  完成时更新。

## 范围

`current` 是 durable target resolution、typed internal fact、ordinary Tool + canonical SubAgent Item
和三值 current activity。`deprecated / historical-read-only` 是旧七值；`compat` 无新增；旧 Team
工具与 V1 alias 继续是 `dead / deleted / forbidden-to-restore`。S4ad 不新增 JSON-RPC、Electron、
Renderer 或 GUI fallback，也不声明 Multi-Agent Gate B；typed GUI cold/live consumer 与真实 Electron
闭环归 S4ae。
