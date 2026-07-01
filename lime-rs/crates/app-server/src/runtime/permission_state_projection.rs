use super::event_request_id;
use super::string_field;
use super::StoredSession;
use app_server_protocol::AgentEvent;
use serde_json::{json, Value};

pub(super) fn permission_state_from_events(stored: &StoredSession) -> Option<Value> {
    let request_event = latest_permission_request(stored)?;
    let request_id = event_request_id(&request_event.payload)?;
    let resolved_event = latest_action_resolution(stored, &request_id);
    let mut state = request_event
        .payload
        .get("permission_state")
        .cloned()
        .or_else(|| {
            request_event
                .payload
                .pointer("/data/permission_state")
                .cloned()
        })
        .unwrap_or_else(|| {
            json!({
                "status": "requires_confirmation",
                "confirmation_status": "requested",
                "confirmation_request_id": request_id,
                "confirmation_source": "runtime_preflight",
            })
        });

    let Some(object) = state.as_object_mut() else {
        return None;
    };
    object
        .entry("status".to_string())
        .or_insert_with(|| Value::String("requires_confirmation".to_string()));
    object
        .entry("confirmation_request_id".to_string())
        .or_insert_with(|| Value::String(request_id.clone()));
    object
        .entry("confirmation_source".to_string())
        .or_insert_with(|| Value::String("runtime_preflight".to_string()));

    let confirmation_status = resolved_event
        .map(confirmation_status_from_resolution)
        .unwrap_or("requested");
    object.insert(
        "confirmation_status".to_string(),
        Value::String(confirmation_status.to_string()),
    );
    Some(Value::Object(object.clone()))
}

pub(super) fn should_cancel_denied_permission_action(
    stored: &StoredSession,
    request_id: &str,
    confirmed: bool,
) -> bool {
    if confirmed {
        return false;
    }
    latest_permission_request(stored)
        .and_then(|event| {
            (event_request_id(&event.payload).as_deref() == Some(request_id)).then_some(event)
        })
        .is_some()
}

fn latest_permission_request(stored: &StoredSession) -> Option<&AgentEvent> {
    stored.events.iter().rev().find(|event| {
        event.event_type == "action.required"
            && string_field(&event.payload, &["actionKind", "action_kind"]).as_deref()
                == Some("permission_preflight")
    })
}

fn latest_action_resolution<'a>(
    stored: &'a StoredSession,
    request_id: &str,
) -> Option<&'a AgentEvent> {
    stored.events.iter().rev().find(|event| {
        matches!(
            event.event_type.as_str(),
            "action.resolved" | "action.cancelled" | "action.canceled" | "action.expired"
        ) && event_request_id(&event.payload).as_deref() == Some(request_id)
    })
}

fn confirmation_status_from_resolution(event: &AgentEvent) -> &'static str {
    if matches!(
        event.event_type.as_str(),
        "action.cancelled" | "action.canceled" | "action.expired"
    ) {
        return "denied";
    }
    match string_field(&event.payload, &["decision"]).as_deref() {
        Some("deny") => "denied",
        _ if event
            .payload
            .get("confirmed")
            .and_then(Value::as_bool)
            .is_some_and(|confirmed| !confirmed) =>
        {
            "denied"
        }
        _ => "resolved",
    }
}
