use crate::RuntimeCoreError;
use crate::RuntimeEvent;
use crate::RuntimeEventSink;
use lime_agent::{AgentEvent as RuntimeAgentEvent, AgentToolResult};
use serde_json::{json, Value};

pub(super) fn emit_runtime_agent_event(
    event: &RuntimeAgentEvent,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    for runtime_event in runtime_events_from_agent_event(event)? {
        sink.emit(runtime_event)?;
    }
    Ok(())
}

pub(super) fn runtime_events_from_agent_event(
    event: &RuntimeAgentEvent,
) -> Result<Vec<RuntimeEvent>, RuntimeCoreError> {
    let runtime_event = serde_json::to_value(event).map_err(event_error)?;
    let raw_type = runtime_event
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("runtime_event")
        .to_string();
    let mut payload = runtime_event
        .as_object()
        .cloned()
        .map(Value::Object)
        .unwrap_or_else(|| json!({ "value": runtime_event.clone() }));
    if let Some(payload_object) = payload.as_object_mut() {
        payload_object.insert("backend".to_string(), Value::String("runtime".to_string()));
        payload_object.insert("runtimeEvent".to_string(), runtime_event);
        enrich_tool_terminal_payload(event, payload_object);
    }
    let mut events = vec![RuntimeEvent::new(
        runtime_event_type_for_agent_event(event, &raw_type),
        payload,
    )];
    if let RuntimeAgentEvent::ToolStart {
        tool_id, arguments, ..
    } = event
    {
        if let Some(arguments) = arguments.as_deref().and_then(non_empty_str) {
            events.push(RuntimeEvent::new(
                "tool.args",
                json!({
                    "toolCallId": tool_id,
                    "args": parse_tool_arguments(arguments),
                    "rawArgs": arguments,
                    "source": "runtime_tool_start",
                }),
            ));
        }
    }
    Ok(events)
}

pub(super) fn runtime_event_type_from_raw(raw_type: &str) -> &'static str {
    match raw_type {
        "thread_started" => "thread.started",
        "turn_started" => "turn.started",
        "turn_completed" => "turn.completed",
        "turn_failed" => "turn.failed",
        "item_started" => "item.started",
        "item_updated" => "item.updated",
        "item_completed" => "item.completed",
        "text_delta" => "message.delta",
        "text_delta_batch" => "message.delta_batch",
        "thinking_delta" => "thinking.delta",
        "tool_start" => "tool.started",
        "tool_end" => "tool.result",
        "tool_progress" => "tool.progress",
        "tool_output_delta" => "tool.output.delta",
        "tool_input_delta" => "tool.input.delta",
        "artifact_snapshot" => "artifact.snapshot",
        "action_required" => "action.required",
        "action_resolved" => "action.resolved",
        "turn_context" => "turn.context",
        "model_change" => "model.changed",
        "context_trace" => "context.trace",
        "context_compaction_started" => "context.compaction.started",
        "context_compaction_completed" => "context.compaction.completed",
        "runtime_status" => "runtime.status",
        "task_profile_resolved" => "task.profile.resolved",
        "candidate_set_resolved" => "routing.candidates.resolved",
        "routing_decision_made" => "routing.decision.made",
        "routing_fallback_applied" => "routing.fallback.applied",
        "routing_not_possible" => "routing.not_possible",
        "limit_state_updated" => "limit.state.updated",
        "single_candidate_only" => "limit.single_candidate_only",
        "single_candidate_capability_gap" => "limit.single_candidate_capability_gap",
        "cost_estimated" => "cost.estimated",
        "cost_recorded" => "cost.recorded",
        "rate_limit_hit" => "rate_limit.hit",
        "quota_low" => "quota.low",
        "quota_blocked" => "quota.blocked",
        "queue_added" => "queue.added",
        "queue_removed" => "queue.removed",
        "queue_started" => "queue.started",
        "queue_cleared" => "queue.cleared",
        "error" => "turn.failed",
        "warning" => "runtime.warning",
        "message" => "message",
        _ => "runtime.event",
    }
}

fn runtime_event_type_for_agent_event(event: &RuntimeAgentEvent, raw_type: &str) -> &'static str {
    match event {
        RuntimeAgentEvent::ToolEnd { result, .. } if !result.success => "tool.failed",
        _ => runtime_event_type_from_raw(raw_type),
    }
}

fn enrich_tool_terminal_payload(
    event: &RuntimeAgentEvent,
    payload_object: &mut serde_json::Map<String, Value>,
) {
    let RuntimeAgentEvent::ToolEnd { tool_id, result } = event else {
        return;
    };
    payload_object.insert("toolCallId".to_string(), Value::String(tool_id.clone()));
    payload_object.insert(
        "status".to_string(),
        Value::String(
            if result.success {
                "completed"
            } else {
                "failed"
            }
            .to_string(),
        ),
    );
    if result.success {
        return;
    }
    payload_object.insert(
        "failureCategory".to_string(),
        Value::String(tool_failure_category(result)),
    );
    if let Some(error) = result.error.as_deref().and_then(non_empty_str) {
        payload_object.insert("error".to_string(), Value::String(error.to_string()));
    }
    if let Some(output) = non_empty_str(&result.output) {
        payload_object.insert("output".to_string(), Value::String(output.to_string()));
    }
}

