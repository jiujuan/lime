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
  "lime-rs/crates/agent/src/session_configuration.rs",
  "lime-rs/crates/agent/src/session_usage_projection.rs",
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
  "pub use aster::agents::NativeToolExecutionHook",
  "pub use aster::agents::NativeToolExecutionRequest",
  "pub use aster::agents::ToolCallResult",
  "pub use aster::tools::*",
  "pub use aster::tools::{",
  "pub use aster::tools::PermissionBehavior",
  "pub use aster::tools::PermissionCheckResult",
  "pub use aster::tools::Tool;",
  "pub use aster::tools::ToolContext",
  "pub use aster::tools::ToolError",
  "pub use aster::tools::ToolResult",
  "pub use aster::session::{TurnContextOverride",
  "pub use aster::session::TurnContextOverride",
  "pub use aster::session::{TurnOutputSchemaSource",
  "pub use aster::session::TurnOutputSchemaSource",
  "pub fn current_turn_context",
  "pub async fn with_turn_context",
];

const APP_SERVER_RUNTIME_BACKEND_FORBIDDEN_RUNTIME_FACADE_TOOL_SNIPPETS = [
  "runtime_facade::",
  "NativeToolExecutionHook",
  "NativeToolExecutionRequest",
  "ToolCallResult",
  "runtime_facade::{PermissionBehavior",
  "runtime_facade::{PermissionCheckResult",
  "runtime_facade::{Tool,",
  "runtime_facade::{ToolContext",
  "runtime_facade::{ToolError",
  "runtime_facade::{ToolResult",
  "runtime_facade::PermissionBehavior",
  "runtime_facade::PermissionCheckResult",
  "runtime_facade::Tool",
  "runtime_facade::ToolContext",
  "runtime_facade::ToolError",
  "runtime_facade::ToolResult",
  "Box<dyn Tool>",
  "dyn Tool>",
];

const ASTER_LIVE_EXECUTION_HOOK_ALLOWED_FILES = [
  "lime-rs/crates/agent/src/live_execution_process.rs",
  "lime-rs/crates/agent/src/runtime_state.rs",
];

const ASTER_LIVE_EXECUTION_HOOK_FORBIDDEN_SNIPPETS = [
  "NativeToolExecutionHook",
  "NativeToolExecutionRequest",
  "ToolCallResult",
  "set_native_tool_execution_hook",
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
  "RuntimeCredentialData::OpenAIKey",
  "RuntimeCredentialData::ClaudeKey",
  "RuntimeCredentialData::AnthropicKey",
  "RuntimeCredentialData::GeminiApiKey",
  "RuntimeCredentialData::VertexKey",
];

const CREDENTIAL_BRIDGE_FORBIDDEN_DEAD_PROVIDER_FACTORY_SNIPPETS = [
  "mod provider_factory;",
  "provider_factory::",
  "HttpRuntimeProviderResolver",
];

const CREDENTIAL_BRIDGE_FORBIDDEN_NOOP_HEALTH_SNIPPETS = [
  "ProviderExecutionFailed",
  "pub fn mark_healthy(",
  "pub fn mark_unhealthy(",
  ".mark_healthy(",
  ".mark_unhealthy(",
  "忽略已退役的旧 credential 健康标记",
  "忽略已退役的旧 credential 失败标记",
];

const LIME_AGENT_PUBLIC_ASTER_MODULE_FORBIDDEN_SNIPPETS = [
  "pub mod aster_runtime_support;",
  "pub mod aster_session_store;",
  "pub mod aster_state;",
  "pub mod aster_state_support;",
  "mod aster_state;",
  "mod aster_state_support;",
  "pub use aster_state::{",
  "pub use aster_state_support::{",
  "pub mod credential_bridge;",
  "pub use credential_bridge::{",
  "pub use credential_bridge::CredentialBridge",
  "pub use credential_bridge::CredentialBridgeError",
  "AsterAgentState",
  "initialize_aster_runtime",
  "restore_aster_runtime_queued_turns",
];

const LIME_AGENT_PUBLIC_ASTER_NAMING_FORBIDDEN_SNIPPETS = [
  "pub struct AsterAgentState",
  "pub use aster_state::{AsterAgentState",
  "pub aster_state:",
  "AsterAgentState::new()",
  "pub type AgentSessionConfig = aster::agents::SessionConfig",
];

const LIME_AGENT_FORBIDDEN_ASTER_STATE_FILES = [
  "lime-rs/crates/agent/src/aster_state.rs",
  "lime-rs/crates/agent/src/aster_state_support.rs",
  "lime-rs/crates/agent/src/aster_runtime_support.rs",
];

const APP_SERVER_FORBIDDEN_ASTER_BACKEND_SNIPPETS = [
  "AsterBackend",
  "AsterBackendHost",
  "AsterBackendSubmitRequest",
  "AsterBackendProcessControlCapabilities",
  "mod aster_backend;",
  "aster_backend::",
  "aster_runtime_core",
  "aster_app_server",
];

const APP_SERVER_FORBIDDEN_ASTER_BACKEND_FILES = [
  "lime-rs/crates/app-server/src/aster_backend.rs",
];

const CREDENTIAL_BRIDGE_FORBIDDEN_PUBLIC_API_SNIPPETS = [
  "pub enum CredentialBridgeError",
  "pub struct CredentialBridge",
  "pub fn new() -> Self",
  "pub async fn select_and_configure(",
  "pub fn record_usage(",
  "UnsupportedCredentialType",
];

const PROVIDER_FACTORY_FORBIDDEN_PUBLIC_ASTER_FACTORY_SNIPPETS = [
  "pub use provider_factory::create_aster_provider",
  "pub async fn create_aster_provider(",
  "pub use provider_factory::create_aster_runtime_provider",
  "pub use provider_factory::{create_aster_runtime_provider",
  "pub(crate) use aster_provider_adapter::create_aster_runtime_provider",
  "pub async fn create_aster_runtime_provider(",
  "pub(crate) async fn create_aster_runtime_provider(",
  "pub use provider_factory::create_model_runtime_provider",
  "pub(crate) use provider_factory::create_model_runtime_provider",
  "pub async fn create_model_runtime_provider(",
  "pub(crate) async fn create_model_runtime_provider(",
  "async fn create_model_runtime_provider(",
  "create_runtime_provider",
  "create_aster_backed_runtime_provider",
  "AsterCompatRuntimeProviderResolver",
];

const PROVIDER_FACTORY_FORBIDDEN_MISLEADING_CURRENT_RESOLVER_SNIPPETS = [
  "CredentialRuntimeProviderResolver",
];

const RUNTIME_CONFIG_PROJECTION_FORBIDDEN_ASTER_MAPPING_SNIPPETS = [
  "map_provider_type_to_aster(",
  "map_provider_type_to_aster_with_api_type(",
];

const RUNTIME_PROVIDER_NAMING_FORBIDDEN_ASTER_SNIPPETS = [
  "aster_provider_name",
  "expected_aster_provider",
  "aster_provider=",
  "map_provider_type_to_aster",
];

const STREAM_DIAGNOSTICS_FORBIDDEN_ASTER_PROVIDER_ERROR_SNIPPETS = [
  "use aster::providers::errors::ProviderError",
  "ProviderError::message_is_non_retryable_provider_rejection",
];

const MODEL_RUNTIME_PROVIDER_CONFIG_REQUIRED_SNIPPETS = [
  "pub enum RuntimeProviderProtocol",
  "pub struct RuntimeProviderConfig",
  "pub protocol: Option<RuntimeProviderProtocol>",
  "pub fn message_is_non_retryable_provider_rejection",
];

const MODEL_RUNTIME_PROVIDER_FORBIDDEN_DEAD_EXECUTION_SNIPPETS = [
  "pub trait RuntimeProvider",
  "pub trait RuntimeProviderResolver",
  "async fn complete(",
  "resolve_provider(",
];

const MODEL_PROVIDER_FORBIDDEN_DEAD_ROUTER_SNIPPETS = [
  "pub mod router;",
  "ProviderRequest",
  "ProviderResponse",
  "ProviderRouter",
  "StreamResponse",
  "StreamChunk",
];

const MODEL_PROVIDER_FORBIDDEN_DEAD_CATALOG_SNIPPETS = [
  "pub struct ModelTaskRequest",
  "pub struct ModelProviderError",
  "pub type ModelProviderResult",
  "pub trait ModelProviderCatalog",
];

const SESSION_PROVIDER_HANDLE_REQUIRED_SNIPPETS = [
  "SessionProviderHandle",
  "create_session_provider_handle",
  "reply_stream_with_agent",
];

