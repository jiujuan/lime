use agent_runtime::action_required::{PendingActionDescriptor, PendingActionStatus};
use app_server_protocol::{
    AgentEvent, AgentSessionActionScope, AgentSessionActionType, AgentSessionStatus,
    AgentTurnStatus,
};
use lime_agent::AgentActionRequiredScope;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq)]
pub(in crate::runtime) struct PendingActionIdentity {
    pub(in crate::runtime) action_type: AgentSessionActionType,
    pub(in crate::runtime) scope: AgentSessionActionScope,
}

pub(in crate::runtime) fn identity_from_stored_session(
    stored: &super::StoredSession,
    request_id: &str,
) -> Option<PendingActionIdentity> {
    if stored.session.status != AgentSessionStatus::WaitingAction {
        return None;
    }
    let event = pending_action_event(stored, request_id)?;
    identity_from_event(stored, event)
}

pub(in crate::runtime) fn from_stored_session(
    stored: &super::StoredSession,
    request_id: &str,
) -> Option<PendingActionDescriptor> {
    let identity = identity_from_stored_session(stored, request_id)?;
    let event = pending_action_event(stored, request_id)?;
    descriptor_from_event(event, identity)
}

fn pending_action_event<'a>(
    stored: &'a super::StoredSession,
    request_id: &str,
) -> Option<&'a AgentEvent> {
    stored.events.iter().rev().find_map(|event| {
        if string_from_keys(
            &event.payload,
            &["requestId", "request_id", "actionId", "action_id", "id"],
        )
        .as_deref()
            != Some(request_id)
        {
            return None;
        }
        match event.event_type.as_str() {
            "action.resolved" | "action.cancelled" | "action.canceled" | "action.expired" => {
                Some(None)
            }
            "action.required" => Some(Some(event)),
            _ => None,
        }
    })?
}

fn identity_from_event(
    stored: &super::StoredSession,
    event: &AgentEvent,
) -> Option<PendingActionIdentity> {
    let session_id = event.session_id.clone();
    let thread_id = event.thread_id.clone()?;
    let turn_id = event.turn_id.clone()?;
    if session_id != stored.session.session_id || thread_id != stored.session.thread_id {
        return None;
    }
    if !stored.turns.iter().any(|turn| {
        turn.turn_id == turn_id
            && turn.session_id == session_id
            && turn.thread_id == thread_id
            && turn.status == AgentTurnStatus::WaitingAction
    }) {
        return None;
    }
    let action_type = string_from_keys(&event.payload, &["actionType", "action_type"])
        .and_then(|action_type| action_type_from_name(&action_type))?;
    Some(PendingActionIdentity {
        action_type,
        scope: AgentSessionActionScope {
            session_id: Some(session_id),
            thread_id: Some(thread_id),
            turn_id: Some(turn_id),
        },
    })
}

fn descriptor_from_event(
    event: &AgentEvent,
    identity: PendingActionIdentity,
) -> Option<PendingActionDescriptor> {
    let payload = &event.payload;
    let data = payload.get("data").unwrap_or(payload);
    let request_id = string_from_keys(
        payload,
        &["requestId", "request_id", "actionId", "action_id", "id"],
    )?;
    let tool_id = string_from_keys(data, &["toolCallId", "tool_call_id", "toolId", "tool_id"])
        .or_else(|| {
            string_from_keys(
                payload,
                &["toolCallId", "tool_call_id", "toolId", "tool_id"],
            )
        });
    if identity.action_type == AgentSessionActionType::ToolConfirmation && tool_id.is_none() {
        return None;
    }
    let created_at_ms = [data, payload]
        .into_iter()
        .find_map(|value| {
            millis_from_keys(
                value,
                &["created_at_ms", "createdAtMs", "created_at", "createdAt"],
            )
        })
        .or_else(|| millis_from_timestamp(&event.timestamp))?;
    let deadline_at_ms = [data, payload].into_iter().find_map(|value| {
        millis_from_keys(
            value,
            &[
                "deadline_at_ms",
                "deadlineAtMs",
                "expires_at_ms",
                "expiresAtMs",
            ],
        )
    })?;
    Some(PendingActionDescriptor {
        request_id,
        action_type: action_type_name(identity.action_type).to_string(),
        tool_id,
        message: string_from_keys(data, &["prompt", "message", "title"])
            .or_else(|| string_from_keys(payload, &["prompt", "message", "title"])),
        requested_schema: data
            .get("requestedSchema")
            .or_else(|| data.get("requested_schema"))
            .or_else(|| payload.get("requestedSchema"))
            .or_else(|| payload.get("requested_schema"))
            .cloned(),
        available_decisions: [data, payload]
            .into_iter()
            .find_map(|value| {
                let decisions =
                    string_array_from_keys(value, &["availableDecisions", "available_decisions"]);
                (!decisions.is_empty()).then_some(decisions)
            })
            .unwrap_or_default(),
        scope: AgentActionRequiredScope::from_parts(
            identity.scope.session_id,
            identity.scope.thread_id,
            identity.scope.turn_id,
        ),
        created_at_ms: Some(created_at_ms),
        deadline_at_ms: Some(deadline_at_ms),
        status: PendingActionStatus::Pending,
    })
}

