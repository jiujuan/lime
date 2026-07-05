use serde::de::DeserializeOwned;
use serde_json::Value;

use super::{
    normalize_optional_text, text_contains_any_keyword, SessionExecutionRuntimeCostState,
    SessionExecutionRuntimeLimitEvent, SessionExecutionRuntimeLimitState,
    SessionExecutionRuntimeOemPolicy, SessionExecutionRuntimePermissionState,
    SessionExecutionRuntimeRoutingDecision, SessionExecutionRuntimeSummary,
    SessionExecutionRuntimeTaskProfile,
};

const LIME_RUNTIME_METADATA_KEY: &str = "lime_runtime";
const LIME_RUNTIME_TASK_PROFILE_KEY: &str = "task_profile";
const LIME_RUNTIME_ROUTING_DECISION_KEY: &str = "routing_decision";
const LIME_RUNTIME_LIMIT_STATE_KEY: &str = "limit_state";
const LIME_RUNTIME_COST_STATE_KEY: &str = "cost_state";
const LIME_RUNTIME_PERMISSION_STATE_KEY: &str = "permission_state";
const LIME_RUNTIME_LIMIT_EVENT_KEY: &str = "limit_event";
const LIME_RUNTIME_OEM_POLICY_KEY: &str = "oem_policy";
const LIME_RUNTIME_SUMMARY_KEY: &str = "runtime_summary";

fn extract_lime_runtime_object(
    metadata: &std::collections::HashMap<String, Value>,
) -> Option<&serde_json::Map<String, Value>> {
    metadata
        .get(LIME_RUNTIME_METADATA_KEY)
        .and_then(Value::as_object)
}

fn extract_lime_runtime_payload<T: DeserializeOwned>(
    metadata: &std::collections::HashMap<String, Value>,
    key: &str,
) -> Option<T> {
    let runtime = extract_lime_runtime_object(metadata)?;
    serde_json::from_value(runtime.get(key)?.clone()).ok()
}

fn calculate_estimated_total_cost(cost_state: &SessionExecutionRuntimeCostState) -> Option<f64> {
    let mut total_cost = 0.0;
    let mut has_priced_component = false;

    if let (Some(tokens), Some(rate)) = (cost_state.input_tokens, cost_state.input_per_million) {
        total_cost += (tokens as f64 / 1_000_000.0) * rate;
        has_priced_component = true;
    }
    if let (Some(tokens), Some(rate)) = (cost_state.output_tokens, cost_state.output_per_million) {
        total_cost += (tokens as f64 / 1_000_000.0) * rate;
        has_priced_component = true;
    }
    if let (Some(tokens), Some(rate)) = (
        cost_state.cached_input_tokens,
        cost_state.cache_read_per_million,
    ) {
        total_cost += (tokens as f64 / 1_000_000.0) * rate;
        has_priced_component = true;
    }
    if let (Some(tokens), Some(rate)) = (
        cost_state.cache_creation_input_tokens,
        cost_state.cache_write_per_million,
    ) {
        total_cost += (tokens as f64 / 1_000_000.0) * rate;
        has_priced_component = true;
    }

    has_priced_component.then_some(total_cost)
}

pub fn apply_usage_to_cost_state(
    mut cost_state: SessionExecutionRuntimeCostState,
    usage: &crate::protocol::AgentTokenUsage,
) -> SessionExecutionRuntimeCostState {
    cost_state.input_tokens = Some(usage.input_tokens);
    cost_state.output_tokens = Some(usage.output_tokens);
    cost_state.total_tokens = Some(usage.input_tokens.saturating_add(usage.output_tokens));
    cost_state.cached_input_tokens = usage.cached_input_tokens;
    cost_state.cache_creation_input_tokens = usage.cache_creation_input_tokens;
    cost_state.estimated_total_cost = calculate_estimated_total_cost(&cost_state);
    cost_state.status = if cost_state.estimated_total_cost.is_some() {
        "recorded".to_string()
    } else {
        "recorded_tokens_only".to_string()
    };
    cost_state
}

