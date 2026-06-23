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
    if let Some(value) = event
        .payload
        .get("revisionId")
        .or_else(|| event.payload.get("revision_id"))
        .cloned()
    {
        metadata_object.insert("revisionId".to_string(), value);
    }
    if let Some(value) = event.payload.get("source").cloned() {
        metadata_object.insert("source".to_string(), value);
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::{AgentSession, AgentSessionStatus};
    use std::collections::HashMap;

    fn stored_session() -> StoredSession {
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
            events: Vec::new(),
            output_blobs: HashMap::new(),
        }
    }

    #[test]
    fn plan_item_preserves_revision_source_and_plan_metadata() {
        let event = AgentEvent {
            event_id: "evt-plan-final".to_string(),
            sequence: 7,
            session_id: "session-1".to_string(),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
            event_type: "plan.final".to_string(),
            timestamp: "2026-06-23T00:00:01.000Z".to_string(),
            payload: json!({
                "text": "- [ ] 验证历史恢复",
                "revisionId": "proposed_plan:1",
                "source": "proposed_plan",
                "plan": [
                    { "step": "验证历史恢复", "status": "pending" }
                ],
            }),
        };

        let item = plan_item(&stored_session(), &event).expect("plan item");
        assert_eq!(item["type"], "plan");
        assert_eq!(item["status"], "completed");
        assert_eq!(item["metadata"]["revisionId"], "proposed_plan:1");
        assert_eq!(item["metadata"]["source"], "proposed_plan");
        assert_eq!(item["metadata"]["plan"][0]["step"], "验证历史恢复");
    }
}
