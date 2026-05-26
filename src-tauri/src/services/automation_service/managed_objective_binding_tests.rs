use super::*;
use crate::database::schema::create_tables;
use crate::services::automation_service::{
    AutomationJobDraft, AutomationJobUpdate, AutomationPayload, AutomationService,
};
use chrono::Utc;
use lime_core::config::{
    AutomationExecutionMode, AutomationSettings, DeliveryConfig, TaskSchedule,
};
use lime_core::database::dao::automation_job::{AutomationJob, AutomationJobDao};
use lime_core::database::DbConnection;
use rusqlite::Connection;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};

fn setup_db() -> Connection {
    let conn = Connection::open_in_memory().expect("创建内存数据库失败");
    create_tables(&conn).expect("创建数据表失败");
    conn
}

fn setup_service() -> (AutomationService, DbConnection) {
    let conn = setup_db();
    let db = Arc::new(Mutex::new(conn));
    let mut service = AutomationService::new(AutomationSettings::default());
    service.set_db(db.clone());
    (service, db)
}

fn agent_payload_with_objective(objective: &str) -> AutomationPayload {
    AutomationPayload::AgentTurn {
        prompt: "生成每日摘要".to_string(),
        system_prompt: None,
        web_search: false,
        approval_policy: None,
        sandbox_policy: None,
        provider_config: None,
        provider_preference: None,
        model_preference: None,
        request_metadata: Some(json!({
            "harness": {
                "managed_objective": {
                    "owner_type": "automation_job",
                    "state": "planned",
                    "objective": objective,
                    "success_criteria": [
                        "通过 agent_runtime_submit_turn 执行",
                        "产出 artifact 或 evidence"
                    ],
                    "completion_audit": "artifact_or_evidence_required"
                }
            }
        })),
        content_id: None,
    }
}

fn automation_job_draft(objective: &str, enabled: bool) -> AutomationJobDraft {
    AutomationJobDraft {
        name: "每日摘要".to_string(),
        description: None,
        enabled,
        workspace_id: "workspace-1".to_string(),
        execution_mode: AutomationExecutionMode::Skill,
        schedule: TaskSchedule::Every { every_secs: 300 },
        payload: agent_payload_with_objective(objective),
        delivery: DeliveryConfig::default(),
        timeout_secs: None,
        max_retries: 2,
    }
}

fn agent_job_with_managed_objective() -> AutomationJob {
    AutomationJob {
        id: "job-1".to_string(),
        name: "每日摘要".to_string(),
        description: None,
        enabled: true,
        workspace_id: "workspace-1".to_string(),
        execution_mode: AutomationExecutionMode::Skill,
        schedule: TaskSchedule::Every { every_secs: 300 },
        payload: json!({
            "kind": "agent_turn",
            "prompt": "生成每日摘要",
            "web_search": false,
            "request_metadata": {
                "harness": {
                    "managed_objective": {
                        "owner_type": "automation_job",
                        "state": "planned",
                        "objective": "每天生成可审计摘要",
                        "success_criteria": [
                            "通过 agent_runtime_submit_turn 执行",
                            "产出 artifact 或 evidence"
                        ],
                        "completion_audit": "artifact_or_evidence_required"
                    }
                }
            }
        }),
        delivery: DeliveryConfig::default(),
        timeout_secs: None,
        max_retries: 2,
        next_run_at: None,
        last_status: None,
        last_error: None,
        last_run_at: None,
        last_finished_at: None,
        running_started_at: None,
        consecutive_failures: 0,
        last_retry_count: 0,
        auto_disabled_until: None,
        last_delivery: None,
        created_at: "2026-05-25T00:00:00Z".to_string(),
        updated_at: "2026-05-25T00:00:00Z".to_string(),
    }
}

