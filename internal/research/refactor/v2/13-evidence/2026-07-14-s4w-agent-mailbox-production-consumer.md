# S4w Durable Mailbox RuntimeCore Consumer

日期：2026-07-14

状态：completed / focused-validated / product-chain-pending

## 事实源

`thread-store::{AgentIdentityStore,AgentMailboxStore}` 与 App Server `ProjectionStore`
是 root-thread identity、pending mailbox 与 canonical Thread/Turn/Item 的唯一 durable owner。
本 slice 只在 `RuntimeCore` 消费这两个 durable store；不读取 legacy session metadata，不使用
`RuntimeQueuedTurn`、process-local map 或第二队列。

canonical EventLog 保持事件顺序事实源，canonical ThreadStore 是可恢复 Item read model：

```text
durable mailbox
  -> RuntimeCore turn admission
  -> canonical EventLog append
  -> canonical Thread/Turn/Item projection
  -> mailbox delivered ack
```

投影在 EventLog append 后失败时，mailbox 必须保持 pending。后续相同 delivery 会严格匹配
mailbox identity，并且只接受该 session 连续的 durable EventLog tail；成功补 projection 后才
ack。identity 或 sequence 不一致一律 fail-closed，不重写 EventLog。

## 实现

- 新增 `runtime/agent_mailbox_delivery.rs`，作为唯一 mailbox consumer。
- consumer production module 已拆至 423 行；六项 focused fixture 位于
  `runtime/tests/agent_mailbox_delivery.rs`，不再把测试与持久化/ack 逻辑堆在同一文件。
- mailbox `message_id` 经过 `agent_protocol::ItemId::new` 规范化，得到稳定 canonical Item ID。
- `TriggerTurn` 使用由 `message_id` 派生的确定性 turn ID；仅这一模式可自行启动 turn。
- `QueueOnly` 不启动 turn，只在下一次真实 turn 前把 mailbox Item 写入历史，且真实用户输入
  随后写入同一事件序列。若此前 EventLog-first 投影失败，该旧 turn 会在恢复后显式终止为
  `Interrupted`，不阻塞新的真实 turn。
- canonical Item 已存在的 retry 只执行 delivered ack，不产生第二个可见 Item。
- `event_store` 对带 mailbox payload 的事件强制 canonical projection 成功；一般事件的既有
  projection failure warning policy 不被扩大。
- `RuntimeCore` 提供 durable mailbox activity 查询，供后续 wait owner 接线；不注册 agent
  model tools、JSON-RPC、Electron 或 GUI。

## 验证

```text
RUST_MIN_STACK=8388608 cargo test --manifest-path lime-rs/Cargo.toml \
  -p app-server agent_mailbox_delivery --lib
  6 passed

CARGO_TARGET_DIR=/tmp/lime-s4w-check cargo check --manifest-path lime-rs/Cargo.toml \
  -p app-server --lib
  passed

rustfmt --edition 2021 --check runtime/{agent_mailbox_delivery,event_store,turn_execution}.rs
git diff --check -- <S4w runtime write set>
  passed

RUST_MIN_STACK=8388608 CARGO_TARGET_DIR=/tmp/lime-s4w-structure cargo test \
  --manifest-path lime-rs/Cargo.toml -p app-server agent_mailbox_delivery --lib
  6 passed after extracting the focused test module
```

2026-07-14 收尾复跑确认：上述 focused 6/6 与隔离
`CARGO_TARGET_DIR=/tmp/lime-s4w-check cargo check -p app-server --lib` 均再次通过。
编译仅报告并行中的 `agent_control` 预接线和测试辅助代码的未使用项；S4w mailbox
consumer 没有新增错误或失败。

Focused coverage:

1. `TriggerTurn`：Item-before-ack、确定性 turn 与 provider history 不重复输入。
2. `QueueOnly`：不自行启动、在下一真实 turn 前进入 canonical history。
3. 已持久化 Item 的 retry：仅 ack，不重复可见 Item。
4. canonical sequence collision：pending 保留、turn/events 回滚、backend 不调用。
5. `QueueOnly` EventLog-first crash window：下一真实 turn 前恢复旧 Item、终止旧 turn 为
   `Interrupted`，再 ack。
6. `TriggerTurn` EventLog-first crash window：恢复确定性 turn 的 Item，再启动 backend。

```text
RUST_MIN_STACK=8388608 npm run test:rust:related -- <S4w runtime files>
  app-server --lib: 1039 passed, 11 failed
```

11 个 shared-worktree 失败均在并行 hot area，且 focused mailbox 6/6 同次通过：4 个旧
`tool.started` fixture 被 current EventStore 拒绝、4 个仍断言已删除 `tool.args`、其余 3 个是
workflow action audit、canonical tool/reasoning order 与 process-item summary。它们不读取
`agent_mailbox_delivery`，不是本 slice 的回归；不在 S4w 夹带修改。

## 分类与下一刀

- `current`：ProjectionStore durable mailbox/identity、RuntimeCore consumer、canonical
  EventLog-first Item recovery。
- `compat`：无。
- `deprecated`：legacy session metadata 不能成为 mailbox/agent graph truth。
- `dead / forbidden-to-restore`：`RuntimeQueuedTurn` mailbox reuse、临时 map、第二队列和
  duplicate visible Item fallback。

本 slice 没有 Electron/preload/JSON-RPC/GUI 写入，Gate B 不适用。完整重启后的 child session
hydration、六个 AgentControl 工具、wait/interrupt 的产品接线、GUI canonical SubAgent projection
与旧 Team 删除必须由后续独立 current slice 负责。
