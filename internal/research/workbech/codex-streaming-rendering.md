# Codex Streaming Rendering 方法与 Lime 重构对照

> 状态：current research reference  
> 更新时间：2026-06-24  
> 参考仓库：`/Users/coso/Documents/dev/rust/codex`  
> Lime 目标：修复 Claw / Agent Chat 中 reasoning、搜索、阶段性输出、最终正文错序、被分割、重复追加和完成后消失的问题。

## 1. 结论先行

Codex 的核心方法不是某个 UI 样式，而是这条链路：

```text
ResponseItem / EventMsg
  -> TurnItem / ThreadItem
  -> itemId + turnId + phase + type
  -> delta 只更新对应 item
  -> UI 按 item 生命周期渲染 active tail 与 committed history
  -> final answer 只来自 final-answer AgentMessage
```

Lime 现在的问题是同一段 assistant 输出同时走了三条事实源：

```text
Message.content
Message.contentParts
timelineItems + streamingTextOverlay
```

一旦搜索、thinking、commentary 和 final answer 交错到达，旧逻辑就会从字符串里“补导语 / 去重 / 恢复 leading text / 追加 overlay”，导致用户看到：

1. thinking 被 final text 顶到下面。
2. 搜索或阶段性输出追加到错误位置。
3. “我...”被拆开后继续被错误追加。
4. 完成后 reasoning 消失或最后才显示“已完成思考”。
5. 同一内容在上方和下方重复出现。

精准重构方向：

**让结构化 timeline / contentParts 成为唯一显示投影事实源；`Message.content` 只作为无 process boundary 的 legacy fallback；overlay 只允许作为 final answer tail 追加到 process boundary 之后。**

## 2. Codex 的关键做法

### 2.1 ThreadItem 是一等显示协议

Codex App Server protocol v2 把主聊天显示对象拆成 `ThreadItem`：

- `AgentMessage { id, text, phase, memory_citation }`
- `Plan { id, text }`
- `Reasoning { id, summary, content }`
- `CommandExecution { id, command, status, ... }`
- `WebSearch { id, query, action }`

事实源：

- `/Users/coso/Documents/dev/rust/codex/codex-rs/app-server-protocol/src/protocol/v2/item.rs:215`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/app-server-protocol/src/protocol/v2/item.rs:231`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/app-server-protocol/src/protocol/v2/item.rs:246`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/app-server-protocol/src/protocol/v2/item.rs:352`

关键点：

1. Agent message 带 `phase`，用于区分 `commentary` 与 `final_answer`。
2. Reasoning 和 WebSearch 不是从文本里猜出来的，而是独立 item。
3. UI 不需要通过“正在搜索”“我先查一下”等文案判断工具生命周期。

### 2.2 Core TurnItem 到 ThreadItem 的映射保留 phase 与类型

Codex 把 core `TurnItem` 转成 app-server `ThreadItem` 时保留类型：

- `CoreTurnItem::AgentMessage` -> `ThreadItem::AgentMessage`，保留 `phase`
- `CoreTurnItem::Reasoning` -> `ThreadItem::Reasoning`
- `CoreTurnItem::WebSearch` -> `ThreadItem::WebSearch`

事实源：

- `/Users/coso/Documents/dev/rust/codex/codex-rs/app-server-protocol/src/protocol/v2/item.rs:811`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/app-server-protocol/src/protocol/v2/item.rs:827`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/app-server-protocol/src/protocol/v2/item.rs:846`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/app-server-protocol/src/protocol/v2/item.rs:851`

这保证了 history hydrate 不需要重新解析最终字符串。

### 2.3 Delta 绑定 itemId，不是全局 assistant 文本缓冲

Codex 对 streaming delta 做 item-scoped notification：

- `item/agentMessage/delta` 带 `threadId / turnId / itemId / delta`
- `item/reasoning/summaryTextDelta` 带 `summaryIndex`
- `item/reasoning/textDelta` 带 `contentIndex`

事实源：

