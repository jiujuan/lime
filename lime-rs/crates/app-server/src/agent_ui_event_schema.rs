use app_server_protocol::AgentEvent;
use jsonschema::Validator;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;
use std::sync::OnceLock;

const RUNTIME_EVENT_SCHEMA: &str = include_str!(
    "../../../../packages/agent-ui-contracts/schemas/agent-runtime-event.v0.1.schema.json"
);
const STATE_DELTA_SCHEMA: &str = include_str!(
    "../../../../packages/agent-ui-contracts/schemas/agent-runtime-state-delta.v0.1.schema.json"
);

static RUNTIME_EVENT_VALIDATOR: OnceLock<Result<Validator, String>> = OnceLock::new();
static STATE_DELTA_VALIDATOR: OnceLock<Result<Validator, String>> = OnceLock::new();

pub(crate) fn validate_agent_event(event: &AgentEvent) -> Result<(), String> {
    reject_legacy_turn_terminal_event(&event.event_type)?;
    if is_text_delta_fast_path_event(&event.event_type) {
        return validate_text_delta_fast_path_event(event);
    }
    validate_coding_event_payload(event)?;

    let runtime_event = runtime_event_schema_value(event);
    validate_with_schema(
        "agent runtime event",
        &runtime_event,
        runtime_event_validator()?,
    )?;

    if normalize_event_class(&event.event_type) == "state.delta" {
        let state_delta = state_delta_schema_value(event)?;
        validate_with_schema(
            "agent runtime state delta",
            &state_delta,
            state_delta_validator()?,
        )?;
    }

    Ok(())
}

fn validate_text_delta_fast_path_event(event: &AgentEvent) -> Result<(), String> {
    let payload = payload_object(&event.payload)
        .ok_or_else(|| format!("{} payload must be a JSON object", event.event_type))?;
    if event.timestamp.is_empty() {
        return Err(format!(
            "agent runtime event schema validation failed: {} createdAt must not be empty",
            event.event_type
        ));
    }
    if let Some(schema_version) = payload_string(Some(payload), &["runtimeEventSchemaVersion"]) {
        if schema_version != "lime-runtime-event/v0.1" {
            return Err(format!(
                "agent runtime event schema validation failed: {} schemaVersion must be lime-runtime-event/v0.1",
                event.event_type
            ));
        }
    }
    Ok(())
}

fn validate_coding_event_payload(event: &AgentEvent) -> Result<(), String> {
    let event_class = normalize_event_class(&event.event_type);
    let payload = payload_object(&event.payload);
    match event_class {
        "file.read" => require_payload_string(payload, &["path"], event_class),
        "file.changed" => {
            require_payload_string(payload, &["path"], event_class)?;
            if payload_string(payload, &["artifactId", "artifact_id"]).is_none()
                && payload_array_non_empty(payload, &["artifactRefs", "artifact_refs"]).is_none()
            {
                return Err(
                    "file.changed events must include artifactId or artifactRefs".to_string(),
                );
            }
            Ok(())
        }
        "patch.failed" => require_payload_string(
            payload,
            &["failureCategory", "failure_category"],
            event_class,
        ),
        "command.output" => {
            if payload_string(payload, &["outputRef", "output_ref"]).is_none()
                && payload_array_non_empty(payload, &["refIds", "ref_ids"]).is_none()
            {
                return Err("command.output events must include outputRef or refIds".to_string());
            }
            Ok(())
        }
        "command.exited" => {
            if payload_number(payload, &["exitCode", "exit_code"]).is_none()
                && payload_string(payload, &["status"]).is_none()
            {
                return Err("command.exited events must include exitCode or status".to_string());
            }
            Ok(())
        }
        "test.completed" => {
            if payload_string(payload, &["result", "status"]).is_none() {
                return Err("test.completed events must include result or status".to_string());
            }
            Ok(())
        }
        "sandbox.blocked" => {
            require_payload_string(payload, &["reasonCode", "reason_code"], event_class)
        }
        "permission.denied" => {
            require_payload_string(payload, &["reasonCode", "reason_code"], event_class)
        }
        _ => Ok(()),
    }
}

fn require_payload_string(
    payload: Option<&serde_json::Map<String, Value>>,
    keys: &[&str],
    event_class: &str,
) -> Result<(), String> {
    if payload_string(payload, keys).is_some() {
        return Ok(());
    }
    Err(format!(
        "{event_class} events must include {}",
        keys.join(" or ")
    ))
}

fn reject_legacy_turn_terminal_event(event_type: &str) -> Result<(), String> {
    match event_type.trim() {
        "done" | "final_done" | "cancelled" | "turn.done" | "turn.final_done"
        | "turn.cancelled" => Err(format!(
            "legacy runtime terminal event `{event_type}` is not allowed; use turn.completed, turn.failed, or turn.canceled"
        )),
        _ => Ok(()),
    }
}

