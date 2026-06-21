mod plan;

use super::raw_string_field;
use super::string_array_field;
use super::string_field;
use super::StoredSession;
use app_server_protocol::AgentEvent;
use serde_json::{json, Map, Value};
use std::collections::HashMap;

pub(super) fn thread_items_from_events(stored: &StoredSession) -> Vec<Value> {
    let mut items = Vec::new();
    let mut last_text_item_by_turn = std::collections::HashMap::<String, usize>::new();
    let mut command_items = HashMap::<String, Value>::new();
    let mut patch_items = HashMap::<String, Value>::new();
    let mut reasoning_items = HashMap::<String, Value>::new();
    let mut approval_items = HashMap::<String, Value>::new();
    let mut context_compaction_items = HashMap::<String, Value>::new();
    let mut subagent_items = HashMap::<String, Value>::new();

    for event in &stored.events {
        match event.event_type.as_str() {
            "message.delta" => {
                if let Some(item) = agent_message_item(stored, event) {
                    if is_imported_agent_message_event(event) {
                        items.push(item);
                        continue;
                    }
                    if let Some(turn_id) = event.turn_id.as_deref() {
                        if let Some(existing_index) = last_text_item_by_turn.get(turn_id).copied() {
                            merge_agent_message_item(&mut items[existing_index], &item);
                            continue;
                        }
                        last_text_item_by_turn.insert(turn_id.to_string(), items.len());
                    }
                    items.push(item);
                }
            }
            "reasoning.delta" | "reasoning.summary" | "reasoning.completed" => {
                if let Some(item) = reasoning_item(stored, event) {
                    items.push(item);
                }
            }
            "item.started" | "item.updated" | "item.completed" => {
                upsert_reasoning_item(stored, event, &mut reasoning_items);
            }
            "plan.delta" | "plan.final" => {
                if let Some(item) = plan::plan_item(stored, event) {
                    items.push(item);
                }
            }
            "tool.started" | "tool.result" | "tool.failed" => {}
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

fn is_imported_agent_message_event(event: &AgentEvent) -> bool {
    event
        .payload
        .get("imported")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || string_field(&event.payload, &["sourceClient", "source_client"])
            .is_some_and(|value| !value.trim().is_empty())
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
    let status = match event.event_type.as_str() {
        "action.required" => "in_progress",
        "action.cancelled" | "action.canceled" | "action.expired" => "failed",
        _ => "completed",
    };
    let entry = items.entry(request_id.clone()).or_insert_with(|| {
        lifecycle_base_item(stored, event, &request_id, "approval_request", status)
    });
    let Some(object) = entry.as_object_mut() else {
        return;
    };

    update_lifecycle_item(object, event, status);
    object.insert("request_id".to_string(), json!(request_id));
    merge_optional_field(
        object,
        "action_type",
        string_field(&event.payload, &["actionType", "action_type"])
            .or_else(|| Some("tool_confirmation".to_string()))
            .map(Value::String),
    );
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
    if event.event_type != "action.required" {
        object.insert(
            "response".to_string(),
            compact_json(json!({
                "decision": string_field(&event.payload, &["decision", "status"])
                    .unwrap_or_else(|| if status == "completed" { "approved" } else { "failed" }.to_string()),
                "source": string_field(&event.payload, &["sourceClient", "source_client"])
                    .unwrap_or_else(|| "runtime".to_string()),
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

fn agent_message_item(stored: &StoredSession, event: &AgentEvent) -> Option<Value> {
    let text = raw_string_field(
        &event.payload,
        &[
            "text",
            "delta",
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
    Some(base_item(
        stored,
        event,
        "agent_message",
        "completed",
        json!({
            "text": text,
            "phase": "final",
            "metadata": event_metadata(event),
        }),
    ))
}

fn merge_agent_message_item(existing: &mut Value, next: &Value) {
    let Some(existing_object) = existing.as_object_mut() else {
        return;
    };
    let Some(next_text) = next.get("text").and_then(Value::as_str) else {
        return;
    };
    if let Some(existing_text) = existing_object.get_mut("text") {
        let merged = format!(
            "{}{}",
            existing_text.as_str().unwrap_or_default(),
            next_text
        );
        *existing_text = Value::String(merged);
    }
    if let Some(updated_at) = next.get("updated_at").cloned() {
        existing_object.insert("updated_at".to_string(), updated_at);
    }
    if let Some(completed_at) = next.get("completed_at").cloned() {
        existing_object.insert("completed_at".to_string(), completed_at);
    }
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
    let status = if event.event_type == "reasoning.completed" {
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
            "metadata": event_metadata(event),
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
            "metadata": event_metadata(event),
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
