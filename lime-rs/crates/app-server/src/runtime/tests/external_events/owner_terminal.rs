use super::*;

#[tokio::test]
async fn append_external_runtime_events_allows_tool_result_with_matching_owner() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_tool_owner_matching",
        "thread_tool_owner_matching",
        "turn_tool_owner_matching",
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
                        "toolCallId": "tool_owned",
                        "toolName": "Shell",
                        "messageId": "assistant_owned",
                        "itemId": "item_owned"
                    }),
                ),
                RuntimeEvent::new(
                    "tool.result",
                    json!({
                        "toolCallId": "tool_owned",
                        "toolName": "Shell",
                        "assistantMessageId": "assistant_owned",
                        "itemId": "item_owned",
                        "output": "ok"
                    }),
                ),
            ],
        )
        .expect("matching tool owner should append");

    assert_eq!(appended.len(), 2);
    assert_eq!(appended[1].event_type, "tool.result");
}

#[tokio::test]
async fn append_external_runtime_events_rejects_tool_result_owner_mismatch() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_tool_owner_mismatch",
        "thread_tool_owner_mismatch",
        "turn_tool_owner_mismatch",
    )
    .await;

    core.append_external_runtime_events(
        &session_id,
        Some(&turn_id),
        vec![RuntimeEvent::new(
            "tool.started",
            json!({
                "toolCallId": "tool_owned",
                "toolName": "Shell",
                "messageId": "assistant_owned"
            }),
        )],
    )
    .expect("owned tool start should append");
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
                "tool.result",
                json!({
                    "toolCallId": "tool_owned",
                    "toolName": "Shell",
                    "messageId": "assistant_other",
                    "output": "wrong owner"
                }),
            )],
        )
        .expect_err("tool result with mismatched owner must fail closed");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("agent runtime tool lifecycle validation failed"));
            assert!(message.contains("tool_event_owner_mismatch"));
        }
        other => panic!("expected backend tool lifecycle validation error, got {other:?}"),
    }

    assert_runtime_state_unchanged(&core, &session_id, &before, before_event_count);
}

#[tokio::test]
async fn append_external_runtime_events_rejects_tool_terminal_missing_owner() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_tool_owner_missing_terminal",
        "thread_tool_owner_missing_terminal",
        "turn_tool_owner_missing_terminal",
    )
    .await;

    core.append_external_runtime_events(
        &session_id,
        Some(&turn_id),
        vec![RuntimeEvent::new(
            "tool.started",
            json!({
                "toolCallId": "tool_owned",
                "toolName": "Shell",
                "messageId": "assistant_owned"
            }),
        )],
    )
    .expect("owned tool start should append");
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
                "tool.failed",
                json!({
                    "toolCallId": "tool_owned",
                    "toolName": "Shell",
                    "failureCategory": "missing_owner"
                }),
            )],
        )
        .expect_err("owned tool terminal without owner must fail closed");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("agent runtime tool lifecycle validation failed"));
            assert!(message.contains("tool_terminal_missing_owner"));
        }
        other => panic!("expected backend tool lifecycle validation error, got {other:?}"),
    }

    assert_runtime_state_unchanged(&core, &session_id, &before, before_event_count);
}

#[tokio::test]
async fn append_external_runtime_events_rejects_unclosed_tool_at_turn_terminal() {
    let core = RuntimeCore::default();
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_terminal_sequence_gate".to_string()),
            thread_id: Some("thread_terminal_sequence_gate".to_string()),
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
                turn_id: Some("turn_terminal_sequence_gate".to_string()),
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

    core.append_external_runtime_events(
        &session.session_id,
        Some(&turn_id),
        vec![RuntimeEvent::new(
            "tool.started",
            json!({
                "toolCallId": "tool_unclosed",
                "toolName": "WebFetch"
            }),
        )],
    )
    .expect("tool start should be accepted");
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
            vec![RuntimeEvent::new("turn.completed", json!({}))],
        )
        .expect_err("terminal turn with active tool must fail closed");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("agent runtime event sequence validation failed"));
            assert!(message.contains("tool_unclosed_at_turn_end"));
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
async fn append_external_runtime_events_closes_action_with_cancel_and_expiry() {
    for (index, terminal_event) in ["action.cancelled", "action.canceled", "action.expired"]
        .iter()
        .enumerate()
    {
        let core = RuntimeCore::default();
        let session_id = format!("sess_action_terminal_{index}");
        let thread_id = format!("thread_action_terminal_{index}");
        let turn_id = format!("turn_action_terminal_{index}");
        let action_id = format!("action_terminal_{index}");
        let session = core
            .start_session(AgentSessionStartParams {
                session_id: Some(session_id.clone()),
                thread_id: Some(thread_id),
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
                turn_id: Some(turn_id.clone()),
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

        core.append_external_runtime_events(
            &session.session_id,
            Some(&turn_id),
            vec![RuntimeEvent::new(
                "action.required",
                json!({ "actionId": action_id }),
            )],
        )
        .expect("action required should be accepted");
        let waiting = core
            .read_session(AgentSessionReadParams {
                session_id: session.session_id.clone(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .expect("read waiting");
        assert_eq!(waiting.turns[0].status, AgentTurnStatus::WaitingAction);
        assert_eq!(waiting.session.status, AgentSessionStatus::WaitingAction);

        core.append_external_runtime_events(
            &session.session_id,
            Some(&turn_id),
            vec![RuntimeEvent::new(
                *terminal_event,
                json!({ "actionId": action_id }),
            )],
        )
        .unwrap_or_else(|error| panic!("{terminal_event} should close action: {error}"));

        let running = core
            .read_session(AgentSessionReadParams {
                session_id: session.session_id.clone(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .expect("read running");
        assert_eq!(running.turns[0].status, AgentTurnStatus::Running);
        assert_eq!(running.session.status, AgentSessionStatus::Running);
    }
}

#[tokio::test]
async fn append_external_runtime_events_rejects_action_cancel_without_request() {
    let core = RuntimeCore::default();
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_action_cancel_gate".to_string()),
            thread_id: Some("thread_action_cancel_gate".to_string()),
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
                turn_id: Some("turn_action_cancel_gate".to_string()),
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
            Some(&output.response.turn.turn_id),
            vec![RuntimeEvent::new(
                "action.canceled",
                json!({ "actionId": "action_without_request" }),
            )],
        )
        .expect_err("action cancel without request must fail closed");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("agent runtime event sequence validation failed"));
            assert!(message.contains("action_resolved_without_request"));
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
