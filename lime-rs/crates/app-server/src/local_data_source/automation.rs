use super::data_error;
use super::values_from_serializable_vec;
use crate::RuntimeCoreError;
use app_server_protocol::AutomationJobCreateParams;
use app_server_protocol::AutomationJobDeleteResponse;
use app_server_protocol::AutomationJobHealthParams;
use app_server_protocol::AutomationJobHealthResponse;
use app_server_protocol::AutomationJobIdParams;
use app_server_protocol::AutomationJobListResponse;
use app_server_protocol::AutomationJobReadResponse;
use app_server_protocol::AutomationJobRunHistoryParams;
use app_server_protocol::AutomationJobRunHistoryResponse;
use app_server_protocol::AutomationJobRunNowResponse;
use app_server_protocol::AutomationJobUpdateParams;
use app_server_protocol::AutomationJobWriteResponse;
use app_server_protocol::AutomationScheduleParams;
use app_server_protocol::AutomationSchedulePreviewResponse;
use app_server_protocol::AutomationScheduleValidateResponse;
use app_server_protocol::AutomationSchedulerConfigReadResponse;
use app_server_protocol::AutomationSchedulerConfigUpdateParams;
use app_server_protocol::AutomationSchedulerConfigUpdateResponse;
use app_server_protocol::AutomationSchedulerStatusResponse;
use chrono::DateTime;
use chrono::Duration;
use chrono::Timelike;
use chrono::Utc;
use lime_core::config::load_config;
use lime_core::config::save_config;
use lime_core::config::AutomationExecutionMode;
use lime_core::config::AutomationSettings;
use lime_core::config::DeliveryConfig;
use lime_core::config::TaskSchedule;
use lime_core::database;
use lime_core::database::dao::agent_run::AgentRun;
use lime_core::database::dao::agent_run::AgentRunDao;
use lime_core::database::dao::agent_run::AgentRunStatus;
use lime_core::database::dao::automation_job::AutomationJob;
use lime_core::database::dao::automation_job::AutomationJobDao;
use lime_core::database::DbConnection;
use serde::Deserialize;
use serde_json::json;
use serde_json::Value;
use std::str::FromStr;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
struct AutomationSchedulerConfigRequest {
    #[serde(default)]
    enabled: bool,
    #[serde(default = "default_automation_poll_interval_secs")]
    poll_interval_secs: u64,
    #[serde(default = "default_automation_enable_history")]
    enable_history: bool,
}

#[derive(Debug, Deserialize)]
struct AutomationJobCreateRequest {
    name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    enabled: Option<bool>,
    workspace_id: String,
    #[serde(default)]
    execution_mode: Option<AutomationExecutionMode>,
    schedule: TaskSchedule,
    payload: Value,
    #[serde(default)]
    delivery: Option<DeliveryConfig>,
    #[serde(default)]
    timeout_secs: Option<u64>,
    #[serde(default)]
    max_retries: Option<u32>,
}

#[derive(Debug, Deserialize, Default)]
struct AutomationJobUpdateRequest {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    enabled: Option<bool>,
    #[serde(default)]
    workspace_id: Option<String>,
    #[serde(default)]
    execution_mode: Option<AutomationExecutionMode>,
    #[serde(default)]
    schedule: Option<TaskSchedule>,
    #[serde(default)]
    payload: Option<Value>,
    #[serde(default)]
    delivery: Option<DeliveryConfig>,
    #[serde(default)]
    timeout_secs: Option<u64>,
    #[serde(default)]
    clear_timeout_secs: Option<bool>,
    #[serde(default)]
    max_retries: Option<u32>,
}

#[derive(Debug, Deserialize, Default)]
struct AutomationHealthQuery {
    #[serde(default)]
    running_timeout_minutes: Option<u64>,
    #[serde(default)]
    top_limit: Option<usize>,
    #[serde(default)]
    cooldown_alert_threshold: Option<usize>,
    #[serde(default)]
    stale_running_alert_threshold: Option<usize>,
    #[serde(default)]
    failed_24h_alert_threshold: Option<usize>,
}

pub(crate) fn list_automation_jobs(
    db: &DbConnection,
) -> Result<AutomationJobListResponse, RuntimeCoreError> {
    let conn = database::lock_db(db).map_err(data_error)?;
    let jobs = AutomationJobDao::list(&conn).map_err(data_error)?;
    Ok(AutomationJobListResponse {
        jobs: values_from_serializable_vec(jobs)?,
    })
}

