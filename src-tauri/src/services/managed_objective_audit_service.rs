//! Managed Objective completion audit 计算。
//!
//! 只把现有 runtime / artifact / evidence pack facts 归并成目标审计回写，
//! 不引入新的调度器或事实源。

use crate::commands::aster_agent_cmd::AgentRuntimeThreadReadModel;
use crate::services::runtime_evidence_pack_service::RuntimeEvidencePackExportResult;
use lime_core::database::managed_objective_repository::{
    ManagedObjectiveAuditUpdate, ManagedObjectiveRecord, ManagedObjectiveStatus,
};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
struct ManagedObjectiveAuditDecision {
    decision: String,
    blocking_reasons: Vec<String>,
    notes: Vec<String>,
}

pub(crate) fn build_managed_objective_audit_update(
    objective: &ManagedObjectiveRecord,
    thread_read: &AgentRuntimeThreadReadModel,
    evidence_pack: &RuntimeEvidencePackExportResult,
) -> ManagedObjectiveAuditUpdate {
    let completion_audit_summary = &evidence_pack.completion_audit_summary;
    let mut audit_decision =
        resolve_managed_objective_audit_decision(objective, completion_audit_summary);

    let pending_request_count = thread_read.pending_requests.len();
    if pending_request_count > 0 {
        audit_decision.decision = "needs_input".to_string();
        push_unique_text(&mut audit_decision.blocking_reasons, "pending_user_request");
        audit_decision
            .notes
            .push("当前会话仍有待处理请求，目标审计不能标记 completed。".to_string());
    }

    let status = resolve_objective_status_after_audit(
        objective.status,
        audit_decision.decision.as_str(),
        pending_request_count,
    );
    let blocker_reason = resolve_blocker_reason(
        objective,
        status,
        pending_request_count,
        &audit_decision.blocking_reasons,
    );

    ManagedObjectiveAuditUpdate {
        status,
        last_audit_summary: Some(build_audit_summary_text(
            audit_decision.decision.as_str(),
            pending_request_count,
            evidence_pack,
            &audit_decision.blocking_reasons,
            &audit_decision.notes,
        )),
        last_evidence_pack_ref: Some(evidence_pack.pack_absolute_root.clone()),
        last_artifact_refs: evidence_pack
            .artifacts
            .iter()
            .map(|artifact| artifact.absolute_path.clone())
            .collect(),
        blocker_reason,
    }
}

fn resolve_managed_objective_audit_decision(
    objective: &ManagedObjectiveRecord,
    completion_audit_summary: &Value,
) -> ManagedObjectiveAuditDecision {
    let mut decision = completion_audit_summary
        .get("decision")
        .and_then(Value::as_str)
        .unwrap_or("verifying")
        .to_string();
    let mut blocking_reasons = collect_string_array_field(
        completion_audit_summary,
        &["blockingReasons", "blocking_reasons"],
    );
    let mut notes = collect_string_array_field(completion_audit_summary, &["notes"]);

    if decision == "completed" && !has_objective_completion_evidence(completion_audit_summary) {
        decision = "verifying".to_string();
        push_unique_text(
            &mut blocking_reasons,
            "missing_objective_completion_evidence",
        );
        notes.push(
            "缺少 artifact / timeline / tool call / controlled evidence，不能把目标标记为 completed。"
                .to_string(),
        );
    }

    if decision == "completed"
        && !objective_success_criteria_are_satisfied(objective, completion_audit_summary)
    {
        decision = "verifying".to_string();
        push_unique_text(&mut blocking_reasons, "unknown_success_criteria");
        notes.push(
            "成功标准尚未全部由 checked criteria 标记为 satisfied，不能把目标标记为 completed。"
                .to_string(),
        );
    }

    ManagedObjectiveAuditDecision {
        decision,
        blocking_reasons,
        notes,
    }
}

