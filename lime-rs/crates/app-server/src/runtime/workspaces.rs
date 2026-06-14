use super::{RuntimeCore, RuntimeCoreError};
use app_server_protocol::*;

impl RuntimeCore {
    pub async fn list_workspaces(&self) -> Result<WorkspaceListResponse, RuntimeCoreError> {
        self.app_data_source.list_workspaces().await
    }

    pub async fn read_workspace(
        &self,
        params: WorkspaceReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        self.app_data_source.read_workspace(params).await
    }

    pub async fn update_workspace(
        &self,
        params: WorkspaceUpdateParams,
    ) -> Result<WorkspaceUpdateResponse, RuntimeCoreError> {
        self.app_data_source.update_workspace(params).await
    }

    pub async fn delete_workspace(
        &self,
        params: WorkspaceDeleteParams,
    ) -> Result<WorkspaceDeleteResponse, RuntimeCoreError> {
        self.app_data_source.delete_workspace(params).await
    }

    pub async fn read_workspace_by_path(
        &self,
        params: WorkspacePathReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        self.app_data_source.read_workspace_by_path(params).await
    }

    pub async fn ensure_project_workspace(
        &self,
        params: WorkspaceEnsureProjectParams,
    ) -> Result<WorkspaceEnsureProjectResponse, RuntimeCoreError> {
        self.app_data_source.ensure_project_workspace(params).await
    }

    pub async fn read_default_workspace(&self) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        self.app_data_source.read_default_workspace().await
    }

    pub async fn ensure_default_workspace(
        &self,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        self.app_data_source.ensure_default_workspace().await
    }

    pub async fn ensure_workspace_ready(
        &self,
        params: WorkspaceEnsureParams,
    ) -> Result<WorkspaceEnsureReadyResponse, RuntimeCoreError> {
        self.app_data_source.ensure_workspace_ready(params).await
    }

    pub async fn read_workspace_projects_root(
        &self,
    ) -> Result<WorkspaceProjectsRootReadResponse, RuntimeCoreError> {
        self.app_data_source.read_workspace_projects_root().await
    }

    pub async fn resolve_workspace_project_path(
        &self,
        params: WorkspaceProjectPathResolveParams,
    ) -> Result<WorkspaceProjectPathResolveResponse, RuntimeCoreError> {
        self.app_data_source
            .resolve_workspace_project_path(params)
            .await
    }
}
