use super::super::raw_string_field;
use super::super::string_array_field;
use super::super::string_field;
use agent_protocol::thread::{ItemStatus, ThreadItem, ThreadItemPayload};
use app_server_protocol::AgentEvent;
use serde_json::Value;

#[derive(Debug)]
pub(super) struct CurrentToolItem {
    pub(super) item_id: String,
    pub(super) tool_call_id: String,
    pub(super) thread_id: Option<String>,
    pub(super) turn_id: Option<String>,
    pub(super) sequence: u64,
    pub(super) item_type: String,
    pub(super) status: String,
    pub(super) tool_name: Option<String>,
    pub(super) arguments: Option<Value>,
    pub(super) structured_content: Option<Value>,
    pub(super) output: Option<String>,
    pub(super) output_ref: Option<String>,
    pub(super) ref_ids: Vec<String>,
    pub(super) output_truncated: Option<bool>,
    pub(super) duration_ms: Option<u64>,
    pub(super) output_bytes: Option<u64>,
    pub(super) success: Option<bool>,
    pub(super) error: Option<String>,
    pub(super) query: Option<String>,
    pub(super) action: Option<String>,
    pub(super) metadata: Option<Value>,
    pub(super) started_at: Option<String>,
    pub(super) updated_at: Option<String>,
    pub(super) completed_at: Option<String>,
}

pub(super) fn current_tool_item_from_event(event: &AgentEvent) -> Option<CurrentToolItem> {
    if !matches!(
        event.event_type.as_str(),
        "item.started" | "item.updated" | "item.completed"
    ) {
        return None;
    }
    let item = serde_json::from_value::<ThreadItem>(event.payload.get("item")?.clone()).ok()?;
    let ThreadItemPayload::Tool {
        call_id,
        name,
        arguments,
        output,
    } = item.payload
    else {
        return None;
    };
    let item_type = if is_web_search_tool_name(&name) {
        "web_search".to_string()
    } else {
        "tool_call".to_string()
    };
    let status = canonical_item_status(item.status);
    let success = canonical_item_success(item.status);
    let metadata = merge_current_tool_metadata(&item.metadata, &event.payload);
    let empty_metadata = Value::Null;
    let metadata_value = metadata.as_ref().unwrap_or(&empty_metadata);
    let arguments_value = (!arguments.is_empty())
        .then(|| serde_json::to_value(&arguments).ok())
        .flatten();
    let query = tool_argument_value(&arguments, &["query", "q"])
        .or_else(|| raw_string_field(metadata_value, &["query", "q"]))
        .or_else(|| web_search_query(&event.payload));
    let action = web_search_action(metadata_value)
        .or_else(|| tool_argument_value(&arguments, &["action"]))
        .or_else(|| web_search_action(&event.payload));
    let (structured_content, output_text, output_ref, output_truncated, duration_ms, error) =
        output.map_or((None, None, None, None, None, None), |output| {
            (
                output.structured_content,
                output.text,
                output.output_ref,
                Some(output.truncated),
                output.duration_ms,
                output.error,
            )
        });
    let structured_content = structured_content
        .or_else(|| tool_structured_content(metadata_value))
        .or_else(|| tool_structured_content(&event.payload));
    let output_text = output_text.or_else(|| tool_output(&event.payload));
    let output_ref = output_ref
        .or_else(|| string_field(metadata_value, &["outputRef", "output_ref"]))
        .or_else(|| string_field(&event.payload, &["outputRef", "output_ref"]));
    let output_truncated = output_truncated
        .or_else(|| bool_field(metadata_value, &["outputTruncated", "output_truncated"]))
        .or_else(|| bool_field(&event.payload, &["outputTruncated", "output_truncated"]));
    let duration_ms = duration_ms
        .or_else(|| u64_field(metadata_value, &["durationMs", "duration_ms"]))
        .or_else(|| u64_field(&event.payload, &["durationMs", "duration_ms"]));
    let error = error
        .or_else(|| raw_string_field(metadata_value, &["error", "message", "reason"]))
        .or_else(|| raw_string_field(&event.payload, &["error", "message", "reason"]));
    Some(CurrentToolItem {
        item_id: item.item_id.to_string(),
        tool_call_id: call_id,
        thread_id: event
            .thread_id
            .clone()
            .or_else(|| Some(item.thread_id.to_string())),
        turn_id: event
            .turn_id
            .clone()
            .or_else(|| Some(item.turn_id.to_string())),
        sequence: event.sequence,
        item_type,
        status,
        tool_name: Some(name),
        arguments: arguments_value,
        structured_content,
        output: output_text,
        output_ref,
        ref_ids: merge_string_arrays(
            string_array_field(metadata_value, &["refIds", "ref_ids"]),
            string_array_field(&event.payload, &["refIds", "ref_ids"]),
        ),
        output_truncated,
        duration_ms,
        output_bytes: u64_field(metadata_value, &["outputBytes", "output_bytes"])
            .or_else(|| u64_field(&event.payload, &["outputBytes", "output_bytes"])),
        success,
        error,
        query,
        action,
        metadata,
        started_at: (event.event_type == "item.started").then(|| event.timestamp.clone()),
        updated_at: Some(event.timestamp.clone()),
        completed_at: (event.event_type == "item.completed").then(|| event.timestamp.clone()),
    })
}

