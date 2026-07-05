use agent_protocol::turn_context::TurnOutputSchemaRuntime;

use crate::session_recent::{
    RecentHarnessContext, SessionExecutionRuntimeAccessMode, SessionExecutionRuntimePreferences,
    SessionExecutionRuntimeRecentTeamSelection,
};

#[derive(Debug, Clone, PartialEq)]
pub struct SessionExecutionRuntimeSessionProjection<Usage> {
    pub provider_name: Option<String>,
    pub model_name: Option<String>,
    pub usage: Option<Usage>,
    pub recent_access_mode: Option<SessionExecutionRuntimeAccessMode>,
    pub recent_preferences: Option<SessionExecutionRuntimePreferences>,
    pub recent_team_selection: Option<SessionExecutionRuntimeRecentTeamSelection>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SessionExecutionRuntimeSnapshotProjection<Context> {
    pub recent_harness_context: RecentHarnessContext,
    pub recent_access_mode: Option<SessionExecutionRuntimeAccessMode>,
    pub latest_turn: Option<SessionExecutionRuntimeTurnProjection<Context>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SessionExecutionRuntimeTurnProjection<Context> {
    pub id: String,
    pub status: String,
    pub context: Option<Context>,
    pub output_schema_runtime: Option<TurnOutputSchemaRuntime>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SubagentRuntimeStatusKind {
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
    pub fn is_final(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::Aborted | Self::Closed | Self::NotFound
        )
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct SubagentRuntimeStatus<Usage> {
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
    pub usage: Option<Usage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_count: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result_ref: Option<String>,
}

impl<Usage> SubagentRuntimeStatus<Usage> {
    pub fn not_found(session_id: &str) -> Self {
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

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct SubagentLatestTurnProjection {
    pub turn_id: String,
    pub status: SubagentTurnStatus,
    pub duration_ms: Option<u64>,
    pub tool_count: usize,
    pub result_ref: Option<String>,
}

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SubagentTurnStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Aborted,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RuntimeTimelineSnapshotProjection<Turn, Item> {
    pub thread_id: Option<String>,
    pub turns: Vec<Turn>,
    pub items: Vec<Item>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SessionRuntimeSnapshotOverlay<ExecutionSnapshot, TimelineSnapshot> {
    pub execution_snapshot: ExecutionSnapshot,
    pub timeline_snapshot: TimelineSnapshot,
    pub subagent_latest_turn: Option<SubagentLatestTurnProjection>,
}

fn is_zero(value: &usize) -> bool {
    *value == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session_recent::SessionExecutionRuntimeAccessMode;

    #[test]
    fn session_projection_carries_recent_runtime_state_without_backend_types() {
        let projection = SessionExecutionRuntimeSessionProjection::<()> {
            provider_name: Some("openai".to_string()),
            model_name: Some("gpt-5.1".to_string()),
            usage: None,
            recent_access_mode: Some(SessionExecutionRuntimeAccessMode::FullAccess),
            recent_preferences: None,
            recent_team_selection: None,
        };

        assert_eq!(projection.provider_name.as_deref(), Some("openai"));
        assert_eq!(
            projection.recent_access_mode,
            Some(SessionExecutionRuntimeAccessMode::FullAccess)
        );
    }

    #[test]
    fn timeline_snapshot_projection_is_generic_over_store_items() {
        let projection = RuntimeTimelineSnapshotProjection {
            thread_id: Some("thread-1".to_string()),
            turns: vec!["turn-1".to_string()],
            items: vec!["item-1".to_string()],
        };

        assert_eq!(projection.thread_id.as_deref(), Some("thread-1"));
        assert_eq!(projection.turns, vec!["turn-1"]);
        assert_eq!(projection.items, vec!["item-1"]);
    }

    #[test]
    fn runtime_snapshot_overlay_keeps_execution_and_timeline_views_together() {
        let overlay = SessionRuntimeSnapshotOverlay {
            execution_snapshot: "execution",
            timeline_snapshot: "timeline",
            subagent_latest_turn: Some(SubagentLatestTurnProjection {
                turn_id: "turn-1".to_string(),
                status: SubagentTurnStatus::Completed,
                duration_ms: Some(1250),
                tool_count: 2,
                result_ref: Some("agent-runtime://result".to_string()),
            }),
        };

        assert_eq!(overlay.execution_snapshot, "execution");
        assert_eq!(overlay.timeline_snapshot, "timeline");
        assert_eq!(
            overlay
                .subagent_latest_turn
                .as_ref()
                .map(|turn| turn.status),
            Some(SubagentTurnStatus::Completed)
        );
    }

    #[test]
    fn subagent_runtime_status_uses_stable_current_wire_states() {
        let status = SubagentRuntimeStatus::<()> {
            session_id: "child-1".to_string(),
            kind: SubagentRuntimeStatusKind::Completed,
            latest_turn_id: Some("turn-1".to_string()),
            latest_turn_status: Some(SubagentRuntimeStatusKind::Completed),
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
            duration_ms: Some(1250),
            tool_count: Some(2),
            result_ref: Some("agent-runtime://result".to_string()),
        };

        assert!(status.kind.is_final());
        assert_eq!(
            status.latest_turn_status,
            Some(SubagentRuntimeStatusKind::Completed)
        );
    }
}