- `/Users/coso/Documents/dev/rust/codex/codex-rs/app-server-protocol/src/protocol/event_mapping.rs:359`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/app-server-protocol/src/protocol/event_mapping.rs:375`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/app-server-protocol/src/protocol/event_mapping.rs:384`

关键点：

1. Agent message delta 只能更新对应 `AgentMessage` item。
2. Reasoning delta 只能更新对应 `Reasoning` item。
3. `turn.completed` 或工具完成不是 final answer 的来源。

### 2.4 ResponseItem 解析成 TurnItem 时做结构化断言

Codex `parse_turn_item` 的测试覆盖：

- assistant message -> `TurnItem::AgentMessage`
- reasoning summary/raw content -> `TurnItem::Reasoning`
- web search call -> `TurnItem::WebSearch`
- partial web search without action -> `WebSearchAction::Other`

事实源：

- `/Users/coso/Documents/dev/rust/codex/codex-rs/core/src/event_mapping_tests.rs:367`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/core/src/event_mapping_tests.rs:392`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/core/src/event_mapping_tests.rs:458`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/core/src/event_mapping_tests.rs:546`

这类测试保证低级错误不会滑到 UI 层才发现。

### 2.5 TUI 分离 active tail 与 committed history

Codex TUI 明确有两类 UI 状态：

- committed transcript cells：已经完成、进入历史的单元。
- in-flight active cell：流式中可原地更新的尾部。

事实源：

- `/Users/coso/Documents/dev/rust/codex/codex-rs/tui/src/chatwidget.rs:6`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/tui/src/chatwidget/streaming.rs:383`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/tui/src/chatwidget/streaming.rs:430`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/tui/src/chatwidget/streaming.rs:467`

关键点：

1. streaming tail 是临时视图，不直接等于最终历史正文。
2. 完成后通过 `finalize()` 合并为 source-backed markdown cell。
3. 活跃 tail 清理与历史提交是显式生命周期，不靠 DOM 顺序自然落位。

### 2.6 Commentary 与 final answer 分开处理

Codex 在 `on_agent_message_item_completed` 中只把 `FinalAnswer` 或 legacy `None` phase 记为最终 markdown：

事实源：

- `/Users/coso/Documents/dev/rust/codex/codex-rs/tui/src/chatwidget/streaming.rs:261`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/tui/src/chatwidget/streaming.rs:276`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/tui/src/chatwidget/streaming.rs:296`

关键点：

1. `commentary` 完成不等于 final answer。
2. commentary 完成后可以恢复运行状态提示，但不能把 commentary 记录为最终正文。
3. legacy 无 phase 只在兼容模型场景下当最终正文处理。

### 2.7 Reasoning 与 WebSearch 有独立 UI cell

Codex reasoning delta 流式阶段主要影响状态头，完成后进入 reasoning summary cell；WebSearch 有自己的 active/completed cell。

事实源：

