use app_server_protocol::{ConversationImportSourceClient, ConversationImportSourceProvenance};
use serde_json::{json, Map, Value};
use std::collections::BTreeSet;

#[derive(Debug, Clone)]
pub(in crate::runtime::conversation_import) struct ImportedRuntimeEvent {
    pub(in crate::runtime::conversation_import) event_type: &'static str,
    pub(in crate::runtime::conversation_import) payload: Value,
}

impl ImportedRuntimeEvent {
    pub(in crate::runtime::conversation_import) fn new(
        event_type: &'static str,
        payload: Value,
    ) -> Self {
        Self {
            event_type,
            payload,
        }
    }
}

pub(super) fn response_item_runtime_events(
    payload: Option<&Value>,
    provenance: Option<&ConversationImportSourceProvenance>,
) -> Vec<ImportedRuntimeEvent> {
    let Some(payload) = payload else {
        return Vec::new();
    };
    let mut events = match payload.get("type").and_then(Value::as_str) {
        Some("function_call") => tool_start_events_from_response_item(payload),
        Some("function_call_output") => tool_finish_events_from_response_item(payload, false),
        Some("custom_tool_call") => tool_start_events_from_response_item(payload),
        Some("custom_tool_call_output") => tool_finish_events_from_response_item(payload, false),
        Some("tool_search_call") => vec![tool_started_from_response_item(payload)],
        Some("tool_search_output") => vec![tool_finished_from_response_item(payload, false)],
        Some("web_search_call") => response_item_web_search_event(payload)
            .into_iter()
            .collect(),
        Some("reasoning") => response_item_reasoning_event(payload).into_iter().collect(),
        _ => Vec::new(),
    };
    apply_provenance_to_runtime_events(&mut events, provenance);
    events
}

pub(super) fn event_msg_runtime_events(
    payload: Option<&Value>,
    provenance: Option<&ConversationImportSourceProvenance>,
) -> Vec<ImportedRuntimeEvent> {
    let Some(payload) = payload else {
        return Vec::new();
    };
    let mut events = match payload.get("type").and_then(Value::as_str) {
        Some("patch_apply_end") => vec![patch_apply_end_event(payload)],
        Some("mcp_tool_call_end") => vec![mcp_tool_call_end_event(payload)],
        Some("web_search_end") => vec![web_search_end_event(payload)],
        Some("exec_approval_request") | Some("apply_patch_approval_request") => {
            vec![action_required_event(payload)]
        }
        Some("turn_aborted") => vec![ImportedRuntimeEvent::new(
            "turn.canceled",
            compact_json(json!({
                "reason": string_field(payload, &["reason"]),
                "sourceClient": "codex",
                "sourceEventType": "turn_aborted",
            })),
        )],
        _ => Vec::new(),
    };
    apply_provenance_to_runtime_events(&mut events, provenance);
    events
}

pub(super) fn source_provenance_value(
    provenance: &ConversationImportSourceProvenance,
) -> Option<Value> {
    serde_json::to_value(provenance).ok()
}

pub(super) fn source_provenance(
    source_event_type: Option<&str>,
    source_event_seq: usize,
    payload: Option<&Value>,
) -> ConversationImportSourceProvenance {
    let payload_type = payload
        .and_then(|value| value.get("type"))
        .and_then(Value::as_str)
        .map(str::to_string);
    ConversationImportSourceProvenance {
        source_client: ConversationImportSourceClient::Codex,
        source_thread_id: None,
        source_path: None,
        source_event_type: source_event_type.map(str::to_string),
        source_event_seq: Some(source_event_seq),
        source_payload_type: payload_type,
        source_call_id: payload.and_then(call_id),
        source_role: payload
            .and_then(|value| string_field(value, &["role"]))
            .filter(|value| !value.trim().is_empty()),
        source_channel: payload
            .and_then(|value| string_field(value, &["channel"]))
            .filter(|value| !value.trim().is_empty()),
    }
}

pub(super) fn enrich_source_provenance(
    mut provenance: ConversationImportSourceProvenance,
    source_thread_id: Option<&str>,
    source_path: Option<&str>,
) -> ConversationImportSourceProvenance {
    if provenance.source_thread_id.is_none() {
        provenance.source_thread_id = source_thread_id.map(str::to_string);
    }
    if provenance.source_path.is_none() {
        provenance.source_path = source_path.map(str::to_string);
    }
    provenance
}

