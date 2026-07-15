use super::support::*;
use super::*;
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::{Arc, Mutex};

fn runtime_options_with_metadata(metadata: Value) -> RuntimeOptions {
    RuntimeOptions {
        runtime_request: Some(RuntimeRequest {
            metadata: Some(metadata),
            ..RuntimeRequest::default()
        }),
        ..RuntimeOptions::default()
    }
}

struct TurnCompletedHostGenerationBackend {
    requests: Mutex<Vec<ExecutionRequest>>,
}

#[async_trait]
impl ExecutionBackend for TurnCompletedHostGenerationBackend {
    async fn start_turn(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.requests
            .lock()
            .expect("test backend requests mutex poisoned")
            .push(request);
        sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
        sink.emit(RuntimeEvent::new("turn.completed", json!({})))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn prepare_plugin_worker_request(
        &self,
        _request: &ExecutionRequest,
        worker_request: &mut serde_json::Value,
    ) -> Result<(), RuntimeCoreError> {
        let generated_markdown = [
            "# AI Agent 工作流：从任务到交付的协作系统",
            "",
            "开头要先把问题讲清楚：Agent 不是单次问答工具，而是一套能理解目标、拆解任务、调用工具并持续校验结果的工作方式。",
            "",
            "第一部分可以写任务进入系统后的编排方式，说明它如何把用户意图转成可追踪的步骤。",
            "",
            "第二部分可以写工具调用和资料检索，强调过程需要被记录，但不应该把内部流水账直接丢给用户。",
            "",
            "第三部分可以写产物生成与复核，让文章、图片和清单都回到同一个可编辑的工作台。",
            "",
            "结尾回到实践建议：先把流程做成可观察、可审计、可恢复，再逐步扩展自动化能力。",
        ]
        .join("\n");
        let payload = json!({
            "schemaVersion": "lime.host-managed-generation.v1",
            "source": "app_server",
            "status": "completed",
            "provider": "test-host",
            "model": "test-host-managed-generation",
            "outputs": [
                {
                    "id": "article-draft-document",
                    "kind": "markdown_document",
                    "targetObjectKind": "articleDraft",
                    "outputField": "documentText",
                    "content": generated_markdown
                }
            ]
        });
        worker_request["hostManagedGeneration"] = payload.clone();
        worker_request["runtime"]["hostManagedGenerationResult"] = payload;
        Ok(())
    }
}

#[tokio::test]
async fn article_workspace_turn_runs_installed_worker_and_materializes_workspace_patch() {
    let Some(fixture_root) = content_factory_fixture_root() else {
        return;
    };
    let installed_state = content_factory_installed_state(&fixture_root);
    let data_source =
        TestSessionDataSource::new().with_plugin_installed_states(vec![installed_state]);
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let core = runtime_core_with_sidecar(&sidecar_root).with_app_data_source(Arc::new(data_source));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("session-content-factory".to_string()),
            thread_id: Some("thread-content-factory".to_string()),
            app_id: "content-factory-app".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("turn-article-workspace-action".to_string()),
                input: AgentInput {
                    text: "重新生成配图".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(runtime_options_with_metadata(
                    article_workspace_action_metadata(),
                )),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("article workspace worker turn");

    assert_eq!(output.response.turn.status, AgentTurnStatus::Completed);
    let event_types = output
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "item.started",
            "message.created",
            "item.completed",
            "turn.accepted",
            "artifact.snapshot",
            "turn.completed"
        ]
    );
    let artifact_events = output
        .events
        .iter()
        .filter(|event| event.event_type == "artifact.snapshot")
        .collect::<Vec<_>>();
    assert_eq!(artifact_events.len(), 1);
    let completed_artifact = &artifact_events[0].payload["artifact"];
    assert_ne!(completed_artifact["status"], "streaming");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("detail");
    assert_eq!(
        detail["article_workspace"]["selectedObjectRef"]["kind"],
        "imageGenerationSet"
    );
    let action_history = detail["thread_read"]["article_workspace_actions"]
        .as_array()
        .expect("action history");
    assert_eq!(action_history[0]["status"], "completed");
    assert_eq!(
        detail["article_workspace"]["workerEvidence"][0]["artifactKind"],
        "content_factory.workspace_patch"
    );
    let article = detail["article_workspace"]["objects"]
        .as_array()
        .expect("article workspace objects")
        .iter()
        .find(|object| object["ref"]["kind"] == "articleDraft")
        .expect("article object");
    assert!(article["source"]["hostManagedGeneration"].is_null());
    let article_title = article["title"].as_str().expect("article title");
    assert!(!article_title.contains("学习路线：从基础语法到工程实战"));
    assert_eq!(
        article_title,
        "Regenerate the image set with two candidate images."
    );
    let article_document = article["source"]["documentText"]
        .as_str()
        .expect("article documentText");
    assert!(!article_document.contains("## 第一阶段：打牢基础"));
    assert!(!article_document.contains("学习路线：从基础语法到工程实战"));
    assert!(article_document.is_empty());
    assert_eq!(
        article["source"]["articleGenerationStatus"],
        "host_generation_required"
    );
    assert_eq!(
        article["source"]["finalMarkdown"],
        article["source"]["documentText"]
    );
    assert_eq!(
        article["source"]["outline"]
            .as_array()
            .expect("article outline")
            .len(),
        5
    );
    assert_eq!(
        article["source"]["imageSlots"]
            .as_array()
            .expect("article image slots")
            .len(),
        3
    );
}

