//! Skill 工具门禁包装器
//!
//! 目标：
//! - 避免通用对话默认向模型暴露全部本地 Skills
//! - 保留显式工作流对 Skill 工具的按会话放行能力

use aster::Message;
use aster::{ModelConfig, Provider};
use aster::{PermissionCheckResult, Tool, ToolContext, ToolError, ToolResult};
use async_trait::async_trait;
use lime_skills::{LlmProvider, SkillError};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tool_runtime::skill_execute::{
    run_skill_execution, RuntimeSkillDefinitionBackend, RuntimeSkillExecutionError,
    RuntimeSkillExecutionRequest, RuntimeSkillExecutionResult,
};
use tool_runtime::skill_gate::{
    check_skill_tool_access, skill_tool_input_schema, SKILL_TOOL_DESCRIPTION, SKILL_TOOL_NAME,
};

fn attach_metadata(mut tool_result: ToolResult, metadata: HashMap<String, Value>) -> ToolResult {
    for (key, value) in metadata {
        tool_result = tool_result.with_metadata(key, value);
    }
    tool_result
}

fn tool_result_from_runtime(result: RuntimeSkillExecutionResult) -> ToolResult {
    let RuntimeSkillExecutionResult {
        success,
        output,
        error,
        metadata,
    } = result;
    let tool_result = if success {
        output
            .map(ToolResult::success)
            .unwrap_or_else(ToolResult::success_empty)
    } else {
        ToolResult::error(error.or(output).unwrap_or_default())
    };
    attach_metadata(tool_result, metadata)
}

pub struct LimeSkillTool;

impl LimeSkillTool {
    pub fn new() -> Self {
        Self
    }
}

impl Default for LimeSkillTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for LimeSkillTool {
    fn name(&self) -> &str {
        SKILL_TOOL_NAME
    }

    fn description(&self) -> &str {
        SKILL_TOOL_DESCRIPTION
    }

    fn input_schema(&self) -> Value {
        skill_tool_input_schema()
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        if let Err(error) = check_skill_tool_access(&context.session_id, &params) {
            return Err(ToolError::execution_failed(error.message()));
        }

        let provider = CurrentSessionSkillProvider::from_context(context)
            .map_err(|error| ToolError::execution_failed(error.message().to_string()))?;
        let backend = RuntimeSkillDefinitionBackend::new(provider);
        run_skill_execution(
            &backend,
            RuntimeSkillExecutionRequest::new(context.session_id.clone(), params),
        )
        .await
        .map(tool_result_from_runtime)
        .map_err(|error| ToolError::execution_failed(error.message().to_string()))
    }

    async fn check_permissions(
        &self,
        params: &Value,
        context: &ToolContext,
    ) -> PermissionCheckResult {
        if let Err(error) = check_skill_tool_access(&context.session_id, params) {
            return PermissionCheckResult::deny(error.message());
        }

        PermissionCheckResult::allow()
    }
}

#[derive(Clone)]
struct CurrentSessionSkillProvider {
    provider: Arc<dyn Provider>,
}

impl CurrentSessionSkillProvider {
    fn from_context(context: &ToolContext) -> Result<Self, RuntimeSkillExecutionError> {
        let provider = context.provider.clone().ok_or_else(|| {
            RuntimeSkillExecutionError::new(
                "当前 turn 没有关联可用 provider，无法执行 Skill；请在带 provider 的会话中重试",
            )
        })?;
        Ok(Self { provider })
    }

    fn resolve_model_config(&self, model: Option<&str>) -> Result<Option<ModelConfig>, SkillError> {
        let requested_model = model.map(str::trim).filter(|value| !value.is_empty());
        let Some(requested_model) = requested_model else {
            return Ok(None);
        };

        let model_config = self.provider.get_model_config();
        if model_config.model_name == requested_model {
            return Ok(Some(model_config));
        }

        model_config
            .rebuild_with_model_name(requested_model)
            .map(Some)
            .map_err(|error| {
                SkillError::ConfigError(format!(
                    "无效 skill model '{}': {}",
                    requested_model, error
                ))
            })
    }
}

