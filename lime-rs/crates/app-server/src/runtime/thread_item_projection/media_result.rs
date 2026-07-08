use super::base_item;
use super::compact_json;
use super::event_metadata;
use super::StoredSession;
use app_server_protocol::AgentEvent;
use runtime_core::runtime_media_part_from_reference;
use runtime_core::RuntimeMediaPartInput;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;
use std::collections::HashMap;

const IMAGE_TASK_TOOL_NAME: &str = "lime_create_image_generation_task";
const EVENT_OWNER_FACTS_SOURCE: &str = "media_task_result_owner_facts";
const STORE_OWNER_FACTS_SOURCE: &str = "media_task_store_owner_facts";

pub(in crate::runtime) struct MediaTaskRecordProjectionInput<'a> {
    pub(in crate::runtime) task_id: &'a str,
    pub(in crate::runtime) task_type: &'a str,
    pub(in crate::runtime) normalized_status: &'a str,
    pub(in crate::runtime) artifact_path: Option<&'a str>,
    pub(in crate::runtime) record: &'a Value,
    pub(in crate::runtime) thread_id: Option<&'a str>,
    pub(in crate::runtime) turn_id: Option<&'a str>,
    pub(in crate::runtime) sequence: u64,
    pub(in crate::runtime) timestamp: &'a str,
}

pub(super) fn upsert_from_event(
    stored: &StoredSession,
    event: &AgentEvent,
    items: &mut HashMap<String, Value>,
) {
    let Some(item) = item_from_event(stored, event) else {
        return;
    };
    let Some(item_id) = string_field(&item, &["id"]) else {
        return;
    };
    items.entry(item_id).or_insert(item);
}

fn item_from_event(stored: &StoredSession, event: &AgentEvent) -> Option<Value> {
    let payload = tool_payload(event)?;
    let metadata = tool_result_metadata(payload)?;
    if !is_image_task_result(payload, metadata) {
        return None;
    }

    let record = metadata.get("record")?;
    let record_with_result;
    let record = if record.get("result").is_some() {
        record
    } else if let Some(result) = metadata.get("result").filter(|value| value.is_object()) {
        record_with_result = record_with_result_field(record, result);
        &record_with_result
    } else {
        record
    };
    let task_id = task_id(metadata, record)?;
    let task_type = string_field(metadata, &["task_type", "taskType"])
        .or_else(|| string_field(record, &["task_type", "taskType"]))
        .unwrap_or_else(|| "image_generate".to_string());
    let normalized_status = string_field(
        metadata,
        &["normalized_status", "normalizedStatus", "status"],
    )
    .or_else(|| string_field(record, &["normalized_status", "normalizedStatus", "status"]))
    .unwrap_or_else(|| "succeeded".to_string());
    let artifact_path = string_field(metadata, &["artifact_path", "artifactPath"]);
    let item = item_from_task_record_with_source(
        stored,
        MediaTaskRecordProjectionInput {
            task_id: &task_id,
            task_type: &task_type,
            normalized_status: &normalized_status,
            artifact_path: artifact_path.as_deref(),
            record,
            thread_id: event.thread_id.as_deref(),
            turn_id: event.turn_id.as_deref(),
            sequence: event.sequence,
            timestamp: &event.timestamp,
        },
        EVENT_OWNER_FACTS_SOURCE,
        Some(event),
        Some(payload),
    )?;
    Some(item)
}

pub(in crate::runtime) fn item_from_task_record(
    stored: &StoredSession,
    input: MediaTaskRecordProjectionInput<'_>,
) -> Option<Value> {
    item_from_task_record_with_source(stored, input, STORE_OWNER_FACTS_SOURCE, None, None)
}

