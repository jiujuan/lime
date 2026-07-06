# Clawstream S1 P0 护栏实施计划

> 状态：active
> 创建时间：2026-07-06
> 父计划：`internal/exec-plans/clawstream-codex-derived-guardrail-plan.md`
> 路线图：`internal/roadmap/test/clawstream/README.md`
> 场景账本：`internal/roadmap/test/clawstream/scenario-ledger.md`

## 1. 本阶段目标

S1 只解决 Clawstream P0 护栏，不做大规模重构。目标是把首字慢、reasoning 先出、terminal 收尾、输入恢复这四类高频回归固定成可执行测试批次，为后续删除旧 helper / fallback 提供准入证据。

S1 的实现准则是 Codex-first：stream parser、turn terminal、input restore、running status、projection oracle 和测试命名都默认按 Codex 的 Thread / Turn / Item、app-server、core runtime 和 TUI fixture 方式收敛。opencode 不参与 S1 的架构裁决；只有后续触及多模型 / 多模态 provider capability、media part、模型能力矩阵或 provider lowering 时才进入参考范围。

本阶段完成后，`scenario-ledger.md` 至少要把下列场景推进到 `partial` 或 `partial+guard`：

- `stream-parser-boundary`
- `inputbar-restore-matrix`
- `stale-terminal-does-not-stop-new-turn`
- `running-status-preserved`

已有 `startup-prewarm-first-output`、`reasoning-first-visible`、`terminal-contract-after-answer` 的 projection 层护栏继续保留，不在本阶段回退或改口径。

## 2. Current 事实源

S1 的唯一 current 主链是：

```text
App Server JSON-RPC stream event
  -> appServerEventStream normalized event
  -> agent-runtime-projection item / read model
  -> hook state machine
  -> MessageList / Inputbar DOM
```

分类口径：

| 分类 | 对象 | S1 处理 |
| --- | --- | --- |
| `current` | `turnId / itemId / sequence / phase / sourceType` 驱动的 normalized event、projection、hook 状态机 | 新护栏只落这里 |
| `compat` | 历史无 `itemId / sequence` 的 legacy delta | 只允许 fail-closed，不作为通过证据 |
| `deprecated` | startup note、completion suffix 盲追加、全局 terminal listener、多套 input restore fallback | 护栏齐后删除 |
| `dead` | 自然语言 lifecycle regex、生产 mock fallback、无 turnId terminal fallback | 不再新增引用，后续删除或 retired guard-only |

## 3. 工作包

### W1：`stream-parser-boundary`

Codex 对齐点：

- `assistant_message_stream_parsers_can_be_seeded_from_output_item_added_text`
- `assistant_message_stream_parsers_seed_buffered_prefix_stays_out_of_finish_tail`
- `assistant_message_stream_parsers_seed_plan_parser_across_added_and_delta_boundaries`

优先测试落点：

- `src/lib/api/agentRuntime/appServerEventStream.test.ts`
- `packages/agent-runtime-projection/tests/clawstreamP0.test.mjs`
- `src/components/agent/chat/components/streamingContentPartOrder.unit.test.ts`
- `src/components/agent/chat/components/streamingContentPartSegments.unit.test.ts`

最小场景：

1. `output_item_added` 携带 text seed，后续 `message.delta` 继续同一 item lineage。
2. buffered prefix 不能被 `message.completed` / `turn.completed` 再追加到 final tail。
3. `<proposed_plan>` 跨 added / delta / completed 边界仍 materialize 为 plan item。
4. reasoning.delta 先于 text.delta 时，projection 顺序仍按 `sequence`，不靠正文判断。

退出条件：

- `scenario-ledger.md` 中 `stream-parser-boundary` 从 `missing` 推进到 `partial`。
- parser / projection 测试能证明 completed 事件不合成正文。
- 若发现实现靠字符串特例拼接 tail，先补 guard，再删除对应分支。

### W2：`inputbar-restore-matrix`

Codex 对齐点：

- `output_free_interrupted_turn_requests_prompt_restore`
- `visible_output_prevents_cancelled_turn_prompt_restore`
- `thinking_status_keeps_cancelled_turn_prompt_restore_eligible`
- `patch_activity_prevents_cancelled_turn_prompt_restore`
- `manual_interrupt_restores_pending_steers_to_composer`

优先测试落点：

- `src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts`
- `src/components/agent/chat/hooks/agentStreamFlowControl.ts`
- `src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.test.ts`
- `src/components/agent/chat/components/Inputbar/components/InputbarCore.test.tsx`
- 必要时新增纯 helper unit test，但不把业务矩阵继续塞进重组件挂载测试。

