use crate::ManagedObjectiveAuditUpdate;
use crate::RuntimeCoreError;
use app_server_protocol::AgentSessionReadResponse;
use app_server_protocol::AgentTurnStatus;
use app_server_protocol::EvidencePackSummary;
use app_server_protocol::ManagedObjective;
use app_server_protocol::ManagedObjectiveStatus;
use chrono::Utc;
use serde_json::json;
use serde_json::Value;

const DEFAULT_MAX_AUTO_TURNS: u32 = 3;
const DEFAULT_MAX_AUTO_ELAPSED_MS: i64 = 30 * 60 * 1_000;

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

pub(crate) fn managed_objective_auto_event_name(objective: &ManagedObjective) -> String {
    format!(
        "managed_objective:{}:auto_idle:{}",
        objective.objective_id,
        Utc::now().timestamp_millis()
    )
}

pub(crate) fn managed_objective_auto_metadata(
    objective: &ManagedObjective,
    run_summary: &AutoContinuationRunSummary,
    policy: &AutoContinuationPolicy,
) -> serde_json::Value {
    let mut metadata = managed_objective_continuation_metadata_with_source(
        objective,
        "auto_idle",
        "auto_idle_guard",
    );
    if let Some(managed_objective) = metadata
        .pointer_mut("/harness/managed_objective")
        .and_then(Value::as_object_mut)
    {
        managed_objective.insert(
            "auto_continuation_guard".to_string(),
            json!({
                "decision": "allow",
                "previous_auto_turn_count": run_summary.auto_turn_count,
                "next_auto_turn_count": run_summary.auto_turn_count + 1,
                "max_auto_turns": policy.max_auto_turns,
                "max_elapsed_ms": policy.max_elapsed_ms,
                "estimated_total_cost": run_summary.estimated_total_cost,
                "max_estimated_total_cost": policy.max_estimated_total_cost,
            }),
        );
    }
    metadata
}

