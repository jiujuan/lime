//! agent_session domain handlers for the App Server processor.

use super::{
    dispatch_result, dispatch_result_with_events, parse_params, to_jsonrpc_error,
    RequestProcessor, RpcDispatch,
};
use app_server_protocol::{
    AgentSessionCompactParams, AgentSessionFileCheckpointDiffParams,
    AgentSessionFileCheckpointGetParams, AgentSessionFileCheckpointListParams,
    AgentSessionFileCheckpointRestoreParams, AgentSessionListParams,
    AgentSessionObjectiveAuditParams, AgentSessionObjectiveClearParams,
    AgentSessionObjectiveContinueParams, AgentSessionObjectiveReadParams,
    AgentSessionObjectiveSetParams, AgentSessionObjectiveStatusUpdateParams,
    AgentSessionQueuedTurnPromoteParams, AgentSessionQueuedTurnRemoveParams,
    AgentSessionThreadResumeParams, AgentSessionUpdateParams, JsonRpcError,
};
use serde_json::Value;

impl RequestProcessor {
    pub(super) async fn handle_session_list_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_agent_sessions(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_session_update_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_session_current(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_objective_read_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionObjectiveReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_agent_session_objective(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_objective_set_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionObjectiveSetParams = parse_params(params)?;
        let response = self
            .runtime
            .set_agent_session_objective(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_objective_status_update_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionObjectiveStatusUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_agent_session_objective_status(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_objective_clear_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionObjectiveClearParams = parse_params(params)?;
        let response = self
            .runtime
            .clear_agent_session_objective(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_objective_continue_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionObjectiveContinueParams = parse_params(params)?;
        let host = self.runtime_host_context();
        let output = self
            .runtime
            .continue_agent_session_objective(params, host)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    pub(super) async fn handle_objective_audit_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionObjectiveAuditParams = parse_params(params)?;
        let response = self
            .runtime
            .audit_agent_session_objective(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_session_compact_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionCompactParams = parse_params(params)?;
        let output = self
            .runtime
            .compact_agent_session(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    pub(super) async fn handle_session_thread_resume_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionThreadResumeParams = parse_params(params)?;
        let host = self.runtime_host_context();
        let output = self
            .runtime
            .resume_agent_session_thread(params, host)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    pub(super) async fn handle_session_queued_turn_remove_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionQueuedTurnRemoveParams = parse_params(params)?;
        let output = self
            .runtime
            .remove_agent_session_queued_turn(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    pub(super) async fn handle_session_queued_turn_promote_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionQueuedTurnPromoteParams = parse_params(params)?;
        let output = self
            .runtime
            .promote_agent_session_queued_turn(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    pub(super) async fn handle_file_checkpoint_list_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionFileCheckpointListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_agent_session_file_checkpoints(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_file_checkpoint_get_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionFileCheckpointGetParams = parse_params(params)?;
        let response = self
            .runtime
            .get_agent_session_file_checkpoint(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_file_checkpoint_diff_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionFileCheckpointDiffParams = parse_params(params)?;
        let response = self
            .runtime
            .diff_agent_session_file_checkpoint(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_file_checkpoint_restore_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionFileCheckpointRestoreParams = parse_params(params)?;
        let response = self
            .runtime
            .restore_agent_session_file_checkpoint(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
}
