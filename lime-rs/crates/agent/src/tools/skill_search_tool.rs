use crate::native_tools::runtime_tool_bridge::execute_runtime_tool;
use crate::runtime_facade::current_agent_turn_context;
use aster::tools::{PermissionCheckResult, Tool, ToolContext, ToolError, ToolResult};
use async_trait::async_trait;
use serde_json::Value;
use tool_runtime::native_dispatch::runtime_native_dispatch_handle;
pub use tool_runtime::skill_search::SKILL_SEARCH_TOOL_NAME;
use tool_runtime::skill_search::{
    check_runtime_skill_search_permissions, skill_search_tool_definition,
};

#[derive(Debug, Default)]
pub struct SkillSearchTool;

#[async_trait]
impl Tool for SkillSearchTool {
    fn name(&self) -> &str {
        SKILL_SEARCH_TOOL_NAME
    }

    fn description(&self) -> &str {
        "Search available Agent Skills by lightweight metadata. For expert-bound or workspace-enabled skill candidates, call this before Skill so the selector evidence is recorded. Returns matching skill names, scopes, locators, and reasons only; it does not read SKILL.md bodies, enable SkillTool, or expand tool permissions."
    }

    fn input_schema(&self) -> Value {
        skill_search_tool_definition().input_schema
    }

    fn aliases(&self) -> &'static [&'static str] {
        &["SkillSearchTool"]
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        if context.is_cancelled() {
            return Err(ToolError::Cancelled);
        }

        let turn_context = current_agent_turn_context();
        execute_runtime_tool(
            runtime_native_dispatch_handle(),
            SKILL_SEARCH_TOOL_NAME,
            &params,
            context,
            turn_context.as_ref(),
        )
        .await
    }

    async fn check_permissions(
        &self,
        params: &Value,
        _context: &ToolContext,
    ) -> PermissionCheckResult {
        match check_runtime_skill_search_permissions(params) {
            Ok(()) => PermissionCheckResult::allow(),
            Err(error) => PermissionCheckResult::deny(error.message().to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn permission_check_delegates_to_runtime_executor_rules() {
        let result = SkillSearchTool
            .check_permissions(&json!({ "query": "" }), &ToolContext::default())
            .await;

        assert!(result.is_denied());
    }
}