#[test]
fn create_job_should_persist_automation_owner_objective() {
    let (service, db) = setup_service();

    let job = service
        .create_job(automation_job_draft("每天生成可审计摘要", true))
        .expect("创建 automation job 失败");

    let conn = db.lock().expect("数据库锁定失败");
    let objective = get_objective_by_owner(
        &conn,
        MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB,
        job.id.as_str(),
    )
    .expect("读取 objective 失败")
    .expect("objective 不存在");
    let persisted_job = AutomationJobDao::get(&conn, job.id.as_str())
        .expect("读取 automation job 失败")
        .expect("automation job 不存在");

    assert_eq!(objective.owner_id, job.id);
    assert_eq!(objective.status, ManagedObjectiveStatus::Active);
    assert_eq!(
        persisted_job
            .payload
            .pointer("/request_metadata/harness/managed_objective/objective_id")
            .and_then(Value::as_str),
        Some(objective.objective_id.as_str())
    );
    assert_eq!(
        persisted_job
            .payload
            .pointer("/request_metadata/harness/managed_objective/owner_id")
            .and_then(Value::as_str),
        Some(objective.owner_id.as_str())
    );
}

#[test]
fn update_job_should_replace_payload_binding_and_sync_enabled_state() {
    let (service, db) = setup_service();
    let job = service
        .create_job(automation_job_draft("每天生成可审计摘要", true))
        .expect("创建 automation job 失败");

    let paused_job = service
        .update_job(
            job.id.as_str(),
            AutomationJobUpdate {
                enabled: Some(false),
                payload: Some(agent_payload_with_objective("每天生成第二版摘要")),
                ..AutomationJobUpdate::default()
            },
        )
        .expect("更新 automation job 失败");

    let conn = db.lock().expect("数据库锁定失败");
    let paused_objective = get_objective_by_owner(
        &conn,
        MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB,
        paused_job.id.as_str(),
    )
    .expect("读取 objective 失败")
    .expect("objective 不存在");
    assert_eq!(paused_objective.objective_text, "每天生成第二版摘要");
    assert_eq!(paused_objective.status, ManagedObjectiveStatus::Paused);
    drop(conn);

    let resumed_job = service
        .update_job(
            paused_job.id.as_str(),
            AutomationJobUpdate {
                enabled: Some(true),
                ..AutomationJobUpdate::default()
            },
        )
        .expect("恢复 automation job 失败");

    let conn = db.lock().expect("数据库锁定失败");
    let resumed_objective = get_objective_by_owner(
        &conn,
        MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB,
        resumed_job.id.as_str(),
    )
    .expect("读取 objective 失败")
    .expect("objective 不存在");
    assert_eq!(resumed_objective.status, ManagedObjectiveStatus::Active);
}

#[test]
fn replace_binding_should_persist_objective_and_backfill_payload_metadata() {
    let conn = setup_db();
    let mut job = agent_job_with_managed_objective();

    let changed = replace_managed_objective_binding(&conn, &mut job).expect("绑定 objective 失败");
    assert!(changed);

    let objective = get_objective_by_owner(&conn, MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB, "job-1")
        .expect("读取 objective 失败")
        .expect("objective 不存在");
    assert_eq!(objective.owner_kind, MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB);
    assert_eq!(objective.owner_id, "job-1");
    assert_eq!(objective.objective_text, "每天生成可审计摘要");
    assert_eq!(
        job.payload
            .pointer("/request_metadata/harness/managed_objective/objective_id")
            .and_then(Value::as_str),
        Some(objective.objective_id.as_str())
    );
    assert_eq!(
        job.payload
            .pointer("/request_metadata/harness/managed_objective/owner_id")
            .and_then(Value::as_str),
        Some("job-1")
    );
    assert_eq!(
        job.payload
            .pointer("/request_metadata/harness/managed_objective/completion_audit")
            .and_then(Value::as_str),
        Some(COMPLETION_AUDIT_ARTIFACT_OR_EVIDENCE)
    );
}

