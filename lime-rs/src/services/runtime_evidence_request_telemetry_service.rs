//! Runtime evidence request telemetry 收集。
//!
//! 只负责把与当前 session/thread/turn 可关联的 request log 投影为
//! evidence pack 可消费的机器事实，避免 evidence 主服务继续承担日志扫描细节。

use crate::agent::SessionDetail;
use lime_infra::telemetry::RequestLog;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

const MAX_REQUEST_TELEMETRY_ITEMS: usize = 12;

#[derive(Debug, Clone, Default)]
pub(crate) struct RuntimeRequestTelemetrySummary {
    pub(crate) searched_roots: Vec<String>,
    pub(crate) matched_request_count: usize,
    pub(crate) latest_request_at: Option<String>,
    pub(crate) status_counts: BTreeMap<String, usize>,
    pub(crate) providers: Vec<String>,
    pub(crate) models: Vec<String>,
    pub(crate) requests: Vec<Value>,
}

pub(crate) fn collect_request_telemetry(
    detail: &SessionDetail,
    workspace_root: &Path,
) -> RuntimeRequestTelemetrySummary {
    let turn_ids = detail
        .turns
        .iter()
        .map(|turn| turn.id.clone())
        .collect::<HashSet<_>>();
    let mut matched_logs = Vec::new();
    let searched_roots = candidate_request_log_roots(workspace_root)
        .into_iter()
        .filter(|root| root.is_dir())
        .map(|root| {
            for path in list_request_log_files(root.as_path()) {
                if let Ok(raw) = fs::read_to_string(&path) {
                    for line in raw.lines() {
                        if line.trim().is_empty() {
                            continue;
                        }
                        let Ok(log) = serde_json::from_str::<RequestLog>(line) else {
                            continue;
                        };
                        if request_log_matches_session(
                            &log,
                            detail.id.as_str(),
                            detail.thread_id.as_str(),
                            &turn_ids,
                        ) {
                            matched_logs.push(log);
                        }
                    }
                }
            }
            root.to_string_lossy().to_string()
        })
        .collect::<Vec<_>>();

    matched_logs.sort_by(|left, right| {
        right
            .timestamp
            .cmp(&left.timestamp)
            .then_with(|| right.id.cmp(&left.id))
    });

    let mut status_counts = BTreeMap::new();
    let mut providers = BTreeSet::new();
    let mut models = BTreeSet::new();
    for log in &matched_logs {
        *status_counts.entry(log.status.to_string()).or_insert(0) += 1;
        providers.insert(log.provider.to_string());
        models.insert(log.model.clone());
    }

    RuntimeRequestTelemetrySummary {
        searched_roots,
        matched_request_count: matched_logs.len(),
        latest_request_at: matched_logs.first().map(|log| log.timestamp.to_rfc3339()),
        status_counts,
        providers: providers.into_iter().collect(),
        models: models.into_iter().collect(),
        requests: matched_logs
            .into_iter()
            .take(MAX_REQUEST_TELEMETRY_ITEMS)
            .map(request_log_to_json)
            .collect(),
    }
}

fn candidate_request_log_roots(workspace_root: &Path) -> Vec<PathBuf> {
    let workspace_roots = [
        workspace_root.join("request_logs"),
        workspace_root.join(".lime/request_logs"),
    ]
    .into_iter()
    .filter(|candidate| candidate.is_dir())
    .collect::<Vec<_>>();

    if !workspace_roots.is_empty() {
        return workspace_roots;
    }

    let mut roots = Vec::new();
    let mut seen = HashSet::new();

    if let Ok(app_root) = lime_core::app_paths::resolve_request_logs_dir() {
        let key = app_root.to_string_lossy().to_string();
        if seen.insert(key) {
            roots.push(app_root);
        }
    }

    roots
}

fn list_request_log_files(root: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };

    let mut files = entries
        .filter_map(|entry| entry.ok().map(|value| value.path()))
        .filter(|path| path.extension().is_some_and(|ext| ext == "jsonl"))
        .collect::<Vec<_>>();
    files.sort_by(|left, right| right.cmp(left));
    files
}

fn request_log_matches_session(
    log: &RequestLog,
    session_id: &str,
    thread_id: &str,
    turn_ids: &HashSet<String>,
) -> bool {
    if log.session_id.as_deref() != Some(session_id) {
        return false;
    }
    if log.thread_id.as_deref() != Some(thread_id) {
        return false;
    }

    match log.turn_id.as_deref() {
        Some(turn_id) if !turn_ids.is_empty() => turn_ids.contains(turn_id),
        _ => true,
    }
}

fn request_log_to_json(log: RequestLog) -> Value {
    json!({
        "id": log.id,
        "timestamp": log.timestamp.to_rfc3339(),
        "provider": log.provider.to_string(),
        "model": log.model,
        "status": log.status.to_string(),
        "durationMs": log.duration_ms,
        "httpStatus": log.http_status,
        "isStreaming": log.is_streaming,
        "credentialId": log.credential_id,
        "retryCount": log.retry_count,
        "inputTokens": log.input_tokens,
        "outputTokens": log.output_tokens,
        "totalTokens": log.total_tokens,
        "errorMessage": log.error_message,
        "sessionId": log.session_id,
        "threadId": log.thread_id,
        "turnId": log.turn_id,
        "pendingRequestId": log.pending_request_id,
        "queuedTurnId": log.queued_turn_id,
        "subagentSessionId": log.subagent_session_id
    })
}

pub(crate) fn build_request_telemetry_json(summary: &RuntimeRequestTelemetrySummary) -> Value {
    json!({
        "source": "lime_infra.telemetry.request_logs",
        "searchedRoots": summary.searched_roots,
        "matchedRequestCount": summary.matched_request_count,
        "latestRequestAt": summary.latest_request_at,
        "statusCounts": summary.status_counts,
        "providers": summary.providers,
        "models": summary.models,
        "requests": summary.requests
    })
}
