use crate::processor::event_notification_jsonrpc;
use app_server_protocol::AgentEvent;
use app_server_protocol::JsonRpcMessage;
use serde_json::json;

#[test]
fn event_notification_jsonrpc_includes_typed_runtime_event_projection() {
    let message = event_notification_jsonrpc(AgentEvent {
        event_id: "evt_1".to_string(),
        sequence: 1,
        session_id: "sess_1".to_string(),
        thread_id: Some("thread_1".to_string()),
        turn_id: Some("turn_1".to_string()),
        event_type: "message.delta".to_string(),
        timestamp: "2026-07-05T00:00:00Z".to_string(),
        payload: json!({
            "itemId": "agent-message-final",
            "text": "typed delta",
            "phase": "final_answer",
        }),
    })
    .expect("notification");

    let JsonRpcMessage::Notification(notification) = message else {
        panic!("expected notification");
    };
    assert_eq!(notification.method, "agentSession/event");
    let params = notification.params.expect("params");
    assert_eq!(
        params["typedEvent"],
        json!({
            "method": "item/agentMessage/delta",
            "params": {
                "eventId": "evt_1",
                "sequence": 1,
                "sessionId": "sess_1",
                "threadId": "thread_1",
                "turnId": "turn_1",
                "timestamp": "2026-07-05T00:00:00Z",
                "itemId": "agent-message-final",
                "delta": "typed delta",
                "phase": "final_answer"
            }
        })
    );
}

#[test]
fn event_notification_jsonrpc_includes_typed_turn_failed_projection() {
    let message = event_notification_jsonrpc(AgentEvent {
        event_id: "evt_failed".to_string(),
        sequence: 2,
        session_id: "sess_1".to_string(),
        thread_id: Some("thread_1".to_string()),
        turn_id: Some("turn_1".to_string()),
        event_type: "turn.failed".to_string(),
        timestamp: "2026-07-05T00:00:01Z".to_string(),
        payload: json!({
            "message": "provider stream timed out"
        }),
    })
    .expect("notification");

    let JsonRpcMessage::Notification(notification) = message else {
        panic!("expected notification");
    };
    let params = notification.params.expect("params");
    assert_eq!(
        params["typedEvent"],
        json!({
            "method": "turn/failed",
            "params": {
                "eventId": "evt_failed",
                "sequence": 2,
                "sessionId": "sess_1",
                "threadId": "thread_1",
                "turnId": "turn_1",
                "timestamp": "2026-07-05T00:00:01Z",
                "status": "failed"
            }
        })
    );
}

#[test]
fn event_notification_jsonrpc_includes_canonical_item_projection() {
    let message = event_notification_jsonrpc(AgentEvent {
        event_id: "evt_item".to_string(),
        sequence: 3,
        session_id: "sess_1".to_string(),
        thread_id: Some("thread_1".to_string()),
        turn_id: Some("turn_1".to_string()),
        event_type: "message.delta".to_string(),
        timestamp: "2026-07-05T00:00:02Z".to_string(),
        payload: json!({
            "text": "hello",
            "item": {
                "sessionId": "sess_1",
                "threadId": "thread_1",
                "turnId": "turn_1",
                "itemId": "agent-turn_1",
                "sequence": 3,
                "ordinal": 3,
                "createdAtMs": 100,
                "updatedAtMs": 120,
                "kind": "agentMessage",
                "status": "inProgress",
                "payload": {
                    "type": "agentMessage",
                    "text": "hello"
                }
            }
        }),
    })
    .expect("notification");

    let JsonRpcMessage::Notification(notification) = message else {
        panic!("expected notification");
    };
    let params = notification.params.expect("params");
    assert_eq!(params["canonicalEvent"]["method"], "item/updated");
    assert_eq!(params["canonicalEvent"]["params"]["itemId"], "agent-turn_1");
    assert_eq!(
        params["canonicalEvent"]["params"]["payload"]["text"],
        "hello"
    );
}

#[test]
fn current_turn_canceled_projects_interrupted_and_retired_name_is_not_accepted() {
    let turn = json!({
        "sessionId": "sess_1",
        "threadId": "thread_1",
        "turnId": "turn_1",
        "status": "interrupted",
        "createdAtMs": 100,
        "updatedAtMs": 120
    });
    let notification = event_notification_jsonrpc(AgentEvent {
        event_id: "evt_canceled".to_string(),
        sequence: 4,
        session_id: "sess_1".to_string(),
        thread_id: Some("thread_1".to_string()),
        turn_id: Some("turn_1".to_string()),
        event_type: "turn.canceled".to_string(),
        timestamp: "2026-07-05T00:00:03Z".to_string(),
        payload: json!({ "turn": turn.clone() }),
    })
    .expect("notification");
    let JsonRpcMessage::Notification(notification) = notification else {
        panic!("expected notification");
    };
    let params = notification.params.expect("params");
    assert_eq!(params["canonicalEvent"]["method"], "turn/updated");
    assert_eq!(params["canonicalEvent"]["params"]["status"], "interrupted");

    let retired = event_notification_jsonrpc(AgentEvent {
        event_id: "evt_interrupted".to_string(),
        sequence: 5,
        session_id: "sess_1".to_string(),
        thread_id: Some("thread_1".to_string()),
        turn_id: Some("turn_1".to_string()),
        event_type: "turn.interrupted".to_string(),
        timestamp: "2026-07-05T00:00:04Z".to_string(),
        payload: json!({ "turn": turn }),
    })
    .expect("notification");
    let JsonRpcMessage::Notification(retired) = retired else {
        panic!("expected notification");
    };
    assert!(retired
        .params
        .expect("params")
        .get("canonicalEvent")
        .is_none());
}
