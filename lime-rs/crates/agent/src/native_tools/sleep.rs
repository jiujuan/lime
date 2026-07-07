use crate::native_tools::runtime_tool_bridge::execute_runtime_tool;
use aster::tools::{PermissionCheckResult, Tool, ToolContext, ToolError, ToolOptions, ToolResult};
use async_trait::async_trait;
use serde_json::Value;
use tool_runtime::native_dispatch::runtime_native_dispatch_handle;
use tool_runtime::sleep::{
    check_runtime_sleep_permissions, sleep_tool_definition, CLOCK_SLEEP_TOOL_NAME, SLEEP_TOOL_NAME,
};

pub(crate) fn create_sleep_tool() -> Box<dyn Tool> {
    Box::new(ClockSleepAdapter)
}

#[derive(Debug, Default)]
struct ClockSleepAdapter;

#[async_trait]
impl Tool for ClockSleepAdapter {
    fn name(&self) -> &str {
        SLEEP_TOOL_NAME
    }

    fn description(&self) -> &str {
        "Pause execution for a specified duration and return elapsed wall-clock time."
    }

    fn input_schema(&self) -> Value {
        sleep_tool_definition().input_schema
    }

    fn aliases(&self) -> &'static [&'static str] {
        &[CLOCK_SLEEP_TOOL_NAME]
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        if context.is_cancelled() {
            return Err(ToolError::Cancelled);
        }

        execute_runtime_tool(
            runtime_native_dispatch_handle(),
            SLEEP_TOOL_NAME,
            &params,
            context,
            None,
        )
        .await
    }

    async fn check_permissions(
        &self,
        params: &Value,
        _context: &ToolContext,
    ) -> PermissionCheckResult {
        match check_runtime_sleep_permissions(params) {
            Ok(()) => PermissionCheckResult::allow(),
            Err(error) => PermissionCheckResult::deny(error.message().to_string()),
        }
    }

    fn options(&self) -> ToolOptions {
        ToolOptions::new().with_max_retries(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn sleep_permission_delegates_to_current_runtime_rules() {
        let result = ClockSleepAdapter
            .check_permissions(&json!({ "seconds": 1 }), &ToolContext::default())
            .await;

        assert!(result.is_denied());
    }

    #[tokio::test]
    async fn sleep_tool_delegates_to_current_executor() {
        let result = ClockSleepAdapter
            .execute(
                json!({ "duration_ms": 1 }),
                &ToolContext::default().with_session_id("session-sleep-1"),
            )
            .await
            .expect("sleep tool should execute");

        assert!(result.success);
        assert_eq!(result.metadata.get("tool_family"), Some(&json!("sleep")));
    }
}
