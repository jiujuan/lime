/* global process */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

const CURRENT_RUNTIME_CRATES = [
  "agent-protocol",
  "model-provider",
  "thread-store",
  "tool-runtime",
  "agent-runtime",
];

const DIRECT_ASTER_DEPENDENCY_MIGRATED_CRATES = [
  "server",
  "scheduler",
  "app-server",
  "services",
];

const DIRECT_ASTER_DEPENDENCY_MIGRATED_FILES = [
  "lime-rs/crates/agent-protocol/src/action_required.rs",
  "lime-rs/crates/services/src/model_registry_service.rs",
  "lime-rs/crates/agent/src/protocol_context_projection.rs",
  "lime-rs/crates/agent/src/protocol_projection.rs",
  "lime-rs/crates/agent/src/request_tool_policy/auto_compaction_projection.rs",
  "lime-rs/crates/agent/src/runtime_projection_snapshot.rs",
  "lime-rs/crates/agent/src/session_store_message_projection.rs",
  "lime-rs/crates/agent/src/session_store_runtime_projection.rs",
  "lime-rs/crates/agent/src/session_store_todo_projection.rs",
  "lime-rs/crates/agent/src/tool_io_offload.rs",
  "lime-rs/crates/agent/src/turn_input_envelope.rs",
  "lime-rs/crates/tool-runtime/src/mcp_notification.rs",
  "lime-rs/crates/tool-runtime/src/tool_result.rs",
];

const PROTOCOL_PROJECTION_FORBIDDEN_RUNTIME_DTO_SNIPPETS = [
  "aster::session::",
  "TurnRuntime",
  "ItemRuntime",
  "convert_turn_runtime",
  "convert_item_runtime",
];

const SESSION_EXECUTION_RUNTIME_FORBIDDEN_PRODUCTION_SNAPSHOT_SNIPPETS = [
  "SessionRuntimeSnapshot",
  "ThreadRuntimeSnapshot",
  "TurnRuntime",
  "TurnStatus",
  "TurnContextOverride",
  "context_override",
  "project_aster_session_execution_runtime_snapshot",
];

const SUBAGENT_CONTROL_FORBIDDEN_PRODUCTION_RUNTIME_DTO_SNIPPETS = [
  "SessionRuntimeSnapshot",
  "ThreadRuntimeSnapshot",
  " TurnRuntime,",
  " TurnRuntime {",
  " ItemRuntime,",
  " ItemRuntime {",
  "ItemRuntimePayload",
  "latest_turn_projection",
];

const SESSION_STORE_SUBAGENT_CONTEXT_FORBIDDEN_RUNTIME_DTO_SNIPPETS = [
  "SessionRuntimeSnapshot",
  "ThreadRuntimeSnapshot",
  "TurnRuntime",
  "ItemRuntimePayload",
  "aster::session::TurnStatus",
  " TurnStatus,",
];

const AGENT_TURN_CONTEXT_MIGRATED_FILES = [
  "lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs",
  "lime-rs/crates/agent/src/agent_tools/tool_policy_inspector.rs",
  "lime-rs/crates/agent/src/agent_tools/workspace_patch_host.rs",
  "lime-rs/crates/agent/src/direct_text_generation.rs",
  "lime-rs/crates/agent/src/native_tools/image_tasks.rs",
  "lime-rs/crates/agent/src/protocol_projection.rs",
  "lime-rs/crates/agent/src/session_configuration.rs",
  "lime-rs/crates/agent/src/skill_execution.rs",
  "lime-rs/crates/agent/src/tools/skill_search_tool.rs",
];

const APP_SERVER_FORBIDDEN_TURN_CONTEXT_SNIPPETS = [
  "runtime_facade::{with_turn_context",
  "runtime_facade::with_turn_context",
  "runtime_facade::{TurnContextOverride",
  "runtime_facade::TurnContextOverride",
  "runtime_facade::{TurnOutputSchemaSource",
  "runtime_facade::TurnOutputSchemaSource",
  "current_turn_context",
  "with_turn_context",
  "aster::session_context",
  "aster::session::TurnContextOverride",
  "aster::session::TurnOutputSchemaSource",
];

const RUNTIME_FACADE_FORBIDDEN_TURN_CONTEXT_SNIPPETS = [
  "pub use aster::agents::*",
  "pub use aster::agents::{",
  "pub use aster::tools::*",
  "pub use aster::tools::{",
  "pub use aster::session::{TurnContextOverride",
  "pub use aster::session::TurnContextOverride",
  "pub use aster::session::{TurnOutputSchemaSource",
  "pub use aster::session::TurnOutputSchemaSource",
  "pub fn current_turn_context",
  "pub async fn with_turn_context",
];

const FORBIDDEN_ASTER_SNIPPETS = [
  "use aster::",
  "aster::",
  "use aster_models::",
  "aster_models::",
  "aster.workspace = true",
  "aster-models.workspace = true",
  'package = "aster-core"',
];

const PROVIDER_SAFETY_FORBIDDEN_ASTER_SNIPPETS = [
  "aster::utils::safe_truncate",
];

const CREDENTIAL_BRIDGE_FORBIDDEN_INLINE_ENV_HELPERS = [
  "fn should_disable_provider_default_fast_model",
  "fn split_url_host_and_path",
  "fn resolve_anthropic_env_key",
  "fn update_openai_lime_tenant_custom_header",
  "fn set_provider_env_vars",
  "const OPENAI_CUSTOM_HEADERS_ENV",
  "fn normalize_provider_selector",
  "fn map_provider_type_to_aster",
  "fn map_provider_type_to_aster_with_api_type",
  "pub async fn create_aster_provider(",
  "fn build_provider_model_config",
];

