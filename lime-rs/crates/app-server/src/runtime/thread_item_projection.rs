mod agent_message;
pub(super) mod change_set;
pub(super) mod materializer;
pub(in crate::runtime) mod media_result;
mod plan;

pub(in crate::runtime) use change_set::{merge_item_snapshot, merge_turn_snapshot};
pub(in crate::runtime) use materializer::materialize_events;

#[cfg(test)]
mod typed_tests;

use super::raw_string_field;
use super::string_array_field;
use super::string_field;
use super::StoredSession;
use app_server_protocol::AgentEvent;
use serde_json::{json, Map, Value};
use std::collections::HashMap;

pub(super) fn thread_items_from_events(stored: &StoredSession) -> Vec<Value> {
    let mut items = Vec::new();
    let mut agent_message_item_by_id = HashMap::<String, usize>::new();
    let mut last_text_item_by_turn = std::collections::HashMap::<String, usize>::new();
    let mut command_items = HashMap::<String, Value>::new();
    let mut patch_items = HashMap::<String, Value>::new();
    let mut reasoning_items = HashMap::<String, Value>::new();
    let mut approval_items = HashMap::<String, Value>::new();
    let mut context_compaction_items = HashMap::<String, Value>::new();
    let mut subagent_items = HashMap::<String, Value>::new();
    let mut media_result_items = HashMap::<String, Value>::new();

    for event in &stored.events {
        match event.event_type.as_str() {
            "message.delta" | "message.delta_batch" | "message.batch" => {
                if let Some(item) = agent_message::item_from_delta(stored, event) {
                    if let Some(stable_item_id) = agent_message::payload_id(event) {
                        if let Some(existing_index) =
                            agent_message_item_by_id.get(&stable_item_id).copied()
                        {
                            agent_message::merge_item(&mut items[existing_index], &item);
                            continue;
                        }
                        agent_message_item_by_id.insert(stable_item_id, items.len());
                        items.push(item);
                        continue;
                    }
                    if agent_message::is_imported_event(event) {
                        items.push(item);
                        continue;
                    }
                    if let Some(turn_id) = event.turn_id.as_deref() {
                        if let Some(existing_index) = last_text_item_by_turn.get(turn_id).copied() {
                            agent_message::merge_item(&mut items[existing_index], &item);
                            continue;
                        }
                        last_text_item_by_turn.insert(turn_id.to_string(), items.len());
                    }
                    items.push(item);
                }
            }
            "reasoning.delta" | "reasoning.summary" | "reasoning.completed" | "reasoning.final" => {
                if let Some(item) = reasoning_item(stored, event) {
                    items.push(item);
                }
            }
            "item.started" | "item.updated" | "item.completed" => {
                if agent_message::upsert_from_item_event(
                    stored,
                    event,
                    &mut items,
                    &mut agent_message_item_by_id,
                ) {
                    continue;
                }
                upsert_reasoning_item(stored, event, &mut reasoning_items);
                media_result::upsert_from_event(stored, event, &mut media_result_items);
            }
            "plan.delta" | "plan.final" => {
                if let Some(item) = plan::plan_item(stored, event) {
                    items.push(item);
                }
            }
            "command.started" | "command.output" | "command.exited" => {
                upsert_command_item(stored, event, &mut command_items);
            }
            "patch.started" | "patch.applied" | "patch.failed" => {
                upsert_patch_item(stored, event, &mut patch_items);
            }
            "action.required" | "action.resolved" | "action.cancelled" | "action.canceled"
            | "action.expired" => {
                upsert_approval_item(stored, event, &mut approval_items);
            }
            "context.compaction.started" | "context.compaction.completed" => {
                upsert_context_compaction_item(stored, event, &mut context_compaction_items);
            }
            "expert.profile_switch.completed" => {
                if let Some(item) = expert_profile_switch_item(stored, event) {
                    items.push(item);
                }
            }
            "subagent.activity" => {
                upsert_subagent_activity_item(stored, event, &mut subagent_items);
            }
            _ => {}
        }
    }

    items.extend(command_items.into_values());
    items.extend(patch_items.into_values());
    items.extend(reasoning_items.into_values());
    items.extend(approval_items.into_values());
    items.extend(context_compaction_items.into_values());
    items.extend(subagent_items.into_values());
    items.extend(media_result_items.into_values());
    sort_thread_items(&mut items);
    items
}

