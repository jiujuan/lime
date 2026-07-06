use super::*;
use serde_json::json;

fn event(event_id: &str, event_type: &str, payload: Value) -> AgentEvent {
    AgentEvent {
        event_id: event_id.to_string(),
        sequence: 1,
        session_id: "sess_test".to_string(),
        thread_id: Some("thread_test".to_string()),
        turn_id: Some("turn_test".to_string()),
        event_type: event_type.to_string(),
        timestamp: "2026-06-13T00:00:00.000Z".to_string(),
        payload,
    }
}

#[test]
fn rejects_tool_args_without_active_tool() {
    let candidate = event(
        "evt_args",
        "tool.args",
        json!({ "toolCallId": "tool_1", "args": {} }),
    );

    let error = validate_tool_lifecycle_event(&[], &candidate)
        .expect_err("tool args without active tool should fail");
    assert!(error.contains("tool_args_without_start"));
}

#[test]
fn allows_tool_args_between_start_and_result() {
    let existing = vec![event(
        "evt_start",
        "tool.started",
        json!({ "toolCallId": "tool_1" }),
    )];
    let candidate = event(
        "evt_args",
        "tool.args.delta",
        json!({ "toolCallId": "tool_1", "delta": "{}" }),
    );

    validate_tool_lifecycle_event(&existing, &candidate).expect("active tool args");
}

#[test]
fn rejects_policy_event_for_inactive_tool() {
    let existing = vec![
        event(
            "evt_start",
            "tool.started",
            json!({ "toolCallId": "tool_1" }),
        ),
        event(
            "evt_result",
            "tool.result",
            json!({ "toolCallId": "tool_1" }),
        ),
    ];
    let candidate = event(
        "evt_sandbox",
        "sandbox.blocked",
        json!({ "toolCallId": "tool_1", "reasonCode": "sandbox_denied" }),
    );

    let error = validate_tool_lifecycle_event(&existing, &candidate)
        .expect_err("policy event for completed tool should fail");
    assert!(error.contains("tool_policy_event_without_active_tool"));
}

#[test]
fn rejects_tool_output_before_action_resolution() {
    let existing = vec![
        event(
            "evt_start",
            "tool.started",
            json!({ "toolCallId": "tool_1" }),
        ),
        event(
            "evt_action",
            "action.required",
            json!({
                "actionId": "action_1",
                "toolCallId": "tool_1"
            }),
        ),
    ];
    let candidate = event(
        "evt_output",
        "tool.output.delta",
        json!({ "toolCallId": "tool_1", "delta": "running" }),
    );

    let error = validate_tool_lifecycle_event(&existing, &candidate)
        .expect_err("tool output before approval should fail");
    assert!(error.contains("tool_output_before_action_resolved"));
}

#[test]
fn allows_tool_result_after_action_resolution() {
    let existing = vec![
        event(
            "evt_start",
            "tool.started",
            json!({ "toolCallId": "tool_1" }),
        ),
        event(
            "evt_action",
            "action.required",
            json!({
                "actionId": "action_1",
                "toolCallId": "tool_1"
            }),
        ),
        event(
            "evt_action_resolved",
            "action.resolved",
            json!({
                "actionId": "action_1",
                "toolCallId": "tool_1",
                "decision": "approve"
            }),
        ),
    ];
    let candidate = event(
        "evt_result",
        "tool.result",
        json!({ "toolCallId": "tool_1", "output": "ok" }),
    );

    validate_tool_lifecycle_event(&existing, &candidate).expect("approved tool result should pass");
}

#[test]
fn rejects_tool_result_after_action_denial() {
    let existing = vec![
        event(
            "evt_start",
            "tool.started",
            json!({ "toolCallId": "tool_1" }),
        ),
        event(
            "evt_action",
            "action.required",
            json!({
                "actionId": "action_1",
                "toolCallId": "tool_1"
            }),
        ),
        event(
            "evt_action_denied",
            "action.canceled",
            json!({
                "actionId": "action_1",
                "toolCallId": "tool_1"
            }),
        ),
    ];
    let candidate = event(
        "evt_result",
        "tool.result",
        json!({ "toolCallId": "tool_1", "output": "should not run" }),
    );

    let error = validate_tool_lifecycle_event(&existing, &candidate)
        .expect_err("denied tool result should fail");
    assert!(error.contains("tool_result_after_action_denied"));
}

#[test]
fn rejects_tool_result_after_sandbox_blocked() {
    let existing = vec![
        event(
            "evt_start",
            "tool.started",
            json!({ "toolCallId": "tool_1" }),
        ),
        event(
            "evt_sandbox",
            "sandbox.blocked",
            json!({
                "toolCallId": "tool_1",
                "reasonCode": "network_disabled"
            }),
        ),
    ];
    let candidate = event(
        "evt_result",
        "tool.result",
        json!({ "toolCallId": "tool_1", "output": "should not run" }),
    );

    let error = validate_tool_lifecycle_event(&existing, &candidate)
        .expect_err("sandbox blocked tool result should fail");
    assert!(error.contains("tool_result_after_sandbox_blocked"));
}