const PROVIDER_FACTORY_FORBIDDEN_PUBLIC_ASTER_FACTORY_SNIPPETS = [
  "pub use provider_factory::create_aster_provider",
  "pub async fn create_aster_provider(",
  "pub use provider_factory::create_aster_runtime_provider",
  "pub use provider_factory::{create_aster_runtime_provider",
  "pub async fn create_aster_runtime_provider(",
  "create_runtime_provider",
];

const MODEL_RUNTIME_PROVIDER_REQUIRED_SNIPPETS = [
  "pub mod runtime_provider;",
  "pub trait RuntimeProvider",
];

const SUBAGENT_PROVIDER_EXECUTION_REQUIRED_SNIPPETS = [
  "create_model_runtime_provider",
  "build_subagent_provider_request",
  "ProviderRequest",
  "ContentBlock::Text",
];

const SUBAGENT_PROVIDER_EXECUTION_FORBIDDEN_ASTER_SNIPPETS = [
  "use aster::conversation::message::Message",
  "aster::providers::base",
  "dyn Provider",
  "create_runtime_provider",
  "Message::user().with_text",
  ".complete(&system_prompt",
];

const ASTER_STATE_PROVIDER_CONFIG_REQUIRED_SNIPPETS = [
  "mod provider_config;",
  "pub use provider_config::ProviderConfig;",
];

const ASTER_STATE_PROVIDER_CONFIG_MODULE_REQUIRED_SNIPPETS = [
  "pub struct ProviderConfig",
  "impl ProviderContinuationCapable for ProviderConfig",
  "impl AsterAgentState",
  "pub async fn configure_provider(",
  "pub async fn configure_provider_from_pool(",
  "create_aster_runtime_provider",
  "RuntimeProviderConfig",
];

const ASTER_STATE_FORBIDDEN_PROVIDER_CONFIG_SNIPPETS = [
  "pub struct ProviderConfig",
  "impl ProviderContinuationCapable for ProviderConfig",
  "pub async fn configure_provider(",
  "pub async fn configure_provider_from_pool(",
  "pub fn mark_current_healthy(",
  "pub fn mark_current_unhealthy(",
  "pub async fn get_provider_config(",
  "pub async fn clear_provider_config(",
  "pub async fn is_provider_configured(",
  "create_aster_runtime_provider",
  "RuntimeProviderConfig",
];

const PROVIDER_RUNTIME_DTO_FILES = [
  "lime-rs/crates/agent/src/credential_bridge/provider_config.rs",
  "lime-rs/crates/agent/src/aster_state/provider_config.rs",
  "lime-rs/crates/agent/src/provider_configuration.rs",
  "lime-rs/crates/agent/src/provider_continuation_state.rs",
  "lime-rs/crates/agent/src/aster_state.rs",
  "lime-rs/crates/agent/src/subagent_scheduler.rs",
];

const PROVIDER_RUNTIME_DTO_FORBIDDEN_ASTER_NAMES = [
  "AsterProviderConfig",
  "AsterProviderProtocol",
  "aster_provider_protocol_from_model_provider_protocol",
  "model_provider_protocol_from_aster_protocol",
];

const PROVIDER_ENV_REQUIRED_MODEL_PROVIDER_POLICY_SNIPPETS = [
  "model_provider::safety::should_disable_provider_default_fast_model",
  "model_provider_protocol_from_runtime_protocol",
];

const PROVIDER_ENV_FORBIDDEN_LOCAL_FAST_MODEL_POLICY_SNIPPETS = [
  "fn is_first_party_openai_selector",
  "fn is_first_party_openai_base_url",
  "fn is_first_party_anthropic_selector",
  "fn is_first_party_anthropic_base_url",
];

const PROVIDER_CONFIGURATION_REQUIRED_MODEL_PROVIDER_SNIPPETS = [
  "model_provider::ModelProviderProtocol",
  "model_provider_protocol_from_route_protocol",
  "runtime_provider_protocol_from_model_provider_protocol",
];

const PROVIDER_CONFIGURATION_FORBIDDEN_DIRECT_ASTER_ROUTE_MAPPING_SNIPPETS = [
  "ProtocolKind::OpenaiResponses | ProtocolKind::CodexResponses => {\n            Some(RuntimeProviderProtocol::Responses)",
  "ProtocolKind::OpenaiChat => Some(RuntimeProviderProtocol::ChatCompletions)",
];

const PROVIDER_CONTINUATION_REQUIRED_MODEL_PROVIDER_SNIPPETS = [
  "model_provider::ModelProviderProtocol",
  "resolve_provider_continuation_capability_for_model_protocol",
  "model_provider_protocol_from_runtime_protocol",
];

const PROVIDER_CONTINUATION_FORBIDDEN_ASTER_DECISION_SNIPPETS = [
  "protocol.is_some_and(RuntimeProviderProtocol::uses_responses_api)",
];

const SESSION_QUERY_FORBIDDEN_ASTER_TREE_HELPER_SNIPPETS = [
  "collect_subagent_cascade_session_ids as collect_query_subagent_cascade_session_ids",
  "collect_query_subagent_cascade_session_ids(",
];

const SESSION_STORE_FORBIDDEN_ASTER_DELETE_SNIPPETS = [
  "aster::session::SessionStore::delete_session",
  "LimeSessionStore::new(db.clone())",
];

const SESSION_UPDATE_REQUIRED_CURRENT_TOKEN_STATS_SNIPPETS = [
  "DbConnection",
  "agent_session_repository::update_session_token_stats",
  "SessionTokenStatsUpdate",
];

const SESSION_UPDATE_FORBIDDEN_ASTER_TOKEN_STATS_SNIPPETS = [
  "apply_session_update",
  ".total_tokens(Some(",
  ".accumulated_total_tokens(",
];

const DIRECT_TEXT_GENERATION_NO_DB_FALLBACK_FILES = [
  "lime-rs/crates/app-server/src/runtime_backend/image_command/presentation.rs",
  "lime-rs/crates/app-server/src/runtime_backend/plugin_worker_generation.rs",
  "lime-rs/crates/agent/src/host_managed_generation.rs",
];

