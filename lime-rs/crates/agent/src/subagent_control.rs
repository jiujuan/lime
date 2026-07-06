use crate::protocol::AgentTokenUsage;
use crate::runtime_support::{
    list_runtime_queued_turns, load_runtime_snapshot_overlay, runtime_queue_has_active_turn,
};
use crate::session_execution_runtime_query::read_session_execution_runtime_session_projection;
use crate::team_runtime_governor::snapshot_team_runtime_session;
#[cfg(test)]
use chrono::Utc;
use lime_core::database::DbConnection;
use rusqlite::OptionalExtension;
use serde_json::Value;

pub(crate) type SubagentRuntimeStatus =
    agent_runtime::session_execution::SubagentRuntimeStatus<AgentTokenUsage>;
pub(crate) type SubagentRuntimeStatusKind =
    agent_runtime::session_execution::SubagentRuntimeStatusKind;
pub(crate) type SubagentLatestTurnProjection =
    agent_runtime::session_execution::SubagentLatestTurnProjection;
pub(crate) type SubagentTurnStatus = agent_runtime::session_execution::SubagentTurnStatus;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default, PartialEq)]
struct SubagentControlState {
    #[serde(default)]
    closed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    closed_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    closed_reason: Option<String>,
}

impl SubagentControlState {
    const EXTENSION_NAME: &'static str = "subagent_control";
    const EXTENSION_VERSION: &'static str = "v0";

    fn from_extension_data_json(extension_data_json: &str) -> Option<Self> {
        let extension_data = serde_json::from_str::<Value>(extension_data_json).ok()?;
        let key = format!("{}.{}", Self::EXTENSION_NAME, Self::EXTENSION_VERSION);
        let value = extension_data.as_object()?.get(&key)?.clone();
        serde_json::from_value(value).ok()
    }

    #[cfg(test)]
    fn to_extension_data_json(&self) -> Result<String, String> {
        Ok(serde_json::json!({
            format!("{}.{}", Self::EXTENSION_NAME, Self::EXTENSION_VERSION): self,
        })
        .to_string())
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct SubagentRuntimeStatusInput {
    closed: bool,
    has_active_turn: bool,
    queued_turn_count: usize,
    latest_turn_status: Option<SubagentTurnStatus>,
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

fn resolve_session_usage(db: &DbConnection, session_id: &str) -> Option<AgentTokenUsage> {
    read_session_execution_runtime_session_projection(db, session_id)
        .ok()
        .flatten()
        .and_then(|session| session.usage)
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
    db: &DbConnection,
    session_id: &str,
) -> Result<SubagentRuntimeStatus, String> {
    let extension_data_json = read_subagent_extension_data_json(db, session_id)?;
    let Some(extension_data_json) = extension_data_json else {
        return Ok(SubagentRuntimeStatus::not_found(session_id));
    };
    let control_state =
        SubagentControlState::from_extension_data_json(&extension_data_json).unwrap_or_default();
    let latest_turn: Option<SubagentLatestTurnProjection> = match load_runtime_snapshot_overlay(
        session_id,
    )
    .await
    {
        Ok(overlay) => overlay.subagent_latest_turn,
        Err(error) => {
            tracing::debug!(
                "[SubagentControl] 读取 runtime snapshot overlay 失败，按无运行态继续: session_id={}, error={}",
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
    let has_active_turn = runtime_queue_has_active_turn(session_id)?;
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
        .then(|| resolve_session_usage(db, session_id))
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

fn read_subagent_extension_data_json(
    db: &DbConnection,
    session_id: &str,
) -> Result<Option<String>, String> {
    let conn = db
        .lock()
        .map_err(|error| format!("数据库锁定失败: {error}"))?;
    let row = conn
        .query_row(
            "SELECT extension_data_json, session_type FROM agent_sessions WHERE id = ?1",
            [session_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|error| format!("读取 subagent session 失败: {error}"))?;

    let Some((extension_data_json, session_type)) = row else {
        return Ok(None);
    };
    if session_type != "sub_agent" {
        return Err(format!(
            "会话不是 subagent session: session_id={session_id}, session_type={session_type}"
        ));
    }
    Ok(Some(extension_data_json))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subagent_control_state_roundtrip() {
        let state = SubagentControlState::closed(Some("manual_close".to_string()));

        let extension_data_json = state.to_extension_data_json().unwrap();
        let restored =
            SubagentControlState::from_extension_data_json(&extension_data_json).unwrap();

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
