# Turn / Tool 生命周期测试用例

> 状态：已完成当前阶段
> 更新时间：2026-06-21
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

| 层级                  | 目的                                       | 推荐入口                                      |
| --------------------- | ------------------------------------------ | --------------------------------------------- |
| Rust unit             | 验证事件转换、item lifecycle、策略收口     | affected crate tests                          |
| App Server projection | 验证 event log/read model 聚合             | runtime_backend / runtime tests               |
| Contract              | 验证 App Server、前端 gateway、bridge 同步 | `npm run test:contracts`                      |
| Frontend unit         | 验证 projection store 和 MessageList       | targeted `*.test.ts(x)`                       |
| Fixture smoke         | 验证 current agent runtime 主链            | `npm run smoke:agent-runtime-current-fixture` |
| GUI smoke             | 验证桌面 GUI 可交付                        | `npm run verify:gui-smoke`                    |
| Live E2E              | 验证真实联网和 provider stream             | Playwright / Electron live run                |

## 3. Rust unit 用例

| ID            | 用例                               | 输入                                                                                        | 断言                                                                                                                          |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| TURN-RUST-001 | ToolRequest 生成 tool item         | provider message 含 `ToolRequest(id=tool-1)`                                                | 输出 `ItemStarted(tool_call tool-1)`                                                                                          |
| TURN-RUST-002 | ToolResponse 完成同一 item         | provider message 含 `ToolResponse(id=tool-1)`                                               | 输出 `ItemCompleted(tool_call tool-1)`，不生成第二个 id                                                                       |
| TURN-RUST-003 | item 与 legacy tool 混合不重复     | 同一工具同时有 item 和 `ToolStart/ToolEnd`                                                  | canonical event 数量为 1，legacy 标记 compat                                                                                  |
| TURN-RUST-004 | tool input delta 绑定工具          | `ToolInputDelta(tool-1)`                                                                    | 不改变 item terminal status                                                                                                   |
| TURN-RUST-005 | tool output delta 绑定工具         | `ToolOutputDelta(tool-1)`                                                                   | 只追加 transient output                                                                                                       |
| TURN-RUST-006 | failed tool terminal               | `ToolResponse` error                                                                        | `ItemCompleted(status=failed,error)`                                                                                          |
| TURN-RUST-007 | WebSearch tracker 不驱动 UI 分组   | WebSearch + WebFetch 成功                                                                   | tracker 只返回策略状态，不生成 UI 分组字段                                                                                    |
| TURN-RUST-008 | provider 尾段失败保留工具结果      | tool completed 后 stream error                                                              | completed tool item 保持 completed                                                                                            |
| TURN-RUST-009 | WebFetch 默认回灌按相关片段裁剪    | HTML / 文本正文含大量无关段落，prompt 指向局部主题                                          | 默认返回相关片段，避免把整页内容塞回模型                                                                                      |
| TURN-RUST-010 | WebFetch HTML 清洗去除样式脚本     | HTML 含 `head/style/script/meta` 与正文                                                     | 输出只保留正文文本，不包含 CSS / JS 噪音                                                                                      |
| TURN-RUST-011 | 连续普通 user turn 不合并          | 两条连续 `Role::User`，第一条为恢复指令，第二条为 `@搜索` 联网指令                          | 输出仍为两个独立 user message，避免跨 turn 串话                                                                               |
| TURN-RUST-012 | MOIM 注入不污染用户原文            | 注入 `<info-msg>` 时前后存在普通 user / assistant                                           | MOIM 为 `agent_only()` 独立消息，不依赖 user merge，不显示给用户                                                              |
| TURN-RUST-013 | WebFetch HTML 清洗去除内联属性噪音 | HTML 含 `style=mask-image...`、`class=wp-block`、`data:*`、`aria-label` 与正文              | 输出保留正文，不包含 `mask-image/wp-block/data:image/aria-label`                                                              |
| TURN-RUST-014 | legacy ToolEnd 强制标记 compat     | `MessageContent::ToolResponse` 派生 legacy `ToolEnd`，工具 metadata 自带 `source/canonical` | `ToolEnd.result.metadata.source=legacy_message_tool_response`、`compat=true`、`canonical=false`，同时保留工具自有 `exit_code` |
| TURN-RUST-015 | 失败 legacy ToolEnd 也标记 compat  | `MessageContent::ToolResponse` error                                                        | `ToolEnd.success=false`，metadata 仍有 `source=legacy_message_tool_response`、`compat=true`、`canonical=false`                |

## 4. App Server / read model 用例

| ID          | 用例                              | 输入事件                                              | 断言                                               |
| ----------- | --------------------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| TURN-RM-001 | item started 创建 read item       | `item.started(tool-1)`                                | `ThreadReadModel.items[tool-1].status=in_progress` |
| TURN-RM-002 | item completed 更新同一 read item | `item.started -> item.completed`                      | item 数量为 1，status completed                    |
| TURN-RM-003 | legacy tool result 不覆盖 item    | `item.completed(success=true) -> tool.failed(tool-1)` | status 仍 completed，记录 conflict diagnostics     |
| TURN-RM-004 | legacy-only 合成 synthetic item   | 只有 `tool.started -> tool.result`                    | 生成 item，metadata.source=`legacy_tool_event`     |
| TURN-RM-005 | completed item 不降级             | `item.completed -> item.updated(in_progress)`         | terminal state 不被降级                            |
| TURN-RM-006 | sequence 稳定排序                 | 多 item out-of-order 到达                             | read model 按 sequence 排序                        |
| TURN-RM-007 | turn failed 保留 completed tools  | tool completed 后 turn failed                         | completed tool 仍可见，turn status failed          |
| TURN-RM-008 | history + live 去重               | history completed item + live duplicate               | 只保留一个 item                                    |

## 5. Frontend projection 用例

| ID          | 用例                                                     | 输入                                                                                                                         | 断言                                                                                                                          |
| ----------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| TURN-FE-001 | item-first 工具卡                                        | `item_started(tool_call)`                                                                                                    | projection 生成一张工具卡                                                                                                     |
| TURN-FE-002 | legacy tool_start 不重复                                 | `item_started(tool-1) + tool_start(tool-1)`                                                                                  | 工具卡数量为 1                                                                                                                |
| TURN-FE-003 | tool_output_delta 补充详情                               | existing `tool-1` + output delta                                                                                             | delta 出现在同一工具详情                                                                                                      |
| TURN-FE-004 | 无法归属的 tool delta 进 diagnostics                     | `tool_output_delta` 无 active turn / item                                                                                    | 不渲染工具卡                                                                                                                  |
| TURN-FE-005 | final answer 不接工具输出                                | tool output 后 text delta                                                                                                    | text delta 出现在 assistant buffer                                                                                            |
| TURN-FE-006 | 第二轮不截断第一轮                                       | turn-1 completed 后 turn-2 stream                                                                                            | turn-1 final text 完整                                                                                                        |
| TURN-FE-007 | history hydrate 不覆盖 live terminal                     | live partial + history completed                                                                                             | terminal item 优先                                                                                                            |
| TURN-FE-008 | WebSearch / WebFetch 分开展示                            | 两个 tool item                                                                                                               | 两张独立工具卡                                                                                                                |
| TURN-FE-009 | item terminal 同步 legacy message 工具卡                 | 已存在 `message.toolCalls/tool_use` running，再收到 `item_completed(tool_call)`                                              | 已有 message 层工具卡变 completed，不新建重复卡                                                                               |
| TURN-FE-010 | item terminal 后 late legacy 不覆盖                      | `item_completed(tool_call)` 后再到同 turn/tool 的 `tool_end/tool_progress`                                                   | message 层保持 item terminal，不降级、不串线                                                                                  |
| TURN-FE-011 | 运行中的 WebSearch / WebFetch 用进行态摘要               | `web_search` / `WebFetch` status=`running` 或 `in_progress`                                                                  | 摘要显示“正在搜索网页”，展开态显示进度，不伪装成完成态                                                                        |
| TURN-FE-012 | timeline 已有工具 item 时不再渲染 legacy fallback        | 同一 assistant message 同时有 timeline `tool_call` 和 legacy `message.toolCalls`                                             | `rendererContentParts` 只保留 timeline 生成的 `tool_use`，`rendererToolCalls` 为空                                            |
| TURN-FE-013 | Codex 导入 timeline 共用 live 过程渲染语义               | imported metadata 的 reasoning / command / final answer                                                                      | 渲染为 `thinking -> tool_use -> text`，只读但不走独立导入 UI                                                                  |
| TURN-FE-014 | running 工具后的 commentary 不作为最终正文               | `commentary -> web_search completed -> web_search in_progress -> commentary`                                                 | `rendererContentParts` 为 `thinking/tool_use/tool_use/thinking`，`actionContent` 与 `rendererRawContent` 为空                 |
| TURN-FE-015 | 用户上拉后流式追加不抢滚动                               | scroll container 已离底部并收到 overlay 更新                                                                                 | 不调用 `scrollIntoView`，保留用户阅读位置                                                                                     |
| TURN-FE-016 | 第二轮 overlay 不覆盖第一轮完整回复                      | turn-1 completed 后 turn-2 assistant overlay                                                                                 | turn-1 的 text 与 `tool_use` 保留，turn-2 只显示自己的 overlay                                                                |
| TURN-FE-017 | running 搜索后的临时正文不得越序显示                     | `web_search in_progress` 后 overlay、`message.content` 或 commentary 已有正文                                                | `rendererContentParts` 只保留工具与 thinking/commentary，`actionContent / rendererRawContent` 为空                            |
| TURN-FE-018 | completed read model 清理“正在输出”残留                  | thread read status=`completed` 且 assistant 有最终正文，本地 `runtimeStatus` 仍 running                                      | 不渲染 `assistant-streaming-inline-indicator`，`StreamingRenderer.isStreaming=false`                                          |
| TURN-FE-019 | WebFetch 在混合搜索批次中显式可见                        | `web_search completed + WebFetch completed/failed`                                                                           | 批次标题和 `countLabel` 同时显示搜索次数与读取次数，展开态保留 URL / 快照，不暴露原始 payload                                 |
| TURN-FE-020 | plan item 内联渲染                                       | timeline 中存在 `type=plan`                                                                                                  | `rendererContentParts` 含 `<proposed_plan>` text，`StreamingRenderer.renderProposedPlanBlocks=true`，外置 timeline 不重复展示 |
| TURN-FE-021 | turn_summary 不屏蔽 legacy fallback                      | timeline 只有 `turn_summary`，旧消息有 `message.toolCalls`                                                                   | legacy `message.toolCalls` 仍可作为 compat 过程源                                                                             |
| TURN-FE-022 | process timeline 禁用 legacy fallback                    | timeline 有 `tool_call / web_search / reasoning / plan / context_compaction` 等 process item，旧消息也有 `message.toolCalls` | 只渲染 timeline 过程，不再渲染第二套 legacy 工具卡                                                                            |
| TURN-FE-023 | item lifecycle 存在时 legacy delta 不新建 message 工具卡 | `threadItems` 已有非 legacy `tool_call`，随后收到 `tool_input_delta/tool_progress/tool_output_delta`                         | `threadItems` 与 Agent UI projection detail 更新，`message.toolCalls/contentParts.tool_use` 不新增                            |
| TURN-FE-024 | item lifecycle 存在时 legacy failed 不改 message 主状态  | `threadItems` 已有非 legacy `tool_call`，随后收到 `tool.failed`                                                              | read item 进入 failed，旧 message 层工具卡不被 legacy terminal 改写                                                           |
| TURN-FE-025 | history hydrate 禁用 thread_read 工具摘要重复注入        | `detail.items` 已有 process timeline item，同时 `thread_read.tool_calls` 也包含同一工具                                      | hydrate 后 assistant 只保留 timeline 生成的一份 `tool_use/toolCalls`，`thread_read.tool_calls` 不覆盖输出                     |
| TURN-FE-026 | history hydrate 保留 thread_read 兼容兜底                | 无 `detail.items` process timeline，但 `thread_read.tool_calls` 有工具摘要                                                   | hydrate 后旧历史仍显示 `tool_use/toolCalls`，确保 legacy-only / read-model-only 会话可恢复                                    |
| TURN-FE-027 | WebSearch / WebFetch 展开态分组                          | 同一搜索批次含 WebSearch 结果和多个 WebFetch 读取 URL                                                                        | 展开态显示 `搜索来源` 与 `读取页面` 两组；来源仍可点击预览，读取页面不暴露原始 payload / 失败诊断                             |
| TURN-FE-028 | final_answer 不被滞后的 running 搜索吞掉                 | timeline 已有 `phase=final_answer`，但同 turn WebSearch / WebFetch 仍滞后为 running                                          | 最终正文继续显示在搜索过程之后，避免 UI 卡在“正在整理最终答复”                                                                |
| TURN-FE-029 | 搜索完成但最终正文未到时不提前折叠                       | WebSearch/WebFetch 已 completed，assistant 正文为空，`runtimeStatus.phase=synthesizing`                                      | 搜索过程保持展开并显示来源 / 读取页面；最终正文出现后才恢复默认轻量折叠                                                       |
| TURN-FE-030 | 流式 Markdown 不提前解析半行                             | 流式正文包含未完成表格 / 标题 / 代码行                                                                                       | 只把最后一个换行前的完整源码交给 Markdown renderer，未完成尾行按纯文本展示，完成后恢复完整 Markdown                           |
| TURN-FE-031 | 搜索开始不更新前一个思考卡片                             | `thinking -> web_search running` 连续到达                                                                                    | 渲染为两张过程卡：第一张仍显示思考状态，第二张显示搜索进度；搜索 running 不改写上方思考摘要                                   |

