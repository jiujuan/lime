# S5 Low-risk Mixed Owner Follow-up

时间：2026-07-15

## 结论

8 个 Agent Chat consumer 已从 `@/lib/api/agentRuntime` compat 根 barrel 拆到
`agentExecutionRuntime`、`sessionTypes`、`queuedTurn`、`sessionClient` 与
`@limecloud/app-server-client` current owners。`RuntimeSearchMode` 不再经 Lime compat
barrel 转发；session update 行为与 thread-read DTO 也分别直连行为/类型 owner。

本切片只改变 imports，不改变类型 identity、发送、恢复、工作台行为或 provider
lowering。

## 写集

- `hooks/handleSendTypes.ts`
- `hooks/agentStreamPreparedSendEnv.ts`
- `hooks/agentStreamRuntimeHandlerTypes.ts`
- `workspace/workspaceConversationCodingViews.tsx`
- `hooks/agentSessionTopicViewModel.ts`
- `utils/submitOpRuntimeCompaction.ts`
- `hooks/agentStreamUserInputSendPreparation.ts`
- `workspace/useWorkspaceArticleEditorRightSurfaceRuntime.ts`
- execution、queue、session、client 与 RuntimeSearchMode 共 5 个 boundary tests

Active S2m/S7、共享脏 root consumers、未跟踪 S6 navigation 文件、Electron、Rust、
App Server protocol 和 provider 行为均未触碰。

## 分类

- `current`：上述 direct owners 与 8 个直接 consumers。
- `compat`：`agentRuntime` package root 仍服务尚未迁出的 consumer，本轮不扩展它。
- `dead / retired guard-only`：上述 8 个 consumer 对 root compat barrel 的直接 import，
  由扩展/新增的 5 个 boundary tests 防回流。
- `deprecated`：无新增。

## 验证

- focused boundary Vitest：5 files / 5 tests passed。
- exact-set ESLint passed。
- boundary tests Prettier passed。
- `npm run typecheck` passed。
- `npm run governance:legacy-report` passed：0 zero-reference candidates / 0 drift /
  0 boundary violations。
- claimed production write set `git diff --check` passed。
- 生产文件 diff 分别为 5 个 `2/2`、2 个 `2/4`、1 个 `1/1`，
  并通过 production import-only diff review。
- 过滤 test/fixture 后，Agent Chat root compat import consumer 从 35 降到 27。

本切片没有用户可见、Bridge、协议或 GUI 行为变化，因此未升级到 GUI smoke。

## 下一刀

剩余 5 个 clean consumer 都是三-owner stream 类型组合：`agentChatShared.ts`、
`agentStreamResumeBinding.ts`、`agentStreamTurnEventBinding.ts`、`useAgentStream.ts` 与
`buildUserInputSubmitOp.ts`。应在独立切片一次拆到 execution/session/queue/search owner；
其余 22 个 root consumer 等待并行 owner 释放。