#[tokio::test]
async fn plugin_activation_turn_uses_regular_agent_backend() {
    let Some(fixture_root) = content_factory_fixture_root() else {
        return;
    };
    let installed_state = content_factory_installed_state(&fixture_root);
    let data_source =
        TestSessionDataSource::new().with_plugin_installed_states(vec![installed_state]);
    let event_log_root = tempfile::tempdir().expect("event log root");
    let event_log_writer =
        Arc::new(EventLogWriter::new(event_log_root.path()).expect("event log writer"));
    let backend = Arc::new(TurnCompletedHostGenerationBackend {
        requests: Mutex::new(Vec::new()),
    });
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let core = RuntimeCore::with_backend(backend.clone())
        .with_sidecar_store(Arc::new(
            SidecarStore::new(sidecar_root.path()).expect("sidecar store"),
        ))
        .with_event_log_writer(event_log_writer.clone())
        .with_app_data_source(Arc::new(data_source));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("session-content-factory-article".to_string()),
            thread_id: Some("thread-content-factory-article".to_string()),
            app_id: "content-factory-app".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("turn-content-article-generate".to_string()),
                input: AgentInput {
                    text: "@写文章 写一篇关于 AI Agent 工作流的公众号文章".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(runtime_options_with_metadata(
                    article_generation_metadata_with_locale("en-US"),
                )),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("plugin activation agent turn");

    assert_eq!(output.response.turn.status, AgentTurnStatus::Completed);
    let requests = backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned");
    assert_eq!(
        requests.len(),
        1,
        "plugin activation must enter the regular Agent backend"
    );
    assert_eq!(
        requests[0].input.text,
        "@写文章 写一篇关于 AI Agent 工作流的公众号文章"
    );
    assert!(
        requests[0]
            .runtime_metadata()
            .and_then(|metadata| metadata.pointer("/harness/plugin_activation"))
            .is_some(),
        "plugin activation context must be preserved for the Agent prompt layer"
    );

    let event_types = output
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert!(event_types.contains(&"message.created"));
    assert_eq!(event_types.last().copied(), Some("turn.completed"));
    let artifact_snapshot_count = event_types
        .iter()
        .filter(|event_type| **event_type == "artifact.snapshot")
        .count();
    assert!(
        artifact_snapshot_count > 0,
        "plugin activation must materialize article artifacts before completion: {event_types:?}"
    );
    let first_artifact_index = event_types
        .iter()
        .position(|event_type| *event_type == "artifact.snapshot")
        .expect("artifact snapshot event");
    let turn_completed_index = event_types
        .iter()
        .position(|event_type| *event_type == "turn.completed")
        .expect("turn completed event");
    assert!(
        first_artifact_index < turn_completed_index,
        "artifact snapshots must be emitted before terminal completion: {event_types:?}"
    );
    assert!(
        event_types
            .iter()
            .all(|event_type| !event_type.starts_with("workflow.")),
        "plugin activation must not run worker workflow events: {event_types:?}"
    );

    let regular_log_records = event_log_writer
        .read_session_events(&session.session_id)
        .expect("regular session event log");
    assert!(
        regular_log_records
            .iter()
            .all(|record| !record.event.event_type.starts_with("workflow.")),
        "plugin activation must not write worker workflow events to regular log"
    );
    assert!(
        regular_log_records
            .iter()
            .all(|record| record.event.event_type != "plugin_worker.hook"),
        "plugin activation must not run worker hooks"
    );
    let workflow_audit_records = event_log_writer
        .read_session_workflow_audit_events(&session.session_id)
        .expect("workflow audit log");
    assert!(
        !workflow_audit_records.is_empty(),
        "plugin activation must write workflow audit JSONL for content factory materialization"
    );
    let workflow_event_types = workflow_audit_records
        .iter()
        .map(|record| record.event.event_type.as_str())
        .collect::<Vec<_>>();
    assert!(
        workflow_event_types.contains(&"workflow.run.started"),
        "workflow audit log should include run start: {workflow_event_types:?}"
    );
    assert!(
        workflow_event_types.contains(&"workflow.run.completed"),
        "workflow audit log should include run completion: {workflow_event_types:?}"
    );
}

#[tokio::test]
async fn article_workspace_worker_blocks_cloud_release_without_verified_signature_evidence() {
    let installed_state = cloud_release_installed_state_with_evidence(json!({
        "status": "blocked",
        "signaturePolicy": "required",
        "signatureVerificationStatus": "declared",
        "packageHashMatched": true,
        "manifestHashMatched": true,
        "packageVerificationStatus": "verified"
    }));
    let data_source =
        TestSessionDataSource::new().with_plugin_installed_states(vec![installed_state]);
    let core = RuntimeCore::default().with_app_data_source(Arc::new(data_source));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("session-content-factory-signature-gate".to_string()),
            thread_id: Some("thread-content-factory-signature-gate".to_string()),
            app_id: "content-factory-app".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id,
                turn_id: Some("turn-article-workspace-signature-gate".to_string()),
                input: AgentInput {
                    text: "重新生成配图".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(runtime_options_with_metadata(
                    article_workspace_action_metadata(),
                )),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("article workspace worker signature gate turn");

    assert_eq!(output.response.turn.status, AgentTurnStatus::Failed);
    let event_types = output
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "item.started",
            "message.created",
            "item.completed",
            "turn.accepted",
            "runtime.error",
            "turn.failed"
        ]
    );
    let runtime_error = output
        .events
        .iter()
        .find(|event| event.event_type == "runtime.error")
        .expect("runtime error");
    assert_eq!(
        runtime_error.payload["errorCode"],
        "PLUGIN_WORKER_PACKAGE_SIGNATURE_UNVERIFIED"
    );
    assert_eq!(runtime_error.payload["failureCategory"], "configuration");
    assert_eq!(
        runtime_error.payload["retryAdvice"],
        "reinstall_verified_package"
    );
    assert_eq!(runtime_error.payload["retryable"], false);
}

