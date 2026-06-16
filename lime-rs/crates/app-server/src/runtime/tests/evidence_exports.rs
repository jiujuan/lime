use super::support::*;
use super::*;
use app_server_protocol::ArtifactContentStatus;
use lime_infra::telemetry::TelemetryStore;
use std::fs;
use std::path::Path;

#[tokio::test]
async fn export_evidence_reads_session_turn_events_and_artifact_summaries() {
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let core = RuntimeCore::default().with_sidecar_store(Arc::new(
        SidecarStore::new(sidecar_root.path()).expect("sidecar store"),
    ));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_evidence".to_string()),
        thread_id: Some("thread_evidence".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_evidence".to_string(),
            turn_id: Some("turn_evidence".to_string()),
            input: AgentInput {
                text: "生成 evidence".to_string(),
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
        "sess_evidence",
        Some("turn_evidence"),
        vec![
            RuntimeEvent::new(
                "message.delta",
                json!({
                    "text": "draft",
                    "evidenceRefs": ["evidence://sess_evidence/runtime"]
                }),
            ),
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifactId": "artifact-report",
                    "path": ".app-server/artifacts/report.md",
                    "content": "# Report"
                }),
            ),
        ],
    )
    .expect("append evidence events");

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_evidence".to_string(),
            turn_id: Some("turn_evidence".to_string()),
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: None,
        })
        .await
        .expect("export evidence");

    assert_eq!(response.session.session_id, "sess_evidence");
    assert_eq!(response.turns.len(), 1);
    assert_eq!(response.turns[0].turn_id, "turn_evidence");
    assert_eq!(response.events.len(), 4);
    assert_eq!(response.events[0].event_type, "message.created");
    assert_eq!(response.events[0].payload["input"]["text"], "生成 evidence");
    assert_eq!(response.events[2].event_type, "message.delta");
    assert_eq!(response.artifacts.len(), 1);
    assert_eq!(response.artifacts[0].artifact_ref, "artifact-report");
    assert_eq!(response.artifacts[0].content, None);
    assert!(response.events[3].payload["content"].as_str().is_none());
    assert!(response.events[3].payload["sidecarRef"]["sha256"]
        .as_str()
        .is_some_and(|value| value.starts_with("sha256:")));
    assert_eq!(
        response.artifacts[0].content_status,
        ArtifactContentStatus::NotRequested
    );
    assert!(!response.exported_at.is_empty());
    let evidence_pack = response.evidence_pack.expect("basic evidence pack");
    assert_eq!(evidence_pack.thread_status, "running");
    assert_eq!(
        evidence_pack.latest_turn_status.as_deref(),
        Some("accepted")
    );
    assert_eq!(evidence_pack.turn_count, 1);
    assert_eq!(evidence_pack.item_count, 4);
    assert_eq!(evidence_pack.recent_artifact_count, 1);
    assert_eq!(
        evidence_pack
            .completion_audit_summary
            .as_ref()
            .and_then(|summary| summary.get("decision"))
            .and_then(serde_json::Value::as_str),
        Some("in_progress")
    );

    let summary_only = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_evidence".to_string(),
            turn_id: Some("turn_evidence".to_string()),
            include_events: Some(false),
            include_artifacts: Some(false),
            include_evidence_pack: Some(false),
        })
        .await
        .expect("export summary-only evidence");
    assert_eq!(summary_only.events.len(), 0);
    assert_eq!(summary_only.artifacts.len(), 0);
    assert_eq!(summary_only.turns.len(), 1);
    assert_eq!(summary_only.evidence_pack, None);
}