pub(crate) fn read_automation_scheduler_config(
) -> Result<AutomationSchedulerConfigReadResponse, RuntimeCoreError> {
    Ok(AutomationSchedulerConfigReadResponse {
        config: automation_scheduler_config_value(load_config().map_err(data_error)?.automation),
    })
}

pub(crate) fn update_automation_scheduler_config(
    params: AutomationSchedulerConfigUpdateParams,
) -> Result<AutomationSchedulerConfigUpdateResponse, RuntimeCoreError> {
    let input: AutomationSchedulerConfigRequest =
        serde_json::from_value(params.config).map_err(data_error)?;
    let mut config = load_config().map_err(data_error)?;
    config.automation = AutomationSettings {
        enabled: input.enabled,
        poll_interval_secs: input.poll_interval_secs.max(5),
        enable_history: input.enable_history,
    };
    save_config(&config).map_err(data_error)?;
    Ok(AutomationSchedulerConfigUpdateResponse {
        config: automation_scheduler_config_value(config.automation),
    })
}

pub(crate) fn read_automation_scheduler_status(
) -> Result<AutomationSchedulerStatusResponse, RuntimeCoreError> {
    Ok(AutomationSchedulerStatusResponse {
        status: json!({
            "running": false,
            "last_polled_at": null,
            "next_poll_at": null,
            "last_job_count": 0,
            "total_executions": 0,
            "active_job_id": null,
            "active_job_name": null,
        }),
    })
}

pub(crate) fn read_automation_job(
    db: &DbConnection,
    params: AutomationJobIdParams,
) -> Result<AutomationJobReadResponse, RuntimeCoreError> {
    let id = normalize_automation_job_id(&params.id)?;
    let conn = database::lock_db(db).map_err(data_error)?;
    let job = AutomationJobDao::get(&conn, &id).map_err(data_error)?;
    Ok(AutomationJobReadResponse {
        job: job
            .map(serde_json::to_value)
            .transpose()
            .map_err(data_error)?,
    })
}

pub(crate) fn create_automation_job(
    db: &DbConnection,
    params: AutomationJobCreateParams,
) -> Result<AutomationJobWriteResponse, RuntimeCoreError> {
    let request: AutomationJobCreateRequest =
        serde_json::from_value(params.request).map_err(data_error)?;
    validate_automation_job_create_request(&request)?;
    let now = Utc::now().to_rfc3339();
    let next_run_at = if request.enabled.unwrap_or(true) {
        preview_next_automation_run(&request.schedule).map_err(data_error)?
    } else {
        None
    };
    let job = AutomationJob {
        id: Uuid::new_v4().to_string(),
        name: request.name.trim().to_string(),
        description: normalize_optional_string(request.description),
        enabled: request.enabled.unwrap_or(true),
        workspace_id: request.workspace_id.trim().to_string(),
        execution_mode: request
            .execution_mode
            .unwrap_or(AutomationExecutionMode::Intelligent),
        schedule: request.schedule,
        payload: request.payload,
        delivery: request.delivery.unwrap_or_default(),
        timeout_secs: request.timeout_secs,
        max_retries: request.max_retries.unwrap_or(3).max(1),
        next_run_at,
        last_status: None,
        last_error: None,
        last_run_at: None,
        last_finished_at: None,
        running_started_at: None,
        consecutive_failures: 0,
        last_retry_count: 0,
        auto_disabled_until: None,
        last_delivery: None,
        created_at: now.clone(),
        updated_at: now,
    };
    let conn = database::lock_db(db).map_err(data_error)?;
    AutomationJobDao::create(&conn, &job).map_err(data_error)?;
    Ok(AutomationJobWriteResponse {
        job: serde_json::to_value(job).map_err(data_error)?,
    })
}

