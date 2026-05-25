//! Evidence pack owner run 的 DB session 查询契约。
//!
//! 该文件只覆盖 automation run 从 `agent_runs.session_id` 进入 evidence pack 的链路，
//! 避免继续扩大主 evidence pack fixture 测试文件。

use super::*;
use crate::agent::SessionDetail;
use crate::commands::aster_agent_cmd::{
    AgentRuntimeThreadEvidenceSummary, AgentRuntimeThreadReadModel,
    AgentRuntimeThreadTelemetrySummary, AgentRuntimeThreadToolCallView,
    AgentRuntimeThreadTurnProfileView,
};
use crate::database::schema::create_tables;
use crate::services::execution_tracker_service::{ExecutionTracker, RunSource};
use lime_core::database::dao::agent_run::{AgentRunDao, AgentRunStatus};
use lime_core::database::dao::agent_timeline::{
    AgentThreadItem, AgentThreadItemPayload, AgentThreadItemStatus, AgentThreadTurn,
    AgentThreadTurnStatus,
};
use lime_core::database::DbConnection;
use serde_json::{json, Value};
use std::fs;
use std::sync::{Arc, Mutex};
use tempfile::TempDir;

fn setup_db() -> DbConnection {
    let conn = rusqlite::Connection::open_in_memory().expect("创建内存数据库失败");
    create_tables(&conn).expect("创建数据表失败");
    Arc::new(Mutex::new(conn))
}

fn build_session_detail(workspace_root: &str) -> SessionDetail {
    SessionDetail {
        id: "session-automation-owner".to_string(),
        name: "Managed Objective 每日报告 fixture".to_string(),
        created_at: 1,
        updated_at: 2,
        thread_id: "thread-automation-owner".to_string(),
        model: Some("mock-model".to_string()),
        working_dir: Some(workspace_root.to_string()),
        workspace_id: None,
        messages: Vec::new(),
        execution_strategy: Some("react".to_string()),
        execution_runtime: None,
        turns: vec![AgentThreadTurn {
            id: "turn-report-1".to_string(),
            thread_id: "thread-automation-owner".to_string(),
            prompt_text: "生成 Markdown 趋势摘要".to_string(),
            status: AgentThreadTurnStatus::Completed,
            started_at: "2026-05-26T09:00:00Z".to_string(),
            completed_at: Some("2026-05-26T09:01:00Z".to_string()),
            error_message: None,
            created_at: "2026-05-26T09:00:00Z".to_string(),
            updated_at: "2026-05-26T09:01:00Z".to_string(),
        }],
        items: vec![
            AgentThreadItem {
                id: "artifact-report-1".to_string(),
                thread_id: "thread-automation-owner".to_string(),
                turn_id: "turn-report-1".to_string(),
                sequence: 1,
                status: AgentThreadItemStatus::Completed,
                started_at: "2026-05-26T09:00:20Z".to_string(),
                completed_at: Some("2026-05-26T09:00:20Z".to_string()),
                updated_at: "2026-05-26T09:00:20Z".to_string(),
                payload: AgentThreadItemPayload::FileArtifact {
                    path: ".lime/artifacts/thread-automation-owner/daily-trends.md".to_string(),
                    source: "automation_agent_turn".to_string(),
                    content: None,
                    metadata: Some(json!({
                        "artifactKind": "markdown_report",
                        "permissionLevel": "read_only",
                        "title": "每日趋势摘要"
                    })),
                },
            },
            AgentThreadItem {
                id: "workspace-skill-report-1".to_string(),
                thread_id: "thread-automation-owner".to_string(),
                turn_id: "turn-report-1".to_string(),
                sequence: 2,
                status: AgentThreadItemStatus::Completed,
                started_at: "2026-05-26T09:00:30Z".to_string(),
                completed_at: Some("2026-05-26T09:00:31Z".to_string()),
                updated_at: "2026-05-26T09:00:31Z".to_string(),
                payload: AgentThreadItemPayload::ToolCall {
                    tool_name: "project:daily-trend-report".to_string(),
                    arguments: Some(json!({"mode": "readonly"})),
                    output: Some("已生成 Markdown 趋势摘要。".to_string()),
                    success: Some(true),
                    error: None,
                    metadata: Some(json!({
                        "workspace_skill_source": {
                            "authorizationScope": "session",
                            "sourceDraftId": "capdraft-daily-report"
                        },
                        "workspace_skill_runtime_enable": {
                            "source": "agent_envelope_scheduled_run",
                            "skill": "project:daily-trend-report",
                            "source_draft_id": "capdraft-daily-report"
                        }
                    })),
                },
            },
        ],
        todo_items: Vec::new(),
        child_subagent_sessions: Vec::new(),
        subagent_parent_context: None,
    }
}

