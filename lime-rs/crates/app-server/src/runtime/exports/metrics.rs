use super::super::status::agent_session_status_label;
use super::super::status::agent_turn_status_label;
use super::super::string_field;
use super::super::RuntimeCore;
use super::super::RuntimeCoreError;
use super::HANDOFF_RECENT_ARTIFACT_LIMIT;
use agent_protocol::CollabAgentStatus;
use agent_protocol::ThreadId;
use agent_protocol::ThreadTurnsView;
use app_server_protocol::AgentSessionReadResponse;
use app_server_protocol::AgentTurnStatus;
use std::collections::HashSet;
use thread_store::AgentGraphStore;
use thread_store::ReadThreadParams;
use thread_store::ThreadSpawnEdgeStatus;
use thread_store::ThreadStore;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(super) struct HandoffMetrics {
    pub(super) thread_status: String,
    pub(super) latest_turn_status: Option<String>,
    pub(super) pending_request_count: usize,
    pub(super) queued_turn_count: usize,
    pub(super) active_subagent_count: usize,
    pub(super) todo_total: usize,
    pub(super) todo_pending: usize,
    pub(super) todo_in_progress: usize,
    pub(super) todo_completed: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct HandoffRecentArtifact {
    pub(super) title: String,
    pub(super) kind: String,
    pub(super) path: String,
}

pub(super) async fn handoff_metrics(
    runtime: &RuntimeCore,
    read: &AgentSessionReadResponse,
) -> Result<HandoffMetrics, RuntimeCoreError> {
    let mut metrics = HandoffMetrics {
        thread_status: agent_session_status_label(read.session.status).to_string(),
        latest_turn_status: read
            .turns
            .last()
            .map(|turn| agent_turn_status_label(turn.status).to_string()),
        queued_turn_count: read
            .turns
            .iter()
            .filter(|turn| matches!(turn.status, AgentTurnStatus::Queued))
            .count(),
        active_subagent_count: canonical_active_subagent_count(runtime, &read.session.thread_id)
            .await?,
        ..HandoffMetrics::default()
    };

    let Some(detail) = read.detail.as_ref() else {
        return Ok(metrics);
    };
    let thread_read = detail.get("thread_read").filter(|value| value.is_object());
    if let Some(thread_status) =
        thread_read.and_then(|value| string_field(value, &["status", "thread_status"]))
    {
        metrics.thread_status = thread_status;
    }
    if let Some(latest_turn_status) = thread_read
        .and_then(|value| value.get("diagnostics"))
        .and_then(|value| string_field(value, &["latest_turn_status", "latestTurnStatus"]))
    {
        metrics.latest_turn_status = Some(latest_turn_status);
    }
    if let Some(pending_requests) = thread_read
        .and_then(|value| value.get("pending_requests"))
        .or_else(|| detail.get("pending_requests"))
        .and_then(serde_json::Value::as_array)
    {
        metrics.pending_request_count = pending_requests.len();
    }
    if let Some(queued_turns) = thread_read
        .and_then(|value| value.get("queued_turns"))
        .or_else(|| detail.get("queued_turns"))
        .and_then(serde_json::Value::as_array)
    {
        metrics.queued_turn_count = queued_turns.len();
    }
    if let Some(todo_items) = detail
        .get("todo_items")
        .or_else(|| detail.get("todoItems"))
        .and_then(serde_json::Value::as_array)
    {
        metrics.todo_total = todo_items.len();
        for item in todo_items {
            match string_field(item, &["status"])
                .unwrap_or_else(|| "pending".to_string())
                .as_str()
            {
                "completed" | "complete" | "done" => metrics.todo_completed += 1,
                "in_progress" | "inProgress" | "running" | "active" => {
                    metrics.todo_in_progress += 1
                }
                _ => metrics.todo_pending += 1,
            }
        }
    }
    Ok(metrics)
}

async fn canonical_active_subagent_count(
    runtime: &RuntimeCore,
    parent_thread_id: &str,
) -> Result<usize, RuntimeCoreError> {
    let Some(store) = runtime.projection_store.as_deref() else {
        return Ok(0);
    };
    let children = store
        .list_thread_spawn_children(
            ThreadId::new(parent_thread_id),
            Some(ThreadSpawnEdgeStatus::Open),
        )
        .await
        .map_err(canonical_store_error)?;
    let mut active = 0;
    for child_thread_id in children {
        let child = store
            .read_thread(ReadThreadParams {
                thread_id: child_thread_id,
                include_archived: false,
                turns_view: ThreadTurnsView::Summary,
            })
            .await
            .map_err(canonical_store_error)?;
        if child
            .and_then(|thread| thread.agent_state)
            .is_some_and(|state| canonical_subagent_status_is_active(state.status))
        {
            active += 1;
        }
    }
    Ok(active)
}

fn canonical_subagent_status_is_active(status: CollabAgentStatus) -> bool {
    match status {
        CollabAgentStatus::PendingInit | CollabAgentStatus::Running => true,
        CollabAgentStatus::Interrupted
        | CollabAgentStatus::Completed
        | CollabAgentStatus::Errored
        | CollabAgentStatus::Shutdown
        | CollabAgentStatus::NotFound => false,
    }
}

fn canonical_store_error(error: thread_store::ThreadStoreError) -> RuntimeCoreError {
    RuntimeCoreError::Backend(error.to_string())
}

pub(super) fn handoff_recent_artifacts(
    read: &AgentSessionReadResponse,
) -> Vec<HandoffRecentArtifact> {
    let Some(detail) = read.detail.as_ref() else {
        return Vec::new();
    };
    let artifacts = detail
        .pointer("/thread_read/artifacts")
        .or_else(|| detail.get("artifacts"))
        .and_then(serde_json::Value::as_array);
    let Some(artifacts) = artifacts else {
        return Vec::new();
    };

    let mut recent = Vec::new();
    let mut seen = HashSet::new();
    for artifact in artifacts.iter().rev() {
        let path = string_field(artifact, &["path", "relativePath", "relative_path"])
            .or_else(|| string_field(artifact, &["artifactRef", "artifact_ref"]));
        let Some(path) = path else {
            continue;
        };
        if !seen.insert(path.clone()) {
            continue;
        }
        let title = string_field(artifact, &["title"])
            .unwrap_or_else(|| path.rsplit('/').next().unwrap_or(path.as_str()).to_string());
        let kind = string_field(artifact, &["kind"]).unwrap_or_else(|| "artifact".to_string());
        recent.push(HandoffRecentArtifact { title, kind, path });
        if recent.len() >= HANDOFF_RECENT_ARTIFACT_LIMIT {
            break;
        }
    }
    recent.reverse();
    recent
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_subagent_status_mapping_is_exhaustive() {
        for status in [CollabAgentStatus::PendingInit, CollabAgentStatus::Running] {
            assert!(canonical_subagent_status_is_active(status));
        }
        for status in [
            CollabAgentStatus::Interrupted,
            CollabAgentStatus::Completed,
            CollabAgentStatus::Errored,
            CollabAgentStatus::Shutdown,
            CollabAgentStatus::NotFound,
        ] {
            assert!(!canonical_subagent_status_is_active(status));
        }
    }
}
