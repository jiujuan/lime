//! `request_user_input` 的 Aster Tool trait 临时外壳。
//!
//! DTO、schema、解析、校验和 response normalization 的事实源已迁到
//! `tool-runtime::request_user_input`。本文件只保留 reply loop 未迁完前的
//! callback adapter。

use async_trait::async_trait;
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use tool_runtime::request_user_input::{
    build_elicitation_message, build_elicitation_schema, normalize_request_user_input_result,
    parse_request_user_input_tool_input, project_request_user_input_result,
    request_user_input_tool_input_schema, AskRequest, AskResult, RequestUserInputProjection,
    RequestUserInputSurfaceError, RequestUserInputSurfaceErrorKind,
};
pub use tool_runtime::request_user_input::{
    DEFAULT_REQUEST_USER_INPUT_TIMEOUT_SECS as DEFAULT_ASK_TIMEOUT_SECS,
    REQUEST_USER_INPUT_TOOL_NAME,
};

use crate::tools::base::{PermissionCheckResult, Tool};
use crate::tools::context::{ToolContext, ToolResult};
use crate::tools::error::ToolError;

pub type AskCallback = Arc<
    dyn Fn(
            tool_runtime::request_user_input::AskRequest,
        ) -> Pin<Box<dyn Future<Output = Option<Value>> + Send>>
        + Send
        + Sync,
>;

pub struct AskTool {
    callback: Option<AskCallback>,
    timeout: Duration,
}

impl Default for AskTool {
    fn default() -> Self {
        Self::new()
    }
}

fn request_user_input_error_to_tool_error(error: RequestUserInputSurfaceError) -> ToolError {
    match error.kind() {
        RequestUserInputSurfaceErrorKind::InvalidParams => {
            ToolError::invalid_params(error.message().to_string())
        }
        RequestUserInputSurfaceErrorKind::ExecutionFailed => {
            ToolError::execution_failed(error.message().to_string())
        }
    }
}

impl AskTool {
    pub fn new() -> Self {
        Self {
            callback: None,
            timeout: Duration::from_secs(DEFAULT_ASK_TIMEOUT_SECS),
        }
    }

    pub fn with_callback(mut self, callback: AskCallback) -> Self {
        self.callback = Some(callback);
        self
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn has_callback(&self) -> bool {
        self.callback.is_some()
    }

    pub fn timeout(&self) -> Duration {
        self.timeout
    }

    fn parse_request(&self, params: Value) -> Result<AskRequest, ToolError> {
        parse_request_user_input_tool_input(params).map_err(request_user_input_error_to_tool_error)
    }

    pub fn build_elicitation_message(request: &AskRequest) -> String {
        build_elicitation_message(request)
    }

    pub fn build_elicitation_schema(request: &AskRequest) -> Value {
        build_elicitation_schema(request)
    }

    pub async fn ask(&self, request: &AskRequest) -> Result<AskResult, ToolError> {
        let callback = self.callback.as_ref().ok_or_else(|| {
            ToolError::execution_failed("No callback configured for user interaction")
        })?;

        request_user_input_with_callback(request, callback, self.timeout).await
    }
}

async fn request_user_input_with_callback(
    request: &AskRequest,
    callback: &AskCallback,
    timeout: Duration,
) -> Result<AskResult, ToolError> {
    let response = tokio::time::timeout(timeout, callback(request.clone()))
        .await
        .map_err(|_| ToolError::timeout(timeout))?;

    match response {
        Some(response_data) => normalize_request_user_input_result(request, response_data)
            .map_err(request_user_input_error_to_tool_error),
        None => Err(ToolError::execution_failed(
            "User cancelled the interaction",
        )),
    }
}

pub(crate) async fn execute_request_user_input_runtime_tool(
    params: Value,
    callback: Option<&AskCallback>,
    timeout: Duration,
) -> Result<RequestUserInputProjection, ToolError> {
    let request = parse_request_user_input_tool_input(params)
        .map_err(request_user_input_error_to_tool_error)?;
    let callback = callback.ok_or_else(|| {
        ToolError::execution_failed("No callback configured for user interaction")
    })?;
    let result = request_user_input_with_callback(&request, callback, timeout).await?;

    Ok(project_request_user_input_result(&request, &result))
}

#[async_trait]
impl Tool for AskTool {
    fn name(&self) -> &str {
        REQUEST_USER_INPUT_TOOL_NAME
    }

    fn description(&self) -> &str {
        "Request user input for one to three short questions and wait for the response. \
Set autoResolutionMs, from 60000 to 240000 milliseconds, only when the question is useful \
but non-blocking and continuing with best judgment is acceptable if the user does not answer; \
omit it when explicit user input is required."
    }

    fn input_schema(&self) -> Value {
        request_user_input_tool_input_schema()
    }

    async fn execute(
        &self,
        params: Value,
        _context: &ToolContext,
    ) -> Result<ToolResult, ToolError> {
        let request = self.parse_request(params)?;
        let result = self.ask(&request).await?;
        let projection = project_request_user_input_result(&request, &result);

        Ok(ToolResult::success(projection.output)
            .with_metadata_map(projection.metadata.into_iter().collect()))
    }

    async fn check_permissions(
        &self,
        _params: &Value,
        _context: &ToolContext,
    ) -> PermissionCheckResult {
        PermissionCheckResult::allow()
    }
}