#[tokio::test]
async fn article_workspace_worker_fails_closed_for_unauthorized_output_artifact_kind() {
    let Some(fixture_root) = content_factory_fixture_root() else {
        return;
    };
    let installed_state = content_factory_installed_state(&fixture_root);
    let data_source =
        TestSessionDataSource::new().with_plugin_installed_states(vec![installed_state]);
    let core = RuntimeCore::default().with_app_data_source(Arc::new(data_source));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("session-content-factory-output-auth".to_string()),
            thread_id: Some("thread-content-factory-output-auth".to_string()),
            app_id: "content-factory-app".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id,
                turn_id: Some("turn-article-workspace-output-auth".to_string()),
                input: AgentInput {
                    text: "重新生成配图".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(runtime_options_with_metadata(
                    article_workspace_action_metadata_with_output_kind("other.workspace_patch"),
                )),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("article workspace worker unauthorized output turn");

    assert_eq!(output.response.turn.status, AgentTurnStatus::Failed);
    let event_types = output
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "item.started",
            "message.created",
            "item.completed",
            "turn.accepted",
            "runtime.error",
            "turn.failed"
        ]
    );
    let accepted = output
        .events
        .iter()
        .find(|event| event.event_type == "turn.accepted")
        .expect("accepted event");
    assert_eq!(accepted.payload["backend"], "plugin_worker");
    assert_eq!(accepted.payload["appId"], "content-factory-app");
    assert_eq!(
        accepted.payload["outputArtifactKind"],
        "other.workspace_patch"
    );

    let runtime_error = output
        .events
        .iter()
        .find(|event| event.event_type == "runtime.error")
        .expect("runtime error");
    assert_eq!(
        runtime_error.payload["errorCode"],
        "PLUGIN_WORKER_CONTRACT_UNSUPPORTED"
    );
    assert_eq!(
        runtime_error.payload["outputArtifactKind"],
        "other.workspace_patch"
    );
    assert_eq!(runtime_error.payload["failureCategory"], "configuration");
    assert_eq!(runtime_error.payload["retryable"], false);
}