#[async_trait]
impl LlmProvider for CurrentSessionSkillProvider {
    async fn chat(
        &self,
        system_prompt: &str,
        user_message: &str,
        model: Option<&str>,
    ) -> Result<String, SkillError> {
        let messages = vec![Message::user().with_text(user_message)];
        let response = if let Some(model_config) = self.resolve_model_config(model)? {
            self.provider
                .complete_with_model(&model_config, system_prompt, &messages, &[])
                .await
        } else {
            self.provider.complete(system_prompt, &messages, &[]).await
        };

        let (message, _usage) =
            response.map_err(|error| SkillError::ProviderError(error.to_string()))?;
        Ok(message.as_concat_text())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aster::PermissionBehavior;
    use serde_json::json;
    use tool_runtime::skill_gate::{
        add_skill_tool_session_allowed_capabilities, clear_skill_tool_session_access,
        normalize_skill_invocation_params, set_skill_tool_session_access,
        set_skill_tool_session_allowed_skill_sources, set_skill_tool_session_allowed_skills,
        skill_tool_disabled_message, workspace_skill_source_for_invocation_params,
        SkillToolSessionSkillSource, IMAGE_GENERATE_SKILL_NAME, IMAGE_GENERATION_CONTRACT_KEY,
    };
    use tool_runtime::skill_result::workspace_skill_source_metadata_map;

    fn create_context(session_id: &str) -> ToolContext {
        ToolContext::default().with_session_id(session_id)
    }

    #[tokio::test]
    async fn disabled_session_should_deny_skill_tool() {
        let session_id = "skill-disabled-session";
        clear_skill_tool_session_access(session_id);

        let tool = LimeSkillTool::new();
        let result = tool
            .check_permissions(
                &serde_json::json!({ "skill": "research" }),
                &create_context(session_id),
            )
            .await;

        assert_eq!(result.behavior, PermissionBehavior::Deny);
        assert_eq!(
            result.message.as_deref(),
            Some(skill_tool_disabled_message())
        );
    }

    #[tokio::test]
    async fn enabled_session_should_allow_skill_tool() {
        let session_id = "skill-enabled-session";
        set_skill_tool_session_access(session_id, true);

        let tool = LimeSkillTool::new();
        let result = tool
            .check_permissions(
                &serde_json::json!({ "skill": "research" }),
                &create_context(session_id),
            )
            .await;

        clear_skill_tool_session_access(session_id);

        assert_eq!(result.behavior, PermissionBehavior::Allow);
    }

    #[tokio::test]
    async fn allowlisted_session_should_allow_only_selected_skill() {
        let session_id = "skill-allowlisted-session";
        set_skill_tool_session_allowed_skills(session_id, ["project:capability-report"]);

        let tool = LimeSkillTool::new();
        let allowed = tool
            .check_permissions(
                &serde_json::json!({ "skill": "project:capability-report" }),
                &create_context(session_id),
            )
            .await;
        let denied = tool
            .check_permissions(
                &serde_json::json!({ "skill": "project:other-skill" }),
                &create_context(session_id),
            )
            .await;

        clear_skill_tool_session_access(session_id);

        assert_eq!(allowed.behavior, PermissionBehavior::Allow);
        assert_eq!(denied.behavior, PermissionBehavior::Deny);
        assert!(denied
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("未授权执行 Skill"));
    }

    #[tokio::test]
    async fn turn_capability_should_allow_only_mapped_builtin_skill() {
        let session_id = "skill-image-capability-session";
        add_skill_tool_session_allowed_capabilities(session_id, [IMAGE_GENERATION_CONTRACT_KEY]);

        let tool = LimeSkillTool::new();
        let image_allowed = tool
            .check_permissions(
                &serde_json::json!({ "skill": IMAGE_GENERATE_SKILL_NAME }),
                &create_context(session_id),
            )
            .await;
        let research_denied = tool
            .check_permissions(
                &serde_json::json!({ "skill": "research" }),
                &create_context(session_id),
            )
            .await;

        clear_skill_tool_session_access(session_id);

        assert_eq!(image_allowed.behavior, PermissionBehavior::Allow);
        assert_eq!(research_denied.behavior, PermissionBehavior::Deny);
        assert!(research_denied
            .message
            .as_deref()
            .unwrap_or_default()
            .contains("未授权执行 Skill"));
    }

    #[tokio::test]
    async fn allowlisted_session_should_preserve_workspace_skill_source_metadata() {
        let session_id = "skill-source-session";
        let source = SkillToolSessionSkillSource {
            workspace_root: "/tmp/workspace".to_string(),
            source: "manual_session_enable".to_string(),
            approval: "manual".to_string(),
            directory: "capability-report".to_string(),
            registered_skill_directory: "/tmp/workspace/.agents/skills/capability-report"
                .to_string(),
            skill_name: "project:capability-report".to_string(),
            source_draft_id: "capdraft-1".to_string(),
            source_verification_report_id: "capver-1".to_string(),
            permission_summary: vec!["Level 0 只读发现".to_string()],
        };
        set_skill_tool_session_allowed_skill_sources(session_id, [source.clone()]);

        let tool = LimeSkillTool::new();
        let allowed = tool
            .check_permissions(
                &serde_json::json!({ "skill": "capability-report" }),
                &create_context(session_id),
            )
            .await;
        let restored = workspace_skill_source_for_invocation_params(
            session_id,
            &serde_json::json!({ "skill": "project:capability-report" }),
        )
        .expect("source should be available for allowlisted skill");
        let metadata = workspace_skill_source_metadata_map(&restored);

        clear_skill_tool_session_access(session_id);

        assert_eq!(allowed.behavior, PermissionBehavior::Allow);
        assert_eq!(restored, source);
        assert_eq!(metadata.get("tool_family"), Some(&json!("skill")));
        assert_eq!(
            metadata
                .get("workspace_skill_source")
                .and_then(|value| value.get("sourceDraftId")),
            Some(&json!("capdraft-1"))
        );
        assert_eq!(
            metadata
                .get("workspace_skill_runtime_enable")
                .and_then(|value| value.get("source_verification_report_id")),
            Some(&json!("capver-1"))
        );
    }

    #[test]
    fn skill_tool_params_should_use_current_normalization_for_current_backend() {
        let params = normalize_skill_invocation_params(serde_json::json!({
            "skill": "content-reviewer",
            "args": {
                "projectId": "project-1"
            }
        }));

        assert!(params
            .get("args")
            .and_then(Value::as_str)
            .is_some_and(|args| args.contains("project-1")));
    }

    #[tokio::test]
    async fn disabled_session_should_fail_execute() {
        let session_id = "skill-execute-disabled-session";
        clear_skill_tool_session_access(session_id);

        let tool = LimeSkillTool::new();
        let error = tool
            .execute(
                serde_json::json!({ "skill": "research" }),
                &create_context(session_id),
            )
            .await
            .expect_err("disabled session should reject execute");

        assert!(error.to_string().contains("未启用技能自动调用"));
    }
}
