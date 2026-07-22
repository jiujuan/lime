use super::support::canonical_tool_started_event;
use super::support::*;
use super::*;

fn fixture_runtime_request() -> RuntimeRequest {
    RuntimeRequest {
        provider_config: Some(RuntimeProviderConfig {
            provider_id: Some("fixture-provider".to_string()),
            provider_name: Some("openai".to_string()),
            model_name: Some("fixture-model".to_string()),
            api_key: Some("fixture-key".to_string()),
            base_url: Some("http://127.0.0.1:65535".to_string()),
            ..RuntimeProviderConfig::default()
        }),
        provider_preference: Some("fixture-provider".to_string()),
        model_preference: Some("fixture-model".to_string()),
        approval_policy: Some("never".to_string()),
        sandbox_policy: Some("read-only".to_string()),
        ..RuntimeRequest::default()
    }
}

#[tokio::test]
async fn objective_continue_fails_closed_when_pending_requests_exist() {
    let session_id = "sess_objective_continue";
    let turn_id = "turn_objective_continue";
    let app_data_source =
        Arc::new(TestSessionDataSource::new().with_objective(managed_objective(session_id)));
    let backend = Arc::new(RecordingBackend::default());
    let core =
        RuntimeCore::with_backend(backend.clone()).with_app_data_source(app_data_source.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some(session_id.to_string()),
        thread_id: Some("thread_objective_continue".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: session_id.to_string(),
            turn_id: Some(turn_id.to_string()),
            input: AgentInput {
                text: "首轮".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("initial turn");
    core.append_external_runtime_events(
        session_id,
        Some(turn_id),
        vec![
            canonical_tool_started_event(
                session_id,
                "thread_objective_continue",
                turn_id,
                "tool_needs_approval",
                "Shell",
            ),
            RuntimeEvent::new(
                "action.required",
                json!({
                    "requestId": "request-1",
                    "actionType": "ask_user",
                    "toolCallId": "tool_needs_approval",
                    "prompt": "继续之前需要用户确认"
                }),
            ),
        ],
    )
    .expect("pending action event");
    let read = core
        .read_session(AgentSessionReadParams {
            session_id: session_id.to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    assert_eq!(
        read.detail
            .as_ref()
            .and_then(|detail| detail.pointer("/thread_read/pending_requests"))
            .and_then(serde_json::Value::as_array)
            .map(Vec::len),
        Some(1)
    );

    let error = core
        .continue_agent_session_objective(
            AgentSessionObjectiveContinueParams {
                session_id: session_id.to_string(),
                owner_kind: None,
                owner_id: None,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect_err("pending request should block objective continuation");

    assert!(error.to_string().contains("不能继续推进目标"));
    assert!(
        backend
            .requests
            .lock()
            .expect("test backend requests mutex poisoned")
            .iter()
            .filter(|request| request.session.session_id == session_id)
            .count()
            == 1
    );
    assert!(backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned")
        .iter()
        .all(|request| request.input.concat_text() != "继续推进当前目标。"));
}

#[tokio::test]
async fn objective_continue_uses_runtime_request_provider_config_without_explicit_preferences() {
    let session_id = "sess_objective_continue_provider_config";
    let app_data_source =
        Arc::new(TestSessionDataSource::new().with_objective(managed_objective(session_id)));
    let backend = Arc::new(TurnCompletedRecordingBackend {
        requests: Mutex::new(Vec::new()),
    });
    let core =
        RuntimeCore::with_backend(backend.clone()).with_app_data_source(app_data_source.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some(session_id.to_string()),
        thread_id: Some("thread_objective_continue_provider_config".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: session_id.to_string(),
            turn_id: Some("turn_initial".to_string()),
            input: AgentInput {
                text: "首轮".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                runtime_request: Some(fixture_runtime_request()),
                ..RuntimeOptions::default()
            }),
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("initial turn");

    core.continue_agent_session_objective(
        AgentSessionObjectiveContinueParams {
            session_id: session_id.to_string(),
            owner_kind: None,
            owner_id: None,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("continue objective");

    let requests = backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned");
    assert_eq!(requests.len(), 2);
    let continuation_request = &requests[1];
    assert_eq!(
        continuation_request.provider_preference(),
        Some("fixture-provider")
    );
    assert_eq!(
        continuation_request.model_preference(),
        Some("fixture-model")
    );
    let runtime_options = continuation_request
        .runtime_options
        .as_ref()
        .expect("runtime options");
    let runtime_request = runtime_options
        .runtime_request
        .as_ref()
        .expect("runtime request");
    assert_eq!(
        runtime_request
            .provider_config
            .as_ref()
            .and_then(|provider_config| provider_config.base_url.as_deref()),
        Some("http://127.0.0.1:65535")
    );
    assert_eq!(
        runtime_request.provider_preference.as_deref(),
        Some("fixture-provider")
    );
    assert_eq!(runtime_request.approval_policy.as_deref(), Some("never"));
    assert_eq!(runtime_request.sandbox_policy.as_deref(), Some("read-only"));
}

#[tokio::test]
async fn action_replay_rebuilds_current_pending_action_from_runtime_events() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_action_replay".to_string()),
        thread_id: Some("thread_action_replay".to_string()),
        app_id: "agent-runtime".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.append_external_runtime_events(
        "sess_action_replay",
        None,
        vec![RuntimeEvent::new(
            "action.required",
            json!({
                "requestId": "req-replay",
                "actionType": "elicitation",
                "data": {
                    "message": "请补充发布渠道",
                    "requestedSchema": {
                        "type": "object",
                        "properties": {
                            "channel": { "type": "string" }
                        }
                    }
                },
                "scope": {
                    "sessionId": "sess_action_replay",
                    "threadId": "thread_action_replay",
                    "turnId": "turn_action_replay"
                }
            }),
        )],
    )
    .expect("append action event");

    let response = core
        .replay_action(AgentSessionActionReplayParams {
            session_id: "sess_action_replay".to_string(),
            request_id: "req-replay".to_string(),
        })
        .await
        .expect("replay action");
    let action = response
        .response
        .action
        .expect("pending action should be replayed");

    assert_eq!(action.event_type, "action_required");
    assert_eq!(action.request_id, "req-replay");
    assert_eq!(action.action_type, AgentSessionActionType::Elicitation);
    assert_eq!(action.prompt.as_deref(), Some("请补充发布渠道"));
    assert!(action.requested_schema.is_some());
    assert_eq!(
        action.scope.and_then(|scope| scope.turn_id),
        Some("turn_action_replay".to_string())
    );

    core.append_external_runtime_events(
        "sess_action_replay",
        None,
        vec![RuntimeEvent::new(
            "action.resolved",
            json!({
                "requestId": "req-replay",
                "actionType": "elicitation",
                "confirmed": true
            }),
        )],
    )
    .expect("append resolved event");

    let resolved = core
        .replay_action(AgentSessionActionReplayParams {
            session_id: "sess_action_replay".to_string(),
            request_id: "req-replay".to_string(),
        })
        .await
        .expect("replay resolved action");
    assert!(resolved.response.action.is_none());
}

#[tokio::test]
async fn action_replay_treats_canceled_and_expired_actions_as_terminal() {
    let core = RuntimeCore::default();

    for terminal_event in ["action.canceled", "action.cancelled", "action.expired"] {
        let suffix = terminal_event.replace('.', "_");
        let session_id = format!("sess_action_replay_{suffix}");
        let thread_id = format!("thread_action_replay_{suffix}");
        let request_id = format!("req-replay-{suffix}");
        core.start_session(AgentSessionStartParams {
            session_id: Some(session_id.clone()),
            thread_id: Some(thread_id.clone()),
            app_id: "agent-runtime".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");
        core.append_external_runtime_events(
            &session_id,
            None,
            vec![
                RuntimeEvent::new(
                    "action.required",
                    json!({
                        "requestId": request_id.clone(),
                        "actionType": "tool_confirmation",
                        "prompt": "允许执行命令吗？",
                        "scope": {
                            "sessionId": session_id.clone(),
                            "threadId": thread_id.clone(),
                            "turnId": format!("turn_action_replay_{suffix}")
                        }
                    }),
                ),
                RuntimeEvent::new(
                    terminal_event,
                    json!({
                        "requestId": request_id.clone(),
                        "actionType": "tool_confirmation"
                    }),
                ),
            ],
        )
        .expect("append terminal action events");

        let replayed = core
            .replay_action(AgentSessionActionReplayParams {
                session_id,
                request_id,
            })
            .await
            .expect("replay terminal action");
        assert!(
            replayed.response.action.is_none(),
            "{terminal_event} should not replay a stale pending action"
        );
    }
}

#[tokio::test]
async fn objective_audit_writes_current_evidence_pack_decision() {
    let provider = Arc::new(TestEvidenceExportProvider {
        completion_audit_summary: Some(json!({
            "decision": "completed",
            "artifactCount": 1,
            "checkedCriteria": [
                {
                    "criterion": "契约通过",
                    "satisfied": true
                }
            ]
        })),
        ..TestEvidenceExportProvider::default()
    });
    let app_data_source = Arc::new(
        TestSessionDataSource::new().with_objective(managed_objective("sess_objective_audit")),
    );
    let core = RuntimeCore::with_backend_capability_source_artifact_content_provider_and_evidence_export_provider(
            Arc::new(MockBackend),
            Arc::new(CapabilityInventorySource::default()),
            Arc::new(InlineArtifactContentProvider),
            provider.clone(),
        )
        .with_app_data_source(app_data_source.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_objective_audit".to_string()),
        thread_id: Some("thread_objective_audit".to_string()),
        app_id: "agent-runtime".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.append_external_runtime_events(
        "sess_objective_audit",
        None,
        vec![RuntimeEvent::new(
            "artifact.snapshot",
            json!({
                "artifactId": "artifact-report",
                "path": ".lime/artifacts/report.md"
            }),
        )],
    )
    .expect("append evidence event");

    let response = core
        .audit_agent_session_objective(AgentSessionObjectiveAuditParams {
            session_id: "sess_objective_audit".to_string(),
            owner_kind: None,
            owner_id: None,
        })
        .await
        .expect("audit objective");

    assert_eq!(provider.call_count.load(Ordering::SeqCst), 1);
    assert_eq!(response.objective.status, ManagedObjectiveStatus::Completed);
    assert!(response
        .objective
        .last_audit_summary
        .as_deref()
        .unwrap_or_default()
        .contains("decision=completed"));
    assert_eq!(
        response.objective.last_evidence_pack_ref.as_deref(),
        Some("/workspace/.lime/harness/sessions/sess_evidence/evidence")
    );
    assert_eq!(app_data_source.audit_updates().len(), 1);
}
