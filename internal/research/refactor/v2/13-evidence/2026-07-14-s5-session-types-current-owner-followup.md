# S5 Session Types Current Owner Follow-up

时间：2026-07-14

## 结论

8 个 Agent Chat session/read DTO consumer 已从 `@/lib/api/agentRuntime` compat 根 barrel
迁到唯一 current owner `@/lib/api/agentRuntime/sessionTypes`。本切片只改变
`AutoContinueRequestPayload`、`AgentSessionDetail` 和
`AgentRuntimeFileCheckpointThreadSummary` 的类型 import owner，不改变发送、恢复或工作台行为。

## 写集

- `components/Inputbar/inputbarSendPayload.ts`
- `utils/sessionExecutionRuntime.ts`
- `workspace/CodingWorkbenchOutputPanel.tsx`
- `workspace/codingWorkbenchRecovery.ts`
- `workspace/knowledge/useWorkspaceKnowledgeRuntime.ts`
- `workspace/useWorkspaceCanvasWorkflowActions.ts`
- `workspace/workspaceConversationSessionViewModel.ts`
- `workspace/workspaceConversationWorkbenchViewModel.ts`
- `sessionTypesCurrentBoundary.test.ts`

Active S2l/S7、共享脏的 `useAgentChat`/`WorkspaceConversationScene`、Electron、Rust、
App Server protocol 和 provider 行为均未触碰。

## 分类

- `current`：`src/lib/api/agentRuntime/sessionTypes.ts` 与上述直接消费者。
- `compat`：`agentRuntime` package root 仍服务尚未迁出的 consumer，本轮不扩展它。
- `dead / retired guard-only`：上述 8 个 consumer 对 root compat barrel 的直接 import，
  由 `sessionTypesCurrentBoundary.test.ts` 防回流。
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

## 下一刀

继续按 `sessionTypes`、`agentExecutionRuntime` 与 `queuedTurn` owner 迁出剩余 root-barrel
consumer；优先选择 clean 单 owner 文件，避让 S2l history repair、S7 refinement 和共享脏区。