pub fn detect_runtime_limit_event(
    error_message: Option<&str>,
) -> Option<SessionExecutionRuntimeLimitEvent> {
    let message = error_message
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    let lowered = message.to_lowercase();

    if text_contains_any_keyword(
        &lowered,
        &[
            "quota low",
            "available_quota_low",
            "credits running low",
            "credit running low",
            "low balance",
            "额度偏低",
            "余额偏低",
            "额度告急",
        ],
    ) {
        return Some(SessionExecutionRuntimeLimitEvent {
            event_kind: "quota_low".to_string(),
            message: message.to_string(),
            retryable: true,
        });
    }

    if text_contains_any_keyword(
        &lowered,
        &[
            "quota exceeded",
            "quota exhausted",
            "insufficient quota",
            "insufficient credit",
            "insufficient balance",
            "billing",
            "payment required",
            "额度不足",
            "超出额度",
            "余额不足",
        ],
    ) {
        return Some(SessionExecutionRuntimeLimitEvent {
            event_kind: "quota_blocked".to_string(),
            message: message.to_string(),
            retryable: false,
        });
    }

    if text_contains_any_keyword(
        &lowered,
        &[
            "rate limit",
            "rate_limit",
            "too many requests",
            "429",
            "throttl",
        ],
    ) {
        return Some(SessionExecutionRuntimeLimitEvent {
            event_kind: "rate_limit_hit".to_string(),
            message: message.to_string(),
            retryable: true,
        });
    }

    None
}

pub(super) fn extract_task_profile_from_metadata(
    metadata: &std::collections::HashMap<String, Value>,
) -> Option<SessionExecutionRuntimeTaskProfile> {
    let mut profile: SessionExecutionRuntimeTaskProfile =
        extract_lime_runtime_payload(metadata, LIME_RUNTIME_TASK_PROFILE_KEY)?;
    profile.kind = normalize_optional_text(Some(std::mem::take(&mut profile.kind)))?;
    profile.source = normalize_optional_text(Some(std::mem::take(&mut profile.source)))?;
    profile.traits = profile
        .traits
        .into_iter()
        .filter_map(|value| normalize_optional_text(Some(value)))
        .collect();
    profile.modality_contract_key = normalize_optional_text(profile.modality_contract_key);
    profile.routing_slot = normalize_optional_text(profile.routing_slot);
    profile.execution_profile_key = normalize_optional_text(profile.execution_profile_key);
    profile.executor_adapter_key = normalize_optional_text(profile.executor_adapter_key);
    profile.executor_kind = normalize_optional_text(profile.executor_kind);
    profile.executor_binding_key = normalize_optional_text(profile.executor_binding_key);
    profile.permission_profile_keys = profile
        .permission_profile_keys
        .into_iter()
        .filter_map(|value| normalize_optional_text(Some(value)))
        .collect();
    profile.user_lock_policy = normalize_optional_text(profile.user_lock_policy);
    profile.service_model_slot = normalize_optional_text(profile.service_model_slot);
    profile.scene_kind = normalize_optional_text(profile.scene_kind);
    profile.scene_skill_id = normalize_optional_text(profile.scene_skill_id);
    profile.entry_source = normalize_optional_text(profile.entry_source);
    Some(profile)
}

pub(super) fn extract_routing_decision_from_metadata(
    metadata: &std::collections::HashMap<String, Value>,
) -> Option<SessionExecutionRuntimeRoutingDecision> {
    let mut decision: SessionExecutionRuntimeRoutingDecision =
        extract_lime_runtime_payload(metadata, LIME_RUNTIME_ROUTING_DECISION_KEY)?;
    decision.routing_mode =
        normalize_optional_text(Some(std::mem::take(&mut decision.routing_mode)))?;
    decision.decision_source =
        normalize_optional_text(Some(std::mem::take(&mut decision.decision_source)))?;
    decision.decision_reason =
        normalize_optional_text(Some(std::mem::take(&mut decision.decision_reason)))
            .unwrap_or_default();
    decision.selected_provider = normalize_optional_text(decision.selected_provider);
    decision.selected_model = normalize_optional_text(decision.selected_model);
    decision.requested_provider = normalize_optional_text(decision.requested_provider);
    decision.requested_model = normalize_optional_text(decision.requested_model);
    decision.estimated_cost_class = normalize_optional_text(decision.estimated_cost_class);
    decision.capability_gap = normalize_optional_text(decision.capability_gap);
    decision.fallback_chain = decision
        .fallback_chain
        .into_iter()
        .filter_map(|value| normalize_optional_text(Some(value)))
        .collect();
    decision.settings_source = normalize_optional_text(decision.settings_source);
    decision.service_model_slot = normalize_optional_text(decision.service_model_slot);
    Some(decision)
}

