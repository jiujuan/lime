use super::super::*;
use async_trait::async_trait;

#[async_trait]
impl AgentAppDataSource for LocalAppDataSource {
    async fn list_agent_app_installed(
        &self,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        agent_apps::list_agent_app_installed_state().map_err(data_error)
    }

    async fn inspect_agent_app_local_package(
        &self,
        params: AgentAppLocalPackageInspectParams,
    ) -> Result<AgentAppLocalPackageInspectResponse, RuntimeCoreError> {
        agent_apps::inspect_agent_app_local_package(params).map_err(data_error)
    }

    async fn fetch_agent_app_cloud_package(
        &self,
        params: AgentAppFetchCloudPackageParams,
    ) -> Result<AgentAppPackageCacheEntry, RuntimeCoreError> {
        agent_apps::fetch_agent_app_cloud_package(params)
            .await
            .map_err(data_error)
    }

    async fn save_agent_app_installed(
        &self,
        params: AgentAppInstalledSaveParams,
    ) -> Result<Value, RuntimeCoreError> {
        agent_apps::save_agent_app_installed_state(params).map_err(data_error)
    }

    async fn set_agent_app_installed_disabled(
        &self,
        params: AgentAppInstalledDisabledSetParams,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        agent_apps::set_agent_app_installed_disabled(params).map_err(data_error)
    }

    async fn preview_agent_app_uninstall(
        &self,
        params: AgentAppUninstallRehearsalParams,
    ) -> Result<AgentAppUninstallRehearsalResponse, RuntimeCoreError> {
        agent_apps::build_agent_app_uninstall_rehearsal(params.app_id, params.mode)
            .map_err(data_error)
    }

    async fn uninstall_agent_app(
        &self,
        params: AgentAppUninstallParams,
    ) -> Result<AgentAppUninstallResponse, RuntimeCoreError> {
        agent_apps::uninstall_agent_app(params).map_err(data_error)
    }
}