const DIRECT_TEXT_GENERATION_NO_DB_FALLBACK_PATTERN =
  /\brun_direct_text_generation\b(?!_with_db)/u;

const ASK_BRIDGE_FORBIDDEN_COMPAT_LOGIC_SNIPPETS = [
  "fn build_question_schema",
  "fn collect_answers",
  "fn normalize_answer_value",
];

const ASTER_SESSION_STORE_FORBIDDEN_SESSION_RECORD_HELPERS = [
  "struct SessionListingRow",
  "fn normalize_optional_text",
  "fn parse_optional_json",
  "fn parse_timestamp_or_now",
  "fn resolve_session_type",
];

const ASTER_SESSION_STORE_FORBIDDEN_SPLIT_HELPERS = [
  "fn runtime_message_role",
  "CommitReport {",
  "memory subsystem disabled",
  "memory commit skipped",
  "fn map_session_listing_row",
  "fn build_session_from_record_projection",
  "fn load_listed_sessions",
  "SessionRecordProjection",
  "SessionRecordRow",
];

const ASTER_SESSION_STORE_TRAIT_ADAPTER_FILE =
  "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs";

const ASTER_RUNTIME_CONVERSATION_FORBIDDEN_TRANSCRIPT_HELPERS = [
  "fn transcript_item_id",
  "let mut transcript_count",
  "let mut projection_count",
  "let mut transcript_messages",
  "let mut projection_messages",
];

const EVENT_CONVERTER_FORBIDDEN_PROVIDER_TRACE_STAGE_SNIPPETS = [
  "aster::agents::ProviderTraceStage::",
];

const EVENT_CONVERTER_FORBIDDEN_MCP_NOTIFICATION_SNIPPETS = [
  "const MCP_LOG_PROCESS_METADATA_KEYS",
  "fn truncate_notification_text",
  "fn metadata_with_kind",
  "fn value_to_notification_text",
  "fn maybe_text_from_custom_notification_params",
  "fn merge_mcp_log_process_metadata",
];

const EVENT_CONVERTER_FORBIDDEN_TOOL_RESULT_SNIPPETS = [
  "const JSON_RECURSION_LIMIT",
  "const TOOL_RESULT_MAX_TEXT_PARTS",
  "const TOOL_RESULT_MAX_IMAGES",
  "struct TextCollectState",
  "struct ExtractedToolResult",
  "fn collect_tool_result_text",
  "fn maybe_filter_web_content",
  "fn parse_mime_type_from_data_url",
  "fn build_tool_image_from_data_url",
  "fn build_tool_image_from_base64_parts",
  "fn build_tool_image_from_image_content_object",
  "fn extract_data_urls_from_text",
  "fn collect_tool_result_images",
];

const EVENT_CONVERTER_FORBIDDEN_ACTION_REQUIRED_PROJECTION_SNIPPETS = [
  "fn convert_action_required_scope",
  '"tool_name": tool_name',
  '"arguments": arguments',
  '"requested_schema": requested_schema',
  '"user_data": user_data',
];

const EVENT_CONVERTER_FORBIDDEN_MESSAGE_CONTENT_ADAPTER_SNIPPETS = [
  "MessageContent::Text",
  "MessageContent::Thinking",
  "MessageContent::ToolRequest",
  "MessageContent::ToolResponse",
  "MessageContent::ActionRequired",
  "MessageContent::ToolConfirmationRequest",
  "MessageContent::FrontendToolRequest",
  "MessageContent::ToolInputDelta",
  "fn convert_message(",
  "fn convert_to_tauri_message",
  "fn convert_message_content",
  "fn legacy_message_tool_response_metadata",
  "fn enhance_execution_error_text",
  "maybe_offload_tool_arguments",
  "maybe_offload_tool_result_payload",
  "ToolResultDiagnostics",
  "ToolResultImageProjection",
];

const EVENT_CONVERTER_FORBIDDEN_RUNTIME_TIMELINE_ADAPTER_SNIPPETS = [
  "ItemRuntimePayload::",
  "ItemRuntime,",
  "TurnRuntime,",
  "ItemStatus,",
  "TurnStatus,",
  "AgentRequestOption",
  "AgentRequestQuestion",
  "AgentThreadItemPayload",
  "AgentThreadTurn,",
  "fn convert_turn_runtime",
  "fn convert_item_runtime",
  "fn convert_item_payload",
  "fn extract_request_options",
  "ASK_USER_QUESTIONS_SCHEMA_KEY",
  "extract_tool_result_text_for_current_runtime",
  "normalize_legacy_runtime_status_title",
  "normalize_legacy_turn_summary_text",
];

const ASTER_RUNTIME_PROJECTION_FORBIDDEN_SNAPSHOT_ADAPTER_SNIPPETS = [
  "SessionRuntimeSnapshot",
  "ThreadRuntimeSnapshot",
  "TurnRuntime",
  "ItemRuntime",
  "ItemRuntimePayload",
  "SubagentLatestTurnProjection",
  "SubagentTurnStatus",
  "fn project_aster_runtime_snapshot",
  "fn project_aster_subagent_latest_turn",
  "fn project_aster_session_execution_runtime_snapshot",
  "fn project_aster_execution_runtime_turn",
  "fn resolve_latest_aster_turn",
  "fn count_aster_tool_items_for_turn",
  "fn resolve_aster_worker_result_ref",
];

function repoRelative(path: string): string {
  return relative(REPO_ROOT, path).replace(/\\/g, "/");
}

function collectTextFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectTextFiles(fullPath));
      continue;
    }
    if (/\.(?:rs|toml)$/u.test(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("aster migration boundary", () => {
  it("Aster vendor dependency 只能停留在 vendor compat 路径", () => {
    const rootCargoPath = join(REPO_ROOT, "lime-rs/Cargo.toml");
    const rootCargo = readFileSync(rootCargoPath, "utf8");
    const legacyCratePath = join(REPO_ROOT, "lime-rs/crates/aster-rust");
    const vendorPath = join(REPO_ROOT, "lime-rs/vendor/aster-rust");

    expect(
      existsSync(legacyCratePath),
      "lime-rs/crates/aster-rust 是 dead / forbidden-to-restore，Aster 不得回到 current crate 区",
    ).toBe(false);
    expect(
      existsSync(vendorPath),
      "迁移期 Aster 只能作为 vendor compat dependency 保留",
    ).toBe(true);
    expect(rootCargo).toContain('"vendor/aster-rust"');
    expect(rootCargo).toContain(
      'aster = { package = "aster-core", path = "vendor/aster-rust/crates/aster" }',
    );
    expect(rootCargo).not.toContain('path = "crates/aster-rust/crates/aster"');
  });

  it("Codex 风格 Agent Runtime 骨架 crate 必须存在并纳入 workspace dependencies", () => {
    const rootCargo = readFileSync(join(REPO_ROOT, "lime-rs/Cargo.toml"), "utf8");
    const missingCrates = CURRENT_RUNTIME_CRATES.filter((crateName) => {
      const crateRoot = join(REPO_ROOT, "lime-rs/crates", crateName);
      return (
        !existsSync(join(crateRoot, "Cargo.toml")) ||
        !existsSync(join(crateRoot, "src/lib.rs"))
      );
    });
    const missingDependencies = CURRENT_RUNTIME_CRATES.filter(
      (crateName) =>
        !rootCargo.includes(`${crateName} = { path = "crates/${crateName}" }`),
    );

    expect(missingCrates, "缺少 current runtime 骨架 crate").toEqual([]);
    expect(
      missingDependencies,
      "根 workspace.dependencies 必须声明 current runtime 骨架 crate",
    ).toEqual([]);
  });

  it("Codex 风格 Agent Runtime 骨架不得直接依赖 Aster", () => {
    const leaks = CURRENT_RUNTIME_CRATES.flatMap((crateName) => {
      const crateRoot = join(REPO_ROOT, "lime-rs/crates", crateName);
      return collectTextFiles(crateRoot).flatMap((file) => {
        const source = readFileSync(file, "utf8");
        return FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
          source.includes(snippet),
        ).map((snippet) => `${repoRelative(file)}: ${snippet}`);
      });
    });

    expect(
      leaks,
      "新 Agent Runtime current crate 只能依赖 Lime 自有协议 / provider / tool / store，不得重新接 Aster",
    ).toEqual([]);
  });

  it("已迁移 crate 不得重新直接依赖 Aster", () => {
    const leaks = DIRECT_ASTER_DEPENDENCY_MIGRATED_CRATES.flatMap((crateName) => {
      const crateRoot = join(REPO_ROOT, "lime-rs/crates", crateName);
      return collectTextFiles(crateRoot).flatMap((file) => {
        const source = readFileSync(file, "utf8");
        return FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
          source.includes(snippet),
        ).map((snippet) => `${repoRelative(file)}: ${snippet}`);
      });
    });

    expect(
      leaks,
      "server / scheduler / app-server / services 已从 Aster current 依赖面迁出，不得重新 import 或声明 aster.workspace",
    ).toEqual([]);
  });

  it("已迁移文件不得重新直接依赖 Aster", () => {
    const leaks = DIRECT_ASTER_DEPENDENCY_MIGRATED_FILES.flatMap((filePath) => {
      const absolutePath = join(REPO_ROOT, filePath);
      const source = readFileSync(absolutePath, "utf8");
      return FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
        source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);
    });

    expect(
      leaks,
      "已迁 provider / turn DTO 文件不得重新 import Aster；Aster 只允许停留在 lime-agent 迁移 adapter 边界",
    ).toEqual([]);
  });

  it("provider_safety 纯策略不得回流到 Aster 工具函数", () => {
    const filePath = "lime-rs/crates/agent/src/provider_safety.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = PROVIDER_SAFETY_FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
      source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "provider_safety 只能作为 Aster Provider adapter；文本截断等纯策略必须归属 model-provider current crate",
    ).toEqual([]);
  });

  it("credential_bridge compat 主文件必须拆出 provider config 与 env adapter", () => {
    const filePath = "lime-rs/crates/agent/src/credential_bridge.rs";
    const providerConfigPath =
      "lime-rs/crates/agent/src/credential_bridge/provider_config.rs";
    const providerEnvPath =
      "lime-rs/crates/agent/src/credential_bridge/provider_env.rs";
    const providerFactoryPath =
      "lime-rs/crates/agent/src/credential_bridge/provider_factory.rs";
    const providerMappingPath =
      "lime-rs/crates/agent/src/credential_bridge/provider_mapping.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const providerFactorySource = readFileSync(
      join(REPO_ROOT, providerFactoryPath),
      "utf8",
    );
    const lineCount = source.split(/\r?\n/u).length;
    const leaks = [
      ...CREDENTIAL_BRIDGE_FORBIDDEN_INLINE_ENV_HELPERS.filter((snippet) =>
        source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`),
      ...PROVIDER_FACTORY_FORBIDDEN_PUBLIC_ASTER_FACTORY_SNIPPETS.flatMap((snippet) =>
        [
          [filePath, source],
          [providerFactoryPath, providerFactorySource],
        ].flatMap(([checkedPath, checkedSource]) =>
          checkedSource.includes(snippet) ? [`${checkedPath}: ${snippet}`] : [],
        ),
      ),
    ];

    expect(lineCount, "credential_bridge.rs 超过 1000 行时必须继续拆分").toBeLessThan(
      1000,
    );
    expect(existsSync(join(REPO_ROOT, providerConfigPath))).toBe(true);
    expect(existsSync(join(REPO_ROOT, providerEnvPath))).toBe(true);
    expect(existsSync(join(REPO_ROOT, providerFactoryPath))).toBe(true);
    expect(existsSync(join(REPO_ROOT, providerMappingPath))).toBe(true);
    expect(source).toContain("mod provider_config;");
    expect(source).toContain("mod provider_env;");
    expect(source).toContain("mod provider_factory;");
    expect(source).toContain("mod provider_mapping;");
    expect(source).toContain("create_model_runtime_provider");
    expect(providerFactorySource).toContain("pub(crate) async fn create_aster_runtime_provider(");
    expect(providerFactorySource).toContain("pub async fn create_model_runtime_provider(");
    expect(
      leaks,
      "provider config DTO、env var / fast model 兼容规则和 Aster provider 创建细节必须留在 credential_bridge 子模块；公开 factory 入口必须使用 runtime provider 命名",
    ).toEqual([]);
  });

  it("runtime provider DTO 命名不得回流到 Aster provider", () => {
    const leaks = PROVIDER_RUNTIME_DTO_FILES.flatMap((filePath) => {
      const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
      return PROVIDER_RUNTIME_DTO_FORBIDDEN_ASTER_NAMES.filter((snippet) =>
        source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);
    });

    expect(
      leaks,
      "current/compat 边界公开 DTO 必须使用 RuntimeProviderConfig/RuntimeProviderProtocol；Aster 命名只能留给 vendor 或 factory adapter 内部语义",
    ).toEqual([]);
  });

  it("subagent provider 执行必须走 model-provider RuntimeProvider 边界", () => {
    const modelProviderLibPath = "lime-rs/crates/model-provider/src/lib.rs";
    const modelProviderRuntimePath = "lime-rs/crates/model-provider/src/runtime_provider.rs";
    const subagentSchedulerPath = "lime-rs/crates/agent/src/subagent_scheduler.rs";
    const modelProviderLibSource = readFileSync(
      join(REPO_ROOT, modelProviderLibPath),
      "utf8",
    );
    const modelProviderRuntimeSource = readFileSync(
      join(REPO_ROOT, modelProviderRuntimePath),
      "utf8",
    );
    const subagentSchedulerSource = readFileSync(
      join(REPO_ROOT, subagentSchedulerPath),
      "utf8",
    );
    const combinedModelProviderSource = `${modelProviderLibSource}\n${modelProviderRuntimeSource}`;
    const missing = [
      ...MODEL_RUNTIME_PROVIDER_REQUIRED_SNIPPETS.filter(
        (snippet) => !combinedModelProviderSource.includes(snippet),
      ).map((snippet) => `${modelProviderRuntimePath}: ${snippet}`),
      ...SUBAGENT_PROVIDER_EXECUTION_REQUIRED_SNIPPETS.filter(
        (snippet) => !subagentSchedulerSource.includes(snippet),
      ).map((snippet) => `${subagentSchedulerPath}: ${snippet}`),
    ];
    const leaks = SUBAGENT_PROVIDER_EXECUTION_FORBIDDEN_ASTER_SNIPPETS.filter(
      (snippet) => subagentSchedulerSource.includes(snippet),
    ).map((snippet) => `${subagentSchedulerPath}: ${snippet}`);

    expect(
      missing,
      "subagent scheduler 必须只组装 model-provider DTO，并通过 Lime-owned RuntimeProvider trait 执行 provider 请求",
    ).toEqual([]);
    expect(
      leaks,
      "subagent scheduler 不得直接构造 Aster Message、依赖 Aster Provider trait 或调用 Aster provider.complete",
    ).toEqual([]);
  });

  it("aster_state provider config / Aster 注入必须留在 compat 子模块", () => {
    const asterStatePath = "lime-rs/crates/agent/src/aster_state.rs";
    const providerConfigPath = "lime-rs/crates/agent/src/aster_state/provider_config.rs";
    const asterStateSource = readFileSync(join(REPO_ROOT, asterStatePath), "utf8");
    const providerConfigSource = readFileSync(
      join(REPO_ROOT, providerConfigPath),
      "utf8",
    );
    const lineCount = asterStateSource.split(/\r?\n/u).length;
    const missing = [
      ...ASTER_STATE_PROVIDER_CONFIG_REQUIRED_SNIPPETS.filter(
        (snippet) => !asterStateSource.includes(snippet),
      ).map((snippet) => `${asterStatePath}: ${snippet}`),
      ...ASTER_STATE_PROVIDER_CONFIG_MODULE_REQUIRED_SNIPPETS.filter(
        (snippet) => !providerConfigSource.includes(snippet),
      ).map((snippet) => `${providerConfigPath}: ${snippet}`),
    ];
    const leaks = ASTER_STATE_FORBIDDEN_PROVIDER_CONFIG_SNIPPETS.filter(
      (snippet) => asterStateSource.includes(snippet),
    ).map((snippet) => `${asterStatePath}: ${snippet}`);

    expect(lineCount, "aster_state.rs 超过 1000 行时必须继续拆分").toBeLessThan(
      1000,
    );
    expect(existsSync(join(REPO_ROOT, providerConfigPath))).toBe(true);
    expect(
      missing,
      "Provider DTO、continuation capability 与 Aster provider 注入必须集中在 aster_state/provider_config.rs compat 边界",
    ).toEqual([]);
    expect(
      leaks,
      "aster_state.rs 主文件只保留状态编排，不得重新承接 provider DTO 或 Aster provider factory 注入",
    ).toEqual([]);
  });

  it("provider_env fast model 纯策略必须归属 model-provider", () => {
    const filePath = "lime-rs/crates/agent/src/credential_bridge/provider_env.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const missing = PROVIDER_ENV_REQUIRED_MODEL_PROVIDER_POLICY_SNIPPETS.filter(
      (snippet) => !source.includes(snippet),
    );
    const leaks = PROVIDER_ENV_FORBIDDEN_LOCAL_FAST_MODEL_POLICY_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      missing,
      "provider_env 只能把 RuntimeProviderConfig 投影到 model-provider 策略入参，不得持有 fast model provider 家族判定事实源",
    ).toEqual([]);
    expect(
      leaks,
      "first-party provider / base_url 纯判定必须归属 model-provider current crate",
    ).toEqual([]);
  });

  it("provider_configuration route protocol mapping 必须经由 model-provider DTO", () => {
    const filePath = "lime-rs/crates/agent/src/provider_configuration.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const missing = PROVIDER_CONFIGURATION_REQUIRED_MODEL_PROVIDER_SNIPPETS.filter(
      (snippet) => !source.includes(snippet),
    );
    const leaks =
      PROVIDER_CONFIGURATION_FORBIDDEN_DIRECT_ASTER_ROUTE_MAPPING_SNIPPETS.filter((snippet) =>
        source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      missing,
      "route protocol 纯映射必须先投影到 model-provider current DTO，再在 compat 边界转成 runtime provider protocol",
    ).toEqual([]);
    expect(
      leaks,
      "provider_configuration 不得把 App Server ProtocolKind 直接映射到 RuntimeProviderProtocol",
    ).toEqual([]);
  });

  it("provider_continuation_state capability 判定必须经由 model-provider DTO", () => {
    const filePath = "lime-rs/crates/agent/src/provider_continuation_state.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const missing = PROVIDER_CONTINUATION_REQUIRED_MODEL_PROVIDER_SNIPPETS.filter(
      (snippet) => !source.includes(snippet),
    );
    const leaks = PROVIDER_CONTINUATION_FORBIDDEN_ASTER_DECISION_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      missing,
      "provider continuation 纯能力判定必须归属 ModelProviderProtocol；runtime provider protocol 只能作为 compat adapter 输入",
    ).toEqual([]);
    expect(
      leaks,
      "provider continuation 不得直接基于 RuntimeProviderProtocol 做业务判定",
    ).toEqual([]);
  });

  it("session_query subagent cascade 树逻辑不得回流到 Aster helper", () => {
    const filePath = "lime-rs/crates/agent/src/session_query.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = SESSION_QUERY_FORBIDDEN_ASTER_TREE_HELPER_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "subagent cascade 树遍历必须归属 thread-store current projection；session_query 只允许做 Aster Session adapter",
    ).toEqual([]);
  });

  it("session_store delete_session 不得回流到 Aster SessionStore trait", () => {
    const filePath = "lime-rs/crates/agent/src/session_store.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = SESSION_STORE_FORBIDDEN_ASTER_DELETE_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "session_store::delete_session 只需要删除 agent_sessions 记录，必须走 current DAO / repository，不得重新实例化 Aster SessionStore compat 层",
    ).toEqual([]);
  });

  it("session_update compaction token 写回必须走 current repository", () => {
    const filePath = "lime-rs/crates/agent/src/session_update.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const missing = SESSION_UPDATE_REQUIRED_CURRENT_TOKEN_STATS_SNIPPETS.filter(
      (snippet) => !source.includes(snippet),
    );
    const leaks = SESSION_UPDATE_FORBIDDEN_ASTER_TOKEN_STATS_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      missing,
      "compaction session metrics 写回必须显式依赖 DbConnection 和 agent_session_repository current owner",
    ).toEqual([]);
    expect(
      leaks,
      "compaction token 统计写回不得回流到 Aster apply_session_update builder 链",
    ).toEqual([]);
  });

  it("direct_text_generation current 调用点不得使用无 DB compat fallback", () => {
    const leaks = DIRECT_TEXT_GENERATION_NO_DB_FALLBACK_FILES.flatMap((filePath) => {
      const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
      return DIRECT_TEXT_GENERATION_NO_DB_FALLBACK_PATTERN.test(source)
        ? [`${filePath}: run_direct_text_generation without db`]
        : [];
    });

    expect(
      leaks,
      "App Server / host-managed generation 必须使用 run_direct_text_generation_with_db，让 usage fallback 走 SessionRepository 而不是 Aster session query",
    ).toEqual([]);
  });

  it("ask_bridge 不得重新承接 Ask schema / response 纯逻辑", () => {
    const filePath = "lime-rs/crates/agent/src/ask_bridge.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = ASK_BRIDGE_FORBIDDEN_COMPAT_LOGIC_SNIPPETS.filter((snippet) =>
      source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "Ask schema / response 归一化必须归属 agent-runtime current crate；ask_bridge 只能保留 Aster callback adapter",
    ).toEqual([]);
  });

  it("aster_session_store 不得重新承接 session record 纯投影 helper", () => {
    const filePath = "lime-rs/crates/agent/src/aster_session_store.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const productionSource = source.split("#[cfg(test)]")[0] ?? source;
    const leaks = ASTER_SESSION_STORE_FORBIDDEN_SESSION_RECORD_HELPERS.filter(
      (snippet) => productionSource.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "Session row 默认值、timestamp/json/session_type 纯投影必须归属 thread-store::session_record；aster_session_store 只能保留 Aster SessionStore trait adapter 和 Aster DTO 转接",
    ).toEqual([]);
  });

  it("aster_session_store 主文件不得吞回已拆出的 compat helper", () => {
    const filePath = "lime-rs/crates/agent/src/aster_session_store.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const productionSource = source.split("#[cfg(test)]")[0] ?? source;
    const leaks = ASTER_SESSION_STORE_FORBIDDEN_SPLIT_HELPERS.filter((snippet) =>
      productionSource.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "runtime role、memory stub 与 session listing 投影只能留在 aster_session_store 子模块；主文件只允许保留 SessionStore trait adapter 接线",
    ).toEqual([]);
  });

  it("aster_session_store compat 主文件必须保持在 1000 行以内并外置测试", () => {
    const filePath = "lime-rs/crates/agent/src/aster_session_store.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const lineCount = source.split(/\r?\n/u).length;

    expect(lineCount, "compat 主文件超过 1000 行时必须继续拆分").toBeLessThan(
      1000,
    );
    expect(source).toContain('#[path = "aster_session_store_tests.rs"]');
    expect(source).not.toContain("mod tests {");
  });

  it("Aster SessionStore trait adapter 只能存在于拆分后的 compat 子模块", () => {
    const legacyAdapterPath = join(
      REPO_ROOT,
      "lime-rs/crates/agent/src/aster_session_store_adapter.rs",
    );
    expect(
      existsSync(legacyAdapterPath),
      "旧 aster_session_store_adapter.rs 是 dead 残留，不得恢复为生产模块",
    ).toBe(false);

    const agentSrcRoot = join(REPO_ROOT, "lime-rs/crates/agent/src");
    const leaks = collectTextFiles(agentSrcRoot).flatMap((file) => {
      const filePath = repoRelative(file);
      const source = readFileSync(file, "utf8");
      const snippets: string[] = [];
      if (/^\s*(?:pub\s+)?mod\s+aster_session_store_adapter\s*;/mu.test(source)) {
        snippets.push("mod aster_session_store_adapter;");
      }
      if (source.includes("AsterSessionStoreAdapter")) {
        snippets.push("AsterSessionStoreAdapter");
      }
      if (
        filePath !== ASTER_SESSION_STORE_TRAIT_ADAPTER_FILE &&
        source.includes("impl SessionStore for LimeSessionStore")
      ) {
        snippets.push("impl SessionStore for LimeSessionStore");
      }
      return snippets.map((snippet) => `${filePath}: ${snippet}`);
    });

    const adapterSource = readFileSync(
      join(REPO_ROOT, ASTER_SESSION_STORE_TRAIT_ADAPTER_FILE),
      "utf8",
    );
    const adapterLineCount = adapterSource.split(/\r?\n/u).length;

    expect(adapterSource).toContain("impl SessionStore for LimeSessionStore");
    expect(
      adapterLineCount,
      "aster_trait compat adapter 接近 1000 行时必须继续拆分，不能重新变成巨型兼容壳",
    ).toBeLessThan(1000);
    expect(
      leaks,
      "Aster SessionStore compat adapter 只能集中在 aster_session_store/aster_trait.rs；旧 adapter 文件、旧模块名和包装类型不得回流",
    ).toEqual([]);
  });

  it("runtime_conversation transcript 纯规则必须归属 thread-store", () => {
    const filePath =
      "lime-rs/crates/agent/src/aster_session_store/runtime_conversation.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const productionSource = source.split("#[cfg(test)]")[0] ?? source;
    const leaks = ASTER_RUNTIME_CONVERSATION_FORBIDDEN_TRANSCRIPT_HELPERS.filter(
      (snippet) => productionSource.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      existsSync(
        join(
          REPO_ROOT,
          "lime-rs/crates/thread-store/src/conversation_transcript.rs",
        ),
      ),
      "thread-store 必须拥有 conversation transcript 纯规则模块",
    ).toBe(true);
    expect(productionSource).toContain("thread_store::conversation_transcript");
    expect(
      leaks,
      "conversation transcript 的选择、计数和稳定 item id 规则必须归属 thread-store；runtime_conversation 只能保留 Aster runtime store DTO 转换",
    ).toEqual([]);
  });

  it("event_converter provider trace stage 必须通过 current DTO adapter", () => {
    const filePath = "lime-rs/crates/agent/src/event_converter.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = EVENT_CONVERTER_FORBIDDEN_PROVIDER_TRACE_STAGE_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "Provider trace stage 的 public DTO 必须归属 agent-protocol；event_converter 只允许在 Aster adapter 边界做枚举映射",
    ).toEqual([]);
  });

  it("event_converter 不得重新承接 MCP notification 纯投影逻辑", () => {
    const filePath = "lime-rs/crates/agent/src/event_converter.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = EVENT_CONVERTER_FORBIDDEN_MCP_NOTIFICATION_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "MCP notification -> tool stream projection 必须归属 tool-runtime current crate；event_converter 只能把 projection 映射为 AgentEvent",
    ).toEqual([]);
  });

  it("event_converter 不得重新承接 tool result extraction 纯逻辑", () => {
    const filePath = "lime-rs/crates/agent/src/event_converter.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = EVENT_CONVERTER_FORBIDDEN_TOOL_RESULT_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "工具结果文本、图片、metadata 与 structuredContent 提取必须归属 tool-runtime；event_converter 只能传入 runtime 开关并映射 GUI DTO",
    ).toEqual([]);
  });

  it("event_converter 不得重新承接 ActionRequired public payload 纯投影逻辑", () => {
    const filePath = "lime-rs/crates/agent/src/event_converter.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const productionSource = source.split("#[cfg(test)]")[0] ?? source;
    const leaks = EVENT_CONVERTER_FORBIDDEN_ACTION_REQUIRED_PROJECTION_SNIPPETS.filter(
      (snippet) => productionSource.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "ActionRequired scope 过滤、action type 和 public payload JSON 构造必须归属 agent-protocol；event_converter 只能做 Aster enum adapter",
    ).toEqual([]);
  });

  it("event_converter production 不得重新承接 MessageContent adapter", () => {
    const filePath = "lime-rs/crates/agent/src/event_converter.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const productionSource = source.split("#[cfg(test)]")[0] ?? source;
    const leaks = EVENT_CONVERTER_FORBIDDEN_MESSAGE_CONTENT_ADAPTER_SNIPPETS.filter(
      (snippet) => productionSource.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "Aster MessageContent -> runtime DTO/event 适配只能归属 message_content_adapter；event_converter production 只能分发 AgentEvent",
    ).toEqual([]);
  });

  it("event_converter production 不得重新承接 runtime timeline adapter", () => {
    const filePath = "lime-rs/crates/agent/src/event_converter.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const productionSource = source.split("#[cfg(test)]")[0] ?? source;
    const leaks = EVENT_CONVERTER_FORBIDDEN_RUNTIME_TIMELINE_ADAPTER_SNIPPETS.filter(
      (snippet) => productionSource.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "Aster TurnRuntime / ItemRuntime -> timeline DTO 适配只能归属 runtime_timeline_adapter；event_converter production 只能分发 AgentEvent",
    ).toEqual([]);
  });

  it("aster_runtime_projection facade 不得重新承接 runtime snapshot / subagent adapter", () => {
    const filePath = "lime-rs/crates/agent/src/aster_runtime_projection.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const productionSource = source.split("#[cfg(test)]")[0] ?? source;
    const leaks = ASTER_RUNTIME_PROJECTION_FORBIDDEN_SNAPSHOT_ADAPTER_SNIPPETS.filter(
      (snippet) => productionSource.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "Aster runtime snapshot / session execution / subagent latest-turn DTO 适配必须归属小型 compat adapter；aster_runtime_projection 只允许保留 thin facade 和 message/auto-compaction adapter",
    ).toEqual([]);
  });

  it("App Server 不得重新公开使用 Aster turn context 类型", () => {
    const crateRoot = join(REPO_ROOT, "lime-rs/crates/app-server");
    const leaks = collectTextFiles(crateRoot).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return APP_SERVER_FORBIDDEN_TURN_CONTEXT_SNIPPETS.filter((snippet) =>
        source.includes(snippet),
      ).map((snippet) => `${repoRelative(file)}: ${snippet}`);
    });

    expect(
      leaks,
      "App Server 只能使用 agent-protocol / AgentTurnContext；Aster turn context 只能留在 lime-agent migration facade 内部",
    ).toEqual([]);
  });

  it("runtime_facade 不得重新公开 Aster 类型", () => {
    const filePath = "lime-rs/crates/agent/src/runtime_facade.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = RUNTIME_FACADE_FORBIDDEN_TURN_CONTEXT_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "runtime_facade 只能保留显式 compat allowlist；不得恢复 Aster module-level / wildcard re-export 或公开 Aster turn context",
    ).toEqual([]);
  });

  it("已迁工具编排文件不得重新使用 Aster turn context DTO", () => {
    const forbiddenSnippets = [
      "use aster::session::TurnContextOverride",
      "aster::session::TurnContextOverride",
      "use aster::session::TurnOutputSchemaSource",
      "aster::session::TurnOutputSchemaSource",
    ];
    const leaks = AGENT_TURN_CONTEXT_MIGRATED_FILES.flatMap((filePath) => {
      const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
      return forbiddenSnippets
        .filter((snippet) => source.includes(snippet))
        .map((snippet) => `${filePath}: ${snippet}`);
    });

    expect(
      leaks,
      "工具编排 public 输入必须使用 AgentTurnContext；Aster turn context 只能在真正调用 Aster registry 前局部转换",
    ).toEqual([]);
  });

  it("protocol_projection 不得重新公开 Aster runtime timeline DTO", () => {
    const filePath = "lime-rs/crates/agent/src/protocol_projection.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = PROTOCOL_PROJECTION_FORBIDDEN_RUNTIME_DTO_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "protocol_projection 的 timeline runtime 入口只能接 Lime current DTO；Aster TurnRuntime / ItemRuntime 只能留在 adapter 边界",
    ).toEqual([]);
  });

  it("session_execution_runtime production 不得重新消费 Aster runtime snapshot / turn DTO", () => {
    const filePath = "lime-rs/crates/agent/src/session_execution_runtime.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const productionSource = source.split("#[cfg(test)]")[0] ?? source;
    const leaks = SESSION_EXECUTION_RUNTIME_FORBIDDEN_PRODUCTION_SNAPSHOT_SNIPPETS.filter(
      (snippet) => productionSource.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "session_execution_runtime production builder 只能接 Lime projection DTO；Aster snapshot / turn DTO 只能留在 adapter 或测试 fixture",
    ).toEqual([]);
  });

  it("subagent_control production 不得重新消费 Aster runtime snapshot / turn/item DTO", () => {
    const filePath = "lime-rs/crates/agent/src/subagent_control.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const productionSource = source.split("#[cfg(test)]")[0] ?? source;
    const leaks = SUBAGENT_CONTROL_FORBIDDEN_PRODUCTION_RUNTIME_DTO_SNIPPETS.filter(
      (snippet) => productionSource.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "subagent_control production 只能消费 Lime SubagentTurnStatus / SubagentLatestTurnProjection；Aster runtime snapshot / turn/item DTO 只能留在 adapter 边界",
    ).toEqual([]);
  });

  it("session_store_subagent_context 不得重新引入 Aster runtime snapshot 测试 helper", () => {
    const filePath = "lime-rs/crates/agent/src/session_store_subagent_context.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = SESSION_STORE_SUBAGENT_CONTEXT_FORBIDDEN_RUNTIME_DTO_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "session_store_subagent_context 的测试 helper 只能使用 Lime current turn projection；Aster runtime snapshot/turn DTO 只能留在 adapter 边界",
    ).toEqual([]);
  });

  it("Aster 迁移路线图必须作为可版本化文档保留", () => {
    const gitignore = readFileSync(join(REPO_ROOT, ".gitignore"), "utf8");
    const roadmapRoot = join(REPO_ROOT, "internal/roadmap/astermigration");
    const expectedFiles = [
      "README.md",
      "aster-runtime-codex-style-migration-plan.md",
    ];

    expect(existsSync(roadmapRoot)).toBe(true);
    for (const fileName of expectedFiles) {
      expect(existsSync(join(roadmapRoot, fileName))).toBe(true);
    }
    expect(gitignore).toContain("!internal/roadmap/astermigration/");
    expect(gitignore).toContain("!internal/roadmap/astermigration/**");
  });
});