fn runtime_event_schema_value(event: &AgentEvent) -> Value {
    let payload = payload_object(&event.payload);
    let event_class = normalize_event_class(&event.event_type);
    compact_object(json!({
        "id": format!("appserver:{}", event.event_id),
        "schemaVersion": payload_string(payload, &["runtimeEventSchemaVersion"])
            .unwrap_or("lime-runtime-event/v0.1"),
        "runtimeId": payload_string(payload, &["runtimeId"])
            .unwrap_or("app-server"),
        "kind": kind_for_event_class(event_class),
        "status": status_for_event_class(event_class),
        "eventClass": event_class,
        "sequence": event.sequence,
        "threadId": event.thread_id,
        "turnId": event.turn_id,
        "toolCallId": payload_string(payload, &["toolCallId", "tool_call_id", "toolId", "tool_id"]),
        "actionId": payload_string(payload, &["actionId", "action_id", "requestId", "request_id"]),
        "artifactId": payload_string(payload, &["artifactId", "artifact_id"]),
        "evidenceId": payload_string(payload, &["evidenceId", "evidence_id"]),
        "title": payload_string(payload, &["title"]).unwrap_or(event_class),
        "payload": event.payload,
        "createdAt": event.timestamp,
        "completedAt": completed_at_for_event(event, event_class),
    }))
}

fn state_delta_schema_value(event: &AgentEvent) -> Result<Value, String> {
    let payload = payload_object(&event.payload)
        .ok_or_else(|| "state.delta payload must be a JSON object".to_string())?;
    let patch = payload
        .get("patch")
        .or_else(|| payload.get("ops"))
        .or_else(|| {
            payload
                .get("stateDelta")
                .and_then(Value::as_object)
                .and_then(|state_delta| state_delta.get("patch").or_else(|| state_delta.get("ops")))
        })
        .ok_or_else(|| "state.delta payload must include patch operations".to_string())?;
    let target = payload
        .get("target")
        .or_else(|| {
            payload
                .get("stateDelta")
                .and_then(Value::as_object)
                .and_then(|state_delta| state_delta.get("target"))
        })
        .ok_or_else(|| "state.delta payload must include target".to_string())?;

    Ok(compact_object(json!({
        "schemaVersion": payload_string(Some(payload), &["stateDeltaSchemaVersion", "schemaVersion"])
            .unwrap_or("lime-runtime-state-delta/v0.1"),
        "runtimeId": payload_string(Some(payload), &["runtimeId"]).unwrap_or("app-server"),
        "threadId": event.thread_id,
        "turnId": event.turn_id,
        "sequence": event.sequence,
        "baseEventId": payload_string(Some(payload), &["baseEventId", "base_event_id"]),
        "target": target,
        "patch": patch,
        "createdAt": event.timestamp,
    })))
}

fn runtime_event_validator() -> Result<&'static Validator, String> {
    RUNTIME_EVENT_VALIDATOR
        .get_or_init(|| compile_schema(RUNTIME_EVENT_SCHEMA))
        .as_ref()
        .map_err(Clone::clone)
}

fn state_delta_validator() -> Result<&'static Validator, String> {
    STATE_DELTA_VALIDATOR
        .get_or_init(|| compile_schema(STATE_DELTA_SCHEMA))
        .as_ref()
        .map_err(Clone::clone)
}

fn compile_schema(schema_source: &str) -> Result<Validator, String> {
    let schema = serde_json::from_str::<Value>(schema_source)
        .map_err(|error| format!("failed to parse AgentUI schema: {error}"))?;
    jsonschema::validator_for(&schema)
        .map_err(|error| format!("failed to compile AgentUI schema: {error}"))
}

fn validate_with_schema(label: &str, value: &Value, validator: &Validator) -> Result<(), String> {
    let errors = validator
        .iter_errors(value)
        .map(|error| format!("{}: {}", error.instance_path, error))
        .collect::<Vec<_>>();
    if errors.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "{label} schema validation failed: {}",
            errors.join("; ")
        ))
    }
}

fn normalize_event_class(event_type: &str) -> &str {
    match event_type {
        "message.created" => "message.created",
        "message.delta" | "message.delta_batch" | "message.batch" => "model.delta",
        "message" | "message.completed" | "item.completed" => "model.completed",
        "thinking.delta" => "reasoning.delta",
        "artifact.snapshot" => "artifact.changed",
        "runtime.status" => "run.status",
        "turn.canceled" => "turn.canceled",
        value => value,
    }
}

fn is_text_delta_fast_path_event(event_type: &str) -> bool {
    matches!(
        event_type,
        "message.created" | "message.delta" | "message.delta_batch" | "message.batch"
    )
}

