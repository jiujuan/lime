# S4ak MCP Elicitation Capability Advertisement

时间：2026-07-15

## 范围

- `slice`: `S4ak-mcp-elicitation-capability-advertisement`
- `current owner`: `lime-mcp::LimeMcpClient` 的 RMCP initialize 信息
- `产品边界`: runtime-owned MCP connection 可以承接 thread-owned reverse elicitation；management connection 没有可信 thread owner，继续 fail closed。

本切片对齐 Codex `codex-mcp` 的 form elicitation initialize 语义：只有同时持有
`ElicitationRequestRouter` 与 immutable `McpRuntimeOwner` 的 runtime client 使用 MCP
`2025-06-18` 并广告 `{"elicitation": {}}`。management client 与 router-only client
继续使用 `2025-03-26`，不广告 elicitation capability，也不获得第二套 request owner。

真实 Gate B fixture 不再无条件发送 `elicitation/create`。每个 stdio process 记录自己的
initialize protocol/capabilities；只有精确满足 runtime capability 的同一 process 才能发起
elicitation。最终 evidence 以接受表单的 pid 反查 initialize，并同时要求独立 management pid
保持 capability absent，阻止任意正样本掩盖错误 owner。

## Codex 对照

- `/Users/coso/Documents/dev/rust/codex/codex-rs/codex-mcp/src/rmcp_client.rs`：initialize
  设置 `capabilities.elicitation = Some(default)` 并使用 `2025-06-18`。
- `/Users/coso/Documents/dev/rust/codex/codex-rs/codex-mcp/src/connection_manager_tests.rs`：
  form-only capability 的 wire shape 固定为 `{}`。
- Lime 当前依赖 `rmcp 0.12.0` 的 `ElicitationCapability::default()` 同样序列化为 `{}`；
  `schemaValidation` 保持 unset。

## 验证

| 命令 | 结果 |
| --- | --- |
| `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp client::tests -- --nocapture` | 通过，`6/6` |
| `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp raw_wire_response_preserves_result_meta -- --nocapture` | 通过，`1/1`；initialize wire 为 `2025-06-18 + {"elicitation": {}}` |
| `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp --lib` | 通过，`140/140` |
| `node --check "scripts/electron/mcp-elicitation-gate-b.mjs"` | 通过 |
| `npx vitest run "scripts/electron/mcp-elicitation-gate-b.test.mjs"` | 通过，`4/4` |
| `npm run governance:scripts` | 通过 |
| `npm run governance:legacy-report` | 通过，零引用候选 `0`、分类漂移候选 `0`、边界违规 `0` |
| `npm run smoke:mcp-elicitation-gate-b -- --prefix s4aj-capability` | 通过，真实 Electron Gate B |
| scoped `git diff --check` | 通过 |

Gate B 结构化结果：

- `ok=true`，`proofLevel=Gate B`
- management initialize：pid `31120`，`2025-03-26`，capabilities `{}`
- runtime initialize：pid `31468`，`2025-06-18`，capabilities `{"elicitation": {}}`
- accepted elicitation：同一 runtime pid `31468`，`action=accept`，`confirmed=true`
- `capabilityMissingCount=0`
- Electron preload/JSONL bridge 命中，Renderer form visible/submitted/closed
- Provider request `2` 次，final text 进入 current read model
- console error `0`、missing current method `0`、legacy MCP command `0`

原始结构化证据：

- `.lime/qc/gui-evidence/mcp-elicitation-gate-b/s4aj-capability-summary.json`
- `.lime/qc/gui-evidence/mcp-elicitation-gate-b/s4aj-capability-raw.json`

## 治理分类

- `current`: runtime-owned MCP client 的 `2025-06-18` form elicitation capability。
- `compat`: 无。
- `deprecated`: 无。
- `dead`: “capability 保持 absent 但 fixture 无条件发 elicitation”的旧 Gate B oracle 已被替换；
  不保留 fallback。

## 架构确认

架构影响：非重大。既有 `McpThreadRuntime -> LimeMcpClient -> App Server reverse JSON-RPC ->
Renderer form` owner 与协议不变；本切片只让 runtime initialize 如实广告已经实现的 form
capability，并让 management owner 继续 absent。无需修改全局架构图。