fn item_from_task_record_with_source(
    stored: &StoredSession,
    input: MediaTaskRecordProjectionInput<'_>,
    source: &str,
    source_event: Option<&AgentEvent>,
    tool_payload: Option<&Value>,
) -> Option<Value> {
    if input.task_type != "image_generate" {
        return None;
    }
    if !matches!(input.normalized_status, "partial" | "succeeded") {
        return None;
    }
    let result = input
        .record
        .get("result")
        .filter(|value| value.is_object())?;
    let images = result.get("images").and_then(Value::as_array)?;
    let content_parts = images
        .iter()
        .enumerate()
        .filter_map(|(index, image)| media_content_part_from_image(image, index, source))
        .collect::<Vec<_>>();
    if content_parts.is_empty() {
        return None;
    }

    let event = source_event.cloned().unwrap_or_else(|| AgentEvent {
        event_id: format!("media-task-result-{}", input.task_id),
        sequence: input.sequence,
        session_id: stored.session.session_id.clone(),
        thread_id: input
            .thread_id
            .map(ToOwned::to_owned)
            .or_else(|| Some(stored.session.thread_id.clone())),
        turn_id: input.turn_id.map(ToOwned::to_owned),
        event_type: "media_task.result".to_string(),
        timestamp: input.timestamp.to_string(),
        payload: json!({
            "source": source,
            "task_id": input.task_id,
            "task_type": input.task_type,
            "normalized_status": input.normalized_status,
        }),
    });
    let item_id = format!(
        "media-task-result:{}:{}",
        input.turn_id.unwrap_or("session"),
        input.task_id
    );
    let metadata = item_metadata(
        &event,
        source,
        tool_payload,
        input.record,
        input.task_id,
        input.task_type,
        input.normalized_status,
        input.artifact_path,
    );

    Some(base_item(
        stored,
        &event,
        "agent_message",
        "completed",
        compact_json(json!({
            "id": item_id,
            "contentParts": content_parts,
            "phase": "final_answer",
            "metadata": metadata,
        })),
    ))
}

fn tool_payload(event: &AgentEvent) -> Option<&Value> {
    match event.event_type.as_str() {
        "tool.result" => Some(&event.payload),
        "item.completed" => {
            let item = event.payload.get("item").unwrap_or(&event.payload);
            let payload = item.get("payload").unwrap_or(item);
            if item_kind(item, payload).as_deref() == Some("tool_call") {
                Some(payload)
            } else {
                None
            }
        }
        _ => None,
    }
}

fn tool_result_metadata(payload: &Value) -> Option<&Value> {
    payload
        .get("result")
        .and_then(|result| result.get("metadata"))
        .or_else(|| payload.get("metadata"))
}

fn record_with_result_field(record: &Value, result: &Value) -> Value {
    let mut value = record.clone();
    if let Some(object) = value.as_object_mut() {
        object.insert("result".to_string(), result.clone());
    }
    value
}

fn is_image_task_result(payload: &Value, metadata: &Value) -> bool {
    let tool_name = string_field(payload, &["toolName", "tool_name", "name"]);
    if tool_name.as_deref() == Some(IMAGE_TASK_TOOL_NAME) {
        return true;
    }
    let task_type = string_field(metadata, &["task_type", "taskType"]).or_else(|| {
        metadata
            .get("record")
            .and_then(|record| string_field(record, &["task_type", "taskType"]))
    });
    task_type.as_deref() == Some("image_generate")
}

fn media_content_part_from_image(image: &Value, index: usize, source: &str) -> Option<Value> {
    let sidecar_ref = image
        .get("sidecarRef")
        .or_else(|| image.get("sidecar_ref"))?;
    let uri = sidecar_uri(sidecar_ref)?;
    let mime_type = image_mime_type(image, sidecar_ref, &uri)?;
    let content_part = runtime_media_part_from_reference(RuntimeMediaPartInput {
        uri: uri.clone(),
        mime_type,
        title: string_field(image, &["title", "filename", "fileName"]),
        caption: string_field(image, &["caption"]),
        source_uri: non_inline_string_field(image, &["sourceUri", "source_uri", "url"]),
        source_path: string_field(image, &["sourcePath", "source_path"]),
        preview_url: non_inline_string_field(image, &["previewUrl", "preview_url"]),
        sidecar_ref: Some(sidecar_ref.clone()),
        sha256: string_field(sidecar_ref, &["sha256"]),
        byte_size: u64_field(sidecar_ref, &["bytes", "byteSize", "byte_size"])
            .or_else(|| u64_field(image, &["bytes", "byteSize", "byte_size"])),
    })
    .ok()?;
    let mut value = serde_json::to_value(content_part).ok()?;
    if let Some(object) = value.as_object_mut() {
        object.insert("source".to_string(), json!(source));
        object.insert("contentPartIndex".to_string(), json!(index));
    }
    Some(value)
}

