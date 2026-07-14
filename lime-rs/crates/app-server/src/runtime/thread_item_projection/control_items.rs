use super::helpers::{
    base_item, compact_json, event_metadata, lifecycle_base_item, merge_lifecycle_metadata,
    merge_optional_field, update_lifecycle_item,
};
use crate::runtime::{raw_string_field, string_field, StoredSession};
use app_server_protocol::AgentEvent;
use serde_json::{json, Value};
use std::collections::HashMap;

pub(super) fn upsert_approval_item(
    stored: &StoredSession,
    event: &AgentEvent,
    items: &mut HashMap<String, Value>,
) {
    let Some(request_id) = action_id(&event.payload).or_else(|| Some(event.event_id.clone()))
    else {
        return;
    };
    let existing_action_type = items
        .get(&request_id)
        .and_then(|item| string_field(item, &["action_type"]));
    let action_type = string_field(&event.payload, &["actionType", "action_type"])
        .or(existing_action_type)
        .unwrap_or_else(|| "tool_confirmation".to_string());
    let item_type = if matches!(action_type.as_str(), "ask_user" | "elicitation") {
        "request_user_input"
    } else {
        "approval_request"
    };
    let status = match event.event_type.as_str() {
        "action.required" => "in_progress",
        "action.cancelled" | "action.canceled" | "action.expired" => "failed",
        _ => "completed",
    };
    let entry = items
        .entry(request_id.clone())
        .or_insert_with(|| lifecycle_base_item(stored, event, &request_id, item_type, status));
    let Some(object) = entry.as_object_mut() else {
        return;
    };

    update_lifecycle_item(object, event, status);
    object.insert("request_id".to_string(), json!(request_id));
    object.insert("type".to_string(), json!(item_type));
    object.insert("action_type".to_string(), json!(action_type));
    merge_optional_field(
        object,
        "prompt",
        raw_string_field(&event.payload, &["prompt", "message", "reason"]).map(Value::String),
    );
    merge_optional_field(
        object,
        "tool_name",
        string_field(&event.payload, &["toolName", "tool_name", "name"]).map(Value::String),
    );
    merge_optional_field(
        object,
        "arguments",
        event
            .payload
            .get("arguments")
            .cloned()
            .or_else(|| event.payload.get("data").cloned()),
    );
    merge_optional_field(
        object,
        "questions",
        event.payload.get("questions").cloned().or_else(|| {
            event
                .payload
                .get("data")
                .and_then(|data| data.get("questions"))
                .cloned()
        }),
    );
    merge_optional_field(
        object,
        "requested_schema",
        event
            .payload
            .get("requestedSchema")
            .or_else(|| event.payload.get("requested_schema"))
            .cloned()
            .or_else(|| {
                event
                    .payload
                    .get("data")
                    .and_then(|data| {
                        data.get("requestedSchema")
                            .or_else(|| data.get("requested_schema"))
                    })
                    .cloned()
            }),
    );
    if event.event_type != "action.required" {
        object.insert(
            "response".to_string(),
            compact_json(json!({
                "decision": string_field(&event.payload, &["decision", "status"])
                    .unwrap_or_else(|| if status == "completed" { "approved" } else { "failed" }.to_string()),
                "decision_scope": string_field(&event.payload, &["decisionScope", "decision_scope"]),
                "source": string_field(&event.payload, &["sourceClient", "source_client", "source"])
                    .unwrap_or_else(|| "runtime".to_string()),
                "cache": event.payload.get("cache").cloned(),
                "auto_resolved": string_field(&event.payload, &["source"])
                    .is_some_and(|source| source == "approval_session_cache"),
                "imported_read_only": event.payload.get("importedReadOnly")
                    .and_then(Value::as_bool),
            })),
        );
    }
    merge_lifecycle_metadata(object, event);
}

pub(super) fn upsert_context_compaction_item(
    stored: &StoredSession,
    event: &AgentEvent,
    items: &mut HashMap<String, Value>,
) {
    let id = context_compaction_id(&event.payload).unwrap_or_else(|| event.event_id.clone());
    let status = match event.event_type.as_str() {
        "context.compaction.started" => "in_progress",
        _ => "completed",
    };
    let entry = items
        .entry(id.clone())
        .or_insert_with(|| lifecycle_base_item(stored, event, &id, "context_compaction", status));
    let Some(object) = entry.as_object_mut() else {
        return;
    };

    update_lifecycle_item(object, event, status);
    merge_optional_field(
        object,
        "stage",
        string_field(&event.payload, &["stage"])
            .or_else(|| {
                Some(if status == "completed" {
                    "completed".to_string()
                } else {
                    "started".to_string()
                })
            })
            .map(Value::String),
    );
    merge_optional_field(
        object,
        "trigger",
        string_field(&event.payload, &["trigger"]).map(Value::String),
    );
    merge_optional_field(
        object,
        "detail",
        raw_string_field(&event.payload, &["detail", "message", "summary"]).map(Value::String),
    );
    merge_lifecycle_metadata(object, event);
}