- `/Users/coso/Documents/dev/rust/codex/codex-rs/tui/src/chatwidget/streaming.rs:200`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/tui/src/chatwidget/streaming.rs:222`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/tui/src/history_cell/messages.rs:197`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/tui/src/history_cell/search.rs:50`
- `/Users/coso/Documents/dev/rust/codex/codex-rs/tui/src/history_cell/search.rs:85`

关键点：

1. Reasoning 不进入 assistant final text。
2. WebSearch 不从 final text 中解析，不被 markdown renderer 吞掉。
3. 工具状态显示由工具 item 生命周期驱动。

## 3. Lime 当前偏差

### 3.1 多事实源竞争

当前主链相关文件：

- `src/components/agent/chat/components/messageListItemProjection.ts`
- `src/components/agent/chat/components/messageListTimelineContentParts.ts`
- `src/components/agent/chat/components/messageListProjectionContentParts.ts`
- `src/components/agent/chat/components/messageListInlineProcess.ts`
- `src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts`
- `src/components/agent/chat/hooks/agentStreamRuntimeHandlerActions.ts`
- `src/components/agent/chat/hooks/agentStreamTextDeltaLifecycle.ts`

偏差：

1. `messageListItemProjection.ts` 同时使用 `displayContent`、`displayContentParts`、`timelineInlineContentParts` 和 `streamingTextOverlay`。
2. `streamingFinalTextOverlayContent` 仍被写入 `rawDisplayContent`，导致 overlay 同时进入 display/raw content 与 contentParts merge。
3. `Message.content` 在有 process boundary 时仍可通过 `displayContent` 影响顺序。

正确口径：

**只要存在 current process boundary 或 timeline item，rendererContentParts 必须由结构化 parts 投影；`displayContent` 不得再恢复 process 前文本。**

### 3.2 字符串补齐逻辑仍在主路径

`messageListProjectionContentParts.ts` 仍包含这些旧逻辑：

- `restoreMissingLeadingTextFromDisplayContent`
- `normalizeDuplicatedLeadingTextBeforeProcess`
- `removeTextPartsCoveredByThinking`
- `normalizeDuplicateTextSignature`
- `findDuplicateTextSignatureRange`
- 标点边界判断

这些逻辑本质上是在弥补缺失 provenance。它们会把 `Message.content` 或 overlay 中的文本拆回 process 前后，造成用户截图里的错序和重复。

正确口径：

1. current path 禁止从 `displayContent` 恢复 leading text。
2. current path 禁止用正文签名判断 thinking/final 重复。
3. legacy fallback 只能用于“无 process boundary、无 provenance、无 timeline”的历史消息。

### 3.3 Timeline 投影还有早退条件

`messageListTimelineContentParts.ts` 对单条 reasoning 等情况仍可能返回 `undefined`，使单个 process item 不能稳定进入统一 contentParts。

正确口径：

**只要 timeline 内出现 reasoning、commentary、tool、web_search、plan、action 任一 process item，就应返回结构化 parts；不能因为数量少就退回字符串通道。**

### 3.4 Renderer 承担了过多补救压力

`StreamingRenderer` 能按 `ContentPart[]` 顺序渲染，但它无法知道一个 text 是 commentary、legacy unphased 还是 final answer。若 projection 给错顺序，renderer 只能稳定渲染错误结果。

正确口径：

**renderer 不做 lifecycle 判断；排序、去重、phase 分类必须在 projection 前完成。**

## 4. Lime 精准重构方案

### 4.1 新事实源声明

Claw / Agent Chat streaming display 的唯一 current 事实源：

```text
App Server stream event / thread item
  -> turnId + itemId + sequence + phase + type
  -> frontend normalized timeline item
  -> Message.contentParts / rendererContentParts
  -> StreamingRenderer
