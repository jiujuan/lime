use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde_json::{json, Value};

use crate::{MediaTaskOutput, TaskAttemptRecord};

fn current_attempt(output: &MediaTaskOutput) -> Option<&TaskAttemptRecord> {
    if let Some(current_attempt_id) = output.current_attempt_id.as_deref() {
        if let Some(attempt) = output
            .record
            .attempts
            .iter()
            .find(|attempt| attempt.attempt_id == current_attempt_id)
        {
            return Some(attempt);
        }
    }

    output.record.attempts.last()
}

fn audit_log_path(workspace_root: &Path, output: &MediaTaskOutput) -> PathBuf {
    let fallback = format!(".lime/task-logs/{}/attempt_1.jsonl", output.task_id);
    let logs_ref = current_attempt(output)
        .and_then(|attempt| attempt.logs_ref.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&fallback);

    workspace_root.join(logs_ref)
}

fn append_json_line(path: &Path, value: &Value) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    serde_json::to_writer(&mut file, value)?;
    file.write_all(b"\n")
}

fn build_audit_record(output: &MediaTaskOutput, event: &str, details: Value) -> Value {
    let attempt = current_attempt(output);
    json!({
        "ts": Utc::now().to_rfc3339(),
        "event": event,
        "task_id": output.task_id,
        "task_type": output.task_type,
        "task_family": output.task_family,
        "status": output.status,
        "normalized_status": output.normalized_status,
        "attempt_id": attempt.map(|value| value.attempt_id.as_str()),
        "attempt_index": attempt.map(|value| value.attempt_index),
        "worker_id": attempt
            .and_then(|value| value.worker_id.as_deref())
            .or(Some("lime-image-api-worker")),
        "provider": attempt.and_then(|value| value.provider.as_deref()),
        "model": attempt.and_then(|value| value.model.as_deref()),
        "details": details,
    })
}

pub(crate) fn record_image_task_audit_event(
    workspace_root: &Path,
    output: &MediaTaskOutput,
    event: &str,
    details: Value,
) {
    let path = audit_log_path(workspace_root, output);
    let record = build_audit_record(output, event, details);
    let _ = append_json_line(&path, &record);
}
