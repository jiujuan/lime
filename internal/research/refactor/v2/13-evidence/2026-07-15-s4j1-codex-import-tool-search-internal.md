# S4j1 Codex import internal ToolSearch

## 结论

Codex `tool_search_call` / `tool_search_output` 只属于 provider/rollout history。它们不再从 conversation import parser 生成 `item.started` / `item.completed`，也不再计入公开 imported Tool fidelity；普通 function/custom/web/MCP import 路径保持不变。

## 改动

- `codex/events.rs` 删除 `tool_search_call/output` 到 typed Tool runtime event 的 lowering。
- `codex/events.rs` 删除 `tool_search` 的 source-local tool name alias。
- `codex.rs` fidelity 统计仅保留实际 product-visible function/custom tool 类型。
- 新增 parser 负向回归，证明两种 ToolSearch payload 都返回空 runtime event 列表。

## 验证

- `cargo test --manifest-path lime-rs/Cargo.toml -p app-server conversation_import::codex::events::tests::codex_tool_search_stays_in_provider_history -- --nocapture`：`1 passed`
- `cargo test --manifest-path lime-rs/Cargo.toml -p app-server runtime::conversation_import::tests::runtime_events -- --nocapture`：`13 passed`
- `rustfmt --edition 2021 --check`（3 个 claimed Rust 文件）：通过
- `git diff --check`（claim 写集）：通过

## 治理分类

- `current`：Codex provider/rollout history 中的 ToolSearch discovery。
- `dead / forbidden-to-restore`：conversation import 公开 canonical Tool lifecycle 的 ToolSearch lowering 与 `tool_search` alias。
- `compat` / `deprecated`：无新增。

## 未验证项

完整 `npm run verify:local` 不在本 slice 重跑；当前工作树的后序 Content Factory `workflow/respond -> action_not_found` 与 S2t app-data/session fixture 失败仍由独立 owner 处理。
