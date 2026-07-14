# S4r8 Gate B Runtime Server Failure

日期：2026-07-14

状态：Gate B blocked；S4r8 owner/lifecycle foundation remains current

## 更正

此前 S4r8 evidence 把 MCP elicitation Gate B 标为通过。最新两次隔离 Electron
重跑反证该结论：当前 summary 是 `ok: false`，不能继续把 Gate B 作为已验证证据。

这不回退已验证的 session-owned runtime、exact thread owner、reverse JSON-RPC
identity、management fail-closed 或 Renderer form contract；它只证明 runtime generation
的单 server startup failure 仍会阻断整个 provider turn。

## 可复现证据

最新运行：

```text
node scripts/electron/mcp-elicitation-gate-b.mjs \
  --keep-temp \
  --timeout-ms 120000 \
  --evidence-dir .lime/qc/gui-evidence/mcp-elicitation-gate-b-rerun \
  --prefix gate-b-rerun
```

结果：

- `gate-b-rerun-summary.json`: `ok=false`、`providerRequestCount=0`、Renderer form 未显示。
- temp event log：`message.created -> turn.accepted -> routing.decision.made -> turn.failed`。
- `turn.failed` 的确定错误：默认 enabled `playwright` MCP 执行
  `@modelcontextprotocol/server-playwright` 时 registry 返回 E404。
- 目标 stdio elicitation MCP 已被 management `mcpTool/list` 发现，却因 runtime
  session generation 在前一个 server 失败后返回 error，没有进入 provider sampling。

现场路径：

```text
.lime/qc/gui-evidence/mcp-elicitation-gate-b-rerun/gate-b-rerun-summary.json
.lime/qc/gui-evidence/mcp-elicitation-gate-b-rerun/gate-b-rerun-raw.json
/var/folders/87/s6cpr7hd1_v43cs833x4s_900000gn/T/mcp-config-0PXZeX/
```

## 根因

`McpThreadRuntime::start` 顺序启动所有 enabled `McpRuntimeServerSpec`，第一个
`manager.start_server(...)` error 直接返回；`RuntimeBackend` 因而在 provider loop 前
失败整个 Turn。一个不可用的外部 MCP 不应消灭其他可用 server 的 runtime tool surface。

这不是把 management `RunningService` 复用到 runtime 的理由，也不能通过 Gate B 脚本
删除默认 server 或跳过真实 runtime generation 规避。

## 后续 Slice：S4r9 MCP runtime server fault isolation

建议写集（取得热区协调窗口后才可认领）：

- `lime-rs/crates/agent/src/runtime_state.rs`
- `lime-rs/crates/mcp/src/manager/**` 的 runtime startup status/snapshot owner
- `lime-rs/crates/agent/src/mcp_bridge.rs` 与相关定向 tests
- `lime-rs/crates/app-server/src/runtime_backend/mcp_bridges.rs` 与定向 tests
- `scripts/electron/mcp-elicitation-gate-b.mjs` 的 failure oracle/evidence extraction

退出条件：

1. 单一 runtime MCP startup failure 只隔离该 server，其他 server 仍可进入同一 Thread
   generation 与 provider request。
2. failed server 不生成 executable route；不会 fallback 到 management connection、旧
   registry 或 mock。
3. config generation 原子发布语义不变：旧 step 继续持原 handle，新 step 只见完整新
   generation 的 ready servers。
4. Gate B 必须在有一个故障 default MCP 和一个健康 elicitation MCP 的条件下完成
   `provider tool -> form -> accept -> second provider request -> final text`。
5. Host 的 first-notification old-turn filtering/read fallback 是独立 S5/Host 事项；不在
   此 slice 伪造 admission identity。

## 分类

- `current`：session-owned MCP runtime、per-server availability isolation、exact route。
- `compat`：无。
- `deprecated`：无新增。
- `dead / forbidden-to-restore`：一个 server failure 终止整个 provider turn、global
  management connection reuse、测试删除故障 server 以伪造 runtime resilience。
