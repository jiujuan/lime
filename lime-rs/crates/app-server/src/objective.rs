use crate::ManagedObjectiveAuditUpdate;
use crate::RuntimeCoreError;
use app_server_protocol::AgentSessionReadResponse;
use app_server_protocol::AgentTurnStatus;
use app_server_protocol::EvidencePackSummary;
use app_server_protocol::ManagedObjective;
use app_server_protocol::ManagedObjectiveStatus;
use serde_json::Value;

pub(crate) const MANAGED_OBJECTIVE_OWNER_AGENT_SESSION: &str = "agent_session";
pub(crate) const MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB: &str = "automation_job";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ManagedObjectiveOwner {
    pub owner_kind: String,
    pub owner_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ManagedObjectiveAuditDecision {
    decision: String,
    blocking_reasons: Vec<String>,
    notes: Vec<String>,
}

pub(crate) fn normalize_required_id(
    value: &str,
    message: &str,
) -> Result<String, RuntimeCoreError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(RuntimeCoreError::Backend(message.to_string()));
    }
    Ok(value.to_string())
}

pub(crate) fn resolve_managed_objective_owner(
    session_id: &str,
    owner_kind: Option<&str>,
    owner_id: Option<&str>,
) -> Result<ManagedObjectiveOwner, RuntimeCoreError> {
    let owner_kind = normalize_optional_owner_kind(owner_kind)?;
    let owner_id = match owner_kind.as_str() {
        MANAGED_OBJECTIVE_OWNER_AGENT_SESSION => normalize_optional_owner_id(owner_id, session_id),
        MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB => owner_id
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .ok_or_else(|| {
                RuntimeCoreError::Backend(
                    "agentSession/objective/audit ownerId is required for ownerKind=automation_job"
                        .to_string(),
                )
            })?,
        other => {
            return Err(RuntimeCoreError::Backend(format!(
                "unsupported managed objective ownerKind: {other}"
            )));
        }
    };
    Ok(ManagedObjectiveOwner {
        owner_kind,
        owner_id,
    })
}

pub(crate) fn ensure_agent_session_objective_owner(
    owner: &ManagedObjectiveOwner,
    session_id: &str,
) -> Result<(), RuntimeCoreError> {
    if owner.owner_kind != MANAGED_OBJECTIVE_OWNER_AGENT_SESSION {
        return Err(RuntimeCoreError::Backend(format!(
            "agentSession/objective/continue only supports ownerKind=agent_session, got {}",
            owner.owner_kind
        )));
    }
    if owner.owner_id != session_id {
        return Err(RuntimeCoreError::Backend(
            "agentSession/objective/continue ownerId must match sessionId".to_string(),
        ));
    }
    Ok(())
}

pub(crate) fn normalize_optional_owner_kind(
    value: Option<&str>,
) -> Result<String, RuntimeCoreError> {
    let owner_kind = value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(MANAGED_OBJECTIVE_OWNER_AGENT_SESSION);
    Ok(owner_kind.to_string())
}

