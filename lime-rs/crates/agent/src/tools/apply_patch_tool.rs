use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};

use aster::tools::{PermissionCheckResult, Tool, ToolContext, ToolOptions, ToolResult};
use async_trait::async_trait;
use patch_apply::{
    apply_patch_to_workdir, parse_patch, AppliedPatchFileChange, ApplyPatchReport, Hunk,
};
use serde_json::{json, Value};

pub const APPLY_PATCH_TOOL_NAME: &str = "apply_patch";

#[derive(Debug, Default)]
pub struct ApplyPatchTool;

#[async_trait]
impl Tool for ApplyPatchTool {
    fn name(&self) -> &str {
        APPLY_PATCH_TOOL_NAME
    }

    fn description(&self) -> &str {
        "Apply a structured patch to files inside the current workspace. Use this for multi-file add, update, delete, or move edits."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "patch": {
                    "type": "string",
                    "description": "Patch text with *** Begin Patch and *** End Patch markers"
                }
            },
            "required": ["patch"]
        })
    }

    fn aliases(&self) -> &'static [&'static str] {
        &["ApplyPatchTool"]
    }

    async fn execute(
        &self,
        params: Value,
        context: &ToolContext,
    ) -> Result<ToolResult, aster::tools::ToolError> {
        if context.is_cancelled() {
            return Err(aster::tools::ToolError::Cancelled);
        }

        let patch = patch_text_from_params(&params)?;
        let workdir = context.working_directory.clone();
        let canonical_workdir = workdir.canonicalize().unwrap_or_else(|_| workdir.clone());
        let patch_for_apply = patch.clone();
        let report =
            tokio::task::spawn_blocking(move || apply_patch_to_workdir(&patch_for_apply, workdir))
                .await
                .map_err(|error| {
                    aster::tools::ToolError::execution_failed(format!(
                        "apply_patch task failed: {error}"
                    ))
                })?
                .map_err(|error| aster::tools::ToolError::execution_failed(error.to_string()))?;

        let metadata = build_metadata(&patch, &canonical_workdir, &report);
        Ok(ToolResult::success(summary_text(&report)).with_metadata_map(metadata))
    }

    async fn check_permissions(
        &self,
        params: &Value,
        context: &ToolContext,
    ) -> PermissionCheckResult {
        let patch = match patch_text_from_params(params) {
            Ok(patch) => patch,
            Err(error) => return PermissionCheckResult::deny(error.to_string()),
        };
        let parsed = match parse_patch(&patch) {
            Ok(parsed) => parsed,
            Err(error) => return PermissionCheckResult::deny(error.to_string()),
        };

        let workdir = context
            .working_directory
            .canonicalize()
            .unwrap_or_else(|_| context.working_directory.clone());
        for path in parsed.hunks.iter().flat_map(hunk_write_paths) {
            let candidate = match resolve_patch_path_for_permission(&workdir, &path) {
                Ok(candidate) => candidate,
                Err(error) => return PermissionCheckResult::deny(error),
            };
            if !candidate.starts_with(&workdir) {
                return PermissionCheckResult::deny(format!(
                    "Patch path '{}' must stay inside workspace '{}'",
                    candidate.display(),
                    workdir.display()
                ));
            }
        }

        PermissionCheckResult::allow()
    }

    fn options(&self) -> ToolOptions {
        ToolOptions::new().with_max_retries(0)
    }
}

