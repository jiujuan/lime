use super::unavailable;
use super::NoopAppDataSource;
use super::RuntimeCoreError;
use app_server_protocol::*;
use async_trait::async_trait;
use serde_json::json;

#[async_trait]
pub trait WorkspaceAppDataSource: Send + Sync {
    async fn list_workspaces(&self) -> Result<WorkspaceListResponse, RuntimeCoreError> {
        Ok(WorkspaceListResponse::default())
    }

    async fn read_workspace(
        &self,
        _params: WorkspaceReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        Ok(WorkspaceReadResponse::default())
    }

    async fn update_workspace(
        &self,
        _params: WorkspaceUpdateParams,
    ) -> Result<WorkspaceUpdateResponse, RuntimeCoreError> {
        Err(unavailable("workspace/update"))
    }

    async fn delete_workspace(
        &self,
        _params: WorkspaceDeleteParams,
    ) -> Result<WorkspaceDeleteResponse, RuntimeCoreError> {
        Err(unavailable("workspace/delete"))
    }

    async fn read_workspace_by_path(
        &self,
        _params: WorkspacePathReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        Ok(WorkspaceReadResponse::default())
    }

    async fn ensure_project_workspace(
        &self,
        _params: WorkspaceEnsureProjectParams,
    ) -> Result<WorkspaceEnsureProjectResponse, RuntimeCoreError> {
        Err(unavailable("workspace/ensure"))
    }

    async fn read_default_workspace(&self) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        Ok(WorkspaceReadResponse::default())
    }

    async fn ensure_default_workspace(&self) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        Ok(WorkspaceReadResponse::default())
    }

    async fn ensure_workspace_ready(
        &self,
        _params: WorkspaceEnsureParams,
    ) -> Result<WorkspaceEnsureReadyResponse, RuntimeCoreError> {
        Ok(WorkspaceEnsureReadyResponse {
            result: json!(null),
        })
    }

    async fn read_workspace_projects_root(
        &self,
    ) -> Result<WorkspaceProjectsRootReadResponse, RuntimeCoreError> {
        Ok(WorkspaceProjectsRootReadResponse {
            root_path: String::new(),
        })
    }

    async fn resolve_workspace_project_path(
        &self,
        _params: WorkspaceProjectPathResolveParams,
    ) -> Result<WorkspaceProjectPathResolveResponse, RuntimeCoreError> {
        Ok(WorkspaceProjectPathResolveResponse {
            root_path: String::new(),
        })
    }
}

impl WorkspaceAppDataSource for NoopAppDataSource {}
