use chrono::DateTime;
use chrono::Duration;
use chrono::Utc;

use app_server_protocol::AgentEvent;
use app_server_protocol::AgentSessionStatus;
use app_server_protocol::AgentTurn;
use app_server_protocol::AgentTurnStatus;

const STALE_RUNNING_TURN_AFTER_SECS: i64 = 30 * 60;

pub(super) fn agent_turn_is_active(status: AgentTurnStatus) -> bool {
    matches!(
        status,
        AgentTurnStatus::Accepted
            | AgentTurnStatus::Queued
            | AgentTurnStatus::Running
            | AgentTurnStatus::WaitingAction
    )
}

pub(super) fn agent_turn_is_terminal(status: AgentTurnStatus) -> bool {
    matches!(
        status,
        AgentTurnStatus::Completed | AgentTurnStatus::Failed | AgentTurnStatus::Canceled
    )
}

pub(super) fn agent_turn_blocks_queue_resume(status: AgentTurnStatus) -> bool {
    matches!(
        status,
        AgentTurnStatus::Accepted | AgentTurnStatus::Running | AgentTurnStatus::WaitingAction
    )
}

pub(super) fn agent_session_status_label(status: AgentSessionStatus) -> &'static str {
    match status {
        AgentSessionStatus::Idle => "idle",
        AgentSessionStatus::Running => "running",
        AgentSessionStatus::WaitingAction => "waitingAction",
        AgentSessionStatus::Completed => "completed",
        AgentSessionStatus::Failed => "failed",
        AgentSessionStatus::Canceled => "canceled",
    }
}

pub(super) fn agent_turn_status_label(status: AgentTurnStatus) -> &'static str {
    match status {
        AgentTurnStatus::Accepted => "accepted",
        AgentTurnStatus::Queued => "queued",
        AgentTurnStatus::Running => "running",
        AgentTurnStatus::WaitingAction => "waitingAction",
        AgentTurnStatus::Completed => "completed",
        AgentTurnStatus::Failed => "failed",
        AgentTurnStatus::Canceled => "canceled",
    }
}

pub(super) fn session_status_from_turn_status(turn_status: AgentTurnStatus) -> AgentSessionStatus {
    match turn_status {
        AgentTurnStatus::Accepted | AgentTurnStatus::Queued => AgentSessionStatus::Running,
        AgentTurnStatus::Running => AgentSessionStatus::Running,
        AgentTurnStatus::WaitingAction => AgentSessionStatus::WaitingAction,
        AgentTurnStatus::Completed => AgentSessionStatus::Completed,
        AgentTurnStatus::Failed => AgentSessionStatus::Failed,
        AgentTurnStatus::Canceled => AgentSessionStatus::Canceled,
    }
}

#[derive(Debug, Clone, Copy)]
pub(super) struct RuntimeTurnSnapshot<'a> {
    pub turn_id: &'a str,
    pub status: &'a str,
    pub started_at: Option<&'a str>,
    pub latest_activity_at: Option<&'a str>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(super) struct SessionRuntimeState {
    pub thread_status: String,
    pub latest_turn_status: Option<String>,
    pub active_turn_id: Option<String>,
    pub queued_turn_count: usize,
}

pub(super) fn resolve_session_runtime_state<'a>(
    session_status: &str,
    pending_request_count: usize,
    turns: impl IntoIterator<Item = RuntimeTurnSnapshot<'a>>,
    now: DateTime<Utc>,
) -> SessionRuntimeState {
    let turns = turns.into_iter().collect::<Vec<_>>();
    let session_status = normalize_session_runtime_status(session_status);
    let latest_turn_status = turns
        .last()
        .map(|turn| normalize_turn_runtime_status(turn.status));

    if session_runtime_status_is_terminal(session_status.as_str()) {
        return SessionRuntimeState {
            thread_status: canonical_terminal_status(session_status.as_str()).to_string(),
            latest_turn_status,
            active_turn_id: None,
            queued_turn_count: 0,
        };
    }

    let queued_turn_count = turns
        .iter()
        .filter(|turn| normalize_turn_runtime_status(turn.status) == "queued")
        .count();
    let has_waiting_turn = turns
        .iter()
        .any(|turn| normalize_turn_runtime_status(turn.status) == "waitingAction");
    let active_turn_id = turns
        .iter()
        .rev()
        .find(|turn| runtime_turn_has_active_activity(turn, now))
        .map(|turn| turn.turn_id.to_string());

    let thread_status = if pending_request_count > 0 || has_waiting_turn {
        "waitingAction"
    } else if active_turn_id.is_some() || queued_turn_count > 0 {
        "running"
    } else if matches!(
        session_status.as_str(),
        "running" | "active" | "waitingAction"
    ) {
        "idle"
    } else {
        session_status.as_str()
    };

    SessionRuntimeState {
        thread_status: thread_status.to_string(),
        latest_turn_status,
        active_turn_id,
        queued_turn_count,
    }
}

