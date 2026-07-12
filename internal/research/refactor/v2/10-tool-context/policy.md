# Tool、Approval、Context、Skills 与 Multi-Agent

> status: target control-plane contract
> owner: tool-runtime + agent-runtime
> last_verified: 2026-07-12
> codex_reference: `tools/**`, `core/src/tools/**`, `core-skills/**`, `agent-graph-store/**`

## Tool 控制面

复制 Codex 的稳定契约：

```text
ToolSpec -> exposed definition -> ToolCall(turn_id, call_id, environment)
  -> policy/approval -> executor -> normalized Output
  -> RuntimeEvent -> Item
```

`tool-runtime` 负责定义、参数 schema、权限、sandbox、dispatch、结果归一和 lifecycle；App Server 只做 method/connection 接线；GUI 只显示 Item。

工具输出的截断、sidecar/reference 和 duration 必须是结构化字段，不由 UI 文本猜测。

## Approval 与 Desktop 权限

```text
runtime policy decision
  != Electron host permission
```

Runtime approval 处理“该 Turn 是否允许此 action”；Electron 处理文件选择、通知、窗口、外链等宿主能力。两者通过 typed boundary 交互，不能共享一个全局 boolean 或让 Electron 解析 provider/tool 语义。

拒绝、取消、超时和 session 级批准都必须 materialize 成 approval Item，便于恢复和审计。

## MCP 三段式

借鉴 Codex `codex-mcp/connection_manager.rs`、`core/src/session/mcp_runtime.rs`：

1. `mcp` manager：连接、OAuth、server status、resource/tool discovery。
2. `tool-runtime` catalog：按 Thread/Turn snapshot 生成可见 tool definition。
3. App Server control plane：list/start/stop/oauth/call RPC；GUI 不直连 MCP。

MCP tool 名称和 server identity 是协议字段，不回退旧裸工具名或 mock 命名。

## Skills

复制 Codex `core-skills`/`ext/skills` 的 metadata、policy、dependency、authority/source、selection 结构：

- stable skill ID 不使用本地 path。
- 注入 context 前做 capability、权限和 token budget 检查。
- GUI 负责安装/启用/展示，runtime 负责选择和注入；两者不共享实现。
- 旧 skill 文本入口、catalog alias 和临时 path 迁移后删除。

## Context 与 Compaction

所有模型可见内容必须是 bounded fragment：

```text
user input
 + workspace facts
 + selected skills
 + memory/evidence summary
 + prior Item summary
 -> token budget check
 -> full content or sidecar reference
```

超预算内容进入 sidecar/evidence；compaction 是 runtime policy，不散落在 prompt 拼接函数。每类 fragment 记录 source、size、priority 和 truncation reason。

## Multi-Agent

复制 Codex `AgentControl`、graph store、session-scoped limiter/budget/mailbox 和 canonical `CollabAgentToolCall/SubAgentActivity`：

- parent/child Thread edge 由 `thread-store` 持久化。
- spawn/send/wait/resume/close 是 App Server typed method。
- 子 agent 的 provider/tool/context 仍走同一 runtime owner，不开第二个 loop。
- GUI 只显示 parent/child projection，不调度本地 Promise/worker。

## 删除目标

- Renderer 本地 tool registry、permission loop、MCP websocket 直连。
- 旧 `agent_runtime_*` tool/approval command surface。
- 以完整工具输出替代 bounded summary 的 prompt helper。
- 以 Team/Board UI 作为 multi-agent truth 的旧工作台。
- 重复的 skill catalog、tool inventory 和 approval normalizer。

## 验证

工具/审批：定向 Rust tests + current runtime fixture；MCP：`npm run test:contracts` + MCP current smoke；context：token budget/compaction fixtures；multi-agent：parent-child edge、mailbox、close/recover 和 GUI Gate B。
