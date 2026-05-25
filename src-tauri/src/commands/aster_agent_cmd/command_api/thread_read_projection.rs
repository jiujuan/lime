use super::json_value_fields::{
    json_nested_object, json_string_field, json_string_vec_field, json_u64_field,
};
use crate::commands::aster_agent_cmd::AgentRuntimeThreadReadModel;
use crate::database::{lock_db, DbConnection};
use lime_core::database::dao::agent_run::{AgentRun, AgentRunDao};
use lime_core::database::managed_objective_repository::{
    get_objective_by_owner, MANAGED_OBJECTIVE_OWNER_AGENT_SESSION,
};
use serde_json::{json, Value};

pub(crate) fn hydrate_thread_read_managed_objective(
    db: &DbConnection,
    session_id: &str,
    thread_read: &mut AgentRuntimeThreadReadModel,
) -> Result<(), String> {
    let conn = lock_db(db)?;
    thread_read.managed_objective =
        get_objective_by_owner(&conn, MANAGED_OBJECTIVE_OWNER_AGENT_SESSION, session_id)?;
    Ok(())
}

pub(crate) fn latest_model_delta_timing_from_run(run: &AgentRun) -> Option<Value> {
    let metadata = run.metadata.as_deref()?;
    let metadata: Value = serde_json::from_str(metadata).ok()?;
    let first_visible_delta_ms = json_u64_field(
        &metadata,
        &["model_first_visible_delta_ms", "modelFirstVisibleDeltaMs"],
    );
    let first_thinking_delta_ms = json_u64_field(
        &metadata,
        &["model_first_thinking_delta_ms", "modelFirstThinkingDeltaMs"],
    );
    let first_text_delta_ms = json_u64_field(
        &metadata,
        &["model_first_text_delta_ms", "modelFirstTextDeltaMs"],
    );

    if first_visible_delta_ms.is_none()
        && first_thinking_delta_ms.is_none()
        && first_text_delta_ms.is_none()
    {
        return None;
    }

    let routing = json_nested_object(
        &metadata,
        &["request_metadata", "lime_runtime", "routing_decision"],
    )
    .or_else(|| json_nested_object(&metadata, &["requestMetadata", "limeRuntime", "routingDecision"]))
    .map(|routing| {
        let routing_value = Value::Object(routing.clone());
        json!({
            "decisionSource": json_string_field(&routing_value, &["decisionSource", "decision_source"]),
            "decisionReason": json_string_field(&routing_value, &["decisionReason", "decision_reason"]),
            "fallbackChain": json_string_vec_field(&routing_value, &["fallbackChain", "fallback_chain"]),
            "settingsSource": json_string_field(&routing_value, &["settingsSource", "settings_source"]),
            "serviceModelSlot": json_string_field(&routing_value, &["serviceModelSlot", "service_model_slot"]),
            "selectedProvider": json_string_field(&routing_value, &["selectedProvider", "selected_provider"]),
            "selectedModel": json_string_field(&routing_value, &["selectedModel", "selected_model"]),
            "requestedProvider": json_string_field(&routing_value, &["requestedProvider", "requested_provider"]),
            "requestedModel": json_string_field(&routing_value, &["requestedModel", "requested_model"]),
        })
    });

    Some(json!({
        "source": "agent_runs.metadata",
        "runId": run.id,
        "runSource": run.source,
        "runStatus": run.status.as_str(),
        "startedAt": run.started_at,
        "finishedAt": run.finished_at,
        "durationMs": run.duration_ms,
        "firstVisibleDeltaMs": first_visible_delta_ms,
        "firstThinkingDeltaMs": first_thinking_delta_ms,
        "firstTextDeltaMs": first_text_delta_ms,
        "routing": routing,
    }))
}

pub(crate) fn merge_latest_model_delta_timing_into_thread_read(
    thread_read: &mut AgentRuntimeThreadReadModel,
    latest_timing: Value,
) {
    let mut model_routing = thread_read
        .model_routing
        .take()
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    model_routing.insert("latestModelDeltaTiming".to_string(), latest_timing);
    thread_read.model_routing = Some(Value::Object(model_routing));
}

pub(crate) fn hydrate_thread_read_with_latest_model_delta_timing(
    db: &DbConnection,
    session_id: &str,
    thread_read: &mut AgentRuntimeThreadReadModel,
) -> Result<(), String> {
    let conn = lock_db(db)?;
    let runs = AgentRunDao::list_runs_by_session(&conn, session_id, 8)
        .map_err(|error| format!("查询 agent_runs 首字证据失败: {error}"))?;
    drop(conn);

    if let Some(latest_timing) = runs.iter().find_map(latest_model_delta_timing_from_run) {
        merge_latest_model_delta_timing_into_thread_read(thread_read, latest_timing);
    }

    Ok(())
}
