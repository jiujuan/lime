# S5j History Test Session Type Owner

## 结论

三个 Agent history 测试已把 `AgentSessionDetail` type import 从
`@/lib/api/agentRuntime` compat root 迁到 `@/lib/api/agentRuntime/sessionTypes` current owner。
fixture、history hydration、compaction、missing-user recovery 和 read-model assertions 均未改变。

## 分类

- `current`：`agentRuntime/sessionTypes` 的 `AgentSessionDetail`。
- `compat`：root barrel 的其余 test / fixture consumers，继续只允许迁出。
- `dead / forbidden-to-restore`：这三个测试对 root barrel 的 type import。

## 验证

- focused Vitest：3 files / `23/23` 通过。
- exact ESLint、Prettier 与 diff check：通过。
- `npm run typecheck`：通过。
- claimed exact root specifier：`0`。

## 下一刀

按 direct current owner 继续迁移实际 test import/mock；仅包含负向 guard 文本的文件不计作依赖，
最终在真实 test/fixture consumers 归零后物理删除 root barrel。
