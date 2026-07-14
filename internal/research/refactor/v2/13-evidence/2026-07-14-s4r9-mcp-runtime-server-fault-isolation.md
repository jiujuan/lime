# S4r9 MCP Runtime Server Fault Isolation

日期：2026-07-14

状态：completed / focused-and-Gate-B-validated

## 结论

Codex 的 MCP connection manager 按 server 隔离启动失败：optional server 不可用时，
健康 server 仍可构成模型工具面；`required` server 失败才拒绝 session initialization。
Lime 已将这个策略落在 session-owned `McpThreadRuntime`，没有复用管理控制面的
`RunningService`，也没有删除故障默认配置、使用 mock 或绕过 runtime generation。

## Current Owner 与规则

- `AgentRuntimeState[sessionId] -> McpThreadRuntime` 仍是唯一 runtime MCP owner。
- 每个 enabled typed server spec 并发创建独立 runtime connection。
- `required = false` 的 startup error 记录为该 generation 的 unavailable server；该
  server 不产生 bridge route，其他健康 server 继续进入 snapshot。
- `required = true` 的 error 聚合为 generation failure；候选 manager 的 connection
  会关闭，但因为 candidate 尚未 publish，不会取消已发布 generation 在共享 router 上的
  pending elicitation。
- 只有 `McpThreadRuntime::start` 完成 startup policy 与 bridge snapshot 后，
  `AgentRuntimeState` 才替换 session generation。旧 step 的 `Arc` handle 保持不变。

## 改动

- 将 MCP generation lifecycle 从 `agent/src/runtime_state.rs` 拆到
  `agent/src/runtime_state/mcp_runtime.rs`，保持 state owner 与 connection lifecycle
  的单一职责，避免继续堆叠超过 800 行的业务文件。
- 新增 `mcp_runtime_tests.rs`：覆盖 session/thread 精确 owner、无变化复用、并发 ensure、
  optional broken + healthy stdio server、required failure 保留旧 generation。
- 对齐 Codex 的 per-server 并发 startup。Lime 不复制 Codex TUI startup event，而在
  runtime owner 内记录 structured tracing；GUI 继续只投影现有 runtime/MCP product state。

## 验证

```text
cargo test --manifest-path lime-rs/Cargo.toml -p lime-agent runtime_state --lib
  10 passed

cargo test --manifest-path lime-rs/Cargo.toml -p lime-mcp manager::tests --lib
  63 passed

npm run smoke:mcp-elicitation-gate-b -- --keep-temp --timeout-ms 120000 \
  --evidence-dir .lime/qc/gui-evidence/mcp-elicitation-gate-b-s4r9 --prefix s4r9
  passed
```

Gate B summary：

- `ok = true`
- `providerRequestCount = 2`
- `rendererFormVisible = true`
- `rendererConfirmedSubmitted = true`
- `mcpLedgerAccepted = true`
- `providerFinalTextObserved = true`
- `dialogClosedAfterResolved = true`
- `appServerHandleJsonLinesSeen = true`
- `legacyMcpCommandsSeen = []`
- `consoleErrors = []`

证据文件：

```text
.lime/qc/gui-evidence/mcp-elicitation-gate-b-s4r9/s4r9-summary.json
.lime/qc/gui-evidence/mcp-elicitation-gate-b-s4r9/s4r9-raw.json
.lime/qc/gui-evidence/mcp-elicitation-gate-b-s4r9/s4r9.png
```

raw evidence 的 `mcpServer/create` 结果同时包含失败触发器 `playwright` 和临时健康
elicitation server，证明本次没有通过删除故障 server 伪造成功。

## 分类

- `current`：session-owned runtime generation、per-server availability、required
  replacement guard、健康 bridge snapshot。
- `compat`：无。
- `deprecated`：无新增。
- `dead / forbidden-to-restore`：任一 enabled server error 终止 provider turn、
  management connection reuse、global runtime registry、删除故障 server 后才运行 Gate B、
  candidate failure 取消旧 generation 的 pending elicitation。
