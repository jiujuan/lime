use super::*;

#[tokio::test]
async fn append_external_runtime_events_keeps_sequence_and_turn_scope() {
    let core = RuntimeCore::default();
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_external".to_string()),
            thread_id: Some("thread_external".to_string()),
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
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn");
    let turn_id = output.response.turn.turn_id;

    let appended = core
        .append_external_runtime_events(
            &session.session_id,
            Some(&turn_id),
            vec![RuntimeEvent::new(
                "message.delta",
                json!({ "text": "delta" }),
            )],
        )
        .expect("append");

    assert_eq!(appended.len(), 1);
    assert_eq!(appended[0].sequence, 2);
    assert_eq!(appended[0].session_id, "sess_external");
    assert_eq!(appended[0].thread_id.as_deref(), Some("thread_external"));
    assert_eq!(appended[0].turn_id.as_deref(), Some(turn_id.as_str()));
    assert_eq!(appended[0].event_type, "message.delta");
    assert_eq!(appended[0].payload["text"], "delta");
}

#[tokio::test]
async fn append_external_runtime_events_rejects_invalid_state_delta_before_storage() {
    let core = RuntimeCore::default();
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_state_delta_schema".to_string()),
            thread_id: Some("thread_state_delta_schema".to_string()),
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
                turn_id: Some("turn_state_delta_schema".to_string()),
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
    let before_event_count = {
        let state = core
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        state
            .sessions
            .get(&session.session_id)
            .expect("stored session before")
            .events
            .len()
    };

    let error = core
        .append_external_runtime_events(
            &session.session_id,
            Some(&turn_id),
            vec![RuntimeEvent::new(
                "state.delta",
                json!({
                    "target": "projection",
                    "patch": [{ "op": "remove" }]
                }),
            )],
        )
        .expect_err("invalid state.delta must fail closed");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("agent runtime state delta schema validation failed"));
        }
        other => panic!("expected backend validation error, got {other:?}"),
    }

    let after_event_count = {
        let state = core
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        state
            .sessions
            .get(&session.session_id)
            .expect("stored session after")
            .events
            .len()
    };
    assert_eq!(after_event_count, before_event_count);
}

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
