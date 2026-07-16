use super::super::provenance;
use app_server_protocol::{ConversationImportSourceClient, ConversationImportSourceProvenance};
use serde_json::{json, Value};
use std::collections::BTreeSet;

mod plan;
mod rollout_event;
#[cfg(test)]
mod tests;

use plan::{completed_plan_event, plan_final_from_response_item};
use rollout_event::{
    completed_turn_item_tool_event, response_item_web_search_event,
    tool_finish_events_from_response_item, tool_start_events_from_response_item, tool_started,
    tool_terminal,
};
pub(in crate::runtime::conversation_import) use rollout_event::{
    CodexRolloutEvent, CodexToolCall, CodexToolPhase, CodexToolSource,
};

pub(super) fn response_item_rollout_events(
    payload: Option<&Value>,
    provenance: Option<&ConversationImportSourceProvenance>,
) -> Vec<CodexRolloutEvent> {
    let Some(payload) = payload else {
        return Vec::new();
    };
    let mut events = match payload.get("type").and_then(Value::as_str) {
        Some("function_call") => tool_start_events_from_response_item(payload),
        Some("function_call_output") => tool_finish_events_from_response_item(payload, false),
        Some("custom_tool_call") => tool_start_events_from_response_item(payload),
        Some("custom_tool_call_output") => tool_finish_events_from_response_item(payload, false),
        Some("web_search_call") => response_item_web_search_event(payload)
            .into_iter()
            .collect(),
        Some("reasoning") => response_item_reasoning_event(payload).into_iter().collect(),
        _ => Vec::new(),
    };
    apply_provenance_to_rollout_events(&mut events, provenance);
    events
}

pub(super) fn event_msg_rollout_events(
    payload: Option<&Value>,
    provenance: Option<&ConversationImportSourceProvenance>,
) -> Vec<CodexRolloutEvent> {
    let Some(payload) = payload else {
        return Vec::new();
    };
    let mut events = match payload.get("type").and_then(Value::as_str) {
        Some("patch_apply_begin") => vec![patch_apply_begin_event(payload)],
        Some("patch_apply_end") => vec![patch_apply_end_event(payload)],
        Some("mcp_tool_call_begin") => vec![mcp_tool_call_begin_event(payload)],
        Some("mcp_tool_call_end") => vec![mcp_tool_call_end_event(payload)],
        Some("dynamic_tool_call_request") => vec![dynamic_tool_call_started_event(payload)],
        Some("dynamic_tool_call_response") => vec![dynamic_tool_call_finished_event(payload)],
        Some("view_image_tool_call") => vec![view_image_tool_call_event(payload)],
        Some("image_generation_begin") => vec![image_generation_started_event(payload)],
        Some("image_generation_end") => vec![image_generation_finished_event(payload)],
        Some("web_search_end") => vec![web_search_end_event(payload)],
        Some("item_completed") => item_completed_event(payload).into_iter().collect(),
        Some("hook_prompt") => hook_prompt_event(payload).into_iter().collect(),
        Some("context_compacted") => vec![context_compaction_event(payload)],
        Some("turn_complete") | Some("task_complete") => vec![turn_complete_event(payload)],
        Some("entered_review_mode") => entered_review_mode_event(payload).into_iter().collect(),
        Some("exited_review_mode") => exited_review_mode_event(payload).into_iter().collect(),
        Some("sub_agent_activity") | Some("subagent_activity") => {
            vec![subagent_activity_event(payload)]
        }
        Some(
            "collab_agent_spawn_begin"
            | "collab_agent_interaction_begin"
            | "collab_waiting_begin"
            | "collab_close_begin"
            | "collab_resume_begin",
        ) => {
            vec![collab_agent_tool_event(payload, true)]
        }
        Some(
            "collab_agent_spawn_end"
            | "collab_agent_interaction_end"
            | "collab_waiting_end"
            | "collab_close_end"
            | "collab_resume_end",
        ) => {
            vec![collab_agent_tool_event(payload, false)]
        }
        Some("exec_approval_request") | Some("apply_patch_approval_request") => {
            vec![action_required_event(payload)]
        }
        Some("turn_aborted") => vec![CodexRolloutEvent::new(
            "turn.canceled",
            compact_json(json!({
                "reason": string_field(payload, &["reason"]),
                "sourceClient": "codex",
                "sourceEventType": "turn_aborted",
            })),
        )],
        _ => Vec::new(),
    };
    apply_provenance_to_rollout_events(&mut events, provenance);
    events
}

