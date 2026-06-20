# Turn / Tool 生命周期测试用例

> 状态：已完成当前阶段
> 更新时间：2026-06-19
> 作用：把 turn/item 重构转成可执行测试矩阵，避免只靠视觉判断或单点 smoke 宣称完成。

## 1. 测试目标

测试只服务这条主链：

```text
submit turn
  -> item lifecycle
  -> event log
  -> ThreadReadModel
  -> AgentUI projection
  -> Workspace timeline
```

必须证明：

1. 同一工具调用只有一个 canonical item。
2. legacy `tool.*` 不会创建重复工具卡。
3. 多工具 WebSearch / WebFetch 不串线。
4. 首字慢时有真实状态。
5. 第二轮输入不截断上一轮。
6. 历史 hydrate 与 live stream 可归并。
7. 真实联网 E2E 可复现并通过。
8. 搜索进行中必须显示进行态，不可伪装成完成态。
9. 搜索仍在运行时，后续 `commentary` 不能越序成为最终正文。
10. 用户上拉阅读历史输出时，流式追加不能强制滚回底部。
11. `plan` item 必须以内联 `<proposed_plan>` 计划块进入 assistant 过程流，不能外置重复展示。
12. `message.toolCalls` 只能在没有真实 process timeline item 时作为 compat fallback。

## 2. 测试分层

| 层级 | 目的 | 推荐入口 |
| --- | --- | --- |
| Rust unit | 验证事件转换、item lifecycle、策略收口 | affected crate tests |
| App Server projection | 验证 event log/read model 聚合 | runtime_backend / runtime tests |
| Contract | 验证 App Server、前端 gateway、bridge 同步 | `npm run test:contracts` |
| Frontend unit | 验证 projection store 和 MessageList | targeted `*.test.ts(x)` |
| Fixture smoke | 验证 current agent runtime 主链 | `npm run smoke:agent-runtime-current-fixture` |
| GUI smoke | 验证桌面 GUI 可交付 | `npm run verify:gui-smoke` |
| Live E2E | 验证真实联网和 provider stream | Playwright / Electron live run |

## 3. Rust unit 用例

| ID | 用例 | 输入 | 断言 |
| --- | --- | --- | --- |
| TURN-RUST-001 | ToolRequest 生成 tool item | provider message 含 `ToolRequest(id=tool-1)` | 输出 `ItemStarted(tool_call tool-1)` |
| TURN-RUST-002 | ToolResponse 完成同一 item | provider message 含 `ToolResponse(id=tool-1)` | 输出 `ItemCompleted(tool_call tool-1)`，不生成第二个 id |
| TURN-RUST-003 | item 与 legacy tool 混合不重复 | 同一工具同时有 item 和 `ToolStart/ToolEnd` | canonical event 数量为 1，legacy 标记 compat |
| TURN-RUST-004 | tool input delta 绑定工具 | `ToolInputDelta(tool-1)` | 不改变 item terminal status |
| TURN-RUST-005 | tool output delta 绑定工具 | `ToolOutputDelta(tool-1)` | 只追加 transient output |
| TURN-RUST-006 | failed tool terminal | `ToolResponse` error | `ItemCompleted(status=failed,error)` |
| TURN-RUST-007 | WebSearch tracker 不驱动 UI 分组 | WebSearch + WebFetch 成功 | tracker 只返回策略状态，不生成 UI 分组字段 |
| TURN-RUST-008 | provider 尾段失败保留工具结果 | tool completed 后 stream error | completed tool item 保持 completed |
| TURN-RUST-009 | WebFetch 默认回灌按相关片段裁剪 | HTML / 文本正文含大量无关段落，prompt 指向局部主题 | 默认返回相关片段，避免把整页内容塞回模型 |
| TURN-RUST-010 | WebFetch HTML 清洗去除样式脚本 | HTML 含 `head/style/script/meta` 与正文 | 输出只保留正文文本，不包含 CSS / JS 噪音 |
| TURN-RUST-011 | 连续普通 user turn 不合并 | 两条连续 `Role::User`，第一条为恢复指令，第二条为 `@搜索` 联网指令 | 输出仍为两个独立 user message，避免跨 turn 串话 |
| TURN-RUST-012 | MOIM 注入不污染用户原文 | 注入 `<info-msg>` 时前后存在普通 user / assistant | MOIM 为 `agent_only()` 独立消息，不依赖 user merge，不显示给用户 |
| TURN-RUST-013 | WebFetch HTML 清洗去除内联属性噪音 | HTML 含 `style=mask-image...`、`class=wp-block`、`data:*`、`aria-label` 与正文 | 输出保留正文，不包含 `mask-image/wp-block/data:image/aria-label` |
| TURN-RUST-014 | legacy ToolEnd 强制标记 compat | `MessageContent::ToolResponse` 派生 legacy `ToolEnd`，工具 metadata 自带 `source/canonical` | `ToolEnd.result.metadata.source=legacy_message_tool_response`、`compat=true`、`canonical=false`，同时保留工具自有 `exit_code` |
| TURN-RUST-015 | 失败 legacy ToolEnd 也标记 compat | `MessageContent::ToolResponse` error | `ToolEnd.success=false`，metadata 仍有 `source=legacy_message_tool_response`、`compat=true`、`canonical=false` |

## 4. App Server / read model 用例

