use super::*;
use crate::database::schema::create_tables;
use crate::services::automation_service::AutomationService;
use chrono::Utc;
use lime_core::config::{
    AutomationExecutionMode, AutomationSettings, DeliveryConfig, TaskSchedule,
};
use lime_core::database::dao::agent_run::{AgentRun, AgentRunDao, AgentRunStatus};
use lime_core::database::dao::automation_job::{AutomationJob, AutomationJobDao};
use lime_core::database::DbConnection;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tokio::sync::RwLock;

fn setup_db() -> DbConnection {
    let conn = rusqlite::Connection::open_in_memory().expect("创建内存数据库失败");
    create_tables(&conn).expect("创建数据表失败");
    Arc::new(Mutex::new(conn))
}

fn due_log_only_job(id: &str) -> AutomationJob {
    let now = Utc::now();
    AutomationJob {
        id: id.to_string(),
        name: "每日摘要".to_string(),
        description: None,
        enabled: true,
        workspace_id: "workspace-1".to_string(),
        execution_mode: AutomationExecutionMode::LogOnly,
        schedule: TaskSchedule::Every { every_secs: 300 },
        payload: json!({
            "kind": "agent_turn",
            "prompt": "生成每日摘要",
            "web_search": false,
            "request_metadata": {
                "harness": {
                    "agent_envelope": {
                        "source": "automation_due_job_test"
                    },
                    "workspace_skill_runtime_enable": {
                        "status": "ready_for_manual_enable"
                    },
                    "managed_objective": {
                        "owner_type": "automation_job",
                        "state": "planned",
                        "objective": "每天生成可审计摘要",
                        "success_criteria": [
                            "通过 automation due job 执行",
                            "metadata 进入 evidence pack"
                        ],
                        "completion_audit": "artifact_or_evidence_required"
                    }
                }
            }
        }),
        delivery: DeliveryConfig::default(),
        timeout_secs: None,
        max_retries: 2,
        next_run_at: Some((now - chrono::Duration::minutes(1)).to_rfc3339()),
        last_status: None,
        last_error: None,
        last_run_at: None,
        last_finished_at: None,
        running_started_at: None,
        consecutive_failures: 0,
        last_retry_count: 0,
        auto_disabled_until: None,
        last_delivery: None,
        created_at: now.to_rfc3339(),
        updated_at: now.to_rfc3339(),
    }
}

fn due_daily_report_objective_job(id: &str) -> AutomationJob {
    let mut job = due_log_only_job(id);
    job.payload = json!({
        "kind": "agent_turn",
        "prompt": "生成 Markdown 趋势摘要",
        "web_search": false,
        "request_metadata": {
            "harness": {
                "agent_envelope": {
                    "source": "automation_due_job_test"
                },
                "workspace_skill_runtime_enable": {
                    "status": "ready_for_manual_enable"
                },
                "managed_objective": {
                    "owner_type": "automation_job",
                    "state": "planned",
                    "objective": "每天 9 点生成 Markdown 趋势摘要，连续 7 次成功后完成。失败最多重试 2 次，之后提醒我检查配置。",
                    "success_criteria": [
                        "每天 9 点生成 Markdown 趋势摘要",
                        "产出 Markdown artifact",
                        "evidence pack 记录调用、产物、失败、预算与 audit",
                        "连续 7 次成功后完成"
                    ],
                    "budget_policy": {
                        "max_estimated_cost": 0,
                        "currency": "CNY"
                    },
                    "risk_policy": {
                        "read_only": true,
                        "external_write": false
                    },
                    "continuation_policy": {
                        "mode": "automation_due_job",
                        "dispatch": "agent_runtime_submit_turn"
                    },
                    "completion_audit": {
                        "kind": "artifact_or_evidence_required",
                        "required_successes": 7,
                        "failure_block_after": 2,
                        "evidence_pack_ref": ".lime/harness/daily-report/evidence-pack",
                        "artifact_refs": ["reports/daily-trends.md"],
                        "blocked_user_prompt": "请检查自动化配置后重试"
                    }
                }
            }
        }
    });
    job
}

