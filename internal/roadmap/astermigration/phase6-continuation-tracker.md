# Phase 6 续跟踪

状态：active  
创建时间：2026-07-09  
上一段跟踪：`phase6-remaining-tracker.md`  
执行计划：`internal/exec-plans/aster-phase6-provider-reply-backend-plan.md`  
口径：Codex 有则迁，Codex 没有则删；不保无用户兼容。

## 用途

`phase6-remaining-tracker.md` 已记录 Phase 6 第一段 context 收口和 R2/R3 provider source 多刀推进。后续继续迁移不再向该文件追加长日志，本文件只跟踪当前剩余项、下一刀和新增验证结果。

## 当前主结论

整体目标完成度仍按约 `95%` 口径追踪，不能报 `99%` 或完成态。Aster 已不再是 Lime current runtime owner，`agent-compat` 也不是 owner，只是待迁出 staging / compat blocker；root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、以及 `agent-compat` 现存指向 current owner 的 burn-down 依赖仍未删除，说明 Phase 6 尚未闭环。Fast A1 已继续删除 no-op / empty queue / custom slash recipe stubs，但这只是在搬空外围，不改变核心 blocker 判定。

当前优先级已切换为 Phase 6 快通道：先清未使用 / Codex 无对应能力的 Aster-only surface，再批量迁移简单 DTO / projection / policy helper，最后集中处理 provider/reply loop、native registry、session store 这类复杂核心 blocker。`agent-compat` 不是冻结目录；只要改动方向是把生产调用迁出、删除 Aster-only surface 或减少 burn-down 依赖，就应直接推进。禁止的是新增 owner 依赖或在 staging crate 内继续补业务逻辑。

## 剩余清单

| ID  | 状态 | 分类            | 剩余项                                                                                                                                                                                                                  | 下一步 / 退出条件                                                                                                                                                                                            |
| --- | ---- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | open | deprecated      | root workspace 仍有 `aster = { package = "aster-core", path = "crates/agent-compat" }`，`lime-agent` 仍有 `aster.workspace = true`                                                                                      | 全部生产 `use aster::` 清零后删除 root dependency 和 package dependency。                                                                                                                                    |
| R2  | open | compat blocker  | Aster `reply_with_provider` / `Message` / `AgentEvent` 仍是最后 reply source backend；`lime-agent` compat adapter 已不再直接调用 Aster `Agent::reply(...)`                                                              | `agent-runtime` / `model-provider` 直接执行 current reply backend，删除 Aster reply adapters。                                                                                                               |
| R3  | open | compat blocker  | `credential_bridge/runtime_provider_adapter.rs` 已退回 provider binding factory；Aster provider trait object 最后一跳现集中在 `request_tool_policy/provider_reply_exit_source.rs::ProviderReplyExitSource` 私有退场模块 | provider trait object / provider stream execution 迁到 `model-provider` current backend；删除 `ProviderReplyExitSource`、私有 `run_provider_reply_exit_source(...)` 与 `reply_with_provider(...)` 最后一跳。 |
| R4  | open | compat blocker  | Aster `ToolRegistry` / `Tool` / `ToolContext` / `ToolResult` 仍服务未迁出的 reply loop native tool execution                                                                                                            | reply loop 改为直接调用 `tool-runtime::native_dispatch` / gateway executor；删除临时 Aster `Tool` 壳。                                                                                                       |
| R5  | open | compat blocker  | Aster `SessionStore` trait、`ThreadRuntimeStore`、runtime store DTO、queue store adapter 仍在边界内                                                                                                                     | Thread / Turn / Item persistence 只消费 `thread-store` / `agent-runtime` / App Server read model。                                                                                                           |
| R6  | open | compat blocker  | runtime conversation / timeline / event converter 仍从 Aster `TurnRuntime` / `ItemRuntimePayload` / `AgentEvent` 做 source adapter                                                                                      | current runtime events 和 Item projection 不再解析 Aster runtime DTO。                                                                                                                                       |
| R7  | open | compat blocker  | Aster `McpClientTrait` / extension manager / built-in extension clients 仍是 reply loop MCP bridge 形状；root `agent-compat/src/mcp/**` manager 已删除                                                                  | MCP request forwarding 和 inventory 归 `lime-mcp` / App Server current gateway；继续删除 Codex 无对应的 Aster-only extension surface。                                                                       |
| R8  | open | compat blocker  | `context_mgmt::compact_messages*` 仍被 Aster overflow / slash command path 使用                                                                                                                                         | Codex 对应语义若需要则迁到 `agent-runtime` context compaction owner；否则删除 Aster public surface。                                                                                                         |
| R9  | open | cleanup blocker | `agent-compat/src/agents/agent.rs`、`tools/registry.rs`、`session/runtime_store.rs`、`execution/manager.rs` 仍是大体量 staging 文件                                                                                     | R2-R8 迁完后按目录删除或拆到 current owner；不得继续在 staging 文件中补业务逻辑。                                                                                                                            |
| R10 | open | cleanup blocker | `agent-compat/Cargo.toml` 仍有 `document-preview`、`model-provider`、`tool-runtime` 等指向 Lime owner 的 burn-down 依赖                                                                                                 | 只允许作为现存 allowlist，不得新增 `agent-runtime` / `agent-protocol` / `thread-store` / App Server 等 owner 依赖；迁出对应调用后删除这些依赖。                                                              |

## 下一刀

1. Fast A：收缩 `agent-compat` public API。对外部 `aster::...` 零引用的顶层模块先从 `pub mod` 改为 crate-private `mod`，验证后继续按内部引用图物理删除。
2. Fast B：批量删除 Codex 无对应 current 面、且 Lime 前后端无消费的 Aster-only 目录 / wrapper / inline 正向测试；删除后补 forbidden-to-restore 守卫。
3. Fast C：批量迁移简单 DTO / projection / policy helper 到 current owner，并立刻删除 `agent-compat` 原 public surface。
4. Deferred Core：R2/R3 provider/reply loop、R4 native tool registry、R5/R6 session / event source adapter 暂列复杂核心，等外围搬空后集中替换。

## 快通道候选清单

| 批次          | 状态        | 分类                                    | 候选                                                                                                                                                                                                                                                | 动作                                                                                                                                            |
| ------------- | ----------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Fast A1       | in_progress | dead-candidate / public-surface cleanup | remaining：`context_mgmt`、`execution`、`mcp_utils`、`media`、`prompt_template`、`scheduler_trait`、`utils`；deleted/migrated：`hints`、`network`、`oauth`、`posthog`、`security`、`slash_commands`、`token_counter`、`tool_monitor`、`user_message_manager` | 外部 `aster::模块` 零引用；已删除 no-op / empty queue / custom slash recipe stubs，`network` 已迁到 `model-provider`，继续按内部引用图删除或迁出剩余模块。 |
| Fast A2       | ready       | compat blocker                          | `permission`、`recipe`、`scheduler`、`skills`、`tools`                                                                                                                                                                                              | 外部仍有引用或被 reply loop 间接依赖；不再新增逻辑，只按 current owner 分批迁出。                                                               |
| Fast B2       | completed   | aster-only-dead                         | `agent-compat/src/mcp/**` root MCP manager                                                                                                                                                                                                          | 外部生产引用为 0；Lime current MCP owner 是 `lime-mcp` / App Server gateway / `tool-runtime::mcp_*`，已物理删除并补 forbidden-to-restore 守卫。 |
| Fast B3       | completed   | aster-only-dead                         | `agent-compat/src/skills/**` registry / loader / executor 与 `agents/skills_extension.rs` `loadSkill` platform extension                                                                                                                            | Current owner 是 `lime-skills` + `tool-runtime::skill_execute` + App Server skill 数据源；已物理删除并补 forbidden-to-restore 守卫。            |
| Fast B1       | ready       | aster-only-dead                         | Aster-only browser signup、旧 config manager、旧 context framework、旧 vendor wrappers                                                                                                                                                              | 已在 README dead 清单记录；继续补守卫并清残留引用。                                                                                             |
| Deferred Core | open        | compat blocker                          | provider/reply loop、native `ToolRegistry`、Aster `SessionStore` / runtime item source                                                                                                                                                              | 等 Fast A/B/C 收完外围后集中替换，避免每刀都冷编完整 `aster-core`。                                                                             |

## 进度日志

### 2026-07-10：Fast A helper 迁出与 stub 删除

- `completed`：删除 `agent-compat/src/token_counter.rs`；`providers/usage_estimator.rs` 不再创建 Aster dummy token counter，改用 `tool-runtime::tool_io::estimate_tool_io_tokens` 做真实 fallback 估算，避免缺 usage provider 继续写入 0 token 假值。
- `completed`：迁出 `agent-compat/src/network/mod.rs` 的 localhost/system proxy bypass helper 到 `model-provider::http::should_bypass_system_proxy`；Aster provider HTTP client 与 Ollama toolshim 临时调用 current owner helper，旧 `crate::network::*` 不得恢复。
- `completed`：删除零引用 `agent-compat/src/oauth.rs` root stub；provider OAuth 当前仍在 `providers/oauth.rs`，本轮未删除真实 provider OAuth flow。
- `completed`：删除 `agent-compat/src/hints/mod.rs`；该模块实际永远返回空 hints。Codex-style AGENTS current owner 已在 `lime-agent/src/prompt/runtime_agents.rs` / App Server prompt context 主链，Aster hints stub 不再保留。
- `completed`：从 `agent-compat/Cargo.toml` 删除已无 Rust 引用的 `tiktoken-rs`、`include_dir`、`oauth2`、`ignore` 直接依赖；`url` 仍被 provider/auth 代码使用，保留。
- `guarded`：`asterMigrationBoundary.test.ts` 增加已迁 helper / 已删 stub guard，禁止恢复 `network`、`token_counter`、`hints`、root `oauth` 文件及旧函数名 / 旧 `mod` / 旧调用点。
- `classification`：`current` = `model-provider::http::should_bypass_system_proxy`、`tool-runtime::tool_io::estimate_tool_io_tokens`；`dead / deleted / forbidden-to-restore` = Aster dummy token counter、Aster network helper、root OAuth bail stub、empty hints loader；`compat blocker` = `prompt_template`、`context_mgmt`、`execution`、`scheduler_trait` 仍被 reply loop / subagent / scheduler staging 使用。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core -- --check`。
- `passed`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p model-provider --lib -j 2`。
- `passed`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `next`：继续 Fast A 处理 `prompt_template` / `context_mgmt` 这类 still-called stub；若会牵动 reply loop 大块行为，推入 Deferred Core，不为了删文件恢复 Aster 语义。

