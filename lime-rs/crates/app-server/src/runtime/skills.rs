use super::{RuntimeCore, RuntimeCoreError};
use app_server_protocol::*;

impl RuntimeCore {
    pub async fn list_skills(&self) -> Result<SkillListResponse, RuntimeCoreError> {
        self.app_data_source.list_skills().await
    }

    pub async fn read_skill(
        &self,
        params: SkillReadParams,
    ) -> Result<SkillReadResponse, RuntimeCoreError> {
        self.app_data_source.read_skill(params).await
    }

    pub async fn list_management_skills(
        &self,
        params: SkillManagementListParams,
    ) -> Result<SkillListResponse, RuntimeCoreError> {
        self.app_data_source.list_management_skills(params).await
    }

    pub async fn install_management_skill(
        &self,
        params: SkillManagementInstallParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        self.app_data_source.install_management_skill(params).await
    }

    pub async fn uninstall_management_skill(
        &self,
        params: SkillManagementUninstallParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        self.app_data_source
            .uninstall_management_skill(params)
            .await
    }

    pub async fn list_skill_repositories(
        &self,
    ) -> Result<SkillRepositoryListResponse, RuntimeCoreError> {
        self.app_data_source.list_skill_repositories().await
    }

    pub async fn save_skill_repository(
        &self,
        params: SkillRepositorySaveParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        self.app_data_source.save_skill_repository(params).await
    }

    pub async fn delete_skill_repository(
        &self,
        params: SkillRepositoryDeleteParams,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        self.app_data_source.delete_skill_repository(params).await
    }

    pub async fn refresh_skill_cache(
        &self,
    ) -> Result<SkillManagementWriteResponse, RuntimeCoreError> {
        self.app_data_source.refresh_skill_cache().await
    }

    pub async fn list_installed_skill_directories(
        &self,
    ) -> Result<SkillInstalledDirectoriesListResponse, RuntimeCoreError> {
        self.app_data_source
            .list_installed_skill_directories()
            .await
    }

    pub async fn inspect_local_skill(
        &self,
        params: SkillLocalInspectParams,
    ) -> Result<SkillLocalInspectResponse, RuntimeCoreError> {
        self.app_data_source.inspect_local_skill(params).await
    }

    pub async fn inspect_local_skill_detail(
        &self,
        params: SkillLocalDetailInspectParams,
    ) -> Result<SkillLocalDetailInspectResponse, RuntimeCoreError> {
        self.app_data_source
            .inspect_local_skill_detail(params)
            .await
    }

    pub async fn create_skill_scaffold(
        &self,
        params: SkillScaffoldCreateParams,
    ) -> Result<SkillScaffoldCreateResponse, RuntimeCoreError> {
        self.app_data_source.create_skill_scaffold(params).await
    }

    pub async fn import_local_skill(
        &self,
        params: SkillLocalImportParams,
    ) -> Result<SkillLocalImportResponse, RuntimeCoreError> {
        self.app_data_source.import_local_skill(params).await
    }

    pub async fn rename_local_skill(
        &self,
        params: SkillLocalRenameParams,
    ) -> Result<SkillLocalRenameResponse, RuntimeCoreError> {
        self.app_data_source.rename_local_skill(params).await
    }

    pub async fn inspect_remote_skill(
        &self,
        params: SkillRemoteInspectParams,
    ) -> Result<SkillRemoteInspectResponse, RuntimeCoreError> {
        self.app_data_source.inspect_remote_skill(params).await
    }

    pub async fn inspect_local_skill_package(
        &self,
        params: SkillPackageLocalInspectParams,
    ) -> Result<SkillPackageLocalInspectResponse, RuntimeCoreError> {
        self.app_data_source
            .inspect_local_skill_package(params)
            .await
    }

    pub async fn install_local_skill_package(
        &self,
        params: SkillPackageLocalInstallParams,
    ) -> Result<SkillPackageLocalInstallResponse, RuntimeCoreError> {
        self.app_data_source
            .install_local_skill_package(params)
            .await
    }

    pub async fn replace_local_skill_package(
        &self,
        params: SkillPackageLocalReplaceParams,
    ) -> Result<SkillPackageLocalReplaceResponse, RuntimeCoreError> {
        self.app_data_source
            .replace_local_skill_package(params)
            .await
    }

    pub async fn export_local_skill_package(
        &self,
        params: SkillPackageExportParams,
    ) -> Result<SkillPackageExportResponse, RuntimeCoreError> {
        self.app_data_source
            .export_local_skill_package(params)
            .await
    }

    pub async fn install_marketplace_skill(
        &self,
        params: SkillMarketplaceInstallParams,
    ) -> Result<SkillMarketplaceInstallResponse, RuntimeCoreError> {
        self.app_data_source.install_marketplace_skill(params).await
    }

    pub async fn install_skill_from_download_url(
        &self,
        params: SkillDownloadInstallParams,
    ) -> Result<SkillDownloadInstallResponse, RuntimeCoreError> {
        self.app_data_source
            .install_skill_from_download_url(params)
            .await
    }

    pub async fn list_workspace_skill_bindings(
        &self,
        params: WorkspaceSkillBindingsListParams,
    ) -> Result<WorkspaceSkillBindingsListResponse, RuntimeCoreError> {
        self.app_data_source
            .list_workspace_skill_bindings(params)
            .await
    }

    pub async fn list_workspace_registered_skills(
        &self,
        params: WorkspaceRegisteredSkillsListParams,
    ) -> Result<WorkspaceRegisteredSkillsListResponse, RuntimeCoreError> {
        self.app_data_source
            .list_workspace_registered_skills(params)
            .await
    }
}
