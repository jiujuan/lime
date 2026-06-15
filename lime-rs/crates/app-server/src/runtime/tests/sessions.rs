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

#[tokio::test]
async fn read_session_current_repairs_and_reads_jsonl_projection_without_legacy_messages() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let event_log_writer = Arc::new(EventLogWriter::new(&roots.event_log_root).expect("writer"));
    let projection_store =
        Arc::new(ProjectionStore::initialize(&roots.projection_db_path).expect("projection"));
    let core = RuntimeCore::with_backend(Arc::new(CompletedBackend))
        .with_event_log_writer(event_log_writer.clone())
        .with_projection_store(projection_store.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_projection_read".to_string()),
        thread_id: Some("thread_projection_read".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_projection_read".to_string(),
            turn_id: Some("turn_projection_read".to_string()),
            input: AgentInput {
                text: "hello".to_string(),
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
        .clear_session("sess_projection_read")
        .expect("simulate missing projection");

    let legacy_data_source = Arc::new(TestCurrentTimelineDataSource::new(
        empty_agent_session_read_response("legacy_unexpected"),
    ));
    let restarted_core = RuntimeCore::default()
        .with_event_log_writer(event_log_writer)
        .with_projection_store(projection_store.clone())
        .with_app_data_source(legacy_data_source.clone());

    let read = restarted_core
        .read_session_current(AgentSessionReadParams {
            session_id: "sess_projection_read".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read from projection");

    assert_eq!(read.session.session_id, "sess_projection_read");
    assert_eq!(read.session.thread_id, "thread_projection_read");
    assert_eq!(read.session.status, AgentSessionStatus::Completed);
    assert_eq!(read.turns.len(), 1);
    assert_eq!(read.turns[0].turn_id, "turn_projection_read");
    assert_eq!(read.turns[0].status, AgentTurnStatus::Completed);
    let detail = read.detail.expect("projection detail");
    assert_eq!(detail["projection_source"], "runtime.projection_1");
    assert_eq!(detail["thread_read"]["status"].as_str(), Some("completed"));
    assert!(legacy_data_source.read_requests().is_empty());
    let projected = projection_store
        .read_session("sess_projection_read")
        .expect("read repaired projection")
        .expect("projection row");
    assert_eq!(projected.last_event_sequence, 4);
}

#[tokio::test]
async fn list_agent_sessions_backfills_legacy_messages_to_jsonl_projection_and_clears_source() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let event_log_writer = Arc::new(EventLogWriter::new(&roots.event_log_root).expect("writer"));
    let projection_store =
        Arc::new(ProjectionStore::initialize(&roots.projection_db_path).expect("projection"));
    let data_source = Arc::new(
        TestCurrentTimelineDataSource::new(empty_agent_session_read_response("unused"))
            .with_legacy_transcripts(vec![LegacyAgentSessionTranscript {
                session_id: "legacy-session".to_string(),
                title: Some("旧历史会话".to_string()),
                model: "agent:default".to_string(),
                created_at: "2026-03-13T00:00:00Z".to_string(),
                updated_at: "2026-03-13T00:00:02Z".to_string(),
                archived_at: None,
                workspace_id: Some("workspace-main".to_string()),
                working_dir: Some("/tmp/legacy".to_string()),
                execution_strategy: Some("react".to_string()),
                provider_name: Some("openai".to_string()),
                messages: vec![
                    LegacyAgentMessage {
                        message_id: 1,
                        role: "user".to_string(),
                        text: "旧消息".to_string(),
                        timestamp: "2026-03-13T00:00:01Z".to_string(),
                    },
                    LegacyAgentMessage {
                        message_id: 2,
                        role: "assistant".to_string(),
                        text: "旧回复".to_string(),
                        timestamp: "2026-03-13T00:00:02Z".to_string(),
                    },
                ],
            }]),
    );
    let core = RuntimeCore::default()
        .with_event_log_writer(event_log_writer.clone())
        .with_projection_store(projection_store.clone())
        .with_app_data_source(data_source.clone());

    let listed = core
        .list_agent_sessions(AgentSessionListParams {
            workspace_id: Some("workspace-main".to_string()),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions");

    assert_eq!(listed.sessions.len(), 1);
    assert_eq!(listed.sessions[0].session_id, "legacy-session");
    assert_eq!(listed.sessions[0].title.as_deref(), Some("旧历史会话"));
    assert_eq!(listed.sessions[0].messages_count, 2);
    assert_eq!(
        data_source.cleared_legacy_session_ids(),
        vec!["legacy-session".to_string()]
    );
    let records = event_log_writer
        .read_session_events("legacy-session")
        .expect("read jsonl");
    assert_eq!(records.len(), 4);
    assert_eq!(records[0].event.event_type, "turn.accepted");
    assert_eq!(records[1].event.event_type, "message.created");
    assert_eq!(records[2].event.event_type, "message.delta");
    let projected = projection_store
        .read_session("legacy-session")
        .expect("read projection")
        .expect("projection row");
    assert_eq!(projected.session_id, "legacy-session");

    let read = core
        .read_session_current(AgentSessionReadParams {
            session_id: "legacy-session".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read legacy projection");
    let detail = read.detail.expect("detail");
    let messages = detail["messages"].as_array().expect("messages");
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0]["role"], "user");
    assert_eq!(messages[0]["content"][0]["text"], "旧消息");
    assert_eq!(messages[1]["role"], "assistant");
    assert_eq!(messages[1]["content"][0]["text"], "旧回复");
}

#[tokio::test]
async fn list_agent_sessions_can_retain_legacy_messages_by_cleanup_policy() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let event_log_writer = Arc::new(EventLogWriter::new(&roots.event_log_root).expect("writer"));
    let projection_store =
        Arc::new(ProjectionStore::initialize(&roots.projection_db_path).expect("projection"));
    let data_source = Arc::new(
        TestCurrentTimelineDataSource::new(empty_agent_session_read_response("unused"))
            .with_legacy_transcripts(vec![LegacyAgentSessionTranscript {
                session_id: "legacy-session".to_string(),
                title: Some("旧历史会话".to_string()),
                model: "agent:default".to_string(),
                created_at: "2026-03-13T00:00:00Z".to_string(),
                updated_at: "2026-03-13T00:00:02Z".to_string(),
                archived_at: None,
                workspace_id: Some("workspace-main".to_string()),
                working_dir: Some("/tmp/legacy".to_string()),
                execution_strategy: Some("react".to_string()),
                provider_name: Some("openai".to_string()),
                messages: vec![
                    LegacyAgentMessage {
                        message_id: 1,
                        role: "user".to_string(),
                        text: "旧消息".to_string(),
                        timestamp: "2026-03-13T00:00:01Z".to_string(),
                    },
                    LegacyAgentMessage {
                        message_id: 2,
                        role: "assistant".to_string(),
                        text: "旧回复".to_string(),
                        timestamp: "2026-03-13T00:00:02Z".to_string(),
                    },
                ],
            }]),
    );
    let core = RuntimeCore::default()
        .with_event_log_writer(event_log_writer.clone())
        .with_projection_store(projection_store)
        .with_app_data_source(data_source.clone())
        .with_legacy_message_cleanup_policy(LegacyMessageCleanupPolicy::Retain);

    let listed = core
        .list_agent_sessions(AgentSessionListParams {
            workspace_id: Some("workspace-main".to_string()),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions");

    assert_eq!(listed.sessions.len(), 1);
    assert_eq!(
        event_log_writer
            .read_session_events("legacy-session")
            .expect("read jsonl")
            .len(),
        4
    );
    assert!(data_source.cleared_legacy_session_ids().is_empty());
}

#[tokio::test]
async fn legacy_message_drop_empty_cleanup_failure_does_not_block_read_or_list() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let event_log_writer = Arc::new(EventLogWriter::new(&roots.event_log_root).expect("writer"));
    let projection_store =
        Arc::new(ProjectionStore::initialize(&roots.projection_db_path).expect("projection"));
    let data_source = Arc::new(
        TestCurrentTimelineDataSource::new(empty_agent_session_read_response("unused"))
            .with_legacy_transcripts(vec![LegacyAgentSessionTranscript {
                session_id: "legacy-session".to_string(),
                title: Some("旧历史会话".to_string()),
                model: "agent:default".to_string(),
                created_at: "2026-03-13T00:00:00Z".to_string(),
                updated_at: "2026-03-13T00:00:02Z".to_string(),
                archived_at: None,
                workspace_id: Some("workspace-main".to_string()),
                working_dir: Some("/tmp/legacy".to_string()),
                execution_strategy: Some("react".to_string()),
                provider_name: Some("openai".to_string()),
                messages: vec![
                    LegacyAgentMessage {
                        message_id: 1,
                        role: "user".to_string(),
                        text: "旧消息".to_string(),
                        timestamp: "2026-03-13T00:00:01Z".to_string(),
                    },
                    LegacyAgentMessage {
                        message_id: 2,
                        role: "assistant".to_string(),
                        text: "旧回复".to_string(),
                        timestamp: "2026-03-13T00:00:02Z".to_string(),
                    },
                ],
            }])
            .with_drop_empty_legacy_error("refuse to drop agent_messages: 27210 rows remain"),
    );
    let core = RuntimeCore::default()
        .with_event_log_writer(event_log_writer.clone())
        .with_projection_store(projection_store)
        .with_app_data_source(data_source.clone());

    let read = core
        .read_session_current(AgentSessionReadParams {
            session_id: "legacy-session".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read session despite non-empty legacy table");
    let detail = read.detail.expect("detail");
    let messages = detail["messages"].as_array().expect("messages");
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0]["content"][0]["text"], "旧消息");
    assert_eq!(messages[1]["content"][0]["text"], "旧回复");

    let listed = core
        .list_agent_sessions(AgentSessionListParams {
            workspace_id: Some("workspace-main".to_string()),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions despite non-empty legacy table");

    assert_eq!(listed.sessions.len(), 1);
    assert_eq!(listed.sessions[0].session_id, "legacy-session");
    assert_eq!(listed.sessions[0].messages_count, 2);
    assert_eq!(
        event_log_writer
            .read_session_events("legacy-session")
            .expect("read jsonl")
            .len(),
        4
    );
}

#[tokio::test]
async fn list_agent_sessions_clears_legacy_messages_after_interrupted_jsonl_backfill() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let event_log_writer = Arc::new(EventLogWriter::new(&roots.event_log_root).expect("writer"));
    let projection_store =
        Arc::new(ProjectionStore::initialize(&roots.projection_db_path).expect("projection"));
    for event in [
        AgentEvent {
            event_id: "legacy:legacy-session:1:turn.accepted".to_string(),
            sequence: 1,
            session_id: "legacy-session".to_string(),
            thread_id: Some("legacy-session".to_string()),
            turn_id: Some("legacy-turn-1".to_string()),
            event_type: "turn.accepted".to_string(),
            timestamp: "2026-03-13T00:00:01Z".to_string(),
            payload: json!({
                "source": "legacy_agent_messages_backfill",
                "session": {
                    "title": "旧历史会话",
                    "model": "agent:default",
                    "createdAt": "2026-03-13T00:00:00Z",
                    "updatedAt": "2026-03-13T00:00:02Z",
                    "workspaceId": "workspace-main",
                    "workingDir": "/tmp/legacy",
                    "executionStrategy": "react"
                },
            }),
        },
        AgentEvent {
            event_id: "legacy:legacy-session:1:message.created".to_string(),
            sequence: 2,
            session_id: "legacy-session".to_string(),
            thread_id: Some("legacy-session".to_string()),
            turn_id: Some("legacy-turn-1".to_string()),
            event_type: "message.created".to_string(),
            timestamp: "2026-03-13T00:00:01Z".to_string(),
            payload: json!({
                "role": "user",
                "visibility": "user_visible",
                "input": { "text": "旧消息", "attachments": [] },
                "content": { "kind": "inline_text", "text": "旧消息" },
                "source": "legacy_agent_messages_backfill",
            }),
        },
        AgentEvent {
            event_id: "legacy:legacy-session:2:message.delta".to_string(),
            sequence: 3,
            session_id: "legacy-session".to_string(),
            thread_id: Some("legacy-session".to_string()),
            turn_id: Some("legacy-turn-1".to_string()),
            event_type: "message.delta".to_string(),
            timestamp: "2026-03-13T00:00:02Z".to_string(),
            payload: json!({
                "text": "旧回复",
                "source": "legacy_agent_messages_backfill",
            }),
        },
        AgentEvent {
            event_id: "legacy:legacy-session:2:turn.completed".to_string(),
            sequence: 4,
            session_id: "legacy-session".to_string(),
            thread_id: Some("legacy-session".to_string()),
            turn_id: Some("legacy-turn-1".to_string()),
            event_type: "turn.completed".to_string(),
            timestamp: "2026-03-13T00:00:02Z".to_string(),
            payload: json!({
                "source": "legacy_agent_messages_backfill",
            }),
        },
    ] {
        event_log_writer
            .append(&event)
            .expect("append existing jsonl");
    }
    let data_source = Arc::new(
        TestCurrentTimelineDataSource::new(empty_agent_session_read_response("unused"))
            .with_legacy_transcripts(vec![LegacyAgentSessionTranscript {
                session_id: "legacy-session".to_string(),
                title: Some("旧历史会话".to_string()),
                model: "agent:default".to_string(),
                created_at: "2026-03-13T00:00:00Z".to_string(),
                updated_at: "2026-03-13T00:00:02Z".to_string(),
                archived_at: None,
                workspace_id: Some("workspace-main".to_string()),
                working_dir: Some("/tmp/legacy".to_string()),
                execution_strategy: Some("react".to_string()),
                provider_name: Some("openai".to_string()),
                messages: vec![
                    LegacyAgentMessage {
                        message_id: 1,
                        role: "user".to_string(),
                        text: "旧消息".to_string(),
                        timestamp: "2026-03-13T00:00:01Z".to_string(),
                    },
                    LegacyAgentMessage {
                        message_id: 2,
                        role: "assistant".to_string(),
                        text: "旧回复".to_string(),
                        timestamp: "2026-03-13T00:00:02Z".to_string(),
                    },
                ],
            }]),
    );
    let core = RuntimeCore::default()
        .with_event_log_writer(event_log_writer.clone())
        .with_projection_store(projection_store.clone())
        .with_app_data_source(data_source.clone());

    let listed = core
        .list_agent_sessions(AgentSessionListParams {
            workspace_id: Some("workspace-main".to_string()),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions");

    assert_eq!(listed.sessions.len(), 1);
    assert_eq!(listed.sessions[0].session_id, "legacy-session");
    assert_eq!(listed.sessions[0].messages_count, 2);
    assert_eq!(
        data_source.cleared_legacy_session_ids(),
        vec!["legacy-session".to_string()]
    );
    assert_eq!(
        event_log_writer
            .read_session_events("legacy-session")
            .expect("read existing jsonl")
            .len(),
        4
    );
    let projected = projection_store
        .read_session("legacy-session")
        .expect("read repaired projection")
        .expect("projection row");
    assert_eq!(projected.last_event_sequence, 4);
}