## 6. Contract 用例

| ID                | 用例                                         | 检查对象                                                                  | 断言                                                                                                                           |
| ----------------- | -------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| TURN-CONTRACT-001 | App Server event 类型同步                    | protocol / frontend parser                                                | `item_started/item_updated/item_completed` 可解析                                                                              |
| TURN-CONTRACT-002 | tool delta 字段同步                          | App Server / TS 类型                                                      | `tool_id/delta/output_kind/metadata` 形状一致                                                                                  |
| TURN-CONTRACT-003 | mock 不成为生产 fallback                     | bridge / mocks catalog                                                    | 生产 submit 不依赖 mock                                                                                                        |
| TURN-CONTRACT-004 | legacy tool current 引用受控                 | governance catalog                                                        | legacy tool stream 只标 compat                                                                                                 |
| TURN-CONTRACT-005 | history API 返回 items                       | session get/list                                                          | turn items 字段完整                                                                                                            |
| TURN-CONTRACT-006 | 前端 stream handler 保持 item-first          | `agentStreamRuntimeHandler.ts`                                            | 存在 `shouldLetLegacyToolEventUpdateMessageLayer`、`syncExistingMessageToolCallFromThreadItem`、`getThreadItems`               |
| TURN-CONTRACT-007 | 前端单测锁住 item terminal 同步              | `agentStreamRuntimeHandler.unit.test.ts`                                  | 覆盖 `item_completed 应把已有 legacy 工具卡同步为完成态`                                                                       |
| TURN-CONTRACT-008 | MessageList 禁止 legacy 工具过程回流为主渲染 | `messageListItemProjection.ts` / `messageListItemProjection.unit.test.ts` | `message.toolCalls` 只在没有真实 process timeline item 时作为 compat fallback；timeline 已有过程项时关闭第二套 legacy 渲染     |
| TURN-CONTRACT-009 | legacy message ToolEnd 不可冒充 canonical    | `lime-rs/crates/agent/src/event_converter.rs`                             | 存在 `legacy_message_tool_response_metadata` 和成功 / 失败 ToolResponse compat 测试，contract 阻止无标记 legacy `ToolEnd` 回流 |

最低入口：

```bash
npm run test:contracts
```

## 7. Fixture smoke 用例

| ID               | 用例                      | 操作                                          | 断言                                  |
| ---------------- | ------------------------- | --------------------------------------------- | ------------------------------------- |
| TURN-FIXTURE-001 | current fixture 普通 turn | `npm run smoke:agent-runtime-current-fixture` | 出现 `turn_completed`，items 完整     |
| TURN-FIXTURE-002 | Claw fixture stream       | `npm run smoke:claw-chat-current-fixture`     | `message.delta + turn.completed` 正常 |
| TURN-FIXTURE-003 | fixture tool lifecycle    | fixture 后端返回工具事件                      | UI / read model 只有一个工具 item     |
| TURN-FIXTURE-004 | fixture second turn       | 连续 submit 两轮                              | 第一轮不截断                          |

## 8. GUI smoke 用例

| ID           | 用例                           | 用户操作                                                                | 期望 GUI                                                                         |
| ------------ | ------------------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| TURN-GUI-001 | submit 后立即可见状态          | 输入普通问题                                                            | 出现 running / preparing 状态                                                    |
| TURN-GUI-002 | 工具开始可见                   | 触发工具调用                                                            | 工具卡出现，状态 running                                                         |
| TURN-GUI-003 | 工具完成可见                   | 工具返回结果                                                            | 同一工具卡变 completed                                                           |
| TURN-GUI-004 | 多工具不串线                   | 触发 WebSearch + WebFetch                                               | 两个工具分别显示                                                                 |
| TURN-GUI-005 | final answer 与工具分离        | 工具后模型总结                                                          | 总结在 assistant 正文区域                                                        |
| TURN-GUI-006 | 第二轮保持历史                 | 再发送一条消息                                                          | 上一轮完整保留                                                                   |
| TURN-GUI-007 | 用户上拉阅读不中断             | 输出中向上滚动                                                          | 新 token 到达时页面不抢回底部                                                    |
| TURN-GUI-008 | 搜索仍运行时不提前显示最终正文 | WebSearch 仍 running 后出现 commentary                                  | commentary 只显示为过程，最终正文区不越序出现答案                                |
| TURN-GUI-009 | 搜索工具完成后才显示最终答复   | WebSearch/WebFetch 真实完成并收到 final answer                          | 工具卡为完成态，最终答复显示在工具过程之后，不再显示“正在输出”残留               |
| TURN-GUI-010 | 搜索过程默认轻量折叠           | WebSearch/WebFetch 完成且 final answer 已出现                           | 默认只显示 `已搜索网页 N 次，读取网页 M 次` 摘要；点击展开后显示来源和读取页面   |
| TURN-GUI-011 | 整理最终答复中保持搜索过程展开 | WebSearch/WebFetch 完成后，最终正文尚未出现，页面显示“正在整理最终答复” | 过程组 `aria-expanded=true`，显示来源和读取页面；不能只剩折叠摘要加 loading 文案 |
| TURN-GUI-012 | Codex 流式 Markdown 不抖动     | Codex 导入或 live stream 正在输出表格 / 标题                            | 未完成行不被提前渲染成破碎 Markdown；页面持续吐字，不出现长时间空白或 JSON 原文  |

最低入口：

```bash
npm run verify:gui-smoke
```

## 9. 真实联网 E2E 用例

| ID            | 用例                        | 操作                                  | 断言                                                                                  |
| ------------- | --------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| TURN-LIVE-001 | 真实联网首屏反馈            | 发起需要最新信息的问题                | submit 后短时间内有 turn/item/status 可见                                             |
| TURN-LIVE-002 | WebSearch 独立 item         | provider 调 WebSearch                 | WebSearch 工具事件与 item 可复核                                                      |
| TURN-LIVE-003 | WebFetch 独立 item          | provider 调 WebFetch                  | WebFetch 工具事件与 item 可复核                                                       |
| TURN-LIVE-004 | 不重复工具卡                | live event 同时含 legacy tool         | 每个 toolCallId 只一张卡                                                              |
| TURN-LIVE-005 | 最终答复可见                | 等待 turn completed                   | assistant 正文完整                                                                    |
| TURN-LIVE-006 | 第二轮不截断                | 第一轮完成后发第二轮                  | 第一轮文本和工具卡保持                                                                |
| TURN-LIVE-007 | event log 可复核            | 读取 session jsonl                    | event sequence 与 UI 一致                                                             |
| TURN-LIVE-008 | WebFetch 读取次数可见       | 真实 WebSearch 后触发 WebFetch        | 最终截图中搜索过程摘要显示 `读取网页 N 次`，且最终答复在工具完成态之后                |
| TURN-LIVE-009 | 连续 user turn 不串话       | 停止 / 恢复后再发送 `@搜索` live turn | provider request 的 `last_user_preview` 只包含当前 `@搜索` 指令，不拼接上一轮恢复指令 |
| TURN-LIVE-010 | WebFetch 工具回灌为干净正文 | live WebFetch 抓取公开新闻页面        | tool result preview 为正文片段，不含 CSS / HTML 属性噪音，最终 turn completed         |

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

