use super::support::*;
use super::*;

#[test]
fn capability_list_with_unknown_session_id_returns_session_not_found() {
    let core = RuntimeCore::default();

    let error = core
        .list_capabilities(CapabilityListParams {
            app_id: None,
            workspace_id: None,
            session_id: Some("sess_missing".to_string()),
            cursor: None,
            limit: None,
        })
        .expect_err("missing session");

    match error {
        RuntimeCoreError::SessionNotFound(session_id) => {
            assert_eq!(session_id, "sess_missing");
        }
        other => panic!("expected session not found, got {other:?}"),
    }
}

#[tokio::test]
async fn mock_backend_emits_public_runtime_event() {
    let core = RuntimeCore::default();
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: None,
            thread_id: None,
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: None,
                input: AgentInput {
                    text: "hello".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext {
                client_name: Some("test-client".to_string()),
                client_version: None,
            },
        )
        .await
        .expect("turn");

    let events = core
        .events_for_session(&session.session_id)
        .expect("runtime events");
    assert_eq!(events.len(), 2);
    assert_eq!(output.events.len(), 2);
    assert_eq!(events[0].event_type, "message.created");
    assert_eq!(events[0].payload["role"], "user");
    assert_eq!(events[0].payload["input"]["text"], "hello");
    assert_eq!(events[1].event_type, "turn.accepted");
    assert_eq!(events[1].payload["backend"], "mock");
    assert_eq!(events[1].payload["clientName"], "test-client");
}

#[tokio::test]
async fn runtime_events_are_appended_to_jsonl_event_log() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let event_log_writer = Arc::new(EventLogWriter::new(&roots.event_log_root).expect("writer"));
    let projection_store =
        Arc::new(ProjectionStore::initialize(&roots.projection_db_path).expect("projection"));
    let core = RuntimeCore::default()
        .with_event_log_writer(event_log_writer.clone())
        .with_projection_store(projection_store.clone());
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_jsonl".to_string()),
            thread_id: Some("thread_jsonl".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: session.session_id.clone(),
            turn_id: Some("turn_jsonl".to_string()),
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

    let records = event_log_writer
        .read_session_events("sess_jsonl")
        .expect("jsonl records");
    assert_eq!(records.len(), 2);
    assert!(records[0]
        .path
        .ends_with("events/sessions/session_sess_jsonl.jsonl"));
    assert_eq!(records[0].event.session_id, "sess_jsonl");
    assert_eq!(records[0].event.thread_id.as_deref(), Some("thread_jsonl"));
    assert_eq!(records[0].event.turn_id.as_deref(), Some("turn_jsonl"));
    assert_eq!(records[0].event.event_type, "message.created");
    assert_eq!(records[0].event.payload["input"]["text"], "hello");
    assert_eq!(records[1].event.event_type, "turn.accepted");

    let projected = projection_store
        .read_session("sess_jsonl")
        .expect("read projection")
        .expect("projected session");
    assert_eq!(projected.thread_id, "thread_jsonl");
    assert_eq!(projected.status, "running");
    assert_eq!(projected.last_event_sequence, 2);
}

