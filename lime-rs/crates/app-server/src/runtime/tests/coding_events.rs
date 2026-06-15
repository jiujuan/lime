use super::support::*;
use super::*;
use app_server_protocol::AgentSessionFileCheckpointDiffParams;
use app_server_protocol::AgentSessionFileCheckpointGetParams;
use app_server_protocol::AgentSessionFileCheckpointListParams;
use app_server_protocol::AgentSessionFileCheckpointRestoreParams;
use app_server_protocol::ArtifactContentStatus;
use app_server_protocol::ArtifactReadParams;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

async fn runtime_with_active_turn(
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
) -> (RuntimeCore, String, String) {
    runtime_with_active_turn_using_core(RuntimeCore::default(), session_id, thread_id, turn_id)
        .await
}

async fn runtime_with_active_turn_using_core(
    core: RuntimeCore,
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
) -> (RuntimeCore, String, String) {
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some(session_id.to_string()),
            thread_id: Some(thread_id.to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;
    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some(turn_id.to_string()),
                input: AgentInput {
                    text: "update the project".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn");

    (core, session.session_id, output.response.turn.turn_id)
}

fn unique_temp_dir(name: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "{name}-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos()
    ))
}

fn read_session(core: &RuntimeCore, session_id: &str) -> AgentSessionReadResponse {
    core.read_session(AgentSessionReadParams {
        session_id: session_id.to_string(),
        history_limit: None,
        history_offset: None,
        history_before_message_id: None,
    })
    .expect("read session")
}

fn event_count(core: &RuntimeCore, session_id: &str) -> usize {
    core.events_for_session(session_id)
        .expect("events for session")
        .len()
}

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
                    "outputRef": "output://cmd_active"
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

#[tokio::test]
async fn coding_file_changed_artifact_refs_join_read_model_and_evidence() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_coding_artifact_refs",
        "thread_coding_artifact_refs",
        "turn_coding_artifact_refs",
    )
    .await;

    core.append_external_runtime_events(
        &session_id,
        Some(&turn_id),
        vec![RuntimeEvent::new(
            "file.changed",
            json!({
                "path": "src/App.tsx",
                "artifactId": "artifact_src_app_after",
                "artifactRefs": ["artifact_src_app_after", "artifact_src_app_before"],
                "changeKind": "modified",
                "checkpointRef": "checkpoint_src_app_after",
                "contentRef": "content://src-app-after",
                "diffRef": "diff://src-app",
                "preview": "changed App component"
            }),
        )],
    )
    .expect("file changed should append");

    let read = read_session(&core, &session_id);
    let detail = read.detail.expect("session detail");
    let artifacts = detail["artifacts"].as_array().expect("detail artifacts");
    assert!(artifacts.iter().any(|artifact| {
        artifact["artifactRef"].as_str() == Some("artifact_src_app_after")
            && artifact["path"].as_str() == Some("src/App.tsx")
    }));
    assert!(artifacts.iter().any(|artifact| {
        artifact["artifactRef"].as_str() == Some("artifact_src_app_before")
            && artifact["path"].as_str() == Some("src/App.tsx")
    }));
    let app_artifact = artifacts
        .iter()
        .find(|artifact| artifact["artifactRef"].as_str() == Some("artifact_src_app_after"))
        .expect("app artifact");
    assert_eq!(
        app_artifact["metadata"]["previewText"].as_str(),
        Some("changed App component")
    );
    assert_eq!(
        app_artifact["metadata"]["changeKind"].as_str(),
        Some("modified")
    );
    assert_eq!(
        app_artifact["metadata"]["checkpointRef"].as_str(),
        Some("checkpoint_src_app_after")
    );
    assert_eq!(
        app_artifact["metadata"]["contentRef"].as_str(),
        Some("content://src-app-after")
    );
    assert_eq!(
        app_artifact["metadata"]["diffRef"].as_str(),
        Some("diff://src-app")
    );

    let artifact_read = core
        .read_artifacts(ArtifactReadParams {
            session_id: session_id.clone(),
            turn_id: Some(turn_id.clone()),
            artifact_ref: Some("artifact_src_app_after".to_string()),
            include_content: Some(false),
            cursor: None,
            limit: None,
        })
        .expect("artifact read");
    assert_eq!(artifact_read.artifacts.len(), 1);
    assert_eq!(
        artifact_read.artifacts[0].artifact_ref,
        "artifact_src_app_after"
    );
    assert_eq!(
        artifact_read.artifacts[0].path.as_deref(),
        Some("src/App.tsx")
    );
    assert_eq!(
        artifact_read.artifacts[0]
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("previewText"))
            .and_then(serde_json::Value::as_str),
        Some("changed App component")
    );
    assert_eq!(
        artifact_read.artifacts[0]
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("diffRef"))
            .and_then(serde_json::Value::as_str),
        Some("diff://src-app")
    );

    let evidence = core
        .export_evidence(EvidenceExportParams {
            session_id,
            turn_id: Some(turn_id),
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(false),
        })
        .await
        .expect("evidence export");
    let artifact_refs = evidence
        .artifacts
        .iter()
        .map(|artifact| artifact.artifact_ref.as_str())
        .collect::<Vec<_>>();
    assert!(artifact_refs.contains(&"artifact_src_app_after"));
    assert!(artifact_refs.contains(&"artifact_src_app_before"));
}

