use super::artifact_projection;
use super::coding_activity_projection;
use super::event_request_id;
use super::file_checkpoint_projection;
use super::output_refs;
use super::raw_string_field;
use super::status::agent_session_status_label;
use super::status::agent_turn_is_active;
use super::status::agent_turn_status_label;
use super::string_array_field;
use super::string_field;
use super::thread_item_projection;
use super::timestamp_seconds;
use super::turn_input_events;
use super::StoredSession;
use app_server_protocol::AgentEvent;
use app_server_protocol::AgentInput;
use app_server_protocol::AgentSession;
use app_server_protocol::AgentSessionActionScope;
use app_server_protocol::AgentSessionActionType;
use app_server_protocol::AgentSessionReplayedActionRequired;
use app_server_protocol::AgentTurn;
use app_server_protocol::AgentTurnStatus;
use serde_json::json;

pub(super) fn runtime_session_read_detail(stored: &StoredSession) -> serde_json::Value {
    let thread_read = runtime_thread_read_from_stored_session(stored);
    let messages = runtime_session_messages(stored);
    let mut items = thread_item_projection::thread_items_from_events(stored);
    items.extend(file_checkpoint_projection::file_artifact_items_from_events(
        &stored.events,
    ));
    items.extend(runtime_error_items_from_events(stored));
    let messages_count = messages.len();
    json!({
        "id": stored.session.session_id,
        "session_id": stored.session.session_id,
        "thread_id": stored.session.thread_id,
        "workspace_id": stored.session.workspace_id,
        "status": agent_session_status_label(stored.session.status),
        "working_dir": session_working_dir(&stored.session),
        "execution_strategy": session_execution_strategy(&stored.session),
        "execution_runtime": session_execution_runtime(&stored.session),
        "messages_count": messages_count,
        "history_limit": messages_count,
        "history_offset": 0,
        "history_cursor": {
            "oldest_message_id": null,
            "start_index": 0,
            "loaded_count": messages_count,
        },
        "history_truncated": false,
        "messages": messages,
        "turns": stored.turns,
        "items": items,
        "queued_turns": [],
        "artifacts": artifact_projection::stored_artifact_summaries_for_turn(stored, None),
        "outputs": output_refs::read_model_outputs(stored.output_blobs.values(), None),
        "thread_read": thread_read,
    })
}

pub(super) fn runtime_session_messages(stored: &StoredSession) -> Vec<serde_json::Value> {
    let mut messages = Vec::new();
    for turn in &stored.turns {
        let input = stored
            .turn_inputs
            .get(&turn.turn_id)
            .cloned()
            .or_else(|| turn_input_from_events(&stored.events, &turn.turn_id));
        if let Some(input) = input.as_ref() {
            if let Some(message) = runtime_user_message_from_turn(turn, input) {
                messages.push(message);
            }
        }
        if let Some(message) = runtime_assistant_message_from_events(turn, &stored.events) {
            messages.push(message);
        }
    }
    messages
}

fn turn_input_from_events(
    events: &[app_server_protocol::AgentEvent],
    turn_id: &str,
) -> Option<app_server_protocol::AgentInput> {
    events
        .iter()
        .find(|event| {
            event.turn_id.as_deref() == Some(turn_id)
                && turn_input_events::is_turn_input_event(event)
        })
        .and_then(|event| event.payload.get("input"))
        .and_then(|value| serde_json::from_value(value.clone()).ok())
        .or_else(|| {
            events
                .iter()
                .find(|event| {
                    event.turn_id.as_deref() == Some(turn_id)
                        && turn_input_events::is_turn_input_event(event)
                })
                .and_then(|event| {
                    event
                        .payload
                        .get("content")
                        .and_then(|content| content.get("text").or_else(|| content.get("message")))
                        .and_then(serde_json::Value::as_str)
                        .map(str::to_string)
                        .filter(|text| !text.trim().is_empty())
                        .map(|text| app_server_protocol::AgentInput {
                            text,
                            attachments: event
                                .payload
                                .get("attachments")
                                .and_then(|value| serde_json::from_value(value.clone()).ok())
                                .unwrap_or_default(),
                        })
                })
        })
}

