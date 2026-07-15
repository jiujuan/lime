# S5 Session Types Root Barrel Residual

## 结论

Agent Chat 中 3 个仅消费 session DTO 的 production 文件已从 compat
`@/lib/api/agentRuntime` 根 barrel 迁到 current `agentRuntime/sessionTypes` owner。现有
`sessionTypesCurrentBoundary` 同步登记这些 consumer，阻止它们回流根 barrel。

## 写集与并行边界

- `agentChatHistoryThreadItems.ts`：仅迁移 `AgentSessionDetail` type import。
- `generalWorkbenchTaskRailContextViewModel.ts`、`harnessStatusPanelViewModel.ts`：仅迁移
  `AgentRuntimeThreadReadModel` type import。
- `sessionTypesCurrentBoundary.test.ts`：只新增上述 3 个 consumer 路径。
- 保留 4 个文件中 S2l/S6q/S6o owner 已 staged 的业务改动；未修改 S7y、S4ae、中央计划、
  Electron、App Server、协议、Rust 或 GUI 行为。

## 分类

- `current`：`src/lib/api/agentRuntime/sessionTypes.ts`。
- `compat`：`src/lib/api/agentRuntime` 根 barrel，仍有其他分域 consumer 待迁移。
- `deprecated`：无新增。
- `dead / retired guard-only`：本次 3 个文件对根 barrel 的 type import。

## 验证

- focused Vitest：4 files、23/23 passed。
- `npm run typecheck`：passed。
- exact ESLint：passed。
- `npm run governance:legacy-report`：零引用候选 0、分类漂移候选 0、边界违规 0。
- claimed diff check：passed。
- Prettier：3 个文件 passed；`agentChatHistoryThreadItems.ts` 的既有 staged 业务 hunk 在
  147、206 行附近有两处格式残留。本轮 import hunk 不在差异中，按并行避让规则未改写。
- Agent Chat 非测试 production 根 barrel 直接 import 从 23 降到 20。

## 下一刀

继续按 current owner 分域迁移剩余根 barrel consumer；优先选择同一类型 owner、仅 type import
且原业务 owner 已释放的窄切片。S7y Approval cold-read 和 S4ae Multi-Agent Gate B 写集保持避让。
