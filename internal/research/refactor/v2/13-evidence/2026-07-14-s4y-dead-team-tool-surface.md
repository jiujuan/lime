# S4y Dead Team tool surface evidence

日期：2026-07-14

## 结论

Multi-Agent 的唯一 current 可执行链是：

```text
RuntimeCore durable graph / identity / mailbox
  -> per-turn AgentControlGatewayHandle
  -> ExecutionRequest
  -> RuntimeBackend opaque pass-through
  -> current provider
  -> spawn_agent / send_message / followup_task
     / wait_agent / interrupt_agent / list_agents
```

旧 `tool-runtime::collab_agent` 只在自身模块和内嵌测试中有引用，current provider 不注册它。该模块族以及 `Agent`、`SendMessage`、`TeamCreate`、`TeamDelete`、`ListPeers` 的静态 catalog、alias、prompt、discovery profile 与 native registry allowlist 已物理删除，不保留 compat wrapper。

## 写集结果

- 删除 `lime-rs/crates/tool-runtime/src/collab_agent.rs` 与 `collab_agent/**`。
- 从 `tool-runtime/src/lib.rs` 删除 module declaration。
- 从 native allowlist 和 turn surface 删除旧 Team 工具暴露逻辑。
- 从 lime-agent catalog、alias normalization 和系统提示删除旧 Team current 口径。
- 从 lime-core tool discovery profiles 删除旧工具及 `*Tool` alias。
- `tool-execution-smoke` 的 agent-control batch 改为六个 V2 工具，并按 request transcript 驱动父/子 Turn 并发 fixture。
- legacy catalog 与 contract guard 同时禁止旧物理路径、module、catalog、discovery 和 allowlist 回流。

## 边界分类

- `current`：RuntimeCore durable owner、per-turn AgentControl gateway、六个 V2 工具。
- `compat`：无新增；本 slice 不保留工具兼容入口。
- `deprecated`：无；旧 Team 工具不再处于迁移可执行状态。
- `dead`：`tool-runtime::collab_agent`、五个旧 Team 工具、静态 alias/catalog/prompt/discovery/allowlist。
- 独立后续：canonical `CollabAgentToolCall` / SubAgent 历史与展示 payload 仍用于 read/projection；JSON-RPC/GUI 和完整 restart recovery 未由本 slice 完成。

## 验证

- `cargo test --manifest-path lime-rs/Cargo.toml -p tool-runtime --lib -q`：249/249。
- `cargo test --manifest-path lime-rs/Cargo.toml -p lime-agent agent_tools::catalog --lib -q`：9/9。
- `cargo test --manifest-path lime-rs/Cargo.toml -p lime-agent current_provider_turn --lib -q`：13/13。
- `cargo test --manifest-path lime-rs/Cargo.toml -p lime-core tool_calling --lib -q`：23/23。
- `npx vitest run scripts/agent-runtime/tool-execution-smoke.test.mjs`：4/4。
- `npx vitest run src/lib/governance/legacySurfaceCatalog.test.ts`：205/205。
- `npm run test:contracts`：通过；App Server client contract 290 checks，命令、Harness、modality、scripts、release、docs boundary 全部通过。
- `npm run governance:legacy-report`：零引用候选 0、分类漂移候选 0、边界违规 0。
- touched Rust `rustfmt --check`：通过。
- exact write set `git diff --check`：通过。