fn apply_provenance_to_runtime_events(
    events: &mut [ImportedRuntimeEvent],
    provenance: Option<&ConversationImportSourceProvenance>,
) {
    let Some(provenance_value) = provenance.and_then(source_provenance_value) else {
        return;
    };
    for event in events {
        if let Value::Object(ref mut object) = event.payload {
            object
                .entry("sourceProvenance".to_string())
                .or_insert_with(|| provenance_value.clone());
        }
    }
}

fn tool_start_events_from_response_item(payload: &Value) -> Vec<ImportedRuntimeEvent> {
    let mut events = vec![tool_started_from_response_item(payload)];
    if tool_name(payload).as_deref() == Some("exec_command") {
        events.push(command_started_from_response_item(payload));
    }
    events
}

fn tool_finish_events_from_response_item(
    payload: &Value,
    failed: bool,
) -> Vec<ImportedRuntimeEvent> {
    vec![tool_finished_from_response_item(payload, failed)]
}

fn tool_started_from_response_item(payload: &Value) -> ImportedRuntimeEvent {
    let call_id = call_id(payload);
    let tool_name = tool_name(payload);
    let arguments = response_item_arguments(payload);
    let mut event_payload = Map::new();
    insert_string(&mut event_payload, "toolCallId", call_id);
    insert_string(&mut event_payload, "toolName", tool_name.clone());
    insert_string(&mut event_payload, "name", tool_name);
    if let Some(arguments) = arguments {
        event_payload.insert("arguments".to_string(), arguments);
    }
    insert_string(
        &mut event_payload,
        "status",
        string_field(payload, &["status"]),
    );
    event_payload.insert("sourceClient".to_string(), json!("codex"));
    event_payload.insert("sourceEventType".to_string(), payload["type"].clone());
    ImportedRuntimeEvent::new("tool.started", Value::Object(event_payload))
}

fn command_started_from_response_item(payload: &Value) -> ImportedRuntimeEvent {
    let arguments = parsed_arguments(payload);
    let command = arguments
        .as_ref()
        .and_then(|value| string_field(value, &["cmd", "command"]));
    let cwd = arguments
        .as_ref()
        .and_then(|value| string_field(value, &["workdir", "cwd"]));
    ImportedRuntimeEvent::new(
        "command.started",
        compact_json(json!({
            "commandId": call_id(payload),
            "toolCallId": call_id(payload),
            "command": command,
            "canonicalCommand": command,
            "commandSummary": command,
            "commandArgv": command.as_ref().map(|value| vec![value.clone()]),
            "commandArgvSource": "codex_exec_command",
            "cwd": cwd,
            "sourceClient": "codex",
            "sourceEventType": "function_call",
        })),
    )
}

fn tool_finished_from_response_item(payload: &Value, failed: bool) -> ImportedRuntimeEvent {
    let output = response_item_output(payload);
    let success = !failed;
    let event_type = if success {
        "tool.result"
    } else {
        "tool.failed"
    };
    let payload = compact_json(json!({
        "toolCallId": call_id(payload),
        "toolName": tool_name(payload),
        "name": tool_name(payload),
        "status": if success { "completed" } else { "failed" },
        "success": success,
        "output": output,
        "outputPreview": output.as_deref().map(truncate_output_preview),
        "sourceClient": "codex",
        "sourceEventType": payload.get("type").and_then(Value::as_str),
    }));
    ImportedRuntimeEvent::new(event_type, payload)
}

fn response_item_web_search_event(payload: &Value) -> Option<ImportedRuntimeEvent> {
    let call_id = call_id(payload)?;
    let action = payload.get("action").cloned();
    Some(ImportedRuntimeEvent::new(
        "tool.result",
        compact_json(json!({
            "toolCallId": call_id,
            "toolName": "web_search",
            "name": "web_search",
            "status": string_field(payload, &["status"]).unwrap_or_else(|| "completed".to_string()),
            "success": true,
            "action": action.as_ref().and_then(Value::as_str),
            "result": action,
            "output": action.as_ref().map(Value::to_string),
            "sourceClient": "codex",
            "sourceEventType": "web_search_call",
        })),
    ))
}

fn response_item_reasoning_event(payload: &Value) -> Option<ImportedRuntimeEvent> {
    let text = reasoning_text(payload)?;
    Some(ImportedRuntimeEvent::new(
        "reasoning.completed",
        compact_json(json!({
            "text": text,
            "summary": reasoning_summary(payload),
            "sourceClient": "codex",
            "sourceEventType": "reasoning",
        })),
    ))
}

