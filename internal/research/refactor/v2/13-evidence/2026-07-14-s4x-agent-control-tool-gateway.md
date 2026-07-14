# S4x AgentControl Tool Gateway

日期：2026-07-14

状态：completed / focused-validated / wait-semantics-and-product-chain-pending

## 事实源

`tool-runtime::agent_control` 是六个 current multi-agent 工具的唯一模型侧契约；
App Server `RuntimeCore` 是 durable graph、identity、mailbox 与 turn control 的唯一 owner。
current provider 只接收该 turn 的 opaque `AgentControlGatewayHandle`，`RuntimeBackend`
只透传 handle，绝不反向持有 `RuntimeCore`，也不建立全局 registry。

```text
RuntimeCore(session, thread, turn)
  -> per-turn AgentControlGatewayHandle
  -> ExecutionRequest
  -> RuntimeBackend (opaque pass-through)
  -> lime-agent current provider step snapshot / executor
  -> RuntimeCore durable graph + identity + mailbox
```

## 实现

- `tool-runtime` 只定义并解析 `spawn_agent`、`send_message`、`followup_task`、
  `wait_agent`、`interrupt_agent`、`list_agents`；所有参数使用
  `deny_unknown_fields`，缺 canonical call/turn identity 时 fail closed。
- current provider 仅在 handle 存在时广告六工具，并在 sampling-step executor 中优先走
  gateway。direct text generation 的工具策略固定 Disabled，显式传递 `None`，不扩大
  RuntimeCore capability。
- `RuntimeCore` 按 session/thread/turn 绑定 capability；跨 turn、跨 root tree、closed edge
  和缺 canonical Thread/identity 一律不可寻址。
- spawn 先建立 canonical child session/thread、Open edge、identity 与初始 `TriggerTurn`
  mailbox，再启动 child turn；identity、mailbox 或启动失败都会删除 edge、child
  session/thread 与可寻址 durable records。
- `send_message` 只写 `QueueOnly`，不启动 target turn；`followup_task` 写
  `TriggerTurn`，禁止 target root；`interrupt_agent` 复用 `cancel_turn`，不关闭 Open edge。
- `wait_agent` 仅轮询 durable mailbox activity 与本次等待开始后的 queued steer；没有
  新的 process-local queue 或 agent status registry。child terminal activity 尚未 durable
  回流到 parent，因此本 slice 不宣称达到 Codex 等价 wait 语义。
- `list_agents` 只读取 caller root tree 的 Open graph 与 durable identity/Thread，按
  path/thread 稳定排序，并支持 relative/absolute canonical path prefix。

## 验证

```text
CARGO_TARGET_DIR=/tmp/lime-s4x-final-check cargo test --manifest-path lime-rs/Cargo.toml \
  -p tool-runtime agent_control --lib -q
  3 passed

CARGO_TARGET_DIR=/tmp/lime-s4x-final-check cargo test --manifest-path lime-rs/Cargo.toml \
  -p lime-agent current_provider_turn --lib -q
  13 passed

CARGO_TARGET_DIR=/tmp/lime-s4x-final-verify cargo test --manifest-path lime-rs/Cargo.toml \
  -p app-server agent_control --lib -q
  11 passed

CARGO_TARGET_DIR=/tmp/lime-s4x-final-verify cargo test --manifest-path lime-rs/Cargo.toml \
  -p app-server spawn_gateway_projects_and_starts_the_initial_child_task_before_success --lib -q
  1 passed

CARGO_TARGET_DIR=/tmp/lime-s4x-final-verify cargo check --manifest-path lime-rs/Cargo.toml \
  -p app-server --lib -q
  passed

rustfmt --edition 2021 --check <S4x Rust write set>
git diff --check -- <S4x write set>
  passed
```

Focused coverage includes strict tool schemas, no legacy aliases, canonical caller identity,
per-turn scope, spawn initial TriggerTurn, QueueOnly non-start, root followup rejection,
interrupt preserving the Open edge, wait cancellation/new queued steer, closed-edge target
rejection, list sorting/prefix filtering, and cross-root isolation.

无 current consumer 的 RuntimeCore close/Open-descendant 包装已删除；测试构造 Closed edge
直接使用 canonical `AgentGraphStore`，不再为测试保留 production API。

## 分类与剩余工作

- `current`：`tool-runtime::agent_control` contract、per-turn gateway、RuntimeCore durable
  control、current provider tool surface/executor。
- `compat`：无。
- `deprecated`：legacy session metadata 与 Team state 不得作为 agent graph 或 mailbox truth。
- `dead / forbidden-to-restore`：Team/旧 alias、global agent registry、RuntimeBackend ->
  RuntimeCore dependency、第二队列、生产 mock fallback。

本 slice 没有 JSON-RPC、Electron、preload、Renderer 或 GUI 投影写入，Gate B 不适用。完整
child terminal activity 回流、restart child hydration 与 GUI canonical SubAgent 投影仍是后续
current slice。旧 Team executable surface 已由 S4y 删除，不属于 S4x 证据范围。
`internal/aiprompts/architecture.md` 第 6.3 节已记录 per-turn capability 的依赖方向，
`internal/exec-plans/refactor-v2-implementation.md` 已登记 S4x 完成态与责任开发者确认；这些
focused 证据仍不能据此宣称完整 Multi-Agent 产品链完成。
