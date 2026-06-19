# Turn / Tool 生命周期重构路线图

> 状态：in-progress
> 更新时间：2026-06-19
> 目标：以 Codex CLI 的 turn / item / event 模型为准，系统性重设 Lime 的 turn 执行、工具生命周期、前后端事件合同与 GUI 投影，解决工具事件串线、流式输出卡顿、历史回复截断和多模型工具状态不一致问题。
> 参考事实源：`/Users/coso/Documents/dev/rust/codex`

## 1. 本路线图回答什么

Lime 当前问题不是“工具卡 UI 细节不够像 Codex”，而是 turn 执行事实源不够统一：

1. 后端同时输出 `item_started/item_updated/item_completed` 和 legacy `tool_start/tool_end/tool_*_delta`。
2. App Server event log 与前端 projection 都会消费这些事件，导致同一个工具调用可能被当成多条运行事实。
3. WebSearch / WebFetch 多工具场景里，工具结果、assistant 正文、后续工具或下一轮用户输入容易在 read model / GUI 上串在一起。
4. 流式输出首字慢时，用户看到的是“像卡住”，而不是明确的 turn / item / tool 运行状态。
5. 第二轮输入后，上一轮 assistant 输出被截断，本质是历史 hydrate / active stream / timeline grouping 没有统一按 turn item 边界重建。

本路线图固定一个结论：

**Lime 后续 turn 执行事实必须以 Codex 风格的 `Turn -> TurnItem -> Item lifecycle` 为 current 主链；legacy tool stream 只能作为兼容或临时增量细节，不能继续作为 GUI 工具状态事实源。**

## 2. 依赖文档

- `internal/aiprompts/governance.md`
- `internal/aiprompts/quality-workflow.md`
- `internal/aiprompts/playwright-e2e.md`
- `internal/roadmap/agentruntime/README.md`
- `internal/roadmap/agentui/README.md`
- `internal/roadmap/appserver/README.md`
- `internal/roadmap/codeximport/fidelity-acceptance-matrix.md`

## 3. 配套文档

- [./architecture.md](./architecture.md)：系统分层、事实源、事件模型、owner 边界
- [./frontend-backend-contract.md](./frontend-backend-contract.md)：App Server 与前端的事件合同、归并规则、历史恢复规则
- [./diagrams.md](./diagrams.md)：架构图、流程图、状态图和迁移图
- [./sequences.md](./sequences.md)：submit turn、工具调用、WebSearch、多轮输入、历史 hydrate 的时序图
- [./implementation-plan.md](./implementation-plan.md)：分阶段实施计划、迁移顺序、风险和退出条件
- [./test-cases.md](./test-cases.md)：Rust、App Server、前端 projection、GUI smoke、真实联网 E2E 测试矩阵

## 4. 固定主链

后续所有 turn、工具和 GUI 展示都必须向这条链收敛：

```text
User / Surface Input
  -> Runtime Submit
  -> Session / Thread / Turn
  -> TurnItem
  -> ItemStarted / ItemUpdated / ItemCompleted
  -> RuntimeEvent / EventLog
  -> ThreadReadModel
  -> AgentUI Projection
  -> Workspace / Message Timeline
```

### 4.1 Codex 对齐原则

Codex 的关键设计不是事件名字，而是事实方向：

```text
TurnItem 是事实源
  -> ItemStarted / ItemCompleted 是生命周期事件
  -> legacy WebSearch / McpToolCall / Exec events 是派生兼容事件
```

Lime 必须采用同样方向：

```text
AgentThreadItem / ItemRuntime 是事实源
  -> item.* 驱动 read model 和 GUI 工具卡
  -> tool.* 只补充输入 delta、输出 delta、progress、兼容历史
```

当前参考锚点：