fn turn_complete_event(payload: &Value) -> CodexRolloutEvent {
    CodexRolloutEvent::new(
        "turn.completed",
        compact_json(json!({
            "turnId": string_field(payload, &["turn_id", "turnId"]),
            "completedAt": string_field(payload, &["completed_at", "completedAt"]),
            "durationMs": number_field(payload, &["duration_ms", "durationMs"]),
            "lastAgentMessage": string_field(payload, &["last_agent_message", "lastAgentMessage"]),
            "sourceClient": "codex",
            "sourceEventType": payload.get("type").and_then(Value::as_str),
        })),
    )
}

pub(super) fn source_provenance_value(
    provenance: &ConversationImportSourceProvenance,
) -> Option<Value> {
    provenance::source_provenance_value(provenance)
}

pub(super) fn source_provenance(
    source_event_type: Option<&str>,
    source_event_seq: usize,
    payload: Option<&Value>,
) -> ConversationImportSourceProvenance {
    provenance::source_provenance(
        ConversationImportSourceClient::Codex,
        source_event_type,
        source_event_seq,
        payload,
        payload.and_then(call_id),
    )
}

pub(super) fn enrich_source_provenance(
    provenance: ConversationImportSourceProvenance,
    source_thread_id: Option<&str>,
    source_path: Option<&str>,
) -> ConversationImportSourceProvenance {
    provenance::enrich_source_provenance(provenance, source_thread_id, source_path)
}

fn apply_provenance_to_rollout_events(
    events: &mut [CodexRolloutEvent],
    provenance: Option<&ConversationImportSourceProvenance>,
) {
    let Some(provenance_value) = provenance.and_then(source_provenance_value) else {
        return;
    };
    for event in events {
        event.enrich_source_provenance(provenance_value.clone());
    }
}

