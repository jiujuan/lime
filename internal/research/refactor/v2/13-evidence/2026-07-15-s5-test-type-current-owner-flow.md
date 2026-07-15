# S5 Test Type Current Owner Flow

## 结论

五个 queue/execution test-only consumer 已退出 compat `agentRuntime` 根 barrel：

- `QueuedTurnSnapshot` 直连 `api/queuedTurn`。
- `AgentSessionExecutionRuntime` 直连 `api/agentExecutionRuntime`。

本 slice 仅迁移 type import，不修改 queue、execution runtime、send preparation 的 fixture、断言、
mock 或 production 行为。

## 分类

- `current`：`api/queuedTurn`、`api/agentExecutionRuntime`。
- `compat`：root barrel 仍被其他 test/fixture 使用。
- `deprecated`：无新增。
- `dead / retired guard-only`：上述五文件的 root type import。

## 验证

- focused Vitest：5 files、55/55 passed。
- `npm run typecheck`：passed。
- exact ESLint：passed。
- `npm run governance:legacy-report`：零引用候选 0、分类漂移候选 0、边界违规 0。
- claimed diff check：passed。
- Prettier：3 个文件 passed；两个 queue test 的 HEAD 基线分别有空行与断言换行残留，均不在
  本轮 import hunk，未扩大写集。
- 并行 current tree 中 Agent Chat test/fixture static root-import 文件现为 17 个；本 slice 自行迁移
  5 个，其余计数变化来自并行 owner。

## 下一刀

等待 S2o 释放后迁移 history/session-state/turn-event type imports；行为 root mocks 必须按实际
objectiveClient/clientFactory/sessionClient 等 owner 独立迁移，不得以新 compat helper 替代。