fn sidecar_uri(sidecar_ref: &Value) -> Option<String> {
    string_field(sidecar_ref, &["uri", "ref"]).filter(|value| !is_inline_media_uri(value))
}

fn image_mime_type(image: &Value, sidecar_ref: &Value, uri: &str) -> Option<String> {
    string_field(image, &["mimeType", "mime_type"])
        .or_else(|| string_field(sidecar_ref, &["mimeType", "mime_type"]))
        .or_else(|| {
            string_field(sidecar_ref, &["relativePath", "relative_path"])
                .and_then(|path| infer_image_mime_type(&path))
        })
        .or_else(|| infer_image_mime_type(uri))
}

fn infer_image_mime_type(value: &str) -> Option<String> {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.ends_with(".png") {
        return Some("image/png".to_string());
    }
    if normalized.ends_with(".jpg") || normalized.ends_with(".jpeg") {
        return Some("image/jpeg".to_string());
    }
    if normalized.ends_with(".webp") {
        return Some("image/webp".to_string());
    }
    if normalized.ends_with(".gif") {
        return Some("image/gif".to_string());
    }
    None
}

fn task_id(metadata: &Value, record: &Value) -> Option<String> {
    string_field(metadata, &["task_id", "taskId", "id"])
        .or_else(|| string_field(record, &["task_id", "taskId", "id"]))
}

fn item_metadata(
    event: &AgentEvent,
    source: &str,
    payload: Option<&Value>,
    record: &Value,
    task_id: &str,
    task_type: &str,
    normalized_status: &str,
    artifact_path: Option<&str>,
) -> Value {
    let mut value = event_metadata(event);
    let Some(object) = value.as_object_mut() else {
        return value;
    };
    object.insert("source".to_string(), json!(source));
    object.insert("task_id".to_string(), json!(task_id));
    object.insert("task_type".to_string(), json!(task_type));
    object.insert("normalized_status".to_string(), json!(normalized_status));
    if let Some(artifact_path) = artifact_path {
        object.insert("artifact_path".to_string(), json!(artifact_path));
    }
    if let Some(payload) = payload {
        copy_string_field(
            object,
            "tool_call_id",
            payload,
            &["toolCallId", "tool_call_id"],
        );
        copy_string_field(
            object,
            "tool_name",
            payload,
            &["toolName", "tool_name", "name"],
        );
    }
    if let Some(result) = record.get("result").cloned() {
        object.insert("media_task_result".to_string(), result);
    }
    Value::Object(object.clone())
}

fn copy_string_field(
    target: &mut Map<String, Value>,
    target_key: &str,
    source: &Value,
    keys: &[&str],
) {
    if let Some(value) = string_field(source, keys) {
        target.insert(target_key.to_string(), Value::String(value));
    }
}

fn item_kind(item: &Value, payload: &Value) -> Option<String> {
    string_field(payload, &["type", "kind"])
        .or_else(|| string_field(item, &["type", "kind"]))
        .map(|value| value.trim().to_ascii_lowercase())
        .and_then(|value| match value.as_str() {
            "toolcall" | "tool_call" => Some("tool_call".to_string()),
            _ => None,
        })
}

