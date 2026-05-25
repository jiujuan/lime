//! 自动化任务与 Managed Objective 的绑定边界。
//!
//! 该模块只负责 automation job owner 的 objective 持久化、metadata 回填
//! 与运行 guard；调度仍属于 automation service，完成事实仍属于 evidence pack。

use super::{AutomationJobRecord, AutomationPayload};
use lime_core::database::dao::automation_job::AutomationJobDao;
use lime_core::database::managed_objective_repository::{
    get_objective_by_owner, update_objective_audit_by_owner, update_objective_status_by_owner,
    upsert_objective, ManagedObjectiveAuditUpdate, ManagedObjectiveRecord, ManagedObjectiveStatus,
    ManagedObjectiveUpsert, MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB,
};
use rusqlite::Connection;
use serde_json::{json, Map, Value};

const COMPLETION_AUDIT_ARTIFACT_OR_EVIDENCE: &str = "artifact_or_evidence_required";
const AUTOMATION_FAILURE_BLOCK_CUTOFF: u32 = 3;

#[derive(Debug, Clone)]
struct AutomationObjectiveBinding {
    objective_text: String,
    success_criteria: Vec<String>,
    budget_policy: Option<Value>,
    risk_policy: Option<Value>,
    approval_policy: Option<Value>,
    continuation_policy: Option<Value>,
}

pub(super) fn validate_agent_turn_payload_metadata(
    request_metadata: Option<&Value>,
) -> Result<(), String> {
    let _ = read_binding_from_request_metadata(request_metadata)?;
    Ok(())
}

pub(super) fn replace_managed_objective_binding(
    conn: &Connection,
    job: &mut AutomationJobRecord,
) -> Result<bool, String> {
    let Some(binding) = read_binding_from_job(job)? else {
        return Ok(false);
    };

    let objective = upsert_objective(
        conn,
        ManagedObjectiveUpsert {
            workspace_id: Some(job.workspace_id.clone()),
            owner_kind: MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB.to_string(),
            owner_id: job.id.clone(),
            objective_text: binding.objective_text,
            success_criteria: binding.success_criteria,
            budget_policy: binding.budget_policy,
            risk_policy: binding.risk_policy,
            approval_policy: binding.approval_policy,
            continuation_policy: binding.continuation_policy,
        },
    )?;

    let payload_changed = write_bound_objective_metadata(job, &objective)?;
    sync_job_enabled_to_objective(conn, job)?;
    Ok(payload_changed)
}

pub(super) fn ensure_managed_objective_binding(
    conn: &Connection,
    job: &mut AutomationJobRecord,
) -> Result<bool, String> {
    if read_binding_from_job(job)?.is_none() {
        return Ok(false);
    }

    let objective =
        match get_objective_by_owner(conn, MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB, &job.id)? {
            Some(objective) => objective,
            None => {
                replace_managed_objective_binding(conn, job)?;
                return Ok(true);
            }
        };

    write_bound_objective_metadata(job, &objective)
}

pub(super) fn refresh_managed_objective_projection(
    conn: &Connection,
    job: &mut AutomationJobRecord,
) -> Result<bool, String> {
    let Some(objective) =
        get_objective_by_owner(conn, MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB, &job.id)?
    else {
        return Ok(false);
    };

    write_bound_objective_metadata(job, &objective)
}

pub(super) fn sync_job_enabled_to_objective(
    conn: &Connection,
    job: &AutomationJobRecord,
) -> Result<(), String> {
    let Some(objective) =
        get_objective_by_owner(conn, MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB, &job.id)?
    else {
        return Ok(());
    };

    if !job.enabled {
        update_objective_status_by_owner(
            conn,
            MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB,
            &job.id,
            ManagedObjectiveStatus::Paused,
            Some("automation job 已暂停"),
        )?;
        return Ok(());
    }

    if objective.status == ManagedObjectiveStatus::Paused {
        update_objective_status_by_owner(
            conn,
            MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB,
            &job.id,
            ManagedObjectiveStatus::Active,
            None,
        )?;
    }
    Ok(())
}

