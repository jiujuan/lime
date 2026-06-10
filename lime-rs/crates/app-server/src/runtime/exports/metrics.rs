use super::super::agent_session_status_label;
use super::super::agent_turn_status_label;
use super::super::event_request_id;
use super::super::string_field;
use super::HANDOFF_RECENT_ARTIFACT_LIMIT;
use app_server_protocol::AgentEvent;
use app_server_protocol::AgentSession;
use app_server_protocol::AgentSessionReadResponse;
use app_server_protocol::AgentTurn;
use app_server_protocol::AgentTurnStatus;
use app_server_protocol::ArtifactSummary;
use app_server_protocol::EvidencePackArtifact;
use app_server_protocol::EvidencePackSummary;
use app_server_protocol::ManagedObjective;
use app_server_protocol::ManagedObjectiveStatus;
use serde_json::json;
use std::collections::HashSet;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(super) struct HandoffMetrics {
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

pub(super) fn build_runtime_evidence_pack_summary(
    session: &AgentSession,
    turns: &[AgentTurn],
    events: &[AgentEvent],
    artifacts: &[ArtifactSummary],
    known_gap: &str,
) -> EvidencePackSummary {
    EvidencePackSummary {
        pack_relative_root: format!(".lime/harness/sessions/{}/evidence", session.session_id),
        pack_absolute_root: None,
        exported_at: super::super::timestamp(),
        thread_status: agent_session_status_label(session.status).to_string(),
        latest_turn_status: turns
            .last()
            .map(|turn| agent_turn_status_label(turn.status).to_string()),
        turn_count: turns.len(),
        item_count: events.len(),
        pending_request_count: pending_request_count_from_events(events),
        queued_turn_count: turns
            .iter()
            .filter(|turn| matches!(turn.status, AgentTurnStatus::Queued))
            .count(),
        recent_artifact_count: artifacts.len(),
        known_gaps: vec![known_gap.to_string()],
        observability_summary: Some(json!({
            "schemaVersion": "runtime-evidence-pack.v1",
            "source": "app-server-current",
            "sessionId": session.session_id,
            "threadId": session.thread_id,
        })),
        completion_audit_summary: None,
        artifacts: artifacts
            .iter()
            .map(evidence_pack_artifact_from_summary)
            .collect(),
    }
}

fn evidence_pack_artifact_from_summary(artifact: &ArtifactSummary) -> EvidencePackArtifact {
    let title = artifact
        .title
        .clone()
        .or_else(|| artifact.artifact_id.clone())
        .unwrap_or_else(|| artifact.artifact_ref.clone());
    let relative_path = artifact
        .path
        .clone()
        .unwrap_or_else(|| format!("{}/artifact.json", artifact.artifact_ref));
    EvidencePackArtifact {
        kind: artifact
            .kind
            .clone()
            .unwrap_or_else(|| "artifact".to_string()),
        title,
        relative_path,
        absolute_path: None,
        bytes: artifact
            .content
            .as_ref()
            .map(String::len)
            .unwrap_or_default(),
    }
}

fn pending_request_count_from_events(events: &[AgentEvent]) -> usize {
    let mut pending = HashSet::new();
    let mut resolved = HashSet::new();
    for event in events {
        match event.event_type.as_str() {
            "action.required" => {
                if let Some(request_id) = event_request_id(&event.payload) {
                    pending.insert(request_id);
                }
            }
            "action.resolved" | "action.cancelled" | "action.canceled" => {
                if let Some(request_id) = event_request_id(&event.payload) {
                    resolved.insert(request_id);
                }
            }
            _ => {}
        }
    }
    pending.difference(&resolved).count()
}

pub(super) fn current_objective_completion_audit_summary(
    objective: &ManagedObjective,
) -> Option<serde_json::Value> {
    let decision = managed_objective_completion_audit_decision(objective)?;
    let mut summary = serde_json::Map::new();
    summary.insert("decision".to_string(), json!(decision));
    summary.insert(
        "status".to_string(),
        json!(managed_objective_status_value(objective.status)),
    );
    if let Some(blocker_reason) = objective.blocker_reason.as_deref() {
        summary.insert("blockingReasons".to_string(), json!([blocker_reason]));
    }
    if let Some(last_audit_summary) = objective.last_audit_summary.as_deref() {
        summary.insert("summary".to_string(), json!(last_audit_summary));
        summary.insert("notes".to_string(), json!([last_audit_summary]));
    }
    summary.insert(
        "artifactCount".to_string(),
        json!(objective.last_artifact_refs.len()),
    );
    if !objective.last_artifact_refs.is_empty() {
        summary.insert(
            "artifactRefs".to_string(),
            json!(objective.last_artifact_refs),
        );
    }
    if let Some(evidence_ref) = objective.last_evidence_pack_ref.as_deref() {
        summary.insert("evidencePackRef".to_string(), json!(evidence_ref));
    }
    Some(serde_json::Value::Object(summary))
}

fn managed_objective_completion_audit_decision(
    objective: &ManagedObjective,
) -> Option<&'static str> {
    match objective.status {
        ManagedObjectiveStatus::BudgetLimited => Some("budget_limited"),
        ManagedObjectiveStatus::NeedsInput => Some("needs_input"),
        ManagedObjectiveStatus::Blocked => Some("blocked"),
        ManagedObjectiveStatus::Failed => Some("failed"),
        ManagedObjectiveStatus::Paused => Some("paused"),
        ManagedObjectiveStatus::Completed => objective
            .last_audit_summary
            .as_deref()
            .is_some_and(|summary| summary.contains("decision=completed"))
            .then_some("completed"),
        ManagedObjectiveStatus::Verifying => Some("verifying"),
        ManagedObjectiveStatus::Active => objective
            .last_audit_summary
            .as_deref()
            .and_then(completion_audit_decision_from_summary),
    }
}

