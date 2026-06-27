use super::status::agent_turn_is_active;
use super::string_array_field;
use super::string_field;
use super::StoredSession;
use app_server_protocol::AgentEvent;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;
use std::collections::BTreeMap;
use std::collections::HashMap;

#[derive(Debug, Default)]
pub(super) struct CodingActivityProjection {
    pub(super) commands: Vec<Value>,
    pub(super) tests: Vec<Value>,
    pub(super) pending_requests: Vec<Value>,
    pub(super) change_summary: Option<Value>,
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
    canonical_command: Option<String>,
    command_summary: Option<String>,
    command_argv: Vec<String>,
    command_argv_source: Option<String>,
    cwd: Option<String>,
    exit_code: Option<i64>,
    process_id: Option<String>,
    execution_process_status: Option<String>,
    execution_process_control_status: Option<String>,
    execution_surface: Option<String>,
    stdin_writable: Option<bool>,
    output_bytes: Option<u64>,
    output_omitted_bytes: Option<u64>,
    output_truncated: Option<bool>,
    stdout_bytes: Option<u64>,
    stderr_bytes: Option<u64>,
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
    canonical_command: Option<String>,
    command_summary: Option<String>,
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

#[derive(Debug, Default)]
struct ChangeSummaryState {
    changed_files: Vec<String>,
    patch_status_by_id: BTreeMap<String, String>,
    source_event_ids: Vec<String>,
    latest_sequence: u64,
}

pub(super) fn coding_activity_from_events(stored: &StoredSession) -> CodingActivityProjection {
    let mut commands: HashMap<String, CommandState> = HashMap::new();
    let mut tests: HashMap<String, TestState> = HashMap::new();
    let mut pending_actions: HashMap<String, PendingActionState> = HashMap::new();
    let mut change_summary = ChangeSummaryState::default();

    for event in &stored.events {
        match event.event_type.as_str() {
            "file.changed" => update_change_summary_file(&mut change_summary, event),
            "patch.started" | "patch.applied" | "patch.failed" => {
                update_change_summary_patch(&mut change_summary, event)
            }
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
        change_summary: change_summary_value(change_summary),
        active_command_id,
        active_test_run_id,
        active_action_id,
    }
}

fn update_change_summary_file(summary: &mut ChangeSummaryState, event: &AgentEvent) {
    if let Some(path) = string_field(&event.payload, &["path", "relativePath", "relative_path"]) {
        merge_refs(&mut summary.changed_files, vec![path]);
    }
    push_source_event(summary.source_event_ids.as_mut(), event);
    summary.latest_sequence = event.sequence;
}

fn update_change_summary_patch(summary: &mut ChangeSummaryState, event: &AgentEvent) {
    if let Some(patch_id) = string_field(&event.payload, &["patchId", "patch_id", "id"]) {
        let status = match event.event_type.as_str() {
            "patch.started" => "running",
            "patch.applied" => "applied",
            "patch.failed" => "failed",
            _ => "unknown",
        };
        summary
            .patch_status_by_id
            .insert(patch_id, status.to_string());
    }
    for path in string_array_field(&event.payload, &["paths", "changedFiles", "changed_files"]) {
        merge_refs(&mut summary.changed_files, vec![path]);
    }
    push_source_event(summary.source_event_ids.as_mut(), event);
    summary.latest_sequence = event.sequence;
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
    command.canonical_command =
        string_field(&event.payload, &["canonicalCommand", "canonical_command"])
            .or_else(|| command.canonical_command.clone());
    command.command_summary = string_field(&event.payload, &["commandSummary", "command_summary"])
        .or_else(|| command.command_summary.clone());
    merge_refs(
        &mut command.command_argv,
        string_array_field(&event.payload, &["commandArgv", "command_argv"]),
    );
    command.command_argv_source = string_field(
        &event.payload,
        &["commandArgvSource", "command_argv_source"],
    )
    .or_else(|| command.command_argv_source.clone());
    command.cwd = string_field(&event.payload, &["cwd", "workingDirectory", "working_dir"])
        .or_else(|| command.cwd.clone());
    merge_command_process_facts(command, &event.payload);
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
    merge_command_process_facts(command, &event.payload);
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
    command.command =
        string_field(&event.payload, &["command"]).or_else(|| command.command.clone());
    command.canonical_command =
        string_field(&event.payload, &["canonicalCommand", "canonical_command"])
            .or_else(|| command.canonical_command.clone());
    command.command_summary = string_field(&event.payload, &["commandSummary", "command_summary"])
        .or_else(|| command.command_summary.clone());
    merge_refs(
        &mut command.command_argv,
        string_array_field(&event.payload, &["commandArgv", "command_argv"]),
    );
    command.command_argv_source = string_field(
        &event.payload,
        &["commandArgvSource", "command_argv_source"],
    )
    .or_else(|| command.command_argv_source.clone());
    merge_command_process_facts(command, &event.payload);
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
    test.canonical_command =
        string_field(&event.payload, &["canonicalCommand", "canonical_command"])
            .or_else(|| test.canonical_command.clone());
    test.command_summary = string_field(&event.payload, &["commandSummary", "command_summary"])
        .or_else(|| test.command_summary.clone());
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
    test.canonical_command =
        string_field(&event.payload, &["canonicalCommand", "canonical_command"])
            .or_else(|| test.canonical_command.clone());
    test.command_summary = string_field(&event.payload, &["commandSummary", "command_summary"])
        .or_else(|| test.command_summary.clone());
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
        canonical_command: None,
        command_summary: None,
        command_argv: Vec::new(),
        command_argv_source: None,
        cwd: None,
        exit_code: None,
        process_id: None,
        execution_process_status: None,
        execution_process_control_status: None,
        execution_surface: None,
        stdin_writable: None,
        output_bytes: None,
        output_omitted_bytes: None,
        output_truncated: None,
        stdout_bytes: None,
        stderr_bytes: None,
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
        canonical_command: None,
        command_summary: None,
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
        "canonical_command": command.canonical_command,
        "command_summary": command.command_summary,
        "command_argv": command.command_argv,
        "command_argv_source": command.command_argv_source,
        "cwd": command.cwd,
        "exit_code": command.exit_code,
        "process_id": command.process_id,
        "execution_process_status": command.execution_process_status,
        "execution_process_control_status": command.execution_process_control_status,
        "execution_surface": command.execution_surface,
        "stdin_writable": command.stdin_writable,
        "output_bytes": command.output_bytes,
        "output_omitted_bytes": command.output_omitted_bytes,
        "output_truncated": command.output_truncated,
        "stdout_bytes": command.stdout_bytes,
        "stderr_bytes": command.stderr_bytes,
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
        "canonical_command": test.canonical_command,
        "command_summary": test.command_summary,
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

fn change_summary_value(summary: ChangeSummaryState) -> Option<Value> {
    if summary.changed_files.is_empty() && summary.patch_status_by_id.is_empty() {
        return None;
    }
    let patch_count = summary.patch_status_by_id.len();
    let failed_patch_count = summary
        .patch_status_by_id
        .values()
        .filter(|status| status.as_str() == "failed")
        .count();
    let running_patch_count = summary
        .patch_status_by_id
        .values()
        .filter(|status| status.as_str() == "running")
        .count();
    let applied_patch_count = summary
        .patch_status_by_id
        .values()
        .filter(|status| status.as_str() == "applied")
        .count();
    Some(compact_object(json!({
        "changed_file_count": summary.changed_files.len(),
        "changed_files": summary.changed_files,
        "patch_count": patch_count,
        "applied_patch_count": applied_patch_count,
        "failed_patch_count": failed_patch_count,
        "running_patch_count": running_patch_count,
        "source_event_ids": summary.source_event_ids,
        "latest_sequence": summary.latest_sequence,
    })))
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

fn merge_command_process_facts(command: &mut CommandState, payload: &Value) {
    command.process_id = payload_or_metadata_string(payload, &["processId", "process_id"])
        .or_else(|| command.process_id.clone());
    command.execution_process_status = payload_or_metadata_string(
        payload,
        &["executionProcessStatus", "execution_process_status"],
    )
    .or_else(|| command.execution_process_status.clone());
    command.execution_process_control_status = payload_or_metadata_string(
        payload,
        &[
            "executionProcessControlStatus",
            "execution_process_control_status",
        ],
    )
    .or_else(|| command.execution_process_control_status.clone());
    command.execution_surface =
        payload_or_metadata_string(payload, &["executionSurface", "execution_surface"])
            .or_else(|| command.execution_surface.clone());
    command.stdin_writable =
        payload_or_metadata_bool(payload, &["stdinWritable", "stdin_writable"])
            .or(command.stdin_writable);
    command.output_bytes =
        payload_or_metadata_u64(payload, &["outputBytes", "output_bytes"]).or(command.output_bytes);
    command.output_omitted_bytes =
        payload_or_metadata_u64(payload, &["outputOmittedBytes", "output_omitted_bytes"])
            .or(command.output_omitted_bytes);
    command.output_truncated =
        payload_or_metadata_bool(payload, &["outputTruncated", "output_truncated"])
            .or(command.output_truncated);
    command.stdout_bytes =
        payload_or_metadata_u64(payload, &["stdoutBytes", "stdout_bytes"]).or(command.stdout_bytes);
    command.stderr_bytes =
        payload_or_metadata_u64(payload, &["stderrBytes", "stderr_bytes"]).or(command.stderr_bytes);
}

fn payload_i64(payload: &Value, keys: &[&str]) -> Option<i64> {
    keys.iter()
        .filter_map(|key| payload.get(*key))
        .find_map(Value::as_i64)
}

fn payload_or_metadata_string(payload: &Value, keys: &[&str]) -> Option<String> {
    payload_or_metadata_value(payload, keys).and_then(|value| {
        value
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
    })
}

fn payload_or_metadata_u64(payload: &Value, keys: &[&str]) -> Option<u64> {
    payload_or_metadata_value(payload, keys).and_then(value_u64)
}

fn payload_or_metadata_bool(payload: &Value, keys: &[&str]) -> Option<bool> {
    payload_or_metadata_value(payload, keys).and_then(value_bool)
}

fn payload_or_metadata_value<'a>(payload: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    for key in keys {
        if let Some(value) = payload.get(*key) {
            return Some(value);
        }
    }
    let metadata = payload.get("metadata").and_then(Value::as_object)?;
    keys.iter().find_map(|key| metadata.get(*key))
}

fn value_u64(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_i64().and_then(|value| u64::try_from(value).ok()))
        .or_else(|| value.as_str()?.trim().parse::<u64>().ok())
}

fn value_bool(value: &Value) -> Option<bool> {
    value.as_bool().or_else(|| match value.as_str()?.trim() {
        "true" | "TRUE" | "True" | "1" => Some(true),
        "false" | "FALSE" | "False" | "0" => Some(false),
        _ => None,
    })
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
