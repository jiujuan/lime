use super::{dispatch_result, parse_params, RequestProcessor, RpcDispatch};
use app_server_protocol::{
    error_codes, ExecutionProcessDrainOutputParams, ExecutionProcessIdParams,
    ExecutionProcessStartParams, ExecutionProcessWriteStdinParams, JsonRpcError,
};
use serde_json::Value;

impl RequestProcessor {
    pub(super) async fn handle_execution_process_start_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ExecutionProcessStartParams = parse_params(params)?;
        let response = self
            .execution_process
            .start_process(params)
            .await
            .map_err(execution_process_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_execution_process_write_stdin_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ExecutionProcessWriteStdinParams = parse_params(params)?;
        let response = self
            .execution_process
            .write_stdin(params)
            .map_err(execution_process_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_execution_process_interrupt_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ExecutionProcessIdParams = parse_params(params)?;
        let response = self
            .execution_process
            .interrupt(params)
            .map_err(execution_process_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_execution_process_terminate_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ExecutionProcessIdParams = parse_params(params)?;
        let response = self
            .execution_process
            .terminate(params)
            .map_err(execution_process_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_execution_process_status_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ExecutionProcessIdParams = parse_params(params)?;
        let response = self
            .execution_process
            .status(params)
            .map_err(execution_process_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_execution_process_drain_output_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ExecutionProcessDrainOutputParams = parse_params(params)?;
        let response = self
            .execution_process
            .drain_output(params)
            .map_err(execution_process_error)?;
        dispatch_result(response)
    }
}

fn execution_process_error(error: crate::execution_process::ExecutionProcessError) -> JsonRpcError {
    JsonRpcError::new(error_codes::RUNTIME_ERROR, error.to_string())
}