const SESSION_PROVIDER_HANDLE_FORBIDDEN_DIRECT_ASTER_ESCAPE_SNIPPETS = [
  "pub(crate) fn aster_provider(&self)",
  "pub(crate) async fn aster_provider(",
];

const REQUEST_TOOL_POLICY_FORBIDDEN_DIRECT_ASTER_PROVIDER_SNIPPETS = [
  "use aster::providers::base::Provider",
  "Option<Arc<dyn Provider>>",
  "Some(provider.aster_provider())",
];

const AGENT_SESSION_CONFIG_CURRENT_CALL_SURFACE_FILES = [
  "lime-rs/crates/agent/src/direct_text_generation.rs",
  "lime-rs/crates/agent/src/runtime_state_support.rs",
  "lime-rs/crates/agent/src/skill_execution.rs",
  "lime-rs/crates/agent/src/turn_execution.rs",
];

const AGENT_SESSION_CONFIG_FORBIDDEN_PUBLIC_ASTER_SNIPPETS = [
  "pub fn build(self) -> SessionConfig",
  "pub(crate) fn build(self) -> SessionConfig",
  ") -> SessionConfig {",
  "session_config: SessionConfig",
  "session_config: aster::agents::SessionConfig",
  "let session_config = aster::agents::SessionConfig",
];

const AGENT_TURN_EXECUTION_FORBIDDEN_ASTER_MESSAGE_SNIPPETS = [
  "use aster::conversation::message::Message",
  "Message::user().with_text",
  "stream_message_reply_with_policy_and_provider",
];

const REQUEST_TOOL_POLICY_FORBIDDEN_ASTER_SESSION_CONFIG_SIGNATURES = [
  "pub async fn stream_reply_with_policy",
  "pub(crate) async fn stream_message_reply_with_policy",
  "pub(crate) async fn stream_reply_with_policy_and_provider",
  "pub(crate) async fn stream_reply_with_policy_and_provider_for_direct_generation",
];

const REQUEST_TOOL_POLICY_FORBIDDEN_DIRECT_ASTER_SESSION_CONFIG_CALLS = [
  "let session_config = aster::agents::SessionConfig",
  "into_aster_session_config",
  "to_aster_session_config(",
];

const REQUEST_TOOL_POLICY_MAIN_FORBIDDEN_ASTER_REPLY_STREAM_SNIPPETS = [
  "use aster::conversation::message::Message",
  "Message::user().with_text",
  "Message::user()\n",
  "project_aster_runtime_event",
  "project_aster_auto_compaction_event",
  "AsterAgentEvent",
  "use futures::StreamExt",
  ".reply(",
  "session_config: aster::agents::SessionConfig",
];

const REQUEST_TOOL_POLICY_RUNTIME_STATUS_FORBIDDEN_ASTER_SESSION_CONFIG_SNIPPETS = [
  "session_config: &aster::agents::SessionConfig",
  "TurnContextOverride",
  "Option<&TurnContextOverride>",
];

const SESSION_CONFIG_ADAPTER_ALLOWED_ASTER_SESSION_CONFIG_FILES = [
  "lime-rs/crates/agent/src/session_config_adapter.rs",
];

const SESSION_CONFIG_ADAPTER_FORBIDDEN_ASTER_SESSION_CONFIG_SNIPPETS = [
  "aster::agents::SessionConfig {",
];

const SKILL_EXECUTION_FORBIDDEN_DIRECT_ASTER_REPLY_SNIPPETS = [
  "project_aster_runtime_event",
  "WriteArtifactEventEmitter",
  "use futures::StreamExt",
  "into_aster_session_config",
  "use aster::conversation::message::Message",
  "Message::user().with_text",
  ".reply(",
];

const RUNTIME_STATE_FORBIDDEN_DIRECT_ASTER_REPLY_SNIPPETS = [
  "use aster::conversation::message",
  "ActionRequiredData::ElicitationResponse",
  "MessageContent::ActionRequired",
  "Message::user()",
  "use aster::permission::{",
  "PermissionConfirmation",
  "PrincipalType",
  "Permission::AllowOnce",
  "Permission::DenyOnce",
  ".handle_confirmation(",
  "use futures::StreamExt",
  "into_aster_session_config",
  ".reply(",
  "AgentEvent::Message",
];

const PROVIDER_CONFIGURATION_FORBIDDEN_ASTER_PROVIDER_INSTALL_SNIPPETS = [
  ".update_provider(",
  "provider.aster_provider()",
];

const ASTER_LIVE_PROVIDER_TEST_FORBIDDEN_FILES = [
  "lime-rs/crates/agent/tests/real_codex_tool_events.rs",
  "lime-rs/crates/agent/tests/real_web_search_policy.rs",
  "lime-rs/crates/agent/tests/real_web_search_preflight_short_input.rs",
];

const ASTER_LIVE_PROVIDER_TEST_FORBIDDEN_SNIPPETS = [
  "LIME_REAL_API_TEST",
  "PROXYCAST_REAL_API_TEST",
  "真实联网测试",
  "test_real_codex",
  "test_real_web_search",
];

const TOOL_SOURCE_KIND_FORBIDDEN_ASTER_SNIPPETS = [
  "AsterBuiltin",
  "aster_builtin",
];

const CREDENTIAL_BRIDGE_PROVIDER_CONFIG_FORBIDDEN_LOCAL_DTO_SNIPPETS = [
  "pub enum RuntimeProviderProtocol",
  "pub struct RuntimeProviderConfig",
  "pub use provider_config::{RuntimeProviderConfig, RuntimeProviderProtocol}",
  "pub use model_provider::runtime_provider::{RuntimeProviderConfig, RuntimeProviderProtocol}",
];

const SUBAGENT_SCHEDULER_FORBIDDEN_PUBLIC_SNIPPETS = [
  "pub mod subagent_scheduler",
  "pub use subagent_scheduler::{",
  "LimeScheduler",
  "LimeSubAgentExecutor",
  "SchedulerEventEmitter",
  "SubAgentProgressEvent",
  "SubAgentRole",
];

const ASTER_STATE_FORBIDDEN_PROVIDER_CONFIG_SNIPPETS = [
  "mod provider_config;",
  "provider_config::ProviderConfig",
  "current_provider_config",
  "ProviderConfig",
  "pub struct ProviderConfig",
  "pub(crate) struct ProviderConfig",
  "impl ProviderContinuationCapable for ProviderConfig",
  "pub async fn configure_provider(",
  "pub(crate) async fn configure_provider(",
  "pub async fn configure_provider_from_pool(",
  "pub(crate) async fn configure_provider_from_pool(",
  "pub fn mark_current_healthy(",
  "pub fn mark_current_unhealthy(",
  "pub async fn get_provider_config(",
  "pub async fn clear_provider_config(",
  "pub async fn is_provider_configured(",
  "create_aster_runtime_provider",
  "RuntimeProviderConfig",
];

const ASTER_STATE_FORBIDDEN_INTERRUPT_MARKER_SNIPPETS = [
  "RuntimeInterruptMarker",
  "interrupt_markers",
  "record_interrupt_request",
  "get_interrupt_marker",
  "clear_interrupt_marker",
  "requested_at",
];

const ASTER_STATE_FORBIDDEN_UNUSED_PUBLIC_WRAPPER_SNIPPETS = [
  "pub fn reload_lime_skills(",
  "pub async fn with_agent<F",
  "pub fn build_project_system_prompt(",
  "pub async fn register_mcp_bridge(",
];

const ASTER_STATE_SUPPORT_FORBIDDEN_UNUSED_PUBLIC_HELPER_SNIPPETS = [
  "pub fn build_project_system_prompt(",
  "pub fn load_workspace_lime_skills(",
  "load_workspace_lime_skills",
  "pub mod message_helpers",
  "message_helpers",
  "user_text(",
  "assistant_text(",
];

const PROVIDER_SESSION_CONFIGURATION_ALLOWED_DIRECT_ASTER_STATE_CALL_FILES = [
  "lime-rs/crates/agent/src/provider_configuration.rs",
];

const PROVIDER_SESSION_CONFIGURATION_ALLOWED_INTERNAL_REQUEST_FILES = [
  "lime-rs/crates/agent/src/provider_configuration.rs",
];

const PROVIDER_SESSION_CONFIGURATION_FORBIDDEN_DIRECT_ASTER_STATE_CALL_SNIPPETS = [
  ".configure_provider(",
  ".configure_provider_from_pool(",
];