pub(super) fn upsert_subagent_activity_item(
    stored: &StoredSession,
    event: &AgentEvent,
    items: &mut HashMap<String, Value>,
) {
    let id = subagent_activity_id(&event.payload).unwrap_or_else(|| event.event_id.clone());
    let status = string_field(&event.payload, &["status"])
        .map(|value| match value.as_str() {
            "in_progress" | "running" => "in_progress",
            "failed" => "failed",
            _ => "completed",
        })
        .unwrap_or("completed");
    let entry = items
        .entry(id.clone())
        .or_insert_with(|| lifecycle_base_item(stored, event, &id, "subagent_activity", status));
    let Some(object) = entry.as_object_mut() else {
        return;
    };

    update_lifecycle_item(object, event, status);
    merge_optional_field(
        object,
        "status_label",
        string_field(&event.payload, &["statusLabel", "status_label", "kind"])
            .or_else(|| Some(status.to_string()))
            .map(Value::String),
    );
    merge_optional_field(
        object,
        "title",
        raw_string_field(&event.payload, &["title", "agentPath", "agent_path"]).map(Value::String),
    );
    merge_optional_field(
        object,
        "summary",
        raw_string_field(&event.payload, &["summary", "message", "prompt"]).map(Value::String),
    );
    merge_optional_field(
        object,
        "role",
        string_field(&event.payload, &["role", "kind"]).map(Value::String),
    );
    merge_optional_field(
        object,
        "model",
        string_field(&event.payload, &["model"]).map(Value::String),
    );
    merge_optional_field(
        object,
        "session_id",
        string_field(
            &event.payload,
            &[
                "sessionId",
                "session_id",
                "agentThreadId",
                "agent_thread_id",
            ],
        )
        .map(Value::String),
    );
    merge_lifecycle_metadata(object, event);
}

pub(super) fn expert_profile_switch_item(
    stored: &StoredSession,
    event: &AgentEvent,
) -> Option<Value> {
    let role_switch = expert_role_switch_payload(&event.payload)?;
    let next_expert_id = string_field(&event.payload, &["nextExpertId", "next_expert_id"])
        .or_else(|| string_field(role_switch, &["nextExpertId", "next_expert_id"]));
    let previous_expert_id =
        string_field(&event.payload, &["previousExpertId", "previous_expert_id"])
            .or_else(|| string_field(role_switch, &["previousExpertId", "previous_expert_id"]));
    let title = raw_string_field(&event.payload, &["title"])
        .unwrap_or_else(|| "Expert profile switched".to_string());
    let summary = match (previous_expert_id.as_deref(), next_expert_id.as_deref()) {
        (Some(previous), Some(next)) => format!("{previous} -> {next}"),
        (None, Some(next)) => format!("Switched to {next}"),
        _ => title.clone(),
    };

    Some(base_item(
        stored,
        event,
        "expert_profile_switch",
        "completed",
        compact_json(json!({
            "title": title,
            "summary": summary,
            "kind": string_field(role_switch, &["kind"]).unwrap_or_else(|| "expert_profile_switch".to_string()),
            "scope": string_field(role_switch, &["scope"]).unwrap_or_else(|| "thread".to_string()),
            "source": string_field(role_switch, &["source"])
                .or_else(|| string_field(&event.payload, &["source"])),
            "previous_expert_id": previous_expert_id,
            "previous_release_id": string_field(&event.payload, &["previousReleaseId", "previous_release_id"])
                .or_else(|| string_field(role_switch, &["previousReleaseId", "previous_release_id"])),
            "next_expert_id": next_expert_id,
            "next_release_id": string_field(&event.payload, &["nextReleaseId", "next_release_id"])
                .or_else(|| string_field(role_switch, &["nextReleaseId", "next_release_id"])),
            "switched_at": string_field(&event.payload, &["switchedAt", "switched_at"])
                .or_else(|| string_field(role_switch, &["switchedAt", "switched_at"])),
            "expert_role_switch": role_switch.clone(),
            "expert": event.payload.get("expert").cloned(),
            "harness_expert": event.payload.pointer("/harness/expert").cloned(),
            "metadata": expert_profile_switch_metadata(event, role_switch),
        })),
    ))
}

fn action_id(payload: &Value) -> Option<String> {
    string_field(
        payload,
        &["requestId", "request_id", "actionId", "action_id", "id"],
    )
}

fn context_compaction_id(payload: &Value) -> Option<String> {
    string_field(
        payload,
        &[
            "compactionId",
            "compaction_id",
            "contextCompactionId",
            "context_compaction_id",
            "id",
        ],
    )
}

fn subagent_activity_id(payload: &Value) -> Option<String> {
    string_field(
        payload,
        &[
            "activityId",
            "activity_id",
            "eventId",
            "event_id",
            "sessionId",
            "session_id",
            "agentThreadId",
            "agent_thread_id",
            "id",
        ],
    )
}

fn expert_role_switch_payload(payload: &Value) -> Option<&Value> {
    payload
        .get("expert_role_switch")
        .or_else(|| payload.get("expertRoleSwitch"))
        .or_else(|| payload.pointer("/metadata/harness/expert_role_switch"))
        .or_else(|| payload.pointer("/harness/expert_role_switch"))
}

fn expert_profile_switch_metadata(event: &AgentEvent, role_switch: &Value) -> Value {
    let mut metadata = event_metadata(event)
        .as_object()
        .cloned()
        .unwrap_or_default();
    metadata.insert(
        "harness".to_string(),
        compact_json(json!({
            "expert": event.payload.pointer("/harness/expert").cloned(),
            "expert_role_switch": role_switch.clone(),
        })),
    );
    metadata.insert("source".to_string(), json!("runtime_request.metadata"));
    Value::Object(metadata)
}
