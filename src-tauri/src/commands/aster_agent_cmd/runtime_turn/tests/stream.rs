use super::*;

#[test]
fn runtime_stream_text_delta_should_bypass_timeline_for_direct_emit() {
    let event = RuntimeAgentEvent::TextDelta {
        text: "首字".to_string(),
    };

    assert!(should_emit_runtime_stream_event_directly(&event));
    assert!(!should_record_runtime_stream_event_on_timeline(&event));
}

#[test]
fn runtime_stream_text_delta_batch_should_bypass_timeline_for_direct_emit() {
    let event = RuntimeAgentEvent::TextDeltaBatch {
        text: "首批文本".to_string(),
        chunks: vec!["首批".to_string(), "文本".to_string()],
        boundary: lime_agent::TextDeltaBatchBoundary::Backlog,
    };

    assert!(should_emit_runtime_stream_event_directly(&event));
    assert!(!should_record_runtime_stream_event_on_timeline(&event));
}

#[test]
fn runtime_stream_item_event_should_remain_timeline_owned() {
    let event = RuntimeAgentEvent::ItemStarted {
        item: build_runtime_turn_test_item(),
    };

    assert!(!should_emit_runtime_stream_event_directly(&event));
    assert!(should_record_runtime_stream_event_on_timeline(&event));
    assert!(timeline_recorder_emits_equivalent_runtime_event(&event));
}

#[test]
fn runtime_stream_warning_should_keep_original_emit_after_timeline_item() {
    let event = RuntimeAgentEvent::Warning {
        code: Some("runtime_warning".to_string()),
        message: "需要提示用户".to_string(),
    };

    assert!(!should_emit_runtime_stream_event_directly(&event));
    assert!(should_record_runtime_stream_event_on_timeline(&event));
    assert!(!timeline_recorder_emits_equivalent_runtime_event(&event));
}

#[test]
fn runtime_stream_status_should_emit_without_timeline_write() {
    let event = RuntimeAgentEvent::RuntimeStatus {
        status: AgentRuntimeStatus {
            phase: "streaming".to_string(),
            title: "正在生成".to_string(),
            detail: "模型已经开始返回内容。".to_string(),
            checkpoints: Vec::new(),
            metadata: None,
        },
    };

    assert!(should_emit_runtime_stream_event_directly(&event));
    assert!(!should_record_runtime_stream_event_on_timeline(&event));
}

#[test]
fn runtime_tool_profile_should_follow_real_tool_start_and_end_once() {
    let stream = AgentRuntimeProfileStream::new("session-test", "thread-test", "turn-test")
        .expect("profile stream");
    let mut state = RuntimeToolProfileState::default();

    let started = project_runtime_tool_profile_events(
        &stream,
        &mut state,
        &RuntimeAgentEvent::ToolStart {
            tool_name: "Read".to_string(),
            tool_id: "tool-1".to_string(),
            arguments: Some("{\"path\":\"README.md\"}".to_string()),
        },
    );
    assert_eq!(started.len(), 1);
    assert_eq!(started[0].event_type, "tool.started");
    assert_eq!(started[0].payload["toolCallId"], "tool-1");
    assert_eq!(started[0].payload["toolName"], "Read");

    let duplicate_started = project_runtime_tool_profile_events(
        &stream,
        &mut state,
        &RuntimeAgentEvent::ItemStarted {
            item: build_runtime_turn_test_tool_item(
                "tool-1",
                AgentThreadItemStatus::InProgress,
                None,
                None,
            ),
        },
    );
    assert!(duplicate_started.is_empty());

    let completed = project_runtime_tool_profile_events(
        &stream,
        &mut state,
        &RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-1".to_string(),
            result: lime_agent::AgentToolResult {
                success: true,
                output: "ok".to_string(),
                error: None,
                images: None,
                metadata: None,
            },
        },
    );
    assert_eq!(completed.len(), 1);
    assert_eq!(completed[0].event_type, "tool.result");
    assert_eq!(completed[0].payload["toolCallId"], "tool-1");
    assert_eq!(completed[0].payload["toolName"], "Read");
    assert_eq!(completed[0].payload["success"], true);

    let duplicate_completed = project_runtime_tool_profile_events(
        &stream,
        &mut state,
        &RuntimeAgentEvent::ItemCompleted {
            item: build_runtime_turn_test_tool_item(
                "tool-1",
                AgentThreadItemStatus::Completed,
                Some(true),
                None,
            ),
        },
    );
    assert!(duplicate_completed.is_empty());
}

#[test]
fn runtime_tool_profile_should_fallback_to_item_tool_call_failure() {
    let stream = AgentRuntimeProfileStream::new("session-test", "thread-test", "turn-test")
        .expect("profile stream");
    let mut state = RuntimeToolProfileState::default();

    let started = project_runtime_tool_profile_events(
        &stream,
        &mut state,
        &RuntimeAgentEvent::ItemStarted {
            item: build_runtime_turn_test_tool_item(
                "tool-2",
                AgentThreadItemStatus::InProgress,
                None,
                None,
            ),
        },
    );
    assert_eq!(started.len(), 1);
    assert_eq!(started[0].event_type, "tool.started");

    let failed = project_runtime_tool_profile_events(
        &stream,
        &mut state,
        &RuntimeAgentEvent::ItemCompleted {
            item: build_runtime_turn_test_tool_item(
                "tool-2",
                AgentThreadItemStatus::Failed,
                Some(false),
                Some("permission denied"),
            ),
        },
    );
    assert_eq!(failed.len(), 1);
    assert_eq!(failed[0].event_type, "tool.failed");
    assert_eq!(failed[0].payload["toolCallId"], "tool-2");
    assert_eq!(failed[0].payload["toolName"], "Read");
    assert_eq!(failed[0].payload["failureCategory"], "tool_error");
    assert_eq!(failed[0].payload["message"], "permission denied");
}
