use crate::file_checkpoint_snapshot::FileCheckpointSnapshotReadRequest;
use crate::file_checkpoint_snapshot::FileCheckpointSnapshotStore;
use app_server_protocol::AgentSessionFileCheckpointDetail;
use app_server_protocol::AgentSessionFileCheckpointDiffResponse;
use app_server_protocol::AgentSessionFileCheckpointListResponse;
use app_server_protocol::AgentSessionFileCheckpointRestoreResponse;
use app_server_protocol::AgentSessionFileCheckpointSummary;
use chrono::Utc;
use serde_json::{Map, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
struct FileCheckpointRecord {
    summary: AgentSessionFileCheckpointSummary,
    content: Option<String>,
    metadata: Option<Value>,
}

pub fn list_file_checkpoints(
    detail: &Value,
) -> Result<AgentSessionFileCheckpointListResponse, String> {
    let session_id = required_detail_string(detail, &["session_id", "id"], "session_id")?;
    let thread_id = required_detail_string(detail, &["thread_id"], "thread_id")?;
    let checkpoints = collect_file_checkpoint_records(detail)
        .into_iter()
        .map(|record| record.summary)
        .collect::<Vec<_>>();

    Ok(AgentSessionFileCheckpointListResponse {
        session_id,
        thread_id,
        checkpoint_count: checkpoints.len(),
        checkpoints,
    })
}

pub fn get_file_checkpoint(
    detail: &Value,
    workspace_root: &Path,
    snapshot_store: &dyn FileCheckpointSnapshotStore,
    checkpoint_id: &str,
) -> Result<AgentSessionFileCheckpointDetail, String> {
    let session_id = required_detail_string(detail, &["session_id", "id"], "session_id")?;
    let thread_id = required_detail_string(detail, &["thread_id"], "thread_id")?;
    let record = find_file_checkpoint_record(detail, checkpoint_id)?;
    let metadata = record.metadata.as_ref();
    let snapshot_path = extract_snapshot_path(metadata, record.summary.path.as_str())
        .unwrap_or_else(|| record.summary.path.clone());
    let checkpoint_document = read_json_workspace_path(workspace_root, snapshot_path.as_str())
        .or_else(|| extract_artifact_document(metadata));
    let live_document = read_json_workspace_path(workspace_root, record.summary.path.as_str())
        .or_else(|| {
            if snapshot_path == record.summary.path {
                checkpoint_document.clone()
            } else {
                None
            }
        });
    let content = checkpoint_content(
        session_id.as_str(),
        metadata,
        record.content.as_deref(),
        snapshot_store,
    );

    Ok(AgentSessionFileCheckpointDetail {
        session_id,
        thread_id,
        checkpoint: record.summary.clone(),
        live_path: record.summary.path.clone(),
        snapshot_path,
        checkpoint_document,
        live_document,
        version_history: extract_version_history(metadata),
        validation_issues: extract_validation_issues(metadata),
        metadata: record.metadata.clone(),
        content,
    })
}

pub fn diff_file_checkpoint(
    detail: &Value,
    checkpoint_id: &str,
) -> Result<AgentSessionFileCheckpointDiffResponse, String> {
    let session_id = required_detail_string(detail, &["session_id", "id"], "session_id")?;
    let thread_id = required_detail_string(detail, &["thread_id"], "thread_id")?;
    let record = find_file_checkpoint_record(detail, checkpoint_id)?;
    let metadata = record.metadata.as_ref();
    let current_version_id = record.summary.version_id.clone();
    let current_version_no = record.summary.version_no;

    Ok(AgentSessionFileCheckpointDiffResponse {
        session_id,
        thread_id,
        checkpoint: record.summary.clone(),
        current_version_id,
        previous_version_id: extract_previous_version_id(metadata, current_version_no),
        diff: extract_version_diff(metadata),
    })
}

pub fn restore_file_checkpoint(
    detail: &Value,
    workspace_root: &Path,
    snapshot_store: &dyn FileCheckpointSnapshotStore,
    checkpoint_id: &str,
    confirm_restore: bool,
    create_backup: bool,
) -> Result<AgentSessionFileCheckpointRestoreResponse, String> {
    if !confirm_restore {
        return Err("恢复文件快照需要显式确认".to_string());
    }

    let session_id = required_detail_string(detail, &["session_id", "id"], "session_id")?;
    let thread_id = required_detail_string(detail, &["thread_id"], "thread_id")?;
    let record = find_file_checkpoint_record(detail, checkpoint_id)?;
    let metadata = record.metadata.as_ref();
    let snapshot_path = extract_snapshot_path(metadata, record.summary.path.as_str())
        .unwrap_or_else(|| record.summary.path.clone());
    let live_relative_path =
        resolve_workspace_relative_path(workspace_root, record.summary.path.as_str())?;
    let snapshot_relative_path =
        resolve_workspace_relative_path(workspace_root, snapshot_path.as_str())?;
    let live_path = workspace_root.join(relative_path_to_platform_path(&live_relative_path));
    let snapshot_path =
        workspace_root.join(relative_path_to_platform_path(&snapshot_relative_path));
    let restored_content = checkpoint_content(
        session_id.as_str(),
        metadata,
        record.content.as_deref(),
        snapshot_store,
    );
    if restored_content.is_none() && live_relative_path == snapshot_relative_path {
        return Err(format!(
            "文件快照与目标文件相同，无法安全恢复: {live_relative_path}"
        ));
    }

    if restored_content.is_none() && !snapshot_path.is_file() {
        return Err(format!(
            "文件快照不存在或不可读取: {snapshot_relative_path}"
        ));
    }

    let backup_path = if create_backup && live_path.exists() {
        let backup_relative_path =
            build_restore_backup_relative_path(&live_relative_path, Utc::now());
        let backup_absolute_path =
            workspace_root.join(relative_path_to_platform_path(&backup_relative_path));
        if let Some(parent) = backup_absolute_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!("创建恢复前备份目录失败: {backup_relative_path}, {error}")
            })?;
        }
        fs::copy(&live_path, &backup_absolute_path)
            .map_err(|error| format!("写入恢复前备份失败: {backup_relative_path}, {error}"))?;
        Some(backup_relative_path)
    } else {
        None
    };

    if let Some(parent) = live_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建目标文件目录失败: {live_relative_path}, {error}"))?;
    }

    if let Some(content) = restored_content {
        fs::write(&live_path, content)
            .map_err(|error| format!("恢复文件快照失败: {live_relative_path}, {error}"))?;
    } else {
        fs::copy(&snapshot_path, &live_path)
            .map_err(|error| format!("恢复文件快照失败: {live_relative_path}, {error}"))?;
    }

    Ok(AgentSessionFileCheckpointRestoreResponse {
        session_id,
        thread_id,
        checkpoint: record.summary.clone(),
        live_path: live_relative_path,
        snapshot_path: snapshot_relative_path,
        backup_path,
        restored_at: Utc::now().to_rfc3339(),
    })
}

