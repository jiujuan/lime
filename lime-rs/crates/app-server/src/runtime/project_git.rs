use super::service_projection::{
    project_git_diff_from_service, project_git_status_from_service,
    project_git_worktree_from_service,
};
use super::{RuntimeCore, RuntimeCoreError};
use app_server_protocol::*;

impl RuntimeCore {
    pub async fn read_project_git_status(
        &self,
        params: ProjectGitStatusParams,
    ) -> Result<ProjectGitStatusResponse, RuntimeCoreError> {
        let root_path = params.root_path;
        let status = tokio::task::spawn_blocking(move || {
            lime_services::project_git_service::read_status(&root_path)
        })
        .await
        .map_err(|error| RuntimeCoreError::Backend(format!("Git 状态读取任务失败: {error}")))?
        .map_err(RuntimeCoreError::Backend)?;
        Ok(project_git_status_from_service(status))
    }

    pub async fn read_project_git_diff(
        &self,
        params: ProjectGitDiffParams,
    ) -> Result<ProjectGitDiffResponse, RuntimeCoreError> {
        let root_path = params.root_path;
        let context_lines = params.context_lines;
        let base = params.base.map(project_git_diff_base_to_service);
        let diff = tokio::task::spawn_blocking(move || {
            lime_services::project_git_service::read_diff(&root_path, context_lines, base)
        })
        .await
        .map_err(|error| RuntimeCoreError::Backend(format!("Git 差异读取任务失败: {error}")))?
        .map_err(RuntimeCoreError::Backend)?;
        Ok(project_git_diff_from_service(diff))
    }

    pub async fn checkout_project_git_branch(
        &self,
        params: ProjectGitBranchCheckoutParams,
    ) -> Result<ProjectGitBranchCheckoutResponse, RuntimeCoreError> {
        let root_path = params.root_path;
        let branch = params.branch;
        let status = tokio::task::spawn_blocking(move || {
            lime_services::project_git_service::checkout_branch(&root_path, &branch)
        })
        .await
        .map_err(|error| RuntimeCoreError::Backend(format!("Git 分支切换任务失败: {error}")))?
        .map_err(RuntimeCoreError::Backend)?;
        Ok(project_git_status_from_service(status))
    }

    pub async fn create_project_git_branch(
        &self,
        params: ProjectGitBranchCreateParams,
    ) -> Result<ProjectGitBranchCreateResponse, RuntimeCoreError> {
        let root_path = params.root_path;
        let branch = params.branch;
        let status = tokio::task::spawn_blocking(move || {
            lime_services::project_git_service::create_branch(&root_path, &branch)
        })
        .await
        .map_err(|error| RuntimeCoreError::Backend(format!("Git 分支创建任务失败: {error}")))?
        .map_err(RuntimeCoreError::Backend)?;
        Ok(project_git_status_from_service(status))
    }

    pub async fn create_project_git_worktree(
        &self,
        params: ProjectGitWorktreeCreateParams,
    ) -> Result<ProjectGitWorktreeCreateResponse, RuntimeCoreError> {
        let root_path = params.root_path;
        let name = params.name;
        let base_branch = params.base_branch;
        let worktree = tokio::task::spawn_blocking(move || {
            lime_services::project_git_service::create_worktree(
                &root_path,
                name.as_deref(),
                base_branch.as_deref(),
            )
        })
        .await
        .map_err(|error| RuntimeCoreError::Backend(format!("Git 工作树创建任务失败: {error}")))?
        .map_err(RuntimeCoreError::Backend)?;
        Ok(project_git_worktree_from_service(worktree))
    }
}

fn project_git_diff_base_to_service(
    base: ProjectGitDiffBase,
) -> lime_services::project_git_service::ProjectGitDiffBase {
    match base {
        ProjectGitDiffBase::Unstaged => {
            lime_services::project_git_service::ProjectGitDiffBase::Unstaged
        }
        ProjectGitDiffBase::Staged => {
            lime_services::project_git_service::ProjectGitDiffBase::Staged
        }
        ProjectGitDiffBase::Branch => {
            lime_services::project_git_service::ProjectGitDiffBase::Branch
        }
        ProjectGitDiffBase::PreviousConversation => {
            lime_services::project_git_service::ProjectGitDiffBase::PreviousConversation
        }
    }
}
