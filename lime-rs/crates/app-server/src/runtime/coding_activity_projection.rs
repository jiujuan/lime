use super::status::agent_turn_is_active;
use super::string_array_field;
use super::string_field;
use super::StoredSession;
use app_server_protocol::AgentEvent;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Default)]
pub(super) struct CodingActivityProjection {
    pub(super) commands: Vec<Value>,
    pub(super) tests: Vec<Value>,
    pub(super) pending_requests: Vec<Value>,
    pub(super) active_command_id: Option<String>,
    pub(super) active_test_run_id: Option<String>,
    pub(super) active_action_id: Option<String>,
}

#[derive(Debug, Clone)]
struct CommandState {
    command_id: String,
    turn_id: Option<String>,
    status: String,
    command: Option<String>,
    cwd: Option<String>,
    exit_code: Option<i64>,
    output_refs: Vec<String>,
    output_preview: Option<String>,
    started_at: Option<String>,
    completed_at: Option<String>,
    updated_at: Option<String>,
    source_event_ids: Vec<String>,
    sequence: u64,
}

#[derive(Debug, Clone)]
struct TestState {
    test_run_id: String,
    turn_id: Option<String>,
    status: String,
    command_id: Option<String>,
    suite: Option<String>,
    result: Option<String>,
    passed: Option<i64>,
    failed: Option<i64>,
    output_refs: Vec<String>,
    failure_category: Option<String>,
    started_at: Option<String>,
    completed_at: Option<String>,
    updated_at: Option<String>,
    source_event_ids: Vec<String>,
    sequence: u64,
}

#[derive(Debug, Clone)]
struct PendingActionState {
    request_id: String,
    thread_id: String,
    turn_id: Option<String>,
    request_type: String,
    status: String,
    title: Option<String>,
    payload: Value,
    scope: Value,
    created_at: Option<String>,
    source_event_id: String,
    sequence: u64,
}

pub(super) fn coding_activity_from_events(stored: &StoredSession) -> CodingActivityProjection {
    let mut commands: HashMap<String, CommandState> = HashMap::new();
    let mut tests: HashMap<String, TestState> = HashMap::new();
    let mut pending_actions: HashMap<String, PendingActionState> = HashMap::new();

    for event in &stored.events {
        match event.event_type.as_str() {
            "command.started" => upsert_command_started(&mut commands, event),
            "command.output" => upsert_command_output(&mut commands, event),
            "command.exited" => upsert_command_exited(&mut commands, event),
            "test.started" => upsert_test_started(&mut tests, event),
            "test.completed" => upsert_test_completed(&mut tests, event),
            "action.required" => {
                if let Some(action) = pending_action_from_event(stored, event) {
                    pending_actions.insert(action.request_id.clone(), action);
                }
            }
            "action.resolved" | "action.cancelled" | "action.canceled" | "action.expired" => {
                if let Some(action_id) = action_id(event) {
                    pending_actions.remove(&action_id);
                }
            }
            "turn.completed" | "turn.failed" | "turn.canceled" => {
                if let Some(turn_id) = event.turn_id.as_deref() {
                    pending_actions.retain(|_, action| action.turn_id.as_deref() != Some(turn_id));
                }
            }
            _ => {}
        }
    }

    let mut command_values = commands.into_values().collect::<Vec<_>>();
    command_values.sort_by_key(|command| command.sequence);
    let active_command_id = command_values
        .iter()
        .rev()
        .find(|command| {
            command.status == "running" && stored_turn_is_active(stored, command.turn_id.as_deref())
        })
        .map(|command| command.command_id.clone());

    let mut test_values = tests.into_values().collect::<Vec<_>>();
    test_values.sort_by_key(|test| test.sequence);
    let active_test_run_id = test_values
        .iter()
        .rev()
        .find(|test| {
            test.status == "running" && stored_turn_is_active(stored, test.turn_id.as_deref())
        })
        .map(|test| test.test_run_id.clone());

    let mut pending_request_values = pending_actions
        .into_values()
        .filter(|action| stored_turn_is_active(stored, action.turn_id.as_deref()))
        .collect::<Vec<_>>();
    pending_request_values.sort_by_key(|action| action.sequence);
    let active_action_id = pending_request_values
        .last()
        .map(|action| action.request_id.clone());

    CodingActivityProjection {
        commands: command_values
            .into_iter()
            .map(command_state_value)
            .collect(),
        tests: test_values.into_iter().map(test_state_value).collect(),
        pending_requests: pending_request_values
            .into_iter()
            .map(pending_action_value)
            .collect(),
        active_command_id,
        active_test_run_id,
        active_action_id,
    }
}

