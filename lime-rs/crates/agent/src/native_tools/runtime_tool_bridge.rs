use aster::tools::{ToolContext, ToolError, ToolResult};
use serde_json::Value;
use tool_runtime::tool_executor::{
    RuntimeToolExecutionContext, RuntimeToolExecutionContextInput, RuntimeToolExecutionError,
    RuntimeToolExecutionRequest, RuntimeToolExecutionResult, RuntimeToolExecutorHandle,
    RuntimeToolPolicyErrorKind, RuntimeToolTurnContext,
};

pub(crate) fn runtime_context_from_aster(context: &ToolContext) -> RuntimeToolExecutionContext {
    RuntimeToolExecutionContext::new(RuntimeToolExecutionContextInput {
        working_directory: context.working_directory.clone(),
        session_id: context.session_id.clone(),
        cancel_token: context.cancellation_token.clone(),
        workspace_sandbox: None,
    })
}

pub(crate) async fn execute_runtime_tool(
    executor: RuntimeToolExecutorHandle,
    tool_name: &str,
    params: &Value,
    context: &ToolContext,
    turn_context: Option<&RuntimeToolTurnContext>,
) -> Result<ToolResult, ToolError> {
    let runtime_context = runtime_context_from_aster(context);
    let result = executor
        .execute(RuntimeToolExecutionRequest {
            tool_name,
            params,
            context: &runtime_context,
            turn_context,
        })
        .await
        .map_err(runtime_error_to_tool_error)?;

    Ok(tool_result_from_runtime(result))
}

pub(crate) fn tool_result_from_runtime(result: RuntimeToolExecutionResult) -> ToolResult {
    if result.success {
        ToolResult::success(result.output).with_metadata_map(result.metadata)
    } else {
        ToolResult::error(result.error.unwrap_or(result.output)).with_metadata_map(result.metadata)
    }
}

pub(crate) fn runtime_error_to_tool_error(error: RuntimeToolExecutionError) -> ToolError {
    match error.policy_kind() {
        Some(RuntimeToolPolicyErrorKind::PermissionDenied(_)) => {
            ToolError::permission_denied(error.message().to_string())
        }
        Some(RuntimeToolPolicyErrorKind::SafetyCheckFailed(_)) => {
            ToolError::safety_check_failed(error.message().to_string())
        }
        Some(RuntimeToolPolicyErrorKind::ExecutionFailed(_)) | None => {
            ToolError::execution_failed(error.message().to_string())
        }
    }
}
