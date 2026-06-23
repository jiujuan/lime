//! Right Surface domain handlers for App Server processor.

use serde_json::Value;

use super::{
    dispatch_result, parse_params, to_jsonrpc_error,
    workspace_right_surface_pending_changed_notification, RequestProcessor, RpcDispatch,
};
use app_server_protocol::JsonRpcError;
use app_server_protocol::WorkspaceRightSurfacePendingChangedParams;
use app_server_protocol::WorkspaceRightSurfacePendingConsumeParams;
use app_server_protocol::WorkspaceRightSurfacePendingDismissParams;
use app_server_protocol::WorkspaceRightSurfacePendingListParams;
use app_server_protocol::WorkspaceRightSurfaceRequestParams;

const PENDING_CHANGE_CONSUMED: &str = "consumed";
const PENDING_CHANGE_DISMISSED: &str = "dismissed";
const PENDING_CHANGE_REQUESTED: &str = "requested";

impl RequestProcessor {
    pub(super) async fn handle_workspace_right_surface_request_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkspaceRightSurfaceRequestParams = parse_params(params)?;
        let response = self
            .runtime
            .request_workspace_right_surface(params)
            .await
            .map_err(to_jsonrpc_error)?;
        let notification = workspace_right_surface_pending_changed_notification(
            WorkspaceRightSurfacePendingChangedParams {
                change_type: PENDING_CHANGE_REQUESTED.to_string(),
                workspace_id: response.pending.workspace_id.clone(),
                workspace_root: response.pending.workspace_root.clone(),
                session_id: response.pending.session_id.clone(),
                surface_kind: Some(response.pending.surface_kind.clone()),
                request_ids: vec![response.request_id.clone()],
                pending: vec![response.pending.clone()],
                ..WorkspaceRightSurfacePendingChangedParams::default()
            },
        )?;
        Ok(dispatch_result(response)?.with_notification(notification))
    }

    pub(super) async fn handle_workspace_right_surface_pending_list_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkspaceRightSurfacePendingListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_workspace_right_surface_pending(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_workspace_right_surface_pending_consume_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkspaceRightSurfacePendingConsumeParams = parse_params(params)?;
        let response = self
            .runtime
            .consume_workspace_right_surface_pending(params)
            .await
            .map_err(to_jsonrpc_error)?;
        let notification = workspace_right_surface_pending_changed_notification(
            WorkspaceRightSurfacePendingChangedParams {
                change_type: PENDING_CHANGE_CONSUMED.to_string(),
                request_ids: response.consumed_request_ids.clone(),
                consumed_request_ids: response.consumed_request_ids.clone(),
                missing_request_ids: response.missing_request_ids.clone(),
                ..WorkspaceRightSurfacePendingChangedParams::default()
            },
        )?;
        Ok(dispatch_result(response)?.with_notification(notification))
    }

    pub(super) async fn handle_workspace_right_surface_pending_dismiss_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkspaceRightSurfacePendingDismissParams = parse_params(params)?;
        let response = self
            .runtime
            .dismiss_workspace_right_surface_pending(params)
            .await
            .map_err(to_jsonrpc_error)?;
        let notification = workspace_right_surface_pending_changed_notification(
            WorkspaceRightSurfacePendingChangedParams {
                change_type: PENDING_CHANGE_DISMISSED.to_string(),
                request_ids: response.dismissed_request_ids.clone(),
                dismissed_request_ids: response.dismissed_request_ids.clone(),
                missing_request_ids: response.missing_request_ids.clone(),
                ..WorkspaceRightSurfacePendingChangedParams::default()
            },
        )?;
        Ok(dispatch_result(response)?.with_notification(notification))
    }
}