恢复矩阵：

| 场景 | 应恢复输入 | 关键断言 |
| --- | --- | --- |
| output-free interrupt | 是 | prompt、textElements、attachments、skill mentions 不丢 |
| visible output cancel | 否 | 已有可见输出时不把旧 prompt 塞回输入框 |
| thinking-only cancel | 是 | 只有 thinking / reasoning 状态仍可恢复 |
| patch-active cancel | 否 | patch / file change 活动不触发 prompt restore |
| queued steer | 是 | 排队输入按顺序保留，不降级成普通字符串 |
| manual interrupt | 是 | 手动中断恢复 pending steer 和当前草稿 |

退出条件：

- `scenario-ledger.md` 中 `inputbar-restore-matrix` 从 `missing` 推进到 `partial+guard`。
- 恢复判断有单一 pure owner；组件只验证接线。
- Electron current fixture 与 pending steer rich restore 全量证据补齐后，才可以删除“只看 running flag”的 restore fallback。

### W3：`stale-terminal-does-not-stop-new-turn`

Codex 对齐点：

- `stale_defer_mailbox_delivery_does_not_override_steered_input`
- `tool_calls_reopen_mailbox_delivery_for_current_turn`
- `app_server_mcp_startup_next_round_discards_stale_terminal_updates`

优先测试落点：

- `src/components/agent/chat/hooks/agentStreamTerminalTurnGuard.ts`
- `src/components/agent/chat/hooks/agentStreamCompletionController.test.ts`
- `src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`
- 必要时补 `useAgentRuntimeSyncEffects.test.tsx`，但只覆盖 hook 接线。

最小场景：

1. 旧 turn 的 `turn.completed` 不能把新 active stream 的 `isSending` 收回 `false`。
2. terminal 缺 `turnId` 时 fail closed，不清当前 active stream。
3. 当前 turn 的 terminal 仍能清 running status，并触发 read model terminal reconcile。
4. terminal 只更新 runtime status，不合成 assistant 正文。

退出条件：

- `scenario-ledger.md` 中 `stale-terminal-does-not-stop-new-turn` 从 `missing` 推进到 `partial`。
- 无 turnId terminal fallback 进入 `dead` 删除候选。
- `cancel-then-continue` 的 existing Electron fixture 后续只作为 GUI evidence，不替代本 oracle。

### W4：`running-status-preserved`

Codex 对齐点：

- `streaming_final_answer_keeps_task_running_state`
- `final_answer_completion_restores_status_indicator_for_pending_steer`
- `commentary_completion_restores_status_indicator_before_exec_begin`

优先测试落点：

- `src/components/agent/chat/components/MessageList.runtimeStatus.test.tsx`
- `src/components/agent/chat/components/MessageList.streamingTurns.test.tsx`
- `src/components/agent/chat/components/streamingProjectionGuard.unit.test.ts`

最小场景：

1. assistant 正文已经可见时，仍保留“正在输出 / 正在生成回复”的运行态。
2. terminal 到达后只清运行态，不删除已显示 answer / reasoning / tool parts。
3. 禁止重新引入“启动处理流程 / 已接收请求”启动说明闪现。

退出条件：

- `scenario-ledger.md` 中 `running-status-preserved` 从 `partial` 推进到 `partial+guard`。
- “有正文就完成”的 UI 判断进入 `dead` 删除候选。

## 4. 执行顺序

1. 先补 W1 parser/projection 失败用例，确认首字和 reasoning 顺序不依赖 startup note。
2. 再补 W3 terminal turn guard，避免继续用 timeout / grace timer 掩盖 active stream 泄漏。
3. 再补 W2 inputbar restore pure matrix，收敛多套恢复判断。
4. 最后补 W4 DOM guard，证明输出中状态可见且启动说明不回流。
5. 每完成一个工作包，都回写 `scenario-ledger.md` 和父计划当前进度。

## 5. 窄写集

允许写入：

