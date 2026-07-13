use super::sidecar_store::{
    session_scoped_relative_path, SidecarRef, SidecarStore, SidecarWriteRequest,
};
use agent_protocol::{ThreadItem, ThreadItemPayload};
use app_server_protocol::{AgentEvent, ArtifactContentStatus, ArtifactSummary};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

use super::RuntimeCoreError;

const MAX_INLINE_TOOL_OUTPUT_CHARS: usize = 8_000;
const TOOL_OUTPUT_PREVIEW_CHARS: usize = 1_200;
pub(super) const SIDECAR_REF_FIELD: &str = "sidecarRef";

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
    if !is_tool_terminal_payload(event_type, &payload) {
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
    let Some(canonical_tool) = canonical_terminal_tool_from_map(&object) else {
        return NormalizedOutputPayload {
            payload: Value::Object(object),
            output_blob: None,
        };
    };
    let Some(output) = canonical_tool.text.clone() else {
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
    let output_ref = canonical_tool.output_ref.clone().unwrap_or_else(|| {
        stable_scope_id(
            "output:runtime",
            format!("{}:{output}", canonical_tool.call_id).as_str(),
        )
    });
    let ref_ids = vec![output_ref.clone()];

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
    normalize_canonical_tool_output(&mut object, &preview, &output_ref);

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
    let canonical_tool_call_id = canonical_terminal_tool(&event.payload).map(|tool| tool.call_id);
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
        tool_call_id: canonical_tool_call_id,
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
            SIDECAR_REF_FIELD.to_string(),
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
        content: payload_string(value, &["content"]),
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
            .unwrap_or_else(|| "item.completed".to_string()),
        timestamp: payload_string(value, &["timestamp", "updatedAt", "updated_at"])
            .unwrap_or_default(),
        tool_call_id: payload_string(value, &["toolCallId", "tool_call_id"]),
        command_id: payload_string(value, &["commandId", "command_id"]),
        snapshot_file: payload_string(value, &["outputSnapshotFile", "output_snapshot_file"]),
        sidecar_ref: output_sidecar_ref_from_value(value),
    })
}

pub(super) fn output_record_from_event(event: &AgentEvent) -> Option<OutputBlobRecord> {
    if !is_tool_terminal_payload(event.event_type.as_str(), &event.payload) {
        return None;
    }
    let Value::Object(mut value) = event.payload.clone() else {
        return None;
    };
    if let Some(tool) = canonical_terminal_tool_from_map(&value) {
        value.insert("toolCallId".to_string(), Value::String(tool.call_id));
        if let Some(output_ref) = tool.output_ref {
            value
                .entry("outputRef".to_string())
                .or_insert_with(|| Value::String(output_ref.clone()));
            value
                .entry("refIds".to_string())
                .or_insert_with(|| Value::Array(vec![Value::String(output_ref)]));
        }
        if let Some(text) = tool.text {
            value
                .entry("outputPreview".to_string())
                .or_insert_with(|| Value::String(text.clone()));
            value
                .entry("outputBytes".to_string())
                .or_insert_with(|| Value::Number(serde_json::Number::from(text.len())));
        }
    }
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
        .get(SIDECAR_REF_FIELD)
        .or_else(|| value.get("sidecar_ref"))
        .cloned()
        .and_then(|value| serde_json::from_value(value).ok())
}

#[derive(Debug, Clone)]
struct CanonicalTerminalTool {
    call_id: String,
    text: Option<String>,
    output_ref: Option<String>,
}

fn is_tool_terminal_payload(event_type: &str, payload: &Value) -> bool {
    event_type == "item.completed" && canonical_terminal_tool(payload).is_some()
}

fn canonical_terminal_tool(payload: &Value) -> Option<CanonicalTerminalTool> {
    canonical_terminal_tool_from_map(payload.as_object()?)
}

fn canonical_terminal_tool_from_map(object: &Map<String, Value>) -> Option<CanonicalTerminalTool> {
    let item = serde_json::from_value::<ThreadItem>(object.get("item")?.clone()).ok()?;
    if !item.status.is_terminal() {
        return None;
    }
    let (call_id, output) = match item.payload {
        ThreadItemPayload::Tool {
            call_id, output, ..
        }
        | ThreadItemPayload::McpToolCall {
            call_id, output, ..
        }
        | ThreadItemPayload::CollabAgentToolCall {
            call_id, output, ..
        } => (call_id, output),
        _ => return None,
    };
    let output = output?;
    Some(CanonicalTerminalTool {
        call_id,
        text: output.text,
        output_ref: output.output_ref,
    })
}

fn normalize_canonical_tool_output(
    object: &mut Map<String, Value>,
    preview: &str,
    output_ref: &str,
) {
    if let Some(item) = object.get_mut("item") {
        normalize_canonical_item_output(item, preview, output_ref);
    }
}

fn normalize_canonical_item_output(item: &mut Value, preview: &str, output_ref: &str) {
    let Some(output) = item
        .get_mut("payload")
        .and_then(Value::as_object_mut)
        .and_then(|payload| payload.get_mut("output"))
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    output.insert("text".to_string(), Value::String(preview.to_string()));
    output.insert(
        "outputRef".to_string(),
        Value::String(output_ref.to_string()),
    );
    output.insert("truncated".to_string(), Value::Bool(true));
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
mod tests;
