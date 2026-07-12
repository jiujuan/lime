use agent_protocol::turn_context::TurnOutputSchemaRuntime;
pub(crate) use agent_runtime::session_recent::{
    extract_recent_preferences_from_metadata, extract_recent_team_selection_from_metadata,
};
pub use agent_runtime::session_recent::{
    SessionExecutionRuntimeAccessMode, SessionExecutionRuntimePreferences,
    SessionExecutionRuntimeRecentTeamRole, SessionExecutionRuntimeRecentTeamSelection,
};
use lime_core::database::dao::agent_timeline::{AgentThreadItem, AgentThreadItemPayload};
use serde::{Deserialize, Serialize};
use serde_json::Value;

mod runtime_payload;

pub use runtime_payload::{apply_usage_to_cost_state, detect_runtime_limit_event};
pub(crate) type SessionExecutionRuntimeSessionProjection =
    agent_runtime::session_execution::SessionExecutionRuntimeSessionProjection<
        crate::protocol::AgentTokenUsage,
    >;
pub(crate) type SessionExecutionRuntimeSnapshotProjection =
    agent_runtime::session_execution::SessionExecutionRuntimeSnapshotProjection<
        crate::turn_context_configuration::AgentTurnContext,
    >;
use runtime_payload::{
    extract_cost_state_from_metadata, extract_limit_event_from_metadata,
    extract_limit_state_from_metadata, extract_oem_policy_from_metadata,
    extract_permission_state_from_metadata, extract_routing_decision_from_metadata,
    extract_runtime_summary_from_metadata, extract_task_profile_from_metadata,
};

const RUNTIME_MODEL_PERMISSION_FALLBACK_WARNING_CODE: &str = "runtime_model_permission_fallback";

