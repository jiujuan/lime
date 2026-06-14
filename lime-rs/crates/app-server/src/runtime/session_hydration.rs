use super::output_refs;
use super::StoredSession;
use app_server_protocol::AgentEvent;
use app_server_protocol::AgentSessionReadResponse;
use serde_json::{json, Value};
use std::collections::HashSet;

pub(in crate::runtime) fn hydrated_stored_session_from_response(
    response: AgentSessionReadResponse,
) -> StoredSession {
    let events = hydrated_events_from_detail(response.detail.as_ref());
    let output_blobs = hydrated_output_blobs_from_detail(response.detail.as_ref(), &events);
    StoredSession {
        session: response.session,
        turns: response.turns,
        turn_inputs: Default::default(),
        turn_runtime_options: Default::default(),
        events,
        output_blobs,
    }
}

fn hydrated_events_from_detail(detail: Option<&Value>) -> Vec<AgentEvent> {
    let Some(detail) = detail else {
        return Vec::new();
    };
    let mut events = explicit_events_from_detail(detail).unwrap_or_default();
    events.extend(file_changed_events_from_items(detail));
    let existing_events = events.clone();
    events.extend(coding_activity_events_from_detail(detail, &existing_events));
    dedupe_events(events)
}

fn explicit_events_from_detail(detail: &Value) -> Option<Vec<AgentEvent>> {
    let events = detail
        .get("events")
        .or_else(|| detail.pointer("/thread_read/events"))
        .and_then(Value::as_array)?;
    let mut hydrated = Vec::new();
    for value in events {
        let event_value = normalize_event_value(value.clone());
        if let Ok(event) = serde_json::from_value::<AgentEvent>(event_value) {
            hydrated.push(event);
        }
    }
    hydrated.sort_by_key(|event| event.sequence);
    Some(hydrated)
}

fn normalize_event_value(mut value: Value) -> Value {
    let Value::Object(object) = &mut value else {
        return value;
    };
    if !object.contains_key("type") {
        if let Some(event_type) = object
            .get("eventType")
            .or_else(|| object.get("event_type"))
            .cloned()
        {
            object.insert("type".to_string(), event_type);
        }
    }
    value
}

fn dedupe_events(mut events: Vec<AgentEvent>) -> Vec<AgentEvent> {
    events.sort_by_key(|event| event.sequence);
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for event in events {
        if seen.insert(event.event_id.clone()) {
            deduped.push(event);
        }
    }
    deduped
}

fn file_changed_events_from_items(detail: &Value) -> Vec<AgentEvent> {
    let Some(items) = detail.get("items").and_then(Value::as_array) else {
        return Vec::new();
    };
    let session_id = detail_string(detail, &["session_id", "id"]).unwrap_or_default();
    let thread_id = detail_string(detail, &["thread_id", "threadId"]);
    let mut events = Vec::new();
    for item in items {
        let Some(event) = file_changed_event_from_item(item, &session_id, thread_id.as_deref())
        else {
            continue;
        };
        events.push(event);
    }
    events.sort_by_key(|event| event.sequence);
    events
}

fn coding_activity_events_from_detail(detail: &Value, existing: &[AgentEvent]) -> Vec<AgentEvent> {
    let session_id = detail_string(detail, &["session_id", "id"]).unwrap_or_default();
    let thread_id = detail_string(detail, &["thread_id", "threadId"]);
    let mut events = Vec::new();
    let mut sequence = next_generated_sequence(existing);

    for command in detail_arrays(detail, &["commands"], &["thread_read", "commands"]) {
        if let Some(command_id) =
            value_string_from_keys(command, &["command_id", "commandId", "id"])
        {
            if existing.iter().any(|event| {
                event.event_type.starts_with("command.")
                    && event_command_id(event).as_deref() == Some(command_id.as_str())
            }) {
                continue;
            }
            events.extend(command_events_from_read_model(
                command,
                &session_id,
                thread_id.as_deref(),
                &command_id,
                &mut sequence,
            ));
        }
    }

    for test in detail_arrays(detail, &["tests"], &["thread_read", "tests"]) {
        if let Some(test_run_id) = value_string_from_keys(test, &["test_run_id", "testRunId", "id"])
        {
            if existing.iter().any(|event| {
                event.event_type.starts_with("test.")
                    && event_test_run_id(event).as_deref() == Some(test_run_id.as_str())
            }) {
                continue;
            }
            events.extend(test_events_from_read_model(
                test,
                &session_id,
                thread_id.as_deref(),
                &test_run_id,
                &mut sequence,
            ));
        }
    }

    for request in detail_arrays(
        detail,
        &["pending_requests"],
        &["thread_read", "pending_requests"],
    ) {
        if let Some(request_id) =
            value_string_from_keys(request, &["id", "request_id", "requestId"])
        {
            if existing.iter().any(|event| {
                event.event_type == "action.required"
                    && event_request_id_from_payload(&event.payload).as_deref()
                        == Some(request_id.as_str())
            }) {
                continue;
            }
            if let Some(event) = action_required_event_from_read_model(
                request,
                &session_id,
                thread_id.as_deref(),
                &request_id,
                &mut sequence,
            ) {
                events.push(event);
            }
        }
    }

    events
}