fn insert_historical_automation_success_run(
    conn: &rusqlite::Connection,
    job_id: &str,
    index: usize,
) {
    let now = Utc::now() - chrono::Duration::minutes((index + 1) as i64);
    let timestamp = now.to_rfc3339();
    AgentRunDao::create_run(
        conn,
        &AgentRun {
            id: format!("{job_id}-historical-success-{index}"),
            source: "automation".to_string(),
            source_ref: Some(job_id.to_string()),
            session_id: None,
            status: AgentRunStatus::Success,
            started_at: timestamp.clone(),
            finished_at: Some(timestamp.clone()),
            duration_ms: Some(100),
            error_code: None,
            error_message: None,
            metadata: Some(
                json!({
                    "job_id": job_id,
                    "status": "success",
                    "harness": {
                        "managed_objective": {
                            "owner_id": job_id
                        }
                    }
                })
                .to_string(),
            ),
            created_at: timestamp.clone(),
            updated_at: timestamp,
        },
    )
    .expect("写入历史 automation run 失败");
}

fn parse_run_metadata(run: &lime_core::database::dao::agent_run::AgentRun) -> Value {
    run.metadata
        .as_deref()
        .and_then(|value| serde_json::from_str::<Value>(value).ok())
        .expect("run metadata 应为 JSON")
}

#[tokio::test]
async fn daily_report_due_job_should_complete_after_seventh_success_with_audit_refs() {
    let db = setup_db();
    let job_id = "job-due-daily-report-complete";
    {
        let conn = db.lock().expect("数据库锁定失败");
        let mut job = due_daily_report_objective_job(job_id);
        replace_managed_objective_binding(&conn, &mut job).expect("绑定 objective 失败");
        AutomationJobDao::create(&conn, &job).expect("创建 automation job 失败");
        for index in 0..6 {
            insert_historical_automation_success_run(&conn, job_id, index);
        }
    }

    let mut service = AutomationService::new(AutomationSettings {
        enabled: true,
        poll_interval_secs: 5,
        enable_history: true,
    });
    service.set_db(db.clone());
    let service_ref = Arc::new(RwLock::new(service));

    AutomationService::execute_due_jobs(&service_ref, &db, &None)
        .await
        .expect("执行 due job 失败");

    let conn = db.lock().expect("数据库锁定失败");
    let objective = get_objective_by_owner(&conn, MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB, job_id)
        .expect("读取 objective 失败")
        .expect("objective 不存在");
    assert_eq!(objective.status, ManagedObjectiveStatus::Completed);
    assert_eq!(
        objective.last_evidence_pack_ref.as_deref(),
        Some(".lime/harness/daily-report/evidence-pack")
    );
    assert_eq!(
        objective.last_artifact_refs,
        vec!["reports/daily-trends.md"]
    );
    assert!(objective
        .last_audit_summary
        .as_deref()
        .unwrap_or_default()
        .contains("成功 7/7"));

    let job = AutomationJobDao::get(&conn, job_id)
        .expect("读取 automation job 失败")
        .expect("automation job 不存在");
    assert!(!job.enabled);
    assert_eq!(job.next_run_at, None);
    assert_eq!(
        job.payload
            .pointer("/request_metadata/harness/managed_objective/state")
            .and_then(Value::as_str),
        Some("completed")
    );
    assert_eq!(
        job.payload
            .pointer("/request_metadata/harness/managed_objective/last_evidence_pack_ref")
            .and_then(Value::as_str),
        Some(".lime/harness/daily-report/evidence-pack")
    );

    let runs = AgentRunDao::list_runs_by_source_ref(&conn, "automation", job_id, 10)
        .expect("读取 automation runs 失败");
    assert_eq!(
        runs.iter()
            .filter(|run| run.status == AgentRunStatus::Success)
            .count(),
        7
    );
    let latest_metadata = parse_run_metadata(&runs[0]);
    assert_eq!(
        latest_metadata.pointer("/harness/managed_objective/state"),
        Some(&json!("completed"))
    );
    assert_eq!(
        latest_metadata.pointer("/harness/managed_objective/last_artifact_refs/0"),
        Some(&json!("reports/daily-trends.md"))
    );
}

