use super::support::*;
use super::*;
use app_server_protocol::ArtifactContentStatus;
use std::fs;
use std::path::Path;

#[tokio::test]
async fn export_evidence_reads_session_turn_events_and_artifact_summaries() {
    let core = RuntimeCore::default();
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
    assert_eq!(response.events.len(), 3);
    assert_eq!(response.events[1].event_type, "message.delta");
    assert_eq!(response.artifacts.len(), 1);
    assert_eq!(response.artifacts[0].artifact_ref, "artifact-report");
    assert_eq!(response.artifacts[0].content, None);
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
    assert_eq!(evidence_pack.item_count, 3);
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
                    "outputSnapshotFile": "runtime-outputs/snapshot-evidence.txt"
                }),
            ),
            RuntimeEvent::new(
                "file.changed",
                json!({
                    "path": "src/App.tsx",
                    "artifactId": "artifact_snapshot_evidence",
                    "checkpointRef": "checkpoint_snapshot_evidence",
                    "checkpointSnapshotFile": "runtime-file-checkpoints/snapshot-evidence.txt",
                    "change": {
                        "previousContentSnapshotFile": "runtime-file-checkpoints/snapshot-evidence.txt"
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
    let evidence_pack = response.evidence_pack.expect("evidence pack");
    assert!(evidence_pack.artifacts.iter().any(|artifact| {
        artifact.kind == "tool_output_snapshot"
            && artifact.relative_path == "runtime-outputs/snapshot-evidence.txt"
    }));
    assert!(evidence_pack.artifacts.iter().any(|artifact| {
        artifact.kind == "file_checkpoint_snapshot"
            && artifact.relative_path == "runtime-file-checkpoints/snapshot-evidence.txt"
    }));
    assert_eq!(
        evidence_pack
            .observability_summary
            .as_ref()
            .and_then(|summary| summary.get("evidence_artifact_count"))
            .and_then(serde_json::Value::as_u64),
        Some(evidence_pack.artifacts.len() as u64)
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
    assert_eq!(requests[0].events.len(), 2);
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
