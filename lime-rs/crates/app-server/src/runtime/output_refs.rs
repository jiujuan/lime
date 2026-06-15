use super::sidecar_store::{
    session_scoped_relative_path, SidecarRef, SidecarStore, SidecarWriteRequest,
};
use app_server_protocol::{AgentEvent, ArtifactContentStatus, ArtifactSummary};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

use super::RuntimeCoreError;

const MAX_INLINE_TOOL_OUTPUT_CHARS: usize = 8_000;
const TOOL_OUTPUT_PREVIEW_CHARS: usize = 1_200;

#[derive(Debug, Clone, PartialEq)]
pub(super) struct OutputBlob {
    pub(super) output_ref: String,
    pub(super) ref_ids: Vec<String>,
    pub(super) content: String,
    pub(super) preview: String,
    pub(super) byte_len: usize,
}

#[derive(Debug, Clone, PartialEq)]
pub(super) struct NormalizedOutputPayload {
    pub(super) payload: Value,
    pub(super) output_blob: Option<OutputBlob>,
}

#[derive(Debug, Clone, PartialEq)]
pub(super) struct OutputBlobRecord {
    pub(super) output_ref: String,
    pub(super) ref_ids: Vec<String>,
    pub(super) content: Option<String>,
    pub(super) preview: String,
    pub(super) byte_len: usize,
    pub(super) event_id: String,
    pub(super) sequence: u64,
    pub(super) turn_id: Option<String>,
    pub(super) event_type: String,
    pub(super) timestamp: String,
    pub(super) tool_call_id: Option<String>,
    pub(super) command_id: Option<String>,
    pub(super) snapshot_file: Option<String>,
    pub(super) sidecar_ref: Option<SidecarRef>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct OutputSnapshotSaveRequest {
    pub session_id: String,
    pub output_ref: String,
    pub content: String,
    pub metadata: Value,
}

#[derive(Debug, Clone, PartialEq)]
pub struct OutputSnapshotReadRequest {
    pub session_id: String,
    pub file_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutputSnapshotRecord {
    pub file_name: String,
    pub sidecar_ref: SidecarRef,
}

pub trait OutputSnapshotStore: Send + Sync {
    fn save_output_snapshot(
        &self,
        request: &OutputSnapshotSaveRequest,
    ) -> Result<Option<OutputSnapshotRecord>, RuntimeCoreError>;

    fn read_output_snapshot(&self, request: &OutputSnapshotReadRequest) -> Option<String>;
}

#[derive(Debug, Default)]
pub struct NoopOutputSnapshotStore;

impl OutputSnapshotStore for NoopOutputSnapshotStore {
    fn save_output_snapshot(
        &self,
        _request: &OutputSnapshotSaveRequest,
    ) -> Result<Option<OutputSnapshotRecord>, RuntimeCoreError> {
        Ok(None)
    }

    fn read_output_snapshot(&self, _request: &OutputSnapshotReadRequest) -> Option<String> {
        None
    }
}

#[derive(Debug, Clone, Default)]
pub struct FilesystemOutputSnapshotStore {
    sidecar_store: Option<SidecarStore>,
}

impl FilesystemOutputSnapshotStore {
    pub fn new() -> Self {
        Self {
            sidecar_store: None,
        }
    }

    pub fn with_base_dir(base_dir: impl AsRef<std::path::Path>) -> Self {
        Self::with_sidecar_root(base_dir)
    }

    pub fn with_sidecar_root(root: impl AsRef<std::path::Path>) -> Self {
        let sidecar_store = SidecarStore::new(root).ok();
        Self { sidecar_store }
    }

    fn sidecar_store(&self) -> Result<&SidecarStore, RuntimeCoreError> {
        self.sidecar_store.as_ref().ok_or_else(|| {
            RuntimeCoreError::Backend(
                "输出快照存储缺少显式 sidecar root，不能写入默认 sessions 目录".to_string(),
            )
        })
    }
}

impl OutputSnapshotStore for FilesystemOutputSnapshotStore {
    fn save_output_snapshot(
        &self,
        request: &OutputSnapshotSaveRequest,
    ) -> Result<Option<OutputSnapshotRecord>, RuntimeCoreError> {
        let file_name = output_snapshot_file_name(request.output_ref.as_str());
        let relative_path = session_scoped_relative_path(request.session_id.as_str(), &file_name);
        let sidecar_ref = self
            .sidecar_store()?
            .write_text(&SidecarWriteRequest {
                session_id: request.session_id.clone(),
                kind: "tool_output".to_string(),
                logical_id: request.output_ref.clone(),
                relative_path,
                content: request.content.clone(),
            })
            .map_err(|error| RuntimeCoreError::Backend(format!("保存输出快照失败: {error}")))?;
        Ok(Some(OutputSnapshotRecord {
            file_name,
            sidecar_ref,
        }))
    }

