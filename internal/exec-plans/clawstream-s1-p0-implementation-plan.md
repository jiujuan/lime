# Clawstream S1 P0 护栏实施计划

> 状态：active
> 创建时间：2026-07-06
> 父计划：`internal/exec-plans/clawstream-codex-derived-guardrail-plan.md`
> 路线图：`internal/roadmap/test/clawstream/README.md`
> 场景账本：`internal/roadmap/test/clawstream/scenario-ledger.md`
> 场景骨架：`internal/roadmap/test/clawstream/scenario-registry.json`

## 1. 本阶段目标

S1 只解决 Clawstream P0 护栏，不做大规模重构。目标是把首字慢、reasoning 先出、terminal 收尾、输入恢复这四类高频回归固定成可执行测试批次，为后续删除旧 helper / fallback 提供准入证据。

S1 的实现准则是 Codex-first：stream parser、turn terminal、input restore、running status、projection oracle 和测试命名都默认按 Codex 的 Thread / Turn / Item、app-server、core runtime 和 TUI fixture 方式收敛。opencode 不参与 S1 的架构裁决；只有后续触及多模型 / 多模态 provider capability、media part、模型能力矩阵或 provider lowering 时才进入参考范围。

推进策略先骨架、后细节：全量 P0/P1/P2 场景先在 `scenario-registry.json` 固定 id、execution batch、`evidenceGate`、`detailOrder`、优先级、状态、目标证据层和验证命令；S1 的细节实现只在 P0 当前链路内推进，并优先按 `skeleton-p0-stream-and-input.detailOrder` 补齐。后续每补一个细节，都必须同时更新 registry 状态和 ledger evidence，避免单测、fixture、文档三套说法分叉。

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

| 分类         | 对象                                                                                               | S1 处理                                     |
| ------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `current`    | `turnId / itemId / sequence / phase / sourceType` 驱动的 normalized event、projection、hook 状态机 | 新护栏只落这里                              |
| `compat`     | 历史无 `itemId / sequence` 的 legacy delta                                                         | 只允许 fail-closed，不作为通过证据          |
| `deprecated` | startup note、completion suffix 盲追加、全局 terminal listener、多套 input restore fallback        | 护栏齐后删除                                |
| `dead`       | 自然语言 lifecycle regex、生产 mock fallback、无 turnId terminal fallback                          | 不再新增引用，后续删除或 retired guard-only |

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
- `src/lib/api/queuedTurn.test.ts`
- `src/components/agent/chat/components/Inputbar/components/InputbarCore.test.tsx`
- `lime-rs/crates/app-server/src/runtime/tests/queue.rs::read_session_projects_queued_turn_input_snapshot`
- 必要时新增纯 helper unit test，但不把业务矩阵继续塞进重组件挂载测试。

恢复矩阵：

| 场景                  | 应恢复输入 | 关键断言                                               |
| --------------------- | ---------- | ------------------------------------------------------ |
| output-free interrupt | 是         | prompt、textElements、attachments、skill mentions 不丢 |
| visible output cancel | 否         | 已有可见输出时不把旧 prompt 塞回输入框                 |
| thinking-only cancel  | 是         | 只有 thinking / reasoning 状态仍可恢复                 |
| patch-active cancel   | 否         | patch / file change 活动不触发 prompt restore          |
| queued steer          | 是         | 排队输入按顺序保留，不降级成普通字符串                 |
| manual interrupt      | 是         | 手动中断恢复 pending steer 和当前草稿                  |

退出条件：

- `scenario-ledger.md` 中 `inputbar-restore-matrix` 从 `missing` 推进到 `partial+guard`。
- 恢复判断有单一 pure owner；组件只验证接线。
- rich restore Electron current fixture 已满足；pending steer rich snapshot 已有 App Server read model + frontend normalizer guard；frontend normalizer 已按 explicit `position` 恢复多 queued turn 顺序，同 position 或 legacy 缺 position 时保持输入稳定顺序；App Server oracle 已证明多 queued read model 顺序、pop-front resume 后剩余 queued reindex 为 `position=0`，且 top-level `queued_turns` 与 `thread_read.queued_turns` hydrate 同构；pending steer rich restore 已有 devserver 与 packaged Electron Gate B 证据；Electron 多 pending steer FIFO 骨架已证明 rich queued turn 与第二个 plain queued turn 按 `position=0/1` 进入 read model；packaged Electron pop-front resume / restore hydrate 已证明 GUI queued panel promote 后 current cancel/resume、rich backend turnStart、second queue `position=0` hydrate 与 active/rich 输出可见；product-current Gate B 已证明 GUI queued panel 的“立即执行”一键串联 `agentSession/queuedTurn/promote -> agentSession/turn/cancel -> agentSession/thread/resume`；`inputbar-pending-steer` fixture 已拆成 scenario facade、GUI action helper 与 read-model helper。`EmptyStateComposerPanel` 的 text-only restore fallback 已删除并加 source guard，首页恢复只由父 `EmptyState` current owner 恢复 text / image / path / skill route；`AgentChatWorkspace` 父级 text/path-only 预恢复 fallback 已删除并加 source guard，父层只转发 restore request；`agentStreamFlowControl` 已删除 `getSessionReadModel` optional runtime fallback，停止恢复 queued draft 时必须走 current read model refresh；stop restore queued draft 后不再通过 `setQueuedTurns/removeQueuedTurnFromState` 本地裁剪队列；explicit remove/promote queued turn 成功路径不再绕过 refresh 手动裁剪本地队列；submit failure、missing-final failure、turn completed / failed / canceled terminal 分支不再本地 `removeQueuedTurnState`；`queue_removed / queue_started / queue_cleared` current event projection 只过滤 queued id，不再前端重排 `position`；`agentStreamSubmissionLifecycle` 与 `agentStreamResumeBinding` 的 queued turn upsert/remove 已收敛到 `agentQueuedTurnProjection` current helper，两个 Hook 不再内联 sort/remove 规则；旧 `removeQueuedTurnState` 本地状态命名已改成 `removeQueuedTurnsFromProjection` 并加 production hook 目录级回流守卫，queued turn 删除和 reindex 最终由 read model 回填。

当前细节缺口优先级：

1. `startup-prewarm-first-output` / `reasoning-first-visible` / `running-status-preserved` 的首字、reasoning、输出中状态证据继续前置，避免又把“启动说明闪现”当作首字占位。
2. `pending-steer-queue` 剩余旧 fallback inventory 与删除准入；fixture 拆分、GUI 一键 promote/cancel/resume 产品串联、submit/terminal 本地队列删除收口、queue event 本地 position 重排删除、重复 queued turn projection helper 收敛、旧本地队列删除命名改成 projection 语义名均已完成。
3. 继续扩大 input restore 回流守卫：`EmptyStateComposerPanel` text-only fallback、`AgentChatWorkspace` 父级 text/path-only 预恢复 fallback、stop restore 的 `getSessionReadModel` optional runtime fallback、stop restore queued draft 本地队列裁剪、explicit remove/promote 本地队列裁剪、submit/terminal 本地队列删除、queue event 本地 position 重排、Hook 内联 queued turn sort/remove 规则、旧 `removeQueuedTurnState` 命名回流、非 `EmptyState` / `Inputbar` 的 UI 恢复 owner 回流、非 read model / queue projection 的 `setQueuedTurns` 写入回流已封住，下一步继续查 queue / steer / draft helper 是否还有非 UI 层绕过 current read model / event projection 的 owner。

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

- `scenario-ledger.md` 中 `stale-terminal-does-not-stop-new-turn` 从 `missing` 推进到 `partial+guard`。
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

