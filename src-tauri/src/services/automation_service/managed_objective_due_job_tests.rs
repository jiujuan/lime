use super::*;
use crate::database::schema::create_tables;
use crate::services::automation_service::AutomationService;
use chrono::Utc;
use lime_core::config::{
    AutomationExecutionMode, AutomationSettings, DeliveryConfig, TaskSchedule,
};
use lime_core::database::dao::agent_run::AgentRunDao;
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

fn parse_run_metadata(run: &lime_core::database::dao::agent_run::AgentRun) -> Value {
    run.metadata
        .as_deref()
        .and_then(|value| serde_json::from_str::<Value>(value).ok())
        .expect("run metadata 应为 JSON")
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