| ID           | 用例                           | 检查                                     | 断言                                                                     |
| ------------ | ------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------ |
| TURN-GOV-001 | 禁止关键词联网策略回流         | 搜索 `message_requires_fresh_web_search` | 不允许 current 引用                                                      |
| TURN-GOV-002 | 禁止默认 allowed 回流          | 搜索 `mode_default=true` / 等价配置      | 普通 Claw 不默认 allowed                                                 |
| TURN-GOV-003 | 禁止 tool stream current truth | 搜索新增 projection                      | `tool_start/tool_end` 不作为主工具卡 owner                               |
| TURN-GOV-004 | 禁止 mock fallback             | 检查 bridge/runtime                      | 生产路径不走 mock backend                                                |
| TURN-GOV-005 | 禁止 timeout 合成完成态        | 搜索 grace/final timeout                 | 不用固定 timeout 伪造 `turn_completed`                                   |
| TURN-GOV-006 | smoke 不用重复文案计数误判恢复 | 停止后恢复结果只显示一次                 | GUI 可见一次恢复结果或 read model 已持久化即判定恢复闭环，不要求重复出现 |

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
- `npm run smoke:agent-runtime-current-fixture`：通过，包含 history/cache hydration、`turn.completed` 工具收尾（legacy `final_done` 仅负向 guard）、failed read model、Claw 终态 UI、Coding Workbench Electron fixture、Claw 停止后同会话继续输出；`liveProviderUsed=false`。
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
- `npm run smoke:agent-runtime-current-fixture`：通过，覆盖 history/cache、`turn.completed` 工具收尾（legacy `final_done` 仅负向 guard）、failed read model、Claw 终态 UI、code artifact workbench、cancel-then-continue Electron fixture；`liveProviderUsed=false`。
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
cargo fmt --manifest-path "lime-rs/crates/agent-rust/crates/agent/Cargo.toml" --check
cargo test --manifest-path "lime-rs/crates/agent-rust/Cargo.toml" -p agent-core web_fetch -- --nocapture
git diff --check -- "lime-rs/crates/agent-rust/crates/agent/src/tools/web.rs"
```

结果：

- `cargo fmt`：通过。
- `agent-core web_fetch`：`10 passed`，新增覆盖默认 WebFetch 按 prompt 选取相关片段、HTML 文本抽取移除 `head/style/script/meta` 噪音，以及剥离内联 `style/class/data/aria` 属性噪音。
- `git diff --check`：通过。

2026-06-19 本轮追加连续 user turn 边界修复、MOIM agent-only 注入和 live smoke 断言修复后复测：

```bash
cargo fmt --manifest-path "lime-rs/crates/agent-rust/crates/agent/Cargo.toml" --check
cargo test --manifest-path "lime-rs/crates/agent-rust/Cargo.toml" -p agent-core conversation::tests -- --nocapture
cargo test --manifest-path "lime-rs/crates/agent-rust/Cargo.toml" -p agent-core agents::moim::tests -- --nocapture
cargo test --manifest-path "lime-rs/crates/agent-rust/Cargo.toml" -p agent-core web_fetch -- --nocapture
node --check "scripts/claw-chat-ready-streaming-smoke.mjs"
npm run smoke:agent-runtime-current-fixture
npm run smoke:claw-chat-ready-streaming -- --timeout-ms 180000
```

结果：

- `conversation::tests`：`13 passed`，新增覆盖连续普通 user turn 不合并，避免停止 / 恢复后下一轮 `@搜索` 与上一轮恢复指令串话。
- `agents::moim::tests`：`3 passed`，覆盖 MOIM 作为 `agent_only()` 独立消息注入，不再依赖 user merge，也不污染用户可见原文。
- `agent-core web_fetch`：`10 passed`。
- `node --check scripts/claw-chat-ready-streaming-smoke.mjs`：通过，恢复结果可见断言语法有效。
- `npm run smoke:agent-runtime-current-fixture`：通过，`liveProviderUsed=false`，继续覆盖 current fixture、Claw cancel-then-continue 和 Electron fixture guard。
- `npm run smoke:claw-chat-ready-streaming -- --timeout-ms 180000`：通过，真实 provider `custom-cb381b4f-d2fa-4eff-ba22-c867c38ba8d3 / gpt-5.5`，session `sess_de695aeb9194426f9d25f44a47ea3e83`，live web turn `2aaec918-d251-4c20-9f53-20bf068d4846`；`liveWebTurnCompleted=true`、`liveWebSearchCompleted=true`、`liveWebFetchCompleted=true`、`liveWebRequiredToolEventOrderValid=true`、`noRuntimeMockFallbackSeen=true`、`noBlockingConsoleErrors=true`。
- request log 复核：`~/Library/Application Support/lime/agent/state/logs/llm_request.2.jsonl` 的 `last_user_preview` 只包含当前 `@搜索...WebSearch...WebFetch...` 指令，没有拼接上一轮“复原完成”；WebFetch preview 为新华网正文片段，不再含 `mask-image/wp-block/data:image/aria-label`。

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

- `claw-chat-current-fixture-smoke.test.mjs`：`10 passed`，新增守卫 `web-tools-rendering` 场景必须走真实 Electron Desktop Host + App Server JSON-RPC current 链路，并断言 WebSearch 默认折叠为轻量摘要、展开后显示 sources、WebFetch 显示读取页面、最终正文继续穿插、传输层 JSON 包络隐藏。
- `web-tools-rendering` 真实 Electron fixture：通过，summary `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-dev-pass-summary.json`，截图 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-dev-pass-chat.png`。
- 构建后默认 `dist/index.html` Electron fixture：通过，summary `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-dist-pass-summary.json`，截图 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-dist-pass-chat.png`，证明不依赖 dev server，默认桌面端入口也不会回到旧折叠 / JSON 泄露行为。
- 关键断言：`webProcessGroupExpanded=true`、`hasSearchSourceSection=true`、`hasFetchPageSection=true`、`hasFetchPageUrl=true`、`hasFinalTextAfterProcess=true`、`rawJsonEnvelopeVisible=false`、`forbiddenTransportHits=[]`、`noConsoleErrors=true`。

2026-06-20 本轮追加 Markdown / WebSearch 渲染对齐修复后复测：

```bash
npx vitest run "src/components/agent/chat/utils/messageDisplaySanitizer.test.ts" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.test.tsx" "src/components/agent/chat/utils/searchResultPreview.test.ts" "src/components/agent/chat/components/SearchResultPreviewList.test.tsx" "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
node --check "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs"
npx eslint "src/components/agent/chat/utils/messageDisplaySanitizer.ts" "src/components/agent/chat/utils/messageDisplaySanitizer.test.ts" "src/components/agent/chat/utils/markdownLooseSyntaxNormalizer.ts" "src/components/agent/chat/components/MarkdownRenderer.tsx" "src/components/agent/chat/components/MarkdownRenderer.test.tsx" "src/components/agent/chat/components/SearchResultPreviewList.tsx" "src/components/agent/chat/components/SearchResultPreviewList.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/utils/searchResultPreview.ts" "src/components/agent/chat/utils/searchResultPreview.test.ts" "src/components/agent/chat/utils/toolBatchGrouping.ts" --max-warnings 0
npm run electron:build
npm run smoke:agent-runtime-current-fixture
npm run smoke:claw-chat-current-fixture -- --scenario web-tools-rendering --timeout-ms 180000 --prefix claw-chat-current-fixture-web-tools-rendering-markdown-search-dist-pass
```

结果：

- `messageDisplaySanitizer.test.ts` + `StreamingRenderer.test.tsx` + `MarkdownRenderer.test.tsx` + 搜索预览 / fixture 守卫：`160 passed`，新增覆盖 WebSearch + WebFetch 后带“网页搜索渲染结论”和松散 Markdown 标题的最终正文不再被过程过滤吞掉。
- `node --check` 与 ESLint：上述相关脚本和前端文件通过。
- `npm run electron:build`：通过，包含 renderer、Electron host/preload、`packages/app-server-client` build、Electron typecheck、App Server sidecar 准备。
- `npm run smoke:agent-runtime-current-fixture`：通过，继续覆盖 history/cache、流式完成态、MessageList 终态 UI、Electron fixture guard、Coding Workbench Electron fixture、Claw cancel-then-continue Electron fixture；`liveProviderUsed=false`。
- `web-tools-rendering` 构建后真实 Electron fixture：通过，summary `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-markdown-search-dist-pass-summary.json`。
- 关键断言：`hasAssistantSummary=true`、`hasFinalTextAfterProcess=true`、`markdownHeadingVisible=true`、`markdownStrongVisible=true`、`markdownTableVisible=true`、`rawJsonEnvelopeVisible=false`、`searchNoiseVisible=false`、`rawMarkdownVisible=false`、`hasFullSearchUrlVisible=false`、`webProcessGroupExpanded=true`、`processGroupCount=1`、`consoleErrors=[]`。

2026-06-20 本轮追加 Codex 默认折叠 / 卡住态修复后复测：

```bash
npx vitest run "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
node --check "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs"
npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"
npm run electron:build
npm run smoke:claw-chat-current-fixture -- --scenario web-tools-rendering --timeout-ms 180000 --prefix claw-chat-current-fixture-web-tools-rendering-codex-default-collapsed-pass
npm run test:contracts
npx vitest run "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.test.tsx" "src/components/agent/chat/components/SearchResultPreviewList.test.tsx" "src/components/agent/chat/utils/messageDisplaySanitizer.test.ts" "src/components/agent/chat/utils/searchResultPreview.test.ts" "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" "scripts/electron/codex-import-click-through-fixture-smoke.test.mjs" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
npm run smoke:claw-chat-current-fixture -- --scenario web-tools-rendering --timeout-ms 180000 --prefix claw-chat-current-fixture-web-tools-rendering-codex-default-collapsed-rerun
npm run smoke:codex-import-click-through-electron-fixture -- --timeout-ms 180000 --prefix codex-import-click-through-markdown-search-rerun
npm run smoke:claw-chat-current-fixture -- --scenario web-tools-rendering --timeout-ms 180000 --prefix claw-chat-current-fixture-web-tools-rendering-synthesizing-expanded-final
```

- `messageListItemProjection.unit.test.ts` + `StreamingRenderer.test.tsx`：`97 passed`，新增覆盖 timeline 已有 `final_answer` 但 WebSearch/WebFetch 状态滞后为 running 时，最终正文仍继续显示在过程之后；完成态搜索过程默认折叠，点击后可见来源。
- `web-tools-rendering` 构建后真实 Electron fixture：通过，summary `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-codex-default-collapsed-pass-summary.json`。
- 关键断言：`guiWebSearchProcessDefaultCollapsed=true`、`guiWebSearchProcessShowsSourcesAfterExpand=true`、`guiWebFetchProcessShowsReadPagesAfterExpand=true`、`guiWebSearchFinalTextInterleaved=true`、`guiNotStuckStreaming=true`、`guiInputRemainsReady=true`、`webProcessGroupExpanded=false`、`expandedDetails.webProcessGroupExpanded=true`、`expandedDetails.hasFullSearchUrlVisible=false`、`consoleErrors=[]`。
- 追加复跑：`npm run test:contracts` 通过；渲染定向回归 `8 passed / 197 passed`；真实 Electron `web-tools-rendering` 复跑通过，summary `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-synthesizing-expanded-final-summary.json`，新增断言 `guiWebSearchProcessExpandedWhileSynthesizing=true`，证明“正在整理最终答复”阶段过程组仍展开；Codex 导入点击闭环复跑通过，summary `.lime/qc/gui-evidence/codex-import-click-through-fixture/codex-import-click-through-markdown-search-rerun-summary.json`。
- 针对用户复现的顽固早折叠态再补父层回归：`messageListItemProjection.unit.test.ts` 新增 `搜索已完成但 active turn 仍在整理最终答复时，应保持过程活跃且不伪造正文`，`MessageList.test.tsx` 新增 `搜索已完成但 turn 仍在整理最终答复时，应保持过程为活跃渲染`，锁定 active turn + `runtimeStatus.phase=synthesizing` + WebSearch completed + assistant 正文为空时，消息仍按 active process 传给 `StreamingRenderer`。
- 真实 Electron 复跑：`npm run smoke:claw-chat-current-fixture -- --scenario web-tools-rendering --timeout-ms 180000 --prefix claw-chat-current-fixture-web-tools-rendering-active-turn-expanded-final` 通过，summary `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-active-turn-expanded-final-summary.json`；关键断言 `guiWebSearchProcessExpandedWhileSynthesizing=true`、`guiWebSearchProcessDefaultCollapsed=true`、`guiWebSearchProcessShowsSourcesAfterExpand=true`、`guiWebFetchProcessShowsReadPagesAfterExpand=true`、`guiMarkdownRendered=true`、`noConsoleErrors=true`。
- 最新真实 Electron rerun：`npm run smoke:claw-chat-current-fixture -- --scenario web-tools-rendering --timeout-ms 180000 --prefix claw-chat-current-fixture-web-tools-rendering-active-turn-expanded-final-rerun` 通过，summary `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-active-turn-expanded-final-rerun-summary.json`；已复核 `ok=true`、`guiWebSearchProcessExpandedWhileSynthesizing=true`、`guiWebSearchProcessDefaultCollapsed=true`、`guiWebSearchProcessShowsSourcesAfterExpand=true`、`guiWebFetchProcessShowsReadPagesAfterExpand=true`、`guiMarkdownRendered=true`、`noConsoleErrors=true`。
- 最终人工收口复跑：`npm run smoke:claw-chat-current-fixture -- --scenario web-tools-rendering --timeout-ms 180000 --prefix claw-chat-current-fixture-web-tools-rendering-final-verification` 通过，summary `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-web-tools-rendering-final-verification-summary.json`；已复核 `ok=true`、`guiWebSearchProcessExpandedWhileSynthesizing=true`、`guiWebSearchProcessDefaultCollapsed=true`、`guiWebSearchProcessShowsSourcesAfterExpand=true`、`guiWebFetchProcessShowsReadPagesAfterExpand=true`、`guiMarkdownRendered=true`、`noConsoleErrors=true`。
- 已尝试复跑 `npm run typecheck`，但本地全量 `tsc --noEmit` 超过 6 分钟仍高 CPU 运行且未返回，已中断；本轮以定向 Vitest、ESLint、`test:contracts`、`electron:build` 中的 Electron/App Server client 类型检查和真实 Electron fixture 作为交付证据。

2026-06-20 本轮追加 Codex 本地历史导入态 Markdown / WebSearch 渲染对齐后复测：

```bash
node --check "scripts/electron/codex-import-click-through-fixture-smoke.mjs"
node --check "scripts/electron/lib/local-history-import-click-through-gui.mjs"
node --check "scripts/electron/lib/local-history-import-click-through-fixture.mjs"
npx vitest run "scripts/electron/codex-import-click-through-fixture-smoke.test.mjs" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
npx eslint "scripts/electron/codex-import-click-through-fixture-smoke.mjs" "scripts/electron/lib/local-history-import-click-through-fixture.mjs" "scripts/electron/lib/local-history-import-click-through-gui.mjs" "scripts/electron/codex-import-click-through-fixture-smoke.test.mjs" --max-warnings 0
npx vitest run "src/components/agent/chat/components/MarkdownRenderer.test.tsx" "src/components/agent/chat/components/SearchResultPreviewList.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/utils/messageDisplaySanitizer.test.ts" "src/components/agent/chat/utils/searchResultPreview.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
cargo fmt --all # cwd: lime-rs
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server commit_preserves_codex_tool_command_and_patch_timeline -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server read_session_projects_imported_web_search_tool_result_as_timeline_item -- --nocapture
npm run electron:build
npm run smoke:codex-import-click-through-electron-fixture -- --timeout-ms 180000 --prefix codex-import-click-through-markdown-search-pass
npm run smoke:agent-runtime-current-fixture
```

结果：

- 导入 fixture 守卫：`5 passed`，新增覆盖导入态松散 Markdown、Yahoo 搜索导航噪音、有效来源短标签、搜索过程组展开检查，以及完整 URL 不外露。
- 前端渲染相关回归：`150 passed`，继续覆盖 Markdown loose syntax、搜索结果过滤 / 短来源展示、WebSearch / WebFetch 过程组、最终正文不被过程过滤吞掉。
- Rust App Server 定向：`commit_preserves_codex_tool_command_and_patch_timeline` 与 `read_session_projects_imported_web_search_tool_result_as_timeline_item` 均通过；修复 Codex `web_search_end.output` 被导入规范化丢失，以及同一 legacy tool id 后续 `tool.result` 不能补全 output 的 read model 合并问题。
- `npm run electron:build`：通过，重新构建 renderer、Electron host/preload、`packages/app-server-client`、Electron typecheck 和 App Server sidecar。
- 真实 Electron 导入点击闭环：通过，summary `.lime/qc/gui-evidence/codex-import-click-through-fixture/codex-import-click-through-markdown-search-pass-summary.json`，主截图 `.lime/qc/gui-evidence/codex-import-click-through-fixture/codex-import-click-through-markdown-search-pass.png`，三视口截图位于 `.lime/qc/gui-evidence/codex-import-click-through-fixture/visual-audit/`。
- 关键断言：`markdownHeadingVisible=true`、`markdownStrongVisible=true`、`markdownTableVisible=true`、`rawMarkdownVisible=false`、`hasImportedSearchResult=true`、`searchProcessGroupVisible=true`、`searchNoiseVisible=false`、`hasFullSearchUrlVisible=false`、`consoleErrors=[]`；`searchGroupExpansion.reason="clicked"` 证明完成态搜索组默认可折叠，展开后只显示有效来源 `Lime Codex Import Rendering Source` 与短标签 `example.com/lime-codex-import-rendering`。
- `npm run smoke:agent-runtime-current-fixture`：通过，继续覆盖 history/cache、流式完成态、MessageList 终态 UI、Electron fixture guard、Coding Workbench Electron fixture、Claw cancel-then-continue Electron fixture；`liveProviderUsed=false`。
- 追加真实 Electron 导入点击闭环复跑：`npm run smoke:codex-import-click-through-electron-fixture -- --timeout-ms 180000 --prefix codex-import-click-through-active-turn-regression` 通过，summary `.lime/qc/gui-evidence/codex-import-click-through-fixture/codex-import-click-through-active-turn-regression-summary.json`；三视口均确认 `markdownHeadingVisible=true`、`markdownStrongVisible=true`、`markdownTableVisible=true`、`rawMarkdownVisible=false`、`searchProcessGroupVisible=true`、`searchNoiseVisible=false`、`hasFullSearchUrlVisible=false`、`inputbarDisabled=false`、`consoleErrors=[]`，并覆盖导入后继续对话仍能显示用户消息与 assistant 回复。
- 最新真实 Electron 导入点击 rerun：`npm run smoke:codex-import-click-through-electron-fixture -- --timeout-ms 180000 --prefix codex-import-click-through-active-turn-regression-rerun` 通过，summary `.lime/qc/gui-evidence/codex-import-click-through-fixture/codex-import-click-through-active-turn-regression-rerun-summary.json`；已复核 `ok=true`、`consoleErrors=[]`，三视口 `desktop / compact / narrow` 均确认 `markdownHeadingVisible=true`、`rawMarkdownVisible=false`、`searchProcessGroupVisible=true`、`hasFullSearchUrlVisible=false`。
- 最终人工收口复跑：`npm run smoke:codex-import-click-through-electron-fixture -- --timeout-ms 180000 --prefix codex-import-click-through-final-verification` 通过，summary `.lime/qc/gui-evidence/codex-import-click-through-fixture/codex-import-click-through-final-verification-summary.json`；已复核 `ok=true`、`consoleErrors=[]`、`markdownHeadingVisible=true`、`markdownStrongVisible=true`、`markdownTableVisible=true`、`rawMarkdownVisible=false`、`hasImportedSearchResult=true`、`searchProcessGroupVisible=true`、`searchNoiseVisible=false`、`hasFullSearchUrlVisible=false`，并完成三视口 visual audit。

2026-06-20 本轮追加显式 `@搜索` live WebSearch / WebFetch 强约束后复测：

```bash
npx vitest run "src/components/agent/chat/workspace/useWorkspaceSendActions.test.tsx" --testNamePattern "@搜索" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
npx vitest run "scripts/lib/live-provider-smoke-gate.test.mjs" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
cargo fmt --manifest-path "lime-rs/Cargo.toml" --all -- --check
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tracker_requires_each_required_tool_to_succeed -- --nocapture
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server research_skill_launch_requires_web_fetch_for_page_confirmation -- --nocapture
npm run test:contracts
npm run smoke:agent-runtime-current-fixture
npm run verify:gui-smoke
npm run smoke:claw-chat-ready-streaming -- --timeout-ms 180000
```

结果：

- `@搜索` 前端发送边界：`6 passed, 131 skipped`，显式 `@搜索` 默认提交 `webSearch=true`、`searchMode="required"` 和 `research_skill_launch` metadata；普通自然语言新闻请求仍不要求 `searchMode=required`。
- Rust policy：`lime-agent` 新增覆盖 `required_tools` 必须逐项成功；`app-server` 新增覆盖 `research_skill_launch` 只在显式 research metadata 下把 `WebFetch` 加入 required / allowed tools。
- `npm run test:contracts`：通过，`app-server-client-contract` 增至 `281 checks`，live smoke contract 已同步 `search_mode="required"` 与 `liveWebExplicitSearchRequired`。
- `npm run smoke:agent-runtime-current-fixture` 与 `npm run verify:gui-smoke`：均通过；GUI smoke 复核 `claw workbench shell ready`、`memory settings ready`。
- 真实 live Provider E2E：`npm run smoke:claw-chat-ready-streaming -- --timeout-ms 180000` 通过，真实 provider `custom-cb381b4f-d2fa-4eff-ba22-c867c38ba8d3 / gpt-5.5`，session `sess_b17256e265054171891581cf44bc524e`，live web turn `b3b4743e-0ace-428b-a2bf-63a226c14eac`，`liveWebSearchMode="required"`。
- live E2E 关键断言：`liveWebSearchToolEventsSeen=true`、`liveWebFetchToolEventsSeen=true`、`liveWebRequiredToolEventsSeen=true`、`liveWebRequiredToolEventOutputsPresent=true`、`liveWebRequiredToolEventOrderValid=true`、`liveWebSearchCompleted=true`、`liveWebFetchCompleted=true`、`liveWebExplicitSearchRequired=true`、`noRuntimeMockFallbackSeen=true`、`noBlockingConsoleErrors=true`。
- live E2E evidence：`.lime/qc/gui-evidence/claw-chat-ready-streaming/claw-chat-ready-streaming-summary.json` 与 `.lime/qc/gui-evidence/claw-chat-ready-streaming/claw-chat-ready-streaming-05-live-web-tools-final.png`。

2026-06-20 本轮追加 Codex 搜索活动单元轻量行后复测：

```bash
npx vitest run "src/components/agent/chat/components/StreamingRenderer.test.tsx"
npx vitest run "src/components/agent/chat/components/SearchResultPreviewList.test.tsx" "src/components/agent/chat/utils/searchResultPreview.test.ts" "src/components/agent/chat/utils/toolBatchGrouping.test.ts"
npx vitest run "src/components/agent/chat/components/MessageList.test.tsx" --testNamePattern "Codex|web|搜索|process|过程|Markdown"
npx playwright test --config ".lime/qc/playwright-cli/playwright.config.mjs"
npm run smoke:agent-runtime-current-fixture
npm run verify:gui-smoke
```

结果：

- `StreamingRenderer.test.tsx`：`71 passed`，新增锁定搜索过程组 `data-process-kind="web_search"`、Codex 式状态点、running 状态不更新前一个思考组，以及 WebSearch/WebFetch 展开态不再退回通用 `inline-tool-process-step` 小卡片。
- 搜索预览与批次分组回归：`30 passed`，继续覆盖短来源标签、搜索结果过滤、WebSearch/WebFetch 摘要与 JSON 包络隐藏。
- `MessageList.test.tsx` 搜索 / Markdown / process 定向：`26 passed, 123 skipped`，确认消息列表投影未因轻量行改动回流 legacy 工具卡。
- Playwright CLI：`2 passed`，覆盖 Codex 对话渲染中的 WebSearch/WebFetch 折叠、展开、Markdown 渲染与导入后继续对话。
- `npm run smoke:agent-runtime-current-fixture`：通过，继续覆盖 current Agent Runtime fixture、真实 Electron Coding Workbench fixture 与 Claw 停止后同会话继续输出；`liveProviderUsed=false`。
- `npm run verify:gui-smoke`：通过，最终输出 `claw workbench shell ready` 与 `memory settings ready`。
- 视觉 / 产品结论：搜索过程现在按 Codex `WebSearchCell` 语义作为独立活动单元展示，running 使用活动点，completed 使用弱状态点；展开态保留搜索 / 读取顺序与思考穿插，但 WebSearch/WebFetch 不再显示成额外工具小卡片。

2026-06-20 本轮追加过程组 active runtime phase 白名单后复测：

```bash
npx vitest run "src/components/agent/chat/components/StreamingRenderer.test.tsx" --testNamePattern "搜索已完成|运行状态已经完成|联网搜索批次|消息仍在输出且搜索"
npx vitest run "src/components/agent/chat/components/StreamingRenderer.test.tsx"
```

结果：

- 定向回归：`5 passed, 67 skipped`，覆盖 `synthesizing` / 流式输出期间搜索完成但最终正文尚未出现时继续展开，避免“还没完成就折叠”的卡顿感。
- 完整渲染回归：`72 passed`，新增确认 `completed` 这类终态 runtime status 不会把空正文搜索批次继续误判为 active 展开；完成态仍默认回到 Codex 式摘要折叠，展开后才显示来源。
- 视觉 / 产品结论：过程组展开依据从“不是 failed/cancelled 就算活跃”收窄为明确 active phase，避免 `completed` / `idle` / 未知终态污染 WebSearch/WebFetch 折叠状态。

2026-06-20 本轮拆分 StreamingRenderer WebSearch/Codex 回归测试后复测：

```bash
npx vitest run "src/components/agent/chat/components/StreamingRenderer.test.tsx"
npx vitest run "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.test.tsx"
npx playwright test --config ".lime/qc/playwright-cli/playwright.config.mjs"
```

结果：

- 先修复测试 harness 拆分后的 mock 加载顺序：新增 `StreamingRenderer.testMocks.tsx` 专门承载 `vi.mock(...)`，`StreamingRenderer.testHarness.tsx` 只保留挂载 / cleanup / render helper，避免 `react-i18next`、`MarkdownRenderer`、`A2UITaskCard`、`AgentPlanBlock` mock 在生产组件加载后才注册。
- `StreamingRenderer.test.tsx` 单文件恢复：`72 passed`。
- WebSearch / Codex 专项拆分后：`StreamingRenderer.webSearch.test.tsx` `14 passed`，`StreamingRenderer.test.tsx` `58 passed`，合计仍为 `72 passed`；主文件从约 `3674` 行降到约 `2581` 行。
- 迁移覆盖：本地历史导入中的 `web_search` 单独分组、纯导入 WebSearch/WebFetch 折叠/展开和快照预览、Codex `web_search action object` 不泄露 JSON、实时搜索不更新前一个思考组、搜索过程 streaming / synthesizing / completed 终态展开策略、WebFetch JSON 包络隐藏、搜索与思考穿插顺序、搜索失败诊断 JSON 折叠。
- Playwright CLI：`2 passed`，继续覆盖 Codex 对话渲染中的 WebSearch/WebFetch 折叠、展开、Markdown 渲染一致，以及 Codex 导入态 Markdown / 搜索过程 / 继续对话。
- 产品结论：本轮不改生产渲染逻辑，只把用户反馈最密集的 Codex WebSearch 渲染回归从巨型测试中独立出来，后续新增搜索折叠 / JSON 隐藏 / 思考穿插问题应进入 `StreamingRenderer.webSearch.test.tsx`。

2026-06-20 本轮修复可点击搜索来源展开态 timeline 顺序后复测：

```bash
npx vitest run "src/components/agent/chat/components/StreamingRenderer.webSearch.test.tsx" --testNamePattern "可点击搜索来源展开态"
npx vitest run "src/components/agent/chat/components/StreamingRenderer.webSearch.test.tsx"
npx vitest run "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/utils/toolBatchGrouping.test.ts" "src/components/agent/chat/utils/searchResultPreview.test.ts"
npx playwright test --config ".lime/qc/playwright-cli/playwright.config.mjs"
npx eslint "src/components/agent/chat/components/StreamingProcessGroup.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.test.tsx"
npm run smoke:agent-runtime-current-fixture
npm run verify:gui-smoke
```

结果：

- 新增回归锁定 WebSearch 有可点击来源预览且中间穿插 thinking / WebFetch 时，展开态必须按原始 timeline 渲染：搜索来源 -> thinking -> 读取页面 -> 后续正文，避免把 `读取页面` 提前到 thinking 之前。
- `StreamingProcessGroup` 的 WebSearch 展开分支新增 timeline 渲染：有 non-tool entries 时按 `entries` 原始顺序渲染可点击搜索预览、思考和 WebFetch 行；无 non-tool entries 时仍保留原有搜索来源 / 读取页面分组展示。
- WebFetch 行摘要中的完整 `https://...` 已短标签化为 `host/path`，继续避免搜索过程展开态泄露完整 URL / 传输层 JSON。
- 定向回归：`1 passed, 14 skipped`；WebSearch 专项：`15 passed`。
- 主渲染 / helper 回归：`StreamingRenderer.test.tsx`、`toolBatchGrouping.test.ts`、`searchResultPreview.test.ts` 合计 `85 passed`。
- Playwright CLI：`2 passed`，继续覆盖 WebSearch/WebFetch 折叠、展开、Markdown 渲染一致和 Codex 导入态继续对话。
- ESLint：`StreamingProcessGroup.tsx` 与 `StreamingRenderer.webSearch.test.tsx` 通过。
- `npm run smoke:agent-runtime-current-fixture`：通过，继续覆盖 history/cache hydration、流式完成态、Claw 终态 UI、真实 Electron Coding Workbench fixture 与 Claw 停止后同会话继续输出；`liveProviderUsed=false`。
- `npm run verify:gui-smoke`：通过，Electron smoke 完成 renderer / host / app-server sidecar 构建，最终输出 `claw workbench shell ready` 与 `memory settings ready`。
- 产品结论：搜索过程展开态现在更接近 Codex timeline 语义，不再因为有可点击来源预览而打乱搜索、思考、读取页面的穿插顺序。

