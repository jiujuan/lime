# S5s Automation Managed Objective Type Owner

## 结论

五个 Automation Managed Objective production consumers 已从 `agentRuntime/types` compat barrel
迁到 `agentRuntime/sessionTypes` current owner：四个 `ManagedObjectiveStatus` 与一个
`AgentRuntimeObjectiveSessionRequest`。projection、evidence 和 UI 行为未改变。

## 分类

- `current`：`agentRuntime/sessionTypes`。
- `compat / deprecated`：`agentRuntime/types`，只允许继续迁出。
- `dead / forbidden-to-restore`：这五个 automation production imports。

## 验证

- focused Vitest：2 files / `6/6` 通过。
- exact ESLint、Prettier、typecheck、compat-types scan 与 diff check：通过。
- claimed production compat consumer：`5 -> 0`。

## 下一刀

迁移两个 clean Plugin `AgentRuntimeRespondActionRequest` consumers 到 `requestTypes`；继续避让
dirty `useWorkspaceSendActions.ts` 与 active root-barrel retirement。