pub(crate) fn update_automation_job(
    db: &DbConnection,
    params: AutomationJobUpdateParams,
) -> Result<AutomationJobWriteResponse, RuntimeCoreError> {
    let id = normalize_automation_job_id(&params.id)?;
    let request: AutomationJobUpdateRequest =
        serde_json::from_value(params.request).map_err(data_error)?;
    let conn = database::lock_db(db).map_err(data_error)?;
    let mut job = AutomationJobDao::get(&conn, &id)
        .map_err(data_error)?
        .ok_or_else(|| RuntimeCoreError::Backend(format!("自动化任务不存在: {id}")))?;

    if let Some(name) = request.name {
        if name.trim().is_empty() {
            return Err(RuntimeCoreError::Backend("任务名称不能为空".to_string()));
        }
        job.name = name.trim().to_string();
    }
    if request.description.is_some() {
        job.description = normalize_optional_string(request.description);
    }
    if let Some(enabled) = request.enabled {
        job.enabled = enabled;
    }
    if let Some(workspace_id) = request.workspace_id {
        if workspace_id.trim().is_empty() {
            return Err(RuntimeCoreError::Backend("workspace_id 必填".to_string()));
        }
        job.workspace_id = workspace_id.trim().to_string();
    }
    if let Some(execution_mode) = request.execution_mode {
        job.execution_mode = execution_mode;
    }
    if let Some(schedule) = request.schedule {
        validate_automation_schedule_value(&schedule, Utc::now()).map_err(data_error)?;
        job.schedule = schedule;
    }
    if let Some(payload) = request.payload {
        validate_automation_payload(&payload)?;
        job.payload = payload;
    }
    if let Some(delivery) = request.delivery {
        job.delivery = delivery;
    }
    if request.clear_timeout_secs.unwrap_or(false) {
        job.timeout_secs = None;
    } else if request.timeout_secs.is_some() {
        job.timeout_secs = request.timeout_secs;
    }
    if let Some(max_retries) = request.max_retries {
        job.max_retries = max_retries.max(1);
    }
    job.next_run_at = if job.enabled && job.running_started_at.is_none() {
        preview_next_automation_run(&job.schedule).map_err(data_error)?
    } else {
        None
    };
    job.updated_at = Utc::now().to_rfc3339();

    validate_automation_job_record(&job)?;
    AutomationJobDao::update(&conn, &job).map_err(data_error)?;
    Ok(AutomationJobWriteResponse {
        job: serde_json::to_value(job).map_err(data_error)?,
    })
}

pub(crate) fn delete_automation_job(
    db: &DbConnection,
    params: AutomationJobIdParams,
) -> Result<AutomationJobDeleteResponse, RuntimeCoreError> {
    let id = normalize_automation_job_id(&params.id)?;
    let conn = database::lock_db(db).map_err(data_error)?;
    let deleted = AutomationJobDao::delete(&conn, &id).map_err(data_error)?;
    Ok(AutomationJobDeleteResponse { deleted })
}

pub(crate) fn run_automation_job_now(
    _params: AutomationJobIdParams,
) -> Result<AutomationJobRunNowResponse, RuntimeCoreError> {
    Err(RuntimeCoreError::Backend(
        "automationJob/runNow 尚未迁移到 App Server 执行器，已拒绝回退旧 Tauri 命令".to_string(),
    ))
}

pub(crate) fn read_automation_health(
    db: &DbConnection,
    params: AutomationJobHealthParams,
) -> Result<AutomationJobHealthResponse, RuntimeCoreError> {
    let query = params
        .query
        .map(serde_json::from_value::<AutomationHealthQuery>)
        .transpose()
        .map_err(data_error)?
        .unwrap_or_default();
    let conn = database::lock_db(db).map_err(data_error)?;
    let health = query_automation_health_value(&conn, query).map_err(data_error)?;
    Ok(AutomationJobHealthResponse { health })
}

pub(crate) fn read_automation_run_history(
    db: &DbConnection,
    params: AutomationJobRunHistoryParams,
) -> Result<AutomationJobRunHistoryResponse, RuntimeCoreError> {
    let id = normalize_automation_job_id(&params.id)?;
    let limit = params.limit.unwrap_or(20).clamp(1, 200);
    let conn = database::lock_db(db).map_err(data_error)?;
    let runs = AgentRunDao::list_runs_by_source_ref(&conn, "automation", &id, limit)
        .map_err(data_error)?;
    Ok(AutomationJobRunHistoryResponse {
        runs: values_from_serializable_vec(runs)?,
    })
}

pub(crate) fn preview_automation_schedule(
    params: AutomationScheduleParams,
) -> Result<AutomationSchedulePreviewResponse, RuntimeCoreError> {
    let schedule: TaskSchedule = serde_json::from_value(params.schedule).map_err(data_error)?;
    Ok(AutomationSchedulePreviewResponse {
        next_run_at: preview_next_automation_run(&schedule).map_err(data_error)?,
    })
}

