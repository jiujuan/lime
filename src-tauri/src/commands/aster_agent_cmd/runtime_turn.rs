use super::agentruntime_profile::{
    profile_failure_category, AgentRuntimeProfileEvent, AgentRuntimeProfileStream,
};
use super::request_model_resolution::resolve_runtime_provider_auth_recovery_config;
use super::runtime_auto_compaction::{
    auto_compaction_failure_count, record_auto_compaction_failure, reset_auto_compaction_failure,
    resolve_auto_compact_threshold_override, resolve_auto_compaction_threshold_budget,
    should_auto_compact_runtime_session, should_skip_auto_compaction_for_failures,
    MAX_AUTO_COMPACTION_FAILURES,
};
#[cfg(test)]
use super::runtime_project_hooks::enforce_runtime_turn_user_prompt_submit_hooks;
use super::runtime_project_hooks::{
    decide_runtime_permission_request_project_hooks_for_session_with_runtime,
    enforce_runtime_pre_compact_project_hooks_for_session_with_runtime,
    enforce_runtime_turn_user_prompt_submit_hooks_with_runtime,
    run_runtime_session_start_project_hooks_for_session_with_runtime,
    run_runtime_stop_project_hooks_for_session_with_runtime,
};
use super::runtime_task_profile::{
    build_runtime_task_completed_profile_event, build_runtime_task_failed_profile_events,
    build_runtime_task_start_profile_events, build_runtime_turn_task_profile_refs,
    RuntimeTurnTaskProfileRefs,
};
use super::service_skill_launch::build_service_skill_preload_tool_projection;
use super::*;
use crate::commands::auxiliary_model_selection::{
    build_auxiliary_runtime_metadata, build_auxiliary_turn_context_override,
    prepare_auxiliary_provider_scope, AuxiliaryProviderResolution, AuxiliaryServiceModelSlot,
};
use crate::commands::modality_runtime_contracts::hydrate_limecore_policy_hits_from_request_metadata;
use crate::services::runtime_evidence_projection_service::{
    collect_runtime_evidence_projection_summary_from_value, RuntimeEvidenceProjectionSummary,
};
use aster::agents::extension::PlatformExtensionContext;
use aster::hooks::{CompactTrigger, SessionSource};
use aster::session::TurnContextOverride;
use aster::tools::{ConfigTool, SkillTool, Tool, ToolContext};
use lime_agent::{build_diagnostics_runtime_status_metadata, AgentEvent as RuntimeAgentEvent};
use lime_core::database::dao::agent_timeline::{AgentThreadItemPayload, AgentThreadItemStatus};
use lime_core::workspace::WorkspaceSettings;
use regex::Regex;
use serde_json::{json, Value};
use std::collections::{hash_map::DefaultHasher, HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::Manager;

#[path = "runtime_turn/bootstrap.rs"]
mod runtime_turn_bootstrap;
#[path = "runtime_turn/compaction.rs"]
mod runtime_turn_compaction;
#[path = "runtime_turn/context.rs"]
mod runtime_turn_context;
#[path = "runtime_turn/event_projection.rs"]
mod runtime_turn_event_projection;
#[path = "runtime_turn/image_policy.rs"]
mod runtime_turn_image_policy;
#[path = "runtime_turn/memory.rs"]
mod runtime_turn_memory;
#[path = "runtime_turn/prompt.rs"]
mod runtime_turn_prompt;
#[path = "runtime_turn/provider_config.rs"]
mod runtime_turn_provider_config;
#[path = "runtime_turn/request_resolution.rs"]
mod runtime_turn_request_resolution;
#[path = "runtime_turn/request_resolution_permission.rs"]
mod runtime_turn_request_resolution_permission;
#[path = "runtime_turn/request_resolution_user_lock.rs"]
mod runtime_turn_request_resolution_user_lock;
#[path = "runtime_turn/skill_launch.rs"]
mod runtime_turn_skill_launch;
#[path = "runtime_turn/status.rs"]
mod runtime_turn_status;

#[path = "runtime_turn/agent_app_skill_contract.rs"]
mod runtime_turn_agent_app_skill_contract;
#[path = "runtime_turn/artifact_materialization.rs"]
mod runtime_turn_artifact_materialization;
#[path = "runtime_turn/flow.rs"]
mod runtime_turn_flow;
#[path = "runtime_turn/prompt_composition.rs"]
mod runtime_turn_prompt_composition;
#[path = "runtime_turn/queue.rs"]
mod runtime_turn_queue;
#[path = "runtime_turn/request_metadata.rs"]
mod runtime_turn_request_metadata;
#[path = "runtime_turn/stream.rs"]
mod runtime_turn_stream;
#[path = "runtime_turn/submit_bootstrap.rs"]
mod runtime_turn_submit_bootstrap;
use runtime_turn_bootstrap::{
    ensure_host_backed_config_tool_registered,
    ensure_runtime_permission_request_hook_handler_registered, sync_runtime_skill_source_agent,
};
pub(crate) use runtime_turn_compaction::compact_runtime_session_internal;
use runtime_turn_compaction::{
    maybe_auto_compact_runtime_session_before_turn, persist_latest_assistant_message_usage,
    resolve_runtime_final_done_event,
};
#[cfg(test)]
use runtime_turn_compaction::{update_compaction_session_metrics, RuntimeSessionCompactionTrigger};
pub(crate) use runtime_turn_context::build_runtime_turn_context_snapshot;
#[cfg(test)]
use runtime_turn_context::merge_turn_context_with_workspace_auto_compaction;
use runtime_turn_context::{
    build_artifact_document_warning_message, build_runtime_run_start_metadata,
    build_runtime_session_config, build_runtime_turn_context_metadata_value,
};
pub(crate) use runtime_turn_event_projection::emit_agent_runtime_profile_event;
#[cfg(test)]
use runtime_turn_event_projection::{
    agent_app_runtime_projection_event_name, parse_agent_app_runtime_projection_scope,
};
use runtime_turn_event_projection::{
    emit_agent_app_runtime_event_projection, emit_runtime_events, non_empty_projection_text,
};
use runtime_turn_flow::execute_runtime_turn_pipeline;
pub(crate) use runtime_turn_flow::request_metadata_has_fast_response_routing;
#[cfg(test)]
use runtime_turn_flow::resolve_runtime_turn_base_system_prompt;
#[cfg(test)]
use runtime_turn_flow::should_override_system_prompt_for_fast_response;
#[cfg(test)]
use runtime_turn_memory::should_auto_capture_runtime_memory_turn;
#[cfg(test)]
use runtime_turn_prompt::build_runtime_environment_system_prompt_for;
use runtime_turn_prompt::{
    extract_explicit_local_focus_paths_from_message, merge_runtime_memory_prefetch_prompt,
    merge_system_prompt_with_explicit_local_path_focus,
    merge_system_prompt_with_runtime_environment,
};
#[cfg(test)]
use runtime_turn_prompt_composition::merge_system_prompt_with_knowledge_context_projection;
use runtime_turn_provider_config::{
    apply_runtime_turn_provider_config, should_use_compact_native_tool_surface,
};
#[cfg(test)]
use runtime_turn_provider_config::{resolve_provider_config_apply_mode, ProviderConfigApplyMode};
pub(crate) use runtime_turn_queue::{build_queued_turn_task, build_runtime_queue_executor};
use runtime_turn_request_metadata::should_skip_artifact_document_autopersist;
#[cfg(test)]
use runtime_turn_request_metadata::{
    backfill_runtime_access_policies, merge_runtime_turn_default_tool_surface_metadata,
    merge_runtime_turn_tool_surface_metadata, normalize_runtime_turn_request_metadata,
    resolve_fast_chat_tool_surface_mode, resolve_mcp_prewarm_skip_reason,
    resolve_turn_execution_profile, should_prewarm_mcp_runtime,
};
#[allow(unused_imports)]
pub(crate) use runtime_turn_request_metadata::{
    resolve_request_web_search_preference_from_sources, resolve_workspace_id_from_sources,
};
use runtime_turn_request_resolution::{
    collect_runtime_request_resolution_side_events, emit_runtime_request_resolution_events,
    extract_runtime_resolution_payload, fail_runtime_turn_before_model_execution,
    map_runtime_limit_event_to_runtime_agent_event, merge_runtime_request_resolution_metadata,
};
#[cfg(test)]
use runtime_turn_request_resolution_permission::{
    build_runtime_permission_review_status_from_state, RuntimePermissionConfirmationProjection,
};
use runtime_turn_request_resolution_permission::{
    format_permission_turn_gating_error, maybe_emit_runtime_permission_confirmation_request,
    merge_runtime_permission_confirmation_from_session, permission_state_requires_turn_gating,
};
#[cfg(test)]
use runtime_turn_request_resolution_user_lock::{
    build_runtime_user_lock_capability_status_from_state, RuntimeUserLockCapabilityProjection,
};
use runtime_turn_request_resolution_user_lock::{
    format_user_lock_capability_gating_error, limit_state_requires_user_lock_capability_gating,
    maybe_emit_runtime_user_lock_capability_request,
    merge_runtime_user_lock_capability_recovery_from_session,
};
#[cfg(test)]
use runtime_turn_skill_launch::{
    agent_app_required_skill_agent_tool_result, build_image_skill_launch_tool_context,
};
use runtime_turn_skill_launch::{
    emit_runtime_side_event, emit_service_skill_preload_runtime_events,
    execute_agent_app_required_skill_contract, execute_image_skill_launch_direct_task,
};
use runtime_turn_status::{
    build_runtime_model_permission_fallback_failure_message, describe_provider_request_attempt,
    emit_submit_accepted_runtime_status, is_runtime_model_permission_denied_error,
    RuntimeTurnKeepaliveGuard,
};
#[cfg(test)]
use runtime_turn_status::{
    build_runtime_turn_keepalive_status, build_submit_accepted_runtime_status,
};

const ARTIFACT_DOCUMENT_REPAIRED_WARNING_CODE: &str = "artifact_document_repaired";
const ARTIFACT_DOCUMENT_FAILED_WARNING_CODE: &str = "artifact_document_failed";
const ARTIFACT_DOCUMENT_PERSIST_FAILED_WARNING_CODE: &str = "artifact_document_persist_failed";
const AUTO_CONTEXT_COMPACTION_EVENT_PREFIX: &str = "agent_context_compaction_auto_internal";
const AUTO_CONTEXT_COMPACTION_FAILED_WARNING_CODE: &str = "context_compaction_auto_failed";
const CONTEXT_COMPACTION_NOT_NEEDED_WARNING_CODE: &str = "context_compaction_not_needed";
const RUNTIME_MODEL_PERMISSION_FALLBACK_WARNING_CODE: &str = "runtime_model_permission_fallback";
const RUNTIME_MODEL_PERMISSION_FALLBACK_FAILED_WARNING_CODE: &str =
    "runtime_model_permission_fallback_failed";
const STOP_HOOK_CONTINUATION_UNSUPPORTED_WARNING_CODE: &str = "stop_hook_continuation_unsupported";
const TURN_KNOWLEDGE_PACK_PROMPT_MARKER: &str = "【运行时知识包】";
const TURN_MEMORY_PREFETCH_PROMPT_MARKER: &str = "【运行时记忆召回】";
const TURN_RUNTIME_ENVIRONMENT_PROMPT_MARKER: &str = "【运行时执行环境】";
const TURN_LOCAL_PATH_FOCUS_PROMPT_MARKER: &str = "【本回合本地路径焦点】";
const TURN_RESPONSE_LANGUAGE_PROMPT_MARKER: &str = "【AI 回复语言】";
const LIME_RUNTIME_METADATA_KEY: &str = "lime_runtime";
const AGENT_APP_RUNTIME_EVENT_PREFIX: &str = "agent_app_runtime:";
const AGENTUI_CONTEXT_METADATA_KEY: &str = "agentui_context";
const LIME_RUNTIME_AUTO_COMPACT_KEY: &str = "auto_compact";
const LIME_RUNTIME_TOOL_SURFACE_KEY: &str = "tool_surface";
const LIME_RUNTIME_IMAGE_INPUT_POLICY_KEY: &str = "image_input_policy";
const FAST_CHAT_TOOL_SURFACE_DIRECT_ANSWER: &str = "direct_answer";
const FAST_CHAT_TOOL_SURFACE_LOCAL_WORKSPACE: &str = "local_workspace";
const DEFAULT_NATIVE_TOOL_SURFACE_COMPACT: &str = "compact_tools";
const RUNTIME_IMAGE_INPUT_UNSUPPORTED_WARNING_CODE: &str = "runtime_image_input_unsupported";
const RUNTIME_TURN_CANCELLED_MESSAGE: &str = "用户已停止当前执行";
const AUTO_RUNTIME_MEMORY_MIN_USER_CHARS: usize = 12;
const AUTO_RUNTIME_MEMORY_MIN_ASSISTANT_CHARS: usize = 48;
const AUTO_RUNTIME_MEMORY_MIN_TOTAL_CHARS: usize = 160;
const AUTO_RUNTIME_MEMORY_SESSION_MESSAGE_LIMIT: usize = 8;
const AUTO_RUNTIME_MEMORY_SESSION_MIN_MESSAGE_LENGTH: usize = 18;
const FAST_RESPONSE_SYSTEM_PROMPT_OVERRIDE_MAX_CHARS: usize = 800;
const RUNTIME_TURN_KEEPALIVE_INTERVAL: Duration = Duration::from_secs(45);
const COMPACTION_FALLBACK_PROVIDER_CHAIN: [(&str, &str); 4] = [
    ("deepseek", "deepseek-chat"),
    ("openai", "gpt-4o-mini"),
    ("anthropic", "claude-3-haiku-20240307"),
    ("kiro", "anthropic.claude-3-haiku-20240307-v1:0"),
];
#[cfg(test)]
#[path = "runtime_turn/tests.rs"]
mod tests;
