//! Lime Agent Crate
//!
//! 包含 Agent 模块中不依赖主 crate 内部模块的纯逻辑部分。
//! 深耦合部分（runtime_state、Aster 流式桥接）留在主 crate。

#![allow(clippy::explicit_counter_loop)]
#![allow(clippy::unnecessary_map_or)]
#![allow(clippy::to_string_in_format_args)]
#![allow(clippy::match_like_matches_macro)]
#![allow(clippy::derivable_impls)]
#![allow(clippy::borrowed_box)]

pub mod agent_tools;
pub mod artifact_protocol;
pub mod ask_bridge;
mod aster_runtime_projection;
mod aster_session_store;
mod credential_bridge;
mod direct_text_generation;
pub mod durable_memory_fs;
mod event_converter;
mod execution_strategy_compat;
pub mod filesystem_event_protocol;
pub mod hooks;
mod host_managed_generation;
mod knowledge_builder_skill;
pub mod lime_session_repository;
mod live_execution_process;
pub mod lsp_bridge;
pub mod mcp_bridge;
mod message_content_adapter;
pub mod native_tools;
pub mod prompt;
pub mod protocol;
mod protocol_context_projection;
pub mod protocol_projection;
mod provider_configuration;
pub mod provider_continuation_state;
pub mod provider_runtime_governor;
pub mod queued_turn;
pub mod request_tool_policy;
pub mod runtime_facade;
pub mod runtime_projection_snapshot;
pub mod runtime_queue;
mod runtime_snapshot_adapter;
mod runtime_state;
mod runtime_state_support;
mod runtime_support;
mod runtime_timeline_adapter;
mod session_config_adapter;
mod session_configuration;
mod session_execution_runtime;
mod session_execution_runtime_adapter;
mod session_query;
pub mod session_state_snapshot;
mod session_store;
mod session_update;
mod session_usage_projection;
pub mod skill_execution;
pub mod subagent_control;
pub mod subagent_profiles;
mod subagent_runtime_adapter;
pub mod team_runtime_governor;
#[cfg(any(test, feature = "test-support"))]
pub mod test_support;
mod text_normalization;
pub mod tool_io_offload;
pub mod tools;
mod turn_context_configuration;
mod turn_execution;
pub mod turn_input_envelope;
pub mod turn_state;
mod write_artifact_events;