```

兼容口径：

- `current`：带 provenance 的 timeline/contentParts。
- `compat`：无 process boundary 的 legacy `Message.content` 文本。
- `deprecated`：从 `displayContent` 恢复 process 前 leading text、正文签名去重、completion suffix 盲追加。
- `dead`：展示文案/自然语言正则判断 lifecycle。

### 4.2 重构切分

第一刀：切断 overlay -> rawDisplayContent

1. `rawDisplayContent` 永远来自 `message.content || ""`。
2. `streamingFinalTextOverlayContent` 只进入 `mergeStreamingOverlayContentParts`。
3. overlay 只能追加为 final text tail，并且只能追加到最后一个 process boundary 之后。
4. overlay 必须带 metadata：`source=streaming_overlay / phase / turnId / itemId / sequence`，否则只能作为 legacy no-process fallback。

第二刀：删除 current path 的 displayContent 恢复逻辑

1. `resolveProcessSeparatedContentParts` 不再调用 `restoreMissingLeadingTextFromDisplayContent`。
2. `Message.content` 只在 `parts` 没有 process boundary 时作为纯文本 fallback。
3. 有 process boundary 但缺 final text 时 fail closed：显示过程，不伪造最终正文。

第三刀：timeline 成为统一 parts owner

1. `buildTimelineInlineContentParts` 只要有 process item 就返回 parts。
2. 单条 reasoning / commentary 也必须进入 parts。
3. final answer 只从 `agent_message phase=final_answer` 或 legacy 无 phase且无 process boundary 的 message 来。
4. `turn_completed.text` 不能当 final answer。

第四刀：合并/排序只看 provenance

1. text 只有同 `source + turnId + itemId + phase + sequence` 且中间无 process boundary 时才能合并。
2. 不同 provenance 的 text 不合并。
3. 带 sequence 的 part 按 sequence 排序；无 sequence 只保留到达顺序，不跨 process run 重排。

第五刀：清理旧 guard 漏网

1. `streamingProjectionGuard.unit.test.ts` 应纳入 `messageListProjectionContentParts.ts`。
2. 守卫禁止 `restoreMissingLeadingTextFromDisplayContent` 这类 current path 恢复逻辑重新出现。
3. 守卫禁止展示文案 literal、动态正则、`.match(`、对“搜索/思考/完成”文案的 lifecycle 判断。

## 5. 必须补的测试

### 5.1 投影单测

必须覆盖：

1. `contentParts = [text("我"), tool_use(search)]`，overlay 为 `我会先...` 时，渲染顺序必须是 `text("我") -> tool_use -> text("会先...")`。
2. `message.content` 含完整正文但 `contentParts` 只有 `tool_use + final text` 时，不从 content 恢复工具前导语。
3. 单条 `reasoning` timeline item 必须进入 `rendererContentParts`。
4. `commentary` agent message 只作为 thinking/process 展示，不进入 actionContent/final text。
5. `final_answer` agent message 才进入最终正文。
6. `tool/reasoning` 后没有 final answer 时 fail closed：只显示过程，不把工具前开场白当最终正文。

### 5.2 Runtime handler 单测

必须覆盖：

1. legacy unphased text 在 process boundary 出现后降级为 commentary，不固化到 final overlay。
2. active stream 的 terminal 事件只停止当前 turn，不误停下一轮 turn。
3. `turn.completed` 只收口 stream，不伪造 final answer。

### 5.3 Renderer 组件测试

必须覆盖：

1. WebSearch / WebFetch / thinking / text 展开态顺序。
2. collapsed 与展开态均不丢 reasoning。
3. 没有 final answer 时不显示空 final block。

### 5.4 GUI / E2E

最低真实验证：

```bash
npm run smoke:agent-runtime-current-fixture
npm run smoke:claw-chat-current-fixture
node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --prefix claw-chat-current-fixture-web-tools-rendering-regression --timeout-ms 180000
```

验收证据必须包含：

1. GUI 可见顺序：reasoning / search / fetch / final text 未错位。
2. 完成态 GUI 仍保留过程项，不只剩最终答复。
3. read model 与 GUI 投影一致。
4. fixture backend ledger 能证明走的是 current App Server JSON-RPC 链路，不是 renderer mock fallback。

## 6. 实现禁区

后续重构禁止：

1. 用 CSS 调整解决 item 顺序问题。
2. 用文案正则判断 `thinking / search / final`。
3. 继续扩大 `Message.content` 的恢复能力。
4. 继续把 overlay 当全局 assistant text buffer。
5. 在 renderer 里新增 lifecycle 判断。
6. 用 timeout / grace timer 合成 final done。
7. 只跑 Vitest 后宣称 GUI 可交付。

## 7. 最小落地顺序

1. 先补失败用例，固定当前截图症状。
2. 切断 overlay 写入 `rawDisplayContent`。
3. 收掉 `restoreMissingLeadingTextFromDisplayContent` current path。
4. 放开 `buildTimelineInlineContentParts` 的单 process item 投影。
5. 把 guard 覆盖到 `messageListProjectionContentParts.ts`。
6. 跑定向单测。
7. 跑 current fixture。
8. 跑 Claw GUI fixture / web-tools-rendering scenario。
9. 若仍失败，按 evidence 判断是 App Server item 缺 provenance、frontend projection 错序，还是 renderer 展开态布局问题。

完成标准：

**同一组 live events 与 history hydrate 产出的 `rendererContentParts` 类型序列、provenance 和可见顺序一致；截图中的错位、追加、消失和重复不能再通过测试与 fixture。**

## 8. Lime 当前代码对照表

| 能力 | Codex 做法 | Lime current 目标 | 当前差距 | 收口动作 |
| --- | --- | --- | --- | --- |
| 最终正文流 | `AgentMessageDelta` 绑定 `itemId + phase=final_answer` | `streamingTextOverlay` 只作为 final answer tail | overlay 仍可覆盖 `rawDisplayContent`，等于把临时 tail 写进全局正文 | `rawDisplayContent = message.content || ""`，overlay 只进入 `mergeStreamingOverlayContentParts` |
| 过程项渲染 | `Reasoning / WebSearch / CommandExecution` 是独立 `ThreadItem` | timeline / contentParts 是唯一过程显示事实源 | 单条 reasoning 可能因为早退条件掉回字符串通道 | 只要 timeline 有 reasoning/commentary/tool/action/plan，就返回结构化 parts |
| history hydrate | `TurnItem -> ThreadItem` 保留类型与 phase | hydrate 后仍复用同一 `ContentPart[]` 投影 | `Message.content` 可在有 process boundary 时恢复前导语 | 有 process boundary 时禁止从 `displayContent` 补文本，缺 final 就 fail closed |
| 去重/合并 | 只按 item provenance 与 sequence 更新 | 只合并同 source / item / turn / phase / sequence 的文本 | 当前存在正文签名、空白折叠和标点边界判断 | 删除 current path 的签名去重和展示文本恢复；保留 metadata 驱动合并 |
| Renderer | cell 只消费结构化 item | `StreamingRenderer` 只渲染 projection 结果 | renderer 无法修正 projection 错序 | lifecycle 判断前移到 projection / runtime handler，renderer 不新增语义猜测 |

## 9. 精准重构边界

本轮重构只改 `current` 显示事实源，不扩大到 App Server schema：

1. `current`
   - `AgentThreadItem` / `Message.contentParts` / `rendererContentParts`
   - `streamingTextOverlay` 作为 final-answer active tail
   - `ContentPart.metadata.source / turnId / itemId / phase / sequence`

2. `compat`
   - 没有 process boundary、没有 timeline、没有 provenance 的历史 `Message.content`
   - 只允许作为纯文本 fallback，不参与过程项前后恢复

3. `deprecated`
   - 从 `displayContent` 恢复 process 前导语
   - 按正文签名、空白折叠、标点边界推断重复
   - `turn.completed` 或运行态文案合成最终正文

4. `dead`
   - 用“已完成思考 / 正在搜索 / Finding / 今天的国际新闻”等展示文案判断 lifecycle
   - 用 CSS 或 DOM 位置修复 item 顺序

落地时优先按以下写集收口：

1. `messageListItemProjection.ts`
   - 切断 overlay 到 `rawDisplayContent`。
   - `usesProcessSeparatedFinalText` 只由结构化 parts 决定。

2. `messageListProjectionContentParts.ts`
   - `resolveProcessSeparatedContentParts` 不再接收或读取 `displayContent`。
   - 删除 current path 的 leading text restore / signature dedupe。

3. `messageListTimelineContentParts.ts`
   - 单条 reasoning/commentary 也必须进入 parts。
   - final text 只来自 `agent_message phase=final_answer` 或无 process boundary legacy fallback。

4. `streamingProjectionGuard.unit.test.ts`
   - 纳入 `messageListProjectionContentParts.ts`。
   - 禁止旧恢复函数名和动态正文匹配回流。

5. fixture / GUI E2E
   - 单测只能证明投影，不足以证明 GUI 可交付。
   - 需要继续跑 current fixture 与 Claw web-tools-rendering 场景，把截图症状变成可重复证据。
