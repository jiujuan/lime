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
  "lime-rs/crates/agent-runtime/src/session_execution.rs",
  "lime-rs/crates/agent-runtime/src/session_recent.rs",
  "lime-rs/crates/agent/src/protocol_context_projection.rs",
  "lime-rs/crates/agent/src/protocol_projection.rs",
  "lime-rs/crates/agent-runtime/src/reply_execution.rs",
  "lime-rs/crates/agent/src/request_tool_policy/auto_compaction_projection.rs",
  "lime-rs/crates/agent-runtime/src/session_config.rs",
  "lime-rs/crates/agent/src/runtime_projection_snapshot.rs",
  "lime-rs/crates/agent/src/session_execution_runtime.rs",
  "lime-rs/crates/agent/src/session_store_message_projection.rs",
  "lime-rs/crates/agent/src/session_store_runtime_projection.rs",
  "lime-rs/crates/agent/src/session_store_todo_projection.rs",
  "lime-rs/crates/agent/src/session_configuration.rs",
  "lime-rs/crates/agent/src/session_usage_projection.rs",
  "lime-rs/crates/agent/src/tool_io_offload.rs",
  "lime-rs/crates/agent/src/turn_input_envelope.rs",
  "lime-rs/crates/tool-runtime/src/execution_process.rs",
  "lime-rs/crates/tool-runtime/src/execution_decision.rs",
  "lime-rs/crates/tool-runtime/src/sandbox.rs",
  "lime-rs/crates/tool-runtime/src/path_guard.rs",
  "lime-rs/crates/tool-runtime/src/shell.rs",
  "lime-rs/crates/tool-runtime/src/shell_analysis.rs",
  "lime-rs/crates/tool-runtime/src/shell_analysis/bash.rs",
  "lime-rs/crates/tool-runtime/src/shell_analysis/common.rs",
  "lime-rs/crates/tool-runtime/src/shell_analysis/powershell.rs",
  "lime-rs/crates/tool-runtime/src/shell_permission.rs",
  "lime-rs/crates/tool-runtime/src/execution_rules.rs",
  "lime-rs/crates/tool-runtime/src/mcp_notification.rs",
  "lime-rs/crates/tool-runtime/src/tool_batch.rs",
  "lime-rs/crates/tool-runtime/src/tool_definition.rs",
  "lime-rs/crates/tool-runtime/src/tool_extension.rs",
  "lime-rs/crates/tool-runtime/src/tool_result.rs",
  "lime-rs/crates/tool-runtime/src/web_fetch.rs",
  "lime-rs/crates/tool-runtime/src/web_fetch/content.rs",
  "lime-rs/crates/tool-runtime/src/web_search.rs",
  "lime-rs/crates/tool-runtime/src/web_search/support.rs",
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

const SESSION_EXECUTION_RUNTIME_FORBIDDEN_PUBLIC_EXTENSION_WRITE_SNIPPETS = [
  "persist_session_recent_access_mode",
  "persist_session_recent_preferences",
  "persist_session_recent_team_selection",
  "fn write_extension_data",
  "fn to_extension_data",
  "fn into_updated_extension_data",
  "read_session(",
  "persist_session_extension_data",
];

const SUBAGENT_CONTROL_FORBIDDEN_PRODUCTION_RUNTIME_DTO_SNIPPETS = [
  "load_runtime_snapshot(",
  "project_aster_subagent_latest_turn",
  "SessionRuntimeSnapshot",
  "ThreadRuntimeSnapshot",
  " TurnRuntime,",
  " TurnRuntime {",
  " ItemRuntime,",
  " ItemRuntime {",
  "ItemRuntimePayload",
  "latest_turn_projection",
];

const SUBAGENT_CONTROL_FORBIDDEN_PUBLIC_ASTER_SURFACE_SNIPPETS = [
  "pub mod subagent_control;",
  "pub use subagent_control::{",
  "pub struct SubagentControlState",
  "pub enum SubagentRuntimeStatusKind",
  "pub struct SubagentRuntimeStatus",
  "pub enum SubagentTurnStatus",
  "pub struct SubagentRuntimeStatusInput",
  "pub fn derive_subagent_runtime_status_kind",
  "pub(crate) struct SubagentControlState",
  "pub(crate) struct SubagentRuntimeStatusInput",
  "pub(crate) fn derive_subagent_runtime_status_kind",
  "pub async fn read_subagent_control_state",
  "pub async fn write_subagent_control_state",
  "pub async fn load_subagent_runtime_status",
  "QueuedTurnRuntime",
  "stashed_queued_turns",
  "into_updated_extension_data",
  "ensure_subagent_session",
  "persist_session_extension_data",
];

const SESSION_STORE_SUBAGENT_CONTEXT_FORBIDDEN_RUNTIME_DTO_SNIPPETS = [
  "SessionRuntimeSnapshot",
  "ThreadRuntimeSnapshot",
  "TurnRuntime",
  "ItemRuntimePayload",
  "aster::session::TurnStatus",
  " TurnStatus,",
];

const SESSION_STORE_SUBAGENT_CONTEXT_FORBIDDEN_DIRECT_ASTER_SNIPPETS = [
  "use aster::",
  "aster::",
  "resolve_subagent_session_metadata",
  "SubagentPresentationProjection::from_session",
  "Session as AsterSession",
];

