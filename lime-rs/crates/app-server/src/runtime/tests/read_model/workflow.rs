use super::*;
use std::sync::Arc;

#[tokio::test]
async fn read_session_hides_workflow_facts_from_runtime_events() {
    let event_log_root = tempfile::tempdir().expect("event log root");
    let event_log_writer =
        Arc::new(EventLogWriter::new(event_log_root.path()).expect("event log writer"));
    let core = RuntimeCore::default().with_event_log_writer(event_log_writer);
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_workflow_read".to_string()),
        thread_id: Some("thread_workflow_read".to_string()),
        app_id: "content-factory-app".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_workflow_read".to_string(),
            turn_id: Some("turn_workflow_read".to_string()),
            input: AgentInput {
                text: "@写文章 写一篇 Go 学习路线".to_string(),
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
        "sess_workflow_read",
        Some("turn_workflow_read"),
        vec![
            RuntimeEvent::new(
                "workflow.run.started",
                json!({
                    "workflowRunId": "task-article:workflow",
                    "workflowKey": "content_article_workflow",
                    "workflowTitle": "写文章工作流",
                    "appId": "content-factory-app",
                    "sessionId": "sess_workflow_read",
                    "workspaceId": "workspace-main",
                    "turnId": "turn_workflow_read",
                    "taskId": "task-article",
                    "taskKind": "content.article.generate",
                    "status": "running",
                    "selectedObjectRef": {
                        "appId": "content-factory-app",
                        "kind": "articleDraft",
                        "id": "article-1"
                    },
                    "steps": [
                        {
                            "stepId": "research",
                            "stepTitle": "资料检索",
                            "stepIndex": 0,
                            "stepCount": 2,
                            "status": "running",
                            "subagent": "content-researcher",
                            "skillRefs": ["article-research"],
                            "expectedOutput": "写作依据和素材摘要"
                        },
                        {
                            "stepId": "draft",
                            "stepTitle": "正文写作",
                            "stepIndex": 1,
                            "stepCount": 2,
                            "status": "pending",
                            "subagent": "article-writer",
                            "skillRefs": ["article-writing"],
                            "expectedOutput": "articleDraft"
                        }
                    ]
                }),
            ),
            RuntimeEvent::new(
                "workflow.step.progress",
                json!({
                    "workflowRunId": "task-article:workflow",
                    "workflowKey": "content_article_workflow",
                    "stepId": "research",
                    "stepTitle": "资料检索",
                    "stepIndex": 0,
                    "stepCount": 2,
                    "status": "running",
                    "progressMessage": "正在检索 Go 学习路线素材"
                }),
            ),
            RuntimeEvent::new(
                "workflow.step.completed",
                json!({
                    "workflowRunId": "task-article:workflow",
                    "workflowKey": "content_article_workflow",
                    "stepId": "research",
                    "stepTitle": "资料检索",
                    "stepIndex": 0,
                    "stepCount": 2,
                    "status": "completed",
                    "detail": {
                        "sourceCount": 3
                    }
                }),
            ),
            RuntimeEvent::new(
                "workflow.run.completed",
                json!({
                    "workflowRunId": "task-article:workflow",
                    "workflowKey": "content_article_workflow",
                    "workflowTitle": "写文章工作流",
                    "status": "completed",
                    "taskId": "task-article",
                    "taskKind": "content.article.generate"
                }),
            ),
        ],
    )
    .expect("append workflow events");

    let workflow = core
        .read_workflow_current(WorkflowReadParams {
            session_id: "sess_workflow_read".to_string(),
        })
        .await
        .expect("workflow read");
    assert_eq!(
        workflow.workflow["activeWorkflowRunId"],
        serde_json::Value::Null
    );
    assert_eq!(
        workflow.workflow_runs[0]["workflowRunId"],
        "task-article:workflow"
    );
    assert_eq!(
        workflow.workflow_runs[0]["workflowKey"],
        "content_article_workflow"
    );
    assert_eq!(workflow.workflow_runs[0]["status"], "completed");
    assert_eq!(workflow.workflow_runs[0]["stepCounts"]["total"], 2);
    assert_eq!(workflow.workflow_runs[0]["stepCounts"]["completed"], 1);
    assert_eq!(workflow.workflow_runs[0]["stepCounts"]["queued"], 1);
    assert_eq!(workflow.workflow_steps[0]["stepId"], "draft");
    assert_eq!(workflow.workflow_steps[0]["status"], "queued");
    assert_eq!(workflow.workflow_steps[1]["stepId"], "research");
    assert_eq!(workflow.workflow_steps[1]["status"], "completed");

    let detail = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_workflow_read".to_string(),
            history_limit: Some(20),
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read")
        .detail
        .expect("detail");
    let thread_read = &detail["thread_read"];
    assert!(thread_read.get("workflow").is_none());
    assert!(thread_read.get("workflow_runs").is_none());
    assert!(thread_read.get("workflowRuns").is_none());
    assert!(thread_read.get("workflow_steps").is_none());
    assert!(thread_read.get("workflowSteps").is_none());
    assert!(detail.get("workflow_runs").is_none());
    assert!(detail.get("workflowRuns").is_none());
    assert!(detail.get("workflow_steps").is_none());
    assert!(detail.get("workflowSteps").is_none());
}