pub(crate) fn validate_automation_schedule(
    params: AutomationScheduleParams,
) -> Result<AutomationScheduleValidateResponse, RuntimeCoreError> {
    let schedule: TaskSchedule = serde_json::from_value(params.schedule).map_err(data_error)?;
    Ok(
        match validate_automation_schedule_value(&schedule, Utc::now()) {
            Ok(()) => AutomationScheduleValidateResponse {
                valid: true,
                error: None,
            },
            Err(error) => AutomationScheduleValidateResponse {
                valid: false,
                error: Some(error),
            },
        },
    )
}

fn default_automation_poll_interval_secs() -> u64 {
    30
}

fn default_automation_enable_history() -> bool {
    true
}

fn automation_scheduler_config_value(config: AutomationSettings) -> Value {
    json!({
        "enabled": config.enabled,
        "poll_interval_secs": config.poll_interval_secs,
        "enable_history": config.enable_history,
    })
}

fn normalize_automation_job_id(id: &str) -> Result<String, RuntimeCoreError> {
    let id = id.trim();
    if id.is_empty() {
        return Err(RuntimeCoreError::Backend(
            "automation job id is required".to_string(),
        ));
    }
    Ok(id.to_string())
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn validate_automation_job_create_request(
    request: &AutomationJobCreateRequest,
) -> Result<(), RuntimeCoreError> {
    if request.name.trim().is_empty() {
        return Err(RuntimeCoreError::Backend("任务名称不能为空".to_string()));
    }
    if request.workspace_id.trim().is_empty() {
        return Err(RuntimeCoreError::Backend("workspace_id 必填".to_string()));
    }
    validate_automation_schedule_value(&request.schedule, Utc::now()).map_err(data_error)?;
    validate_automation_payload(&request.payload)?;
    Ok(())
}

fn validate_automation_job_record(job: &AutomationJob) -> Result<(), RuntimeCoreError> {
    if job.name.trim().is_empty() {
        return Err(RuntimeCoreError::Backend("任务名称不能为空".to_string()));
    }
    if job.workspace_id.trim().is_empty() {
        return Err(RuntimeCoreError::Backend("workspace_id 必填".to_string()));
    }
    validate_automation_schedule_value(&job.schedule, Utc::now()).map_err(data_error)?;
    validate_automation_payload(&job.payload)?;
    Ok(())
}

fn validate_automation_payload(payload: &Value) -> Result<(), RuntimeCoreError> {
    let Some(payload) = payload.as_object() else {
        return Err(RuntimeCoreError::Backend(
            "自动化任务 payload 必须为对象".to_string(),
        ));
    };
    let kind = payload
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match kind {
        "agent_turn" => {
            let prompt = payload
                .get("prompt")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if prompt.trim().is_empty() {
                return Err(RuntimeCoreError::Backend(
                    "自动化任务内容不能为空".to_string(),
                ));
            }
            if let Some(content_id) = payload
                .get("content_id")
                .or_else(|| payload.get("contentId"))
            {
                if content_id
                    .as_str()
                    .map(str::trim)
                    .unwrap_or_default()
                    .is_empty()
                {
                    return Err(RuntimeCoreError::Backend(
                        "自动化任务 content_id 不能为空字符串".to_string(),
                    ));
                }
            }
            if let Some(metadata) = payload
                .get("request_metadata")
                .or_else(|| payload.get("requestMetadata"))
            {
                if !metadata.is_object() {
                    return Err(RuntimeCoreError::Backend(
                        "自动化任务 request_metadata 必须为对象".to_string(),
                    ));
                }
                validate_automation_managed_objective_metadata(metadata)?;
            }
            Ok(())
        }
        "browser_session" => Err(RuntimeCoreError::Backend(
            "浏览器自动化任务已下线，不再允许创建或执行".to_string(),
        )),
        _ => Err(RuntimeCoreError::Backend(format!(
            "不支持的自动化任务 payload.kind: {kind}"
        ))),
    }
}

fn validate_automation_managed_objective_metadata(
    metadata: &Value,
) -> Result<(), RuntimeCoreError> {
    let Some(harness) = metadata.get("harness").and_then(Value::as_object) else {
        return Ok(());
    };
    let Some(managed_objective) = harness
        .get("managed_objective")
        .or_else(|| harness.get("managedObjective"))
        .and_then(Value::as_object)
    else {
        return Ok(());
    };

    let owner_type = managed_objective
        .get("owner_type")
        .or_else(|| managed_objective.get("ownerType"))
        .or_else(|| managed_objective.get("owner_kind"))
        .or_else(|| managed_objective.get("ownerKind"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if let Some(owner_type) = owner_type {
        if owner_type != "automation_job" {
            return Err(RuntimeCoreError::Backend(format!(
                "自动化任务 managed_objective.owner_type 必须为 automation_job，当前为 {owner_type}"
            )));
        }
    }

    let objective_text = managed_objective
        .get("objective_text")
        .or_else(|| managed_objective.get("objectiveText"))
        .or_else(|| managed_objective.get("objective"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if objective_text.is_none() {
        return Err(RuntimeCoreError::Backend(
            "自动化任务 managed_objective.objective 必填".to_string(),
        ));
    }
    Ok(())
}

fn preview_next_automation_run(schedule: &TaskSchedule) -> Result<Option<String>, String> {
    Ok(next_run_for_automation_schedule(schedule, Utc::now())?.map(|value| value.to_rfc3339()))
}

fn next_run_for_automation_schedule(
    schedule: &TaskSchedule,
    from: DateTime<Utc>,
) -> Result<Option<DateTime<Utc>>, String> {
    match schedule {
        TaskSchedule::Every { every_secs } => {
            let secs = (*every_secs).max(60);
            Ok(Some(from + Duration::seconds(secs as i64)))
        }
        TaskSchedule::Cron { expr, tz } => {
            let normalized = normalize_cron_expression(expr);
            let cron_schedule = cron::Schedule::from_str(&normalized)
                .map_err(|error| format!("无效的 Cron 表达式: {error}"))?;
            let next = if let Some(tz_str) = tz
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                let timezone: chrono_tz::Tz = tz_str
                    .parse()
                    .map_err(|_| format!("无效的时区: {tz_str}"))?;
                cron_schedule
                    .after(&from.with_timezone(&timezone))
                    .next()
                    .map(|value| value.with_timezone(&Utc))
            } else {
                cron_schedule.after(&from).next()
            };
            Ok(next)
        }
        TaskSchedule::At { at } => {
            let target = DateTime::parse_from_rfc3339(at)
                .map_err(|error| format!("无效的时间格式（需要 RFC3339）: {error}"))?
                .with_timezone(&Utc);
            if target > from {
                Ok(Some(target))
            } else {
                Ok(None)
            }
        }
    }
}

fn validate_automation_schedule_value(
    schedule: &TaskSchedule,
    now: DateTime<Utc>,
) -> Result<(), String> {
    match schedule {
        TaskSchedule::Every { every_secs } => {
            if *every_secs < 60 {
                return Err("间隔时间不能小于 60 秒".to_string());
            }
            Ok(())
        }
        TaskSchedule::Cron { expr, tz } => {
            let normalized = normalize_cron_expression(expr);
            cron::Schedule::from_str(&normalized)
                .map_err(|error| format!("无效的 Cron 表达式: {error}"))?;
            if let Some(tz_str) = tz
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                let _: chrono_tz::Tz = tz_str
                    .parse()
                    .map_err(|_| format!("无效的时区: {tz_str}"))?;
            }
            Ok(())
        }
        TaskSchedule::At { at } => {
            let target = DateTime::parse_from_rfc3339(at)
                .map_err(|error| format!("无效的时间格式: {error}"))?
                .with_timezone(&Utc);
            if target <= now {
                return Err("指定时间已过期".to_string());
            }
            Ok(())
        }
    }
}

fn normalize_cron_expression(expr: &str) -> String {
    let parts = expr.split_whitespace().collect::<Vec<_>>();
    if parts.len() == 5 {
        format!("0 {}", expr.trim())
    } else {
        expr.trim().to_string()
    }
}

fn query_automation_health_value(
    conn: &rusqlite::Connection,
    query: AutomationHealthQuery,
) -> Result<Value, String> {
    let running_timeout_minutes = query.running_timeout_minutes.unwrap_or(10);
    let top_limit = query.top_limit.unwrap_or(5);
    let cooldown_alert_threshold = query.cooldown_alert_threshold.unwrap_or(1);
    let stale_running_alert_threshold = query.stale_running_alert_threshold.unwrap_or(1);
    let failed_24h_alert_threshold = query.failed_24h_alert_threshold.unwrap_or(3);
    let jobs =
        AutomationJobDao::list(conn).map_err(|error| format!("查询自动化任务失败: {error}"))?;
    let now = Utc::now();
    let stale_deadline = now - Duration::minutes(running_timeout_minutes as i64);

    let total_jobs = jobs.len();
    let enabled_jobs = jobs.iter().filter(|job| job.enabled).count();
    let pending_jobs = jobs
        .iter()
        .filter(|job| job.enabled)
        .filter(|job| job.running_started_at.is_none())
        .filter(|job| !automation_job_in_cooldown(job, now))
        .filter(|job| {
            job.next_run_at
                .as_deref()
                .and_then(parse_rfc3339_utc)
                .map(|value| value <= now)
                .unwrap_or(false)
        })
        .count();
    let running_jobs = jobs
        .iter()
        .filter(|job| job.running_started_at.is_some())
        .count();
    let failed_jobs = jobs
        .iter()
        .filter(|job| matches!(job.last_status.as_deref(), Some("error" | "timeout")))
        .count();
    let cooldown_jobs = jobs
        .iter()
        .filter(|job| automation_job_in_cooldown(job, now))
        .count();
    let stale_running_jobs = jobs
        .iter()
        .filter(|job| {
            job.running_started_at
                .as_deref()
                .and_then(parse_rfc3339_utc)
                .map(|value| value < stale_deadline)
                .unwrap_or(false)
        })
        .count();

    let recent_runs_by_job = jobs
        .iter()
        .map(|job| {
            let runs = AgentRunDao::list_runs_by_source_ref(conn, "automation", &job.id, 200)
                .unwrap_or_default();
            (job.id.clone(), runs)
        })
        .collect::<std::collections::HashMap<_, _>>();
    let recent_runs = recent_runs_by_job
        .values()
        .flat_map(|runs| runs.iter().cloned())
        .collect::<Vec<_>>();
    let failure_trend_24h = build_automation_failure_trend_24h(&recent_runs, now);
    let failed_last_24h = failure_trend_24h
        .iter()
        .map(|item| {
            item.get("error_count").and_then(Value::as_u64).unwrap_or(0)
                + item
                    .get("timeout_count")
                    .and_then(Value::as_u64)
                    .unwrap_or(0)
        })
        .sum::<u64>() as usize;

    let mut risky_jobs = jobs
        .iter()
        .filter(|job| {
            job.consecutive_failures > 0
                || automation_job_in_cooldown(job, now)
                || matches!(
                    job.last_status.as_deref(),
                    Some("waiting_for_human" | "human_controlling" | "error" | "timeout")
                )
        })
        .map(|job| {
            json!({
                "job_id": job.id,
                "name": job.name,
                "status": job.last_status.clone().unwrap_or_else(|| "idle".to_string()),
                "consecutive_failures": job.consecutive_failures,
                "retry_count": job.last_retry_count,
                "detail_message": recent_runs_by_job
                    .get(&job.id)
                    .and_then(|runs| resolve_automation_risky_job_detail(job, runs)),
                "auto_disabled_until": job.auto_disabled_until,
                "updated_at": job.updated_at,
            })
        })
        .collect::<Vec<_>>();
    risky_jobs.sort_by(|left, right| {
        let left_failures = left
            .get("consecutive_failures")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let right_failures = right
            .get("consecutive_failures")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        let left_retries = left.get("retry_count").and_then(Value::as_u64).unwrap_or(0);
        let right_retries = right
            .get("retry_count")
            .and_then(Value::as_u64)
            .unwrap_or(0);
        right_failures
            .cmp(&left_failures)
            .then_with(|| right_retries.cmp(&left_retries))
    });
    risky_jobs.truncate(top_limit);

    Ok(json!({
        "total_jobs": total_jobs,
        "enabled_jobs": enabled_jobs,
        "pending_jobs": pending_jobs,
        "running_jobs": running_jobs,
        "failed_jobs": failed_jobs,
        "cooldown_jobs": cooldown_jobs,
        "stale_running_jobs": stale_running_jobs,
        "failed_last_24h": failed_last_24h,
        "failure_trend_24h": failure_trend_24h,
        "alerts": build_automation_alerts(
            cooldown_jobs,
            stale_running_jobs,
            failed_last_24h,
            cooldown_alert_threshold,
            stale_running_alert_threshold,
            failed_24h_alert_threshold,
        ),
        "risky_jobs": risky_jobs,
        "generated_at": now.to_rfc3339(),
    }))
}

fn resolve_automation_risky_job_detail(job: &AutomationJob, runs: &[AgentRun]) -> Option<String> {
    runs.first()
        .and_then(resolve_automation_run_detail_message)
        .or_else(|| job.last_error.as_deref().and_then(normalize_non_empty_text))
}

fn resolve_automation_run_detail_message(run: &AgentRun) -> Option<String> {
    let human_reason = run
        .metadata
        .as_deref()
        .and_then(|metadata| extract_json_string(metadata, "human_reason"));
    if let Some(reason) = human_reason {
        if run.error_message.as_deref().map(str::trim) != Some(reason.as_str()) {
            return Some(reason);
        }
    }
    run.error_message
        .as_deref()
        .and_then(normalize_non_empty_text)
}

fn extract_json_string(metadata: &str, key: &str) -> Option<String> {
    let parsed = serde_json::from_str::<Value>(metadata).ok()?;
    parsed.get(key)?.as_str().and_then(normalize_non_empty_text)
}

fn normalize_non_empty_text(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn parse_rfc3339_utc(raw: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|value| value.with_timezone(&Utc))
}

fn automation_job_in_cooldown(job: &AutomationJob, now: DateTime<Utc>) -> bool {
    job.auto_disabled_until
        .as_deref()
        .and_then(parse_rfc3339_utc)
        .map(|value| value > now)
        .unwrap_or(false)
}

fn build_automation_failure_trend_24h(runs: &[AgentRun], now: DateTime<Utc>) -> Vec<Value> {
    let mut points = Vec::with_capacity(24);
    let end_hour = floor_to_hour(now);
    let start_hour = end_hour - Duration::hours(23);

    for offset in 0..24 {
        let bucket = start_hour + Duration::hours(offset as i64);
        let bucket_end = bucket + Duration::hours(1);
        let mut error_count = 0usize;
        let mut timeout_count = 0usize;

        for run in runs {
            let Some(started_at) = parse_rfc3339_utc(run.started_at.as_str()) else {
                continue;
            };
            if started_at < bucket || started_at >= bucket_end {
                continue;
            }
            match run.status {
                AgentRunStatus::Error => error_count += 1,
                AgentRunStatus::Timeout => timeout_count += 1,
                _ => {}
            }
        }

        points.push(json!({
            "bucket_start": bucket.to_rfc3339(),
            "label": bucket.format("%H:%M").to_string(),
            "error_count": error_count,
            "timeout_count": timeout_count,
        }));
    }

    points
}

fn floor_to_hour(now: DateTime<Utc>) -> DateTime<Utc> {
    now.with_minute(0)
        .and_then(|value| value.with_second(0))
        .and_then(|value| value.with_nanosecond(0))
        .unwrap_or(now)
}

fn build_automation_alerts(
    cooldown_jobs: usize,
    stale_running_jobs: usize,
    failed_last_24h: usize,
    cooldown_threshold: usize,
    stale_threshold: usize,
    failed_threshold: usize,
) -> Vec<Value> {
    let mut alerts = Vec::new();

    if cooldown_jobs >= cooldown_threshold {
        alerts.push(json!({
            "code": "cooldown_jobs",
            "severity": "warning",
            "message": format!("当前有 {cooldown_jobs} 个任务处于冷却中"),
            "current_value": cooldown_jobs,
            "threshold": cooldown_threshold,
        }));
    }
    if stale_running_jobs >= stale_threshold {
        alerts.push(json!({
            "code": "stale_running_jobs",
            "severity": "critical",
            "message": format!("检测到 {stale_running_jobs} 个悬挂中的运行任务"),
            "current_value": stale_running_jobs,
            "threshold": stale_threshold,
        }));
    }
    if failed_last_24h >= failed_threshold {
        alerts.push(json!({
            "code": "failed_runs_24h",
            "severity": "warning",
            "message": format!("最近 24 小时失败或超时 {failed_last_24h} 次"),
            "current_value": failed_last_24h,
            "threshold": failed_threshold,
        }));
    }

    alerts
}