pub(super) fn extract_limit_state_from_metadata(
    metadata: &std::collections::HashMap<String, Value>,
) -> Option<SessionExecutionRuntimeLimitState> {
    let mut limit_state: SessionExecutionRuntimeLimitState =
        extract_lime_runtime_payload(metadata, LIME_RUNTIME_LIMIT_STATE_KEY)?;
    limit_state.status = normalize_optional_text(Some(std::mem::take(&mut limit_state.status)))?;
    limit_state.capability_gap = normalize_optional_text(limit_state.capability_gap);
    limit_state.notes = limit_state
        .notes
        .into_iter()
        .filter_map(|value| normalize_optional_text(Some(value)))
        .collect();
    Some(limit_state)
}

pub(super) fn extract_cost_state_from_metadata(
    metadata: &std::collections::HashMap<String, Value>,
) -> Option<SessionExecutionRuntimeCostState> {
    let mut cost_state: SessionExecutionRuntimeCostState =
        extract_lime_runtime_payload(metadata, LIME_RUNTIME_COST_STATE_KEY)?;
    cost_state.status = normalize_optional_text(Some(std::mem::take(&mut cost_state.status)))?;
    cost_state.estimated_cost_class =
        normalize_optional_text(cost_state.estimated_cost_class.take());
    cost_state.currency = normalize_optional_text(cost_state.currency.take());
    Some(cost_state)
}

pub(super) fn extract_permission_state_from_metadata(
    metadata: &std::collections::HashMap<String, Value>,
) -> Option<SessionExecutionRuntimePermissionState> {
    let mut permission_state: SessionExecutionRuntimePermissionState =
        extract_lime_runtime_payload(metadata, LIME_RUNTIME_PERMISSION_STATE_KEY)?;
    permission_state.status =
        normalize_optional_text(Some(std::mem::take(&mut permission_state.status)))?;
    permission_state.required_profile_keys = permission_state
        .required_profile_keys
        .into_iter()
        .filter_map(|value| normalize_optional_text(Some(value)))
        .collect();
    permission_state.ask_profile_keys = permission_state
        .ask_profile_keys
        .into_iter()
        .filter_map(|value| normalize_optional_text(Some(value)))
        .collect();
    permission_state.blocking_profile_keys = permission_state
        .blocking_profile_keys
        .into_iter()
        .filter_map(|value| normalize_optional_text(Some(value)))
        .collect();
    permission_state.decision_source =
        normalize_optional_text(Some(std::mem::take(&mut permission_state.decision_source)))?;
    permission_state.decision_scope =
        normalize_optional_text(Some(std::mem::take(&mut permission_state.decision_scope)))?;
    permission_state.confirmation_status =
        normalize_optional_text(permission_state.confirmation_status);
    permission_state.confirmation_request_id =
        normalize_optional_text(permission_state.confirmation_request_id);
    permission_state.confirmation_source =
        normalize_optional_text(permission_state.confirmation_source);
    permission_state.notes = permission_state
        .notes
        .into_iter()
        .filter_map(|value| normalize_optional_text(Some(value)))
        .collect();
    Some(permission_state)
}