fn upsert_reasoning_item(
    stored: &StoredSession,
    event: &AgentEvent,
    items: &mut HashMap<String, Value>,
) {
    let Some(next) = reasoning_item_from_item_event(stored, event) else {
        return;
    };
    let Some(item_id) = string_field(&next, &["id"]) else {
        return;
    };
    if let Some(existing) = items.get_mut(&item_id) {
        merge_reasoning_item(existing, &next);
        return;
    }
    if next.get("text").and_then(Value::as_str).is_none() {
        return;
    }
    items.insert(item_id, next);
}

fn merge_reasoning_item(existing: &mut Value, next: &Value) {
    let Some(existing_object) = existing.as_object_mut() else {
        return;
    };
    let existing_is_completed = existing_object
        .get("status")
        .and_then(Value::as_str)
        .is_some_and(|status| status == "completed");
    let next_status = string_field(next, &["status"]).unwrap_or_else(|| "in_progress".to_string());
    if !existing_is_completed || next_status == "completed" {
        existing_object.insert("status".to_string(), Value::String(next_status));
    }
    for key in ["text", "summary", "metadata"] {
        if let Some(value) = next.get(key).cloned() {
            existing_object.insert(key.to_string(), value);
        }
    }
    if let Some(started_at) = next.get("started_at").cloned() {
        existing_object
            .entry("started_at".to_string())
            .or_insert(started_at);
    }
    if let Some(updated_at) = next.get("updated_at").cloned() {
        existing_object.insert("updated_at".to_string(), updated_at);
    }
    if let Some(completed_at) = next.get("completed_at").cloned() {
        existing_object.insert("completed_at".to_string(), completed_at);
    }
}

fn sort_thread_items(items: &mut [Value]) {
    items.sort_by(|left, right| {
        let left_sequence = left
            .get("sequence")
            .and_then(Value::as_u64)
            .unwrap_or(u64::MAX);
        let right_sequence = right
            .get("sequence")
            .and_then(Value::as_u64)
            .unwrap_or(u64::MAX);
        left_sequence
            .cmp(&right_sequence)
            .then_with(|| item_timestamp(left).cmp(&item_timestamp(right)))
            .then_with(|| item_id(left).cmp(&item_id(right)))
    });
}

fn item_timestamp(item: &Value) -> String {
    string_field(
        item,
        &["started_at", "updated_at", "completed_at", "created_at"],
    )
    .unwrap_or_default()
}

fn item_id(item: &Value) -> String {
    string_field(item, &["id"]).unwrap_or_default()
}

