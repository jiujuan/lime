use chrono::{DateTime, Utc};
use lime_core::database::dao::agent_timeline::{AgentThreadItemStatus, AgentThreadTurnStatus};
use lime_core::database::DbConnection;
use lime_core::workspace::WorkspaceManager;
use std::path::Path;

use super::session_store_subagent_query::{
    load_child_subagent_session_projections, read_session_name_projection,
    read_subagent_session_projection,
};
use super::session_store_types::{normalize_optional_text, SessionDetail};
use crate::subagent_control::SubagentRuntimeStatusKind;
#[cfg(test)]
use crate::subagent_control::SubagentTurnStatus;
use crate::subagent_control::{load_subagent_runtime_status, SubagentRuntimeStatus};
use crate::subagent_profiles::SubagentSkillSummary;

const RUNTIME_ACTIVITY_ACTIVE_WINDOW_SECS: i64 = 30 * 60;

fn is_recent_runtime_timestamp(value: &str, now: DateTime<Utc>) -> bool {
    let Ok(timestamp) = DateTime::parse_from_rfc3339(value) else {
        return false;
    };
    let age_secs = now
        .signed_duration_since(timestamp.with_timezone(&Utc))
        .num_seconds();
    age_secs <= RUNTIME_ACTIVITY_ACTIVE_WINDOW_SECS
}

fn has_recent_runtime_activity_at(detail: &SessionDetail, now: DateTime<Utc>) -> bool {
    detail.turns.iter().any(|turn| {
        matches!(turn.status, AgentThreadTurnStatus::Running)
            && is_recent_runtime_timestamp(&turn.updated_at, now)
    }) || detail.items.iter().any(|item| {
        matches!(item.status, AgentThreadItemStatus::InProgress)
            && is_recent_runtime_timestamp(&item.updated_at, now)
    })
}

pub(crate) fn should_load_subagent_runtime_context(
    detail: &SessionDetail,
    history_limit: Option<usize>,
) -> bool {
    if detail.is_persisted_empty() {
        return false;
    }

    history_limit.is_none() || has_recent_runtime_activity_at(detail, Utc::now())
}