#[tokio::test]
async fn completed_runtime_event_marks_turn_completed() {
    let core = RuntimeCore::with_backend(Arc::new(CompletedBackend));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_completed".to_string()),
            thread_id: Some("thread_completed".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("turn_completed".to_string()),
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

    assert_eq!(output.response.turn.status, AgentTurnStatus::Completed);
    assert!(output.response.turn.completed_at.is_some());

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    assert_eq!(read.session.status, AgentSessionStatus::Completed);
    assert_eq!(read.turns.len(), 1);
    assert_eq!(read.turns[0].status, AgentTurnStatus::Completed);
    assert!(read.turns[0].completed_at.is_some());
}

#[tokio::test]
async fn trace_metadata_is_attached_to_runtime_events() {
    let core = RuntimeCore::with_backend(Arc::new(CompletedBackend));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_trace".to_string()),
            thread_id: Some("thread_trace".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("turn_trace".to_string()),
                input: AgentInput {
                    text: "hello".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    metadata: Some(json!({
                        "agentUiPerformanceTrace": {
                            "requestId": "request_trace",
                            "runId": "run_trace",
                            "sessionId": "sess_trace",
                            "source": "agent-chat",
                            "submittedAt": 1_710_000_000_000i64,
                            "traceId": "trace_trace",
                            "turnId": "turn_trace",
                            "w3cTraceContext": {
                                "traceparent": "00-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA-BBBBBBBBBBBBBBBB-01",
                                "tracestate": "vendor=value"
                            },
                            "workspaceId": "default"
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
        .expect("turn");

    let delta = output
        .events
        .iter()
        .find(|event| event.event_type == "message.delta")
        .expect("message delta");
    assert_eq!(delta.payload["trace_id"], "trace_trace");
    assert_eq!(delta.payload["run_id"], "run_trace");
    assert_eq!(delta.payload["request_id"], "request_trace");
    assert!(delta.payload["server_event_emitted_at"]
        .as_i64()
        .is_some_and(|value| value > 0));
    assert_eq!(
        delta.payload["trace"]["checkpoint"],
        "app_server.message_delta.emitted"
    );
    assert_eq!(delta.payload["trace"]["schemaVersion"], json!(1));
    assert_eq!(
        delta.payload["trace"]["submittedAt"],
        json!(1_710_000_000_000i64)
    );
    assert_eq!(
        delta.payload["trace"]["w3cTraceparent"],
        "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01"
    );
    assert_eq!(
        delta.payload["trace"]["w3cTraceId"],
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    );
    assert_eq!(delta.payload["trace"]["w3cTracestate"], "vendor=value");

    let completed = output
        .events
        .iter()
        .find(|event| event.event_type == "turn.completed")
        .expect("turn completed");
    assert_eq!(
        completed.payload["trace"]["checkpoint"],
        "app_server.turn.terminal"
    );
    assert_eq!(completed.payload["trace"]["traceId"], "trace_trace");
}

#[tokio::test]
async fn invalid_w3c_trace_context_is_not_propagated_to_runtime_events() {
    let core = RuntimeCore::with_backend(Arc::new(CompletedBackend));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_invalid_w3c".to_string()),
            thread_id: Some("thread_invalid_w3c".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("turn_invalid_w3c".to_string()),
                input: AgentInput {
                    text: "hello".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    metadata: Some(json!({
                        "agentUiPerformanceTrace": {
                            "requestId": "request_invalid_w3c",
                            "runId": "run_invalid_w3c",
                            "sessionId": "sess_invalid_w3c",
                            "traceId": "trace_invalid_w3c",
                            "w3cTraceContext": {
                                "traceparent": "00-00000000000000000000000000000000-bbbbbbbbbbbbbbbb-01",
                                "tracestate": "vendor=value"
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
        .expect("turn");

    let delta = output
        .events
        .iter()
        .find(|event| event.event_type == "message.delta")
        .expect("message delta");
    assert_eq!(delta.payload["trace_id"], "trace_invalid_w3c");
    assert!(delta.payload["trace"].get("w3cTraceparent").is_none());
    assert!(delta.payload["trace"].get("w3cTraceId").is_none());
    assert!(delta.payload["trace"].get("w3cTracestate").is_none());
}

#[tokio::test]
async fn provider_trace_events_keep_provider_wait_separate_from_message_delta() {
    let core = RuntimeCore::with_backend(Arc::new(ProviderTraceBackend));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_provider_trace".to_string()),
            thread_id: Some("thread_provider_trace".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("turn_provider_trace".to_string()),
                input: AgentInput {
                    text: "hello".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    metadata: Some(json!({
                        "agentUiPerformanceTrace": {
                            "requestId": "request_provider_trace",
                            "runId": "run_provider_trace",
                            "sessionId": "sess_provider_trace",
                            "source": "agent-chat",
                            "submittedAt": 1_710_000_000_000i64,
                            "traceId": "trace_provider_trace",
                            "turnId": "turn_provider_trace",
                            "workspaceId": "default"
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
        .expect("turn");

    let provider_first_text = output
        .events
        .iter()
        .find(|event| event.event_type == "provider.first_text_delta.received")
        .expect("provider first text trace");
    assert_eq!(
        provider_first_text.payload["trace_id"],
        "trace_provider_trace"
    );
    assert_eq!(
        provider_first_text.payload["trace"]["checkpoint"],
        "provider.first_text_delta.received"
    );
    assert_eq!(provider_first_text.payload["elapsed_ms"], json!(1500));
    assert_eq!(provider_first_text.payload["text_chars"], json!(4));
    assert_eq!(
        provider_first_text.payload["provider_request_id"],
        "req-provider-1"
    );
    assert_eq!(
        provider_first_text.payload["provider_request_id_header"],
        "x-request-id"
    );
    assert!(provider_first_text.payload["server_event_emitted_at"]
        .as_i64()
        .is_some_and(|value| value > 0));

    let delta = output
        .events
        .iter()
        .find(|event| event.event_type == "message.delta")
        .expect("message delta");
    assert_eq!(
        delta.payload["trace"]["checkpoint"],
        "app_server.message_delta.emitted"
    );
    assert_ne!(
        provider_first_text.payload["trace"]["checkpoint"],
        delta.payload["trace"]["checkpoint"]
    );
}

#[tokio::test]
async fn trace_events_are_appended_to_raw_trace_store_without_payload_text() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let trace_event_writer =
        Arc::new(TraceEventWriter::new(&roots.trace_log_root).expect("trace writer"));
    let core = RuntimeCore::with_backend(Arc::new(ProviderTraceBackend))
        .with_trace_event_writer(trace_event_writer.clone());
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_raw_trace".to_string()),
            thread_id: Some("thread_raw_trace".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: session.session_id.clone(),
            turn_id: Some("turn_raw_trace".to_string()),
            input: AgentInput {
                text: "hello raw prompt must not be stored".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                metadata: Some(json!({
                    "agentUiPerformanceTrace": {
                        "requestId": "request_raw_trace",
                        "runId": "run_raw_trace",
                        "sessionId": "sess_raw_trace",
                        "source": "agent-chat",
                        "submittedAt": 1_710_000_000_000i64,
                        "traceId": "trace_raw_trace",
                        "turnId": "turn_raw_trace",
                        "workspaceId": "default"
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
    .expect("turn");

    let records = trace_event_writer
        .read_raw_trace_events("sess_raw_trace", "trace_raw_trace")
        .expect("raw trace records");
    assert!(records.len() >= 6, "raw trace records: {records:?}");
    assert_eq!(records[0].event.seq, 1);
    assert!(records
        .iter()
        .any(|record| record.event.checkpoint == "provider.first_text_delta.received"));
    assert!(records
        .iter()
        .any(|record| record.event.checkpoint == "app_server.message_delta.emitted"));
    let provider_first_text = records
        .iter()
        .find(|record| record.event.checkpoint == "provider.first_text_delta.received")
        .expect("provider first text trace");
    assert_eq!(provider_first_text.event.metrics["elapsed_ms"], json!(1500));
    assert_eq!(provider_first_text.event.metrics["text_chars"], json!(4));
    assert_eq!(
        provider_first_text.event.metrics["provider_request_id"],
        json!("req-provider-1")
    );
    assert_eq!(
        provider_first_text.event.metrics["provider_request_id_header"],
        json!("x-request-id")
    );
    assert_eq!(provider_first_text.event.redaction.mode, "summary_only");
    assert!(!provider_first_text.event.redaction.raw_agent_event_payload);
    assert!(!provider_first_text.event.redaction.prompt_text);
    assert!(!provider_first_text.event.redaction.provider_payload);

    let raw = records
        .iter()
        .map(|record| std::fs::read_to_string(&record.path).expect("trace file"))
        .collect::<Vec<_>>()
        .join("\n");
    assert!(!raw.contains("hello raw prompt must not be stored"));
    assert!(!raw.contains("你好！有什么可以帮你的吗？"));
    assert!(!raw.contains("\"input\""));
    assert!(!raw.contains("\"text\""));
}

#[tokio::test]
async fn legacy_final_done_runtime_event_is_rejected_by_current_schema() {
    let core = RuntimeCore::with_backend(Arc::new(RecordingBackend::default()));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_final_done".to_string()),
            thread_id: Some("thread_final_done".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("turn_final_done".to_string()),
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
    let error = core
        .append_runtime_events(
            &session.session_id,
            &session.thread_id,
            Some(&output.response.turn.turn_id),
            vec![RuntimeEvent::new(
                "turn.final_done",
                json!({ "usage": { "total": 1 } }),
            )],
        )
        .expect_err("legacy final_done must be rejected");
    assert!(
        error
            .to_string()
            .contains("legacy runtime terminal event `turn.final_done`"),
        "unexpected error: {error}"
    );

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    assert_eq!(read.session.status, AgentSessionStatus::Running);
    assert_eq!(read.turns.len(), 1);
    assert_eq!(read.turns[0].status, AgentTurnStatus::Accepted);
    assert!(read.turns[0].completed_at.is_none());
}

#[tokio::test]
async fn cancel_turn_returns_canceled_without_waiting_for_backend_cancel() {
    let backend = Arc::new(HangingCancelBackend {
        cancel_count: AtomicUsize::new(0),
    });
    let core = RuntimeCore::with_backend(backend.clone());
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_cancel_fast".to_string()),
            thread_id: Some("thread_cancel_fast".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;
    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("turn_cancel_fast".to_string()),
                input: AgentInput {
                    text: "please keep running".to_string(),
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
    assert_eq!(turn.status, AgentTurnStatus::Running);

    let output = timeout(
        Duration::from_millis(100),
        core.cancel_turn(
            AgentSessionTurnCancelParams {
                session_id: session.session_id.clone(),
                turn_id: turn.turn_id.clone(),
            },
            RuntimeHostContext::default(),
        ),
    )
    .await
    .expect("cancel should not wait for backend")
    .expect("cancel");

    assert_eq!(output.events.len(), 1);
    assert_eq!(output.events[0].event_type, "turn.canceled");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    assert_eq!(read.session.status, AgentSessionStatus::Canceled);
    assert_eq!(read.turns[0].status, AgentTurnStatus::Canceled);
    assert!(read.turns[0].completed_at.is_some());
}

#[tokio::test]
async fn canceled_turn_ignores_late_runtime_events() {
    let core = RuntimeCore::with_backend(Arc::new(HangingCancelBackend {
        cancel_count: AtomicUsize::new(0),
    }));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_cancel_late".to_string()),
            thread_id: Some("thread_cancel_late".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;
    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("turn_cancel_late".to_string()),
                input: AgentInput {
                    text: "please keep running".to_string(),
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
    core.cancel_turn(
        AgentSessionTurnCancelParams {
            session_id: session.session_id.clone(),
            turn_id: turn.turn_id.clone(),
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("cancel");

    let late_events = core
        .append_external_runtime_events(
            &session.session_id,
            Some(&turn.turn_id),
            vec![
                RuntimeEvent::new("message.delta", json!({ "text": "late reply" })),
                RuntimeEvent::new("turn.completed", json!({})),
            ],
        )
        .expect("append late events");

    assert!(late_events.is_empty());
    let read = core
        .read_session(AgentSessionReadParams {
            session_id: session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    assert_eq!(read.session.status, AgentSessionStatus::Canceled);
    assert_eq!(read.turns[0].status, AgentTurnStatus::Canceled);
    assert_eq!(
        read.detail.unwrap()["messages"].as_array().unwrap().len(),
        1
    );
}

#[tokio::test]
async fn unavailable_backend_rejects_turn_without_persisting_fake_turn() {
    let core = RuntimeCore::with_backend(Arc::new(UnavailableBackend));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_unavailable".to_string()),
            thread_id: None,
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let error = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("turn_unavailable".to_string()),
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
        .expect_err("unavailable backend");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("standalone app-server backend is not configured"));
        }
        other => panic!("expected backend error, got {other:?}"),
    }

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    assert_eq!(read.session.status, AgentSessionStatus::Idle);
    assert!(read.turns.is_empty());
    assert!(core
        .events_for_session("sess_unavailable")
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn start_turn_allows_visible_capability_id() {
    let core = RuntimeCore::with_backend_and_capability_source(
        Arc::new(MockBackend),
        Arc::new(crate::CapabilityInventorySource::new(vec![
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "content.draft.generate".to_string(),
                title: "Generate Draft".to_string(),
                description: None,
                methods: vec!["agentSession/turn/start".to_string()],
            })
            .for_apps(["content-studio"]),
        ])),
    );
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_capability".to_string()),
            thread_id: None,
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("turn_capability".to_string()),
                input: AgentInput {
                    text: "draft".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    capability_id: Some("content.draft.generate".to_string()),
                    stream: false,
                    event_name: None,
                    provider_preference: None,
                    model_preference: None,
                    metadata: None,
                    queued_turn_id: None,
                    host_options: None,
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn");

    assert_eq!(output.response.turn.turn_id, "turn_capability");
}

#[tokio::test]
async fn start_turn_allows_session_scoped_capability_id() {
    let core = RuntimeCore::with_backend_and_capability_source(
        Arc::new(MockBackend),
        Arc::new(crate::CapabilityInventorySource::new(vec![
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "session.draft.write".to_string(),
                title: "Session Draft Write".to_string(),
                description: None,
                methods: vec![METHOD_AGENT_SESSION_TURN_START.to_string()],
            })
            .for_apps(["content-studio"])
            .for_workspaces(["workspace-main"])
            .for_sessions(["sess_runtime_allowed"]),
        ])),
    );
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_runtime_allowed".to_string()),
        thread_id: None,
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_runtime_allowed".to_string(),
                turn_id: Some("turn_session_capability".to_string()),
                input: AgentInput {
                    text: "draft".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    capability_id: Some("session.draft.write".to_string()),
                    stream: false,
                    event_name: None,
                    provider_preference: None,
                    model_preference: None,
                    metadata: None,
                    queued_turn_id: None,
                    host_options: None,
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn");

    assert_eq!(output.response.turn.turn_id, "turn_session_capability");
}

#[tokio::test]
async fn start_turn_rejects_hidden_capability_id_without_persisting_turn() {
    let core = RuntimeCore::with_backend_and_capability_source(
        Arc::new(MockBackend),
        Arc::new(crate::CapabilityInventorySource::new(vec![
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "content.draft.generate".to_string(),
                title: "Generate Draft".to_string(),
                description: None,
                methods: vec!["agentSession/turn/start".to_string()],
            })
            .for_apps(["other-app"]),
        ])),
    );
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_capability_denied".to_string()),
        thread_id: None,
        app_id: "content-studio".to_string(),
        workspace_id: Some("default".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let error = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_capability_denied".to_string(),
                turn_id: Some("turn_denied".to_string()),
                input: AgentInput {
                    text: "draft".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    capability_id: Some("content.draft.generate".to_string()),
                    stream: false,
                    event_name: None,
                    provider_preference: None,
                    model_preference: None,
                    metadata: None,
                    queued_turn_id: None,
                    host_options: None,
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect_err("capability denied");

    match error {
        RuntimeCoreError::CapabilityDenied(capability_id) => {
            assert_eq!(capability_id, "content.draft.generate");
        }
        other => panic!("expected capability denied, got {other:?}"),
    }
    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_capability_denied".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    assert!(read.turns.is_empty());
}

#[tokio::test]
async fn start_turn_rejects_readiness_only_capability_id_without_persisting_turn() {
    let core = RuntimeCore::with_backend_and_capability_source(
        Arc::new(MockBackend),
        Arc::new(crate::CapabilityInventorySource::new(vec![
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "content.readiness.check".to_string(),
                title: "Readiness Check".to_string(),
                description: None,
                methods: vec!["capability/list".to_string()],
            })
            .for_apps(["content-studio"]),
        ])),
    );
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_readiness_only".to_string()),
        thread_id: None,
        app_id: "content-studio".to_string(),
        workspace_id: Some("default".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let listed = core
        .list_capabilities(CapabilityListParams {
            app_id: Some("content-studio".to_string()),
            workspace_id: Some("default".to_string()),
            session_id: None,
            cursor: None,
            limit: None,
        })
        .expect("capability list");
    assert_eq!(listed.capabilities.len(), 1);
    assert_eq!(listed.capabilities[0].id, "content.readiness.check");

    let error = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_readiness_only".to_string(),
                turn_id: Some("turn_readiness_denied".to_string()),
                input: AgentInput {
                    text: "draft".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    capability_id: Some("content.readiness.check".to_string()),
                    stream: false,
                    event_name: None,
                    provider_preference: None,
                    model_preference: None,
                    metadata: None,
                    queued_turn_id: None,
                    host_options: None,
                    ..RuntimeOptions::default()
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect_err("capability denied");

    match error {
        RuntimeCoreError::CapabilityDenied(capability_id) => {
            assert_eq!(capability_id, "content.readiness.check");
        }
        other => panic!("expected capability denied, got {other:?}"),
    }
    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_readiness_only".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    assert!(read.turns.is_empty());
}

#[test]
fn start_session_can_bind_caller_supplied_ids() {
    let core = RuntimeCore::default();

    let response = core
        .start_session(AgentSessionStartParams {
            session_id: Some(" sess_external ".to_string()),
            thread_id: Some(" thread_external ".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");

    assert_eq!(response.session.session_id, "sess_external");
    assert_eq!(response.session.thread_id, "thread_external");
}

#[test]
fn start_session_rejects_duplicate_session_id() {
    let core = RuntimeCore::default();
    let params = AgentSessionStartParams {
        session_id: Some("sess_external".to_string()),
        thread_id: Some("thread_external".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("default".to_string()),
        business_object_ref: None,
        locale: None,
    };

    core.start_session(params.clone()).expect("first session");
    let error = core
        .start_session(params)
        .expect_err("duplicate session should fail");

    match error {
        RuntimeCoreError::SessionAlreadyExists(session_id) => {
            assert_eq!(session_id, "sess_external");
        }
        other => panic!("expected duplicate session error, got {other:?}"),
    }
}