1. `/Users/coso/Documents/dev/rust/codex/codex-rs/protocol/src/items.rs` 中 `TurnItem` 直接包含 `AgentMessage`、`Plan`、`Reasoning`、`WebSearch`、`McpToolCall` 等一等项。
2. `AgentMessageItem.phase` 用来区分 `commentary` 与最终答复；Lime GUI 也必须把 commentary 渲染为过程流，不得越序放入最终正文。
3. `PlanItem` 是 turn item，而不是普通工具卡；Lime GUI 应把它内联为 `<proposed_plan>...</proposed_plan>` 计划块交给 `StreamingRenderer`，避免外置 timeline 重复展示。

## 5. current / compat / deprecated / dead

### current

后续继续演进的主路径：

1. `lime-rs/crates/agent/src/protocol.rs` 中的 `AgentEvent::ItemStarted / ItemUpdated / ItemCompleted`。
2. Aster `ItemRuntime / ItemRuntimePayload / ItemStatus`。
3. App Server current event log：`turn.started`、`item.started`、`item.updated`、`item.completed`、`turn.completed`。
4. ThreadReadModel 对 `turn_id + item.id/tool_call_id + sequence` 的聚合。
5. 前端 `threadItemProjection` 对 `tool_call` item 的渲染。
6. AgentUI projection store 中按 `turnId + partId/toolCallId` 归并后的唯一工具状态。

### compat

短期保留但只能适配或补充的路径：

1. `tool.started / tool.result / tool.failed`：用于旧事件流、局部工具进度、历史数据 hydrate，但不能生成第二份工具事实。
2. `tool.input.delta / tool.output.delta / tool.progress`：只允许补充同一 `toolCallId` 的运行中详情。
3. provider `MessageContent::ToolRequest / ToolResponse` 转换出的 legacy `ToolStart / ToolEnd`：必须被 item lifecycle 去重约束。
4. 历史 event log 中没有 item lifecycle 的 legacy tool event：可 best-effort 转成 synthetic item，但需要标记 `source=legacy_tool_event`。

退出条件：所有 current runtime turn 都能通过 `item.*` 重建工具卡和终态后，legacy `tool_start/tool_end` 只能在历史读取和外部兼容中保留，不再进入生产 GUI 主投影。

### deprecated

禁止继续扩展的方向：

1. GUI 自己用文本或事件顺序推断工具完成态。
2. `tool_start/tool_end` 与 `item.*` 并列驱动同一工具卡。
3. request 级 WebSearch tracker 决定 UI 工具分组。
4. 固定 timeout / grace timer 合成完成态。
5. 通过关键词判断是否需要联网，例如 `message_requires_fresh_web_search`。
6. `mode_default=true` 让普通 Claw 默认进入 allowed 工具模式。

### dead

明确不能恢复的方向：

1. 生产路径依赖 mock backend 或 renderer mock fallback 跑通工具状态。
2. live provider 二次授权 gate 作为默认联网前置条件。
3. 前端假进度或假工具卡掩盖后端首字慢。
4. 第二套 Agent App / Claw 专用工具生命周期事实源。
5. 用 assistant 文本内容作为工具、审批、路由、完成态 join key。

## 6. 完成判定

本路线图完成时，Lime 至少应该做到：

1. 一个 turn 内每个工具调用只有一个 canonical `toolCallId` 和一个 item 生命周期。
2. `item.* + tool.*` 混合事件不会在 GUI 生成重复工具卡或把结果串到正文。
3. WebSearch / WebFetch 多工具场景能展示每个工具的独立状态，并在证据足够后及时进入最终答复。
4. 第一段可见输出不再依赖最终正文；用户能看到 turn / item / tool 正在运行。
5. 第二轮输入后，上一轮 assistant 完整回复和工具卡不会被截断。
6. 历史会话 hydrate 与 live stream 使用同一套 read model / projection 规则。
7. 真实联网 E2E 覆盖 submit、stream、tool lifecycle、final answer、second turn。

## 7. 先读顺序

1. [./architecture.md](./architecture.md)
2. [./frontend-backend-contract.md](./frontend-backend-contract.md)
3. [./diagrams.md](./diagrams.md)
4. [./sequences.md](./sequences.md)
5. [./implementation-plan.md](./implementation-plan.md)
6. [./test-cases.md](./test-cases.md)