#[tokio::test]
async fn tool_terminal_large_output_is_normalized_to_output_ref() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_coding_large_output",
        "thread_coding_large_output",
        "turn_coding_large_output",
    )
    .await;
    let large_output = "x".repeat(40_000);

    let appended = core
        .append_external_runtime_events(
            &session_id,
            Some(&turn_id),
            vec![
                RuntimeEvent::new(
                    "tool.started",
                    json!({
                        "toolCallId": "tool-large-output",
                        "toolName": "Bash"
                    }),
                ),
                RuntimeEvent::new(
                    "tool.result",
                    json!({
                        "toolCallId": "tool-large-output",
                        "result": {
                            "success": true,
                            "output": large_output,
                        },
                        "runtimeEvent": {
                            "type": "tool_end",
                            "tool_id": "tool-large-output",
                            "result": {
                                "success": true,
                                "output": "x".repeat(40_000),
                            }
                        }
                    }),
                ),
            ],
        )
        .expect("large tool output should append as refs");

    assert_eq!(appended.len(), 2);
    let terminal = appended.last().expect("tool terminal event");
    assert_eq!(terminal.event_type, "tool.result");
    assert!(terminal.payload["outputRef"]
        .as_str()
        .is_some_and(|value| value.starts_with("output:runtime:")));
    assert_eq!(terminal.payload["outputTruncated"].as_bool(), Some(true));
    assert!(terminal.payload["outputPreview"]
        .as_str()
        .is_some_and(|value| value.chars().count() <= 1_201));
    assert!(terminal.payload["result"]["output"]
        .as_str()
        .is_some_and(|value| value.chars().count() <= 1_201));
    assert!(terminal.payload["runtimeEvent"]["result"]["output"]
        .as_str()
        .is_some_and(|value| value.chars().count() <= 1_201));
}

#[tokio::test]
async fn tool_terminal_large_output_is_readable_from_output_owner() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_coding_output_owner",
        "thread_coding_output_owner",
        "turn_coding_output_owner",
    )
    .await;
    let large_output = format!("start\n{}\nend", "x".repeat(40_000));

    let appended = core
        .append_external_runtime_events(
            &session_id,
            Some(&turn_id),
            vec![
                RuntimeEvent::new(
                    "tool.started",
                    json!({
                        "toolCallId": "tool-output-owner",
                        "toolName": "Bash"
                    }),
                ),
                RuntimeEvent::new(
                    "tool.result",
                    json!({
                        "toolCallId": "tool-output-owner",
                        "result": {
                            "success": true,
                            "output": large_output,
                        }
                    }),
                ),
            ],
        )
        .expect("large tool output should append");
    let output_ref = appended[1].payload["outputRef"]
        .as_str()
        .expect("output ref")
        .to_string();

    let read = read_session(&core, &session_id);
    let detail = read.detail.expect("session detail");
    let outputs = detail["outputs"].as_array().expect("detail outputs");
    assert!(outputs.iter().any(|output| {
        output["outputRef"].as_str() == Some(output_ref.as_str())
            && output["outputTruncated"].as_bool() == Some(true)
    }));
    let tool_calls = detail["thread_read"]["tool_calls"]
        .as_array()
        .expect("tool calls");
    assert!(tool_calls.iter().any(|tool_call| {
        tool_call["output_ref"].as_str() == Some(output_ref.as_str())
            && tool_call["output_truncated"].as_bool() == Some(true)
    }));

    let artifact_read = core
        .read_artifacts(ArtifactReadParams {
            session_id: session_id.clone(),
            turn_id: Some(turn_id.clone()),
            artifact_ref: Some(output_ref.clone()),
            include_content: Some(true),
            cursor: None,
            limit: None,
        })
        .expect("read output artifact");
    assert_eq!(artifact_read.artifacts.len(), 1);
    assert_eq!(artifact_read.artifacts[0].artifact_ref, output_ref);
    assert_eq!(
        artifact_read.artifacts[0].kind.as_deref(),
        Some("tool_output")
    );
    assert_eq!(
        artifact_read.artifacts[0].content.as_deref(),
        Some(large_output.as_str())
    );
    assert_eq!(
        artifact_read.artifacts[0].content_status,
        ArtifactContentStatus::Available
    );

    let evidence = core
        .export_evidence(EvidenceExportParams {
            session_id,
            turn_id: Some(turn_id),
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(false),
        })
        .await
        .expect("evidence export");
    assert!(evidence
        .artifacts
        .iter()
        .any(|artifact| artifact.artifact_ref == artifact_read.artifacts[0].artifact_ref));
}

