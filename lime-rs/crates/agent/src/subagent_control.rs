use crate::protocol::AgentTokenUsage;
use crate::runtime_support::{list_runtime_queued_turns, load_runtime_snapshot};
use crate::session_query::read_subagent_session;
use crate::subagent_runtime_adapter::project_aster_subagent_latest_turn;
use crate::team_runtime_governor::snapshot_team_runtime_session;
use aster::session::extension_data::{ExtensionData, ExtensionState};
use aster::session::{require_shared_session_runtime_queue_service, Session};
#[cfg(test)]
use chrono::Utc;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default, PartialEq)]
struct SubagentControlState {
    #[serde(default)]
    closed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    closed_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    closed_reason: Option<String>,
}

impl ExtensionState for SubagentControlState {
    const EXTENSION_NAME: &'static str = "subagent_control";
    const VERSION: &'static str = "v0";
}

impl SubagentControlState {
    fn from_extension_data(extension_data: &ExtensionData) -> Option<Self> {
        <Self as ExtensionState>::from_extension_data(extension_data)
    }

    fn from_session(session: &Session) -> Option<Self> {
        Self::from_extension_data(&session.extension_data)
    }

    #[cfg(test)]
    fn to_extension_data(&self, extension_data: &mut ExtensionData) -> Result<(), String> {
        <Self as ExtensionState>::to_extension_data(self, extension_data)
            .map_err(|error| error.to_string())
    }

    #[cfg(test)]
    fn closed(reason: Option<String>) -> Self {
        let closed_reason = reason
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        Self {
            closed: true,
            closed_at: Some(Utc::now().to_rfc3339()),
            closed_reason,
        }
    }
}

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SubagentRuntimeStatusKind {
    Idle,
    Queued,
    Running,
    Completed,
    Failed,
    Aborted,
    Closed,
    NotFound,
}

