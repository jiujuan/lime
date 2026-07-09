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
async fn append_external_runtime_events_synthesizes_tool_start_for_first_llm_tool_delta() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_llm_tool_delta_start",
        "thread_llm_tool_delta_start",
        "turn_llm_tool_delta_start",
    )
    .await;

    let appended = core
        .append_external_runtime_events(
            &session_id,
            Some(&turn_id),
            vec![RuntimeEvent::new(
                "tool.args.delta",
                json!({
                    "toolCallId": "call_llm_first_delta",
                    "toolName": "read_file",
                    "delta": "{\"path\":\"README.md\"",
                    "rawArgs": "{\"path\":\"README.md\"",
                    "source": "llm_protocol",
                    "backend": "llm_protocol",
                    "runtimeEvent": {
                        "type": "tool_call_delta",
                        "call_id": "call_llm_first_delta",
                        "name": "read_file",
                        "arguments_delta": "{\"path\":\"README.md\""
                    }
                }),
            )],
        )
        .expect("first LLM tool delta should synthesize tool.started");

    assert_eq!(appended.len(), 2);
    assert_eq!(appended[0].event_type, "tool.started");
    assert_eq!(
        appended[0].payload["toolCallId"].as_str(),
        Some("call_llm_first_delta")
    );
    assert_eq!(appended[0].payload["toolName"].as_str(), Some("read_file"));
    assert_eq!(
        appended[0].payload["source"].as_str(),
        Some("llm_protocol_tool_delta")
    );
    assert_eq!(appended[1].event_type, "tool.args.delta");
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
async fn append_external_runtime_events_enriches_tool_process_soul_metadata() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_tool_process_soul_metadata",
        "thread_tool_process_soul_metadata",
        "turn_tool_process_soul_metadata",
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
                        "toolCallId": "tool_external_fetch",
                        "toolName": "WebFetch",
                        "arguments": { "url": "https://example.com/a" },
                        "metadata": {
                            "soul_lifecycle": {
                                "profileId": "cool_confident_operator",
                                "packId": "com.lime.soul.cool-confident-operator",
                                "toneVariant": "cool_confident"
                            }
                        }
                    }),
                ),
                RuntimeEvent::new(
                    "tool.progress",
                    json!({
                        "toolCallId": "tool_external_fetch",
                        "message": "reading response"
                    }),
                ),
                RuntimeEvent::new(
                    "tool.output.delta",
                    json!({
                        "toolCallId": "tool_external_fetch",
                        "delta": "partial output"
                    }),
                ),
                RuntimeEvent::new(
                    "tool.result",
                    json!({
                        "toolCallId": "tool_external_fetch",
                        "result": {
                            "success": true,
                            "output": "ok",
                            "metadata": { "source": "external_fixture" }
                        }
                    }),
                ),
            ],
        )
        .expect("external tool lifecycle should append");

    assert_eq!(appended.len(), 4);
    assert_eq!(
        appended[0].payload["metadata"]["tool_process_summary"]["pre"]["key"],
        "toolCall.processSummary.generic.fetchFirstWithSubject"
    );
    assert_eq!(
        appended[0].payload["metadata"]["tool_process_facts"]["phase"],
        "before_tool"
    );
    assert_eq!(
        appended[1].payload["metadata"]["soul_lifecycle"]["phase"],
        "tool_progress"
    );
    assert_eq!(
        appended[1].payload["metadata"]["soul_lifecycle"]["profileId"].as_str(),
        Some("cool_confident_operator")
    );
    assert_eq!(
        appended[1].payload["metadata"]["soul_lifecycle"]["packId"].as_str(),
        Some("com.lime.soul.cool-confident-operator")
    );
    assert_eq!(
        appended[1].payload["metadata"]["soul_lifecycle"]["toneVariant"].as_str(),
        Some("cool_confident")
    );
    assert_eq!(
        appended[1].payload["metadata"]["tool_process_facts"]["status"],
        "progress"
    );
    assert_eq!(
        appended[2].payload["metadata"]["tool_process_facts"]["status"],
        "output_delta"
    );
    assert_eq!(
        appended[3].payload["result"]["metadata"]["tool_process_summary"]["completed"]["key"],
        "toolCall.processSummary.generic.fetchedWithSubject"
    );
    assert_eq!(
        appended[3].payload["result"]["metadata"]["tool_process_facts"]["subject"],
        "https://example.com/a"
    );
    assert_eq!(
        appended[3].payload["result"]["metadata"]["tool_process_facts"]["profileId"].as_str(),
        Some("cool_confident_operator")
    );
    assert_eq!(
        appended[3].payload["result"]["metadata"]["soul_phase"],
        "after_tool_success"
    );
}

#[tokio::test]
async fn append_external_runtime_events_rejects_tool_progress_without_started_tool() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_tool_progress_lifecycle",
        "thread_tool_progress_lifecycle",
        "turn_tool_progress_lifecycle",
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
                "tool.progress",
                json!({
                    "toolCallId": "tool_without_start",
                    "message": "orphan progress"
                }),
            )],
        )
        .expect_err("tool.progress without tool.started must fail closed");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("agent runtime tool lifecycle validation failed"));
            assert!(message.contains("tool_progress_without_start"));
        }
        other => panic!("expected backend tool lifecycle validation error, got {other:?}"),
    }

    assert_runtime_state_unchanged(&core, &session_id, &before, before_event_count);
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
async fn append_external_runtime_events_rejects_tool_result_after_sandbox_blocked() {
    let (core, session_id, turn_id) = runtime_with_active_turn(
        "sess_sandbox_blocks_result",
        "thread_sandbox_blocks_result",
        "turn_sandbox_blocks_result",
    )
    .await;

    core.append_external_runtime_events(
        &session_id,
        Some(&turn_id),
        vec![
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "tool_sandbox_blocked",
                    "toolName": "Shell"
                }),
            ),
            RuntimeEvent::new(
                "sandbox.blocked",
                json!({
                    "toolCallId": "tool_sandbox_blocked",
                    "reasonCode": "network_disabled"
                }),
            ),
        ],
    )
    .expect("active tool sandbox block should append");
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
                    "toolCallId": "tool_sandbox_blocked",
                    "toolName": "Shell",
                    "output": "should not be stored"
                }),
            )],
        )
        .expect_err("tool.result after sandbox.blocked must fail closed");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("agent runtime tool lifecycle validation failed"));
            assert!(message.contains("tool_result_after_sandbox_blocked"));
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
                    "toolCallId": "tool_sandbox_blocked",
                    "toolName": "Shell",
                    "failureCategory": "sandbox_blocked"
                }),
            )],
        )
        .expect("sandbox blocked tool can still close as failed");

    assert_eq!(appended.len(), 1);
    assert_eq!(appended[0].event_type, "tool.failed");
}