fn managed_objective_continuation_metadata_with_source(
    objective: &ManagedObjective,
    continuation_source: &str,
    audit_source: &str,
) -> serde_json::Value {
    serde_json::json!({
        "harness": {
            "managed_objective": {
                "objective_id": objective.objective_id,
                "owner_type": objective.owner_kind,
                "owner_id": objective.owner_id,
                "objective_text": objective.objective_text,
                "success_criteria": objective.success_criteria,
                "continuation_source": continuation_source,
                "completion_audit": {
                    "required": false,
                    "source": audit_source
                }
            }
        }
    })
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct AutoContinuationPolicy {
    pub enabled: bool,
    pub max_auto_turns: u32,
    pub max_elapsed_ms: i64,
    pub max_estimated_total_cost: Option<f64>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct AutoContinuationRunSummary {
    pub auto_turn_count: u32,
    pub estimated_total_cost: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum AutoContinuationGuardDecision {
    Allow,
    Skip(&'static str),
    BudgetLimited(String),
}

pub(crate) struct AutoContinuationGuardInput<'a> {
    pub objective: &'a ManagedObjective,
    pub read: &'a AgentSessionReadResponse,
    pub run_summary: AutoContinuationRunSummary,
    pub now: chrono::DateTime<chrono::Utc>,
}

pub(crate) fn resolve_auto_continuation_guard(
    input: AutoContinuationGuardInput<'_>,
) -> (AutoContinuationGuardDecision, AutoContinuationPolicy) {
    let policy = resolve_auto_continuation_policy(
        input.objective.continuation_policy.as_ref(),
        input.objective.budget_policy.as_ref(),
    );
    let decision = resolve_auto_continuation_guard_decision(&input, &policy);
    (decision, policy)
}

fn resolve_auto_continuation_guard_decision(
    input: &AutoContinuationGuardInput<'_>,
    policy: &AutoContinuationPolicy,
) -> AutoContinuationGuardDecision {
    if input.objective.status != ManagedObjectiveStatus::Active {
        return AutoContinuationGuardDecision::Skip("objective_not_active");
    }
    if input.objective.owner_kind != MANAGED_OBJECTIVE_OWNER_AGENT_SESSION {
        return AutoContinuationGuardDecision::Skip("unsupported_owner");
    }
    let metrics = objective_runtime_metrics(input.read);
    if metrics.running_turn_count > 0 {
        return AutoContinuationGuardDecision::Skip("runtime_turn_running");
    }
    if metrics.queued_turn_count > 0 {
        return AutoContinuationGuardDecision::Skip("queued_turn_exists");
    }
    if metrics.pending_request_count > 0 {
        return AutoContinuationGuardDecision::Skip("pending_request_exists");
    }
    if metrics.interrupted {
        return AutoContinuationGuardDecision::Skip("interrupt_pending");
    }
    if risk_policy_blocks_auto(input.objective.risk_policy.as_ref()) {
        return AutoContinuationGuardDecision::Skip("risk_policy_blocks_auto");
    }
    if !policy.enabled {
        return AutoContinuationGuardDecision::Skip("auto_continuation_not_enabled");
    }
    if policy.max_auto_turns == 0 || input.run_summary.auto_turn_count >= policy.max_auto_turns {
        return AutoContinuationGuardDecision::BudgetLimited(format!(
            "自动续跑已达到最大轮数 {}/{}",
            input.run_summary.auto_turn_count, policy.max_auto_turns
        ));
    }
    if objective_elapsed_ms(input.objective, input.now)
        .is_some_and(|elapsed_ms| elapsed_ms >= policy.max_elapsed_ms)
    {
        return AutoContinuationGuardDecision::BudgetLimited(format!(
            "自动续跑已达到最大耗时 {}ms",
            policy.max_elapsed_ms
        ));
    }
    if let Some(max_cost) = policy.max_estimated_total_cost {
        if input.run_summary.estimated_total_cost >= max_cost {
            return AutoContinuationGuardDecision::BudgetLimited(format!(
                "自动续跑已达到最大估算成本 {:.6}",
                max_cost
            ));
        }
    }
    AutoContinuationGuardDecision::Allow
}

pub(crate) fn build_auto_continuation_guard_audit_update(
    objective: &ManagedObjective,
    decision: &AutoContinuationGuardDecision,
    run_summary: &AutoContinuationRunSummary,
    policy: &AutoContinuationPolicy,
    queued_turn_id: Option<&str>,
) -> Option<ManagedObjectiveAuditUpdate> {
    if !should_persist_auto_continuation_guard(decision, policy) {
        return None;
    }
    let status = resolve_auto_continuation_guard_status(objective, decision);
    let blocker_reason = resolve_auto_continuation_guard_blocker_reason(objective, decision);
    Some(ManagedObjectiveAuditUpdate {
        status,
        last_audit_summary: Some(build_auto_continuation_guard_summary(
            decision,
            run_summary,
            policy,
            queued_turn_id,
        )),
        last_evidence_pack_ref: objective.last_evidence_pack_ref.clone(),
        last_artifact_refs: objective.last_artifact_refs.clone(),
        blocker_reason,
    })
}

fn should_persist_auto_continuation_guard(
    decision: &AutoContinuationGuardDecision,
    policy: &AutoContinuationPolicy,
) -> bool {
    match decision {
        AutoContinuationGuardDecision::Allow | AutoContinuationGuardDecision::BudgetLimited(_) => {
            true
        }
        AutoContinuationGuardDecision::Skip(reason) => {
            policy.enabled
                && !matches!(
                    *reason,
                    "objective_not_active" | "unsupported_owner" | "auto_continuation_not_enabled"
                )
        }
    }
}

fn resolve_auto_continuation_guard_status(
    objective: &ManagedObjective,
    decision: &AutoContinuationGuardDecision,
) -> ManagedObjectiveStatus {
    if matches!(
        objective.status,
        ManagedObjectiveStatus::Paused
            | ManagedObjectiveStatus::Completed
            | ManagedObjectiveStatus::Failed
    ) {
        return objective.status;
    }
    match decision {
        AutoContinuationGuardDecision::BudgetLimited(_) => ManagedObjectiveStatus::BudgetLimited,
        AutoContinuationGuardDecision::Skip("pending_request_exists") => {
            ManagedObjectiveStatus::NeedsInput
        }
        _ => objective.status,
    }
}

fn resolve_auto_continuation_guard_blocker_reason(
    objective: &ManagedObjective,
    decision: &AutoContinuationGuardDecision,
) -> Option<String> {
    if matches!(
        objective.status,
        ManagedObjectiveStatus::Paused
            | ManagedObjectiveStatus::Completed
            | ManagedObjectiveStatus::Failed
    ) {
        return objective.blocker_reason.clone();
    }
    match decision {
        AutoContinuationGuardDecision::BudgetLimited(reason) => Some(reason.clone()),
        AutoContinuationGuardDecision::Skip("pending_request_exists") => {
            Some("当前会话还有待处理请求，自动续跑已停止".to_string())
        }
        _ => None,
    }
}

fn build_auto_continuation_guard_summary(
    decision: &AutoContinuationGuardDecision,
    run_summary: &AutoContinuationRunSummary,
    policy: &AutoContinuationPolicy,
    queued_turn_id: Option<&str>,
) -> String {
    let decision_text = match decision {
        AutoContinuationGuardDecision::Allow => "allow".to_string(),
        AutoContinuationGuardDecision::Skip(reason) => format!("skip:{reason}"),
        AutoContinuationGuardDecision::BudgetLimited(reason) => {
            format!("budget_limited:{reason}")
        }
    };
    let next_auto_turn_count = if matches!(decision, AutoContinuationGuardDecision::Allow) {
        run_summary.auto_turn_count + 1
    } else {
        run_summary.auto_turn_count
    };
    let queued_turn_text = queued_turn_id
        .map(|value| format!("; queued_turn_id={value}"))
        .unwrap_or_default();
    let previous_decision_text =
        if matches!(decision, AutoContinuationGuardDecision::BudgetLimited(_))
            && run_summary.auto_turn_count > 0
        {
            "; decision=allow(previous)"
        } else {
            ""
        };
    let max_cost_text = policy
        .max_estimated_total_cost
        .map(|value| format!("{value:.6}"))
        .unwrap_or_else(|| "unbounded".to_string());
    format!(
        "auto_continuation_guard decision={decision_text}{queued_turn_text}{previous_decision_text}; auto_turns={next_auto_turn_count}/{}; max_elapsed_ms={}; estimated_cost={:.6}; max_estimated_cost={max_cost_text}",
        policy.max_auto_turns, policy.max_elapsed_ms, run_summary.estimated_total_cost
    )
}

fn resolve_auto_continuation_policy(
    continuation_policy: Option<&Value>,
    budget_policy: Option<&Value>,
) -> AutoContinuationPolicy {
    AutoContinuationPolicy {
        enabled: auto_idle_enabled(continuation_policy),
        max_auto_turns: integer_field(
            continuation_policy,
            &[
                "max_auto_turns",
                "maxAutoTurns",
                "max_idle_turns",
                "maxIdleTurns",
                "max_continuation_turns",
                "maxContinuationTurns",
            ],
        )
        .or_else(|| {
            integer_field(
                budget_policy,
                &["max_auto_turns", "maxAutoTurns", "max_turns", "maxTurns"],
            )
        })
        .unwrap_or(DEFAULT_MAX_AUTO_TURNS),
        max_elapsed_ms: integer_field(
            continuation_policy,
            &[
                "max_elapsed_ms",
                "maxElapsedMs",
                "max_duration_ms",
                "maxDurationMs",
                "max_runtime_ms",
                "maxRuntimeMs",
            ],
        )
        .or_else(|| {
            integer_field(
                budget_policy,
                &[
                    "max_elapsed_ms",
                    "maxElapsedMs",
                    "max_duration_ms",
                    "maxDurationMs",
                    "max_runtime_ms",
                    "maxRuntimeMs",
                ],
            )
        })
        .map(|value| value as i64)
        .unwrap_or(DEFAULT_MAX_AUTO_ELAPSED_MS),
        max_estimated_total_cost: number_field(
            continuation_policy,
            &[
                "max_estimated_total_cost",
                "maxEstimatedTotalCost",
                "max_total_cost",
                "maxTotalCost",
                "max_cost_usd",
                "maxCostUsd",
            ],
        )
        .or_else(|| {
            number_field(
                budget_policy,
                &[
                    "max_estimated_total_cost",
                    "maxEstimatedTotalCost",
                    "max_total_cost",
                    "maxTotalCost",
                    "max_cost_usd",
                    "maxCostUsd",
                ],
            )
        }),
    }
}

fn auto_idle_enabled(policy: Option<&Value>) -> bool {
    if bool_field(
        policy,
        &[
            "allow_auto_idle",
            "allowAutoIdle",
            "auto_idle",
            "autoIdle",
            "idle_continuation",
            "idleContinuation",
            "auto_continue",
            "autoContinue",
            "allow_auto_continuation",
            "allowAutoContinuation",
            "enabled",
        ],
    ) == Some(true)
    {
        return true;
    }
    matches!(
        string_field_from_optional(policy, &["mode", "strategy", "source"]).as_deref(),
        Some("auto" | "auto_idle" | "idle" | "controlled_auto")
    )
}

fn risk_policy_blocks_auto(policy: Option<&Value>) -> bool {
    if bool_field(
        policy,
        &[
            "allow_auto_continuation",
            "allowAutoContinuation",
            "allow_auto_idle",
            "allowAutoIdle",
        ],
    ) == Some(false)
    {
        return true;
    }
    if bool_field(
        policy,
        &[
            "requires_manual_approval",
            "requiresManualApproval",
            "manual_approval_required",
            "manualApprovalRequired",
        ],
    ) == Some(true)
    {
        return true;
    }
    matches!(
        string_field_from_optional(policy, &["risk_level", "riskLevel", "level"]).as_deref(),
        Some("high" | "critical")
    )
}

fn objective_elapsed_ms(
    objective: &ManagedObjective,
    now: chrono::DateTime<chrono::Utc>,
) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(&objective.created_at)
        .ok()
        .map(|created_at| now.signed_duration_since(created_at.with_timezone(&chrono::Utc)))
        .map(|duration| duration.num_milliseconds().max(0))
}

fn bool_field(value: Option<&Value>, keys: &[&str]) -> Option<bool> {
    keys.iter()
        .filter_map(|key| value?.get(*key))
        .find_map(Value::as_bool)
}

fn integer_field(value: Option<&Value>, keys: &[&str]) -> Option<u32> {
    keys.iter()
        .filter_map(|key| value?.get(*key))
        .find_map(|value| {
            value
                .as_u64()
                .and_then(|number| u32::try_from(number).ok())
                .or_else(|| {
                    value
                        .as_i64()
                        .filter(|number| *number >= 0)
                        .and_then(|number| u32::try_from(number).ok())
                })
        })
}

fn number_field(value: Option<&Value>, keys: &[&str]) -> Option<f64> {
    keys.iter()
        .filter_map(|key| value?.get(*key))
        .find_map(Value::as_f64)
}

fn string_field_from_optional(value: Option<&Value>, keys: &[&str]) -> Option<String> {
    let value = value?;
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
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
        metrics.pending_request_count,
        metrics.queued_turn_count,
        metrics.running_turn_count,
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