fn patch_text_from_params(params: &Value) -> Result<String, aster::tools::ToolError> {
    params
        .get("patch")
        .or_else(|| params.get("input"))
        .or_else(|| params.get("stdin"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| aster::tools::ToolError::invalid_params("Missing required parameter: patch"))
}

fn hunk_write_paths(hunk: &Hunk) -> Vec<PathBuf> {
    match hunk {
        Hunk::AddFile { path, .. } | Hunk::DeleteFile { path } => vec![path.clone()],
        Hunk::UpdateFile {
            path, move_path, ..
        } => {
            let mut paths = vec![path.clone()];
            if let Some(move_path) = move_path {
                paths.push(move_path.clone());
            }
            paths
        }
    }
}

fn resolve_patch_path_for_permission(workdir: &Path, path: &Path) -> Result<PathBuf, String> {
    let lexical_path = if path.is_absolute() {
        normalize_path_lexically(path)?
    } else {
        normalize_path_lexically(&workdir.join(path))?
    };
    canonicalize_existing_prefix(&lexical_path)
}

fn canonicalize_existing_prefix(path: &Path) -> Result<PathBuf, String> {
    let mut existing = path;
    let mut missing_parts: Vec<PathBuf> = Vec::new();

    while !existing.exists() {
        let Some(parent) = existing.parent() else {
            return Ok(path.to_path_buf());
        };
        let Some(file_name) = existing.file_name() else {
            return Ok(path.to_path_buf());
        };
        missing_parts.push(PathBuf::from(file_name));
        existing = parent;
    }

    let mut canonical = existing.canonicalize().map_err(|error| {
        format!(
            "Failed to resolve patch path '{}': {error}",
            existing.display()
        )
    })?;
    for part in missing_parts.iter().rev() {
        canonical.push(part);
    }
    Ok(canonical)
}

fn normalize_path_lexically(path: &Path) -> Result<PathBuf, String> {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
            Component::RootDir => normalized.push(component.as_os_str()),
            Component::CurDir => {}
            Component::Normal(part) => normalized.push(part),
            Component::ParentDir => {
                if !normalized.pop() {
                    return Err(format!(
                        "Patch path '{}' traverses above filesystem root",
                        path.display()
                    ));
                }
            }
        }
    }
    Ok(normalized)
}

fn build_metadata(
    patch: &str,
    workdir: &Path,
    report: &ApplyPatchReport,
) -> HashMap<String, Value> {
    let mut metadata = HashMap::new();
    let paths = report
        .changes
        .iter()
        .map(|change| display_path(workdir, &change.path))
        .collect::<Vec<_>>();
    metadata.insert("patch".to_string(), json!(patch));
    metadata.insert("paths".to_string(), json!(paths));
    metadata.insert("artifact_paths".to_string(), json!(paths));
    if let Some(first_path) = paths.first() {
        metadata.insert("path".to_string(), json!(first_path));
    }
    metadata.insert("file_changes".to_string(), report_to_value(workdir, report));
    if let Some(first_change) = report.changes.first() {
        metadata.insert(
            "file_change".to_string(),
            change_to_value(workdir, first_change),
        );
    }
    metadata
}

fn report_to_value(workdir: &Path, report: &ApplyPatchReport) -> Value {
    json!({
        "added": report.added.iter().map(|path| path.to_string_lossy().to_string()).collect::<Vec<_>>(),
        "modified": report.modified.iter().map(|path| path.to_string_lossy().to_string()).collect::<Vec<_>>(),
        "deleted": report.deleted.iter().map(|path| path.to_string_lossy().to_string()).collect::<Vec<_>>(),
        "changes": report.changes.iter().map(|change| change_to_value(workdir, change)).collect::<Vec<_>>(),
    })
}

