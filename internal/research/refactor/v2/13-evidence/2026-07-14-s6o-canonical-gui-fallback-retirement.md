# S6o canonical GUI fallback retirement

日期：2026-07-14

## 事实源

Harness、AgentRuntimeStrip 和 Workspace Harness 的子任务 roster 统一消费
`CanonicalChildThreadSummary[]`。它来自 App Server canonical child Thread/read-model
投影，保留 `threadId`、`sessionId`、Codex 七态和状态详情；空 roster 表示没有可展示的
子任务，不再回退到 session DTO。

## 本轮收口

- 删除 Harness panel prop 链中的 `AgentSubagentSessionInfo` / `childSubagentSessions`。
- 删除 `RuntimeSubagentSessionList`、legacy 状态标签/Badge/type helper 和
  `summarizeChildSubagentSessions`。
- `HarnessStatusPanel` summary、activity、delegation、Workspace surface 只接收
  canonical children；`AgentChatWorkspace` 的 general workbench 接线只传
  `canonicalChildren`。
- legacy 正向测试改为 canonical roster 与空 roster 回归；新增
  `canonicalRosterFallbackBoundary.test.ts` 防止 GUI owner 回流。

## 分类

- `current`：App Server canonical child Thread -> `CanonicalChildThreadSummary[]` ->
  Harness/AgentRuntimeStrip/Workspace GUI。
- `dead / retired guard-only`：旧 child-session prop、DTO display list、runtime status
  helper 和 legacy summary fallback。没有新增 compat 包装层。
- `compat`、`deprecated`：本轮未新增；task rail/inputbar/session state 中仍存在的
  legacy roster 用途不属于本 slice，留给后续独立迁移。

## 验证

- focused Vitest：5 files / 49 tests passed。
- `npm run typecheck` passed。
- exact-set ESLint and Prettier passed。
- `npm run i18n:unused` passed。
- `npm run governance:legacy-report` passed：0 zero-reference candidates / 0 drift / 0 boundary violations。
- `npm run verify:gui-smoke` passed：renderer build、Electron host/preload、App Server sidecar ready、workbench shell/memory smoke。
- `git diff --check` passed；GUI owner legacy identifier scan has no matches。

## 并行协作

`AgentChatWorkspace.tsx` 同时由另一进程推进 S6p-a navigation/runtime-strip 变更；本轮只修改
general workbench panel 的 roster 参数，未覆盖其 navigation hunk。上述验证反映共享工作树，
不将其他进程的改动归入本 slice。

## 下一刀

迁移 `agentTaskRuntime.ts`、`inputbarRuntimeStatusLine.ts`、Task Rail 和 conversation
scene 的 subtask stats 到 `CanonicalChildThreadSummary[]`，再删除 session state/DTO 的
legacy roster contract。
