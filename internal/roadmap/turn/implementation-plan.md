# Turn / Tool 生命周期实施计划

> 状态：in-progress
> 更新时间：2026-06-19
> 作用：把 turn/item 重构拆成可执行阶段，保证每一刀都服务 current 主链。

## 1. 主目标

主目标：

```text
把 Lime 的工具生命周期从 legacy tool event stream 收敛到 Codex-style TurnItem lifecycle，并让 App Server read model 与前端 GUI 只以 item lifecycle 作为工具状态事实源。
```

不做：

1. 不恢复 `message_requires_fresh_web_search`。
2. 不恢复 `mode_default=true` 默认 allowed。
3. 不新增 live provider 二次授权 gate。
4. 不用固定 timeout 或假进度修卡顿。
5. 不让生产路径依赖 mock fallback。

## 2. P0 文档与边界冻结

目标：先把设计写入 repo，避免后续继续按聊天结论漂移。

任务：

1. 创建 `internal/roadmap/turn/` 文档集。
2. 固定 current / compat / deprecated / dead 分类。
3. 明确 Codex 对齐原则：`TurnItem` 是事实源，legacy events 是派生兼容。
4. 明确测试矩阵和 E2E 验收口径。

完成条件：

1. README 链接完整。
2. 文档中没有把 `tool_start/tool_end` 写成 current truth。
3. 后续实现可以按文档直接分工。

## 3. P1 Rust 事件转换链收敛

状态：部分完成。

目标：让后端源头不再为同一工具调用输出两套并列事实。

主要落点：

1. `lime-rs/crates/aster-rust/crates/aster/src/agents/agent.rs`
2. `lime-rs/crates/agent/src/protocol_projection.rs`
3. `lime-rs/crates/agent/src/event_converter.rs`
4. `lime-rs/crates/agent/src/request_tool_policy.rs`

任务：

1. 盘点 provider `MessageContent::ToolRequest / ToolResponse` 到 `RuntimeAgentEvent` 的路径。
2. 确认 `TurnItemRuntimeProjector` 对 tool request/response 的 item id 生成规则稳定。
3. 调整 `convert_message`：当同一消息已能产生 item lifecycle 时，不再额外发 canonical `ToolStart/ToolEnd`；如仍需发，标记 compat source。
4. `RequestToolPolicy` 继续读取工具完成事实，但优先消费 item lifecycle 或统一后的 tool terminal projection。
5. WebSearch tracker 只保留策略判断，不参与 UI 分组。

完成条件：

1. [已完成] Aster `TurnItemRuntimeProjector` 已把 `MessageContent::ToolRequest / ToolResponse` 投影为 `ItemStarted / ItemCompleted`，tool id 直接复用 tool request id。
2. [已完成] `RequestToolPolicy` 已优先消费 `ItemStarted / ItemUpdated / ItemCompleted` 的 `ToolCall` item，并把 legacy `ToolStart / ToolEnd` 作为兼容 fallback；late legacy terminal 不覆盖 item terminal。
3. [待完成] legacy `ToolStart / ToolEnd` 仍保留给 coding mirror、tool delta lifecycle 和外部兼容，后续只能继续收缩 GUI current 引用，不能直接删除 operational stream。

证据：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy -- --nocapture
```

结果：`48 passed`，覆盖 `tracker_accepts_required_websearch_from_item_lifecycle`、`tracker_keeps_item_terminal_when_late_legacy_tool_end_conflicts`、`web_search_synthesis_boundary_accepts_item_lifecycle_counts`。

## 4. P2 App Server read model item-first

状态：已完成当前阶段。

目标：让 event log 和 ThreadReadModel 以 item lifecycle 聚合 turn。

主要落点：

1. `lime-rs/crates/app-server/src/runtime_backend/tool_events.rs`
2. `lime-rs/crates/app-server/src/runtime/event_log.rs`
3. `lime-rs/crates/app-server/src/runtime/event_store.rs`
4. `lime-rs/crates/app-server/src/runtime/projection_store.rs`

任务：

1. 定义 `turn_id + item_id` 聚合键。
2. 对 `tool.started/tool.result` 增加 compat 降级规则。
3. 如果同一 `toolCallId` 已存在 item，legacy tool terminal event 只能补 metadata / diagnostics。
4. 历史 legacy tool event 允许合成 synthetic item，并标记 `source=legacy_tool_event`。
5. read model 输出 items 时保证 sequence、status、timestamps 完整。

完成条件：

1. [已完成] event replay 通过 `tool_item_projection::tool_items_from_events` 重建 tool item 列表。
2. [已完成] completed item 不被 late legacy `tool.failed` 或 late `item.updated(in_progress)` 降级。
3. [已完成] legacy-only `tool.started/tool.result/tool.failed` 会合成 `metadata.source=legacy_tool_event` 的 synthetic item，保证历史 hydrate 可用。

证据：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime::tests::read_model -- --nocapture
```

