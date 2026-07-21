use super::unavailable;
use super::NoopAppDataSource;
use super::RuntimeCoreError;
use app_server_protocol::*;
use async_trait::async_trait;
use std::path::PathBuf;

#[async_trait]
pub trait PluginDataSource: Send + Sync {
    fn plugin_data_root(&self) -> Result<PathBuf, RuntimeCoreError> {
        Err(unavailable("pluginData/root"))
    }

    async fn list_plugin_installed(&self) -> Result<PluginInstalledListResponse, RuntimeCoreError> {
        Ok(PluginInstalledListResponse::default())
    }

    async fn inspect_plugin_local_package(
        &self,
        _params: PluginLocalPackageInspectParams,
    ) -> Result<PluginLocalPackageInspectResponse, RuntimeCoreError> {
        Err(unavailable("pluginLocalPackage/inspect"))
    }

    async fn export_plugin_local_package(
        &self,
        _params: PluginLocalPackageExportParams,
    ) -> Result<PluginLocalPackageExportResponse, RuntimeCoreError> {
        Err(unavailable("pluginLocalPackage/export"))
    }

    async fn fetch_plugin_cloud_package(
        &self,
        _params: PluginFetchCloudPackageParams,
    ) -> Result<PluginPackageCacheEntry, RuntimeCoreError> {
        Err(unavailable("pluginPackage/fetchCloud"))
    }

    async fn save_plugin_installed(
        &self,
        _params: PluginInstalledSaveParams,
    ) -> Result<serde_json::Value, RuntimeCoreError> {
        Err(unavailable("pluginInstalled/save"))
    }

    async fn set_plugin_installed_disabled(
        &self,
        _params: PluginInstalledDisabledSetParams,
    ) -> Result<PluginInstalledListResponse, RuntimeCoreError> {
        Err(unavailable("pluginInstalled/disabled/set"))
    }

    async fn preview_plugin_uninstall(
        &self,
        _params: PluginUninstallRehearsalParams,
    ) -> Result<PluginUninstallRehearsalResponse, RuntimeCoreError> {
        Err(unavailable("pluginInstalled/uninstall/rehearsal"))
    }

    async fn uninstall_plugin(
        &self,
        _params: PluginUninstallParams,
    ) -> Result<PluginUninstallResponse, RuntimeCoreError> {
        Err(unavailable("pluginInstalled/uninstall"))
    }
}

impl PluginDataSource for NoopAppDataSource {}