    fn read_output_snapshot(&self, request: &OutputSnapshotReadRequest) -> Option<String> {
        self.sidecar_store.as_ref()?.read_text(
            session_scoped_relative_path(request.session_id.as_str(), request.file_name.as_str())
                .as_str(),
        )
    }
}

pub(super) fn normalize_large_output_payload(
    event_type: &str,
    payload: Value,
) -> NormalizedOutputPayload {
    if !is_tool_terminal_event(event_type) {
        return NormalizedOutputPayload {
            payload,
            output_blob: None,
        };
    }

    let Value::Object(mut object) = payload else {
        return NormalizedOutputPayload {
            payload,
            output_blob: None,
        };
    };
    let Some(output) = largest_tool_output(&object) else {
        return NormalizedOutputPayload {
            payload: Value::Object(object),
            output_blob: None,
        };
    };
    if output.chars().count() <= MAX_INLINE_TOOL_OUTPUT_CHARS {
        return NormalizedOutputPayload {
            payload: Value::Object(object),
            output_blob: None,
        };
    }

    let preview = truncate_chars(&output, TOOL_OUTPUT_PREVIEW_CHARS);
    let output_ref = output_ref_from_payload(&object).unwrap_or_else(|| {
        let tool_call_id = payload_string_from_map(
            &object,
            &["toolCallId", "tool_call_id", "toolId", "tool_id"],
        )
        .unwrap_or_else(|| "tool".to_string());
        stable_scope_id(
            "output:runtime",
            format!("{tool_call_id}:{output}").as_str(),
        )
    });
    let ref_ids = merge_ref_ids(&object, &output_ref);

    object.insert("outputRef".to_string(), Value::String(output_ref.clone()));
    object.insert(
        "refIds".to_string(),
        Value::Array(ref_ids.iter().cloned().map(Value::String).collect()),
    );
    object.insert("outputPreview".to_string(), Value::String(preview.clone()));
    object.insert("outputTruncated".to_string(), Value::Bool(true));
    object.insert(
        "outputBytes".to_string(),
        Value::Number(serde_json::Number::from(output.len())),
    );
    truncate_output_field(&mut object, &preview);
    truncate_result_output_field(&mut object, &preview);
    truncate_runtime_event_result_output_field(&mut object, &preview);

    let byte_len = output.len();
    NormalizedOutputPayload {
        payload: Value::Object(object),
        output_blob: Some(OutputBlob {
            output_ref,
            ref_ids,
            content: output,
            preview,
            byte_len,
        }),
    }
}

pub(super) fn record_output_blob(event: &AgentEvent, output: OutputBlob) -> OutputBlobRecord {
    OutputBlobRecord {
        output_ref: output.output_ref,
        ref_ids: output.ref_ids,
        content: Some(output.content),
        preview: output.preview,
        byte_len: output.byte_len,
        event_id: event.event_id.clone(),
        sequence: event.sequence,
        turn_id: event.turn_id.clone(),
        event_type: event.event_type.clone(),
        timestamp: event.timestamp.clone(),
        tool_call_id: payload_string(
            &event.payload,
            &["toolCallId", "tool_call_id", "toolId", "tool_id"],
        ),
        command_id: payload_string(&event.payload, &["commandId", "command_id"]),
        snapshot_file: None,
        sidecar_ref: None,
    }
}

pub(super) fn persist_output_record(
    mut record: OutputBlobRecord,
    session_id: &str,
    snapshot_store: &dyn OutputSnapshotStore,
) -> Result<OutputBlobRecord, RuntimeCoreError> {
    let Some(content) = record.content.clone() else {
        return Ok(record);
    };
    let metadata = output_metadata(&record);
    if let Some(snapshot) = snapshot_store.save_output_snapshot(&OutputSnapshotSaveRequest {
        session_id: session_id.to_string(),
        output_ref: record.output_ref.clone(),
        content,
        metadata,
    })? {
        record.snapshot_file = Some(snapshot.file_name);
        record.sidecar_ref = Some(snapshot.sidecar_ref);
        record.content = None;
    }
    Ok(record)
}

pub(super) fn attach_output_snapshot_ref(payload: &mut Value, output: &OutputBlobRecord) {
    let Value::Object(object) = payload else {
        return;
    };
    if let Some(snapshot_file) = output.snapshot_file.as_ref() {
        object.insert(
            "outputSnapshotFile".to_string(),
            Value::String(snapshot_file.clone()),
        );
    }
    if let Some(sidecar_ref) = output.sidecar_ref.as_ref() {
        object.insert(
            "sidecarRef".to_string(),
            serde_json::to_value(sidecar_ref).unwrap_or_else(|_| json!({})),
        );
    }
}

pub(super) fn output_summaries_for_turn<'a>(
    outputs: impl Iterator<Item = &'a OutputBlobRecord>,
    turn_id: Option<&str>,
) -> Vec<ArtifactSummary> {
    let mut summaries = outputs
        .filter(|output| match turn_id {
            Some(turn_id) => output.turn_id.as_deref() == Some(turn_id),
            None => true,
        })
        .map(output_artifact_summary)
        .collect::<Vec<_>>();
    summaries.sort_by(|left, right| {
        right
            .sequence
            .cmp(&left.sequence)
            .then_with(|| right.event_id.cmp(&left.event_id))
    });
    summaries
}

pub(super) fn read_model_outputs<'a>(
    outputs: impl Iterator<Item = &'a OutputBlobRecord>,
    turn_id: Option<&str>,
) -> Vec<Value> {
    let mut records = outputs
        .filter(|output| match turn_id {
            Some(turn_id) => output.turn_id.as_deref() == Some(turn_id),
            None => true,
        })
        .map(output_read_model_value)
        .collect::<Vec<_>>();
    records.sort_by(|left, right| {
        right
            .get("sequence")
            .and_then(Value::as_u64)
            .cmp(&left.get("sequence").and_then(Value::as_u64))
    });
    records
}

