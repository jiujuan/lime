# Codex current 架构与可复制清单

> status: current reference map
> owner: runtime-architecture
> last_verified: 2026-07-12
> source: `/Users/coso/Documents/dev/rust/codex`
> source_commit: `5c19155cbd93bfa099016e7487259f61669823ff`

## 主链

```text
app-server-protocol v2
  -> app-server message_processor / request_processors
  -> core session / tasks / tools
  -> EventMsg / TurnItem
  -> thread_history / thread-store / rollout-trace
  -> app-server-client / TUI facade / test client
```

Codex 当前不是只有 `Thread / Turn / Item` 三个类型，而是以它们为骨架的一组可复制边界：protocol registry、serialization scope、thin processor、session task loop、tool control plane、materialization、history paging/repair、skills/MCP、多 agent graph 和 schema fixture。

## 可复制矩阵

| Codex current 路径 | Lime 目标 owner | 动作 | 复制边界 |
| --- | --- | --- | --- |
| `codex-rs/app-server-protocol/src/protocol/common.rs` | `app-server-protocol` | `copy` | method registry、typed request/response、serialization scope 和实验字段 gating；按 Lime domain 拆文件 |
| `app-server-protocol/src/protocol/v2/{thread_data,thread,turn,item}.rs` | `agent-protocol` + App Server protocol | `copy` | Thread/Turn/ThreadItem tagged union、状态、分页和 typed notifications；直接替换旧 `agentSession` 语义，不保留第二套 |
| `app-server/src/message_processor.rs`、`request_processors/thread_processor.rs`、`turn_processor.rs` | `app-server` | `copy` | 薄解析/分派和 domain processor 结构；不复制 Codex auth/CLI 特定逻辑 |
| `core/src/session/{session,turn,turn_context,input_queue}.rs` | `agent-runtime` / `runtime-core` | `adapt` | queue、turn context、steer、interrupt、resume、context assembly；Provider 和 GUI 细节留 Lime owner |
| `core/src/tasks/{mod,regular,compact,review,lifecycle}.rs` | `agent-runtime` | `copy` + `adapt` | `SessionTask`、spawn/abort、terminal lifecycle；删除 Lime 中重复的 queue/timeout 状态机 |
| `tools/src/{lib,tool_call,tool_executor}.rs` + `core/src/tools/*` | `tool-runtime` | `copy` + `adapt` | ToolSpec/Call/Executor/Emitter 契约；审批、sandbox、MCP manager 绑定 Lime current |
| `codex-mcp/src/connection_manager.rs`、`core/src/session/mcp_runtime.rs` | `mcp` + `tool-runtime` | `adapt` | manager、catalog、turn snapshot 三层；不让 GUI 直连 MCP |
| `core-skills/src/model.rs`、`ext/skills/{catalog,selection}.rs` | `skills` | `copy` + `adapt` | metadata、policy、dependency、authority/source、selection；技能文本不进入 GUI 状态 |
| `core/src/agent/control.rs`、`agent-graph-store`、`state/runtime/threads.rs` | `agent-runtime` + `thread-store` | `copy` + `adapt` | session-scoped control、parent-child edge、mailbox、budget、SubAgent Item；不做 GUI 本地并发 |
| `thread-store/{store,live_thread,types}.rs` | `thread-store` | `copy` + `adapt` | writer/read separation、分页、ordinal、repair、lazy materialization；存储路径改为 Lime platform API |
| `app-server-protocol/src/protocol/{event_mapping,item_builders,thread_history,thread_history_projection}.rs` | `app-server` projection | `copy` + `adapt` | event -> item/history change set/coalesce/rollback；GUI 只消费结果 |
| `app-server-test-client`、`schema_fixtures.rs`、core suite | Lime contracts/fixtures | `copy` + `adapt` | schema、RPC、runtime fixture；再接 Gate B Electron 证据 |

## v2 必须吸收的最新信号

| Codex current 信号 | v2 处理 |
| --- | --- |
| canonical command/dynamic/collab/subagent items | 直接进入 ThreadItem 设计，补 Item family 和 projection tests |
| extension-owned item boundary | 保持 extension item 不污染 core union；在 Lime 以 domain item registry 表达 |
| paginated thread history + ordinals | ThreadStore 和 read model 采用稳定 ordinal/cursor，不以数组索引恢复 |
| rollout repair / unterminated JSONL 修复 | import/replay 先 repair，再 materialize；错误必须可见，不静默丢尾部 |
| terminal turn timestamp/error | Turn terminal DTO 一次性包含 status、error、started/completed/duration |
| response item id prefix | 新 Item ID 必须有 domain prefix；历史读取可宽松，写入不可生成无前缀 ID |

## 不复制

| Codex surface | 原因 |
| --- | --- |
| `tui/chatwidget*` 的布局和输入交互 | Lime GUI 产品形态不同；只取 facade 和 projection 消费方式 |
| CLI auth、ChatGPT-only onboarding、`CODEX_HOME`/arg0 | 不符合多 provider 桌面产品 |
| rollout JSONL 作为 Lime runtime truth | Lime 使用 App Server + thread-store/read model；rollout 只作 import source |
| Codex provider-specific UI | provider wire 归 `model-provider`，GUI 只消费 capability projection |

## 复制前置清单

1. 确认 Codex Apache-2.0 `LICENSE`/`NOTICE` 随源文件保留，记录 provenance。
2. 检查 Lime workspace 是否已有同名 owner；有则替换，不新建平级 crate。
3. 删除 Lime 旧实现和正向 fixture，再保留最小负向 guard。
4. 运行 `npm run test:contracts`、Rust 定向测试和 `npm run smoke:agent-runtime-current-fixture`。
