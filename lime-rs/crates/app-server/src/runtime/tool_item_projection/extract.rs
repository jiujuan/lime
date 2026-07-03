use super::super::raw_string_field;
use super::super::string_array_field;
use super::super::string_field;
use app_server_protocol::AgentEvent;
use serde_json::Value;

#[derive(Debug)]
pub(super) struct CurrentToolItem {
    pub(super) item_id: String,
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

#[derive(Debug)]
pub(super) struct LegacyToolEvent {
    pub(super) tool_call_id: Option<String>,
    pub(super) tool_name: Option<String>,
    pub(super) status: String,
    pub(super) arguments: Option<Value>,
    pub(super) structured_content: Option<Value>,
    pub(super) output: Option<String>,
    pub(super) output_ref: Option<String>,
    pub(super) ref_ids: Vec<String>,
    pub(super) output_truncated: Option<bool>,
    pub(super) output_bytes: Option<u64>,
    pub(super) success: Option<bool>,
    pub(super) error: Option<String>,
    pub(super) query: Option<String>,
    pub(super) action: Option<String>,
    pub(super) metadata: Option<Value>,
}

pub(super) fn current_tool_item_from_event(event: &AgentEvent) -> Option<CurrentToolItem> {
    if !matches!(
        event.event_type.as_str(),
        "item.started" | "item.updated" | "item.completed"
    ) {
        return None;
    }
    let item = event.payload.get("item").unwrap_or(&event.payload);
    let payload = item.get("payload").unwrap_or(item);
    let kind = item_kind(item, payload)?;
    if !matches!(kind.as_str(), "tool_call" | "web_search") {
        return None;
    }
    let item_id = string_field(item, &["id", "itemId", "item_id"])
        .or_else(|| string_field(payload, &["id", "itemId", "item_id"]))?;
    let tool_name = string_field(payload, &["tool_name", "toolName", "name"])
        .or_else(|| (kind == "web_search").then(|| "WebSearch".to_string()));
    let item_type =
        if kind == "web_search" || tool_name.as_deref().is_some_and(is_web_search_tool_name) {
            "web_search".to_string()
        } else {
            "tool_call".to_string()
        };
    Some(CurrentToolItem {
        item_id,
        thread_id: string_field(item, &["thread_id", "threadId"])
            .or_else(|| event.thread_id.clone()),
        turn_id: string_field(item, &["turn_id", "turnId"]).or_else(|| event.turn_id.clone()),
        sequence: item
            .get("sequence")
            .and_then(Value::as_u64)
            .unwrap_or(event.sequence),
        item_type,
        status: current_item_status(event, item),
        tool_name,
        arguments: payload.get("arguments").cloned(),
        structured_content: tool_structured_content(payload)
            .or_else(|| tool_structured_content(item))
            .or_else(|| tool_structured_content(&event.payload)),
        output: tool_output(payload),
        output_ref: string_field(payload, &["outputRef", "output_ref"])
            .or_else(|| string_field(&event.payload, &["outputRef", "output_ref"])),
        ref_ids: merge_string_arrays(
            string_array_field(payload, &["refIds", "ref_ids"]),
            string_array_field(&event.payload, &["refIds", "ref_ids"]),
        ),
        output_truncated: bool_field(payload, &["outputTruncated", "output_truncated"])
            .or_else(|| bool_field(&event.payload, &["outputTruncated", "output_truncated"])),
        output_bytes: u64_field(payload, &["outputBytes", "output_bytes"])
            .or_else(|| u64_field(&event.payload, &["outputBytes", "output_bytes"])),
        success: bool_field(payload, &["success"]),
        error: raw_string_field(payload, &["error", "message", "reason"]),
        query: web_search_query(payload),
        action: web_search_action(payload),
        metadata: tool_metadata(payload),
        started_at: string_field(item, &["started_at", "startedAt"]),
        updated_at: string_field(item, &["updated_at", "updatedAt"]),
        completed_at: string_field(item, &["completed_at", "completedAt"]),
    })
}

pub(super) fn legacy_tool_event_from_event(event: &AgentEvent) -> Option<LegacyToolEvent> {
    let status = match event.event_type.as_str() {
        "tool.started" => "in_progress",
        "tool.result" => "completed",
        "tool.failed" => "failed",
        _ => return None,
    };
    let payload = &event.payload;
    Some(LegacyToolEvent {
        tool_call_id: tool_call_id(payload),
        tool_name: string_field(payload, &["tool_name", "toolName", "name"]),
        status: status.to_string(),
        arguments: payload.get("arguments").cloned(),
        structured_content: tool_structured_content(payload),
        output: tool_output(payload),
        output_ref: string_field(payload, &["outputRef", "output_ref"]),
        ref_ids: string_array_field(payload, &["refIds", "ref_ids"]),
        output_truncated: bool_field(payload, &["outputTruncated", "output_truncated"]),
        output_bytes: u64_field(payload, &["outputBytes", "output_bytes"]),
        success: bool_field(payload, &["success"])
            .or_else(|| (status != "in_progress").then_some(status == "completed")),
        error: raw_string_field(payload, &["error", "message", "reason"]),
        query: web_search_query(payload),
        action: web_search_action(payload),
        metadata: tool_metadata(payload),
    })
}

pub(super) fn legacy_tool_id(event: &AgentEvent, tool_event: &LegacyToolEvent) -> String {
    tool_event
        .tool_call_id
        .clone()
        .or_else(|| {
            tool_event.tool_name.as_ref().map(|name| {
                format!(
                    "legacy:{}:{}",
                    event.turn_id.as_deref().unwrap_or("session"),
                    normalize_tool_name_for_id(name)
                )
            })
        })
        .unwrap_or_else(|| event.event_id.clone())
}

pub(super) fn item_type_for_tool_name(tool_name: Option<&str>) -> String {
    if tool_name.is_some_and(is_web_search_tool_name) {
        "web_search".to_string()
    } else {
        "tool_call".to_string()
    }
}

pub(super) fn is_command_tool_name(value: &str) -> bool {
    matches!(
        value.trim(),
        "exec_command" | "command_execution" | "Bash" | "bash"
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

fn current_item_status(event: &AgentEvent, item: &Value) -> String {
    string_field(item, &["status"])
        .map(|status| normalize_item_status(&status))
        .unwrap_or_else(|| match event.event_type.as_str() {
            "item.completed" => "completed".to_string(),
            _ => "in_progress".to_string(),
        })
}

fn normalize_item_status(status: &str) -> String {
    match status.trim() {
        "running" | "pending" | "started" | "inProgress" | "in_progress" => {
            "in_progress".to_string()
        }
        "failed" | "error" => "failed".to_string(),
        "completed" | "succeeded" | "success" => "completed".to_string(),
        other => other.to_string(),
    }
}

fn item_kind(item: &Value, payload: &Value) -> Option<String> {
    let kind = string_field(payload, &["type", "kind"])
        .or_else(|| string_field(item, &["type", "kind"]))?;
    let normalized = kind.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "toolcall" | "tool_call" => Some("tool_call".to_string()),
        "websearch" | "web_search" => Some("web_search".to_string()),
        _ => None,
    }
}

fn tool_call_id(payload: &Value) -> Option<String> {
    string_field(
        payload,
        &["toolCallId", "tool_call_id", "toolId", "tool_id", "id"],
    )
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

fn tool_metadata(payload: &Value) -> Option<Value> {
    payload
        .get("metadata")
        .filter(|value| !value.is_null())
        .cloned()
        .or_else(|| {
            payload
                .get("result")
                .and_then(|result| result.get("metadata"))
                .filter(|value| !value.is_null())
                .cloned()
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

fn normalize_tool_name_for_id(value: &str) -> String {
    value
        .trim()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '_'
            }
        })
        .collect()
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