pub use ask_bridge::{create_ask_callback, extract_response as extract_ask_response};
pub use direct_text_generation::{
    run_direct_text_generation_with_db, DirectTextGenerationRequest, DirectTextGenerationResult,
};
pub use durable_memory_fs::{
    durable_memory_permission_pattern, is_virtual_memory_path, resolve_durable_memory_root,
    resolve_virtual_memory_path, to_virtual_memory_path, virtual_memory_relative_path,
    DURABLE_MEMORY_VIRTUAL_ROOT, LEGACY_DURABLE_MEMORY_ROOT_ENV, LIME_DURABLE_MEMORY_ROOT_ENV,
};
pub use host_managed_generation::{
    host_managed_generation_session_id, run_host_managed_generation,
    write_host_managed_generation_status, HostManagedGenerationPlan,
    HostManagedGenerationRunRequest, HostManagedGenerationRunResult,
    HOST_MANAGED_GENERATION_SCHEMA, HOST_MANAGED_GENERATION_SOURCE,
};
pub use knowledge_builder_skill::{
    run_knowledge_builder_skill, KnowledgeBuilderSkillRequest, KnowledgeBuilderSkillRunner,
};
pub use lime_mcp as mcp;
pub use live_execution_process::LiveExecutionProcessGateway;
pub use lsp_bridge::create_lsp_callback;
pub use prompt::SystemPromptBuilder;
pub use prompt::{
    budget_limit_prompt, build_runtime_agents_prompt, build_runtime_agents_prompt_for_project,
    continuation_prompt, merge_system_prompt_with_runtime_agents,
    merge_system_prompt_with_runtime_agents_for_project, objective_updated_prompt,
    permissions_instructions, render_review_exit_interrupted, render_review_exit_success,
    resolve_review_prompt, review_prompt, PermissionsPromptInput, PromptApprovalPolicy,
    PromptNetworkAccess, PromptSandboxMode, ResolvedReviewPrompt, ReviewPromptTarget,
    ThreadGoalPromptInput, APPLY_PATCH_TOOL_INSTRUCTIONS, HIERARCHICAL_AGENTS_MESSAGE,
    REALTIME_BACKEND_PROMPT, REALTIME_END_INSTRUCTIONS, REALTIME_START_INSTRUCTIONS, REVIEW_PROMPT,
    RUNTIME_AGENTS_PROMPT_MARKER, SUMMARIZATION_PROMPT, SUMMARY_PREFIX,
};
pub use protocol::{
    build_diagnostics_runtime_status_metadata, AgentActionRequiredScope, AgentArtifactSignal,
    AgentEvent, AgentImageAttachment, AgentMessage, AgentMessageContent, AgentOp,
    AgentProviderTraceStage, AgentRuntimeStatus, AgentTokenUsage, AgentToolImage,
    AgentToolProgressPayload, AgentToolResult, AgentUserInputOp, AgentUserPreferences,
    TextDeltaBatchBoundary,
};
pub use protocol_projection::{project_item_runtime, project_turn_runtime};
pub use provider_configuration::{
    configure_model_route_provider_for_session, provider_configuration_from_model_selection,
    route_protocol_from_session_provider_config, ModelRouteProviderConfiguration,
    SessionProviderConfig,
};
pub use provider_continuation_state::{
    ProviderContinuationCapability, ProviderContinuationCapable, ProviderContinuationState,
};
pub use provider_runtime_governor::{
    acquire_provider_runtime_permit, preview_provider_runtime_wait_snapshot,
    release_provider_runtime_permit, resolve_provider_runtime_parallel_budget,
    snapshot_provider_runtime_lease, ProviderRuntimeGovernorSnapshot, ProviderRuntimePermit,
};
pub use queued_turn::QueuedTurnSnapshot;
pub use request_tool_policy::{
    execute_web_search_preflight_if_needed, merge_system_prompt_with_request_tool_policy,
    merge_system_prompt_with_web_search_preflight_context,
    request_tool_policy_with_additional_required_tools, resolve_request_tool_policy,
    resolve_request_tool_policy_with_mode, stream_reply_with_policy, ReplyAttemptError,
    RequestToolPolicy, RequestToolPolicyMode, StreamReplyExecution, WebSearchExecutionTracker,
    WebSearchPreflightRequest, REQUEST_TOOL_POLICY_MARKER,
};
pub use runtime_projection_snapshot::RuntimeProjectionSnapshot;
pub use runtime_queue::{
    clear_runtime_queue, finish_active_runtime_turn_if_matches, list_runtime_queue_snapshots,
    promote_runtime_queued_turn, remove_runtime_queued_turn,
    resume_persisted_runtime_queues_on_startup, resume_runtime_queue_if_needed,
    submit_runtime_turn, RuntimeQueueEventEmitter, RuntimeQueueExecutor,
};
pub use runtime_state::{AgentRuntimeState, QueuedTurnTask};
pub use runtime_state_support::{
    create_lime_identity, create_lime_tool_config, reload_lime_skills, SessionConfigBuilder,
};
pub use runtime_support::initialize_agent_runtime;
pub use session_configuration::{
    build_agent_session_config, AgentSessionConfig, AgentSessionConfigurationRequest,
};
pub use session_execution_runtime::{
    apply_usage_to_cost_state, detect_runtime_limit_event, persist_session_recent_access_mode,
    persist_session_recent_preferences, persist_session_recent_team_selection,
    SessionExecutionRuntime, SessionExecutionRuntimeAccessMode, SessionExecutionRuntimeCostState,
    SessionExecutionRuntimeLimitEvent, SessionExecutionRuntimeLimitState,
    SessionExecutionRuntimeOemPolicy, SessionExecutionRuntimePermissionState,
    SessionExecutionRuntimePreferences, SessionExecutionRuntimeRecentTeamRole,
    SessionExecutionRuntimeRecentTeamSelection, SessionExecutionRuntimeRoutingDecision,
    SessionExecutionRuntimeSource, SessionExecutionRuntimeSummary,
    SessionExecutionRuntimeTaskProfile,
};
pub use session_query::{
    collect_subagent_cascade_session_ids, list_child_subagent_sessions,
    list_subagent_cascade_session_ids, list_subagent_status_scope_session_ids, read_session,
};
pub use session_state_snapshot::SessionStateSnapshot;
pub use session_store::{
    count_session_messages_sync, create_session_sync, create_session_with_id_sync, delete_session,
    get_persisted_session_metadata_sync, get_runtime_session_detail,
    get_runtime_session_detail_with_history_limit, get_runtime_session_detail_with_history_page,
    get_runtime_session_detail_with_history_window, get_session_sync,
    get_session_sync_with_full_timeline_without_messages, list_sessions_sync,
    list_title_preview_messages_sync, rename_session_sync, update_session_archived_state_sync,
    update_session_execution_strategy_sync, update_session_provider_config_sync,
    update_session_working_dir_sync, ChildSubagentRuntimeStatus, ChildSubagentSession,
    PersistedSessionMetadata, SessionDetail, SessionInfo, SessionTitlePreviewMessage,
    SessionTodoItem, SessionTodoStatus, SubagentParentContext,
};
pub use session_update::{
    persist_compaction_session_metrics_update, CompactionSessionMetricsUpdate,
};
pub use skill_execution::{
    execute_skill_prompt, execute_skill_workflow, SkillEventEmitter, SkillExecutionError,
    SkillExecutionResult, SkillInputImage, SkillPromptExecution, SkillWorkflowExecution,
    StepResult,
};
pub use subagent_control::{
    derive_subagent_runtime_status_kind, load_subagent_runtime_status, read_subagent_control_state,
    write_subagent_control_state, SubagentControlState, SubagentRuntimeStatus,
    SubagentRuntimeStatusInput, SubagentRuntimeStatusKind,
};
pub use subagent_profiles::{
    build_subagent_customization_prompt, builtin_profile_descriptor_by_id,
    builtin_profile_name_by_id, builtin_skill_descriptor_by_id,
    builtin_team_preset_descriptor_by_id, builtin_team_preset_label_by_id,
    summarize_builtin_profile, summarize_builtin_skill, summarize_builtin_team_preset,
    BuiltinProfileDescriptor, BuiltinSkillDescriptor, BuiltinTeamPresetDescriptor,
    SubagentCustomizationState, SubagentProfileSummary, SubagentSkillPromptBlock,
    SubagentSkillSummary, TeamPresetSummary,
};
pub use team_runtime_governor::{
    acquire_team_runtime_permit, default_team_runtime_parallel_budget,
    normalize_team_runtime_provider_group, preview_team_runtime_wait_snapshot,
    release_team_runtime_permit, resolve_team_runtime_provider_parallel_budget,
    snapshot_team_runtime_session, TeamRuntimeGovernorSnapshot, TeamRuntimePermit,
};
pub use tools::{BrowserAction, BrowserTool, BrowserToolError, BrowserToolResult};
pub use turn_context_configuration::{
    agent_turn_approval_policy, agent_turn_context_metadata, agent_turn_sandbox_policy,
    build_agent_turn_context, insert_agent_turn_metadata, set_agent_turn_output_schema,
    set_agent_turn_user_visible_input_text, AgentTurnContext, AgentTurnContextConfigurationRequest,
    AgentTurnContextOverride,
};
pub use turn_execution::{
    run_agent_turn_with_policy, AgentTurnExecution, AgentTurnExecutionRequest,
    AgentTurnProviderConfiguration,
};
pub use turn_input_envelope::{
    TurnDiagnosticsSnapshot, TurnExecutionProfile, TurnInputEnvelope, TurnInputEnvelopeBuilder,
    TurnMessageHistorySource, TurnPromptAugmentationStage, TurnPromptAugmentationStageKind,
    TurnProviderRoutingSnapshot, TurnRequestToolPolicySnapshot, TurnSystemPromptSource,
};
pub use turn_state::TurnState;
pub use write_artifact_events::{build_write_tool_artifact_events, WriteArtifactEventEmitter};
