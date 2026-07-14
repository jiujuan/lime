# App Server / Agent 运行时边界治理

状态：进行中  
创建时间：2026-07-03  
主目标：防止 App Server 在 current JSON-RPC 主链里继续长出第二套 Agent / Agent runtime，实现只向一个可治理边界收敛。

## 事实源声明

Agent 对话与 Plugin task turn 的 current 入口继续是：

`前端 API 网关 -> app_server_handle_json_lines -> App Server JSON-RPC -> RuntimeCore session/read model -> runtime backend adapter -> lime-agent / Agent 执行链`

App Server 负责 JSON-RPC、会话状态、投影、证据、artifact 和数据源编排；直接 Agent provider 配置、turn streaming、Skill 执行、Tool 实现和 host tool evidence 语义应继续收敛到 `lime-agent`、`runtime-core`、`lime-rs/crates/agent` 或现有更窄的 runtime backend adapter，不在 App Server 顶层新增平级执行面。

## 分类

- `current`：App Server JSON-RPC、`lime-rs/crates/app-server/src/runtime/**` 的会话 / 读模型 / artifact / evidence 主链、`AppServerBackendMode::Runtime`。
- `current`：`lime-rs/crates/app-server/src/agent_runtime_registry.rs` 作为 App Server 内部 Agent runtime 初始化边界；LocalAppDataSource 和其他数据源层不得直接 import `lime_agent::initialize_agent_runtime`。
- `current`：`lime-rs/crates/app-server/src/skill_registry.rs` 作为 App Server 内部 Skill registry 变更通知边界；LocalAppDataSource 只能通知该边界，不得直接触碰 Agent 状态。
- `current`：`lime-rs/crates/agent/src/knowledge_builder_skill.rs` 作为 Knowledge Builder Skill 的真实 Agent Skill 执行边界，负责 Skill 加载、provider fallback、prompt / workflow 执行，并通过 `KnowledgeBuilderSkillRunner` 持有 Agent 状态。
- `current`：`lime-rs/crates/agent/src/turn_execution.rs` 作为主 Agent turn 的 Agent streaming loop 调用边界，负责 `stream_current_provider_turn`、cancel token 生命周期和事件回调入口；App Server `runtime_backend.rs` 只传入已构造好的 session config / request tool policy 并投影事件。
- `current`：`lime-rs/crates/agent/src/provider_configuration.rs` 作为运行时 Provider 配置 façade，负责调用 `AgentState.configure_provider` / `configure_provider_from_pool`、持有 `ProtocolKind -> ModelProviderProtocol -> RuntimeProviderProtocol` 映射并返回 `ProviderConfig`；App Server 只传入 App Server `ProtocolKind`。
- `current`：`lime-rs/crates/agent/src/session_configuration.rs` 作为主 Agent turn 的 session config façade，直接 re-export `agent-runtime/src/session_config.rs` 的 `AgentSessionConfig`、`AgentSessionConfigurationRequest` 和 `build_agent_session_config`；App Server 只传入 system prompt、turn context 与 trace 开关。
- `current`：`lime-rs/crates/agent/src/turn_context_configuration.rs` 作为主 Agent turn 的 Agent `TurnContextOverride` / `TurnOutputSchemaSource` 构造 façade，负责持有 turn context 类型、output schema source 设置和 metadata / policy 读取 helper；App Server 只传入 request 投影数据或调用 façade helper。
- `current`：`lime-rs/crates/agent/src/direct_text_generation.rs` 作为禁用工具的受控文本生成边界，负责 `SessionConfigBuilder`、`RequestToolPolicyMode::Disabled` 与 Agent streaming 文本收集；App Server image presentation adapter 只传入已解析的 prompt、session/turn id 与 turn context。
- `current`：`lime-rs/crates/agent/src/host_managed_generation.rs` 作为 Plugin worker host-managed generation 边界，负责声明解析、prompt 拼装、多段 direct text generation loop、输出裁剪和 status envelope helper；App Server plugin worker adapter 只保留 provider route 解析、provider 配置和 worker request 投影。
- `current`：`lime-rs/crates/agent/src/native_tools/**` 作为 image / memory 原生 Agent Tool 实现边界，负责工具 schema、参数解析、权限检查与 `ToolResult` 投影；App Server 只注入 media / memory gateway。
- `current`：`lime-rs/crates/agent/src/agent_tools/tool_inventory_runtime_snapshot.rs` 作为 tool inventory 的 Agent registry / extension snapshot 边界，负责读取 Agent `tool_registry()`、`get_extension_configs()`、`list_tools()`，并把 MCP bridge tools 合并为 runtime extension surface；`lime-rs/crates/agent/src/agent_tools/inventory.rs` 继续负责 inventory read-model 投影。
- `current`：`lime-rs/crates/agent/src/agent_tools/workspace_patch_host.rs` 作为 workspace patch host tool request 解析、RuntimeTool `execute_call` 批执行、tool lifecycle evidence 拼装与 workspace patch 回写边界；App Server 只提取 RuntimeEvent 里的 artifact patch、构造 turn context 并调用 execution façade。
- `current`：`lime-rs/crates/tool-runtime/src/shell_permission.rs` 与 `execution_decision.rs` 作为 shell permission / execution decision owner；App Server `execution_process.rs` 只保留 process control、stdin / interrupt / terminate / drain 输出 read-model 投影和委托预检，不得直接注册 Agent shell tool 或构造 Agent `ToolRegistry`。
- `current-but-at-risk`：`lime-rs/crates/app-server/src/runtime_backend.rs` 与已登记 `runtime_backend/**` 子模块。它们目前承接真实 Claw / Agent 执行，但后续只能缩边界、拆职责，不应继续膨胀。`lime-rs/crates/app-server/src/runtime_backend/knowledge_builder_runtime.rs` 已从平行 Agent Skill 执行器收缩为 App Server adapter，只负责 `KnowledgeBuilderRuntimePlan -> lime-agent KnowledgeBuilderSkillRunner -> KnowledgeBuilderRuntimeExecution` 投影，不再直接持有 `AgentState`。
- `current-but-at-risk`：`lime-rs/crates/app-server/src/runtime_backend/provider_config.rs` 只允许保留 App Server `ProtocolKind` 传递、runtime database 初始化、`model.effective` 事件构造和 `lime-agent` provider façade 接线；不得重新直接调用 Agent provider 配置方法，也不得重新直接引用 `RuntimeProviderProtocol` 或 `RuntimeProviderProtocol`。
- `current-but-at-risk`：`lime-rs/crates/app-server/src/runtime_backend/request_context.rs` 已收缩为 800 行以下 facade，并拆出 `request_context/session_config.rs`、`turn_context.rs`、`workspace_scope.rs`。这些子模块仍是 App Server request adapter，只允许继续收缩或下沉，不得把 `SessionConfig`、`TurnContextOverride` 或 workspace scope 拼装逻辑折回主文件；其中 `session_config.rs` 已不再直接使用 `SessionConfigBuilder`，`turn_context.rs` 已不再直接引用 `TurnContextOverride` / `TurnOutputSchemaSource`。
- `current-but-at-risk`：`lime-rs/crates/app-server/src/runtime_backend/tool_inventory.rs` 只允许读取 AppDataSource MCP snapshot、合并 persisted/runtime metadata，并调用 `lime-agent` tool inventory façade 投影 `agentSession/toolInventory/read` read-model；不得重新直接读取 Agent tool registry 或 extension config。
- `current-but-at-risk`：`lime-rs/crates/app-server/src/runtime_backend/image_tools.rs` 与 `lime-rs/crates/app-server/src/runtime_backend/memory_tools.rs` 只保留 AppDataSource -> `lime-agent` gateway adapter；不得重新实现 Agent `Tool`、`ToolContext`、权限或 schema 逻辑。
- `current-but-at-risk`：`lime-rs/crates/app-server/src/runtime_backend/workspace_patch_host_tools.rs` 与 `workspace_patch_host_execution.rs` 只允许保留 App Server RuntimeEvent / turn context / host tool surface 初始化接线；不得重新解析 `hostToolRequests`、`searchRequests`、直接读取 Agent `tool_registry()`、直接调用 planned batch executor 或在 App Server 拼装 host tool evidence。
- `current-but-at-risk`：`lime-rs/crates/app-server/src/execution_process.rs` 只允许作为 App Server JSON-RPC execution process control / read-model adapter，委托 `lime-agent` 做 shell tool canonicalization、权限预检和本地进程启动；不得重新直接 import `agent::tools`、`BashTool`、`PowerShellTool`、`ToolRegistry` 或 `ToolContext`。
- `compat`：`lime-rs/crates/app-server/src/knowledge_builder_runtime.rs` 只保留 re-export，服务既有 crate 内外类型引用，不得重新承接 Agent 状态、provider 配置或 Skill 执行。
- `compat`：`ExternalBackend` 与 fixture/smoke 使用的 `APP_SERVER_BACKEND_MODE=external`，只允许 standalone CLI、SDK smoke、Electron dev 显式 override 和受控外部事件接入测试使用，不是 Electron 默认后端或生产第二运行时。退出条件：这些 smoke / fixture 迁到 RuntimeCore in-process harness 或专用 test client 后，删除 external CLI 分支和对应白名单。
- `test-only`：`MockBackend`、`APP_SERVER_BACKEND_MODE=mock` 相关守卫和 fixture。
- `dead`：独立 `backend_mode=agent`、旧 `agent_runtime_*` 生产命令面、`lime-rs/src/**` 旧 Tauri / Agent command wrapper。

