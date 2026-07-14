# S4r8 MCP Runtime Thread Owner

日期：2026-07-13  
状态：completed / owner-lifecycle-revalidated / Gate-B-validated

## 结论

MCP server-originated elicitation 已收敛到 current runtime tool chain：
`AgentRuntimeState[sessionId] -> McpThreadRuntime` 在 generation 创建时绑定 immutable
`threadId`，并独立持有 runtime `McpClientManager`、真实 RMCP connection 与 bridge
registry。management manager 只提供 typed enabled server specs，不被 runtime 重用。frozen
`McpStepSnapshot` 持有该 generation 的精确 connection handle；每次 tool call 的
`McpCallScope` 只保留 nullable `turnId` correlation。公开 reverse JSON-RPC 只 lower
`threadId`、nullable `turnId`、`serverName` 与 `mode: "form"`；不会公开 `sessionId`、
`parentToolCallId`、raw MCP request id、progress token 或私有 scope token。

全局 `McpClientManager` 保持 MCP 管理控制面 owner。没有 runtime scope 的 management
nested elicitation 在 MCP service 边界直接 Decline，不从 singleton、active turn、server
metadata 或 session identity 猜测 thread owner。

elicitation 仍是瞬时、in-memory 的 reverse request；没有新增 canonical Item、read model、
ProjectionStore 或 SQLite pending/terminal 记录。client capability 继续 absent。

## 终态与隔离

- router 只用 opaque public request id exact claim/consume waiter；同一 server 的不同
  session/thread runtime 不串线。
- session delete 按 exact `(sessionId, threadId)` 关闭 runtime generation；turn cancel 只取消
  in-flight token，不销毁下一回合仍需复用的 runtime。
- 已转发给 App Server adapter 的 request：RMCP cancellation、outer response/error 或
  transport shutdown 都先向原 connection 发送一次 `serverRequest/resolved`，随后才释放
  RMCP waiter。
- 尚未转发的 queued request 在 shutdown 直接 Cancel，不凭空创建 outer request 或
  terminal notification。
- normal、malformed result、JSON-RPC error、request-cancel、RMCP closed 与 shutdown
  均为单一 terminal winner。

## 验证

```text
cargo test --manifest-path lime-rs/Cargo.toml -p lime-mcp elicitation --lib
# 20 passed

cargo test --manifest-path lime-rs/Cargo.toml -p app-server mcp_elicitation --lib
# 7 passed

cargo test --manifest-path lime-rs/Cargo.toml -p tool-runtime mcp_connection --lib
# 8 passed

cargo test --manifest-path lime-rs/Cargo.toml -p app-server session_scope_rejects_turn_thread_mismatch --lib
# passed

cargo test --manifest-path lime-rs/Cargo.toml -p app-server delete_session_closes_exact_runtime_owner_before_removal --lib
# passed

cargo test --manifest-path lime-rs/Cargo.toml -p lime-mcp session_cancel_keeps_other_session_and_forwarded_waiter_is_adapter_owned --lib
# passed

npx vitest run scripts/electron/mcp-elicitation-gate-b.test.mjs --silent=passed-only --disableConsoleIntercept
# 3 passed

npm run smoke:mcp-elicitation-gate-b
# pass

npm run test:contracts
# pass; app-server-client contract 290 checks

npm run governance:scripts
# pass
```

真实 Gate B 使用 localhost OpenAI-compatible provider fixture 与临时 stdio MCP server，
经过真实 Electron/preload/`app_server_handle_json_lines`/App Server/runtime/Renderer：

```text
provider scoped MCP tool call
  -> MCP elicitation/create
  -> typed reverse JSON-RPC
  -> Renderer confirmed=true form submit
  -> MCP accept ledger
  -> second provider request
  -> final text in agentSession/read
```

Gate B summary：
`.lime/qc/gui-evidence/mcp-elicitation-gate-b/mcp-elicitation-gate-b-summary.json`

摘要断言：Electron preload bridge、`app_server_handle_json_lines`、Renderer form visible、
confirmed submit、`serverRequest/resolved` 后 dialog close、MCP accept ledger、provider final
text 均为 true；provider request count 为 2；console errors、legacy MCP facade 与缺失
required methods 均为 0。

## 分类

- `current`：`AgentRuntimeState[sessionId] -> McpThreadRuntime`、runtime-owned MCP
  generation、turn-only `McpCallScope`、MCP snapshot exact dispatch、opaque router、App Server
  adapter、typed reverse request、Renderer global form、S4r8 Electron Gate B。
- `compat`：无。
- `deprecated`：无新增。
- `dead / forbidden-to-restore`：全局 Agent MCP registry、management `RunningService` 连接复用、
  per-call session/thread/parent identity、durable elicitation Item/read model、management owner
  guessing、公开 private identity、waiter scanning、Approval/ask-user 复用、生产 mock
  fallback、elicitation capability advertisement。
