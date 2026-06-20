# Turn 前后端事件合同

> 状态：已实现并作为 current 合同
> 更新时间：2026-06-19
> 作用：固定 App Server 到前端的事件优先级、字段合同、工具归并规则和历史恢复口径。

本轮收敛结论：

1. `item.*` 是 current 工具事实源。
2. `tool.*` 只能作为 compat / diagnostics fallback。
3. `RequestToolPolicy` 与 App Server read model 都必须优先消费 item lifecycle。
4. 前端 `message.toolCalls` 只在没有真实 process timeline item 时作为 compat fallback；一旦 `threadItems/timeline` 已有 tool / plan / reasoning / context process item，不得再渲染第二套 legacy 工具过程。
5. `plan` 是 item-first 过程内容，GUI 内联为 `<proposed_plan>` 计划块；外置 timeline 只保留未被正文过程流覆盖的补充项。

## 1. 合同目标

前后端合同必须保证：

1. 同一 `toolCallId` 不会生成重复工具卡。
2. 工具结果不会串到 assistant 正文或下一个工具。
3. 第二轮输入不会截断第一轮输出。
4. live stream 与 history hydrate 结果一致。
5. 多模型 provider 的工具事件都能映射到同一 UI 结构。

## 2. 事件优先级

前端处理事件时按以下优先级确定事实源：

| 优先级 | 事件 | 用途 |
| --- | --- | --- |
| P0 | `turn_started / turn_completed / turn_failed / turn_canceled` | turn 边界与终态 |
| P1 | `item_started / item_updated / item_completed` | item / tool / message / plan / reasoning 主事实 |
| P2 | `tool_input_delta / tool_output_delta / tool_progress` | 同一工具 item 的 transient 细节 |
| P3 | `tool_start / tool_end / tool_failed` | legacy fallback，只在没有 item lifecycle 时合成 |
| P4 | `text_delta / text_delta_batch / thinking_delta` | live 文本增量，必须绑定 active turn |
| P5 | `runtime_status / warning / context_trace` | diagnostics / summary，不定义工具终态 |

规则：

1. 如果同一 `toolCallId` 已存在 P1 item，P3 事件不得再创建新 tool node。
2. P2 事件没有 `toolCallId` 时只能进入 diagnostics，不能挂到最近工具。
3. P4 文本增量必须绑定当前 active turn，不能追加到最近 assistant history item。
4. P0 terminal event 到达后，active stream buffer 必须 flush 到该 turn 的 final item。
5. `tool.*` 只能补充兼容历史或 transient 细节，不能覆盖 `item.completed` 的 terminal state。
6. `turn_summary` 只表达状态摘要，不算真实 process timeline item；它不能独自屏蔽 legacy `message.toolCalls` 兼容展示。
7. `plan` item 如果已经被内联到 assistant content parts，前端必须把该 item 视为已覆盖，避免在 timeline leading/trailing 区域重复渲染同一计划。

## 3. 必需字段

### 3.1 Turn event

```json
{
  "type": "turn_started",
  "turn": {
    "id": "turn-1",
    "thread_id": "thread-1",
    "status": "running",
    "started_at": "2026-06-18T00:00:00.000Z"
  }
}
```

必需字段：

- `turn.id`
- `turn.thread_id`
- `turn.status`
- `turn.started_at`

### 3.2 Item event

```json
{
  "type": "item_started",
  "item": {
    "id": "tool-1",
    "thread_id": "thread-1",
    "turn_id": "turn-1",
    "sequence": 3,
    "type": "tool_call",
    "status": "in_progress",
    "started_at": "2026-06-18T00:00:01.000Z",
    "updated_at": "2026-06-18T00:00:01.000Z",
    "tool_name": "WebSearch",
    "arguments": { "query": "..." }
  }
}
```

必需字段：

- `item.id`
- `item.thread_id`
- `item.turn_id`
- `item.sequence`
- `item.type`
- `item.status`
- `item.started_at`
- `item.updated_at`

工具 item 额外必需：

- `item.tool_name`

### 3.3 Tool delta event

```json
{
  "type": "tool_output_delta",
  "tool_id": "tool-1",
  "delta": "partial output",
  "output_kind": "stdout"
}
```

必需字段：

- `tool_id`
- `delta`

前端归并键：

```text
toolCallId = tool_id
turnId = activeTurnId 或 item index 反查
```

如果无法反查 turn，不允许挂到最近 turn。

## 4. 前端归并规则

### 4.1 归并键

Canonical key：

```text
sessionId + threadId + turnId + itemId
```

工具辅助 key：

```text
sessionId + threadId + turnId + toolCallId
```

如果 legacy event 没有 `turnId`：

1. 优先通过 existing item index 的 `toolCallId` 反查。
2. 反查不到时只能挂 active turn transient diagnostics。
3. active turn 不存在时丢到 unknown diagnostics，不展示为工具卡。

### 4.2 Tool item 状态机

```text
missing
  -> item_started: in_progress
  -> item_updated: in_progress | completed | failed
  -> item_completed: completed | failed
```

