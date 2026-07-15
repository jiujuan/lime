# S4ah AgentControl visible DOM Gate B evidence

日期：2026-07-15

## 结论

`.lime/qc/s4ah-agent-control-visible-dom-gate-b.json` 为真实 Electron Gate B，状态 `pass`，
28/28 assertions 全真。它覆盖：

- Electron Host、preload、`app_server_handle_json_lines`、App Server、RuntimeCore/provider fixture。
- canonical read model 到目标 session 可见 DOM。
- `spawn_agent`、`list_agents`、`send_message`、`followup_task`、`interrupt_agent`、
  `wait_agent` 六个 typed Tool row 全部 `completed` 且 visible。
- Started、Interacted、Interrupted activity 全部可见并绑定同一 durable child Thread；两条
  Interacted 分别来自 send/followup。
- `agentSession/read` trace 为 `electron-ipc/success`；invoke error 0，console error 0。
- 截图：`.lime/qc/s4ah-agent-control-visible-dom-gate-b-visible-dom.png`。

该场景使用 localhost OpenAI-compatible provider fixture，只证明 current 产品链，不证明 live
provider 正确性。

## 发现并删除的历史耦合

首次 DOM 取证暴露 `wait_agent` 被 presentation 投影为
`subagent_activity(kind=wait, threadId=parent_session)`。`wait` 不属于 Codex 三类 activity。

修复保持 canonical storage `CollabAgentToolCall::Wait` 不变，只让 `agentSession/read` presentation
输出 `tool_call/tool_name=wait_agent`。同时删除 smoke 从 `subagent_activity.status_label` 反推
AgentControl 工具的 compat 逻辑；工具执行只接受真实 `tool_calls` 或 canonical
`thread_items[type=tool_call]`。

## Focused 验证

- App Server canonical Wait read projection：1/1。
- tool execution smoke guard：7/7。
- timeline + subagent channel boundary：18/18。
- renderer Electron build：通过。
- managed Electron visible DOM Gate B：28/28。

## 分类

- `current`：six Tool rows、distinct canonical SubAgent activity、ThreadStore-backed presentation。
- `compat`：无。
- `deprecated`：无。
- `dead / deleted / forbidden-to-restore`：`subagent_activity(kind=wait)` presentation 与 status-to-tool smoke inference。
