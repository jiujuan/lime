use super::materializer::{materialize_events, materialize_runtime_events};
use agent_protocol::{
    ApprovalAction, ApprovalDecision, ApprovalScope, CollabAgentOperation, ItemKind, ItemStatus,
    ThreadItemPayload, TurnApprovalState, TurnQueueState, TurnStatus,
};
use app_server_protocol::AgentEvent;
use serde_json::json;

mod canonical_lifecycle;

fn event(
    id: &str,
    sequence: u64,
    event_type: &str,
    turn_id: &str,
    payload: serde_json::Value,
) -> AgentEvent {
    AgentEvent {
        event_id: id.to_string(),
        sequence,
        session_id: "session-1".to_string(),
        thread_id: Some("thread-1".to_string()),
        turn_id: Some(turn_id.to_string()),
        event_type: event_type.to_string(),
        timestamp: format!("2026-07-12T00:00:{:02}Z", sequence.min(59)),
        payload,
    }
}

fn canonical_tool_item(item_id: &str, status: &str, ordinal: u64) -> serde_json::Value {
    json!({
        "sessionId": "nested-session",
        "threadId": "nested-thread",
        "turnId": "nested-turn",
        "itemId": item_id,
        "sequence": 999,
        "ordinal": ordinal,
        "createdAtMs": 111,
        "updatedAtMs": 222,
        "completedAtMs": 333,
        "kind": "tool",
        "status": status,
        "payload": {
            "type": "tool",
            "call_id": format!("call-{item_id}"),
            "name": "rg",
            "arguments": [],
            "output": null
        },
        "metadata": {"source": "nested-canonical"}
    })
}

#[test]
fn coalesces_message_delta_into_one_stable_typed_item() {
    let changes = materialize_events(
        &[
            event(
                "event-1",
                1,
                "message.delta",
                "turn-1",
                json!({"itemId": "msg-1", "role": "assistant", "text": "hel"}),
            ),
            event(
                "event-2",
                2,
                "message.delta",
                "turn-1",
                json!({"itemId": "msg-1", "role": "assistant", "text": "hello"}),
            ),
        ],
        "session-1",
        "thread-1",
    )
    .expect("materialize");

    assert_eq!(changes.changed_items.len(), 1);
    let item = &changes.changed_items[0];
    assert_eq!(item.item_id.as_str(), "item_msg-1");
    assert_eq!(item.sequence, 2);
    assert_eq!(item.status, ItemStatus::InProgress);
    assert_eq!(
        item.payload,
        ThreadItemPayload::AgentMessage {
            text: "hello".to_string(),
            phase: None,
        }
    );
    assert_eq!(changes.changed_turns.len(), 1);
    assert_eq!(changes.changed_turns[0].status, TurnStatus::InProgress);
}

#[test]
fn queue_events_materialize_canonical_turn_state_and_removal() {
    let queue_event = |id: &str, sequence: u64, event_type: &str| AgentEvent {
        event_id: id.to_string(),
        sequence,
        session_id: "session-1".to_string(),
        thread_id: Some("thread-1".to_string()),
        turn_id: Some("wrong-outer-turn".to_string()),
        event_type: event_type.to_string(),
        timestamp: format!("2026-07-12T00:00:{sequence:02}Z"),
        payload: json!({"queuedTurnId": "turn-queued", "position": 2}),
    };

    let added = materialize_events(
        &[queue_event("queue-added", 1, "queue.added")],
        "session-1",
        "thread-1",
    )
    .expect("materialize queue added");
    assert_eq!(added.changed_turns.len(), 1);
    assert_eq!(added.changed_turns[0].turn_id.as_str(), "turn-queued");
    assert_eq!(added.changed_turns[0].status, TurnStatus::InProgress);
    assert_eq!(
        added.changed_turns[0].queue,
        TurnQueueState::Queued { position: Some(2) }
    );

    let promoted = materialize_events(
        &[queue_event("queue-promoted", 2, "queue.promoted")],
        "session-1",
        "thread-1",
    )
    .expect("materialize queue promoted");
    assert!(promoted.changed_turns.is_empty());
    assert!(promoted.removed_turn_ids.is_empty());

    let started = materialize_events(
        &[event(
            "turn-started",
            3,
            "turn.started",
            "turn-queued",
            json!({}),
        )],
        "session-1",
        "thread-1",
    )
    .expect("materialize turn started");
    assert_eq!(started.changed_turns[0].status, TurnStatus::InProgress);
    assert_eq!(started.changed_turns[0].queue, TurnQueueState::Running);

    let removed = materialize_events(
        &[queue_event("queue-removed", 4, "queue.removed")],
        "session-1",
        "thread-1",
    )
    .expect("materialize queue removed");
    assert!(removed.changed_turns.is_empty());
    assert_eq!(removed.removed_turn_ids.len(), 1);
    assert_eq!(removed.removed_turn_ids[0].as_str(), "turn-queued");
}

