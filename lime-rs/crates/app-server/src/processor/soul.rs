//! Soul domain handlers for the App Server processor.

use super::{RequestProcessor, RpcDispatch, dispatch_result, parse_params, to_jsonrpc_error};
use app_server_protocol::{
    JsonRpcError, SoulStylePackInstallParams, SoulStylePackListParams,
    SoulStylePackStatusSetParams, SoulStylePackUninstallParams,
};
use serde_json::Value;

impl RequestProcessor {
    pub(super) async fn handle_soul_style_pack_install_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SoulStylePackInstallParams = parse_params(params)?;
        let response = self
            .runtime
            .install_soul_style_pack(params)
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_soul_style_pack_list_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SoulStylePackListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_soul_style_packs(params)
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_soul_style_pack_status_set_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SoulStylePackStatusSetParams = parse_params(params)?;
        let response = self
            .runtime
            .set_soul_style_pack_status(params)
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_soul_style_pack_uninstall_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SoulStylePackUninstallParams = parse_params(params)?;
        let response = self
            .runtime
            .uninstall_soul_style_pack(params)
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
}
