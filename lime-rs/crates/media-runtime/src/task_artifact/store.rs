use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde_json::Value;
use tempfile::NamedTempFile;
use uuid::Uuid;

use super::record::{
    apply_payload_patch, build_attempt_record, canonicalize_task_record, current_attempt_index,
    derive_task_progress, derive_task_summary, new_attempt_id, normalize_idempotency_key,
    normalize_mutation_status, normalize_optional_text, normalize_status,
    resolve_artifact_root_relative_path, resolve_output_relative_path, AttemptRecordInput,
};
use super::types::{
    MediaRuntimeError, MediaTaskOutput, MediaTaskType, TaskArtifactPatch, TaskArtifactRecord,
    TaskAttemptRecord, TaskOutput, TaskProgress, TaskRelationships, TaskType, TaskUiHints,
    TaskWriteOptions,
};

fn supports_idempotent_reuse(normalized_status: &str) -> bool {
    matches!(normalized_status, "pending" | "queued" | "running")
}

fn record_sort_key(record: &TaskArtifactRecord) -> &str {
    record
        .updated_at
        .as_deref()
        .unwrap_or(record.created_at.as_str())
}

fn task_record_matches_filter(
    record: &TaskArtifactRecord,
    status_filter: Option<&str>,
    task_family_filter: Option<&str>,
    task_type_filter: Option<TaskType>,
) -> bool {
    if let Some(task_type) = task_type_filter {
        if record.task_type != task_type.as_str() {
            return false;
        }
    }

    if let Some(task_family_filter) = task_family_filter {
        if task_family_filter.trim().is_empty() {
            return false;
        }
        if !record
            .task_family
            .trim()
            .eq_ignore_ascii_case(task_family_filter.trim())
        {
            return false;
        }
    }

    if let Some(status_filter) = status_filter {
        let normalized_filter = normalize_status(status_filter);
        let normalized_record = record.normalized_status.clone();
        if normalized_filter != normalized_record
            && !status_filter
                .trim()
                .eq_ignore_ascii_case(record.status.trim())
        {
            return false;
        }
    }

    true
}

fn read_task_record(path: &Path) -> Result<TaskArtifactRecord, MediaRuntimeError> {
    let content = fs::read_to_string(path)
        .map_err(|error| MediaRuntimeError::Io(format!("读取任务文件失败: {error}")))?;
    serde_json::from_str::<TaskArtifactRecord>(&content)
        .map(canonicalize_task_record)
        .map_err(|error| MediaRuntimeError::Io(format!("解析任务文件失败: {error}")))
}

fn write_task_record(path: &Path, record: &TaskArtifactRecord) -> Result<(), MediaRuntimeError> {
    let canonical_record = canonicalize_task_record(record.clone());
    let serialized = serde_json::to_string_pretty(&canonical_record)
        .unwrap_or_else(|_| serde_json::json!(canonical_record).to_string());
    let parent = path
        .parent()
        .ok_or_else(|| MediaRuntimeError::Io("无法解析任务文件父目录".to_string()))?;
    let mut temp_file = NamedTempFile::new_in(parent)
        .map_err(|error| MediaRuntimeError::Io(format!("创建任务临时文件失败: {error}")))?;
    temp_file
        .as_file_mut()
        .write_all(serialized.as_bytes())
        .map_err(|error| MediaRuntimeError::Io(format!("写入任务临时文件失败: {error}")))?;
    temp_file
        .as_file_mut()
        .flush()
        .map_err(|error| MediaRuntimeError::Io(format!("刷新任务临时文件失败: {error}")))?;
    temp_file
        .persist(path)
        .map_err(|error| MediaRuntimeError::Io(format!("替换任务文件失败: {}", error.error)))?;
    Ok(())
}

fn relative_path_from_workspace(workspace_root: &Path, task_path: &Path) -> String {
    task_path
        .strip_prefix(workspace_root)
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|_| task_path.to_string_lossy().to_string())
}

