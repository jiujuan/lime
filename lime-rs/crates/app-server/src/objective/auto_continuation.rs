use super::objective_runtime_metrics;
use super::MANAGED_OBJECTIVE_OWNER_AGENT_SESSION;
use crate::ManagedObjectiveAuditUpdate;
use app_server_protocol::AgentSessionReadResponse;
use app_server_protocol::ManagedObjective;
use app_server_protocol::ManagedObjectiveStatus;
use chrono::Utc;
use serde_json::json;
use serde_json::Value;

const DEFAULT_MAX_AUTO_TURNS: u32 = 3;
const DEFAULT_MAX_AUTO_ELAPSED_MS: i64 = 30 * 60 * 1_000;

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