#[test]
fn daily_report_failure_should_block_after_policy_cutoff_and_prompt_config_check() {
    let conn = rusqlite::Connection::open_in_memory().expect("创建内存数据库失败");
    create_tables(&conn).expect("创建数据表失败");
    let mut job = due_daily_report_objective_job("job-due-daily-report-fail");
    replace_managed_objective_binding(&conn, &mut job).expect("绑定 objective 失败");
    job.consecutive_failures = 2;
    job.next_run_at = Some("2026-05-25T09:00:00Z".to_string());

    apply_terminal_managed_objective_state(&conn, &mut job, "error", "Provider 未配置")
        .expect("更新 objective 失败");

    let objective = get_objective_by_owner(
        &conn,
        MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB,
        "job-due-daily-report-fail",
    )
    .expect("读取 objective 失败")
    .expect("objective 不存在");
    assert_eq!(objective.status, ManagedObjectiveStatus::Blocked);
    assert!(!job.enabled);
    assert_eq!(job.next_run_at, None);
    let blocker_reason = objective.blocker_reason.as_deref().unwrap_or_default();
    assert!(blocker_reason.contains("连续失败 2 次"));
    assert!(blocker_reason.contains("检查自动化配置"));
}

#[tokio::test]
async fn due_job_should_advance_active_objective_and_record_owner_metadata() {
    let db = setup_db();
    let job_id = "job-due-active";
    {
        let conn = db.lock().expect("数据库锁定失败");
        let mut job = due_log_only_job(job_id);
        replace_managed_objective_binding(&conn, &mut job).expect("绑定 objective 失败");
        AutomationJobDao::create(&conn, &job).expect("创建 automation job 失败");
    }

    let mut service = AutomationService::new(AutomationSettings {
        enabled: true,
        poll_interval_secs: 5,
        enable_history: true,
    });
    service.set_db(db.clone());
    let service_ref = Arc::new(RwLock::new(service));

    AutomationService::execute_due_jobs(&service_ref, &db, &None)
        .await
        .expect("执行 due job 失败");

    let conn = db.lock().expect("数据库锁定失败");
    let job = AutomationJobDao::get(&conn, job_id)
        .expect("读取 automation job 失败")
        .expect("automation job 不存在");
    assert_eq!(job.last_status.as_deref(), Some("success"));
    assert_eq!(job.consecutive_failures, 0);
    assert!(job.next_run_at.is_some());

    let objective = get_objective_by_owner(&conn, MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB, job_id)
        .expect("读取 objective 失败")
        .expect("objective 不存在");
    assert_eq!(objective.status, ManagedObjectiveStatus::Active);
    assert!(objective
        .last_audit_summary
        .as_deref()
        .unwrap_or_default()
        .contains("completed 仍需 artifact"));

    let runs = AgentRunDao::list_runs_by_source_ref(&conn, "automation", job_id, 10)
        .expect("读取 automation runs 失败");
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].status.as_str(), "success");
    let metadata = parse_run_metadata(&runs[0]);
    assert_eq!(
        metadata.pointer("/harness/managed_objective/owner_id"),
        Some(&json!(job_id))
    );
    assert_eq!(
        metadata.pointer("/harness/managed_objective/objective_id"),
        Some(&json!(objective.objective_id))
    );
    assert_eq!(
        metadata.pointer("/harness/managed_objective/completion_audit"),
        Some(&json!("artifact_or_evidence_required"))
    );

    let service_status = service_ref.read().await.get_status();
    assert_eq!(service_status.total_executions, 1);
    assert_eq!(service_status.last_job_count, 1);
}

