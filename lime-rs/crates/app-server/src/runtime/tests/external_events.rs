use super::*;

async fn runtime_with_active_turn(
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
) -> (RuntimeCore, String, String) {
    let core = RuntimeCore::default();
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some(session_id.to_string()),
            thread_id: Some(thread_id.to_string()),
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
                turn_id: Some(turn_id.to_string()),
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

    (core, session.session_id, output.response.turn.turn_id)
}

fn assert_runtime_state_unchanged(
    core: &RuntimeCore,
    session_id: &str,
    before: &AgentSessionReadResponse,
    before_event_count: usize,
) {
    let after = core
        .read_session(AgentSessionReadParams {
            session_id: session_id.to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read after");
    let after_event_count = core
        .events_for_session(session_id)
        .expect("events after")
        .len();

    assert_eq!(after_event_count, before_event_count);
    assert_eq!(after.turns[0].status, before.turns[0].status);
    assert_eq!(after.session.status, before.session.status);
}

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

#[tokio::test]
async fn append_external_runtime_events_rejects_action_required_for_inactive_tool() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_action_tool_lifecycle",
        "thread_action_tool_lifecycle",
        "turn_action_tool_lifecycle",
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
                "action.required",
                json!({
                    "actionId": "action_inactive_tool",
                    "toolCallId": "tool_without_start",
                    "actionKind": "approve-tool"
                }),
            )],
        )
        .expect_err("action.required for inactive tool must fail closed");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("agent runtime tool lifecycle validation failed"));
            assert!(message.contains("tool_policy_event_without_active_tool"));
        }
        other => panic!("expected backend tool lifecycle validation error, got {other:?}"),
    }

    assert_runtime_state_unchanged(&core, &session_id, &before, before_event_count);
}

#[tokio::test]
async fn append_external_runtime_events_rejects_tool_output_before_action_resolved() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_action_blocks_tool_output",
        "thread_action_blocks_tool_output",
        "turn_action_blocks_tool_output",
    )
    .await;

    core.append_external_runtime_events(
        &session_id,
        Some(&turn_id),
        vec![
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "tool_pending_approval",
                    "toolName": "Shell"
                }),
            ),
            RuntimeEvent::new(
                "action.required",
                json!({
                    "actionId": "action_pending_approval",
                    "toolCallId": "tool_pending_approval",
                    "actionKind": "approve-tool"
                }),
            ),
        ],
    )
    .expect("pending action should be accepted");
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
                    "toolCallId": "tool_pending_approval",
                    "delta": "should not run before approval"
                }),
            )],
        )
        .expect_err("tool output before action resolution must fail closed");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("agent runtime tool lifecycle validation failed"));
            assert!(message.contains("tool_output_before_action_resolved"));
        }
        other => panic!("expected backend tool lifecycle validation error, got {other:?}"),
    }

    assert_runtime_state_unchanged(&core, &session_id, &before, before_event_count);
}

#[tokio::test]
async fn append_external_runtime_events_keeps_tool_lifecycle_guards_with_sparse_context() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_sparse_validation_context",
        "thread_sparse_validation_context",
        "turn_sparse_validation_context",
    )
    .await;

    let text_events_before_tool = (0..96)
        .map(|index| {
            RuntimeEvent::new(
                "message.delta",
                json!({ "text": format!("before-tool-{index};") }),
            )
        })
        .collect::<Vec<_>>();
    core.append_external_runtime_events(&session_id, Some(&turn_id), text_events_before_tool)
        .expect("text deltas before tool should append");

    core.append_external_runtime_events(
        &session_id,
        Some(&turn_id),
        vec![
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "tool_pending_approval_sparse_context",
                    "toolName": "Shell"
                }),
            ),
            RuntimeEvent::new(
                "action.required",
                json!({
                    "actionId": "action_pending_approval_sparse_context",
                    "toolCallId": "tool_pending_approval_sparse_context",
                    "actionKind": "approve-tool"
                }),
            ),
        ],
    )
    .expect("tool and pending action should append after text history");

    let text_events_after_action = (0..96)
        .map(|index| {
            RuntimeEvent::new(
                "message.delta",
                json!({ "text": format!("after-action-{index};") }),
            )
        })
        .collect::<Vec<_>>();
    core.append_external_runtime_events(&session_id, Some(&turn_id), text_events_after_action)
        .expect("text deltas after pending action should append");

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
                    "toolCallId": "tool_pending_approval_sparse_context",
                    "delta": "should still be blocked before approval"
                }),
            )],
        )
        .expect_err("sparse validation context must keep pending action guard");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("agent runtime tool lifecycle validation failed"));
            assert!(message.contains("tool_output_before_action_resolved"));
        }
        other => panic!("expected backend tool lifecycle validation error, got {other:?}"),
    }

    assert_runtime_state_unchanged(&core, &session_id, &before, before_event_count);
}