fn kind_for_event_class(event_class: &str) -> &str {
    match event_class.split('.').next() {
        Some("action") => "action",
        Some("artifact") => "draft",
        Some("context") => "context",
        Some("evidence") | Some("review") => "evidence",
        Some("model") | Some("message") | Some("reasoning") => "model",
        Some("permission") => "permission",
        Some("sandbox") => "sandbox",
        Some("tool") => "tool",
        _ => "state",
    }
}

fn status_for_event_class(event_class: &str) -> &str {
    if event_class == "turn.canceled" {
        "canceled"
    } else if event_class.ends_with(".failed") {
        "failed"
    } else if event_class.ends_with(".completed")
        || event_class.ends_with(".result")
        || event_class.ends_with(".resolved")
        || is_action_terminal_event_class(event_class)
    {
        "completed"
    } else if event_class.ends_with(".required") {
        "blocked"
    } else if event_class.ends_with(".started")
        || event_class.ends_with(".delta")
        || event_class.ends_with(".progress")
    {
        "running"
    } else {
        "pending"
    }
}

fn is_action_terminal_event_class(event_class: &str) -> bool {
    matches!(
        event_class,
        "action.cancelled" | "action.canceled" | "action.expired"
    )
}

fn completed_at_for_event<'a>(event: &'a AgentEvent, event_class: &str) -> Option<&'a str> {
    if event_class.ends_with(".completed")
        || event_class.ends_with(".result")
        || event_class.ends_with(".failed")
        || event_class == "turn.canceled"
        || event_class.ends_with(".resolved")
        || is_action_terminal_event_class(event_class)
    {
        Some(event.timestamp.as_str())
    } else {
        None
    }
}

fn payload_object(value: &Value) -> Option<&serde_json::Map<String, Value>> {
    value.as_object()
}

fn payload_string<'a>(
    payload: Option<&'a serde_json::Map<String, Value>>,
    keys: &[&str],
) -> Option<&'a str> {
    payload.and_then(|payload| {
        keys.iter()
            .filter_map(|key| payload.get(*key))
            .find_map(Value::as_str)
            .filter(|value| !value.is_empty())
    })
}

fn payload_number(payload: Option<&serde_json::Map<String, Value>>, keys: &[&str]) -> Option<f64> {
    payload.and_then(|payload| {
        keys.iter()
            .filter_map(|key| payload.get(*key))
            .find_map(Value::as_f64)
            .filter(|value| value.is_finite())
    })
}

fn payload_array_non_empty<'a>(
    payload: Option<&'a serde_json::Map<String, Value>>,
    keys: &[&str],
) -> Option<&'a Vec<Value>> {
    payload.and_then(|payload| {
        keys.iter()
            .filter_map(|key| payload.get(*key))
            .find_map(Value::as_array)
            .filter(|value| !value.is_empty())
    })
}

