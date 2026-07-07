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
- `src/lib/api/queuedTurn.test.ts`
- `src/components/agent/chat/components/Inputbar/components/InputbarCore.test.tsx`
- `lime-rs/crates/app-server/src/runtime/tests/queue.rs::read_session_projects_queued_turn_input_snapshot`
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
- rich restore Electron current fixture 已满足；pending steer rich snapshot 已有 App Server read model + frontend normalizer guard；frontend normalizer 已按 explicit `position` 恢复多 queued turn 顺序，同 position 或 legacy 缺 position 时保持输入稳定顺序；App Server oracle 已证明多 queued read model 顺序、pop-front resume 后剩余 queued reindex 为 `position=0`，且 top-level `queued_turns` 与 `thread_read.queued_turns` hydrate 同构；pending steer rich restore 已有 devserver Electron Gate B 证据。删除“只看 running flag”的 restore fallback 前，还要补 packaged dist 版 pending steer rich restore 和 Electron 多 pending steer 证据，避免只验证单个 queued draft。

当前细节缺口优先级：

1. `startup-prewarm-first-output` / `reasoning-first-visible` / `running-status-preserved` 的首字、reasoning、输出中状态证据继续前置，避免又把“启动说明闪现”当作首字占位。
2. `pending-steer-queue` Electron 多 pending steer 证据。
3. packaged dist 版 pending steer rich restore evidence。
4. 删除旧 input restore fallback 前的 governance guard。

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
npx vitest run "internal/roadmap/test/clawstream/scenario-registry.test.mjs"
git diff --check -- ".gitignore" "internal/roadmap/test/clawstream/README.md" "internal/exec-plans/clawstream-codex-derived-guardrail-plan.md" "internal/exec-plans/clawstream-s1-p0-implementation-plan.md"
rg -n "[ \t]+$" ".gitignore" "internal/roadmap/test/clawstream/README.md" "internal/exec-plans/clawstream-codex-derived-guardrail-plan.md" "internal/exec-plans/clawstream-s1-p0-implementation-plan.md"
```

## 7. 删除准入

| 删除对象 | 准入 |
| --- | --- |
| startup note / 启动说明闪现 | W1 + W4 通过，guard 禁止启动说明文案回流 |
| completion suffix 盲追加 | W1 通过，completed 不合成正文 |
| 无 turnId terminal fallback | W3 通过，旧 terminal 不误停新 active stream |
| 多套 input restore fallback | W2 pure + component guard + rich restore Electron current fixture + pending steer rich restore 证据均通过，恢复矩阵有单一 owner |
| “有正文就完成”的 UI 判断 | W4 通过，running status 与 visible answer 分离 |

删除时必须同时回写 `scenario-ledger.md` 的清理目标状态；没有账本行的旧实现先登记，不在 S1 顺手删除。

## 8. 进度日志

### 2026-07-07

- `startup-prewarm-first-output` 推进到 `covered-electron`：补 Agent UI performance unit guard，证明 `streamRequestStartToFirstTextPaintMs` / `submitAcceptedToFirstTextPaintMs` / `firstEventToFirstTextPaintMs` / `homeInputToFirstTextPaintMs` / `firstTextDeltaToFirstTextPaintMs` 与 provider wait / client local output 分离汇总；加严 Electron current fixture 公共断言，text-stream 场景必须导出 first visible output marker 且不导出 raw payload。首次实跑暴露默认 GUI composer 路径没有 `homeInput.submit`，随后补通用 first visible marker 并复跑 `npm run smoke:claw-chat-current-fixture -- --scenario complete --timeout-ms 240000` 通过，session=`claw-chat-current-1783395755343-32569`。
- `reasoning-first-visible` 推进到 `covered-electron`：先补 `clawstream reasoning-first-visible` timeline DOM 回归，完成态 reasoning hydrate 后默认只显示 summary，展开后才显示 raw reasoning，summary/raw 各只出现一次；随后新增 Electron current `reasoning-first-visible` fixture，后端先发 reasoning item、延迟 final answer，再验证 GUI 中间态 `hasFinalText=false / hasDoneText=false / startupNoteVisible=false` 且可见 `思考中 / 正在输出`，完成态 `reasoningIndex=38 < finalAnswerIndex=63`，read model `reasoningSequence=1 < finalSequence=9`。验证通过：`npm run smoke:claw-chat-current-fixture -- --scenario reasoning-first-visible --timeout-ms 240000`，session=`claw-chat-current-1783403517680-48086`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`。
- `no-natural-language-lifecycle-regex` 推进到 `partial+guard`：核心 Claw 投影 owner 已由 `streamingProjectionGuard.unit.test.ts` 禁止展示文案、正文正则、动态 regex 和旧 duplicate helper 回流；剩余细节是扩大扫描面并删除旧 helper。
- `terminal-contract-after-answer` 推进到 `covered-electron` 骨架：保留 projection 层 `turn.completed` 不合成正文 / 无 assistant text fail closed oracle，并新增 hook/runtime guard，证明 `turn_failed` 在已有 partial answer 时只补一个失败说明、保留过程卡、不重复 error；新增 Electron current `terminal-failed-after-answer` 场景，后端先发 partial 再发 `turn.failed`，GUI / read model / backend ledger 均证明失败终态保留已输出内容且不重复。验证通过：`npm run smoke:claw-chat-current-fixture -- --scenario terminal-failed-after-answer --timeout-ms 240000`，session=`claw-chat-current-1783408449429-62469`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`。
- `terminal-contract-after-answer` 追加 canceled 独立 Electron current 骨架：新增 `terminal-canceled-after-answer` 场景，后端先发 partial 并等待 GUI stop，`turnCancel` 走 current `turn.canceled`，GUI / read model / backend ledger 证明 stop 前 partial 与 running 同屏、取消后 partial 保留且只出现一次、输入框恢复、read model 标记 `canceled`。验证通过：`LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:claw-chat-current-fixture -- --scenario terminal-canceled-after-answer --timeout-ms 240000`，session=`claw-chat-current-1783417713111-42454`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`。未设 `LIME_ELECTRON_FIXTURE_BUILD_READY` 的首次运行在 packaged renderer/assets build 阶段以 `143/SIGTERM` 退出，未进入场景执行；`final_done` grace timer 删除留作真实旧 terminal owner 投影细节之后。
- `stale-terminal-does-not-stop-new-turn` 推进到 `covered-electron` 骨架：新增 Electron current `terminal-stale-guard` 场景，第一轮和第二轮均通过 GUI 输入、App Server current read model 完成；第二轮 backend ledger 记录旧 terminal marker，GUI 断言 stale done marker 不可见、第二轮 done marker 可见且输入框恢复。验证通过：`npm run smoke:claw-chat-current-fixture -- --scenario terminal-stale-guard --timeout-ms 240000`，session=`claw-chat-current-1783406820348-36412`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-summary.json`。真实旧 terminal event 注入 owner 投影仍作为下一轮细节补强。
- registry 状态统计保持 `covered-electron=13 / partial+guard=5 / partial=5 / missing=36 / guard-needed=0`。代码体量风险仍登记：`scripts/agent-runtime/claw-chat-current-fixture-backend-file.mjs`、`claw-chat-current-fixture-scenario-flow.mjs`、`claw-chat-current-fixture-scenario-assertions.mjs`、`claw-chat-current-fixture-smoke.test.mjs` 均已超过 `1000` 行；本轮按主线骨架最小分支接线，下一刀回头拆 scenario modules，中心 flow 只保留 dispatch。
- 验证通过：`npx vitest run "src/components/agent/chat/hooks/agentStreamRuntimeHandler.unit.test.ts"`（55 tests passed）；`npx vitest run "src/components/agent/chat/hooks/agentStreamCompletionController.test.ts"`（26 tests passed）；`npx vitest run "src/components/agent/chat/hooks/agentStreamTerminalTurnGuard.unit.test.ts"`（8 tests passed）；`node --test "packages/agent-runtime-projection/tests/clawstreamP0.test.mjs"`（6 tests passed）；`npx vitest run "internal/roadmap/test/clawstream/scenario-registry.test.mjs"`（6 tests passed）。
- W2 rich restore Electron current fixture 收口：修正 Inputbar 恢复请求和发送成功回调的竞态，恢复 request 调度递增 epoch，旧发送成功回调不再清理已恢复的 images / pathReferences / skill route；父层同步恢复 `input` 与 `pathReferences`。
- 修复 Electron `file://` 下 renderer 启动卡住：`scripts/electron/build-renderer.mjs` 与 `scripts/electron/build-renderer-smoke.mjs` 显式使用 `vite build --base ./`，避免 `dist/index.html` 生成 `/assets/...` 导致 Electron 加载空壳。
- `inputbar-rich-restore` fixture 断言改为绑定本场景 `turnStart`，取消事件必须匹配同一 `sessionId / turnId`，不再依赖动态 `SESSION_ID` 跨进程常量。
- Gate B 验证通过：`APP_SERVER_BIN="/Users/coso/Documents/dev/ai/aiclientproxy/lime/dist-electron/app-server/darwin-arm64/app-server" npm run smoke:claw-chat-current-fixture -- --scenario inputbar-rich-restore --timeout-ms 180000`，session=`claw-chat-current-1783381197658-93694`。该证据覆盖真实 Electron Desktop Host、preload/IPC、`app_server_handle_json_lines`、App Server JSON-RPC、external fixture backend、read model 与 GUI 可见状态。
- 结构守卫与卫生检查通过：`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（27 tests passed）；`git diff --check`。
- W2 pending steer rich snapshot guard 落地：App Server queued read model 从 current `turn_inputs + turn_runtime_options.metadata` 投影 `attachments / pathReferences / textElements / inputCapabilityRoute`；前端 `queuedTurn` normalizer 与 restore policy 保留这些字段，发送准备会把 input restore draft 的 path references、text elements 和 skill route 写入 current turn metadata。
- 定向验证通过：`npx vitest run "src/lib/api/queuedTurn.test.ts" "src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts" "src/components/agent/chat/hooks/agentStreamUserInputSendPreparation.test.ts" "src/components/agent/chat/components/Inputbar/hooks/useInputbarSend.test.tsx"`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server read_session_projects_queued_turn_input_snapshot -- --nocapture`。
- 聚合 current fixture 通过：`npm run smoke:agent-runtime-current-fixture`，覆盖 Inputbar rich restore、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills / Plaza / Panel、Content Factory Article Editor，`liveProviderUsed=false`。
- `scenario-ledger.md` 中 `inputbar-restore-matrix` 保持 `partial+guard`：rich restore 已有 Electron Gate B 证据；pending steer rich snapshot 已有 current read model / frontend guard；pending steer rich restore 已补 devserver Electron Gate B 证据。packaged dist 版 pending steer rich restore 与多 pending steer 顺序 / hydrate oracle 仍未补齐，因此还不能一次性删除全部 input restore 旧实现。
- W2 pending steer rich restore devserver Electron Gate B 收口：`inputbarPendingSteerQueuedRichTextPreserved` 断言改为按 current read model 的结构化 `textElementTexts` 验证用户可编辑正文，允许 queued raw `text` 保留 `/capability-report` slash command 前缀；该口径对齐 Thread/Turn/Item projection，不再把 raw dispatch text 当成 Inputbar textarea truth。
- 验证通过：`node --check "scripts/agent-runtime/claw-chat-current-fixture-scenario-assertions.mjs"`；`npx vitest run "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs"`（28 tests passed）；`npm run smoke:claw-chat-current-fixture -- --app-url "http://127.0.0.1:1420/" --scenario inputbar-pending-steer-rich-restore --prefix claw-chat-current-fixture-inputbar-pending-steer-rich-restore-devserver-text-element-assertion --timeout-ms 180000`，session=`claw-chat-current-1783389967237-36808`，summary=`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-inputbar-pending-steer-rich-restore-devserver-text-element-assertion-summary.json`。
- 继续收口用户截图中的 reopen / terminal 卡住问题：前端 session read model 现在优先识别 `completed / failed / aborted / canceled` 等终态，terminal read model 不再因残留 `active_turn_id` 或本地 stale running 被判定为 running；terminal read model 也不会重新绑定恢复 active stream。`canceled` 保持由停止后的输入恢复链自行收口，避免 stop 后输入框恢复被同步强清。
- EmptyState / Inputbar 富草稿恢复补齐：中断恢复改为同步 apply；空态输入框恢复 text / image / path / skill；发送成功清理带 epoch，避免旧 send promise 清掉已恢复草稿；EmptyStateComposerPanel 不再抢先标记 restore request handled。
- 定向回归通过：`npm test -- --run src/components/agent/chat/components/Inputbar/index.test.tsx src/components/agent/chat/components/Inputbar/hooks/useInputbarSend.test.tsx src/components/agent/chat/components/EmptyState.test.tsx src/components/agent/chat/hooks/agentStreamFlowControl.test.ts src/components/agent/chat/hooks/agentStreamInputRestorePolicy.unit.test.ts`（172 tests passed）；`npm test -- --run src/components/agent/chat/workspace/workspaceSceneSessionProjection.unit.test.ts src/components/agent/chat/hooks/agentSessionState.test.ts src/components/agent/chat/hooks/agentStreamResumeBinding.test.ts src/components/agent/chat/hooks/useAgentRuntimeSyncEffects.test.tsx`（58 tests passed）；`npm test -- --run scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs`（27 tests passed）。
- Electron current fixture 与 CDP 证据通过：`node scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs --scenario inputbar-rich-restore --prefix claw-chat-current-fixture-inputbar-rich-restore-fixed-built --timeout-ms 240000` 通过，证据 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-inputbar-rich-restore-fixed-built-summary.json`；CDP Gate B 证据 `.lime/cdp-evidence/agent-terminal-rich-restore-cdp-summary.json`，`ok=true`、`proofLevel=Gate B`。
- 聚合 current fixture 复跑通过：`npm run smoke:agent-runtime-current-fixture` 覆盖 history/cache hydration、final_done 工具收尾、failed read model、Claw 终态 UI、Electron fixture guard、Coding Workbench、图片命令、普通画图意图、`cancel-then-continue`、`inputbar-rich-restore`、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、Expert Skills / Plaza / Panel、Content Factory Article Editor，`liveProviderUsed=false`。关键证据：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-inputbar-rich-restore-regression-summary.json`、`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-cancel-then-continue-regression-summary.json`。
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
