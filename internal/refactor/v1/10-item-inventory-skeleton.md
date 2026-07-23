# V1-04 Item Inventory 骨架

> status: `inventory-only`
> owner: `app-server-protocol` + `thread-store` + `agent-runtime-projection`
> upstream: `/Users/coso/Documents/dev/rust/codex`
> fixture: `internal/refactor/v1/fixtures/item-inventory.v0.1.json`

## 目标

把 Codex v2 `ThreadItem` 的变体、字段和增量通知先固定成可审计清单。本轮只建立
字段级 fixture，不修改协议、ThreadStore、Renderer projector 或现有 client verifier，避免
在并行热区重复接线。

## 当前结论

- Codex 与 Lime 共享 18 个顶层 variant；`MemoryCitation` 仅是 `AgentMessage` 的嵌套字段，
  不能成为第二套 item 生命周期。
- Lime 当前已接入 `item/started`、`item/completed`，以及 AgentMessage 与 Reasoning 的
  typed delta；Plan、CommandExecution、FileChange、McpToolCall 的 Codex 增量通知仍是缺口。
- Lime 已有内部 `plan.delta` RuntimeEvent、canonical projection 与 GUI consumer；这里的 Plan
  gap 专指缺少 Codex v2 typed `item/plan/delta` wire。内部事件不能冒充 App Server notification，
  后续应迁移生产者/消费者后删除平行表达，而不是长期双轨。
- 已知字段级缺口集中在 Codex 强类型被 Lime `string`/opaque `Value` 替代的边界：
  `AgentMessage.phase`、`CommandExecution.cwd`、`CollabAgentToolCall.reasoningEffort`、
  `ImageView.path`、MCP result/error，以及媒体/搜索扩展字段。
- fixture 中 `shape: gap` 只表示字段或 lifecycle 尚未收敛，不代表可以在 GUI 侧补造 synthetic
  item；生产链仍必须是 `App Server JSON-RPC -> ThreadStore -> projection`。

## 下一刀

优先选择有明确 upstream wire contract 且写集能独立隔离的 `Plan` 与
`CommandExecution` 增量通知：先补 v2 typed notification、serde fixture 和 late-delta rejection，
再接 ThreadStore/replay，最后才进入 GUI projection。MCP result/error 和媒体 extension 需要
分别由 MCP/media owner 认领，不能在 Item 聚合器中顺手展开。

完成 V1-04 前，fixture 中每个条目都必须有 cold/live/replay/GUI evidence；当前只完成 inventory
骨架，不能标记为 `completed`。
