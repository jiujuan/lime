//! Runtime file checkpoint 服务
//!
//! 基于当前 SessionDetail -> FileArtifact -> artifact sidecar 主链，
//! 提供文件快照摘要、详情与 diff 读取能力。

use crate::agent::SessionDetail;
use crate::commands::aster_agent_cmd::{
    AgentRuntimeFileCheckpointDetail, AgentRuntimeFileCheckpointDiffResult,
    AgentRuntimeFileCheckpointListResult, AgentRuntimeFileCheckpointRestoreResult,
    AgentRuntimeFileCheckpointSummary, AgentRuntimeFileCheckpointThreadSummary,
};
use lime_core::database::dao::agent_timeline::{AgentThreadItem, AgentThreadItemPayload};
use serde_json::{Map, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
struct RuntimeFileCheckpointRecord {
    summary: AgentRuntimeFileCheckpointSummary,
    content: Option<String>,
    metadata: Option<Value>,
}

pub fn build_thread_file_checkpoint_summary(
    detail: &SessionDetail,
) -> Option<AgentRuntimeFileCheckpointThreadSummary> {
    let checkpoints = collect_file_checkpoint_records(detail);
    if checkpoints.is_empty() {
        return None;
    }

    Some(AgentRuntimeFileCheckpointThreadSummary {
        count: checkpoints.len(),
        latest_checkpoint: checkpoints.first().map(|record| record.summary.clone()),
    })
}

pub fn list_file_checkpoints(detail: &SessionDetail) -> AgentRuntimeFileCheckpointListResult {
    let checkpoints = collect_file_checkpoint_records(detail)
        .into_iter()
        .map(|record| record.summary)
        .collect::<Vec<_>>();

    AgentRuntimeFileCheckpointListResult {
        session_id: detail.id.clone(),
        thread_id: detail.thread_id.clone(),
        checkpoint_count: checkpoints.len(),
        checkpoints,
    }
}

pub fn get_file_checkpoint(
    detail: &SessionDetail,
    workspace_root: &Path,
    checkpoint_id: &str,
) -> Result<AgentRuntimeFileCheckpointDetail, String> {
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

    Ok(AgentRuntimeFileCheckpointDetail {
        session_id: detail.id.clone(),
        thread_id: detail.thread_id.clone(),
        checkpoint: record.summary.clone(),
        live_path: record.summary.path.clone(),
        snapshot_path,
        checkpoint_document,
        live_document,
        version_history: extract_version_history(metadata),
        validation_issues: extract_validation_issues(metadata),
        metadata: record.metadata.clone(),
        content: record.content.clone(),
    })
}

pub fn diff_file_checkpoint(
    detail: &SessionDetail,
    checkpoint_id: &str,
) -> Result<AgentRuntimeFileCheckpointDiffResult, String> {
    let record = find_file_checkpoint_record(detail, checkpoint_id)?;
    let metadata = record.metadata.as_ref();
    let current_version_id = record.summary.version_id.clone();
    let current_version_no = record.summary.version_no;

    Ok(AgentRuntimeFileCheckpointDiffResult {
        session_id: detail.id.clone(),
        thread_id: detail.thread_id.clone(),
        checkpoint: record.summary.clone(),
        current_version_id,
        previous_version_id: extract_previous_version_id(metadata, current_version_no),
        diff: extract_version_diff(metadata),
    })
}

pub fn restore_file_checkpoint(
    detail: &SessionDetail,
    workspace_root: &Path,
    checkpoint_id: &str,
    confirm_restore: bool,
    create_backup: bool,
) -> Result<AgentRuntimeFileCheckpointRestoreResult, String> {
    if !confirm_restore {
        return Err("恢复文件快照需要显式确认".to_string());
    }

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
    let restored_content = extract_previous_content_from_file_change(metadata);
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
            build_restore_backup_relative_path(&live_relative_path, chrono::Utc::now());
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

    Ok(AgentRuntimeFileCheckpointRestoreResult {
        session_id: detail.id.clone(),
        thread_id: detail.thread_id.clone(),
        checkpoint: record.summary.clone(),
        live_path: live_relative_path,
        snapshot_path: snapshot_relative_path,
        backup_path,
        restored_at: chrono::Utc::now().to_rfc3339(),
    })
}

fn find_file_checkpoint_record(
    detail: &SessionDetail,
    checkpoint_id: &str,
) -> Result<RuntimeFileCheckpointRecord, String> {
    let normalized_checkpoint_id = checkpoint_id.trim();
    if normalized_checkpoint_id.is_empty() {
        return Err("checkpoint_id 不能为空".to_string());
    }

    collect_file_checkpoint_records(detail)
        .into_iter()
        .find(|record| record.summary.checkpoint_id == normalized_checkpoint_id)
        .ok_or_else(|| format!("未找到文件快照: {normalized_checkpoint_id}"))
}

fn collect_file_checkpoint_records(detail: &SessionDetail) -> Vec<RuntimeFileCheckpointRecord> {
    let mut seen = HashSet::new();
    let mut checkpoints = Vec::new();

    for item in detail.items.iter().rev() {
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

fn checkpoint_record_from_item(item: &AgentThreadItem) -> Option<RuntimeFileCheckpointRecord> {
    let AgentThreadItemPayload::FileArtifact {
        path,
        source,
        content,
        metadata,
    } = &item.payload
    else {
        return None;
    };

    let normalized_path = normalize_optional_text(path.clone())?;
    let normalized_source =
        normalize_optional_text(source.clone()).unwrap_or_else(|| "runtime".to_string());
    let metadata_ref = metadata.as_ref();
    let preview_text = extract_preview_text(metadata_ref, content.as_deref());
    let version_no = extract_version_no(metadata_ref);

    Some(RuntimeFileCheckpointRecord {
        summary: AgentRuntimeFileCheckpointSummary {
            checkpoint_id: item.id.clone(),
            turn_id: item.turn_id.clone(),
            path: normalized_path.clone(),
            source: normalized_source,
            updated_at: item.updated_at.clone(),
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
        content: content.clone(),
        metadata: metadata.clone(),
    })
}

fn normalize_optional_text(value: String) -> Option<String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
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
        .or_else(|| normalize_optional_text(fallback_path.to_string()))
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

fn extract_previous_content_from_file_change(metadata: Option<&Value>) -> Option<String> {
    let file_change = metadata_object(metadata)?
        .get("file_change")
        .and_then(Value::as_object)?;
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

fn resolve_workspace_relative_path(workspace_root: &Path, path: &str) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("文件路径不能为空".to_string());
    }

    let candidate = PathBuf::from(trimmed);
    if candidate.is_absolute() {
        let relative_path = candidate
            .strip_prefix(workspace_root)
            .map_err(|_| format!("文件路径必须位于当前工作区内: {path}"))?;
        return normalize_workspace_relative_path(&relative_path.to_string_lossy());
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
    now: chrono::DateTime<chrono::Utc>,
) -> String {
    let backup_id = now.format("%Y%m%dT%H%M%SZ");
    format!(
        ".lime/file-checkpoint-backups/{backup_id}/{}",
        live_relative_path.trim_start_matches('/')
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use lime_core::database::dao::agent_timeline::{AgentThreadItemStatus, AgentThreadTurn};
    use tempfile::tempdir;

    fn build_detail(item: AgentThreadItem) -> SessionDetail {
        SessionDetail {
            id: "session-1".to_string(),
            name: "测试会话".to_string(),
            created_at: 0,
            updated_at: 0,
            thread_id: "thread-1".to_string(),
            model: None,
            working_dir: None,
            workspace_id: Some("workspace-1".to_string()),
            messages: Vec::new(),
            execution_strategy: None,
            execution_runtime: None,
            turns: vec![AgentThreadTurn {
                id: "turn-1".to_string(),
                thread_id: "thread-1".to_string(),
                prompt_text: "生成 artifact".to_string(),
                status: lime_core::database::dao::agent_timeline::AgentThreadTurnStatus::Completed,
                started_at: "2026-04-15T00:00:00Z".to_string(),
                completed_at: Some("2026-04-15T00:00:01Z".to_string()),
                error_message: None,
                created_at: "2026-04-15T00:00:00Z".to_string(),
                updated_at: "2026-04-15T00:00:01Z".to_string(),
            }],
            items: vec![item],
            todo_items: Vec::new(),
            child_subagent_sessions: Vec::new(),
            subagent_parent_context: None,
        }
    }

    fn build_item(metadata: Option<Value>) -> AgentThreadItem {
        build_item_with_path(
            ".lime/artifacts/thread-1/demo.artifact.json",
            Some("# Demo"),
            metadata,
        )
    }

    fn build_item_with_path(
        path: &str,
        content: Option<&str>,
        metadata: Option<Value>,
    ) -> AgentThreadItem {
        AgentThreadItem {
            id: "artifact-document:req-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 1,
            status: AgentThreadItemStatus::Completed,
            started_at: "2026-04-15T00:00:00Z".to_string(),
            completed_at: Some("2026-04-15T00:00:01Z".to_string()),
            updated_at: "2026-04-15T00:00:01Z".to_string(),
            payload: AgentThreadItemPayload::FileArtifact {
                path: path.to_string(),
                source: "artifact_document_service".to_string(),
                content: content.map(ToString::to_string),
                metadata,
            },
        }
    }

    #[test]
    fn build_thread_summary_should_extract_latest_checkpoint_metadata() {
        let detail = build_detail(build_item(Some(serde_json::json!({
            "artifactVersionNo": 3,
            "artifactVersionId": "artifact-document:req-1:v3",
            "artifactRequestId": "req-1",
            "artifactTitle": "Demo",
            "artifactKind": "analysis",
            "artifactStatus": "ready",
            "previewText": "最新版本摘要",
            "artifactVersion": {
                "snapshotPath": ".lime/artifacts/thread-1/versions/demo/v0003.artifact.json"
            },
            "artifactValidationIssues": ["missing-source"]
        }))));

        let summary = build_thread_file_checkpoint_summary(&detail).expect("summary should exist");

        assert_eq!(summary.count, 1);
        let latest = summary.latest_checkpoint.expect("latest checkpoint");
        assert_eq!(latest.checkpoint_id, "artifact-document:req-1");
        assert_eq!(latest.version_no, Some(3));
        assert_eq!(
            latest.version_id.as_deref(),
            Some("artifact-document:req-1:v3")
        );
        assert_eq!(latest.request_id.as_deref(), Some("req-1"));
        assert_eq!(latest.preview_text.as_deref(), Some("最新版本摘要"));
        assert_eq!(latest.validation_issue_count, 1);
    }

    #[test]
    fn get_file_checkpoint_should_read_snapshot_and_live_documents() {
        let temp_dir = tempdir().expect("temp dir");
        let workspace_root = temp_dir.path();
        let live_path = workspace_root.join(".lime/artifacts/thread-1/demo.artifact.json");
        let snapshot_path =
            workspace_root.join(".lime/artifacts/thread-1/versions/demo/v0002.artifact.json");
        fs::create_dir_all(live_path.parent().expect("live parent")).expect("live dir");
        fs::create_dir_all(snapshot_path.parent().expect("snapshot parent")).expect("snapshot dir");
        fs::write(
            &live_path,
            serde_json::json!({
                "title": "当前版本",
                "summary": "current"
            })
            .to_string(),
        )
        .expect("write live");
        fs::write(
            &snapshot_path,
            serde_json::json!({
                "title": "版本 2",
                "summary": "snapshot"
            })
            .to_string(),
        )
        .expect("write snapshot");

        let detail = build_detail(build_item(Some(serde_json::json!({
            "artifactVersionNo": 2,
            "artifactVersionId": "artifact-document:req-1:v2",
            "artifactVersion": {
                "id": "artifact-document:req-1:v2",
                "versionNo": 2,
                "snapshotPath": ".lime/artifacts/thread-1/versions/demo/v0002.artifact.json"
            },
            "artifactVersions": [
                { "id": "artifact-document:req-1:v1", "versionNo": 1 },
                { "id": "artifact-document:req-1:v2", "versionNo": 2 }
            ],
            "artifactValidationIssues": ["warning-a"]
        }))));

        let detail_result = get_file_checkpoint(&detail, workspace_root, "artifact-document:req-1")
            .expect("detail");

        assert_eq!(
            detail_result.snapshot_path,
            ".lime/artifacts/thread-1/versions/demo/v0002.artifact.json"
        );
        assert_eq!(detail_result.version_history.len(), 2);
        assert_eq!(
            detail_result.validation_issues,
            vec!["warning-a".to_string()]
        );
        assert_eq!(
            detail_result
                .checkpoint_document
                .as_ref()
                .and_then(|value| value.get("title"))
                .and_then(Value::as_str),
            Some("版本 2")
        );
        assert_eq!(
            detail_result
                .live_document
                .as_ref()
                .and_then(|value| value.get("title"))
                .and_then(Value::as_str),
            Some("当前版本")
        );
    }

    #[test]
    fn diff_file_checkpoint_should_return_metadata_diff_and_previous_version() {
        let detail = build_detail(build_item(Some(serde_json::json!({
            "artifactVersionNo": 4,
            "artifactVersionId": "artifact-document:req-1:v4",
            "artifactVersions": [
                { "id": "artifact-document:req-1:v3", "versionNo": 3 },
                { "id": "artifact-document:req-1:v4", "versionNo": 4 }
            ],
            "artifactVersionDiff": {
                "summary": "更新结论段与证据链接"
            }
        }))));

        let diff =
            diff_file_checkpoint(&detail, "artifact-document:req-1").expect("diff should exist");

        assert_eq!(
            diff.previous_version_id.as_deref(),
            Some("artifact-document:req-1:v3")
        );
        assert_eq!(
            diff.diff
                .as_ref()
                .and_then(|value| value.get("summary"))
                .and_then(Value::as_str),
            Some("更新结论段与证据链接")
        );
    }

    #[test]
    fn restore_file_checkpoint_should_require_explicit_confirmation() {
        let temp_dir = tempdir().expect("temp dir");
        let detail = build_detail(build_item(Some(serde_json::json!({
            "artifactVersion": {
                "snapshotPath": ".lime/artifacts/thread-1/versions/demo/v0002.artifact.json"
            }
        }))));

        let error = restore_file_checkpoint(
            &detail,
            temp_dir.path(),
            "artifact-document:req-1",
            false,
            true,
        )
        .expect_err("restore without confirmation should fail");

        assert!(error.contains("显式确认"));
    }

    #[test]
    fn restore_file_checkpoint_should_restore_snapshot_and_backup_live_file() {
        let temp_dir = tempdir().expect("temp dir");
        let workspace_root = temp_dir.path();
        let live_path = workspace_root.join(".lime/artifacts/thread-1/demo.artifact.json");
        let snapshot_path =
            workspace_root.join(".lime/artifacts/thread-1/versions/demo/v0002.artifact.json");
        fs::create_dir_all(live_path.parent().expect("live parent")).expect("live dir");
        fs::create_dir_all(snapshot_path.parent().expect("snapshot parent")).expect("snapshot dir");
        fs::write(&live_path, r#"{"title":"当前版本"}"#).expect("write live");
        fs::write(&snapshot_path, r#"{"title":"恢复版本"}"#).expect("write snapshot");
        let detail = build_detail(build_item(Some(serde_json::json!({
            "artifactVersionNo": 2,
            "artifactVersionId": "artifact-document:req-1:v2",
            "artifactVersion": {
                "id": "artifact-document:req-1:v2",
                "versionNo": 2,
                "snapshotPath": ".lime/artifacts/thread-1/versions/demo/v0002.artifact.json"
            }
        }))));

        let result = restore_file_checkpoint(
            &detail,
            workspace_root,
            "artifact-document:req-1",
            true,
            true,
        )
        .expect("restore should succeed");

        assert_eq!(
            fs::read_to_string(&live_path).expect("read live"),
            r#"{"title":"恢复版本"}"#
        );
        let backup_path = result.backup_path.expect("backup path");
        assert!(backup_path.starts_with(".lime/file-checkpoint-backups/"));
        assert_eq!(
            fs::read_to_string(workspace_root.join(relative_path_to_platform_path(&backup_path)))
                .expect("read backup"),
            r#"{"title":"当前版本"}"#
        );
        assert_eq!(
            result.snapshot_path,
            ".lime/artifacts/thread-1/versions/demo/v0002.artifact.json"
        );
    }

    #[test]
    fn restore_file_checkpoint_should_use_file_change_diff_when_snapshot_is_live_file() {
        let temp_dir = tempdir().expect("temp dir");
        let workspace_root = temp_dir.path();
        let live_path = workspace_root.join(".lime/qc/code-runtime-fixture/src/greeting.ts");
        fs::create_dir_all(live_path.parent().expect("live parent")).expect("live dir");
        fs::write(
            &live_path,
            "export function greeting() {\n  return 'Hello Lime Runtime';\n}\n\nexport const runtimeVerified = true;\n",
        )
        .expect("write live");
        let detail = build_detail(build_item_with_path(
            ".lime/qc/code-runtime-fixture/src/greeting.ts",
            None,
            Some(serde_json::json!({
                "artifactKind": "code_file",
                "artifactVersion": {
                    "snapshotPath": ".lime/qc/code-runtime-fixture/src/greeting.ts"
                },
                "file_change": {
                    "kind": "update",
                    "path": ".lime/qc/code-runtime-fixture/src/greeting.ts",
                    "truncated": false,
                    "diff": [
                        { "kind": "context", "value": "export function greeting() {" },
                        { "kind": "remove", "value": "  return 'Hello from initial fixture';" },
                        { "kind": "add", "value": "  return 'Hello Lime Runtime';" },
                        { "kind": "context", "value": "}" },
                        { "kind": "context", "value": "" },
                        { "kind": "add", "value": "export const runtimeVerified = true;" },
                        { "kind": "add", "value": "" }
                    ]
                }
            })),
        ));

        let result = restore_file_checkpoint(
            &detail,
            workspace_root,
            "artifact-document:req-1",
            true,
            true,
        )
        .expect("restore should use inverse diff");

        assert_eq!(
            fs::read_to_string(&live_path).expect("read live"),
            "export function greeting() {\n  return 'Hello from initial fixture';\n}\n"
        );
        let backup_path = result.backup_path.expect("backup path");
        assert_eq!(
            fs::read_to_string(workspace_root.join(relative_path_to_platform_path(&backup_path)))
                .expect("read backup"),
            "export function greeting() {\n  return 'Hello Lime Runtime';\n}\n\nexport const runtimeVerified = true;\n"
        );
    }

    #[test]
    fn restore_file_checkpoint_should_reject_live_snapshot_without_inverse_diff() {
        let temp_dir = tempdir().expect("temp dir");
        let workspace_root = temp_dir.path();
        let live_path = workspace_root.join(".lime/qc/code-runtime-fixture/src/greeting.ts");
        fs::create_dir_all(live_path.parent().expect("live parent")).expect("live dir");
        fs::write(&live_path, "current").expect("write live");
        let detail = build_detail(build_item_with_path(
            ".lime/qc/code-runtime-fixture/src/greeting.ts",
            None,
            Some(serde_json::json!({
                "artifactVersion": {
                    "snapshotPath": ".lime/qc/code-runtime-fixture/src/greeting.ts"
                }
            })),
        ));

        let error = restore_file_checkpoint(
            &detail,
            workspace_root,
            "artifact-document:req-1",
            true,
            true,
        )
        .expect_err("same live snapshot should be rejected");

        assert!(error.contains("无法安全恢复"));
        assert_eq!(
            fs::read_to_string(&live_path).expect("read live"),
            "current"
        );
        let backup_root = workspace_root.join(".lime/file-checkpoint-backups");
        assert!(!backup_root.exists());
    }

    #[test]
    fn restore_file_checkpoint_should_accept_absolute_path_inside_workspace() {
        let temp_dir = tempdir().expect("temp dir");
        let workspace_root = temp_dir.path();
        let live_path = workspace_root.join(".lime/qc/code-runtime-fixture/src/greeting.ts");
        let snapshot_path =
            workspace_root.join(".lime/qc/code-runtime-fixture/versions/greeting-v2.ts");
        fs::create_dir_all(live_path.parent().expect("live parent")).expect("live dir");
        fs::create_dir_all(snapshot_path.parent().expect("snapshot parent")).expect("snapshot dir");
        fs::write(&live_path, "current").expect("write live");
        fs::write(&snapshot_path, "snapshot").expect("write snapshot");

        let detail = build_detail(build_item_with_path(
            live_path.to_string_lossy().as_ref(),
            Some("snapshot"),
            Some(serde_json::json!({
                "artifactVersion": {
                    "snapshotPath": snapshot_path.to_string_lossy()
                }
            })),
        ));

        let result = restore_file_checkpoint(
            &detail,
            workspace_root,
            "artifact-document:req-1",
            true,
            true,
        )
        .expect("restore should accept workspace absolute path");

        assert_eq!(
            result.live_path,
            ".lime/qc/code-runtime-fixture/src/greeting.ts"
        );
        assert_eq!(
            fs::read_to_string(&live_path).expect("read live"),
            "snapshot"
        );
        assert!(result.backup_path.is_some());
    }

    #[test]
    fn restore_file_checkpoint_should_reject_workspace_escape_path() {
        let temp_dir = tempdir().expect("temp dir");
        let detail = build_detail(build_item_with_path(
            "../outside.json",
            Some("# Demo"),
            Some(serde_json::json!({
                "artifactVersion": {
                    "snapshotPath": ".lime/artifacts/thread-1/versions/demo/v0002.artifact.json"
                }
            })),
        ));

        let error = restore_file_checkpoint(
            &detail,
            temp_dir.path(),
            "artifact-document:req-1",
            true,
            true,
        )
        .expect_err("path escape should fail");

        assert!(error.contains("当前工作区"));
    }

    #[test]
    fn restore_file_checkpoint_should_reject_absolute_path_outside_workspace() {
        let workspace_dir = tempdir().expect("workspace dir");
        let outside_dir = tempdir().expect("outside dir");
        let outside_path = outside_dir.path().join("outside.json");
        fs::write(&outside_path, "{}").expect("write outside");
        let detail = build_detail(build_item_with_path(
            outside_path.to_string_lossy().as_ref(),
            Some("{}"),
            Some(serde_json::json!({
                "artifactVersion": {
                    "snapshotPath": outside_path.to_string_lossy()
                }
            })),
        ));

        let error = restore_file_checkpoint(
            &detail,
            workspace_dir.path(),
            "artifact-document:req-1",
            true,
            true,
        )
        .expect_err("outside absolute path should fail");

        assert!(error.contains("当前工作区"));
    }
}