#[tokio::test]
async fn article_workspace_worker_fails_closed_when_output_artifact_kind_is_missing() {
    let core = RuntimeCore::default();
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("session-content-factory-output-missing".to_string()),
            thread_id: Some("thread-content-factory-output-missing".to_string()),
            app_id: "content-factory-app".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id,
                turn_id: Some("turn-article-workspace-output-missing".to_string()),
                input: AgentInput {
                    text: "重新生成配图".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(runtime_options_with_metadata(
                    article_workspace_action_metadata_without_output_kind(),
                )),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("article workspace worker missing output turn");

    assert_eq!(output.response.turn.status, AgentTurnStatus::Failed);
    let event_types = output
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "item.started",
            "message.created",
            "item.completed",
            "turn.accepted",
            "runtime.error",
            "turn.failed"
        ]
    );
    let runtime_error = output
        .events
        .iter()
        .find(|event| event.event_type == "runtime.error")
        .expect("runtime error");
    assert_eq!(
        runtime_error.payload["errorCode"],
        "PLUGIN_WORKER_OUTPUT_UNAUTHORIZED"
    );
    assert!(runtime_error.payload["outputArtifactKind"].is_null());
    assert_eq!(runtime_error.payload["retryable"], false);
}

#[tokio::test]
async fn article_workspace_worker_retries_retryable_failure_and_completes() {
    if !node_available() {
        return;
    }
    let temp = tempfile::tempdir().expect("temp worker package");
    fs::write(temp.path().join("worker.mjs"), RETRY_THEN_COMPLETE_WORKER).expect("worker script");
    let installed_state = retry_worker_installed_state(temp.path());
    let data_source =
        TestSessionDataSource::new().with_plugin_installed_states(vec![installed_state]);
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let event_log_root = tempfile::tempdir().expect("event log root");
    let event_log_writer =
        Arc::new(EventLogWriter::new(event_log_root.path()).expect("event log writer"));
    let core = runtime_core_with_sidecar(&sidecar_root)
        .with_event_log_writer(event_log_writer.clone())
        .with_app_data_source(Arc::new(data_source));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("session-content-factory-retry".to_string()),
            thread_id: Some("thread-content-factory-retry".to_string()),
            app_id: "content-factory-app".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;
    let session_id = session.session_id.clone();

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session_id.clone(),
                turn_id: Some("turn-article-workspace-retry".to_string()),
                input: AgentInput {
                    text: "重新生成配图".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(runtime_options_with_metadata(
                    article_workspace_action_metadata(),
                )),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("article workspace worker retry turn");

    assert_eq!(output.response.turn.status, AgentTurnStatus::Completed);
    let event_types = output
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "item.started",
            "message.created",
            "item.completed",
            "turn.accepted",
            "plugin_worker.retry",
            "artifact.snapshot",
            "turn.completed"
        ]
    );
    let artifact_events = output
        .events
        .iter()
        .filter(|event| event.event_type == "artifact.snapshot")
        .collect::<Vec<_>>();
    assert_eq!(artifact_events.len(), 1);
    assert_ne!(
        artifact_events[0].payload["artifact"]["status"],
        "streaming"
    );
    let retry_event = output
        .events
        .iter()
        .find(|event| event.event_type == "plugin_worker.retry")
        .expect("retry event");
    assert_eq!(
        retry_event.payload["errorCode"],
        "PLUGIN_WORKER_RETRYABLE_FAILURE"
    );
    assert_eq!(retry_event.payload["retryAttempt"], 0);
    assert_eq!(retry_event.payload["retryMaxAttempts"], 1);
    let workflow_audit_records = event_log_writer
        .read_session_workflow_audit_events(&session_id)
        .expect("workflow audit log");
    let workflow_event_types = workflow_audit_records
        .iter()
        .map(|record| record.event.event_type.as_str())
        .collect::<Vec<_>>();
    assert!(
        workflow_event_types.contains(&"workflow.step.retrying"),
        "audit log should include step retrying: {workflow_event_types:?}"
    );
    assert!(
        workflow_event_types.contains(&"workflow.run.retrying"),
        "audit log should include run retrying: {workflow_event_types:?}"
    );
    assert!(
        workflow_event_types.contains(&"workflow.run.completed"),
        "audit log should include final run completion: {workflow_event_types:?}"
    );
    let retry_run = workflow_audit_records
        .iter()
        .find(|record| record.event.event_type == "workflow.run.retrying")
        .expect("workflow run retrying");
    assert_eq!(
        retry_run.event.payload["workflowKey"],
        "content_image_workflow"
    );
    assert_eq!(retry_run.event.payload["status"], "retrying");
    assert_eq!(retry_run.event.payload["failure"]["retryAttempt"], 0);
    let retry_step = workflow_audit_records
        .iter()
        .find(|record| record.event.event_type == "workflow.step.retrying")
        .expect("workflow step retrying");
    assert_eq!(retry_step.event.payload["stepId"], "image-plan");
    assert_eq!(retry_step.event.payload["status"], "retrying");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("detail");
    assert_eq!(
        detail["article_workspace"]["selectedObjectRef"]["kind"],
        "imageGenerationSet"
    );
    let evidence = detail["article_workspace"]["workerEvidence"]
        .as_array()
        .expect("worker evidence");
    assert_eq!(evidence.len(), 2);
    assert_eq!(evidence[0]["eventType"], "plugin_worker.retry");
    assert_eq!(evidence[0]["status"], "failed");
    assert_eq!(evidence[0]["retryAttempt"], 0);
    assert_eq!(evidence[0]["retryMaxAttempts"], 1);
    assert_eq!(evidence[1]["eventType"], "artifact.snapshot");
    assert_eq!(evidence[1]["status"], "completed");

    let action_history = detail["thread_read"]["article_workspace_actions"]
        .as_array()
        .expect("action history");
    assert_eq!(action_history[0]["status"], "completed");
}

