use super::*;
use agent_protocol::{
    AgentInput, CollabAgentOperation, ItemStatus, SessionId, ThreadId, ThreadItemPayload,
    ToolOutput, TurnId,
};

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
fn fork_accepts_image_input_preserved_by_canonical_user_message() {
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
        let item = completed_item(ThreadItemPayload::UserMessage {
            content: vec![AgentInput::text("inspect"), media],
            client_id: Some("client-1".to_string()),
        });
        let history = ForkHistory {
            turn_ids: HashSet::from(["turn-1".to_string()]),
            changes: Some(ThreadHistoryChangeSet {
                sequence: 1,
                changed_items: vec![item],
                ..Default::default()
            }),
        };

        validate_fork_provider_history(&history).expect("canonical image input is forkable");
    }
}
