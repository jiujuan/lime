use super::*;

#[tokio::test]
async fn export_evidence_pack_includes_coding_snapshot_artifacts() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_coding_snapshot_evidence".to_string()),
        thread_id: Some("thread_coding_snapshot_evidence".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_coding_snapshot_evidence".to_string(),
            turn_id: Some("turn_coding_snapshot_evidence".to_string()),
            input: AgentInput {
                text: "生成 coding evidence".to_string(),
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
    core.append_external_runtime_events(
        "sess_coding_snapshot_evidence",
        Some("turn_coding_snapshot_evidence"),
        vec![
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "tool_snapshot_evidence",
                    "toolName": "Bash"
                }),
            ),
            RuntimeEvent::new(
                "action.required",
                json!({
                    "toolCallId": "tool_snapshot_evidence",
                    "actionId": "action_snapshot_evidence",
                    "requestId": "action_snapshot_evidence",
                    "kind": "tool_confirmation",
                    "evidenceRefs": ["evidence://snapshot-evidence/action"]
                }),
            ),
            RuntimeEvent::new(
                "action.resolved",
                json!({
                    "actionId": "action_snapshot_evidence",
                    "decision": "approved"
                }),
            ),
            RuntimeEvent::new(
                "tool.result",
                json!({
                    "toolCallId": "tool_snapshot_evidence",
                    "outputRef": "output://snapshot-evidence",
                    "outputPreview": "snapshot output",
                    "outputBytes": 42,
                    "outputSnapshotFile": "runtime-outputs/snapshot-evidence.txt",
                    "sidecarRef": {
                        "ref": "sidecar://tool_output/snapshot-evidence",
                        "kind": "tool_output",
                        "relativePath": "sessions/sess_coding_snapshot_evidence/runtime-outputs/snapshot-evidence.txt",
                        "bytes": 42,
                        "sha256": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                        "contentStatus": "available",
                        "createdAt": "2026-06-14T00:00:00.000Z"
                    }
                }),
            ),
            RuntimeEvent::new(
                "file.changed",
                json!({
                    "path": "src/App.tsx",
                    "artifactId": "artifact_snapshot_evidence",
                    "checkpointRef": "checkpoint_snapshot_evidence",
                    "diffRef": "diff://snapshot-evidence",
                    "checkpointSnapshotFile": "runtime-file-checkpoints/snapshot-evidence.txt",
                    "sidecarRef": {
                        "ref": "sidecar://file_checkpoint/snapshot-evidence",
                        "kind": "file_checkpoint",
                        "relativePath": "sessions/sess_coding_snapshot_evidence/runtime-file-checkpoints/snapshot-evidence.txt",
                        "bytes": 24,
                        "sha256": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                        "contentStatus": "available",
                        "createdAt": "2026-06-14T00:00:00.000Z"
                    },
                    "change": {
                        "previousContentSnapshotFile": "runtime-file-checkpoints/snapshot-evidence.txt",
                        "artifactRefs": ["artifact://snapshot-evidence/change"],
                        "sidecarRef": {
                            "ref": "sidecar://file_checkpoint/snapshot-evidence",
                            "kind": "file_checkpoint",
                            "relativePath": "sessions/sess_coding_snapshot_evidence/runtime-file-checkpoints/snapshot-evidence.txt",
                            "bytes": 24,
                            "sha256": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                            "contentStatus": "available",
                            "createdAt": "2026-06-14T00:00:00.000Z"
                        }
                    }
                }),
            ),
            RuntimeEvent::new(
                "patch.started",
                json!({
                    "patchId": "patch_snapshot_evidence",
                    "diffRef": "diff://snapshot-evidence",
                    "artifactRefs": ["artifact://snapshot-evidence/patch"]
                }),
            ),
            RuntimeEvent::new(
                "patch.failed",
                json!({
                    "patchId": "patch_snapshot_evidence",
                    "diffRef": "diff://snapshot-evidence",
                    "failureCategory": "apply_failed"
                }),
            ),
            RuntimeEvent::new(
                "command.started",
                json!({
                    "commandId": "cmd_snapshot_evidence",
                    "commandSummary": "npm test",
                    "outputRef": "output://snapshot-evidence"
                }),
            ),
            RuntimeEvent::new(
                "command.output",
                json!({
                    "commandId": "cmd_snapshot_evidence",
                    "stream": "stderr",
                    "refIds": ["output://snapshot-evidence"]
                }),
            ),
            RuntimeEvent::new(
                "test.started",
                json!({
                    "testRunId": "test_snapshot_evidence",
                    "commandId": "cmd_snapshot_evidence",
                    "suite": "coding evidence"
                }),
            ),
            RuntimeEvent::new(
                "command.exited",
                json!({
                    "commandId": "cmd_snapshot_evidence",
                    "exitCode": 1,
                    "outputRef": "output://snapshot-evidence"
                }),
            ),
            RuntimeEvent::new(
                "test.completed",
                json!({
                    "testRunId": "test_snapshot_evidence",
                    "commandId": "cmd_snapshot_evidence",
                    "result": "failed",
                    "failed": 1,
                    "outputRefs": ["output://snapshot-evidence"]
                }),
            ),
            RuntimeEvent::new(
                "message.delta",
                json!({
                    "text": "继续修复",
                    "harness": {
                        "coding_workbench_recovery": {
                            "source": "coding_workbench",
                            "outputRefs": ["output://snapshot-evidence"],
                            "evidenceRefs": ["evidence://snapshot-evidence/recovery"]
                        }
                    }
                }),
            ),
        ],
    )
    .expect("append coding evidence events");

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_coding_snapshot_evidence".to_string(),
            turn_id: Some("turn_coding_snapshot_evidence".to_string()),
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(true),
        })
        .await
        .expect("export evidence");
    let file_changed_event_id = response
        .events
        .iter()
        .find(|event| event.event_type == "file.changed")
        .map(|event| event.event_id.clone())
        .expect("file.changed event id");
    let recovery_event_id = response
        .events
        .iter()
        .find(|event| {
            event.event_type == "message.delta"
                && event
                    .payload
                    .get("harness")
                    .and_then(serde_json::Value::as_object)
                    .is_some()
        })
        .map(|event| event.event_id.clone())
        .expect("recovery event id");
    let action_resolved = response
        .events
        .iter()
        .find(|event| event.event_type == "action.resolved")
        .expect("action resolved event");
    assert_eq!(
        action_resolved.payload["toolCallId"],
        "tool_snapshot_evidence"
    );
    let evidence_pack = response.evidence_pack.expect("evidence pack");
    assert!(evidence_pack.artifacts.iter().any(|artifact| {
        artifact.kind == "tool_output_snapshot"
            && artifact.relative_path == "runtime-outputs/snapshot-evidence.txt"
    }));
    assert!(evidence_pack.artifacts.iter().any(|artifact| {
        artifact.kind == "file_checkpoint_snapshot"
            && artifact.relative_path == "runtime-file-checkpoints/snapshot-evidence.txt"
    }));
    assert!(evidence_pack.artifacts.iter().any(|artifact| {
        artifact.kind == "tool_output"
            && artifact.relative_path
                == "sessions/sess_coding_snapshot_evidence/runtime-outputs/snapshot-evidence.txt"
            && artifact.bytes == 42
    }));
    assert!(evidence_pack.artifacts.iter().any(|artifact| {
        artifact.kind == "file_checkpoint"
            && artifact.relative_path
                == "sessions/sess_coding_snapshot_evidence/runtime-file-checkpoints/snapshot-evidence.txt"
            && artifact.bytes == 24
    }));
    assert_eq!(
        evidence_pack
            .observability_summary
            .as_ref()
            .and_then(|summary| summary.get("evidence_artifact_count"))
            .and_then(serde_json::Value::as_u64),
        Some(evidence_pack.artifacts.len() as u64)
    );
    let coding_summary = evidence_pack
        .observability_summary
        .as_ref()
        .and_then(|summary| summary.get("coding"))
        .expect("coding evidence summary");
    assert_eq!(
        coding_summary["schemaVersion"],
        "coding-evidence-summary.v1"
    );
    assert_eq!(coding_summary["fileChangeCount"], 1);
    assert_eq!(coding_summary["patchCount"], 1);
    assert_eq!(coding_summary["failedPatchCount"], 1);
    assert_eq!(coding_summary["commandCount"], 1);
    assert_eq!(coding_summary["failedCommandCount"], 1);
    assert_eq!(coding_summary["testCount"], 1);
    assert_eq!(coding_summary["failedTestCount"], 1);
    assert_eq!(coding_summary["actionRequiredCount"], 1);
    assert_eq!(coding_summary["actionResolvedCount"], 1);
    assert_eq!(coding_summary["recoveryRequestCount"], 1);
    assert_json_array_contains(coding_summary, "outputRefs", "output://snapshot-evidence");
    assert_json_array_contains(coding_summary, "diffRefs", "diff://snapshot-evidence");
    assert_json_array_contains(
        coding_summary,
        "checkpointRefs",
        "checkpoint_snapshot_evidence",
    );
    assert_json_array_contains(coding_summary, "artifactRefs", "artifact_snapshot_evidence");
    assert_json_array_contains(
        coding_summary,
        "artifactRefs",
        "artifact://snapshot-evidence/change",
    );
    assert_json_array_contains(
        coding_summary,
        "evidenceRefs",
        "evidence://snapshot-evidence/action",
    );
    assert_json_array_contains(
        coding_summary,
        "evidenceRefs",
        "evidence://snapshot-evidence/recovery",
    );
    assert_json_array_contains(
        coding_summary,
        "actionRequestIds",
        "action_snapshot_evidence",
    );
    assert_json_array_contains(
        coding_summary,
        "actionToolCallIds",
        "tool_snapshot_evidence",
    );
    assert_json_array_contains(coding_summary, "sourceEventIds", &file_changed_event_id);
    assert_json_array_contains(coding_summary, "sourceEventIds", &recovery_event_id);
}

fn assert_json_array_contains(value: &serde_json::Value, key: &str, expected: &str) {
    assert!(
        value
            .get(key)
            .and_then(serde_json::Value::as_array)
            .is_some_and(|items| items.iter().any(|item| item.as_str() == Some(expected))),
        "{key} should contain {expected}; actual={:?}",
        value.get(key)
    );
}