fn file_changed_event_from_item(
    item: &Value,
    session_id: &str,
    thread_id: Option<&str>,
) -> Option<AgentEvent> {
    if item_string(item, &["type"]).as_deref() != Some("file_artifact") {
        return None;
    }
    let path = item_string(item, &["path"])?;
    let metadata = item.get("metadata");
    let checkpoint_id = item_string(item, &["id"])
        .or_else(|| metadata_string(metadata, &["checkpointRef", "artifactVersionId"]))?;
    let sequence = item
        .get("sequence")
        .and_then(Value::as_i64)
        .and_then(|value| u64::try_from(value).ok())
        .or_else(|| metadata_u64(metadata, &["artifactVersionNo", "sequence"]))
        .unwrap_or_default();
    let event_id = metadata_string(metadata, &["artifactRequestId", "eventId"])
        .unwrap_or_else(|| item_string(item, &["id"]).unwrap_or_else(|| checkpoint_id.clone()));
    let mut payload = json!({
        "path": path,
        "artifactId": metadata_string(metadata, &["artifactId"])
            .unwrap_or_else(|| checkpoint_id.clone()),
        "checkpointRef": metadata_string(metadata, &["checkpointRef"])
            .unwrap_or_else(|| checkpoint_id.clone()),
    });
    copy_optional_payload_string(metadata, &mut payload, "contentRef", &["contentRef"]);
    copy_optional_payload_string(metadata, &mut payload, "diffRef", &["diffRef"]);
    copy_optional_payload_string(
        metadata,
        &mut payload,
        "checkpointSnapshotFile",
        &["checkpointSnapshotFile"],
    );
    if let Some(file_change) = metadata.and_then(|metadata| metadata.get("file_change")) {
        payload["change"] = file_change.clone();
    }
    if let Some(diff) = metadata.and_then(|metadata| metadata.get("artifactVersionDiff")) {
        payload["diff"] = diff.clone();
    }

    Some(AgentEvent {
        event_id,
        sequence,
        session_id: session_id.to_string(),
        thread_id: thread_id.map(ToString::to_string),
        turn_id: item_string(item, &["turn_id", "turnId"]),
        event_type: "file.changed".to_string(),
        timestamp: item_string(
            item,
            &["updated_at", "updatedAt", "completed_at", "completedAt"],
        )
        .unwrap_or_default(),
        payload,
    })
}

fn command_events_from_read_model(
    command: &Value,
    session_id: &str,
    thread_id: Option<&str>,
    command_id: &str,
    sequence: &mut u64,
) -> Vec<AgentEvent> {
    let turn_id = value_string_from_keys(command, &["turn_id", "turnId"]);
    let started_at = value_string_from_keys(
        command,
        &["started_at", "startedAt", "updated_at", "updatedAt"],
    )
    .unwrap_or_default();
    let completed_at = value_string_from_keys(
        command,
        &["completed_at", "completedAt", "updated_at", "updatedAt"],
    )
    .unwrap_or_else(|| started_at.clone());
    let status =
        value_string_from_keys(command, &["status"]).unwrap_or_else(|| "running".to_string());
    let mut events = Vec::new();
    let mut started_payload = json!({
        "commandId": command_id,
    });
    copy_optional_value(command, &mut started_payload, "command", &["command"]);
    copy_optional_value(
        command,
        &mut started_payload,
        "cwd",
        &["cwd", "workingDirectory", "working_dir"],
    );
    events.push(generated_event(
        "command.started",
        session_id,
        thread_id,
        turn_id.as_deref(),
        command_id,
        "started",
        *sequence,
        started_at,
        started_payload,
    ));
    *sequence += 1;

    let output_refs =
        read_string_array(command, &["output_refs", "outputRefs", "refIds", "ref_ids"]);
    if !output_refs.is_empty() {
        events.push(generated_event(
            "command.output",
            session_id,
            thread_id,
            turn_id.as_deref(),
            command_id,
            "output",
            *sequence,
            completed_at.clone(),
            json!({
                "commandId": command_id,
                "refIds": output_refs,
                "outputPreview": value_string_from_keys(command, &["output_preview", "outputPreview", "preview"]),
            }),
        ));
        *sequence += 1;
    }

    if status != "running" {
        let mut exited_payload = json!({
            "commandId": command_id,
            "status": status,
        });
        if let Some(exit_code) = value_i64_from_keys(command, &["exit_code", "exitCode"]) {
            exited_payload["exitCode"] = Value::from(exit_code);
        }
        events.push(generated_event(
            "command.exited",
            session_id,
            thread_id,
            turn_id.as_deref(),
            command_id,
            "exited",
            *sequence,
            completed_at,
            exited_payload,
        ));
        *sequence += 1;
    }

    events
}

