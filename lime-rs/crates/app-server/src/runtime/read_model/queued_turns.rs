use super::super::status::agent_turn_status_label;
use super::super::StoredSession;
use super::messages;
use agent_protocol::AgentInput;
use app_server_protocol::{AgentTurn, AgentTurnStatus};
use serde_json::{json, Value};

pub(super) fn queued_turn_snapshots(stored: &StoredSession) -> Vec<serde_json::Value> {
    stored
        .turns
        .iter()
        .filter(|turn| matches!(turn.status, AgentTurnStatus::Queued))
        .enumerate()
        .map(|(index, turn)| queued_turn_snapshot(stored, turn, index))
        .collect::<Vec<_>>()
}

fn queued_turn_input_attachments(input: Option<&[AgentInput]>) -> Vec<Value> {
    input
        .map(|input| {
            input
                .iter()
                .filter_map(|part| match part {
                    AgentInput::Image { uri, detail } => Some(json!({
                        "kind": "image",
                        "uri": uri,
                        "detail": detail,
                    })),
                    AgentInput::LocalImage { path, detail } => Some(json!({
                        "kind": "image",
                        "uri": path,
                        "detail": detail,
                        "metadata": {"localPath": path},
                    })),
                    AgentInput::Text { .. }
                    | AgentInput::Skill { .. }
                    | AgentInput::Mention { .. } => None,
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn runtime_metadata_array(metadata: Option<&Value>, keys: &[&str]) -> Vec<Value> {
    metadata
        .and_then(|metadata| {
            keys.iter()
                .filter_map(|key| metadata.get(*key))
                .find_map(Value::as_array)
        })
        .cloned()
        .unwrap_or_default()
}

fn runtime_harness_metadata_array(metadata: Option<&Value>, keys: &[&str]) -> Vec<Value> {
    metadata
        .and_then(|metadata| metadata.get("harness"))
        .and_then(|harness| {
            keys.iter()
                .filter_map(|key| harness.get(*key))
                .find_map(Value::as_array)
        })
        .cloned()
        .unwrap_or_default()
}

fn runtime_metadata_value(metadata: Option<&Value>, keys: &[&str]) -> Option<Value> {
    metadata.and_then(|metadata| {
        keys.iter()
            .filter_map(|key| metadata.get(*key))
            .find(|value| !value.is_null())
            .cloned()
    })
}

fn runtime_harness_metadata_value(metadata: Option<&Value>, keys: &[&str]) -> Option<Value> {
    metadata
        .and_then(|metadata| metadata.get("harness"))
        .and_then(|harness| {
            keys.iter()
                .filter_map(|key| harness.get(*key))
                .find(|value| !value.is_null())
                .cloned()
        })
}

fn queued_turn_path_references(metadata: Option<&Value>) -> Vec<Value> {
    let direct = runtime_metadata_array(metadata, &["path_references", "pathReferences"]);
    if !direct.is_empty() {
        return direct;
    }
    runtime_harness_metadata_array(
        metadata,
        &[
            "file_references",
            "fileReferences",
            "path_references",
            "pathReferences",
        ],
    )
}

fn queued_turn_text_elements(metadata: Option<&Value>) -> Vec<Value> {
    let direct = runtime_metadata_array(metadata, &["text_elements", "textElements"]);
    if !direct.is_empty() {
        return direct;
    }
    runtime_harness_metadata_array(metadata, &["text_elements", "textElements"])
}

fn queued_turn_input_capability_route(metadata: Option<&Value>) -> Value {
    runtime_metadata_value(
        metadata,
        &["input_capability_route", "inputCapabilityRoute"],
    )
    .or_else(|| {
        runtime_harness_metadata_value(
            metadata,
            &["input_capability_route", "inputCapabilityRoute"],
        )
    })
    .unwrap_or(Value::Null)
}

fn queued_turn_snapshot(
    stored: &StoredSession,
    turn: &AgentTurn,
    index: usize,
) -> serde_json::Value {
    let input = stored
        .turn_inputs
        .get(&turn.turn_id)
        .cloned()
        .or_else(|| messages::turn_input_from_events(&stored.events, &turn.turn_id));
    let runtime_metadata = stored
        .turn_runtime_options
        .get(&turn.turn_id)
        .and_then(app_server_protocol::RuntimeOptions::runtime_metadata);
    let message_text = input
        .as_ref()
        .map(|input| {
            input
                .iter()
                .filter_map(|part| match part {
                    AgentInput::Text { text, .. } => Some(text.as_str()),
                    AgentInput::Image { .. }
                    | AgentInput::LocalImage { .. }
                    | AgentInput::Skill { .. }
                    | AgentInput::Mention { .. } => None,
                })
                .collect::<String>()
                .trim()
                .to_string()
        })
        .filter(|text| !text.is_empty())
        .unwrap_or_default();
    let message_preview = if message_text.chars().count() > 80 {
        let preview = message_text.chars().take(80).collect::<String>();
        format!("{preview}...")
    } else {
        message_text.clone()
    };
    let image_count = input
        .as_ref()
        .map(|input| {
            input
                .iter()
                .filter(|part| {
                    matches!(
                        part,
                        AgentInput::Image { .. } | AgentInput::LocalImage { .. }
                    )
                })
                .count()
        })
        .unwrap_or(0);
    let attachments = queued_turn_input_attachments(input.as_deref());
    let path_references = queued_turn_path_references(runtime_metadata);
    let text_elements = queued_turn_text_elements(runtime_metadata);
    let input_capability_route = queued_turn_input_capability_route(runtime_metadata);

    json!({
        "queued_turn_id": turn.turn_id,
        "queuedTurnId": turn.turn_id,
        "turn_id": turn.turn_id,
        "turnId": turn.turn_id,
        "session_id": turn.session_id,
        "sessionId": turn.session_id,
        "thread_id": turn.thread_id,
        "threadId": turn.thread_id,
        "status": agent_turn_status_label(turn.status),
        "message_text": message_text,
        "messageText": message_text,
        "message_preview": message_preview,
        "messagePreview": message_preview,
        "image_count": image_count,
        "imageCount": image_count,
        "attachments": attachments.clone(),
        "input_attachments": attachments.clone(),
        "inputAttachments": attachments,
        "path_references": path_references.clone(),
        "pathReferences": path_references,
        "text_elements": text_elements.clone(),
        "textElements": text_elements,
        "input_capability_route": input_capability_route.clone(),
        "inputCapabilityRoute": input_capability_route,
        "position": index,
        "created_at": turn.started_at,
        "createdAt": turn.started_at,
        "started_at": turn.started_at,
        "startedAt": turn.started_at,
    })
}
