use crate::native_tools::runtime_tool_bridge::RuntimeNativeToolAdapter;
use crate::runtime_facade::current_agent_turn_context;
use aster::tools::{PermissionCheckResult, Tool, ToolContext};
use serde_json::Value;
use tool_runtime::native_overlay::RuntimeNativeToolOverlay;
use tool_runtime::skill_search::check_runtime_skill_search_permissions;
pub use tool_runtime::skill_search::SKILL_SEARCH_TOOL_NAME;

pub(crate) fn create_skill_search_tool() -> Box<dyn Tool> {
    debug_assert_eq!(
        RuntimeNativeToolOverlay::SkillSearch.name(),
        SKILL_SEARCH_TOOL_NAME
    );
    Box::new(
        RuntimeNativeToolAdapter::new(
            RuntimeNativeToolOverlay::SkillSearch,
            check_skill_search_permissions,
        )
        .with_turn_context_provider(current_agent_turn_context),
    )
}

fn check_skill_search_permissions(params: &Value, _context: &ToolContext) -> PermissionCheckResult {
    match check_runtime_skill_search_permissions(params) {
        Ok(()) => PermissionCheckResult::allow(),
        Err(error) => PermissionCheckResult::deny(error.message().to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn permission_check_delegates_to_runtime_executor_rules() {
        let tool = create_skill_search_tool();
        let result = tool
            .check_permissions(&json!({ "query": "" }), &ToolContext::default())
            .await;

        assert!(result.is_denied());
    }
}