fn change_to_value(workdir: &Path, change: &patch_apply::AppliedPatchChange) -> Value {
    let path = display_path(workdir, &change.path);
    match &change.change {
        AppliedPatchFileChange::Add {
            content,
            overwritten_content,
        } => {
            let refs = file_refs(
                &path,
                overwritten_content.as_deref().unwrap_or_default(),
                content,
            );
            compact_object(json!({
            "kind": if overwritten_content.is_some() { "update" } else { "add" },
            "path": path,
            "content_size": content.len(),
            "overwrote_existing": overwritten_content.is_some(),
            "previousContent": overwritten_content,
            "contentPreview": preview_text(content),
            "diff": line_diff(overwritten_content.as_deref().unwrap_or_default(), content),
            "checkpointRef": refs.checkpoint_ref,
            "contentRef": refs.content_ref,
            "diffRef": refs.diff_ref,
            }))
        }
        AppliedPatchFileChange::Delete { content } => {
            let refs = file_refs(&path, content, "");
            json!({
            "kind": "delete",
            "path": path,
            "previous_content_size": content.len(),
            "previousContent": content,
            "diff": line_diff(content, ""),
            "checkpointRef": refs.checkpoint_ref,
            "contentRef": refs.content_ref,
            "diffRef": refs.diff_ref,
            })
        }
        AppliedPatchFileChange::Update {
            move_path,
            old_content,
            overwritten_move_content,
            new_content,
        } => {
            let destination_path = move_path
                .as_ref()
                .map(|path| display_path(workdir, path))
                .unwrap_or_else(|| path.clone());
            let destination_refs = file_refs(&destination_path, old_content, new_content);
            compact_object(json!({
            "kind": if move_path.is_some() { "move_update" } else { "update" },
            "path": destination_path,
            "sourcePath": if move_path.is_some() { Some(path) } else { None },
            "move_path": move_path.as_ref().map(|path| display_path(workdir, path)),
            "previous_content_size": old_content.len(),
            "content_size": new_content.len(),
            "previousContent": old_content,
            "contentPreview": preview_text(new_content),
            "diff": line_diff(old_content, new_content),
            "overwrote_move_destination": overwritten_move_content.is_some(),
            "overwrittenMovePreviousContent": overwritten_move_content,
            "checkpointRef": destination_refs.checkpoint_ref,
            "contentRef": destination_refs.content_ref,
            "diffRef": destination_refs.diff_ref,
            }))
        }
    }
}

struct FileRefs {
    checkpoint_ref: String,
    content_ref: String,
    diff_ref: String,
}

fn file_refs(path: &str, previous_content: &str, content: &str) -> FileRefs {
    let checkpoint_hash = stable_hash(format!("{path}\n{content}").as_str());
    let content_hash = stable_hash(content);
    let diff_hash = stable_hash(format!("{path}\n{previous_content}\n{content}").as_str());
    FileRefs {
        checkpoint_ref: format!("checkpoint:file:{checkpoint_hash:016x}"),
        content_ref: format!("content:file:{content_hash:016x}"),
        diff_ref: format!("diff:file:{diff_hash:016x}"),
    }
}

