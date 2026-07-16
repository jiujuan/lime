# S4an dead subagent tool exposure

日期：2026-07-15

## 结论

`tool-runtime::turn_tool_surface` 中的 `runtime_turn_tool_exposure_allows_tool_name`、
`SUBAGENT_ALLOWED_NATIVE_TOOL_NAMES`、`SUBAGENT_ALLOWED_COORDINATION_TOOL_NAMES` 与
`is_extension_prefixed_tool_name` 只有模块内测试引用，没有生产 caller。它们表达的是历史
“子代理只能使用固定工具白名单”的规则，会与 Codex V2 子 Agent 继续使用 AgentControl
构建递归树的目标冲突，且不是当前 provider step snapshot 的事实源。

本刀直接物理删除 dead API 与正向测试，不新增新的 subagent compat 规则；通用注册门禁、
resource gate、direct/local/compact surface 和 current per-turn AgentControl gateway 保持不变。

## 变更

- 删除两组 `SUBAGENT_ALLOWED_*` 常量和 subagent exposure 函数。
- 删除仅服务于该函数的 extension-prefix 特判。
- 删除 `subagent_tool_exposure_keeps_only_registered_current_tools` 正向测试。
- 扩展既有 `rust-retired-team-tool-surface` catalog/client-contract guard，禁止旧 API 和
  两组 whitelist 常量回流。
- 保留 `runtime_registered_tool_exposure_allows_tool_name` 与 `runtime_turn_tool_surface_allows_tool_name`，
  它们仍由 current tool surface 测试和 provider step snapshot 使用。

## 验证

- `rg` 全仓确认旧符号无生产/测试引用。
- `cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime turn_tool_surface`：7/7。
- `npm run test:contracts`：290 checks，治理目录册与 client contract 通过。
- `git diff --check`：通过。

## 后续边界

current `turn_execution` 已为 child session 注入 per-turn AgentControl gateway，provider step
snapshot 只按 gateway presence 暴露六工具，restart 测试也覆盖 child -> grandchild。因此本刀
删除的是误导性的 dead policy，并未打开一条新的递归执行路径。Codex 的 concurrency/residency
policy 仍需独立 slice；本刀不把该 policy 误报为已完成。
