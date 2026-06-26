use super::*;

#[tokio::test]
async fn product_profile_worker_failure_evidence_carries_retry_projection() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_product_worker_failure".to_string()),
        thread_id: Some("thread_product_worker_failure".to_string()),
        app_id: "content-factory-app".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_product_worker_failure".to_string(),
                turn_id: Some("turn_product_worker_failure".to_string()),
                input: AgentInput {
                    text: "重新生成配图".to_string(),
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
        "sess_product_worker_failure",
        Some(&turn.turn_id),
        vec![
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifact": {
                        "artifactId": "artifact-workspace-patch-failure",
                        "path": ".lime/artifacts/content-factory-workspace-patch-failure.json",
                        "title": "内容工厂工作区补丁",
                        "kind": "content_factory.workspace_patch",
                        "status": "ready",
                        "metadata": {
                            "contentFactoryWorkspacePatch": {
                                "schemaVersion": "product-workspace.v1",
                                "appId": "content-factory-app",
                                "sessionId": "sess_product_worker_failure",
                                "workspaceId": "workspace-main",
                                "objects": [
                                    {
                                        "ref": {
                                            "appId": "content-factory-app",
                                            "kind": "imageGenerationSet",
                                            "id": "image-set-1",
                                            "sessionId": "sess_product_worker_failure",
                                            "artifactIds": ["artifact-image-set"],
                                            "sourceTurnId": "turn_product_worker_failure",
                                            "sourceTaskId": "task-image-1"
                                        },
                                        "title": "配图组",
                                        "status": "needs_review",
                                        "summary": "等待选择主图",
                                        "previewArtifactId": "artifact-image-set",
                                        "source": {
                                            "taskKind": "content.image.generate",
                                            "taskId": "task-image-1",
                                            "turnId": "turn_product_worker_failure",
                                            "artifactIds": ["artifact-image-set"]
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }),
            ),
            RuntimeEvent::new(
                "runtime.error",
                json!({
                    "source": "agent_app_task_worker",
                    "appId": "content-factory-app",
                    "taskId": "task-image-1",
                    "taskKind": "content.image.generate",
                    "turnId": "turn_product_worker_failure",
                    "status": "failed",
                    "errorCode": "AGENT_APP_WORKER_TIMEOUT",
                    "errorMessage": "Agent App worker timed out after 100ms",
                    "failureCategory": "timeout",
                    "retryable": true,
                    "retryAdvice": "retry_same_action",
                    "retryAttempt": 0,
                    "retryMaxAttempts": 1,
                    "metadata": {
                        "agentAppWorker": {
                            "appId": "content-factory-app",
                            "taskId": "task-image-1",
                            "taskKind": "content.image.generate",
                            "turnId": "turn_product_worker_failure",
                            "status": "failed",
                            "workerEntrypoint": "./runtime/content-factory-worker.mjs",
                            "inputSummary": "prompt=重新生成配图"
                        }
                    }
                }),
            ),
            RuntimeEvent::new("turn.completed", json!({})),
        ],
    )
    .expect("append events");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_product_worker_failure".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    let evidence = &detail["product_workspace"]["workerEvidence"][0];

    assert_eq!(evidence["taskId"], "task-image-1");
    assert_eq!(evidence["status"], "failed");
    assert_eq!(evidence["errorCode"], "AGENT_APP_WORKER_TIMEOUT");
    assert_eq!(evidence["failureCategory"], "timeout");
    assert_eq!(evidence["retryable"], true);
    assert_eq!(evidence["retryAdvice"], "retry_same_action");
    assert_eq!(evidence["retryAttempt"], 0);
    assert_eq!(evidence["retryMaxAttempts"], 1);
}