fn test_events_from_read_model(
    test: &Value,
    session_id: &str,
    thread_id: Option<&str>,
    test_run_id: &str,
    sequence: &mut u64,
) -> Vec<AgentEvent> {
    let turn_id = value_string_from_keys(test, &["turn_id", "turnId"]);
    let started_at = value_string_from_keys(
        test,
        &["started_at", "startedAt", "updated_at", "updatedAt"],
    )
    .unwrap_or_default();
    let completed_at = value_string_from_keys(
        test,
        &["completed_at", "completedAt", "updated_at", "updatedAt"],
    )
    .unwrap_or_else(|| started_at.clone());
    let status = value_string_from_keys(test, &["status"]).unwrap_or_else(|| "running".to_string());
    let mut events = Vec::new();
    let mut started_payload = json!({
        "testRunId": test_run_id,
    });
    copy_optional_value(
        test,
        &mut started_payload,
        "commandId",
        &["command_id", "commandId"],
    );
    copy_optional_value(test, &mut started_payload, "suite", &["suite"]);
    events.push(generated_event(
        "test.started",
        session_id,
        thread_id,
        turn_id.as_deref(),
        test_run_id,
        "started",
        *sequence,
        started_at,
        started_payload,
    ));
    *sequence += 1;

    if status != "running" {
        let mut completed_payload = json!({
            "testRunId": test_run_id,
            "result": value_string_from_keys(test, &["result"]).unwrap_or_else(|| status.clone()),
        });
        copy_optional_value(
            test,
            &mut completed_payload,
            "commandId",
            &["command_id", "commandId"],
        );
        copy_optional_i64(test, &mut completed_payload, "passed", &["passed"]);
        copy_optional_i64(test, &mut completed_payload, "failed", &["failed"]);
        let output_refs =
            read_string_array(test, &["output_refs", "outputRefs", "refIds", "ref_ids"]);
        if !output_refs.is_empty() {
            completed_payload["refIds"] = json!(output_refs);
        }
        copy_optional_value(
            test,
            &mut completed_payload,
            "failureCategory",
            &["failure_category", "failureCategory"],
        );
        events.push(generated_event(
            "test.completed",
            session_id,
            thread_id,
            turn_id.as_deref(),
            test_run_id,
            "completed",
            *sequence,
            completed_at,
            completed_payload,
        ));
        *sequence += 1;
    }

    events
}

fn action_required_event_from_read_model(
    request: &Value,
    session_id: &str,
    thread_id: Option<&str>,
    request_id: &str,
    sequence: &mut u64,
) -> Option<AgentEvent> {
    let status = value_string_from_keys(request, &["status"]).unwrap_or_default();
    if !status.is_empty() && status != "pending" && status != "waiting" {
        return None;
    }
    let payload = request
        .get("payload")
        .cloned()
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({}));
    let mut payload = match payload {
        Value::Object(object) => Value::Object(object),
        _ => json!({}),
    };
    payload["requestId"] = Value::String(request_id.to_string());
    payload["actionId"] = Value::String(request_id.to_string());
    payload["actionType"] = Value::String(
        value_string_from_keys(request, &["request_type", "requestType"])
            .or_else(|| value_string_from_keys(&payload, &["actionType", "action_type"]))
            .unwrap_or_else(|| "ask_user".to_string()),
    );
    if payload.get("prompt").is_none() {
        if let Some(title) = value_string_from_keys(request, &["title"]) {
            payload["prompt"] = Value::String(title);
        }
    }
    let turn_id = value_string_from_keys(request, &["turn_id", "turnId"]).or_else(|| {
        request
            .get("scope")
            .and_then(|scope| value_string_from_keys(scope, &["turn_id", "turnId"]))
    });
    let timestamp = value_string_from_keys(
        request,
        &["created_at", "createdAt", "updated_at", "updatedAt"],
    )
    .unwrap_or_default();
    let event = generated_event(
        "action.required",
        session_id,
        thread_id,
        turn_id.as_deref(),
        request_id,
        "required",
        *sequence,
        timestamp,
        payload,
    );
    *sequence += 1;
    Some(event)
}