legacy fallback：

```text
missing
  -> tool_start: synthetic in_progress
  -> tool_end: synthetic completed / failed
```

禁止状态：

```text
completed -> in_progress
failed -> in_progress
completed -> completed with different output from another event source
```

如果出现冲突：

1. P1 item terminal state 胜出。
2. P3 legacy terminal state 只记录 diagnostics conflict。
3. 不更新 UI 主状态。

### 4.3 文本增量归并

`text_delta` / `text_delta_batch` 只允许追加到：

1. 当前 active turn 的 streaming assistant buffer。
2. 有明确 item id 的 active `agent_message` item。

禁止追加到：

1. 最近一个 completed assistant message。
2. 最近一个 tool result。
3. 下一轮 user message 后的上一轮 active buffer。

turn terminal 时：

1. flush active buffer。
2. 生成或更新本 turn 的 final `agent_message` item。
3. 清空 active buffer。

## 5. 后端输出规则

App Server / Runtime backend 应按这个顺序输出：

```text
turn_started
item_started(user_message)
item_started(reasoning/plan/tool/agent_message)
item_updated(...)
item_completed(...)
turn_completed
```

工具调用建议顺序：

```text
item_started(tool_call)
tool_input_delta*
tool_progress*
tool_output_delta*
item_completed(tool_call)
```

legacy 兼容输出只能在 item event 之后或由 item event 派生：

```text
item_started(tool_call)
tool.started(compat)
...
item_completed(tool_call)
tool.result(compat)
```

不能出现：

```text
tool.started
tool.result
item_started(same tool)
item_completed(same tool)
```

除非前端能通过 sequence/source 标记认定 legacy 是历史回放。

## 6. History hydrate 合同

历史读取返回必须满足：

1. `turns[]` 按 `started_at` 或 sequence 排序。
2. `turn.items[]` 按 `sequence` 排序。
3. 每个 item 的 terminal status 已归并完成。
4. legacy tool events 如被合成为 synthetic item，metadata 必须标注：

```json
{
  "source": "legacy_tool_event",
  "canonical": false
}
```

前端 hydrate 时：

1. 先加载历史 turns/items。
2. 再绑定 live stream。
3. 如果 live stream 返回同一 turn/item，按 item status 和 updated_at 合并。
4. completed item 不被 live transient event 降级。

## 7. 错误和取消

### 7.1 Tool failed

后端必须输出：

```text
item_completed(tool_call, status=failed, error=...)
```

legacy `tool.failed` 可作为兼容，但不能替代 item 终态。

### 7.2 Turn failed

turn failed 不意味着所有 item failed：

1. 已 completed tool item 保持 completed。
2. in_progress item 可标记 failed / interrupted。
3. assistant partial text 保留为 partial `agent_message` item 或 diagnostics。

### 7.3 Turn canceled

取消后：

1. active buffer flush 为 interrupted partial item。
2. 未完成工具标记 interrupted / failed。
3. 后续用户输入必须创建新 turn，不复用被取消 turn。

## 8. 前端组件责任

| 模块 | 责任 | 禁止 |
| --- | --- | --- |
| `agentProtocol` | 解析事件形状 | 用文本内容推断状态 |
| `agentUiEventProjection` | 将 AgentEvent 投成 AgentUI event | 创建第二套工具事实 |
| `threadItemProjection` | item-first 主投影 | 忽略 item terminal state |
| `toolEventProjection` | delta/progress 补充 | 创建 canonical tool card |
| `conversationProjectionStore` | 按 key 归并和索引 | 只按数组 append 不去重 |
| `MessageList` | 展示 timeline | 修改 runtime facts |
| `agentChatHistory` | hydrate 历史 | 截断 completed assistant text |

### 8.1 MessageList current / compat 边界

`MessageList` 的展示事实源分类：

- `current`：`AgentThreadItem / timeline` 生成的 `thinking`、`tool_use`、`action_required`、`file_changes_batch`、`text` content parts。
- `current`：`plan` item 生成的 `<proposed_plan>` text part，并由 `StreamingRenderer.renderProposedPlanBlocks` 解析成 Codex-style plan UI。
- `compat`：无 timeline 或 timeline 只有 `turn_summary` 时，旧消息上的 `message.toolCalls` / `contentParts.tool_use` 可以继续展示历史或外部兼容过程。
- `deprecated`：timeline 已有 process item 时继续并列渲染 `message.toolCalls`。
- `dead`：把 assistant 正文、commentary 文本或 tool output 文本当作工具状态 join key。

## 9. 兼容策略

兼容只允许三类：

1. 历史 event log 没有 item lifecycle。
2. 外部旧客户端仍监听 `tool.started/tool.result`。
3. 工具执行中需要高频 delta/progress。

所有兼容事件必须能回答：

```text
它归属哪个 turn？
它归属哪个 item/toolCallId？
它是否能改变终态？
它何时可以删除？
```

无法回答时，事件只能进入 diagnostics，不能进入主 UI。