fn command_started_from_response_item(payload: &Value) -> CodexRolloutEvent {
    let arguments = parsed_arguments(payload);
    let command = arguments
        .as_ref()
        .and_then(|value| string_field(value, &["cmd", "command"]));
    let cwd = arguments
        .as_ref()
        .and_then(|value| string_field(value, &["workdir", "cwd"]));
    CodexRolloutEvent::new(
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

fn response_item_reasoning_event(payload: &Value) -> Option<CodexRolloutEvent> {
    let text = reasoning_text(payload)?;
    Some(CodexRolloutEvent::new(
        "reasoning.completed",
        compact_json(json!({
            "text": text,
            "summary": reasoning_summary(payload),
            "sourceClient": "codex",
            "sourceEventType": "reasoning",
        })),
    ))
}

fn item_completed_event(payload: &Value) -> Option<CodexRolloutEvent> {
    let item = payload.get("item")?;
    if !item
        .get("type")
        .and_then(Value::as_str)
        .is_some_and(|item_type| item_type == "Plan" || item_type == "plan")
    {
        return completed_turn_item_tool_event(payload);
    }
    completed_plan_event(item)
}

fn mcp_tool_call_begin_event(payload: &Value) -> CodexRolloutEvent {
    let invocation = payload.get("invocation").cloned();
    let tool_name = mcp_tool_name(invocation.as_ref());
    tool_started(
        call_id(payload),
        tool_name,
        invocation
            .as_ref()
            .and_then(|value| value.get("arguments"))
            .cloned(),
        json!({
            "status": "in_progress",
            "server": invocation.as_ref().and_then(|value| string_field(value, &["server"])),
            "mcpAppResourceUri": string_field(payload, &["mcp_app_resource_uri", "mcpAppResourceUri"]),
            "pluginId": string_field(payload, &["plugin_id", "pluginId"]),
            "sourceClient": "codex",
            "sourceEventType": "mcp_tool_call_begin",
        }),
    )
}

fn mcp_tool_call_end_event(payload: &Value) -> CodexRolloutEvent {
    let invocation = payload.get("invocation").cloned();
    let result = payload.get("result").cloned();
    let success = !mcp_result_is_error(result.as_ref());
    let tool_name = mcp_tool_name(invocation.as_ref());
    tool_terminal(
        call_id(payload),
        tool_name,
        invocation
            .as_ref()
            .and_then(|value| value.get("arguments"))
            .cloned(),
        result.clone(),
        !success,
        json!({
            "status": if success { "completed" } else { "failed" },
            "success": success,
            "server": invocation.as_ref().and_then(|value| string_field(value, &["server"])),
            "mcpAppResourceUri": string_field(payload, &["mcp_app_resource_uri", "mcpAppResourceUri"]),
            "pluginId": string_field(payload, &["plugin_id", "pluginId"]),
            "result": result,
            "sourceClient": "codex",
            "sourceEventType": "mcp_tool_call_end",
        }),
    )
}

fn dynamic_tool_call_started_event(payload: &Value) -> CodexRolloutEvent {
    let tool_name = dynamic_tool_name(payload);
    tool_started(
        call_id(payload),
        tool_name,
        payload.get("arguments").cloned(),
        json!({
            "status": "in_progress",
            "namespace": string_field(payload, &["namespace"]),
            "sourceClient": "codex",
            "sourceEventType": "dynamic_tool_call_request",
        }),
    )
}

fn dynamic_tool_call_finished_event(payload: &Value) -> CodexRolloutEvent {
    let success = payload
        .get("success")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let tool_name = dynamic_tool_name(payload);
    let output = dynamic_tool_output(payload);
    tool_terminal(
        call_id(payload),
        tool_name,
        payload.get("arguments").cloned(),
        output.map(Value::String),
        !success,
        json!({
            "status": if success { "completed" } else { "failed" },
            "success": success,
            "namespace": string_field(payload, &["namespace"]),
            "contentItems": payload.get("content_items")
                .or_else(|| payload.get("contentItems"))
                .cloned(),
            "sourceClient": "codex",
            "sourceEventType": "dynamic_tool_call_response",
        }),
    )
}

fn view_image_tool_call_event(payload: &Value) -> CodexRolloutEvent {
    let path = string_field(payload, &["path"]);
    let output = path.as_ref().map(|path| format!("Viewed image: {path}"));
    tool_terminal(
        call_id(payload),
        Some("view_image".to_string()),
        path.as_ref().map(|path| json!({ "path": path })),
        output.map(Value::String),
        false,
        json!({
            "status": "completed",
            "success": true,
            "path": path,
            "sourceClient": "codex",
            "sourceEventType": "view_image_tool_call",
        }),
    )
}

fn image_generation_started_event(payload: &Value) -> CodexRolloutEvent {
    tool_started(
        call_id(payload),
        Some("image_generation".to_string()),
        payload
            .get("prompt")
            .and_then(Value::as_str)
            .map(|prompt| json!({ "prompt": prompt })),
        json!({
            "status": "in_progress",
            "sourceClient": "codex",
            "sourceEventType": "image_generation_begin",
        }),
    )
}

fn image_generation_finished_event(payload: &Value) -> CodexRolloutEvent {
    let status = string_field(payload, &["status"]).unwrap_or_else(|| "completed".to_string());
    let success = !matches!(
        status.as_str(),
        "failed" | "error" | "cancelled" | "canceled"
    );
    let output = string_field(payload, &["result"])
        .or_else(|| string_field(payload, &["saved_path", "savedPath"]))
        .or_else(|| string_field(payload, &["revised_prompt", "revisedPrompt"]));
    tool_terminal(
        call_id(payload),
        Some("image_generation".to_string()),
        Some(json!({
            "revisedPrompt": string_field(payload, &["revised_prompt", "revisedPrompt"]),
            "savedPath": string_field(payload, &["saved_path", "savedPath"]),
        })),
        output.map(Value::String),
        !success,
        json!({
            "status": if success { "completed" } else { "failed" },
            "success": success,
            "result": string_field(payload, &["result"]),
            "sourceClient": "codex",
            "sourceEventType": "image_generation_end",
        }),
    )
}

fn web_search_end_event(payload: &Value) -> CodexRolloutEvent {
    let action = payload.get("action").cloned();
    let output = response_item_output(payload).or_else(|| action.as_ref().map(Value::to_string));
    let query = action.as_ref().and_then(web_search_action_query);
    tool_terminal(
        call_id(payload),
        Some("web_search".to_string()),
        action.as_ref().map(|action| {
            json!({
                "action": action,
                "query": query.clone(),
            })
        }),
        output.clone().map(Value::String),
        false,
        json!({
            "status": "completed",
            "success": true,
            "action": action.as_ref().and_then(web_search_action_label),
            "query": query,
            "result": action,
            "outputPreview": output.as_deref().map(truncate_output_preview),
            "sourceClient": "codex",
            "sourceEventType": "web_search_end",
        }),
    )
}

fn patch_apply_end_event(payload: &Value) -> CodexRolloutEvent {
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
    CodexRolloutEvent::new(
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

fn patch_apply_begin_event(payload: &Value) -> CodexRolloutEvent {
    let paths = changed_paths(payload);
    CodexRolloutEvent::new(
        "patch.started",
        compact_json(json!({
            "patchId": call_id(payload),
            "toolCallId": call_id(payload),
            "paths": paths,
            "changedFiles": paths,
            "changes": payload.get("changes").cloned(),
            "sourceClient": "codex",
            "sourceEventType": "patch_apply_begin",
        })),
    )
}

fn action_required_event(payload: &Value) -> CodexRolloutEvent {
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
    CodexRolloutEvent::new(
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

fn hook_prompt_event(payload: &Value) -> Option<CodexRolloutEvent> {
    let text = hook_prompt_text(payload)?;
    Some(CodexRolloutEvent::new(
        "reasoning.completed",
        compact_json(json!({
            "text": text,
            "summary": [text],
            "sourceClient": "codex",
            "sourceEventType": "hook_prompt",
        })),
    ))
}

fn context_compaction_event(payload: &Value) -> CodexRolloutEvent {
    CodexRolloutEvent::new(
        "context.compaction.completed",
        compact_json(json!({
            "compactionId": call_id(payload),
            "stage": "completed",
            "trigger": string_field(payload, &["trigger"]).unwrap_or_else(|| "auto".to_string()),
            "detail": string_field(payload, &["detail", "message", "summary"]),
            "sourceClient": "codex",
            "sourceEventType": "context_compacted",
        })),
    )
}

fn entered_review_mode_event(payload: &Value) -> Option<CodexRolloutEvent> {
    let review = review_text(payload).unwrap_or_else(|| "Review requested.".to_string());
    Some(CodexRolloutEvent::new(
        "reasoning.completed",
        compact_json(json!({
            "text": review,
            "summary": [review],
            "sourceClient": "codex",
            "sourceEventType": "entered_review_mode",
        })),
    ))
}

fn exited_review_mode_event(payload: &Value) -> Option<CodexRolloutEvent> {
    let review = review_text(payload)?;
    Some(CodexRolloutEvent::new(
        "message.delta",
        compact_json(json!({
            "text": review,
            "phase": "commentary",
            "imported": true,
            "sourceClient": "codex",
            "sourceEventType": "exited_review_mode",
        })),
    ))
}

fn subagent_activity_event(payload: &Value) -> CodexRolloutEvent {
    let source_event_id =
        string_field(payload, &["event_id", "eventId", "id"]).or_else(|| call_id(payload));
    let kind = string_field(payload, &["kind"]).unwrap_or_else(|| "started".to_string());
    let status_label = match kind.trim().to_ascii_lowercase().as_str() {
        "started" => "running",
        "interacted" => "running",
        "interrupted" => "aborted",
        "completed" => "completed",
        "failed" => "failed",
        _ => kind.as_str(),
    };
    CodexRolloutEvent::new(
        "subagent.activity",
        compact_json(json!({
            "activityId": source_event_id.clone(),
            "activity": kind,
            "statusLabel": status_label,
            "status": match status_label {
                "failed" => "failed",
                "running" => "in_progress",
                _ => "completed",
            },
            "title": string_field(payload, &["agent_path", "agentPath", "title"]),
            "summary": string_field(payload, &["summary", "message", "prompt"]),
            "sessionId": string_field(payload, &["agent_thread_id", "agentThreadId", "session_id", "sessionId"]),
            "role": string_field(payload, &["role", "kind"]),
            "model": string_field(payload, &["model"]),
            "sourceClient": "codex",
            "sourceEventType": payload.get("type").and_then(Value::as_str),
            "metadata": {
                "source_event_id": source_event_id,
            },
        })),
    )
}

fn collab_agent_tool_event(payload: &Value, in_progress: bool) -> CodexRolloutEvent {
    let success = !collab_agent_failed(payload);
    let tool_name = collab_tool_name(payload);
    let metadata = json!({
        "status": if in_progress { "in_progress" } else if success { "completed" } else { "failed" },
        "success": if in_progress { None } else { Some(success) },
        "sourceClient": "codex",
        "sourceEventType": payload.get("type").and_then(Value::as_str),
    });
    if in_progress {
        tool_started(
            call_id(payload),
            Some(tool_name),
            Some(collab_tool_arguments(payload)),
            metadata,
        )
    } else {
        tool_terminal(
            call_id(payload),
            Some(tool_name),
            Some(collab_tool_arguments(payload)),
            collab_tool_output(payload).map(Value::String),
            !success,
            metadata,
        )
    }
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
        command.map(|command| format!("Approve command: {command}"))
    })
}

fn approval_tool_name(payload: &Value) -> Option<String> {
    match payload.get("type").and_then(Value::as_str) {
        Some("exec_approval_request") => Some("exec_command".to_string()),
        Some("apply_patch_approval_request") => Some("apply_patch".to_string()),
        _ => string_field(payload, &["tool", "tool_name", "toolName", "name"]),
    }
}

fn mcp_tool_name(invocation: Option<&Value>) -> Option<String> {
    invocation
        .and_then(|value| string_field(value, &["tool"]))
        .map(|tool| {
            invocation
                .and_then(|value| string_field(value, &["server"]))
                .map(|server| format!("mcp__{server}__{tool}"))
                .unwrap_or(tool)
        })
}

fn dynamic_tool_name(payload: &Value) -> Option<String> {
    string_field(payload, &["tool", "name"]).map(|tool| {
        string_field(payload, &["namespace"])
            .filter(|namespace| !namespace.trim().is_empty())
            .map(|namespace| format!("{namespace}.{tool}"))
            .unwrap_or(tool)
    })
}

fn dynamic_tool_output(payload: &Value) -> Option<String> {
    payload
        .get("content_items")
        .or_else(|| payload.get("contentItems"))
        .and_then(dynamic_tool_content_items_text)
        .or_else(|| response_item_output(payload))
}

fn dynamic_tool_content_items_text(value: &Value) -> Option<String> {
    let items = value.as_array()?;
    let text = items
        .iter()
        .filter_map(|item| string_field(item, &["text", "image_url", "imageUrl"]))
        .collect::<Vec<_>>()
        .join("\n");
    (!text.trim().is_empty()).then_some(text)
}

fn hook_prompt_text(payload: &Value) -> Option<String> {
    let fragments = payload.get("fragments")?.as_array()?;
    let text = fragments
        .iter()
        .filter_map(|fragment| string_field(fragment, &["text"]))
        .collect::<Vec<_>>()
        .join("\n\n");
    (!text.trim().is_empty()).then_some(text)
}

fn review_text(payload: &Value) -> Option<String> {
    string_field(payload, &["review", "user_facing_hint", "userFacingHint"])
        .or_else(|| {
            payload
                .get("review_output")
                .or_else(|| payload.get("reviewOutput"))
                .map(Value::to_string)
        })
        .or_else(|| string_field(payload, &["message", "summary"]))
}

fn collab_agent_failed(payload: &Value) -> bool {
    let status = payload.get("status");
    status
        .and_then(Value::as_str)
        .map(|value| {
            matches!(
                value.trim(),
                "failed" | "errored" | "not_found" | "notFound"
            )
        })
        .unwrap_or(false)
        || status
            .and_then(Value::as_object)
            .and_then(|object| object.keys().next())
            .map(|key| {
                matches!(
                    key.as_str(),
                    "errored" | "Errored" | "not_found" | "notFound" | "NotFound"
                )
            })
            .unwrap_or(false)
}

fn collab_tool_name(payload: &Value) -> String {
    match payload.get("type").and_then(Value::as_str) {
        Some("collab_agent_spawn_begin" | "collab_agent_spawn_end") => "agent".to_string(),
        Some("collab_agent_interaction_begin" | "collab_agent_interaction_end") => {
            "send_message".to_string()
        }
        Some("collab_waiting_begin" | "collab_waiting_end") => "wait_agent".to_string(),
        Some("collab_close_begin" | "collab_close_end") => "close_agent".to_string(),
        Some("collab_resume_begin" | "collab_resume_end") => "resume_agent".to_string(),
        _ => "collab_agent".to_string(),
    }
}

fn collab_tool_arguments(payload: &Value) -> Value {
    compact_json(json!({
        "senderThreadId": string_field(payload, &["sender_thread_id", "senderThreadId"]),
        "receiverThreadId": string_field(payload, &["receiver_thread_id", "receiverThreadId"]),
        "receiverThreadIds": payload.get("receiver_thread_ids")
            .or_else(|| payload.get("receiverThreadIds"))
            .cloned(),
        "newThreadId": string_field(payload, &["new_thread_id", "newThreadId"]),
        "prompt": string_field(payload, &["prompt"]),
        "model": string_field(payload, &["model"]),
        "reasoningEffort": string_field(payload, &["reasoning_effort", "reasoningEffort"]),
        "statuses": payload.get("statuses").cloned(),
        "status": payload.get("status").cloned(),
    }))
}

fn collab_tool_output(payload: &Value) -> Option<String> {
    string_field(payload, &["summary", "message"])
        .or_else(|| string_field(payload, &["new_thread_id", "newThreadId"]))
        .or_else(|| payload.get("status").map(Value::to_string))
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

fn web_search_action_query(action: &Value) -> Option<String> {
    string_field(action, &["query", "url", "pattern"]).or_else(|| {
        action
            .get("queries")
            .and_then(Value::as_array)
            .and_then(|queries| queries.first())
            .and_then(Value::as_str)
            .map(str::to_string)
            .filter(|value| !value.trim().is_empty())
    })
}

fn web_search_action_label(action: &Value) -> Option<String> {
    action
        .as_str()
        .map(str::to_string)
        .or_else(|| string_field(action, &["type", "kind", "action"]))
}

fn string_field(payload: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| payload.get(*key).and_then(Value::as_str))
        .map(str::to_string)
        .filter(|value| !value.trim().is_empty())
}

fn number_field(payload: &Value, keys: &[&str]) -> Option<Value> {
    keys.iter()
        .find_map(|key| payload.get(*key))
        .filter(|value| value.is_number())
        .cloned()
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
    provenance::compact_json(value)
}