#[tokio::test]
async fn article_workspace_worker_stops_after_retry_budget_is_exhausted() {
    if !node_available() {
        return;
    }
    let temp = tempfile::tempdir().expect("temp worker package");
    fs::write(
        temp.path().join("worker.mjs"),
        ALWAYS_RETRYABLE_FAILURE_WORKER,
    )
    .expect("worker script");
    let installed_state = retry_worker_installed_state(temp.path());
    let data_source =
        TestSessionDataSource::new().with_plugin_installed_states(vec![installed_state]);
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let event_log_root = tempfile::tempdir().expect("event log root");
    let event_log_writer =
        Arc::new(EventLogWriter::new(event_log_root.path()).expect("event log writer"));
    let core = runtime_core_with_sidecar(&sidecar_root)
        .with_event_log_writer(event_log_writer.clone())
        .with_app_data_source(Arc::new(data_source));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("session-content-factory-retry-failed".to_string()),
            thread_id: Some("thread-content-factory-retry-failed".to_string()),
            app_id: "content-factory-app".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;
    let session_id = session.session_id.clone();

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session_id.clone(),
                turn_id: Some("turn-article-workspace-retry-failed".to_string()),
                input: AgentInput {
                    text: "重新生成配图".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(runtime_options_with_metadata(
                    article_workspace_action_metadata(),
                )),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("article workspace worker exhausted retry turn");

    assert_eq!(output.response.turn.status, AgentTurnStatus::Failed);
    let event_types = output
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "item.started",
            "message.created",
            "item.completed",
            "turn.accepted",
            "plugin_worker.retry",
            "runtime.error",
            "turn.failed"
        ]
    );
    let runtime_error = output
        .events
        .iter()
        .find(|event| event.event_type == "runtime.error")
        .expect("runtime error");
    assert_eq!(runtime_error.payload["retryAttempt"], 1);
    assert_eq!(runtime_error.payload["retryMaxAttempts"], 1);
    assert_eq!(
        runtime_error.payload["errorCode"],
        "PLUGIN_WORKER_RETRYABLE_FAILURE"
    );
    let workflow_audit_records = event_log_writer
        .read_session_workflow_audit_events(&session_id)
        .expect("workflow audit log");
    let workflow_event_types = workflow_audit_records
        .iter()
        .map(|record| record.event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        workflow_event_types
            .iter()
            .filter(|event_type| **event_type == "workflow.run.retrying")
            .count(),
        1,
        "audit log should include one retrying run event: {workflow_event_types:?}"
    );
    assert!(
        workflow_event_types.contains(&"workflow.run.failed"),
        "audit log should include final run failure: {workflow_event_types:?}"
    );
    let failed_run = workflow_audit_records
        .iter()
        .find(|record| record.event.event_type == "workflow.run.failed")
        .expect("workflow run failed");
    assert_eq!(failed_run.event.payload["failure"]["retryAttempt"], 1);
}