#[tokio::test]
async fn export_evidence_repairs_and_reads_jsonl_projection() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let event_log_writer = Arc::new(EventLogWriter::new(&roots.event_log_root).expect("writer"));
    let projection_store =
        Arc::new(ProjectionStore::initialize(&roots.projection_db_path).expect("projection"));
    let core = RuntimeCore::with_backend(Arc::new(CompletedBackend))
        .with_event_log_writer(event_log_writer.clone())
        .with_projection_store(projection_store.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_evidence_projection".to_string()),
        thread_id: Some("thread_evidence_projection".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_evidence_projection".to_string(),
            turn_id: Some("turn_evidence_projection".to_string()),
            input: AgentInput {
                text: "生成 projection evidence".to_string(),
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
    projection_store
        .clear_session("sess_evidence_projection")
        .expect("simulate missing projection");

    let app_data_source = Arc::new(TestSessionDataSource::new(
        empty_agent_session_read_response("legacy_unexpected"),
    ));
    let restarted_core = RuntimeCore::default()
        .with_event_log_writer(event_log_writer)
        .with_projection_store(projection_store)
        .with_app_data_source(app_data_source);

    let response = restarted_core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_evidence_projection".to_string(),
            turn_id: Some("turn_evidence_projection".to_string()),
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(true),
        })
        .await
        .expect("export evidence from projection");

    assert_eq!(response.session.session_id, "sess_evidence_projection");
    assert_eq!(response.session.thread_id, "thread_evidence_projection");
    assert_eq!(response.session.status, AgentSessionStatus::Completed);
    assert_eq!(response.turns.len(), 1);
    assert_eq!(response.turns[0].turn_id, "turn_evidence_projection");
    assert_eq!(response.turns[0].status, AgentTurnStatus::Completed);
    assert_eq!(response.events.len(), 4);
    assert_eq!(response.events[0].event_type, "message.created");
    assert_eq!(
        response.events[0].payload["input"]["text"],
        "生成 projection evidence"
    );
    assert_eq!(response.events[2].event_type, "message.delta");
    assert!(response.evidence_pack.is_some());
}

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
                "action.required",
                json!({
                    "actionId": "action_snapshot_evidence",
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

#[tokio::test]
async fn export_handoff_bundle_writes_current_session_bundle_to_workspace() {
    let temp = tempfile::tempdir().expect("workspace");
    let workspace_root = temp.path().to_string_lossy().to_string();
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_handoff".to_string()),
        thread_id: Some("thread_handoff".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_handoff".to_string(),
            title: Some("Current Handoff".to_string()),
            uri: None,
            metadata: Some(json!({
                "workspaceRoot": workspace_root,
                "model": "gpt-test",
                "executionStrategy": "runtime-core"
            })),
        }),
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_handoff".to_string(),
            turn_id: Some("turn_handoff".to_string()),
            input: AgentInput {
                text: "生成 handoff".to_string(),
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
        "sess_handoff",
        Some("turn_handoff"),
        vec![
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifactId": "artifact-handoff",
                    "path": ".app-server/artifacts/handoff.md",
                    "title": "Handoff Draft",
                    "kind": "markdown"
                }),
            ),
            RuntimeEvent::new("turn.completed", json!({})),
        ],
    )
    .expect("append events");

    let response = core
        .export_handoff_bundle(AgentSessionHandoffBundleExportParams {
            session_id: " sess_handoff ".to_string(),
            locale: Some("en-US".to_string()),
        })
        .await
        .expect("export handoff bundle");

    assert_eq!(response.session_id, "sess_handoff");
    assert_eq!(response.thread_id, "thread_handoff");
    assert_eq!(
        response.bundle_relative_root,
        ".lime/harness/sessions/sess_handoff"
    );
    assert_eq!(response.thread_status, "completed");
    assert_eq!(response.latest_turn_status.as_deref(), Some("completed"));
    assert_eq!(response.artifacts.len(), 4);
    let kinds = response
        .artifacts
        .iter()
        .map(|artifact| artifact.kind.as_str())
        .collect::<Vec<_>>();
    assert_eq!(kinds, vec!["plan", "progress", "handoff", "review_summary"]);
    for artifact in &response.artifacts {
        assert!(Path::new(&artifact.absolute_path).is_file());
        assert!(artifact
            .relative_path
            .starts_with(".lime/harness/sessions/sess_handoff/"));
        assert!(artifact.bytes > 0);
    }
    let progress_path = temp
        .path()
        .join(".lime")
        .join("harness")
        .join("sessions")
        .join("sess_handoff")
        .join("progress.json");
    let progress = fs::read_to_string(progress_path).expect("progress.json");
    assert!(progress.contains("\"schemaVersion\": \"agent-session-handoff-bundle.v1\""));
    assert!(progress.contains(".app-server/artifacts/handoff.md"));
}

