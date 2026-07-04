use super::support::*;
use super::*;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::Arc;

const HOST_GENERATED_ARTICLE_MARKDOWN: &str = "# 人才选聘不能只看简历关键词\n\n人才选聘最难的地方，不是筛掉明显不合适的人，而是识别真正能把问题推进的人。\n\n## 先定义岗位要解决的问题\n\n招聘前先写清楚这个岗位未来三个月要交付什么。\n\n## 用任务验证真实能力\n\n面试可以围绕一个小型业务任务展开，让候选人说明拆解思路、取舍依据和风险判断。";

fn assert_worker_evidence_audit_fields_hidden(worker_evidence: &serde_json::Value) {
    for key in [
        "workflowKey",
        "subagents",
        "skillRefs",
        "cliRefs",
        "connectorRefs",
        "hookPolicy",
        "orchestration",
        "workerEntrypoint",
        "inputSummary",
        "outputSummary",
    ] {
        assert!(
            worker_evidence.get(key).is_none(),
            "worker evidence must hide audit-only field {key}"
        );
    }
}

#[tokio::test]
async fn article_workspace_turn_runs_installed_worker_and_materializes_workspace_patch() {
    let Some(fixture_root) = content_factory_fixture_root() else {
        return;
    };
    let installed_state = content_factory_installed_state(&fixture_root);
    let data_source = TestSessionDataSource::new(empty_agent_session_read_response("unused"))
        .with_plugin_installed_states(vec![installed_state]);
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
                runtime_options: Some(RuntimeOptions {
                    metadata: Some(article_workspace_action_metadata()),
                    ..RuntimeOptions::default()
                }),
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
            "message.created",
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
async fn article_generation_worker_emits_initial_streaming_workspace_snapshot() {
    let Some(fixture_root) = content_factory_fixture_root() else {
        return;
    };
    let installed_state = content_factory_installed_state(&fixture_root);
    let data_source = TestSessionDataSource::new(empty_agent_session_read_response("unused"))
        .with_plugin_installed_states(vec![installed_state]);
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let event_log_root = tempfile::tempdir().expect("event log root");
    let event_log_writer =
        Arc::new(EventLogWriter::new(event_log_root.path()).expect("event log writer"));
    let core = runtime_core_with_sidecar_and_host_generation(&sidecar_root)
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
                runtime_options: Some(RuntimeOptions {
                    metadata: Some(article_generation_metadata_with_locale("en-US")),
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("article generation worker turn");

    assert_eq!(output.response.turn.status, AgentTurnStatus::Completed);
    let event_types = output
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        &event_types[0..3],
        &["message.created", "turn.accepted", "artifact.snapshot",]
    );
    assert_eq!(event_types.last().copied(), Some("turn.completed"));
    assert!(
        event_types
            .iter()
            .all(|event_type| !event_type.starts_with("workflow.")),
        "workflow events must not enter user-facing output: {event_types:?}"
    );
    assert!(
        !event_types.contains(&"plugin_worker.hook"),
        "hook lifecycle events must be audit-only: {event_types:?}"
    );
    let assistant_events = output
        .events
        .iter()
        .filter(|event| event.event_type == "message.delta")
        .collect::<Vec<_>>();
    assert_eq!(
        assistant_events.len(),
        1,
        "article generation should emit one final assistant message"
    );
    let assistant_text = assistant_events[0]
        .payload
        .get("text")
        .and_then(serde_json::Value::as_str)
        .expect("assistant final text");
    assert_eq!(assistant_events[0].payload["phase"], "final_answer");
    assert_eq!(assistant_events[0].payload["backend"], "plugin_worker");
    assert!(assistant_text.contains("## 先定义岗位要解决的问题"));
    assert!(assistant_text.contains("## 用任务验证真实能力"));
    assert!(
        !assistant_text.contains("@写文章"),
        "assistant final text must not repeat the user command"
    );

    let regular_log_records = event_log_writer
        .read_session_events(&session.session_id)
        .expect("regular session event log");
    assert!(
        regular_log_records
            .iter()
            .all(|record| !record.event.event_type.starts_with("workflow.")),
        "workflow events must not enter regular session log"
    );
    assert!(
        regular_log_records
            .iter()
            .all(|record| record.event.event_type != "plugin_worker.hook"),
        "hook lifecycle events must not enter regular session log"
    );
    let workflow_audit_records = event_log_writer
        .read_session_workflow_audit_events(&session.session_id)
        .expect("workflow audit log");
    let workflow_event_types = workflow_audit_records
        .iter()
        .map(|record| record.event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        workflow_event_types.first().copied(),
        Some("workflow.run.started")
    );
    assert!(
        workflow_event_types.contains(&"workflow.step.started"),
        "audit log should include step start: {workflow_event_types:?}"
    );
    assert!(
        workflow_event_types.contains(&"workflow.connector.requested"),
        "audit log should include connector requests: {workflow_event_types:?}"
    );
    assert_eq!(
        workflow_event_types
            .iter()
            .filter(|event_type| **event_type == "workflow.hook.completed")
            .count(),
        2,
        "audit log should include prompt and task hooks: {workflow_event_types:?}"
    );
    assert_eq!(
        workflow_event_types
            .iter()
            .filter(|event_type| **event_type == "workflow.step.completed")
            .count(),
        5
    );
    assert_eq!(
        workflow_event_types.last().copied(),
        Some("workflow.run.completed")
    );
    let workflow_run_started = workflow_audit_records
        .iter()
        .find(|record| record.event.event_type == "workflow.run.started")
        .expect("workflow run started")
        .event
        .clone();
    assert_eq!(
        workflow_run_started.payload["workflowKey"],
        "content_article_workflow"
    );
    assert_eq!(
        workflow_run_started.payload["workflowTitle"],
        "写文章工作流"
    );
    assert_eq!(workflow_run_started.payload["prompt"]["redacted"], true);
    assert_eq!(
        workflow_run_started.payload["redaction"]["policy"],
        "workflow_audit_metadata_only"
    );
    assert_eq!(
        workflow_run_started.payload["steps"]
            .as_array()
            .expect("workflow steps")
            .len(),
        5
    );
    let workflow_completed_step_events = workflow_audit_records
        .iter()
        .filter(|record| record.event.event_type == "workflow.step.completed")
        .collect::<Vec<_>>();
    assert_eq!(workflow_completed_step_events.len(), 5);
    assert_eq!(
        workflow_completed_step_events[0].event.payload["stepId"],
        "research"
    );
    assert_eq!(
        workflow_completed_step_events[0].event.payload["stepTitle"],
        "资料检索"
    );
    let connector_request = workflow_audit_records
        .iter()
        .find(|record| record.event.event_type == "workflow.connector.requested")
        .expect("workflow connector requested");
    assert_eq!(
        connector_request.event.payload["workflowRunId"],
        format!(
            "{}:{}:workflow",
            output.response.turn.turn_id, "content_article_generate"
        )
    );
    assert_eq!(connector_request.event.payload["stepId"], "research");
    assert_eq!(connector_request.event.payload["stepTitle"], "资料检索");
    assert_eq!(
        connector_request.event.payload["connectorRef"],
        "web-research"
    );
    assert_eq!(connector_request.event.payload["toolName"], "WebSearch");
    assert_eq!(
        connector_request.event.payload["metadata"]["pluginWorkflow"]["eventSource"],
        "worker_progress"
    );
    assert_eq!(connector_request.event.payload["query"]["redacted"], true);
    assert_eq!(
        connector_request.event.payload["redaction"]["policy"],
        "workflow_audit_metadata_only"
    );
    let hook_events = workflow_audit_records
        .iter()
        .filter(|record| record.event.event_type == "workflow.hook.completed")
        .collect::<Vec<_>>();
    assert_eq!(hook_events.len(), 2);
    assert_eq!(hook_events[0].event.payload["hookKey"], "prompt-submit");
    assert_eq!(hook_events[0].event.payload["hookEvent"], "prompt.submit");
    assert_eq!(hook_events[0].event.payload["hookScope"], "prompt");
    assert_eq!(hook_events[0].event.payload["status"], "completed");
    assert_eq!(hook_events[0].event.payload["stepId"], "research");
    assert_eq!(hook_events[0].event.payload["auditOnly"], true);
    assert_eq!(
        hook_events[0].event.payload["metadata"]["pluginWorkflow"]["eventSource"],
        "plugin_worker_hook"
    );
    assert_eq!(hook_events[1].event.payload["hookKey"], "task-complete");
    assert_eq!(hook_events[1].event.payload["hookEvent"], "task.complete");
    assert_eq!(hook_events[1].event.payload["hookScope"], "task");
    assert_eq!(hook_events[1].event.payload["status"], "completed");
    assert_eq!(hook_events[1].event.payload["stepId"], "image-plan");
    assert_eq!(hook_events[1].event.payload["auditOnly"], true);
    let artifact_events = output
        .events
        .iter()
        .filter(|event| event.event_type == "artifact.snapshot")
        .collect::<Vec<_>>();
    assert!(
        artifact_events.len() >= 6,
        "expected initial, progressive, and final workspace patch snapshots: {event_types:?}"
    );
    let streaming_artifact = &artifact_events[0].payload["artifact"];
    assert_eq!(streaming_artifact["status"], "streaming");
    assert_eq!(streaming_artifact["title"], "Content Factory Workspace");
    assert_eq!(streaming_artifact["metadata"]["complete"], false);
    assert_eq!(
        streaming_artifact["metadata"]["contentFactoryWorkspacePatch"]["objects"][0]["title"],
        "Article Draft"
    );
    assert_eq!(
        streaming_artifact["metadata"]["contentFactoryWorkspacePatch"]["objects"][0]["status"],
        "generating"
    );
    assert_eq!(
        streaming_artifact["metadata"]["contentFactoryWorkspacePatch"]["objects"][0]["source"]
            ["hostSearchStatus"],
        "running"
    );
    let streaming_sidecar_path = streaming_artifact["sidecarRef"]["relativePath"]
        .as_str()
        .expect("streaming sidecar path");
    let streaming_content = SidecarStore::new(sidecar_root.path())
        .expect("sidecar store")
        .read_text(streaming_sidecar_path)
        .expect("streaming sidecar content");
    assert!(streaming_content.contains("Researching source material"));
    let progressive_document_lengths = artifact_events
        .iter()
        .filter_map(|event| {
            let artifact = &event.payload["artifact"];
            if artifact["status"] != "streaming" {
                return None;
            }
            artifact["metadata"]["contentFactoryWorkspacePatch"]["objects"]
                .as_array()
                .into_iter()
                .flatten()
                .find(|object| object["ref"]["kind"] == "articleDraft")
                .and_then(|object| object["source"]["documentText"].as_str())
                .map(str::chars)
                .map(Iterator::count)
                .filter(|length| *length > 0)
        })
        .collect::<Vec<_>>();
    assert!(
        progressive_document_lengths.len() >= 4,
        "expected progressive article document snapshots, got {progressive_document_lengths:?}"
    );
    assert!(
        progressive_document_lengths
            .windows(2)
            .all(|window| window[0] <= window[1]),
        "article document snapshots must not go backwards: {progressive_document_lengths:?}"
    );
    let completed_artifact = &artifact_events
        .last()
        .expect("completed artifact snapshot")
        .payload["artifact"];
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
    let messages = detail["messages"].as_array().expect("messages");
    let assistant_message = messages
        .iter()
        .find(|message| message["role"] == "assistant")
        .expect("assistant message");
    let assistant_message_text = assistant_message["content"][0]["text"]
        .as_str()
        .expect("assistant message text");
    assert!(assistant_message_text.contains("## 先定义岗位要解决的问题"));
    assert!(assistant_message_text.contains("## 用任务验证真实能力"));
    let article = detail["article_workspace"]["objects"]
        .as_array()
        .expect("article workspace objects")
        .iter()
        .find(|object| object["ref"]["kind"] == "articleDraft")
        .expect("article object");
    let article_document = article["source"]["documentText"]
        .as_str()
        .expect("article documentText");
    assert!(article_document.contains("## 先定义岗位要解决的问题"));
    assert!(article_document.contains("## 用任务验证真实能力"));
    assert_eq!(assistant_message_text, article_document);
    assert!(!article_document.contains("## 第一阶段：打牢基础"));
    assert!(!article_document.contains("学习路线：从基础语法到工程实战"));
    assert_eq!(
        article["source"]["finalMarkdown"],
        article["source"]["documentText"]
    );
    let worker_evidence = detail["article_workspace"]["workerEvidence"]
        .as_array()
        .expect("worker evidence");
    let completed_worker_evidence = worker_evidence
        .iter()
        .find(|evidence| {
            evidence["eventType"] == "artifact.snapshot"
                && evidence["taskId"] == "turn-content-article-generate:content_article_generate"
                && evidence["status"] == "completed"
        })
        .expect("completed article worker evidence");
    assert!(
        completed_worker_evidence["outputObjectCount"]
            .as_u64()
            .unwrap_or_default()
            >= 1
    );
    assert_worker_evidence_audit_fields_hidden(completed_worker_evidence);
    assert!(
        !worker_evidence
            .iter()
            .any(|evidence| evidence["eventType"] == "plugin_worker.hook"),
        "hook lifecycle events must not enter article workspace workerEvidence"
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
    let data_source = TestSessionDataSource::new(empty_agent_session_read_response("unused"))
        .with_plugin_installed_states(vec![installed_state]);
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
                runtime_options: Some(RuntimeOptions {
                    metadata: Some(article_workspace_action_metadata()),
                    ..RuntimeOptions::default()
                }),
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
            "message.created",
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
    let data_source = TestSessionDataSource::new(empty_agent_session_read_response("unused"))
        .with_plugin_installed_states(vec![installed_state]);
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
                runtime_options: Some(RuntimeOptions {
                    metadata: Some(article_workspace_action_metadata_with_output_kind(
                        "other.workspace_patch",
                    )),
                    ..RuntimeOptions::default()
                }),
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
            "message.created",
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
                runtime_options: Some(RuntimeOptions {
                    metadata: Some(article_workspace_action_metadata_without_output_kind()),
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("article workspace worker missing output turn");

    assert_eq!(output.response.turn.status, AgentTurnStatus::Failed);
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
    let data_source = TestSessionDataSource::new(empty_agent_session_read_response("unused"))
        .with_plugin_installed_states(vec![installed_state]);
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
                runtime_options: Some(RuntimeOptions {
                    metadata: Some(article_workspace_action_metadata()),
                    ..RuntimeOptions::default()
                }),
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
            "message.created",
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
    let data_source = TestSessionDataSource::new(empty_agent_session_read_response("unused"))
        .with_plugin_installed_states(vec![installed_state]);
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
                runtime_options: Some(RuntimeOptions {
                    metadata: Some(article_workspace_action_metadata()),
                    ..RuntimeOptions::default()
                }),
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
            "message.created",
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

fn runtime_core_with_sidecar_and_host_generation(sidecar_root: &tempfile::TempDir) -> RuntimeCore {
    RuntimeCore::with_backend(Arc::new(HostManagedArticleGenerationBackend)).with_sidecar_store(
        Arc::new(SidecarStore::new(sidecar_root.path()).expect("sidecar store")),
    )
}

struct HostManagedArticleGenerationBackend;

#[async_trait]
impl ExecutionBackend for HostManagedArticleGenerationBackend {
    async fn start_turn(
        &self,
        _request: ExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
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
        if worker_request["taskKind"] != "content.article.generate" {
            return Ok(());
        }
        let payload = json!({
            "schemaVersion": "lime.plugin.host_managed_generation.v1",
            "source": "test_host_generation",
            "status": "completed",
            "provider": "test-provider",
            "model": "test-model",
            "outputs": [
                {
                    "id": "article-draft-document",
                    "kind": "markdown_document",
                    "targetObjectKind": "articleDraft",
                    "outputField": "documentText",
                    "contentType": "text/markdown",
                    "content": HOST_GENERATED_ARTICLE_MARKDOWN
                }
            ]
        });
        worker_request["hostManagedGeneration"] = payload.clone();
        if !worker_request["runtime"].is_object() {
            worker_request["runtime"] = json!({});
        }
        worker_request["runtime"]["hostManagedGenerationResult"] = payload;
        Ok(())
    }
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
