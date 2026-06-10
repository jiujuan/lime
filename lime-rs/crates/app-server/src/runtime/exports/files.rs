use super::super::metadata_string;
use super::super::string_field;
use super::super::RuntimeCoreError;
use super::HANDOFF_BUNDLE_RELATIVE_ROOT;
use app_server_protocol::AgentSessionHandoffArtifact;
use app_server_protocol::AgentSessionReadResponse;
use std::fs;
use std::path::Component;
use std::path::Path;
use std::path::PathBuf;

pub(super) fn validate_handoff_session_id(session_id: &str) -> Result<(), RuntimeCoreError> {
    let mut components = Path::new(session_id).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(_)), None) => Ok(()),
        _ => Err(RuntimeCoreError::Backend(format!(
            "sessionId must be a single path segment for agentSession/handoffBundle/export: {session_id}"
        ))),
    }
}

fn validate_runtime_export_session_id(
    session_id: &str,
    method: &str,
) -> Result<(), RuntimeCoreError> {
    let mut components = Path::new(session_id).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(_)), None) => Ok(()),
        _ => Err(RuntimeCoreError::Backend(format!(
            "sessionId must be a single path segment for {method}: {session_id}"
        ))),
    }
}

pub(super) fn required_runtime_export_session_id(
    session_id: &str,
    method: &str,
) -> Result<String, RuntimeCoreError> {
    let session_id = session_id.trim().to_string();
    if session_id.is_empty() {
        return Err(RuntimeCoreError::Backend(format!(
            "sessionId is required for {method}"
        )));
    }
    validate_runtime_export_session_id(&session_id, method)?;
    Ok(session_id)
}

pub(super) fn resolve_handoff_workspace_root(
    read: &AgentSessionReadResponse,
) -> Result<PathBuf, RuntimeCoreError> {
    let mut candidates = Vec::new();
    if let Some(metadata) = read
        .session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref())
    {
        for key in [
            "workspaceRoot",
            "workspace_root",
            "workingDir",
            "working_dir",
        ] {
            if let Some(value) = metadata_string(Some(metadata), key) {
                candidates.push(value);
            }
        }
    }
    if let Some(detail) = read.detail.as_ref() {
        for key in [
            "workspaceRoot",
            "workspace_root",
            "workingDir",
            "working_dir",
            "workspace_root_path",
        ] {
            if let Some(value) = string_field(detail, &[key]) {
                candidates.push(value);
            }
        }
    }

    let first_candidate = candidates.first().cloned();
    for candidate in candidates {
        let path = PathBuf::from(candidate.trim());
        if path.is_absolute() {
            return Ok(path);
        }
    }

    Err(RuntimeCoreError::Backend(match first_candidate {
        Some(candidate) => format!(
            "workspaceRoot must be absolute for agentSession/handoffBundle/export: {candidate}"
        ),
        None => "workspaceRoot is required for agentSession/handoffBundle/export".to_string(),
    }))
}

fn resolve_runtime_export_workspace_root(
    read: &AgentSessionReadResponse,
    method: &str,
) -> Result<PathBuf, RuntimeCoreError> {
    resolve_handoff_workspace_root(read).map_err(|error| {
        RuntimeCoreError::Backend(
            error
                .to_string()
                .replace("agentSession/handoffBundle/export", method),
        )
    })
}

pub(super) fn canonical_runtime_export_workspace_root(
    read: &AgentSessionReadResponse,
    method: &str,
) -> Result<PathBuf, RuntimeCoreError> {
    let workspace_root = resolve_runtime_export_workspace_root(read, method)?;
    let workspace_root = workspace_root.canonicalize().map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "workspaceRoot must be an existing directory for {method}: {} ({error})",
            workspace_root.display()
        ))
    })?;
    if !workspace_root.is_dir() {
        return Err(RuntimeCoreError::Backend(format!(
            "workspaceRoot must be a directory for {method}: {}",
            workspace_root.display()
        )));
    }
    Ok(workspace_root)
}

pub(super) fn write_handoff_bundle_file(
    bundle_root: &Path,
    bundle_relative_root: &str,
    file_name: &str,
    kind: &str,
    title: &str,
    content: String,
) -> Result<AgentSessionHandoffArtifact, RuntimeCoreError> {
    let absolute_path = bundle_root.join(file_name);
    fs::write(&absolute_path, content.as_bytes()).map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "failed to write handoff bundle file {}: {error}",
            absolute_path.display()
        ))
    })?;
    Ok(AgentSessionHandoffArtifact {
        kind: kind.to_string(),
        title: title.to_string(),
        relative_path: format!("{bundle_relative_root}/{file_name}"),
        absolute_path: absolute_path.to_string_lossy().to_string(),
        bytes: content.len(),
    })
}

pub(super) fn write_runtime_export_file(
    root: &Path,
    relative_root: &str,
    file_name: &str,
    kind: &str,
    title: &str,
    content: String,
) -> Result<AgentSessionHandoffArtifact, RuntimeCoreError> {
    let absolute_path = root.join(file_name);
    fs::write(&absolute_path, content.as_bytes()).map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "failed to write runtime export file {}: {error}",
            absolute_path.display()
        ))
    })?;
    Ok(AgentSessionHandoffArtifact {
        kind: kind.to_string(),
        title: title.to_string(),
        relative_path: format!("{relative_root}/{file_name}"),
        absolute_path: absolute_path.to_string_lossy().to_string(),
        bytes: content.len(),
    })
}

pub(super) fn runtime_export_root(
    workspace_root: &Path,
    session_id: &str,
    child: &str,
) -> (String, PathBuf) {
    let relative_root = format!("{HANDOFF_BUNDLE_RELATIVE_ROOT}/{session_id}/{child}");
    let absolute_root = workspace_root
        .join(".lime")
        .join("harness")
        .join("sessions")
        .join(session_id)
        .join(child);
    (relative_root, absolute_root)
}

pub(super) fn ensure_runtime_export_root(root: &Path) -> Result<(), RuntimeCoreError> {
    fs::create_dir_all(root).map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "failed to create runtime export directory {}: {error}",
            root.display()
        ))
    })
}

pub(super) fn runtime_export_base_roots(session_id: &str) -> (String, String, String) {
    (
        format!("{HANDOFF_BUNDLE_RELATIVE_ROOT}/{session_id}"),
        format!("{HANDOFF_BUNDLE_RELATIVE_ROOT}/{session_id}/evidence"),
        format!("{HANDOFF_BUNDLE_RELATIVE_ROOT}/{session_id}/replay"),
    )
}