#[tokio::test]
async fn tool_terminal_large_output_persists_to_filesystem_snapshot_owner() {
    let snapshot_root = unique_temp_dir("lime-runtime-output-snapshots");
    let core = RuntimeCore::default().with_output_snapshot_store(Arc::new(
        FilesystemOutputSnapshotStore::with_base_dir(snapshot_root.clone()),
    ));
    let (core, session_id, turn_id) = runtime_with_active_turn_using_core(
        core,
        "sess_coding_output_snapshot_owner",
        "thread_coding_output_snapshot_owner",
        "turn_coding_output_snapshot_owner",
    )
    .await;
    let large_output = format!("snapshot-start\n{}\nsnapshot-end", "z".repeat(40_000));

    let appended = core
        .append_external_runtime_events(
            &session_id,
            Some(&turn_id),
            vec![
                RuntimeEvent::new(
                    "tool.started",
                    json!({
                        "toolCallId": "tool-output-snapshot-owner",
                        "toolName": "Bash"
                    }),
                ),
                RuntimeEvent::new(
                    "tool.result",
                    json!({
                        "toolCallId": "tool-output-snapshot-owner",
                        "result": {
                            "success": true,
                            "output": large_output,
                        }
                    }),
                ),
            ],
        )
        .expect("large tool output should append");
    let output_ref = appended[1].payload["outputRef"]
        .as_str()
        .expect("output ref")
        .to_string();
    let event_sidecar_ref = appended[1].payload["sidecarRef"]
        .as_object()
        .expect("output sidecar ref")
        .clone();
    assert_eq!(
        event_sidecar_ref
            .get("kind")
            .and_then(serde_json::Value::as_str),
        Some("tool_output")
    );
    assert!(event_sidecar_ref
        .get("relativePath")
        .and_then(serde_json::Value::as_str)
        .is_some_and(|value| value
            .starts_with("sessions/sess_coding_output_snapshot_owner/runtime-outputs/")));
    assert!(event_sidecar_ref
        .get("sha256")
        .and_then(serde_json::Value::as_str)
        .is_some_and(|value| value.starts_with("sha256:")));

    let snapshot_file = {
        let state = core
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let stored = state.sessions.get(&session_id).expect("stored session");
        let output = stored
            .output_blobs
            .get(output_ref.as_str())
            .expect("stored output blob");
        assert!(
            output.content.is_none(),
            "filesystem snapshot owner should remove inline content from stored output record"
        );
        let snapshot_file = output
            .snapshot_file
            .clone()
            .expect("stored output snapshot file");
        assert!(snapshot_file.starts_with("runtime-outputs/"));
        let sidecar_ref = output
            .sidecar_ref
            .as_ref()
            .expect("stored output sidecar ref");
        assert_eq!(sidecar_ref.kind, "tool_output");
        assert_eq!(
            sidecar_ref.relative_path,
            event_sidecar_ref
                .get("relativePath")
                .and_then(serde_json::Value::as_str)
                .expect("event sidecar relative path")
        );
        snapshot_file
    };
    let snapshot_path = snapshot_root
        .join("sessions")
        .join(session_id.as_str())
        .join(snapshot_file.as_str());
    assert_eq!(
        std::fs::read_to_string(snapshot_path).expect("stored output snapshot"),
        large_output
    );

    let read = read_session(&core, &session_id);
    let detail = read.detail.expect("session detail");
    let outputs = detail["outputs"].as_array().expect("detail outputs");
    assert!(outputs.iter().any(|output| {
        output["outputRef"].as_str() == Some(output_ref.as_str())
            && output["outputSnapshotFile"].as_str() == Some(snapshot_file.as_str())
            && output["sidecarRef"]["sha256"]
                .as_str()
                .is_some_and(|value| value.starts_with("sha256:"))
    }));

    let artifact_read = core
        .read_artifacts(ArtifactReadParams {
            session_id: session_id.clone(),
            turn_id: Some(turn_id),
            artifact_ref: Some(output_ref.clone()),
            include_content: Some(true),
            cursor: None,
            limit: None,
        })
        .expect("read output artifact");
    assert_eq!(artifact_read.artifacts.len(), 1);
    assert_eq!(artifact_read.artifacts[0].artifact_ref, output_ref);
    assert_eq!(
        artifact_read.artifacts[0].content.as_deref(),
        Some(large_output.as_str())
    );
    assert_eq!(
        artifact_read.artifacts[0].content_status,
        ArtifactContentStatus::Available
    );
}