## 本轮证据

- `lime-rs/crates/app-server/Cargo.toml` 直接依赖 `agent.workspace`，而 `runtime-core` crate 仍只依赖 protocol / serde，说明运行时执行语义尚未真正下沉到独立 core crate。
- `runtime_backend.rs` 曾直接持有 `AgentState` 并负责模型路由、provider 配置、MCP 启动、native tool 注册、权限预检、Agent `stream_reply_with_policy` 和事件映射；本轮已把这些语义按职责拆入 `lime-agent` 或更窄的 runtime backend adapter。
- 新增守卫首次扫描抓到 3 个 runtime backend 之外的存量 Agent 耦合：`lime-rs/crates/app-server/src/knowledge_builder_runtime.rs`、`lime-rs/crates/app-server/src/local_data_source/skills/local.rs`、`lime-rs/crates/app-server/src/local_data_source/skills/management.rs`。其中 `lime-rs/crates/app-server/src/knowledge_builder_runtime.rs` 曾直接配置 provider 并执行 `execute_skill_prompt / execute_skill_workflow`，本轮已迁入 `lime-rs/crates/app-server/src/runtime_backend/knowledge_builder_runtime.rs`；`local_data_source/skills/local.rs` 与 `local_data_source/skills/management.rs` 曾直接调用 `AgentState::reload_lime_skills()`，本轮已改为通知 `lime-rs/crates/app-server/src/skill_registry.rs`。
- `AppServerBackendMode` 允许 `external/runtime/mock/unavailable`；daemon 侧 `SidecarBackendMode` 只允许 `external/mock/unavailable` 并拒绝 `agent`。
- Electron App Server Host 与 dev sidecar 默认都固定为 `runtime`；SDK standalone 默认是 `unavailable`；`external` 必须显式配置 `APP_SERVER_BACKEND_MODE=external` / `backendMode: "external"` 并提供 `APP_SERVER_BACKEND_COMMAND` / `--backend-command`，否则不能作为可运行后端。
- 现有 contract 脚本曾把 “Standalone App Server current runtime backend embeds Claw Agent execution chain” 当正向 invariant，本轮先补更窄的 governance test，避免这条正向 invariant 被误读成继续扩 App Server 顶层 runtime 的许可。