fn runtime_user_message_from_turn(
    turn: &AgentTurn,
    input: &AgentInput,
) -> Option<serde_json::Value> {
    let text = input.text.trim();
    if text.is_empty() && input.attachments.is_empty() {
        return None;
    }
    let mut content = Vec::new();
    if !text.is_empty() {
        content.push(json!({
            "type": "text",
            "text": text,
        }));
    }
    for attachment in &input.attachments {
        content.push(json!({
            "type": attachment.kind,
            "uri": attachment.uri,
            "metadata": attachment.metadata,
        }));
    }

    Some(json!({
        "id": format!("{}:user", turn.turn_id),
        "role": "user",
        "runtimeTurnId": turn.turn_id,
        "runtime_turn_id": turn.turn_id,
        "content": content,
        "attachments": input.attachments,
        "timestamp": timestamp_seconds(turn.started_at.as_deref()),
    }))
}

fn runtime_assistant_message_from_events(
    turn: &AgentTurn,
    events: &[AgentEvent],
) -> Option<serde_json::Value> {
    let mut text = String::new();
    let mut timestamp_value: Option<&str> = None;
    for event in events.iter().filter(|event| {
        event.turn_id.as_deref() == Some(turn.turn_id.as_str())
            && event.event_type == "message.delta"
    }) {
        if let Some(delta) = raw_string_field(
            &event.payload,
            &[
                "text",
                "delta",
                "content",
                "message",
                "outputText",
                "output_text",
            ],
        ) {
            text.push_str(&delta);
            timestamp_value = Some(event.timestamp.as_str());
        }
    }
    let text = text.trim();
    if text.is_empty() {
        return None;
    }

    Some(json!({
        "id": format!("{}:assistant", turn.turn_id),
        "role": "assistant",
        "runtimeTurnId": turn.turn_id,
        "runtime_turn_id": turn.turn_id,
        "content": [
            {
                "type": "text",
                "text": text,
            }
        ],
        "timestamp": timestamp_seconds(timestamp_value.or(turn.completed_at.as_deref())),
    }))
}

fn runtime_error_items_from_events(stored: &StoredSession) -> Vec<serde_json::Value> {
    stored
        .events
        .iter()
        .filter(|event| matches!(event.event_type.as_str(), "turn.failed" | "runtime.error"))
        .filter_map(|event| {
            let message = runtime_error_message_from_event(event)?;
            let turn_id = event
                .turn_id
                .clone()
                .or_else(|| stored.turns.last().map(|turn| turn.turn_id.clone()))?;
            Some(json!({
                "id": format!("{}:error:{}", turn_id, event.event_id),
                "thread_id": event.thread_id.clone().unwrap_or_else(|| stored.session.thread_id.clone()),
                "turn_id": turn_id,
                "sequence": event.sequence,
                "type": "error",
                "status": "failed",
                "message": message,
                "started_at": event.timestamp,
                "completed_at": event.timestamp,
                "updated_at": event.timestamp,
            }))
        })
        .collect()
}

fn runtime_error_message_from_event(event: &AgentEvent) -> Option<String> {
    if !matches!(event.event_type.as_str(), "turn.failed" | "runtime.error") {
        return None;
    }
    raw_string_field(
        &event.payload,
        &[
            "message",
            "error",
            "reason",
            "detail",
            "details",
            "error_message",
            "errorMessage",
        ],
    )
    .map(|message| message.trim().to_string())
    .filter(|message| !message.is_empty())
}

fn latest_turn_error_message(stored: &StoredSession, turn_id: Option<&str>) -> Option<String> {
    stored
        .events
        .iter()
        .rev()
        .filter(|event| match turn_id {
            Some(turn_id) => event.turn_id.as_deref() == Some(turn_id),
            None => true,
        })
        .find_map(runtime_error_message_from_event)
}

