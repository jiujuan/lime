use super::*;
use lime_core::database::dao::agent_run::AgentRunStatus;

fn objective(status: ManagedObjectiveStatus) -> ManagedObjectiveRecord {
    ManagedObjectiveRecord {
        objective_id: "objective-1".to_string(),
        workspace_id: Some("workspace-1".to_string()),
        owner_kind: MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
        owner_id: "session-1".to_string(),
        objective_text: "完成本地验证".to_string(),
        success_criteria: vec!["测试通过".to_string()],
        status,
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

fn guard_input<'a>(
    objective: &'a ManagedObjectiveRecord,
    run_summary: AutoContinuationRunSummary,
) -> AutoContinuationGuardInput<'a> {
    AutoContinuationGuardInput {
        objective,
        queued_turn_count: 0,
        pending_request_count: 0,
        running_turn_count: 0,
        interrupted: false,
        run_summary,
        now: chrono::DateTime::parse_from_rfc3339("2026-05-25T00:01:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc),
    }
}

fn run(metadata: Value) -> AgentRun {
    AgentRun {
        id: "run-1".to_string(),
        source: "chat".to_string(),
        source_ref: None,
        session_id: Some("session-1".to_string()),
        status: AgentRunStatus::Success,
        started_at: "2026-05-25T00:00:00Z".to_string(),
        finished_at: Some("2026-05-25T00:00:10Z".to_string()),
        duration_ms: Some(10_000),
        error_code: None,
        error_message: None,
        metadata: Some(metadata.to_string()),
        created_at: "2026-05-25T00:00:00Z".to_string(),
        updated_at: "2026-05-25T00:00:10Z".to_string(),
    }
}

#[test]
fn continuation_request_carries_source_metadata() {
    let mut request = build_objective_continuation_request(
        &objective(ManagedObjectiveStatus::Active),
        ManagedObjectiveContinuationSource::AutoIdle,
    );
    insert_auto_continuation_guard_metadata(
        &mut request,
        &AutoContinuationRunSummary {
            auto_turn_count: 1,
            estimated_total_cost: 0.42,
        },
        &AutoContinuationPolicy {
            enabled: true,
            max_auto_turns: 3,
            max_elapsed_ms: 60_000,
            max_estimated_total_cost: Some(1.0),
        },
    );

    assert_eq!(request.session_id, "session-1");
    assert_eq!(request.queue_if_busy, Some(true));
    assert_eq!(
        request
            .metadata
            .as_ref()
            .and_then(|value| value.pointer("/harness/managed_objective/continuation_source"))
            .and_then(Value::as_str),
        Some("auto_idle")
    );
    assert_eq!(
        request
            .metadata
            .as_ref()
            .and_then(|value| value
                .pointer("/harness/managed_objective/auto_continuation_guard/next_auto_turn_count"))
            .and_then(Value::as_u64),
        Some(2)
    );
}

#[test]
fn auto_guard_requires_explicit_policy_enable() {
    let objective = objective(ManagedObjectiveStatus::Active);
    let decision = resolve_auto_continuation_guard(guard_input(&objective, Default::default()));

    assert_eq!(
        decision,
        AutoContinuationGuardDecision::Skip("auto_continuation_not_enabled")
    );
}

#[test]
fn auto_guard_allows_active_idle_objective() {
    let mut objective = objective(ManagedObjectiveStatus::Active);
    objective.continuation_policy = Some(json!({
        "autoIdle": true,
        "maxAutoTurns": 2
    }));

    let decision = resolve_auto_continuation_guard(guard_input(&objective, Default::default()));

    assert_eq!(decision, AutoContinuationGuardDecision::Allow);
}

#[test]
fn auto_guard_blocks_pending_requests_and_queued_turns() {
    let mut objective = objective(ManagedObjectiveStatus::Active);
    objective.continuation_policy = Some(json!({ "autoIdle": true }));
    let mut input = guard_input(&objective, Default::default());
    input.pending_request_count = 1;

    assert_eq!(
        resolve_auto_continuation_guard(input),
        AutoContinuationGuardDecision::Skip("pending_request_exists")
    );

    let mut input = guard_input(&objective, Default::default());
    input.queued_turn_count = 1;
    assert_eq!(
        resolve_auto_continuation_guard(input),
        AutoContinuationGuardDecision::Skip("queued_turn_exists")
    );
}

#[test]
fn auto_guard_blocks_running_turns_and_interrupt_marker() {
    let mut objective = objective(ManagedObjectiveStatus::Active);
    objective.continuation_policy = Some(json!({ "autoIdle": true }));

    let mut input = guard_input(&objective, Default::default());
    input.running_turn_count = 1;
    assert_eq!(
        resolve_auto_continuation_guard(input),
        AutoContinuationGuardDecision::Skip("runtime_turn_running")
    );

    let mut input = guard_input(&objective, Default::default());
    input.interrupted = true;
    assert_eq!(
        resolve_auto_continuation_guard(input),
        AutoContinuationGuardDecision::Skip("interrupt_pending")
    );
}

#[test]
fn auto_guard_marks_budget_limited_at_max_turns() {
    let mut objective = objective(ManagedObjectiveStatus::Active);
    objective.continuation_policy = Some(json!({
        "autoIdle": true,
        "maxAutoTurns": 1
    }));

    let decision = resolve_auto_continuation_guard(guard_input(
        &objective,
        AutoContinuationRunSummary {
            auto_turn_count: 1,
            estimated_total_cost: 0.0,
        },
    ));

    assert!(matches!(
        decision,
        AutoContinuationGuardDecision::BudgetLimited(reason)
            if reason.contains("最大轮数")
    ));
}

#[test]
fn auto_guard_rejects_non_active_status() {
    let mut objective = objective(ManagedObjectiveStatus::Paused);
    objective.continuation_policy = Some(json!({ "autoIdle": true }));

    let decision = resolve_auto_continuation_guard(guard_input(&objective, Default::default()));

    assert_eq!(
        decision,
        AutoContinuationGuardDecision::Skip("objective_not_active")
    );
}

#[test]
fn auto_guard_stops_completed_objective_without_audit_noise() {
    let mut objective = objective(ManagedObjectiveStatus::Completed);
    objective.continuation_policy = Some(json!({ "autoIdle": true }));
    objective.last_audit_summary = Some("decision=completed; evidence_pack=ready".to_string());
    objective.last_evidence_pack_ref = Some(".lime/evidence/objective-1".to_string());
    objective.last_artifact_refs = vec!["reports/daily.md".to_string()];

    let decision = resolve_auto_continuation_guard(guard_input(&objective, Default::default()));

    assert_eq!(
        decision,
        AutoContinuationGuardDecision::Skip("objective_not_active")
    );
    assert!(build_auto_continuation_guard_audit_update(
        &objective,
        &decision,
        &Default::default(),
        &AutoContinuationPolicy {
            enabled: true,
            max_auto_turns: 3,
            max_elapsed_ms: 60_000,
            max_estimated_total_cost: None,
        },
        None,
    )
    .is_none());
}

#[test]
fn auto_guard_audit_update_records_submitted_turn() {
    let mut objective = objective(ManagedObjectiveStatus::Active);
    objective.last_evidence_pack_ref = Some(".lime/evidence/objective-1".to_string());
    objective.last_artifact_refs = vec!["reports/daily.md".to_string()];
    let update = build_auto_continuation_guard_audit_update(
        &objective,
        &AutoContinuationGuardDecision::Allow,
        &AutoContinuationRunSummary {
            auto_turn_count: 1,
            estimated_total_cost: 0.42,
        },
        &AutoContinuationPolicy {
            enabled: true,
            max_auto_turns: 3,
            max_elapsed_ms: 60_000,
            max_estimated_total_cost: Some(1.0),
        },
        Some("queued-1"),
    )
    .expect("allow guard should write audit update");

    assert_eq!(update.status, ManagedObjectiveStatus::Active);
    assert_eq!(
        update.last_evidence_pack_ref.as_deref(),
        Some(".lime/evidence/objective-1")
    );
    assert_eq!(update.last_artifact_refs, vec!["reports/daily.md"]);
    let summary = update.last_audit_summary.as_deref().unwrap_or_default();
    assert!(summary.contains("decision=allow"));
    assert!(summary.contains("queued_turn_id=queued-1"));
    assert!(summary.contains("auto_turns=2/3"));
}

#[test]
fn auto_guard_audit_update_marks_pending_request_as_needs_input() {
    let update = build_auto_continuation_guard_audit_update(
        &objective(ManagedObjectiveStatus::Active),
        &AutoContinuationGuardDecision::Skip("pending_request_exists"),
        &AutoContinuationRunSummary {
            auto_turn_count: 2,
            estimated_total_cost: 0.7,
        },
        &AutoContinuationPolicy {
            enabled: true,
            max_auto_turns: 5,
            max_elapsed_ms: 60_000,
            max_estimated_total_cost: None,
        },
        None,
    )
    .expect("pending request skip should write audit update");

    assert_eq!(update.status, ManagedObjectiveStatus::NeedsInput);
    assert_eq!(
        update.blocker_reason.as_deref(),
        Some("当前会话还有待处理请求，自动续跑已停止")
    );
    let summary = update.last_audit_summary.as_deref().unwrap_or_default();
    assert!(summary.contains("decision=skip:pending_request_exists"));
    assert!(summary.contains("auto_turns=2/5"));
}

#[test]
fn auto_guard_audit_update_records_transient_skip_without_status_change() {
    let update = build_auto_continuation_guard_audit_update(
        &objective(ManagedObjectiveStatus::Active),
        &AutoContinuationGuardDecision::Skip("runtime_turn_running"),
        &AutoContinuationRunSummary {
            auto_turn_count: 1,
            estimated_total_cost: 0.1,
        },
        &AutoContinuationPolicy {
            enabled: true,
            max_auto_turns: 5,
            max_elapsed_ms: 60_000,
            max_estimated_total_cost: None,
        },
        None,
    )
    .expect("running turn skip should keep an audit trail");

    assert_eq!(update.status, ManagedObjectiveStatus::Active);
    assert_eq!(update.blocker_reason, None);
    let summary = update.last_audit_summary.as_deref().unwrap_or_default();
    assert!(summary.contains("decision=skip:runtime_turn_running"));
    assert!(summary.contains("auto_turns=1/5"));
}

#[test]
fn auto_guard_audit_update_marks_budget_limited() {
    let update = build_auto_continuation_guard_audit_update(
        &objective(ManagedObjectiveStatus::Active),
        &AutoContinuationGuardDecision::BudgetLimited("自动续跑已达到最大轮数 3/3".to_string()),
        &AutoContinuationRunSummary {
            auto_turn_count: 3,
            estimated_total_cost: 0.9,
        },
        &AutoContinuationPolicy {
            enabled: true,
            max_auto_turns: 3,
            max_elapsed_ms: 60_000,
            max_estimated_total_cost: Some(1.0),
        },
        None,
    )
    .expect("budget limited guard should write audit update");

    assert_eq!(update.status, ManagedObjectiveStatus::BudgetLimited);
    assert_eq!(
        update.blocker_reason.as_deref(),
        Some("自动续跑已达到最大轮数 3/3")
    );
    assert!(update
        .last_audit_summary
        .as_deref()
        .unwrap_or_default()
        .contains("decision=budget_limited:自动续跑已达到最大轮数 3/3"));
}

#[test]
fn auto_guard_audit_update_skips_disabled_policy_noise() {
    let update = build_auto_continuation_guard_audit_update(
        &objective(ManagedObjectiveStatus::Active),
        &AutoContinuationGuardDecision::Skip("auto_continuation_not_enabled"),
        &Default::default(),
        &AutoContinuationPolicy {
            enabled: false,
            max_auto_turns: 3,
            max_elapsed_ms: 60_000,
            max_estimated_total_cost: None,
        },
        None,
    );

    assert!(update.is_none());
}

#[test]
fn run_summary_counts_matching_auto_idle_runs_and_cost() {
    let runs = vec![
        run(json!({
            "request_metadata": {
                "harness": {
                    "managed_objective": {
                        "objective_id": "objective-1",
                        "continuation_source": "auto_idle"
                    }
                }
            },
            "cost_state": { "estimatedTotalCost": 0.25 }
        })),
        run(json!({
            "request_metadata": {
                "harness": {
                    "managed_objective": {
                        "objective_id": "objective-1",
                        "continuation_source": "manual_gui"
                    }
                }
            },
            "cost_state": { "estimated_total_cost": 0.50 }
        })),
        run(json!({
            "request_metadata": {
                "harness": {
                    "managed_objective": {
                        "objective_id": "other-objective",
                        "continuation_source": "auto_idle"
                    }
                }
            },
            "cost_state": { "estimatedTotalCost": 10.0 }
        })),
    ];

    let summary = summarize_auto_continuation_runs(&runs, "objective-1");

    assert_eq!(summary.auto_turn_count, 1);
    assert!((summary.estimated_total_cost - 0.75).abs() < f64::EPSILON);
}