const LIME_AGENT_FORBIDDEN_PUBLIC_ASTER_HELPER_SNIPPETS = [
  "pub mod request_tool_policy;",
  "pub mod ask_bridge;",
  "pub mod lsp_bridge;",
  "pub mod mcp_bridge;",
  "create_lime_identity, create_lime_tool_config",
  "pub fn create_lime_identity",
  "pub fn create_lime_tool_config",
  "execute_web_search_preflight_if_needed",
  "merge_system_prompt_with_web_search_preflight_context",
  "WebSearchPreflightRequest",
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
  "lime-rs/crates/agent/src/turn_context_configuration.rs",
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
  "pub mod runtime_facade;",
  "pub fn current_agent_turn_context",
  "pub async fn with_agent_turn_context",
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
  "aster-backend",
  'feature = "aster-backend"',
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

const VENDORED_ASTER_SHELL_PERMISSION_FORBIDDEN_SNIPPETS = [
  "static SHELL_ENV_ASSIGN_RE",
  "static BASH_WRITE_REDIRECTION_RE",
  "static BASH_SED_IN_PLACE_RE",
  "static POWERSHELL_WRITE_REDIRECTION_RE",
  "fn split_shell_segments(",
  "fn extract_bash_command_words(",
  "fn extract_bash_read_targets(",
  "fn collect_bash_read_path_candidates(",
  "fn is_known_read_only_bash_command(",
  "fn tokenize_shell_words(",
  "fn normalize_command_words(",
  "fn split_powershell_segments(",
  "fn extract_powershell_command_words(",
  "fn extract_powershell_read_targets(",
  "fn collect_powershell_read_path_candidates(",
  "fn is_known_read_only_powershell_command(",
  "fn tokenize_powershell_words(",
  "fn normalize_powershell_words(",
  "fn is_forced_git_clean_words(",
  "validate_bash_command_paths(command",
  "fn validate_bash_command_paths(",
  "fn collect_bash_path_candidates(",
  "fn extract_rm_targets(",
  "fn extract_tee_targets(",
  "fn extract_dd_output_targets(",
  "fn extract_sed_in_place_targets(",
  "pub struct SafetyCheckResult",
  "struct SafetyCheckResult",
  "pub fn check_command_safety(",
  "fn check_command_safety(",
  "pub fn is_dangerous_command(",
  "pub fn has_warning(",
  "with_dangerous_commands(",
  "add_dangerous_commands(",
  "with_warning_patterns(",
  "default_dangerous_commands(",
  "default_warning_patterns(",
  "default_dangerous_patterns(",
  "default_warning_patterns(",
  "fn detect_high_risk_powershell_reason(",
  "fn detect_mutating_powershell_warning(",
  "let safety_result = self.check_command_safety(command);",
  "validate_powershell_command_paths(&input.command",
  "fn validate_powershell_command_paths(",
  "fn collect_powershell_path_candidates(",
  "fn extract_powershell_write_targets(",
  "let safety_result = self.check_command_safety(&input.command);",
];

const VENDORED_ASTER_PATH_GUARD_FORBIDDEN_SNIPPETS = [
  "pub mod path_guard;",
  "tools/path_guard.rs",
  "pub use tool_runtime::path_guard",
  "use std::path::{Component, Path, PathBuf};",
  "fn path_looks_dynamic(",
  "fn is_safe_sink_path(",
  "fn resolve_candidate_path(",
  "fn normalize_path_lexically(",
  "fn path_within(",
  "fn is_protected_path(",
  "#[cfg(test)]",
];

const VENDORED_ASTER_SHELL_ANALYSIS_WRAPPER_FORBIDDEN_SNIPPETS = [
  "pub mod command_semantics;",
  "pub use command_semantics::{",
  "tools/command_semantics.rs",
  "pub struct CommandInterpretation",
  "pub fn interpret_bash_command_result(",
  "pub fn interpret_powershell_command_result(",
  "pub use tool_runtime::shell_analysis::{",
  "pub use tool_runtime::shell_analysis::is_bash_command_concurrency_safe;",
  "pub use tool_runtime::shell_analysis::is_powershell_command_concurrency_safe;",
  "pub use bash::{preflight_bash_read_targets",
  "pub use powershell_tool::{preflight_powershell_read_targets",
  "pub fn preflight_bash_read_targets(",
  "pub fn preflight_powershell_read_targets(",
];

const VENDORED_ASTER_PROCESS_RUNTIME_FORBIDDEN_SNIPPETS = [
  "pub mod subprocess;",
  "mod shell_runtime;",
  "crate::subprocess",
  "super::shell_runtime",
  "encoding_rs =",
  "pub use tool_runtime::subprocess",
  "pub use tool_runtime::shell_runtime",
];

const VENDORED_ASTER_WEB_TOOL_FORBIDDEN_SNIPPETS = [
  "mod web_fetch_content;",
  "tools/web_fetch_content.rs",
  "use reqwest::",
  "use scraper::",
  "use lru::",
  "LruCache",
  "Client::builder",
  "MAX_RESPONSE_SIZE",
  "MAX_WEB_FETCH_REDIRECTS",
  "WEB_FETCH_CACHE_TTL",
  "WEB_SEARCH_CACHE_TTL",
  "SearchProviderStrategy",
  "SearchOrchestrator",
  "MultiSearchEngineConfig",
  "MultiSearchEngineEntry",
  "CachedContent",
  "CachedSearchResults",
  "fn fetch_url",
  "fn check_domain_safety",
  "fn is_private_ip",
  "fn prepare_response_content",
  "fn html_to_markdown",
  "fn normalize_response_body",
  "fn search_with_tavily",
  "fn search_with_multi_search_engine",
  "fn search_with_duckduckgo",
  "fn search_with_bing",
  "fn search_with_google",
  "fn normalize_search_result_url",
  "fn extract_results_from_search_html",
  "fn deduplicate_results",
];

const TOOL_ORCHESTRATOR_FORBIDDEN_DIRECT_ASTER_REGISTRY_SNIPPETS = [
  "mod aster_registry_adapter;",
  "runtime_tool_executor_from_aster_registry",
  "use aster::sandbox",
  "use aster::tools",
  "ToolContext::",
  "ToolError::",
  "ToolRegistry::",
  "Arc<RwLock<ToolRegistry>>",
  "AsterToolContextInput",
  "AsterToolExecutionContext",
  "AsterToolExecutionRequest",
  "AsterWorkspaceSandboxInput",
  "to_aster_turn_context",
  "aster::session_context::with_turn_context",
  "with_turn_context(",
  "fn workspace_sandbox_config(",
  "SandboxType::",
  "SandboxConfig::",
  "impl From<ToolError>",
  "registry.execute(",
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
  "create_runtime_provider(",
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

const MODEL_PROVIDER_STREAM_CONTRACT_REQUIRED_SNIPPETS = [
  "pub enum RuntimeProviderBackend",
  "pub fn as_wire_str(self) -> &'static str",
  "pub enum RuntimeReplyInputKind",
  "pub struct RuntimeReplyProviderHandle",
  "pub struct RuntimeReplyStreamRequest",
  "RuntimeProviderBackend::AsterCompat",
];

const CONFIGURED_REPLY_PROVIDER_REQUIRED_CURRENT_HANDLE_SNIPPETS = [
  "RuntimeReplyProviderHandle",
  "RuntimeReplyProviderCapabilities",
  "RuntimeReplyStreamRequest",
  "RuntimeProviderBackend::AsterCompat",
  "backend: CompatAsterReplyProviderBackend",
  "struct CompatAsterReplyProviderBackend",
  "pub(crate) fn runtime_handle(&self) -> &RuntimeReplyProviderHandle",
  "stream_request: &RuntimeReplyStreamRequest",
  "debug_assert_eq!(stream_request.provider.as_ref(), Some(&self.handle));",
];

const PROVIDER_TRACE_RUNTIME_PROVIDER_METADATA_REQUIRED_SNIPPETS = [
  "runtime_provider_backend",
  "runtime_provider_selector",
  "runtime_provider_protocol",
  "runtime_provider_active_model",
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

const CONFIGURED_REPLY_PROVIDER_REQUIRED_SNIPPETS = [
  "ConfiguredReplyProvider",
  "create_configured_reply_provider",
  "stream_reply_with_agent",
];

const CONFIGURED_REPLY_PROVIDER_FORBIDDEN_SNIPPETS = [
  "SessionProviderHandle",
  "create_session_provider_handle",
  "RuntimeProviderReplyHandle",
  "create_runtime_provider_reply_handle",
  "reply_stream_with_agent",
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

const AGENT_TURN_EXECUTION_FORBIDDEN_PROVIDER_ADAPTER_SNIPPETS = [
  "ConfiguredSessionProvider { provider",
  "ConfiguredReplyProvider",
  "provider.clone()",
  "reply_provider(",
  "stream_reply_with_policy_and_provider(",
  "stream_reply_with_policy_and_provider_for_direct_generation(",
];

const AGENT_TURN_EXECUTION_FORBIDDEN_ASTER_AGENT_ACCESS_SNIPPETS = [
  "get_agent_arc()",
  "agent_guard",
  "stream_reply_with_policy(",
  "stream_reply_with_policy_and_configured_provider(",
  "stream_reply_with_policy_and_configured_provider_for_direct_generation(",
  "Aster agent",
];

const REQUEST_TOOL_POLICY_FORBIDDEN_ASTER_SESSION_CONFIG_SIGNATURES = [
  "pub async fn stream_reply_with_policy",
  "pub(crate) async fn stream_message_reply_with_policy",
  "pub(crate) async fn stream_runtime_reply_with_policy",
  "pub(crate) async fn stream_runtime_message_reply_with_policy",
  "pub(crate) async fn stream_runtime_reply_with_configured_provider",
  "pub(crate) async fn stream_runtime_reply_with_configured_provider_for_direct_generation",
  "async fn stream_reply_with_policy_and_configured_provider",
  "async fn stream_reply_with_policy_and_configured_provider_for_direct_generation",
];

const REQUEST_TOOL_POLICY_FORBIDDEN_DIRECT_ASTER_SESSION_CONFIG_CALLS = [
  "let session_config = aster::agents::SessionConfig",
  "into_aster_session_config",
  "to_aster_session_config(",
];

const REQUEST_TOOL_POLICY_MAIN_FORBIDDEN_ASTER_REPLY_STREAM_SNIPPETS = [
  "use aster::agents::Agent",
  "agent: &Agent",
  "ConfiguredReplyProvider",
  "use aster::conversation::message::Message",
  "Message::user().with_text",
  "Message::user()\n",
  "project_aster_runtime_event",
  "project_aster_auto_compaction_event",
  "AsterAgentEvent",
  "use futures::StreamExt",
  ".reply(",
  "session_config: aster::agents::SessionConfig",
  "persist_cancelled_turn_context_marker(agent",
];

const AGENT_REPLY_STREAM_FORBIDDEN_ASTER_MESSAGE_ADAPTER_SNIPPETS = [
  "use aster::conversation::message",
  "Message::user()",
  "Message::assistant()",
  "MessageContent::ActionRequired",
  "ActionRequiredData::ElicitationResponse",
  "PermissionConfirmation",
  "PrincipalType",
  "Permission::AllowOnce",
  "Permission::DenyOnce",
  "SessionManager::add_message",
  "fn build_aster_user_message",
  "fn build_aster_action_required_response_message",
  "fn cancelled_turn_context_marker_message",
];

const AGENT_REPLY_STREAM_FORBIDDEN_ASTER_EVENT_PROJECTION_SNIPPETS = [
  "RuntimeEventProjector",
  "AsterAgentEvent",
  "project_aster_runtime_event",
  "project_aster_auto_compaction_event",
  "AutoCompactionProjectionState",
  "use crate::aster_runtime_projection",
  "extract_inline_agent_provider_error",
  "runtime_event_projector.project",
];

const AGENT_REPLY_STREAM_FORBIDDEN_ASTER_REPLY_CREATION_SNIPPETS = [
  "ConfiguredReplyProvider",
  "use aster::agents::Agent",
  "AsterReplyRuntimeHost",
  "agent: &Agent",
  "host.agent()",
  "to_aster_session_config",
  "into_aster_message",
  ".stream_reply_with_agent(",
  ".reply(",
  "BoxStream<",
  "AsterAgentEvent",
];

const ASTER_REPLY_RUNTIME_HOST_FORBIDDEN_RAW_AGENT_ESCAPE_SNIPPETS = [
  "pub(super) fn agent(&self)",
  "pub(crate) fn agent(&self)",
  "pub(super) async fn start_aster_reply_stream",
  "pub(super) async fn persist_cancelled_turn_context_marker(agent",
];

const WEB_SEARCH_PREFLIGHT_FORBIDDEN_ASTER_AGENT_SNIPPETS = [
  "use aster::agents::Agent",
  "agent: &Agent",
  "agent: &'a Agent",
  "agent.tool_registry()",
  "WebSearchPreflightRequest { agent",
  "AsterReplyRuntimeHost",
  "host.tool_registry()",
  "runtime_tool_executor_from_aster_registry",
];

const REQUEST_TOOL_POLICY_RUNTIME_STATUS_FORBIDDEN_ASTER_SESSION_CONFIG_SNIPPETS =
  [
    "use aster::",
    "aster::",
    "project_aster_runtime_event",
    "to_aster_session_config",
    "AgentEvent as RuntimeAgentEvent",
    "emit_runtime_status_with_projection",
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
  "get_agent_arc()",
  "agent_guard",
  "stream_message_reply_with_policy(",
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
  "stream_aster_message_reply_with_policy",
  "compat_aster_elicitation_response_message",
  "confirm_aster_tool_action",
];

const REQUEST_TOOL_POLICY_FORBIDDEN_PUBLIC_ASTER_ACTION_RESPONSE_SNIPPETS = [
  "pub(crate) struct CompatAsterReplyMessage",
  "pub(super) struct CompatAsterReplyMessage",
  "CompatAsterReplyMessage",
  "compat_aster_reply_message",
  "compat_aster_elicitation_response_message",
  "stream_aster_message_reply_with_policy",
  "confirm_aster_tool_action",
  "ReplyAttemptInput::CompatAster",
  "CompatAster(",
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
  "pub async fn with_agent_mut",
  "pub(crate) async fn with_agent_mut",
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

const PROVIDER_SESSION_CONFIGURATION_FORBIDDEN_DIRECT_ASTER_STATE_CALL_SNIPPETS =
  [".configure_provider(", ".configure_provider_from_pool("];

const PROVIDER_SESSION_CONFIGURATION_FORBIDDEN_INTERNAL_REQUEST_SNIPPETS = [
  "ProviderConfigurationRequest",
  "configure_provider_for_session(",
];

const PROVIDER_CONFIGURATION_FORBIDDEN_PUBLIC_INSTALL_SNIPPETS = [
  "pub struct ConfiguredSessionProvider",
  "pub(crate) config: SessionProviderConfig",
  "pub(crate) provider: ConfiguredReplyProvider",
  "pub fn provider_configuration_from_model_selection",
  "pub async fn configure_model_route_provider_for_session",
];

const PROVIDER_PUBLIC_API_FORBIDDEN_ASTER_STATE_CONFIG_SNIPPETS = [
  "ProviderConfig, QueuedTurnTask",
  "route_protocol_from_provider_config",
  "ProviderConfigurationRequest",
  "configure_provider_for_session",
  "create_model_runtime_provider",
  "ConfiguredSessionProvider",
  "configure_model_route_provider_for_session",
  "provider_configuration_from_model_selection",
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

const TOOL_INVENTORY_FORBIDDEN_ASTER_TOOL_DEFINITION_SNIPPETS = [
  "use aster::tools::ToolDefinition",
  "Vec<ToolDefinition>",
  "&[ToolDefinition]",
  ") -> ToolDefinition",
  " ToolDefinition::new(",
];

const TOOL_INVENTORY_FORBIDDEN_ASTER_EXTENSION_CONFIG_SNIPPETS = [
  "use aster::agents::extension::ExtensionConfig",
  "Vec<ExtensionConfig>",
  "&[ExtensionConfig]",
  ") -> ExtensionConfig",
  " ExtensionConfig::",
  ".name()",
  ".deferred_loading()",
  ".always_expose_tools()",
  ".allowed_caller()",
];

const LIME_AGENT_TEST_SUPPORT_FORBIDDEN_SNIPPETS = [
  "test-support = []",
  'features = ["test-support"]',
  "pub mod test_support",
  "mod test_support",
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

const SESSION_QUERY_FORBIDDEN_PUBLIC_ASTER_SESSION_SNIPPETS = [
  "pub async fn read_session",
  "pub async fn list_child_subagent_sessions",
  "pub(crate) async fn list_child_subagent_sessions",
  "pub async fn list_subagent_status_scope_session_ids",
  "pub async fn list_subagent_cascade_session_ids",
  "pub fn collect_subagent_cascade_session_ids",
  "query_all_subagent_sessions_with_metadata",
  "query_subagent_parent_session_id",
  "collect_current_subagent_cascade_session_ids",
  "SubagentSessionTreeNode",
  "list_subagent_sessions_with_metadata_query",
  "resolve_subagent_parent_session_id",
  "project_subagent_session_tree_node",
];

const SESSION_STORE_FORBIDDEN_ASTER_DELETE_SNIPPETS = [
  "aster::session::SessionStore::delete_session",
  "LimeSessionStore::new(db.clone())",
];

const SESSION_STORE_FORBIDDEN_DEAD_PUBLIC_API_SNIPPETS = [
  "pub fn list_title_preview_messages_sync",
  "pub fn update_session_provider_config_sync",
  "SessionTitlePreviewMessage",
  "aster::model::ModelConfig",
  "use aster::model::ModelConfig",
  "model_config_json",
];

const SESSION_UPDATE_FORBIDDEN_ASTER_TOKEN_STATS_SNIPPETS = [
  "CompactionSessionMetricsUpdate",
  "persist_compaction_session_metrics_update",
  "persist_session_extension_data",
  "apply_session_update",
  "agent_session_repository::update_session_token_stats",
  "SessionTokenStatsUpdate",
  ".total_tokens(Some(",
  ".accumulated_total_tokens(",
];

const SESSION_UPDATE_FORBIDDEN_PUBLIC_ASTER_SURFACE_SNIPPETS = [
  "use aster::conversation::Conversation",
  "create_subagent_session as create_aster_subagent_session",
  "replace_session_conversation as replace_aster_session_conversation",
  "pub async fn persist_session_extension_data",
  "pub(crate) async fn persist_session_extension_data",
  "pub async fn create_subagent_session",
  "pub async fn replace_session_conversation",
  "Session,",
];

const SUBAGENT_PROFILES_FORBIDDEN_PUBLIC_ASTER_SURFACE_SNIPPETS = [
  "pub mod subagent_profiles;",
  "pub use subagent_profiles::{",
  "use aster::hooks::FrontmatterHooks",
  "use aster::session::extension_data::{ExtensionData, ExtensionState}",
  "use aster::session::Session",
  "FrontmatterHooks",
  "ExtensionData",
  "pub fn from_extension_data",
  "pub fn from_session",
  "pub fn to_extension_data",
  "pub fn into_updated_extension_data",
  "pub(crate) fn subagent_customization_from_extension_data",
  "pub(crate) fn write_subagent_customization_extension_data",
];

const SUBAGENT_PROFILES_FORBIDDEN_UNUSED_PROFILE_HELPERS = [
  "SubagentProfileSummary",
  "TeamPresetSummary",
  "SubagentSkillPromptBlock",
  "BuiltinSkillDescriptor",
  "BuiltinProfileDescriptor",
  "BuiltinTeamPresetDescriptor",
  "BUILTIN_SKILLS",
  "BUILTIN_PROFILES",
  "BUILTIN_TEAM_PRESETS",
  "builtin_skill_descriptor_by_id",
  "builtin_profile_descriptor_by_id",
  "builtin_team_preset_descriptor_by_id",
  "summarize_builtin_profile",
  "summarize_builtin_skill",
  "summarize_builtin_team_preset",
  "build_subagent_customization_prompt",
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
  "pub fn create_ask_callback",
  "pub fn extract_response",
  "pub use ask_bridge",
  "extract_ask_response",
  "pub fn create_lsp_callback",
  "pub use lsp_bridge::create_lsp_callback",
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
    const rootCargo = readFileSync(
      join(REPO_ROOT, "lime-rs/Cargo.toml"),
      "utf8",
    );
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
    const leaks = DIRECT_ASTER_DEPENDENCY_MIGRATED_CRATES.flatMap(
      (crateName) => {
        const crateRoot = join(REPO_ROOT, "lime-rs/crates", crateName);
        return collectTextFiles(crateRoot).flatMap((file) => {
          const source = readFileSync(file, "utf8");
          return FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
            source.includes(snippet),
          ).map((snippet) => `${repoRelative(file)}: ${snippet}`);
        });
      },
    );

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
    const credentialBridgePath =
      "lime-rs/crates/agent/src/credential_bridge.rs";
    const sessionStorePath = "lime-rs/crates/agent/src/aster_session_store.rs";
    const libSource = readFileSync(join(REPO_ROOT, libPath), "utf8");
    const credentialBridgeSource = readFileSync(
      join(REPO_ROOT, credentialBridgePath),
      "utf8",
    );
    const sessionStoreSource = readFileSync(
      join(REPO_ROOT, sessionStorePath),
      "utf8",
    );
    const publicModuleLeaks =
      LIME_AGENT_PUBLIC_ASTER_MODULE_FORBIDDEN_SNIPPETS.filter((snippet) =>
        libSource.includes(snippet),
      ).map((snippet) => `${libPath}: ${snippet}`);
    const publicCredentialLeaks =
      CREDENTIAL_BRIDGE_FORBIDDEN_PUBLIC_API_SNIPPETS.filter((snippet) =>
        credentialBridgeSource.includes(snippet),
      ).map((snippet) => `${credentialBridgePath}: ${snippet}`);
    const publicAsterNamingLeaks =
      LIME_AGENT_PUBLIC_ASTER_NAMING_FORBIDDEN_SNIPPETS.flatMap((snippet) =>
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
    const restoredAsterStateFiles =
      LIME_AGENT_FORBIDDEN_ASTER_STATE_FILES.filter((filePath) =>
        existsSync(join(REPO_ROOT, filePath)),
      );
    const publicAsterHelperLeaks =
      LIME_AGENT_FORBIDDEN_PUBLIC_ASTER_HELPER_SNIPPETS.flatMap((snippet) =>
        [libPath, "lime-rs/crates/agent/src/runtime_state_support.rs"]
          .filter((filePath) =>
            readFileSync(join(REPO_ROOT, filePath), "utf8").includes(snippet),
          )
          .map((filePath) => `${filePath}: ${snippet}`),
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
      publicAsterHelperLeaks,
      "ask/lsp bridge 与 Aster identity/tool config 只能作为 lime-agent 内部 compat 接线，不得从根 API 公开",
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
      "lime-rs/crates/app-server/Cargo.toml",
    ];
    const leaks = checkedPaths.flatMap((filePath) => {
      const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
      return APP_SERVER_FORBIDDEN_ASTER_BACKEND_SNIPPETS.filter((snippet) =>
        source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);
    });
    const restoredFiles = APP_SERVER_FORBIDDEN_ASTER_BACKEND_FILES.filter(
      (filePath) => existsSync(join(REPO_ROOT, filePath)),
    );

    expect(
      existsSync(
        join(
          REPO_ROOT,
          "lime-rs/crates/app-server/src/runtime_backend_adapter.rs",
        ),
      ),
      "App Server backend adapter current 文件必须是 runtime_backend_adapter.rs",
    ).toBe(true);
    expect(
      leaks,
      "App Server public backend facade 不得继续暴露 AsterBackend*、aster_* factory 或 aster-backend feature；旧 --backend aster 仅可作为 CLI 负向测试存在",
    ).toEqual([]);
    expect(
      restoredFiles,
      "旧 app-server/src/aster_backend.rs 不得恢复；current owner 是 runtime_backend_adapter.rs",
    ).toEqual([]);
  });

  it("provider_safety 独立 Aster wrapper 文件不得恢复", () => {
    const oldTopLevelPath = "lime-rs/crates/agent/src/provider_safety.rs";
    const retiredPath =
      "lime-rs/crates/agent/src/credential_bridge/provider_safety.rs";
    const credentialBridgePath =
      "lime-rs/crates/agent/src/credential_bridge.rs";
    const credentialBridgeSource = readFileSync(
      join(REPO_ROOT, credentialBridgePath),
      "utf8",
    );

    expect(
      existsSync(join(REPO_ROOT, oldTopLevelPath)),
      "provider_safety 不得恢复为 lime-agent 顶层模块",
    ).toBe(false);
    expect(
      existsSync(join(REPO_ROOT, retiredPath)),
      "provider_safety 独立 Aster wrapper 文件已并入 runtime_provider_adapter.rs，不得恢复第二个 Aster Provider adapter",
    ).toBe(false);
    expect(
      credentialBridgeSource.includes("mod provider_safety;"),
      "credential_bridge 不得重新声明 provider_safety 模块；Aster Provider wrapper 只能留在 runtime_provider_adapter.rs",
    ).toBe(false);
  });

  it("runtime provider 命名不得继续使用 Aster provider 字段名", () => {
    const checkedPaths = [
      "lime-rs/crates/core/src/database/dao/api_key_provider.rs",
      "lime-rs/crates/agent/src/credential_bridge/provider_mapping.rs",
      "lime-rs/crates/agent/src/credential_bridge/runtime_config_projection.rs",
    ];
    const leaks = checkedPaths.flatMap((filePath) => {
      const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
      return RUNTIME_PROVIDER_NAMING_FORBIDDEN_ASTER_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
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
    const leaks =
      STREAM_DIAGNOSTICS_FORBIDDEN_ASTER_PROVIDER_ERROR_SNIPPETS.filter(
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
    const turnExecutionSource = readFileSync(
      join(REPO_ROOT, turnExecutionPath),
      "utf8",
    );
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
      ...CREDENTIAL_BRIDGE_FORBIDDEN_DEAD_PROVIDER_FACTORY_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`),
      ...PROVIDER_FACTORY_FORBIDDEN_PUBLIC_ASTER_FACTORY_SNIPPETS.flatMap(
        (snippet) =>
          source.includes(snippet) ? [`${filePath}: ${snippet}`] : [],
      ),
      ...RUNTIME_CONFIG_PROJECTION_FORBIDDEN_ASTER_MAPPING_SNIPPETS.filter(
        (snippet) => runtimeConfigProjectionSource.includes(snippet),
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

    expect(
      lineCount,
      "credential_bridge.rs 超过 1000 行时必须继续拆分",
    ).toBeLessThan(1000);
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
    expect(runtimeConfigProjectionSource).toContain(
      "resolve_runtime_provider_name",
    );
    expect(source).toContain("ConfiguredReplyProvider");
    expect(source).toContain("create_configured_reply_provider");
    expect(
      CONFIGURED_REPLY_PROVIDER_REQUIRED_SNIPPETS.filter(
        (snippet) => !runtimeProviderAdapterSource.includes(snippet),
      ),
      "主 turn provider 注入只能通过 ConfiguredReplyProvider 局部执行；不得恢复 crate-visible create_aster_runtime_provider factory",
    ).toEqual([]);
    expect(
      CONFIGURED_REPLY_PROVIDER_FORBIDDEN_SNIPPETS.filter((snippet) =>
        runtimeProviderAdapterSource.includes(snippet),
      ),
      "ConfiguredReplyProvider 不得把裸 Aster Provider 暴露给 provider_configuration / request_tool_policy，旧 provider handle 命名不得恢复",
    ).toEqual([]);
    expect(
      PROVIDER_FACTORY_FORBIDDEN_MISLEADING_CURRENT_RESOLVER_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
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
    const modelProviderRuntimePath =
      "lime-rs/crates/model-provider/src/runtime_provider.rs";
    const modelProviderRouterPath =
      "lime-rs/crates/model-provider/src/router.rs";
    const credentialBridgePath =
      "lime-rs/crates/agent/src/credential_bridge.rs";
    const modelProviderLibSource = readFileSync(
      join(REPO_ROOT, modelProviderLibPath),
      "utf8",
    );
    const modelProviderRuntimeSource = readFileSync(
      join(REPO_ROOT, modelProviderRuntimePath),
      "utf8",
    );
    const credentialBridgeSource = readFileSync(
      join(REPO_ROOT, credentialBridgePath),
      "utf8",
    );
    const missing = MODEL_RUNTIME_PROVIDER_CONFIG_REQUIRED_SNIPPETS.filter(
      (snippet) => !modelProviderRuntimeSource.includes(snippet),
    ).map((snippet) => `${modelProviderRuntimePath}: ${snippet}`);
    const leaks =
      CREDENTIAL_BRIDGE_PROVIDER_CONFIG_FORBIDDEN_LOCAL_DTO_SNIPPETS.filter(
        (snippet) => credentialBridgeSource.includes(snippet),
      ).map((snippet) => `${credentialBridgePath}: ${snippet}`);
    const deadExecutionLeaks =
      MODEL_RUNTIME_PROVIDER_FORBIDDEN_DEAD_EXECUTION_SNIPPETS.filter(
        (snippet) => modelProviderRuntimeSource.includes(snippet),
      ).map((snippet) => `${modelProviderRuntimePath}: ${snippet}`);
    const deadRouterLeaks =
      MODEL_PROVIDER_FORBIDDEN_DEAD_ROUTER_SNIPPETS.filter(
        (snippet) =>
          modelProviderLibSource.includes(snippet) ||
          modelProviderRuntimeSource.includes(snippet),
      ).map(
        (snippet) =>
          `${modelProviderLibPath}/${modelProviderRuntimePath}: ${snippet}`,
      );
    const deadCatalogLeaks =
      MODEL_PROVIDER_FORBIDDEN_DEAD_CATALOG_SNIPPETS.filter((snippet) =>
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

  it("provider reply stream handle contract 必须归属 model-provider", () => {
    const modelProviderLibPath = "lime-rs/crates/model-provider/src/lib.rs";
    const providerStreamPath =
      "lime-rs/crates/model-provider/src/provider_stream.rs";
    const runtimeProviderAdapterPath =
      "lime-rs/crates/agent/src/credential_bridge/runtime_provider_adapter.rs";
    const asterReplyAdapterPath =
      "lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs";
    const agentReplyStreamPath =
      "lime-rs/crates/agent/src/request_tool_policy/agent_reply_stream.rs";
    const agentProtocolPath = "lime-rs/crates/agent/src/protocol.rs";
    const appServerToolEventsPath =
      "lime-rs/crates/app-server/src/runtime_backend/tool_events.rs";
    const frontendAgentProtocolPath = "src/lib/api/agentProtocol.ts";
    const frontendAppServerEventStreamPath =
      "src/lib/api/agentRuntime/appServerEventStream.ts";
    const frontendMetricsPath =
      "src/components/agent/chat/hooks/agentStreamRuntimeMetricsController.ts";
    const frontendTurnBindingPath =
      "src/components/agent/chat/hooks/agentStreamTurnEventBinding.ts";
    const modelProviderLibSource = readFileSync(
      join(REPO_ROOT, modelProviderLibPath),
      "utf8",
    );
    const providerStreamSource = readFileSync(
      join(REPO_ROOT, providerStreamPath),
      "utf8",
    );
    const runtimeProviderAdapterSource = readFileSync(
      join(REPO_ROOT, runtimeProviderAdapterPath),
      "utf8",
    );
    const asterReplyAdapterSource = readFileSync(
      join(REPO_ROOT, asterReplyAdapterPath),
      "utf8",
    );
    const agentReplyStreamSource = readFileSync(
      join(REPO_ROOT, agentReplyStreamPath),
      "utf8",
    );
    const agentProtocolSource = readFileSync(
      join(REPO_ROOT, agentProtocolPath),
      "utf8",
    );
    const appServerToolEventsSource = readFileSync(
      join(REPO_ROOT, appServerToolEventsPath),
      "utf8",
    );
    const frontendAgentProtocolSource = readFileSync(
      join(REPO_ROOT, frontendAgentProtocolPath),
      "utf8",
    );
    const frontendAppServerEventStreamSource = readFileSync(
      join(REPO_ROOT, frontendAppServerEventStreamPath),
      "utf8",
    );
    const frontendMetricsSource = readFileSync(
      join(REPO_ROOT, frontendMetricsPath),
      "utf8",
    );
    const frontendTurnBindingSource = readFileSync(
      join(REPO_ROOT, frontendTurnBindingPath),
      "utf8",
    );

    expect(modelProviderLibSource).toContain("pub mod provider_stream;");
    expect(
      MODEL_PROVIDER_STREAM_CONTRACT_REQUIRED_SNIPPETS.filter(
        (snippet) => !providerStreamSource.includes(snippet),
      ),
      "provider stream current contract 必须在 model-provider 中定义，不能继续由 Aster Provider trait 充当公开 handle",
    ).toEqual([]);
    expect(
      FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
        providerStreamSource.includes(snippet),
      ).map((snippet) => `${providerStreamPath}: ${snippet}`),
      "model-provider provider_stream contract 不得引入 Aster 类型",
    ).toEqual([]);
    expect(
      CONFIGURED_REPLY_PROVIDER_REQUIRED_CURRENT_HANDLE_SNIPPETS.filter(
        (snippet) => !runtimeProviderAdapterSource.includes(snippet),
      ),
      "ConfiguredReplyProvider 必须同时持有 current provider handle；Aster Provider trait 只能作为内部 compat backend",
    ).toEqual([]);
    const configuredReplyProviderStruct =
      runtimeProviderAdapterSource.match(
        /pub\(crate\) struct ConfiguredReplyProvider \{[\s\S]*?\n\}/,
      )?.[0] ?? "";
    expect(configuredReplyProviderStruct).toContain(
      "handle: RuntimeReplyProviderHandle",
    );
    expect(configuredReplyProviderStruct).toContain(
      "backend: CompatAsterReplyProviderBackend",
    );
    expect(
      configuredReplyProviderStruct.includes("Arc<dyn Provider>"),
      "ConfiguredReplyProvider 只能持有 current handle + 私有 compat backend，不能直接保存 Aster Provider trait object",
    ).toBe(false);
    expect(asterReplyAdapterSource).toContain("RuntimeReplyStreamRequest");
    expect(asterReplyAdapterSource).toContain(".stream_reply_with_agent(");
    expect(asterReplyAdapterSource).toContain("&stream_request");
    expect(asterReplyAdapterSource).toContain("provider_handle(&self)");
    expect(agentReplyStreamSource).toContain(
      "enrich_provider_trace_with_runtime_provider",
    );
    expect(agentReplyStreamSource).toContain("host.provider_handle()");
    expect(
      PROVIDER_TRACE_RUNTIME_PROVIDER_METADATA_REQUIRED_SNIPPETS.filter(
        (snippet) =>
          !agentProtocolSource.includes(snippet) ||
          !agentReplyStreamSource.includes(snippet) ||
          !appServerToolEventsSource.includes(snippet) ||
          !frontendAgentProtocolSource.includes(snippet) ||
          !frontendAppServerEventStreamSource.includes(snippet),
      ),
      "current provider handle metadata 必须进入 provider_trace 主链，不能只停在后端 debug log",
    ).toEqual([]);
    expect(frontendMetricsSource).toContain("runtimeProviderBackend");
    expect(frontendMetricsSource).toContain("runtimeProviderSelector");
    expect(frontendMetricsSource).toContain("runtimeProviderProtocol");
    expect(frontendMetricsSource).toContain("runtimeProviderActiveModel");
    expect(frontendTurnBindingSource).toContain(
      "data.runtime_provider_backend",
    );
    expect(frontendTurnBindingSource).toContain(
      "data.runtime_provider_selector",
    );
  });

  it("Aster subagent scheduler adapter 不得恢复", () => {
    const deletedPath = "lime-rs/crates/agent/src/subagent_scheduler.rs";
    const limeAgentLibPath = "lime-rs/crates/agent/src/lib.rs";
    const limeAgentLibSource = readFileSync(
      join(REPO_ROOT, limeAgentLibPath),
      "utf8",
    );
    const leaks = SUBAGENT_SCHEDULER_FORBIDDEN_PUBLIC_SNIPPETS.filter(
      (snippet) => limeAgentLibSource.includes(snippet),
    ).map((snippet) => `${limeAgentLibPath}: ${snippet}`);

    expect(
      existsSync(join(REPO_ROOT, deletedPath)),
      "subagent_scheduler.rs 是 Aster SubAgentScheduler trait adapter，当前无 current 消费者，不得恢复",
    ).toBe(false);
    expect(
      leaks,
      "lime-agent 根 API 不得重新导出 Aster subagent scheduler adapter",
    ).toEqual([]);
  });

  it("runtime_state provider config / Aster 注入 compat 子模块不得恢复", () => {
    const asterStatePath = "lime-rs/crates/agent/src/runtime_state.rs";
    const asterStateSupportPath =
      "lime-rs/crates/agent/src/runtime_state_support.rs";
    const providerConfigPath =
      "lime-rs/crates/agent/src/aster_state/provider_config.rs";
    const asterStateSource = readFileSync(
      join(REPO_ROOT, asterStatePath),
      "utf8",
    );
    const asterStateSupportSource = readFileSync(
      join(REPO_ROOT, asterStateSupportPath),
      "utf8",
    );
    const limeAgentLibPath = "lime-rs/crates/agent/src/lib.rs";
    const limeAgentLibSource = readFileSync(
      join(REPO_ROOT, limeAgentLibPath),
      "utf8",
    );
    const lineCount = asterStateSource.split(/\r?\n/u).length;
    const leaks = ASTER_STATE_FORBIDDEN_PROVIDER_CONFIG_SNIPPETS.filter(
      (snippet) => asterStateSource.includes(snippet),
    ).map((snippet) => `${asterStatePath}: ${snippet}`);
    const interruptMarkerLeaks =
      ASTER_STATE_FORBIDDEN_INTERRUPT_MARKER_SNIPPETS.filter(
        (snippet) =>
          asterStateSource.includes(snippet) ||
          limeAgentLibSource.includes(snippet),
      ).map((snippet) => `${asterStatePath}/${limeAgentLibPath}: ${snippet}`);
    const unusedWrapperLeaks =
      ASTER_STATE_FORBIDDEN_UNUSED_PUBLIC_WRAPPER_SNIPPETS.filter((snippet) =>
        asterStateSource.includes(snippet),
      ).map((snippet) => `${asterStatePath}: ${snippet}`);
    const unusedSupportLeaks =
      ASTER_STATE_SUPPORT_FORBIDDEN_UNUSED_PUBLIC_HELPER_SNIPPETS.filter(
        (snippet) =>
          asterStateSupportSource.includes(snippet) ||
          limeAgentLibSource.includes(snippet),
      ).map(
        (snippet) => `${asterStateSupportPath}/${limeAgentLibPath}: ${snippet}`,
      );
    const publicAgentAccessLeaks = ["pub fn get_agent_arc"]
      .filter((snippet) => asterStateSource.includes(snippet))
      .map((snippet) => `${asterStatePath}: ${snippet}`);

    expect(
      lineCount,
      "runtime_state.rs 超过 1000 行时必须继续拆分",
    ).toBeLessThan(1000);
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
    expect(
      publicAgentAccessLeaks,
      "AgentRuntimeState 不得把 Aster Agent Arc 暴露为跨 crate public API；外部测试和调用方必须使用 current 查询/注册方法",
    ).toEqual([]);
    expect(asterStateSource).toContain("pub(crate) fn get_agent_arc");
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
    const leaks =
      PROVIDER_CONFIGURATION_FORBIDDEN_ASTER_PROVIDER_INSTALL_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "provider_configuration 只负责解析 current RuntimeProviderConfig / ConfiguredReplyProvider，不得再调用 Aster agent.update_provider 持久化旧 provider config",
    ).toEqual([]);
  });

  it("request_tool_policy 不得直接持有裸 Aster Provider", () => {
    const filePath = "lime-rs/crates/agent/src/request_tool_policy.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks =
      REQUEST_TOOL_POLICY_FORBIDDEN_DIRECT_ASTER_PROVIDER_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "request_tool_policy 只能接收 ConfiguredReplyProvider；裸 Aster Provider 必须局限在 credential_bridge/runtime_provider_adapter.rs 内",
    ).toEqual([]);
  });

  it("主执行链调用面不得重新暴露 Aster SessionConfig", () => {
    const leaks = AGENT_SESSION_CONFIG_CURRENT_CALL_SURFACE_FILES.flatMap(
      (filePath) => {
        const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
        return AGENT_SESSION_CONFIG_FORBIDDEN_PUBLIC_ASTER_SNIPPETS.filter(
          (snippet) => source.includes(snippet),
        ).map((snippet) => `${filePath}: ${snippet}`);
      },
    );

    const turnExecutionPath = "lime-rs/crates/agent/src/turn_execution.rs";
    const turnExecutionSource = readFileSync(
      join(REPO_ROOT, turnExecutionPath),
      "utf8",
    );

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
    const messageLeaks = checkedFiles.flatMap((filePath) => {
      const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
      return AGENT_TURN_EXECUTION_FORBIDDEN_ASTER_MESSAGE_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);
    });
    const providerLeaks = checkedFiles.flatMap((filePath) => {
      const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
      return AGENT_TURN_EXECUTION_FORBIDDEN_PROVIDER_ADAPTER_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);
    });
    const agentAccessLeaks = checkedFiles.flatMap((filePath) => {
      const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
      return AGENT_TURN_EXECUTION_FORBIDDEN_ASTER_AGENT_ACCESS_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);
    });
    const policySource = readFileSync(
      join(REPO_ROOT, "lime-rs/crates/agent/src/request_tool_policy.rs"),
      "utf8",
    );

    expect(
      messageLeaks,
      "turn/direct generation provider 调用面只能传文本；Aster Message 构造必须留在 request_tool_policy 内部 adapter",
    ).toEqual([]);
    expect(
      providerLeaks,
      "turn/direct generation provider 调用面只能传 ConfiguredSessionProvider；ConfiguredReplyProvider clone 必须留在 aster_reply_adapter 内部",
    ).toEqual([]);
    expect(policySource).toContain(
      "stream_runtime_reply_with_configured_provider",
    );
    expect(policySource).toContain(
      "stream_runtime_reply_with_configured_provider_for_direct_generation",
    );
    expect(
      agentAccessLeaks,
      "turn/direct generation 不得直接读取 Aster Agent；AgentRuntimeState -> Aster Agent 读取必须收进 request_tool_policy/aster_reply_adapter",
    ).toEqual([]);
    expect(policySource).toContain("stream_runtime_reply_with_policy");
  });

  it("request_tool_policy 外层 stream API 不得重新接收 Aster SessionConfig", () => {
    const filePath = "lime-rs/crates/agent/src/request_tool_policy.rs";
    const adapterPath =
      "lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const adapterSource = readFileSync(join(REPO_ROOT, adapterPath), "utf8");
    const signatureLeaks =
      REQUEST_TOOL_POLICY_FORBIDDEN_ASTER_SESSION_CONFIG_SIGNATURES.flatMap(
        (signature) => {
          const signatureIndex = adapterSource.indexOf(signature);
          if (signatureIndex === -1) {
            return [`${adapterPath}: missing ${signature}`];
          }
          const bodyPrefix = adapterSource.slice(
            signatureIndex,
            signatureIndex + 420,
          );
          return bodyPrefix.includes("aster::agents::SessionConfig")
            ? [
                `${adapterPath}: ${signature} accepts aster::agents::SessionConfig`,
              ]
            : [];
        },
      );
    const directCalls =
      REQUEST_TOOL_POLICY_FORBIDDEN_DIRECT_ASTER_SESSION_CONFIG_CALLS.filter(
        (snippet) => source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      signatureLeaks,
      "request_tool_policy 外层 stream API 必须接收 AgentSessionConfig；Aster SessionConfig 只允许 aster_reply_adapter 内部转换使用",
    ).toEqual([]);
    expect(source).toContain(
      "pub use self::aster_reply_adapter::stream_reply_with_policy",
    );
    expect(
      directCalls,
      "request_tool_policy 主文件和调用侧不得直接构造或转换 Aster SessionConfig；Aster 转换必须下沉到 session_config_adapter / agent_reply_stream adapter",
    ).toEqual([]);
  });

  it("Aster SessionConfig 构造只能留在 session_config_adapter", () => {
    const checkedRoots = [join(REPO_ROOT, "lime-rs/crates/agent/src")];
    const allowedPaths = new Set(
      SESSION_CONFIG_ADAPTER_ALLOWED_ASTER_SESSION_CONFIG_FILES.map(
        (filePath) => join(REPO_ROOT, filePath),
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
    const agentRuntimeLibSource = readFileSync(
      join(REPO_ROOT, "lime-rs/crates/agent-runtime/src/lib.rs"),
      "utf8",
    );
    const agentRuntimeSessionConfigSource = readFileSync(
      join(REPO_ROOT, "lime-rs/crates/agent-runtime/src/session_config.rs"),
      "utf8",
    );

    expect(
      leaks,
      "Aster SessionConfig 构造必须集中在 session_config_adapter.rs；AgentSessionConfig DTO 文件和策略主文件不得直接依赖 Aster SessionConfig",
    ).toEqual([]);
    expect(adapterSource).toContain("pub(crate) fn to_aster_session_config");
    expect(adapterSource).toContain(
      "use agent_runtime::session_config::AgentSessionConfig",
    );
    expect(agentRuntimeLibSource).toContain("pub mod session_config;");
    expect(agentRuntimeSessionConfigSource).toContain(
      "pub struct AgentSessionConfig",
    );
    expect(agentRuntimeSessionConfigSource).toContain(
      "pub struct AgentSessionConfigurationRequest",
    );
    expect(agentRuntimeSessionConfigSource).toContain(
      "pub struct SessionConfigBuilder",
    );
    expect(
      FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
        agentRuntimeSessionConfigSource.includes(snippet),
      ),
      "AgentSessionConfig / SessionConfigBuilder current owner 是 agent-runtime，不得直接依赖 Aster",
    ).toEqual([]);
    expect(sessionConfigurationSource).toContain(
      "pub use agent_runtime::session_config::{",
    );
    expect(
      sessionConfigurationSource.includes("pub struct AgentSessionConfig"),
    ).toBe(false);
    expect(
      sessionConfigurationSource.includes("pub struct SessionConfigBuilder"),
    ).toBe(false);
    expect(sessionConfigurationSource.includes("aster::")).toBe(false);
  });

  it("request_tool_policy 主文件不得重新承接 Aster reply stream loop", () => {
    const mainPath = "lime-rs/crates/agent/src/request_tool_policy.rs";
    const adapterPath =
      "lime-rs/crates/agent/src/request_tool_policy/agent_reply_stream.rs";
    const asterReplyAdapterPath =
      "lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs";
    const asterEventAdapterPath =
      "lime-rs/crates/agent/src/request_tool_policy/aster_event_adapter.rs";
    const webSearchPreflightPath =
      "lime-rs/crates/agent/src/request_tool_policy/web_search_preflight.rs";
    const agentRuntimeLibPath = "lime-rs/crates/agent-runtime/src/lib.rs";
    const agentRuntimeReplyInputPath =
      "lime-rs/crates/agent-runtime/src/reply_input.rs";
    const agentRuntimeReplyHostPath =
      "lime-rs/crates/agent-runtime/src/reply_host.rs";
    const agentRuntimeReplyExecutionPath =
      "lime-rs/crates/agent-runtime/src/reply_execution.rs";
    const agentRuntimeReplyStreamPath =
      "lime-rs/crates/agent-runtime/src/reply_stream.rs";
    const mainSource = readFileSync(join(REPO_ROOT, mainPath), "utf8");
    const mainProductionSource = mainSource.split(
      "\n#[cfg(test)]\nmod tests",
    )[0];
    const adapterSource = readFileSync(join(REPO_ROOT, adapterPath), "utf8");
    const asterReplyAdapterSource = readFileSync(
      join(REPO_ROOT, asterReplyAdapterPath),
      "utf8",
    );
    const asterEventAdapterSource = readFileSync(
      join(REPO_ROOT, asterEventAdapterPath),
      "utf8",
    );
    const webSearchPreflightSource = readFileSync(
      join(REPO_ROOT, webSearchPreflightPath),
      "utf8",
    );
    const agentRuntimeLibSource = readFileSync(
      join(REPO_ROOT, agentRuntimeLibPath),
      "utf8",
    );
    const agentRuntimeReplyInputSource = readFileSync(
      join(REPO_ROOT, agentRuntimeReplyInputPath),
      "utf8",
    );
    const agentRuntimeReplyHostSource = readFileSync(
      join(REPO_ROOT, agentRuntimeReplyHostPath),
      "utf8",
    );
    const agentRuntimeReplyExecutionSource = readFileSync(
      join(REPO_ROOT, agentRuntimeReplyExecutionPath),
      "utf8",
    );
    const agentRuntimeReplyStreamSource = readFileSync(
      join(REPO_ROOT, agentRuntimeReplyStreamPath),
      "utf8",
    );
    const leaks =
      REQUEST_TOOL_POLICY_MAIN_FORBIDDEN_ASTER_REPLY_STREAM_SNIPPETS.filter(
        (snippet) => mainProductionSource.includes(snippet),
      ).map((snippet) => `${mainPath}: ${snippet}`);
    const innerFunctionStart = mainProductionSource.indexOf(
      "async fn stream_message_reply_with_policy_with_options",
    );
    const innerFunctionSignature =
      innerFunctionStart >= 0
        ? mainProductionSource.slice(
            innerFunctionStart,
            innerFunctionStart + 520,
          )
        : "";
    const innerSignatureLeaks = [
      "agent: &Agent",
      "provider: Option<ConfiguredReplyProvider>",
    ]
      .filter((snippet) => innerFunctionSignature.includes(snippet))
      .map((snippet) => `${mainPath}: ${snippet}`);
    const streamAdapterLeaks =
      AGENT_REPLY_STREAM_FORBIDDEN_ASTER_MESSAGE_ADAPTER_SNIPPETS.filter(
        (snippet) => adapterSource.includes(snippet),
      ).map((snippet) => `${adapterPath}: ${snippet}`);
    const eventProjectionLeaks =
      AGENT_REPLY_STREAM_FORBIDDEN_ASTER_EVENT_PROJECTION_SNIPPETS.filter(
        (snippet) => adapterSource.includes(snippet),
      ).map((snippet) => `${adapterPath}: ${snippet}`);
    const replyCreationLeaks =
      AGENT_REPLY_STREAM_FORBIDDEN_ASTER_REPLY_CREATION_SNIPPETS.filter(
        (snippet) => adapterSource.includes(snippet),
      ).map((snippet) => `${adapterPath}: ${snippet}`);
    const hostLeaks =
      ASTER_REPLY_RUNTIME_HOST_FORBIDDEN_RAW_AGENT_ESCAPE_SNIPPETS.filter(
        (snippet) => asterReplyAdapterSource.includes(snippet),
      ).map((snippet) => `${asterReplyAdapterPath}: ${snippet}`);
    const preflightAgentLeaks =
      WEB_SEARCH_PREFLIGHT_FORBIDDEN_ASTER_AGENT_SNIPPETS.filter((snippet) =>
        webSearchPreflightSource.includes(snippet),
      ).map((snippet) => `${webSearchPreflightPath}: ${snippet}`);

    expect(
      leaks,
      "request_tool_policy.rs 只能做策略编排；直接 Aster Agent::reply stream loop 必须隔离在 agent_reply_stream.rs adapter 内",
    ).toEqual([]);
    expect(
      innerSignatureLeaks,
      "request_tool_policy 私有 stream 执行器必须接收 RuntimeReplyPolicyHost；裸 Agent / provider handle 只能在入口边界立即收进 host",
    ).toEqual([]);
    expect(
      streamAdapterLeaks,
      "agent_reply_stream 只能保留 current RuntimeAgentEvent 流控；Aster message/action/cancel marker 构造必须下沉到 aster_reply_adapter",
    ).toEqual([]);
    expect(
      eventProjectionLeaks,
      "agent_reply_stream 不得直接承接 Aster event projection；Aster event -> RuntimeEvent 必须收回到 aster_reply_adapter / aster_event_adapter compat 边界",
    ).toEqual([]);
    expect(
      replyCreationLeaks,
      "agent_reply_stream 不得直接创建 Aster reply stream；SessionConfig 转换、Aster Message 转换和 Agent::reply 调用必须下沉到 aster_reply_adapter",
    ).toEqual([]);
    expect(
      hostLeaks,
      "AsterReplyRuntimeHost 不得重新暴露裸 Aster Agent；调用方只能使用 host 方法",
    ).toEqual([]);
    expect(
      preflightAgentLeaks,
      "web_search_preflight 不得重新持有 Aster host / registry；预检索必须直接使用 tool-runtime current WebSearch executor",
    ).toEqual([]);
    expect(mainSource).toContain("mod agent_reply_stream;");
    expect(mainSource).toContain("mod aster_event_adapter;");
    expect(mainSource).toContain("mod aster_reply_adapter;");
    expect(mainSource).toContain("agent_runtime::reply_input::{");
    expect(mainSource).toContain(
      "agent_runtime::session_config::AgentSessionConfig",
    );
    expect(mainSource).not.toContain("AsterReplyRuntimeHost");
    expect(mainSource).not.toContain("struct ReplyInputImage");
    expect(mainSource).not.toContain("struct ReplyInput");
    expect(mainSource).not.toContain("struct ReplyAttemptError");
    expect(mainSource).not.toContain("struct StreamReplyExecution");
    expect(mainSource).toContain("agent_runtime::reply_execution::{");
    expect(mainSource).toContain("persist_cancelled_turn_context_marker");
    expect(adapterSource).toContain("session_config: &AgentSessionConfig");
    expect(adapterSource).toContain(
      "agent_runtime::session_config::AgentSessionConfig",
    );
    expect(adapterSource).toContain("host: &impl RuntimeReplyPolicyHost");
    expect(adapterSource).toContain("RuntimeReplyPolicyHost");
    expect(adapterSource).not.toContain("trait RuntimeReplyPolicyHost");
    expect(adapterSource).toContain(".start_reply_stream(");
    expect(adapterSource).toContain(
      "agent_runtime::reply_input::RuntimeReplyAttemptInput as ReplyAttemptInput",
    );
    expect(adapterSource).toContain(
      "agent_runtime::reply_stream::RuntimeReplyStreamEvent",
    );
    expect(adapterSource).toContain("RuntimeReplyStreamEvent");
    expect(adapterSource.includes("ConfiguredReplyProvider")).toBe(false);
    expect(agentRuntimeLibSource).toContain("pub mod reply_input;");
    expect(agentRuntimeLibSource).toContain("pub mod reply_host;");
    expect(agentRuntimeLibSource).toContain("pub mod reply_execution;");
    expect(agentRuntimeLibSource).toContain("pub mod reply_stream;");
    expect(agentRuntimeReplyHostSource).toContain(
      "pub trait RuntimeReplyStreamHost<E>",
    );
    expect(agentRuntimeReplyHostSource).toContain(
      "pub trait RuntimeReplyPolicyHost<E, S>",
    );
    expect(agentRuntimeReplyHostSource).toContain("fn emit_runtime_status");
    expect(agentRuntimeReplyHostSource).toContain(
      "persist_cancelled_turn_context_marker",
    );
    expect(agentRuntimeReplyHostSource).toContain(
      "pub struct RuntimeReplyStartError",
    );
    expect(agentRuntimeReplyHostSource).toContain("RuntimeReplyAttemptInput");
    expect(agentRuntimeReplyHostSource).toContain("AgentSessionConfig");
    expect(
      FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
        agentRuntimeReplyHostSource.includes(snippet),
      ),
      "agent-runtime reply_host contract 不得引入 Aster 类型",
    ).toEqual([]);
    expect(agentRuntimeReplyInputSource).toContain(
      "pub struct RuntimeReplyInput",
    );
    expect(agentRuntimeReplyInputSource).toContain(
      "pub struct RuntimeReplyInputImage",
    );
    expect(agentRuntimeReplyInputSource).toContain(
      "pub struct RuntimeActionRequiredResponseInput",
    );
    expect(agentRuntimeReplyInputSource).toContain(
      "pub enum RuntimeReplyAttemptInput",
    );
    expect(agentRuntimeReplyInputSource).toContain("runtime_input_kind");
    expect(agentRuntimeReplyInputSource).not.toContain("aster::");
    expect(agentRuntimeReplyExecutionSource).toContain(
      "pub struct RuntimeReplyAttemptError",
    );
    expect(agentRuntimeReplyExecutionSource).toContain(
      "pub struct RuntimeReplyExecution",
    );
    expect(agentRuntimeReplyExecutionSource).toContain("emitted_any");
    expect(agentRuntimeReplyExecutionSource).toContain("attempts_summary");
    expect(agentRuntimeReplyExecutionSource).not.toContain("aster::");
    expect(agentRuntimeReplyStreamSource).toContain(
      "pub enum RuntimeReplyStreamEvent<E>",
    );
    expect(agentRuntimeReplyStreamSource).toContain(
      "SuppressedInlineProviderError(String)",
    );
    expect(agentRuntimeReplyStreamSource).not.toContain("aster::");
    expect(asterReplyAdapterSource).toContain("struct AsterReplyRuntimeHost");
    expect(asterReplyAdapterSource).toContain(
      "impl RuntimeReplyStreamHost<RuntimeAgentEvent> for AsterReplyRuntimeHost",
    );
    expect(asterReplyAdapterSource).toContain(
      "impl RuntimeReplyPolicyHost<RuntimeAgentEvent, AgentRuntimeStatus> for AsterReplyRuntimeHost",
    );
    expect(asterReplyAdapterSource).toContain(
      "agent_runtime::reply_stream::RuntimeReplyStreamEvent",
    );
    expect(asterReplyAdapterSource).toContain(
      "RuntimeActionRequiredResponseInput as ActionRequiredResponseInput",
    );
    expect(asterReplyAdapterSource).toContain(
      "RuntimeReplyAttemptInput as ReplyAttemptInput",
    );
    expect(asterReplyAdapterSource).toContain("RuntimeReplyStreamEvent");
    expect(asterReplyAdapterSource).not.toContain(
      "struct ActionRequiredResponseInput",
    );
    expect(asterReplyAdapterSource).not.toContain("enum ReplyAttemptInput");
    expect(asterReplyAdapterSource).not.toContain(
      "impl From<ReplyInput> for ReplyAttemptInput",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "enum RuntimeReplyStreamEvent",
    );
    expect(asterReplyAdapterSource).toContain("project_aster_reply_stream");
    expect(asterReplyAdapterSource).toContain("RuntimeEventProjector::new");
    expect(asterReplyAdapterSource).toContain("SuppressedInlineProviderError");
    expect(asterReplyAdapterSource).toContain(
      "extract_inline_agent_provider_error",
    );
    expect(asterReplyAdapterSource).toContain(
      "stream_runtime_reply_with_policy",
    );
    expect(asterReplyAdapterSource).toContain(
      "stream_runtime_reply_with_configured_provider",
    );
    expect(asterReplyAdapterSource).toContain(
      "provider: Option<ConfiguredReplyProvider>",
    );
    expect(asterReplyAdapterSource).toContain("with_reply_provider");
    expect(asterReplyAdapterSource).toContain("uses_pinned_provider");
    expect(asterReplyAdapterSource).toContain("emit_runtime_status");
    expect(asterReplyAdapterSource).toContain(
      "persist_cancelled_turn_context_marker",
    );
    expect(asterReplyAdapterSource).not.toContain("tool_registry");
    expect(asterReplyAdapterSource).toContain("start_aster_reply_stream");
    expect(asterReplyAdapterSource).toContain("to_aster_session_config");
    expect(asterReplyAdapterSource).toContain(".reply(");
    expect(asterReplyAdapterSource).toContain(".stream_reply_with_agent(");
    expect(asterReplyAdapterSource).toContain("Message::user()");
    expect(asterReplyAdapterSource).toContain("MessageContent::ActionRequired");
    expect(asterReplyAdapterSource).toContain("SessionManager::add_message");
    expect(asterEventAdapterSource).toContain("project_aster_runtime_event");
    expect(asterEventAdapterSource).toContain(
      "project_aster_auto_compaction_event",
    );
    expect(asterEventAdapterSource).toContain("AutoCompactionProjectionState");
    expect(webSearchPreflightSource).toContain(
      "runtime_web_search_executor_handle",
    );
    expect(webSearchPreflightSource).toContain("WEB_SEARCH_TOOL_NAME");
  });

  it("request_tool_policy 模块路径和内部 attempt record 不得重新公开", () => {
    const libPath = "lime-rs/crates/agent/src/lib.rs";
    const trackerPath =
      "lime-rs/crates/agent/src/request_tool_policy/web_search_execution_tracker.rs";
    const libSource = readFileSync(join(REPO_ROOT, libPath), "utf8");
    const trackerSource = readFileSync(join(REPO_ROOT, trackerPath), "utf8");

    expect(libSource.includes("pub mod request_tool_policy;")).toBe(false);
    expect(libSource.includes("ToolAttemptRecord")).toBe(false);
    expect(trackerSource.includes("pub struct ToolAttemptRecord")).toBe(false);
    expect(trackerSource).toContain("pub(crate) struct ToolAttemptRecord");
  });

  it("runtime status 投影不得重新要求 Aster SessionConfig", () => {
    const filePath =
      "lime-rs/crates/agent/src/request_tool_policy/runtime_status.rs";
    const adapterPath =
      "lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs";
    const deletedAdapterPath =
      "lime-rs/crates/agent/src/request_tool_policy/runtime_status_adapter.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const adapterSource = readFileSync(join(REPO_ROOT, adapterPath), "utf8");
    const leaks =
      REQUEST_TOOL_POLICY_RUNTIME_STATUS_FORBIDDEN_ASTER_SESSION_CONFIG_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "runtime_status.rs 是 current-facing 状态 DTO / copy 模块，不得重新持有 Aster 持久化或 projection 细节",
    ).toEqual([]);
    expect(source).toContain(
      "pub(crate) fn apply_soul_style_to_runtime_status",
    );
    expect(
      existsSync(join(REPO_ROOT, deletedAdapterPath)),
      "runtime_status_adapter.rs 已并入 AsterReplyRuntimeHost，不得恢复额外 Aster status adapter 文件",
    ).toBe(false);
    expect(adapterSource).toContain("session_config: &AgentSessionConfig");
    expect(adapterSource).toContain(
      "to_aster_session_config(session_config.clone())",
    );
    expect(adapterSource).toContain("project_aster_runtime_event");
  });

  it("skill_execution 不得绕过 request_tool_policy 直接调用 Aster reply", () => {
    const filePath = "lime-rs/crates/agent/src/skill_execution.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = SKILL_EXECUTION_FORBIDDEN_DIRECT_ASTER_REPLY_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "skill execution 必须走 request_tool_policy 统一 stream adapter，不得保留第二条 Aster Agent::reply / event projection 链",
    ).toEqual([]);
    expect(source).toContain("stream_runtime_message_reply_with_policy");
    expect(source).toContain("ReplyInput");
    expect(source).toContain("RequestToolPolicyMode::Disabled");
  });

  it("tool_inventory_runtime_snapshot 不得直接读取 Aster Agent", () => {
    const snapshotPath =
      "lime-rs/crates/agent/src/agent_tools/tool_inventory_runtime_snapshot.rs";
    const adapterPath =
      "lime-rs/crates/agent/src/agent_tools/tool_inventory_runtime_adapter.rs";
    const snapshotSource = readFileSync(join(REPO_ROOT, snapshotPath), "utf8");
    const adapterSource = readFileSync(join(REPO_ROOT, adapterPath), "utf8");
    const forbiddenSnapshotSnippets = [
      "get_agent_arc()",
      "tool_registry()",
      "get_extension_configs()",
      ".list_tools(",
    ];
    const leaks = forbiddenSnapshotSnippets
      .filter((snippet) => snapshotSource.includes(snippet))
      .map((snippet) => `${snapshotPath}: ${snippet}`);

    expect(
      leaks,
      "tool inventory snapshot 只做 current projection 和 MCP merge；Aster Agent/registry 读取必须集中到 runtime adapter",
    ).toEqual([]);
    expect(snapshotSource).not.toContain(
      "pub struct AgentToolInventoryRuntimeSnapshot",
    );
    expect(snapshotSource).not.toContain(
      "pub async fn read_agent_tool_inventory_runtime_snapshot",
    );
    expect(
      readFileSync(
        join(REPO_ROOT, "lime-rs/crates/agent/src/agent_tools/mod.rs"),
        "utf8",
      ),
    ).not.toContain("pub mod tool_inventory_runtime_snapshot");
    expect(snapshotSource).toContain("read_agent_tool_inventory_runtime_seed");
    expect(adapterSource).toContain("get_agent_arc()");
    expect(adapterSource).toContain("tool_registry()");
    expect(adapterSource).toContain("get_extension_configs()");
    expect(adapterSource).toContain(".list_tools(");
  });

  it("workspace_patch_host 不得直接读取 Aster Agent tool registry", () => {
    const hostPath =
      "lime-rs/crates/agent/src/agent_tools/workspace_patch_host.rs";
    const adapterPath =
      "lime-rs/crates/agent/src/agent_tools/workspace_patch_runtime_adapter.rs";
    const hostSource = readFileSync(join(REPO_ROOT, hostPath), "utf8");
    const adapterSource = readFileSync(join(REPO_ROOT, adapterPath), "utf8");
    const forbiddenHostSnippets = [
      "get_agent_arc()",
      "tool_registry()",
      "execute_planned_tool_batch",
      "ToolExecutionBatchInput",
      "Aster agent is not initialized",
    ];
    const leaks = forbiddenHostSnippets
      .filter((snippet) => hostSource.includes(snippet))
      .map((snippet) => `${hostPath}: ${snippet}`);
    const forbiddenAdapterSnippets = [
      "get_agent_arc()",
      "tool_registry()",
      "runtime_tool_executor_from_aster_registry",
      "Aster agent is not initialized",
    ];
    const adapterLeaks = forbiddenAdapterSnippets
      .filter((snippet) => adapterSource.includes(snippet))
      .map((snippet) => `${adapterPath}: ${snippet}`);

    expect(
      leaks,
      "workspace_patch_host 只应处理 host tool plan/evidence；WebSearch 执行必须走 current runtime adapter",
    ).toEqual([]);
    expect(
      adapterLeaks,
      "workspace_patch_runtime_adapter 不得再为 WebSearch 读取 Aster Agent registry；应直接使用 tool-runtime current executor",
    ).toEqual([]);
    expect(hostSource).toContain("execute_workspace_patch_runtime_tool_batch");
    expect(adapterSource).toContain("runtime_web_search_executor_handle");
    expect(adapterSource).toContain("execute_planned_tool_batch");
    expect(adapterSource).toContain("ToolExecutionBatchInput");
  });

  it("runtime_state action response 不得绕过 request_tool_policy 直接调用 Aster reply", () => {
    const filePath = "lime-rs/crates/agent/src/runtime_state.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = RUNTIME_STATE_FORBIDDEN_DIRECT_ASTER_REPLY_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);
    const actionResponseStart = source.indexOf(
      "pub async fn submit_elicitation_response",
    );
    const actionResponseEnd = source.indexOf(
      "pub async fn sync_mcp_bridges",
      actionResponseStart,
    );
    const actionResponseSource =
      actionResponseStart >= 0 && actionResponseEnd > actionResponseStart
        ? source.slice(actionResponseStart, actionResponseEnd)
        : "";
    const directAgentLeaks = [
      "get_agent_arc()",
      "agent_guard",
      "let guard = agent_arc.read().await",
      "stream_action_required_response_with_policy(",
      "submit_tool_action_confirmation(",
      "Agent not initialized",
    ]
      .filter((snippet) => actionResponseSource.includes(snippet))
      .map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "runtime_state 可以继续承载 Agent 状态和 action response 入口，但不得保留第二条 Aster Agent::reply / stream polling 链",
    ).toEqual([]);
    expect(
      directAgentLeaks,
      "runtime_state 的 action response / confirmation 只能提交 current runtime wrapper；不得直接读取 Aster Agent 或调用底层 adapter",
    ).toEqual([]);
    expect(source).toContain(
      "stream_runtime_action_required_response_with_policy",
    );
    expect(source).toContain("submit_runtime_tool_action_confirmation");
    expect(source).toContain("RequestToolPolicyMode::Disabled");
  });

  it("runtime_state MCP bridge 同步不得直接操作 Aster extension manager", () => {
    const runtimeStatePath = "lime-rs/crates/agent/src/runtime_state.rs";
    const mcpBridgePath = "lime-rs/crates/agent/src/mcp_bridge.rs";
    const runtimeStateSource = readFileSync(
      join(REPO_ROOT, runtimeStatePath),
      "utf8",
    );
    const mcpBridgeSource = readFileSync(
      join(REPO_ROOT, mcpBridgePath),
      "utf8",
    );
    const forbiddenRuntimeStateSnippets = [
      "registered_mcp_bridges",
      "McpClientTrait",
      "ExtensionConfig::Builtin",
      ".extension_manager",
      ".add_client(",
      ".remove_extension(",
      "McpBridgeClient::new(",
    ];
    const leaks = forbiddenRuntimeStateSnippets
      .filter((snippet) => runtimeStateSource.includes(snippet))
      .map((snippet) => `${runtimeStatePath}: ${snippet}`);

    expect(
      leaks,
      "runtime_state.rs 只做 current 状态编排；MCP bridge 的 Aster client/config 注册必须集中到 mcp_bridge runtime registry",
    ).toEqual([]);
    expect(runtimeStateSource).toContain("mcp_bridge_registry");
    expect(runtimeStateSource).toContain(".sync(agent, snapshots)");
    expect(mcpBridgeSource).toContain(
      "pub(crate) struct McpBridgeRuntimeRegistry",
    );
    expect(mcpBridgeSource).not.toContain("pub struct McpBridgeClient");
    expect(mcpBridgeSource).not.toContain("pub fn new(\n        name: String");
    expect(mcpBridgeSource).toContain("ExtensionConfig::Builtin");
    expect(mcpBridgeSource).toContain("McpBridgeClient::new(");
  });

  it("runtime_state native tool overlay 不得直接操作 Aster ToolRegistry", () => {
    const runtimeStatePath = "lime-rs/crates/agent/src/runtime_state.rs";
    const nativeOverlayPath =
      "lime-rs/crates/agent/src/native_tools/runtime_overlay.rs";
    const runtimeStateSource = readFileSync(
      join(REPO_ROOT, runtimeStatePath),
      "utf8",
    );
    const productionSource =
      runtimeStateSource.split("\n#[cfg(test)]\nmod tests")[0] ??
      runtimeStateSource;
    const nativeOverlaySource = readFileSync(
      join(REPO_ROOT, nativeOverlayPath),
      "utf8",
    );
    const forbiddenRuntimeStateSnippets = [
      "create_shared_history",
      "WriteTool",
      "EditTool",
      "add_tool_inspector",
      "tool_registry()",
      "WorkspaceToolPolicyInspector::new",
      "ApplyPatchTool",
      "SkillSearchTool",
      "LimeSkillTool::new",
    ];
    const leaks = forbiddenRuntimeStateSnippets
      .filter((snippet) => productionSource.includes(snippet))
      .map((snippet) => `${runtimeStatePath}: ${snippet}`);

    expect(
      leaks,
      "runtime_state.rs 只做 Agent lifecycle 编排；native tool overlay / ToolRegistry Aster 细节必须集中到 native_tools/runtime_overlay.rs",
    ).toEqual([]);
    expect(productionSource).toContain(
      "crate::native_tools::configure_lime_native_tool_overlay",
    );
    expect(productionSource).toContain(
      "crate::native_tools::runtime_native_tool_registry",
    );
    expect(nativeOverlaySource).toContain("create_shared_history");
    expect(nativeOverlaySource).toContain("WriteTool");
    expect(nativeOverlaySource).toContain("EditTool");
    expect(nativeOverlaySource).toContain("WorkspaceToolPolicyInspector::new");
  });

  it("request_tool_policy action response façade 不得暴露 Aster wrapper 命名", () => {
    const checkedFiles = [
      "lime-rs/crates/agent/src/request_tool_policy.rs",
      "lime-rs/crates/agent/src/request_tool_policy/agent_reply_stream.rs",
      "lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs",
    ];
    const leaks = checkedFiles.flatMap((filePath) => {
      const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
      return REQUEST_TOOL_POLICY_FORBIDDEN_PUBLIC_ASTER_ACTION_RESPONSE_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);
    });
    const facadeSource = readFileSync(
      join(REPO_ROOT, "lime-rs/crates/agent/src/request_tool_policy.rs"),
      "utf8",
    );
    const adapterSource = readFileSync(
      join(
        REPO_ROOT,
        "lime-rs/crates/agent/src/request_tool_policy/aster_reply_adapter.rs",
      ),
      "utf8",
    );

    expect(
      leaks,
      "action response 入口必须暴露 current 命名；Aster message wrapper 只能作为 agent_reply_stream 内部构造细节存在",
    ).toEqual([]);
    expect(facadeSource).toContain(
      "stream_runtime_action_required_response_with_policy",
    );
    expect(facadeSource).toContain("submit_runtime_tool_action_confirmation");
    expect(adapterSource).toContain("ActionRequiredResponseInput");
    expect(adapterSource).toContain(
      "async fn stream_action_required_response_with_policy",
    );
    expect(adapterSource).toContain("async fn submit_tool_action_confirmation");
  });

  it("Aster live provider tests 不得恢复", () => {
    const testRoot = join(REPO_ROOT, "lime-rs/crates/agent/tests");
    const restoredFiles = ASTER_LIVE_PROVIDER_TEST_FORBIDDEN_FILES.filter(
      (filePath) => existsSync(join(REPO_ROOT, filePath)),
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
    const limeAgentLibSource = readFileSync(
      join(REPO_ROOT, limeAgentLibPath),
      "utf8",
    );
    const appServerRuntimeBackendRoot = join(
      REPO_ROOT,
      "lime-rs/crates/app-server/src/runtime_backend",
    );
    const publicApiLeaks =
      PROVIDER_PUBLIC_API_FORBIDDEN_ASTER_STATE_CONFIG_SNIPPETS.filter(
        (snippet) => limeAgentLibSource.includes(snippet),
      ).map((snippet) => `${limeAgentLibPath}: ${snippet}`);
    const appServerLeaks = collectTextFiles(
      appServerRuntimeBackendRoot,
    ).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return /\bProviderConfig\b/u.test(source)
        ? [`${repoRelative(file)}: ProviderConfig`]
        : [];
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
    const filePath =
      "lime-rs/crates/agent/src/credential_bridge/provider_env.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const missing = PROVIDER_ENV_REQUIRED_MODEL_PROVIDER_POLICY_SNIPPETS.filter(
      (snippet) => !source.includes(snippet),
    );
    const leaks =
      PROVIDER_ENV_FORBIDDEN_LOCAL_FAST_MODEL_POLICY_SNIPPETS.filter(
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

  it("provider 安装 helper 不得作为 lime_agent public API 暴露", () => {
    const providerConfigurationPath =
      "lime-rs/crates/agent/src/provider_configuration.rs";
    const limeAgentLibPath = "lime-rs/crates/agent/src/lib.rs";
    const providerConfigurationSource = readFileSync(
      join(REPO_ROOT, providerConfigurationPath),
      "utf8",
    );
    const limeAgentLibSource = readFileSync(
      join(REPO_ROOT, limeAgentLibPath),
      "utf8",
    );
    const leaks = [
      ...PROVIDER_CONFIGURATION_FORBIDDEN_PUBLIC_INSTALL_SNIPPETS.filter(
        (snippet) => providerConfigurationSource.includes(snippet),
      ).map((snippet) => `${providerConfigurationPath}: ${snippet}`),
      ...[
        "ConfiguredSessionProvider",
        "configure_model_route_provider_for_session",
        "provider_configuration_from_model_selection",
      ]
        .filter((snippet) => limeAgentLibSource.includes(snippet))
        .map((snippet) => `${limeAgentLibPath}: ${snippet}`),
    ];

    expect(
      leaks,
      "Aster-backed provider 安装只允许留在 lime-agent crate 内部；跨 crate 只能消费 SessionProviderConfig / ModelRouteProviderConfiguration current DTO",
    ).toEqual([]);
  });

  it("provider_configuration route protocol mapping 必须经由 model-provider DTO", () => {
    const filePath = "lime-rs/crates/agent/src/provider_configuration.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const missing =
      PROVIDER_CONFIGURATION_REQUIRED_MODEL_PROVIDER_SNIPPETS.filter(
        (snippet) => !source.includes(snippet),
      );
    const leaks =
      PROVIDER_CONFIGURATION_FORBIDDEN_DIRECT_ASTER_ROUTE_MAPPING_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
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
    const providerConfigurationPath =
      "lime-rs/crates/agent/src/provider_configuration.rs";
    const agentRuntimePath =
      "lime-rs/crates/agent-runtime/src/turn_executor.rs";
    const providerConfigurationSource = readFileSync(
      join(REPO_ROOT, providerConfigurationPath),
      "utf8",
    );
    const agentRuntimeSource = readFileSync(
      join(REPO_ROOT, agentRuntimePath),
      "utf8",
    );
    const missing = [
      ...PROVIDER_CONFIGURATION_REQUIRED_AGENT_RUNTIME_SNIPPETS.filter(
        (snippet) => !providerConfigurationSource.includes(snippet),
      ).map((snippet) => `${providerConfigurationPath}: ${snippet}`),
      ...AGENT_RUNTIME_PROVIDER_CONFIGURATION_REQUIRED_SNIPPETS.filter(
        (snippet) => !agentRuntimeSource.includes(snippet),
      ).map((snippet) => `${agentRuntimePath}: ${snippet}`),
    ];
    const leaks = AGENT_RUNTIME_FORBIDDEN_DEAD_EXECUTION_SNIPPETS.filter(
      (snippet) => agentRuntimeSource.includes(snippet),
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
    const executionPolicyPath =
      "lime-rs/crates/tool-runtime/src/execution_policy.rs";
    const executionPolicyServicePath =
      "lime-rs/crates/tool-runtime/src/execution_policy_service.rs";
    const executionProcessPath =
      "lime-rs/crates/tool-runtime/src/execution_process.rs";
    const executionDecisionPath =
      "lime-rs/crates/tool-runtime/src/execution_decision.rs";
    const executionRulesPath =
      "lime-rs/crates/tool-runtime/src/execution_rules.rs";
    const sandboxPath = "lime-rs/crates/tool-runtime/src/sandbox.rs";
    const shellPath = "lime-rs/crates/tool-runtime/src/shell.rs";
    const shellAnalysisPath =
      "lime-rs/crates/tool-runtime/src/shell_analysis.rs";
    const shellPermissionPath =
      "lime-rs/crates/tool-runtime/src/shell_permission.rs";
    const shellRuntimePath = "lime-rs/crates/tool-runtime/src/shell_runtime.rs";
    const subprocessPath = "lime-rs/crates/tool-runtime/src/subprocess.rs";
    const pathGuardPath = "lime-rs/crates/tool-runtime/src/path_guard.rs";
    const toolBatchPath = "lime-rs/crates/tool-runtime/src/tool_batch.rs";
    const toolExecutorPath = "lime-rs/crates/tool-runtime/src/tool_executor.rs";
    const toolDefinitionPath =
      "lime-rs/crates/tool-runtime/src/tool_definition.rs";
    const toolExtensionPath =
      "lime-rs/crates/tool-runtime/src/tool_extension.rs";
    const webFetchPath = "lime-rs/crates/tool-runtime/src/web_fetch.rs";
    const webFetchContentPath =
      "lime-rs/crates/tool-runtime/src/web_fetch/content.rs";
    const webSearchPath = "lime-rs/crates/tool-runtime/src/web_search.rs";
    const webSearchSupportPath =
      "lime-rs/crates/tool-runtime/src/web_search/support.rs";
    const agentDecisionPath =
      "lime-rs/crates/agent/src/agent_tools/execution/decision.rs";
    const agentPolicyPath =
      "lime-rs/crates/agent/src/agent_tools/execution/policy.rs";
    const agentSandboxPath =
      "lime-rs/crates/agent/src/agent_tools/execution/sandbox.rs";
    const agentPolicyServicePath =
      "lime-rs/crates/agent/src/agent_tools/execution/service.rs";
    const agentExecutionProcessPath =
      "lime-rs/crates/agent/src/agent_tools/execution/process.rs";
    const agentRulesPath =
      "lime-rs/crates/agent/src/agent_tools/execution/rules.rs";
    const agentToolOrchestratorPath =
      "lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs";
    const agentToolOrchestratorAdapterPath =
      "lime-rs/crates/agent/src/agent_tools/tool_orchestrator/aster_registry_adapter.rs";
    const appServerCargoPath = "lime-rs/crates/app-server/Cargo.toml";
    const appServerExecutionProcessPath =
      "lime-rs/crates/app-server/src/execution_process.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const executionPolicySource = readFileSync(
      join(REPO_ROOT, executionPolicyPath),
      "utf8",
    );
    const executionRulesSource = readFileSync(
      join(REPO_ROOT, executionRulesPath),
      "utf8",
    );
    const executionPolicyServiceSource = readFileSync(
      join(REPO_ROOT, executionPolicyServicePath),
      "utf8",
    );
    const executionProcessSource = readFileSync(
      join(REPO_ROOT, executionProcessPath),
      "utf8",
    );
    const executionDecisionSource = readFileSync(
      join(REPO_ROOT, executionDecisionPath),
      "utf8",
    );
    const shellSource = readFileSync(join(REPO_ROOT, shellPath), "utf8");
    const shellAnalysisSource = readFileSync(
      join(REPO_ROOT, shellAnalysisPath),
      "utf8",
    );
    const sandboxSource = readFileSync(join(REPO_ROOT, sandboxPath), "utf8");
    const shellPermissionSource = readFileSync(
      join(REPO_ROOT, shellPermissionPath),
      "utf8",
    );
    const shellRuntimeSource = readFileSync(
      join(REPO_ROOT, shellRuntimePath),
      "utf8",
    );
    const subprocessSource = readFileSync(
      join(REPO_ROOT, subprocessPath),
      "utf8",
    );
    const pathGuardSource = readFileSync(
      join(REPO_ROOT, pathGuardPath),
      "utf8",
    );
    const toolBatchSource = readFileSync(
      join(REPO_ROOT, toolBatchPath),
      "utf8",
    );
    const toolExecutorSource = readFileSync(
      join(REPO_ROOT, toolExecutorPath),
      "utf8",
    );
    const toolDefinitionSource = readFileSync(
      join(REPO_ROOT, toolDefinitionPath),
      "utf8",
    );
    const toolExtensionSource = readFileSync(
      join(REPO_ROOT, toolExtensionPath),
      "utf8",
    );
    const webFetchSource = readFileSync(join(REPO_ROOT, webFetchPath), "utf8");
    const webFetchContentSource = readFileSync(
      join(REPO_ROOT, webFetchContentPath),
      "utf8",
    );
    const webSearchSource = readFileSync(
      join(REPO_ROOT, webSearchPath),
      "utf8",
    );
    const webSearchSupportSource = readFileSync(
      join(REPO_ROOT, webSearchSupportPath),
      "utf8",
    );
    const agentDecisionSource = readFileSync(
      join(REPO_ROOT, agentDecisionPath),
      "utf8",
    );
    const agentPolicySource = readFileSync(
      join(REPO_ROOT, agentPolicyPath),
      "utf8",
    );
    const agentSandboxSource = readFileSync(
      join(REPO_ROOT, agentSandboxPath),
      "utf8",
    );
    const agentPolicyServiceSource = readFileSync(
      join(REPO_ROOT, agentPolicyServicePath),
      "utf8",
    );
    const agentExecutionProcessSource = readFileSync(
      join(REPO_ROOT, agentExecutionProcessPath),
      "utf8",
    );
    const agentRulesSource = readFileSync(
      join(REPO_ROOT, agentRulesPath),
      "utf8",
    );
    const agentToolOrchestratorSource = readFileSync(
      join(REPO_ROOT, agentToolOrchestratorPath),
      "utf8",
    );
    const appServerCargoSource = readFileSync(
      join(REPO_ROOT, appServerCargoPath),
      "utf8",
    );
    const appServerExecutionProcessSource = readFileSync(
      join(REPO_ROOT, appServerExecutionProcessPath),
      "utf8",
    );
    const leaks = TOOL_RUNTIME_FORBIDDEN_DEAD_EXECUTION_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);
    const agentDtoLeaks = [
      "pub enum ToolExecutionWarningPolicy",
      "pub enum ToolExecutionRestrictionProfile",
      "pub enum ToolExecutionSandboxProfile",
      "pub enum ToolExecutionPolicySource",
      "pub struct ToolExecutionPolicy {",
      "pub struct ToolExecutionPolicyResolution",
    ]
      .filter((snippet) => agentPolicySource.includes(snippet))
      .map((snippet) => `${agentPolicyPath}: ${snippet}`);
    const agentRuleDtoLeaks = [
      "pub enum ShellCommandRiskLevel",
      "pub enum ShellCommandRuleSource",
      "pub enum ShellCommandRuleMatchType",
      "pub struct ShellCommandRule {",
      "pub struct ShellCommandRuleMatch {",
      "pub enum NetworkRuleTarget",
      "pub struct NetworkRule {",
      "pub struct NetworkRuleMatch {",
      "pub fn classify_shell_command_with_rules",
      "pub fn classify_network_access",
      "fn classify_shell_segment(",
      "fn classify_network_url(",
    ]
      .filter((snippet) => agentRulesSource.includes(snippet))
      .map((snippet) => `${agentRulesPath}: ${snippet}`);
    const agentDecisionLeaks = [
      "pub enum ToolExecutionDecisionKind",
      "pub struct ToolExecutionDecision {",
      "pub struct ToolExecutionDecisionInput",
      "fn insert_sandbox_backend_metadata",
      "fn should_require_approval",
    ]
      .filter((snippet) => agentDecisionSource.includes(snippet))
      .map((snippet) => `${agentDecisionPath}: ${snippet}`);
    const agentSandboxLeaks = [
      "pub enum RequestedSandboxPolicy",
      "pub enum SandboxBackendPlatform",
      "pub enum SandboxBackend",
      "pub enum SandboxBackendStatus",
      "pub struct SandboxBackendPlan",
      "pub fn evaluate_sandbox",
      "pub fn plan_sandbox_backend",
      "fn shell_segment_is_read_only",
    ]
      .filter((snippet) => agentSandboxSource.includes(snippet))
      .map((snippet) => `${agentSandboxPath}: ${snippet}`);
    const agentPolicyServiceLeaks = [
      "struct RuntimeExecutionPolicyLayer",
      "struct ToolExecutionPolicyOverride",
      "fn extract_runtime_execution_policy_layers",
      "fn collect_runtime_execution_policy_layers",
      "fn extract_runtime_execution_policy_override",
      "fn extract_runtime_shell_command_rules",
      "fn extract_runtime_network_rules",
      "fn convert_shell_command_rules",
      "fn convert_network_rules",
      "fn parse_warning_policy",
      "fn find_persisted_tool_execution_policy_value",
      "fn find_agent_tool_execution_policy_value",
    ]
      .filter((snippet) => agentPolicyServiceSource.includes(snippet))
      .map((snippet) => `${agentPolicyServicePath}: ${snippet}`);
    const agentWorkspacePermissionBuilderLeaks = [
      "WorkspaceExecutionPermissionInput",
      "build_workspace_execution_permissions",
      "build_workspace_shell_allow_pattern",
      "should_auto_approve_tool_warnings",
      "ToolPermissionManager",
      "ParameterRestriction",
      "RestrictionType",
      "PermissionScope",
      "ToolPermission",
    ]
      .filter((snippet) => agentPolicySource.includes(snippet))
      .map((snippet) => `${agentPolicyPath}: ${snippet}`);
    const agentToolBatchDtoLeaks = [
      "pub struct PlannedToolExecution {",
      "pub struct ToolExecutionOutcome {",
      "pub struct ToolExecutionBatch {",
      "pub struct ToolTerminalEventUpdate {",
    ]
      .filter((snippet) => agentToolOrchestratorSource.includes(snippet))
      .map((snippet) => `${agentToolOrchestratorPath}: ${snippet}`);
    const agentToolShellHelperLeaks = [
      "fn process_id_for_tool(",
      "pub fn shell_command_text_from_argv",
      "fn shell_wrapper_part(",
      "fn is_shell_tool_name(",
      "fn normalized_tool_name(",
      "fn shell_command_for_tool(",
      "fn default_shell_command(",
      "fn powershell_command(",
      "fn param_string(",
      "pub use tool_runtime::shell::shell_command_text_from_argv;",
    ]
      .filter((snippet) => agentToolOrchestratorSource.includes(snippet))
      .map((snippet) => `${agentToolOrchestratorPath}: ${snippet}`);
    const agentToolShellPermissionLeaks = [
      "BashTool",
      "PowerShellTool",
      "registry.register(Box::new(BashTool::new()))",
      "registry.register(Box::new(PowerShellTool::new()))",
      ".check_tool_permissions(&planned.tool_name",
      ".check_tool_permissions(\n            canonical_tool_name",
      "ToolError::permission_denied(reason)",
      "let error = ToolError::permission_denied",
      "fn classify_policy_error(error: &ToolError)",
    ]
      .filter((snippet) => agentToolOrchestratorSource.includes(snippet))
      .map((snippet) => `${agentToolOrchestratorPath}: ${snippet}`);
    const agentToolRegistryAdapterLeaks =
      TOOL_ORCHESTRATOR_FORBIDDEN_DIRECT_ASTER_REGISTRY_SNIPPETS.filter(
        (snippet) => agentToolOrchestratorSource.includes(snippet),
      ).map((snippet) => `${agentToolOrchestratorPath}: ${snippet}`);
    const agentExecutionProcessLeaks = [
      "pub enum ExecutionProcessStatus",
      "pub enum ExecutionOutputKind",
      "pub struct ExecutionOutputDelta",
      "pub struct ExecutionProcessSnapshot",
      "pub struct ExecutionProcessStart",
      "pub struct ExecutionProcessManager",
      "pub struct LocalExecutionRequest",
      "pub struct LocalExecutionProcessHandle",
      "pub struct LocalExecutionProcessControlHandle",
      "pub fn start_local_execution_process",
    ]
      .filter((snippet) => agentExecutionProcessSource.includes(snippet))
      .map((snippet) => `${agentExecutionProcessPath}: ${snippet}`);
    const appServerShellHelperLeaks = [
      "shell_command_text_from_argv,\n    LiveExecutionProcessRegistry",
      "agent_tools::tool_orchestrator::{\n    canonical_shell_tool_name, check_shell_tool_permissions, shell_command_text_from_argv",
      "lime_agent::agent_tools::tool_orchestrator",
    ]
      .filter((snippet) => appServerExecutionProcessSource.includes(snippet))
      .map((snippet) => `${appServerExecutionProcessPath}: ${snippet}`);
    const appServerExecutionProcessLeaks = [
      "lime_agent::agent_tools::execution::{",
      "start_local_execution_process,\n    ExecutionOutputDelta as AgentExecutionOutputDelta",
      "ExecutionProcessSnapshot as AgentExecutionProcessSnapshot",
      "ExecutionProcessStatus as AgentExecutionProcessStatus",
      "ExecutionOutputKind as AgentExecutionOutputKind",
      "LocalExecutionRequest, ToolExecutionDecisionInput",
    ]
      .filter((snippet) => appServerExecutionProcessSource.includes(snippet))
      .map((snippet) => `${appServerExecutionProcessPath}: ${snippet}`);

    expect(source).toContain("pub mod execution_process;");
    expect(source).toContain("pub mod execution_decision;");
    expect(source).toContain("pub mod execution_rules;");
    expect(source).toContain("pub mod execution_policy;");
    expect(source).toContain("pub mod execution_policy_service;");
    expect(source).toContain("pub mod mcp_notification;");
    expect(source).toContain("pub mod sandbox;");
    expect(source).toContain("pub mod path_guard;");
    expect(source).toContain("pub mod shell;");
    expect(source).toContain("pub mod shell_analysis;");
    expect(source).toContain("pub mod shell_permission;");
    expect(source).toContain("pub mod shell_runtime;");
    expect(source).toContain("pub mod subprocess;");
    expect(source).toContain("pub mod tool_batch;");
    expect(source).toContain("pub mod tool_executor;");
    expect(source).toContain("pub mod tool_definition;");
    expect(source).toContain("pub mod tool_extension;");
    expect(source).toContain("pub mod tool_io;");
    expect(source).toContain("pub mod tool_result;");
    expect(source).toContain("pub mod web_fetch;");
    expect(source).toContain("pub mod web_search;");
    expect(executionPolicySource).toContain(
      "pub enum ToolExecutionWarningPolicy",
    );
    expect(executionPolicySource).toContain(
      "pub enum ToolExecutionRestrictionProfile",
    );
    expect(executionPolicySource).toContain(
      "pub enum ToolExecutionSandboxProfile",
    );
    expect(executionPolicySource).toContain(
      "pub struct ToolExecutionPolicyResolution",
    );
    expect(executionPolicyServiceSource).toContain(
      "pub struct ToolExecutionResolverInput",
    );
    expect(executionPolicyServiceSource).toContain(
      "pub struct ToolExecutionPolicyService",
    );
    expect(executionPolicyServiceSource).toContain(
      "fn extract_runtime_execution_policy_layers",
    );
    expect(executionPolicyServiceSource).toContain(
      "fn convert_shell_command_rules",
    );
    expect(executionDecisionSource).toContain("pub fn decide_tool_execution");
    expect(executionDecisionSource).toContain(
      "pub struct ToolExecutionDecisionInput",
    );
    expect(sandboxSource).toContain("pub fn plan_sandbox_backend");
    expect(sandboxSource).toContain("pub fn evaluate_sandbox");
    expect(executionProcessSource).toContain("pub enum ExecutionProcessStatus");
    expect(executionProcessSource).toContain("pub struct ExecutionOutputDelta");
    expect(executionProcessSource).toContain(
      "pub struct ExecutionProcessSnapshot",
    );
    expect(executionProcessSource).toContain(
      "pub struct LocalExecutionRequest",
    );
    expect(executionProcessSource).toContain(
      "pub trait LiveExecutionProcessRegistry",
    );
    expect(executionProcessSource).toContain(
      "pub fn start_local_execution_process",
    );
    expect(executionRulesSource).toContain("pub enum ShellCommandRiskLevel");
    expect(executionRulesSource).toContain("pub struct ShellCommandRule {");
    expect(executionRulesSource).toContain("pub struct NetworkRule {");
    expect(executionRulesSource).toContain(
      "pub fn classify_shell_command_with_rules",
    );
    expect(executionRulesSource).toContain("pub fn classify_network_access");
    expect(shellSource).toContain("pub fn shell_command_text_from_argv");
    expect(shellSource).toContain("pub fn shell_command_for_tool");
    expect(shellSource).toContain("pub fn is_shell_tool_name");
    expect(shellSource).toContain("pub fn param_string");
    expect(shellPermissionSource).toContain(
      "pub fn check_shell_command_permission",
    );
    expect(shellPermissionSource).toContain(
      "pub fn check_bash_command_permission",
    );
    expect(shellPermissionSource).toContain(
      "pub fn check_powershell_command_permission",
    );
    expect(shellPermissionSource).toContain("use crate::path_guard::{");
    expect(shellPermissionSource).toContain("use crate::shell_analysis::{");
    expect(shellAnalysisSource).toContain("mod bash;");
    expect(shellAnalysisSource).toContain("mod common;");
    expect(shellAnalysisSource).toContain("mod powershell;");
    expect(shellAnalysisSource).toContain(
      "pub fn is_bash_command_concurrency_safe(",
    );
    expect(shellAnalysisSource).toContain("pub fn missing_bash_read_targets(");
    expect(shellAnalysisSource).toContain(
      "pub fn is_powershell_command_concurrency_safe(",
    );
    expect(shellAnalysisSource).toContain(
      "pub fn missing_powershell_read_targets(",
    );
    expect(shellRuntimeSource).toContain("pub fn build_platform_shell_command");
    expect(shellRuntimeSource).toContain("pub fn detect_powershell_executable");
    expect(shellRuntimeSource).toContain(
      "fn strip_windows_powershell_command_wrapper",
    );
    expect(subprocessSource).toContain("pub fn configure_command_no_window");
    expect(subprocessSource).toContain("pub fn configure_command_for_gui");
    expect(subprocessSource).toContain(
      "pub fn wrap_powershell_command_for_utf8",
    );
    expect(subprocessSource).toContain("pub fn decode_process_output");
    expect(subprocessSource).toContain("pub fn summarize_decoded_with");
    expect(pathGuardSource).toContain("pub fn evaluate_path_mutations");
    expect(pathGuardSource).toContain("pub fn resolve_static_path_candidate");
    expect(pathGuardSource).toContain("fn normalize_path_lexically");
    expect(pathGuardSource).toContain("fn is_protected_path");
    expect(appServerCargoSource).toContain("tool-runtime.workspace = true");
    expect(appServerExecutionProcessSource).toContain(
      "use tool_runtime::shell::{is_shell_tool_name, shell_command_text_from_argv};",
    );
    expect(appServerExecutionProcessSource).toContain(
      "use tool_runtime::execution_process::{",
    );
    expect(appServerExecutionProcessSource).toContain(
      "use tool_runtime::shell_permission::check_shell_command_permission;",
    );
    expect(toolBatchSource).toContain("pub struct PlannedToolExecution");
    expect(toolBatchSource).toContain("pub struct ToolExecutionOutcome");
    expect(toolBatchSource).toContain("pub struct ToolExecutionBatch");
    expect(toolBatchSource).toContain("pub struct ToolTerminalEventUpdate");
    expect(toolExecutorSource).toContain(
      "pub struct RuntimeToolExecutionContextInput",
    );
    expect(toolExecutorSource).toContain(
      "pub struct RuntimeToolExecutionContext",
    );
    expect(toolExecutorSource).toContain(
      "pub struct RuntimeWorkspaceSandboxInput",
    );
    expect(toolExecutorSource).toContain(
      "pub struct RuntimeToolExecutionRequest",
    );
    expect(toolExecutorSource).toContain("pub type RuntimeToolTurnContext");
    expect(toolExecutorSource).toContain(
      "pub trait RuntimeToolExecutor: Send + Sync",
    );
    expect(toolExecutorSource).toContain(
      "pub struct RuntimeToolExecutorHandle",
    );
    expect(toolExecutorSource).toContain(
      "pub struct RuntimeToolExecutionResult",
    );
    expect(toolExecutorSource).toContain(
      "pub struct RuntimeToolExecutionError",
    );
    expect(toolExecutorSource).toContain("pub enum RuntimeToolPolicyErrorKind");
    expect(toolExecutorSource).toContain("pub fn classification(&self)");
    expect(toolDefinitionSource).toContain("pub struct RuntimeToolDefinition");
    expect(toolDefinitionSource).toContain("pub fn new(");
    expect(toolExtensionSource).toContain("pub struct RuntimeExtensionConfig");
    expect(toolExtensionSource).toContain("pub fn is_tool_exposed_by_default");
    expect(webFetchSource).toContain("pub struct RuntimeWebFetchExecutor");
    expect(webFetchSource).toContain(
      "impl RuntimeToolExecutor for RuntimeWebFetchExecutor",
    );
    expect(webFetchSource).toContain(
      "pub fn runtime_web_fetch_executor_handle",
    );
    expect(webFetchSource).toContain("pub fn web_fetch_tool_definition");
    expect(webFetchSource).toContain('include!("web_fetch/content.rs");');
    expect(webFetchSource).not.toContain("aster::");
    expect(webFetchSource).not.toContain("use aster::");
    expect(webFetchContentSource).toContain("pub struct WebFetchInput");
    expect(webFetchContentSource).toContain("fn check_web_fetch_url_safety");
    expect(webFetchContentSource).toContain("fn html_to_markdown");
    expect(webFetchContentSource).toContain("fn dynamic_filter_content");
    expect(webFetchContentSource).not.toContain("aster::");
    expect(webFetchContentSource).not.toContain("use aster::");
    expect(webSearchSource).toContain("pub struct RuntimeWebSearchExecutor");
    expect(webSearchSource).toContain(
      "impl RuntimeToolExecutor for RuntimeWebSearchExecutor",
    );
    expect(webSearchSource).toContain(
      "pub fn runtime_web_search_executor_handle",
    );
    expect(webSearchSource).toContain("pub fn web_search_tool_definition");
    expect(webSearchSource).toContain('include!("web_search/support.rs");');
    expect(webSearchSource).not.toContain("aster::");
    expect(webSearchSource).not.toContain("use aster::");
    expect(webSearchSupportSource).toContain("pub struct WebSearchInput");
    expect(webSearchSupportSource).toContain("struct SearchRuntimeConfig");
    expect(webSearchSupportSource).toContain(
      "fn extract_results_from_search_html",
    );
    expect(webSearchSupportSource).not.toContain("aster::");
    expect(webSearchSupportSource).not.toContain("use aster::");
    expect(agentPolicySource).toContain(
      "pub use tool_runtime::execution_policy::{",
    );
    expect(agentPolicySource).toContain(
      "pub use tool_runtime::execution_policy_service::ToolExecutionResolverInput;",
    );
    expect(agentPolicyServiceSource).toContain(
      "ToolExecutionPolicyService as RuntimeToolExecutionPolicyService",
    );
    expect(agentRulesSource).toContain(
      "pub use tool_runtime::execution_rules::{",
    );
    expect(agentDecisionSource).toContain(
      "decide_tool_execution as decide_tool_execution_with_options",
    );
    expect(agentSandboxSource.trim()).toBe("pub use tool_runtime::sandbox::*;");
    expect(agentExecutionProcessSource.trim()).toBe(
      "pub use tool_runtime::execution_process::*;",
    );
    expect(agentToolOrchestratorSource).toContain(
      "pub use tool_runtime::tool_batch::{",
    );
    expect(agentToolOrchestratorSource).toContain(
      "use tool_runtime::execution_process::{",
    );
    expect(agentToolOrchestratorSource).toContain("use tool_runtime::shell::{");
    expect(agentToolOrchestratorSource).toContain(
      "use tool_runtime::shell_permission::{check_shell_command_permission, ShellPermissionDecision};",
    );
    expect(agentToolOrchestratorSource).toContain(
      "RuntimeToolExecutionContext, RuntimeToolExecutionContextInput, RuntimeToolExecutionRequest,",
    );
    expect(agentToolOrchestratorSource).toContain(
      "RuntimeToolExecutorHandle, RuntimeToolPolicyErrorKind, RuntimeWorkspaceSandboxInput,",
    );
    expect(agentToolOrchestratorSource).toContain(
      "pub executor: RuntimeToolExecutorHandle",
    );
    expect(agentToolOrchestratorSource).toContain(
      "RuntimeToolPolicyErrorKind::PermissionDenied(reason.clone())",
    );
    expect(agentToolOrchestratorSource).toContain(
      "RuntimeWorkspaceSandboxInput::from_policy_metadata(&policy_decision.metadata)",
    );
    expect(agentToolOrchestratorSource).toContain(
      "let context = RuntimeToolExecutionContext::new(RuntimeToolExecutionContextInput",
    );
    expect(agentToolOrchestratorSource).toContain(
      "RuntimeToolExecutionRequest {",
    );
    expect(agentToolOrchestratorSource).toContain(
      "let classification = error?.classification()?;",
    );
    expect(agentToolOrchestratorSource).not.toContain(
      "runtime_tool_executor_from_aster_registry",
    );
    expect(agentToolOrchestratorSource).not.toContain(
      "pub registry: AsterToolRegistryAdapter",
    );
    expect(agentToolOrchestratorSource).not.toContain(
      "AsterToolRegistryAdapter",
    );
    expect(agentToolOrchestratorSource).not.toContain(
      "enum ToolPolicyErrorKind",
    );
    expect(agentToolOrchestratorSource).not.toContain(
      "AsterToolPolicyErrorKind",
    );
    expect(existsSync(join(REPO_ROOT, agentToolOrchestratorAdapterPath))).toBe(
      false,
    );
    expect(agentToolOrchestratorSource).not.toContain(
      "mod aster_registry_adapter;",
    );
    expect(
      agentDtoLeaks,
      "Tool execution policy DTO owner 必须是 tool-runtime current crate；lime-agent 只能保留 resolver glue，不得恢复 Aster permission builder",
    ).toEqual([]);
    expect(
      agentRuleDtoLeaks,
      "Shell/network execution rule DTO 与分类器必须归属 tool-runtime current crate；lime-agent rules.rs 只能保留 catalog 默认策略表与 re-export",
    ).toEqual([]);
    expect(
      agentDecisionLeaks,
      "Tool execution decision / sandbox backend decision 必须归属 tool-runtime current crate；lime-agent decision.rs 只能注入 agent catalog options",
    ).toEqual([]);
    expect(
      agentSandboxLeaks,
      "Workspace sandbox policy 纯逻辑必须归属 tool-runtime current crate；lime-agent sandbox.rs 只能作为迁移期 re-export",
    ).toEqual([]);
    expect(
      agentPolicyServiceLeaks,
      "Tool execution persisted/runtime policy 解析必须归属 tool-runtime current crate；lime-agent service.rs 只能注入默认策略表和 tool name matcher",
    ).toEqual([]);
    expect(
      agentWorkspacePermissionBuilderLeaks,
      "Workspace execution permission builder 没有 production 消费者且曾依赖 Aster permission manager；不得在 lime-agent policy.rs 恢复这条 dead surface",
    ).toEqual([]);
    expect(
      agentToolBatchDtoLeaks,
      "Tool batch plan/outcome DTO 必须归属 tool-runtime current crate；lime-agent tool_orchestrator.rs 只能保留 Aster registry 执行 adapter 与 RuntimeAgentEvent 映射",
    ).toEqual([]);
    expect(
      agentToolShellHelperLeaks,
      "Shell command planning / 参数抽取 helper 必须归属 tool-runtime current crate；lime-agent tool_orchestrator.rs 只能调用 current helper，不能恢复 Aster registry adapter",
    ).toEqual([]);
    expect(
      agentToolShellPermissionLeaks,
      "Shell permission preflight 必须直接使用 tool-runtime current owner；tool_orchestrator.rs 不得为了权限检查临时注册 Aster BashTool/PowerShellTool、调用 Aster check_tool_permissions，或构造 Aster ToolError 做 policy metadata 分类",
    ).toEqual([]);
    expect(
      agentToolRegistryAdapterLeaks,
      "tool_orchestrator Aster registry adapter 已删除；主 tool_orchestrator.rs 不得重新直接依赖 Aster registry / ToolContext / ToolError / workspace sandbox / session_context",
    ).toEqual([]);
    expect(
      agentExecutionProcessLeaks,
      "Local execution process supervisor 必须归属 tool-runtime current crate；lime-agent execution/process.rs 只能作为迁移期 re-export",
    ).toEqual([]);
    expect(
      appServerShellHelperLeaks,
      "App Server 对纯 shell argv 文本提取应直接依赖 tool-runtime current owner，不能继续经 lime-agent Aster adapter re-export 消费",
    ).toEqual([]);
    expect(
      appServerExecutionProcessLeaks,
      "App Server 的 local execution process supervisor 应直接依赖 tool-runtime current owner，不能继续经 lime-agent execution/process 兼容 re-export 消费",
    ).toEqual([]);
    expect(
      leaks,
      "tool-runtime 只保留真实消费的工具投影模块；无实现/无调用方的 ToolRuntime 执行 trait 和 DTO 不得恢复",
    ).toEqual([]);
  });

  it("tool inventory runtime DTO 必须使用 tool-runtime current owner", () => {
    const inventoryPath = "lime-rs/crates/agent/src/agent_tools/inventory.rs";
    const snapshotPath =
      "lime-rs/crates/agent/src/agent_tools/tool_inventory_runtime_snapshot.rs";
    const adapterPath =
      "lime-rs/crates/agent/src/agent_tools/tool_inventory_runtime_adapter.rs";
    const inventorySource = readFileSync(
      join(REPO_ROOT, inventoryPath),
      "utf8",
    );
    const snapshotSource = readFileSync(join(REPO_ROOT, snapshotPath), "utf8");
    const adapterSource = readFileSync(join(REPO_ROOT, adapterPath), "utf8");
    const projectionSource = [
      `${inventoryPath}\n${inventorySource}`,
      `${snapshotPath}\n${snapshotSource}`,
    ].join("\n");
    const definitionLeaks =
      TOOL_INVENTORY_FORBIDDEN_ASTER_TOOL_DEFINITION_SNIPPETS.filter(
        (snippet) => projectionSource.includes(snippet),
      );
    const extensionLeaks =
      TOOL_INVENTORY_FORBIDDEN_ASTER_EXTENSION_CONFIG_SNIPPETS.filter(
        (snippet) => projectionSource.includes(snippet),
      );

    expect(inventorySource).toContain(
      "use tool_runtime::tool_definition::RuntimeToolDefinition;",
    );
    expect(inventorySource).toContain(
      "use tool_runtime::tool_extension::RuntimeExtensionConfig;",
    );
    expect(snapshotSource).toContain(
      "use tool_runtime::tool_definition::RuntimeToolDefinition;",
    );
    expect(snapshotSource).toContain(
      "use tool_runtime::tool_extension::RuntimeExtensionConfig;",
    );
    expect(adapterSource).toContain(
      "use tool_runtime::tool_definition::RuntimeToolDefinition;",
    );
    expect(adapterSource).toContain(
      "use tool_runtime::tool_extension::RuntimeExtensionConfig;",
    );
    expect(adapterSource).toContain(".get_definitions()");
    expect(adapterSource).toContain("RuntimeToolDefinition::new(");
    expect(adapterSource).toContain("project_aster_extension_config");
    expect(adapterSource).toContain("AsterExtensionConfig::Builtin");
    expect(adapterSource).toContain("RuntimeExtensionConfig::new(");
    expect(
      definitionLeaks.map(
        (snippet) => `tool inventory Aster definition DTO leak: ${snippet}`,
      ),
      "ToolDefinition 已迁为 tool-runtime current DTO；Aster registry DTO 只能在 runtime adapter 读取边界转换一次",
    ).toEqual([]);
    expect(
      extensionLeaks.map(
        (snippet) => `tool inventory Aster extension DTO leak: ${snippet}`,
      ),
      "ExtensionConfig 已迁为 tool-runtime current DTO；Aster extension config 只能在 runtime adapter 读取边界转换一次",
    ).toEqual([]);
  });

  it("vendored Aster shell permission 只允许内部调用 tool-runtime current owner", () => {
    const asterCargoPath = "lime-rs/vendor/aster-rust/crates/aster/Cargo.toml";
    const asterLibPath = "lime-rs/vendor/aster-rust/crates/aster/src/lib.rs";
    const toolsModPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/tools/mod.rs";
    const bashPath = "lime-rs/vendor/aster-rust/crates/aster/src/tools/bash.rs";
    const powershellPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/tools/powershell_tool.rs";
    const taskPath = "lime-rs/vendor/aster-rust/crates/aster/src/tools/task.rs";
    const pathGuardPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/tools/path_guard.rs";
    const commandSemanticsPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/tools/command_semantics.rs";
    const subprocessPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/subprocess.rs";
    const shellRuntimePath =
      "lime-rs/vendor/aster-rust/crates/aster/src/tools/shell_runtime.rs";
    const bashPropertyTestsPath =
      "lime-rs/vendor/aster-rust/crates/aster/tests/bash_tool_property_tests.rs";
    const cargoSource = readFileSync(join(REPO_ROOT, asterCargoPath), "utf8");
    const asterLibSource = readFileSync(join(REPO_ROOT, asterLibPath), "utf8");
    const toolsModSource = readFileSync(join(REPO_ROOT, toolsModPath), "utf8");
    const bashSource = readFileSync(join(REPO_ROOT, bashPath), "utf8");
    const powershellSource = readFileSync(
      join(REPO_ROOT, powershellPath),
      "utf8",
    );
    const taskSource = readFileSync(join(REPO_ROOT, taskPath), "utf8");
    const bashPropertyTestsSource = readFileSync(
      join(REPO_ROOT, bashPropertyTestsPath),
      "utf8",
    );
    const productionSource = [
      `${toolsModPath}\n${toolsModSource.split("#[cfg(test)]")[0] ?? toolsModSource}`,
      `${bashPath}\n${bashSource.split("#[cfg(test)]")[0] ?? bashSource}`,
      `${powershellPath}\n${
        powershellSource.split("#[cfg(test)]")[0] ?? powershellSource
      }`,
      `${taskPath}\n${taskSource.split("#[cfg(test)]")[0] ?? taskSource}`,
    ].join("\n");
    const vendorSource = collectTextFiles(
      join(REPO_ROOT, "lime-rs/vendor/aster-rust/crates/aster/src"),
    )
      .map((file) => {
        const relativePath = repoRelative(file);
        const source = readFileSync(file, "utf8");
        return `${relativePath}\n${source}`;
      })
      .join("\n");
    const leaks = VENDORED_ASTER_SHELL_PERMISSION_FORBIDDEN_SNIPPETS.filter(
      (snippet) => productionSource.includes(snippet),
    );
    const wrapperLeaks =
      VENDORED_ASTER_SHELL_ANALYSIS_WRAPPER_FORBIDDEN_SNIPPETS.filter(
        (snippet) => productionSource.includes(snippet),
      );
    const pathGuardLeaks = existsSync(join(REPO_ROOT, pathGuardPath))
      ? VENDORED_ASTER_PATH_GUARD_FORBIDDEN_SNIPPETS.filter((snippet) =>
          readFileSync(join(REPO_ROOT, pathGuardPath), "utf8").includes(
            snippet,
          ),
        )
      : [];
    const processRuntimeLeaks =
      VENDORED_ASTER_PROCESS_RUNTIME_FORBIDDEN_SNIPPETS.filter((snippet) =>
        `${cargoSource}\n${asterLibSource}\n${toolsModSource}\n${vendorSource}`.includes(
          snippet,
        ),
      );

    expect(cargoSource).toContain(
      'tool-runtime = { path = "../../../../crates/tool-runtime" }',
    );
    expect(cargoSource).not.toContain("encoding_rs =");
    expect(asterLibSource).not.toContain("pub mod subprocess;");
    expect(bashSource).toContain(
      "use tool_runtime::shell_permission::{check_bash_command_permission, ShellPermissionDecision};",
    );
    expect(bashSource).toContain(
      "use tool_runtime::shell_runtime::build_platform_shell_command;",
    );
    expect(bashSource).toContain(
      "use tool_runtime::subprocess::{decode_process_output, summarize_decoded_with};",
    );
    expect(bashSource).not.toContain("is_bash_command_concurrency_safe");
    expect(bashSource).toContain("missing_bash_read_targets(command, cwd)");
    expect(bashSource).toContain(
      "match check_bash_command_permission(command, &context.working_directory)",
    );
    expect(powershellSource).toContain(
      "use tool_runtime::shell_runtime::detect_powershell_executable;",
    );
    expect(powershellSource).toContain(
      "configure_command_for_gui, decode_process_output, summarize_decoded_with,",
    );
    expect(powershellSource).not.toContain(
      "is_powershell_command_concurrency_safe",
    );
    expect(powershellSource).toContain(
      "missing_powershell_read_targets(command, cwd)",
    );
    expect(powershellSource).toContain("detect_blocked_sleep_pattern");
    expect(powershellSource).toContain("check_powershell_command_permission");
    expect(powershellSource).toContain(
      "match check_powershell_command_permission(&input.command, &context.working_directory)",
    );
    expect(taskSource).toContain(
      "use tool_runtime::shell_runtime::build_platform_shell_command;",
    );
    expect(taskSource).toContain("use tool_runtime::subprocess::{");
    expect(taskSource).toContain("configure_command_for_gui");
    expect(taskSource).toContain("decode_process_output");
    expect(taskSource).toContain("wrap_powershell_command_for_utf8");
    expect(toolsModSource).not.toContain("pub mod path_guard;");
    expect(toolsModSource).not.toContain("mod shell_runtime;");
    expect(existsSync(join(REPO_ROOT, pathGuardPath))).toBe(false);
    expect(
      existsSync(join(REPO_ROOT, commandSemanticsPath)),
      "vendored Aster 不得恢复 tools/command_semantics.rs；shell command exit semantics current owner 是 tool-runtime::command_semantics",
    ).toBe(false);
    expect(
      existsSync(join(REPO_ROOT, subprocessPath)),
      "vendored Aster 不得恢复 src/subprocess.rs；进程输出解码、Windows no-window 与 UTF-8 wrapper current owner 是 tool-runtime::subprocess",
    ).toBe(false);
    expect(
      existsSync(join(REPO_ROOT, shellRuntimePath)),
      "vendored Aster 不得恢复 tools/shell_runtime.rs；平台 shell command 构造与 PowerShell runtime 探测 current owner 是 tool-runtime::shell_runtime",
    ).toBe(false);
    expect(
      wrapperLeaks.map(
        (snippet) => `vendored shell analysis wrapper: ${snippet}`,
      ),
      "shell analysis / read-target preflight 已迁到 tool-runtime；vendored Aster 不得继续公开包装这些已迁 API",
    ).toEqual([]);
    expect(
      productionSource.includes("pub use tool_runtime::"),
      "vendored Aster 不得用 pub use 把 tool-runtime current API 重新伪装成 Aster public surface",
    ).toBe(false);
    expect(
      toolsModSource.includes("pub use bash::{preflight_bash_read_targets"),
      "Bash read-target preflight 是 Aster tool 内部执行细节，外部必须直接依赖 tool-runtime current owner",
    ).toBe(false);
    expect(
      toolsModSource.includes(
        "pub use powershell_tool::{preflight_powershell_read_targets",
      ),
      "PowerShell read-target preflight 是 Aster tool 内部执行细节，外部必须直接依赖 tool-runtime current owner",
    ).toBe(false);
    expect(
      leaks.map((snippet) => `vendored shell permission duplicate: ${snippet}`),
      "Bash/PowerShell permission 纯规则已迁到 tool-runtime；vendored Aster 只能在现有工具内部调用 current owner，不能继续维护第二份安全判断事实源",
    ).toEqual([]);
    expect(
      pathGuardLeaks.map(
        (snippet) => `vendored path_guard duplicate: ${snippet}`,
      ),
      "路径候选解析与保护目录判断已迁到 tool-runtime；vendored Aster 不得保留 path_guard wrapper 或重复实现",
    ).toEqual([]);
    expect(
      processRuntimeLeaks.map(
        (snippet) => `vendored process runtime duplicate: ${snippet}`,
      ),
      "进程输出解码、Windows no-window / UTF-8 wrapper 与平台 shell runtime 已迁到 tool-runtime；vendored Aster 只能内部调用 current owner，不得恢复第二份 helper 或依赖 encoding_rs",
    ).toEqual([]);
    expect(bashPropertyTestsSource).toContain(
      "Permission rules live in `tool-runtime::shell_permission`",
    );
    expect(
      [
        "prop_permission_check_blocks_dangerous",
        "prop_permission_check_allows_safe",
        "prop_permission_check_asks_for_warning",
        "arb_dangerous_command",
        "arb_warning_command",
        "tool.check_permissions(&params, &context).await",
      ].filter((snippet) => bashPropertyTestsSource.includes(snippet)),
      "BashTool vendor property tests 不得继续把已迁 shell permission 规则包装成 Aster 行为；permission 行为必须在 tool-runtime current tests 覆盖",
    ).toEqual([]);
  });

  it("vendored Aster web tools 只能委托 tool-runtime current owner", () => {
    const toolsModPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/tools/mod.rs";
    const webPath = "lime-rs/vendor/aster-rust/crates/aster/src/tools/web.rs";
    const webFetchContentPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/tools/web_fetch_content.rs";
    const toolsModSource = readFileSync(join(REPO_ROOT, toolsModPath), "utf8");
    const webSource = readFileSync(join(REPO_ROOT, webPath), "utf8");
    const productionSource = `${toolsModPath}\n${toolsModSource.split("#[cfg(test)]")[0] ?? toolsModSource}\n${webPath}\n${webSource.split("#[cfg(test)]")[0] ?? webSource}`;
    const webLineCount = webSource.split(/\r?\n/u).length;
    const leaks = VENDORED_ASTER_WEB_TOOL_FORBIDDEN_SNIPPETS.filter((snippet) =>
      productionSource.includes(snippet),
    );

    expect(webLineCount).toBeLessThan(800);
    expect(existsSync(join(REPO_ROOT, webFetchContentPath))).toBe(false);
    expect(toolsModSource).not.toContain("mod web_fetch_content;");
    expect(webSource).toContain("use tool_runtime::web_fetch::{");
    expect(webSource).toContain("runtime_web_fetch_executor_handle");
    expect(webSource).toContain("runtime_web_search_executor_handle");
    expect(webSource).toContain("execute_current_tool(");
    expect(webSource).toContain("WebFetchTool");
    expect(webSource).toContain("WebSearchTool");
    expect(
      leaks.map((snippet) => `vendored web tool duplicate: ${snippet}`),
      "WebFetch/WebSearch 执行逻辑已迁到 tool-runtime；vendored Aster 只能保留 Tool trait adapter，不得恢复抓取、搜索 provider、缓存或内容清洗重复实现",
    ).toEqual([]);
  });

  it("lime-agent test_support Aster fixture surface 必须保持删除", () => {
    const filePath = "lime-rs/crates/agent/src/test_support.rs";
    const cargoPath = "lime-rs/crates/agent/Cargo.toml";
    const appServerCargoPath = "lime-rs/crates/app-server/Cargo.toml";
    const libPath = "lime-rs/crates/agent/src/lib.rs";
    const cargoSource = readFileSync(join(REPO_ROOT, cargoPath), "utf8");
    const appServerCargoSource = readFileSync(
      join(REPO_ROOT, appServerCargoPath),
      "utf8",
    );
    const libSource = readFileSync(join(REPO_ROOT, libPath), "utf8");
    const leaks = [
      ...LIME_AGENT_TEST_SUPPORT_FORBIDDEN_SNIPPETS.filter((snippet) =>
        cargoSource.includes(snippet),
      ).map((snippet) => `${cargoPath}: ${snippet}`),
      ...LIME_AGENT_TEST_SUPPORT_FORBIDDEN_SNIPPETS.filter((snippet) =>
        appServerCargoSource.includes(snippet),
      ).map((snippet) => `${appServerCargoPath}: ${snippet}`),
      ...LIME_AGENT_TEST_SUPPORT_FORBIDDEN_SNIPPETS.filter((snippet) =>
        libSource.includes(snippet),
      ).map((snippet) => `${libPath}: ${snippet}`),
    ];

    expect(
      existsSync(join(REPO_ROOT, filePath)),
      "test_support.rs 曾用于通过 feature 向 App Server 暴露 Aster Tool/ToolContext fixture；该 surface 已归类为 dead，不得恢复",
    ).toBe(false);
    expect(
      leaks,
      "lime-agent test-support feature 和 test_support 模块已删除；App Server 测试不得通过 feature 重新获得 Aster fixture surface",
    ).toEqual([]);
  });

  it("provider_continuation_state capability 判定必须经由 model-provider DTO", () => {
    const filePath = "lime-rs/crates/agent/src/provider_continuation_state.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const missing =
      PROVIDER_CONTINUATION_REQUIRED_MODEL_PROVIDER_SNIPPETS.filter(
        (snippet) => !source.includes(snippet),
      );
    const leaks =
      PROVIDER_CONTINUATION_FORBIDDEN_ASTER_DECISION_SNIPPETS.filter(
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
    const libPath = "lime-rs/crates/agent/src/lib.rs";
    const libSource = readFileSync(join(REPO_ROOT, libPath), "utf8");
    const leaks = SESSION_QUERY_FORBIDDEN_ASTER_TREE_HELPER_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);
    const publicLeaks = [
      ...SESSION_QUERY_FORBIDDEN_PUBLIC_ASTER_SESSION_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`),
      ...(libSource.includes("pub use session_query::")
        ? [`${libPath}: pub use session_query::`]
        : []),
    ];

    expect(
      leaks,
      "subagent cascade 树遍历必须归属 thread-store current projection；session_query 只允许做 Aster Session adapter",
    ).toEqual([]);
    expect(
      publicLeaks,
      "session_query 返回 Aster Session，只能作为 lime-agent crate-internal adapter；不得从根 API re-export",
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
    const libPath = "lime-rs/crates/agent/src/lib.rs";
    const libSource = readFileSync(join(REPO_ROOT, libPath), "utf8");
    const source = existsSync(join(REPO_ROOT, filePath))
      ? readFileSync(join(REPO_ROOT, filePath), "utf8")
      : "";
    const leaks = [
      ...(existsSync(join(REPO_ROOT, filePath))
        ? [`${filePath}: restored`]
        : []),
      ...SESSION_UPDATE_FORBIDDEN_ASTER_TOKEN_STATS_SNIPPETS.filter((snippet) =>
        source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`),
    ];
    const publicLeaks = [
      ...SESSION_UPDATE_FORBIDDEN_PUBLIC_ASTER_SURFACE_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
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
      leaks,
      "session_update.rs 已无消费者并按 dead 删除；compaction / recent-state 写回不得回流到 Aster extension update 链",
    ).toEqual([]);
    expect(
      publicLeaks,
      "session_update 不得继续公开 Aster Session / Conversation / ExtensionData wrapper；只有 crate-internal adapter 可持有 extension_data 持久化",
    ).toEqual([]);
  });

  it("session_store 不得恢复已删除的 Aster public 写入口和空 preview API", () => {
    const sessionStorePath = "lime-rs/crates/agent/src/session_store.rs";
    const sessionTypesPath = "lime-rs/crates/agent/src/session_store_types.rs";
    const libPath = "lime-rs/crates/agent/src/lib.rs";
    const leaks = SESSION_STORE_FORBIDDEN_DEAD_PUBLIC_API_SNIPPETS.flatMap(
      (snippet) =>
        [sessionStorePath, sessionTypesPath, libPath]
          .filter((filePath) =>
            readFileSync(join(REPO_ROOT, filePath), "utf8").includes(snippet),
          )
          .map((filePath) => `${filePath}: ${snippet}`),
    );

    expect(
      leaks,
      "list_title_preview_messages_sync 是空实现，update_session_provider_config_sync 是无消费者 Aster ModelConfig 写入口；二者按 dead 删除，不得回流",
    ).toEqual([]);
  });

  it("subagent_profiles 不得公开 Aster extension/hook surface 或零调用内置 profile helper", () => {
    const filePath = "lime-rs/crates/agent/src/subagent_profiles.rs";
    const adapterPath =
      "lime-rs/crates/agent/src/subagent_profiles_aster_adapter.rs";
    const libPath = "lime-rs/crates/agent/src/lib.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const adapterSource = readFileSync(join(REPO_ROOT, adapterPath), "utf8");
    const libSource = readFileSync(join(REPO_ROOT, libPath), "utf8");
    const publicLeaks =
      SUBAGENT_PROFILES_FORBIDDEN_PUBLIC_ASTER_SURFACE_SNIPPETS.flatMap(
        (snippet) => {
          const paths = [];
          if (source.includes(snippet)) {
            paths.push(`${filePath}: ${snippet}`);
          }
          if (libSource.includes(snippet)) {
            paths.push(`${libPath}: ${snippet}`);
          }
          return paths;
        },
      );
    const unusedHelperLeaks =
      SUBAGENT_PROFILES_FORBIDDEN_UNUSED_PROFILE_HELPERS.filter(
        (snippet) => source.includes(snippet) || libSource.includes(snippet),
      ).map((snippet) => `${filePath}/${libPath}: ${snippet}`);

    expect(source).toContain("pub struct SubagentCustomizationState");
    expect(source).toContain("pub struct SubagentSkillSummary");
    expect(adapterSource).toContain(
      "impl ExtensionState for SubagentCustomizationState",
    );
    expect(adapterSource).toContain(
      "pub(crate) fn subagent_customization_from_session",
    );
    expect(
      publicLeaks,
      "subagent_profiles 只能保留 Lime-owned read model DTO；Aster FrontmatterHooks / ExtensionData / Session helper 不得重新公开",
    ).toEqual([]);
    expect(
      unusedHelperLeaks,
      "内置 subagent profile / preset / prompt helper 当前无外部消费者，不得作为历史 API 面继续保留",
    ).toEqual([]);
  });

  it("direct_text_generation current 调用点不得使用无 DB compat fallback", () => {
    const leaks = DIRECT_TEXT_GENERATION_NO_DB_FALLBACK_FILES.flatMap(
      (filePath) => {
        const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
        return DIRECT_TEXT_GENERATION_NO_DB_FALLBACK_PATTERN.test(source)
          ? [`${filePath}: run_direct_text_generation without db`]
          : [];
      },
    );

    expect(
      leaks,
      "App Server / host-managed generation 必须使用 run_direct_text_generation_with_db，让 usage fallback 走 SessionRepository 而不是 Aster session query",
    ).toEqual([]);
  });

  it("direct_text_generation 不得直接查询 Aster session usage", () => {
    const filePath = "lime-rs/crates/agent/src/direct_text_generation.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = DIRECT_TEXT_GENERATION_FORBIDDEN_ASTER_USAGE_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "direct_text_generation 是 current-facing 执行入口；必须要求 DB，让 usage fallback 只走 SessionRepository，不得保留无 DB / Aster session fallback 后门",
    ).toEqual([]);
    expect(source).toContain("session_usage_projection::project_token_usage");
  });

  it("ask_bridge 不得重新承接 Ask schema / response 纯逻辑", () => {
    const filePath = "lime-rs/crates/agent/src/ask_bridge.rs";
    const lspPath = "lime-rs/crates/agent/src/lsp_bridge.rs";
    const libPath = "lime-rs/crates/agent/src/lib.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const lspSource = readFileSync(join(REPO_ROOT, lspPath), "utf8");
    const libSource = readFileSync(join(REPO_ROOT, libPath), "utf8");
    const leaks = ASK_BRIDGE_FORBIDDEN_COMPAT_LOGIC_SNIPPETS.filter(
      (snippet) =>
        source.includes(snippet) ||
        lspSource.includes(snippet) ||
        libSource.includes(snippet),
    ).map((snippet) => `${filePath}/${lspPath}/${libPath}: ${snippet}`);

    expect(
      leaks,
      "Ask/LSP bridge 只能作为 lime-agent 内部 Aster callback adapter；不得从 crate 根公开 Aster callback/request 类型",
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
    const leaks = ASTER_SESSION_STORE_FORBIDDEN_SPLIT_HELPERS.filter(
      (snippet) => productionSource.includes(snippet),
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
      if (
        /^\s*(?:pub\s+)?mod\s+aster_session_store_adapter\s*;/mu.test(source)
      ) {
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
      "aster = { workspace = true, optional = true }",
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
    const leaks =
      ASTER_RUNTIME_CONVERSATION_FORBIDDEN_TRANSCRIPT_HELPERS.filter(
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
    const leaks =
      EVENT_CONVERTER_FORBIDDEN_PROVIDER_TRACE_STAGE_SNIPPETS.filter(
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
    const eventConverterSource = readFileSync(
      join(REPO_ROOT, eventConverterPath),
      "utf8",
    );
    const limeAgentLibSource = readFileSync(
      join(REPO_ROOT, limeAgentLibPath),
      "utf8",
    );
    const leaks = EVENT_CONVERTER_FORBIDDEN_PUBLIC_SURFACE_SNIPPETS.filter(
      (snippet) =>
        eventConverterSource.includes(snippet) ||
        limeAgentLibSource.includes(snippet),
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
    const leaks =
      EVENT_CONVERTER_FORBIDDEN_ACTION_REQUIRED_PROJECTION_SNIPPETS.filter(
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
    const leaks =
      EVENT_CONVERTER_FORBIDDEN_MESSAGE_CONTENT_ADAPTER_SNIPPETS.filter(
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
    const leaks =
      EVENT_CONVERTER_FORBIDDEN_RUNTIME_TIMELINE_ADAPTER_SNIPPETS.filter(
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
    const leaks =
      ASTER_RUNTIME_PROJECTION_FORBIDDEN_SNAPSHOT_ADAPTER_SNIPPETS.filter(
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
    const leaks = collectTextFiles(runtimeBackendRoot).flatMap((file) => {
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
          return ASTER_LIVE_EXECUTION_HOOK_FORBIDDEN_SNIPPETS.filter(
            (snippet) => source.includes(snippet),
          ).map((snippet) => `${repoRelative(file)}: ${snippet}`);
        }),
    );

    expect(
      leaks,
      "NativeToolExecutionHook / NativeToolExecutionRequest / ToolCallResult 只能由 lime-agent live_execution_process adapter 持有；App Server 只能实现 LiveExecutionProcessGateway",
    ).toEqual([]);
  });

  it("已迁工具编排文件不得重新使用 Aster turn context DTO", () => {
    const turnContextConfigurationPath =
      "lime-rs/crates/agent/src/turn_context_configuration.rs";
    const turnContextAsterAdapterPath =
      "lime-rs/crates/agent/src/turn_context_configuration/aster_adapter.rs";
    const turnContextConfigurationSource = readFileSync(
      join(REPO_ROOT, turnContextConfigurationPath),
      "utf8",
    );
    const turnContextAsterAdapterSource = readFileSync(
      join(REPO_ROOT, turnContextAsterAdapterPath),
      "utf8",
    );
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
    expect(turnContextConfigurationSource).not.toContain("aster::");
    expect(turnContextConfigurationSource).toContain("mod aster_adapter;");
    expect(turnContextConfigurationSource).toContain(
      "pub(crate) use aster_adapter::{to_agent_turn_context, to_aster_turn_context};",
    );
    expect(turnContextAsterAdapterSource).toContain(
      "aster::session::TurnContextOverride",
    );
    expect(turnContextAsterAdapterSource).toContain(
      "aster::session::TurnOutputSchemaSource",
    );
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
    const leaks =
      SESSION_EXECUTION_RUNTIME_FORBIDDEN_PRODUCTION_SNAPSHOT_SNIPPETS.filter(
        (snippet) => productionSource.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "session_execution_runtime production builder 只能接 Lime projection DTO；Aster snapshot / turn DTO 只能留在 adapter 或测试 fixture",
    ).toEqual([]);
  });

  it("session execution projection contract 必须归属 agent-runtime current owner", () => {
    const currentOwnerPath =
      "lime-rs/crates/agent-runtime/src/session_execution.rs";
    const runtimeBuilderPath =
      "lime-rs/crates/agent/src/session_execution_runtime.rs";
    const runtimeSnapshotAdapterPath =
      "lime-rs/crates/agent/src/runtime_snapshot_adapter.rs";
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const runtimeBuilderSource = readFileSync(
      join(REPO_ROOT, runtimeBuilderPath),
      "utf8",
    );
    const runtimeSnapshotAdapterSource = readFileSync(
      join(REPO_ROOT, runtimeSnapshotAdapterPath),
      "utf8",
    );

    expect(currentOwnerSource).toContain(
      "pub struct SessionExecutionRuntimeSessionProjection<Usage>",
    );
    expect(currentOwnerSource).toContain(
      "pub struct SessionExecutionRuntimeSnapshotProjection<Context>",
    );
    expect(currentOwnerSource).toContain(
      "pub struct SessionExecutionRuntimeTurnProjection<Context>",
    );
    expect(currentOwnerSource).toContain(
      "pub struct RuntimeTimelineSnapshotProjection<Turn, Item>",
    );
    expect(currentOwnerSource).toContain("pub enum SubagentRuntimeStatusKind");
    expect(currentOwnerSource).toContain(
      "pub struct SubagentRuntimeStatus<Usage>",
    );
    expect(currentOwnerSource).toContain(
      "pub struct SubagentLatestTurnProjection",
    );
    expect(currentOwnerSource).toContain("pub enum SubagentTurnStatus");
    expect(currentOwnerSource).toContain(
      "pub struct SessionRuntimeSnapshotOverlay<ExecutionSnapshot, TimelineSnapshot>",
    );
    expect(currentOwnerSource).toContain(
      "pub subagent_latest_turn: Option<SubagentLatestTurnProjection>",
    );
    expect(currentOwnerSource).not.toContain("aster::");
    expect(runtimeBuilderSource).toContain(
      "agent_runtime::session_execution::SessionExecutionRuntimeSessionProjection",
    );
    expect(runtimeBuilderSource).toContain(
      "agent_runtime::session_execution::SessionExecutionRuntimeSnapshotProjection",
    );
    expect(runtimeBuilderSource).not.toContain(
      "pub(crate) struct SessionExecutionRuntimeSessionProjection",
    );
    expect(runtimeBuilderSource).not.toContain(
      "pub(crate) struct SessionExecutionRuntimeSnapshotProjection",
    );
    expect(runtimeBuilderSource).not.toContain(
      "pub(crate) struct SessionExecutionRuntimeTurnProjection",
    );
    expect(runtimeSnapshotAdapterSource).toContain(
      "agent_runtime::session_execution::RuntimeTimelineSnapshotProjection",
    );
    expect(runtimeSnapshotAdapterSource).not.toContain(
      "pub(crate) struct RuntimeTimelineSnapshotProjection",
    );
  });

  it("session runtime detail 只能消费 current runtime snapshot overlay", () => {
    const filePath = "lime-rs/crates/agent/src/session_store_runtime_detail.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const forbiddenSnippets = [
      "use crate::runtime_snapshot_adapter::project_aster_runtime_snapshot",
      "project_aster_runtime_snapshot(",
      "project_aster_session_execution_runtime_snapshot",
      "load_runtime_snapshot(",
      "SessionRuntimeSnapshot",
    ];
    const leaks = forbiddenSnippets
      .filter((snippet) => source.includes(snippet))
      .map((snippet) => `${filePath}: ${snippet}`);

    expect(source).toContain("load_runtime_snapshot_overlay");
    expect(
      leaks,
      "session_store_runtime_detail 必须消费 runtime_support 投影后的 current overlay；Aster snapshot DTO 和投影函数只能留在 runtime_support / compat adapter",
    ).toEqual([]);
  });

  it("session_execution_runtime 不得恢复 public recent-state Aster extension 写入口", () => {
    const filePath = "lime-rs/crates/agent/src/session_execution_runtime.rs";
    const libPath = "lime-rs/crates/agent/src/lib.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const productionSource = source.split("#[cfg(test)]")[0] ?? source;
    const libSource = readFileSync(join(REPO_ROOT, libPath), "utf8");
    const leaks =
      SESSION_EXECUTION_RUNTIME_FORBIDDEN_PUBLIC_EXTENSION_WRITE_SNIPPETS.flatMap(
        (snippet) => {
          const paths = [];
          if (productionSource.includes(snippet)) {
            paths.push(`${filePath}: ${snippet}`);
          }
          if (libSource.includes(snippet)) {
            paths.push(`${libPath}: ${snippet}`);
          }
          return paths;
        },
      );

    expect(
      leaks,
      "recent access/preferences/team selection 只能作为 session execution read model 读取投影；不得恢复通过 lime_agent public API 写 Aster ExtensionData 的入口",
    ).toEqual([]);
  });

  it("subagent_control production 不得重新消费 Aster runtime snapshot / turn/item DTO", () => {
    const filePath = "lime-rs/crates/agent/src/subagent_control.rs";
    const currentOwnerPath =
      "lime-rs/crates/agent-runtime/src/session_execution.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const productionSource = source.split("#[cfg(test)]")[0] ?? source;
    const leaks =
      SUBAGENT_CONTROL_FORBIDDEN_PRODUCTION_RUNTIME_DTO_SNIPPETS.filter(
        (snippet) => productionSource.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);

    expect(currentOwnerSource).toContain(
      "pub struct SubagentLatestTurnProjection",
    );
    expect(currentOwnerSource).toContain("pub enum SubagentTurnStatus");
    expect(source).toContain("load_runtime_snapshot_overlay");
    expect(source).toContain(
      "agent_runtime::session_execution::SubagentRuntimeStatus<AgentTokenUsage>",
    );
    expect(source).toContain(
      "agent_runtime::session_execution::SubagentLatestTurnProjection",
    );
    expect(
      leaks,
      "subagent_control production 只能消费 Lime SubagentTurnStatus / SubagentLatestTurnProjection；Aster runtime snapshot / turn/item DTO 只能留在 adapter 边界",
    ).toEqual([]);
  });

  it("subagent_control 不得重新公开 Aster Session control wrapper", () => {
    const filePath = "lime-rs/crates/agent/src/subagent_control.rs";
    const libPath = "lime-rs/crates/agent/src/lib.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const libSource = readFileSync(join(REPO_ROOT, libPath), "utf8");
    const leaks =
      SUBAGENT_CONTROL_FORBIDDEN_PUBLIC_ASTER_SURFACE_SNIPPETS.flatMap(
        (snippet) => {
          const paths = [];
          if (source.includes(snippet)) {
            paths.push(`${filePath}: ${snippet}`);
          }
          if (libSource.includes(snippet)) {
            paths.push(`${libPath}: ${snippet}`);
          }
          return paths;
        },
      );

    expect(source).toContain(
      "pub(crate) async fn load_subagent_runtime_status",
    );
    expect(
      leaks,
      "subagent_control 只允许作为 lime-agent 内部 runtime status adapter；不得从根 API 公开返回 Aster Session 的 control state helper",
    ).toEqual([]);
  });

  it("session_store_subagent_context 不得重新引入 Aster runtime snapshot 测试 helper", () => {
    const filePath =
      "lime-rs/crates/agent/src/session_store_subagent_context.rs";
    const adapterPath =
      "lime-rs/crates/agent/src/session_store_subagent_aster_adapter.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const adapterSource = readFileSync(join(REPO_ROOT, adapterPath), "utf8");
    const leaks =
      SESSION_STORE_SUBAGENT_CONTEXT_FORBIDDEN_RUNTIME_DTO_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);
    const directAsterLeaks =
      SESSION_STORE_SUBAGENT_CONTEXT_FORBIDDEN_DIRECT_ASTER_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "session_store_subagent_context 的测试 helper 只能使用 Lime current turn projection；Aster runtime snapshot/turn DTO 只能留在 adapter 边界",
    ).toEqual([]);
    expect(adapterSource).toContain("project_aster_subagent_session");
    expect(adapterSource).toContain(
      "fn resolve_subagent_model_name(session: &AsterSession)",
    );
    expect(
      directAsterLeaks,
      "session_store_subagent_context 只能消费 Lime-owned SubagentSessionProjection；Aster Session metadata 解析必须局限在 session_store_subagent_aster_adapter",
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