pub(crate) fn normalize_optional_owner_id(value: Option<&str>, fallback: &str) -> String {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

pub(crate) fn ensure_objective_can_continue(
    objective: &ManagedObjective,
    read: &AgentSessionReadResponse,
) -> Result<(), RuntimeCoreError> {
    if objective.status != ManagedObjectiveStatus::Active {
        return Err(RuntimeCoreError::Backend(format!(
            "当前目标状态为 {}，不能继续推进",
            managed_objective_status_label(objective.status)
        )));
    }

    let metrics = objective_runtime_metrics(read);
    if metrics.running_turn_count > 0 {
        return Err(RuntimeCoreError::Backend(
            "当前会话仍有运行中的 turn，不能继续推进目标".to_string(),
        ));
    }
    if metrics.pending_request_count > 0 {
        return Err(RuntimeCoreError::Backend(format!(
            "当前会话还有 {} 个待处理请求，不能继续推进目标",
            metrics.pending_request_count
        )));
    }
    if metrics.queued_turn_count > 0 {
        return Err(RuntimeCoreError::Backend(format!(
            "当前会话还有 {} 个排队 turn，不能继续推进目标",
            metrics.queued_turn_count
        )));
    }
    if metrics.interrupted {
        return Err(RuntimeCoreError::Backend(
            "当前会话仍有中断标记，不能继续推进目标".to_string(),
        ));
    }
    Ok(())
}

pub(crate) fn managed_objective_continuation_message(objective: &ManagedObjective) -> String {
    let criteria = if objective.success_criteria.is_empty() {
        "未设置单独成功标准，请按目标本身判断下一步。".to_string()
    } else {
        objective
            .success_criteria
            .iter()
            .map(|item| format!("- {item}"))
            .collect::<Vec<_>>()
            .join("\n")
    };
    format!(
        "继续推进当前目标。\n\n目标：{}\n\n成功标准：\n{}\n\n请先检查当前会话事实、产物和待处理请求；只推进下一步，不要创建新的目标。",
        objective.objective_text, criteria
    )
}

pub(crate) fn managed_objective_event_name(objective: &ManagedObjective) -> String {
    format!(
        "managed_objective:{}:manual_gui:{}",
        objective.objective_id,
        chrono::Utc::now().timestamp_millis()
    )
}

pub(crate) fn managed_objective_continuation_metadata(
    objective: &ManagedObjective,
) -> serde_json::Value {
    serde_json::json!({
        "harness": {
            "managed_objective": {
                "objective_id": objective.objective_id,
                "owner_type": objective.owner_kind,
                "owner_id": objective.owner_id,
                "objective_text": objective.objective_text,
                "success_criteria": objective.success_criteria,
                "continuation_source": "manual_gui",
                "completion_audit": {
                    "required": false,
                    "source": "manual_gui_mvp"
                }
            }
        }
    })
}

pub(crate) fn build_managed_objective_audit_update(
    objective: &ManagedObjective,
    read: &AgentSessionReadResponse,
    evidence_pack: Option<&EvidencePackSummary>,
) -> ManagedObjectiveAuditUpdate {
    let metrics = objective_runtime_metrics(read);
    let mut audit_decision = evidence_pack
        .map(|pack| {
            resolve_managed_objective_audit_decision(
                objective,
                pack.completion_audit_summary.as_ref(),
            )
        })
        .unwrap_or_else(|| ManagedObjectiveAuditDecision {
            decision: "verifying".to_string(),
            blocking_reasons: vec!["missing_evidence_pack".to_string()],
            notes: vec![
                "App Server current audit 没有拿到 evidence pack，不能标记 completed。".to_string(),
            ],
        });

    if metrics.pending_request_count > 0 {
        audit_decision.decision = "needs_input".to_string();
        push_unique_text(&mut audit_decision.blocking_reasons, "pending_user_request");
        audit_decision
            .notes
            .push("当前会话仍有待处理请求，目标审计不能标记 completed。".to_string());
    }
    if metrics.running_turn_count > 0 {
        audit_decision.decision = "verifying".to_string();
        push_unique_text(&mut audit_decision.blocking_reasons, "running_turn_exists");
    }
    if metrics.queued_turn_count > 0 {
        audit_decision.decision = "verifying".to_string();
        push_unique_text(&mut audit_decision.blocking_reasons, "queued_turn_exists");
    }
    if metrics.interrupted {
        audit_decision.decision = "verifying".to_string();
        push_unique_text(
            &mut audit_decision.blocking_reasons,
            "interrupt_marker_exists",
        );
    }

    let status = resolve_objective_status_after_audit(
        objective.status,
        audit_decision.decision.as_str(),
        metrics.pending_request_count,
    );
    let blocker_reason = resolve_blocker_reason(
        objective,
        status,
        metrics.pending_request_count,
        &audit_decision.blocking_reasons,
    );

    ManagedObjectiveAuditUpdate {
        status,
        last_audit_summary: Some(build_audit_summary_text(
            audit_decision.decision.as_str(),
            &metrics,
            evidence_pack,
            &audit_decision.blocking_reasons,
            &audit_decision.notes,
        )),
        last_evidence_pack_ref: evidence_pack.and_then(|pack| {
            pack.pack_absolute_root
                .clone()
                .or_else(|| Some(pack.pack_relative_root.clone()))
        }),
        last_artifact_refs: evidence_pack
            .map(|pack| {
                pack.artifacts
                    .iter()
                    .filter_map(|artifact| {
                        artifact
                            .absolute_path
                            .clone()
                            .or_else(|| Some(artifact.relative_path.clone()))
                    })
                    .collect()
            })
            .unwrap_or_else(|| objective.last_artifact_refs.clone()),
        blocker_reason,
    }
}

fn resolve_managed_objective_audit_decision(
    objective: &ManagedObjective,
    completion_audit_summary: Option<&Value>,
) -> ManagedObjectiveAuditDecision {
    let completion_audit_summary = completion_audit_summary.unwrap_or(&Value::Null);
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

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct ObjectiveRuntimeMetrics {
    pending_request_count: usize,
    queued_turn_count: usize,
    running_turn_count: usize,
    interrupted: bool,
}

fn objective_runtime_metrics(read: &AgentSessionReadResponse) -> ObjectiveRuntimeMetrics {
    let mut metrics = ObjectiveRuntimeMetrics {
        queued_turn_count: read
            .turns
            .iter()
            .filter(|turn| matches!(turn.status, AgentTurnStatus::Queued))
            .count(),
        running_turn_count: read
            .turns
            .iter()
            .filter(|turn| {
                matches!(
                    turn.status,
                    AgentTurnStatus::Accepted
                        | AgentTurnStatus::Running
                        | AgentTurnStatus::WaitingAction
                )
            })
            .count(),
        ..ObjectiveRuntimeMetrics::default()
    };

    let Some(detail) = read.detail.as_ref() else {
        return metrics;
    };
    let thread_read = detail.get("thread_read").filter(|value| value.is_object());
    if let Some(pending_requests) = array_field(thread_read, detail, "pending_requests") {
        metrics.pending_request_count = pending_requests.len();
    }
    if let Some(queued_turns) = array_field(thread_read, detail, "queued_turns") {
        metrics.queued_turn_count = metrics.queued_turn_count.max(queued_turns.len());
    }
    if string_field(thread_read, detail, "active_turn_id").is_some()
        || string_field(thread_read, detail, "activeTurnId").is_some()
    {
        metrics.running_turn_count = metrics.running_turn_count.max(1);
    }
    metrics.interrupted =
        interrupt_marker_present(thread_read) || interrupt_marker_present(Some(detail));
    metrics
}

fn array_field<'a>(
    thread_read: Option<&'a Value>,
    detail: &'a Value,
    field_name: &str,
) -> Option<&'a Vec<Value>> {
    thread_read
        .and_then(|value| value.get(field_name))
        .or_else(|| detail.get(field_name))
        .and_then(Value::as_array)
}

