# S4z AgentControl restart-on-demand evidence

日期：2026-07-14

## 结论

RuntimeCore restart 后只 hydrate 显式请求的 root session，不递归加载 Open descendants。六工具控制面遵循 Codex V2 的按需恢复原则，并按 Lime durable mailbox contract 区分 durable queue 与精确唤醒：

- `send_message` 只写 QueueOnly mailbox，不加载或启动未加载 child。
- `followup_task` 在首次命中时只 hydrate exact target child；本回归不单独宣称其 TriggerTurn、Item/ack 生命周期已被覆盖。
- `interrupt_agent` 在首次命中时只 hydrate 并取消 exact target child。
- Closed edge 不可寻址，保留 durable audit，但不会被重新打开。
- child 的 child 不因 root 或 sibling control 被递归 hydrate。

## 实现

- `runtime/tests/agent_control.rs` 仅声明独立 `restart` 测试模块。
- `runtime/tests/agent_control/restart.rs` 使用同一 EventLog/ProjectionStore 重建新的 RuntimeCore，覆盖真实 process-local state 丢失后的 durable recovery。
- 未修改 production module；现有 `ensure_current_session_hydrated`、durable graph/identity/mailbox 与 per-turn gateway 是唯一 current owner。
- 未引入 BFS restart、process-global registry、第二队列、JSON-RPC 方法或 legacy metadata fallback。

## 验证

- `cargo check --manifest-path lime-rs/Cargo.toml -p app-server --lib -q`：通过。
- `cargo test --manifest-path lime-rs/Cargo.toml -p app-server agent_control --lib -q`：12/12 通过，其中 restart-on-demand 为单条端到端 focused test。
- `rustfmt --edition 2021 --check`：通过。
- exact S4z write set `git diff --check`：通过。

首次复跑曾被并行 S4aa 测试缺少 `AgentControlSpawnRequest` import 阻塞；S4aa owner 自行补齐后，本 slice 未越权修改其热文件，并在最终工作树复验通过。

## 范围

本 slice 完成 cross-RuntimeCore 的精确按需恢复证明，不新增协议或 GUI surface。terminal child activity durable mailbox 归 S4aa；JSON-RPC/Renderer/真实 Electron Multi-Agent Gate B 仍为后续产品主链。

`followup_task` 的完整 TriggerTurn、canonical mailbox Item-before-ack 与 delivered audit 由 S4w/S4aa 的独立回归负责；本 slice 只证明 restart 后不会递归恢复 target subtree。
