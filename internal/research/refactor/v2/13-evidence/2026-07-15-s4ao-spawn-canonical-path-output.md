# S4ao spawn canonical path output

日期：2026-07-15

## 结论

Codex V2 `spawn_agent` 将 `new_agent_path` 转成结果中的 `task_name`；Lime 之前调用
`AgentIdentity::task_name()`，只返回 canonical path 的最后一段。Lime 同时输出恒为 `null`
且无消费链的 `nickname`，形成另一处假结果字段。

本刀让 App Server gateway 直接返回 `identity.agent_path`，例如 `/root/research`，并删除
spawn result 中的空 `nickname`。durable mailbox 所需的 `message_id` 保持 current；
AgentIdentity、ThreadId、SubAgent projection detail 和 list_agents metadata 均不改变。

## 验证

- `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server
  spawn_gateway_projects_and_starts_the_initial_child_task_before_success --lib`：1/1。
- `npm --prefix "packages/agent-runtime-projection" run build`：通过。
- projection schema event 定向测试：1/1。
- `git diff --check`：通过。

## 边界

本刀只对齐 spawn 成功结果；不实现 `fork_turns`、role/model/reasoning override、service tier
或 history fork，也不修改 GUI 导航与 canonical child roster。