2026-06-20 本轮拆分 WebSearch timeline 子组件后复测：

```bash
npx eslint "src/components/agent/chat/components/StreamingProcessGroup.tsx" "src/components/agent/chat/components/StreamingWebSearchProcessTimeline.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.test.tsx"
npx vitest run "src/components/agent/chat/components/StreamingRenderer.webSearch.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
npx playwright test --config ".lime/qc/playwright-cli/playwright.config.mjs"
npm run smoke:agent-runtime-current-fixture
```

结果：

- `StreamingProcessGroup.tsx` 从约 `800` 行降到约 `421` 行，WebSearch 展开态 timeline、搜索来源预览、WebFetch 行和短 URL 标签化迁入 `StreamingWebSearchProcessTimeline.tsx`（约 `385` 行）。
- 本轮是结构拆分，不改变 WebSearch / WebFetch 折叠展开行为；搜索来源可点击预览、thinking 穿插顺序、读取页面和 JSON / URL 隐藏继续由 `StreamingRenderer.webSearch.test.tsx` 保护。
- ESLint：上述 3 个文件通过。
- 渲染回归：`StreamingRenderer.webSearch.test.tsx` `15 passed`，`StreamingRenderer.test.tsx` `58 passed`，合计 `73 passed`。
- Playwright CLI：`2 passed`，继续覆盖 WebSearch/WebFetch 过程流折叠、展开、Markdown 渲染一致，以及 Codex 导入态 Markdown / 搜索过程 / 继续对话。
- `npm run smoke:agent-runtime-current-fixture`：通过，继续覆盖 current Agent Runtime fixture、Claw 终态 UI、真实 Electron Coding Workbench fixture 与 Claw 停止后同会话继续输出；`liveProviderUsed=false`。
- 产品结论：WebSearch 渲染逻辑现在有独立子组件边界，后续继续对齐 Codex 细节时应优先修改 `StreamingWebSearchProcessTimeline.tsx`，避免把过程组壳重新撑大。

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
cargo fmt --manifest-path "lime-rs/crates/agent-rust/crates/agent/Cargo.toml" --check
cargo test --manifest-path "lime-rs/crates/agent-rust/Cargo.toml" -p agent-core web_fetch -- --nocapture
git diff --check -- "lime-rs/crates/agent-rust/crates/agent/src/tools/web.rs" "lime-rs/crates/agent-rust/crates/agent/src/tools/web_fetch_content.rs" "lime-rs/crates/agent-rust/crates/agent/src/tools/mod.rs" "internal/roadmap/turn/implementation-plan.md" "internal/roadmap/turn/test-cases.md"
```

结果：

- `cargo fmt`：通过。
- `agent-core web_fetch`：`11 passed`，WebFetch HTML 清洗、正文抽取、默认相关片段过滤和动态片段过滤测试已迁入 `web_fetch_content.rs`，redirect / permission / creation 测试继续留在 `web.rs`。
- `git diff --check`：通过。

2026-06-21 本轮追加 StreamingRenderer 显示层 sequence 排序后复测：

```bash
npx vitest run "src/components/agent/chat/components/StreamingRenderer.webSearch.test.tsx" --silent=passed-only --disableConsoleIntercept
npx vitest run "src/components/agent/chat/hooks/agentSessionState.test.ts" "src/components/agent/chat/components/messageListTimelineContentParts.unit.test.ts" "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/projection/messageTimelineRenderProjection.test.ts" "src/components/agent/chat/components/StreamingRenderer.webSearch.test.tsx" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.test.ts" "src/components/agent/chat/hooks/agentStreamTurnEventBinding.test.ts" "src/components/agent/chat/components/MessageList.test.tsx" "src/lib/api/agentRuntime/threadClient.test.ts" --silent=passed-only --disableConsoleIntercept
npm run build:renderer:electron
npx eslint "src/components/agent/chat/components/StreamingRenderer.tsx" "src/components/agent/chat/components/streamingContentPartOrder.ts" "src/components/agent/chat/components/StreamingRenderer.webSearch.test.tsx" --max-warnings 0
node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario web-tools-rendering --timeout-ms 180000 --evidence-dir ".lime/qc/gui-evidence/playwright-cli" --prefix "cli-web-tools-rendering"
```

结果：

- `StreamingRenderer.webSearch.test.tsx`：`17 passed`，新增覆盖 `contentParts` 到达顺序为 `WebSearch#3 -> WebFetch#6 -> thinking#3` 时，显示层按 sequence 恢复为 `WebSearch -> thinking -> WebFetch`，并用 DOM 相对位置锁定展开态顺序。
- 前端主链组合回归：`9 files passed, 310 tests passed`，覆盖 history hydrate、timeline content parts、message projection、stream handler、MessageList 与 thread client。
- `npm run build:renderer:electron`：通过，renderer production build 完成。
- ESLint 与 `git diff --check`：通过。
- Playwright CLI 真实 Electron fixture：通过，summary `.lime/qc/gui-evidence/playwright-cli/cli-web-tools-rendering-summary.json`，截图 `.lime/qc/gui-evidence/playwright-cli/cli-web-tools-rendering-chat.png`。
- 关键断言：`guiWebToolsTimelineOrderPreserved=true`、`guiWebSearchProcessDefaultCollapsed=true`、`guiWebSearchProcessShowsSourcesAfterExpand=true`、`guiWebFetchProcessShowsReadPagesAfterExpand=true`、`guiMarkdownRendered=true`、`guiWebFetchTransportEnvelopeHidden=true`、`noConsoleErrors=true`；展开态 `expandedDetails.hasTimelineOrderPreserved=true`，确认搜索、思考和读取页面不再越序。