- `scenario-ledger.md` 中 `running-status-preserved` 先从 `partial` 推进到 `partial+guard`；补上 Electron current `cancel` 证据后推进到 `covered-electron`。
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
- `src/components/agent/chat/hooks/agentStreamFlowControl.currentGuard.test.ts`
- `src/components/agent/chat/hooks/agentStreamFlowControl.test.ts`
- `src/components/agent/chat/hooks/agentStreamInputRestorePlan.ts`
- `src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts`
- `src/components/agent/chat/hooks/agentStreamReadModelParsing.ts`
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
npx vitest run "internal/roadmap/test/clawstream/scenario-registry.test.mjs"
git diff --check -- ".gitignore" "internal/roadmap/test/clawstream/README.md" "internal/exec-plans/clawstream-codex-derived-guardrail-plan.md" "internal/exec-plans/clawstream-s1-p0-implementation-plan.md"
rg -n "[ \t]+$" ".gitignore" "internal/roadmap/test/clawstream/README.md" "internal/exec-plans/clawstream-codex-derived-guardrail-plan.md" "internal/exec-plans/clawstream-s1-p0-implementation-plan.md"
```

## 7. 删除准入

| 删除对象                    | 准入                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| startup note / 启动说明闪现 | W1 + W4 通过，guard 禁止启动说明文案回流                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| completion suffix 盲追加    | W1 通过，completed 不合成正文                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 无 turnId terminal fallback | W3 通过，旧 terminal 不误停新 active stream                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 多套 input restore fallback | W2 pure + component guard + rich restore Electron current fixture + pending steer rich restore / multi queue / product-current promote-cancel-resume 证据均通过，恢复矩阵有单一 owner；`EmptyStateComposerPanel` 与 `AgentChatWorkspace` text/path-only fallback 已删并封守卫；stop restore 的 `getSessionReadModel` optional runtime fallback 已删并封 source guard；stop restore queued draft、explicit remove/promote queued turn 成功路径、submit failure 与 terminal completion/failure/cancel 分支都不再手动裁剪本地队列；queue event 本地 projection 只删除 id、不重排 position，重复 queued turn upsert/remove helper 已收敛为 `agentQueuedTurnProjection` current owner，队列状态回到 current event projection + read model refresh；剩余删除前先完成 queue / steer / draft 并行状态 inventory 与回流守卫 |
| “有正文就完成”的 UI 判断    | W4 通过，running status 与 visible answer 分离                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

删除时必须同时回写 `scenario-ledger.md` 的清理目标状态；没有账本行的旧实现先登记，不在 S1 顺手删除。

## 8. 进度日志

### 2026-07-08

- W2 Expert Panel follow-up provider/model 回流修复：`expert-panel-skills-runtime` 暴露新 session 创建成功后只建立 session id，未同步当前 workspace provider/model refs，导致专家页 follow-up turn 回落到全局默认 `lime-hub/gpt-5.2-pro`。`createFreshSession` 现在优先读取当前 workspace agent preferences，并仅在 provider/model 均非空时把新 session preference 标记为 synced，避免空偏好污染 workspace。验证通过：`node "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs" --scenario expert-panel-skills-runtime --prefix claw-chat-current-fixture-expert-panel-skills-runtime-regression --timeout-ms 180000`；`npm run smoke:agent-runtime-current-fixture` 完整通过，覆盖 history/cache hydration、流式完成、Coding Workbench、图片命令、普通画图、`cancel-then-continue`、Inputbar rich restore、pending steer、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、media reference、Expert Skills / Plaza / Panel、Content Factory Article Editor，`liveProviderUsed=false`。该证据只恢复 W2/current fixture gate，`inputbar-restore-matrix` / `pending-steer-queue` 仍保持 `partial+guard`。
- W2 Expert Panel 定向验证通过：`npx vitest run "src/components/agent/chat/hooks/useAgentContext.test.tsx" "src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.test.ts" "src/components/agent/chat/hooks/agentStreamPreparedSendEnv.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`（31 tests passed）；`prettier --check` 与 `git diff --check -- "src/components/agent/chat/hooks/useAgentSession.ts"` 通过。`useAgentChat.test.tsx` 仍有兼容接口夹具未触发 `mockSubmitAgentRuntimeTurn` 的既有失败，本轮不把该 legacy/compat 测试当作 current fixture gate。
- W3 legacy terminal 注入 owner 补强：`appServerEventStream.test.ts` 新增直接 normalizer 负向矩阵，证明 `done / final_done / cancelled / turn.done / turn.final_done / turn.cancelled` 在 App Server 原始事件边界直接 fail closed 为 `null`，不会投影成 `turn_completed / turn_failed / turn_canceled` runtime payload。`agentTaskRuntime.test.ts` 中旧 `final_done` 测试名改为 current 语义，避免把 legacy terminal 当完成态锚点。
- W3 current smoke 迁出 legacy terminal：`smoke:code-artifact-workbench-electron-fixture` 和 `smoke:app-server-external-backend` 的 external fixture backend 现在只发 / 等待 / 导出 current `turn.completed`，不再发 `turn.final_done`；`claw-chat-live-web-tool-evidence` 的 live terminal detector 也只认 `turn.completed`。`scripts/check-app-server-client-contract.mjs` 加守卫禁止这两条 current smoke 重新出现 `turn.final_done`，`internal/aiprompts/quality-workflow.md` 与 `scripts/README.md` 同步改口径。验证通过：`npx vitest run "scripts/electron/code-artifact-workbench-fixture-smoke.test.mjs" "scripts/agent-runtime/current-fixture-regression-smoke.test.mjs" "src/lib/api/agentRuntime/appServerEventStream.test.ts" "src/lib/api/agentRuntime/threadClient.test.ts" "src/components/agent/chat/hooks/agentStreamTerminalTurnGuard.unit.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/utils/agentTaskRuntime.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`（142 tests passed）；`npm run test:contracts`；`npm run smoke:app-server-external-backend`，events=`message.created,turn.accepted,message.delta,artifact.snapshot,turn.completed`。
- W3 GUI 侧代码产物 current terminal 证据补齐：`smoke:code-artifact-workbench-electron-fixture -- --scenario gui-coding-input --prefix code-artifact-workbench-gui-coding-input-turn-completed-w3-ledger --timeout-ms 240000` 通过，session=`code-artifact-workbench-electron-1783483318382-31214`。fixture backend ledger 现在记录 emitted event types，两轮 turn 均以 `turn.completed` 收尾；summary `backendEmittedCurrentTerminal=true`、`backendDidNotEmitLegacyTerminal=true`、`appServerJsonRpcUsed=true`、`externalFixtureBackendUsed=true`、`liveProviderNotUsed=true`、`noInvokeErrors=true`、`workbenchOpened=true`、`guiToolTimelineEvidencePresent=true`。证据文件：`.lime/qc/gui-evidence/code-artifact-workbench-electron-fixture/code-artifact-workbench-gui-coding-input-turn-completed-w3-ledger-summary.json` 与 `...-backend-ledger.json`。
- W3 terminal legacy surface 第一刀收口：`agentStreamCompletionController` 中旧 `FinalDone` 完成计划命名已改为 `TerminalCompletion`，`turn_completed` 分支现在调用 `buildAgentStreamTerminalCompletionPlan`，避免后续把 legacy `final_done` 当成 current 成功终态事实源；running tool call 收尾 helper 也同步改为 terminal completion 语义。
- W3 current fixture terminal 汇总收口：`claw-chat-current-fixture-rpc.mjs` 的 `summarizeAgentSessionEvents(...).hasTerminal` 只认 current `turn.completed / turn.failed / turn.canceled`，不再把 legacy `turn.done / turn.final_done / turn.cancelled` 算作 current terminal；聚合 smoke 过滤和总结文案从 `final_done 工具收尾` 改为 `turn_completed 工具收尾`。`src/lib/api/agentRuntime/appServerEventPayloadUtils.ts` 仍保留 legacy detector，但它只让 `turn.final_done` fail closed 返回 null，并由 `threadClient.test.ts` / projection 负向测试证明不关闭 current 路由、不投递 GUI。
- W3 聚合 current fixture 复跑通过：`npm run smoke:agent-runtime-current-fixture` 在 current terminal 迁移后完整通过，覆盖 history/cache hydration、`turn_completed` 工具收尾、Electron/App Server fixture guard、Coding Workbench、图片命令、普通画图意图、`cancel-then-continue`、Inputbar rich restore、pending steer rich / multi queue / pop-front resume、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、media reference、Expert Skills / Plaza / Panel、Content Factory Article Editor，`liveProviderUsed=false`。此前 packaged fixture build 的 Electron Host typecheck 被测试 helper `setTurnStartRequestMode` union 缺少 `"hang-request"` 阻塞，已在 `electron/appServerHost.test.ts` 补齐；验证通过 `npm run typecheck:electron` 与 `npx vitest run "electron/appServerHost.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`。该修复只恢复 current fixture gate，不新增生产协议面。
- W3 Rust workflow 正向旧终态收口：`lime-rs/crates/agent/src/skill_execution.rs` 的 workflow 成功 / 失败 completion 不再发 `RuntimeAgentEvent::FinalDone`，改发 `RuntimeAgentEvent::RuntimeStatus`，由 App Server raw event 映射为非终态 `runtime.status`；真正 turn terminal 继续由 App Server current 回合边界发 `turn.completed / turn.failed / turn.canceled`。验证通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_execution --lib -j 2`（9 passed）与 `cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_status_raw_runtime_event_maps_to_non_terminal_status_event --lib -j 2`（1 passed）。
- W3 Rust `FinalDone` 输入面删除：`lime-rs/crates/agent/src/protocol.rs` 与 `lime-rs/crates/core/src/agent/types.rs` 的 `FinalDone` 枚举已删除，`lime-rs/crates/agent/src/direct_text_generation.rs` 不再读取旧 `FinalDone` usage，App Server 测试 backend 命名已迁到 current `TurnCompleted*`。这些 surface 现分类为 `dead / deleted`；负向 schema / test-only guard 继续保留，证明旧终态不关闭 current 路由。下一刀继续清 frontend/packages/scripts 的 legacy detector、live runner timeout grace 和非 Rust residual。
- W3 文档回流源收口：`internal/roadmap/appserver/frontend-integration-matrix.md`、`internal/roadmap/agentworkbench/v2.md` 与旧 AgentUI roadmap 已同步 current terminal 口径，不再把 `turn.final_done / final_done` 描述成 current / 合法兼容流；legacy 终态只允许 fail closed 和负向 guard。
- W3 package-side legacy terminal owner 收口：`@limecloud/agent-ui-contracts` 现在由 `runtimeTerminal.ts` 单一导出 legacy terminal 常量与判定 helper，schema / validation 复用同一 owner；`@limecloud/agent-runtime-projection` 的 App Server facts 对 legacy event type 忽略 payload status，新增测试证明 `done / turn.final_done / turn.cancelled` 即使携带 `done/completed/cancelled` payload 也保持 running、无 `completedAt`。验证通过：contracts 30 tests、projection 96 tests。
- W3 frontend legacy terminal detector 接入 shared owner：`appServerEventPayloadUtils.ts` 与 `appServerEventStream.test.ts` 均复用 `@limecloud/agent-ui-contracts` 的 legacy terminal helper / 常量，避免前端 API 层继续维护第三套 legacy 列表。验证通过：`appServerEventStream.test.ts` 13 tests、`npm run test:contracts`。
- W2 queue event projection 命名收口：生产 hook 中旧 `removeQueuedTurnState` 命名已改为 `removeQueuedTurnsFromProjection`，避免后续 submit / terminal / explicit action 误把 current queue event projection 回调当成本地状态事实源复用。`agentStreamFlowControl.currentGuard.test.ts` 扩展为扫描 `src/components/agent/chat/hooks` 生产源码，禁止旧本地队列删除命名回流；queued turn remove 仍只过滤 id、不重排 position，最终 reindex 继续等待 App Server read model 回填。
- W2 input restore owner inventory 收口：当前 production UI 写入 owner 只有 `EmptyState` 与 `Inputbar/useInputbarController`；`AgentChatWorkspace`、`WorkspaceConversationScene` 与 inputbar scene runtime 只透传 `inputRestoreRequest`。`AgentChatWorkspace.inputRestoreGuard.test.ts` 新增 production source guard，禁止其他 `src/components/agent/chat` 源码直接 `setInput(draft.text)`、恢复 `draft.images`、`draft.pathReferences` 或 `draft.inputCapabilityRoute`，防止第三套恢复 owner 回流。
- W2 queued turn state write owner 收口：production hook 中 `setQueuedTurns(...)` 写入清单已缩到三类 current owner：`useAgentSession` 的 session/read model snapshot、`agentStreamSubmissionLifecycle` 的 live queue event projection、`agentStreamResumeBinding` 的 reopen/resume queue event projection。`agentStreamFlowControl.currentGuard.test.ts` 新增 source guard，禁止 submit / terminal / explicit action 分支重新直接写 queued state。
- W2 queue projection 旁路收口：`packages/agent-runtime-projection` 的 `queue_added` 标准事件与 `liveRuntimeProjector` 的 live runtime 摘要都改为优先使用 App Server `queued_turn.position + 1` 推导 `queuedTurnCount`，避免重复事件 / reopen replay 让摘要计数漂移；`queueProjection` / `agentUiEventProjection` 继续只产出 timeline/task capsule 标准事件，`useAgentRuntimeSyncEffects` 只触发 read model refresh，不写 queuedTurns 或 input restore。`agentStreamFlowControl.currentGuard.test.ts` 新增 source guard，禁止这些 projection 旁路出现 `setQueuedTurns`、queued snapshot upsert/remove、input restore owner、`position: index + 1` 或本地 sort 回流。验证通过：`npx vitest run "src/components/agent/chat/projection/queueProjection.test.ts" "src/components/agent/chat/projection/agentUiEventProjection.test.ts" "src/components/agent/chat/team-workspace-runtime/liveRuntimeProjector.test.ts" "src/components/agent/chat/hooks/agentStreamFlowControl.currentGuard.test.ts"`（35 tests passed）；`npm --prefix "packages/agent-runtime-projection" run build`；`node --test "packages/agent-runtime-projection/tests/projection.test.mjs"`（41 tests passed）。
- W2 旧 input restore fallback 第二刀删除：`AgentChatWorkspace` 不再在收到 `inputRestoreRequest` 时抢先执行 text/path-only 预恢复，父层只记录并转发 restore request；完整 UI 恢复继续由首页 `EmptyState` 与 inline `Inputbar/useInputbarController` current owner 处理 text / image / path / skill route。新增 `AgentChatWorkspace.inputRestoreGuard.test.ts` source guard，禁止父级重新写回 `setInput(request.draft.text)`、`handleClearPathReferences()`、`handleAddPathReferences`、`replacePendingImages` 或 `setActiveCapability`。
- W2 pending steer queue current read model 收口：`stopActiveAgentStream` 不再把 `runtime.getSessionReadModel` 当 optional capability；需要刷新 queued turn 时直接走 current read model，避免本地 `queuedTurnsRef` 滞后时继续沿旧 runtime fallback 判定。新增 `agentStreamFlowControl.currentGuard.test.ts`，禁止 `typeof runtime.getSessionReadModel` / `getSessionReadModel === "function"` 回流；相关 stop 单测改用 current adapter 形状。验证通过：`npx vitest run "src/components/agent/chat/hooks/agentStreamFlowControl.currentGuard.test.ts" "src/components/agent/chat/hooks/agentStreamFlowControl.test.ts" "src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts" "src/components/agent/chat/components/Inputbar/index.test.tsx" "src/components/agent/chat/components/Inputbar/hooks/useInputbarSend.test.tsx" "src/components/agent/chat/components/EmptyState.test.tsx" "src/components/agent/chat/components/EmptyStateComposerPanel.inputFlow.test.tsx" "src/components/agent/chat/AgentChatWorkspace.inputRestoreGuard.test.ts"`（192 tests passed）；`jq empty "internal/roadmap/test/clawstream/scenario-registry.json"`；`npx vitest run "internal/roadmap/test/clawstream/scenario-registry.test.mjs"`（6 tests passed）；`git diff --check`；`npm run smoke:agent-runtime-current-fixture`，覆盖 `cancel-then-continue`、Inputbar rich restore、pending steer rich / multi queue / pop-front resume、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、media reference、Expert Skills 与 Content Factory Article Editor，`liveProviderUsed=false`。
- W2 explicit queue action 本地裁剪删除：`removeQueuedAgentTurn` / `promoteQueuedAgentTurn` 成功后不再直接 `setQueuedTurns(removeQueuedTurnFromState(...))`，队列状态只通过 `refreshSessionReadModel` 回填，避免 GUI queued panel 在 App Server read model 之前自行裁决 pop-front / remove 结果。`agentStreamFlowControl.currentGuard.test.ts` 新增 source guard 禁止该本地裁剪回流；相关单测改为断言 queuedTurns 在 refresh mock 未回填前保持不变。验证通过：`npx vitest run "src/components/agent/chat/hooks/agentStreamFlowControl.currentGuard.test.ts" "src/components/agent/chat/hooks/agentStreamFlowControl.test.ts" "src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts" "src/components/agent/chat/components/Inputbar/index.test.tsx" "src/components/agent/chat/components/Inputbar/hooks/useInputbarSend.test.tsx" "src/components/agent/chat/components/EmptyState.test.tsx" "src/components/agent/chat/components/EmptyStateComposerPanel.inputFlow.test.tsx" "src/components/agent/chat/AgentChatWorkspace.inputRestoreGuard.test.ts"`（192 tests passed）。
- W2 stop restore queued draft 本地裁剪删除：`stopActiveAgentStream` 恢复 queued draft 后不再调用 `setQueuedTurns(removeQueuedTurnFromState(...))`，并删除仅服务本地裁剪的 `removeQueuedTurnFromState` helper；后端 `removeQueuedTurn` 仍照常执行，GUI 队列状态等待 `refreshSessionReadModel` current read model 回填裁决。`agentStreamFlowControl.currentGuard.test.ts` 现在禁止 `setQueuedTurns` / `removeQueuedTurnFromState` 回流；相关 stop 单测改为断言 refresh mock 未回填前本地 queued item 保持不变。
- W2 submit/terminal queued turn 本地删除收口：`handleAgentStreamSubmitFailure`、`finalizeMissingFinalReplyFailure`、`completeAssistantStreamMessageFromCompletionPlan`、`completeInterruptedTurn`、empty-final graceful completion 与 generic `turn_failed` 分支不再调用 `removeQueuedTurnState`；本地 queued turn 删除只保留 `queue_removed` / `queue_started` / `queue_cleared` current event projection 与 read model snapshot 回填。`agentStreamFlowControl.currentGuard.test.ts` 新增 source guard，禁止 submit failure / terminal side-effect owner 重新本地裁决队列。验证通过：`npx vitest run "src/components/agent/chat/hooks/agentStreamFlowControl.currentGuard.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/hooks/agentStreamSubmitFailure.unit.test.ts"`（59 tests passed）。
- W2 queue event position 本地重排删除：`agentStreamSubmissionLifecycle` 与 `agentStreamResumeBinding` 的 `removeQueuedTurnState` 仍按 current `queue_removed / queue_started / queue_cleared` event 过滤 queued id，但不再把剩余 item 的 `position` 改成 `index + 1`；FIFO 顺序和 pop-front reindex 继续以 App Server read model 为事实源。`agentStreamFlowControl.currentGuard.test.ts` 新增 source guard 禁止 `position: index + 1` 回流；`agentStreamSubmissionLifecycle.test.ts` 新增回归证明本地 queue event 删除不会重写 position。验证通过：`npx vitest run "src/components/agent/chat/hooks/agentStreamFlowControl.currentGuard.test.ts" "src/components/agent/chat/hooks/agentStreamSubmissionLifecycle.test.ts" "src/components/agent/chat/hooks/agentStreamResumeBinding.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/hooks/agentStreamTurnEventBinding.test.ts"`（89 tests passed）。
- W2 queued turn projection helper 收敛：新增 `agentQueuedTurnProjection.ts` 作为前端 `queue_*` event projection 的 current helper owner，`agentStreamSubmissionLifecycle` 与 `agentStreamResumeBinding` 不再各自内联 queued turn upsert/remove 排序规则；helper 单测覆盖 upsert replace、`position / created_at` 投影顺序、remove by id 与 remove 不重排 position。`agentStreamFlowControl.currentGuard.test.ts` 新增 source guard，禁止两个 Hook 重新内联 `.sort((left, right)` 或 `new Set(queuedTurnIds)` 删除规则。验证通过：`npx vitest run "src/components/agent/chat/hooks/agentQueuedTurnProjection.unit.test.ts" "src/components/agent/chat/hooks/agentStreamFlowControl.currentGuard.test.ts" "src/components/agent/chat/hooks/agentStreamSubmissionLifecycle.test.ts" "src/components/agent/chat/hooks/agentStreamResumeBinding.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/hooks/agentStreamTurnEventBinding.test.ts"`（92 tests passed）。
- W2 input restore policy owner 拆分：`resolveInterruptedInputRestorePlan` / `resolveQueuedTurnsForRestore` 从 `agentStreamFlowControl.ts` 拆到 `agentStreamInputRestorePlan.ts`，read model queue 解析拆到 `agentStreamReadModelParsing.ts`；`agentStreamFlowControl.ts` 只保留 stop/remove/promote 编排并从 1094 行降到 639 行，退出 800 行拆分预警。`agentStreamFlowControl.currentGuard.test.ts` 新增 source guard，禁止 rich queued draft 解析、queued turn restore sort 和 policy export 回流到 flow control；`agentStreamInputRestorePolicy.unit.test.ts` 直接绑定新 current owner。验证通过：`npx vitest run "src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts" "src/components/agent/chat/hooks/agentStreamFlowControl.test.ts" "src/components/agent/chat/hooks/agentStreamFlowControl.currentGuard.test.ts"`（29 tests passed）。
- W2 package-side queue projection guard 补齐：`agentStreamFlowControl.currentGuard.test.ts` 的 queue projection 旁路扫描纳入 `packages/agent-runtime-projection/src/queueEvents.ts`，确保标准事件 package 只能产出 queue/task capsule，不允许回流 `setQueuedTurns`、queued snapshot upsert/remove、input restore owner、本地 `position: index + 1` reindex 或本地 sort。
- W2 input restore request 清单固化：`AgentChatWorkspace.inputRestoreGuard.test.ts` 增加 production source 白名单，`inputRestoreRequest` / `InterruptedInputRestoreRequest` 只能停留在 source / flow owner、父级 request holder、pass-through scene/runtime/props/types，以及 `EmptyState` / `Inputbar` current UI owner，防止第三套 UI 恢复 owner 回流。
- W2 聚合 fixture gate 恢复：`npm run smoke:agent-runtime-current-fixture` 曾在 `electron:build:app-server-assets` 被 `lime-agent` 的 `agent_reply_backend_adapter.rs` lifetime 编译错误阻塞；本轮在 Agent compat source adapter 内把 `AgentReplyBackend::start_reply_stream(...)` 的 `Agent` 引用改为按当前 `&self` 调用期重新借用，解除 `RuntimeReplySource` impl 不够泛化错误。验证通过：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 2`（13 passed）；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2`（68 passed）；`npm run smoke:agent-runtime-current-fixture` 完整通过，覆盖 pending steer rich / multi queue / pop-front resume、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、media reference、Expert Skills 与 Content Factory Article Editor，`liveProviderUsed=false`。这只恢复 W2/current fixture 验证门槛，`inputbar-restore-matrix` / `pending-steer-queue` 仍保持 `partial+guard`。
- W2 smoke 暴露的 Workspace TDZ 崩溃修复：`npm run smoke:agent-runtime-current-fixture` 首次在 Coding Workbench Electron fixture 的 `AgentChatWorkspace` root render 失败，截图显示 CrashBoundary `Cannot access 'me' before initialization`；完整 stack 指向右侧 surface artifact click handler 捕获的 setter 在声明前使用。已将 `manualRightSurface`、`activeFilesRightSurfaceTarget`、`activeObjectCanvasRightSurfaceCandidate`、`activeArticleWorkspace` state 声明前移，并在 `AgentChatWorkspace.inputRestoreGuard.test.ts` 加 source guard，防止右侧 surface setter 再次被声明前捕获。验证通过：`npx eslint "src/components/agent/chat/AgentChatWorkspace.tsx" --rule "no-use-before-define:error" --rule "@typescript-eslint/no-use-before-define:error"`；`npx vitest run "src/components/agent/chat/AgentChatWorkspace.inputRestoreGuard.test.ts" "src/components/agent/chat/hooks/agentQueuedTurnProjection.unit.test.ts" "src/components/agent/chat/hooks/agentStreamFlowControl.currentGuard.test.ts" "src/components/agent/chat/hooks/agentStreamSubmissionLifecycle.test.ts" "src/components/agent/chat/hooks/agentStreamResumeBinding.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts" "src/components/agent/chat/hooks/agentStreamTurnEventBinding.test.ts"`（95 tests passed）；重跑 `npm run smoke:agent-runtime-current-fixture` 完整通过，`liveProviderUsed=false`。
- W4 fixture 时序护栏补强：`cancel` / `cancel-then-continue` 现在调用 `waitForStopButtonVisibleAndClick(..., { requireVisibleOutput: true })`，停止前必须看到同一 turn 的 assistant 正文与 running status 同屏，不能把首字前“正在生成回复”当作 `running-status-preserved` 证据。验证通过 `npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`、`LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:claw-chat-current-fixture -- --scenario cancel-then-continue --prefix claw-chat-current-fixture-cancel-then-continue-require-visible-output --timeout-ms 300000`、`LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:agent-runtime-current-fixture`。

### 2026-07-07

- `startup-prewarm-first-output` 推进到 `covered-electron`：补 Agent UI performance unit guard，证明 `streamRequestStartToFirstTextPaintMs` / `submitAcceptedToFirstTextPaintMs` / `firstEventToFirstTextPaintMs` / `homeInputToFirstTextPaintMs` / `firstTextDeltaToFirstTextPaintMs` 与 provider wait / client local output 分离汇总；加严 Electron current fixture 公共断言，text-stream 场景必须导出 first visible output marker 且不导出 raw payload。首次实跑暴露默认 GUI composer 路径没有 `homeInput.submit`，随后补通用 first visible marker 并复跑 `npm run smoke:claw-chat-current-fixture -- --scenario complete --timeout-ms 240000` 通过，session=`claw-chat-current-1783395755343-32569`。
- `reasoning-first-visible` 推进到 `covered-electron`：先补 `clawstream reasoning-first-visible` timeline DOM 回归，完成态 reasoning hydrate 后默认只显示 summary，展开后才显示 raw reasoning，summary/raw 各只出现一次；随后新增 Electron current `reasoning-first-visible` fixture，后端先发 reasoning item、延迟 final answer，再验证 GUI 中间态 `hasFinalText=false / hasDoneText=false / startupNoteVisible=false` 且可见 `思考中 / 正在输出`，完成态 `reasoningIndex=38 < finalAnswerIndex=63`，read model `reasoningSequence=1 < finalSequence=9`。验证通过：`npm run smoke:claw-chat-current-fixture -- --scenario reasoning-first-visible --timeout-ms 240000`，session=`claw-chat-current-1783403517680-48086`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`。
- `no-natural-language-lifecycle-regex` 推进到 `partial+guard`：核心 Claw 投影 owner 已由 `streamingProjectionGuard.unit.test.ts` 禁止展示文案、正文正则、动态 regex 和旧 duplicate helper 回流；剩余细节是扩大扫描面并删除旧 helper。
- `terminal-contract-after-answer` 推进到 `covered-electron` 骨架：保留 projection 层 `turn.completed` 不合成正文 / 无 assistant text fail closed oracle，并新增 hook/runtime guard，证明 `turn_failed` 在已有 partial answer 时只补一个失败说明、保留过程卡、不重复 error；新增 Electron current `terminal-failed-after-answer` 场景，后端先发 partial 再发 `turn.failed`，GUI / read model / backend ledger 均证明失败终态保留已输出内容且不重复。验证通过：`npm run smoke:claw-chat-current-fixture -- --scenario terminal-failed-after-answer --timeout-ms 240000`，session=`claw-chat-current-1783408449429-62469`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`。
- `terminal-contract-after-answer` 追加 canceled 独立 Electron current 骨架：新增 `terminal-canceled-after-answer` 场景，后端先发 partial 并等待 GUI stop，`turnCancel` 走 current `turn.canceled`，GUI / read model / backend ledger 证明 stop 前 partial 与 running 同屏、取消后 partial 保留且只出现一次、输入框恢复、read model 标记 `canceled`。验证通过：`LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:claw-chat-current-fixture -- --scenario terminal-canceled-after-answer --timeout-ms 240000`，session=`claw-chat-current-1783417713111-42454`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`。未设 `LIME_ELECTRON_FIXTURE_BUILD_READY` 的首次运行在 packaged renderer/assets build 阶段以 `143/SIGTERM` 退出，未进入场景执行；`final_done` grace timer 删除留作真实旧 terminal owner 投影细节之后。
- `stale-terminal-does-not-stop-new-turn` 推进到 `covered-electron` 骨架：新增 Electron current `terminal-stale-guard` 场景，第一轮和第二轮均通过 GUI 输入、App Server current read model 完成；第二轮 backend ledger 记录旧 terminal marker，GUI 断言 stale done marker 不可见、第二轮 done marker 可见且输入框恢复。验证通过：`npm run smoke:claw-chat-current-fixture -- --scenario terminal-stale-guard --timeout-ms 240000`，session=`claw-chat-current-1783406820348-36412`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`。真实旧 terminal event 注入 owner 投影仍作为下一轮细节补强。
- fixture 结构债先收四刀：新增 `scripts/agent-runtime/claw-chat-current-fixture-terminal-after-answer.mjs`，把 failed/canceled after-answer 两个 terminal scenario 从中心 `claw-chat-current-fixture-scenario-flow.mjs` 拆出；随后新增 `scripts/agent-runtime/claw-chat-current-fixture-terminal-stale-guard.mjs`，把 stale terminal 双回合 GUI / read model / backend ledger flow 拆出；再新增 `scripts/agent-runtime/claw-chat-current-fixture-web-tools-rendering.mjs`，把 reasoning/tool/text 时序 fixture 的 GUI 中间态、失败 probe 和 read model 汇总拆出；最后新增 `scripts/agent-runtime/claw-chat-current-fixture-skills-runtime-flow.mjs`，把 Skills Runtime / Expert Skills Runtime / Expert Plaza / Expert Panel 长流程拆出。中心 flow 从 `1671` 行降到 `810` 行，新模块分别为 `208` / `136` / `172` / `586` 行，结构守卫已把四个模块纳入 `claw-chat-current-fixture-smoke.test.mjs` 的 source 聚合。
- 拆分后验证通过：`node --check` 覆盖 `claw-chat-current-fixture-scenario-flow.mjs` 与四个新 scenario module；`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（33 tests passed）；`npx vitest run "internal/roadmap/test/clawstream/scenario-registry.test.mjs"`（6 tests passed）；真实 Electron devserver smoke 通过 `skills-runtime`、`web-tools-rendering`、`terminal-stale-guard`，sessions 分别为 `claw-chat-current-1783420240239-58404`、`claw-chat-current-1783420289456-67638`、`claw-chat-current-1783420326278-71150`。
- assertion 结构债继续收口：新增 `scripts/agent-runtime/claw-chat-current-fixture-terminal-assertions.mjs` 与 `scripts/agent-runtime/claw-chat-current-fixture-web-tools-assertions.mjs`，把 terminal failed/canceled/stale 与 reasoning/tool/text 时序断言从中心 `claw-chat-current-fixture-scenario-assertions.mjs` 拆出；中心断言文件从 `1849` 行降到 `1566` 行。验证通过：`node --check` 覆盖两个新 assertion module 与中心断言文件；`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（33 tests passed）；`npx vitest run "internal/roadmap/test/clawstream/scenario-registry.test.mjs"`（6 tests passed）。
- assertion 结构债第二轮收口：新增 `scripts/agent-runtime/claw-chat-current-fixture-skills-runtime-assertions.mjs`，把 Skills Runtime / Expert Skills / Expert Plaza / Expert Panel 断言从中心文件拆出；新增 `scripts/agent-runtime/claw-chat-current-fixture-runtime-surface-assertions.mjs`，把 reasoning-first、MCP structured content、media reference 与 Multi-Agent Team runtime surface 断言拆出；`claw-chat-current-fixture-smoke.test.mjs` 的 source guard 已纳入两个新模块。
- registry 状态统计保持 `covered-electron=13 / partial+guard=5 / partial=5 / missing=36 / guard-needed=0`。代码体量风险更新：`claw-chat-current-fixture-scenario-flow.mjs` 已退出 `1000` 行硬风险；`claw-chat-current-fixture-scenario-assertions.mjs` 已从 `1849` 行降到 `944` 行并退出安全线；`claw-chat-current-fixture-smoke.test.mjs` 已从 `2023` 行降到 `855` 行并退出安全线；`scripts/agent-runtime/claw-chat-current-fixture-backend-file.mjs`（`1786` 行）仍超过 `1000` 行。下一刀继续拆 backend fixture script rendering，然后回到真实旧 terminal owner 投影和 `final_done` grace timer 删除。
- assertion 第二轮验证通过：`node --check "scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs"`；`node --check "scripts/agent-runtime/claw-chat-current-fixture-skills-runtime-assertions.mjs"`；`node --check "scripts/agent-runtime/claw-chat-current-fixture-runtime-surface-assertions.mjs"`；`node --check "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`；`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（33 tests passed）；`npx vitest run "internal/roadmap/test/clawstream/scenario-registry.test.mjs"`（6 tests passed）。
- assertion 第二轮真实 Electron current fixture 验证通过：`npm run smoke:claw-chat-current-fixture -- --scenario skills-runtime --timeout-ms 240000`，session=`claw-chat-current-1783421964581-73521`；`npm run smoke:claw-chat-current-fixture -- --scenario mcp-structured-content --timeout-ms 240000`，session=`claw-chat-current-1783421964570-73526`。两条均使用 external fixture backend，不调用正式模型。
- smoke guard 结构债收口：新增 `scripts/agent-runtime/claw-chat-current-fixture-smoke-domain-guards.mjs` 承接 Image Command / Content Factory Article Workspace / Multi-Agent Team 结构守卫；新增 `scripts/agent-runtime/claw-chat-current-fixture-smoke-skills-runtime-guards.mjs` 承接 Skills Runtime / Expert Skills / Expert Plaza / Expert Panel 结构守卫与 evidence summarizer 单测。两个 helper 只由 `claw-chat-current-fixture-smoke.test.mjs` 注册执行，不加入 `readSmokeScript()` source 聚合，避免测试 helper 字符串污染 current fixture 负向断言。
- smoke guard 拆分验证通过：`node --check "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`；`node --check "scripts/agent-runtime/claw-chat-current-fixture-smoke-domain-guards.mjs"`；`node --check "scripts/agent-runtime/claw-chat-current-fixture-smoke-skills-runtime-guards.mjs"`；`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（33 tests passed）。
- backend fixture 结构债收口：新增 `scripts/agent-runtime/claw-chat-current-fixture-backend-script.mjs` 承接 `writeFixtureBackend` 与主 backend script 模板；新增 `scripts/agent-runtime/claw-chat-current-fixture-backend-tool-skill-events.mjs` 承接 Web tools / MCP structuredContent / Skills Runtime / Expert / Multi-Agent tool event fragment；`claw-chat-current-fixture-backend-file.mjs` 从 `1786` 行降到 `545` 行，新增模块为 `761` / `518` 行，三者均低于 `1000` 行硬风险。
- 拆分后修复 MCP structuredContent live GUI 回归：`tool.result.payload.result` 必须是完整 ToolExecutionResult，不能只放 `structuredContent`；否则前端 `appServerEventStream` 会以 nested `result` 为 source，丢失 `success/output/metadata`，GUI 只显示工具已完成而不显示 structured answer / reference id。本轮补齐 nested `result.success/output/metadata/structuredContent`，并在 smoke guard 中要求 MCP nested result 保持完整形状。
- backend 拆分与 MCP 修复验证通过：`node --check` 覆盖 `claw-chat-current-fixture-backend-file.mjs`、`claw-chat-current-fixture-backend-script.mjs`、`claw-chat-current-fixture-backend-tool-skill-events.mjs`、`claw-chat-current-fixture-smoke.test.mjs`；临时生成 backend script 后 `node --check` 通过，手动 turnStart stdout 已确认 MCP `tool.result` 带完整 nested result；`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（33 tests passed）；`npx vitest run "src/lib/api/agentRuntime/appServerEventStream.test.ts"`（12 tests passed）；`npx vitest run "src/components/agent/chat/hooks/agentStreamThreadItemController.test.ts" "src/components/agent/chat/hooks/agentStreamToolItemMessageSync.unit.test.ts" "src/components/agent/chat/components/InlineToolProcessStep.test.tsx" "src/components/agent/chat/components/ToolCallDisplay.test.tsx"`（55 tests passed）。
- backend 拆分后的真实 Electron current fixture 验证通过：`npm run smoke:claw-chat-current-fixture -- --scenario mcp-structured-content --timeout-ms 240000`，session=`claw-chat-current-1783424714794-33605`；`npm run smoke:claw-chat-current-fixture -- --scenario skills-runtime --timeout-ms 240000`，session=`claw-chat-current-1783425064534-56136`。两条均使用 external fixture backend，不调用正式模型。观察到 packaged renderer 每次强制重建分别约 `4m48s` / `4m44s`，这是当前 fixture 执行慢的主要来源；下一刀应把 build reuse / `LIME_ELECTRON_FIXTURE_BUILD_READY` 口径纳入 current fixture 骨架加速，而不是把耗时误判成模型首字慢。
- Electron fixture build reuse 骨架落地：`ensureElectronFixtureBuild` 新增 freshness gate，缺产物时构建，源码 / host / App Server crate / 构建配置新于产物时按 `stale-source` 重建，产物 fresh 时默认复用并设置 `LIME_ELECTRON_FIXTURE_BUILD_READY=1` 给同进程后续场景。新增 `scripts/lib/electron-fixture-build.test.mjs` 覆盖 fresh reuse、stale rebuild、preload 与 packaged app-server binary 缺失。当前脏工作树若有源码新于 dist 仍会 fail-closed 重建一次；受控复用验证 `LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:claw-chat-current-fixture -- --scenario mcp-structured-content --timeout-ms 240000` 通过，session=`claw-chat-current-1783426222579-25809`，约 `16s` 完成。
- 验证通过：`npx vitest run "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts"`（55 tests passed）；`npx vitest run "src/components/agent/chat/hooks/agentStreamCompletionController.test.ts"`（26 tests passed）；`npx vitest run "src/components/agent/chat/hooks/agentStreamTerminalTurnGuard.unit.test.ts"`（8 tests passed）；`node --test "packages/agent-runtime-projection/tests/clawstreamP0.test.mjs"`（6 tests passed）；`npx vitest run "internal/roadmap/test/clawstream/scenario-registry.test.mjs"`（6 tests passed）。
- W2 rich restore Electron current fixture 收口：修正 Inputbar 恢复请求和发送成功回调的竞态，恢复 request 调度递增 epoch，旧发送成功回调不再清理已恢复的 images / pathReferences / skill route；父层同步恢复 `input` 与 `pathReferences`。
- 修复 Electron `file://` 下 renderer 启动卡住：`scripts/electron/build-renderer.mjs` 与 `scripts/electron/build-renderer-smoke.mjs` 显式使用 `vite build --base ./`，避免 `dist/index.html` 生成 `/assets/...` 导致 Electron 加载空壳。
- `inputbar-rich-restore` fixture 断言改为绑定本场景 `turnStart`，取消事件必须匹配同一 `sessionId / turnId`，不再依赖动态 `SESSION_ID` 跨进程常量。
- Gate B 验证通过：`APP_SERVER_BIN="/Users/coso/Documents/dev/ai/aiclientproxy/lime/dist-electron/app-server/darwin-arm64/app-server" npm run smoke:claw-chat-current-fixture -- --scenario inputbar-rich-restore --timeout-ms 180000`，session=`claw-chat-current-1783381197658-93694`。该证据覆盖真实 Electron Desktop Host、preload/IPC、`app_server_handle_json_lines`、App Server JSON-RPC、external fixture backend、read model 与 GUI 可见状态。
- 结构守卫与卫生检查通过：`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（27 tests passed）；`git diff --check`。
- W2 pending steer rich snapshot guard 落地：App Server queued read model 从 current `turn_inputs + turn_runtime_options.metadata` 投影 `attachments / pathReferences / textElements / inputCapabilityRoute`；前端 `queuedTurn` normalizer 与 restore policy 保留这些字段，发送准备会把 input restore draft 的 path references、text elements 和 skill route 写入 current turn metadata。
- 定向验证通过：`npx vitest run "src/lib/api/queuedTurn.test.ts" "src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts" "src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.test.ts" "src/components/agent/chat/components/Inputbar/hooks/useInputbarSend.test.tsx"`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server read_session_projects_queued_turn_input_snapshot -- --nocapture`。
- 聚合 current fixture 通过：`npm run smoke:agent-runtime-current-fixture`，覆盖 Inputbar rich restore、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills / Plaza / Panel、Content Factory Article Editor，`liveProviderUsed=false`。
- `scenario-ledger.md` 中 `inputbar-restore-matrix` 保持 `partial+guard`：rich restore 已有 Electron Gate B 证据；pending steer rich snapshot 已有 current read model / frontend guard；pending steer rich restore 已补 devserver 与 packaged Electron Gate B 证据；多 pending steer 顺序已有 Electron FIFO 骨架；pop-front resume / restore hydrate 已补 packaged Electron Gate B 证据。GUI “立即执行”一键串联已完成，`EmptyStateComposerPanel` 与 `AgentChatWorkspace` 两条 text/path-only fallback 已删除并封 source guard；queue / steer / draft 并行状态 inventory / 回流守卫仍未补齐，因此还不能一次性删除全部 input restore 旧实现。
- W2 pending steer rich restore devserver Electron Gate B 收口：`inputbarPendingSteerQueuedRichTextPreserved` 断言改为按 current read model 的结构化 `textElementTexts` 验证用户可编辑正文，允许 queued raw `text` 保留 `/capability-report` slash command 前缀；该口径对齐 Thread/Turn/Item projection，不再把 raw dispatch text 当成 Inputbar textarea truth。
- 验证通过：`node --check "scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs"`；`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（28 tests passed）；`npm run smoke:claw-chat-current-fixture -- --app-url "http://127.0.0.1:1420/" --scenario inputbar-pending-steer-rich-restore --prefix claw-chat-current-fixture-inputbar-pending-steer-rich-restore-devserver-text-element-assertion --timeout-ms 180000`，session=`claw-chat-current-1783389967237-36808`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-inputbar-pending-steer-rich-restore-devserver-text-element-assertion-summary.json`。
- W2 pending steer packaged 骨架补齐：`inputbar-pending-steer-rich-restore` 语义收敛为 queued rich turn restore，不再声称 active turn cancel；验证通过 `APP_SERVER_BIN="/Users/coso/Documents/dev/ai/aiclientproxy/lime/dist-electron/app-server/darwin-arm64/app-server" LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:claw-chat-current-fixture -- --scenario inputbar-pending-steer-rich-restore --prefix claw-chat-current-fixture-inputbar-pending-steer-rich-restore-packaged-current --timeout-ms 300000`，session=`claw-chat-current-1783428460310-22335`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-inputbar-pending-steer-rich-restore-packaged-current-summary.json`。
- W2 pending steer 多队列 Electron 骨架落地：新增 `inputbar-pending-steer-multi-queue`，在 active streaming 期间先 defer rich draft，再 defer 第二条 plain steer，read model 证明 queued rich / second plain turn 的 FIFO `position=0/1`、`promptOrder=["rich","second"]`，且 rich turn 未提前发到 backend。修复 external backend fixture 对该场景的 active turn 长流式保持，并将该场景从通用 completed 新闻正文等待中排除。验证通过 `APP_SERVER_BIN="/Users/coso/Documents/dev/ai/aiclientproxy/lime/dist-electron/app-server/darwin-arm64/app-server" LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:claw-chat-current-fixture -- --scenario inputbar-pending-steer-multi-queue --prefix claw-chat-current-fixture-inputbar-pending-steer-multi-queue-packaged-current --timeout-ms 240000`，session=`claw-chat-current-1783429458391-18636`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-inputbar-pending-steer-multi-queue-packaged-current-summary.json`。
- W2 pending steer pop-front / hydrate packaged 骨架补齐：`inputbar-pending-steer-pop-front-resume` 覆盖 `active streaming -> rich/second defer -> GUI queued panel promote -> App Server current cancel active -> agentSession/thread/resume -> rich backend turnStart -> second queue position=0 -> renderer reload hydrate`。公共 `guiNotStuckStreaming` 不再把该场景误套普通完成态 stop 隐藏断言，而是要求 hydrate 后 active/rich 输出仍可见、second queue 为 `position=0` 且输入框可用，保留“正在输出”状态证据。验证通过 `APP_SERVER_BIN="/Users/coso/Documents/dev/ai/aiclientproxy/lime/dist-electron/app-server/darwin-arm64/app-server" LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:claw-chat-current-fixture -- --scenario inputbar-pending-steer-pop-front-resume --prefix claw-chat-current-fixture-inputbar-pending-steer-pop-front-resume-packaged-current --timeout-ms 300000`，session=`claw-chat-current-1783433643324-49596`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-inputbar-pending-steer-pop-front-resume-packaged-current-summary.json`。
- W2 pending steer GUI 产品闭环补齐：`agentStreamFlowControl.promoteQueuedAgentTurn` 串联 `getSessionReadModel -> promoteQueuedTurn -> interruptTurn -> resumeThread -> refreshSessionReadModel`；read model active turn 解析不再把 queued turn 当 active interrupt target；`QueuedTurnsPanel` 在缺 current handler 时 fail closed。验证通过 `APP_SERVER_BIN="/Users/coso/Documents/dev/ai/aiclientproxy/lime/dist-electron/app-server/darwin-arm64/app-server" npm run smoke:claw-chat-current-fixture -- --scenario inputbar-pending-steer-pop-front-resume --prefix claw-chat-current-fixture-inputbar-pending-steer-pop-front-resume-product-current --timeout-ms 300000`，session=`claw-chat-current-1783437285396-26073`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-inputbar-pending-steer-pop-front-resume-product-current-summary.json`；`appServerRequestMethods` 覆盖 `agentSession/queuedTurn/promote`、`agentSession/turn/cancel`、`agentSession/thread/resume`，rich turn input 保留 image/file reference，second queue reload hydrate 为 `position=0`，且保留“正在输出”状态。
- W2 pending steer fixture 拆分完成：`claw-chat-current-fixture-inputbar-pending-steer.mjs` 从 1050 行降为 348 行 scenario facade，GUI DOM / queued panel 操作移到 `claw-chat-current-fixture-pending-steer-gui-actions.mjs`，queued read-model 投影与 wait 移到 `claw-chat-current-fixture-pending-steer-read-model.mjs`；source guard 已纳入新模块。验证通过 `node --check` 三个 pending-steer 模块、`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs" "scripts/agent-runtime/current-fixture-regression-smoke.test.mjs" "internal/roadmap/test/clawstream/scenario-registry.test.mjs"`（51 tests passed）、`npm run governance:scripts`、`jq empty "internal/roadmap/test/clawstream/scenario-registry.json"`、`git diff --check`。
- 继续收口用户截图中的 reopen / terminal 卡住问题：前端 session read model 现在优先识别 `completed / failed / aborted / canceled` 等终态，terminal read model 不再因残留 `active_turn_id` 或本地 stale running 被判定为 running；terminal read model 也不会重新绑定恢复 active stream。`canceled` 保持由停止后的输入恢复链自行收口，避免 stop 后输入框恢复被同步强清。
- EmptyState / Inputbar 富草稿恢复补齐：中断恢复改为同步 apply；空态输入框恢复 text / image / path / skill；发送成功清理带 epoch，避免旧 send promise 清掉已恢复草稿；EmptyStateComposerPanel 不再抢先标记 restore request handled。
- 定向回归通过：`npm test -- --run src/components/agent/chat/components/Inputbar/index.test.tsx src/components/agent/chat/components/Inputbar/hooks/useInputbarSend.test.tsx src/components/agent/chat/components/EmptyState.test.tsx src/components/agent/chat/hooks/agentStreamFlowControl.test.ts src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts`（172 tests passed）；`npm test -- --run src/components/agent/chat/workspace/workspaceSceneSessionProjection.unit.test.ts src/components/agent/chat/hooks/agentSessionState.test.ts src/components/agent/chat/hooks/agentStreamResumeBinding.test.ts src/components/agent/chat/hooks/useAgentRuntimeSyncEffects.test.tsx`（58 tests passed）；`npm test -- --run scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs`（27 tests passed）。
- Electron current fixture 与 CDP 证据通过：`node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario inputbar-rich-restore --prefix claw-chat-current-fixture-inputbar-rich-restore-fixed-built --timeout-ms 240000` 通过，证据 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-inputbar-rich-restore-fixed-built-summary.json`；CDP Gate B 证据 `.lime/cdp-evidence/agent-terminal-rich-restore-cdp-summary.json`，`ok=true`、`proofLevel=Gate B`。
- 聚合 current fixture 复跑通过：`npm run smoke:agent-runtime-current-fixture` 覆盖 history/cache hydration、当时的 terminal 工具收尾、failed read model、Claw 终态 UI、Electron fixture guard、Coding Workbench、图片命令、普通画图意图、`cancel-then-continue`、`inputbar-rich-restore`、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills / Plaza / Panel、Content Factory Article Editor，`liveProviderUsed=false`。关键证据：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-inputbar-rich-restore-regression-summary.json`、`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-cancel-then-continue-regression-summary.json`；2026-07-08 后续 W3 已将 current smoke 完成态口径迁到 `turn.completed`。
- GUI smoke 通过：`npm run verify:gui-smoke` 完成 renderer smoke build、Electron host build、App Server sidecar 初始化、Claw workbench shell ready 与 memory settings ready。

### 2026-07-06

- W2 `inputbar-restore-matrix` 第一段落地：新增 `resolveInterruptedInputRestorePlan` 作为 pure owner，按 assistant visible text、thinking-only、tool/action/artifact/file change side-effect 与 queued turn snapshot 判定 composer 是否可恢复。
- `agentStreamInputRestorePolicy.unit.test.ts` 覆盖 output-free、visible-output、thinking-only、patch-active、queued steer/manual interrupt 矩阵；`agentStreamFlowControl.test.ts` 更新 stop 断言，手动停止不再本地抢先清空 queued turns，等待 App Server read model 刷新裁决。
- 定向验证通过：`npx vitest run "src/components/agent/chat/hooks/agentStreamFlowControl.test.ts" "src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts"`。
- 聚合 current fixture 验证通过：`npm run smoke:agent-runtime-current-fixture` 覆盖 history/cache hydration、流式完成与运行态收尾、Claw 终态 UI、Electron fixture guard、代码工作台、图片命令、普通画图意图、`cancel-then-continue`、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills / Plaza / Panel、Content Factory Article Editor；`liveProviderUsed=false`。
- `scenario-ledger.md` 中 `inputbar-restore-matrix` 先从 `missing` 推进到 `partial`；此时只证明 pure policy 与 stop 行为，仍不能删除 input restore 旧实现。
- W2 rich restore 接线落地：`submittedDraft` 随 active stream 保存，`stopActiveAgentStream` 在 output-free / thinking-only 中断时触发 `onRestoreInterruptedInput`；`Inputbar` 接收 restore request 后恢复 text、images、pathReferences 与 installed skill route，纯空白输入不写回 draft。
- 定向验证通过：`npx vitest run "src/components/agent/chat/hooks/agentStreamFlowControl.test.ts" "src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts" "src/components/agent/chat/hooks/agentStreamSubmissionLifecycle.test.ts" "src/components/agent/chat/components/Inputbar/hooks/useInputbarSend.test.tsx" "src/components/agent/chat/components/Inputbar/index.test.tsx"`（109 tests passed）。
- `scenario-ledger.md` 中 `inputbar-restore-matrix` 推进到 `partial+guard`；当时仍缺 rich restore Electron current fixture 与 pending steer rich restore 全量证据，不能据此删除全部 input restore 旧实现。
- 聚合 current fixture 暴露并修复 Expert Panel Electron guard 缺口：`openSessionFromSidebar` 现在要求目标 session inputbar 的 `data-session-id` 匹配，Expert Panel follow-up 在当前专家页已有可用输入框时不再误重开到空会话壳；这只修 current fixture evidence 判定，不新增生产路径。
- 验证通过：`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`；`npm run smoke:claw-chat-current-fixture -- --scenario expert-panel-skills-runtime --timeout-ms 180000`；`npm run smoke:agent-runtime-current-fixture` 完整覆盖 history/cache hydration、流式完成与运行态收尾、Coding Workbench、图片命令、普通画图意图、`cancel-then-continue`、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills / Plaza / Panel、Content Factory Article Editor，`liveProviderUsed=false`。

### 2026-07-06

- W3 `stale-terminal-does-not-stop-new-turn` 第一段落地：`agentStreamTerminalTurnGuard.ts` 对缺失 `terminalTurnId` 改为 fail closed；有 active/current turn 时 queued ID 不再兜底放行旧 terminal；只有 queued 线索时 terminal 必须命中 queued ID。
- `agentStreamTerminalTurnGuard.unit.test.ts` 新增无 turnId、queued 命中 / 不命中、current + queued 旧终态拒绝用例；`agentStreamRuntimeHandler.unit.test.ts` 的 terminal 夹具补齐 current turn lineage，保留 queued ID 只作为队列清理 ID。
- 定向验证通过：`npx vitest run "src/components/agent/chat/hooks/agentStreamTerminalTurnGuard.unit.test.ts"`；`npx vitest run "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts"`。
- 聚合 current fixture 追加验证：`npm run smoke:agent-runtime-current-fixture` 已通过历史 / 缓存终态恢复、流式完成与运行态收尾、Electron/App Server fixture guard、代码工作台、Claw 图片命令、普通画图意图、`cancel-then-continue`、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills / Plaza / Panel 等前置场景；完整聚合在后续 Content Factory article workspace 场景失败，失败点为 `workspaceRightSurface/pending/list` 经 `app_server_handle_json_lines` 多次 5000ms timeout 触发 `noInvokeErrors`，记录为 Right Surface / Content Factory 独立缺口，不作为 W3 terminal guard 回退证据。
- `scenario-ledger.md` 中 `stale-terminal-does-not-stop-new-turn` 从 `missing` 推进到 `partial+guard`；仍缺 Electron current fixture 证据，不能据此删除全部 terminal 旧实现。

### 2026-07-06

- W1 `stream-parser-boundary` 先收掉 message seed/delta/completed full text 重复尾巴风险：`packages/agent-runtime-projection/tests/clawstreamP0.test.mjs` 新增 projection oracle，`packages/agent-runtime-projection/src/uiState.ts` 将 `model.completed` 纳入同一 message scope 合并。
- W1 `plan-parser-boundary` projection oracle 落地：`packages/agent-runtime-projection/src/uiState.ts` 将结构化 `plan.delta/final` 投影为 `plan` part，并把完整 `<proposed_plan>...</proposed_plan>` 从 assistant text 中 materialize 为独立 plan part；跨 message added / delta / completed 边界时 completed full text 仍替换同一 item，不再生成重复尾巴。
- `scenario-ledger.md` 中 `stream-parser-boundary` 与 `plan-parser-boundary` 推进到 `partial+guard`；仍缺 Plan rail / decision drawer / history hydrate DOM 与 Electron evidence，不能据此删除全部 parser 旧实现或 legacy `update_plan` UI owner。
- 定向验证通过：`npm --prefix "packages/agent-runtime-projection" test`（94 tests passed）。

### 2026-07-06

- W4 `running-status-preserved` 落到 projection / DOM guard：`messageListItemProjection.unit.test.ts` 覆盖首字前启动态不投影正文、首字后正文仍保持 current streaming、completed/stale runtimeStatus 不删除 reasoning/tool/text；既有 `MessageList.runtimeStatus.test.tsx` / `MessageList.streamingTurns.test.tsx` 继续覆盖 inline running indicator 与 completed 后不残留 running。
- W4 `running-status-preserved` 追加 Electron current `cancel` fixture 证据：`npm run smoke:claw-chat-current-fixture -- --scenario cancel --timeout-ms 240000` 通过，session=`claw-chat-current-1783399367181-64093`；stop 前 scoped text 同时包含 assistant 正文和“正在输出”，`hasRunningStatus=true`，`startupNoteVisible=false`。
- 触发并修复 MCP structuredContent current fixture 缺口：stream `tool_end`、thread item -> `ToolCallState`、message toolCall sync 现在保留 `structuredContent / structured_content`，`ToolCallDisplay` 展示 structured answer + reference id，transport envelope 仍隐藏。
- 新增 / 更新护栏：`agentStreamThreadItemController.test.ts`、`agentStreamToolItemMessageSync.unit.test.ts`、`components/timeline-utils/itemConverters.unit.test.ts`、`ToolCallDisplay.test.tsx`。
- 定向验证通过：`npx vitest run "src/components/agent/chat/components/messageListItemProjection.unit.test.ts" "src/components/agent/chat/components/MessageList.runtimeStatus.test.tsx" "src/components/agent/chat/components/MessageList.streamingTurns.test.tsx" "src/components/agent/chat/hooks/agentStreamThreadItemController.test.ts" "src/components/agent/chat/hooks/agentStreamToolItemMessageSync.unit.test.ts" "src/components/agent/chat/components/timeline-utils/itemConverters.unit.test.ts" "src/components/agent/chat/components/ToolCallDisplay.test.tsx"`。
- Electron current fixture 验证通过：`npm run build:renderer:electron`；`npm run smoke:claw-chat-current-fixture -- --scenario mcp-structured-content --timeout-ms 180000`；`npm run smoke:agent-runtime-current-fixture`，完整覆盖 history/cache hydration、流式完成与运行态收尾、Claw 终态 UI、Electron fixture guard、代码工作台、图片命令、普通画图意图、`cancel-then-continue`、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills / Plaza / Panel、Content Factory Article Editor，`liveProviderUsed=false`。
- `scenario-ledger.md` 中 `running-status-preserved` 从 `partial+guard` 推进到 `covered-electron`；`mcp-structured-content` 保持 `covered-electron`，但补齐 current item / converter / display 层 guard，后续 S2 继续补 truncation / resource / elicitation 等 MCP 扩展场景。
- 代码体量登记：`src/lib/api/agentProtocol.ts` 已有 `2357` 行，本轮只做 `AgentThreadToolCallItem` 结构化结果字段的协议类型补齐，没有追加业务逻辑。风险是协议类型继续集中膨胀；退出条件是在 S5 或后续协议分层任务中把 Thread / Turn / Tool item types 拆出独立 domain module，并让 `agentProtocol.ts` 只保留聚合导出 / transport normalize。

### 2026-07-06

- 新增本 S1 P0 细化计划，把父计划中的下一刀拆成 W1 / W2 / W3 / W4。
- 本次只改计划和索引，不触碰实现，不删除旧代码。