pub(super) fn extract_limit_event_from_metadata(
    metadata: &std::collections::HashMap<String, Value>,
) -> Option<SessionExecutionRuntimeLimitEvent> {
    let mut limit_event: SessionExecutionRuntimeLimitEvent =
        extract_lime_runtime_payload(metadata, LIME_RUNTIME_LIMIT_EVENT_KEY)?;
    limit_event.event_kind =
        normalize_optional_text(Some(std::mem::take(&mut limit_event.event_kind)))?;
    limit_event.message = normalize_optional_text(Some(std::mem::take(&mut limit_event.message)))?;
    Some(limit_event)
}

pub(super) fn extract_oem_policy_from_metadata(
    metadata: &std::collections::HashMap<String, Value>,
) -> Option<SessionExecutionRuntimeOemPolicy> {
    let mut oem_policy: SessionExecutionRuntimeOemPolicy =
        extract_lime_runtime_payload(metadata, LIME_RUNTIME_OEM_POLICY_KEY)?;
    oem_policy.tenant_id =
        normalize_optional_text(Some(std::mem::take(&mut oem_policy.tenant_id)))?;
    oem_policy.provider_source = normalize_optional_text(oem_policy.provider_source);
    oem_policy.provider_key = normalize_optional_text(oem_policy.provider_key);
    oem_policy.default_model = normalize_optional_text(oem_policy.default_model);
    oem_policy.config_mode = normalize_optional_text(oem_policy.config_mode);
    oem_policy.offer_state = normalize_optional_text(oem_policy.offer_state);
    oem_policy.quota_status = normalize_optional_text(oem_policy.quota_status);
    Some(oem_policy)
}

pub(super) fn extract_runtime_summary_from_metadata(
    metadata: &std::collections::HashMap<String, Value>,
) -> Option<SessionExecutionRuntimeSummary> {
    let runtime = extract_lime_runtime_object(metadata)?;
    let mut summary: SessionExecutionRuntimeSummary = runtime
        .get(LIME_RUNTIME_SUMMARY_KEY)
        .and_then(|value| serde_json::from_value(value.clone()).ok())
        .unwrap_or_default();
    summary.surface = normalize_optional_text(summary.surface.take())
        .or_else(|| extract_text_from_object(runtime, &["surface"]));
    summary.app_id = normalize_optional_text(summary.app_id.take())
        .or_else(|| extract_text_from_object(runtime, &["app_id", "appId"]));
    summary.task_id = normalize_optional_text(summary.task_id.take())
        .or_else(|| extract_text_from_object(runtime, &["task_id", "taskId"]));
    summary.trace_id = normalize_optional_text(summary.trace_id.take())
        .or_else(|| extract_text_from_object(runtime, &["trace_id", "traceId"]));
    summary.task_kind = normalize_optional_text(summary.task_kind.take())
        .or_else(|| extract_text_from_object(runtime, &["task_kind", "taskKind"]));
    summary.routing_mode = normalize_optional_text(summary.routing_mode.take());
    summary.decision_source = normalize_optional_text(summary.decision_source.take());
    summary.decision_reason = normalize_optional_text(summary.decision_reason.take());
    summary.estimated_cost_class = normalize_optional_text(summary.estimated_cost_class.take());
    summary.limit_status = normalize_optional_text(summary.limit_status.take());
    summary.limit_event_kind = normalize_optional_text(summary.limit_event_kind.take());
    summary.limit_event_message = normalize_optional_text(summary.limit_event_message.take());
    summary.capability_gap = normalize_optional_text(summary.capability_gap.take());
    summary.permission_status = normalize_optional_text(summary.permission_status.take());
    summary.fallback_chain = summary
        .fallback_chain
        .into_iter()
        .filter_map(|value| normalize_optional_text(Some(value)))
        .collect();
    if summary == SessionExecutionRuntimeSummary::default() {
        return None;
    }
    Some(summary)
}

fn extract_text_from_value(value: Option<&Value>) -> Option<String> {
    normalize_optional_text(value.and_then(Value::as_str).map(ToString::to_string))
}

fn extract_text_from_object(
    object: &serde_json::Map<String, Value>,
    keys: &[&str],
) -> Option<String> {
    keys.iter()
        .find_map(|key| extract_text_from_value(object.get(*key)))
}