fn upsert_command_started(commands: &mut HashMap<String, CommandState>, event: &AgentEvent) {
    let Some(command_id) = command_id(event) else {
        return;
    };
    let command = commands
        .entry(command_id.clone())
        .or_insert_with(|| command_state(&command_id, event));
    command.status = "running".to_string();
    command.turn_id = event.turn_id.clone().or_else(|| command.turn_id.clone());
    command.command =
        string_field(&event.payload, &["command"]).or_else(|| command.command.clone());
    command.cwd = string_field(&event.payload, &["cwd", "workingDirectory", "working_dir"])
        .or_else(|| command.cwd.clone());
    command.started_at = Some(event.timestamp.clone());
    command.updated_at = Some(event.timestamp.clone());
    command.sequence = event.sequence;
    push_source_event(command.source_event_ids.as_mut(), event);
}

fn upsert_command_output(commands: &mut HashMap<String, CommandState>, event: &AgentEvent) {
    let Some(command_id) = command_id(event) else {
        return;
    };
    let command = commands
        .entry(command_id.clone())
        .or_insert_with(|| command_state(&command_id, event));
    if command.status.is_empty() {
        command.status = "running".to_string();
    }
    merge_refs(
        &mut command.output_refs,
        output_refs_from_payload(&event.payload),
    );
    command.output_preview = string_field(
        &event.payload,
        &["outputPreview", "output_preview", "preview", "summary"],
    )
    .or_else(|| command.output_preview.clone());
    command.updated_at = Some(event.timestamp.clone());
    command.sequence = event.sequence;
    push_source_event(command.source_event_ids.as_mut(), event);
}

fn upsert_command_exited(commands: &mut HashMap<String, CommandState>, event: &AgentEvent) {
    let Some(command_id) = command_id(event) else {
        return;
    };
    let command = commands
        .entry(command_id.clone())
        .or_insert_with(|| command_state(&command_id, event));
    command.exit_code =
        payload_i64(&event.payload, &["exitCode", "exit_code"]).or(command.exit_code);
    command.status = command_exit_status(&event.payload, command.exit_code);
    command.completed_at = Some(event.timestamp.clone());
    command.updated_at = Some(event.timestamp.clone());
    command.sequence = event.sequence;
    push_source_event(command.source_event_ids.as_mut(), event);
}

fn upsert_test_started(tests: &mut HashMap<String, TestState>, event: &AgentEvent) {
    let Some(test_run_id) = test_run_id(event) else {
        return;
    };
    let test = tests
        .entry(test_run_id.clone())
        .or_insert_with(|| test_state(&test_run_id, event));
    test.status = "running".to_string();
    test.turn_id = event.turn_id.clone().or_else(|| test.turn_id.clone());
    test.command_id = string_field(&event.payload, &["commandId", "command_id"])
        .or_else(|| test.command_id.clone());
    test.suite = string_field(&event.payload, &["suite"]).or_else(|| test.suite.clone());
    test.started_at = Some(event.timestamp.clone());
    test.updated_at = Some(event.timestamp.clone());
    test.sequence = event.sequence;
    push_source_event(test.source_event_ids.as_mut(), event);
}