fn upsert_command_item(
    stored: &StoredSession,
    event: &AgentEvent,
    items: &mut HashMap<String, Value>,
) {
    let Some(command_id) = command_id(&event.payload).or_else(|| Some(event.event_id.clone()))
    else {
        return;
    };
    let status = match event.event_type.as_str() {
        "command.started" => "in_progress",
        "command.exited" => command_exit_item_status(&event.payload),
        _ => "in_progress",
    };
    let entry = items.entry(command_id.clone()).or_insert_with(|| {
        lifecycle_base_item(stored, event, &command_id, "command_execution", status)
    });
    let Some(object) = entry.as_object_mut() else {
        return;
    };

    update_lifecycle_item(object, event, status);
    merge_optional_field(
        object,
        "command",
        command_string(&event.payload)
            .or_else(|| {
                object
                    .get("command")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .or_else(|| Some(command_id.clone()))
            .map(Value::String),
    );
    merge_optional_field(
        object,
        "cwd",
        string_field(&event.payload, &["cwd", "workingDirectory", "working_dir"])
            .map(Value::String),
    );
    merge_optional_field(
        object,
        "aggregated_output",
        raw_string_field(
            &event.payload,
            &["outputPreview", "output_preview", "output", "summary"],
        )
        .map(Value::String),
    );
    merge_optional_field(
        object,
        "exit_code",
        event
            .payload
            .get("exitCode")
            .or_else(|| event.payload.get("exit_code"))
            .and_then(Value::as_i64)
            .map(|value| json!(value)),
    );
    merge_optional_field(
        object,
        "error",
        raw_string_field(&event.payload, &["error", "message", "reason"]).map(Value::String),
    );
    merge_lifecycle_metadata(object, event);
}

fn upsert_patch_item(
    stored: &StoredSession,
    event: &AgentEvent,
    items: &mut HashMap<String, Value>,
) {
    let Some(patch_id) = patch_id(&event.payload).or_else(|| Some(event.event_id.clone())) else {
        return;
    };
    let status = match event.event_type.as_str() {
        "patch.failed" => "failed",
        "patch.started" => "in_progress",
        _ => "completed",
    };
    let entry = items
        .entry(patch_id.clone())
        .or_insert_with(|| lifecycle_base_item(stored, event, &patch_id, "patch", status));
    let Some(object) = entry.as_object_mut() else {
        return;
    };

    update_lifecycle_item(object, event, status);
    let paths = string_array_field(&event.payload, &["paths", "changedFiles", "changed_files"]);
    if !paths.is_empty() {
        object.insert("summary".to_string(), json!(paths));
        object.insert("paths".to_string(), json!(paths));
        object.insert(
            "text".to_string(),
            json!(format!("Patch changed {}", paths.join(", "))),
        );
    } else if !object.contains_key("text") {
        object.insert(
            "text".to_string(),
            json!(
                raw_string_field(&event.payload, &["stdout", "stderr", "message"])
                    .unwrap_or_else(|| "Patch applied".to_string())
            ),
        );
    }
    merge_optional_field(
        object,
        "success",
        event
            .payload
            .get("success")
            .and_then(Value::as_bool)
            .map(Value::Bool),
    );
    merge_optional_field(
        object,
        "stdout",
        raw_string_field(&event.payload, &["stdout"]).map(Value::String),
    );
    merge_optional_field(
        object,
        "stderr",
        raw_string_field(&event.payload, &["stderr"]).map(Value::String),
    );
    merge_lifecycle_metadata(object, event);
}

fn upsert_approval_item(
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

fn upsert_context_compaction_item(
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

fn upsert_subagent_activity_item(
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

fn lifecycle_base_item(
    stored: &StoredSession,
    event: &AgentEvent,
    id: &str,
    item_type: &str,
    status: &str,
) -> Value {
    let mut object = serde_json::Map::new();
    object.insert("id".to_string(), Value::String(id.to_string()));
    object.insert(
        "thread_id".to_string(),
        Value::String(
            event
                .thread_id
                .clone()
                .unwrap_or_else(|| stored.session.thread_id.clone()),
        ),
    );
    object.insert(
        "turn_id".to_string(),
        Value::String(event.turn_id.clone().unwrap_or_default()),
    );
    object.insert("sequence".to_string(), json!(event.sequence));
    object.insert("type".to_string(), Value::String(item_type.to_string()));
    object.insert("status".to_string(), Value::String(status.to_string()));
    object.insert(
        "started_at".to_string(),
        Value::String(event.timestamp.clone()),
    );
    object.insert(
        "updated_at".to_string(),
        Value::String(event.timestamp.clone()),
    );
    if status != "in_progress" {
        object.insert(
            "completed_at".to_string(),
            Value::String(event.timestamp.clone()),
        );
    }
    Value::Object(object)
}

fn update_lifecycle_item(object: &mut Map<String, Value>, event: &AgentEvent, status: &str) {
    object.insert("status".to_string(), json!(status));
    object.insert("updated_at".to_string(), json!(event.timestamp));
    object
        .entry("turn_id".to_string())
        .or_insert_with(|| json!(event.turn_id));
    if status != "in_progress" {
        object.insert("completed_at".to_string(), json!(event.timestamp));
    }
    if let Some(existing_sequence) = object.get("sequence").and_then(Value::as_u64) {
        if event.sequence < existing_sequence {
            object.insert("sequence".to_string(), json!(event.sequence));
        }
    }
}

fn merge_optional_field(object: &mut Map<String, Value>, key: &str, value: Option<Value>) {
    let Some(value) = value else {
        return;
    };
    if value.is_null() {
        return;
    }
    if matches!(&value, Value::Array(items) if items.is_empty()) {
        return;
    }
    if value.as_str().is_some_and(str::is_empty) {
        return;
    }
    object.insert(key.to_string(), value);
}

fn merge_lifecycle_metadata(object: &mut Map<String, Value>, event: &AgentEvent) {
    let metadata = object
        .entry("metadata".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let Some(metadata) = metadata.as_object_mut() else {
        return;
    };
    merge_metadata_array(
        metadata,
        "source_event_ids",
        Value::String(event.event_id.clone()),
    );
    merge_metadata_array(
        metadata,
        "source_event_types",
        Value::String(event.event_type.clone()),
    );
    metadata.insert("source_event_id".to_string(), json!(event.event_id));
    metadata.insert("source_event_type".to_string(), json!(event.event_type));
    if let Some(value) = event.payload.get("sourceClient").cloned() {
        metadata.insert("source_client".to_string(), value);
    }
    if let Some(value) = event.payload.get("sourceProvenance").cloned() {
        metadata.insert("source_provenance".to_string(), value);
    }
    if let Some(value) = event.payload.get("imported").cloned() {
        metadata.insert("imported".to_string(), value);
    }
    if let Some(value) = event.payload.get("importedSynthetic").cloned() {
        metadata.insert("imported_synthetic".to_string(), value);
    }
    if let Some(value) = event.payload.get("importedIncomplete").cloned() {
        metadata.insert("imported_incomplete".to_string(), value);
    }
}

fn merge_metadata_array(metadata: &mut Map<String, Value>, key: &str, value: Value) {
    let entry = metadata
        .entry(key.to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let Some(values) = entry.as_array_mut() else {
        return;
    };
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}

fn command_id(payload: &Value) -> Option<String> {
    string_field(
        payload,
        &[
            "commandId",
            "command_id",
            "toolCallId",
            "tool_call_id",
            "id",
        ],
    )
}

fn patch_id(payload: &Value) -> Option<String> {
    string_field(
        payload,
        &["patchId", "patch_id", "toolCallId", "tool_call_id", "id"],
    )
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

fn expert_profile_switch_item(stored: &StoredSession, event: &AgentEvent) -> Option<Value> {
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

fn command_string(payload: &Value) -> Option<String> {
    raw_string_field(
        payload,
        &[
            "canonicalCommand",
            "canonical_command",
            "command",
            "commandSummary",
            "command_summary",
        ],
    )
    .or_else(|| {
        let argv = string_array_field(payload, &["commandArgv", "command_argv"]);
        (!argv.is_empty()).then(|| argv.join(" "))
    })
}

fn reasoning_item(stored: &StoredSession, event: &AgentEvent) -> Option<Value> {
    let text = raw_string_field(
        &event.payload,
        &[
            "text",
            "delta",
            "summary",
            "content",
            "message",
            "outputText",
            "output_text",
        ],
    )?;
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    let status = if matches!(
        event.event_type.as_str(),
        "reasoning.completed" | "reasoning.final"
    ) {
        "completed"
    } else {
        "in_progress"
    };
    Some(base_item(
        stored,
        event,
        "reasoning",
        status,
        json!({
            "text": text,
            "summary": summary_list(&event.payload),
            "metadata": reasoning_metadata(event, &event.payload),
        }),
    ))
}

fn reasoning_item_from_item_event(stored: &StoredSession, event: &AgentEvent) -> Option<Value> {
    let item = event.payload.get("item").unwrap_or(&event.payload);
    let payload = item.get("payload").unwrap_or(item);
    let item_type = string_field(payload, &["type", "kind"])
        .or_else(|| string_field(item, &["type", "kind"]))?;
    if item_type.trim().to_ascii_lowercase() != "reasoning" {
        return None;
    }
    let text = raw_string_field(
        payload,
        &[
            "text",
            "delta",
            "summary",
            "content",
            "message",
            "outputText",
            "output_text",
        ],
    )
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty());
    let status = string_field(item, &["status"])
        .or_else(|| string_field(payload, &["status"]))
        .map(|status| normalize_reasoning_item_status(&status))
        .unwrap_or_else(|| {
            if event.event_type == "item.completed" {
                "completed".to_string()
            } else {
                "in_progress".to_string()
            }
        });
    if text.is_none() && event.event_type != "item.completed" {
        return None;
    }
    let mut value = base_item(
        stored,
        event,
        "reasoning",
        &status,
        compact_json(json!({
            "text": text,
            "summary": summary_list(payload),
            "metadata": reasoning_metadata(event, payload),
        })),
    );
    if let Some(object) = value.as_object_mut() {
        if let Some(id) = string_field(item, &["id", "itemId", "item_id"])
            .or_else(|| string_field(payload, &["id", "itemId", "item_id"]))
        {
            object.insert("id".to_string(), Value::String(id));
        }
        if let Some(thread_id) =
            string_field(item, &["thread_id", "threadId"]).or_else(|| event.thread_id.clone())
        {
            object.insert("thread_id".to_string(), Value::String(thread_id));
        }
        if let Some(turn_id) =
            string_field(item, &["turn_id", "turnId"]).or_else(|| event.turn_id.clone())
        {
            object.insert("turn_id".to_string(), Value::String(turn_id));
        }
        if let Some(sequence) = item.get("sequence").and_then(Value::as_u64) {
            object.insert("sequence".to_string(), json!(sequence));
        }
        if let Some(started_at) = string_field(item, &["started_at", "startedAt"]) {
            object.insert("started_at".to_string(), Value::String(started_at));
        }
        if let Some(updated_at) = string_field(item, &["updated_at", "updatedAt"]) {
            object.insert("updated_at".to_string(), Value::String(updated_at));
        }
        if let Some(completed_at) = string_field(item, &["completed_at", "completedAt"]) {
            object.insert("completed_at".to_string(), Value::String(completed_at));
        }
    }
    Some(value)
}

fn normalize_reasoning_item_status(status: &str) -> String {
    match status.trim() {
        "running" | "pending" | "started" | "inProgress" | "in_progress" => {
            "in_progress".to_string()
        }
        "completed" | "succeeded" | "success" => "completed".to_string(),
        "failed" | "error" => "failed".to_string(),
        _ => "in_progress".to_string(),
    }
}

fn base_item(
    stored: &StoredSession,
    event: &AgentEvent,
    item_type: &str,
    status: &str,
    fields: Value,
) -> Value {
    let mut object = serde_json::Map::new();
    object.insert(
        "id".to_string(),
        Value::String(format!("{}:{}", event.event_type, event.event_id)),
    );
    object.insert(
        "thread_id".to_string(),
        Value::String(
            event
                .thread_id
                .clone()
                .unwrap_or_else(|| stored.session.thread_id.clone()),
        ),
    );
    object.insert(
        "turn_id".to_string(),
        Value::String(event.turn_id.clone().unwrap_or_default()),
    );
    object.insert("sequence".to_string(), json!(event.sequence));
    object.insert("type".to_string(), Value::String(item_type.to_string()));
    object.insert("status".to_string(), Value::String(status.to_string()));
    object.insert(
        "started_at".to_string(),
        Value::String(event.timestamp.clone()),
    );
    object.insert(
        "updated_at".to_string(),
        Value::String(event.timestamp.clone()),
    );
    if status != "in_progress" {
        object.insert(
            "completed_at".to_string(),
            Value::String(event.timestamp.clone()),
        );
    }
    merge_object_fields(&mut object, fields);
    Value::Object(object)
}

fn merge_object_fields(target: &mut serde_json::Map<String, Value>, fields: Value) {
    let Value::Object(fields) = fields else {
        return;
    };
    for (key, value) in fields {
        if value.is_null() {
            continue;
        }
        if matches!(&value, Value::Array(items) if items.is_empty()) {
            continue;
        }
        target.insert(key, value);
    }
}

fn compact_json(value: Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.into_iter()
                .filter_map(|(key, value)| {
                    if value.is_null() {
                        return None;
                    }
                    if matches!(&value, Value::Array(items) if items.is_empty()) {
                        return None;
                    }
                    Some((key, compact_json(value)))
                })
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.into_iter().map(compact_json).collect()),
        value => value,
    }
}

fn event_metadata(event: &AgentEvent) -> Value {
    let mut metadata = serde_json::Map::new();
    metadata.insert("source_event_id".to_string(), json!(event.event_id));
    metadata.insert("source_event_type".to_string(), json!(event.event_type));
    if let Some(value) = event.payload.get("sourceClient").cloned() {
        metadata.insert("source_client".to_string(), value);
    }
    if let Some(value) = event.payload.get("sourceProvenance").cloned() {
        metadata.insert("source_provenance".to_string(), value);
    }
    if let Some(value) = event.payload.get("imported").cloned() {
        metadata.insert("imported".to_string(), value);
    }
    if let Some(value) = event.payload.get("importedSynthetic").cloned() {
        metadata.insert("imported_synthetic".to_string(), value);
    }
    if let Some(value) = event.payload.get("importedIncomplete").cloned() {
        metadata.insert("imported_incomplete".to_string(), value);
    }
    Value::Object(metadata)
}

fn reasoning_metadata(event: &AgentEvent, payload: &Value) -> Value {
    let mut metadata = event_metadata(event);
    let Some(metadata_object) = metadata.as_object_mut() else {
        return metadata;
    };

    merge_reasoning_metadata_object(metadata_object, payload.get("metadata"));
    merge_provider_metadata_aliases(metadata_object, payload);
    merge_provider_metadata_aliases(metadata_object, &event.payload);

    compact_json(metadata)
}

fn merge_reasoning_metadata_object(target: &mut Map<String, Value>, value: Option<&Value>) {
    let Some(Value::Object(source)) = value else {
        return;
    };
    for (key, value) in source {
        if value.is_null() {
            continue;
        }
        target.insert(key.clone(), value.clone());
    }
    if let Some(value) = value {
        merge_provider_metadata_aliases(target, value);
    }
}

fn merge_provider_metadata_aliases(target: &mut Map<String, Value>, source: &Value) {
    let Some(source) = source.as_object() else {
        return;
    };
    if let Some(value) = source
        .get("provider_metadata")
        .or_else(|| source.get("providerMetadata"))
        .cloned()
        .filter(|value| !value.is_null())
    {
        target.insert("provider_metadata".to_string(), value);
    }
}

fn command_exit_item_status(payload: &Value) -> &'static str {
    let exit_code = payload
        .get("exitCode")
        .or_else(|| payload.get("exit_code"))
        .and_then(Value::as_i64);
    match exit_code {
        Some(0) | None => "completed",
        Some(_) => "failed",
    }
}

fn summary_list(payload: &Value) -> Vec<String> {
    let mut values = Vec::new();
    if let Some(summary) = raw_string_field(payload, &["summary"]) {
        values.push(summary);
    }
    for value in payload
        .get("summary")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
    {
        values.push(value.to_string());
    }
    values
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::{AgentSession, AgentSessionStatus};
    use std::collections::HashMap;

    fn stored_session(events: Vec<AgentEvent>) -> StoredSession {
        StoredSession {
            session: AgentSession {
                session_id: "session-1".to_string(),
                thread_id: "thread-1".to_string(),
                app_id: "agent-runtime".to_string(),
                workspace_id: None,
                business_object_ref: None,
                status: AgentSessionStatus::Running,
                created_at: "2026-06-23T00:00:00.000Z".to_string(),
                updated_at: "2026-06-23T00:00:00.000Z".to_string(),
            },
            turns: Vec::new(),
            turn_inputs: HashMap::new(),
            turn_runtime_options: HashMap::new(),
            events,
            output_blobs: HashMap::new(),
        }
    }

    fn agent_event(event_id: &str, sequence: u64, event_type: &str, payload: Value) -> AgentEvent {
        AgentEvent {
            event_id: event_id.to_string(),
            sequence,
            session_id: "session-1".to_string(),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
            event_type: event_type.to_string(),
            timestamp: "2026-06-23T00:00:01.000Z".to_string(),
            payload,
        }
    }

    #[test]
    fn reasoning_item_payload_metadata_is_preserved_in_thread_items() {
        let stored = stored_session(vec![agent_event(
            "evt-reasoning-item",
            7,
            "item.started",
            json!({
                "item": {
                    "id": "reasoning-1",
                    "thread_id": "thread-1",
                    "turn_id": "turn-1",
                    "sequence": 7,
                    "status": "in_progress",
                    "type": "reasoning",
                    "text": "先判断任务类型",
                    "summary": ["先判断任务类型"],
                    "metadata": {
                        "provider_metadata": {
                            "signature": "sig-anthropic"
                        },
                        "native_reasoning_item_id": "rs_123"
                    }
                }
            }),
        )]);

        let items = thread_items_from_events(&stored);

        assert_eq!(items.len(), 1);
        let metadata = items[0]
            .get("metadata")
            .and_then(Value::as_object)
            .expect("reasoning metadata");
        assert_eq!(
            metadata.get("source_event_id"),
            Some(&json!("evt-reasoning-item"))
        );
        assert_eq!(
            metadata
                .get("provider_metadata")
                .and_then(|value| value.get("signature")),
            Some(&json!("sig-anthropic"))
        );
        assert_eq!(
            metadata.get("native_reasoning_item_id"),
            Some(&json!("rs_123"))
        );
    }

    #[test]
    fn reasoning_final_provider_metadata_is_projected_to_thread_item_metadata() {
        let stored = stored_session(vec![agent_event(
            "evt-reasoning-final",
            8,
            "reasoning.final",
            json!({
                "reasoningId": "runtime-thinking",
                "text": "完整思考摘要",
                "providerMetadata": {
                    "backend": "codex",
                    "summary_index": 1
                }
            }),
        )]);

        let items = thread_items_from_events(&stored);

        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["type"], "reasoning");
        assert_eq!(items[0]["status"], "completed");
        assert_eq!(items[0]["text"], "完整思考摘要");
        assert_eq!(
            items[0]
                .get("metadata")
                .and_then(|metadata| metadata.get("provider_metadata"))
                .and_then(|provider_metadata| provider_metadata.get("backend")),
            Some(&json!("codex"))
        );
        assert_eq!(
            items[0]
                .get("metadata")
                .and_then(|metadata| metadata.get("provider_metadata"))
                .and_then(|provider_metadata| provider_metadata.get("summary_index")),
            Some(&json!(1))
        );
    }

    #[test]
    fn agent_message_delta_preserves_item_id_and_phase() {
        let stored = stored_session(vec![
            agent_event(
                "evt-commentary-1",
                1,
                "message.delta",
                json!({
                    "itemId": "agent-message-commentary",
                    "text": "我先搜索",
                    "phase": "commentary",
                    "imported": true
                }),
            ),
            agent_event(
                "evt-commentary-2",
                2,
                "message.delta",
                json!({
                    "itemId": "agent-message-commentary",
                    "text": "并筛选来源。",
                    "phase": "commentary",
                    "imported": true
                }),
            ),
        ]);

        let items = thread_items_from_events(&stored);

        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["id"], "agent-message-commentary");
        assert_eq!(items[0]["type"], "agent_message");
        assert_eq!(items[0]["phase"], "commentary");
        assert_eq!(items[0]["text"], "我先搜索并筛选来源。");
    }

    #[test]
    fn agent_message_delta_waits_for_item_completed_terminal() {
        let stored = stored_session(vec![
            agent_event(
                "evt-agent-delta-1",
                1,
                "message.delta",
                json!({
                    "itemId": "agent-final-1",
                    "text": "Hel",
                    "phase": "final_answer"
                }),
            ),
            agent_event(
                "evt-agent-delta-2",
                2,
                "message.delta",
                json!({
                    "itemId": "agent-final-1",
                    "text": "lo",
                    "phase": "final_answer"
                }),
            ),
            agent_event(
                "evt-agent-terminal",
                3,
                "item.completed",
                json!({
                    "item": {
                        "id": "agent-final-1",
                        "type": "agent_message",
                        "status": "completed"
                    }
                }),
            ),
        ]);

        let items = thread_items_from_events(&stored);

        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["id"], "agent-final-1");
        assert_eq!(items[0]["type"], "agent_message");
        assert_eq!(items[0]["status"], "completed");
        assert_eq!(items[0]["text"], "Hello");
        assert!(items[0].get("completed_at").is_some());
    }

    #[test]
    fn turn_failed_does_not_complete_agent_message_item_without_item_terminal() {
        let stored = stored_session(vec![
            agent_event(
                "evt-agent-delta",
                1,
                "message.delta",
                json!({
                    "itemId": "agent-final-1",
                    "text": "partial",
                    "phase": "final_answer"
                }),
            ),
            agent_event(
                "evt-turn-failed",
                2,
                "turn.failed",
                json!({
                    "message": "provider stream timed out"
                }),
            ),
        ]);

        let items = thread_items_from_events(&stored);

        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["id"], "agent-final-1");
        assert_eq!(items[0]["type"], "agent_message");
        assert_eq!(items[0]["status"], "in_progress");
        assert_eq!(items[0]["text"], "partial");
        assert!(items[0].get("completed_at").is_none());
    }

    #[test]
    fn item_completed_agent_message_replaces_delta_text_when_terminal_has_full_text() {
        let stored = stored_session(vec![
            agent_event(
                "evt-agent-delta",
                1,
                "message.delta",
                json!({
                    "itemId": "agent-final-1",
                    "text": "draft",
                    "phase": "final_answer"
                }),
            ),
            agent_event(
                "evt-agent-terminal",
                2,
                "item.completed",
                json!({
                    "item": {
                        "id": "agent-final-1",
                        "type": "agent_message",
                        "text": "final answer",
                        "status": "completed"
                    }
                }),
            ),
        ]);

        let items = thread_items_from_events(&stored);

        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["id"], "agent-final-1");
        assert_eq!(items[0]["type"], "agent_message");
        assert_eq!(items[0]["status"], "completed");
        assert_eq!(items[0]["text"], "final answer");
    }

    #[test]
    fn item_updated_agent_message_cumulative_text_replaces_delta_prefix() {
        let stored = stored_session(vec![
            agent_event(
                "evt-agent-delta-1",
                1,
                "message.delta",
                json!({
                    "itemId": "agent-final-1",
                    "text": "写作",
                    "phase": "final_answer"
                }),
            ),
            agent_event(
                "evt-agent-update-1",
                2,
                "item.updated",
                json!({
                    "item": {
                        "id": "agent-final-1",
                        "type": "agent_message",
                        "text": "写作思路：",
                        "status": "in_progress"
                    }
                }),
            ),
            agent_event(
                "evt-agent-delta-2",
                3,
                "message.delta",
                json!({
                    "itemId": "agent-final-1",
                    "text": "先用",
                    "phase": "final_answer"
                }),
            ),
            agent_event(
                "evt-agent-update-2",
                4,
                "item.updated",
                json!({
                    "item": {
                        "id": "agent-final-1",
                        "type": "agent_message",
                        "text": "写作思路：先用两句话自然说明写作思路。",
                        "status": "in_progress"
                    }
                }),
            ),
        ]);

        let items = thread_items_from_events(&stored);

        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["id"], "agent-final-1");
        assert_eq!(items[0]["type"], "agent_message");
        assert_eq!(items[0]["status"], "in_progress");
        assert_eq!(items[0]["text"], "写作思路：先用两句话自然说明写作思路。");
    }
}