- `internal/roadmap/test/clawstream/**`
- `internal/exec-plans/clawstream-codex-derived-guardrail-plan.md`
- `internal/exec-plans/clawstream-s1-p0-implementation-plan.md`
- `packages/agent-runtime-projection/tests/clawstreamP0.test.mjs`
- `src/lib/api/agentRuntime/appServerEventStream.test.ts`
- `src/components/agent/chat/hooks/agentStreamTerminalTurnGuard.ts`
- `src/components/agent/chat/hooks/agentStreamCompletionController.test.ts`
- `src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts`
- `src/components/agent/chat/hooks/agentStreamFlowControl.ts`
- `src/components/agent/chat/hooks/agentStreamFlowControl.test.ts`
- `src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts`
- `src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.test.ts`
- `src/components/agent/chat/components/Inputbar/hooks/useInputbarSend.ts`
- `src/components/agent/chat/components/Inputbar/hooks/useInputbarSend.test.tsx`
- `src/components/agent/chat/components/Inputbar/hooks/useInputbarController.ts`
- `src/components/agent/chat/components/Inputbar/index.tsx`
- `src/components/agent/chat/components/Inputbar/index.test.tsx`
- `src/components/agent/chat/components/MessageList.runtimeStatus.test.tsx`
- `src/components/agent/chat/components/MessageList.streamingTurns.test.tsx`
- `src/components/agent/chat/components/streamingProjectionGuard.unit.test.ts`
- `src/components/agent/chat/components/streamingContentPartOrder.unit.test.ts`
- `src/components/agent/chat/components/streamingContentPartSegments.unit.test.ts`

W4 验证若暴露聚合 current fixture 的 MCP structuredContent 回归，允许额外写入下列 current 主链 guard，不得扩成 MCP 旁路重构：

- `src/lib/api/agentProtocol.ts`
- `src/components/agent/chat/hooks/agentStreamTimelineItemProjector.ts`
- `src/components/agent/chat/hooks/agentStreamToolItemMessageSync.ts`
- `src/components/agent/chat/hooks/agentStreamToolItemMessageSync.unit.test.ts`
- `src/components/agent/chat/hooks/agentStreamThreadItemController.test.ts`
- `src/components/agent/chat/components/timeline-utils/itemConverters.ts`
- `src/components/agent/chat/components/timeline-utils/itemConverters.unit.test.ts`
- `src/components/agent/chat/components/ToolCallDisplay.test.tsx`
- `src/components/agent/chat/utils/toolResultDetailText.ts`

聚合 current fixture 若暴露 Electron fixture guard 自身误判，例如把空会话壳当成目标 session、没有校验 inputbar `data-session-id`，允许修 `scripts/agent-runtime/claw-chat-current-fixture-*.mjs` 与对应 guard test；这类改动只服务 current Electron evidence，不得新增 renderer mock、App Server mock backend 或 legacy runtime command。

禁止在 S1 中顺手修改：

- Rust App Server / RuntimeCore 主实现，除非新增测试证明前端事件无法表达 current 合同。
- `scripts/` 根目录或新的一级脚本目录。
- live Provider smoke、真实 API、生产 mock fallback。
- 与 P0 无关的 MCP、Skills、Multi-Agent、artifact 大面清理。

## 6. 验证命令

每个工作包先跑最小定向：

```bash
npm --prefix "packages/agent-runtime-projection" test
npx vitest run "src/components/agent/chat/components/streamingProjectionGuard.unit.test.ts"
npx vitest run "src/components/agent/chat/hooks/agentStreamFlowControl.test.ts" "src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts"
npx vitest run "src/components/agent/chat/hooks/agentStreamFlowControl.test.ts" "src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts" "src/components/agent/chat/hooks/agentStreamSubmissionLifecycle.test.ts" "src/components/agent/chat/components/Inputbar/hooks/useInputbarSend.test.tsx" "src/components/agent/chat/components/Inputbar/index.test.tsx"
npx vitest run "src/components/agent/chat/hooks/agentStreamCompletionController.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.test.ts"
npx vitest run "src/components/agent/chat/components/MessageList.runtimeStatus.test.tsx" "src/components/agent/chat/components/MessageList.streamingTurns.test.tsx"
```

S1 全部通过后再跑：

```bash
npm run smoke:agent-runtime-current-fixture
```

如果本轮只改计划文件，最低验证只需要：

```bash
git diff --check -- ".gitignore" "internal/roadmap/test/clawstream/README.md" "internal/exec-plans/clawstream-codex-derived-guardrail-plan.md" "internal/exec-plans/clawstream-s1-p0-implementation-plan.md"
rg -n "[ \t]+$" ".gitignore" "internal/roadmap/test/clawstream/README.md" "internal/exec-plans/clawstream-codex-derived-guardrail-plan.md" "internal/exec-plans/clawstream-s1-p0-implementation-plan.md"
```

## 7. 删除准入

| 删除对象 | 准入 |
| --- | --- |
| startup note / 启动说明闪现 | W1 + W4 通过，guard 禁止启动说明文案回流 |
| completion suffix 盲追加 | W1 通过，completed 不合成正文 |
| 无 turnId terminal fallback | W3 通过，旧 terminal 不误停新 active stream |
| 多套 input restore fallback | W2 pure + component guard + Electron current fixture 均通过，恢复矩阵有单一 owner |
| “有正文就完成”的 UI 判断 | W4 通过，running status 与 visible answer 分离 |

