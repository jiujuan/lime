//! agent_app domain handlers for the App Server processor.

use super::{dispatch_result, parse_params, to_jsonrpc_error, RequestProcessor, RpcDispatch};
use app_server_protocol::{
    AgentAppFetchCloudPackageParams, AgentAppInstalledDisabledSetParams,
    AgentAppInstalledSaveParams, AgentAppLocalPackageInspectParams, AgentAppShellPrepareParams,
    AgentAppUiRuntimeStartParams, AgentAppUiRuntimeStatusParams, AgentAppUiRuntimeStopParams,
    AgentAppUninstallParams, AgentAppUninstallRehearsalParams, JsonRpcError,
};

impl RequestProcessor {
    pub(super) async fn handle_agent_app_installed_list_impl(
        &self,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_agent_app_installed()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_agent_app_local_package_inspect_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppLocalPackageInspectParams = parse_params(params)?;
        let response = self
            .runtime
            .inspect_agent_app_local_package(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_agent_app_package_fetch_cloud_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppFetchCloudPackageParams = parse_params(params)?;
        let response = self
            .runtime
            .fetch_agent_app_cloud_package(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_agent_app_installed_save_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppInstalledSaveParams = parse_params(params)?;
        let response = self
            .runtime
            .save_agent_app_installed(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_agent_app_installed_disabled_set_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppInstalledDisabledSetParams = parse_params(params)?;
        let response = self
            .runtime
            .set_agent_app_installed_disabled(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_agent_app_installed_uninstall_rehearsal_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppUninstallRehearsalParams = parse_params(params)?;
        let response = self
            .runtime
            .preview_agent_app_uninstall(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_agent_app_installed_uninstall_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppUninstallParams = parse_params(params)?;
        let response = self
            .runtime
            .uninstall_agent_app(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_agent_app_shell_prepare_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppShellPrepareParams = parse_params(params)?;
        let response = self
            .runtime
            .prepare_agent_app_shell(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_agent_app_ui_runtime_start_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppUiRuntimeStartParams = parse_params(params)?;
        let response = self
            .runtime
            .start_agent_app_ui_runtime(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_agent_app_ui_runtime_status_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppUiRuntimeStatusParams = parse_params(params)?;
        let response = self
            .runtime
            .agent_app_ui_runtime_status(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_agent_app_ui_runtime_stop_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppUiRuntimeStopParams = parse_params(params)?;
        let response = self
            .runtime
            .stop_agent_app_ui_runtime(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
}