pub fn resolve_workspace_root(detail: &Value) -> Result<PathBuf, String> {
    let working_dir =
        required_detail_string(detail, &["working_dir", "workingDir"], "working_dir")?;
    let path = PathBuf::from(working_dir.trim());
    if !path.is_absolute() {
        return Err("当前会话 working_dir 必须是绝对路径".to_string());
    }
    Ok(path)
}

fn find_file_checkpoint_record(
    detail: &Value,
    checkpoint_id: &str,
) -> Result<FileCheckpointRecord, String> {
    let normalized_checkpoint_id = checkpoint_id.trim();
    if normalized_checkpoint_id.is_empty() {
        return Err("checkpoint_id 不能为空".to_string());
    }

    collect_file_checkpoint_records(detail)
        .into_iter()
        .find(|record| record.summary.checkpoint_id == normalized_checkpoint_id)
        .ok_or_else(|| format!("未找到文件快照: {normalized_checkpoint_id}"))
}

fn collect_file_checkpoint_records(detail: &Value) -> Vec<FileCheckpointRecord> {
    let mut seen = HashSet::new();
    let mut checkpoints = Vec::new();
    let Some(items) = detail.get("items").and_then(Value::as_array) else {
        return checkpoints;
    };

    for item in items.iter().rev() {
        let Some(record) = checkpoint_record_from_item(item) else {
            continue;
        };
        if seen.insert(record.summary.checkpoint_id.clone()) {
            checkpoints.push(record);
        }
    }

    checkpoints.sort_by(|left, right| {
        right
            .summary
            .updated_at
            .cmp(&left.summary.updated_at)
            .then_with(|| left.summary.path.cmp(&right.summary.path))
    });
    checkpoints
}

