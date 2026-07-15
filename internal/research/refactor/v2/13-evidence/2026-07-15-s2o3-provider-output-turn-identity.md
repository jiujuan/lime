# S2o3 Provider output Turn identity

时间：2026-07-15

## 结论

Provider Text / Reasoning canonical Item identity 已从 sampling-attempt-only 收紧为
canonical Turn + sampling attempt + family + provider source item：

```text
provider:{turn_id}:{attempt}:{family}:{source_item_id}
```

同一 provider raw ID 在同一 Turn 的不同 sampling attempt、以及同一 Thread 的不同 Turn
之间均不会复用；同一 source Item 的 Start / Delta / End 仍保持同一 identity。

## 根因

S4ae `agent-control-tools` Gate B 首次产物：

`.lime/qc/s4ae-agent-control-tools-gate-b.json`

其中 spawn/list/send/followup 成功，interrupt/wait 失败：

- `wait_agent`：`item item_provider:1:text:text-0 changed turn identity`
- `interrupt_agent`：`event log append sequence mismatch: expected 28, got 26`

`agent-runtime/provider_turn` 的 attempt counter 每个 Turn 从 1 重置，而旧 identity 只有
`provider:{attempt}:{family}:{source_item_id}`。child followup Turn 因此复用首轮
`provider:1:text:text-0`，canonical ThreadStore 正确拒绝 Item 改绑 Turn。EventLog-first append
已持久化、内存状态因 projection failure 未推进，后续 interrupt 才以 stale sequence 触发第二个
错误。因此 EventLog mismatch 是派生症状，不应放宽 sequence 校验或补偿跳号。

## 实现

- `provider_output_item_id` 显式接受已经由 `run_current_provider_turn` fail-closed 校验的
  canonical `turn_id`。
- Text / Reasoning Start、Delta、End 的全部调用点使用同一 Turn-scoped identity。
- attempt-scoped 回归期望同步为 `provider:turn-1:1:*` / `provider:turn-1:2:*`。
- 新增回归锁定同 raw ID 的跨 Turn、跨 attempt identity 均不相等。

实现发生在共享 S4ae owner 与本 S2o3 根因审计协同时段；S2o3 不覆盖 S4ae 的 App Server、
GUI、fixture、evidence 或中央计划写集。

## 验证

- `cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime provider_output_item_id_is_turn_and_attempt_scoped`：1/1。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime provider_turn --lib`：11/11。
- `npm run test:rust:related -- <S2o3 Rust paths>`：通过。
  - `agent-runtime`：117/117
  - `app-server`：1119/1119
  - `lime-agent`：263/263
  - `lime-scheduler`：24/24
  - `lime-server`：111/111
- claimed Rust files exact `rustfmt --edition 2021 --check`：通过。
- claimed write set `git diff --check`：通过。

related Rust 的 4 个 App Server test warning 来自并行 MCP fixture 未使用 helper/import；本切片
未修改或格式化该写集。

## Fresh Gate B

```bash
npm run smoke:agent-runtime-tool-execution:managed -- \
  --batch agent-control-tools \
  --timeout-ms 300000 \
  --output .lime/qc/s2o3-s4ae-agent-control-tools-gate-b-rerun.json
```

结果：

- status：pass
- assertions：15/15，failed assertions 0
- provider requests：9
- `spawn_agent` / `list_agents` / `send_message` / `followup_task` /
  `interrupt_agent` / `wait_agent` 全部 completed + success
- incomplete batch target tools：0
- `wait_agent` 返回 durable terminal Result，`timed_out=false`
- `interrupt_agent` 返回 `previous_status`
- DevBridge health：ok

## 分类

- `current`：Turn + sampling attempt + family + source-scoped provider output identity、
  canonical Item/Turn binding、EventLog-first fail closed。
- `compat`：无新增。
- `deprecated`：无新增。
- `dead / forbidden-to-restore`：跨 Turn 仅使用 sampling attempt 的 provider output identity、
  通过放宽 canonical Item binding 或 EventLog sequence 校验掩盖冲突。

## 路线图关系

本切片直接关闭 S4ae 六个 AgentControl 工具真实 Gate B 的 provider Item identity blocker。
S4ae owner 应引用 fresh Gate 产物完成自己的 evidence/claim/中央计划收口；S2o3 不抢写该热区。