### 2026-07-10：Fast A no-op / custom slash recipe stub 批量删除

- `completed`：删除 `agent-compat/src/slash_commands.rs`，移除 `Agent::reply(...)` 中 custom slash recipe telemetry 分支，并把 `execute_commands` 的未知 slash fallback 从 Aster recipe file lookup 改为 `Ok(None)`。Codex 有 TUI slash command，但没有 Aster 这种任意 `/xxx` 绑定本地 recipe 文件并注入 prompt 的 runtime 语义；当前实现还只是永远返回 `None` 的 stub。
- `completed`：删除 `agent-compat/src/posthog.rs`，移除 scheduler / retry / provider error path 中只调用 no-op telemetry 的代码；保留原有 `tracing` 日志和错误控制流。
- `completed`：删除 `agent-compat/src/security.rs` 与 `agent-compat/src/tool_monitor.rs`，默认 tool inspection 只保留仍有真实权限行为的 `PermissionInspector`；`SecurityInspector` 永远返回空检查结果，`RepetitionInspector` 永远不触发重复检查，Codex 无需这类 Aster-only 空壳。
- `completed`：删除 `agent-compat/src/user_message_manager.rs`，移除 reply loop 中每轮 tool stream 都 drain 空 user queue 的调用；真实 elicitation 消息仍由 `ActionRequiredManager` 维护，后续该面随 R4/R7/R2 迁出继续收口。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 no-op stub forbidden-to-restore 清单，要求 `posthog.rs`、`security.rs`、`slash_commands.rs`、`tool_monitor.rs`、`user_message_manager.rs` 及其旧 `mod` / 函数名 / 调用点不得恢复。
- `guarded`：修正 `asterMigrationBoundary.test.ts` 中 provider source execution 守卫，使其锁定当前真实 contract：provider execution runner 接收 `RuntimeReplyProviderSourceBackendRequest`，并只在 `provider_reply_exit_source.rs` 私有退场点内 materialize `RuntimeReplyProviderSourceExecution`。
- `classification`：`dead / deleted / forbidden-to-restore` = custom slash recipe stub、Aster Posthog no-op telemetry、Aster security no-op inspector、Aster repetition no-op inspector、Aster user message empty queue；`current` = permission inspection 仍由现有 permission path 承接，ActionRequired elicitation 仍由 `ActionRequiredManager` 承接；`compat blocker` = provider/reply loop、MCP extension bridge、scheduler / recipe / session store 仍在 R2-R8。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --check`。
- `passed`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server -j 2`；仅保留既有 `lime-agent` warning：`NativeRegistration::name` 未使用。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`148 passed`。
- `next`：继续 Fast A/B 批量扫 `hints`、`network`、`oauth`、`prompt_template`、`token_counter`、`utils` 等内部引用；能判 no-op / Aster-only 的直接删，仍服务 provider / reply loop / tool registry / session store 的推入 Deferred Core 或迁到 current owner。

### 2026-07-10：Fast A 零引用 stub 删除与骨架编译恢复

- `completed`：删除 `agent-compat/src/claude_plugin_cache.rs`、`agent-compat/src/agents/platform_tools.rs` 与 `agent-compat/src/agents/schedule_tool.rs`；前者只有 root `mod` 声明，后两者分别定义未注册的 Aster `platform__manage_schedule` 假工具面和无调用 handler，Lime current 无外部生产消费。
- `completed`：移除 `agents/mod.rs` 的 `pub mod platform_tools;` / `mod schedule_tool;`，并用 `asterMigrationBoundary.test.ts` 将三个文件列为 `deleted / forbidden-to-restore`，防止零引用 Aster-only surface 回流。
- `completed`：恢复 `agent-compat` 骨架编译：`mcp_utils` 回到 `rmcp::model::ErrorData` 结果类型，`declarative_providers` 不再 include 已删除固定 provider 目录，`context_mgmt` 保持 fail-closed 空实现，`sandbox` 只保留兼容输出 DTO，不恢复旧 Aster sandbox 运行时。
- `classification`：`dead / deleted / forbidden-to-restore` = `claude_plugin_cache`、Aster `platform__manage_schedule` public tool definition 与 schedule management handler；`compat blocker` = scheduler trait 与 scheduler runtime 仍被 reply loop / scheduler staging 引用，等 scheduler / recipe 面迁出或删除时集中清理；`current` = Lime schedule / runtime 后续只能进入 App Server / current scheduler owner，不通过 Aster platform tool 面。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --check`。
- `passed`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`，恢复 `aster-core` staging crate 编译。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`147 passed`。
- `next`：继续 Fast A/B，按引用图优先处理 `slash_commands` / recipe public 面；仍被 R2/R4/R5/R7 核心链命中的 provider、reply loop、ToolRegistry、SessionStore 不再用 stub 续命，后续要迁到 current owner 或整块删除。

### 2026-07-10：Aster skills registry / loadSkill extension 删除

