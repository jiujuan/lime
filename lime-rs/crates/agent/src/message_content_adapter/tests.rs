use super::*;
use crate::protocol::AgentMessageContent as RuntimeMessageContent;
use rmcp::model::{CallToolResult, Content};
use serde_json::json;
use std::collections::HashMap;

fn turn_context_with_token_limit(limit: usize) -> AgentTurnContext {
    AgentTurnContext {
        metadata: HashMap::from([(
            "runtime_options".to_string(),
            json!({
                "harness": {
                    "model_request_policy": {
                        "truncation_policy": {
                            "mode": "tokens",
                            "limit": limit
                        }
                    }
                }
            }),
        )]),
        ..AgentTurnContext::default()
    }
}

fn tool_response_message(output: &str) -> Message {
    Message::assistant().with_tool_response(
        "tool-compat",
        Ok(CallToolResult {
            content: vec![Content::text(output.to_string())],
            structured_content: None,
            meta: None,
            is_error: None,
        }),
    )
}

fn tool_end_output(events: &[RuntimeAgentEvent]) -> &str {
    events
        .iter()
        .find_map(|event| match event {
            RuntimeAgentEvent::ToolEnd { result, .. } => Some(result.output.as_str()),
            _ => None,
        })
        .expect("expected ToolEnd")
}

#[test]
fn tool_response_event_output_uses_turn_context_truncation_policy() {
    let output = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
    let context = turn_context_with_token_limit(4);

    let events = convert_aster_message_to_events_with_turn_context(
        tool_response_message(output),
        Some(&context),
    );
    let formatted = tool_end_output(&events);

    assert!(formatted.starts_with("Warning: truncated output (original token count:"));
    assert!(formatted.contains("tokens truncated"));
    assert!(formatted.contains("alpha"));
    assert!(formatted.contains("kappa"));
}

#[test]
fn tool_response_message_content_uses_turn_context_truncation_policy() {
    let output = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
    let context = turn_context_with_token_limit(4);
    let message = convert_aster_message_to_runtime_message_with_turn_context(
        &tool_response_message(output),
        Some(&context),
    );

    let formatted = message
        .content
        .iter()
        .find_map(|content| match content {
            RuntimeMessageContent::ToolResponse { output, .. } => Some(output.as_str()),
            _ => None,
        })
        .expect("expected tool response content");

    assert!(formatted.starts_with("Warning: truncated output (original token count:"));
    assert!(formatted.contains("tokens truncated"));
}

#[test]
fn tool_response_output_without_turn_context_keeps_compat_fallback() {
    let output = "alpha beta gamma delta epsilon zeta eta theta iota kappa";

    let events =
        convert_aster_message_to_events_with_turn_context(tool_response_message(output), None);

    assert_eq!(tool_end_output(&events), output);
}
