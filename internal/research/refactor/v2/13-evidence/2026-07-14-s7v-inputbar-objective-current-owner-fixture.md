# S7v Inputbar Objective Current Owner Fixture

## 结论

Inputbar 聚合测试的 Objective mock 已从 compat root `@/lib/api/agentRuntime` 迁到唯一 current
behavior owner `agentRuntime/objectiveClient`。Goal 发送仍先持久化相同 objective request，再下传
Plan/Goal metadata；production 行为未改。

## 分类

- `current`：`objectiveClient.setAgentRuntimeObjective` 与 Inputbar Goal send。
- `test-only`：Inputbar 聚合测试 mock。
- `compat`：root barrel 仍服务尚未迁出的其它领域，本切片不扩展。
- `dead / forbidden-to-restore`：Objective 测试 mock root barrel。

## 验证

- `Inputbar/index.test.tsx`：`87/87` passed；batch 108 当前树 `166/166` passed。
- 与 S7p/S7r 合并 focused：`4 files / 110 tests` passed。
- exact ESLint、Prettier、`git diff --check`：passed。
- smart Vitest resumable state：`passed`。

本切片不改变用户可见文案或 GUI 行为，不声明新的 GUI Gate B。