## Codex 对照结论

参考实现路径：`/Users/coso/Documents/dev/rust/codex/codex-rs/**`。

- Codex `app-server/src/request_processors/turn_processor.rs` 只把 `turn/start` 请求校验、投影成 `codex_core::Op::UserInput`，再提交给 `ThreadManager / CodexThread`；它不在 app-server 顶层实现模型采样、工具执行或 provider 配置。
- Codex `core/src/session/turn.rs` 才拥有 turn loop：构建 prompt、解析工具调用、调用 `ToolRouter`、处理流式响应与上下文压缩。
- Codex `core/src/tools/router.rs` 与 `core/src/tools/orchestrator.rs` 把工具注册、dispatch、审批、沙箱、重试集中在 core/tool runtime 边界；`app-server/src/request_processors/process_exec_processor.rs` 只做 JSON-RPC 进程控制投影，并通过 `codex_exec_server::EnvironmentManager` 判断本地环境是否存在。
- 对 Lime 的治理含义：App Server 可以拥有 JSON-RPC、session/read model、artifact/evidence/data-source 投影和受控 backend adapter，但不应继续在 `runtime_backend` 外新增 Agent `AgentState`、provider 配置、Skill 执行或 `stream_reply` 平行执行链。`lime-rs/crates/app-server/src/runtime_backend/knowledge_builder_runtime.rs` 已按 Codex `turn_processor -> ThreadManager -> core turn loop` 的分层思路，把具体 Skill 执行下沉到 `lime-agent`。