pub(super) fn prepare_job_for_managed_objective_run(
    conn: &Connection,
    job: &mut AutomationJobRecord,
    timestamp: &str,
) -> Result<bool, String> {
    let payload_changed = ensure_managed_objective_binding(conn, job)?;
    if let Some(reason) = objective_run_block_reason(conn, job)? {
        apply_guard_blocked_job_state(job, &reason, timestamp);
        AutomationJobDao::update(conn, job)
            .map_err(|error| format!("保存目标阻断后的自动化任务状态失败: {error}"))?;
        return Ok(true);
    }

    if payload_changed {
        AutomationJobDao::update(conn, job)
            .map_err(|error| format!("保存目标绑定后的自动化任务失败: {error}"))?;
    }
    Ok(false)
}

pub(super) fn objective_run_block_reason(
    conn: &Connection,
    job: &AutomationJobRecord,
) -> Result<Option<String>, String> {
    let Some(objective) =
        get_objective_by_owner(conn, MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB, &job.id)?
    else {
        return Ok(None);
    };

    if objective.status == ManagedObjectiveStatus::Active {
        return Ok(None);
    }

    Ok(Some(format!(
        "自动化任务绑定目标状态为 {}，已停止自动续跑",
        objective.status.as_str()
    )))
}

pub(super) fn apply_guard_blocked_job_state(
    job: &mut AutomationJobRecord,
    reason: &str,
    timestamp: &str,
) {
    job.enabled = false;
    job.next_run_at = None;
    job.last_status = Some("error".to_string());
    job.last_error = Some(reason.to_string());
    job.last_run_at = Some(timestamp.to_string());
    job.last_finished_at = Some(timestamp.to_string());
    job.running_started_at = None;
    job.auto_disabled_until = None;
    job.updated_at = timestamp.to_string();
}

pub(super) fn apply_terminal_managed_objective_state(
    conn: &Connection,
    job: &mut AutomationJobRecord,
    status: &str,
    output: &str,
) -> Result<(), String> {
    let Some(objective) =
        get_objective_by_owner(conn, MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB, &job.id)?
    else {
        return Ok(());
    };

    if matches!(
        objective.status,
        ManagedObjectiveStatus::Paused
            | ManagedObjectiveStatus::Completed
            | ManagedObjectiveStatus::Failed
    ) {
        return Ok(());
    }

    if status == "success" {
        update_objective_audit_by_owner(
            conn,
            MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB,
            &job.id,
            ManagedObjectiveAuditUpdate {
                status: ManagedObjectiveStatus::Active,
                last_audit_summary: Some(format!(
                    "automation job {} 执行成功；completed 仍需 artifact / timeline / evidence pack 审计确认。",
                    job.id
                )),
                last_evidence_pack_ref: None,
                last_artifact_refs: Vec::new(),
                blocker_reason: None,
            },
        )?;
        return Ok(());
    }

    if job.consecutive_failures >= AUTOMATION_FAILURE_BLOCK_CUTOFF {
        let blocker_reason = format!(
            "automation job 连续失败 {} 次，最近错误：{}",
            job.consecutive_failures,
            output.trim()
        );
        job.enabled = false;
        job.next_run_at = None;
        job.auto_disabled_until = None;
        update_objective_audit_by_owner(
            conn,
            MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB,
            &job.id,
            ManagedObjectiveAuditUpdate {
                status: ManagedObjectiveStatus::Blocked,
                last_audit_summary: Some(format!(
                    "automation job {} 已达到连续失败阈值，目标进入 blocked。",
                    job.id
                )),
                last_evidence_pack_ref: None,
                last_artifact_refs: Vec::new(),
                blocker_reason: Some(blocker_reason),
            },
        )?;
        return Ok(());
    }

    update_objective_audit_by_owner(
        conn,
        MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB,
        &job.id,
        ManagedObjectiveAuditUpdate {
            status: ManagedObjectiveStatus::Active,
            last_audit_summary: Some(format!(
                "automation job {} 本次执行失败；未达到连续失败阈值，等待下一次 automation 调度。",
                job.id
            )),
            last_evidence_pack_ref: None,
            last_artifact_refs: Vec::new(),
            blocker_reason: None,
        },
    )?;
    Ok(())
}

