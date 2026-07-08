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

const DELETED_ASTER_VENDOR_PUBLIC_MODULES = [
  "aster_apps",
  "auto_reply",
  "background",
  "blueprint",
  "checkpoint",
  "chrome",
  "chrome_mcp",
  "codesign",
  "core",
  "diagnostics",
  "git",
  "github",
  "heartbeat",
  "logging",
  "lsp",
  "map",
  "memory",
  "notifications",
  "observability",
  "plugins",
  "prompt",
  "ratelimit",
  "recipe_deeplink",
  "rewind",
  "search",
  "telemetry",
  "teleport",
  "tracing",
  "updater",
];

const DELETED_ASTER_VENDOR_SESSION_PUBLIC_MODULES = ["cleanup", "statistics"];

const DELETED_ASTER_VENDOR_TASK_TOOL_FILES = [
  "lime-rs/vendor/aster-rust/crates/aster/src/tools/task_list_tools.rs",
  "lime-rs/vendor/aster-rust/crates/aster/src/tools/task_output_tool.rs",
  "lime-rs/vendor/aster-rust/crates/aster/src/tools/task_stop_tool.rs",
];

const RUNTIME_TOOL_BRIDGE_ADAPTER_FILES = [
  "lime-rs/crates/agent/src/native_tools/memory_store.rs",
  "lime-rs/crates/agent/src/native_tools/image_tasks.rs",
  "lime-rs/crates/agent/src/native_tools/sleep.rs",
  "lime-rs/crates/agent/src/native_tools/view_image.rs",
  "lime-rs/crates/agent/src/native_tools/update_plan.rs",
  "lime-rs/crates/agent/src/native_tools/web_retrieval.rs",
  "lime-rs/crates/agent/src/tools/apply_patch_tool.rs",
  "lime-rs/crates/agent/src/tools/skill_search_tool.rs",
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
  "lime-rs/crates/agent/src/session_store_provider_routing.rs",
  "lime-rs/crates/agent/src/session_record_sql.rs",
  "lime-rs/crates/agent/src/session_store_message_projection.rs",
  "lime-rs/crates/agent/src/session_store_runtime_projection.rs",
  "lime-rs/crates/agent/src/session_store_subagent_projection.rs",
  "lime-rs/crates/agent/src/session_store_subagent_query.rs",
  "lime-rs/crates/thread-store/src/task_board.rs",
  "lime-rs/crates/agent/src/session_execution_runtime_query.rs",
  "lime-rs/crates/agent/src/session_configuration.rs",
  "lime-rs/crates/agent/src/session_usage_projection.rs",
  "lime-rs/crates/agent-runtime/src/runtime_conversation.rs",
  "lime-rs/crates/agent/src/tool_io_offload.rs",
  "lime-rs/crates/agent/src/turn_input_envelope.rs",
  "lime-rs/crates/agent-runtime/src/runtime_queue.rs",
  "lime-rs/crates/agent-runtime/src/runtime_timeline.rs",
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
  "lime-rs/crates/tool-runtime/src/native_dispatch.rs",
  "lime-rs/crates/tool-runtime/src/apply_patch.rs",
  "lime-rs/crates/tool-runtime/src/skill_search.rs",
  "lime-rs/crates/tool-runtime/src/update_plan.rs",
  "lime-rs/crates/tool-runtime/src/image_task.rs",
  "lime-rs/crates/tool-runtime/src/image_task/definition.rs",
  "lime-rs/crates/tool-runtime/src/image_task/executor.rs",
  "lime-rs/crates/tool-runtime/src/image_task/params.rs",
  "lime-rs/crates/tool-runtime/src/memory_store.rs",
  "lime-rs/crates/tool-runtime/src/memory_store/definitions.rs",
  "lime-rs/crates/tool-runtime/src/memory_store/executor.rs",
  "lime-rs/crates/tool-runtime/src/memory_store/params.rs",
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

const SESSION_EXECUTION_RUNTIME_ADAPTER_FORBIDDEN_CURRENT_RULE_SNIPPETS = [
  "use serde::de::DeserializeOwned",
  "fn read_session_runtime_extension_state",
  "serde_json::from_value",
  "SessionExecutionRuntimeRecentTeamSelection::normalize",
  "fn project_aster_session_usage",
  "session_usage_projection::project_token_usage(",
  "fn resolve_latest_aster_turn",
  "fn project_aster_execution_runtime_turn",
  "fn project_recent_access_mode_from_aster_snapshot",
  "fn project_recent_harness_context_from_aster_snapshot",
  "fn recent_harness_context_is_complete",
  "fn recent_harness_context_is_empty",
  "extract_recent_access_mode_from_metadata",
  "extract_recent_harness_context_from_metadata",
  ".max_by(|left, right|",
  ".max_by_key(|(updated_at",
];

const SUBAGENT_CONTROL_FORBIDDEN_PRODUCTION_RUNTIME_DTO_SNIPPETS = [
  "load_runtime_snapshot(",
  "project_aster_subagent_latest_turn",
  "require_shared_session_runtime_queue_service",
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

const SESSION_STORE_SUBAGENT_ADAPTER_FORBIDDEN_METADATA_RULE_SNIPPETS = [
  "resolve_subagent_session_metadata",
  "subagent_customization_from_session",
  "SubagentPresentationProjection {",
  "normalize_optional_nonempty_body",
  "SubagentCustomizationState",
  "query_child_subagent_sessions",
  "query_session",
  "read_subagent_session_projection",
  "read_session_name_projection",
  "load_child_subagent_session_projections",
];

const SESSION_STORE_FORBIDDEN_ASTER_PROVIDER_ROUTING_SNIPPETS = [
  "ExtensionState",
  "SessionProviderRoutingState",
  "AsterSession",
  "use aster::session",
  "from_extension_data(&session.extension_data)",
];

const SESSION_STORE_RUNTIME_DETAIL_FORBIDDEN_PROVIDER_ROUTING_SNIPPETS = [
  "resolve_session_provider_selector",
  "from_extension_data",
  "session.extension_data",
];

const SESSION_STORE_RUNTIME_DETAIL_FORBIDDEN_SESSION_ADAPTER_SNIPPETS = [
  "project_aster_session_execution_runtime_session",
  "project_aster_subagent_session",
];

const SESSION_EXECUTION_RUNTIME_QUERY_FORBIDDEN_ASTER_SNIPPETS = [
  "use aster::",
  "aster::",
  "Session as AsterSession",
  "ExtensionData",
  "get_extension_state",
];

const SESSION_STORE_RUNTIME_DETAIL_FORBIDDEN_CONVERSATION_SNIPPETS = [
  "read_session(",
  "project_aster_runtime_conversation_window",
  "project_aster_message",
  "conversation.messages()",
  ".messages()",
  "is_user_visible()",
  "&aster::session::Session",
  "aster::conversation",
];

const SUBAGENT_RUNTIME_ADAPTER_FORBIDDEN_CURRENT_RULE_SNIPPETS = [
  "fn resolve_aster_turn_duration_ms",
  "fn count_aster_tool_items_for_turn",
  "fn build_runtime_item_ref",
  "fn resolve_aster_worker_result_ref",
  "SubagentRuntimeItemKind::ToolCall",
  "SubagentRuntimeItemKind::AgentMessage",
  "SubagentRuntimeItemKind::Other",
  ".max_by(|left, right|",
  "signed_duration_since",
];

const RUNTIME_QUEUE_FORBIDDEN_PRODUCTION_ASTER_QUEUE_SNIPPETS = [
  "use aster::session",
  "require_shared_session_runtime_queue_service",
  "SessionRuntimeQueueService",
  "QueuedTurnRuntime",
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
  "pub struct RuntimeReplyProviderStreamStart",
  "pub struct RuntimeReplyProviderStreamTrace",
  "RuntimeProviderBackend::AsterCompat",
];

const CONFIGURED_REPLY_PROVIDER_REQUIRED_CURRENT_HANDLE_SNIPPETS = [
  "RuntimeReplyProviderHandle",
  "RuntimeReplyProviderCapabilities",
  "RuntimeReplyProviderCall",
  "RuntimeProviderBackend::AsterCompat",
  "backend: CompatAsterReplyProviderBackend",
  "struct CompatAsterReplyProviderBackend",
  "pub(crate) fn runtime_handle(&self) -> &RuntimeReplyProviderHandle",
  "provider_call: RuntimeReplyProviderCall<Message, aster::agents::SessionConfig>",
  "provider_call.trace()",
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
  "mod subagent_profiles_aster_adapter;",
  "subagent_profiles_aster_adapter",
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

const ASTER_SESSION_PROJECTION_FORBIDDEN_ROW_SQL_SNIPPETS = [
  "fn map_session_listing_row",
  "fn load_listed_sessions",
  "query_map(",
  "row.get(",
];

const ASTER_SESSION_TRAIT_FORBIDDEN_RECORD_PROJECTION_SNIPPETS = [
  "resolve_session_type_name",
  "parse_optional_json(",
  "system_prompt",
  "SESSION_RECORD_SELECT_COLUMNS",
  "FROM agent_sessions",
  'format!("SELECT',
  ".prepare(&sql)",
  ".query_row(",
  "map_session_record_row",
  "query_row([id], |row|",
  "row.get::<_, String>",
];

const ASTER_SESSION_TRAIT_FORBIDDEN_DIRECT_RECORD_SQL_SNIPPETS = [
  "conn.execute(",
  "DELETE FROM agent_sessions",
  "UPDATE agent_sessions SET updated_at",
];

const ASTER_SESSION_TRAIT_FORBIDDEN_RETIRED_BULK_METHOD_SNIPPETS = [
  "async fn export_session",
  "async fn import_session",
  "async fn copy_session",
  "async fn truncate_conversation",
  "export_session 已退役",
  "import_session 已退役",
  "copy_session 已退役",
  "truncate_conversation 已退役",
  "serde_json::to_string_pretty(&session)",
  "serde_json::from_str(json)",
  "self.create_session(\n                session.working_dir.clone()",
  "self.get_session(session_id, true)",
  "truncate_runtime_conversation",
];

const ASTER_SESSION_STORE_FORBIDDEN_DIRECT_RECORD_HELPERS = [
  "conn.execute(",
  "INSERT INTO agent_sessions",
  "SELECT 1 FROM agent_sessions",
  "SELECT working_dir FROM agent_sessions",
  "SELECT extension_data_json FROM agent_sessions",
  "WorkspaceManager::get_default_root_path_from_conn",
  "resolve_default_project_dir",
  "fn resolve_session_working_dir",
  "fn normalize_working_dir",
];

const THREAD_SESSION_REPOSITORY_FORBIDDEN_DIRECT_METADATA_SQL_SNIPPETS = [
  "conn.execute(",
  "UPDATE agent_sessions SET title",
  "UPDATE agent_sessions SET user_set_name",
  "UPDATE agent_sessions SET working_dir",
  "UPDATE agent_sessions SET extension_data_json",
  "DELETE FROM agent_sessions",
];

const THREAD_SESSION_REPOSITORY_FORBIDDEN_DIRECT_READ_ROW_SNIPPETS = [
  "SESSION_RECORD_SELECT_COLUMNS",
  "map_session_record_row",
  'format!("SELECT',
  ".prepare(&sql)",
  ".query_row(",
  ".query_map(",
  "filter_map(|r| r.ok())",
];

const SESSION_RECORD_SQL_FORBIDDEN_SILENT_ROW_ERROR_SNIPPETS = [
  "filter_map(|row| row.ok())",
  "filter_map(|r| r.ok())",
];

const ASTER_SESSION_TRAIT_FORBIDDEN_INSIGHTS_SQL_SNIPPETS = [
  "SELECT COUNT(*) FROM agent_sessions",
  "SUM(COALESCE(accumulated_total_tokens, total_tokens, 0))",
  "total_sessions as usize",
];

const ASTER_SESSION_TRAIT_FORBIDDEN_TOKEN_STATS_SQL_SNIPPETS = [
  "UPDATE agent_sessions SET\n                total_tokens = COALESCE",
  "schedule_id = COALESCE(?9, schedule_id)",
  "当前 store 边界把 None 视为",
  "rusqlite::params![\n                stats.total_tokens",
];

const ASTER_SESSION_TRAIT_FORBIDDEN_PROVIDER_CONFIG_SQL_SNIPPETS = [
  "provider_name = COALESCE(?1, provider_name)",
  "model_config_json = CASE WHEN ?3 IS NULL THEN model_config_json ELSE ?3 END",
  "provider/model_config 走",
  "normalize_optional_text(provider_name",
  "config.model_name.trim().to_string()",
];

const ASTER_SESSION_TRAIT_FORBIDDEN_METADATA_SQL_SNIPPETS = [
  "UPDATE agent_sessions SET title",
  "user_set_name = ?2",
  "UPDATE agent_sessions SET working_dir",
  "UPDATE agent_sessions SET session_type",
  "rusqlite::params![name",
  "rusqlite::params![working_dir.to_string_lossy",
  "rusqlite::params![session_type.to_string",
];

const ASTER_SESSION_TRAIT_FORBIDDEN_EXTENSION_DATA_SQL_SNIPPETS = [
  "UPDATE agent_sessions SET extension_data_json",
  "extension_data_json = ?1",
  "rusqlite::params![extension_data_json",
];

const ASTER_SESSION_TRAIT_FORBIDDEN_RECIPE_SQL_SNIPPETS = [
  "recipe_json = ?1",
  "user_recipe_values_json = ?2",
  "recipe 走“直接覆盖”语义",
  "rusqlite::params![recipe_json",
];

const ASTER_RUNTIME_CONVERSATION_FORBIDDEN_TRANSCRIPT_HELPERS = [
  "fn transcript_item_id",
  "let mut transcript_count",
  "let mut projection_count",
  "let mut transcript_messages",
  "let mut projection_messages",
  "ConversationMessageRecord::transcript",
  "ConversationMessageRecord::runtime_projection",
];

const ASTER_HISTORY_SEARCH_FORBIDDEN_CURRENT_RULE_SNIPPETS = [
  "fn runtime_message_role",
  "let normalized_query = normalized_query.to_ascii_lowercase()",
  ".to_ascii_lowercase().contains",
  "relevance_score: 1.0",
  "unwrap_or(session.updated_at)",
];

const SESSION_TODO_ASTER_ADAPTER_FORBIDDEN_CURRENT_RULE_SNIPPETS = [
  "SessionTaskBoardItemProjection",
  "SessionTaskBoardStatusProjection",
  "fn map_session_todo_status",
  "fn map_session_todo_item",
  "normalize_optional_nonempty_body",
  "subject.trim().to_string()",
  "content.trim().is_empty()",
];

const ASTER_LEGACY_CONVERSATION_FORBIDDEN_CURRENT_RULE_SNIPPETS = [
  "struct PersistedConversationMessageRecord",
  "persisted_visibility_default_true",
  'serde(default = "persisted_visibility_default_true")',
  "serde_json::from_str::<PersistedConversationMessageRecord>",
  "let content: Vec<MessageContent> = serde_json::from_str",
  'role == "assistant"',
  "user_visible: true",
  "agent_visible: true",
];

const RUNTIME_CONVERSATION_CALLSITE_FORBIDDEN_ASTER_PAYLOAD_SNIPPETS = [
  "ItemRuntimePayload::TranscriptMessage",
  "ItemRuntimePayload::UserMessage",
  "ItemRuntimePayload::AgentMessage",
  "RuntimeConversationItemSource::TranscriptMessage",
  "RuntimeConversationItemSource::UserMessage",
  "RuntimeConversationItemSource::AgentMessage",
  "project_runtime_conversation_record",
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

const RUNTIME_SNAPSHOT_ADAPTER_FORBIDDEN_TIMELINE_RULE_SNIPPETS = [
  "project_runtime_timeline_snapshot(",
  "RuntimeTimelineSnapshotSource",
  "RuntimeTimelineSnapshotThread",
  "convert_aster_turn_runtime",
  "convert_aster_item_runtime",
  ".first()",
  ".flat_map(|thread|",
];

const RUNTIME_TIMELINE_ADAPTER_FORBIDDEN_DAO_STATUS_SNIPPETS = [
  "AgentThreadTurnStatus",
  "AgentThreadItemStatus",
  "AgentThreadItemPayload",
  "AgentRequestOption",
  "AgentRequestQuestion",
];

const RUNTIME_TIMELINE_ADAPTER_FORBIDDEN_CURRENT_STATUS_RULE_SNIPPETS = [
  "fn format_runtime_status_text",
  "normalize_legacy_runtime_status_title",
  "normalize_legacy_turn_summary_text",
  "build_diagnostics_runtime_status_metadata",
  '"runtimeStatus".to_string()',
];

const RUNTIME_TIMELINE_ADAPTER_FORBIDDEN_CURRENT_PAYLOAD_RULE_SNIPPETS = [
  "extract_runtime_request_questions_from_schema",
  "RUNTIME_REQUEST_QUESTIONS_SCHEMA_KEY",
  "RuntimeStatusTimelineSource",
  "project_runtime_status_timeline_payload",
  "RuntimeTimelineItemPayload::UserMessage",
  "RuntimeTimelineItemPayload::AgentMessage",
  "RuntimeTimelineItemPayload::Plan",
  "RuntimeTimelineItemPayload::FileArtifact",
  "RuntimeTimelineItemPayload::Reasoning",
  "RuntimeTimelineItemPayload::ToolCall",
  "RuntimeTimelineItemPayload::ApprovalRequest",
  "RuntimeTimelineItemPayload::RequestUserInput",
  "RuntimeTimelineItemPayload::TurnSummary",
  "phase: None",
];

const RUNTIME_TIMELINE_ADAPTER_FORBIDDEN_CURRENT_PROJECTION_RULE_SNIPPETS = [
  "RuntimeTimelineTurnProjection {\n        id:",
  "RuntimeTimelineItemProjection {\n        id:",
  "RuntimeTimelineTurnStatus::",
  "RuntimeTimelineItemStatus::",
  "unwrap_or_default()",
  "unwrap_or_else",
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

  it("已删除的 Aster vendor public modules 不得恢复", () => {
    const vendorSrcRoot = join(
      REPO_ROOT,
      "lime-rs/vendor/aster-rust/crates/aster/src",
    );
    const vendorLibSource = readFileSync(join(vendorSrcRoot, "lib.rs"), "utf8");

    const restoredModuleDirs = DELETED_ASTER_VENDOR_PUBLIC_MODULES.filter(
      (moduleName) => existsSync(join(vendorSrcRoot, moduleName)),
    );
    const restoredLibExports = DELETED_ASTER_VENDOR_PUBLIC_MODULES.filter(
      (moduleName) => vendorLibSource.includes(`pub mod ${moduleName};`),
    );

    expect(
      restoredModuleDirs,
      "这些 Aster vendor public modules 已无 Lime current 消费，按 dead / deleted 处理，不得恢复目录",
    ).toEqual([]);
    expect(
      restoredLibExports,
      "这些 Aster vendor public modules 不得重新从 aster-core lib.rs 导出",
    ).toEqual([]);
  });

  it("已删除的 Aster vendor session public wrappers 不得恢复", () => {
    const sessionRoot = join(
      REPO_ROOT,
      "lime-rs/vendor/aster-rust/crates/aster/src/session",
    );
    const sessionModSource = readFileSync(join(sessionRoot, "mod.rs"), "utf8");

    const restoredFiles = DELETED_ASTER_VENDOR_SESSION_PUBLIC_MODULES.filter(
      (moduleName) => existsSync(join(sessionRoot, `${moduleName}.rs`)),
    );
    const restoredMods = DELETED_ASTER_VENDOR_SESSION_PUBLIC_MODULES.filter(
      (moduleName) =>
        sessionModSource.includes(`mod ${moduleName};`) ||
        sessionModSource.includes(`pub mod ${moduleName};`),
    );
    const restoredExports = [
      "cleanup_expired_data",
      "force_cleanup",
      "schedule_cleanup",
      "CleanupStats",
      "calculate_statistics",
      "generate_report",
      "get_all_statistics",
      "SessionStatistics",
      "SessionSummary",
    ].filter((snippet) => sessionModSource.includes(snippet));

    expect(
      restoredFiles,
      "Aster session cleanup/statistics 是无 Lime current 消费的旧 public wrapper，已按 dead 删除，不得恢复文件",
    ).toEqual([]);
    expect(
      restoredMods,
      "Aster session cleanup/statistics 不得重新挂回 session/mod.rs",
    ).toEqual([]);
    expect(
      restoredExports,
      "Aster session cleanup/statistics 的旧 public API 不得重新导出；统计/清理能力必须进入 Lime current owner",
    ).toEqual([]);
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
    const asterReplyBackendAdapterPath =
      "lime-rs/crates/agent/src/request_tool_policy/aster_reply_backend_adapter.rs";
    const agentRuntimeReplyBackendPath =
      "lime-rs/crates/agent-runtime/src/reply_backend.rs";
    const agentReplyStreamPath =
      "lime-rs/crates/agent/src/request_tool_policy/agent_reply_stream.rs";
    const agentProtocolPath = "lime-rs/crates/agent/src/protocol.rs";
    const appServerToolEventsPath =
      "lime-rs/crates/app-server/src/runtime_backend/tool_events.rs";
    const frontendAgentProtocolPath = "src/lib/api/agentProtocol.ts";
    const frontendAgentProtocolEventTypesPath =
      "src/lib/api/agentProtocolEventTypes.ts";
    const frontendAgentProtocolParserUtilsPath =
      "src/lib/api/agentProtocolParserUtils.ts";
    const frontendAppServerEventStreamPath =
      "src/lib/api/agentRuntime/appServerEventStream.ts";
    const frontendAppServerEventPayloadProjectionPath =
      "src/lib/api/agentRuntime/appServerEventPayloadProjection.ts";
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
    const asterReplyBackendAdapterSource = readFileSync(
      join(REPO_ROOT, asterReplyBackendAdapterPath),
      "utf8",
    );
    const agentRuntimeReplyBackendSource = readFileSync(
      join(REPO_ROOT, agentRuntimeReplyBackendPath),
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
    const frontendAgentProtocolSource = [
      frontendAgentProtocolPath,
      frontendAgentProtocolEventTypesPath,
      frontendAgentProtocolParserUtilsPath,
    ]
      .map((filePath) => readFileSync(join(REPO_ROOT, filePath), "utf8"))
      .join("\n");
    const frontendAppServerEventStreamSource = [
      frontendAppServerEventStreamPath,
      frontendAppServerEventPayloadProjectionPath,
    ]
      .map((filePath) => readFileSync(join(REPO_ROOT, filePath), "utf8"))
      .join("\n");
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
    const configuredReplyProviderStreamBody =
      runtimeProviderAdapterSource.slice(
        runtimeProviderAdapterSource.indexOf(
          "pub(crate) async fn stream_reply_with_agent",
        ),
        runtimeProviderAdapterSource.indexOf(
          "pub(crate) async fn create_configured_reply_provider",
        ),
      );
    expect(configuredReplyProviderStreamBody).toContain(
      "self.backend.stream_reply_with_agent(agent, provider_call).await",
    );
    expect(configuredReplyProviderStreamBody).not.toContain(
      "provider_call.into_parts()",
    );
    const compatProviderBackendImpl = runtimeProviderAdapterSource.slice(
      runtimeProviderAdapterSource.indexOf(
        "impl CompatAsterReplyProviderBackend",
      ),
      runtimeProviderAdapterSource.indexOf("fn build_provider_model_config"),
    );
    expect(compatProviderBackendImpl).toContain(
      "provider_call: RuntimeReplyProviderCall<Message, aster::agents::SessionConfig>",
    );
    expect(compatProviderBackendImpl).toContain(
      "let (_, user_message, session_config, cancel_token) = provider_call.into_parts();",
    );
    expect(compatProviderBackendImpl).not.toContain("user_message: Message,");
    expect(compatProviderBackendImpl).not.toContain(
      "session_config: aster::agents::SessionConfig,",
    );
    expect(compatProviderBackendImpl).not.toContain(
      "cancel_token: Option<CancellationToken>,",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "RuntimeReplyStreamRequest",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "RuntimeReplyStreamRequest",
    );
    expect(asterReplyBackendAdapterSource).toContain(
      ".stream_reply_with_agent(",
    );
    expect(asterReplyAdapterSource).not.toContain("RuntimeReplyStreamRequest");
    expect(asterReplyAdapterSource).not.toContain(".stream_reply_with_agent(");
    expect(providerStreamSource).toContain(
      "pub struct RuntimeReplyProviderStreamStart",
    );
    expect(providerStreamSource).toContain(
      "pub struct RuntimeReplyProviderStreamTrace",
    );
    expect(providerStreamSource).toContain("pub fn trace(&self)");
    expect(providerStreamSource).toContain(
      "pub fn stream_request(&self) -> &RuntimeReplyStreamRequest",
    );
    expect(runtimeProviderAdapterSource).toContain("RuntimeReplyProviderCall");
    expect(runtimeProviderAdapterSource).toContain("provider_call.trace()");
    expect(runtimeProviderAdapterSource).not.toContain(
      "provider_start: &RuntimeReplyProviderStreamStart",
    );
    expect(runtimeProviderAdapterSource).not.toContain(
      "provider_start.trace()",
    );
    expect(runtimeProviderAdapterSource).not.toContain(
      "let stream_request = provider_start.stream_request()",
    );
    expect(runtimeProviderAdapterSource).not.toContain(
      "stream_request.provider_backend()",
    );
    expect(runtimeProviderAdapterSource).not.toContain(
      "stream_request.provider_name()",
    );
    expect(runtimeProviderAdapterSource).not.toContain(
      "stream_request.model_name()",
    );
    expect(runtimeProviderAdapterSource).not.toContain(
      "debug_assert_eq!(stream_request.provider.as_ref()",
    );
    expect(asterReplyBackendAdapterSource).toContain(
      "fn provider_handle(&self)",
    );
    expect(agentReplyStreamSource).toContain(
      "enrich_provider_trace_with_runtime_provider",
    );
    expect(agentReplyStreamSource).toContain("reply_backend.provider_handle()");
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
    const asterReplyBackendAdapterPath =
      "lime-rs/crates/agent/src/request_tool_policy/aster_reply_backend_adapter.rs";
    const asterReplyMessageAdapterPath =
      "lime-rs/crates/agent/src/request_tool_policy/aster_reply_message_adapter.rs";
    const asterReplyStreamAdapterPath =
      "lime-rs/crates/agent/src/request_tool_policy/aster_reply_stream_adapter.rs";
    const asterEventAdapterPath =
      "lime-rs/crates/agent/src/request_tool_policy/aster_event_adapter.rs";
    const webSearchPreflightPath =
      "lime-rs/crates/agent/src/request_tool_policy/web_search_preflight.rs";
    const streamIdlePath =
      "lime-rs/crates/agent/src/request_tool_policy/stream_idle.rs";
    const agentRuntimeLibPath = "lime-rs/crates/agent-runtime/src/lib.rs";
    const agentRuntimeReplyInputPath =
      "lime-rs/crates/agent-runtime/src/reply_input.rs";
    const agentRuntimeReplyMessagePath =
      "lime-rs/crates/agent-runtime/src/reply_message.rs";
    const agentRuntimeReplyRequestPath =
      "lime-rs/crates/agent-runtime/src/reply_request.rs";
    const agentRuntimeReplyBackendPath =
      "lime-rs/crates/agent-runtime/src/reply_backend.rs";
    const agentRuntimeReplyHostPath =
      "lime-rs/crates/agent-runtime/src/reply_host.rs";
    const agentRuntimeReplySessionPath =
      "lime-rs/crates/agent-runtime/src/reply_session.rs";
    const agentRuntimeReplyExecutionPath =
      "lime-rs/crates/agent-runtime/src/reply_execution.rs";
    const agentRuntimeReplyStreamPath =
      "lime-rs/crates/agent-runtime/src/reply_stream.rs";
    const agentRuntimeEventStreamPath =
      "lime-rs/crates/agent-runtime/src/event_stream.rs";
    const modelProviderStreamPath =
      "lime-rs/crates/model-provider/src/provider_stream.rs";
    const mainSource = readFileSync(join(REPO_ROOT, mainPath), "utf8");
    const mainProductionSource = mainSource.split(
      "\n#[cfg(test)]\nmod tests",
    )[0];
    const adapterSource = readFileSync(join(REPO_ROOT, adapterPath), "utf8");
    const asterReplyAdapterSource = readFileSync(
      join(REPO_ROOT, asterReplyAdapterPath),
      "utf8",
    );
    const asterReplyBackendAdapterSource = readFileSync(
      join(REPO_ROOT, asterReplyBackendAdapterPath),
      "utf8",
    );
    const asterReplyMessageAdapterSource = readFileSync(
      join(REPO_ROOT, asterReplyMessageAdapterPath),
      "utf8",
    );
    const asterReplyStreamAdapterSource = readFileSync(
      join(REPO_ROOT, asterReplyStreamAdapterPath),
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
    const streamIdleSource = readFileSync(
      join(REPO_ROOT, streamIdlePath),
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
    const agentRuntimeReplyMessageSource = readFileSync(
      join(REPO_ROOT, agentRuntimeReplyMessagePath),
      "utf8",
    );
    const agentRuntimeReplyRequestSource = readFileSync(
      join(REPO_ROOT, agentRuntimeReplyRequestPath),
      "utf8",
    );
    const agentRuntimeReplyBackendSource = readFileSync(
      join(REPO_ROOT, agentRuntimeReplyBackendPath),
      "utf8",
    );
    const agentRuntimeReplyHostSource = readFileSync(
      join(REPO_ROOT, agentRuntimeReplyHostPath),
      "utf8",
    );
    const agentRuntimeReplySessionSource = readFileSync(
      join(REPO_ROOT, agentRuntimeReplySessionPath),
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
    const agentRuntimeEventStreamSource = readFileSync(
      join(REPO_ROOT, agentRuntimeEventStreamPath),
      "utf8",
    );
    const modelProviderStreamSource = readFileSync(
      join(REPO_ROOT, modelProviderStreamPath),
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
    expect(mainSource).toContain("mod aster_reply_backend_adapter;");
    expect(mainSource).toContain("mod aster_reply_message_adapter;");
    expect(mainSource).toContain("mod aster_reply_stream_adapter;");
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
    expect(mainSource).toContain("RuntimeReplyAttemptState");
    expect(mainProductionSource).toContain("RuntimeReplyAttemptState::new()");
    expect(mainProductionSource).toContain("attempt_state.into_execution(");
    expect(mainProductionSource).toContain("attempt_state.error(");
    expect(mainProductionSource).not.toContain("let mut emitted_any = false");
    expect(mainProductionSource).not.toContain("text_chunks: Vec");
    expect(mainProductionSource).not.toContain("event_errors: Vec");
    expect(mainProductionSource).not.toContain(
      "fn build_stream_reply_execution",
    );
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
      "agent_runtime::reply_stream::{\n    RuntimeReplyStreamEvent, RuntimeReplyStreamIdleTimeout, RuntimeReplyStreamState,\n}",
    );
    expect(adapterSource).toContain(
      "agent_runtime::reply_request::RuntimeReplyRequest",
    );
    expect(adapterSource).toContain("RuntimeReplyRequest::from_attempt_input");
    expect(adapterSource).toContain(
      "agent_runtime::reply_backend::RuntimeReplyBackend",
    );
    expect(adapterSource).toContain(
      "agent_runtime::reply_execution::RuntimeReplyAttemptState",
    );
    expect(adapterSource).toContain(
      "attempt_state: &mut RuntimeReplyAttemptState",
    );
    expect(adapterSource).toContain("attempt_state.push_text");
    expect(adapterSource).toContain("attempt_state.push_error");
    expect(adapterSource).toContain("attempt_state.error(");
    expect(adapterSource).toContain("map_err(ReplyAttemptError::from)");
    expect(adapterSource).not.toContain("let mut emitted_any = false");
    expect(adapterSource).not.toContain("text_chunks: Vec");
    expect(adapterSource).not.toContain("event_errors: Vec");
    expect(adapterSource).not.toContain("fn reply_attempt_error_from_runtime");
    expect(adapterSource).toContain("RuntimeReplyStreamState::new()");
    expect(adapterSource).toContain("RuntimeReplyStreamIdleTimeout::new");
    expect(adapterSource).toContain("stream_state.next_timeout");
    expect(adapterSource).toContain("stream_state.mark_stream_event_seen");
    expect(adapterSource).toContain(
      "stream_state.capture_inline_provider_error",
    );
    expect(adapterSource).toContain("stream_state.take_inline_provider_error");
    expect(adapterSource).not.toContain(
      "const MIN_PROVIDER_STREAM_FIRST_EVENT_TIMEOUT",
    );
    expect(adapterSource).not.toContain("fn provider_stream_next_timeout");
    expect(streamIdleSource).not.toContain(
      "fn provider_stream_idle_timeout_message",
    );
    expect(streamIdleSource).not.toContain(
      "Agent provider execution failed: stream idle timeout",
    );
    expect(adapterSource).not.toContain("let mut inline_provider_error = None");
    expect(adapterSource).toContain("let reply_backend = host.reply_backend()");
    expect(adapterSource).toContain("agent_runtime::reply_host::{");
    expect(adapterSource).toContain("RuntimeReplyStartRequest");
    expect(adapterSource).toContain("RuntimeReplyStartRequest::new");
    expect(adapterSource).toContain(
      "runtime_reply_model_request_policy_from_turn_context",
    );
    expect(adapterSource).toContain("validate_reply_request_modalities");
    expect(adapterSource).toContain("idle_cancel_token");
    expect(adapterSource).toContain(
      "let start_result = reply_backend.start_reply_stream(start_request).await;",
    );
    expect(adapterSource).toContain(
      "tokio::time::timeout(timeout, stream.next())",
    );
    expect(adapterSource).not.toContain(
      "tokio::time::timeout(timeout, reply_backend.start_reply_stream(start_request))",
    );
    expect(adapterSource).not.toContain(
      "host.start_reply_stream(start_request)",
    );
    expect(adapterSource).not.toContain(
      "let (mut stream, message_chars) = host\n        .start_reply_stream(start_request)\n        .await",
    );
    expect(adapterSource).toContain("input_modality_policy_from_turn_context");
    expect(adapterSource).toContain("input_modality_policy_allows_image_input");
    expect(adapterSource).toContain("RuntimeReplyStreamEvent");
    expect(adapterSource.includes("ConfiguredReplyProvider")).toBe(false);
    expect(agentRuntimeLibSource).toContain("pub mod reply_input;");
    expect(agentRuntimeLibSource).toContain("pub mod reply_message;");
    expect(agentRuntimeLibSource).toContain("pub mod reply_request;");
    expect(agentRuntimeLibSource).toContain("pub mod reply_backend;");
    expect(agentRuntimeLibSource).toContain("pub mod reply_host;");
    expect(agentRuntimeLibSource).toContain("pub mod reply_session;");
    expect(agentRuntimeLibSource).toContain("pub mod reply_execution;");
    expect(agentRuntimeLibSource).toContain("pub mod reply_stream;");
    expect(agentRuntimeLibSource).toContain("pub mod event_stream;");
    expect(agentRuntimeReplyHostSource).toContain(
      "pub trait RuntimeReplyStreamHost<E>",
    );
    expect(agentRuntimeReplyHostSource).toContain(
      "type Backend: RuntimeReplyBackend<E>",
    );
    expect(agentRuntimeReplyHostSource).toContain("fn reply_backend(&self)");
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
    expect(agentRuntimeReplyHostSource).toContain(
      "from_provider_wire_support_issue",
    );
    expect(agentRuntimeReplyHostSource).toContain(
      "pub struct RuntimeReplyStartRequest",
    );
    expect(agentRuntimeReplyHostSource).toContain(
      "pub request: RuntimeReplyRequest",
    );
    expect(agentRuntimeReplyHostSource).toContain(
      "pub session_config: AgentSessionConfig",
    );
    expect(agentRuntimeReplyHostSource).toContain(
      "pub cancel_token: Option<CancellationToken>",
    );
    expect(agentRuntimeReplyHostSource).toContain("pub emitted_any: bool");
    expect(agentRuntimeReplyHostSource).toContain("RuntimeReplyRequest");
    expect(agentRuntimeReplyHostSource).not.toContain(
      "RuntimeReplyAttemptInput",
    );
    expect(agentRuntimeReplyHostSource).toContain("AgentSessionConfig");
    expect(
      FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
        agentRuntimeReplyHostSource.includes(snippet),
      ),
      "agent-runtime reply_host contract 不得引入 Aster 类型",
    ).toEqual([]);
    expect(agentRuntimeReplyBackendSource).toContain(
      "pub trait RuntimeReplyBackend<E>",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "pub struct RuntimeReplyBackendStart",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "pub struct RuntimeReplySessionPreparation",
    );
    expect(agentRuntimeReplyBackendSource).toContain("from_start_request");
    expect(agentRuntimeReplyBackendSource).toContain("session_config(&self)");
    expect(agentRuntimeReplyBackendSource).toContain(
      "provider_wire_support_start_error",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "pub fn provider_stream_start",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "pub fn prepare_session_metadata",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "attach_reply_disallowed_tools",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "attach_reply_provider_wire_shape",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "provider_request_wire_support_issue",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "RuntimeReplyStartError::from_provider_wire_support_issue",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "RuntimeReplyProviderStreamStart::new",
    );
    expect(agentRuntimeReplyBackendSource).toContain("fn uses_pinned_provider");
    expect(agentRuntimeReplyBackendSource).toContain("fn provider_handle");
    expect(agentRuntimeReplyBackendSource).toContain("fn start_reply_stream");
    expect(agentRuntimeReplyBackendSource).toContain(
      "RuntimeReplyStartRequest",
    );
    expect(agentRuntimeReplyBackendSource).toContain("RuntimeReplyStartResult");
    expect(
      FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
        agentRuntimeReplyBackendSource.includes(snippet),
      ),
      "agent-runtime reply_backend contract 不得引入 Aster Agent / provider trait / AgentEvent 类型",
    ).toEqual([]);
    expect(agentRuntimeReplySessionSource).toContain(
      "pub fn attach_reply_disallowed_tools",
    );
    expect(agentRuntimeReplySessionSource).toContain(
      "pub fn attach_reply_provider_wire_shape",
    );
    expect(agentRuntimeReplySessionSource).toContain(
      "pub const TOOL_SCOPE_METADATA_KEY",
    );
    expect(agentRuntimeReplySessionSource).toContain(
      "pub const DISALLOWED_TOOLS_METADATA_KEY",
    );
    expect(agentRuntimeReplySessionSource).toContain(
      "RuntimeReplyProviderRequestWireShape",
    );
    expect(agentRuntimeReplySessionSource).not.toContain("aster::");
    expect(modelProviderStreamSource).toContain(
      "pub struct RuntimeReplyProviderWireSupportIssue",
    );
    expect(modelProviderStreamSource).toContain(
      "pub struct RuntimeReplyProviderStreamStart",
    );
    expect(modelProviderStreamSource).toContain(
      "pub struct RuntimeReplyProviderStartError",
    );
    expect(modelProviderStreamSource).toContain(
      "pub const NOTIFICATION_KIND_SAFETY_BUFFERING",
    );
    expect(modelProviderStreamSource).toContain(
      "pub fn from_notification_payload",
    );
    expect(modelProviderStreamSource).toContain(
      "fn provider_stream_event_headers",
    );
    expect(modelProviderStreamSource).toContain(
      "provider_request_wire_support_issue",
    );
    expect(modelProviderStreamSource).toContain(
      "provider_supports_request_wire_shape",
    );
    expect(modelProviderStreamSource).toContain(
      "RuntimeProviderBackend::Current",
    );
    expect(modelProviderStreamSource).toContain(
      "RuntimeProviderBackend::AsterCompat",
    );
    expect(modelProviderStreamSource).toContain("uses_responses_api");
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
    expect(agentRuntimeReplyMessageSource).toContain(
      "pub struct RuntimeReplyMessage",
    );
    expect(agentRuntimeReplyMessageSource).toContain(
      "pub enum RuntimeReplyMessageContent",
    );
    expect(agentRuntimeReplyMessageSource).toContain("RuntimeReplyMessageRole");
    expect(agentRuntimeReplyMessageSource).toContain("from_attempt_input");
    expect(agentRuntimeReplyMessageSource).toContain("concat_text");
    expect(agentRuntimeReplyMessageSource).toContain("has_images");
    expect(
      FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
        agentRuntimeReplyMessageSource.includes(snippet),
      ),
      "agent-runtime reply_message contract 不得引入 Aster Message / MessageContent 类型",
    ).toEqual([]);
    expect(agentRuntimeReplyRequestSource).toContain(
      "pub struct RuntimeReplyRequest",
    );
    expect(agentRuntimeReplyRequestSource).toContain(
      "RuntimeReplyStreamRequest::new",
    );
    expect(agentRuntimeReplyRequestSource).toContain("from_attempt_input");
    expect(agentRuntimeReplyRequestSource).toContain("into_parts");
    expect(agentRuntimeReplyRequestSource).toContain("RuntimeReplyMessage");
    expect(agentRuntimeReplyRequestSource).toContain("message_chars");
    expect(
      FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
        agentRuntimeReplyRequestSource.includes(snippet),
      ),
      "agent-runtime reply_request contract 不得引入 Aster provider/reply 类型",
    ).toEqual([]);
    expect(agentRuntimeReplyExecutionSource).toContain(
      "pub struct RuntimeReplyAttemptError",
    );
    expect(agentRuntimeReplyExecutionSource).toContain(
      "pub struct RuntimeReplyExecution",
    );
    expect(agentRuntimeReplyExecutionSource).toContain(
      "pub struct RuntimeReplyAttemptState",
    );
    expect(agentRuntimeReplyExecutionSource).toContain(
      "impl From<RuntimeReplyStartError> for RuntimeReplyAttemptError",
    );
    expect(agentRuntimeReplyExecutionSource).toContain("fn push_text");
    expect(agentRuntimeReplyExecutionSource).toContain("fn push_error");
    expect(agentRuntimeReplyExecutionSource).toContain("fn error");
    expect(agentRuntimeReplyExecutionSource).toContain("fn last_error");
    expect(agentRuntimeReplyExecutionSource).toContain(
      "fn into_execution_with_text",
    );
    expect(agentRuntimeReplyExecutionSource).toContain("emitted_any");
    expect(agentRuntimeReplyExecutionSource).toContain("attempts_summary");
    expect(agentRuntimeReplyExecutionSource).not.toContain("aster::");
    expect(agentRuntimeReplyStreamSource).toContain(
      "pub enum RuntimeReplyStreamEvent<E>",
    );
    expect(agentRuntimeReplyStreamSource).toContain(
      "pub struct RuntimeReplyStreamState",
    );
    expect(agentRuntimeReplyStreamSource).toContain(
      "pub const MIN_PROVIDER_STREAM_FIRST_EVENT_TIMEOUT",
    );
    expect(agentRuntimeReplyStreamSource).toContain(
      "pub struct RuntimeReplyStreamIdleTimeout",
    );
    expect(agentRuntimeReplyStreamSource).toContain("pub fn message(&self)");
    expect(agentRuntimeReplyStreamSource).toContain("fn next_timeout");
    expect(agentRuntimeReplyStreamSource).toContain(
      "fn capture_inline_provider_error",
    );
    expect(agentRuntimeReplyStreamSource).toContain(
      "fn take_inline_provider_error",
    );
    expect(agentRuntimeReplyStreamSource).toContain(
      "pub trait RuntimeReplyStreamProjector<SourceEvent, RuntimeEvent>",
    );
    expect(agentRuntimeReplyStreamSource).toContain(
      "pub struct RuntimeReplyStreamProjection",
    );
    expect(agentRuntimeReplyStreamSource).toContain("pub fn from_parts");
    expect(agentRuntimeReplyStreamSource).toContain("pub fn into_events");
    expect(agentRuntimeReplyStreamSource).toContain(
      "fn project_reply_stream_event",
    );
    expect(agentRuntimeReplyStreamSource).toContain(
      "SuppressedInlineProviderError(String)",
    );
    expect(agentRuntimeReplyStreamSource).toContain(
      "pub struct RuntimeReplyInlineProviderError",
    );
    expect(agentRuntimeReplyStreamSource).toContain("pub fn from_text");
    expect(agentRuntimeReplyStreamSource).toContain("ProviderStreamEvent");
    expect(agentRuntimeReplyStreamSource).not.toContain("aster::");
    expect(asterReplyStreamAdapterSource).toContain(
      "provider_stream_event_notification_payload_from_message",
    );
    expect(asterReplyStreamAdapterSource).toContain(
      "RuntimeReplyProviderStreamEvent::from_notification_payload",
    );
    expect(asterReplyStreamAdapterSource).not.toContain(
      "PROVIDER_STREAM_EVENT_KIND_SAFETY_BUFFERING",
    );
    expect(asterReplyStreamAdapterSource).not.toContain(
      "safety_buffering_from_response_event",
    );
    expect(asterReplyStreamAdapterSource).not.toContain(
      "fn provider_stream_event_headers",
    );
    expect(asterReplyStreamAdapterSource).toContain(
      "inline_provider_error_from_aster_message",
    );
    expect(asterReplyStreamAdapterSource).toContain(
      "RuntimeReplyInlineProviderError::from_text",
    );
    expect(asterReplyStreamAdapterSource).toContain(
      "RuntimeReplyStreamProjection::from_parts",
    );
    expect(asterReplyStreamAdapterSource).toContain(
      "RuntimeReplyStreamProjection::events",
    );
    expect(asterReplyStreamAdapterSource).toContain(".into_events()");
    expect(asterReplyStreamAdapterSource).not.toContain(
      "RuntimeReplyStreamEvent::ProviderStreamEvent",
    );
    expect(asterReplyStreamAdapterSource).not.toContain(
      "RuntimeReplyStreamEvent::SuppressedInlineProviderError",
    );
    expect(asterReplyStreamAdapterSource).not.toContain(
      "suppressed_inline_provider_error",
    );
    expect(asterReplyStreamAdapterSource).not.toContain("Ran into this error:");
    expect(asterReplyStreamAdapterSource).not.toContain(
      "Please retry if you think this is a transient or recoverable error.",
    );
    expect(asterReplyStreamAdapterSource).not.toContain("split_once");
    expect(agentRuntimeEventStreamSource).toContain(
      "pub trait EventProjector<SourceEvent, RuntimeEvent>",
    );
    expect(agentRuntimeEventStreamSource).toContain(
      "fn project(&mut self, event: SourceEvent) -> Vec<RuntimeEvent>",
    );
    expect(
      FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
        agentRuntimeEventStreamSource.includes(snippet),
      ),
      "agent-runtime event_stream 只能定义 current event projector contract，不得引入 Aster source type",
    ).toEqual([]);
    expect(asterReplyAdapterSource).toContain("struct AsterReplyRuntimeHost");
    expect(asterReplyAdapterSource).toContain("backend: AsterReplyBackend<'a>");
    expect(asterReplyAdapterSource).toContain(
      "impl<'a> RuntimeReplyStreamHost<RuntimeAgentEvent> for AsterReplyRuntimeHost<'a>",
    );
    expect(asterReplyAdapterSource).toContain(
      "type Backend = AsterReplyBackend<'a>",
    );
    expect(asterReplyAdapterSource).toContain("fn reply_backend(&self)");
    expect(asterReplyAdapterSource).toContain(
      "impl RuntimeReplyPolicyHost<RuntimeAgentEvent, AgentRuntimeStatus> for AsterReplyRuntimeHost",
    );
    expect(asterReplyAdapterSource).toContain(
      "RuntimeActionRequiredResponseInput as ActionRequiredResponseInput",
    );
    expect(asterReplyAdapterSource).toContain(
      "RuntimeReplyAttemptInput as ReplyAttemptInput",
    );
    expect(asterReplyMessageAdapterSource).toContain(
      "agent_runtime::reply_message::{",
    );
    expect(asterReplyMessageAdapterSource).toContain(
      "pub(super) fn lower_aster_reply_message",
    );
    expect(asterReplyMessageAdapterSource).toContain("RuntimeReplyMessage");
    expect(asterReplyMessageAdapterSource).toContain(
      "RuntimeReplyMessageContent",
    );
    expect(asterReplyMessageAdapterSource).toContain("RuntimeReplyMessageRole");
    expect(asterReplyMessageAdapterSource).toContain("Message::user()");
    expect(asterReplyMessageAdapterSource).toContain("Message::assistant()");
    expect(asterReplyMessageAdapterSource).toContain(
      "MessageContent::ActionRequired",
    );
    expect(asterReplyMessageAdapterSource).toContain(
      "ActionRequiredData::ElicitationResponse",
    );
    expect(asterReplyMessageAdapterSource).toContain(
      "cancelled_turn_context_marker_message",
    );
    expect(asterReplyMessageAdapterSource).toContain(
      "CANCELLED_TURN_CONTEXT_MARKER",
    );
    expect(asterReplyMessageAdapterSource).not.toContain(".reply(");
    expect(asterReplyMessageAdapterSource).not.toContain(
      "SessionManager::add_message",
    );
    expect(asterReplyMessageAdapterSource).not.toContain(
      "ConfiguredReplyProvider",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "agent_runtime::reply_message::{",
    );
    expect(asterReplyBackendAdapterSource).toContain(
      "use agent_runtime::reply_backend::{",
    );
    expect(asterReplyBackendAdapterSource).toContain(
      "RuntimeReplyBackendStart::from_start_request",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "pub enum RuntimeReplyBackendRunPath",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "pub struct RuntimeReplyBackendRun",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "pub struct RuntimeReplyBackendRunOutcome",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "pub struct RuntimeReplyDefaultCall",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "pub type RuntimeReplyDefaultSourceCall",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "RuntimeReplyDefaultSourceCall::new",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "pub struct RuntimeReplyProviderCall",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "pub type RuntimeReplyProviderSourceCall",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "RuntimeReplyProviderSourceCall::new",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "pub enum RuntimeReplySourceCall",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "pub type RuntimeReplySourceRun",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "RuntimeReplySourceCall::Default",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "RuntimeReplySourceCall::Provider",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "pub struct RuntimeReplyBackendTrace",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "pub enum RuntimeReplyBackendPrepareError",
    );
    expect(agentRuntimeReplyBackendSource).toContain("pub fn trace");
    expect(agentRuntimeReplyBackendSource).toContain("pub fn prepare_run");
    expect(agentRuntimeReplyBackendSource).toContain("pub fn finish_stream");
    expect(agentRuntimeReplyBackendSource).toContain(
      "pub trait RuntimeReplySource",
    );
    expect(agentRuntimeReplyBackendSource).toContain("pub fn run_reply_source");
    expect(agentRuntimeReplyBackendSource).toContain(
      "S: RuntimeReplySource + Send",
    );
    expect(agentRuntimeReplyBackendSource).toContain("fn run");
    expect(agentRuntimeReplyBackendSource).toContain("Agent error:");
    expect(agentRuntimeReplyBackendSource).toContain(
      "provider_wire_support_start_error",
    );
    expect(agentRuntimeReplyBackendSource).toContain(
      "prepare_session_metadata",
    );
    expect(agentRuntimeReplyBackendSource).toContain("provider_stream_start");
    expect(asterReplyBackendAdapterSource).toContain("RuntimeReplyStartResult");
    expect(asterReplyBackendAdapterSource).not.toContain("ReplyAttemptError");
    expect(asterReplyBackendAdapterSource).toContain(
      "struct AsterReplyBackend",
    );
    expect(asterReplyBackendAdapterSource).toContain(
      "impl<'backend> RuntimeReplyBackend<RuntimeAgentEvent> for AsterReplyBackend<'backend>",
    );
    expect(asterReplyBackendAdapterSource).toContain("fn uses_pinned_provider");
    expect(asterReplyBackendAdapterSource).toContain("fn provider_handle");
    expect(asterReplyBackendAdapterSource).toContain("fn start_reply_stream");
    expect(asterReplyBackendAdapterSource).toContain(
      "native_tool_policy_disallowed_tool_names",
    );
    expect(asterReplyBackendAdapterSource).toContain("prepare_run(");
    expect(asterReplyBackendAdapterSource).toContain("backend_start.trace()");
    expect(asterReplyBackendAdapterSource).toContain("run_reply_source");
    expect(asterReplyBackendAdapterSource).toContain("struct AsterReplySource");
    expect(asterReplyBackendAdapterSource).toContain(
      "impl<'source> RuntimeReplySource for AsterReplySource<'source>",
    );
    expect(asterReplyBackendAdapterSource).toContain("type Stream<'run>");
    expect(asterReplyBackendAdapterSource).toContain("Self: 'run");
    expect(asterReplyBackendAdapterSource).toContain("fn run");
    expect(asterReplyBackendAdapterSource).toContain("RuntimeReplySourceRun");
    expect(asterReplyBackendAdapterSource).toContain("RuntimeReplySourceCall");
    expect(asterReplyBackendAdapterSource).toContain(
      "RuntimeReplySourceCall::Default",
    );
    expect(asterReplyBackendAdapterSource).toContain(
      "RuntimeReplySourceCall::Provider",
    );
    expect(
      asterReplyBackendAdapterSource.match(
        /call\.map\(lower_aster_reply_message, to_aster_session_config\)/g,
      ) ?? [],
    ).toHaveLength(1);
    expect(asterReplyBackendAdapterSource).toContain("outcome.finish_stream");
    const runtimeReplySourceTraitBody = agentRuntimeReplyBackendSource.slice(
      agentRuntimeReplyBackendSource.indexOf("pub trait RuntimeReplySource"),
      agentRuntimeReplyBackendSource.indexOf("pub fn run_reply_source"),
    );
    const startAsterReplyStreamBody = asterReplyBackendAdapterSource.slice(
      asterReplyBackendAdapterSource.indexOf(
        "pub(super) async fn start_aster_reply_stream",
      ),
      asterReplyBackendAdapterSource.indexOf("struct AsterReplySource"),
    );
    expect(startAsterReplyStreamBody).not.toContain(
      "RuntimeReplyBackendRunPath::Provider",
    );
    expect(startAsterReplyStreamBody).not.toContain(
      "RuntimeReplyBackendRunPath::Default",
    );
    expect(startAsterReplyStreamBody).not.toContain(".reply(");
    expect(startAsterReplyStreamBody).not.toContain(
      ".stream_reply_with_agent(",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "provider_wire_support_start_error",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "prepare_session_metadata",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "provider_stream_start(provider.runtime_handle())",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "provider_request_wire_support_issue",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "stream_request.provider_backend()",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "stream_request.provider_name()",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "stream_request.model_name()",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "stream_request.model_request_policy.as_ref()",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "agent_runtime::reply_session::{",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "attach_reply_disallowed_tools",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "attach_reply_provider_wire_shape",
    );
    expect(asterReplyBackendAdapterSource).not.toContain("session_config_mut");
    expect(asterReplyBackendAdapterSource).not.toContain(
      "fn attach_provider_request_wire_shape",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "fn attach_native_tool_policy_scope",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "RuntimeReplyStartError::from_provider_wire_support_issue",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "unsupported_provider_wire_shape_error",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "request.into_parts()",
    );
    expect(asterReplyBackendAdapterSource).not.toContain("issue.message()");
    expect(asterReplyBackendAdapterSource).not.toContain(
      "RuntimeReplyProviderStreamStart::new",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "RuntimeReplyProviderStartError",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      ".map_err(|error| RuntimeReplyStartError::new(error.message, emitted_any))",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      'RuntimeReplyStartError::new(format!("Agent error:',
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      ".map(|stream| {\n            (",
    );
    expect(asterReplyBackendAdapterSource).not.toContain("&provider_start");
    expect(asterReplyBackendAdapterSource).not.toContain(
      "message: agent_runtime::reply_message::RuntimeReplyMessage",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "session_config: agent_runtime::session_config::AgentSessionConfig",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "cancel_token: Option<CancellationToken>",
    );
    expect(runtimeReplySourceTraitBody).not.toContain(
      "message: RuntimeReplyMessage",
    );
    expect(runtimeReplySourceTraitBody).not.toContain(
      "session_config: AgentSessionConfig",
    );
    expect(runtimeReplySourceTraitBody).not.toContain(
      "cancel_token: Option<CancellationToken>",
    );
    expect(runtimeReplySourceTraitBody).not.toContain("fn run_default");
    expect(runtimeReplySourceTraitBody).not.toContain("fn run_provider");
    expect(asterReplyBackendAdapterSource).not.toContain("fn run_default");
    expect(asterReplyBackendAdapterSource).not.toContain("fn run_provider");
    expect(asterReplyBackendAdapterSource).not.toContain(
      "RuntimeReplyStartRequest {\n        request,",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "attach_reply_disallowed_tools",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "attach_reply_provider_wire_shape",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "provider_request_wire_support_issue",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "RuntimeReplyProviderStreamStart::new",
    );
    expect(asterReplyAdapterSource).not.toContain("&provider_start");
    expect(asterReplyAdapterSource).not.toContain(
      "RuntimeReplyStartRequest {\n        request,",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "RuntimeReplyProviderRequestWireShape::TURN_CONTEXT_METADATA_KEY",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "RuntimeReplyProviderRequestWireShape::TURN_CONTEXT_METADATA_KEY",
    );
    expect(asterReplyAdapterSource).not.toContain(
      'entry("tool_scope".to_string())',
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      'entry("tool_scope".to_string())',
    );
    expect(asterReplyAdapterSource).not.toContain(
      'entry("disallowed_tools".to_string())',
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      'entry("disallowed_tools".to_string())',
    );
    expect(asterReplyAdapterSource).not.toContain(
      "serde_json::to_value(wire_shape)",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "serde_json::to_value(wire_shape)",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "fn aster_compat_provider_supports_responses_lite_wire",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "fn aster_compat_provider_supports_responses_lite_wire",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "unsupported_aster_compat_wire_shape_error",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "unsupported_aster_compat_wire_shape_error",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "RuntimeProviderBackend::Current",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "RuntimeProviderBackend::Current",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "RuntimeProviderBackend::AsterCompat",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "RuntimeProviderBackend::AsterCompat",
    );
    expect(asterReplyAdapterSource).not.toContain(
      'provider.identity.provider_name == "openai"',
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      'provider.identity.provider_name == "openai"',
    );
    expect(asterReplyAdapterSource).not.toContain("uses_responses_api");
    expect(asterReplyBackendAdapterSource).not.toContain("uses_responses_api");
    expect(asterReplyAdapterSource).not.toContain(
      "RuntimeReplyMessage::from_attempt_input",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "RuntimeReplyRequest::from_attempt_input",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "request: RuntimeReplyRequest,\n        session_config: AgentSessionConfig",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "runtime_reply_model_request_policy_from_turn_context",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "RuntimeReplyStreamRequest::new",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "input_modality_policy_from_turn_context",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "input_modality_policy_allows_image_input",
    );
    expect(asterReplyBackendAdapterSource).toContain(
      "lower_aster_reply_message",
    );
    expect(asterReplyAdapterSource).not.toContain("lower_aster_reply_message");
    expect(asterReplyAdapterSource).not.toContain("Message::user()");
    expect(asterReplyAdapterSource).not.toContain("Message::assistant()");
    expect(asterReplyAdapterSource).not.toContain(
      "MessageContent::ActionRequired",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "ActionRequiredData::ElicitationResponse",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "validate_reply_message_modalities",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "fn build_aster_user_message",
    );
    expect(asterReplyBackendAdapterSource).toContain(
      "RuntimeReplyBackend<RuntimeAgentEvent>",
    );
    expect(asterReplyAdapterSource).not.toContain("RuntimeReplyStreamEvent");
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
    expect(asterReplyBackendAdapterSource).toContain(
      "project_aster_reply_stream",
    );
    expect(asterReplyAdapterSource).not.toContain("project_aster_reply_stream");
    expect(asterReplyAdapterSource).not.toContain("AsterEventProjector::new");
    expect(asterReplyAdapterSource).not.toContain(
      "agent_runtime::event_stream::EventProjector",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "extract_inline_agent_provider_error",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "provider_stream_event_from_aster_message",
    );
    expect(asterReplyStreamAdapterSource).toContain(
      "struct AsterReplyStreamProjector",
    );
    expect(asterReplyStreamAdapterSource).toContain(
      "impl RuntimeReplyStreamProjector<AsterAgentEvent, RuntimeAgentEvent>",
    );
    expect(asterReplyStreamAdapterSource).toContain("AsterEventProjector::new");
    expect(asterReplyStreamAdapterSource).toContain(
      "agent_runtime::event_stream::EventProjector",
    );
    expect(asterReplyStreamAdapterSource).toContain(
      "RuntimeReplyStreamProjection::from_parts",
    );
    expect(asterReplyStreamAdapterSource).not.toContain(
      "RuntimeReplyStreamEvent::ProviderStreamEvent",
    );
    expect(asterReplyStreamAdapterSource).not.toContain(
      "suppressed_inline_provider_error",
    );
    expect(asterReplyStreamAdapterSource).toContain(
      "inline_provider_error_from_aster_message",
    );
    expect(asterReplyStreamAdapterSource).not.toContain(
      "extract_inline_agent_provider_error",
    );
    expect(asterReplyStreamAdapterSource).toContain(
      "provider_stream_event_from_aster_message",
    );
    expect(asterReplyStreamAdapterSource).not.toContain(".reply(");
    expect(asterReplyStreamAdapterSource).not.toContain(
      "to_aster_session_config",
    );
    expect(asterReplyBackendAdapterSource).toContain(
      "pub(super) async fn start_aster_reply_stream",
    );
    expect(asterReplyBackendAdapterSource).toContain(
      "RuntimeReplyStartRequest",
    );
    expect(asterReplyBackendAdapterSource).toContain("to_aster_session_config");
    expect(asterReplyBackendAdapterSource).toContain(".reply(");
    expect(asterReplyBackendAdapterSource).toContain(
      ".stream_reply_with_agent(",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "AsterEventProjector::new",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "RuntimeReplyStreamProjector",
    );
    expect(asterReplyAdapterSource).not.toContain(
      "RuntimeReplyStreamProjector",
    );
    expect(asterReplyMessageAdapterSource).not.toContain(
      "RuntimeReplyStreamProjector",
    );
    expect(asterReplyBackendAdapterSource).not.toContain(
      "MessageContent::ActionRequired",
    );
    expect(asterReplyAdapterSource).toContain(
      "stream_runtime_reply_with_policy",
    );
    expect(asterReplyAdapterSource).toContain(
      "stream_runtime_reply_with_configured_provider",
    );
    expect(asterReplyBackendAdapterSource).toContain(
      "provider: Option<ConfiguredReplyProvider>",
    );
    expect(asterReplyAdapterSource).toContain("with_reply_provider");
    expect(asterReplyBackendAdapterSource).toContain("uses_pinned_provider");
    expect(asterReplyAdapterSource).toContain("emit_runtime_status");
    expect(asterReplyAdapterSource).toContain(
      "persist_cancelled_turn_context_marker",
    );
    expect(asterReplyAdapterSource).not.toContain("tool_registry");
    expect(asterReplyBackendAdapterSource).toContain(
      "start_aster_reply_stream",
    );
    expect(asterReplyAdapterSource).toContain("to_aster_session_config");
    expect(asterReplyAdapterSource).not.toContain(".reply(");
    expect(asterReplyAdapterSource).not.toContain(".stream_reply_with_agent(");
    expect(asterReplyAdapterSource).toContain("SessionManager::add_message");
    expect(asterEventAdapterSource).toContain("project_aster_runtime_event");
    expect(asterEventAdapterSource).toContain(
      "project_aster_auto_compaction_event",
    );
    expect(asterEventAdapterSource).toContain("AutoCompactionProjectionState");
    expect(asterEventAdapterSource).toContain("struct AsterEventProjector");
    expect(asterEventAdapterSource).toContain(
      "impl EventProjector<AsterAgentEvent, RuntimeAgentEvent> for AsterEventProjector",
    );
    expect(asterEventAdapterSource).not.toContain(
      "struct RuntimeEventProjector",
    );
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
      "pub(crate) fn build_web_search_synthesis_runtime_status",
    );
    expect(source).toContain(
      "pub(crate) fn build_provider_tail_failure_retry_runtime_status",
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
    const productionSource = source.split("#[cfg(test)]")[0] ?? source;
    const leaks = RUNTIME_STATE_FORBIDDEN_DIRECT_ASTER_REPLY_SNIPPETS.filter(
      (snippet) => productionSource.includes(snippet),
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
    const runtimeStateSupportPath =
      "lime-rs/crates/agent/src/runtime_state_support.rs";
    const nativeOverlayPath =
      "lime-rs/crates/agent/src/native_tools/runtime_overlay.rs";
    const currentOwnerPath =
      "lime-rs/crates/tool-runtime/src/native_overlay.rs";
    const currentDispatchPath =
      "lime-rs/crates/tool-runtime/src/native_dispatch.rs";
    const currentLibPath = "lime-rs/crates/tool-runtime/src/lib.rs";
    const agentToolCatalogPath =
      "lime-rs/crates/agent/src/agent_tools/catalog.rs";
    const agentPromptTemplatesPath =
      "lime-rs/crates/agent/src/prompt/templates.rs";
    const runtimeAvailabilityPath =
      "src/components/agent/chat/utils/runtimeToolAvailability.ts";
    const vendorToolsModPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/tools/mod.rs";
    const runtimeInventoryAdapterPath =
      "lime-rs/crates/agent/src/agent_tools/tool_inventory_runtime_adapter.rs";
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
    const runtimeStateSupportSource = readFileSync(
      join(REPO_ROOT, runtimeStateSupportPath),
      "utf8",
    );
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const currentDispatchSource = readFileSync(
      join(REPO_ROOT, currentDispatchPath),
      "utf8",
    );
    const currentLibSource = readFileSync(
      join(REPO_ROOT, currentLibPath),
      "utf8",
    );
    const agentToolCatalogSource = readFileSync(
      join(REPO_ROOT, agentToolCatalogPath),
      "utf8",
    );
    const agentPromptTemplatesSource = readFileSync(
      join(REPO_ROOT, agentPromptTemplatesPath),
      "utf8",
    );
    const runtimeAvailabilitySource = readFileSync(
      join(REPO_ROOT, runtimeAvailabilityPath),
      "utf8",
    );
    const vendorToolsModSource = readFileSync(
      join(REPO_ROOT, vendorToolsModPath),
      "utf8",
    );
    const runtimeInventoryAdapterSource = readFileSync(
      join(REPO_ROOT, runtimeInventoryAdapterPath),
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
    expect(nativeOverlaySource).not.toContain("create_shared_history");
    expect(nativeOverlaySource).not.toContain("WriteTool");
    expect(nativeOverlaySource).not.toContain("EditTool");
    expect(nativeOverlaySource).toContain("WorkspaceToolPolicyInspector::new");
    expect(currentOwnerSource).toContain("pub enum RuntimeNativeToolOverlay");
    expect(currentOwnerSource).toContain("runtime_native_tool_overlay_tools");
    expect(currentOwnerSource).toContain(
      "runtime_native_tool_overlay_tool_names",
    );
    expect(currentOwnerSource).toContain(
      "pub struct RuntimeNativeToolRegistration",
    );
    expect(currentOwnerSource).toContain("pub struct RuntimeNativeToolSurface");
    expect(currentOwnerSource).toContain(
      "runtime_native_tool_overlay_registrations",
    );
    expect(currentOwnerSource).toContain("runtime_native_tool_surface");
    expect(currentOwnerSource).toContain(
      "RuntimeNativeToolRegistrationOwner::NativeDispatch",
    );
    expect(currentOwnerSource).toContain(
      "runtime_native_tool_registration_allowlist",
    );
    expect(currentOwnerSource).toContain("RuntimeNativeToolOverlay::ViewImage");
    expect(currentOwnerSource).toContain("RuntimeNativeToolOverlay::Sleep");
    expect(currentOwnerSource).toContain(
      "RuntimeNativeToolOverlay::UpdatePlan",
    );
    expect(currentOwnerSource).not.toContain("RuntimeNativeToolOverlay::Write");
    expect(currentOwnerSource).not.toContain("RuntimeNativeToolOverlay::Edit");
    expect(currentOwnerSource).toContain('names.contains(&"view_image")');
    expect(currentOwnerSource).toContain('names.contains(&"sleep")');
    expect(currentOwnerSource).toContain('names.contains(&"update_plan")');
    expect(currentOwnerSource).toContain('!names.contains(&"Write")');
    expect(currentOwnerSource).toContain('!names.contains(&"Edit")');
    for (const retiredTaskTool of [
      "TaskCreate",
      "TaskList",
      "TaskGet",
      "TaskUpdate",
      "TaskOutput",
      "TaskStop",
    ]) {
      expect(currentOwnerSource).toContain(
        `!names.contains(&"${retiredTaskTool}")`,
      );
      expect(agentToolCatalogSource).not.toContain(
        `name: "${retiredTaskTool}"`,
      );
      expect(agentPromptTemplatesSource).not.toContain(retiredTaskTool);
      expect(runtimeAvailabilitySource).not.toContain(retiredTaskTool);
    }
    expect(agentToolCatalogSource).toContain("UPDATE_PLAN_TOOL_NAME");
    expect(agentPromptTemplatesSource).toContain("update_plan");
    expect(runtimeAvailabilitySource).toContain("PLAN_TOOL_NAMES");
    expect(runtimeAvailabilitySource).toContain('"update_plan"');
    expect(currentOwnerSource).toContain('!names.contains(&"ViewImage")');
    expect(currentOwnerSource).toContain('!names.contains(&"UpdatePlan")');
    expect(currentOwnerSource).toContain('!names.contains(&"NotebookEdit")');
    expect(currentOwnerSource).toContain('!names.contains(&"EnterWorktree")');
    expect(currentOwnerSource).toContain('!names.contains(&"Workflow")');
    expect(currentOwnerSource).toContain('!names.contains(&"Config")');
    expect(currentOwnerSource).toContain('!names.contains(&"Sleep")');
    expect(currentOwnerSource).toContain('!names.contains(&"SleepTool")');
    expect(currentOwnerSource).not.toContain("aster::");
    expect(currentOwnerSource).not.toContain("lime_native_tool_overlay");
    expect(currentLibSource).toContain("pub mod native_dispatch;");
    expect(currentDispatchSource).toContain("pub struct NativeDispatch");
    expect(currentDispatchSource).toContain("runtime_native_dispatch_handle");
    expect(currentDispatchSource).toContain(
      "runtime_native_dispatch_definitions",
    );
    expect(currentDispatchSource).toContain(
      "runtime_apply_patch_executor_handle",
    );
    expect(currentDispatchSource).toContain(
      "runtime_skill_search_executor_handle",
    );
    expect(currentDispatchSource).toContain("runtime_sleep_executor_handle");
    expect(currentDispatchSource).toContain(
      "runtime_view_image_executor_handle",
    );
    expect(currentDispatchSource).toContain(
      "runtime_plan_update_executor_handle",
    );
    expect(currentDispatchSource).toContain(
      "runtime_web_fetch_executor_handle",
    );
    expect(currentDispatchSource).toContain(
      "runtime_web_search_executor_handle",
    );
    expect(currentDispatchSource).toContain("with_memory_store_gateway");
    expect(currentDispatchSource).toContain(
      "runtime_memory_store_executor_handle",
    );
    expect(currentDispatchSource).toContain("with_image_task_gateway");
    expect(currentDispatchSource).toContain(
      "runtime_image_task_executor_handle",
    );
    expect(currentDispatchSource).toContain("unsupported_native_tool");
    expect(currentDispatchSource).toContain('canonical_name("clock.sleep")');
    expect(currentDispatchSource).toContain('canonical_name("UpdatePlanTool")');
    expect(currentDispatchSource).toContain('canonical_name("ViewImageTool")');
    expect(currentDispatchSource).not.toContain("aster::");
    expect(runtimeStateSupportSource).toContain(
      "runtime_native_tool_registration_allowlist",
    );
    expect(runtimeStateSupportSource).toContain(".with_allowed_tool_names(");
    expect(vendorToolsModSource).toContain("allowed_tool_names");
    expect(vendorToolsModSource).toContain("fn allows_tool");
    expect(vendorToolsModSource).toContain('config.allows_tool("Bash")');
    expect(vendorToolsModSource).not.toContain(
      'config.allows_tool("NotebookEdit")',
    );
    expect(vendorToolsModSource).not.toContain(
      'config.allows_tool("EnterWorktree")',
    );
    expect(vendorToolsModSource).not.toContain(
      'config.allows_tool("ViewImage")',
    );
    expect(nativeOverlaySource).toContain(
      "runtime_native_tool_overlay_registrations",
    );
    expect(nativeOverlaySource).not.toContain(
      "for overlay_tool in runtime_native_tool_overlay_tools()",
    );
    expect(nativeOverlaySource).toContain("create_view_image_tool");
    expect(nativeOverlaySource).toContain("create_sleep_tool");
    expect(nativeOverlaySource).toContain("create_update_plan_tool");
    expect(runtimeInventoryAdapterSource).toContain(
      "runtime_native_tool_overlay_tool_names",
    );
    expect(runtimeInventoryAdapterSource).toContain(".filter(|definition|");
    expect(runtimeInventoryAdapterSource).toContain(
      "definition.name.as_str() == *name",
    );
  });

  it("已迁 native tool wrapper 的 RuntimeTool 转换只能集中在 runtime_tool_bridge", () => {
    const bridgePath =
      "lime-rs/crates/agent/src/native_tools/runtime_tool_bridge.rs";
    const bridgeSource = readFileSync(join(REPO_ROOT, bridgePath), "utf8");
    const adapterForbiddenSnippets = [
      "fn runtime_context_from_aster",
      "fn tool_result_from_runtime",
      "fn runtime_error_to_tool_error",
      "RuntimeToolExecutionContext",
      "RuntimeToolExecutionContextInput",
      "RuntimeToolExecutionRequest",
      "RuntimeToolExecutionResult",
      "RuntimeToolExecutionError",
      "RuntimeToolPolicyErrorKind",
    ];
    const adapterLeaks = RUNTIME_TOOL_BRIDGE_ADAPTER_FILES.flatMap(
      (filePath) => {
        const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
        const productionSource = source.split("#[cfg(test)]")[0] ?? source;
        return adapterForbiddenSnippets
          .filter((snippet) => productionSource.includes(snippet))
          .map((snippet) => `${filePath}: ${snippet}`);
      },
    );
    const missingBridgeCalls = RUNTIME_TOOL_BRIDGE_ADAPTER_FILES.filter(
      (filePath) => {
        const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
        const productionSource = source.split("#[cfg(test)]")[0] ?? source;
        return (
          !productionSource.includes("execute_runtime_tool(") &&
          !productionSource.includes("RuntimeNativeToolAdapter::new") &&
          !productionSource.includes("RuntimeDefinitionToolAdapter::new")
        );
      },
    );

    expect(bridgeSource).toContain("fn runtime_context_from_aster");
    expect(bridgeSource).toContain("fn tool_result_from_runtime");
    expect(bridgeSource).toContain("fn runtime_error_to_tool_error");
    expect(bridgeSource).toContain("pub(crate) async fn execute_runtime_tool");
    expect(bridgeSource).toContain(
      "pub(crate) struct RuntimeNativeToolAdapter",
    );
    expect(bridgeSource).toContain("impl Tool for RuntimeNativeToolAdapter");
    expect(bridgeSource).toContain(
      "pub(crate) struct RuntimeDefinitionToolAdapter",
    );
    expect(bridgeSource).toContain(
      "impl Tool for RuntimeDefinitionToolAdapter",
    );
    expect(
      missingBridgeCalls,
      "已迁 native tool 的 Aster Tool wrapper 必须通过 runtime_tool_bridge 执行 current RuntimeToolExecutor，stateless wrapper 只能创建 RuntimeNativeToolAdapter",
    ).toEqual([]);
    expect(
      adapterLeaks,
      "已迁 native tool wrapper 只能保留权限/别名/turn context 适配；Aster ToolContext/ToolResult/ToolError 转换必须集中在 runtime_tool_bridge，迁出 reply loop 后整体删除",
    ).toEqual([]);
  });

  it("已迁 stateless native tool wrapper 的模型可见 surface 必须来自 tool-runtime", () => {
    const bridgePath =
      "lime-rs/crates/agent/src/native_tools/runtime_tool_bridge.rs";
    const currentOwnerPath =
      "lime-rs/crates/tool-runtime/src/native_overlay.rs";
    const bridgeSource = readFileSync(join(REPO_ROOT, bridgePath), "utf8");
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const statelessWrapperFiles = [
      "lime-rs/crates/agent/src/native_tools/sleep.rs",
      "lime-rs/crates/agent/src/native_tools/view_image.rs",
      "lime-rs/crates/agent/src/native_tools/update_plan.rs",
      "lime-rs/crates/agent/src/native_tools/web_retrieval.rs",
      "lime-rs/crates/agent/src/tools/apply_patch_tool.rs",
      "lime-rs/crates/agent/src/tools/skill_search_tool.rs",
    ];
    const forbiddenSurfaceSnippets = [
      "sleep_tool_definition",
      "view_image_tool_definition",
      "update_plan_definition",
      "web_fetch_tool_definition",
      "web_search_tool_definition",
      "apply_patch_tool_definition",
      "skill_search_tool_definition",
      "CLOCK_SLEEP_TOOL_NAME",
      "VIEW_IMAGE_LEGACY_ALIASES",
      "UPDATE_PLAN_LEGACY_ALIASES",
      '"ApplyPatchTool"',
      '"SkillSearchTool"',
    ];
    const missingAdapterRefs = statelessWrapperFiles.filter((filePath) => {
      const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
      const productionSource = source.split("#[cfg(test)]")[0] ?? source;
      return !productionSource.includes("RuntimeNativeToolAdapter::new");
    });
    const wrapperImplLeaks = statelessWrapperFiles.flatMap((filePath) => {
      const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
      const productionSource = source.split("#[cfg(test)]")[0] ?? source;
      return [
        "impl Tool for",
        "runtime_native_tool_surface_ref",
        "runtime_native_tool_options",
      ]
        .filter((snippet) => productionSource.includes(snippet))
        .map((snippet) => `${filePath}: ${snippet}`);
    });
    const surfaceLeaks = statelessWrapperFiles.flatMap((filePath) => {
      const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
      const productionSource = source.split("#[cfg(test)]")[0] ?? source;
      return forbiddenSurfaceSnippets
        .filter((snippet) => productionSource.includes(snippet))
        .map((snippet) => `${filePath}: ${snippet}`);
    });

    expect(currentOwnerSource).toContain("pub struct RuntimeNativeToolSurface");
    expect(currentOwnerSource).toContain("runtime_native_tool_surface");
    expect(currentOwnerSource).toContain(
      "RuntimeNativeToolOverlay::Skill => None",
    );
    expect(bridgeSource).toContain("runtime_native_tool_surface_ref");
    expect(bridgeSource).toContain("runtime_native_tool_options");
    expect(
      missingAdapterRefs,
      "stateless Aster Tool wrapper 只能创建统一 RuntimeNativeToolAdapter，不能继续自持模型可见 spec 或 Tool trait 样板",
    ).toEqual([]);
    expect(
      wrapperImplLeaks,
      "stateless Aster Tool wrapper 不得恢复本地 impl Tool、surface 读取或 options 读取；这些兼容逻辑必须集中在 runtime_tool_bridge",
    ).toEqual([]);
    expect(
      surfaceLeaks,
      "stateless Aster Tool wrapper 不得恢复各自 *_tool_definition / legacy alias 常量或硬编码 alias 作为模型可见 surface 事实源",
    ).toEqual([]);
  });

  it("Skill gate session enable 规则必须归属 tool-runtime current owner", () => {
    const currentOwnerPath = "lime-rs/crates/tool-runtime/src/skill_gate.rs";
    const currentContractPath =
      "lime-rs/crates/tool-runtime/src/skill_runtime_contract.rs";
    const currentLibPath = "lime-rs/crates/tool-runtime/src/lib.rs";
    const agentWrapperPath =
      "lime-rs/crates/agent/src/tools/skill_tool_gate.rs";
    const agentToolsModPath = "lime-rs/crates/agent/src/tools/mod.rs";
    const appServerRuntimeEnablePath =
      "lime-rs/crates/app-server/src/runtime_backend/skill_runtime_enable.rs";
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const currentLibSource = readFileSync(
      join(REPO_ROOT, currentLibPath),
      "utf8",
    );
    const currentContractSource = readFileSync(
      join(REPO_ROOT, currentContractPath),
      "utf8",
    );
    const agentWrapperSource = readFileSync(
      join(REPO_ROOT, agentWrapperPath),
      "utf8",
    );
    const agentToolsModSource = readFileSync(
      join(REPO_ROOT, agentToolsModPath),
      "utf8",
    );
    const appServerRuntimeEnableSource = readFileSync(
      join(REPO_ROOT, appServerRuntimeEnablePath),
      "utf8",
    );
    const wrapperForbiddenSnippets = [
      "struct SkillToolSessionAccess",
      "fn session_access_store",
      "HashMap<String, SkillToolSessionAccess>",
      "Mutex<HashMap",
      "fn skill_name_gate_aliases",
      "fn workspace_skill_source_for_session_skill",
      "fn is_skill_allowed_for_session",
      "MODALITY_RUNTIME_CONTRACTS_JSON",
      "MODALITY_EXECUTION_PROFILES_JSON",
      "struct SkillRuntimeContractSpec",
      "fn current_skill_runtime_contract_spec",
      "fn build_current_runtime_contract",
      "fn validate_runtime_contract_preflight",
      "fn normalize_skill_tool_params",
      "fn normalize_skill_invocation_params",
      "serde_json::to_string(&args)",
      "LIMECORE_POLICY_SNAPSHOT_STATUS_LOCAL_DEFAULTS_EVALUATED",
    ];
    const wrapperLeaks = wrapperForbiddenSnippets
      .filter((snippet) => agentWrapperSource.includes(snippet))
      .map((snippet) => `${agentWrapperPath}: ${snippet}`);

    expect(currentLibSource).toContain("pub mod skill_gate;");
    expect(currentLibSource).toContain("pub mod skill_runtime_contract;");
    expect(currentOwnerSource).toContain(
      "pub struct SkillToolSessionSkillSource",
    );
    expect(currentOwnerSource).toContain("set_skill_tool_session_access");
    expect(currentOwnerSource).toContain(
      "set_skill_tool_session_allowed_skill_sources",
    );
    expect(currentOwnerSource).toContain("is_skill_tool_session_skill_allowed");
    expect(currentOwnerSource).toContain(
      "workspace_skill_source_for_session_skill",
    );
    expect(currentOwnerSource).toContain("skill_tool_disabled_message");
    expect(currentOwnerSource).toContain("pub const SKILL_TOOL_NAME");
    expect(currentOwnerSource).toContain("pub const SKILL_TOOL_DESCRIPTION");
    expect(currentOwnerSource).toContain("pub fn skill_tool_input_schema");
    expect(currentOwnerSource).toContain(
      "pub fn normalize_skill_invocation_params",
    );
    expect(currentOwnerSource).not.toContain("aster::");
    expect(currentOwnerSource).not.toContain("SkillTool::new");
    expect(currentContractSource).toContain(
      "pub struct SkillRuntimeContractMetadata",
    );
    expect(currentContractSource).toContain(
      "pub fn build_skill_runtime_contract_metadata",
    );
    expect(currentContractSource).toContain("modalityRuntimeContracts.json");
    expect(currentContractSource).toContain("modalityExecutionProfiles.json");
    expect(currentContractSource).not.toContain("aster::");
    expect(currentContractSource).not.toContain("ToolResult");
    expect(agentWrapperSource).toContain("use tool_runtime::skill_gate");
    expect(agentWrapperSource).toContain("SKILL_TOOL_NAME");
    expect(agentWrapperSource).toContain("SKILL_TOOL_DESCRIPTION");
    expect(agentWrapperSource).toContain("skill_tool_input_schema");
    expect(agentWrapperSource).toContain("normalize_skill_invocation_params");
    expect(agentWrapperSource).not.toContain(
      "pub use tool_runtime::skill_gate",
    );
    expect(agentWrapperSource).toContain(
      "use tool_runtime::skill_runtime_contract",
    );
    expect(agentToolsModSource).toContain(
      "pub use skill_tool_gate::LimeSkillTool",
    );
    expect(agentToolsModSource).not.toContain(
      "is_skill_tool_session_skill_allowed",
    );
    expect(agentToolsModSource).not.toContain("set_skill_tool_session_access");
    expect(agentToolsModSource).not.toContain("SkillToolSessionSkillSource");
    expect(agentWrapperSource).toContain("inner: SkillTool");
    expect(agentWrapperSource).toContain("impl Tool for LimeSkillTool");
    expect(agentWrapperSource).not.toContain("self.inner.name()");
    expect(agentWrapperSource).not.toContain("self.inner.input_schema()");
    expect(appServerRuntimeEnableSource).toContain(
      "use tool_runtime::skill_gate::{",
    );
    expect(appServerRuntimeEnableSource).not.toContain(
      "use lime_agent::tools::{",
    );
    expect(appServerRuntimeEnableSource).not.toContain(
      "use lime_agent::tools::is_skill_tool_session_skill_allowed",
    );
    expect(
      wrapperLeaks,
      "SkillTool session enable / allowlist / source metadata gate 必须归属 tool-runtime；lime-agent 只能保留临时 Aster SkillTool 执行壳",
    ).toEqual([]);
  });

  it("vendored Aster Task* 工具族必须保持删除且不得重新注册", () => {
    const vendorToolsModPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/tools/mod.rs";
    const vendorAgentPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/agents/agent.rs";
    const vendorToolSearchPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/tools/tool_search_tool.rs";
    const vendorHookLoaderPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/hooks/loader.rs";
    const vendorHookTypesPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/hooks/types.rs";
    const vendorToolsModSource = readFileSync(
      join(REPO_ROOT, vendorToolsModPath),
      "utf8",
    );
    const vendorToolsModProduction =
      vendorToolsModSource.split("#[cfg(test)]")[0] ?? vendorToolsModSource;
    const vendorAgentSource = readFileSync(
      join(REPO_ROOT, vendorAgentPath),
      "utf8",
    );
    const vendorAgentProduction =
      vendorAgentSource.split("#[cfg(test)]")[0] ?? vendorAgentSource;
    const vendorToolSearchSource = readFileSync(
      join(REPO_ROOT, vendorToolSearchPath),
      "utf8",
    );
    const vendorToolSearchProduction =
      vendorToolSearchSource.split("#[cfg(test)]")[0] ?? vendorToolSearchSource;
    const vendorHookLoaderSource = readFileSync(
      join(REPO_ROOT, vendorHookLoaderPath),
      "utf8",
    );
    const vendorHookTypesSource = readFileSync(
      join(REPO_ROOT, vendorHookTypesPath),
      "utf8",
    );
    const retiredTaskToolNames = [
      "TaskCreate",
      "TaskList",
      "TaskGet",
      "TaskUpdate",
      "TaskOutput",
      "TaskStop",
    ];
    const forbiddenToolsModSnippets = [
      "task_list_tools",
      "task_output_tool",
      "task_stop_tool",
      "TaskListStorage",
      "TaskCreateTool",
      "TaskListTool",
      "TaskGetTool",
      "TaskUpdateTool",
      "TaskOutputTool",
      "TaskStopTool",
      "AgentOutputTool",
      "BashOutputTool",
      "KillShell",
      ...retiredTaskToolNames.map((name) => `config.allows_tool("${name}")`),
    ];
    const toolsModLeaks = forbiddenToolsModSnippets
      .filter((snippet) => vendorToolsModProduction.includes(snippet))
      .map((snippet) => `${vendorToolsModPath}: ${snippet}`);
    const agentProductionLeaks = retiredTaskToolNames
      .filter((snippet) => vendorAgentProduction.includes(snippet))
      .map((snippet) => `${vendorAgentPath}: ${snippet}`);
    const toolSearchLeaks = [
      ...retiredTaskToolNames,
      "taskcreatetool",
      "tasklisttool",
      "taskgettool",
      "taskupdatetool",
      "taskoutputtool",
      "taskstoptool",
      "agent output",
      "kill shell",
    ]
      .filter((snippet) => vendorToolSearchProduction.includes(snippet))
      .map((snippet) => `${vendorToolSearchPath}: ${snippet}`);

    for (const deletedPath of DELETED_ASTER_VENDOR_TASK_TOOL_FILES) {
      expect(existsSync(join(REPO_ROOT, deletedPath))).toBe(false);
    }
    expect(
      toolsModLeaks,
      "Codex 没有 model-facing Task* 工具族；vendored Aster 不得恢复 Task* module、public export、alias 或默认注册",
    ).toEqual([]);
    expect(
      agentProductionLeaks,
      "SubAgent production allowlist 不得再把 Aster Task* 当 current 工具面暴露",
    ).toEqual([]);
    expect(
      toolSearchLeaks,
      "ToolSearch vendor 面不得继续用 Aster Task* 作为可搜索 alias 或语义示例",
    ).toEqual([]);
    expect(vendorHookLoaderSource).not.toContain("TaskCreated");
    expect(vendorHookTypesSource).not.toContain("TaskCreated");
  });

  it("update_plan native tool 必须按 Codex checklist 语义归属 tool-runtime", () => {
    const currentOwnerPath = "lime-rs/crates/tool-runtime/src/update_plan.rs";
    const currentLibPath = "lime-rs/crates/tool-runtime/src/lib.rs";
    const agentWrapperPath =
      "lime-rs/crates/agent/src/native_tools/update_plan.rs";
    const vendorUpdatePlanPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/tools/plan_tool.rs";
    const vendorToolsModPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/tools/mod.rs";
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const currentLibSource = readFileSync(
      join(REPO_ROOT, currentLibPath),
      "utf8",
    );
    const agentWrapperSource = readFileSync(
      join(REPO_ROOT, agentWrapperPath),
      "utf8",
    );
    const vendorToolsModSource = readFileSync(
      join(REPO_ROOT, vendorToolsModPath),
      "utf8",
    );
    const wrapperForbiddenSnippets = [
      "struct UpdatePlanTool",
      "UpdatePlanTool::new",
      "deserialize_step_status",
      "inProgress",
      "in-progress",
    ];
    const wrapperLeaks = wrapperForbiddenSnippets
      .filter((snippet) => agentWrapperSource.includes(snippet))
      .map((snippet) => `${agentWrapperPath}: ${snippet}`);

    expect(currentLibSource).toContain("pub mod update_plan;");
    expect(currentOwnerSource).toContain(
      'pub const UPDATE_PLAN_NAME: &str = "update_plan"',
    );
    expect(currentOwnerSource).toContain("struct PlanUpdate");
    expect(currentOwnerSource).toContain("struct PlanStep");
    expect(currentOwnerSource).toContain("RuntimePlanUpdateExecutor");
    expect(currentOwnerSource).toContain("runtime_plan_update_executor_handle");
    expect(currentOwnerSource).toContain("check_plan_update_permissions");
    expect(currentOwnerSource).toContain("deny_unknown_fields");
    expect(currentOwnerSource).toContain("At most one step");
    expect(currentOwnerSource).toContain("not allowed in Plan mode");
    expect(currentOwnerSource).not.toContain("aster::");
    expect(currentOwnerSource).not.toContain("struct UpdatePlanTool");
    expect(agentWrapperSource).toContain("RuntimeNativeToolAdapter::new");
    expect(agentWrapperSource).toContain("with_turn_context_provider");
    expect(agentWrapperSource).not.toContain(
      "runtime_plan_update_executor_handle",
    );
    expect(agentWrapperSource).toContain("check_plan_update_permissions");
    expect(agentWrapperSource).toContain("UPDATE_PLAN_NAME");
    expect(agentWrapperSource).not.toContain(
      'name(&self) -> &str {\n        "UpdatePlan"',
    );
    expect(agentWrapperSource).not.toContain(
      'name(&self) -> &str {\n        "UpdatePlanTool"',
    );
    expect(existsSync(join(REPO_ROOT, vendorUpdatePlanPath))).toBe(false);
    expect(vendorToolsModSource).not.toContain("pub mod plan_tool");
    expect(vendorToolsModSource).not.toContain("pub use plan_tool");
    expect(vendorToolsModSource).not.toContain("UpdatePlanTool::new()");
    expect(vendorToolsModSource).not.toContain(
      'config.allows_tool("UpdatePlan")',
    );
    expect(
      wrapperLeaks,
      "update_plan 已按 Codex TODO/checklist 语义迁到 tool-runtime；Lime 侧 Aster Tool adapter 只能委托 current executor，不能恢复 Aster UpdatePlanTool 实现或非 Codex status alias",
    ).toEqual([]);
  });

  it("sleep native tool 必须按 Codex clock.sleep 语义归属 tool-runtime", () => {
    const currentOwnerPath = "lime-rs/crates/tool-runtime/src/sleep.rs";
    const currentLibPath = "lime-rs/crates/tool-runtime/src/lib.rs";
    const agentWrapperPath = "lime-rs/crates/agent/src/native_tools/sleep.rs";
    const vendorSleepToolPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/tools/sleep_tool.rs";
    const vendorToolsModPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/tools/mod.rs";
    const frontendNormalizationPath = "src/lib/api/agentTextNormalization.ts";
    const frontendSubjectPath =
      "src/components/agent/chat/utils/toolDisplaySubject.ts";
    const frontendConfigPath =
      "src/components/agent/chat/utils/toolDisplayConfig/core.ts";
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const currentLibSource = readFileSync(
      join(REPO_ROOT, currentLibPath),
      "utf8",
    );
    const agentWrapperSource = readFileSync(
      join(REPO_ROOT, agentWrapperPath),
      "utf8",
    );
    const vendorToolsModSource = readFileSync(
      join(REPO_ROOT, vendorToolsModPath),
      "utf8",
    );
    const frontendNormalizationSource = readFileSync(
      join(REPO_ROOT, frontendNormalizationPath),
      "utf8",
    );
    const frontendSubjectSource = readFileSync(
      join(REPO_ROOT, frontendSubjectPath),
      "utf8",
    );
    const frontendConfigSource = readFileSync(
      join(REPO_ROOT, frontendConfigPath),
      "utf8",
    );
    const wrapperForbiddenSnippets = [
      "struct SleepTool",
      "SleepTool::new",
      "proactive",
      "Kairos",
      "kairos",
    ];
    const wrapperLeaks = wrapperForbiddenSnippets
      .filter((snippet) => agentWrapperSource.includes(snippet))
      .map((snippet) => `${agentWrapperPath}: ${snippet}`);

    expect(currentLibSource).toContain("pub mod sleep;");
    expect(currentOwnerSource).toContain("pub const SLEEP_TOOL_NAME");
    expect(currentOwnerSource).toContain("pub const CLOCK_SLEEP_TOOL_NAME");
    expect(currentOwnerSource).toContain("MAX_SLEEP_DURATION_MS");
    expect(currentOwnerSource).toContain("duration_ms");
    expect(currentOwnerSource).toContain("deny_unknown_fields");
    expect(currentOwnerSource).not.toContain("aster::");
    expect(agentWrapperSource).toContain("RuntimeNativeToolAdapter::new");
    expect(agentWrapperSource).not.toContain("impl Tool for");
    expect(agentWrapperSource).not.toContain("runtime_sleep_executor_handle");
    expect(agentWrapperSource).toContain("check_runtime_sleep_permissions");
    expect(agentWrapperSource).toContain("SLEEP_TOOL_NAME");
    expect(agentWrapperSource).not.toContain(
      'name(&self) -> &str {\n        "Sleep"',
    );
    expect(agentWrapperSource).not.toContain(
      'name(&self) -> &str {\n        "SleepTool"',
    );
    expect(existsSync(join(REPO_ROOT, vendorSleepToolPath))).toBe(false);
    expect(vendorToolsModSource).not.toContain("pub mod sleep_tool");
    expect(vendorToolsModSource).not.toContain("SleepTool::new()");
    expect(frontendNormalizationSource).toContain('"clock.sleep": "sleep"');
    expect(frontendNormalizationSource).toContain('sleep: "sleep"');
    expect(frontendNormalizationSource).not.toContain('sleeptool: "sleep"');
    expect(frontendSubjectSource).toContain('"clock.sleep": "sleep"');
    expect(frontendSubjectSource).not.toContain('sleeptool: "sleep"');
    expect(frontendConfigSource).toContain('"sleep"');
    expect(frontendConfigSource).not.toContain('"sleeptool"');
    expect(
      wrapperLeaks,
      "sleep 已按 Codex clock.sleep / duration_ms 语义迁到 tool-runtime；Lime 侧 Aster Tool adapter 只能委托 current executor，不能恢复 Aster SleepTool 旧语义",
    ).toEqual([]);
  });

  it("view_image native tool 必须归属 tool-runtime current owner", () => {
    const currentOwnerPath = "lime-rs/crates/tool-runtime/src/view_image.rs";
    const currentLibPath = "lime-rs/crates/tool-runtime/src/lib.rs";
    const currentCargoPath = "lime-rs/crates/tool-runtime/Cargo.toml";
    const agentWrapperPath =
      "lime-rs/crates/agent/src/native_tools/view_image.rs";
    const vendorViewImagePath =
      "lime-rs/vendor/aster-rust/crates/aster/src/tools/view_image.rs";
    const vendorToolsModPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/tools/mod.rs";
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const currentLibSource = readFileSync(
      join(REPO_ROOT, currentLibPath),
      "utf8",
    );
    const currentCargoSource = readFileSync(
      join(REPO_ROOT, currentCargoPath),
      "utf8",
    );
    const agentWrapperSource = readFileSync(
      join(REPO_ROOT, agentWrapperPath),
      "utf8",
    );
    const vendorToolsModSource = readFileSync(
      join(REPO_ROOT, vendorToolsModPath),
      "utf8",
    );
    const wrapperForbiddenSnippets = [
      "read_image_file_enhanced",
      "estimate_image_tokens",
      "is_supported_image_format",
      "MAX_IMAGE_FILE_SIZE",
      "struct ViewImageTool",
    ];
    const wrapperLeaks = wrapperForbiddenSnippets
      .filter((snippet) => agentWrapperSource.includes(snippet))
      .map((snippet) => `${agentWrapperPath}: ${snippet}`);

    expect(currentLibSource).toContain("pub mod view_image;");
    expect(currentCargoSource).toContain("base64.workspace = true");
    expect(currentOwnerSource).toContain("pub const VIEW_IMAGE_TOOL_NAME");
    expect(currentOwnerSource).toContain("MAX_VIEW_IMAGE_FILE_SIZE");
    expect(currentOwnerSource).toContain("RuntimeViewImageExecutor");
    expect(currentOwnerSource).toContain("runtime_view_image_executor_handle");
    expect(currentOwnerSource).toContain(
      "check_runtime_view_image_permissions",
    );
    expect(currentOwnerSource).toContain("model_visible_image");
    expect(currentOwnerSource).toContain("image_url");
    expect(currentOwnerSource).toContain("deny_unknown_fields");
    expect(currentOwnerSource).not.toContain("aster::");
    expect(agentWrapperSource).toContain("RuntimeNativeToolAdapter::new");
    expect(agentWrapperSource).not.toContain("impl Tool for");
    expect(agentWrapperSource).not.toContain(
      "runtime_view_image_executor_handle",
    );
    expect(agentWrapperSource).toContain(
      "check_runtime_view_image_permissions",
    );
    expect(agentWrapperSource).toContain("VIEW_IMAGE_TOOL_NAME");
    expect(agentWrapperSource).not.toContain(
      'name(&self) -> &str {\n        "ViewImage"',
    );
    expect(agentWrapperSource).not.toContain(
      'name(&self) -> &str {\n        "ViewImageTool"',
    );
    expect(existsSync(join(REPO_ROOT, vendorViewImagePath))).toBe(false);
    expect(vendorToolsModSource).not.toContain("mod view_image");
    expect(vendorToolsModSource).not.toContain("pub use view_image");
    expect(vendorToolsModSource).not.toContain("ViewImageTool::new()");
    expect(
      wrapperLeaks,
      "view_image 已迁到 tool-runtime；Lime 侧 Aster Tool adapter 只能委托 current executor，不能恢复 Aster media helper 或 ViewImageTool 实现",
    ).toEqual([]);
  });

  it("apply_patch native tool 执行规则必须归属 tool-runtime current owner", () => {
    const currentOwnerPath = "lime-rs/crates/tool-runtime/src/apply_patch.rs";
    const currentLibPath = "lime-rs/crates/tool-runtime/src/lib.rs";
    const currentCargoPath = "lime-rs/crates/tool-runtime/Cargo.toml";
    const agentWrapperPath =
      "lime-rs/crates/agent/src/tools/apply_patch_tool.rs";
    const agentCargoPath = "lime-rs/crates/agent/Cargo.toml";
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const currentLibSource = readFileSync(
      join(REPO_ROOT, currentLibPath),
      "utf8",
    );
    const currentCargoSource = readFileSync(
      join(REPO_ROOT, currentCargoPath),
      "utf8",
    );
    const agentWrapperSource = readFileSync(
      join(REPO_ROOT, agentWrapperPath),
      "utf8",
    );
    const agentCargoSource = readFileSync(
      join(REPO_ROOT, agentCargoPath),
      "utf8",
    );
    const wrapperForbiddenSnippets = [
      "use patch_apply",
      "apply_patch_to_workdir",
      "parse_patch",
      "AppliedPatchFileChange",
      "fn build_metadata",
      "fn line_diff",
      "fn stable_hash",
      "fn resolve_patch_path_for_permission",
    ];
    const wrapperLeaks = wrapperForbiddenSnippets
      .filter((snippet) => agentWrapperSource.includes(snippet))
      .map((snippet) => `${agentWrapperPath}: ${snippet}`);

    expect(currentLibSource).toContain("pub mod apply_patch;");
    expect(currentCargoSource).toContain("patch-apply.workspace = true");
    expect(agentCargoSource).not.toContain("patch-apply.workspace = true");
    expect(currentOwnerSource).toContain(
      "pub struct RuntimeApplyPatchExecutor",
    );
    expect(currentOwnerSource).toContain(
      "pub fn runtime_apply_patch_executor_handle",
    );
    expect(currentOwnerSource).toContain(
      "pub fn check_runtime_apply_patch_permissions",
    );
    expect(currentOwnerSource).toContain("apply_patch_to_workdir");
    expect(currentOwnerSource).not.toContain("aster::");
    expect(agentWrapperSource).toContain("create_apply_patch_tool");
    expect(agentWrapperSource).toContain("RuntimeNativeToolAdapter::new");
    expect(agentWrapperSource).not.toContain("impl Tool for");
    expect(agentWrapperSource).not.toContain(
      "runtime_apply_patch_executor_handle",
    );
    expect(agentWrapperSource).toContain(
      "check_runtime_apply_patch_permissions",
    );
    expect(
      wrapperLeaks,
      "apply_patch 的 patch 解析、路径权限、metadata/diff 构造和执行必须归属 tool-runtime；Aster Tool wrapper 只能做 DTO 适配",
    ).toEqual([]);
  });

  it("skill_search native tool 执行规则必须归属 tool-runtime current owner", () => {
    const currentOwnerPath = "lime-rs/crates/tool-runtime/src/skill_search.rs";
    const currentLibPath = "lime-rs/crates/tool-runtime/src/lib.rs";
    const currentCargoPath = "lime-rs/crates/tool-runtime/Cargo.toml";
    const agentWrapperPath =
      "lime-rs/crates/agent/src/tools/skill_search_tool.rs";
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const currentLibSource = readFileSync(
      join(REPO_ROOT, currentLibPath),
      "utf8",
    );
    const currentCargoSource = readFileSync(
      join(REPO_ROOT, currentCargoPath),
      "utf8",
    );
    const agentWrapperSource = readFileSync(
      join(REPO_ROOT, agentWrapperPath),
      "utf8",
    );
    const wrapperForbiddenSnippets = [
      "build_agent_skill_snapshot_from_workspace",
      "search_agent_skills",
      "AgentSkillSearchOptions",
      "AgentSkillSearchResult",
      "DEFAULT_AGENT_SKILL_SEARCH_LIMIT",
      "fn parse_input",
      "fn resolve_skill_search_workspace",
      "fn skill_search_output",
      "fn skill_search_result_value",
      "fn skill_search_metadata",
      "PROJECT_ROOT_POINTERS",
      "WORKING_DIR_POINTERS",
    ];
    const wrapperLeaks = wrapperForbiddenSnippets
      .filter((snippet) => agentWrapperSource.includes(snippet))
      .map((snippet) => `${agentWrapperPath}: ${snippet}`);

    expect(currentLibSource).toContain("pub mod skill_search;");
    expect(currentCargoSource).toContain("lime-skills.workspace = true");
    expect(currentOwnerSource).toContain(
      "pub struct RuntimeSkillSearchExecutor",
    );
    expect(currentOwnerSource).toContain(
      "pub fn runtime_skill_search_executor_handle",
    );
    expect(currentOwnerSource).toContain(
      "pub fn check_runtime_skill_search_permissions",
    );
    expect(currentOwnerSource).toContain(
      "build_agent_skill_snapshot_from_workspace",
    );
    expect(currentOwnerSource).toContain("search_agent_skills");
    expect(currentOwnerSource).not.toContain("aster::");
    expect(agentWrapperSource).toContain("create_skill_search_tool");
    expect(agentWrapperSource).toContain("RuntimeNativeToolAdapter::new");
    expect(agentWrapperSource).toContain("with_turn_context_provider");
    expect(agentWrapperSource).not.toContain("impl Tool for");
    expect(agentWrapperSource).not.toContain(
      "runtime_skill_search_executor_handle",
    );
    expect(agentWrapperSource).toContain(
      "check_runtime_skill_search_permissions",
    );
    expect(
      wrapperLeaks,
      "skill_search 的输入解析、workspace 解析、搜索执行和 metadata/output 构造必须归属 tool-runtime；Aster Tool wrapper 只能做 DTO 适配",
    ).toEqual([]);
  });

  it("memory store native tool 执行规则必须归属 tool-runtime current owner", () => {
    const currentOwnerPaths = [
      "lime-rs/crates/tool-runtime/src/memory_store.rs",
      "lime-rs/crates/tool-runtime/src/memory_store/definitions.rs",
      "lime-rs/crates/tool-runtime/src/memory_store/executor.rs",
      "lime-rs/crates/tool-runtime/src/memory_store/params.rs",
    ];
    const currentLibPath = "lime-rs/crates/tool-runtime/src/lib.rs";
    const currentCargoPath = "lime-rs/crates/tool-runtime/Cargo.toml";
    const agentWrapperPath =
      "lime-rs/crates/agent/src/native_tools/memory_store.rs";
    const appServerGatewayPath =
      "lime-rs/crates/app-server/src/runtime_backend/memory_tools.rs";
    const currentOwnerSource = currentOwnerPaths
      .map((path) => readFileSync(join(REPO_ROOT, path), "utf8"))
      .join("\n");
    const currentLibSource = readFileSync(
      join(REPO_ROOT, currentLibPath),
      "utf8",
    );
    const currentCargoSource = readFileSync(
      join(REPO_ROOT, currentCargoPath),
      "utf8",
    );
    const agentWrapperSource = readFileSync(
      join(REPO_ROOT, agentWrapperPath),
      "utf8",
    );
    const appServerGatewaySource = readFileSync(
      join(REPO_ROOT, appServerGatewayPath),
      "utf8",
    );
    const wrapperForbiddenSnippets = [
      "pub trait MemoryStoreGateway",
      "MemoryStoreRootParams",
      "MemoryStoreScope",
      "MemoryStoreSearchMatchMode",
      "struct MemoryListTool",
      "struct MemoryReadTool",
      "struct MemorySearchTool",
      "struct MemoryAddNoteTool",
      "fn root_params",
      "fn context_workspace_root",
      "fn metadata_map",
      "fn string_param",
      "fn required_string_param",
      "fn usize_param",
      "fn bool_param",
      "fn string_array_param",
      "fn match_mode_param",
      "fn check_memory_path_permission",
      "fn validate_memory_relative_path",
    ];
    const wrapperLeaks = wrapperForbiddenSnippets
      .filter((snippet) => agentWrapperSource.includes(snippet))
      .map((snippet) => `${agentWrapperPath}: ${snippet}`);

    expect(currentLibSource).toContain("pub mod memory_store;");
    expect(currentOwnerSource).toContain("mod definitions;");
    expect(currentOwnerSource).toContain("mod executor;");
    expect(currentOwnerSource).toContain("mod params;");
    expect(currentCargoSource).toContain(
      "app-server-protocol.workspace = true",
    );
    expect(currentCargoSource).toContain("async-trait.workspace = true");
    expect(currentOwnerSource).toContain(
      "pub struct RuntimeMemoryStoreExecutor",
    );
    expect(currentOwnerSource).toContain("pub trait MemoryStoreGateway");
    expect(currentOwnerSource).toContain(
      "pub fn runtime_memory_store_executor_handle",
    );
    expect(currentOwnerSource).toContain(
      "pub fn check_runtime_memory_store_permissions",
    );
    expect(currentOwnerSource).toContain("MemoryStoreListParams");
    expect(currentOwnerSource).toContain("validate_memory_relative_path");
    expect(currentOwnerSource).not.toContain("aster::");
    expect(agentWrapperSource).toContain("NativeDispatch::builder");
    expect(agentWrapperSource).toContain("with_memory_store_gateway");
    expect(agentWrapperSource).toContain("RuntimeDefinitionToolAdapter::new");
    expect(agentWrapperSource).toContain("with_max_retries(0)");
    expect(agentWrapperSource).not.toContain("struct MemoryStoreTool");
    expect(agentWrapperSource).not.toContain("impl Tool for");
    expect(agentWrapperSource).not.toContain(
      "runtime_memory_store_executor_handle",
    );
    expect(agentWrapperSource).toContain(
      "check_runtime_memory_store_permissions",
    );
    expect(agentWrapperSource).not.toContain(
      "pub use memory_store::MemoryStoreGateway",
    );
    expect(appServerGatewaySource).toContain(
      "use tool_runtime::memory_store::MemoryStoreGateway",
    );
    expect(appServerGatewaySource).not.toContain(
      "use lime_agent::native_tools::MemoryStoreGateway",
    );
    expect(
      wrapperLeaks,
      "memory store 的 DTO 构造、路径权限、metadata/output 构造和 gateway trait 必须归属 tool-runtime；Aster Tool wrapper 只能做调用适配",
    ).toEqual([]);
  });

  it("image task native tool 执行规则必须归属 tool-runtime current owner", () => {
    const currentOwnerPaths = [
      "lime-rs/crates/tool-runtime/src/image_task.rs",
      "lime-rs/crates/tool-runtime/src/image_task/definition.rs",
      "lime-rs/crates/tool-runtime/src/image_task/executor.rs",
      "lime-rs/crates/tool-runtime/src/image_task/params.rs",
    ];
    const currentLibPath = "lime-rs/crates/tool-runtime/src/lib.rs";
    const currentCargoPath = "lime-rs/crates/tool-runtime/Cargo.toml";
    const agentWrapperPath =
      "lime-rs/crates/agent/src/native_tools/image_tasks.rs";
    const appServerGatewayPath =
      "lime-rs/crates/app-server/src/runtime_backend/image_tools.rs";
    const currentOwnerSource = currentOwnerPaths
      .map((path) => readFileSync(join(REPO_ROOT, path), "utf8"))
      .join("\n");
    const currentLibSource = readFileSync(
      join(REPO_ROOT, currentLibPath),
      "utf8",
    );
    const currentCargoSource = readFileSync(
      join(REPO_ROOT, currentCargoPath),
      "utf8",
    );
    const agentWrapperSource = readFileSync(
      join(REPO_ROOT, agentWrapperPath),
      "utf8",
    );
    const agentWrapperProductionSource =
      agentWrapperSource.split("#[cfg(test)]")[0] ?? agentWrapperSource;
    const appServerGatewaySource = readFileSync(
      join(REPO_ROOT, appServerGatewayPath),
      "utf8",
    );
    const wrapperForbiddenSnippets = [
      "pub trait ImageTaskGateway",
      "pub struct NativeToolResultProjection",
      "struct ImageGenerationTool",
      "struct ImageToolInput",
      "fn parse_params",
      "fn build_create_params",
      "fn image_task_tool_result_projection",
      "fn image_tool_result_from_response",
      "fn resolve_project_root_path",
      "fn validate_absolute_path",
      "fn required_identity",
      "fn required_string",
      "fn optional_string",
      "fn optional_u32",
      "fn string_vec",
    ];
    const wrapperLeaks = wrapperForbiddenSnippets
      .filter((snippet) => agentWrapperProductionSource.includes(snippet))
      .map((snippet) => `${agentWrapperPath}: ${snippet}`);

    expect(currentLibSource).toContain("pub mod image_task;");
    expect(currentOwnerSource).toContain("mod definition;");
    expect(currentOwnerSource).toContain("mod executor;");
    expect(currentOwnerSource).toContain("mod params;");
    expect(currentCargoSource).toContain(
      "app-server-protocol.workspace = true",
    );
    expect(currentOwnerSource).toContain("pub struct RuntimeImageTaskExecutor");
    expect(currentOwnerSource).toContain("pub trait ImageTaskGateway");
    expect(currentOwnerSource).toContain(
      "pub struct ImageTaskToolResultProjection",
    );
    expect(currentOwnerSource).toContain(
      "pub fn runtime_image_task_executor_handle",
    );
    expect(currentOwnerSource).toContain(
      "pub fn check_runtime_image_task_permissions",
    );
    expect(currentOwnerSource).toContain("MediaTaskArtifactImageCreateParams");
    expect(currentOwnerSource).toContain("validate_absolute_path");
    expect(currentOwnerSource).not.toContain("aster::");
    expect(agentWrapperProductionSource).toContain("NativeDispatch::builder");
    expect(agentWrapperProductionSource).toContain("with_image_task_gateway");
    expect(agentWrapperProductionSource).toContain(
      "RuntimeDefinitionToolAdapter::new",
    );
    expect(agentWrapperProductionSource).toContain(
      "with_turn_context_provider",
    );
    expect(agentWrapperProductionSource).toContain("with_max_retries(0)");
    expect(agentWrapperProductionSource).not.toContain("struct ImageTaskTool");
    expect(agentWrapperProductionSource).not.toContain("impl Tool for");
    expect(agentWrapperProductionSource).not.toContain(
      "runtime_image_task_executor_handle",
    );
    expect(agentWrapperProductionSource).toContain(
      "check_runtime_image_task_permissions",
    );
    expect(agentWrapperProductionSource).toContain(
      "runtime_turn_context_from_aster",
    );
    expect(appServerGatewaySource).toContain("use tool_runtime::image_task::{");
    expect(appServerGatewaySource).not.toContain(
      "use lime_agent::native_tools::{",
    );
    expect(
      wrapperLeaks,
      "image task 的 schema、DTO 构造、参数校验、gateway trait 和 tool result projection 必须归属 tool-runtime；Aster Tool wrapper 只能做调用适配",
    ).toEqual([]);
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

  it("vendored Aster web tools 必须保持删除，Lime adapter 只能委托 tool-runtime current owner", () => {
    const toolsModPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/tools/mod.rs";
    const webPath = "lime-rs/vendor/aster-rust/crates/aster/src/tools/web.rs";
    const limeAdapterPath =
      "lime-rs/crates/agent/src/native_tools/web_retrieval.rs";
    const overlayPath = "lime-rs/crates/tool-runtime/src/native_overlay.rs";
    const webFetchContentPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/tools/web_fetch_content.rs";
    const toolsModSource = readFileSync(join(REPO_ROOT, toolsModPath), "utf8");
    const limeAdapterSource = readFileSync(
      join(REPO_ROOT, limeAdapterPath),
      "utf8",
    );
    const overlaySource = readFileSync(join(REPO_ROOT, overlayPath), "utf8");
    const productionSource = `${toolsModPath}\n${toolsModSource.split("#[cfg(test)]")[0] ?? toolsModSource}\n${limeAdapterPath}\n${limeAdapterSource.split("#[cfg(test)]")[0] ?? limeAdapterSource}`;
    const adapterLineCount = limeAdapterSource.split(/\r?\n/u).length;
    const leaks = VENDORED_ASTER_WEB_TOOL_FORBIDDEN_SNIPPETS.filter((snippet) =>
      productionSource.includes(snippet),
    );

    expect(existsSync(join(REPO_ROOT, webPath))).toBe(false);
    expect(existsSync(join(REPO_ROOT, webFetchContentPath))).toBe(false);
    expect(adapterLineCount).toBeLessThan(500);
    expect(toolsModSource).not.toContain("pub mod web;");
    expect(toolsModSource).not.toContain("pub use web::{");
    expect(toolsModSource).not.toContain("WebFetchTool::new()");
    expect(toolsModSource).not.toContain("WebSearchTool::new()");
    expect(toolsModSource).not.toContain("mod web_fetch_content;");
    expect(limeAdapterSource).toContain("use tool_runtime::web_fetch::{");
    expect(limeAdapterSource).toContain("RuntimeNativeToolAdapter::new");
    expect(limeAdapterSource).toContain("with_turn_context_provider");
    expect(limeAdapterSource).not.toContain(
      "runtime_web_fetch_executor_handle",
    );
    expect(limeAdapterSource).not.toContain(
      "runtime_web_search_executor_handle",
    );
    expect(limeAdapterSource).not.toContain("execute_current_tool(");
    expect(limeAdapterSource).toContain("create_web_fetch_tool");
    expect(limeAdapterSource).toContain("create_web_search_tool");
    expect(overlaySource).toContain("RuntimeNativeToolOverlay::WebFetch");
    expect(overlaySource).toContain("RuntimeNativeToolOverlay::WebSearch");
    expect(
      leaks.map((snippet) => `vendored web tool duplicate: ${snippet}`),
      "WebFetch/WebSearch 执行逻辑已迁到 tool-runtime；vendored Aster 必须保持删除，Lime 侧短期 Aster Tool adapter 也只能委托 current executor",
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

  it("session_query Aster Session helper 已删除且不得恢复", () => {
    const filePath = "lime-rs/crates/agent/src/session_query.rs";
    const libPath = "lime-rs/crates/agent/src/lib.rs";
    const libSource = readFileSync(join(REPO_ROOT, libPath), "utf8");
    const publicLeaks = [
      ...(libSource.includes("mod session_query;")
        ? [`${libPath}: mod session_query;`]
        : []),
      ...(libSource.includes("pub use session_query::")
        ? [`${libPath}: pub use session_query::`]
        : []),
    ];

    expect(existsSync(join(REPO_ROOT, filePath))).toBe(false);
    expect(
      publicLeaks,
      "session_query 返回 Aster Session 的 helper 已删除；不得恢复模块注册或根 API re-export",
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
    const libSource = readFileSync(join(REPO_ROOT, libPath), "utf8");
    const adapterSource = existsSync(join(REPO_ROOT, adapterPath))
      ? readFileSync(join(REPO_ROOT, adapterPath), "utf8")
      : "";
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
    expect(existsSync(join(REPO_ROOT, adapterPath))).toBe(false);
    expect(adapterSource).not.toContain(
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

  it("session record SQL row 映射必须离开 Aster compat 子模块", () => {
    const currentOwnerPath = "lime-rs/crates/agent/src/session_record_sql.rs";
    const projectionPath =
      "lime-rs/crates/agent/src/aster_session_store/session_projection.rs";
    const traitPath =
      "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs";
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const projectionSource = readFileSync(
      join(REPO_ROOT, projectionPath),
      "utf8",
    );
    const traitSource = readFileSync(join(REPO_ROOT, traitPath), "utf8");

    expect(currentOwnerSource).toContain("SESSION_RECORD_SELECT_COLUMNS");
    expect(currentOwnerSource).toContain("fn map_session_record_row");
    expect(currentOwnerSource).toContain("fn load_session_record_rows");
    expect(currentOwnerSource).toContain("fn load_all_session_record_rows");
    expect(currentOwnerSource).toContain(
      "fn load_session_record_rows_by_types",
    );
    expect(traitSource).toContain("load_session_record_row_by_id");
    expect(traitSource).toContain("load_all_session_record_rows");
    expect(traitSource).toContain("load_session_record_rows_by_types");
    expect(projectionSource).toContain("build_session_from_listing_row");
    expect(projectionSource).toContain("SessionRecordProjection");

    const projectionLeaks =
      ASTER_SESSION_PROJECTION_FORBIDDEN_ROW_SQL_SNIPPETS.filter((snippet) =>
        projectionSource.includes(snippet),
      ).map((snippet) => `${projectionPath}: ${snippet}`);
    const traitLeaks =
      ASTER_SESSION_TRAIT_FORBIDDEN_RECORD_PROJECTION_SNIPPETS.filter(
        (snippet) => traitSource.includes(snippet),
      ).map((snippet) => `${traitPath}: ${snippet}`);

    expect(
      projectionLeaks,
      "aster_session_store/session_projection.rs 只能做 current SessionRecordProjection -> Aster Session DTO 适配，不得重新承接 SQL row 映射或列表加载",
    ).toEqual([]);
    expect(
      traitLeaks,
      "aster_trait.rs 的 get_session / list_sessions 必须消费 current session_record_sql + thread-store projection，不得恢复手写 session row 默认值、json/timestamp/session_type 解析",
    ).toEqual([]);
  });

  it("session record 写入 SQL 必须离开 Aster trait adapter", () => {
    const traitPath =
      "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs";
    const currentOwnerPath =
      "lime-rs/crates/core/src/database/agent_session_repository.rs";
    const traitSource = readFileSync(join(REPO_ROOT, traitPath), "utf8");
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const traitLeaks =
      ASTER_SESSION_TRAIT_FORBIDDEN_DIRECT_RECORD_SQL_SNIPPETS.filter(
        (snippet) => traitSource.includes(snippet),
      ).map((snippet) => `${traitPath}: ${snippet}`);

    expect(currentOwnerSource).toContain("pub fn delete_session");
    expect(currentOwnerSource).toContain("pub fn touch_session_updated_at");
    expect(currentOwnerSource).toContain("DELETE FROM agent_sessions");
    expect(currentOwnerSource).toContain(
      "UPDATE agent_sessions SET updated_at = ?1 WHERE id = ?2",
    );
    expect(currentOwnerSource).not.toContain("aster::");
    expect(traitSource).toContain("delete_session_record");
    expect(traitSource).toContain("touch_session_updated_at_record");
    expect(
      traitLeaks,
      "Aster trait adapter 不得再直接执行 agent_sessions 写入 SQL；delete/touch updated_at 必须归属 current repository",
    ).toEqual([]);
  });

  it("Aster SessionStore bulk history methods 必须从 Lime impl 删除", () => {
    const traitPath =
      "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs";
    const vendorTraitPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/session/store.rs";
    const vendorManagerPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/session/session_manager.rs";
    const vendorAgentPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/agents/agent.rs";
    const deletedVendorPaths = [
      "lime-rs/vendor/aster-rust/crates/aster/src/session/archive.rs",
      "lime-rs/vendor/aster-rust/crates/aster/src/session/diagnostics.rs",
      "lime-rs/vendor/aster-rust/crates/aster/src/session/export.rs",
    ];
    const traitSource = readFileSync(join(REPO_ROOT, traitPath), "utf8");
    const vendorTraitSource = readFileSync(
      join(REPO_ROOT, vendorTraitPath),
      "utf8",
    );
    const vendorManagerSource = readFileSync(
      join(REPO_ROOT, vendorManagerPath),
      "utf8",
    );
    const vendorAgentSource = readFileSync(
      join(REPO_ROOT, vendorAgentPath),
      "utf8",
    );
    const productionSource =
      traitSource.split("#[cfg(test)]")[0] ?? traitSource;
    const leaks =
      ASTER_SESSION_TRAIT_FORBIDDEN_RETIRED_BULK_METHOD_SNIPPETS.filter(
        (snippet) => productionSource.includes(snippet),
      ).map((snippet) => `${traitPath}: ${snippet}`);
    const vendorManagerLeaks = [
      "pub async fn export_session",
      "pub async fn import_session",
      "pub async fn copy_session",
      "pub async fn truncate_conversation",
      "async fn export_session(&self",
      "async fn import_session(&self",
      "async fn copy_session(&self",
      "async fn truncate_conversation(&self",
      "serde_json::to_string_pretty(&session)",
      "serde_json::from_str(json)",
      "DELETE FROM messages WHERE session_id = ? AND created_timestamp",
    ]
      .filter((snippet) => vendorManagerSource.includes(snippet))
      .map((snippet) => `${vendorManagerPath}: ${snippet}`);
    const vendorTraitLeaks = [
      "async fn export_session",
      "async fn import_session",
      "async fn copy_session",
      "async fn truncate_conversation",
      "Lime 不再通过 Aster SessionStore 承接 bulk history API",
    ]
      .filter((snippet) => vendorTraitSource.includes(snippet))
      .map((snippet) => `${vendorTraitPath}: ${snippet}`);
    const vendorAgentLeaks = [
      "async fn export_session",
      "async fn import_session",
      "async fn copy_session",
      "async fn truncate_conversation",
    ]
      .filter((snippet) => vendorAgentSource.includes(snippet))
      .map((snippet) => `${vendorAgentPath}: ${snippet}`);

    expect(
      deletedVendorPaths.filter((path) => existsSync(join(REPO_ROOT, path))),
      "vendored Aster session archive/export/diagnostics JSON bulk surface 已判 dead，不得恢复文件",
    ).toEqual([]);
    expect(
      leaks,
      "没有客户使用的 Aster SessionStore export/import/copy/truncate 不得留在 Lime production impl；需要的能力必须走 App Server current import/export/read-model 主链",
    ).toEqual([]);
    expect(
      vendorManagerLeaks,
      "vendored Aster SessionManager / SessionStorage 不得重新暴露 export/import/copy/truncate bulk history wrapper 或 JSON 编排",
    ).toEqual([]);
    expect(
      vendorTraitLeaks,
      "vendored Aster SessionStore trait 不得重新定义 export/import/copy/truncate bulk history 方法",
    ).toEqual([]);
    expect(
      vendorAgentLeaks,
      "vendored Aster Agent 测试 fake 不得重新实现 export/import/copy/truncate bulk history 方法",
    ).toEqual([]);
  });

  it("session record 创建/读取 helper 必须离开 Aster compat 主文件", () => {
    const storePath = "lime-rs/crates/agent/src/aster_session_store.rs";
    const projectionPath =
      "lime-rs/crates/agent/src/aster_session_store/session_projection.rs";
    const threadRepositoryPath =
      "lime-rs/crates/agent/src/lime_session_repository.rs";
    const currentOwnerPath =
      "lime-rs/crates/core/src/database/agent_session_repository.rs";
    const storeSource = readFileSync(join(REPO_ROOT, storePath), "utf8");
    const productionStoreSource =
      storeSource.split("#[cfg(test)]")[0] ?? storeSource;
    const projectionSource = readFileSync(
      join(REPO_ROOT, projectionPath),
      "utf8",
    );
    const threadRepositorySource = readFileSync(
      join(REPO_ROOT, threadRepositoryPath),
      "utf8",
    );
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const storeLeaks =
      ASTER_SESSION_STORE_FORBIDDEN_DIRECT_RECORD_HELPERS.filter((snippet) =>
        productionStoreSource.includes(snippet),
      ).map((snippet) => `${storePath}: ${snippet}`);

    expect(currentOwnerSource).toContain("pub struct SessionCreateRecord");
    expect(currentOwnerSource).toContain("pub fn insert_session_record");
    expect(currentOwnerSource).toContain("pub fn session_exists");
    expect(currentOwnerSource).toContain("pub fn get_session_working_dir");
    expect(currentOwnerSource).toContain(
      "pub fn get_session_extension_data_json",
    );
    expect(currentOwnerSource).toContain(
      "pub fn resolve_default_session_working_dir",
    );
    expect(currentOwnerSource).toContain(
      "pub fn resolve_persisted_session_working_dir",
    );
    expect(currentOwnerSource).toContain("pub fn update_session_user_set_name");
    expect(currentOwnerSource).toContain("INSERT INTO agent_sessions");
    expect(currentOwnerSource).toContain("SELECT 1 FROM agent_sessions");
    expect(currentOwnerSource).toContain(
      "SELECT working_dir FROM agent_sessions",
    );
    expect(currentOwnerSource).toContain(
      "SELECT extension_data_json FROM agent_sessions",
    );
    expect(currentOwnerSource).not.toContain("aster::");
    expect(storeSource).toContain("insert_session_record");
    expect(storeSource).toContain("session_exists");
    expect(storeSource).toContain("resolve_default_session_working_dir");
    expect(storeSource).toContain("resolve_persisted_session_working_dir");
    expect(projectionSource).toContain("resolve_persisted_session_working_dir");
    expect(projectionSource).not.toContain("super::LimeSessionStore");
    expect(threadRepositorySource).not.toContain("fn normalize_working_dir");
    expect(threadRepositorySource).not.toContain("WorkspaceManager");
    expect(threadRepositorySource).toContain("rename_session_record");
    expect(threadRepositorySource).toContain(
      "update_session_user_set_name_record",
    );
    expect(threadRepositorySource).toContain(
      "update_session_working_dir_record",
    );
    expect(threadRepositorySource).toContain(
      "update_session_extension_data_record",
    );
    expect(threadRepositorySource).toContain("delete_session_record");
    expect(
      storeLeaks,
      "Aster compat 主文件不得恢复 agent_sessions 创建/存在性/working_dir/extension_data SQL 或默认 working_dir fallback；这些语义必须归属 current repository",
    ).toEqual([]);
  });

  it("agent_session_repository 主文件必须保持拆分并外置测试", () => {
    const currentOwnerPath =
      "lime-rs/crates/core/src/database/agent_session_repository.rs";
    const testsPath =
      "lime-rs/crates/core/src/database/agent_session_repository_tests.rs";
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const testsSource = readFileSync(join(REPO_ROOT, testsPath), "utf8");
    const lineCount = currentOwnerSource.split(/\r?\n/u).length;

    expect(
      lineCount,
      "agent_session_repository.rs 接近 800 行时必须继续按 read/write/test 边界拆分，不能重新增长到 1000 行治理风险",
    ).toBeLessThan(800);
    expect(currentOwnerSource).toContain(
      '#[path = "agent_session_repository_tests.rs"]',
    );
    expect(currentOwnerSource).not.toContain("mod tests {");
    expect(existsSync(join(REPO_ROOT, testsPath))).toBe(true);
    expect(testsSource).toContain("use super::*;");
    expect(testsSource).toContain("insert_session_record_should_insert");
    expect(testsSource).toContain(
      "update_session_token_stats_should_preserve_none_fields",
    );
  });

  it("thread SessionRepository metadata/delete SQL 必须归属 current repository", () => {
    const threadRepositoryPath =
      "lime-rs/crates/agent/src/lime_session_repository.rs";
    const currentOwnerPath =
      "lime-rs/crates/core/src/database/agent_session_repository.rs";
    const threadRepositorySource = readFileSync(
      join(REPO_ROOT, threadRepositoryPath),
      "utf8",
    );
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const productionSource =
      threadRepositorySource.split("#[cfg(test)]")[0] ?? threadRepositorySource;
    const leaks =
      THREAD_SESSION_REPOSITORY_FORBIDDEN_DIRECT_METADATA_SQL_SNIPPETS.filter(
        (snippet) => productionSource.includes(snippet),
      ).map((snippet) => `${threadRepositoryPath}: ${snippet}`);

    expect(currentOwnerSource).toContain("pub fn rename_session");
    expect(currentOwnerSource).toContain("pub fn update_session_user_set_name");
    expect(currentOwnerSource).toContain(
      "pub fn update_session_working_dir_with_updated_at",
    );
    expect(currentOwnerSource).toContain(
      "pub fn update_session_extension_data",
    );
    expect(currentOwnerSource).toContain("pub fn delete_session");
    expect(productionSource).toContain("rename_session_record");
    expect(productionSource).toContain("update_session_user_set_name_record");
    expect(productionSource).toContain("update_session_working_dir_record");
    expect(productionSource).toContain("update_session_extension_data_record");
    expect(productionSource).toContain("delete_session_record");
    expect(
      leaks,
      "thread-store SessionRepository 实现不得继续维护 agent_sessions metadata/delete SQL；写入语义必须收敛到 current repository",
    ).toEqual([]);
  });

  it("thread SessionRepository read row loading 必须归属 session_record_sql", () => {
    const threadRepositoryPath =
      "lime-rs/crates/agent/src/lime_session_repository.rs";
    const currentReadModelPath =
      "lime-rs/crates/agent/src/session_record_sql.rs";
    const threadRepositorySource = readFileSync(
      join(REPO_ROOT, threadRepositoryPath),
      "utf8",
    );
    const currentReadModelSource = readFileSync(
      join(REPO_ROOT, currentReadModelPath),
      "utf8",
    );
    const productionSource =
      threadRepositorySource.split("#[cfg(test)]")[0] ?? threadRepositorySource;
    const leaks =
      THREAD_SESSION_REPOSITORY_FORBIDDEN_DIRECT_READ_ROW_SNIPPETS.filter(
        (snippet) => productionSource.includes(snippet),
      ).map((snippet) => `${threadRepositoryPath}: ${snippet}`);
    const readModelLeaks =
      SESSION_RECORD_SQL_FORBIDDEN_SILENT_ROW_ERROR_SNIPPETS.filter((snippet) =>
        currentReadModelSource.includes(snippet),
      ).map((snippet) => `${currentReadModelPath}: ${snippet}`);

    expect(currentReadModelSource).toContain(
      "pub(crate) fn map_session_record_row",
    );
    expect(currentReadModelSource).toContain(
      "pub(crate) fn load_session_record_rows",
    );
    expect(currentReadModelSource).toContain(
      "pub(crate) fn load_session_record_row_by_id",
    );
    expect(currentReadModelSource).toContain(
      "pub(crate) fn load_session_record_rows_for_query",
    );
    expect(productionSource).toContain("load_session_record_row_by_id");
    expect(productionSource).toContain("load_session_record_rows_for_query");
    expect(currentReadModelSource).toContain("rows.collect()");
    expect(
      leaks,
      "thread-store SessionRepository 实现不得重新维护 session row query builder / prepare / map 细节；row loading 必须归属 session_record_sql current read model",
    ).toEqual([]);
    expect(
      readModelLeaks,
      "session_record_sql 是 current read model，行映射错误必须 fail-fast，不得用 filter_map(...ok()) 静默丢弃坏数据",
    ).toEqual([]);
  });

  it("session insights SQL 聚合必须离开 Aster trait adapter", () => {
    const traitPath =
      "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs";
    const sqlPath = "lime-rs/crates/agent/src/session_record_sql.rs";
    const currentOwnerPath =
      "lime-rs/crates/thread-store/src/session_insights.rs";
    const threadStoreLibPath = "lime-rs/crates/thread-store/src/lib.rs";
    const traitSource = readFileSync(join(REPO_ROOT, traitPath), "utf8");
    const sqlSource = readFileSync(join(REPO_ROOT, sqlPath), "utf8");
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const threadStoreLibSource = readFileSync(
      join(REPO_ROOT, threadStoreLibPath),
      "utf8",
    );
    const traitLeaks =
      ASTER_SESSION_TRAIT_FORBIDDEN_INSIGHTS_SQL_SNIPPETS.filter((snippet) =>
        traitSource.includes(snippet),
      ).map((snippet) => `${traitPath}: ${snippet}`);

    expect(threadStoreLibSource).toContain("pub mod session_insights;");
    expect(currentOwnerSource).toContain("pub struct SessionInsightsRecord");
    expect(currentOwnerSource).toContain("pub fn project_session_insights");
    expect(currentOwnerSource).not.toContain("aster::");
    expect(sqlSource).toContain("pub(crate) fn load_session_insights_record");
    expect(sqlSource).toContain("project_session_insights");
    expect(traitSource).toContain("load_session_insights_record");
    expect(
      traitLeaks,
      "session insights 的 COUNT/SUM SQL 与 i64 -> usize 聚合规则必须归属 current session SQL/read model；Aster trait adapter 只能把 current record 回填 SessionInsights DTO",
    ).toEqual([]);
  });

  it("session token stats 写入必须离开 Aster trait adapter", () => {
    const traitPath =
      "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs";
    const currentOwnerPath =
      "lime-rs/crates/core/src/database/agent_session_repository.rs";
    const traitSource = readFileSync(join(REPO_ROOT, traitPath), "utf8");
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const traitLeaks =
      ASTER_SESSION_TRAIT_FORBIDDEN_TOKEN_STATS_SQL_SNIPPETS.filter((snippet) =>
        traitSource.includes(snippet),
      ).map((snippet) => `${traitPath}: ${snippet}`);

    expect(currentOwnerSource).toContain("pub struct SessionTokenStatsUpdate");
    expect(currentOwnerSource).toContain("pub fn update_session_token_stats");
    expect(currentOwnerSource).toContain("normalized_schedule_id");
    expect(currentOwnerSource).not.toContain("aster::");
    expect(traitSource).toContain("SessionTokenStatsUpdate");
    expect(traitSource).toContain("update_session_token_stats_record");
    expect(
      traitLeaks,
      "session token stats 的 None=保留旧值、schedule_id 归一化和 COALESCE SQL 必须归属 current repository；Aster trait adapter 只能映射 TokenStatsUpdate DTO 并同步 metadata cache",
    ).toEqual([]);
  });

  it("session provider config 写入必须离开 Aster trait adapter", () => {
    const traitPath =
      "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs";
    const currentOwnerPath =
      "lime-rs/crates/core/src/database/agent_session_repository.rs";
    const traitSource = readFileSync(join(REPO_ROOT, traitPath), "utf8");
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const traitLeaks =
      ASTER_SESSION_TRAIT_FORBIDDEN_PROVIDER_CONFIG_SQL_SNIPPETS.filter(
        (snippet) => traitSource.includes(snippet),
      ).map((snippet) => `${traitPath}: ${snippet}`);

    expect(currentOwnerSource).toContain(
      "pub struct SessionProviderConfigUpdate",
    );
    expect(currentOwnerSource).toContain(
      "pub fn update_session_provider_config",
    );
    expect(currentOwnerSource).toContain(
      "provider_name: normalize_optional_text",
    );
    expect(currentOwnerSource).toContain("model_name: normalize_optional_text");
    expect(currentOwnerSource).not.toContain("aster::");
    expect(traitSource).toContain("SessionProviderConfigUpdate");
    expect(traitSource).toContain("update_session_provider_config_record");
    expect(
      traitLeaks,
      "session provider/model config 的文本归一化、None=保留旧值和 SQL 写入必须归属 current repository；Aster trait adapter 只能序列化 ModelConfig、映射 DTO 并同步 metadata cache",
    ).toEqual([]);
  });

  it("session metadata 写入必须离开 Aster trait adapter", () => {
    const traitPath =
      "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs";
    const currentOwnerPath =
      "lime-rs/crates/core/src/database/agent_session_repository.rs";
    const traitSource = readFileSync(join(REPO_ROOT, traitPath), "utf8");
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const traitLeaks =
      ASTER_SESSION_TRAIT_FORBIDDEN_METADATA_SQL_SNIPPETS.filter((snippet) =>
        traitSource.includes(snippet),
      ).map((snippet) => `${traitPath}: ${snippet}`);

    expect(currentOwnerSource).toContain("pub fn update_session_name");
    expect(currentOwnerSource).toContain(
      "pub fn update_session_working_dir_with_updated_at",
    );
    expect(currentOwnerSource).toContain("pub fn update_session_type");
    expect(currentOwnerSource).toContain(
      "UPDATE agent_sessions SET title = ?1, user_set_name = ?2, updated_at = ?3 WHERE id = ?4",
    );
    expect(currentOwnerSource).toContain(
      "UPDATE agent_sessions SET working_dir = ?1, updated_at = ?2 WHERE id = ?3",
    );
    expect(currentOwnerSource).toContain(
      "UPDATE agent_sessions SET session_type = ?1, updated_at = ?2 WHERE id = ?3",
    );
    expect(currentOwnerSource).not.toContain("aster::");
    expect(traitSource).toContain("update_session_name_record");
    expect(traitSource).toContain("update_session_working_dir_record");
    expect(traitSource).toContain("update_session_type_record");
    expect(
      traitLeaks,
      "session name / working_dir / session_type 的 SQL 和 user_set_name 写入语义必须归属 current repository；Aster trait adapter 只能映射 DTO 并同步 metadata cache",
    ).toEqual([]);
  });

  it("session extension_data 写入必须离开 Aster trait adapter", () => {
    const traitPath =
      "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs";
    const currentOwnerPath =
      "lime-rs/crates/core/src/database/agent_session_repository.rs";
    const traitSource = readFileSync(join(REPO_ROOT, traitPath), "utf8");
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const traitLeaks =
      ASTER_SESSION_TRAIT_FORBIDDEN_EXTENSION_DATA_SQL_SNIPPETS.filter(
        (snippet) => traitSource.includes(snippet),
      ).map((snippet) => `${traitPath}: ${snippet}`);

    expect(currentOwnerSource).toContain(
      "pub fn update_session_extension_data",
    );
    expect(currentOwnerSource).toContain("extension_data_json = ?1");
    expect(currentOwnerSource).not.toContain("aster::");
    expect(traitSource).toContain("update_session_extension_data_record");
    expect(
      traitLeaks,
      "session extension_data 的直接覆盖 SQL 必须归属 current repository；Aster trait adapter 只能序列化 ExtensionData DTO 并同步 metadata cache",
    ).toEqual([]);
  });

  it("session recipe 写入必须离开 Aster trait adapter", () => {
    const traitPath =
      "lime-rs/crates/agent/src/aster_session_store/aster_trait.rs";
    const currentOwnerPath =
      "lime-rs/crates/core/src/database/agent_session_repository.rs";
    const traitSource = readFileSync(join(REPO_ROOT, traitPath), "utf8");
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const traitLeaks = ASTER_SESSION_TRAIT_FORBIDDEN_RECIPE_SQL_SNIPPETS.filter(
      (snippet) => traitSource.includes(snippet),
    ).map((snippet) => `${traitPath}: ${snippet}`);

    expect(currentOwnerSource).toContain("pub struct SessionRecipeUpdate");
    expect(currentOwnerSource).toContain("pub fn update_session_recipe");
    expect(currentOwnerSource).toContain("recipe_json = ?1");
    expect(currentOwnerSource).toContain("user_recipe_values_json = ?2");
    expect(currentOwnerSource).not.toContain("aster::");
    expect(traitSource).toContain("SessionRecipeUpdate");
    expect(traitSource).toContain("update_session_recipe_record");
    expect(
      traitLeaks,
      "session recipe 的直接覆盖/清空语义和 SQL 写入必须归属 current repository；Aster trait adapter 只能序列化 Recipe/user_recipe_values DTO 并同步 metadata cache",
    ).toEqual([]);
  });

  it("session runtime provider routing metadata 不得依赖 Aster ExtensionState", () => {
    const sessionStorePath = "lime-rs/crates/agent/src/session_store.rs";
    const runtimeDetailPath =
      "lime-rs/crates/agent/src/session_store_runtime_detail.rs";
    const currentOwnerPath =
      "lime-rs/crates/agent/src/session_store_provider_routing.rs";
    const repositoryPath =
      "lime-rs/crates/core/src/database/agent_session_repository.rs";
    const sessionStoreSource = readFileSync(
      join(REPO_ROOT, sessionStorePath),
      "utf8",
    );
    const runtimeDetailSource = readFileSync(
      join(REPO_ROOT, runtimeDetailPath),
      "utf8",
    );
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const repositorySource = readFileSync(
      join(REPO_ROOT, repositoryPath),
      "utf8",
    );

    expect(currentOwnerSource).toContain("read_session_provider_selector");
    expect(currentOwnerSource).toContain("PROVIDER_SELECTOR_POINTERS");
    expect(currentOwnerSource).not.toContain("aster::");
    expect(runtimeDetailSource).toContain("read_session_provider_selector");
    expect(repositorySource).toContain("get_session_extension_data_json");

    const sessionStoreLeaks =
      SESSION_STORE_FORBIDDEN_ASTER_PROVIDER_ROUTING_SNIPPETS.filter(
        (snippet) => sessionStoreSource.includes(snippet),
      ).map((snippet) => `${sessionStorePath}: ${snippet}`);
    const runtimeDetailLeaks =
      SESSION_STORE_RUNTIME_DETAIL_FORBIDDEN_PROVIDER_ROUTING_SNIPPETS.filter(
        (snippet) => runtimeDetailSource.includes(snippet),
      ).map((snippet) => `${runtimeDetailPath}: ${snippet}`);

    expect(
      sessionStoreLeaks,
      "session_store.rs 不得为了 execution runtime provider selector 重新引入 Aster ExtensionState / Session DTO；该 metadata 必须从 current persisted JSON helper 解析",
    ).toEqual([]);
    expect(
      runtimeDetailLeaks,
      "runtime detail 主链只能消费 current provider routing helper，不得直接解析 Aster session.extension_data",
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
    const currentQueryPath =
      "lime-rs/crates/agent/src/session_runtime_conversation_query.rs";
    const compatAdapterPath =
      "lime-rs/crates/agent/src/runtime_conversation_aster_adapter.rs";
    const currentOwnerPath =
      "lime-rs/crates/thread-store/src/conversation_transcript.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const currentQuerySource = readFileSync(
      join(REPO_ROOT, currentQueryPath),
      "utf8",
    );
    const compatAdapterSource = readFileSync(
      join(REPO_ROOT, compatAdapterPath),
      "utf8",
    );
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const productionSource = source.split("#[cfg(test)]")[0] ?? source;
    const currentQueryProductionSource =
      currentQuerySource.split("#[cfg(test)]")[0] ?? currentQuerySource;
    const compatAdapterProductionSource =
      compatAdapterSource.split("#[cfg(test)]")[0] ?? compatAdapterSource;
    const leaks =
      ASTER_RUNTIME_CONVERSATION_FORBIDDEN_TRANSCRIPT_HELPERS.filter(
        (snippet) => productionSource.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);
    const callsitePayloadLeaks =
      RUNTIME_CONVERSATION_CALLSITE_FORBIDDEN_ASTER_PAYLOAD_SNIPPETS.flatMap(
        (snippet) =>
          [
            [filePath, productionSource],
            [currentQueryPath, currentQueryProductionSource],
          ]
            .filter(([, checkedSource]) => checkedSource.includes(snippet))
            .map(([checkedPath]) => `${checkedPath}: ${snippet}`),
      );

    expect(
      existsSync(
        join(
          REPO_ROOT,
          "lime-rs/crates/thread-store/src/conversation_transcript.rs",
        ),
      ),
      "thread-store 必须拥有 conversation transcript 纯规则模块",
    ).toBe(true);
    expect(currentOwnerSource).toContain(
      "pub enum RuntimeConversationItemSource",
    );
    expect(currentOwnerSource).toContain(
      "pub fn project_runtime_conversation_record",
    );
    expect(productionSource).toContain("thread_store::conversation_transcript");
    expect(productionSource).toContain("conversation_record_from_aster_item");
    expect(productionSource).toContain("build_aster_transcript_item");
    expect(currentQueryProductionSource).toContain(
      "collect_conversation_records_from_aster_runtime_store",
    );
    expect(currentQueryProductionSource).not.toContain(
      "conversation_record_from_aster_item",
    );
    expect(currentQueryProductionSource).not.toContain("aster::");
    expect(currentQueryProductionSource).not.toContain("ThreadRuntimeStore");
    expect(compatAdapterProductionSource).toContain(
      "collect_conversation_records_from_aster_runtime_store",
    );
    expect(compatAdapterProductionSource).toContain("ThreadRuntimeStore");
    expect(compatAdapterProductionSource).toContain(
      "RuntimeConversationItemSource",
    );
    expect(compatAdapterProductionSource).toContain(
      "project_runtime_conversation_record",
    );
    expect(compatAdapterProductionSource).toContain(
      "ItemRuntimePayload::TranscriptMessage",
    );
    expect(compatAdapterProductionSource).toContain(
      "ItemRuntimePayload::UserMessage",
    );
    expect(compatAdapterProductionSource).toContain(
      "ItemRuntimePayload::AgentMessage",
    );
    expect(
      leaks,
      "conversation transcript 的选择、计数、record 构造和稳定 item id 规则必须归属 thread-store；runtime_conversation 只能调用 current owner 与窄 compat adapter",
    ).toEqual([]);
    expect(
      callsitePayloadLeaks,
      "Aster conversation payload 三分支只能出现在 runtime_conversation_aster_adapter.rs；runtime detail query 与 aster_session_store/runtime_conversation.rs 不得复制映射",
    ).toEqual([]);
  });

  it("session history search 规则必须归属 thread-store current owner", () => {
    const adapterPath =
      "lime-rs/crates/agent/src/aster_session_store/history_search.rs";
    const currentOwnerPath =
      "lime-rs/crates/thread-store/src/history_search.rs";
    const libPath = "lime-rs/crates/thread-store/src/lib.rs";
    const adapterSource = readFileSync(join(REPO_ROOT, adapterPath), "utf8");
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const libSource = readFileSync(join(REPO_ROOT, libPath), "utf8");
    const adapterProductionSource =
      adapterSource.split("#[cfg(test)]")[0] ?? adapterSource;
    const leaks = ASTER_HISTORY_SEARCH_FORBIDDEN_CURRENT_RULE_SNIPPETS.filter(
      (snippet) => adapterProductionSource.includes(snippet),
    ).map((snippet) => `${adapterPath}: ${snippet}`);

    expect(libSource).toContain("pub mod history_search;");
    expect(currentOwnerSource).toContain(
      "pub struct SessionHistorySearchRecord",
    );
    expect(currentOwnerSource).toContain(
      "pub struct ConversationHistoryMessageRecord",
    );
    expect(currentOwnerSource).toContain("pub struct ChatHistoryMatchRecord");
    expect(currentOwnerSource).toContain("pub fn search_chat_history_records");
    expect(currentOwnerSource).not.toContain("aster::");
    expect(adapterProductionSource).toContain("search_chat_history_records");
    expect(adapterProductionSource).toContain("SessionHistorySearchRecord");
    expect(adapterProductionSource).toContain("ChatHistoryMatch");
    expect(adapterProductionSource).not.toContain("fn runtime_message_role");
    expect(
      leaks,
      "session history search 的 query normalization、limit、timestamp fallback 与 relevance 规则必须归属 thread-store；Aster adapter 只能转换 Session/Message DTO 和返回 ChatHistoryMatch",
    ).toEqual([]);
  });

  it("session todo task board 投影规则必须归属 thread-store current owner", () => {
    const adapterPath =
      "lime-rs/crates/agent/src/session_store_todo_aster_adapter.rs";
    const deletedProjectionPath =
      "lime-rs/crates/agent/src/session_store_todo_projection.rs";
    const currentOwnerPath = "lime-rs/crates/thread-store/src/task_board.rs";
    const threadStoreLibPath = "lime-rs/crates/thread-store/src/lib.rs";
    const sessionStorePath = "lime-rs/crates/agent/src/session_store.rs";
    const adapterSource = readFileSync(join(REPO_ROOT, adapterPath), "utf8");
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const threadStoreLibSource = readFileSync(
      join(REPO_ROOT, threadStoreLibPath),
      "utf8",
    );
    const sessionStoreSource = readFileSync(
      join(REPO_ROOT, sessionStorePath),
      "utf8",
    );
    const adapterProductionSource =
      adapterSource.split("#[cfg(test)]")[0] ?? adapterSource;
    const leaks =
      SESSION_TODO_ASTER_ADAPTER_FORBIDDEN_CURRENT_RULE_SNIPPETS.filter(
        (snippet) => adapterProductionSource.includes(snippet),
      ).map((snippet) => `${adapterPath}: ${snippet}`);

    expect(threadStoreLibSource).toContain("pub mod task_board;");
    expect(currentOwnerSource).toContain("pub enum TaskBoardStatusRecord");
    expect(currentOwnerSource).toContain("pub struct TaskBoardItemRecord");
    expect(currentOwnerSource).toContain("pub enum SessionTodoStatusRecord");
    expect(currentOwnerSource).toContain("pub struct SessionTodoItemRecord");
    expect(currentOwnerSource).toContain("pub fn project_session_todo_records");
    expect(currentOwnerSource).not.toContain("aster::");
    expect(existsSync(join(REPO_ROOT, deletedProjectionPath))).toBe(false);
    expect(sessionStoreSource).not.toContain(
      "mod session_store_todo_projection",
    );
    expect(adapterProductionSource).toContain("resolve_task_board_state");
    expect(adapterProductionSource).toContain("TaskBoardItemRecord");
    expect(adapterProductionSource).toContain("project_session_todo_records");
    expect(adapterProductionSource).toContain("SessionTodoItem");
    expect(
      leaks,
      "session todo 的 subject trim、空项过滤、active_form 归一化与状态投影规则必须归属 thread-store；Aster adapter 只能转换 ExtensionData/TaskBoard DTO 并回填 SessionTodoItem",
    ).toEqual([]);
  });

  it("Aster session memory stub 与自动注入必须保持删除态", () => {
    const adapterPath =
      "lime-rs/crates/agent/src/aster_session_store/memory_stub.rs";
    const currentOwnerPath = "lime-rs/crates/thread-store/src/memory_stub.rs";
    const threadStoreLibPath = "lime-rs/crates/thread-store/src/lib.rs";
    const asterSessionModPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/session/mod.rs";
    const asterSessionStorePath =
      "lime-rs/vendor/aster-rust/crates/aster/src/session/store.rs";
    const asterSessionManagerPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/session/session_manager.rs";
    const asterAgentPath =
      "lime-rs/vendor/aster-rust/crates/aster/src/agents/agent.rs";
    const deletedVendorMemoryPaths = [
      "lime-rs/vendor/aster-rust/crates/aster/src/session/memory.rs",
      "lime-rs/vendor/aster-rust/crates/aster/src/session/memory_deduplicator.rs",
      "lime-rs/vendor/aster-rust/crates/aster/src/session/memory_extractor.rs",
      "lime-rs/vendor/aster-rust/crates/aster/src/session/memory_pipeline.rs",
      "lime-rs/vendor/aster-rust/crates/aster/src/session/memory_repository.rs",
      "lime-rs/vendor/aster-rust/crates/aster/src/session/memory_retriever.rs",
    ];
    const threadStoreLibSource = readFileSync(
      join(REPO_ROOT, threadStoreLibPath),
      "utf8",
    );
    const asterSessionModSource = readFileSync(
      join(REPO_ROOT, asterSessionModPath),
      "utf8",
    );
    const asterSessionStoreSource = readFileSync(
      join(REPO_ROOT, asterSessionStorePath),
      "utf8",
    );
    const asterSessionManagerSource = readFileSync(
      join(REPO_ROOT, asterSessionManagerPath),
      "utf8",
    );
    const asterAgentSource = readFileSync(
      join(REPO_ROOT, asterAgentPath),
      "utf8",
    );
    const asterAgentProductionSource =
      asterAgentSource.split("#[cfg(test)]")[0] ?? asterAgentSource;

    expect(existsSync(join(REPO_ROOT, adapterPath))).toBe(false);
    expect(existsSync(join(REPO_ROOT, currentOwnerPath))).toBe(false);
    for (const deletedPath of deletedVendorMemoryPaths) {
      expect(existsSync(join(REPO_ROOT, deletedPath))).toBe(false);
    }
    expect(threadStoreLibSource).not.toContain("pub mod memory_stub;");
    expect(asterSessionModSource).not.toContain("mod memory");
    expect(asterSessionModSource).not.toContain("pub use memory::");
    expect(asterSessionStoreSource).not.toContain("CommitReport");
    expect(asterSessionStoreSource).not.toContain("MemorySearchResult");
    expect(asterSessionStoreSource).not.toContain("async fn commit_session");
    expect(asterSessionStoreSource).not.toContain("async fn search_memories");
    expect(asterSessionStoreSource).not.toContain(
      "async fn retrieve_context_memories",
    );
    expect(asterSessionManagerSource).not.toContain("memory_pipeline");
    expect(asterSessionManagerSource).not.toContain("memory_retriever");
    expect(asterSessionManagerSource).not.toContain("MemoryRepository");
    expect(asterSessionManagerSource).not.toContain("CREATE TABLE memories");
    expect(asterSessionManagerSource).not.toContain(
      "CREATE TABLE memory_links",
    );
    expect(asterSessionManagerSource).not.toContain(
      "CREATE TABLE memory_events",
    );
    expect(asterAgentProductionSource).not.toContain(
      "retrieve_context_memories",
    );
    expect(asterAgentProductionSource).toContain(
      'push_trace("memory_injection", "removed=lime_memory_tools"',
    );
  });

  it("legacy conversation content_json 解析规则必须归属 thread-store current owner", () => {
    const adapterPath =
      "lime-rs/crates/agent/src/aster_session_store/legacy_conversation.rs";
    const currentOwnerPath =
      "lime-rs/crates/thread-store/src/legacy_conversation.rs";
    const threadStoreLibPath = "lime-rs/crates/thread-store/src/lib.rs";
    const adapterSource = readFileSync(join(REPO_ROOT, adapterPath), "utf8");
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const threadStoreLibSource = readFileSync(
      join(REPO_ROOT, threadStoreLibPath),
      "utf8",
    );
    const leaks =
      ASTER_LEGACY_CONVERSATION_FORBIDDEN_CURRENT_RULE_SNIPPETS.filter(
        (snippet) => adapterSource.includes(snippet),
      ).map((snippet) => `${adapterPath}: ${snippet}`);

    expect(threadStoreLibSource).toContain("pub mod legacy_conversation;");
    expect(currentOwnerSource).toContain(
      "pub struct LegacyConversationMessageContentRecord",
    );
    expect(currentOwnerSource).toContain(
      "pub struct LegacyConversationMessageRecord",
    );
    expect(currentOwnerSource).toContain(
      "pub fn serialize_persisted_legacy_message_content_record",
    );
    expect(currentOwnerSource).toContain(
      "pub fn deserialize_persisted_legacy_message_content_record",
    );
    expect(currentOwnerSource).toContain(
      "pub fn project_legacy_conversation_message_record",
    );
    expect(currentOwnerSource).not.toContain("aster::");
    expect(adapterSource).toContain(
      "project_legacy_conversation_message_record",
    );
    expect(adapterSource).toContain("message_from_legacy_record");
    expect(adapterSource).toContain("MessageContent");
    expect(
      leaks,
      "legacy agent_messages.content_json envelope、visibility 默认值和 role 归一化必须归属 thread-store；Aster adapter 只能把 current JSON record 转成 MessageContent / Conversation DTO",
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

  it("message_content_adapter 不得恢复无消费者 runtime message 包装函数", () => {
    const filePath = "lime-rs/crates/agent/src/message_content_adapter.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");

    expect(source).toContain(
      "convert_aster_message_to_runtime_message_with_turn_context",
    );
    expect(source).not.toContain(
      "fn convert_aster_message_to_runtime_message(",
    );
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
    const runtimeTimelineAdapterPath =
      "lime-rs/crates/agent/src/runtime_timeline_adapter.rs";
    const runtimeTimelineOwnerPath =
      "lime-rs/crates/agent-runtime/src/runtime_timeline.rs";
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const runtimeTimelineOwnerSource = readFileSync(
      join(REPO_ROOT, runtimeTimelineOwnerPath),
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
    const runtimeTimelineAdapterSource = readFileSync(
      join(REPO_ROOT, runtimeTimelineAdapterPath),
      "utf8",
    );

    expect(currentOwnerSource).toContain(
      "pub struct SessionExecutionRuntimeSessionProjection<Usage>",
    );
    expect(currentOwnerSource).toContain(
      "pub struct SessionExecutionRuntimeSessionSource<UsageSource>",
    );
    expect(currentOwnerSource).toContain(
      "pub fn project_session_execution_runtime_session",
    );
    expect(currentOwnerSource).toContain(
      "pub const SESSION_RECENT_ACCESS_MODE_EXTENSION_NAME",
    );
    expect(currentOwnerSource).toContain(
      "pub struct SessionExecutionRuntimeUsageSource",
    );
    expect(currentOwnerSource).toContain(
      "pub struct SessionExecutionRuntimeUsageProjection",
    );
    expect(currentOwnerSource).toContain(
      "pub fn project_session_execution_runtime_usage",
    );
    expect(currentOwnerSource).toContain(
      "pub struct SessionExecutionRuntimeSnapshotProjection<Context>",
    );
    expect(currentOwnerSource).toContain(
      "pub struct SessionExecutionRuntimeTurnProjection<Context>",
    );
    expect(currentOwnerSource).toContain(
      "pub struct SessionExecutionRuntimeSnapshotSource<Context>",
    );
    expect(currentOwnerSource).toContain(
      "pub struct SessionExecutionRuntimeThreadSource<Context>",
    );
    expect(currentOwnerSource).toContain(
      "pub struct SessionExecutionRuntimeTurnSource<Context>",
    );
    expect(currentOwnerSource).toContain(
      "pub fn project_session_execution_runtime_snapshot",
    );
    expect(runtimeTimelineOwnerSource).toContain(
      "pub struct RuntimeTimelineSnapshotProjection<Turn, Item>",
    );
    expect(runtimeTimelineOwnerSource).toContain(
      "pub enum RuntimeTimelineTurnStatus",
    );
    expect(runtimeTimelineOwnerSource).toContain(
      "pub struct RuntimeTimelineTurnProjection",
    );
    expect(runtimeTimelineOwnerSource).toContain(
      "pub enum RuntimeTimelineItemStatus",
    );
    expect(runtimeTimelineOwnerSource).toContain(
      "pub enum RuntimeTimelineItemPayload",
    );
    expect(runtimeTimelineOwnerSource).toContain(
      "pub struct RuntimeTimelineRequestQuestion",
    );
    expect(runtimeTimelineOwnerSource).toContain(
      "pub struct RuntimeTimelineItemProjection",
    );
    expect(runtimeTimelineOwnerSource).toContain(
      "pub struct RuntimeTimelineSnapshotSource<Turn, Item>",
    );
    expect(runtimeTimelineOwnerSource).toContain(
      "pub struct RuntimeTimelineSnapshotThread<Turn, Item>",
    );
    expect(runtimeTimelineOwnerSource).toContain(
      "pub fn project_runtime_timeline_snapshot",
    );
    expect(runtimeTimelineOwnerSource).toContain(
      "pub fn extract_runtime_request_questions_from_schema",
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
      "pub struct SubagentRuntimeSnapshotProjection",
    );
    expect(currentOwnerSource).toContain(
      "pub struct SubagentRuntimeThreadProjection",
    );
    expect(currentOwnerSource).toContain(
      "pub struct SubagentRuntimeTurnProjection",
    );
    expect(currentOwnerSource).toContain("pub enum SubagentRuntimeItemKind");
    expect(currentOwnerSource).toContain(
      "pub struct SubagentRuntimeItemProjection",
    );
    expect(currentOwnerSource).toContain("pub fn project_subagent_latest_turn");
    expect(currentOwnerSource).toContain(
      "pub struct SessionRuntimeSnapshotOverlay<ExecutionSnapshot, TimelineSnapshot>",
    );
    expect(currentOwnerSource).toContain(
      "pub subagent_latest_turn: Option<SubagentLatestTurnProjection>",
    );
    expect(currentOwnerSource).not.toContain("aster::");
    expect(runtimeTimelineOwnerSource).not.toContain("aster::");
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
      "agent_runtime::runtime_timeline::RuntimeTimelineSnapshotProjection",
    );
    expect(runtimeSnapshotAdapterSource).toContain(
      "project_runtime_snapshot_record",
    );
    expect(runtimeSnapshotAdapterSource).not.toContain(
      "project_runtime_timeline_snapshot(",
    );
    expect(runtimeSnapshotAdapterSource).not.toContain(
      "RuntimeTimelineSnapshotSource",
    );
    expect(runtimeSnapshotAdapterSource).not.toContain(
      "RuntimeTimelineSnapshotThread",
    );
    expect(runtimeTimelineAdapterSource).toContain(
      "project_runtime_timeline_snapshot_record",
    );
    expect(runtimeTimelineAdapterSource).toContain(
      "project_runtime_timeline_snapshot",
    );
    expect(runtimeTimelineAdapterSource).toContain(
      "RuntimeTimelineSnapshotSource",
    );
    expect(runtimeTimelineAdapterSource).toContain(
      "RuntimeTimelineSnapshotThread",
    );
    expect(runtimeSnapshotAdapterSource).not.toContain(
      "pub(crate) struct RuntimeTimelineSnapshotProjection",
    );
  });

  it("runtime timeline snapshot projector 必须归属 agent-runtime current owner", () => {
    const runtimeSnapshotAdapterPath =
      "lime-rs/crates/agent/src/runtime_snapshot_adapter.rs";
    const runtimeTimelineAdapterPath =
      "lime-rs/crates/agent/src/runtime_timeline_adapter.rs";
    const currentOwnerPath =
      "lime-rs/crates/agent-runtime/src/runtime_timeline.rs";
    const runtimeSnapshotAdapterSource = readFileSync(
      join(REPO_ROOT, runtimeSnapshotAdapterPath),
      "utf8",
    );
    const runtimeTimelineAdapterSource = readFileSync(
      join(REPO_ROOT, runtimeTimelineAdapterPath),
      "utf8",
    );
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const productionSnapshotSource =
      runtimeSnapshotAdapterSource.split("#[cfg(test)]")[0] ??
      runtimeSnapshotAdapterSource;
    const productionTimelineSource =
      runtimeTimelineAdapterSource.split("#[cfg(test)]")[0] ??
      runtimeTimelineAdapterSource;
    const snapshotLeaks =
      RUNTIME_SNAPSHOT_ADAPTER_FORBIDDEN_TIMELINE_RULE_SNIPPETS.filter(
        (snippet) => productionSnapshotSource.includes(snippet),
      ).map((snippet) => `${runtimeSnapshotAdapterPath}: ${snippet}`);
    const timelineLeaks =
      RUNTIME_TIMELINE_ADAPTER_FORBIDDEN_DAO_STATUS_SNIPPETS.filter((snippet) =>
        productionTimelineSource.includes(snippet),
      ).map((snippet) => `${runtimeTimelineAdapterPath}: ${snippet}`);
    const timelineStatusRuleLeaks =
      RUNTIME_TIMELINE_ADAPTER_FORBIDDEN_CURRENT_STATUS_RULE_SNIPPETS.filter(
        (snippet) => productionTimelineSource.includes(snippet),
      ).map((snippet) => `${runtimeTimelineAdapterPath}: ${snippet}`);
    const timelinePayloadRuleLeaks =
      RUNTIME_TIMELINE_ADAPTER_FORBIDDEN_CURRENT_PAYLOAD_RULE_SNIPPETS.filter(
        (snippet) => productionTimelineSource.includes(snippet),
      ).map((snippet) => `${runtimeTimelineAdapterPath}: ${snippet}`);
    const timelineProjectionRuleLeaks =
      RUNTIME_TIMELINE_ADAPTER_FORBIDDEN_CURRENT_PROJECTION_RULE_SNIPPETS.filter(
        (snippet) => productionTimelineSource.includes(snippet),
      ).map((snippet) => `${runtimeTimelineAdapterPath}: ${snippet}`);

    expect(currentOwnerSource).toContain(
      "pub fn project_runtime_timeline_snapshot",
    );
    expect(currentOwnerSource).toContain(
      "pub struct RuntimeTimelineTurnSource",
    );
    expect(currentOwnerSource).toContain(
      "pub struct RuntimeTimelineItemSource",
    );
    expect(currentOwnerSource).toContain(
      "pub enum RuntimeTimelineTurnStatusSource",
    );
    expect(currentOwnerSource).toContain(
      "pub enum RuntimeTimelineItemStatusSource",
    );
    expect(currentOwnerSource).toContain(
      "pub fn project_runtime_timeline_turn",
    );
    expect(currentOwnerSource).toContain(
      "pub fn project_runtime_timeline_item",
    );
    expect(currentOwnerSource).toContain(
      "pub enum RuntimeTimelineItemPayloadSource",
    );
    expect(currentOwnerSource).toContain(
      "pub const RUNTIME_REQUEST_QUESTIONS_SCHEMA_KEY",
    );
    expect(currentOwnerSource).toContain(
      "pub fn project_runtime_timeline_item_payload",
    );
    expect(currentOwnerSource).toContain(
      "pub fn project_runtime_status_timeline_payload",
    );
    expect(currentOwnerSource).toContain(
      "pub fn format_runtime_status_timeline_text",
    );
    expect(currentOwnerSource).toContain(
      "pub fn build_diagnostics_runtime_status_metadata",
    );
    expect(runtimeSnapshotAdapterSource).toContain(
      "project_runtime_snapshot_record",
    );
    expect(runtimeTimelineAdapterSource).toContain(
      "project_runtime_timeline_snapshot_record",
    );
    expect(runtimeTimelineAdapterSource).toContain(
      "project_runtime_timeline_snapshot",
    );
    expect(runtimeTimelineAdapterSource).toContain(
      "RuntimeTimelineSnapshotSource",
    );
    expect(runtimeTimelineAdapterSource).toContain(
      "RuntimeTimelineSnapshotThread",
    );
    expect(runtimeTimelineAdapterSource).toContain(
      "RuntimeTimelineTurnProjection",
    );
    expect(runtimeTimelineAdapterSource).toContain(
      "RuntimeTimelineItemProjection",
    );
    expect(runtimeTimelineAdapterSource).toContain(
      "RuntimeTimelineItemPayload",
    );
    expect(runtimeTimelineAdapterSource).toContain(
      "RuntimeTimelineItemPayloadSource",
    );
    expect(runtimeTimelineAdapterSource).toContain(
      "project_runtime_timeline_turn",
    );
    expect(runtimeTimelineAdapterSource).toContain(
      "project_runtime_timeline_item",
    );
    expect(runtimeTimelineAdapterSource).toContain("RuntimeTimelineTurnSource");
    expect(runtimeTimelineAdapterSource).toContain("RuntimeTimelineItemSource");
    expect(
      existsSync(
        join(REPO_ROOT, "lime-rs/crates/agent/src/text_normalization.rs"),
      ),
      "runtime status text normalization 已迁入 agent-runtime::runtime_timeline；不得恢复 lime-agent 旧 helper 文件",
    ).toBe(false);
    expect(
      snapshotLeaks,
      "runtime snapshot 的 timeline flatten/thread_id 规则必须归属 agent-runtime current owner；Aster snapshot adapter 只能构造 current source 并投影到 GUI DTO",
    ).toEqual([]);
    expect(
      timelineLeaks,
      "runtime_timeline_adapter 只能做 Aster DTO 到 current timeline DTO 的字段映射，不得重新直接输出 GUI timeline status DTO",
    ).toEqual([]);
    expect(
      timelineStatusRuleLeaks,
      "runtime status timeline text/metadata 规则必须归属 agent-runtime current owner；Aster timeline adapter 只能转交 Aster 字段",
    ).toEqual([]);
    expect(
      timelinePayloadRuleLeaks,
      "runtime timeline item payload 展示/忽略/request schema/phase 默认规则必须归属 agent-runtime current owner；Aster timeline adapter 只能构造 current source",
    ).toEqual([]);
    expect(
      timelineProjectionRuleLeaks,
      "runtime timeline turn/item projection、status 折叠和 prompt/start fallback 规则必须归属 agent-runtime current owner；Aster timeline adapter 只能构造 current source",
    ).toEqual([]);
  });

  it("runtime snapshot record 必须归属 thread-store current owner", () => {
    const currentOwnerPath =
      "lime-rs/crates/thread-store/src/runtime_snapshot.rs";
    const storeAdapterPath =
      "lime-rs/crates/agent/src/runtime_store_aster_adapter.rs";
    const runtimeSupportPath = "lime-rs/crates/agent/src/runtime_support.rs";
    const runtimeSnapshotAdapterPath =
      "lime-rs/crates/agent/src/runtime_snapshot_adapter.rs";
    const runtimeTimelineAdapterPath =
      "lime-rs/crates/agent/src/runtime_timeline_adapter.rs";
    const sessionExecutionAdapterPath =
      "lime-rs/crates/agent/src/session_execution_runtime_adapter.rs";
    const subagentAdapterPath =
      "lime-rs/crates/agent/src/subagent_runtime_adapter.rs";
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const storeAdapterSource = readFileSync(
      join(REPO_ROOT, storeAdapterPath),
      "utf8",
    );
    const runtimeSupportSource = readFileSync(
      join(REPO_ROOT, runtimeSupportPath),
      "utf8",
    );
    const runtimeSnapshotAdapterSource = readFileSync(
      join(REPO_ROOT, runtimeSnapshotAdapterPath),
      "utf8",
    );
    const runtimeTimelineAdapterSource = readFileSync(
      join(REPO_ROOT, runtimeTimelineAdapterPath),
      "utf8",
    );
    const sessionExecutionAdapterSource = readFileSync(
      join(REPO_ROOT, sessionExecutionAdapterPath),
      "utf8",
    );
    const subagentAdapterSource = readFileSync(
      join(REPO_ROOT, subagentAdapterPath),
      "utf8",
    );
    const wrapperSources: Array<{
      filePath: string;
      source: string;
      snippets: string[];
    }> = [
      {
        filePath: runtimeSnapshotAdapterPath,
        source: runtimeSnapshotAdapterSource,
        snippets: [
          "SessionRuntimeSnapshot",
          "runtime_snapshot_record_from_aster",
          "project_aster_runtime_snapshot",
        ],
      },
      {
        filePath: runtimeTimelineAdapterPath,
        source: runtimeTimelineAdapterSource,
        snippets: ["project_aster_runtime_timeline_snapshot"],
      },
      {
        filePath: sessionExecutionAdapterPath,
        source: sessionExecutionAdapterSource,
        snippets: [
          "SessionRuntimeSnapshot",
          "runtime_snapshot_record_from_aster",
          "project_aster_session_execution_runtime_snapshot",
        ],
      },
      {
        filePath: subagentAdapterPath,
        source:
          subagentAdapterSource.split("#[cfg(test)]")[0] ??
          subagentAdapterSource,
        snippets: [
          "SessionRuntimeSnapshot",
          "runtime_snapshot_record_from_aster",
          "project_aster_subagent_latest_turn",
        ],
      },
    ];
    const wrapperLeaks = wrapperSources.flatMap(
      ({ filePath, source, snippets }) =>
        snippets
          .filter((snippet) => source.includes(snippet))
          .map((snippet) => `${filePath}: ${snippet}`),
    );

    expect(currentOwnerSource).toContain(
      "pub struct RuntimeSessionSnapshotRecord",
    );
    expect(currentOwnerSource).toContain(
      "pub struct RuntimeThreadSnapshotRecord",
    );
    expect(currentOwnerSource).toContain(
      "pub struct RuntimeTurnSnapshotRecord",
    );
    expect(currentOwnerSource).toContain(
      "pub struct RuntimeItemSnapshotRecord",
    );
    expect(currentOwnerSource).toContain("pub enum RuntimeItemPayloadRecord");
    expect(currentOwnerSource).not.toContain("aster::");
    expect(currentOwnerSource).not.toContain("SessionRuntimeSnapshot");
    expect(storeAdapterSource).toContain(
      "pub(crate) fn runtime_snapshot_record_from_aster",
    );
    expect(storeAdapterSource).toContain(
      "pub(crate) fn runtime_turn_record_from_aster",
    );
    expect(storeAdapterSource).toContain(
      "pub(crate) fn runtime_item_record_from_aster",
    );
    expect(storeAdapterSource).toContain(
      "pub(crate) fn runtime_output_schema_from_aster",
    );
    expect(storeAdapterSource).toContain("AsterSessionRuntimeSnapshot");
    expect(storeAdapterSource).toContain("RuntimeSessionSnapshotRecord");
    expect(runtimeTimelineAdapterSource).toContain(
      "RuntimeTimelineSnapshotRecordProjection",
    );
    expect(runtimeTimelineAdapterSource).not.toContain(
      "AsterRuntimeTimelineSnapshotProjection",
    );
    expect(runtimeTimelineAdapterSource).toContain(
      "project_runtime_timeline_turn_record",
    );
    expect(runtimeTimelineAdapterSource).toContain(
      "project_runtime_timeline_item_record",
    );
    expect(
      runtimeTimelineAdapterSource.split("#[cfg(test)]")[0] ??
        runtimeTimelineAdapterSource,
    ).not.toContain("ItemRuntimePayload::");
    expect(
      runtimeTimelineAdapterSource.split("#[cfg(test)]")[0] ??
        runtimeTimelineAdapterSource,
    ).not.toContain("ItemStatus::");
    expect(
      runtimeTimelineAdapterSource.split("#[cfg(test)]")[0] ??
        runtimeTimelineAdapterSource,
    ).not.toContain("TurnStatus::");
    expect(runtimeSupportSource).toContain("load_runtime_snapshot_record");
    expect(runtimeSupportSource).toContain(
      "project_session_execution_runtime_snapshot_record",
    );
    expect(runtimeSupportSource).toContain("project_runtime_snapshot_record");
    expect(runtimeSupportSource).toContain(
      "project_subagent_latest_turn_record",
    );
    expect(
      wrapperLeaks,
      "snapshot 级 Aster wrapper 已迁出生产主链；除 store adapter 外，adapter 应消费 thread-store current record",
    ).toEqual([]);
  });

  it("session_execution_runtime_adapter 只能做 current snapshot record 到 current source 的转换", () => {
    const adapterPath =
      "lime-rs/crates/agent/src/session_execution_runtime_adapter.rs";
    const queryPath =
      "lime-rs/crates/agent/src/session_execution_runtime_query.rs";
    const currentOwnerPath =
      "lime-rs/crates/agent-runtime/src/session_execution.rs";
    const adapterSource = readFileSync(join(REPO_ROOT, adapterPath), "utf8");
    const querySource = readFileSync(join(REPO_ROOT, queryPath), "utf8");
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const productionSource =
      adapterSource.split("#[cfg(test)]")[0] ?? adapterSource;
    const leaks =
      SESSION_EXECUTION_RUNTIME_ADAPTER_FORBIDDEN_CURRENT_RULE_SNIPPETS.filter(
        (snippet) => productionSource.includes(snippet),
      ).map((snippet) => `${adapterPath}: ${snippet}`);
    const queryLeaks =
      SESSION_EXECUTION_RUNTIME_QUERY_FORBIDDEN_ASTER_SNIPPETS.filter(
        (snippet) => querySource.includes(snippet),
      ).map((snippet) => `${queryPath}: ${snippet}`);

    expect(currentOwnerSource).toContain(
      "pub fn project_session_execution_runtime_snapshot",
    );
    expect(currentOwnerSource).toContain(
      "pub fn project_session_execution_runtime_usage",
    );
    expect(currentOwnerSource).toContain(
      "fn resolve_latest_session_execution_turn",
    );
    expect(currentOwnerSource).toContain(
      "fn project_recent_access_mode_from_snapshot_source",
    );
    expect(currentOwnerSource).toContain(
      "fn project_recent_harness_context_from_snapshot_source",
    );
    expect(currentOwnerSource).toContain(
      "fn deserialize_session_runtime_state",
    );
    expect(adapterSource).toContain(
      "project_session_execution_runtime_snapshot_record",
    );
    expect(adapterSource).toContain(
      "project_session_execution_runtime_snapshot",
    );
    expect(adapterSource).toContain("SessionExecutionRuntimeSnapshotSource");
    expect(adapterSource).toContain("runtime_output_schema_from_aster");
    expect(productionSource).not.toContain("TurnOutputSchemaSource");
    expect(productionSource).not.toContain("TurnOutputSchemaStrategy");
    expect(adapterSource).not.toContain(
      "project_aster_session_execution_runtime_snapshot",
    );
    expect(adapterSource).not.toContain("SessionRuntimeSnapshot");
    expect(adapterSource).not.toContain(
      "project_session_execution_runtime_session",
    );
    expect(adapterSource).not.toContain("SessionExecutionRuntimeSessionSource");
    expect(querySource).toContain(
      "pub(crate) fn read_session_execution_runtime_session_projection",
    );
    expect(querySource).toContain("FROM agent_sessions");
    expect(querySource).toContain("SESSION_RECORD_SELECT_COLUMNS");
    expect(querySource).toContain("project_session_execution_runtime_session");
    expect(
      queryLeaks,
      "execution runtime session DB read model 必须消费 current agent_sessions row，不得依赖 Aster Session / ExtensionData",
    ).toEqual([]);
    expect(
      leaks,
      "session execution snapshot / usage 的 latest-turn、recent access、recent harness 与 token 有效性规则必须归属 agent-runtime current owner；adapter 只能转换 current record/source",
    ).toEqual([]);
  });

  it("session runtime detail 只能消费 current runtime snapshot overlay", () => {
    const filePath = "lime-rs/crates/agent/src/session_store_runtime_detail.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const forbiddenSnippets = [
      "use crate::runtime_snapshot_adapter::project_aster_runtime_snapshot",
      "project_aster_runtime_snapshot(",
      "project_aster_session_execution_runtime_snapshot",
      "project_aster_session_usage",
      "load_runtime_snapshot(",
      "SessionRuntimeSnapshot",
    ];
    const leaks = forbiddenSnippets
      .filter((snippet) => source.includes(snippet))
      .map((snippet) => `${filePath}: ${snippet}`);
    const sessionAdapterLeaks =
      SESSION_STORE_RUNTIME_DETAIL_FORBIDDEN_SESSION_ADAPTER_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);

    expect(source).toContain("load_runtime_snapshot_overlay");
    expect(source).toContain(
      "read_session_execution_runtime_session_projection",
    );
    expect(
      leaks,
      "session_store_runtime_detail 必须消费 runtime_support 投影后的 current overlay；Aster snapshot DTO 和投影函数只能留在 runtime_support / compat adapter",
    ).toEqual([]);
    expect(
      sessionAdapterLeaks,
      "runtime detail 的 execution runtime session 与 subagent parent context 必须走 current DB read model；不得重新从 Aster Session adapter 投影",
    ).toEqual([]);
  });

  it("session runtime detail conversation window 规则必须归属 agent-runtime current owner", () => {
    const runtimeDetailPath =
      "lime-rs/crates/agent/src/session_store_runtime_detail.rs";
    const deletedAdapterPath =
      "lime-rs/crates/agent/src/session_runtime_conversation_adapter.rs";
    const deletedSessionQueryPath = "lime-rs/crates/agent/src/session_query.rs";
    const currentQueryPath =
      "lime-rs/crates/agent/src/session_runtime_conversation_query.rs";
    const currentOwnerPath =
      "lime-rs/crates/agent-runtime/src/runtime_conversation.rs";
    const runtimeDetailSource = readFileSync(
      join(REPO_ROOT, runtimeDetailPath),
      "utf8",
    );
    const currentQuerySource = readFileSync(
      join(REPO_ROOT, currentQueryPath),
      "utf8",
    );
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const runtimeDetailLeaks =
      SESSION_STORE_RUNTIME_DETAIL_FORBIDDEN_CONVERSATION_SNIPPETS.filter(
        (snippet) => runtimeDetailSource.includes(snippet),
      ).map((snippet) => `${runtimeDetailPath}: ${snippet}`);

    expect(currentOwnerSource).toContain(
      "pub struct RuntimeConversationMessageSource<Message>",
    );
    expect(currentOwnerSource).toContain(
      "pub fn project_runtime_conversation_window",
    );
    expect(currentOwnerSource).not.toContain("aster::");
    expect(existsSync(join(REPO_ROOT, deletedAdapterPath))).toBe(false);
    expect(existsSync(join(REPO_ROOT, deletedSessionQueryPath))).toBe(false);
    expect(currentQuerySource).toContain(
      "pub(crate) async fn read_runtime_conversation_window",
    );
    expect(currentQuerySource).toContain("select_conversation_messages");
    expect(currentQuerySource).toContain("RuntimeConversationMessageSource");
    expect(currentQuerySource).toContain("project_runtime_conversation_window");
    expect(currentQuerySource).not.toContain("Session as AsterSession");
    expect(runtimeDetailSource).toContain("read_runtime_conversation_window");
    expect(runtimeDetailSource).toContain("Option<Vec<RuntimeAgentMessage>>");
    expect(
      runtimeDetailLeaks,
      "runtime detail 只能消费 current runtime conversation read model；Aster Session/Conversation/Message 遍历、可见性过滤和消息投影不得回流",
    ).toEqual([]);
  });

  it("runtime_queue production 只能消费 current queued turn contract", () => {
    const currentOwnerPath =
      "lime-rs/crates/agent-runtime/src/runtime_queue.rs";
    const runtimeQueuePath = "lime-rs/crates/agent/src/runtime_queue.rs";
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const runtimeQueueSource = readFileSync(
      join(REPO_ROOT, runtimeQueuePath),
      "utf8",
    );
    const productionSource =
      runtimeQueueSource.split("#[cfg(test)]")[0] ?? runtimeQueueSource;
    const leaks =
      RUNTIME_QUEUE_FORBIDDEN_PRODUCTION_ASTER_QUEUE_SNIPPETS.filter(
        (snippet) => productionSource.includes(snippet),
      ).map((snippet) => `${runtimeQueuePath}: ${snippet}`);

    expect(currentOwnerSource).toContain("pub struct RuntimeQueuedTurn");
    expect(currentOwnerSource).toContain("pub enum RuntimeQueueSubmitResult");
    expect(currentOwnerSource).toContain("pub trait RuntimeQueueStore");
    expect(currentOwnerSource).toContain("pub struct RuntimeExecutionGate");
    expect(currentOwnerSource).toContain("pub struct RuntimeQueueService");
    expect(currentOwnerSource).not.toContain("aster::");
    expect(runtimeQueueSource).toContain(
      "agent_runtime::runtime_queue::{RuntimeQueueSubmitResult, RuntimeQueuedTurn}",
    );
    expect(runtimeQueueSource).toContain("submit_runtime_turn_to_queue");
    expect(runtimeQueueSource).toContain("take_next_runtime_queued_turn");
    expect(
      leaks,
      "runtime_queue production 只能消费 agent-runtime current queued turn contract；Aster queue service / QueuedTurnRuntime 只能留在 runtime_support compat 边界或测试夹具",
    ).toEqual([]);
  });

  it("runtime_support 只能把 Aster runtime store 适配给 current queue service 和 snapshot record", () => {
    const filePath = "lime-rs/crates/agent/src/runtime_support.rs";
    const adapterPath =
      "lime-rs/crates/agent/src/runtime_queue_aster_adapter.rs";
    const storeAdapterPath =
      "lime-rs/crates/agent/src/runtime_store_aster_adapter.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const adapterSource = readFileSync(join(REPO_ROOT, adapterPath), "utf8");
    const storeAdapterSource = readFileSync(
      join(REPO_ROOT, storeAdapterPath),
      "utf8",
    );
    const forbiddenSnippets = [
      "use aster::",
      "aster::config::paths",
      "initialize_shared_session_runtime_with_root",
      "load_shared_session_runtime_snapshot",
      "require_shared_session_runtime_store",
      "require_shared_session_runtime_queue_service",
      "SessionRuntimeQueueService",
      "pub(crate) async fn load_runtime_snapshot(\n",
      "pub async fn load_runtime_snapshot(\n",
      "RuntimeQueueSubmitResult as Aster",
      "AsterRuntimeQueueSubmitResult",
      "QueuedTurnRuntime as AsterQueuedTurnRuntime",
      "RuntimeQueueStore for AsterRuntimeQueueStoreAdapter",
      "fn runtime_queued_turn_from_aster",
      "fn aster_queued_turn_from_runtime",
    ];
    const leaks = forbiddenSnippets
      .filter((snippet) => source.includes(snippet))
      .map((snippet) => `${filePath}: ${snippet}`);

    expect(source).toContain("RuntimeQueueService");
    expect(source).toContain("runtime_queue_service_from_store");
    expect(source).toContain("RuntimeQueuedTurn");
    expect(source).toContain("load_runtime_snapshot_overlay");
    expect(source).toContain("load_runtime_snapshot_record");
    expect(storeAdapterSource).toContain("use aster::session");
    expect(storeAdapterSource).toContain(
      "initialize_shared_session_runtime_with_root",
    );
    expect(storeAdapterSource).toContain(
      "load_shared_session_runtime_snapshot",
    );
    expect(storeAdapterSource).toContain(
      "require_shared_session_runtime_store",
    );
    expect(storeAdapterSource).toContain("AsterSessionRuntimeSnapshot");
    expect(storeAdapterSource).toContain("AsterThreadRuntimeStore");
    expect(storeAdapterSource).toContain(
      "pub(crate) fn runtime_snapshot_record_from_aster",
    );
    expect(storeAdapterSource).toContain("RuntimeSessionSnapshotRecord");
    expect(adapterSource).toContain(
      "QueuedTurnRuntime as AsterQueuedTurnRuntime",
    );
    expect(adapterSource).toContain(
      "RuntimeQueueStore for AsterRuntimeQueueStoreAdapter",
    );
    expect(adapterSource).toContain("fn runtime_queued_turn_from_aster");
    expect(adapterSource).toContain("fn aster_queued_turn_from_runtime");
    expect(
      leaks,
      "runtime_support 只能接入 Aster compat adapter；Aster queued-turn DTO 转换必须集中在 runtime_queue_aster_adapter，snapshot DTO 转换必须集中在 runtime_store_aster_adapter，queue gate / submit / resume 逻辑必须归属 agent-runtime::runtime_queue",
    ).toEqual([]);
  });

  it("subagent_runtime_adapter 只能做 Aster snapshot 到 current projection 的转换", () => {
    const adapterPath = "lime-rs/crates/agent/src/subagent_runtime_adapter.rs";
    const currentOwnerPath =
      "lime-rs/crates/agent-runtime/src/session_execution.rs";
    const adapterSource = readFileSync(join(REPO_ROOT, adapterPath), "utf8");
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const productionSource =
      adapterSource.split("#[cfg(test)]")[0] ?? adapterSource;
    const leaks =
      SUBAGENT_RUNTIME_ADAPTER_FORBIDDEN_CURRENT_RULE_SNIPPETS.filter(
        (snippet) => productionSource.includes(snippet),
      ).map((snippet) => `${adapterPath}: ${snippet}`);

    expect(currentOwnerSource).toContain("pub fn project_subagent_latest_turn");
    expect(currentOwnerSource).toContain(
      "pub enum SubagentRuntimeItemKindSource",
    );
    expect(currentOwnerSource).toContain(
      "pub fn project_subagent_runtime_item_kind",
    );
    expect(currentOwnerSource).toContain(
      "fn count_subagent_tool_items_for_turn",
    );
    expect(currentOwnerSource).toContain(
      "fn resolve_subagent_worker_result_ref",
    );
    expect(adapterSource).toContain("project_subagent_latest_turn");
    expect(adapterSource).toContain("project_subagent_runtime_item_kind");
    expect(adapterSource).toContain("SubagentRuntimeItemKindSource");
    expect(adapterSource).toContain("SubagentRuntimeSnapshotProjection");
    expect(productionSource).toContain("project_subagent_latest_turn_record");
    expect(productionSource).not.toContain(
      "project_aster_subagent_latest_turn",
    );
    expect(productionSource).not.toContain("SessionRuntimeSnapshot");
    expect(
      leaks,
      "subagent latest-turn 选择、duration、tool count、result ref 与 item kind 规则必须归属 agent-runtime current owner；Aster adapter 只能转换 DTO/source",
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
    expect(source).toContain("SELECT extension_data_json, session_type");
    expect(source).toContain(
      "read_session_execution_runtime_session_projection",
    );
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
    const directAsterLeaks = [
      "use aster::",
      "aster::",
      "read_subagent_session",
      "query_subagent_session",
    ]
      .filter((snippet) => source.includes(snippet))
      .map((snippet) => `${filePath}: ${snippet}`);

    expect(source).toContain(
      "pub(crate) async fn load_subagent_runtime_status",
    );
    expect(directAsterLeaks).toEqual([]);
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
    const currentOwnerPath =
      "lime-rs/crates/agent/src/session_store_subagent_projection.rs";
    const currentQueryPath =
      "lime-rs/crates/agent/src/session_store_subagent_query.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const adapterSource = existsSync(join(REPO_ROOT, adapterPath))
      ? readFileSync(join(REPO_ROOT, adapterPath), "utf8")
      : "";
    const currentOwnerSource = readFileSync(
      join(REPO_ROOT, currentOwnerPath),
      "utf8",
    );
    const currentQuerySource = readFileSync(
      join(REPO_ROOT, currentQueryPath),
      "utf8",
    );
    const leaks =
      SESSION_STORE_SUBAGENT_CONTEXT_FORBIDDEN_RUNTIME_DTO_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);
    const directAsterLeaks =
      SESSION_STORE_SUBAGENT_CONTEXT_FORBIDDEN_DIRECT_ASTER_SNIPPETS.filter(
        (snippet) => source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);
    const adapterLeaks = [
      ...(existsSync(join(REPO_ROOT, adapterPath))
        ? [`${adapterPath}: restored`]
        : []),
      ...SESSION_STORE_SUBAGENT_ADAPTER_FORBIDDEN_METADATA_RULE_SNIPPETS.filter(
        (snippet) => adapterSource.includes(snippet),
      ).map((snippet) => `${adapterPath}: ${snippet}`),
    ];

    expect(
      leaks,
      "session_store_subagent_context 的测试 helper 只能使用 Lime current turn projection；Aster runtime snapshot/turn DTO 只能留在 adapter 边界",
    ).toEqual([]);
    expect(currentOwnerSource).toContain(
      "pub(crate) const SUBAGENT_SESSION_EXTENSION_NAME",
    );
    expect(currentOwnerSource).toContain(
      "pub(crate) fn project_subagent_presentation_projection",
    );
    expect(currentOwnerSource).toContain(
      "pub(crate) fn project_session_record_subagent_session",
    );
    expect(currentQuerySource).toContain(
      "pub(super) fn load_child_subagent_session_projections",
    );
    expect(currentQuerySource).toContain("FROM agent_sessions");
    expect(currentQuerySource).not.toContain("aster::");
    expect(currentOwnerSource).not.toContain("aster::");
    expect(
      directAsterLeaks,
      "session_store_subagent_context 只能消费 Lime-owned SubagentSessionProjection；不得恢复 Aster Session metadata adapter",
    ).toEqual([]);
    expect(
      adapterLeaks,
      "subagent session metadata/customization 解析必须归属 session_store_subagent_projection current owner；Aster adapter 只能读取 raw extension value 并转换 session 基础字段",
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