#[tokio::test]
async fn start_turn_hydrates_persisted_coding_snapshot_refs_into_runtime_state() {
    let snapshot_root = unique_temp_dir("lime-runtime-hydrated-snapshots");
    let session_id = "sess_coding_hydrate";
    let turn_id = "turn_coding_hydrate";
    let output_ref = "output://hydrated-tool";
    let output_snapshot_file = "runtime-outputs/hydrated-tool.txt";
    let checkpoint_snapshot_file = "runtime-file-checkpoints/hydrated-app.txt";
    let output_content = "hydrated output\n".repeat(1024);
    let previous_content = "export function App() {\n  return null;\n}";
    let workspace_root = unique_temp_dir("lime-runtime-hydrated-workspace");
    std::fs::create_dir_all(
        snapshot_root
            .join("sessions")
            .join(session_id)
            .join("runtime-outputs"),
    )
    .expect("output snapshot dir");
    std::fs::create_dir_all(
        snapshot_root
            .join("sessions")
            .join(session_id)
            .join("runtime-file-checkpoints"),
    )
    .expect("checkpoint snapshot dir");
    std::fs::write(
        snapshot_root
            .join("sessions")
            .join(session_id)
            .join(output_snapshot_file),
        output_content.as_str(),
    )
    .expect("output snapshot");
    std::fs::write(
        snapshot_root
            .join("sessions")
            .join(session_id)
            .join(checkpoint_snapshot_file),
        previous_content,
    )
    .expect("checkpoint snapshot");
    std::fs::create_dir_all(workspace_root.join("src")).expect("workspace src");
    std::fs::write(workspace_root.join("src").join("App.tsx"), "<main />").expect("live file");

    let persisted_session = AgentSession {
        session_id: session_id.to_string(),
        thread_id: "thread_coding_hydrate".to_string(),
        app_id: "agent-runtime".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: session_id.to_string(),
            title: Some("Hydrated Coding".to_string()),
            uri: None,
            metadata: Some(json!({
                "workingDir": workspace_root.to_string_lossy(),
                "executionStrategy": "runtime-core"
            })),
        }),
        status: AgentSessionStatus::Completed,
        created_at: "2026-06-12T00:00:00.000Z".to_string(),
        updated_at: "2026-06-12T00:00:05.000Z".to_string(),
    };
    let persisted_turn = AgentTurn {
        turn_id: turn_id.to_string(),
        session_id: session_id.to_string(),
        thread_id: "thread_coding_hydrate".to_string(),
        status: AgentTurnStatus::Completed,
        started_at: Some("2026-06-12T00:00:01.000Z".to_string()),
        completed_at: Some("2026-06-12T00:00:05.000Z".to_string()),
    };
    let persisted = AgentSessionReadResponse {
        session: persisted_session,
        turns: vec![persisted_turn],
        detail: Some(json!({
            "id": session_id,
            "session_id": session_id,
            "thread_id": "thread_coding_hydrate",
            "working_dir": workspace_root.to_string_lossy(),
            "events": [
                {
                    "eventId": "evt_hydrated_output",
                    "sequence": 1,
                    "sessionId": session_id,
                    "threadId": "thread_coding_hydrate",
                    "turnId": turn_id,
                    "eventType": "tool.result",
                    "timestamp": "2026-06-12T00:00:02.000Z",
                    "payload": {
                        "toolCallId": "tool_hydrated",
                        "outputRef": output_ref,
                        "refIds": [output_ref],
                        "outputPreview": "hydrated output",
                        "outputTruncated": true,
                        "outputBytes": output_content.len(),
                        "outputSnapshotFile": output_snapshot_file
                    }
                }
            ],
            "outputs": [
                {
                    "outputRef": output_ref,
                    "refIds": [output_ref],
                    "preview": "hydrated output",
                    "outputBytes": output_content.len(),
                    "eventId": "evt_hydrated_output",
                    "sequence": 1,
                    "turnId": turn_id,
                    "eventType": "tool.result",
                    "timestamp": "2026-06-12T00:00:02.000Z",
                    "toolCallId": "tool_hydrated",
                    "outputSnapshotFile": output_snapshot_file
                }
            ],
            "items": [
                {
                    "id": "checkpoint_hydrated_app",
                    "type": "file_artifact",
                    "thread_id": "thread_coding_hydrate",
                    "turn_id": turn_id,
                    "path": "src/App.tsx",
                    "source": "runtime",
                    "status": "completed",
                    "updated_at": "2026-06-12T00:00:03.000Z",
                    "metadata": {
                        "artifactId": "artifact_hydrated_app",
                        "artifactRequestId": "evt_hydrated_file",
                        "artifactVersionId": "checkpoint_hydrated_app",
                        "artifactVersionNo": 2,
                        "artifactKind": "code_file",
                        "artifactStatus": "ready",
                        "checkpointRef": "checkpoint_hydrated_app",
                        "checkpointSnapshotFile": checkpoint_snapshot_file,
                        "file_change": {
                            "previousContentSnapshotFile": checkpoint_snapshot_file
                        }
                    }
                }
            ]
        })),
    };
    let app_data_source = Arc::new(TestCurrentTimelineDataSource::new(persisted));
    let core = RuntimeCore::with_backend(Arc::new(CodingLifecycleBackend))
        .with_app_data_source(app_data_source)
        .with_output_snapshot_store(Arc::new(FilesystemOutputSnapshotStore::with_base_dir(
            snapshot_root.clone(),
        )))
        .with_file_checkpoint_snapshot_store(Arc::new(
            FilesystemFileCheckpointSnapshotStore::with_base_dir(snapshot_root.clone()),
        ));

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: session_id.to_string(),
            turn_id: Some("turn_after_hydrate".to_string()),
            input: AgentInput {
                text: "继续 coding".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("hydrate then continue");

    let read = read_session(&core, session_id);
    let detail = read.detail.expect("hydrated detail");
    assert!(detail["outputs"]
        .as_array()
        .expect("outputs")
        .iter()
        .any(|output| output["outputRef"].as_str() == Some(output_ref)
            && output["outputSnapshotFile"].as_str() == Some(output_snapshot_file)));
    assert!(detail["items"]
        .as_array()
        .expect("items")
        .iter()
        .any(
            |item| item["id"].as_str() == Some("checkpoint_hydrated_app")
                && item["metadata"]["checkpointSnapshotFile"].as_str()
                    == Some(checkpoint_snapshot_file)
        ));

    let artifact_read = core
        .read_artifacts(ArtifactReadParams {
            session_id: session_id.to_string(),
            turn_id: Some(turn_id.to_string()),
            artifact_ref: Some(output_ref.to_string()),
            include_content: Some(true),
            cursor: None,
            limit: None,
        })
        .expect("read hydrated output artifact");
    assert_eq!(artifact_read.artifacts.len(), 1);
    assert_eq!(
        artifact_read.artifacts[0].content.as_deref(),
        Some(output_content.as_str())
    );

    let checkpoint = core
        .get_agent_session_file_checkpoint(AgentSessionFileCheckpointGetParams {
            session_id: session_id.to_string(),
            checkpoint_id: "checkpoint_hydrated_app".to_string(),
        })
        .await
        .expect("hydrated file checkpoint");
    assert_eq!(checkpoint.content.as_deref(), Some(previous_content));
}