fn non_inline_string_field(value: &Value, keys: &[&str]) -> Option<String> {
    string_field(value, keys).filter(|value| !is_inline_media_uri(value))
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn u64_field(value: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(|value| {
            value.as_u64().or_else(|| {
                value
                    .as_str()
                    .and_then(|string| string.trim().parse::<u64>().ok())
            })
        })
}

fn is_inline_media_uri(value: &str) -> bool {
    value.trim_start().to_ascii_lowercase().starts_with("data:")
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::AgentSession;
    use app_server_protocol::AgentSessionStatus;

    fn stored_session(events: Vec<AgentEvent>) -> StoredSession {
        StoredSession {
            session: AgentSession {
                session_id: "session-1".to_string(),
                thread_id: "thread-1".to_string(),
                app_id: "agent-runtime".to_string(),
                workspace_id: None,
                business_object_ref: None,
                status: AgentSessionStatus::Running,
                created_at: "2026-07-07T00:00:00.000Z".to_string(),
                updated_at: "2026-07-07T00:00:00.000Z".to_string(),
            },
            turns: Vec::new(),
            turn_inputs: HashMap::new(),
            turn_runtime_options: HashMap::new(),
            events,
            output_blobs: HashMap::new(),
        }
    }

    fn tool_result_event(payload: Value) -> AgentEvent {
        AgentEvent {
            event_id: "evt-tool-image-result".to_string(),
            sequence: 7,
            session_id: "session-1".to_string(),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
            event_type: "tool.result".to_string(),
            timestamp: "2026-07-07T00:00:01.000Z".to_string(),
            payload,
        }
    }

    #[test]
    fn image_task_tool_result_projects_sidecar_owner_facts_to_media_content_part() {
        let stored = stored_session(vec![tool_result_event(json!({
            "toolCallId": "tool-image-1",
            "toolName": IMAGE_TASK_TOOL_NAME,
            "result": {
                "success": true,
                "metadata": {
                    "task_id": "task-image-1",
                    "task_type": "image_generate",
                    "normalized_status": "succeeded",
                    "artifact_path": ".lime/tasks/image_generate/task-image-1.json",
                    "record": {
                        "task_type": "image_generate",
                        "result": {
                            "images": [{
                                "url": "data:image/png;base64,ZmFrZQ==",
                                "caption": "青柠封面图",
                                "sidecarRef": {
                                    "ref": "sidecar://media/image-1",
                                    "kind": "media",
                                    "relativePath": "sessions/session-1/media/image-1.png",
                                    "bytes": 4,
                                    "sha256": "sha256:abcd",
                                    "contentStatus": "available",
                                    "uri": "sidecar://media/image-1",
                                    "mimeType": "image/png"
                                }
                            }]
                        }
                    }
                }
            }
        }))]);

        let mut items = HashMap::new();
        upsert_from_event(&stored, &stored.events[0], &mut items);
        let item = items
            .remove("media-task-result:turn-1:task-image-1")
            .expect("synthetic media item");

        assert_eq!(item["type"], "agent_message");
        assert_eq!(item["status"], "completed");
        assert_eq!(item["phase"], "final_answer");
        assert_eq!(item["contentParts"][0]["type"], "media");
        assert_eq!(item["contentParts"][0]["kind"], "image");
        assert_eq!(
            item["contentParts"][0]["reference"]["uri"],
            "sidecar://media/image-1"
        );
        assert_eq!(
            item["contentParts"][0]["reference"]["sidecar_ref"]["sha256"],
            "sha256:abcd"
        );
        assert_eq!(item["contentParts"][0]["reference"]["byte_size"], 4);
        assert!(item["contentParts"][0]["reference"]
            .get("source_uri")
            .is_none());
        assert_eq!(item["metadata"]["source"], "media_task_result_owner_facts");
        assert_eq!(item["metadata"]["tool_call_id"], "tool-image-1");

        let projected = super::super::thread_items_from_events(&stored);
        assert!(projected.iter().any(|item| {
            item.get("id").and_then(Value::as_str) == Some("media-task-result:turn-1:task-image-1")
                && item
                    .pointer("/contentParts/0/reference/uri")
                    .and_then(Value::as_str)
                    == Some("sidecar://media/image-1")
        }));
    }

    #[test]
    fn image_task_tool_result_without_sidecar_ref_does_not_project_media_part() {
        let stored = stored_session(vec![tool_result_event(json!({
            "toolName": IMAGE_TASK_TOOL_NAME,
            "result": {
                "metadata": {
                    "task_id": "task-image-1",
                    "task_type": "image_generate",
                    "record": {
                        "result": {
                            "images": [{
                                "url": "https://example.test/image.png"
                            }]
                        }
                    }
                }
            }
        }))]);

        let mut items = HashMap::new();
        upsert_from_event(&stored, &stored.events[0], &mut items);

        assert!(items.is_empty());
    }
}