2026-06-21 本轮追加 ServiceSkill 展示卡片与 JSON 包络隐藏后复测：

```bash
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp oauth -- --test-threads=1
node scripts/agent-runtime/service-skill-entry-smoke.mjs --timeout-ms 180000 --evidence-dir ".lime/qc/gui-evidence/service-skill" --prefix "service-skill-display"
```

结果：

- `lime-mcp oauth`：`20 passed`，修复 MCP OAuth callback channel 类型后恢复 service-skill smoke 所需的 Rust 编译链路。
- `service-skill-entry-smoke.mjs`：通过；前端 metadata / capability draft / inventory client 组合 `38 passed`，App Server workspace skills 定向 `4 passed`，`lime-agent` SkillTool gate 定向 `11 passed`，服务技能入口路由与挂起参数 `51 passed`，Agent 对话内 A2UI 挂起主链 `7 passed`。
- 运行时 transcript evidence：`.lime/qc/skill-forge-runtime-transcript-current.json`，结果 `pass`，覆盖 `registered_skill_discovery`、`runtime_binding_projection`、`skill_tool_gate_allow`、`skill_tool_gate_deny`、allowlist scope 与 session enable/deny 事件。
- 展示层结论：`lime_run_service_skill` 归类为 current `skill` 展示，不再显示“兼容”；结构化 `service_skill_id / slot_values` 运行包络在内联工具卡中隐藏，不再渲染成 raw JSON 或“实时输出”。
- 注意：`service-skill-entry-smoke.mjs` 当前不消费 `--evidence-dir/--prefix` 生成截图；本轮截图型 GUI evidence 仍以 Playwright CLI 的 `.lime/qc/gui-evidence/playwright-cli/cli-web-tools-rendering-after-skill-*.json/png` 为准。

2026-06-21 本轮追加 ServiceSkill 完成态 / 历史嵌套 JSON 包络隐藏后复测：

```bash
npx vitest run "src/components/agent/chat/utils/serviceSkillToolResultDisplay.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
npx eslint "src/components/agent/chat/utils/serviceSkillToolResultDisplay.ts" "src/components/agent/chat/utils/serviceSkillToolResultDisplay.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" --max-warnings 0
node scripts/agent-runtime/service-skill-entry-smoke.mjs --timeout-ms 180000
npx playwright test --config ".lime/qc/playwright-cli/playwright.config.mjs"
```

结果：

- ServiceSkill 展示 helper / InlineToolProcessStep / StreamingRenderer 定向回归：`92 passed`，新增覆盖 `result/output/data`、数组容器和字符串化 inner JSON 中的 `service_skill_id / serviceSkillId / slot_values / slotValues` 包络隐藏。
- 渲染层结论：服务技能运行态与完成态都不再把结构化运行包络渲染成 Markdown / raw JSON；完成态仍保留 “已完成服务技能执行 {{subject}}” 摘要和后续 assistant 正文。
- ESLint 与 `git diff --check`：通过。
- `service-skill-entry-smoke.mjs`：通过；前端 metadata `38 passed`，App Server workspace skills `4 passed`，`lime-agent` SkillTool gate `11 passed`，服务技能入口路由 `51 passed`，Agent 对话内 A2UI 挂起主链 `7 passed`。
- Playwright CLI：`2 passed`，继续覆盖 Codex 对话 WebSearch/WebFetch 折叠、展开、Markdown 渲染，以及 Codex 导入态搜索过程和继续对话。

2026-06-21 本轮追加 ServiceSkill 专用 action 标题后复测：

```bash
npx vitest run "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/utils/serviceSkillToolResultDisplay.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
npx vitest run "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/types.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
npx eslint "src/components/agent/chat/utils/toolDisplayConfig/content.ts" "src/components/agent/chat/utils/toolDisplayInfo.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/utils/serviceSkillToolResultDisplay.ts" "src/components/agent/chat/utils/serviceSkillToolResultDisplay.test.ts" --max-warnings 0
node scripts/agent-runtime/service-skill-entry-smoke.mjs --timeout-ms 180000
npx playwright test --config ".lime/qc/playwright-cli/playwright.config.mjs"
```

结果：