pub(super) fn output_record_from_read_model(value: &Value) -> Option<OutputBlobRecord> {
    let output_ref = payload_string(value, &["outputRef", "output_ref"])?;
    Some(OutputBlobRecord {
        output_ref,
        ref_ids: string_array_field(value, &["refIds", "ref_ids"]),
        content: payload_string(value, &["content", "output"]),
        preview: payload_string(value, &["preview", "outputPreview", "output_preview"])
            .unwrap_or_default(),
        byte_len: value
            .get("outputBytes")
            .or_else(|| value.get("output_bytes"))
            .and_then(Value::as_u64)
            .and_then(|value| usize::try_from(value).ok())
            .unwrap_or(0),
        event_id: payload_string(value, &["eventId", "event_id"])
            .unwrap_or_else(|| stable_scope_id("evt:output", value.to_string().as_str())),
        sequence: value
            .get("sequence")
            .and_then(Value::as_u64)
            .unwrap_or_default(),
        turn_id: payload_string(value, &["turnId", "turn_id"]),
        event_type: payload_string(value, &["eventType", "event_type"])
            .unwrap_or_else(|| "tool.result".to_string()),
        timestamp: payload_string(value, &["timestamp", "updatedAt", "updated_at"])
            .unwrap_or_default(),
        tool_call_id: payload_string(value, &["toolCallId", "tool_call_id"]),
        command_id: payload_string(value, &["commandId", "command_id"]),
        snapshot_file: payload_string(value, &["outputSnapshotFile", "output_snapshot_file"]),
        sidecar_ref: output_sidecar_ref_from_value(value),
    })
}

pub(super) fn output_record_from_event(event: &AgentEvent) -> Option<OutputBlobRecord> {
    if !is_tool_terminal_event(event.event_type.as_str()) {
        return None;
    }
    let Value::Object(mut value) = event.payload.clone() else {
        return None;
    };
    value.insert("eventId".to_string(), Value::String(event.event_id.clone()));
    value.insert(
        "sequence".to_string(),
        Value::Number(serde_json::Number::from(event.sequence)),
    );
    if let Some(turn_id) = event.turn_id.as_ref() {
        value.insert("turnId".to_string(), Value::String(turn_id.clone()));
    }
    value.insert(
        "eventType".to_string(),
        Value::String(event.event_type.clone()),
    );
    value.insert(
        "timestamp".to_string(),
        Value::String(event.timestamp.clone()),
    );
    output_record_from_read_model(&Value::Object(value))
}

pub(super) fn output_content(
    outputs: &HashMap<String, OutputBlobRecord>,
    snapshot_store: &dyn OutputSnapshotStore,
    session_id: &str,
    artifact_ref: &str,
) -> Option<String> {
    let output = outputs.get(artifact_ref)?;
    output.content.clone().or_else(|| {
        let file_name = output.snapshot_file.clone()?;
        snapshot_store.read_output_snapshot(&OutputSnapshotReadRequest {
            session_id: session_id.to_string(),
            file_name,
        })
    })
}