fn content_factory_fixture_root() -> Option<std::path::PathBuf> {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join("src/features/plugin/testing/fixtures");
    root.join("src/runtime/content-factory-worker.mjs")
        .is_file()
        .then_some(root)
}

fn runtime_core_with_sidecar(sidecar_root: &tempfile::TempDir) -> RuntimeCore {
    RuntimeCore::default().with_sidecar_store(Arc::new(
        SidecarStore::new(sidecar_root.path()).expect("sidecar store"),
    ))
}

fn content_factory_installed_state(fixture_root: &std::path::Path) -> serde_json::Value {
    let manifest: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(fixture_root.join("content-factory-app.json"))
            .expect("content factory manifest"),
    )
    .expect("manifest json");
    json!({
        "schemaVersion": "plugin.installed-state.v1",
        "appId": "content-factory-app",
        "installMode": "runtime_backed",
        "disabled": false,
        "identity": {
            "appId": "content-factory-app",
            "sourceKind": "local_folder",
            "sourceUri": fixture_root.to_string_lossy(),
            "packageHash": "sha256:test-package",
            "manifestHash": "sha256:test-manifest"
        },
        "manifest": manifest,
    })
}

fn retry_worker_installed_state(package_root: &Path) -> serde_json::Value {
    json!({
        "schemaVersion": "plugin.installed-state.v1",
        "appId": "content-factory-app",
        "installMode": "runtime_backed",
        "disabled": false,
        "identity": {
            "appId": "content-factory-app",
            "sourceKind": "local_folder",
            "sourceUri": package_root.to_string_lossy(),
            "packageHash": "sha256:test-package",
            "manifestHash": "sha256:test-manifest"
        },
        "manifest": {
            "runtimePackage": {
                "worker": {
                    "entrypoint": "./worker.mjs",
                    "outputArtifactKind": "content_factory.workspace_patch"
                }
            },
            "agentRuntime": {
                "worker": {
                    "directProviderAccess": false,
                    "directFilesystemAccess": false
                },
                "tasks": [
                    { "kind": "content.image.generate" }
                ],
                "workflows": [
                    {
                        "key": "content_image_workflow",
                        "title": "内容配图工作流",
                        "taskKind": "content.image.generate",
                        "outputArtifactKind": "content_factory.workspace_patch",
                        "steps": [
                            {
                                "id": "image-plan",
                                "title": "配图规划",
                                "subagent": "image-planner",
                                "skillRefs": ["article-image-plan"],
                                "expectedOutput": "imageGenerationSet"
                            }
                        ]
                    }
                ]
            }
        },
    })
}

