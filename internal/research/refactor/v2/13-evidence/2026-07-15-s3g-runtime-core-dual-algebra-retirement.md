# S3g Runtime Core Dual Algebra Retirement

## 结论

`runtime-core` 的第二套 provider-neutral request/event algebra 已物理删除：

- `llm_protocol/types.rs`：旧 `LlmRequest`、message/input/output、`ProviderWireRequest`。
- `llm_protocol/events.rs`：旧 `LlmEvent -> LlmRuntimeEvent` mapper。
- `llm_protocol/tests.rs`：只验证上述旧代数的正向测试。

`llm_protocol.rs` 现在只公开 `canonical`，crate root 只 re-export canonical request/content/event
类型。没有新增 compat alias。

## 验证

- runtime-core old symbol/path scan：`0`。
- exact rustfmt 与 scoped diff check：通过。
- shared `runtime-core --lib`：`43/43`。
- model-provider/media 与 contract 的组合验证记录在 S3i evidence。

## 协调恢复

worker 已完整落盘删除补丁并创建 claim/lock，随后模型通道返回 HTTP 400，未能写 evidence/handoff。
coordinator 确认 agent 状态为 errored、目标文件不再变化、diff 只包含声明写集，并完成共享验证后
接管收尾和 lock release。

canonical algebra 为 `current`；三文件与旧 crate-root exports 为
`dead / deleted / forbidden-to-restore`。
