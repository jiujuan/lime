use super::*;
use agent_protocol::{
    AgentInput, CollabAgentOperation, ItemStatus, SessionId, ThreadId, ThreadItemPayload,
    ToolOutput, TurnId,
};
use serde_json::json;

fn completed_item(payload: ThreadItemPayload) -> ThreadItem {
    let mut item = ThreadItem::new(
        SessionId::new("session-1"),
        ThreadId::new("thread-1"),
        TurnId::new("turn-1"),
        1,
        1,
        payload,
    );
    item.status = ItemStatus::Completed;
    item
}

#[test]
fn fork_rejects_canonical_history_that_cannot_be_lowered_without_loss() {
    let cases = [
        (
            completed_item(ThreadItemPayload::ContextCompaction {
                summary: Some("summary without replacement history".to_string()),
                window_id: Some("window-1".to_string()),
            }),
            "compacted provider history",
        ),
        (
            completed_item(ThreadItemPayload::CollabAgentToolCall {
                call_id: "collab-1".to_string(),
                operation: CollabAgentOperation::Spawn,
                target_thread_id: Some(ThreadId::new("thread-child")),
                message: Some("spawn".to_string()),
                output: Some(ToolOutput {
                    text: Some("spawned".to_string()),
                    ..ToolOutput::default()
                }),
            }),
            "collab tool arguments",
        ),
        (
            completed_item(ThreadItemPayload::Media {
                uri: "sidecar://media/image".to_string(),
                mime_type: "image/png".to_string(),
                preview: None,
            }),
            "media content",
        ),
        (
            completed_item(ThreadItemPayload::Tool {
                call_id: "tool-1".to_string(),
                name: "read_file".to_string(),
                arguments: Vec::new(),
                output: None,
            }),
            "without a canonical result",
        ),
    ];

    for (item, expected) in cases {
        let error = validate_fork_canonical_item(&item).expect_err("fork must fail closed");
        let RuntimeCoreError::Backend(message) = error else {
            panic!("unexpected fork validation error: {error}");
        };
        assert!(message.contains(expected), "unexpected error: {message}");
    }
}

#[test]
fn fork_rejects_source_image_input_missing_from_canonical_user_message() {
    for media in [
        AgentInput::Image {
            uri: "https://example.invalid/image.png".to_string(),
            detail: None,
        },
        AgentInput::LocalImage {
            path: "/tmp/image.png".to_string(),
            detail: None,
        },
    ] {
        let session = AgentSession {
            session_id: "session-1".to_string(),
            thread_id: "thread-1".to_string(),
            app_id: "agent-chat".to_string(),
            workspace_id: None,
            business_object_ref: None,
            status: AgentSessionStatus::Idle,
            created_at: "2026-07-21T00:00:00Z".to_string(),
            updated_at: "2026-07-21T00:00:00Z".to_string(),
        };
        let source = StoredSession {
            session,
            turns: Vec::new(),
            turn_inputs: Default::default(),
            turn_runtime_options: Default::default(),
            events: vec![AgentEvent {
                event_id: "event-input".to_string(),
                sequence: 1,
                session_id: "session-1".to_string(),
                thread_id: Some("thread-1".to_string()),
                turn_id: Some("turn-1".to_string()),
                event_type: super::super::turn_input_events::TURN_INPUT_EVENT_TYPE.to_string(),
                timestamp: "2026-07-21T00:00:00Z".to_string(),
                payload: json!({"input": [AgentInput::text("inspect"), media]}),
            }],
            output_blobs: Default::default(),
        };
        let history = ForkHistory {
            turn_ids: HashSet::from(["turn-1".to_string()]),
            changes: None,
        };

        let error = validate_fork_provider_history(&source, &history)
            .expect_err("source image history must fail closed");
        assert!(matches!(
            error,
            RuntimeCoreError::Backend(message)
                if message.contains("cannot preserve source image input")
        ));
    }
}
