use super::support::*;
use super::*;

#[tokio::test]
async fn objective_continue_fails_closed_when_pending_requests_exist() {
    let mut persisted = empty_agent_session_read_response("sess_objective_continue");
    persisted.session.workspace_id = Some("workspace-main".to_string());
    persisted.detail = Some(json!({
        "thread_read": {
            "pending_requests": [
                {
                    "id": "request-1",
                    "type": "ask_user"
                }
            ],
            "queued_turns": []
        }
    }));
    let app_data_source = Arc::new(
        TestCurrentTimelineDataSource::new(persisted)
            .with_objective(managed_objective("sess_objective_continue")),
    );
    let backend = Arc::new(RecordingBackend::default());
    let core =
        RuntimeCore::with_backend(backend.clone()).with_app_data_source(app_data_source.clone());

    let error = core
        .continue_agent_session_objective(
            AgentSessionObjectiveContinueParams {
                session_id: "sess_objective_continue".to_string(),
                owner_kind: None,
                owner_id: None,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect_err("pending request should block objective continuation");

    assert!(error
        .to_string()
        .contains("当前会话还有 1 个待处理请求，不能继续推进目标"));
    assert!(backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned")
        .is_empty());
}

#[tokio::test]
async fn objective_continue_uses_host_provider_config_without_runtime_explicit_preferences() {
    let session_id = "sess_objective_continue_provider_config";
    let mut persisted = empty_agent_session_read_response(session_id);
    persisted.session.workspace_id = Some("workspace-main".to_string());
    let app_data_source = Arc::new(
        TestCurrentTimelineDataSource::new(persisted).with_objective(managed_objective(session_id)),
    );
    let backend = Arc::new(FinalDoneRecordingBackend {
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
                provider_preference: Some("fixture-provider".to_string()),
                model_preference: Some("fixture-model".to_string()),
                host_options: Some(json!({
                    "asterChatRequest": {
                        "turnConfig": {
                            "providerConfig": {
                                "provider_id": "fixture-provider",
                                "provider_name": "openai",
                                "model_name": "fixture-model",
                                "api_key": "fixture-key",
                                "base_url": "http://127.0.0.1:65535"
                            },
                            "providerPreference": "fixture-provider",
                            "modelPreference": "fixture-model",
                            "approvalPolicy": "never",
                            "sandboxPolicy": "read-only"
                        }
                    }
                })),
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
    assert_eq!(continuation_request.provider_preference, None);
    assert_eq!(continuation_request.model_preference, None);
    let runtime_options = continuation_request
        .runtime_options
        .as_ref()
        .expect("runtime options");
    assert_eq!(runtime_options.provider_preference, None);
    assert_eq!(runtime_options.model_preference, None);
    let host_options = runtime_options.host_options.as_ref().expect("host options");
    assert_eq!(
        host_options
            .pointer("/asterChatRequest/provider_config/base_url")
            .and_then(serde_json::Value::as_str),
        Some("http://127.0.0.1:65535")
    );
    assert_eq!(
        host_options
            .pointer("/asterChatRequest/turn_config/provider_config/base_url")
            .and_then(serde_json::Value::as_str),
        Some("http://127.0.0.1:65535")
    );
    assert_eq!(
        host_options
            .pointer("/asterChatRequest/turn_config/provider_preference")
            .and_then(serde_json::Value::as_str),
        Some("fixture-provider")
    );
    assert_eq!(
        host_options
            .pointer("/asterChatRequest/turn_config/approval_policy")
            .and_then(serde_json::Value::as_str),
        Some("never")
    );
    assert_eq!(
        host_options
            .pointer("/asterChatRequest/turn_config/sandbox_policy")
            .and_then(serde_json::Value::as_str),
        Some("read-only")
    );
}

#[tokio::test]
async fn managed_objective_auto_continuation_submits_current_turn_after_terminal_turn() {
    let mut persisted = empty_agent_session_read_response("sess_objective_auto_allow");
    persisted.session.workspace_id = Some("workspace-main".to_string());
    let mut objective = managed_objective("sess_objective_auto_allow");
    objective.risk_policy = Some(json!({ "allowAutoContinuation": true }));
    objective.continuation_policy = Some(json!({
        "autoIdle": true,
        "maxAutoTurns": 1,
        "maxElapsedMs": 180000
    }));
    objective.budget_policy = Some(json!({ "maxTurns": 1 }));
    let app_data_source =
        Arc::new(TestCurrentTimelineDataSource::new(persisted).with_objective(objective));
    let backend = Arc::new(RecordingBackend::default());
    let core =
        RuntimeCore::with_backend(backend.clone()).with_app_data_source(app_data_source.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_objective_auto_allow".to_string()),
        thread_id: Some("thread_objective_auto_allow".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_objective_auto_allow".to_string(),
            turn_id: Some("turn_initial".to_string()),
            input: AgentInput {
                text: "首轮".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                provider_preference: Some("fixture-provider".to_string()),
                model_preference: Some("fixture-model".to_string()),
                host_options: Some(json!({
                    "asterChatRequest": {
                        "turnConfig": {
                            "providerConfig": {
                                "provider_id": "fixture-provider",
                                "provider_name": "openai",
                                "model_name": "fixture-model",
                                "api_key": "fixture-key",
                                "base_url": "http://127.0.0.1:65535"
                            },
                            "providerPreference": "fixture-provider",
                            "modelPreference": "fixture-model",
                            "approvalPolicy": "never",
                            "sandboxPolicy": "read-only"
                        }
                    }
                })),
                ..RuntimeOptions::default()
            }),
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("initial turn");
    core.append_external_runtime_events(
        "sess_objective_auto_allow",
        Some("turn_initial"),
        vec![RuntimeEvent::new("turn.completed", json!({}))],
    )
    .expect("complete initial turn");
    core.maybe_submit_managed_objective_auto_continuation(
        "sess_objective_auto_allow",
        RuntimeHostContext::default(),
    )
    .await;

    let audit_updates = app_data_source.audit_updates();
    assert_eq!(audit_updates.len(), 1);
    let summary = audit_updates[0]
        .last_audit_summary
        .as_deref()
        .unwrap_or_default();
    assert!(summary.contains("auto_continuation_guard decision=allow"));
    assert!(summary.contains("queued_turn_id="));

    let requests = backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned");
    assert_eq!(requests.len(), 2);
    let auto_request = &requests[1];
    assert_eq!(auto_request.session.session_id, "sess_objective_auto_allow");
    assert_eq!(auto_request.queue_if_busy, false);
    assert_eq!(auto_request.provider_preference, None);
    assert_eq!(auto_request.model_preference, None);
    let runtime_options = auto_request
        .runtime_options
        .as_ref()
        .expect("runtime options");
    assert_eq!(runtime_options.provider_preference, None);
    assert_eq!(runtime_options.model_preference, None);
    let host_options = runtime_options.host_options.as_ref().expect("host options");
    assert_eq!(
        host_options
            .pointer("/asterChatRequest/provider_config/base_url")
            .and_then(serde_json::Value::as_str),
        Some("http://127.0.0.1:65535")
    );
    assert_eq!(
        host_options
            .pointer("/asterChatRequest/turn_config/provider_config/base_url")
            .and_then(serde_json::Value::as_str),
        Some("http://127.0.0.1:65535")
    );
    assert_eq!(
        host_options
            .pointer("/asterChatRequest/turn_config/provider_preference")
            .and_then(serde_json::Value::as_str),
        Some("fixture-provider")
    );
    assert_eq!(
        host_options
            .pointer("/asterChatRequest/turn_config/approval_policy")
            .and_then(serde_json::Value::as_str),
        Some("never")
    );
    let managed_objective = auto_request
        .metadata
        .as_ref()
        .and_then(|metadata| metadata.pointer("/harness/managed_objective"))
        .expect("managed objective metadata");
    assert_eq!(
        managed_objective
            .get("continuation_source")
            .and_then(serde_json::Value::as_str),
        Some("auto_idle")
    );
    assert!(managed_objective.get("auto_continuation_guard").is_some());
}

#[tokio::test]
async fn managed_objective_auto_continuation_stops_at_budget_after_auto_turn() {
    let mut persisted = empty_agent_session_read_response("sess_objective_auto_budget");
    persisted.session.workspace_id = Some("workspace-main".to_string());
    let mut objective = managed_objective("sess_objective_auto_budget");
    objective.risk_policy = Some(json!({ "allowAutoContinuation": true }));
    objective.continuation_policy = Some(json!({
        "autoIdle": true,
        "maxAutoTurns": 1,
        "maxElapsedMs": 180000
    }));
    objective.budget_policy = Some(json!({ "maxTurns": 1 }));
    let app_data_source =
        Arc::new(TestCurrentTimelineDataSource::new(persisted).with_objective(objective));
    let backend = Arc::new(FinalDoneRecordingBackend {
        requests: Mutex::new(Vec::new()),
    });
    let core =
        RuntimeCore::with_backend(backend.clone()).with_app_data_source(app_data_source.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_objective_auto_budget".to_string()),
        thread_id: Some("thread_objective_auto_budget".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_objective_auto_budget".to_string(),
            turn_id: Some("turn_initial".to_string()),
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
    .expect("initial turn with auto continuation");

    let objective = app_data_source.objective().expect("objective");
    assert_eq!(objective.status, ManagedObjectiveStatus::BudgetLimited);
    let summary = objective.last_audit_summary.as_deref().unwrap_or_default();
    assert!(summary.contains("auto_continuation_guard decision=budget_limited"));
    assert!(summary.contains("decision=allow"));
    assert!(summary.contains("auto_turns=1/1"));

    let requests = backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned");
    assert_eq!(requests.len(), 2);
    assert!(requests[1]
        .metadata
        .as_ref()
        .and_then(|metadata| metadata.pointer("/harness/managed_objective/auto_continuation_guard"))
        .is_some());
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
async fn managed_objective_auto_continuation_submits_and_budget_limits_on_current_path() {
    let session_id = "sess_auto_objective";
    let mut objective = managed_objective(session_id);
    objective.continuation_policy = Some(json!({
        "autoIdle": true,
        "maxAutoTurns": 1,
        "maxElapsedMs": 180000,
        "maxEstimatedTotalCost": 1.0
    }));
    objective.budget_policy = Some(json!({
        "maxTurns": 1
    }));
    objective.risk_policy = Some(json!({
        "allowAutoContinuation": true
    }));
    let mut persisted = empty_agent_session_read_response(session_id);
    persisted.session.workspace_id = Some("workspace-main".to_string());
    let app_data_source =
        Arc::new(TestCurrentTimelineDataSource::new(persisted).with_objective(objective));
    let backend = Arc::new(CompletedBackend);
    let core = RuntimeCore::with_backend(backend).with_app_data_source(app_data_source.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some(session_id.to_string()),
        thread_id: Some("thread_auto_objective".to_string()),
        app_id: "agent-runtime".to_string(),
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
                text: "initial".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                provider_preference: Some("fixture-provider".to_string()),
                model_preference: Some("fixture-model".to_string()),
                metadata: Some(json!({
                    "harness": {
                        "managed_objective_smoke": {
                            "source": "unit"
                        }
                    }
                })),
                ..RuntimeOptions::default()
            }),
            queue_if_busy: false,
            skip_pre_submit_resume: true,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("initial turn");

    let read_after_initial = core
        .read_session_current(AgentSessionReadParams {
            session_id: session_id.to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read after initial");
    assert_eq!(read_after_initial.turns.len(), 2);
    assert!(read_after_initial
        .turns
        .iter()
        .all(|turn| { matches!(turn.status, AgentTurnStatus::Completed) }));

    let final_objective = app_data_source.objective().expect("final objective");
    assert_eq!(
        final_objective.status,
        ManagedObjectiveStatus::BudgetLimited
    );
    assert!(final_objective
        .last_audit_summary
        .as_deref()
        .unwrap_or_default()
        .contains("auto_continuation_guard decision=budget_limited"));
    assert!(final_objective
        .last_audit_summary
        .as_deref()
        .unwrap_or_default()
        .contains("decision=allow"));
    assert!(final_objective
        .last_audit_summary
        .as_deref()
        .unwrap_or_default()
        .contains("auto_turns=1/1"));
    assert!(final_objective
        .blocker_reason
        .as_deref()
        .unwrap_or_default()
        .contains("最大轮数"));

    let final_read = core
        .read_session_current(AgentSessionReadParams {
            session_id: session_id.to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("final read");
    assert_eq!(final_read.turns.len(), 2);
    assert!(final_read.turns.iter().any(|turn| {
        turn.turn_id != "turn_initial" && matches!(turn.status, AgentTurnStatus::Completed)
    }));

    let evidence = core
        .export_evidence(EvidenceExportParams {
            session_id: session_id.to_string(),
            turn_id: None,
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(true),
        })
        .await
        .expect("export evidence");
    let evidence_pack = evidence.evidence_pack.expect("objective evidence pack");
    assert_eq!(
        evidence_pack
            .completion_audit_summary
            .as_ref()
            .and_then(|summary| summary.get("decision"))
            .and_then(serde_json::Value::as_str),
        Some("budget_limited")
    );
    assert_eq!(evidence_pack.turn_count, 2);
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
    let mut persisted = empty_agent_session_read_response("sess_objective_audit");
    persisted.session.workspace_id = Some("workspace-main".to_string());
    let app_data_source = Arc::new(
        TestCurrentTimelineDataSource::new(persisted)
            .with_objective(managed_objective("sess_objective_audit")),
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
