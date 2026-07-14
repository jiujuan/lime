# S4r6d MCP connection-local call owner

日期：2026-07-13  
状态：Rust foundation completed；capability absent

## 结论

Lime 不再使用 RMCP 标准 `_meta.progressToken` 或私有 wire key 关联 Agent MCP call 与 server-originated elicitation。每个 connection 在 `tools/call` 全生命周期持有一个串行 owner lease；owner 值要么是完整 `McpCallScope`，要么显式为 `None`。因此管理面 unscoped call 与 Agent scoped call 并发时会排队，不会借用 Agent scope。

真实 duplex RMCP 回归证明：server 无需读取或回传 Lime 私有 metadata，普通 `tools/call -> elicitation/create -> response -> tool result` 可以完成；RMCP 自己的 `progressToken` 在公开产品 metadata 前被移除。

## Codex 对照

Codex 的更完整事实源仍是 session-owned `McpConnectionManager`：connection 构造时注入该 Session 的 elicitation sender，App Server protocol 要求 `threadId`，`turnId` 仅作可空 correlation，并不要求 `sessionId` 或 `parentToolCallId`。Lime 当前共享 MCP process/RunningService，因此本切片只提供 connection-local 动态 owner，不冒充已经完成 session-owned manager 迁移。

## 治理分类

- `current`：serialized connection-local scoped/unscoped tools/call owner、RMCP progress metadata stripping。
- `compat`：无。
- `deprecated`：无。
- `dead / forbidden-to-restore`：私有 scope wire key、`progressToken` scope attribution、缺 token singleton fallback、waiter/最近 turn 猜测。

## 验证

- `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp elicitation --lib`
  - 17/17 passed。
- scoped `rustfmt` 与 `git diff --check`
  - passed。

## 未完成

Capability 继续保持 absent。下一步必须完成 Codex thread-owned App Server contract、generated TypeScript、GUI form semantics、canonical read-only projection 和真实 Electron Gate B。