fn read_binding_from_job(
    job: &AutomationJobRecord,
) -> Result<Option<AutomationObjectiveBinding>, String> {
    let payload = serde_json::from_value::<AutomationPayload>(job.payload.clone())
        .map_err(|error| format!("解析自动化负载失败: {error}"))?;

    match payload {
        AutomationPayload::AgentTurn {
            request_metadata, ..
        } => read_binding_from_request_metadata(request_metadata.as_ref()),
        AutomationPayload::BrowserSession { .. } => Ok(None),
    }
}

fn read_binding_from_request_metadata(
    request_metadata: Option<&Value>,
) -> Result<Option<AutomationObjectiveBinding>, String> {
    let Some(request_metadata) = request_metadata else {
        return Ok(None);
    };
    let request_metadata = request_metadata
        .as_object()
        .ok_or_else(|| "自动化任务 request_metadata 必须为对象".to_string())?;
    let Some(harness) = object_field(request_metadata, &["harness"])? else {
        return Ok(None);
    };
    let Some(managed_objective) =
        object_field(harness, &["managed_objective", "managedObjective"])?
    else {
        return Ok(None);
    };

    let owner_type = string_field(
        managed_objective,
        &["owner_type", "ownerType", "owner_kind", "ownerKind"],
    );
    if let Some(owner_type) = owner_type.as_deref().filter(|value| !value.is_empty()) {
        if owner_type != MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB {
            return Err(format!(
                "自动化任务 managed_objective.owner_type 必须为 automation_job，当前为 {owner_type}"
            ));
        }
    }

    let objective_text = string_field(
        managed_objective,
        &["objective_text", "objectiveText", "objective"],
    )
    .ok_or_else(|| "自动化任务 managed_objective.objective 必填".to_string())?;
    let success_criteria =
        string_array_field(managed_objective, &["success_criteria", "successCriteria"]);

    Ok(Some(AutomationObjectiveBinding {
        objective_text,
        success_criteria,
        budget_policy: cloned_field(managed_objective, &["budget_policy", "budgetPolicy"]),
        risk_policy: cloned_field(managed_objective, &["risk_policy", "riskPolicy"]),
        approval_policy: cloned_field(managed_objective, &["approval_policy", "approvalPolicy"]),
        continuation_policy: cloned_field(
            managed_objective,
            &["continuation_policy", "continuationPolicy"],
        ),
    }))
}