#[tokio::test]
async fn export_runtime_review_residuals_write_current_session_artifacts() {
    let temp = tempfile::tempdir().expect("workspace");
    let workspace_root = temp.path().to_string_lossy().to_string();
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_review_export".to_string()),
        thread_id: Some("thread_review_export".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_review_export".to_string(),
            title: Some("Review Export".to_string()),
            uri: None,
            metadata: Some(json!({
                "workspaceRoot": workspace_root,
            })),
        }),
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_review_export".to_string(),
            turn_id: Some("turn_review_export".to_string()),
            input: AgentInput {
                text: "生成 review export".to_string(),
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
        "sess_review_export",
        Some("turn_review_export"),
        vec![
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifactId": "artifact-review",
                    "path": ".app-server/artifacts/review.md",
                    "title": "Review Draft",
                    "kind": "markdown"
                }),
            ),
            RuntimeEvent::new("turn.completed", json!({})),
        ],
    )
    .expect("append events");

    let replay = core
        .export_replay_case(AgentSessionReplayCaseExportParams {
            session_id: "sess_review_export".to_string(),
            locale: None,
        })
        .await
        .expect("replay");
    assert_eq!(replay.artifacts.len(), 4);
    assert_eq!(replay.artifacts[0].kind, "input");
    assert!(Path::new(&replay.artifacts[0].absolute_path).is_file());

    let analysis = core
        .export_analysis_handoff(AgentSessionAnalysisHandoffExportParams {
            session_id: "sess_review_export".to_string(),
            locale: None,
        })
        .await
        .expect("analysis");
    assert_eq!(analysis.artifacts.len(), 2);
    assert_eq!(analysis.artifacts[0].kind, "analysis_brief");
    assert!(analysis.copy_prompt.contains("sess_review_export"));

    let review = core
        .export_review_decision_template(AgentSessionReviewDecisionTemplateExportParams {
            session_id: "sess_review_export".to_string(),
            locale: None,
        })
        .await
        .expect("review template");
    assert_eq!(review.artifacts.len(), 2);
    assert_eq!(review.decision.decision_status, "pending_review");

    let saved = core
        .save_review_decision(AgentSessionReviewDecisionSaveParams {
            session_id: "sess_review_export".to_string(),
            decision_status: "accepted".to_string(),
            decision_summary: "current path accepted".to_string(),
            chosen_fix_strategy: "keep app server path".to_string(),
            risk_level: "low".to_string(),
            risk_tags: vec!["runtime".to_string()],
            human_reviewer: "reviewer".to_string(),
            followup_actions: vec!["run contracts".to_string()],
            regression_requirements: vec!["npm run test:contracts".to_string()],
            notes: "done".to_string(),
            locale: None,
        })
        .await
        .expect("save review");
    assert_eq!(saved.decision.decision_status, "accepted");
    let review_json = fs::read_to_string(
        temp.path()
            .join(".lime")
            .join("harness")
            .join("sessions")
            .join("sess_review_export")
            .join("review")
            .join("review-decision.json"),
    )
    .expect("review decision json");
    assert!(review_json.contains("current path accepted"));
}

#[tokio::test]
async fn export_evidence_uses_injected_evidence_pack_provider() {
    let provider = Arc::new(TestEvidenceExportProvider::default());
    let core = RuntimeCore::with_backend_capability_source_artifact_content_provider_and_evidence_export_provider(
            Arc::new(MockBackend),
            Arc::new(CapabilityInventorySource::default()),
            Arc::new(InlineArtifactContentProvider),
            provider.clone(),
        );
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_evidence".to_string()),
        thread_id: Some("thread_evidence".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_evidence".to_string(),
            turn_id: Some("turn_evidence".to_string()),
            input: AgentInput {
                text: "生成 evidence".to_string(),
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
        "sess_evidence",
        Some("turn_evidence"),
        vec![RuntimeEvent::new(
            "artifact.snapshot",
            json!({
                "artifactId": "artifact-report",
                "path": ".app-server/artifacts/report.md"
            }),
        )],
    )
    .expect("append evidence events");

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_evidence".to_string(),
            turn_id: Some("turn_evidence".to_string()),
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: None,
        })
        .await
        .expect("export evidence");

    assert_eq!(provider.call_count.load(Ordering::SeqCst), 1);
    let requests = provider
        .requests
        .lock()
        .expect("test evidence requests mutex poisoned");
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].session.session_id, "sess_evidence");
    assert_eq!(requests[0].turns[0].turn_id, "turn_evidence");
    assert_eq!(requests[0].events.len(), 3);
    assert_eq!(requests[0].artifacts[0].artifact_ref, "artifact-report");

    let evidence_pack = response.evidence_pack.expect("evidence pack");
    assert_eq!(evidence_pack.thread_status, "running");
    assert_eq!(
        evidence_pack.latest_turn_status.as_deref(),
        Some("accepted")
    );
    assert_eq!(evidence_pack.turn_count, 1);
    assert_eq!(evidence_pack.recent_artifact_count, 1);
    assert_eq!(
        evidence_pack
            .completion_audit_summary
            .as_ref()
            .and_then(|summary| summary.get("decision"))
            .and_then(|decision| decision.as_str()),
        Some("in_progress")
    );
}

