# S5 Components Current Owner Clean Remainder

## 目标

将 3 个 clean Agent Chat component consumer 从 `compat` 根入口
`@/lib/api/agentRuntime` 迁到唯一 `current` owner；仅修改 import，不改变运行行为。

## 写集

- `src/components/agent/chat/components/HarnessStatusPanelTypes.ts`
- `src/components/agent/chat/components/TaskCenterUtilityToolbar.tsx`
- `src/components/agent/chat/components/generalWorkbenchTaskRailViewModel.ts`

## 结果

- `AgentRuntimeThreadReadModel`、`AgentTodoItem` 改从 `agentRuntime/sessionTypes` 导入。
- `AgentRuntimeToolInventory` 改从 `agentRuntime/toolInventoryTypes` 导入。
- `QueuedTurnSnapshot` 改从 `queuedTurn` 导入。
- `AgentSessionExecutionRuntime` 改从 `agentExecutionRuntime` 导入。
- 3 个目标文件中的 production 根 barrel import 降为 0。
- diff 仅包含 import hunk，无行为、协议、样式或用户可见文案变化。

## 并行安全

初始与 claim 后 clean gate 均确认 3 个目标文件 clean。以下并发脏文件全程避让：

- `src/components/agent/chat/components/MessageList.types.ts`
- `src/components/agent/chat/components/useMessageListTimelineState.ts`
- `src/components/agent/chat/utils/agentTaskRuntime.ts`
- `src/components/agent/chat/utils/inputbarRuntimeStatusLine.ts`

未修改中央计划、S7y Approval 写集、3 个 session residual 文件或 i18n。

## 验证

- exact Prettier：通过。
- exact ESLint：通过。
- focused Vitest：3 files、79/79 通过。
- `npm run typecheck`：通过。
- `npm run governance:legacy-report`：通过，零引用候选 0、分类漂移候选 0、边界违规 0。
- 目标 production root import 扫描：0。
- `git diff --check`：通过。