fn compact_object(value: Value) -> Value {
    let Value::Object(object) = value else {
        return value;
    };
    Value::Object(
        object
            .into_iter()
            .filter(|(_, value)| !value.is_null())
            .collect::<Map<String, Value>>(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(event_type: &str, payload: Value) -> AgentEvent {
        AgentEvent {
            event_id: "evt_test".to_string(),
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
    fn validates_standard_runtime_event_projection() {
        validate_agent_event(&event("message.delta", json!({ "text": "hello" })))
            .expect("valid runtime event");
    }

    #[test]
    fn validates_text_delta_fast_path_variants() {
        for event_type in ["message.delta", "message.delta_batch", "message.batch"] {
            validate_agent_event(&event(
                event_type,
                json!({
                    "text": "hello",
                    "runtimeEventSchemaVersion": "lime-runtime-event/v0.1"
                }),
            ))
            .unwrap_or_else(|error| panic!("{event_type} should be valid: {error}"));
        }
    }

    #[test]
    fn rejects_invalid_text_delta_fast_path_payloads() {
        let error = validate_agent_event(&event("message.delta", json!("hello")))
            .expect_err("text delta payload must remain object-shaped");
        assert!(error.contains("message.delta payload must be a JSON object"));

        let mut empty_timestamp_event = event("message.delta", json!({ "text": "hello" }));
        empty_timestamp_event.timestamp.clear();
        let error = validate_agent_event(&empty_timestamp_event)
            .expect_err("text delta timestamp must remain constrained");
        assert!(error.contains("createdAt must not be empty"));

        let error = validate_agent_event(&event(
            "message.delta",
            json!({
                "text": "hello",
                "runtimeEventSchemaVersion": "wrong-version"
            }),
        ))
        .expect_err("text delta schema version override must remain constrained");
        assert!(error.contains("agent runtime event schema validation failed"));
    }

    #[test]
    fn validates_turn_canceled_as_current_terminal_event() {
        validate_agent_event(&event("turn.canceled", json!({ "status": "canceled" })))
            .expect("valid canceled terminal event");
    }

    #[test]
    fn validates_action_cancel_and_expiry_as_completed_action_events() {
        for event_type in ["action.cancelled", "action.canceled", "action.expired"] {
            let runtime_event =
                runtime_event_schema_value(&event(event_type, json!({ "actionId": "action_1" })));

            assert_eq!(runtime_event["eventClass"], event_type);
            assert_eq!(runtime_event["status"], "completed");
            assert!(runtime_event.get("completedAt").is_some());
            validate_agent_event(&event(event_type, json!({ "actionId": "action_1" })))
                .unwrap_or_else(|error| panic!("{event_type} should be valid: {error}"));
        }
    }

    #[test]
    fn rejects_legacy_turn_terminal_events_from_current_schema() {
        let runtime_event = runtime_event_schema_value(&event(
            "turn.final_done",
            json!({ "usage": { "total": 1 } }),
        ));

        assert_eq!(runtime_event["eventClass"], "turn.final_done");
        assert_eq!(runtime_event["status"], "pending");
        assert!(runtime_event.get("completedAt").is_none());

        for event_type in [
            "done",
            "final_done",
            "cancelled",
            "turn.done",
            "turn.final_done",
            "turn.cancelled",
        ] {
            let error = validate_agent_event(&event(event_type, json!({})))
                .expect_err("legacy terminal events must fail closed");
            assert!(
                error.contains("legacy runtime terminal event"),
                "unexpected error for {event_type}: {error}"
            );
        }
    }

    #[test]
    fn validates_state_delta_payload_against_agent_ui_schema() {
        validate_agent_event(&event(
            "state.delta",
            json!({
                "target": "projection",
                "patch": [{ "op": "add", "path": "/diagnostics/-", "value": "patched" }],
            }),
        ))
        .expect("valid state delta");
    }

    #[test]
    fn rejects_invalid_state_delta_payload() {
        let error = validate_agent_event(&event(
            "state.delta",
            json!({
                "target": "projection",
                "patch": [{ "op": "remove" }],
            }),
        ))
        .expect_err("invalid state delta should be rejected");

        assert!(error.contains("agent runtime state delta schema validation failed"));
    }

    #[test]
    fn validates_coding_event_payload_requirements() {
        for (event_type, payload) in [
            ("file.read", json!({ "path": "src/App.tsx" })),
            (
                "file.changed",
                json!({ "path": "src/App.tsx", "artifactId": "artifact_1" }),
            ),
            (
                "patch.failed",
                json!({ "patchId": "patch_1", "failureCategory": "conflict" }),
            ),
            (
                "command.output",
                json!({ "commandId": "cmd_1", "outputRef": "output://cmd_1" }),
            ),
            (
                "command.exited",
                json!({ "commandId": "cmd_1", "exitCode": 0 }),
            ),
            (
                "test.completed",
                json!({ "testRunId": "test_1", "result": "passed" }),
            ),
            (
                "sandbox.blocked",
                json!({ "reasonCode": "network_blocked" }),
            ),
            (
                "permission.denied",
                json!({ "reasonCode": "permission_denied" }),
            ),
        ] {
            validate_agent_event(&event(event_type, payload))
                .unwrap_or_else(|error| panic!("{event_type} should be valid: {error}"));
        }
    }

    #[test]
    fn rejects_incomplete_coding_event_payloads() {
        for (event_type, payload, expected) in [
            ("file.read", json!({}), "file.read events must include path"),
            (
                "file.changed",
                json!({ "artifactId": "artifact_1" }),
                "file.changed events must include path",
            ),
            (
                "file.changed",
                json!({ "path": "src/App.tsx" }),
                "file.changed events must include artifactId or artifactRefs",
            ),
            (
                "patch.failed",
                json!({ "patchId": "patch_1" }),
                "patch.failed events must include failureCategory",
            ),
            (
                "command.output",
                json!({ "commandId": "cmd_1" }),
                "command.output events must include outputRef or refIds",
            ),
            (
                "command.exited",
                json!({ "commandId": "cmd_1" }),
                "command.exited events must include exitCode or status",
            ),
            (
                "test.completed",
                json!({ "testRunId": "test_1" }),
                "test.completed events must include result or status",
            ),
            (
                "sandbox.blocked",
                json!({}),
                "sandbox.blocked events must include reasonCode",
            ),
            (
                "permission.denied",
                json!({}),
                "permission.denied events must include reasonCode",
            ),
        ] {
            let error = validate_agent_event(&event(event_type, payload))
                .expect_err("invalid coding event payload should fail");
            assert!(
                error.contains(expected),
                "unexpected error for {event_type}: {error}"
            );
        }
    }
}