#[tokio::test]
async fn append_external_runtime_events_allows_tool_result_after_action_resolved() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_action_allows_tool_result",
        "thread_action_allows_tool_result",
        "turn_action_allows_tool_result",
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
                        "toolCallId": "tool_after_approval",
                        "toolName": "Shell"
                    }),
                ),
                RuntimeEvent::new(
                    "action.required",
                    json!({
                        "actionId": "action_after_approval",
                        "toolCallId": "tool_after_approval",
                        "actionKind": "approve-tool"
                    }),
                ),
                RuntimeEvent::new(
                    "action.resolved",
                    json!({
                        "actionId": "action_after_approval",
                        "toolCallId": "tool_after_approval",
                        "decision": "approve"
                    }),
                ),
                RuntimeEvent::new(
                    "tool.result",
                    json!({
                        "toolCallId": "tool_after_approval",
                        "toolName": "Shell",
                        "output": "approved"
                    }),
                ),
            ],
        )
        .expect("approved tool result should append");

    assert_eq!(appended.len(), 4);
    assert_eq!(appended[3].event_type, "tool.result");
}

#[tokio::test]
async fn append_external_runtime_events_infers_action_resolved_tool_from_pending_action() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_action_infers_tool",
        "thread_action_infers_tool",
        "turn_action_infers_tool",
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
                        "toolCallId": "tool_after_inferred_approval",
                        "toolName": "Shell"
                    }),
                ),
                RuntimeEvent::new(
                    "action.required",
                    json!({
                        "requestId": "action_after_inferred_approval",
                        "actionType": "tool_confirmation",
                        "data": {
                            "tool_name": "Shell"
                        }
                    }),
                ),
                RuntimeEvent::new(
                    "action.resolved",
                    json!({
                        "requestId": "action_after_inferred_approval",
                        "actionType": "tool_confirmation",
                        "decision": "approve"
                    }),
                ),
                RuntimeEvent::new(
                    "tool.result",
                    json!({
                        "toolCallId": "tool_after_inferred_approval",
                        "toolName": "Shell",
                        "output": "approved"
                    }),
                ),
            ],
        )
        .expect("resolved action should inherit tool id and unlock tool result");

    assert_eq!(appended.len(), 4);
    assert_eq!(appended[1].event_type, "action.required");
    assert_eq!(
        appended[1].payload["toolCallId"].as_str(),
        Some("tool_after_inferred_approval")
    );
    assert_eq!(appended[2].event_type, "action.resolved");
    assert_eq!(
        appended[2].payload["toolCallId"].as_str(),
        Some("tool_after_inferred_approval")
    );
    assert_eq!(appended[3].event_type, "tool.result");
}

#[tokio::test]
async fn append_external_runtime_events_rejects_tool_result_after_action_denied() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_action_denies_tool_result",
        "thread_action_denies_tool_result",
        "turn_action_denies_tool_result",
    )
    .await;

    core.append_external_runtime_events(
        &session_id,
        Some(&turn_id),
        vec![
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "tool_after_denial",
                    "toolName": "Shell"
                }),
            ),
            RuntimeEvent::new(
                "action.required",
                json!({
                    "actionId": "action_after_denial",
                    "toolCallId": "tool_after_denial",
                    "actionKind": "approve-tool"
                }),
            ),
            RuntimeEvent::new(
                "action.canceled",
                json!({
                    "actionId": "action_after_denial",
                    "toolCallId": "tool_after_denial"
                }),
            ),
        ],
    )
    .expect("denied action lifecycle should be accepted");
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
                    "toolCallId": "tool_after_denial",
                    "toolName": "Shell",
                    "output": "should not run"
                }),
            )],
        )
        .expect_err("tool result after action denial must fail closed");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("agent runtime tool lifecycle validation failed"));
            assert!(message.contains("tool_result_after_action_denied"));
        }
        other => panic!("expected backend tool lifecycle validation error, got {other:?}"),
    }

    assert_runtime_state_unchanged(&core, &session_id, &before, before_event_count);

    let appended = core
        .append_external_runtime_events(
            &session_id,
            Some(&turn_id),
            vec![RuntimeEvent::new(
                "tool.failed",
                json!({
                    "toolCallId": "tool_after_denial",
                    "toolName": "Shell",
                    "failureCategory": "approval_denied"
                }),
            )],
        )
        .expect("denied tool can still close as failed");

    assert_eq!(appended.len(), 1);
    assert_eq!(appended[0].event_type, "tool.failed");
}

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