#[tokio::test]
async fn file_changed_projects_to_file_checkpoint_api() {
    let checkpoint_snapshot_root = unique_temp_dir("lime-runtime-coding-checkpoint-snapshots");
    let core = RuntimeCore::default().with_file_checkpoint_snapshot_store(Arc::new(
        FilesystemFileCheckpointSnapshotStore::with_base_dir(checkpoint_snapshot_root.clone()),
    ));
    let workspace_root = unique_temp_dir("lime-runtime-coding-checkpoints");
    std::fs::create_dir_all(&workspace_root).expect("workspace root");
    let app_path = workspace_root.join("src").join("App.tsx");
    std::fs::create_dir_all(app_path.parent().expect("app parent")).expect("src dir");
    let previous_content = "export function App() {\n  return null;\n}";
    let changed_content = "export function App() {\n  return <main />;\n}";
    std::fs::write(&app_path, changed_content).expect("live changed file");
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_coding_file_checkpoint".to_string()),
        thread_id: Some("thread_coding_file_checkpoint".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("default".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "project".to_string(),
            id: "coding-checkpoint".to_string(),
            title: Some("Coding Checkpoint".to_string()),
            uri: None,
            metadata: Some(json!({
                "workingDir": workspace_root.to_string_lossy(),
                "executionStrategy": "runtime-core"
            })),
        }),
        locale: None,
    })
    .expect("session");
    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_coding_file_checkpoint".to_string(),
                turn_id: Some("turn_coding_file_checkpoint".to_string()),
                input: AgentInput {
                    text: "update app".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn")
        .response
        .turn;

    core.append_external_runtime_events(
        "sess_coding_file_checkpoint",
        Some(&turn.turn_id),
        vec![RuntimeEvent::new(
            "file.changed",
            json!({
                "path": "src/App.tsx",
                "artifactId": "artifact_src_app_after",
                "checkpointRef": "checkpoint_src_app_after",
                "contentRef": "content://src-app-after",
                "diffRef": "diff://src-app",
                "preview": "changed App component",
                "change": {
                    "previousContent": previous_content,
                    "diff": [
                        { "kind": "context", "value": "export function App() {" },
                        { "kind": "remove", "value": "  return null;" },
                        { "kind": "add", "value": "  return <main />;" },
                        { "kind": "context", "value": "}" }
                    ]
                }
            }),
        )],
    )
    .expect("file changed");
    let stored_events = core
        .events_for_session("sess_coding_file_checkpoint")
        .expect("stored events");
    let file_changed_event = stored_events
        .iter()
        .find(|event| event.event_type == "file.changed")
        .expect("stored file.changed event");
    let checkpoint_snapshot_file = file_changed_event.payload["checkpointSnapshotFile"]
        .as_str()
        .expect("checkpoint snapshot file")
        .to_string();
    assert!(checkpoint_snapshot_file.starts_with("runtime-file-checkpoints/"));
    assert!(file_changed_event.payload["sidecarRef"]["relativePath"]
        .as_str()
        .is_some_and(|value| value
            .starts_with("sessions/sess_coding_file_checkpoint/runtime-file-checkpoints/")));
    assert_eq!(
        file_changed_event.payload["sidecarRef"]["kind"].as_str(),
        Some("file_checkpoint")
    );
    assert!(file_changed_event.payload["sidecarRef"]["sha256"]
        .as_str()
        .is_some_and(|value| value.starts_with("sha256:")));
    assert!(
        file_changed_event.payload["change"]["previousContent"]
            .as_str()
            .is_none(),
        "checkpoint previous content should be stored through snapshot owner"
    );
    assert_eq!(
        file_changed_event.payload["change"]["previousContentSnapshotFile"].as_str(),
        Some(checkpoint_snapshot_file.as_str())
    );
    assert_eq!(
        std::fs::read_to_string(
            checkpoint_snapshot_root
                .join("sessions")
                .join("sess_coding_file_checkpoint")
                .join(checkpoint_snapshot_file.as_str())
        )
        .expect("stored checkpoint snapshot"),
        previous_content
    );

    let read = read_session(&core, "sess_coding_file_checkpoint");
    let items = read.detail.as_ref().expect("detail")["items"]
        .as_array()
        .expect("items");
    assert!(items.iter().any(|item| {
        item["type"].as_str() == Some("file_artifact")
            && item["id"].as_str() == Some("checkpoint_src_app_after")
            && item["path"].as_str() == Some("src/App.tsx")
    }));

    let list = core
        .list_agent_session_file_checkpoints(AgentSessionFileCheckpointListParams {
            session_id: "sess_coding_file_checkpoint".to_string(),
        })
        .await
        .expect("list file checkpoints");
    assert_eq!(list.checkpoint_count, 1);
    assert_eq!(
        list.checkpoints[0].checkpoint_id,
        "checkpoint_src_app_after"
    );
    assert_eq!(list.checkpoints[0].path, "src/App.tsx");
    assert_eq!(list.checkpoints[0].source, "runtime");
    assert_eq!(
        list.checkpoints[0].preview_text.as_deref(),
        Some("changed App component")
    );

    let detail = core
        .get_agent_session_file_checkpoint(AgentSessionFileCheckpointGetParams {
            session_id: "sess_coding_file_checkpoint".to_string(),
            checkpoint_id: "checkpoint_src_app_after".to_string(),
        })
        .await
        .expect("get file checkpoint");
    assert_eq!(detail.live_path, "src/App.tsx");
    assert_eq!(detail.snapshot_path, "src/App.tsx");
    assert_eq!(detail.content.as_deref(), Some(previous_content));
    assert_eq!(
        detail
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("checkpointSnapshotFile"))
            .and_then(serde_json::Value::as_str),
        Some(checkpoint_snapshot_file.as_str())
    );
    assert_eq!(
        detail
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("contentRef"))
            .and_then(serde_json::Value::as_str),
        Some("content://src-app-after")
    );

    let diff = core
        .diff_agent_session_file_checkpoint(AgentSessionFileCheckpointDiffParams {
            session_id: "sess_coding_file_checkpoint".to_string(),
            checkpoint_id: "checkpoint_src_app_after".to_string(),
        })
        .await
        .expect("diff file checkpoint");
    assert_eq!(
        diff.diff
            .as_ref()
            .and_then(|value| value.get("diffRef"))
            .and_then(serde_json::Value::as_str),
        Some("diff://src-app")
    );

    let restore = core
        .restore_agent_session_file_checkpoint(AgentSessionFileCheckpointRestoreParams {
            session_id: "sess_coding_file_checkpoint".to_string(),
            checkpoint_id: "checkpoint_src_app_after".to_string(),
            confirm_restore: true,
            create_backup: true,
        })
        .await
        .expect("restore file checkpoint");
    assert_eq!(restore.live_path, "src/App.tsx");
    assert_eq!(
        std::fs::read_to_string(&app_path).expect("restored live file"),
        previous_content
    );
    let backup_path = restore.backup_path.expect("restore backup path");
    assert_eq!(
        std::fs::read_to_string(workspace_root.join(backup_path)).expect("backup file"),
        changed_content
    );
}