| ID | 用例 | 输入事件 | 断言 |
| --- | --- | --- | --- |
| TURN-RM-001 | item started 创建 read item | `item.started(tool-1)` | `ThreadReadModel.items[tool-1].status=in_progress` |
| TURN-RM-002 | item completed 更新同一 read item | `item.started -> item.completed` | item 数量为 1，status completed |
| TURN-RM-003 | legacy tool result 不覆盖 item | `item.completed(success=true) -> tool.failed(tool-1)` | status 仍 completed，记录 conflict diagnostics |
| TURN-RM-004 | legacy-only 合成 synthetic item | 只有 `tool.started -> tool.result` | 生成 item，metadata.source=`legacy_tool_event` |
| TURN-RM-005 | completed item 不降级 | `item.completed -> item.updated(in_progress)` | terminal state 不被降级 |
| TURN-RM-006 | sequence 稳定排序 | 多 item out-of-order 到达 | read model 按 sequence 排序 |
| TURN-RM-007 | turn failed 保留 completed tools | tool completed 后 turn failed | completed tool 仍可见，turn status failed |
| TURN-RM-008 | history + live 去重 | history completed item + live duplicate | 只保留一个 item |

## 5. Frontend projection 用例

| ID | 用例 | 输入 | 断言 |
| --- | --- | --- | --- |
| TURN-FE-001 | item-first 工具卡 | `item_started(tool_call)` | projection 生成一张工具卡 |
| TURN-FE-002 | legacy tool_start 不重复 | `item_started(tool-1) + tool_start(tool-1)` | 工具卡数量为 1 |
| TURN-FE-003 | tool_output_delta 补充详情 | existing `tool-1` + output delta | delta 出现在同一工具详情 |
| TURN-FE-004 | 无法归属的 tool delta 进 diagnostics | `tool_output_delta` 无 active turn / item | 不渲染工具卡 |
| TURN-FE-005 | final answer 不接工具输出 | tool output 后 text delta | text delta 出现在 assistant buffer |
| TURN-FE-006 | 第二轮不截断第一轮 | turn-1 completed 后 turn-2 stream | turn-1 final text 完整 |
| TURN-FE-007 | history hydrate 不覆盖 live terminal | live partial + history completed | terminal item 优先 |
| TURN-FE-008 | WebSearch / WebFetch 分开展示 | 两个 tool item | 两张独立工具卡 |
| TURN-FE-009 | item terminal 同步 legacy message 工具卡 | 已存在 `message.toolCalls/tool_use` running，再收到 `item_completed(tool_call)` | 已有 message 层工具卡变 completed，不新建重复卡 |
| TURN-FE-010 | item terminal 后 late legacy 不覆盖 | `item_completed(tool_call)` 后再到同 turn/tool 的 `tool_end/tool_progress` | message 层保持 item terminal，不降级、不串线 |
| TURN-FE-011 | 运行中的 WebSearch / WebFetch 用进行态摘要 | `web_search` / `WebFetch` status=`running` 或 `in_progress` | 摘要显示“正在搜索网页”，展开态显示进度，不伪装成完成态 |
| TURN-FE-012 | timeline 已有工具 item 时不再渲染 legacy fallback | 同一 assistant message 同时有 timeline `tool_call` 和 legacy `message.toolCalls` | `rendererContentParts` 只保留 timeline 生成的 `tool_use`，`rendererToolCalls` 为空 |
| TURN-FE-013 | Codex 导入 timeline 共用 live 过程渲染语义 | imported metadata 的 reasoning / command / final answer | 渲染为 `thinking -> tool_use -> text`，只读但不走独立导入 UI |
| TURN-FE-014 | running 工具后的 commentary 不作为最终正文 | `commentary -> web_search completed -> web_search in_progress -> commentary` | `rendererContentParts` 为 `thinking/tool_use/tool_use/thinking`，`actionContent` 与 `rendererRawContent` 为空 |
| TURN-FE-015 | 用户上拉后流式追加不抢滚动 | scroll container 已离底部并收到 overlay 更新 | 不调用 `scrollIntoView`，保留用户阅读位置 |
| TURN-FE-016 | 第二轮 overlay 不覆盖第一轮完整回复 | turn-1 completed 后 turn-2 assistant overlay | turn-1 的 text 与 `tool_use` 保留，turn-2 只显示自己的 overlay |
| TURN-FE-017 | running 搜索后 final/overlay/content 都不得越序显示 | `web_search in_progress` 后 `final_answer`、overlay 或 `message.content` 已有正文 | `rendererContentParts` 只保留工具与 thinking/commentary，`actionContent / rendererRawContent` 为空 |
| TURN-FE-018 | completed read model 清理“正在输出”残留 | thread read status=`completed` 且 assistant 有最终正文，本地 `runtimeStatus` 仍 running | 不渲染 `assistant-streaming-inline-indicator`，`StreamingRenderer.isStreaming=false` |
| TURN-FE-019 | WebFetch 在混合搜索批次中显式可见 | `web_search completed + WebFetch completed/failed` | 批次标题和 `countLabel` 同时显示搜索次数与读取次数，展开态保留 URL / 快照，不暴露原始 payload |
| TURN-FE-020 | plan item 内联渲染 | timeline 中存在 `type=plan` | `rendererContentParts` 含 `<proposed_plan>` text，`StreamingRenderer.renderProposedPlanBlocks=true`，外置 timeline 不重复展示 |
| TURN-FE-021 | turn_summary 不屏蔽 legacy fallback | timeline 只有 `turn_summary`，旧消息有 `message.toolCalls` | legacy `message.toolCalls` 仍可作为 compat 过程源 |
| TURN-FE-022 | process timeline 禁用 legacy fallback | timeline 有 `tool_call / web_search / reasoning / plan / context_compaction` 等 process item，旧消息也有 `message.toolCalls` | 只渲染 timeline 过程，不再渲染第二套 legacy 工具卡 |
| TURN-FE-023 | item lifecycle 存在时 legacy delta 不新建 message 工具卡 | `threadItems` 已有非 legacy `tool_call`，随后收到 `tool_input_delta/tool_progress/tool_output_delta` | `threadItems` 与 Agent UI projection detail 更新，`message.toolCalls/contentParts.tool_use` 不新增 |
| TURN-FE-024 | item lifecycle 存在时 legacy failed 不改 message 主状态 | `threadItems` 已有非 legacy `tool_call`，随后收到 `tool.failed` | read item 进入 failed，旧 message 层工具卡不被 legacy terminal 改写 |
| TURN-FE-025 | history hydrate 禁用 thread_read 工具摘要重复注入 | `detail.items` 已有 process timeline item，同时 `thread_read.tool_calls` 也包含同一工具 | hydrate 后 assistant 只保留 timeline 生成的一份 `tool_use/toolCalls`，`thread_read.tool_calls` 不覆盖输出 |
| TURN-FE-026 | history hydrate 保留 thread_read 兼容兜底 | 无 `detail.items` process timeline，但 `thread_read.tool_calls` 有工具摘要 | hydrate 后旧历史仍显示 `tool_use/toolCalls`，确保 legacy-only / read-model-only 会话可恢复 |
| TURN-FE-027 | WebSearch / WebFetch 展开态分组 | 同一搜索批次含 WebSearch 结果和多个 WebFetch 读取 URL | 展开态显示 `搜索来源` 与 `读取页面` 两组；来源仍可点击预览，读取页面不暴露原始 payload / 失败诊断 |

