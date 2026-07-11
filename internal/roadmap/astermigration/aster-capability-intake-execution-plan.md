# Aster 能力接收迁移执行计划

状态：in_progress
创建时间：2026-07-05
策略文档：`internal/roadmap/astermigration/aster-capability-intake-strategy.md`
refactor v1 影响审计：`internal/roadmap/astermigration/refactor-v1-impact-audit.md`
路线图：`internal/roadmap/astermigration/README.md`

> 2026-07-09 起，本文件作为历史执行计划和能力迁移基线保留；Phase 6 剩余 blocker 与新进度改写入 `phase6-continuation-tracker.md`，避免继续扩展本文件。

## 主目标

按 Codex-first 能力矩阵继续迁移 Aster：先对照 `/Users/coso/Documents/dev/rust/codex`，Codex 有的 agent / provider / tool / session 能力迁入 Lime-owned current crates，并接入 App Server / 前端 / Evidence / runtime 至少一条真实消费链；Codex 没有的 Aster-only 能力直接删除并补 forbidden-to-restore 守卫。Aster 只保留仍被 `lime-agent` compat adapter 编译依赖的最小面，最终删除 root workspace `aster` dependency。

这里的 Lime-owned current crates 不包含 `agent-compat`。`agent-compat` 只是待迁出 staging / compat blocker；保留它只能用于定位剩余 `use aster::...` 命中和拆迁顺序，不能作为 current owner、迁移完成态或新增业务逻辑落点。

## 本计划的事实源声明

后续迁移只能向以下 current owner 收敛：

- `agent-runtime`：turn orchestration、agent action、subagent 编排、runtime event stream。
- `agent-protocol`：稳定 wire DTO、event/action/read model、provider/tool/session 共享协议。
- `model-provider`：provider registry、provider request/response、reply stream、模型能力描述。
- `tool-runtime`：tool definition、registry executor、permission preflight、shell/process/MCP bridge、tool result/error。
- `thread-store`：session、thread、turn、message、runtime snapshot、artifact/checkpoint persistence。
- App Server JSON-RPC：桌面 GUI / evidence / replay / analysis 的唯一 runtime 入口。

vendored Aster / `agent-compat` 只允许作为 `compat-blocker` 或 `valuable-reference`，不得继续作为 current runtime 事实源。

能力去留判定固定为 **Codex 有则迁，Codex 没有则删**：

- Codex 有：迁入上述 current owner，命名优先使用 Codex 风格短领域词；迁移完成必须有真实前后端或 Evidence / runtime 消费链。
- Codex 无：标记 `aster-only-dead`，同步删除 vendor 实现、catalog alias、前端 normalization/display/summary 和正向测试，不保留 compat 壳。
- 同名不同义：按 Codex 语义重建。例如 `sleep` 只能按 Codex `clock.sleep` / duration tool 口径处理，不能恢复 Aster `SleepTool`。
- 命名审查：Aster 的简洁命名是品味参考，不是实现事实源；current API 禁止继续使用 `lime_*`、`aster_*`、`agent_runtime_*` 或冗长历史词，除非有外部协议约束和退出条件。

本计划同时受 `internal/research/refactor/v1` 约束：后续每一刀都必须说明 Thread / Turn / Item 归属；已迁能力若只是为了搬空 Aster 而临时落在 `lime-agent` adapter 内，必须标为 `transitional current adapter`，不能误报为最终 refactor owner。具体复核见 `refactor-v1-impact-audit.md`。

## 当前基线

最新校准口径：骨架迁移完成度约 `97%`，彻底搬空 `agent-compat` / 删除 root `aster` dependency 约 `94.2%`；本文件后续只保留能力接收历史和新增批次记录，当前剩余 blocker 以 `phase6-continuation-tracker.md` 为准。当前扫描按排除独立测试文件和内联 `#[cfg(test)]` 的生产口径仍有 `50` 处 `use aster::`，另有 `13` 处独立测试 fixture 命中；root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、provider/reply loop、Aster extension manager / MCP client bridge、Aster `SessionStore` / runtime durable source、Aster `Session` / `Message` lowering、`AgentEvent` source adapter、generic `ToolRegistry` fallback 与 root `Tool` / `ToolContext` allowlist 仍未清零，不能按 `99%` 或完成态汇报。`agent-compat/src/tools/{agent_control.rs,team_tools.rs}` 已删除并迁到 `agents/{collab_runtime.rs,team_runtime.rs}` transitional adapter，`tools` 目录当前只剩 Aster trait / context / error / registry 壳。

已完成：

- `agent-protocol`、`model-provider`、`thread-store`、`tool-runtime`、`agent-runtime` 一等 workspace crate 骨架已建立。
- `app-server` / `services` / `server` / `scheduler` 已基本迁出 direct Aster dependency。
- tool execution policy、shell/path/process/shell runtime 等多批能力已迁入 `tool-runtime`。
- WebSearch / WebFetch current executor 已进入 `tool-runtime`；WebSearch 已被 WebSearch preflight 与 workspace patch host 两条 Lime 后端主链真实消费，WebFetch/WebSearch 在当前 Aster reply loop 中的临时 `Tool` 创建已统一到 `runtime_overlay.rs` + `runtime_tool_bridge.rs`，`native_tools/web_retrieval.rs` 已删除，联网确认 / turn policy 权限规则归属 `tool-runtime::native_overlay::check_runtime_native_tool_permissions(...)`，`runtime_tool_bridge.rs` 只把 current decision 转成临时 Aster `PermissionCheckResult`。
- `agent_tools/tool_orchestrator/aster_registry_adapter.rs` 已删除；`tool_orchestrator` 工具批执行不再依赖 Aster `ToolRegistry` / `ToolContext` / `SandboxConfig`。
- `tool-runtime::native_overlay` 已承接 Lime-owned native tool overlay 清单（`view_image`、`apply_patch`、`skill_search`、`Skill`、`sleep`、`update_plan`、`WebFetch`、`WebSearch`），并新增 `RuntimeNativeToolRegistration` plan 固定注册名与 owner、`RuntimeNativeToolInstallStep` 固定安装顺序、`RuntimeNativeToolTurnContextSource` 固定 turn metadata 来源、`RuntimeNativeToolSurface` 固定 stateless overlay tool 的 definition / aliases / retry override，以及 `RuntimeNativePermissionDecision` / `check_runtime_native_tool_permissions(...)` 固定 stateless overlay tool 的 permission / confirmation 规则；除 `Skill` 仍是 skill gate overlay 外，其余已迁 overlay tool 必须由 `tool-runtime::native_dispatch` backing。`native_tools/runtime_overlay.rs` 只按该 current install plan 注册临时 Aster `Tool` 对象；无 App Server gateway 的 stateless wrapper 文件（`sleep.rs`、`view_image.rs`、`update_plan.rs`、`web_retrieval.rs`、`tools/apply_patch_tool.rs`、`tools/skill_search_tool.rs`）已删除，临时 `Tool` 创建统一由 `runtime_tool_bridge.rs::create_runtime_native_tool_adapter(...)` 承接，bridge 只把 current permission decision 转成 Aster `PermissionCheckResult`；per-tool `#[cfg(test)] create_*_tool()` helper 也已删除，adapter 回归测试集中到 `runtime_tool_bridge.rs`。`tool_inventory_runtime_adapter.rs` 也只把该 install plan 命中的工具标成 `current_surface`，不再把整个 Aster registry 误标为 current。Aster `WriteTool` / `EditTool` 与 `TaskCreate` / `TaskList` / `TaskGet` / `TaskUpdate` / `TaskOutput` / `TaskStop` 已从 Lime production tool 面移除；历史 `Write` / `Edit` / `Task*` 只允许作为 frontend / hook matcher / transcript 兼容读面，不再是生产 native tool。
- `tool-runtime::native_dispatch` 已建立 Codex-style current dispatcher 骨架，统一持有已迁 native tool 的 definition / executor dispatch：`apply_patch`、`skill_search`、`sleep`、`view_image`、`update_plan`、`WebFetch`、`WebSearch`，并通过 gateway-aware builder 接入 `memory_store` / `image_task` / `tool_search` / MCP resource。无 gateway 的临时 Aster `Tool` adapter 委托 `runtime_native_dispatch_handle()`；gateway-backed tools 已进一步从 Aster `Tool` 壳迁到 `tool-runtime::gateway_dispatch_execution` current registration，`NativeRegistration::gateway(...)` 不再携带 Aster payload。旧 `native_tools/{memory_store,image_tasks,tool_search}.rs` 已删除，模型可见 definitions 只从 current definition snapshot / `Agent::list_tools` 读取，不再直接调用 `memory_store_tool_definitions()` / `image_task_tool_definition()` 或 Aster vendor `ToolSearchTool`；`native_tools/runtime_tool_bridge.rs` 仅集中剩余非 gateway Aster `ToolContext` / `ToolResult` / `ToolError` 与 current `RuntimeTool*` 的临时转换，单个 wrapper 不再复制这套桥接代码。
- `tool-runtime::apply_patch` 已承接 `apply_patch` native tool 的 patch 执行、路径权限、metadata/diff 构造和 current executor；`lime-agent/src/tools/apply_patch_tool.rs` 已删除，`tools/mod.rs` 的常量 re-export 改由 `tool-runtime` current owner 提供，Aster `PermissionCheckResult` 转换与临时 `Tool` 创建统一由 `runtime_tool_bridge.rs` 承接，`lime-agent` 不再直接依赖 `patch-apply`。
- `tool-runtime::skill_search` 已承接 `skill_search` native tool 的 input schema、输入解析、workspace / project root 解析、Skills metadata search、输出 JSON 与 evidence metadata 构造；`lime-agent/src/tools/skill_search_tool.rs` 已删除，`tools/mod.rs` 的常量 re-export 改由 `tool-runtime` current owner 提供，Aster `PermissionCheckResult` 转换与临时 `Tool` 创建统一由 `runtime_tool_bridge.rs` 承接。
- `tool-runtime::skill_gate` 已承接 Skill 工具的 name / description / input schema 模型可见 surface、调用参数规范化、session enable、allowlist、turn capability gate 与 workspace skill source metadata gate；App Server runtime enable 直接消费该 current owner，`lime-agent/src/tools/skill_tool_gate.rs` 只在 wrapper 内部消费 current owner，不再持有 Aster `SkillTool` 执行 backend。
- `tool-runtime::skill_runtime_contract` 已承接 Skill runtime contract metadata / modality contract projection、default runtime contract 构造和 provided contract preflight 校验；`tool-runtime::skill_result` 已承接 Skill runtime contract result metadata、workspace skill source metadata 与 runtime preflight failure projection；`tool-runtime::skill_execute` 已承接 Skill execution envelope、access gate、contract preflight、参数规范化和 result metadata 合并；`lime-skills::run` 已承接 prompt / workflow Skill runner。`lime-agent/src/tools/skill_tool_gate.rs` 只保留 Aster `Tool` trait 外壳、当前 turn provider bridge 与 `RuntimeSkillExecutionResult` -> Aster `ToolResult` 类型转换。
- `tool-runtime::memory_store` 已承接 `memory_list` / `memory_read` / `memory_search` / `memory_add_note` native tools 的 App Server memory DTO gateway trait、input schema、请求构造、路径权限、summary 和 GUI / Evidence metadata 构造；`native_tools/gateway_bridge.rs` 只从 per-gateway `NativeDispatch.surfaces()` 生成 `RuntimeGatewayToolExecutionRegistration`，`lime-agent/src/native_tools/memory_store.rs` 已删除，`app-server` 的 memory gateway trait 也改从 `tool-runtime` 引用。
- `tool-runtime::image_task` 已承接 `lime_create_image_generation_task` native tool 的 App Server media task DTO gateway trait、input schema、请求构造、身份 / project root / storyboard 参数校验、tool result metadata 投影；`native_tools/gateway_bridge.rs` 只从 per-gateway `NativeDispatch.surfaces()` 生成 `RuntimeGatewayToolExecutionRegistration`，`lime-agent/src/native_tools/image_tasks.rs` 已删除，`app-server` 的 image task gateway trait 也改从 `tool-runtime` 引用。
- `tool-runtime::sleep` 已按 Codex `clock.sleep` / `sleep` 语义承接 current executor、`duration_ms` strict schema、12 小时上限、cancel token 中断、elapsed/interrupted metadata 和 tool definition；`lime-agent/src/native_tools/sleep.rs` 已删除，Aster `PermissionCheckResult` 转换与临时 Aster `Tool` 创建统一由 `runtime_tool_bridge.rs` 承接，前端 tool normalization / display / process summary 已消费 current `sleep`，不再把 Aster `SleepTool` 正向映射成等待工具。
- `tool-runtime::view_image` 已按 Codex `view_image` 语义承接 current executor、`path` / `detail` strict schema、file URL / relative path 解析、50MB 上限、image data URL、真实尺寸头部解析、model-visible image metadata 和 tool definition；`lime-agent/src/native_tools/view_image.rs` 已删除，Aster `PermissionCheckResult` 转换与临时 Aster `Tool` 创建统一由 `runtime_tool_bridge.rs` 承接，前端 tool normalization / display / process summary 已消费 current `view_image`，vendor `ViewImageTool` 实现已删除。
- `tool-runtime::update_plan` 已按 Codex `update_plan` TODO/checklist 语义承接 current executor、`PlanUpdate` / `PlanStep` 领域 DTO、strict schema、最多一个 `in_progress` 校验、Plan mode 禁用、`Plan updated` ack、plan/explanation metadata 和 tool definition；`lime-agent/src/native_tools/update_plan.rs` 已删除，Aster `PermissionCheckResult` 转换与临时 Aster `Tool` 创建统一由 `runtime_tool_bridge.rs` 承接，App Server `plan.final` event 与前端计划轨已消费 current `source=update_plan` 链路，vendor `UpdatePlanTool` 实现已删除。
- `tool-runtime::request_user_input` 已承接 Codex-style `request_user_input` tool surface contract、model-visible definition 和 reply-loop execution helper：DTO、input schema、parse、current surface validation、requested schema / elicitation schema、response extraction、result normalization、callback timeout 与 projection；`agent-runtime::request_user_input` 只保留 Turn-side runner。Aster `AskTool` 文件和 registry 注册已删除，`agent-compat` 只暂留 callback 配置字段与 ActionRequired scope adapter。R4 仍未完成，剩余 registry fallback 不能再把 AskTool 外壳写成 current owner。
- vendored Aster 中已迁出的 `path_guard`、`command_semantics`、`subprocess`、`shell_runtime`、WebFetch/WebSearch fetch/search/cache/content 和 vendor `Tool` wrapper / 默认注册等重复实现已删除，并已有守卫防回流。
- provider stream current handle 已进入现有 `provider_trace` 后端 / 前端 / metrics 主链；这不是空 DTO 迁移，但 Aster provider/reply adapter 仍未删除。
- App Server plugin runtime consumer 已消费 plugin activation / harness 的 `runtimeCapabilities`，把 workflow-scoped skill prompt policy 接到 Agent Skills selection、session prompt guidance 和 runtime status telemetry；MCP binding 已进入 App Server tool inventory `plugin_mcp_targets` prepare request skeleton，输出 `serverRunning`、`prepareStatus`、candidate `prepareRequests` 与显式 `callProofRequest`；前端 API `mcpApi.executePrepareRequests(...)` 已能顺序执行 candidate import / start / listForContext，`mcpApi.executeCallProofRequests(...)` 已能执行 candidate `mcpTool/callWithCaller` 并 fail closed；Workspace GUI trigger、执行后 inventory refresh skeleton、caller-scoped list proof 与显式 call proof skeleton 已接入；GUI smoke、自动触发仍 pending；无显式 proof 的默认 list proof skeleton 已完成。
- `RuntimeReplyStreamRequest` 已进入 pinned provider stream 执行入参，`ConfiguredReplyProvider::stream_reply_with_agent(...)` 会校验并记录 current request；不再只是 `aster_reply_adapter.rs` 的 debug-only DTO。
- `ReplyInput` / `ReplyInputImage` / `ActionRequiredResponseInput` / `ReplyAttemptInput` 已迁到 `agent-runtime::reply_input` current owner；`request_tool_policy.rs` 与 `agent_reply_stream.rs` 直接消费 current input contract。
- `RuntimeReplyStreamEvent` / `RuntimeReplyStreamState` 已迁到 `agent-runtime::reply_stream` current owner；`aster_reply_adapter.rs` 只产出该 current envelope，不再定义 reply stream event enum；`agent_reply_stream.rs` 只消费 current stream state 的 first-event timeout / inline provider error 状态，不再本地维护 stream lifecycle 状态。
- `agent-runtime::event_stream::EventProjector` 已建立 source-agnostic runtime event materialization contract；`aster_event_adapter.rs` 的 `AsterEventProjector` 只作为 compat source adapter 实现该 contract，`aster_reply_adapter.rs` 通过 current contract 消费 Aster event projection。
- `agent-runtime::reply_message` 已建立 不依赖 Aster reply message current contract，承接 text / image / action-required response message content、role、agent-only 与 text concat 规则；`request_tool_policy/aster_reply_message_adapter.rs` 集中把该 current message lowering 成 Aster `Message`，`request_tool_policy/aster_reply_backend_adapter.rs` 集中把 current start request 执行到 Aster `Agent::reply` / provider backend stream，`aster_reply_adapter.rs` 不再承接 `MessageContent::ActionRequired` / Aster action scope 映射或 provider/reply backend execution body，Aster `Message` 不再是 reply input/message 的隐含事实源。
- `agent-runtime::reply_request` 已建立 不依赖 Aster reply stream request materialization contract，承接 `RuntimeReplyAttemptInput` -> `RuntimeReplyMessage` + `RuntimeReplyStreamRequest` 的 session/input-kind/message_chars/provider-handle/model-policy 构造规则；`agent_reply_stream.rs` current 主循环负责构造 `RuntimeReplyRequest` 并执行 image input modality 校验，`RuntimeReplyStreamHost` 只接收已 materialize 的 current request，`aster_reply_adapter.rs` 不再直接调用 `RuntimeReplyStreamRequest::new(...)`，也不拥有 model request policy / modality validation 构造规则。
- `agent_reply_stream.rs` 主循环已只消费 `RuntimeReplyStreamEvent` / `RuntimeAgentEvent` current stream；Aster event projection 与 inline provider error suppression 已收回到 `aster_reply_adapter.rs` / `aster_event_adapter.rs` compat 边界。
- `RuntimeReplyStreamHost` / `RuntimeReplyPolicyHost` / `RuntimeReplyStartRequest` / `RuntimeReplyStartError` 已迁到 `agent-runtime::reply_host` current owner；`request_tool_policy.rs` 的 stream policy 主编排只接收 current host contract，不再知道 `AsterReplyRuntimeHost` 具体类型，Aster adapter 只接收并拆解 current start request。
- `agent-runtime::reply_backend::RuntimeReplyBackendStart::prepare_session_metadata(...)` 已承接 reply backend start 阶段的 session metadata preparation handoff：调用 current `agent-runtime::reply_session` 合并 `tool_scope.disallowed_tools` 与 provider request wire shape metadata；`aster_reply_backend_adapter.rs` 不再直接 import / 调用 session metadata helper，也不再本地维护 attach 函数。
- `RuntimeReplyAttemptError` / `RuntimeReplyExecution` / `RuntimeReplyAttemptState` 已迁到 `agent-runtime::reply_execution` current owner；`request_tool_policy.rs` 只保留 `ReplyAttemptError` / `StreamReplyExecution` re-export，并通过 `RuntimeReplyAttemptState` 累计 attempt text / event errors / emitted state，不再本地定义 runtime execution DTO 或三散状态变量。
- `turn_context_configuration.rs` 已只保留 Lime current `AgentTurnContext` builder / helper；Aster `TurnContextOverride` 双向转换收进 `turn_context_configuration/aster_adapter.rs` compat 边界。
- `agent-runtime::session_recent` / `agent-runtime::session_execution` 已承接 session recent DTO 与 session execution projection DTO；`agent-runtime::runtime_timeline` 已承接 runtime timeline turn/item/payload current DTO、turn/item source projector、item payload source projector、request-question schema 解析、runtime status turn summary text / diagnostics metadata projector 与 runtime timeline snapshot source/projector。Aster `SessionRuntimeSnapshot` 的 timeline source 构造已集中到 `runtime_timeline_adapter.rs`；`runtime_snapshot_adapter.rs` 只把 current timeline projection 映射为 GUI DAO DTO，不再直接遍历 `threads` 或调用 turn/item converter。Aster shared runtime store 初始化 / 获取 / snapshot 读取已隔离到 `runtime_store_aster_adapter.rs`；`runtime_support.rs` 不再直接 import `aster::session` / `aster::config`，外部只允许消费 `load_runtime_snapshot_overlay(...)` current overlay。
- `thread-store::conversation_transcript` 已承接 runtime conversation transcript / fallback projection 的 record source、record projector、runtime item record -> conversation message projector、message selection、count、truncate、稳定 transcript item id、transcript item record 构造、sequence 和 transcript item 判定规则；`thread-store::runtime_store` 已承接 runtime store read/write skeleton、conversation read/count traversal、thread/turn ensure write skeleton、按 thread 计算下一条 item sequence helper、item upsert helper 与 transcript item 删除 helper。`runtime_store_aster_adapter.rs` 只承接 Aster durable source lowering 和 current read/write trait adapter，`runtime_conversation_aster_adapter.rs` 只保留 current collector 调用与 Aster `Message` -> current transcript item record lowering，`aster_session_store/runtime_conversation.rs` 只保留 Aster `Conversation` 兼容转换、Aster action scope / turn context source adapter 和 current store helper 接线，不再直接遍历 Aster `ThreadRuntimeStore`。
- `thread-store::history_search` 已承接 session chat history search 的 query normalization、limit、timestamp fallback、role/current match record 与 relevance 规则；`aster_session_store/history_search.rs` 只保留 Aster `Session` / `Message` 到 current search record 的转换，以及 current match record -> Aster `ChatHistoryMatch` 的 compat 回填。
- `thread-store::task_board` 已承接 task board 到 session todo 的 subject trim、空项过滤、active_form 归一化和状态投影规则；`session_store_todo_projection.rs` 已删除，`session_store_todo_aster_adapter.rs` 只保留 Aster `ExtensionData` / `TaskBoardItem` 到 current task board record 的转换与最终 `SessionTodoItem` DTO 回填。
- Aster session memory disabled/skipped stub 已进一步删除：`thread-store::memory_stub`、`aster_session_store/memory_stub.rs`、Aster `SessionStore` memory trait 方法、Aster `SessionManager` memory API、reply loop 自动 memory 注入和 vendor `session/memory*` 源文件均已下线；Lime 记忆能力只保留 App Server memory store / `tool-runtime::memory_store` current 工具链。
- `thread-store::session_insights` 已承接 Aster `SessionStore::get_insights` 的 session count / token sum 聚合与 `i64 -> usize` 投影规则；Aster `SessionInsights` DTO 与 `SessionStore::get_insights` 已删除，不再回填 compat DTO。
- vendored Aster `session/statistics.rs` / `session/cleanup.rs` 已删除；这些旧 public wrapper 没有 Lime current 消费，统计/清理能力后续如有产品需求必须进入 Lime current owner，不得恢复 vendor session API。
- `thread-store::legacy_conversation` 已承接 legacy `agent_messages.content_json` envelope、旧数组格式 fallback、visibility 默认值和 role 归一化规则；`aster_session_store/legacy_conversation.rs` 只保留 current JSON record -> Aster `MessageContent` / `Conversation` DTO 转换。
- `lime_core::database::agent_session_repository::update_session_token_stats(...)` 已承接 token stats 的 None=保留旧值、schedule_id 归一化和 COALESCE SQL 写入规则；`aster_trait.rs::update_token_stats(...)` 只把 Aster `TokenStatsUpdate` 映射成 current `SessionTokenStatsUpdate` 并同步 metadata cache。
- `lime_core::database::agent_session_repository` 已承接 Aster `SessionStore` 的 session record 创建、存在性检查、`working_dir` / `extension_data_json` 读取、默认 working_dir fallback 与 persisted working_dir 归一化；`aster_session_store.rs` 只保留 Aster `Session` / `ExtensionData` DTO 接线，`session_projection.rs` 只消费 current helper。
- `lime_core::database::agent_session_repository` 已承接 current `thread-store::SessionRepository` 实现的 title、user_set_name、working_dir、extension_data 和 delete 写入语义；`session_record_sql.rs` 已承接其 get/list row loading；`lime_session_repository.rs` 不再维护这些 direct `agent_sessions` 写入 SQL 或 row prepare/query/map 细节，只做 trait adapter / DTO 投影。
- `session_record_sql.rs` 已承接 `agent_sessions` session record SQL select columns、`rusqlite::Row` -> `thread-store::SessionRecordRow` 映射与列表加载，并对 row mapping error 采用 fail-fast；按 refactor v1 审计它属于 `transitional current adapter`，用于搬空 Aster `SessionStore`，不是最终 Thread store owner。`aster_session_store/session_projection.rs` 只保留 current `SessionRecordProjection` -> Aster `Session` DTO 适配，`aster_trait.rs` 的 `get_session` / `list_sessions` 不再手写 session row 默认值、timestamp/json/session_type 解析。
- `aster_trait.rs` 的 `export_session` / `import_session` / `copy_session` / `truncate_conversation` 只有 Aster trait impl 自己命中，已按“无客户，不保兼容”从 Lime `SessionStore` impl 删除；vendor `session/export.rs`、`session/archive.rs`、`session/diagnostics.rs`、`SessionManager` bulk wrapper、vendor `SessionStore` trait 方法和 `agents/agent.rs` 测试 fake 均已删除，不再迁成新的 current service，也不继续维护 JSON 导入导出 / 复制 / 截断历史编排。
- `vendor/aster-rust/crates/aster/src/{aster_apps,auto_reply,background,blueprint,checkpoint,chrome,chrome_mcp,codesign,diagnostics,git,github,heartbeat,map,core,logging,lsp,memory,notifications,observability,plugins,prompt,ratelimit,recipe_deeplink,rewind,search,telemetry,teleport,tracing,updater}` 已确认无 Lime `aster::...` 顶层消费和 Aster 保留模块外部引用，已从 `lib.rs` public module surface 删除并物理删除；这些模块属于 `dead / deleted / forbidden-to-restore`，不作为 valuable reference 编译留存。
- `agent-compat/src/context/**` 已确认不应作为 Aster root public context surface 留存并物理删除；`ContextTraceStep` 的 current DTO 归 `agent-protocol::context_trace`，Aster reply loop / event source 未迁完前只在 `agents` 事件边界保留最小 compat 字段类型；tool I/O / token / truncation 规则归属 `tool-runtime::tool_io` current owner；Aster `aster://` context storage API 不进入 Lime current owner。
- `agent-compat/src/session/{fork,resume,worktree}.rs` 已删除；Aster session fork/merge、summary cache resume 和 worktree extension public API 没有 Lime current/compat 生产调用，不进入 Thread / Turn / Item current owner。后续若需要 branch、resume 或 worktree 产品能力，必须进入 Thread / App Server / project_git current owner。
- `agent-compat/src/providers/{auto_detect,provider_test,testprovider}.rs` 已删除；Aster provider live test、record/replay provider 和 API-key auto-detect 不进入 provider current owner。App Server / `model-provider` 已有 provider test/check 主链，不能恢复 Aster helper。
- `agent-compat/src/tools/hooks.rs` 已删除；`ToolRegistrationConfig::hooks_enabled`、`with_hooks_enabled(...)`、`ToolHookManager` re-export 和 `register_all_tools(...)` hook manager 返回值已移除。Lime current hook owner 不在 Aster tool registry，本刀不改变实际 native tool 注册集。
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
- Aster queue store DTO 转换已从独立 `runtime_queue_aster_adapter.rs` 折叠到 `runtime_store_aster_adapter.rs` compat 边界；`runtime_support.rs` 不再直接维护 `QueuedTurnRuntime` 转换或实现 `RuntimeQueueStore`，也不再 import 已删除的独立 queue adapter。
- transcript item write source skeleton 已前移到 `thread-store`：`TranscriptItemRecordInput` / `build_transcript_item_record(...)` / `next_runtime_item_sequence(...)` / `RuntimeItemWriteStore` / `RuntimeItemStore` / `upsert_runtime_item_record(...)` / `delete_runtime_transcript_items(...)` 均为 current owner；`build_aster_transcript_item(...)`、`is_aster_transcript_item_payload(...)` 和 session store 直接 `create_item/update_item/delete_item` 已按 `dead / guarded` 处理。
- thread/turn ensure write skeleton 已前移到 `thread-store`：`RuntimeThreadWriteStore` / `RuntimeTurnWriteStore` / `RuntimeThreadTurnStore` / `RuntimeTurnScopeInput` / `resolve_runtime_turn_scope(...)` / `ensure_runtime_turn_record(...)` 均为 current owner；session store 直接 `ThreadRuntime::new(...)` / `TurnRuntime::new(...)` / `upsert_thread/get_turn/create_turn` 已按 `dead / guarded` 处理。
- runtime conversation read/count traversal skeleton 已前移到 `thread-store`：`collect_runtime_conversation_records(...)` 与 `next_runtime_item_sequence_for_thread(...)` 均为 current owner；session store 直接 `store.list_threads(...)` / `store.list_items(...)`、本地 `collect_conversation_records_from_threads(...)` 和 `conversation_record_from_aster_item(...)` 已按 `dead / guarded` 处理。
- Aster session public surface 继续收缩：无消费者 `NoopSessionStore` 和 `agent-compat/src/session/README.md` 旧“可插拔 SessionStore / 自定义存储 / 默认 SQLite”对外说明已删除；后续 `session_manager.rs`、root `SessionManager`、`query_session` / `apply_session_update` convenience 也已删除。剩余 `SessionStore` trait / Aster durable source 只作为 R5/R6 compat blocker，不是 current API。

仍阻塞 Phase 6：

- root workspace 仍有 `aster = { package = "aster-core", path = "crates/agent-compat" }`。
- `lime-agent` 仍有 `aster.workspace = true`。
- `lime-agent` 内 provider/reply、native tool overlay/tool inventory、session/thread store、runtime snapshot compat boundary、agent turn loop 仍存在 Aster compat adapter；runtime queue gate / submit / resume 逻辑、runtime timeline snapshot flatten/thread_id 选择、runtime timeline item payload 展示 / 忽略 / request schema / default phase 规则、runtime status turn summary text / diagnostics metadata projector、runtime conversation record selection、runtime item record -> conversation message projection、runtime transcript item record/write skeleton、runtime detail conversation visibility/window、session history search matching、session todo task board projection、session memory disabled/skipped stub、session insights SQL 聚合、legacy `agent_messages.content_json` 解析、token stats 写入 SQL、subagent presentation metadata/customization 解析、subagent control state/usage read model、subagent child/parent session DB read model、execution runtime session DB read model、session record SQL row 映射、session provider routing metadata 解析、session execution usage 有效性规则与 session recent metadata 投影规则已迁出 Aster adapter，但 queued turn 持久化仍通过 Aster `ThreadRuntimeStore` adapter，runtime durable source 仍经 `runtime_store_aster_adapter.rs` 读取/写入 Aster store，timeline source 仍经 Aster item payload source adapter，Aster `SessionStore` trait 与 provider/reply `Session` DTO 仍是 compat blocker。WebFetch/WebSearch/apply_patch/skill_search/memory_store/image_task/sleep/view_image/update_plan 已不再是 vendor duplicate blocker；这些 Lime adapter 已统一走 `tool-runtime::native_dispatch` 或 gateway-aware dispatch builder，但仍通过 Lime 侧 Aster `Tool` trait 注册壳服务未迁出的 reply loop。`Agent::reply` / Aster `Message` / provider trait 仍未迁出，root `aster` dependency 还不能删。

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

### 2026-07-10：Fast B1 未使用 public surface 删除（Phase 6 续跟踪索引）

- `continued-in`：详细进度写入 `phase6-continuation-tracker.md`，本条只保留执行计划索引。
- `completed`：删除 `agent-compat/src/session/{fork,resume,worktree}.rs`、`agent-compat/src/providers/{auto_detect,provider_test,testprovider}.rs`、`agent-compat/src/tools/hooks.rs` 和空 `agent-compat/src/agents/snapshots` 目录。
- `dead`：Aster session fork/summary resume/worktree extension、provider live-test/record-replay/API-key auto-detect、Aster tool hook framework。
- `current`：branch/resume/worktree 后续必须进 Thread / App Server / project_git owner；provider test/check 走 App Server / `model-provider`；hook 能力走 Lime current owner。
- `compat`：R2/R3 provider reply source、R4 native registry、R5/R6 session/runtime item source 仍未迁完，本条不改变 root `aster` dependency blocker。

### 2026-07-10：Aster skills registry / loadSkill extension 删除（Phase 6 续跟踪索引）

- `continued-in`：主进度写入 `phase6-continuation-tracker.md`，本条只保留执行计划索引，避免继续拉长历史计划文件。
- `completed`：删除 `agent-compat/src/skills/**` 与 `agent-compat/src/agents/skills_extension.rs`，移除 `pub mod skills`、`skills_extension` module 和 `loadSkill` platform extension 注册。
- `current`：Skill discovery / execution / result metadata owner 固定为 `lime-skills`、`tool-runtime::{skill_execute,skill_gate,skill_result,skill_runtime_contract}` 与 App Server skill data source。
- `dead`：Aster global skills registry、loader/executor/workflow helper 和 `loadSkill` platform extension，不再作为 valuable reference 编译留存。
- `compat`：`LimeSkillTool` Aster `Tool` trait 外壳仍是 R4 blocker，等 reply loop 直接调用 current tool execution 后删除。

### 2026-07-09：owner 文件移动骨架纠偏

- `corrected`：此前把 `vendor/aster-rust/crates/aster*` 整体移入 `lime-rs/crates/agent-compat*` 只能作为临时破局，不是 current owner。用户已明确要求“将里面的文件按照现有的进行移动”，因此后续不再把大 `agent-compat` 当迁移完成态。
- `completed`：新增 `internal/roadmap/astermigration/owner-file-move-skeleton-plan.md`，固定源路径到现有 owner 的映射、第一批可批量移动范围、prompt/include_dir blocker 和退出口径。
- `completed`：补齐 root workspace 中 `agent-compat` 继承但缺失的 `webbrowser`、`etcetera`、`ignore`、`which`、`sacp` 依赖，并补 `[workspace.lints.clippy]`，恢复 `cargo metadata --manifest-path "lime-rs/Cargo.toml" --format-version 1 --no-deps` manifest 层可解析。
- `moved`：`lime-rs/crates/agent-compat/src/plan/**` -> `lime-rs/crates/tool-runtime/src/compat/aster_reference/plan/**`。Codex-style `update_plan` current owner 已在 `tool-runtime::update_plan`；旧 Aster plan 只作为待删 reference，不再是 Aster public module surface。
- `moved`：`lime-rs/crates/agent-compat/src/rules/**` -> `lime-rs/crates/agent-runtime/src/compat/aster_reference/rules/**`。当前无生产 `aster::rules` 消费；后续按 Codex 无对应面删除或吸收为 agent-runtime rule reference。
- `moved`：`lime-rs/crates/agent-compat/src/streaming/**` -> `lime-rs/crates/model-provider/src/compat/aster_reference/streaming/**`。当前 provider stream contract 已归属 `model-provider` / `agent-runtime::reply_stream`；旧 Aster streaming 只作为待删 reference。
- `updated`：`lime-rs/crates/agent-compat/src/lib.rs` 删除 `pub mod plan`、`pub mod rules`、`pub mod streaming`，三组模块不再作为 `aster` crate public surface 编译。
- `blocked`：`prompts/**` 不是零风险可移项；`prompt_template.rs` 仍用 `include_dir!("$CARGO_MANIFEST_DIR/src/prompts")`，必须先把 prompt renderer owner 迁到 `agent-runtime`，再移动资源。
- `classification`：`current` 是对应 owner 中已存在的 `tool-runtime::update_plan`、`agent-runtime` rule/prompt 目标、`model-provider` provider stream contract；`compat` 是仍被 `lime-agent` 生产 `use aster::...` 命中的 `agent-compat` blocker；`dead / pending-delete` 是已移入 `compat/aster_reference` 且无 current 消费链的 Aster-only reference。
- `remaining`：`agent-compat` 仍有 `Agent` / `AgentEvent` / `Message` / `Conversation` / provider trait / `SessionStore` / `ThreadRuntimeStore` / `Tool` / `ToolRegistry` / `McpClientTrait` / `session_context` blocker；整体目标完成度不能上调，仍按约 `95%` 汇报。

### 2026-07-09：provider canonical duplicate 删除

- `completed`：`agent-compat/src/providers/base.rs` 和 `agent-compat/src/agents/reply_parts.rs` 改为直接消费 `model_provider::canonical::{map_to_canonical_model, maybe_get_canonical_model, CanonicalModelRegistry}`。
- `deleted`：删除 `lime-rs/crates/agent-compat/src/providers/canonical/**`，移除 `providers/mod.rs` 的 `pub mod canonical`，并删除 `agent-compat` manifest 里的 `build_canonical_models` bin。
- `current`：`lime-rs/crates/model-provider/src/canonical/**` 是 provider canonical registry / name mapping / capability summary 的唯一 owner。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `agent-compat/src/providers/canonical` duplicate，并要求 compat provider/reply 调用 current owner。
- `classification`：`current` 是 `model-provider::canonical`；`dead / deleted / forbidden-to-restore` 是 Aster provider canonical duplicate 和旧 build bin；`compat` 是仍在 `agent-compat` provider trait/reply loop 中临时调用 current canonical owner。

### 2026-07-09：agent-compat-models duplicate 删除

- `completed`：确认 OpenAI / Anthropic wire DTO 已由 `agent-protocol/src/openai.rs` 与 `agent-protocol/src/anthropic.rs` 承接，`lime_core::models::{openai, anthropic}` 也已走 current re-export，不需要保留重复 `aster-models` crate。
- `deleted`：删除 `lime-rs/crates/agent-compat-models/**`，并从 `lime-rs/crates/agent-compat/Cargo.toml` 移除 `aster-models = { path = "../agent-compat-models" }`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-compat-models` 保持不存在，要求 `agent-compat` / root manifest 不再指向 `agent-compat-models`，并要求 `agent-protocol` 的 OpenAI / Anthropic DTO 文件存在。
- `Thread / Turn / Item`：这些 DTO 归属 provider wire protocol / Turn provider request lowering 的 `agent-protocol` owner；`agent-compat` 不再作为 DTO source。
- `classification`：`current` 是 `agent-protocol::{openai, anthropic}`；`dead / deleted / forbidden-to-restore` 是 `agent-compat-models` 与 `aster-models` 路径依赖；`compat` 仍是 `agent-compat` 中未迁完的 provider/reply/session blocker。

### 2026-07-09：agent-compat tests 目录删除

- `completed`：删除 `lime-rs/crates/agent-compat/tests/**`，包括旧 Aster permission / tool / MCP / provider integration tests、property tests、proptest regressions、MCP replay 数据和 OpenAI fixture 数据。
- `completed`：删除 `agent-compat` manifest 中已不存在的 `examples/{agent,databricks_oauth}.rs` 声明，并清理只服务这些外部 tests/examples 的 `sacp`、`agent-client-protocol-schema`、`criterion`、`dotenvy`、`ctor` dev-dependency。
- `reason`：这些测试验证的是 Aster compat staging crate 自身行为，会把已迁或待迁能力继续包装成 Aster 正向基准；无客户阶段不保留这类历史包袱。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-compat/tests` 保持不存在，禁止恢复缺失 example 声明和已删除 tests/examples 的 stale dev-dependency；shell/path/process 等已迁能力继续由 `tool-runtime` 等 current owner 的测试覆盖。
- `Thread / Turn / Item`：删除的是旧测试面，不新增 runtime owner；后续需要的行为回归必须按 Thread / Turn / Item 分别补到 `agent-runtime`、`agent-protocol`、`model-provider`、`tool-runtime`、`thread-store` 或 App Server。
- `classification`：`dead / deleted / forbidden-to-restore` 是 `agent-compat/tests/**`；`current` 是各 owner crate 的定向测试；`compat` 仍是 `agent-compat/src/**` 未迁完的最小 blocker。

### 2026-07-09：agent-compat src 独立测试文件删除

- `completed`：删除 `lime-rs/crates/agent-compat/src` 下 32 个独立 `tests.rs` / `*_tests.rs` / `*_property_tests.rs` 文件，约 15,979 行旧 Aster 正向测试面；父模块中的 `#[cfg(test)] mod ...;` 声明同步删除。
- `deleted`：覆盖 `agents/{communication,context,error_handling,monitor,parallel,resume,specialized,subagent_scheduler}`、`context`、`mcp`、`hooks`、`media`、`network`、`permission/policy`、`recipe/build_recipe`、`config/signup_{openrouter,tetrate}` 的源码内测试文件。
- `dependency`：`proptest`、`serial_test`、`wiremock`、`tempfile`、`rmcp` 等 dev-dependency 仍被 `agent-compat/src` 生产文件内 inline 单测使用，本轮不误删；后续随着对应生产模块迁出或删除再成批清理。
- `guarded`：`asterMigrationBoundary.test.ts` 现在同时要求 `agent-compat/tests/**` 不存在、`agent-compat/src` 不再出现独立 `tests.rs` / `*_tests.rs` / `*_property_tests.rs` 文件，并禁止恢复 `#[cfg(test)] mod ...;` 独立测试模块声明。
- `reason`：这些文件只证明 Aster staging crate 内部行为，会继续把 MCP / context / subagent / network / recipe 等旧实现包装成正向基准；Codex-first 口径下不作为 current 迁移完成证据。
- `Thread / Turn / Item`：删除的是旧测试 surface；必要回归必须按能力归属回补到 `agent-runtime`、`agent-protocol`、`model-provider`、`tool-runtime`、`thread-store`、`lime-mcp`、`lime-skills` 或 App Server。
- `classification`：`dead / deleted / forbidden-to-restore` 是 `agent-compat/src` 独立测试文件；`compat` 仍是 `agent-compat/src` 中未迁完的生产 blocker；`current` 不变，继续是 Lime owner crate 与 App Server / GUI / Evidence 主链。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/owner-file-move-skeleton-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`141 passed`。
- `validated`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过；仅保留既有 `reqwest default-features` workspace warning。
- `remaining`：本刀没有删除 root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster reply loop `ToolRegistry` / `Tool` trait 执行壳、provider/reply loop `Agent::reply` / `Message` / `AgentEvent` / provider trait 或 Aster `SessionStore` / `ThreadRuntimeStore` adapter。整体目标完成度仍按约 `95%`，不能上调到完成态；下一刀应回到 prompt owner、provider/reply loop 或 Aster reply loop native tool execution blocker。

### 2026-07-09：Aster-only provider signup flow 删除

- `completed`：删除 `lime-rs/crates/agent-compat/src/config/signup_openrouter/**` 与 `lime-rs/crates/agent-compat/src/config/signup_tetrate/**`，包括本地 callback server 与 HTML templates。
- `completed`：`config/mod.rs` 删除 `signup_openrouter` / `signup_tetrate` module declaration 与 `configure_openrouter` / `configure_tetrate` re-export。
- `completed`：唯一生产引用 `TETRATE_DEFAULT_MODEL` 已移入 `providers/tetrate.rs` provider owner，OpenRouter provider 原本已有自己的 `OPENROUTER_DEFAULT_MODEL`。
- `Codex 对照`：`/Users/coso/Documents/dev/rust/codex/codex-rs` 无 OpenRouter / Tetrate 本地浏览器 PKCE signup current 面；Codex 有的是 OpenAI / ChatGPT auth manager 与 MCP OAuth 等不同语义能力，不能用来续命 Aster provider signup flow。
- `reason`：这些 signup 目录无 Lime 前端 / App Server / provider 主链消费者，只是 Aster config CLI 向导遗留；无客户阶段不保留旧 onboarding 壳。后续如需要 provider credential onboarding，必须进入 Lime current provider/settings 主链。
- `guarded`：`asterMigrationBoundary.test.ts` 要求两个 signup 目录保持不存在，禁止 `config/mod.rs` 恢复 module / re-export，禁止 `OpenRouterAuth`、`TetrateAuth`、`configure_*` 与 signup template include 回流。
- `Thread / Turn / Item`：删除的是 provider credential onboarding 旁路，不进入 Thread / Turn / Item current owner；Tetrate provider metadata 常量归属 provider owner。
- `classification`：`dead / deleted / forbidden-to-restore` 是 Aster-only signup flow；`current` 是 provider metadata / credential config 未来应归属的 Lime provider/settings 主链；`compat` 仍是 provider/reply loop 的 Aster trait adapter。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/owner-file-move-skeleton-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`142 passed`。
- `validated`：`CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过，`Finished dev profile ... in 6m 32s`；仅保留既有 `reqwest default-features` workspace warning。
- `remaining`：本刀不删除 OpenRouter / Tetrate provider 实现本身，也不删除 root `aster` dependency。provider/reply loop `Agent::reply` / Aster `Message` / provider trait object 仍是 Phase 6 blocker；整体目标完成度仍约 `95%`。

### 2026-07-09：Skill registry current owner handoff

- `completed`：`lime-skills::skill_loader` 新增 current Skill directory registry，承接 `register_skill_directory(...)`、`register_project_skill_directory(...)`、`is_registered_skill(...)` 与 `find_skill_by_name(...)` 的 registered-directory 优先解析；workspace `project:<directory>` Skill 不再依赖 Aster `global_registry` 才能被 `RuntimeSkillDefinitionBackend` 找到。
- `completed`：`lime-agent/src/runtime_state_support.rs` 的 Skill 启动加载、project Skill runtime enable 注册与注册查询改为消费 `lime-skills` current registry；生产段不再 import `aster::skills::{global_registry, load_skill_from_file, load_skills_from_directory, SkillSource}`。
- `completed`：`lime_agent` 对 App Server 暴露的 Skill 注册 API 收短为 `reload_skills`、`register_project_skill_from_directory`、`is_skill_registered`；`app-server` workspace Skill runtime enable 真实消费该 current API，保留 GUI / runtime enable -> Skill Tool 执行前置注册链路。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `lime-skills/src/skill_loader.rs` 持有 current registry / project registration / lookup，并禁止 current loader 依赖 `aster::`；要求 `runtime_state_support.rs` 生产段消费 `register_project_skill_directory` / `register_skill_directory` / `is_registered_skill`，并禁止恢复 `aster::skills` / `global_registry`；要求 App Server 不恢复 `register_lime_project_skill_from_directory`。
- `dependency hygiene`：并行工作树曾把 `Cargo.lock` 中 `aws-sdk-sts` 推到 `1.96.0`，但 vendored Aster 仍 pin `aws-smithy-types =1.3.5`，导致 Cargo 无法解析 `aws-runtime`；本轮将 `aws-sdk-sts` 锁回已成功编译的 `1.95.0`，不改 Cargo.toml。
- `Thread / Turn / Item`：归属 Turn Skill invocation definition lookup / runtime enable preparation；Item tool output metadata 仍由 `tool-runtime::skill_result` materialize。Aster provider bridge 与 Aster `Tool` trait 外壳仍是未迁 reply loop 的 compat blocker。
- `classification`：`current` 是 `lime-skills::skill_loader` registered-directory lookup、`tool-runtime::skill_execute::RuntimeSkillDefinitionBackend` 与 App Server workspace Skill runtime enable 消费链；`compat` 是 `LimeSkillTool` 的 Aster `Tool` trait 外壳和当前 turn Aster provider bridge；`dead / guarded` 是 Aster `SkillTool` backend、Aster Skills `global_registry` 作为 Lime Skill lookup truth，以及旧 `register_lime_project_skill_from_directory` API。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-aster-skill-registry-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-skills skill_loader --lib -j 2` 通过，`5 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-aster-skill-registry-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_state_support --lib -j 2` 通过，`5 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-aster-skill-registry-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server skill_runtime_enable --lib -j 2` 通过，`11 passed`。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR="/tmp/lime-aster-skill-registry-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime skill_execute --lib -j 2` 通过，`4 passed`；第一次重跑命中过期 `/tmp` incremental dep-graph 缓存错误，禁用 incremental 后通过。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-skills --package lime-agent --package app-server -- --check` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`134 passed`。
- `remaining`：本刀清掉 Skill registry 对 Aster 的依赖，但不删除 Aster `ToolRegistry` / `Tool` trait 外壳、Aster provider/reply loop、Aster `SessionStore` / `ThreadRuntimeStore` adapter、root `aster` dependency 或 `lime-agent` 的 `aster.workspace = true`。整体目标完成度仍约 `95%`。

### 2026-07-09：live execution process current runner

- `completed`：新增 `tool-runtime::execution_process::live` current runner，承接 live shell process 的 gateway contract、process start/status/drain/terminate polling、output delta notification metadata、最终 `CallToolResult` 构造、stdin writable metadata、shell argv 构造和 model-visible output truncation；该 owner 不依赖 Aster。
- `completed`：`lime-agent/src/live_execution_process.rs` 退化为 Aster `NativeToolExecutionHook` adapter，只负责把 `NativeToolExecutionRequest` 降成 `RuntimeLiveExecutionRequest`、读取当前 turn context policy / approval / sandbox / metadata、注入临时 env，并把 current notification payload 包成 rmcp `ServerNotification`。
- `completed`：App Server `runtime_backend/live_execution_process.rs` 直接实现 `tool_runtime::execution_process::live::RuntimeLiveExecutionGateway`；GUI/App Server 既有 execution process server 仍是 live runner 的真实后端消费链，不再通过 `lime-agent` 拥有 gateway contract。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tool-runtime/src/execution_process/live.rs` 持有 `RuntimeLiveExecutionGateway` / `RuntimeLiveExecutionRequest` / `run_runtime_live_execution_process(...)`，并禁止 current runner 依赖 `aster::`、`NativeToolExecutionHook`、`NativeToolExecutionRequest` 或 `ToolCallResult`。
- `guarded`：同一守卫禁止 `lime-agent/src/live_execution_process.rs` 恢复 `PreparedLiveExecution`、本地 process runner、drain loop、snapshot/output metadata 构造、shell argv helper、PowerShell program probe、status/output label helper 或 `execution_error`。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / live process execution；Item tool output 的模型可见文本截断继续复用 `tool-runtime::tool_io`，App Server execution process read/control 链保持真实消费。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime execution_process::live --lib -j 2` 通过，`2 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent live_execution_process --lib -j 2` 通过，`7 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server live_execution_process --lib -j 2` 编译通过，过滤后 `0` 个测试运行，`914 filtered out`。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent --package app-server -- --check` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`134 passed`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过；scoped `git diff --check` 覆盖本刀写集通过。
- `classification`：`current` 是 `tool-runtime::execution_process::live` 和 App Server `ExecutionProcessServer` gateway implementation；`compat blocker` 是 `lime-agent/src/live_execution_process.rs` 的 Aster hook adapter；`dead / guarded` 是在 adapter 内恢复 runner/metadata/shell helper 实现。
- `remaining`：本刀不删除 Aster `NativeToolExecutionHook` 安装点、Aster `Tool` trait 注册壳、provider/reply loop、Aster `SessionStore` / runtime store adapter 或 root `aster` dependency。整体目标完成度仍约 `95%`。

### 2026-07-09：tool output truncation current owner

- `completed`：`tool-runtime::tool_io` 承接 `ToolOutputTruncationPolicy`、`format_tool_output_for_model(...)`、byte/token middle truncation、Codex-style warning 文案和 UTF-8 边界处理；该 owner 不依赖 Aster。
- `completed`：`lime-agent/src/tool_output_truncation.rs` 删除截断算法实现，只保留 `AgentTurnContext` / model request policy -> current `ToolOutputTruncationPolicy` 的解析，并临时 re-export `tool-runtime` current helper 给现有调用点。
- `guarded`：`asterMigrationBoundary.test.ts` 在 tool-runtime owner 守卫中要求 `tool_io` 持有 `ToolOutputTruncationPolicy` / `format_tool_output_for_model(...)`，并禁止 `lime-agent/src/tool_output_truncation.rs` 恢复 `formatted_truncate_*`、`truncate_middle_*`、byte/token prefix/suffix helper 或直接 `estimate_tool_io_tokens` 算法。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item tool output projection。`lime-agent` 只从 turn context 读取截断策略；模型可见输出格式化规则属于 `tool-runtime::tool_io`，为后续 live execution process runner 继续迁出 Aster hook adapter 铺路。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime tool_io --lib -j 2` 通过，`13 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_output_truncation --lib -j 2` 通过，`1 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_orchestrator::truncation --lib -j 2` 通过，`1 passed`。
- `classification`：`current` 是 `tool-runtime::tool_io` 的 model-visible output truncation contract；`transitional current adapter` 是 `lime-agent/src/tool_output_truncation.rs` 的 turn-context policy resolver / re-export；`dead / guarded` 是在 `lime-agent` 恢复截断算法实现。
- `remaining`：本刀不删除 Aster `Tool` trait 注册壳、live execution Aster hook、provider/reply loop、Aster `SessionStore` / runtime store adapter 或 root `aster` dependency。整体目标完成度仍约 `95%`。

### 2026-07-09：MCP bridge request forwarding current client

- `completed`：新增 `lime-mcp::McpBridgeClient` current client，承接 rmcp `ClientRequest` 构造、`send_cancellable_request(...)`、`PeerRequestOptions`、timeout、cancel notification 和 unexpected response 映射；该 owner 不依赖 Aster。
- `completed`：`lime-agent/src/mcp_bridge.rs` 的本地 `McpBridgeClient` 退化为最小 Aster `McpClientTrait` adapter，只持有 `RuntimeMcpBridgeClient`，并只保留 `current_session_id()` / `SESSION_ID_HEADER` 注入、`ExtensionConfig::Builtin` 降级注册和 extension manager add/remove 接线。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 MCP bridge request forwarding 守卫，要求 `lime-mcp/src/bridge_client.rs` 导出 current client，并禁止 `mcp_bridge.rs` 恢复 `ClientRequest::`、`send_cancellable_request`、`PeerRequestOptions`、`CancelledNotification*`、rmcp request DTO 或 `ServiceError::{UnexpectedResponse,Timeout,Cancelled}` 请求转发细节；同时禁止 current client 依赖 `aster::` 或 Aster session context。
- `Thread / Turn / Item`：归属 Turn MCP tool lifecycle / bridge request forwarding。`lime-mcp` 持有协议请求转发，`mcp_bridge.rs` 只是 Aster reply loop 未迁出前的 compat source adapter，不是最终 Turn owner。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-mcp --package lime-agent -- --check` 通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp bridge_client --lib -j 2` 编译通过，过滤后 `0` 个测试运行。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent mcp_bridge --lib -j 2` 编译通过，过滤后 `0` 个测试运行。
- `classification`：`current` 是 `lime-mcp::McpBridgeClient`；`compat blocker` 是 `mcp_bridge.rs` 的 Aster `McpClientTrait` / session metadata 注入 / extension manager registration；`dead / guarded` 是在 adapter 内恢复 rmcp request forwarding、timeout/cancel 或 unexpected-response 规则。
- `remaining`：本刀不删除 Aster `McpClientTrait`、Aster extension manager registration、provider/reply loop、Aster `SessionStore` / runtime store adapter 或 root `aster` dependency。整体目标完成度仍约 `95%`。

### 2026-07-09：Aster BrowserTool MCP wrapper 删除

- `completed`：删除 `lime-agent/src/tools/browser_tool.rs`，移除 `tools/mod.rs` 的 `browser_tool` module / `BrowserTool` re-export，并从 `lime-agent/src/lib.rs` 移除 `BrowserAction` / `BrowserTool` / `BrowserToolError` / `BrowserToolResult` public re-export。
- `completed`：对照 Codex，Codex current 只通过通用 MCP tool call / tool router 处理 `browser_navigate` 等 Playwright MCP 工具，不维护 Aster 风格 `BrowserTool` wrapper；Lime current 浏览器能力已归属 `browser-runtime`、App Server browser action evidence 和前端 Browser Assist，不依赖该旧 wrapper。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 BrowserTool Aster MCP wrapper 删除守卫，要求 `lime-agent/src/tools/browser_tool.rs` 保持不存在，并禁止 `tools/mod.rs` / `lib.rs` 恢复 `BrowserTool` 公开 re-export。
- `Thread / Turn / Item`：旧 wrapper 不进入 current owner；浏览器 action evidence 仍归属 App Server Evidence / Item projection，MCP browser tools 作为通用 MCP tools 进入 tool lifecycle。
- `validated`：`rg -n "BrowserTool|BrowserAction|BrowserToolError|BrowserToolResult|browser_tool" "lime-rs/crates/agent/src" "lime-rs/crates/app-server/src" "lime-rs/crates/tool-runtime/src"` 不再命中 `lime-agent` wrapper 或 re-export，只剩 App Server / Evidence current browser action 语义。
- `validated`：`rg -n "McpClientTrait" "lime-rs/crates/agent/src"` 只剩 `mcp_bridge.rs`，证明 BrowserTool 旧 wrapper 不再持有 Aster MCP trait。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tools --lib -j 2` 通过，`134 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`132 passed`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过；scoped `git diff --check` 覆盖本刀写集通过。
- `classification`：`dead / deleted / forbidden-to-restore` 是 `BrowserTool` / `BrowserAction` Aster MCP wrapper 与 public re-export；`current` 是 `browser-runtime` / App Server evidence / 通用 MCP tool call 链；`compat blocker` 只剩 `mcp_bridge.rs` 的 Aster `McpClientTrait` adapter。
- `remaining`：本刀清掉 `McpClientTrait` 的一个零引用旧 wrapper 持有点，但不删除 `mcp_bridge.rs`、Aster extension manager registration、provider/reply loop、Aster session/runtime store adapter 或 root `aster` dependency。整体目标完成度仍约 `95%`。

### 2026-07-09：MCP extension sync plan current owner

- `completed`：`tool-runtime::tool_extension` 新增 `RuntimeExtensionRegistration` 与 `RuntimeExtensionSyncPlan::from_registrations(...)`，把 extension registration 去重、空工具过滤、active names 与 stale names diff 规则迁入 current owner。
- `completed`：`mcp_bridge.rs` 改为先把 `McpBridgeSnapshot` 投影成 `RuntimeExtensionRegistration`，再消费 `RuntimeExtensionSyncPlan` 执行临时 Aster `ExtensionConfig::Builtin` / `McpClientTrait` adapter 注册；Aster adapter 不再自己用 `previous_bridge_names.difference(...)` 计算 stale bridge。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tool-runtime::tool_extension` 持有 registration/sync plan owner，要求 `mcp_bridge.rs` 消费 `RuntimeExtensionSyncPlan::from_registrations(...)`，并禁止恢复 adapter 内直接 diff active/stale bridge 的旧面。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / MCP extension registration planning；对齐 Codex `spec_plan` 先形成 tool registry / model-visible specs、adapter 只负责 dispatch 的分层方式。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime tool_extension --lib -j 2` 通过，`4 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent mcp_bridge --lib -j 2` 编译通过，过滤后 `0` 个测试运行；该命令仍编译 vendored `aster-core`，说明 root Aster blocker 未清零。
- `classification`：`current` 是 `RuntimeExtensionRegistration` / `RuntimeExtensionSyncPlan`；`compat blocker` 是 `mcp_bridge.rs` 仍把 current registration plan 降到 Aster `ExtensionConfig::Builtin` 并实现 Aster `McpClientTrait`；`dead / guarded` 是在 Aster adapter 内恢复 extension active/stale diff 或空工具过滤规则。
- `remaining`：本刀只把 MCP extension registration plan 上提到 current owner，不删除 Aster `McpClientTrait`、Aster extension manager registration、provider/reply loop、Aster session/runtime store adapter 或 root `aster` dependency。整体目标完成度仍约 `95%`。

### 2026-07-09：MCP extension surface current DTO 骨架迁移

- `completed`：`tool-runtime::tool_extension` 新增 `RuntimeExtensionToolSurface` 与 `RuntimeExtensionConfig::from_tool_surfaces(...)`，把 extension `available_tools` 去重排序、`always_visible` / `deferred_loading` 可见性、single `allowed_caller` collapse 规则迁入 current owner。
- `completed`：`lime-agent/src/agent_tools/catalog.rs::build_mcp_extension_surface(...)` 只负责把 `lime_mcp::McpToolDefinition` 投影成 `RuntimeExtensionToolSurface`，不再定义 `McpExtensionSurface` 或本地维护 allowed caller collapse 逻辑。
- `completed`：`mcp_bridge.rs` 与 `tool_inventory_runtime_snapshot.rs` 直接消费 `RuntimeExtensionConfig`；Aster `ExtensionConfig::Builtin` 只在 `mcp_bridge.rs` adapter 内部构造，runtime inventory snapshot 不再把 MCP surface DTO 重新拆开再组装。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 MCP extension surface 守卫，要求 current DTO / 构造规则归属 `tool-runtime::tool_extension`，禁止 `agent_tools/catalog.rs` 恢复 `McpExtensionSurface` 或本地 `collapse_extension_allowed_caller`。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / MCP extension surface planning；当前仍是 Aster reply loop 的 MCP bridge adapter 前置 surface，后续需要继续把 MCP runtime registration 从 Aster `McpClientTrait` / `ExtensionConfig` 迁到 Lime current tool runtime。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过；`git diff --check` 覆盖本刀 Rust 写集通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime tool_extension --lib -j 2` 通过，`2 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::catalog --lib -j 2` 通过，`14 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::tool_inventory_runtime_snapshot --lib -j 2` 编译通过，过滤后 `0` 个测试运行。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`131 passed`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过；scoped `git diff --check` 覆盖本刀 Rust / governance / roadmap 写集通过。
- `completed`：`refactor-v1-impact-audit.md` 新增 `4.12.4 MCP extension surface current DTO`，把 `tool-runtime::tool_extension` current owner、`mcp_bridge.rs` Aster adapter blocker 和删除退出条件同步到 refactor v1 影响审计。
- `classification`：`current` 是 `RuntimeExtensionConfig` / `RuntimeExtensionToolSurface`；`compat blocker` 是 `mcp_bridge.rs` 仍把 current config 降到 Aster `ExtensionConfig::Builtin` 并实现 Aster `McpClientTrait`；`dead / guarded` 是在 `lime-agent` catalog 恢复 `McpExtensionSurface` 或 extension surface 规则副本。
- `remaining`：本刀只迁 MCP extension surface DTO/构造规则，不删除 Aster `McpClientTrait`、Aster extension manager registration、Aster reply loop native tool registry、provider/reply loop、Aster session/runtime store adapter 或 root `aster` dependency。整体目标完成度仍约 `95%`。

### 2026-07-09：Agent init command boundary 不依赖 Aster

- `completed`：底层 Electron IPC / Desktop Host command 从 `aster_agent_init` 收敛为 `agent_init`；`electron/ipcChannels.ts`、`electron/hostCommands.ts`、前端 `agentRuntime` gateway、DevBridge truth / timeout policy、runtime gateway catalog 和相关 smoke / E2E 脚本均消费 current 命令名。
- `completed`：`agentCommandCatalog.json` 的 `runtimeGatewayCommands` 改为 `agent_init`，旧 `aster_agent_init` 只保留在 `deprecatedCommandReplacements` 中指向 `agent_init`，表达 retired command -> current command 的迁移事实，不再作为 production truth。
- `guarded`：`scripts/check-command-contracts.mjs` 取消 `aster_agent_init` 的 retired surface 豁免；`asterMigrationBoundary.test.ts` 新增命令边界守卫，禁止 current IPC / DevBridge / runtime init scripts 恢复 `aster_agent_init`。
- `Thread / Turn / Item`：归属 Turn runtime warmup / provider readiness 入口；命令只负责触发 Agent 初始化与 provider/model readiness projection，不承接 session / item read model。
- `validated`：`npx prettier --check` 覆盖 Electron IPC / Host、前端 gateway、DevBridge policy、command catalog、contract scripts、smoke scripts、治理守卫和本计划文档通过；`git diff --check` 覆盖本轮命令边界写集通过。
- `validated`：`rg -n "aster_agent_init" "electron" "src/lib/api/agentRuntime/agentClient.ts" "src/lib/api/agentRuntime/agentClient.test.ts" "src/lib/dev-bridge" "scripts/agent-runtime/tool-surface-page-smoke.mjs" "scripts/at-command-registry-e2e.mjs" "scripts/claw-chat-ready-streaming-smoke.mjs"` 零命中，证明 current IPC/API/DevBridge/smoke 链不再消费旧命令。
- `validated`：`npx vitest run "src/lib/api/agentRuntime/agentClient.test.ts" "electron/hostCommands.test.ts" "electron/ipcChannels.test.ts" "src/lib/dev-bridge/commandPolicy.test.ts" "src/lib/dev-bridge/http-client.test.ts" "src/lib/dev-bridge/mockPriorityCommands.test.ts" "src/lib/desktop-host/core.unhandled-mock.test.ts" "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`256 passed`。
- `validated`：`npm run test:contracts` 通过，command contracts 显示 frontend commands `32`、Electron host commands `95`、mock priority commands `0`、DevBridge truth commands `17`。
- `classification`：`current` 是 `agent_init` + `initAgentRuntime()`；`dead / guarded` 是 `aster_agent_init` 作为 production IPC、DevBridge truth、mock policy、runtime gateway 或 smoke 探测命令回流；`compat` 只剩 catalog replacement / contract retired guard / 历史 evidence。
- `remaining`：这一步只收口命令命名，不迁移 provider/reply loop、Aster `Tool` trait 注册壳、Aster `SessionStore` / `ThreadRuntimeStore` adapter 或 root `aster` dependency。整体目标完成度仍约 `95%`。

### 2026-07-09：frontend runtime init API current naming

- `completed`：前端 agent runtime API 包装层从 `initAsterAgent()` / `AsterAgentStatus` 收敛为 `initAgentRuntime()` / `AgentRuntimeInitStatus`；`createAgentRuntimeClient()`、`agentRuntimeAdapter`、Chat runtime warmup 测试夹具和模型选择集成测试都改为消费 current API 名称。
- `completed`：测试夹具变量从 `mockInitAsterAgent` 收敛为 `mockInitAgentRuntime`，避免测试层继续把 runtime warmup 主链表达成 Aster agent 初始化。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 frontend runtime init API 守卫，禁止 `initAsterAgent`、`AsterAgentStatus`、`isAsterAgentStatus`、`assertAsterAgentStatus`、`mockInitAsterAgent` 回流到前端 current API、adapter 与相关测试夹具。
- `Thread / Turn / Item`：归属 Turn runtime warmup / provider readiness 入口。GUI 仍通过 `agentRuntimeAdapter.init()` 触发 runtime 初始化，后续 provider/model 回填继续进入 workspace runtime 状态与发送链。
- `validated`：`npx prettier --check` 覆盖前端 API、adapter、测试夹具、治理守卫和本计划文档通过；`rg -n "initAsterAgent|AsterAgentStatus|isAsterAgentStatus|assertAsterAgentStatus|mockInitAsterAgent" "src"` 只命中治理守卫自身 forbidden 字符串。
- `validated`：`npx vitest run "src/lib/api/agentRuntime/agentClient.test.ts" "src/components/agent/chat/hooks/agentRuntimeAdapter.test.ts" "src/components/agent/chat/components/ChatModelSelector.integration.test.tsx" "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`144 passed`。
- `verification-note`：`useAsterAgentChat.test.tsx` 聚合父套件当前仍失败，失败集中在 provider/model selection gating、话题恢复调用次数和旧期望，且本刀 diff 只重命名 init mock / API；该套件不能作为本刀完成态证据，需在后续 Chat runtime refactor 中单独收口。
- `classification`：`current` 是 `initAgentRuntime` / `AgentRuntimeInitStatus` 与 `AgentRuntimeAdapter.init()`；当时底层 Electron IPC 命令名仍是 `aster_agent_init`，已在后续 `Agent init command boundary 不依赖 Aster` 批次迁出；`dead / guarded` 是前端公开 API、fixture 或 adapter 继续暴露 `initAsterAgent` / `AsterAgentStatus`。
- `remaining`：本刀当时不迁移 IPC 协议名，避免把窄命名收口扩大成 Electron / DevBridge / App Server 命令契约改造；该剩余项已由后续命令边界批次处理。整体目标完成度仍约 `95%`。

### 2026-07-09：Batch B native tool inventory external contract 收口

- `completed`：前端 / App Server mock backend / 客户端 fixture 的工具库存外部契约统一为 `native_tools`、`native_total`、`native_visible_total`、`native_catalog_unmapped_total`；旧 `registry_tools` / `registry_total` / `registry_visible_total` / `registry_catalog_unmapped_total` 不再作为 App Server 或前端客户端可接受字段。
- `completed`：`AgentRuntimeToolInventoryRegistryEntry` 重命名为 `AgentRuntimeToolInventoryNativeEntry`；`HarnessRegistryToolInventoryList.tsx` 删除态由 `HarnessNativeToolInventoryList.tsx` 承接，工具库存 overview / summary / empty state 的展示口径改成 `Native Tools` / `native`，不再把 current native surface 暴露成 Aster `ToolRegistry` 概念。
- `completed`：tool inventory 未初始化告警从 `Aster agent is not initialized` 改成 `Agent runtime is not initialized`，避免 current read model 对外继续暴露 Aster 运行时命名。
- `completed`：`agent_tools::inventory` 测试函数名、变量名和断言文案从 `registry inventory` / `bash_registry` 收敛到 `native inventory` / `bash_native`，避免 Rust current owner 自身继续使用 Aster registry 展示口径。
- `guarded`：`asterMigrationBoundary.test.ts` 新增外部契约守卫，禁止 `registry_tools`、`registry_total`、`registry_native`、`AgentRuntimeToolInventoryRegistryEntry`、`HarnessRegistryToolInventoryList`、`Runtime Registry` 回流到 tool inventory current contract、App Server fallback、客户端 fixture 和 Harness UI。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item tool inventory read model。current contract 是 Lime-owned native tool inventory；Aster `ToolRegistry` 仍只允许停留在 reply loop 未迁出前的内部 compat payload registry。
- `classification`：`current` 是 `native_tools` / `native_total` 外部契约、`AgentRuntimeToolInventoryNativeEntry` 和 Harness `Native Tools` 读面；`compat blocker` 是 vendored Aster `ToolRegistry` / `Tool` trait 仍服务未迁出的 reply loop；`dead / guarded` 是把外部库存字段或 UI 标题重新命名为 registry 的旧面。
- `remaining`：这一步只收口外部契约命名，未删除 root `aster` dependency、Aster `ToolRegistry` / `Tool` trait 注册壳、Skill gate wrapper、provider/reply loop 或 session/thread store adapter。整体目标完成度仍约 `95%`。

### 2026-07-08：Batch B Aster LSP tool surface deletion

- `completed`：对照 `/Users/coso/Documents/dev/rust/codex/codex-rs`，Codex 没有 `LSPTool` / `LspTool` / `LspCallback` / `LspOperation` 这类 current 工具面；Lime 也没有 App Server / GUI / Evidence current 主链真实消费 LSP，所以按 `aster-only-dead` 处理，不迁成新 Lime current tool。
- `completed`：删除 `lime-agent/src/lsp_bridge.rs`，`runtime_state_support::create_lime_tool_config()` 只保留 `request_user_input` Ask callback，不再 `.with_lsp_callback(...)`；`tool-runtime::native_overlay::runtime_native_tool_registration_allowlist()` 移除 `LSP`，Aster reply loop 并发安全工具列表也移除 `LSP`。
- `completed`：删除 vendored Aster `tools/lsp.rs` 与 `parser/{mod,lsp_client,lsp_manager,symbol_extractor,types}.rs`，并从 `tools/mod.rs` / `tools/registry.rs` / `lib.rs` 移除 LSP module、public export、callback config、默认注册和 alias。
- `completed`：删除 Rust catalog / discovery / permission / execution policy 中的 LSP 正向入口；前端 `agentTextNormalization`、tool display config、display subject、process summary、history fixture 不再把 `LSPTool` 归一化或展示成专用工具。
- `completed`：`scripts/agent-runtime/tool-execution-smoke.mjs` 的 `ask-lsp-tools` batch 收敛为 `ask-tools`，保留 Codex-current 的 `request_user_input` 覆盖，删除 LSP fixture 文件、LSP scripted tool call 和 evidence 字段。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 LSP forbidden-to-restore 守卫，要求 `lsp_bridge.rs`、vendor `tools/lsp.rs` 和 vendor parser LSP 文件保持不存在，并禁止恢复 vendor 注册、catalog alias、frontend exact config / normalization、`ask-lsp-tools` smoke batch。
- `Thread / Turn / Item`：LSP 不进入 refactor v1 owner。Ask/request_user_input 继续归 Turn HITL/action-required 链路；LSP 按 Codex 无对应能力直接 `dead / deleted / forbidden-to-restore`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`127 passed`。
- `validated`：`npx vitest run "src/lib/api/agentTextNormalization.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/components/ToolCallDisplay.toolSearchActions.test.tsx" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`51 passed`。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package tool-runtime -- --check`、`rustfmt --edition 2021 --check "lime-rs/crates/core/src/tool_calling.rs"`、`cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 2` 通过，`11 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_state_support --lib -j 2` 通过，`5 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::catalog --lib -j 2` 通过，`14 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_permissions --lib -j 2` 通过，`1 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core tool_calling --lib -j 2` 通过，`20 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core test_register_default_tools --lib -j 2`、`test_register_all_tools_with_config`、`test_register_all_tools_honors_allowed_tool_names` 均通过，各 `1 passed`。
- `validated`：scoped `git diff --check` 覆盖本刀写集通过。
- `remaining`：本刀只删除 Aster-only LSP 工具面；root `aster` dependency、Aster `ToolRegistry` / `Tool` trait 注册壳、Skill gate wrapper、provider/reply loop 和 session/thread store adapter 仍是 Phase 6 blocker。整体目标完成度仍约 `95%`。

### 2026-07-08：Batch B native overlay registration snapshot 单源化

- `completed`：`native_tools/runtime_overlay.rs::configure_lime_native_tool_overlay(...)` 现在返回 `Vec<RuntimeToolDefinition>`，这些 definition 来自实际注册进 Aster `ToolRegistry` 的 `NativeRegistration`，而不是让外层再并行读取 install plan。
- `completed`：`AgentRuntimeState::init_agent_with_db(...)` 用 `configure_lime_native_tool_overlay(&mut agent).await` 的返回值刷新 `native_tool_names` / `native_tool_definitions` snapshot；`runtime_state.rs` 删除 `reset_native_tool_names_from_current_plan(...)` 和对 `runtime_native_tool_install_definitions()` 的直接调用。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `runtime_state.rs` 消费 `configure_lime_native_tool_overlay(&mut agent).await` 返回的 definitions，并禁止恢复 `runtime_native_tool_install_definitions()` 作为 runtime state 初始化 read model；native overlay production 段必须返回 `Vec<RuntimeToolDefinition>`。
- `Thread / Turn / Item`：归属 Turn native tool registration 与 Item tool inventory read model。current definition owner 仍是 `tool-runtime`，但 runtime state 的 snapshot 来源现在与实际 overlay 注册链同源，不再形成 plan-read 与 registry-write 两条并行链。
- `classification`：`current` 是 `tool-runtime::native_overlay::runtime_native_tool_definition(...)`、`NativeRegistration.definition` 和 `AgentRuntimeState.native_tool_definitions`；`compat blocker` 是 Aster `ToolRegistry` registry write；`dead / guarded` 是 runtime state 初始化时绕过 overlay 实际注册结果、直接读取 `runtime_native_tool_install_definitions()` 的旧模式。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package tool-runtime -- --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_overlay --lib -j 2` 通过，`8 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_state --lib -j 2` 通过，`14 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`126 passed`。
- `validated`：`npx prettier --check "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `remaining`：这一步仍未删除 Aster `ToolRegistry` / `Tool` trait 本身、gateway-backed adapter、Skill gate wrapper、root `aster` dependency 或 `lime-agent` 的 `aster.workspace = true`。下一刀继续迁出 Aster reply loop native tool execution，或回到 provider/reply loop 最大 blocker；整体目标完成度仍约 `95%`。

### 2026-07-08：Batch B native registry registration boundary 收缩

- `completed`：删除 `native_tools/runtime_overlay.rs::RuntimeNativeToolRegistry` wrapper 与 `runtime_native_tool_registry(agent)` 外泄入口；Aster `ToolRegistry` 的 clone / lock / register 生命周期只留在 `native_tools/runtime_overlay.rs::register_native_tool_on_agent(...)` 内部。
- `completed`：`AgentRuntimeState::register_native_tool(...)` 只调用 `crate::native_tools::register_native_tool_on_agent(&self.agent, registration)`，然后维护 Lime current `native_tool_names` / `native_tool_definitions` snapshot；它不再获取 Aster registry wrapper，也不再知道 registry 注册细节。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `runtime_state.rs` production 段使用 `register_native_tool_on_agent(...)`，并禁止 `runtime_native_tool_registry`、`RuntimeNativeToolRegistry` 和 `Arc<RwLock<ToolRegistry>>` wrapper 回流到 native overlay 公开边界。
- `Thread / Turn / Item`：归属 Turn native tool registration boundary。current availability / definition read model 仍由 `AgentRuntimeState` 维护；Aster `ToolRegistry` 只剩 reply loop 未迁出前的内部 compat payload registry。
- `classification`：`current` 是 `AgentRuntimeState.native_tool_names` / `native_tool_definitions` 与 `tool-runtime` native definition owner；`compat blocker` 是 `register_native_tool_on_agent(...)` 内部的 Aster registry write 和 `RuntimeNativeToolAdapter` / `RuntimeDefinitionToolAdapter`；`dead / guarded` 是 `RuntimeNativeToolRegistry` wrapper、`runtime_native_tool_registry(...)` 外泄入口和 runtime state 获取 registry 后注册的旧模式。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package tool-runtime -- --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_overlay --lib -j 2` 通过，`8 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_state --lib -j 2` 通过，`14 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent gateway_bridge --lib -j 2` 通过，`3 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`126 passed`。
- `validated`：`npx prettier --check "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "src/lib/governance/asterMigrationBoundary.test.ts"` 通过；本刀 scoped `git diff --check` 通过。
- `remaining`：这一步仍未删除 Aster `ToolRegistry` / `Tool` trait 本身、gateway-backed adapter、Skill gate wrapper、root `aster` dependency 或 `lime-agent` 的 `aster.workspace = true`。下一刀仍应继续迁出 Aster reply loop native tool execution，或回到 provider/reply loop 的 `Agent::reply` / `Message` / `AgentEvent` blocker；整体目标完成度仍约 `95%`。

### 2026-07-08：Batch B native registration definition owner 上提

- `completed`：`NativeRegistration::new(definition: RuntimeToolDefinition, tool: Box<dyn Tool>)` 已成为唯一注册封装入口，production `create_runtime_native_tool(...)` 先通过 `tool-runtime::native_overlay::runtime_native_tool_definition(step.tool())` 获取 current definition，再把临时 Aster `Tool` payload 放进 `NativeRegistration`。
- `completed`：删除 `NativeRegistration::from_tool(...)`；测试用 `RuntimeApprovalResumeTool` 改为 `runtime_approval_resume_registration()` 显式构造 `RuntimeToolDefinition::new(...)` 后注册，避免测试 fixture 从 Aster `Tool::{name,description,input_schema}` 反推 current definition。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `NativeRegistration::new(definition: RuntimeToolDefinition, tool: Box<dyn Tool>)`、`runtime_native_tool_definition(step.tool())` 与 `NativeRegistration::new(definition, tool)` 存在，并禁止 `from_tool(...)`、`tool.name().to_string()`、`tool.description().to_string()`、`tool.input_schema()` 回流到 `runtime_overlay.rs` 的 definition 推导路径。
- `Thread / Turn / Item`：归属 Turn native tool availability / definition read model。current model-visible definition 由 `tool-runtime` 或 gateway `NativeDispatch::definitions()` 提供；Aster `Tool` trait 只剩 reply loop 删除前的 registry payload。
- `classification`：`current` 是 `tool-runtime::native_overlay::runtime_native_tool_definition(...)`、gateway `NativeDispatch::definitions()` 和 `NativeRegistration.definition`；`compat blocker` 是 Aster `Tool` payload / registry；`dead / guarded` 是从 Aster `Tool` trait 反推 current definition 的旧模式。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package tool-runtime -- --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_overlay --lib -j 2` 通过，`8 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_state --lib -j 2` 通过，`14 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent gateway_bridge --lib -j 2` 通过，`3 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`126 passed`。
- `remaining`：这一步没有删除 Aster `ToolRegistry` / `Tool` trait，也没有删除 root `aster` dependency 或 `lime-agent` 的 `aster.workspace = true`；整体目标完成度仍约 `95%`。

### 2026-07-08：Batch B gateway permission owner 上提到 tool-runtime

- `completed`：`tool-runtime::native_overlay` 新增 `check_runtime_gateway_tool_permissions(...)`，把 gateway-backed `memory_store`、`image_task`、`tool_search`、`list_mcp_resources`、`read_mcp_resource` 的 permission decision 统一转成 `RuntimeNativePermissionDecision`；per-tool 详细校验仍留在 `tool-runtime::{memory_store,image_task,tool_search,mcp_resource}` current owner。
- `completed`：`RuntimeDefinitionPermissionCheck` 改为返回 current `RuntimeNativePermissionDecision`；`RuntimeDefinitionToolAdapter::check_permissions(...)` 统一调用 `permission_decision_to_aster(...)` 转成临时 Aster `PermissionCheckResult`。
- `completed`：`native_tools/gateway_bridge.rs` 删除 `check_memory_store_permissions` / `check_image_task_permissions` / `check_tool_search_permissions` / `check_mcp_resource_permissions` 四个 per-tool helper，只保留 `check_gateway_tool_permissions(...)` 从 Aster `ToolContext` 提取 `working_directory` / `session_id` 并委托 `tool-runtime` current owner。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tool-runtime::native_overlay` 持有 `check_runtime_gateway_tool_permissions(...)`，并要求 `gateway_bridge.rs` 只调用统一 gateway permission API；memory / image / tool_search / MCP resource 的正向守卫不再允许 `gateway_bridge.rs` 直接调用各自 per-tool permission function。
- `Thread / Turn / Item`：归属 Turn tool lifecycle permission preflight。Aster `ToolContext` 仍只是 reply loop 删除前的 compat 输入；permission rule、tool definition、executor 和 metadata 归属 `tool-runtime` current owner。
- `classification`：`current` 是 `tool-runtime::native_overlay::check_runtime_gateway_tool_permissions(...)` 和 `tool-runtime::{memory_store,image_task,tool_search,mcp_resource}`；`compat blocker` 是 `gateway_bridge.rs` / `RuntimeDefinitionToolAdapter` / Aster `ToolContext` / Aster `PermissionCheckResult` 转换；`dead / guarded` 是 agent 侧 gateway-backed per-tool permission helper 和直接 per-tool permission import。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 2` 通过，`11 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent gateway_bridge --lib -j 2` 通过，`3 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_tool_bridge --lib -j 2` 通过，`9 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`126 passed`。
- `remaining`：这一步仍未删除 Aster `ToolRegistry` / `Tool` trait 注册壳、Skill gate wrapper、root `aster` dependency 或 `lime-agent` 的 `aster.workspace = true`。下一刀继续迁出 Aster reply loop native tool execution 到 current Turn executor，或回到 provider/reply loop 的 `Agent::reply` / `Message` / `AgentEvent` blocker；整体目标完成度仍约 `95%`。

### 2026-07-08：Batch B native registration compat boundary 收缩

- `completed`：新增 `native_tools/runtime_overlay.rs::NativeRegistration`，集中封装临时 Aster `Box<dyn Tool>` 与 current `RuntimeToolDefinition`。早期 `RuntimeNativeToolRegistry::register(...)` wrapper 已由后续 `native registry registration boundary 收缩` 刀删除，当前注册只允许通过 `register_native_tool_on_agent(...)` 进入 native overlay 内部。
- `completed`：`AgentRuntimeState::register_native_tool(...)` 改为接收 `crate::native_tools::NativeRegistration`，生产路径不再 import `aster::tools::Tool`，也不再从裸 `Box<dyn Tool>` 反推 definition。`memory_store` / `image_task` / `tool_search` gateway-backed 注册循环现在直接注册 `NativeRegistration`。
- `completed`：`gateway_bridge.rs` 的 `create_memory_tools(...)` / `create_image_tools(...)` / `create_tool_search_tools(...)` 改为返回 `Vec<NativeRegistration>`；Aster `Tool` trait 对象只在 `native_tools` compat 边界内创建和拆包。`confirm_tool_action_resumes_pending_aster_tool_execution` fixture 也改为通过显式 `RuntimeToolDefinition` + `NativeRegistration::new(...)` 注册，避免测试绕过 current registration snapshot 或从 Aster `Tool` trait 反推 definition。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `runtime_state.rs` production 段包含 `NativeRegistration`，并禁止出现 `use aster::tools::Tool` / `Box<dyn Tool>`；同时要求 `native_tools/runtime_overlay.rs` 持有 `NativeRegistration` 和唯一 Aster `Tool` trait 注册封装。
- `Thread / Turn / Item`：归属 Turn native tool registration boundary。current name / definition read model 留在 `AgentRuntimeState`；Aster `Tool` trait 只剩 reply loop 删除前的 registry compat payload。
- `classification`：`current` 是 `AgentRuntimeState.native_tool_names` / `native_tool_definitions` 与 `tool-runtime` native definition owner；`compat blocker` 是 `NativeRegistration` 的 Aster `Tool` payload、`runtime_tool_bridge.rs` 和 `gateway_bridge.rs`；`dead / guarded` 是 runtime state 直接接收裸 Aster `Box<dyn Tool>` 或持有 `RuntimeNativeToolRegistry` wrapper 的旧注册面。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package tool-runtime -- --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent gateway_bridge --lib -j 2` 通过，`3 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_overlay --lib -j 2` 通过，`8 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_state --lib -j 2` 通过，`14 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent native_tools --lib -j 2` 通过，`18 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`125 passed`。
- `remaining`：这一步仍未删除 Aster `ToolRegistry` / `Tool` trait 注册壳，也未删除 root `aster` dependency 或 `lime-agent` 的 `aster.workspace = true`。下一刀继续把 reply loop native tool execution 迁向 current Turn executor，或切回 provider/reply loop 的 `Agent::reply` / `Message` / provider trait blocker；整体目标完成度仍约 `95%`。

### 2026-07-08：Batch B native tool availability / definition read model current owner

- `completed`：`tool-runtime::skill_gate` 新增 `skill_tool_definition()`，`tool-runtime::native_overlay` 新增 `runtime_native_tool_definition(...)` / `runtime_native_tool_install_definitions()`；install plan 现在同时给出注册顺序、availability name 和 current definition。
- `completed`：`AgentRuntimeState` 新增 `native_tool_names` / `native_tool_definitions` current read model 和 `native_tool_names_snapshot()` / `native_tool_definitions_snapshot()`；初始化时最初从 `tool-runtime::native_overlay::runtime_native_tool_install_definitions()` 装载，后续 `native overlay registration snapshot 单源化` 刀已改为消费 `configure_lime_native_tool_overlay(...)` 实际注册返回的 definitions；gateway-backed native tool 后续注册时同步追加；`contains_native_tool(...)` 不再读取 Aster `ToolRegistry`。
- `completed`：`agent_tools/tool_inventory_runtime_adapter.rs` 的 GUI / Evidence inventory seed 改为先消费 `agent_state.native_tool_definitions_snapshot().await` 作为 current definitions，再追加不与 current names 重名的 Aster registry residual definitions；`current_surface_tool_names` 直接来自 `agent_state.native_tool_names_snapshot().await`，不再从 Aster registry definitions 反推。
- `guarded`：`asterMigrationBoundary.test.ts` 固定 `native_tool_names_snapshot()` / `native_tool_definitions_snapshot()` 与 inventory adapter 的 current snapshot 消费，并禁止在 inventory adapter 中恢复 `runtime_native_tool_install_plan()` 过滤 registry definitions 的旧读模型。
- `Thread / Turn / Item`：归属 Turn native tool availability / definition read model 与 Item tool inventory projection。current availability / definition 由 Lime runtime state 提供；Aster `ToolRegistry` 只剩 reply loop 尚未迁出的 execution / residual definition 展示来源。
- `classification`：`current` 是 `tool-runtime::native_overlay`、`tool-runtime::skill_gate::skill_tool_definition()`、`AgentRuntimeState.native_tool_names` / `native_tool_definitions` 和 snapshot API；`compat blocker` 是 `native_tools/runtime_overlay.rs` 与 Aster `ToolRegistry` / `Tool` trait 注册壳；`dead / guarded` 是从 Aster registry definitions 反推 `current_surface` 或 current definition 的旧读模型。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package tool-runtime -- --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 2` 通过，`9 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime skill_tool_surface --lib -j 2` 通过，`1 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent native_tool_availability --lib -j 2` 通过，`1 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_state --lib -j 2` 通过，`14 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_inventory --lib -j 2` 通过，`13 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`125 passed`。
- `remaining`：这一步仍未删除 Aster `ToolRegistry` / `Tool` trait 注册壳，也未删除 root `aster` dependency 或 `lime-agent` 的 `aster.workspace = true`。下一刀继续迁出 reply loop native tool execution 或回到 provider/reply loop 的 `Agent::reply` / `Message` / provider trait blocker；整体目标完成度仍约 `95%`。

### 2026-07-08：Batch B gateway-backed adapter 集中与 wrapper 删除

- `completed`：新增 `lime-agent/src/native_tools/gateway_bridge.rs`，集中承接 `memory_store`、`image_task`、`tool_search` 三组需要 App Server gateway 的临时 Aster `Tool` trait adapter。统一逻辑只做 per-gateway `NativeDispatch::builder()`、`RuntimeDefinitionToolAdapter::new(...)`、permission delegate、lookup alias 和 image turn-context provider 接线。
- `deleted / guarded`：删除 `lime-agent/src/native_tools/{memory_store,image_tasks,tool_search}.rs`。这些文件的模型可见 definition、executor handle、DTO / metadata / path 规则此前已迁入 `tool-runtime` 和 App Server current gateway，继续保留 per-tool wrapper 会让 `lime-agent` adapter 重新看起来像 owner。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 `DELETED_GATEWAY_BACKED_NATIVE_TOOL_WRAPPER_FILES`，要求三个旧 wrapper 保持物理删除；正向 owner 守卫改为读取 `gateway_bridge.rs`，同时要求 `tool-runtime::native_dispatch`、App Server gateway 和前端 ToolSearch summary 继续作为真实消费链。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item tool output projection。`tool-runtime::{memory_store,image_task,tool_search}` 和 App Server gateway 是 current owner；`gateway_bridge.rs` 只是 Aster reply loop 删除前的 transitional adapter。
- `classification`：`current` 是 `tool-runtime::native_dispatch`、`tool-runtime::{memory_store,image_task,tool_search}`、App Server memory/media/MCP gateway 与 GUI / Evidence / ToolSearch summary 消费链；`compat blocker` 是 `gateway_bridge.rs` + `RuntimeDefinitionToolAdapter` 仍把 current executor 落到 Aster `Tool` trait；`dead / deleted / forbidden-to-restore` 是 `native_tools/{memory_store,image_tasks,tool_search}.rs` 的 per-tool Aster wrapper 文件。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package tool-runtime -- --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent gateway_bridge --lib -j 2` 通过，`3 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent native_tools --lib -j 2` 通过，`18 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_overlay --lib -j 2` 通过，`8 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`125 passed`。
- `remaining`：这一步仍未删除 Aster reply loop 的 `ToolRegistry` / `Tool` trait 注册壳，也未删除 root `aster` dependency 或 `lime-agent` 的 `aster.workspace = true`。下一刀继续把 native tool execution 从 Aster reply loop 迁到 current Turn executor，或回到 provider/reply loop 的 `Agent::reply` / `Message` / `AgentEvent` blocker；整体目标完成度仍约 `95%`。

### 2026-07-08：Batch B stateless wrapper test adapter helper deletion

- `completed`：删除 `sleep`、`view_image`、`update_plan`、`WebFetch`、`WebSearch`、`apply_patch`、`skill_search` per-tool wrapper 内的 `#[cfg(test)] create_*_tool()` helper 和直接 `RuntimeNativeToolAdapter::new` 调用；这些文件现在只保留 permission delegate 与纯权限单测。
- `completed`：`native_tools/runtime_tool_bridge.rs` 新增集中 adapter 回归测试，覆盖 `sleep` current executor 执行、`apply_patch` current executor 执行、`update_plan` turn-context source 注入和 `view_image` current surface / alias 暴露。
- `guarded`：`asterMigrationBoundary.test.ts` 现在同时禁止 stateless wrapper 的 production 和 test-only 路径恢复 `RuntimeNativeToolAdapter::new` 或 `create_*_tool()`；adapter 创建回归只能集中在 `runtime_tool_bridge`。
- `Thread / Turn / Item`：该清理仍归属 Turn tool lifecycle / Item tool output projection；它没有新增功能，只把已迁工具的临时 Aster adapter 测试边界从 per-tool wrapper 移回统一 bridge。
- `classification`：`current` 是 `tool-runtime::native_overlay` / `native_dispatch` 与集中 bridge 回归测试；`compat blocker` 是 `runtime_tool_bridge.rs::RuntimeNativeToolAdapter` 仍服务 Aster reply loop；`dead / guarded` 是 per-tool `#[cfg(test)] create_*_tool()` helper、wrapper 内直接 `RuntimeNativeToolAdapter::new` 和 wrapper 自持 adapter 回归。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_tool_bridge --lib -j 2` 通过，`4 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent native_tools --lib -j 2` 通过，`24 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent apply_patch_tool --lib -j 2` 通过，`2 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_search_tool --lib -j 2` 通过，`1 passed`。
- `remaining`：这一步仍未删除 Aster `ToolRegistry` / `Tool` trait 注册壳，也未删除 root `aster` dependency；下一刀应继续把 native tool registration 从 Aster reply loop 迁到 current Turn executor，或回到 provider/reply loop blocker。

### 2026-07-08：Batch B centralized native adapter factory

- `completed`：`tool-runtime::native_overlay` 的 install step 现在携带 `RuntimeNativeToolTurnContextSource`，把 `update_plan`、`WebFetch`、`WebSearch`、`skill_search` 这类需要 turn metadata 的来源固定到 current owner。
- `completed`：`native_tools/runtime_overlay.rs` 改为按 `runtime_native_tool_install_plan()` 统一调用 `create_runtime_native_tool_adapter(step.tool())`；per-tool production wrapper 不再创建 `RuntimeNativeToolAdapter`，也不再传入 `runtime_native_permission_check(...)`。`create_*_tool()` 仅作为 `#[cfg(test)]` helper 服务定向测试。
- `completed`：`native_tools/runtime_tool_bridge.rs` 新增 `create_runtime_native_tool_adapter(...)` 与 `turn_context_provider_for_source(...)`，集中承接 stateless 已迁工具的临时 Aster `Tool` 创建、surface/options 读取、turn-context 接线和 current dispatch 调用。
- `guarded`：`asterMigrationBoundary.test.ts` 已更新为要求 production adapter factory 只能在 `runtime_overlay.rs` + `runtime_tool_bridge.rs`；stateless wrapper 生产路径不得恢复 `RuntimeNativeToolAdapter::new`、`with_turn_context_provider`、`impl Tool for`、surface/options 读取或 executor handle 选择。gateway-backed `memory_store` / `image_task` / `tool_search` 仍允许通过 `RuntimeDefinitionToolAdapter` 接入 App Server gateway executor。
- `Thread / Turn / Item`：该骨架归属 Turn tool lifecycle / Item tool output projection；`tool-runtime` 是 model-visible surface、install plan、dispatch 和 executor current owner，`runtime_tool_bridge` 只是 Aster reply loop 删除前的 compat bridge。
- `classification`：`current` 是 `tool-runtime::native_overlay` / `native_dispatch` 与各 native executor；`compat blocker` 是 `runtime_overlay.rs` 的 Aster `ToolRegistry` 注册和 `runtime_tool_bridge.rs` 的 `Tool` trait adapter；`dead / guarded` 是 per-tool production `create_*_tool()` factory、wrapper 本地 `impl Tool`、wrapper 自持 surface/options 或 executor handle。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 2` 通过，`9 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_overlay --lib -j 2` 通过，`8 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent native_tools --lib -j 2` 通过，`24 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent apply_patch_tool --lib -j 2` 通过，`3 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_search_tool --lib -j 2` 通过，`1 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`125 passed`。
- `remaining`：这一步仍未删除 root `aster` dependency。Aster `Agent::reply` / `Message` / `AgentEvent` / provider trait object、`ToolRegistry` / `Tool` trait 注册壳、session / thread store adapter 仍是 Phase 6 blocker；整体完成度仍约 `95%`，不能上调到完成态。

### 2026-07-08：Batch A/D reply source stream projection runner 骨架

- `completed`：`agent-runtime::reply_stream::project_reply_stream(...)` 上提 source stream -> current `RuntimeReplyStreamEvent` envelope 的通用 runner，负责读取 source stream、调用 `RuntimeReplyStreamProjector`、保留多事件 projection 和 source error 传播规则；该 runner 不依赖 Aster。
- `completed`：`request_tool_policy/aster_reply_stream_adapter.rs::project_aster_reply_stream(...)` 现在只创建 `AsterReplyStreamProjector` 并调用 current runner；Aster adapter 不再拥有 `async_stream::try_stream!` / `.next().await` stream plumbing。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime::reply_stream` 暴露 `project_reply_stream(...)` 与 source-agnostic projection state，要求 Aster stream adapter 委托 `project_reply_stream(stream, AsterReplyStreamProjector::new(stream_request))`，并禁止把 `async_stream::try_stream!` / `.next().await` 恢复到 Aster adapter。
- `Thread / Turn / Item`：该骨架属于 Turn event materialization runner。Codex 对照是 Turn runtime 统一发送 / materialize `EventMsg`，source adapter 只负责 source-specific projection；Lime 当前仍消费 Aster `AgentEvent` source，但 stream runner 已进入 不依赖 Aster current owner。
- `classification`：`current skeleton` 是 `agent-runtime::reply_stream::project_reply_stream(...)`；`compat` 是 `AsterReplyStreamProjector` 对 Aster `AgentEvent` / Aster provider side-channel message 的投影；`dead / guarded` 是 Aster adapter 自持 source stream loop。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-stream-runner-agent-runtime-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib -j 2` 通过，`15 passed`。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-stream-runner-lime-agent-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `remaining`：这一步仍未删除 root `aster` dependency。Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message` lowering、Aster `AgentEvent` source、native `Tool` trait 注册壳、Aster `SessionStore` / `ThreadRuntimeStore` adapter 仍是 Phase 6 blocker；下一刀继续迁出 source execution body 或 native tool registry 壳。

### 2026-07-08：Batch A/D compat source executor boundary 骨架

- `completed`：`request_tool_policy/aster_reply_backend_adapter.rs` 新增私有 `ReplyExitSourceExecutor` 与 `ReplyExitSourceCall`，把 Aster `Agent::reply(...)` / `ConfiguredReplyProvider::stream_reply_with_agent(...)` 的最终执行体集中到单一 compat executor。
- `completed`：`AsterReplySource::run(call)` 现在只做 current `RuntimeReplySourceRun` -> mapped Aster payload lowering，并委托 `ReplyExitSourceExecutor::run(...)`；source adapter 不再同时持有 lowering、source path dispatch 和 Aster execution body 三种职责。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `AsterReplySource` 只包含 `ReplyExitSourceExecutor::new(self.agent, self.provider).run(call).await` 委托，并禁止 `AsterReplySource` body 恢复 `RuntimeReplySourceCall::{Default, Provider}` path match、`.reply(...)` 或 `.stream_reply_with_agent(...)` 直接调用；同时要求这些 Aster 调用只停留在 `ReplyExitSourceExecutor`。
- `Thread / Turn / Item`：该骨架属于 Turn source backend execution boundary。Codex 对照是 Turn runner 决定 source call shape，source adapter 只把 source facts 交给具体 executor；Lime 当前仍经 Aster executor，但删除点已集中。
- `classification`：`current skeleton` 是 `agent-runtime::reply_backend::RuntimeReplySourceCall` / `RuntimeReplySource::run(call)`；`compat` 是私有 `ReplyExitSourceExecutor`，仍调用 Aster `Agent::reply` / provider bridge；`dead / guarded` 是 `AsterReplySource` 本体直接拥有 default/provider path dispatch 和 Aster execution body。
- `validated`：`rustfmt --edition 2021 --check "lime-rs/crates/agent/src/request_tool_policy/aster_reply_backend_adapter.rs"` 通过。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-source-executor-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"` 通过。
- `remaining`：这一步仍未删除 Aster backend。Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message` lowering、Aster `AgentEvent` source、native `Tool` trait 注册壳、Aster `SessionStore` / `ThreadRuntimeStore` adapter 与 root `aster` dependency 仍是 Phase 6 blocker；下一刀继续把 `ReplyExitSourceExecutor` 的 default/provider execution body 替换为 Lime current backend 或继续迁出 message/event/tool source。

### 2026-07-08：Batch A/D unified source call entry 骨架

- `completed`：`agent-runtime::reply_backend` 新增 `RuntimeReplySourceCall<M, C>` 与 不依赖 Aster `RuntimeReplySourceRun`，把 default / provider 两条 source call envelope 统一到单一 current enum；`run_reply_source(...)` 现在只构造 `RuntimeReplySourceCall::{Default, Provider}` 后调用 `RuntimeReplySource::run(call)`。
- `completed`：`RuntimeReplySource` trait 从 `run_default(...)` / `run_provider(...)` 双入口收敛为单一 `run(call)`；default/provider path 分派仍归 `agent-runtime` current runner，source backend 只接收一次 materialized call。
- `completed`：`request_tool_policy/aster_reply_backend_adapter.rs::AsterReplySource` 改为只实现 `run(call)`，在一个 compat 边界内通过 `call.map(lower_aster_reply_message, to_aster_session_config)` lowering 后再 match Aster default/provider payload；旧两个 source 方法不再存在。
- `completed`：`agent-runtime/src/reply_backend.rs` 运行时代码已从 `1201` 行拆到约 `486` 行，测试移入 `agent-runtime/src/reply_backend/tests.rs`；这是为遵守仓库 `800/1000` 行体量边界，避免继续向中心文件追加业务逻辑。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `RuntimeReplySourceCall` / `RuntimeReplySourceRun`、要求 source runner 构造 `Default` / `Provider` 两个 current variant、要求 Aster backend adapter 只实现 `fn run`，并禁止 `RuntimeReplySource` trait 与 Aster backend adapter 恢复 `fn run_default` / `fn run_provider` 双入口。
- `Thread / Turn / Item`：该骨架属于 Turn source backend execution handoff。Codex 对照是 Turn owner materialize run call 并把 source path 当 typed input 交给 backend；Lime compat source adapter 不再拥有 source method topology。
- `classification`：`current skeleton` 是 `agent-runtime::reply_backend::RuntimeReplySourceCall` / `RuntimeReplySourceRun` / `RuntimeReplySource::run(call)`；`compat` 是 `aster_reply_backend_adapter.rs::AsterReplySource` 仍在单一 `run(call)` 内调用 Aster `Agent::reply(...)` 或 provider bridge；`dead / guarded` 是 `RuntimeReplySource::run_default` / `run_provider` 双入口以及 Aster source adapter 的双方法 topology。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-source-call-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 2` 通过，`16 passed`。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-source-call-agent-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`。
- `remaining`：这一步仍未删除 Aster source backend。Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message` lowering、Aster `AgentEvent` source、native `Tool` trait 注册壳、Aster `SessionStore` / `ThreadRuntimeStore` adapter 与 root `aster` dependency 仍是 Phase 6 blocker；下一刀继续 provider/reply loop，优先迁出 Aster default/provider source backend execution body 或 provider trait object。整体完成度仍约 `95%`，不能上调到完成态。

### 2026-07-08：Batch A/D default source call envelope 骨架

- `completed`：`agent-runtime::reply_backend` 新增 `RuntimeReplyDefaultCall<M, C>` 与 不依赖 Aster `RuntimeReplyDefaultSourceCall` type alias，承接 default `Agent::reply` path 的 source call envelope：current `RuntimeReplyMessage`、current `AgentSessionConfig` 与 cancel token 由 Turn owner 一次性交接。
- `completed`：`run_reply_source(...)` 的 default path 改为构造 `RuntimeReplyDefaultSourceCall::new(...)` 后调用 `RuntimeReplySource::run_default(call)`；source runner 不再把 message、session config、cancel token 三个字段散传给 default source。
- `completed`：`request_tool_policy/aster_reply_backend_adapter.rs::AsterReplySource::run_default(...)` 只接收 current default source call，并通过 `call.map(lower_aster_reply_message, to_aster_session_config)` 在单一 compat 边界 lowering 到 Aster payload，再调用临时 `Agent::reply(...)`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime::reply_backend` 持有 `RuntimeReplyDefaultCall` / `RuntimeReplyDefaultSourceCall` / `RuntimeReplyDefaultSourceCall::new(...)`，要求 Aster backend adapter 同时在 default/provider 两条 source path 使用 `call.map(...)`，并禁止 `RuntimeReplySource` trait 与 Aster backend adapter 恢复 default source 的 `message + session_config + cancel_token` 散参签名。
- `Thread / Turn / Item`：该骨架属于 Turn default source call handoff。Codex 对照是 Turn owner 统一 materialize source call，source backend 只执行 call；Lime compat source adapter 只能把 current call lowering 到 Aster，不能继续拥有 default source call shape。
- `classification`：`current skeleton` 是 `agent-runtime::reply_backend::RuntimeReplyDefaultSourceCall`；`compat` 是 `aster_reply_backend_adapter.rs::AsterReplySource` 仍调用 Aster `Agent::reply(...)`；`dead / guarded` 是 default source call 的三散参签名。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent` 已应用。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-default-call-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 2` 通过，`15 passed`。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-default-call-agent-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`。
- `remaining`：这一步仍未删除 Aster source backend。Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message` lowering、Aster `AgentEvent` source、native `Tool` trait 注册壳、Aster `SessionStore` / `ThreadRuntimeStore` adapter 与 root `aster` dependency 仍是 Phase 6 blocker；下一刀继续 provider/reply loop，优先把 default/provider source backend execution body 或 Aster provider trait object 迁出 Aster。整体完成度仍约 `95%`，不能上调到完成态。

### 2026-07-08：Batch A/D provider source call envelope 骨架

- `completed`：`agent-runtime::reply_backend` 新增 `RuntimeReplyProviderCall<M, C>` 与 不依赖 Aster `RuntimeReplyProviderSourceCall` type alias，承接 provider run path 的 source call envelope：`RuntimeReplyProviderStreamStart`、current `RuntimeReplyMessage`、current `AgentSessionConfig` 与 cancel token 由 Turn owner 一次性交接。
- `completed`：`run_reply_source(...)` 的 provider path 改为构造 `RuntimeReplyProviderSourceCall::new(...)` 后进入 `RuntimeReplySource::run(call)`；source runner 不再把 provider start、message、session config、cancel token 四个字段散传给 provider source。
- `completed`：`request_tool_policy/aster_reply_backend_adapter.rs::AsterReplySource::run(call)` 只接收 current source union，并通过 `call.map(lower_aster_reply_message, to_aster_session_config)` 在单一 compat 边界 lowering 到 Aster payload。
- `completed`：`credential_bridge/runtime_provider_adapter.rs::ConfiguredReplyProvider::stream_reply_with_agent(...)` 改为接收 `RuntimeReplyProviderCall<Message, aster::agents::SessionConfig>`，只通过 `provider_call.trace()` 记录 diagnostics，再原样转交私有 `CompatAsterReplyProviderBackend`；旧外层 `provider_start + Agent + Message + SessionConfig + cancel_token` 散参入口已删除。
- `completed`：`CompatAsterReplyProviderBackend::stream_reply_with_agent(...)` 也改为接收 mapped `RuntimeReplyProviderCall<Message, aster::agents::SessionConfig>`；`provider_call.into_parts()` 只剩在最内层 `Agent::reply_with_provider(...)` 旁边解包，Aster provider trait object 的执行事实不再向 credential bridge 外层扩散。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime::reply_backend` 持有 `RuntimeReplyProviderCall` / `RuntimeReplyProviderSourceCall` / `RuntimeReplyProviderSourceCall::new(...)`，要求 Aster backend adapter 使用 `RuntimeReplyProviderSourceCall` 和 `call.map(...)`，要求 credential bridge 使用 `provider_call.trace()` 并把 `provider_call` 原样交给 compat backend；同时禁止恢复 `provider_start: &RuntimeReplyProviderStreamStart` / `provider_start.trace()` / `&provider_start` 旧入口，以及 `user_message: Message`、`session_config: aster::agents::SessionConfig`、`cancel_token: Option<CancellationToken>` 三散参 backend 签名。
- `Thread / Turn / Item`：该骨架属于 Turn provider source call handoff。Codex 对照是 provider 请求 metadata、request kind 和 turn identity 由 core client / Turn owner 统一组合，source stream 只执行 call；Lime compat source adapter 只能把 current call lowering 到 Aster，不能继续拥有 source call shape。
- `classification`：`current skeleton` 是 `agent-runtime::reply_backend::RuntimeReplyProviderSourceCall`；`compat` 是 `RuntimeReplyProviderCall<Message, aster::agents::SessionConfig>` 仍作为 Aster provider bridge 的临时 mapped payload，且解包点只允许停留在私有 `CompatAsterReplyProviderBackend`；`dead / guarded` 是 provider source call 的四散参签名、credential bridge 直接消费 `RuntimeReplyProviderStreamStart`、以及 `ConfiguredReplyProvider` 外层解包 mapped call。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent` 已应用。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-provider-call-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 2` 通过，`14 passed`。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-provider-bridge-call-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib -j 2` 通过，`27 passed`。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-provider-bridge-agent-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `remaining`：这一步仍未删除 Aster source backend。Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message` lowering、Aster `AgentEvent` source、native `Tool` trait 注册壳、Aster `SessionStore` / `ThreadRuntimeStore` adapter 与 root `aster` dependency 仍是 Phase 6 blocker；下一刀继续 provider/reply loop，优先把 provider source backend execution body 或 Aster provider trait object 迁出 Aster。

### 2026-07-08：Batch A provider stream start trace snapshot 骨架

- `completed`：`model-provider::provider_stream` 新增 `RuntimeReplyProviderStreamTrace` 与 `RuntimeReplyProviderStreamStart::trace(...)`，承接 provider source call diagnostics snapshot：session、input kind、message chars、provider backend/name/model 由 current provider stream start owner 统一选择。
- `completed`：`credential_bridge/runtime_provider_adapter.rs::ConfiguredReplyProvider::stream_reply_with_agent(...)` 改为只消费 `provider_start.trace()` 记录 provider call diagnostics，不再从 `provider_start.stream_request()` 拆字段，也不再在 credential bridge 内部选择 `provider_backend()` / `provider_name()` / `model_name()` 日志字段。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `model-provider` 持有 `RuntimeReplyProviderStreamTrace` / `trace(...)`，要求 `ConfiguredReplyProvider` 使用 `provider_start.trace()`，并禁止恢复 `let stream_request = provider_start.stream_request()`、`stream_request.provider_backend()`、`stream_request.provider_name()`、`stream_request.model_name()` 这类 adapter 内部字段拆解。
- `Thread / Turn / Item`：该骨架属于 Turn provider/reply execution handoff 的 provider source call diagnostics。Codex 对照是 Turn/provider owner materialize request/run facts，compat source adapter 只执行 source call，不再把 provider request DTO 当作 credential bridge 的事实源。
- `classification`：`current skeleton` 是 `model-provider::provider_stream::RuntimeReplyProviderStreamTrace`；`compat` 是 `credential_bridge/runtime_provider_adapter.rs` 仍持有 Aster provider trait object 并通过 Aster `Agent::reply_with_provider(...)` 执行；`dead / guarded` 是 credential bridge 本地拆 `RuntimeReplyStreamRequest` 字段做 provider call diagnostics。
- `validated`：`rustfmt --edition 2021 --check "lime-rs/crates/model-provider/src/provider_stream.rs" "lime-rs/crates/model-provider/src/provider_stream/tests.rs" "lime-rs/crates/agent/src/credential_bridge/runtime_provider_adapter.rs"` 通过。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-provider-stream-trace-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 2` 通过，`17 passed`。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-provider-stream-trace-agent-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib -j 2` 通过，`27 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`。
- `remaining`：这一步仍未删除 provider source backend。Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message` lowering、Aster `AgentEvent` source、native `Tool` trait 注册壳、Aster `SessionStore` / `ThreadRuntimeStore` adapter 与 root `aster` dependency 仍是 Phase 6 blocker；下一刀继续 provider/reply loop，优先把 provider source execution body 或 Aster provider trait object 迁出 Aster。

### 2026-07-08：Batch A/D reply backend source runner contract 骨架

- `completed`：`agent-runtime::reply_backend` 新增 GAT 形式的 `RuntimeReplySource` 与 `run_reply_source(...)`，承接 backend run path -> source backend call 的 current runner contract：`RuntimeReplyBackendRunPath::{Default, Provider}` 的分派、source call future lifetime、`RuntimeReplyBackendRunOutcome` 与 original `RuntimeReplyStreamRequest` 回传均在 Turn owner 内完成。
- `completed`：`request_tool_policy/aster_reply_backend_adapter.rs` 新增 `AsterReplySource`，只实现 `run_default(...)` / `run_provider(...)` 两个 Aster source call；`start_aster_reply_stream(...)` 不再本地 `match RuntimeReplyBackendRunPath`，也不直接调用 `.reply(...)` / `.stream_reply_with_agent(...)`，只调用 `run_reply_source(source, backend_run).await` 后交给 `outcome.finish_stream(...)`。
- `fixed`：`AsterReplyBackend::start_reply_stream(...)` 通过 `self.agent()` 把 `Agent` 重新借用到当前 `&self` 的调用期 lifetime，避免把结构体字段的 `'backend` 固定 lifetime 带进 `AsterReplySource` 后触发 `RuntimeReplySource` impl 不够泛化；该修复只解除 Aster source adapter 编译阻塞，不扩大 compat source backend 职责。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime::reply_backend` 持有 `RuntimeReplySource` / `run_reply_source(...)`、source runner 使用 `S: RuntimeReplySource + Send`，并要求 Aster backend adapter 只保留 `AsterReplySource` 的 `run_default` / `run_provider`；守卫禁止 `start_aster_reply_stream(...)` 恢复 provider/default path 本地分派或直接 source backend call。
- `Thread / Turn / Item`：该骨架属于 Turn provider/reply backend source execution runner。Codex 对照是 Turn backend runner 持有 run path 与 source dispatch，source adapter 只提供最小 source call；Aster compat adapter 不能继续拥有 run path 分派语义。
- `classification`：`current skeleton` 是 `agent-runtime::reply_backend::RuntimeReplySource` 与 `run_reply_source(...)`；`compat` 是 `aster_reply_backend_adapter.rs::AsterReplySource` 仍调用 Aster `Agent::reply` / `ConfiguredReplyProvider::stream_reply_with_agent(...)`；`dead / guarded` 是 Aster backend adapter 主函数本地 `RuntimeReplyBackendRunPath` 分派、`.reply(...)` / `.stream_reply_with_agent(...)` 直接调用和 fixed-lifetime source runner 实现。
- `validated`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-runtime/src/reply_backend.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_backend_adapter.rs"` 通过。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-source-runner-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 2` 通过，`13 passed`。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-backend-run-agent-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：本地 workspace target 复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 2` 通过，`13 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：`npm run smoke:agent-runtime-current-fixture` 完整通过，Electron packaged fixture 已越过 `electron:build:app-server-assets` 的 local app-server sidecar Rust 编译，覆盖 Inputbar pending steer / Plan hydrate / Skills Runtime / Multi-Agent Team / MCP / media / Expert Skills / Content Factory Article Editor，`liveProviderUsed=false`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`。
- `remaining`：这一步仍未删除 Aster source backend。Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message` lowering、Aster `AgentEvent` source、native `Tool` trait 注册壳、Aster `SessionStore` / `ThreadRuntimeStore` adapter 与 root `aster` dependency 仍是 Phase 6 blocker；下一刀继续 provider/reply loop，优先把 source backend execution body 或 provider trait object 迁出 Aster。

### 2026-07-08：Batch A/D reply backend trace snapshot owner 骨架

- `completed`：`agent-runtime::reply_backend` 新增 `RuntimeReplyBackendTrace` 与 `RuntimeReplyBackendStart::trace(...)`，承接 provider/reply backend start tracing snapshot：provider backend/name/model、Responses Lite policy、reasoning context、parallel tool calls、Responses Lite header requirement、input kind 与 message chars。
- `completed`：`request_tool_policy/aster_reply_backend_adapter.rs` 改为从 `backend_start.trace()` 读取 tracing 字段，不再直接从 `RuntimeReplyStreamRequest` 读取 provider/model/policy 字段；adapter 的 tracing 只消费 current snapshot。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime::reply_backend` 持有 `RuntimeReplyBackendTrace` / `trace(...)`，并禁止 Aster backend adapter 恢复 `stream_request.provider_backend()`、`provider_name()`、`model_name()` 或 `stream_request.model_request_policy.as_ref()` 直接读取。
- `Thread / Turn / Item`：该骨架属于 Turn provider/reply backend start observability snapshot。Codex 对照是 Turn backend runner 持有 request trace view，source adapter 只记录 current snapshot，不再把 provider request DTO 当成 adapter 内部事实源。
- `classification`：`current skeleton` 是 `agent-runtime::reply_backend::RuntimeReplyBackendTrace`；`compat` 是 `aster_reply_backend_adapter.rs` 仍执行 Aster source backend；`dead / guarded` 是 Aster backend adapter 本地 provider/model/policy trace field selection。
- `validated`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-runtime/src/reply_backend.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_backend_adapter.rs"` 通过。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-backend-trace-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 2` 通过，`11 passed`。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-backend-run-agent-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`。
- `remaining`：Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message` lowering、Aster `AgentEvent` source、native `Tool` trait 注册壳与 session/thread store adapter 仍是 root `aster` dependency blocker；本刀只把 backend start trace snapshot 收进 current Turn owner。

### 2026-07-08：Batch A/D reply backend stream outcome owner 骨架

- `completed`：`agent-runtime::reply_backend` 新增 `RuntimeReplyBackendRunOutcome` 与 `finish_stream(...)`，承接 source backend stream result -> `RuntimeReplyStartResult` 的 current materialization：成功时统一附带 `message_chars`，失败时统一映射 `Agent error: ...` 与 `emitted_any`。
- `completed`：`request_tool_policy/aster_reply_backend_adapter.rs` 不再 import / 构造 `RuntimeReplyStartError`，也不再本地 `.map(|stream| (..., message_chars))` 或拼接 `Agent error:`；adapter 只把 Aster source stream 先投影成 current `RuntimeReplyStream`，再委托 `outcome.finish_stream(...)`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime::reply_backend` 持有 `RuntimeReplyBackendRunOutcome`、`finish_stream(...)` 与 `Agent error:` source-error materialization，并禁止 Aster backend adapter 恢复 `RuntimeReplyStartError::new(format!("Agent error: ..."))` 或本地 start result tuple 组装。
- `Thread / Turn / Item`：该骨架属于 Turn backend stream start outcome materialization。Codex 对照是 source backend 只产出流或错误，Turn current owner materialize start result；Aster compat adapter 不能继续拥有 backend start outcome 文案和 emitted 状态语义。
- `classification`：`current skeleton` 是 `agent-runtime::reply_backend::RuntimeReplyBackendRunOutcome::finish_stream(...)`；`compat` 是 `aster_reply_backend_adapter.rs` 仍调用 Aster `Agent::reply` / provider backend 并做 Aster stream source projection；`dead / guarded` 是 Aster backend adapter 本地 `RuntimeReplyStartError` 构造、`Agent error:` 文案和 `(stream, message_chars)` tuple materialization。
- `validated`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-runtime/src/reply_backend.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_backend_adapter.rs"` 通过。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-backend-outcome-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 2` 通过，`10 passed`。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-backend-run-agent-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`。
- `remaining`：Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message` lowering、Aster `AgentEvent` source、native `Tool` trait 注册壳与 session/thread store adapter 仍是 root `aster` dependency blocker；本刀只把 backend stream outcome 收进 current Turn owner，不删除 Aster source backend。

### 2026-07-08：Batch A/D reply backend run path handoff 骨架

- `completed`：`agent-runtime::reply_backend` 新增 `RuntimeReplyBackendRunPath`、`RuntimeReplyBackendRun` 与 `RuntimeReplyBackendPrepareError`，并通过 `RuntimeReplyBackendStart::prepare_run(...)` 承接 backend start -> run 的 current handoff：provider wire support fail-closed、session metadata preparation、default / pinned provider path 选择和 provider stream start error 映射。
- `completed`：`request_tool_policy/aster_reply_backend_adapter.rs` 改为只读取 turn context 计算 native tool policy disallowed names，再调用 `backend_start.prepare_run(...)`；adapter 不再直接调用 `provider_wire_support_start_error(...)`、`prepare_session_metadata(...)` 或 `provider_stream_start(provider.runtime_handle())`，也不再本地决定 provider/default run path。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime::reply_backend` 持有 `RuntimeReplyBackendRunPath` / `RuntimeReplyBackendRun` / `RuntimeReplyBackendPrepareError` / `prepare_run(...)`，并禁止 Aster backend adapter 恢复 provider wire check、session metadata prepare 或 provider stream start construction 的本地调用。
- `Thread / Turn / Item`：该骨架属于 Turn provider/reply backend run handoff。Codex 对照是 Turn runner 在 current start context 内 materialize backend run path，再把 source backend stream 交给 event materialization；Aster compat adapter 只能按 current run path 调 Aster source。
- `classification`：`current skeleton` 是 `agent-runtime::reply_backend::RuntimeReplyBackendStart::prepare_run(...)` 与 `RuntimeReplyBackendRunPath`；`compat` 是 `aster_reply_backend_adapter.rs` 仍把 current run lowering 到 Aster `Agent::reply` / `ConfiguredReplyProvider::stream_reply_with_agent(...)`；`dead / guarded` 是 Aster backend adapter 本地 provider/default path selection、provider wire support check、session metadata prepare 和 provider start construction。
- `validated`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-runtime/src/reply_backend.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_backend_adapter.rs"` 通过。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-backend-run-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 2` 通过，`8 passed`。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-backend-run-agent-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`。
- `environment note`：继续使用隔离 `CARGO_HOME=/tmp/lime-cargo-home-reply-stream`，避免全局 Cargo cache 中 `memchr-2.8.0` source 缺文件问题影响判断。
- `remaining`：Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message` lowering、Aster `AgentEvent` source、native `Tool` trait 注册壳与 session/thread store adapter 仍是 root `aster` dependency blocker；本刀只把 backend run path handoff 收进 current Turn owner，不删除 Aster source backend。

### 2026-07-08：Batch A/D reply stream projection priority owner 骨架

- `completed`：`agent-runtime::reply_stream::RuntimeReplyStreamProjection` 承接 reply stream source facts 到 current stream envelope 的 materialization priority：provider stream event 优先于 inline provider error，inline provider error 优先于普通 runtime events。
- `completed`：`request_tool_policy/aster_reply_stream_adapter.rs` 不再直接构造 `RuntimeReplyStreamEvent::ProviderStreamEvent` 或 suppressed inline provider error；adapter 只收集 Aster `Message` 里的 provider side-channel payload / inline provider error text，以及 fallback `AsterEventProjector` 产出的 runtime events，再委托 `RuntimeReplyStreamProjection::{from_parts, events}.into_events()`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime::reply_stream` 持有 `RuntimeReplyStreamProjection`、`from_parts(...)` 和 `into_events(...)`，并禁止 Aster stream adapter 恢复直接构造 provider event / suppressed inline provider error 或本地排序逻辑。
- `Thread / Turn / Item`：该骨架属于 Turn reply stream materialization priority。Codex 对照是 Turn runtime owner materialize stream event，而 source adapter 只提供 source facts；Aster `AgentEvent` / `Message` 不再决定 provider side-channel、inline error 和普通 runtime event 的优先级。
- `classification`：`current skeleton` 是 `agent-runtime::reply_stream::RuntimeReplyStreamProjection`；`compat` 是 `aster_reply_stream_adapter.rs` 仍负责从 Aster `AgentEvent::Message` / `Message` 抽 source facts；`dead / guarded` 是 Aster adapter 直接构造 stream envelope variant 和本地 projection priority。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-stream-projection-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib -j 2` 通过，`13 passed`。
- `validated`：`CARGO_HOME="/tmp/lime-cargo-home-reply-stream" CARGO_TARGET_DIR="/tmp/lime-reply-stream-projection-agent-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_stream_notification_projects_safety_buffering_event --lib -j 2` 通过，`1 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`；`rustfmt --edition 2021 --check "lime-rs/crates/agent-runtime/src/reply_stream.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_stream_adapter.rs"` 通过；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过；`git diff --check -- ...` 对本刀写集通过。
- `environment note`：默认全局 Cargo cache 当前存在 `memchr-2.8.0` registry source 缺文件问题，直接用全局 `CARGO_HOME` 会失败在第三方 crate 编译；本刀 Rust 验证改用隔离 `CARGO_HOME=/tmp/lime-cargo-home-reply-stream` 并通过。
- `remaining`：Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message` lowering、Aster `AgentEvent` source、native `Tool` trait 注册壳与 session/thread store adapter 仍是 root `aster` dependency blocker；本刀只把 reply stream materialization priority 收进 current Turn owner。

### 2026-07-08：Batch A/D inline provider error parser owner 骨架

- `completed`：`agent-runtime::reply_stream::RuntimeReplyInlineProviderError::from_text(...)` 承接 inline provider error 文本解析规则，统一把 provider 失败 side-channel 文案 materialize 成 current `Agent provider execution failed...` 诊断。
- `completed`：`request_tool_policy/aster_reply_stream_adapter.rs` 删除本地 provider error 文案解析规则，只在 `inline_provider_error_from_aster_message(...)` 中从 Aster `Message` 读取 concat text，再委托 `RuntimeReplyInlineProviderError::from_text(...)`；adapter 不再持有 `"Ran into this error:"` / retry suffix / `split_once` 解析逻辑。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime::reply_stream` 持有 `RuntimeReplyInlineProviderError` 和 `from_text(...)`，并禁止 Aster stream adapter 恢复 inline provider error 文案常量、suffix 或本地 split 解析。
- `Thread / Turn / Item`：该骨架属于 Turn reply stream diagnostic materialization；Codex 对照是 source adapter 抽 source payload/text，Turn current owner 负责把它规范化为 runtime stream diagnostic。Aster source adapter 不能继续拥有诊断语义。
- `classification`：`current skeleton` 是 `agent-runtime::reply_stream::RuntimeReplyInlineProviderError::from_text(...)`；`compat` 是 `aster_reply_stream_adapter.rs` 仍从 Aster `Message` 取 concat text；`dead / guarded` 是 Aster adapter 本地 inline provider error 文案解析。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-inline-provider-error-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib -j 2` 通过，`10 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-provider-notification-target-agent" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_stream_notification_projects_safety_buffering_event --lib -j 2` 通过，`1 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`；`rustfmt --edition 2021 --check "lime-rs/crates/agent-runtime/src/reply_stream.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_stream_adapter.rs"` 通过；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过；`git diff --check -- ...` 对本刀写集通过。
- `remaining`：Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message` lowering、Aster `AgentEvent` source、native `Tool` trait 注册壳与 session/thread store adapter 仍是 root `aster` dependency blocker；本刀只把 inline provider diagnostic parser 收进 current Turn owner。

### 2026-07-08：Batch A/D provider stream notification payload owner 骨架

- `completed`：`model-provider::provider_stream::RuntimeReplyProviderStreamEvent::from_notification_payload(...)` 承接 provider stream side-channel notification payload materialization，固定 safety buffering event kind、payload `responseEvent` 读取与 header 投影规则。
- `completed`：`request_tool_policy/aster_reply_stream_adapter.rs` 只调用 Aster `provider_stream_event_notification_payload_from_message(message)` 抽取 raw notification payload，再委托 `RuntimeReplyProviderStreamEvent::from_notification_payload(...)`；adapter 不再拥有 provider event kind、header extraction 或 safety buffering projection 规则。
- `completed`：`model-provider/src/provider_stream/tests.rs` 新增 notification payload 正向投影与 unknown kind ignore 回归，证明 current owner 可独立 materialize safety buffering event；`request_tool_policy/aster_reply_adapter/tests.rs` 的 Aster message side-channel 回归改用 current `NOTIFICATION_KIND_SAFETY_BUFFERING` 常量。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `model-provider` 持有 `NOTIFICATION_KIND_SAFETY_BUFFERING`、`from_notification_payload(...)` 与 `provider_stream_event_headers(...)`，并禁止 `aster_reply_stream_adapter.rs` 恢复 `PROVIDER_STREAM_EVENT_KIND_SAFETY_BUFFERING`、`safety_buffering_from_response_event(...)` 或本地 header helper。
- `Thread / Turn / Item`：该骨架属于 Turn provider stream event materialization；Codex 对照是 provider stream side-channel 先 materialize 成 current runtime event，再进入 Turn stream projector。Aster compat source adapter 只能负责从 Aster `Message` 中抽 source payload。
- `classification`：`current skeleton` 是 `model-provider::provider_stream::RuntimeReplyProviderStreamEvent::from_notification_payload(...)`；`compat` 是 Aster `Message` -> notification payload extraction 仍留在 `aster_reply_stream_adapter.rs`；`dead / guarded` 是 Aster adapter 本地 event kind/header/safety buffering projection。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-provider-notification-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -j 2` 通过，`17 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-provider-notification-target-agent" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_stream_notification_projects_safety_buffering_event --lib -j 2` 通过，`1 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过；`rustfmt --edition 2021 --check "lime-rs/crates/model-provider/src/provider_stream.rs" "lime-rs/crates/model-provider/src/provider_stream/tests.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_stream_adapter.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter/tests.rs"` 通过；`git diff --check -- ...` 对本刀写集通过。
- `remaining`：Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message` lowering、Aster `AgentEvent` source、native `Tool` trait 注册壳与 session/thread store adapter 仍是 root `aster` dependency blocker；本刀只把 provider stream notification event 语义上提，不删除 Aster source adapter。

### 2026-07-08：Batch A/D provider stream start handoff 骨架

- `completed`：`agent-runtime::reply_backend::RuntimeReplyBackendStart::provider_stream_start(...)` 承接 pinned provider stream start handoff：复用 `model-provider::RuntimeReplyProviderStreamStart::new(...)` 的 missing / mismatched provider handle 校验，并把 `RuntimeReplyProviderStartError` 映射为 `RuntimeReplyStartError`，保留 `emitted_any` 语义。
- `completed`：`request_tool_policy/aster_reply_backend_adapter.rs` 改为调用 `backend_start.provider_stream_start(provider.runtime_handle())`，不再 import / 直接构造 `RuntimeReplyProviderStreamStart::new(...)`，也不再本地把 provider start error 映射成 `RuntimeReplyStartError`；adapter 只保留 current handoff -> Aster provider compat 调用。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `reply_backend.rs` 持有 `provider_stream_start(...)` / `RuntimeReplyProviderStreamStart::new(...)` current handoff，并禁止 Aster backend adapter 恢复 `RuntimeReplyProviderStreamStart::new`、`RuntimeReplyProviderStartError` 或 `.map_err(|error| RuntimeReplyStartError::new(error.message, emitted_any))`。
- `guarded`：同轮把 provider trace 守卫读取范围同步到 `src/lib/api/agentRuntime/appServerEventPayloadProjection.ts` current projection owner；`appServerEventStream.ts` 现在只是 re-export facade，不能再作为字段事实源。
- `Thread / Turn / Item`：该骨架属于 Turn provider/reply backend start handoff。Codex 对照是 Turn runner 先 materialize provider start contract，再把 provider stream 交给事件 materialization；Aster compat backend 不能继续拥有 provider handle mismatch 判定或 start error 映射。
- `classification`：`current skeleton` 是 `agent-runtime::reply_backend::RuntimeReplyBackendStart::provider_stream_start(...)` 与 `model-provider::RuntimeReplyProviderStreamStart`；`compat` 是 `aster_reply_backend_adapter.rs` 仍调用 `ConfiguredReplyProvider::stream_reply_with_agent(...)`；`dead / guarded` 是 Aster backend adapter 本地 provider stream start construction / error mapping。
- `validated`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-runtime/src/reply_backend.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_backend_adapter.rs"` 通过。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-provider-start-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 2` 通过，`4 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-provider-start-target-agent" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `remaining`：Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message` lowering、Aster `AgentEvent` source、native `Tool` trait 注册壳与 session/thread store adapter 仍是 root `aster` dependency blocker；本刀只收 provider start handoff，不删除 Aster backend。

### 2026-07-08：Batch A/D reply session metadata preparation handoff 骨架

- `completed`：`agent-runtime::reply_backend::RuntimeReplyBackendStart::prepare_session_metadata(...)` 承接 backend start 阶段的 session metadata preparation handoff，内部调用 `attach_reply_disallowed_tools(...)` 与 `attach_reply_provider_wire_shape(...)`，并返回 `RuntimeReplySessionPreparation` 表达 provider wire shape 是否请求 / 是否成功注入。
- `completed`：`request_tool_policy/aster_reply_backend_adapter.rs` 改为从 `backend_start.session_config()` 读取 turn context、计算 native tool policy disallowed names，再调用 `backend_start.prepare_session_metadata(...)`；adapter 不再 import `agent_runtime::reply_session::{...}`，也不再保留 `attach_native_tool_policy_scope(...)` / `attach_provider_request_wire_shape(...)` 本地函数。
- `completed`：`request_tool_policy/aster_reply_adapter/tests.rs` 的 native tool policy scope 回归改为通过 `RuntimeReplyBackendStart::prepare_session_metadata(...)` 验证，不再调用 Aster adapter 私有 attach helper。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `reply_backend.rs` 持有 `RuntimeReplySessionPreparation`、`session_config(&self)`、`prepare_session_metadata(...)` 与 current `reply_session` helper 调用；同时禁止 Aster backend adapter 恢复 `agent_runtime::reply_session::{...}` import、`attach_reply_disallowed_tools` / `attach_reply_provider_wire_shape` 直接调用、`session_config_mut`、`fn attach_provider_request_wire_shape` 或 `fn attach_native_tool_policy_scope`。
- `Thread / Turn / Item`：该骨架属于 Turn backend start/session preparation。Codex 对照是 Turn runner 在 current start context 中准备工具 scope / provider wire metadata，再交给 backend；Aster compat backend 不应拥有 metadata mutation 规则。
- `classification`：`current skeleton` 是 `agent-runtime::reply_backend::RuntimeReplyBackendStart::prepare_session_metadata(...)` 与 `agent-runtime::reply_session`；`compat` 是 `aster_reply_backend_adapter.rs` 仍负责把 prepared current session config lowering 成 Aster `SessionConfig`；`dead / guarded` 是 Aster backend adapter 本地 metadata attach helper。
- `validated`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-runtime/src/reply_backend.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_backend_adapter.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter/tests.rs"` 通过。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-session-prep-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 2` 通过，`5 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-session-prep-target-agent" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `remaining`：Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message` lowering、Aster `AgentEvent` source、native `Tool` trait 注册壳与 session/thread store adapter 仍是 root `aster` dependency blocker；本刀只把 session metadata preparation 收进 current backend start，不删除 Aster backend。

### 2026-07-08：Batch A/D reply backend start materialization 骨架

- `completed`：`agent-runtime::reply_backend::RuntimeReplyBackendStart` 承接 backend start request 的 current materialization：`RuntimeReplyStartRequest` 拆包、`RuntimeReplyMessage` / `RuntimeReplyStreamRequest` 持有、`message_chars` 读取、session config / cancel token / emitted state 交接，以及 provider wire support issue -> start error 判断。
- `completed`：`request_tool_policy/aster_reply_backend_adapter.rs` 改为消费 `RuntimeReplyBackendStart::from_start_request(...)`，不再直接解构 `RuntimeReplyStartRequest`、调用 `request.into_parts()` 或维护 `unsupported_provider_wire_shape_error(...)`；adapter 只保留 Aster `Message` lowering、session config compat lowering、provider / `Agent::reply` 调用和 Aster stream projection handoff。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `reply_backend.rs` 持有 `RuntimeReplyBackendStart` / `provider_wire_support_start_error` / `provider_request_wire_support_issue` current 判断，并禁止 Aster backend adapter 恢复 `provider_request_wire_support_issue`、`RuntimeReplyStartError::from_provider_wire_support_issue`、`unsupported_provider_wire_shape_error`、`request.into_parts()` 或 `RuntimeReplyStartRequest { request, ... }` 本地拆包。
- `Thread / Turn / Item`：该骨架属于 Turn backend start materialization。Codex 对照是 Turn backend runner 先消费已 materialized 的 start context，再进入 provider stream / event materialization；Aster compat adapter 不能继续拥有 start context shape。
- `classification`：`current skeleton` 是 `agent-runtime::reply_backend::RuntimeReplyBackendStart`；`compat` 是 `aster_reply_backend_adapter.rs` 仍把 current start 转成 Aster `Agent::reply` / provider trait 调用；`dead / guarded` 是 Aster backend adapter 本地 start request 拆包与 provider wire support error mapping。
- `validated`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-runtime/src/reply_backend.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_backend_adapter.rs"` 通过。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-backend-start-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 2` 通过，`3 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-backend-start-target-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`。
- `remaining`：Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message` lowering、Aster `AgentEvent` source、native `Tool` trait 注册壳与 session/thread store adapter 仍是 root `aster` dependency blocker；本刀只收 start materialization，不删除 Aster backend。

### 2026-07-08：Batch B Skill runtime contract owner 上提

- `completed`：新增 `tool-runtime::skill_runtime_contract` current owner，承接 Skill runtime contract metadata、modality contract registry 读取、execution profile / executor adapter 合成、policy snapshot skeleton、entry source 提取和 provided runtime contract preflight。
- `completed`：`lime-agent/src/tools/skill_tool_gate.rs` 删除本地 governance JSON include、contract spec、default runtime contract 构造、runtime contract extraction / preflight 校验和相关单测；wrapper 只调用 `tool_runtime::skill_runtime_contract::build_skill_runtime_contract_metadata(...)`，并把 不依赖 Aster preflight error 转成临时 Aster `ToolResult`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `skill_runtime_contract.rs` 持有 `SkillRuntimeContractMetadata` / `build_skill_runtime_contract_metadata(...)` 和 governance contract JSON，禁止 `skill_tool_gate.rs` 恢复本地 contract spec、policy snapshot 常量、runtime contract 构造或 preflight 校验。
- `Thread / Turn / Item`：该能力属于 Turn tool lifecycle 的多模态 runtime contract gate 和 Item tool metadata 投影；它是 Lime 多模型 / 多模态策略，不是 Aster runtime owner。
- `classification`：`current` 是 `tool-runtime::skill_runtime_contract`；`compat blocker` 是 `skill_tool_gate.rs` 内 Aster `ToolResult` preflight error 转换和 `LimeSkillTool` execution shell；`dead / guarded` 是 wrapper 本地 governance JSON include、runtime contract registry lookup、contract spec、policy snapshot 与 preflight 校验第二份实现。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过；`CARGO_TARGET_DIR="/tmp/lime-phase6-skill-gate-target" CARGO_BUILD_JOBS=2 cargo test --locked --offline --manifest-path "lime-rs/Cargo.toml" -p tool-runtime skill_runtime_contract --lib` 通过，`3 passed`；`CARGO_TARGET_DIR="/tmp/lime-phase6-skill-gate-target" CARGO_BUILD_JOBS=2 cargo test --locked --offline --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_tool --lib` 通过，`7 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`；Prettier 覆盖守卫和迁移文档通过。
- `remaining`：Aster reply loop / `SkillTool` execution shell 仍未迁出；下一刀继续迁 Turn tool execution 壳或避让 provider/reply 并行热区。

### 2026-07-08：Batch B Skill gate owner 上提

- `completed`：新增 `tool-runtime::skill_gate` current owner，承接 Skill 工具按 session 启用、allowed skills、allowed capabilities、workspace skill source metadata、disabled/not-allowed message 与 image generation contract gate。
- `completed`：`lime-agent/src/tools/skill_tool_gate.rs` 删除本地 session store / allowlist / source gate 实现，只在 wrapper 内部消费 `tool_runtime::skill_gate`；`lime-agent/src/tools/mod.rs` 只公开 `LimeSkillTool`，不再通过 `lime-agent::tools` re-export Skill gate API。
- `completed`：`app-server/src/runtime_backend/skill_runtime_enable.rs` 直接调用 `tool_runtime::skill_gate::{...}`，不再通过 `lime_agent::tools` 读写 session gate。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 Skill gate 归属 `tool-runtime`，禁止 wrapper 恢复本地 session access store、allowlist/source gate、`lime-agent::tools` 公共 re-export gate API，或 App Server 重新从 `lime_agent::tools` 引用 gate API。
- `Thread / Turn / Item`：Skill gate 属于 Turn tool lifecycle 的会话门禁和 Item tool source metadata 投影前置条件；Skills registry / skill body 仍归统一 Agent Skills registry。该条记录当时剩余的 Aster `SkillTool` execution shell 已被后续 `Skill prompt/workflow runner current backend` 删除。
- `classification`：`current` 是 `tool-runtime::skill_gate`；当前 `compat blocker` 是 `lime-agent/src/tools/skill_tool_gate.rs` 内的 Aster `Tool` trait 外壳、Aster provider bridge 与 final `ToolResult` 转换；`dead / guarded` 是 `lime-agent` wrapper 本地 session store、allowlist/source metadata gate、Aster `SkillTool` execution backend、`lime-agent::tools` 公共 re-export gate API，以及 App Server 通过 `lime_agent::tools` 读写 gate。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent --package app-server -- --check` 通过；`CARGO_TARGET_DIR="/tmp/lime-phase6-skill-gate-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime skill_gate --lib` 通过，`2 passed`；最新 `CARGO_TARGET_DIR="/tmp/lime-phase6-skill-gate-target" CARGO_BUILD_JOBS=2 cargo test --locked --offline --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_tool --lib` 通过，`7 passed`；`CARGO_TARGET_DIR="/tmp/lime-phase6-skill-gate-target" CARGO_BUILD_JOBS=2 cargo test --locked --offline --manifest-path "lime-rs/Cargo.toml" -p app-server skill_runtime_enable --lib` 通过，`11 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`；Prettier 与 scoped `git diff --check` 通过。
- `remaining`：Aster reply loop 仍通过 Aster `ToolRegistry` / `Tool` trait 触发 `SkillTool`；下一刀仍应回到 provider/reply loop 或 Turn executor 入口，删除整个 Aster `Tool` 注册壳后才能移除 `LimeSkillTool`。

### 2026-07-08：Batch B Skill tool surface owner 上提

- `completed`：`tool-runtime::skill_gate` 新增 `SKILL_TOOL_NAME`、`SKILL_TOOL_DESCRIPTION` 与 `skill_tool_input_schema()`，承接 `Skill` 工具的模型可见 name / description / input schema surface；schema 保持当前 Aster compat contract：`skill` 必填，`args` 为可选字符串。
- `completed`：`lime-agent/src/tools/skill_tool_gate.rs` 的 `LimeSkillTool::name()` / `description()` / `input_schema()` 改为消费 `tool_runtime::skill_gate` current surface，不再通过 Aster `SkillTool::name()` / `input_schema()` 暴露模型可见 spec。该条记录当时仍保留的 `inner: SkillTool` execution shell 已被 2026-07-09 `Skill prompt/workflow runner current backend` 后续刀删除。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 current owner 暴露 Skill surface API，要求 wrapper import `SKILL_TOOL_NAME` / `SKILL_TOOL_DESCRIPTION` / `skill_tool_input_schema`，并禁止恢复 `self.inner.name()` / `self.inner.input_schema()`。
- `Thread / Turn / Item`：该能力归属 Turn tool lifecycle 的 tool surface materialization；Item tool metadata 仍由执行结果 metadata 投影。Codex 对照是工具 provider/extension owner 生成 tool name / spec / schema，临时 execution wrapper 不能作为 surface owner。
- `classification`：`current` 是 `tool-runtime::skill_gate` 的 Skill surface owner；当前 `compat blocker` 是 `LimeSkillTool` Aster `Tool` trait 外壳 / provider bridge / final `ToolResult` 转换；`dead / guarded` 是 Aster wrapper 重新代理 `SkillTool::name()` / `input_schema()` 作为模型可见 surface 或恢复 Aster `SkillTool` execution backend。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过；`CARGO_TARGET_DIR="/tmp/lime-phase6-skill-gate-target" CARGO_BUILD_JOBS=2 cargo test --locked --offline --manifest-path "lime-rs/Cargo.toml" -p tool-runtime skill_gate --lib` 通过，`3 passed`；`CARGO_TARGET_DIR="/tmp/lime-phase6-skill-gate-target" CARGO_BUILD_JOBS=2 cargo test --locked --offline --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_tool --lib` 通过，`7 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`。
- `remaining`：Aster reply loop 仍通过 `Tool` trait 执行 Skill；本刀只收 surface，不删除 root `aster` dependency。`SkillTool` execution shell 已由后续刀删除，下一刀应继续回到 provider/reply loop 或 Turn tool executor，拆掉 Aster `Tool` trait 外壳。

### 2026-07-08：Batch B Skill input normalization owner 上提

- `completed`：`tool-runtime::skill_gate` 新增 `normalize_skill_invocation_params(...)`，承接 `Skill` 调用参数规范化：当 `args` 是 object / array 时转为字符串，保持 `Skill` input schema 与当前执行壳的字符串参数 contract 一致。
- `completed`：`lime-agent/src/tools/skill_tool_gate.rs` 删除本地 `normalize_skill_tool_params(...)`，执行前只调用 `tool_runtime::skill_gate::normalize_skill_invocation_params(...)`；wrapper 测试当时验证 current normalization 被用于临时 Aster `SkillTool` execution shell，该 shell 已由后续 `Skill prompt/workflow runner current backend` 删除。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 current owner 暴露 `normalize_skill_invocation_params`，要求 wrapper 消费该函数，并禁止 wrapper 恢复本地 normalize 函数或 `serde_json::to_string(&args)` 规则。
- `Thread / Turn / Item`：该能力归属 Turn tool lifecycle 的 invocation input materialization；它是 `Skill` 工具 current 输入契约，不属于 Aster execution shell。
- `classification`：`current` 是 `tool-runtime::skill_gate` 的 Skill invocation normalization owner；当前 `compat blocker` 是 `LimeSkillTool` Aster `Tool` trait 外壳 / provider bridge / final `ToolResult` 转换；`dead / guarded` 是 wrapper 本地参数规范化规则或恢复 Aster `SkillTool` execution backend。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过；`CARGO_HOME="/tmp/lime-cargo-home-phase6-skill" CARGO_TARGET_DIR="/tmp/lime-phase6-skill-normalization-target" CARGO_BUILD_JOBS=2 cargo test --locked --manifest-path "lime-rs/Cargo.toml" -p tool-runtime skill_gate --lib` 通过，`4 passed`；同一临时 Cargo 环境下 `cargo test --locked --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_tool --lib` 通过，`7 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`。
- `note`：默认全局 Cargo registry 的 `memchr-2.8.0` 缓存缺 `arch` / `memmem` 源文件，`--offline` 首次复跑也缺 `async-stream`；本刀未删除全局缓存，改用临时 `CARGO_HOME` 完成验证。
- `remaining`：Aster reply loop 仍通过 `Tool` trait 执行 Skill；本刀只收 input materialization，不删除 root `aster` dependency。`SkillTool` execution shell 已由后续刀删除，下一刀继续拆 Aster `Tool` trait 外壳或回到 provider/reply loop blocker。

### 2026-07-08：Batch B gateway native tool compat adapter 集中

- `completed`：`native_tools/runtime_tool_bridge.rs` 新增 `RuntimeDefinitionToolAdapter`，承接 gateway-backed runtime tool 在 Aster reply loop 内仍需的临时 `Tool` trait 实现：definition surface、options、cancel check、`RuntimeToolExecutor` 调用和 runtime result/error 转换都集中在 bridge。
- `completed`：`memory_store.rs` 删除本地 `MemoryStoreTool` struct / `impl Tool` 样板，只保留 `create_memory_tools(...)`、gateway-aware `NativeDispatch` builder 和 `check_memory_store_permissions(...)`；`memory_list` / `memory_read` / `memory_search` / `memory_add_note` 均通过 definition-backed adapter 执行 current executor。
- `completed`：`image_tasks.rs` 删除本地 `ImageTaskTool` struct / `impl Tool` 样板，只保留 `create_image_tools(...)`、gateway-aware `NativeDispatch` builder、`check_image_task_permissions(...)` 和 Aster action scope -> current turn metadata 的兼容投影；执行仍通过 `tool-runtime::image_task` current executor。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `RuntimeDefinitionToolAdapter` 只能集中在 bridge，要求 memory/image wrapper 创建该 adapter，并禁止恢复本地 `MemoryStoreTool` / `ImageTaskTool` 或 `impl Tool for` 样板。
- `Thread / Turn / Item`：该骨架属于 Turn tool lifecycle / Item tool output projection 的 gateway-backed compat 壳集中；memory 数据本体仍归 Thread / App Server memory store，image artifact 本体仍归 App Server media task / GUI read model。
- `classification`：`current` 是 `tool-runtime::memory_store`、`tool-runtime::image_task`、gateway-aware `NativeDispatch`；`compat blocker` 是 `RuntimeDefinitionToolAdapter` 和 per-tool permission / turn-context provider；`dead / guarded` 是 memory/image wrapper 重新本地实现 Aster `Tool` trait 或 gateway DTO / projection 第二份实现。
- `validated`：`rustfmt --edition 2021 --check` 覆盖本批 Rust 写集通过；`CARGO_TARGET_DIR="/tmp/lime-phase6-tool-adapter-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent memory_store --lib` 通过，`2 passed`；`... -p lime-agent image_tasks --lib` 通过，`2 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`122 passed`；Prettier 与 scoped `git diff --check` 通过。
- `remaining`：Aster reply loop 仍通过 Aster `ToolRegistry` / `Tool` trait 触发已迁 native tools；下一刀仍应优先在 provider/reply loop 或 Turn executor 入口稳定后删除整个 Aster `Tool` 注册壳。

### 2026-07-07：Batch B stateless native tool compat adapter 集中

- `completed`：`native_tools/runtime_tool_bridge.rs` 新增 `RuntimeNativeToolAdapter`，集中承接已迁 `tool-runtime` native tool 在 Aster reply loop 内仍需的临时 `Tool` trait 实现：name、description、schema、aliases、options、cancel check、`RuntimeToolExecutor` 调用和 runtime result/error 转换都只在该 bridge 中维护。
- `completed`：`sleep`、`view_image`、`update_plan`、`WebFetch`、`WebSearch`、`apply_patch`、`skill_search` 的 Lime 侧 wrapper 已压成 factory + permission function；需要 Turn metadata 的 `update_plan`、`WebFetch`、`WebSearch`、`skill_search` 通过 `with_turn_context_provider(current_agent_turn_context)` 接线。wrapper production path 不再本地 `impl Tool`、不再直接读取 `runtime_native_tool_surface_ref(...)` / options，也不再直接调用 `runtime_native_dispatch_handle()`。
- `completed`：`native_tools/runtime_overlay.rs` 改为注册 `create_apply_patch_tool()` / `create_skill_search_tool()`，`ApplyPatchTool` / `SkillSearchTool` 旧 struct 实例化面已删除；`tools/mod.rs` 只保留 crate 内 factory re-export 和必要常量。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 stateless wrapper 只能创建统一 `RuntimeNativeToolAdapter`，禁止恢复本地 `impl Tool`、`runtime_native_tool_surface_ref`、`runtime_native_tool_options`、各自 `*_tool_definition()` / legacy alias 常量；同时把 provider/reply backend 守卫更新为 current `RuntimeReplyBackend<RuntimeAgentEvent>` contract，不再要求并行写集已删除的未使用 import。
- `Thread / Turn / Item`：该骨架属于 Turn tool lifecycle / Item tool output projection 的 compat 壳集中；真实 tool definition、registration plan、surface、executor、metadata 仍归 `tool-runtime` current owner，Aster 只剩 reply loop 未迁出前的 trait adapter。
- `classification`：`current` 是 `tool-runtime::native_overlay` / `native_dispatch` / 各 native executor；`compat blocker` 是 `RuntimeNativeToolAdapter` 和少量 per-tool permission function；`dead / guarded` 是 stateless wrapper 重新本地实现 Aster `Tool` trait、重新持有模型可见 surface 或旧 `ApplyPatchTool` / `SkillSearchTool` struct 注册面。
- `validated`：`rustfmt --edition 2021 --check` 覆盖本批 Rust 写集通过；`CARGO_TARGET_DIR="/tmp/lime-phase6-tool-adapter-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_search_tool --lib` 通过，`1 passed`；`... -p lime-agent native_tools --lib` 通过，`23 passed`；`... -p lime-agent apply_patch_tool --lib` 通过，`3 passed`，仅出现并行 provider/reply 文件 `aster_reply_backend_adapter.rs` 的 unused import warning，本轮未改该热区；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`122 passed`。
- `remaining`：Aster reply loop 仍通过 Aster `ToolRegistry` / `Tool` trait 触发已迁 native tools；下一刀应继续推进 provider/reply loop 或把 native tool call 执行入口接到 current Turn executor，届时删除 `RuntimeNativeToolAdapter`、per-tool factory 和 `runtime_tool_bridge.rs`。

### 2026-07-07：Batch A/D reply backend start error boundary 骨架

- `completed`：`request_tool_policy/aster_reply_backend_adapter.rs` 不再 import / 构造 policy 层 `ReplyAttemptError`；`start_aster_reply_stream(...)` 直接返回 `agent-runtime::reply_host::RuntimeReplyStartResult`，provider start 校验、unsupported wire shape 和 Aster backend error 均收口为 `RuntimeReplyStartError`。
- `completed`：`agent-runtime::reply_host::RuntimeReplyStartError::from_provider_wire_support_issue(...)` 承接 provider wire support issue -> backend start error 的 current 映射；Aster backend adapter 只保留 issue 诊断日志，并调用 current helper，不再直接读取 `issue.message()` 拼 start error。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 Aster backend adapter 使用 `RuntimeReplyStartError` / `RuntimeReplyStartResult`，并禁止该 adapter 重新包含 `ReplyAttemptError`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `reply_host.rs` 持有 `from_provider_wire_support_issue`，要求 Aster backend adapter 调用该 helper，并禁止 adapter 恢复 `issue.message()` 本地错误映射。
- `Thread / Turn / Item`：该骨架属于 Turn backend start outcome boundary。Codex 对照是 backend start/run 边界输出 runtime-level error，再由 Turn policy 层转换为 attempt error；Aster compat backend 不应直接认识 request policy 的 attempt DTO。
- `classification`：`current skeleton` 是 `agent-runtime::reply_host::RuntimeReplyStartError` / `RuntimeReplyStartResult`；`compat` 是 `aster_reply_backend_adapter.rs` 的 current start request -> Aster `Agent::reply` / provider trait 调用；`dead / guarded` 是 Aster backend adapter 重新依赖 `ReplyAttemptError`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-backend-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 2` 通过，`1 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-backend-boundary-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_host --lib -j 2` 通过，`3 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-backend-boundary-target-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent aster_reply_backend_adapter --lib -j 2` 编译通过，但过滤器没有匹配测试，结果为 `0 passed / 546 filtered out`；因此同 target 续跑 `request_tool_policy` 作为实际 policy 覆盖。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-backend-boundary-target-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`122 passed`。
- `validated`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-runtime/src/reply_host.rs" "lime-rs/crates/agent/src/request_tool_policy/aster_reply_backend_adapter.rs"`、`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 与 scoped `git diff --check` 通过。
- `remaining`：Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message` lowering、Aster `AgentEvent` source、native `Tool` trait 注册壳与 session/thread store adapter 仍是 root `aster` dependency blocker；本刀只收 backend start error contract，不删除 Aster backend。

### 2026-07-07：Batch A/D reply start error current owner 骨架

- `completed`：`agent-runtime::reply_execution` 新增 `impl From<RuntimeReplyStartError> for RuntimeReplyAttemptError`，承接 backend start error -> attempt error 的 current outcome handoff。
- `completed`：`agent_reply_stream.rs` 删除本地 `reply_attempt_error_from_runtime(...)` 字段复制函数，改为 `map_err(ReplyAttemptError::from)` 消费 current conversion。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime/src/reply_execution.rs` 持有 start error conversion，并禁止 `agent_reply_stream.rs` 恢复本地 `reply_attempt_error_from_runtime(...)`。
- `Thread / Turn / Item`：该骨架属于 Turn provider/reply backend start outcome materialization；Codex 对照是 Turn runtime 统一错误类型转换，而不是在 compat stream adapter 私有复制字段。
- `classification`：`current skeleton` 是 `agent-runtime::reply_execution` 中的 `RuntimeReplyStartError -> RuntimeReplyAttemptError` conversion；`compat` 仍是 Aster backend adapter 产生 `RuntimeReplyStartError`；`dead / guarded` 是 `agent_reply_stream.rs` 本地 start error mapper 回流。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-start-error-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_execution --lib -j 2` 通过，`5 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-stream-state-target-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`；同轮把 `provider_stream_idle` 首事件前 fail-closed fixture 的外层 timeout 改为跟随 `MIN_PROVIDER_STREAM_FIRST_EVENT_TIMEOUT`，避免测试继续用过期 `3s` 上限误判 current first-event guard。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`122 passed`。
- `remaining`：本刀不扩大到 backend start guard 或 Aster backend 删除；root `aster` dependency 仍由 provider/reply loop、Aster `Message` / `AgentEvent`、native `Tool` trait 注册壳和 session/thread store adapter 阻塞。

### 2026-07-07：Batch A/D reply stream idle error current owner 骨架

- `completed`：`agent-runtime::reply_stream` 新增 `RuntimeReplyStreamIdleTimeout`，承接 provider stream idle timeout 的 current error message contract。
- `completed`：`agent_reply_stream.rs` 的 idle timeout 分支改为使用 `RuntimeReplyStreamIdleTimeout::new(timeout).message()` 生成错误；本地 `stream_idle.rs::provider_stream_idle_timeout_message(...)` 已删除，`stream_idle.rs` 只保留 env timeout 解析。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime/src/reply_stream.rs` 持有 `RuntimeReplyStreamIdleTimeout` / `message()`，要求 `agent_reply_stream.rs` 消费该 current owner，并禁止 `stream_idle.rs` 恢复 `provider_stream_idle_timeout_message(...)` 或本地 idle error 文案。
- `Thread / Turn / Item`：该骨架属于 Turn provider/reply stream lifecycle error contract；Codex 对照是 response stream disconnect / idle 类错误归属 Turn runtime，而不是 compat adapter 本地字符串。
- `classification`：`current skeleton` 是 `agent-runtime::reply_stream::RuntimeReplyStreamIdleTimeout`；`compat` 仍是 `agent_reply_stream.rs` 负责 flush text batcher、更新 diagnostics 并把 current idle error 映射成 retry policy error；`dead / guarded` 是 `stream_idle.rs` 本地 idle error message helper 回流。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-idle-contract-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib -j 2` 通过，`7 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-stream-state-target-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "request_tool_policy 主文件不得重新承接 Aster reply stream loop" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed / 121 skipped`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`122 passed`。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime -- --check`、`rustfmt --edition 2021 --check "lime-rs/crates/agent/src/request_tool_policy/agent_reply_stream.rs" "lime-rs/crates/agent/src/request_tool_policy/stream_idle.rs"` 与 `npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `validated`：`git diff --check -- "lime-rs/crates/agent-runtime/src/reply_stream.rs" "lime-rs/crates/agent/src/request_tool_policy/agent_reply_stream.rs" "lime-rs/crates/agent/src/request_tool_policy/stream_idle.rs" "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。本刀不扩大到 retry 策略细节迁移或 backend start guard。

### 2026-07-07：Batch A/D reply attempt outcome current owner 骨架

- `completed`：`agent-runtime::reply_execution::RuntimeReplyAttemptState` 新增 `error(...)`，承接 attempt emitted state -> `RuntimeReplyAttemptError` 的 current 产出规则。
- `completed`：`request_tool_policy.rs` 删除本地 `build_stream_reply_execution(...)` 薄包装，成功收口直接调用 `attempt_state.into_execution(...)` / `into_execution_with_text(...)`；web search requirement、empty final error 与 inline provider error 等失败收口直接调用 `attempt_state.error(...)`。
- `completed`：`agent_reply_stream.rs` 的 stream error / suppressed inline provider error 分支改为通过 `attempt_state.error(...)` 生成 current attempt error，不再本地重复拼 `emitted_any`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求主循环和 stream adapter 消费 `attempt_state.error(...)`，要求 `agent-runtime/src/reply_execution.rs` 持有 `fn error`，并禁止 `request_tool_policy.rs` 恢复 `fn build_stream_reply_execution`。
- `Thread / Turn / Item`：该骨架属于 Turn reply attempt outcome state；Codex 对照是 turn state 持有执行状态并统一 materialize outcome，而不是在 compat policy 主文件里散落构造成功 / 失败 DTO。
- `classification`：`current skeleton` 是 `agent-runtime::reply_execution::RuntimeReplyAttemptState` 的 execution/error outcome helper；`compat` 仍是 `request_tool_policy.rs` 的 WebSearch retry / artifact fallback 细节和 Aster backend source；`dead / guarded` 是本地 execution 包装与手写 emitted_any error DTO 回流。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-outcome-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_execution --lib -j 2` 通过，`4 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-stream-state-target-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "request_tool_policy 主文件不得重新承接 Aster reply stream loop" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed / 120 skipped`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`122 passed`。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime -- --check`、`rustfmt --edition 2021 --check "lime-rs/crates/agent/src/request_tool_policy.rs" "lime-rs/crates/agent/src/request_tool_policy/agent_reply_stream.rs"` 与 `npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。本轮不扩大到 retry 策略细节迁移或 root `aster` dependency 删除。
- `validated`：`git diff --check -- "lime-rs/crates/agent-runtime/src/reply_execution.rs" "lime-rs/crates/agent-runtime/src/reply_stream.rs" "lime-rs/crates/agent/src/request_tool_policy.rs" "lime-rs/crates/agent/src/request_tool_policy/agent_reply_stream.rs" "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。

### 2026-07-07：Batch A/D reply stream state current owner 骨架

- `completed`：`agent-runtime::reply_stream` 新增 `RuntimeReplyStreamState` 与 `MIN_PROVIDER_STREAM_FIRST_EVENT_TIMEOUT`，承接 provider stream 首事件 timeout、stream event seen 与 suppressed inline provider error 的 Turn stream lifecycle 状态。
- `completed`：`agent_reply_stream.rs` 改为创建并消费 `RuntimeReplyStreamState`，通过 `stream_state.next_timeout(...)`、`mark_stream_event_seen(...)`、`capture_inline_provider_error(...)` 与 `take_inline_provider_error(...)` 驱动 stream poll；本地 `provider_stream_next_timeout(...)`、first-event timeout 常量和 `inline_provider_error` holder 已删除。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime/src/reply_stream.rs` 定义 `RuntimeReplyStreamState` / first-event timeout owner，要求 `agent_reply_stream.rs` 消费该 current owner，并禁止在 `agent_reply_stream.rs` 恢复本地 timeout helper 或 inline provider error 状态。
- `Thread / Turn / Item`：该骨架属于 Turn provider/reply stream lifecycle。Codex 对照是 turn runtime 持有 response stream state / event observation，而不是让 Aster `AgentEvent` adapter 或 `lime-agent` 主循环私有维护。
- `classification`：`current skeleton` 是 `agent-runtime::reply_stream::RuntimeReplyStreamState`；`compat` 是 `aster_reply_stream_adapter.rs` 仍把 Aster `AgentEvent` source 投影成 current `RuntimeReplyStreamEvent`；`dead / guarded` 是本地 provider stream timeout helper 和 inline provider error holder 回流。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check` 通过。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-stream-state-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib -j 2` 通过，`6 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "request_tool_policy 主文件不得重新承接 Aster reply stream loop|provider reply stream handle contract" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`2 passed / 119 skipped`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`121 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-stream-state-target-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `validated`：`git diff --check -- "lime-rs/crates/agent-runtime/src/reply_stream.rs" "lime-rs/crates/agent/src/request_tool_policy/agent_reply_stream.rs" "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "lime-rs/crates/agent-runtime/src/reply_execution.rs" "lime-rs/crates/agent/src/request_tool_policy.rs"` 通过。
- `remaining`：这一步仍没有迁出 Aster `Agent::reply` / provider trait / Aster `AgentEvent` source / native `Tool` trait 注册壳；root `aster` dependency 与 `lime-agent` 的 `aster.workspace = true` 仍不能删除。

### 2026-07-07：Batch A/D reply attempt state current owner 骨架

- `completed`：新增 `agent-runtime::reply_execution::RuntimeReplyAttemptState`，承接 Turn reply attempt 的 `text_output`、`event_errors` 与 `emitted_any` 累计状态，并提供 `push_text(...)`、`push_error(...)`、`last_error(...)`、`into_execution_with_text(...)` 等 current helper。
- `completed`：`request_tool_policy.rs` 的 stream policy 主编排改为只创建 `RuntimeReplyAttemptState::new()`，并把可变 state 传入 `agent_reply_stream.rs`；成功 / fallback / cancel / empty final error 均从 current state 生成 `RuntimeReplyExecution` 或 `RuntimeReplyAttemptError`，不再维护本地 `emitted_any` / `text_chunks` / `event_errors` 三散变量。
- `completed`：`agent_reply_stream.rs` 的 reply stream 消费逻辑改为通过 `RuntimeReplyAttemptState` 记录文本、错误与 emission 状态；provider idle timeout 仍在已创建 stream 后执行，Aster compat `start_reply_stream(...)` 不再套 provider idle timeout，避免把 Aster context prep 误判成 provider stream idle。current backend 迁出 Aster 后，再补更精确的 backend start guard。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime/src/reply_execution.rs` 定义 `RuntimeReplyAttemptState`，要求 `request_tool_policy.rs` 和 `agent_reply_stream.rs` 消费该 current owner，并禁止主策略文件恢复本地 `let mut emitted_any = false`、`text_chunks: Vec` 或 `event_errors: Vec`。
- `Thread / Turn / Item`：该骨架属于 Turn reply attempt execution state；Codex 对照是 Turn runtime 持有 attempt accumulation / retry state，而不是让 Aster `Agent::reply` 或 `lime-agent` 主策略文件继续隐式拥有。
- `classification`：`current skeleton` 是 `agent-runtime::reply_execution::RuntimeReplyAttemptState`；`compat` 是 `agent_reply_stream.rs` 仍消费 Aster compat backend 投影出的 current stream；`dead / guarded` 是 reply policy 主文件里的本地三散状态变量和把 provider idle timeout 套在 Aster compat start/context prep 阶段。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check` 通过。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-attempt-state-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_execution --lib -j 2` 通过，`3 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "request_tool_policy 主文件不得重新承接 Aster reply stream loop|provider reply stream handle contract" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`2 passed / 119 skipped`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `validated`：`git diff --check -- <本批 reply attempt state 写集>` 通过。
- `remaining`：这一步仍没有迁出 Aster `Agent::reply` / provider trait / Aster `AgentEvent` source / native `Tool` trait 注册壳；root `aster` dependency 与 `lime-agent` 的 `aster.workspace = true` 仍不能删除。下一刀继续先完成 provider/reply backend current skeleton，再回头细化 idle / retry / provider start 语义。

### 2026-07-07：Batch A/D reply backend current contract 骨架

- `completed`：新增 `agent-runtime::reply_backend::RuntimeReplyBackend` current contract，把 `uses_pinned_provider`、`provider_handle` 与 `start_reply_stream(...)` 从 host facade 形状中拆出，固定 Turn reply backend 的 不依赖 Aster 执行接口。
- `completed`：`agent_reply_stream.rs` current 主循环改为通过 `host.reply_backend()` 获取 backend，再基于 current `RuntimeReplyStartRequest` 启动 stream；调用侧不再把 `RuntimeReplyPolicyHost` 自身当作 backend contract。
- `completed`：`request_tool_policy/aster_reply_backend_adapter.rs` 新增 `AsterReplyBackend`，实现 `RuntimeReplyBackend<RuntimeAgentEvent>` 并继续集中承接 current start request -> Aster `Agent::reply` / provider stream 的 compat execution body；`AsterReplyRuntimeHost` 退化为 status / cancelled marker host facade，组合 backend 而不是代表 backend。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime` 暴露 `reply_backend`，要求 `agent_reply_stream.rs` 通过 `reply_backend.start_reply_stream(...)` 启动 stream，要求 Aster backend adapter 实现 `RuntimeReplyBackend`，并禁止调用侧恢复 `host.start_reply_stream(...)` 旧形状。
- `Thread / Turn / Item`：该骨架属于 Turn provider/reply backend contract。Codex 对照是 Turn runtime 持有 backend runner 抽象，host/status/persistence side effect 不是 provider backend 本身；Lime 当前 backend 仍由 Aster compat adapter 执行。
- `classification`：`current skeleton` 是 `agent-runtime::reply_backend::RuntimeReplyBackend` 与 `RuntimeReplyStreamHost::reply_backend()`；`compat` 是 `AsterReplyBackend` 的 current backend -> Aster `Agent::reply` adapter；`dead / guarded` 是把 backend start contract 继续绑在 `AsterReplyRuntimeHost` 或调用侧直接 `host.start_reply_stream(...)`。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check` 通过。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-backend-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 2` 通过，`1 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "request_tool_policy 主文件不得重新承接 Aster reply stream loop|provider reply stream handle contract" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`2 passed / 119 skipped`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过；scoped `git diff --check` 通过。
- `pending`：`lime-agent` 冷 target 定向测试在三方依赖编译阶段按“先完成骨架、细节后补”中止；当前另有并行 Cargo 进程在跑，不把本轮时间继续耗在全量/冷编译上。
- `remaining`：这一步仍没有迁出 Aster `Agent::reply` / provider trait / Aster `AgentEvent` source / native `Tool` trait 注册壳；root `aster` dependency 与 `lime-agent` 的 `aster.workspace = true` 仍不能删除。

### 2026-07-07：Batch A/D reply backend start adapter handoff 骨架

- `completed`：新增 `request_tool_policy/aster_reply_backend_adapter.rs`，把 `RuntimeReplyStartRequest` 拆解、current message lowering 调用、provider wire support fail-closed、reply session metadata preparation、`to_aster_session_config(...)`、Aster `Agent::reply` / `ConfiguredReplyProvider::stream_reply_with_agent(...)` 调用和 stream projection handoff 集中到单一 backend compat adapter。
- `completed`：`aster_reply_adapter.rs` 进一步退化为 `AsterReplyRuntimeHost` / runtime status / action confirmation / cancel marker persistence facade，不再直接持有 `.reply(...)`、`.stream_reply_with_agent(...)`、`RuntimeReplyProviderStreamStart::new(...)`、provider wire support 或 reply session metadata preparation 细节。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `request_tool_policy.rs` 声明 `aster_reply_backend_adapter`，要求 backend adapter 持有 Aster backend start execution body；同时禁止 `aster_reply_adapter.rs` 恢复 provider/reply backend execution、message lowering、stream projection 和 provider wire/session metadata 拼装细节。
- `Thread / Turn / Item`：该骨架属于 Turn provider/reply execution backend handoff。Codex 对照是 `ModelClientSession::stream(...)` 这类 turn-scoped backend stream 调用由 Turn runtime 持有；Lime 当前仍通过 Aster backend 执行，但 execution body 已集中到可删除 compat adapter。
- `classification`：`current skeleton` 仍是 `agent-runtime::reply_host::RuntimeReplyStartRequest`、`agent-runtime::reply_session`、`model-provider::provider_stream` 与 `agent-runtime::reply_stream`；`compat` 是 `aster_reply_backend_adapter.rs` 的 current start request -> Aster backend stream adapter；`dead / guarded` 是把 Aster provider/reply backend execution 重新塞回 `aster_reply_adapter.rs` 的旧中心化实现。
- `remaining`：这一步仍没有迁出 Aster `Agent::reply` / provider trait / Aster `AgentEvent` source / native `Tool` trait 注册壳；root `aster` dependency 与 `lime-agent` 的 `aster.workspace = true` 仍不能删除。

### 2026-07-07：Batch A/D reply message lowering adapter handoff 骨架

- `completed`：新增 `request_tool_policy/aster_reply_message_adapter.rs`，把 `RuntimeReplyMessage` -> Aster `Message` lowering、action-required response scope 映射和取消 turn context marker 的 Aster `Message` 构造集中到单一 compat source adapter。
- `completed`：`aster_reply_adapter.rs` 只调用 `lower_aster_reply_message(...)` / `cancelled_turn_context_marker_message(...)`，不再直接 import `agent-runtime::reply_message` 或维护 `MessageContent::ActionRequired` / `ActionRequiredData::ElicitationResponse` / `Message::user()` 等 DTO lowering 细节。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `request_tool_policy.rs` 声明 `aster_reply_message_adapter`，要求 message adapter 持有 `RuntimeReplyMessage` lowering 与取消标记构造；同时禁止 `aster_reply_adapter.rs` 恢复 Aster `Message` 内容分支、action response lowering 和 marker message construction。
- `Thread / Turn / Item`：该骨架属于 Turn reply message materialization 的 compat lowering 边界。Codex 对照为 protocol `ResponseItem::Message` / `ContentItem` 与 turn input queue，不把外部 agent framework `Message` 当 current 事实源；Lime current 继续是 `agent-runtime::reply_message`。
- `classification`：`current skeleton` 是 `agent-runtime::reply_message`；`compat` 是 `aster_reply_message_adapter.rs` 的 Aster `Message` lowering；`dead / guarded` 是把 Aster `MessageContent` / action scope lowering 重新塞回 `aster_reply_adapter.rs` 的旧中心化实现。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package agent-runtime -- --check` 通过。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-message-adapter-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent aster_reply_message_adapter --lib -j 2` 通过，`3 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-message-adapter-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent aster_reply_adapter --lib -j 2` 通过，`2 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "request_tool_policy 主文件不得重新承接 Aster reply stream loop" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed / 120 skipped`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过；scoped `git diff --check` 通过。
- `blocked`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 未完成，失败原因为本机磁盘空间不足（`No space left on device`，`df -h` 显示 Data volume 最低仅剩约 `460MiB`），不是本轮代码类型错误；释放构建缓存或磁盘空间后需补跑。
- `remaining`：这一步仍没有迁出 Aster `Agent::reply` / provider trait / Aster `AgentEvent` source / native `Tool` trait 注册壳；root `aster` dependency 与 `lime-agent` 的 `aster.workspace = true` 仍不能删除。

### 2026-07-07：Batch A/D reply stream projector handoff 骨架

- `completed`：`agent-runtime::reply_stream` 新增 `RuntimeReplyStreamProjector<SourceEvent, RuntimeEvent>` current contract，把 source event -> `RuntimeReplyStreamEvent` envelope materialization 的形状固定在 Turn reply stream owner 下，而不是让 Aster adapter 自己定义投影循环。
- `completed`：新增 `request_tool_policy/aster_reply_stream_adapter.rs`，集中承接 Aster `AgentEvent` source stream 的 provider side-channel、inline provider error suppression 和 `AsterEventProjector` 调用；`aster_reply_adapter.rs` 只保留 Aster backend start、current message -> Aster `Message` lowering、session config lowering 与 `Agent::reply` / `reply_with_provider` 调用。
- `completed`：`aster_reply_adapter.rs` 从 `814` 行降到约 `711` 行，低于 800 行治理预警；新 compat stream adapter 约 `141` 行，避免继续把 stream projection 逻辑堆回 Aster backend 启动文件。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime` 持有 `RuntimeReplyStreamProjector`，要求 `request_tool_policy` 声明 `aster_reply_stream_adapter`，要求 stream adapter 实现 `RuntimeReplyStreamProjector<AsterAgentEvent, RuntimeAgentEvent>` 并持有 provider side-channel / inline provider error 投影；同时禁止 `aster_reply_adapter.rs` 恢复 `AsterEventProjector::new`、`EventProjector` import、`extract_inline_agent_provider_error` 或 `provider_stream_event_from_aster_message`。
- `Thread / Turn / Item`：该骨架属于 Turn reply stream materialization；Codex `run_turn` 模式下 provider stream event、response item materialization 与 tool lifecycle 都在 Turn owner 下处理，本刀先把 Lime 的 reply stream source projection 形状迁到 current contract，Aster 只作为 source adapter。
- `classification`：`current skeleton` 是 `agent-runtime::reply_stream::RuntimeReplyStreamProjector`；`compat` 是 `aster_reply_stream_adapter.rs` 的 Aster `AgentEvent` -> current reply stream envelope source adapter；`dead / guarded` 是把 provider side-channel、inline provider error 和 Aster event projector 继续塞在 `aster_reply_adapter.rs` 中的旧中心化实现。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check` 通过；`CARGO_TARGET_DIR="/tmp/lime-reply-stream-projector-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib -j 2` 通过，`4 passed`；`CARGO_TARGET_DIR="/tmp/lime-reply-stream-projector-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent aster_reply_adapter --lib -j 2` 通过，`2 passed / 541 filtered out`；`CARGO_TARGET_DIR="/tmp/lime-reply-stream-projector-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "request_tool_policy 主文件不得重新承接 Aster reply stream loop" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed / 120 skipped`。
- `remaining`：root `aster` dependency 与 `lime-agent` 的 `aster.workspace = true` 仍不能删除；Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message` lowering、Aster `AgentEvent` source、Aster provider trait object 与 native `Tool` trait 注册壳仍是 Phase 6 blocker。整体目标完成度仍约 `95%`，不能上调为完成态。

### 2026-07-07：Batch A/D provider wire support owner 骨架

- `completed`：`model-provider::provider_stream` 新增 `RuntimeReplyProviderWireSupportIssue` 与 `RuntimeReplyStreamRequest::provider_request_wire_support_issue(...)`，承接 Responses Lite wire shape 对 backend / provider protocol 的支持判定。
- `completed`：`aster_reply_adapter.rs` 不再直接判断 `RuntimeProviderBackend::Current` / `RuntimeProviderBackend::AsterCompat`、`provider.identity.provider_name == "openai"` 或 `uses_responses_api`；Aster backend adapter 只调用 current issue，并在后续 boundary 收口中改为映射成 `RuntimeReplyStartError`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `model-provider` 持有 provider wire support owner，并禁止 `aster_reply_adapter.rs` 恢复旧 Aster compat wire support helper、backend/protocol 白名单判断和 provider-name 特判。
- `Thread / Turn / Item`：该骨架属于 Turn provider/reply execution handoff 的 provider request capability check；它继续对齐 Codex 的 current runtime/provider 边界，不让 compat backend 重新拥有 request policy 语义。
- `classification`：`current skeleton` 是 `model-provider::provider_stream` 的 wire support issue/check；`compat` 是 `aster_reply_adapter.rs` 的 `Agent::reply` / provider trait 调用；`dead / guarded` 是 Aster adapter 内的 Responses Lite backend/protocol 支持判定。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package lime-agent -- --check` 通过；`CARGO_TARGET_DIR="/tmp/lime-provider-wire-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider responses_lite_wire --lib -j 2` 通过，`4 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "request_tool_policy 主文件不得重新承接 Aster reply stream loop" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed / 120 skipped`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 编译通过，运行阶段 `64 passed / 1 failed`，失败为 `provider_stream_idle` idle guard 超时；单独复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent stream_message_reply_with_policy_should_fail_closed_when_provider_stream_idles_before_any_event --lib -j 2` 通过，`1 passed`；`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 因并行 `app-server` 构建持有默认 target build lock 长时间等待后手动中止，未产生 Rust 编译错误结论。
- `remaining`：Aster `Agent::reply` / provider trait / Aster `Message` lowering / Aster `AgentEvent` source 仍是 root `aster` dependency blocker；本刀只收 provider wire support owner，不把 Phase 6 误报为完成。

### 2026-07-07：Batch A/D provider stream start handoff 骨架

- `completed`：`model-provider::provider_stream` 新增 `RuntimeReplyProviderStreamStart` 与 `RuntimeReplyProviderStartError`，把 provider stream start 前的 provider handle 存在性和 pinned handle 一致性校验收进 current provider stream contract。
- `completed`：`ConfiguredReplyProvider::stream_reply_with_agent(...)` 改为接收 `&RuntimeReplyProviderStreamStart`，只从 current start contract 读取 stream request 做 tracing；删除原先 adapter 内的 `debug_assert_eq!(stream_request.provider.as_ref(), Some(&self.handle))`，不再把 provider handle contract 藏在 Aster provider adapter 的 debug-only 分支。
- `completed`：`aster_reply_adapter.rs` 的 configured provider 分支先构造 `RuntimeReplyProviderStreamStart::new(stream_request.clone(), provider.runtime_handle())`，失败时按 current start error 映射；Aster backend adapter 在后续 boundary 收口中直接返回 `RuntimeReplyStartError`，只负责把 current start 交给 provider compat backend。
- `completed`：`agent_reply_stream.rs` current 主循环在 `host.start_reply_stream(start_request)` 阶段也套用 provider stream idle timeout，并在 start 超时时取消传给 backend 的 provider cancel token；idle guard 不再只保护 stream 创建后的 `stream.next()`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `model-provider` 暴露 `RuntimeReplyProviderStreamStart` / `RuntimeReplyProviderStartError`，要求 `credential_bridge` 使用 `provider_start: &RuntimeReplyProviderStreamStart`，禁止恢复 `debug_assert_eq!(stream_request.provider.as_ref()...)`，并要求 `aster_reply_adapter.rs` 通过 `RuntimeReplyProviderStreamStart::new(...)` 接线。
- `guarded`：`asterMigrationBoundary.test.ts` 进一步要求 `agent_reply_stream.rs` 保留 `idle_cancel_token` 和 `tokio::time::timeout(timeout, host.start_reply_stream(start_request))`，禁止回到直接 `.start_reply_stream(...).await`。
- `Thread / Turn / Item`：该骨架属于 Turn provider/reply execution handoff 的 provider stream start contract；它对齐 Codex 的“先 materialize current request，再交给 backend runner”方式，让 future current provider/reply backend 不继承 Aster adapter 的 provider handle 匹配逻辑，也不把 pre-stream hang 留给 Aster reply loop。
- `classification`：`current skeleton` 是 `model-provider::provider_stream::RuntimeReplyProviderStreamStart` 与 `agent_reply_stream.rs` start idle guard；`compat` 是 `ConfiguredReplyProvider` 内部仍调用 Aster `Provider` trait / `Agent::reply_with_provider`；`dead / guarded` 是 credential bridge 内的 debug-only provider handle 校验、Aster adapter 直接解释 provider handle 匹配，以及只保护 `stream.next()` 的旧 idle guard 缺口。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package lime-agent -- --check` 通过；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "provider reply stream handle contract|request_tool_policy 主文件不得重新承接 Aster reply stream loop" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`2 passed / 119 skipped`；`CARGO_TARGET_DIR="/tmp/lime-provider-start-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream_start --lib -j 2` 通过，`3 passed`；`CARGO_TARGET_DIR="/tmp/lime-provider-start-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider responses_lite_wire --lib -j 2` 通过，`4 passed`；`CARGO_TARGET_DIR="/tmp/lime-agent-provider-idle-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent provider_stream_idle --lib -j 2` 通过，`2 passed`；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过；scoped `git diff --check` 通过。
- `remaining`：root `aster` dependency 与 `lime-agent` 的 `aster.workspace = true` 仍不能删除；Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message`、Aster `AgentEvent`、Aster provider trait object 与 native `Tool` trait 注册壳仍是 Phase 6 blocker。

### 2026-07-07：Batch A/D reply session metadata owner 骨架

- `completed`：新增 `agent-runtime::reply_session` current owner，承接 reply start 前的 session metadata 准备规则：`tool_scope.disallowed_tools` 合并与 provider request wire shape metadata 注入。
- `completed`：`aster_reply_adapter.rs` 不再手写 `tool_scope` / `disallowed_tools` / `RuntimeReplyProviderRequestWireShape::TURN_CONTEXT_METADATA_KEY` metadata 拼装；Aster adapter 只解析 compat 侧 native tool policy 并调用 current helper。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime::reply_session` 暴露 `attach_reply_disallowed_tools(...)` 与 `attach_reply_provider_wire_shape(...)`，并禁止 `aster_reply_adapter.rs` 恢复 `tool_scope`、`disallowed_tools` 或 provider wire shape metadata 的第二份实现。
- `Thread / Turn / Item`：该骨架属于 Turn provider/reply execution handoff 的 session metadata preparation；它使 future current provider/reply backend 可以复用同一 metadata owner，而不是继承 Aster adapter 的局部规则。
- `classification`：`current skeleton` 是 `agent-runtime::reply_session`；`compat` 是 `aster_reply_adapter.rs` 的 Aster session config lowering 与 `Agent::reply` 调用；`dead / guarded` 是 Aster adapter 内的 metadata 拼装重复实现。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-reply-session-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_session --lib -j 2` 通过，`3 passed`；`lime-agent request_tool_policy` 与 `cargo check -p lime-agent --lib -j 1` 在依赖编译阶段被 SIGTERM 中断，未产生 Rust 编译错误结论，待下一刀复用缓存继续验证。
- `remaining`：Aster `Agent::reply` / provider trait / Aster `Message` lowering / Aster `AgentEvent` source 仍是 root `aster` dependency blocker；本刀只收 current metadata owner，不把 Phase 6 误报为完成。

### 2026-07-07：Batch A/D reply start request execution handoff 骨架

- `completed`：新增 `agent-runtime::reply_host::RuntimeReplyStartRequest`，把 current `RuntimeReplyRequest`、`AgentSessionConfig`、provider cancel token 和 `emitted_any` 合并成 Turn reply backend start request。
- `completed`：`RuntimeReplyStreamHost::start_reply_stream(...)` 改为只接收 `RuntimeReplyStartRequest`，不再暴露 `request / session_config / cancel_token / emitted_any` 四个散参；`agent_reply_stream.rs` current 主循环负责构造 start request。
- `completed`：`aster_reply_adapter.rs` 的 `AsterReplyRuntimeHost` 与 `start_aster_reply_stream(...)` 改为接收 current start request 后局部拆解，adapter 不再定义自己的 start 参数形状。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime::reply_host` 提供 `RuntimeReplyStartRequest` 字段，要求 `agent_reply_stream.rs` 构造 `RuntimeReplyStartRequest::new(...)`，并禁止 `aster_reply_adapter.rs` 恢复 `request: RuntimeReplyRequest, session_config: AgentSessionConfig` 这类散参入口。
- `Thread / Turn / Item`：该骨架属于 Turn provider/reply execution handoff。它让 future current provider/reply backend 可以直接消费同一 start request，而不是复制 Aster backend 的函数签名。
- `classification`：`current skeleton` 是 `agent-runtime::reply_host::RuntimeReplyStartRequest` 和 `RuntimeReplyStreamHost` 新签名；`compat` 是 `aster_reply_adapter.rs` 的 Aster backend start request 拆解；`dead / guarded` 是 Aster adapter 自有 start 参数形状。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_host --lib -j 2` 通过，`2 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`65 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "request_tool_policy 主文件不得重新承接 Aster reply stream loop" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed / 120 skipped`；`npx prettier --check ...` 与 scoped `git diff --check` 通过。
- `remaining`：下一刀继续 provider/reply loop execution body：Aster `Agent::reply` / provider trait / `Message` lowering / `AgentEvent` source 仍是 root `aster` dependency blocker。

### 2026-07-07：Batch A/D reply request modality validation handoff 骨架

- `completed`：把 image input modality 校验从 `aster_reply_adapter.rs` 的 Aster `Message` lowering 前移到 `agent_reply_stream.rs` current 主循环；`validate_reply_request_modalities(...)` 基于 current `RuntimeReplyRequest.message.has_images()` 与 turn context model input policy fail closed。
- `completed`：`aster_reply_adapter.rs` 删除 `build_aster_reply_attempt_message(...)`、`validate_reply_message_modalities(...)` 和 `RuntimeReplyMessage::from_attempt_input(...)` 的 adapter-local materialization；adapter 只对已验证的 `RuntimeReplyMessage` 执行 `lower_aster_reply_message(...)`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent_reply_stream.rs` 持有 `validate_reply_request_modalities`、`input_modality_policy_from_turn_context` 与 `input_modality_policy_allows_image_input`，并禁止 `aster_reply_adapter.rs` 恢复 `RuntimeReplyMessage::from_attempt_input(...)`、`validate_reply_message_modalities(...)` 或 input modality policy 解析。
- `Thread / Turn / Item`：该骨架属于 Turn input/request validation；它让 future current provider/reply backend 不必继承 Aster lowering 才能获得 image policy fail-closed 行为。本刀没有迁出 Aster `Agent::reply`、provider trait 或 `Message` lowering。
- `classification`：`current skeleton` 是 `agent_reply_stream.rs` 的 request modality validation；`compat` 是 `aster_reply_adapter.rs` 的 backend message lowering；`dead / guarded` 是 Aster adapter 内 attempt input materialization 和 modality policy 判断。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_request --lib -j 2` 通过，`2 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`65 passed`，覆盖 `reply_request_modalities_*` 回归；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "request_tool_policy 主文件不得重新承接 Aster reply stream loop" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed / 120 skipped`；`npx prettier --check ...` 与 scoped `git diff --check` 通过。
- `remaining`：下一刀继续 provider/reply loop execution contract；root `aster` dependency 与 `lime-agent` 的 `aster.workspace = true` 仍不能删除。

### 2026-07-07：Batch A/D reply request current stream handoff 骨架

- `completed`：按 Codex turn loop 先 materialize request、backend adapter 只负责执行边界的方式，把 `RuntimeReplyRequest::from_attempt_input(...)` 上提到 `request_tool_policy/agent_reply_stream.rs` current 主循环。
- `completed`：`agent-runtime::reply_host::RuntimeReplyStreamHost` 的 `start_reply_stream(...)` 改为接收 `RuntimeReplyRequest`，不再接收 `RuntimeReplyAttemptInput`；host contract 仍保持 不依赖 Aster。
- `completed`：`agent_reply_stream.rs` 从 `session_config.turn_context` 解析 model request policy，并通过 `host.provider_handle().cloned()` 把 pinned provider handle 写入 current request；`aster_reply_adapter.rs` 只消费 `request.into_parts()` 后做 current message -> Aster `Message` lowering、provider/reply backend 调用和 event projection。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `reply_host.rs` 包含 `RuntimeReplyRequest` 且不含 `RuntimeReplyAttemptInput`，要求 `agent_reply_stream.rs` 持有 `RuntimeReplyRequest::from_attempt_input(...)` 与 model request policy 解析，并禁止 `aster_reply_adapter.rs` 恢复 `RuntimeReplyRequest::from_attempt_input(...)`、`runtime_reply_model_request_policy_from_turn_context` 或 `RuntimeReplyStreamRequest::new(...)`。
- `Thread / Turn / Item`：该骨架属于 Turn reply request materialization 和 Turn provider execution handoff；provider trace、runtime events 与 Item read model 仍沿现有 current 主链消费。本刀没有迁出 Aster `Agent::reply`、Aster provider trait、Aster `Message` lowering 或 Aster `AgentEvent` source。
- `classification`：`current skeleton` 是 `agent-runtime::reply_request`、`agent-runtime::reply_host` 与 `agent_reply_stream.rs` 的 request materialization；`compat` 是 `aster_reply_adapter.rs` 的 Aster backend lowering / projection；`dead / guarded` 是 Aster adapter 内重新构造 reply request 的入口；`remaining blocker` 仍是 root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster `Agent::reply` / provider trait / session store / native `Tool` trait 注册壳。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_request --lib -j 2` 通过，`2 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent build_reply_message --lib -j 2` 通过，`2 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`65 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "request_tool_policy 主文件不得重新承接 Aster reply stream loop" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed / 120 skipped`；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过；scoped `git diff --check` 通过。
- `remaining`：下一刀继续先快后细，优先做 provider/reply loop 的下一层骨架：把 Aster provider/reply backend execution contract 继续向 `agent-runtime` / `model-provider` current owner 上提，或处理 Aster reply loop native `Tool` trait 壳；不能把本刀误报成 Phase 6 完成。

### 2026-07-07：Batch A/D reply request current contract 骨架

- `completed`：对照 Codex `core::codex_thread` / protocol-first turn input request materialization，本刀把 provider reply stream request 的构造规则从 Aster adapter 收进 Lime current owner，而不是继续在 `aster_reply_adapter.rs` 直接拼 `RuntimeReplyStreamRequest::new(...)`。
- `completed`：新增 `agent-runtime::reply_request::RuntimeReplyRequest`，把 `RuntimeReplyAttemptInput` materialize 为 current `RuntimeReplyMessage` 和 `model_provider::RuntimeReplyStreamRequest`，统一计算 `input_kind`、`message_chars`、provider handle 与 model request policy。
- `superseded`：最初 `aster_reply_adapter.rs::start_aster_reply_stream(...)` 负责调用 `RuntimeReplyRequest::from_attempt_input(...)`；2026-07-07 后续 `reply request current stream handoff` 已把该调用上提到 `agent_reply_stream.rs` current 主循环，Aster adapter 只保留 current message -> Aster `Message` lowering、Aster provider/reply 调用和 provider event projection。
- `superseded-guard`：本条最初守卫要求 `aster_reply_adapter.rs` 通过 `RuntimeReplyRequest::from_attempt_input(...)` 接线；2026-07-07 后续 `reply request current stream handoff` 已改为要求 `agent_reply_stream.rs` 构造 current request，并禁止 `aster_reply_adapter.rs` 恢复 `RuntimeReplyRequest::from_attempt_input(...)`、`runtime_reply_model_request_policy_from_turn_context` 或 `RuntimeReplyStreamRequest::new(...)`。
- `Thread / Turn / Item`：该骨架属于 Turn reply request materialization；provider wire shape 仍由 `model-provider` current DTO 表达，Aster backend 只消费已构造好的 current stream request。本刀没有迁出 Aster `Agent::reply` / provider trait。
- `classification`：`current skeleton` 是 `agent-runtime::reply_request`；`compat` 是 `aster_reply_adapter.rs` 后续把 current request lowering 到 Aster provider/reply backend；`remaining blocker` 仍是 Aster `Agent::reply` / provider trait / `AgentEvent` / session store / native `Tool` trait 注册壳。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_request --lib -j 2` 通过，`2 passed`；`CARGO_TARGET_DIR="/tmp/lime-reply-request-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent build_reply_message --lib -j 2` 通过，`2 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "request_tool_policy 主文件不得重新承接 Aster reply stream loop" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed / 120 skipped`；`npx prettier --check ...` 与 scoped `git diff --check` 通过。
- `remaining`：root `aster` dependency 与 `lime-agent` 的 `aster.workspace = true` 仍不能删除；下一刀继续 provider/reply loop 的 provider trait / `Agent::reply`，或转向 Aster reply loop native `Tool` trait 壳。

### 2026-07-07：Batch A/D reply message current contract 骨架

- `completed`：对照 Codex `protocol::user_input::UserInput` 与 `ResponseItem::Message { role, content }`，本刀先补 Lime current reply message contract，而不是继续让 Aster `Message` 作为 reply input / message 的隐含事实源。
- `completed`：新增 `agent-runtime::reply_message::{RuntimeReplyMessage, RuntimeReplyMessageRole, RuntimeReplyMessageContent}`，承接 Turn reply message 的 text / image / action-required response content、`agent_only`、`concat_text` 和 image presence 规则；该模块不依赖 Aster。
- `superseded`：最初 `aster_reply_adapter.rs::start_aster_reply_stream(...)` 负责把 `RuntimeReplyAttemptInput` 转成 `RuntimeReplyMessage`；2026-07-07 后续 `reply request current stream handoff` 已把 current request materialization 上提到 `agent_reply_stream.rs`，Aster backend adapter 只从 `RuntimeReplyStartRequest` 取出已 materialize 的 `RuntimeReplyMessage`。
- `updated`：2026-07-07 后续 `reply message lowering adapter handoff` 已把 Aster `Message` 构造继续收缩到 `aster_reply_message_adapter.rs`；`aster_reply_adapter.rs` 只保留 backend start facade 调用。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime` 导出 `reply_message`，要求 `reply_message.rs` 不含 Aster source type，并要求 Aster `Message` / action-required lowering 只能留在 `aster_reply_message_adapter.rs`，禁止恢复 `build_aster_user_message(...)` 或把 `MessageContent::ActionRequired` 塞回 `aster_reply_adapter.rs`。
- `Thread / Turn / Item`：该骨架属于 Turn reply input materialization；text/image/action response 是 Turn 输入消息，后续 provider request / Thread Item 投影仍需继续从 Aster provider/reply loop 迁出。本刀没有宣称 Aster `Agent::reply` 已迁出。
- `classification`：`current skeleton` 是 `agent-runtime::reply_message`；`compat` 是 `aster_reply_adapter.rs` 的 current message -> Aster `Message` lowering；`remaining blocker` 仍是 Aster `Agent::reply` / provider trait / `AgentEvent` / session store / native `Tool` trait 注册壳。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_message --lib -j 2` 通过，`2 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent build_reply_message --lib -j 2` 通过，`2 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "request_tool_policy 主文件不得重新承接 Aster reply stream loop" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed / 120 skipped`；`npx prettier --check ...` 与 scoped `git diff --check` 通过。
- `remaining`：root `aster` dependency 与 `lime-agent` 的 `aster.workspace = true` 仍不能删除；下一刀继续 provider/reply loop 的 provider trait / `Agent::reply`，或转向 Aster reply loop native `Tool` trait 壳。

### 2026-07-07：Batch A/D event projector current contract 骨架

- `completed`：对照 Codex `app-server-protocol` 的 `event_mapping` / `ThreadItem` / `Turn` materialization 方式，本刀先补 Lime current event projector contract，而不是继续让 Aster `AgentEvent` 命名成为 reply stream 事实源。
- `completed`：新增 `agent-runtime::event_stream::EventProjector<SourceEvent, RuntimeEvent>`，作为 source-agnostic runtime event materialization contract；该模块不依赖 Aster。
- `completed`：`request_tool_policy/aster_event_adapter.rs` 将原迁移期 `RuntimeEventProjector` 重命名为 `AsterEventProjector`，并实现 current `EventProjector<AsterAgentEvent, RuntimeAgentEvent>`；Aster event / auto-compaction / turn context projection 继续被限制在 compat adapter。
- `completed`：`aster_reply_adapter.rs` 通过 `EventProjector` contract 调用 `AsterEventProjector`，并继续把 provider stream notification 与 inline provider error suppression 包进 `RuntimeReplyStreamEvent` current envelope。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime` 导出 `event_stream`，要求 `event_stream.rs` 不含 Aster source type，要求 Aster event projection 只在 `aster_event_adapter.rs` 实现 `EventProjector`，并禁止恢复旧 `RuntimeEventProjector` struct。
- `Thread / Turn / Item`：该骨架属于 Turn execution event materialization；最终目标仍是把具体 runtime event / item DTO 收敛到 current owner，再由 App Server / GUI / Evidence 消费。本刀没有宣称 Aster `Agent::reply` 已迁出。
- `classification`：`current skeleton` 是 `agent-runtime::event_stream::EventProjector`；`compat` 是 `AsterEventProjector` 的 Aster `AgentEvent` -> `RuntimeAgentEvent` 投影；`remaining blocker` 仍是 Aster `Agent::reply` / `Message` / provider trait / session store / native `Tool` trait 注册壳。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime event_stream --lib -j 2` 通过，`1 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent projector_applies_turn_context_truncation_to_later_tool_response --lib -j 2` 通过，`1 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "request_tool_policy 主文件不得重新承接 Aster reply stream loop" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed / 120 skipped`；`npx prettier --check ...` 与 scoped `git diff --check` 通过。
- `remaining`：root `aster` dependency 与 `lime-agent` 的 `aster.workspace = true` 仍不能删除；下一刀继续推进 provider/reply loop 或 Aster reply loop native tool registry 壳。

### 2026-07-07：Batch B Aster Task\* vendor delete 骨架

- `completed`：在上一刀已经从 production allowlist / prompt / catalog / GUI current capability 退出 Task\* 后，继续按 Codex 对照结论清理 vendored Aster 编译面。Codex 没有 model-facing `TaskCreate` / `TaskList` / `TaskGet` / `TaskUpdate` / `TaskOutput` / `TaskStop` 工具族，Lime 不再为其保留 vendor 实现。
- `completed`：删除 `vendor/aster-rust/crates/aster/src/tools/task_list_tools.rs`、`task_output_tool.rs`、`task_stop_tool.rs`，并从 `tools/mod.rs` 移除 `pub mod`、`pub use`、共享 `TaskListStorage`、默认注册和 `allowed_tool_names` 正向注册路径。
- `completed`：Aster SubAgent production allowlist 不再包含 `TaskCreate` / `TaskGet` / `TaskList` / `TaskUpdate`；`TaskOutput` / `TaskStop` 继续保持隐藏。ToolSearch vendor alias 表不再用 Task\* 作为可搜索别名或示例，Bash 后台输出也不再提示 `TaskOutput` fallback。2026-07-09 继续清掉 `lime-core::tool_calling` 中的 Task\* discovery profiles，`tool_search` 不再把 `TaskCreateTool` / `TaskOutputTool` / `KillShell` 等旧 alias 当可发现能力。
- `completed`：删除没有触发源的 vendor `TaskCreated` hook event；`TaskCompleted` 仍暂按 scheduler / coordination 内部事件名保留，本刀不扩大到 subagent scheduler 事件模型。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 forbidden-to-restore 守卫，要求上述三个 vendor 文件不存在，`tools/mod.rs` production 段不得恢复 Task\* module / export / alias / 默认注册，SubAgent production allowlist、ToolSearch production alias 与 `lime-core::tool_calling` discovery profiles 不得回流 Task\*。
- `Thread / Turn / Item`：Task\* 不进入 Turn tool lifecycle current，也不进入 Item tool projection current。计划能力继续由 `tool-runtime::update_plan` 承接；后台命令输出继续通过 Bash output file + Read 工具路径读取，不再通过 `TaskOutput`。
- `classification`：`dead / deleted / forbidden-to-restore` 是 Aster Task\* vendor tool implementation、`TaskCreated` hook 旧触发事件和 ToolSearch Task\* alias；`current` 仍是 `tool-runtime::update_plan` / `tool-runtime` native dispatch；`compat` 仍仅限历史 transcript / frontend display / projection 读面中识别旧 Task\* 事件。
- `validated`：`cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" --package aster-core -- --check` 通过；`cargo check --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core -j 2` 通过；`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`121 passed`；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过；scoped `git diff --check` 通过。
- `validated`：2026-07-09 补验 `CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core tool_calling --lib -j 2` 通过，`22 passed`，包含 `test_aster_task_discovery_profiles_stay_deleted`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`143 passed`。
- `deferred-validation`：`cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core tools:: --lib -j 2` 已完成编译并运行到断言，`469 passed / 2 failed`；失败项中 `tools::file::read::tests::test_tool_description` 是既有 ReadTool 文案断言，`tools::registry::tests::test_registry_default_alias_matrix_is_lookup_only_for_all_current_tools` 已按 Task\* 删除后的 current alias matrix 口径修正。随后尝试用临时 `CARGO_TARGET_DIR` 重跑 `test_register_all_tools`，但被冷编译大型 dev-dependency 图拖慢并按“快速骨架优先”中断；细节阶段可在共享 target 空闲后补跑 `test_register_all_tools` 与 `test_registry_default_alias_matrix_is_lookup_only_for_all_current_tools`。
- `remaining`：这一步只清掉 Task\* 工具族 vendor residual，没有迁出 `Agent::reply`、Aster `Message` / `AgentEvent` / provider trait、Aster `SessionStore` / `ThreadRuntimeStore` 或 root `aster` dependency。整体目标完成度仍约 `95%`。

### 2026-07-07：Batch B Aster Task\* production disable 骨架

- `completed`：对照 `/Users/coso/Documents/dev/rust/codex/codex-rs/core/src` 与 `tools/src`，Codex 没有 model-facing `TaskCreate` / `TaskList` / `TaskGet` / `TaskUpdate` / `TaskOutput` / `TaskStop` 工具族；唯一命中是 realtime fanout 内部 `RealtimeFanoutTaskStop`，不能作为 Lime 工具面事实源。
- `completed`：从 `tool-runtime::native_overlay::runtime_native_tool_registration_allowlist()` 移除上述 Task\*，Aster `Agent::with_tool_config(...)` 不再把 task board / task output / task stop 注册到 production native registry。
- `completed`：`lime-agent/src/agent_tools/catalog.rs` 删除 Task* current catalog entries 与 legacy `Task*Tool` catalog alias；`update_plan` 保持 Plan current owner。
- `completed`：`lime-agent/src/prompt/templates.rs` 不再提示模型使用 Task\* 规划、读取后台任务或停止后台任务；复杂任务规划改为 `update_plan`。
- `completed`：前端 runtime capability 骨架从 `taskRuntime` / `missingTaskTools` 改为 `planRuntime` / `missingPlanTools`，成功条件只检查 `update_plan`，Harness 工具库存测试夹具不再把 Task\* 标成 `current_surface`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 production allowlist、agent tool catalog、agent prompt 和 frontend runtime availability 都不得恢复 Task\*；同时要求这些 current 面继续包含 `update_plan`。
- `Thread / Turn / Item`：Aster Task\* 不进入 Turn tool lifecycle current；Plan 能力由 `tool-runtime::update_plan` 承接，结果继续进入 Item plan projection / App Server `plan.final` / GUI plan track。历史 TaskUpdate owner projection、task board display、legacy transcript normalization 暂保留为 `compat read surface`，回头细化时按引用面继续清理。
- `classification`：`current` 是 `tool-runtime::update_plan` 与 GUI `planRuntime` capability；`dead / production-disabled` 是 Aster Task* 在 production registry、prompt、catalog 与 GUI current capability 中的入口；`compat` 是历史 transcript / display / projection 中仍可读取 Task* 旧事件的读面。
- `superseded`：本条最初记录的 vendor `task_list_tools.rs`、`task_output_tool.rs`、`task_stop_tool.rs` remaining 已由后续 `Batch B Aster Task* vendor delete 骨架` 删除；2026-07-09 又补删了 `lime-core::tool_calling` Task\* discovery profiles。剩余 Task\* 只允许作为历史 transcript / frontend display / projection 读面继续收缩，不得作为 production tool 或 discovery profile。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 2` 通过，`4 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent catalog --lib -j 2` 通过，`16 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_overlay --lib -j 2` 通过，`8 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent prompt --lib -j 2` 通过，`45 passed`；前端贴边 Vitest（`runtimeToolAvailability`、`HarnessStatusPanel.tools`、`harnessStatusPanelViewModel`、`AgentRuntimeStrip`、`useWorkspaceHarnessInventoryRuntime`、`asterMigrationBoundary`）通过，`156 passed`；`npx prettier --check ...` 与 scoped `git diff --check` 通过。
- `remaining-progress`：这一步减少 Aster native tool registry 壳的 production 暴露面，但没有迁出 `Agent::reply`、Aster `Message` / `AgentEvent` / provider trait、Aster `SessionStore` / `ThreadRuntimeStore` 或 root `aster` dependency。整体目标完成度仍约 `95%`，不能上调为完成态。

### 2026-07-07：Batch B native dispatch 骨架

- `completed`：对照 Codex `core/src/tools/registry.rs` / `router.rs` / `tools/src/tool_executor.rs` 的“spec 与 handler 绑定、router/registry 统一 dispatch”方式，新增 `tool-runtime::native_dispatch` current 骨架：`NativeDispatch`、`NativeDispatchBuilder`、`runtime_native_dispatch_handle()`、`runtime_native_dispatch_definitions()`、`runtime_native_dispatch_tool_names()`。
- `completed`：dispatcher 统一注册已迁且不需要 App Server gateway 的 native executor：`apply_patch`、`skill_search`、`sleep` / `clock.sleep`、`view_image`、`update_plan`、`WebFetch`、`WebSearch`；lookup-only aliases 只用于历史 transcript / Aster wrapper 查找，不作为 current 命名。
- `completed`：`lime-agent` 临时 Aster `Tool` adapter 中的 `apply_patch`、`skill_search`、`sleep`、`view_image`、`update_plan`、`WebFetch`、`WebSearch` 执行路径改为统一委托 `runtime_native_dispatch_handle()`；各自权限检查仍委托对应 `tool-runtime` current module。
- `Thread / Turn / Item`：归属 Turn tool lifecycle；dispatcher 是 Turn tool execution owner 的 current skeleton，definition / alias / executor dispatch 属于 tool lifecycle，执行结果 metadata 继续进入 Item tool projection。真实消费链仍经 Aster reply loop 临时 registry -> dispatcher -> current executor -> App Server / GUI / Evidence 既有消费链。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过；`CARGO_TARGET_DIR="/tmp/lime-native-dispatch-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_dispatch --lib -j 2` 通过，`4 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`119 passed`。
- `deferred-validation`：`CARGO_TARGET_DIR="/tmp/lime-native-dispatch-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 与 `lime-agent` adapter 过滤器因冷编译依赖过重按“骨架优先”中断；细节阶段必须补跑 `lime-agent native_tools`、`apply_patch`、`skill_search` 或等价 `cargo check -p lime-agent --lib`。
- `classification`：`current` 是 `tool-runtime::native_dispatch`、已迁 native executor 与 definition registry；`compat` 是 `lime-agent` Aster `Tool` trait adapter 统一委托 dispatcher；`dead` 仍是 vendor Web / sleep / view_image / update_plan 等已删除重复实现和未进入 allowlist 的 Aster-only 工具。
- `remaining`：dispatcher 不是 Phase 6 完成条件；Aster reply loop 仍通过 Aster `ToolRegistry` / `Tool` trait 调用，provider/reply loop、Aster `Message` / `AgentEvent` / provider trait、Aster `SessionStore` / `ThreadRuntimeStore` 仍阻塞 root `aster` dependency 删除。整体完成度仍约 `95%`。

### 2026-07-07：Batch B gateway-aware native dispatch 骨架

- `completed`：`tool-runtime::native_dispatch::NativeDispatchBuilder` 新增 `with_memory_store_gateway(...)` 与 `with_image_task_gateway(...)`，把需要 App Server gateway 的 memory/image executor selection 收回 current dispatcher builder；默认 `runtime_native_dispatch()` 继续只暴露无 gateway 静态工具，避免假全局入口。
- `completed`：`lime-agent/src/native_tools/memory_store.rs` 改为构造 per-gateway `NativeDispatch` handle，并由四个 memory Aster `Tool` wrapper 共用该 handle；adapter 不再直接调用 `runtime_memory_store_executor_handle(...)`。
- `completed`：`lime-agent/src/native_tools/image_tasks.rs` 改为构造 per-gateway `NativeDispatch` handle；adapter 仍只保留 Aster context -> current runtime context / turn metadata 的临时投影，不再直接调用 `runtime_image_task_executor_handle(...)`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `native_dispatch.rs` 持有 memory/image gateway-aware builder 与 current executor handle，要求 memory/image Aster wrapper 只能通过 `NativeDispatch::builder()` 接线，并禁止 wrapper 恢复直接 executor handle 调用。
- `Thread / Turn / Item`：归属 Turn tool lifecycle；这一步只完成 dispatcher 骨架统一，不删除 Aster reply loop 的 `Tool` trait 壳。memory metadata 继续进入 Evidence / GUI 既有消费链，image task 继续进入 App Server media task artifact / GUI image preview 主链。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过；`CARGO_TARGET_DIR="/tmp/lime-native-dispatch-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_dispatch --lib -j 2` 通过，`5 passed`；`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`119 passed`；`npx prettier --check ...` 通过。更重 App Server 回归留到回头细化。
- `classification`：`current` 是 `tool-runtime::native_dispatch` gateway-aware builder、`tool-runtime::memory_store` 与 `tool-runtime::image_task` executor；`compat` 是 `lime-agent` Aster `Tool` trait wrapper；`dead` 是 adapter 内直接选择 memory/image executor handle 的旧接线方式。
- `remaining`：下一刀仍应迁出 Aster reply loop native tool registry 壳或继续 Batch A/D provider/reply loop；root `aster` dependency 还不能删。整体完成度仍约 `95%`，不能上调到完成态。

### 2026-07-07：Batch B runtime_tool_bridge adapter 清理骨架

- `completed`：新增 `lime-agent/src/native_tools/runtime_tool_bridge.rs`，集中 Aster `ToolContext` -> current `RuntimeToolExecutionContext`、current `RuntimeToolExecutionResult` -> Aster `ToolResult`、current `RuntimeToolExecutionError` -> Aster `ToolError` 的临时转换，并提供 `execute_runtime_tool(...)`。
- `completed`：批量清理 `memory_store`、`image_tasks`、`sleep`、`view_image`、`update_plan`、`web_retrieval`、`apply_patch_tool`、`skill_search_tool` wrapper 中重复的 runtime context/result/error 转换函数；这些 wrapper 现在只保留权限检查、别名、gateway builder 或 turn context 适配。
- `guarded`：`asterMigrationBoundary.test.ts` 新增横向守卫，要求已迁 native tool wrapper 必须调用 `execute_runtime_tool(...)`，并禁止在单个 wrapper 中恢复 `runtime_context_from_aster`、`tool_result_from_runtime`、`runtime_error_to_tool_error`、`RuntimeToolExecutionRequest` 等重复桥接代码。
- `Thread / Turn / Item`：归属 Turn tool lifecycle。`runtime_tool_bridge.rs` 是 `compat blocker` 的过渡桥，不是最终 owner；迁出 Aster reply loop `Tool` trait 后应随 wrapper 一起删除。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过；`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent native_tools --lib -j 2` 通过，`22 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent apply_patch_tool --lib -j 2` 通过，`3 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_search_tool --lib -j 2` 通过，`1 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`120 passed`；`npx prettier --check ...` 通过。
- `classification`：`current` 是 `tool-runtime::*` executor / definition / dispatch；`compat` 是 `runtime_tool_bridge.rs` 与 Lime 侧 Aster `Tool` trait wrapper；`dead` 是每个 wrapper 里重复实现的 Aster context/result/error 转换代码。
- `remaining`：这一步只把已迁 adapter 骨架清薄，未迁出 Aster `ToolRegistry` / `Tool` trait、`Agent::reply`、Aster `Message` / `AgentEvent` / provider trait 或 Aster session/thread store。整体完成度仍约 `95%`。

### 2026-07-07：Batch B Aster Write/Edit production disable

- `completed`：对照 Codex `core/src/tools/hook_names.rs`，`Write` / `Edit` 只作为 `apply_patch` 的 matcher alias，而不是稳定 model-facing tool；因此从 `tool-runtime::native_overlay` overlay 清单和 `runtime_native_tool_registration_allowlist()` 中移除 `Write` / `Edit`。
- `completed`：`lime-agent/src/native_tools/runtime_overlay.rs` 不再 import / 注册 Aster `WriteTool`、`EditTool` 或 `create_shared_history()`；实际文件修改继续由 `tool-runtime::apply_patch` current executor 承接。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 runtime overlay 不得包含 `WriteTool` / `EditTool`，要求 current owner 不得恢复 `RuntimeNativeToolOverlay::Write` / `RuntimeNativeToolOverlay::Edit`，并要求 allowlist 明确 `!names.contains("Write")` / `!names.contains("Edit")`。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item file-change projection。历史 frontend normalization、process summary、transcript hydration 仍可识别 `Write` / `Edit`，但生产 registry 不再暴露这两个 Aster tools。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 2` 通过，`4 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_overlay --lib -j 2` 通过，`8 passed`。
- `classification`：`current` 是 `tool-runtime::apply_patch` 与 Codex-style `apply_patch` hook/tool identity；`dead / production-disabled` 是 Aster `WriteTool` / `EditTool` 在 Lime production registry 的注册面；`compat` 是历史 UI / transcript / hook matcher alias。
- `remaining`：Aster vendor `file` module 仍因 `ReadTool` / shared file helper 编译存在，本刀只关闭 `Write/Edit` 生产注册面；下一步应继续迁出或删除 allowlist 中仍靠 Aster 实现的 `Read` / search / task / MCP resource / Agent control 工具，或回到 provider/reply loop。

### 2026-07-07：Codex-first P2 memory/media skeleton follow-up

- `completed`：Context / Token 主链补 memory summary sidecarRef skeleton；写入前复用 App Server `contains_secret_like_content` guard，sidecar 只保存 memory summary 原文，不保存 `memory_soul_prompt_context`、Style Pack、full system prompt 或 Soul 风格包正文，符合 `internal/roadmap/soul` 的事实源边界。
- `completed`：Realtime / Media 主链补 App Server `agent_message.contentParts` 第一层 skeleton；`thread_item_projection/agent_message.rs` 消费 RuntimeCore `RuntimeMessageDeltaContent::from_payload(...)`，media-only `message.delta.contentPart/contentParts` 可 materialize 为 `agent_message.contentParts`，同一 `itemId` 的 text/media delta 可合并，`contentPart/contentParts` alias mismatch 与 inline `data:` media fail closed。
- `completed`：Context / Token 主链补 media input reference skeleton；App Server `context_media.rs` 从 turn `AgentInput.attachments` 读取非 inline media URI，生成 `ContextPacket::media_reference(...)`、`media_prompt_context` 与 `context_packet_telemetry`，inline `data:` media fail closed，不读取二进制、不把媒体正文塞进 prompt。
- `Thread / Turn / Item`：memory summary sidecarRef 属于 Turn context packet source，并进入后续 ContextFragmentEnvelope telemetry；media input reference 属于 Turn input context evidence；media content part 属于 Turn 内 `message.delta`，materialize 为 Item `agent_message.contentParts`。三者都不属于 Aster vendor current owner，也不允许在 provider wire 或 GUI 旁路重新解释。
- `validated`：`rustfmt --edition 2021 --check` 覆盖 `context_packet.rs`、`context_media.rs`、`memory_prompt.rs`、`turn_execution.rs`、`runtime.rs`、`runtime/tests.rs`、`runtime/tests/media_context.rs`；scoped `git diff --check` 通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server media_context -- --nocapture` 通过，`2 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server context_packet -- --nocapture` 通过，`4 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server memory_prompt -- --nocapture` 通过，`14 passed`。
- `classification`：`current` 是 App Server `memory_prompt` sidecarRef skeleton、App Server `context_media` media input reference skeleton、RuntimeCore `RuntimeMessageDeltaContent` parser 与 App Server `agent_message.contentParts` Item skeleton；`compat` 仍是 Aster provider/reply loop 作为事件来源；`dead` 仍是 Aster vendor 承接 context / media / Soul prompt 或 inline `data:` Item 的路径。
- `remaining`：Plugin skill/MCP runtime consumer skeleton 已由下一节关闭，MCP prepare execution API 已完成但 trigger / refresh 仍 pending；full media preview / binary sidecar read / media protocol / generated client / projection package / Workbench consumer 仍 pending；整体 Phase 6 仍约 `96%`，root `aster` dependency、provider/reply loop、Aster `SessionStore` / `Tool` trait 注册壳未清零。

### 2026-07-07：Codex-first P2 Plugin skill/MCP runtime consumer skeleton

- `completed`：前端 workspace plugin activation metadata 透传 `plugin_activation.runtime_capabilities` 与顶层 `plugin_runtime_capabilities`，App Server `runtime_backend/plugin_runtime_context.rs` 可从当前 activation / harness metadata 读取 `runtimeCapabilities`。
- `completed`：`plugin_runtime_context.rs` 解析 `runtimeCapabilities.skills[].promptInjectionPolicy`、`workflowBindings[]` 与 `mcpBindings[]`，并按当前 workflow / task / selected skill refs 选择 plugin prompt skill candidate。
- `completed`：`agent_skills_context.rs` 把 plugin prompt skill candidate 接入既有 Agent Skills selection；同名 skill 已在统一 Agent Skills registry / `.agents/skills` 时注入 `<selected_skill_instructions>`；本地 folder plugin package skill 已通过 `package_source_uri` 与包内 `runtimeCapabilities.skills[].path` 合入同一份 `AgentSkillSnapshot`，不复制到 workspace `.agents/skills`，非本地 source、绝对路径、`../` 与缺失文件 fail closed。
- `completed`：`session_config.rs` 渲染 `<plugin_runtime_capabilities>` guidance；`agent_skills_telemetry.rs` 输出 `plugin_runtime_capabilities` runtime status，包含 promptSkills 与 mcpBindings。
- `completed`：`plugin_runtime_context.rs` 已把 `runtimeCapabilities.mcpBindings[]` 归一化为 MCP runtime target，生成 `plugin:<plugin_id>` caller 与 `mcp__<server>__<tool>` 预期工具名。
- `completed`：`tool_inventory.rs` 已消费 request metadata 中的 plugin MCP target，并在现有 MCP server status / tool snapshot 上追加 `plugin_mcp_targets` 投影，输出 `available` / `server_stopped` / `server_available_tool_missing` / `server_missing`、`expectedToolName`、`serverRunning`、`toolListRequest`、`prepareStatus`、candidate `prepareRequests` skeleton 与显式 `callProofRequest`。
- `completed`：`prepareStatus` 只表达下一步准备状态：`ready` 不产生请求，`start_required` 输出 `mcpServer/start` + `mcpTool/listForContext` candidate，`import_required` 输出 `mcpServer/importFromApp` + `mcpTool/listForContext` candidate，`configure_required` 与 `tool_missing` 不伪造执行成功。
- `completed`：前端 API `mcpApi.executePrepareRequests(...)` 已能顺序执行 candidate `prepareRequests`，只复用 App Server current `mcpServer/importFromApp`、`mcpServer/start` 与 `mcpTool/listForContext`；`mcpApi.executeCallProofRequests(...)` 只接受 candidate `mcpTool/callWithCaller`，要求显式 `toolName/caller/arguments`，工具返回 `is_error=true` 时 fail closed；非 candidate、未知 method、malformed params 均 fail closed，且不回退 legacy `safeInvoke`。
- `completed`：Workspace `prepareMcpTargets()` 已按 prepare requests -> caller-scoped list proof -> explicit call proof -> refresh inventory 顺序执行；无 candidate、list proof 缺失或 call proof 失败均 fail closed，不刷新库存。
- `completed`：无显式 `callProof.arguments` 时，Workspace 只把 `plugin_mcp_targets[].toolListRequest` 包装成 candidate `mcpTool/listForContext` default list proof，继续校验 `expectedToolName`；不会自动 import/start/call tool，也不会从 `input_examples` 推断参数。
- `Thread / Turn / Item`：归属 Turn prompt/context selection 与 Turn tool inventory prepare / proof skeleton；显式 call proof skeleton 仍只是 Turn tool availability proof，不等同完整 Turn tool lifecycle 或 Item tool projection runtime-complete。
- `validated`：`rustfmt --edition 2021` 覆盖本轮 Rust 写集通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server plugin_runtime -- --nocapture` 最新通过，`10 passed`；`CARGO_TARGET_DIR="/tmp/lime-plugin-skill-registry-target" CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server plugin_package_skill_path_enters_selected_skill_instructions --lib` 通过，`1 passed`；`CARGO_TARGET_DIR="/tmp/lime-codex-mcp-call-proof-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_capabilities --lib` 通过，`5 passed`；`npx vitest run "src/components/agent/chat/workspace/workspacePluginActivation.unit.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 最新通过，`16 passed`；`npx vitest run "src/components/agent/chat/workspace/useWorkspaceHarnessInventoryRuntime.test.tsx"` 最新通过，`12 passed`；此前 hook / MCP 组合 Vitest 通过，`30 passed`；scoped ESLint / prettier / `git diff --check` 通过。`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server tool_inventory --lib` 最新复跑被并行 `media_task.rs` idempotency import 编译错误阻塞；`npm run typecheck -- --pretty false` 被并行删除 `src/features/plugin/runtime/workflowRuntimeCapabilityProfile.ts` 阻塞。
- `classification`：`current` 是 App Server `runtime_backend/plugin_runtime_context.rs`、`runtime_backend/tool_inventory.rs`、前端 API `mcpApi.executePrepareRequests(...)` / `mcpApi.executeCallProofRequests(...)`、Workspace default list proof、local folder package source metadata、Agent Skills selection / package root consumer、session prompt guidance、runtime status telemetry、inventory `plugin_mcp_targets` prepare request skeleton 与显式 call proof skeleton；`compat` 是旧 `skillRefs` / `toolRefs` / raw manifest MCP binding 的缺 snapshot fallback；`deprecated` 是 local archive / cloud package skill root、MCP GUI smoke 与自动触发仍未接通；`dead` 是从 App Center UI 卡片或 Aster vendor 反推 runtime capability，以及把 MCP guidance / target skeleton / candidate `prepareRequests` / 显式 proof skeleton / list proof 误报成 MCP import 完成或 runtime-complete。
- `remaining`：MCP GUI smoke / 自动触发仍 pending；local archive / cloud package skill root 需要后续从 package cache / install materialization 边界接入；full media preview / binary sidecar read / Workbench consumer 仍 pending。整体 Phase 6 仍约 `96%`，root `aster` dependency、provider/reply loop、Aster `SessionStore` / `Tool` trait 注册壳未清零。

### 2026-07-07：Phase 6 provider/reply current contract 接力验证

- `collaboration`：`lime-rs/crates/agent-runtime/src/reply_stream.rs`、`lime-rs/crates/agent/src/request_tool_policy/{agent_reply_stream.rs,aster_reply_adapter.rs,aster_reply_backend_adapter.rs,aster_reply_message_adapter.rs,aster_reply_stream_adapter.rs}` 与 `lime-rs/crates/model-provider/src/provider_stream*` 当前已由并行进程改动；本进程只接管验证、治理守卫和文档记录，不改这些 Rust 源码，不碰 Aster vendor。
- `completed`：确认并行骨架方向对齐 Phase 6：`agent-runtime::reply_stream::RuntimeReplyStreamProjector` 已把 reply stream projection contract 抽成 source-agnostic current trait；`request_tool_policy/aster_reply_stream_adapter.rs` 承接 Aster `AgentEvent` -> `RuntimeReplyStreamEvent<RuntimeAgentEvent>` 的 compat source adapter；`model-provider::provider_stream::RuntimeReplyProviderStreamStart` / `RuntimeReplyProviderStartError` 承接 provider stream start 前的 handle presence / pinned handle match 校验；`RuntimeReplyStreamRequest::provider_request_wire_support_issue(...)` 承接 provider wire support 判定，`request_tool_policy/aster_reply_backend_adapter.rs` 只调用 current issue / start handoff，`aster_reply_adapter.rs` 不再本地持有 Aster backend execution body、provider wire support、stream projection 或 message lowering。
- `Thread / Turn / Item`：归属 Turn provider/reply execution handoff 与 Turn reply stream materialization；Aster `AgentEvent` 仍只是 compat source，不是 current runtime event owner。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package model-provider --package lime-agent -- --check` 通过；`CARGO_TARGET_DIR="/tmp/lime-phase6-reply-verify-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_stream --lib` 通过，`4 passed`；`CARGO_TARGET_DIR="/tmp/lime-phase6-reply-verify-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib` 通过，`15 passed`。
- `guarded`：`asterMigrationBoundary.test.ts` 已对齐新的 reply compat 分层：要求 `aster_reply_backend_adapter.rs` 是唯一允许持有 backend start execution body、`RuntimeReplyProviderStreamStart::new(...)`、`provider_request_wire_support_issue()` 调用和 `Agent::reply` / provider stream handoff 的 compat 文件；要求 `aster_reply_stream_adapter.rs` 是唯一 Aster source stream projector；禁止 `aster_reply_adapter.rs` 恢复 provider wire support、本地 `RuntimeProviderBackend::*` / provider-name / protocol 特判、message lowering 或 stream projection 细节。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`121 passed`。
- `blocked-validation`：`lime-agent request_tool_policy` 定向测试未跑到源码断言阶段；独立 target 失败于 `/tmp/lime-phase6-reply-verify-target` 写入 `rlib` 时 `No space left on device`，默认 target 复跑也失败于 `rustc-LLVM ERROR: IO failure on output stream: No space left on device`。`df -h "/tmp" "."` 显示失败时当前卷可用空间不足；`du -sh "/tmp/lime-phase6-reply-verify-target"` 约 `3.0G`，`du -sh "lime-rs/target"` 约 `110G`。该阻塞归属本机磁盘空间，不证明 provider/reply 骨架失败。
- `classification`：`current` 是 `agent-runtime::reply_stream` projector contract 与 `model-provider::provider_stream` start / wire support contract；`compat` 是 `aster_reply_backend_adapter.rs` / `aster_reply_stream_adapter.rs` / `aster_reply_message_adapter.rs` / `aster_reply_adapter.rs` 内仍依赖 Aster `AgentEvent` / `Message` / `Agent::reply` 的 source adapter 与 host facade；`dead` 是在 current contract 中恢复 Aster DTO，或把 provider wire support 判定放回 Aster adapter 本地特判。
- `remaining`：下一刀在磁盘空间恢复后复跑 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib`。root `aster` dependency、Aster `Agent::reply` / provider trait / `Message` / `AgentEvent` 仍未清零。

### 2026-07-07：Batch B Codex-style update_plan current owner

- `completed`：对照 `/Users/coso/Documents/dev/rust/codex/codex-rs/core/src/tools/handlers/plan.rs`、`plan_spec.rs` 与 `protocol/src/plan_tool.rs`，Codex current 是 `update_plan` TODO/checklist 工具，不是 Plan mode；工具名固定短领域名 `update_plan`，参数为可选 `explanation` 与 `plan[{ step, status }]`，`status` 只接受 `pending | in_progress | completed`。
- `completed`：新增 `tool-runtime::update_plan` current owner，承接 `RuntimePlanUpdateExecutor`、`runtime_plan_update_executor_handle()`、`update_plan_definition()`、`check_plan_update_permissions(...)`、`PlanUpdate` / `PlanStep` 领域 DTO、`deny_unknown_fields` 输入解析、最多一个 `in_progress` 校验、Plan mode 禁用、`Plan updated` ack、`tool_family=update_plan`、`explanation` 与 `plan` metadata。
- `completed`：`tool-runtime::native_overlay` 和 registration allowlist 改用 current `update_plan`；`lime-agent/src/native_tools/update_plan.rs` 只保留 `PlanUpdateAdapter` 临时 Aster `Tool` trait adapter，执行和权限都委托 `tool-runtime::update_plan`。`UpdatePlan` / `UpdatePlanTool` / `update_plan_tool` 只作为 lookup-only legacy alias，不作为 current 命名。
- `dead / guarded`：vendored `vendor/aster-rust/crates/aster/src/tools/plan_tool.rs` 已删除；`tools/mod.rs` 不再 `pub mod plan_tool`、不再 `pub use plan_tool`、不再 `UpdatePlanTool::new()` 默认注册；vendor 默认工具注册测试改为确认 Aster 默认工具面不含 `update_plan` / `UpdatePlan` / `UpdatePlanTool`。
- `Thread / Turn / Item`：归属 Turn tool lifecycle；`plan`、`explanation` 和 tool call id 属于 Item tool result metadata / plan item projection。真实消费链是 Aster reply loop 临时 registry -> `tool-runtime::update_plan` current executor -> App Server `runtime_backend::plan_events::plan_final_event_from_update_plan_result(...)` -> `plan.final` event -> 前端计划轨 / history projection 消费 `source=update_plan`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-update-plan-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime update_plan --lib -j 2` 通过，`5 passed`；`CARGO_TARGET_DIR="/tmp/lime-update-plan-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent update_plan --lib -j 2` 通过，`4 passed`；`CARGO_TARGET_DIR="/tmp/lime-update-plan-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 2` 通过，`4 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`119 passed`。
- `pending-validation`：`CARGO_TARGET_DIR="/tmp/lime-update-plan-target" cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core test_register --lib -j 2` 正在 vendor workspace 冷编译；完成后补记结果。`CARGO_TARGET_DIR="/tmp/lime-update-plan-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_overlay --lib -j 2` 因同 target 锁 / 链接等待过长中断；同新增 overlay 断言已由 `lime-agent update_plan` 过滤器覆盖。
- `classification`：`current` 是 `tool-runtime::update_plan`、native overlay `update_plan`、App Server `plan.final` projection 和 GUI current `source=update_plan` 消费链；`compat` 是 `PlanUpdateAdapter` Aster `Tool` wrapper 与 `UpdatePlan` / `UpdatePlanTool` lookup-only alias；`dead` 是 Aster vendor `UpdatePlanTool` 实现、vendor default registration 和非 Codex status alias 接受逻辑。
- `remaining`：Aster reply loop 仍通过 Aster `Tool` trait 触发 `update_plan`；后续 native tool execution 入口迁到 current `RuntimeToolExecutor` 后删除 `lime-agent/src/native_tools/update_plan.rs` wrapper。整体 Phase 6 约 `95%`，但 root `aster` dependency、provider/reply loop、Aster `SessionStore` / `Tool` trait 注册壳仍未清零。

### 2026-07-07：Batch B Codex-style view_image current owner

- `completed`：对照 `/Users/coso/Documents/dev/rust/codex/codex-rs/core/src/tools/handlers/view_image.rs` 与 `view_image_spec.rs`，Codex current 是 `view_image`，参数为 `path` 与可选 `detail: "high" | "original"`，输出是 model-visible image content；不继续沿用 Aster `ViewImageTool` 实现命名或 vendor media helper。
- `completed`：新增 `tool-runtime::view_image` current owner，承接 `RuntimeViewImageExecutor`、`runtime_view_image_executor_handle()`、`view_image_tool_definition()`、`check_runtime_view_image_permissions(...)`、`deny_unknown_fields` 输入解析、file URL / relative path 解析、50MB 上限、data URL 构造、token 估算、PNG/GIF/JPEG/WebP 头部尺寸解析和 `model_visible_image` / `image_url` metadata。
- `completed`：`tool-runtime::native_overlay` 和 registration allowlist 加入 current `view_image`；`lime-agent/src/native_tools/view_image.rs` 只保留 `ImageViewAdapter` 临时 Aster `Tool` trait adapter，执行和权限都委托 `tool-runtime::view_image`。`ViewImage` / `ViewImageTool` 只作为 lookup-only legacy alias，不作为 current 命名。
- `dead / guarded`：vendored `vendor/aster-rust/crates/aster/src/tools/view_image.rs` 已删除；`tools/mod.rs` 不再 `mod view_image`、不再 `pub use view_image`、不再 `ViewImageTool::new()` 默认注册；Aster 默认 `Agent::new()` 测试改为确认 `view_image` 不属于 vendor 默认工具面。
- `Thread / Turn / Item`：归属 Turn tool lifecycle；`image_url`、`mime_type`、`detail`、`dimensions`、`token_estimate` 属于 Item tool result metadata。真实消费链是 Aster reply loop 临时 registry -> `tool-runtime::view_image` current executor -> model-visible image content metadata -> GUI tool display / imported runtime event view already using current `view_image` key。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime view_image --lib -j 2` 通过，`3 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent view_image --lib -j 2` 通过，`4 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_overlay --lib -j 2` 通过，`6 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 2` 通过，`4 passed`；`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过。
- `validated`：`cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core test_register_default_tools --lib -j 2` 通过，`1 passed`；`cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core test_agent_has_tool_registry --lib -j 2` 通过，`1 passed`。
- `validated`：`npx vitest run "src/lib/api/agentTextNormalization.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`45 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`118 passed`。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过；`cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" --package aster-core -- --check` 通过；`npx prettier --check <本批文档/守卫写集>` 通过；`git diff --check -- <本批 Rust/守卫写集>` 通过。
- `classification`：`current` 是 `tool-runtime::view_image`、native overlay `view_image` 和 GUI/current catalog `view_image`；`compat` 是 `ImageViewAdapter` Aster `Tool` wrapper 与 `ViewImage` / `ViewImageTool` lookup-only alias；`dead` 是 Aster vendor `ViewImageTool` 实现、vendor media helper 依赖和 vendor 默认注册。
- `remaining`：Aster reply loop 仍通过 Aster `Tool` trait 触发 `view_image`；后续 native tool execution 入口迁到 current `RuntimeToolExecutor` 后删除 `lime-agent/src/native_tools/view_image.rs` wrapper。整体 Phase 6 约 `94%`，root `aster` dependency、provider/reply loop、Aster `SessionStore` / `Tool` trait 注册壳仍未清零。

### 2026-07-07：Batch B Codex-style sleep current owner

- `completed`：对照 `/Users/coso/Documents/dev/rust/codex/codex-rs/core/src/tools/handlers/sleep.rs`，Codex current 是 `clock.sleep` / `sleep`，参数只接受 `duration_ms`，上限 `12 * 60 * 60 * 1000`，不是 Aster `SleepTool` 的 proactive / Kairos 旧语义。
- `completed`：新增 `tool-runtime::sleep` current owner，承接 `RuntimeSleepExecutor`、`runtime_sleep_executor_handle()`、`sleep_tool_definition()`、`check_runtime_sleep_permissions(...)`、`deny_unknown_fields` 输入解析、elapsed/interrupted metadata 和 cancel token 中断。
- `completed`：`tool-runtime::native_overlay` 和 registration allowlist 加入 current `sleep`；`lime-agent/src/native_tools/sleep.rs` 只保留 `ClockSleepAdapter` 这个临时 Aster `Tool` trait adapter，执行和权限都委托 `tool-runtime::sleep`，不恢复 `SleepTool` 命名或旧语义。
- `completed`：Rust tool catalog 与前端 normalization / display / process summary 已消费 current `sleep` / `clock.sleep`；`SleepTool` 只保留为未映射 dead 名称的负向测试，不再被 GUI 当成 current 等待工具。
- `completed`：前端定向测试暴露 `ConfigTool`、`EnterWorktreeTool`、`ExitWorktreeTool`、`ScheduleCronTool`、`Cron*` 等 Aster-only 工具仍有正向展示断言；本批同步改为 dead / unmapped 预期，不为旧工具补回 current 文案。
- `dead / guarded`：vendored `vendor/aster-rust/crates/aster/src/tools/sleep_tool.rs` 保持删除，`tools/mod.rs` 不恢复 `pub mod sleep_tool` 或 `SleepTool::new()`；守卫禁止前端恢复 `sleeptool -> sleep` 映射。
- `Thread / Turn / Item`：归属 Turn tool lifecycle；`duration_ms`、`elapsed_ms`、`interrupted` 属于 Item tool result metadata。真实消费链是 Aster reply loop 临时 registry -> `tool-runtime::sleep` current executor -> GUI tool display / process summary。
- `known-gap`：Codex 完整语义包含“active turn 收到新输入时提前结束 sleep”。Lime 本批只接上 cancel token 中断；input queue activity signal 尚未接到 `RuntimeSleepExecutor`，必须在 Aster reply loop / Turn input queue 迁出时补齐，不能把当前骨架误报为完全等价 Codex。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime sleep --lib -j 2` 通过，`5 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 2` 通过，`4 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent sleep --lib -j 2` 通过，`2 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::catalog --lib -j 2` 通过，`14 passed`；`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过。
- `validated`：`npx vitest run "src/lib/api/agentTextNormalization.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`45 passed`；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`117 passed`。
- `validated`：`rustfmt --edition 2021 --check` 覆盖本批 Rust 写集通过；`npx prettier --check` 覆盖本批 TS / 文档写集通过；`git diff --check -- <本批写集>` 通过。
- `classification`：`current` 是 `tool-runtime::sleep`、tool catalog `sleep` 和 GUI display current key；`compat` 是 `ClockSleepAdapter` Aster `Tool` wrapper；`dead` 是 Aster `SleepTool` vendor 实现、旧 `SleepTool` alias 和前端正向展示映射。
- `remaining`：Aster reply loop 仍通过 Aster `Tool` trait 触发 `sleep`；后续 native tool execution 入口迁到 current `RuntimeToolExecutor` 后删除 `lime-agent/src/native_tools/sleep.rs` wrapper。整体 Phase 6 仍约 `93%`，root `aster` dependency、provider/reply loop、Aster `SessionStore` / `Tool` trait 注册壳未清零。

### 2026-07-07：Batch B Aster 默认工具注册面 allowlist 收缩

- `completed`：`tool-runtime::native_overlay` 新增 `runtime_native_tool_registration_allowlist()`，作为 Lime 当前 native tool 注册面的唯一 policy owner。该清单包含已迁 current executor / overlay 工具和仍待迁出的最小 Codex-first 注册面，不再允许 Lime 初始化时暴露 Aster 全量默认工具池。
- `completed`：vendored Aster `ToolRegistrationConfig` 新增 `allowed_tool_names` / `with_allowed_tool_names(...)`，`register_all_tools(...)` 对 Bash/Read/Write/Edit/Glob/Grep/Ask/Skill/Task/Plan/MCP/Agent 等注册点逐项执行 allowlist 判断；未被 allowlist 收录的 `Write`、`Edit`、`NotebookEdit`、`EnterWorktree`、`ExitWorktree`、`Workflow`、`Config`、`Sleep`、`Cron`、`RemoteTrigger` 等不再进入 Lime 生产 registry；LSP 已在 2026-07-08 后续刀中从 allowlist、vendor tools 和前端展示彻底删除。
- `completed`：`runtime_state_support::create_lime_tool_config()` 强制传入 `runtime_native_tool_registration_allowlist()`；Lime 不再以 `ToolRegistrationConfig::new()` 的 Aster 默认全量注册面初始化 Agent。
- `guarded`：`asterMigrationBoundary.test.ts` 扩展 native tool overlay 守卫，要求 `tool-runtime` 持有 registration allowlist，要求 Lime 初始化使用 `.with_allowed_tool_names(...)`，并要求 vendor `register_all_tools(...)` 保持 `config.allows_tool(...)` 分支。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 2` 通过，`4 passed`；`cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core test_register_all_tools_honors_allowed_tool_names --lib -j 2` 通过，`1 passed`；`cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core test_register_default_tools --lib -j 2` 通过，`1 passed`；`cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core test_register_all_tools_with_config --lib -j 2` 通过，`1 passed`；`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`116 passed`；`rustfmt --edition 2021 --check` 覆盖本批 Rust 写集通过；`npx prettier --check` 覆盖守卫和计划文档通过。
- `classification`：`current` 是 `tool-runtime::native_overlay` 的 registration allowlist；`compat blocker` 是 Aster `ToolRegistry` / `Tool` trait 仍服务未迁 reply loop；`dead / production-disabled` 是未进入 allowlist 的 Aster 默认工具注册面。
- `Thread / Turn / Item`：本批属于 Turn tool lifecycle / Item tool inventory 边界收口；真实消费链是 App Server `read_tool_inventory` -> GUI Harness runtime tool inventory，不再把 Aster 默认全量 registry 当作产品工具面。
- `remaining`：下一刀继续把 allowlist 中仍靠 Aster 实现的工具迁到 `tool-runtime` executor，或直接处理 provider/reply loop；这一步只收缩生产可见面，不代表 `aster.workspace = true` 可删除。

### 2026-07-07：Batch B image_task native executor current owner

- `completed`：新增 `tool-runtime::image_task` current owner，承接 `RuntimeImageTaskExecutor`、`runtime_image_task_executor_handle(...)`、`image_task_tool_definition()`、`check_runtime_image_task_permissions(...)`、App Server media task gateway trait、input schema、请求 DTO 构造、project root / session / thread / turn / storyboard 参数校验和 tool result metadata 投影。
- `completed`：`tool-runtime::image_task` 按 facade + `definition` / `executor` / `params` 拆分，避免继续向中心文件堆叠。
- `completed`：`lime-agent/src/native_tools/image_tasks.rs` 删除本地 `ImageTaskGateway` trait、`NativeToolResultProjection`、`ImageGenerationTool` 业务实现、`ImageToolInput`、schema 构造、参数解析、DTO 构造、project root 校验和 result projection，只保留 Aster `Tool` trait wrapper、runtime context 转换、Aster action scope -> current turn metadata 的兼容投影和 `RuntimeToolExecutionResult` / `RuntimeToolExecutionError` 到 Aster `ToolResult` / `ToolError` 的 DTO 适配。
- `completed`：`app-server/src/runtime_backend/image_tools.rs` 的 gateway trait 和 result projection 引用改为 `tool_runtime::image_task::{ImageTaskGateway, ImageTaskToolResultProjection}`；App Server image task 主链不再从 `lime-agent` Aster compat 边界拿 trait / projection。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tool-runtime/src/image_task*` 不含 `aster::` 且提供 current executor / permission owner / gateway trait / result projection，禁止 `lime-agent/src/native_tools/image_tasks.rs` 生产代码恢复 schema、DTO 构造、参数校验、project root 校验、tool result projection 或 gateway trait，并要求 App Server image gateway 从 `tool-runtime` 引用。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime image_task --lib -j 2` 通过，`3 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend::tests::image_tools --lib -j 2` 通过，`2 passed`；`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过。
- `blocked-validation`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent image_tasks --lib -j 2` 被并行 provider/reply 写集中的 `request_tool_policy/aster_reply_adapter/tests.rs` 类型不匹配阻塞：`ModelProviderProtocol` 传给了期望 `RuntimeProviderProtocol` 的字段；该文件不在本批写集，本批用 `lime-agent` production check 作为 wrapper 编译证据。
- `classification`：`current` 是 `tool-runtime::image_task` 与 App Server media task artifact 主链；`compat` 是 `lime-agent/src/native_tools/image_tasks.rs` 的 Aster `Tool` trait wrapper 和 Aster action scope -> current turn metadata 临时投影；`dead / guarded` 是 `lime-agent` 内部的 image task schema、参数解析、DTO 构造、project root 校验、metadata projection 和 gateway trait 第二份实现。
- `Thread / Turn / Item`：media task artifact 数据本体属于 App Server media task read model；tool call lifecycle 属于 Turn，image task result metadata 属于 Item tool evidence projection。真实消费链是 App Server media task artifact -> GUI image preview / workbench / Evidence tool event projection。
- `remaining`：Aster reply loop 仍通过 Aster `Tool` trait触发 image task tool；后续需要把 native tool call 执行入口迁到 current `RuntimeToolExecutor`，届时删除 `lime-agent/src/native_tools/image_tasks.rs` wrapper。

### 2026-07-07：Batch B memory_store native executor current owner

- `completed`：新增 `tool-runtime::memory_store` current owner，承接 `RuntimeMemoryStoreExecutor`、`runtime_memory_store_executor_handle(...)`、`memory_store_tool_definitions()`、`check_runtime_memory_store_permissions(...)`、App Server memory store gateway trait、input schema、请求 DTO 构造、路径权限校验、summary 和 metadata 构造。
- `completed`：`tool-runtime::memory_store` 按 facade + `definitions` / `executor` / `params` 拆分，单文件体量保持在 `500 LoC` 内，避免新 current owner 变成中心大文件。
- `completed`：`lime-agent/src/native_tools/memory_store.rs` 删除本地 `MemoryStoreGateway` trait、`MemoryListTool` / `MemoryReadTool` / `MemorySearchTool` / `MemoryAddNoteTool` 四套执行实现、root params 解析、path validation、metadata/output 构造和参数解析 helper，只保留 Aster `Tool` trait wrapper、runtime context 转换和 `RuntimeToolExecutionResult` / `RuntimeToolExecutionError` 到 Aster `ToolResult` / `ToolError` 的 DTO 适配。
- `completed`：`app-server/src/runtime_backend/memory_tools.rs` 的 gateway trait 引用改为 `tool_runtime::memory_store::MemoryStoreGateway`；App Server memory store 主链不再从 `lime-agent` Aster compat 边界拿 gateway trait。
- `completed`：`tool-runtime/Cargo.toml` 接管 `app-server-protocol.workspace = true` 与 `async-trait.workspace = true`。memory tools 的 DTO 与 gateway 依赖不再挂在 Aster compat wrapper 上。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tool-runtime/src/memory_store.rs` 不含 `aster::` 且提供 current executor / permission owner / gateway trait，禁止 `lime-agent/src/native_tools/memory_store.rs` 恢复 `MemoryStoreRootParams` / `MemoryStoreScope` / `MemoryStoreSearchMatchMode`、四个 memory tool struct、root params / path permission / metadata / 参数解析 helper，并要求 App Server gateway trait 从 `tool-runtime` 引用。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime memory_store --lib -j 2` 通过，`5 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent memory_store --lib -j 2` 通过，`2 passed`，仅有既有 `WorkspaceToolSurface` unused import warning；`cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server -j 2` 通过；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`114 passed`；`rustfmt --edition 2021 --check`、`npx prettier --check` 和 `git diff --check` 覆盖本批写集通过。
- `classification`：`current` 是 `tool-runtime::memory_store` 与 App Server memory store gateway trait；`compat` 是 `lime-agent/src/native_tools/memory_store.rs` 的 Aster `Tool` trait wrapper；`dead / guarded` 是 `lime-agent` 内部的 memory tool DTO 构造、路径权限、metadata/output 和 gateway trait 第二份实现。
- `Thread / Turn / Item`：memory store 数据本体属于 Thread / read model；tool call lifecycle 属于 Turn，memory read/search/add note 结果 metadata 属于 Item tool evidence projection。真实消费链是 App Server memory store -> native tool result metadata -> GUI / Evidence memory tool display。
- `remaining`：Aster reply loop 仍通过 Aster `Tool` trait触发 memory tools；后续需要把 native tool call 执行入口迁到 current `RuntimeToolExecutor`，届时删除 `lime-agent/src/native_tools/memory_store.rs` wrapper。

### 2026-07-07：Batch B skill_search native executor current owner

- `completed`：新增 `tool-runtime::skill_search` current owner，承接 `RuntimeSkillSearchExecutor`、`runtime_skill_search_executor_handle()`、`skill_search_tool_definition()`、`check_runtime_skill_search_permissions(...)`、输入解析、workspace / project root 解析、Skills metadata search、输出 JSON 与 evidence metadata 构造。
- `completed`：`lime-agent/src/tools/skill_search_tool.rs` 删除本地 `lime_skills` 搜索调用、输入解析、turn metadata path 解析、输出 JSON 和 metadata 构造逻辑，只保留 Aster `Tool` trait wrapper、runtime context 转换和 `RuntimeToolExecutionResult` / `RuntimeToolExecutionError` 到 Aster `ToolResult` / `ToolError` 的 DTO 适配。
- `completed`：`tool-runtime/Cargo.toml` 接管 `lime-skills.workspace = true`。`skill_search` 的实现依赖不再直接挂在 Aster compat wrapper 上。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tool-runtime/src/skill_search.rs` 不含 `aster::` 且提供 current executor / permission owner，禁止 `lime-agent/src/tools/skill_search_tool.rs` 恢复 `build_agent_skill_snapshot_from_workspace`、`search_agent_skills`、input parsing、workspace parsing、output / metadata 构造规则。
- `validated`：`rustfmt --edition 2021 --check` 覆盖本批 Rust 写集通过；`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime skill_search --lib -j 2` 通过，`3 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_search_tool --lib -j 2` 通过，`1 passed`，仅有既有 `WorkspaceToolSurface` unused import warning；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`113 passed`；`npx prettier --check` 覆盖守卫和计划文档通过。
- `partial-blocked-validation`：补充 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 连续等待并行 `app-server` build / test 持有的 Cargo build directory lock，已取消；本批以 `tool-runtime` / `lime-agent` 定向 lib test 作为 Rust 编译证据。
- `classification`：`current` 是 `tool-runtime::skill_search`；`compat` 是 `lime-agent/src/tools/skill_search_tool.rs` 的 Aster `Tool` trait wrapper；`dead / guarded` 是 `lime-agent` 内部的 skill metadata search、workspace path 解析、output / metadata 第二份实现。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item tool output metadata；真实消费链是 Agent Skills selector evidence -> App Server evidence provider / GUI tool event projection，执行入口仍经 Aster reply loop native tool registry -> current executor。
- `remaining`：Aster reply loop 仍通过 Aster `Tool` trait触发 `skill_search`；后续需要把 native tool call 执行入口迁到 current `RuntimeToolExecutor`，届时删除 Aster wrapper。

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

- `completed`：新增 `tool-runtime::native_overlay`，当时承接 Lime-owned native tool overlay 清单：`Write`、`Edit`、`apply_patch`、`skill_search`、`Skill`、`WebFetch`、`WebSearch`。该模块不依赖 Aster，作为 Tool lifecycle / inventory projection 的 current owner；其中 `Write` / `Edit` 已被 2026-07-07 后续 `Aster Write/Edit production disable` 覆盖，不再属于 current production overlay。
- `completed`：`native_tools/runtime_overlay.rs` 不再硬编码“覆盖哪些 Lime 工具”的清单，只按 `runtime_native_tool_overlay_tools()` 把 current overlay 落到临时 Aster `ToolRegistry`；Aster `WriteTool` / `EditTool` 曾只留在这个 compat adapter，但已被后续切片从 Lime production registry 移除。
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
- `remaining`：Aster reply loop 仍实际通过 Aster `Tool` trait 执行这些工具；下一刀应继续把 native tool 调用从 Aster reply loop registry 壳迁到 `tool-runtime` executor，或回到 provider/reply loop 主 blocker。

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

### 2026-07-07：Batch C vendor session cleanup/statistics public wrapper 删除

- `completed`：删除 `vendor/aster-rust/crates/aster/src/session/cleanup.rs` 与 `session/statistics.rs`，并从 `session/mod.rs` 移除对应 `mod` 与 public re-export。
- `rationale`：`cleanup_expired_data` / `force_cleanup` / `schedule_cleanup` / `CleanupStats` 与 `calculate_statistics` / `generate_report` / `get_all_statistics` / `SessionStatistics` / `SessionSummary` 没有 Lime current 消费，也没有 vendor 生产内部调用；它们只是 Aster session public convenience surface，不应继续作为 Lime 迁移期历史包袱。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 新增 `已删除的 Aster vendor session public wrappers 不得恢复`，要求 `session/cleanup.rs`、`session/statistics.rs`、`mod cleanup`、`mod statistics` 和旧 public API re-export 保持删除态。
- `verified`：`cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" --package aster-core -- --check` 通过。
- `verified`：`cargo check --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core -j 2` 通过。
- `verified`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过，证明 Lime 下游 compat 编译仍可用。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`116 passed`。
- `verified`：`npx prettier --check ...` 与 scoped `git diff --check` 通过。
- `classification`：`dead / deleted / forbidden-to-restore` 是 vendor session cleanup/statistics wrapper；`current` 没有新增，因为这不是 Lime 当前产品主链能力；如后续确有统计/清理产品需求，只能进入 App Server / thread-store / repository current owner。
- `remaining`：这一步不改变 Phase 6 root blocker。`SessionStore` trait、Aster `Session` / `Message` DTO、runtime `ThreadRuntimeStore`、provider/reply loop 与 native tool registry 壳仍持有 root `aster` dependency。

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
- `superseded`：这里记录的 `provider_stream_idle` 首事件前超时失败已在后续 Batch A/D reply stream state 骨架中修复；测试现在跟随 `agent-runtime::reply_stream::MIN_PROVIDER_STREAM_FIRST_EVENT_TIMEOUT`，`request_tool_policy --lib` 过滤集已恢复 `68 passed`。
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
- `completed`：Aster `SessionStore::get_insights(...)` 和 `SessionInsights` DTO 已删除；insights 规则只保留在 `thread-store::session_insights` current owner，不再通过 `aster_trait.rs` 或 `session_record_sql.rs` 回填 compat DTO。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 session insights 守卫，要求 current owner 不含 Aster，要求 SQL 聚合走 `session_record_sql.rs`，并禁止 `aster_trait.rs` 恢复 `COUNT/SUM` SQL 或 `total_sessions as usize` 转换。
- `verified`：`rustfmt --edition 2021 --check "lime-rs/crates/thread-store/src/session_insights.rs" "lime-rs/crates/thread-store/src/lib.rs" "lime-rs/crates/agent/src/session_record_sql.rs" "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs"` 通过。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-session-insights-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store session_insights --lib -j 2` 通过，`2 passed`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" -t "session insights SQL" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`1 passed`。
- `verified`：`CARGO_TARGET_DIR="/tmp/lime-codex-memory-agent-target" CARGO_INCREMENTAL=0 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_record_sql --lib -j 2` 通过，`1 passed`；仅剩既有 `WorkspaceToolSurface` unused import warning。
- `verified`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 与 `git diff --check` 通过。
- `classification`：`current` 是 `thread-store::session_insights` 的 insights read model projection；`dead / guarded` 是 Aster `SessionInsights` DTO、Aster `SessionStore::get_insights`、`session_record_sql.rs::load_session_insights_record(...)` 和 Aster trait adapter 内直接维护 session insights SQL 聚合的旧路径。
- `remaining`：Aster `SessionStore` trait 仍要求 `get_insights` 返回 Aster DTO，因此 adapter 暂不能删除；最终删除条件仍是 Aster `SessionStore` trait 和 provider/reply loop 退出。
- `next`：继续 Batch C 时优先拆 `legacy_conversation` 的 content_json / visibility 规则，或收缩 `aster_trait.rs` 剩余写入/导入导出方法。

### 2026-07-06：Batch C session memory disabled stub current owner

- `superseded`：2026-07-07 已按“无客户，不保兼容”把该 disabled stub 继续删除；此段只保留为历史 checkpoint，不再代表 current 落点。
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

### 2026-07-07：Batch C session memory compat surface deletion

- `completed`：删除 Aster `SessionStore` trait 中 `commit_session` / `search_memories` / `retrieve_context_memories` / `memory_stats` / `memory_health` 五个 memory 方法；同步删除 `NoopSessionStore`、`SessionStorage`、hooks / skills / agent tests / Lime `LimeSessionStore` 中的对应实现。
- `completed`：删除 Aster reply loop 的自动 session memory 注入，`Agent::prepare_reply_context` 只记录 `memory_injection=removed=lime_memory_tools` trace；记忆召回不再通过 Aster `SessionManager::retrieve_context_memories(...)` 隐式拼进 system prompt。
- `deleted`：删除 `lime-rs/vendor/aster-rust/crates/aster/src/session/{memory.rs,memory_deduplicator.rs,memory_extractor.rs,memory_pipeline.rs,memory_repository.rs,memory_retriever.rs}`，并从 `session/mod.rs`、`session/session_manager.rs` 新库建表和 schema 迁移中移除 memory tables / FTS / triggers / indexes。
- `deleted`：删除 `lime-rs/crates/agent/src/aster_session_store/memory_stub.rs` 与 `lime-rs/crates/thread-store/src/memory_stub.rs`；`thread-store` 不再承接“disabled memory stub”这种仅为 Aster trait 续命的 current owner。
- `guarded`：`asterMigrationBoundary.test.ts` 的 session memory 守卫改为删除态：要求 Lime / vendor memory stub 源文件不存在，vendor memory 子系统源文件不存在，Aster `SessionStore` / `SessionManager` / `Agent` 生产代码不得恢复 memory trait、memory repository 或自动注入。
- `classification`：`current` 是 App Server memory store + `tool-runtime::memory_store` native tool 执行链；`dead / deleted / guarded` 是 Aster session memory trait、自动 system prompt 注入、disabled stub、vendor memory pipeline/repository/retriever/schema；本批不保留 `compat`。
- `verified`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过；首次启动时等到并行进程释放 build directory 文件锁后完成。
- `verified`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server -j 2` 通过，证明 App Server current 后端主链不再依赖被删除的 Aster session memory trait / schema。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent aster_session_store --lib -j 2` 通过，`15 passed`；顺手删除 `agent_tools/execution/tests.rs` 的既有 `WorkspaceToolSurface` unused import warning 后复跑无 warning。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p thread-store --lib -j 2` 通过，`27 passed`。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts"` 通过，`115 passed`；`rustfmt --edition 2021 --check`、`npx prettier --check` 和 `git diff --check` 均通过。
- `remaining`：这只收掉 session memory 一条假兼容；Phase 6 仍被 provider/reply loop、Aster `Message` / `AgentEvent`、Aster native `Tool` trait 注册壳、runtime store persistence 和剩余 `SessionStore` DTO adapter 阻塞。

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
- `superseded`：本段当时把 Aster thread/item 遍历、Aster item payload -> conversation record、transcript item 构造和 `TranscriptMessage` 判定留在 `runtime_conversation_aster_adapter.rs`；2026-07-11 后续刀已把 `TranscriptItemRecordInput`、record 构造、sequence、transcript 判定、upsert/delete helper、conversation read/count traversal 和 append sequence helper 前移到 `thread-store`，Aster item -> current record lowering 统一停留在 `runtime_store_aster_adapter.rs`，`build_aster_transcript_item(...)`、`is_aster_transcript_item_payload(...)`、`collect_conversation_records_from_threads(...)` 和 `conversation_record_from_aster_item(...)` 已删除并由守卫禁止恢复。
- `completed`：`session_runtime_conversation_query.rs` 不再 import Aster `ThreadRuntimeStore`，也不再 import / match `ItemRuntimePayload`；GUI runtime detail conversation read model 只调用 `collect_conversation_records_from_aster_runtime_store(...)` 后消费 current `ConversationMessageRecord`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 Aster conversation payload 三分支只能通过 `runtime_store_aster_adapter.rs` 的 durable source lowering 进入 current records，禁止 `session_runtime_conversation_query.rs` 与 `aster_session_store/runtime_conversation.rs` 复制 payload 映射；同时保留 `thread-store::conversation_transcript` 与 `thread-store::runtime_store` 的 current owner 断言。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent` 通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_conversation_aster_adapter --lib -j 2`，3 个 adapter 单测通过；仅剩既有 / 并行写集 `WorkspaceToolSurface` unused import warning 与 `is_turn_auto_compact_due` dead code warning。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent session_runtime_conversation_query --lib -j 2`，2 个 runtime detail conversation read model 单测通过；同一既有 warning。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，92 个治理测试通过。
- `classification`：`current` 是 `thread-store::conversation_transcript` 的 record / selection / transcript item record 构造规则、`thread-store::runtime_store` 的 read/write skeleton、read/count traversal 和 append sequence helper、`agent-runtime::runtime_conversation` 的 visibility/window projector 与 `session_runtime_conversation_query.rs` 的 GUI runtime detail read model；`compat` 是 `runtime_store_aster_adapter.rs` 的 Aster durable source lowering 和 `runtime_conversation_aster_adapter.rs` 的 Aster `Message` -> current transcript item record lowering；`dead / guarded` 是 runtime detail query 与 `aster_session_store/runtime_conversation.rs` 内重复匹配 Aster conversation payload、直接遍历 Aster thread/item、直接构造 Aster transcript item 或直接持有 Aster item write 规则的旧路径。
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
- `classification`：`current` 是 `thread-store::conversation_transcript` 的 runtime conversation source/projector、transcript selection 和 transcript item record 构造规则，以及 `thread-store::runtime_store` 的 item write skeleton；`compat` 是 `runtime_store_aster_adapter.rs` 的 Aster durable source lowering 与 `aster_session_store/runtime_conversation.rs` 的 Aster `Conversation` 转换；`dead / guarded` 是 runtime conversation 调用点直接构造 `ConversationMessageRecord`、复制 payload 映射、自行维护 transcript/projection 选择规则或直接写 Aster item 的旧路径。
- `remaining`：Aster `ThreadRuntimeStore`、`ThreadRuntime`、`TurnRuntime`、`ItemRuntime` 仍是 session/thread store 兼容边界；下一刀应继续把 runtime store source/record contract 迁入 `thread-store`，或在 provider/reply 热区空闲后处理 `Agent::reply` / provider trait。

### 2026-07-06：Batch C/D runtime queue Aster store adapter 隔离

- `completed`：新增 `runtime_queue_aster_adapter.rs`，作为 Aster `ThreadRuntimeStore` / `QueuedTurnRuntime` 到 `agent-runtime::runtime_queue::RuntimeQueueService` 的单一 compat 边界。
- `completed`：`runtime_support.rs` 删除 `runtime_queued_turn_from_aster(...)`、`aster_queued_turn_from_runtime(...)` 与 `impl RuntimeQueueStore for AsterRuntimeQueueStoreAdapter`，只通过 `runtime_queue_service_from_store(...)` 接入 current queue service。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 Aster queued-turn DTO 转换只能存在于 `runtime_queue_aster_adapter.rs`，禁止 `runtime_support.rs` 重新承接 queue adapter / conversion 规则。
- `superseded`：2026-07-11 后续一刀已删除独立 `runtime_queue_aster_adapter.rs`，并把 Aster queued-turn DTO lowering 折叠到 `runtime_store_aster_adapter.rs`；守卫现要求该独立文件不得恢复，`runtime_support.rs` 只能通过 `require_aster_runtime_queue_store()` 获取 current `RuntimeQueueService`。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime runtime_queue --lib`，6 个 current queue service 单测通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_queue --lib -j 2`，测试过滤无匹配但完成 `lime-agent` test build；仅剩既有 / 并行写集 `WorkspaceToolSurface` 与 `RuntimeToolExecutionError` unused import warning。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，89 个治理测试通过。
- `classification`：`current` 是 `agent-runtime::runtime_queue` queue DTO/store/gate/service；`compat` 是 `runtime_store_aster_adapter.rs` 的 Aster store DTO 转换；`dead / guarded` 是独立 `runtime_queue_aster_adapter.rs`、`runtime_support.rs` 直接维护 Aster queued-turn conversion 和 queue store adapter 的旧路径。
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
- `superseded`：当时因 Aster `Agent::reply` 仍走 Aster registry，暂未删除 `vendor/aster-rust/crates/aster/src/tools/web.rs`；该结论已被 `2026-07-07：Batch B WebFetch/WebSearch vendor wrapper 删除` 取代，WebFetch/WebSearch 的短期 `Tool` 接线已迁到 Lime `native_tools/web_retrieval.rs`。

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
- `classification`：`current` 是 `tool-runtime::web_fetch` / `tool-runtime::web_search` executor；当时的 `compat` 是 vendored Aster `WebFetchTool` / `WebSearchTool` 的 `Tool` trait adapter；`dead / deleted` 是 vendored WebFetch/WebSearch fetch/search/provider/cache/content 重复实现与 `web_fetch_content.rs`；`compat-blocker` 仍是未迁出的 Aster `Agent::reply` native tool registry 注册面。
- `superseded`：vendored Aster `WebFetchTool` / `WebSearchTool` adapter 已在 2026-07-07 后续切片删除；当前剩余 blocker 是 Lime 侧临时 Aster `Tool` 接线和未迁出的 reply loop。

### 2026-07-07：Batch B WebFetch/WebSearch vendor wrapper 删除

- `completed`：按“无客户，不保兼容”继续清理已迁能力，删除 `vendor/aster-rust/crates/aster/src/tools/web.rs`，并从 `vendor/aster-rust/crates/aster/src/tools/mod.rs` 移除 `pub mod web`、`pub use web::{...}` 和默认 `WebFetchTool` / `WebSearchTool` 注册。vendored Aster 不再持有 WebFetch/WebSearch 的 Aster `Tool` wrapper。
- `completed`：新增 `lime-agent/src/native_tools/web_retrieval.rs`，只保留当前 Aster reply loop 尚需的最薄 `Tool` trait adapter；执行、schema、权限预批准 host、结果 metadata 均委托 `tool-runtime::web_fetch` / `tool-runtime::web_search` current owner，不迁移 `WebCache` / `clear_web_caches` / `get_web_cache_stats` 历史 API。
- `completed`：`tool-runtime::native_overlay` 的 current overlay 清单加入 `WebFetch` / `WebSearch`，`native_tools/runtime_overlay.rs` 由 Lime current overlay 明确注册这两个工具；GUI / App Server tool inventory 继续通过 current overlay 标记 `current_surface`，不再靠 vendor Aster 默认注册暗中暴露。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 将 Web 工具守卫从“vendor 只能委托”改为“vendor 必须保持删除”；要求 Lime adapter 只调用 `runtime_web_fetch_executor_handle` / `runtime_web_search_executor_handle`，禁止恢复抓取、搜索 provider、缓存或内容清洗重复实现。
- `verified`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent -j 2` 通过。
- `verified`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server -j 2` 通过，证明 App Server 后端编译继续消费 current tool inventory / runtime 边界。
- `verified`：`cargo check --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core -j 2` 通过；首次执行因本机磁盘仅剩约 `1.2GiB` 在 `lime-rs/target/debug/incremental` 写入失败，清理可重建增量缓存后重跑通过。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 2` 通过，`3 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent web_retrieval --lib -j 2` 通过，`9 passed`。
- `verified`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent test_aster_state_init --lib -j 2` 通过，证明 Lime runtime 初始化后仍由 current overlay 暴露 `WebFetch` / `WebSearch`。
- `verified`：`cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core test_register_default_tools --lib -j 2` 通过，证明 vendor 默认工具注册不再需要 WebFetch/WebSearch。
- `verified`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`115 passed`。
- `verified`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package tool-runtime -- --check`、`cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" --package aster-core -- --check`、`npx prettier --check ...` 与 scoped `git diff --check` 通过。
- `classification`：`current` 是 `tool-runtime::web_fetch` / `tool-runtime::web_search` executor 与 `tool-runtime::native_overlay` current surface；`compat` 是 `lime-agent/src/native_tools/web_retrieval.rs` 的 Aster `Tool` trait 接线；`dead / deleted` 是 vendored Aster `tools/web.rs`、vendor Web tool re-export、默认注册和 `WebCache` 历史 API。
- `remaining`：这一步已经收掉 Web vendor surface，但仍没有迁出 `Agent::reply` / Aster `Message` / provider trait / session store adapter；root `aster` dependency 仍不能删除。下一刀应继续处理 provider/reply loop 或把剩余 native tool registry 执行从 Aster `Tool` trait 中迁出。

### 2026-07-05：Batch A/D reply stream current event boundary 收窄

- `completed`：`agent_reply_stream.rs` 主循环只消费 `RuntimeReplyStreamEvent` / `RuntimeAgentEvent`，不再直接读取 `AsterAgentEvent`，也不再持有 `RuntimeEventProjector`。
- `completed`：Aster event projection、auto-compaction projection 与 inline provider error suppression 已收回 `aster_reply_adapter.rs` / `aster_event_adapter.rs` compat 边界；`agent_reply_stream.rs` 继续负责 current event 流控、provider trace metadata 补齐、web retrieval synthesis cutover 与 artifact event emission。
- `guarded`：`src/lib/governance/asterMigrationBoundary.test.ts` 禁止 `agent_reply_stream.rs` 恢复 `RuntimeEventProjector`、`AsterAgentEvent`、`project_aster_runtime_event`、`project_aster_auto_compaction_event`、`extract_inline_agent_provider_error` 或 `runtime_event_projector.project`，并要求 `aster_reply_adapter.rs` 持有 `RuntimeReplyStreamEvent`、`project_aster_reply_stream`、`AsterEventProjector::new` 与 `SuppressedInlineProviderError`。
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

### 2026-07-07：Batch A/D provider first-event guard 与 idle retry 验证收口

- `completed`：`agent_reply_stream.rs` 已区分首个 stream item 前的 Aster compat 准备窗口与首 item 之后的 provider idle 窗口。首事件前通过 `agent-runtime::reply_stream::RuntimeReplyStreamState::next_timeout(...)` 提供最小 `5s` first-event guard，避免把 Aster `prepare_reply_context` / prompt / tool surface 首 poll 成本误判成 provider 首事件缺失；首事件后继续使用配置的 `provider_stream_idle_timeout`。
- `completed`：`provider_stream_idle` fixture 继续使用 `200ms` idle timeout 验证 provider 已输出部分文本后的尾部 idle retry；首事件前 fail-closed fixture 的外层 timeout 改为跟随 `MIN_PROVIDER_STREAM_FIRST_EVENT_TIMEOUT`，不再用过期 `3s` 上限误判 current first-event guard。
- `guarded by behavior`：`request_tool_policy --lib` 默认并行过滤集已覆盖此前只在并行测试下暴露的 flake：单测 / 单线程通过但并行 68 tests 失败的路径现在稳定 green。
- `Thread / Turn / Item`：归属 Turn provider/reply execution guard。Codex 对照是 Turn runtime 区分 backend 启动 / 首事件观察 / 后续 stream idle；Lime 当前仍经 Aster compat stream，但 guard owner 在 `agent_reply_stream.rs` current 主循环，不下沉回 vendored Aster。
- `classification`：`current` 是 `agent_reply_stream.rs` 的 first-event guard 与 post-first-event idle guard；`compat` 仍是 `aster_reply_backend_adapter.rs` / `aster_reply_stream_adapter.rs` 产生 Aster source stream；`dead / guarded` 是把 provider idle retry 失败继续解释成测试可忽略 flake，或把超时处理下沉到 Aster vendor。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package model-provider --package lime-agent -- --check` 通过。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-phase6-request-policy-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib` 通过，`68 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-phase6-request-policy-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent credential_bridge --lib` 通过，`27 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-phase6-request-policy-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib` 通过，`1 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-phase6-request-policy-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib` 通过，`15 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 后续复跑通过，`122 passed`。
- `validated`：`rustfmt --edition 2021 --check` 覆盖本刀 Rust 写集通过；scoped `git diff --check` 通过。
- `remaining`：这一步不删除 root `aster` dependency。`Agent::reply` / `Agent::reply_with_provider`、Aster `Message`、Aster `AgentEvent`、Aster provider trait object、native `Tool` trait 注册壳与 session/thread store adapter 仍是 Phase 6 blocker。

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

### 2026-07-07：Batch B native tool registration plan 上提到 tool-runtime

- `completed`：`tool-runtime::native_overlay` 新增 不依赖 Aster `RuntimeNativeToolRegistration` / `RuntimeNativeToolRegistrationOwner`，把 overlay tool 的注册名、owner 与 backing dispatcher 关系固化在 current owner。除 `Skill` 仍是 skill gate overlay 外，`view_image`、`apply_patch`、`skill_search`、`sleep`、`update_plan`、`WebFetch`、`WebSearch` 都必须由 `tool-runtime::native_dispatch` backing。
- `completed`：`native_tools/runtime_overlay.rs` 改为遍历 `runtime_native_tool_overlay_registrations()`，再把短期 Aster `Tool` wrapper 注册进 Aster `ToolRegistry`。Aster 侧仍保留工厂 switch，但 switch 的输入已经是 current registration plan，不再是它自己的注册事实源。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 current owner 暴露 registration plan，并要求 Aster runtime overlay 消费 `runtime_native_tool_overlay_registrations()`；同时禁止恢复 `for overlay_tool in runtime_native_tool_overlay_tools()` 作为注册循环。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item tool inventory。Codex 对照是 core `ToolRegistry` / `ToolRouter` 先计划 runtime/spec/exposure，再 dispatch；Lime 当前仍因 Aster reply loop 未迁出而通过 Aster `Tool` trait 落地，但 registration plan 已上提到 `tool-runtime`。
- `classification`：`current` 是 `tool-runtime::native_overlay::RuntimeNativeToolRegistration` 和 `tool-runtime::native_dispatch`；`compat` 是 `native_tools/runtime_overlay.rs` 的 Aster `ToolRegistry` 注册壳与各 wrapper；`dead / guarded` 是把 Aster overlay 循环继续作为注册事实源，或恢复已删除的 vendor/default tool 注册面。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-phase6-tool-overlay-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib` 通过，`6 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-phase6-tool-overlay-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_overlay --lib` 通过，`8 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`121 passed`。
- `validated`：`npx prettier --check "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "src/lib/governance/asterMigrationBoundary.test.ts"` 通过；scoped `git diff --check` 通过。`priority-tracking-plan.md` 未做全文件 Prettier，避免重排并行历史段落。
- `remaining`：这一步没有删除 root `aster` dependency。Aster `Agent::reply` / `Agent::reply_with_provider`、Aster `Message`、Aster `AgentEvent`、provider trait object、Aster `Tool` trait wrapper 执行壳、`SessionStore` / `ThreadRuntimeStore` adapter 仍是 Phase 6 blocker。下一刀优先继续把 Aster reply loop native tool execution 从 `Tool` trait wrapper 迁到 current Turn executor，或回到 provider/reply loop 最大 blocker。

### 2026-07-07：Batch B stateless native tool surface metadata 上提

- `completed`：`tool-runtime::native_overlay` 新增 `RuntimeNativeToolSurface`，承接 stateless overlay tool 的 `RuntimeToolDefinition`、lookup-only aliases 与 retry override。`Skill` 仍是 skill gate overlay，不伪装成 `native_dispatch` surface。
- `completed`：`runtime_tool_bridge.rs` 新增 `runtime_native_tool_surface_ref(...)` 与 `runtime_native_tool_options(...)`，作为临时 Aster wrapper 读取 current surface 的唯一入口。
- `completed`：`sleep`、`view_image`、`update_plan`、`WebFetch`、`WebSearch`、`apply_patch`、`skill_search` wrapper 的 production path 不再直接调用各自 `*_tool_definition()`，也不再直接持有 `CLOCK_SLEEP_TOOL_NAME`、`VIEW_IMAGE_LEGACY_ALIASES`、`UPDATE_PLAN_LEGACY_ALIASES`、`ApplyPatchTool`、`SkillSearchTool` 等模型可见 alias 事实源；权限检查与执行仍委托 current executor。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 stateless wrapper surface guard，要求这些 wrapper 必须消费 `runtime_native_tool_surface_ref(...)`，并禁止恢复 wrapper 级 definition/alias source。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item tool inventory。Codex 对照是 tool router 先从 current runtime/spec plan 生成模型可见 spec，再执行 dispatch；Lime 当前仍通过 Aster `Tool` trait 落地，但 model-visible surface 已不再由 wrapper 自持。
- `classification`：`current` 是 `tool-runtime::native_overlay::RuntimeNativeToolSurface`；`compat` 是 `runtime_tool_bridge.rs` 的 surface ref cache 和 Aster `Tool` wrapper；`dead / guarded` 是 stateless wrapper 重新持有 `*_tool_definition()` / legacy alias 常量作为 surface 事实源。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-phase6-tool-overlay-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib` 通过，`8 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-phase6-tool-overlay-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent native_tools --lib` 通过，`23 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-phase6-tool-overlay-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent apply_patch_tool --lib` 通过，`3 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-phase6-tool-overlay-target" CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_search_tool --lib` 通过，`1 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`122 passed`。
- `remaining`：这一步继续削薄 Aster `Tool` wrapper，但没有删除 wrapper 执行壳。root `aster` dependency、Aster `Agent::reply` / `Message` / `AgentEvent` / provider trait、Aster `Tool` trait wrapper execution、`SessionStore` / `ThreadRuntimeStore` adapter 仍是 Phase 6 blocker。

### 2026-07-08：Batch B native tool install plan 骨架

- `completed`：`tool-runtime::native_overlay` 新增 `RuntimeNativeToolInstallStep` 与 `runtime_native_tool_install_plan()`，把已迁 overlay tool 的安装顺序和 registration contract 固定在 current owner；plan 与 `runtime_native_tool_overlay_registrations()` / `runtime_native_tool_overlay_tool_names()` 保持一致。
- `completed`：`native_tools/runtime_overlay.rs::configure_lime_native_tool_overlay(...)` 现在只遍历 `runtime_native_tool_install_plan()` 并调用 `register_runtime_native_tool_overlay(...)`；Aster overlay 文件不再在主安装循环里遍历 registration plan 后本地 `match registration.tool()` 做注册决策。
- `completed`：`agent_tools/tool_inventory_runtime_adapter.rs` 的 GUI / Evidence inventory seed 也改为消费 `runtime_native_tool_install_plan()` 判定 `current_surface`，不再直接读取 overlay name slice；install plan 现在同时驱动临时 Aster 注册和 current read model 分类。
- `compat`：`create_runtime_native_tool(step)` 仍在 `native_tools/runtime_overlay.rs` 内把 current install step 映射为临时 Aster `Tool` trait wrapper；这是 reply loop 尚未迁出 Aster 前的最后工厂适配，不是 current owner。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 current owner 暴露 `RuntimeNativeToolInstallStep` / `runtime_native_tool_install_plan()`，要求 Aster overlay 和 tool inventory adapter 消费 install plan，并禁止恢复 `for registration in runtime_native_tool_overlay_registrations()` / `match registration.tool()` 作为主安装循环。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item tool inventory。Codex 对照是 Tool spec/runtime/exposure 先由 current registry/router 计划，再由 runtime dispatch；Lime 当前仍通过 Aster `ToolRegistry` 落地，但安装计划和模型可见 surface 已归属 `tool-runtime`。
- `classification`：`current` 是 `tool-runtime::native_overlay::RuntimeNativeToolInstallStep`、`RuntimeNativeToolRegistration`、`RuntimeNativeToolSurface` 与 `tool-runtime::native_dispatch`；`compat` 是 `native_tools/runtime_overlay.rs` 的 Aster `ToolRegistry` 执行壳和 `create_runtime_native_tool(...)` 工厂；`dead / guarded` 是 Aster overlay 主循环重新成为注册事实源。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 2` 通过，`9 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_overlay --lib -j 2` 通过，`8 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`。
- `remaining`：这一步仍未删除 Aster `Tool` trait wrapper、Aster `ToolRegistry`、root `aster` dependency 或 `lime-agent` 的 `aster.workspace = true`。下一刀继续优先迁出 reply loop native tool execution 到 current Turn executor，或回到 provider/reply loop 的 `Agent::reply` / `Message` / `AgentEvent` blocker。整体目标完成度仍约 `95%`。

### 2026-07-08：Batch B gateway-backed tool definitions 同源

- `completed`：`lime-agent/src/native_tools/memory_store.rs` 和 `lime-agent/src/native_tools/image_tasks.rs` 现在先构造 per-gateway `NativeDispatch`，再从同一个 dispatch 读取 `definitions()` 并创建临时 `RuntimeDefinitionToolAdapter`；wrapper 不再直接调用 `memory_store_tool_definitions()` 或 `image_task_tool_definition()` 作为模型可见 surface 事实源。
- `codex alignment`：对齐 Codex `tools` crate 中 tool spec / executor 由统一 tool runtime 组合后交给 turn lifecycle 的方式；Lime 当前仍因 Aster reply loop 未迁出而需要 Aster `Tool` trait wrapper，但 definition 与 executor 已收敛到 `tool-runtime::native_dispatch`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 memory/image wrapper production source 包含 `NativeDispatch::builder()`、`with_*_gateway(...)` 和 `.definitions()`，并禁止恢复 `memory_store_tool_definitions`、`image_task_tool_definition`、`runtime_memory_store_executor_handle`、`runtime_image_task_executor_handle` 的 wrapper 级直连。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item tool inventory。memory store 继续由 App Server memory store + `tool-runtime::memory_store` 消费；image task 继续由 App Server media task artifact / GUI image preview / Evidence 消费。
- `classification`：`current` 是 `tool-runtime::native_dispatch`、`tool-runtime::memory_store`、`tool-runtime::image_task`；`compat` 是 `RuntimeDefinitionToolAdapter` 与 Aster `Tool` trait 桥接；`dead / guarded` 是 gateway-backed wrapper 重新直接持有 definition helper 或 executor handle。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package tool-runtime -- --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent memory_store --lib -j 2` 通过，`2 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent image_tasks --lib -j 2` 通过，`2 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`123 passed`。
- `remaining`：这一步继续削薄 gateway-backed Aster wrapper，但仍未删除 Aster `ToolRegistry` / `Tool` trait、root `aster` dependency 或 `lime-agent` 的 `aster.workspace = true`。下一刀仍应优先迁出 reply loop native tool execution 到 current Turn executor，或回到 provider/reply loop 的 `Agent::reply` / `Message` / `AgentEvent` blocker。整体目标完成度仍约 `95%`。

### 2026-07-08：Batch B tool_search current executor skeleton

- `completed`：Codex 对照确认 `/Users/coso/Documents/dev/rust/codex/codex-rs` 已有 `tool_search` deferred tool discovery：`codex-rs/tools/src/tool_discovery.rs` 定义 `TOOL_SEARCH_TOOL_NAME = "tool_search"`，`core/src/tools/handlers/tool_search.rs` 通过 `ToolSearchHandler` 搜索 deferred tools，`core/src/tools/spec_plan.rs` 只在存在 deferred runtime 时追加 tool_search executor。
- `completed`：新增 `tool-runtime::tool_search` current executor 骨架，承接 `ToolSearchGateway`、`RuntimeToolSearchExecutor`、`McpToolSearchParams` 请求构造、`McpToolListResponse` 输出归一化、`tools/matches/count/query/caller/notes/retry_allowed/terminal_reason/next_action` JSON shape 与 GUI / retry policy metadata。该 owner 不依赖 Aster。
- `completed`：`tool-runtime::native_dispatch::NativeDispatchBuilder::with_tool_search_gateway(...)` 统一注册 ToolSearch definition + executor；`lime-agent/src/native_tools/tool_search.rs` 只通过 per-gateway `NativeDispatch::builder()` 读取 `definitions()` 并创建 `RuntimeDefinitionToolAdapter`，不直接 import Aster vendor `ToolSearchTool`、`ExtensionManager` 或 executor body。
- `completed`：`app-server/src/runtime_backend/tool_search_tools.rs` 实现 `ToolSearchGateway`，唯一后端调用是 `AppDataSource::search_mcp_tools(params)`；`runtime_backend/native_tools.rs` 在 current native tool registration 中注册 tool_search gateway，App Server MCP current 主链成为真实消费链。
- `completed`：`runtime_backend_registers_current_gateway_tools_in_agent_registry` 增加 ToolSearch 注册断言，证明 App Server `register_current_native_tools_if_available()` 后 Agent registry 能看到 current deferred tool search native tool，而不是只停留在文档或 DTO。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 tool_search owner / wrapper / App Server gateway 守卫：`tool-runtime/src/tool_search.rs` 不得含 Aster / ExtensionManager / vendor ToolSearchTool，agent wrapper 必须通过 `NativeDispatch::builder().with_tool_search_gateway(...).definitions()`，App Server gateway 必须调用 `.search_mcp_tools(params)`。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item tool output projection。前端 ToolSearch summary 已消费 `{tools,matches,count,query,caller,notes}` 这类结构化结果；本刀补齐后端 current executor 与 App Server MCP gateway，仍未把 canonical name 从历史 `ToolSearch` 完整细化到 Codex `tool_search` 全链。
- `classification`：`current` 是 `tool-runtime::tool_search`、`tool-runtime::native_dispatch` gateway registration、App Server `tool_search_tools` gateway 与前端结构化 ToolSearch summary；`compat` 是 `lime-agent/src/native_tools/tool_search.rs` 的 Aster `Tool` trait adapter 和 `RuntimeDefinitionToolAdapter`；`dead / deleted / guarded` 是 vendored Aster `ToolSearchTool` 文件、`tools/mod.rs` 默认注册与 Aster `ExtensionManager` 搜索实现；`dead / guarded` 是 agent wrapper 或 App Server gateway 重新依赖 Aster `ExtensionManager` / vendor `ToolSearchTool`。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent --package app-server -- --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime tool_search --lib -j 2` 通过，`1 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_search --lib -j 2` 通过，`4 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server tool_search_tools --lib -j 2` 通过，`1 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend_registers_current_gateway_tools_in_agent_registry --lib -j 2` 通过，`1 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 2` 通过，`9 passed`；`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_overlay --lib -j 2` 通过，`8 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 最终复跑通过，`124 passed`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过；scoped `git diff --check` 覆盖本刀写集通过。
- `remaining`：这一步仍未删除 root `aster` dependency、Aster `ToolRegistry` / `Tool` trait 或 `lime-agent` 的 `aster.workspace = true`。`ToolSearch` 历史主名已在后续 `tool_search` canonical 收敛刀中完成；下一刀应继续迁出 Aster reply loop native tool execution 到 current Turn executor。

### 2026-07-08：Batch B vendored ToolSearchTool deletion

- `completed`：在 `tool-runtime::tool_search` + App Server MCP gateway 已成为 current owner 后，删除 vendored Aster `tools/tool_search_tool.rs`，并从 `tools/mod.rs` 移除 `pub mod tool_search_tool`、`pub use tool_search_tool::{...}`、`config.allows_tool("ToolSearch")` 默认注册路径与 Aster `ExtensionManager` 搜索 executor。
- `completed`：vendor 默认工具注册测试改为断言 `ToolSearch` 不由 Aster defaults 注册；`Agent::list_tools(None)` 在无 App Server current gateway 注入时也不得从 Aster 默认池暴露 `ToolSearch`。
- `completed`：`RuntimeDefinitionToolAdapter` 支持静态 lookup alias，`lime-agent/src/native_tools/tool_search.rs` 从 `tool-runtime::native_dispatch::TOOL_SEARCH_LOOKUP_ALIASES` 读取 `ToolSearchTool` / `tool_search` / `mcp__system__tool_search` 历史 alias；vendored Aster `tools/registry.rs` 不再提供 ToolSearch 默认 alias。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 `vendored Aster ToolSearchTool 必须保持删除且不得重新注册`，要求 vendor 文件不存在，且 `tools/mod.rs` production 段不得恢复 module、public export、`ToolSearchTool`、`register_tool_search_tool` 或 `config.allows_tool("ToolSearch")`，`tools/registry.rs` production 段不得恢复 ToolSearch 默认 alias。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item tool output projection。`ToolSearch` 的 current executor、definition、gateway result shape 与前端 summary 已在上一刀接入；本刀只删除 Aster vendor duplicate，避免 Aster `ExtensionManager` 搜索实现继续作为第二事实源。
- `classification`：`current` 是 `tool-runtime::tool_search`、`NativeDispatchBuilder::with_tool_search_gateway(...)` 与 App Server `AppDataSource::search_mcp_tools(params)`；`compat` 是 `lime-agent/src/native_tools/tool_search.rs` 通过 `RuntimeDefinitionToolAdapter` 临时落到 Aster `Tool` trait；`dead / deleted / forbidden-to-restore` 是 vendored `ToolSearchTool` 文件、Aster default registration 与 `ExtensionManager` executor body。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent --package app-server -- --check` 通过；`cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime tool_search --lib -j 2` 通过，`1 passed`；`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_dispatch --lib -j 2` 通过，`5 passed`；`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_search --lib -j 2` 通过，`4 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server tool_search_tools --lib -j 2` 通过，`1 passed`；`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend_registers_current_gateway_tools_in_agent_registry --lib -j 2` 通过，`1 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 2` 通过，`9 passed`；`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_overlay --lib -j 2` 通过，`8 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core test_register_all_tools_with_extension_manager_registers_current_extension_tools --lib -j 2` 通过，`1 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`125 passed`；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过；scoped `git diff --check` 通过。
- `completed-followup`：canonical 收敛刀已把模型可见主名改为 Codex `tool_search`；`ToolSearch` / `ToolSearchTool` 只保留为历史 transcript lookup alias。
- `remaining`：root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster reply loop `ToolRegistry` / `Tool` trait 壳仍是 Phase 6 blocker；整体目标完成度仍约 `95%`，不能上调到完成态。

### 2026-07-08：Batch B tool_search canonical name convergence

- `completed`：`tool-runtime::tool_search::TOOL_SEARCH_TOOL_NAME` 从历史 `ToolSearch` 收敛为 Codex 风格 `tool_search`，模型可见 definition、NativeDispatch canonical name、Rust catalog、agent inventory fixture、prompt guideline 和 `image_generate` 默认 skill 禁止绕路文案均使用 `tool_search`。
- `completed`：`tool-runtime::native_dispatch::TOOL_SEARCH_LOOKUP_ALIASES` 只保留 `ToolSearch` / `ToolSearchTool` / `mcp__system__tool_search` 为 lookup-only legacy alias；`NativeDispatch::canonical_name("ToolSearch")` 和 `canonical_name("ToolSearchTool")` 都回到 `tool_search`。
- `completed`：`lime-agent/src/agent_tools/catalog.rs` 的 `TOOL_SEARCH_TOOL_NAME` 改为 `tool_search`，历史 `ToolSearch` / `ToolSearchTool` / `mcp__system__tool_search` 归一化到 current canonical；front-end 历史 transcript display / normalization 不在本刀删除，仍只作为读历史记录的兼容面。
- `guarded`：`asterMigrationBoundary.test.ts` 现在要求 `tool-runtime` owner 暴露 `TOOL_SEARCH_TOOL_NAME = "tool_search"`，要求 current dispatch 持有 legacy alias matrix，要求 agent catalog canonical name 是 `tool_search`，同时继续禁止 vendored Aster 恢复 `ToolSearchTool` 或 default alias。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item tool output projection。Codex 对照是 deferred tool discovery 的 canonical tool name 固定为 `tool_search`；Lime 当前已让 App Server MCP gateway 与 agent prompt / catalog 走同名 current 面。
- `classification`：`current` 是 `tool-runtime::tool_search`、`NativeDispatchBuilder::with_tool_search_gateway(...)`、App Server `search_mcp_tools` gateway、agent catalog canonical `tool_search`；`compat` 是 `lime-agent/src/native_tools/tool_search.rs` 的 Aster `Tool` trait adapter 与 lookup-only legacy aliases；`dead / deleted / forbidden-to-restore` 是 vendored `ToolSearchTool` 文件、Aster default registration、Aster `ExtensionManager` executor body 和 vendor ToolSearch alias matrix。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent --package app-server -- --check` 通过。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime tool_search --lib -j 2` 通过，`1 passed`；`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_dispatch --lib -j 2` 通过，`5 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent tool_search --lib -j 2` 通过，`4 passed`；`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent catalog --lib -j 2` 通过，`16 passed`；`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent inventory --lib -j 2` 通过，`14 passed`；`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent prompt --lib -j 2` 通过，`45 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server tool_search_tools --lib -j 2` 通过，`1 passed`；`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server default_image_generate_skill_uses_current_native_image_task_tool --lib -j 2` 通过，`1 passed`；`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server runtime_backend_registers_current_gateway_tools_in_agent_registry --lib -j 2` 通过，`1 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`125 passed`。
- `validated`：ToolSearch canonical 残留扫描覆盖 Rust definition、prompt、skill 文案、治理测试和迁移文档，只剩负向禁止断言命中；scoped `git diff --check` 通过；未跟踪 `tool_search.rs` / `tool_search_tools.rs` 新文件行尾空白扫描无命中。
- `remaining`：本刀只完成 canonical 命名与回流守卫，未删除 root `aster` dependency、`lime-agent` 的 `aster.workspace = true` 或 Aster reply loop `ToolRegistry` / `Tool` trait 壳。下一刀继续迁出 Aster reply loop native tool execution 到 current Turn executor；整体目标完成度仍约 `95%`。

### 2026-07-08：Batch B native permission owner 上提到 tool-runtime

- `completed`：删除 `lime-agent/src/native_tools/{sleep,view_image,update_plan,web_retrieval}.rs` 与 `lime-agent/src/tools/{apply_patch_tool,skill_search_tool}.rs`。这些文件此前已经只剩 Aster `PermissionCheckResult` delegate；继续保留会让 per-tool Aster wrapper 看起来仍是 owner。
- `completed`：`tool-runtime::native_overlay` 新增 `RuntimeNativePermissionDecision` 与 `check_runtime_native_tool_permissions(...)`，集中承接 `sleep`、`view_image`、`update_plan`、`apply_patch`、`skill_search`、`WebFetch`、`WebSearch` 的 stateless permission / confirmation 分派；WebFetch/WebSearch 的联网确认、turn metadata 和预批准 host 检查不再归属 Aster bridge。
- `completed`：`runtime_tool_bridge.rs` 不再持有 `runtime_native_permission_check(...)` 或 per-tool `check_*_permissions` helper，只在 `RuntimeNativeToolAdapter::check_permissions(...)` 调用 current owner 后通过 `permission_decision_to_aster(...)` 转成临时 Aster `PermissionCheckResult`。
- `completed`：`runtime_overlay.rs` 不再选择 per-tool permission function，只把 current install step 交给 `create_runtime_native_tool_adapter(step.tool())`；`tools/mod.rs` 的 `APPLY_PATCH_TOOL_NAME` / `SKILL_SEARCH_TOOL_NAME` re-export 改从 `tool-runtime` current owner 读取。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 `DELETED_STATELESS_NATIVE_TOOL_WRAPPER_FILES`，要求上述 wrapper 文件保持物理删除；同时要求 `tool-runtime::native_overlay` 持有 `check_runtime_native_tool_permissions(...)` / Web confirmation policy，要求 `runtime_tool_bridge.rs` 只保留 `permission_decision_to_aster(...)`，并禁止 bridge 恢复 per-tool permission function、`WebFetchInput` 或 `is_preapproved_web_fetch_host(...)`。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item tool inventory。Codex 对照是 tool spec/permission/execution 都由 current runtime owner 和 turn dispatcher 集中，而不是由每个 Aster wrapper 分散持有。
- `classification`：`current` 是 `tool-runtime::{sleep,view_image,update_plan,apply_patch,skill_search,web_fetch,web_search}` 与 `tool-runtime::native_overlay::{RuntimeNativePermissionDecision, check_runtime_native_tool_permissions}`；`compat` 是 `runtime_tool_bridge.rs` 的 Aster `PermissionCheckResult` / `ToolContext` / `ToolResult` 转换和 `runtime_overlay.rs` 的 Aster `ToolRegistry` 注册壳；`dead / deleted / forbidden-to-restore` 是已删除 stateless wrapper 文件、per-tool permission delegate、bridge 内 WebFetch/WebSearch confirmation policy。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package tool-runtime -- --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 2` 通过，`11 passed`；`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_tool_bridge --lib -j 2` 通过，`9 passed`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`126 passed`；`git diff --check` 覆盖本刀代码写集通过。
- `remaining`：本刀删除了已迁 stateless wrapper 文件，但没有删除 Aster `ToolRegistry` / `Tool` trait、gateway-backed `RuntimeDefinitionToolAdapter`、Skill gate wrapper、root `aster` dependency 或 `lime-agent` 的 `aster.workspace = true`。下一刀仍应优先迁出 Aster reply loop native tool execution 到 current Turn executor；整体目标完成度仍约 `95%`。

### 2026-07-08：Batch B MCP resource current owner 与 vendor 删除

- `completed`：Codex 对照确认 MCP resource current canonical names 是 `list_mcp_resources` / `read_mcp_resource`（`codex-rs/core/src/tools/handlers/mcp_resource_spec.rs`、`mcp_resource/*` handler 与 `spec_plan.rs`）；Lime 已新增 `tool-runtime::mcp_resource` current executor skeleton，承接 `McpResourceGateway`、`RuntimeMcpResourceExecutor`、`McpResourceListResponse` / `McpResourceReadParams` gateway contract、结果 metadata、permission stub 与 lookup-only legacy alias。
- `completed`：`tool-runtime::native_dispatch::NativeDispatchBuilder::with_mcp_resource_gateway(...)` 统一注册 `list_mcp_resources` / `read_mcp_resource` definition + executor；`lime-agent/src/native_tools/gateway_bridge.rs::create_mcp_resource_tools(...)` 只从该 dispatch 读取 definitions，并用 `RuntimeDefinitionToolAdapter` 临时落到 Aster `Tool` trait。`AgentRuntimeState::register_mcp_resource_tools(...)` 与 App Server `runtime_backend/mcp_resource_tools.rs` 已接入 App Server current `AppDataSource::list_mcp_resources()` / `read_mcp_resource(params)`。
- `completed`：`agent_tools/tool_inventory_runtime_adapter.rs` 的 GUI / Evidence inventory seed 不再读取 Aster `ToolRegistry::get_definitions()`，只消费 `AgentRuntimeState::native_tool_definitions_snapshot()`；`runtime_backend/tests/tool_inventory.rs` 断言 `runtime_tools` 暴露 `list_mcp_resources` / `read_mcp_resource` 且 `source_kind=current_surface`，不再把旧 `ListMcpResourcesTool` / `ReadMcpResourceTool` 作为 registry current 工具。
- `completed`：删除 vendored Aster `tools/mcp_resource_tools.rs`，并从 `tools/mod.rs` 移除 `pub mod mcp_resource_tools`、`pub use ... ListMcpResourcesTool / ReadMcpResourceTool`、`register_extension_resource_tools(...)` 和 `config.allows_any_tool(&["ListMcpResources", "ReadMcpResource"])` 默认注册路径；vendor 默认注册测试改为断言 `list_mcp_resources` / `read_mcp_resource` 与旧 `*Tool` alias 均不由 Aster defaults 注册。
- `completed`：vendored Aster reply loop 残留只保留可见性 / compact-surface gating，并改用 current canonical names `list_mcp_resources` / `read_mcp_resource`；vendor prompts 不再正向提示 `ListMcpResourcesTool` / `ReadMcpResourceTool`，而是提示 current names。前端 `agentTextNormalization` 仍保留旧名到 current canonical 的历史 transcript 归一化。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 MCP resource owner / gateway / vendor deletion 守卫，要求 `tool-runtime/src/mcp_resource.rs` 不含 Aster / `ExtensionManager`，App Server gateway 只调用 current AppDataSource，vendor `mcp_resource_tools.rs` 保持删除，`tools/mod.rs` production 段不得恢复 `register_extension_resource_tools`、`ListMcpResourcesTool`、`ReadMcpResourceTool` 或旧 allowlist 注册路径。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item tool output projection。Codex 对照是 `list_mcp_resources` / `read_mcp_resource` handler 由 current tool runtime/spec plan 提供；Lime 仍因 Aster reply loop 未迁出而需要 `RuntimeDefinitionToolAdapter`，但模型可见 name、executor、App Server gateway、GUI inventory 和 Evidence 读面已走 current owner。
- `classification`：`current` 是 `tool-runtime::mcp_resource`、`NativeDispatchBuilder::with_mcp_resource_gateway(...)`、App Server `runtime_backend/mcp_resource_tools.rs`、`AgentRuntimeState::native_tool_definitions_snapshot()` 与 GUI inventory `current_surface`；`compat` 是 `gateway_bridge.rs` 的 Aster `Tool` trait adapter 和 lookup-only legacy alias；`dead / deleted / forbidden-to-restore` 是 vendored `McpResourceTools` implementation、Aster default registration、旧 vendor prompts 的 `ListMcpResourcesTool` / `ReadMcpResourceTool` 正向 surface。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent --package app-server -- --check` 通过；`cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime mcp_resource --lib -j 2` 通过，`2 passed`；`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent gateway_bridge --lib -j 2` 通过，`3 passed`；`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p app-server tool_inventory --lib -j 2` 通过，`8 passed`；`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core test_register_all_tools_with_extension_manager_does_not_register_current_extension_tools --lib -j 2` 通过，`1 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`126 passed`；`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "src/lib/api/agentTextNormalization.ts" "src/lib/api/agentTextNormalization.test.ts"` 通过。
- `verification-unblock`：`app-server` 测试夹具中已有 `ActionRespondRequest` 随并行 approval 接口新增 `decision` 字段，本刀补齐 `runtime_backend/initialization_tests.rs` 和 `runtime_backend/tests/turn_flows.rs` 的默认 `AgentSessionApprovalDecision::from_confirmed(...)`，只为恢复 `app-server` 定向编译验证，不改变 MCP resource 行为。
- `remaining`：root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster reply loop `ToolRegistry` / `Tool` trait 壳、provider/reply loop `Agent::reply` / `Message` / `AgentEvent` / provider trait object 仍是 Phase 6 blocker。下一刀继续优先迁出 Aster reply loop native tool execution 到 current Turn executor，或回到 provider/reply loop 最大 blocker；整体目标完成度仍约 `95%`。

### 2026-07-09：Batch B native tool inventory snapshot 单源化

- `completed`：`agent_tools/tool_inventory_runtime_adapter.rs` 不再读取 Aster `agent.tool_registry().get_definitions()`，GUI / Evidence tool inventory seed 只消费 `AgentRuntimeState::native_tool_definitions_snapshot()`。模型可见 definition 的事实源从 Aster registry readback 固定到 Lime current definition snapshot。
- `completed`：`AgentRuntimeState` 删除冗余 `native_tool_names` cache 与 `native_tool_names_snapshot()`；`contains_native_tool(...)` 直接从 `native_tool_definitions` map 派生，初始化和 gateway-backed tool 注册只维护一份 current definition snapshot，避免 name set / definition map 后续分叉。
- `completed`：`AgentToolInventoryBuildInput` 的 `registry_definitions` 改为 `current_tool_definitions`，删除 `current_surface_tool_names` 输入；runtime inventory 中由 current definition 生成的 native entry 固定投影为 `source_kind=current_surface`，Rust `RuntimeToolSourceKind::RegistryNative` 已删除。该批次最初仍暂存的外部 `registry_tools` JSON 字段已被 2026-07-09 `native tool inventory external contract 收口` 覆盖删除，current 外部契约只允许 `native_tools` / `native_total`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `runtime_state.rs` 不得恢复 `native_tool_names` / `native_tool_names_snapshot()`，要求 tool inventory runtime adapter 只能读取 `native_tool_definitions_snapshot()`，并继续禁止 `.get_definitions()` / `RuntimeToolDefinition::new(...)` 从 Aster DTO 反推 current definition。
- `Thread / Turn / Item`：归属 Turn native tool availability / Item tool inventory projection。Codex 对照是 tool spec/runtime/exposure 由 current tool runtime contract 提供，不从外部 framework registry 反读模型可见工具。
- `classification`：`current` 是 `AgentRuntimeState::native_tool_definitions`、`native_tool_definitions_snapshot()`、`tool-runtime::RuntimeToolDefinition` 与 inventory `current_surface` projection；`compat` 仍是 `native_tools/runtime_overlay.rs` / `gateway_bridge.rs` 将 current definitions 绑定到临时 Aster `Tool` trait 对象；`dead / guarded` 是 Aster `ToolRegistry::get_definitions()` readback、`native_tool_names` 第二缓存、`current_surface_tool_names` 过滤链和 Rust `registry_native` source kind。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::inventory --lib -j 2` 通过，`14 passed`。
- `validated`：`CARGO_BUILD_JOBS=4 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_state --lib -j 2` 通过，`14 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`127 passed`。
- `remaining`：这一步只移除了 inventory/read-model 对 Aster registry 的依赖和冗余 name cache，尚未删除 Aster `ToolRegistry` / `Tool` trait 执行壳、gateway-backed `RuntimeDefinitionToolAdapter`、Skill gate wrapper、root `aster` dependency 或 `lime-agent` 的 `aster.workspace = true`。整体目标完成度仍约 `95%`。

### 2026-07-09：Batch A request_user_input / Ask current runner

- `completed`：Codex 对照确认 `/Users/coso/Documents/dev/rust/codex/codex-rs` 已有 `request_user_input` 协议、`UserInputAnswer` 操作和 MCP elicitation 链路，因此 Aster `AskTool` 对应能力按“Codex 有则迁”处理，不按 Aster-only 删除。
- `completed`：`agent-runtime::request_user_input` 新增 `RequestUserInputRunRequest`、`RequestUserInputAction`、`RequestUserInputGateway`、`RequestUserInputError` 与 `run_request_user_input(...)`，current owner 统一负责 prompt 解析、requested schema 构造、gateway 调用和 response 归一化。
- `completed`：旧 `lime-agent/src/ask_bridge.rs` 已删除，`lime-agent/src/request_user_input_bridge.rs` 收缩为 current `RequestUserInputCallback` adapter：只保留 current request DTO 转交、Aster action scope 到 `agent_protocol::action_required::ActionRequiredScope` 的转换，以及临时 `ActionRequiredManager` gateway。adapter 不再直接调用 `resolve_request_prompt`、`build_requested_schema` 或 current response extractor，也不再从 `aster` root 消费 `AskRequest` / `AskOption` / `AskQuestion`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime/src/request_user_input.rs` 持有 request_user_input current runner 且不含 `aster::`；同时禁止 `request_user_input_bridge.rs` / `lime-agent` crate 根恢复 Ask prompt/schema/response 纯逻辑或公开 Aster request DTO。`RequestUserInputCallback` 配置字段仍是 Aster registry 未迁完前的最小 R4 bridge blocker。
- `Thread / Turn / Item`：归属 Turn action_required / elicitation lifecycle。Lime 当前真实消费链是 Aster reply loop 的 `RequestUserInputCallback` 配置字段触发 `ActionRequiredManager`，再由 App Server / GUI action response 主链接收用户输入；本刀把其中可复用 runner 迁到 `agent-runtime`，为后续删除 Aster reply loop callback 壳做准备。
- `classification`：`current` 是 `agent-runtime::request_user_input::{run_request_user_input, RequestUserInputGateway, RequestUserInputRunRequest}`、`tool-runtime::request_user_input::{RequestUserInputRequest, RequestUserInputOption, RequestUserInputQuestion}` 与 `agent_protocol::action_required::ActionRequiredScope`；`compat` 是 `lime-agent/src/request_user_input_bridge.rs` 的 `RequestUserInputCallback` / `ActionRequiredManager` gateway；`dead / guarded` 是 adapter 内恢复 prompt/schema/response runner、`extract_current_ask_response` 直连和 root / tools public re-export `AskRequest` / `AskOption` / `AskQuestion`。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check` 通过。
- `validated`：后续命名收口后，验证命令改为 `cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime request_user_input --lib -j 1` 与 `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_user_input_bridge --lib -j 1`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`134 passed`。
- `validated`：scoped `git diff --check` 覆盖本刀代码、治理测试和文档写集通过。
- `remaining`：本刀削薄了 `RequestUserInputCallback` / `ActionRequiredManager` compat bridge，但没有删除 root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster `Agent::reply` / `Message` / `AgentEvent` / provider trait、Aster `ToolRegistry` / `Tool` trait 执行壳、`SessionStore` / `ThreadRuntimeStore` adapter。下一刀仍应优先迁出 Aster reply loop native tool execution 或回到 provider/reply loop 最大 blocker；整体目标完成度仍约 `95%`。

### 2026-07-09：Batch B gateway-backed native dispatch surface 单源化

- `completed`：`tool-runtime::native_dispatch` 新增 `RuntimeNativeDispatchSurface` 与 `NativeDispatch::surfaces()`，把 gateway-backed native tools 的模型可见 definition 与 lookup-only aliases 固定在 current dispatch owner。`definitions()` 仍保留给只需 definition snapshot 的调用方，但 adapter 不再自行拼 surface。
- `completed`：`lime-agent/src/native_tools/gateway_bridge.rs` 的 memory_store、image_task、tool_search、mcp_resource adapter 统一消费 `dispatch.surfaces()`；`RuntimeDefinitionToolAdapter` 的 aliases 来自 `surface.aliases()`。adapter 不再传入全局 `TOOL_SEARCH_LOOKUP_ALIASES`，也不再按 `definition.name` match `LIST_MCP_RESOURCES_LOOKUP_ALIASES` / `READ_MCP_RESOURCE_LOOKUP_ALIASES`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `native_dispatch.rs` 暴露 current surface API，要求 `gateway_bridge.rs` 消费 `.surfaces()` / `surface.aliases()`，并禁止 gateway bridge 重新持有 tool_search / MCP resource alias 常量或 `match definition.name.as_str()` 本地 surface 分派。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item tool inventory。Codex 对照是 tool spec/runtime/search metadata 由 current tool runtime owner 组合后交给 host dispatch；Lime 当前仍通过 Aster `Tool` trait 注册壳落地，但 gateway-backed model-visible surface 已不再由 Aster adapter 持有。
- `classification`：`current` 是 `tool-runtime::native_dispatch::{NativeDispatch, RuntimeNativeDispatchSurface, NativeDispatch::surfaces}`；`compat` 是 `gateway_bridge.rs` 的 `RuntimeDefinitionToolAdapter` / Aster `Tool` trait 桥接；`dead / guarded` 是 gateway bridge 内重新维护 alias surface、MCP resource 本地 name match 或回退 per-tool wrapper。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_dispatch --lib -j 2` 通过，`5 passed`；`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent gateway_bridge --lib -j 2` 通过，`3 passed`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过；`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`134 passed`。
- `validated`：scoped `git diff --check` 覆盖本刀代码和治理测试写集通过。
- `remaining`：本刀只把 gateway-backed surface/alias 从 Aster adapter 收回 `tool-runtime`，仍未删除 `RuntimeDefinitionToolAdapter`、Aster `ToolRegistry` / `Tool` trait、root `aster` dependency 或 `lime-agent` 的 `aster.workspace = true`。下一刀继续优先迁出 Aster reply loop native tool execution，或回到 provider/reply loop 最大 blocker；整体目标完成度仍约 `95%`。

### 2026-07-09：Batch B native tool execution outcome current owner

- `completed`：`tool-runtime::tool_executor` 新增 `RuntimeToolExecutionOutcome`、`RuntimeToolExecutionFailure`、`RuntimeToolExecutionFailureKind` 与 `run_runtime_tool_execution(...)`，把 native tool executor result/error materialization 和 policy error 分类收回 current owner；该 owner 不依赖 Aster。
- `completed`：`lime-agent/src/native_tools/runtime_tool_bridge.rs` 的 `execute_runtime_tool(...)` 改为调用 `run_runtime_tool_execution(...)`，再把 current outcome 映射成临时 Aster `ToolResult` / `ToolError`。bridge 不再 import `RuntimeToolExecutionError`、`RuntimeToolExecutionResult` 或 `RuntimeToolPolicyErrorKind`，也不再持有 `tool_result_from_runtime(...)` / `runtime_error_to_tool_error(...)` 两个旧映射函数。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 execution outcome owner 存在于 `tool-runtime/src/tool_executor.rs` 且不含 `aster::`；同时禁止 `runtime_tool_bridge.rs` 恢复 policy error 分类、旧 result/error 映射函数或直接消费 current execution error/result 类型。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item tool output materialization。Codex 对照是 tool execution outcome 先由 current runtime owner materialize，再由 host adapter 做展示/协议映射；Lime 当前仍因 Aster reply loop 未迁出而需要 `ToolResult` / `ToolError` 映射，但执行 outcome 不再属于 Aster adapter。
- `classification`：`current` 是 `tool-runtime::tool_executor::{run_runtime_tool_execution, RuntimeToolExecutionOutcome, RuntimeToolExecutionFailureKind}`；`compat` 是 `runtime_tool_bridge.rs` 的 `runtime_outcome_to_aster(...)` / `runtime_failure_to_aster(...)` 与 Aster `Tool` trait wrapper；`dead / guarded` 是 bridge 内恢复 policy error 分类、`tool_result_from_runtime(...)` 或 `runtime_error_to_tool_error(...)`。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime tool_executor --lib -j 2` 通过，`6 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent runtime_tool_bridge --lib -j 2` 通过，`9 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`134 passed`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过；scoped `git diff --check` 覆盖本刀写集通过。
- `remaining`：本刀继续削薄 Aster `Tool` trait wrapper，但没有删除 `RuntimeNativeToolAdapter`、`RuntimeDefinitionToolAdapter`、Aster `ToolRegistry` / reply loop、root `aster` dependency 或 `lime-agent` 的 `aster.workspace = true`。下一刀仍优先迁出 Aster reply loop native tool execution 或 provider/reply loop 最大 blocker；整体目标完成度仍约 `95%`。

### 2026-07-09：Batch B Skill access gate current owner

- `completed`：`tool-runtime::skill_gate` 新增 `SkillToolAccessError`、`check_skill_tool_access(...)` 与 `workspace_skill_source_for_invocation_params(...)`，把 Skill session enabled / allowlist / workspace source lookup 的 invocation-level access check 收回 current owner；该 owner 不依赖 Aster。
- `completed`：`lime-agent/src/tools/skill_tool_gate.rs` 的 `LimeSkillTool` 不再直接调用 `is_skill_tool_enabled_for_session(...)`、`is_skill_allowed_for_session(...)` 或 `workspace_skill_source_for_session_skill(...)`，而是调用 current `check_skill_tool_access(...)` 与 `workspace_skill_source_for_invocation_params(...)`，再把 current access error 转成临时 Aster `ToolError` / `PermissionCheckResult`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tool-runtime/src/skill_gate.rs` 持有 Skill access current API，并禁止 `skill_tool_gate.rs` 恢复 direct session gate / allowlist / workspace source 判断。该条记录当时允许的 Aster `SkillTool` execution shell 已被后续 `Skill prompt/workflow runner current backend` 删除并改为 forbidden-to-restore。
- `Thread / Turn / Item`：归属 Turn tool lifecycle 的 Skill invocation access gate；workspace skill source metadata 继续作为 Item tool output metadata 的前置事实。Codex 对照是 Skills selection/gate 先由 current runtime policy 决定，host adapter 只做协议映射。
- `classification`：`current` 是 `tool-runtime::skill_gate::{check_skill_tool_access, SkillToolAccessError, workspace_skill_source_for_invocation_params}`；当前 `compat` 是 `LimeSkillTool` Aster `Tool` trait 外壳 / provider bridge / final `ToolResult` 转换；`dead / guarded` 是 wrapper 内恢复 session enabled / allowlist / source lookup 第二份实现或 Aster `SkillTool` execution backend。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime skill_gate --lib -j 2` 通过，`6 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_tool --lib -j 2` 通过，`7 passed`。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package lime-agent -- --check` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`134 passed`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过；scoped `git diff --check` 覆盖本刀写集通过。
- `remaining`：本刀当时仍未删除 Aster `SkillTool`、Aster `ToolRegistry` / reply loop、root `aster` dependency 或 `lime-agent` 的 `aster.workspace = true`；后续 Skill prompt/workflow runner 刀已删除 Aster `SkillTool` backend。剩余 blocker 是 Aster `Tool` trait 外壳、Aster `ToolRegistry` / reply loop、root `aster` dependency 和 `lime-agent` 的 `aster.workspace = true`；整体目标完成度仍约 `95%`。

### 2026-07-09：Batch A reply source dispatch current owner

- `completed`：`agent-runtime::reply_backend` 新增 `RuntimeReplySourceExecutor<M, C>` 与 `RuntimeReplySourceCall::run_with(...)`，把 default/provider reply source call 的分派收回 Turn current owner。`RuntimeReplySourceCall::Default` / `Provider` 的 match 现在只在 `agent-runtime` 内部出现，Aster adapter 不再自己判断 source path。
- `completed`：`lime-agent/src/request_tool_policy/aster_reply_backend_adapter.rs` 的 `AsterReplySource` 只负责把 `RuntimeReplyMessage` / `AgentSessionConfig` lowering 成 Aster `Message` / `SessionConfig`，然后调用 `call.run_with(ReplyExitSourceExecutor::new(...))`。`ReplyExitSourceExecutor` 只实现 `run_default(...)` 调用旧 `Agent::reply(...)` 与 `run_provider(...)` 调用临时 `ConfiguredReplyProvider::stream_reply_with_agent(...)`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-runtime` 暴露 `RuntimeReplySourceExecutor` / `run_with`，并要求 Aster adapter 的 `AsterReplySource` 不含 `RuntimeReplySourceCall::Default` / `Provider`、`.reply(...)` 或 `.stream_reply_with_agent(...)`。旧路回流只能发生在显式 `ReplyExitSourceExecutor`，且该 executor 仍是 reply loop 未迁出前的删除边界。
- `Thread / Turn / Item`：归属 Turn reply source execution path selection。Codex 对照是 Turn runtime owner 决定模型 reply / tool loop source path，host adapter 只实现具体 backend 调用；Lime 当前仍通过 Aster `Agent::reply` / provider trait 产生 stream，但 path dispatch 不再属于 Aster adapter。
- `classification`：`current` 是 `agent-runtime::reply_backend::{RuntimeReplySourceExecutor, RuntimeReplySourceCall::run_with}`；`compat` 是 `ReplyExitSourceExecutor` 对 Aster `Agent::reply` / `reply_with_provider` 的最后调用壳；`dead / guarded` 是在 `AsterReplySource` 或 `start_aster_reply_stream(...)` 内恢复 default/provider match、直接 `.reply(...)`、直接 `.stream_reply_with_agent(...)` 或重新持有 provider wire support / session metadata preparation 规则。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package agent-runtime --package lime-agent -- --check` 通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime reply_backend --lib -j 2` 通过，`18 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2` 通过，`68 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`134 passed`。
- `remaining`：本刀削薄 provider/reply loop 的 source path ownership，但没有删除 root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster `Agent::reply` / `Message` / `AgentEvent` / provider trait object、Aster `ToolRegistry` / `Tool` trait 执行壳、`SessionStore` / `ThreadRuntimeStore` adapter。下一刀仍优先继续 provider/reply loop 或 Aster reply loop native tool execution；整体目标完成度仍约 `95%`。

### 2026-07-09：Batch B Skill result metadata current owner

- `completed`：新增 `tool-runtime::skill_result` current owner，承接 Skill runtime preflight failure projection、runtime contract metadata map 与 workspace skill source metadata map。`lime-agent/src/tools/skill_tool_gate.rs` 不再维护 `build_runtime_preflight_error_result(...)`、`workspace_skill_source_metadata_value(...)` 或 Skill-specific metadata attach helper。
- `completed`：该条记录当时 `LimeSkillTool` 仍保留 Aster `SkillTool` execution shell，但 success / preflight failure 的 metadata shape 已全部来自 `tool-runtime::skill_result`；后续 `Skill prompt/workflow runner current backend` 已删除该 Aster `SkillTool` shell，wrapper 当前只做 provider bridge 和 `HashMap<String, Value>` -> Aster `ToolResult::with_metadata(...)` 的临时类型转换。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tool-runtime/src/skill_result.rs` 持有 `SkillPreflightFailureProjection`、`skill_preflight_failure_projection(...)`、`skill_runtime_contract_metadata_map(...)` 与 `workspace_skill_source_metadata_map(...)`，且不含 Aster；同时禁止 `skill_tool_gate.rs` 恢复 Skill-specific metadata helper 或 `with_metadata("modality_contract_key" / "workspace_skill_source")` 第二份实现。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Item tool output metadata projection。Codex 对照是 Skills invocation/result facts 由 current runtime owner materialize，host adapter 只做协议/类型映射。
- `classification`：`current` 是 `tool-runtime::skill_result`、`skill_runtime_contract` 与 `skill_gate`；当前 `compat` 是 `LimeSkillTool` Aster `Tool` trait 外壳 / provider bridge / final `ToolResult` 转换与 generic metadata attach；`dead / guarded` 是 wrapper 内恢复 Skill result JSON shape、runtime preflight metadata、workspace source metadata 第二份实现或 Aster `SkillTool` execution backend。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime skill_result --lib -j 2` 通过，`3 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime skill_runtime_contract --lib -j 2` 通过，`3 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_tool --lib -j 2` 通过，`7 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`134 passed`。
- `remaining`：本刀继续削薄 Skill Aster wrapper；后续 Skill prompt/workflow runner 刀已删除 Aster `SkillTool` backend。当前仍未删除 Aster `ToolRegistry` / reply loop、Aster `Tool` trait 外壳、root `aster` dependency 或 `lime-agent` 的 `aster.workspace = true`。下一刀仍优先迁出 Aster reply loop native tool execution 或 provider/reply loop 最大 blocker；整体目标完成度仍约 `95%`。

### 2026-07-09：Batch B Skill execution envelope current owner

- `completed`：新增 `tool-runtime::skill_execute` current owner，承接 Skill execution envelope、session access gate、workspace skill source lookup、runtime contract preflight、调用参数规范化、backend result metadata 合并和 不依赖 Aster execution backend trait。
- `completed`：`lime-agent/src/tools/skill_tool_gate.rs` 的 `execute(...)` 不再直接调用 gate / contract / result projection helper，也不再自己决定 preflight failure shape；该条记录当时仍通过临时 `RuntimeSkillExecutionBackend` 调用 Aster `SkillTool::execute(...)`，后续 Skill prompt/workflow runner 刀已删除这个 Aster backend。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tool-runtime/src/skill_execute.rs` 持有 `RuntimeSkillExecutionRequest` / `RuntimeSkillBackendRequest` / `RuntimeSkillExecutionResult` / `RuntimeSkillExecutionBackend` / `run_skill_execution(...)`，且不含 Aster / `ToolResult`；同时禁止 `skill_tool_gate.rs` 生产段恢复 runtime contract lookup、preflight projection、workspace source metadata projection 或 Skill-specific result metadata shape。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Skill invocation execution envelope；Item tool output metadata 继续由 `tool-runtime::skill_result` materialize。Codex 对照是 Skills invocation 由 current runtime owner 管 execution envelope，host adapter 只提供具体 backend。
- `classification`：`current` 是 `tool-runtime::{skill_gate, skill_runtime_contract, skill_result, skill_execute}`；当前 `compat` 是 `LimeSkillTool` Aster `Tool` trait 外壳 / provider bridge / final `ToolResult` 转换；`dead / guarded` 是恢复 Aster `SkillTool` backend adapter、wrapper 内恢复 Skill execution preflight、参数规范化、metadata 合并或第二份 Skill result JSON shape。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime skill_execute --lib -j 2` 通过，`4 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime skill_runtime_contract --lib -j 2` 通过，`3 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime skill_result --lib -j 2` 通过，`3 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime skill_gate --lib -j 2` 通过，`6 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_tool --lib -j 2` 通过，`7 passed`。
- `remaining`：本刀是骨架迁移，不删除 Aster `SkillTool`、Aster `ToolRegistry` / reply loop、root `aster` dependency 或 `lime-agent` 的 `aster.workspace = true`。下一刀应继续把 Skill backend 从 Aster `SkillTool` 替换为 `lime-skills` / provider current executor，或回到 provider/reply loop 最大 blocker；整体目标完成度仍约 `95%`。

### 2026-07-09：Batch B Skill prompt/workflow runner current backend

- `completed`：新增 `lime-skills::run`，承接 不依赖 Aster `SkillRunner`、prompt Skill 执行、workflow step 顺序执行、变量插值、step result DTO 与 `SkillRunResult` metadata。该 runner 不依赖 Aster，也不返回 Aster `ToolResult`。
- `completed`：`tool-runtime::skill_execute` 新增 `RuntimeSkillDefinitionBackend`，使用 `lime_skills::find_skill_by_name(...)` + `SkillRunner::new(...)` 执行 prompt / workflow Skill，并把 result metadata 合并回 `RuntimeSkillExecutionResult`。
- `completed`：`lime-agent/src/tools/skill_tool_gate.rs` 删除 `inner: SkillTool`、`SkillTool::new()` 和 `AsterSkillExecutionBackend`；`LimeSkillTool` 仍只作为未迁出 Aster reply loop 的临时 `Tool` trait 外壳，执行时通过 `CurrentSessionSkillProvider` 把当前 turn 的 Aster provider 桥接到 `lime-skills::LlmProvider`，再调用 current `RuntimeSkillDefinitionBackend`。
- `completed`：`agent` / `allowed_tools` Skill 现在在 `lime-skills::requires_turn_runtime(...)` 中 fail closed，不再回落到 Aster 子 Agent；这类能力后续必须进入 Turn runtime owner，而不是恢复 Aster `SkillTool`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `lime-skills/src/run.rs` 持有 `SkillRunner` / `requires_turn_runtime(...)` / `interpolate_variables(...)`，要求 `tool-runtime/src/skill_execute.rs` 持有 `RuntimeSkillDefinitionBackend` 并消费 `SkillRunner::new` / `find_skill_by_name`，并禁止 `skill_tool_gate.rs` 生产段恢复 `inner: SkillTool`、`SkillTool::new()` 或 `AsterSkillExecutionBackend`。
- `Thread / Turn / Item`：prompt / workflow Skill 执行属于 Turn tool lifecycle 的 current backend；workspace source、runtime contract 与 result metadata 继续由 `tool-runtime` materialize 到 Item tool output metadata。当前 Aster provider bridge 只是未迁 provider/reply loop 前的 compat payload。
- `classification`：`current` 是 `lime-skills::run`、`tool-runtime::skill_execute` / `skill_gate` / `skill_result` / `skill_runtime_contract`；`compat` 是 `LimeSkillTool` 的 Aster `Tool` trait 外壳、`CurrentSessionSkillProvider` 对 Aster provider trait 的桥接和最终 `ToolResult` 类型转换；`dead / guarded` 是 Aster `SkillTool` backend、wrapper 内恢复子 Agent Skill execution、wrapper 内恢复第二份 preflight / metadata / normalization shape。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-skills --package tool-runtime --package lime-agent -- --check` 通过。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`134 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-aster-skill-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-skills run --lib -j 2` 通过，`5 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-aster-skill-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime skill_execute --lib -j 2` 通过，`4 passed`，且 warning 已清零。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_tool --lib -j 2` 通过，`7 passed`。
- `remaining`：root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster reply loop `ToolRegistry` / `Tool` trait 注册壳、provider/reply loop `Agent::reply` / `Message` / `AgentEvent` / provider trait、Aster `SessionStore` / `ThreadRuntimeStore` adapter 仍是 Phase 6 blocker。`agent` / `allowed_tools` Skill 的真正执行还需落 Turn runtime owner；整体目标完成度仍约 `95%`，不能上调为完成态。

### 2026-07-09：Batch B vendored SkillTool backend deletion

- `completed`：Codex 对照确认 Codex 有 `core-skills` loader / metadata / render / injection 主链，但没有 Aster 这种 vendored `SkillTool` 执行 backend + 全局 registry + 默认工具注册面。Lime current 已由 `lime-skills::skill_loader` / `lime-skills::run`、`tool-runtime::skill_execute` / `skill_gate` / `skill_result` 和 App Server runtime enable 消费链承接。
- `completed`：删除 vendored `lime-rs/vendor/aster-rust/crates/aster/src/skills/tool.rs`，并从 `skills/mod.rs` 移除 `pub mod tool` / `pub use tool::*`。Aster Skills module 只保留迁移期仍可能被编译依赖的 loader / registry / types / executor / workflow 参考面，不再暴露 Skill Tool backend。
- `completed`：`tools/mod.rs` 移除 `pub use crate::skills::SkillTool`、`config.allows_tool("Skill")` 默认注册和 `SkillTool::new()`，默认工具池测试改为断言 Aster defaults 不注册 `Skill` / `SkillTool`。
- `completed`：`tools/registry.rs` 的 default alias matrix 移除 `("Skill", &["SkillTool"])`；`SkillTool` 不再是 vendored Aster lookup alias。Lime current 模型可见工具名仍是 `Skill`，历史 `SkillTool` 前端读面后续应按 Evidence / transcript 兼容计划单独收口。
- `guarded`：`asterMigrationBoundary.test.ts` 在 Skill gate owner 测试中新增 vendor guard，要求 `skills/tool.rs` 物理不存在，且 `skills/mod.rs` / `tools/mod.rs` / `tools/registry.rs` production 段不得恢复 `SkillTool` module、public export、default registration 或 vendor alias matrix。
- `Thread / Turn / Item`：归属 Turn tool lifecycle / Skill invocation backend。Skill definition lookup、prompt/workflow execution、access gate 与 result metadata 都已在 current owner；本刀只删除 Aster duplicate backend，不改变仍未迁出的 Aster reply loop `Tool` trait 外壳。
- `classification`：`current` 是 `lime-skills::run`、`lime-skills::skill_loader`、`tool-runtime::{skill_execute, skill_gate, skill_result, skill_runtime_contract}` 和 App Server runtime enable；`compat` 是 `LimeSkillTool` 的 Aster `Tool` trait 外壳、当前 turn Aster provider bridge 与最终 Aster `ToolResult` 类型转换；`dead / deleted / forbidden-to-restore` 是 vendored Aster `SkillTool` backend、Aster default registration、Aster SkillTool alias matrix 和 Aster Skills `global_registry` 作为 Lime Skill lookup truth。
- `dependency hygiene`：vendored `Cargo.lock` 中 `aws-sdk-sts` 仍被并行变更锁到 `1.96.0`，与 `aws-config 1.8.12` / `aws-smithy-runtime 1.9.5` 冲突；本刀按 root `lime-rs/Cargo.lock` 的已验证状态把 vendored lock 最小锁回 `aws-sdk-sts 1.95.0`，不升级 Aster vendor AWS pin。
- `validated`：`cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-aster-vendor-skilltool-target" cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core test_register_all_tools --lib -j 2` 通过，`4 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-aster-vendor-skilltool-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent skill_tool --lib -j 2` 通过，`7 passed`。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package tool-runtime --package lime-skills -- --check` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`134 passed`。
- `remaining`：root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster reply loop `ToolRegistry` / `Tool` trait 执行壳、provider/reply loop `Agent::reply` / `Message` / `AgentEvent` / provider trait、Aster `SessionStore` / `ThreadRuntimeStore` adapter 仍是 Phase 6 blocker。整体目标完成度仍约 `95%`，不能上调到完成态；下一刀继续优先迁出 Aster reply loop native tool execution 或 provider/reply loop 最大 blocker。

### 2026-07-09：Batch B Aster-only plan mode tool deletion

- `completed`：Codex 对照确认 `/Users/coso/Documents/dev/rust/codex/codex-rs` 的模型可调用计划工具是 `update_plan`，plan mode 本身属于 Turn/session 状态与 stream parser / TUI interaction，不存在 Aster 式 `EnterPlanModeTool` / `ExitPlanModeTool` 工具 API。Lime current 已有 `tool-runtime::update_plan`、App Server `plan.final` / 前端计划轨消费链和 Inputbar 协作模式元数据，因此 `EnterPlanMode` / `ExitPlanMode` 按 `aster-only-dead` 处理，不迁成新 compat。
- `completed`：删除 vendored `lime-rs/vendor/aster-rust/crates/aster/src/tools/plan_mode_tool.rs`，并从 `tools/mod.rs` 移除 `pub mod plan_mode_tool`、public re-export、默认注册和 send-input callback wiring；默认工具池测试改为断言 Aster defaults 不注册 `EnterPlanMode` / `ExitPlanMode` 或对应 `*Tool` alias。
- `completed`：`tools/registry.rs` 的 default alias matrix 移除 `("EnterPlanMode", &["EnterPlanModeTool"])` 与 `("ExitPlanMode", &["ExitPlanModeTool"])`。vendored Aster 不再提供 plan-mode 工具 lookup alias。
- `completed`：Lime current surface 同步收口：`tool-runtime::native_overlay` 的临时 Aster registration allowlist 移除 `EnterPlanMode` / `ExitPlanMode`；`lime-agent/src/agent_tools/catalog.rs` 移除两个工具 catalog entry 和 alias normalization；`lime-core::tool_calling` 移除两个 tool discovery profile。
- `completed`：前端正向展示同步收口：`agentTextNormalization`、tool display exact config、process summary、harness planning signal、tool copy 和五语言 `agentRuntime` / `agentMessageList` 中的 Aster plan-mode 工具文案均删除。Inputbar 的 `agentChat.inputbar.plusMenu.planMode` 保留，因为它是 current 协作模式入口，不是 Aster 工具。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 forbidden-to-restore guard，要求 `plan_mode_tool.rs` 物理不存在，并禁止 vendor `tools/mod.rs` / `registry.rs`、`tool-runtime` allowlist、`lime-agent` catalog、`lime-core` discovery profile、frontend normalization/display/summary/harness 和 locale 文案恢复 `EnterPlanMode` / `ExitPlanMode` 正向 surface。
- `Thread / Turn / Item`：归属 Turn plan/collaboration mode 与 Item plan update projection。Codex 对齐的 current 工具是 `update_plan` checklist；计划模式本身不作为模型可调用工具暴露。GUI 继续消费 current plan / update_plan read model，不能再从 Aster `ExitPlanMode` tool call 推断 ready/planning。
- `classification`：`current` 是 `tool-runtime::update_plan`、App Server / 前端计划轨和 Inputbar 协作模式元数据；`compat` 不新增；`dead / deleted / forbidden-to-restore` 是 vendored Aster `EnterPlanModeTool` / `ExitPlanModeTool` backend、default registration、alias matrix、Lime catalog / allowlist / discovery 正向 surface 和前端专用展示文案。
- `validated`：`cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent --package tool-runtime --package lime-core -- --check` 通过。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".../lime-rs/target" cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core test_register_all_tools --lib -j 2` 通过，`4 passed`。首次使用 `/tmp/lime-aster-planmode-target` 的冷编译因临时 target 写满失败，已删除该本轮临时目录后改用仓库 target 重跑通过。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".../lime-rs/target" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_overlay --lib -j 2` 通过，`11 passed`。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".../lime-rs/target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::catalog --lib -j 2` 通过，`14 passed`。
- `validated`：`CARGO_TARGET_DIR="/tmp/lime-aster-planmode-target" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core tool_calling --lib -j 2` 在临时 target 写满前已通过，`20 passed`。
- `validated`：`npx prettier --check ...` 覆盖本刀 TS / JSON / guard 文件通过。
- `validated`：`npx vitest run "src/lib/api/agentTextNormalization.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/components/agent/chat/projection/agentUiEventProjection.test.ts" "src/components/agent/chat/projection/threadItemProjection.test.ts" "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`6 files / 205 tests passed`。
- `remaining`：本刀只删除 Aster-only plan-mode 工具面，没有删除 root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster reply loop `ToolRegistry` / `Tool` trait 执行壳、provider/reply loop `Agent::reply` / `Message` / `AgentEvent` / provider trait、Aster `SessionStore` / `ThreadRuntimeStore` adapter。整体目标完成度仍约 `95%`，不能上调到完成态；下一刀继续优先迁出 Aster reply loop native tool execution 或 provider/reply loop 最大 blocker。

### 2026-07-09：Batch B Aster-only SendUserMessage tool deletion

- `completed`：Codex 对照确认 `/Users/coso/Documents/dev/rust/codex/codex-rs` 没有 Aster 式 `SendUserMessage` / `BriefTool` 模型可调用工具；Codex current 的用户交互入口是 `request_user_input`，普通用户消息属于 Turn input / Thread message，不是 tool call。
- `completed`：删除 vendored `lime-rs/vendor/aster-rust/crates/aster/src/tools/send_user_message_tool.rs`，并从 `tools/mod.rs` 移除 module、public re-export、默认注册；默认工具池测试改为断言 Aster defaults 不注册 `SendUserMessage` / `BriefTool`。
- `completed`：`tools/registry.rs` 移除 `("SendUserMessage", &["BriefTool"])` default alias；vendored Aster 不再提供 `BriefTool` lookup alias。
- `completed`：Lime current surface 同步收口：`lime-agent/src/agent_tools/catalog.rs` 删除 `SendUserMessage` catalog entry、workspace default allow 和 `brief` / `BriefTool` / `SendUserMessageTool` alias normalization。`tool-runtime::native_overlay` registration allowlist 本来已不包含 `SendUserMessage`，本刀把 catalog 假入口一并移除。
- `completed`：前端正向展示同步收口：`agentTextNormalization` 删除 `BriefTool` / `SendUserMessage` 归一化；tool display config / subject / thread summary / process summary / tool copy 和五语言旧 tool label/group/summary 文案均删除。历史文本若仍出现 `BriefTool` 或 `SendUserMessage`，只走通用未知工具展示，不再伪装成 current 能力。
- `completed`：测试语义同步收口：`agentTextNormalization.test.ts` / `toolDisplayInfo.test.ts` 不再把 `BriefTool` / `SendUserMessage` 作为参考 JS 工具目录名或 current 展示样本；vendored `agent.rs` 的 subagent hidden-list 测试也不再用已删除工具名做样本。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 forbidden-to-restore guard，要求 `send_user_message_tool.rs` 物理不存在，并禁止 vendor `tools/mod.rs` / `registry.rs` / `agents/agent.rs`、`lime-agent` catalog、frontend normalization/display/summary 及其正向测试恢复 `SendUserMessage` / `BriefTool` surface。
- `Thread / Turn / Item`：用户消息归属 Turn input / Thread message；模型需要询问用户时只能走 current `request_user_input` tool。Item 展示只消费 current message / action_required / request_user_input read model，不再把 Aster `SendUserMessage` tool call 当用户消息同步事件。
- `classification`：`current` 是 `request_user_input`、Turn input message 与 Thread/Item message projection；`compat` 不新增；`dead / deleted / forbidden-to-restore` 是 vendored Aster `SendUserMessageTool` backend、`BriefTool` alias、Lime catalog / alias / workspace allow 和前端专用展示文案。
- `validated`：`cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-agent -- --check` 通过。
- `validated`：`npx prettier --check ...` 覆盖本刀 TS / JSON / guard 文件通过。
- `validated`：`npx vitest run "src/lib/api/agentTextNormalization.test.ts" "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/components/ToolCallDisplay.toolSearchActions.test.tsx" "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`4 files / 162 tests passed`。
- `validated`：`rg -n "SendUserMessage|BriefTool|sendusermessage|brieftool|send_user_message_tool|SEND_USER_MESSAGE_TOOL_NAME|toolCall\\.processSummary\\.userMessage|toolCall\\.label\\.userMessage|toolCall\\.groupTitle\\.userMessage" "src" "lime-rs/crates" "lime-rs/vendor/aster-rust/crates/aster/src" -g '*.rs' -g '*.ts' -g '*.tsx' -g '*.json'` 只剩负向断言命中。
- `interrupted-validation`：`CARGO_TARGET_DIR=".../lime-rs/target-aster-send-user-message" cargo test --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" -p aster-core test_register --lib -j 2` 独立 target 冷编译约 20 分钟仍未进入测试阶段，且共享 `lime-rs/target` 同时被并行 `app-server` Cargo 进程占用；为避免继续占用 CPU / 磁盘，本轮中断该验证，未将其计为通过。
- `remaining`：本刀删除一个 Aster-only 假工具面，但没有删除 root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster reply loop `ToolRegistry` / `Tool` trait 执行壳、provider/reply loop `Agent::reply` / `Message` / `AgentEvent` / provider trait、Aster `SessionStore` / `ThreadRuntimeStore` adapter。整体目标完成度仍约 `95%`，不能上调到完成态；下一刀仍应回到 Aster reply loop native tool execution 或 provider/reply loop 最大 blocker。

### 2026-07-09：Batch B Aster-only AnalyzeImageTool deletion

- `completed`：Codex 对照确认 `/Users/coso/Documents/dev/rust/codex/codex-rs` 没有 Aster 式 `analyze_image` 模型可调用工具。Codex current 图片链路是 user input image / local image preparation / `view_image` tool / image generation item，不存在“读取图片后返回 base64 的 AnalyzeImageTool”。
- `completed`：Lime current 保留 `analyze_image_input` execution restriction profile；它是权限 / policy profile，不是模型工具、catalog entry 或 frontend tool display surface。本刀只删除 Aster `AnalyzeImageTool` vendor 实现和专用展示，不删除该 current profile。
- `completed`：删除 vendored `lime-rs/vendor/aster-rust/crates/aster/src/tools/analyze_image.rs`，并从 `tools/mod.rs` 移除私有 `mod analyze_image`；vendored `agent.rs` 的 legacy hidden-list 测试不再用已删除工具名做样本。
- `completed`：前端正向展示同步收口：`toolDisplayConfig/core.ts` 删除 `analyzeimage` exact config；`toolDisplaySubject.ts` 不再把 `analyzeimage` 当 vision subject extractor；`toolProcessSummaryCopy.ts` 的 vision summary 只服务 `view_image`；`toolProcessSummary.test.ts` 删除 `analyze_image` 正向叙事断言；五语言 `agentRuntime` / `agentMessageList` 删除 `imageAnalyze` / `visionAnalyze` 文案。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 forbidden-to-restore guard，要求 `analyze_image.rs` 物理不存在，并禁止 vendor module、vendor agent hidden-list、frontend display config/copy/summary/subject/test 和 locale 文案恢复 `AnalyzeImageTool` / `analyze_image` / `imageAnalyze` / `visionAnalyze` surface。
- `Thread / Turn / Item`：图片作为 Turn user input / local image preparation 或 `view_image` tool output 进入 Item projection；`analyze_image_input` 只属于 Turn tool execution policy profile，不拥有模型 tool lifecycle 或 Item 展示文案。
- `classification`：`current` 是 input image / `view_image` / `analyze_image_input` policy profile；`compat` 不新增；`dead / deleted / forbidden-to-restore` 是 vendored Aster `AnalyzeImageTool` backend、private module、frontend exact display/process summary/i18n 专用展示。
- `validated`：五语言 `agentRuntime.json` / `agentMessageList.json` JSON parse 通过。
- `validated`：`cargo fmt --manifest-path "lime-rs/vendor/aster-rust/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`npx prettier --check ...` 覆盖本刀 TS / JSON / guard / roadmap 文件通过。
- `validated`：`npx vitest run "src/components/agent/chat/utils/toolDisplayInfo.test.ts" "src/components/agent/chat/utils/toolProcessSummary.test.ts" "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`3 files / 180 tests passed`。
- `validated`：`rg -n "analyze_image|AnalyzeImage|analyzeimage|imageAnalyze|visionAnalyze|toolCall\\.processSummary\\.vision\\.analyze|图像分析|圖片分析|Image analysis|画像分析|이미지 분석" "src" "lime-rs/crates" "lime-rs/vendor/aster-rust/crates/aster/src" -g '*.rs' -g '*.ts' -g '*.tsx' -g '*.json'` 只剩 `analyze_image_input` current policy profile、governance forbidden-to-restore guard 和 legacy evidence 文本命中。
- `remaining`：本刀继续清掉一个零注册 Aster-only 工具实现，但没有删除 root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster reply loop `ToolRegistry` / `Tool` trait 执行壳、provider/reply loop `Agent::reply` / `Message` / `AgentEvent` / provider trait、Aster `SessionStore` / `ThreadRuntimeStore` adapter。整体目标完成度仍约 `95%`，不能上调到完成态；下一刀优先处理 Aster reply loop native tool registry 壳或 provider/reply loop blocker。

### 2026-07-09：Batch B Aster Write/Edit vendor deletion

- `completed`：Codex 对照确认 Codex 有文件写入 / 编辑能力：模型侧 current 文件修改入口是 `apply_patch`，App Server / exec-server 另有受控 `write_file` / `fs_write_file` 文件系统 API；Codex 没有的是 Aster 这种 `WriteTool` / `EditTool` / `write_file` / `edit_file` 模型工具面。Lime current 已通过 `tool-runtime::apply_patch` 和前后端 tool summary / policy 链路消费 `apply_patch`，并保留 Artifact / workspace 写入投影链。本刀删除的是前序“production-disabled”的 Aster 写文件工具 vendor 残留，不删除 Lime current 文件写入 / 编辑能力。
- `completed`：删除 vendored `lime-rs/vendor/aster-rust/crates/aster/src/tools/file/write.rs` 与 `tools/file/edit.rs`；`tools/file/mod.rs` 只保留 ReadTool 与 read history，文档明确文件 mutation 归属 Lime `apply_patch`。
- `completed`：`tools/mod.rs` 移除 `WriteTool` / `EditTool` re-export、默认注册与正向测试断言；默认工具池改为断言 `Write` / `Edit` / `FileWriteTool` / `FileEditTool` 不存在。
- `completed`：`tools/registry.rs` 移除 `Write` / `Edit` default alias matrix；`FileWriteTool`、`FileEditTool`、`write_file`、`edit_file`、`create_file`、`developer__text_editor`、`mcp__system__write_file`、`mcp__system__edit_file` 不再解析为 vendored Aster native tool。
- `completed`：Aster reply loop tool surface 同步收口：`reply_parts.rs` 的 local workspace / compact tool surface 移除 `Write` / `Edit`，current surface 参数归一化不再适配这两个已删工具；`agent.rs` 的 subagent native allowlist 与可见工具测试移除 `Write` / `Edit`；`tools/hooks.rs` 默认 file operation hook 改为只匹配剩余 Aster `Read`。
- `completed`：Lime current catalog / execution policy 同步收口：`lime-agent/src/agent_tools/catalog.rs` 删除 `Write` / `Edit` catalog entries 和 legacy alias normalization；`agent_tools/execution/rules.rs` 不再把 `Write` / `Edit` 当 current workspace-path execution policy 目标；`lime-core::tool_calling` 删除 `Write` / `Edit` discovery profiles，`tool_search` 不再把 `FileWriteTool` / `FileEditTool` / `write_file` / `edit_file` 等 Aster alias 当可发现能力。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 forbidden-to-restore guard，要求 vendored `tools/file/write.rs` / `edit.rs` 物理不存在，并禁止 vendor file module、tools registry、reply surface、agent subagent allowlist、hooks、Lime catalog 和 execution policy 恢复 `Write` / `Edit` / `FileWriteTool` / `FileEditTool` / `write_file` / `edit_file` 等 Aster 文件修改 surface。
- `Thread / Turn / Item`：模型发起的文件修改归属 Turn tool lifecycle 的 `apply_patch` execution；patch diff / metadata 属于 Item tool output projection；App Server / host 受控文件写入属于 Host / App Server FS API 边界，不回填成 Aster `Write/Edit`。Aster `Read` 仍只是未迁出 reply loop 的临时读工具，不能再携带 Write/Edit read-before-write 语义。
- `classification`：`current` 是 `tool-runtime::apply_patch`、Lime `apply_patch` catalog / policy / GUI summary，以及 Artifact / workspace 写入投影链；`compat` 不新增；`dead / deleted / forbidden-to-restore` 是 vendored Aster `WriteTool` / `EditTool` backend、default registration、alias matrix、reply surface 白名单、Lime catalog fake current entry 和 execution policy 目标。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-core -- --check` 通过。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`143 passed`。
- `validated`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-core tool_calling --lib -j 2` 通过，`21 passed`，包含 `test_file_mutation_discovery_profiles_stay_deleted`。
- `validated`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::catalog --lib -j 2` 通过，`14 passed`。
- `validated`：`CARGO_BUILD_JOBS=2 cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent agent_tools::execution --lib -j 2` 通过，`33 passed`。
- `remaining`：本刀继续清空已迁文件修改工具的 Aster vendor 残留，但没有删除 root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster reply loop `ToolRegistry` / `Tool` trait 执行壳、provider/reply loop `Agent::reply` / `Message` / `AgentEvent` / provider trait、Aster `SessionStore` / `ThreadRuntimeStore` adapter。整体目标完成度仍约 `95%`，不能上调到完成态；下一刀仍优先迁出 Aster reply loop native tool execution 或 provider/reply loop blocker。

### 2026-07-09：Agent-compat Aster-only config CLI / manager deletion

- `completed`：删除 `lime-rs/crates/agent-compat/src/config/{agents_md_parser,config_command,config_manager,experiments,watcher}.rs`，并从 `config/mod.rs` 移除对应 `pub mod` / `pub use`。这批文件只服务 Aster `/config` CLI、多源配置 manager、AGENTS.md config watcher、experiments 和 atomic config watcher validator；没有 App Server、frontend、Evidence 或 current owner 消费链。
- `completed`：同步更新 `agent-compat/src/config/README.md`，避免继续把已删 staging config 面列为现役模块。保留 `AsterMode`、`PermissionManager`、`DeclarativeProviderConfig` 等仍被生产引用的最小 config blocker。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 forbidden-to-restore guard，要求上述 5 个文件物理不存在，且 `config/mod.rs` / `config/README.md` 不得恢复 `AgentsMdParser`、`ConfigCommand`、`ConfigManagerOptions`、`EnterprisePolicyConfig`、`ExperimentManager`、`AtomicConfigUpdate`、`ConfigValidator`、`DebouncedNotifier` 等 public surface。
- `Thread / Turn / Item`：该批 config CLI / watcher / experiment manager 不进入 Thread / Turn / Item current owner；如后续需要 provider credential onboarding、settings API 或 config warning，只能进入 Lime provider/settings/App Server current 主链。
- `classification`：`current` 不新增；`compat` 只保留仍被生产引用的 config blocker；`dead / deleted / forbidden-to-restore` 是 Aster-only `/config` CLI、多源 config manager、AGENTS.md config watcher、experiments manager 和 atomic watcher validator。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/owner-file-move-skeleton-plan.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "lime-rs/crates/agent-compat/src/config/README.md"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`143 passed`。
- `validated`：共享 target 的 `cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 因并行 Cargo build directory lock 等待超过 60 秒中断；改用 `CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="/tmp/lime-aster-config-clean-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过。保留既有 `reqwest default-features` workspace warning。
- `remaining`：本刀继续搬空 `agent-compat` staging surface，但没有删除 root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster reply loop `ToolRegistry` / `Tool` trait 执行壳、provider/reply loop `Agent::reply` / `Message` / `AgentEvent` / provider trait、Aster `SessionStore` / `ThreadRuntimeStore` adapter。整体目标完成度仍约 `95%`，不能上调到完成态；下一刀仍优先处理 provider/reply loop 或 Aster reply loop native tool registry 最大 blocker。

### 2026-07-09：Agent-compat context service / URI deletion

- `completed`：Codex 对照确认 `/Users/coso/Documents/dev/rust/codex/codex-rs` 没有 Aster `ContextService` / `ContextUri` / `ContextNamespace` / `aster://` context storage API；Codex 的 context 能力归属 AGENTS.md、Thread / Turn context materialization 和 current evidence/read model，不是 Aster 的 URI-backed context service。
- `completed`：删除 `lime-rs/crates/agent-compat/src/context/context_service.rs` 与 `context_uri.rs`；新增 `context/trace.rs` 只保留仍被 Aster event -> Lime runtime event 转换编译命中的 `ContextTraceStep`。
- `completed`：`context/mod.rs` 不再导出 `ContextService`、`ContextUri`、`ContextDocument`、`ContextLayer`、`ContextNamespace*` 或 `ContextReadResult`；后续一刀已继续把 `agent-compat` context surface 缩到只剩 `ContextTraceStep`，2026-07-10 又继续删除 root context 目录并把 current DTO 归到 `agent-protocol::context_trace`。
- `Thread / Turn / Item`：`ContextTraceStep` 暂归 Turn event materialization / Item read model projection 的 compat blocker；Aster URI context service 不进入 Thread / Turn / Item owner。
- `classification`：`dead / deleted / forbidden-to-restore` 是 Aster context service、context URI parser、`aster://` storage API 与相关 DTO；`compat` 是 `ContextTraceStep`；`current` 不新增。
- `guarded`：`asterMigrationBoundary.test.ts` 已把 `context_service.rs` / `context_uri.rs` 加入 deleted list，并禁止在 `agent-compat/src/context` 下恢复 `ContextService`、`ContextUri`、`ContextNamespace`、`ContextLayer`、`ContextDocument`、`ContextReadResult` 或 `aster://`。
- `validated`：`rg -n "context_service|context_uri|ContextService|ContextUri|ContextNamespace|ContextLayer|ContextDocument|ContextReadResult|aster://" "lime-rs/crates/agent-compat/src/context" "lime-rs/crates/agent-compat/src/lib.rs"` 无命中。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`144 passed`。
- `validated`：`CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="/tmp/lime-aster-context-service-clean-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过，`Finished dev profile ... in 10m 03s`；保留既有 `reqwest default-features` workspace warning。
- `remaining`：本刀继续缩小 `agent-compat` 体量，但没有删除 root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster reply loop `ToolRegistry` / `Tool` trait 执行壳、provider/reply loop `Agent::reply` / `Message` / `AgentEvent` / provider trait、Aster `SessionStore` / `ThreadRuntimeStore` adapter。整体目标完成度仍约 `95%`，下一刀仍应优先处理 provider/reply loop 或 Aster reply loop native tool registry blocker。

### 2026-07-10：Agent-compat root context surface 删除

- `completed`：新增 `agent-protocol::context_trace::ContextTraceStep`，`lime-agent` runtime protocol 的 `AgentContextTraceStep` 改为 current DTO alias；App Server / 前端继续消费既有 `context_trace` / `context.trace` 投影链。
- `completed`：删除 `agent-compat/src/context/{mod.rs,trace.rs}` 和 root `pub mod context;`；Aster reply loop / event source 未迁完前只在 `aster::agents::ContextTraceStep` 保留最小 compat 字段类型，不给 `agent-compat` 新增 `agent-protocol` 反向依赖。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-compat/src/context/**`、root `pub mod context;`、`crate::context::ContextTraceStep` 与外部 `aster::context::ContextTraceStep` 不得恢复。
- `classification`：`current` = `agent-protocol::context_trace::ContextTraceStep`；`compat blocker` = Aster `AgentEvent::ContextTrace` 的最小字段类型；`dead / deleted / forbidden-to-restore` = Aster root context public module。
- `remaining`：这只减少 root context public surface，不改变 R1/R2/R3/R4/R5/R6/R7 核心 blocker；下一刀仍按“未使用先删、简单先迁、复杂后置”继续。

### 2026-07-10：Agent-compat inline tests deletion

- `completed`：批量删除 `agent-compat/src` 下 88 个 `#[cfg(test)] mod tests` 内联测试模块，旧 Aster staging 正向测试不再夹在生产 crate 源码里作为迁移证据。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `agent-compat/src` 不得恢复 inline `#[cfg(test)] mod tests {`；原有 `agent-compat/tests/**`、`tests.rs` / `*_tests.rs` / `*_property_tests.rs` 守卫继续保留。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster compat staging crate 正向测试面；`current` = 必要回归迁到对应 Lime owner crate；`compat blocker` = 生产 provider / reply / tool / session 代码仍按 R2-R7 迁出或删除。
- `validated`：`rg -n "#\\[cfg\\(test\\)\\]\\s*mod\\s+tests\\s*\\{" "lime-rs/crates/agent-compat/src" -g "*.rs"` 无命中。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过；仅剩既有 `NativeRegistration::name` test-only warning。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`158 passed`。
- `remaining`：本刀大幅减少测试垃圾体量，但不改变 root `aster` dependency、`lime-agent` direct dependency、Aster provider trait object、native `ToolRegistry` 或 SessionStore blocker。

### 2026-07-09：Agent-compat tool I/O duplicate deletion

- `completed`：确认 `agent-compat/src/context/tool_io.rs`、`token_estimator.rs`、`pruner.rs` 与 `types.rs` 没有 Lime App Server / frontend / Evidence / runtime current 消费链；Lime 生产 tool I/O / token / truncation 规则已走 `tool-runtime::tool_io` current owner。
- `completed`：删除 `tool_io.rs`、`token_estimator.rs`、`pruner.rs` 与 `types.rs`；当时 `context/mod.rs` 只保留 `trace` module 与 `ContextTraceStep` re-export，后续已继续删除 root context 目录。
- `completed`：删除 `OverflowHandler::handle_overflow_with_pruning(...)` 这个零调用 pruning 入口，并删除零引用 `OverflowResult` 与 `compaction_attempted()` getter；`OverflowHandler` 只保留实际被 `Agent::reply` 使用的 compaction retry 状态与 `note_compaction_attempt()`。
- `Thread / Turn / Item`：`tool-runtime::tool_io` 归属 Turn tool lifecycle / Item tool output projection；context trace current DTO 后续已归 `agent-protocol::context_trace`，Aster event source 只剩最小 compat 字段类型；被删除的 Aster pruning/token/tool I/O helper 不进入 refactor v1 owner。
- `classification`：`current` 是 `tool-runtime::tool_io` 与后续 `agent-protocol::context_trace`；`compat` 是 Aster `AgentEvent::ContextTrace` 最小字段类型；`dead / deleted / forbidden-to-restore` 是 Aster context `tool_io`、heuristic `TokenEstimator`、`ProgressivePruner`、`PruningConfig` / `PruningLevel` 和未调用 pruning overflow path。
- `guarded`：`asterMigrationBoundary.test.ts` 已把 `pruner.rs`、`token_estimator.rs`、`tool_io.rs`、`types.rs` 加入 deleted list，要求 `agent-compat/src/context` 不恢复 `ProgressivePruner`、`TokenEstimator`、`ToolIo*`、`PruningConfig` 或 `PruningLevel`。
- `validated`：`rg -n "ProgressivePruner|TokenEstimator|ToolIo|PruningConfig|PruningLevel|handle_overflow_with_pruning|OverflowResult|compaction_attempted\\(|pub mod tool_io|pub mod pruner|pub mod token_estimator|pub\\(crate\\) mod types" "lime-rs/crates/agent-compat/src/context" "lime-rs/crates/agent-compat/src/agents/error_handling/overflow_handler.rs"` 无命中。
- `superseded`：早期 `find "lime-rs/crates/agent-compat/src/context" ...` 曾显示 context 目录只剩 `mod.rs` 与 `trace.rs`；2026-07-10 已继续删除 root context 目录。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="/tmp/lime-aster-context-service-clean-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过，`Finished dev profile ... in 20.78s`；保留既有 `reqwest default-features` workspace warning。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`144 passed`。
- `remaining`：本刀继续搬空 `agent-compat` context duplicate，但没有删除 root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster reply loop `ToolRegistry` / `Tool` trait 执行壳、provider/reply loop `Agent::reply` / `Message` / `AgentEvent` / provider trait、Aster `SessionStore` / `ThreadRuntimeStore` adapter。整体目标完成度仍约 `95%`。

### 2026-07-09：Agent-compat unused context framework deletion

- `completed`：删除 `lime-rs/crates/agent-compat/src/context/{agents_md_parser,cache_controller,compressor,file_mention,manager,priority_sorter,summarizer,window_manager}.rs`，并把 `context/mod.rs` 收成最小 compat surface。后续两刀已继续删除 `ContextService` / `ContextUri` 与 Aster context `tool_io` / pruning / token estimator duplicate。
- `completed`：裁剪后又删除 `context/types.rs`；`AgentsMdConfig`、`ContextConfig`、`ConversationTurn`、`Cache*`、`Compression*`、`FileMentionResult`、`ContextWindowStats`、`PruningConfig`、`PruningLevel` 等只服务已删 helper 的 DTO 均不再留在 `agent-compat`。
- `reason`：Codex 有 AGENTS.md / context owner，但不采用 Aster 这套自研 public API；Lime current 主链实际消费的是 prompt/hints、App Server context evidence、tool-runtime tool I/O、runtime event trace，而不是 `EnhancedContextManager`、`AgentsMdParser`、`MessageCompressor`、`CacheController`、`ContextWindowManager` 等 Aster helper。
- `Thread / Turn / Item`：`ContextTraceStep` 仍服务 Turn event -> Item/read model projection；tool I/O / token / truncation 规则由 `tool-runtime::tool_io` current owner 服务 Turn tool lifecycle / Item tool output 投影；被删除 helper 不进入 refactor v1 owner，后续如需要 AGENTS.md / context hydrate，必须按 Codex `agents_md` / Thread context owner 重新落到 Lime current 主链。
- `classification`：`dead / deleted / forbidden-to-restore` 是未消费的 Aster context framework helper 和 duplicate tool I/O / pruning / token helper；`compat` 是 `ContextTraceStep`；`current` 是 `tool-runtime::tool_io`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求上述 8 个文件不存在，`context/mod.rs` 不得恢复旧模块、旧 public helper 或 `pub mod types;` 完整框架出口，并禁止旧 context framework DTO 留在 `context/types.rs`。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`144 passed`。
- `validated`：`CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR="/tmp/lime-aster-context-clean-target" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过；保留既有 `reqwest default-features` workspace warning。
- `remaining`：本刀继续缩小 `agent-compat` 体量，但没有删除 root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster reply loop `ToolRegistry` / `Tool` trait 执行壳、provider/reply loop `Agent::reply` / `Message` / `AgentEvent` / provider trait、Aster `SessionStore` / `ThreadRuntimeStore` adapter。整体目标完成度仍约 `95%`，下一刀仍应优先处理 provider/reply loop 或 Aster reply loop native tool registry blocker。

### 2026-07-09：Provider stream cancel poll lifecycle current contract

- `completed`：把 Aster `reply_internal(...)` 内 provider stream cancel poll interval、timeout cancel reason、event-boundary cancel reason 迁入 `model-provider::provider_stream`，新增 `ProviderStreamPoll` / `ProviderStreamCancelReason` 作为 current contract。
- `corrected`：撤回 `agent-compat/src/agents/agent.rs` 对 `model-provider::provider_stream` current helper/type 的直接消费；`agent-compat` 仍保留本地 `PROVIDER_STREAM_CANCEL_*` 和两个 cancel reason 字符串，作为 R2/R9 staging 残留，退出条件是 provider stream execution 迁出后删除 `reply_internal(...)`。
- `Thread / Turn / Item`：Turn provider stream lifecycle 规则进入 `model-provider`；Aster reply loop 仍是 provider/tool/session/event source 的 compat blocker。
- `classification`：`current` 是 `model-provider::provider_stream` provider stream poll target contract；`compat` 是仍在 Aster `reply_internal(...)` 内的 provider stream execution；`staging residual` 是 Aster 文件本地 cancel reason 字符串，不能作为 current 证据。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 model-provider 承接 `ProviderStreamPoll` / `ProviderStreamCancelReason` / poll helper，禁止 agent-compat 生产代码 import current poll helper/type，并显式追踪本地 cancel reason 常量为待删除残留。
- `pending validation`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package model-provider --package aster-core -- --check`、`cargo test --manifest-path "lime-rs/Cargo.toml" -p model-provider provider_stream --lib -- --nocapture`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 1`、`cargo check --manifest-path "lime-rs/Cargo.toml" -p app-server -j 1`、`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`。
- `remaining`：没有删除 root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster provider trait object、Aster reply loop native tool registry 或 session store；整体目标完成度仍约 `95%`。

### 2026-07-10：Agent-compat concrete provider public surface 收缩

- `completed`：`agent-compat/src/providers/mod.rs` 将 concrete provider implementation / helper modules 从 `pub mod` 收缩为 `pub(crate) mod`；`providers/formats/mod.rs` 将 provider-specific wire-format helper 从 `pub mod` 收缩为 `pub(crate) mod`。对外只保留 R2/R3 未迁完前必需的 `base`、`errors`、`formats::openai_responses` 与 factory exports。
- `Thread / Turn / Item`：provider backend 与 stream execution 归 Turn provider runtime / `model-provider` current owner；Aster concrete provider implementation 只剩 crate-private staging，不进入 Thread / Turn / Item current API。
- `classification`：`dead / guarded` = `aster::providers::<provider>` public API 与 provider-specific `formats::<provider>` public API；`compat blocker` = Aster provider trait object、`reply_with_provider(...)` 和 `ProviderReplyExitSource` 最后一跳；`current` = `model-provider` / App Server provider check 主链。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 concrete provider public surface 守卫，禁止恢复 concrete provider modules 和 provider-specific format modules 的 `pub mod`。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过；仍有既有 `NativeRegistration::name` unused warning。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`162 passed`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 与 scoped `git diff --check` 通过。
- `remaining`：本刀只缩小 provider public API，不迁出 provider execution。root `aster` dependency、`lime-agent` 的 `aster.workspace = true`、Aster provider trait object、Aster reply loop `Message` / `AgentEvent`、native `ToolRegistry` 和 `SessionStore` / `ThreadRuntimeStore` 仍是 Phase 6 blocker；整体目标完成度仍约 `95%`，彻底搬空口径约 `79%`。

### 2026-07-10：Agent-compat config public surface 收缩

- `completed`：`agent-compat/src/config/mod.rs` 将 `aster_mode`、`base`、`declarative_providers`、`extensions`、`permission`、`search_path` 从 `pub mod` 收缩为 `pub(crate) mod`，并把 `Config`、`ConfigError`、`AsterMode`、`PermissionManager`、`DeclarativeProviderConfig`、extension config helper re-export 收缩为 crate-private。
- `completed`：删除未使用的 extension config re-export；外部生产引用扫描只剩 `aster::config::paths::initialized_path_root()`，因此 `paths` 暂时保留 public，退出条件是 R5/R6 session/runtime store adapter 迁出。
- `Thread / Turn / Item`：Aster config 不进入 Thread / Turn / Item current owner；path root 只服务 session/runtime store compat adapter。provider/settings/config UI/API 必须进入 Lime current provider/settings/App Server 主链。
- `classification`：`dead / guarded` = `aster::config::*` public API surface；`compat blocker` = `config::paths` path root adapter；`current` = Lime provider/settings/App Server config 主链。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 config staging 守卫，禁止除 `paths` 外恢复 Aster config public modules / public re-export。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check` 通过。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过；仍有既有 `NativeRegistration::name` unused warning。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`164 passed`。
- `remaining`：本刀只收缩 config public surface，没有删除 root `aster` dependency、Aster provider trait、reply loop、native tool registry、`SessionStore` 或 `ThreadRuntimeStore`；整体目标完成度仍约 `95%`，彻底搬空口径约 `79%`。

### 2026-07-10：Agent-compat tools/session root re-export 收缩

- `completed`：`agent-compat/src/tools/mod.rs` 将工具实现子模块收缩为 crate-private staging，外部生产引用改为 root `aster::tools::{...}` 最小面；`aster::tools::ask::*` 子模块路径清零。
- `completed`：`tools/file/mod.rs` 与 `tools/search/mod.rs` 不再暴露 `read` / `glob` / `grep` 实现子模块；继续通过 root re-export 保留 Aster reply loop 未迁完前需要的 `ReadTool`、`GlobTool`、`GrepTool`、read history 与 `SearchResult`。
- `completed`：删除零引用 `tools/file/diff_summary.rs` 与 `tools/search/ripgrep.rs`；前者只服务已删除的旧文件 mutation 面，后者没有被 `GrepTool` 使用，且带 `.aster/bin` vendored rg 路径，不进入 Codex-first current owner。
- `completed`：`session/mod.rs` 将 `extension_data` / `session_manager` 改为 private module；外部生产引用改为 root `aster::session::ExtensionData`，避免继续暴露 `aster::session::extension_data::*` 子模块 API。
- `Thread / Turn / Item`：Turn tool lifecycle / tool execution 仍归 `tool-runtime`；Aster tools root re-export 只是 R4 reply loop native registry blocker。Thread session owner 仍是 Thread / App Server / `thread-store`；Aster session root re-export 只是 R5/R6 adapter blocker。
- `classification`：`dead / deleted / forbidden-to-restore` = `diff_summary`、vendored `ripgrep` helper、tools/session 实现子模块 public API；`compat blocker` = root `Tool` / `ToolRegistry` / `ToolContext` / `SessionStore` / `ThreadRuntimeStore` 最小面；`current` = `tool-runtime`、apply_patch / file-change projection、Thread/App Server session owner。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 tools/session root re-export 守卫，禁止恢复 `pub mod ask` / `pub mod file` / `pub mod search` / `pub mod extension_data` 等 public module，也禁止恢复 `FileChangeSummary` / `RipgrepOptions` / `.aster/bin` helper。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent` 通过。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-tools-public-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-tools-public-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过；仍有既有 `NativeRegistration::name` unused warning。
- `remaining`：本刀不迁出 R4/R5/R6 核心；root `aster` dependency、Aster `ToolRegistry` / `Tool` trait、`SessionStore` / `ThreadRuntimeStore`、provider/reply loop 最后一跳仍是 Phase 6 blocker。整体目标完成度仍约 `95%`，彻底搬空口径约 `79%`。

### 2026-07-10：Agent-compat conversation/model/recipe/tool inspection root re-export 收缩

- `completed`：`agent-compat/src/conversation/mod.rs` 将 `message` 从 public module 收缩为 crate-private staging；外部生产引用从 `aster::conversation::message::*` 改为 `aster::conversation::{...}` 最小面。
- `completed`：`agent-compat/src/lib.rs` 将 `model`、`recipe`、`tool_inspection` 从 `pub mod` 收缩为 private module；外部生产引用改为 root `aster::ModelConfig`、`aster::Recipe`、`aster::{InspectionAction, InspectionResult, ToolInspector}` 等过渡面。
- `Thread / Turn / Item`：Aster `Message` / `Conversation` 属于 R2/R6 reply/event source compat blocker；`ModelConfig` 属于 provider/reply 最后一跳 blocker；`Recipe` 属于 session metadata / subagent staging blocker；tool inspection DTO 属于 R4 native tool execution / approval bridge blocker。它们都不是 refactor v1 current owner。
- `classification`：`dead / guarded` = `conversation::message`、`model`、`recipe`、`tool_inspection` public submodule API；`compat blocker` = root 最小 re-export；`current` = 后续必须迁到 Thread / Turn / Item、`agent-protocol`、`model-provider`、`tool-runtime` 或 App Server read model。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复这些 public module，并禁止 `lime-agent` 继续穿透 `aster::conversation::message` / `aster::model` / `aster::recipe` / `aster::tool_inspection` 路径。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-conversation-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过。
- `validated`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过；仍有既有 `NativeRegistration::name` unused warning。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`168 passed`。
- `remaining`：本刀只收缩 public surface，不迁出 R2/R3 provider trait object、R4 native registry 或 R5/R6 session/runtime store；整体目标完成度仍约 `95%`，彻底搬空口径约 `79%`。

### 2026-07-10：R4 native tool result projection 前移

- `completed`：新增 `tool-runtime::tool_result_projection`，承接 native tool result 到 MCP `CallToolResult` 的 current projection：success/error 文本选择、metadata -> `structured_content`、`model_visible_image` / `image_url` 模型可见图片内容附加，以及 `tool_surface_updated` 判定。
- `completed`：`agent-compat/src/agents/agent.rs` 删除本地 `native_tool_result_to_call_tool_result(...)`、`tool_surface_updated_from_call_tool_result(...)`、metadata fallback 和 model-visible image helper，只把 Aster `ToolResult` 字段搬运到 `RuntimeToolResultParts` 后调用 current helper。
- `Thread / Turn / Item`：该能力归属 Turn tool lifecycle result projection；Item/read model 仍经未迁完的 Aster reply loop adapter 消费结果，不能把本刀写成 R4 完成态。
- `classification`：`current` = `tool-runtime::tool_result_projection`；`compat blocker` = Aster `ToolRegistry::execute(...)` / `Tool` / `ToolContext` / `ToolResult` 仍服务 reply loop native tool execution；`dead / guarded` = `agent-compat` 本地 result projection 纯规则。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tool_result_projection.rs` 持有 current projection helper，并禁止 `agent.rs` 恢复本地 native tool result projection helper。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package tool-runtime --package aster-core --package lime-agent -- --check` 通过。
- `validated`：`CARGO_TARGET_DIR=".lime/cargo-target/tool-result-projection-tool-runtime" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime tool_result_projection --lib -j 1 -- --nocapture` 通过，`3 passed`。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/provider-image-input-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture` 通过，`81 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`168 passed`。
- `remaining`：下一刀仍需把 reply loop native execution 从 Aster `ToolRegistry::execute(...)` 替换为 `tool-runtime::native_dispatch` / current gateway executor；root `aster` dependency 和 `lime-agent` 的 `aster.workspace = true` 仍不能删除。

### 2026-07-10：Agent-compat agents root re-export 收缩

- `completed`：`agent-compat/src/lib.rs` 将 `agents` 顶层模块从 public API 收缩为 private staging；root 最小 re-export 暂留 `Agent`、`AgentEvent`、`AgentIdentity`、`ExtensionConfig`、`McpClientTrait`、`SessionConfig`、provider trace、live execution hook 和 `ToolCallResult` 等 blocker 类型。
- `completed`：`lime-agent` 外部引用从 `aster::agents::*`、`aster::agents::extension::*`、`aster::agents::mcp_client::*` 改为 root `aster::{...}` 过渡面；`aster::agents::*` 路径扫描清零。
- `Thread / Turn / Item`：Aster `Agent` / `AgentEvent` 属于 Turn reply/event source compat blocker；MCP extension bridge 属于 R7；live execution hook / tool call result 属于 R4。它们不是 current owner，后续仍要迁到 `agent-runtime`、`tool-runtime`、`lime-mcp` 和 App Server 主链。
- `classification`：`dead / guarded` = `aster::agents::*` 外部 public module path；`compat blocker` = root 最小 re-export；`current` = 迁出后的 Thread / Turn / Item、MCP gateway 与 tool lifecycle owner。
- `guarded`：`asterMigrationBoundary.test.ts` 新增 agents 顶层模块守卫，禁止恢复 `pub mod agents;` 和外部 `aster::agents::*` 路径。
- `validated`：`rustfmt --edition 2021 --check` 覆盖本轮 Rust 写集。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-agents-root-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过。
- `validated`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过；仍有既有 `NativeRegistration::name` unused warning。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`171 passed`。
- `remaining`：本刀不迁出 provider/reply loop、native registry 或 session/runtime store；root `aster` dependency、`aster.workspace = true` 和 `agent-compat` staging crate 仍不能删除。

### 2026-07-10：Agent-compat config root re-export 收缩

- `completed`：`agent-compat/src/lib.rs` 将 `config` 顶层模块从 public API 收缩为 private staging；root 只保留 `initialized_path_root()` 作为 R5/R6 runtime store adapter 的过渡 helper。
- `completed`：`runtime_store_aster_adapter.rs` 改为调用 `aster::initialized_path_root()`；`aster::config::*` 路径扫描清零。
- `Thread / Turn / Item`：Aster config 不进入 refactor v1 current owner；runtime root path 后续必须随 Thread/runtime store adapter 迁出后删除。
- `classification`：`dead / guarded` = `aster::config::*` 外部 public module path；`compat blocker` = root `initialized_path_root()`；`current` = provider/settings/App Server config 和 Thread/runtime store owner。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `pub mod config;` 和外部 `aster::config::*` 路径。
- `validated`：`rustfmt --edition 2021 --check` 覆盖本轮 Rust 写集。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-agents-root-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过。
- `validated`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过；仍有既有 `NativeRegistration::name` unused warning。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`171 passed`。
- `remaining`：本刀不迁出 R5/R6 runtime store 本体；root `aster` dependency 和 `agent-compat` staging crate 仍不能删除。

### 2026-07-10：Agent-compat providers root re-export 收缩

- `completed`：`agent-compat/src/lib.rs` 将 `providers` 顶层模块从 public API 收缩为 private staging；`providers::{base,errors,formats}` 与 `formats::openai_responses` 均降为 crate-private staging。
- `completed`：`lime-agent` 外部引用从 `aster::providers::*` 改为 root `aster::{Provider, ProviderError, MessageStream, RetryConfig, create_provider, ...}` 过渡面；`aster::providers::*` 路径扫描清零。
- `Thread / Turn / Item`：provider trait object、provider reply source、Aster `Message` / `AgentEvent` 仍属于 Turn execution blocker；本刀不迁出 `ProviderReplyExitSource` 或 `reply_with_provider(...)`。
- `classification`：`dead / guarded` = `aster::providers::*` 外部 public module path；`compat blocker` = root provider 最小 re-export；`current` = `model-provider` / App Server provider 主链。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `pub mod providers;`、provider base/error/format public module，以及外部 `aster::providers::*` 路径。
- `validated`：`rustfmt --edition 2021 --check` 覆盖本轮 Rust 写集。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-root-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过。
- `validated`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过；仍有既有 `NativeRegistration::name` unused warning。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`171 passed`。
- `remaining`：R2/R3 provider backend / reply loop 最后一跳未迁完；root `aster` dependency 和 `agent-compat` staging crate 仍不能删除。

### 2026-07-10：Agent-compat conversation/session/tools root re-export 收缩

- `completed`：`agent-compat/src/lib.rs` 将 `conversation`、`session`、`tools` 顶层模块从 public API 收缩为 private staging，并通过 root 最小 re-export 暂留 R2/R4/R5/R6 blocker 类型。
- `completed`：`lime-agent` 外部生产 / 测试引用从 `aster::conversation::*`、`aster::session::*`、`aster::tools::*` 批量改为 `aster::{...}` root 过渡面；`agent-compat` session 文档示例同步停止使用退役 module path。
- `Thread / Turn / Item`：message/conversation 仍属 Turn reply/event source 与 Item projection blocker；session/runtime store 仍属 Thread/Turn blocker；tool registry / Tool trait 仍属 Turn tool lifecycle blocker。
- `classification`：`dead / guarded` = `aster::conversation::*` / `aster::session::*` / `aster::tools::*` 外部 public module path；`compat blocker` = root 最小 re-export；`current` = 对应能力后续必须迁入 `agent-runtime`、`agent-protocol`、`thread-store`、`tool-runtime`、`model-provider` 或 App Server。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 root `pub mod conversation/session/tools` 和 `lime-agent` 外部 module path 穿透。
- `validated`：`rg -n "aster::(conversation|session|tools)::|aster::(conversation|session|tools)\\{" "lime-rs/crates/agent" -g "*.rs"` 无命中。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-root-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过；仍有既有 `NativeRegistration::name` unused warning。
- `remaining`：本刀不删除 root `aster` dependency，不迁出 provider/reply loop、native registry 或 session/runtime source；整体目标仍按骨架约 `95%`、彻底搬空约 `80%` 追踪。

### 2026-07-10：Agent-compat session/tools wildcard root re-export 下线

- `completed`：`agent-compat/src/lib.rs` 不再 `pub use session::*;` / `pub use tools::*;`；root 只显式导出 `ThreadRuntimeStore` / `SessionRuntimeSnapshot` / `QueuedTurnRuntime`、`Tool` / `ToolContext` / `ToolRegistry` / `PermissionCheckResult` 等仍被 `lime-agent` adapter 使用的 blocker。
- `completed`：`session/mod.rs`、`tools/mod.rs`、`tools/search/mod.rs` 删除无消费者 re-export；`tools/search` 去掉已删除 vendored ripgrep helper 的过期说明。
- `classification`：`dead / guarded` = broad wildcard root surface 与无消费者 private re-export；`compat blocker` = 显式 root allowlist；`current` = R4/R5/R6 后续 owner 仍是 `tool-runtime`、`thread-store`、`agent-runtime`、`agent-protocol` 与 App Server。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `pub use session::*;` / `pub use tools::*;`，并要求 allowlist 明确列出仍未迁的 blocker 类型。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-provider-root-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过。
- `validated`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过；仍有既有 `NativeRegistration::name` unused warning。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`172 passed`。
- `remaining`：本刀只让剩余 Aster surface 可枚举，不迁 provider/reply loop、native registry 或 session/runtime source；root `aster` dependency 仍不能删。

### 2026-07-10：BashTool root surface 下线

- `completed`：Windows shell runtime 验证从 `aster::BashTool` 改为 `tool-runtime::shell_runtime::build_platform_shell_command(...)`，证明平台 shell fallback current owner 可直接承担该测试入口。
- `completed`：`agent-compat/src/lib.rs` root tools allowlist 删除 `BashTool`，外部 `aster::BashTool` 引用扫描清零。
- `classification`：`current` = `tool-runtime::shell_runtime`；`dead / guarded` = `aster::BashTool` root surface；`compat blocker` = Aster 内部 `BashTool` registry fallback 仍随 R4 待迁。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止 `agent/src` / `agent/tests` 恢复 `aster::BashTool`，并要求 root allowlist 不包含 `BashTool`。
- `validated`：`rustfmt --edition 2021 --check "lime-rs/crates/agent/tests/windows_shell_runtime.rs" "lime-rs/crates/agent-compat/src/lib.rs"` 通过。
- `validated`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib` 与 `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib` 通过；`lime-agent` 仍有既有 `NativeRegistration::name` unused warning。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`172 passed`。
- `blocked-by-env`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --target x86_64-pc-windows-msvc --test windows_shell_runtime -j 2` 因本机 Windows C target header 缺失，在 `ring` 编译时报 `assert.h` missing；未进入本次测试代码。
- `remaining`：继续迁 R4 Bash/PowerShell execution 内部 registry fallback，最终删除 Aster `Tool` trait 壳。

### 2026-07-10：R4 具体工具实现 public surface 下线

- `completed`：`agent-compat/src/tools/mod.rs` 将 `BashTool` / `PowerShellTool` / `ReadTool` / `GlobTool` / `GrepTool` / `AskTool` / `DEFAULT_ASK_TIMEOUT_SECS` re-export 收成 `pub(crate)`，不再作为 Aster public API。
- `completed`：`agent-compat/src/tools/file/mod.rs` 与 `agent-compat/src/tools/search/mod.rs` 的实现 re-export 和 file-read history surface 收成 crate-private；`register_all_tools(...)` / `register_default_tools(...)` 也收成 crate-private，只服务未迁的 reply-loop registry fallback。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止 `tools/mod.rs` / `tools/file/mod.rs` / `tools/search/mod.rs` 恢复公开 re-export 具体 `*Tool` 实现类型，并禁止 `lime-agent` 外部生产恢复 `aster::BashTool` / `aster::ReadTool` / `aster::GlobTool` / `aster::GrepTool` / `aster::AskTool` / `aster::PowerShellTool`。
- `classification`：`dead / guarded` = 具体 Aster `*Tool` 实现 public surface；`compat blocker` = crate-private Aster `ToolRegistry` / `Tool` fallback 与最小 `RequestUserInputCallback` 配置字段；`current` = `tool-runtime::native_dispatch`、`tool-runtime::request_user_input` 和后续 current gateway executor。
- `Thread / Turn / Item`：Turn tool execution 不再把具体 Aster 实现类型当协议或公开 API；Item/read model 只消费 current tool lifecycle projection。
- `validated`：`rustfmt --edition 2021 --check "lime-rs/crates/agent-compat/src/tools/mod.rs" "lime-rs/crates/agent-compat/src/tools/file/mod.rs" "lime-rs/crates/agent-compat/src/tools/search/mod.rs"` 通过。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/exec-plans/aster-phase6-provider-reply-backend-plan.md" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`172 passed`。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/aster-tools-impl-surface-private" CARGO_BUILD_JOBS=2 cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2` 通过，仅有既有 `SessionPlanModeState` unused import warning。
- `validated`：同 target `cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 2` 通过，仅有既有 `NativeRegistration::name` unused warning。
- `remaining`：本刀未删除内部 registry fallback；Read/Grep/Glob 后续已迁到 `tool-runtime::{file_read_execution,file_search_execution}`，剩余 Ask/Skill/gateway-backed/MCP、background / sandbox shell 等执行壳仍需迁到 current owner。

### 2026-07-10：R4 team tool 具体实现 public surface 下线

- `completed`：`agent-compat/src/tools/mod.rs` 不再公开 re-export `TeamCreateTool` / `TeamDeleteTool` / `ListPeersTool`；`agent-compat/src/tools/team_tools.rs` 的具体类型和构造器也降为 crate-private。
- `kept`：`SpawnAgentRequest` / `SpawnAgentResponse` 与 `AgentControlToolConfig` 仍作为 callback bridge blocker 暂留；它们不是 team 具体工具实现 public surface。
- `classification`：`dead / guarded` = Aster team 具体工具实现 public surface 与外部 `aster::TeamCreateTool` / `aster::TeamDeleteTool` / `aster::ListPeersTool`；`compat blocker` = crate-private Aster team `Tool` trait fallback；`current` = `tool-runtime` tool exposure / registration gate 与后续 current team / multi-agent executor。
- `Thread / Turn / Item`：team / multi-agent 执行属于 Turn owner，输出和协作状态必须经 Item/read model 投影；Aster team `Tool` 类型不能作为协议或公开 API。
- `remaining`：Team/Agent/SendMessage registry fallback 仍未迁出；后续需进入 `agent-runtime` / `tool-runtime` current owner 后删除 Aster `Tool` trait 壳。

### 2026-07-10：R4 标准 native dispatch execution owner 固定到 tool-runtime

- `completed`：新增 `tool-runtime::native_dispatch_execution`，承接 dispatch-backed 标准 native tools 的接管判定、permission preflight、cancel fail-fast、current dispatcher 调用和 `CallToolResult` 投影。
- `completed`：`agent-compat/src/agents/agent.rs` 不再直接 import `runtime_native_dispatch_handle`、`check_runtime_native_tool_permissions` 或 `RuntimeNativePermissionDecision`；只把 Aster `ToolContext`、session id、cancel token 与 current turn context 适配为 `RuntimeNativeDispatchToolRequest`。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tool-runtime/src/native_dispatch_execution.rs` 存在并持有 execution owner；禁止 `agent-compat` 恢复 dispatch / permission 编排。
- `classification`：`current` = `tool-runtime::native_dispatch_execution`；`compat blocker` = Aster `ToolRegistry::execute(...)` fallback 仍服务 background / sandbox shell、Ask/Skill、gateway-backed tools 与 MCP / extension bridge；`dead / guarded` = 在 staging loop 内恢复标准 native dispatch 编排。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime native_dispatch_execution --lib -j 2 -- --nocapture` 通过，`2 passed`。
- `validated`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2 -- --nocapture` 通过，`81 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`172 passed`。
- `remaining`：R4 未完成；必须继续把剩余 registry fallback 工具迁到 `tool-runtime` / `agent-runtime` / `lime-mcp` / `lime-skills` current owner 后，才能删除 Aster `ToolRegistry` / `Tool` / `ToolContext` 和 root `aster` dependency。

### 2026-07-10：R4 Bash / PowerShell 前台执行能力接收

- `completed`：`tool-runtime::shell_execution` 接收 Bash / PowerShell foreground execution：参数解析、shell permission、missing read target / blocked sleep / Windows WSL path preflight、foreground subprocess、bounded output、decode / truncation metadata 与 `CallToolResult` projection。
- `completed`：reply loop native branch 在 live-execution hook 后先走 current shell executor，再走 current native dispatch executor，最后才 fallback 到 Aster `registry.execute(...)`；`agent-compat` 只做 `ToolContext` -> `RuntimeShellToolRequest` 适配。
- `completed`：full-access 不确认语义写入 current owner。`approval_policy=never`、`sandbox_policy=danger-full-access` 或 turn metadata `accessMode=full-access` 时，warning command 不再触发 Aster confirmation fallback；非 full-access warning 仍 fallback，保留现有 HITL 退场边界。
- `classification`：`current` = `tool-runtime::shell_execution`；`compat blocker` = background execution、workspace sandbox、Ask / Skill、gateway-backed tools、MCP / extension bridge 和 Aster `Tool` trait 壳；`dead / guarded` = Aster shell execution owner、Aster approval cache / pending map、`ASTER_TERMINAL` 环境标记。
- `Thread / Turn / Item`：Turn 管 shell execution 和 permission preflight；Item/read model 只消费 projected tool result / metadata；Approval / HITL current owner 仍是 App Server RuntimeCore pending action 与 `tool-runtime::execution_approval`，本刀不在 Aster 中新增 approval 逻辑。
- `validated`：`rustfmt --edition 2021 --config skip_children=true --check` shell 写集通过。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/provider-progress-lime-agent" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime shell_execution --lib -j 2 -- --nocapture`，`7 passed`。
- `validated`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2 -- --nocapture`，`81 passed`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`172 passed`。
- `validated`：Gate B Electron CDP `approval-request-full-access` 通过，命令为 `LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:claw-chat-current-fixture -- --scenario approval-request-full-access --timeout-ms 240000 --cdp-port 9232 --prefix claw-chat-current-fixture-approval-full-access-shell-r4-after-input-helper --evidence-dir ".lime/qc/gui-evidence/claw-chat-current-fixture"`；summary 为 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-approval-full-access-shell-r4-after-input-helper-summary.json`，证明 full-access shell warning 不弹确认。
- `validated`：Gate A 聚合 `LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:agent-runtime-current-fixture` 完整通过，覆盖 approval resume/decline/cancel/full-access、inputbar restore/pending steer、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、media reference 与 Content Factory Article Editor，`liveProviderUsed=false`。
- `fixture-only`：`claw-chat-current-fixture-gui-actions.mjs` 使用 controlled textarea setter + `InputEvent("input")` + `change` 修复中文 mention prompt 输入污染；`claw-chat-current-fixture-smoke.test.mjs` 已补 helper 守卫。该 helper 不进入 production inputbar 主链。
- `remaining`：该能力接收只收前台 shell；Read/Grep/Glob 后续已迁到 `tool-runtime`，R4 registry fallback 仍需继续迁 Ask/Skill/gateway-backed/MCP、background / sandbox shell 和其余 tool trait 壳，不能删除 root `aster` dependency。

### 2026-07-10：R4 Read / Glob / Grep 前台执行能力接收

- `completed`：`tool-runtime::file_read_execution` 接收 Read foreground execution：路径解析、文本 line-numbered 输出、document preview、SVG / Notebook 文本抽取、图片 / PDF retired fail-closed 与 `CallToolResult` metadata projection。
- `completed`：`tool-runtime::file_search_execution` 接收 Glob / Grep foreground execution：Glob pattern / exclude / mtime 排序 / max_results，Grep regex parse、content / files_with_matches / count 模式、hidden 文件策略、binary skip、输出截断与 metadata projection。
- `completed`：reply loop native branch 在 collab / shell current executor 后、native dispatch / Aster registry fallback 前先走 current read/search executor；`agent-compat` 只做 working directory / cancellation token 适配。
- `classification`：`current` = `tool-runtime::{file_read_execution,file_search_execution}`；`compat blocker` = Aster `Tool` trait 壳、ToolRegistry fallback、Ask/Skill/gateway-backed/MCP、background / sandbox shell；`dead / guarded` = Aster Read image/PDF multimodal payload、`agent-compat` 本地文件读取 / 搜索执行 owner。
- `Thread / Turn / Item`：Read/Glob/Grep 是 Turn tool execution；Item/read model 只消费 materialized tool result / metadata；Thread 只提供 cwd / session context。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 current owner 不 import Aster，要求 reply loop 在 `registry.execute(...)` 前调用 read/search executor，并禁止 `agent.rs` 恢复本地 Read / Glob / Grep execution owner。
- `validated`：`rustfmt --edition 2021 --config skip_children=true --check "lime-rs/crates/tool-runtime/src/file_read_execution.rs" "lime-rs/crates/tool-runtime/src/file_search_execution.rs" "lime-rs/crates/tool-runtime/src/lib.rs" "lime-rs/crates/agent-compat/src/agents/agent.rs"` 通过。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/file-search-execution" cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime file_read_execution --lib -j 2 -- --nocapture`，`3 passed`。
- `validated`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime file_search_execution --lib -j 2 -- --nocapture`，`3 passed`。
- `validated`：同 target `cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 2 -- --nocapture`，`81 passed`。
- `remaining`：R4 仍未完成；Ask/Skill/gateway-backed/MCP、background / sandbox shell、Aster `Tool` trait 壳、R2/R3 provider reply exit source 与 R5/R6 session/runtime source 仍阻塞 root `aster` dependency 删除。

### 2026-07-10：R4 request_user_input execution owner 与 AskTool 壳删除

- `completed`：`tool-runtime::request_user_input` 新增 `RequestUserInputCallback`、`request_user_input_tool_definition()` 与 `execute_request_user_input(...)`，承接 callback timeout、response normalization、result projection 和模型可见 definition。
- `completed`：`agent-runtime::request_user_input` re-export current callback 类型并继续保留 Turn-side gateway runner；`lime-agent/src/request_user_input_bridge.rs` 返回 current callback 类型，不再从 `aster` root 引入 `AskCallback`。
- `completed`：删除 `agent-compat/src/tools/ask.rs`；`agent-compat/src/tools/mod.rs::register_all_tools(...)` 不再注册 Aster `AskTool`，只保留 `RequestUserInputCallback` 过渡配置字段。
- `completed`：`agent-compat/src/agents/agent.rs` 在 Aster registry fallback 前直接调用 `tool-runtime::request_user_input::execute_request_user_input(...)`，`list_tools` 从 `request_user_input_tool_definition()` 注入 current 工具定义。
- `completed`：`tool-runtime::native_overlay::runtime_native_tool_registration_allowlist()` 从旧 `"Ask"` 迁到 `request_user_input`，避免默认 allowlist 继续使用旧工具名。
- `completed`：2026-07-11 继续收口 `agent-compat/src/action_required_manager.rs`，删除无 scope `request_and_wait(...)` / `submit_response(...)` convenience；迁移期只允许 scope-aware request / response / drain 入口。
- `classification`：`current` = `tool-runtime::request_user_input` + `agent-runtime::request_user_input`；`compat blocker` = callback 配置字段与 `lime-agent` ActionRequired scope adapter；`dead / deleted / forbidden-to-restore` = Aster `AskTool` 文件、registry 注册、旧 `"Ask"` allowlist 名、本地 DTO/schema/parse/validation/normalization/execution owner，以及 ActionRequiredManager 无 scope convenience。
- `Thread / Turn / Item`：Turn 拥有 request_user_input / HITL action lifecycle；Thread 只提供 session/thread/turn scope；Item/read model 只消费 action_required / answer projection。
- `guarded`：`asterMigrationBoundary.test.ts` 要求 `tool-runtime` 持有 definition / execution owner，要求 `agent-compat/src/tools/ask.rs` 不存在，并禁止 `tools/mod.rs` 恢复 `mod ask`、`AskTool` 或 `config.allows_tool("Ask")`。
- `validated`：`rustfmt --edition 2021 --check` 覆盖本轮 request_user_input Rust 写集，通过。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p tool-runtime request_user_input --lib -j 1 -- --nocapture` 通过，`8 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p agent-runtime request_user_input --lib -j 1 -- --nocapture` 通过，`4 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_user_input_bridge --lib -j 1 -- --nocapture` 通过，`3 passed`。
- `validated`：`cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-agent request_tool_policy --lib -j 1 -- --nocapture` 通过，`81 passed`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "internal/exec-plans/aster-phase6-provider-reply-backend-plan.md" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`172 passed`。
- `validated`：Gate A `LIME_ELECTRON_FIXTURE_BUILD_READY=1 npm run smoke:agent-runtime-current-fixture` 完整通过，覆盖 approval resume/decline/cancel/full-access no prompt、Inputbar restore/pending steer、Plan hydrate、Skills Runtime、Multi-Agent Team、MCP structuredContent、media reference 与 Content Factory Article Editor，`liveProviderUsed=false`。
- `validated`：Gate B Electron CDP `approval-request-full-access` 通过，summary 为 `.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-approval-full-access-request-user-input-r4-summary.json`。
- `remaining`：R4 仍未完成；Skill/gateway-backed/MCP、background / sandbox shell、R2/R3 provider reply exit source 与 R5/R6 session/runtime source 仍阻塞 root `aster` dependency 删除。

### 2026-07-10：R4 MCP registry wrapper owner 删除

- `completed`：`agent-compat/src/tools/registry.rs` 不再保存 `McpToolWrapper` 或 `mcp_tools`，也不再提供 `register_mcp` / `unregister_mcp` / `contains_mcp` / `mcp_tool_count` / `mcp_tool_names` / `is_mcp` 等 registry MCP API；`ToolRegistry` 只剩剩余 Aster native fallback。
- `completed`：删除无生产调用的 `Agent::register_mcp_tool(...)`；Agent 初始化不再把 `ExtensionManager` 写入 `ToolRegistrationConfig`，MCP definition / execution 不再回流到 Aster registry。
- `unchanged current`：MCP 工具模型可见 surface 仍由 `ExtensionManager::get_prefixed_tools(...)` 注入，执行仍由 `extension_manager.dispatch_tool_call(...)` 分发；App Server / inventory 继续消费 `lime-mcp`、App Server MCP gateway、`tool-runtime::mcp_resource` 与 `tool-runtime::tool_search`。
- `classification`：`current` = `lime-mcp`、App Server MCP gateway、`tool-runtime::{mcp_resource,tool_search}` 与暂时的 `ExtensionManager` source adapter；`compat blocker` = Aster extension manager / MCP client bridge 仍是未迁 reply-loop source adapter；`dead / guarded` = Aster `ToolRegistry` MCP wrapper / register / query 面。
- `Thread / Turn / Item`：MCP tool lifecycle 属于 Turn current gateway / source adapter；Item/read model 通过 MCP inventory / tool timeline projection 消费 current surface，不再从 Aster `ToolRegistry` 反推 MCP tools。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `McpToolWrapper`、registry MCP register/query API 和 `mcp_tools` 存储，并要求 reply loop MCP 执行继续走 `extension_manager.dispatch_tool_call(...)`。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check` 通过。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/mcp-registry-owner-current" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2` 通过；仅有既有 `NativeRegistration::name` unused warning。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/exec-plans/aster-phase6-provider-reply-backend-plan.md" "internal/roadmap/astermigration/README.md" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`172 passed`。
- `validated`：scoped `git diff --check` 覆盖 MCP registry owner 写集，通过。
- `remaining`：本刀只删除 Aster registry MCP 事实源；MCP bridge / extension execution 仍需继续迁到 `lime-mcp` / App Server / `tool-runtime` current gateway 后删除 Aster extension manager / MCP client bridge adapter。

### 2026-07-10：R4 MCP source adapter public surface 收缩

- `completed`：`agent-compat` root 不再 re-export `ExtensionManager`，`agents::extension_manager` 降为 `pub(crate)`，`agents/mod.rs` 删除 `pub use extension_manager::ExtensionManager`。
- `completed`：`code_execution_extension.rs` 改为显式引用 `crate::agents::extension_manager::ExtensionManager`，内部也不再依赖 agents 顶层 re-export。
- `completed`：删除 `NativeRegistration::name()` unused 方法，MCP registry owner 检查不再保留 warning。
- `classification`：`dead / guarded` = `aster::ExtensionManager` public/root surface；`compat blocker` = Aster extension manager / MCP client bridge source adapter；`current` = `lime-mcp`、App Server MCP gateway、`tool-runtime::{mcp_resource,tool_search}`。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check` 通过。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/mcp-registry-owner-current" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`174 passed`。
- `remaining`：未迁 MCP bridge / extension execution 仍需继续进入 current gateway；本刀不改变 R4 未完成结论。

### 2026-07-10：R4 MCP extension / client 子模块 public surface 收缩

- `completed`：`agent-compat/src/agents/mod.rs` 将 `extension` 与 `mcp_client` 降为 `pub(crate)`；`agents::extension` / `agents::mcp_client` 不再作为 Aster public module surface。
- `completed`：保留 root `aster::{ExtensionConfig, McpClientTrait, McpClientError}` 最小 blocker，避免在 MCP bridge 未迁完前破坏 `lime-agent/src/mcp_bridge.rs` 与 inventory adapter；该 root 面不是 current owner。
- `completed`：删除 `lime-agent/src/native_tools/runtime_overlay.rs::NativeRegistration::name()` 无引用 getter，复用同一 cargo target 复跑后无 unused warning。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `pub mod extension;` / `pub mod mcp_client;`，并要求 root 最小 re-export 仍显式存在，防止绕回 `aster::agents::*`。
- `classification`：`current` 是 `lime-mcp`、App Server MCP gateway、`tool-runtime::{mcp_resource,tool_search,tool_extension}`；`compat blocker` 是 root `ExtensionConfig` / `McpClientTrait` / `McpClientError` 与 Aster extension manager source adapter；`dead / guarded` 是外部 `aster::agents::extension::*` / `aster::agents::mcp_client::*` path 和 public submodule。
- `Thread / Turn / Item`：MCP bridge / extension execution 归 Turn tool lifecycle；extension inventory projection 归 Item/read model；root Aster DTO/trait 只是 source adapter，不能进入 refactor v1 current owner。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check` 通过。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=".lime/cargo-target/mcp-extension-module-private" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`175 passed`。
- `remaining`：MCP bridge / extension execution 仍未迁到 current gateway；R4/R7 退出前不能删除 root re-export、Aster extension manager 或 `McpClientTrait` adapter。

### 2026-07-11：R4/R7 inline Python extension surface 删除

- `completed`：删除 Aster `ExtensionConfig::InlinePython`、`ExtensionConfig::inline_python(...)`、recipe `inline_python` adapter、extension manager 的 `uvx --with mcp` 临时 Python 文件执行分支，以及 `lime-agent` tool inventory 对该 variant 的投影。
- `Codex 对照`：Codex extension 形状是 typed skills / memories / web-search / image-generation / goal 等 current extension config，不存在 Aster `inline_python` 任意代码 MCP extension 语义；因此该能力不迁入 Lime current owner。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster inline Python extension surface；`compat blocker` = Aster extension manager / MCP client bridge source adapter；`current` = `lime-mcp`、App Server MCP gateway、`tool-runtime::{mcp_resource,tool_search,tool_extension}`。
- `Thread / Turn / Item`：Turn tool lifecycle 不再接受 Aster inline Python extension config；Item inventory/read model 不再展示该 variant；Thread 不承接该 recipe metadata。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `InlinePython` / `inline_python` / `Command::new("uvx")` / `command.arg("--with").arg("mcp")` / `tempdir()` / 临时 Python 文件写入。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check` 通过。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/inline-python-extension-removal" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2` 通过，耗时 `13m41s`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`183 passed`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md"` 通过。
- `validated`：scoped `git diff --check` 覆盖本刀写集，通过。
- `remaining`：本刀只删除 Codex 无对应的 Aster-only extension surface；MCP bridge / extension execution 仍需迁入 current gateway，R2/R3 provider reply backend 和 R5/R6 session/runtime source 仍阻塞 root `aster` dependency 删除。

### 2026-07-11：R4/R7 SSE extension config 删除

- `completed`：删除 Aster `ExtensionConfig::Sse`、`#[serde(rename = "sse")]`、extension manager 旧 SSE unsupported 分支、config warning 分支，以及 `lime-agent` tool inventory 对该 variant 的投影。
- `Codex 对照`：Codex MCP transport config 只有 `stdio` 与 `streamable_http`；Codex 中的 `sse` 只属于 provider response/event-stream 测试与解析，不是 MCP extension config surface。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster SSE extension config / warning / inventory 投影；`current` = `streamable_http` / `stdio` MCP transport、`tool-runtime::tool_extension` DTO、`lime-mcp` / App Server MCP gateway；`compat blocker` = Aster extension manager / `McpClientTrait` source adapter。
- `Thread / Turn / Item`：Turn tool lifecycle 不再接受 Aster SSE extension config；Item inventory/read model 不再展示该 variant；Thread 不承接旧配置兼容。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `serde(rename = "sse")`、`ExtensionConfig::Sse`、`AsterExtensionConfig::Sse` 和旧 SSE unsupported 文案。
- `validated`：`rg -n "ExtensionConfig::Sse|serde\\(rename = \\\"sse\\\"\\)|SSE is unsupported|SSE extension|AsterExtensionConfig::Sse" "lime-rs/crates/agent-compat/src" "lime-rs/crates/agent/src"` 无命中。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent -- --check` 通过。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts"` 通过。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000` 通过，`183 passed`。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/sse-extension-removal" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2` 通过，耗时 `7m47s`。
- `remaining`：本刀只删除 Codex 无对应的 Aster-only extension config；R4/R7 仍需迁出 Aster extension manager / MCP client bridge，R2/R3 provider reply backend 和 R5/R6 session/runtime source 仍阻塞 root `aster` dependency 删除。

### 2026-07-11：R4/R7 extension config convenience 删除

- `completed`：`agent-compat/src/config/extensions.rs` 删除 `get_warnings()`、`get_enabled_extensions()`、`get_all_extension_names()` 和 config-level `is_extension_enabled(key)`；这些 helper 在 SSE / inline Python 删除后只会继续保留 Aster config warning/query 面。
- `Codex 对照`：Codex 没有 Aster 式全局 extension config warning/query convenience；MCP transport/config 进入 current runtime owner，tool inventory 进入 current Item/read model projection。
- `classification`：`dead / deleted / forbidden-to-restore` = Aster extension config warning/query convenience；`current` = `tool-runtime::tool_extension`、`lime-mcp`、App Server MCP gateway；`compat blocker` = Aster extension manager / MCP client bridge source adapter。
- `Thread / Turn / Item`：Thread 不承接旧配置 helper；Turn 只保留尚未迁完的 MCP source adapter；Item/tool inventory 只消费 current extension DTO / gateway projection。
- `guarded`：`asterMigrationBoundary.test.ts` 禁止恢复 `pub fn get_warnings`、`pub fn get_enabled_extensions`、`pub fn get_all_extension_names` 和 config-level `pub fn is_extension_enabled`；`ExtensionManager::is_extension_enabled(&self, name)` 仍允许作为未迁 source adapter 内部状态查询。
- `validated`：`rg -n "is_extension_enabled|get_warnings|get_enabled_extensions|get_all_extension_names" "lime-rs/crates/agent-compat/src" "lime-rs/crates/agent/src"` 只剩 `ExtensionManager::is_extension_enabled` 与真实调用，不命中已删 config helper。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core -- --check`。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/extension-config-convenience-removal" cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core --lib -j 2`。
- `validated`：`npx prettier --check "src/lib/governance/asterMigrationBoundary.test.ts" "internal/roadmap/astermigration/phase6-continuation-tracker.md" "internal/roadmap/astermigration/refactor-v1-impact-audit.md" "internal/roadmap/astermigration/aster-capability-intake-execution-plan.md"`。
- `validated`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`183 passed`。
- `remaining`：R4/R7 仍需迁出 Aster extension manager / MCP client bridge；下一刀不要继续围绕空 helper 做低杠杆清理，应优先处理 MCP bridge 或 R2/R3 provider reply backend。

### 2026-07-11：R4/R7 MCP extension surface owner 下沉

- `completed`：`lime-mcp::extension_surface` 新增 `runtime_extension_name(...)` 与 `build_runtime_extension_surface(...)`，把 MCP tool surface 构造从 `lime-agent::agent_tools::catalog` 迁入 MCP current owner；`tool-runtime::tool_extension` 继续提供 shared `RuntimeExtensionConfig` / `RuntimeExtensionToolSurface` DTO 与折叠规则。
- `completed`：`lime-agent/src/mcp_bridge.rs`、`agent_tools/tool_inventory_runtime_snapshot.rs`、`agent_tools/inventory.rs` 改为消费 `lime_mcp::{runtime_extension_name, build_runtime_extension_surface}`；`agent_tools/catalog.rs` 删除旧 helper 和旧正向测试，避免 static catalog 继续持有 runtime extension surface owner。
- `Codex 对照`：Codex MCP current owner 独立于 agent tool catalog，transport / runtime / tool surface 都在 MCP runtime/config/client 边界处理；Lime 本刀只迁 Codex 有的 MCP extension surface 规则，不迁 Aster-only inline Python / SSE。
- `classification`：`current` = `lime-mcp::extension_surface` + `tool-runtime::tool_extension`；`transitional adapter` = `lime-agent mcp_bridge` Aster `ExtensionConfig::Builtin` lowering；`compat blocker` = Aster extension manager / `McpClientTrait` execution bridge；`dead / guarded` = `agent_tools/catalog.rs` 恢复 MCP extension surface helper。
- `Thread / Turn / Item`：Turn owns MCP extension sync / tool lifecycle；Item inventory consumes current `RuntimeExtensionConfig`; Thread 不承接该规则。
- `guarded`：`asterMigrationBoundary.test.ts` 检查 `lime-mcp` 暴露 `extension_surface`，`lime-mcp` 依赖 `tool-runtime` DTO，`mcp_bridge` / inventory snapshot 消费新 owner，并禁止 `catalog.rs` 恢复旧 helper。
- `validated`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package lime-mcp --package lime-agent -- --check`。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=".lime/cargo-target/mcp-extension-surface-owner" cargo test --manifest-path "lime-rs/Cargo.toml" -p lime-mcp extension_surface --lib -j 2 -- --nocapture`，`6 passed`。
- `validated`：`CARGO_INCREMENTAL=0 CARGO_BUILD_JOBS=1 CARGO_TARGET_DIR=".lime/cargo-target/mcp-extension-surface-owner" cargo check --manifest-path "lime-rs/Cargo.toml" -p lime-agent --lib -j 1`，`Finished`，耗时 `12m07s`；首次 `-p lime-mcp -p lime-agent` check 因本地 rustc/dep-info 文件不存在中止，未暴露代码错误。
- `remaining`：R4/R7 下一刀继续迁出 Aster extension manager / MCP client execution bridge；R2/R3 provider reply backend、R5/R6 session/runtime source 仍阻塞 root `aster` dependency 删除。

### 2026-07-10：R2/R3 provider trait object 退场句柄收窄

- `completed`：`credential_bridge/runtime_provider_adapter.rs` 新增 `CompatReplyProvider` 退场句柄，`ConfiguredReplyProvider::into_compat_provider(...)` 返回该句柄，不再把 `Arc<dyn aster::Provider>` 直接暴露给 request_tool_policy。
- `completed`：`aster_reply_backend_adapter.rs` 的 default provider path 也通过 `CompatReplyProvider::from_aster_provider(...)` 包装；唯一 `.reply_with_provider(...)` 最后一跳仍在 `run_aster_reply_backend(...)`，但函数签名不再出现 `dyn Provider` / `Arc<dyn Provider>`。
- `classification`：`current` = `model-provider` provider handle / stream request / response event contracts 与 `agent-runtime` backend run path；`compat blocker` = `run_aster_reply_backend(...)` 内 Aster message/session lowering、Aster provider trait object 和 `Agent::reply_with_provider(...)`；`dead / guarded` = 恢复 `provider_reply_exit_source.rs`、`provider_stream/source_execution.rs`、`RuntimeReplyProviderExecution*` wrapper 或在 adapter 签名中重新暴露 `dyn Provider`。
- `Thread / Turn / Item`：Turn 仍拥有 provider reply backend start / run path；Item/read model 只消费 materialized response event / runtime event；Aster provider trait object 仍是 Turn source adapter blocker，不能作为 current provider backend。
- `guarded`：`asterMigrationBoundary.test.ts` 增加 `CompatReplyProvider` 与 adapter 负向断言，禁止 provider trait object 从 credential bridge 回流到 `aster_reply_backend_adapter.rs` 签名。
- `remaining`：R2/R3 未完成；下一刀仍是用 current provider/reply backend 替换 `run_aster_reply_backend(...)` 内的 Aster lowering / provider trait object / `reply_with_provider(...)`。

### 2026-07-11：Batch B/R4 tools 协作 adapter 移出 Aster tools 目录

- `completed`：`agent-compat/src/tools/agent_control.rs` 与 `agent-compat/src/tools/team_tools.rs` 已物理迁出并删除旧路径；新落点为 `agent-compat/src/agents/collab_runtime.rs` 与 `agent-compat/src/agents/team_runtime.rs`。
- `completed`：`tools/mod.rs` 不再声明 `mod agent_control` / `mod team_tools`，也不再 re-export `execute_agent_control_runtime_tool` / `execute_team_runtime_tool`；`ToolRegistrationConfig` 只保留 callback config 字段，服务 Aster `Agent` 初始化退场边界。
- `completed`：`agents/agent.rs` 直接从 `agents::{collab_runtime,team_runtime}` 调用 transitional adapter；协作工具 DTO/schema/canonical/execution 仍由 `tool-runtime::collab_agent` current owner 提供，并在 Aster `registry.execute(...)` 前优先执行。
- `guarded`：`asterMigrationBoundary.test.ts` 将旧 `agent-compat/src/tools/{agent_control.rs,team_tools.rs}` 纳入 deleted guard，要求 `tools/mod.rs` 不得恢复协作模块或 executor re-export，同时继续要求 `tool-runtime::collab_agent` 持有协作工具 surface / execution owner。
- `classification`：`current` = `tool-runtime::collab_agent::{execution,projection,validation}`；`transitional adapter` = `agent-compat/src/agents/{collab_runtime.rs,team_runtime.rs}`；`dead / guarded` = Aster tools 目录下的协作 adapter 文件、协作 Aster `Tool` trait 壳、本地 DTO/schema/projection owner；`compat blocker` = Aster `SessionStore` / team extension-data DTO、generic `ToolRegistry` fallback、root `Tool` / `ToolContext` allowlist。
- `Thread / Turn / Item`：Thread 只保存 session/team metadata；Turn tool lifecycle 归 `tool-runtime::collab_agent`；Item/read model 只消费 materialized tool result / metadata。
- `passed`：`cargo fmt --manifest-path "lime-rs/Cargo.toml" --package aster-core --package lime-agent`。
- `passed`：`cargo check --manifest-path "lime-rs/Cargo.toml" -p aster-core -p lime-agent --lib -j 2`，`Finished`，耗时 `4m27s`。
- `passed`：`npx vitest run "src/lib/governance/asterMigrationBoundary.test.ts" --silent=passed-only --disableConsoleIntercept --testTimeout=30000`，`183 passed`。
- `remaining`：Batch B/R4 下一刀应继续清 `agent-compat/src/tools/{base,context,error,registry}.rs` 和 `Agent` generic registry fallback；R4/R7 MCP bridge、R2/R3 provider reply backend、R5/R6 session/runtime source 仍阻塞 root `aster` dependency 删除。

### 2026-07-12：Provider / Tool 目录级收口

- `decision`：不再逐文件保留 Aster provider/tool staging。Codex current 有的 provider stream 与工具能力已经落到 `model-provider`、App Server 与 `tool-runtime`；Aster-only concrete provider、factory、toolshim、registry 与 declarative provider 配置没有 current 消费链，按 `dead / deleted / forbidden-to-restore` 整目录删除。
- `implemented`：删除 `agent-compat/src/providers/**`、`agent-compat/src/tools/**` 和 `config::declarative_providers`；保留 `reply_provider.rs` 最小协议面，且 factory fail closed。extension secret 只走 `Config::get_secret::<Value>`，不恢复旧 Config provider API。
- `current consumption`：前端和桌面后端的 provider/settings 主链仍是 App Server；Turn provider stream 由 `model-provider` contract 投影，工具由 `tool-runtime` dispatch/gateway dispatch 执行。此次没有为迁移增加不可达 DTO、catalog alias 或前端展示。
- `guard`：`asterMigrationBoundary.test.ts` 要求 provider/tools 目录不存在，禁止 `mod providers;`、`aster::providers::*`、Aster factory/toolshim 和 declarative provider 回流，同时保持 current owner 正向断言。
- `exit condition`：R2/R3 替换 `run_aster_reply_backend(...)` 的 Aster provider trait / Message / Session lowering 后，删除 `reply_provider.rs` 及 root `aster` provider re-export；不得以重建 `providers/**` 或 `tools/**` 作为过渡方案。
