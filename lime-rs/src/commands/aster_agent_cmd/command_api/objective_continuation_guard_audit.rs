use super::*;
use lime_core::database::managed_objective_repository::{
    update_objective_audit_by_owner, ManagedObjectiveAuditUpdate,
};

pub(super) fn persist_auto_continuation_guard_audit(
    db: &DbConnection,
    session_id: &str,
    objective: &ManagedObjectiveRecord,
    decision: &AutoContinuationGuardDecision,
    run_summary: &AutoContinuationRunSummary,
    policy: &AutoContinuationPolicy,
    queued_turn_id: Option<&str>,
) -> Result<(), String> {
    let Some(update) = build_auto_continuation_guard_audit_update(
        objective,
        decision,
        run_summary,
        policy,
        queued_turn_id,
    ) else {
        return Ok(());
    };

    let conn = lock_db(db)?;
    update_objective_audit_by_owner(
        &conn,
        MANAGED_OBJECTIVE_OWNER_AGENT_SESSION,
        session_id,
        update,
    )?;
    Ok(())
}

pub(super) fn build_auto_continuation_guard_audit_update(
    objective: &ManagedObjectiveRecord,
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
    objective: &ManagedObjectiveRecord,
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
    objective: &ManagedObjectiveRecord,
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
    let max_cost_text = policy
        .max_estimated_total_cost
        .map(|value| format!("{value:.6}"))
        .unwrap_or_else(|| "unbounded".to_string());

    format!(
        "auto_continuation_guard decision={decision_text}{queued_turn_text}; auto_turns={next_auto_turn_count}/{}; max_elapsed_ms={}; estimated_cost={:.6}; max_estimated_cost={max_cost_text}",
        policy.max_auto_turns, policy.max_elapsed_ms, run_summary.estimated_total_cost
    )
}