impl SubagentRuntimeStatusKind {
    pub(crate) fn is_final(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::Aborted | Self::Closed | Self::NotFound
        )
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub(crate) struct SubagentRuntimeStatus {
    pub session_id: String,
    pub kind: SubagentRuntimeStatusKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latest_turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latest_turn_status: Option<SubagentRuntimeStatusKind>,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub queued_turn_count: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub team_phase: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub team_parallel_budget: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub team_active_count: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub team_queued_count: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_concurrency_group: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_parallel_budget: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub queue_reason: Option<String>,
    #[serde(default)]
    pub retryable_overload: bool,
    #[serde(default)]
    pub closed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<AgentTokenUsage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_count: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result_ref: Option<String>,
}

impl SubagentRuntimeStatus {
    fn not_found(session_id: &str) -> Self {
        Self {
            session_id: session_id.to_string(),
            kind: SubagentRuntimeStatusKind::NotFound,
            latest_turn_id: None,
            latest_turn_status: None,
            queued_turn_count: 0,
            team_phase: None,
            team_parallel_budget: None,
            team_active_count: None,
            team_queued_count: None,
            provider_concurrency_group: None,
            provider_parallel_budget: None,
            queue_reason: None,
            retryable_overload: false,
            closed: false,
            usage: None,
            duration_ms: None,
            tool_count: None,
            result_ref: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SubagentLatestTurnProjection {
    pub turn_id: String,
    pub status: SubagentTurnStatus,
    pub duration_ms: Option<u64>,
    pub tool_count: usize,
    pub result_ref: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SubagentTurnStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Aborted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct SubagentRuntimeStatusInput {
    closed: bool,
    has_active_turn: bool,
    queued_turn_count: usize,
    latest_turn_status: Option<SubagentTurnStatus>,
}

fn is_zero(value: &usize) -> bool {
    *value == 0
}

fn looks_like_session_not_found(error: &str) -> bool {
    let normalized = error.to_ascii_lowercase();
    normalized.contains("not found") || error.contains("不存在")
}

fn map_turn_status(status: SubagentTurnStatus) -> SubagentRuntimeStatusKind {
    match status {
        SubagentTurnStatus::Queued => SubagentRuntimeStatusKind::Queued,
        SubagentTurnStatus::Running => SubagentRuntimeStatusKind::Running,
        SubagentTurnStatus::Completed => SubagentRuntimeStatusKind::Completed,
        SubagentTurnStatus::Failed => SubagentRuntimeStatusKind::Failed,
        SubagentTurnStatus::Aborted => SubagentRuntimeStatusKind::Aborted,
    }
}

fn resolve_session_usage(session: &Session) -> Option<AgentTokenUsage> {
    match (session.input_tokens, session.output_tokens) {
        (Some(input_tokens), Some(output_tokens)) if input_tokens >= 0 && output_tokens >= 0 => {
            Some(AgentTokenUsage {
                input_tokens: input_tokens as u32,
                output_tokens: output_tokens as u32,
                cached_input_tokens: session
                    .cached_input_tokens
                    .filter(|value| *value >= 0)
                    .map(|value| value as u32),
                cache_creation_input_tokens: session
                    .cache_creation_input_tokens
                    .filter(|value| *value >= 0)
                    .map(|value| value as u32),
            })
        }
        _ => None,
    }
}

fn derive_subagent_runtime_status_kind(
    input: SubagentRuntimeStatusInput,
) -> SubagentRuntimeStatusKind {
    if input.closed {
        return SubagentRuntimeStatusKind::Closed;
    }

    if input.has_active_turn {
        return SubagentRuntimeStatusKind::Running;
    }

    if input.queued_turn_count > 0 {
        return SubagentRuntimeStatusKind::Queued;
    }

    input
        .latest_turn_status
        .map(map_turn_status)
        .unwrap_or(SubagentRuntimeStatusKind::Idle)
}

pub(crate) async fn load_subagent_runtime_status(
    session_id: &str,
) -> Result<SubagentRuntimeStatus, String> {
    let session = match read_subagent_session(session_id, "读取 subagent session 失败").await {
        Ok(session) => session,
        Err(error) => {
            let message = error.to_string();
            if looks_like_session_not_found(&message) {
                return Ok(SubagentRuntimeStatus::not_found(session_id));
            }
            return Err(message);
        }
    };

    let control_state = SubagentControlState::from_session(&session).unwrap_or_default();
    let latest_turn = match load_runtime_snapshot(session_id).await {
        Ok(snapshot) => project_aster_subagent_latest_turn(&snapshot),
        Err(error) => {
            tracing::debug!(
                "[SubagentControl] 读取 runtime snapshot 失败，按无运行态继续: session_id={}, error={}",
                session_id,
                error
            );
            None
        }
    };

    let queued_turn_count = list_runtime_queued_turns(session_id).await?.len();
    let governor_snapshot = snapshot_team_runtime_session(session_id).await;
    let effective_queued_turn_count = queued_turn_count.max(
        governor_snapshot
            .as_ref()
            .and_then(|snapshot| (snapshot.team_phase == "queued").then_some(1))
            .unwrap_or(0),
    );
    let has_active_turn = require_shared_session_runtime_queue_service()
        .map_err(|error| format!("读取 runtime queue service 失败: {error}"))?
        .has_active_turn(session_id);
    let kind = if governor_snapshot
        .as_ref()
        .map(|snapshot| snapshot.team_phase == "queued")
        .unwrap_or(false)
    {
        SubagentRuntimeStatusKind::Queued
    } else {
        derive_subagent_runtime_status_kind(SubagentRuntimeStatusInput {
            closed: control_state.closed,
            has_active_turn,
            queued_turn_count: effective_queued_turn_count,
            latest_turn_status: latest_turn.as_ref().map(|turn| turn.status),
        })
    };

    let is_final_status = kind.is_final();
    let usage = is_final_status
        .then(|| resolve_session_usage(&session))
        .flatten();
    let duration_ms = is_final_status
        .then(|| latest_turn.as_ref().and_then(|turn| turn.duration_ms))
        .flatten();
    let tool_count = is_final_status
        .then(|| latest_turn.as_ref().map(|turn| turn.tool_count))
        .flatten();
    let result_ref = is_final_status
        .then(|| {
            latest_turn
                .as_ref()
                .and_then(|turn| turn.result_ref.clone())
        })
        .flatten();

    Ok(SubagentRuntimeStatus {
        session_id: session_id.to_string(),
        kind,
        latest_turn_id: latest_turn.as_ref().map(|turn| turn.turn_id.clone()),
        latest_turn_status: latest_turn
            .as_ref()
            .map(|turn| map_turn_status(turn.status)),
        queued_turn_count: effective_queued_turn_count,
        team_phase: governor_snapshot
            .as_ref()
            .map(|snapshot| snapshot.team_phase.clone()),
        team_parallel_budget: governor_snapshot
            .as_ref()
            .map(|snapshot| snapshot.team_parallel_budget),
        team_active_count: governor_snapshot
            .as_ref()
            .map(|snapshot| snapshot.team_active_count),
        team_queued_count: governor_snapshot
            .as_ref()
            .map(|snapshot| snapshot.team_queued_count),
        provider_concurrency_group: governor_snapshot
            .as_ref()
            .map(|snapshot| snapshot.provider_concurrency_group.clone()),
        provider_parallel_budget: governor_snapshot
            .as_ref()
            .map(|snapshot| snapshot.provider_parallel_budget),
        queue_reason: governor_snapshot
            .as_ref()
            .and_then(|snapshot| snapshot.queue_reason.clone()),
        retryable_overload: governor_snapshot
            .as_ref()
            .map(|snapshot| snapshot.retryable_overload)
            .unwrap_or(false),
        closed: control_state.closed,
        usage,
        duration_ms,
        tool_count,
        result_ref,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subagent_control_state_roundtrip() {
        let state = SubagentControlState::closed(Some("manual_close".to_string()));

        let mut extension_data = ExtensionData::default();
        state.to_extension_data(&mut extension_data).unwrap();
        let restored = SubagentControlState::from_extension_data(&extension_data).unwrap();

        assert_eq!(restored, state);
    }

    #[test]
    fn derive_subagent_runtime_status_kind_prioritizes_closed_and_final_states() {
        assert_eq!(
            derive_subagent_runtime_status_kind(SubagentRuntimeStatusInput {
                closed: true,
                has_active_turn: true,
                queued_turn_count: 2,
                latest_turn_status: Some(SubagentTurnStatus::Running),
            }),
            SubagentRuntimeStatusKind::Closed
        );
        assert_eq!(
            derive_subagent_runtime_status_kind(SubagentRuntimeStatusInput {
                closed: false,
                has_active_turn: false,
                queued_turn_count: 0,
                latest_turn_status: Some(SubagentTurnStatus::Completed),
            }),
            SubagentRuntimeStatusKind::Completed
        );
        assert_eq!(
            derive_subagent_runtime_status_kind(SubagentRuntimeStatusInput {
                closed: false,
                has_active_turn: false,
                queued_turn_count: 1,
                latest_turn_status: Some(SubagentTurnStatus::Completed),
            }),
            SubagentRuntimeStatusKind::Queued
        );
    }
}
