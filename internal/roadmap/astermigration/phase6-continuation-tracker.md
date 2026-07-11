# Phase 6 续跟踪

状态：active  
创建时间：2026-07-09  
上一段跟踪：`phase6-remaining-tracker.md`  
执行计划：`internal/exec-plans/aster-phase6-provider-reply-backend-plan.md`  
口径：Codex 有则迁，Codex 没有则删；不保无用户兼容。

## 用途

`phase6-remaining-tracker.md` 已记录 Phase 6 第一段 context 收口和 R2/R3 provider source 多刀推进。后续继续迁移不再向该文件追加长日志，本文件只跟踪当前剩余项、下一刀和新增验证结果。

## 当前主结论

本轮补充：R5/R6 已继续删除 Aster global session manager 相关残留，包含 `session_manager.rs`、`SessionStorage`、`SessionInsights` DTO、`session/legacy.rs`、root `SessionManager` re-export、global `SessionStore` OnceCell 安装路径，以及 `initialize_shared_session_runtime_with_root(root, session_store)` 的无消费者 `session_store` 参数；随后又从 Aster `SessionStore` trait 删除 `list_sessions`、`delete_session`、`get_insights`、`update_working_dir`、`update_session_type` 和 `update_recipe` orphan convenience，并把 runtime status item 的 id / sequence / payload / upsert 判定下沉到 `thread-store::runtime_status_item`。本轮继续删除 extension config warning/query convenience，并把协作工具 session/team adapter 从 `agent-compat/src/tools` 迁到 `agent-compat/src/agents/{collab_runtime.rs,team_runtime.rs}`。彻底搬空 `agent-compat` / 删除 root `aster` dependency 的完成度可按约 `94.2%` 追踪，但 R4/R7、R5/R6、R2/R3 仍未完成，剩余 blocker 是 Aster extension manager / MCP client bridge、Aster `SessionStore` trait、Aster durable source、provider/reply Aster `Session` / `Message` lowering、`AgentEvent` source adapter、generic `ToolRegistry` fallback 和 `run_aster_reply_backend(...)` 最后一跳。

进度拆成两个口径追踪：骨架迁移完成度约 `97%`，彻底搬空 `agent-compat` / 删除 root `aster` dependency 的完成度约 `94.2%`，不能报 `99%` 或完成态。Aster 已不再是 Lime current runtime owner，`agent-compat` 也不是 owner，只是待迁出 staging / compat blocker；最新扫描按 current 口径仍有 `50` 处生产 `use aster::`，另有测试 fixture 命中集中在非 snapshot 的剩余 Aster adapter 场景，root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、以及 `agent-compat` 现存指向 current owner 的 burn-down 依赖仍未删除，说明 Phase 6 尚未闭环。Fast A1/A2 已继续删除 no-op / empty queue / custom slash recipe stubs、Aster permission framework、Aster 本地 recipe 文件 runtime、recipe scheduler、Aster recipe 生成/parser/metadata DTO、Aster root hook stub、Aster root context public surface、Aster agent context / parallel / resume framework、Aster media helper、`Read` image/PDF base64 分支、Aster context compaction no-op stub、Aster execution manager stub、`mcp_utils` 历史别名模块与 root `utils` 垃圾桶模块、Aster session fork / summary resume / worktree extension public API、Aster provider test / API-key auto-detect helpers、Aster tool hook framework，并把无外部生产消费者的 `agents`、`config`、最小 `permission` 子模块、具体 provider implementation / wire-format 子模块 public API 收缩为 crate-private staging，删除旧 prompt snapshot 测试、`insta` 依赖、空 `agents/snapshots` 目录和 `agent-compat/src` 内联正向测试模块；Fast C 已把 context trace current DTO、provider sampling、poll/cancel、first-text delta、tool-input delta、model-change、notification envelope、progress/milestone、failure logging、plaintext tool-use parser、image input policy、turn tool surface / scope policy、tool exposure / registration gate、tool call surface normalization、native tool result projection、runtime timeline record projector、runtime conversation item record projector、runtime store read/write skeleton、runtime queue source lowering、thread/turn ensure write skeleton、runtime snapshot test fixture、`request_user_input` tool surface / definition / execution、标准 native dispatch execution preflight、gateway-backed native execution registration / dispatch owner、协作工具 definitions/canonical/execution、Skill execution hook first slice、Bash / PowerShell 前台执行与 background 启动、legacy shell alias、workspace sandbox guard、shell warning current guard、Read 文件读取与 Glob/Grep 文件搜索前移到 `agent-protocol` / `model-provider` / `thread-store` / `tool-runtime` / `agent-runtime` / `lime-agent` current hook，且 MCP 已不再挂入 Aster `ToolRegistry`；gateway-backed Aster `Tool` 壳、Skill Aster `Tool` trait wrapper、Aster Bash/PowerShell/Task registry fallback 文件、shell alias registry ownership、Aster 空 sandbox executor / output buffer、`runtime_snapshot_record_from_aster(...)` test bridge 以及 `agent-compat/src/tools/{agent_control.rs,team_tools.rs}` 具体协作 adapter 文件也已删除，模型可见定义由 current `native_tool_definitions` / `skill_tool_definition()` 和 `Agent::list_tools` 注入。但 provider/reply loop、真实 workspace sandbox backend、MCP extension bridge / source adapter、Aster `SessionStore` trait、Aster runtime durable source 和 session/event source 仍是核心 blocker。

当前优先级已切换为 Phase 6 快通道：先清未使用 / Codex 无对应能力的 Aster-only surface，再批量迁移简单 DTO / projection / policy helper，最后集中处理 provider/reply loop、native registry、session store 这类复杂核心 blocker。`agent-compat` 不是冻结目录；只要改动方向是把生产调用迁出、删除 Aster-only surface 或减少 burn-down 依赖，就应直接推进。禁止的是新增 owner 依赖或在 staging crate 内继续补业务逻辑。2026-07-10 最新一刀按“未使用先删、简单先迁、复杂后置”把 `action_required_manager` / `session_context` / `permission` 顶层模块、`tools` / `tools/file` / `tools/search` / `session` 的实现子模块、`conversation::message` 子模块以及 `model` / `recipe` / `tool_inspection` 顶层模块继续收缩为 crate-private staging，随后又把 `conversation` / `session` / `tools` 顶层模块收缩为 private staging；外部只保留最小 root re-export，并删除零引用 `tools/file/diff_summary.rs` 与 `tools/search/ripgrep.rs`。`provider_reply_exit_source.rs` 与 `model-provider::provider_stream::source_execution` wrapper 已删除，Aster `reply_with_provider(...)` 最后一跳现只集中在 `request_tool_policy/aster_reply_backend_adapter.rs::run_aster_reply_backend(...)`；该函数现在只接收 `AsterReplyBackendRequest` 退场 request，Aster message/session lowering 集中在 `AsterReplyBackendRequest::from_current(...)`，继续是 R2/R3 blocker。

2026-07-10 provider response content 补充：`agent-compat/src/agents/reply_parts.rs` 的 provider 首字文本日志已改为消费 `RuntimeReplyProviderResponseContent` + `provider_stream_response_text_chars(...)`，低层 `provider_stream_first_text_delta_chars(...)` 不再从 `reply_parts.rs` 直接调用。`current` = `model-provider::provider_stream::response_content`；`compat blocker` = Aster `MessageContent` source adapter；`dead / guarded` = `agent-compat` 恢复本地 provider response content / first-text 规则。

2026-07-10 R5/R6 补充：runtime timeline snapshot record -> timeline projection 已从 `lime-agent/src/runtime_timeline_adapter.rs` 前移到 `agent-runtime::runtime_timeline_record` current owner；`lime-agent` adapter 只保留 Aster `TurnRuntime` / `ItemRuntime` -> `thread-store::runtime_snapshot` record 的薄转换和 runtime tool-output filtering policy 注入。runtime conversation item record -> conversation message projection 也已前移到 `thread-store::conversation_transcript` current owner；`runtime_conversation_aster_adapter.rs` 不再持有 `ItemRuntimePayload::{UserMessage,AgentMessage}` 映射或 `RuntimeConversationItemSource`，只调用 `runtime_item_record_from_aster(...)` 和 current projector。adapter 内重复的 runtime status、request-user-input、snapshot flatten、conversation payload 正向测试已删除，改为 Aster 边界 smoke；纯规则由 `agent-runtime` / `thread-store` current tests 覆盖。R5/R6 仍 open，因为 Aster `ThreadRuntimeStore` / `SessionStore`、shared runtime store source 和 `AgentEvent` source adapter 尚未迁出。

2026-07-11 R5/R6 补充：`thread-store::runtime_store` 已成为 runtime store read/write skeleton owner，按 Codex `ThreadStore` 风格提供 storage-neutral boxed-future trait、`RuntimeThreadRecord`、snapshot record loader、conversation record collector、`RuntimeThreadWriteStore` / `RuntimeTurnWriteStore` / `RuntimeThreadTurnStore`、`RuntimeItemWriteStore` / `RuntimeItemStore`、thread/turn ensure helper、item upsert helper、按 thread 计算下一条 item sequence helper 和 transcript item 删除 helper。`thread-store::conversation_transcript` 承接 `TranscriptItemRecordInput`、`build_transcript_item_record(...)`、`next_runtime_item_sequence(...)` 和 transcript payload 判定；`aster_session_store/runtime_conversation.rs` 不再直接构造 Aster transcript payload，也不再直接 `ThreadRuntime::new(...)` / `TurnRuntime::new(...)` / `create_item/update_item/delete_item` / `upsert_thread/get_turn/create_turn`，只把 Aster action scope / turn context 降成 current `RuntimeTurnEnsureInput`，再把 Aster `Message` 降成 current item record 后通过 current store helper 写入。`runtime_support.rs` 读取 runtime snapshot overlay 时只调用 current `thread-store::runtime_store::load_runtime_snapshot_record(...)`；`runtime_conversation_aster_adapter.rs` 与 `aster_session_store/runtime_conversation.rs` 的 runtime conversation read/count 均调用 current `collect_runtime_conversation_records(...)`，追加 transcript message 的 sequence 也调用 current `next_runtime_item_sequence_for_thread(...)`。Aster `ThreadRuntimeStore` 只在 `runtime_store_aster_adapter.rs::AsterRuntimeStoreAdapter` 内被转换为 current records / current read/write traits；`load_shared_session_runtime_snapshot(...)` 已不再是 `runtime_support` 的生产读取入口。随后 queue source lowering 也折叠进 `runtime_store_aster_adapter.rs`：`runtime_support.rs` 只拿 current `RuntimeQueueService` / `RuntimeQueueStore`，独立 `runtime_queue_aster_adapter.rs` 已删除并由守卫禁止恢复。R5/R6 仍 open，因为 Aster durable source、Aster `SessionStore` trait、provider/reply 对 Aster `Session` / `Message` 的依赖和 `AgentEvent` source adapter 尚未迁出。

2026-07-11 R5/R6 public snapshot surface 补充：`agent-compat::Agent::runtime_snapshot(...)`、`session::load_shared_session_runtime_snapshot` public re-export、`load_managed_session_runtime_snapshot(...)`、`load_runtime_snapshot_from_store(...)` 和 root public re-export 已删除；`lime-agent request_tool_policy` 回归改为从 `runtime_store_aster_adapter::runtime_read_store_from_aster(...)` 包装 current read store，再调用 `thread-store::runtime_store::load_runtime_snapshot_record(...)` 读取 `RuntimeSessionSnapshotRecord`。生产 `runtime_store_aster_adapter.rs` 不再 import / lower Aster whole `SessionRuntimeSnapshot`，`session_execution_runtime`、`session_store_tests` 与 `subagent_runtime_adapter` 测试中的 Aster snapshot fixture 已改成 current `RuntimeSessionSnapshotRecord` / `RuntimeThreadSnapshotRecord` / `RuntimeTurnSnapshotRecord`，`runtime_snapshot_record_from_aster(...)` / `runtime_thread_snapshot_record_from_aster(...)` test-only bridge 已删除并由治理测试禁止恢复。R5/R6 仍 open，因为 Aster durable source、Aster `SessionStore` trait 和 `AgentEvent` source adapter 未迁出。

2026-07-11 R5/R6 runtime event persistence 补充：Aster reply backend 在 provider stream 启动前先通过 current `thread-store::runtime_store::ensure_runtime_turn_record(...)` 预创建 turn，并把显式 `AsterThreadRuntimeStore` 传入 `project_aster_reply_stream(...)`；Aster event stream 的 turn started / turn completed / item started-updated-completed 持久化只留在 `request_tool_policy` source adapter 边界，统一调用 current store helper，不再走全局 runtime store，也不把 turn/item persistence 写回 `agent-compat::Agent`。治理守卫已更新为 current store 注入形状，`asterMigrationBoundary.test.ts` 复跑 `179 passed`；`cargo check -p aster-core -p lime-agent --lib` 通过。R5/R6 仍 open，因为 Aster `AgentEvent` source 和 durable source 尚未迁出。

2026-07-11 R5/R6 request_tool_policy global store 补充：`runtime_status_item` 与 `runtime_request_item` writer 已改为接收显式 `AsterThreadRuntimeStore`，`AsterReplyRuntimeHost` / action confirmation / action-required response completion 从当前 `Agent` 传入 `agent.thread_runtime_store()`；这两个 writer 不再调用 `require_aster_runtime_store()`。验证通过：`lime-agent request_tool_policy` `81 passed`，治理守卫 `179 passed`。R5/R6 仍 open，因为 `runtime_support`、runtime conversation 等其它 source adapter 仍需继续迁出全局 durable source。

2026-07-11 R5/R6 agent session fallback 补充：`agent-compat/src/agents/agent.rs` 的 `store_add_message` / `store_get_session` / `store_replace_conversation` / extension-data / provider-config helper、history replacement 分支和 session name generation 后台任务不再 fallback 到全局 `SessionManager` / `query_session` / `apply_session_update`；缺注入 `SessionStore` 时 fail closed 并记录 warning。`agents/reply_parts.rs::update_session_metrics(...)` 和 `agents/execute_commands.rs` 的 `/clear` token reset 也改为必须消费注入 store，删除 metrics / token reset 写回对 `query_session` / `apply_session_update` 的依赖；无消费者 `delete_managed_session` / `replace_session_conversation` convenience API 已从 `session/update.rs` 删除，后续又物理删除 `session/update.rs`。验证通过：`cargo check -p aster-core -p lime-agent --lib`、治理守卫 `179 passed`。后续已删除 `session_manager.rs` 与 root `SessionManager` re-export；R5/R6 仍 open，因为 `SessionStore` trait 本身、Aster durable source 和 provider/reply session/message lowering 尚未迁出。

2026-07-11 R5/R6 team/chatrecall fallback 补充：协作 adapter 已改为显式接收注入 `SessionStore`，不得再调用 `query_session(...)` / `SessionManager::*` / `persist_session_extension_data(...)`；后续该 adapter 已从 `tools/{agent_control.rs,team_tools.rs}` 迁到 `agents/{collab_runtime.rs,team_runtime.rs}`，不再让 `tools` 目录拥有协作工具实现。`session/team.rs` 仍显式接收注入 store；`chatrecall_extension.rs` 的 load/search 也改为从 `PlatformExtensionContext.session_store` 读取，缺 store 时 fail closed，搜索继续消费 `LimeSessionStore::search_chat_history(...)` 背后的 `thread-store::history_search` current owner。无消费者 `session/query.rs` 已删除，`session/mod.rs` 不再 re-export `query_session`。治理守卫已禁止恢复 `session/update.rs`、`session/query.rs`、`SessionUpdateBuilder`、agent/team/chatrecall 的全局 SessionManager fallback。R5/R6 仍 open，因为平台 MCP extension bridge、Aster `SessionStore` trait、Aster durable source 和 provider/reply 的 Aster `Session` / `Message` lowering 仍未迁出。

2026-07-11 R5/R6 subagent session lookup 补充：`session/subagent.rs::resolve_named_subagent_child_session(...)` 已改为显式接收 `&dyn SessionStore` 并通过 `list_sessions_by_types(...)` 读取 SubAgent session；`agents/collab_runtime.rs` 从注入 store 传入该 helper。无消费者 `list_subagent_sessions_with_metadata(...)` 已删除，`session/subagent.rs` 不再 import / 调用 `SessionManager`。治理守卫禁止 subagent helper 恢复 `SessionManager` 或无 store 的 metadata list convenience。后续已删除 root `SessionManager` re-export 与 `session_manager.rs` 文件，R5/R6 仍 open 的原因收窄为 Aster `SessionStore` trait、Aster durable source 和 provider/reply Aster DTO lowering。

2026-07-11 R5/R6 SessionManager file deletion 补充：`agent-compat/src/session/session_manager.rs` 已物理删除，`session/mod.rs` 不再 `mod session_manager;` 或 re-export `SessionManager`；`agent-compat/src/lib.rs` root allowlist 也不再导出 `SessionManager`。`SessionInsights` Aster DTO 已删除，insights current owner 是 `thread-store::session_insights::SessionInsightsRecord`；`session/session_record.rs` 只保留 provider/reply session lowering 未迁完前仍需要的 `Session` / `SessionType` DTO/default helper，不得恢复 `SessionManager` / `SessionStorage` / `SessionInsights` / update/search convenience。`session/chat_history_search.rs`、`session/query.rs`、`session/update.rs` 仍保持删除态；ChatRecall 搜索只允许继续走注入 `SessionStore::search_chat_history(...)`，由 `LimeSessionStore` 转到 `thread-store::history_search` current owner。R5/R6 仍 open，但剩余 blocker 已收窄为 Aster `SessionStore` trait、Aster durable source、provider/reply Aster `Session` / `Message` lowering 和 `AgentEvent` source adapter；不得再把 root `SessionManager` 或 `session_manager.rs` 当成迁移对象恢复。

2026-07-11 R4 tools 协作 adapter 迁出补充：`agent-compat/src/tools/agent_control.rs` 与 `agent-compat/src/tools/team_tools.rs` 已物理迁出并删除旧路径；新落点为 `agent-compat/src/agents/collab_runtime.rs` 与 `agent-compat/src/agents/team_runtime.rs`。这两个文件只允许把 Aster session/team source、callback 和 local peer 查询适配到 `tool-runtime::collab_agent` current execution，不再属于 Aster tools 目录。`tools/mod.rs` 不再声明 `mod agent_control` / `mod team_tools`，也不再 re-export `execute_agent_control_runtime_tool` / `execute_team_runtime_tool`；`ToolRegistrationConfig` 仅保留 callback 配置字段，服务尚未删除的 Aster `Agent` 初始化边界。治理守卫已把旧 `tools/{agent_control.rs,team_tools.rs}` 纳入 deleted guard，并继续要求协作工具 DTO/schema/canonical/execution owner 位于 `tool-runtime::collab_agent`。

验证通过：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent`；`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2`，`Finished`，耗时 `4m27s`；`npx prettier --write "src/lib/governance/asterMigrationBoundary.test.ts"` 后 `npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`183 passed`。R4 仍 open，因为 `tools/{base,context,error,registry}.rs`、root `Tool` / `ToolContext` / `ToolRegistry` allowlist、generic registry fallback、MCP source adapter 和 workspace sandbox backend 尚未删除。

## 剩余清单

| ID  | 状态 | 分类            | 剩余项                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 下一步 / 退出条件                                                                                                                                                                                                                      |
| --- | ---- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | open | deprecated      | root workspace 仍有 `aster = { package = "aster-core", path = "crates/agent-compat" }`，`lime-agent` 仍有 `aster.workspace = true`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 全部生产 `use aster::` 清零后删除 root dependency 和 package dependency。                                                                                                                                                              |
| R2  | open | compat blocker  | Aster `reply_with_provider` / `Message` / `AgentEvent` 仍是最后 reply source backend；`lime-agent` compat adapter 已不再直接调用 Aster `Agent::reply(...)`，且已删除 `provider_reply_exit_source.rs` / `RuntimeReplySource*` 过渡 wrapper                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `agent-runtime` / `model-provider` 直接执行 current reply backend，删除 Aster reply adapters。                                                                                                                                         |
| R3  | open | compat blocker  | `credential_bridge/runtime_provider_adapter.rs` 已退回 provider binding factory；Aster provider trait object 最后一跳现集中在 `request_tool_policy/aster_reply_backend_adapter.rs::run_aster_reply_backend(...)` 的唯一 `.reply_with_provider(...)`，`model-provider::provider_stream::source_execution` wrapper 已删除；Aster message/session lowering 已收进 `AsterReplyBackendRequest::from_current(...)`，但仍是退场 request 壳                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | provider trait object / provider stream execution 迁到 `model-provider` current backend；删除 `run_aster_reply_backend(...)` 内的 Aster provider trait object、Aster message/session lowering 和 `reply_with_provider(...)` 最后一跳。 |
| R4  | open | compat blocker  | reply loop 标准 native dispatch 工具已优先走 `tool-runtime::native_dispatch` + current permission preflight；gateway-backed native execution registration / dispatch 已归 `tool-runtime::gateway_dispatch_execution`，gateway-backed 注册分支只安装 current execution registration，不再创建或注册 Aster `Tool` 壳，reply loop 顺序固定为 `file_search -> gateway_dispatch -> native_dispatch -> registry.execute`；`request_user_input` schema/parse/validation/normalization/definition/execution 已迁到 `tool-runtime`，`agent-runtime::request_user_input` 保留 current runner，Aster `AskTool` 注册壳已删除；协作工具 definitions/canonical/execution 已归 `tool-runtime::collab_agent` 且不再注册 Aster `Tool` 壳；Skill 执行已由 `lime-agent` native hook 在 registry 前调用 `tool-runtime::skill_execute`，Skill 模型可见 definition 由 current `skill_tool_definition()` / `Agent::list_tools` 注入，`LimeSkillTool` Aster `Tool` trait wrapper 已删除；Bash / PowerShell 前台执行、background 启动、legacy shell alias、workspace sandbox fail-closed guard、shell warning current guard、Read 文件读取与 Glob/Grep 文件搜索已优先走 `tool-runtime`；Aster Bash/PowerShell/Task registry fallback 文件和 shell alias registry ownership 已删除；Aster `ToolRegistry` / `Tool` / `ToolContext` 仍服务 MCP source adapter fallback 和 remaining registry fallback | 真实 workspace sandbox backend、MCP source adapter 等剩余工具继续迁出，并删除 generic registry fallback / root `Tool` / `ToolContext` / `PermissionCheckResult` allowlist。                                                            |
| R5  | open | compat blocker  | Aster `SessionStore` trait、`ThreadRuntimeStore`、runtime store DTO 和 queue durable source 仍在边界内；timeline snapshot record 投影已前移到 `agent-runtime::runtime_timeline_record`，conversation item record 投影、transcript item record 构造、sequence 规则、按 thread 计算下一条 sequence helper 与 transcript delete/upsert helper 已前移到 `thread-store`，queue DTO lowering 已折叠到 `runtime_store_aster_adapter.rs` 并删除独立 `runtime_queue_aster_adapter.rs`；`Agent::runtime_snapshot(...)`、`load_shared_session_runtime_snapshot`、`load_managed_session_runtime_snapshot(...)`、`load_runtime_snapshot_from_store(...)` 和 `runtime_snapshot_record_from_aster(...)` test bridge 已删除，但 Aster durable store / `SessionStore` trait、root `ThreadRuntimeStore` / `SessionRuntimeSnapshot` allowlist 仍未迁出                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Thread / Turn / Item persistence 只消费 `thread-store` / `agent-runtime` / App Server read model；下一刀迁出 `SessionStore` trait / durable store source，再移除 root `ThreadRuntimeStore` / `SessionRuntimeSnapshot` allowlist。      |
| R6  | open | compat blocker  | runtime timeline record 投影 current owner 已迁到 `agent-runtime::runtime_timeline_record`；runtime conversation item record -> message 投影、transcript item 写入 record 构造、read/count traversal 和 append sequence helper 已迁到 `thread-store`；runtime detail conversation 与 session store runtime conversation 均改为调用 `thread-store::runtime_store` current collector；runtime event converter 仍从 Aster `AgentEvent` 做 source adapter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | current runtime events 和 Item projection 不再解析 Aster runtime DTO；继续迁出 Aster durable source / `AgentEvent` source adapter。                                                                                                    |
| R7  | open | compat blocker  | Aster `McpClientTrait` / extension manager / built-in extension clients 仍是 reply loop MCP bridge 形状；root `agent-compat/src/mcp/**` manager 已删除                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | MCP request forwarding 和 inventory 归 `lime-mcp` / App Server current gateway；继续删除 Codex 无对应的 Aster-only extension surface。                                                                                                 |
| R8  | open | compat blocker  | Aster `context_mgmt::compact_messages*` no-op stub 已删除，`/compact` 在 staging 内 fail-closed；真正 context compaction owner 仍需按 refactor v1 继续归 App Server / `agent-runtime` current 主链                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 后续若恢复 context compaction，必须进入 App Server / `agent-runtime` current owner并接入 Thread / Item projection，不得恢复 Aster stub 或空 summary 写入。                                                                             |
| R9  | open | cleanup blocker | `agent-compat/src/agents/agent.rs`、`tools/registry.rs`、`session/runtime_store.rs` 仍是大体量 staging 文件；`execution/manager` stub 已删除                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | R2-R8 迁完后按目录删除或拆到 current owner；不得继续在 staging 文件中补业务逻辑。                                                                                                                                                      |
| R10 | open | cleanup blocker | `agent-compat/Cargo.toml` 仍有 `model-provider`、`tool-runtime` 等指向 Lime owner 的 burn-down 依赖；旧 ReadTool 专用的 `document-preview` 已随 Aster file/search 壳删除而移除                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 只允许作为现存 allowlist，不得新增 `document-preview` / `agent-runtime` / `agent-protocol` / `thread-store` / App Server 等 owner 依赖；迁出对应调用后删除这些依赖。                                                                   |

## 下一刀

1. Fast A：收缩 `agent-compat` public API。对外部 `aster::...` 零引用的顶层模块先从 `pub mod` 改为 crate-private `mod`，验证后继续按内部引用图物理删除。
2. Fast B：批量删除 Codex 无对应 current 面、且 Lime 前后端无消费的 Aster-only 目录 / wrapper / inline 正向测试；删除后补 forbidden-to-restore 守卫。
3. Fast C：批量迁移简单 DTO / projection / policy helper 到 current owner，并立刻删除 `agent-compat` 原 public surface。
4. Deferred Core：R2/R3 provider/reply loop、R4 MCP source adapter / true workspace sandbox backend / generic registry fallback、R5/R6 session / event source adapter 暂列复杂核心，等外围搬空后集中替换。

## 快通道候选清单

| 批次          | 状态        | 分类                                  | 候选                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 动作                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------- | ----------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fast A1       | completed   | deleted / migrated helper cleanup     | remaining：无；deleted/migrated：`context_mgmt`、`execution`、`hints`、`hooks`、`mcp_utils`、`media`、`network`、`oauth`、`posthog`、`prompt_template`、`scheduler_trait`、`security`、`slash_commands`、`token_counter`、`tool_monitor`、`user_message_manager`、`utils`、`tools/hooks`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 外部 `aster::模块` 零引用；已删除 no-op / empty queue / custom slash recipe / prompt template / scheduler trait / root hook / media helper / context compaction / execution manager stubs 和 Aster-only tool hook framework，`mcp_utils` 已内联为 `rmcp::model::ErrorData` 结果别名，root `utils` 已拆到 conversation/provider/agent 局部 owner，`network` 已迁到 `model-provider`。 |
| Fast A2       | in_progress | compat blocker / partial dead cleanup | `permission`、`recipe`、`scheduler`、`skills`、`tools`、agent framework、provider concrete modules、config public surface；`permission` 已删除 Aster integrated permission / policy / audit framework，最小 permission 子模块已降为 crate-private；`scheduler` 与 recipe file runtime 已删除；`recipe` 已删除 generation/parser/旧 metadata DTO，仅剩最小 DTO / builder / serde surface；`agents/{context,parallel,resume}` 已删除；无外部生产消费者的 `agents` / `config` / concrete provider public surface 已降为 crate-private；`action_required_manager` / `session_context` / `permission` 顶层模块、`tools` / `tools/file` / `tools/search` / `session` 子模块、`conversation::message` 子模块以及 `model` / `recipe` / `tool_inspection` 顶层 public surface 已收成最小 re-export，零引用 `diff_summary` / vendored `ripgrep` helper 已删除 | 外部仍有引用或被 reply loop 间接依赖；不再新增逻辑，只按 current owner 分批迁出，已删 framework / scheduler / recipe runtime / recipe generation/parser/旧 metadata DTO / Aster agent framework / 未使用 tool helper 不得恢复，crate-private provider staging 后续随 R2/R3 迁到 `model-provider` 后整块删除。                                                                        |
| Fast B2       | completed   | aster-only-dead                       | `agent-compat/src/mcp/**` root MCP manager                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 外部生产引用为 0；Lime current MCP owner 是 `lime-mcp` / App Server gateway / `tool-runtime::mcp_*`，已物理删除并补 forbidden-to-restore 守卫。                                                                                                                                                                                                                                      |
| Fast B3       | completed   | aster-only-dead                       | `agent-compat/src/skills/**` registry / loader / executor 与 `agents/skills_extension.rs` `loadSkill` platform extension                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Current owner 是 `lime-skills` + `tool-runtime::skill_execute` + App Server skill 数据源；已物理删除并补 forbidden-to-restore 守卫。                                                                                                                                                                                                                                                 |
| Fast B1       | in_progress | aster-only-dead / migrated DTO        | Aster-only browser signup、旧 config manager、旧 context framework、旧 vendor wrappers、session fork / summary resume / worktree extension、provider test / API-key auto-detect helpers；root context public surface 已删除，context trace current DTO 已迁到 `agent-protocol::context_trace`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 已在 README dead 清单记录；继续补守卫并清残留引用，剩余只处理仍有外部引用或核心 blocker 的 provider / tool / session / MCP 面。                                                                                                                                                                                                                                                      |
| Deferred Core | open        | compat blocker                        | provider/reply loop、native `ToolRegistry`、Aster `SessionStore` / runtime item source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 等 Fast A/B/C 收完外围后集中替换，避免每刀都冷编完整 `aster-core`。                                                                                                                                                                                                                                                                                                                  |

## 进度日志

### 2026-07-11：R4 shell registry fallback 文件删除

- `completed`：`tool-runtime::shell_execution::runtime_shell_tool_kind(...)` 接管旧 shell alias：`BashTool`、`Shell`、`developer__shell`、`mcp__system__shell`、`shell_command`、`exec_command`、`local_shell_call` 和 `PowerShellTool`；Bash / PowerShell 参数解析接受 `command` / `cmd` / `script`，旧模型可见形状不再需要 Aster registry fallback。
- `completed`：删除 `agent-compat/src/tools/{bash.rs,powershell_tool.rs,task.rs}`，`agent-compat/src/tools/mod.rs::register_all_tools(...)` 不再注册 Bash / PowerShell / Task fallback，`tools/registry.rs::DEFAULT_NATIVE_ALIAS_PAIRS` 不再声明 shell alias ownership。
- `completed`：`agent-compat/src/sandbox.rs` 删除空成功的 `execute_in_sandbox_with_options(...)`、`ExecutorOptions` / `ExecutorResult`、`SandboxType` 和旧 output buffer，只保留 Aster `ToolContext.workspace_sandbox` 需要的最小 `SandboxConfig` marker；真实 sandbox planning / guard / execution owner 只在 `tool-runtime::sandbox` 与 `tool-runtime::shell_execution`。
- `guarded`：`asterMigrationBoundary.test.ts` 把 Bash / PowerShell / Task 文件列入 deleted / forbidden-to-restore，禁止 Aster shell alias registry ownership、空 sandbox executor / output buffer / `SandboxType` 回流，并继续要求 `tool-runtime::shell_execution` 持有 workspace guard、warning guard、background 和 legacy alias。
- `classification`：`current` = `tool-runtime::shell_execution` foreground/background/workspace guard/warning guard/legacy shell alias owner；`dead / deleted / forbidden-to-restore` = Aster `BashTool` / `PowerShellTool` / `TaskManager` registry fallback、shell alias registry ownership 和 Aster empty sandbox executor；`compat blocker` = MCP source adapter、真实 workspace sandbox backend、R2/R3 provider reply 最后一跳、R5/R6 session/runtime source 和 generic `ToolRegistry` fallback / root allowlist。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package aster-core --package lime-agent -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/shell-registry-fallback-delete" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime shell_execution --lib -j 2 -- --nocapture`，`9 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/aster-shell-registry-delete" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2` 通过；曾暴露的 `agent-compat/src/sandbox.rs` unused re-export 已通过本刀删除。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`176 passed`。
- `remaining`：R4 未完成；下一刀优先迁 MCP source adapter / extension bridge 或实现真实 workspace sandbox backend，再删除 generic `ToolRegistry` fallback 与 root `Tool` / `ToolContext` / `PermissionCheckResult` allowlist。

### 2026-07-11：R4 shell warning 不再回落 Aster registry

- `completed`：`tool-runtime::shell_execution` 对已知 Bash / PowerShell 的 `RequiresConfirmation` 不再返回 `None`；非 full-access warning 现在直接返回 current guard result，metadata 包含 `execution_surface=current_shell_permission_guard`、`reasonCode=shell_confirmation_required`、`confirmationRequired=true`、`failureCategory=approval_required` 和原始 `approvalMessage`。
- `unchanged`：未知工具仍可返回 `None` 交给剩余 registry fallback；真实 HITL / approval resume 不在本刀内实现，只能后续接 App Server RuntimeCore pending action / `agentSession/action/respond` 主链。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `shell_requires_confirmation_result` / `current_shell_permission_guard` 存在，禁止 `FallbackToRegistry` 和 `RequiresConfirmation -> return None` 回流。
- `classification`：`current` = `tool-runtime::shell_execution` shell permission guard；`dead / guarded` = Bash / PowerShell warning shell 回落 Aster registry 或恢复 Aster approval hook/cache/pending map；`compat blocker` = MCP source adapter、真实 workspace sandbox backend、R2/R3 provider reply 最后一跳和 R5/R6 session/runtime source。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package aster-core --package lime-agent -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/shell-no-warning-fallback" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime shell_execution --lib -j 2 -- --nocapture`，`8 passed`，覆盖 unknown fallback、workspace guard、warning current guard、full-access warning execute 和 background current process。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/exec-plans/aster-phase6-provider-reply-backend-plan.md" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`176 passed`。
- `passed`：scoped `git diff --check` 通过。
- `remaining`：R4 仍未完成；下一刀优先迁 MCP source adapter 或实现真实 workspace sandbox backend，再删除 Aster `BashTool` / `PowerShellTool` 和通用 `ToolRegistry` fallback。

