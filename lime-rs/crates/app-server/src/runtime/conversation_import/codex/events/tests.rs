use super::{
    approval_prompt, event_msg_rollout_events, response_item_rollout_events, CodexRolloutEvent,
};
use serde_json::json;

#[test]
fn codex_completed_plan_preserves_authoritative_item_identity() {
    let payload = json!({
        "type": "item_completed",
        "thread_id": "thread-plan",
        "turn_id": "turn-plan",
        "completed_at_ms": 1781568001380_i64,
        "item": {
            "type": "Plan",
            "id": "item-plan-1",
            "text": "# Final plan\n- first\n- second"
        }
    });

    let events = event_msg_rollout_events(Some(&payload), None);
    assert_eq!(events.len(), 1);
    let CodexRolloutEvent::Runtime {
        event_type,
        payload,
    } = &events[0]
    else {
        panic!("completed Plan must remain a runtime event");
    };
    assert_eq!(*event_type, "plan.final");
    assert_eq!(payload["itemId"], "item-plan-1");
    assert_eq!(payload["revisionId"], "item-plan-1");
    assert_eq!(payload["sourceItemId"], "item-plan-1");
    assert_eq!(payload["status"], "completed");
}

#[test]
fn codex_subagent_activity_preserves_current_kind() {
    for kind in ["started", "interacted", "interrupted"] {
        let payload = json!({
            "type": "sub_agent_activity",
            "event_id": format!("event-{kind}"),
            "kind": kind,
            "agent_thread_id": "thread-child",
        });

        let events = event_msg_rollout_events(Some(&payload), None);
        assert_eq!(events.len(), 1);
        let CodexRolloutEvent::Runtime {
            event_type,
            payload,
        } = &events[0]
        else {
            panic!("SubAgent activity must remain a runtime event");
        };
        assert_eq!(*event_type, "subagent.activity");
        assert_eq!(payload["activity"], kind);
    }
}

#[test]
fn codex_tool_search_stays_in_provider_history() {
    for payload in [
        json!({
            "type": "tool_search_call",
            "call_id": "search-1",
            "query": "deferred tools"
        }),
        json!({
            "type": "tool_search_output",
            "call_id": "search-1",
            "output": "selected tools"
        }),
    ] {
        assert!(response_item_rollout_events(Some(&payload), None).is_empty());
    }
}

#[test]
fn approval_prompt_uses_the_canonical_command_fallback() {
    let payload = json!({
        "type": "exec_approval_request",
        "command": ["npm", "test"]
    });

    let prompt = approval_prompt(&payload).expect("command fallback");
    assert_eq!(prompt, "Approve command: npm test");
    assert!(!prompt.contains("imported"));
}
