use super::*;

#[tokio::test]
async fn append_external_runtime_events_accepts_coding_lifecycle() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_coding_lifecycle",
        "thread_coding_lifecycle",
        "turn_coding_lifecycle",
    )
    .await;

    let appended = core
        .append_external_runtime_events(
            &session_id,
            Some(&turn_id),
            vec![
                RuntimeEvent::new(
                    "file.changed",
                    json!({
                        "path": "src/App.tsx",
                        "artifactId": "artifact_app_tsx"
                    }),
                ),
                RuntimeEvent::new("patch.started", json!({ "patchId": "patch_app_tsx" })),
                RuntimeEvent::new("patch.applied", json!({ "patchId": "patch_app_tsx" })),
                RuntimeEvent::new(
                    "command.started",
                    json!({
                        "commandId": "cmd_test",
                        "command": "npm test"
                    }),
                ),
                RuntimeEvent::new(
                    "command.output",
                    json!({
                        "commandId": "cmd_test",
                        "outputRef": "output://cmd_test"
                    }),
                ),
                RuntimeEvent::new(
                    "command.exited",
                    json!({
                        "commandId": "cmd_test",
                        "exitCode": 0
                    }),
                ),
                RuntimeEvent::new("test.started", json!({ "testRunId": "test_unit" })),
                RuntimeEvent::new(
                    "test.completed",
                    json!({
                        "testRunId": "test_unit",
                        "result": "passed"
                    }),
                ),
            ],
        )
        .expect("coding lifecycle should append");

    assert_eq!(appended.len(), 8);
    assert_eq!(appended[0].event_type, "file.changed");
    assert_eq!(appended[7].event_type, "test.completed");
    assert_eq!(appended[0].sequence, 3);
    assert_eq!(appended[7].sequence, 10);
}

#[tokio::test]
async fn read_model_projects_active_coding_activity_and_pending_action() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_coding_active_read_model",
        "thread_coding_active_read_model",
        "turn_coding_active_read_model",
    )
    .await;

    core.append_external_runtime_events(
        &session_id,
        Some(&turn_id),
        vec![
            RuntimeEvent::new(
                "patch.started",
                json!({
                    "patchId": "patch_active",
                    "paths": ["src/App.tsx"]
                }),
            ),
            RuntimeEvent::new(
                "file.changed",
                json!({
                    "path": "src/App.tsx",
                    "artifactId": "artifact_app_tsx"
                }),
            ),
            RuntimeEvent::new(
                "command.started",
                json!({
                    "commandId": "cmd_active",
                    "command": "npm test",
                    "canonicalCommand": "npm test",
                    "commandSummary": "npm test",
                    "commandArgv": ["npm", "test"],
                    "commandArgvSource": "argv",
                    "cwd": "."
                }),
            ),
            RuntimeEvent::new(
                "command.output",
                json!({
                    "commandId": "cmd_active",
                    "outputRef": "output://cmd_active",
                    "processId": "process-cmd-active",
                    "executionProcessStatus": "running",
                    "executionProcessControlStatus": "registered",
                    "executionSurface": "live_process",
                    "stdinWritable": true,
                    "outputBytes": 14,
                    "outputOmittedBytes": 0,
                    "outputTruncated": false,
                    "stdoutBytes": 14,
                    "stderrBytes": 0
                }),
            ),
            RuntimeEvent::new(
                "test.started",
                json!({
                    "testRunId": "test_active",
                    "commandId": "cmd_active",
                    "command": "npm test",
                    "canonicalCommand": "npm test",
                    "commandSummary": "npm test",
                    "suite": "unit"
                }),
            ),
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "tool_needs_approval",
                    "toolName": "Shell"
                }),
            ),
            RuntimeEvent::new(
                "action.required",
                json!({
                    "requestId": "action_active",
                    "actionType": "tool_confirmation",
                    "toolCallId": "tool_needs_approval",
                    "prompt": "Allow npm test?"
                }),
            ),
        ],
    )
    .expect("active coding events");

    let read = read_session(&core, &session_id);
    let detail = read.detail.expect("session detail");
    let thread_read = &detail["thread_read"];
    assert_eq!(thread_read["status"], "waitingAction");
    assert_eq!(thread_read["active_turn_id"], turn_id);
    assert_eq!(thread_read["active_command_id"], "cmd_active");
    assert_eq!(thread_read["active_test_run_id"], "test_active");
    assert_eq!(thread_read["active_action_id"], "action_active");
    assert_eq!(thread_read["diagnostics"]["pending_request_count"], 1);
    assert_eq!(thread_read["diagnostics"]["changed_file_count"], 1);
    assert_eq!(thread_read["diagnostics"]["patch_count"], 1);
    assert_eq!(thread_read["change_summary"]["changed_file_count"], 1);
    assert_eq!(
        thread_read["change_summary"]["changed_files"][0],
        "src/App.tsx"
    );
    assert_eq!(thread_read["change_summary"]["running_patch_count"], 1);

    let commands = thread_read["commands"].as_array().expect("commands");
    assert_eq!(commands.len(), 1);
    assert_eq!(commands[0]["command_id"], "cmd_active");
    assert_eq!(commands[0]["status"], "running");
    assert_eq!(commands[0]["canonical_command"], "npm test");
    assert_eq!(commands[0]["command_summary"], "npm test");
    assert_eq!(commands[0]["command_argv"][0], "npm");
    assert_eq!(commands[0]["output_refs"][0], "output://cmd_active");
    assert_eq!(commands[0]["process_id"], "process-cmd-active");
    assert_eq!(commands[0]["execution_process_status"], "running");
    assert_eq!(
        commands[0]["execution_process_control_status"],
        "registered"
    );
    assert_eq!(commands[0]["execution_surface"], "live_process");
    assert_eq!(commands[0]["stdin_writable"], true);
    assert_eq!(commands[0]["output_bytes"], 14);
    assert_eq!(commands[0]["output_omitted_bytes"], 0);
    assert_eq!(commands[0]["output_truncated"], false);
    assert_eq!(commands[0]["stdout_bytes"], 14);
    assert_eq!(commands[0]["stderr_bytes"], 0);

    let tests = thread_read["tests"].as_array().expect("tests");
    assert_eq!(tests.len(), 1);
    assert_eq!(tests[0]["test_run_id"], "test_active");
    assert_eq!(tests[0]["status"], "running");
    assert_eq!(tests[0]["command_id"], "cmd_active");
    assert_eq!(tests[0]["canonical_command"], "npm test");
    assert_eq!(tests[0]["command_summary"], "npm test");

    let pending_requests = thread_read["pending_requests"]
        .as_array()
        .expect("pending requests");
    assert_eq!(pending_requests.len(), 1);
    assert_eq!(pending_requests[0]["id"], "action_active");
    assert_eq!(pending_requests[0]["request_type"], "tool_confirmation");
    assert_eq!(pending_requests[0]["status"], "pending");
    assert_eq!(
        pending_requests[0]["payload"]["toolCallId"],
        "tool_needs_approval"
    );
}