const PROVIDER_SESSION_CONFIGURATION_FORBIDDEN_INTERNAL_REQUEST_SNIPPETS = [
  "ProviderConfigurationRequest",
  "configure_provider_for_session(",
];

const PROVIDER_PUBLIC_API_FORBIDDEN_ASTER_STATE_CONFIG_SNIPPETS = [
  "ProviderConfig, QueuedTurnTask",
  "route_protocol_from_provider_config",
  "ProviderConfigurationRequest",
  "configure_provider_for_session",
  "create_model_runtime_provider",
];

const PROVIDER_RUNTIME_DTO_FILES = [
  "lime-rs/crates/agent/src/provider_configuration.rs",
  "lime-rs/crates/agent/src/provider_continuation_state.rs",
  "lime-rs/crates/agent/src/runtime_state.rs",
];

const PROVIDER_RUNTIME_DTO_FORBIDDEN_ASTER_NAMES = [
  "AsterProviderConfig",
  "AsterProviderProtocol",
  "aster_provider_protocol_from_model_provider_protocol",
  "model_provider_protocol_from_aster_protocol",
];

const PROVIDER_ENV_REQUIRED_MODEL_PROVIDER_POLICY_SNIPPETS = [
  "model_provider::safety::should_disable_provider_default_fast_model",
  "RuntimeProviderProtocol::to_model_provider_protocol",
];

const PROVIDER_ENV_FORBIDDEN_LOCAL_FAST_MODEL_POLICY_SNIPPETS = [
  "fn is_first_party_openai_selector",
  "fn is_first_party_openai_base_url",
  "fn is_first_party_anthropic_selector",
  "fn is_first_party_anthropic_base_url",
  "fn model_provider_protocol_from_runtime_protocol",
];

const PROVIDER_CONFIGURATION_REQUIRED_MODEL_PROVIDER_SNIPPETS = [
  "model_provider::ModelProviderProtocol",
  "model_provider_protocol_from_route_protocol",
  "runtime_provider_protocol_from_model_provider_protocol",
  "RuntimeProviderProtocol::to_model_provider_protocol",
];

const PROVIDER_CONFIGURATION_REQUIRED_AGENT_RUNTIME_SNIPPETS = [
  "agent_runtime::turn_executor::TurnProviderConfiguration",
  "turn_provider: TurnProviderConfiguration",
];

const AGENT_RUNTIME_PROVIDER_CONFIGURATION_REQUIRED_SNIPPETS = [
  "pub struct TurnProviderConfiguration",
  "pub route: ModelRoute",
  "pub reasoning_effort: Option<String>",
  "from_model_selection",
];

const AGENT_RUNTIME_FORBIDDEN_DEAD_EXECUTION_SNIPPETS = [
  "pub trait AgentRuntime",
  "pub trait TurnExecutor",
  "pub struct AgentRuntimeCapabilities",
  "pub struct StartTurnRequest",
  "pub struct ExecuteTurnRequest",
  "pub struct QueueSubagentRequest",
  "pub struct HandleActionRequest",
  "async fn execute_turn",
  "async fn queue_subagent",
  "async fn handle_action_response",
];

const TOOL_RUNTIME_FORBIDDEN_DEAD_EXECUTION_SNIPPETS = [
  "pub trait ToolRuntime",
  "pub struct ToolDefinition",
  "pub struct ToolInvocation",
  "pub enum ToolPermissionDecision",
  "pub enum ToolOutcomeStatus",
  "pub struct ToolOutcome",
  "pub struct ToolRuntimeError",
  "pub type ToolRuntimeResult",
  "fn list_tools(",
  "fn check_permission(",
  "fn invoke(",
];

const PROVIDER_CONFIGURATION_FORBIDDEN_DIRECT_ASTER_ROUTE_MAPPING_SNIPPETS = [
  "ProtocolKind::OpenaiResponses | ProtocolKind::CodexResponses => {\n            Some(RuntimeProviderProtocol::Responses)",
  "ProtocolKind::OpenaiChat => Some(RuntimeProviderProtocol::ChatCompletions)",
  "fn model_provider_protocol_from_runtime_protocol",
];

const PROVIDER_CONTINUATION_REQUIRED_MODEL_PROVIDER_SNIPPETS = [
  "model_provider::ModelProviderProtocol",
  "resolve_provider_continuation_capability_for_model_protocol",
  "RuntimeProviderProtocol::to_model_provider_protocol",
];