fn tool_failure_category(result: &AgentToolResult) -> String {
    result
        .metadata
        .as_ref()
        .and_then(|metadata| {
            [
                "failureCategory",
                "failure_category",
                "reasonCode",
                "reason_code",
            ]
            .iter()
            .find_map(|key| metadata.get(*key)?.as_str().and_then(non_empty_str))
        })
        .unwrap_or("tool_failed")
        .to_string()
}

fn parse_tool_arguments(arguments: &str) -> Value {
    serde_json::from_str(arguments).unwrap_or_else(|_| Value::String(arguments.to_string()))
}

fn non_empty_str(value: &str) -> Option<&str> {
    let value = value.trim();
    (!value.is_empty()).then_some(value)
}

fn event_error(error: impl std::fmt::Display) -> RuntimeCoreError {
    RuntimeCoreError::Backend(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn final_done_raw_runtime_event_does_not_map_to_current_terminal_event() {
        assert_eq!(runtime_event_type_from_raw("final_done"), "runtime.event");
    }

    #[test]
    fn runtime_agent_tool_start_without_arguments_does_not_emit_empty_tool_args() {
        let events = runtime_events_from_agent_event(&RuntimeAgentEvent::ToolStart {
            tool_name: "WebFetch".to_string(),
            tool_id: "tool-no-args".to_string(),
            arguments: None,
        })
        .expect("tool start should emit");

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "tool.started");
    }

    #[test]
    fn runtime_agent_tool_args_preserve_non_json_arguments() {
        let events = runtime_events_from_agent_event(&RuntimeAgentEvent::ToolStart {
            tool_name: "Bash".to_string(),
            tool_id: "tool-raw-args".to_string(),
            arguments: Some("echo hello".to_string()),
        })
        .expect("tool start should emit");

        let args_event = events
            .iter()
            .find(|event| event.event_type == "tool.args")
            .expect("tool args event");
        assert_eq!(
            args_event.payload["toolCallId"].as_str(),
            Some("tool-raw-args")
        );
        assert_eq!(args_event.payload["args"].as_str(), Some("echo hello"));
        assert_eq!(args_event.payload["rawArgs"].as_str(), Some("echo hello"));
    }

    #[test]
    fn runtime_agent_json_tool_args_emit_tool_args_fact() {
        let events = runtime_events_from_agent_event(&RuntimeAgentEvent::ToolStart {
            tool_name: "Bash".to_string(),
            tool_id: "tool-json-args".to_string(),
            arguments: Some(json!({ "command": "cargo test" }).to_string()),
        })
        .expect("tool start should emit");

        assert_eq!(
            events
                .iter()
                .map(|event| event.event_type.as_str())
                .collect::<Vec<_>>(),
            vec!["tool.started", "tool.args"]
        );
        assert_eq!(
            events[1].payload["args"]["command"].as_str(),
            Some("cargo test")
        );
        assert_eq!(
            events[1].payload["source"].as_str(),
            Some("runtime_tool_start")
        );
    }

    #[test]
    fn runtime_agent_successful_tool_end_emits_tool_result() {
        let events = runtime_events_from_agent_event(&RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-ok".to_string(),
            result: AgentToolResult {
                success: true,
                output: "ok".to_string(),
                error: None,
                images: None,
                metadata: None,
            },
        })
        .expect("tool end should emit");

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "tool.result");
        assert_eq!(events[0].payload["toolCallId"].as_str(), Some("tool-ok"));
        assert_eq!(events[0].payload["status"].as_str(), Some("completed"));
    }

    #[test]
    fn runtime_agent_failed_tool_end_emits_tool_failed() {
        let events = runtime_events_from_agent_event(&RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-failed".to_string(),
            result: AgentToolResult {
                success: false,
                output: "test failed".to_string(),
                error: Some("exit code 101".to_string()),
                images: None,
                metadata: Some(HashMap::from([
                    ("exit_code".to_string(), json!(101)),
                    ("failureCategory".to_string(), json!("test_failed")),
                ])),
            },
        })
        .expect("failed tool end should emit");

        assert_eq!(events.len(), 1);
        let failed_event = &events[0];
        assert_eq!(failed_event.event_type, "tool.failed");
        assert_eq!(
            failed_event.payload["toolCallId"].as_str(),
            Some("tool-failed")
        );
        assert_eq!(failed_event.payload["status"].as_str(), Some("failed"));
        assert_eq!(
            failed_event.payload["failureCategory"].as_str(),
            Some("test_failed")
        );
        assert_eq!(
            failed_event.payload["error"].as_str(),
            Some("exit code 101")
        );
        assert_eq!(failed_event.payload["output"].as_str(), Some("test failed"));
    }
}