- `completed`：确认生产代码里 `agent-compat/src/skills/**` 只剩旧 `agents/skills_extension.rs` 使用；Lime current Skill owner 已是 `lime-skills`、`tool-runtime::skill_execute` / `skill_gate` / `skill_result` 与 App Server skill 数据源。
- `completed`：删除 `agent-compat/src/skills/**` 7 个源码文件与 `agents/skills_extension.rs`，并从 `agent-compat/src/lib.rs`、`agents/mod.rs`、`agents/extension.rs` 移除 `pub mod skills` / `skills_extension` / `loadSkill` platform extension 注册。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-compat/src/skills` 目录和 `agents/skills_extension.rs` 不得恢复，并禁止 `agent-compat` root / agents / extension 注册面恢复 `skills_extension`、`pub mod skills` 或 `loadSkill`。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster skills registry / loader / executor / workflow helper 和 `loadSkill` platform extension；`current` = `lime-skills`、`tool-runtime::skill_execute`、App Server skill data source；`compat blocker` = `LimeSkillTool` 仍是 Aster `Tool` trait 外壳，等 R4 reply loop tool execution 迁出时删除。
- `next`：继续 Fast B/A，优先清理无外部生产引用的 Aster-only extension / recipe / scheduler 外围；复杂 `ToolRegistry` / provider / session blocker 后置集中处理。

### 2026-07-10：root Aster MCP manager 删除

- `completed`：收紧引用扫描确认 `agent-compat/src/mcp/**` 除自身内部外没有 Lime current crates 生产调用；外部命中只剩路线图历史记录与 `lime-agent` 自有 `crate::mcp::McpToolDefinition`，不是 Aster root MCP manager。
- `completed`：删除 `agent-compat/src/mcp/**` 共 18 个源码文件、约 1.2 万行，并从 `agent-compat/src/lib.rs` 移除 `pub mod mcp;`。
- `guarded`：`asterMigrationBoundary.test.ts` 将 `mcp` 加入已删除 Aster vendor public module 清单，要求目录和 root public export 不得恢复。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster root MCP manager；`compat blocker` = `agents/mcp_client.rs`、Aster extension manager / built-in extension clients 仍服务未迁出的 reply loop MCP bridge；`current` = `lime-mcp`、App Server MCP gateway、`tool-runtime::mcp_notification` / `mcp_resource` / `tool_search`。
- `next`：继续 Fast B/A，先清外部零引用且不参与 public type 泄露的 Aster-only surface；`agents/mcp_client.rs` 等 R7 blocker 等 reply loop / extension manager 迁出时集中删除。

### 2026-07-10：Phase 6 快通道切换与 public surface 收缩

- `completed`：Phase 6 active tracker 从“先硬啃 R2/R3 provider / reply loop”切换为快通道：未使用 / Codex 无对应能力先删，简单 DTO / projection / policy helper 批量迁移，复杂核心 blocker 后置集中处理。
- `completed`：扫描 `lime-rs/crates/**` 外部 `aster::模块` 引用，确认 Fast A1 模块没有 Lime current crates 外部消费。
- `completed`：`agent-compat/src/lib.rs` 中 `claude_plugin_cache`、`context_mgmt`、`execution`、`hints`、`mcp_utils`、`media`、`network`、`oauth`、`posthog`、`prompt_template`、`scheduler_trait`、`security`、`slash_commands`、`token_counter`、`tool_monitor`、`user_message_manager`、`utils` 已从 `pub mod` 收缩为 crate-private `mod`。
- `completed`：`asterMigrationBoundary.test.ts` 增加守卫，禁止 Fast A1 模块重新作为 `agent-compat` public API 暴露；后续若需要能力，只能迁到 current owner 或继续删除。
- `classification`：`dead-candidate / public-surface cleanup` = Fast A1 modules；`compat blocker` = 仍被外部或 reply loop 使用的 Aster core modules；`current` = 对应 owner crate 后续接收点。
- `next`：继续 Fast A，按内部引用图把这些 private-only 模块中 Codex 无对应能力的目录物理删除；能迁的简单 DTO / projection / policy helper 批量迁到 current owner。

### 2026-07-09：拆分续跟踪

- `completed`：冻结 `phase6-remaining-tracker.md`，后续不再向第一段跟踪文件追加长进度。
- `completed`：新建本文件作为 Phase 6 active tracker。
- `completed`：重新列出 R1-R9 剩余 blocker，并把下一刀收敛到 R2/R3 provider / reply loop。
- `classification`：`current` = 本文件作为 active tracker；`frozen evidence` = `phase6-remaining-tracker.md`；`compat blocker` = R1-R9。
- `next`：继续 R2/R3 代码迁移；每完成一刀，只在本文件追加短日志和验证结果。

### 2026-07-09：R2/R3 provider source backend host 形状收缩

- `completed`：`model-provider::provider_stream::RuntimeReplyProviderSourceBackend` 从 `RuntimeReplyProviderSourceBackend<H, R>` 收缩为 `RuntimeReplyProviderSourceBackend<R>`；current contract 只表达 source request -> provider stream，不再把 Aster `Agent` 或任意 host 泛型写入 provider source backend 形状。
- `completed`：`ConfiguredReplyProvider` 不再直接实现 provider source backend，也不再通过 Aster-host `stream_reply_with_agent(...)` facade 执行；它只保留 current `RuntimeReplyProviderHandle` 和私有 compat backend，并通过 `into_reply_source(agent)` 生成短生命周期 `ConfiguredReplyProviderSource`。
- `completed`：`ConfiguredReplyProviderSource` 成为唯一仍持有 Aster `Agent` host、Aster provider trait object 和 `Agent::reply_with_provider(...)` 的私有 compat source；`ReplyExitSourceExecutor::run_provider(...)` 只把 current source request 交给该 source。
- `classification`：`current` = `model-provider` 不依赖 Aster provider source backend request contract；`compat blocker` = `ConfiguredReplyProviderSource` 最后一跳 Aster execution；`dead / guarded` = `RuntimeReplyProviderSourceBackend<Agent, ...>`、`host: &'a H`、`ConfiguredReplyProvider::stream_reply_with_agent(...)`。
- `next`：继续 R2/R3，拆掉 `ConfiguredReplyProviderSource` 内部的 Aster `Agent::reply_with_provider(...)` / provider trait object 执行边界。

### 2026-07-09：R2 default source 入口收敛到 reply_with_provider

- `completed`：`ReplyExitSourceExecutor::run_default(...)` 不再调用 Aster `Agent::reply(...)`；default path 改为显式 `self.agent.provider().await?` 后走同一 `Agent::reply_with_provider(...)` 最后一跳。
- `completed`：`asterMigrationBoundary.test.ts` 更新守卫，要求 `aster_reply_backend_adapter.rs` 中 direct `.reply(` 为 `dead / guarded`，只允许 `provider()` + `.reply_with_provider(...)` 的单一 Aster 最后一跳。
- `classification`：`current` = `agent-runtime::reply_backend` default/provider source call handoff；`compat blocker` = Aster `Agent::reply_with_provider(...)` 仍承接最终 execution；`dead / guarded` = `lime-agent` compat adapter 直接调用 Aster `Agent::reply(...)`。
- `next`：继续 R2/R3，替换 `reply_with_provider(...)` 内部 provider stream / tool loop execution；R4 native tool registry 仍是紧随其后的 blocker。

### 2026-07-09：R2/R3 provider source handoff 上提到 agent-runtime

- `completed`：`agent-runtime::reply_backend::run_provider_source_backend(...)` 承接 provider path 的 configured provider binding、source request materialization 与 `RuntimeReplyProviderSourceBackendCall` 创建；缺 provider 时继续由 current `RuntimeReplyProviderSourceBindingError` fail closed。
- `completed`：`ReplyExitSourceExecutor::run_provider(...)` 不再本地调用 `required_provider(...)`、`into_source_request(...)`、`RuntimeReplyProviderSourceBackendCall::new(...)` 或 `.stream_reply(...)`；provider path 只委托 current helper，并提供 `provider.into_reply_source(self.agent)` 的短生命周期 compat source factory。
- `completed`：`asterMigrationBoundary.test.ts` 更新守卫，要求 provider source binding / source request / backend call 留在 `agent-runtime`，Aster backend adapter 不得恢复本地 provider binding、source request materialization 或 backend call 构造。
- `classification`：`current` = `agent-runtime::reply_backend::run_provider_source_backend(...)` provider source handoff；`compat blocker` = `ConfiguredReplyProviderSource` 仍持有 Aster `Agent` host、Aster provider trait object 并调用 `Agent::reply_with_provider(...)`；`dead / guarded` = compat adapter 本地 `required_provider(...)` / `into_source_request(...)` / `RuntimeReplyProviderSourceBackendCall::new(...)` / direct `.stream_reply(...)`。
- `next`：继续 R2/R3，替换 `ConfiguredReplyProviderSource` 内部的 Aster provider trait object execution；完成后才能进入 R4 native tool registry 删除。

### 2026-07-09：R3 provider source execution 从 credential bridge 移出

- `completed`：`credential_bridge/runtime_provider_adapter.rs::ConfiguredReplyProvider` 不再创建 `ConfiguredReplyProviderSource`，也不再 import Aster `Agent` / `AgentEvent` 或实现 `RuntimeReplyProviderSourceBackend`；该文件只保留 current `RuntimeReplyProviderBinding`、provider capability projection 与 `into_compat_provider()` 临时取出 provider trait object。
- `completed`：`request_tool_policy/provider_reply_exit_source.rs::ProviderReplyExitSource` 承接唯一剩余 provider path Aster source implementation；`ReplyExitSourceExecutor::run_provider(...)` 仍只委托 `agent-runtime::reply_backend::run_provider_source_backend(...)`，source request / backend call 构造不回流 compat adapter。
- `completed`：`asterMigrationBoundary.test.ts` 更新守卫，禁止 `credential_bridge` 恢复 `ConfiguredReplyProviderSource`、`RuntimeReplyProviderSourceRequest`、`RuntimeReplyProviderSourceBackend`、Aster `Agent` host 或 `.reply_with_provider(...)` execution；允许 `ProviderReplyExitSource` 作为删除前唯一临时 implementation。
- `classification`：`current` = `credential_bridge` provider binding factory + `agent-runtime` provider source handoff；`compat blocker` = `ProviderReplyExitSource` 内部 Aster `Agent::reply_with_provider(...)` 与 Aster provider trait object；`dead / guarded` = `ConfiguredReplyProviderSource` / `into_reply_source(agent)` / credential bridge reply execution。
- `next`：继续 R2/R3，把 `ProviderReplyExitSource` 替换成 current provider/reply backend；随后进入 R4 native tool registry 删除。

### 2026-07-09：R2 reply loop attempt 纯规则迁到 agent-runtime（已纠偏）

- `completed`：`agent-runtime::reply_loop` 承接 provider/reply loop 的 `max_turns` 默认值、attempt 计数和 max-turn reached 文案；该模块不引入 provider、tool、session store、Aster event 或 Aster DTO。
- `corrected`：撤回 `agent-compat -> agent-runtime` 反向依赖；`agent-compat/src/agents/agent.rs::reply_internal(...)` 仍是待迁出 staging blocker，不允许通过消费 `agent-runtime::reply_loop` 来伪装完成。
- `completed`：`asterMigrationBoundary.test.ts` 增加守卫，要求 `agent-compat/Cargo.toml` 不得依赖 `agent-runtime`，并显式把 `agent.rs` 本地 `turns_taken` / `DEFAULT_MAX_TURNS` 标为 R2/R9 残留。
- `classification`：`current` = `agent-runtime::reply_loop::{RuntimeReplyLoop, RuntimeReplyLoopStep}` 作为目标 owner 骨架；`compat blocker` = Aster `reply_internal(...)` 仍执行 provider stream、tool loop、session/event source 和本地 attempt 计数；`dead / guarded` = `agent-compat` 反向依赖 `agent-runtime`。
- `next`：继续 R2/R3，把 `reply_internal(...)` 中 provider stream start / provider event loop 抽成 current provider execution contract；完成真实调用迁移后，再让生产消费者使用 `agent-runtime::reply_loop`，而不是让 `agent-compat` 直接消费。

### 2026-07-09：R2/R3 provider trace contract 收到 current owner

- `completed`：`agent-protocol::provider_trace` 从单一 `ProviderTraceStage` 扩展为 不依赖 Aster provider trace public contract，承接 `ProviderTraceEvent`、`ProviderTraceFailure`、`ProviderTraceResponseContext` 和 `runtime_event_type_for_provider_trace_stage(...)`。
- `completed`：App Server `runtime_backend/tool_events.rs` 不再本地维护 provider trace stage -> runtime event type 映射，改为消费 `agent-protocol` current owner。
- `completed`：新增 `agent-runtime::provider_trace::RuntimeProviderTraceAttempt`，承接 provider trace attempt lifecycle 的 request started、first event、first text delta、failed、canceled elapsed-time / once-only 规则；该模块不引入 Aster DTO、Aster provider trait 或 session store。
- `corrected`：未在 `agent-compat` staging crate 内补 provider trace 业务逻辑；此前误把 `agent-compat` 接向 current owner 的方向已撤回。`agent-compat/src/agents/agent.rs` 仍是待迁 staging blocker，后续只能迁出或删除，不能继续补逻辑。
- `corrected`：`asterMigrationBoundary.test.ts` 的 provider metadata 守卫改为检查 `agent-protocol::provider_trace` current DTO，而不是要求 `lime-agent` `protocol.rs` 重新复制散字段；这与 `AgentEvent::ProviderTrace { #[serde(flatten)] event: AgentProviderTraceEvent }` 收敛方向一致。
- `classification`：`current` = `agent-protocol::provider_trace` public DTO / event type mapping + `agent-runtime::provider_trace` Turn lifecycle skeleton；`compat blocker` = Aster `ProviderTraceEvent` / `ProviderTraceStage` 仍存在于 `agent-compat` reply loop source；`dead / guarded` = App Server 本地 provider trace event type match、`agent-compat` 反向依赖 current owner。
- `next`：继续 R2/R3，把 provider stream execution 迁到 current backend 后，由 current event source 直接产出 `agent-protocol::provider_trace::ProviderTraceEvent`，再删除 Aster trace DTO 和 `Agent::reply_with_provider(...)` 最后一跳。

### 2026-07-09：provider trace runtime metadata owner 上提到 model-provider

- `completed`：`model-provider::provider_stream::RuntimeReplyProviderTraceMetadata` 承接 `RuntimeReplyProviderHandle` -> `ProviderTraceEvent` 的 runtime provider metadata projection，包含 `runtime_provider_backend`、`runtime_provider_selector`、`runtime_provider_protocol`、`runtime_provider_active_model`。
- `completed`：`agent-runtime::provider_trace` 退回纯 Turn lifecycle，只保留 request started / first event / first text delta / failed / canceled elapsed-time 与 once-only 规则，不再 import `RuntimeReplyProviderHandle` 或 `ModelProviderProtocol`。
- `completed`：`agent_reply_stream.rs` 只从 `model-provider::provider_stream::apply_runtime_provider_metadata(...)` 调用 current helper，不再本地复制 provider/model/protocol 字段选择，也不从 `agent-runtime` 拿 provider metadata helper。
- `completed`：`asterMigrationBoundary.test.ts` 固定 provider metadata owner：required snippets 检查 `model-provider::provider_stream`，并禁止 `agent-runtime::provider_trace` 恢复 provider handle / protocol / metadata helper。
- `corrected`：本刀未在 `agent-compat` staging crate 内补 provider metadata 业务逻辑；`agent-compat/src/agents/agent.rs` 仍是 R2/R9 staging blocker，只能迁出或删除，不能继续补逻辑。
- `classification`：`current` = `model-provider` provider handle metadata projection + `agent-protocol` provider trace DTO + `agent-runtime` Turn lifecycle；`compat blocker` = Aster provider/reply loop 仍从 `Agent::reply_with_provider(...)` 产出源事件；`dead / guarded` = `agent-runtime` provider metadata owner、`lime-agent` 本地 enrichment helper。
- `next`：继续 R2/R3，把 `ProviderReplyExitSource` 内部 Aster provider trait object execution 替换成 current provider/reply backend。

### 2026-07-09：R2 default source backend call 上提到 agent-runtime

- `completed`：`agent-runtime::reply_backend::RuntimeReplyDefaultCall::into_source_request(...)` 与 `run_default_provider_source_backend(...)` 承接 default path 的 source request materialization 和 `RuntimeReplyProviderSourceBackendCall` 创建。
- `completed`：`ReplyExitSourceExecutor::run_default(...)` 不再本地调用 `lower_aster_reply_message(...)`、`to_aster_session_config(...)` 或 `Agent::reply_with_provider(...)`；default path 只显式取 Aster provider 后委托 current helper。
- `completed`：`request_tool_policy/aster_reply_backend_adapter.rs` 中 `.reply_with_provider(...)` 从 default/provider 两处收缩为 `ProviderReplyExitSource` 内唯一一处最后一跳；`asterMigrationBoundary.test.ts` 固定 default executor 不得恢复 direct Aster reply execution。
- `classification`：`current` = `agent-runtime::reply_backend` default source request / backend call handoff；`compat blocker` = `ProviderReplyExitSource` 内 Aster `Agent::reply_with_provider(...)` 与 Aster provider trait object；`dead / guarded` = `ReplyExitSourceExecutor` direct Aster DTO lowering / direct `.reply_with_provider(...)`。
- `next`：继续 R2/R3，把 `ProviderReplyExitSource` 内部 Aster provider trait object execution 替换成 current provider/reply backend；完成后进入 R4 native tool registry 删除。

### 2026-07-09：R2/R3 provider source request alias 固定到 agent-runtime

- `completed`：`agent-runtime::reply_backend` 新增 `RuntimeReplyProviderSourceBackendRequest` 与 `RuntimeReplyProviderSourceRunCall` current alias，并让 `RuntimeReplyProviderSourceRequest::into_backend_call(...)` 承接 backend call 构造；`run_provider_source_backend(...)` / `run_default_provider_source_backend(...)` 不再直接散落 `RuntimeReplyProviderSourceBackendCall::new(source_request)`。
- `completed`：`ProviderReplyExitSource` 改为实现 `RuntimeReplyProviderSourceBackend<RuntimeReplyProviderSourceBackendRequest>` 并接收 `RuntimeReplyProviderSourceRunCall`；compat adapter 不再写完整 `RuntimeReplyProviderSourceRequest<RuntimeReplyMessage, AgentSessionConfig>` 泛型形状，Aster DTO lowering 仍限制在该最后一跳内部。
- `completed`：`asterMigrationBoundary.test.ts` 更新守卫，要求 provider source request alias、run call alias 与 `into_backend_call(...)` 留在 `agent-runtime`，并禁止 compat executor / adapter 恢复 backend call 构造、source request materialization 或 credential bridge reply execution。
- `corrected`：本刀未在 `agent-compat` staging crate 内补 source request 业务逻辑；`agent-compat` 仍只能迁出或删除，不能再承接 R2/R3 新逻辑。
- `classification`：`current` = `agent-runtime` provider source request / run call / backend call materialization contract；`compat blocker` = `ProviderReplyExitSource` 内 Aster `Agent::reply_with_provider(...)` 与 Aster provider trait object；`dead / guarded` = compat adapter 本地 `RuntimeReplyProviderSourceRequest<RuntimeReplyMessage, AgentSessionConfig>` 完整泛型拼装和 `RuntimeReplyProviderSourceBackendCall::new(source_request)`。
- `next`：继续 R2/R3，真正替换 `ProviderReplyExitSource` 内部 Aster provider trait object execution；该步完成前仍不能进入 root `aster` dependency 删除。

### 2026-07-09：R2/R3 Aster provider execution 退场点显式化

- `completed`：`ProviderReplyExitSource` 的 trait impl 只保留 `run_provider_reply_exit_source(self.agent, self.provider, call)` 委托；Aster DTO lowering 与 `Agent::reply_with_provider(...)` 被集中到一个私有退场函数。
- `completed`：`asterMigrationBoundary.test.ts` 增加守卫，要求 `run_provider_reply_exit_source` 不能成为 public API，并要求 `ProviderReplyExitSource` impl 不得直接持有 `lower_aster_reply_message(...)`、`to_aster_session_config(...)` 或 `.reply_with_provider(...)`。
- `corrected`：本刀未在 `agent-compat` staging crate 内补 provider execution 业务逻辑，也不把 `agent-compat` 接入 current owner；`agent-compat` 继续按待迁出 staging / compat blocker 追踪。
- `classification`：`current` = `agent-runtime` provider source request / run call contract；`compat blocker` = 私有 `run_provider_reply_exit_source(...)` 退场点；`dead / guarded` = 在 trait impl、credential bridge 或 `agent-compat` 内扩散 Aster reply execution。
- `next`：继续 R2/R3，把 `run_provider_reply_exit_source(...)` 整体替换为 current provider/reply backend；随后进入 R4 native tool registry 删除。

### 2026-07-09：R2/R3 source-call map lowering 面删除

- `completed`：删除 `RuntimeReplyDefaultSourceCall::map(...)`、`RuntimeReplyProviderSourceCall::map(...)` 与 `RuntimeReplySourceRun::map(...)`；Turn owner 不再提供把 current reply message / session config 提前映射成 Aster DTO 的通用入口。
- `completed`：删除 `reply_backend` 中只覆盖 map lowering 的 `*_maps_current_payload_for_compat_boundary` 正向测试；current 证据改由 `into_source_request(...)`、`into_backend_call(...)`、`run_default_provider_source_backend(...)` 和 `run_provider_source_backend(...)` 测试承担。
- `completed`：`asterMigrationBoundary.test.ts` 增加守卫，禁止 `agent-runtime::reply_backend` 恢复 `pub fn map<M, C>` / `call.map(...)`，并禁止 `aster_reply_backend_adapter.rs` 重新调用 `call.map(...)`。
- `classification`：`current` = `agent-runtime` source request / backend call handoff；`dead / guarded` = source-call map lowering API；`compat blocker` = 私有 `run_provider_reply_exit_source(...)` 内 Aster DTO lowering 和 `Agent::reply_with_provider(...)` 最后一跳。
- `next`：继续 R2/R3，把 `run_provider_reply_exit_source(...)` 替换为 current provider/reply backend；替换后才能进入 R4 native tool registry 删除。

### 2026-07-09：R2/R3 provider source execution payload 上提到 agent-runtime

- `completed`：`agent-runtime::reply_backend::RuntimeReplyProviderSourceExecution` 承接 `RuntimeReplyProviderSourceRunCall` -> current source execution parts 的 materialization，保留 `RuntimeReplyMessage`、`RuntimeReplyStreamRequest`、`AgentSessionConfig` 与 cancel token；provider source backend implementation 不再需要直接拆 `RuntimeReplyProviderSourceBackendCall`。
- `completed`：`request_tool_policy/provider_reply_exit_source.rs::run_provider_reply_exit_source(...)` 改为通过 `RuntimeReplyProviderSourceExecution::from_run_call(call).into_parts()` 取 current execution parts；Aster DTO lowering、`to_aster_session_config(...)`、`Agent::reply_with_provider(...)` 与 Aster stream projection 仍集中在该私有退场点。
- `completed`：`asterMigrationBoundary.test.ts` 更新守卫，要求 provider source execution payload 归属 `agent-runtime`，并禁止退场函数恢复 `call.into_source_request().into_parts()` 直拆；2026-07-10 已进一步纠偏，provider source backend wrapper 归属 `model-provider`。
- `corrected`：本刀未在 `agent-compat` staging crate 内补 provider source execution 业务逻辑；`agent-compat/src/agents/agent.rs` 仍是 R2/R9 staging blocker，不能再补逻辑。
- `classification`：`current` = `agent-runtime` Turn source execution payload materialization；`compat blocker` = 私有 `run_provider_reply_exit_source(...)` 最后一跳 Aster execution/projection；`dead / guarded` = compat adapter 直接拆 backend call / source request。
- `next`：继续 R2/R3，把 `run_provider_reply_exit_source(...)` 内的 Aster provider trait object execution 替换成 current provider/reply backend；完成前仍不能删除 root `aster` dependency。

### 2026-07-09：R2/R3 provider source 输出收敛为 current stream

- `completed`：`RuntimeReplyDefaultCall` 与 `RuntimeReplyProviderSourceRequest` 显式携带 current `RuntimeReplyStreamRequest`；default/provider source backend 都从 Turn owner 拿到同一份 stream context，Aster adapter 不再旁路持有 projection 所需上下文。
- `completed`：`ProviderReplyExitSource` / `ReplyExitSourceExecutor` 的 `Stream` 输出从 Aster `AgentEvent` stream 收敛为 `RuntimeReplyStream<RuntimeAgentEvent>`；Aster `AgentEvent` stream 只留在 `run_provider_reply_exit_source(...)` 内部输入侧。
- `completed`：`run_provider_reply_exit_source(...)` 在私有退场点内调用 `project_aster_reply_stream(stream, stream_request)`，立即把 Aster source stream 投影成 current reply stream；`start_aster_reply_stream(...)` 不再负责拿到 Aster stream 后再投影。
- `completed`：`asterMigrationBoundary.test.ts` 增加守卫，要求 compat source impl 输出 `RuntimeReplyStream<'run, RuntimeAgentEvent>`，并禁止恢复 `BoxStream<'run, anyhow::Result<AsterAgentEvent>>` 作为 reply source backend 外部输出形状。
- `classification`：`current` = `agent-runtime` Turn source execution payload + current stream output contract；`compat blocker` = `run_provider_reply_exit_source(...)` 内 Aster `Message` / `SessionConfig` lowering、Aster provider trait object 与 `Agent::reply_with_provider(...)` 最后一跳；`dead / guarded` = Aster `AgentEvent` stream 作为 reply source backend 对外形状。
- `next`：继续 R2/R3，把 `run_provider_reply_exit_source(...)` 内的 Aster provider trait execution 替换为 current provider/reply backend；完成前仍不能进入 R4 或 root `aster` dependency 删除。

### 2026-07-10：R2/R3 Aster tool-input 与 item lifecycle 前移到 response event

- `completed`：`AsterReplyStreamProjector` 的 response event 转换不再只覆盖 Aster `Message`，direct `AgentEvent::ToolInputDelta` 也会进入 `RuntimeReplyResponseEvent::ToolCallInputDelta`，再由 `agent_reply_stream.rs` 的 current materializer 投影回现有 runtime event / timeline 主链。
- `completed`：`RuntimeAgentEvent::ItemStarted` / `ItemCompleted` 中可表达为 provider response item 的 `AgentMessage` / `Reasoning` / `ToolCall` payload 会进入 `OutputItemAdded` / `OutputItemDone`；`Warning` 等非 provider response item payload 保持原 runtime event，避免为了前移丢失信息。
- `completed`：`RuntimeReplyResponseMaterializer` 现在把可识别工具名的 `ToolCallInputDelta` 同步投影成 `ItemUpdated` 工具项；如果工具名缺失但前置 `OutputItemAdded` 已记录同一 `call_id`，也会复用该工具名。未知工具名保持 fail-closed，只发 `ToolInputDelta`，不伪造 response item。
- `completed`：`asterMigrationBoundary.test.ts` 增加 direct tool-input delta 守卫，并把已删除的 `agent-compat/src/hooks/{loader,types}.rs` 视为空源码继续检查，避免“文件已删除”反而让 Task\* dead 守卫失败。
- `classification`：`current` = `agent-runtime::reply_stream::RuntimeReplyResponseEvent` / `RuntimeReplyResponseMaterializer`；`transitional current adapter` = `request_tool_policy/aster_reply_stream_adapter.rs::AsterReplyStreamProjector` 和 `agent_reply_stream.rs::runtime_agent_events_from_response_event(...)`；`compat blocker` = Aster `Agent::reply_with_provider(...)` 仍是 source；`dead / guarded` = direct `RuntimeAgentEvent::ToolInputDelta`、provider response item lifecycle 或工具参数 item update 绕过 response event materializer。
- `passed`：`agent-runtime reply_stream` 定向测试通过，`26 passed`；覆盖 current response event mapper/materializer、工具参数累积、工具 item update、未知工具名 fail-closed。
- `blocked validation`：`lime-agent request_tool_policy` Rust 定向测试被当前 `agent-compat` 脏树缺失模块阻塞，编译 `aster-core` 时先报缺 `subagent_execution_tool`、`subagent_scheduler`、`communication`、`monitor`、`specialized`、`error_handling`、`recipe/build_recipe` 与 `scheduler/types.rs`；本刀未修改 `agent-compat`，该阻塞不能通过给 staging crate 补新逻辑解决。
- `next`：继续 R2/R3，真正替换 `run_provider_reply_exit_source(...)` 内部 Aster provider trait object execution；完成前仍不能删除 root `aster` dependency。

### 2026-07-09：R4 native registry 注册 policy 接回 tool-runtime

- `completed`：`tool-runtime::native_overlay::runtime_native_tool_registration_is_allowed(...)` 成为 Aster registry 临时注册面的 current policy 函数；注册名必须进入 Codex-first/current allowlist，空名称、`Write`、`RuntimeApprovalResume` 等 Aster-only / test-only 名称 fail closed。
- `completed`：`lime-agent::native_tools::register_native_tool_on_agent(...)` 在写入 Aster `ToolRegistry` 前调用 current policy；gateway-backed `NativeRegistration` 和测试夹具不能再绕过 allowlist 把 Aster-only wrapper 塞回 production registry。
- `completed`：`runtime_state` 的 approval resume fixture 改用现有 current gateway 名称 `memory_list`，没有把测试专用 `RuntimeApprovalResume` 加入生产 allowlist。
- `completed`：`asterMigrationBoundary.test.ts` 增加守卫，要求 `native_tools/runtime_overlay.rs` 生产注册入口必须消费 `runtime_native_tool_registration_is_allowed(&definition.name)`，并要求 `tool-runtime` 保持 `RuntimeApprovalResume` 不允许注册。
- `classification`：`current` = `tool-runtime` native registration policy / allowlist；`transitional current adapter` = `NativeRegistration` 继续绑定 current definition 与临时 Aster `Tool` payload；`compat blocker` = Aster `ToolRegistry` / `Tool` trait 仍服务 reply loop 执行；`dead / guarded` = 未进入 allowlist 的 Aster-only / test-only registry surface。
- `next`：回到 R2/R3，把 `run_provider_reply_exit_source(...)` 替换成 current provider/reply backend；R4 下一步仍是让 reply loop 直接调用 `tool-runtime::native_dispatch` / gateway executor，而不是只经 Aster `Tool` trait 壳。

## 验证记录

- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/native-registration-policy-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent native_tools::runtime_overlay --lib -- --nocapture`，`4 passed`；覆盖临时 Aster registry 写入前的 current allowlist fail-closed。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/native-registration-policy-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -- --nocapture`，`12 passed`；覆盖 current native overlay registration policy / install plan / permission owner。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/native-registration-policy-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_state --lib -- --nocapture`，`14 passed`；覆盖 runtime state native registration snapshot 与 approval resume fixture。
- `observed`：首次 `lime-agent native_tools::runtime_overlay` 冷编译耗时 `23m50s`，过程中必须编译 `aster-core`；这是 R1/R4 未闭环的直接构建成本证据，不是本刀业务逻辑变慢。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-source-execution" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -- --nocapture`，`19 passed`；覆盖 `RuntimeReplyProviderSourceExecution`、source request / stream request materialization 与 source runner current contract。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-source-execution" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -- --nocapture`，`68 passed`；验证 `aster_reply_backend_adapter.rs` 通过 current source execution 后仍能驱动现有 request policy 主链。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/reply-source-current-stream-agent-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -- --nocapture`，`19 passed`；覆盖 source execution envelope 携带 current stream request、source request/backend call handoff 和 current stream 输出 contract。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/reply-source-current-stream-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -- --nocapture`，`68 passed`；验证 `aster_reply_backend_adapter.rs` 在 compat source 内部投影成 current stream 后仍能驱动现有 request policy 主链。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`144 passed`；覆盖 provider source execution envelope、current stream output contract 和 Aster stream 输出形状禁止恢复守卫。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`git diff --check -- "lime-rs/crates/agent-runtime/src/reply_backend.rs" "lime-rs/crates/agent-runtime/src/reply_backend/tests.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_backend_adapter.rs" "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-exit" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -- --nocapture`，`68 passed`；覆盖 `ProviderReplyExitSource` 退场函数委托后现有 reply policy 主链。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-exit" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -- --nocapture`，`18 passed`；复验 provider source request / backend call current contract。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`144 passed`；覆盖 `run_provider_reply_exit_source(...)` 只能作为私有退场点，`agent-compat` 不得升级为 current owner。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-source-alias-agent-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -- --nocapture`，`18 passed`；覆盖 provider source request alias、backend call materialization 与 source runner current contract。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-source-alias-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -- --nocapture`，`68 passed`；验证 `aster_reply_backend_adapter.rs` 消费 current provider source alias 后仍能驱动现有 request policy 主链。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`144 passed`；覆盖 provider source request alias / run call alias / `into_backend_call(...)` current owner 以及 `agent-compat` 不回流守卫。
- `passed`：`git diff --check -- "lime-rs/crates/agent-runtime/src/reply_backend.rs" "lime-rs/crates/agent-runtime/src/reply_backend/tests.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_backend_adapter.rs" "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/reply-backend-source-request-only" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -- --nocapture`，`18 passed`；覆盖 source request / backend call handoff，确认删除 map lowering 后 current contract 仍通过。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/lime-agent-source-request-only" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -- --nocapture`，`68 passed`；覆盖 `aster_reply_backend_adapter.rs` 通过 current source request handoff 后的生产策略链。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`144 passed`；覆盖 source-call map lowering API 不得恢复、provider source alias / run call owner 和 `run_provider_reply_exit_source(...)` 退场点守卫。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md"`。
- `passed`：`git diff --check -- "lime-rs/crates/agent-runtime/src/reply_backend.rs" "lime-rs/crates/agent-runtime/src/reply_backend/tests.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_backend_adapter.rs" "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/reply-backend-default-source" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -- --nocapture`，`21 passed`；覆盖 default/provider source backend helper。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/reply-backend-default-source" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -- --nocapture`，`68 passed`；覆盖 `aster_reply_backend_adapter.rs` default path 委托 current helper 后的生产策略链。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`144 passed`；覆盖 default executor 不得恢复 direct Aster reply execution、`reply_with_provider` 只剩唯一最后一跳。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package agent-runtime --package lime-agent -- --check`。
- `passed`：`CARGO_TARGET_DIR="/tmp/lime-provider-trace-owner-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_trace_metadata --lib -- --nocapture`，`2 passed`；覆盖 provider handle -> provider trace runtime metadata projection。
- `passed`：`CARGO_TARGET_DIR="/tmp/lime-provider-trace-owner-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime provider_trace --lib -- --nocapture`，`2 passed`；覆盖 provider trace lifecycle only owner。
- `passed`：`CARGO_TARGET_DIR="/tmp/lime-provider-trace-owner-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -- --nocapture`，`21 passed`；覆盖 default/provider source backend helper。
- `passed`：`CARGO_TARGET_DIR="/tmp/lime-provider-trace-owner-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -- --nocapture`，`68 passed`；覆盖 `agent_reply_stream.rs` 消费 `model-provider` metadata helper 后的生产策略链。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`144 passed`；覆盖 provider metadata owner、`agent-runtime` lifecycle-only owner 和 `agent-compat` 不回流守卫。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`git diff --check -- "lime-rs/crates/agent-runtime/src/provider_trace.rs" "lime-rs/crates/agent/src/request_tool_policy/agent_reply_stream.rs" "lime-rs/crates/model-provider/src/provider_stream.rs" "lime-rs/crates/model-provider/src/provider_stream/tests.rs" "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`npx prettier --write "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/phase6-remaining-tracker.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md"`。
- `passed`：`git diff --check -- "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/phase6-remaining-tracker.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md"`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package lime-agent -- --check`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -- --nocapture`，`18 passed`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -- --nocapture`，`68 passed`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -- --nocapture`，`20 passed`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package agent-runtime --package lime-agent -- --check`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`144 passed`。
- `resolved`：此前重跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -- --nocapture` 时，编译 `aster-core` 写入 rlib 失败：`No space left on device (os error 28)`；已在用户确认后删除 `lime-rs/target/debug` 构建缓存，清理的是 Rust 编译产物，不是源码。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check`。
- `passed`：`npx prettier --write "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `blocked`：并行运行 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2 -- --nocapture` 与 `cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 2 -- --nocapture` 时，共享 `lime-rs/target` 出现 `proc_macro2` rmeta / rlib 缺失，判定为 Cargo 产物锁竞争，不作为业务源码失败。
- `blocked`：改用 `CARGO_TARGET_DIR="/tmp/lime-aster-provider-owner-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 后，第三方依赖阶段出现 `/tmp/.../*.d` dep-info 文件缺失；该结果仍指向临时 target 产物问题，不作为业务源码失败。
- `passed`：清理 `lime-rs/target/debug` 后单进程冷编译重跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -- --nocapture`，`68 passed`；同时清理 `request_tool_policy.rs` 中已不再使用的 `lower_aster_reply_message` 重导出，避免 Aster message lowering surface 留在模块入口。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_loop --lib -- --nocapture`，`2 passed`；覆盖 `RuntimeReplyLoop` 纯规则。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -- --nocapture`，`68 passed`；覆盖 compat consumer 仍可驱动 reply policy 主链。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`144 passed`；覆盖 Aster 迁移边界守卫。
- `passed`：`CARGO_TARGET_DIR="/tmp/lime-provider-trace-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-protocol provider_trace --lib -- --nocapture`，`3 passed`；覆盖 provider trace DTO、response context 和 stage -> runtime event type current mapping。
- `passed`：`CARGO_TARGET_DIR="/tmp/lime-provider-trace-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime provider_trace --lib -- --nocapture`，`2 passed`；覆盖 provider trace attempt lifecycle 的 first-event / first-text once-only 与 failure projection。
- `passed`：`CARGO_TARGET_DIR="/tmp/lime-provider-trace-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_trace --lib -- --nocapture`，编译通过但过滤名未命中测试，`0 passed / 533 filtered out`；仅作为 `lime-agent` provider trace consumer 编译证据，不作为行为回归证据。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-protocol --package agent-runtime --package app-server -- --check`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`144 passed`；覆盖 provider trace current owner 与 `agent-compat` 不反向依赖 current owner 守卫。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`git diff --check -- "lime-rs/crates/agent-protocol/src/provider_trace.rs" "lime-rs/crates/agent-runtime/src/provider_trace.rs" "lime-rs/crates/agent-runtime/src/lib.rs" "lime-rs/crates/app-server/src/runtime_backend/tool_events.rs" "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `blocked`：`CARGO_TARGET_DIR="/tmp/lime-provider-trace-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server provider_trace --lib -- --nocapture` 在本机同时存在其他 Rust / npm 任务时，冷编译到 `aster-core` 后超过 10 分钟无新增输出，已中断；该项作为并行构建资源阻塞记录，不作为源码失败。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-protocol --package agent-runtime --package aster-core -- --check`；验证 `agent-compat` 保持不反向依赖 `agent-runtime` 后仍可格式化。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`144 passed`；覆盖 `agent-compat` 不得依赖 `agent-runtime`、`reply_loop` current skeleton 与 provider trace current owner 守卫。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/agent-runtime-provider-trace" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_loop --lib -- --nocapture`，`2 passed`；覆盖 `RuntimeReplyLoop` 纯规则。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/aster-sidecar-no-reverse-dep" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -j 1`，`Finished dev profile ... in 36m 12s`；验证不通过 `agent-compat -> agent-runtime` 反向依赖也能通过 `aster-core` 检查，原 `agent_runtime` unresolved sidecar 阻断已解除。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/aster-sidecar-no-reverse-dep" cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server -j 1`，`Finished dev profile ... in 7m 59s`；贴近 electron sidecar build 链路，确认 App Server 依赖图可检查通过。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-protocol --package agent-runtime --package lime-agent --package app-server -- --check`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`144 passed`；复验 provider trace metadata 守卫检查 `agent-protocol` current DTO 与 `lime-agent` flattened DTO 边界。
- `passed`：`git diff --check -- "lime-rs/crates/agent-protocol/src/provider_trace.rs" "lime-rs/crates/agent-runtime/src/provider_trace.rs" "lime-rs/crates/agent-runtime/src/lib.rs" "lime-rs/crates/agent/src/protocol.rs" "lime-rs/crates/agent/src/event_converter.rs" "lime-rs/crates/agent/src/request_tool_policy/agent_reply_stream.rs" "lime-rs/crates/agent/src/lib.rs" "lime-rs/crates/app-server/src/runtime_backend/tool_events.rs" "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package agent-runtime --package lime-agent -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/model-provider-trace-metadata" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_trace --lib -- --nocapture`，`2 passed`；覆盖 `RuntimeReplyProviderTraceMetadata` / `apply_runtime_provider_metadata`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/agent-runtime-provider-trace-metadata" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime provider_trace --lib -- --nocapture`，`2 passed`；覆盖 provider trace attempt lifecycle 纯 Turn 规则。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`144 passed`；覆盖 provider metadata owner 固定到 `model-provider::provider_stream`，并禁止 `agent-runtime::provider_trace` 恢复 provider handle / protocol 依赖。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/lime-agent-provider-trace-metadata" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -- --nocapture`，`68 passed`；验证 `agent_reply_stream.rs` 真实调用 `model-provider` current helper 后仍通过。

### 2026-07-09：R2/R3 provider stream poll contract 收到 model-provider

- `completed`：`model-provider::provider_stream` 建立 provider stream cancel poll interval、timeout outcome、event-boundary cancel outcome 与两个 stable cancel reason 的 target contract，并用 `model-provider` 单测覆盖；该 contract 是 R2/R3 迁出后的 current owner 形状。
- `corrected`：撤回 `agent-compat/src/agents/agent.rs` 对 `model-provider::provider_stream::{ProviderStreamPoll, ProviderStreamCancelReason}` 的直接消费；`agent-compat` 是要迁出的 staging / compat blocker，不能通过吃 current helper 来伪装迁移完成或继续续命旧 loop。
- `completed`：`asterMigrationBoundary.test.ts` 改为要求 `model-provider::provider_stream` 持有 poll helper / cancel reason current contract，并禁止 `agent-compat` 生产代码 import current helper/type；现存 provider stream loop 与本地 cancel reason 常量仍按 R2/R9 残留追踪，退出条件是把执行体迁出后删除该 staging 文件。
- `classification`：`current` = `model-provider::provider_stream::{ProviderStreamPoll, ProviderStreamCancelReason}` target contract；`compat blocker` = Aster `reply_internal(...)` 仍执行 provider stream、tool loop、session/event source，且本地保留 cancel reason 字符串；`dead / guarded` = `agent-compat` 直接消费 current poll helper。
- `Thread / Turn / Item`：Turn provider stream lifecycle 规则进入 current owner；Item/Event 投影仍由现有 Aster event -> Lime event adapter 暂时承接。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-stream-poll-corrected-model" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -- --nocapture`，`23 passed`；覆盖 provider stream poll target contract。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`144 passed`；覆盖 provider stream poll current owner、`agent-compat` 不得导入 current poll helper/type，且 `agent-compat` 本地 cancel reason 常量仍只是待迁出 staging 残留。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-compat/src/agents/agent.rs" "lime-rs/crates/model-provider/src/provider_stream.rs" "lime-rs/crates/model-provider/src/provider_stream/tests.rs"`。
- `passed`：`git diff --check -- "lime-rs/crates/agent-compat/src/agents/agent.rs" "lime-rs/crates/model-provider/src/provider_stream.rs" "lime-rs/crates/model-provider/src/provider_stream/tests.rs" "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-execution-module" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -- --nocapture`，`68 passed`；覆盖私有 `run_provider_reply_exit_source(...)` 退场点和现有 request policy 主链仍可编译运行，冷编译耗时 `22m57s`。
- `next`：继续 R2/R3，把 provider stream start / event loop 的 provider trait object execution 从 `Agent::reply_with_provider(...)` 拆到 current backend；随后进入 R4 native tool registry 壳删除。

### 2026-07-09：R2/R3 provider reply exit source 命名纠偏

- `completed`：`request_tool_policy/aster_reply_backend_adapter.rs` 不再定义 provider source implementation、不再 import Aster `Provider` trait、也不再实现 `RuntimeReplyProviderSourceBackend<RuntimeReplyProviderSourceBackendRequest>`；backend adapter 只保留 backend start、current source call 分派和 `ReplyExitSource::new(...)` 接线。
- `completed`：剩余 provider reply 退场模块已落在 `request_tool_policy/provider_reply_exit_source.rs`；内部类型和私有函数命名已收敛到 provider reply exit source 退场语义，旧 `compat_provider_reply_backend.rs` / `Aster*ReplySource` 命名不得恢复。
- `completed`：`request_tool_policy/provider_reply_exit_source.rs::ProviderReplyExitSource` 承接唯一剩余 Aster provider source implementation，trait impl 仍只委托私有 `run_provider_reply_exit_source(...)`；Aster `Message` / `SessionConfig` lowering、Aster provider trait object 和 `Agent::reply_with_provider(...)` 只允许停留在该退场模块内。
- `completed`：`asterMigrationBoundary.test.ts` 更新守卫，禁止 backend adapter 恢复旧 source implementation、Aster provider trait import、provider source backend impl、`RuntimeReplyProviderSourceRunCall` / `RuntimeReplyProviderSourceFuture` 等 execution 细节；守卫要求退场模块持有 `ReplyExitSource` / `ReplyExitSourceExecutor` / `ProviderReplyExitSource` 和私有 `run_provider_reply_exit_source(...)`，并禁止恢复旧 `compat_provider_reply_backend.rs` / `Aster*ReplySource` 命名。
- `completed`：Aster 迁移 active 文档术语统一为“不依赖 Aster”，避免把迁移目标写成含糊标签；当前判断仍使用 `current / compat blocker / dead` 分类。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`144 passed`；覆盖 `agent-compat` 不得作为 current owner、旧 `compat_provider_reply_backend.rs` 不得恢复、新 `provider_reply_exit_source.rs` 必须存在。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-reply-exit-source" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -- --nocapture`，`68 passed`；覆盖私有 `run_provider_reply_exit_source(...)` 退场点和现有 request policy 主链。
- `corrected`：并行写集一度把 `provider_reply_exit_source.rs` / `ReplyExitSource` 改回旧 `compat_provider_reply_backend.rs` / `Compat*` 命名，本轮重新收敛到 `provider_reply_exit_source.rs` / `ReplyExitSource` / `ProviderReplyExitSource`。
- `corrected`：本刀未在 `agent-compat` staging crate 内补 reply backend 业务逻辑，不把 `agent-compat` 接到 current owner；`agent-compat/src/agents/agent.rs` 仍是待迁出 R2/R9 staging blocker。
- `classification`：`current` = `agent-runtime` provider source request / run call contract + `model-provider` provider source backend trait；`compat blocker` = `provider_reply_exit_source.rs::ProviderReplyExitSource` 私有退场模块；`dead / guarded` = backend adapter 重新持有 Aster provider source impl、恢复旧 `compat_provider_reply_backend.rs` / `Aster*ReplySource` 命名，或把 `agent-compat` 当 owner。
- `next`：继续 R2/R3，把 `ProviderReplyExitSource` / 私有 `run_provider_reply_exit_source(...)` 整体替换为 current provider/reply backend；完成前不能进入 R4 或 root `aster` dependency 删除。

### 2026-07-09：R2/R3 provider execution runner 骨架上提

- `completed`：`agent-runtime::reply_backend` 先新增 `RuntimeReplyProviderExecutionRunner`、`RuntimeReplyProviderExecutionSource<R>` 与 `run_provider_source_execution(...)`；2026-07-10 已纠偏为 `model-provider::provider_stream` 持有 provider source backend wrapper，`agent-runtime` 只保留 `RuntimeReplyProviderSourceExecution` Turn execution payload。
- `completed`：`request_tool_policy/provider_reply_exit_source.rs` 增加私有 `ProviderReplyExitRunner`，`ProviderReplyExitSource` 退化为 `model-provider::provider_stream::RuntimeReplyProviderExecutionSource<ProviderReplyExitRunner>` type alias；Aster `Agent::reply_with_provider(...)` 仍只留在私有 `run_provider_reply_exit_source(...)` 退场函数内。
- `completed`：`asterMigrationBoundary.test.ts` 更新守卫，要求 execution runner/source wrapper 归属 `model-provider`，并禁止退场模块恢复 `RuntimeReplyProviderSourceExecution::from_run_call(call).into_parts()` 或 `run_provider_reply_exit_source(self.agent, self.provider, call)` 直连形状。
- `codex-reference`：只读对照 `/Users/coso/Documents/dev/rust/codex/codex-rs` 后，下一刀应对齐 Codex `ResponseEvent` / `ResponseItem` loop：provider stream 先产出 typed response event/item，再由 Turn loop 和 tool router materialize runtime event；不要继续围绕 Aster `AgentEvent` 做长期 current contract。
- `classification`：`current` = `model-provider` provider execution runner/source wrapper skeleton + `agent-runtime` Turn execution payload；`compat blocker` = 私有 `ProviderReplyExitRunner` / `run_provider_reply_exit_source(...)` 内 Aster provider trait object、Aster message/session lowering 和 `Agent::reply_with_provider(...)`；`dead / guarded` = compat source impl 自行拆 backend call、backend adapter 恢复 Aster execution 细节、`agent-compat` 反向消费 current owner。
- `Thread / Turn / Item`：provider source backend wrapper 下沉到 provider owner，Turn execution payload 前移一层；Item/Event 仍暂由 Aster stream projector 产出 Lime runtime event，下一刀必须迁向 provider response event/item stream。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-execution-source-agent-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 1 -- --nocapture`，`19 passed`；覆盖 provider execution runner、source request/backend call handoff 与 current source execution contract。
- `blocked`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-execution-source-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture` 在 cold target 编译 `aster-core` 时因 `No space left on device (os error 28)` 失败；该结果是构建缓存空间不足，不作为源码失败。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-reply-exit-source-current" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`70 passed`；验证退场模块实现 current source wrapper 后现有 request policy 主链仍通过。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`144 passed`。
- `next`：建立 Codex-style `RuntimeResponseEvent` / response item stream contract，让 provider source 输出不再以 Aster `AgentEvent` 为中心；随后把 tool routing 接到 current tool router / `tool-runtime`，再删除 Aster native `ToolRegistry` 壳。

### 2026-07-09：R2/R3 Codex-style response event stream materializer 落地

- `completed`：`agent-runtime::reply_stream` 新增 `RuntimeReplyResponseEvent`，覆盖 Codex 对齐的最小 response stream event 形状：`OutputItemAdded`、`OutputItemDone`、`TextDelta`、`ToolCallInputDelta`、`ReasoningDelta`、`Completed`、`RateLimits`。
- `completed`：`RuntimeReplyStreamEvent<E>` 新增 `ResponseEvent(RuntimeReplyResponseEvent)` 与 `response_event(...)` constructor；provider reply stream 现在可以携带 Lime-owned response event，而不是只能携带 `Event(RuntimeAgentEvent)`、provider notification 或 inline error。
- `completed`：`agent-runtime::reply_stream::RuntimeReplyResponseMaterializer` 已把 `OutputItemAdded` / `OutputItemDone` 投影为 `ItemStarted` / `ItemCompleted`，把 `ReasoningDelta` 投影为 `ThinkingDelta` + `ItemUpdated`，把 `ToolCallInputDelta` 投影为带累积参数的 `ToolInputDelta`，并在工具名可识别时同步投影 `ItemUpdated` 工具项；`Completed` / `RateLimits` 投影为 `Done` / rate-limit provider stream event。
- `completed`：`request_tool_policy/agent_reply_stream.rs` 真实消费 `RuntimeReplyStreamEvent::ResponseEvent(response_event)`，并把 response projection 适配到现有 `RuntimeAgentEvent` / timeline item 主链；这使非文本 delta 不再被吞掉。
- `completed`：`asterMigrationBoundary.test.ts` 增加守卫，要求 response event contract 和 materializer 属于 `agent-runtime::reply_stream`，并要求 `agent_reply_stream` 消费 `RuntimeReplyStreamEvent::ResponseEvent(...)`、`ToolInputDelta`、`ThinkingDelta`、item lifecycle、`Done` 与 rate-limit projection；Aster stream projector 仍不得直接构造 provider stream / suppressed error wrapper。
- `codex-reference`：对齐 Codex `codex-api` provider stream -> `ResponseEvent` -> `core/src/session/turn.rs` response item loop -> tool router 的分层；Aster `AgentEvent` 继续只作为迁移期 source adapter 输入，不作为 current response stream owner。
- `classification`：`current` = `agent-runtime::reply_stream::RuntimeReplyResponseEvent` / `RuntimeReplyResponseMaterializer` + `agent_reply_stream` response projection adapter；`transitional current adapter` = `agent_reply_stream.rs::runtime_agent_events_from_response_event(...)` 暂时把 response projection 转进现有 `RuntimeAgentEvent`；`compat blocker` = `provider_reply_exit_source.rs::ProviderReplyExitSource` / `run_provider_reply_exit_source(...)` 仍调用 Aster `Agent::reply_with_provider(...)`，Aster `project_aster_reply_stream(...)` 仍先把 Aster `AgentEvent` 投影成 Lime stream；`dead / guarded` = 把 Aster `AgentEvent` 作为长期 current stream event contract、吞掉非文本 response delta、工具参数 item update 绕过 response materializer，或从 Aster `Message` 反推 provider notification / inline provider error 作为未来主路径。
- `Thread / Turn / Item`：Turn 拥有 response stream event contract 和 materializer；Item/read model 已有 timeline projection 过渡接线；tool routing execution 仍未迁出 Aster native `ToolRegistry` / `Tool` trait，不能删除 `ProviderReplyExitSource` 或 root `aster` dependency。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/response-event-nontext-agent-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib -j 1 -- --nocapture`，`20 passed`；覆盖 response materializer 的 item lifecycle、reasoning 累积、tool input 累积、completed 和 rate limits。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/response-event-nontext-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`77 passed`；覆盖 response projection 适配到 `RuntimeAgentEvent` / timeline item 主链。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`144 passed`。
- `note`：同一 `lime-agent` 命令首次冷编译在第三方依赖阶段被外部 SIGTERM 结束，退出码 `143`，无 Rust 源码错误；复用同一 target dir 重跑后通过。
- `next`：把 provider source 输出从 Aster `AgentEvent` projector 改成直接产出 `RuntimeReplyResponseEvent` / response item stream，并把 tool call item routing 接到 current `tool-runtime` executor；之后才能删除 Aster `AsterEventProjector` 和 native `ToolRegistry` 壳。

### 2026-07-10：`agent-compat` 迁出语义纠偏

- `completed`：active tracker、执行计划、refactor v1 影响审计和主路线图均明确 `agent-compat` 不是“暂时不动”的保护目录；允许改动只有迁出生产调用、删除 Aster-only surface、减少 burn-down 依赖。
- `completed`：`asterMigrationBoundary.test.ts` 增加“当前计划不得把 agent-compat 写成保护区”守卫，扫描 active tracker、执行计划、refactor v1 影响审计和主路线图，禁止 `不触碰 agent-compat` 这类回流措辞。
- `completed`：`asterMigrationBoundary.test.ts` 增加 `agent-compat/Cargo.toml` 本地 path dependency burn-down allowlist 守卫；除现存 `document-preview` / `model-provider` / `tool-runtime` 外，新增任何本地 path dependency 都会 fail，防止 staging crate 继续承接 current owner。
- `classification`：`compat blocker` = `agent-compat` 现存生产调用与 burn-down 依赖；`dead / guarded` = 把 `agent-compat` 当 current owner、新增 owner/path dependency、在 staging crate 内继续补 reply loop / provider / tool / session 逻辑。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/exec-plans/aster-phase6-provider-reply-backend-plan.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "internal/roadmap/astermigration/README.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`146 passed`。
- `passed`：`git diff --check -- "src/lib/governance/asterMigrationBoundary.test.ts" "internal/exec-plans/aster-phase6-provider-reply-backend-plan.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "internal/roadmap/astermigration/README.md"`。
- `next`：回到 R2/R3，把 provider source 输出从 Aster `AgentEvent` projector 改成直接产出 `RuntimeReplyResponseEvent` / response item stream，并把 tool call item routing 接到 current `tool-runtime` executor。

### 2026-07-10：R2/R3 response event 验证阻塞解除

- `completed`：`agent-runtime::reply_stream` 的 response event mapper/materializer 已覆盖 provider accumulated tool input、unknown tool name fail-closed、item lifecycle、reasoning、completed 和 rate limits；`request_tool_policy/aster_reply_stream_adapter.rs` 的 Aster source adapter 继续只作为迁移期输入，把可表达的 Aster message / runtime item 事件前移到 current `RuntimeReplyResponseEvent`。
- `completed`：为解除 `lime-agent request_tool_policy` 定向验证阻塞，`agent-compat` 只做最小 staging 编译清障：局部化 `OverflowHandler`、把已退场 recipe / prompt / sandbox / image / user-message / repetition inspector helper 收缩成 no-op 或解析型 shim，并移除已删除 fixed provider directory / slash command path 的残留假入口。没有恢复已删 Aster 子目录，也没有新增 current owner 依赖。
- `classification`：`current` = `agent-runtime::reply_stream::RuntimeReplyResponseEvent` / `RuntimeReplyResponseMaterializer` 与 `lime-agent` response projection adapter；`compat blocker` = `agent-compat` 最小编译 shim 和 `ProviderReplyExitSource` 最后一跳；`dead / guarded` = 恢复旧 Aster modules、把 `agent-compat` 当 current owner、或让 response event 只处理文本 delta。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent --package aster-core -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/response-event-mapper-agent-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib -j 1 -- --nocapture`，`26 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/response-event-nontext-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`；此前 `agent-compat` 编译阻塞已解除。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`147 passed`。
- `next`：继续 R2/R3，把 `ProviderReplyExitSource` / `run_provider_reply_exit_source(...)` 的 Aster provider trait object execution 迁到 `model-provider` current backend；完成前不得删除 root `aster` dependency，也不得把本轮 `agent-compat` shim 当完成态。

### 2026-07-10：R2/R3 provider execution wrapper owner 下沉到 model-provider

- `completed`：`model-provider::provider_stream` 承接 `RuntimeReplyProviderExecutionRunner<R>`、`RuntimeReplyProviderExecutionSource<R>` 与 `run_provider_source_execution(...)`，provider source backend wrapper 不再归 `agent-runtime`。
- `completed`：`agent-runtime::reply_backend::RuntimeReplyProviderSourceExecution` 保留为 Turn execution payload，并新增 `from_source_request(...)`；default/provider source helper 仍只负责 source request / backend call handoff。
- `completed`：`request_tool_policy/provider_reply_exit_source.rs::ProviderReplyExitSource` 继续作为 `RuntimeReplyProviderExecutionSource<ProviderReplyExitRunner>` 私有退场点，但 wrapper 来自 `model-provider`，Aster `Agent::reply_with_provider(...)` 仍只在私有 `run_provider_reply_exit_source(...)` 一处。
- `classification`：`current` = `model-provider` provider source backend wrapper + `agent-runtime` Turn execution payload；`compat blocker` = `ProviderReplyExitRunner` / `run_provider_reply_exit_source(...)` Aster 最后一跳；`dead / guarded` = 把 provider execution wrapper 放回 `agent-runtime` 或 `agent-compat`，以及在 backend adapter / credential bridge 恢复 Aster provider execution。
- `Thread / Turn / Item`：provider wrapper 归 provider owner，Turn 只交接 execution payload；Item/read model 仍等待后续 provider response event / tool router 迁出 Aster。
- `next`：继续替换 `run_provider_reply_exit_source(...)` 内部 Aster provider trait object execution；完成前 root `aster` dependency 和 `agent-compat` staging crate 仍不能删除。