删除时必须同时回写 `scenario-ledger.md` 的清理目标状态；没有账本行的旧实现先登记，不在 S1 顺手删除。

## 8. 进度日志

### 2026-07-06

- W2 `inputbar-restore-matrix` 第一段落地：新增 `resolveInterruptedInputRestorePlan` 作为 pure owner，按 assistant visible text、thinking-only、tool/action/artifact/file change side-effect 与 queued turn snapshot 判定 composer 是否可恢复。
- `agentStreamInputRestorePolicy.unit.test.ts` 覆盖 output-free、visible-output、thinking-only、patch-active、queued steer/manual interrupt 矩阵；`agentStreamFlowControl.test.ts` 更新 stop 断言，手动停止不再本地抢先清空 queued turns，等待 App Server read model 刷新裁决。
- 定向验证通过：`npx vitest run "src/components/agent/chat/hooks/agentStreamFlowControl.test.ts" "src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts"`。
- 聚合 current fixture 验证通过：`npm run smoke:agent-runtime-current-fixture` 覆盖 history/cache hydration、流式完成与运行态收尾、Claw 终态 UI、Electron fixture guard、代码工作台、图片命令、普通画图意图、`cancel-then-continue`、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills / Plaza / Panel、Content Factory Article Editor；`liveProviderUsed=false`。
- `scenario-ledger.md` 中 `inputbar-restore-matrix` 先从 `missing` 推进到 `partial`；此时只证明 pure policy 与 stop 行为，仍不能删除 input restore 旧实现。
- W2 rich restore 接线落地：`submittedDraft` 随 active stream 保存，`stopActiveAgentStream` 在 output-free / thinking-only 中断时触发 `onRestoreInterruptedInput`；`Inputbar` 接收 restore request 后恢复 text、images、pathReferences 与 installed skill route，纯空白输入不写回 draft。
- 定向验证通过：`npx vitest run "src/components/agent/chat/hooks/agentStreamFlowControl.test.ts" "src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts" "src/components/agent/chat/hooks/agentStreamSubmissionLifecycle.test.ts" "src/components/agent/chat/components/Inputbar/hooks/useInputbarSend.test.tsx" "src/components/agent/chat/components/Inputbar/index.test.tsx"`（109 tests passed）。
- `scenario-ledger.md` 中 `inputbar-restore-matrix` 推进到 `partial+guard`；仍缺 Electron current fixture 与 pending steer rich restore 全量证据，不能据此删除全部 input restore 旧实现。
- 聚合 current fixture 暴露并修复 Expert Panel Electron guard 缺口：`openSessionFromSidebar` 现在要求目标 session inputbar 的 `data-session-id` 匹配，Expert Panel follow-up 在当前专家页已有可用输入框时不再误重开到空会话壳；这只修 current fixture evidence 判定，不新增生产路径。
- 验证通过：`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`；`npm run smoke:claw-chat-current-fixture -- --scenario expert-panel-skills-runtime --timeout-ms 180000`；`npm run smoke:agent-runtime-current-fixture` 完整覆盖 history/cache hydration、流式完成与运行态收尾、Coding Workbench、图片命令、普通画图意图、`cancel-then-continue`、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills / Plaza / Panel、Content Factory Article Editor，`liveProviderUsed=false`。

### 2026-07-06

- W3 `stale-terminal-does-not-stop-new-turn` 第一段落地：`agentStreamTerminalTurnGuard.ts` 对缺失 `terminalTurnId` 改为 fail closed；有 active/current turn 时 queued ID 不再兜底放行旧 terminal；只有 queued 线索时 terminal 必须命中 queued ID。
- `agentStreamTerminalTurnGuard.unit.test.ts` 新增无 turnId、queued 命中 / 不命中、current + queued 旧终态拒绝用例；`agentStreamRuntimeHandler.unit.test.ts` 的 terminal 夹具补齐 current turn lineage，保留 queued ID 只作为队列清理 ID。
- 定向验证通过：`npx vitest run "src/components/agent/chat/hooks/agentStreamTerminalTurnGuard.unit.test.ts"`；`npx vitest run "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts"`。
- 聚合 current fixture 追加验证：`npm run smoke:agent-runtime-current-fixture` 已通过历史 / 缓存终态恢复、流式完成与运行态收尾、Electron/App Server fixture guard、代码工作台、Claw 图片命令、普通画图意图、`cancel-then-continue`、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills / Plaza / Panel 等前置场景；完整聚合在后续 Content Factory article workspace 场景失败，失败点为 `workspaceRightSurface/pending/list` 经 `app_server_handle_json_lines` 多次 5000ms timeout 触发 `noInvokeErrors`，记录为 Right Surface / Content Factory 独立缺口，不作为 W3 terminal guard 回退证据。
- `scenario-ledger.md` 中 `stale-terminal-does-not-stop-new-turn` 从 `missing` 推进到 `partial`；仍缺 Electron current fixture 证据，不能据此删除全部 terminal 旧实现。