fn action_type_from_name(action_type: &str) -> Option<AgentSessionActionType> {
    match action_type {
        "tool_confirmation" => Some(AgentSessionActionType::ToolConfirmation),
        "ask_user" => Some(AgentSessionActionType::AskUser),
        "elicitation" => Some(AgentSessionActionType::Elicitation),
        _ => None,
    }
}

fn action_type_name(action_type: AgentSessionActionType) -> &'static str {
    match action_type {
        AgentSessionActionType::ToolConfirmation => "tool_confirmation",
        AgentSessionActionType::AskUser => "ask_user",
        AgentSessionActionType::Elicitation => "elicitation",
    }
}

fn string_from_keys(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(|value| {
            value
                .as_str()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
        })
}

fn string_array_from_keys(value: &Value, keys: &[&str]) -> Vec<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str().map(ToOwned::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

fn millis_from_keys(value: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(|value| {
            value.as_u64().or_else(|| {
                value
                    .as_str()
                    .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
                    .and_then(|value| u64::try_from(value.timestamp_millis()).ok())
            })
        })
}

fn millis_from_timestamp(timestamp: &str) -> Option<u64> {
    chrono::DateTime::parse_from_rfc3339(timestamp)
        .ok()
        .and_then(|value| u64::try_from(value.timestamp_millis()).ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::{AgentSession, AgentSessionStatus, AgentTurn};
    use serde_json::json;
    use std::collections::HashMap;

    fn stored_session() -> super::super::StoredSession {
        super::super::StoredSession {
            session: AgentSession {
                session_id: "session-1".to_string(),
                thread_id: "thread-1".to_string(),
                app_id: "agent".to_string(),
                workspace_id: None,
                business_object_ref: None,
                status: AgentSessionStatus::WaitingAction,
                created_at: "2026-07-12T15:00:00Z".to_string(),
                updated_at: "2026-07-12T15:00:00Z".to_string(),
            },
            turns: vec![AgentTurn {
                turn_id: "turn-1".to_string(),
                session_id: "session-1".to_string(),
                thread_id: "thread-1".to_string(),
                status: AgentTurnStatus::WaitingAction,
                started_at: Some("2026-07-12T15:00:00Z".to_string()),
                completed_at: None,
            }],
            turn_inputs: HashMap::new(),
            turn_runtime_options: HashMap::new(),
            events: vec![AgentEvent {
                event_id: "event-approval-1".to_string(),
                sequence: 1,
                session_id: "session-1".to_string(),
                thread_id: Some("thread-1".to_string()),
                turn_id: Some("turn-1".to_string()),
                event_type: "action.required".to_string(),
                timestamp: "2026-07-12T15:00:00Z".to_string(),
                payload: json!({
                    "requestId": "approval-1",
                    "actionType": "tool_confirmation",
                    "toolCallId": "tool-call-1",
                    "prompt": "Allow?",
                    "availableDecisions": ["allow_once", "decline"],
                    "deadlineAtMs": 1_999_999_999_999_u64,
                }),
            }],
            output_blobs: HashMap::new(),
        }
    }

    #[test]
    fn stored_session_requires_waiting_session_and_matching_turn_identity() {
        let stored = stored_session();
        let descriptor =
            from_stored_session(&stored, "approval-1").expect("stored pending descriptor");
        assert_eq!(descriptor.tool_id.as_deref(), Some("tool-call-1"));

        let mut idle = stored.clone();
        idle.session.status = AgentSessionStatus::Idle;
        assert!(from_stored_session(&idle, "approval-1").is_none());

        let mut wrong_session = stored.clone();
        wrong_session.turns[0].session_id = "other-session".to_string();
        assert!(from_stored_session(&wrong_session, "approval-1").is_none());

        let mut wrong_thread = stored.clone();
        wrong_thread.turns[0].thread_id = "other-thread".to_string();
        assert!(from_stored_session(&wrong_thread, "approval-1").is_none());

        let mut terminal = stored;
        terminal.events.push(AgentEvent {
            event_id: "event-approval-1-resolved".to_string(),
            sequence: 2,
            session_id: "session-1".to_string(),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
            event_type: "action.resolved".to_string(),
            timestamp: "2026-07-12T15:01:00Z".to_string(),
            payload: json!({ "requestId": "approval-1" }),
        });
        assert!(from_stored_session(&terminal, "approval-1").is_none());
    }
}