#[test]
fn refresh_projection_should_backfill_objective_audit_facts() {
    let conn = setup_db();
    let mut job = agent_job_with_managed_objective();
    replace_managed_objective_binding(&conn, &mut job).expect("绑定 objective 失败");

    update_objective_audit_by_owner(
        &conn,
        MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB,
        "job-1",
        ManagedObjectiveAuditUpdate {
            status: ManagedObjectiveStatus::Blocked,
            last_audit_summary: Some("缺少 evidence pack".to_string()),
            last_evidence_pack_ref: Some(".lime/harness/job-1/evidence".to_string()),
            last_artifact_refs: vec!["content-posts/daily.md".to_string()],
            blocker_reason: Some("等待补证据".to_string()),
        },
    )
    .expect("更新 audit 失败");

    let changed =
        refresh_managed_objective_projection(&conn, &mut job).expect("刷新 projection 失败");
    assert!(changed);
    assert_eq!(
        job.payload
            .pointer("/request_metadata/harness/managed_objective/state")
            .and_then(Value::as_str),
        Some("blocked")
    );
    assert_eq!(
        job.payload
            .pointer("/request_metadata/harness/managed_objective/last_audit_summary")
            .and_then(Value::as_str),
        Some("缺少 evidence pack")
    );
    assert_eq!(
        job.payload
            .pointer("/request_metadata/harness/managed_objective/last_evidence_pack_ref")
            .and_then(Value::as_str),
        Some(".lime/harness/job-1/evidence")
    );
    assert_eq!(
        job.payload
            .pointer("/request_metadata/harness/managed_objective/last_artifact_refs/0")
            .and_then(Value::as_str),
        Some("content-posts/daily.md")
    );
    assert_eq!(
        job.payload
            .pointer("/request_metadata/harness/managed_objective/blocker_reason")
            .and_then(Value::as_str),
        Some("等待补证据")
    );
}

#[test]
fn disabled_job_should_pause_bound_objective() {
    let conn = setup_db();
    let mut job = agent_job_with_managed_objective();
    job.enabled = false;

    replace_managed_objective_binding(&conn, &mut job).expect("绑定 objective 失败");
    let objective = get_objective_by_owner(&conn, MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB, "job-1")
        .expect("读取 objective 失败")
        .expect("objective 不存在");

    assert_eq!(objective.status, ManagedObjectiveStatus::Paused);
    assert_eq!(
        objective.blocker_reason.as_deref(),
        Some("automation job 已暂停")
    );
}

#[test]
fn terminal_failures_should_block_objective_and_disable_job_after_cutoff() {
    let conn = setup_db();
    let mut job = agent_job_with_managed_objective();
    replace_managed_objective_binding(&conn, &mut job).expect("绑定 objective 失败");
    job.consecutive_failures = 3;
    job.next_run_at = Some("2026-05-25T09:00:00Z".to_string());

    apply_terminal_managed_objective_state(&conn, &mut job, "error", "模型调用失败")
        .expect("更新 objective 失败");

    let objective = get_objective_by_owner(&conn, MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB, "job-1")
        .expect("读取 objective 失败")
        .expect("objective 不存在");
    assert_eq!(objective.status, ManagedObjectiveStatus::Blocked);
    assert!(!job.enabled);
    assert_eq!(job.next_run_at, None);
    assert!(objective
        .blocker_reason
        .as_deref()
        .unwrap_or_default()
        .contains("连续失败 3 次"));
}

#[test]
fn validation_should_reject_non_automation_owner_type() {
    let metadata = json!({
        "harness": {
            "managed_objective": {
                "owner_type": "agent_session",
                "objective": "错误 owner"
            }
        }
    });

    assert_eq!(
        validate_agent_turn_payload_metadata(Some(&metadata)),
        Err(
            "自动化任务 managed_objective.owner_type 必须为 automation_job，当前为 agent_session"
                .to_string()
        )
    );
}

#[test]
fn guard_should_stop_non_active_objective_runs() {
    let conn = setup_db();
    let mut job = agent_job_with_managed_objective();
    replace_managed_objective_binding(&conn, &mut job).expect("绑定 objective 失败");
    update_objective_status_by_owner(
        &conn,
        MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB,
        "job-1",
        ManagedObjectiveStatus::NeedsInput,
        Some("等待用户输入"),
    )
    .expect("更新状态失败");

    let reason = objective_run_block_reason(&conn, &job)
        .expect("读取 guard 失败")
        .expect("应该阻断运行");
    assert!(reason.contains("needs_input"));

    let now = Utc::now().to_rfc3339();
    apply_guard_blocked_job_state(&mut job, &reason, &now);
    assert!(!job.enabled);
    assert_eq!(job.last_status.as_deref(), Some("error"));
    assert_eq!(job.next_run_at, None);
}