const PROVIDER_CONTINUATION_FORBIDDEN_ASTER_DECISION_SNIPPETS = [
  "protocol.is_some_and(RuntimeProviderProtocol::uses_responses_api)",
  "fn model_provider_protocol_from_runtime_protocol",
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

const SESSION_UPDATE_FORBIDDEN_PUBLIC_ASTER_SURFACE_SNIPPETS = [
  "use aster::conversation::Conversation",
  "create_subagent_session as create_aster_subagent_session",
  "replace_session_conversation as replace_aster_session_conversation",
  "pub async fn persist_session_extension_data",
  "pub async fn create_subagent_session",
  "pub async fn replace_session_conversation",
  "Session,",
];

const DIRECT_TEXT_GENERATION_NO_DB_FALLBACK_FILES = [
  "lime-rs/crates/app-server/src/runtime_backend/image_command/presentation.rs",
  "lime-rs/crates/app-server/src/runtime_backend/plugin_worker_generation.rs",
  "lime-rs/crates/agent/src/host_managed_generation.rs",
];

const DIRECT_TEXT_GENERATION_NO_DB_FALLBACK_PATTERN =
  /\brun_direct_text_generation\b(?!_with_db)/u;

const DIRECT_TEXT_GENERATION_FORBIDDEN_ASTER_USAGE_SNIPPETS = [
  "use aster::",
  "run_direct_text_generation(",
  "run_direct_text_generation_with_optional_db",
  "repository_db: Option<DbConnection>",
  "resolve_session_usage_from_aster",
  "aster_session",
  "query_session",
  "Session as AsterSession",
  "Agent as AsterAgent",
  "fn resolve_usage_from_session(",
  "fn resolve_usage_from_token_stats(",
];

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

const ASTER_SESSION_STORE_FORBIDDEN_DEAD_EXTENSION_HELPERS = [
  "pub fn load_extension_data_sync(",
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

const EVENT_CONVERTER_FORBIDDEN_PUBLIC_SURFACE_SNIPPETS = [
  "pub mod event_converter;",
  "pub use crate::protocol::",
  "pub fn convert_agent_event",
  "TauriAgentEvent",
  "TauriMessage",
  "TauriRuntimeStatus",
  "TauriProviderTraceStage",
  "TauriToolProgressPayload",
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

  it("lime-agent 根 API 不得公开 Aster 命名模块或 CredentialBridge compat 类型", () => {
    const libPath = "lime-rs/crates/agent/src/lib.rs";
    const credentialBridgePath = "lime-rs/crates/agent/src/credential_bridge.rs";
    const sessionStorePath = "lime-rs/crates/agent/src/aster_session_store.rs";
    const libSource = readFileSync(join(REPO_ROOT, libPath), "utf8");
    const credentialBridgeSource = readFileSync(
      join(REPO_ROOT, credentialBridgePath),
      "utf8",
    );
    const sessionStoreSource = readFileSync(join(REPO_ROOT, sessionStorePath), "utf8");
    const publicModuleLeaks = LIME_AGENT_PUBLIC_ASTER_MODULE_FORBIDDEN_SNIPPETS.filter(
      (snippet) => libSource.includes(snippet),
    ).map((snippet) => `${libPath}: ${snippet}`);
    const publicCredentialLeaks = CREDENTIAL_BRIDGE_FORBIDDEN_PUBLIC_API_SNIPPETS.filter(
      (snippet) => credentialBridgeSource.includes(snippet),
    ).map((snippet) => `${credentialBridgePath}: ${snippet}`);
    const publicAsterNamingLeaks = LIME_AGENT_PUBLIC_ASTER_NAMING_FORBIDDEN_SNIPPETS.flatMap(
      (snippet) =>
        [
          libPath,
          "lime-rs/crates/agent/src/session_configuration.rs",
          "lime-rs/crates/agent/src/runtime_state.rs",
          "lime-rs/crates/agent/src/skill_execution.rs",
        ]
          .filter((filePath) =>
            readFileSync(join(REPO_ROOT, filePath), "utf8").includes(snippet),
          )
          .map((filePath) => `${filePath}: ${snippet}`),
    );
    const restoredAsterStateFiles = LIME_AGENT_FORBIDDEN_ASTER_STATE_FILES.filter((filePath) =>
      existsSync(join(REPO_ROOT, filePath)),
    );
    const deadExtensionHelperLeaks =
      ASTER_SESSION_STORE_FORBIDDEN_DEAD_EXTENSION_HELPERS.filter((snippet) =>
        sessionStoreSource.includes(snippet),
      ).map((snippet) => `${sessionStorePath}: ${snippet}`);

    expect(
      publicModuleLeaks,
      "Aster 命名模块只能作为 lime-agent crate 内部 compat 边界，外部 crate 不得继续挂靠模块路径",
    ).toEqual([]);
    expect(
      publicCredentialLeaks,
      "CredentialBridge 是 lime-agent 内部 provider compat 细节，不得作为 crate public API 或保留无消费者错误枚举",
    ).toEqual([]);
    expect(
      publicAsterNamingLeaks,
      "lime-agent public API 不得恢复 AsterAgentState 或 public aster_state 字段；当前对外类型是 AgentRuntimeState",
    ).toEqual([]);
    expect(
      restoredAsterStateFiles,
      "Agent runtime state 当前文件是 runtime_state.rs / runtime_state_support.rs；旧 aster_state* 文件不得恢复为 current owner",
    ).toEqual([]);
    expect(
      deadExtensionHelperLeaks,
      "Aster session store 不得恢复无消费者同步 extension data helper；读取必须走真实 projection adapter",
    ).toEqual([]);
  });

  it("App Server public backend adapter 不得恢复 AsterBackend 命名", () => {
    const checkedPaths = [
      "lime-rs/crates/app-server/src/lib.rs",
      "lime-rs/crates/app-server/src/runtime_backend_adapter.rs",
      "lime-rs/crates/app-server/src/runtime_factory.rs",
      "lime-rs/crates/app-server/tests/host_boundary_guard.rs",
    ];
    const leaks = checkedPaths.flatMap((filePath) => {
      const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
      return APP_SERVER_FORBIDDEN_ASTER_BACKEND_SNIPPETS.filter((snippet) =>
        source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);
    });
    const restoredFiles = APP_SERVER_FORBIDDEN_ASTER_BACKEND_FILES.filter((filePath) =>
      existsSync(join(REPO_ROOT, filePath)),
    );

    expect(
      existsSync(join(REPO_ROOT, "lime-rs/crates/app-server/src/runtime_backend_adapter.rs")),
      "App Server backend adapter current 文件必须是 runtime_backend_adapter.rs",
    ).toBe(true);
    expect(
      leaks,
      "App Server public backend facade 不得继续暴露 AsterBackend* 或 aster_* factory；旧 --backend aster 仅可作为 CLI 负向测试存在",
    ).toEqual([]);
    expect(
      restoredFiles,
      "旧 app-server/src/aster_backend.rs 不得恢复；current owner 是 runtime_backend_adapter.rs",
    ).toEqual([]);
  });

  it("provider_safety 只能留在 credential_bridge Aster adapter 边界", () => {
    const oldPath = "lime-rs/crates/agent/src/provider_safety.rs";
    const filePath = "lime-rs/crates/agent/src/credential_bridge/provider_safety.rs";
    const credentialBridgePath = "lime-rs/crates/agent/src/credential_bridge.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const credentialBridgeSource = readFileSync(
      join(REPO_ROOT, credentialBridgePath),
      "utf8",
    );
    const leaks = PROVIDER_SAFETY_FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
      source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      existsSync(join(REPO_ROOT, oldPath)),
      "provider_safety 是 Aster Provider wrapper，不得恢复为 lime-agent 顶层模块",
    ).toBe(false);
    expect(credentialBridgeSource).toContain("mod provider_safety;");
    expect(
      leaks,
      "provider_safety 只能作为 credential_bridge Aster Provider adapter；文本截断等纯策略必须归属 model-provider current crate",
    ).toEqual([]);
  });

  it("runtime provider 命名不得继续使用 Aster provider 字段名", () => {
    const checkedPaths = [
      "lime-rs/crates/core/src/database/dao/api_key_provider.rs",
      "lime-rs/crates/agent/src/credential_bridge/provider_mapping.rs",
      "lime-rs/crates/agent/src/credential_bridge/runtime_config_projection.rs",
    ];
    const leaks = checkedPaths.flatMap((filePath) => {
      const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
      return RUNTIME_PROVIDER_NAMING_FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
        source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);
    });

    expect(
      leaks,
      "runtime provider 元数据和投影必须使用 Lime-owned runtime provider 命名；Aster provider name 只能出现在 vendor/compat adapter 语义内",
    ).toEqual([]);
  });

  it("stream diagnostics 不得依赖 Aster ProviderError 判定", () => {
    const filePath =
      "lime-rs/crates/agent/src/request_tool_policy/stream_diagnostics.rs";
    const modelProviderRuntimePath =
      "lime-rs/crates/model-provider/src/runtime_provider.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const modelProviderRuntimeSource = readFileSync(
      join(REPO_ROOT, modelProviderRuntimePath),
      "utf8",
    );
    const leaks = STREAM_DIAGNOSTICS_FORBIDDEN_ASTER_PROVIDER_ERROR_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(modelProviderRuntimeSource).toContain(
      "pub fn message_is_non_retryable_provider_rejection",
    );
    expect(source).toContain("message_is_non_retryable_provider_rejection");
    expect(
      leaks,
      "stream diagnostics 是 current-facing retry 判定，不得继续 import Aster ProviderError",
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
    const oldAsterProviderAdapterPath =
      "lime-rs/crates/agent/src/credential_bridge/aster_provider_adapter.rs";
    const runtimeProviderAdapterPath =
      "lime-rs/crates/agent/src/credential_bridge/runtime_provider_adapter.rs";
    const providerMappingPath =
      "lime-rs/crates/agent/src/credential_bridge/provider_mapping.rs";
    const runtimeConfigProjectionPath =
      "lime-rs/crates/agent/src/credential_bridge/runtime_config_projection.rs";
    const turnExecutionPath = "lime-rs/crates/agent/src/turn_execution.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const turnExecutionSource = readFileSync(join(REPO_ROOT, turnExecutionPath), "utf8");
    const runtimeProviderAdapterSource = readFileSync(
      join(REPO_ROOT, runtimeProviderAdapterPath),
      "utf8",
    );
    const runtimeConfigProjectionSource = readFileSync(
      join(REPO_ROOT, runtimeConfigProjectionPath),
      "utf8",
    );
    const lineCount = source.split(/\r?\n/u).length;
    const leaks = [
      ...CREDENTIAL_BRIDGE_FORBIDDEN_INLINE_ENV_HELPERS.filter((snippet) =>
        source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`),
      ...CREDENTIAL_BRIDGE_FORBIDDEN_DEAD_PROVIDER_FACTORY_SNIPPETS.filter((snippet) =>
        source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`),
      ...PROVIDER_FACTORY_FORBIDDEN_PUBLIC_ASTER_FACTORY_SNIPPETS.flatMap((snippet) =>
        source.includes(snippet) ? [`${filePath}: ${snippet}`] : [],
      ),
      ...RUNTIME_CONFIG_PROJECTION_FORBIDDEN_ASTER_MAPPING_SNIPPETS.filter((snippet) =>
        runtimeConfigProjectionSource.includes(snippet),
      ).map((snippet) => `${runtimeConfigProjectionPath}: ${snippet}`),
      ...CREDENTIAL_BRIDGE_FORBIDDEN_NOOP_HEALTH_SNIPPETS.flatMap((snippet) => {
        const paths = [];
        if (source.includes(snippet)) {
          paths.push(`${filePath}: ${snippet}`);
        }
        if (turnExecutionSource.includes(snippet)) {
          paths.push(`${turnExecutionPath}: ${snippet}`);
        }
        return paths;
      }),
    ];

    expect(lineCount, "credential_bridge.rs 超过 1000 行时必须继续拆分").toBeLessThan(
      1000,
    );
    expect(
      existsSync(join(REPO_ROOT, oldAsterProviderAdapterPath)),
      "credential_bridge/aster_provider_adapter.rs 是旧命名 adapter，不得恢复；当前内部 vendor 接线集中在 runtime_provider_adapter.rs",
    ).toBe(false);
    expect(existsSync(join(REPO_ROOT, runtimeProviderAdapterPath))).toBe(true);
    expect(
      existsSync(join(REPO_ROOT, providerConfigPath)),
      "runtime provider DTO 已归属 model-provider；credential_bridge/provider_config.rs 不得恢复",
    ).toBe(false);
    expect(existsSync(join(REPO_ROOT, providerEnvPath))).toBe(true);
    expect(
      existsSync(join(REPO_ROOT, providerFactoryPath)),
      "credential_bridge/provider_factory.rs 已无 production 消费者；不得恢复假 current HTTP resolver",
    ).toBe(false);
    expect(existsSync(join(REPO_ROOT, providerMappingPath))).toBe(true);
    expect(existsSync(join(REPO_ROOT, runtimeConfigProjectionPath))).toBe(true);
    expect(source).toContain("mod runtime_provider_adapter;");
    expect(source).toContain("mod provider_env;");
    expect(source).toContain("mod provider_mapping;");
    expect(source).toContain("mod runtime_config_projection;");
    expect(source).toContain("runtime_provider_config_from_credential");
    expect(runtimeConfigProjectionSource).toContain("resolve_runtime_provider_name");
    expect(source).toContain("SessionProviderHandle");
    expect(source).toContain("create_session_provider_handle");
    expect(
      SESSION_PROVIDER_HANDLE_REQUIRED_SNIPPETS.filter(
        (snippet) => !runtimeProviderAdapterSource.includes(snippet),
      ),
      "主 turn provider 注入只能通过 session provider handle 局部执行；不得恢复 crate-visible create_aster_runtime_provider factory",
    ).toEqual([]);
    expect(
      SESSION_PROVIDER_HANDLE_FORBIDDEN_DIRECT_ASTER_ESCAPE_SNIPPETS.filter((snippet) =>
        runtimeProviderAdapterSource.includes(snippet),
      ),
      "SessionProviderHandle 不得再把裸 Aster Provider 暴露给 provider_configuration / request_tool_policy",
    ).toEqual([]);
    expect(
      PROVIDER_FACTORY_FORBIDDEN_MISLEADING_CURRENT_RESOLVER_SNIPPETS.filter((snippet) =>
        source.includes(snippet),
      ),
      "Aster-backed resolver 必须显式标注 compat，不得用 CredentialRuntimeProviderResolver 这种 current 命名掩盖事实源",
    ).toEqual([]);
    expect(
      leaks,
      "provider config DTO、env var / fast model 规则和 runtime provider adapter 必须拆到独立子模块；无消费者 provider_factory / no-op credential health API 不得恢复",
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

  it("runtime provider config DTO 必须归属 model-provider", () => {
    const modelProviderLibPath = "lime-rs/crates/model-provider/src/lib.rs";
    const modelProviderRuntimePath = "lime-rs/crates/model-provider/src/runtime_provider.rs";
    const modelProviderRouterPath = "lime-rs/crates/model-provider/src/router.rs";
    const credentialBridgePath = "lime-rs/crates/agent/src/credential_bridge.rs";
    const modelProviderLibSource = readFileSync(join(REPO_ROOT, modelProviderLibPath), "utf8");
    const modelProviderRuntimeSource = readFileSync(
      join(REPO_ROOT, modelProviderRuntimePath),
      "utf8",
    );
    const credentialBridgeSource = readFileSync(join(REPO_ROOT, credentialBridgePath), "utf8");
    const missing = MODEL_RUNTIME_PROVIDER_CONFIG_REQUIRED_SNIPPETS.filter(
      (snippet) => !modelProviderRuntimeSource.includes(snippet),
    ).map((snippet) => `${modelProviderRuntimePath}: ${snippet}`);
    const leaks = CREDENTIAL_BRIDGE_PROVIDER_CONFIG_FORBIDDEN_LOCAL_DTO_SNIPPETS.filter(
      (snippet) => credentialBridgeSource.includes(snippet),
    ).map((snippet) => `${credentialBridgePath}: ${snippet}`);
    const deadExecutionLeaks =
      MODEL_RUNTIME_PROVIDER_FORBIDDEN_DEAD_EXECUTION_SNIPPETS.filter((snippet) =>
        modelProviderRuntimeSource.includes(snippet),
      ).map((snippet) => `${modelProviderRuntimePath}: ${snippet}`);
    const deadRouterLeaks = MODEL_PROVIDER_FORBIDDEN_DEAD_ROUTER_SNIPPETS.filter((snippet) =>
      modelProviderLibSource.includes(snippet) || modelProviderRuntimeSource.includes(snippet),
    ).map((snippet) => `${modelProviderLibPath}/${modelProviderRuntimePath}: ${snippet}`);
    const deadCatalogLeaks = MODEL_PROVIDER_FORBIDDEN_DEAD_CATALOG_SNIPPETS.filter((snippet) =>
      modelProviderLibSource.includes(snippet),
    ).map((snippet) => `${modelProviderLibPath}: ${snippet}`);

    expect(
      missing,
      "RuntimeProviderConfig / RuntimeProviderProtocol 是 model-provider current DTO",
    ).toEqual([]);
    expect(
      existsSync(join(REPO_ROOT, modelProviderRouterPath)),
      "model-provider/router.rs 是无消费者 ProviderRouter/ProviderRequest DTO，不得恢复",
    ).toBe(false);
    expect(
      leaks,
      "credential_bridge 不得重新定义或 re-export runtime provider DTO；调用方必须直接依赖 model-provider current owner",
    ).toEqual([]);
    expect(
      deadExecutionLeaks,
      "model-provider runtime_provider 只保留当前有消费者的 config/protocol/retry 判定；无消费者 RuntimeProvider execution trait 不得恢复",
    ).toEqual([]);
    expect(
      deadRouterLeaks,
      "model-provider 不得恢复无消费者 ProviderRouter/ProviderRequest/ProviderResponse 抽象",
    ).toEqual([]);
    expect(
      deadCatalogLeaks,
      "model-provider 不得恢复无消费者 ModelTaskRequest / ModelProviderCatalog 抽象；模型任务契约归属 App Server protocol / runtime-core",
    ).toEqual([]);
  });

  it("Aster subagent scheduler adapter 不得恢复", () => {
    const deletedPath = "lime-rs/crates/agent/src/subagent_scheduler.rs";
    const limeAgentLibPath = "lime-rs/crates/agent/src/lib.rs";
    const limeAgentLibSource = readFileSync(join(REPO_ROOT, limeAgentLibPath), "utf8");
    const leaks = SUBAGENT_SCHEDULER_FORBIDDEN_PUBLIC_SNIPPETS.filter((snippet) =>
      limeAgentLibSource.includes(snippet),
    ).map((snippet) => `${limeAgentLibPath}: ${snippet}`);

    expect(
      existsSync(join(REPO_ROOT, deletedPath)),
      "subagent_scheduler.rs 是 Aster SubAgentScheduler trait adapter，当前无 current 消费者，不得恢复",
    ).toBe(false);
    expect(leaks, "lime-agent 根 API 不得重新导出 Aster subagent scheduler adapter").toEqual([]);
  });

  it("runtime_state provider config / Aster 注入 compat 子模块不得恢复", () => {
    const asterStatePath = "lime-rs/crates/agent/src/runtime_state.rs";
    const asterStateSupportPath = "lime-rs/crates/agent/src/runtime_state_support.rs";
    const providerConfigPath = "lime-rs/crates/agent/src/aster_state/provider_config.rs";
    const asterStateSource = readFileSync(join(REPO_ROOT, asterStatePath), "utf8");
    const asterStateSupportSource = readFileSync(join(REPO_ROOT, asterStateSupportPath), "utf8");
    const limeAgentLibPath = "lime-rs/crates/agent/src/lib.rs";
    const limeAgentLibSource = readFileSync(join(REPO_ROOT, limeAgentLibPath), "utf8");
    const lineCount = asterStateSource.split(/\r?\n/u).length;
    const leaks = ASTER_STATE_FORBIDDEN_PROVIDER_CONFIG_SNIPPETS.filter(
      (snippet) => asterStateSource.includes(snippet),
    ).map((snippet) => `${asterStatePath}: ${snippet}`);
    const interruptMarkerLeaks = ASTER_STATE_FORBIDDEN_INTERRUPT_MARKER_SNIPPETS.filter(
      (snippet) => asterStateSource.includes(snippet) || limeAgentLibSource.includes(snippet),
    ).map((snippet) => `${asterStatePath}/${limeAgentLibPath}: ${snippet}`);
    const unusedWrapperLeaks = ASTER_STATE_FORBIDDEN_UNUSED_PUBLIC_WRAPPER_SNIPPETS.filter(
      (snippet) => asterStateSource.includes(snippet),
    ).map((snippet) => `${asterStatePath}: ${snippet}`);
    const unusedSupportLeaks =
      ASTER_STATE_SUPPORT_FORBIDDEN_UNUSED_PUBLIC_HELPER_SNIPPETS.filter(
        (snippet) =>
          asterStateSupportSource.includes(snippet) || limeAgentLibSource.includes(snippet),
      ).map((snippet) => `${asterStateSupportPath}/${limeAgentLibPath}: ${snippet}`);

    expect(lineCount, "runtime_state.rs 超过 1000 行时必须继续拆分").toBeLessThan(
      1000,
    );
    expect(
      existsSync(join(REPO_ROOT, providerConfigPath)),
      "Aster state provider_config compat 子模块已迁出并删除，不得恢复",
    ).toBe(false);
    expect(
      leaks,
      "runtime_state.rs 主文件只保留 Agent 状态编排，不得重新承接 ProviderConfig、全局 provider 状态或 Aster provider factory 注入",
    ).toEqual([]);
    expect(
      interruptMarkerLeaks,
      "AsterAgentState 的 interrupt marker 旁路无 production 消费者；取消事实源只能走 cancel_tokens / cancel_session",
    ).toEqual([]);
    expect(
      unusedWrapperLeaks,
      "AgentRuntimeState 不得恢复无消费者 public wrapper；Skills/project prompt 入口归属 runtime_state_support，MCP bridge 批量同步归属 sync_mcp_bridges",
    ).toEqual([]);
    expect(
      unusedSupportLeaks,
      "runtime_state_support 不得恢复无消费者 project prompt / message helper public API；消息构造与项目上下文应落到真实 current owner",
    ).toEqual([]);
  });

  it("session provider 配置必须经由 provider_configuration facade", () => {
    const checkedRoots = [
      join(REPO_ROOT, "lime-rs/crates/agent/src"),
      join(REPO_ROOT, "lime-rs/crates/agent/tests"),
    ];
    const leaks = checkedRoots.flatMap((root) =>
      collectTextFiles(root).flatMap((file) => {
        const relativePath = repoRelative(file);
        if (
          PROVIDER_SESSION_CONFIGURATION_ALLOWED_DIRECT_ASTER_STATE_CALL_FILES.includes(
            relativePath,
          )
        ) {
          return [];
        }
        const source = readFileSync(file, "utf8");
        return PROVIDER_SESSION_CONFIGURATION_FORBIDDEN_DIRECT_ASTER_STATE_CALL_SNIPPETS.filter(
          (snippet) => source.includes(snippet),
        ).map((snippet) => `${relativePath}: ${snippet}`);
      }),
    );

    expect(
      leaks,
      "业务代码和测试不得绕过 provider_configuration facade 直接调用 AsterAgentState provider 注入方法",
    ).toEqual([]);
  });

  it("provider_configuration 不得把 provider 写回 Aster session provider config", () => {
    const filePath = "lime-rs/crates/agent/src/provider_configuration.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = PROVIDER_CONFIGURATION_FORBIDDEN_ASTER_PROVIDER_INSTALL_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "provider_configuration 只负责解析 current RuntimeProviderConfig / SessionProviderHandle，不得再调用 Aster agent.update_provider 持久化旧 provider config",
    ).toEqual([]);
  });

  it("request_tool_policy 不得直接持有裸 Aster Provider", () => {
    const filePath = "lime-rs/crates/agent/src/request_tool_policy.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = REQUEST_TOOL_POLICY_FORBIDDEN_DIRECT_ASTER_PROVIDER_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "request_tool_policy 只能接收 SessionProviderHandle；裸 Aster Provider 必须局限在 credential_bridge/runtime_provider_adapter.rs 内",
    ).toEqual([]);
  });

  it("主执行链调用面不得重新暴露 Aster SessionConfig", () => {
    const leaks = AGENT_SESSION_CONFIG_CURRENT_CALL_SURFACE_FILES.flatMap((filePath) => {
      const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
      return AGENT_SESSION_CONFIG_FORBIDDEN_PUBLIC_ASTER_SNIPPETS.filter((snippet) =>
        source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);
    });

    const turnExecutionPath = "lime-rs/crates/agent/src/turn_execution.rs";
    const turnExecutionSource = readFileSync(join(REPO_ROOT, turnExecutionPath), "utf8");

    expect(
      leaks,
      "turn/direct/skill 调用面和 SessionConfigBuilder 必须使用 AgentSessionConfig；Aster SessionConfig 只能在真正调用 Aster Agent 前转换",
    ).toEqual([]);
    expect(
      turnExecutionSource.includes("into_aster_session_config"),
      "turn_execution 是主执行入口，不得重新承担 Aster SessionConfig 转换；转换必须留在 request_tool_policy 内部 adapter",
    ).toBe(false);
  });

  it("主执行链 provider 调用面不得重新构造 Aster Message", () => {
    const checkedFiles = [
      "lime-rs/crates/agent/src/turn_execution.rs",
      "lime-rs/crates/agent/src/direct_text_generation.rs",
    ];
    const leaks = checkedFiles.flatMap((filePath) => {
      const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
      return AGENT_TURN_EXECUTION_FORBIDDEN_ASTER_MESSAGE_SNIPPETS.filter((snippet) =>
        source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);
    });
    const policySource = readFileSync(
      join(REPO_ROOT, "lime-rs/crates/agent/src/request_tool_policy.rs"),
      "utf8",
    );

    expect(
      leaks,
      "turn/direct generation provider 调用面只能传文本；Aster Message 构造必须留在 request_tool_policy 内部 adapter",
    ).toEqual([]);
    expect(policySource).toContain("stream_reply_with_policy_and_provider");
    expect(policySource).toContain("stream_reply_with_policy_and_provider_for_direct_generation");
  });

  it("request_tool_policy 外层 stream API 不得重新接收 Aster SessionConfig", () => {
    const filePath = "lime-rs/crates/agent/src/request_tool_policy.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const signatureLeaks = REQUEST_TOOL_POLICY_FORBIDDEN_ASTER_SESSION_CONFIG_SIGNATURES.flatMap(
      (signature) => {
        const signatureIndex = source.indexOf(signature);
        if (signatureIndex === -1) {
          return [`${filePath}: missing ${signature}`];
        }
        const bodyPrefix = source.slice(signatureIndex, signatureIndex + 420);
        return bodyPrefix.includes("aster::agents::SessionConfig")
          ? [`${filePath}: ${signature} accepts aster::agents::SessionConfig`]
          : [];
      },
    );
    const directCalls = REQUEST_TOOL_POLICY_FORBIDDEN_DIRECT_ASTER_SESSION_CONFIG_CALLS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      signatureLeaks,
      "request_tool_policy 外层 stream API 必须接收 AgentSessionConfig；Aster SessionConfig 只允许内部 stream_agent_reply_once / runtime status adapter 使用",
    ).toEqual([]);
    expect(
      directCalls,
      "request_tool_policy 主文件和调用侧不得直接构造或转换 Aster SessionConfig；Aster 转换必须下沉到 session_config_adapter / agent_reply_stream adapter",
    ).toEqual([]);
  });

  it("Aster SessionConfig 构造只能留在 session_config_adapter", () => {
    const checkedRoots = [join(REPO_ROOT, "lime-rs/crates/agent/src")];
    const allowedPaths = new Set(
      SESSION_CONFIG_ADAPTER_ALLOWED_ASTER_SESSION_CONFIG_FILES.map((filePath) =>
        join(REPO_ROOT, filePath),
      ),
    );
    const leaks = checkedRoots.flatMap((root) =>
      collectTextFiles(root)
        .filter((file) => !allowedPaths.has(file))
        .flatMap((file) => {
          const source = readFileSync(file, "utf8");
          return SESSION_CONFIG_ADAPTER_FORBIDDEN_ASTER_SESSION_CONFIG_SNIPPETS.filter(
            (snippet) => source.includes(snippet),
          ).map((snippet) => `${repoRelative(file)}: ${snippet}`);
        }),
    );
    const adapterSource = readFileSync(
      join(REPO_ROOT, "lime-rs/crates/agent/src/session_config_adapter.rs"),
      "utf8",
    );
    const sessionConfigurationSource = readFileSync(
      join(REPO_ROOT, "lime-rs/crates/agent/src/session_configuration.rs"),
      "utf8",
    );

    expect(
      leaks,
      "Aster SessionConfig 构造必须集中在 session_config_adapter.rs；AgentSessionConfig DTO 文件和策略主文件不得直接依赖 Aster SessionConfig",
    ).toEqual([]);
    expect(adapterSource).toContain("pub(crate) fn to_aster_session_config");
    expect(sessionConfigurationSource.includes("aster::")).toBe(false);
  });

  it("request_tool_policy 主文件不得重新承接 Aster reply stream loop", () => {
    const mainPath = "lime-rs/crates/agent/src/request_tool_policy.rs";
    const adapterPath =
      "lime-rs/crates/agent/src/request_tool_policy/agent_reply_stream.rs";
    const mainSource = readFileSync(join(REPO_ROOT, mainPath), "utf8");
    const mainProductionSource = mainSource.split("\n#[cfg(test)]\nmod tests")[0];
    const adapterSource = readFileSync(join(REPO_ROOT, adapterPath), "utf8");
    const leaks = REQUEST_TOOL_POLICY_MAIN_FORBIDDEN_ASTER_REPLY_STREAM_SNIPPETS.filter(
      (snippet) => mainProductionSource.includes(snippet),
    ).map((snippet) => `${mainPath}: ${snippet}`);

    expect(
      leaks,
      "request_tool_policy.rs 只能做策略编排；直接 Aster Agent::reply stream loop 必须隔离在 agent_reply_stream.rs adapter 内",
    ).toEqual([]);
    expect(mainSource).toContain("mod agent_reply_stream;");
    expect(adapterSource).toContain("session_config: &AgentSessionConfig");
    expect(adapterSource).toContain("to_aster_session_config");
    expect(adapterSource).toContain(".reply(");
  });

  it("runtime status 投影不得重新要求 Aster SessionConfig", () => {
    const filePath = "lime-rs/crates/agent/src/request_tool_policy/runtime_status.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks =
      REQUEST_TOOL_POLICY_RUNTIME_STATUS_FORBIDDEN_ASTER_SESSION_CONFIG_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "runtime status 投影是 current-facing 辅助模块，入口必须接收 AgentSessionConfig / AgentTurnContext；Aster SessionConfig 只能在内部持久化前短暂转换",
    ).toEqual([]);
    expect(source).toContain("session_config: &AgentSessionConfig");
    expect(source).toContain("to_aster_session_config(session_config.clone())");
  });

  it("skill_execution 不得绕过 request_tool_policy 直接调用 Aster reply", () => {
    const filePath = "lime-rs/crates/agent/src/skill_execution.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = SKILL_EXECUTION_FORBIDDEN_DIRECT_ASTER_REPLY_SNIPPETS.filter((snippet) =>
      source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "skill execution 必须走 request_tool_policy 统一 stream adapter，不得保留第二条 Aster Agent::reply / event projection 链",
    ).toEqual([]);
    expect(source).toContain("stream_message_reply_with_policy");
    expect(source).toContain("ReplyInput");
    expect(source).toContain("RequestToolPolicyMode::Disabled");
  });

  it("runtime_state action response 不得绕过 request_tool_policy 直接调用 Aster reply", () => {
    const filePath = "lime-rs/crates/agent/src/runtime_state.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = RUNTIME_STATE_FORBIDDEN_DIRECT_ASTER_REPLY_SNIPPETS.filter((snippet) =>
      source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "runtime_state 可以继续承载 Agent 状态和 action response 入口，但不得保留第二条 Aster Agent::reply / stream polling 链",
    ).toEqual([]);
    expect(source).toContain("stream_aster_message_reply_with_policy");
    expect(source).toContain("RequestToolPolicyMode::Disabled");
  });

  it("Aster live provider tests 不得恢复", () => {
    const testRoot = join(REPO_ROOT, "lime-rs/crates/agent/tests");
    const restoredFiles = ASTER_LIVE_PROVIDER_TEST_FORBIDDEN_FILES.filter((filePath) =>
      existsSync(join(REPO_ROOT, filePath)),
    );
    const snippetLeaks = existsSync(testRoot)
      ? collectTextFiles(testRoot).flatMap((file) => {
          const relativePath = repoRelative(file);
          const source = readFileSync(file, "utf8");
          return ASTER_LIVE_PROVIDER_TEST_FORBIDDEN_SNIPPETS.filter((snippet) =>
            source.includes(snippet),
          ).map((snippet) => `${relativePath}: ${snippet}`);
        })
      : [];

    expect(
      restoredFiles,
      "真实 provider / 联网验证不得再通过 lime-agent Aster compat 测试恢复；后续 live smoke 必须走 current App Server / provider runtime 链",
    ).toEqual([]);
    expect(
      snippetLeaks,
      "lime-agent tests 不得继续保留 LIME_REAL_API_TEST / 真实联网 Aster provider 入口",
    ).toEqual([]);
  });

  it("lime-rs root-level tests 目录不得恢复", () => {
    expect(
      existsSync(join(REPO_ROOT, "lime-rs/tests")),
      "Rust current 测试事实源必须归属 workspace crate，例如 lime-rs/crates/<crate>/tests；root-level lime-rs/tests 是 virtual workspace orphan surface",
    ).toBe(false);
  });

  it("tool catalog public source DTO 不得暴露 Aster builtin 命名", () => {
    const checkedPaths = [
      "lime-rs/crates/agent/src/agent_tools/catalog.rs",
      "lime-rs/crates/agent/src/agent_tools/inventory.rs",
    ];
    const leaks = checkedPaths.flatMap((filePath) => {
      const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
      return TOOL_SOURCE_KIND_FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
        source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);
    });

    expect(
      leaks,
      "ToolSourceKind 是 public 序列化 DTO，内置工具来源必须使用 RuntimeBuiltin；AsterBuiltin / aster_builtin 不得恢复",
    ).toEqual([]);
  });

  it("ProviderConfigurationRequest 只能留在 provider_configuration 内部", () => {
    const checkedRoots = [
      join(REPO_ROOT, "lime-rs/crates/agent/src"),
      join(REPO_ROOT, "lime-rs/crates/agent/tests"),
    ];
    const leaks = checkedRoots.flatMap((root) =>
      collectTextFiles(root).flatMap((file) => {
        const relativePath = repoRelative(file);
        if (
          PROVIDER_SESSION_CONFIGURATION_ALLOWED_INTERNAL_REQUEST_FILES.includes(
            relativePath,
          )
        ) {
          return [];
        }
        const source = readFileSync(file, "utf8");
        return PROVIDER_SESSION_CONFIGURATION_FORBIDDEN_INTERNAL_REQUEST_SNIPPETS.filter(
          (snippet) => source.includes(snippet),
        ).map((snippet) => `${relativePath}: ${snippet}`);
      }),
    );

    expect(
      leaks,
      "ProviderConfigurationRequest 是 provider_configuration 内部 compat request；调用方必须传 ModelRouteProviderConfiguration",
    ).toEqual([]);
  });

  it("App Server 不得消费 Aster state ProviderConfig public API", () => {
    const limeAgentLibPath = "lime-rs/crates/agent/src/lib.rs";
    const limeAgentLibSource = readFileSync(join(REPO_ROOT, limeAgentLibPath), "utf8");
    const appServerRuntimeBackendRoot = join(
      REPO_ROOT,
      "lime-rs/crates/app-server/src/runtime_backend",
    );
    const publicApiLeaks =
      PROVIDER_PUBLIC_API_FORBIDDEN_ASTER_STATE_CONFIG_SNIPPETS.filter((snippet) =>
        limeAgentLibSource.includes(snippet),
      ).map((snippet) => `${limeAgentLibPath}: ${snippet}`);
    const appServerLeaks = collectTextFiles(appServerRuntimeBackendRoot).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return /\bProviderConfig\b/u.test(source) ? [`${repoRelative(file)}: ProviderConfig`] : [];
    });

    expect(
      publicApiLeaks,
      "lime_agent 根 API 不得重新导出 aster_state::ProviderConfig 或旧 route helper",
    ).toEqual([]);
    expect(
      appServerLeaks,
      "App Server runtime_backend 只能消费 SessionProviderConfig，不得直接依赖 Aster state ProviderConfig",
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

  it("provider route current DTO 必须归属 agent-runtime", () => {
    const providerConfigurationPath = "lime-rs/crates/agent/src/provider_configuration.rs";
    const agentRuntimePath = "lime-rs/crates/agent-runtime/src/turn_executor.rs";
    const providerConfigurationSource = readFileSync(
      join(REPO_ROOT, providerConfigurationPath),
      "utf8",
    );
    const agentRuntimeSource = readFileSync(join(REPO_ROOT, agentRuntimePath), "utf8");
    const missing = [
      ...PROVIDER_CONFIGURATION_REQUIRED_AGENT_RUNTIME_SNIPPETS.filter(
        (snippet) => !providerConfigurationSource.includes(snippet),
      ).map((snippet) => `${providerConfigurationPath}: ${snippet}`),
      ...AGENT_RUNTIME_PROVIDER_CONFIGURATION_REQUIRED_SNIPPETS.filter(
        (snippet) => !agentRuntimeSource.includes(snippet),
      ).map((snippet) => `${agentRuntimePath}: ${snippet}`),
    ];
    const leaks = AGENT_RUNTIME_FORBIDDEN_DEAD_EXECUTION_SNIPPETS.filter((snippet) =>
      agentRuntimeSource.includes(snippet),
    ).map((snippet) => `${agentRuntimePath}: ${snippet}`);

    expect(
      missing,
      "provider route / reasoning DTO 属于 agent-runtime current owner；lime-agent provider_configuration 只能保留 Aster compat 补充字段",
    ).toEqual([]);
    expect(
      leaks,
      "agent-runtime 只保留当前真实消费者需要的 provider route DTO；无实现/无调用方的 AgentRuntime / TurnExecutor 执行骨架不得恢复",
    ).toEqual([]);
  });

  it("tool-runtime 不得恢复无消费者执行骨架", () => {
    const filePath = "lime-rs/crates/tool-runtime/src/lib.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = TOOL_RUNTIME_FORBIDDEN_DEAD_EXECUTION_SNIPPETS.filter((snippet) =>
      source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(source).toContain("pub mod mcp_notification;");
    expect(source).toContain("pub mod tool_io;");
    expect(source).toContain("pub mod tool_result;");
    expect(
      leaks,
      "tool-runtime 只保留真实消费的工具投影模块；无实现/无调用方的 ToolRuntime 执行 trait 和 DTO 不得恢复",
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
    const libPath = "lime-rs/crates/agent/src/lib.rs";
    const libSource = readFileSync(join(REPO_ROOT, libPath), "utf8");
    const missing = SESSION_UPDATE_REQUIRED_CURRENT_TOKEN_STATS_SNIPPETS.filter(
      (snippet) => !source.includes(snippet),
    );
    const leaks = SESSION_UPDATE_FORBIDDEN_ASTER_TOKEN_STATS_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);
    const publicLeaks = [
      ...SESSION_UPDATE_FORBIDDEN_PUBLIC_ASTER_SURFACE_SNIPPETS.filter((snippet) =>
        source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`),
      ...[
        "create_subagent_session",
        "persist_session_extension_data",
        "replace_session_conversation",
      ]
        .filter((snippet) => libSource.includes(snippet))
        .map((snippet) => `${libPath}: ${snippet}`),
    ];

    expect(
      missing,
      "compaction session metrics 写回必须显式依赖 DbConnection 和 agent_session_repository current owner",
    ).toEqual([]);
    expect(
      leaks,
      "compaction token 统计写回不得回流到 Aster apply_session_update builder 链",
    ).toEqual([]);
    expect(
      publicLeaks,
      "session_update 不得继续公开 Aster Session / Conversation / ExtensionData wrapper；只有 crate-internal adapter 可持有 extension_data 持久化",
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

  it("direct_text_generation 不得直接查询 Aster session usage", () => {
    const filePath = "lime-rs/crates/agent/src/direct_text_generation.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = DIRECT_TEXT_GENERATION_FORBIDDEN_ASTER_USAGE_SNIPPETS.filter((snippet) =>
      source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "direct_text_generation 是 current-facing 执行入口；必须要求 DB，让 usage fallback 只走 SessionRepository，不得保留无 DB / Aster session fallback 后门",
    ).toEqual([]);
    expect(source).toContain("session_usage_projection::project_token_usage");
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
    const legacyBackupPath = join(
      REPO_ROOT,
      "lime-rs/crates/agent/src/aster_session_store_adapter.rs.bak",
    );
    expect(
      existsSync(legacyAdapterPath),
      "旧 aster_session_store_adapter.rs 是 dead 残留，不得恢复为生产模块",
    ).toBe(false);
    expect(
      existsSync(legacyBackupPath),
      "旧 aster_session_store_adapter.rs.bak 备份文件已按 dead 处理，不得留在工作树里继续误导迁移",
    ).toBe(false);

    const agentSrcRoot = join(REPO_ROOT, "lime-rs/crates/agent/src");
    const leaks = collectTextFiles(agentSrcRoot).flatMap((file) => {
      const filePath = repoRelative(file);
      const source = readFileSync(file, "utf8");
      const snippets: string[] = [];
      if (/^\s*(?:pub\s+)?mod\s+aster_session_store_adapter\s*;/mu.test(source)) {
        snippets.push("mod aster_session_store_adapter;");
      }
      if (source.includes("aster_session_store_adapter.rs.bak")) {
        snippets.push("aster_session_store_adapter.rs.bak");
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

  it("lime-agent 不得恢复 compat-aster 假 optional feature", () => {
    const filePath = "lime-rs/crates/agent/Cargo.toml";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const forbiddenSnippets = [
      "compat-aster",
      "optional = true",
      'default = ["compat-aster"]',
      'aster = { workspace = true, optional = true }',
      "aster_runtime_support",
    ];
    const leaks = forbiddenSnippets
      .filter((snippet) => source.includes(snippet))
      .map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "lime-agent 当前仍在主链直接依赖 Aster；不得用 compat-aster/default feature 假装可关闭，直到 current turn executor / provider stream 真正接管",
    ).toEqual([]);
    expect(source).toContain("aster.workspace = true");
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

  it("event_converter 不得恢复 public Tauri 命名 facade", () => {
    const eventConverterPath = "lime-rs/crates/agent/src/event_converter.rs";
    const limeAgentLibPath = "lime-rs/crates/agent/src/lib.rs";
    const eventConverterSource = readFileSync(join(REPO_ROOT, eventConverterPath), "utf8");
    const limeAgentLibSource = readFileSync(join(REPO_ROOT, limeAgentLibPath), "utf8");
    const leaks = EVENT_CONVERTER_FORBIDDEN_PUBLIC_SURFACE_SNIPPETS.filter(
      (snippet) =>
        eventConverterSource.includes(snippet) || limeAgentLibSource.includes(snippet),
    ).map((snippet) => `${eventConverterPath}/${limeAgentLibPath}: ${snippet}`);

    expect(eventConverterSource).toContain("pub(crate) fn convert_agent_event");
    expect(limeAgentLibSource).toContain("mod event_converter;");
    expect(
      leaks,
      "event_converter 是 lime-agent 内部 Aster event adapter，不得恢复 pub mod、Tauri* re-export 或 public convert_agent_event facade",
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

  it("App Server runtime_backend 不得消费 Aster Tool facade", () => {
    const runtimeBackendRoot = join(
      REPO_ROOT,
      "lime-rs/crates/app-server/src/runtime_backend",
    );
    const leaks = collectTextFiles(runtimeBackendRoot)
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");
        return APP_SERVER_RUNTIME_BACKEND_FORBIDDEN_RUNTIME_FACADE_TOOL_SNIPPETS.filter(
          (snippet) => source.includes(snippet),
        ).map((snippet) => `${repoRelative(file)}: ${snippet}`);
      });

    expect(
      leaks,
      "App Server runtime_backend 已迁出 Aster Tool / ToolContext / ToolResult public facade；native tools 必须通过 lime-agent gateway registration 或 current projection 暴露",
    ).toEqual([]);
  });

  it("Aster live execution hook 只能留在 lime-agent 内部 adapter", () => {
    const allowedPaths = new Set(
      ASTER_LIVE_EXECUTION_HOOK_ALLOWED_FILES.map((filePath) =>
        join(REPO_ROOT, filePath),
      ),
    );
    const checkedRoots = [
      join(REPO_ROOT, "lime-rs/crates/agent/src"),
      join(REPO_ROOT, "lime-rs/crates/app-server/src"),
    ];
    const leaks = checkedRoots.flatMap((root) =>
      collectTextFiles(root)
        .filter((file) => !allowedPaths.has(file))
        .flatMap((file) => {
          const source = readFileSync(file, "utf8");
          return ASTER_LIVE_EXECUTION_HOOK_FORBIDDEN_SNIPPETS.filter((snippet) =>
            source.includes(snippet),
          ).map((snippet) => `${repoRelative(file)}: ${snippet}`);
        }),
    );

    expect(
      leaks,
      "NativeToolExecutionHook / NativeToolExecutionRequest / ToolCallResult 只能由 lime-agent live_execution_process adapter 持有；App Server 只能实现 LiveExecutionProcessGateway",
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
