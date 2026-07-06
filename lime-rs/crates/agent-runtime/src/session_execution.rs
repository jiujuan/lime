use agent_protocol::turn_context::TurnOutputSchemaRuntime;
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::collections::HashMap;

use crate::session_recent::{
    extract_recent_access_mode_from_metadata, extract_recent_harness_context_from_metadata,
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

pub const SESSION_RECENT_ACCESS_MODE_EXTENSION_NAME: &str = "lime_recent_access_mode";
pub const SESSION_RECENT_PREFERENCES_EXTENSION_NAME: &str = "lime_recent_preferences";
pub const SESSION_RECENT_TEAM_SELECTION_EXTENSION_NAME: &str = "lime_recent_team_selection";
pub const SESSION_RECENT_EXTENSION_VERSION: &str = "v0";

#[derive(Debug, Clone, PartialEq)]
pub struct SessionExecutionRuntimeSessionSource<UsageSource> {
    pub provider_name: Option<String>,
    pub model_name: Option<String>,
    pub usage: Option<UsageSource>,
    pub recent_access_mode_state: Option<Value>,
    pub recent_preferences_state: Option<Value>,
    pub recent_team_selection_state: Option<Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SessionExecutionRuntimeUsageSource {
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cached_input_tokens: Option<i32>,
    pub cache_creation_input_tokens: Option<i32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SessionExecutionRuntimeUsageProjection {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cached_input_tokens: Option<u32>,
    pub cache_creation_input_tokens: Option<u32>,
}

pub fn project_session_execution_runtime_usage(
    source: SessionExecutionRuntimeUsageSource,
) -> Option<SessionExecutionRuntimeUsageProjection> {
    match (source.input_tokens, source.output_tokens) {
        (Some(input_tokens), Some(output_tokens)) if input_tokens >= 0 && output_tokens >= 0 => {
            Some(SessionExecutionRuntimeUsageProjection {
                input_tokens: input_tokens as u32,
                output_tokens: output_tokens as u32,
                cached_input_tokens: non_negative_i32_to_u32(source.cached_input_tokens),
                cache_creation_input_tokens: non_negative_i32_to_u32(
                    source.cache_creation_input_tokens,
                ),
            })
        }
        _ => None,
    }
}

fn non_negative_i32_to_u32(value: Option<i32>) -> Option<u32> {
    value.filter(|value| *value >= 0).map(|value| value as u32)
}

pub fn project_session_execution_runtime_session<Usage>(
    source: SessionExecutionRuntimeSessionSource<SessionExecutionRuntimeUsageSource>,
    project_usage: impl Fn(SessionExecutionRuntimeUsageSource) -> Option<Usage>,
) -> SessionExecutionRuntimeSessionProjection<Usage> {
    SessionExecutionRuntimeSessionProjection {
        provider_name: normalize_optional_text(source.provider_name),
        model_name: normalize_optional_text(source.model_name),
        usage: source.usage.and_then(project_usage),
        recent_access_mode: deserialize_session_runtime_state(
            source.recent_access_mode_state.as_ref(),
        ),
        recent_preferences: deserialize_session_runtime_state(
            source.recent_preferences_state.as_ref(),
        ),
        recent_team_selection: deserialize_session_runtime_state::<
            SessionExecutionRuntimeRecentTeamSelection,
        >(source.recent_team_selection_state.as_ref())
        .and_then(SessionExecutionRuntimeRecentTeamSelection::normalize),
    }
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    let trimmed = value?.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn deserialize_session_runtime_state<T>(value: Option<&Value>) -> Option<T>
where
    T: DeserializeOwned,
{
    serde_json::from_value(value?.clone()).ok()
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

#[derive(Debug, Clone, PartialEq)]
pub struct SessionExecutionRuntimeSnapshotSource<Context> {
    pub threads: Vec<SessionExecutionRuntimeThreadSource<Context>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SessionExecutionRuntimeThreadSource<Context> {
    pub updated_at_ms: i64,
    pub metadata: HashMap<String, Value>,
    pub turns: Vec<SessionExecutionRuntimeTurnSource<Context>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SessionExecutionRuntimeTurnSource<Context> {
    pub id: String,
    pub status: String,
    pub context: Option<Context>,
    pub output_schema_runtime: Option<TurnOutputSchemaRuntime>,
    pub error_message: Option<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub context_approval_policy: Option<String>,
    pub context_sandbox_policy: Option<String>,
    pub context_metadata: HashMap<String, Value>,
}

pub fn project_session_execution_runtime_snapshot<Context: Clone>(
    snapshot: &SessionExecutionRuntimeSnapshotSource<Context>,
) -> SessionExecutionRuntimeSnapshotProjection<Context> {
    SessionExecutionRuntimeSnapshotProjection {
        recent_harness_context: project_recent_harness_context_from_snapshot_source(snapshot),
        recent_access_mode: project_recent_access_mode_from_snapshot_source(snapshot),
        latest_turn: resolve_latest_session_execution_turn(snapshot)
            .map(project_session_execution_runtime_turn),
    }
}

fn project_session_execution_runtime_turn<Context: Clone>(
    turn: &SessionExecutionRuntimeTurnSource<Context>,
) -> SessionExecutionRuntimeTurnProjection<Context> {
    SessionExecutionRuntimeTurnProjection {
        id: turn.id.clone(),
        status: turn.status.clone(),
        context: turn.context.clone(),
        output_schema_runtime: turn.output_schema_runtime.clone(),
        error_message: turn.error_message.clone(),
    }
}

fn resolve_latest_session_execution_turn<Context>(
    snapshot: &SessionExecutionRuntimeSnapshotSource<Context>,
) -> Option<&SessionExecutionRuntimeTurnSource<Context>> {
    snapshot
        .threads
        .iter()
        .flat_map(|thread| thread.turns.iter())
        .max_by(|left, right| {
            left.updated_at_ms
                .cmp(&right.updated_at_ms)
                .then_with(|| left.created_at_ms.cmp(&right.created_at_ms))
                .then_with(|| left.id.cmp(&right.id))
        })
}

fn project_recent_access_mode_from_snapshot_source<Context>(
    snapshot: &SessionExecutionRuntimeSnapshotSource<Context>,
) -> Option<SessionExecutionRuntimeAccessMode> {
    snapshot
        .threads
        .iter()
        .flat_map(|thread| thread.turns.iter())
        .filter_map(|turn| {
            let access_mode = SessionExecutionRuntimeAccessMode::from_runtime_policies(
                turn.context_approval_policy.as_deref(),
                turn.context_sandbox_policy.as_deref(),
            )
            .or_else(|| extract_recent_access_mode_from_metadata(&turn.context_metadata))?;
            Some((turn.updated_at_ms, access_mode))
        })
        .max_by_key(|(updated_at_ms, _)| *updated_at_ms)
        .map(|(_, access_mode)| access_mode)
}

fn project_recent_harness_context_from_snapshot_source<Context>(
    snapshot: &SessionExecutionRuntimeSnapshotSource<Context>,
) -> RecentHarnessContext {
    let from_turn = snapshot
        .threads
        .iter()
        .flat_map(|thread| thread.turns.iter())
        .filter_map(|turn| {
            let context = extract_recent_harness_context_from_metadata(&turn.context_metadata);
            (!recent_harness_context_is_empty(&context)).then_some((turn.updated_at_ms, context))
        })
        .max_by_key(|(updated_at_ms, _)| *updated_at_ms)
        .map(|(_, context)| context)
        .unwrap_or_default();

    if recent_harness_context_is_complete(&from_turn) {
        return from_turn;
    }

    let from_thread = snapshot
        .threads
        .iter()
        .filter_map(|thread| {
            let context = extract_recent_harness_context_from_metadata(&thread.metadata);
            if recent_harness_context_is_empty(&context) {
                return None;
            }
            Some((thread.updated_at_ms, context))
        })
        .max_by_key(|(updated_at_ms, _)| *updated_at_ms)
        .map(|(_, context)| context)
        .unwrap_or_default();

    RecentHarnessContext {
        theme: from_turn.theme.or(from_thread.theme),
        session_mode: from_turn.session_mode.or(from_thread.session_mode),
        gate_key: from_turn.gate_key.or(from_thread.gate_key),
        run_title: from_turn.run_title.or(from_thread.run_title),
        content_id: from_turn.content_id.or(from_thread.content_id),
        response_language: from_turn
            .response_language
            .or(from_thread.response_language),
    }
}

fn recent_harness_context_is_complete(context: &RecentHarnessContext) -> bool {
    context.theme.is_some()
        && context.session_mode.is_some()
        && context.gate_key.is_some()
        && context.run_title.is_some()
        && context.content_id.is_some()
        && context.response_language.is_some()
}

fn recent_harness_context_is_empty(context: &RecentHarnessContext) -> bool {
    context.theme.is_none()
        && context.session_mode.is_none()
        && context.gate_key.is_none()
        && context.run_title.is_none()
        && context.content_id.is_none()
        && context.response_language.is_none()
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubagentRuntimeSnapshotProjection {
    pub threads: Vec<SubagentRuntimeThreadProjection>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubagentRuntimeThreadProjection {
    pub session_id: String,
    pub thread_id: String,
    pub turns: Vec<SubagentRuntimeTurnProjection>,
    pub items: Vec<SubagentRuntimeItemProjection>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubagentRuntimeTurnProjection {
    pub id: String,
    pub thread_id: String,
    pub status: SubagentTurnStatus,
    pub created_at_ms: i64,
    pub started_at_ms: Option<i64>,
    pub completed_at_ms: Option<i64>,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubagentRuntimeItemKind {
    ToolCall,
    AgentMessage,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubagentRuntimeItemKindSource {
    ToolCall,
    AgentMessage,
    Other,
}

pub fn project_subagent_runtime_item_kind(
    source: SubagentRuntimeItemKindSource,
) -> SubagentRuntimeItemKind {
    match source {
        SubagentRuntimeItemKindSource::ToolCall => SubagentRuntimeItemKind::ToolCall,
        SubagentRuntimeItemKindSource::AgentMessage => SubagentRuntimeItemKind::AgentMessage,
        SubagentRuntimeItemKindSource::Other => SubagentRuntimeItemKind::Other,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubagentRuntimeItemProjection {
    pub id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub sequence: i64,
    pub updated_at_ms: i64,
    pub kind: SubagentRuntimeItemKind,
}

pub fn project_subagent_latest_turn(
    snapshot: &SubagentRuntimeSnapshotProjection,
) -> Option<SubagentLatestTurnProjection> {
    snapshot
        .threads
        .iter()
        .flat_map(|thread| thread.turns.iter())
        .max_by(|left, right| {
            left.updated_at_ms
                .cmp(&right.updated_at_ms)
                .then_with(|| left.created_at_ms.cmp(&right.created_at_ms))
                .then_with(|| left.id.cmp(&right.id))
        })
        .map(|turn| SubagentLatestTurnProjection {
            turn_id: turn.id.clone(),
            status: turn.status,
            duration_ms: resolve_subagent_turn_duration_ms(turn),
            tool_count: count_subagent_tool_items_for_turn(snapshot, &turn.id),
            result_ref: resolve_subagent_worker_result_ref(snapshot, &turn.thread_id, &turn.id),
        })
}

fn resolve_subagent_turn_duration_ms(turn: &SubagentRuntimeTurnProjection) -> Option<u64> {
    let started_at_ms = turn.started_at_ms.unwrap_or(turn.created_at_ms);
    let finished_at_ms = turn.completed_at_ms.unwrap_or(turn.updated_at_ms);
    (finished_at_ms >= started_at_ms).then_some((finished_at_ms - started_at_ms) as u64)
}

fn count_subagent_tool_items_for_turn(
    snapshot: &SubagentRuntimeSnapshotProjection,
    turn_id: &str,
) -> usize {
    snapshot
        .threads
        .iter()
        .flat_map(|thread| thread.items.iter())
        .filter(|item| item.turn_id == turn_id && item.kind == SubagentRuntimeItemKind::ToolCall)
        .count()
}

fn build_runtime_item_ref(
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
    item_id: &str,
) -> String {
    format!("agent-runtime://session/{session_id}/thread/{thread_id}/turn/{turn_id}/item/{item_id}")
}

fn resolve_subagent_worker_result_ref(
    snapshot: &SubagentRuntimeSnapshotProjection,
    thread_id: &str,
    turn_id: &str,
) -> Option<String> {
    snapshot
        .threads
        .iter()
        .filter(|thread| thread.thread_id == thread_id)
        .flat_map(|thread| {
            thread
                .items
                .iter()
                .filter(move |item| {
                    item.turn_id == turn_id && item.kind == SubagentRuntimeItemKind::AgentMessage
                })
                .map(move |item| (thread.session_id.as_str(), item))
        })
        .max_by(|(_, left), (_, right)| {
            left.sequence
                .cmp(&right.sequence)
                .then_with(|| left.updated_at_ms.cmp(&right.updated_at_ms))
                .then_with(|| left.id.cmp(&right.id))
        })
        .map(|(session_id, item)| {
            build_runtime_item_ref(session_id, &item.thread_id, &item.turn_id, &item.id)
        })
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
        let projection = project_session_execution_runtime_session(
            SessionExecutionRuntimeSessionSource {
                provider_name: Some(" openai ".to_string()),
                model_name: Some(" gpt-5.1 ".to_string()),
                usage: Some(SessionExecutionRuntimeUsageSource {
                    input_tokens: Some(10),
                    output_tokens: Some(2),
                    cached_input_tokens: None,
                    cache_creation_input_tokens: None,
                }),
                recent_access_mode_state: Some(serde_json::json!("full-access")),
                recent_preferences_state: Some(serde_json::json!({
                    "webSearch": true,
                    "thinking": false,
                    "task": true,
                    "subagent": false
                })),
                recent_team_selection_state: Some(serde_json::json!({
                    "selectedTeamId": " team-a ",
                    "selectedTeamLabel": " Core "
                })),
            },
            |usage| Some((usage.input_tokens?, usage.output_tokens?)),
        );

        assert_eq!(projection.provider_name.as_deref(), Some("openai"));
        assert_eq!(projection.model_name.as_deref(), Some("gpt-5.1"));
        assert_eq!(projection.usage, Some((10, 2)));
        assert_eq!(
            projection.recent_access_mode,
            Some(SessionExecutionRuntimeAccessMode::FullAccess)
        );
        assert_eq!(
            projection.recent_preferences,
            Some(SessionExecutionRuntimePreferences {
                web_search: Some(true),
                thinking: Some(false),
                task: true,
                subagent: false,
            })
        );
        assert_eq!(
            projection
                .recent_team_selection
                .and_then(|team| team.selected_team_id),
            Some("team-a".to_string())
        );
    }

    #[test]
    fn project_session_execution_runtime_usage_keeps_token_rules_in_current_owner() {
        let usage = project_session_execution_runtime_usage(SessionExecutionRuntimeUsageSource {
            input_tokens: Some(31_000),
            output_tokens: Some(0),
            cached_input_tokens: Some(-1),
            cache_creation_input_tokens: Some(512),
        })
        .expect("应投影有效 usage");

        assert_eq!(usage.input_tokens, 31_000);
        assert_eq!(usage.output_tokens, 0);
        assert_eq!(usage.cached_input_tokens, None);
        assert_eq!(usage.cache_creation_input_tokens, Some(512));
        assert_eq!(
            project_session_execution_runtime_usage(SessionExecutionRuntimeUsageSource {
                input_tokens: Some(-1),
                output_tokens: Some(0),
                cached_input_tokens: None,
                cache_creation_input_tokens: None,
            }),
            None
        );
        assert_eq!(
            project_session_execution_runtime_usage(SessionExecutionRuntimeUsageSource {
                input_tokens: Some(31_000),
                output_tokens: None,
                cached_input_tokens: None,
                cache_creation_input_tokens: None,
            }),
            None
        );
    }

    #[test]
    fn project_session_execution_snapshot_keeps_recent_runtime_rules_in_current_owner() {
        let mut thread_metadata = HashMap::new();
        thread_metadata.insert(
            "harness".to_string(),
            serde_json::json!({
                "theme": "analysis",
                "sessionMode": "theme_workbench",
                "gateKey": "thread-gate",
                "runTitle": "Thread title",
                "contentId": "thread-content",
                "responseLanguage": "zh-CN"
            }),
        );
        let mut turn_metadata = HashMap::new();
        turn_metadata.insert(
            "harness".to_string(),
            serde_json::json!({
                "accessMode": "read-only",
                "theme": "runtime",
                "gateKey": "turn-gate"
            }),
        );
        let snapshot = SessionExecutionRuntimeSnapshotSource {
            threads: vec![SessionExecutionRuntimeThreadSource {
                updated_at_ms: 1_000,
                metadata: thread_metadata,
                turns: vec![
                    SessionExecutionRuntimeTurnSource {
                        id: "turn-old".to_string(),
                        status: "running".to_string(),
                        context: Some("old-context".to_string()),
                        output_schema_runtime: None,
                        error_message: None,
                        created_at_ms: 1_000,
                        updated_at_ms: 1_100,
                        context_approval_policy: None,
                        context_sandbox_policy: None,
                        context_metadata: HashMap::new(),
                    },
                    SessionExecutionRuntimeTurnSource {
                        id: "turn-new".to_string(),
                        status: "completed".to_string(),
                        context: Some("new-context".to_string()),
                        output_schema_runtime: None,
                        error_message: Some("done".to_string()),
                        created_at_ms: 1_200,
                        updated_at_ms: 1_500,
                        context_approval_policy: None,
                        context_sandbox_policy: Some("workspace-write".to_string()),
                        context_metadata: turn_metadata,
                    },
                ],
            }],
        };

        let projection = project_session_execution_runtime_snapshot(&snapshot);

        assert_eq!(
            projection.latest_turn.as_ref().map(|turn| turn.id.as_str()),
            Some("turn-new")
        );
        assert_eq!(
            projection.latest_turn.and_then(|turn| turn.context),
            Some("new-context".to_string())
        );
        assert_eq!(
            projection.recent_access_mode,
            Some(SessionExecutionRuntimeAccessMode::Current)
        );
        assert_eq!(
            projection.recent_harness_context.theme.as_deref(),
            Some("runtime")
        );
        assert_eq!(
            projection.recent_harness_context.session_mode.as_deref(),
            Some("general_workbench")
        );
        assert_eq!(
            projection.recent_harness_context.gate_key.as_deref(),
            Some("turn-gate")
        );
        assert_eq!(
            projection.recent_harness_context.run_title.as_deref(),
            Some("Thread title")
        );
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

    #[test]
    fn project_subagent_latest_turn_keeps_runtime_rules_in_current_owner() {
        let snapshot = SubagentRuntimeSnapshotProjection {
            threads: vec![SubagentRuntimeThreadProjection {
                session_id: "child-1".to_string(),
                thread_id: "thread-1".to_string(),
                turns: vec![SubagentRuntimeTurnProjection {
                    id: "turn-1".to_string(),
                    thread_id: "thread-1".to_string(),
                    status: SubagentTurnStatus::Completed,
                    created_at_ms: 1_000,
                    started_at_ms: Some(1_100),
                    completed_at_ms: Some(2_350),
                    updated_at_ms: 2_350,
                }],
                items: vec![
                    SubagentRuntimeItemProjection {
                        id: "item-tool-1".to_string(),
                        thread_id: "thread-1".to_string(),
                        turn_id: "turn-1".to_string(),
                        sequence: 1,
                        updated_at_ms: 1_500,
                        kind: SubagentRuntimeItemKind::ToolCall,
                    },
                    SubagentRuntimeItemProjection {
                        id: "item-result-1".to_string(),
                        thread_id: "thread-1".to_string(),
                        turn_id: "turn-1".to_string(),
                        sequence: 2,
                        updated_at_ms: 2_300,
                        kind: SubagentRuntimeItemKind::AgentMessage,
                    },
                ],
            }],
        };

        let projection = project_subagent_latest_turn(&snapshot).expect("应存在 latest turn");

        assert_eq!(projection.turn_id, "turn-1");
        assert_eq!(projection.status, SubagentTurnStatus::Completed);
        assert_eq!(projection.duration_ms, Some(1_250));
        assert_eq!(projection.tool_count, 1);
        assert_eq!(
            projection.result_ref.as_deref(),
            Some("agent-runtime://session/child-1/thread/thread-1/turn/turn-1/item/item-result-1")
        );
    }

    #[test]
    fn project_subagent_runtime_item_kind_keeps_payload_kind_rule_current() {
        assert_eq!(
            project_subagent_runtime_item_kind(SubagentRuntimeItemKindSource::ToolCall),
            SubagentRuntimeItemKind::ToolCall
        );
        assert_eq!(
            project_subagent_runtime_item_kind(SubagentRuntimeItemKindSource::AgentMessage),
            SubagentRuntimeItemKind::AgentMessage
        );
        assert_eq!(
            project_subagent_runtime_item_kind(SubagentRuntimeItemKindSource::Other),
            SubagentRuntimeItemKind::Other
        );
    }
}