fn write_bound_objective_metadata(
    job: &mut AutomationJobRecord,
    objective: &ManagedObjectiveRecord,
) -> Result<bool, String> {
    let before = job.payload.clone();
    let Some(managed_objective) = managed_objective_object_mut(&mut job.payload)? else {
        return Ok(false);
    };

    managed_objective.insert(
        "objective_id".to_string(),
        Value::String(objective.objective_id.clone()),
    );
    managed_objective.insert(
        "owner_type".to_string(),
        Value::String(MANAGED_OBJECTIVE_OWNER_AUTOMATION_JOB.to_string()),
    );
    managed_objective.insert("owner_id".to_string(), Value::String(job.id.clone()));
    managed_objective.insert(
        "objective_text".to_string(),
        Value::String(objective.objective_text.clone()),
    );
    managed_objective.insert(
        "success_criteria".to_string(),
        json!(objective.success_criteria.clone()),
    );
    managed_objective.insert(
        "state".to_string(),
        Value::String(objective.status.as_str().to_string()),
    );
    managed_objective.insert(
        "continuation_source".to_string(),
        Value::String("automation_job".to_string()),
    );
    write_optional_string_field(
        managed_objective,
        "last_audit_summary",
        objective.last_audit_summary.as_deref(),
    );
    write_optional_string_field(
        managed_objective,
        "last_evidence_pack_ref",
        objective.last_evidence_pack_ref.as_deref(),
    );
    managed_objective.insert(
        "last_artifact_refs".to_string(),
        json!(objective.last_artifact_refs.clone()),
    );
    write_optional_string_field(
        managed_objective,
        "blocker_reason",
        objective.blocker_reason.as_deref(),
    );
    preserve_completion_audit_detail(managed_objective);
    managed_objective.insert(
        "completion_audit".to_string(),
        Value::String(COMPLETION_AUDIT_ARTIFACT_OR_EVIDENCE.to_string()),
    );

    Ok(job.payload != before)
}

fn write_optional_string_field(object: &mut Map<String, Value>, key: &str, value: Option<&str>) {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => {
            object.insert(key.to_string(), Value::String(value.to_string()));
        }
        None => {
            object.remove(key);
        }
    }
}

fn preserve_completion_audit_detail(managed_objective: &mut Map<String, Value>) {
    let should_preserve = managed_objective
        .get("completion_audit")
        .filter(|value| !value.is_string() && !value.is_null())
        .cloned();
    if let Some(detail) = should_preserve {
        managed_objective
            .entry("completion_audit_detail".to_string())
            .or_insert(detail);
    }
}

fn managed_objective_object_mut(
    payload: &mut Value,
) -> Result<Option<&mut Map<String, Value>>, String> {
    let Some(payload) = payload.as_object_mut() else {
        return Err("自动化任务 payload 必须为对象".to_string());
    };
    let kind = payload.get("kind").and_then(Value::as_str);
    if kind != Some("agent_turn") {
        return Ok(None);
    }

    let request_metadata = payload
        .entry("request_metadata".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if request_metadata.is_null() {
        *request_metadata = Value::Object(Map::new());
    }
    let request_metadata = request_metadata
        .as_object_mut()
        .ok_or_else(|| "自动化任务 request_metadata 必须为对象".to_string())?;

    let harness = request_metadata
        .entry("harness".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if harness.is_null() {
        *harness = Value::Object(Map::new());
    }
    let harness = harness
        .as_object_mut()
        .ok_or_else(|| "自动化任务 request_metadata.harness 必须为对象".to_string())?;

    let managed_objective = harness
        .entry("managed_objective".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if managed_objective.is_null() {
        *managed_objective = Value::Object(Map::new());
    }
    managed_objective
        .as_object_mut()
        .map(Some)
        .ok_or_else(|| "自动化任务 harness.managed_objective 必须为对象".to_string())
}

fn object_field<'a>(
    object: &'a Map<String, Value>,
    keys: &[&str],
) -> Result<Option<&'a Map<String, Value>>, String> {
    let Some(value) = keys.iter().find_map(|key| object.get(*key)) else {
        return Ok(None);
    };
    value
        .as_object()
        .map(Some)
        .ok_or_else(|| format!("自动化任务 {} 必须为对象", keys[0]))
}

fn string_field(object: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| object.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn string_array_field(object: &Map<String, Value>, keys: &[&str]) -> Vec<String> {
    keys.iter()
        .find_map(|key| object.get(*key).and_then(Value::as_array))
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

fn cloned_field(object: &Map<String, Value>, keys: &[&str]) -> Option<Value> {
    keys.iter()
        .find_map(|key| object.get(*key))
        .filter(|value| !value.is_null())
        .cloned()
}

#[cfg(test)]
#[path = "managed_objective_binding_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "managed_objective_due_job_tests.rs"]
mod due_job_tests;