fn mcp_tool_call_end_event(payload: &Value) -> ImportedRuntimeEvent {
    let invocation = payload.get("invocation").cloned();
    let result = payload.get("result").cloned();
    let success = !mcp_result_is_error(result.as_ref());
    let event_type = if success {
        "tool.result"
    } else {
        "tool.failed"
    };
    let tool_name = invocation
        .as_ref()
        .and_then(|value| string_field(value, &["tool"]))
        .map(|tool| {
            invocation
                .as_ref()
                .and_then(|value| string_field(value, &["server"]))
                .map(|server| format!("mcp__{server}__{tool}"))
                .unwrap_or(tool)
        });
    ImportedRuntimeEvent::new(
        event_type,
        compact_json(json!({
            "toolCallId": call_id(payload),
            "toolName": tool_name,
            "name": tool_name,
            "status": if success { "completed" } else { "failed" },
            "success": success,
            "arguments": invocation.as_ref().and_then(|value| value.get("arguments")).cloned(),
            "result": result,
            "output": result.as_ref().map(Value::to_string),
            "sourceClient": "codex",
            "sourceEventType": "mcp_tool_call_end",
        })),
    )
}

fn web_search_end_event(payload: &Value) -> ImportedRuntimeEvent {
    let action = payload.get("action").cloned();
    ImportedRuntimeEvent::new(
        "tool.result",
        compact_json(json!({
            "toolCallId": call_id(payload),
            "toolName": "web_search",
            "name": "web_search",
            "status": "completed",
            "success": true,
            "action": action.as_ref().and_then(Value::as_str),
            "result": action,
            "output": action.as_ref().map(Value::to_string),
            "sourceClient": "codex",
            "sourceEventType": "web_search_end",
        })),
    )
}

fn patch_apply_end_event(payload: &Value) -> ImportedRuntimeEvent {
    let success = payload
        .get("success")
        .and_then(Value::as_bool)
        .unwrap_or_else(|| {
            string_field(payload, &["status"])
                .map(|status| status == "completed")
                .unwrap_or(true)
        });
    let status = if success { "applied" } else { "failed" };
    let paths = changed_paths(payload);
    let event_type = if success {
        "patch.applied"
    } else {
        "patch.failed"
    };
    ImportedRuntimeEvent::new(
        event_type,
        compact_json(json!({
            "patchId": call_id(payload),
            "toolCallId": call_id(payload),
            "status": status,
            "success": success,
            "stdout": string_field(payload, &["stdout"]),
            "stderr": string_field(payload, &["stderr"]),
            "paths": paths,
            "changedFiles": paths,
            "changes": payload.get("changes").cloned(),
            "failureCategory": if success { None } else { Some("apply_failed") },
            "sourceClient": "codex",
            "sourceEventType": "patch_apply_end",
        })),
    )
}

fn action_required_event(payload: &Value) -> ImportedRuntimeEvent {
    let request_id = call_id(payload)
        .or_else(|| string_field(payload, &["id", "request_id"]))
        .unwrap_or_else(|| "codex_import_approval".to_string());
    let source_type = payload
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("approval_request");
    let command = payload
        .get("command")
        .or_else(|| payload.get("cmd"))
        .cloned();
    ImportedRuntimeEvent::new(
        "action.required",
        compact_json(json!({
            "requestId": request_id,
            "actionId": request_id,
            "actionType": "tool_confirmation",
            "actionKind": "approve-tool",
            "toolName": approval_tool_name(payload),
            "arguments": command,
            "prompt": approval_prompt(payload),
            "data": payload.clone(),
            "sourceClient": "codex",
            "sourceEventType": source_type,
            "importedReadOnly": true,
        })),
    )
}

fn response_item_arguments(payload: &Value) -> Option<Value> {
    payload
        .get("arguments")
        .cloned()
        .or_else(|| payload.get("input").cloned())
}

fn parsed_arguments(payload: &Value) -> Option<Value> {
    let arguments = response_item_arguments(payload)?;
    match arguments {
        Value::String(text) => serde_json::from_str::<Value>(&text).ok(),
        value => Some(value),
    }
}

fn response_item_output(payload: &Value) -> Option<String> {
    string_field(payload, &["output"])
        .or_else(|| payload.get("tools").map(Value::to_string))
        .or_else(|| payload.get("result").map(Value::to_string))
}

fn reasoning_text(payload: &Value) -> Option<String> {
    let mut parts = Vec::new();
    collect_reasoning_parts(
        &mut parts,
        payload.get("content"),
        &["reasoning_text", "text"],
    );
    string_field(payload, &["text"])
        .into_iter()
        .for_each(|value| parts.push(value));
    if parts.is_empty() {
        collect_reasoning_parts(
            &mut parts,
            payload.get("summary"),
            &["summary_text", "text"],
        );
    }
    let text = parts.join("\n\n");
    (!text.trim().is_empty()).then_some(text)
}

