# S4i2 Skills Runtime Canonical Fixture Gate B

## 结论

Skills Gate B fixture 的 search 与 Skill invocation 已从退役的
`tool.started/tool.result` 收敛到 current `item.started/item.completed` Tool Item
生命周期。两个 Item 分别保持稳定的 `itemId/call_id`、ordinal `2/3`、
`inProgress -> completed` 状态，并把 terminal output 放在 canonical
`ToolOutput.text` 中。

Evidence summarizer 现在从 `payload.item.payload.call_id` 与
`payload.item.metadata` 读取 canonical 事实，只把 `item.completed` 当作 search / Skill
边界，并要求 `skill_body_read` 严格早于 `skill_gate_decision`。交换二者的负向回归会
把 gate 判为未满足。

Gate B 首轮暴露了共享 fixture 的 AgentMessage phase 冲突：commentary Item 尚未完成
便向不同 final Item 发送 delta。当前 fixture 使用同 identity 的
`message.completed(commentaryItemId)` 让 App Server managed mapper 归一为 canonical
`item.completed`，再进入 final Item；没有放宽 Rust fail-closed 规则，也没有增加生产
fallback。

## 分类

- `current`：App Server 接受的 Thread/Turn/Item 生命周期、canonical Tool Item、
  Evidence Pack/read model 消费。
- `test-only`：受控 external fixture backend 与 Skills Gate B scenario。
- `dead / retired guard-only`：raw `tool.started/tool.result` producer，只保留负向回流
  断言。
- `compat / deprecated`：无新增 surface。

## Gate B 证据

`npm run smoke:claw-chat-current-fixture -- --scenario skills-runtime` 通过：

- natural：search/body/gate/Skill event index 为 `11/12/13/15`；
- 显式 `$skill`：对应 index 为 `30/31/32/34`；
- workspace manual-enable：对应 index 为 `11/12/13/15`，gate mode 为
  `workspace_runtime_enable`，allowlist 命中 `project:capability-report`；
- 三入口 read model 的 search 与 Skill Tool status 均为 `completed`；
- GUI 输入框恢复、turn terminal 为 `completed`、无 actionable console error。

backend ledger 证明 natural 入口按顺序发出 canonical search started/completed、body
read、gate、Skill started/completed，再进入 final delta 与 turn terminal。

## 验证

- focused fixture tests：2 files / `57/57`。
- 专用 Skills Gate B：通过。
- `npm run verify:gui-smoke`：通过。
- `npm run governance:scripts`：通过。
- claimed files Prettier 与 `git diff --check`：通过。
- `npm run smoke:agent-runtime-current-fixture`：Plan history hydrate、Skills 三入口、
  Multi-Agent 与 MCP 均通过；命令随后在独立 Media contentParts GUI 场景失败，缺少
  `结果图`、`sidecar://media/fixture-image-1` 与 `image/png` 可见引用。该失败发生在
  Skills 之后，不属于 S4i2 Tool Item 生命周期。

## 并行边界

同一 backend script 中后续出现的 Media `item.started` 改动来自隔壁进程，不归
S4i2 所有；本 slice 未修改 Rust、Provider、App Server protocol/read model、Electron、
Renderer 或中央执行计划。