pub(crate) fn should_load_subagent_runtime_context_for_runtime_detail(
    detail: &SessionDetail,
    history_limit: Option<usize>,
) -> bool {
    should_load_subagent_runtime_context(detail, history_limit)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChildSubagentSession {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub session_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub working_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role_hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin_tool: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_from_turn_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blueprint_role_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blueprint_role_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_preset_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_contract: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub skill_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub skills: Vec<SubagentSkillSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_status: Option<ChildSubagentRuntimeStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_turn_status: Option<ChildSubagentRuntimeStatus>,
    #[serde(default, skip_serializing_if = "is_zero_usize")]
    pub queued_turn_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_phase: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_parallel_budget: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_active_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_queued_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_concurrency_group: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_parallel_budget: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub queue_reason: Option<String>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub retryable_overload: bool,
}

impl ChildSubagentSession {
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn new_base(
        id: String,
        name: String,
        created_at: i64,
        updated_at: i64,
        session_type: String,
        model: Option<String>,
        provider_name: Option<String>,
        working_dir: Option<String>,
        workspace_id: Option<String>,
    ) -> Self {
        Self {
            id,
            name,
            created_at,
            updated_at,
            session_type,
            model,
            provider_name,
            working_dir,
            workspace_id,
            task_summary: None,
            role_hint: None,
            origin_tool: None,
            created_from_turn_id: None,
            blueprint_role_id: None,
            blueprint_role_label: None,
            profile_id: None,
            profile_name: None,
            role_key: None,
            team_preset_id: None,
            theme: None,
            output_contract: None,
            skill_ids: Vec::new(),
            skills: Vec::new(),
            runtime_status: None,
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
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SubagentParentContext {
    pub parent_session_id: String,
    pub parent_session_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role_hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin_tool: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_from_turn_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blueprint_role_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blueprint_role_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_preset_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_contract: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub skill_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub skills: Vec<SubagentSkillSummary>,
    #[serde(default)]
    pub sibling_subagent_sessions: Vec<ChildSubagentSession>,
}

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ChildSubagentRuntimeStatus {
    Idle,
    Queued,
    Running,
    Completed,
    Failed,
    Aborted,
    Closed,
}

fn is_zero_usize(value: &usize) -> bool {
    *value == 0
}

fn is_false(value: &bool) -> bool {
    !*value
}

fn resolve_workspace_id_by_working_dir(
    db: &DbConnection,
    working_dir: Option<&str>,
) -> Option<String> {
    let resolved_working_dir = working_dir?.trim();
    if resolved_working_dir.is_empty() {
        return None;
    }

    let manager = WorkspaceManager::new(db.clone());
    match manager.get_by_path(Path::new(resolved_working_dir)) {
        Ok(workspace) => workspace.map(|entry| entry.id),
        Err(error) => {
            tracing::warn!(
                "[SessionStore] 解析 child subagent workspace 失败，已降级忽略: working_dir={}, error={}",
                resolved_working_dir,
                error
            );
            None
        }
    }
}

fn map_child_subagent_runtime_status(
    status: SubagentRuntimeStatusKind,
) -> Option<ChildSubagentRuntimeStatus> {
    match status {
        SubagentRuntimeStatusKind::Idle => Some(ChildSubagentRuntimeStatus::Idle),
        SubagentRuntimeStatusKind::Queued => Some(ChildSubagentRuntimeStatus::Queued),
        SubagentRuntimeStatusKind::Running => Some(ChildSubagentRuntimeStatus::Running),
        SubagentRuntimeStatusKind::Completed => Some(ChildSubagentRuntimeStatus::Completed),
        SubagentRuntimeStatusKind::Failed => Some(ChildSubagentRuntimeStatus::Failed),
        SubagentRuntimeStatusKind::Aborted => Some(ChildSubagentRuntimeStatus::Aborted),
        SubagentRuntimeStatusKind::Closed => Some(ChildSubagentRuntimeStatus::Closed),
        SubagentRuntimeStatusKind::NotFound => None,
    }
}

#[cfg(test)]
#[derive(Debug, Clone)]
pub(crate) struct ChildSubagentRuntimeTurnProjection {
    pub id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub status: SubagentTurnStatus,
}

#[cfg(test)]
pub(crate) fn resolve_child_subagent_runtime_status_from_turns(
    turns: &[ChildSubagentRuntimeTurnProjection],
) -> ChildSubagentRuntimeStatus {
    turns
        .iter()
        .max_by(|left, right| {
            left.updated_at
                .cmp(&right.updated_at)
                .then_with(|| left.created_at.cmp(&right.created_at))
                .then_with(|| left.id.cmp(&right.id))
        })
        .and_then(|turn| {
            map_child_subagent_runtime_status(match turn.status {
                SubagentTurnStatus::Queued => SubagentRuntimeStatusKind::Queued,
                SubagentTurnStatus::Running => SubagentRuntimeStatusKind::Running,
                SubagentTurnStatus::Completed => SubagentRuntimeStatusKind::Completed,
                SubagentTurnStatus::Failed => SubagentRuntimeStatusKind::Failed,
                SubagentTurnStatus::Aborted => SubagentRuntimeStatusKind::Aborted,
            })
        })
        .unwrap_or(ChildSubagentRuntimeStatus::Idle)
}

#[derive(Debug, Clone, Default)]
pub(crate) struct SubagentPresentationProjection {
    pub(crate) parent_session_id: String,
    pub(crate) task_summary: Option<String>,
    pub(crate) role_hint: Option<String>,
    pub(crate) origin_tool: Option<String>,
    pub(crate) created_from_turn_id: Option<String>,
    pub(crate) blueprint_role_id: Option<String>,
    pub(crate) blueprint_role_label: Option<String>,
    pub(crate) profile_id: Option<String>,
    pub(crate) profile_name: Option<String>,
    pub(crate) role_key: Option<String>,
    pub(crate) team_preset_id: Option<String>,
    pub(crate) theme: Option<String>,
    pub(crate) output_contract: Option<String>,
    pub(crate) skill_ids: Vec<String>,
    pub(crate) skills: Vec<SubagentSkillSummary>,
}

#[derive(Debug, Clone)]
pub(crate) struct SubagentSessionProjection {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) created_at: i64,
    pub(crate) updated_at: i64,
    pub(crate) session_type: String,
    pub(crate) model: Option<String>,
    pub(crate) provider_name: Option<String>,
    pub(crate) working_dir: Option<String>,
    pub(crate) presentation: SubagentPresentationProjection,
}

impl SubagentPresentationProjection {
    fn apply_to_child_summary(self, summary: &mut ChildSubagentSession) {
        summary.task_summary = self.task_summary;
        summary.role_hint = self.role_hint;
        summary.origin_tool = self.origin_tool;
        summary.created_from_turn_id = self.created_from_turn_id;
        summary.blueprint_role_id = self.blueprint_role_id;
        summary.blueprint_role_label = self.blueprint_role_label;
        summary.profile_id = self.profile_id;
        summary.profile_name = self.profile_name;
        summary.role_key = self.role_key;
        summary.team_preset_id = self.team_preset_id;
        summary.theme = self.theme;
        summary.output_contract = self.output_contract;
        summary.skill_ids = self.skill_ids;
        summary.skills = self.skills;
    }

    fn into_parent_context(
        self,
        parent_session_name: String,
        current_session_id: &str,
        sibling_subagent_sessions: Vec<ChildSubagentSession>,
    ) -> SubagentParentContext {
        SubagentParentContext {
            parent_session_id: self.parent_session_id,
            parent_session_name,
            role_hint: self.role_hint,
            task_summary: self.task_summary,
            origin_tool: self.origin_tool,
            created_from_turn_id: self.created_from_turn_id,
            blueprint_role_id: self.blueprint_role_id,
            blueprint_role_label: self.blueprint_role_label,
            profile_id: self.profile_id,
            profile_name: self.profile_name,
            role_key: self.role_key,
            team_preset_id: self.team_preset_id,
            theme: self.theme,
            output_contract: self.output_contract,
            skill_ids: self.skill_ids,
            skills: self.skills,
            sibling_subagent_sessions: filter_sibling_subagent_sessions(
                current_session_id,
                sibling_subagent_sessions,
            ),
        }
    }
}

fn filter_sibling_subagent_sessions(
    current_session_id: &str,
    sibling_subagent_sessions: Vec<ChildSubagentSession>,
) -> Vec<ChildSubagentSession> {
    sibling_subagent_sessions
        .into_iter()
        .filter(|session| session.id != current_session_id)
        .collect()
}

pub(crate) fn build_child_subagent_session_summary(
    db: Option<&DbConnection>,
    session: SubagentSessionProjection,
) -> ChildSubagentSession {
    let working_dir = normalize_optional_text(session.working_dir);
    let workspace_id =
        db.and_then(|conn| resolve_workspace_id_by_working_dir(conn, working_dir.as_deref()));

    let mut summary = ChildSubagentSession::new_base(
        session.id,
        session.name,
        session.created_at,
        session.updated_at,
        session.session_type,
        session.model,
        session.provider_name,
        working_dir,
        workspace_id,
    );
    session.presentation.apply_to_child_summary(&mut summary);
    summary
}

pub(crate) fn apply_runtime_status_to_child_subagent_session(
    summary: &mut ChildSubagentSession,
    status: SubagentRuntimeStatus,
) {
    summary.runtime_status = map_child_subagent_runtime_status(status.kind);
    summary.latest_turn_status = status
        .latest_turn_status
        .and_then(map_child_subagent_runtime_status);
    summary.queued_turn_count = status.queued_turn_count;
    summary.team_phase = status.team_phase;
    summary.team_parallel_budget = status.team_parallel_budget;
    summary.team_active_count = status.team_active_count;
    summary.team_queued_count = status.team_queued_count;
    summary.provider_concurrency_group = status.provider_concurrency_group;
    summary.provider_parallel_budget = status.provider_parallel_budget;
    summary.queue_reason = status.queue_reason;
    summary.retryable_overload = status.retryable_overload;
}

pub(crate) fn build_child_subagent_session_summaries(
    db: Option<&DbConnection>,
    sessions: Vec<SubagentSessionProjection>,
) -> Vec<ChildSubagentSession> {
    let mut summaries = sessions
        .into_iter()
        .map(|session| build_child_subagent_session_summary(db, session))
        .collect::<Vec<_>>();

    summaries.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then_with(|| left.id.cmp(&right.id))
    });
    summaries
}

pub(crate) fn build_subagent_parent_context(
    current_session_id: &str,
    parent_session_name: Option<String>,
    projection: SubagentPresentationProjection,
    sibling_subagent_sessions: Vec<ChildSubagentSession>,
) -> SubagentParentContext {
    let parent_session_name = parent_session_name
        .and_then(|name| normalize_optional_text(Some(name)))
        .unwrap_or_else(|| "父会话".to_string());

    projection.into_parent_context(
        parent_session_name,
        current_session_id,
        sibling_subagent_sessions,
    )
}

pub(crate) async fn load_child_subagent_sessions(
    db: &DbConnection,
    session_id: &str,
) -> Result<Vec<ChildSubagentSession>, String> {
    let sessions = load_child_subagent_session_projections(db, session_id)?;
    let mut summaries = build_child_subagent_session_summaries(Some(db), sessions);
    for summary in &mut summaries {
        match load_subagent_runtime_status(db, &summary.id).await {
            Ok(status) => apply_runtime_status_to_child_subagent_session(summary, status),
            Err(error) => {
                tracing::debug!(
                    "[SessionStore] child subagent runtime 状态不可用，按 idle 展示: session_id={}, error={}",
                    summary.id,
                    error
                );
            }
        }
    }
    Ok(summaries)
}

pub(crate) async fn load_subagent_parent_context(
    db: &DbConnection,
    session_id: &str,
    current_session: Option<SubagentSessionProjection>,
) -> Result<Option<SubagentParentContext>, String> {
    let current_session_owned;
    let current_session = match current_session {
        Some(session) => session,
        None => {
            current_session_owned =
                read_subagent_session_projection(db, session_id, "读取当前 subagent session 失败")?;
            let Some(current_session) = current_session_owned else {
                return Ok(None);
            };
            current_session
        }
    };
    let projection = current_session.presentation;
    let parent_session_id = projection.parent_session_id.clone();

    let parent_session_name = match read_session_name_projection(
        db,
        &parent_session_id,
        "读取 parent session 失败",
    ) {
        Ok(name) => name,
        Err(error) => {
            tracing::warn!(
                "[SessionStore] 读取 parent session 失败，已降级为匿名父会话: session_id={}, parent_session_id={}, error={}",
                session_id,
                parent_session_id,
                error
            );
            None
        }
    };

    let sibling_subagent_sessions = match load_child_subagent_sessions(db, &parent_session_id).await
    {
        Ok(sessions) => sessions,
        Err(error) => {
            tracing::warn!(
                "[SessionStore] 读取 sibling subagent sessions 失败，已降级为空列表: session_id={}, parent_session_id={}, error={}",
                session_id,
                parent_session_id,
                error
            );
            Vec::new()
        }
    };

    Ok(Some(build_subagent_parent_context(
        session_id,
        parent_session_name,
        projection,
        sibling_subagent_sessions,
    )))
}
