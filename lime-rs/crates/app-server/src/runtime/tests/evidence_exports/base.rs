use super::*;

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
