use crate::ExecutionRequest;
use serde_json::Value;
use std::path::PathBuf;

use super::{json_pointer_string, non_empty, RuntimeRequest, RuntimeWorkspaceScope};

pub(in crate::runtime_backend) fn request_workspace_scope(
    request: &ExecutionRequest,
    host_request: Option<&RuntimeRequest>,
) -> RuntimeWorkspaceScope {
    let working_dir = host_request
        .and_then(host_working_dir)
        .or_else(|| metadata_working_dir(request.runtime_metadata()))
        .filter(|path| path.is_absolute());
    let project_root = host_request
        .and_then(host_project_root)
        .or_else(|| metadata_project_root(request.runtime_metadata()))
        .filter(|path| path.is_absolute());

    RuntimeWorkspaceScope {
        working_dir: working_dir.or_else(|| project_root.clone()),
        project_root,
    }
}

fn host_working_dir(host: &RuntimeRequest) -> Option<PathBuf> {
    non_empty(host.working_dir.as_deref()).map(PathBuf::from)
}

fn host_project_root(host: &RuntimeRequest) -> Option<PathBuf> {
    non_empty(host.project_root.as_deref())
        .or_else(|| non_empty(host.workspace_root.as_deref()))
        .map(PathBuf::from)
}

fn metadata_working_dir(metadata: Option<&Value>) -> Option<PathBuf> {
    let metadata = metadata?;
    json_pointer_string(
        metadata,
        &[
            "/workingDir",
            "/working_dir",
            "/workingDirectory",
            "/working_directory",
            "/cwd",
            "/harness/workingDir",
            "/harness/working_dir",
            "/harness/workingDirectory",
            "/harness/working_directory",
            "/harness/cwd",
        ],
    )
    .map(PathBuf::from)
}

fn metadata_project_root(metadata: Option<&Value>) -> Option<PathBuf> {
    let metadata = metadata?;
    json_pointer_string(
        metadata,
        &[
            "/workspaceRoot",
            "/workspace_root",
            "/projectRoot",
            "/project_root",
            "/harness/workspaceRoot",
            "/harness/workspace_root",
            "/harness/projectRoot",
            "/harness/project_root",
            "/harness/workspace_skill_runtime_enable/workspace_root",
            "/harness/workspaceSkillRuntimeEnable/workspaceRoot",
            "/harness/workspace_skill_bindings/workspace_root",
            "/harness/workspaceSkillBindings/workspaceRoot",
        ],
    )
    .map(PathBuf::from)
}
