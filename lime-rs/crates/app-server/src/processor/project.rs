//! project domain handlers for the App Server processor.

use super::{dispatch_result, parse_params, to_jsonrpc_error, RequestProcessor, RpcDispatch};
use app_server_protocol::{
    JsonRpcError, ProjectMaterialListParams, ProjectMaterialLookupParams, ProjectMaterialUploadParams, ProjectMaterialImportFromUrlParams, ProjectMaterialUpdateParams, ProjectMemoryReadParams,
};
use serde_json::Value;

impl RequestProcessor {
    pub(super) async fn handle_project_material_list_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMaterialListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_project_materials(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_project_material_get_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMaterialLookupParams = parse_params(params)?;
        let response = self
            .runtime
            .get_project_material(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_project_material_count_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMaterialListParams = parse_params(params)?;
        let response = self
            .runtime
            .count_project_materials(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_project_material_upload_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMaterialUploadParams = parse_params(params)?;
        let response = self
            .runtime
            .upload_project_material(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_project_material_import_from_url_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMaterialImportFromUrlParams = parse_params(params)?;
        let response = self
            .runtime
            .import_project_material_from_url(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_project_material_update_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMaterialUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_project_material(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_project_material_delete_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMaterialLookupParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_project_material(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_project_material_content_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMaterialLookupParams = parse_params(params)?;
        let response = self
            .runtime
            .read_project_material_content(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
    // voice handlers 已提取到 processor/voice.rs

    // agent_app handlers 已提取到 processor/agent_app.rs

    pub(super) async fn handle_project_memory_read_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMemoryReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_project_memory(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
}
