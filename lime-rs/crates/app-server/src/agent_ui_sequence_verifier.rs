use app_server_protocol::AgentEvent;
use serde_json::Value;
use std::collections::HashMap;
use std::collections::HashSet;

#[derive(Default)]
struct TurnState {
    active_tools: HashMap<String, String>,
    active_actions: HashMap<String, String>,
    terminal: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SequenceViolation {
    code: &'static str,
    event_id: String,
    scope_id: Option<String>,
}

pub(crate) fn validate_agent_event_sequence(
    existing_events: &[AgentEvent],
    candidate: &AgentEvent,
) -> Result<(), String> {
    let mut verifier = SequenceVerifier::default();
    for event in existing_events
        .iter()
        .filter(|event| same_sequence_scope(event, candidate))
    {
        verifier.push(event);
    }

    let violations = verifier.push(candidate);
    if violations.is_empty() {
        return Ok(());
    }

    Err(format!(
        "agent runtime event sequence validation failed: {}",
        violations
            .iter()
            .map(format_violation)
            .collect::<Vec<_>>()
            .join("; ")
    ))
}

#[derive(Default)]
struct SequenceVerifier {
    seen_ids: HashSet<String>,
    turns: HashMap<String, TurnState>,
}

impl SequenceVerifier {
    fn push(&mut self, event: &AgentEvent) -> Vec<SequenceViolation> {
        let mut violations = Vec::new();
        if !event.event_id.is_empty() && !self.seen_ids.insert(event.event_id.clone()) {
            violations.push(SequenceViolation {
                code: "duplicate_event_id",
                event_id: event.event_id.clone(),
                scope_id: None,
            });
        }

        let event_class = normalize_event_class(&event.event_type);
        let turn_key = event
            .turn_id
            .as_deref()
            .unwrap_or("__default_turn__")
            .to_string();
        let turn = self.turns.entry(turn_key).or_default();

        if turn.terminal && is_execution_stream_class(event_class) {
            violations.push(SequenceViolation {
                code: "execution_after_turn_terminal",
                event_id: event.event_id.clone(),
                scope_id: event_scope_id(event),
            });
            return violations;
        }

        match event_class {
            "tool.started" => {
                if let Some(tool_call_id) = tool_call_id(event) {
                    if turn.active_tools.contains_key(&tool_call_id) {
                        violations.push(SequenceViolation {
                            code: "tool_started_already_active",
                            event_id: event.event_id.clone(),
                            scope_id: Some(tool_call_id),
                        });
                    } else {
                        turn.active_tools
                            .insert(tool_call_id, event.event_id.clone());
                    }
                }
            }
            "tool.result" | "tool.failed" => {
                if let Some(tool_call_id) = tool_call_id(event) {
                    if turn.active_tools.remove(&tool_call_id).is_none() {
                        violations.push(SequenceViolation {
                            code: if event_class == "tool.result" {
                                "tool_result_without_start"
                            } else {
                                "tool_failed_without_start"
                            },
                            event_id: event.event_id.clone(),
                            scope_id: Some(tool_call_id),
                        });
                    }
                }
            }
            "action.required" => {
                if let Some(action_id) = action_id(event) {
                    if turn.active_actions.contains_key(&action_id) {
                        violations.push(SequenceViolation {
                            code: "action_required_already_active",
                            event_id: event.event_id.clone(),
                            scope_id: Some(action_id),
                        });
                    } else {
                        turn.active_actions
                            .insert(action_id, event.event_id.clone());
                    }
                }
            }
            event_class if is_action_terminal_event_class(event_class) => {
                if let Some(action_id) = action_id(event) {
                    if turn.active_actions.remove(&action_id).is_none() {
                        violations.push(SequenceViolation {
                            code: "action_resolved_without_request",
                            event_id: event.event_id.clone(),
                            scope_id: Some(action_id),
                        });
                    }
                }
            }
            "turn.completed" | "turn.failed" | "turn.canceled" => {
                if turn.terminal {
                    violations.push(SequenceViolation {
                        code: "turn_terminal_repeated",
                        event_id: event.event_id.clone(),
                        scope_id: event.turn_id.clone(),
                    });
                }
                for tool_call_id in turn.active_tools.keys() {
                    violations.push(SequenceViolation {
                        code: "tool_unclosed_at_turn_end",
                        event_id: event.event_id.clone(),
                        scope_id: Some(tool_call_id.clone()),
                    });
                }
                for action_id in turn.active_actions.keys() {
                    violations.push(SequenceViolation {
                        code: "action_unresolved_at_turn_end",
                        event_id: event.event_id.clone(),
                        scope_id: Some(action_id.clone()),
                    });
                }
                turn.terminal = true;
                turn.active_tools.clear();
                turn.active_actions.clear();
            }
            _ => {}
        }

        violations
    }
}

fn same_sequence_scope(event: &AgentEvent, candidate: &AgentEvent) -> bool {
    event.session_id == candidate.session_id && event.turn_id == candidate.turn_id
}

fn normalize_event_class(event_type: &str) -> &str {
    match event_type {
        "message.delta" | "message.delta_batch" | "message.batch" => "model.delta",
        "message" | "message.completed" | "item.completed" => "model.completed",
        "thinking.delta" => "reasoning.delta",
        "artifact.snapshot" => "artifact.changed",
        "runtime.status" => "run.status",
        "turn.canceled" => "turn.canceled",
        value => value,
    }
}

fn is_execution_stream_class(event_class: &str) -> bool {
    event_class.starts_with("tool.")
        || event_class.starts_with("action.")
        || event_class.starts_with("model.")
        || event_class.starts_with("reasoning.")
        || event_class == "context.resolved"
        || event_class.starts_with("permission.")
        || event_class.starts_with("sandbox.")
}

fn is_action_terminal_event_class(event_class: &str) -> bool {
    matches!(
        event_class,
        "action.resolved" | "action.cancelled" | "action.canceled" | "action.expired"
    )
}

fn tool_call_id(event: &AgentEvent) -> Option<String> {
    string_field(
        &event.payload,
        &["toolCallId", "tool_call_id", "toolId", "tool_id", "id"],
    )
}

fn action_id(event: &AgentEvent) -> Option<String> {
    string_field(
        &event.payload,
        &["actionId", "action_id", "requestId", "request_id", "id"],
    )
}

fn event_scope_id(event: &AgentEvent) -> Option<String> {
    tool_call_id(event).or_else(|| action_id(event))
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn format_violation(violation: &SequenceViolation) -> String {
    match violation.scope_id.as_deref() {
        Some(scope_id) => format!(
            "{} event_id={} scope_id={}",
            violation.code, violation.event_id, scope_id
        ),
        None => format!("{} event_id={}", violation.code, violation.event_id),
    }
}

#[cfg(test)]
mod tests {
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
            timestamp: "2026-06-12T00:00:00.000Z".to_string(),
            payload,
        }
    }