#[test]
fn rejects_tool_output_after_permission_denied() {
    let existing = vec![
        event(
            "evt_start",
            "tool.started",
            json!({ "toolCallId": "tool_1" }),
        ),
        event(
            "evt_permission",
            "permission.denied",
            json!({
                "toolCallId": "tool_1",
                "reasonCode": "host_permission_denied"
            }),
        ),
    ];
    let candidate = event(
        "evt_output",
        "tool.output.delta",
        json!({ "toolCallId": "tool_1", "delta": "should not stream" }),
    );

    let error = validate_tool_lifecycle_event(&existing, &candidate)
        .expect_err("permission denied tool output should fail");
    assert!(error.contains("tool_output_after_permission_denied"));
}

#[test]
fn allows_tool_failed_after_sandbox_blocked() {
    let existing = vec![
        event(
            "evt_start",
            "tool.started",
            json!({ "toolCallId": "tool_1" }),
        ),
        event(
            "evt_sandbox",
            "sandbox.blocked",
            json!({
                "toolCallId": "tool_1",
                "reasonCode": "network_disabled"
            }),
        ),
    ];
    let candidate = event(
        "evt_failed",
        "tool.failed",
        json!({
            "toolCallId": "tool_1",
            "failureCategory": "sandbox_blocked"
        }),
    );

    validate_tool_lifecycle_event(&existing, &candidate)
        .expect("blocked tool can still close as failed");
}

#[test]
fn allows_tool_result_with_matching_owner() {
    let existing = vec![event(
        "evt_start",
        "tool.started",
        json!({
            "toolCallId": "tool_1",
            "messageId": "assistant_1",
            "itemId": "item_1"
        }),
    )];
    let candidate = event(
        "evt_result",
        "tool.result",
        json!({
            "toolCallId": "tool_1",
            "assistantMessageId": "assistant_1",
            "itemId": "item_1",
            "output": "ok"
        }),
    );

    validate_tool_lifecycle_event(&existing, &candidate).expect("matching tool owner should pass");
}

#[test]
fn rejects_tool_result_owner_mismatch() {
    let existing = vec![event(
        "evt_start",
        "tool.started",
        json!({
            "toolCallId": "tool_1",
            "messageId": "assistant_1"
        }),
    )];
    let candidate = event(
        "evt_result",
        "tool.result",
        json!({
            "toolCallId": "tool_1",
            "messageId": "assistant_2",
            "output": "wrong owner"
        }),
    );

    let error = validate_tool_lifecycle_event(&existing, &candidate)
        .expect_err("mismatched tool owner should fail");
    assert!(error.contains("tool_event_owner_mismatch"));
}

#[test]
fn rejects_tool_result_missing_owner_when_start_has_owner() {
    let existing = vec![event(
        "evt_start",
        "tool.started",
        json!({
            "toolCallId": "tool_1",
            "messageId": "assistant_1"
        }),
    )];
    let candidate = event(
        "evt_result",
        "tool.result",
        json!({ "toolCallId": "tool_1", "output": "missing owner" }),
    );

    let error = validate_tool_lifecycle_event(&existing, &candidate)
        .expect_err("owned tool terminal without owner should fail");
    assert!(error.contains("tool_terminal_missing_owner"));
}

#[test]
fn rejects_tool_output_owner_mismatch() {
    let existing = vec![event(
        "evt_start",
        "tool.started",
        json!({
            "toolCallId": "tool_1",
            "itemId": "item_1"
        }),
    )];
    let candidate = event(
        "evt_output",
        "tool.output.delta",
        json!({
            "toolCallId": "tool_1",
            "itemId": "item_2",
            "delta": "wrong owner"
        }),
    );

    let error = validate_tool_lifecycle_event(&existing, &candidate)
        .expect_err("mismatched output owner should fail");
    assert!(error.contains("tool_event_owner_mismatch"));
}

#[test]
fn normalizes_action_required_with_matching_active_tool() {
    let existing = vec![event(
        "evt_start",
        "tool.started",
        json!({
            "toolCallId": "tool_shell",
            "toolName": "Bash",
            "arguments": {
                "command": "npm test"
            }
        }),
    )];

    let normalized = normalize_policy_event_payload(
        &existing,
        Some("turn_test"),
        "action.required",
        json!({
            "requestId": "approval_1",
            "actionType": "tool_confirmation",
            "data": {
                "tool_name": "Bash",
                "arguments": {
                    "command": "npm test"
                }
            }
        }),
    );

    assert_eq!(normalized["actionId"].as_str(), Some("approval_1"));
    assert_eq!(normalized["requestId"].as_str(), Some("approval_1"));
    assert_eq!(normalized["toolCallId"].as_str(), Some("tool_shell"));
    assert_eq!(normalized["actionKind"].as_str(), Some("approve-tool"));
}

#[test]
fn normalizes_action_resolved_from_previous_action_required_tool() {
    let existing = vec![
        event(
            "evt_start",
            "tool.started",
            json!({ "toolCallId": "tool_shell", "toolName": "Bash" }),
        ),
        event(
            "evt_action",
            "action.required",
            json!({
                "actionId": "approval_1",
                "requestId": "approval_1",
                "toolCallId": "tool_shell",
                "actionType": "tool_confirmation"
            }),
        ),
    ];

    let normalized = normalize_policy_event_payload(
        &existing,
        Some("turn_test"),
        "action.resolved",
        json!({
            "requestId": "approval_1",
            "actionType": "tool_confirmation",
            "decision": "approve"
        }),
    );
    let candidate = event("evt_resolved", "action.resolved", normalized);

    assert_eq!(candidate.payload["toolCallId"].as_str(), Some("tool_shell"));
    validate_tool_lifecycle_event(&existing, &candidate)
        .expect("resolved action with inferred tool id should pass");
}