### 2026-07-11：R5/R6 thread/turn ensure write skeleton 前移到 thread-store

- `completed`：`thread-store::runtime_store` 新增 `RuntimeThreadWriteStore`、`RuntimeTurnWriteStore`、`RuntimeThreadTurnStore`、`RuntimeTurnScopeInput`、`resolve_runtime_turn_scope(...)` 和 `ensure_runtime_turn_record(...)`，承接 thread/turn ensure 的 storage-neutral 写入骨架；空 thread id 回退 session id、空 turn id 生成 UUID、missing thread/turn 创建等规则不再写在 Aster session store callsite。
- `completed`：`runtime_store_aster_adapter.rs::AsterRuntimeStoreAdapter` 实现 current thread/turn write traits，把 current `RuntimeThreadRecord` / `RuntimeTurnSnapshotRecord` 与 Aster `ThreadRuntime` / `TurnRuntime` 双向转换集中在 adapter；Aster `ThreadRuntimeStore::{get_thread,upsert_thread,get_turn,create_turn}` 不再向 `aster_session_store/runtime_conversation.rs` 扩散。
- `completed`：`aster_session_store/runtime_conversation.rs::ensure_runtime_turn(...)` 只读取 Aster `current_action_scope()` / `current_turn_context()` 作为输入 source adapter，然后调用 `thread-store::runtime_store::ensure_runtime_turn_record(...)`；生产路径不再直接 `ThreadRuntime::new(...)` / `TurnRuntime::new(...)` / `store.upsert_thread(...)` / `store.get_turn(...)` / `store.create_turn(...)`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `thread-store::runtime_store` 持有 thread/turn write traits 与 ensure helper，并禁止 `runtime_conversation.rs` 恢复 direct Aster thread/turn write snippets。
- `classification`：`current` = `thread-store::runtime_store` thread/turn write skeleton；`compat blocker` = `runtime_store_aster_adapter.rs` 内 Aster durable store lowering、Aster `SessionStore` trait、provider/reply 对 Aster `Session` / `Message` 的依赖和 `AgentEvent` source adapter；`dead / guarded` = session store 直接构造 / 写入 Aster `ThreadRuntime` / `TurnRuntime`。
- `Thread / Turn / Item`：Thread store 持有 thread/turn persistence contract；Turn 仍由 existing Aster action scope/context source adapter 提供当前 turn 输入；Item 写入继续消费 current runtime item record。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/thread-turn-ensure" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store runtime_store --lib -j 1 -- --nocapture`，`7 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_conversation_aster_adapter --lib -j 1 -- --nocapture`，`2 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_conversation --lib -j 1 -- --nocapture`，`6 passed`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package thread-store --package lime-agent -- --check`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`175 passed`。
- `remaining`：R5/R6 未完成；下一刀仍是 Aster durable source / `SessionStore` trait / provider-reply `Session` / `AgentEvent` source adapter，root `aster` dependency 仍不能删除。

### 2026-07-11：R5/R6 transcript item write source skeleton 前移到 thread-store

- `completed`：`thread-store::conversation_transcript` 新增 `TranscriptItemRecordInput`、`build_transcript_item_record(...)`、`next_runtime_item_sequence(...)` 和 transcript payload / item 判定，承接 transcript item id、sequence、status/timestamp 和 payload record 纯规则。
- `completed`：`thread-store::runtime_store` 新增 `RuntimeItemWriteStore` / `RuntimeItemStore`，以及 `upsert_runtime_item_record(...)`、`delete_runtime_transcript_items(...)`，按 Codex `ThreadStore::append_items(...)` / live writer 方向提供 storage-neutral 写入骨架。
- `completed`：`runtime_store_aster_adapter.rs` 的 `AsterRuntimeStoreAdapter` 同时实现 current read contract 与 item write contract；Aster `ItemRuntime` / `ItemRuntimePayload` lowering 只留在这一层。
- `completed`：`aster_session_store/runtime_conversation.rs` 不再直接 `create_item/update_item/delete_item`，也不再调用旧 `build_aster_transcript_item(...)` / `is_aster_transcript_item_payload(...)`；它把 Aster `Message` 降成 current transcript item record 后，通过 current write helper 写入。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 current owner 持有 transcript record builder / write trait / upsert-delete helper，禁止 session store 恢复旧 Aster transcript builder、payload 判定和直接 item 写入。
- `classification`：`current` = `thread-store::conversation_transcript` + `thread-store::runtime_store` write skeleton；`compat blocker` = `runtime_store_aster_adapter.rs` 内的 Aster durable source lowering、Aster `SessionStore` trait、provider/reply 对 Aster `Message` / `Session` 的依赖和 `AgentEvent` source adapter；`dead / guarded` = `build_aster_transcript_item(...)`、`is_aster_transcript_item_payload(...)`、session store 直接 Aster item write。
- `Thread / Turn / Item`：Thread store 持有 transcript item persistence record 与 write contract skeleton；Turn 暂时仍通过现有 Aster-compatible turn ensure path 提供 current turn scope；Item projection 消费 `RuntimeItemSnapshotRecord`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/transcript-write-source" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store conversation_transcript --lib -j 1 -- --nocapture`，`8 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store runtime_store --lib -j 1 -- --nocapture`，`4 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_conversation_aster_adapter --lib -j 1 -- --nocapture`，`2 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_conversation --lib -j 1 -- --nocapture`，`6 passed`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package thread-store --package lime-agent -- --check`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`175 passed`。
- `remaining`：R5/R6 未完成；下一刀优先迁出 Aster `SessionStore` trait / durable runtime source，或切到 R2/R3 provider/reply backend，root `aster` dependency 仍不能删除。

### 2026-07-11：R5/R6 runtime queue source lowering 折叠到 store adapter

- `completed`：删除独立 `lime-rs/crates/agent/src/runtime_queue_aster_adapter.rs`，Aster `QueuedTurnRuntime` <-> current `agent-runtime::runtime_queue::RuntimeQueuedTurn` 的 DTO lowering 统一进入 `runtime_store_aster_adapter.rs`。
- `completed`：`runtime_support.rs` 不再 import 独立 Aster queue adapter，也不再为 queue 路径直接获取 Aster `ThreadRuntimeStore`；同步 / 异步 queue service 初始化只调用 `require_aster_runtime_queue_store()` 并拿 current `RuntimeQueueService`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `runtime_queue_aster_adapter.rs` 不存在，要求 queue source lowering 只留在 `runtime_store_aster_adapter.rs`，并继续禁止 `runtime_support.rs` 出现 Aster queue DTO / `RuntimeQueueStore for AsterRuntimeQueueStoreAdapter` 等实现细节。
- `classification`：`current` = `agent-runtime::runtime_queue::{RuntimeQueueStore, RuntimeQueueService, RuntimeQueuedTurn}`；`compat blocker` = `runtime_store_aster_adapter.rs` 内的 Aster `ThreadRuntimeStore` queue source lowering；`dead / guarded` = 独立 `runtime_queue_aster_adapter.rs` 和 `runtime_support.rs` 重新认识 Aster queue DTO。
- `Thread / Turn / Item`：Turn queue gate / submit / resume 继续归 `agent-runtime::runtime_queue`；Thread persistence source 仍在 Aster `ThreadRuntimeStore` compat adapter 内，后续必须迁到 current store/write owner。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/runtime-queue-store-fold" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime runtime_queue --lib -j 1 -- --nocapture`，`6 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_queue --lib -j 1 -- --nocapture`，`lime-agent` crate 编译通过，过滤器无匹配测试（`0 passed; 545 filtered out`）。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store runtime_store --lib -j 1 -- --nocapture`，`2 passed`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`175 passed`。
- `remaining`：R5/R6 未完成；本段的 transcript item 写入下一刀已由 2026-07-11 后续 write skeleton 完成，剩余重点是 Aster `SessionStore` trait / durable source、provider/reply 对 Aster `Session` / `Message` 的依赖和 `AgentEvent` source adapter。

### 2026-07-11：R5/R6 runtime store read contract 前移到 thread-store

- `completed`：新增 `thread-store::runtime_store::{RuntimeStore, RuntimeStoreFuture, RuntimeThreadRecord}`，按 Codex `ThreadStore` 风格提供 storage-neutral async read contract，不引入 Aster 类型。
- `completed`：`thread-store::runtime_store::load_runtime_snapshot_record(...)` 承接 session -> thread -> turn/item traversal，直接产出 `RuntimeSessionSnapshotRecord`；`runtime_support.rs` 读取 runtime overlay 时调用该 current loader，不再调用 Aster `load_shared_session_runtime_snapshot(...)`。
- `completed`：`thread-store::runtime_store::collect_runtime_conversation_records(...)` 承接 runtime detail conversation traversal，并复用 `thread-store::conversation_transcript` current projector；`runtime_conversation_aster_adapter.rs` 只获取 Aster-backed current read store 并调用该 helper，生产代码不再直接 import `ThreadRuntimeStore`。
- `completed`：`runtime_store_aster_adapter.rs` 当时新增 `AsterRuntimeStoreReadAdapter`，把 Aster `ThreadRuntimeStore::list_threads/list_turns/list_items` 降成 current `RuntimeThreadRecord` / `RuntimeTurnSnapshotRecord` / `RuntimeItemSnapshotRecord`，Aster DTO 只留在这一层；2026-07-11 后续已扩展并改名为 `AsterRuntimeStoreAdapter`，同时承接 current item write lowering。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `thread-store::runtime_store` 持有 read contract、snapshot loader 和 conversation collector；要求 `runtime_support.rs` 通过 `load_runtime_snapshot_record_from_store` 读取；禁止 store adapter 恢复 `load_shared_session_runtime_snapshot(...)` 生产入口，并禁止 conversation adapter 生产代码重新出现 `ThreadRuntimeStore`。
- `classification`：`current` = `thread-store::runtime_store` + `thread-store::runtime_snapshot` + `thread-store::conversation_transcript`；`compat blocker` = `AsterRuntimeStoreAdapter`、Aster durable source、Aster `SessionStore` trait 和 `AgentEvent` source adapter；`dead / guarded` = runtime support 重新直接调用 Aster snapshot loader或 conversation query 重新遍历 Aster `ThreadRuntimeStore`。
- `Thread / Turn / Item`：Thread store read contract 负责 runtime snapshot / item records；Turn/Item projection 继续由 `agent-runtime::runtime_timeline_record` 与 `thread-store::conversation_transcript` materialize；Aster 只剩 source adapter。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/runtime-store-read-contract" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store runtime_store --lib -j 1 -- --nocapture`，`2 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_conversation_aster_adapter --lib -j 1 -- --nocapture`，`2 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent get_session_should_prefer_current_runtime_conversation_over_agent_messages --lib -j 1 -- --nocapture`，`1 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`175 passed`。
- `remaining`：R5/R6 未完成；本段后续已完成 queue source lowering 折叠和 transcript item write skeleton，剩余重点改为 `SessionStore` trait / durable source / `AgentEvent` source adapter，root `aster` dependency 仍不能删除。

### 2026-07-10：R5/R6 runtime timeline record projector 前移到 agent-runtime

- `completed`：新增 `agent-runtime::runtime_timeline_record`，承接 `thread-store::runtime_snapshot::{RuntimeSessionSnapshotRecord, RuntimeTurnSnapshotRecord, RuntimeItemSnapshotRecord}` 到 `RuntimeTimeline*` current DTO 的 snapshot flatten、turn status folding、item status/payload mapping、tool output text extraction 和 request-user-input schema projection。
- `completed`：`lime-agent/src/runtime_timeline_adapter.rs` 删除本地 record -> timeline 投影实现，只保留 Aster `TurnRuntime` / `ItemRuntime` -> `thread-store` record 的 compat 转换，以及 `lime_core::tool_calling::tool_calling_dynamic_filtering_enabled()` policy 注入。
- `cleanup`：`runtime_timeline_adapter.rs` 的 Aster 正向测试从 8 个重复用例收缩为 3 个边界 smoke；pure projection 规则测试迁到 `agent-runtime::runtime_timeline_record`，adapter 文件从 `501` 行降到 `150` 行。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `runtime_timeline_record.rs` 持有 record projector，并禁止 `runtime_timeline_adapter.rs` 重新出现 `RuntimeTimelineSnapshotSource` / `RuntimeTimelineSnapshotThread` 等 current projector 细节。
- `classification`：`current` = `agent-runtime::runtime_timeline_record` + `thread-store::runtime_snapshot` record contract；`compat blocker` = Aster runtime store source adapter、Aster runtime conversation source adapter、Aster `AgentEvent` source adapter；`dead / guarded` = 把 snapshot flatten / item payload display / request schema projection 规则搬回 `lime-agent` adapter。
- `Thread / Turn / Item`：Thread 提供 snapshot record，Turn / Item timeline projector 归 `agent-runtime`，Aster 只剩 source lowering。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/runtime-timeline-record" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime runtime_timeline_record --lib -j 1 -- --nocapture`，`4 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_timeline_adapter --lib -j 1 -- --nocapture`，收缩后 `3 passed`。
- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-runtime/src/lib.rs" "lime-rs/crates/agent-runtime/src/runtime_timeline_record.rs" "lime-rs/crates/agent/src/runtime_timeline_adapter.rs"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`175 passed`；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `remaining`：R5/R6 未完成；`require_shared_session_runtime_store()`、Aster durable source、runtime conversation source adapter 和 `AgentEvent` source adapter 仍阻塞 root `aster` dependency 删除；`load_shared_session_runtime_snapshot(...)` / `load_managed_session_runtime_snapshot(...)` / `load_runtime_snapshot_from_store(...)` 已由 2026-07-11 后续刀删除并禁止恢复。

### 2026-07-10：R5/R6 runtime conversation record projector 前移到 thread-store

- `completed`：`thread-store::runtime_snapshot::RuntimeItemPayloadRecord::InternalTranscript` 改为保留 transcript role、content_json、metadata_json 和 created_timestamp；timeline 仍把它投影为隐藏的 `InternalTranscript`，conversation read model 可以从 current record 恢复消息。
- `completed`：`thread-store::conversation_transcript` 新增 `project_runtime_conversation_record_from_item_record(...)` / `project_runtime_conversation_record_from_item_payload(...)`，承接 runtime item record -> conversation message 的纯投影；`RuntimeConversationItemSource` 只在 current owner 内构造。
- `cleanup`：`runtime_conversation_aster_adapter.rs` 删除 `conversation_source_from_aster_payload(...)`、`RuntimeConversationItemSource` import、`ItemRuntimePayload::{UserMessage,AgentMessage}` 分支和 fallible JSON projection 包装；adapter 只把 Aster `ItemRuntime` 降成 `RuntimeItemSnapshotRecord` 并调用 current projector。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 current owner 持有 record projector，禁止 runtime detail query / Aster session store 复制 Aster payload 映射，并要求 adapter 不再出现 `RuntimeConversationItemSource` 或 `ItemRuntimePayload::{UserMessage,AgentMessage}` 分支。
- `classification`：`current` = `thread-store::conversation_transcript` + `thread-store::runtime_snapshot` record contract；`compat blocker` = Aster `ThreadRuntimeStore` traversal、Aster `SessionStore` trait；`dead / guarded` = 把 conversation record/source mapping 或 transcript item write rules 搬回 `runtime_conversation_aster_adapter.rs`。
- `Thread / Turn / Item`：Thread store 持有 conversation record 选择与 transcript 恢复规则；Item projection 从 current record materialize；Aster 只剩 source lowering 和未迁 store traversal。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/runtime-conversation-record" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store conversation_transcript --lib -j 1 -- --nocapture`，`6 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_conversation_aster_adapter --lib -j 1 -- --nocapture`，`2 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime runtime_timeline_record --lib -j 1 -- --nocapture`，`4 passed`。
- `remaining`：R5/R6 未完成；本段中的 `build_aster_transcript_item(...)` blocker 已由 2026-07-11 write skeleton 删除并禁止恢复，剩余 `ThreadRuntimeStore` durable source、Aster `SessionStore` trait 和 `AgentEvent` source adapter 仍阻塞 root `aster` dependency 删除。

### 2026-07-10：R2/R3 provider reply request lowering 收口

- `completed`：`request_tool_policy/aster_reply_backend_adapter.rs` 新增私有 `AsterReplyBackendRequest::from_current(...)`，把 current `RuntimeReplyMessage`、`RuntimeReplyStreamRequest`、`AgentSessionConfig` 和 cancel token 组装为单一 Aster 退场 request。
- `completed`：`run_aster_reply_backend(...)` 不再散收 current message / session / stream 参数；它只接收 `CompatReplyProvider` 与 `AsterReplyBackendRequest`，然后调用唯一 `.reply_with_provider(...)` 并用 `request.stream_request` 投影回 current stream。
- `guarded`：`asterMigrationBoundary.test.ts` 增加 request builder / request field 守卫，继续禁止恢复 `provider_reply_exit_source.rs`、`provider_stream/source_execution.rs`、裸 `dyn Provider` 签名和多层 provider source wrapper。
- `classification`：`current` = `agent-runtime` reply message / session config / backend run contract 与 `model-provider` stream request；`transitional current adapter` = `AsterReplyBackendRequest` request lowering 壳；`compat blocker` = Aster DTO / provider trait object / `.reply_with_provider(...)`。
- `verification`：`rustfmt --edition 2021 --check "lime-rs/crates/agent/src/request_tool_policy/aster_reply_backend_adapter.rs"` 通过；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" ...` 为 `174 passed / 1 failed`，唯一失败是既有 `runtime_state.rs` 行数 `1057 >= 1000`。`lime-agent request_tool_policy` Rust 定向测试仍在冷编译中。

### 2026-07-10：R2/R3 provider trait object 签名继续收窄

- `completed`：在 `credential_bridge/runtime_provider_adapter.rs` 新增 `CompatReplyProvider` 退场句柄，`ConfiguredReplyProvider::into_compat_provider(...)` 不再直接把 `Arc<dyn aster::Provider>` 暴露给 `request_tool_policy`。
- `completed`：`aster_reply_backend_adapter.rs` 的 default provider path 也通过 `CompatReplyProvider::from_aster_provider(...)` 包装；`run_aster_reply_backend(...)` 签名不再出现 `dyn Provider` / `Arc<dyn Provider>`，只在唯一 `.reply_with_provider(...)` 最后一跳通过 `provider.into_aster_provider()` 解包。
- `guarded`：`asterMigrationBoundary.test.ts` 补充要求 provider trait object 留在 credential bridge 退场句柄内，禁止 `aster_reply_backend_adapter.rs` 恢复 `dyn Provider` / `Arc<dyn Provider>` 签名，同时继续禁止恢复 `provider_reply_exit_source.rs` 与 `provider_stream/source_execution.rs`。
- `classification`：`current` = `model-provider` provider handle / stream request / response event contracts 与 `agent-runtime` backend run path；`compat blocker` = `run_aster_reply_backend(...)` 内 Aster message/session lowering、Aster provider trait object 和 `Agent::reply_with_provider(...)`；`dead / guarded` = 恢复 provider source wrapper、exit-source 文件、或让 Aster provider trait object 再次外泄到 adapter 签名。

### 2026-07-10：R2/R3 provider reply source wrapper 折叠

- `completed`：删除 `model-provider/src/provider_stream/source_execution.rs`，`provider_stream.rs` 不再 `mod source_execution` 或 re-export provider source execution wrapper；`RuntimeReplyProviderSourceBackend*` / `RuntimeReplyProviderExecutionRunner` / `RuntimeReplyProviderExecutionSource` / `run_provider_source_execution(...)` 不再作为 current contract 存在。
- `completed`：删除 `lime-agent/src/request_tool_policy/provider_reply_exit_source.rs`，`request_tool_policy.rs` 不再注册 `mod provider_reply_exit_source;`；`agent-runtime::reply_backend` 只保留仍有语义的 `RuntimeReplyBackendStart` / `RuntimeReplyBackendRun` / `RuntimeReplyBackendRunPath`，负责 provider handle 校验、provider wire policy、session metadata 注入和错误投影。
- `completed`：`aster_reply_backend_adapter.rs::start_aster_reply_stream(...)` 直接根据 `RuntimeReplyBackendRunPath::{Default, Provider}` 选择 compat provider，再调用唯一私有退场函数 `run_aster_reply_backend(...)`；Aster `lower_aster_reply_message(...)`、`to_aster_session_config(...)`、`project_aster_reply_stream(...)` 与 `.reply_with_provider(...)` 最后一跳集中在该函数内。
- `guarded`：`asterMigrationBoundary.test.ts` 改为反向守卫，禁止恢复 `provider_reply_exit_source.rs`、`provider_stream/source_execution.rs`、`RuntimeReplySource*`、`RuntimeReplyProviderSource*`、`run_reply_source(...)`、`run_provider_source_backend(...)` 和 provider source execution wrapper；同时要求唯一 `.reply_with_provider(...)` 留在 `aster_reply_backend_adapter.rs`。
- `classification`：`current` = `agent-runtime::reply_backend::{RuntimeReplyBackendStart, RuntimeReplyBackendRun, RuntimeReplyBackendRunPath}` + `model-provider::provider_stream` handle/request/response policy；`compat blocker` = `aster_reply_backend_adapter.rs::run_aster_reply_backend(...)` 内 Aster provider trait object、Aster message/session lowering 和 `reply_with_provider(...)`；`dead / guarded` = provider/reply source wrapper、exit-source 文件和多层 source/executor indirection。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-reply-fold" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 1 -- --nocapture`，`11 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`47 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 与 `git diff --check -- "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `known-failing`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 当前为 `174 passed / 1 failed`；唯一失败是并行写集 `lime-rs/crates/agent/src/runtime_state.rs` 行数 `1060 >= 1000`，不是本轮 provider/reply 折叠回归。
- `remaining`：R2/R3 未完成；`model-provider` 仍没有真实 current provider HTTP/client backend 来替代 Aster provider trait object。root `aster` dependency、`lime-agent` 的 `aster.workspace = true` 和 `agent-compat` staging crate 仍不能删除。

### 2026-07-10：R4 gateway-backed native execution owner 前移到 tool-runtime

- `completed`：新增 `tool-runtime::gateway_dispatch_execution::{RuntimeGatewayToolExecutionRegistry, RuntimeGatewayToolExecutionRegistration, execute_runtime_gateway_dispatch_tool(...)}`，承接 memory / image task / tool_search / MCP resource 这类 App Server gateway-backed native tools 的 current execution registration、canonical lookup、permission check、cancel fail-fast、RuntimeToolExecutor 调用和 MCP `CallToolResult` 投影。
- `completed`：`lime-agent/src/native_tools/gateway_bridge.rs` 从 per-gateway `NativeDispatch.surfaces()` 生成 current execution registration；`NativeRegistration::gateway(...)` 只携带 current definition 与 gateway execution registration，不再创建临时 Aster `Tool` 壳。
- `completed`：`agent-compat::Agent` 只保存 `RuntimeGatewayToolExecutionRegistry` 并把 Aster `ToolContext` 适配成 `RuntimeGatewayDispatchToolRequest`；reply loop 顺序固定为 `request_user_input -> collab -> shell -> file_read -> file_search -> gateway_dispatch -> native_dispatch -> registry.execute`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tool-runtime::gateway_dispatch_execution` 存在，要求 `lime-agent` gateway bridge 注册 current execution registration，断言 `execute_runtime_gateway_tool(...)` 早于标准 native dispatch 与 Aster registry fallback，并固定 gateway 注册分支在 `register_runtime_gateway_tool_execution(...)` 后立即返回，不允许再执行 `registration.into_tool()` / `registry.register(...)`。
- `classification`：`current` = `tool-runtime::gateway_dispatch_execution` + App Server gateway executor registration + `AgentRuntimeState.native_tool_definitions` model-visible snapshot；`dead / guarded` = gateway-backed Aster `RuntimeDefinitionToolAdapter`、gateway-backed `ToolRegistry` payload、gateway-backed native tools 重新优先走 Aster registry execution，或在 `agent-compat` 恢复 gateway DTO / permission / result projection owner；`compat blocker` = Aster extension manager / MCP source adapter 和通用 `ToolRegistry` fallback。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent --package aster-core -- --check`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime gateway_dispatch_execution --lib -j 1 -- --nocapture`，`4 passed`；隔离 target `.lime/cargo-target/gateway-dispatch-execution` 复跑同命令也为 `4 passed`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent gateway_bridge --lib -j 1 -- --nocapture`，`3 passed`（默认 target）。
- `blocked`：继续用隔离 target 复跑 `lime-agent gateway_bridge` 时本机磁盘仅剩约 `369MiB`，编译 `time` crate 阶段因 `No space left on device` 中止；环境限制未解除前不扩大 Rust 校验。
- `remaining`：R4 仍未完成；gateway-backed execution、Skill definition / execution hook 和模型可见壳已迁出并守住，剩余是 MCP bridge source adapter、真实 workspace sandbox backend、R2/R3 provider reply 最后一跳和 R5/R6 session/runtime source。

### 2026-07-10：R4 Skill execution native hook first slice

- `completed`：`lime-agent/src/tools/skill_tool_gate.rs::execute_current_skill_tool_request(...)` 在 `NativeToolExecutionHook` 中先于 live shell 与 Aster `registry.execute(...)` 接管 `Skill`，执行 `tool-runtime::skill_execute::run_skill_execution(...)`，并通过 `tool-runtime::tool_result_projection` 投影为 MCP `CallToolResult`。
- `completed`：`tool-runtime::skill_execute` 继续持有 session access gate、workspace skill source lookup、runtime contract preflight、参数 normalization 和 result metadata；`lime-agent` 只保留 provider bridge 和 hook 接线，不把这些规则复制回 Aster staging。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 Skill hook 在 `prepare_live_execution(...)` 前调用 current helper，并禁止恢复 Aster Skill registry / loader / executor surface。
- `classification`：`current` = `tool-runtime::skill_execute` + `lime-agent` native hook first slice；`dead / guarded` = Skill 执行重新优先走 Aster registry、恢复 `LimeSkillTool` Aster `Tool` trait wrapper，或在 `agent-compat` 恢复 Skill owner。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_tool_gate --lib -j 1 -- --nocapture`，`10 passed`；`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package tool-runtime --package aster-core -- --check`；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`175 passed`。
- `remaining`：R4 仍未完成；shell warning 已由 current guard 接管，下一刀优先迁 MCP source adapter 或真实 workspace sandbox backend，再删除 generic registry fallback。

### 2026-07-10：R4 MCP 不再挂入 Aster ToolRegistry

- `completed`：`agent-compat/src/tools/registry.rs` 删除 `McpToolWrapper`、`mcp_tools` 存储和 `register_mcp` / `unregister_mcp` / `contains_mcp` / `mcp_tool_count` / `mcp_tool_names` / `is_mcp` 等 MCP wrapper/query 面；`ToolRegistry` 退回只管理剩余 Aster native fallback。
- `completed`：删除无生产调用的 `Agent::register_mcp_tool(...)`；Agent 初始化不再把 `ExtensionManager` 塞进 `ToolRegistrationConfig`，避免 Aster registry 重新成为 MCP 工具事实源。
- `unchanged current`：MCP 模型可见工具仍由 `ExtensionManager::get_prefixed_tools(...)` 注入，MCP 执行仍由 `extension_manager.dispatch_tool_call(...)` 分发；App Server / inventory 继续消费 `lime-mcp` / `tool-runtime::mcp_resource` / `tool_runtime::tool_search` current 链。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `McpToolWrapper`、registry MCP register/query API，且要求 reply loop MCP 执行继续走 `extension_manager.dispatch_tool_call`。
- `classification`：`current` = `ExtensionManager` / `lime-mcp` / App Server MCP gateway / `tool-runtime::{mcp_resource,tool_search}`；`dead / guarded` = Aster `ToolRegistry` MCP wrapper/register/query 面；`compat blocker` = Aster extension manager / MCP client bridge 仍是 reply-loop source adapter。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check`；`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/mcp-registry-owner-current" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2`，仅有既有 `NativeRegistration::name` unused warning；`npx prettier --check ...`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`；scoped `git diff --check` 通过。
- `remaining`：R4 仍未完成；MCP bridge 仍需继续向 `lime-mcp` / current gateway 迁出，真实 workspace sandbox backend、R2/R3 provider reply exit source 和 R5/R6 session/runtime source 仍阻塞 root `aster` dependency 删除。

### 2026-07-10：R4 Bash / PowerShell background 启动迁入 tool-runtime

- `completed`：`tool-runtime::shell_execution` 直接处理 Bash `background: true` 与 PowerShell `run_in_background: true`，生成 task id，创建 `std::env::temp_dir()/agent_tasks/<task_id>.log`，异步监控 stdout/stderr，并返回 `task_id` / `output_file` / `background=true` metadata。
- `completed`：后台 shell 使用 `AGENT_BACKGROUND=1`，`asterMigrationBoundary.test.ts` 禁止 `ASTER_BACKGROUND` 回流；现有模型可见面只返回 output file，日志读取继续走 current Read / file read owner，本刀不新增 query/kill tool surface。
- `classification`：`current` = `tool-runtime::shell_execution` foreground + background shell owner；`dead / guarded` = background shell 重新 fallback Aster registry 或恢复 Aster `TaskManager` 作为 owner；`compat blocker` = 真实 workspace sandbox backend、MCP extension bridge / source adapter。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime shell_execution --lib -j 1 -- --nocapture`，`7 passed`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package aster-core --package lime-agent -- --check`；`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2`，仅有既有 `NativeRegistration::name` unused warning；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`173 passed`。
- `remaining`：R4 仍未完成；真实 workspace sandbox backend、MCP bridge source adapter、R2/R3 provider reply exit source 与 R5/R6 session/runtime source 仍阻塞 root `aster` dependency 删除。

### 2026-07-10：R4 workspace sandbox shell 不再回落 Aster stub

- `completed`：`tool-runtime::shell_execution` 在 `RuntimeShellToolRequest.has_workspace_sandbox=true` 时直接返回 current guard result，不再 `return None` 触发 Aster `registry.execute(...)` fallback。
- `completed`：current guard 返回 `is_error=true`、`execution_surface=current_workspace_sandbox_guard`、`reasonCode=workspace_sandbox_current_executor_missing`、`failureCategory=sandbox_blocked` 和 shell/cwd/command metadata；旧 Aster sandbox executor 是空成功 stub，不能继续作为生产执行证据。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `workspace_sandbox_shell_result` / `current_workspace_sandbox_guard` 存在，并禁止恢复 `if request.has_workspace_sandbox { return None; }`。
- `classification`：`current` = `tool-runtime::shell_execution` workspace sandbox fail-closed guard；`dead / guarded` = workspace sandbox shell 重新回 Aster registry 或 Aster sandbox stub 空成功；`compat blocker` = 真实 workspace sandbox backend 仍未实现，MCP bridge source adapter 仍待迁出。
- `Thread / Turn / Item`：workspace sandbox shell 属于 Turn tool execution / sandbox policy 执行边界；Item/read model 只消费 current projected tool result 和 policy evidence，不再把 Aster `SandboxConfig::None` 当执行事实。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime shell_execution --lib -j 1 -- --nocapture`，`8 passed`；`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 1`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`175 passed`。
- `remaining`：R4 仍未完成；shell warning 已由 current guard 接管，下一刀应优先把 MCP source adapter 或真实 workspace sandbox backend 继续迁出，再删除 Aster `BashTool` / `PowerShellTool` 和通用 `ToolRegistry` fallback。

### 2026-07-10：R4 Skill live hook Aster 类型边界收缩