fn runtime_thread_read_from_stored_session(stored: &StoredSession) -> serde_json::Value {
    let coding_activity = coding_activity_projection::coding_activity_from_events(stored);
    let model_routing = latest_model_routing_from_events(&stored.events);
    let service_model_slot = model_routing
        .as_ref()
        .and_then(|routing| string_field(routing, &["serviceModelSlot", "service_model_slot"]));
    let latest_turn_status = stored
        .turns
        .last()
        .map(|turn| agent_turn_status_label(turn.status));
    let latest_turn_id = stored.turns.last().map(|turn| turn.turn_id.as_str());
    let latest_turn_error_message = latest_turn_error_message(stored, latest_turn_id);
    let active_turn_id = stored
        .turns
        .iter()
        .rev()
        .find(|turn| agent_turn_is_active(turn.status))
        .map(|turn| turn.turn_id.clone());
    let pending_request_count = coding_activity.pending_requests.len();
    let command_count = coding_activity.commands.len();
    let test_count = coding_activity.tests.len();
    let changed_file_count = coding_activity
        .change_summary
        .as_ref()
        .and_then(|summary| summary.get("changed_file_count"))
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    let patch_count = coding_activity
        .change_summary
        .as_ref()
        .and_then(|summary| summary.get("patch_count"))
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    json!({
        "session_id": stored.session.session_id,
        "thread_id": stored.session.thread_id,
        "status": agent_session_status_label(stored.session.status),
        "execution_strategy": session_execution_strategy(&stored.session),
        "turns": stored.turns,
        "pending_requests": coding_activity.pending_requests,
        "queued_turns": stored.turns
            .iter()
            .filter(|turn| matches!(turn.status, AgentTurnStatus::Queued))
            .collect::<Vec<_>>(),
        "active_turn_id": active_turn_id,
        "active_command_id": coding_activity.active_command_id,
        "active_test_run_id": coding_activity.active_test_run_id,
        "active_action_id": coding_activity.active_action_id,
        "tool_calls": tool_calls_from_events(&stored.events),
        "commands": coding_activity.commands,
        "tests": coding_activity.tests,
        "change_summary": coding_activity.change_summary,
        "model_routing": model_routing.clone(),
        "service_model_slot": service_model_slot.clone(),
        "artifacts": artifact_projection::stored_artifact_summaries_for_turn(stored, None),
        "outputs": output_refs::read_model_outputs(stored.output_blobs.values(), None),
        "diagnostics": {
            "latest_turn_status": latest_turn_status,
            "latest_turn_error_message": latest_turn_error_message,
            "pending_request_count": pending_request_count,
            "command_count": command_count,
            "test_count": test_count,
            "changed_file_count": changed_file_count,
            "patch_count": patch_count,
        },
        "runtime_summary": {
            "latestTurnStatus": latest_turn_status,
            "latestTurnErrorMessage": latest_turn_error_message,
            "decisionSource": model_routing
                .as_ref()
                .and_then(|routing| string_field(routing, &["decisionSource", "decision_source"])),
            "serviceModelSlot": service_model_slot,
        },
    })
}

fn latest_model_routing_from_events(events: &[AgentEvent]) -> Option<serde_json::Value> {
    events
        .iter()
        .rev()
        .find(|event| {
            matches!(
                event.event_type.as_str(),
                "routing.decision.made" | "routing.fallback.applied" | "routing.not_possible"
            )
        })
        .map(model_routing_from_event)
}

fn model_routing_from_event(event: &AgentEvent) -> serde_json::Value {
    let mut routing = event
        .payload
        .get("routingDecision")
        .or_else(|| event.payload.get("routing_decision"))
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_else(|| event.payload.as_object().cloned().unwrap_or_default());

    merge_optional_payload_value(&mut routing, &event.payload, "modelSlot", "modelSlot");
    merge_optional_payload_value(&mut routing, &event.payload, "model_slot", "model_slot");
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "providerReadiness",
        "providerReadiness",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "provider_readiness",
        "provider_readiness",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "modelRegistry",
        "modelRegistry",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "model_registry",
        "model_registry",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "fallbackApplied",
        "fallbackApplied",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "fallback_applied",
        "fallback_applied",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "routingAttempts",
        "routingAttempts",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "routing_attempts",
        "routing_attempts",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "requestedSelection",
        "requestedSelection",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "requested_selection",
        "requested_selection",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "modelTaskRequest",
        "modelTaskRequest",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "model_task_request",
        "model_task_request",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "resolvedRoute",
        "resolvedRoute",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "resolved_route",
        "resolved_route",
    );
    merge_optional_payload_value(&mut routing, &event.payload, "routeFailure", "routeFailure");
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "route_failure",
        "route_failure",
    );
    routing.insert(
        "sourceEventId".to_string(),
        serde_json::Value::String(event.event_id.clone()),
    );
    routing.insert(
        "source_event_id".to_string(),
        serde_json::Value::String(event.event_id.clone()),
    );
    routing.insert(
        "sourceEventType".to_string(),
        serde_json::Value::String(event.event_type.clone()),
    );
    routing.insert(
        "source_event_type".to_string(),
        serde_json::Value::String(event.event_type.clone()),
    );
    routing.insert(
        "timestamp".to_string(),
        serde_json::Value::String(event.timestamp.clone()),
    );
    if event.event_type == "routing.not_possible" {
        routing.insert(
            "status".to_string(),
            serde_json::Value::String("blocked".to_string()),
        );
    }

    serde_json::Value::Object(routing)
}

