# Aster 能力接收迁移执行计划

状态：in_progress
创建时间：2026-07-05
策略文档：`internal/roadmap/astermigration/aster-capability-intake-strategy.md`
refactor v1 影响审计：`internal/roadmap/astermigration/refactor-v1-impact-audit.md`
路线图：`internal/roadmap/astermigration/README.md`

## 主目标

按能力接收矩阵继续迁移 Aster：把 Lime 当前需要的 agent / provider / tool / session 能力迁入 Lime-owned current crates，迁完一批就删除 vendored Aster 中对应重复实现和测试，并用治理守卫阻止回流。Aster 只保留仍被 `lime-agent` compat adapter 编译依赖的最小面，最终删除 root workspace `aster` dependency。

## 本计划的事实源声明

后续迁移只能向以下 current owner 收敛：

- `agent-runtime`：turn orchestration、agent action、subagent 编排、runtime event stream。
- `agent-protocol`：稳定 wire DTO、event/action/read model、provider/tool/session 共享协议。
- `model-provider`：provider registry、provider request/response、reply stream、模型能力描述。
- `tool-runtime`：tool definition、registry executor、permission preflight、shell/process/MCP bridge、tool result/error。
- `thread-store`：session、thread、turn、message、runtime snapshot、artifact/checkpoint persistence。
- App Server JSON-RPC：桌面 GUI / evidence / replay / analysis 的唯一 runtime 入口。

vendored Aster 只允许作为 `compat-blocker` 或 `valuable-reference`，不得继续作为 current runtime 事实源。

本计划同时受 `internal/research/refactor/v1` 约束：后续每一刀都必须说明 Thread / Turn / Item 归属；已迁能力若只是为了搬空 Aster 而临时落在 `lime-agent` adapter 内，必须标为 `transitional current adapter`，不能误报为最终 refactor owner。具体复核见 `refactor-v1-impact-audit.md`。

## 当前基线

最新校准口径：整体目标完成度约 `97.6%`；本轮回到真实 Phase 6 blocker，把 Lime native tool overlay 清单迁到 `tool-runtime` current owner，并让 inventory / 前端工具清单只把这组 Lime overlay 标成 `current_surface`；Phase 6 blocker 仍未清零，不能按 `99%` 或完成态汇报。

已完成：

- `agent-protocol`、`model-provider`、`thread-store`、`tool-runtime`、`agent-runtime` 一等 workspace crate 骨架已建立。
- `app-server` / `services` / `server` / `scheduler` 已基本迁出 direct Aster dependency。
- tool execution policy、shell/path/process/shell runtime 等多批能力已迁入 `tool-runtime`。
- WebSearch / WebFetch current executor 已进入 `tool-runtime`；WebSearch 已被 WebSearch preflight 与 workspace patch host 两条 Lime 后端主链真实消费，WebFetch 通过 vendor Aster tool adapter 进入当前 Aster reply loop 工具调用面。
- `agent_tools/tool_orchestrator/aster_registry_adapter.rs` 已删除；`tool_orchestrator` 工具批执行不再依赖 Aster `ToolRegistry` / `ToolContext` / `SandboxConfig`。
- `tool-runtime::native_overlay` 已承接 Lime-owned native tool overlay 清单（`Write`、`Edit`、`apply_patch`、`skill_search`、`Skill`）；`native_tools/runtime_overlay.rs` 只按该 current 清单注册 Aster `Tool` 对象，`tool_inventory_runtime_adapter.rs` 也只把该清单命中的工具标成 `current_surface`，不再把整个 Aster registry 误标为 current。
- `tool-runtime::apply_patch` 已承接 `apply_patch` native tool 的 patch 执行、路径权限、metadata/diff 构造和 current executor；`lime-agent/src/tools/apply_patch_tool.rs` 只保留 Aster `Tool` trait DTO 适配，`lime-agent` 不再直接依赖 `patch-apply`。
- vendored Aster 中已迁出的 `path_guard`、`command_semantics`、`subprocess`、`shell_runtime`、WebFetch/WebSearch fetch/search/cache/content 等重复实现已删除或替换为 current owner 委托，并已有守卫防回流。
- provider stream current handle 已进入现有 `provider_trace` 后端 / 前端 / metrics 主链；这不是空 DTO 迁移，但 Aster provider/reply adapter 仍未删除。
- `RuntimeReplyStreamRequest` 已进入 pinned provider stream 执行入参，`ConfiguredReplyProvider::stream_reply_with_agent(...)` 会校验并记录 current request；不再只是 `aster_reply_adapter.rs` 的 debug-only DTO。
- `ReplyInput` / `ReplyInputImage` / `ActionRequiredResponseInput` / `ReplyAttemptInput` 已迁到 `agent-runtime::reply_input` current owner；`request_tool_policy.rs` 与 `agent_reply_stream.rs` 直接消费 current input contract。
- `RuntimeReplyStreamEvent` 已迁到 `agent-runtime::reply_stream` current owner；`aster_reply_adapter.rs` 只产出该 current envelope，不再定义 reply stream event enum。
- `agent_reply_stream.rs` 主循环已只消费 `RuntimeReplyStreamEvent` / `RuntimeAgentEvent` current stream；Aster event projection 与 inline provider error suppression 已收回到 `aster_reply_adapter.rs` / `aster_event_adapter.rs` compat 边界。
- `RuntimeReplyStreamHost` / `RuntimeReplyPolicyHost` / `RuntimeReplyStartError` 已迁到 `agent-runtime::reply_host` current owner；`request_tool_policy.rs` 的 stream policy 主编排只接收 current host contract，不再知道 `AsterReplyRuntimeHost` 具体类型。
- `RuntimeReplyAttemptError` / `RuntimeReplyExecution` 已迁到 `agent-runtime::reply_execution` current owner；`request_tool_policy.rs` 只保留 `ReplyAttemptError` / `StreamReplyExecution` re-export，不再本地定义 runtime execution DTO。
- `turn_context_configuration.rs` 已只保留 Lime current `AgentTurnContext` builder / helper；Aster `TurnContextOverride` 双向转换收进 `turn_context_configuration/aster_adapter.rs` compat 边界。
- `agent-runtime::session_recent` / `agent-runtime::session_execution` 已承接 session recent DTO 与 session execution projection DTO；`agent-runtime::runtime_timeline` 已承接 runtime timeline turn/item/payload current DTO、turn/item source projector、item payload source projector、request-question schema 解析、runtime status turn summary text / diagnostics metadata projector 与 runtime timeline snapshot source/projector。Aster `SessionRuntimeSnapshot` 的 timeline source 构造已集中到 `runtime_timeline_adapter.rs`；`runtime_snapshot_adapter.rs` 只把 current timeline projection 映射为 GUI DAO DTO，不再直接遍历 `threads` 或调用 turn/item converter。Aster shared runtime store 初始化 / 获取 / snapshot 读取已隔离到 `runtime_store_aster_adapter.rs`；`runtime_support.rs` 不再直接 import `aster::session` / `aster::config`，外部只允许消费 `load_runtime_snapshot_overlay(...)` current overlay。
- `thread-store::conversation_transcript` 已承接 runtime conversation transcript / fallback projection 的 record source、record projector、message selection、count、truncate 与稳定 transcript item id 规则；`runtime_conversation_aster_adapter.rs` 集中承接 Aster `ThreadRuntimeStore` thread/item 遍历、`ItemRuntimePayload` 到 current source 的字段映射与 transcript item 构造，`aster_session_store/runtime_conversation.rs` 只保留 Aster `Conversation` 兼容转换和 store 写入接线。
- `thread-store::history_search` 已承接 session chat history search 的 query normalization、limit、timestamp fallback、role/current match record 与 relevance 规则；`aster_session_store/history_search.rs` 只保留 Aster `Session` / `Message` 到 current search record 的转换，以及 current match record -> Aster `ChatHistoryMatch` 的 compat 回填。
- `thread-store::task_board` 已承接 task board 到 session todo 的 subject trim、空项过滤、active_form 归一化和状态投影规则；`session_store_todo_projection.rs` 已删除，`session_store_todo_aster_adapter.rs` 只保留 Aster `ExtensionData` / `TaskBoardItem` 到 current task board record 的转换与最终 `SessionTodoItem` DTO 回填。
- `thread-store::memory_stub` 已承接 Aster `SessionStore` memory disabled/skipped stub 的 commit report、空 search/context records、stats 和 health 默认规则；`aster_session_store/memory_stub.rs` 只保留 current record -> Aster `CommitReport` / `MemorySearchResult` / `MemoryRecord` / `MemoryStats` / `MemoryHealth` 的 compat 回填。
- `thread-store::session_insights` 与 `session_record_sql.rs` 已承接 Aster `SessionStore::get_insights` 的 session count / token sum 聚合与 `i64 -> usize` 投影规则；`aster_trait.rs` 只把 current record 回填成 Aster `SessionInsights` DTO。
- `thread-store::legacy_conversation` 已承接 legacy `agent_messages.content_json` envelope、旧数组格式 fallback、visibility 默认值和 role 归一化规则；`aster_session_store/legacy_conversation.rs` 只保留 current JSON record -> Aster `MessageContent` / `Conversation` DTO 转换。
- `lime_core::database::agent_session_repository::update_session_token_stats(...)` 已承接 token stats 的 None=保留旧值、schedule_id 归一化和 COALESCE SQL 写入规则；`aster_trait.rs::update_token_stats(...)` 只把 Aster `TokenStatsUpdate` 映射成 current `SessionTokenStatsUpdate` 并同步 metadata cache。
- `lime_core::database::agent_session_repository` 已承接 Aster `SessionStore` 的 session record 创建、存在性检查、`working_dir` / `extension_data_json` 读取、默认 working_dir fallback 与 persisted working_dir 归一化；`aster_session_store.rs` 只保留 Aster `Session` / `ExtensionData` DTO 接线，`session_projection.rs` 只消费 current helper。
- `lime_core::database::agent_session_repository` 已承接 current `thread-store::SessionRepository` 实现的 title、user_set_name、working_dir、extension_data 和 delete 写入语义；`session_record_sql.rs` 已承接其 get/list row loading；`lime_session_repository.rs` 不再维护这些 direct `agent_sessions` 写入 SQL 或 row prepare/query/map 细节，只做 trait adapter / DTO 投影。
- `session_record_sql.rs` 已承接 `agent_sessions` session record SQL select columns、`rusqlite::Row` -> `thread-store::SessionRecordRow` 映射与列表加载，并对 row mapping error 采用 fail-fast；按 refactor v1 审计它属于 `transitional current adapter`，用于搬空 Aster `SessionStore`，不是最终 Thread store owner。`aster_session_store/session_projection.rs` 只保留 current `SessionRecordProjection` -> Aster `Session` DTO 适配，`aster_trait.rs` 的 `get_session` / `list_sessions` 不再手写 session row 默认值、timestamp/json/session_type 解析。
- `aster_trait.rs` 的 `export_session` / `import_session` / `copy_session` / `truncate_conversation` 只有 Aster trait impl 自己命中，已按“无客户，不保兼容”从 Lime `SessionStore` impl 删除；vendor `session/export.rs`、`session/archive.rs`、`session/diagnostics.rs`、`SessionManager` bulk wrapper、vendor `SessionStore` trait 方法和 `agents/agent.rs` 测试 fake 均已删除，不再迁成新的 current service，也不继续维护 JSON 导入导出 / 复制 / 截断历史编排。
- `vendor/aster-rust/crates/aster/src/{aster_apps,auto_reply,background,blueprint,checkpoint,chrome,chrome_mcp,codesign,diagnostics,git,github,heartbeat,map,core,logging,lsp,memory,notifications,observability,plugins,prompt,ratelimit,recipe_deeplink,rewind,search,telemetry,teleport,tracing,updater}` 已确认无 Lime `aster::...` 顶层消费和 Aster 保留模块外部引用，已从 `lib.rs` public module surface 删除并物理删除；这些模块属于 `dead / deleted / forbidden-to-restore`，不作为 valuable reference 编译留存。
- `session_store_provider_routing.rs` 已承接 execution runtime provider selector 的 current JSON metadata 解析；GUI runtime session detail 主链不再通过 Aster `ExtensionState` / `Session.extension_data` 解析 `lime_provider_routing.v0`。
- `agent-runtime::session_execution` 已承接 session execution usage source/projector 与 token 有效性规则；`session_store_runtime_detail.rs` 的 usage fallback 复用 current `execution_runtime_session.usage`，不再单独调用 Aster usage projector。
- `agent-runtime::session_execution` 已承接 session execution session source/projector、`lime_recent_*` extension key、provider/model 文本归一化和 recent access/preferences/team selection 反序列化 / 归一化规则；`session_execution_runtime_query.rs` 已承接 `agent_sessions` DB read model 到 current projection 的读取，`session_execution_runtime_adapter.rs` 只保留 Aster runtime snapshot 到 current source 的字段映射。
- `agent-runtime::runtime_conversation` 已承接 runtime detail conversation message visibility 与 history window projection；`session_runtime_conversation_query.rs` 已承接 GUI runtime detail conversation read model，并通过 `runtime_conversation_aster_adapter.rs` 收集 runtime store item records 后投影 Lime `AgentMessage`，自身不再 import Aster store / payload；`session_store_runtime_detail.rs` 不再通过 Aster `Session` / `Conversation` 读取消息；`session_runtime_conversation_adapter.rs` 与 `session_query.rs` 已删除。
- `session_store_subagent_projection.rs` 已承接 subagent session metadata / customization raw JSON 到 `SubagentPresentationProjection` 的解析与归一化，并能从 `agent_sessions.extension_data_json` 投影 `SubagentSessionProjection`；`session_store_subagent_query.rs` 已承接 child subagent 列表、当前 subagent session 和 parent session 名称的 DB read model 查询，GUI runtime detail 的 child / parent context 不再通过 Aster `query_child_subagent_sessions(...)` / `query_session(...)` 读取；`session_store_subagent_aster_adapter.rs` 与 `subagent_profiles_aster_adapter.rs` 已删除。
- `session_store_runtime_detail.rs` 已改为消费 `runtime_support::load_runtime_snapshot_overlay` 返回的 current runtime overlay，不再直接读取 Aster `SessionRuntimeSnapshot` 或调用 Aster projection 函数。
- session execution snapshot 的 latest-turn、recent access mode、recent harness context 规则已迁入 `agent-runtime::session_execution::project_session_execution_runtime_snapshot(...)`；`session_execution_runtime_adapter.rs` 只保留 Aster snapshot 到 current source DTO 的字段映射。
- `subagent_control.rs` 已改为消费 `runtime_support::load_runtime_snapshot_overlay` 返回的 current subagent latest-turn projection，并通过 `agent_sessions.extension_data_json` / `session_execution_runtime_query.rs` current DB read model 读取 control state 与 usage；subagent runtime status / latest-turn read model 已归属 `agent-runtime::session_execution`。
- subagent latest-turn 选择、duration、tool count、result ref 与 item kind 规则已迁入 `agent-runtime::session_execution`；`subagent_runtime_adapter.rs` 只保留 Aster snapshot 到 current projection/source 的 DTO 转换。
- `runtime_queue.rs` 生产编排已改为消费 `agent-runtime::runtime_queue` current queued turn / queue service contract；Aster `SessionRuntimeQueueService` 生产调用已删除，`runtime_support.rs` 只保留 Aster `ThreadRuntimeStore` 数据适配。
- Aster queue store DTO 转换已集中到 `runtime_queue_aster_adapter.rs` compat 边界；`runtime_support.rs` 不再直接维护 `QueuedTurnRuntime` 转换或实现 `RuntimeQueueStore`。

仍阻塞 Phase 6：

- root workspace 仍有 `aster = { package = "aster-core", path = "vendor/aster-rust/crates/aster" }`。
- `lime-agent` 仍有 `aster.workspace = true`。
- `lime-agent` 内 provider/reply、native tool overlay/tool inventory、session/thread store、runtime snapshot compat boundary、agent turn loop 仍存在 Aster compat adapter；runtime queue gate / submit / resume 逻辑、runtime timeline snapshot flatten/thread_id 选择、runtime timeline item payload 展示 / 忽略 / request schema / default phase 规则、runtime status turn summary text / diagnostics metadata projector、runtime conversation record selection、runtime detail conversation visibility/window、session history search matching、session todo task board projection、session memory disabled/skipped stub、session insights SQL 聚合、legacy `agent_messages.content_json` 解析、token stats 写入 SQL、subagent presentation metadata/customization 解析、subagent control state/usage read model、subagent child/parent session DB read model、execution runtime session DB read model、session record SQL row 映射、session provider routing metadata 解析、session execution usage 有效性规则与 session recent metadata 投影规则已迁出 Aster adapter，但 queued turn 持久化仍通过 Aster `ThreadRuntimeStore` adapter，runtime conversation source 仍经单一 `runtime_conversation_aster_adapter.rs` 读取 Aster `ItemRuntimePayload`，timeline source 仍经 Aster item payload source adapter，Aster `SessionStore` trait 与 provider/reply `Session` DTO 仍是 compat blocker。WebFetch/WebSearch 已不再是 vendor duplicate blocker，但仍通过 Aster `Tool` trait 注册壳服务未迁出的 reply loop。`Agent::reply` / Aster `Message` / provider trait 仍未迁出，root `aster` dependency 还不能删。

## 写集边界

默认允许写集：

- `internal/roadmap/astermigration/**`
- `src/lib/governance/asterMigrationBoundary.test.ts`
- `lime-rs/crates/agent-protocol/**`
- `lime-rs/crates/model-provider/**`
- `lime-rs/crates/tool-runtime/**`
- `lime-rs/crates/thread-store/**`
- `lime-rs/crates/agent-runtime/**`
- `lime-rs/crates/agent/src/**` 中明确列入本计划的 compat adapter 和调用点
- `lime-rs/vendor/aster-rust/crates/aster/**` 中已迁能力的重复实现、re-export、测试和依赖
- 相关 `Cargo.toml` / `Cargo.lock`

避让规则：

- 并行进程正在改的 Rust 文件，动手前先 `git status --short -- <path>` 和 `sed -n` 读取现状。
- 不回退用户或其他进程改动。
- 同一批只收一条主链，避免同时改 provider、tool、session 三条大链造成冲突。

## 批次计划

### Batch A：Provider / Reply Loop 接收

状态：in_progress

目标：

- 把 reply stream、provider request/response、provider metadata 从 Aster DTO 收敛到 `model-provider` / `agent-runtime`。
- 让 `request_tool_policy/aster_reply_adapter.rs` 与 `credential_bridge/runtime_provider_adapter.rs` 退化为最小边界 adapter，随后删除。

主要写集：

- `lime-rs/crates/model-provider/**`
- `lime-rs/crates/agent-runtime/**`
- `lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs`
- `lime-rs/crates/agent/src/credential_bridge/runtime_provider_adapter.rs`
- `src/lib/governance/asterMigrationBoundary.test.ts`

退出条件：

- current provider stream contract 不 import Aster。
- current provider handle metadata 必须进入 App Server / 前端已消费的 `provider_trace` 主链，不能只停在后端 debug log。
- `lime-agent` provider/reply 生产调用只消费 Lime DTO。
- Aster provider DTO 只允许出现在单一 compat adapter，且 adapter 有删除条件。
- 对应定向 Rust 测试和治理守卫通过。