## 本轮动作

- 新增 `src/lib/governance/appServerRuntimeBoundary.test.ts`：
  - 限制 App Server 生产代码里的 Agent 直接耦合只能出现在已登记边界或已知越界白名单。
  - 限制 Agent provider 配置与 streaming 执行流只能出现在 `runtime_backend` 适配层。
  - 已知 runtime backend 之外 Agent 越界白名单收敛为 0；后续新增同类耦合会直接失败。
  - 防止 LocalAppDataSource skills 层直接触碰 `AgentState` 或 `lime_agent::reload_lime_skills`。
  - 要求 App Server 顶层 Agent 越界白名单必须登记到本路线图。
  - 防止恢复独立 `backend_mode=agent`。
- 同步更新 `internal/aiprompts/commands.md` 的 App Server / Agent 边界口径。
- 将 `lime-rs/crates/app-server/src/knowledge_builder_runtime.rs` 的 Agent Skill 执行实现迁入 `lime-rs/crates/app-server/src/runtime_backend/knowledge_builder_runtime.rs`，顶层文件降为薄 re-export；同步收紧守卫，移除该顶层文件的 Agent 越界白名单。
- 新增 `lime-rs/crates/app-server/src/skill_registry.rs`，把 `local_data_source/skills/local.rs` 与 `local_data_source/skills/management.rs` 中的 Skill reload 通知收敛到 App Server skill registry 边界；两个数据源文件不再 import `lime_agent::AgentState`。
- 新增 `lime-rs/crates/app-server/src/agent_runtime_registry.rs`，把 `LocalAppDataSource::initialize_with_db_and_data_root` 与 `RuntimeBackend` 中的 Agent runtime 初始化收敛到 App Server agent runtime registry 边界；`local_data_source.rs` 不再直接 import `lime_agent::initialize_agent_runtime`。
- 新增 `lime-rs/crates/app-server/src/runtime_backend/mcp_bridges.rs`，把 MCP bridge snapshot 同步、已启用 server 自动启动和状态解析从 `runtime_backend.rs` 迁入 runtime backend 子边界；`runtime_backend.rs` 只保留 turn preflight / tool inventory / host search 的接线调用。
- 新增 `lime-rs/crates/app-server/src/runtime_backend/provider_config.rs`，把 route `ProtocolKind` 传递、runtime database 初始化和 `model.effective` 事件构造从 `runtime_backend.rs` 迁入 runtime backend 子边界；主文件只保留 turn 级调用顺序。
- 新增 `lime-rs/crates/agent/src/provider_configuration.rs`，把 `AgentState.configure_provider` / `configure_provider_from_pool` 调用从 App Server adapter 下沉到 `lime-agent` provider façade；App Server `runtime_backend/provider_config.rs` 只调用 `configure_provider_for_session`。
- 新增 `lime-rs/crates/agent/src/knowledge_builder_skill.rs`，把 Knowledge Builder Skill 的 `execute_skill_prompt / execute_skill_workflow`、Skill 加载、provider fallback 和输入拼装从 App Server adapter 下沉到 `lime-agent`；`lime-rs/crates/app-server/src/runtime_backend/knowledge_builder_runtime.rs` 只保留 plan / execution 投影。
- 扩展 `src/lib/governance/appServerRuntimeBoundary.test.ts`，禁止 App Server 生产代码重新直接引用 `execute_skill_prompt / execute_skill_workflow / SkillPromptExecution / SkillWorkflowExecution`。
- 扩展 `src/lib/governance/appServerRuntimeBoundary.test.ts`，锁定 `ExternalBackend` 只能出现在 standalone CLI、SDK smoke、fixture、contract guard 或 Electron dev 显式 override 白名单；Electron / packaged 默认必须继续走 `AppServerBackendMode::Runtime` 或 SDK standalone `unavailable`。
- 新增 `lime-rs/crates/app-server/src/runtime_backend/action_response.rs` 与 `runtime_backend/event_mapper.rs`，把 action confirmation / elicitation API 适配、Agent AgentEvent -> RuntimeEvent 映射、reasoning finish 与 proposed plan flush 从主 `runtime_backend.rs` 移入子边界；主文件只保留调用顺序，并由守卫防止这些细节回流。
- 新增 `lime-rs/crates/app-server/src/runtime_backend/workspace_patch_host_execution.rs`，把 workspace patch host tool batch 执行、tool registry 读取、tool runtime events 插入和 host tool evidence 回写从主 `runtime_backend.rs` 移入子边界；主文件降到 `500` 行以下，只保留 ExecutionBackend 方法委托。
- 新增 `KnowledgeBuilderSkillRunner`，由 `lime-agent` 持有 Knowledge Builder 的 `AgentState`；App Server `knowledge_builder_runtime` adapter 不再 import `AgentState` 或 `run_knowledge_builder_skill`，只调用 runner 并投影结果。
- 新增 `lime-rs/crates/agent/src/turn_execution.rs`，把主 `agentSession/turn/start` 的 `stream_reply_with_policy` 调用和 cancel token 生命周期从 App Server `runtime_backend.rs` 下沉到 `lime-agent`；App Server 主文件不再直接 import / 调用 `stream_reply_with_policy`。
- 新增 `lime-rs/crates/agent/src/direct_text_generation.rs`，把 plugin worker host-managed generation 与 image task presentation 共用的禁用工具文本生成 loop 下沉到 `lime-agent`；`lime-rs/crates/app-server/src/runtime_backend/plugin_worker_generation.rs` 与 `lime-rs/crates/app-server/src/runtime_backend/image_command/presentation.rs` 不再直接 import `stream_reply_with_policy`、`RequestToolPolicyMode` 或 `SessionConfigBuilder`。
- 新增 `lime-rs/crates/agent/src/host_managed_generation.rs`，把 plugin worker host-managed generation 的声明解析、prompt 拼装、多段 direct text generation loop、输出裁剪和 status envelope helper 从 App Server adapter 下沉到 `lime-agent`；App Server `runtime_backend/plugin_worker_generation.rs` 只解析 provider route、配置 provider 并调用 `run_host_managed_generation`。
- 扩展 `src/lib/governance/appServerRuntimeBoundary.test.ts`，防止上述两个 App Server adapter 重新复制 Agent streaming loop；后续同类受控生成只能复用 `lime-agent` direct text generation 或更高层 RuntimeCore 主链。
- 新增 `lime-rs/crates/agent/src/native_tools/image_tasks.rs` 与 `lime-rs/crates/agent/src/native_tools/memory_store.rs`，把原本位于 App Server `runtime_backend/image_tools.rs`、`runtime_backend/memory_tools.rs` 的 Agent `Tool` 实现、schema、参数解析、权限检查和 ToolResult 拼装下沉到 `lime-agent`。
- 将 App Server `runtime_backend/image_tools.rs` 与 `runtime_backend/memory_tools.rs` 收缩为 gateway adapter，只负责把 `AppDataSource` 投影到 `ImageTaskGateway` / `MemoryStoreGateway`；图片任务标准 artifact 集成测试仍留在 App Server adapter，证明真实 `.lime/tasks` 产物链未断。
- 扩展 `src/lib/governance/appServerRuntimeBoundary.test.ts`，防止 App Server image / memory native tool adapter 重新出现 `impl Tool for`、`ToolContext`、`ToolError`、`PermissionCheckResult`、`ToolOptions` 或本地 `input_schema`。
- 新增 `lime-rs/crates/agent/src/agent_tools/workspace_patch_host.rs`，把 workspace patch host tool request 解析、legacy `searchRequests` 兼容读取、planned tool evidence 拼装和 workspace patch 回写从 App Server `runtime_backend/workspace_patch_host_tools.rs` 下沉到 `lime-agent`。
- 将 App Server `runtime_backend/workspace_patch_host_tools.rs` 收缩为 RuntimeEvent artifact patch 提取、turn context 构造和 event payload 包装；同步扩展 `src/lib/governance/appServerRuntimeBoundary.test.ts`，防止 App Server adapter 重新解析 `hostToolRequests` / `searchRequests` 或拼装 `hostToolEvidence`。
- 将 workspace patch host tool 的 Agent `tool_registry()` 读取与 planned tool batch 执行下沉到 `lime-rs/crates/agent/src/agent_tools/workspace_patch_host.rs` 的 `execute_workspace_patch_host_tool_plan`；App Server `workspace_patch_host_execution.rs` 只初始化当前 host tool surface、构造 turn context、调用 façade 并把返回的 AgentEvent 投影为 RuntimeEvent。
- 新增 `lime-rs/crates/app-server/src/runtime_backend/request_context/session_config.rs`、`turn_context.rs`、`workspace_scope.rs`，把主 `request_context.rs` 中的 SessionConfig 拼装、TurnContext metadata 构造和 workspace scope 解析拆成职责子模块；主文件从 1125 行降到 800 行以下，并由 `appServerRuntimeBoundary.test.ts` 防止职责回流。
- 扩展 `src/lib/governance/appServerRuntimeBoundary.test.ts`，禁止 App Server production 重新直接调用 `.configure_provider(`、`configure_provider_from_pool(` 或恢复旧 provider helper；同时要求 `lime-agent/src/provider_configuration.rs` 持有真实配置调用。
- 新增 `lime-rs/crates/agent/src/session_configuration.rs`，把 `SessionConfigBuilder` 与 `agent::agents::SessionConfig` 构造 façade 从 App Server `request_context/session_config.rs` 下沉到 `lime-agent`；App Server 只调用 `build_agent_session_config` 并传入已投影的 prompt / turn context。
- 扩展 `src/lib/governance/appServerRuntimeBoundary.test.ts`，禁止 App Server production 重新直接引用 `SessionConfigBuilder` 或 `agent::agents::SessionConfig`；同步更新 contract guard，要求 current runtime backend invariant 覆盖 `lime-agent/src/session_configuration.rs`。
- 新增 `lime-rs/crates/agent/src/turn_context_configuration.rs`，把 `TurnContextOverride`、`TurnOutputSchemaSource`、output schema source 设置和 turn context metadata / policy helper 从 App Server adapter 下沉到 `lime-agent`；App Server `request_context/turn_context.rs` 只构造 `AgentTurnContextConfigurationRequest`。
- 扩展 `src/lib/governance/appServerRuntimeBoundary.test.ts`，禁止 App Server production 重新直接引用 `TurnContextOverride` 或 `TurnOutputSchemaSource`；同步更新 contract guard，要求 current runtime backend invariant 覆盖 `lime-agent/src/turn_context_configuration.rs`。
- 将 route `ProtocolKind -> ModelProviderProtocol -> RuntimeProviderProtocol` 映射和 `ProviderConfig.protocol -> ProtocolKind` 回投下沉到 `lime-rs/crates/agent/src/provider_configuration.rs`；App Server `runtime_backend/provider_config.rs` 只把 route `ProtocolKind` 传给 `ProviderConfigurationRequest`，`model_route_contract.rs` 只调用 `route_protocol_from_provider_config`。
- 扩展 `src/lib/governance/appServerRuntimeBoundary.test.ts` 与 `scripts/check-app-server-client-contract.mjs`，禁止 App Server production 重新直接引用 provider protocol DTO 或恢复本地 provider protocol 映射 helper。
- 将 tool inventory 的 Agent `tool_registry()`、`get_extension_configs()`、`list_tools()` snapshot 和 MCP extension surface 合并下沉到 `lime-rs/crates/agent/src/agent_tools/tool_inventory_runtime_snapshot.rs`；App Server `runtime_backend/tool_inventory.rs` 只保留 AppDataSource MCP snapshot 读取、metadata 合并和 `agentSession/toolInventory/read` read-model 投影。
- 扩展 `src/lib/governance/appServerRuntimeBoundary.test.ts` 与 `scripts/check-app-server-client-contract.mjs`，禁止 App Server tool inventory 重新直接读取 Agent tool registry / extension config。
- 删除 App Server `execution_process.rs` 中的 Agent shell `BashTool` / `PowerShellTool` 注册与 `ToolRegistry` 构造；shell permission 和 execution decision 统一委托 `tool-runtime` 的 `check_shell_command_permission` / `decide_tool_execution`，App Server 只保留 `ExecutionProcess*` 协议投影、process control 和输出缓冲。
- 扩展 `src/lib/governance/appServerRuntimeBoundary.test.ts`，防止 App Server execution process 重新直接 import `agent::tools` 或注册 shell tool registry。