fn collect_string_array_field(value: &Value, field_names: &[&str]) -> Vec<String> {
    field_names
        .iter()
        .find_map(|field_name| value.get(*field_name).and_then(Value::as_array))
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn push_unique_text(values: &mut Vec<String>, value: &str) {
    if !values.iter().any(|item| item == value) {
        values.push(value.to_string());
    }
}

fn has_positive_number(value: &Value, field_name: &str) -> bool {
    value
        .get(field_name)
        .and_then(Value::as_u64)
        .map(|count| count > 0)
        .unwrap_or(false)
}

fn has_true_pointer(value: &Value, pointer: &str) -> bool {
    value
        .pointer(pointer)
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn has_objective_completion_evidence(completion_audit_summary: &Value) -> bool {
    has_true_pointer(
        completion_audit_summary,
        "/requiredEvidence/workspaceSkillToolCall",
    ) || has_true_pointer(
        completion_audit_summary,
        "/requiredEvidence/artifactOrTimeline",
    ) || has_true_pointer(
        completion_audit_summary,
        "/requiredEvidence/controlledGetEvidence",
    ) || has_positive_number(completion_audit_summary, "workspaceSkillToolCallCount")
        || has_positive_number(completion_audit_summary, "artifactCount")
        || has_positive_number(
            completion_audit_summary,
            "controlledGetEvidenceExecutedCount",
        )
}

fn objective_success_criteria_are_satisfied(
    objective: &ManagedObjectiveRecord,
    completion_audit_summary: &Value,
) -> bool {
    if objective.success_criteria.is_empty() {
        return true;
    }

    let criteria_checks = collect_criteria_checks(completion_audit_summary);
    if criteria_checks.is_empty() {
        return false;
    }

    let mut satisfied_unlabelled_count = 0usize;
    let satisfied_labels = criteria_checks
        .iter()
        .filter(|check| criterion_check_is_satisfied(check))
        .filter_map(|check| {
            let label = criterion_check_label(check);
            if label.is_none() {
                satisfied_unlabelled_count += 1;
            }
            label
        })
        .collect::<Vec<_>>();

    if satisfied_labels.is_empty() {
        return satisfied_unlabelled_count >= objective.success_criteria.len();
    }

    objective.success_criteria.iter().all(|criterion| {
        let normalized = normalize_criterion_label(criterion);
        !normalized.is_empty()
            && satisfied_labels
                .iter()
                .any(|label| normalize_criterion_label(label) == normalized)
    })
}

fn collect_criteria_checks(completion_audit_summary: &Value) -> Vec<&Value> {
    [
        "/checkedCriteria",
        "/checked_criteria",
        "/criteriaChecks",
        "/criteria_checks",
        "/criteria",
    ]
    .iter()
    .find_map(|pointer| {
        completion_audit_summary
            .pointer(pointer)
            .and_then(Value::as_array)
    })
    .map(|values| values.iter().collect())
    .unwrap_or_default()
}

fn criterion_check_label(check: &Value) -> Option<String> {
    ["criterion", "text", "title", "name", "id"]
        .iter()
        .find_map(|field_name| {
            check
                .get(*field_name)
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
        })
}

fn criterion_check_is_satisfied(check: &Value) -> bool {
    if ["satisfied", "passed"].iter().any(|field_name| {
        check
            .get(*field_name)
            .and_then(Value::as_bool)
            .unwrap_or(false)
    }) {
        return true;
    }

    ["status", "decision", "result"].iter().any(|field_name| {
        matches!(
            check
                .get(*field_name)
                .and_then(Value::as_str)
                .map(str::trim),
            Some("satisfied" | "completed" | "passed" | "ok" | "true")
        )
    })
}

fn normalize_criterion_label(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn resolve_objective_status_after_audit(
    current_status: ManagedObjectiveStatus,
    decision: &str,
    pending_request_count: usize,
) -> ManagedObjectiveStatus {
    if matches!(
        current_status,
        ManagedObjectiveStatus::Paused
            | ManagedObjectiveStatus::Completed
            | ManagedObjectiveStatus::Failed
    ) {
        return current_status;
    }

    if pending_request_count > 0 {
        return ManagedObjectiveStatus::NeedsInput;
    }

    match decision {
        "completed" => ManagedObjectiveStatus::Completed,
        "needs_input" => ManagedObjectiveStatus::NeedsInput,
        "blocked" => ManagedObjectiveStatus::Blocked,
        "budget_limited" => ManagedObjectiveStatus::BudgetLimited,
        "failed" => ManagedObjectiveStatus::Failed,
        _ => ManagedObjectiveStatus::Active,
    }
}

fn resolve_blocker_reason(
    objective: &ManagedObjectiveRecord,
    status: ManagedObjectiveStatus,
    pending_request_count: usize,
    blocking_reasons: &[String],
) -> Option<String> {
    if matches!(
        objective.status,
        ManagedObjectiveStatus::Paused
            | ManagedObjectiveStatus::Completed
            | ManagedObjectiveStatus::Failed
    ) {
        return objective.blocker_reason.clone();
    }

    match status {
        ManagedObjectiveStatus::NeedsInput if pending_request_count > 0 => {
            Some(format!("当前会话还有 {pending_request_count} 个待处理请求"))
        }
        ManagedObjectiveStatus::Blocked | ManagedObjectiveStatus::BudgetLimited => {
            if blocking_reasons.is_empty() {
                objective.blocker_reason.clone()
            } else {
                Some(blocking_reasons.join("；"))
            }
        }
        _ => None,
    }
}

fn build_audit_summary_text(
    decision: &str,
    pending_request_count: usize,
    evidence_pack: &RuntimeEvidencePackExportResult,
    blocking_reasons: &[String],
    notes: &[String],
) -> String {
    let blockers = if blocking_reasons.is_empty() {
        "none".to_string()
    } else {
        blocking_reasons.join(" | ")
    };
    let note = notes.first().map(String::as_str).unwrap_or("n/a");
    format!(
        "decision={decision}; pending_requests={pending_request_count}; evidence_pack={}; artifacts={}; blockers={}; note={note}",
        evidence_pack.pack_relative_root,
        evidence_pack.artifacts.len(),
        blockers,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn objective_with_criteria(criteria: &[&str]) -> ManagedObjectiveRecord {
        ManagedObjectiveRecord {
            objective_id: "objective-1".to_string(),
            workspace_id: Some("workspace-1".to_string()),
            owner_kind: "agent_session".to_string(),
            owner_id: "session-1".to_string(),
            objective_text: "生成每日报告".to_string(),
            success_criteria: criteria.iter().map(|value| value.to_string()).collect(),
            status: ManagedObjectiveStatus::Active,
            budget_policy: None,
            risk_policy: None,
            approval_policy: None,
            continuation_policy: None,
            last_audit_summary: None,
            last_evidence_pack_ref: None,
            last_artifact_refs: Vec::new(),
            blocker_reason: None,
            created_at: "2026-05-25T00:00:00Z".to_string(),
            updated_at: "2026-05-25T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn completed_decision_requires_objective_completion_evidence() {
        let summary = json!({
            "decision": "completed",
            "workspaceSkillToolCallCount": 0,
            "artifactCount": 0,
            "controlledGetEvidenceExecutedCount": 0,
            "requiredEvidence": {
                "workspaceSkillToolCall": false,
                "artifactOrTimeline": false,
                "controlledGetEvidence": false
            }
        });

        let decision =
            resolve_managed_objective_audit_decision(&objective_with_criteria(&[]), &summary);

        assert_eq!(decision.decision, "verifying");
        assert!(decision
            .blocking_reasons
            .contains(&"missing_objective_completion_evidence".to_string()));
    }

    #[test]
    fn completed_decision_requires_known_success_criteria() {
        let summary = json!({
            "decision": "completed",
            "workspaceSkillToolCallCount": 1,
            "artifactCount": 1,
            "requiredEvidence": {
                "workspaceSkillToolCall": true,
                "artifactOrTimeline": true
            }
        });

        let decision = resolve_managed_objective_audit_decision(
            &objective_with_criteria(&["产出 Markdown 报告"]),
            &summary,
        );

        assert_eq!(decision.decision, "verifying");
        assert!(decision
            .blocking_reasons
            .contains(&"unknown_success_criteria".to_string()));
    }

    #[test]
    fn completed_decision_allows_satisfied_success_criteria() {
        let summary = json!({
            "decision": "completed",
            "workspaceSkillToolCallCount": 1,
            "artifactCount": 1,
            "requiredEvidence": {
                "workspaceSkillToolCall": true,
                "artifactOrTimeline": true
            },
            "checkedCriteria": [
                {
                    "criterion": "产出 Markdown 报告",
                    "status": "satisfied"
                },
                {
                    "criterion": "记录趋势摘要",
                    "satisfied": true
                }
            ]
        });

        let decision = resolve_managed_objective_audit_decision(
            &objective_with_criteria(&["产出 Markdown 报告", "记录趋势摘要"]),
            &summary,
        );

        assert_eq!(decision.decision, "completed");
        assert!(!decision
            .blocking_reasons
            .contains(&"unknown_success_criteria".to_string()));
    }
}