fn output_artifact_summary(output: &OutputBlobRecord) -> ArtifactSummary {
    ArtifactSummary {
        artifact_ref: output.output_ref.clone(),
        event_id: output.event_id.clone(),
        sequence: output.sequence,
        turn_id: output.turn_id.clone(),
        artifact_id: Some(output.output_ref.clone()),
        path: None,
        title: None,
        kind: Some("tool_output".to_string()),
        status: Some("available".to_string()),
        content: None,
        content_status: ArtifactContentStatus::NotRequested,
        metadata: Some(output_metadata(output)),
    }
}

fn output_read_model_value(output: &OutputBlobRecord) -> Value {
    json!({
        "outputRef": output.output_ref,
        "refIds": output.ref_ids,
        "preview": output.preview,
        "outputPreview": output.preview,
        "outputTruncated": true,
        "outputBytes": output.byte_len,
        "eventId": output.event_id,
        "sequence": output.sequence,
        "turnId": output.turn_id,
        "eventType": output.event_type,
        "timestamp": output.timestamp,
        "toolCallId": output.tool_call_id,
        "commandId": output.command_id,
        "outputSnapshotFile": output.snapshot_file,
        "sidecarRef": output.sidecar_ref.as_ref().map(|sidecar_ref| {
            serde_json::to_value(sidecar_ref).unwrap_or_else(|_| json!({}))
        }),
    })
}

fn output_metadata(output: &OutputBlobRecord) -> Value {
    let sidecar_ref = output
        .sidecar_ref
        .as_ref()
        .map(|sidecar_ref| serde_json::to_value(sidecar_ref).unwrap_or_else(|_| json!({})));
    json!({
        "outputRef": output.output_ref,
        "refIds": output.ref_ids,
        "outputPreview": output.preview,
        "outputTruncated": true,
        "outputBytes": output.byte_len,
        "eventType": output.event_type,
        "timestamp": output.timestamp,
        "toolCallId": output.tool_call_id,
        "commandId": output.command_id,
        "outputSnapshotFile": output.snapshot_file,
        "sidecarRef": sidecar_ref,
    })
}

fn output_snapshot_file_name(output_ref: &str) -> String {
    format!("runtime-outputs/{:016x}.txt", stable_hash(output_ref))
}

fn output_sidecar_ref_from_value(value: &Value) -> Option<SidecarRef> {
    value
        .get("sidecarRef")
        .or_else(|| value.get("sidecar_ref"))
        .cloned()
        .and_then(|value| serde_json::from_value(value).ok())
}

fn is_tool_terminal_event(event_type: &str) -> bool {
    matches!(event_type, "tool.result" | "tool.failed" | "tool_end")
}

fn largest_tool_output(object: &Map<String, Value>) -> Option<String> {
    [
        payload_string_from_map(object, &["output"]),
        nested_result_output(object),
        nested_runtime_event_result_output(object),
    ]
    .into_iter()
    .flatten()
    .max_by_key(|value| value.chars().count())
}

fn output_ref_from_payload(object: &Map<String, Value>) -> Option<String> {
    payload_string_from_map(
        object,
        &[
            "outputRef",
            "output_ref",
            "contentRef",
            "content_ref",
            "refId",
            "ref_id",
        ],
    )
    .or_else(|| {
        object
            .get("refIds")
            .or_else(|| object.get("ref_ids"))
            .and_then(Value::as_array)
            .and_then(|values| values.iter().find_map(value_string))
    })
}

fn merge_ref_ids(object: &Map<String, Value>, output_ref: &str) -> Vec<String> {
    let mut refs = object
        .get("refIds")
        .or_else(|| object.get("ref_ids"))
        .and_then(Value::as_array)
        .map(|values| values.iter().filter_map(value_string).collect::<Vec<_>>())
        .unwrap_or_default();
    refs.push(output_ref.to_string());
    dedupe_non_empty(refs)
}

fn truncate_output_field(object: &mut Map<String, Value>, preview: &str) {
    if object.get("output").and_then(Value::as_str).is_some() {
        object.insert("output".to_string(), Value::String(preview.to_string()));
    }
}

fn truncate_result_output_field(object: &mut Map<String, Value>, preview: &str) {
    let Some(result) = object.get_mut("result").and_then(Value::as_object_mut) else {
        return;
    };
    if result.get("output").and_then(Value::as_str).is_some() {
        result.insert("output".to_string(), Value::String(preview.to_string()));
    }
}

