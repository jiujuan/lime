# S5w Workspace Skill Binding Type Owner

## 结论

三个 clean Workspace helper/test consumers 已把 `AgentRuntimeWorkspaceSkillBinding` 从
`agentRuntime/types` compat barrel 迁到 `agentRuntime/toolInventoryTypes` current owner。
expert skill selection 与 workspace send behavior 未改变。

## 分类

- `current`：`agentRuntime/toolInventoryTypes`。
- `compat / deprecated`：`agentRuntime/types`，只允许继续迁出。
- `dead / forbidden-to-restore`：三个 Workspace imports。

## 验证

- focused Vitest：2 files / `25/25` 通过。
- exact ESLint、Prettier、typecheck、compat-types scan 与 diff check：通过。
- claimed compat consumer：`3 -> 0`。

## 避让

`useWorkspaceSendActions.ts` 已有已释放但尚未汇总的并行 diff，本切片保持不碰；待其原 owner
确认后再迁最后一个 Workspace skill binding import。
