use super::support::*;
use super::*;

#[tokio::test]
async fn list_agent_sessions_projects_runtime_core_sessions_only() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_old".to_string()),
        thread_id: Some("thread_old".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-old".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "project".to_string(),
            id: "old".to_string(),
            title: Some("Old Workspace Session".to_string()),
            uri: None,
            metadata: Some(json!({
                "model": "gpt-test",
                "workingDir": "/tmp/old",
                "executionStrategy": "runtime-core"
            })),
        }),
        locale: None,
    })
    .expect("old workspace session");
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_current".to_string()),
        thread_id: Some("thread_current".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "project".to_string(),
            id: "current".to_string(),
            title: Some("Current Workspace Session".to_string()),
            uri: None,
            metadata: Some(json!({
                "modelName": "claude-test",
                "working_dir": "/tmp/current",
                "execution_strategy": "runtime-core"
            })),
        }),
        locale: None,
    })
    .expect("current workspace session");

    let response = core
        .list_agent_sessions(AgentSessionListParams {
            workspace_id: Some("workspace-current".to_string()),
            limit: Some(1),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions");

    assert_eq!(response.sessions.len(), 1);
    assert_eq!(response.sessions[0].session_id, "sess_current");
    assert_eq!(
        response.sessions[0].thread_id.as_deref(),
        Some("thread_current")
    );
    assert_eq!(
        response.sessions[0].title.as_deref(),
        Some("Current Workspace Session")
    );
    assert_eq!(response.sessions[0].model, "claude-test");
    assert_eq!(
        response.sessions[0].working_dir.as_deref(),
        Some("/tmp/current")
    );
    assert_eq!(
        response.sessions[0].execution_strategy.as_deref(),
        Some("runtime-core")
    );
}

#[tokio::test]
async fn queue_session_controls_use_current_runtime_core_read_model() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_queue".to_string()),
        thread_id: Some("thread_queue".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_queue".to_string(),
            turn_id: Some("turn_running".to_string()),
            input: AgentInput {
                text: "running".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                provider_preference: Some("fixture-provider".to_string()),
                model_preference: Some("fixture-model".to_string()),
                host_options: Some(json!({
                    "asterChatRequest": {
                        "provider_config": {
                            "provider_id": "fixture-provider",
                            "provider_name": "openai",
                            "model_name": "fixture-model",
                            "api_key": "fixture-key",
                            "base_url": "http://127.0.0.1:65535"
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
    .expect("running turn");
    let queued = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_queue".to_string(),
                turn_id: Some("turn_queued".to_string()),
                input: AgentInput {
                    text: "queued".to_string(),
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
    assert_eq!(queued.response.turn.status, AgentTurnStatus::Queued);
    assert!(queued
        .events
        .iter()
        .any(|event| event.event_type == "queue.added"));

    let promoted = core
        .promote_agent_session_queued_turn(AgentSessionQueuedTurnPromoteParams {
            session_id: "sess_queue".to_string(),
            queued_turn_id: "turn_queued".to_string(),
        })
        .await
        .expect("promote");
    assert!(promoted.response.promoted);
    assert_eq!(
        promoted.response.turns[1].turn_id, "turn_queued",
        "only one queued turn keeps its position after active turn"
    );

    let blocked_resume = core
        .resume_agent_session_thread(
            AgentSessionThreadResumeParams {
                session_id: "sess_queue".to_string(),
                resume_contract: None,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("blocked resume");
    assert!(!blocked_resume.response.resumed);

    core.append_external_runtime_events(
        "sess_queue",
        Some("turn_running"),
        vec![RuntimeEvent::new("turn.completed", json!({}))],
    )
    .expect("complete running");
    let resumed = core
        .resume_agent_session_thread(
            AgentSessionThreadResumeParams {
                session_id: "sess_queue".to_string(),
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

    let second_queued = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_queue".to_string(),
                turn_id: Some("turn_remove".to_string()),
                input: AgentInput {
                    text: "remove".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: true,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("second queued");
    assert_eq!(second_queued.response.turn.status, AgentTurnStatus::Queued);
    let removed = core
        .remove_agent_session_queued_turn(AgentSessionQueuedTurnRemoveParams {
            session_id: "sess_queue".to_string(),
            queued_turn_id: "turn_remove".to_string(),
        })
        .await
        .expect("remove queued");
    assert!(removed.response.removed);
    assert!(!removed
        .response
        .turns
        .iter()
        .any(|turn| turn.turn_id == "turn_remove"));
}

#[tokio::test]
async fn second_active_turn_without_queue_fails_closed() {
    let backend = Arc::new(RunningCountingBackend {
        start_count: AtomicUsize::new(0),
    });
    let core = RuntimeCore::with_backend(backend.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_single_active".to_string()),
        thread_id: Some("thread_single_active".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_single_active".to_string(),
            turn_id: Some("turn_active".to_string()),
            input: AgentInput {
                text: "running".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("first turn");

    let error = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_single_active".to_string(),
                turn_id: Some("turn_parallel".to_string()),
                input: AgentInput {
                    text: "parallel".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect_err("parallel turn must fail closed");

    match error {
        RuntimeCoreError::TurnAlreadyActive(turn_id) => {
            assert_eq!(turn_id, "turn_active");
        }
        other => panic!("expected active turn error, got {other:?}"),
    }
    assert_eq!(backend.start_count.load(Ordering::SeqCst), 1);

    let read = core
        .read_session_current(AgentSessionReadParams {
            session_id: "sess_single_active".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read session");
    assert_eq!(read.turns.len(), 1);
    assert_eq!(read.turns[0].turn_id, "turn_active");
    let events = core
        .events_for_session("sess_single_active")
        .expect("runtime events");
    assert!(events
        .iter()
        .all(|event| event.turn_id.as_deref() != Some("turn_parallel")));
}

#[tokio::test]
async fn resume_queued_turn_rejects_incomplete_resume_contract_before_start() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_resume_contract".to_string()),
        thread_id: Some("thread_resume_contract".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_resume_contract".to_string(),
            turn_id: Some("turn_running".to_string()),
            input: AgentInput {
                text: "running".to_string(),
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
            session_id: "sess_resume_contract".to_string(),
            turn_id: Some("turn_queued".to_string()),
            input: AgentInput {
                text: "queued".to_string(),
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
    core.append_external_runtime_events(
        "sess_resume_contract",
        Some("turn_running"),
        vec![RuntimeEvent::new("turn.completed", json!({}))],
    )
    .expect("complete running");

    let error = core
        .resume_agent_session_thread(
            AgentSessionThreadResumeParams {
                session_id: "sess_resume_contract".to_string(),
                resume_contract: Some(RuntimeResumeContract {
                    schema_version: RUNTIME_RESUME_CONTRACT_SCHEMA_VERSION.to_string(),
                    runtime_id: "app-server".to_string(),
                    session_id: "sess_resume_contract".to_string(),
                    turn_id: "turn_queued".to_string(),
                    resume_mode: "selected-actions".to_string(),
                    open_action_ids: vec!["action-1".to_string()],
                    decisions: Vec::new(),
                    expires_at: None,
                    created_at: "2026-06-12T00:00:00.000Z".to_string(),
                }),
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect_err("incomplete resume contract should fail closed");
    assert!(matches!(error, RuntimeCoreError::CapabilityDenied(_)));

    let read = core
        .read_session_current(AgentSessionReadParams {
            session_id: "sess_resume_contract".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read session");
    assert!(read
        .turns
        .iter()
        .any(|turn| turn.turn_id == "turn_queued" && turn.status == AgentTurnStatus::Queued));
}

#[tokio::test]
async fn resume_queued_turn_restores_queue_when_backend_fails_before_emit() {
    let core = RuntimeCore::with_backend(Arc::new(FailBeforeEmitBackend {
        start_count: AtomicUsize::new(0),
    }));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_queue_rollback".to_string()),
        thread_id: Some("thread_queue_rollback".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_queue_rollback".to_string(),
            turn_id: Some("turn_running".to_string()),
            input: AgentInput {
                text: "running".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                provider_preference: Some("fixture-provider".to_string()),
                model_preference: Some("fixture-model".to_string()),
                host_options: Some(json!({
                    "asterChatRequest": {
                        "provider_config": {
                            "provider_id": "fixture-provider",
                            "provider_name": "openai",
                            "model_name": "fixture-model",
                            "api_key": "fixture-key",
                            "base_url": "http://127.0.0.1:65535"
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
    .expect("running turn");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_queue_rollback".to_string(),
            turn_id: Some("turn_queued".to_string()),
            input: AgentInput {
                text: "queued".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                provider_preference: Some("fixture-provider".to_string()),
                model_preference: Some("fixture-model".to_string()),
                ..RuntimeOptions::default()
            }),
            queue_if_busy: true,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("queued turn");
    core.append_external_runtime_events(
        "sess_queue_rollback",
        Some("turn_running"),
        vec![RuntimeEvent::new("turn.completed", json!({}))],
    )
    .expect("complete running");

    let error = core
        .resume_agent_session_thread(
            AgentSessionThreadResumeParams {
                session_id: "sess_queue_rollback".to_string(),
                resume_contract: None,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect_err("resume should fail before backend emits");
    assert!(matches!(error, RuntimeCoreError::Backend(_)));

    let read = core
        .read_session_current(AgentSessionReadParams {
            session_id: "sess_queue_rollback".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read session");
    assert!(read
        .turns
        .iter()
        .any(|turn| turn.turn_id == "turn_queued" && turn.status == AgentTurnStatus::Queued));
}

#[tokio::test]
async fn list_agent_sessions_excludes_hidden_runtime_core_sessions() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_hidden".to_string()),
        thread_id: Some("thread_hidden".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "hidden".to_string(),
            title: Some("Internal Smoke Session".to_string()),
            uri: None,
            metadata: Some(json!({
                "harness": {
                    "hiddenFromUserRecents": true,
                    "source": "unit"
                },
                "model": "gpt-test"
            })),
        }),
        locale: None,
    })
    .expect("hidden session");
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_visible".to_string()),
        thread_id: Some("thread_visible".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "visible".to_string(),
            title: Some("Visible Session".to_string()),
            uri: None,
            metadata: Some(json!({
                "model": "gpt-test"
            })),
        }),
        locale: None,
    })
    .expect("visible session");

    let response = core
        .list_agent_sessions(AgentSessionListParams {
            workspace_id: Some("workspace-current".to_string()),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions");

    let ids = response
        .sessions
        .iter()
        .map(|session| session.session_id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(ids, vec!["sess_visible"]);

    let hidden = core
        .read_session_current(AgentSessionReadParams {
            session_id: "sess_hidden".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("hidden session remains readable by id");
    assert_eq!(hidden.session.session_id, "sess_hidden");
}

#[tokio::test]
async fn read_session_current_does_not_fallback_to_persistent_history() {
    let core = RuntimeCore::default();
    let error = core
        .read_session_current(AgentSessionReadParams {
            session_id: "missing_legacy_session".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect_err("missing session should fail closed");

    assert_eq!(
        error.into_jsonrpc_error().code,
        error_codes::SESSION_NOT_FOUND
    );
}