fn build_task_output(
    workspace_root: &Path,
    task_path: &Path,
    record: TaskArtifactRecord,
    reused_existing: bool,
) -> TaskOutput {
    let record = canonicalize_task_record(record);
    let path = relative_path_from_workspace(workspace_root, task_path);
    let absolute_path = task_path.to_string_lossy().to_string();
    TaskOutput {
        success: true,
        task_id: record.task_id.clone(),
        task_type: record.task_type.clone(),
        task_family: record.task_family.clone(),
        status: record.status.clone(),
        normalized_status: record.normalized_status.clone(),
        current_attempt_id: record.current_attempt_id.clone(),
        attempt_count: record.attempts.len() as u32,
        last_error: record.last_error.clone(),
        progress: record.progress.clone(),
        ui_hints: record.ui_hints.clone(),
        path: path.clone(),
        absolute_path: absolute_path.clone(),
        artifact_path: path,
        absolute_artifact_path: absolute_path,
        reused_existing,
        idempotency_key: record.idempotency_key.clone(),
        record,
    }
}

fn collect_task_files(root: &Path) -> Result<Vec<PathBuf>, MediaRuntimeError> {
    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut stack = vec![root.to_path_buf()];
    let mut files = Vec::new();

    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir)
            .map_err(|error| MediaRuntimeError::Io(format!("读取任务目录失败: {error}")))?;
        for entry in entries {
            let entry = entry
                .map_err(|error| MediaRuntimeError::Io(format!("读取任务目录项失败: {error}")))?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }

            if path.extension().and_then(|value| value.to_str()) == Some("json") {
                files.push(path);
            }
        }
    }

    Ok(files)
}

fn find_task_record_by_idempotency_key(
    workspace_root: &Path,
    artifact_dir: Option<&str>,
    task_type: TaskType,
    idempotency_key: &str,
) -> Result<Option<(PathBuf, TaskArtifactRecord)>, MediaRuntimeError> {
    let artifact_root = workspace_root.join(resolve_artifact_root_relative_path(artifact_dir)?);
    let mut best_match: Option<(PathBuf, TaskArtifactRecord)> = None;

    for file_path in collect_task_files(&artifact_root)? {
        let Ok(record) = read_task_record(&file_path) else {
            continue;
        };
        if record.task_type != task_type.as_str() {
            continue;
        }
        if record.idempotency_key.as_deref() != Some(idempotency_key) {
            continue;
        }
        if !supports_idempotent_reuse(&record.normalized_status) {
            continue;
        }

        let should_replace = match best_match.as_ref() {
            Some((_, existing)) => record_sort_key(&record) > record_sort_key(existing),
            None => true,
        };
        if should_replace {
            best_match = Some((file_path, record));
        }
    }

    Ok(best_match)
}

fn ensure_output_not_occupied(
    workspace_root: &Path,
    output_abs_path: &Path,
    task_type: TaskType,
    idempotency_key: Option<&str>,
) -> Result<Option<TaskOutput>, MediaRuntimeError> {
    if !output_abs_path.exists() {
        return Ok(None);
    }

    let record = read_task_record(output_abs_path)?;
    if record.task_type == task_type.as_str()
        && idempotency_key.is_some()
        && record.idempotency_key.as_deref() == idempotency_key
    {
        return Ok(Some(build_task_output(
            workspace_root,
            output_abs_path,
            record,
            true,
        )));
    }

    Err(MediaRuntimeError::Conflict(format!(
        "输出路径已存在: {}",
        output_abs_path.to_string_lossy()
    )))
}

fn persist_task_record(
    workspace_root: &Path,
    output_rel_path: &Path,
    record: TaskArtifactRecord,
    reused_existing: bool,
) -> Result<TaskOutput, MediaRuntimeError> {
    let output_abs_path = workspace_root.join(output_rel_path);
    let parent = output_abs_path
        .parent()
        .ok_or_else(|| MediaRuntimeError::Io("无法解析任务文件父目录".to_string()))?;
    fs::create_dir_all(parent)
        .map_err(|error| MediaRuntimeError::Io(format!("创建任务目录失败: {error}")))?;
    write_task_record(&output_abs_path, &record)?;
    Ok(build_task_output(
        workspace_root,
        &output_abs_path,
        record,
        reused_existing,
    ))
}