结果：`9 passed`，覆盖 `read_session_prefers_item_lifecycle_over_conflicting_legacy_tool_events`、`read_session_keeps_legacy_only_tool_events_as_synthetic_items`、`read_session_does_not_downgrade_completed_item_with_late_item_update`。

## 5. P3 前端 projection item-first

状态：当前前端投影阶段已完成，后续继续把后端/read model 与前端 projection store 更系统地收窄到 item-first。

目标：前端工具卡由 `threadItemProjection` 驱动，legacy tool projection 只补细节。

主要落点：

1. `src/lib/api/agentProtocol.ts`
2. `src/components/agent/chat/projection/threadItemProjection.ts`
3. `src/components/agent/chat/projection/toolEventProjection.ts`
4. `src/components/agent/chat/projection/conversationProjectionStore.ts`
5. `src/components/agent/chat/components/MessageList*`
6. `src/components/agent/chat/hooks/agentChatHistory.ts`

任务：

1. 给 projection store 增加 `turnId + itemId/toolCallId` 去重规则。
2. `threadItemProjection` 负责工具卡主事件。
3. `toolEventProjection` 只更新已存在工具的 input/output/progress。
4. legacy tool event 无法绑定 turn/item 时只进 diagnostics。
5. Message timeline 按 turn 分组，按 item sequence 渲染。
6. 第二轮输入时只清 active turn buffer，不清 completed turn。

完成条件：

1. [已完成] live stream handler 已接入 `getThreadItems` 只读快照，legacy `tool_start/tool_end/progress/delta` 只有在没有 item lifecycle 接管时才更新 message 层工具卡；一旦同 turn/tool 已有非 legacy item lifecycle，legacy 事件只更新 timeline item / projection detail，不再新建或改写 `message.toolCalls` 主过程源。
2. [已完成] `item_started/item_updated/item_completed` 为 `tool_call` 时会同步已有 legacy `message.toolCalls/contentParts.tool_use`，避免旧消息层停在 `running`。
3. [已完成] 同一 turn/tool 的 completed/failed item terminal 优先，late legacy tool event 不再降级或覆盖 message 层工具状态。
4. [已完成] 联网搜索 / 抓取批次在运行中默认展开为轻量进度，不再只给单行“正在输出”假象。
5. [已完成] 搜索批次里穿插思考时，展开态按原事件顺序保留思考与工具片段，不让思考被工具摘要吞掉。
6. [已完成] 运行中的 WebSearch / WebFetch 批次显示“正在搜索网页”，全部终态后才显示“已搜索网页”，避免用户把长时间搜索误判为已完成但卡住。
7. [已完成] MessageList item projection 已在 `rendererConversationContentParts` 含 `tool_use` 时关闭 legacy `message.toolCalls` fallback，避免 timeline/thread item 已经生成工具过程后再次渲染第二套工具卡。
8. [已完成] Codex / imported 对话继续走同一套 `threadItems -> contentParts -> rendererContentParts` 过程渲染；`imported/imported_synthetic/source_client` 只表达只读来源，不创建独立 UI 事实源，也不触发重新执行。
9. [已完成] 显式 `phase=commentary` 的 `agent_message` 只作为过程 `thinking` 渲染，只有 `final_answer` / legacy 最后一条无 phase agent message 才能进入最终正文，避免 running WebSearch 后的中间说明越序显示成答案。
10. [已完成] WebSearch / WebFetch 仍处于 `running / in_progress` 时，即使 `final_answer` item、streaming overlay 或 `message.content` 已提前带有正文，MessageList 也会先隐藏最终正文，只保留工具过程和显式 commentary / thinking；工具终态后再显示最终答复，避免“上面还在搜索、下面已出答案”的时序错乱。
11. [已完成] read model 已 terminal 且 assistant 有最终正文时，不再被本地残留 `runtimeStatus` / `isThinking` 拖回 `assistant-streaming-inline-indicator` 或“正在输出”。
12. [已完成] 用户上拉阅读时，流式 overlay 更新不再强制滚回底部；只有用户仍在底部附近或重新滚回底部后才恢复自动跟随。
13. [已完成当前阶段] MessageList 已把 `threadItems/timeline` 作为工具、计划、reasoning 过程主渲染；`message.toolCalls` 只在没有真实 process timeline item 时作为 compat fallback。`turn_summary` 只是状态摘要，不会屏蔽 legacy 兜底。
14. [已完成] 真实 live WebSearch + WebFetch smoke 已验证 provider stream、工具事件顺序、turn completed 和无 runtime mock fallback。
15. [已完成] 第二轮流式输出时，第一轮完整正文与工具过程不被截断或覆盖，已由 MessageList 回归锁定；最新截图已人工复核时序正确。
16. [已完成] WebSearch / WebFetch 混合批次的 GUI 摘要会同时显示搜索次数与读取次数，例如 `已搜索网页 1 次，读取网页 1 次`；展开态继续保留查询、来源 URL 和 WebFetch 快照，不暴露原始页面 payload 或失败诊断。
17. [已完成] `plan` item 已作为 Codex-style 一等 item 内联成 `<proposed_plan>...</proposed_plan>` 计划块，由 `StreamingRenderer` 渲染；内联计划覆盖外置 timeline 计划项，避免计划内容重复显示。
18. [已完成] 历史 hydrate 已把 `thread_read.tool_calls` 限定为 compat fallback：只在没有真实 process timeline item 时注入 message 层工具过程；当 `detail.items` 已有 `tool_call / command_execution / patch / web_search / reasoning / plan` 等过程时，`thread_read.tool_calls` 不再合成第二套 `message.toolCalls/contentParts.tool_use`。