fn truncate_runtime_event_result_output_field(object: &mut Map<String, Value>, preview: &str) {
    let Some(runtime_event) = object
        .get_mut("runtimeEvent")
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    let Some(result) = runtime_event
        .get_mut("result")
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    if result.get("output").and_then(Value::as_str).is_some() {
        result.insert("output".to_string(), Value::String(preview.to_string()));
    }
}

fn nested_result_output(object: &Map<String, Value>) -> Option<String> {
    object
        .get("result")
        .and_then(Value::as_object)
        .and_then(|result| payload_string_from_map(result, &["output"]))
}

fn nested_runtime_event_result_output(object: &Map<String, Value>) -> Option<String> {
    object
        .get("runtimeEvent")
        .and_then(Value::as_object)
        .and_then(|runtime_event| runtime_event.get("result"))
        .and_then(Value::as_object)
        .and_then(|result| payload_string_from_map(result, &["output"]))
}

fn payload_string_from_map(object: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(value_string)
}

fn payload_string(value: &Value, keys: &[&str]) -> Option<String> {
    let Value::Object(object) = value else {
        return None;
    };
    payload_string_from_map(object, keys)
}

fn string_array_field(value: &Value, keys: &[&str]) -> Vec<String> {
    let Value::Object(object) = value else {
        return Vec::new();
    };
    keys.iter()
        .filter_map(|key| object.get(*key))
        .flat_map(value_string_vec)
        .collect()
}

fn value_string_vec(value: &Value) -> Vec<String> {
    if let Some(values) = value.as_array() {
        return values.iter().filter_map(value_string).collect();
    }
    value_string(value).into_iter().collect()
}

fn value_string(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn dedupe_non_empty(values: Vec<String>) -> Vec<String> {
    let mut deduped = Vec::new();
    for value in values {
        let value = value.trim();
        if value.is_empty() || deduped.iter().any(|existing| existing == value) {
            continue;
        }
        deduped.push(value.to_string());
    }
    deduped
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut output = String::new();
    for (index, character) in value.chars().enumerate() {
        if index >= max_chars {
            output.push('…');
            break;
        }
        output.push(character);
    }
    output
}

fn stable_scope_id(prefix: &str, value: &str) -> String {
    format!("{prefix}:{:016x}", stable_hash(value))
}

fn stable_hash(value: &str) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn normalizes_large_tool_result_output_to_refs_and_preview() {
        let output = "x".repeat(MAX_INLINE_TOOL_OUTPUT_CHARS + 1);
        let normalized = normalize_large_output_payload(
            "tool.result",
            json!({
                "toolCallId": "tool-large",
                "result": {
                    "success": true,
                    "output": output,
                },
                "runtimeEvent": {
                    "type": "tool_end",
                    "tool_id": "tool-large",
                    "result": {
                        "success": true,
                        "output": "x".repeat(MAX_INLINE_TOOL_OUTPUT_CHARS + 1),
                    }
                }
            }),
        );
        let payload = normalized.payload;

        let object = payload.as_object().expect("payload object");
        assert!(object
            .get("outputRef")
            .and_then(Value::as_str)
            .is_some_and(|value| value.starts_with("output:runtime:")));
        assert_eq!(
            object.get("outputTruncated").and_then(Value::as_bool),
            Some(true)
        );
        assert!(object
            .get("outputPreview")
            .and_then(Value::as_str)
            .is_some_and(|value| value.chars().count() <= TOOL_OUTPUT_PREVIEW_CHARS + 1));
        assert!(object
            .get("result")
            .and_then(Value::as_object)
            .and_then(|result| result.get("output"))
            .and_then(Value::as_str)
            .is_some_and(|value| value.chars().count() <= TOOL_OUTPUT_PREVIEW_CHARS + 1));
        assert!(object
            .get("runtimeEvent")
            .and_then(Value::as_object)
            .and_then(|runtime_event| runtime_event.get("result"))
            .and_then(Value::as_object)
            .and_then(|result| result.get("output"))
            .and_then(Value::as_str)
            .is_some_and(|value| value.chars().count() <= TOOL_OUTPUT_PREVIEW_CHARS + 1));
        let output_blob = normalized.output_blob.expect("output blob");
        assert_eq!(output_blob.content, output);
        assert!(output_blob
            .ref_ids
            .iter()
            .any(|value| value == &output_blob.output_ref));
    }
}
