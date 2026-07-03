use super::support::*;
use super::*;

#[tokio::test]
async fn resume_queued_turn_does_not_write_workflow_resume_audit_without_worker_lifecycle() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let event_log_writer = Arc::new(EventLogWriter::new(&roots.event_log_root).expect("writer"));
    let core = RuntimeCore::with_backend(Arc::new(RecordingBackend::default()))
        .with_event_log_writer(event_log_writer.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_queue_resume_audit".to_string()),
        thread_id: Some("thread_queue_resume_audit".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_queue_resume_audit".to_string(),
            turn_id: Some("turn_running".to_string()),
            input: AgentInput {
                text: "running content workflow".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("running turn");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_queue_resume_audit".to_string(),
            turn_id: Some("turn_queued".to_string()),
            input: AgentInput {
                text: "queued follow-up".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: true,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("queued turn");

    let workflow_output = core
        .append_external_runtime_events(
            "sess_queue_resume_audit",
            Some("turn_running"),
            vec![
                RuntimeEvent::new(
                    "workflow.run.started",
                    json!({
                        "workflowRunId": "turn_running:content-article",
                        "workflowKey": "content_article_workflow",
                        "status": "running",
                        "metadata": {
                            "pluginWorkflow": {
                                "status": "running"
                            }
                        }
                    }),
                ),
                RuntimeEvent::new(
                    "workflow.run.completed",
                    json!({
                        "workflowRunId": "turn_running:content-article",
                        "workflowKey": "content_article_workflow",
                        "status": "completed",
                        "metadata": {
                            "pluginWorkflow": {
                                "status": "completed"
                            }
                        }
                    }),
                ),
            ],
        )
        .expect("append workflow audit events");
    assert!(
        workflow_output.is_empty(),
        "workflow audit events must not enter regular runtime output: {workflow_output:?}"
    );
    core.append_external_runtime_events(
        "sess_queue_resume_audit",
        Some("turn_running"),
        vec![RuntimeEvent::new("turn.completed", json!({}))],
    )
    .expect("complete running turn");

    let resumed = core
        .resume_agent_session_thread(
            AgentSessionThreadResumeParams {
                session_id: "sess_queue_resume_audit".to_string(),
                resume_contract: None,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("resume queued");
    assert!(resumed.response.resumed);
    assert!(resumed
        .response
        .turns
        .iter()
        .any(|turn| turn.turn_id == "turn_queued" && turn.status == AgentTurnStatus::Accepted));

    let regular_records = event_log_writer
        .read_session_events("sess_queue_resume_audit")
        .expect("regular records");
    assert!(
        regular_records
            .iter()
            .all(|record| !record.event.event_type.starts_with("workflow.")),
        "workflow audit events must stay out of regular session JSONL"
    );
    let audit_records = event_log_writer
        .read_session_workflow_audit_events("sess_queue_resume_audit")
        .expect("workflow audit records");
    let event_types = audit_records
        .iter()
        .map(|record| record.event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec!["workflow.run.started", "workflow.run.completed"]
    );
    assert!(
        audit_records
            .iter()
            .all(|record| !record.event.event_type.contains("resum")),
        "agentSession/thread/resume must not forge plugin worker resume audit events"
    );
}
