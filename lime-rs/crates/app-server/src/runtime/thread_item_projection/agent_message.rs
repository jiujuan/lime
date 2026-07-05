use super::super::raw_string_field;
use super::super::string_field;
use super::super::StoredSession;
use super::base_item;
use super::compact_json;
use super::event_metadata;
use app_server_protocol::AgentEvent;
use serde_json::{json, Value};
use std::collections::HashMap;

pub(super) fn item_from_delta(stored: &StoredSession, event: &AgentEvent) -> Option<Value> {
    let text = text_from_payload(&event.payload)?;
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    let phase = raw_string_field(&event.payload, &["phase", "messagePhase", "message_phase"])
        .unwrap_or_else(|| "final".to_string());
    Some(base_item(
        stored,
        event,
        "agent_message",
        &status_from_delta_event(event),
        json!({
            "id": raw_string_field(
                &event.payload,
                &["id", "itemId", "item_id", "messageId", "message_id"],
            ),
            "text": text,
            "phase": phase,
            "metadata": event_metadata(event),
        }),
    ))
}

pub(super) fn payload_id(event: &AgentEvent) -> Option<String> {
    raw_string_field(
        &event.payload,
        &["id", "itemId", "item_id", "messageId", "message_id"],
    )
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty())
}

pub(super) fn is_imported_event(event: &AgentEvent) -> bool {
    event
        .payload
        .get("imported")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || string_field(&event.payload, &["sourceClient", "source_client"])
            .is_some_and(|value| !value.trim().is_empty())
}

pub(super) fn upsert_from_item_event(
    stored: &StoredSession,
    event: &AgentEvent,
    items: &mut Vec<Value>,
    item_by_id: &mut HashMap<String, usize>,
) -> bool {
    let Some(next) = item_from_item_event(stored, event) else {
        return false;
    };
    let Some(item_id) = string_field(&next, &["id"]) else {
        return true;
    };
    if let Some(existing_index) = item_by_id.get(&item_id).copied() {
        merge_item(&mut items[existing_index], &next);
        return true;
    }
    if next.get("text").and_then(Value::as_str).is_none() {
        return true;
    }
    item_by_id.insert(item_id, items.len());
    items.push(next);
    true
}

pub(super) fn merge_item(existing: &mut Value, next: &Value) {
    let Some(existing_object) = existing.as_object_mut() else {
        return;
    };
    let next_source_event_type = next
        .pointer("/metadata/source_event_type")
        .and_then(Value::as_str);
    if let Some(next_text) = next.get("text").and_then(Value::as_str) {
        if let Some(existing_text) = existing_object.get_mut("text") {
            let merged = if next_source_event_type == Some("item.completed") {
                next_text.to_string()
            } else if next_source_event_type == Some("item.updated") {
                merge_cumulative_text(existing_text.as_str().unwrap_or_default(), next_text)
            } else {
                format!(
                    "{}{}",
                    existing_text.as_str().unwrap_or_default(),
                    next_text
                )
            };
            *existing_text = Value::String(merged);
        } else {
            existing_object.insert("text".to_string(), Value::String(next_text.to_string()));
        }
    }
    if let Some(status) = next.get("status").and_then(Value::as_str) {
        let existing_is_completed = existing_object
            .get("status")
            .and_then(Value::as_str)
            .is_some_and(|value| value == "completed");
        if !existing_is_completed || status == "completed" {
            existing_object.insert("status".to_string(), Value::String(status.to_string()));
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

fn merge_cumulative_text(existing_text: &str, next_text: &str) -> String {
    if next_text.is_empty() {
        return existing_text.to_string();
    }
    if existing_text.is_empty() {
        return next_text.to_string();
    }
    if next_text.starts_with(existing_text) || next_text.contains(existing_text) {
        return next_text.to_string();
    }
    if existing_text.ends_with(next_text) {
        return existing_text.to_string();
    }
    if existing_text.contains(next_text) {
        return existing_text.to_string();
    }
    format!("{existing_text}{next_text}")
}

fn item_from_item_event(stored: &StoredSession, event: &AgentEvent) -> Option<Value> {
    let item = event.payload.get("item").unwrap_or(&event.payload);
    let payload = item.get("payload").unwrap_or(item);
    let item_type = string_field(payload, &["type", "kind"])
        .or_else(|| string_field(item, &["type", "kind"]))?;
    let role = string_field(payload, &["role"]).or_else(|| string_field(item, &["role"]));
    if !is_item_type(&item_type, role.as_deref()) {
        return None;
    }
    let item_id = string_field(
        item,
        &["id", "itemId", "item_id", "messageId", "message_id"],
    )
    .or_else(|| {
        string_field(
            payload,
            &["id", "itemId", "item_id", "messageId", "message_id"],
        )
    })?;
    let text = text_from_payload(payload)
        .or_else(|| text_from_payload(item))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let phase = raw_string_field(payload, &["phase", "messagePhase", "message_phase"])
        .or_else(|| raw_string_field(item, &["phase", "messagePhase", "message_phase"]))
        .unwrap_or_else(|| "final".to_string());
    let status = string_field(item, &["status"])
        .or_else(|| string_field(payload, &["status"]))
        .map(|status| normalize_status(&status))
        .unwrap_or_else(|| {
            if event.event_type == "item.completed" {
                "completed".to_string()
            } else {
                "in_progress".to_string()
            }
        });

    Some(base_item(
        stored,
        event,
        "agent_message",
        &status,
        compact_json(json!({
            "id": item_id,
            "text": text,
            "phase": phase,
            "metadata": event_metadata(event),
        })),
    ))
}

fn status_from_delta_event(event: &AgentEvent) -> String {
    string_field(&event.payload, &["status"])
        .map(|status| normalize_status(&status))
        .unwrap_or_else(|| {
            if payload_id(event).is_some() && !is_imported_event(event) {
                "in_progress".to_string()
            } else {
                "completed".to_string()
            }
        })
}

fn is_item_type(item_type: &str, role: Option<&str>) -> bool {
    let normalized = item_type
        .trim()
        .replace('-', "_")
        .replace(' ', "_")
        .to_ascii_lowercase();
    matches!(
        normalized.as_str(),
        "agent_message" | "agentmessage" | "assistant_message" | "assistantmessage"
    ) || (normalized == "message"
        && role.is_some_and(|role| role.trim().eq_ignore_ascii_case("assistant")))
}

fn normalize_status(status: &str) -> String {
    match status.trim() {
        "running" | "pending" | "started" | "inProgress" | "in_progress" => {
            "in_progress".to_string()
        }
        "completed" | "succeeded" | "success" => "completed".to_string(),
        "failed" | "error" => "failed".to_string(),
        _ => "in_progress".to_string(),
    }
}

fn text_from_payload(payload: &Value) -> Option<String> {
    if let Some(text) = payload
        .as_str()
        .map(str::to_string)
        .filter(|text| !text.is_empty())
    {
        return Some(text);
    }
    raw_string_field(
        payload,
        &[
            "text",
            "delta",
            "content",
            "message",
            "outputText",
            "output_text",
        ],
    )
    .or_else(|| {
        payload
            .get("content")
            .and_then(|content| raw_string_field(content, &["text", "message"]))
    })
    .or_else(|| {
        for key in ["deltas", "messages", "items", "parts", "content"] {
            let Some(values) = payload.get(key).and_then(Value::as_array) else {
                continue;
            };
            let text = values
                .iter()
                .filter_map(text_from_payload)
                .collect::<String>();
            if !text.is_empty() {
                return Some(text);
            }
        }
        None
    })
}