fn apply_status_to_attempt(attempt: &mut TaskAttemptRecord, status: &str, occurred_at: &str) {
    let normalized_status = normalize_status(status);
    attempt.status = status.to_string();

    match normalized_status.as_str() {
        "pending" => {
            attempt.queued_at = None;
            attempt.started_at = None;
            attempt.completed_at = None;
        }
        "queued" => {
            if attempt.queued_at.is_none() {
                attempt.queued_at = Some(occurred_at.to_string());
            }
            attempt.started_at = None;
            attempt.completed_at = None;
        }
        "running" => {
            if attempt.queued_at.is_none() {
                attempt.queued_at = Some(occurred_at.to_string());
            }
            attempt.started_at = Some(occurred_at.to_string());
            attempt.completed_at = None;
        }
        "partial" => {
            if attempt.queued_at.is_none() {
                attempt.queued_at = Some(occurred_at.to_string());
            }
            if attempt.started_at.is_none() {
                attempt.started_at = Some(occurred_at.to_string());
            }
            attempt.completed_at = None;
        }
        "succeeded" | "failed" | "cancelled" => {
            if attempt.queued_at.is_none() {
                attempt.queued_at = Some(occurred_at.to_string());
            }
            if attempt.started_at.is_none() {
                attempt.started_at = Some(occurred_at.to_string());
            }
            attempt.completed_at = Some(occurred_at.to_string());
        }
        _ => {}
    }
}

fn apply_status_to_record(record: &mut TaskArtifactRecord, status: &str, occurred_at: &str) {
    let normalized_status = normalize_status(status);
    record.status = status.to_string();
    record.normalized_status = normalized_status.clone();

    match normalized_status.as_str() {
        "pending" => {
            record.submitted_at = None;
            record.started_at = None;
            record.completed_at = None;
            record.cancelled_at = None;
        }
        "queued" => {
            if record.submitted_at.is_none() {
                record.submitted_at = Some(occurred_at.to_string());
            }
            record.started_at = None;
            record.completed_at = None;
            record.cancelled_at = None;
        }
        "running" => {
            if record.submitted_at.is_none() {
                record.submitted_at = Some(occurred_at.to_string());
            }
            record.started_at = Some(occurred_at.to_string());
            record.completed_at = None;
            record.cancelled_at = None;
        }
        "partial" => {
            if record.submitted_at.is_none() {
                record.submitted_at = Some(occurred_at.to_string());
            }
            if record.started_at.is_none() {
                record.started_at = Some(occurred_at.to_string());
            }
            record.completed_at = None;
            record.cancelled_at = None;
        }
        "succeeded" | "failed" => {
            if record.submitted_at.is_none() {
                record.submitted_at = Some(occurred_at.to_string());
            }
            if record.started_at.is_none() {
                record.started_at = Some(occurred_at.to_string());
            }
            record.completed_at = Some(occurred_at.to_string());
            record.cancelled_at = None;
        }
        "cancelled" => {
            record.cancelled_at = Some(occurred_at.to_string());
        }
        _ => {}
    }

    record.progress = derive_task_progress(status, record.last_error.as_ref());
}

pub fn write_task_artifact(
    workspace_root: &Path,
    task_type: TaskType,
    title: Option<String>,
    payload: Value,
    options: TaskWriteOptions<'_>,
) -> Result<TaskOutput, MediaRuntimeError> {
    let normalized_title = normalize_optional_text(title);
    let normalized_idempotency_key = normalize_idempotency_key(options.idempotency_key)?;
    let initial_status = match options.status.as_deref() {
        Some(status) => normalize_mutation_status(status)?,
        None => task_type.default_status().to_string(),
    };

    if let Some(idempotency_key) = normalized_idempotency_key.as_deref() {
        if let Some((task_path, record)) = find_task_record_by_idempotency_key(
            workspace_root,
            options.artifact_dir,
            task_type,
            idempotency_key,
        )? {
            return Ok(build_task_output(workspace_root, &task_path, record, true));
        }
    }

    let output_rel_path =
        resolve_output_relative_path(task_type, options.output_path, options.artifact_dir)?;
    let output_abs_path = workspace_root.join(&output_rel_path);
    if let Some(existing) = ensure_output_not_occupied(
        workspace_root,
        &output_abs_path,
        task_type,
        normalized_idempotency_key.as_deref(),
    )? {
        return Ok(existing);
    }

    let created_at = Utc::now().to_rfc3339();
    let summary = derive_task_summary(task_type.as_str(), normalized_title.as_deref(), &payload);
    let task_family = task_type.family().to_string();
    let initial_attempt = build_attempt_record(
        "",
        &payload,
        AttemptRecordInput {
            attempt_id: new_attempt_id(),
            attempt_index: 1,
            status: initial_status.clone(),
            queued_at: None,
            started_at: None,
            completed_at: None,
            result_snapshot: None,
            error: None,
        },
    );
    let mut record = TaskArtifactRecord {
        task_id: Uuid::new_v4().to_string(),
        task_type: task_type.as_str().to_string(),
        task_family,
        title: normalized_title,
        summary,
        payload,
        status: initial_status.clone(),
        normalized_status: normalize_status(&initial_status),
        created_at: created_at.clone(),
        updated_at: None,
        submitted_at: None,
        started_at: None,
        completed_at: None,
        cancelled_at: None,
        idempotency_key: normalized_idempotency_key,
        retry_count: 0,
        source_task_id: None,
        result: None,
        last_error: None,
        current_attempt_id: Some(initial_attempt.attempt_id.clone()),
        attempts: vec![TaskAttemptRecord {
            input_snapshot: serde_json::json!({}),
            ..initial_attempt
        }],
        relationships: options.relationships,
        progress: TaskProgress::default(),
        ui_hints: TaskUiHints::default(),
    };
    record.attempts[0].input_snapshot = record.payload.clone();
    record.attempts[0].logs_ref = Some(format!(
        ".lime/task-logs/{}/attempt_1.jsonl",
        record.task_id
    ));
    apply_status_to_attempt(&mut record.attempts[0], &initial_status, &created_at);
    apply_status_to_record(&mut record, &initial_status, &created_at);

    persist_task_record(workspace_root, &output_rel_path, record, false)
}