## 6. Contract 用例

| ID | 用例 | 检查对象 | 断言 |
| --- | --- | --- | --- |
| TURN-CONTRACT-001 | App Server event 类型同步 | protocol / frontend parser | `item_started/item_updated/item_completed` 可解析 |
| TURN-CONTRACT-002 | tool delta 字段同步 | App Server / TS 类型 | `tool_id/delta/output_kind/metadata` 形状一致 |
| TURN-CONTRACT-003 | mock 不成为生产 fallback | bridge / mocks catalog | 生产 submit 不依赖 mock |
| TURN-CONTRACT-004 | legacy tool current 引用受控 | governance catalog | legacy tool stream 只标 compat |
| TURN-CONTRACT-005 | history API 返回 items | session get/list | turn items 字段完整 |
| TURN-CONTRACT-006 | 前端 stream handler 保持 item-first | `agentStreamRuntimeHandler.ts` | 存在 `shouldLetLegacyToolEventUpdateMessageLayer`、`syncExistingMessageToolCallFromThreadItem`、`getThreadItems` |
| TURN-CONTRACT-007 | 前端单测锁住 item terminal 同步 | `agentStreamRuntimeHandler.unit.test.ts` | 覆盖 `item_completed 应把已有 legacy 工具卡同步为完成态` |
| TURN-CONTRACT-008 | MessageList 禁止 legacy 工具过程回流为主渲染 | `messageListItemProjection.ts` / `messageListItemProjection.unit.test.ts` | `message.toolCalls` 只在没有真实 process timeline item 时作为 compat fallback；timeline 已有过程项时关闭第二套 legacy 渲染 |
| TURN-CONTRACT-009 | legacy message ToolEnd 不可冒充 canonical | `lime-rs/crates/agent/src/event_converter.rs` | 存在 `legacy_message_tool_response_metadata` 和成功 / 失败 ToolResponse compat 测试，contract 阻止无标记 legacy `ToolEnd` 回流 |

最低入口：

```bash
npm run test:contracts
```

## 7. Fixture smoke 用例

| ID | 用例 | 操作 | 断言 |
| --- | --- | --- | --- |
| TURN-FIXTURE-001 | current fixture 普通 turn | `npm run smoke:agent-runtime-current-fixture` | 出现 `turn_completed`，items 完整 |
| TURN-FIXTURE-002 | Claw fixture stream | `npm run smoke:claw-chat-current-fixture` | `message.delta + turn.completed` 正常 |
| TURN-FIXTURE-003 | fixture tool lifecycle | fixture 后端返回工具事件 | UI / read model 只有一个工具 item |
| TURN-FIXTURE-004 | fixture second turn | 连续 submit 两轮 | 第一轮不截断 |

## 8. GUI smoke 用例

| ID | 用例 | 用户操作 | 期望 GUI |
| --- | --- | --- | --- |
| TURN-GUI-001 | submit 后立即可见状态 | 输入普通问题 | 出现 running / preparing 状态 |
| TURN-GUI-002 | 工具开始可见 | 触发工具调用 | 工具卡出现，状态 running |
| TURN-GUI-003 | 工具完成可见 | 工具返回结果 | 同一工具卡变 completed |
| TURN-GUI-004 | 多工具不串线 | 触发 WebSearch + WebFetch | 两个工具分别显示 |
| TURN-GUI-005 | final answer 与工具分离 | 工具后模型总结 | 总结在 assistant 正文区域 |
| TURN-GUI-006 | 第二轮保持历史 | 再发送一条消息 | 上一轮完整保留 |
| TURN-GUI-007 | 用户上拉阅读不中断 | 输出中向上滚动 | 新 token 到达时页面不抢回底部 |
| TURN-GUI-008 | 搜索仍运行时不提前显示最终正文 | WebSearch 仍 running 后出现 commentary | commentary 只显示为过程，最终正文区不越序出现答案 |
| TURN-GUI-009 | 搜索工具完成后才显示最终答复 | WebSearch/WebFetch 真实完成并收到 final answer | 工具卡为完成态，最终答复显示在工具过程之后，不再显示“正在输出”残留 |

最低入口：

```bash
npm run verify:gui-smoke
```

## 9. 真实联网 E2E 用例

