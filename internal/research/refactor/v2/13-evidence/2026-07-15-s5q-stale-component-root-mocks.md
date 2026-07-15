# S5q Stale Component Root Mocks

## 结论

本 slice 在两个目标文件均为 clean 时完成认领。认领后，活动 slice
`S5q-root-barrel-retirement` 将 `ChatModelSelector.integration.test.tsx` 的 root mock 迁到
`agentClient` / `sessionClient`，并将 `EmptyState.test.tsx` 的 root mock 迁到
`objectiveClient`。这些修改不属于本 slice。

按并行协作规则，本 slice 未继续夹写，也未删除隔壁刚迁入的 direct-owner mocks。源文件补丁为
`0`；测试、ESLint、Prettier、legacy report 和 diff check 均不归因于本 slice，交由持锁 owner
在完整 root barrel 退役上下文统一验证。

## 分类

- `current / test-only`：隔壁 slice 新迁入的 direct-owner mocks；是否仍有行为必要，待其释放后冷审。
- `dead / forbidden-to-restore`：两个 exact root `@/lib/api/agentRuntime` partial mocks，已由隔壁 slice
  的迁移补丁移除。
- `dead candidate`：`EmptyState` 的 objective mock 和 `mockGetAgentRuntimeObjective`；只读审计认为无
  有效断言消费，但本 slice 未在 owner 活动期间删除。

## 删除表面

本 slice 未删除任何 fixture surface。实际删除/迁移归属 `S5q-root-barrel-retirement`，不得重复
计入本 slice。

## 下一刀

`S5q-root-barrel-retirement` 完成并释放写集后，再冷审 direct-owner mocks：优先确认
`EmptyState` objective mock 是否可整段删除；`ChatModelSelector` 的 runtime doubles 仍被注入式
`AgentRuntimeAdapter` fixture 消费，不能只因 root barrel 退役而误删。
