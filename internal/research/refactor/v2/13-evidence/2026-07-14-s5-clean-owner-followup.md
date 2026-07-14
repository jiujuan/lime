# S5 Agent Runtime Clean Owner Follow-up

时间：2026-07-15

## 结论

9 个 Agent Chat consumer 已从 `@/lib/api/agentRuntime` compat 根 barrel 迁到各自
唯一 current owner：5 个 DTO consumer 直连 `sessionTypes`，2 个 session update consumer
直连 `sessionClient`，replayed action 类型直连 `requestTypes`，title 生成行为直连
`agentClient`。本切片只改变 import owner，不改变类型、调用参数、运行时行为或 provider
lowering。

## 写集

- `hooks/agentSessionTimelineMergePolicy.ts`
- `hooks/agentSilentTurnRecovery.ts`
- `hooks/sessionHistoryMergeController.ts`
- `workspace/imageCommandIntent.ts`
- `workspace/imageWorkbenchTaskActions.ts`
- `workspace/useSessionRecentMetadataSyncRuntime.ts`
- `workspace/useWorkspaceRightSurfaceHostRuntime.ts`
- `hooks/agentChatActionState.ts`
- `workspace/useWorkspaceImageWorkbenchCommandActionRuntime.ts`
- `sessionTypesCurrentBoundary.test.ts`
- `agentRuntimeClientOwnerBoundary.test.ts`

Active S2m/S7、共享脏的 `useAgentChat`/`WorkspaceConversationScene`、Electron、Rust、
App Server protocol 和 provider 行为均未触碰。

## 分类

- `current`：`sessionTypes`、`sessionClient`、`requestTypes`、`agentClient` 与上述直接
  consumers。
- `compat`：`agentRuntime` package root 仍服务尚未迁出的 consumer，本轮不扩展它。
- `dead / retired guard-only`：上述 9 个 consumer 对 root compat barrel 的直接 import，
  由两个 current-owner boundary tests 防回流。
- `deprecated`：无新增。

## 验证

- focused boundary Vitest：2 files / 2 tests passed。
- exact-set ESLint passed。
- boundary tests Prettier passed。
- `npm run typecheck` passed。
- `npm run governance:legacy-report` passed：0 zero-reference candidates / 0 drift /
  0 boundary violations。
- claimed production write set `git diff --check` passed。
- 9 个生产文件 `git diff --numstat` 均为 `1 1`，并通过 production import-only diff review。
- 过滤 test/fixture 后，Agent Chat root compat import consumer 从 52 降到 43。

本切片没有用户可见、Bridge、协议或 GUI 行为变化，因此未升级到 GUI smoke。

## 下一刀

剩余 43 个 consumer 以混合 owner 文件为主。后续应逐文件拆到 `sessionTypes`、
`agentExecutionRuntime`、`queuedTurn`、`sessionClient`、`threadClient` 与协议 DTO owner；
不得通过扩展 root barrel 或新增 compat 包装层规避拆分。
