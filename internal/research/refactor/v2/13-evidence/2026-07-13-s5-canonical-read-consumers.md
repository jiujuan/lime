# S5 canonical Thread read consumers

> status: focused-contracts-and-Gate-B-validated
> verified_at: 2026-07-13
> owner: refactor-v2-coordinator

## 目标

把 GUI queue control 与 Plugin task get/cancel/reload 切到 canonical
`thread/read { threadId, turnsView: "full" }`，禁止 session-as-thread、
`agentSession/read` Turn truth 和 legacy `thread_read/tool_calls` fallback。

## 已收敛事实

- `S2h`：`queue.added` 物化为 `InProgress + Queued`，`queue.removed`
  按 queuedTurnId 删除，`queue.promoted` 不制造 phantom Turn，后续
  `turn.started` 推进为 Running。
- `S5c`：package 与 Renderer queue-control projection 只消费 canonical
  full Thread；identity、hydration、duplicate、multiple-active 与 queue/status
  非法时 fail closed。
- `S5d`：Plugin 从 `startTurn.result.turn.threadId` 建立唯一 identity，贯穿
  持久化、reload、get/cancel；缺 threadId、lookup 冲突、错误 turn identity、
  queued/terminal/multiple-active 均拒绝或返回 `not_running`。
- `S5e`：terminal Turn 可以保留 historical Running/NotQueued，但不会成为
  active；terminal + Queued 仍 fail closed。
- `S5f`：同会话 active stream 已有真实 turnId 时，后续 submit 直接进入
  queue intent；queued listener 不覆盖 active binding，accepted 后立即释放并
  refresh canonical read model，不再等待 120 秒 inactivity watchdog。

## 当前工作树验证

```text
npx vitest run \
  src/features/plugin/runtime/agentRuntimeAppServerClient.test.ts \
  src/features/plugin/runtime/agentRuntimeClientApi.test.ts \
  src/features/plugin/runtime/agentRuntimeCapabilityHost.test.ts
PASS: 3 files, 26 tests

npm run typecheck
PASS

S5c projection + adapter + flow focused
PASS: 32 tests

S5f queue intent + queued submit lifecycle focused
PASS: 10 files, 77 tests

npm run test:contracts
PASS: app-server-client contract 289 checks and all downstream contract gates

npm run verify:gui-smoke
PASS: Renderer + Electron Host/preload + App Server sidecar
```

首次 `npm run test:contracts` 在 S5d review-fix 前失败，原因是
`scripts/check-app-server-client-contract.mjs` 仍正向要求已删除的
`threadReadFromAgentSessionRead`、nested `thread_read` 与顶层 `tool_calls`
形状。协调者已把对应检查改为 canonical Thread identity、Turn queue/status
和 nested typed Item 守卫；完整 contracts 已在当前工作树重跑通过。

## Gate B evidence

- command：`npm run smoke:claw-chat-current-fixture -- --scenario
  inputbar-pending-steer-pop-front-resume --prefix
  s5f-queued-submit-immediate-hydrate`
- summary：`.lime/qc/gui-evidence/claw-chat-current-fixture/
  s5f-queued-submit-immediate-hydrate-summary.json`
- result：`ok=true`；`2026-07-12T21:43:44.598Z` 开始，
  `2026-07-12T21:43:49.396Z` 完成，约 5 秒闭环。
- initial active Turn：`59e9247f-64a1-4a54-919a-444a8d050c1c`；rich queued
  Turn：`f1f2e5a4-8017-43b3-9156-99affeee631c`。
- 两次 queued submit 均记录 `expectingQueue:true`；promotion 前
  `thread/read` 解析到 initial active Turn，随后真实执行
  `agentSession/queuedTurn/promote -> agentSession/turn/cancel ->
  agentSession/thread/resume`。
- backend ledger：`turnStartCount=2`、`turnCancelCount=1`；reload 后第二个
  queued Turn 保持 position 0；全部 scenario assertions 为 true，
  `actionableConsoleErrors=[]`。

聚合 `npm run smoke:agent-runtime-current-fixture` 已通过 unit/contract guard，
并连续通过 home、greeting、Coding Workbench、image command、plain image intent、
cancel-then-continue 六个真实 Electron 场景；随后被已登记的 approval external
fixture Provider 鉴权失败阻塞。该 blocker 不经过 S5f queue intent，且独立
`npm run verify:gui-smoke` 已通过，因此不回退本 Gate B 结论。

rich `AgentSessionDetail` history/diagnostics/artifact consumer 仍不并入 narrow
queue-control projection；它们按各自迁移 slice 保留 deprecated 状态。

## 治理分类

- `current`：canonical `thread/read`、typed Thread/Turn/Item、S5c narrow
  queue-control projection、S5d persisted thread identity、S5f active-stream
  queue intent 与 immediate canonical hydrate。
- `compat`：无新增。
- `deprecated`：rich `AgentSession` presentation 仅保留未迁 detail family，
  不能再提供 active/queued Turn truth。
- `dead / forbidden-to-restore`：session-as-thread、Plugin readSession fallback、
  nested `thread_read/tool_calls` replay shape、terminal historical queue 作为
  active 的推断、queued submit 覆盖 active stream binding、依赖 120 秒
  watchdog 才 hydrate queued Turn。

## 2026-07-15 Coordinator fresh review

当前共享工作树复核确认 S5d 仍满足原退出条件：`startTurn.result.turn.threadId` 是 Plugin
task identity 的唯一来源，持久化、reload、get/cancel 不接受 session-as-thread；canonical
read 固定为 `readThread({ threadId, turnsView: "full" })`，并对 Thread/session/Turn identity、
重复 Turn、多个 active Turn、queued Turn 与 lookup/persisted identity 冲突 fail closed。

- Plugin focused Vitest：3 files / 26 tests passed。
- `npm run typecheck`：passed。
- `npm run test:contracts`：passed；700 protocol types、288 App Server client checks，
  command/harness/modality/scripts/release/docs guards 全部通过。
- 本轮只读审核 Plugin 源码；未覆盖共享树中其它切片对 import path/format 的脏改动。

Coordinator review 已关闭，S5d 从 `ready-for-review` 转为 `completed / released`。