| ID | 用例 | 操作 | 断言 |
| --- | --- | --- | --- |
| TURN-LIVE-001 | 真实联网首屏反馈 | 发起需要最新信息的问题 | submit 后短时间内有 turn/item/status 可见 |
| TURN-LIVE-002 | WebSearch 独立 item | provider 调 WebSearch | WebSearch 工具事件与 item 可复核 |
| TURN-LIVE-003 | WebFetch 独立 item | provider 调 WebFetch | WebFetch 工具事件与 item 可复核 |
| TURN-LIVE-004 | 不重复工具卡 | live event 同时含 legacy tool | 每个 toolCallId 只一张卡 |
| TURN-LIVE-005 | 最终答复可见 | 等待 turn completed | assistant 正文完整 |
| TURN-LIVE-006 | 第二轮不截断 | 第一轮完成后发第二轮 | 第一轮文本和工具卡保持 |
| TURN-LIVE-007 | event log 可复核 | 读取 session jsonl | event sequence 与 UI 一致 |
| TURN-LIVE-008 | WebFetch 读取次数可见 | 真实 WebSearch 后触发 WebFetch | 最终截图中搜索过程摘要显示 `读取网页 N 次`，且最终答复在工具完成态之后 |
| TURN-LIVE-009 | 连续 user turn 不串话 | 停止 / 恢复后再发送 `@搜索` live turn | provider request 的 `last_user_preview` 只包含当前 `@搜索` 指令，不拼接上一轮恢复指令 |
| TURN-LIVE-010 | WebFetch 工具回灌为干净正文 | live WebFetch 抓取公开新闻页面 | tool result preview 为正文片段，不含 CSS / HTML 属性噪音，最终 turn completed |

建议执行：

```bash
npm run smoke:claw-chat-ready-streaming -- --timeout-ms 180000
```

然后用 Playwright 检查 GUI：

1. 工具卡数量。
2. 每张工具卡 title/status。
3. assistant final text。
4. 第二轮后的历史完整性。

## 10. Governance guard 用例

| ID | 用例 | 检查 | 断言 |
| --- | --- | --- | --- |
| TURN-GOV-001 | 禁止关键词联网策略回流 | 搜索 `message_requires_fresh_web_search` | 不允许 current 引用 |
| TURN-GOV-002 | 禁止默认 allowed 回流 | 搜索 `mode_default=true` / 等价配置 | 普通 Claw 不默认 allowed |
| TURN-GOV-003 | 禁止 tool stream current truth | 搜索新增 projection | `tool_start/tool_end` 不作为主工具卡 owner |
| TURN-GOV-004 | 禁止 mock fallback | 检查 bridge/runtime | 生产路径不走 mock backend |
| TURN-GOV-005 | 禁止 timeout 合成完成态 | 搜索 grace/final timeout | 不用固定 timeout 伪造 `turn_completed` |
| TURN-GOV-006 | smoke 不用重复文案计数误判恢复 | 停止后恢复结果只显示一次 | GUI 可见一次恢复结果或 read model 已持久化即判定恢复闭环，不要求重复出现 |

## 11. 完成门槛

实现完成必须同时满足：

1. [已完成] Rust unit 覆盖 item-first WebSearch tracker、late legacy terminal conflict 和 item lifecycle synthesis boundary。
2. [已完成] App Server read model 覆盖 item-first 聚合、legacy synthetic item 和 terminal priority。
3. [已完成当前阶段] Frontend projection 已补 `item_completed` 同步已有 legacy 工具卡、MessageList process timeline 禁用 legacy `message.toolCalls` fallback、历史 hydrate 禁用 `thread_read.tool_calls` 重复注入，并由 current fixture / live E2E 覆盖 WebSearch + WebFetch GUI 时序。
4. [已完成] Contract 通过，并包含 `message_requires_fresh_web_search`、`mode_default`、item-first tracker、frontend stream handler item-first、MessageList legacy fallback gating、legacy message ToolEnd compat 标记和 production mock fallback 守卫。
5. [已完成] `npm run verify:gui-smoke` 已通过，最终输出 `claw workbench shell ready`。
6. [已完成] 真实联网 smoke 已跑通 `WebSearch + WebFetch + final answer + stop/recovery`；最新截图已复核搜索完成态后才显示最终答复。

## 12. 最新验证证据

