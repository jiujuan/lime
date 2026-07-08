use super::{dispatch_result, parse_params, RequestProcessor, RpcDispatch};
use app_server_protocol::{
    error_codes, JsonRpcError, ProjectShellSessionDrainEventsParams, ProjectShellSessionKillParams,
    ProjectShellSessionResizeParams, ProjectShellSessionStartParams,
    ProjectShellSessionWriteParams,
};
use serde_json::Value;

impl RequestProcessor {
    pub(super) async fn handle_project_shell_session_start_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectShellSessionStartParams = parse_params(params)?;
        let response = self
            .project_shell
            .start_session(params)
            .map_err(project_shell_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_project_shell_session_write_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectShellSessionWriteParams = parse_params(params)?;
        let response = self
            .project_shell
            .write_session(params)
            .map_err(project_shell_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_project_shell_session_resize_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectShellSessionResizeParams = parse_params(params)?;
        let response = self
            .project_shell
            .resize_session(params)
            .map_err(project_shell_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_project_shell_session_kill_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectShellSessionKillParams = parse_params(params)?;
        let response = self
            .project_shell
            .kill_session(params)
            .map_err(project_shell_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_project_shell_session_drain_events_impl(
        &self,
        params: Option<Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectShellSessionDrainEventsParams = parse_params(params)?;
        let response = self
            .project_shell
            .drain_events(params)
            .map_err(project_shell_error)?;
        dispatch_result(response)
    }
}

fn project_shell_error(error: crate::project_shell::ProjectShellError) -> JsonRpcError {
    JsonRpcError::new(error_codes::RUNTIME_ERROR, error.to_string())
}