- ServiceSkill 展示 / 渲染回归：`110 passed`，`lime_run_service_skill` 运行态标题从通用“执行技能中”收口为“执行服务技能中”，完成态标题从通用“已执行技能”收口为“已执行服务技能”，失败态为“服务技能执行失败”。
- i18n：`loadNamespace` + `types` 共 `8 passed`；新增 `toolCall.action.serviceSkillRun.*` 已覆盖 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`。
- ESLint 与 `git diff --check`：通过。
- `service-skill-entry-smoke.mjs`：通过；继续覆盖前端 metadata、App Server workspace skills、`lime-agent` SkillTool gate、服务技能入口路由与 Agent 对话内 A2UI 挂起主链。
- Playwright CLI：`2 passed`，继续覆盖 Codex WebSearch/WebFetch 与导入态渲染主链。
- 残留搜索：`serviceSkillCompat / compatRun / 服务技能兼容` 未在 current `src/components/agent/chat` 与 i18n 资源中回流。

2026-06-21 本轮追加普通 SkillTool gate proof JSON 包络隐藏后复测：

```bash
npx vitest run "src/components/agent/chat/utils/toolResultEnvelopeDisplay.test.ts" "src/components/agent/chat/utils/serviceSkillToolResultDisplay.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
npx eslint "src/components/agent/chat/utils/toolResultEnvelopeDisplay.ts" "src/components/agent/chat/utils/toolResultEnvelopeDisplay.test.ts" "src/components/agent/chat/utils/serviceSkillToolResultDisplay.ts" "src/components/agent/chat/components/InlineToolProcessStep.tsx" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
node scripts/agent-runtime/service-skill-entry-smoke.mjs --timeout-ms 180000
npm run smoke:agent-runtime-current-fixture
npx playwright test --config ".lime/qc/playwright-cli/playwright.config.mjs"
```

结果：

- 普通 SkillTool / ServiceSkill 结果包络 helper 与渲染回归：`98 passed`；新增覆盖 `SkillTool` gate proof 中的 `request / decision / result / sourceMetadata / permissionBehavior / workspaceSkillRuntimeEnableAttached` 不再渲染为 Markdown / raw JSON。
- 正常 SkillTool 输出不被误吞：`output: "已完成能力分析。"` 仍进入 UI；只隐藏运行时证明包络字段如 `sourceDraftId / workspaceSkillRuntimeEnable`。
- ESLint 与 `git diff --check`：通过。
- `service-skill-entry-smoke.mjs`：通过；继续证明 SkillTool gate allow/deny、source metadata、服务技能入口路由与 A2UI 主链仍可用。
- `npm run smoke:agent-runtime-current-fixture`：通过；覆盖 history/cache hydration、`turn.completed` 工具收尾（legacy `final_done` 仅负向 guard）、MessageList 终态 UI、Electron fixture guard、真实 GUI coding 输入到 Coding Workbench Electron fixture、Claw 停止后同会话继续输出 Electron fixture；`liveProviderUsed=false`。
- Playwright CLI：`2 passed`，继续覆盖 Codex 对话 WebSearch/WebFetch 过程流折叠、展开、Markdown 渲染一致，以及 Codex 导入态 Markdown / 搜索过程 / 继续对话。
- 产品结论：普通 `SkillTool` 的运行时 gate proof 与服务技能运行包络一样被视为协议证据，不再作为用户可读正文；搜索、思考、WebFetch 和 Codex 导入渲染主链未回退。

2026-06-21 本轮追加非命令工具协议诊断 JSON 包络隐藏后复测：

```bash
npx vitest run "src/components/agent/chat/utils/toolResultEnvelopeDisplay.test.ts" "src/components/agent/chat/utils/serviceSkillToolResultDisplay.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
npx eslint "src/components/agent/chat/utils/toolResultEnvelopeDisplay.ts" "src/components/agent/chat/utils/toolResultEnvelopeDisplay.test.ts" "src/components/agent/chat/utils/serviceSkillToolResultDisplay.ts" "src/components/agent/chat/components/InlineToolProcessStep.tsx" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" --max-warnings 0
node scripts/agent-runtime/service-skill-entry-smoke.mjs --timeout-ms 180000
npm run smoke:agent-runtime-current-fixture
npx playwright test --config ".lime/qc/playwright-cli/playwright.config.mjs"
```

结果：

- 工具结果包络 helper / InlineToolProcessStep / StreamingRenderer 定向回归：`102 passed`；新增覆盖非命令工具 `request_metadata / diagnostics / metadata` 等纯协议诊断包络不再进入 Markdown / raw JSON 明细。
- 误吞保护：命令类工具如 `Bash` 的 JSON stdout 不走通用协议包络隐藏，仍保留 `durationMs / result.ok` 等真实命令输出；带 `output` 正文的协议包络也不隐藏。
- ESLint 与 `git diff --check`：通过。
- `service-skill-entry-smoke.mjs`：通过；继续覆盖前端 metadata、App Server workspace skills、`lime-agent` SkillTool gate、服务技能入口路由与 Agent 对话内 A2UI 挂起主链。
- `npm run smoke:agent-runtime-current-fixture`：通过；覆盖 history/cache hydration、`turn.completed` 工具收尾（legacy `final_done` 仅负向 guard）、MessageList 终态 UI、Electron fixture guard、真实 GUI coding 输入到 Coding Workbench Electron fixture、Claw 停止后同会话继续输出 Electron fixture；`liveProviderUsed=false`。
- Playwright CLI：`2 passed`，继续覆盖 Codex 对话 WebSearch/WebFetch 过程流折叠、展开、Markdown 渲染一致，以及 Codex 导入态 Markdown / 搜索过程 / 继续对话。
- 产品结论：工具结果展示现在区分“协议诊断证据”和“用户输出”；非命令工具的 metadata-only / diagnostics-only 包络不会再被当作用户正文，命令 stdout 与真实正文不被误吞。

2026-06-21 本轮追加完整工具卡结果包络隐藏与超限文件拆分后复测：

```bash
npx eslint "src/components/agent/chat/components/ToolCallDisplay.tsx" "src/components/agent/chat/components/ToolCallDisplayResultPanel.tsx" "src/components/agent/chat/components/ToolCallSkillContentPanel.tsx" "src/components/agent/chat/components/ToolCallDisplayList.tsx"
npx eslint "src/components/agent/chat/components/StreamingRenderer.tsx" "src/components/agent/chat/components/StreamingText.tsx" "src/components/agent/chat/components/StreamingStructuredContent.ts" "src/components/agent/chat/components/StreamingRendererViewModel.ts" "src/components/agent/chat/components/StreamingWriteFileCard.tsx" "src/components/agent/chat/components/InlineToolProcessStep.tsx" "src/components/agent/chat/components/InlineToolProcessStepViewModel.ts" "src/components/agent/chat/components/ToolCallDisplay.testFixtures.tsx"
npx eslint "src/components/agent/chat/components/ToolCallDisplay.test.tsx" "src/components/agent/chat/components/ToolCallDisplay.siteMedia.test.tsx" "src/components/agent/chat/components/ToolCallDisplay.commandOutput.test.tsx" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/utils/toolResultEnvelopeDisplay.test.ts"
npx vitest run "src/components/agent/chat/components/ToolCallDisplay.test.tsx" "src/components/agent/chat/components/ToolCallDisplay.siteMedia.test.tsx" "src/components/agent/chat/components/ToolCallDisplay.commandOutput.test.tsx" "src/components/agent/chat/utils/toolResultEnvelopeDisplay.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx"
node scripts/agent-runtime/service-skill-entry-smoke.mjs --timeout-ms 180000
npm run smoke:agent-runtime-current-fixture
npx playwright test --config ".lime/qc/playwright-cli/playwright.config.mjs"
npm run verify:gui-smoke
git diff --check
wc -l "src/components/agent/chat/components/ToolCallDisplay.tsx" "src/components/agent/chat/components/InlineToolProcessStep.tsx" "src/components/agent/chat/components/StreamingRenderer.tsx"
```

结果：

- 完整工具卡 `ToolCallDisplay` 已接入 `shouldHideToolResultEnvelope`；“查看结果”展开后不再把非命令工具 `request_metadata / diagnostics / metadata` 协议诊断包络、普通 `SkillTool` gate proof、`ServiceSkill` 运行包络渲染成 raw JSON。
- 误吞保护继续成立：`Bash` / 命令工具 JSON stdout 即使包含 `metadata.durationMs`、`result.ok` 也不会被通用协议包络过滤吞掉。
- 新增完整卡回归：`ToolCallDisplay.test.tsx` 覆盖非命令 MCP 协议包络隐藏，`ToolCallDisplay.siteMedia.test.tsx` 覆盖普通 `SkillTool` gate proof 隐藏，`ToolCallDisplay.commandOutput.test.tsx` 覆盖 Bash JSON stdout 保留。
- 定向 Vitest：`6 files passed, 126 tests passed`，覆盖完整工具卡、内联工具过程、StreamingRenderer 与包络 helper。
- ESLint：本轮新增 / 拆分实现文件与相关测试文件全部通过。
- 超限拆分：`ToolCallDisplay.tsx` 从 `1830` 行拆到 `923` 行，`InlineToolProcessStep.tsx` 从 `1111` 行拆到 `849` 行，`StreamingRenderer.tsx` 从 `1687` 行拆到 `996` 行；拆出的职责文件均低于 `500` 行。
- `service-skill-entry-smoke.mjs`：通过；继续覆盖前端 metadata、App Server workspace skills、`lime-agent` SkillTool gate、服务技能入口路由与 Agent 对话内 A2UI 挂起主链。
- `npm run smoke:agent-runtime-current-fixture`：通过；继续覆盖 history/cache hydration、`turn.completed` 工具收尾（legacy `final_done` 仅负向 guard）、真实 GUI coding 输入到 Coding Workbench Electron fixture、Claw 停止后同会话继续输出 Electron fixture；`liveProviderUsed=false`。
- Playwright CLI：`2 passed`，继续覆盖 Codex 对话 WebSearch/WebFetch 过程流折叠、展开、Markdown 渲染一致，以及 Codex 导入态 Markdown / 搜索过程 / 继续对话。
- `npm run verify:gui-smoke`：通过；Electron renderer build、Electron host typecheck、app-server sidecar 与 claw workbench / memory settings smoke 均可启动。
- `git diff --check`：通过。

2026-06-21 本轮追加 Markdown / Timeline 超限拆分与未知 item JSON 隐藏后复测：

```bash
npx eslint "src/components/agent/chat/components/AgentThreadTimeline.tsx" "src/components/agent/chat/components/AgentThreadTimelineItemRenderers.tsx" "src/components/agent/chat/components/AgentThreadTimelineViewModel.ts" "src/components/agent/chat/components/AgentThreadTimeline.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.tsx" "src/components/agent/chat/components/MarkdownRendererStyles.tsx" "src/components/agent/chat/components/MarkdownRendererMarkdownModel.ts" --max-warnings 0
npx vitest run "src/i18n/__tests__/loadNamespace.test.ts" "src/i18n/__tests__/locales.test.ts"
npx vitest run "src/components/agent/chat/components/MarkdownRenderer.test.tsx" "src/components/agent/chat/components/AgentThreadTimeline.test.tsx" "src/components/agent/chat/components/AgentThreadTimeline.process.test.tsx" "src/components/agent/chat/components/AgentThreadTimeline.reasoning.test.tsx" "src/components/agent/chat/components/AgentThreadTimelineViewModel.unit.test.ts" "src/components/agent/chat/components/ToolCallDisplay.test.tsx" "src/components/agent/chat/components/ToolCallDisplay.siteMedia.test.tsx" "src/components/agent/chat/components/ToolCallDisplay.commandOutput.test.tsx" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/utils/toolResultEnvelopeDisplay.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
npx playwright test --config ".lime/qc/playwright-cli/playwright.config.mjs"
wc -l "src/components/agent/chat/components/AgentThreadTimelineItemRenderers.tsx" "src/components/agent/chat/components/AgentThreadTimeline.tsx" "src/components/agent/chat/components/AgentThreadTimelineViewModel.ts" "src/components/agent/chat/components/MarkdownRenderer.tsx" "src/components/agent/chat/components/MarkdownRendererMarkdownModel.ts" "src/components/agent/chat/components/MarkdownRendererStyles.tsx"
```

结果：

- `MarkdownRenderer.tsx` 已从 `2089` 行拆到 `916` 行，新增 `MarkdownRendererMarkdownModel.ts` `770` 行与 `MarkdownRendererStyles.tsx` `432` 行；Markdown 解析 / 样式职责从主渲染组件中拆出。
- `AgentThreadTimeline.tsx` 已从 `1145` 行拆到 `512` 行，新增 `AgentThreadTimelineItemRenderers.tsx` `660` 行，`AgentThreadTimelineViewModel.ts` 当前 `154` 行；时间线壳、item 渲染和 view model 职责分开。
- 未适配的历史 runtime item fallback 不再用 `<pre>{JSON}</pre>` 摊开原始协议对象，改为用户态提示；新增 `agentChat.threadTimeline.unsupportedItem.*` 五语言文案，覆盖 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`。
- ESLint：上述渲染链实现与测试文件通过；本轮修复了 `renderGroupItemDetails` 普通 helper 内调用 `useTranslation` 的 hook 违规，改为由 `TimelineItemDetails` 组件注入翻译函数。
- i18n：`loadNamespace` + `locales` 共 `12 passed`，确认新增五语言资源可加载。
- 渲染链定向回归：`11 files passed, 217 tests passed`，覆盖 MarkdownRenderer、AgentThreadTimeline、reasoning / process timeline、ToolCallDisplay、InlineToolProcessStep、StreamingRenderer 与工具结果包络隐藏。
- Playwright CLI：`2 passed`，继续覆盖 Codex 对话 WebSearch/WebFetch 过程流折叠、展开和 Markdown 渲染一致，以及 Codex 导入态 Markdown、搜索过程和继续对话。
- 本轮没有把全量 `npm run typecheck` 标记为通过：该命令在本地超过约 `12` 分钟仍无输出但进程仍运行，已用 `Ctrl-C` 中止，退出码 `130`；后续需要单独排查全量 tsc 卡住原因。

2026-06-21 本轮追加渲染链测试超限拆分后复测：

```bash
npx eslint "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/InlineToolProcessStep.web.test.tsx" "src/components/agent/chat/components/InlineToolProcessStep.site.test.tsx" "src/components/agent/chat/components/InlineToolProcessStep.testHarness.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/StreamingRenderer.fileChanges.test.tsx" "src/components/agent/chat/components/StreamingRenderer.importedHistory.test.tsx" "src/components/agent/chat/components/StreamingRenderer.processGroups.test.tsx" "src/components/agent/chat/components/StreamingRenderer.thinking.test.tsx" "src/components/agent/chat/components/StreamingRenderer.structuredContent.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.imported.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.details.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.codeBlocks.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.media.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.normalization.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.runtime.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.testHarness.tsx" --max-warnings 0
npx vitest run "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/InlineToolProcessStep.web.test.tsx" "src/components/agent/chat/components/InlineToolProcessStep.site.test.tsx" "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/StreamingRenderer.fileChanges.test.tsx" "src/components/agent/chat/components/StreamingRenderer.importedHistory.test.tsx" "src/components/agent/chat/components/StreamingRenderer.processGroups.test.tsx" "src/components/agent/chat/components/StreamingRenderer.thinking.test.tsx" "src/components/agent/chat/components/StreamingRenderer.structuredContent.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.imported.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.details.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.codeBlocks.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.media.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.normalization.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.runtime.test.tsx"
npx playwright test --config ".lime/qc/playwright-cli/playwright.config.mjs"
git diff --check
find "src/components/agent/chat/components" -maxdepth 1 \( -name "MarkdownRenderer*.test.tsx" -o -name "MarkdownRenderer.testHarness.tsx" -o -name "StreamingRenderer*.test.tsx" -o -name "StreamingRenderer.testHarness.tsx" -o -name "InlineToolProcessStep*.test.tsx" -o -name "InlineToolProcessStep.testHarness.tsx" -o -name "MarkdownRenderer*.tsx" -o -name "MarkdownRenderer*.ts" -o -name "StreamingRenderer*.tsx" -o -name "StreamingRenderer*.ts" -o -name "AgentThreadTimeline*.tsx" -o -name "AgentThreadTimeline*.ts" \) -print0 | xargs -0 wc -l | sort -nr
```

结果：