证据：

```bash
npx vitest run "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts"
npx vitest run "src/components/agent/chat/hooks/agentStreamTurnEventBinding.test.ts" "src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts"
```

结果：`31 passed` + `11 passed`，覆盖 `item_completed 应把已有 legacy 工具卡同步为完成态`，以及 `getThreadItems` 透传链不破坏 submit / turn event binding。
2026-06-18 新补前端交互证据：

- `StreamingRenderer.test.tsx`：`62 passed`，覆盖联网搜索运行中默认展开、搜索与思考穿插顺序、混合搜索结果预览和旧折叠回归。
- `InlineToolProcessStep.test.tsx`：`22 passed`，保持单条工具卡的细节展开与搜索预览行为不回流。
- `toolBatchGrouping.test.ts`：覆盖运行中 WebSearch / WebFetch 摘要为进行态，不伪装成完成态。
- `agentThreadGrouping.test.ts`：`19 passed`，覆盖历史 / read model `in_progress` WebSearch 摘要为进行态。
- `messageListItemProjection.unit.test.ts`：`18 passed`，覆盖 timeline 已有工具 item 时不再渲染 legacy `message.toolCalls`，以及 Codex 导入 timeline 保留只读工具过程。
- `messageListItemProjection.unit.test.ts`：新增 running WebSearch 后 commentary 不越序成为最终正文；`phase=commentary` 留在过程流，`actionContent/rendererRawContent` 为空直到 final answer 到达。
- `messageListItemProjection.unit.test.ts`：新增 running WebSearch 下 `final_answer` item、streaming overlay、`message.content` 三条旁路都不得提前出现在最终正文区；完成态不再吞掉最终正文。
- `MessageList.test.tsx`：新增用户上拉后流式 overlay 不抢回底部，以及第二轮流式输出不截断第一轮完整正文与工具过程。
- `MessageList.test.tsx`：新增 read model 已完成且 assistant 有最终正文时不显示残留“正在输出”。
- `conversationImportDialogViewModel.unit.test.ts` + `sidebarSessions.test.ts`：`12 passed`，覆盖导入入口和侧栏会话形状未被 timeline 渲染收口破坏。
2026-06-19 本轮补充前端投影收口证据：

