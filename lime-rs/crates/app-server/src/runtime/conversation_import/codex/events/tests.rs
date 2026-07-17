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
fn codex_web_search_response_item_preserves_top_level_query_without_null_arguments() {
    let payload = json!({
        "type": "web_search_call",
        "id": "search-flat-1",
        "action": "search_query",
        "query": "Lime history import rendering"
    });

    let events = response_item_rollout_events(Some(&payload), None);
    assert_eq!(events.len(), 1);
    let tool = events[0]
        .tool_call()
        .expect("web search response item must become a canonical tool draft");
    assert_eq!(
        tool.source.query.as_deref(),
        Some("Lime history import rendering")
    );
    assert_eq!(
        tool.arguments
            .as_ref()
            .and_then(|arguments| arguments.get("query"))
            .and_then(serde_json::Value::as_str),
        Some("Lime history import rendering")
    );
    assert_ne!(
        tool.arguments
            .as_ref()
            .and_then(|arguments| arguments.get("query")),
        Some(&serde_json::Value::Null)
    );
}

#[test]
fn codex_web_search_end_preserves_protocol_query_and_structured_results() {
    let payload = json!({
        "type": "web_search_end",
        "call_id": "search-protocol-1",
        "query": "Codex app web search protocol",
        "action": {"type": "search"},
        "results": [{
            "title": "Codex Web Search",
            "url": "https://example.com/codex-search",
            "snippet": "Canonical search result"
        }]
    });

    let events = event_msg_rollout_events(Some(&payload), None);
    assert_eq!(events.len(), 1);
    let tool = events[0]
        .tool_call()
        .expect("web search end must become a canonical terminal tool draft");
    assert_eq!(
        tool.source.query.as_deref(),
        Some("Codex app web search protocol")
    );
    assert_eq!(
        tool.arguments
            .as_ref()
            .and_then(|arguments| arguments.get("query"))
            .and_then(serde_json::Value::as_str),
        Some("Codex app web search protocol")
    );
    assert_eq!(
        tool.source
            .structured_content
            .as_ref()
            .and_then(|content| content.pointer("/results/0/title"))
            .and_then(serde_json::Value::as_str),
        Some("Codex Web Search")
    );
    assert!(tool
        .output
        .as_ref()
        .and_then(serde_json::Value::as_str)
        .is_some_and(|output| output.contains("Codex Web Search")));
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