fn string_field<'a>(
    thread_read: Option<&'a Value>,
    detail: &'a Value,
    field_name: &str,
) -> Option<&'a str> {
    thread_read
        .and_then(|value| value.get(field_name))
        .or_else(|| detail.get(field_name))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn interrupt_marker_present(value: Option<&Value>) -> bool {
    let Some(value) = value else {
        return false;
    };
    [
        "interrupt_marker",
        "interruptMarker",
        "runtime_interrupt",
        "runtimeInterrupt",
    ]
    .iter()
    .any(|field| value.get(*field).is_some_and(interrupt_value_present))
        || value.get("diagnostics").is_some_and(|diagnostics| {
            [
                "interrupt_state",
                "interruptState",
                "runtime_interrupt_state",
                "runtimeInterruptState",
            ]
            .iter()
            .filter_map(|field| diagnostics.get(*field).and_then(Value::as_str))
            .map(str::trim)
            .any(|state| matches!(state, "interrupting" | "interrupted" | "requested"))
        })
}

fn interrupt_value_present(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::String(value) => {
            let value = value.trim();
            !value.is_empty() && value != "none" && value != "idle"
        }
        Value::Array(values) => !values.is_empty(),
        Value::Object(values) => !values.is_empty(),
        Value::Number(_) => true,
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
    objective: &ManagedObjective,
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
    objective: &ManagedObjective,
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
    metrics: &ObjectiveRuntimeMetrics,
    evidence_pack: Option<&EvidencePackSummary>,
    blocking_reasons: &[String],
    notes: &[String],
) -> String {
    let blockers = if blocking_reasons.is_empty() {
        "none".to_string()
    } else {
        blocking_reasons.join(" | ")
    };
    let note = notes.first().map(String::as_str).unwrap_or("n/a");
    let evidence_pack_ref = evidence_pack
        .map(|pack| pack.pack_relative_root.as_str())
        .unwrap_or("none");
    let artifact_count = evidence_pack
        .map(|pack| pack.artifacts.len())
        .unwrap_or_default();
    format!(
        "decision={decision}; pending_requests={}; queued_turns={}; running_turns={}; evidence_pack={evidence_pack_ref}; artifacts={artifact_count}; blockers={blockers}; note={note}",
        metrics.pending_request_count, metrics.queued_turn_count, metrics.running_turn_count,
    )
}

fn managed_objective_status_label(status: ManagedObjectiveStatus) -> &'static str {
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