- `messageListItemProjection.unit.test.ts` + `messageListTimelineContentParts.unit.test.ts` + `messageListInlineProcess.test.ts`：`46 passed`，覆盖 current timeline process item 与 legacy `message.toolCalls` 去重、`turn_summary` 不屏蔽 legacy fallback、Codex 导入只读过程渲染、`plan` item 内联覆盖外置 timeline。
- `MessageList.test.tsx` 定向：`7 passed, 141 skipped`，覆盖完成态 plan 内联、timeline 工具过程内联、历史 / 当前过程不重复外置。
- `StreamingRenderer.test.tsx` 定向：`25 passed, 37 skipped`，覆盖 `<proposed_plan>`、WebSearch / WebFetch、工具批次和失败工具回归。
- 相关 ESLint 通过，覆盖 `messageListItemProjection.ts`、`messageListTimelineContentParts.ts`、`messageListInlineProcess.ts` 及其测试。
2026-06-19 本轮补充 stream handler legacy fallback 收口证据：

- `agentStreamRuntimeHandler.unit.test.ts` 定向：`4 passed, 28 skipped`，覆盖已有 item lifecycle 时 `tool_input_delta/tool_progress/tool_output_delta/tool.failed` 不再新建或改写 `message.toolCalls`，但仍更新 `threadItems` 与 Agent UI projection detail。
- `conversationProjectionStore.test.ts`：`9 passed`，保持 item lifecycle 回收 legacy `tool.started/tool.result` 主事件、不同 turn 同名 toolCallId 不误删。
- `npm run smoke:agent-runtime-current-fixture`：通过，覆盖 history/cache hydration、final_done 工具收尾、failed read model、Claw 终态 UI、code artifact workbench Electron fixture、Claw cancel-then-continue Electron fixture；`liveProviderUsed=false`。
2026-06-19 本轮补充 history hydrate item-first 收口证据：

- `agentChatHistory.test.ts` 定向：`5 passed, 56 skipped`，覆盖无 timeline 时 `thread_read.tool_calls` 仍兜底、Codex 导入 `detail.items` 合入助手消息、timeline 已有工具过程时不再注入 `thread_read.tool_calls` 兼容摘要。
- `agentChatHistory.test.ts` 全量：`61 passed`，覆盖历史 hydrate、runtime turn 归位、回复截断防回归和 tool response 恢复。
- ESLint：`agentChatHistory.ts` 与 `agentChatHistory.test.ts` 通过。
- `npm run smoke:agent-runtime-current-fixture`：通过，覆盖 history/cache hydration、流式完成态、MessageList 终态 UI、Electron fixture guard、Coding Workbench Electron fixture 和 Claw cancel-then-continue Electron fixture；`liveProviderUsed=false`。
- `npm run smoke:agent-session-history-electron-fixture`：通过，真实 Electron Desktop Host 经 App Server current `initialize / agentSession/start / agentSession/read / agentSession/update / agentSession/list` 验证历史恢复、归档 / 反归档和 settings GUI restore 链路。

Codex 参考事实：

- `/Users/coso/Documents/dev/rust/codex/sdk/typescript/src/events.ts` 中 canonical stream 是 `item.started / item.updated / item.completed`。
- `/Users/coso/Documents/dev/rust/codex/sdk/typescript/src/items.ts` 与 `codex-rs/app-server-protocol/schema/typescript/v2/ThreadItem.ts` 中工具调用状态属于 `ThreadItem`，如 `mcp_tool_call / mcpToolCall`、`dynamicToolCall`、`webSearch` 等。
- 因此 Lime current GUI 也必须继续向 `TurnItem / AgentThreadItem` 收敛，legacy `tool.*` 只能作为 compat detail 或历史 synthetic item 来源。

## 6. P4 策略与治理收口

状态：部分完成。

目标：封住旧策略和旧事实源回流。

任务：

1. 清理或禁止新增 `message_requires_fresh_web_search` 类关键词判断。
2. 确认 `mode_default=true` 不再作为普通 Claw 默认 allowed。
3. 确认 live provider 连接不需要额外 UI 授权 gate。
4. 为 legacy tool stream current 引用增加治理守卫。
5. 更新相关路线图或执行计划中的退出条件。

完成条件：

1. [已完成] `message_requires_fresh_web_search` 与 `mode_default=true` 回流由 `scripts/check-app-server-client-contract.mjs` 阻断。
2. [已完成] `RequestToolPolicy` item-first tracker 守卫已纳入 contract，避免策略重新只依赖 legacy `ToolStart / ToolEnd`。
3. [已完成] `npm run test:contracts` 通过，生产 mock fallback 扫描仍为 `mock priority commands: 0`。
4. [待完成] 前端 projection 的 legacy `tool.*` 展示残留仍需继续按 P3 收缩。

