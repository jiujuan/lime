# S5 Execution Strategy Stream Follow-up

时间：2026-07-14

## 结论

8 个 Agent Chat stream/session controller consumer 已从
`@/lib/api/agentRuntime` compat 根 barrel 迁到唯一 current owner
`@/lib/api/agentExecutionRuntime`。本切片只改变 `AgentExecutionStrategy`
类型 import owner，不改变 stream、queue、session finalize 或 metadata sync 行为。

## 写集

- `hooks/agentStreamEventProcessorAuxiliary.ts`
- `hooks/agentStreamQueueController.ts`
- `hooks/agentStreamRuntimeStatusController.ts`
- `hooks/agentStreamSubmitContext.ts`
- `hooks/agentStreamSubmitDraft.ts`
- `hooks/sessionFinalizeController.ts`
- `hooks/sessionMetadataSyncController.ts`
- `hooks/useAgentContext.ts`
- `utils/executionStrategyCurrentBoundary.test.ts`

Active S2l history repair、S6s session roster contract、Electron、Rust、App Server protocol
和 provider stream 行为均未触碰。

## 分类

- `current`：`src/lib/api/agentExecutionRuntime.ts` 与上述直接消费者。
- `compat`：`agentRuntime` package root 仍服务尚未迁出的 consumer，本轮不扩展它。
- `dead / retired guard-only`：上述 8 个 consumer 对 root compat barrel 的直接 import，
  由扩展后的 `executionStrategyCurrentBoundary.test.ts` 防回流。
- `deprecated`：无新增。

## 验证

- focused boundary Vitest：1 file / 1 test passed。
- exact-set ESLint passed。
- boundary test Prettier passed。
- `npm run typecheck` passed。
- `npm run governance:legacy-report` passed：0 zero-reference candidates / 0 drift /
  0 boundary violations。
- claimed write set `git diff --check` passed。
- 8 个生产文件 `git diff --numstat` 均为 `1 1`，并通过 production import-only diff review。

共享树同时有 S6s session roster owner 工作，因此全局 root-barrel 计数仅作共享状态；
本切片归属固定为上述 8 个生产文件。

## 下一刀

继续按 current owner 迁出剩余 Agent Chat root-barrel consumers；优先选择不与 S2l/S6s
重叠的 queued-turn 或 execution-strategy 纯 import consumer。S6s 完成后回到 canonical
Thread parent identity，物理删除剩余 parent-context contract。