    #[test]
    fn accepts_paired_tool_sequence() {
        let existing = vec![event(
            "evt_tool_start",
            "tool.started",
            json!({ "toolCallId": "tool_1" }),
        )];
        let candidate = event(
            "evt_tool_result",
            "tool.result",
            json!({ "toolCallId": "tool_1" }),
        );

        validate_agent_event_sequence(&existing, &candidate).expect("valid sequence");
    }

    #[test]
    fn rejects_tool_result_without_start() {
        let candidate = event(
            "evt_tool_result",
            "tool.result",
            json!({ "toolCallId": "tool_1" }),
        );

        let error = validate_agent_event_sequence(&[], &candidate)
            .expect_err("tool result without start should fail");
        assert!(error.contains("tool_result_without_start"));
    }

    #[test]
    fn rejects_unclosed_tool_at_terminal_turn() {
        let existing = vec![event(
            "evt_tool_start",
            "tool.started",
            json!({ "toolCallId": "tool_1" }),
        )];
        let candidate = event("evt_turn_done", "turn.completed", json!({}));

        let error = validate_agent_event_sequence(&existing, &candidate)
            .expect_err("terminal turn should close active tools");
        assert!(error.contains("tool_unclosed_at_turn_end"));
    }

    #[test]
    fn accepts_message_delta_completed_stream() {
        let existing = vec![event(
            "evt_message_delta",
            "message.delta",
            json!({ "text": "hello" }),
        )];
        let candidate = event("evt_turn_done", "turn.completed", json!({}));

        validate_agent_event_sequence(&existing, &candidate)
            .expect("message.delta can be closed by turn.completed");
    }

    #[test]
    fn accepts_action_cancel_and_expiry_as_action_terminal_events() {
        for event_type in ["action.cancelled", "action.canceled", "action.expired"] {
            let existing = vec![event(
                "evt_action_required",
                "action.required",
                json!({ "actionId": "action_1" }),
            )];
            let candidate = event(
                "evt_action_terminal",
                event_type,
                json!({ "actionId": "action_1" }),
            );

            validate_agent_event_sequence(&existing, &candidate)
                .unwrap_or_else(|error| panic!("{event_type} should close action: {error}"));
        }
    }

    #[test]
    fn rejects_action_cancel_without_required_event() {
        let candidate = event(
            "evt_action_cancel",
            "action.canceled",
            json!({ "actionId": "action_1" }),
        );

        let error = validate_agent_event_sequence(&[], &candidate)
            .expect_err("action cancel without request should fail");
        assert!(error.contains("action_resolved_without_request"));
    }

    #[test]
    fn legacy_final_done_does_not_close_current_turn_stream() {
        let existing = vec![event(
            "evt_message_delta",
            "message.delta",
            json!({ "text": "hello" }),
        )];
        let candidate = event("evt_turn_done", "turn.final_done", json!({}));

        validate_agent_event_sequence(&existing, &candidate)
            .expect("legacy final_done is not a current terminal event");
    }

    #[test]
    fn legacy_final_done_does_not_close_active_tools() {
        let existing = vec![event(
            "evt_tool_start",
            "tool.started",
            json!({ "toolCallId": "tool_1" }),
        )];
        let candidate = event("evt_turn_done", "turn.final_done", json!({}));

        validate_agent_event_sequence(&existing, &candidate)
            .expect("legacy final_done must not be treated as terminal");
    }

    #[test]
    fn treats_turn_canceled_as_terminal() {
        let existing = vec![event("evt_cancel", "turn.canceled", json!({}))];
        let candidate = event("evt_late_delta", "message.delta", json!({ "text": "late" }));

        let error = validate_agent_event_sequence(&existing, &candidate)
            .expect_err("terminal canceled turn should block later execution");
        assert!(error.contains("execution_after_turn_terminal"));
    }
}
