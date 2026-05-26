use super::*;
use crate::database::schema::create_tables;
use lime_core::database::dao::agent_run::{AgentRunDao, AgentRunStatus};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};

fn setup_db() -> DbConnection {
    let conn = Connection::open_in_memory().expect("创建内存数据库失败");
    create_tables(&conn).expect("创建数据表失败");
    Arc::new(Mutex::new(conn))
}

fn daily_report_agent_turn_job() -> AutomationJobRecord {
    AutomationJob {
        id: "job-daily-report-runtime".to_string(),
        name: "每日趋势摘要".to_string(),
        description: Some("每天生成 Markdown 趋势摘要".to_string()),
        enabled: true,
        workspace_id: "workspace-1".to_string(),
        execution_mode: AutomationExecutionMode::Skill,
        schedule: TaskSchedule::Every { every_secs: 300 },
        payload: json!({
            "kind": "agent_turn",
            "prompt": "生成 Markdown 趋势摘要",
            "web_search": false,
            "approval_policy": "on-request",
            "sandbox_policy": "read-only",
            "request_metadata": {
                "harness": {
                    "agent_envelope": {
                        "source": "automation_agent_turn",
                        "skill": "project:daily-trend-report",
                        "source_draft_id": "capdraft-daily-report"
                    },
                    "workspace_skill_runtime_enable": {
                        "source": "agent_envelope_scheduled_run",
                        "bindings": [{
                            "skill": "project:daily-trend-report",
                            "source_draft_id": "capdraft-daily-report"
                        }]
                    },
                    "managed_objective": {
                        "source": "managed_objective_due_job",
                        "owner_type": "automation_job",
                        "owner_id": "job-daily-report-runtime",
                        "objective_id": "objective-daily-report-runtime",
                        "continuation_policy": {
                            "dispatch": "agent_runtime_submit_turn"
                        },
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
        created_at: "2026-05-26T09:00:00Z".to_string(),
        updated_at: "2026-05-26T09:00:00Z".to_string(),
    }
}

#[test]
fn agent_turn_finish_metadata_should_make_automation_owner_queryable_by_runtime_session() {
    let db = setup_db();
    let tracker = ExecutionTracker::new(db.clone());
    let job = daily_report_agent_turn_job();
    let handle = tracker
        .start(
            RunSource::Automation,
            Some(job.id.clone()),
            None,
            Some(build_tracker_start_metadata(&job)),
        )
        .expect("应创建 automation run");

    let finish_metadata = build_tracker_finish_metadata(
        &job,
        Some("session-daily-report-runtime"),
        "success",
        "success",
        0,
        1200,
        None,
    );

    assert_eq!(
        finish_metadata.pointer("/harness/managed_objective/owner_id"),
        Some(&json!("job-daily-report-runtime"))
    );
    assert_eq!(
        finish_metadata.pointer("/harness/managed_objective/objective_id"),
        Some(&json!("objective-daily-report-runtime"))
    );
    assert_eq!(
        finish_metadata.pointer("/harness/managed_objective/continuation_policy/dispatch"),
        Some(&json!("agent_runtime_submit_turn"))
    );
    assert_eq!(
        finish_metadata.pointer("/harness/workspace_skill_runtime_enable/bindings/0/skill"),
        Some(&json!("project:daily-trend-report"))
    );

    tracker.finish_with_status_and_session(
        &handle,
        Some("session-daily-report-runtime"),
        AgentRunStatus::Success,
        None,
        None,
        Some(finish_metadata),
    );

    let runs = {
        let conn = db.lock().expect("数据库锁定失败");
        AgentRunDao::list_runs_by_session(&conn, "session-daily-report-runtime", 10)
            .expect("按 session 查询 automation owner run 失败")
    };
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].source, "automation");
    assert_eq!(
        runs[0].source_ref.as_deref(),
        Some("job-daily-report-runtime")
    );
    assert_eq!(
        runs[0].session_id.as_deref(),
        Some("session-daily-report-runtime")
    );
    assert_eq!(runs[0].status, AgentRunStatus::Success);

    let metadata = runs[0]
        .metadata
        .as_deref()
        .and_then(|value| serde_json::from_str::<Value>(value).ok())
        .expect("run metadata 应为 JSON");
    assert_eq!(
        metadata.pointer("/harness/managed_objective/source"),
        Some(&json!("managed_objective_due_job"))
    );
    assert_eq!(
        metadata.pointer("/harness/managed_objective/completion_audit"),
        Some(&json!("artifact_or_evidence_required"))
    );
}