pub(super) fn resolve_agent_session_runtime_state(
    session_status: AgentSessionStatus,
    pending_request_count: usize,
    turns: &[AgentTurn],
    events: &[AgentEvent],
    now: DateTime<Utc>,
) -> SessionRuntimeState {
    resolve_session_runtime_state(
        agent_session_status_label(session_status),
        pending_request_count,
        turns
            .iter()
            .map(|turn| runtime_turn_state_from_agent_turn(turn, events)),
        now,
    )
}

pub(super) fn runtime_turn_state_from_agent_turn<'a>(
    turn: &'a AgentTurn,
    events: &'a [AgentEvent],
) -> RuntimeTurnSnapshot<'a> {
    RuntimeTurnSnapshot {
        turn_id: turn.turn_id.as_str(),
        status: agent_turn_status_label(turn.status),
        started_at: turn.started_at.as_deref(),
        latest_activity_at: latest_event_timestamp_for_turn(events, turn.turn_id.as_str()),
    }
}

fn runtime_turn_has_active_activity(turn: &RuntimeTurnSnapshot<'_>, now: DateTime<Utc>) -> bool {
    match normalize_turn_runtime_status(turn.status).as_str() {
        "queued" | "waitingAction" => true,
        "accepted" | "running" => {
            running_turn_has_recent_activity([turn.started_at, turn.latest_activity_at], now)
        }
        _ => false,
    }
}

fn normalize_session_runtime_status(status: &str) -> String {
    let normalized = normalize_runtime_status_token(status);
    match normalized.as_str() {
        "waitingaction" | "waiting_action" => "waitingAction".to_string(),
        "cancelled" | "aborted" => "canceled".to_string(),
        "" => "idle".to_string(),
        _ => normalized,
    }
}

fn normalize_turn_runtime_status(status: &str) -> String {
    let normalized = normalize_runtime_status_token(status);
    match normalized.as_str() {
        "waitingaction" | "waiting_action" => "waitingAction".to_string(),
        "cancelled" | "aborted" => "canceled".to_string(),
        "active" | "in_progress" | "processing" | "streaming" => "running".to_string(),
        "" => "running".to_string(),
        _ => normalized,
    }
}

fn normalize_runtime_status_token(status: &str) -> String {
    status.trim().to_lowercase().replace([' ', '-'], "_")
}

fn session_runtime_status_is_terminal(status: &str) -> bool {
    matches!(status, "completed" | "failed" | "canceled")
}

fn canonical_terminal_status(status: &str) -> &'static str {
    match status {
        "failed" => "failed",
        "canceled" => "canceled",
        _ => "completed",
    }
}

pub(super) fn running_turn_has_recent_activity<'a>(
    timestamps: impl IntoIterator<Item = Option<&'a str>>,
    now: DateTime<Utc>,
) -> bool {
    let latest = timestamps
        .into_iter()
        .flatten()
        .filter_map(parse_rfc3339_utc)
        .max();
    let Some(latest) = latest else {
        return true;
    };
    now.signed_duration_since(latest) <= Duration::seconds(STALE_RUNNING_TURN_AFTER_SECS)
}

fn parse_rfc3339_utc(raw: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(raw.trim())
        .ok()
        .map(|value| value.with_timezone(&Utc))
}

fn latest_event_timestamp_for_turn<'a>(events: &'a [AgentEvent], turn_id: &str) -> Option<&'a str> {
    events
        .iter()
        .rev()
        .find(|event| event.turn_id.as_deref() == Some(turn_id))
        .map(|event| event.timestamp.as_str())
}