- `InlineToolProcessStep.test.tsx` 从 `1403` 行拆到 `948` 行，新增 `InlineToolProcessStep.testHarness.tsx` `80` 行、`InlineToolProcessStep.web.test.tsx` `285` 行、`InlineToolProcessStep.site.test.tsx` `114` 行。
- `StreamingRenderer.test.tsx` 从 `2695` 行拆到 `832` 行，新增 `StreamingRenderer.fileChanges.test.tsx` `313` 行、`StreamingRenderer.importedHistory.test.tsx` `323` 行、`StreamingRenderer.processGroups.test.tsx` `426` 行、`StreamingRenderer.thinking.test.tsx` `548` 行、`StreamingRenderer.structuredContent.test.tsx` `310` 行。
- `StreamingRenderer.webSearch.test.tsx` 从 `1412` 行拆到 `960` 行，新增 `StreamingRenderer.webSearch.imported.test.tsx` `264` 行与 `StreamingRenderer.webSearch.details.test.tsx` `212` 行。
- `MarkdownRenderer.test.tsx` 从 `1389` 行拆到 `76` 行，新增 `MarkdownRenderer.testHarness.tsx` `242` 行、`MarkdownRenderer.codeBlocks.test.tsx` `224` 行、`MarkdownRenderer.media.test.tsx` `319` 行、`MarkdownRenderer.normalization.test.tsx` `382` 行、`MarkdownRenderer.runtime.test.tsx` `163` 行。
- 当前触达的 Codex 渲染链实现 / 测试文件均低于 `1000` 行；`StreamingRenderer.tsx` 为 `996` 行，已贴近边界，后续不得继续向该文件追加新职责。
- ESLint：上述 `InlineToolProcessStep` / `StreamingRenderer` / `MarkdownRenderer` 测试拆分文件通过。
- 合并渲染链 Vitest：`17 files passed, 157 tests passed`，覆盖内联工具过程、WebSearch/WebFetch、Codex 导入态、结构化内容、流式 Markdown、图片 / 链接、A2UI 与代码块渲染。
- Playwright CLI：`2 passed`，继续覆盖 Codex 对话 WebSearch/WebFetch 过程流折叠、展开和 Markdown 渲染一致，以及 Codex 导入态 Markdown、搜索过程和继续对话。
- `git diff --check`：通过。

2026-06-21 本轮追加 `MessageList.test.tsx` 超限拆分后复测：

```bash
npx eslint "src/components/agent/chat/components/MessageList*.test.tsx" "src/components/agent/chat/components/MessageList.testHarness.tsx" --max-warnings 0
npx vitest run "src/components/agent/chat/components/MessageList.test.tsx" "src/components/agent/chat/components/MessageList.historyWindow.test.tsx" "src/components/agent/chat/components/MessageList.importedHistory.test.tsx" "src/components/agent/chat/components/MessageList.runtimeStatus.test.tsx" "src/components/agent/chat/components/MessageList.streamingTurns.test.tsx" "src/components/agent/chat/components/MessageList.imageTasks.test.tsx" "src/components/agent/chat/components/MessageList.mediaTasks.test.tsx" "src/components/agent/chat/components/MessageList.inlineActions.test.tsx" "src/components/agent/chat/components/MessageList.reasoningPersistence.test.tsx" "src/components/agent/chat/components/MessageList.reasoningFlow.test.tsx" "src/components/agent/chat/components/MessageList.webProcess.test.tsx" "src/components/agent/chat/components/MessageList.artifactsTimeline.test.tsx" "src/components/agent/chat/components/MessageList.messageActions.test.tsx" "src/components/agent/chat/components/MessageList.artifactFiltering.test.tsx" "src/components/agent/chat/components/MessageList.failureWebTools.test.tsx"
git diff --check
find "src/components/agent/chat/components" -maxdepth 1 \( -name "MessageList*.test.tsx" -o -name "MessageList.testHarness.tsx" -o -name "MarkdownRenderer*.test.tsx" -o -name "MarkdownRenderer.testHarness.tsx" -o -name "StreamingRenderer*.test.tsx" -o -name "InlineToolProcessStep*.test.tsx" \) -print0 | xargs -0 wc -l | sort -nr
```

结果：

- `MessageList.test.tsx` 从 `9522` 行拆到 `513` 行，新增 `MessageList.testHarness.tsx` `399` 行承载共享 mock / render / helper。
- 新增职责拆分测试文件：`MessageList.historyWindow.test.tsx` `818` 行、`MessageList.importedHistory.test.tsx` `834` 行、`MessageList.runtimeStatus.test.tsx` `754` 行、`MessageList.streamingTurns.test.tsx` `408` 行、`MessageList.imageTasks.test.tsx` `607` 行、`MessageList.mediaTasks.test.tsx` `931` 行、`MessageList.inlineActions.test.tsx` `293` 行、`MessageList.reasoningPersistence.test.tsx` `809` 行、`MessageList.reasoningFlow.test.tsx` `698` 行、`MessageList.webProcess.test.tsx` `393` 行、`MessageList.artifactsTimeline.test.tsx` `695` 行、`MessageList.messageActions.test.tsx` `459` 行、`MessageList.artifactFiltering.test.tsx` `685` 行、`MessageList.failureWebTools.test.tsx` `453` 行。
- MessageList 拆分后所有相关测试文件均低于 `1000` 行；同一组扫描也确认 `InlineToolProcessStep`、`StreamingRenderer`、`MarkdownRenderer` 测试拆分文件仍低于 `1000` 行。
- ESLint：`MessageList*.test.tsx` 与 `MessageList.testHarness.tsx` 通过；拆分期间误触的 `MessageListRuntimeStatus.test.tsx` 已恢复原状并纳入 ESLint 通过。
- MessageList 定向 Vitest：`15 files passed, 152 tests passed`，覆盖布局滚动、旧会话 hydrate、导入历史、运行态、第二轮流式、图片 / 视频 / 音频 / 转写任务卡、内联 action、reasoning 持久化与穿插、WebSearch/WebFetch 过程流、artifact timeline、消息动作与失败回合。
- `git diff --check`：通过。

2026-06-21 本轮追加 `messageListItemProjection` 超限拆分后复测：

```bash
npx eslint "src/components/agent/chat/components/messageListItemProjection*.ts" "src/components/agent/chat/components/messageListProjection*.ts" --max-warnings 0
npx vitest run "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/messageListItemProjection.contentParts.unit.test.ts" "src/components/agent/chat/components/messageListItemProjection.webRetrieval.unit.test.ts" "src/components/agent/chat/components/messageListItemProjection.legacyTools.unit.test.ts" "src/components/agent/chat/components/messageListItemProjection.timelineFlow.unit.test.ts" "src/components/agent/chat/components/messageListItemProjection.artifacts.unit.test.ts" "src/components/agent/chat/components/messageListItemProjection.imported.unit.test.ts" "src/components/agent/chat/components/messageListItemProjection.timeline.unit.test.ts"
npx eslint "src/components/agent/chat/components/MarkdownRenderer*.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.testHarness.tsx" "src/components/agent/chat/components/MessageList*.test.tsx" "src/components/agent/chat/components/MessageList.testHarness.tsx" --max-warnings 0
npx vitest run "src/components/agent/chat/components/MarkdownRenderer.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.codeBlocks.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.media.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.normalization.test.tsx" "src/components/agent/chat/components/MarkdownRenderer.runtime.test.tsx" "src/components/agent/chat/components/MessageList.test.tsx" "src/components/agent/chat/components/MessageList.historyWindow.test.tsx" "src/components/agent/chat/components/MessageList.importedHistory.test.tsx" "src/components/agent/chat/components/MessageList.runtimeStatus.test.tsx" "src/components/agent/chat/components/MessageList.streamingTurns.test.tsx" "src/components/agent/chat/components/MessageList.imageTasks.test.tsx" "src/components/agent/chat/components/MessageList.mediaTasks.test.tsx" "src/components/agent/chat/components/MessageList.inlineActions.test.tsx" "src/components/agent/chat/components/MessageList.reasoningPersistence.test.tsx" "src/components/agent/chat/components/MessageList.reasoningFlow.test.tsx" "src/components/agent/chat/components/MessageList.webProcess.test.tsx" "src/components/agent/chat/components/MessageList.artifactsTimeline.test.tsx" "src/components/agent/chat/components/MessageList.messageActions.test.tsx" "src/components/agent/chat/components/MessageList.artifactFiltering.test.tsx" "src/components/agent/chat/components/MessageList.failureWebTools.test.tsx"
npm run smoke:agent-runtime-current-fixture
npx playwright test --config ".lime/qc/playwright-cli/playwright.config.mjs"
npm run verify:gui-smoke
git diff --check
wc -l "src/components/agent/chat/components/messageListItemProjection"*.ts "src/components/agent/chat/components/messageListProjection"*.ts
```

结果：

- `messageListItemProjection.ts` 从 `1325` 行拆到 `850` 行，新增 `messageListProjectionContentParts.ts` `265` 行与 `messageListProjectionWebRetrieval.ts` `239` 行；主 projection 保留 current 投影决策流，内容片段 / WebSearch-WebFetch 运行态 helper 分离。
- `messageListItemProjection.unit.test.ts` 从 `1938` 行拆到 `121` 行，新增共享 `messageListItemProjection.testHarness.ts` 与 `contentParts / webRetrieval / legacyTools / timelineFlow / artifacts` 专题单测；既有 `imported / timeline` 专题测试也收敛到同一 harness。
- 当前 projection 相关文件均低于 `1000` 行；`messageListItemProjection.webRetrieval.unit.test.ts` 为 `761` 行，属于继续追加前要优先再拆的预警文件。
- Projection ESLint：通过。
- Projection 定向 Vitest：`8 files passed, 36 tests passed`，覆盖搜索 running 不提前显示最终正文、搜索完成后穿插 final answer、running 残留完成态归一、Codex 导入只读工具过程、legacy toolCalls 兜底边界、timeline 审批 / 图片 / 任务板穿插、文件 artifact 去重与失败正文去重。
- MarkdownRenderer + MessageList 合并渲染回归：`20 files passed, 198 tests passed`，覆盖 Markdown 标题 / 表格 / 代码块、导入历史、搜索过程流、思考持久化、运行态完成、artifact timeline、媒体任务与失败 Web tools。
- `npm run smoke:agent-runtime-current-fixture`：通过；继续覆盖 history/cache hydration、`turn.completed` 工具收尾（legacy `final_done` 仅负向 guard）、failed read model、Claw 终态 UI、Electron fixture guard、真实 GUI coding 输入到 Coding Workbench Electron fixture、Claw GUI current fixture guard、停止后同会话继续输出 Electron fixture、Skills Runtime natural + 显式 `$skill` + 技能中心试用入口三入口按需加载 Electron fixture；`liveProviderUsed=false`。
- Playwright CLI：`2 passed`，继续覆盖 Codex 对话 WebSearch/WebFetch 过程流折叠、展开、Markdown 渲染一致，以及 Codex 导入态 Markdown、搜索过程和继续对话。
- `npm run verify:gui-smoke`：通过；Electron renderer build、Electron host typecheck、App Server sidecar 初始化、Claw workbench shell 与 memory settings smoke 均通过。
- `git diff --check`：通过。

2026-06-21 本轮追加 `messageListTimelineContentParts` 测试超限拆分后复测：

```bash
npx eslint "src/components/agent/chat/components/messageListTimelineContentParts*.ts" --max-warnings 0
npx vitest run "src/components/agent/chat/components/messageListTimelineContentParts.unit.test.ts" "src/components/agent/chat/components/messageListTimelineContentParts.imported.unit.test.ts" "src/components/agent/chat/components/messageListTimelineContentParts.reasoning.unit.test.ts"
npx playwright test --config ".lime/qc/playwright-cli/playwright.config.mjs"
find "src/components/agent/chat/components" -maxdepth 1 \( -name "messageListTimelineContentParts*.ts" -o -name "messageListTimelineContentParts*.tsx" \) -print0 | xargs -0 wc -l
```

结果：

- `messageListTimelineContentParts.unit.test.ts` 从 `1014` 行拆到 `211` 行，新增 `messageListTimelineContentParts.testHarness.ts` `15` 行承载 `buildThreadItems` 与共享时间戳。
- 新增专题测试：`messageListTimelineContentParts.imported.unit.test.ts` `380` 行覆盖 Codex 导入 reasoning / plan / command / search / patch / context compaction / subagent 过程；`messageListTimelineContentParts.reasoning.unit.test.ts` `428` 行覆盖已有工具过程中的稀疏 reasoning 合并、WebSearch/WebFetch sequence 插入和 turn_summary 忽略。
- `messageListTimelineContentParts.ts` 仍为 `823` 行，处于预警区但未在本轮追加职责；相关测试与实现文件均低于 `1000` 行。
- ESLint：`messageListTimelineContentParts*.ts` 通过。
- 定向 Vitest：`3 files passed, 15 tests passed`，保留基础 timeline、Codex 导入态、WebSearch/WebFetch 中间 reasoning 穿插全部断言。
- Playwright CLI：`2 passed`，继续覆盖 Codex 对话 WebSearch/WebFetch 过程流折叠、展开、Markdown 渲染一致，以及 Codex 导入态 Markdown、搜索过程和继续对话。