#[test]
fn coalesces_message_delta_batch_into_the_same_typed_item() {
    let changes = materialize_events(
        &[
            event(
                "event-1",
                1,
                "message.delta",
                "turn-1",
                json!({
                    "itemId": "msg-1",
                    "role": "assistant",
                    "text": "hello ",
                    "phase": "commentary"
                }),
            ),
            event(
                "event-2",
                2,
                "message.delta_batch",
                "turn-1",
                json!({
                    "itemId": "msg-1",
                    "role": "assistant",
                    "deltas": [{"text": "world"}, {"text": "!"}],
                    "phase": "commentary"
                }),
            ),
        ],
        "session-1",
        "thread-1",
    )
    .expect("materialize");

    assert_eq!(changes.changed_items.len(), 1);
    assert_eq!(
        changes.changed_items[0].payload,
        ThreadItemPayload::AgentMessage {
            text: "hello world!".to_string(),
            phase: Some("commentary".to_string()),
        }
    );
}

#[test]
fn maps_core_families_to_typed_payloads() {
    let changes = materialize_events(
        &[
            event(
                "user",
                1,
                "message.created",
                "turn-1",
                json!({"text": "hi"}),
            ),
            event(
                "reasoning",
                2,
                "reasoning.summary",
                "turn-1",
                json!({"summary": ["why"]}),
            ),
            event(
                "tool",
                3,
                "item.started",
                "turn-1",
                json!({"item": canonical_tool_item("core-tool", "inProgress", 3)}),
            ),
            event(
                "approval",
                4,
                "action.required",
                "turn-1",
                json!({"actionKind": "tool", "description": "run"}),
            ),
            event(
                "subagent",
                5,
                "subagent.activity",
                "turn-1",
                json!({"childThreadId": "child", "activity": "spawned"}),
            ),
            event(
                "compact",
                6,
                "context.compaction.completed",
                "turn-1",
                json!({"summary": "trimmed"}),
            ),
        ],
        "session-1",
        "thread-1",
    )
    .expect("materialize");

    assert_eq!(changes.changed_items.len(), 6);
    assert!(changes
        .changed_items
        .iter()
        .any(|item| matches!(item.payload, ThreadItemPayload::UserMessage { .. })));
    assert!(changes
        .changed_items
        .iter()
        .any(|item| matches!(item.payload, ThreadItemPayload::Reasoning { .. })));
    assert!(changes
        .changed_items
        .iter()
        .any(|item| matches!(item.payload, ThreadItemPayload::Tool { .. })));
    assert!(changes.changed_items.iter().any(|item| matches!(
        item.payload,
        ThreadItemPayload::Approval { decision: None, .. }
    )));
    assert!(changes
        .changed_items
        .iter()
        .any(|item| matches!(item.payload, ThreadItemPayload::SubAgent { .. })));
    assert!(changes
        .changed_items
        .iter()
        .any(|item| matches!(item.payload, ThreadItemPayload::ContextCompaction { .. })));
}