pub fn write_media_task_artifact(
    workspace_root: &Path,
    task_type: MediaTaskType,
    title: Option<String>,
    payload: Value,
    status: Option<String>,
    output_path: Option<&str>,
    artifact_dir: Option<&str>,
) -> Result<MediaTaskOutput, MediaRuntimeError> {
    write_task_artifact(
        workspace_root,
        task_type,
        title,
        payload,
        TaskWriteOptions {
            status,
            output_path,
            artifact_dir,
            idempotency_key: None,
            relationships: TaskRelationships::default(),
        },
    )
}

fn resolve_task_reference_path(
    workspace_root: &Path,
    task_ref: &str,
    artifact_dir: Option<&str>,
) -> Result<PathBuf, MediaRuntimeError> {
    let trimmed = task_ref.trim();
    if trimmed.is_empty() {
        return Err(MediaRuntimeError::InvalidParams(
            "task_ref 不能为空字符串".to_string(),
        ));
    }

    let explicit_path = PathBuf::from(trimmed);
    if explicit_path.is_absolute() && explicit_path.is_file() {
        return Ok(explicit_path);
    }

    let workspace_relative = workspace_root.join(trimmed);
    if workspace_relative.is_file() {
        return Ok(workspace_relative);
    }

    let artifact_root = workspace_root.join(resolve_artifact_root_relative_path(artifact_dir)?);
    for file_path in collect_task_files(&artifact_root)? {
        let Ok(record) = read_task_record(&file_path) else {
            continue;
        };
        if record.task_id == trimmed {
            return Ok(file_path);
        }
    }

    Err(MediaRuntimeError::TaskNotFound {
        task_ref: trimmed.to_string(),
    })
}

pub fn load_task_output(
    workspace_root: &Path,
    task_ref: &str,
    artifact_dir: Option<&str>,
) -> Result<TaskOutput, MediaRuntimeError> {
    let task_path = resolve_task_reference_path(workspace_root, task_ref, artifact_dir)?;
    let record = read_task_record(&task_path)?;
    Ok(build_task_output(workspace_root, &task_path, record, false))
}

pub fn list_task_outputs(
    workspace_root: &Path,
    artifact_dir: Option<&str>,
    status_filter: Option<&str>,
    task_family_filter: Option<&str>,
    task_type_filter: Option<TaskType>,
    limit: Option<usize>,
) -> Result<Vec<TaskOutput>, MediaRuntimeError> {
    let artifact_root = workspace_root.join(resolve_artifact_root_relative_path(artifact_dir)?);
    let mut outputs = Vec::new();

    for file_path in collect_task_files(&artifact_root)? {
        let Ok(record) = read_task_record(&file_path) else {
            continue;
        };
        if !task_record_matches_filter(&record, status_filter, task_family_filter, task_type_filter)
        {
            continue;
        }
        outputs.push(build_task_output(workspace_root, &file_path, record, false));
    }

    outputs
        .sort_by(|left, right| record_sort_key(&right.record).cmp(record_sort_key(&left.record)));

    if let Some(limit) = limit {
        outputs.truncate(limit);
    }

    Ok(outputs)
}

