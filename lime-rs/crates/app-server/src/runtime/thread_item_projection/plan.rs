use super::super::raw_string_field;
use super::super::string_field;
use super::super::StoredSession;
use super::base_item;
use super::event_metadata;
use app_server_protocol::AgentEvent;
use serde_json::{json, Value};

pub(super) fn plan_item(stored: &StoredSession, event: &AgentEvent) -> Option<Value> {
    let text = raw_string_field(
        &event.payload,
        &[
            "text",
            "summary",
            "content",
            "message",
            "outputText",
            "output_text",
        ],
    )
    .or_else(|| plan_text_from_payload(&event.payload))?;
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    let status = if event.event_type == "plan.final" {
        "completed"
    } else {
        "in_progress"
    };
    Some(base_item(
        stored,
        event,
        "plan",
        status,
        json!({
            "text": text,
            "metadata": plan_metadata(event),
        }),
    ))
}

fn plan_metadata(event: &AgentEvent) -> Value {
    let mut metadata = event_metadata(event);
    let Some(metadata_object) = metadata.as_object_mut() else {
        return metadata;
    };
    if let Some(value) = event.payload.get("plan").cloned() {
        metadata_object.insert("plan".to_string(), value);
    }
    if let Some(value) = event.payload.get("explanation").cloned() {
        metadata_object.insert("explanation".to_string(), value);
    }
    if let Some(value) = event.payload.get("toolCallId").cloned() {
        metadata_object.insert("tool_call_id".to_string(), value);
    }
    if let Some(value) = event.payload.get("sourceItemId").cloned() {
        metadata_object.insert("source_item_id".to_string(), value);
    }
    metadata
}

fn plan_text_from_payload(payload: &Value) -> Option<String> {
    let lines = payload
        .get("plan")
        .and_then(Value::as_array)?
        .iter()
        .filter_map(|item| {
            let step = raw_string_field(item, &["step"])?.trim().to_string();
            if step.is_empty() {
                return None;
            }
            let status = string_field(item, &["status"]).unwrap_or_else(|| "pending".to_string());
            let marker = if status == "completed" { "[x]" } else { "[ ]" };
            Some(format!("- {marker} {step}"))
        })
        .collect::<Vec<_>>();
    (!lines.is_empty()).then(|| lines.join("\n"))
}
