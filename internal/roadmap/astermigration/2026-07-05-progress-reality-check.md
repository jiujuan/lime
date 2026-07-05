# 2026-07-05 Aster 迁移进度现实校准

状态：active
用途：纠正“接近完成 / 99%”误判，重新按路线图退出条件评估进度。

## 结论

当前迁移不能标为“无 Aster 依赖完成态”，也不能按 `99%` 口径汇报。最初按 `README.md` 和主计划成功标准核算，整体目标完成度约 `65%`；后续多批 provider/tool/session/runtime 能力迁入 Lime-owned current crates 后，最新口径约 `89%`。

这个百分比的口径是退出条件完成度，不是已执行批次数：App Server / services / server / scheduler 等非 agent crate 的 direct Aster 依赖已基本收口，`tool_orchestrator` 的 Aster registry execution adapter 也已删除；但 `lime-agent` 仍直接依赖 Aster，root workspace 仍暴露 vendored Aster，`lime-rs/vendor/aster-rust` 仍存在，主 turn stream / provider / session adapter 和 Aster reply loop 内 native tool registry 仍有 Aster residual。

## Codex 对照结论

参考路径：`/Users/coso/Documents/dev/rust/codex/codex-rs`。

Codex 的 workspace 做法是把能力 owner 平铺为一等 crate，例如 `protocol`、`model-provider`、`thread-store`、`tools`、`core`、`app-server`、`exec-server`、`external-agent-sessions`、`external-agent-migration`，并通过 `[workspace.dependencies]` 统一引用。

Lime 已学习了这个方向，新增了 `agent-protocol`、`model-provider`、`thread-store`、`tool-runtime`、`agent-runtime` 等 current crate；但这些 crate 仍主要承担 DTO / 策略 / read-model 骨架，真正阻止删除 Aster 的执行事实源还在 `lime-agent` 兼容层内。

2026-07-05 至 2026-07-06 增量：`tool-runtime` 已继续承接 tool execution policy DTO、shell/network execution rules、persisted/runtime policy service、tool batch plan/outcome DTO、shell command planning helper、local execution process supervisor、shell parser / read-target preflight / concurrency analysis、shell command exit semantics、tool inventory registry definition DTO、extension config DTO、process output decode / Windows no-window / UTF-8 wrapper、platform shell runtime helper、WebSearch / WebFetch current executor 和相关单测；App Server 对纯 shell argv 文本提取、本地执行进程 supervisor、WebSearch preflight 与 workspace patch host WebSearch 执行已直接依赖 `tool-runtime`，不再经 `lime-agent` Aster registry adapter 消费。复核后确认 `lime-agent::agent_tools::execution::policy` 中旧 workspace permission builder 没有 production 消费者，已直接删除而不是迁成新壳；vendored Aster Bash/PowerShell 旧 safety API、写路径 validator、shell parser、read-target candidate collector、concurrency analysis、command semantics、subprocess / shell runtime helper、WebFetch/WebSearch fetch/search/cache/content 重复实现已清理或改为 current owner 内部委托。`agent_tools/tool_orchestrator/aster_registry_adapter.rs` 已删除，主 `tool_orchestrator.rs` 不再直接 import Aster registry / tool context / sandbox / `with_turn_context`。`agent-runtime` 已接收 reply input 与 reply stream envelope，`model-provider` provider stream handle metadata 已进入 `provider_trace` 后端 / 前端 / metrics 主链。尚未满足删除 `aster.workspace = true` 的条件，原因是 Aster `Provider` trait、`Agent::reply`、Aster `Message` / `AgentEvent` 转换、session store adapter、native tool overlay 与 Aster reply loop 内 WebFetch/WebSearch `Tool` trait 注册壳仍存在。

Cargo 官方 Workspaces 文档确认 `members` / `exclude` / `[workspace.dependencies]` 是 workspace 成员和共享依赖的事实源；因此 `vendor/aster-rust` 被 `exclude` 只能说明它已降级为外部 vendor，不能说明 current runtime 已脱离 Aster。

## 当前证据

截至本次复核：

- root workspace 仍有 `aster = { package = "aster-core", path = "vendor/aster-rust/crates/aster" }`。
- `lime-rs/crates/agent/Cargo.toml` 仍有 `aster.workspace = true`。
- `lime-rs/vendor/aster-rust` 仍存在，约 `13M`，当前有约 `671` 个文件。
- `lime-rs/crates/**` 中仍有约 `214` 处 `use aster::` / `aster::` / `aster_models::` 文本命中。
- 这些命中集中在约 `54` 个 Rust 文件，基本都在 `lime-agent`。
- `lime-agent/src` 当前仍有约 `213` 处 Aster 文本命中；排除测试目录后生产路径仍有约 `186` 处。
- `app-server` / `services` / `server` / `scheduler` 作为 crate-level direct Aster dependency 已迁出，这是已完成进度，但不是最终完成。
- `tool-runtime::shell_analysis` 是 shell parser / read-target preflight / concurrency analysis 的 current owner；`tool-runtime::shell_permission` 是 shell permission preflight 的 current owner；`tool-runtime::command_semantics` 是 shell command exit semantics 的 current owner；`tool-runtime::{subprocess, shell_runtime}` 是 process output decode、Windows no-window / UTF-8 wrapper、platform shell command 构造与 PowerShell runtime 探测的 current owner；`tool-runtime::{tool_definition, tool_extension, web_search, web_fetch, tool_executor}` 是 tool registry DTO、Web 工具和 tool execution contract 的 current owner。
- `agent_tools/tool_orchestrator/aster_registry_adapter.rs` 当前不存在；`tool_orchestrator` 工具批执行不再依赖 Aster `ToolRegistry` / `ToolContext` / `SandboxConfig`。剩余 tool blocker 转移到 Aster reply loop 内的 native tool registry / WebFetch / WebSearch `Tool` trait adapter。

