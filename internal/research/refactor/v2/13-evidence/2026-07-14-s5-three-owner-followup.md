# S5 Three-owner Follow-up

时间：2026-07-15

## 结论

最后 5 个 clean Agent Chat root compat consumers 已从 `@/lib/api/agentRuntime` 拆到
`agentExecutionRuntime`、`sessionTypes`、`queuedTurn` 与
`@limecloud/app-server-client` current owners。S5 当前可安全修改的 clean backlog 已清空；
剩余 22 个生产 root imports 全部已脏或未跟踪，归并行 owner 持有。

本切片只改变 type imports，不改变 stream、send、resume、message projection 或 provider
lowering。

## 写集

- `hooks/agentChatShared.ts`
- `hooks/agentStreamResumeBinding.ts`
- `hooks/agentStreamTurnEventBinding.ts`
- `hooks/useAgentStream.ts`
- `utils/buildUserInputSubmitOp.ts`
- execution、queue、session 与 RuntimeSearchMode 共 4 个 boundary tests

Active S2m/S7、22 个共享脏/未跟踪 root consumers、Electron、Rust、App Server protocol
和 provider 行为均未触碰。

## 分类

- `current`：execution/session/queue/app-server protocol direct owners 与上述 consumers。
- `compat`：`agentRuntime` package root 仍被 22 个并行脏 consumer 使用；本轮不扩展它。
- `dead / retired guard-only`：上述 5 个 consumer 对 root compat barrel 的直接 import，
  由扩展后的 4 个 boundary tests 防回流。
- `deprecated`：无新增。

## 验证

- focused boundary Vitest：4 files / 4 tests passed。
- exact-set ESLint passed。
- boundary tests Prettier passed。
- `npm run typecheck` passed。
- `npm run governance:legacy-report` passed：0 zero-reference candidates / 0 drift /
  0 boundary violations。
- claimed production write set `git diff --check` passed。
- 生产文件 diff 为 3 个 `3/3` 与 2 个 `4/2`，并通过 import-only diff review。
- 过滤 test/fixture 后，Agent Chat root compat import consumer 从 27 降到 22。

本切片没有用户可见、Bridge、协议或 GUI 行为变化，因此未升级到 GUI smoke。

## 剩余阻塞

剩余 root imports 位于 Harness/Task Rail/MessageList、session/adapter、S2m history、
Workspace scene/send/navigation 等共享脏区。它们必须等待各自 owner 释放后继续迁移；当前
进程不夹写，也不通过扩展 root barrel 增加 compat。

## 下一刀

回到 S7 refinement 行政 closeout与 S2m handoff；S5 下一轮只在 22 个文件释放后恢复。