2026-06-21 本轮追加 `agentThreadGrouping` 超限拆分后复测：

```bash
npx eslint "src/components/agent/chat/utils/agentThreadGrouping.ts" "src/components/agent/chat/utils/agentThreadGroupingItemSummary.ts" "src/components/agent/chat/utils/agentThreadGroupingTypes.ts" "src/components/agent/chat/utils/agentThreadGrouping.test.ts" --max-warnings 0
npx vitest run "src/components/agent/chat/utils/agentThreadGrouping.test.ts" "src/components/agent/chat/utils/toolBatchGrouping.test.ts"
npx eslint "src/components/agent/chat/components/AgentThreadTimeline.tsx" "src/components/agent/chat/components/AgentThreadTimelineItemRenderers.tsx" "src/components/agent/chat/components/AgentThreadTimelineViewModel.ts" "src/components/agent/chat/components/AgentThreadTimeline.test.tsx" "src/components/agent/chat/components/AgentThreadTimeline.process.test.tsx" "src/components/agent/chat/components/AgentThreadTimeline.reasoning.test.tsx" "src/components/agent/chat/components/AgentThreadTimelineViewModel.unit.test.ts" --max-warnings 0
npx vitest run "src/components/agent/chat/components/AgentThreadTimeline.test.tsx" "src/components/agent/chat/components/AgentThreadTimeline.process.test.tsx" "src/components/agent/chat/components/AgentThreadTimeline.reasoning.test.tsx" "src/components/agent/chat/components/AgentThreadTimelineViewModel.unit.test.ts"
npx playwright test --config ".lime/qc/playwright-cli/playwright.config.mjs"
wc -l "src/components/agent/chat/utils/agentThreadGrouping.ts" "src/components/agent/chat/utils/agentThreadGroupingItemSummary.ts" "src/components/agent/chat/utils/agentThreadGroupingTypes.ts" "src/components/agent/chat/utils/agentThreadGrouping.test.ts" "src/components/agent/chat/utils/toolBatchGrouping.ts"
```

结果：

- `agentThreadGrouping.ts` 从 `1211` 行拆到 `400` 行，保留 display model 编排、时间排序、状态合并和导入批摘要；新增 `agentThreadGroupingItemSummary.ts` `782` 行承载 item 分类 / preview 摘要 helper，新增 `agentThreadGroupingTypes.ts` `60` 行承载显示模型类型。
- `agentThreadGrouping.test.ts` 当前 `801` 行，`toolBatchGrouping.ts` 当前 `801` 行，均低于 `1000` 行但处于拆分预警区；后续继续追加搜索 / WebFetch / grouping 职责前应优先再拆。
- WebFetch running 摘要断言按现有短来源标签口径更新为 `reuters.com/technology/artificial-intelligen…`，并增加 `not.toContain("https://www.reuters.com/")`，与当前 `hasFullSearchUrlVisible=false` 的产品证据保持一致，避免完整 URL 回流。
- `agentThreadGrouping` / `toolBatchGrouping` 定向 Vitest：`2 files passed, 41 tests passed`，覆盖 Codex 搜索 / 读取网页摘要、导入过程批次和工具过程聚合。
- Timeline 调用方 ESLint 与定向 Vitest：`4 files passed, 45 tests passed`，确认分组 helper 拆分没有破坏 `AgentThreadTimeline` 的 process / reasoning 渲染。
- Playwright CLI：`2 passed`，继续覆盖 Codex WebSearch/WebFetch 折叠、展开、Markdown 渲染，以及 Codex 导入态继续对话。

2026-06-21 本轮追加 `toolProcessSummary` 超限拆分后复测：

```bash
wc -l "src/components/agent/chat/utils/toolProcessSummary.ts" "src/components/agent/chat/utils/toolProcessSummaryBuilders.ts" "src/components/agent/chat/utils/toolProcessGenericSummary.ts" "src/components/agent/chat/utils/toolProcessSummaryCopy.ts" "src/components/agent/chat/utils/toolProcessSummaryText.ts" "src/components/agent/chat/utils/toolProcessSummaryTypes.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts"
npx eslint "src/components/agent/chat/utils/toolProcessSummary.ts" "src/components/agent/chat/utils/toolProcessSummaryBuilders.ts" "src/components/agent/chat/utils/toolProcessGenericSummary.ts" "src/components/agent/chat/utils/toolProcessSummaryCopy.ts" "src/components/agent/chat/utils/toolProcessSummaryText.ts" "src/components/agent/chat/utils/toolProcessSummaryTypes.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" --max-warnings 0
npx vitest run "src/components/agent/chat/utils/toolProcessSummary.test.ts"
npx vitest run "src/components/agent/chat/components/StreamingRenderer.test.tsx" "src/components/agent/chat/components/StreamingRenderer.processGroups.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.imported.test.tsx" "src/components/agent/chat/components/StreamingRenderer.webSearch.details.test.tsx"
npx vitest run "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/ToolCallDisplay.test.tsx" "src/components/agent/chat/components/ToolCallDisplay.siteMedia.test.tsx" "src/components/agent/chat/components/ToolCallDisplay.commandOutput.test.tsx"
npx playwright test --config ".lime/qc/playwright-cli/playwright.config.mjs"
git diff --check -- "src/components/agent/chat/utils/toolProcessSummary.ts" "src/components/agent/chat/utils/toolProcessSummaryBuilders.ts" "src/components/agent/chat/utils/toolProcessGenericSummary.ts" "src/components/agent/chat/utils/toolProcessSummaryCopy.ts" "src/components/agent/chat/utils/toolProcessSummaryText.ts" "src/components/agent/chat/utils/toolProcessSummaryTypes.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "internal/roadmap/turn/test-cases.md"
```

结果：

- `toolProcessSummary.ts` 从 `1738` 行拆到 `292` 行，保留原 facade 导出与过程 narrative 装配；新增 `toolProcessSummaryBuilders.ts` `544` 行承载 ToolSearch / WebSearch / Site / Browser / Lime task 专项摘要 builder。
- 新增 `toolProcessGenericSummary.ts` `677` 行承载通用 pre/post 工具族摘要，新增 `toolProcessSummaryCopy.ts` `52` 行承载共享 copy helper，新增 `toolProcessSummaryText.ts` `319` 行与 `toolProcessSummaryTypes.ts` `24` 行承载文本清洗和类型边界。
- 当前触达实现文件均低于 `1000` 行；`toolProcessSummary.test.ts` 为 `873` 行，低于硬上限但处于拆分预警区，后续继续追加工具摘要断言前应优先按 WebSearch / browser / generic family 再拆。
- 本轮不新增平行渲染器、不改 WebSearch / WebFetch 判断顺序、不新增 compat fallback；事实源仍是 Codex 工具过程摘要 current 前端主链，`toolProcessSummary.ts` 只做 facade，避免 JSON 噪音、搜索摘要和通用工具族逻辑继续塞回单个超限文件。
- ESLint：`toolProcessSummary*.ts`、`toolProcessGenericSummary.ts` 与定向测试文件通过。
- `toolProcessSummary` 定向 Vitest：`1 file passed, 23 tests passed`，覆盖外部信息、结构化数据、WebSearch/WebFetch 失败摘要、工具搜索摘要和通用工具过程文案。
- StreamingRenderer WebSearch / 导入态 / process group 回归：`5 files passed, 44 tests passed`，覆盖 WebSearch/WebFetch 过程流、导入历史和思考 / 工具过程分组。
- InlineToolProcessStep + ToolCallDisplay 回归：`4 files passed, 54 tests passed`，覆盖轻卡摘要本地化、WebSearch 结果、站点媒体和命令输出展示。
- Playwright CLI：`2 passed`，覆盖 Codex 对话 WebSearch/WebFetch 过程流折叠、展开、Markdown 渲染一致，以及 Codex 导入态 Markdown、搜索过程和继续对话。

2026-06-21 本轮追加 `agentChatHistory` 超限拆分后复测：

```bash
wc -l "src/components/agent/chat/hooks/agentChatHistory"*.ts "src/components/agent/chat/hooks/agentChatHistory"*.test.ts
npx eslint "src/components/agent/chat/hooks/agentChatHistory*.ts" --max-warnings 0
npx vitest run src/components/agent/chat/hooks/agentChatHistory.test.ts src/components/agent/chat/hooks/agentChatHistory.imported.test.ts src/components/agent/chat/hooks/agentChatHistory.timeline.test.ts src/components/agent/chat/hooks/agentChatHistory.missingUsers.test.ts src/components/agent/chat/hooks/agentChatHistory.compaction.test.ts src/components/agent/chat/hooks/agentChatHistory.localMerge.test.ts src/components/agent/chat/hooks/agentChatHistory.localTail.test.ts
npx vitest run src/components/agent/chat/components/MessageList.importedHistory.test.tsx src/components/agent/chat/components/StreamingRenderer.importedHistory.test.tsx src/components/agent/chat/components/StreamingRenderer.webSearch.imported.test.tsx src/components/agent/chat/components/messageListItemProjection.imported.unit.test.ts src/components/agent/chat/components/messageListTimelineContentParts.imported.unit.test.ts src/components/agent/chat/components/messageListTimelineContentParts.reasoning.unit.test.ts
npx vitest run src/components/agent/chat/components/StreamingRenderer.test.tsx src/components/agent/chat/components/StreamingRenderer.webSearch.test.tsx src/components/agent/chat/components/StreamingRenderer.webSearch.details.test.tsx src/components/agent/chat/components/StreamingRenderer.thinking.test.tsx src/components/agent/chat/components/InlineToolProcessStep.test.tsx src/components/agent/chat/components/InlineToolProcessStep.web.test.tsx src/components/agent/chat/components/ToolCallDisplay.test.tsx
npm run smoke:agent-runtime-current-fixture
npx playwright test --config ".lime/qc/playwright-cli/playwright.config.mjs"
npm run verify:gui-smoke
git diff --check
```

结果：

- `agentChatHistory.ts` 从 `4224` 行拆到 `23` 行，保留原 API facade；新增 `agentChatHistoryPrimitives / Process / Normalize / Reasoning / ThreadItems / ReadModel / Artifacts / LocalMerge / Hydrate` 等职责模块，current 事实源仍是同一条历史 hydrate / local merge 主链，没有新增平行渲染器或 compat fallback。
- `agentChatHistory.test.ts` 从 `4705` 行拆到 `788` 行，新增 `imported / timeline / missingUsers / compaction / localMerge / localTail` 专题测试；每个测试文件继续只从 `./agentChatHistory` facade 导入，避免绑定内部实现。
- 当前触达的 `agentChatHistory` 实现和测试文件均低于 `1000` 行；`agentChatHistoryLocalMerge.ts` 为 `885` 行，属于预警区，后续继续追加本地合并策略前应优先再按 signature / retainable state / tail recovery 拆分。
- ESLint：`agentChatHistory*.ts` 通过。
- `agentChatHistory` 定向 Vitest：`7 files passed, 61 tests passed`，覆盖累计正文去重、Codex 导入 detail.items / reasoning / tool call、thread_read 工具摘要、失败 read model、历史压缩、图片 / 视频任务预览、token usage、本地消息图片和流式尾部保留。
- Codex 导入 / 搜索渲染回归：`6 files passed, 35 tests passed`，覆盖 MessageList 导入历史、StreamingRenderer 导入态、WebSearch imported 和 timeline reasoning 合并。
- StreamingRenderer / WebSearch / InlineToolProcessStep / ToolCallDisplay 回归：`7 files passed, 88 tests passed`，覆盖 WebSearch/WebFetch 运行中默认展开、搜索 / 思考 / 读取页面时间顺序、工具轻卡摘要与 Markdown 渲染。
- `npm run smoke:agent-runtime-current-fixture`：通过；覆盖 history/cache hydration、`turn.completed` 工具收尾（legacy `final_done` 仅负向 guard）、failed read model、Claw 终态 UI、Electron fixture guard、真实 GUI coding 输入到 Coding Workbench、停止后同会话继续输出、Skills Runtime、MCP structuredContent、Expert Skills Runtime 和 Expert Plaza 技能闭环；`liveProviderUsed=false`。
- Playwright CLI：`2 passed`，继续覆盖 Codex 对话 WebSearch/WebFetch 过程流折叠、展开、Markdown 渲染一致，以及 Codex 导入态 Markdown、搜索过程和继续对话。
- `npm run verify:gui-smoke`：通过；Electron renderer build、Electron host typecheck、App Server sidecar 初始化、Claw workbench shell 与 memory settings smoke 均通过。
- `git diff --check`：通过。
- 全仓 `npx tsc --noEmit --project tsconfig.json --pretty false` 曾运行数分钟无输出，为避免后台进程悬挂已中断；本轮用更贴近风险边界的 ESLint、定向 Vitest、current fixture、Playwright CLI 与 GUI smoke 覆盖交付风险。