fn upsert_test_completed(tests: &mut HashMap<String, TestState>, event: &AgentEvent) {
    let Some(test_run_id) = test_run_id(event) else {
        return;
    };
    let test = tests
        .entry(test_run_id.clone())
        .or_insert_with(|| test_state(&test_run_id, event));
    test.command_id = string_field(&event.payload, &["commandId", "command_id"])
        .or_else(|| test.command_id.clone());
    test.result =
        string_field(&event.payload, &["result", "status"]).or_else(|| test.result.clone());
    test.status = test_result_status(test.result.as_deref());
    test.passed = payload_i64(&event.payload, &["passed"]).or(test.passed);
    test.failed = payload_i64(&event.payload, &["failed"]).or(test.failed);
    merge_refs(
        &mut test.output_refs,
        output_refs_from_payload(&event.payload),
    );
    test.failure_category = string_field(&event.payload, &["failureCategory", "failure_category"])
        .or_else(|| test.failure_category.clone());
    test.completed_at = Some(event.timestamp.clone());
    test.updated_at = Some(event.timestamp.clone());
    test.sequence = event.sequence;
    push_source_event(test.source_event_ids.as_mut(), event);
}

fn pending_action_from_event(
    stored: &StoredSession,
    event: &AgentEvent,
) -> Option<PendingActionState> {
    let request_id = action_id(event)?;
    let request_type = string_field(&event.payload, &["actionType", "action_type"])
        .unwrap_or_else(|| "runtime_action".to_string());
    let data = event.payload.get("data").unwrap_or(&event.payload);
    let title = string_field(data, &["prompt", "message"])
        .or_else(|| string_field(&event.payload, &["prompt", "message", "title"]))
        .or_else(|| string_field(&event.payload, &["actionKind", "action_kind"]));
    let thread_id = event
        .thread_id
        .clone()
        .unwrap_or_else(|| stored.session.thread_id.clone());
    let scope = json!({
        "session_id": event.session_id,
        "thread_id": thread_id,
        "turn_id": event.turn_id,
    });
    Some(PendingActionState {
        request_id,
        thread_id,
        turn_id: event.turn_id.clone(),
        request_type,
        status: "pending".to_string(),
        title,
        payload: event.payload.clone(),
        scope,
        created_at: Some(event.timestamp.clone()),
        source_event_id: event.event_id.clone(),
        sequence: event.sequence,
    })
}

fn command_state(command_id: &str, event: &AgentEvent) -> CommandState {
    CommandState {
        command_id: command_id.to_string(),
        turn_id: event.turn_id.clone(),
        status: "running".to_string(),
        command: None,
        cwd: None,
        exit_code: None,
        output_refs: Vec::new(),
        output_preview: None,
        started_at: None,
        completed_at: None,
        updated_at: None,
        source_event_ids: Vec::new(),
        sequence: event.sequence,
    }
}

fn test_state(test_run_id: &str, event: &AgentEvent) -> TestState {
    TestState {
        test_run_id: test_run_id.to_string(),
        turn_id: event.turn_id.clone(),
        status: "running".to_string(),
        command_id: None,
        suite: None,
        result: None,
        passed: None,
        failed: None,
        output_refs: Vec::new(),
        failure_category: None,
        started_at: None,
        completed_at: None,
        updated_at: None,
        source_event_ids: Vec::new(),
        sequence: event.sequence,
    }
}

fn command_state_value(command: CommandState) -> Value {
    compact_object(json!({
        "command_id": command.command_id,
        "turn_id": command.turn_id,
        "status": command.status,
        "command": command.command,
        "cwd": command.cwd,
        "exit_code": command.exit_code,
        "output_refs": command.output_refs,
        "output_preview": command.output_preview,
        "started_at": command.started_at,
        "completed_at": command.completed_at,
        "updated_at": command.updated_at,
        "source_event_ids": command.source_event_ids,
    }))
}

