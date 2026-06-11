//! file system handlers for the App Server processor.

use super::{dispatch_result, parse_params, to_jsonrpc_error, RequestProcessor, RpcDispatch};
use app_server_protocol::{
    FileSystemCreateDirectoryParams, FileSystemCreateFileParams, FileSystemDeleteFileParams,
    FileSystemListDirectoryParams, FileSystemReadFilePreviewParams, FileSystemRenameFileParams,
    JsonRpcError,
};
use serde_json::Value;

impl RequestProcessor {
    pub(super) async fn handle_file_system_list_directory_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: FileSystemListDirectoryParams = parse_params(params)?;
        let response = self
            .runtime
            .list_directory(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_file_system_read_file_preview_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: FileSystemReadFilePreviewParams = parse_params(params)?;
        let response = self
            .runtime
            .read_file_preview(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_file_system_create_file_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: FileSystemCreateFileParams = parse_params(params)?;
        let response = self
            .runtime
            .create_file(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_file_system_create_directory_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: FileSystemCreateDirectoryParams = parse_params(params)?;
        let response = self
            .runtime
            .create_directory(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_file_system_rename_file_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: FileSystemRenameFileParams = parse_params(params)?;
        let response = self
            .runtime
            .rename_file(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_file_system_delete_file_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: FileSystemDeleteFileParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_file(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
}
