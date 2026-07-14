# S5 Stream Runtime Current Owner Follow-up

时间：2026-07-14

## 结论

2 个 queued-turn consumer 已从 `@/lib/api/agentRuntime` compat 根 barrel 迁到
`@/lib/api/queuedTurn`；6 个 execution runtime consumer 已迁到
`@/lib/api/agentExecutionRuntime`。本切片只改变 TypeScript 类型 import owner，
不改变 stream lifecycle、access mode、tool preference 或 Workspace 行为。

## 写集

- `hooks/agentStreamFlowControl.ts`
- `hooks/agentStreamSubmissionLifecycle.ts`
- `components/Inputbar/components/InputbarModelExtra.tsx`
- `hooks/agentStreamRuntimeContextController.ts`
- `hooks/agentStreamRuntimeHandlerActions.ts`
- `utils/accessModeRuntime.ts`
- `utils/submitOpToolPreferenceCompaction.ts`
- `workspace/useWorkspaceChatToolPreferencesRuntime.ts`
- `hooks/queuedTurnCurrentBoundary.test.ts`
- `utils/executionStrategyCurrentBoundary.test.ts`

S2l/S7 active files、S6 roster/canonical family、Electron、Rust、App Server protocol 和
provider 行为均未触碰。

## 分类

- `current`：`src/lib/api/queuedTurn.ts`、`src/lib/api/agentExecutionRuntime.ts`
  与上述直接消费者。
- `compat`：`agentRuntime` package root 仍服务尚未迁出的 consumer，本轮不扩展它。
- `dead / retired guard-only`：上述 8 个 consumer 对 root compat barrel 的直接 import，
  由扩展后的两个 boundary tests 防回流。
- `deprecated`：无新增。

## 验证

- focused boundary Vitest：2 files / 2 tests passed。
- exact-set ESLint passed。
- boundary tests Prettier passed。
- `npm run typecheck` passed。
- `npm run governance:legacy-report` passed：0 zero-reference candidates / 0 drift /
  0 boundary violations。
- claimed write set `git diff --check` passed。
- 8 个生产文件 `git diff --numstat` 均为 `1 1`，并通过 production import-only diff review。

## 下一刀

继续按 current owner 迁出剩余 Agent Chat root-barrel consumers；优先选择干净的
queued-turn/execution-runtime consumer，避让 S2l history repair、S7 refinement 与共享脏文件。