fn cloud_release_installed_state_with_evidence(evidence: serde_json::Value) -> serde_json::Value {
    json!({
        "schemaVersion": "plugin.installed-state.v1",
        "appId": "content-factory-app",
        "installMode": "runtime_backed",
        "disabled": false,
        "identity": {
            "appId": "content-factory-app",
            "sourceKind": "cloud_release",
            "sourceUri": "https://lime.local/plugins/content-factory-app/releases/0.3.0/package.zip",
            "packageHash": "sha256:test-package",
            "manifestHash": "sha256:test-manifest"
        },
        "setup": {
            "cloudReleaseEvidence": evidence
        },
        "manifest": {
            "runtimePackage": {
                "worker": {
                    "entrypoint": "./worker.mjs",
                    "outputArtifactKind": "content_factory.workspace_patch"
                }
            },
            "agentRuntime": {
                "worker": {
                    "directProviderAccess": false,
                    "directFilesystemAccess": false
                },
                "tasks": [
                    { "kind": "content.image.generate" }
                ]
            }
        },
    })
}

fn node_available() -> bool {
    let node = std::env::var("NODE").unwrap_or_else(|_| {
        if cfg!(windows) {
            "node.exe".to_string()
        } else {
            "node".to_string()
        }
    });
    Command::new(node)
        .arg("--version")
        .output()
        .is_ok_and(|output| output.status.success())
}

fn article_workspace_action_metadata() -> serde_json::Value {
    json!({
        "plugin": {
            "source": "right_surface_article_workspace",
            "app_id": "content-factory-app",
            "session_id": "session-content-factory",
            "workspace_id": "workspace-main",
            "article_workspace_action": {
                "key": "regenerate",
                "intent": "regenerate",
                "risk": "write",
                "task_kind": "content.image.generate",
                "output_artifact_kind": "content_factory.workspace_patch",
                "prompt": "Regenerate the image set with two candidate images.",
                "object": {
                    "app_id": "content-factory-app",
                    "kind": "imageGenerationSet",
                    "id": "image-set-1",
                    "session_id": "session-content-factory",
                    "artifact_ids": ["artifact-image-set-1"],
                    "preview_artifact_id": "artifact-image-set-1"
                }
            }
        },
        "right_surface": {
            "surface_kind": "articleWorkspace",
            "source": "article_workspace",
            "action_key": "regenerate"
        }
    })
}