pub fn update_task_status(
    workspace_root: &Path,
    task_ref: &str,
    artifact_dir: Option<&str>,
    new_status: &str,
) -> Result<TaskOutput, MediaRuntimeError> {
    let task_path = resolve_task_reference_path(workspace_root, task_ref, artifact_dir)?;
    let mut record = read_task_record(&task_path)?;
    let current_normalized_status = record.normalized_status.clone();
    let next_status = normalize_mutation_status(new_status)?;
    let next_normalized_status = normalize_status(&next_status);
    let occurred_at = Utc::now().to_rfc3339();

    if current_normalized_status == "succeeded" && next_normalized_status != "succeeded" {
        return Err(MediaRuntimeError::InvalidState(
            "已成功完成的任务不能再修改状态".to_string(),
        ));
    }
    if current_normalized_status == "failed" && next_normalized_status == "running" {
        return Err(MediaRuntimeError::InvalidState(
            "失败任务请使用 retry 创建新尝试，不要直接改回 running".to_string(),
        ));
    }

    record.updated_at = Some(occurred_at.clone());
    if next_normalized_status != "failed" {
        record.last_error = None;
    }
    apply_status_to_record(&mut record, &next_status, &occurred_at);
    if let Some(index) = current_attempt_index(&record) {
        let current_attempt = &mut record.attempts[index];
        apply_status_to_attempt(current_attempt, &next_status, &occurred_at);
        if next_normalized_status != "failed" {
            current_attempt.error = None;
        } else if current_attempt.error.is_none() {
            current_attempt.error = record.last_error.clone();
        }

        if matches!(next_normalized_status.as_str(), "partial" | "succeeded") {
            current_attempt.result_snapshot = record.result.clone();
        } else if next_normalized_status != "failed" {
            current_attempt.result_snapshot = None;
        }
    }
    write_task_record(&task_path, &record)?;
    Ok(build_task_output(workspace_root, &task_path, record, false))
}

pub fn patch_task_artifact(
    workspace_root: &Path,
    task_ref: &str,
    artifact_dir: Option<&str>,
    patch: TaskArtifactPatch,
) -> Result<TaskOutput, MediaRuntimeError> {
    let task_path = resolve_task_reference_path(workspace_root, task_ref, artifact_dir)?;
    let mut record = read_task_record(&task_path)?;
    let occurred_at = Utc::now().to_rfc3339();
    let mut should_refresh_progress = false;

    if let Some(status) = patch.status.as_deref() {
        let current_normalized_status = record.normalized_status.clone();
        let next_status = normalize_mutation_status(status)?;
        let next_normalized_status = normalize_status(&next_status);

        if current_normalized_status == "succeeded" && next_normalized_status != "succeeded" {
            return Err(MediaRuntimeError::InvalidState(
                "已成功完成的任务不能再修改状态".to_string(),
            ));
        }
        if current_normalized_status == "failed" && next_normalized_status == "running" {
            return Err(MediaRuntimeError::InvalidState(
                "失败任务请使用 retry 创建新尝试，不要直接改回 running".to_string(),
            ));
        }

        if next_normalized_status != "failed" && patch.last_error.is_none() {
            record.last_error = None;
        }
        record.updated_at = Some(occurred_at.clone());
        apply_status_to_record(&mut record, &next_status, &occurred_at);
        if let Some(index) = current_attempt_index(&record) {
            let current_attempt = &mut record.attempts[index];
            apply_status_to_attempt(current_attempt, &next_status, &occurred_at);
            if next_normalized_status != "failed" && patch.last_error.is_none() {
                current_attempt.error = None;
            }
            if matches!(next_normalized_status.as_str(), "partial" | "succeeded") {
                current_attempt.result_snapshot = record.result.clone();
            } else if next_normalized_status != "failed" {
                current_attempt.result_snapshot = None;
            }
        }
        should_refresh_progress = true;
    }

    if let Some(last_error) = patch.last_error {
        record.last_error = last_error.clone();
        if let Some(index) = current_attempt_index(&record) {
            record.attempts[index].error = last_error;
        }
        should_refresh_progress = true;
    }

    if let Some(result) = patch.result {
        record.result = result.clone();
        if let Some(index) = current_attempt_index(&record) {
            if matches!(record.normalized_status.as_str(), "partial" | "succeeded") {
                record.attempts[index].result_snapshot = result;
            }
        }
    }

    if let Some(payload_patch) = patch.payload_patch {
        apply_payload_patch(&mut record.payload, payload_patch)?;
        if let Some(index) = current_attempt_index(&record) {
            record.attempts[index].input_snapshot = record.payload.clone();
        }
    }

    if let Some(worker_id) = patch.current_attempt_worker_id {
        if let Some(index) = current_attempt_index(&record) {
            record.attempts[index].worker_id = worker_id;
        }
    }

    if let Some(metrics) = patch.current_attempt_metrics {
        if let Some(index) = current_attempt_index(&record) {
            record.attempts[index].metrics = metrics;
        }
    }

    if should_refresh_progress {
        record.progress = derive_task_progress(&record.status, record.last_error.as_ref());
    }
    if let Some(progress) = patch.progress {
        record.progress = progress;
    }
    if let Some(ui_hints) = patch.ui_hints {
        record.ui_hints = ui_hints;
    }

    record.updated_at = Some(occurred_at.clone());
    write_task_record(&task_path, &record)?;
    Ok(build_task_output(workspace_root, &task_path, record, false))
}

