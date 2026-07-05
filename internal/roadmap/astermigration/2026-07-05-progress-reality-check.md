# 2026-07-05 Aster 迁移进度现实校准

状态：active
用途：纠正“接近完成 / 99%”误判，重新按路线图退出条件评估进度。

## 结论

当前迁移不能标为“无 Aster 依赖完成态”，也不能按 `99%` 口径汇报。最初按 `README.md` 和主计划成功标准核算，整体目标完成度约 `65%`；后续 tool execution policy DTO、shell/network execution rules、persisted/runtime policy service、tool batch plan/outcome DTO 与 shell command planning helper 迁入 `tool-runtime` 后，最新口径约 `69%`。

这个百分比的口径是退出条件完成度，不是已执行批次数：App Server / services / server / scheduler 等非 agent crate 的 direct Aster 依赖已基本收口；但 `lime-agent` 仍直接依赖 Aster，root workspace 仍暴露 vendored Aster，`lime-rs/vendor/aster-rust` 仍存在，主 turn stream / provider / tool / session adapter 仍有大量 Aster residual。

## Codex 对照结论

参考路径：`/Users/coso/Documents/dev/rust/codex/codex-rs`。

Codex 的 workspace 做法是把能力 owner 平铺为一等 crate，例如 `protocol`、`model-provider`、`thread-store`、`tools`、`core`、`app-server`、`exec-server`、`external-agent-sessions`、`external-agent-migration`，并通过 `[workspace.dependencies]` 统一引用。

Lime 已学习了这个方向，新增了 `agent-protocol`、`model-provider`、`thread-store`、`tool-runtime`、`agent-runtime` 等 current crate；但这些 crate 仍主要承担 DTO / 策略 / read-model 骨架，真正阻止删除 Aster 的执行事实源还在 `lime-agent` 兼容层内。

2026-07-05 增量：`tool-runtime` 已继续承接 tool execution policy DTO、shell/network execution rules、persisted/runtime policy service、tool batch plan/outcome DTO、shell command planning helper 和相关单测；App Server 对纯 shell argv 文本提取已直接依赖 `tool-runtime`，不再经 `lime-agent` Aster adapter re-export 消费。`lime-agent::agent_tools::execution` 仍保留 Aster permission adapter 与 agent catalog 默认策略表，`tool_orchestrator` 仍保留 Aster `ToolRegistry`/`ToolContext` 执行 adapter，尚未满足删除 `aster.workspace = true` 的条件。

Cargo 官方 Workspaces 文档确认 `members` / `exclude` / `[workspace.dependencies]` 是 workspace 成员和共享依赖的事实源；因此 `vendor/aster-rust` 被 `exclude` 只能说明它已降级为外部 vendor，不能说明 current runtime 已脱离 Aster。

## 当前证据

截至本次复核：

- root workspace 仍有 `aster = { package = "aster-core", path = "vendor/aster-rust/crates/aster" }`。
- `lime-rs/crates/agent/Cargo.toml` 仍有 `aster.workspace = true`。
- `lime-rs/vendor/aster-rust` 仍存在，约 `13M`，当前有约 `676` 个文件。
- `lime-rs/crates/**` 中仍有约 `233` 处 `use aster::` / `aster::` / `aster_models::` 文本命中。
- 这些命中集中在约 `57` 个 Rust 文件，基本都在 `lime-agent`。
- 排除测试文件后，`lime-agent/src` 生产路径仍有约 `207` 处 Aster 文本命中。
- `app-server` / `services` / `server` / `scheduler` 作为 crate-level direct Aster dependency 已迁出，这是已完成进度，但不是最终完成。

## 成功标准复核

| 成功标准 | 当前状态 | 判定 |
| --- | --- | --- |
| 根 `lime-rs/Cargo.toml` 不再暴露 `aster` / `aster-models` | `aster-models` 已移除，`aster` 仍作为 vendor dependency 暴露 | `partial` |
| `lime-rs/crates/**` 不再出现 Aster import，除明确迁移 adapter 外 | 仍有约 `233` 处命中，部分已集中为 adapter，部分仍在主执行链附近 | `partial / blocking` |
| `app-server` 不直接构造 Aster provider / tool registry / session config / stream loop | crate direct dependency 已移除，相关守卫存在 | `mostly_completed` |
| GUI / evidence / replay / analysis 消费 current read model | 主链仍通过 App Server / runtime read model，未发现直接回流 Aster crate | `mostly_completed` |
| 守卫阻止 Aster 依赖和 import 回流 | 已有守卫覆盖已迁 crate / 文件 / public surface；但 root `aster` 与 `lime-agent` dependency 仍是允许残留 | `partial` |

## 当前分类

- `current`：`agent-protocol`、`model-provider`、`thread-store`、`tool-runtime`、`agent-runtime`、App Server JSON-RPC / read model / evidence current 主链。
- `compat`：`lime-agent` 内部 Aster reply / event / provider / tool registry / session store adapter；`lime-rs/vendor/aster-rust`。
- `deprecated`：`lime-agent` 对 `aster.workspace = true` 的直接依赖，以及 root workspace 的 vendored `aster` dependency。
- `dead`：`lime-rs/crates/aster-rust/**` 作为 current crate 的形态；`compat-aster` 假 feature；公开 Aster wrapper / public facade；备份文件；已迁出的 App Server / services direct Aster dependency。

## 不能再使用的口径

- 不能说已经进入无 Aster 依赖完成态。
- 不能说整体 `99%`。
- 不能把 Phase 5 vendor 降级当作最终迁移完成。
- 不能把 Aster adapter 换名、私有化或集中化等同于删除 Aster。

## 下一刀

优先级最高的主线仍是删除 `lime-agent` 的 direct Aster dependency。下一刀应继续沿最短阻塞链推进：

1. `request_tool_policy/aster_reply_adapter.rs` 与 `credential_bridge/runtime_provider_adapter.rs`：current provider stream / turn executor 接管后删除 Aster provider/reply loop。
2. `agent_tools` / `native_tools`：让 `tool-runtime` 接管 registry / batch execution read model，删除 Aster `ToolRegistry` / `ToolDefinition` 读取。
3. `aster_session_store` 与 session/subagent adapters：把 session repository / metadata / extension state 迁入 `thread-store` current schema 后删除 Aster `SessionStore` trait adapter。

下一步不应继续制造新的 compat 层；能批量迁移 current owner 的地方直接迁，迁完立即删除旧 adapter 或把剩余 adapter 继续缩小到唯一退场点。
