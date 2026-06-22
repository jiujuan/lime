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
    assert_eq!(appended[0].sequence, 3);
    assert_eq!(appended[0].session_id, "sess_external");
    assert_eq!(appended[0].thread_id.as_deref(), Some("thread_external"));
    assert_eq!(appended[0].turn_id.as_deref(), Some(turn_id.as_str()));
    assert_eq!(appended[0].event_type, "message.delta");
    assert_eq!(appended[0].payload["text"], "delta");
}

#[tokio::test]
async fn append_external_runtime_events_keeps_text_delta_fast_path_and_terminal_guards() {
    let core = RuntimeCore::default();
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_text_delta_fast_path".to_string()),
            thread_id: Some("thread_text_delta_fast_path".to_string()),
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
                turn_id: Some("turn_text_delta_fast_path".to_string()),
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

    let text_events = (0..128)
        .map(|index| {
            RuntimeEvent::new(
                "message.delta",
                json!({ "text": format!("chunk-{index};") }),
            )
        })
        .collect::<Vec<_>>();
    let appended = core
        .append_external_runtime_events(&session.session_id, Some(&turn_id), text_events)
        .expect("append text deltas");
    assert_eq!(appended.len(), 128);
    assert_eq!(appended[0].sequence, 3);
    assert_eq!(appended[127].sequence, 130);

    core.append_external_runtime_events(
        &session.session_id,
        Some(&turn_id),
        vec![RuntimeEvent::new(
            "tool.started",
            json!({
                "toolCallId": "tool_after_text_history",
                "toolName": "WebFetch"
            }),
        )],
    )
    .expect("tool start should remain accepted after text delta history");

    let text_events_after_tool = (0..64)
        .map(|index| {
            RuntimeEvent::new(
                "message.delta",
                json!({ "text": format!("post-tool-chunk-{index};") }),
            )
        })
        .collect::<Vec<_>>();
    core.append_external_runtime_events(
        &session.session_id,
        Some(&turn_id),
        text_events_after_tool,
    )
    .expect("text deltas after tool start should remain on the fast path");

    let error = core
        .append_external_runtime_events(
            &session.session_id,
            Some(&turn_id),
            vec![RuntimeEvent::new("turn.completed", json!({}))],
        )
        .expect_err("terminal turn with active tool must still fail closed");
    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("tool_unclosed_at_turn_end"));
        }
        other => panic!("expected backend sequence validation error, got {other:?}"),
    }
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
