use super::RuntimeCoreError;
use app_server_protocol::FileSystemDirectoryListing;
use app_server_protocol::FileSystemFileEntry;
use app_server_protocol::FileSystemFilePreview;
use app_server_protocol::ProjectGitDiffResponse;
use app_server_protocol::ProjectGitStatusResponse;
use app_server_protocol::ProjectGitWorktreeCreateResponse;

pub(super) fn file_system_directory_listing_from_service(
    listing: lime_services::file_browser_service::DirectoryListing,
) -> FileSystemDirectoryListing {
    FileSystemDirectoryListing {
        path: listing.path,
        parent_path: listing.parent_path,
        entries: listing
            .entries
            .into_iter()
            .map(file_system_file_entry_from_service)
            .collect(),
        error: listing.error,
    }
}

fn file_system_file_entry_from_service(
    entry: lime_services::file_browser_service::FileEntry,
) -> FileSystemFileEntry {
    FileSystemFileEntry {
        name: entry.name,
        path: entry.path,
        is_dir: entry.is_dir,
        size: entry.size,
        modified_at: entry.modified_at,
        file_type: entry.file_type,
        is_hidden: entry.is_hidden,
        mode_str: entry.mode_str,
        mode: entry.mode,
        mime_type: entry.mime_type,
        is_symlink: entry.is_symlink,
        icon_data_url: entry.icon_data_url,
    }
}

pub(super) fn file_system_file_preview_from_service(
    preview: lime_services::file_browser_service::FilePreview,
) -> FileSystemFilePreview {
    FileSystemFilePreview {
        path: preview.path,
        content: preview.content,
        is_binary: preview.is_binary,
        size: preview.size,
        error: preview.error,
    }
}

pub(super) fn project_git_status_from_service(
    status: lime_services::project_git_service::ProjectGitStatus,
) -> ProjectGitStatusResponse {
    ProjectGitStatusResponse {
        root_path: status.root_path,
        repository_root: status.repository_root,
        has_git_repository: status.has_git_repository,
        current_branch: status.current_branch,
        branches: status.branches,
        uncommitted_file_count: status.uncommitted_file_count,
    }
}

pub(super) fn project_git_diff_from_service(
    diff: lime_services::project_git_service::ProjectGitDiff,
) -> ProjectGitDiffResponse {
    ProjectGitDiffResponse {
        root_path: diff.root_path,
        repository_root: diff.repository_root,
        has_git_repository: diff.has_git_repository,
        patch: diff.patch,
        uncommitted_file_count: diff.uncommitted_file_count,
    }
}

pub(super) fn project_git_worktree_from_service(
    worktree: lime_services::project_git_service::ProjectGitWorktree,
) -> ProjectGitWorktreeCreateResponse {
    ProjectGitWorktreeCreateResponse {
        worktree_path: worktree.worktree_path,
        branch: worktree.branch,
        status: project_git_status_from_service(worktree.status),
    }
}

pub(super) fn file_system_required_path(
    path: String,
    method: &'static str,
) -> Result<String, RuntimeCoreError> {
    let path = path.trim();
    if path.is_empty() {
        return Err(RuntimeCoreError::Backend(format!(
            "path is required for {method}"
        )));
    }
    Ok(path.to_string())
}