pub(crate) fn normalize_optional_text(value: Option<String>) -> Option<String> {
    let trimmed = value?.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

pub(super) fn text_contains_any_keyword(haystack: &str, keywords: &[&str]) -> bool {
    keywords.iter().any(|keyword| haystack.contains(keyword))
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionExecutionRuntimeSource {
    Session,
    RuntimeSnapshot,
    TurnContext,
    ModelChange,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecutionRuntimeTaskProfile {
    pub kind: String,
    pub source: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub traits: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modality_contract_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub routing_slot: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_profile_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executor_adapter_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executor_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executor_binding_key: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub permission_profile_keys: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_lock_policy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_model_slot: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_skill_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entry_source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecutionRuntimeRoutingDecision {
    pub routing_mode: String,
    pub decision_source: String,
    pub decision_reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_model: Option<String>,
    #[serde(default)]
    pub candidate_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_cost_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capability_gap: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fallback_chain: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settings_source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_model_slot: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecutionRuntimeLimitState {
    pub status: String,
    #[serde(default)]
    pub single_candidate_only: bool,
    #[serde(default)]
    pub provider_locked: bool,
    #[serde(default)]
    pub settings_locked: bool,
    #[serde(default)]
    pub oem_locked: bool,
    #[serde(default)]
    pub candidate_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capability_gap: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecutionRuntimeCostState {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_cost_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_per_million: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_per_million: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_per_million: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_write_per_million: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_total_cost: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_creation_input_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecutionRuntimePermissionState {
    pub status: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub required_profile_keys: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ask_profile_keys: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub blocking_profile_keys: Vec<String>,
    pub decision_source: String,
    pub decision_scope: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirmation_status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirmation_request_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirmation_source: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecutionRuntimeLimitEvent {
    pub event_kind: String,
    pub message: String,
    #[serde(default)]
    pub retryable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecutionRuntimeOemPolicy {
    pub tenant_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offer_state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quota_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fallback_to_local_allowed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub can_invoke: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecutionRuntimeSummary {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub surface: Option<String>,
    #[serde(default, alias = "app_id", skip_serializing_if = "Option::is_none")]
    pub app_id: Option<String>,
    #[serde(default, alias = "task_id", skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    #[serde(default, alias = "trace_id", skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
    #[serde(default, alias = "task_kind", skip_serializing_if = "Option::is_none")]
    pub task_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidate_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub routing_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision_source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fallback_chain: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_cost_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_total_cost: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_event_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_event_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capability_gap: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub single_candidate_only: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oem_locked: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quota_low: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permission_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permission_ask_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permission_blocking_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SessionExecutionRuntime {
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_selector: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_strategy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_schema_runtime: Option<TurnOutputSchemaRuntime>,
    pub source: SessionExecutionRuntimeSource,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_turn_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_turn_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_summary: Option<crate::protocol::AgentTurnContextSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recent_access_mode: Option<SessionExecutionRuntimeAccessMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recent_preferences: Option<SessionExecutionRuntimePreferences>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recent_team_selection: Option<SessionExecutionRuntimeRecentTeamSelection>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recent_theme: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recent_session_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recent_gate_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recent_run_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recent_content_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recent_response_language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_profile: Option<SessionExecutionRuntimeTaskProfile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub routing_decision: Option<SessionExecutionRuntimeRoutingDecision>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_state: Option<SessionExecutionRuntimeLimitState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost_state: Option<SessionExecutionRuntimeCostState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permission_state: Option<SessionExecutionRuntimePermissionState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_event: Option<SessionExecutionRuntimeLimitEvent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oem_policy: Option<SessionExecutionRuntimeOemPolicy>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_summary: Option<SessionExecutionRuntimeSummary>,
}

fn extract_text_from_value(value: Option<&Value>) -> Option<String> {
    normalize_optional_text(value.and_then(Value::as_str).map(ToString::to_string))
}

fn extract_text_from_metadata(
    metadata: &std::collections::HashMap<String, Value>,
    keys: &[&str],
) -> Option<String> {
    keys.iter()
        .find_map(|key| extract_text_from_value(metadata.get(*key)))
}

fn extract_execution_strategy_from_metadata(
    metadata: &std::collections::HashMap<String, Value>,
) -> Option<String> {
    extract_text_from_metadata(
        metadata,
        &[
            "effective_execution_strategy",
            "effectiveExecutionStrategy",
            "execution_strategy",
            "executionStrategy",
        ],
    )
    .map(|_| "react".to_string())
}

fn active_context_tokens_from_session(
    session: Option<&SessionExecutionRuntimeSessionProjection>,
) -> Option<u32> {
    session
        .and_then(|value| value.usage.as_ref())
        .map(|usage| usage.input_tokens)
}

pub(crate) fn build_session_execution_runtime(
    session_id: &str,
    session: Option<&SessionExecutionRuntimeSessionProjection>,
    execution_strategy: Option<String>,
    snapshot: Option<&SessionExecutionRuntimeSnapshotProjection>,
    provider_selector: Option<String>,
) -> Option<SessionExecutionRuntime> {
    let mut runtime = SessionExecutionRuntime {
        session_id: session_id.to_string(),
        provider_selector: normalize_optional_text(provider_selector),
        provider_name: session
            .and_then(|value| normalize_optional_text(value.provider_name.clone())),
        model_name: session.and_then(|value| normalize_optional_text(value.model_name.clone())),
        execution_strategy: normalize_optional_text(execution_strategy),
        output_schema_runtime: None,
        source: SessionExecutionRuntimeSource::Session,
        mode: None,
        latest_turn_id: None,
        latest_turn_status: None,
        context_summary: None,
        recent_access_mode: None,
        recent_preferences: None,
        recent_team_selection: None,
        recent_theme: None,
        recent_session_mode: None,
        recent_gate_key: None,
        recent_run_title: None,
        recent_content_id: None,
        recent_response_language: None,
        task_profile: None,
        routing_decision: None,
        limit_state: None,
        cost_state: None,
        permission_state: None,
        limit_event: None,
        oem_policy: None,
        runtime_summary: None,
    };

    if let Some(snapshot) = snapshot {
        runtime.recent_theme = snapshot.recent_harness_context.theme.clone();
        runtime.recent_session_mode = snapshot.recent_harness_context.session_mode.clone();
        runtime.recent_gate_key = snapshot.recent_harness_context.gate_key.clone();
        runtime.recent_run_title = snapshot.recent_harness_context.run_title.clone();
        runtime.recent_content_id = snapshot.recent_harness_context.content_id.clone();
        runtime.recent_response_language =
            snapshot.recent_harness_context.response_language.clone();
        runtime.recent_access_mode = snapshot.recent_access_mode;

        if let Some(latest_turn) = snapshot.latest_turn.as_ref() {
            runtime.latest_turn_id = Some(latest_turn.id.clone());
            runtime.latest_turn_status = Some(latest_turn.status.clone());
            let turn_context = latest_turn.context.as_ref();
            runtime.context_summary =
                crate::protocol_projection::project_turn_context_summary_with_active_context_tokens(
                    turn_context,
                    active_context_tokens_from_session(session),
                );
            runtime.execution_strategy = turn_context
                .and_then(|value| extract_execution_strategy_from_metadata(&value.metadata))
                .or(runtime.execution_strategy);
            runtime.output_schema_runtime = latest_turn.output_schema_runtime.clone();
            runtime.model_name = latest_turn
                .output_schema_runtime
                .as_ref()
                .and_then(|value| normalize_optional_text(value.model_name.clone()))
                .or_else(|| {
                    turn_context.and_then(|value| normalize_optional_text(value.model.clone()))
                })
                .or(runtime.model_name);
            runtime.provider_name = latest_turn
                .output_schema_runtime
                .as_ref()
                .and_then(|value| normalize_optional_text(value.provider_name.clone()))
                .or(runtime.provider_name);
            runtime.recent_preferences = turn_context
                .and_then(|value| extract_recent_preferences_from_metadata(&value.metadata));
            runtime.recent_team_selection = turn_context
                .and_then(|value| extract_recent_team_selection_from_metadata(&value.metadata));
            runtime.task_profile =
                turn_context.and_then(|value| extract_task_profile_from_metadata(&value.metadata));
            runtime.routing_decision = turn_context
                .and_then(|value| extract_routing_decision_from_metadata(&value.metadata));
            runtime.limit_state =
                turn_context.and_then(|value| extract_limit_state_from_metadata(&value.metadata));
            runtime.cost_state =
                turn_context.and_then(|value| extract_cost_state_from_metadata(&value.metadata));
            runtime.permission_state = turn_context
                .and_then(|value| extract_permission_state_from_metadata(&value.metadata));
            runtime.oem_policy =
                turn_context.and_then(|value| extract_oem_policy_from_metadata(&value.metadata));
            runtime.runtime_summary = turn_context
                .and_then(|value| extract_runtime_summary_from_metadata(&value.metadata));
            let metadata_limit_event =
                turn_context.and_then(|value| extract_limit_event_from_metadata(&value.metadata));
            runtime.limit_event = detect_runtime_limit_event(latest_turn.error_message.as_deref())
                .or(metadata_limit_event);
            if let (Some(cost_state), Some(session)) = (runtime.cost_state.take(), session) {
                runtime.cost_state = Some(
                    session
                        .usage
                        .as_ref()
                        .map(|usage| apply_usage_to_cost_state(cost_state.clone(), &usage))
                        .unwrap_or(cost_state),
                );
            }
            runtime.source = SessionExecutionRuntimeSource::RuntimeSnapshot;
        }
    }

    if runtime.recent_access_mode.is_none() {
        runtime.recent_access_mode = session.and_then(|value| value.recent_access_mode);
    }

    if runtime.recent_preferences.is_none() {
        runtime.recent_preferences = session.and_then(|value| value.recent_preferences.clone());
    }

    if runtime.recent_team_selection.is_none() {
        runtime.recent_team_selection =
            session.and_then(|value| value.recent_team_selection.clone());
    }

    if runtime.provider_selector.is_none()
        && runtime.provider_name.is_none()
        && runtime.model_name.is_none()
        && runtime.output_schema_runtime.is_none()
        && runtime.recent_access_mode.is_none()
        && runtime.recent_preferences.is_none()
        && runtime.recent_team_selection.is_none()
        && runtime.recent_theme.is_none()
        && runtime.recent_session_mode.is_none()
        && runtime.recent_gate_key.is_none()
        && runtime.recent_run_title.is_none()
        && runtime.recent_content_id.is_none()
        && runtime.recent_response_language.is_none()
        && runtime.context_summary.is_none()
        && runtime.task_profile.is_none()
        && runtime.routing_decision.is_none()
        && runtime.limit_state.is_none()
        && runtime.cost_state.is_none()
        && runtime.permission_state.is_none()
        && runtime.oem_policy.is_none()
        && runtime.runtime_summary.is_none()
        && runtime.limit_event.is_none()
        && (runtime.execution_strategy.is_none()
            || runtime.source == SessionExecutionRuntimeSource::Session)
    {
        return None;
    }

    Some(runtime)
}

fn has_runtime_model_permission_fallback_warning(items: &[AgentThreadItem], turn_id: &str) -> bool {
    items.iter().any(|item| {
        item.turn_id == turn_id
            && matches!(
                &item.payload,
                AgentThreadItemPayload::Warning {
                    code: Some(code),
                    ..
                } if code == RUNTIME_MODEL_PERMISSION_FALLBACK_WARNING_CODE
            )
    })
}

pub fn reconcile_session_execution_runtime_permission_fallback(
    runtime: &mut SessionExecutionRuntime,
    items: &[AgentThreadItem],
    persisted_session_model_name: Option<&str>,
) {
    let Some(latest_turn_id) = runtime.latest_turn_id.as_deref() else {
        return;
    };
    if !has_runtime_model_permission_fallback_warning(items, latest_turn_id) {
        return;
    }

    let Some(session_model_name) = persisted_session_model_name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
    else {
        return;
    };

    runtime.model_name = Some(session_model_name.clone());

    if let Some(output_schema_runtime) = runtime.output_schema_runtime.as_mut() {
        output_schema_runtime.model_name = Some(session_model_name.clone());
    }

    if let Some(routing_decision) = runtime.routing_decision.as_mut() {
        routing_decision.selected_model = Some(session_model_name);
    }
}