## 剩余缺口

- 后续若要让 Knowledge Builder 彻底统一到 `agentSession/turn/start`，应把 `KnowledgeBuilderRuntimePlan` 投影为标准 agent turn metadata；当前 App Server adapter 已不再直接执行 Skill prompt/workflow 或持有 Agent 状态。
- 主 `agentSession/turn/start` 的 streaming loop、provider 配置 façade、route protocol 到 Agent protocol 映射、`SessionConfig` 构造 façade 和 `TurnContextOverride` 类型构造 façade 已下沉到 `lime-agent`。Provider selection / route config 经盘点仍属于 App Server provider registry readiness、RuntimeCore route resolution evidence 与 JSON-RPC read-model 投影，不直接复制 Agent provider 配置；后续只允许继续向 RuntimeCore / provider registry 收缩，不得扩展成 App Server 本地 Agent provider 语义。
- `tool_inventory.rs` 已收缩为 App Server MCP / read-model projection，`workspace_patch_host_execution.rs` 已不再直接读取 Agent tool registry 或调用 planned batch executor，`plugin_worker_generation.rs` 已不再直接持有 host-managed generation prompt / loop 语义，`execution_process.rs` 已不再直接注册 Agent shell tools。剩余 `runtime_backend/live_execution_process.rs` 仍因实现 Agent `NativeToolExecutionHook` 持有受控 Agent hook 接线；退出条件是把 hook implementation 或 host process adapter 进一步迁到 `lime-agent` 并让 App Server 只注入 `ExecutionProcessServer` trait。
