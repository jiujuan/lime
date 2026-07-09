use super::*;

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
                        "toolName": "Shell",
                        "metadata": {
                            "soul_lifecycle": {
                                "profileId": "calm_professional_partner",
                                "packId": "com.lime.soul.calm-professional-partner",
                                "toneVariant": "calm_professional"
                            }
                        }
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
    assert_eq!(
        appended[1].payload["metadata"]["risk_level"].as_str(),
        Some("high")
    );
    assert_eq!(
        appended[1].payload["metadata"]["style_level"].as_str(),
        Some("L4")
    );
    assert_eq!(
        appended[1].payload["metadata"]["soul_lifecycle"]["phase"].as_str(),
        Some("tool_policy_review")
    );
    assert_eq!(
        appended[1].payload["metadata"]["tool_process_facts"]["status"].as_str(),
        Some("action_required")
    );
    assert_eq!(
        appended[1].payload["metadata"]["soul_lifecycle"]["profileId"].as_str(),
        Some("calm_professional_partner")
    );
    assert_eq!(
        appended[1].payload["metadata"]["soul_lifecycle"]["packId"].as_str(),
        Some("com.lime.soul.calm-professional-partner")
    );
    assert_eq!(
        appended[1].payload["metadata"]["tool_process_facts"]["toneVariant"].as_str(),
        Some("calm_professional")
    );
    assert_eq!(
        appended[1].payload["toolProcessFacts"]["riskLevel"].as_str(),
        Some("high")
    );
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
async fn respond_action_infers_tool_id_and_unblocks_pending_tool_result() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_action_respond_infers_tool",
        "thread_action_respond_infers_tool",
        "turn_action_respond_infers_tool",
    )
    .await;

    core.append_external_runtime_events(
        &session_id,
        Some(&turn_id),
        vec![
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "tool_after_respond_approval",
                    "toolName": "Shell"
                }),
            ),
            RuntimeEvent::new(
                "action.required",
                json!({
                    "requestId": "action_after_respond_approval",
                    "actionType": "tool_confirmation",
                    "data": {
                        "toolName": "Shell"
                    }
                }),
            ),
        ],
    )
    .expect("pending tool confirmation should append");

    let responded = core
        .respond_action(
            AgentSessionActionRespondParams {
                session_id: session_id.clone(),
                request_id: "action_after_respond_approval".to_string(),
                action_type: AgentSessionActionType::ToolConfirmation,
                decision: Some(AgentSessionApprovalDecision::AllowOnce),
                confirmed: None,
                response: None,
                user_data: None,
                metadata: None,
                event_name: None,
                action_scope: Some(AgentSessionActionScope {
                    session_id: Some(session_id.clone()),
                    thread_id: Some("thread_action_respond_infers_tool".to_string()),
                    turn_id: Some(turn_id.clone()),
                }),
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("respond action should append resolved event");

    assert_eq!(responded.events.len(), 1);
    assert_eq!(responded.events[0].event_type, "action.resolved");
    assert_eq!(
        responded.events[0].payload["toolCallId"].as_str(),
        Some("tool_after_respond_approval")
    );

    let appended = core
        .append_external_runtime_events(
            &session_id,
            Some(&turn_id),
            vec![RuntimeEvent::new(
                "tool.result",
                json!({
                    "toolCallId": "tool_after_respond_approval",
                    "toolName": "Shell",
                    "output": "approved through action/respond"
                }),
            )],
        )
        .expect("responded approval should unlock tool result");

    assert_eq!(appended.len(), 1);
    assert_eq!(appended[0].event_type, "tool.result");
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
