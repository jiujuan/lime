use std::path::PathBuf;

use aster::tools::{
    PermissionBehavior, PermissionCheckResult, Tool, ToolContext, ToolError, ToolResult,
};
use async_trait::async_trait;
use serde_json::{json, Value};

use crate::runtime_state::AgentRuntimeState;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolPermissionDecision {
    Allow,
    Deny,
    Ask,
}

impl From<PermissionBehavior> for ToolPermissionDecision {
    fn from(value: PermissionBehavior) -> Self {
        match value {
            PermissionBehavior::Allow => Self::Allow,
            PermissionBehavior::Deny => Self::Deny,
            PermissionBehavior::Ask => Self::Ask,
        }
    }
}

impl AgentRuntimeState {
    pub async fn register_fixed_web_search_tool(&self) -> Result<(), String> {
        self.register_native_tool(Box::new(FixedWebSearchTool))
            .await
    }

    pub async fn register_failing_web_search_tool(&self) -> Result<(), String> {
        self.register_native_tool(Box::new(FailingWebSearchTool))
            .await
    }
}

pub async fn lime_skill_tool_permission_decision(
    session_id: &str,
    params: Value,
) -> ToolPermissionDecision {
    let tool = crate::tools::LimeSkillTool::new();
    let context = ToolContext::default().with_session_id(session_id);
    tool.check_permissions(&params, &context)
        .await
        .behavior
        .into()
}

pub fn native_tool_context(working_directory: PathBuf) -> ToolContext {
    ToolContext::new(working_directory)
}

struct FixedWebSearchTool;

#[async_trait]
impl Tool for FixedWebSearchTool {
    fn name(&self) -> &str {
        "WebSearch"
    }

    fn description(&self) -> &str {
        "测试用 WebSearch"
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": { "type": "string" }
            },
            "required": ["query"]
        })
    }

    async fn check_permissions(
        &self,
        _params: &Value,
        _context: &ToolContext,
    ) -> PermissionCheckResult {
        PermissionCheckResult::allow()
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        let query = params
            .get("query")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        Ok(ToolResult::success(format!(
            "session={} query={} result=found",
            context.session_id, query
        ))
        .with_metadata("query", json!(query))
        .with_metadata("source", json!("fixed_web_search")))
    }
}

struct FailingWebSearchTool;

#[async_trait]
impl Tool for FailingWebSearchTool {
    fn name(&self) -> &str {
        "WebSearch"
    }

    fn description(&self) -> &str {
        "测试用失败 WebSearch"
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "query": { "type": "string" }
            },
            "required": ["query"]
        })
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
        _params: Value,
        _context: &ToolContext,
    ) -> Result<ToolResult, ToolError> {
        Err(ToolError::execution_failed("web search unavailable"))
    }
}