#[tokio::test]
async fn export_evidence_reads_request_logs_from_telemetry_store() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let telemetry_store =
        TelemetryStore::initialize(&roots.telemetry_db_path).expect("telemetry store");
    let mut request_log = lime_infra::telemetry::RequestLog::new(
        "request-telemetry-1".to_string(),
        lime_core::ProviderType::OpenAI,
        "gpt-4o".to_string(),
        true,
    );
    request_log.session_id = Some("sess_telemetry_export".to_string());
    request_log.thread_id = Some("thread_telemetry_export".to_string());
    request_log.turn_id = Some("turn_telemetry_export".to_string());
    request_log.mark_success(125, 200);
    telemetry_store
        .upsert_request_log(&request_log)
        .expect("upsert telemetry log");

    let core = RuntimeCore::default()
        .with_telemetry_store(Arc::new(telemetry_store))
        .with_event_log_writer(Arc::new(
            EventLogWriter::new(&roots.event_log_root).expect("writer"),
        ))
        .with_projection_store(Arc::new(
            ProjectionStore::initialize(&roots.projection_db_path).expect("projection"),
        ));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_telemetry_export".to_string()),
        thread_id: Some("thread_telemetry_export".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_telemetry_export".to_string(),
            turn_id: Some("turn_telemetry_export".to_string()),
            input: AgentInput {
                text: "生成 telemetry evidence".to_string(),
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

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_telemetry_export".to_string(),
            turn_id: Some("turn_telemetry_export".to_string()),
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(true),
        })
        .await
        .expect("export evidence");

    let evidence_pack = response.evidence_pack.expect("evidence pack");
    let request_telemetry = evidence_pack
        .observability_summary
        .as_ref()
        .and_then(|summary| summary.get("request_telemetry"))
        .expect("request telemetry summary");
    assert_eq!(
        request_telemetry
            .get("status")
            .and_then(serde_json::Value::as_str),
        Some("exported")
    );
    assert_eq!(
        request_telemetry
            .get("requestCount")
            .and_then(serde_json::Value::as_u64),
        Some(1)
    );
    assert_eq!(
        request_telemetry
            .get("sessionRequestCount")
            .and_then(serde_json::Value::as_u64),
        Some(1)
    );
    assert_eq!(
        request_telemetry
            .get("turnRequestCount")
            .and_then(serde_json::Value::as_u64),
        Some(1)
    );
    assert_eq!(
        request_telemetry
            .get("statusBreakdown")
            .and_then(|value| value.get("success"))
            .and_then(serde_json::Value::as_u64),
        Some(1)
    );
    assert_eq!(
        request_telemetry
            .get("statusBreakdown")
            .and_then(|value| value.get("failed"))
            .and_then(serde_json::Value::as_u64),
        Some(0)
    );
    assert_eq!(
        request_telemetry
            .get("statusBreakdown")
            .and_then(|value| value.get("timeout"))
            .and_then(serde_json::Value::as_u64),
        Some(0)
    );
    assert_eq!(
        request_telemetry
            .get("statusBreakdown")
            .and_then(|value| value.get("cancelled"))
            .and_then(serde_json::Value::as_u64),
        Some(0)
    );
}

#[tokio::test]
async fn export_evidence_can_skip_injected_evidence_pack_provider() {
    let provider = Arc::new(TestEvidenceExportProvider::default());
    let core = RuntimeCore::with_backend_capability_source_artifact_content_provider_and_evidence_export_provider(
            Arc::new(MockBackend),
            Arc::new(CapabilityInventorySource::default()),
            Arc::new(InlineArtifactContentProvider),
            provider.clone(),
        );
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_evidence".to_string()),
        thread_id: Some("thread_evidence".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_evidence".to_string(),
            turn_id: None,
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(false),
        })
        .await
        .expect("export evidence");

    assert_eq!(provider.call_count.load(Ordering::SeqCst), 0);
    assert_eq!(response.evidence_pack, None);
}

#[tokio::test]
async fn default_runtime_exports_basic_evidence_pack_without_desktop_provider() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_basic_evidence".to_string()),
        thread_id: Some("thread_basic_evidence".to_string()),
        app_id: "agent-runtime".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_basic_evidence".to_string(),
            turn_id: Some("turn_basic_evidence".to_string()),
            input: AgentInput {
                text: "生成基础 evidence".to_string(),
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

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_basic_evidence".to_string(),
            turn_id: None,
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(true),
        })
        .await
        .expect("export evidence");

    let evidence_pack = response.evidence_pack.expect("basic evidence pack");
    assert_eq!(
        evidence_pack.pack_relative_root,
        ".lime/harness/sessions/sess_basic_evidence/evidence"
    );
    assert_eq!(evidence_pack.thread_status, "running");
    assert_eq!(
        evidence_pack
            .completion_audit_summary
            .as_ref()
            .and_then(|summary| summary.get("decision"))
            .and_then(serde_json::Value::as_str),
        Some("in_progress")
    );
    assert_eq!(
        evidence_pack
            .observability_summary
            .as_ref()
            .and_then(|summary| summary.get("source"))
            .and_then(serde_json::Value::as_str),
        Some("app-server-basic")
    );
}
