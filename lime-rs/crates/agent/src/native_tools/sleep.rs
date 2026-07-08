use crate::native_tools::runtime_tool_bridge::RuntimeNativeToolAdapter;
use aster::tools::{PermissionCheckResult, Tool, ToolContext};
use serde_json::Value;
use tool_runtime::native_overlay::RuntimeNativeToolOverlay;
use tool_runtime::sleep::{check_runtime_sleep_permissions, SLEEP_TOOL_NAME};

pub(crate) fn create_sleep_tool() -> Box<dyn Tool> {
    debug_assert_eq!(RuntimeNativeToolOverlay::Sleep.name(), SLEEP_TOOL_NAME);
    Box::new(RuntimeNativeToolAdapter::new(
        RuntimeNativeToolOverlay::Sleep,
        check_sleep_permissions,
    ))
}

fn check_sleep_permissions(params: &Value, _context: &ToolContext) -> PermissionCheckResult {
    match check_runtime_sleep_permissions(params) {
        Ok(()) => PermissionCheckResult::allow(),
        Err(error) => PermissionCheckResult::deny(error.message().to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn sleep_permission_delegates_to_current_runtime_rules() {
        let tool = create_sleep_tool();
        let result = tool
            .check_permissions(&json!({ "seconds": 1 }), &ToolContext::default())
            .await;

        assert!(result.is_denied());
    }

    #[tokio::test]
    async fn sleep_tool_delegates_to_current_executor() {
        let tool = create_sleep_tool();
        let result = tool
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
