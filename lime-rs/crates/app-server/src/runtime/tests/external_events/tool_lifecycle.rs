use super::*;

#[tokio::test]
async fn append_external_runtime_events_rejects_unpaired_tool_result_before_storage() {
    let core = RuntimeCore::default();
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_tool_sequence_gate".to_string()),
            thread_id: Some("thread_tool_sequence_gate".to_string()),
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
                turn_id: Some("turn_tool_sequence_gate".to_string()),
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
    let turn_id = output.response.turn.turn_id;
    let before = core
        .read_session(AgentSessionReadParams {
            session_id: session.session_id.clone(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read before");
    let before_event_count = core
        .events_for_session(&session.session_id)
        .expect("events before")
        .len();

    let error = core
        .append_external_runtime_events(
            &session.session_id,
            Some(&turn_id),
            vec![RuntimeEvent::new(
                "tool.result",
                json!({
                    "toolCallId": "tool_without_start",
                    "toolName": "WebFetch",
                    "output": "should not be stored"
                }),
            )],
        )
        .expect_err("unpaired tool.result must fail closed");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("agent runtime event sequence validation failed"));
            assert!(message.contains("tool_result_without_start"));
        }
        other => panic!("expected backend sequence validation error, got {other:?}"),
    }

    let after = core
        .read_session(AgentSessionReadParams {
            session_id: session.session_id.clone(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read after");
    let after_event_count = core
        .events_for_session(&session.session_id)
        .expect("events after")
        .len();

    assert_eq!(after_event_count, before_event_count);
    assert_eq!(after.turns[0].status, before.turns[0].status);
    assert_eq!(after.session.status, before.session.status);
}

#[tokio::test]
async fn append_external_runtime_events_rejects_tool_args_without_started_tool() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_tool_args_lifecycle",
        "thread_tool_args_lifecycle",
        "turn_tool_args_lifecycle",
    )
    .await;
    let before = core
        .read_session(AgentSessionReadParams {
            session_id: session_id.clone(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read before");
    let before_event_count = core
        .events_for_session(&session_id)
        .expect("events before")
        .len();

    let error = core
        .append_external_runtime_events(
            &session_id,
            Some(&turn_id),
            vec![RuntimeEvent::new(
                "tool.args",
                json!({
                    "toolCallId": "tool_without_start",
                    "args": { "query": "news" }
                }),
            )],
        )
        .expect_err("tool.args without tool.started must fail closed");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("agent runtime tool lifecycle validation failed"));
            assert!(message.contains("tool_args_without_start"));
        }
        other => panic!("expected backend tool lifecycle validation error, got {other:?}"),
    }

    assert_runtime_state_unchanged(&core, &session_id, &before, before_event_count);
}

#[tokio::test]
async fn append_external_runtime_events_rejects_tool_output_delta_without_started_tool() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_tool_output_lifecycle",
        "thread_tool_output_lifecycle",
        "turn_tool_output_lifecycle",
    )
    .await;
    let before = core
        .read_session(AgentSessionReadParams {
            session_id: session_id.clone(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read before");
    let before_event_count = core
        .events_for_session(&session_id)
        .expect("events before")
        .len();

    let error = core
        .append_external_runtime_events(
            &session_id,
            Some(&turn_id),
            vec![RuntimeEvent::new(
                "tool.output.delta",
                json!({
                    "toolCallId": "tool_without_start",
                    "delta": "partial output"
                }),
            )],
        )
        .expect_err("tool.output.delta without tool.started must fail closed");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("agent runtime tool lifecycle validation failed"));
            assert!(message.contains("tool_output_without_start"));
        }
        other => panic!("expected backend tool lifecycle validation error, got {other:?}"),
    }

    assert_runtime_state_unchanged(&core, &session_id, &before, before_event_count);
}

#[tokio::test]
async fn append_external_runtime_events_allows_tool_args_between_start_and_result() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_tool_args_active_lifecycle",
        "thread_tool_args_active_lifecycle",
        "turn_tool_args_active_lifecycle",
    )
    .await;

    let appended = core
        .append_external_runtime_events(
            &session_id,
            Some(&turn_id),
            vec![
                RuntimeEvent::new(
                    "tool.started",
                    json!({
                        "toolCallId": "tool_with_args",
                        "toolName": "WebFetch"
                    }),
                ),
                RuntimeEvent::new(
                    "tool.args.delta",
                    json!({
                        "toolCallId": "tool_with_args",
                        "delta": "{\"url\":\"https://example.com\"}"
                    }),
                ),
                RuntimeEvent::new(
                    "tool.result",
                    json!({
                        "toolCallId": "tool_with_args",
                        "toolName": "WebFetch",
                        "output": "ok"
                    }),
                ),
            ],
        )
        .expect("tool args inside active lifecycle should append");

    assert_eq!(appended.len(), 3);
    assert_eq!(appended[1].event_type, "tool.args.delta");
}

#[tokio::test]
async fn append_external_runtime_events_rejects_batch_atomically_before_storage() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_batch_atomic_lifecycle",
        "thread_batch_atomic_lifecycle",
        "turn_batch_atomic_lifecycle",
    )
    .await;
    let before = core
        .read_session(AgentSessionReadParams {
            session_id: session_id.clone(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read before");
    let before_event_count = core
        .events_for_session(&session_id)
        .expect("events before")
        .len();

    let error = core
        .append_external_runtime_events(
            &session_id,
            Some(&turn_id),
            vec![
                RuntimeEvent::new(
                    "tool.started",
                    json!({
                        "toolCallId": "tool_batch_atomic",
                        "toolName": "WebFetch"
                    }),
                ),
                RuntimeEvent::new("turn.completed", json!({})),
            ],
        )
        .expect_err("invalid event batch must fail closed atomically");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("agent runtime event sequence validation failed"));
            assert!(message.contains("tool_unclosed_at_turn_end"));
        }
        other => panic!("expected backend sequence validation error, got {other:?}"),
    }

    assert_runtime_state_unchanged(&core, &session_id, &before, before_event_count);
}

#[tokio::test]
async fn append_external_runtime_events_rejects_sandbox_blocked_for_inactive_tool() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_sandbox_lifecycle",
        "thread_sandbox_lifecycle",
        "turn_sandbox_lifecycle",
    )
    .await;

    core.append_external_runtime_events(
        &session_id,
        Some(&turn_id),
        vec![
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "tool_completed",
                    "toolName": "Shell"
                }),
            ),
            RuntimeEvent::new(
                "tool.result",
                json!({
                    "toolCallId": "tool_completed",
                    "toolName": "Shell",
                    "output": "done"
                }),
            ),
        ],
    )
    .expect("completed tool lifecycle should be accepted");
    let before = core
        .read_session(AgentSessionReadParams {
            session_id: session_id.clone(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read before");
    let before_event_count = core
        .events_for_session(&session_id)
        .expect("events before")
        .len();

    let error = core
        .append_external_runtime_events(
            &session_id,
            Some(&turn_id),
            vec![RuntimeEvent::new(
                "sandbox.blocked",
                json!({
                    "toolCallId": "tool_completed",
                    "reasonCode": "network_disabled"
                }),
            )],
        )
        .expect_err("sandbox.blocked for inactive tool must fail closed");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("agent runtime tool lifecycle validation failed"));
            assert!(message.contains("tool_policy_event_without_active_tool"));
        }
        other => panic!("expected backend tool lifecycle validation error, got {other:?}"),
    }

    assert_runtime_state_unchanged(&core, &session_id, &before, before_event_count);
}
