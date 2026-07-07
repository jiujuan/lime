use crate::native_tools::runtime_tool_bridge::execute_runtime_tool;
use crate::runtime_facade::current_agent_turn_context;
use aster::tools::{PermissionCheckResult, Tool, ToolContext, ToolError, ToolOptions, ToolResult};
use async_trait::async_trait;
use serde_json::Value;
use tool_runtime::native_dispatch::runtime_native_dispatch_handle;
use tool_runtime::update_plan::{
    check_plan_update_permissions, update_plan_definition, UPDATE_PLAN_LEGACY_ALIASES,
    UPDATE_PLAN_NAME,
};

pub(crate) fn create_update_plan_tool() -> Box<dyn Tool> {
    Box::new(PlanUpdateAdapter)
}

#[derive(Debug, Default)]
struct PlanUpdateAdapter;

#[async_trait]
impl Tool for PlanUpdateAdapter {
    fn name(&self) -> &str {
        UPDATE_PLAN_NAME
    }

    fn description(&self) -> &str {
        "Updates the task plan."
    }

    fn input_schema(&self) -> Value {
        update_plan_definition().input_schema
    }

    fn aliases(&self) -> &'static [&'static str] {
        UPDATE_PLAN_LEGACY_ALIASES
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        if context.is_cancelled() {
            return Err(ToolError::Cancelled);
        }

        let turn_context = current_agent_turn_context();
        execute_runtime_tool(
            runtime_native_dispatch_handle(),
            UPDATE_PLAN_NAME,
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
        match check_plan_update_permissions(params) {
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
    use agent_protocol::turn_context::TurnContextOverride;
    use serde_json::json;

    #[tokio::test]
    async fn update_plan_permission_delegates_to_current_runtime_rules() {
        let result = PlanUpdateAdapter
            .check_permissions(
                &json!({
                    "plan": [
                        { "step": "第一步", "status": "in_progress" },
                        { "step": "第二步", "status": "in_progress" }
                    ]
                }),
                &ToolContext::default(),
            )
            .await;

        assert!(result.is_denied());
    }

    #[tokio::test]
    async fn update_plan_tool_delegates_to_current_executor() {
        let result = PlanUpdateAdapter
            .execute(
                json!({
                    "explanation": "继续实现",
                    "plan": [
                        { "step": "读现状", "status": "completed" },
                        { "step": "补主链", "status": "in_progress" }
                    ]
                }),
                &ToolContext::default().with_session_id("session-plan-1"),
            )
            .await
            .expect("update_plan tool should execute");

        assert!(result.success);
        assert_eq!(result.output.as_deref(), Some("Plan updated"));
        assert_eq!(
            result.metadata.get("tool_family"),
            Some(&json!("update_plan"))
        );
        assert_eq!(result.metadata["plan"][1]["status"], json!("in_progress"));
    }

    #[tokio::test]
    async fn update_plan_tool_rejects_plan_mode() {
        let error = crate::runtime_facade::with_agent_turn_context(
            Some(TurnContextOverride {
                collaboration_mode: Some("plan".to_string()),
                ..TurnContextOverride::default()
            }),
            PlanUpdateAdapter.execute(
                json!({
                    "plan": [
                        { "step": "写计划", "status": "in_progress" }
                    ]
                }),
                &ToolContext::default(),
            ),
        )
        .await
        .expect_err("update_plan should be rejected in Plan mode");

        assert!(error.to_string().contains("not allowed in Plan mode"));
    }
}