#[tokio::test]
async fn append_external_runtime_events_rejects_coding_terminal_without_start() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_coding_terminal_without_start",
        "thread_coding_terminal_without_start",
        "turn_coding_terminal_without_start",
    )
    .await;
    let before = read_session(&core, &session_id);
    let before_event_count = event_count(&core, &session_id);

    let error = core
        .append_external_runtime_events(
            &session_id,
            Some(&turn_id),
            vec![RuntimeEvent::new(
                "command.exited",
                json!({
                    "commandId": "cmd_without_start",
                    "exitCode": 0
                }),
            )],
        )
        .expect_err("command.exited without command.started must fail closed");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("agent runtime event sequence validation failed"));
            assert!(message.contains("command_exited_without_start"));
        }
        other => panic!("expected backend sequence validation error, got {other:?}"),
    }

    let after = read_session(&core, &session_id);
    assert_eq!(event_count(&core, &session_id), before_event_count);
    assert_eq!(after.turns[0].status, before.turns[0].status);
    assert_eq!(after.session.status, before.session.status);
}

#[tokio::test]
async fn append_external_runtime_events_rejects_incomplete_coding_payload() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_coding_payload_guard",
        "thread_coding_payload_guard",
        "turn_coding_payload_guard",
    )
    .await;
    let before = read_session(&core, &session_id);
    let before_event_count = event_count(&core, &session_id);

    let error = core
        .append_external_runtime_events(
            &session_id,
            Some(&turn_id),
            vec![RuntimeEvent::new(
                "file.changed",
                json!({ "path": "src/App.tsx" }),
            )],
        )
        .expect_err("file.changed without artifact reference must fail closed");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("file.changed events must include artifactId or artifactRefs"));
        }
        other => panic!("expected backend payload validation error, got {other:?}"),
    }

    let after = read_session(&core, &session_id);
    assert_eq!(event_count(&core, &session_id), before_event_count);
    assert_eq!(after.turns[0].status, before.turns[0].status);
    assert_eq!(after.session.status, before.session.status);
}