#[tokio::test]
async fn workflow_read_returns_current_read_model_from_audit_log() {
    let event_log_root = tempfile::tempdir().expect("event log root");
    let event_log_writer =
        Arc::new(EventLogWriter::new(event_log_root.path()).expect("event log writer"));
    let core = RuntimeCore::default().with_event_log_writer(event_log_writer);
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_workflow_read_current".to_string()),
        thread_id: Some("thread_workflow_read_current".to_string()),
        app_id: "content-factory-app".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.append_external_runtime_events(
        "sess_workflow_read_current",
        None,
        vec![
            RuntimeEvent::new(
                "workflow.run.started",
                json!({
                    "workflowRunId": "task-current:workflow",
                    "workflowKey": "content_article_workflow",
                    "workflowTitle": "写文章工作流",
                    "status": "running",
                    "steps": [{
                        "stepId": "outline",
                        "stepTitle": "提纲规划",
                        "stepIndex": 0,
                        "stepCount": 1,
                        "status": "running"
                    }]
                }),
            ),
            RuntimeEvent::new(
                "workflow.run.completed",
                json!({
                    "workflowRunId": "task-current:workflow",
                    "workflowKey": "content_article_workflow",
                    "status": "completed"
                }),
            ),
        ],
    )
    .expect("append workflow events");

    let workflow = core
        .read_workflow_current(WorkflowReadParams {
            session_id: "sess_workflow_read_current".to_string(),
        })
        .await
        .expect("workflow read");

    assert_eq!(workflow.session_id, "sess_workflow_read_current");
    assert_eq!(
        workflow.workflow_runs[0]["workflowRunId"],
        "task-current:workflow"
    );
    assert_eq!(workflow.workflow_runs[0]["status"], "completed");
    assert_eq!(workflow.workflow_steps[0]["stepId"], "outline");

    let session = core
        .read_session_current(AgentSessionReadParams {
            session_id: "sess_workflow_read_current".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("current session read");
    let thread_read = &session.detail.expect("detail")["thread_read"];
    assert!(thread_read.get("workflow").is_none());
    assert!(thread_read.get("workflow_runs").is_none());
    assert!(thread_read.get("workflowRuns").is_none());
    assert!(thread_read.get("workflow_steps").is_none());
    assert!(thread_read.get("workflowSteps").is_none());
}

#[tokio::test]
async fn workflow_read_fails_closed_when_session_is_missing() {
    let error = RuntimeCore::default()
        .read_workflow_current(WorkflowReadParams {
            session_id: "missing-session".to_string(),
        })
        .await
        .expect_err("missing session should fail");

    assert!(matches!(
        error,
        RuntimeCoreError::SessionNotFound(session_id) if session_id == "missing-session"
    ));
}