#[tokio::test]
async fn read_model_clears_resolved_coding_activity() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_coding_resolved_read_model",
        "thread_coding_resolved_read_model",
        "turn_coding_resolved_read_model",
    )
    .await;

    core.append_external_runtime_events(
        &session_id,
        Some(&turn_id),
        vec![
            RuntimeEvent::new(
                "command.started",
                json!({
                    "commandId": "cmd_resolved",
                    "command": "npm test"
                }),
            ),
            RuntimeEvent::new(
                "command.exited",
                json!({
                    "commandId": "cmd_resolved",
                    "exitCode": 1
                }),
            ),
            RuntimeEvent::new(
                "test.started",
                json!({
                    "testRunId": "test_resolved",
                    "commandId": "cmd_resolved"
                }),
            ),
            RuntimeEvent::new(
                "test.completed",
                json!({
                    "testRunId": "test_resolved",
                    "commandId": "cmd_resolved",
                    "result": "failed",
                    "failed": 1
                }),
            ),
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "tool_resolved_approval",
                    "toolName": "Shell"
                }),
            ),
            RuntimeEvent::new(
                "action.required",
                json!({
                    "requestId": "action_resolved",
                    "actionType": "tool_confirmation",
                    "toolCallId": "tool_resolved_approval"
                }),
            ),
            RuntimeEvent::new(
                "action.resolved",
                json!({
                    "requestId": "action_resolved",
                    "actionType": "tool_confirmation",
                    "toolCallId": "tool_resolved_approval",
                    "decision": "approve"
                }),
            ),
            RuntimeEvent::new(
                "tool.result",
                json!({
                    "toolCallId": "tool_resolved_approval",
                    "toolName": "Shell",
                    "output": "approved"
                }),
            ),
        ],
    )
    .expect("resolved coding events");

    let read = read_session(&core, &session_id);
    let detail = read.detail.expect("session detail");
    let thread_read = &detail["thread_read"];
    assert!(thread_read["active_command_id"].is_null());
    assert!(thread_read["active_test_run_id"].is_null());
    assert!(thread_read["active_action_id"].is_null());
    assert!(thread_read["pending_requests"]
        .as_array()
        .expect("pending requests")
        .is_empty());

    let commands = thread_read["commands"].as_array().expect("commands");
    assert_eq!(commands[0]["command_id"], "cmd_resolved");
    assert_eq!(commands[0]["status"], "failed");
    assert_eq!(commands[0]["exit_code"], 1);

    let tests = thread_read["tests"].as_array().expect("tests");
    assert_eq!(tests[0]["test_run_id"], "test_resolved");
    assert_eq!(tests[0]["status"], "failed");
    assert_eq!(tests[0]["result"], "failed");
}