fn merge_optional_payload_value(
    routing: &mut serde_json::Map<String, serde_json::Value>,
    payload: &serde_json::Value,
    output_key: &str,
    payload_key: &str,
) {
    if let Some(value) = payload.get(payload_key) {
        routing.insert(output_key.to_string(), value.clone());
    }
}

pub(super) fn replayed_action_required_from_stored_session(
    stored: &StoredSession,
    request_id: &str,
) -> Option<AgentSessionReplayedActionRequired> {
    let request_id = request_id.trim();
    if request_id.is_empty() {
        return None;
    }

    let mut resolved = false;
    for event in stored.events.iter().rev() {
        if event_request_id(&event.payload).as_deref() != Some(request_id) {
            continue;
        }
        match event.event_type.as_str() {
            "action.resolved" => {
                resolved = true;
            }
            "action.required" if !resolved => {
                return replayed_action_required_from_event(stored, event, request_id);
            }
            _ => {}
        }
    }
    None
}

fn replayed_action_required_from_event(
    stored: &StoredSession,
    event: &AgentEvent,
    request_id: &str,
) -> Option<AgentSessionReplayedActionRequired> {
    let action_type = event_action_type(&event.payload)?;
    let data = event.payload.get("data").unwrap_or(&event.payload);
    let prompt = string_field(data, &["prompt", "message"])
        .or_else(|| string_field(&event.payload, &["prompt", "message"]));
    Some(AgentSessionReplayedActionRequired {
        event_type: "action_required".to_string(),
        request_id: request_id.to_string(),
        action_type,
        tool_name: string_field(data, &["toolName", "tool_name"])
            .or_else(|| string_field(&event.payload, &["toolName", "tool_name"])),
        arguments: data
            .get("arguments")
            .cloned()
            .or_else(|| event.payload.get("arguments").cloned()),
        prompt,
        questions: data
            .get("questions")
            .cloned()
            .or_else(|| event.payload.get("questions").cloned()),
        requested_schema: data
            .get("requestedSchema")
            .cloned()
            .or_else(|| data.get("requested_schema").cloned())
            .or_else(|| event.payload.get("requestedSchema").cloned())
            .or_else(|| event.payload.get("requested_schema").cloned()),
        scope: replayed_action_scope(stored, event),
    })
}

fn replayed_action_scope(
    stored: &StoredSession,
    event: &AgentEvent,
) -> Option<AgentSessionActionScope> {
    let scope = event.payload.get("scope");
    let session_id = scope
        .and_then(|value| string_field(value, &["sessionId", "session_id"]))
        .or_else(|| Some(stored.session.session_id.clone()));
    let thread_id = scope
        .and_then(|value| string_field(value, &["threadId", "thread_id"]))
        .or_else(|| event.thread_id.clone())
        .or_else(|| Some(stored.session.thread_id.clone()));
    let turn_id = scope
        .and_then(|value| string_field(value, &["turnId", "turn_id"]))
        .or_else(|| event.turn_id.clone());
    if session_id.is_none() && thread_id.is_none() && turn_id.is_none() {
        return None;
    }
    Some(AgentSessionActionScope {
        session_id,
        thread_id,
        turn_id,
    })
}

fn event_action_type(payload: &serde_json::Value) -> Option<AgentSessionActionType> {
    match string_field(payload, &["actionType", "action_type"])?.as_str() {
        "tool_confirmation" => Some(AgentSessionActionType::ToolConfirmation),
        "ask_user" => Some(AgentSessionActionType::AskUser),
        "elicitation" => Some(AgentSessionActionType::Elicitation),
        _ => None,
    }
}