fn display_path(workdir: &Path, path: &Path) -> String {
    path.strip_prefix(workdir)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn preview_text(value: &str) -> String {
    value.chars().take(240).collect()
}

fn line_diff(previous: &str, content: &str) -> Value {
    const MAX_DIFF_ITEMS: usize = 240;
    let previous_lines = previous.lines().collect::<Vec<_>>();
    let content_lines = content.lines().collect::<Vec<_>>();
    let mut prefix_len = 0;
    while previous_lines.get(prefix_len) == content_lines.get(prefix_len)
        && prefix_len < previous_lines.len()
        && prefix_len < content_lines.len()
    {
        prefix_len += 1;
    }

    let mut suffix_len = 0;
    while suffix_len + prefix_len < previous_lines.len()
        && suffix_len + prefix_len < content_lines.len()
        && previous_lines[previous_lines.len() - 1 - suffix_len]
            == content_lines[content_lines.len() - 1 - suffix_len]
    {
        suffix_len += 1;
    }

    let mut diff = Vec::new();
    for line in previous_lines.iter().take(prefix_len) {
        push_diff_item(&mut diff, "context", line, MAX_DIFF_ITEMS);
    }
    for line in previous_lines
        .iter()
        .skip(prefix_len)
        .take(previous_lines.len().saturating_sub(prefix_len + suffix_len))
    {
        push_diff_item(&mut diff, "remove", line, MAX_DIFF_ITEMS);
    }
    for line in content_lines
        .iter()
        .skip(prefix_len)
        .take(content_lines.len().saturating_sub(prefix_len + suffix_len))
    {
        push_diff_item(&mut diff, "add", line, MAX_DIFF_ITEMS);
    }
    for line in previous_lines
        .iter()
        .skip(previous_lines.len() - suffix_len)
    {
        push_diff_item(&mut diff, "context", line, MAX_DIFF_ITEMS);
    }

    Value::Array(diff)
}

fn push_diff_item(diff: &mut Vec<Value>, kind: &str, line: &str, max_items: usize) {
    if diff.len() >= max_items {
        if diff
            .last()
            .and_then(|value| value.get("kind"))
            .and_then(Value::as_str)
            != Some("truncated")
        {
            diff.push(json!({ "kind": "truncated" }));
        }
        return;
    }
    diff.push(json!({
        "kind": kind,
        "value": line,
    }));
}

fn compact_object(value: Value) -> Value {
    match value {
        Value::Object(object) => Value::Object(
            object
                .into_iter()
                .filter_map(|(key, value)| {
                    let compacted = compact_object(value);
                    if compacted.is_null() {
                        None
                    } else {
                        Some((key, compacted))
                    }
                })
                .collect(),
        ),
        Value::Array(values) => Value::Array(values.into_iter().map(compact_object).collect()),
        other => other,
    }
}

fn stable_hash(value: &str) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn summary_text(report: &ApplyPatchReport) -> String {
    let mut lines = vec!["Success. Updated the following files:".to_string()];
    lines.extend(
        report
            .added
            .iter()
            .map(|path| format!("A {}", path.display())),
    );
    lines.extend(
        report
            .modified
            .iter()
            .map(|path| format!("M {}", path.display())),
    );
    lines.extend(
        report
            .deleted
            .iter()
            .map(|path| format!("D {}", path.display())),
    );
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn context(path: PathBuf) -> ToolContext {
        ToolContext::new(path).with_session_id("test-session")
    }

    #[tokio::test]
    async fn applies_patch_inside_workspace() {
        let dir = tempdir().unwrap();
        let tool = ApplyPatchTool;
        let result = tool
            .execute(
                json!({
                    "patch": "*** Begin Patch\n*** Add File: notes/live.md\n+hello\n*** End Patch"
                }),
                &context(dir.path().to_path_buf()),
            )
            .await
            .unwrap();

        assert!(result.success);
        assert_eq!(
            fs::read_to_string(dir.path().join("notes/live.md")).unwrap(),
            "hello\n"
        );
        assert_eq!(
            result.metadata.get("path").and_then(Value::as_str),
            Some("notes/live.md")
        );
        let file_change = result
            .metadata
            .get("file_change")
            .expect("file_change metadata");
        assert_eq!(file_change["path"].as_str(), Some("notes/live.md"));
        assert_eq!(file_change["kind"].as_str(), Some("add"));
        assert!(file_change["checkpointRef"]
            .as_str()
            .is_some_and(|value| value.starts_with("checkpoint:file:")));
        assert!(file_change["contentRef"]
            .as_str()
            .is_some_and(|value| value.starts_with("content:file:")));
        assert!(file_change["diffRef"]
            .as_str()
            .is_some_and(|value| value.starts_with("diff:file:")));
        assert_eq!(
            file_change["diff"].as_array().expect("diff preview"),
            &vec![json!({ "kind": "add", "value": "hello" })]
        );
    }

    #[tokio::test]
    async fn rejects_patch_path_outside_workspace() {
        let dir = tempdir().unwrap();
        let tool = ApplyPatchTool;
        let permission = tool
            .check_permissions(
                &json!({
                    "patch": "*** Begin Patch\n*** Add File: ../outside.md\n+blocked\n*** End Patch"
                }),
                &context(dir.path().to_path_buf()),
            )
            .await;

        assert!(permission.is_denied());
    }

    #[tokio::test]
    async fn allows_absolute_path_inside_workspace() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("absolute.md");
        let tool = ApplyPatchTool;
        let permission = tool
            .check_permissions(
                &json!({
                    "patch": format!(
                        "*** Begin Patch\n*** Add File: {}\n+absolute\n*** End Patch",
                        path.display()
                    )
                }),
                &context(dir.path().to_path_buf()),
            )
            .await;

        assert!(permission.is_allowed());
    }
}
