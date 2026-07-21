use super::super::*;
use async_trait::async_trait;

#[async_trait]
impl PluginDataSource for LocalAppDataSource {
    fn plugin_data_root(&self) -> Result<std::path::PathBuf, RuntimeCoreError> {
        Ok(self.plugin_data_root.clone())
    }

    async fn list_plugin_installed(&self) -> Result<PluginInstalledListResponse, RuntimeCoreError> {
        plugins::list_plugin_installed_state(&self.plugin_data_root).map_err(data_error)
    }

    async fn inspect_plugin_local_package(
        &self,
        params: PluginLocalPackageInspectParams,
    ) -> Result<PluginLocalPackageInspectResponse, RuntimeCoreError> {
        plugins::inspect_plugin_local_package(params).map_err(data_error)
    }

    async fn export_plugin_local_package(
        &self,
        params: PluginLocalPackageExportParams,
    ) -> Result<PluginLocalPackageExportResponse, RuntimeCoreError> {
        plugins::export_plugin_local_package(params).map_err(data_error)
    }

    async fn fetch_plugin_cloud_package(
        &self,
        params: PluginFetchCloudPackageParams,
    ) -> Result<PluginPackageCacheEntry, RuntimeCoreError> {
        plugins::fetch_plugin_cloud_package(&self.plugin_data_root, params)
            .await
            .map_err(data_error)
    }

    async fn save_plugin_installed(
        &self,
        params: PluginInstalledSaveParams,
    ) -> Result<Value, RuntimeCoreError> {
        plugins::save_plugin_installed_state(&self.plugin_data_root, params).map_err(data_error)
    }

    async fn set_plugin_installed_disabled(
        &self,
        params: PluginInstalledDisabledSetParams,
    ) -> Result<PluginInstalledListResponse, RuntimeCoreError> {
        plugins::set_plugin_installed_disabled(&self.plugin_data_root, params).map_err(data_error)
    }

    async fn preview_plugin_uninstall(
        &self,
        params: PluginUninstallRehearsalParams,
    ) -> Result<PluginUninstallRehearsalResponse, RuntimeCoreError> {
        plugins::build_plugin_uninstall_rehearsal(
            &self.plugin_data_root,
            params.app_id,
            params.mode,
        )
        .map_err(data_error)
    }

    async fn uninstall_plugin(
        &self,
        params: PluginUninstallParams,
    ) -> Result<PluginUninstallResponse, RuntimeCoreError> {
        plugins::uninstall_plugin(&self.plugin_data_root, params).map_err(data_error)
    }
}
