use app_server_protocol::{AgentEvent, AgentTurn};
use serde_json::{json, Value};

pub(super) fn turns_with_usage(turns: &[AgentTurn], events: &[AgentEvent]) -> Vec<Value> {
    turns
        .iter()
        .map(|turn| {
            let mut value = serde_json::to_value(turn).unwrap_or_else(|_| {
                json!({
                    "turnId": turn.turn_id,
                    "sessionId": turn.session_id,
                    "threadId": turn.thread_id,
                    "status": turn.status,
                    "startedAt": turn.started_at,
                    "completedAt": turn.completed_at,
                })
            });
            if let Some(usage) = usage_for_turn(events, &turn.turn_id) {
                if let Some(record) = value.as_object_mut() {
                    record.insert("usage".to_string(), usage);
                }
            }
            value
        })
        .collect()
}

pub(super) fn latest_usage_for_turn(events: &[AgentEvent], turn_id: Option<&str>) -> Option<Value> {
    events
        .iter()
        .rev()
        .filter(|event| event.event_type == "turn.completed")
        .filter(|event| match turn_id {
            Some(turn_id) => event.turn_id.as_deref() == Some(turn_id),
            None => true,
        })
        .find_map(|event| normalized_usage(&event.payload))
}

fn usage_for_turn(events: &[AgentEvent], turn_id: &str) -> Option<Value> {
    latest_usage_for_turn(events, Some(turn_id))
}

fn normalized_usage(payload: &Value) -> Option<Value> {
    let usage = payload.get("usage")?;
    if !usage.is_object() {
        return None;
    }
    Some(usage.clone())
}