## 7. P5 真实 GUI / E2E 验收

状态：fixture smoke、GUI smoke 与真实 live streaming smoke 已通过；本轮搜索 / 最终答复时序截图已复核通过，WebFetch 已在收起摘要中显式显示读取次数。

目标：证明产品主路径真实可用。

验证顺序：

1. `npm run smoke:agent-runtime-current-fixture`
2. `npm run smoke:claw-chat-current-fixture`
3. `npm run test:contracts`
4. `npm run verify:gui-smoke`
5. Playwright / Electron 真实联网 E2E

真实 E2E 场景：

1. 发起需要联网的问题。
2. 验证 submit 后及时出现真实 turn running 状态。
3. 验证 WebSearch / WebFetch 各自成为独立工具 item。
4. 验证 final answer 与工具结果分离。
5. 发送第二条消息。
6. 验证第一条回复完整保留。

完成条件：

1. [已完成] current fixture 覆盖 Claw 停止后同会话继续输出，证明 current session 第二轮没有被 cancel 卡死。
2. [已完成] `npm run smoke:agent-runtime-current-fixture` 通过，`liveProviderUsed=false`。
3. [已完成] `npm run verify:gui-smoke` 已通过，最终输出 `claw workbench shell ready`。
4. [已完成] `npm run smoke:claw-chat-ready-streaming -- --timeout-ms 180000` 通过，真实 provider `custom-cb381b4f-d2fa-4eff-ba22-c867c38ba8d3 / gpt-5.5`，WebSearch 与 WebFetch 均出现 started/result，turn completed，无 runtime mock fallback。
5. [已完成] 最新截图 `.lime/qc/gui-evidence/claw-chat-ready-streaming/claw-chat-ready-streaming-05-live-web-tools-final.png` 已人工复核：搜索工具为完成态后才出现最终答复，没有再出现“搜索中 + final 已显示”的错序。
6. [已完成] 工具过程展示已把 WebFetch 纳入 GUI 收起摘要，最终截图可见 `已搜索网页 1 次，读取网页 1 次`；live evidence 中 WebSearch / WebFetch 均有 started/result。
7. [待完成] 仍可继续 polish 展开态信息密度：当 WebFetch 数量较多时，考虑把“搜索来源”和“读取页面”在展开列表里分组，但不得恢复两套工具事实源。
8. [已完成] 2026-06-19 真实 live E2E 复跑通过：session `sess_c0a24b00f5e54626b36a428f06de2c2e`，live web turn `eeb72c03-efa5-408b-a907-4e874a0e70c8`；断言包含 `liveWebSearchCompleted=true`、`liveWebFetchCompleted=true`、`liveWebRequiredToolsCompleted=true`、`liveWebRequiredToolEventOrderValid=true`、`noRuntimeMockFallbackSeen=true`、`noBlockingConsoleErrors=true`。首次 live run 曾在 app-server stopping / `3030` reset 的环境准备态失败，随后 `smoke:agent-runtime-current-fixture` 与 live E2E 复跑通过，未归类为 projection 逻辑失败。

## 8. 风险与处理

| 风险 | 表现 | 处理 |
| --- | --- | --- |
| provider 事件缺少 stable id | tool delta 无法归属 | 后端生成 adapter-local stable id，并写入 metadata |
| 历史数据只有 legacy tool event | 老会话工具卡缺失 | synthetic item fallback，标记 legacy source |
| 前端 active buffer 与 history hydrate 竞争 | 回复截断或重复 | 按 turn/item key merge，terminal item 优先 |
| WebSearch 循环太久 | 用户感觉卡住 | item started/progress 可见，策略只做证据收口，不用 timeout 假完成 |
| 多模型 tool schema 不同 | arguments/output 形状不一致 | adapter 归一化为 `tool_call` item payload |

## 9. 退出条件

可以认为本路线图完成的条件：

1. 所有 current submit turn 都发出 item lifecycle。
2. 前端工具主状态不再依赖 legacy `tool_start/tool_end`。
3. legacy event 只在历史/兼容/delta 场景出现。
4. 测试覆盖混合事件、历史 hydrate、第二轮输入、真实联网多工具。
5. 文档、测试和 E2E evidence 都能证明 Codex-style item-first 已成为事实源。
6. 搜索 / 抓取类工具在运行时有可见进度，且不会把搜索中间的思考吞成单一折叠条。