fn checkpoint_record_from_item(item: &Value) -> Option<FileCheckpointRecord> {
    let item = item.as_object()?;
    let item_type = item.get("type").and_then(Value::as_str)?;
    if item_type != "file_artifact" {
        return None;
    }
    let normalized_path = value_string(item.get("path"))?;
    let normalized_source =
        value_string(item.get("source")).unwrap_or_else(|| "runtime".to_string());
    let metadata = item.get("metadata").cloned();
    let metadata_ref = metadata.as_ref();
    let content = item
        .get("content")
        .and_then(Value::as_str)
        .map(ToString::to_string);
    let preview_text = extract_preview_text(metadata_ref, content.as_deref());
    let version_no = extract_version_no(metadata_ref);

    Some(FileCheckpointRecord {
        summary: AgentSessionFileCheckpointSummary {
            checkpoint_id: value_string(item.get("id"))?,
            turn_id: value_string(item.get("turn_id"))
                .or_else(|| value_string(item.get("turnId")))?,
            path: normalized_path.clone(),
            source: normalized_source,
            updated_at: value_string(item.get("updated_at"))
                .or_else(|| value_string(item.get("updatedAt")))?,
            version_no,
            version_id: extract_version_id(metadata_ref),
            request_id: extract_request_id(metadata_ref),
            title: extract_title(metadata_ref),
            kind: extract_kind(metadata_ref),
            status: extract_status(metadata_ref),
            preview_text,
            snapshot_path: extract_snapshot_path(metadata_ref, normalized_path.as_str()),
            validation_issue_count: extract_validation_issues(metadata_ref).len(),
        },
        content,
        metadata,
    })
}

fn required_detail_string(detail: &Value, keys: &[&str], label: &str) -> Result<String, String> {
    keys.iter()
        .find_map(|key| detail.get(*key))
        .and_then(|value| value_string(Some(value)))
        .ok_or_else(|| format!("当前会话 detail 缺少 {label}"))
}

fn value_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn metadata_object(metadata: Option<&Value>) -> Option<&Map<String, Value>> {
    metadata?.as_object()
}

