# S1c Image Domain Side-channel Evidence

> date: 2026-07-12
> owner: refactor-v2-coordinator
> status: ready-for-review

## Problem

Renderer sequence gate 在 canonical lifecycle cutover 后只允许缺少 `canonicalEvent` 的 provider diagnostic。S4f 明确保留的 `runtime.status`、`image_task.presentation.generated` 与 `image_task.created` 因此在既有 payload projection 之前被静默丢弃。后端 event log、canonical ThreadStore、Tool output 与 image task artifact 均正确，但 GUI 只显示 assistant intro，没有图片任务卡。

## Change

- `eventSequenceGate.ts` 使用显式 current 非 Thread side-channel allowlist。
- allowlist 仅包含 provider diagnostic、`runtime.status` 与 current `image_task` presentation/create/parameters-required 事件。
- 未知 raw event 与 raw Thread lifecycle 继续 fail-closed。
- canonical Tool Item 的 in-progress/completed 序列继续经过统一 verifier，并投影为同 call identity 的 `item_started/item_completed`。
- command contract 守卫同步 canonical Tool Item 可直接创建 message tool card 的新函数名。

## Validation

- focused Vitest: 13/13 passed，包括 raw negative guards、image task projection、canonical Tool sequence、nested Tool projection 与 message tool card sync。
- `npm run typecheck`: passed。
- image command Electron Gate B: passed；summary 为 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-image-command-regression-summary.json`。
- Gate B 证明 GUI running card、terminal preview、真实图片像素、canonical read model completed Tool、task artifact/audit、reload restore 全部通过。
- aggregate current fixture 已继续通过 home、greeting、Coding Workbench、image command、plain image intent 与 cancel-then-continue；随后 approval resume 在 `action.required` 前因 fixture Provider 鉴权失败退出。
- `npm run governance:legacy-report`: 2420 scanned files，classification drift 0，boundary violation 0。
- `git diff --check`: passed。
- `npm run test:contracts`: 本轮 tool-card guard 已修正；全门禁仍受 active S5d Plugin canonical read adapter 三个缺失断言阻塞。

## Classification

- current: canonical Thread/Turn/Item lifecycle、explicit non-Thread side-channel allowlist、image task GUI projection。
- compat: conversation import 范围内冻结的旧 tool event，不由本 slice 扩展。
- deprecated: App Server notification envelope 中的 raw lifecycle/typed summary，不新增 consumer。
- dead/deleted: live raw Tool lifecycle 与 tool terminal fanout，不得恢复。
