use crate::native_tools::runtime_tool_bridge::RuntimeNativeToolAdapter;
use crate::runtime_facade::current_agent_turn_context;
use aster::tools::{PermissionCheckResult, Tool, ToolContext};
use serde_json::Value;
use tool_runtime::native_overlay::RuntimeNativeToolOverlay;
use tool_runtime::update_plan::{check_plan_update_permissions, UPDATE_PLAN_NAME};

pub(crate) fn create_update_plan_tool() -> Box<dyn Tool> {
    debug_assert_eq!(
        RuntimeNativeToolOverlay::UpdatePlan.name(),
        UPDATE_PLAN_NAME
    );
    Box::new(
        RuntimeNativeToolAdapter::new(
            RuntimeNativeToolOverlay::UpdatePlan,
            check_update_plan_permissions,
        )
        .with_turn_context_provider(current_agent_turn_context),
    )
}

fn check_update_plan_permissions(params: &Value, _context: &ToolContext) -> PermissionCheckResult {
    match check_plan_update_permissions(params) {
        Ok(()) => PermissionCheckResult::allow(),
        Err(error) => PermissionCheckResult::deny(error.message().to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_protocol::turn_context::TurnContextOverride;
    use serde_json::json;

    #[tokio::test]
    async fn update_plan_permission_delegates_to_current_runtime_rules() {
        let tool = create_update_plan_tool();
        let result = tool
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
        let tool = create_update_plan_tool();
        let result = tool
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
            async {
                let tool = create_update_plan_tool();
                tool.execute(
                    json!({
                        "plan": [
                            { "step": "写计划", "status": "in_progress" }
                        ]
                    }),
                    &ToolContext::default(),
                )
                .await
            },
        )
        .await
        .expect_err("update_plan should be rejected in Plan mode");

        assert!(error.to_string().contains("not allowed in Plan mode"));
    }
}
