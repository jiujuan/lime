use super::data_error;
use crate::RuntimeCoreError;
use app_server_protocol::AutomationJobHealthParams;
use app_server_protocol::AutomationJobHealthResponse;
use chrono::DateTime;
use chrono::Duration;
use chrono::Timelike;
use chrono::Utc;
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
