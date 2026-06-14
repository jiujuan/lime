use app_server_protocol::AgentSessionStatus;
use app_server_protocol::AgentTurnStatus;

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
