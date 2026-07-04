//! Codex-compatible task plan checklist tool.

use super::base::{PermissionCheckResult, Tool};
use super::context::{ToolContext, ToolResult};
use super::error::ToolError;
use async_trait::async_trait;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{json, Value};

pub const UPDATE_PLAN_TOOL_NAME: &str = "update_plan";

const UPDATE_PLAN_TOOL_ALIASES: &[&str] = &["UpdatePlan", "UpdatePlanTool", "update_plan_tool"];
const PLAN_UPDATED_MESSAGE: &str = "Plan updated";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PlanStepStatus {
    Pending,
    InProgress,
    Completed,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PlanItem {
    pub step: String,
    #[serde(deserialize_with = "deserialize_step_status")]
    pub status: PlanStepStatus,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct UpdatePlanInput {
    #[serde(default)]
    pub explanation: Option<String>,
    pub plan: Vec<PlanItem>,
}

pub struct UpdatePlanTool;

impl UpdatePlanTool {
    pub fn new() -> Self {
        Self
    }
}

impl Default for UpdatePlanTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for UpdatePlanTool {
    fn name(&self) -> &str {
        UPDATE_PLAN_TOOL_NAME
    }

    fn description(&self) -> &str {
        r#"Updates the task plan.
Provide an optional explanation and a list of plan items, each with a step and status.
At most one step can be in_progress at a time."#
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "explanation": {
                    "type": "string",
                    "description": "Optional explanation for this plan update."
                },
                "plan": {
                    "type": "array",
                    "description": "The list of steps",
                    "items": {
                        "type": "object",
                        "properties": {
                            "step": {
                                "type": "string",
                                "description": "Task step text."
                            },
                            "status": {
                                "type": "string",
                                "enum": ["pending", "in_progress", "completed"],
                                "description": "Step status."
                            }
                        },
                        "required": ["step", "status"],
                        "additionalProperties": false
                    }
                }
            },
            "required": ["plan"],
            "additionalProperties": false
        })
    }

    fn aliases(&self) -> &'static [&'static str] {
        UPDATE_PLAN_TOOL_ALIASES
    }

    async fn check_permissions(
        &self,
        _params: &Value,
        _context: &ToolContext,
    ) -> PermissionCheckResult {
        PermissionCheckResult::allow()
    }

    async fn execute(
        &self,
        params: Value,
        _context: &ToolContext,
    ) -> Result<ToolResult, ToolError> {
        if current_turn_is_plan_mode() {
            return Err(ToolError::execution_failed(
                "update_plan is a checklist/progress tool and is not allowed in Plan mode. Output a <proposed_plan>...</proposed_plan> block instead.",
            ));
        }

        let input = parse_update_plan_input(params)?;
        validate_update_plan(&input)?;

        Ok(ToolResult::success(PLAN_UPDATED_MESSAGE)
            .with_metadata("explanation", json!(input.explanation))
            .with_metadata("plan", json!(input.plan)))
    }
}

fn parse_update_plan_input(params: Value) -> Result<UpdatePlanInput, ToolError> {
    serde_json::from_value(params)
        .map_err(|error| ToolError::invalid_params(format!("update_plan 参数无效: {error}")))
}

fn validate_update_plan(input: &UpdatePlanInput) -> Result<(), ToolError> {
    let in_progress_count = input
        .plan
        .iter()
        .filter(|item| item.status == PlanStepStatus::InProgress)
        .count();

    if in_progress_count > 1 {
        return Err(ToolError::invalid_params(
            "update_plan 最多只能有一个 in_progress 步骤",
        ));
    }

    for item in &input.plan {
        if item.step.trim().is_empty() {
            return Err(ToolError::invalid_params(
                "update_plan.plan[].step 不能为空",
            ));
        }
    }

    Ok(())
}

fn current_turn_is_plan_mode() -> bool {
    crate::session_context::current_turn_context()
        .and_then(|context| context.collaboration_mode)
        .is_some_and(|mode| matches!(mode.trim(), "plan" | "planning"))
}

fn deserialize_step_status<'de, D>(deserializer: D) -> Result<PlanStepStatus, D::Error>
where
    D: Deserializer<'de>,
{
    let value = String::deserialize(deserializer)?;
    match value.trim() {
        "pending" => Ok(PlanStepStatus::Pending),
        "in_progress" | "inProgress" | "in-progress" => Ok(PlanStepStatus::InProgress),
        "completed" => Ok(PlanStepStatus::Completed),
        other => Err(serde::de::Error::custom(format!(
            "unsupported plan step status: {other}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_plan_definition_matches_codex_shape() {
        let tool = UpdatePlanTool::new();
        let definition = tool.get_definition();

        assert_eq!(definition.name, "update_plan");
        assert!(definition.description.contains("At most one step"));
        assert_eq!(
            definition
                .input_schema
                .get("required")
                .and_then(Value::as_array)
                .expect("required fields"),
            &vec![Value::String("plan".to_string())]
        );
        assert_eq!(
            definition.input_schema["properties"]["plan"]["items"]["properties"]["status"]["enum"],
            json!(["pending", "in_progress", "completed"])
        );
    }

    #[tokio::test]
    async fn update_plan_returns_codex_style_ack_and_metadata() {
        let tool = UpdatePlanTool::new();
        let result = tool
            .execute(
                json!({
                    "explanation": "开始实现",
                    "plan": [
                        { "step": "定位工具面", "status": "completed" },
                        { "step": "实现工具", "status": "in_progress" },
                        { "step": "补充测试", "status": "pending" }
                    ]
                }),
                &ToolContext::default(),
            )
            .await
            .expect("update_plan should succeed");

        assert_eq!(result.output.as_deref(), Some(PLAN_UPDATED_MESSAGE));
        assert_eq!(result.metadata["explanation"], json!("开始实现"));
        assert_eq!(result.metadata["plan"][1]["status"], json!("in_progress"));
    }

    #[tokio::test]
    async fn update_plan_accepts_common_multi_model_status_alias() {
        let tool = UpdatePlanTool::new();
        let result = tool
            .execute(
                json!({
                    "plan": [
                        { "step": "处理别名", "status": "inProgress" }
                    ]
                }),
                &ToolContext::default(),
            )
            .await
            .expect("camelCase status alias should be accepted");

        assert_eq!(result.metadata["plan"][0]["status"], json!("in_progress"));
    }

    #[tokio::test]
    async fn update_plan_rejects_multiple_in_progress_steps() {
        let tool = UpdatePlanTool::new();
        let error = tool
            .execute(
                json!({
                    "plan": [
                        { "step": "第一步", "status": "in_progress" },
                        { "step": "第二步", "status": "in_progress" }
                    ]
                }),
                &ToolContext::default(),
            )
            .await
            .expect_err("multiple in_progress steps should be rejected");

        assert!(error.to_string().contains("最多只能有一个"));
    }

    #[tokio::test]
    async fn update_plan_rejects_plan_mode_turn_context() {
        let tool = UpdatePlanTool::new();
        let turn_context = crate::session::TurnContextOverride {
            collaboration_mode: Some("plan".to_string()),
            ..crate::session::TurnContextOverride::default()
        };

        let error = crate::session_context::with_turn_context(Some(turn_context), async {
            tool.execute(
                json!({
                    "plan": [
                        { "step": "写计划", "status": "in_progress" }
                    ]
                }),
                &ToolContext::default(),
            )
            .await
        })
        .await
        .expect_err("update_plan should be rejected in plan mode");

        assert!(error.to_string().contains("not allowed in Plan mode"));
        assert!(error.to_string().contains("<proposed_plan>"));
    }
}