pub(super) fn is_command_tool_name(value: &str) -> bool {
    matches!(
        value.trim(),
        "exec_command" | "write_stdin" | "command_execution"
    )
}

pub(super) fn is_update_plan_tool_name(value: &str) -> bool {
    let normalized = value
        .trim()
        .chars()
        .filter(|character| !matches!(character, '_' | '-' | ' '))
        .collect::<String>()
        .to_ascii_lowercase();
    matches!(normalized.as_str(), "updateplan" | "updateplantool")
}

fn canonical_item_status(status: ItemStatus) -> String {
    match status {
        ItemStatus::Pending => "pending",
        ItemStatus::InProgress => "in_progress",
        ItemStatus::Completed => "completed",
        ItemStatus::Failed => "failed",
        ItemStatus::Interrupted => "interrupted",
        ItemStatus::Cancelled => "cancelled",
    }
    .to_string()
}

fn canonical_item_success(status: ItemStatus) -> Option<bool> {
    match status {
        ItemStatus::Completed => Some(true),
        ItemStatus::Failed | ItemStatus::Interrupted | ItemStatus::Cancelled => Some(false),
        ItemStatus::Pending | ItemStatus::InProgress => None,
    }
}

fn tool_argument_value(
    arguments: &[agent_protocol::thread::ToolArgument],
    names: &[&str],
) -> Option<String> {
    arguments
        .iter()
        .find(|argument| names.iter().any(|name| argument.name == *name))
        .map(|argument| argument.value.clone())
}

fn merge_current_tool_metadata(item_metadata: &Value, event_payload: &Value) -> Option<Value> {
    let mut metadata = item_metadata.as_object().cloned().unwrap_or_default();
    if let Some(outer_metadata) = event_payload.get("metadata").and_then(Value::as_object) {
        for (key, value) in outer_metadata {
            metadata.entry(key.clone()).or_insert_with(|| value.clone());
        }
    }
    (!metadata.is_empty()).then_some(Value::Object(metadata))
}

fn tool_output(payload: &Value) -> Option<String> {
    raw_string_field(
        payload,
        &[
            "outputPreview",
            "output_preview",
            "output",
            "text",
            "content",
        ],
    )
    .or_else(|| {
        payload.get("result").and_then(|result| {
            raw_string_field(
                result,
                &[
                    "outputPreview",
                    "output_preview",
                    "output",
                    "text",
                    "content",
                ],
            )
        })
    })
    .or_else(|| {
        payload
            .get("result")
            .filter(|value| !value.is_null())
            .map(|value| {
                value
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| value.to_string())
            })
    })
}

fn tool_structured_content(payload: &Value) -> Option<Value> {
    payload
        .get("structuredContent")
        .or_else(|| payload.get("structured_content"))
        .filter(|value| !value.is_null())
        .cloned()
        .or_else(|| {
            payload
                .get("result")
                .and_then(|result| {
                    result
                        .get("structuredContent")
                        .or_else(|| result.get("structured_content"))
                })
                .filter(|value| !value.is_null())
                .cloned()
        })
}

fn web_search_query(payload: &Value) -> Option<String> {
    payload
        .get("arguments")
        .and_then(|value| {
            raw_string_field(value, &["query", "q"]).or_else(|| {
                value
                    .get("search_query")
                    .and_then(Value::as_array)
                    .and_then(|queries| queries.first())
                    .and_then(|query| raw_string_field(query, &["q", "query"]))
            })
        })
        .or_else(|| raw_string_field(payload, &["query", "q"]))
}

fn web_search_action(payload: &Value) -> Option<String> {
    if let Some(value) = payload.get("action").filter(|value| !value.is_null()) {
        if let Some(action) = value.as_str().map(str::to_string) {
            return Some(action);
        }
        if let Some(action) = raw_string_field(value, &["type", "kind", "action"]) {
            return Some(action);
        }
    }
    if let Some(value) = payload.get("result").filter(|value| !value.is_null()) {
        if let Some(action) = value.as_str().map(str::to_string) {
            return Some(action);
        }
        if let Some(action) = raw_string_field(value, &["type", "kind", "action"]) {
            return Some(action);
        }
    }
    raw_string_field(payload, &["sourceEventType", "source_event_type"])
}

fn bool_field(payload: &Value, keys: &[&str]) -> Option<bool> {
    keys.iter()
        .filter_map(|key| payload.get(*key))
        .find_map(Value::as_bool)
}

fn u64_field(payload: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter()
        .filter_map(|key| payload.get(*key))
        .find_map(Value::as_u64)
}

fn is_web_search_tool_name(value: &str) -> bool {
    matches!(
        value.trim(),
        "web_search" | "webSearch" | "search_query" | "WebSearch"
    )
}

fn merge_string_arrays(left: Vec<String>, right: Vec<String>) -> Vec<String> {
    let mut merged = left;
    for value in right {
        if !merged.iter().any(|existing| existing == &value) {
            merged.push(value);
        }
    }
    merged
}