fn article_generation_metadata_with_locale(locale: &str) -> serde_json::Value {
    json!({
        "agent_response_language": locale,
        "harness": {
            "plugin_activation": {
                "source": "plugin_explicit_mention",
                "trigger": "@写文章",
                "body": "写一篇关于 AI Agent 工作流的公众号文章",
                "session_id": "session-content-factory-article",
                "plugin_id": "content-factory-app",
                "active_plugin_id": "content-factory-app",
                "active_entry_key": "content_factory",
                "intent_key": "content_article_generate",
                "task_kind": "content.article.generate",
                "output_artifact_kind": "content_factory.workspace_patch",
                "right_surface": "articleWorkspace",
                "expected_objects": ["articleDraft"],
                "selected_object_ref": {
                    "plugin_id": "content-factory-app",
                    "object_kind": "articleDraft",
                    "object_id": "pending"
                },
                "opened_tabs": ["articleWorkspace"],
                "context_source": "user"
            }
        }
    })
}

fn article_workspace_action_metadata_with_output_kind(
    output_artifact_kind: &str,
) -> serde_json::Value {
    let mut metadata = article_workspace_action_metadata();
    metadata["plugin"]["article_workspace_action"]["output_artifact_kind"] =
        json!(output_artifact_kind);
    metadata
}

fn article_workspace_action_metadata_without_output_kind() -> serde_json::Value {
    let mut metadata = article_workspace_action_metadata();
    if let Some(action) = metadata["plugin"]["article_workspace_action"].as_object_mut() {
        action.remove("output_artifact_kind");
    }
    metadata
}

const RETRY_THEN_COMPLETE_WORKER: &str = r#"
import fs from 'node:fs';

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) {
  input += chunk;
}
const request = JSON.parse(input);
const marker = './attempt.txt';
const attempt = fs.existsSync(marker) ? Number(fs.readFileSync(marker, 'utf8')) : 0;
fs.writeFileSync(marker, String(attempt + 1));

if (attempt === 0) {
  console.log(JSON.stringify({
    status: 'failed',
    error: { code: 'WORKER_RETRYABLE' }
  }));
  process.exit(0);
}

const objectRef = {
  appId: request.appId,
  kind: 'imageGenerationSet',
  id: 'image-set-retry',
  sessionId: request.sessionId,
  artifactIds: ['artifact-image-set-retry'],
  sourceTurnId: request.turnId,
  sourceTaskId: request.taskId
};
const patch = {
  schemaVersion: 'article-workspace.v1',
  appId: request.appId,
  sessionId: request.sessionId,
  workspaceId: request.workspaceId,
  selectedObjectRef: objectRef,
  objects: [
    {
      ref: objectRef,
      title: 'Retry image set',
      status: 'ready',
      summary: 'Retried successfully.',
      previewArtifactId: 'artifact-image-set-retry',
      source: {
        taskKind: request.taskKind,
        taskId: request.taskId,
        turnId: request.turnId,
        artifactIds: ['artifact-image-set-retry']
      }
    }
  ]
};
console.log(JSON.stringify({
  status: 'completed',
  artifacts: [
    {
      kind: 'artifact.snapshot',
      artifactId: `${request.taskId}:workspace-patch`,
      path: '.lime/artifacts/retry-workspace-patch.json',
      title: 'Retry workspace patch',
      metadata: {
        kind: 'content_factory.workspace_patch',
        contentFactoryWorkspacePatch: patch
      },
      content: JSON.stringify(patch)
    }
  ]
}));
"#;

const ALWAYS_RETRYABLE_FAILURE_WORKER: &str = r#"
console.log(JSON.stringify({
  status: 'failed',
  error: { code: 'WORKER_RETRYABLE' }
}));
"#;
