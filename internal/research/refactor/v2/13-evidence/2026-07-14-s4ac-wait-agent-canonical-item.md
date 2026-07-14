# S4ac wait_agent canonical Collab Item evidence

日期：2026-07-14

## 结论

`wait_agent` 的 current provider lifecycle 已直接产出 canonical
`ThreadItemPayload::CollabAgentToolCall { operation: Wait }`，Started/Completed 共享同一
call-derived Item identity 与 ordinal，terminal `ToolOutput` 保留 text、structured content 和
duration。App Server 既有 generic Item event/store/read 链无需新增 mapper 或协议。

## 边界

- `current`：`wait_agent -> CollabAgentToolCall::Wait` canonical lifecycle。
- `current / producer pending`：`spawn_agent`、`send_message`、`followup_task`、
  `interrupt_agent` 仍可执行，但在 S4ad 获得 durable target thread facts 前不伪造 SubAgent
  activity。
- `current generic Tool`：`list_agents` 与非 AgentControl 工具保持原 Tool payload。
- `deprecated / historical-read-only`：S4ab 已分类的 V1 Resume/Close 与历史 activity variants。
- `compat`：无新增。

本 slice 未修改 AgentControl gateway、App Server protocol/schema、generated client、Electron、
Renderer 或 GUI，也未增加 JSON-RPC method、fallback 或 alias。

## 实现

- `agent/src/protocol.rs` 在唯一 canonical tool payload 选择点识别 `wait_agent`，复用既有
  `CollabAgentOperation::Wait` 和 `CollabAgentToolCall` payload。
- `agent/src/protocol_agent_control_tests.rs` 独立固定 started/completed identity、status、
  operation、空 target/message 与 terminal output，避免继续扩大接近 800 行的主文件。
- `protocol.rs` 最终 894 行；新增测试文件 95 行。

## 验证

- `cargo test --manifest-path lime-rs/Cargo.toml -p lime-agent canonical_wait_agent --lib`：1/1。
- `cargo test --manifest-path lime-rs/Cargo.toml -p lime-agent protocol:: --lib`：19/19。
- `cargo test --manifest-path lime-rs/Cargo.toml -p lime-agent current_provider_turn --lib`：13/13。
- `cargo check --manifest-path lime-rs/Cargo.toml -p lime-agent --lib`：通过。
- touched Rust `rustfmt --edition 2021 --check`：通过。
- exact write-set whitespace / `git diff --check`：通过。

## 后续

S4ad 必须等待 S4aa 释放 `agent_control_gateway.rs`，再让 gateway result 携带模型输出之外的
typed projection facts，以真实 child/target thread ID 产生 Started/Interacted/Interrupted
SubAgent activity。输入 target path 不得冒充 ThreadId；`list_agents` 不得伪造 Collab operation。
