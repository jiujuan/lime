use app_server_protocol::AgentEvent;
use app_server_protocol::AgentInput;
use serde_json::json;
use serde_json::Value;
use std::collections::HashMap;

pub(super) const TURN_INPUT_EVENT_TYPE: &str = "message.created";

pub(super) fn runtime_event_for_turn_input(input: &AgentInput) -> Option<super::RuntimeEvent> {
    if input.text.trim().is_empty() && input.attachments.is_empty() {
        return None;
    }
    Some(super::RuntimeEvent::new(
        TURN_INPUT_EVENT_TYPE,
        json!({
            "role": "user",
            "visibility": "user_visible",
            "input": input,
            "content": {
                "kind": "inline_text",
                "text": input.text,
            },
            "attachments": input.attachments,
        }),
    ))
}

pub(super) fn turn_inputs_from_events(events: &[AgentEvent]) -> HashMap<String, AgentInput> {
    events
        .iter()
        .filter(|event| event.event_type == TURN_INPUT_EVENT_TYPE)
        .filter_map(turn_input_from_event)
        .collect()
}

pub(super) fn is_turn_input_event(event: &AgentEvent) -> bool {
    is_turn_input_event_type(&event.event_type)
}

pub(super) fn is_turn_input_event_type(event_type: &str) -> bool {
    event_type == TURN_INPUT_EVENT_TYPE
}

fn turn_input_from_event(event: &AgentEvent) -> Option<(String, AgentInput)> {
    let turn_id = event.turn_id.clone()?;
    if let Some(input) = event
        .payload
        .get("input")
        .and_then(|value| serde_json::from_value::<AgentInput>(value.clone()).ok())
    {
        return Some((turn_id, input));
    }

    let text = turn_input_text(&event.payload)?;
    let attachments = event
        .payload
        .get("attachments")
        .and_then(|value| serde_json::from_value(value.clone()).ok())
        .unwrap_or_default();
    Some((turn_id, AgentInput { text, attachments }))
}

fn turn_input_text(payload: &Value) -> Option<String> {
    payload
        .get("content")
        .and_then(|content| {
            content
                .get("text")
                .or_else(|| content.get("message"))
                .and_then(Value::as_str)
        })
        .or_else(|| payload.get("text").and_then(Value::as_str))
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToString::to_string)
}