#[test]
fn canonical_display_payloads_merge_create_update_and_terminal_fields() {
    let changes = materialize_events(
        &[
            event(
                "tool-start",
                1,
                "item.started",
                "turn-1",
                json!({"item": {
                    "id": "tool-1",
                    "type": "tool_call",
                    "callId": "call-1",
                    "toolName": "rg",
                    "arguments": {"pattern": "needle"}
                }}),
            ),
            event(
                "tool-end",
                2,
                "item.completed",
                "turn-1",
                json!({"item": {
                    "id": "tool-1",
                    "type": "tool_call",
                    "callId": "call-1",
                    "toolName": "rg",
                    "output": "found",
                    "structuredContent": {"matches": 1},
                    "durationMs": 12,
                    "truncated": true,
                    "outputRef": "sidecar://tool-1"
                }}),
            ),
            event(
                "mcp-start",
                3,
                "item.started",
                "turn-1",
                json!({"item": {
                    "id": "mcp-1",
                    "type": "mcp_tool_call",
                    "callId": "call-mcp",
                    "serverName": "docs",
                    "toolName": "search",
                    "arguments": {"query": "typed items"}
                }}),
            ),
            event(
                "mcp-end",
                4,
                "item.completed",
                "turn-1",
                json!({"item": {
                    "id": "mcp-1",
                    "type": "mcp_tool_call",
                    "callId": "call-mcp",
                    "serverName": "docs",
                    "toolName": "search",
                    "output": "done"
                }}),
            ),
            event(
                "collab-start",
                5,
                "item.started",
                "turn-1",
                json!({"item": {
                    "id": "collab-1",
                    "type": "collab_agent_tool_call",
                    "callId": "call-collab",
                    "operation": "send_message",
                    "targetThreadId": "thread-child",
                    "message": "continue"
                }}),
            ),
            event(
                "collab-end",
                6,
                "item.completed",
                "turn-1",
                json!({"item": {
                    "id": "collab-1",
                    "type": "collab_agent_tool_call",
                    "callId": "call-collab",
                    "operation": "send_message",
                    "targetThreadId": "thread-child",
                    "output": "delivered"
                }}),
            ),
            event(
                "approval-start",
                7,
                "approval.required",
                "turn-1",
                json!({
                    "actionId": "approval-1",
                    "requestId": "request-1",
                    "actionKind": "tool",
                    "description": "run command",
                    "scope": {
                        "sessionId": "session-1",
                        "threadId": "thread-1",
                        "turnId": "turn-1"
                    },
                    "availableDecisions": [
                        "allow_once",
                        "allow_for_session",
                        "decline",
                        "cancel"
                    ],
                    "expiresAtMs": 99
                }),
            ),
            event(
                "approval-end",
                8,
                "approval.resolved",
                "turn-1",
                json!({
                    "actionId": "approval-1",
                    "requestId": "request-1",
                    "actionKind": "tool",
                    "description": "run command",
                    "decision": "allow_for_session",
                    "decisionScope": "session",
                    "reasonCode": "user_approved"
                }),
            ),
        ],
        "session-1",
        "thread-1",
    )
    .expect("materialize");

    assert_eq!(changes.changed_items.len(), 4);
    let tool = changes
        .changed_items
        .iter()
        .find(|item| item.item_id.as_str() == "item_tool-1")
        .expect("tool item");
    assert_eq!(tool.status, ItemStatus::Completed);
    let ThreadItemPayload::Tool { output, .. } = &tool.payload else {
        panic!("tool payload");
    };
    let output = output.as_ref().expect("tool output");
    assert_eq!(output.text.as_deref(), Some("found"));
    assert_eq!(output.structured_content, Some(json!({"matches": 1})));
    assert_eq!(output.duration_ms, Some(12));
    assert!(output.truncated);
    assert_eq!(output.output_ref.as_deref(), Some("sidecar://tool-1"));

    assert!(changes.changed_items.iter().any(|item| matches!(
        &item.payload,
        ThreadItemPayload::McpToolCall {
            server_name,
            tool_name,
            ..
        } if server_name == "docs" && tool_name == "search"
    )));
    assert!(changes.changed_items.iter().any(|item| matches!(
        &item.payload,
        ThreadItemPayload::CollabAgentToolCall {
            operation: CollabAgentOperation::SendMessage,
            target_thread_id: Some(target),
            ..
        } if target.as_str() == "thread-child"
    )));

    let approval = changes
        .changed_items
        .iter()
        .find(|item| item.item_id.as_str() == "item_request-1")
        .expect("approval item");
    assert_eq!(approval.status, ItemStatus::Completed);
    assert!(matches!(
        &approval.payload,
        ThreadItemPayload::Approval {
            request_id,
            scope: ApprovalScope::Session,
            available_decisions,
            decision: Some(ApprovalDecision::ApprovedForSession),
            requested_at_ms: Some(_),
            resolved_at_ms: Some(_),
            reason_code: Some(reason),
            ..
        } if request_id == "request-1"
            && available_decisions == &vec![
                ApprovalDecision::Approved,
                ApprovalDecision::ApprovedForSession,
                ApprovalDecision::Denied,
                ApprovalDecision::Abort,
            ]
            && reason == "user_approved"
    ));
}