2026-06-18 本轮已执行：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime::tests::read_model -- --nocapture
npm run test:contracts
npm run smoke:agent-runtime-current-fixture
npx vitest run "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts"
npx vitest run "src/components/agent/chat/hooks/agentStreamTurnEventBinding.test.ts" "src/components/agent/chat/hooks/agentStreamSubmitExecution.test.ts"
npx vitest run "src/components/agent/chat/utils/toolBatchGrouping.test.ts" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
npx vitest run "src/components/agent/chat/utils/agentThreadGrouping.test.ts"
npx vitest run "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/app-sidebar/conversationImportDialogViewModel.unit.test.ts" "src/components/app-sidebar/sidebarSessions.test.ts"
npx vitest run "src/components/agent/chat/utils/toolDisplayInfo.test.ts"
npm run verify:gui-smoke
npm run smoke:claw-chat-ready-streaming -- --timeout-ms 180000
npx eslint "src/components/agent/chat/components/messageListItemProjection.ts" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/messageAssistantMetaFooterState.ts" "src/components/agent/chat/components/MessageListItem.tsx" "src/components/agent/chat/components/MessageList.test.tsx"
```

结果：

- `lime-agent request_tool_policy`：`48 passed`。
- `app-server runtime::tests::read_model`：`9 passed`。
- `npm run test:contracts`：通过，`app-server-client-contract` 为 `277 checks`，`mock priority commands: 0`。
- `npm run smoke:agent-runtime-current-fixture`：通过，包含 history/cache hydration、final_done 工具收尾、failed read model、Claw 终态 UI、Coding Workbench Electron fixture、Claw 停止后同会话继续输出；`liveProviderUsed=false`。
- `agentStreamRuntimeHandler.unit.test.ts`：`31 passed`，覆盖 `item_completed 应把已有 legacy 工具卡同步为完成态`。
- `agentStreamTurnEventBinding.test.ts` + `agentStreamSubmitExecution.test.ts`：`11 passed`，覆盖 `getThreadItems` 透传链路不破坏事件绑定和提交执行。
- `npm run verify:gui-smoke`：通过，最终输出 `claw workbench shell ready`；本轮复跑包含 `packages/app-server-client` build、Electron typecheck、host build 与 app-server sidecar 准备。
- `toolBatchGrouping.test.ts`：`17 passed`，覆盖运行中 WebSearch / WebFetch 进行态摘要。
- `StreamingRenderer.test.tsx`：`62 passed`，覆盖联网搜索运行中默认展开、搜索与思考穿插顺序、混合搜索结果预览和旧折叠回归。
- `agentThreadGrouping.test.ts`：`19 passed`，覆盖历史 / read model `in_progress` WebSearch 摘要为进行态。
- `messageListItemProjection.unit.test.ts`：`19 passed`，覆盖 timeline/thread item 与 legacy `message.toolCalls` 去重、Codex 导入 timeline 只读过程渲染，以及 running WebSearch 后 commentary 不越序成为最终正文。
- `MessageList.test.tsx`：定向 `8 passed`，覆盖第二轮流式输出不截断第一轮、用户上拉后 overlay 不抢滚动、历史 WebSearch timeline 和当前运行内联过程。
- `conversationImportDialogViewModel.unit.test.ts` + `sidebarSessions.test.ts`：`12 passed`，覆盖导入入口与侧栏导入会话形状。
- `toolDisplayInfo.test.ts`：`18 passed`，覆盖拆分后的工具展示配置入口可加载，避免搜索 / 站点 / 内容工具展示配置截断导致渲染链路无法启动。
- `npm run smoke:claw-chat-ready-streaming -- --timeout-ms 180000`：通过，真实 provider `custom-cb381b4f-d2fa-4eff-ba22-c867c38ba8d3 / gpt-5.5`，证明 `Chromium GUI -> DevBridge -> Electron Desktop Host IPC -> App Server JSON-RPC -> RuntimeCore/backend`；WebSearch 与 WebFetch 均出现 started/result，turn completed，无 runtime mock fallback。
- live E2E evidence：`.lime/qc/gui-evidence/claw-chat-ready-streaming/claw-chat-ready-streaming-summary.json` 与 `.lime/qc/gui-evidence/claw-chat-ready-streaming/claw-chat-ready-streaming-05-live-web-tools-final.png`。

2026-06-18 本轮追加修复后复测：

```bash
npx vitest run "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" --silent=passed-only --disableConsoleIntercept
npx vitest run "src/components/agent/chat/components/MessageList.test.tsx" --testNamePattern "网页搜索|正在输出|完成态 assistant|read model 已完成|第二轮流式输出|用户上拉阅读" --silent=passed-only --disableConsoleIntercept
npx vitest run "src/components/agent/chat/components/messageListInlineProcess.test.ts" "src/components/agent/chat/components/messageListTimelineContentParts.unit.test.ts" --silent=passed-only --disableConsoleIntercept
npx eslint "src/components/agent/chat/components/messageListItemProjection.ts" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/messageAssistantMetaFooterState.ts" "src/components/agent/chat/components/MessageListItem.tsx" "src/components/agent/chat/components/MessageList.test.tsx"
npm run smoke:claw-chat-current-fixture
npm run smoke:claw-chat-ready-streaming -- --timeout-ms 180000
```

结果：

- `messageListItemProjection.unit.test.ts`：`27 passed`，新增覆盖 running WebSearch 下 `message.content` 已有正文也不显示到工具下方。
- `MessageList.test.tsx` 定向：`6 passed, 142 skipped`，覆盖 completed read model + final content 不显示残留“正在输出”、第二轮不截断、用户上拉不抢滚动。
- `messageListInlineProcess.test.ts` + `messageListTimelineContentParts.unit.test.ts`：`15 passed`。
- ESLint：上述 5 个相关文件通过。
- `npm run smoke:claw-chat-current-fixture`：通过，session `claw-chat-current-1781810958919-75604`。
- `npm run smoke:claw-chat-ready-streaming -- --timeout-ms 180000`：通过，真实 provider `custom-cb381b4f-d2fa-4eff-ba22-c867c38ba8d3 / gpt-5.5`，session `sess_f55dae5f630344379eb81e7c7296ae0c`，live web turn `105c2254-da38-4ccc-b3ce-f4741e931461`；`liveWebRequiredToolEventsSeen=true`、`liveWebTurnCompleted=true`、`noRuntimeMockFallbackSeen=true`、`noBlockingConsoleErrors=true`。
- 截图复核：`.lime/qc/gui-evidence/claw-chat-ready-streaming/claw-chat-ready-streaming-05-live-web-tools-final.png` 中搜索工具已为完成态，最终答复显示在工具过程之后，未再出现“上面还在搜索、下面已经显示”的错序。

2026-06-19 本轮追加 WebFetch 摘要可见性修复后复测：

```bash
npx vitest run "src/components/agent/chat/utils/toolBatchGrouping.test.ts" --silent=passed-only --disableConsoleIntercept
npx vitest run "src/components/agent/chat/utils/agentThreadGrouping.test.ts" --testNamePattern "WebSearch|网页搜索|搜索" --silent=passed-only --disableConsoleIntercept
npx vitest run "src/components/agent/chat/components/StreamingRenderer.test.tsx" --testNamePattern "WebFetch|联网搜索|网页搜索|已失败的工具批次" --silent=passed-only --disableConsoleIntercept
npx eslint "src/components/agent/chat/utils/toolBatchGrouping.ts" "src/components/agent/chat/utils/toolBatchGrouping.test.ts" "src/components/agent/chat/utils/agentThreadGrouping.test.ts" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
npm run smoke:claw-chat-current-fixture
npm run smoke:claw-chat-ready-streaming -- --timeout-ms 180000
```

结果：

- `toolBatchGrouping.test.ts`：`17 passed`，新增锁定 `正在搜索网页 1 次，读取网页 1 次` 与 `已搜索网页 1 次，读取网页 2 次`。
- `agentThreadGrouping.test.ts` 定向：`2 passed, 18 skipped`，覆盖历史 / read model `in_progress` WebSearch + WebFetch 摘要同时显示搜索与读取次数。
- `StreamingRenderer.test.tsx` 定向：`6 passed, 56 skipped`，覆盖流式搜索、WebFetch 混合批次、失败折叠和搜索 / 思考穿插顺序。
- ESLint：上述 4 个相关文件通过。
- `npm run smoke:claw-chat-current-fixture`：通过，session `claw-chat-current-1781812349922-84209`。
- `npm run smoke:claw-chat-ready-streaming -- --timeout-ms 180000`：通过，真实 provider `custom-cb381b4f-d2fa-4eff-ba22-c867c38ba8d3 / gpt-5.5`，session `sess_76e75433801746a88888f44e2fe3479d`，live web turn `24b43eb6-d7a2-4149-8d11-c6024b333ca3`；`liveWebSearchCompleted=true`、`liveWebFetchCompleted=true`、`liveWebRequiredToolEventOrderValid=true`、`noRuntimeMockFallbackSeen=true`、`noBlockingConsoleErrors=true`。
- 截图复核：`.lime/qc/gui-evidence/claw-chat-ready-streaming/claw-chat-ready-streaming-05-live-web-tools-final.png` 中过程摘要可见 `已搜索网页 1 次，读取网页 1 次`，最终答复显示在工具过程之后。

2026-06-19 本轮追加 plan inline 与 legacy fallback 收缩后复测：

```bash
npx vitest run "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/messageListTimelineContentParts.unit.test.ts" "src/components/agent/chat/components/messageListInlineProcess.test.ts" --silent=passed-only --disableConsoleIntercept
npx vitest run "src/components/agent/chat/components/MessageList.test.tsx" --testNamePattern "图片任务消息应保留思考|旧图片提交过程|timeline 已有|toolCalls|turn_summary|完成态 timeline 已有计划" --silent=passed-only --disableConsoleIntercept
npx vitest run "src/components/agent/chat/components/StreamingRenderer.test.tsx" --testNamePattern "proposed_plan|计划|WebFetch|联网搜索|网页搜索|已失败的工具批次|工具" --silent=passed-only --disableConsoleIntercept
npx eslint "src/components/agent/chat/components/messageListItemProjection.ts" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/messageListTimelineContentParts.ts" "src/components/agent/chat/components/messageListTimelineContentParts.unit.test.ts" "src/components/agent/chat/components/messageListInlineProcess.ts" "src/components/agent/chat/components/messageListInlineProcess.test.ts" "src/components/agent/chat/components/MessageList.test.tsx"
npm run smoke:claw-chat-current-fixture
npm run smoke:agent-runtime-current-fixture
npm run smoke:claw-chat-ready-streaming -- --timeout-ms 180000
```

结果：

- `messageListItemProjection.unit.test.ts` + `messageListTimelineContentParts.unit.test.ts` + `messageListInlineProcess.test.ts`：`46 passed`。
- `MessageList.test.tsx` 定向：`7 passed, 141 skipped`。
- `StreamingRenderer.test.tsx` 定向：`25 passed, 37 skipped`。
- ESLint：上述 7 个相关文件通过。
- `npm run smoke:claw-chat-current-fixture`：通过，session `claw-chat-current-1781814724823-45881`。
- `npm run smoke:agent-runtime-current-fixture`：通过，覆盖 history/cache、final_done、failed read model、Claw 终态 UI、code artifact workbench、cancel-then-continue Electron fixture；`liveProviderUsed=false`。
- `npm run smoke:claw-chat-ready-streaming -- --timeout-ms 180000`：通过，真实 provider `custom-cb381b4f-d2fa-4eff-ba22-c867c38ba8d3 / gpt-5.5`，session `sess_c0a24b00f5e54626b36a428f06de2c2e`，live web turn `eeb72c03-efa5-408b-a907-4e874a0e70c8`；`liveWebSearchCompleted=true`、`liveWebFetchCompleted=true`、`liveWebRequiredToolsCompleted=true`、`liveWebRequiredToolEventOrderValid=true`、`noRuntimeMockFallbackSeen=true`、`noBlockingConsoleErrors=true`。
- live E2E evidence：`.lime/qc/gui-evidence/claw-chat-ready-streaming/claw-chat-ready-streaming-summary.json` 与 `.lime/qc/gui-evidence/claw-chat-ready-streaming/claw-chat-ready-streaming-05-live-web-tools-final.png`。

2026-06-19 本轮追加 stream handler item-first fallback 收口后复测：

```bash
npx vitest run "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" --testNamePattern "工具进度和输出增量|已有 item lifecycle|item_completed|tool.failed" --silent=passed-only --disableConsoleIntercept
npx vitest run "src/components/agent/chat/projection/conversationProjectionStore.test.ts" --silent=passed-only --disableConsoleIntercept
npx eslint "src/components/agent/chat/hooks/agentStreamRuntimeHandler.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts"
npm run smoke:agent-runtime-current-fixture
```

结果：

- `agentStreamRuntimeHandler.unit.test.ts` 定向：`4 passed, 28 skipped`，覆盖 legacy delta/progress/output/failed 在已有 item lifecycle 时不再新建或改写 `message.toolCalls`。
- `conversationProjectionStore.test.ts`：`9 passed`。
- ESLint：上述 2 个相关文件通过。
- `npm run smoke:agent-runtime-current-fixture`：通过，包含 Claw cancel-then-continue Electron fixture，session `claw-chat-current-1781839433348-68449`；`liveProviderUsed=false`。

2026-06-19 本轮追加 history hydrate item-first fallback 收口后复测：

```bash
npx vitest run "src/components/agent/chat/hooks/agentChatHistory.test.ts" --testNamePattern "thread_read.tool_calls|timeline 已有工具过程|本地历史导入的 detail.items|本地历史导入的 reasoning" --silent=passed-only --disableConsoleIntercept
npx vitest run "src/components/agent/chat/hooks/agentChatHistory.test.ts" --silent=passed-only --disableConsoleIntercept
npx eslint "src/components/agent/chat/hooks/agentChatHistory.ts" "src/components/agent/chat/hooks/agentChatHistory.test.ts"
npm run smoke:agent-runtime-current-fixture
npm run smoke:agent-session-history-electron-fixture
```

结果：

- `agentChatHistory.test.ts` 定向：`5 passed, 56 skipped`，覆盖 `thread_read.tool_calls` 无 timeline 兜底、Codex 导入 `detail.items`、timeline 已有工具过程时不重复注入 read model 工具摘要。
- `agentChatHistory.test.ts` 全量：`61 passed`。
- ESLint：上述 2 个相关文件通过。
- `npm run smoke:agent-runtime-current-fixture`：通过，包含 Coding Workbench Electron fixture 和 Claw cancel-then-continue Electron fixture；Claw session `claw-chat-current-1781840256786-93832`，`liveProviderUsed=false`。
- `npm run smoke:agent-session-history-electron-fixture`：通过，summary 写入 `.lime/qc/gui-evidence/agent-session-history-electron-fixture/agent-session-history-electron-fixture-summary.json`，methods 为 `initialize,agentSession/start,agentSession/read,agentSession/update,agentSession/list`。

2026-06-19 本轮追加 WebFetch 工具回灌清洗后复测：

```bash
cargo fmt --manifest-path "lime-rs/crates/aster-rust/crates/aster/Cargo.toml" --check
cargo test --manifest-path "lime-rs/crates/aster-rust/Cargo.toml" -p aster-core web_fetch -- --nocapture
git diff --check -- "lime-rs/crates/aster-rust/crates/aster/src/tools/web.rs"
```

结果：

- `cargo fmt`：通过。
- `aster-core web_fetch`：`10 passed`，新增覆盖默认 WebFetch 按 prompt 选取相关片段、HTML 文本抽取移除 `head/style/script/meta` 噪音，以及剥离内联 `style/class/data/aria` 属性噪音。
- `git diff --check`：通过。

2026-06-19 本轮追加连续 user turn 边界修复、MOIM agent-only 注入和 live smoke 断言修复后复测：

```bash
cargo fmt --manifest-path "lime-rs/crates/aster-rust/crates/aster/Cargo.toml" --check
cargo test --manifest-path "lime-rs/crates/aster-rust/Cargo.toml" -p aster-core conversation::tests -- --nocapture
cargo test --manifest-path "lime-rs/crates/aster-rust/Cargo.toml" -p aster-core agents::moim::tests -- --nocapture
cargo test --manifest-path "lime-rs/crates/aster-rust/Cargo.toml" -p aster-core web_fetch -- --nocapture
node --check "scripts/claw-chat-ready-streaming-smoke.mjs"
npm run smoke:agent-runtime-current-fixture
npm run smoke:claw-chat-ready-streaming -- --timeout-ms 180000
```

结果：

- `conversation::tests`：`13 passed`，新增覆盖连续普通 user turn 不合并，避免停止 / 恢复后下一轮 `@搜索` 与上一轮恢复指令串话。
- `agents::moim::tests`：`3 passed`，覆盖 MOIM 作为 `agent_only()` 独立消息注入，不再依赖 user merge，也不污染用户可见原文。
- `aster-core web_fetch`：`10 passed`。
- `node --check scripts/claw-chat-ready-streaming-smoke.mjs`：通过，恢复结果可见断言语法有效。
- `npm run smoke:agent-runtime-current-fixture`：通过，`liveProviderUsed=false`，继续覆盖 current fixture、Claw cancel-then-continue 和 Electron fixture guard。
- `npm run smoke:claw-chat-ready-streaming -- --timeout-ms 180000`：通过，真实 provider `custom-cb381b4f-d2fa-4eff-ba22-c867c38ba8d3 / gpt-5.5`，session `sess_de695aeb9194426f9d25f44a47ea3e83`，live web turn `2aaec918-d251-4c20-9f53-20bf068d4846`；`liveWebTurnCompleted=true`、`liveWebSearchCompleted=true`、`liveWebFetchCompleted=true`、`liveWebRequiredToolEventOrderValid=true`、`noRuntimeMockFallbackSeen=true`、`noBlockingConsoleErrors=true`。
- request log 复核：`~/Library/Application Support/lime/aster/state/logs/llm_request.2.jsonl` 的 `last_user_preview` 只包含当前 `@搜索...WebSearch...WebFetch...` 指令，没有拼接上一轮“复原完成”；WebFetch preview 为新华网正文片段，不再含 `mask-image/wp-block/data:image/aria-label`。

2026-06-19 本轮追加 WebSearch / WebFetch 展开态分组后复测：

```bash
npx vitest run "src/components/agent/chat/utils/toolBatchGrouping.test.ts" --silent=passed-only --disableConsoleIntercept
npx vitest run "src/components/agent/chat/components/StreamingRenderer.test.tsx" --testNamePattern "WebFetch|联网搜索|网页搜索|已失败的工具批次" --silent=passed-only --disableConsoleIntercept
npx vitest run "src/components/agent/chat/utils/agentThreadGrouping.test.ts" --testNamePattern "WebSearch|网页搜索|搜索" --silent=passed-only --disableConsoleIntercept
npx vitest run "src/i18n/__tests__/loadNamespace.test.ts" --silent=passed-only --disableConsoleIntercept
npx eslint "src/components/agent/chat/utils/toolBatchGrouping.ts" "src/components/agent/chat/utils/toolBatchGrouping.test.ts" "src/components/agent/chat/components/StreamingProcessGroup.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
```

结果：

- `toolBatchGrouping.test.ts`：`17 passed`，新增覆盖 WebSearch / WebFetch 批次输出 `web_search_sources` 与 `web_fetch_pages` 两个 section。
- `StreamingRenderer.test.tsx` 定向：`6 passed, 56 skipped`，覆盖展开态显示 `搜索来源` / `读取页面`，同时保留搜索来源点击预览与 WebFetch 快照复用。
- `agentThreadGrouping.test.ts` 定向：`2 passed, 20 skipped`，确认 read model / task rail 搜索摘要未被展开态 section 改动破坏。
- `loadNamespace.test.ts`：`7 passed`，确认新增五语言文案资源可加载。
- ESLint：上述 4 个相关 TS/TSX 文件通过。

2026-06-20 追加 Codex 风格 WebSearch / WebFetch GUI fixture 回归：

```bash
node --check "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs"
npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
npm run smoke:claw-chat-current-fixture -- --scenario web-tools-rendering --timeout-ms 180000 --prefix claw-chat-current-fixture-web-tools-rendering-dev-pass --app-url http://127.0.0.1:1420/
npm run electron:build
npm run smoke:claw-chat-current-fixture -- --scenario web-tools-rendering --timeout-ms 180000 --prefix claw-chat-current-fixture-web-tools-rendering-dist-pass
```

结果：

- `claw-chat-current-fixture-smoke.test.mjs`：`10 passed`，新增守卫 `web-tools-rendering` 场景必须走真实 Electron Desktop Host + App Server JSON-RPC current 链路，并断言 WebSearch 默认展开、显示 inline sources、WebFetch 显示读取页面、最终正文继续穿插、传输层 JSON 包络隐藏。
- `web-tools-rendering` 真实 Electron fixture：通过，summary `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-dev-pass-summary.json`，截图 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-dev-pass-chat.png`。
- 构建后默认 `dist/index.html` Electron fixture：通过，summary `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-dist-pass-summary.json`，截图 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-dist-pass-chat.png`，证明不依赖 dev server，默认桌面端入口也不会回到旧折叠 / JSON 泄露行为。
- 关键断言：`webProcessGroupExpanded=true`、`hasSearchSourceSection=true`、`hasFetchPageSection=true`、`hasFetchPageUrl=true`、`hasFinalTextAfterProcess=true`、`rawJsonEnvelopeVisible=false`、`forbiddenTransportHits=[]`、`noConsoleErrors=true`。

2026-06-19 本轮追加 MessageList legacy `message.toolCalls` 回流 contract 守卫后复测：

```bash
npm run test:contracts
npx vitest run "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" --testNamePattern "timeline 已有工具 item|无 timeline|turn_summary|timeline 过程项未生成" --silent=passed-only --disableConsoleIntercept
npx eslint "scripts/check-app-server-client-contract.mjs" "src/components/agent/chat/components/messageListItemProjection.ts" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts"
npm run smoke:agent-runtime-current-fixture
```

结果：

- `npm run test:contracts`：通过，`app-server-client-contract` 增至 `278 checks`，新增 `MessageList` 禁止 legacy `message.toolCalls` 在已有 process timeline 时回流为主渲染的 contract；`mock priority commands: 0`。
- `messageListItemProjection.unit.test.ts` 定向：`4 passed, 26 skipped`，覆盖 timeline 已有工具 item、无 timeline 兼容兜底、`turn_summary` 兼容兜底、timeline 过程项未生成 `tool_use` 时仍禁用 legacy 工具兜底。
- ESLint：上述 3 个文件通过。
- `npm run smoke:agent-runtime-current-fixture`：通过，继续覆盖 history/cache、流式完成态、MessageList 终态 UI、Electron fixture guard、Coding Workbench Electron fixture、Claw cancel-then-continue Electron fixture；`liveProviderUsed=false`。

2026-06-19 本轮追加 Rust legacy `ToolEnd` compat 标记后复测：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" --all --check
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent event_converter -- --nocapture
npm run test:contracts
```