fn completion_audit_decision_from_summary(summary: &str) -> Option<&'static str> {
    if summary.contains("decision=budget_limited") {
        Some("budget_limited")
    } else if summary.contains("decision=needs_input") {
        Some("needs_input")
    } else if summary.contains("decision=blocked") {
        Some("blocked")
    } else if summary.contains("decision=failed") {
        Some("failed")
    } else if summary.contains("decision=paused") {
        Some("paused")
    } else if summary.contains("decision=verifying") {
        Some("verifying")
    } else {
        None
    }
}

fn managed_objective_status_value(status: ManagedObjectiveStatus) -> &'static str {
    match status {
        ManagedObjectiveStatus::Active => "active",
        ManagedObjectiveStatus::Verifying => "verifying",
        ManagedObjectiveStatus::NeedsInput => "needs_input",
        ManagedObjectiveStatus::Blocked => "blocked",
        ManagedObjectiveStatus::BudgetLimited => "budget_limited",
        ManagedObjectiveStatus::Paused => "paused",
        ManagedObjectiveStatus::Completed => "completed",
        ManagedObjectiveStatus::Failed => "failed",
    }
}

pub(super) fn handoff_metrics(read: &AgentSessionReadResponse) -> HandoffMetrics {
    let mut metrics = HandoffMetrics {
        latest_turn_status: read
            .turns
            .last()
            .map(|turn| agent_turn_status_label(turn.status).to_string()),
        queued_turn_count: read
            .turns
            .iter()
            .filter(|turn| matches!(turn.status, AgentTurnStatus::Queued))
            .count(),
        ..HandoffMetrics::default()
    };

    let Some(detail) = read.detail.as_ref() else {
        return metrics;
    };
    let thread_read = detail.get("thread_read").filter(|value| value.is_object());
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
    if let Some(subagents) = detail
        .get("child_subagent_sessions")
        .or_else(|| detail.get("subagents"))
        .and_then(serde_json::Value::as_array)
    {
        metrics.active_subagent_count = subagents
            .iter()
            .filter(|item| {
                string_field(item, &["status", "runtime_status", "runtimeStatus"])
                    .map(|status| handoff_status_is_active(status.as_str()))
                    .unwrap_or(true)
            })
            .count();
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
    metrics
}

fn handoff_status_is_active(status: &str) -> bool {
    matches!(
        status,
        "accepted" | "queued" | "running" | "waitingAction" | "waiting_action" | "in_progress"
    )
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