pub fn retry_task_artifact(
    workspace_root: &Path,
    task_ref: &str,
    artifact_dir: Option<&str>,
) -> Result<TaskOutput, MediaRuntimeError> {
    let task_path = resolve_task_reference_path(workspace_root, task_ref, artifact_dir)?;
    let mut record = read_task_record(&task_path)?;
    let normalized_status = record.normalized_status.clone();
    if normalized_status != "failed" && normalized_status != "cancelled" {
        return Err(MediaRuntimeError::NotRetryable(format!(
            "当前状态 `{}` 不支持 retry",
            record.status
        )));
    }

    let task_type = record.task_type.parse::<TaskType>().map_err(|_| {
        MediaRuntimeError::InvalidState(format!("未知任务类型: {}", record.task_type))
    })?;
    let retry_status = task_type.default_status().to_string();
    let occurred_at = Utc::now().to_rfc3339();
    let next_attempt_index = record.attempts.len() as u32 + 1;
    let previous_attempt_id = record.current_attempt_id.clone();
    let mut next_attempt = build_attempt_record(
        &record.task_id,
        &record.payload,
        AttemptRecordInput {
            attempt_id: new_attempt_id(),
            attempt_index: next_attempt_index,
            status: retry_status.clone(),
            queued_at: None,
            started_at: None,
            completed_at: None,
            result_snapshot: None,
            error: None,
        },
    );
    apply_status_to_attempt(&mut next_attempt, &retry_status, &occurred_at);

    record.attempts.push(next_attempt);
    record.current_attempt_id = record
        .attempts
        .last()
        .map(|attempt| attempt.attempt_id.clone());
    record.relationships.derived_from_attempt_id = previous_attempt_id;
    record.updated_at = Some(occurred_at.clone());
    record.result = None;
    record.last_error = None;
    record.source_task_id = None;
    record.retry_count = record.attempts.len().saturating_sub(1) as u32;
    apply_status_to_record(&mut record, &retry_status, &occurred_at);

    write_task_record(&task_path, &record)?;
    Ok(build_task_output(workspace_root, &task_path, record, false))
}

pub fn parse_task_output(raw: &str) -> Option<TaskOutput> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    serde_json::from_str::<TaskOutput>(trimmed)
        .ok()
        .map(|mut value| {
            value.record = canonicalize_task_record(value.record);
            value.task_family = if value.task_family.trim().is_empty() {
                value.record.task_family.clone()
            } else {
                value.task_family
            };
            value.status = if value.status.trim().is_empty() {
                value.record.status.clone()
            } else {
                value.status
            };
            value.normalized_status = normalize_status(&value.status);
            value.current_attempt_id = value
                .current_attempt_id
                .or_else(|| value.record.current_attempt_id.clone());
            if value.attempt_count == 0 {
                value.attempt_count = value.record.attempts.len() as u32;
            }
            if value.last_error.is_none() {
                value.last_error = value.record.last_error.clone();
            }
            if value.progress.is_empty() {
                value.progress = value.record.progress.clone();
            }
            if value.ui_hints.is_empty() {
                value.ui_hints = value.record.ui_hints.clone();
            }
            value
        })
        .filter(|value| value.success && !value.task_type.trim().is_empty())
}

pub fn parse_media_task_output(raw: &str) -> Option<MediaTaskOutput> {
    parse_task_output(raw)
}