fn test_state_value(test: TestState) -> Value {
    compact_object(json!({
        "test_run_id": test.test_run_id,
        "turn_id": test.turn_id,
        "status": test.status,
        "command_id": test.command_id,
        "suite": test.suite,
        "result": test.result,
        "passed": test.passed,
        "failed": test.failed,
        "output_refs": test.output_refs,
        "failure_category": test.failure_category,
        "started_at": test.started_at,
        "completed_at": test.completed_at,
        "updated_at": test.updated_at,
        "source_event_ids": test.source_event_ids,
    }))
}

fn pending_action_value(action: PendingActionState) -> Value {
    compact_object(json!({
        "id": action.request_id,
        "thread_id": action.thread_id,
        "turn_id": action.turn_id,
        "request_type": action.request_type,
        "status": action.status,
        "title": action.title,
        "payload": action.payload,
        "scope": action.scope,
        "created_at": action.created_at,
        "source_event_id": action.source_event_id,
    }))
}

fn stored_turn_is_active(stored: &StoredSession, turn_id: Option<&str>) -> bool {
    let Some(turn_id) = turn_id else {
        return true;
    };
    stored
        .turns
        .iter()
        .find(|turn| turn.turn_id == turn_id)
        .map(|turn| agent_turn_is_active(turn.status))
        .unwrap_or(true)
}

fn command_id(event: &AgentEvent) -> Option<String> {
    string_field(
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

fn test_run_id(event: &AgentEvent) -> Option<String> {
    string_field(
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

fn action_id(event: &AgentEvent) -> Option<String> {
    string_field(
        &event.payload,
        &["requestId", "request_id", "actionId", "action_id", "id"],
    )
}

fn output_refs_from_payload(payload: &Value) -> Vec<String> {
    let mut refs = string_array_field(payload, &["outputRefs", "output_refs", "refIds", "ref_ids"]);
    for key in [
        "outputRef",
        "output_ref",
        "contentRef",
        "content_ref",
        "diffRef",
        "diff_ref",
    ] {
        if let Some(value) = string_field(payload, &[key]) {
            refs.push(value);
        }
    }
    refs
}

fn merge_refs(target: &mut Vec<String>, refs: Vec<String>) {
    for value in refs {
        if !target.iter().any(|existing| existing == &value) {
            target.push(value);
        }
    }
}

fn push_source_event(target: &mut Vec<String>, event: &AgentEvent) {
    if !target.iter().any(|existing| existing == &event.event_id) {
        target.push(event.event_id.clone());
    }
}

fn payload_i64(payload: &Value, keys: &[&str]) -> Option<i64> {
    keys.iter()
        .filter_map(|key| payload.get(*key))
        .find_map(Value::as_i64)
}

fn command_exit_status(payload: &Value, exit_code: Option<i64>) -> String {
    if let Some(status) = string_field(payload, &["status"]) {
        return match status.as_str() {
            "ok" | "success" | "succeeded" | "passed" => "completed".to_string(),
            "fail" | "failed" | "error" | "timed_out" | "timeout" => "failed".to_string(),
            other => other.to_string(),
        };
    }
    match exit_code {
        Some(0) => "completed".to_string(),
        Some(_) => "failed".to_string(),
        None => "completed".to_string(),
    }
}

fn test_result_status(result: Option<&str>) -> String {
    match result.unwrap_or("completed") {
        "passed" | "ok" | "success" | "succeeded" | "completed" => "completed".to_string(),
        "failed" | "fail" | "error" | "timed_out" | "timeout" => "failed".to_string(),
        "canceled" | "cancelled" => "canceled".to_string(),
        "running" => "running".to_string(),
        _ => "completed".to_string(),
    }
}

fn compact_object(value: Value) -> Value {
    let Value::Object(object) = value else {
        return value;
    };
    Value::Object(
        object
            .into_iter()
            .filter(|(_, value)| !value.is_null())
            .collect::<Map<String, Value>>(),
    )
}