- `completed`：`lime-agent/src/tools/skill_tool_gate.rs::execute_current_skill_tool_request(...)` 不再接收 Aster `NativeToolExecutionRequest`，也不再返回 Aster `ToolCallResult`；该 helper 只消费 `tool_name` / `params` / `ToolContext` 并返回 current rmcp `CallToolResult` future。
- `completed`：Aster live execution hook 类型被收回 `lime-agent/src/live_execution_process.rs` 唯一 adapter；adapter 负责把 current Skill future 包装成 Aster `ToolCallResult`，`skill_tool_gate` 只保留 Skill gate / execution current owner 调用和 provider bridge。
- `guarded`：`asterMigrationBoundary.test.ts` 已通过 `175 passed`，继续要求 `NativeToolExecutionHook` / `NativeToolExecutionRequest` / `ToolCallResult` 只能出现在 live execution process adapter。
- `classification`：`current` = `tool-runtime::skill_gate` / `skill_execute` + `lime-skills` runner；`compat blocker` = `CurrentSessionSkillProvider` 仍通过 Aster provider trait 发 LLM call，退出条件是 R2/R3 provider backend 迁出；`dead / guarded` = `LimeSkillTool` Aster `Tool` trait wrapper、Skill gate helper 重新接收 Aster native hook request/result 类型。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_tool_gate --lib -j 1 -- --nocapture`，`10 passed`；`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 1`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`175 passed`。
- `remaining`：R4 Skill Aster `Tool` trait wrapper 已删除；剩余 Skill blocker 只剩 provider bridge，随 R2/R3 provider backend 迁出后删除。

### 2026-07-10：R4 Read / Glob / Grep 前台执行迁入 tool-runtime

- `completed`：新增 `tool-runtime::file_read_execution::{RuntimeFileReadRequest, execute_runtime_file_read_tool(...)}`，承接 Read 的路径解析、文本行号读取、文档预览、SVG 文本读取、Notebook 文本读取、图片 / PDF retired fail-closed 与结果 metadata projection；`agent-compat/src/agents/agent.rs` 只把 Aster `ToolContext` 适配给 current owner。
- `completed`：新增 `tool-runtime::file_search_execution::{RuntimeFileSearchRequest, execute_runtime_file_search_tool(...)}`，承接 Glob 按 mtime 排序 / exclude / max_results 和 Grep content / files_with_matches / count 三种模式、regex parse、hidden 文件策略、binary skip、结果截断与 metadata projection。
- `completed`：reply loop native branch 顺序固定为 live-execution hook -> collab current executor -> shell current executor -> file read current executor -> file search current executor -> native dispatch current executor -> Aster `registry.execute(...)` fallback。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `file_read_execution` / `file_search_execution` owner 存在且不 import Aster，要求 `agent.rs` 在 registry fallback 前调用 current read/search executor，并禁止 `agent.rs` 恢复本地 Read / Glob / Grep 执行 owner。
- `classification`：`current` = `tool-runtime::{file_read_execution,file_search_execution}`；`compat blocker` = Aster `Tool` trait 壳、ToolRegistry fallback、MCP 与真实 workspace sandbox backend；`dead / guarded` = Aster Read image/PDF multimodal payload、`agent-compat` 本地文件读取 / 搜索执行 owner。
- `Thread / Turn / Item`：Read/Glob/Grep 属于 Turn tool execution；Item/read model 只消费 materialized tool result / metadata，不再从 Aster search/read implementation 推断执行状态。
- `passed`：`rustfmt --edition 2021 --config skip_children=true --check "lime-rs/crates/tool-runtime/src/file_read_execution.rs" "lime-rs/crates/tool-runtime/src/file_search_execution.rs" "lime-rs/crates/tool-runtime/src/lib.rs" "lime-rs/crates/agent-compat/src/agents/agent.rs"`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/file-search-execution" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime file_read_execution --lib -j 2 -- --nocapture`，`3 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime file_search_execution --lib -j 2 -- --nocapture`，`3 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2 -- --nocapture`，`81 passed`。
- `remaining`：R4 仍未完成；MCP、真实 workspace sandbox backend、Aster `Tool` trait 壳、R2/R3 provider reply exit source 与 R5/R6 session/runtime source 仍阻塞 root `aster` dependency 删除。

### 2026-07-10：R4 Read / Glob / Grep Aster Tool 壳删除

- `completed`：删除 `agent-compat/src/tools/file/{mod.rs,read.rs}` 与 `agent-compat/src/tools/search/{mod.rs,glob.rs,grep.rs}`；`agent-compat/src/tools/mod.rs` 不再注册 `ReadTool` / `GlobTool` / `GrepTool`，也不再保留 `SharedFileReadHistory`。
- `completed`：`agent-compat/Cargo.toml` 删除旧 ReadTool 专用 `document-preview` path dependency；document preview 只由 current `tool-runtime::file_read_execution` 直接消费。
- `completed`：`agent-compat/src/agents/agent.rs` 的 model-visible definitions 和 canonical lookup 改由 `tool-runtime::{file_read_execution,file_search_execution}` 提供；list/execute 主链继续在 Aster registry fallback 前走 current owner。
- `guarded`：`asterMigrationBoundary.test.ts` 将上述文件加入 forbidden-to-restore，并禁止恢复 `ReadTool` / `GlobTool` / `GrepTool` / `SharedFileReadHistory` / `config.allows_tool("Read|Glob|Grep")`；同时要求 current owner 暴露 `file_read_tool_definition` / `file_search_tool_definition` 与 canonical helper。
- `classification`：`current` = `tool-runtime::{file_read_execution,file_search_execution}`；`dead / deleted / guarded` = Aster Read/Glob/Grep `Tool` trait 壳、旧 file/search 模块和 `document-preview` burn-down 依赖；`compat blocker` = R4 剩余 MCP、真实 workspace sandbox backend 与通用 `ToolRegistry` fallback。
- `Thread / Turn / Item`：Read/Glob/Grep 继续属于 Turn tool execution；Thread 只提供 cwd/session context；Item/read model 只消费 current projected tool result / metadata。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=1 CARGO_TARGET_DIR=".lime/cargo-target/read-search-current" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 1` 通过。
- `passed`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 1` 通过。
- `remaining`：R4 未完成；下一刀应继续迁 MCP、真实 workspace sandbox backend 或转入 R2/R3 provider reply exit source，不能因 Read/Glob/Grep 清完就宣称 root `aster` dependency 可删。

### 2026-07-10：R4 TaskManager facade 收缩

- `completed`：`agent-compat/src/tools/mod.rs` 将 `TaskManager` 从 `pub use task::TaskManager` 收成内部 `use task::TaskManager`；它只服务 Bash / PowerShell 背景执行旧 fallback，不再作为 Aster tools facade surface。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `pub use task::TaskManager;`，并要求 `TaskManager` 只作为内部 import 留在 `tools/mod.rs`。
- `classification`：`dead / guarded` = Aster tools facade 的 `TaskManager` re-export；`compat blocker` = background shell 旧 task manager 本体仍被 Bash / PowerShell fallback 使用；`current` = 前台 shell execution 已归 `tool-runtime::shell_execution`。
- `remaining`：该历史刀当时不改变 background shell / sandbox shell / approval warning fallback 状态；当前 background、sandbox guard 与 warning guard 均已由 `tool-runtime::shell_execution` 接管，删除 `task.rs` 前仍需确认没有剩余 shell registry execution 依赖。

### 2026-07-10：R4 shell terminal marker 命名统一

- `completed`：将 current live shell process、tool orchestrator、Aster remaining shell fallback 和 background task helper 的环境标记从 `ASTER_TERMINAL=1` 统一为 `AGENT_TERMINAL=1`。
- `guarded`：`asterMigrationBoundary.test.ts` 扫描 `tool-runtime::shell_execution`、`agent/src/live_execution_process.rs`、`agent_tools/tool_orchestrator.rs`、`agent-compat` shell fallback 文件，禁止恢复 `ASTER_TERMINAL`。
- `classification`：`current` = `AGENT_TERMINAL` shell execution marker；`dead / guarded` = `ASTER_TERMINAL` 命名；`compat blocker` = Bash / PowerShell remaining fallback 本体仍待迁出。
- `passed`：`rustfmt --edition 2021 --check` 覆盖 live shell process、tool orchestrator 与 remaining shell fallback 文件。
- `passed`：复用 `.lime/cargo-target/read-search-current` 跑 `cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 1` 与 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 1` 均通过。
- `remaining`：命名统一不等于 R4 shell 完成；background、sandbox guard 与 warning approval guard 已迁到 current owner，后续仍需删除 Aster `BashTool` / `PowerShellTool` 壳和 generic registry fallback。

### 2026-07-10：R4 tool exposure / registration gate 前移到 tool-runtime

- `completed`：`tool-runtime::turn_tool_surface` 承接 resource-gated MCP tools、PowerShell registration gate、subagent native/coordination/team tool allowlist 和 extension-prefixed tool exposure policy。
- `completed`：`agent-compat/src/agents/agent.rs` 删除本地 `RESOURCE_GATED_TOOL_NAMES`、`SUBAGENT_ALLOWED_*`、`is_extension_prefixed_tool(...)` 等纯规则，只把 Aster `SessionType`、resource support 和 team state 适配给 current helper。
- `completed`：`agent-compat/src/tools/mod.rs` 删除本地 `CurrentSurfaceToolGates` / env parser / registration gate，只保留 Aster `ToolRegistry` 注册壳。
- `completed`：验证暴露出的零引用 `SessionPlanModeState` session root re-export 已移除；Aster plan-mode tool 已退场，不再通过 session extension public surface 续命。
- `classification`：`current` = `tool-runtime` tool exposure / registration gate policy；`compat blocker` = Aster `ToolRegistry` / `Tool` / `ToolContext` 和 Aster `SessionType` source adapter；`dead / guarded` = `agent-compat` 本地 resource gate、subagent allowlist、PowerShell gate owner 和 `SessionPlanModeState` public re-export。
- `Thread / Turn / Item`：Turn tool lifecycle 负责决定工具可见性和注册 gate；Aster staging 只在 reply loop 未迁完前提供工具列表 source adapter。
- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/tool-runtime/src/turn_tool_surface.rs" "lime-rs/crates/agent-compat/src/agents/agent.rs" "lime-rs/crates/agent-compat/src/tools/mod.rs" "lime-rs/crates/agent-compat/src/session/mod.rs"`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/turn-tool-exposure-tool-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime turn_tool_surface --lib -j 1 -- --nocapture`，`8 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `passed`：`npx prettier --check ...` 与 `git diff --check -- ...`。
- `remaining`：R4 仍未完成；foreground shell、Read/Grep/Glob 与 request_user_input 后续已迁到 `tool-runtime`，Skill/gateway-backed/MCP、background / sandbox shell 和 R2/R3 provider/reply loop 最后一跳仍待迁出。

### 2026-07-10：R4 标准 native dispatch 执行前移到 tool-runtime

- `completed`：`tool-runtime::native_overlay` 新增 `runtime_native_tool_overlay_for_dispatch_name(...)`，以 current `native_dispatch` canonical lookup 反查 dispatch-backed overlay，避免在 `agent-compat` 复制工具名匹配表。
- `completed`：`agent-compat/src/agents/agent.rs` 的 reply loop native tool branch 在 live-execution hook 之后，先对 dispatch-backed 标准 native tools 执行 `tool-runtime` current permission preflight，再调用 `runtime_native_dispatch_handle()`；Aster registry 只作为未迁完工具的 fallback。
- `completed`：`tool-runtime::native_dispatch_execution` 进一步承接 dispatch-backed 标准工具的接管、permission preflight、cancel fail-fast、current dispatcher 调用和 `CallToolResult` 投影；`agent-compat/src/agents/agent.rs` 只剩 Aster `ToolContext` / current turn context 到 `RuntimeNativeDispatchToolRequest` 的薄适配。
- `Codex 对照`：Codex `stream_events_utils.rs` 在 response item done 后构造 `ToolCall` 并交给 `ToolCallRuntime::handle_tool_call(...)`，工具 spec/runtime 绑定在 router/executor contract 内；本刀把 Lime reply loop 标准 native tools 朝同一 Turn-owned dispatch 形状迁移。
- `classification`：`current` = `tool-runtime::native_dispatch`、`tool-runtime::native_dispatch_execution`、`tool-runtime::native_overlay::runtime_native_tool_overlay_for_dispatch_name(...)` 与 current permission preflight；`compat blocker` = Skill、gateway-backed tools、MCP dispatch、background / sandbox shell 和 Aster registry fallback；`dead / guarded` = 标准 native tools 重新先走 `registry.execute(...)`，或在 `agent-compat` 恢复工具名到 overlay 的本地匹配表 / dispatch permission 编排。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package aster-core -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/native-dispatch-reply-loop-tool-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 1 -- --nocapture`，`13 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-image-input-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`rustfmt --edition 2021 --config skip_children=true --check "lime-rs/crates/tool-runtime/src/native_dispatch_execution.rs" "lime-rs/crates/tool-runtime/src/lib.rs" "lime-rs/crates/agent-compat/src/agents/agent.rs"`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_dispatch_execution --lib -j 2 -- --nocapture`，`2 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `remaining`：R4 仍未完成；root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster `ToolRegistry` / `Tool` trait fallback、provider/reply loop 最后一跳和 session/event source 仍是 Phase 6 blocker。

### 2026-07-10：R4 request_user_input tool surface / execution 前移到 tool-runtime

- `completed`：`tool-runtime::request_user_input` current owner 使用 `RequestUserInputRequest` / `RequestUserInputQuestion` / `RequestUserInputOption` 命名，承接 `request_user_input` 工具名、输入 schema、DTO、解析、current surface 校验、requested schema、`RequestUserInputCallback`、model-visible definition 与 reply-loop execution helper；response extraction / elicitation schema 拆到 `request_user_input/response.rs`，execution 拆到 `request_user_input/execution.rs`，主文件降到 `672` 行。
- `completed`：`agent-runtime::request_user_input` 删除本地 DTO/schema/response helper，只 re-export current tool surface helper / callback 类型，并保留 `RequestUserInputRunRequest`、`RequestUserInputAction`、`RequestUserInputGateway` 与 `run_request_user_input(...)` 作为 Turn-side runner。
- `completed`：`agent-compat/src/tools/ask.rs` 已删除，`agent-compat/src/tools/mod.rs::register_all_tools(...)` 不再注册 Aster `AskTool`；reply loop 在 registry fallback 前直接调用 `tool-runtime::request_user_input::execute_request_user_input(...)`，`list_tools` 从 `request_user_input_tool_definition()` 注入模型可见工具；`Agent::new()` / `Agent::with_tool_config(...)` 不再创建隐式默认 request_user_input callback，生产入口必须由 `lime-agent/src/request_user_input_bridge.rs` 显式注入。
- `completed`：`tool-runtime::native_overlay::runtime_native_tool_registration_allowlist()` 从旧 `"Ask"` 迁到 `request_user_input`，避免 Lime 默认 `ToolRegistrationConfig` 继续用旧名控制 current 工具曝光。
- `guarded`：`asterMigrationBoundary.test.ts` 新增守卫，要求 `tool-runtime::request_user_input` 持有 tool-surface / definition / execution helpers、`agent-runtime::request_user_input` 消费 current owner，并禁止 Aster AskTool 文件、注册、DTO/schema/parse/validation/normalization/execution owner 恢复。
- `classification`：`current` = `tool-runtime::request_user_input` + `agent-runtime::request_user_input` runner；`compat blocker` = `agent-compat` 的显式 callback 配置字段、`lime-agent/src/request_user_input_bridge.rs` 到 `ActionRequiredManager` 的 scope adapter；`dead / deleted / guarded` = `agent-compat/src/tools/ask.rs`、Aster `AskTool` trait 壳、旧 `AskRequest` / `AskCallback` 命名与旧 `"Ask"` allowlist 名。
- `Thread / Turn / Item`：Turn 拥有 request_user_input action lifecycle 与 response normalization；Thread / Item 只消费 action_required / answer read model 和 evidence projection；不把 Aster `AskTool` 当 current 用户输入 owner。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime request_user_input --lib -j 1 -- --nocapture`，`8 passed`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime request_user_input --lib -j 1 -- --nocapture`，`4 passed`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_user_input_bridge --lib -j 1 -- --nocapture`，`3 passed`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`rustfmt --edition 2021 --check` 覆盖本轮 request_user_input Rust 写集。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "internal/exec-plans/aster-phase6-provider-reply-backend-plan.md" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `passed`：Gate A `LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:agent-runtime-current-fixture` 完整通过，覆盖 approval resume/decline/cancel/full-access no prompt、Inputbar restore/pending steer、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、media reference 与 Content Factory Article Editor，`liveProviderUsed=false`。
- `passed`：Gate B Electron CDP `approval-request-full-access`：`LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:claw-chat-current-fixture -- --scenario approval-request-full-access --timeout-ms 240000 --cdp-port 9232 --prefix claw-chat-current-fixture-approval-full-access-request-user-input-r4 --evidence-dir ".lime/qc/gui-evidence/claw-chat-current-fixture"`；summary 为 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-approval-full-access-request-user-input-r4-summary.json`。
- `remaining`：R4 仍未完成；foreground shell、Read/Grep/Glob 和 request_user_input 已迁到 `tool-runtime`，Skill、gateway-backed tools、MCP / extension bridge、background / sandbox shell 与 Aster `ToolRegistry` fallback 仍待迁出，root `aster` dependency 不能删除。

### 2026-07-10：Fast A2 action/session-context/permission 顶层 public surface 收缩

- `completed`：`agent-compat/src/lib.rs` 将 `action_required_manager`、`session_context`、`permission` 从 `pub mod` 收缩为 private module；外部生产引用改为 root `aster::ActionRequiredManager`、`aster::{current_session_id, current_turn_context, with_turn_context, ...}` 与 `aster::{Permission, PermissionConfirmation, PrincipalType}`。
- `completed`：`permission/mod.rs` 删除不再使用的 public/crate-private alias，只保留 root re-export 仍需的 permission confirmation 三类型；permission inspector / judge / store 继续作为 staging 内部实现。
- `guarded`：`asterMigrationBoundary.test.ts` 新增守卫，禁止恢复 `pub mod action_required_manager` / `pub mod session_context` / `pub mod permission`，并禁止 `lime-agent` 继续穿透 `aster::action_required_manager` / `aster::session_context` / `aster::permission` 子模块路径。
- `classification`：`compat blocker` = action-required queue、turn/session task-local context 与 permission confirmation 三类型仍服务 R2/R4/R7 未迁完边界；`dead / guarded` = 这些 Aster 顶层 public module surface；`current` = App Server RuntimeCore pending action、Thread/Turn context、`tool-runtime::execution_approval`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-root-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2`；仍有既有 `NativeRegistration::name` unused warning。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`170 passed`。
- `next`：继续收 Fast A/B 小 surface 或回到 R4 native registry / R2 provider trait object；这刀不改变 root `aster` dependency 删除条件。

### 2026-07-10：Fast A2 conversation/model/recipe/tool_inspection public surface 收缩

- `completed`：`agent-compat/src/conversation/mod.rs` 将 `message` 从 public module 收缩为 crate-private staging；`lime-agent` 外部引用从 `aster::conversation::message::*` 批量改为 `aster::conversation::{...}` 最小 re-export。
- `completed`：`agent-compat/src/lib.rs` 将 `model`、`recipe`、`tool_inspection` 从 `pub mod` 收缩为 private module；外部生产引用改为 root `aster::ModelConfig`、`aster::Recipe`、`aster::{InspectionAction, InspectionResult, ToolInspector}` 等过渡面。
- `guarded`：`asterMigrationBoundary.test.ts` 新增守卫，禁止恢复 `pub mod message`、`pub mod model`、`pub mod recipe`、`pub mod tool_inspection`，并禁止 `lime-agent` 继续穿透 `aster::conversation::message` / `aster::model` / `aster::recipe` / `aster::tool_inspection` 子模块路径。
- `classification`：`compat blocker` = Aster `Message` / `Conversation` / `ModelConfig` / `Recipe` / tool inspection DTO 仍服务 R2/R5/R6 未迁完边界；`dead / guarded` = 这些 Aster 子模块 public API surface；`current` = 后续应继续向 Thread / Turn / Item、`agent-protocol`、`model-provider`、`tool-runtime` 和 App Server read model 迁出。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-conversation-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2`；仍有既有 `NativeRegistration::name` unused warning。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`168 passed`。
- `next`：继续按 Fast A/B/C 清掉可 crate-private / 可删的小 surface；R2/R3 provider trait object、R4 native tool registry 与 R5/R6 session/runtime store 仍是核心 blocker。

### 2026-07-10：Fast A2 tools/session 子模块 public surface 收缩

- `completed`：`agent-compat/src/tools/mod.rs` 将 `base`、`context`、`error`、`registry`、`task`、`bash`、`file`、`powershell_tool`、`search`、`team_tools` 从 `pub mod` 收缩为 `pub(crate) mod`，后续已删除 `ask` 模块；外部生产引用改为 `aster::tools::{...}` root 最小 re-export，`aster::tools::ask::*` 子模块路径清零。
- `completed`：`agent-compat/src/tools/file/mod.rs` 只保留 crate-private `read` 实现模块并继续 root re-export `ReadTool` / read history；`agent-compat/src/tools/search/mod.rs` 只保留 crate-private `glob` / `grep` 实现模块并继续 root re-export `GlobTool` / `GrepTool` / `SearchResult`。
- `completed`：删除零引用 `agent-compat/src/tools/file/diff_summary.rs` 与 `agent-compat/src/tools/search/ripgrep.rs`；文件改动摘要已由 current apply_patch /前端 file-change projection 承接，搜索执行不使用这套 vendored ripgrep helper。
- `completed`：`agent-compat/src/session/mod.rs` 将 `extension_data` / `session_manager` 收缩为 private module；外部生产引用改为 root `aster::session::ExtensionData`，不再暴露 `aster::session::extension_data::*` 子模块路径。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 tools/session 子模块 root re-export 守卫，禁止恢复 `aster::tools::<module>` / `aster::session::extension_data` public surface，并禁止恢复 `diff_summary` / `ripgrep` helper。
- `classification`：`dead / deleted / guarded` = Aster file diff summary helper、vendored ripgrep helper、工具/会话实现子模块 public API；`compat blocker` = Aster reply loop 未迁完前仍保留 root `Tool` / `ToolRegistry` / `ToolContext` / `SessionStore` / `ThreadRuntimeStore` 最小面；`current` = `tool-runtime` tool execution / dispatch、apply_patch、current search/file projection 与 Thread/App Server session owner。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-tools-public-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-tools-public-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2`；仍有既有 `NativeRegistration::name` unused warning。
- `next`：继续扫 `agents` / `session` / `tools` 中剩余可删 DTO 或单点 adapter；R2/R3 provider trait object、R4 native tool registry 与 R5/R6 runtime store 仍后置集中处理。

### 2026-07-10：Fast A2 permission 子模块 public surface 收缩

- `completed`：`agent-compat/src/permission/mod.rs` 将 `permission_confirmation`、`permission_inspector`、`permission_judge`、`permission_store` 从 `pub mod` 收缩为 `pub(crate) mod`；外部生产引用扫描只剩 `aster::permission::{Permission, PermissionConfirmation, PrincipalType}` root re-export。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 permission staging 守卫，禁止恢复 `aster::permission::permission_*` public API，同时保留 permission root 最小 re-export。
- `classification`：`dead / guarded` = Aster permission 子模块 public API；`compat blocker` = Aster reply loop 未迁完前的最小 permission confirmation / inspector / judge / store staging；`current` = App Server RuntimeCore pending action、`agentSession/action/respond`、`tool-runtime::execution_approval`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2`；仍有既有 `NativeRegistration::name` unused warning。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`165 passed`。
- `next`：继续扫 `tools` / `session` / `agents` 中可 crate-private / 可删的小 public surface；permission 最小 staging 最终随 R4 reply loop native tool execution 迁出后删除。

### 2026-07-10：Fast A2 config public surface 收缩

- `completed`：`agent-compat/src/config/mod.rs` 中除 `paths` 外的内部模块从 `pub mod` 收缩为 `pub(crate) mod`，`Config`、`ConfigError`、`AsterMode`、`PermissionManager`、`DeclarativeProviderConfig`、extension config helper 等 re-export 从 public API 收缩为 crate-private。
- `completed`：删除未使用的 extension config re-export，保留仍被 staging 内部使用的 `get_all_extensions` / `get_extension_by_name` crate-private re-export；外部生产引用只剩 `aster::config::paths::initialized_path_root()`。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 config staging 守卫，禁止除 `paths` 外恢复 `aster::config::*` public modules / public re-export。
- `classification`：`dead / guarded` = Aster config public API surface；`compat blocker` = `config::paths` 仍被 session/runtime store adapter 读取 path root；`current` = provider/settings/config UI/API 后续必须进入 Lime current provider/settings/App Server 主链。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2`；仍有既有 `NativeRegistration::name` unused warning。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`164 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 与 scoped `git diff --check`。
- `next`：继续扫可 crate-private / 可删的小 public surface；`config::paths` 最终随 R5/R6 session/runtime store adapter 迁出后删除。

### 2026-07-10：Fast A2 provider concrete public surface 收缩

- `completed`：`agent-compat/src/providers/mod.rs` 中 concrete provider implementation / helper modules 从 `pub mod` 收缩为 `pub(crate) mod`，包括 OpenAI / Anthropic / Google / Ollama / OpenRouter / Codex 等具体实现与 `provider_registry`、`api_client`、`utils`、`usage_estimator` 等内部 helper；对外只保留 R2/R3 未迁完前必需的 `base`、`errors`、`formats` 和 factory exports。
- `completed`：`agent-compat/src/providers/formats/mod.rs` 中 provider-specific wire-format helper 从 `pub mod` 收缩为 `pub(crate) mod`；`formats::openai_responses` 暂时保留 public，因为 `lime-agent` 的 Aster reply stream adapter 仍消费 notification payload helper。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 concrete provider public surface 守卫，禁止恢复 `aster::providers::<provider>` 与 provider-specific `formats::<provider>` public API；provider current owner 固定为 `model-provider`。
- `classification`：`compat blocker` = R2/R3 provider reply source、Aster provider trait object、`reply_with_provider(...)` 最后一跳；`dead / guarded` = concrete provider implementation public API；`current` = 后续 provider backend / connection test / stream execution 必须进入 `model-provider` / App Server current 主链。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2`；仍有既有 `NativeRegistration::name` unused warning。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`162 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `passed`：scoped `git diff --check` 覆盖本批 provider module / governance test 写集。
- `next`：继续按“未使用先删、简单先迁、复杂后置”，优先再扫可 crate-private / 可删的小 public surface；不要在 R2/R3 未动完前把 concrete provider implementation 误报为已迁到 current。

### 2026-07-10：Fast C turn tool surface / scope policy 前移到 tool-runtime

- `completed`：新增 `tool-runtime::turn_tool_surface`，承接 `direct_answer` / `local_workspace` / `compact_tools` 工具面、turn-scoped allowed / disallowed tools、prompt guidance、extension prompt context 与 workspace hints 判定。
- `completed`：`agent-compat/src/agents/reply_parts.rs` 删除本地 tool surface / scope parser 和 prompt policy，只保留 current turn metadata 读取、Aster `ToolRegistry::canonical_name(...)` alias resolver 适配，以及 `Vec<rmcp::model::Tool>` 过滤调用。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tool-runtime/src/turn_tool_surface.rs` 持有 `RuntimeTurnToolSurfaceMode` / `RuntimeTurnToolScope` 和 allow/scope helper，并禁止 `reply_parts.rs` 恢复 `normalize_turn_metadata_tool_list`、`matches_turn_tool_scope`、本地 tool surface 常量或 prompt policy。
- `classification`：`current` = `tool-runtime` turn tool surface / scope policy；`compat blocker` = Aster `ToolRegistry` / rmcp `Tool` 仍是未迁 reply loop 的 tool source adapter；`dead / guarded` = `agent-compat` 本地 turn tool surface/scope 纯策略。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/turn-tool-surface-tool-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime turn_tool_surface --lib -j 1 -- --nocapture`，`5 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-image-input-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`162 passed`。
- `next`：继续 Fast C/R4，优先迁出 native tool registry 执行壳，或回到 R2/R3 provider trait object execution 最后一跳；完成前 root `aster` dependency 仍不能删除。

### 2026-07-10：Fast C tool call surface normalization 前移到 tool-runtime

- `completed`：新增 `tool-runtime::tool_call_surface`，承接 available tool exact / case-insensitive match、canonical alias 结果落回当前 surface 名称、`Read` 的 `file_path` / `filePath` / `head` 参数 normalization，以及 `Glob` / `Grep` 的 `query -> pattern` normalization。
- `completed`：`agent-compat/src/agents/reply_parts.rs` 删除本地 `current_surface_tool_name`、`normalize_current_surface_tool_call`、`normalize_current_surface_tool_arguments`、`integer_argument` 和 `copy_string_argument_if_missing`；现在只把 Aster `ToolRegistry::canonical_name(...)` 与 `rmcp::CallToolRequestParam` 适配给 current helper。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 tool call surface normalization 守卫，要求 owner 位于 `tool-runtime`，禁止 `reply_parts.rs` 恢复本地工具名 / 参数 normalization helper。
- `classification`：`current` = `tool-runtime` tool call surface normalization；`compat blocker` = Aster `ToolRegistry` / rmcp `Tool` / reply loop native tool execution 仍是 source adapter；`dead / guarded` = `agent-compat` 本地工具调用 surface normalization。
- `Thread / Turn / Item`：Turn tool routing 负责把 provider 工具调用归一到当前 tool surface；Item/read model 不参与参数补齐；R4 未迁前仍通过 Aster native `Tool` trait 壳执行。
- `risk`：`agent-compat/src/agents/reply_parts.rs` 仍约 `1052` 行，本刀是继续削薄并迁出纯规则，不得把该 staging 文件作为新增 provider / tool / session 业务落点；下一刀应继续减少它或直接替换核心 blocker。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/tool-call-surface-tool-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime tool_call_surface --lib -j 1 -- --nocapture`，`5 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-image-input-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`164 passed`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package aster-core --package lime-agent -- --check`。
- `next`：继续 Fast C/R4，优先把 Aster reply loop native `ToolRegistry` / `Tool` trait 执行壳迁到 `tool-runtime::native_dispatch` / current gateway executor，或回到 R2/R3 删除 `ProviderReplyExitSource` 最后一跳。

### 2026-07-10：Fast C/R4 native tool result projection 前移到 tool-runtime

- `completed`：新增 `tool-runtime::tool_result_projection`，承接 Aster native `ToolResult` 字段到 MCP `CallToolResult` 的中立投影：success/error 文本选择、metadata -> `structured_content`、`model_visible_image` / `image_url` 模型可见图片内容附加、以及 `tool_surface_updated` 判定。
- `completed`：`agent-compat/src/agents/agent.rs` 删除本地 `native_tool_result_to_call_tool_result(...)`、`tool_surface_updated_from_call_tool_result(...)`、metadata fallback 和 model-visible image helper；现在只把 Aster `ToolResult` 字段搬到 `RuntimeToolResultParts` 后调用 current helper。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 native tool result projection 守卫，要求 owner 位于 `tool-runtime/src/tool_result_projection.rs`，并禁止 `agent.rs` 恢复本地 result projection helper。
- `classification`：`current` = `tool-runtime::tool_result_projection`；`compat blocker` = Aster `ToolRegistry::execute(...)` / `Tool` / `ToolContext` 仍服务 reply loop native tool execution；`dead / guarded` = `agent-compat` 本地 native tool result projection 纯规则。
- `Thread / Turn / Item`：Turn tool execution result projection 继续前移到 current owner；Item/read model 仍通过现有 Aster reply loop response adapter 暂时消费结果，R4 未迁前不能删除 native `ToolRegistry` 壳。
- `risk`：为避免 `tool_result.rs` 继续膨胀，新逻辑拆入 `tool_result_projection.rs`；`tool_result.rs` 当前约 `744` 行，新模块约 `204` 行。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package aster-core --package lime-agent -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/tool-result-projection-tool-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime tool_result_projection --lib -j 1 -- --nocapture`，`3 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-image-input-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`168 passed`。
- `next`：继续 R4，把 reply loop native execution 从 Aster `ToolRegistry::execute(...)` 替换为 `tool-runtime::native_dispatch` / current gateway executor；完成前 root `aster` dependency 和 `agent-compat` staging crate 仍不能删除。

### 2026-07-10：Fast B1 session/provider/tool 未使用 public surface 删除

