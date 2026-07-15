# S5 Session Types Status Surface Residual

## 结论

Inputbar runtime status、Agent task card、MessageList types/timeline state 与 session projection
deferral 的 5 个 production consumer 已退出 compat `agentRuntime` 根 barrel：

- `AgentRuntimeThreadReadModel` 直连 current `agentRuntime/sessionTypes`。
- `QueuedTurnSnapshot` 直连 current `api/queuedTurn`。

现有 `sessionTypesCurrentBoundary` 与 `queuedTurnCurrentBoundary` 同步登记这 5 个 consumer，
不新增平行 guard。

## 写集与并行边界

- 5 个 production 文件只修改 type import hunk。
- 两个 boundary test 只扩展 consumer list。
- 未修改 active S7y Approval cold-read、S4ae Multi-Agent Gate B、中央计划、Electron、App
  Server、协议/schema、Rust 或 GUI 行为。

## 分类

- `current`：`agentRuntime/sessionTypes` 与 `api/queuedTurn`。
- `compat`：`agentRuntime` 根 barrel，仍有其他领域 consumer 待迁移。
- `deprecated`：无新增。
- `dead / retired guard-only`：本次 5 个 consumer 对根 barrel 的混合 type import。

## 验证

- focused Vitest：6 files、29/29 passed。
- `npm run typecheck`：passed。
- exact ESLint：passed。
- exact Prettier：passed。
- `npm run governance:legacy-report`：零引用候选 0、分类漂移候选 0、边界违规 0。
- claimed diff check：passed。
- 精确排除 test/testFixtures 后，Agent Chat production 根 barrel direct-import 文件当前为 12 个。

## 下一刀

继续按现有 current 子模块拆分剩余 12 个 consumer；优先迁移 clean、type-only、已由 boundary
test 覆盖的文件。S7y 与 S4ae 释放前不触碰其写集或中央计划。
