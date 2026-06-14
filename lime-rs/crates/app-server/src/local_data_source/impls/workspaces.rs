use super::super::*;
use async_trait::async_trait;

#[async_trait]
impl WorkspaceAppDataSource for LocalAppDataSource {
    async fn list_workspaces(&self) -> Result<WorkspaceListResponse, RuntimeCoreError> {
        workspaces::list_workspaces(&self.db)
    }

    async fn read_workspace(
        &self,
        params: WorkspaceReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        workspaces::read_workspace(&self.db, params)
    }

    async fn update_workspace(
        &self,
        params: WorkspaceUpdateParams,
    ) -> Result<WorkspaceUpdateResponse, RuntimeCoreError> {
        workspaces::update_workspace(&self.db, params)
    }

    async fn delete_workspace(
        &self,
        params: WorkspaceDeleteParams,
    ) -> Result<WorkspaceDeleteResponse, RuntimeCoreError> {
        workspaces::delete_workspace(&self.db, params)
    }

    async fn read_workspace_by_path(
        &self,
        params: WorkspacePathReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        workspaces::read_workspace_by_path(&self.db, params)
    }

    async fn ensure_project_workspace(
        &self,
        params: WorkspaceEnsureProjectParams,
    ) -> Result<WorkspaceEnsureProjectResponse, RuntimeCoreError> {
        workspaces::ensure_project_workspace(&self.db, params)
    }

    async fn read_default_workspace(&self) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        workspaces::read_default_workspace(&self.db)
    }

    async fn ensure_default_workspace(&self) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        workspaces::ensure_default_workspace(&self.db)
    }

    async fn ensure_workspace_ready(
        &self,
        params: WorkspaceEnsureParams,
    ) -> Result<WorkspaceEnsureReadyResponse, RuntimeCoreError> {
        workspaces::ensure_workspace_ready(&self.db, params)
    }

    async fn read_workspace_projects_root(
        &self,
    ) -> Result<WorkspaceProjectsRootReadResponse, RuntimeCoreError> {
        workspaces::read_workspace_projects_root()
    }

    async fn resolve_workspace_project_path(
        &self,
        params: WorkspaceProjectPathResolveParams,
    ) -> Result<WorkspaceProjectPathResolveResponse, RuntimeCoreError> {
        workspaces::resolve_workspace_project_path(params)
    }
}