fn build_thread_read() -> AgentRuntimeThreadReadModel {
    AgentRuntimeThreadReadModel {
        thread_id: "thread-automation-owner".to_string(),
        status: "completed".to_string(),
        profile_status: "completed".to_string(),
        active_turn_id: None,
        turns: vec![AgentRuntimeThreadTurnProfileView {
            turn_id: "turn-report-1".to_string(),
            status: "completed".to_string(),
            native_status: "completed".to_string(),
        }],
        pending_requests: Vec::new(),
        last_outcome: None,
        incidents: Vec::new(),
        queued_turns: Vec::new(),
        tool_calls: vec![AgentRuntimeThreadToolCallView {
            tool_call_id: "workspace-skill-report-1".to_string(),
            turn_id: "turn-report-1".to_string(),
            tool_name: "project:daily-trend-report".to_string(),
            status: "completed".to_string(),
            started_at: Some("2026-05-26T09:00:30Z".to_string()),
            finished_at: Some("2026-05-26T09:00:31Z".to_string()),
            updated_at: Some("2026-05-26T09:00:31Z".to_string()),
            arguments: Some(json!({"mode": "readonly"})),
            output: Some("已生成 Markdown 趋势摘要。".to_string()),
            output_preview: Some("已生成 Markdown 趋势摘要。".to_string()),
            success: Some(true),
            error: None,
            evidence_refs: Vec::new(),
        }],
        artifacts: Vec::new(),
        model_routing: None,
        evidence_summary: AgentRuntimeThreadEvidenceSummary {
            evidence_refs: vec!["artifact://daily-trends".to_string()],
            verification_outcomes: Vec::new(),
        },
        telemetry_summary: AgentRuntimeThreadTelemetrySummary {
            trace_ids: vec!["trace-report-1".to_string()],
            join_status: "matched".to_string(),
        },
        context_summary: None,
        interrupt_state: None,
        updated_at: Some("2026-05-26T09:01:00Z".to_string()),
        latest_compaction_boundary: None,
        file_checkpoint_summary: None,
        diagnostics: None,
        task_kind: Some("daily_report".to_string()),
        service_model_slot: Some("planner".to_string()),
        routing_mode: Some("mock".to_string()),
        decision_source: Some("fixture".to_string()),
        decision_reason: Some("非 live fixture".to_string()),
        candidate_count: Some(1),
        fallback_chain: None,
        capability_gap: None,
        estimated_cost_class: Some("zero".to_string()),
        single_candidate_only: Some(true),
        oem_policy: None,
        runtime_summary: None,
        auxiliary_task_runtime: None,
        limit_state: None,
        cost_state: None,
        permission_state: None,
        limit_event: None,
        managed_objective: None,
    }
}

fn automation_owner_metadata() -> Value {
    json!({
        "job_id": "job-daily-report",
        "job_name": "每日趋势摘要",
        "harness": {
            "agent_envelope": {
                "source": "automation_agent_turn",
                "skill": "project:daily-trend-report",
                "source_draft_id": "capdraft-daily-report"
            },
            "managed_objective": {
                "source": "managed_objective_due_job",
                "owner_type": "automation_job",
                "owner_id": "job-daily-report",
                "objective_id": "objective-daily-report",
                "completion_audit": "artifact_or_evidence_required"
            },
            "workspace_skill_runtime_enable": {
                "source": "agent_envelope_scheduled_run",
                "bindings": [{
                    "skill": "project:daily-trend-report",
                    "source_draft_id": "capdraft-daily-report"
                }]
            }
        }
    })
}

#[test]
fn evidence_pack_should_consume_automation_owner_run_loaded_by_session() {
    let db = setup_db();
    let workspace = TempDir::new().expect("temp workspace");
    let detail = build_session_detail(&workspace.path().to_string_lossy());
    let thread_read = build_thread_read();
    let tracker = ExecutionTracker::new(db.clone());
    let handle = tracker
        .start(
            RunSource::Automation,
            Some("job-daily-report".to_string()),
            None,
            None,
        )
        .expect("应创建 automation run");

    tracker.finish_with_status_and_session(
        &handle,
        Some("session-automation-owner"),
        AgentRunStatus::Success,
        None,
        None,
        Some(automation_owner_metadata()),
    );

    let owner_runs = {
        let conn = db.lock().expect("数据库锁定失败");
        AgentRunDao::list_runs_by_session(&conn, "session-automation-owner", 20)
            .expect("按 session 查询 owner runs 失败")
    };
    assert_eq!(owner_runs.len(), 1);
    assert_eq!(
        owner_runs[0].source_ref.as_deref(),
        Some("job-daily-report")
    );

    let export_result = export_runtime_evidence_pack_with_owner_runs(
        &detail,
        &thread_read,
        workspace.path(),
        &owner_runs,
    )
    .expect("导出 evidence pack");

    assert_eq!(
        export_result.completion_audit_summary.pointer("/decision"),
        Some(&json!("completed"))
    );
    assert_eq!(
        export_result
            .completion_audit_summary
            .pointer("/requiredEvidence/automationOwner"),
        Some(&json!(true))
    );

    let runtime_path = workspace
        .path()
        .join(".lime/harness/sessions/session-automation-owner/evidence/runtime.json");
    let runtime = fs::read_to_string(runtime_path).expect("读取 runtime evidence");
    let runtime = serde_json::from_str::<Value>(&runtime).expect("runtime json");

    assert_eq!(runtime.pointer("/automationOwners/count"), Some(&json!(1)));
    assert_eq!(
        runtime.pointer("/automationOwners/runs/0/sessionId"),
        Some(&json!("session-automation-owner"))
    );
    assert_eq!(
        runtime.pointer("/automationOwners/runs/0/sourceRef"),
        Some(&json!("job-daily-report"))
    );
    assert_eq!(
        runtime.pointer("/automationOwners/runs/0/managedObjective/objective_id"),
        Some(&json!("objective-daily-report"))
    );
    assert_eq!(
        runtime.pointer("/completionAuditSummary/decision"),
        Some(&json!("completed"))
    );
}
