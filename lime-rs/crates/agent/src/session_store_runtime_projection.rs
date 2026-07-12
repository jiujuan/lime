//! 运行态 timeline / usage 到持久会话详情的投影。

use lime_core::database::agent_session_repository::SessionRecordOverview;

use super::session_store_types::SessionInfo;
use crate::protocol::AgentMessage as RuntimeAgentMessage;

pub(super) fn build_runtime_session_info(overview: SessionRecordOverview) -> SessionInfo {
    let working_dir = overview.working_dir;
    let workspace_id = overview.workspace_id;
    let archived_at = overview.archived_at.and_then(|value| {
        chrono::DateTime::parse_from_rfc3339(&value)
            .map(|dt| dt.timestamp())
            .ok()
    });

    SessionInfo {
        id: overview.id,
        name: overview.title.unwrap_or_else(|| "未命名".to_string()),
        created_at: chrono::DateTime::parse_from_rfc3339(&overview.created_at)
            .map(|dt| dt.timestamp())
            .unwrap_or(0),
        updated_at: chrono::DateTime::parse_from_rfc3339(&overview.updated_at)
            .map(|dt| dt.timestamp())
            .unwrap_or(0),
        archived_at,
        messages_count: overview.messages_count,
        execution_strategy: overview.execution_strategy,
        model: Some(overview.model),
        working_dir,
        workspace_id,
    }
}

pub(super) fn apply_runtime_usage_fallback_to_latest_assistant_message(
    messages: &mut [RuntimeAgentMessage],
    usage: Option<crate::protocol::AgentTokenUsage>,
) -> Option<crate::protocol::AgentTokenUsage> {
    let usage = usage?;
    let latest_assistant_message = messages
        .iter_mut()
        .rev()
        .find(|message| message.role.eq_ignore_ascii_case("assistant"))?;

    if latest_assistant_message.usage.is_some() {
        return None;
    }

    latest_assistant_message.usage = Some(usage.clone());
    Some(usage)
}
