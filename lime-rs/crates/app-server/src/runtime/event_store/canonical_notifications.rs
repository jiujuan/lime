use super::super::{thread_item_projection, RuntimeCoreError, StoredSession};
use app_server_protocol::AgentEvent;

#[derive(Clone, Copy)]
enum CanonicalNotificationTarget {
    Turn,
    Item,
}

pub(super) fn notification_events_with_canonical_entities(
    stored: &StoredSession,
    events: &[AgentEvent],
) -> Result<Vec<AgentEvent>, RuntimeCoreError> {
    let mut history = Vec::with_capacity(stored.events.len() + events.len());
    history.extend(stored.events.iter().cloned());
    let mut notifications = Vec::with_capacity(events.len());

    for event in events {
        history.push(event.clone());
        let Some(target) = canonical_notification_target(event) else {
            notifications.push(event.clone());
            continue;
        };
        let changes = thread_item_projection::materialize_events(
            &history,
            &stored.session.session_id,
            &stored.session.thread_id,
        )
        .map_err(|error| {
            RuntimeCoreError::Backend(format!(
                "cannot materialize canonical notification for event {} ({}): {error}",
                event.event_id, event.event_type
            ))
        })?;
        let mut notification = event.clone();
        let payload = notification.payload.as_object_mut().ok_or_else(|| {
            RuntimeCoreError::Backend(format!(
                "cannot attach canonical notification entity to non-object payload for event {} ({})",
                event.event_id, event.event_type
            ))
        })?;

        match target {
            CanonicalNotificationTarget::Turn => {
                let turn_id = event.turn_id.as_deref().ok_or_else(|| {
                    RuntimeCoreError::Backend(format!(
                        "cannot materialize canonical turn notification without turn id for event {} ({})",
                        event.event_id, event.event_type
                    ))
                })?;
                let turn = changes
                    .changed_turns
                    .into_iter()
                    .find(|turn| turn.turn_id.as_str() == turn_id)
                    .ok_or_else(|| {
                        RuntimeCoreError::Backend(format!(
                            "canonical materializer produced no turn for event {} ({})",
                            event.event_id, event.event_type
                        ))
                    })?;
                payload.insert(
                    "turn".to_string(),
                    serde_json::to_value(turn).map_err(|error| {
                        RuntimeCoreError::Backend(format!(
                            "cannot serialize canonical turn for event {}: {error}",
                            event.event_id
                        ))
                    })?,
                );
            }
            CanonicalNotificationTarget::Item => {
                let item = changes
                    .changed_items
                    .into_iter()
                    .find(|item| item.sequence == event.sequence)
                    .ok_or_else(|| {
                        RuntimeCoreError::Backend(format!(
                            "canonical materializer produced no item for event {} ({})",
                            event.event_id, event.event_type
                        ))
                    })?;
                payload.insert(
                    "item".to_string(),
                    serde_json::to_value(item).map_err(|error| {
                        RuntimeCoreError::Backend(format!(
                            "cannot serialize canonical item for event {}: {error}",
                            event.event_id
                        ))
                    })?,
                );
            }
        }
        notifications.push(notification);
    }

    Ok(notifications)
}

fn canonical_notification_target(event: &AgentEvent) -> Option<CanonicalNotificationTarget> {
    let event_type = event.event_type.as_str();
    if matches!(
        event_type,
        "turn.accepted" | "turn.started" | "turn.completed" | "turn.failed" | "turn.canceled"
    ) {
        return Some(CanonicalNotificationTarget::Turn);
    }
    if matches!(
        event_type,
        "approval.session_cache.hit"
            | "item.removed"
            | "item.deleted"
            | "message.removed"
            | "tool.removed"
            | "turn.removed"
            | "turn.deleted"
    ) {
        return None;
    }
    if event.turn_id.is_none() {
        return None;
    }
    let item_lifecycle = [
        "item.",
        "message.",
        "reasoning.",
        "tool.",
        "mcp.",
        "collab.",
        "action.",
        "approval.",
        "command.",
        "patch.",
        "file.",
        "artifact.",
        "media.",
        "subagent.",
        "sub_agent.",
        "context.compaction",
    ]
    .iter()
    .any(|prefix| event_type.starts_with(prefix));
    item_lifecycle.then_some(CanonicalNotificationTarget::Item)
}

#[cfg(test)]
mod tests {
    use super::{canonical_notification_target, CanonicalNotificationTarget};
    use app_server_protocol::AgentEvent;
    use serde_json::json;

    fn event(event_type: &str) -> AgentEvent {
        AgentEvent {
            event_id: format!("event-{event_type}"),
            sequence: 1,
            session_id: "session-1".to_string(),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
            event_type: event_type.to_string(),
            timestamp: "2026-07-13T00:00:00Z".to_string(),
            payload: json!({}),
        }
    }

    #[test]
    fn approval_session_cache_hit_is_audit_only_notification() {
        assert!(canonical_notification_target(&event("approval.session_cache.hit")).is_none());
    }

    #[test]
    fn approval_resolution_remains_a_canonical_item_notification() {
        assert!(matches!(
            canonical_notification_target(&event("action.resolved")),
            Some(CanonicalNotificationTarget::Item)
        ));
    }
}