fn reasoning_summary(payload: &Value) -> Vec<String> {
    let mut parts = Vec::new();
    collect_reasoning_parts(
        &mut parts,
        payload.get("summary"),
        &["summary_text", "text"],
    );
    parts
}

fn collect_reasoning_parts(parts: &mut Vec<String>, value: Option<&Value>, allowed_types: &[&str]) {
    let Some(value) = value else {
        return;
    };
    if let Some(text) = value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        push_reasoning_part(parts, text);
        return;
    }
    let Some(items) = value.as_array() else {
        return;
    };
    for item in items {
        let item_type = item.get("type").and_then(Value::as_str);
        if item_type.is_some_and(|item_type| !allowed_types.contains(&item_type)) {
            continue;
        }
        if let Some(text) = item
            .get("text")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            push_reasoning_part(parts, text);
        }
    }
}

fn push_reasoning_part(parts: &mut Vec<String>, text: &str) {
    if parts.iter().any(|existing| existing == text) {
        return;
    }
    parts.push(text.to_string());
}

fn approval_prompt(payload: &Value) -> Option<String> {
    string_field(payload, &["message", "reason", "prompt"]).or_else(|| {
        let command = payload
            .get("command")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .filter(|value| !value.trim().is_empty());
        command.map(|command| format!("Approve Codex command: {command}"))
    })
}

fn approval_tool_name(payload: &Value) -> Option<String> {
    match payload.get("type").and_then(Value::as_str) {
        Some("exec_approval_request") => Some("exec_command".to_string()),
        Some("apply_patch_approval_request") => Some("apply_patch".to_string()),
        _ => string_field(payload, &["tool", "tool_name", "toolName", "name"]),
    }
}

fn call_id(payload: &Value) -> Option<String> {
    string_field(
        payload,
        &[
            "call_id",
            "callId",
            "tool_call_id",
            "toolCallId",
            "id",
            "request_id",
            "requestId",
        ],
    )
}

fn tool_name(payload: &Value) -> Option<String> {
    string_field(payload, &["name", "tool", "tool_name", "toolName"]).or_else(|| {
        match payload.get("type").and_then(Value::as_str) {
            Some("function_call") => string_field(payload, &["name"]),
            Some("custom_tool_call") => string_field(payload, &["name"]),
            Some("tool_search_call") | Some("tool_search_output") => {
                Some("tool_search".to_string())
            }
            Some("web_search_call") => Some("web_search".to_string()),
            _ => None,
        }
    })
}

fn changed_paths(payload: &Value) -> Vec<String> {
    let mut paths = BTreeSet::new();
    if let Some(changes) = payload.get("changes").and_then(Value::as_object) {
        paths.extend(changes.keys().cloned());
    }
    for key in ["paths", "changedFiles", "changed_files"] {
        if let Some(values) = payload.get(key).and_then(Value::as_array) {
            paths.extend(values.iter().filter_map(Value::as_str).map(str::to_string));
        }
    }
    paths.into_iter().collect()
}

fn mcp_result_is_error(result: Option<&Value>) -> bool {
    let Some(result) = result else {
        return false;
    };
    result
        .pointer("/Ok/isError")
        .and_then(Value::as_bool)
        .or_else(|| result.pointer("/ok/isError").and_then(Value::as_bool))
        .or_else(|| result.pointer("/Err").map(|_| true))
        .unwrap_or(false)
}

fn string_field(payload: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| payload.get(*key).and_then(Value::as_str))
        .map(str::to_string)
        .filter(|value| !value.trim().is_empty())
}

fn insert_string(map: &mut Map<String, Value>, key: &str, value: Option<String>) {
    if let Some(value) = value {
        map.insert(key.to_string(), Value::String(value));
    }
}

fn truncate_output_preview(value: &str) -> String {
    const LIMIT: usize = 1_000;
    if value.len() <= LIMIT {
        return value.to_string();
    }
    let mut end = LIMIT;
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    value[..end].to_string()
}

fn compact_json(value: Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.into_iter()
                .filter_map(|(key, value)| {
                    if value.is_null() {
                        return None;
                    }
                    if matches!(&value, Value::Array(items) if items.is_empty()) {
                        return None;
                    }
                    Some((key, compact_json(value)))
                })
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.into_iter().map(compact_json).collect()),
        value => value,
    }
}
