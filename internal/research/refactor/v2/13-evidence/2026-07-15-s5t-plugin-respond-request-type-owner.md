# S5t Plugin Respond Request Type Owner

## 结论

`pluginRuntime.ts` 与 `agentRuntimeCapabilityHost.ts` 已把
`AgentRuntimeRespondActionRequest` 从 `agentRuntime/types` compat barrel 迁到
`agentRuntime/requestTypes` current owner。Plugin transport、capability 与 thread identity 行为未改。

## 分类

- `current`：`agentRuntime/requestTypes`。
- `compat / deprecated`：`agentRuntime/types`，只允许继续迁出。
- `dead / forbidden-to-restore`：两个 Plugin production imports。

## 验证

- focused Vitest：2 files / `18/18` 通过。
- exact ESLint、Prettier、typecheck、compat-types scan 与 diff check：通过。
- claimed production compat consumer：`2 -> 0`。

## 下一刀

按 owner 继续迁移 Experts skill binding 到 `toolInventoryTypes`，以及 evidence normalizer 到
`evidenceTypes`；不触碰 active root-barrel retirement 和 dirty Workspace consumer。
