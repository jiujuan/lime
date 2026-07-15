# S5x Agent Client Type Owner

## 结论

`agentClient.ts` 的 title/provider DTO 已直连 `sessionTypes`，`executionStrategyCompat.ts` 的
strategy 已直连 `agentExecutionRuntime`。title generation 和 legacy-value-to-react normalization
行为未改变。

## 分类

- `current`：`agentRuntime/sessionTypes` 与 `agentExecutionRuntime`。
- `compat / deprecated`：`agentRuntime/types`，只允许继续迁出。
- `dead / forbidden-to-restore`：两个内部 root type imports。

## 验证

- focused Vitest：2 files / `4/4` 通过。
- exact ESLint、Prettier、typecheck、compat-types scan 与 diff check：通过。
- claimed compat consumer：`2 -> 0`。

## 下一刀

继续拆 App Server read/session projector 的 session/request types，或 mediaTasks 的 media types；
每刀只迁同一 direct owner。
