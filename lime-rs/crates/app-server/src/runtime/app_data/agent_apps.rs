use super::unavailable;
use super::NoopAppDataSource;
use super::RuntimeCoreError;
use app_server_protocol::*;
use async_trait::async_trait;

#[async_trait]
pub trait AgentAppDataSource: Send + Sync {
    async fn list_agent_app_installed(
        &self,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        Ok(AgentAppInstalledListResponse::default())
    }

    async fn inspect_agent_app_local_package(
        &self,
        _params: AgentAppLocalPackageInspectParams,
    ) -> Result<AgentAppLocalPackageInspectResponse, RuntimeCoreError> {
        Err(unavailable("agentAppLocalPackage/inspect"))
    }

    async fn fetch_agent_app_cloud_package(
        &self,
        _params: AgentAppFetchCloudPackageParams,
    ) -> Result<AgentAppPackageCacheEntry, RuntimeCoreError> {
        Err(unavailable("agentAppPackage/fetchCloud"))
    }

    async fn save_agent_app_installed(
        &self,
        _params: AgentAppInstalledSaveParams,
    ) -> Result<serde_json::Value, RuntimeCoreError> {
        Err(unavailable("agentAppInstalled/save"))
    }

    async fn set_agent_app_installed_disabled(
        &self,
        _params: AgentAppInstalledDisabledSetParams,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        Err(unavailable("agentAppInstalled/disabled/set"))
    }

    async fn preview_agent_app_uninstall(
        &self,
        _params: AgentAppUninstallRehearsalParams,
    ) -> Result<AgentAppUninstallRehearsalResponse, RuntimeCoreError> {
        Err(unavailable("agentAppInstalled/uninstall/rehearsal"))
    }

    async fn uninstall_agent_app(
        &self,
        _params: AgentAppUninstallParams,
    ) -> Result<AgentAppUninstallResponse, RuntimeCoreError> {
        Err(unavailable("agentAppInstalled/uninstall"))
    }
}

impl AgentAppDataSource for NoopAppDataSource {}