fn metadata_string(metadata: Option<&Value>, key: &str) -> Option<String> {
    metadata_object(metadata)?
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn nested_metadata_string(metadata: Option<&Value>, parent_key: &str, key: &str) -> Option<String> {
    metadata_object(metadata)?
        .get(parent_key)
        .and_then(Value::as_object)?
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn metadata_u32(metadata: Option<&Value>, key: &str) -> Option<u32> {
    metadata_object(metadata)?
        .get(key)
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
}

fn nested_metadata_u32(metadata: Option<&Value>, parent_key: &str, key: &str) -> Option<u32> {
    metadata_object(metadata)?
        .get(parent_key)
        .and_then(Value::as_object)?
        .get(key)
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
}

fn extract_version_no(metadata: Option<&Value>) -> Option<u32> {
    metadata_u32(metadata, "artifactVersionNo")
        .or_else(|| nested_metadata_u32(metadata, "artifactVersion", "versionNo"))
}

fn extract_version_id(metadata: Option<&Value>) -> Option<String> {
    metadata_string(metadata, "artifactVersionId")
        .or_else(|| nested_metadata_string(metadata, "artifactVersion", "id"))
}

fn extract_request_id(metadata: Option<&Value>) -> Option<String> {
    metadata_string(metadata, "artifactRequestId")
}

fn extract_title(metadata: Option<&Value>) -> Option<String> {
    metadata_string(metadata, "artifactTitle")
        .or_else(|| nested_metadata_string(metadata, "artifactVersion", "title"))
        .or_else(|| nested_metadata_string(metadata, "artifactDocument", "title"))
}

fn extract_kind(metadata: Option<&Value>) -> Option<String> {
    metadata_string(metadata, "artifactKind")
        .or_else(|| nested_metadata_string(metadata, "artifactVersion", "kind"))
        .or_else(|| nested_metadata_string(metadata, "artifactDocument", "kind"))
}

fn extract_status(metadata: Option<&Value>) -> Option<String> {
    metadata_string(metadata, "artifactStatus")
        .or_else(|| nested_metadata_string(metadata, "artifactVersion", "status"))
        .or_else(|| nested_metadata_string(metadata, "artifactDocument", "status"))
}

fn extract_snapshot_path(metadata: Option<&Value>, fallback_path: &str) -> Option<String> {
    nested_metadata_string(metadata, "artifactVersion", "snapshotPath")
        .or_else(|| metadata_string(metadata, "artifact_path"))
        .or_else(|| {
            let trimmed = fallback_path.trim();
            (!trimmed.is_empty()).then(|| trimmed.to_string())
        })
}

fn extract_preview_text(metadata: Option<&Value>, content: Option<&str>) -> Option<String> {
    metadata_string(metadata, "previewText")
        .or_else(|| nested_metadata_string(metadata, "artifactDocument", "summary"))
        .or_else(|| nested_metadata_string(metadata, "artifactDocument", "title"))
        .or_else(|| {
            content
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(truncate_text)
        })
}

fn truncate_text(value: &str) -> String {
    const MAX_PREVIEW_CHARS: usize = 240;
    let normalized = value
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let mut chars = normalized.chars();
    let prefix: String = chars.by_ref().take(MAX_PREVIEW_CHARS).collect();
    if chars.next().is_some() {
        format!("{prefix}...")
    } else {
        prefix
    }
}

fn extract_validation_issues(metadata: Option<&Value>) -> Vec<String> {
    metadata_object(metadata)
        .and_then(|record| record.get("artifactValidationIssues"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn extract_artifact_document(metadata: Option<&Value>) -> Option<Value> {
    metadata_object(metadata)?.get("artifactDocument").cloned()
}

fn extract_version_history(metadata: Option<&Value>) -> Vec<Value> {
    metadata_object(metadata)
        .and_then(|record| record.get("artifactVersions"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn extract_previous_version_id(
    metadata: Option<&Value>,
    current_version_no: Option<u32>,
) -> Option<String> {
    let current_version_no = current_version_no?;
    let previous_version_no = current_version_no.checked_sub(1)?;

    extract_version_history(metadata)
        .into_iter()
        .find_map(|value| {
            let record = value.as_object()?;
            let version_no = record.get("versionNo").and_then(Value::as_u64)?;
            if version_no != u64::from(previous_version_no) {
                return None;
            }
            record
                .get("id")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
        })
}

fn extract_version_diff(metadata: Option<&Value>) -> Option<Value> {
    metadata_object(metadata)?
        .get("artifactVersionDiff")
        .cloned()
}

fn checkpoint_content(
    session_id: &str,
    metadata: Option<&Value>,
    inline_content: Option<&str>,
    snapshot_store: &dyn FileCheckpointSnapshotStore,
) -> Option<String> {
    read_checkpoint_snapshot_content(session_id, metadata, snapshot_store)
        .or_else(|| inline_content.map(ToString::to_string))
        .or_else(|| extract_previous_content_from_file_change(metadata))
}

fn read_checkpoint_snapshot_content(
    session_id: &str,
    metadata: Option<&Value>,
    snapshot_store: &dyn FileCheckpointSnapshotStore,
) -> Option<String> {
    let file_name = metadata_string(metadata, "checkpointSnapshotFile")
        .or_else(|| nested_metadata_string(metadata, "file_change", "previousContentSnapshotFile"))
        .or_else(|| nested_metadata_string(metadata, "file_change", "checkpointSnapshotFile"))?;
    snapshot_store.read_file_checkpoint_snapshot(&FileCheckpointSnapshotReadRequest {
        session_id: session_id.to_string(),
        file_name,
    })
}

fn extract_previous_content_from_file_change(metadata: Option<&Value>) -> Option<String> {
    let file_change = metadata_object(metadata)?
        .get("file_change")
        .and_then(Value::as_object)?;
    if let Some(content) = [
        "previousContent",
        "previous_content",
        "beforeContent",
        "before_content",
        "oldContent",
        "old_content",
    ]
    .iter()
    .find_map(|key| file_change.get(*key).and_then(Value::as_str))
    {
        return Some(content.to_string());
    }
    if file_change
        .get("truncated")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return None;
    }

    let diff = file_change.get("diff").and_then(Value::as_array)?;
    let mut lines = Vec::new();
    let mut saw_removed_line = false;

    for entry in diff {
        let entry = entry.as_object()?;
        let kind = entry.get("kind").and_then(Value::as_str)?;
        let value = entry.get("value").and_then(Value::as_str)?;
        match kind {
            "context" => lines.push(value.to_string()),
            "remove" => {
                saw_removed_line = true;
                lines.push(value.to_string());
            }
            "add" => {}
            _ => return None,
        }
    }

    if !saw_removed_line {
        return None;
    }

    Some(lines.join("\n"))
}

fn read_json_workspace_path(workspace_root: &Path, path: &str) -> Option<Value> {
    let normalized = resolve_workspace_relative_path(workspace_root, path).ok()?;
    let path = workspace_root.join(relative_path_to_platform_path(&normalized));
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str::<Value>(&raw).ok()
}

fn resolve_workspace_relative_path(_workspace_root: &Path, path: &str) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("文件路径不能为空".to_string());
    }

    let candidate = PathBuf::from(trimmed);
    if candidate.is_absolute() {
        return Err(format!("文件路径必须是工作区相对路径: {path}"));
    }

    normalize_workspace_relative_path(trimmed)
}

fn normalize_workspace_relative_path(relative_path: &str) -> Result<String, String> {
    let normalized = relative_path.trim().replace('\\', "/");
    if normalized.is_empty() {
        return Err("文件路径不能为空".to_string());
    }
    if normalized.starts_with('/') || normalized.starts_with('~') {
        return Err(format!("文件路径必须位于当前工作区内: {relative_path}"));
    }

    let mut segments = Vec::new();
    for segment in normalized.split('/') {
        let segment = segment.trim();
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." || segment.contains(':') {
            return Err(format!("文件路径必须位于当前工作区内: {relative_path}"));
        }
        segments.push(segment);
    }

    if segments.is_empty() {
        return Err("文件路径不能为空".to_string());
    }

    Ok(segments.join("/"))
}

fn relative_path_to_platform_path(relative_path: &str) -> PathBuf {
    relative_path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<PathBuf>()
}

fn build_restore_backup_relative_path(
    live_relative_path: &str,
    now: chrono::DateTime<Utc>,
) -> String {
    let backup_id = now.format("%Y%m%dT%H%M%SZ");
    format!(
        ".lime/file-checkpoint-backups/{backup_id}/{}",
        live_relative_path.trim_start_matches('/')
    )
}