#[test]
fn tool_and_approval_with_shared_tool_call_id_remain_distinct_items() {
    let mut started = canonical_tool_item("tool-1", "inProgress", 1);
    started["payload"]["call_id"] = json!("tool-1");
    started["payload"]["name"] = json!("browser_control");
    let mut completed = canonical_tool_item("tool-1", "completed", 1);
    completed["payload"]["call_id"] = json!("tool-1");
    completed["payload"]["name"] = json!("browser_control");
    completed["payload"]["output"] = json!({"text": "opened"});

    let changes = materialize_events(
        &[
            event(
                "tool-start",
                1,
                "item.started",
                "turn-1",
                json!({"item": started}),
            ),
            event(
                "approval-start",
                2,
                "action.required",
                "turn-1",
                json!({
                    "toolCallId": "tool-1",
                    "requestId": "approval-1",
                    "actionId": "approval-1",
                    "actionType": "tool_confirmation",
                    "description": "allow browser control",
                    "scope": {
                        "sessionId": "session-1",
                        "threadId": "thread-1",
                        "turnId": "turn-1"
                    },
                    "availableDecisions": [
                        "allow_once",
                        "allow_for_session",
                        "decline",
                        "cancel"
                    ]
                }),
            ),
            event(
                "approval-end",
                3,
                "action.resolved",
                "turn-1",
                json!({
                    "toolCallId": "tool-1",
                    "requestId": "approval-1",
                    "actionId": "approval-1",
                    "actionType": "tool_confirmation",
                    "decision": "allow_for_session",
                    "decisionScope": "session"
                }),
            ),
            event(
                "tool-end",
                4,
                "item.completed",
                "turn-1",
                json!({"item": completed}),
            ),
        ],
        "session-1",
        "thread-1",
    )
    .expect("materialize distinct tool and approval items");

    assert_eq!(changes.changed_items.len(), 2);
    let tool = changes
        .changed_items
        .iter()
        .find(|item| item.item_id.as_str() == "tool-1")
        .expect("tool item");
    assert_eq!(tool.status, ItemStatus::Completed);
    assert!(matches!(tool.payload, ThreadItemPayload::Tool { .. }));

    let approval = changes
        .changed_items
        .iter()
        .find(|item| item.item_id.as_str() == "item_approval-1")
        .expect("approval item");
    assert_eq!(approval.status, ItemStatus::Completed);
    assert!(matches!(
        &approval.payload,
        ThreadItemPayload::Approval {
            request_id,
            scope: ApprovalScope::Session,
            decision: Some(ApprovalDecision::ApprovedForSession),
            ..
        } if request_id == "approval-1"
    ));
}