- `completed`：删除 `agent-compat/src/session/{fork,resume,worktree}.rs` 并从 `session/mod.rs` 移除 re-export；Aster session fork/merge、summary cache resume 和 worktree extension public API 没有 Lime current/compat 生产调用，Codex-first Thread/App Server 主链不采用这套 `aster::session` API。
- `completed`：删除 `agent-compat/src/providers/{auto_detect,provider_test,testprovider}.rs` 并从 `providers/mod.rs` 移除 public module；provider live test / record-replay / API-key auto-detect 必须走 App Server / `model-provider` current 主链，不再保留 Aster helper。
- `completed`：删除 `agent-compat/src/tools/hooks.rs`，移除 `ToolRegistrationConfig::hooks_enabled`、`with_hooks_enabled(...)`、`ToolHookManager` re-export，并把 `register_all_tools(...)` / `register_default_tools(...)` 返回值收窄为 `SharedFileReadHistory`。Lime current hook owner 不在 Aster tool registry；本刀不改变实际 native tool 注册集。
- `completed`：删除空 `agent-compat/src/agents/snapshots` 目录；旧 Aster snapshot 正向测试面继续保持 deleted。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 session fork/resume/worktree、provider test/autodetect 和 Aster tool hook framework forbidden-to-restore guard。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster session fork / summary resume / worktree extension public API、Aster provider test / API-key auto-detect helpers、Aster tool hook framework、空 snapshots residual；`current` = branch/resume/worktree 后续必须进入 Thread / App Server / project_git owner，provider test 走 App Server / model-provider，hook 能力走 Lime owner；`compat blocker` = R2/R3 provider reply source、R4 native registry、R5/R6 session/runtime item source 未在本刀硬拆。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2`；仍有既有 `NativeRegistration::name` unused warning。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`161 passed`。
- `passed`：`npx prettier --check ...` 覆盖本批治理测试与 Aster 迁移文档。
- `passed`：scoped `git diff --check`；删除态扫描确认本批 Aster session/provider/tool hook surface 和空目录无回流。
- `next`：先验证本批删除，再继续扫仍无生产消费的小 surface；不为了清小项拆 `agent.rs`、`reply_parts.rs`、`tools/registry.rs`、`session/runtime_store.rs`。

### 2026-07-10：Provider notification classification 验证与 Agent reply surface 收缩

- `completed`：`model-provider::provider_stream::notification` 持有 current notification prefix、payload lookup 和 text classification helper；`agent-compat/src/agents/agent.rs` 与 `providers/formats/openai_responses.rs` 只消费 current helper，旧 `__aster_provider_stream_event__:` prefix 不兼容。
- `completed`：引用扫描确认 `Agent::reply(...)` 没有 Lime 外部生产调用，只被 `agent-compat` 内部 subagent staging adapter 使用；该 adapter 已直接调用 pinned-provider `reply_with_provider(...)`，`Agent::reply(...)` wrapper 已删除。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-compat::Agent::reply(...)` wrapper 不得恢复，subagent staging adapter 不得重新调用 `.reply(user_message...)`，旧 Aster notification prefix 不得恢复，`agent.rs` 不得重新 import / 使用 `is_provider_stream_event_notification`。
- `classification`：`current` = `model-provider` provider notification envelope / text classification；`dead / guarded` = `Agent::reply(...)` wrapper 与旧 Aster notification prefix；`compat blocker` = `ProviderReplyExitSource` / 私有 `run_provider_reply_exit_source(...)`、`reply_with_provider(...)` 最后一跳和 Aster internal reply loop。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core -- --check`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/exec-plans/aster-phase6-provider-reply-backend-plan.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "internal/roadmap/astermigration/README.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`161 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-notification-classification-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`42 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-notification-classification-aster-core" cargo test --manifest-path "lime-rs/Cargo.toml" -p aster-core responses_streaming_safety_buffering --lib -j 1 -- --nocapture`，`1 passed`，冷编耗时 `21m44s`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `next`：继续 R2/R3，把 `run_provider_reply_exit_source(...)` 内部 Aster provider trait object execution 替换为 current provider/reply backend；完成前 root `aster` dependency 和 `agent-compat` staging crate 仍不能删除。

### 2026-07-10：Fast B1 root context surface 删除与 context trace DTO 迁移

