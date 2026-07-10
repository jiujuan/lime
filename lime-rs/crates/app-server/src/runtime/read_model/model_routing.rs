use super::super::{string_array_field, string_field};
use app_server_protocol::AgentEvent;
use serde_json::json;

pub(super) fn latest_model_routing_from_events(events: &[AgentEvent]) -> Option<serde_json::Value> {
    events
        .iter()
        .rev()
        .find(|event| {
            matches!(
                event.event_type.as_str(),
                "routing.decision.made" | "routing.fallback.applied" | "routing.not_possible"
            )
        })
        .map(model_routing_from_event)
}

fn model_routing_from_event(event: &AgentEvent) -> serde_json::Value {
    let mut routing = event
        .payload
        .get("routingDecision")
        .or_else(|| event.payload.get("routing_decision"))
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_else(|| event.payload.as_object().cloned().unwrap_or_default());

    merge_optional_payload_value(&mut routing, &event.payload, "modelSlot", "modelSlot");
    merge_optional_payload_value(&mut routing, &event.payload, "model_slot", "model_slot");
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "providerReadiness",
        "providerReadiness",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "provider_readiness",
        "provider_readiness",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "modelRegistry",
        "modelRegistry",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "model_registry",
        "model_registry",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "fallbackApplied",
        "fallbackApplied",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "fallback_applied",
        "fallback_applied",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "routingAttempts",
        "routingAttempts",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "routing_attempts",
        "routing_attempts",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "requestedSelection",
        "requestedSelection",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "requested_selection",
        "requested_selection",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "modelTaskRequest",
        "modelTaskRequest",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "model_task_request",
        "model_task_request",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "resolvedRoute",
        "resolvedRoute",
    );
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "resolved_route",
        "resolved_route",
    );
    merge_optional_payload_value(&mut routing, &event.payload, "routeFailure", "routeFailure");
    merge_optional_payload_value(
        &mut routing,
        &event.payload,
        "route_failure",
        "route_failure",
    );
    routing.insert(
        "sourceEventId".to_string(),
        serde_json::Value::String(event.event_id.clone()),
    );
    routing.insert(
        "source_event_id".to_string(),
        serde_json::Value::String(event.event_id.clone()),
    );
    routing.insert(
        "sourceEventType".to_string(),
        serde_json::Value::String(event.event_type.clone()),
    );
    routing.insert(
        "source_event_type".to_string(),
        serde_json::Value::String(event.event_type.clone()),
    );
    routing.insert(
        "timestamp".to_string(),
        serde_json::Value::String(event.timestamp.clone()),
    );
    if event.event_type == "routing.not_possible" {
        routing.insert(
            "status".to_string(),
            serde_json::Value::String("blocked".to_string()),
        );
    }

    serde_json::Value::Object(routing)
}

fn merge_optional_payload_value(
    routing: &mut serde_json::Map<String, serde_json::Value>,
    payload: &serde_json::Value,
    output_key: &str,
    payload_key: &str,
) {
    if let Some(value) = payload.get(payload_key) {
        routing.insert(output_key.to_string(), value.clone());
    }
}

pub(super) fn latest_provider_safety_buffering_from_events(
    events: &[AgentEvent],
) -> Option<serde_json::Value> {
    events
        .iter()
        .rev()
        .find_map(provider_safety_buffering_diagnostic_from_event)
}

fn provider_safety_buffering_diagnostic_from_event(
    event: &AgentEvent,
) -> Option<serde_json::Value> {
    if event.event_type != "provider_safety_buffering" {
        return None;
    }
    Some(json!({
        "source_event_id": event.event_id.clone(),
        "source_event_type": event.event_type.clone(),
        "thread_id": event.thread_id.clone(),
        "turn_id": event.turn_id.clone(),
        "timestamp": event.timestamp.clone(),
        "provider": string_field(&event.payload, &["provider"]),
        "model": string_field(&event.payload, &["model"]),
        "use_cases": string_array_field(&event.payload, &["useCases", "use_cases"]),
        "reasons": string_array_field(&event.payload, &["reasons"]),
        "show_buffering_ui": event
            .payload
            .get("showBufferingUi")
            .or_else(|| event.payload.get("show_buffering_ui"))
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false),
        "retry_model": string_field(&event.payload, &["retryModel", "retry_model"]),
        "fallback_header_model": string_field(
            &event.payload,
            &["fallbackHeaderModel", "fallback_header_model"],
        ),
        "source": string_field(&event.payload, &["source"]),
        "backend": string_field(&event.payload, &["backend"]),
    }))
}