### 2026-07-06

- W1 `stream-parser-boundary` 先收掉 message seed/delta/completed full text 重复尾巴风险：`packages/agent-runtime-projection/tests/clawstreamP0.test.mjs` 新增 projection oracle，`packages/agent-runtime-projection/src/uiState.ts` 将 `model.completed` 纳入同一 message scope 合并。
- W1 `plan-parser-boundary` projection oracle 落地：`packages/agent-runtime-projection/src/uiState.ts` 将结构化 `plan.delta/final` 投影为 `plan` part，并把完整 `<proposed_plan>...</proposed_plan>` 从 assistant text 中 materialize 为独立 plan part；跨 message added / delta / completed 边界时 completed full text 仍替换同一 item，不再生成重复尾巴。
- `scenario-ledger.md` 中 `stream-parser-boundary` 与 `plan-parser-boundary` 推进到 `partial+guard`；仍缺 Plan rail / decision drawer / history hydrate DOM 与 Electron evidence，不能据此删除全部 parser 旧实现或 legacy `update_plan` UI owner。
- 定向验证通过：`npm --prefix "packages/agent-runtime-projection" test`（94 tests passed）。

### 2026-07-06

- W4 `running-status-preserved` 落到 projection / DOM guard：`messageListItemProjection.unit.test.ts` 覆盖首字前启动态不投影正文、首字后正文仍保持 current streaming、completed/stale runtimeStatus 不删除 reasoning/tool/text；既有 `MessageList.runtimeStatus.test.tsx` / `MessageList.streamingTurns.test.tsx` 继续覆盖 inline running indicator 与 completed 后不残留 running。
- 触发并修复 MCP structuredContent current fixture 缺口：stream `tool_end`、thread item -> `ToolCallState`、message toolCall sync 现在保留 `structuredContent / structured_content`，`ToolCallDisplay` 展示 structured answer + reference id，transport envelope 仍隐藏。
- 新增 / 更新护栏：`agentStreamThreadItemController.test.ts`、`agentStreamToolItemMessageSync.unit.test.ts`、`components/timeline-utils/itemConverters.unit.test.ts`、`ToolCallDisplay.test.tsx`。
- 定向验证通过：`npx vitest run "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/MessageList.runtimeStatus.test.tsx" "src/components/agent/chat/components/MessageList.streamingTurns.test.tsx" "src/components/agent/chat/hooks/agentStreamThreadItemController.test.ts" "src/components/agent/chat/hooks/agentStreamToolItemMessageSync.unit.test.ts" "src/components/agent/chat/components/timeline-utils/itemConverters.unit.test.ts" "src/components/agent/chat/components/ToolCallDisplay.test.tsx"`。
- Electron current fixture 验证通过：`npm run build:renderer:electron`；`npm run smoke:claw-chat-current-fixture -- --scenario mcp-structured-content --timeout-ms 180000`；`npm run smoke:agent-runtime-current-fixture`，完整覆盖 history/cache hydration、流式完成与运行态收尾、Claw 终态 UI、Electron fixture guard、代码工作台、图片命令、普通画图意图、`cancel-then-continue`、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills / Plaza / Panel、Content Factory Article Editor，`liveProviderUsed=false`。
- `scenario-ledger.md` 中 `running-status-preserved` 从 `partial` 推进到 `partial+guard`；`mcp-structured-content` 保持 `covered-electron`，但补齐 current item / converter / display 层 guard，后续 S2 继续补 truncation / resource / elicitation 等 MCP 扩展场景。
- 代码体量登记：`src/lib/api/agentProtocol.ts` 已有 `2357` 行，本轮只做 `AgentThreadToolCallItem` 结构化结果字段的协议类型补齐，没有追加业务逻辑。风险是协议类型继续集中膨胀；退出条件是在 S5 或后续协议分层任务中把 Thread / Turn / Tool item types 拆出独立 domain module，并让 `agentProtocol.ts` 只保留聚合导出 / transport normalize。

### 2026-07-06

- 新增本 S1 P0 细化计划，把父计划中的下一刀拆成 W1 / W2 / W3 / W4。
- 本次只改计划和索引，不触碰实现，不删除旧代码。