验证入口：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package agent-runtime --package lime-agent -- --check
cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib
npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
```

### Batch B：Tool Registry Executor 接收

状态：mostly_completed / residual_in_reply_loop

目标：

- 保持 `tool_orchestrator` 工具批执行只调用 Lime `RuntimeToolExecutor`，不得恢复 Aster registry adapter。
- 把 Aster reply loop 内 native tool registry、WebFetch / WebSearch `Tool` trait adapter 和剩余 tool result 映射继续迁入 `tool-runtime`。

主要写集：

- `lime-rs/crates/tool-runtime/**`
- `lime-rs/crates/agent/src/agent_tools/**`
- `lime-rs/crates/agent/src/native_tools/**`
- `lime-rs/vendor/aster-rust/crates/aster/src/tools/**` 中已迁重复实现
- `src/lib/governance/asterMigrationBoundary.test.ts`

退出条件：

- `tool_orchestrator` 生产代码不再直接构造 Aster registry/context/error，且 `agent_tools/tool_orchestrator/aster_registry_adapter.rs` 保持不存在。
- `tool-runtime` 提供 current tool definition、execution request、execution result、error 分类和 policy metadata。
- Aster reply loop 内 WebFetch / WebSearch / native tool 调用不再依赖 Aster `Tool` trait 注册壳。
- 已迁 vendor tool runtime 重复实现和测试删除。
- 守卫禁止恢复 vendor public wrapper、`tool_orchestrator` direct Aster registry import 和已删除 registry adapter 文件。

验证入口：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check
cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator --lib
cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core tools::bash --lib
npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
```

### Batch C：Session / Thread Store 接收

状态：in_progress

目标：

- 把 Aster session/thread/turn/message/runtime snapshot DTO 和 persistence contract 下沉到 `thread-store` / `agent-protocol`。
- 删除 `aster_session_store` 和 session/subagent runtime snapshot compat adapter。

主要写集：

- `lime-rs/crates/thread-store/**`
- `lime-rs/crates/agent-protocol/**`
- `lime-rs/crates/agent/src/aster_session_store/**`
- `lime-rs/crates/agent/src/session_*`
- `lime-rs/crates/agent/src/subagent_*`
- `src/lib/governance/asterMigrationBoundary.test.ts`

退出条件：

- session read model、runtime snapshot、thread persistence 不暴露 Aster public type。
- `aster_session_store` 无生产消费者后删除。
- `thread-store` 覆盖原 vendor session 行为测试的必要场景。
- root `aster` dependency 删除前的 session 阻塞项清零。

验证入口：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" --package thread-store --package agent-protocol --package lime-agent -- --check
cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_store --lib
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_execution_runtime --lib
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent subagent --lib
npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
```

### Batch D：Agent Turn Loop / Subagent Runtime 接收

状态：in_progress

目标：

- 把 agent turn executor、runtime event stream、subagent control 迁到 `agent-runtime`。
- 让 App Server 只依赖 Lime runtime interface，不通过 `lime-agent` 暴露 Aster turn loop 语义。

主要写集：

- `lime-rs/crates/agent-runtime/**`
- `lime-rs/crates/agent-protocol/**`
- `lime-rs/crates/agent/src/runtime_facade.rs`
- `lime-rs/crates/agent/src/aster_runtime_projection*`
- `lime-rs/crates/app-server/**` 中 runtime interface 调用点
- `src/lib/governance/asterMigrationBoundary.test.ts`

退出条件：

- App Server runtime backend 不依赖 Aster event/session/provider/tool 类型。
- `lime-agent` 中 Aster turn loop 只剩删除前 adapter 或完全移除。
- GUI、evidence、replay、analysis 继续消费 current read model。

验证入口：

```bash
cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package agent-protocol --package lime-agent --package app-server -- --check
cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent event_converter --lib
cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend --lib
npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
```

### Batch E：Valuable Reference 盘点与 Vendor 清空

状态：in_progress

目标：

- 对 MCP、skills、hooks、memory/context 等暂未完整产品化能力做接收判断。
- 需要的能力迁入 current owner；不需要作为 current 的能力只留设计记录，不保留编译依赖。
- 删除 root workspace `aster` dependency 和 `lime-agent` 的 `aster.workspace = true`。

主要写集：

- `internal/roadmap/astermigration/**`
- `lime-rs/Cargo.toml`
- `lime-rs/crates/agent/Cargo.toml`
- `lime-rs/vendor/aster-rust/**`
- `src/lib/governance/asterMigrationBoundary.test.ts`

退出条件：

- `rg -n "use aster::|aster::|aster_models::|aster.workspace|package = \"aster-core\"" "lime-rs/crates"` 无 production 命中。
- `lime-rs/Cargo.toml` 不再声明 root `aster` workspace dependency。
- vendored Aster 不再参与 Lime workspace 编译。
- 治理守卫把 `lime-rs/crates/aster-rust/**` 和 `vendor/aster-rust` 回流都判为 forbidden-to-restore。

验证入口：

```bash
cargo metadata --manifest-path "lime-rs/Cargo.toml" --format-version 1 --no-deps
cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent
npm run test:rust:changed
npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000
```

## 进度日志

### 2026-07-07：Batch B apply_patch native executor current owner

- `completed`：新增 `tool-runtime::apply_patch` current owner，承接 `RuntimeApplyPatchExecutor`、`runtime_apply_patch_executor_handle()`、`apply_patch_tool_definition()`、`check_runtime_apply_patch_permissions(...)`、patch 执行、路径权限校验、summary、metadata、file change/diff/checkpoint refs 构造。
- `completed`：`lime-agent/src/tools/apply_patch_tool.rs` 删除本地 `patch_apply`、`parse_patch`、`apply_patch_to_workdir`、路径解析、metadata/diff/hash 构造逻辑，只保留 Aster `Tool` trait wrapper、runtime context 转换和 `RuntimeToolExecutionResult` / `RuntimeToolExecutionError` 到 Aster `ToolResult` / `ToolError` 的 DTO 适配。
- `completed`：`lime-agent/Cargo.toml` 删除 `patch-apply.workspace = true`；`tool-runtime/Cargo.toml` 接管 `patch-apply.workspace = true`。`apply_patch` 的实现依赖不再挂在 Aster compat crate 上。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tool-runtime/src/apply_patch.rs` 不含 `aster::` 且提供 current executor / permission owner，禁止 `lime-agent/src/tools/apply_patch_tool.rs` 恢复 `patch_apply`、`apply_patch_to_workdir`、`parse_patch`、metadata/diff/hash/path 权限规则，并要求 `lime-agent` 不再直接依赖 `patch-apply`。
- `validated`：`rustfmt --edition 2021 --check` 覆盖本批 Rust 写集通过；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`112 passed`；`npx prettier --check` 和 `git diff --check` 覆盖本批写集通过。
- `blocked-validation`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime apply_patch --lib -j 2` 在共享 `lime-rs/target` 上持续等待 artifact directory lock；使用临时 `CARGO_TARGET_DIR="/tmp/lime-apply-patch-target"` 冷编译时在 `serde` build script 链接阶段出现临时 `.rcgu.o` 缺失，非业务 crate 编译错误。本轮未取得 Rust 编译结果，需在 Cargo 锁释放后补跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime apply_patch --lib -j 2` 与 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent apply_patch_tool --lib -j 2`。
- `classification`：`current` 是 `tool-runtime::apply_patch`；`compat` 是 `lime-agent/src/tools/apply_patch_tool.rs` 的 Aster `Tool` trait wrapper；`dead / guarded` 是 `lime-agent` 内部的 patch 执行、路径权限、metadata/diff/hash 第二份实现。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item tool output metadata；真实消费链仍是 Aster reply loop native tool registry -> current executor -> App Server / GUI tool event projection。
- `remaining`：Aster reply loop 仍通过 Aster `Tool` trait 触发 `apply_patch`；后续需要把 native tool call 执行入口迁到 current `RuntimeToolExecutor`，届时删除 Aster wrapper。

### 2026-07-07：Batch B native tool overlay current owner

- `completed`：新增 `tool-runtime::native_overlay`，承接 Lime-owned native tool overlay 清单：`Write`、`Edit`、`apply_patch`、`skill_search`、`Skill`。该模块不依赖 Aster，作为 Tool lifecycle / inventory projection 的 current owner。
- `completed`：`native_tools/runtime_overlay.rs` 不再硬编码“覆盖哪些 Lime 工具”的清单，只按 `runtime_native_tool_overlay_tools()` 把 current overlay 落到临时 Aster `ToolRegistry`；Aster `WriteTool` / `EditTool` / `Tool` trait 仍只留在这个 compat adapter。
- `completed`：`agent_tools/tool_inventory_runtime_adapter.rs` 改为消费 `runtime_native_tool_overlay_tool_names()`，只把这些 Lime overlay 工具标为 `current_surface`；其他 Aster registry 工具继续显示为 `registry_native`，前端工具清单不再把整个 Aster registry 误判为 current surface。
- `completed`：把刚迁入 `tool-runtime` 的 current owner API 从 `lime_native_tool_overlay_*` 改为 `runtime_native_tool_overlay_*`；当前无外部客户，不保留新兼容别名，避免把品牌前缀固化为新 public contract。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tool-runtime/src/native_overlay.rs` 提供 current owner 且不含 `aster::`，要求 Aster runtime overlay 和 runtime inventory adapter 都消费该 current 清单，并要求使用 `runtime_native_tool_overlay_*` 领域命名。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 2` 通过，`3 passed`。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`111 passed`。
- `validated`：`rustfmt --edition 2021 --check` 覆盖本批 Rust 写集通过；`npx prettier --check` 覆盖守卫和计划文档通过；`git diff --check` 覆盖本批写集通过。
- `known-issue`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 当前仍会命中并行写集 `lime-rs/crates/agent/src/request_tool_policy/runtime_status.rs` 的格式差异；本批未修改该文件，改用 `rustfmt --edition 2021 --check` 覆盖本批 Rust 写集。
- `classification`：`current` 是 `tool-runtime::native_overlay` 和 GUI inventory 的 `current_surface` 来源；`compat` 是 `native_tools/runtime_overlay.rs` 的 Aster `ToolRegistry` 注册；`dead / guarded` 是“把整个 Aster registry 当 current surface”的旧投影口径。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item tool projection；真实消费链是 App Server runtime inventory -> 前端 Harness runtime tool inventory 的 `source_kind`。
- `remaining`：Aster reply loop 仍实际通过 Aster `Tool` trait 执行这些工具；下一刀应继续把 WebFetch/WebSearch/native tool 调用从 Aster reply loop registry 壳迁到 `tool-runtime` executor，或回到 provider/reply loop 主 blocker。

### 2026-07-07：Batch E vendor unused public modules 第二批删除

- `completed`：继续按顶层 public module 盘点，确认 `core`、`logging`、`lsp`、`memory`、`notifications`、`observability`、`plugins`、`prompt`、`ratelimit`、`recipe_deeplink`、`rewind`、`search`、`teleport`、`tracing`、`updater` 没有 Lime `aster::...` 顶层消费，也没有 Aster 保留模块的外部引用。
- `deleted`：从 `vendor/aster-rust/crates/aster/src/lib.rs` 删除上述 15 个 `pub mod` 导出，并物理删除约 70 个 vendor 文件。注意：`tools::lsp` / `tools::search`、`mcp::logging` / `mcp::notifications`、Lime 自有 `lime_core::memory` / `lime_agent::prompt` 不是本批删除对象。
- `guarded`：扩展 `DELETED_ASTER_VENDOR_PUBLIC_MODULES`，禁止上述目录 / 文件恢复，也禁止 `lib.rs` 恢复对应顶层 `pub mod`。
- `validated`：`cargo check --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core -j 2` 通过，证明第二批删除没有破坏 vendored Aster 当前最小编译面。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过，证明 Lime 当前下游 compat 编译仍可用。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`111 passed`。
- `classification`：`dead / deleted / forbidden-to-restore` 是第二批 unused vendor public modules；`current` 没有新增，因为这些能力没有进入 Lime 产品主链；`compat blocker` 仍是 provider/reply、Aster tool registry、runtime store 和 SessionStore DTO adapter。
- `Thread / Turn / Item`：本批继续是 vendor framework surface 清退，不新增 Thread / Turn / Item current 能力；对 refactor v1 的收益是防止旧 Aster framework modules 继续充当实现锚点。
- `remaining`：下一刀必须回到真实 blocker，优先 provider/reply loop 的 `Agent::reply` / Aster `Message` / `AgentEvent` / provider trait object，或 Aster reply loop native tool registry 壳。

### 2026-07-07：Batch E vendor telemetry public module 删除

- `completed`：删除最后一个自动盘点出的无外部引用顶层 public module：`telemetry`。`lime-rs/crates/infra/src/lib.rs:pub mod telemetry` 是 Lime 自有模块，不是 Aster 顶层消费。
- `deleted`：从 `vendor/aster-rust/crates/aster/src/lib.rs` 删除 `pub mod telemetry;`，并物理删除 `vendor/aster-rust/crates/aster/src/telemetry/**` 6 个文件。
- `guarded`：`DELETED_ASTER_VENDOR_PUBLIC_MODULES` 增加 `telemetry`，禁止目录和顶层导出恢复。
- `validated`：`cargo check --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core -j 2` 通过。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`111 passed`。
- `classification`：`dead / deleted / forbidden-to-restore` 是 Aster top-level telemetry vendor surface；不新增 current 功能，不进入 Thread / Turn / Item 主链。
- `remaining`：vendor top-level public modules 的可自动判定无外部引用项已清空；后续继续删除必须从真实 blocker 入手，而不是继续按文件名猜测。

### 2026-07-07：Batch E vendor unused public modules 删除

- `completed`：按“无客户，不保兼容”重新盘点 vendored Aster public modules，确认 `aster_apps`、`auto_reply`、`background`、`blueprint`、`checkpoint`、`chrome`、`chrome_mcp`、`codesign`、`diagnostics`、`git`、`github`、`heartbeat`、`map` 没有 Lime `aster::...` 消费，也没有 Aster 其他保留模块的外部引用。
- `deleted`：从 `vendor/aster-rust/crates/aster/src/lib.rs` 删除上述 13 个 `pub mod` 导出，并物理删除对应 107 个 vendor 文件；`claude_plugin_cache` 因仍被 `skills/loader.rs` 使用，未纳入本批删除。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 `DELETED_ASTER_VENDOR_PUBLIC_MODULES` 守卫，要求目录不存在且 `lib.rs` 不得恢复 `pub mod` 导出。
- `validated`：`rg -n "aster::(aster_apps|auto_reply|background|blueprint|checkpoint|chrome|chrome_mcp|codesign|diagnostics|git|github|heartbeat|map)\\b" "lime-rs/crates" "src"` 无命中。
- `validated`：`rg -n "crate::(...deleted vendor modules...)\\b|super::(...deleted vendor modules...)\\b" "vendor/aster-rust/crates/aster/src" -g '!**/<deleted>/**'` 无命中。
- `validated`：`cargo check --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core -j 2` 通过，证明本批删除没有破坏当前 vendored Aster 最小编译面。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过，证明 Lime 当前下游 compat 编译仍可用。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`111 passed`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过；`git diff --check` 覆盖本批写集通过。
- `classification`：`dead / deleted / forbidden-to-restore` 是上述 13 个 Aster vendor public modules；`compat blocker` 仍是 provider/reply loop、Aster `Message` / `AgentEvent` / provider trait object、Aster native tool registry 壳、Aster `ThreadRuntimeStore` / `SessionStore` DTO adapter。
- `Thread / Turn / Item`：本批删除的是未被 Lime 产品主链使用的 vendor framework surface，不新增 Thread / Turn / Item current 能力；对 refactor v1 的收益是缩短旧 Aster 框架可被误当 current owner 的入口。
- `remaining`：root `aster` dependency 仍不能删；下一刀仍应回到 Batch A/D provider/reply loop 或 Batch B native tool registry 壳，继续减少真实 `lime-agent` 编译依赖。

### 2026-07-07：Batch C vendor SessionStore bulk trait/fake 删除

- `completed`：接管 `vendor/aster-rust/crates/aster/src/agents/agent.rs` 的测试 fake 区域，确认并行 provider/reply 改动只在 provider prompt 片段，本轮未改动该区域。
- `deleted`：删除 `vendor/aster-rust/crates/aster/src/session/store.rs` 中 `SessionStore` trait 的 `export_session(...)`、`import_session(...)`、`copy_session(...)`、`truncate_conversation(...)` 方法；vendor trait 不再携带 bulk history API。
- `deleted`：删除 `vendor/aster-rust/crates/aster/src/agents/agent.rs` 测试 fake 中的 export/import/copy/truncate 实现；此前 `request_tool_policy`、hooks、skills fake 已删除同类实现。
- `guarded`：`asterMigrationBoundary.test.ts` 改为禁止 vendor `SessionStore` trait 和 `agents/agent.rs` fake 恢复 bulk history 方法；vendor `session/archive.rs`、`session/export.rs`、`session/diagnostics.rs` 与 `SessionManager` wrapper 仍保持 deleted guard。
- `classification`：`dead / deleted` 是 Aster `SessionStore` bulk history API 全部实现面；`compat blocker` 不再包含 export/import/copy/truncate，剩余 blocker 回到 provider/reply loop、Aster `Session` / `Message` DTO、runtime store persistence 和 native tool registry 壳。
- `remaining`：`rg -n "export_session|import_session|copy_session|truncate_conversation" "lime-rs/vendor/aster-rust/crates/aster/src" "lime-rs/crates/agent/src"` 已清零；下一刀不应再围绕 bulk history 做兼容。
- `next`：继续优先 provider/reply loop：`Agent::reply`、Aster `Message` / `AgentEvent` / provider trait object；如果该热区仍繁忙，则继续 runtime store persistence / native tool registry 壳。

### 2026-07-07：Batch C vendor session bulk public wrapper 删除

- `completed`：继续上一刀的 `dead / deleted from Lime impl` 结论，把 vendored Aster 中只服务 JSON bulk history 的 public wrapper 下线。
- `deleted`：删除 `vendor/aster-rust/crates/aster/src/session/export.rs`、`archive.rs`、`diagnostics.rs`，并从 `session/mod.rs` 删除对应 `mod` 与 `pub use`。
- `deleted`：删除 `SessionManager::export_session(...)`、`import_session(...)`、`copy_session(...)`、`truncate_conversation(...)` public wrapper；删除 `SessionStorage` 内部 JSON export/import/copy/truncate 实现与旧 roundtrip/import 测试。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 vendor session bulk 文件保持不存在，并禁止 `session_manager.rs` 恢复 bulk wrapper、JSON 编排或按 timestamp 删除 message 的 SQL。
- `validated`：`cargo check --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core -j 2` 通过，证明删除 vendor session 模块未破坏 vendored Aster 编译。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过，证明 Lime 当前 `lime-agent` 仍能编译。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`110 passed`。
- `validated`：`rustfmt --edition 2021 --check` 覆盖 vendor session 文件通过；`npx prettier --check` 覆盖迁移文档与治理测试通过；`git diff --check` 覆盖本批写集通过。
- `classification`：`dead / deleted` 是 vendor session archive/export/diagnostics public surface 与 `SessionManager` bulk wrapper；该阶段仍剩 vendor `SessionStore` trait 默认退役方法与 `agents/agent.rs` 测试 fake，后续已删除。
- `remaining`：该阶段 `rg` 仍会在 `vendor/aster-rust/crates/aster/src/session/store.rs` 和 `vendor/aster-rust/crates/aster/src/agents/agent.rs` 命中 export/import/copy/truncate；后续批次已清零。
- `next`：接管 provider/agent 热区后，删除 vendor `SessionStore` trait 的四个默认退役方法与 `agents/agent.rs` 测试 fake；随后继续 provider/reply loop 或 runtime store persistence。

### 2026-07-06：Batch C Aster SessionStore bulk history impl 删除

- `completed`：参考 Codex `thread/read`、`thread/items/list`、`thread/archive/delete` 与 external import 的 Thread/Turn/Item 模式，确认 Aster `SessionStore` 的 export/import/copy/truncate 不应成为 Lime runtime store trait 能力。
- `deleted`：从 `aster_trait.rs` 删除 `export_session(...)`、`import_session(...)`、`copy_session(...)`、`truncate_conversation(...)` 退役 fail-fast impl；Lime production 不再为无客户历史 bulk API 保留方法体。
- `deleted`：删除 `aster_session_store/runtime_conversation.rs::truncate_runtime_conversation(...)` dead helper；bulk truncate 退役后不再保留按 timestamp 重写 conversation 的 Aster runtime store 路径。
- `deleted`：删除 `request_tool_policy.rs` 测试 fake、vendor hooks/skills fake store 中的 export/import/copy/truncate 实现；该阶段这些 fake 仍依赖 vendor trait 默认退役实现，后续 vendor trait 方法已删除。
- `changed`：`vendor/aster-rust/crates/aster/src/session/store.rs` 曾给 bulk history API 增加默认退役实现，使 Lime adapter 不再被旧 trait 强制实现；后续批次已直接删除 vendor trait 方法。
- `guarded`：`asterMigrationBoundary.test.ts` 将守卫从“必须保持退役 fail-fast 方法”升级为“Lime production impl 不得出现 export/import/copy/truncate 方法或旧 JSON 编排”；后续守卫进一步禁止 vendor trait / fake 回流。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`110 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_record_sql --lib -j 2` 通过，`6 passed`。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过；仍会检查 vendored `aster-core`，说明 Phase 6 依赖未清零。
- `validated`：`rustfmt --edition 2021 --check` 覆盖本批 Rust 文件通过；`npx prettier --check` 覆盖迁移文档与治理测试通过；`git diff --check` 覆盖本批写集通过。
- `known-failure`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy::tests::provider_stream_idle::stream_message_reply_with_policy_should_fail_closed_when_provider_stream_idles_before_any_event --lib -j 2` 当前仍超时失败；失败点属于 provider/reply idle guard 热区，不由本批 bulk history 删除引入，但会阻塞 `request_tool_policy` 全量过滤。
- `classification`：`dead / deleted from Lime impl` 是 Aster bulk history 方法；该阶段仍剩 vendor `SessionStore` trait 本身、`SessionManager` bulk public API、provider/reply loop、runtime store persistence 和 native tool registry 壳，后续 bulk public API / trait / fake 已删除。
- `remaining`：完整 vendor 删除当时还需改 `session_manager.rs`、`session/export.rs`、`archive.rs`、`diagnostics.rs` 与 vendor `agents/agent.rs` 测试 fake；后续批次已清零这些 bulk history 面。
- `next`：provider/agent 热区释放后，直接删除 vendor bulk history API 与 public wrapper；不要回退到 Lime 侧 fail-fast 兼容实现。

### 2026-07-06：Batch C Aster SessionStore bulk history methods 退役

- `completed`：确认 `export_session(...)`、`import_session(...)`、`copy_session(...)`、`truncate_conversation(...)` 在生产只有 Aster `SessionStore` trait impl 自己命中；App Server 已有 current conversation import / evidence export / read model 主链，不需要为无客户历史 API 继续兼容。
- `deleted`：删除 `aster_trait.rs` 中 JSON export、JSON import、copy session 和 timestamp truncate 的长编排实现；该阶段曾短暂保留 trait 必需签名的 retired error，后续已升级为直接删除 Lime impl。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 `Aster SessionStore bulk history methods 必须保持退役` 守卫，禁止恢复 `serde_json::to_string_pretty(&session)`、`serde_json::from_str(json)`、import/copy 内部 create-session 编排、`self.get_session(session_id, true)` 和 `truncate_runtime_conversation`。
- `impact`：这一步把原计划里的“export/import/copy/truncate 服务化”改为 `dead`；后续不再为无客户历史 bulk 方法设计服务，除非 App Server / GUI 主链提出真实产品需求。
- `classification`：`dead / guarded` 是 Aster `SessionStore` export/import/copy/truncate 的兼容编排；`compat blocker` 仍是 get/list/message DTO adapter、provider/reply loop、runtime store persistence 和 native tool registry 壳。
- `next`：继续优先处理 provider/reply loop 的 `Agent::reply` / Aster `Message` / `AgentEvent` / provider trait object，或 Aster reply loop native tool registry 壳；不要回头为这组已退役 bulk 方法补兼容。

### 2026-07-06：refactor v1 影响审计与已迁能力重新梳理

- `completed`：新增 `refactor-v1-impact-audit.md`，把已迁 Aster 能力按 refactor v1 的 Thread / Turn / Item 归属重新分类为 `refactor-aligned current`、`transitional current adapter`、`compat blocker`。
- `completed`：明确 `session_record_sql.rs` 不是最终 Thread store owner，而是为了搬空 Aster `SessionStore` 的 `transitional current adapter`；`thread-store::session_record` 继续只承接 DB 无关的 pure projection 规则。
- `completed`：明确 `agent_session_repository.rs` 属于 Thread metadata repository current owner，但不得承接 Turn item、tool lifecycle、provider event 或 GUI projection。
- `completed`：明确 `aster_trait.rs` 仍是 `compat blocker`；export/import/copy/truncate 编排已判 dead，后续优先 provider/reply loop、native tool registry 壳和 runtime store persistence，而不是继续只做低杠杆 SQL 小修。
- `impact`：已迁能力如果还只是 `lime-agent` 内 Aster trait adapter 的支撑 helper，后续计划和汇报必须标为 `transitional current adapter`；迁完 Aster 后要删除或并入 App Server / read model owner，不能长期留成新垃圾。
- `classification`：`current` 是 `agent_session_repository`、`thread-store` pure rule modules、`agent-runtime` runtime/queue/timeline contracts、`tool-runtime` tool helpers；`transitional current adapter` 是 `session_record_sql.rs`；`compat blocker` 是 Aster `SessionStore` trait、provider/reply loop、Aster `ThreadRuntimeStore` / item payload adapter 和 native tool registry 壳。
- `next`：后续 Aster 迁移每一刀必须记录 Thread / Turn / Item 归属与是否被 App Server / frontend / Evidence 真实消费；bulk history 不再 service 化，下一刀优先 provider/reply 热区释放后的 `Agent::reply` / Aster `Message` / provider trait，或继续 runtime store persistence。

### 2026-07-06：Batch C session record SQL row loading fail-fast 收口

- `completed`：`session_record_sql::load_session_record_rows(...)` 不再使用 `filter_map(|row| row.ok())` 静默丢弃坏行，改为收集 `rusqlite::Result<Vec<_>>` 并向调用方传播 row mapping error。
- `completed`：新增 `load_session_record_rows_should_fail_on_row_mapping_error` 单测，用 malformed `total_tokens` 行证明 current read model 遇到坏数据时 fail-fast，而不是把列表悄悄过滤成不完整结果。
- `completed`：新增 `load_all_session_record_rows(...)` 与 `load_session_record_rows_by_types(...)`，并把 `aster_trait.rs` 的 `get_session` / `list_sessions` / `list_sessions_by_types` / `search_chat_history` 切到这些 helper；Aster trait adapter 不再拼 `SELECT {SESSION_RECORD_SELECT_COLUMNS} FROM agent_sessions`，不再直接 `prepare/query_row` 或调用 row mapper。
- `guarded`：`asterMigrationBoundary.test.ts` 的 `thread SessionRepository read row loading` 守卫扩展到 `session_record_sql.rs`，禁止 current read model 恢复 `filter_map(...ok())` silent row drop，并要求保留 `rows.collect()` 错误传播路径。
- `guarded`：`asterMigrationBoundary.test.ts` 的 `session record SQL row 映射` 守卫扩展到 `aster_trait.rs`，禁止 Aster trait adapter 恢复 `SESSION_RECORD_SELECT_COLUMNS`、`FROM agent_sessions`、`format!("SELECT`、`.prepare(&sql)`、`.query_row(` 或 `map_session_record_row`。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/agent/src/session_record_sql.rs"` 通过。
- `verified`：`rustfmt --edition 2021 "lime-rs/crates/agent/src/session_record_sql.rs" "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs"` 已格式化。
- `verified`：`rg -n "filter_map\\(\\|row\\| row\\.ok\\(\\)\\)|filter_map\\(\\|r\\| r\\.ok\\(\\)\\)" "lime-rs/crates/agent/src/session_record_sql.rs" "lime-rs/crates/agent/src/lime_session_repository.rs"` 无命中。
- `verified`：`rg -n "SESSION_RECORD_SELECT_COLUMNS|FROM agent_sessions|format!\\(\\\"SELECT|\\.prepare\\(&sql\\)|\\.query_row\\(|map_session_record_row" "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs"` 无命中。
- `verified`：`npx prettier --write "src/lib/governance/asterMigrationBoundary.test.ts"` 已完成格式化。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "thread SessionRepository read row loading" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed`。
- `pending`：并行进程仍在执行 `cargo test --manifest-path lime-rs/Cargo.toml -p lime-agent session_record_sql --lib -j 2`，本轮 Rust 定向测试结果需在该进程释放 target 后复跑记录；不能把该 pending 验证计入完成态。
- `classification`：`transitional current adapter` 是 `session_record_sql.rs` 的 fail-fast row loading 与 Aster `SessionStore` 支撑 read helper；`compat` 是 `lime_session_repository.rs` 的 `thread-store::SessionRepository` trait adapter 和 `aster_trait.rs` 的 Aster `SessionStore` DTO adapter；`dead / guarded` 是 `lime_session_repository.rs` / `aster_trait.rs` 中 adapter-local row loading SQL、silent row drop 和 row mapper 旧路径。
- `remaining`：Phase 6 仍被 Aster `SessionStore` trait、provider/reply loop、runtime store persistence 和 native tool registry 壳阻塞；本轮只修正 Batch C read model 的迁移质量，不改变 root `aster` dependency 状态。
- `next`：旧 Cargo 释放后先复跑 `cargo test -p lime-agent session_record_sql --lib` 和完整 Aster migration governance；export/import/copy/truncate 编排已判 dead，不再评估迁成服务。

### 2026-07-06：Batch C thread SessionRepository metadata/delete SQL current repository

- `completed`：`lime_session_repository.rs::update_metadata(...)` 不再直接执行 title、user_set_name、working_dir、extension_data SQL；title 复用 `agent_session_repository::rename_session(...)`，user_set_name 新增 `update_session_user_set_name(...)`，working_dir / extension_data 复用既有 current repository helper。
- `completed`：`lime_session_repository.rs::delete_session(...)` 改为调用 `agent_session_repository::delete_session(...)`，不再维护 `DELETE FROM agent_sessions` SQL。
- `completed`：`lime_session_repository.rs::get_session(...)` / `list_sessions(...)` 改为复用 `session_record_sql::load_session_record_rows(...)`，不再直接维护 `prepare/query_row/query_map` 与 row loading 细节；SQL columns 仍沿用 `SESSION_RECORD_SELECT_COLUMNS` current read model。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 `thread SessionRepository metadata/delete SQL` 守卫，禁止 `lime_session_repository.rs` production source 恢复 `conn.execute(`、metadata `UPDATE agent_sessions...` 和 `DELETE FROM agent_sessions`。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 `thread SessionRepository read row loading` 守卫，禁止 `lime_session_repository.rs` production source 恢复 `map_session_record_row`、`.prepare(&sql)`、`.query_row(`、`.query_map(` 和 `filter_map(|r| r.ok())`。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/core/src/database/agent_session_repository.rs" "lime-rs/crates/agent/src/lime_session_repository.rs"` 通过。
- `verified`：`rg -n "conn\\.execute\\(|UPDATE agent_sessions SET title|UPDATE agent_sessions SET user_set_name|UPDATE agent_sessions SET working_dir|UPDATE agent_sessions SET extension_data_json|DELETE FROM agent_sessions" "lime-rs/crates/agent/src/lime_session_repository.rs"` 无命中。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "thread SessionRepository metadata/delete SQL" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed`。
- `verified`：`rg -n "map_session_record_row|\\.prepare\\(&sql\\)|\\.query_row\\(|\\.query_map\\(|filter_map\\(\\|r\\| r\\.ok\\(\\)\\)" "lime-rs/crates/agent/src/lime_session_repository.rs"` 无命中。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`108 passed`。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-agent-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过，`Finished dev profile`；仍需检查 vendored `aster-core`，说明 Phase 6 blocker 未清零。
- `classification`：`current` 是 `agent_session_repository` 的 metadata/delete 写入 helper与 `session_record_sql` 的 row loading read model；`compat` 是 `lime_session_repository.rs` 作为 `thread-store::SessionRepository` trait adapter 的 DTO 投影和 DB 连接接线；`dead / guarded` 是 `lime_session_repository.rs` 中散落的 session metadata/delete direct SQL 与 row prepare/query/map 细节。
- `remaining`：`lime_session_repository.rs` 仍拼接 get/list filter / ordering / pagination SQL；下一刀如果继续收缩该文件，应把 query builder / filter 语义迁入 current read model，或先拆分 `agent_session_repository.rs` 后再接收更多 SQL。
- `risk`：`agent_session_repository.rs` 已到 `988` 行，下一次继续增长前必须先拆分 `#[cfg(test)]` 测试或按 session read/write helper 拆子模块，避免越过 `1000` 行治理边界。
- `next`：继续 Batch C 时优先拆分 `agent_session_repository.rs` 后再迁 `lime_session_repository.rs` 的 get/list read SQL；export/import/copy/truncate 编排已判 dead，不再迁为服务。

### 2026-07-06：Batch C session record create/read current repository

- `completed`：`lime_core::database::agent_session_repository::SessionCreateRecord`、`insert_session_record(...)`、`session_exists(...)`、`get_session_working_dir(...)`、`get_session_extension_data_json(...)` 承接 Aster `SessionStore` 里 session row 创建、存在性检查和基础字段读取 SQL。
- `completed`：`agent_session_repository::resolve_default_session_working_dir(...)` 与 `resolve_persisted_session_working_dir(...)` 承接默认 workspace / default project dir fallback 与相对路径归一化；`aster_session_store.rs` 和 `session_projection.rs` 不再维护 `WorkspaceManager` / `app_paths` fallback 副本。
- `cleanup`：删除 `lime_session_repository.rs` 中未使用的 `resolve_session_working_dir(...)` / `normalize_working_dir(...)` 副本和对应 test-only helper，避免 current `SessionRepository` 继续复制 Aster 迁移期路径解析规则。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 session record 创建/读取 helper 守卫，要求 current owner 持有 `SessionCreateRecord`、`insert_session_record`、`session_exists`、`get_session_working_dir`、`get_session_extension_data_json`、默认 / persisted working_dir 解析 helper，并禁止 `aster_session_store.rs` 恢复 `conn.execute(`、`INSERT INTO agent_sessions`、`SELECT 1 FROM agent_sessions`、`SELECT working_dir FROM agent_sessions`、`SELECT extension_data_json FROM agent_sessions`、`WorkspaceManager::get_default_root_path_from_conn`、`resolve_default_project_dir`、`fn resolve_session_working_dir` 和 `fn normalize_working_dir`。
- `guarded`：`runtime_state action response` 守卫改为只扫描 production source，避免 `#[cfg(test)]` 里的 Aster compat regression fixture 误报为生产 reply bypass；生产 action response 仍必须走 `request_tool_policy` current wrapper。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/core/src/database/agent_session_repository.rs" "lime-rs/crates/agent/src/aster_session_store.rs" "lime-rs/crates/agent/src/aster_session_store/session_projection.rs" "lime-rs/crates/agent/src/lime_session_repository.rs"` 通过。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `verified`：`rg -n "conn\\.execute\\(|INSERT INTO agent_sessions|SELECT 1 FROM agent_sessions|SELECT working_dir FROM agent_sessions|SELECT extension_data_json FROM agent_sessions|WorkspaceManager::get_default_root_path_from_conn|resolve_default_project_dir|fn resolve_session_working_dir|fn normalize_working_dir" "lime-rs/crates/agent/src/aster_session_store.rs" "lime-rs/crates/agent/src/aster_session_store/session_projection.rs"` 无命中。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-agent-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core insert_session_record --lib -j 2` 通过，`1 passed`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "session record 创建/读取 helper" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`106 passed`。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-agent-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过，`Finished dev profile`；仍需编译 vendored `aster-core`，说明 Phase 6 blocker 未清零。
- `classification`：`current` 是 `agent_session_repository` 的 session row create/read/default working_dir helper；`compat` 是 `aster_session_store.rs` 的 Aster `Session` / `ExtensionData` DTO 创建、cache 与 trait 接线；`dead / guarded` 是 Aster compat 主文件中的直接 `agent_sessions` create/read SQL、默认 working_dir fallback 和 `lime_session_repository.rs` 的未使用路径解析副本。
- `remaining`：`aster_trait.rs` 曾保留 export/import/copy/truncate trait surface，后续已删除 Lime impl；`lime_session_repository.rs` 的 metadata/delete 直接 SQL 已由后续批次迁出，但 get/list read SQL 仍待进一步收敛；`agent_session_repository.rs` 已到 `974` 行，下一次继续增长前应优先拆测试或按 session write/read helper 拆子模块，避免越过 `1000` 行治理边界。
- `next`：继续 Batch C 时优先把 `export_session` / `import_session` / `copy_session` 编排改为 current service / repository，或收缩 `truncate_conversation` 的 updated_at/touch 语义；若 provider/reply 热区释放，应回到 Aster `Agent::reply` / provider trait。

### 2026-07-06：Batch C session record touch/delete current repository

- `completed`：`agent_session_repository::touch_session_updated_at(...)` 承接 add/replace conversation 后更新 `updated_at` 的 SQL；`delete_session(...)` 既有 current repository 入口接入 Aster trait adapter。
- `completed`：`aster_trait.rs::add_message(...)`、`replace_conversation(...)` 和 `delete_session(...)` 不再直接执行 `conn.execute(...)`；Aster trait adapter 只保留 runtime conversation 调用、current repository 调用和 metadata cache 同步。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 session record 写入 SQL 守卫，禁止 `aster_trait.rs` 恢复 `conn.execute(`、`DELETE FROM agent_sessions` 和 `UPDATE agent_sessions SET updated_at`。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/core/src/database/agent_session_repository.rs" "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs" "lime-rs/crates/agent/src/aster_session_store/legacy_conversation.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-agent-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core touch_session_updated_at --lib -j 2` 通过，`1 passed`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "session record 写入 SQL" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed`。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-agent-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过，`Finished dev profile`。
- `verified`：`rg -n "conn\\.execute\\(|UPDATE agent_sessions SET|DELETE FROM agent_sessions|INSERT INTO agent_sessions" "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs"` 无命中。
- `classification`：`current` 是 `agent_session_repository::touch_session_updated_at(...)` / `delete_session(...)`；`compat` 是 Aster trait adapter 的 runtime conversation 编排和 cache 同步；`dead / guarded` 是 Aster trait adapter 内 direct session record SQL。
- `remaining`：`aster_trait.rs` 的 export/import/copy/truncate Lime impl 已删除，仍保留 conversation runtime adapter 接线和 Aster `SessionStore` trait 本身；但该文件的 direct `agent_sessions` 写入 SQL 已清零。Phase 6 仍被 Aster `SessionStore` trait、provider/reply loop、runtime store persistence 和 native tool registry 壳阻塞。
- `next`：继续 Batch C 时优先评估 `export_session` / `import_session` / `copy_session` 是否能改为 current service / repository 编排；若 provider/reply 热区释放，应回到 Aster `Agent::reply` / provider trait。

### 2026-07-06：Batch C session metadata writes current repository

- `completed`：`agent_session_repository::update_session_name(...)`、`update_session_working_dir_with_updated_at(...)` 与 `update_session_type(...)` 承接 Aster `SessionStore` 的 name / working_dir / session_type 写入 SQL；`user_set_name` 与 `updated_at` 更新语义不再由 Aster trait adapter 维护。
- `completed`：`aster_trait.rs::update_session_name(...)`、`update_working_dir(...)` 与 `update_session_type(...)` 删除手写 `UPDATE agent_sessions SET title...` / `working_dir...` / `session_type...` SQL，退化为 current repository 调用和 metadata cache 同步。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 session metadata 守卫，禁止 Aster adapter 恢复 title/user_set_name、working_dir、session_type 的直接 SQL 与 `rusqlite::params!` 写入规则。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/core/src/database/agent_session_repository.rs" "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-agent-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core update_session_metadata --lib -j 2` 通过，`1 passed`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "session metadata" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed`。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-agent-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过；期间仍需检查 vendored `aster-core`，说明 Phase 6 blocker 未清零。
- `cleanup`：`aster_session_store/legacy_conversation.rs` 将 test-only `serialize_persisted_legacy_message_content_record` import 移入 `#[cfg(test)]`，清掉 `lime-agent` lib check 的 unused import warning。
- `classification`：`current` 是 `agent_session_repository` 中 name / working_dir / session_type 写入函数；`compat` 是 Aster trait adapter 的 DTO 字段映射和 cache 同步；`dead / guarded` 是 Aster trait adapter 内 metadata 直接 SQL。
- `remaining`：当时 `aster_trait.rs` 仍有 add/replace conversation 后只更新 `updated_at` 的 SQL 和 delete SQL；后续 session record touch/delete 批次已迁出。
- `next`：继续 Batch C 时优先把 conversation replace/truncate 后的 `updated_at` touch 迁到 current repository，随后再评估 `delete_session` / import-copy 编排是否能直接改为 current service。

### 2026-07-06：Batch C session extension data current repository

- `completed`：`agent_session_repository::update_session_extension_data(...)` 承接 `extension_data_json` 直接覆盖写入；Aster trait adapter 不再维护该 SQL。
- `completed`：`aster_trait.rs::update_extension_data(...)` 删除手写 `UPDATE agent_sessions SET extension_data_json...`，只保留 Aster `ExtensionData` DTO 序列化、current repository 调用和 metadata cache 同步。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 session extension_data 守卫，要求 current owner 在 `agent_session_repository.rs`，并禁止 `aster_trait.rs` 恢复 extension_data 写入 SQL 或 `rusqlite::params![extension_data_json...]`。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/core/src/database/agent_session_repository.rs" "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-agent-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core update_session_extension_data --lib -j 2` 通过，`1 passed`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "session extension_data" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed`。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-agent-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过；仅剩当时既有 test-only import warning，后续 metadata 批次已清理。
- `classification`：`current` 是 `agent_session_repository::update_session_extension_data(...)`；`compat` 是 Aster trait adapter 内 Aster `ExtensionData` 到 JSON 的序列化和 cache 同步；`dead / guarded` 是 Aster trait adapter 内手写 extension_data SQL。
- `remaining`：extension data 的 read/project 旁路已分批迁入 provider routing、subagent projection、todo task board 等 current owner，但 Aster `ExtensionData` 仍作为未移除的 `SessionStore` trait DTO 存在。
- `next`：继续 Batch C 时收缩 `update_session_name`、`update_working_dir`、`update_session_type` 等 session metadata 写入 SQL，减少 `aster_trait.rs` 的 remaining 写入面。

### 2026-07-06：Batch C session recipe current repository

- `completed`：`lime_core::database::agent_session_repository::SessionRecipeUpdate` 与 `update_session_recipe(...)` 承接 `recipe_json` / `user_recipe_values_json` 的直接覆盖写入语义；`None` 继续落库为 `NULL`，用于显式清空旧 recipe。
- `completed`：`aster_trait.rs::update_recipe(...)` 删除手写 `UPDATE agent_sessions SET recipe_json...` SQL，退化为 Aster `Recipe` / `user_recipe_values` DTO 序列化、current repository 调用和 metadata cache 同步。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 session recipe 守卫，要求 current owner 在 `agent_session_repository.rs`，并禁止 `aster_trait.rs` 恢复 recipe 覆盖 SQL、`rusqlite::params![recipe_json...]` 和旧直接覆盖注释。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/core/src/database/agent_session_repository.rs" "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs"` 通过。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "session recipe" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed`。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-agent-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-core -j 2` 通过，`Finished dev profile`。
- `blocked-validation`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-agent-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent update_recipe_should_clear_existing_values_when_input_is_none --lib -j 2` 在 vendor Aster 编译段长时间无产出后中断；未记为通过。该阻塞继续证明 root `aster` dependency 仍是 Phase 6 清理 blocker。
- `classification`：`current` 是 `agent_session_repository::SessionRecipeUpdate` / `update_session_recipe(...)` 的 recipe 直接覆盖/清空 SQL 语义；`compat` 是 `aster_trait.rs` 内 Aster `Recipe` / `HashMap<String, String>` 到 JSON 字符串的 DTO 序列化与 cache 同步；`dead / guarded` 是 Aster trait adapter 内手写 recipe SQL 和旧覆盖语义注释。
- `remaining`：当时 `update_extension_data`、`update_session_name`、`update_working_dir`、`update_session_type` 仍在 Aster trait adapter 内手写 SQL；后续 extension data / metadata 批次已迁出。
- `next`：继续 Batch C 时优先把 `update_extension_data` 写入迁到 current repository；该能力仍被 import/copy/session todo/subagent metadata 旁路真实使用，迁移后才能继续缩小 Aster `ExtensionData` 的生产面。

### 2026-07-06：Batch C session provider config current repository

- `completed`：`lime_core::database::agent_session_repository::SessionProviderConfigUpdate` 与 `update_session_provider_config(...)` 承接 provider/model/model_config 写入；provider/model trim、空值丢弃和 `None=保留旧值` 语义不再由 Aster trait adapter 维护。
- `completed`：`aster_trait.rs::update_provider_config(...)` 删除手写 provider/model_config SQL，只保留 Aster `ModelConfig` 序列化、current update DTO 构造和 metadata cache 同步。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 session provider config 守卫，禁止 Aster adapter 恢复 `provider_name = COALESCE(...)`、`model_config_json = CASE...`、`normalize_optional_text(provider_name...)` 和 model name trim 规则。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/core/src/database/agent_session_repository.rs" "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-agent-target" CARGO_INCREMENTAL=0 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core session_provider_config_update --lib -j 2` 通过，`1 passed`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "session provider config" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`2 passed`。
- `note`：`lime-agent update_provider_config` 复验曾在 recipe API 编辑期间启动，失败原因是旧 `lime-core` 编译产物未包含后续新增的 `update_session_recipe` / `SessionRecipeUpdate`，不是 provider config 迁移本身的语义失败；后续由 recipe 批次的 `lime-core` check 覆盖当前 repository 编译。
- `classification`：`current` 是 `agent_session_repository::SessionProviderConfigUpdate` / `update_session_provider_config(...)`；`compat` 是 `aster_trait.rs` 的 Aster `ModelConfig` 序列化和 cache 同步；`dead / guarded` 是 Aster trait adapter 内手写 provider/model_config SQL、provider/model 文本归一化和 None=保留旧值规则。
- `remaining`：provider/reply loop 仍持有 Aster provider trait object；provider config 写入迁出只收缩 SessionStore 写入面，不能作为删除 root `aster` dependency 的完成条件。

### 2026-07-06：Batch C session token stats current repository

- `completed`：`aster_trait.rs::update_token_stats(...)` 删除手写 token stats COALESCE SQL，改为调用 `lime_core::database::agent_session_repository::update_session_token_stats(...)` current repository。
- `completed`：`SessionTokenStatsUpdate::normalized_schedule_id(...)` 暴露 current 规范化结果，供 Aster adapter 同步 metadata cache；schedule_id trim / 空值丢弃和 None=保留旧值语义不再由 Aster adapter 维护。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 session token stats 守卫，要求 current owner 在 `agent_session_repository.rs`，并禁止 `aster_trait.rs` 恢复 COALESCE SQL、schedule_id SQL 更新和旧注释规则。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/core/src/database/agent_session_repository.rs" "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs"` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "session token stats" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed`。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-agent-target" CARGO_INCREMENTAL=0 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core update_session_token_stats --lib -j 2` 通过，`1 passed`。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-agent-target" CARGO_INCREMENTAL=0 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent update_token_stats --lib -j 2` 通过，`2 passed`；仅剩既有 `WorkspaceToolSurface` unused import warning。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 与 `git diff --check` 通过。
- `classification`：`current` 是 `lime_core::database::agent_session_repository::update_session_token_stats(...)` 与 `SessionTokenStatsUpdate`；`compat` 是 `aster_trait.rs` 的 Aster `TokenStatsUpdate` DTO 映射和 cache 同步；`dead / guarded` 是 Aster trait adapter 内手写 token stats SQL、schedule_id 归一化和 None=保留旧值规则。
- `remaining`：provider/model config、extension data、recipe 等 Aster trait 写入方法仍在 adapter 内维护 SQL / serialization 细节；最终删除条件仍是 Aster `SessionStore` trait 和 provider/reply loop 退出。
- `next`：继续 Batch C 时优先把 provider/model config 写入或 recipe 写入迁到 current repository；若 provider/reply 热区释放，则回到 `Agent::reply` / provider trait。

### 2026-07-06：Batch C legacy conversation content_json current owner

- `completed`：新增 `thread-store::legacy_conversation` current owner，承接 legacy `agent_messages.content_json` envelope、旧数组格式 fallback、`user_visible` / `agent_visible` 默认值和 role 归一化规则。
- `completed`：`aster_session_store/legacy_conversation.rs` 退化为 current `LegacyConversationMessageRecord` 到 Aster `MessageContent` / `MessageMetadata` / `Conversation` 的 DTO 转换；test fixture 序列化也复用 current serializer。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 legacy conversation 守卫，要求 current owner 不含 Aster，并禁止 Aster adapter 恢复 persisted content envelope、visibility default、old-array fallback 和 `role == "assistant"` 归一化规则。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/thread-store/src/legacy_conversation.rs" "lime-rs/crates/thread-store/src/lib.rs" "lime-rs/crates/agent/src/aster_session_store/legacy_conversation.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-legacy-conversation-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store legacy_conversation --lib -j 2` 通过，`3 passed`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "legacy conversation content_json" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed`。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-agent-target" CARGO_INCREMENTAL=0 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent legacy_agent_messages --lib -j 2` 通过，`1 passed`；仅剩既有 `WorkspaceToolSurface` unused import warning。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 与 `git diff --check` 通过。
- `classification`：`current` 是 `thread-store::legacy_conversation` 的 legacy message content read model 与解析规则；`compat` 是 `aster_session_store/legacy_conversation.rs` 的 Aster `MessageContent` / `Conversation` DTO 转换；`dead / guarded` 是 Aster adapter 内直接维护 legacy JSON envelope / visibility 默认值 / role 归一化的旧路径。
- `remaining`：legacy conversation 仍只作为启动期迁移输入存在；最终删除条件仍是 Aster `SessionStore` trait、runtime store persistence 和 provider/reply loop 退出。
- `next`：继续 Batch C 时应优先收缩 `aster_trait.rs` 剩余写入/导入导出方法，或在 provider/reply 热区释放后回到 `Agent::reply` / provider trait。

### 2026-07-06：Batch C session insights current owner

- `completed`：新增 `thread-store::session_insights` current owner，承接 `SessionInsightsRecord` 与 `project_session_insights(...)`，把 `total_sessions` / `total_tokens` 聚合投影规则从 Aster trait adapter 迁出。
- `completed`：`session_record_sql.rs` 新增 `load_session_insights_record(...)`，集中承接 `agent_sessions` 的 `COUNT(*)` 和 `COALESCE(SUM(...))` SQL 聚合；`aster_trait.rs::get_insights(...)` 只回填 Aster `SessionInsights` DTO。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 session insights 守卫，要求 current owner 不含 Aster，要求 SQL 聚合走 `session_record_sql.rs`，并禁止 `aster_trait.rs` 恢复 `COUNT/SUM` SQL 或 `total_sessions as usize` 转换。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/thread-store/src/session_insights.rs" "lime-rs/crates/thread-store/src/lib.rs" "lime-rs/crates/agent/src/session_record_sql.rs" "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-session-insights-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store session_insights --lib -j 2` 通过，`2 passed`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "session insights SQL" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed`。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-agent-target" CARGO_INCREMENTAL=0 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_record_sql --lib -j 2` 通过，`1 passed`；仅剩既有 `WorkspaceToolSurface` unused import warning。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 与 `git diff --check` 通过。
- `classification`：`current` 是 `thread-store::session_insights` 与 `session_record_sql.rs` 的 insights read model / SQL 聚合；`compat` 是 `aster_trait.rs` 的 Aster `SessionInsights` DTO 回填；`dead / guarded` 是 Aster trait adapter 内直接维护 session insights SQL 聚合的旧路径。
- `remaining`：Aster `SessionStore` trait 仍要求 `get_insights` 返回 Aster DTO，因此 adapter 暂不能删除；最终删除条件仍是 Aster `SessionStore` trait 和 provider/reply loop 退出。
- `next`：继续 Batch C 时优先拆 `legacy_conversation` 的 content_json / visibility 规则，或收缩 `aster_trait.rs` 剩余写入/导入导出方法。

### 2026-07-06：Batch C session memory disabled stub current owner

- `completed`：新增 `thread-store::memory_stub` current owner，承接 `SessionMemoryCommitReportRecord`、`SessionMemoryRecord`、`SessionMemorySearchResultRecord`、`SessionMemoryStatsRecord`、`SessionMemoryHealthRecord` 与 disabled memory stub projector；memory disabled/skipped 文案、commit report 零计数、空 search/context records、stats 和 health 默认规则不再由 Aster compat 模块维护。
- `completed`：`aster_session_store/memory_stub.rs` 退化为 current memory record 到 Aster `CommitReport` / `MemorySearchResult` / `MemoryRecord` / `MemoryStats` / `MemoryHealth` 的字段转换；Aster `MemoryCategory` 只在 compat DTO 回填时出现。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 session memory disabled stub 守卫，要求 `thread-store/src/memory_stub.rs` 存在且不含 Aster，并禁止 Aster adapter 恢复 disabled/skipped 文案、`CommitReport` 零计数构造、`source_start_ts: None` 和 `MemoryStats::default()` 规则。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/thread-store/src/memory_stub.rs" "lime-rs/crates/thread-store/src/lib.rs" "lime-rs/crates/agent/src/aster_session_store/memory_stub.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-stub-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store memory_stub --lib -j 2` 通过，`3 passed`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "session memory disabled stub" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed`。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-agent-target" CARGO_INCREMENTAL=0 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过，冷 target 耗时 `12m04s`。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 与 `git diff --check` 通过。
- `classification`：`current` 是 `thread-store::memory_stub` 的 disabled memory read model 与默认规则；`compat` 是 `aster_session_store/memory_stub.rs` 的 Aster DTO 字段转换；`dead / guarded` 是 Aster adapter 内直接维护 disabled/skipped 文案、空结果、stats/health 默认值的旧路径。
- `remaining`：Aster `SessionStore` trait 仍要求 memory 方法返回 Aster DTO，因此 adapter 暂不能删除；最终删除条件仍是 Aster `SessionStore` trait、provider/reply loop 和 root `aster` dependency 退出。
- `next`：继续 Batch C 时优先把 `get_insights` 的 SQL 聚合移出 `aster_trait.rs` 到 current session SQL/read model 边界；若 provider/reply 热区释放，应回到 `Agent::reply` / provider trait。

### 2026-07-06：Batch C session todo task board current owner

- `completed`：新增 `thread-store::task_board` current owner，承接 `TaskBoardItemRecord`、`TaskBoardStatusRecord`、`SessionTodoItemRecord`、`SessionTodoStatusRecord` 与 `project_session_todo_records(...)`；subject trim、空 subject 丢弃、active_form 非空归一化和 status 投影规则不再归属 `lime-agent` Aster adapter。
- `deleted`：删除 `lime-rs/crates/agent/src/session_store_todo_projection.rs`，并从 `session_store.rs` / `session_store_tests.rs` 移除本地投影模块和旧单测入口；等价纯规则测试迁到 `thread-store::task_board`。
- `completed`：`session_store_todo_aster_adapter.rs` 退化为 Aster `ExtensionData` / `TaskBoardItem` / `TaskBoardItemStatus` 到 current task board record 的转换，再把 current `SessionTodoItemRecord` 回填为现有 GUI/API `SessionTodoItem` DTO。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 session todo task board 守卫，要求 current owner 不含 Aster，要求旧 `session_store_todo_projection.rs` 保持删除，并禁止 Aster adapter 恢复 subject trim、空项过滤、active_form 归一化和 status 投影规则。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/thread-store/src/task_board.rs" "lime-rs/crates/thread-store/src/lib.rs" "lime-rs/crates/agent/src/session_store_todo_aster_adapter.rs" "lime-rs/crates/agent/src/session_store.rs" "lime-rs/crates/agent/src/session_store_tests.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-task-board-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store task_board --lib -j 2` 通过，`2 passed`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "session todo task board" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed`。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-task-board-agent-target" CARGO_INCREMENTAL=0 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过。
- `classification`：`current` 是 `thread-store::task_board` 的 task board/todo read model 与纯投影规则；`compat` 是 `session_store_todo_aster_adapter.rs` 的 Aster ExtensionData/TaskBoard DTO 转换和现有 API DTO 回填；`dead / deleted` 是 `session_store_todo_projection.rs` 旧本地投影模块。
- `remaining`：Aster task board 状态仍通过 `resolve_task_board_state(&ExtensionData)` 读取，因为 `SessionStore` trait / extension data 仍未迁出；最终删除条件仍是 Aster `SessionStore` trait 与 provider/reply loop 退出。
- `next`：继续 Batch C 时可继续拆 `aster_session_store` 的 memory / legacy conversation / insight trait-only surface；若 provider/reply 热区释放，应优先回到 `Agent::reply` / provider trait。

### 2026-07-06：Batch C session history search current owner

- `completed`：新增 `thread-store::history_search` current owner，承接 `SessionHistorySearchRecord`、`ConversationHistoryMessageRecord`、`ChatHistoryMatchRecord` 与 `search_chat_history_records(...)`；query trim / case-fold、limit、timestamp fallback、role、message content 和 relevance score 规则不再由 Aster compat 模块维护。
- `completed`：`aster_session_store/history_search.rs` 退化为 Aster `Session` / `Conversation` / `Message` 到 current history search record 的转换，并把 current `ChatHistoryMatchRecord` 回填成 Aster `ChatHistoryMatch`，以满足仍未迁出的 Aster `SessionStore` trait。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 session history search 守卫，要求 `thread-store/src/history_search.rs` 存在且不含 Aster，并禁止 `aster_session_store/history_search.rs` 恢复 `runtime_message_role`、query normalization、contains match、timestamp fallback 或 relevance 规则。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/thread-store/src/history_search.rs" "lime-rs/crates/thread-store/src/lib.rs" "lime-rs/crates/agent/src/aster_session_store/history_search.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-history-search-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store history_search --lib -j 2` 通过，`3 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent conversation_message_role_from_aster_should_project_rmcp_role --lib -j 2` 通过，`1 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "session history search" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed`。
- `note`：一次并行使用同一临时 target 目录跑 `thread-store` / `lime-agent` 测试触发 Rust incremental dep-graph 文件移动错误；已改为顺序复跑并通过，判定为验证环境竞争，不是代码错误。
- `classification`：`current` 是 `thread-store::history_search` 的搜索 read model 与匹配规则；`compat` 是 `aster_session_store/history_search.rs` 的 Aster DTO 转换和 Aster trait 返回类型回填；`dead / guarded` 是 Aster adapter 内旧的 `runtime_message_role`、query normalization、timestamp fallback 和 relevance 规则。
- `remaining`：Aster `SessionStore` trait 仍要求返回 `ChatHistoryMatch`，因此 adapter 暂不能删除；最终删除条件仍是 provider/reply loop 和 session trait 调用面迁出 Aster。
- `next`：继续 Batch C 时优先把 `aster_session_store` 中 remaining Aster trait-only 方法拆成 current read/write model 或在 provider/reply 热区释放后回到 `Agent::reply` / provider trait。

### 2026-07-06：Batch C/D Aster runtime store adapter 单一化

- `completed`：新增 `runtime_store_aster_adapter.rs`，集中承接 Aster shared runtime root 检测、`initialize_shared_session_runtime_with_root(...)`、`require_shared_session_runtime_store(...)` 与 `load_shared_session_runtime_snapshot(...)`。
- `completed`：`runtime_support.rs` 删除直接 `aster::session` / `aster::config` import，改为通过 `runtime_store_aster_adapter` 获取 Aster store / snapshot，再立即接到 current queue service 或 current snapshot overlay。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止 `runtime_support.rs` 恢复 `use aster::`、`initialize_shared_session_runtime_with_root`、`load_shared_session_runtime_snapshot`、`require_shared_session_runtime_store` 和公开 Aster snapshot 读取入口；同时要求 Aster store API 只能出现在 `runtime_store_aster_adapter.rs`。
- `verified`：`CARGO_NET_OFFLINE=true cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过；首次非离线 `cargo check` 卡在 crates.io index / package cache 锁，已中断后用离线模式复跑。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`93 passed`。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/agent/src/runtime_store_aster_adapter.rs" "lime-rs/crates/agent/src/runtime_support.rs" "lime-rs/crates/agent/src/lib.rs"`、`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 与 `git diff --check` 通过。
- `classification`：`current` 是 `runtime_support.rs` 的 runtime overlay / queue service 编排；`compat` 是 `runtime_store_aster_adapter.rs` 的 Aster shared store 初始化、store 获取和 snapshot 读取；`dead / guarded` 是 `runtime_support.rs` 直接 import / 调用 Aster shared runtime store API 的旧路径。
- `remaining`：Aster `ThreadRuntimeStore` / `SessionRuntimeSnapshot` 仍是底层持久化 DTO，只是入口已单一化；root `aster` dependency 仍由 provider/reply loop、native tool registry 壳、Aster `SessionStore` trait、session/thread store 与 agent turn loop 持有。
- `next`：下一刀应把 runtime snapshot / item persistence contract 继续迁到 `thread-store` current owner，或在 provider/reply 热区释放后回到 `Agent::reply` / Aster `Message` / `AgentEvent` / provider trait。

### 2026-07-06：Batch C/D Aster snapshot public surface 私有化

- `completed`：`runtime_support.rs` 的 `load_runtime_snapshot(...) -> SessionRuntimeSnapshot` 公开面已删除；外部生产调用面只保留 `load_runtime_snapshot_overlay(...)`，读取 Aster snapshot 后立即投影为 execution / timeline / subagent latest-turn current overlay。
- `guarded`：`asterMigrationBoundary.test.ts` 在 `runtime_support` 守卫中禁止恢复 `pub(crate) async fn load_runtime_snapshot(...)` / `pub async fn load_runtime_snapshot(...)`，同时要求保留私有 `load_aster_runtime_snapshot` 和公开 current overlay 入口。
- `verified`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`93 passed`。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/agent/src/runtime_support.rs"` 与 `npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `classification`：`current` 是 `load_runtime_snapshot_overlay(...)` 返回的 `SessionRuntimeSnapshotOverlay<ExecutionSnapshot, TimelineSnapshot>`；`compat` 是 `runtime_store_aster_adapter.rs` 的 Aster snapshot 读取和 `runtime_support.rs` 内部三个 Aster adapter 投影；`dead / guarded` 是可被其它模块直接调用的 Aster `SessionRuntimeSnapshot` 返回入口。
- `remaining`：这一步只收掉公开 surface，未删除底层 Aster store。`runtime_support.rs` 仍通过 Aster `ThreadRuntimeStore` / `load_shared_session_runtime_snapshot(...)` 读取数据，root `aster` dependency 仍由 provider/reply loop、native tool registry 壳、Aster `SessionStore` trait、session/thread store 与 agent turn loop 持有。
- `next`：Aster store acquisition 已由后续 `runtime_store_aster_adapter.rs` 条目单一化；继续 Batch C 时应把 runtime snapshot read model/source 持久化迁到 `thread-store` current owner。

### 2026-07-06：Batch C/D runtime snapshot adapter source 构造收口

- `completed`：新增 `runtime_timeline_adapter::project_aster_runtime_timeline_snapshot(...)`，把 Aster `SessionRuntimeSnapshot` 的 thread/turn/item 字段解包集中到 timeline compat adapter，并继续调用 `agent-runtime::runtime_timeline::project_runtime_timeline_snapshot(...)` current projector。
- `completed`：`runtime_snapshot_adapter.rs` 退化为 current timeline projection -> GUI DAO DTO 映射，只调用 `project_aster_runtime_timeline_snapshot(...)` 后再通过 `protocol_projection::{project_turn_runtime, project_item_runtime}` 输出前端现有 timeline DTO；它不再直接构造 `RuntimeTimelineSnapshotSource` / `RuntimeTimelineSnapshotThread`，也不再直接调用 `convert_aster_turn_runtime(...)` / `convert_aster_item_runtime(...)`。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止 `runtime_snapshot_adapter.rs` 恢复 `project_runtime_timeline_snapshot`、`RuntimeTimelineSnapshotSource`、`RuntimeTimelineSnapshotThread`、direct turn/item converter 调用和旧 `.first()` / `.flat_map(...)` snapshot 规则；同时要求 `runtime_timeline_adapter.rs` 成为唯一 Aster timeline source adapter。
- `verified`：`rustfmt --edition 2021 "lime-rs/crates/agent/src/runtime_timeline_adapter.rs" "lime-rs/crates/agent/src/runtime_snapshot_adapter.rs"` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_timeline_adapter --lib -j 2` 通过，`8 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent apply_runtime_snapshot_should_not_regress_aborted_turn_to_running --lib -j 2` 通过，`1 passed`；覆盖 `runtime_snapshot_adapter.rs` 的现有 session-store 消费路径。
- `verified`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`93 passed`。
- `classification`：`current` 是 `agent-runtime::runtime_timeline` 的 snapshot source/projector 与 `protocol_projection.rs` 的 current-to-GUI DTO 映射；`compat` 是 `runtime_timeline_adapter.rs` 的 Aster snapshot / turn / item source 解包；`dead / guarded` 是 `runtime_snapshot_adapter.rs` 内直接遍历 Aster snapshot、直接构造 snapshot source 和直接调用 Aster turn/item converter 的旧路径。
- `remaining`：`runtime_support.rs` 仍在 compat 边界读取 Aster `SessionRuntimeSnapshot`，runtime timeline source 仍从 Aster `TurnRuntime` / `ItemRuntimePayload` 字段映射；root `aster` dependency 仍由 provider/reply loop、native tool registry 壳、Aster `SessionStore` trait、session/thread store 与 agent turn loop 持有。
- `next`：继续 Batch C 时应迁出 `runtime_support.rs` 对 Aster `ThreadRuntimeStore` / `SessionRuntimeSnapshot` 的读取 contract；若 provider/reply 热区释放，则回到 Batch A/D 迁 `Agent::reply` / Aster `Message` / `AgentEvent` / provider trait。

### 2026-07-06：Batch C/D runtime timeline status payload current owner

- `completed`：`agent-runtime::runtime_timeline` 增加 `RuntimeStatusTimelineSource`、`format_runtime_status_timeline_text(...)`、`project_runtime_status_timeline_payload(...)` 与 `build_diagnostics_runtime_status_metadata(...)`，承接 runtime status TurnSummary 的 legacy title normalization、checkpoint 拼接、diagnostics metadata 和 `runtimeStatus.phase` 投影规则。
- `completed`：`runtime_timeline_adapter.rs` 删除本地 `format_runtime_status_text(...)` 与 `crate::protocol::build_diagnostics_runtime_status_metadata()` 直接构造逻辑；Aster `ItemRuntimePayload::RuntimeStatus` 分支现在只把 Aster 字段转交 current projector。
- `completed`：`agent-runtime::runtime_timeline` 增加 `RuntimeTimelineItemPayloadSource`、`RUNTIME_REQUEST_QUESTIONS_SCHEMA_KEY` 与 `project_runtime_timeline_item_payload(...)`，承接 transcript item 忽略、AgentMessage 默认 `phase: None`、request-user-input schema questions 解析、空 tool output 丢弃和各 item payload 展示规则。
- `completed`：`runtime_timeline_adapter.rs` 的 `convert_aster_item_payload_source(...)` 只把 Aster `ItemRuntimePayload` 字段解包成 current source enum；不再直接构造 `RuntimeTimelineItemPayload::*`，也不再保存 request schema key 或调用 request-question parser。
- `completed`：`agent-runtime::runtime_timeline` 增加 `RuntimeTimelineTurnSource`、`RuntimeTimelineItemSource`、`RuntimeTimelineTurnStatusSource`、`RuntimeTimelineItemStatusSource`、`project_runtime_timeline_turn(...)` 与 `project_runtime_timeline_item(...)`，承接 Queued/Running 折叠、prompt text 默认值、started_at fallback、item status 与 payload 投影接线规则。
- `completed`：`runtime_timeline_adapter.rs` 现在只把 Aster `TurnRuntime` / `ItemRuntime` 字段解包成 current source DTO；不再直接构造 `RuntimeTimelineTurnProjection` / `RuntimeTimelineItemProjection`，也不再维护 `unwrap_or_default` / `unwrap_or_else` 类 projection fallback。
- `deleted`：删除 `lime-agent/src/text_normalization.rs` 和 `mod text_normalization;`，避免已迁的 legacy 文案归一化 helper 继续留在 `lime-agent` 侧成为垃圾入口。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 runtime timeline snapshot / turn / item / payload source projector 归属 `agent-runtime::runtime_timeline`，禁止 `runtime_timeline_adapter.rs` 恢复 normalization / metadata / payload variant / request schema / projection fallback / status 折叠规则，并禁止恢复 `lime-agent/src/text_normalization.rs`。
- `validated`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-runtime/src/runtime_timeline.rs" "lime-rs/crates/agent/src/runtime_timeline_adapter.rs" "lime-rs/crates/agent/src/protocol.rs" "lime-rs/crates/agent/src/lib.rs"` 通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime runtime_timeline --lib -j 2`，7 个 current owner 单测通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_timeline_adapter --lib -j 2`，7 个 Aster timeline adapter 单测通过；仅剩既有 / 并行热区 `WorkspaceToolSurface` unused import warning。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent diagnostics_runtime_status_metadata_marks_runtime_status_as_transient --lib -j 2` 通过；确认 `lime-agent::protocol` re-export 的 metadata 仍保持前端现有消费语义。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，93 个治理测试通过。
- `validated`：`git diff --check -- "lime-rs/crates/agent-runtime/src/runtime_timeline.rs" "lime-rs/crates/agent/src/runtime_timeline_adapter.rs" "lime-rs/crates/agent/src/protocol.rs" "lime-rs/crates/agent/src/lib.rs" "lime-rs/crates/agent/src/text_normalization.rs" "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `classification`：`current` 是 `agent-runtime::runtime_timeline` 的 timeline DTO、snapshot projector、turn/item source projector、item payload source projector、request-question parser 与 runtime status TurnSummary projector；`compat` 是 `runtime_timeline_adapter.rs` 的 Aster `TurnRuntime` / `ItemRuntime` / `ItemRuntimePayload` 字段解包；`dead / deleted` 是 `lime-agent/src/text_normalization.rs` 与 adapter 内 runtime status 文案 / metadata / payload variant / request schema / projection fallback 构造旧规则。
- `remaining`：timeline source 仍从 Aster `TurnRuntime` / `ItemRuntimePayload` 解包，tool call raw output 文本提取仍由 adapter 调用 `tool-runtime` current helper 后写入 current source；根 `aster` dependency 仍由 provider/reply loop、native tool registry 壳、session/thread store、Aster `SessionStore` trait 与 agent turn loop 持有。
- `next`：继续迁 runtime store persistence/item payload contract 到 `thread-store` current owner，或在 provider/tool 热区释放后回到 `Agent::reply` / provider trait / native tool registry 壳，避免只做零散 helper 清理。

### 2026-07-06：Batch C runtime conversation Aster item adapter 单一化

- `completed`：新增 `runtime_conversation_aster_adapter.rs` 窄 compat 边界，集中承接 Aster `ThreadRuntimeStore` thread/item 遍历，以及 `ItemRuntimePayload::{TranscriptMessage,UserMessage,AgentMessage}` 到 `thread-store::conversation_transcript::RuntimeConversationItemSource` / `ConversationMessageRecord` 的转换。
- `completed`：`runtime_conversation_aster_adapter.rs` 同时承接 transcript item 构造和 `TranscriptMessage` 判定；`aster_session_store/runtime_conversation.rs` 不再手写 `ItemRuntimePayload` 三分支、不再直接构造 `ConversationMessageRecord`，只负责 Aster `Conversation` 兼容转换和 runtime store 读写接线。
- `completed`：`session_runtime_conversation_query.rs` 不再 import Aster `ThreadRuntimeStore`，也不再 import / match `ItemRuntimePayload`；GUI runtime detail conversation read model 只调用 `collect_conversation_records_from_aster_runtime_store(...)` 后消费 current `ConversationMessageRecord`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 Aster conversation payload 三分支只能出现在 `runtime_conversation_aster_adapter.rs`，禁止 `session_runtime_conversation_query.rs` 与 `aster_session_store/runtime_conversation.rs` 复制 payload 映射；同时保留 `thread-store::conversation_transcript` 的 current owner 断言。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_conversation_aster_adapter --lib -j 2`，3 个 adapter 单测通过；仅剩既有 / 并行写集 `WorkspaceToolSurface` unused import warning 与 `is_turn_auto_compact_due` dead code warning。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_runtime_conversation_query --lib -j 2`，2 个 runtime detail conversation read model 单测通过；同一既有 warning。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，92 个治理测试通过。
- `classification`：`current` 是 `thread-store::conversation_transcript` 的 record / selection 规则、`agent-runtime::runtime_conversation` 的 visibility/window projector 与 `session_runtime_conversation_query.rs` 的 GUI runtime detail read model；`compat` 是 `runtime_conversation_aster_adapter.rs` 的 Aster store 遍历、item payload 字段映射和 transcript item 构造；`dead / guarded` 是 runtime detail query 与 `aster_session_store/runtime_conversation.rs` 内重复匹配 Aster conversation payload 或直接持有 Aster store trait 的旧路径。
- `remaining`：runtime conversation 仍依赖 Aster `ThreadRuntimeStore` / `ItemRuntimePayload` 作为持久化 DTO，只是字段映射已单一化；timeline payload、subagent runtime item kind、Aster `SessionStore` trait、Aster `Message` / `AgentEvent`、provider/reply loop 与 native tool registry 壳仍是 root `aster` dependency blocker。
- `next`：继续迁 `ThreadRuntimeStore` / runtime item persistence contract 到 `thread-store` current owner，或在 provider/tool 热区释放后回到 Batch A/B 处理 `Agent::reply` / provider trait / native tool registry 壳。

### 2026-07-06：Batch A/D Aster message runtime DTO dead wrapper 删除

- `deleted`：删除 `message_content_adapter.rs` 中无生产消费者的 `convert_aster_message_to_runtime_message(...)` 包装函数；保留生产仍使用的 `convert_aster_message_to_runtime_message_with_turn_context(...)`，由 `convert_aster_message_to_events_with_turn_context(...)` 统一调用并传递 turn context。
- `test-only`：`event_converter.rs` 的 ActionRequired scope 测试改为从 `RuntimeAgentEvent::Message` 中读取 current `AgentMessage`，不再把 dead wrapper 当测试入口。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复无消费者的 `fn convert_aster_message_to_runtime_message(...)`，但允许 `with_turn_context` 作为 Aster `MessageContent` -> current runtime message/event 的 compat 投影边界。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent message_content_adapter --lib -j 2`，3 个 message content adapter 单测通过；仅剩既有 / 并行写集 `WorkspaceToolSurface` unused import warning 与 `is_turn_auto_compact_due` dead code warning。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent event_converter --lib -j 2`，17 个 event converter 单测通过；同一既有 warning。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过；`convert_aster_message_to_runtime_message` dead-code warning 已消失，仍剩既有 `is_turn_auto_compact_due` dead-code warning。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，93 个治理测试通过。
- `classification`：`compat` 是 `message_content_adapter.rs` 的 Aster `MessageContent` -> current `RuntimeAgentEvent` / `RuntimeAgentMessage` 投影；`dead / deleted` 是无 turn-context 的 runtime message 包装函数；`current` 仍是 `agent-protocol` / `tool-runtime` 的 action/tool result projection。
- `remaining`：Aster `Message` / `AgentEvent` 本身仍由 provider/reply loop compat 边界产生，`Agent::reply` 与 provider trait 未迁出；这一步只是清掉已迁后留下的 dead wrapper，不等于 Batch A/D 完成。

### 2026-07-06：Batch A/D context policy auto-compact dead wrapper 删除

- `deleted`：删除 `protocol_context_projection.rs` 中无生产消费者的 `is_turn_auto_compact_due(...)` 布尔 wrapper；context / auto-compact 状态继续通过 `project_runtime_context_budget_with_active_context_tokens(...)` 与 `project_turn_context_summary_with_active_context_tokens(...)` 的 current projection 暴露。
- `guarded`：`asterContextPolicyBoundary.test.ts` 保持 context / auto-compact budget owner 在 Lime current 主链，并禁止恢复 `fn is_turn_auto_compact_due` 这种额外 helper surface。
- `classification`：`current` 是 `protocol_context_projection.rs` 的 context budget projection 与 App Server context auto-compaction 主链；`dead / deleted` 是无消费者的 auto-compact due 布尔 wrapper；`compat` 无新增。
- `remaining`：Aster vendor context_mgmt 仍按守卫禁止重新承接 selected model context policy；provider/reply loop 和 runtime store persistence 仍是 root `aster` dependency blocker。

### 2026-07-06：Batch C execution runtime session DB read model current owner

- `completed`：新增 `session_execution_runtime_query.rs` current DB read model，直接从 `agent_sessions` 读取 provider/model/usage/recent metadata，并调用 `agent-runtime::session_execution::project_session_execution_runtime_session(...)` 得到 current projection。
- `completed`：`session_store_runtime_detail.rs` 的 execution runtime session / usage fallback 已切到 current DB read model；Aster `Session` 读取只剩 runtime conversation input，且 subagent parent context 调用改为 `load_subagent_parent_context(db, session_id, None)`，不再把 Aster session projection 传入 context 聚合。
- `deleted`：删除 `session_store_subagent_aster_adapter.rs` 和 `subagent_profiles_aster_adapter.rs`；session_store 子代理测试改为直接构造 Lime-owned `SubagentSessionProjection`，不再依赖 Aster subagent session metadata adapter。
- `deleted`：`session_execution_runtime_adapter.rs` 删除 Aster `Session` -> execution runtime session projection、Aster `ExtensionData` recent-state 读取和 Aster token usage source helper；该 adapter 只保留 Aster runtime snapshot / output schema runtime 到 current source 的兼容转换。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 execution runtime session DB read model 使用 `agent_sessions` / `SESSION_RECORD_SELECT_COLUMNS`，禁止 query 模块依赖 Aster；同时把 `subagent_profiles_aster_adapter.rs` / `session_store_subagent_aster_adapter.rs` 判为 deleted / forbidden-to-restore。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_execution_runtime --lib -j 2`，27 个 session execution/runtime query 测试通过；仅剩既有 / 并行写集 `WorkspaceToolSurface` unused import warning。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent build_child_subagent_session --lib -j 2`，2 个 child summary 测试通过；同一既有 warning。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent build_subagent_parent_context --lib -j 2`，2 个 parent context 测试通过；同一既有 warning。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent get_runtime_session_detail --lib -j 2`，2 个 runtime detail 快路径测试通过；同一既有 warning。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，92 个守卫测试通过。
- `classification`：`current` 是 `session_execution_runtime_query.rs` + `agent-runtime::session_execution` 的 DB read model / projector；`compat` 是 `session_execution_runtime_adapter.rs` 的 Aster runtime snapshot 字段映射；`dead / deleted` 是 Aster `Session` execution runtime projection、`session_runtime_conversation_adapter.rs`、`session_query.rs`、subagent Aster adapter、subagent customization Aster adapter。
- `remaining`：runtime support / queue / timeline / conversation source 仍经 Aster `ThreadRuntimeStore` / `ItemRuntimePayload` compat adapter；provider/reply loop、Aster `Message` / `AgentEvent`、native tool registry 壳仍是 root `aster` dependency blocker。
- `next`：继续把 runtime store persistence/item payload contract 迁入 current owner，或在 provider/tool 热区释放后回到 Batch A/B 清理 `Agent::reply`、provider trait 与 native tool registry 壳。

### 2026-07-06：Batch C runtime detail conversation DB/read model 接管

- `completed`：新增 `session_runtime_conversation_query.rs` current read model，直接读取共享 runtime store 的 thread/item records，复用 `thread-store::conversation_transcript` 的 record 选择规则与 `agent-runtime::runtime_conversation` 的 visibility/window projector，向 GUI runtime detail 返回 Lime `AgentMessage`。
- `completed`：`session_store_runtime_detail.rs` 已从 `read_session(...) + project_aster_runtime_conversation_window(...)` 切到 `read_runtime_conversation_window(...) + load_runtime_snapshot_overlay(...)` 并行读取；GUI runtime detail 不再通过 Aster `Session` / `Conversation` 获取 runtime conversation input。
- `completed`：`subagent_control.rs` 已从 Aster `query_subagent_session(...)` 切到 `agent_sessions.extension_data_json` 与 `session_execution_runtime_query.rs` current DB read model，读取 control state 与最终态 usage；`load_child_subagent_sessions(...)` 传入 DB，避免 child runtime status 再绕 Aster Session。
- `deleted`：删除 `session_query.rs` 和 `session_runtime_conversation_adapter.rs`；移除无引用 `project_aster_message(...)` helper，避免已迁 runtime detail conversation 继续留下垃圾入口。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `session_runtime_conversation_query.rs` 为 current read model，禁止恢复 `session_runtime_conversation_adapter.rs` / `session_query.rs`，并继续禁止 runtime detail 直接出现 `read_session(...)`、Aster conversation/message 遍历、`is_user_visible()` 或 `project_aster_message(...)`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_runtime_conversation_query --lib -j 2`，2 个 current read model 单测通过；仅剩既有 / 并行写集 `WorkspaceToolSurface` unused import warning 与 `is_turn_auto_compact_due` dead code warning。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent subagent_control --lib -j 2`，2 个 subagent control 单测通过；同一既有 warning。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent apply_current_runtime_conversation --lib -j 2`，1 个 runtime detail conversation 应用测试通过；同一既有 warning。
- `classification`：`current` 是 `session_runtime_conversation_query.rs` + `thread-store::conversation_transcript` + `agent-runtime::runtime_conversation` 的 runtime detail conversation read model，以及 `subagent_control.rs` 对 `agent_sessions` / `session_execution_runtime_query.rs` 的 current DB read；`compat` 是 runtime store 的 Aster `ThreadRuntimeStore` / `ItemRuntimePayload` 数据适配；`dead / deleted` 是 `session_query.rs`、`session_runtime_conversation_adapter.rs` 与 `project_aster_message(...)`。
- `remaining`：runtime conversation source 仍经 `runtime_conversation_aster_adapter.rs` 读取 Aster `ItemRuntimePayload`，timeline payload 仍经 Aster `ItemRuntimePayload` 字段映射；provider/reply loop、Aster `Message` / `AgentEvent`、native tool registry 壳、Aster `SessionStore` trait 仍是 root `aster` dependency blocker。
- `next`：继续把 runtime store persistence/item payload contract 迁到 current owner，或在 provider/tool 热区释放后回到 Batch A/B 清理 `Agent::reply` / provider trait / native tool registry 壳。

### 2026-07-06：Batch C subagent session DB read model current owner

- `completed`：新增 `session_store_subagent_query.rs` current DB read model，`load_child_subagent_session_projections(...)`、`read_subagent_session_projection(...)` 和 `read_session_name_projection(...)` 直接读取 `agent_sessions`，不再绕 Aster 全局 `query_child_subagent_sessions(...)` / `query_session(...)`。
- `completed`：`session_store_subagent_projection.rs` 继续承接 `extension_data_json` 的 `subagent_session.v0` / `subagent_customization.v0` raw JSON 解析，并把 `thread-store::SessionRecordRow` 投影成 Lime-owned `SubagentSessionProjection`。
- `completed`：`session_store_subagent_context.rs` 的前端 runtime detail child 列表和 parent context 聚合已切到 current DB read model；`session_store_subagent_aster_adapter.rs` 只保留 Aster `Session` -> current projection 的 compat 字段映射。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `session_store_subagent_query.rs` 使用 `agent_sessions` / `SESSION_RECORD_SELECT_COLUMNS`，禁止恢复 Aster `SessionManager` / `query_session` / `query_child_subagent_sessions`；同时继续禁止 context 直接 import Aster。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_store_subagent_projection --lib -j 2`，4 个 projection 单测通过；仍有既有 / 并行写集 `WorkspaceToolSurface` unused import warning。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_store_subagent_query --lib -j 2`，2 个 DB read model 单测通过；同一既有 warning。
- `classification`：`current` 是 `session_store_subagent_projection.rs` + `session_store_subagent_query.rs` 的 raw JSON / `agent_sessions` read model；`compat` 是 `session_store_subagent_aster_adapter.rs` 的 Aster session 字段映射；`dead / guarded` 是 GUI 子代理列表和 parent name 读取绕回 Aster query helper 的旧路径。
- `remaining`：runtime detail 仍通过 compat adapter 从 Aster `Session` 获取 raw session fields / conversation input；queued turn 持久化仍通过 Aster `ThreadRuntimeStore`；provider/reply loop、Aster `Message`、Aster `AgentEvent` 和 native tool registry 壳仍是 root `aster` dependency blocker。
- `next`：继续把 runtime detail 的 Aster `Session` raw fields / conversation input 或 message content source 迁到 current owner；若 provider/tool 热区释放，则回到 Batch A/B 清理 `Agent::reply` / provider trait / native tool registry 壳。

### 2026-07-06：Batch C subagent presentation metadata current owner

- `completed`：新增 `session_store_subagent_projection.rs` current owner，提供 `SUBAGENT_SESSION_EXTENSION_*` / `SUBAGENT_CUSTOMIZATION_EXTENSION_*` 常量与 `project_subagent_presentation_projection(...)`，承接 raw JSON -> `SubagentPresentationProjection` 的 metadata/customization 解析、parent id 校验、body/text 归一化和 customization 合并规则。
- `completed`：`session_store_subagent_aster_adapter.rs` 删除对 Aster `resolve_subagent_session_metadata(...)` 与 `subagent_customization_from_session(...)` 的依赖，只读取 Aster `ExtensionData` raw value 并转交 current projector；session 基础字段映射仍留在 compat adapter。
- `deleted`：`subagent_profiles_aster_adapter.rs` 删除零引用 production helper `subagent_customization_from_extension_data(...)` 与 `subagent_customization_from_session(...)`，只保留测试写入 extension data 的 helper。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `session_store_subagent_projection.rs` 持有 current parser，禁止 Aster adapter 恢复 metadata resolver、customization read helper、直接构造 `SubagentPresentationProjection` 或重新维护 body normalization。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_store_subagent_projection --lib -j 2`，2 个 current parser 单测通过；仅剩既有 / 并行写集 `WorkspaceToolSurface` unused import warning。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent build_child_subagent_session --lib -j 2`，2 个 child summary 行为测试通过；同一既有 warning。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent build_subagent_parent_context --lib -j 2`，2 个 parent context 行为测试通过；同一既有 warning。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，92 个治理测试通过。
- `classification`：`current` 是 `session_store_subagent_projection.rs` 的 raw JSON parser / presentation projector；`compat` 是 `session_store_subagent_aster_adapter.rs` 的 Aster `ExtensionData` raw value 和 session 基础字段映射；`dead / deleted` 是 production `subagent_customization_from_session(...)` read helper 与 adapter 内直接调用 Aster metadata resolver。
- `remaining`：runtime detail 仍通过 Aster `Session` 获取 raw conversation / session fields，Aster `Message` 内容投影、runtime store persistence、provider/reply loop 和 native tool registry 仍阻塞 root `aster` dependency 删除；下一刀应继续迁出 message content source 或 runtime store persistence contract。

### 2026-07-06：Batch C runtime detail conversation window current owner

- `completed`：新增 `agent-runtime::runtime_conversation`，提供 `RuntimeConversationMessageSource<Message>` 与 `project_runtime_conversation_window(...)`，承接 runtime detail 的 user-visible 过滤与 `history_limit` / `history_offset` window 规则，并保持无 limit 时忽略 offset 的既有兼容行为。
- `completed`：新增 `session_runtime_conversation_query.rs` current read model，直接从 runtime store item records 投影 Lime `AgentMessage`；旧 `session_runtime_conversation_adapter.rs` 已删除。
- `completed`：`session_store_runtime_detail.rs` 不再直接接收 `&aster::session::Session`、遍历 `conversation.messages()`、调用 `is_user_visible()`、`project_aster_message(...)` 或 `read_session(...)`；GUI `get_runtime_session_detail` 主链继续真实消费 current projection 后的 `AgentMessage` 列表。
- `test-only`：`session_store_tests.rs` 的 runtime conversation 测试改为直接构造 current `AgentMessage` window，再验证 runtime detail 应用结果。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime::runtime_conversation` 持有 conversation window current owner，禁止 `session_store_runtime_detail.rs` 恢复 Aster conversation/message 遍历、可见性过滤或消息投影。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime runtime_conversation --lib`，2 个 current owner 单测通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent apply_current_runtime_conversation --lib -j 2`，1 个 runtime detail conversation 测试通过；仅剩既有 / 并行写集 `WorkspaceToolSurface` unused import warning。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，92 个治理测试通过。
- `classification`：`current` 是 `agent-runtime::runtime_conversation` 的 visibility/window projection 与 `session_runtime_conversation_query.rs` 的 runtime detail read model；`compat` 是 runtime store 的 Aster `ThreadRuntimeStore` / `ItemRuntimePayload` 数据适配；`dead / deleted` 是 `session_runtime_conversation_adapter.rs`、`session_query.rs`、`session_store_runtime_detail.rs` 内直接遍历 Aster conversation、调用 `is_user_visible()`、调用 `project_aster_message(...)` 的旧路径。
- `remaining`：Aster `Message` 内容结构仍由 `message_content_adapter.rs` / provider/reply compat 边界投影，runtime conversation source 仍经 `runtime_conversation_aster_adapter.rs` 读取 Aster `ItemRuntimePayload`，timeline payload 仍经 Aster `ItemRuntimePayload` 字段映射；下一刀应继续迁出 runtime store persistence/item payload contract，或在 provider/tool 热区空闲后回到 `Agent::reply`。

### 2026-07-06：Batch C session execution session metadata current owner

- `completed`：`agent-runtime::session_execution` 新增 `SessionExecutionRuntimeSessionSource<UsageSource>`、`project_session_execution_runtime_session(...)` 与 `SESSION_RECENT_*` extension key 常量，承接 provider/model 文本归一化、session usage source 投影接线、recent access/preferences/team selection raw JSON 反序列化与 team selection normalize 规则。
- `completed`：`session_execution_runtime_adapter.rs` 删除 `DeserializeOwned` / `serde_json::from_value` / `SessionExecutionRuntimeRecentTeamSelection::normalize` 等 current 规则，只把 Aster `Session` provider/model/token 字段和 `ExtensionData` raw value 映射到 current source。
- `completed`：GUI runtime detail 继续通过 `project_aster_session_execution_runtime_session(...)` 得到 current projection；后续 `build_session_execution_runtime(...)`、usage fallback、recent settings fallback 仍真实使用迁移后的 current owner，不新增 mock 或平行入口。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime::session_execution` 持有 session source/projector 与 recent extension key，禁止 Aster adapter 恢复 `DeserializeOwned`、`serde_json::from_value`、`read_session_runtime_extension_state` 或 team selection normalize 规则。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime session_execution --lib`，6 个 current owner 单测通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_execution_runtime --lib -j 2`，24 个 runtime detail / recent settings 单测通过；仅剩既有 / 并行写集 `WorkspaceToolSurface` unused import warning。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2`；仅剩既有 `model_request_policy` dead code warning。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，91 个治理测试通过。
- `classification`：`current` 是 `agent-runtime::session_execution` 的 session source/projector、recent extension key 与 raw JSON -> read model 规则；`compat` 是 `session_execution_runtime_adapter.rs` 的 Aster `Session` raw 字段 / `ExtensionData` raw value 映射；`dead / guarded` 是 Aster adapter 内直接反序列化 recent state、归一化 team selection 或维护 provider/model/usage projection 规则。
- `remaining`：runtime detail 仍从 Aster `Session` 读取 runtime conversation 与 subagent parent context，queued turn / runtime snapshot 持久化仍通过 Aster `ThreadRuntimeStore`；下一刀应继续把 runtime conversation/message source 或 subagent session source 迁入 current DTO，或在 provider/tool 热区空闲后回到 `Agent::reply` / native tool registry。

### 2026-07-06：Batch C session execution usage source current owner

- `completed`：`agent-runtime::session_execution` 新增 `SessionExecutionRuntimeUsageSource`、`SessionExecutionRuntimeUsageProjection` 与 `project_session_execution_runtime_usage(...)`，承接 input/output token 非负校验和 cache token 负数丢弃规则。
- `completed`：`session_usage_projection.rs` 退化为 current usage projection 到 `AgentTokenUsage` 的薄映射；`direct_text_generation` 继续通过 DB / current projection 获取 usage fallback。
- `completed`：`session_execution_runtime_adapter.rs` 删除 `project_aster_session_usage(...)` 正向入口，只保留 Aster `Session` token 字段 -> current `SessionExecutionRuntimeUsageSource` 的字段映射。
- `completed`：`session_store_runtime_detail.rs` 的 usage fallback 复用 `execution_runtime_session.usage`，不再单独调用 Aster usage projector；现有 GUI session detail 主链继续真实使用迁移后的 usage。
- `test-only`：`session_store_tests.rs` 的 usage fallback 测试改为使用 `session_usage_projection::project_token_usage(...)`，不再把 Aster session usage adapter 当正向测试入口。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 usage source/projector 归属 `agent-runtime::session_execution`，禁止 adapter 恢复 `project_aster_session_usage(...)` / 直接维护 token 校验规则，并禁止 runtime detail 重新调用 Aster usage projector。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime session_execution --lib`，6 个 current owner 单测通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_usage_projection --lib -j 2`，2 个 `AgentTokenUsage` 映射单测通过；仅剩既有 / 并行写集 `WorkspaceToolSurface` unused import warning。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent get_runtime_session_detail --lib -j 2`，2 个 GUI runtime detail 测试通过；同一既有 warning。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_store --lib -j 2`，59 个 session store 相关测试通过；同一既有 warning。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，91 个治理测试通过。
- `classification`：`current` 是 `agent-runtime::session_execution` 的 usage source/projector 与 `session_usage_projection.rs` 的 `AgentTokenUsage` 映射；`compat` 是 Aster `Session` token 字段到 current usage source 的 DTO 转换；`dead / guarded` 是 `project_aster_session_usage(...)` 和 runtime detail 直接调用 Aster usage projector。
- `remaining`：GUI runtime detail 仍通过 Aster `Session` 读取 runtime conversation、execution runtime session metadata 与 subagent parent context；下一刀应继续把 conversation source 或 recent metadata source 迁入 current DTO，避免 Aster `Session` 继续作为 runtime detail 汇聚点。

### 2026-07-06：Batch C runtime detail provider routing metadata current owner

- `completed`：新增 `session_store_provider_routing.rs`，按 current JSON pointer 规则解析 `providerSelector` / `provider_selector` / `extensionData.lime_provider_routing.v0` / `lime_provider_routing.v0`，不依赖 Aster `ExtensionState`。
- `completed`：`lime_core::database::agent_session_repository::get_session_extension_data_json(...)` 承接 session extension metadata 的 DB 读取入口，避免 GUI runtime detail 主链绕回 Aster `Session.extension_data`。
- `completed`：`session_store.rs` 删除 `SessionProviderRoutingState`、`ExtensionState`、`AsterSession` provider selector 解析；`session_store_runtime_detail.rs` 改为通过 `read_session_provider_selector(...)` 给 `build_session_execution_runtime(...)` 填充 provider selector。
- `test-only`：`session_store_tests.rs` 显式导入 `AsterSession`，不再依赖父模块的生产 import；Aster DTO 仅作为现有 session store 测试夹具存在。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 provider routing metadata current helper 存在且不含 Aster，禁止 `session_store.rs` / `session_store_runtime_detail.rs` 恢复 Aster `ExtensionState` / `session.extension_data` 解析。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_store_provider_routing --lib -j 2`，3 个 current metadata parser 单测通过；仅剩既有 / 并行写集 `WorkspaceToolSurface` unused import warning。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent get_runtime_session_detail --lib -j 2`，2 个 GUI runtime detail 相关测试通过；同一既有 warning。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core agent_session_repository --lib`，3 个 core repository 单测通过，覆盖 extension_data_json 读取。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，91 个治理测试通过。
- `classification`：`current` 是 `session_store_provider_routing.rs` + `agent_session_repository::get_session_extension_data_json(...)` 的 provider routing metadata 读取/解析；`compat` 是 runtime detail 中仍用于 conversation、usage、subagent parent context 的 Aster session DTO；`dead / guarded` 是 `session_store.rs` 通过 Aster `ExtensionState` / `Session.extension_data` 解析 execution runtime provider selector。
- `codex-reference`：对齐 Codex app-server request context 的 JSON pointer 读取方式，metadata 由 current read model 解释，runtime adapter 不再成为 provider routing 的事实源。
- `remaining`：GUI runtime detail 仍通过 Aster `Session` 读取 runtime conversation / usage fallback / subagent metadata；下一刀应继续把这些 projection source 迁入 current DTO，或在 provider/tool 热区空闲后回到 `Agent::reply` / native tool registry。

### 2026-07-06：Batch C session record SQL boundary current owner

- `completed`：新增 `lime-agent/src/session_record_sql.rs`，集中承接 `agent_sessions` session record select columns、`rusqlite::Row` -> `thread-store::SessionRecordRow` 映射和 `load_session_record_rows(...)` 列表加载；该边界不依赖 Aster。
- `completed`：`aster_session_store/session_projection.rs` 删除 `map_session_listing_row(...)` 与 `load_listed_sessions(...)`，只保留 current `SessionRecordProjection` -> Aster `Session` DTO 适配。
- `completed`：`aster_trait.rs` 的 `get_session` 改为通过 `session_record_sql::map_session_record_row(...)` + `session_projection::build_session_from_listing_row(...)` 构造 metadata，再只补 conversation / message_count；不再手写 session row tuple、timestamp/json/session_type/model fallback 规则。
- `completed`：`list_sessions`、`list_sessions_by_types`、`search_chat_history` 与 `lime_session_repository.rs` 复用 `SESSION_RECORD_SELECT_COLUMNS` / `map_session_record_row(...)`，减少 compat adapter 与 current repository 的重复 SQL row 映射。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `session_record_sql.rs` 持有 current SQL row owner，并禁止 `aster_session_store/session_projection.rs` 恢复 row SQL 映射 / 列表加载，禁止 `aster_trait.rs` 恢复手写 session record 投影规则。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store session_record --lib`，4 个 current session record 单测通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_store --lib -j 2`，56 个 session store / Aster compat 测试通过；仅剩既有 / 并行写集 `WorkspaceToolSurface` unused import warning。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，90 个治理测试通过。
- `classification`：`current` 是 `session_record_sql.rs` + `thread-store::session_record` 的 SQL row / projection 规则；`compat` 是 `aster_session_store/session_projection.rs` 的 Aster `Session` DTO 转换与 `aster_trait.rs` 的 Aster `SessionStore` trait；`dead / guarded` 是 Aster compat 子模块重新维护 row mapper、列表加载、get_session row tuple 解析的旧路径。
- `codex-reference`：本轮按 `/Users/coso/Documents/dev/rust/codex/codex-rs` 的 state/rollout 分层方式处理：state/record 规则集中在 owner 边界，runtime/compat 层只消费已规范化 read model，不在 trait adapter 内重新拼 row 语义。
- `remaining`：Aster `SessionStore` trait 本身、`Session` / `Message` DTO、runtime `ThreadRuntimeStore`、provider/reply loop 与 native tool registry 壳仍持有 root `aster` dependency；下一刀应继续迁出 session/thread persistence contract 或等待 provider/tool 热区空闲后处理 `Agent::reply`。

### 2026-07-06：Batch C runtime conversation transcript projector current owner

- `completed`：`thread-store::conversation_transcript` 新增 `RuntimeConversationItemSource` 与 `project_runtime_conversation_record(...)`，承接 runtime item 到 conversation transcript / fallback projection record 的选择与构造规则。
- `completed`：`runtime_conversation_aster_adapter.rs` 接管 Aster `ItemRuntimePayload` 到 `RuntimeConversationItemSource` 的字段映射，然后调用 current projector；`aster_session_store/runtime_conversation.rs` 不再直接调用 `ConversationMessageRecord::transcript(...)` / `runtime_projection(...)`，也不再复制 payload 映射。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 current owner 持有 `RuntimeConversationItemSource` 与 `project_runtime_conversation_record(...)`，要求 Aster conversation payload 三分支只留在 `runtime_conversation_aster_adapter.rs`，并禁止 `runtime_conversation.rs` 恢复 transcript/projection record 纯规则或复制 payload 映射。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store conversation_transcript --lib`，5 个 current owner 单测通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_store --lib -j 2`，56 个 session store / runtime conversation 相关测试通过；仅剩既有 / 并行写集 `WorkspaceToolSurface` unused import warning。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，89 个治理测试通过。
- `classification`：`current` 是 `thread-store::conversation_transcript` 的 runtime conversation source/projector 与 transcript selection 规则；`compat` 是 `runtime_conversation_aster_adapter.rs` 的 Aster `ItemRuntimePayload` 字段映射 / transcript item 构造，以及 `aster_session_store/runtime_conversation.rs` 的 Aster `Conversation` 转换；`dead / guarded` 是 runtime conversation 调用点直接构造 `ConversationMessageRecord`、复制 payload 映射或自行维护 transcript/projection 选择规则的旧路径。
- `remaining`：Aster `ThreadRuntimeStore`、`ThreadRuntime`、`TurnRuntime`、`ItemRuntime` 仍是 session/thread store 兼容边界；下一刀应继续把 runtime store source/record contract 迁入 `thread-store`，或在 provider/reply 热区空闲后处理 `Agent::reply` / provider trait。

### 2026-07-06：Batch C/D runtime queue Aster store adapter 隔离

- `completed`：新增 `runtime_queue_aster_adapter.rs`，作为 Aster `ThreadRuntimeStore` / `QueuedTurnRuntime` 到 `agent-runtime::runtime_queue::RuntimeQueueService` 的单一 compat 边界。
- `completed`：`runtime_support.rs` 删除 `runtime_queued_turn_from_aster(...)`、`aster_queued_turn_from_runtime(...)` 与 `impl RuntimeQueueStore for AsterRuntimeQueueStoreAdapter`，只通过 `runtime_queue_service_from_store(...)` 接入 current queue service。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 Aster queued-turn DTO 转换只能存在于 `runtime_queue_aster_adapter.rs`，禁止 `runtime_support.rs` 重新承接 queue adapter / conversion 规则。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime runtime_queue --lib`，6 个 current queue service 单测通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_queue --lib -j 2`，测试过滤无匹配但完成 `lime-agent` test build；仅剩既有 / 并行写集 `WorkspaceToolSurface` 与 `RuntimeToolExecutionError` unused import warning。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，89 个治理测试通过。
- `classification`：`current` 是 `agent-runtime::runtime_queue` queue DTO/store/gate/service；`compat` 是 `runtime_queue_aster_adapter.rs` 的 Aster store DTO 转换；`dead / guarded` 是 `runtime_support.rs` 直接维护 Aster queued-turn conversion 和 queue store adapter 的旧路径。
- `remaining`：queued turn 持久化仍通过 Aster `ThreadRuntimeStore`；最终删除 root `aster` dependency 前，还需要把 store persistence contract 迁到 `thread-store` 或其它 current store owner。

### 2026-07-06：Batch C/D runtime timeline snapshot projector current owner

- `completed`：新增 `agent-runtime::runtime_timeline` 模块，避免继续膨胀 `session_execution.rs`；该模块承接 `RuntimeTimelineTurnStatus`、`RuntimeTimelineTurnProjection`、`RuntimeTimelineItemStatus`、`RuntimeTimelineItemPayload`、`RuntimeTimelineItemProjection`、`RuntimeTimelineSnapshotSource`、`RuntimeTimelineSnapshotThread` 与 `project_runtime_timeline_snapshot(...)`。
- `completed`：request-user-input 的 schema question / option 解析迁入 `agent-runtime::runtime_timeline::extract_runtime_request_questions_from_schema(...)`，不再由 Aster timeline adapter 维护 GUI `AgentRequestQuestion` / `AgentRequestOption` 构造规则。
- `completed`：`runtime_timeline_adapter.rs` 不再直接输出 GUI timeline DAO status / payload DTO，改为把 Aster `TurnRuntime` / `ItemRuntimePayload` 字段映射到 `agent-runtime::runtime_timeline` current DTO。
- `completed`：`protocol_projection.rs` 成为 current timeline DTO 到现有 `AgentThreadTurn` / `AgentThreadItem` GUI timeline DTO 的唯一映射点；`event_converter.rs` 与 `runtime_snapshot_adapter.rs` 已显式通过该边界输出前端继续消费的 current timeline DTO。
- `completed`：`runtime_snapshot_adapter.rs` 退化为 Aster `SessionRuntimeSnapshot` 到 `RuntimeTimelineSnapshotSource` 的字段映射，再调用 `project_runtime_timeline_snapshot(...)`；adapter 内直接维护 `.first()` / `.flat_map(...)` 的 snapshot 规则已删除。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 runtime timeline current DTO/source/projector 归属 `agent-runtime::runtime_timeline`，禁止 `runtime_snapshot_adapter.rs` 恢复 snapshot flatten/thread_id 选择规则，并禁止 `runtime_timeline_adapter.rs` 重新直接输出 GUI timeline status / payload / request question DTO。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime runtime_timeline --lib`，2 个 current owner 单测通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime session_execution --lib`，5 个 session/subagent current owner 单测通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent protocol_projection --lib -j 2`，1 个 current 到 GUI DTO 映射单测通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_timeline_adapter --lib -j 2`，7 个 Aster timeline adapter 单测通过；仅剩既有 / 并行写集 `WorkspaceToolSurface` unused import warning。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_store --lib -j 2`，56 个 session store / runtime overlay 相关测试通过；仅剩同一既有 / 并行写集 `WorkspaceToolSurface` unused import warning。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，89 个治理测试通过。
- `classification`：`current` 是 `agent-runtime::runtime_timeline` 的 runtime timeline DTO/source/projector/request-question parser 与 `protocol_projection.rs` 的 current-to-GUI 映射；`compat` 是 `runtime_timeline_adapter.rs` / `runtime_snapshot_adapter.rs` 的 Aster DTO 字段转换；`dead / guarded` 是 `runtime_snapshot_adapter.rs` 直接维护 snapshot flatten/thread_id 规则、`runtime_timeline_adapter.rs` 直接输出 GUI status/payload/request-question DTO 的旧路径。
- `remaining`：timeline source 仍从 Aster `TurnRuntime` / `ItemRuntimePayload` 映射，Aster `SessionRuntimeSnapshot` 读取仍在 `runtime_support.rs` compat 边界；provider/reply loop、native tool registry 壳、session/thread store 与 agent turn loop 仍持有 root `aster` dependency。下一刀应继续迁 session/thread store 读取 contract，或在 provider/reply 热区空闲后回到 `Agent::reply` / provider trait。

### 2026-07-06：Batch C session execution snapshot projector current owner

- `completed`：`agent-runtime::session_execution` 新增 `SessionExecutionRuntimeSnapshotSource`、`SessionExecutionRuntimeThreadSource` 与 `SessionExecutionRuntimeTurnSource`，作为 session execution runtime snapshot 的 current source read model。
- `completed`：latest-turn 选择、recent access mode 解析、recent harness context 的 turn/thread fallback 合并规则迁入 `agent-runtime::session_execution::project_session_execution_runtime_snapshot(...)`。
- `completed`：`session_execution_runtime_adapter.rs` 删除 `resolve_latest_aster_turn(...)`、`project_recent_access_mode_from_aster_snapshot(...)`、`project_recent_harness_context_from_aster_snapshot(...)` 等规则函数，只负责把 Aster `SessionRuntimeSnapshot` / `TurnRuntime` 转成 current source DTO。
- `deleted`：`lime-agent/src/session_execution_runtime.rs` 中不再使用的 `SessionExecutionRuntimeTurnProjection` type alias 已删除，避免迁移后留下死出口。
- `guarded`：`asterMigrationBoundary.test.ts` 新增守卫，要求 session execution snapshot source/projector 归属 `agent-runtime`，禁止 adapter 恢复 latest-turn / recent-context 业务规则。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime session_execution --lib`，6 个 current owner 单测通过。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2`；仅剩非本轮写集 `live_execution_process.rs` 的 unused import warning。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_execution_runtime --lib -j 2`，24 个相关测试通过；仍有既有 / 并行写集 unused import warning。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，88 个治理测试通过。
- `classification`：`current` 是 `agent-runtime::session_execution` 的 session execution snapshot source/projector；`compat` 是 `session_execution_runtime_adapter.rs` 的 Aster snapshot 字段映射；`dead / guarded` 是 adapter 内直接维护 latest-turn / recent access / recent harness 规则的旧路径。
- `remaining`：Aster `SessionRuntimeSnapshot` 读取、runtime timeline DTO adapter、provider/reply loop、native tool registry 壳和 session/thread store 仍持有 root `aster` dependency。

### 2026-07-06：Batch C/D subagent latest-turn projection current owner

- `completed`：`agent-runtime::session_execution` 新增 `SubagentRuntimeSnapshotProjection`、`SubagentRuntimeThreadProjection`、`SubagentRuntimeTurnProjection`、`SubagentRuntimeItemKind` 与 `SubagentRuntimeItemProjection`，作为 subagent runtime snapshot 的 Lime-owned read model。
- `completed`：subagent latest-turn 选择、duration 计算、tool count 统计与 worker result ref 构造规则迁入 `agent-runtime::session_execution::project_subagent_latest_turn(...)`；这些规则不再由 Aster adapter 持有。
- `completed`：`agent-runtime::session_execution` 增加 `SubagentRuntimeItemKindSource` 与 `project_subagent_runtime_item_kind(...)`，承接 Aster runtime item payload kind 到 `ToolCall` / `AgentMessage` / `Other` 的 current 归类规则。
- `completed`：`subagent_runtime_adapter.rs` 退化为 Aster `SessionRuntimeSnapshot` / `TurnRuntime` / `ItemRuntime` 到 current projection/source 的字段映射，然后调用 current projector；adapter production 不再直接构造 `SubagentRuntimeItemKind::*`。
- `guarded`：`asterMigrationBoundary.test.ts` 新增守卫，禁止 `subagent_runtime_adapter.rs` 恢复 latest-turn 排序、duration、tool count、result ref 构造规则和 item kind 归类规则，并要求 current owner 持有 projection DTO / source DTO 与 projector。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime project_subagent --lib -j 2`，2 个 current owner 单测通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent subagent_runtime_adapter --lib -j 2`，1 个 adapter 测试通过；仍有既有 / 并行热区 `WorkspaceToolSurface` unused import warning 与 `agent_tools/tool_lifecycle.rs` dead-code warning。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过；仍有既有 / 并行热区 `agent_tools/tool_lifecycle.rs` dead-code warning。
- `validated`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-runtime/src/session_execution.rs" "lime-rs/crates/agent/src/subagent_runtime_adapter.rs"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，93 个治理测试通过。
- `classification`：`current` 是 `agent-runtime::session_execution` 的 subagent runtime snapshot projection、item kind source/projector 与 latest-turn projector；`compat` 是 `subagent_runtime_adapter.rs` 的 Aster DTO/source 转换；`dead / guarded` 是 adapter 内直接维护 latest-turn 业务规则和 item kind 归类规则的旧路径。
- `remaining`：`runtime_support.rs` 仍读取 Aster `SessionRuntimeSnapshot`，`runtime_timeline_adapter.rs` / `session_execution_runtime_adapter.rs` 仍是 snapshot 转换兼容边界；root `aster` dependency 仍由 provider/reply loop、native tool registry 壳、session/thread store 与 agent turn loop 持有。

### 2026-07-06：Batch C/D runtime queue service/gate current owner

- `completed`：`agent-runtime::runtime_queue` 从 DTO owner 扩展为 current queue service owner，新增 `RuntimeQueueStore`、`RuntimeExecutionGate` 与 `RuntimeQueueService`；Aster `SessionRuntimeQueueService` 的 active gate、submit、resume、finish-matching-turn-and-take-next 语义已迁入 Lime-owned crate。
- `completed`：`runtime_support.rs` 删除 `require_shared_session_runtime_queue_service` / Aster `RuntimeQueueSubmitResult` 生产依赖，改为用 `AsterRuntimeQueueStoreAdapter` 把 Aster `ThreadRuntimeStore` 数据操作适配给 current `RuntimeQueueService`。
- `completed`：`subagent_control.rs` active turn 判断改为调用 `runtime_support::runtime_queue_has_active_turn(...)`，不再绕过 current queue service 直接读 Aster queue service。
- `deleted`：`lime-agent/src/runtime_queue.rs` 中验证 Aster `SessionRuntimeQueueService` 的 test-only fixture 已删除；等价 gate / submit / stale completion 覆盖迁到 `agent-runtime::runtime_queue` current owner 单测。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `RuntimeQueueStore` / `RuntimeExecutionGate` / `RuntimeQueueService` 归属 `agent-runtime`，禁止 `runtime_queue.rs` production 和 `subagent_control.rs` 回退到 `require_shared_session_runtime_queue_service`，并要求 `runtime_support.rs` 只能保留 Aster store adapter。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime runtime_queue --lib`，6 个 current owner 单测通过。
- `validated`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-runtime/src/runtime_queue.rs" "lime-rs/crates/agent/src/runtime_support.rs" "lime-rs/crates/agent/src/runtime_queue.rs" "lime-rs/crates/agent/src/subagent_control.rs"`。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2`。
- `blocked-validation`：两次使用独立 `/tmp/lime-agent-*-target` 跑 `lime-agent` 定向测试时因磁盘空间不足失败（`No space left on device`），不是 Rust 编译错误；已清理本轮创建的临时 target 并改用共享 `lime-rs/target` 完成编译检查。`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check` 仍被非本轮写集 `lime-rs/crates/agent/src/model_request_policy.rs` 的既有格式差异阻塞，因此本轮采用 touched-file `rustfmt --check`。
- `classification`：`current` 是 `agent-runtime::runtime_queue` 的 queue DTO、store trait、execution gate 与 service；`compat` 是 `runtime_support.rs` 中的 `AsterRuntimeQueueStoreAdapter` 和 Aster `ThreadRuntimeStore` 数据持久化；`dead` 是 `lime-agent/src/runtime_queue.rs` 中直接验证/消费 Aster `SessionRuntimeQueueService` 的旧测试路径。
- `remaining`：Aster `ThreadRuntimeStore`、`SessionRuntimeSnapshot` adapter、provider/reply loop、native tool registry 壳仍持有 root `aster` dependency；下一刀应继续把 runtime store/snapshot read model 迁到 current owner，或在 provider 写集空闲后回到 `Agent::reply` / provider trait。

### 2026-07-06：Batch C/D runtime queue current queued turn contract

- `completed`：新增 `agent-runtime::runtime_queue` current owner，承接 `RuntimeQueuedTurn` 与 `RuntimeQueueSubmitResult`；该模块不依赖 Aster。
- `completed`：`runtime_support.rs` 新增 Aster queued turn / submit result 的边界转换，向业务层暴露 current `RuntimeQueuedTurn`、`RuntimeQueueSubmitResult`、`submit_runtime_turn_to_queue(...)`、`take_next_runtime_queued_turn(...)`、`runtime_queue_has_active_turn(...)` 与 active turn finish wrapper。
- `completed`：`runtime_queue.rs` production 移除 `aster::session::QueuedTurnRuntime`、Aster `RuntimeQueueSubmitResult` 与 `require_shared_session_runtime_queue_service` 直接依赖；队列编排继续使用 current queued turn payload 启动后台 turn、发出 GUI queue events、list/remove/promote/clear queue。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 runtime queue 守卫，要求 current DTO 归属 `agent-runtime::runtime_queue`，并禁止 `runtime_queue.rs` production 回退到 Aster queue service / `QueuedTurnRuntime`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime runtime_queue --lib`，2 个 current owner 单测通过。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-agent-runtime-queue-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_queue --lib`，4 个 runtime queue 单测通过；仅剩既有 `WorkspaceToolSurface` unused import warning。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check`。
- `validated`：`cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" --package aster-core -- --check`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，85 个治理测试通过。
- `validated`：`npx prettier --check "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `stabilized`：并行 provider/reply 写集曾导致 `start_aster_reply_stream(...)` mutability 编译错误，已由并行进程修正；vendored Aster `providers/openai.rs` 的 `&str` 比较错误已做一行修复，避免继续阻塞 `aster-core` 编译。
- `classification`：`current` 是 `agent-runtime::runtime_queue` 与 `runtime_queue.rs` production 编排消费的 current contract；`compat` 是 `runtime_support.rs` 内部 Aster queue store/service adapter；`test-only` 是 `runtime_queue.rs` 测试里的 Aster `InMemoryThreadRuntimeStore` / `SessionRuntimeQueueService` fixture。
- `remaining`：`runtime_support.rs` 对 Aster queue service 的直接依赖已由后续 queue service/gate 条目删除；Aster `ThreadRuntimeStore` 数据适配仍保留，root `aster` dependency 仍不能删除。
- `next`：继续把 runtime store trait / queued session id 持久化迁入 `thread-store` 或 current runtime store；另择空闲窗口跑更宽 Rust 门禁。

### 2026-07-06：Batch C/D subagent runtime status overlay 收口

- `completed`：`SubagentRuntimeStatusKind`、`SubagentRuntimeStatus<Usage>`、`SubagentLatestTurnProjection` 与 `SubagentTurnStatus` 已迁入 `agent-runtime::session_execution` current owner；`lime-agent/src/subagent_control.rs` 只保留绑定 `AgentTokenUsage` 的 crate 内类型别名。
- `completed`：`SessionRuntimeSnapshotOverlay` 增加 `subagent_latest_turn` 字段；`runtime_support::load_runtime_snapshot_overlay(...)` 在 compat 边界内一次性把 Aster snapshot 投影为 execution snapshot、timeline snapshot 与 subagent latest-turn projection。
- `completed`：`subagent_control.rs` 改为消费 `load_runtime_snapshot_overlay(...)`，不再直接调用 `load_runtime_snapshot(...)` 或 `project_aster_subagent_latest_turn(...)`；前端 subagent runtime status 主链继续通过现有 session detail / App Server read model 消费 current wire 状态。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 subagent runtime status / latest-turn DTO 归属 `agent-runtime::session_execution`，并禁止 `subagent_control.rs` 回退到 Aster snapshot DTO、`load_runtime_snapshot(...)` 或 `project_aster_subagent_latest_turn(...)`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime session_execution --lib`，4 个 current owner 单测通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib`，5 个 provider stream 单测通过；用于确认并行 provider/reply 写集稳定。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent subagent_control --lib`，2 个 subagent control 单测通过；仅剩既有 `WorkspaceToolSurface` unused import warning。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent`。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，84 个治理测试通过。
- `validated`：`npx prettier --check "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `classification`：`current` 是 `agent-runtime::session_execution` 的 subagent runtime read model 与 `RuntimeSessionSnapshotOverlay`；`compat` 是 `runtime_support.rs` / `subagent_runtime_adapter.rs` 内部 Aster snapshot 投影；`dead / guarded` 是 `subagent_control.rs` 直接读取 Aster snapshot 的旧路径。
- `remaining`：`runtime_support.rs` 仍是 Aster `SessionRuntimeSnapshot` 读取兼容边界，`subagent_runtime_adapter.rs` 仍依赖 Aster DTO；root `aster` dependency 仍由 provider/reply loop、native tool registry 壳、session/thread store 与 agent turn loop 持有。
- `next`：runtime queue / queued turn Aster DTO 已由后续条目接住；后续可继续把 `subagent_runtime_adapter.rs` 的投影逻辑下沉到 Lime-owned runtime snapshot read model，或在 provider 写集稳定后回到 Batch A 迁 `Agent::reply` / `Message` / `AgentEvent`。

### 2026-07-06：Batch C session execution runtime Aster trait 泄漏收口

- `completed`：`session_execution_runtime.rs` 删除对 `aster::session::ExtensionState` 的直接依赖；`SessionExecutionRuntimeAccessMode` 由 `agent-runtime::session_recent` 提供，不再在 `lime-agent` 主 DTO 文件实现 Aster trait。
- `completed`：最近 access mode / preferences / team selection / harness context DTO 与 metadata parser 已迁入 `agent-runtime::session_recent` current owner；`lime-rs/crates/agent/src/session_execution_runtime/recent_context.rs` 与 `lime-rs/crates/agent/src/session_execution_runtime/recent_settings.rs` 已删除。
- `completed`：`SessionExecutionRuntimeSessionProjection` / `SessionExecutionRuntimeSnapshotProjection` / `SessionExecutionRuntimeTurnProjection` 已迁入 `agent-runtime::session_execution` current owner；`session_execution_runtime.rs` 只保留绑定 `AgentTokenUsage` / `AgentTurnContext` 的 crate 内类型别名。
- `completed`：`RuntimeTimelineSnapshotProjection` 已先迁入 `agent-runtime` current owner，通过泛型避免 `agent-runtime` 反向依赖 `lime-core` DAO；后续已拆到 `agent-runtime::runtime_timeline`，`runtime_snapshot_adapter.rs` 只保留 Aster snapshot 到 current projection 的转换。
- `completed`：新增 `RuntimeSessionSnapshotOverlay` current contract；`runtime_support::load_runtime_snapshot_overlay(...)` 在兼容边界内读取 Aster snapshot 后立即投影为 execution snapshot + timeline snapshot。
- `completed`：`session_store_runtime_detail.rs` 改为只消费 current overlay；该主链不再直接 import / call `project_aster_runtime_snapshot`、`project_aster_session_execution_runtime_snapshot` 或 `load_runtime_snapshot`。
- `completed`：Aster extension data 的读取兼容实现集中到 `session_execution_runtime_adapter.rs`；该 adapter 改为按 versioned key 显式读取 JSON，不再要求 current DTO 实现 Aster `ExtensionState` trait。
- `completed`：`asterMigrationBoundary.test.ts` 已把 `session_execution_runtime.rs`、`agent-runtime/src/session_recent.rs` 与 `agent-runtime/src/session_execution.rs` 纳入“已迁文件不得重新直接依赖 Aster”守卫。
- `completed`：`asterMigrationBoundary.test.ts` 已补 `session_store_runtime_detail` overlay 守卫，防止主链重新消费 Aster snapshot DTO 或直接调用 Aster projection 函数。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check`。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime`，20 个测试通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime session_execution --lib`，3 个 current owner 单测通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime session_recent --lib`，4 个 current owner 单测通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_execution_runtime --lib`，24 个相关测试通过；仍有既有 `WorkspaceToolSurface` unused import warning。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`。
- `remaining`：`runtime_support.rs` 仍在 compat 边界内读取 Aster `SessionRuntimeSnapshot`；subagent latest-turn direct call 已由后续 Batch C/D overlay 条目收掉。

### 2026-07-06：文档事实源校准

- `completed`：同步 `README.md`、`2026-07-05-progress-reality-check.md`、能力接收策略和本执行计划的当前口径：整体目标完成度按退出条件约 `89%`，不能按 `99%` 或完成态汇报。
- `completed`：把已删除的 `agent_tools/tool_orchestrator/aster_registry_adapter.rs` 从 `compat-blocker` 移入 `dead / deleted` 口径；`tool_orchestrator` 工具批执行不得恢复 Aster registry adapter。
- `completed`：把剩余 tool blocker 改写为 Aster reply loop 内 native tool registry / WebFetch / WebSearch `Tool` trait adapter，而不是继续指向已删除的 `tool_orchestrator` adapter。
- `remaining`：root workspace `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster `Agent::reply` / provider trait / Message / AgentEvent 转换、session store / subagent adapter 仍是 Phase 6 blocker。
- `next`：下一刀优先 Batch A/D provider / reply loop；如切工具链，只处理 Aster reply loop native tool 注册壳，不再围绕已迁 shell helper 或已删除 adapter 做小修。

### 2026-07-05：计划文件创建

- `completed`：新增本执行计划，把 `aster-capability-intake-strategy.md` 中的能力接收矩阵转成 Batch A-E 可执行迁移批次。
- `completed`：明确下一刀优先从 Batch A Provider / Reply Loop 开始，而不是继续清零散 helper。
- `guardrail`：本计划要求每批迁移都同步 current owner、调用点、vendor 删除、守卫和验证；不允许只平移 adapter 或只删 vendor。

### 2026-07-06：Batch A/D reply host current 抽象落地

- `completed`：新增 `agent-runtime::reply_host`，承接 `RuntimeReplyStreamHost`、`RuntimeReplyStartError`、`RuntimeReplyStream` / `RuntimeReplyStartResult` current contract；该 crate 不依赖 Aster。
- `completed`：`RuntimeReplyPolicyHost` 已上移到 `agent-runtime::reply_host`，承接 runtime status emission 与 cancelled turn marker policy hook；`lime-agent` 不再本地定义该 host trait。
- `completed`：`request_tool_policy.rs` 的 `stream_message_reply_with_policy_with_options(...)` 与 runtime status retry 逻辑改为接收 `agent-runtime` current host contract，不再 import / 接收 `AsterReplyRuntimeHost` 具体类型。
- `completed`：`AsterReplyRuntimeHost` 退回 `aster_reply_adapter.rs` compat 边界，只负责 Aster `Agent::reply` / `Message` / event projection / cancel marker 的适配，实现 current host contract。
- `completed`：治理守卫补充 `request_tool_policy.rs` 不得回退 `AsterReplyRuntimeHost` 具体类型、`agent_reply_stream.rs` 必须走 current reply host contract、Aster provider backend 只能停在 compat adapter。
- `verified`：
  - `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check`
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime`
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib`
  - `npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`
- `remaining`：Aster `Agent::reply`、Aster `Message`、Aster `AgentEvent`、Aster provider trait object 仍在 `aster_reply_adapter.rs` / `credential_bridge/runtime_provider_adapter.rs` compat 边界，root `aster` dependency 仍不能删除。
- `next`：继续 Batch A，优先把 provider backend / reply stream request 的 Aster trait object 创建再收窄；随后再切 Batch B 的 reply loop native tool registry 壳。

### 2026-07-06：Batch A/D reply execution result current owner 落地

- `completed`：新增 `agent-runtime::reply_execution`，承接 `RuntimeReplyAttemptError` 与 `RuntimeReplyExecution`。这些类型描述 reply 执行结果、错误 emission 状态、attempt summary 和 cancel 状态，不依赖 Aster。
- `completed`：`request_tool_policy.rs` 删除本地 `ReplyAttemptError` / `StreamReplyExecution` struct，改为 re-export `agent-runtime` current owner；现有 `lime-agent` public surface 通过别名维持调用侧类型名，但事实源已经迁出 Aster-adjacent 策略主文件。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `agent-runtime/src/lib.rs` 导出 `reply_execution`，要求 `agent-runtime/src/reply_execution.rs` 定义 current DTO 且不含 Aster，并禁止 `request_tool_policy.rs` 恢复本地 reply execution DTO。
- `verified`：
  - `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check`
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime`
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib`
  - `npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`
- `remaining`：这一步继续削薄 Batch A/D 的 Lime-owned reply contract，但没有删除 root `aster` dependency。Aster `Agent::reply` / `Message` / `AgentEvent` / provider trait object 仍留在 compat adapter；下一刀继续向 provider backend / session-store 或 turn-loop 接收推进。

### 2026-07-06：Turn context Aster conversion 收回 compat 子模块

- `completed`：`turn_context_configuration.rs` 不再直接构造或解析 Aster `TurnContextOverride` / `TurnOutputSchemaSource`；该文件只保留 `AgentTurnContext` request builder、output schema helper 与 metadata helper。
- `completed`：新增 `turn_context_configuration/aster_adapter.rs`，作为唯一 Aster turn context conversion 边界，供现有 `session_config_adapter.rs`、`runtime_facade.rs`、`event_converter.rs`、`session_execution_runtime_adapter.rs` 继续通过原 re-export 消费。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `turn_context_configuration.rs` 纳入已迁 current 文件，禁止其恢复 `aster::session::TurnContextOverride` / `TurnOutputSchemaSource`；同时要求 Aster DTO conversion 只能出现在 `turn_context_configuration/aster_adapter.rs`。
- `verified`：
  - `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check`
  - `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_state_support --lib`
  - `cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server`
  - `npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`
- `classification`：`current` 是 `turn_context_configuration.rs` / `agent_protocol::turn_context::TurnContextOverride`；`compat` 是 `turn_context_configuration/aster_adapter.rs`；`dead / guarded` 是 current helper 文件直接引用 Aster turn context DTO。
- `remaining`：runtime facade 与 session adapters 仍会通过 re-export 调用 Aster conversion，root `aster` dependency 不因此删除。下一刀应继续把 session/runtime snapshot adapter 或 provider/reply loop adapter 收窄。
- `next`：进入 Batch A，先盘点 `request_tool_policy/aster_reply_adapter.rs` 与 `credential_bridge/runtime_provider_adapter.rs` 的 Aster DTO 面，再定义 `model-provider` / `agent-runtime` current provider stream contract。

### 2026-07-05：Batch A provider stream handle current contract

- `completed`：新增 `model-provider::provider_stream`，定义 `RuntimeReplyProviderHandle`、`RuntimeReplyProviderIdentity`、`RuntimeReplyProviderCapabilities`、`RuntimeReplyStreamRequest`、`RuntimeReplyInputKind` 与 `RuntimeProviderBackend`。这些 DTO 不依赖 Aster，作为 provider/reply stream 后续接收的 current contract。
- `completed`：`ConfiguredReplyProvider` 现在同时持有 current `RuntimeReplyProviderHandle` 和内部 Aster `Provider` trait object；Aster provider trait 仍只作为 `RuntimeProviderBackend::AsterCompat` 的内部 backend，不再是唯一可传递 handle。
- `completed`：`request_tool_policy/aster_reply_adapter.rs` 在启动 reply stream 前构造 `RuntimeReplyStreamRequest`，用 current DTO 记录 session、input kind、message chars 与 pinned provider handle；Aster message / event 转换仍保留在该 compat adapter。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 provider stream contract 守卫，要求 `provider_stream` 归属 `model-provider` 且不引入 Aster 类型，并要求 `ConfiguredReplyProvider` 持有 current handle。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package lime-agent -- --check` 通过。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider` 通过，`19 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，`27 passed`；存在既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，`61 passed`；同样存在既有 unused import warning。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`81 passed`。
- `remaining`：Batch A 尚未完成。Aster `Provider` trait、`Agent::reply_with_provider`、Aster `Message` / `AgentEvent` 仍在 `runtime_provider_adapter.rs` 与 `aster_reply_adapter.rs` 内部 compat 面；下一刀要把 provider request/response/stream event contract 继续迁到 `model-provider` / `agent-runtime`，再压缩或删除这两个 adapter。

### 2026-07-05：Batch A provider handle 接入 provider_trace 主链

- `completed`：`RuntimeProviderBackend` 增加稳定 wire value；pinned provider reply stream 在 `agent_reply_stream` 中把 current `RuntimeReplyProviderHandle` 投射进现有 `provider_trace` 事件，包含 `runtime_provider_backend`、`runtime_provider_selector`、`runtime_provider_protocol`、`runtime_provider_active_model`。
- `completed`：App Server 继续通过既有 `runtime_backend/tool_events.rs` 把 `provider_trace` 发给 RuntimeCore / GUI，不新增第二种 provider 事件；前端 `agentProtocol`、`appServerEventStream`、`agentStreamRuntimeMetricsController` 与 `agentStreamTurnEventBinding` 已读取并记录这些 provider handle metadata。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 扩展 provider stream 守卫，要求 current provider handle metadata 必须经过 Rust protocol、App Server provider event、前端协议 normalizer 和 metrics 绑定；禁止 provider handle 只停留在 debug log。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package lime-agent --package app-server -- --check` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider` 通过，`19 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，`61 passed`；仍有既有 `WorkspaceToolSurface` unused import warning。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server provider_trace_stage_maps_to_provider_runtime_event --lib` 通过，`1 passed`。
- `verified`：`npx vitest run "src/lib/api/agentRuntime/appServerEventStream.test.ts" "src/lib/api/agentProtocol.test.ts" "src/components/agent/chat/hooks/agentStreamRuntimeMetricsController.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`40 passed`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`81 passed`。
- `remaining`：Batch A 仍是 `in_progress`。Aster `Provider` trait、Aster `Message` / `AgentEvent` 转换、`Agent::reply` / `reply_with_provider` 调用仍集中在 `credential_bridge/runtime_provider_adapter.rs`、`request_tool_policy/aster_reply_adapter.rs` 与 `event_converter.rs`；这些是后续删除 root `aster` dependency 的 provider/reply `compat-blocker`。

### 2026-07-05：MCP bridge Aster client public surface 收窄

- `completed`：`lime-agent` 根 API 不再 `pub mod mcp_bridge`；MCP bridge 仍通过 `AgentRuntimeState::sync_mcp_bridges(...)` 作为 current 同步入口被 runtime 内部消费。
- `completed`：`mcp_bridge::McpBridgeClient` 和构造函数从 public API 收为 private；Aster `McpClientTrait` / `ExtensionConfig::Builtin` 只留在 `mcp_bridge` 这个 compat runtime registry 内部，不再作为跨 crate 可见 surface。
- `completed`：删除 `McpBridgeClient` 未读 `name` 字段；bridge 名称只在 Aster extension manager 注册阶段使用，不再保留无行为状态。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `pub mod mcp_bridge;` 回流，并要求 `McpBridgeClient` 不得重新 public。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `verified`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`81 passed`。
- `remaining`：这只是 MCP / extension compat 面收窄，不等于删除 Aster MCP bridge。真正退出条件是 current `tool-runtime` / MCP bridge runtime 接管 extension manager 注册和 tool execution 后，删除 Aster `McpClientTrait` adapter 与 `ExtensionConfig::Builtin` 构造。

### 2026-07-05：Batch B tool execution result/error contract 接收

- `completed`：新增 `tool-runtime::tool_executor`，定义 `RuntimeToolExecutionResult`、`RuntimeToolExecutionError`、`RuntimeToolPolicyErrorKind` 与 `RuntimeToolPolicyErrorClassification`。这批类型直接服务当前工具执行结果、permission denied、policy denied、sandbox blocked 元数据，不是无消费者 DTO。
- `completed`：`agent_tools/tool_orchestrator.rs` 不再定义本地 `ToolPolicyErrorKind` / policy error classifier；shell permission preflight 与 registry executor 错误都消费 `tool-runtime` 的 current 分类结果。
- `completed`：`tool_orchestrator/aster_registry_adapter.rs` 删除 `AsterToolExecutionResult`、`AsterToolExecutionError`、`AsterToolPolicyErrorKind` 这些 Lime 侧重复包装；Aster `ToolResult` / `ToolError` 只在 adapter 内部翻译成 current contract。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `tool_executor` 归属 `tool-runtime`，并禁止 `tool_orchestrator.rs` 恢复本地 `ToolPolicyErrorKind` 或 `AsterToolPolicyErrorKind`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime` 通过，`87 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator --lib` 通过，`15 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`81 passed`。
- `remaining`：Batch B 未完成。`AsterToolRegistryAdapter` 仍依赖 Aster `ToolRegistry` / `ToolContext` / `SandboxConfig`，因此 vendor `tools` core 类型暂不能删除；下一刀应迁 registry executor trait，让 `ToolExecutionBatchInput` 不再持有 `AsterToolRegistryAdapter`。

### 2026-07-05：Batch B tool execution context/request contract 接收

- `completed`：`tool-runtime::tool_executor` 增加 `RuntimeToolExecutionContextInput`、`RuntimeToolExecutionContext`、`RuntimeWorkspaceSandboxInput` 与 `RuntimeToolExecutionRequest`，承接 working directory、session id、cancel token、workspace sandbox metadata 和 registry request contract。
- `completed`：`agent_tools/tool_orchestrator.rs` 的 shell permission preflight、live process、registry fallback 全部改为消费 `RuntimeToolExecutionContext` / `RuntimeToolExecutionRequest`，不再构造 `AsterToolContextInput` / `AsterToolExecutionContext` / `AsterToolExecutionRequest` / `AsterWorkspaceSandboxInput`。
- `completed`：`tool_orchestrator/aster_registry_adapter.rs` 内部把 current context 局部转换为 Aster `ToolContext`，Aster `ToolContext` / `SandboxConfig` / `with_turn_context` 继续只留在 compat adapter 内部。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `tool-runtime` 提供 current context/request contract，要求 `tool_orchestrator.rs` 真实消费这些类型，并禁止 `AsterTool*Context/Input/Request/WorkspaceSandboxInput` 回流到主编排。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime` 通过，`88 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator --lib` 通过，`15 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`81 passed`。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"` 通过。
- `remaining`：Batch B 仍未完成。`ToolExecutionBatchInput.registry` 仍是 `AsterToolRegistryAdapter`，adapter 仍依赖 Aster `ToolRegistry` / `ToolContext` / `SandboxConfig`。下一刀应定义 `RuntimeToolExecutor` trait / executor handle，让 `tool_orchestrator` 只持有 current executor，再把 Aster registry adapter 降为 trait 实现。

### 2026-07-05：Batch B runtime tool executor trait 接收

- `completed`：`tool-runtime::tool_executor` 增加 `RuntimeToolExecutor`、`RuntimeToolExecutorHandle`、`RuntimeToolExecutionFuture` 与 `RuntimeToolTurnContext`，tool execution executor contract 现在归属 current owner。
- `completed`：`ToolExecutionBatchInput` 从 `registry: AsterToolRegistryAdapter` 改为 `executor: RuntimeToolExecutorHandle`；`tool_orchestrator.rs` 只调用 current executor handle，不再持有 Aster registry adapter 类型。
- `completed`：`tool_orchestrator/aster_registry_adapter.rs` 改为 `RuntimeToolExecutor` 的 compat 实现，并删除旧的 `From<Arc<RwLock<ToolRegistry>>> for AsterToolRegistryAdapter` `.into()` 迁移入口；Aster turn context 转换也局限在 adapter 内。
- `completed`：`web_search_preflight` 与 `workspace_patch_runtime_adapter` 的生产调用点改为通过 `runtime_tool_executor_from_aster_registry(...)` 构造 current executor handle，迁移边界显式集中在 adapter helper。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `tool-runtime` 提供 executor trait/handle，要求 `ToolExecutionBatchInput` 持有 `RuntimeToolExecutorHandle`，并禁止主编排恢复 `pub registry: AsterToolRegistryAdapter`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime` 通过，`89 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator --lib` 通过，`15 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`81 passed`。
- `remaining`：Batch B 仍未完成。当前 Aster registry adapter 仍是唯一 executor trait 实现，且仍依赖 Aster `ToolRegistry` / `ToolContext` / `SandboxConfig`；下一刀应把 first-party shell / native tool registry 逐步迁入 current executor 实现，减少 `runtime_tool_executor_from_aster_registry(...)` 的生产调用点。

### 2026-07-05：Batch B WebSearch current executor 与 Aster registry adapter 删除

- `completed`：新增 `tool-runtime::web_search` current owner，提供 `RuntimeWebSearchExecutor`、`runtime_web_search_executor_handle()`、`WEB_SEARCH_TOOL_NAME`、`web_search_tool_definition()` 与 WebSearch 输入 / 搜索结果结构。该实现承接 Aster WebSearch 的 provider 优先级、Tavily / Multi Search Engine / Bing / Google / DuckDuckGo 搜索、域名过滤、TTL cache、结构化 output 与 `web_search` metadata。
- `completed`：`tool-runtime::web_search` 按 facade + `web_search/support.rs` 拆分，两个非生成 Rust 文件分别约 `686` / `706` 行，避免新增超过 `1000` 行的中心文件。
- `completed`：`request_tool_policy/web_search_preflight.rs` 不再通过 `AsterReplyRuntimeHost::tool_registry()` 查 Aster registry，也不再构造 `runtime_tool_executor_from_aster_registry(...)`；预检索现在直接执行 `runtime_web_search_executor_handle()`。`WebSearchPreflightRequest` 去掉 Aster host 字段。
- `completed`：`agent_tools/workspace_patch_runtime_adapter.rs` 不再读取 `AgentRuntimeState -> Agent -> tool_registry()`；workspace patch host tool plan 的 `WebSearch` 执行现在直接走 current WebSearch executor，前端 / App Server 继续通过原有 workspace patch host evidence 主链消费真实检索结果。
- `completed`：删除 `request_tool_policy/aster_reply_adapter.rs` 上已经无生产消费者的 `tool_registry()` escape hatch。
- `completed`：删除 `agent_tools/tool_orchestrator/aster_registry_adapter.rs`。`tool_orchestrator` 单测改用 current `RuntimeToolExecutor` fixture，Aster `ToolRegistry` / `ToolContext` / `SandboxConfig` 不再出现在工具批执行主编排或其测试中。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `tool-runtime` 暴露 `web_search` current module，禁止 `web_search_preflight` / workspace patch runtime adapter 恢复 `runtime_tool_executor_from_aster_registry`、`host.tool_registry()` 或 Aster host/registry 依赖，并要求 `tool_orchestrator/aster_registry_adapter.rs` 文件保持不存在。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime` 通过，`94 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator --lib` 通过，`14 passed`；删除的 1 个测试只覆盖已删除的 Aster sandbox adapter。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent web_search_preflight --lib` 通过，`7 passed`；仍有既有 `WorkspaceToolSurface` unused import warning。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent workspace_patch_host --lib` 通过，`4 passed`；同样存在既有 unused import warning。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`81 passed`。
- `classification`：`current` 是 `tool-runtime::web_search` 与 `RuntimeToolExecutor`；`dead / deleted` 是 `tool_orchestrator/aster_registry_adapter.rs`、`AsterReplyRuntimeHost::tool_registry()`、WebSearch preflight / workspace patch 对 Aster registry executor 的生产调用；`compat-blocker` 仍是 Aster reply loop 内部的 native tool registry。
- `remaining`：不能直接删除 `vendor/aster-rust/crates/aster/src/tools/web.rs` 中的 WebSearch/WebFetch 实现，因为 Aster `Agent::reply` 主循环仍可能让模型直接调用 Aster registry 中注册的 WebSearch/WebFetch。下一刀应在 Batch B / D 交界处处理 Aster reply loop 的 tool call 执行入口：要么让 Aster reply loop 的 WebSearch/WebFetch 调用转发到 current `tool-runtime::web_search` / 后续 `web_fetch`，要么把 reply loop 本身迁到 `agent-runtime` 后再删除 vendor web tool。

### 2026-07-05：Batch B WebFetch current executor 与 vendored Web tool 重复实现清理

- `completed`：新增 `tool-runtime::web_fetch` current owner，提供 `RuntimeWebFetchExecutor`、`runtime_web_fetch_executor_handle()`、`WEB_FETCH_TOOL_NAME`、`web_fetch_tool_definition()`、`WebFetchInput` 与预批准 host 策略。该实现承接 Aster WebFetch 的 HTTPS 升级、私网 / metadata host 阻断、same-host/www redirect、10MB 响应限制、HTML to text、JSON pretty print、动态过滤、15 分钟 TTL cache、结构化 `bytes/code/codeText/result/durationMs/url` output 和 metadata。
- `completed`：`tool-runtime::web_fetch` 按 facade + `web_fetch/content.rs` 拆分，当前文件体量约 `452` / `638` 行，未继续向中心文件堆叠。
- `completed`：`vendor/aster-rust/crates/aster/src/tools/web.rs` 从约 `2700+` 行 WebFetch/WebSearch 执行实现压缩为约 `433` 行 Aster `Tool` trait adapter；Aster reply loop 暂时仍注册 `WebFetchTool` / `WebSearchTool`，但执行已委托 `tool-runtime::web_fetch` / `tool-runtime::web_search` current executor，结果继续通过现有 App Server / GUI tool event 主链被前端消费，不新增 mock 或平行展示入口。
- `deleted`：`vendor/aster-rust/crates/aster/src/tools/web_fetch_content.rs` 已删除，`tools/mod.rs` 移除 `mod web_fetch_content;`。vendored Aster 不再维护 WebFetch 内容清洗 / 动态过滤第二份实现。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 `web_fetch.rs` / `web_fetch/content.rs` 纳入已迁移文件 Aster import 守卫；要求 `tool-runtime` 暴露 WebFetch current module；新增 vendored web tool 守卫，禁止恢复 `fetch_url`、`SearchProviderStrategy`、`MultiSearchEngineConfig`、provider-specific `search_with_*`、`web_fetch_content`、`LruCache`、`reqwest` / `scraper` 直接执行等重复实现。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime -- --check` 通过。
- `verified`：`cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" --package aster-core -- --check` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime` 通过，`104 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core tools::web::tests:: --lib` 通过，`8 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent web_search_preflight --lib` 通过，`7 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`82 passed`。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"` 通过。
- `classification`：`current` 是 `tool-runtime::web_fetch` / `tool-runtime::web_search` executor；`compat` 是 vendored Aster `WebFetchTool` / `WebSearchTool` 的 `Tool` trait adapter；`dead / deleted` 是 vendored WebFetch/WebSearch fetch/search/provider/cache/content 重复实现与 `web_fetch_content.rs`；`compat-blocker` 仍是未迁出的 Aster `Agent::reply` native tool registry 注册面。
- `remaining`：Batch B 的 Web tool 重复实现已清，但整体 Aster 依赖还不能删除。下一刀应回到 Batch A / D：迁出 provider/reply loop 的 Aster `Agent::reply` 调用或 native tool registry 注册面，让 WebFetch/WebSearch 的 Aster `Tool` trait adapter 也能进入 `dead / deleted`。

### 2026-07-05：Batch A/D reply stream current event boundary 收窄

- `completed`：`agent_reply_stream.rs` 主循环只消费 `RuntimeReplyStreamEvent` / `RuntimeAgentEvent`，不再直接读取 `AsterAgentEvent`，也不再持有 `RuntimeEventProjector`。
- `completed`：Aster event projection、auto-compaction projection 与 inline provider error suppression 已收回 `aster_reply_adapter.rs` / `aster_event_adapter.rs` compat 边界；`agent_reply_stream.rs` 继续负责 current event 流控、provider trace metadata 补齐、web retrieval synthesis cutover 与 artifact event emission。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `agent_reply_stream.rs` 恢复 `RuntimeEventProjector`、`AsterAgentEvent`、`project_aster_runtime_event`、`project_aster_auto_compaction_event`、`extract_inline_agent_provider_error` 或 `runtime_event_projector.project`，并要求 `aster_reply_adapter.rs` 持有 `RuntimeReplyStreamEvent`、`project_aster_reply_stream`、`RuntimeEventProjector::new` 与 `SuppressedInlineProviderError`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，`61 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`82 passed`。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"` 通过。
- `classification`：`current` 是 `agent_reply_stream.rs` 的 `RuntimeAgentEvent` policy/stream loop；`compat` 是 `aster_reply_adapter.rs` 启动 Aster stream 并投影成 current event；`dead / guarded` 是 `agent_reply_stream.rs` 直接做 Aster event projection 的 surface。
- `remaining`：Batch A/D 尚未完成。真正的 `Agent::reply` / Aster `Message` / provider trait 仍未迁出，root workspace `aster` dependency 和 `lime-agent` 的 `aster.workspace = true` 还不能删除；下一刀应把 reply loop 的 request/response/event contract 继续迁入 `agent-runtime` / `model-provider`，而不是继续只压缩 compat 壳。

### 2026-07-05：Batch A/D reply stream envelope 迁入 agent-runtime

- `completed`：新增 `agent-runtime::reply_stream::RuntimeReplyStreamEvent<E>`，作为 reply stream 的 current envelope contract；该类型不依赖 Aster，也不反向依赖 `lime-agent` 本地协议。
- `completed`：`agent_reply_stream.rs` 改为从 `agent-runtime` 导入 `RuntimeReplyStreamEvent`；`aster_reply_adapter.rs` 删除本地 enum，只负责把 Aster `AgentEvent` 投影成 `RuntimeReplyStreamEvent<RuntimeAgentEvent>`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `agent-runtime/src/lib.rs` 导出 `reply_stream`、要求 `agent-runtime/src/reply_stream.rs` 定义 `RuntimeReplyStreamEvent<E>` 且不含 `aster::`，并禁止 `aster_reply_adapter.rs` 恢复 `enum RuntimeReplyStreamEvent`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime` 通过，`6 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，`61 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`82 passed`。
- `classification`：`current` 是 `agent-runtime::reply_stream::RuntimeReplyStreamEvent<E>`；`compat` 是 `aster_reply_adapter.rs` 中 `BoxStream<anyhow::Result<RuntimeReplyStreamEvent<RuntimeAgentEvent>>>` 的 Aster projection bridge；`dead / guarded` 是 `aster_reply_adapter.rs` 本地 reply stream event enum。
- `remaining`：这仍不是完整 reply loop 迁移。`Agent::reply`、Aster `Message` 构造、Aster provider trait object 与 provider safety wrapper 仍在 compat 边界；下一刀应继续把 reply request/action response input 或 provider stream execution trait 迁到 current owner，并让 Lime 主链真实消费。

### 2026-07-05：Batch A/D reply input contract 迁入 agent-runtime

- `completed`：新增 `agent-runtime::reply_input`，承接 `RuntimeReplyInput`、`RuntimeReplyInputImage`、`RuntimeActionRequiredResponseInput` 与 `RuntimeReplyAttemptInput`。这些类型不依赖 Aster，`RuntimeReplyAttemptInput::runtime_input_kind()` 直接返回 `model-provider` 的 `RuntimeReplyInputKind`。
- `completed`：`request_tool_policy.rs` 删除本地 `ReplyInput` / `ReplyInputImage` 定义，改为 re-export current input contract；`agent_reply_stream.rs` 直接导入 `RuntimeReplyAttemptInput`；`aster_reply_adapter.rs` 删除本地 `ActionRequiredResponseInput` / `ReplyAttemptInput` enum，只保留 `build_aster_reply_attempt_message(...)` 边界转换。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `agent-runtime/src/reply_input.rs` 提供 current input DTO 且不含 `aster::`，要求 `request_tool_policy.rs` 消费 `agent_runtime::reply_input`，并禁止 `aster_reply_adapter.rs` 恢复 `struct ActionRequiredResponseInput`、`enum ReplyAttemptInput` 或 `impl From<ReplyInput> for ReplyAttemptInput`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime` 通过，`8 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，`61 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "provider reply stream handle contract|request_tool_policy 主文件不得重新承接 Aster reply stream loop" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`2 passed`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check` 通过。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"` 通过。
- `blocked`：完整 `npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 当前剩余 1 个失败，落在并行脏写集 `lime-rs/crates/agent/src/session_store_subagent_context.rs` / `session_store_subagent_aster_adapter.rs` 的 subagent session-store 守卫，不属于本 Batch A/D 写集；本轮未夹写该区域。
- `classification`：`current` 是 `agent-runtime::reply_input`；`compat` 是 `aster_reply_adapter.rs` 的 Aster `Message` 转换函数；`dead / guarded` 是 request policy / Aster adapter 本地 reply input DTO。
- `remaining`：`Agent::reply` 调用、Aster `Message` 后端格式、Aster `Provider` trait object 与 provider safety wrapper 仍在 compat 边界。下一刀应把 provider stream execution trait / request execution contract 迁入 current owner，或继续处理 session-store 并行守卫失败后再回到 Batch A/D。

### 2026-07-06：Batch A/D provider stream request 进入执行边界

- `completed`：`ConfiguredReplyProvider::stream_reply_with_agent(...)` 现在接收 `&RuntimeReplyStreamRequest`，在执行 pinned provider stream 前用 current request 校验 provider handle，并记录 `session_id`、`input_kind`、`message_chars`、provider backend/name/model。
- `completed`：`aster_reply_adapter.rs` 启动 Aster reply stream 时把已构造的 `RuntimeReplyStreamRequest` 传入 provider adapter；该 DTO 现在是 provider stream 执行边界入参，不再只用于 debug log。
- `resolved`：把 `session_store_subagent_context.rs` 中错误回流的 Aster `resolve_subagent_session_metadata` / `AsterSession` / customization 解析移回 `session_store_subagent_aster_adapter.rs`；完整 Aster migration boundary 的 1 个遗留失败已清零。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `ConfiguredReplyProvider` 消费 `RuntimeReplyStreamRequest`，并继续要求 `session_store_subagent_context.rs` 不得直接 import Aster session metadata。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package agent-runtime -- --check` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，`27 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，`61 passed`；仍有同一既有 warning。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent build_child_subagent_session --lib` 通过，`2 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime` 通过，`8 passed`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`82 passed`。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"` 通过。
- `classification`：`current` 是 `model-provider::provider_stream::RuntimeReplyStreamRequest` 作为 pinned provider stream 执行入参，以及 `session_store_subagent_context.rs` 的 Lime-owned `SubagentSessionProjection`；`compat` 是 `ConfiguredReplyProvider` 内部 Aster Provider trait object 和 `session_store_subagent_aster_adapter.rs` 的 Aster session projection；`dead / guarded` 是 debug-only provider stream request、current context 直接解析 Aster subagent metadata。
- `remaining`：root `aster` dependency 仍不能删除。`Agent::reply` / `Agent::reply_with_provider`、Aster `Message`、Aster `AgentEvent`、Aster `Provider` trait object 仍在 compat 边界；下一刀应继续把 provider stream execution result/error 或 Aster reply loop host trait 向 `agent-runtime` 收敛，并保持 current DTO 有真实消费者。

### 2026-07-06：Batch A/D pinned provider backend 私有化

- `completed`：`ConfiguredReplyProvider` 不再直接保存 `Arc<dyn aster::providers::base::Provider>`；它现在只保存 `RuntimeReplyProviderHandle` 和私有 `CompatAsterReplyProviderBackend`。
- `completed`：`CompatAsterReplyProviderBackend` 承接 Aster provider trait object 创建、capabilities 读取和 `Agent::reply_with_provider(...)` 调用。裸 Aster provider trait object 继续存在，但只作为 `runtime_provider_adapter.rs` 内部 compat backend，不再是 provider 配置 / request policy 可扩散字段。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `ConfiguredReplyProvider` 持有 `backend: CompatAsterReplyProviderBackend`，并新增结构体级断言，禁止 `ConfiguredReplyProvider` 重新直接保存 `Arc<dyn Provider>`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，`27 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 首次在并行构建锁释放后出现 1 个 provider idle 时序失败；单测重跑通过，完整过滤重跑通过，最终 `61 passed`。该失败未稳定复现，暂不作为本批 blocker。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`82 passed`。
- `classification`：`current` 是 `RuntimeReplyProviderHandle` / `RuntimeReplyStreamRequest`；`compat` 是私有 `CompatAsterReplyProviderBackend`；`dead / guarded` 是 `ConfiguredReplyProvider` 直接持有裸 Aster provider trait object 的字段面。
- `remaining`：这一步没有删除 root `aster` dependency。`Agent::reply` / `Agent::reply_with_provider`、Aster `Message`、Aster `AgentEvent` 与 provider stream body 仍在 compat 边界；下一刀应把 reply execution host/stream runner 继续抽到 `agent-runtime` current contract，或开始迁出 Aster `Agent::reply` 内部 turn loop。

### 2026-07-06：Batch A/D session config current owner 迁入 agent-runtime

- `completed`：新增 `agent-runtime::session_config`，承接 `AgentSessionConfig`、`AgentSessionConfigurationRequest`、`build_agent_session_config(...)` 与 `SessionConfigBuilder`。这些 DTO / builder 不依赖 Aster。
- `completed`：`lime-agent/src/session_configuration.rs` 降为 re-export 入口，不再本地定义 session config DTO 或 builder；`runtime_state_support.rs` 删除本地 `SessionConfigBuilder` 实现。
- `completed`：`session_config_adapter.rs`、`request_tool_policy.rs`、`agent_reply_stream.rs` 与 `aster_reply_adapter.rs` 的内部调用改为直接消费 `agent_runtime::session_config::AgentSessionConfig`；Aster `SessionConfig` 转换仍只留在 `session_config_adapter.rs`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 要求 `agent-runtime/src/lib.rs` 导出 `session_config`，要求 `agent-runtime/src/session_config.rs` 提供 DTO / builder 且不含 Aster，并要求 `lime-agent/src/session_configuration.rs` 只 re-export current owner。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime` 通过，`10 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_state_support --lib` 通过，`5 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，`61 passed`；仍有同一既有 warning。
- `verified`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`82 passed`。
- `classification`：`current` 是 `agent-runtime::session_config`；`compat` 是 `lime-agent/src/session_configuration.rs` re-export 和 `session_config_adapter.rs` 的 Aster conversion；`dead / guarded` 是 `runtime_state_support.rs` 本地 builder 实现与 `lime-agent` 本地 session config DTO。
- `remaining`：这一步继续减少 Lime 主链对 Aster DTO 的外层依赖，但 root `aster` dependency 仍由 `Agent::reply` / `Message` / `AgentEvent` / native tool registry / session store compat 持有。下一刀应回到 reply execution host 或 session/thread store，继续把实际 turn loop 和 persistence contract 迁出。

### 2026-07-06：Batch C/D runtime snapshot record current owner

- `completed`：新增 `thread-store::runtime_snapshot` current read model，承接 `RuntimeSessionSnapshotRecord`、thread / turn / item record、turn/item status record 与 item payload record。该模块不依赖 Aster，作为 execution / timeline / subagent 三条投影共同消费的中性 snapshot read model。
- `completed`：`runtime_store_aster_adapter.rs` 承接 Aster `SessionRuntimeSnapshot` / `ThreadRuntimeSnapshot` / `TurnRuntime` / `ItemRuntimePayload` 到 `RuntimeSessionSnapshotRecord` 的唯一转换；`runtime_support.rs` 的 `load_runtime_snapshot_overlay(...)` 现在先读取 record，再分别投影 execution snapshot、GUI timeline snapshot 和 subagent latest-turn。
- `completed`：`session_execution_runtime_adapter.rs`、`runtime_timeline_adapter.rs`、`runtime_snapshot_adapter.rs`、`subagent_runtime_adapter.rs` 的 snapshot projection 主路径已切到 `RuntimeSessionSnapshotRecord`。生产主链不再保留 `project_aster_runtime_snapshot(...)`、`project_aster_runtime_timeline_snapshot(...)`、`project_aster_session_execution_runtime_snapshot(...)`、`project_aster_subagent_latest_turn(...)` 这些 snapshot 级 Aster wrapper。
- `deleted / guarded`：上述 test-only snapshot wrapper 已删除；相关单测显式经过 `runtime_store_aster_adapter::runtime_snapshot_record_from_aster(...)` 转成 current record 后再测试 current projector，避免把 Aster snapshot wrapper 当成可恢复入口。
- `completed`：event-level `convert_aster_turn_runtime(...)` / `convert_aster_item_runtime(...)` 已降为薄 compat wrapper，内部先调用 `runtime_store_aster_adapter::runtime_turn_record_from_aster(...)` / `runtime_item_record_from_aster(...)` 转成 `thread-store` record，再进入 `project_runtime_timeline_turn_record(...)` / `project_runtime_timeline_item_record(...)` current projector。
- `deleted / guarded`：`runtime_timeline_adapter.rs` 中重复的 Aster `TurnStatus` / `ItemStatus` / `ItemRuntimePayload` 分支映射已删除；Aster runtime payload/status 到 record 的字段映射现在只允许留在 `runtime_store_aster_adapter.rs`。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `thread-store::runtime_snapshot` current owner 守卫，要求 record owner 不含 Aster，要求 Aster snapshot -> record 只归属 `runtime_store_aster_adapter.rs`，并禁止其他 snapshot adapter 恢复 snapshot 级 Aster wrapper。
- `verified`：`rustfmt --edition 2021 --check` 覆盖本批 Rust 写集通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store runtime_snapshot --lib -j 2` 通过，`1 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_timeline_adapter --lib -j 2` 通过，`8 passed`；仍有既有 `WorkspaceToolSurface` unused import warning，非本批引入。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-runtime-snapshot-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_timeline_adapter --lib -j 2` 通过，`8 passed`；用于避开并行 app-server 测试占用共享 `lime-rs/target` artifact lock，仍有同一既有 warning。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_execution_runtime --lib -j 2` 通过，`28 passed`；仍有同一既有 warning。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent subagent_runtime_adapter --lib -j 2` 通过，`1 passed`；仍有同一既有 warning。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent apply_runtime_snapshot_should_not_regress_aborted_turn_to_running --lib -j 2` 通过，`1 passed`；仍有同一既有 warning。
- `verified`：`CARGO_NET_OFFLINE=true cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "runtime snapshot record|runtime timeline snapshot projector|session_execution_runtime_adapter|runtime_support 只能把 Aster runtime store|subagent_runtime_adapter" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`5 passed`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "runtime snapshot record|runtime timeline snapshot projector" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`2 passed`。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"` 通过；`git diff --check` 覆盖本批写集通过。
- `blocked`：完整 `npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 当前为 `93 passed / 1 failed`，失败点是并行脏写集 `lime-rs/crates/agent/src/runtime_state.rs` 恢复了 `use aster::conversation::message`，不属于本批写集；本轮未夹写该文件。
- `classification`：`current` 是 `thread-store::runtime_snapshot`、`agent-runtime::session_execution`、`agent-runtime::runtime_timeline` 与 GUI runtime detail overlay；`compat` 是 `runtime_store_aster_adapter.rs` 的 Aster snapshot / turn / item -> record 转换和 event-level `runtime_timeline_adapter` 薄 wrapper；`dead / guarded` 是 snapshot 级 Aster projector wrapper，以及 `runtime_timeline_adapter.rs` 内重复的 Aster payload/status 映射。
- `remaining`：这一步清掉 snapshot read model 的 Aster wrapper，但不是 Phase 6 完成。runtime event-level turn/item conversion、Aster `ThreadRuntimeStore`、Aster `SessionStore` trait、provider/reply loop、Aster `Message` / `AgentEvent` / provider trait 仍是 root `aster` dependency blocker。