#[tokio::test]
async fn append_external_runtime_events_ignores_coding_execution_after_terminal_turn() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_coding_terminal_ignore",
        "thread_coding_terminal_ignore",
        "turn_coding_terminal_ignore",
    )
    .await;

    core.append_external_runtime_events(
        &session_id,
        Some(&turn_id),
        vec![RuntimeEvent::new("turn.completed", json!({}))],
    )
    .expect("turn completion should append");
    let before = read_session(&core, &session_id);
    let before_event_count = event_count(&core, &session_id);

    let appended = core
        .append_external_runtime_events(
            &session_id,
            Some(&turn_id),
            vec![RuntimeEvent::new(
                "file.changed",
                json!({
                    "path": "src/App.tsx",
                    "artifactId": "late_artifact"
                }),
            )],
        )
        .expect("terminal turns ignore late runtime events");

    let after = read_session(&core, &session_id);
    assert!(appended.is_empty());
    assert_eq!(event_count(&core, &session_id), before_event_count);
    assert_eq!(before.turns[0].status, AgentTurnStatus::Completed);
    assert_eq!(after.turns[0].status, AgentTurnStatus::Completed);
    assert_eq!(after.session.status, before.session.status);
}

#[tokio::test]
async fn start_turn_accepts_backend_emitted_coding_lifecycle() {
    let core = RuntimeCore::with_backend(Arc::new(CodingLifecycleBackend));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_backend_coding_lifecycle".to_string()),
        thread_id: Some("thread_backend_coding_lifecycle".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("default".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_backend_coding_lifecycle".to_string(),
                turn_id: Some("turn_backend_coding_lifecycle".to_string()),
                input: AgentInput {
                    text: "update the project".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("backend coding lifecycle should complete");

    let event_types = output
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "message.created",
            "file.changed",
            "patch.started",
            "patch.applied",
            "command.started",
            "command.output",
            "command.exited",
            "test.started",
            "test.completed",
            "turn.completed",
        ]
    );
    assert_eq!(output.response.turn.status, AgentTurnStatus::Completed);

    let read = read_session(&core, "sess_backend_coding_lifecycle");
    assert_eq!(read.turns[0].status, AgentTurnStatus::Completed);
    assert_eq!(read.session.status, AgentSessionStatus::Completed);
}

#[tokio::test]
async fn start_turn_rejects_invalid_backend_coding_payload_before_storage() {
    let core = RuntimeCore::with_backend(Arc::new(InvalidCodingPayloadBackend));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_backend_coding_payload_guard".to_string()),
        thread_id: Some("thread_backend_coding_payload_guard".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("default".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let error = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_backend_coding_payload_guard".to_string(),
                turn_id: Some("turn_backend_coding_payload_guard".to_string()),
                input: AgentInput {
                    text: "update the project".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect_err("invalid backend coding event should fail closed");

    assert!(
        error
            .to_string()
            .contains("file.changed events must include artifactId or artifactRefs"),
        "{error}"
    );

    let read = read_session(&core, "sess_backend_coding_payload_guard");
    assert!(read.turns.is_empty());
    assert_eq!(read.session.status, AgentSessionStatus::Idle);
    assert_eq!(event_count(&core, "sess_backend_coding_payload_guard"), 0);
}