- `completed`：新增 `agent-protocol::context_trace::ContextTraceStep`，`lime-agent` 的 `AgentContextTraceStep` 改为 current DTO alias；App Server / 前端仍消费现有 `context_trace` / `context.trace` 主链，不通过 Aster root context DTO。
- `completed`：删除 `agent-compat/src/context/{mod.rs,trace.rs}` 和 root `pub mod context;`；Aster reply loop 未迁完前仅在 `aster::agents::ContextTraceStep` 事件边界保留最小 compat 字段类型，避免给 `agent-compat` 新增 `agent-protocol` 反向依赖。
- `completed`：清理 `agents/mod.rs` 中已删除 `subagent_scheduler` / `error_handling` 的墓碑注释；这类历史防回流职责交给治理守卫和路线图，不继续留在代码。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-compat/src/context/**`、root `pub mod context;`、`crate::context::ContextTraceStep` 和外部 `aster::context::ContextTraceStep` 不得恢复，并要求 `agent-protocol` 导出 `context_trace` current owner。
- `classification`：`current` = `agent-protocol::context_trace::ContextTraceStep` + App Server / 前端既有 `context_trace` projection 主链；`compat blocker` = Aster `AgentEvent::ContextTrace` 在 R2/R6 未迁完前仍携带最小 compat 字段类型；`dead / deleted / forbidden-to-restore` = Aster root context public module。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2`；仅剩既有 `NativeRegistration::name` test-only warning。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`158 passed`。
- `next`：继续按“未使用先删、简单先迁、复杂后置”清理 `agent-compat` public surface；R2/R3 provider reply source、R4 native registry、R5/R6 session/event source adapter 仍是核心 blocker。

### 2026-07-10：Fast B1 agent-compat inline 正向测试批量删除

- `completed`：批量删除 `agent-compat/src` 下 88 个 `#[cfg(test)] mod tests` 内联正向测试模块，约 `5.2` 万行旧 Aster staging 测试面不再留在生产 crate 源码中；保留少量 `#[cfg(test)]` helper/import 只是未编译到生产路径的残留，后续随对应文件删除。
- `guarded`：`asterMigrationBoundary.test.ts` 在原有 `agent-compat/tests/**`、`tests.rs` / `*_tests.rs` / `*_property_tests.rs` 守卫基础上，新增 inline `#[cfg(test)] mod tests {` forbidden-to-restore 扫描。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster staging crate 旧正向测试 evidence；`current` = 必要回归必须迁到 `agent-runtime`、`agent-protocol`、`model-provider`、`tool-runtime`、`thread-store` 或 App Server；`compat blocker` = 生产 reply/provider/tool/session 文件仍按 R2-R7 迁出或删除。
- `passed`：`rg -n "#\\[cfg\\(test\\)\\]\\s*mod\\s+tests\\s*\\{" "lime-rs/crates/agent-compat/src" -g "*.rs"` 无命中。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2`；仅剩既有 `NativeRegistration::name` test-only warning。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`158 passed`。
- `next`：继续清理无生产消费的 staging surface；不因旧测试被删而宣称 provider/reply loop、native registry 或 session/event adapter 完成。

### 2026-07-10：Fast A2 prompt snapshot 测试依赖删除

- `completed`：删除 `agent-compat/src/agents/prompt_manager.rs` 中的旧 `#[cfg(test)] mod tests` snapshot / unicode 正向测试、test-only `PromptManager::with_timestamp(...)` helper，以及 `agent-compat/Cargo.toml` 的 `insta` direct dependency。`insta` 在 `agent-compat` 内只服务旧 prompt snapshot 测试。
- `guarded`：`asterMigrationBoundary.test.ts` 的 snapshot 守卫从 `.snap.new` 产物扩展到 `insta =`、`assert_snapshot!`、`PromptManager::with_timestamp`，禁止恢复 Aster prompt snapshot 测试入口或依赖。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster prompt snapshot 正向测试 surface 和 `insta` 依赖；`compat blocker` = `PromptManager` 生产逻辑仍服务 Aster reply loop staging，后续随 R2/R7 迁出或删除；`current` = 需要的 prompt / unicode 回归必须迁到 `agent-runtime` / App Server / current owner tests。
- `next`：继续 Fast A/B，优先清 `agent-compat` 中只服务旧 tests 或 extension facade 的 surface；不硬拆 R2/R4/R7 核心链。

### 2026-07-10：Fast A2 agents public surface 与 snapshot 垃圾收口

- `completed`：扫描确认外部生产 `aster::agents::*` 仍需要 `Agent` / `AgentEvent`、`ExtensionConfig` / `McpClientTrait`、`AgentIdentity`、`SessionConfig`、provider trace event 和 `ToolCallResult` 等少数 compat 边界；`execute_commands`、`extension_malware_check`、`extension_manager_extension`、`final_output_tool`、`moim`、`prompt_manager`、`retry`、`subagent_handler`、`subagent_tool`、`types` 等无外部生产消费者的子模块从 `pub mod` 收缩为 `pub(crate) mod`。
- `completed`：删除 `agent-compat/src/agents/snapshots/*.snap.new` 三个 Aster prompt snapshot 更新产物；`agent-compat` 不再保留旧正向 snapshot evidence。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 agents public surface 守卫和 `.snap.new` 递归扫描，禁止恢复无消费者 re-export（`COMPACT_TRIGGERS`、`PromptManager`、`TaskConfig`）或 snapshot 更新产物。
- `classification`：`dead / guarded` = 无外部消费者的 Aster agents public API surface 与 prompt snapshot 产物；`compat blocker` = 仍被生产命中的 `Agent` / `AgentEvent` / MCP extension bridge / live execution hook / session config；`current` = 对应能力后续必须迁到 Thread / Turn / Item、`tool-runtime`、`lime-mcp`、`agent-runtime` 或 App Server。
- `next`：继续 Fast A/B；优先删 `agent-compat` 内剩余仅服务旧 tests / snapshot / extension facade 的 Aster-only surface，R2/R4/R7 核心链后置。

### 2026-07-10：Fast A2 Aster agent context / parallel / resume framework 删除

- `completed`：删除 `agent-compat/src/agents/{context,parallel,resume}/**` 共 10 个文件，移除 `agents/mod.rs` 中对应 `pub mod` 和 `pub use` re-export。外部 `aster::agents::*` 生产引用为 0。
- `guarded`：`asterMigrationBoundary.test.ts` 增加 Aster-only agent framework forbidden-to-restore guard，禁止恢复这些目录和 `AgentContextManager`、`ParallelAgentExecutor`、`AgentPool`、`AgentResumer`、`AgentStateManager`、`Checkpoint` 等 public surface。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster agent context inheritance/isolation、parallel executor/pool、checkpoint resume framework；`current` = 对应能力按 Codex-first 归 Thread / Turn / Item、App Server task orchestration、file checkpoint API 和 `agent-runtime`；`compat blocker` = R2/R4/R5/R6/R7 核心 reply/tool/session/event source 不在本刀硬拆。
- `next`：继续“未使用先删、简单先迁、复杂后置”；下一刀优先扫 `agents/mod.rs` 剩余 public modules 或 `tools` 里单点消费的小 DTO。

### 2026-07-10：R2/R3 provider plaintext tool-use parser 前移到 model-provider

- `completed`：新增 `model-provider::provider_stream::plaintext_tool_use`，承接 `<tool_use>` XML block、JSON code fence、`WebSearch` / `Search` inline alias、split-stream tool input delta progress 和 `plaintext_tool_use` provider source marker。
- `completed`：`agent-compat/src/agents/reply_parts.rs` 删除本地 plaintext parser，只把 Aster `MessageContent::Text` 投影成字符串并把 current DTO 装回临时 `CallToolRequestParam` / `MessageContent::ToolInputDelta`；不新增 `agent-compat` owner 依赖，也不把 staging 写成完成态。
- `guarded`：`asterMigrationBoundary.test.ts` 将 plaintext tool-use parser 纳入 provider stream owner 守卫，要求 helper 位于 `model-provider`，并禁止 `reply_parts.rs` 恢复 `PLAINTEXT_TOOL_USE_OPEN_MARKER`、XML attribute parser、JSON fence parser、tool-use name parser 和 tag scanner。
- `classification`：`current` = `model-provider` provider plaintext tool-use normalization / stream progress；`compat blocker` = Aster `Message` / `CallToolRequestParam` 仍是 provider/reply loop source adapter；`dead / guarded` = `agent-compat` 本地 plaintext tool-use parser。
- `Thread / Turn / Item`：provider owner 负责 provider 输出文本到结构化 tool-call/delta 的 normalization；Turn loop 暂时消费 current DTO 后落回 Aster source adapter，Item/read model 仍通过现有 response materializer 过渡。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-plaintext-tool-use-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`39 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`，冷编耗时 `24m01s`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`154 passed`。
- `next`：继续 Fast C，优先迁出 `reply_parts.rs` / `agent.rs` 中剩余 provider request/normalization 纯规则；不要把 `ProviderReplyExitSource` 或 Aster provider trait object 扩写成 current owner。

### 2026-07-10：R2/R3 provider image input policy 前移到 model-provider

- `completed`：新增 `model-provider::provider_stream::image_input`，承接 canonical model image modality lookup、turn runtime `image_input_policy` / `imageInputPolicy` 解析，以及是否省略 provider image input 的 current 判定。
- `completed`：`agent-compat/src/agents/reply_parts.rs` 不再直接 import `model_provider::canonical::maybe_get_canonical_model`，也不再本地维护 `image_input_policy` parser；它只从当前 turn 取 `lime_runtime` metadata，并把 Aster `MessageContent::Image` / rmcp image content 从 provider 请求前剥离。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 image input policy helper 位于 `model-provider::provider_stream`，要求 `reply_parts.rs` 消费 current helper，并禁止恢复本地 `model_config_supports_image_input(...)`、`image_input_policy_disables_provider_images(...)` 或 direct canonical lookup。
- `classification`：`current` = `model-provider` provider image input policy；`compat blocker` = Aster `Message` / `ToolResponse` 图片内容 source adapter；`dead / guarded` = `agent-compat` 本地 canonical image capability lookup / runtime image policy 判定。
- `Thread / Turn / Item`：provider owner 负责 provider 是否支持图片和 runtime image policy 组合判定；Turn adapter 暂时做 Aster message stripping；Item/read model 不消费 Aster image policy。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-image-input-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`42 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-image-input-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`，冷编耗时 `19m43s`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`157 passed`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core --package lime-agent -- --check`、`npx prettier --check ...`、`git diff --check -- ...`。
- `next`：继续 Fast C，优先迁出 `reply_parts.rs` / `agent.rs` 中剩余 provider request/normalization 纯规则；不要把 `ProviderReplyExitSource` 或 Aster provider trait object 扩写成 current owner。

### 2026-07-10：Fast A root `hooks` stub 删除

- `completed`：删除 `agent-compat/src/hooks/mod.rs` 和 root `pub mod hooks;`；`FrontmatterHooks` 已内联到唯一消费点 `tools/agent_control.rs`，只作为 delegation request DTO 字段存在。
- `guarded`：`asterMigrationBoundary.test.ts` 将 root `hooks` 加入 public surface / no-op stub forbidden-to-restore 清单，禁止恢复 `agent-compat/src/hooks/mod.rs`、root `pub mod hooks;` 或 `crate::hooks::FrontmatterHooks`。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster root hook public stub；`compat blocker` = `tools/hooks.rs` 仍作为剩余 tool hook / Write-Edit 负向守卫相关代码存在，本刀不误删 R4 tool registry staging。
- `next`：继续“未使用先删、简单先迁、复杂后置”；下一刀优先扫 `tools` / `session` 中仅剩单点消费的小 DTO 或已迁 helper，不硬拆 `sandbox` / native registry。

### 2026-07-10：Fast A2 recipe DTO 收缩与旧生成入口封禁

- `completed`：删除后的 `Agent::create_recipe(...)`、`Recipe::from_content(...)`、`Author`、`Settings`、`RecipeParameter*`、recipe builder `author/settings/parameters` 入口保持清零；`lime-agent` session store 测试 fixture 删除 `"author": null`、`"settings": null`、`"parameters": null` 旧字段。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 recipe DTO forbidden-to-restore guard，限定扫描 `recipe/mod.rs`、`agents/agent.rs` 和 `aster_session_store_tests.rs`，避免误伤 provider/tool schema 里的 `"parameters"` 语义。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster 从聊天生成本地 recipe、旧 recipe parser、author/settings/parameter metadata DTO；`compat blocker` = `Recipe` / `SubRecipe` 最小 DTO 仍服务 session metadata / subagent staging，等 R5/R6 session/event source 迁出后删除或迁入 current owner。
- `next`：继续“未使用先删、简单先迁、复杂后置”；优先扫 provider helper / tool registry 中可独立迁出或删除的简单项，R2/R3/R4/R5/R6/R7 仍按 Deferred Core 处理。

### 2026-07-10：Fast A1 `mcp_utils` / root `utils` 删除与 execution 骨架验证

- `completed`：删除 `agent-compat/src/mcp_utils.rs`，`agent-compat/src/lib.rs` 不再声明 `mod mcp_utils;`；原 `ToolResult<T>` / `ToolError` 历史别名改为各调用点直接使用 `rmcp::model::ErrorData` 的局部结果别名。
- `completed`：删除 `agent-compat/src/utils.rs`，`agent-compat/src/lib.rs` 不再声明 `mod utils;`；unicode tag 清洗拆到 `conversation::unicode_tags`，provider 文本截断拆到 `providers::utils::safe_truncate`，cancel token 判断收成 `agent.rs` 局部 helper。
- `completed`：删除空目录 `agent-compat/src/{hints,network}`，避免已删除 / 已迁 helper 继续制造残留误判。
- `completed`：team subagent 工具 surface 在删除 `AgentManager` 后改为显式 current callback-backed control surface；普通 SubAgent 仍隐藏 main-thread-only 工具，只有带 team membership/state 的 SubAgent 保留同步 nested subagent 所需 `Agent` surface。
- `guarded`：`asterMigrationBoundary.test.ts` 将 `mcp_utils.rs` 与 `utils.rs` 纳入 migrated helper forbidden-to-restore 清单，禁止恢复 `mod mcp_utils;`、`crate::mcp_utils`、`mcp_utils::ToolResult`、`mcp_utils::ToolError`、`mod utils;`、`crate::utils` 和旧 `sanitize_unicode_tags` / `contains_unicode_tags` / `is_token_cancelled` root helper。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster `mcp_utils` 历史别名模块、root `utils` 垃圾桶模块、空 `hints` / `network` residual 目录；`compat blocker` = R2-R7 provider/reply/tool/session 核心 blocker 不在本刀硬拆。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/aster-read-media-retired" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/aster-read-media-retired" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p aster-core team_subagent --lib -j 2 -- --nocapture`，`4 passed`。
- `next`：Fast A1 已收口；下一刀回到 Fast A2/Fast C，优先扫 `recipe` DTO / provider helper / tool registry 中仍能批量迁出或删除的简单项，复杂 R2-R7 后置集中处理。

### 2026-07-10：Fast A1 execution manager stub 删除

- `completed`：删除 `agent-compat/src/execution/**`，`agent-compat/src/lib.rs` 不再声明 `mod execution;`。
- `completed`：`agents/subagent_handler.rs` 不再通过 Aster `AgentManager::instance()` / `get_or_create_agent(...)` 创建子 agent，改为直接创建局部 `Agent::new()`；该路径本身仍是 Aster reply loop staging，不作为 current multi-agent owner。
- `completed`：`agents/agent.rs` 中两个 team subagent 测试不再依赖 `AgentManager::new_with_thread_runtime_store(...)`，直接验证 `Agent::new()` 的工具 surface 和 sync nested subagent error path。
- `guarded`：`asterMigrationBoundary.test.ts` 将 `agent-compat/src/execution` 纳入 no-op stub forbidden-to-restore 清单，禁止恢复 `mod execution;`、`crate::execution`、`execution::manager`、`AgentManager`、`GLOBAL_AGENT_MANAGER`、`new_with_thread_runtime_store` 和 `get_or_create_agent`。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster execution manager stub / fake global Agent cache；`compat blocker` = 当时 subagent handler 仍经 Aster `Agent::reply(...)` 与 provider/tool/session staging，后续已删除 `Agent::reply(...)` wrapper 并改为 pinned-provider `reply_with_provider(...)`；`current` = 后续 multi-agent / task orchestration 必须进 `agent-runtime` / App Server current owner。
- `next`：Fast A1 后续已清零；不要恢复 Aster execution manager。

### 2026-07-10：Fast A1 context_mgmt no-op compaction stub 删除

- `completed`：删除 `agent-compat/src/context_mgmt.rs`，`agent-compat/src/lib.rs` 不再声明 `mod context_mgmt;`。
- `completed`：`Agent::perform_context_compaction(...)` 不再调用 Aster no-op summarizer，不再把原 conversation 写回、不再保存空 summary 或更新假 usage；该入口改为 fail-closed，提示使用 current App Server context compaction flow。
- `completed`：reply loop 删除自动预压缩分支对 `check_if_compaction_needed(...)` / `DEFAULT_COMPACTION_THRESHOLD` / `ASTER_AUTO_COMPACT_THRESHOLD` 的依赖；overflow compaction gate 保持关闭，不恢复 Aster fake summarizer。
- `completed`：`/compact` slash command 不再调用 `compact_messages_with_summary(...)` 或写空 summary，只返回退役提示。
- `guarded`：`asterMigrationBoundary.test.ts` 将 `context_mgmt.rs` 纳入 no-op stub forbidden-to-restore 清单，禁止恢复 `mod context_mgmt;`、`crate::context_mgmt`、`compact_messages_with_summary`、`check_if_compaction_needed`、`automatic_compaction_enabled_for_current_turn`、`DEFAULT_COMPACTION_THRESHOLD` 和 `ASTER_AUTO_COMPACT_THRESHOLD`。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster context compaction no-op stub、Aster `/compact` 空 summary 假成功；`current` = context compaction 若恢复必须归 App Server / `agent-runtime` current owner，并接入 Thread / Item projection；`compat blocker` = reply loop overflow/retry 仍是 Aster staging，R2/R6 未完成前不能声明 context 主链完成。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/aster-read-media-retired" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/aster-read-media-retired" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p aster-core execute_commands --lib -j 2 -- --nocapture`，`2 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/aster-read-media-retired" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server -j 2`；仍有既有 `lime-agent` warning：`RuntimeReplyResponseEvent` unused import、`NativeRegistration::name` 未使用。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`153 passed`。
- `passed`：scoped `git diff --check`。
- `next`：继续“未使用先删、简单先迁、复杂后置”：Fast A1 后续已清零，下一刀回到 recipe/provider/tool/session 中仍可批量迁出或删除的简单项。

### 2026-07-10：Fast A1 media helper / Read image-PDF base64 删除

- `completed`：删除 `agent-compat/src/media/**`，`agent-compat/src/lib.rs` 不再声明 `mod media;`。
- `completed`：`agent-compat/src/tools/file/read.rs` 中 `read_image(...)` 与 `read_pdf(...)` 改为 fail-closed。图片不再通过 Aster `Read` 返回 `Base64 Data`，PDF 不再通过 `Read` 伪装成 multimodal payload；缺失文件仍返回原来的 not found 错误。
- `completed`：`ReadTool::is_image_file(...)` / `is_pdf_file(...)` 只保留扩展名识别，旧 `crate::media::{is_supported_image_format,is_pdf_extension}` helper 已删除。
- `guarded`：`asterMigrationBoundary.test.ts` 增加 media helper / Read image-PDF base64 forbidden-to-restore guard，禁止恢复 `agent-compat/src/media`、`mod media;`、`crate::media::`、`read_image_file_enhanced`、`estimate_image_tokens`、`MAX_IMAGE_FILE_SIZE`、`Base64 Data` 和 PDF base64 payload。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster media helper、Aster `Read` image/PDF base64 分支；`current` = 图片查看归 `tool-runtime::view_image`，PDF 文本归 current document preview / ingestion；`compat blocker` = Aster reply loop native `Tool` trait 仍未迁出，`ReadTool` 自身仍是 R4/R9 staging surface。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check`。
- `passed`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p aster-core test_read_image_file_is_retired --lib -j 2 -- --nocapture`，`1 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/aster-read-media-retired" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p aster-core tools::file::read --lib -j 2 -- --nocapture`，`23 passed`。
- `passed`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server -j 2`；仍有既有 `lime-agent` warning：`RuntimeReplyResponseEvent` unused import、`NativeRegistration::name` 未使用。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`153 passed`。
- `passed`：scoped `git diff --check`。
- `next`：继续“未使用先删、简单先迁、复杂后置”：Fast A1 后续已清零；R2/R3 provider/reply loop、R4 native registry、R5/R6 session/event DTO 继续作为 Deferred Core。

### 2026-07-10：Fast A2 recipe runtime / scheduler 删除

- `completed`：删除 `agent-compat/src/scheduler.rs` 与 `agent-compat/src/scheduler_trait.rs`，移除 `Agent::scheduler_service` / `set_scheduler(...)` 和 reply_parts 测试 mock。Codex 没有 Aster recipe cron runner 语义；Lime 前端 automation / cron UI 属于独立 current 主链，不复用 Aster scheduler。
- `completed`：删除 `agent-compat/src/recipe/{build_recipe,local_recipes,read_recipe_file_content,template_recipe,validate_recipe,yaml_format_utils}.rs`，从 `recipe/mod.rs` 删除对应 public module、`Recipe::from_file_path(...)`、`Recipe::to_yaml(...)`、`BUILT_IN_RECIPE_DIR_PARAM` 和 `RECIPE_FILE_EXTENSIONS`。
- `completed`：`agents/subagent_tool.rs` 不再读取本地 subrecipe 文件或渲染 recipe 模板；`Agent` 工具只保留 ad-hoc prompt delegation，`subagent_type` 仅作为 role hint。Codex 有 multi-agent / sub-agent 方向，但不采用 Aster 本地 recipe 文件注入运行时语义。
- `completed`：更新 `agents/subagent_tool.rs` 相关旧正向测试，改为断言 legacy subrecipe 不再暴露给模型；同步修正 `tools/bash.rs` 中已删 sandbox variant 的旧测试残留，不恢复 Aster sandbox 类型。
- `completed`：从 `agent-compat/Cargo.toml` 删除只服务旧 recipe/scheduler 的 `minijinja`、`chrono-tz`、`cron`、`tokio-cron-scheduler` 依赖。
- `guarded`：`asterMigrationBoundary.test.ts` 增加 recipe runtime / scheduler forbidden-to-restore guard，禁止恢复删除文件、module exports、旧函数名、旧依赖和 `scheduler_service` / `set_scheduler`。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster 本地 recipe file loader / template renderer / validator / YAML formatter、Aster recipe scheduler / SchedulerTrait；`compat blocker` = `Recipe` / `SubRecipe` DTO 仍被 Aster session metadata、subagent staging、session store 边界引用；`current` = Lime frontend automation / scheduler current 主链、Codex-style multi-agent current control tools 后续继续归 Lime owner，不回流 Aster recipe runtime。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check`。
- `passed`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p aster-core subagent_tool --lib -j 2 -- --nocapture`，`18 passed`。
- `next`：继续“未使用先删、简单先迁、复杂后置”：Fast A1 后续已清零；R2/R3 provider/reply loop、R4 native registry、R5/R6 session/event DTO 继续作为 Deferred Core。

### 2026-07-10：Fast A2 permission framework 删除

- `completed`：删除 `agent-compat/src/permission/{audit,condition,integration,manager,merger,migration,pattern,policy,restriction,templates,types}*`，移除 Aster `ToolPermissionManager`、`ToolPolicyManager`、`PermissionContext`、`AuditLogger` 等 integrated permission / policy / audit framework。
- `completed`：`PermissionInspector` 去掉 optional integrated manager 分支；`ToolRegistry` 去掉可选 permission/audit manager；`agents/tool_execution.rs` 去掉未调用的 audit / ToolPermissionManager helper。生产仍保留 Tool 自身 `check_permissions`、permission request callback、最小 `PermissionInspector` / `PermissionConfirmation` / `permission_judge` / `ToolPermissionStore`。
- `guarded`：`asterMigrationBoundary.test.ts` 增加 permission framework forbidden-to-restore guard，禁止恢复删除目录、public exports、`with_integrated_manager(...)`、`get_integrated_permission_manager(...)`、registry `with_managers(...)` / `set_*_manager(...)`。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster integrated permission / policy / audit framework；`current` = App Server RuntimeCore pending action / `agentSession/action/respond` / `tool-runtime::execution_approval`；`compat blocker` = Aster reply loop 未迁完前的最小 permission inspector / confirmation adapter。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check`。
- `passed`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server -j 2`；仍有既有 `lime-agent` warning：`RuntimeReplyResponseEvent` unused import、`NativeRegistration::name` 未使用。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`151 passed`。
- `passed`：`git diff --check -- "lime-rs/crates/agent-compat/src/permission" "lime-rs/crates/agent-compat/src/agents/tool_execution.rs" "lime-rs/crates/agent-compat/src/tools/registry.rs" "lime-rs/crates/agent-compat/src/tool_inspection.rs" "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `next`：继续按“未使用先删、简单先迁、复杂后置”扫描 `recipe` / `scheduler` / `tools` 中 Codex 无对应且无真实 Lime 消费的 surface；Fast A1 root helper 均不得恢复。

### 2026-07-10：Fast A prompt template stub 删除

- `completed`：删除 `agent-compat/src/prompt_template.rs` 与 `agent-compat/src/prompts/**` 旧 markdown 模板目录；该模块此前 `render_global_file(...)` 永远返回空字符串，实际会绕过 fallback，不应作为 Aster prompt template owner 续命。
- `completed`：`prompt_manager`、`permission_judge`、`extension_manager`、`subagent_handler` 改为直接构造最小文本或使用原始 override 文本，不再通过 Aster 模板函数名和模板文件名间接保留旧面。
- `guarded`：`asterMigrationBoundary.test.ts` 增加 Aster prompt template forbidden-to-restore guard，禁止恢复 `prompt_template.rs`、`src/prompts/**`、`render_global_file`、`render_inline_once` 和旧模板文件名。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster prompt template stub 与旧 prompt markdown files；`compat blocker` = `prompt_manager` / subagent prompt 调用仍在 Aster reply loop staging 内，后续随 R2/R7/R9 迁出或删除；`current` = Codex-style AGENTS / runtime prompt context 仍归 `lime-agent/src/prompt/runtime_agents.rs` / App Server prompt context 主链。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check`。
- `passed`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `next`：Fast A root helper 后续已清零；不要恢复 Aster context manager。

### 2026-07-10：Fast A helper 迁出与 stub 删除

- `completed`：删除 `agent-compat/src/token_counter.rs`；`providers/usage_estimator.rs` 不再创建 Aster dummy token counter，改用 `tool-runtime::tool_io::estimate_tool_io_tokens` 做真实 fallback 估算，避免缺 usage provider 继续写入 0 token 假值。
- `completed`：迁出 `agent-compat/src/network/mod.rs` 的 localhost/system proxy bypass helper 到 `model-provider::http::should_bypass_system_proxy`；Aster provider HTTP client 与 Ollama toolshim 临时调用 current owner helper，旧 `crate::network::*` 不得恢复。
- `completed`：删除零引用 `agent-compat/src/oauth.rs` root stub；provider OAuth 当前仍在 `providers/oauth.rs`，本轮未删除真实 provider OAuth flow。
- `completed`：删除 `agent-compat/src/hints/mod.rs`；该模块实际永远返回空 hints。Codex-style AGENTS current owner 已在 `lime-agent/src/prompt/runtime_agents.rs` / App Server prompt context 主链，Aster hints stub 不再保留。
- `completed`：从 `agent-compat/Cargo.toml` 删除已无 Rust 引用的 `tiktoken-rs`、`include_dir`、`oauth2`、`ignore` 直接依赖；`url` 仍被 provider/auth 代码使用，保留。
- `guarded`：`asterMigrationBoundary.test.ts` 增加已迁 helper / 已删 stub guard，禁止恢复 `network`、`token_counter`、`hints`、root `oauth` 文件及旧函数名 / 旧 `mod` / 旧调用点。
- `classification`：`current` = `model-provider::http::should_bypass_system_proxy`、`tool-runtime::tool_io::estimate_tool_io_tokens`；`dead / deleted / forbidden-to-restore` = Aster dummy token counter、Aster network helper、root OAuth bail stub、empty hints loader、Aster context compaction no-op stub、Aster execution manager stub。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core -- --check`。
- `passed`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p model-provider --lib -j 2`。
- `passed`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server -j 2`；仍有既有 / 并行 warning：`RuntimeReplyResponseEvent` unused import、`NativeRegistration::name` 未使用。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`153 passed`。
- `passed`：`git diff --check -- "lime-rs/crates/agent-compat" "lime-rs/crates/model-provider" "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `next`：继续 Fast A 处理 still-called stub；若会牵动 reply loop 大块行为，推入 Deferred Core，不为了删文件恢复 Aster 语义。

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
- `next`：Fast A root helper 后续已清零；仍服务 provider / reply loop / tool registry / session store 的项推入 Deferred Core 或迁到 current owner。

### 2026-07-10：Fast A 零引用 stub 删除与骨架编译恢复

- `completed`：删除 `agent-compat/src/claude_plugin_cache.rs`、`agent-compat/src/agents/platform_tools.rs` 与 `agent-compat/src/agents/schedule_tool.rs`；前者只有 root `mod` 声明，后两者分别定义未注册的 Aster `platform__manage_schedule` 假工具面和无调用 handler，Lime current 无外部生产消费。
- `completed`：移除 `agents/mod.rs` 的 `pub mod platform_tools;` / `mod schedule_tool;`，并用 `asterMigrationBoundary.test.ts` 将三个文件列为 `deleted / forbidden-to-restore`，防止零引用 Aster-only surface 回流。
- `completed`：恢复 `agent-compat` 骨架编译：当时 `mcp_utils` 回到 `rmcp::model::ErrorData` 结果类型，后续已继续删除；`declarative_providers` 不再 include 已删除固定 provider 目录，`context_mgmt` 当时保持 fail-closed 空实现且后续已删除，`sandbox` 只保留兼容输出 DTO，不恢复旧 Aster sandbox 运行时。
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
- `classification`：`dead / deleted / forbidden-to-restore` = Aster skills registry / loader / executor / workflow helper、`loadSkill` platform extension 和 `LimeSkillTool` Aster `Tool` trait wrapper；`current` = `lime-skills`、`tool-runtime::skill_execute`、App Server skill data source。
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
- `note`：`context_mgmt`、`media` 后续已从 crate-private residual 继续物理删除；当前 active 表按 deleted/migrated 追踪。
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
- `corrected`：2026-07-10 继续纠偏：`agent-compat` 不是保护区，允许通过消费 current helper 来删除本地 provider stream poll policy，但这不代表旧 loop 完成迁移。
- `completed`：`agent-compat/src/agents/agent.rs` 改为消费 `model-provider::provider_stream::{provider_stream_cancel_poll_interval, provider_stream_timeout_poll, provider_stream_event_poll, ProviderStreamPoll}`，并删除本地 `PROVIDER_STREAM_CANCEL_*` 常量和两个 cancel reason 字符串。
- `classification`：`current` = `model-provider::provider_stream::{ProviderStreamPoll, ProviderStreamCancelReason}` target contract；`compat blocker` = Aster `reply_internal(...)` 仍执行 provider stream、tool loop、session/event source；`dead / guarded` = `agent-compat` 本地 provider stream poll policy / 本地 cancel reason 字符串回流，或把消费 current helper 写成完成态。
- `Thread / Turn / Item`：Turn provider stream lifecycle 规则进入 current owner；Item/Event 投影仍由现有 Aster event -> Lime event adapter 暂时承接。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-stream-poll-corrected-model" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -- --nocapture`，`23 passed`；覆盖 provider stream poll target contract。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`144 passed`；后续守卫已改为要求 `agent-compat` 消费 current poll helper，并禁止本地 cancel reason 常量回流。
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
- `completed`：`asterMigrationBoundary.test.ts` 增加 `agent-compat/Cargo.toml` 本地 path dependency burn-down allowlist 守卫；当时除现存 `document-preview` / `model-provider` / `tool-runtime` 外，新增任何本地 path dependency 都会 fail；后续 Read/Glob/Grep 壳删除后 `document-preview` 已从 allowlist 中 burn down。
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
- `completed`：`agent-runtime::reply_backend::RuntimeReplyProviderSourceExecution` 保留为 Turn execution payload，并新增 `from_source_request(...)` / `from_run_call(...)` / `into_backend_call(...)`；default/provider source helper 先把 raw source request materialize 成 execution payload，再交给 provider backend。
- `completed`：`request_tool_policy/provider_reply_exit_source.rs::ProviderReplyExitSource` 继续作为 `RuntimeReplyProviderExecutionSource<ProviderReplyExitRunner>` 私有退场点，但 wrapper 来自 `model-provider`，Aster `Agent::reply_with_provider(...)` 仍只在私有 `run_provider_reply_exit_source(...)` 一处。
- `completed`：删除 `agent-compat/src/prompts` 空目录残留；该路径已是 Aster prompt template surface 的 `dead / deleted / forbidden-to-restore` 面，不得因为 staging crate 仍存在而保留。
- `completed`：`RuntimeReplyResponseEvent`、`RuntimeReplyResponseItem` 与 `RuntimeReplyResponseItemPayload` 前移到 `model-provider::provider_stream`；`agent-runtime::reply_stream` 只 re-export 这些 provider DTO 并保留 materializer / projection。
- `classification`：`current` = `model-provider` provider source backend wrapper + provider response event/item DTO + `agent-runtime` Turn execution payload/materializer；`compat blocker` = `ProviderReplyExitRunner` / `run_provider_reply_exit_source(...)` Aster 最后一跳，以及 Aster `AgentEvent` projector 迁移期输入；`dead / guarded` = 把 provider execution wrapper 放回 `agent-runtime` 或 `agent-compat`、在 `agent-runtime` 重新定义 provider response DTO、在 backend adapter / credential bridge 恢复 Aster provider execution。
- `Thread / Turn / Item`：provider wrapper 归 provider owner，Turn 只交接 execution payload；Item/read model 仍等待后续 provider response event / tool router 迁出 Aster。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-response-event-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`25 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-response-event-agent-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib -j 1 -- --nocapture`，`26 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-response-event-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`151 passed`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package agent-runtime --package lime-agent -- --check`；`npx prettier --check ...`；`git diff --check -- ...`。
- `next`：继续替换 `run_provider_reply_exit_source(...)` 内部 Aster provider trait object execution；完成前 root `aster` dependency 和 `agent-compat` staging crate 仍不能删除。

### 2026-07-10：R2/R3 provider failure logging classification 前移到 model-provider

- `completed`：新增 `model-provider::provider_stream::failure`，承接 provider failure kind / retryable / non-retryable rejection 事实到 error/warn 日志等级的 current policy。
- `completed`：`agent-compat/src/agents/agent.rs` 不再本地维护 `ProviderError::ServerError | ExecutionError | UsageError` 的 error 日志匹配，也不再直接调用 `ProviderError::message_is_non_retryable_provider_rejection(...)` 判定 session description warn/debug；它只把 Aster `ProviderError` 投影成 `RuntimeReplyProviderFailure`。
- `completed`：为恢复 `lime-agent request_tool_policy` 定向验证，`lime-agent` 的 `aster_session_store_tests.rs` 将重复 `Recipe` 字面量改成 `serde_json::from_value(...)` fixture helper，兼容当前 staging DTO 变化；这只是测试夹具补齐，不恢复 Aster recipe runtime / scheduler。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `model-provider::provider_stream/failure.rs` 持有 failure logging helper，要求 staging loop 消费 current helper，并禁止旧 `ProviderError::message_is_non_retryable_provider_rejection` 与 `matches!(error, ProviderError::ServerError...)` 形状回流。
- `classification`：`current` = `model-provider` provider failure logging classification；`compat blocker` = Aster `ProviderError` 仍是 provider/reply loop source error；`dead / guarded` = `agent-compat` 本地 provider failure logging policy。
- `Thread / Turn / Item`：provider owner 负责 provider failure classification；Turn loop 只消费分类结果决定临时日志等级；Item/read model 不依赖 Aster error variant。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core --package lime-agent -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-failure-policy-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`36 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`153 passed`。
- `note`：fresh target 首次编译因磁盘不足失败，已删除本轮临时 `.lime/cargo-target/provider-failure-policy-lime-agent` 后复用既有 target 通过；这进一步证明 root `aster` dependency / `agent-compat` 冷编仍是验证成本来源。
- `next`：继续替换 `run_provider_reply_exit_source(...)` 内部 Aster provider trait object execution；完成前 root `aster` dependency 和 `agent-compat` staging crate 仍不能删除。

### 2026-07-10：R2/R3 provider sampling policy 前移到 model-provider

- `completed`：`model-provider::provider_stream` 承接 `RuntimeReplyProviderSamplingRequest`、`RuntimeReplyProviderSamplingMode`、`PROVIDER_EMPTY_STREAM_RETRY_MARKER` 与 `provider_stream_should_retry_empty_first_content(...)`。stream / non-stream 选择、采样诊断字段和 empty-first-content retry 判定不再由 Aster reply loop 本地硬编码。
- `completed`：`agent-compat/src/agents/reply_parts.rs` 只消费 current sampling request/helper 来驱动现有 Aster 最后一跳，属于缩短 R2/R3 blocker 的迁移期调用，不是 `agent-compat` owner 证据；该文件不得恢复 `"Anthropic stream ended without assistant content or tool call"` 硬编码。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 sampling mode/request/retry helper 与 marker 存在于 `model-provider::provider_stream`，并检查 `agent-compat` 只能引用 helper，不能本地恢复 marker 字符串。
- `classification`：`current` = `model-provider` provider sampling policy + provider response event/item DTO + provider source backend wrapper；`compat blocker` = `ProviderReplyExitRunner` / `run_provider_reply_exit_source(...)` 与 `agent-compat` reply loop 仍调用 Aster provider trait object；`dead / guarded` = `agent-compat` 本地 provider sampling policy、硬编码 empty-stream marker、把 staging crate 写成 current owner。
- `risk`：`model-provider/src/provider_stream.rs` 约 `931` 行，已触发 `800` 行拆分预警；本刀保持窄改，下一次继续追加 provider policy/DTO 前优先拆 `response` / `sampling` 子模块。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core --package lime-agent -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-sampling-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`28 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-sampling-agent-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib -j 1 -- --nocapture`，`26 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-sampling-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`；冷编耗时 `10m18s`，说明 R1/R2/R3 未闭环仍拖慢验证。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`152 passed`。
- `next`：继续替换 `run_provider_reply_exit_source(...)` 内部 Aster provider trait object execution；完成前 root `aster` dependency 和 `agent-compat` staging crate 仍不能删除。

### 2026-07-10：R2/R3 provider stream poll policy 从 Aster loop 删除

- `completed`：`agent-compat/src/agents/agent.rs` 删除本地 `PROVIDER_STREAM_CANCEL_*` 常量和两个 cancel reason 字符串，provider stream timeout / event-boundary cancel 现在通过 `model-provider::provider_stream` current helper 判定。
- `completed`：`model-provider::provider_stream::provider_stream_timeout_poll` 改为泛型 `ProviderStreamPoll<T>`，让 current helper 能直接服务真实 provider stream item 类型，而不是只返回 `ProviderStreamPoll<()>`。
- `guarded`：`asterMigrationBoundary.test.ts` 从“禁止 agent-compat 消费 current poll helper”改为“要求 staging loop 消费 current poll helper，并禁止本地 cancel policy 回流”。这符合 `agent-compat` 迁出对象口径：削薄旧 loop 可以做，但不能把旧 loop 写成 owner 或完成态。
- `classification`：`current` = `model-provider` provider stream poll/cancel policy；`compat blocker` = Aster `reply_internal(...)` 仍执行 provider trait object stream、tool loop 与 session/event source；`dead / guarded` = `agent-compat` 本地 provider stream poll policy、本地 cancel reason 字符串、把 current helper 消费写成完成态。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-sampling-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`28 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-sampling-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `next`：继续替换 `run_provider_reply_exit_source(...)` 内部 Aster provider trait object execution；完成前 root `aster` dependency 和 `agent-compat` staging crate 仍不能删除。

### 2026-07-10：R2/R3 first text delta policy 前移到 model-provider

- `completed`：新增 `model-provider::provider_stream::text_delta::provider_stream_first_text_delta_chars(...)`，承接 provider first non-empty text delta 的 trim/count 规则，并通过 `provider_stream` public re-export 暴露给当前 provider stream policy 调用方。
- `completed`：`agent-compat/src/agents/agent.rs::provider_response_text_chars(...)` 与 `agent-compat/src/agents/reply_parts.rs::first_text_delta_chars(...)` 只负责从 Aster `MessageContent::Text` 投影字符串，实际 first-text delta 判定交给 `model-provider` current helper。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `model-provider::provider_stream` 持有 `provider_stream_first_text_delta_chars`，并要求 `agent-compat` 只能消费该 helper；后续不得把 trim/count 规则复制回 staging loop。
- `classification`：`current` = `model-provider` provider first-text delta policy；`compat blocker` = Aster `Message` / `MessageContent` 仍是 provider stream item source；`dead / guarded` = `agent-compat` 本地 provider first-text trim/count policy、把 staging helper 写成 owner。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-sampling-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`29 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-sampling-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `next`：继续替换 `run_provider_reply_exit_source(...)` 内部 Aster provider trait object execution；完成前 root `aster` dependency 和 `agent-compat` staging crate 仍不能删除。

### 2026-07-10：R2/R3 response event adapter 去 Aster 命名

- `completed`：新增 `request_tool_policy/response_event_adapter.rs`，把 `RuntimeAgentEvent` -> `RuntimeReplyResponseEvent` 过渡映射、可表达 provider response item 的 `AgentThreadItem` payload projection、以及 unsupported item fail-closed 测试从 `aster_reply_stream_adapter.rs` 迁出。
- `completed`：`aster_reply_stream_adapter.rs` 现在只保留 Aster source adapter 职责：读取 Aster `AgentEvent` / `Message`，抽取 provider side-channel notification、inline provider error，以及从 Aster message 生成 response hints 后委托 current `response_event_adapter`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `response_event_adapter.rs` 持有 `RuntimeReplyResponseEventMapper`、`response_item_from_agent_thread_item(...)` 和 item lifecycle 单测，并禁止 `aster_reply_stream_adapter.rs` 重新持有 response mapper / response item projection。
- `classification`：`transitional current adapter` = `response_event_adapter.rs` 和 `agent_reply_stream.rs` response projection adapter；`compat blocker` = `AsterReplyStreamProjector` 仍消费 Aster source stream；`dead / guarded` = 在 Aster 命名文件里重新承接 current response mapper、或把 Aster `AgentEvent` 当长期 stream event contract。
- `Thread / Turn / Item`：Turn response event materialization 继续由 current owner 消费；Aster 文件只负责入站 bridge；Item/read model projection 已有过渡测试覆盖，但 provider source 仍未直接产出 Lime-owned response event。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/response-event-adapter-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`153 passed`。
- `next`：继续替换 `run_provider_reply_exit_source(...)` 内部 Aster provider trait object execution；完成前 root `aster` dependency 和 `agent-compat` staging crate 仍不能删除。

### 2026-07-10：R2/R3 provider tool-input delta policy 前移到 model-provider

- `completed`：新增 `model-provider::provider_stream::tool_input_delta`，承接 provider tool-input delta 的 current 过滤 / 投影规则：整条 provider message 必须全是 tool-input delta，空 `call_id` / 空 `delta` 跳过，输出统一构造为 `RuntimeReplyResponseEvent::ToolCallInputDelta`。
- `completed`：`agent-compat/src/agents/agent.rs::collect_provider_tool_input_delta_events(...)` 不再维护本地过滤规则，只把 Aster `MessageContent::ToolInputDelta` 投影成 `RuntimeReplyProviderToolInputDelta`，再把 current response event 映射回临时 `AgentEvent`。这是削薄 staging loop，不是给 `agent-compat` 续命。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `model-provider` 持有 `RuntimeReplyProviderToolInputDelta` / `provider_stream_tool_input_delta_events(...)`，并禁止 `agent-compat` 恢复本地空 id / 空 delta 过滤判断。
- `classification`：`current` = `model-provider` provider tool-input delta event policy；`compat blocker` = Aster `MessageContent` 仍是 provider stream item source；`dead / guarded` = `agent-compat` 本地 tool-input delta 过滤 / projection 规则，或把 helper 消费写成迁移完成态。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-tool-input-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`32 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-tool-input-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`；冷编耗时 `11m38s`，再次证明 root `aster` dependency / `agent-compat` 未迁完会拖慢验证。
- `next`：继续替换 `run_provider_reply_exit_source(...)` 内部 Aster provider trait object execution；完成前 root `aster` dependency 和 `agent-compat` staging crate 仍不能删除。

### 2026-07-10：R2/R3 provider model-change policy 前移到 model-provider

- `completed`：新增 `model-provider::provider_stream::model_change`，承接 lead-worker provider active model 分类：`usage.model` 与 lead / worker model 匹配后输出 `lead` / `worker` / `unknown` mode。
- `completed`：`agent-compat/src/agents/agent.rs` 不再本地维护 lead/worker/unknown 字符串分支，只从 Aster lead-worker provider 读取 `get_model_info()` 并调用 `provider_stream_model_change(...)`，再映射成临时 `AgentEvent::ModelChange`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 model-change contract 存在于 `model-provider`，并禁止 staging loop 恢复本地 `active_model == lead_model` / `active_model == worker_model` 分类。
- `classification`：`current` = `model-provider` provider model-change metadata policy；`compat blocker` = Aster `LeadWorkerProviderTrait` 与 Aster usage DTO 仍是 source；`dead / guarded` = `agent-compat` 本地 model-change 字符串分类，或把 current helper 消费写成迁移完成态。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-model-change-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`33 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-model-change-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`；冷编耗时 `21m06s`，说明 root `aster` dependency / `agent-compat` 仍是验证成本来源。
- `next`：继续替换 `run_provider_reply_exit_source(...)` 内部 Aster provider trait object execution；完成前 root `aster` dependency 和 `agent-compat` staging crate 仍不能删除。

### 2026-07-10：R2/R3 provider stream notification envelope / text classification 前移到 model-provider

- `completed`：新增并扩展 `model-provider::provider_stream::notification`，承接 provider stream side-channel notification 的 current envelope 和文本分类：`provider_stream_notification_text(...)` 负责构造 JSON payload text，`provider_stream_notification_payload_from_text(...)` / `provider_stream_notification_payload_from_texts(...)` 负责解析，`provider_stream_has_notification_text(...)` 负责从文本集合判定 provider notification，`PROVIDER_STREAM_EVENT_NOTIFICATION_PREFIX` 固定为 `__provider_stream_event__:`。
- `completed`：`agent-compat/src/providers/formats/openai_responses.rs` 删除本地 `PROVIDER_STREAM_EVENT_NOTIFICATION_PREFIX` 和 `PROVIDER_STREAM_EVENT_KIND_SAFETY_BUFFERING`，只把 current notification text 包成 Aster `SystemNotification`；内部旧 prefix `__aster_provider_stream_event__:` 直接下线，不保兼容。`agent-compat/src/agents/agent.rs` 不再 import Aster format 判断函数，只投影 Aster system notification 文本并调用 current helper。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 notification envelope / text classification helper 存在于 `model-provider`，要求 Aster Responses 格式文件和 staging loop 只能消费 current helper，并禁止恢复旧 Aster prefix / event kind / envelope 组包 / message classification 规则。
- `classification`：`current` = `model-provider` provider stream notification envelope / text classification；`compat blocker` = Aster `Message` / `SystemNotification` 仍作为 reply source side-channel container；`dead / guarded` = Aster 格式文件或 staging loop 本地 notification prefix、event kind、JSON envelope 和 message classification 规则。
- `Thread / Turn / Item`：provider owner 负责 provider event envelope；Aster stream adapter 只做 source message 读取；Turn stream projection 继续消费 `RuntimeReplyProviderStreamEvent::from_notification_payload(...)`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-notification-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`32 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-notification-aster-core" cargo test --manifest-path "lime-rs/Cargo.toml" -p aster-core responses_streaming_safety_buffering --lib -j 1 -- --nocapture`，`1 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-notification-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `next`：继续替换 `run_provider_reply_exit_source(...)` 内部 Aster provider trait object execution；完成前 root `aster` dependency 和 `agent-compat` staging crate 仍不能删除。

### 2026-07-10：R2/R3 provider stream progress / milestone policy 前移到 model-provider

- `completed`：新增 `model-provider::provider_stream::progress::RuntimeReplyProviderStreamProgress`，承接 provider stream first event、first content、first text delta 与 empty-first-content retry state。
- `completed`：`agent-compat/src/agents/agent.rs` 不再维护 `provider_first_event_seen` / `provider_first_text_delta_seen`；`agent-compat/src/agents/reply_parts.rs` 不再维护 `first_provider_content_seen` / `first_provider_text_delta_seen`，只从 Aster `Message` 投影文本后调用 current progress helper。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 provider progress contract 存在于 `model-provider::provider_stream`，要求 staging loop 消费 `RuntimeReplyProviderStreamProgress`，并禁止本地 milestone booleans 回流。
- `classification`：`current` = `model-provider` provider stream progress / milestone policy；`compat blocker` = Aster `reply_internal(...)` / provider trait object stream 仍是 source；`dead / guarded` = `agent-compat` 本地 first event/content/text delta state，或把 helper 消费写成迁移完成态。
- `risk`：本刀通过子模块 `provider_stream/progress.rs` 落地，避免继续扩大已超过 800 行预警的 `provider_stream.rs` 主文件。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`34 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`；冷编耗时 `14m57s`，说明 root `aster` dependency / `agent-compat` 仍是验证成本来源。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`153 passed`。
- `next`：继续替换 `run_provider_reply_exit_source(...)` 内部 Aster provider trait object execution；完成前 root `aster` dependency 和 `agent-compat` staging crate 仍不能删除。

### 2026-07-10：R2/R3 provider source execution wrapper 拆入 model-provider 子模块

- `completed`：`RuntimeReplyProviderSourceBackendCall`、`RuntimeReplyProviderSourceFuture`、`RuntimeReplyProviderExecutionRunner<R>`、`RuntimeReplyProviderExecutionSource<R>`、`run_provider_source_execution(...)` 与对应 wrapper tests 已从 `model-provider/src/provider_stream.rs` 拆入 `model-provider/src/provider_stream/source_execution.rs`。
- `completed`：`model-provider/src/provider_stream.rs` 从约 `975` 行降到 `876` 行，退出 `1000` 行强制拆分风险区；后续继续追加 provider policy / response DTO 前，应优先落到 `provider_stream/*` 子模块。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 provider source execution wrapper 位于 `model-provider/src/provider_stream/source_execution.rs`，禁止 `provider_stream.rs` 主文件重新持有 wrapper impl，也禁止把 wrapper 放回 `agent-runtime` 或 `agent-compat`。
- `classification`：`current` = `model-provider::provider_stream::source_execution`；`compat blocker` = `ProviderReplyExitRunner` / 私有 `run_provider_reply_exit_source(...)` 仍调用 Aster `Agent::reply_with_provider(...)`；`dead / guarded` = provider source execution wrapper 回流到 `agent-runtime`、`agent-compat` 或 `provider_stream.rs` 主文件。
- `Thread / Turn / Item`：provider owner 承接 source execution wrapper；Turn owner 只保留 `RuntimeReplyProviderSourceExecution` payload materialization；Item/read model 仍需后续把 provider response event / tool routing 从 Aster projector 中彻底迁出。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-source-execution-split-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`42 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-source-execution-split-agent-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 1 -- --nocapture`，`20 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`165 passed`。
- `next`：继续替换 `run_provider_reply_exit_source(...)` 内部 Aster provider trait object execution；完成前 root `aster` dependency、`lime-agent` 的 `aster.workspace = true` 和 `agent-compat` staging crate 仍不能删除。

### 2026-07-10：R2/R3 provider stream poll / sampling / response event 拆入子模块

- `completed`：`ProviderStreamPoll`、`ProviderStreamCancelReason`、cancel reason 字符串与 poll helper 已从 `provider_stream.rs` 拆入 `provider_stream/poll.rs`。
- `completed`：`RuntimeReplyProviderSamplingRequest`、`RuntimeReplyProviderSamplingMode`、`PROVIDER_EMPTY_STREAM_RETRY_MARKER` 与 `provider_stream_should_retry_empty_first_content(...)` 已从 `provider_stream.rs` 拆入 `provider_stream/sampling.rs`。
- `completed`：`RuntimeReplyResponseEvent`、`RuntimeReplyResponseItem` 与 `RuntimeReplyResponseItemPayload` 已从 `provider_stream.rs` 拆入 `provider_stream/response_event.rs`。
- `completed`：`model-provider/src/provider_stream.rs` 现在约 `701` 行，只保留 facade re-export、provider handle / request / stream event 主 contract 和 tests 入口；相比接近 `975` 行的阶段，已退出 `800` 行拆分预警线。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `poll.rs` / `sampling.rs` / `response_event.rs` 存在并被 `provider_stream.rs` re-export，禁止主文件重新持有 poll helper、sampling request 或 response event enum。
- `classification`：`current` = `model-provider::provider_stream::{poll,sampling,response_event,source_execution}`；`compat blocker` = Aster `AgentEvent` projector、Aster `Message` / provider trait object 和 `reply_with_provider(...)` 最后一跳；`dead / guarded` = poll / sampling / response event DTO 回流到 `provider_stream.rs` 主文件、`agent-runtime` 或 `agent-compat`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-stream-contract-split-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`42 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`，耗时 `3m08s`；耗时主要来自仍需编译 `aster-core` / `agent-compat`。
- `passed`：`npx prettier --write "src/lib/governance/asterMigrationBoundary.test.ts"`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`167 passed`。
- `next`：继续替换 `run_provider_reply_exit_source(...)` 内部 Aster provider trait object execution；完成前不能宣称 R2/R3 完成，也不能删除 root `aster` dependency。

### 2026-07-10：R2/R3 provider response content contract 前移到 model-provider

- `completed`：新增 `model-provider::provider_stream::response_content`，承接 provider response content 的 current 组合入口：text 首字计数、provider side-channel notification 文本分类、tool-input delta event 投影。
- `completed`：`agent-compat/src/agents/agent.rs` 不再直接消费 `provider_stream_first_text_delta_chars`、`provider_stream_tool_input_delta_events`、`provider_stream_has_notification_text` 或 `RuntimeReplyProviderToolInputDelta`；它只把 Aster `MessageContent` 映射为 `RuntimeReplyProviderResponseContent`，再调用 current helper。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `response_content.rs` 存在并由 `provider_stream.rs` re-export；禁止 `agent-compat/agent.rs` 恢复 provider response text / notification / tool-input delta 直接规则。
- `classification`：`current` = `model-provider::provider_stream::response_content`；`compat blocker` = Aster `MessageContent` 仍是 provider stream source adapter，`ProviderReplyExitSource` / `reply_with_provider(...)` 最后一跳仍未删除；`dead / guarded` = `agent-compat` 本地 provider response content 规则。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core --package lime-agent -- --check`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-response-content-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`44 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`168 passed`。
- `next`：继续替换 `run_provider_reply_exit_source(...)` 内部 Aster provider trait object execution；完成前不能宣称 R2/R3 完成，也不能删除 root `aster` dependency。

### 2026-07-10：R2/R3 provider failure category projection 前移到 model-provider

- `completed`：`model-provider::provider_stream::failure` 新增 `RuntimeReplyProviderFailureKind::from_category(...)` / `as_category(...)` 与 `RuntimeReplyProviderFailure::from_category(...)`，承接 provider telemetry category 到 current failure DTO 的映射。
- `completed`：`agent-compat/src/agents/agent.rs` 不再维护 `provider_failure_kind(...)` 或 `ProviderError::* -> RuntimeReplyProviderFailureKind` 本地分支，只把 Aster `ProviderError` 的 `telemetry_type()`、`is_retryable()`、`is_non_retryable_provider_rejection()` 投影给 current DTO。
- `completed`：`agent-compat/src/agents/provider_trace.rs` 不再直接依赖 Aster `ProviderError`；failed trace event 只消费 current `RuntimeReplyProviderFailure`。这减少了 provider trace 与 Aster error enum 的耦合，但不改变 `reply_with_provider(...)` 最后一跳状态。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 staging loop 消费 `RuntimeReplyProviderFailure::from_category(...)`，禁止恢复 `provider_failure_kind(...)`、本地 `ProviderError::*` 分类表，以及 `provider_trace.rs` 直接 import `crate::providers::errors::ProviderError`。
- `classification`：`current` = `model-provider` provider failure category projection；`compat blocker` = Aster `ProviderError` 仍是 reply loop source error，`ProviderReplyExitSource` / `reply_with_provider(...)` 最后一跳仍未删除；`dead / guarded` = staging loop 本地 provider error kind 映射。
- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/model-provider/src/provider_stream/failure.rs" "lime-rs/crates/model-provider/src/provider_stream/tests.rs" "lime-rs/crates/agent-compat/src/agents/agent.rs" "lime-rs/crates/agent-compat/src/agents/provider_trace.rs"`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-failure-category-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`45 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`169 passed`。
- `note`：该历史刀当时用窄写集 fmt 验证；旧 `ask_bridge.rs` 后续已删除，当前 request_user_input 收口轮次已复跑相关 package fmt。
- `next`：继续替换 `run_provider_reply_exit_source(...)` 内部 Aster provider trait object execution；完成前不能宣称 R2/R3 完成，也不能删除 root `aster` dependency。

### 2026-07-10：R2/R3 provider response context header extraction 前移到 model-provider

- `completed`：新增 `model-provider::provider_stream::response_context`，复用 `agent-protocol::provider_trace::ProviderTraceResponseContext` 作为 `RuntimeReplyProviderResponseContext`，承接 provider response request-id header allowlist、长度限制和可见 ASCII 清洗。
- `completed`：`agent-compat/src/session_context.rs` 不再维护 `PROVIDER_REQUEST_ID_HEADERS`、`MAX_PROVIDER_REQUEST_ID_LEN` 或 `normalize_provider_request_id(...)`；它只把 `reqwest::HeaderMap` 读取成 header pairs 后交给 current helper，并继续作为未迁 reply loop 的 task-local carrier。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `response_context.rs` 存在并由 `provider_stream.rs` re-export，要求 `session_context.rs` 消费 `provider_stream_response_context_from_header_pairs(...)`，禁止 staging session context 恢复 request-id header policy。
- `classification`：`current` = `model-provider` provider response context extraction + `agent-protocol` provider trace response context DTO；`compat blocker` = Aster `session_context` 仍是 reply loop task-local carrier，`ProviderReplyExitSource` / `reply_with_provider(...)` 最后一跳仍未删除；`dead / guarded` = staging session context 本地 request-id header allowlist / 清洗规则。
- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/model-provider/src/provider_stream.rs" "lime-rs/crates/model-provider/src/provider_stream/response_context.rs" "lime-rs/crates/model-provider/src/provider_stream/tests.rs" "lime-rs/crates/agent-compat/src/session_context.rs"`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-failure-category-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`47 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`171 passed`。
- `next`：继续替换 `run_provider_reply_exit_source(...)` 内部 Aster provider trait object execution；完成前不能宣称 R2/R3 完成，也不能删除 root `aster` dependency。

### 2026-07-10：Agent-compat agents root re-export 收缩

- `completed`：`agent-compat/src/lib.rs` 将 `pub mod agents;` 收缩为 private `mod agents;`，外部只通过 root 最小 re-export 消费 `Agent`、`AgentEvent`、`AgentIdentity`、`ExtensionConfig`、`McpClientTrait`、`SessionConfig`、provider trace、live execution hook 和 tool call result 等 R2/R4/R7 未迁完 blocker 类型。
- `completed`：`lime-agent` 现有 `aster::agents::*`、`aster::agents::extension::*`、`aster::agents::mcp_client::*` 生产/测试引用改为 `aster::{...}` root 过渡面；`rg -n "aster::agents::|aster::agents\\{" "lime-rs/crates" -g "*.rs" -g "*.md"` 无命中。
- `Thread / Turn / Item`：Aster `Agent` / `AgentEvent` 仍是 R2/R6 reply/event source compat blocker；MCP extension bridge 仍是 R7 blocker；live execution hook / tool call result 仍是 R4 native registry blocker。本刀只封 public module path，不宣称核心迁完。
- `classification`：`dead / guarded` = `aster::agents::*` 外部 public module path；`compat blocker` = root 最小 re-export；`current` = 后续必须迁到 `agent-runtime`、`tool-runtime`、`lime-mcp`、Thread / Turn / Item 和 App Server 主链。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 agents 顶层模块守卫，要求 `mod agents;`、root re-export 和 `McpClientError` / `McpClientTrait` root export，并禁止 `lime-agent` / App Server 生产路径恢复 `aster::agents::*`。
- `passed`：`rustfmt --edition 2021 --check` 覆盖本轮 Rust 写集。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-agents-root-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过，仅剩既有 `NativeRegistration::name` unused warning。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`171 passed`。
- `remaining`：root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、provider/reply loop 最后一跳、Aster native `ToolRegistry`、`SessionStore` / `ThreadRuntimeStore` 仍是 Phase 6 blocker；整体口径不因本刀上调到完成态。

### 2026-07-10：Agent-compat config root re-export 收缩

- `completed`：`agent-compat/src/lib.rs` 将 `pub mod config;` 收缩为 private `mod config;`；外部唯一剩余 path root 调用改为 root `aster::initialized_path_root()` 过渡 helper。
- `completed`：`lime-agent/src/runtime_store_aster_adapter.rs` 不再穿透 `aster::config::paths::initialized_path_root()`；`rg -n "aster::config::|aster::config\\{" "lime-rs/crates" -g "*.rs" -g "*.md"` 无命中。
- `Thread / Turn / Item`：Aster config 不进入 Thread / Turn / Item current owner；`initialized_path_root()` 只是 R5/R6 runtime store adapter 未迁完前的 root compat helper，退出条件是 session/runtime store adapter 迁出后删除。
- `classification`：`dead / guarded` = `aster::config::*` 外部 public module path；`compat blocker` = root `initialized_path_root()`；`current` = provider/settings/App Server config 主链与 Thread runtime store owner。
- `guarded`：`asterMigrationBoundary.test.ts` 更新 config guard，要求 root `mod config;`、root `initialized_path_root` re-export，并禁止 `lime-agent` / App Server 生产路径恢复 `aster::config::*`。
- `passed`：`rustfmt --edition 2021 --check` 覆盖本轮 Rust 写集。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-agents-root-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过，仅剩既有 `NativeRegistration::name` unused warning。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`171 passed`。
- `remaining`：本刀仍不迁出 provider/reply loop、native registry 或 session/runtime store；root `aster` dependency 和 `aster.workspace = true` 仍不能删除。

### 2026-07-10：R4 tool execution scheduling policy 前移到 tool-runtime

- `completed`：`tool-runtime::tool_batch` 新增 `ToolExecutionScheduleBatch<T>`、`runtime_tool_call_concurrency_safe(...)` 与 `partition_tool_execution_requests(...)`，承接 reply loop 工具并发安全分类和相邻安全请求合批策略。
- `completed`：`agent-compat/src/agents/agent.rs` 不再维护本地 `ToolExecutionBatch`、`is_concurrency_safe_tool_request(...)` 或 `partition_tool_requests_for_execution(...)`，也不再直接 import shell concurrency analysis；它只把 Aster `ToolRequest` 投影为 tool name / optional command 后消费 current helper。
- `completed`：清理 `agent-compat` private module 中无消费者的 `RetryConfig` / provider helper re-export，解除 `lime-agent request_tool_policy` 编译阻塞；这只是 staging surface 收缩，不是 current owner。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tool_batch.rs` 持有 schedule batch / concurrency helper / partition helper，要求 `agent-compat` 消费 current helper，并禁止 staging loop 恢复本地工具并发安全或执行分批策略。
- `classification`：`current` = `tool-runtime::tool_batch` execution scheduling policy；`compat blocker` = Aster `ToolRequest` / `ToolRegistry` / `Tool` trait execution 仍服务 reply loop fallback；`dead / guarded` = staging loop 本地工具并发安全 / 执行合批规则。
- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/tool-runtime/src/tool_batch.rs" "lime-rs/crates/agent-compat/src/agents/agent.rs" "lime-rs/crates/agent-compat/src/lib.rs" "lime-rs/crates/agent-compat/src/agents/mod.rs" "lime-rs/crates/agent-compat/src/providers/mod.rs"`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/tool-batch-schedule-tool-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime tool_batch --lib -j 1 -- --nocapture`，`4 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`171 passed`。
- `remaining`：R4 native execution 仍有 Aster registry fallback 和 Aster `Tool` trait 壳；R2/R3 `ProviderReplyExitSource` / `reply_with_provider(...)` 最后一跳仍未删除，root `aster` dependency 不能删除。

### 2026-07-10：Agent-compat providers root re-export 收缩

- `completed`：`agent-compat/src/lib.rs` 将 `pub mod providers;` 收缩为 private `mod providers;`；外部只通过 root 最小 re-export 消费 `Provider`、`ProviderError`、`MessageStream`、`ProviderMetadata`、`ProviderUsage`、`Usage`、`RetryConfig`、`LeadWorkerProviderTrait`、`SessionNameGenerationExecutionStrategy`、`create_provider(...)` 和 provider notification helper。
- `completed`：`providers::{base,errors,formats}` 与 `formats::openai_responses` 降为 crate-private staging；`lime-agent` 外部 `aster::providers::*` 引用改为 root `aster::{...}` 过渡面；`rg -n "aster::providers::|aster::providers\\{" "lime-rs/crates" -g "*.rs" -g "*.md"` 无命中。
- `Thread / Turn / Item`：provider trait object / reply source 仍是 R2/R3 blocker；本刀只封 Aster provider module path，不迁出 `reply_with_provider(...)` 最后一跳。
- `classification`：`dead / guarded` = `aster::providers::*` 外部 public module path；`compat blocker` = root provider 最小 re-export；`current` = `model-provider` provider backend / stream owner 与 App Server provider 主链。
- `guarded`：`asterMigrationBoundary.test.ts` 更新 provider public surface 守卫，要求 private `mod providers;`、root 最小 re-export，并禁止 `lime-agent` / App Server 生产路径恢复 `aster::providers::*`。
- `passed`：`rustfmt --edition 2021 --check` 覆盖本轮 Rust 写集。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-root-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过，仅剩既有 `NativeRegistration::name` unused warning。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`171 passed`。
- `remaining`：root `aster` dependency、Aster provider trait object、`ProviderReplyExitSource` / `reply_with_provider(...)`、Aster `Message` / `AgentEvent` source adapter 仍是 R2/R3 blocker。

### 2026-07-10：Agent-compat conversation/session/tools root re-export 收缩

- `completed`：`agent-compat/src/lib.rs` 将 `pub mod conversation;`、`pub mod session;`、`pub mod tools;` 收缩为 private `mod`，外部只通过 root 最小 re-export 消费 `Message` / `Conversation`、`SessionStore` / `ThreadRuntimeStore`、`Tool` / `ToolContext` / `ToolRegistry` 等 blocker 类型。
- `completed`：`lime-agent` 外部引用从 `aster::conversation::*`、`aster::session::*`、`aster::tools::*` 批量改为 root `aster::{...}` 过渡面；`agent-compat` session 文档示例同步改为 root 过渡面，避免继续示范已退役 module path。
- `Thread / Turn / Item`：Aster `Message` / `Conversation` 仍是 R2/R6 reply/event source blocker；Aster `SessionStore` / runtime store 仍是 R5/R6 blocker；Aster `ToolRegistry` / `Tool` trait 仍是 R4 blocker。本刀只封 public module path，不宣称核心迁完。
- `classification`：`dead / guarded` = `aster::conversation::*` / `aster::session::*` / `aster::tools::*` 外部 public module path；`compat blocker` = root 最小 re-export；`current` = 后续必须迁到 `agent-runtime`、`agent-protocol`、`thread-store`、`tool-runtime`、`model-provider` 与 App Server 主链。
- `guarded`：`asterMigrationBoundary.test.ts` 扩展 tools/session 与 conversation public surface 守卫，禁止恢复 root `pub mod conversation/session/tools` 和 `lime-agent` 外部 module path 穿透。
- `passed`：`rg -n "aster::(conversation|session|tools)::|aster::(conversation|session|tools)\\{" "lime-rs/crates/agent" -g "*.rs"` 无命中。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-root-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过，仅剩既有 `NativeRegistration::name` unused warning。
- `remaining`：root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、R2/R3 provider/reply loop 最后一跳、R4 native registry、R5/R6 session/runtime source 仍是 Phase 6 blocker；整体完成度口径不因本刀上调到完成态。

### 2026-07-10：R2/R3 provider trace DTO alias 收敛到 current owner

- `completed`：`model-provider::provider_stream` re-export `agent-protocol::provider_trace::{ProviderTraceEvent, ProviderTraceStage, ProviderTraceFailure}` 为 `RuntimeReplyProviderTrace*` alias，并新增 `provider_stream_trace_failure(...)`，把 current failure DTO 投影为 provider trace failure。
- `completed`：`agent-compat/src/agents/provider_trace.rs` 删除本地 `ProviderTraceStage` enum 和 `ProviderTraceEvent` struct；未迁 reply loop 只保留 thin wrapper 生成 current DTO。
- `completed`：`agent/src/event_converter.rs` 对 `AgentEvent::ProviderTrace` 直接透传 current DTO，删除 stage 映射和字段复制，避免 runtime provider metadata 在 adapter 边界丢失。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止 `agent-compat` 恢复本地 provider trace DTO，禁止 `event_converter` 恢复 `AsterProviderTraceStage` / `convert_provider_trace_stage(...)` / 字段复制，并同步 root `aster::*` re-export 守卫口径。
- `classification`：`current` = `agent-protocol` provider trace DTO + `model-provider` provider trace alias / failure projection；`compat blocker` = Aster `AgentEvent::ProviderTrace` 仍由未迁 `reply_with_provider(...)` source adapter 传出；`dead / guarded` = 本地 Aster-shaped trace DTO 与 event converter trace stage adapter。
- `Thread / Turn / Item`：Provider owner 负责 trace failure projection；Turn adapter 只透传 typed trace event；Item/read model 继续消费 materialized provider trace，不再依赖 Aster stage 字段复制。
- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/model-provider/src/provider_stream.rs" "lime-rs/crates/model-provider/src/provider_stream/failure.rs" "lime-rs/crates/agent-compat/src/agents/provider_trace.rs" "lime-rs/crates/agent-compat/src/agents/agent.rs" "lime-rs/crates/agent/src/event_converter.rs"`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-trace-dto-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`47 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `passed`：`git diff --check -- "lime-rs/crates/model-provider/src/provider_stream.rs" "lime-rs/crates/model-provider/src/provider_stream/failure.rs" "lime-rs/crates/agent-compat/src/agents/provider_trace.rs" "lime-rs/crates/agent-compat/src/agents/agent.rs" "lime-rs/crates/agent/src/event_converter.rs" "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `remaining`：R2/R3 `ProviderReplyExitSource` / `run_provider_reply_exit_source(...)` / `reply_with_provider(...)` 最后一跳仍未删除，root `aster` dependency 和 `lime-agent` 的 `aster.workspace = true` 仍不能删除。

### 2026-07-10：Agent-compat ProviderTraceStage root re-export 下线

- `completed`：`agent-compat/src/agents/mod.rs` 与 `agent-compat/src/lib.rs` 不再 re-export `ProviderTraceStage`；`agent-compat/src/agents/provider_trace.rs` 也不再 alias `RuntimeReplyProviderTraceStage`。
- `kept`：`ProviderTraceEvent` 仍作为 Aster `AgentEvent::ProviderTrace` public 字段类型暂留 root re-export，退出条件是 `AgentEvent` source adapter 随 R2/R3 迁出后删除。
- `classification`：`dead / guarded` = `aster::ProviderTraceStage` root surface；`compat blocker` = `aster::ProviderTraceEvent` root surface；`current` = `agent-protocol::provider_trace::ProviderTraceStage` 和 `lime-agent` 自有 `AgentProviderTraceStage` alias。
- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-compat/src/agents/provider_trace.rs" "lime-rs/crates/agent-compat/src/agents/mod.rs" "lime-rs/crates/agent-compat/src/lib.rs"`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `remaining`：provider/reply loop 最后一跳仍未删，不能因为 stage root surface 下线而宣称 R2/R3 完成。

### 2026-07-10：Agent-compat session/tools wildcard root re-export 下线

- `completed`：`agent-compat/src/lib.rs` 删除 `pub use session::*;` 与 `pub use tools::*;`，改为显式 allowlist 暂留 `ThreadRuntimeStore` / `SessionRuntimeSnapshot` / `QueuedTurnRuntime`、`Tool` / `ToolContext` / `ToolRegistry` / `ToolRegistrationConfig` 等仍被 `lime-agent` adapter 命中的 R4/R5/R6 blocker。
- `completed`：`session/mod.rs`、`tools/mod.rs` 与 `tools/search/mod.rs` 继续删除无消费者 private re-export；`tools/search` 同步移除已过期的 vendored ripgrep 说明，避免已删 helper 被当作现役 surface。
- `classification`：`dead / guarded` = `session::*` / `tools::*` broad root surface 和无消费者 private re-export；`compat blocker` = root 显式 allowlist；`current` = 后续必须迁入 `tool-runtime`、`thread-store`、`agent-runtime`、`agent-protocol` 与 App Server。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `pub use session::*;` / `pub use tools::*;`，并要求 root allowlist 明示 `ThreadRuntimeStore`、`SessionRuntimeSnapshot`、`ToolRegistrationConfig`、`PermissionCheckResult` 等仍未迁 blocker。
- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-compat/src/lib.rs"`；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-root-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过；仍有既有 `NativeRegistration::name` unused warning。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `remaining`：root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、R2/R3 provider/reply loop、R4 native registry fallback、R5/R6 session/runtime source 仍未删除；整体口径保持骨架约 `95%`、彻底搬空约 `83%`。

### 2026-07-10：BashTool root surface 下线，Windows shell 验证改走 tool-runtime

- `completed`：`lime-agent/tests/windows_shell_runtime.rs` 不再 `use aster::{BashTool, Tool, ToolContext}`，改为直接调用 `tool-runtime::shell_runtime::build_platform_shell_command(...)` 验证 PATH 清空时仍能走 Windows PowerShell fallback。
- `completed`：`agent-compat/src/lib.rs` 从 root tools allowlist 删除 `BashTool`；`rg -n "aster::BashTool|use aster::\\{[^\\n]*BashTool|use aster::BashTool" "lime-rs/crates/agent" -g "*.rs"` 无命中，`rg -n "BashTool" "lime-rs/crates/agent-compat/src/lib.rs"` 无命中。
- `classification`：`current` = `tool-runtime::shell_runtime` 平台 shell 构造；`dead / guarded` = 外部 `aster::BashTool` root surface 和测试入口；`compat blocker` = Aster 内部 `BashTool` 仍作为 R4 registry fallback。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止 `agent/src` / `agent/tests` 恢复 `aster::BashTool`，并要求 root allowlist 不再包含 `BashTool`。
- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/agent/tests/windows_shell_runtime.rs" "lime-rs/crates/agent-compat/src/lib.rs"`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-root-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过；仍有既有 `NativeRegistration::name` unused warning。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `blocked-by-env`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --target x86_64-pc-windows-msvc --test windows_shell_runtime -j 2` 在 `ring` 的 C 编译阶段失败，`assert.h` missing，未进入本次测试代码；需要完整 Windows C toolchain / SDK 后再复跑。
- `remaining`：R4 shell execution 内部 registry fallback 未删；下一刀应继续把 Bash/PowerShell execution 从 Aster `Tool` trait 壳迁到 current tool router。

### 2026-07-10：R4 具体工具实现 public surface 下线

- `completed`：`agent-compat/src/tools/mod.rs` 将 `BashTool` / `PowerShellTool` / `ReadTool` / `GlobTool` / `GrepTool` / `AskTool` / `DEFAULT_ASK_TIMEOUT_SECS` re-export 收成 `pub(crate)`；`tools/file/mod.rs` 和 `tools/search/mod.rs` 的 `ReadTool` / `GlobTool` / `GrepTool` / `SharedFileReadHistory` 实现面也改为 crate-private。
- `completed`：`register_all_tools(...)` / `register_default_tools(...)` 收成 crate-private，只服务尚未迁出的 Aster reply-loop registry fallback；公开面只保留 `Tool` / `ToolRegistry` / `ToolContext`、`ToolRegistrationConfig` 和 permission 类型等 blocker；`AskRequest` / `AskOption` / `AskQuestion` DTO 已归 current `tool-runtime::request_user_input` / `agent-runtime::request_user_input`。
- `guarded`：`asterMigrationBoundary.test.ts` 扩展 tools/session 守卫，禁止 `tools/mod.rs`、`tools/file/mod.rs`、`tools/search/mod.rs` 恢复公开 re-export 具体工具实现类型，并禁止 `lime-agent` 外部生产恢复 `aster::BashTool` / `aster::ReadTool` / `aster::GlobTool` / `aster::GrepTool` / `aster::AskTool` / `aster::PowerShellTool`。
- `classification`：`dead / guarded` = Aster 具体工具实现 public surface；`compat blocker` = crate-private Aster `Tool` trait / registry fallback；`current` = `tool-runtime::native_dispatch`、`tool-runtime::request_user_input` 和后续 current gateway executor。
- `Thread / Turn / Item`：Turn tool execution 不再把具体 Aster `*Tool` 类型暴露给外部；R4 未迁完前，Aster registry 仍只是 source adapter，不是 current owner。
- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-compat/src/tools/mod.rs" "lime-rs/crates/agent-compat/src/tools/file/mod.rs" "lime-rs/crates/agent-compat/src/tools/search/mod.rs"`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/exec-plans/aster-phase6-provider-reply-backend-plan.md" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-tools-impl-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`，仅有既有 `SessionPlanModeState` unused import warning。
- `passed`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2`，仅有既有 `NativeRegistration::name` unused warning。
- `remaining`：本刀不删除内部 `ToolRegistry::execute(...)` fallback；foreground shell、Read/Grep/Glob 与 request_user_input 后续已迁到 `tool-runtime`，Skill/gateway-backed/MCP、background / sandbox shell 执行壳仍待迁到 current owner。

### 2026-07-10：Ask DTO root surface 下线

- `completed`：旧 `lime-agent/src/ask_bridge.rs` 已删除，`lime-agent/src/request_user_input_bridge.rs` 直接使用 `agent-runtime::request_user_input` re-export 的 current DTO；`project_ask_request(...)` 旧搬运 helper 删除。
- `completed`：`agent-compat/src/lib.rs` 与 `agent-compat/src/tools/mod.rs` 不再 re-export `AskRequest` / `AskOption` / `AskQuestion`，也不再保留 `AskCallback` alias；公开面只暂留 `RequestUserInputCallback` 配置字段作为 Aster registry 未迁完前的 R4 bridge blocker。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tools/mod.rs` 和 root lib 不再包含 Ask DTO public re-export，并继续要求 `request_user_input` DTO/schema/parse/normalization owner 位于 `tool-runtime`。
- `classification`：`current` = `tool-runtime::request_user_input` + `agent-runtime::request_user_input` DTO/runner；`dead / guarded` = 外部 `aster::AskRequest` / `aster::AskOption` / `aster::AskQuestion` surface；`compat blocker` = `agent-compat` callback 配置和 `lime-agent` ActionRequired scope adapter。后续刀已删除 Aster `AskTool` registry 外壳。
- `passed`：历史 DTO 收缩阶段曾用 `rustfmt --edition 2021 --config skip_children=true --check` 覆盖当时 Ask bridge / compat tools 写集；后续已由 `request_user_input_bridge.rs` 和 `tool-runtime::request_user_input` 接管，旧 `ask_bridge.rs` / `tools/ask.rs` 已删除。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-ask-root-dto-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2`，仅剩既有 `SessionPlanModeState` / `NativeRegistration::name` warnings。
- `passed`：后续命名收口后的验证入口为 `request_user_input_bridge`；当前已由 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_user_input_bridge --lib -j 1 -- --nocapture` 覆盖。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `remaining`：R4 仍未完成；Skill/gateway-backed 工具、MCP extension bridge / source adapter、background / sandbox shell、R2/R3 provider/reply loop 和 R5/R6 session/runtime source 仍阻塞 root `aster` dependency 删除。

### 2026-07-10：R4 team tool 具体实现 public surface 下线

- `completed`：`agent-compat/src/tools/mod.rs` 将 `TeamCreateTool` / `TeamDeleteTool` / `ListPeersTool` re-export 收成 `pub(crate)`；`agent-compat/src/tools/team_tools.rs` 的三个具体类型和 `new()` 构造器也降为 crate-private。
- `kept`：`SpawnAgentRequest` / `SpawnAgentResponse`、`AgentControlToolConfig` 和 `register_agent_control_tools(...)` 仍因 Aster reply-loop callback bridge 暂留；本刀不误删 Agent / SendMessage / spawn bridge。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止 `tools/mod.rs` 恢复公开 re-export team 具体工具类型，禁止 `lime-agent` 外部生产恢复 `aster::TeamCreateTool` / `aster::TeamDeleteTool` / `aster::ListPeersTool`，并要求 team 工具类型保持 crate-private。
- `classification`：`dead / guarded` = Aster team 具体工具实现 public surface；`compat blocker` = crate-private Aster team `Tool` trait fallback；`current` = `tool-runtime` tool exposure / registration gate 和后续 current multi-agent / team executor。
- `Thread / Turn / Item`：Turn tool execution 不再把 Aster team 具体类型当公开 API；后续 team / multi-agent lifecycle 必须迁到 current Turn owner，再由 Item/read model 投影。
- `remaining`：本刀未删除内部 Team/Agent/SendMessage registry fallback；R4 仍需把 team / agent-control 执行壳迁到 `agent-runtime` / `tool-runtime` current owner 后删除 Aster `Tool` trait 壳。

### 2026-07-10：Provider input modality policy parser 前移到 model-provider

- `completed`：`model-provider::provider_stream::image_input` 新增 `provider_stream_input_modality_policy_from_metadata(...)`、`provider_stream_input_modality_policy_allows_image_input(...)` 与 `provider_stream_metadata_allows_image_input(...)`，承接 provider/media lowering 侧 input modality metadata 解析和 image input allowed 判定。
- `completed`：`agent-compat/src/agents/prompt_input_modalities.rs` 删除本地 `input_modality_policy_*` parser；该文件只保留 Aster `MessageContent::Image` 与 RMCP `Content::Image` 降级为文本占位的 source adapter。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 provider stream contract 暴露 input modality helpers，要求 `prompt_input_modalities.rs` 消费 `provider_stream_metadata_allows_image_input(...)`，并禁止恢复本地 `input_modality_policy_from_metadata` / `input_modality_policy_from_value` / `input_modality_policy_allows_image_input`。
- `classification`：`current` = `model-provider` provider input modality policy；`compat blocker` = Aster `Message` / RMCP `Content` 仍是未迁 provider prompt source adapter；`dead / guarded` = `agent-compat` 本地 input modality parser。
- `Thread / Turn / Item`：Provider owner 负责 provider/media input policy；Turn adapter 只在未迁 Aster prompt source 边界做消息内容 lowering；Item/read model 不消费 Aster image policy parser。
- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/model-provider/src/provider_stream.rs" "lime-rs/crates/model-provider/src/provider_stream/image_input.rs" "lime-rs/crates/model-provider/src/provider_stream/tests.rs" "lime-rs/crates/agent-compat/src/agents/prompt_input_modalities.rs"`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/input-modality-model-provider" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 1 -- --nocapture`，`49 passed`。
- `passed`：`CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `remaining`：R2/R3 `ProviderReplyExitSource` / `run_provider_reply_exit_source(...)` / `reply_with_provider(...)` 最后一跳仍未删除，root `aster` dependency 和 `lime-agent` 的 `aster.workspace = true` 仍不能删除。

### 2026-07-10：Aster session plan-mode dead file 删除

- `completed`：删除零外部引用的 `agent-compat/src/session/plan.rs`，并从 `session/mod.rs` 移除 `mod plan;`。该文件只保存 Aster `SessionPlanModeState` / `session_plan_mode` extension 写入 helper；Codex-style plan 能力已归 `tool-runtime::update_plan` 与 App Server / 前端计划轨，不需要 Aster session extension 续命。
- `completed`：顺手清理 `agent-compat/src/tools/agent_control.rs` 与 `tools/peer_address_surface.rs` 的无消费者 collab-agent re-export，配合并行已完成的 `tool-runtime::collab_agent` surface 前移，避免 R4 agent-control adapter 编译 warning 继续遮挡主 blocker。
- `guarded`：`asterMigrationBoundary.test.ts` 升级为文件级 forbidden-to-restore，禁止恢复 `session/plan.rs`、`mod plan;` 或 `SessionPlanModeState` public/root surface。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster session plan-mode extension；`current` = `tool-runtime::update_plan` 与 `tool-runtime::collab_agent` surface；`compat blocker` = R4 agent-control `Tool` trait adapter、R5/R6 Aster session/runtime store 其余 DTO 仍未迁完。
- `remaining`：本刀只删除已退场 dead file，不改变 root `aster` dependency、R2/R3 provider/reply loop、R4 registry fallback、R5/R6 session/runtime source blocker 状态。

### 2026-07-10：R4 collab agent tool surface owner 固定到 tool-runtime

- `completed`：`agent-compat/src/tools/agent_control.rs` 中 `SpawnAgentTool` / `SendInputTool` 与 `register_agent_control_tools(...)` 降为 `pub(crate)`，只作为 Aster reply-loop registry fallback 内部适配；`tools/mod.rs` 的 agent-control re-export 同步改为 crate-private。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 Agent / SendMessage / Team / ListPeers 的 DTO、schema、工具名和描述 surface 归 `tool-runtime::collab_agent`，禁止 `agent-compat` 恢复本地 `AgentInput` / `SendMessageInput` / `TeamCreateInput` / `ListPeersInput` 等 DTO 或 schema builder。
- `classification`：`current` = `tool-runtime::collab_agent` 协作工具 surface；`compat blocker` = Aster `Tool` trait adapter 和 registry fallback；`dead / guarded` = Aster agent-control / team 工具本地 DTO/schema/公开实现类型。
- `remaining`：Team/Agent/SendMessage/ListPeers 的执行壳仍在 Aster registry fallback 中，下一刀应继续把执行请求/结果投影和 runtime callback 迁到 `agent-runtime` / `tool-runtime` current executor 后删除这些 `Tool` trait 壳。

### 2026-07-10：R4 collab agent result projection 前移到 tool-runtime

- `completed`：新增 `tool-runtime::collab_agent/projection.rs`，承接 SendMessage 输出值、metadata、unsupported bridge peer 返回，以及 TeamCreate / TeamDelete / ListPeers metadata 规则；主 `collab_agent.rs` 只 re-export projection，避免超过 800 行风险继续恶化。
- `completed`：`agent-compat/src/tools/agent_control.rs` 不再本地构造 `BroadcastOutput` / `MessageOutput` / `RequestOutput` / `ResponseOutput` 或 plan approval response metadata；`team_tools.rs` 不再本地拼 team/list peers metadata，只把 session/team 状态投影交给 current helper 后包装成 Aster `ToolResult`。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止 `agent-compat` 恢复协作工具本地输出 projection，并要求 `tool-runtime::collab_agent` 暴露 `project_send_message_result(...)`、`project_send_message_unsupported_bridge_peer(...)`、`team_*_metadata(...)` 与 `list_peers_metadata(...)`。
- `classification`：`current` = `tool-runtime::collab_agent` result projection；`compat blocker` = Aster `Tool` trait adapter / registry fallback、session/team state 接线；`dead / guarded` = `agent-compat` 本地协作工具结果 projection。
- `passed`：`rustfmt --edition 2021 --check` 本轮 Rust 写集；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`；旧 projection 片段 `rg` 无命中；`git diff --check` 本轮写集；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `passed`：清理本轮临时 Cargo target 后复用 `.lime/cargo-target/provider-progress-lime-agent` 跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime collab_agent --lib -j 1 -- --nocapture`，`7 passed`；同 target 跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。此前 `No space left on device (os error 28)` 已解除，不再作为本刀阻塞。
- `remaining`：Team/Agent/SendMessage/ListPeers 执行壳仍未迁出，R4 仍需把 current executor 接管回调 / session state 后删除 Aster `Tool` trait 壳。

### 2026-07-10：R4 Agent spawn request / result projection 前移到 tool-runtime

- `completed`：`tool-runtime::collab_agent::spawn_agent_request_from_input(...)` 承接 `AgentInput` 到 `SpawnAgentRequest` 的归一化、默认字段填充和 allowed/disallowed tools 去重。
- `completed`：`tool-runtime::collab_agent::project_spawn_agent_result(...)` 承接 Agent spawn 输出和 `agent` metadata；`agent-compat/src/tools/agent_control.rs` 不再本地拼 `SpawnAgentRequest { ... }`、`agentId` / `description` / `prompt` / `name` / `extra` metadata。
- `completed`：`collab_agent.rs` inline tests 拆到 `collab_agent/tests.rs`，current owner 主文件约 `731` 行，退出 800 行预警区。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 current owner 暴露 `SpawnAgentToolRequest`、`spawn_agent_request_from_input(...)` 和 `project_spawn_agent_result(...)`，并禁止 `agent-compat` 恢复本地 `SpawnAgentRequest { ... }` 或 agent metadata 拼装。
- `classification`：`current` = `tool-runtime::collab_agent` Agent spawn request/projection；`compat blocker` = Aster `SpawnAgentTool` / callback bridge / registry fallback；`dead / guarded` = `agent-compat` 本地 spawn request/projection。
- `passed`：`rustfmt --edition 2021 --check` 本刀 Rust 写集。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime collab_agent --lib -j 1 -- --nocapture`，`15 passed`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `remaining`：Agent / SendMessage / Team / ListPeers 的真正执行壳仍需迁到 current executor；本刀先把 spawn request/projection 从 Aster adapter 中拿掉。

### 2026-07-10：R4 collab agent peer address re-export 删除

- `completed`：删除只做 `tool_runtime::collab_agent` re-export 的 `agent-compat/src/tools/peer_address_surface.rs`，`agent_control.rs` 直接消费 current owner 的 `parse_peer_address`、`ParsedPeerAddress`、`PeerAddressScheme` 与 `is_cross_session_local_peer_address`。
- `guarded`：`asterMigrationBoundary.test.ts` 将该文件加入已迁出 helper forbidden-to-restore 清单，避免 `agent-compat` 恢复 peer address surface owner。
- `classification`：`current` = `tool-runtime::collab_agent` peer address contract；`dead / guarded` = `agent-compat` peer address re-export helper；`compat blocker` = SendMessage / Agent Aster `Tool` trait adapter 与 callback bridge。
- `passed`：`rustfmt --edition 2021 --check` 本刀 Rust 写集；`rg -n "peer_address_surface|crate::tools::peer_address_surface|mod peer_address_surface" "lime-rs/crates/agent-compat/src"` 无命中；`git diff --check` 通过；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" ...`，`172 passed`；`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=1 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 1` 通过。
- `remaining`：本刀只删除薄 re-export，不改变 R4 执行壳状态；下一刀仍应迁出 Agent / SendMessage / Team / ListPeers executor 或回到 R2/R3 provider reply exit source。

### 2026-07-10：R4 SendMessage validation 前移到 tool-runtime

- `completed`：新增 `tool-runtime::collab_agent/validation.rs`，承接 SendMessage 的 peer target normalization、summary requirement、structured cross-session/broadcast rejection、shutdown response target/reason 和 plan approval team-lead 校验。
- `completed`：`agent-compat/src/tools/agent_control.rs` 删除本地错误分支和 `normalize_peer_address_target(...)`，只在读取 team/session 状态后调用 current validation helper。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 validation owner 位于 `tool-runtime::collab_agent`，禁止 `agent_control.rs` 恢复这些本地 SendMessage 校验文案和 helper 定义。
- `classification`：`current` = `tool-runtime::collab_agent` validation；`dead / guarded` = `agent-compat` 本地 SendMessage validation owner；`compat blocker` = Aster `Tool` trait adapter、callback bridge、session/team routing。
- `remaining`：R4 协作工具执行壳仍未迁出；下一刀应继续把 Agent / SendMessage / Team / ListPeers executor 从 Aster registry fallback 迁到 current owner。

### 2026-07-10：R4 collab agent DTO 代理出口收缩

- `completed`：`agent_control.rs` 不再 `pub use` current collab DTO，`tools/mod.rs` 也不再 re-export `SpawnAgentRequest` / `SpawnAgentResponse`；`agent.rs` 直接从 `tool-runtime::collab_agent` 消费 DTO。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `pub use tool_runtime::collab_agent` 代理出口，并要求 `SpawnAgentRequest` / `SpawnAgentResponse` 只在 current owner 中定义。
- `classification`：`current` = `tool-runtime::collab_agent` DTO；`dead / guarded` = Aster tools facade / agent_control DTO 二次出口；`compat blocker` = `AgentControlToolConfig`、Aster `Tool` trait adapter 与 callback bridge。
- `passed`：`rustfmt --edition 2021 --check` 本刀 Rust 写集；`npx prettier --check ...`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" ...`，`172 passed`；`tool-runtime collab_agent`，`15 passed`；`cargo check -p aster-core --lib` 通过；scoped `git diff --check`。
- `remaining`：本刀只削掉代理出口，不改变 R4 executor 状态；下一刀仍应迁出协作工具执行壳或 R2/R3 provider reply exit source。

### 2026-07-10：R4 Bash / PowerShell 前台执行壳迁入 tool-runtime

- `completed`：新增 `tool-runtime::shell_execution::{RuntimeShellToolRequest, execute_runtime_shell_tool(...)}`，承接前台 Bash / PowerShell 参数解析、current shell permission 判定、missing read target / blocked sleep / Windows WSL path preflight、embedded process execution、output decode、`AGENT_TERMINAL=1` 环境标记和 `CallToolResult` 投影。
- `completed`：`agent-compat/src/agents/agent.rs` 只把 Aster `ToolContext`、working directory、environment、workspace sandbox、cancel token 和 current turn context 适配给 shell owner；native branch 顺序固定为 live-execution hook -> current shell executor -> current native dispatch executor -> Aster `registry.execute(...)` fallback。
- `completed`：完全授权不打扰口径进入 current owner：`approval_policy=never`、`sandbox_policy=danger-full-access` 或 turn metadata `accessMode=full-access` 时，warning shell command 由 current shell executor 直接处理，不回落到 Aster approval / registry。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tool-runtime/src/shell_execution.rs` 存在、`tool-runtime/src/lib.rs` 暴露 `pub mod shell_execution;`、reply loop 在 `registry.execute(...)` 前调用 `execute_runtime_shell_tool(...)`，并禁止 shell owner 依赖 `aster::` 或恢复 `ASTER_TERMINAL`。
- `classification`：`current` = `tool-runtime::shell_execution` 前台 shell execution owner；`compat blocker` = background shell、workspace sandbox、Skill、gateway-backed tools、MCP / extension bridge 与 Aster `Tool` trait 壳；`dead / guarded` = Aster shell adapter 恢复 permission / process execution owner 或旧环境标记。
- `Thread / Turn / Item`：Turn 拥有 shell execution / permission preflight / tool lifecycle；Item/read model 只消费 materialized tool result，不再把 shell warning confirmation 写回 Aster approval cache。
- `passed`：`rustfmt --edition 2021 --config skip_children=true --check "lime-rs/crates/tool-runtime/src/shell_execution.rs" "lime-rs/crates/tool-runtime/src/shell_execution/tests.rs" "lime-rs/crates/tool-runtime/src/lib.rs" "lime-rs/crates/agent-compat/src/agents/agent.rs"`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime shell_execution --lib -j 2 -- --nocapture`，`7 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2 -- --nocapture`，`81 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `remaining`：R4 未完成；shell background / sandbox、Skill/gateway-backed/MCP fallback 和 R2/R3 provider reply exit source 仍阻塞 root `aster` dependency 删除。

### 2026-07-10：R4 collab agent execution owner 前移到 tool-runtime

- `completed`：新增 `tool-runtime::collab_agent::execution`，承接 Agent spawn 与 SendMessage 的 current 执行编排：参数 parse、target normalization、team-lead validation、plain / structured / cross-session message 构造、callback dispatch、routing/result projection 和 metadata 包装。
- `completed`：`agent-compat/src/tools/agent_control.rs` 删除本地 SendMessage 投递循环、`MessageRouting` / `SendMessageDelivery` 构造和 `project_*` 调用，只实现 `CollabAgentExecutionBackend` 的 session/team resolver 与 Aster callback adapter，再把 current `RuntimeCollabToolOutput` 包装成 Aster `ToolResult`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 execution owner 位于 `tool-runtime::collab_agent`，禁止 `agent_control.rs` 恢复本地 SendMessage projection / delivery loop / unsupported bridge peer result helper。
- `classification`：`current` = `tool-runtime::collab_agent::{execution,projection,validation}`；`dead / guarded` = Aster agent-control 本地执行编排 owner；`compat blocker` = Aster `Tool` trait 壳、ToolRegistry fallback、team/session resolver 和 runtime callback bridge。
- `passed`：`rustfmt --edition 2021 --check` 本轮 Rust 写集；`CARGO_TARGET_DIR=".lime/cargo-target/collab-agent-execution" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime collab_agent --lib -j 1 -- --nocapture`，`17 passed`；同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 1` 通过。
- `remaining`：TeamCreate / TeamDelete / ListPeers 的 session mutation executor、Aster `Tool` trait 壳和 R2/R3 provider reply exit source 仍未删除；root `aster` dependency 仍不能删除。骨架迁移约 `95%`，彻底搬空 `agent-compat` / 删除 root `aster` dependency 约 `83%`。

### 2026-07-10：R4 team mutation executor 前移到 tool-runtime

- `completed`：`tool-runtime::collab_agent::execution` 新增 `CollabAgentTeamExecutionBackend`、`RuntimeTeamState` / `RuntimeTeamMember` / `RuntimeTeamContext` 与 `execute_collab_team_create(...)`、`execute_collab_team_delete(...)`、`execute_collab_list_peers(...)`，承接 TeamCreate / TeamDelete / ListPeers 的参数 parse、team name 冲突处理、lead 校验、active member 拒绝删除、membership cleanup 调度、peer output 与 metadata projection。
- `completed`：`agent-compat/src/tools/team_tools.rs` 删除本地 TeamCreate / TeamDelete / ListPeers 输出构造、metadata 投影和删除循环，只保留 Aster `Tool` trait 壳、session/team storage 读写 adapter、reachable member / local peer 查询 adapter。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 team execution owner 位于 `tool-runtime::collab_agent::execution`，并禁止 `team_tools.rs` 恢复 `TeamCreateOutput { ... }` / `TeamDeleteOutput { ... }` / `ListPeersOutput { ... }`、`team_*_metadata(...)`、active member 删除文案或本地 cleanup loop。
- `classification`：`current` = `tool-runtime::collab_agent::execution` team executor；`compat blocker` = Aster `Tool` trait 壳、ToolRegistry fallback、Aster session/team storage DTO adapter；`dead / guarded` = Aster team tool 本地 mutation / output owner。
- `passed`：`rustfmt --edition 2021 --check` 本轮 Rust 写集；`CARGO_TARGET_DIR=".lime/cargo-target/collab-agent-team-execution" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime collab_agent --lib -j 1 -- --nocapture`，`19 passed`；同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 1` 通过。
- `remaining`：R4 仍未完成；Aster `Tool` trait 壳 / registry fallback、Skill/gateway-backed/MCP、background / sandbox shell、R2/R3 provider reply exit source 和 R5/R6 session/runtime source 仍阻塞 root `aster` dependency 删除。

### 2026-07-10：R4 collab agent execution tests 拆分验证

- `completed`：`tool-runtime/src/collab_agent/execution.rs` 的 inline tests 拆到 `collab_agent/execution_tests.rs`，`execution.rs` 保持约 `624` 行，避免 R4 current execution owner 因测试继续膨胀。
- `classification`：`current` = `tool-runtime::collab_agent::execution` 生产 owner 与同域测试；`compat blocker` = Aster `Tool` trait 壳、ToolRegistry fallback、session/team storage adapter；`dead / guarded` = 把协作工具执行规则放回 `agent-compat` 或让 center owner 文件继续膨胀。
- `passed`：`rustfmt --edition 2021 --check "lime-rs/crates/tool-runtime/src/collab_agent/execution.rs" "lime-rs/crates/tool-runtime/src/collab_agent/execution_tests.rs"`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime collab_agent --lib -j 1 -- --nocapture`，`19 passed`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/exec-plans/aster-phase6-provider-reply-backend-plan.md" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `passed`：scoped `git diff --check` 覆盖 `execution.rs` 与 `execution_tests.rs`。
- `remaining`：该刀只守住 current owner 体量和测试护栏，不改变 Phase 6 未完成结论；R4 registry fallback、R2/R3 provider reply exit source、R5/R6 session/runtime source 仍是删除 root `aster` dependency 前的 blocker。

### 2026-07-10：R4 collab reply-loop current executor 接管

- `completed`：`agent-compat/src/agents/agent.rs` 在 live hook 后、shell/native dispatch 前先调用 `execute_runtime_collab_tool(...)`，`SendMessage` 走 `execute_agent_control_runtime_tool(...)`，`TeamCreate` / `TeamDelete` / `ListPeers` 走 `execute_team_runtime_tool(...)`；Aster `registry.execute(...)` 只作为后续 fallback。
- `completed`：`agent_control.rs` / `team_tools.rs` 暴露 crate-private runtime executor，继续只做 session/team storage DTO adapter 与 callback adapter，不恢复本地执行 owner。
- `guarded`：`asterMigrationBoundary.test.ts` 固定 reply-loop 顺序为 collab current executor -> shell executor -> native dispatch executor -> Aster registry fallback，并禁止跳过 current collab executor。
- `classification`：`current` = `tool-runtime::collab_agent::execution` + reply-loop current executor 调用顺序；`compat blocker` = callback adapter、R5/R6 session/team storage adapter；`dead / guarded` = 协作工具在 `agent-compat` 重新拥有执行编排或优先回落 Aster registry。
- `passed`：`rustfmt --edition 2021 --check` 覆盖 `agent.rs`、`agent_control.rs`、`team_tools.rs`、`tools/mod.rs`；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`；`CARGO_TARGET_DIR=".lime/cargo-target/collab-reply-loop-takeover" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 1` 通过；同 target `cargo check -p tool-runtime --lib` 通过；同 target `cargo test -p tool-runtime collab_agent --lib -j 1 -- --nocapture`，`20 passed`；scoped `git diff --check` 通过。
- `remaining`：R4 仍未完成；`Agent` 特殊 nested subagent 分支、Skill/gateway-backed/MCP、background / sandbox shell、剩余 Aster `Tool` trait 壳、R2/R3 provider reply exit source 和 R5/R6 session/runtime source 仍阻塞 root `aster` dependency 删除。

### 2026-07-10：R4 collab Aster Tool trait 壳删除

- `completed`：`tool-runtime::collab_agent` 新增 `collab_agent_canonical_tool_name(...)`、`collab_agent_tool_definition(...)` 与 `collab_agent_tool_definitions(...)`，承接 Agent / SendMessage / TeamCreate / TeamDelete / ListPeers 的 model-visible definitions 与 legacy alias canonical lookup。
- `completed`：`agent-compat/src/agents/agent.rs` 保存 `ToolRegistrationConfig.allowed_tool_names`，在 current collab canonical lookup 和 `list_tools` 注入 definitions 时继续尊重 allowlist；协作工具不再依赖 Aster registry 才能被识别或曝光。
- `completed`：删除 `SpawnAgentTool` / `SendInputTool` / `TeamCreateTool` / `TeamDeleteTool` / `ListPeersTool` Aster `Tool` trait 壳、`register_agent_control_tools(...)` 和 `tools/mod.rs` 的 team tool re-export；`agent_control.rs` / `team_tools.rs` 只保留 callback、session/team resolver 与 storage adapter。
- `guarded`：`asterMigrationBoundary.test.ts` 反向禁止协作 Aster `Tool` trait 壳、注册函数、本地 canonical / definition owner 和 registry-first 回流。
- `classification`：`current` = `tool-runtime::collab_agent` definitions/canonical/execution + `agent.rs` current collab list/execute bridge；`compat blocker` = callback adapter、session/team resolver、R5/R6 session/team storage adapter；`dead / guarded` = 协作工具 Aster `Tool` trait 壳和 registry registration。
- `passed`：`rustfmt --edition 2021 --check` 覆盖本轮 Rust 写集；`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime collab_agent --lib -j 1 -- --nocapture`，`20 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools --lib -j 1 -- --nocapture`，`102 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `remaining`：R4 仍未完成；Skill/gateway-backed/MCP、background / sandbox shell、R2/R3 provider reply exit source、R5/R6 session/runtime source 和 root `aster` dependency 仍未删除。整体口径更新为骨架约 `95%`、彻底搬空约 `84%`。

### 2026-07-10：R4 shell/full-access Gate A/B 收口验证

- `completed`：Claw GUI fixture 输入 helper 从 Playwright `textarea.fill(...)` 改为受控 DOM value setter + `InputEvent("input")` + `change`，并继续等待 exact value 后真实点击发送按钮。该改动只服务 Electron fixture 的 GUI 输入稳定性，避免中文 `@配图...` mention prompt 被追加异常 ASCII 字符；生产输入框逻辑不靠该 helper。
- `completed`：`claw-chat-current-fixture-smoke.test.mjs` 守卫 `setControlledTextareaValue` 与 `new InputEvent("input"` 必须存在；`HOME_HOTPATH_SUBMIT_ACCEPTED_BUDGET_MS` 从 `1500` 调整为 `1800`，原因是聚合冷启动下 `homeInputToSubmitAcceptedMs=1546` 只超原预算 `46ms`，且 preview、send dispatch、首字渲染和 read model 均已通过。
- `validated`：Gate B Electron CDP `approval-request-full-access` 通过：`LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:claw-chat-current-fixture -- --scenario approval-request-full-access --timeout-ms 240000 --cdp-port 9232 --prefix claw-chat-current-fixture-approval-full-access-shell-r4-after-input-helper --evidence-dir ".lime/qc/gui-evidence/claw-chat-current-fixture"`。summary：`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-approval-full-access-shell-r4-after-input-helper-summary.json`。
- `validated`：Gate A 聚合 `LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:agent-runtime-current-fixture` 完整通过，覆盖 history/cache、stream terminal、MessageList guard、home hotpath、Coding Workbench、image-command、plain image intent、cancel-then-continue、approval resume/decline/cancel/full-access、inputbar restore/pending steer、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、media reference、Expert Skills/Plaza/Panel 与 Content Factory Article Editor，`liveProviderUsed=false`。
- `classification`：`current` = App Server / RuntimeCore / `tool-runtime::shell_execution` / GUI read model 的 full-access no-confirm 主链；`fixture-only` = GUI controlled textarea setter 与 CDP evidence harness；`compat blocker` = R4 remaining registry fallback、R2/R3 provider reply exit source、R5/R6 session/runtime source。该验证不改变 Phase 6 未完成结论。

### 2026-07-10：R4 MCP source adapter public surface 收缩

- `completed`：`agent-compat/src/lib.rs` 不再 root re-export `ExtensionManager`，`agent-compat/src/agents/mod.rs` 将 `extension_manager` 降为 `pub(crate)`，并删除 `pub use extension_manager::ExtensionManager`。
- `completed`：`code_execution_extension.rs` 的内部 weak reference 改为 `crate::agents::extension_manager::ExtensionManager`，不再依赖 agents 顶层 re-export。
- `completed`：删除 `lime-agent/src/native_tools/runtime_overlay.rs::NativeRegistration::name()` 未使用方法，消除 MCP registry owner 检查中残留的 unused warning。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 root `ExtensionManager`、`pub mod extension_manager`、`pub use extension_manager::ExtensionManager`，并禁止 agent-compat 内部使用 `crate::agents::ExtensionManager` 捷径。
- `classification`：`dead / guarded` = `aster::ExtensionManager` root re-export 与 agents 顶层 re-export；`compat blocker` = Aster extension manager / MCP client bridge 仍是未迁 reply-loop MCP source adapter；`current` = `lime-mcp`、App Server MCP gateway、`tool-runtime::{mcp_resource,tool_search}`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/mcp-registry-owner-current" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`174 passed`。
- `remaining`：该刀只收 public surface 和 guard，不迁出 MCP bridge；R4 Skill/gateway-backed/MCP、background / sandbox shell、R2/R3 provider reply exit source、R5/R6 session/runtime source 仍阻塞 root `aster` dependency 删除。

### 2026-07-10：R4 MCP extension / client 子模块 public surface 收缩

- `completed`：`agent-compat/src/agents/mod.rs` 将 `extension` 与 `mcp_client` 降为 `pub(crate)`，不再公开 `agents::extension` / `agents::mcp_client` module path。
- `completed`：保留 root `aster::{ExtensionConfig, McpClientTrait, McpClientError}` 最小过渡 re-export，供 `lime-agent/src/mcp_bridge.rs` 和 `agent_tools/tool_inventory_runtime_adapter.rs` 在 MCP bridge 未迁完前继续编译；该 root 面不是 current owner。
- `completed`：删除 `lime-agent/src/native_tools/runtime_overlay.rs::NativeRegistration::name()` 无引用 getter，复跑 Rust check 后不再有 unused warning。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `pub(crate) mod extension;` / `pub(crate) mod mcp_client;`，禁止恢复 `pub mod extension;` / `pub mod mcp_client;`，同时继续要求 root 最小 re-export 显式存在，避免偷偷恢复 `aster::agents::*`。
- `classification`：`dead / guarded` = 外部 `aster::agents::extension::*` / `aster::agents::mcp_client::*` module path 与 public submodule；`compat blocker` = root `ExtensionConfig` / `McpClientTrait` / `McpClientError`、Aster extension manager source adapter；`current` = `lime-mcp`、App Server MCP gateway、`tool-runtime::{mcp_resource,tool_search,tool_extension}`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/mcp-extension-module-private" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`175 passed`。
- `remaining`：R4/R7 未完成；MCP bridge / extension execution 仍需迁到 `lime-mcp` / App Server / `tool-runtime` current gateway 后，才能删除 root re-export、Aster extension manager 和 `McpClientTrait` adapter。

### 2026-07-11：R4 foreground subagent fallback 删除

- `completed`：删除 `agent-compat/src/agents/subagent_handler.rs`、`subagent_task_config.rs`、`subagent_tool.rs`，并从 `agents/mod.rs` 移除三条 module 入口；旧 `Agent` 工具不再注入 `create_subagent_tool(...)` ad-hoc schema。
- `completed`：`agent-compat/src/agents/agent.rs` 删除 `TaskConfig` / `sub_recipes` 状态、`apply_recipe_components(...)` / `add_sub_recipes(...)`、本地 `CurrentAgentToolRequest` / `CallbackBackedAgentSpawn` parse/projection 和 `handle_subagent_tool(...)` fallback。`Agent` 工具正向执行改为 `execute_runtime_collab_tool(COLLAB_AGENT_TOOL_NAME, ...)`，复用 `tool-runtime::collab_agent` current owner；无 callback-backed current runtime 时 fail closed。
- `completed`：`agent-compat/src/agents/reply_parts.rs` 的 Agent 工具名改为 `tool_runtime::collab_agent::AGENT_TOOL_NAME`，不再依赖已删除的 `agents/subagent_tool.rs`。
- `completed`：清理 `agent-compat` 无消费者 provider/session public surface：删除 `providers::create_with_default_model(...)`、`ProviderEntry::create_with_default_model(...)`、`session::create_subagent_session(...)` 和 `session::SubagentSessionMetadata` re-export；内部 `SubagentSessionMetadata` 仅作为 source adapter 暂留，current read-model projection 已自行解析 extension data。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复三份 foreground subagent 文件、module 入口、`create_subagent_tool`、`handle_subagent_tool`、`run_complete_subagent_task`、`TaskConfig::new`、`CurrentAgentToolRequest`、`CallbackBackedAgentSpawn`、`ASTER_SUBAGENT_MAX_TURNS`、旧 `AgentToolOutput`、`create_with_default_model`、`create_subagent_session` 和 `SubagentSessionMetadata` root/API 出口。
- `classification`：`current` = `tool-runtime::collab_agent` + callback-backed Agent runtime；`dead / deleted / forbidden-to-restore` = Aster foreground subagent handler / task config / ad-hoc recipe delegation tool / 本地 Agent tool parser/projection / provider default-model convenience factory / subagent session create API / metadata public re-export；`compat blocker` = Aster `Agent::reply_with_provider(...)` 内部 reply loop、provider/session root 最小 re-export 与 `aster_reply_backend_adapter.rs` 最后一跳。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/foreground-subagent-removal" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`，`Finished`，耗时 `5m31s`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/exec-plans/aster-phase6-provider-reply-backend-plan.md" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`175 passed`。
- `passed`：scoped `git diff --check` 覆盖本轮 Rust / governance / roadmap 写集。
- `remaining`：R2/R3 provider/reply loop 最后一跳、R4 其他 registry fallback、R5/R6 session/runtime source 和 R7 MCP bridge 仍阻塞 root `aster` dependency 删除。骨架迁移约 `95%`；彻底搬空 `agent-compat` / 删除 root `aster` dependency 约 `89%`。

### 2026-07-11：Agent-compat root convenience API 继续收缩

- `completed`：删除无消费者 `ConversationToolResult` root alias、`conversation::ToolResult` public re-export、`RecipeBuilder` 类型和 `Recipe::builder()` builder API；root recipe 过渡面只保留仍作为 session metadata blocker 的 `Recipe` / `Response` / `SubRecipe`。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `RecipeBuilder`、`Recipe::builder()`、`pub fn builder() -> RecipeBuilder`、`ConversationToolResult` 与 `ToolResult as ConversationToolResult`。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster recipe builder convenience API 与 conversation tool result alias；`compat blocker` = `Recipe` / `Response` / `SubRecipe` DTO 仍待随 R5/R6 / reply config 迁出或删除；`current` = 后续 recipe / response schema 若需要必须进入 Thread / Turn / Item、`agent-protocol` 或 App Server owner。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/agent-compat-root-surface-trim" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`，首次冷编译通过但暴露 `conversation::ToolResult` unused re-export；删除后复跑 `Finished`，耗时 `43.76s`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`175 passed`。
- `passed`：`npx prettier --check` 覆盖治理测试与 Aster 迁移文档，scoped `git diff --check` 通过。

### 2026-07-11：R5/R6 runtime conversation read/count traversal 迁入 thread-store

- `completed`：`thread-store::runtime_store` 新增 `next_runtime_item_sequence_for_thread(...)`，把 append transcript message 所需的 item sequence 读取也收进 current store helper；`runtime_conversation.rs` 不再直接 `store.list_items(&turn.thread_id)`。
- `completed`：`aster_session_store/runtime_conversation.rs` 的 `load_runtime_conversation_from_store(...)` 与 `count_runtime_messages(...)` 改为通过 `runtime_read_store_from_aster(...)` 包装成 current `RuntimeStore` 后调用 `collect_runtime_conversation_records(...)`；删除本地 `collect_conversation_records_from_threads(...)` 和 `conversation_record_from_aster_item(...)` 单件 adapter。
- `completed`：`runtime_conversation_aster_adapter.rs` 只保留 `collect_conversation_records_from_aster_runtime_store(...)` 与 `transcript_item_record_from_aster_message(...)`；Aster item payload -> current record lowering 统一留在 `runtime_store_aster_adapter.rs::runtime_item_record_from_aster(...)`，conversation traversal 统一留在 `thread-store::runtime_store`。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止 `runtime_conversation.rs` 恢复 `impl aster::ThreadRuntimeStore`、`store.list_threads(`、`store.list_items(`、`collect_conversation_records_from_threads` 或 `conversation_record_from_aster_item`，并要求 current owner 暴露 `next_runtime_item_sequence_for_thread(...)`。
- `classification`：`current` = `thread-store::runtime_store` runtime conversation read/count traversal、sequence helper 和 item write helpers；`compat blocker` = `runtime_store_aster_adapter.rs` 的 Aster durable source lowering 与 `aster_session_store/runtime_conversation.rs` 的 Aster `Conversation` / `Message` DTO 回填；`dead / guarded` = session store 本地 Aster thread/item traversal 与单件 conversation item adapter。
- `Thread / Turn / Item`：Thread store 负责 runtime store traversal 和 transcript item sequence；Item projection 继续由 `thread-store::conversation_transcript` 负责；`aster_session_store` 只做未迁 Aster DTO 边界。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/thread-turn-ensure" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store runtime_store --lib -j 1 -- --nocapture`，`8 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_conversation_aster_adapter --lib -j 1 -- --nocapture`，`1 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_conversation --lib -j 1 -- --nocapture`，`5 passed`。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package thread-store --package lime-agent -- --check`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`175 passed`。
- `remaining`：R5/R6 仍未完成；Aster durable source、Aster `SessionStore` trait、provider/reply 对 Aster `Session` / `Message` 的依赖和 `AgentEvent` source adapter 仍阻塞 root `aster` dependency 删除。骨架迁移约 `97%`，彻底搬空 `agent-compat` / 删除 root `aster` dependency 约 `90%`。

### 2026-07-11：R5/R6 Aster SessionStore Noop/custom storage surface 删除

- `deleted`：删除无生产消费者的 `NoopSessionStore` 空实现；该类型没有 root re-export，也不属于 Codex / Lime current session owner。
- `deleted`：删除 `agent-compat/src/session/README.md`，该文档只描述旧 Aster “可插拔 SessionStore / 默认 SQLite / 自定义存储”对外用法，与 current Thread / App Server read model 路线冲突。
- `completed`：`agent-compat/src/session/mod.rs` 与 `session/store.rs` 的模块注释改为 compat blocker 口径，去掉 `NoopSessionStore` / 自定义存储推荐示例；代码 re-export 未扩张，保留现有并行写集已删除的 subagent session public API 状态。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `NoopSessionStore`、旧 custom storage 宣传文案和 `agent-compat/src/session/README.md`。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster `NoopSessionStore` 和 session README 对外使用面；`compat blocker` = 仍被 reply/session fallback 使用的 `SessionStore` trait、`SessionManager`、global store 与 update/query helper；`current` = 后续必须迁入 `thread-store` / App Server read model / `agent-runtime`。
- `remaining`：R5/R6 仍未完成；本刀只删无消费者 public surface，不拆 `SessionManager` fallback、不动 provider/reply 热区。下一刀应继续收缩 `SessionStore` trait 方法或迁出 `SessionManager::add_message/query_session/apply_session_update` 调用链。

### 2026-07-11：R5/R6 runtime status item 写入迁出 Aster Agent public method

- `completed`：`thread-store::runtime_store` 新增 `RuntimeTurnWriteStore::update_turn(...)` 与 `complete_runtime_turn_record(...)`，补齐 current turn write contract；Aster store adapter 只负责把 current turn record 降回临时 Aster durable source。
- `completed`：新增 `lime-agent/src/request_tool_policy/runtime_status_item.rs`，`AsterReplyRuntimeHost::emit_runtime_status(...)` 不再调用 `agent.upsert_runtime_status_item(...)`、不再构造 Aster `SessionConfig`，也不再通过 `project_aster_runtime_event_with_turn_context(...)` 绕回 runtime item event。RuntimeStatus item 的 ensure turn、sequence、upsert 与 Item projection 改为走 `thread-store` current helper + `runtime_store_aster_adapter`。
- `deleted`：`agent-compat::Agent::upsert_runtime_status_item(...)`、`complete_runtime_status_item(...)` 与本地 `runtime_status_item_id(...)` 已删除；这两个 public methods 已无外部调用，RuntimeStatus item 不再通过 Aster Agent public surface 写入。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 runtime status item 写入走 `request_tool_policy/runtime_status_item.rs`，并禁止 `aster_reply_adapter.rs` 恢复 `to_aster_session_config(session_config.clone())`、`project_aster_runtime_event` 或 `.upsert_runtime_status_item(`；同时禁止 `agent-compat/src/agents/agent.rs` 恢复 status item public method / local id helper。
- `classification`：`current` = `thread-store::runtime_store` turn/item write helper 与 `lime-agent::request_tool_policy::runtime_status_item` current adapter；`compat blocker` = durable source 仍通过 `runtime_store_aster_adapter` 包装 Aster `ThreadRuntimeStore`，Aster `Agent` 内部 turn/item persistence helper 与 `AgentEvent` source adapter 仍待迁出；`dead / guarded` = Lime 外部 runtime status 写入通过 Aster `Agent` public method 或 Aster event projection。
- `Thread / Turn / Item`：Turn owner 负责 status item 所属 turn ensure；Item owner 负责 `RuntimeItemPayloadRecord::RuntimeStatus` materialization 和 GUI item projection；`agent-compat` 不再拥有 Lime runtime status item 写入的外部调用点。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package thread-store --package lime-agent -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/runtime-status-current-item" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store runtime_store --lib -j 1 -- --nocapture`，`9 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`，冷编耗时 `28m37s`；本轮新增 import warning 已清理，耗时继续证明 root `aster` dependency / `agent-compat` 未搬空仍拖慢验证。
- `passed`：删除 `agent-compat::Agent` status public methods 后复跑 `cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check` 通过。
- `passed`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 1` 通过，耗时 `8m35s`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`176 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `remaining`：R5/R6 仍未完成；下一刀应继续迁出 Aster durable source、`SessionStore` trait / `SessionManager::add_message/query_session/apply_session_update` 调用链或 provider/reply 对 Aster `Session` / `Message` 的依赖。整体口径维持骨架约 `97%`，彻底搬空 `agent-compat` / 删除 root `aster` dependency约 `91%`，不能报完成。

### 2026-07-11：R5/R6 runtime request item completion 迁出 Aster Agent 内部

- `completed`：`thread-store::runtime_store` 新增 `complete_runtime_request_item_record(...)`，承接 approval / request_user_input item response payload 写入、Completed 状态、completed_at / updated_at 规则。
- `completed`：新增 `lime-agent/src/request_tool_policy/runtime_request_item.rs`，把 current completion helper 接到临时 Aster durable source adapter，再投影为 `RuntimeAgentEvent::ItemCompleted`；`stream_runtime_action_required_response_with_policy(...)` 在 current-facing action response 入口发出 completed item event。
- `completed`：`submit_runtime_tool_action_confirmation(...)` 在 Aster confirmation channel 前写入 approval item completion；`agent-compat::Agent::handle_confirmation(...)` 不再构造 completion response，也不再写 runtime item。
- `deleted`：`agent-compat::Agent::complete_runtime_request_item(...)` 已删除；`reply_with_provider(...)` 的 elicitation response 分支不再写 runtime request item completion，Aster Agent 内部不再拥有 request item completion 规则。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 request item completion 规则归 `thread-store::runtime_store`，要求 `runtime_request_item.rs` 调用 current helper，并禁止 `agent-compat/src/agents/agent.rs` 恢复 `complete_runtime_request_item`。
- `classification`：`current` = `thread-store::runtime_store::complete_runtime_request_item_record(...)` + `lime-agent::request_tool_policy::runtime_request_item` adapter；`compat blocker` = durable source 仍通过 `runtime_store_aster_adapter` 包装 Aster `ThreadRuntimeStore`，Aster `ActionRequiredManager` / confirmation channel 仍是 reply loop blocker；`dead / guarded` = Aster Agent 内部直接完成 approval / request_user_input runtime item。
- `Thread / Turn / Item`：Item owner 负责 approval / request_user_input response materialization；Turn/reply loop 只负责继续处理用户响应，不再把 Item completion 规则塞在 Aster `Agent` 内部。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package thread-store --package lime-agent --package aster-core -- --check`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store runtime_store --lib -j 1 -- --nocapture`，`10 passed`。
- `passed`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 1` 通过，复跑后 warning 清零。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`177 passed`。
- `remaining`：R5/R6 仍未完成；下一刀继续迁出 Aster durable source、Aster `SessionStore` trait 或收缩 `SessionStore` / `SessionManager` 调用链。

### 2026-07-11：R5/R6 runtime item event persistence 迁出 Aster Agent 内部

- `completed`：新增 `lime-agent/src/request_tool_policy/runtime_item_event.rs`，把 Aster `AgentEvent::{ItemStarted, ItemUpdated, ItemCompleted}` 中的原始 `ItemRuntime` 降成 `RuntimeItemSnapshotRecord`，再通过 `thread-store::runtime_store::upsert_runtime_item_record(...)` 写入 current store contract。
- `completed`：`request_tool_policy/aster_reply_stream_adapter.rs::project_aster_reply_stream(...)` 在调用 current `agent-runtime::reply_stream::project_reply_stream(...)` 前包装 source stream，先持久化原始 Aster item event，再继续投影为 `RuntimeReplyStreamEvent<RuntimeAgentEvent>`；持久化失败只 `warn`，不吞 provider/reply event。
- `deleted`：`agent-compat::Agent::persist_item_runtime(...)` 已删除，`reply_with_provider(...)` 内 user item、agent item update、open item finalize 不再直接调用 `thread_runtime_store.get_item/update_item/create_item`；Item 写入规则从 Aster Agent 内部前移到 current-facing stream boundary。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `runtime_item_event.rs` 调用 `upsert_runtime_item_record`，要求 `aster_reply_stream_adapter.rs` 调用 `runtime_item_event::persist_aster_item_event(&event)`，并禁止 `agent-compat/src/agents/agent.rs` 恢复 `persist_item_runtime` 或本地 `get_item/update_item/create_item` 分支。
- `classification`：`current` = `thread-store::runtime_store::upsert_runtime_item_record(...)` + `lime-agent::request_tool_policy::runtime_item_event` stream-boundary adapter；`compat blocker` = durable source 仍通过 `runtime_store_aster_adapter` 包装 Aster `ThreadRuntimeStore`，Aster `AgentEvent` 仍是 reply loop source；`dead / guarded` = Aster Agent 内部直接持久化 runtime item event。
- `Thread / Turn / Item`：Item owner 负责 runtime item record materialization；Turn stream boundary 只负责 source event materialization 时机；`agent-compat` 不再拥有 item persistence 规则。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package aster-core -- --check`。
- `passed`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 1`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store runtime_store --lib -j 1 -- --nocapture`，`10 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`178 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `remaining`：R5/R6 仍未完成；下一刀继续处理 runtime turn persistence、Aster durable source、Aster `SessionStore` trait、provider/reply 对 Aster `Session` / `Message` 的依赖和 `AgentEvent` source adapter。

### 2026-07-11：R5/R6 runtime turn persistence 迁出 Aster Agent 内部

- `completed`：`agent-runtime::reply_host::RuntimeReplyStartRequest` 增加 `working_directory`，`request_tool_policy/agent_reply_stream.rs` 在 first attempt 与所有 retry attempt 中传递真实工作目录，供 backend source adapter 写入 Thread record。
- `completed`：`thread-store::runtime_store::RuntimeTurnEnsureInput` 增加 `input_text` 与 `output_schema_runtime`，`ensure_runtime_turn_record(...)` 对已有 turn 只补缺失的 input/context/output schema 并更新 `updated_at`；新建 turn 时写入完整 current record。`complete_runtime_turn_record(...)` 继续作为 turn terminal status owner。
- `completed`：新增 `lime-agent/src/request_tool_policy/runtime_turn_event.rs`，把 Aster `AgentEvent::TurnStarted` 降成 current `RuntimeTurnEnsureInput` 并调用 `ensure_runtime_turn_record(...)`；`aster_reply_stream_adapter.rs` 在 source stream boundary 追踪 active turn，并在 stream 正常结束 / error / cancel 后调用 `complete_runtime_turn_record(...)`。
- `deleted`：`agent-compat::Agent::ensure_thread_runtime(...)`、`create_turn_runtime(...)`、`create_turn_runtime_for_session_id(...)`、`finalize_turn_runtime(...)` 与无消费者 `ensure_runtime_turn_initialized(...)` 已删除；`Agent` 内部不再直接 `thread_runtime_store.get_thread/upsert_thread/get_turn/create_turn/update_turn`。`Agent` 只保留纯 `build_turn_runtime(...)` 生成 Aster source event 需要的 `TurnRuntime`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 turn persistence owner 位于 `thread-store` + `request_tool_policy/runtime_turn_event.rs`，要求 start request 携带 `working_directory`，并禁止 `agent-compat/src/agents/agent.rs` 恢复旧 direct store helper / public initializer。
- `classification`：`current` = `thread-store::runtime_store::{ensure_runtime_turn_record, complete_runtime_turn_record}` + `lime-agent::request_tool_policy::runtime_turn_event` stream-boundary adapter；`compat blocker` = durable source 仍通过 `runtime_store_aster_adapter` 包装 Aster `ThreadRuntimeStore`，Aster `AgentEvent` 仍是 reply loop source；`dead / guarded` = Aster Agent 内部直接创建/完成 runtime thread/turn。
- `Thread / Turn / Item`：Thread owner 负责 thread/turn record 写入；Turn stream boundary 负责 source event materialization 和 terminal status；Item lifecycle 已由上一刀前移到 current store helper。`agent-compat` 不再拥有 runtime turn persistence 规则。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package thread-store --package lime-agent --package aster-core -- --check`。
- `passed`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p agent-runtime -p thread-store -p lime-agent --lib -j 1`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`；覆盖 inline provider start error 会预创建 current turn 并在失败时标记 failed，不再依赖 Aster Agent 内部 turn direct store helper。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store runtime_store --lib -j 1 -- --nocapture`，`10 passed`；覆盖 current turn ensure / complete、item upsert、request item completion 和 runtime conversation traversal helper。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 1 -- --nocapture`，`11 passed`；确认 reply backend contract 仍保持 Aster-free，并保留 working directory / provider path run parts。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`179 passed`；守卫已更新为要求 `project_aster_reply_stream(...)` 传入 `runtime_store`、`request.working_directory`、`request.cancel_token` 与 `initial_turn_id`，并继续禁止 Aster Agent 恢复 turn/item direct store persistence。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `remaining`：R5/R6 仍未完成；root `aster` dependency 仍被 provider/reply source、Aster durable source、Aster `SessionStore` trait、Aster `Session` / `Message` lowering 和 MCP bridge / registry fallback 阻塞。当前口径更新为骨架约 `97%`，彻底搬空 `agent-compat` / 删除 root `aster` dependency约 `92%`，不能报完成。

### 2026-07-11：R5/R6 request_policy 取消 marker 不再回退全局 Aster SessionManager

- `completed`：`request_tool_policy/aster_reply_adapter.rs::persist_cancelled_turn_context_marker(...)` 删除 `aster::SessionManager` import 和 `SessionManager::add_message(...)` fallback；取消上下文 marker 只通过当前 `Agent` 注入的 session store 写入，缺 store 时 fail closed 记录 warning，不再把 Lime request policy 重新接到 Aster global session manager。
- `guarded`：`asterMigrationBoundary.test.ts` 明确禁止 `aster_reply_adapter.rs` 恢复 `use aster::SessionManager` 与 `SessionManager::add_message`。
- `classification`：`current direction` = request policy 不再跨 crate 使用 Aster global session manager；`compat blocker` = 注入的 `SessionStore` trait 仍未迁出，取消 marker 仍暂时通过 Aster message/session DTO 写入 runtime transcript；`dead / guarded` = request policy 直接调用全局 Aster `SessionManager::add_message(...)`。
- `Thread / Turn / Item`：取消 marker 是 transcript Item，读取仍由 current runtime conversation projection 消费；本刀只收掉全局 Aster session fallback，不宣称 `SessionStore` trait 已迁完。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check`。
- `passed`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture`，`81 passed`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`179 passed`。
- `remaining`：R5/R6 下一刀继续迁出注入 `SessionStore` trait、`query_session` / `apply_session_update` helper 和 provider/reply 对 Aster `Session` / `Message` 的依赖。

### 2026-07-11：R5/R6 Agent session helper 不再回退全局 SessionManager

- `completed`：`agent-compat/src/agents/agent.rs` 的 `store_add_message(...)`、`store_get_session(...)`、`store_replace_conversation(...)`、`store_update_extension_data(...)`、`store_update_provider_config(...)` 全部改为只使用注入的 `SessionStore`；缺 store 时 fail closed 并记录 warning，不再走 `SessionManager::add_message`、`query_session`、`replace_session_conversation` 或 `apply_session_update`。
- `completed`：history replacement 分支不再在 `session_store` 缺失时调用 `query_session(...)`；session name generation 后台任务不再调用 `SessionManager::maybe_update_name_for_session(...)`，而是用注入 store 执行 `update_session_name(...)`。
- `completed`：`agents/reply_parts.rs::update_session_metrics(...)` 删除 `query_session(...)` / `apply_session_update(...)` fallback，token metrics 写回必须走注入 `SessionStore::update_token_stats(...)`。
- `completed`：`agents/execute_commands.rs` 的 `/clear` token reset 不再 fallback 到 `apply_session_update(...)`，只使用注入 `SessionStore::update_token_stats(...)`；缺 store 时 fail closed。
- `deleted`：无生产消费者的 `delete_managed_session(...)` 与 `replace_session_conversation(...)` 从 `agent-compat/src/session/update.rs` 删除；`apply_session_update(...)` 降为 `session/update.rs` 私有 helper，`session/mod.rs` 不再 re-export `apply_session_update` 或 `replace_session_conversation`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent.rs` / `reply_parts.rs` 不得恢复 `SessionManager::add_message`、`SessionManager::maybe_update_name_for_session`、`query_session(`、`apply_session_update(`、`replace_session_conversation(`，要求 `execute_commands.rs` 不得恢复 `apply_session_update(`，并要求缺 store 时的 fail-closed 文案存在；同时禁止 `session/update.rs` 恢复 public `apply_session_update`、`delete_managed_session` / `replace_session_conversation` 和 `SessionManager::replace_conversation`。
- `classification`：`current direction` = reply/session 写入只允许通过注入 current store adapter；`compat blocker` = `SessionStore` trait、Aster `Session` / `Message` DTO、`SessionManager` 内部全局 fallback 与 team/chatrecall staging helper 仍未迁出；`dead / guarded` = Agent / reply_parts 重新回退全局 Aster SessionManager 或恢复无消费者 session update convenience API。
- `Thread / Turn / Item`：Thread owner 继续承接 session metadata / transcript 写入；Turn / reply loop 只消费注入 store，不再自行寻找 Aster global durable source；Item transcript marker 和 metrics projection 仍需后续去 Aster DTO 化。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check`。
- `passed`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 1`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`179 passed`。
- `passed`：`rg -n "SessionManager::add_message|SessionManager::maybe_update_name_for_session|query_session\\(|apply_session_update\\(|replace_session_conversation\\(" "lime-rs/crates/agent-compat/src/agents/agent.rs" "lime-rs/crates/agent-compat/src/agents/reply_parts.rs"` 无命中。
- `passed`：`rg -n "pub async fn delete_managed_session|pub async fn replace_session_conversation|SessionManager::replace_conversation" "lime-rs/crates/agent-compat/src/session/update.rs"` 无命中。
- `remaining`：R5/R6 仍未完成；下一刀继续处理 `SessionManager` 内部 fallback、Aster durable source、`SessionStore` trait，或直接转入 provider/reply session/message lowering 去 Aster 化。

### 2026-07-11：R5/R6 team/chatrecall 不再回退全局 SessionManager

- `completed`：`agent-compat/src/tools/agent_control.rs`、`tools/team_tools.rs` 与 `session/team.rs` 均改为只消费注入的 `SessionStore`；local peer、team context、team membership、team list/clear/save 和 Team tools 缺 store 时 fail closed，不再回退 `query_session(...)`、`SessionManager::*` 或 `persist_session_extension_data(...)`。
- `completed`：`PlatformExtensionContext` 增加 `session_store`，`Agent` 在 extension add/list/dispatch 前同步当前 `session_id`、注入 store 和 extension manager weak ref；`chatrecall_extension.rs` 的 load/search 均通过 context store 执行，搜索继续走 `LimeSessionStore::search_chat_history(...)` / `thread-store::history_search` current owner。
- `deleted`：`agent-compat/src/session/update.rs` 与 `session/query.rs` 已物理删除；`session/mod.rs` 不再 `mod update` / `mod query`，也不再 re-export `query_session`、`SessionUpdateBuilder` 或 session update convenience API。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `session/update.rs`、`session/query.rs`、`SessionUpdateBuilder`、`query_session(`、agent/team/chatrecall 的 `SessionManager` fallback，并要求缺注入 store 的 fail-closed 文案存在。
- `classification`：`current direction` = session / chat history 读取继续压到注入 store adapter 和 `thread-store::history_search`；`compat blocker` = Aster `SessionStore` trait、平台 MCP extension bridge、Aster durable source 与 provider/reply Aster `Session` / `Message` lowering；`dead / guarded` = 全局 `query_session` helper、session update convenience 文件、team/chatrecall 直接调用全局 `SessionManager`。
- `Thread / Turn / Item`：Thread owner 继续承接 session metadata/history search；Turn 的 MCP extension dispatch 只同步 context，不持有 session durable source；Item/read model 仍需后续把 chat history 展示和 provider/reply session DTO 去 Aster 化。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check`。
- `passed`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 1`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`179 passed`。
- `remaining`：R5/R6 仍未完成；下一刀优先迁出 `SessionManager` 内部 global fallback / durable source，或者处理 provider/reply backend 对 Aster `Session` / `Message` 的最后 lowering。

### 2026-07-11：R5/R6 subagent session lookup 不再回退全局 SessionManager

- `completed`：`agent-compat/src/session/subagent.rs::resolve_named_subagent_child_session(...)` 改为接收 `&dyn SessionStore`；内部 `list_subagent_child_sessions(...)` 只通过注入 store 的 `list_sessions_by_types(&[SessionType::SubAgent])` 读取命名子 agent session。
- `completed`：`agent-compat/src/tools/agent_control.rs` 在解析命名子 agent 路由时传入当前 `session_store`，与 agent/team/chatrecall 的注入 store 口径一致。
- `deleted`：无生产消费者的 `list_subagent_sessions_with_metadata(...)` 已删除；`session/subagent.rs` 不再 import 或调用 `SessionManager`。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止 `session/subagent.rs` 恢复 `SessionManager`、`list_subagent_sessions_with_metadata`，并要求 `resolve_named_subagent_child_session(session_store, session_id, target)` 形状存在。
- `classification`：`current direction` = subagent session lookup 继续压到注入 current store adapter；`compat blocker` = Aster `SessionStore` trait、root `SessionManager` re-export、`session_manager.rs` 内部 global fallback、Aster durable source；`dead / guarded` = subagent helper 自己调用全局 `SessionManager::list_sessions_by_types(...)`。
- `Thread / Turn / Item`：Thread owner 继续负责 session metadata / subagent relationship；Turn collab tool 只消费注入 store，不再自行寻找全局 durable source。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check`。
- `passed`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 1`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`179 passed`。
- `remaining`：R5/R6 下一刀应继续迁出 Aster `SessionStore` trait / durable source，或转向 provider/reply backend 对 Aster `Session` / `Message` 的最后 lowering；不得恢复 `session_manager.rs` 或 root `SessionManager` re-export。

### 2026-07-11：R5/R6 SessionManager convenience/update/search 面删除

- `completed`：`agent-compat/src/session/session_manager.rs` 删除无外部生产消费者的 `SessionUpdateBuilder`、`SessionManager::update_session(...)`、`apply_update(...)`、`maybe_update_name(...)`、`maybe_update_name_for_session(...)`、`SessionManager::search_chat_history(...)`、`can_apply_update_via_store(...)` / `apply_update_via_store(...)` 和底层 `SessionStorage::apply_update(...)`。
- `deleted`：`agent-compat/src/session/chat_history_search.rs` 与 `session/mod.rs` 里的 `mod chat_history_search;` 已删除。ChatRecall 搜索当前只允许经注入 `SessionStore::search_chat_history(...)` 进入 `lime-agent::aster_session_store::history_search` / `thread-store::history_search` current owner。
- `cleanup`：`session_manager.rs` 从 `1439` 行降到 `950` 行，回落到 Rust 文件 `1000` 行治理红线以下；本刀只做删除收缩，没有向该巨型 compat 文件追加新业务逻辑。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `session/chat_history_search.rs`、`mod chat_history_search;`、`SessionUpdateBuilder`、`pub fn update_session`、`async fn apply_update`、`can_apply_update_via_store`、`apply_update_via_store`、`pub async fn maybe_update_name` 和 `pub async fn search_chat_history`。
- `classification`：`current direction` = session name/token/provider/team/chatrecall 的读写继续通过注入 current store adapter；`dead / guarded` = Aster session convenience builder、批量 update wrapper、Aster SQLite chat history search wrapper；`compat blocker` = root `SessionManager`、global create/get/list/delete fallback、Aster `SessionStore` trait、Aster durable source 与 provider/reply Aster `Session` / `Message` lowering。
- `Thread / Turn / Item`：Thread owner 继续承接 history search / session metadata；Aster `SessionManager` 不再持有 chat history search 或 session update policy；但 durable source 还没有迁完，不能关闭 R5/R6。
- `passed`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 1`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`179 passed`。
- `passed`：`rg -n "SessionUpdateBuilder|pub fn update_session|async fn apply_update|can_apply_update_via_store|apply_update_via_store|pub async fn maybe_update_name|SessionManager::maybe_update_name_for_session|SessionManager::search_chat_history|chat_history_search|ChatHistorySearch|ChatRecallResults" "lime-rs/crates/agent-compat/src" "lime-rs/crates/agent/src"` 仅命中 `lime-agent` current `session_store.rs` 的 `update_session_*` helper 命名，不命中 Aster compat 残留。
- `remaining`：R5/R6 下一刀应继续盘点注入 `SessionStore` 仍承担的 Aster DTO / durable source 入口，优先迁到 current Thread/App Server owner，或处理 provider/reply backend 对 Aster `Session` / `Message` 的最后 lowering；`SessionManager::{create_session,get_session,add_message,replace_conversation,list_sessions,list_sessions_by_types,delete_session,get_insights}` 所在文件已删除，不再作为可修补 compat 面。

### 2026-07-11：R5/R6 SessionManager 文件整体删除

- `completed`：`agent-compat/src/session/session_manager.rs` 已删除，`session/mod.rs` 只声明 `mod session_record;` 并只导出 `Session` / `SessionType` DTO；root `agent-compat/src/lib.rs` 不再 re-export `SessionManager`。
- `completed`：`SessionInsights` Aster DTO 已删除；`Session` / `SessionType` DTO 保留在 `agent-compat/src/session/session_record.rs`，只服务 provider/reply session lowering 尚需的最小数据形状；该文件不包含 `SessionManager` / `SessionStorage` / `SessionInsights` / `SessionUpdateBuilder` / update/search convenience。
- `completed`：`agent-compat/src/session/legacy.rs` 已删除；旧 JSONL legacy session import 只服务已删除的 `SessionStorage::import_legacy(...)`，不进入 current Thread owner。
- `completed`：`store.rs` 删除 global `SessionStore` OnceCell、`install_global_session_store(...)`、`get_global_session_store(...)` 和 `is_global_session_store_set(...)`；`bootstrap.rs` 不再接收或安装 `session_store`，`initialize_shared_session_runtime_with_root(...)` 只初始化 runtime root / runtime store。
- `completed`：`lime-agent::runtime_store_aster_adapter::initialize_aster_runtime_with_root(...)` 与 `runtime_support::initialize_agent_runtime(...)` 不再把 `LimeSessionStore` cast 成 Aster `SessionStore` 写入 global；`initialize_agent_runtime(_db)` 暂保外部签名，但 `_db` 不再作为 global store 续命入口。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `session_manager.rs`、`mod session_manager;`、root `SessionManager` re-export，以及在 `session_record.rs` 中恢复 manager/storage/`SessionInsights`/update/search 逻辑。
- `classification`：`current direction` = Thread/session read/write 继续压到注入 store adapter 与 `thread-store` / App Server owner；`dead / deleted / guarded` = Aster global `SessionManager`、`SessionStorage`、update builder、chat history search wrapper 和 query/update convenience；`compat blocker` = Aster `SessionStore` trait、Aster durable source、provider/reply Aster `Session` / `Message` lowering 和 `AgentEvent` source adapter。
- `Thread / Turn / Item`：Thread owner 继续承接 session metadata / history search；Turn/provider 仍需消除 Aster `Session` / `Message` lowering；Item/read model 不得通过 Aster manager 旁路读取。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/runtime-snapshot-fixture-current" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/exec-plans/aster-phase6-provider-reply-backend-plan.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`179 passed`。
- `remaining`：R5/R6 下一刀优先处理 Aster `SessionStore` trait / durable source 的 current owner 替换，或 provider/reply backend 的 Aster `Session` / `Message` lowering；不要再把已删除 manager 文件当作 compat 续命点。

### 2026-07-11：R5/R6 SessionInsights DTO 删除口径同步

- `completed`：代码扫描确认 `agent-compat/src/session/session_record.rs`、`session/mod.rs` 和 root `lib.rs` 已不再定义或导出 `SessionInsights`；`src/lib/governance/asterMigrationBoundary.test.ts` 已把 `SessionInsights` 纳入 Aster SessionStore orphan surface 禁止恢复清单。
- `classification`：`current` = `thread-store::session_insights::SessionInsightsRecord` / `project_session_insights(...)`；`dead / guarded` = Aster `SessionInsights` DTO、Aster `SessionStore::get_insights` 和 Aster trait adapter 内的 insights SQL loader；`compat blocker` = Aster `SessionStore` trait、durable source、provider/reply Aster `Session` / `Message` lowering 与 `AgentEvent` source adapter。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`181 passed`。
- `remaining`：R5/R6 仍未完成；下一刀继续迁出 Aster `SessionStore` trait / durable source，或处理 provider/reply backend 的 Aster `Session` / `Message` lowering。

### 2026-07-11：R5/R6 SessionStore orphan convenience 删除

- `completed`：`agent-compat/src/session/store.rs` 删除无生产消费者的 `list_sessions`、`delete_session`、`get_insights`、`update_working_dir`、`update_session_type` 和 `update_recipe` trait 方法；`lime-agent/src/aster_session_store/aster_trait.rs` 与 `request_tool_policy.rs` 测试 fake 同步删除对应实现。
- `completed`：`lime-agent/src/session_record_sql.rs` 删除只服务 Aster `get_insights` 的 `load_session_insights_record(...)` 和旧测试；`aster_session_store_tests.rs` 删除 recipe / working_dir / session_type 旧正向用例，只保留仍在生产链上的 metadata/token/provider/list_by_types 覆盖。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 orphan surface 禁止恢复清单，覆盖 trait、adapter、测试 fake、旧正向测试、`session_record_sql.rs`、root/session DTO re-export。
- `classification`：`dead / deleted / guarded` = Aster `SessionInsights` DTO、SessionStore orphan convenience surface、insights SQL loader；`compat blocker` = Aster `SessionStore` trait 剩余 create/get/add/replace/list_by_types/update_name/extension/token/provider/search surface、Aster durable source、provider/reply Aster `Session` / `Message` lowering 与 `AgentEvent` source adapter。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/session-store-trait-surface-trim" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/session-store-trait-surface-trim" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent aster_session_store --lib -j 2 -- --nocapture`，`14 passed`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`182 passed`。
- `remaining`：R5/R6 下一刀应继续迁出仍有生产消费者的 `SessionStore` 最小 surface，优先处理 durable source / provider-reply `Session`、`Message` lowering；不得把已删除 orphan convenience 方法恢复为“兼容”。

### 2026-07-11：R5/R6 runtime status item 记录 owner 下沉

- `completed`：新增 `thread-store/src/runtime_status_item.rs`，承接 runtime status item 的 `turn_summary:<turn_id>` id、create/update 判定、existing sequence 复用、缺失时按 thread 分配下一 sequence、`RuntimeItemPayloadRecord::RuntimeStatus` 构造和 upsert。
- `completed`：`lime-agent/src/request_tool_policy/runtime_status_item.rs` 不再直接构造 `RuntimeItemSnapshotRecord`，也不再直接调用 `next_runtime_item_sequence_for_thread(...)` / `upsert_runtime_item_record(...)`；它只确保 current turn/thread 后调用 `upsert_runtime_status_item_record(...)`，再把 current record 投影成 `ItemStarted` / `ItemUpdated`。
- `cleanup`：`thread-store/src/runtime_store.rs` 已约 `827` 行，本刀按 crate 抗膨胀规则没有继续追加逻辑，而是拆出 `runtime_status_item` 小模块。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `thread-store::runtime_status_item` 存在并持有 status item payload/upsert owner，同时禁止 `lime-agent` writer 重新直接构造 `RuntimeItemPayloadRecord::RuntimeStatus` 或直接计算 sequence。
- `classification`：`current` = `thread-store::runtime_status_item` 与 `thread-store::runtime_store` turn/item helper；`transitional current adapter` = `request_tool_policy/runtime_status_item.rs`；`compat blocker` = Aster durable source 仍经 `AsterThreadRuntimeStore` 包装；`dead / guarded` = Aster Agent public status item method、本地 id/sequence/payload 规则回流到 Aster adapter。
- `Thread / Turn / Item`：Thread store 提供持久化边界；Turn 仍由 `ensure_runtime_turn_record(...)` materialize；Item 的 runtime status payload 由 current owner 生成，GUI / Evidence 只消费投影后的 item event。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package thread-store --package lime-agent -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/runtime-status-item-current-owner" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store runtime_status_item --lib -j 2 -- --nocapture`，`2 passed`。
- `passed`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2 -- --nocapture`，`81 passed`。
- `passed`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p thread-store -p lime-agent --lib -j 2` 通过，耗时 `7m06s`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`183 passed`。
- `remaining`：R5/R6 仍需迁出 Aster durable source、`SessionStore` trait 剩余 surface、provider/reply Aster `Session` / `Message` lowering 和 `AgentEvent` source adapter；本刀不宣称 Phase 6 完成。

### 2026-07-11：R4 ActionRequiredManager 无 scope convenience 删除

- `completed`：`agent-compat/src/action_required_manager.rs` 删除 `request_and_wait(...)` / `submit_response(...)` 两个无 scope convenience；真实入口只保留 `request_and_wait_scoped(...)`、`submit_response_scoped(...)` 和 `drain_messages_for_scope(...)`。
- `Codex 对照`：Codex current 的 `request_user_input` / MCP elicitation 按 thread、turn、request context 处理，不提供 Aster 式全局无 scope HITL helper；Lime 只保留迁移期 scope adapter，避免回到全局隐式分发。
- `guarded`：`asterMigrationBoundary.test.ts` 新增守卫，禁止恢复无 scope方法或 `ActionRequiredScope::default()` fallback。
- `classification`：`compat blocker` = `RequestUserInputCallback` 配置字段与 `ActionRequiredManager` scope adapter；`dead / guarded` = 无 scope `request_and_wait` / `submit_response` convenience。
- `Thread / Turn / Item`：Turn/action_required 继续按 thread/turn/request scope 路由；Item/read model 只消费 scoped action_required / answer projection。
- `remaining`：这一步只削薄 request_user_input bridge；R4 其余 Aster `ToolRegistry` fallback、MCP source adapter、workspace sandbox backend 仍未完成，root `aster` dependency 不能删除。

### 2026-07-11：R4/R7 Aster inline Python extension 删除

- `completed`：删除 `ExtensionConfig::InlinePython`、`ExtensionConfig::inline_python(...)` constructor、recipe `inline_python` 反序列化入口、extension manager 中 `uvx --with mcp` 临时 Python 文件执行分支，以及 tool inventory 对该 variant 的投影。
- `Codex 对照`：Codex current extension 只有 typed skills / memories / web-search / image-generation / goal 等 extension config；没有 Aster 式 `inline_python` 任意代码 MCP extension 配置。Lime MCP source adapter 只允许继续保留 `stdio` / `streamable_http` / `builtin` / `platform` / `frontend` 过渡面。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `InlinePython` / `inline_python`、extension manager `Command::new("uvx")`、`command.arg("--with").arg("mcp")`、`tempdir()` 和临时 Python 文件写入路径。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster inline Python extension surface；`compat blocker` = Aster extension manager / MCP client bridge 仍是未迁 reply-loop MCP source adapter；`current` = `lime-mcp`、App Server MCP gateway、`tool-runtime::{mcp_resource,tool_search,tool_extension}`。
- `Thread / Turn / Item`：Turn 工具生命周期不再接受 Aster inline Python extension config；Item/tool inventory 只投影 remaining MCP extension config，不把已删 variant 暴露给 GUI / Evidence。
- `passed`：`rg -n "InlinePython|inline_python|pub fn inline_python|Command::new\\(\\\"uvx\\\"\\)|arg\\(\\\"--with\\\"\\)\\.arg\\(\\\"mcp\\\"\\)|tempdir\\(\\)|std::fs::write\\(&file_path" ...` 在本刀四个源码文件中无命中。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/inline-python-extension-removal" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2`，`Finished`，耗时 `13m41s`；共享 target 的同命令因等待隔壁构建锁中止，不作为失败。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`183 passed`。
- `remaining`：R4/R7 仍未完成；下一刀继续把 Aster extension manager / MCP client bridge 迁到 `lime-mcp` / App Server / `tool-runtime` current gateway，或转向 R2/R3 provider reply backend。root `aster` dependency 仍不能删除。

### 2026-07-11：R4/R7 Aster SSE extension config 删除

- `completed`：删除 `ExtensionConfig::Sse`、`#[serde(rename = "sse")]` config variant、extension manager 的 `SSE is unsupported, migrate to streamable_http` fail-closed 分支、disabled extension 展示文案、config warning 分支，以及 `lime-agent` tool inventory 对 `AsterExtensionConfig::Sse` 的投影。
- `Codex 对照`：Codex `McpServerTransportConfig` 只有 `Stdio` 与 `StreamableHttp`，没有 Aster 独立 `sse` MCP server config；Codex 代码中的 `sse` 命中属于 provider / response event stream 测试与解析，不是 MCP extension transport owner。
- `guarded`：`asterMigrationBoundary.test.ts` 将 `sse` 纳入 Aster-only extension 禁止恢复清单，覆盖 `serde(rename = "sse")`、`ExtensionConfig::Sse`、`AsterExtensionConfig::Sse`、旧 SSE unsupported 文案和 inventory adapter 投影。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster SSE extension config surface；`current` = streamable HTTP MCP transport / `tool-runtime::tool_extension` DTO / `lime-mcp` 与 App Server MCP gateway；`compat blocker` = Aster extension manager / MCP client bridge source adapter 仍未迁完。
- `Thread / Turn / Item`：Turn 工具生命周期只保留 current `streamable_http` / `stdio` 等 remaining MCP source adapter；Item/tool inventory 不再展示或归一化 SSE variant；Thread 不承接旧配置兼容。
- `passed`：`rg -n "ExtensionConfig::Sse|serde\\(rename = \\\"sse\\\"\\)|SSE is unsupported|SSE extension|AsterExtensionConfig::Sse" "lime-rs/crates/agent-compat/src" "lime-rs/crates/agent/src"` 无命中。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`183 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/sse-extension-removal" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2` 通过，耗时 `7m47s`。
- `remaining`：R4/R7 仍未完成；下一刀继续迁出 Aster extension manager / MCP client bridge 到 `lime-mcp` / App Server / `tool-runtime` current gateway，或回到 R2/R3 provider reply backend。root `aster` dependency 仍不能删除。

### 2026-07-11：R4/R7 extension config convenience 删除

- `completed`：`agent-compat/src/config/extensions.rs` 删除无生产消费者的 `get_warnings()`、`get_enabled_extensions()`、`get_all_extension_names()` 和 config-level `is_extension_enabled(key)`；删除 SSE 后这些 helper 只会保留旧 config query / warning 面，不能继续作为 MCP current owner。
- `Codex 对照`：Codex 的 MCP config 由 typed transport/config 直接进入 runtime owner，不提供 Aster 式全局 extension warning/query convenience；Lime current 只允许 `tool-runtime::tool_extension`、`lime-mcp` 和 App Server MCP gateway 持有 extension/tool inventory 事实源。
- `guarded`：`asterMigrationBoundary.test.ts` 将上述 helper 纳入 Aster-only extension config surface 禁止恢复清单，同时仍允许 `ExtensionManager::is_extension_enabled(&self, name)` 作为尚未迁完的 MCP source adapter 内部状态查询。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster extension config warning/query convenience；`current` = `tool-runtime::tool_extension` / `lime-mcp` / App Server MCP gateway；`compat blocker` = Aster extension manager / MCP client bridge source adapter 仍未迁完。
- `Thread / Turn / Item`：Thread 不承接旧 config query/warning；Turn 只保留 MCP source adapter；Item/tool inventory 不再消费空 warning/query helper，后续只能消费 current extension DTO / gateway projection。
- `passed`：`rg -n "is_extension_enabled|get_warnings|get_enabled_extensions|get_all_extension_names" "lime-rs/crates/agent-compat/src" "lime-rs/crates/agent/src"` 只剩 `ExtensionManager::is_extension_enabled` 与真实调用，不命中已删 config helper。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/extension-config-convenience-removal" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `passed`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`183 passed`。
- `progress`：骨架迁移仍约 `97%`；彻底搬空 `agent-compat` / 删除 root `aster` dependency 约 `93.5%`。本刀只减少 R4/R7 周边旧面，不改变 R2/R3 provider reply、R4/R7 MCP bridge、R5/R6 session/runtime source 仍 open 的事实。
- `remaining`：下一刀应继续迁出 Aster extension manager / MCP client bridge 到 current gateway，或转向 R2/R3 `run_aster_reply_backend(...)` 最后一跳；不要再清低杠杆 helper 替代主链迁移。

### 2026-07-11：R4/R7 MCP extension surface owner 下沉到 lime-mcp

- `completed`：新增 `lime-rs/crates/mcp/src/extension_surface.rs`，承接 MCP runtime extension name 与 `McpToolDefinition` -> `RuntimeExtensionConfig` surface 构造；`lime-mcp` 通过 `tool-runtime::tool_extension` DTO 复用 available/deferred/always_visible/allowed_caller 折叠规则。
- `completed`：`lime-agent/src/mcp_bridge.rs`、`agent_tools/tool_inventory_runtime_snapshot.rs` 与 `agent_tools/inventory.rs` 改为调用 `lime_mcp::{runtime_extension_name, build_runtime_extension_surface}`；`agent_tools/catalog.rs` 删除 `mcp_extension_runtime_name(...)`、`mcp_extension_inner_tool_name(...)`、`build_mcp_extension_surface(...)` 及其旧正向测试。
- `guarded`：`asterMigrationBoundary.test.ts` 升级为检查 MCP-specific surface 构造归属 `lime-mcp::extension_surface`，DTO 归属 `tool-runtime::tool_extension`，并禁止 `lime-agent catalog` 恢复旧 helper / `RuntimeExtensionToolSurface::new` / `RuntimeExtensionConfig::from_tool_surfaces` owner。
- `Codex 对照`：Codex MCP current 分层把 MCP runtime/config/client 放在 MCP owner 边界，transport 只采用 `stdio` / `streamable_http`；Lime 本刀把 extension surface 构造从 agent catalog 移到 `lime-mcp`，继续向 Codex-style MCP owner 收敛。
- `classification`：`current` = `lime-mcp::extension_surface` + `tool-runtime::tool_extension` DTO；`transitional adapter` = `lime-agent/src/mcp_bridge.rs` 仍把 current registration 降成 Aster `ExtensionConfig::Builtin`；`compat blocker` = Aster extension manager / `McpClientTrait` / root `ExtensionConfig` source adapter；`dead / guarded` = `lime-agent::agent_tools::catalog` 重新拥有 MCP extension surface 构造规则。
- `Thread / Turn / Item`：Turn tool lifecycle 的 MCP bridge / extension sync surface 归 `lime-mcp` + `tool-runtime`；Item/tool inventory 继续消费 current `RuntimeExtensionConfig`；Thread 不承接 MCP extension surface 规则。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-mcp --package lime-agent -- --check`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/mcp-extension-surface-owner" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp extension_surface --lib -j 2 -- --nocapture`，`6 passed`。
- `passed`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=1 CARGO_TARGET_DIR=".lime/cargo-target/mcp-extension-surface-owner" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 1`，`Finished`，耗时 `12m07s`；首次 `-p lime-mcp -p lime-agent` check 命中本地 rustc/dep-info 文件不存在的环境性失败，未暴露代码错误。
- `progress`：骨架迁移仍约 `97%`；彻底搬空 `agent-compat` / 删除 root `aster` dependency 约 `94%`。本刀减少 R4/R7 owner 错位，但 Aster extension manager / `McpClientTrait` 执行桥仍未迁完。
- `remaining`：下一刀继续把 Aster extension manager / MCP client execution source adapter 迁到 `lime-mcp` / App Server / `tool-runtime` current gateway，或转向 R2/R3 `run_aster_reply_backend(...)` 最后一跳；root `aster` dependency 仍不能删除。

### 2026-07-12：R2/R4 provider 与 tool 目录整体删除

- `completed`：物理删除 `agent-compat/src/providers/**` 与 `agent-compat/src/tools/**`；`lib.rs` 不再声明或 re-export `providers`。Aster concrete provider、factory、registry、wire-format、toolshim、Tool trait registry、shell/read/search/ask/task/web 等目录实现均不再存在。
- `completed`：`reply_provider.rs` 只保留 R2/R3 reply loop 需要的协议形状；`create(...)` 明确 fail closed，不再构造 Aster concrete provider，provider stream notification 仅委托 `model-provider` helper。无生产消费者的 `config::declarative_providers` / `DeclarativeProviderConfig` 一并删除。
- `classification`：`current` = `model-provider` provider stream / metadata contract、App Server provider/settings backend、`tool-runtime` native tool execution；`compat blocker` = `reply_provider.rs`、Aster `Message` / `Session` lowering 与 `run_aster_reply_backend(...)`；`dead / deleted / forbidden-to-restore` = `providers/**`、`tools/**`、declarative provider、Aster factory/toolshim/registry surface。
- `guarded`：`asterMigrationBoundary.test.ts` 改为目录级删除守卫，禁止 `mod providers;`、`aster::providers::*`、Aster concrete factory/toolshim 与 declarative provider 回流，同时保留 current owner 正向断言。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check`；`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/provider-dir-delete-check" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2`；`asterMigrationBoundary.test.ts`，`183 passed`。
- `progress`：骨架迁移约 `97%`；彻底搬空 `agent-compat` / 删除 root `aster` dependency 保守调整为约 `90%`。目录级删除完成不代表 Phase 6 或 R2/R3 完成。
- `next`：回到 R2/R3，用 current provider/reply backend 替换 `run_aster_reply_backend(...)` 内的 provider trait、`Message` / `Session` lowering 与 `reply_with_provider(...)`；不得通过重建 provider/tools 目录续命。