fn generated_event(
    event_type: &str,
    session_id: &str,
    thread_id: Option<&str>,
    turn_id: Option<&str>,
    scope_id: &str,
    suffix: &str,
    sequence: u64,
    timestamp: String,
    payload: Value,
) -> AgentEvent {
    AgentEvent {
        event_id: format!("evt_hydrated_{event_type}_{scope_id}_{suffix}").replace('.', "_"),
        sequence,
        session_id: session_id.to_string(),
        thread_id: thread_id.map(ToString::to_string),
        turn_id: turn_id.map(ToString::to_string),
        event_type: event_type.to_string(),
        timestamp,
        payload,
    }
}

fn hydrated_output_blobs_from_detail(
    detail: Option<&Value>,
    events: &[AgentEvent],
) -> std::collections::HashMap<String, output_refs::OutputBlobRecord> {
    let mut outputs = std::collections::HashMap::new();
    for event in events {
        if let Some(record) = output_refs::output_record_from_event(event) {
            outputs.insert(record.output_ref.clone(), record);
        }
    }

    let Some(detail) = detail else {
        return outputs;
    };
    for value in detail_outputs(detail) {
        if let Some(record) = output_refs::output_record_from_read_model(value) {
            outputs.insert(record.output_ref.clone(), record);
        }
    }
    outputs
}

fn detail_outputs(detail: &Value) -> Vec<&Value> {
    let mut outputs = Vec::new();
    if let Some(values) = detail.get("outputs").and_then(Value::as_array) {
        outputs.extend(values);
    }
    if let Some(values) = detail
        .pointer("/thread_read/outputs")
        .and_then(Value::as_array)
    {
        outputs.extend(values);
    }
    outputs
}

fn copy_optional_payload_string(
    metadata: Option<&Value>,
    payload: &mut Value,
    key: &str,
    keys: &[&str],
) {
    let Some(value) = metadata_string(metadata, keys) else {
        return;
    };
    payload[key] = Value::String(value);
}

fn copy_optional_value(source: &Value, payload: &mut Value, key: &str, keys: &[&str]) {
    let Some(value) = value_string_from_keys(source, keys) else {
        return;
    };
    payload[key] = Value::String(value);
}

fn copy_optional_i64(source: &Value, payload: &mut Value, key: &str, keys: &[&str]) {
    let Some(value) = value_i64_from_keys(source, keys) else {
        return;
    };
    payload[key] = Value::from(value);
}

fn detail_arrays<'a>(
    detail: &'a Value,
    top_level_keys: &[&str],
    thread_read_path: &[&str],
) -> Vec<&'a Value> {
    let mut values = Vec::new();
    for key in top_level_keys {
        if let Some(items) = detail.get(*key).and_then(Value::as_array) {
            values.extend(items);
        }
    }
    if let Some(items) = value_at_path(detail, thread_read_path).and_then(Value::as_array) {
        values.extend(items);
    }
    values
}

fn value_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    Some(current)
}

fn next_generated_sequence(existing: &[AgentEvent]) -> u64 {
    existing
        .iter()
        .map(|event| event.sequence)
        .max()
        .unwrap_or_default()
        .saturating_add(1)
}

fn event_command_id(event: &AgentEvent) -> Option<String> {
    value_string_from_keys(
        &event.payload,
        &[
            "commandId",
            "command_id",
            "toolCallId",
            "tool_call_id",
            "id",
        ],
    )
}

fn event_test_run_id(event: &AgentEvent) -> Option<String> {
    value_string_from_keys(
        &event.payload,
        &[
            "testRunId",
            "test_run_id",
            "toolCallId",
            "tool_call_id",
            "id",
        ],
    )
}

fn event_request_id_from_payload(payload: &Value) -> Option<String> {
    value_string_from_keys(
        payload,
        &["requestId", "request_id", "actionId", "action_id", "id"],
    )
}

fn value_string_from_keys(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(value_string)
}

fn value_i64_from_keys(value: &Value, keys: &[&str]) -> Option<i64> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_i64)
}

fn read_string_array(value: &Value, keys: &[&str]) -> Vec<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .flat_map(|value| match value {
            Value::Array(values) => values.iter().filter_map(value_string).collect::<Vec<_>>(),
            Value::String(value) => {
                let value = value.trim();
                if value.is_empty() {
                    Vec::new()
                } else {
                    vec![value.to_string()]
                }
            }
            _ => Vec::new(),
        })
        .collect()
}

fn detail_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(value_string)
}

fn item_string(value: &Value, keys: &[&str]) -> Option<String> {
    detail_string(value, keys)
}

fn metadata_string(metadata: Option<&Value>, keys: &[&str]) -> Option<String> {
    let metadata = metadata?;
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(value_string)
        .or_else(|| {
            metadata.get("file_change").and_then(|file_change| {
                keys.iter()
                    .filter_map(|key| file_change.get(*key))
                    .find_map(value_string)
            })
        })
}

fn metadata_u64(metadata: Option<&Value>, keys: &[&str]) -> Option<u64> {
    let metadata = metadata?;
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(|value| value.as_u64())
}

fn value_string(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}