## 成功标准复核

| 成功标准                                                                              | 当前状态                                                                                                | 判定                 |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------- |
| 根 `lime-rs/Cargo.toml` 不再暴露 `aster` / `aster-models`                             | `aster-models` 已移除，`aster` 仍作为 vendor dependency 暴露                                            | `partial`            |
| `lime-rs/crates/**` 不再出现 Aster import，除明确迁移 adapter 外                      | 仍有约 `214` 处命中，`lime-agent/src` 生产路径约 `186` 处；部分已集中为 adapter，部分仍在 provider / session / turn loop 主链附近 | `partial / blocking` |
| `app-server` 不直接构造 Aster provider / tool registry / session config / stream loop | crate direct dependency 已移除，相关守卫存在                                                            | `mostly_completed`   |
| GUI / evidence / replay / analysis 消费 current read model                            | 主链仍通过 App Server / runtime read model，未发现直接回流 Aster crate                                  | `mostly_completed`   |
| 守卫阻止 Aster 依赖和 import 回流                                                     | 已有守卫覆盖已迁 crate / 文件 / public surface；但 root `aster` 与 `lime-agent` dependency 仍是允许残留 | `partial`            |

## 当前分类

- `current`：`agent-protocol`、`model-provider`、`thread-store`、`tool-runtime`（含 `path_guard`、`shell_permission`、`shell_analysis`、`command_semantics`、`subprocess`、`shell_runtime`、`tool_definition`、`tool_extension`、`tool_executor`、`web_search`、`web_fetch`）、`agent-runtime`、App Server JSON-RPC / read model / evidence current 主链。
- `compat`：`lime-agent` 内部 Aster reply / event / provider / session store adapter；Aster reply loop 内的 native tool registry / WebFetch / WebSearch `Tool` trait adapter；`lime-rs/vendor/aster-rust`。
- `deprecated`：`lime-agent` 对 `aster.workspace = true` 的直接依赖，以及 root workspace 的 vendored `aster` dependency。
- `dead`：`lime-rs/crates/aster-rust/**` 作为 current crate 的形态；`compat-aster` 假 feature；公开 Aster wrapper / public facade；vendored Aster `tools/path_guard.rs` / `tools/command_semantics.rs` / `src/subprocess.rs` / `tools/shell_runtime.rs` 空壳或重复实现、shell analysis / read-target preflight / command semantics / process runtime public re-export、WebFetch/WebSearch fetch/search/cache/content 重复实现和 BashTool permission property tests；vendor 为 subprocess helper 恢复 `encoding_rs` direct dependency；`agent_tools/tool_orchestrator/aster_registry_adapter.rs`；`tool_orchestrator` 为 shell permission 临时注册 Aster `BashTool` / `PowerShellTool`、调用 Aster `check_tool_permissions` 或为了 policy metadata 重新构造 Aster `ToolError`；主 `tool_orchestrator.rs` 重新直接 import 或构造 Aster `ToolRegistry` / `ToolContext` / `ToolError` / `SandboxConfig` / `SandboxType` / `with_turn_context`；备份文件；已迁出的 App Server / services direct Aster dependency。

## 不能再使用的口径

- 不能说已经进入无 Aster 依赖完成态。
- 不能说整体 `99%`。
- 不能把 Phase 5 vendor 降级当作最终迁移完成。
- 不能把 Aster adapter 换名、私有化或集中化等同于删除 Aster。

## 下一刀

优先级最高的主线仍是删除 `lime-agent` 的 direct Aster dependency。下一刀应继续沿最短阻塞链推进：

1. `request_tool_policy/aster_reply_adapter.rs` 与 `credential_bridge/runtime_provider_adapter.rs`：current provider stream / turn executor 接管后删除 Aster provider/reply loop。
2. `agent_tools` / `native_tools`：`tool_orchestrator/aster_registry_adapter.rs` 已删除，下一步应处理 Aster reply loop 内 native tool registry / WebFetch / WebSearch `Tool` trait adapter，让工具调用完全走 `tool-runtime` current executor；已经迁出的 shell permission / shell analysis / command semantics / registry definition DTO / extension config DTO 只能留在 `tool-runtime`，不能回流到 vendored Aster 或 `lime-agent` projection。
3. `aster_session_store` 与 session/subagent adapters：把 session repository / metadata / extension state 迁入 `thread-store` current schema 后删除 Aster `SessionStore` trait adapter。

下一步不应继续制造新的 compat 层；能批量迁移 current owner 的地方直接迁，迁完立即删除旧 adapter 或把剩余 adapter 继续缩小到唯一退场点。