fn tool_calls_from_events(events: &[AgentEvent]) -> Vec<serde_json::Value> {
    let mut calls: Vec<serde_json::Value> = Vec::new();
    for event in events {
        let Some(tool_call) = tool_call_from_event(event) else {
            continue;
        };
        let call_id = tool_call_id_from_event_payload(&event.payload);
        let tool_name = string_field(&tool_call, &["tool_name", "toolName", "name"]);
        if let Some(existing) = calls.iter_mut().find(|existing| {
            if let Some(call_id) = call_id.as_deref() {
                string_field(existing, &["id", "tool_call_id", "toolCallId"]).as_deref()
                    == Some(call_id)
            } else if let Some(tool_name) = tool_name.as_deref() {
                string_field(existing, &["tool_name", "toolName", "name"]).as_deref()
                    == Some(tool_name)
                    && string_field(existing, &["turn_id", "turnId"]).as_deref()
                        == event.turn_id.as_deref()
            } else {
                false
            }
        }) {
            merge_tool_call(existing, tool_call);
        } else {
            calls.push(tool_call);
        }
    }
    calls
}

fn tool_call_id_from_event_payload(payload: &serde_json::Value) -> Option<String> {
    string_field(
        payload,
        &["id", "tool_call_id", "toolCallId", "toolId", "tool_id"],
    )
}

fn tool_call_from_event(event: &AgentEvent) -> Option<serde_json::Value> {
    let status = match event.event_type.as_str() {
        "tool.started" => "running",
        "tool.result" => "completed",
        "tool.failed" => "failed",
        _ => return None,
    };
    let payload = &event.payload;
    let mut record = serde_json::Map::new();
    let id = tool_call_id_from_event_payload(payload).unwrap_or_else(|| event.event_id.clone());
    record.insert("id".to_string(), json!(id));
    if let Some(tool_name) = string_field(payload, &["tool_name", "toolName", "name"]) {
        record.insert("tool_name".to_string(), json!(tool_name));
    }
    if let Some(arguments) = payload.get("arguments").cloned() {
        record.insert("arguments".to_string(), arguments);
    }
    record.insert("status".to_string(), json!(status));
    record.insert(
        "success".to_string(),
        json!(event.event_type.as_str() != "tool.failed"),
    );
    if let Some(output) = tool_output_from_event_payload(payload) {
        record.insert("output_preview".to_string(), json!(output));
        record.insert("output".to_string(), json!(output));
    }
    if let Some(output_ref) = string_field(payload, &["outputRef", "output_ref"]) {
        record.insert("output_ref".to_string(), json!(output_ref));
    }
    let ref_ids = string_array_field(payload, &["refIds", "ref_ids"]);
    if !ref_ids.is_empty() {
        record.insert("ref_ids".to_string(), json!(ref_ids));
    }
    if let Some(output_truncated) = payload
        .get("outputTruncated")
        .or_else(|| payload.get("output_truncated"))
        .and_then(serde_json::Value::as_bool)
    {
        record.insert("output_truncated".to_string(), json!(output_truncated));
    }
    if let Some(output_bytes) = payload
        .get("outputBytes")
        .or_else(|| payload.get("output_bytes"))
        .and_then(serde_json::Value::as_u64)
    {
        record.insert("output_bytes".to_string(), json!(output_bytes));
    }
    if let Some(error) = payload.get("error").cloned() {
        record.insert("error".to_string(), error);
    }
    record.insert("event_id".to_string(), json!(event.event_id));
    record.insert("turn_id".to_string(), json!(event.turn_id));
    record.insert("timestamp".to_string(), json!(event.timestamp));
    Some(serde_json::Value::Object(record))
}

fn merge_tool_call(existing: &mut serde_json::Value, next: serde_json::Value) {
    let (Some(existing), Some(next)) = (existing.as_object_mut(), next.as_object()) else {
        return;
    };
    for (key, value) in next {
        if value.is_null() {
            continue;
        }
        existing.insert(key.clone(), value.clone());
    }
}

