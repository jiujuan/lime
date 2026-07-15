# S5 Workspace Current Owner Clean Remainder

日期：2026-07-15

状态：completed / focused-import-boundary-validated / released

## 事实源

Workspace 消费者直接依赖各领域 `current` owner：session/read/todo/auto-continue
归 `agentRuntime/sessionTypes`，execution runtime 归 `agentExecutionRuntime`，搜索模式归
`@limecloud/app-server-client`，thread/session identity 归 `agentRuntime/threadClient`。
`@/lib/api/agentRuntime` 根入口仅为迁移期 `compat` barrel。

## 变更

- `useWorkspaceContextSurfaceRuntime.ts` 将 read model 与 todo 类型迁到 `sessionTypes`。
- `useWorkspaceConversationSceneRuntime.tsx` 和 `useWorkspaceTaskRailRuntime.ts` 将 execution
  runtime 与 session 类型分别迁到 `agentExecutionRuntime` 和 `sessionTypes`。
- `useWorkspaceSendActions.ts` 将 auto-continue 与 `RuntimeSearchMode` 分别迁到
  `sessionTypes` 和 app-server-client。
- `useWorkspaceSubagentNavigationRuntime.ts` 将 `readThreadSessionId` 迁到 `threadClient`。
- 五个文件只改 import；函数体、状态机、请求 payload、GUI 行为和用户可见文案未改变。

初始与 claim 后 clean gate 均确认五个文件 clean。全程避让 dirty
`WorkspaceConversationScene.tsx`、active status-surface 的
`useSessionRuntimeProjectionDeferral.ts`、S7y Approval 写集、中央计划、Electron、App Server、
Rust、协议与 i18n。

## 验证

- exact Prettier：通过。
- exact ESLint：通过。
- focused Vitest：7 files、192/192 通过。
- `npm run typecheck`：共享树通过。
- `npm run governance:legacy-report`：通过，零引用候选 0、分类漂移候选 0、边界违规 0。
- production root-barrel import 扫描：0。
- `git diff --check`：通过。

## 治理分类

- `current`：`sessionTypes`、`agentExecutionRuntime`、`threadClient` 与 app-server-client direct imports。
- `compat`：`agentRuntime` 根 barrel；本轮 production consumer 聚合扫描已无直接 import。
- `deprecated`：无新增。
- `dead`：本切片五个 root-barrel import 已从 production consumer 消失，禁止回流。

下一刀应由 coordinator 复核全部并行 S5 import handoff，并在 S7y 释放后运行聚合门禁；
不得为迁移期根 barrel 新增 consumer。
