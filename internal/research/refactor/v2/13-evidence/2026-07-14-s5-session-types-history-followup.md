# S5 Session Types History Follow-up

时间：2026-07-15

## 结论

8 个 Agent Chat history helper 已从 `@/lib/api/agentRuntime` compat 根 barrel
迁到唯一 current owner `@/lib/api/agentRuntime/sessionTypes`。本切片只改变
`AgentSessionDetail` 的类型 import owner，不改变历史 hydration、timeline merge、artifact、
read model 或 token usage 行为。

## 写集

- `hooks/agentChatHistoryArtifacts.ts`
- `hooks/agentChatHistoryHydrate.ts`
- `hooks/agentChatHistoryNormalize.ts`
- `hooks/agentChatHistoryReadModel.ts`
- `hooks/agentChatHistoryTimelineBasics.ts`
- `hooks/agentChatHistoryTimelineMerge.ts`
- `hooks/agentChatHistoryTypes.ts`
- `hooks/agentChatHistoryUsage.ts`
- `sessionTypesCurrentBoundary.test.ts`

Active S2l 拥有的 `agentChatHistoryThreadItems.ts`、S7、共享脏的
`useAgentChat`/`WorkspaceConversationScene`、Electron、Rust、App Server protocol 和
provider 行为均未触碰。

## 分类

- `current`：`src/lib/api/agentRuntime/sessionTypes.ts` 与上述直接消费者。
- `compat`：`agentRuntime` package root 仍服务尚未迁出的 consumer，本轮不扩展它。
- `dead / retired guard-only`：上述 8 个 consumer 对 root compat barrel 的直接 import，
  由扩展后的 `sessionTypesCurrentBoundary.test.ts` 防回流。
- `deprecated`：无新增。

## 验证

- focused boundary Vitest：1 file / 1 test passed。
- exact-set ESLint passed。
- boundary test Prettier passed。
- `npm run typecheck` passed。
- `npm run governance:legacy-report` passed：0 zero-reference candidates / 0 drift /
  0 boundary violations。
- claimed production write set `git diff --check` passed。
- 8 个生产文件 `git diff --numstat` 均为 `1 1`，并通过 production import-only diff review。
- 过滤 test/fixture 后，Agent Chat root compat import consumer 从 60 降到 52。

本切片没有用户可见、Bridge、协议或 GUI 行为变化，因此未升级到 GUI smoke；后续
Refactor V2 聚合门禁仍由 coordinator 在 active S2l/S7 写集稳定后执行。

## 下一刀

继续迁出剩余 13 个 clean `sessionTypes` consumer，随后处理 `sessionClient`、
`requestTypes` 与 `agentClient` 单 owner consumer；混合 owner 文件需要独立窄切片，
不得为减少 diff 继续依赖 compat 根 barrel。