结果：

- `cargo fmt --all --check`：通过。
- `lime-agent event_converter`：`32 passed`，新增覆盖 `MessageContent::ToolResponse` 派生 legacy `ToolEnd` 时强制写入 `source=legacy_message_tool_response`、`sourceType=tool_end`、`compat=true`、`canonical=false`；失败 ToolResponse 同样标记 compat；RMCP `_meta` metadata 能被提取并保留非治理字段如 `exit_code`。
- `npm run test:contracts`：通过，`app-server-client-contract` 增至 `279 checks`，新增 `Lime Agent legacy message tool_end is marked as compat projection`；`mock priority commands: 0`。
- `npm run smoke:agent-runtime-current-fixture`：通过，覆盖 history/cache hydration、流式完成态、MessageList 终态 UI、Electron fixture guard、真实 GUI coding 输入到 Coding Workbench Electron fixture、Claw 停止后同会话继续输出 Electron fixture；`liveProviderUsed=false`，Claw fixture session `claw-chat-current-1781857059119-21801`。

2026-06-19 本轮追加 WebFetch 内容 helper 拆分后复测：

```bash
cargo fmt --manifest-path "lime-rs/crates/aster-rust/crates/aster/Cargo.toml" --check
cargo test --manifest-path "lime-rs/crates/aster-rust/Cargo.toml" -p aster-core web_fetch -- --nocapture
git diff --check -- "lime-rs/crates/aster-rust/crates/aster/src/tools/web.rs" "lime-rs/crates/aster-rust/crates/aster/src/tools/web_fetch_content.rs" "lime-rs/crates/aster-rust/crates/aster/src/tools/mod.rs" "internal/roadmap/turn/implementation-plan.md" "internal/roadmap/turn/test-cases.md"
```

结果：

- `cargo fmt`：通过。
- `aster-core web_fetch`：`11 passed`，WebFetch HTML 清洗、正文抽取、默认相关片段过滤和动态片段过滤测试已迁入 `web_fetch_content.rs`，redirect / permission / creation 测试继续留在 `web.rs`。
- `git diff --check`：通过。