fn tool_output_from_event_payload(payload: &serde_json::Value) -> Option<String> {
    string_field(
        payload,
        &[
            "output",
            "output_preview",
            "outputPreview",
            "text",
            "content",
            "result",
        ],
    )
    .or_else(|| {
        payload
            .get("result")
            .filter(|value| !value.is_string() && !value.is_null())
            .map(|value| value.to_string())
    })
}

fn session_execution_strategy(session: &AgentSession) -> Option<String> {
    session.business_object_ref.as_ref().and_then(|reference| {
        super::metadata_string(reference.metadata.as_ref(), "executionStrategy")
            .or_else(|| super::metadata_string(reference.metadata.as_ref(), "execution_strategy"))
    })
}

fn session_working_dir(session: &AgentSession) -> Option<String> {
    session.business_object_ref.as_ref().and_then(|reference| {
        super::metadata_string(reference.metadata.as_ref(), "workingDir")
            .or_else(|| super::metadata_string(reference.metadata.as_ref(), "working_dir"))
    })
}

fn session_execution_runtime(session: &AgentSession) -> serde_json::Value {
    let metadata = session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref());
    let runtime = json!({
        "session_id": session.session_id,
        "provider_selector": metadata_string_alias(metadata, &["providerSelector", "provider_selector"]),
        "provider_name": metadata_string_alias(metadata, &["providerName", "provider_name"]),
        "model_name": metadata_string_alias(metadata, &["modelName", "model_name", "model"]),
        "cwd": metadata_string_alias(metadata, &["cwd", "workingDir", "working_dir"]),
        "working_dir": metadata_string_alias(metadata, &["workingDir", "working_dir", "cwd"]),
        "reasoning_effort": metadata_string_alias(metadata, &["reasoningEffort", "reasoning_effort"]),
        "approval_policy": metadata_string_alias(metadata, &["approvalPolicy", "approval_policy"]),
        "approvals_reviewer": metadata_string_alias(metadata, &["approvalsReviewer", "approvals_reviewer"]),
        "sandbox_policy": metadata_value_alias(metadata, &["sandboxPolicy", "sandbox_policy"]),
        "service_tier": metadata_string_alias(metadata, &["serviceTier", "service_tier"]),
        "thread_source": metadata_string_alias(metadata, &["threadSource", "thread_source"]),
        "memory_mode": metadata_string_alias(metadata, &["memoryMode", "memory_mode"]),
        "agent_path": metadata_string_alias(metadata, &["agentPath", "agent_path"]),
        "source_client": metadata_string_alias(metadata, &["sourceClient", "source_client"]),
        "source_thread_id": metadata_string_alias(metadata, &["sourceThreadId", "source_thread_id"]),
        "imported_thread_settings": metadata_value_alias(metadata, &["importedThreadSettings", "imported_thread_settings"]),
        "imported_continuation": metadata_value_alias(metadata, &["importedContinuation", "imported_continuation"]),
        "execution_strategy": session_execution_strategy(session),
        "recent_access_mode": metadata_string_alias(metadata, &["recentAccessMode", "recent_access_mode"]),
        "recent_preferences": metadata_value_alias(metadata, &["recentPreferences", "recent_preferences"]),
        "recent_team_selection": metadata_value_alias(metadata, &["recentTeamSelection", "recent_team_selection"]),
        "source": "session_metadata",
        "mode": "current",
    });
    compact_json_nulls(runtime)
}

fn metadata_string_alias(metadata: Option<&serde_json::Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| super::metadata_string(metadata, key))
}

fn metadata_value_alias(
    metadata: Option<&serde_json::Value>,
    keys: &[&str],
) -> Option<serde_json::Value> {
    let metadata = metadata?;
    keys.iter()
        .find_map(|key| metadata.get(*key))
        .filter(|value| !value.is_null())
        .cloned()
}

fn compact_json_nulls(value: serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => serde_json::Value::Object(
            map.into_iter()
                .filter_map(|(key, value)| {
                    let value = compact_json_nulls(value);
                    (!value.is_null()).then_some((key, value))
                })
                .collect(),
        ),
        serde_json::Value::Array(values) => {
            serde_json::Value::Array(values.into_iter().map(compact_json_nulls).collect())
        }
        value => value,
    }
}