#[tokio::test]
async fn due_job_should_recover_bound_objective_after_service_restart_without_replacing_it() {
    let db = setup_db();
    let job_id = "job-due-restart-recovery";
    let original_objective_id = {
        let conn = db.lock().expect("数据库锁定失败");
        let mut job = due_log_only_job(job_id);
        replace_managed_objective_binding(&conn, &mut job).expect("绑定 objective 失败");
        AutomationJobDao::create(&conn, &job).expect("创建 automation job 失败");
        get_objective_by_owner(&conn, MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB, job_id)
            .expect("读取 objective 失败")
            .expect("objective 不存在")
            .objective_id
    };

    let mut restarted_service = AutomationService::new(AutomationSettings {
        enabled: true,
        poll_interval_secs: 5,
        enable_history: true,
    });
    restarted_service.set_db(db.clone());
    let restarted_service_ref = Arc::new(RwLock::new(restarted_service));

    AutomationService::execute_due_jobs(&restarted_service_ref, &db, &None)
        .await
        .expect("重启后执行 due job 失败");

    let conn = db.lock().expect("数据库锁定失败");
    let objective = get_objective_by_owner(&conn, MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB, job_id)
        .expect("读取 objective 失败")
        .expect("objective 不存在");
    assert_eq!(objective.objective_id, original_objective_id);
    assert_eq!(objective.status, ManagedObjectiveStatus::Active);

    let job = AutomationJobDao::get(&conn, job_id)
        .expect("读取 automation job 失败")
        .expect("automation job 不存在");
    assert_eq!(
        job.payload
            .pointer("/request_metadata/harness/managed_objective/objective_id")
            .and_then(Value::as_str),
        Some(original_objective_id.as_str())
    );

    let runs = AgentRunDao::list_runs_by_source_ref(&conn, "automation", job_id, 10)
        .expect("读取 automation runs 失败");
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].status, AgentRunStatus::Success);
    let metadata = parse_run_metadata(&runs[0]);
    assert_eq!(
        metadata.pointer("/harness/managed_objective/owner_id"),
        Some(&json!(job_id))
    );
    assert_eq!(
        metadata.pointer("/harness/managed_objective/objective_id"),
        Some(&json!(original_objective_id))
    );
}

#[tokio::test]
async fn due_job_should_stop_when_bound_objective_needs_input() {
    let db = setup_db();
    let job_id = "job-due-needs-input";
    {
        let conn = db.lock().expect("数据库锁定失败");
        let mut job = due_log_only_job(job_id);
        replace_managed_objective_binding(&conn, &mut job).expect("绑定 objective 失败");
        update_objective_status_by_owner(
            &conn,
            MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB,
            job_id,
            ManagedObjectiveStatus::NeedsInput,
            Some("等待用户输入"),
        )
        .expect("更新 objective 状态失败");
        AutomationJobDao::create(&conn, &job).expect("创建 automation job 失败");
    }

    let mut service = AutomationService::new(AutomationSettings {
        enabled: true,
        poll_interval_secs: 5,
        enable_history: true,
    });
    service.set_db(db.clone());
    let service_ref = Arc::new(RwLock::new(service));

    AutomationService::execute_due_jobs(&service_ref, &db, &None)
        .await
        .expect("执行 due job 失败");

    let conn = db.lock().expect("数据库锁定失败");
    let job = AutomationJobDao::get(&conn, job_id)
        .expect("读取 automation job 失败")
        .expect("automation job 不存在");
    assert!(!job.enabled);
    assert_eq!(job.last_status.as_deref(), Some("error"));
    assert_eq!(job.next_run_at, None);
    assert!(job
        .last_error
        .as_deref()
        .unwrap_or_default()
        .contains("needs_input"));

    let runs = AgentRunDao::list_runs_by_source_ref(&conn, "automation", job_id, 10)
        .expect("读取 automation runs 失败");
    assert!(runs.is_empty());
}
