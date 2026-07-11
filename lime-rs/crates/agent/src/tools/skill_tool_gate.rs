//! Skill 工具门禁包装器
//!
//! 目标：
//! - 避免通用对话默认向模型暴露全部本地 Skills
//! - 保留显式工作流对 Skill 工具的按会话放行能力

use aster::{Message, ModelConfig, Provider, ToolContext};
use async_trait::async_trait;
use futures::FutureExt;
use lime_skills::{LlmProvider, SkillError};
use rmcp::model::{CallToolResult, ErrorCode, ErrorData};
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use tool_runtime::skill_execute::{
    run_skill_execution, RuntimeSkillDefinitionBackend, RuntimeSkillExecutionError,
    RuntimeSkillExecutionRequest, RuntimeSkillExecutionResult,
};
use tool_runtime::skill_gate::{check_skill_tool_access, SKILL_TOOL_NAME};
use tool_runtime::tool_result_projection::{
    runtime_tool_result_to_call_tool_result, RuntimeToolResultParts,
};

fn call_tool_result_from_runtime(result: RuntimeSkillExecutionResult) -> CallToolResult {
    let RuntimeSkillExecutionResult {
        success,
        output,
        error,
        metadata,
    } = result;
    runtime_tool_result_to_call_tool_result(RuntimeToolResultParts {
        success,
        output,
        error,
        metadata,
    })
}

fn skill_execution_error_data(message: impl Into<String>) -> ErrorData {
    ErrorData::new(ErrorCode::INTERNAL_ERROR, message.into(), None)
}

pub(crate) type SkillCallFuture =
    Pin<Box<dyn Future<Output = Result<CallToolResult, ErrorData>> + Send>>;

pub(crate) fn execute_current_skill_tool_request(
    tool_name: &str,
    params: &Value,
    context: &ToolContext,
) -> Option<SkillCallFuture> {
    if tool_name.trim() != SKILL_TOOL_NAME {
        return None;
    }

    if let Err(error) = check_skill_tool_access(&context.session_id, params) {
        return Some(
            futures::future::ready(Err(skill_execution_error_data(error.message()))).boxed(),
        );
    }

    let provider = match CurrentSessionSkillProvider::from_context(context) {
        Ok(provider) => provider,
        Err(error) => {
            return Some(
                futures::future::ready(Err(skill_execution_error_data(
                    error.message().to_string(),
                )))
                .boxed(),
            );
        }
    };
    let session_id = context.session_id.clone();
    let params = params.clone();

    Some(
        async move {
            let backend = RuntimeSkillDefinitionBackend::new(provider);
            run_skill_execution(
                &backend,
                RuntimeSkillExecutionRequest::new(session_id, params),
            )
            .await
            .map(call_tool_result_from_runtime)
            .map_err(|error| skill_execution_error_data(error.message().to_string()))
        }
        .boxed(),
    )
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
    use serde_json::json;
    use tool_runtime::skill_gate::{
        add_skill_tool_session_allowed_capabilities, check_skill_tool_access,
        clear_skill_tool_session_access, normalize_skill_invocation_params,
        set_skill_tool_session_access, set_skill_tool_session_allowed_skill_sources,
        set_skill_tool_session_allowed_skills, skill_tool_disabled_message,
        workspace_skill_source_for_invocation_params, SkillToolSessionSkillSource,
        IMAGE_GENERATE_SKILL_NAME, IMAGE_GENERATION_CONTRACT_KEY,
    };
    use tool_runtime::skill_result::workspace_skill_source_metadata_map;

    fn create_context(session_id: &str) -> ToolContext {
        ToolContext::default().with_session_id(session_id)
    }

    #[tokio::test]
    async fn disabled_session_should_deny_skill_tool() {
        let session_id = "skill-disabled-session";
        clear_skill_tool_session_access(session_id);

        let result =
            check_skill_tool_access(session_id, &serde_json::json!({ "skill": "research" }));

        assert_eq!(
            result
                .expect_err("disabled session should reject")
                .message(),
            skill_tool_disabled_message()
        );
    }

    #[tokio::test]
    async fn enabled_session_should_allow_skill_tool() {
        let session_id = "skill-enabled-session";
        set_skill_tool_session_access(session_id, true);

        let result =
            check_skill_tool_access(session_id, &serde_json::json!({ "skill": "research" }));

        clear_skill_tool_session_access(session_id);

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn allowlisted_session_should_allow_only_selected_skill() {
        let session_id = "skill-allowlisted-session";
        set_skill_tool_session_allowed_skills(session_id, ["project:capability-report"]);

        let allowed = check_skill_tool_access(
            session_id,
            &serde_json::json!({ "skill": "project:capability-report" }),
        );
        let denied = check_skill_tool_access(
            session_id,
            &serde_json::json!({ "skill": "project:other-skill" }),
        );

        clear_skill_tool_session_access(session_id);

        assert!(allowed.is_ok());
        assert!(denied
            .expect_err("other skill should be denied")
            .message()
            .contains("未授权执行 Skill"));
    }

    #[tokio::test]
    async fn turn_capability_should_allow_only_mapped_builtin_skill() {
        let session_id = "skill-image-capability-session";
        add_skill_tool_session_allowed_capabilities(session_id, [IMAGE_GENERATION_CONTRACT_KEY]);

        let image_allowed = check_skill_tool_access(
            session_id,
            &serde_json::json!({ "skill": IMAGE_GENERATE_SKILL_NAME }),
        );
        let research_denied =
            check_skill_tool_access(session_id, &serde_json::json!({ "skill": "research" }));

        clear_skill_tool_session_access(session_id);

        assert!(image_allowed.is_ok());
        assert!(research_denied
            .expect_err("research skill should be denied")
            .message()
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

        let allowed = check_skill_tool_access(
            session_id,
            &serde_json::json!({ "skill": "capability-report" }),
        );
        let restored = workspace_skill_source_for_invocation_params(
            session_id,
            &serde_json::json!({ "skill": "project:capability-report" }),
        )
        .expect("source should be available for allowlisted skill");
        let metadata = workspace_skill_source_metadata_map(&restored);

        clear_skill_tool_session_access(session_id);

        assert!(allowed.is_ok());
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
    async fn current_skill_hook_rejects_disabled_session_before_provider() {
        let session_id = "skill-current-hook-disabled";
        clear_skill_tool_session_access(session_id);

        let params = json!({ "skill": "research" });
        let context = create_context(session_id);

        let result = execute_current_skill_tool_request(SKILL_TOOL_NAME, &params, &context)
            .expect("Skill should be handled before Aster registry fallback");
        let error = result
            .await
            .expect_err("disabled Skill execution should fail");

        assert!(error.message.contains("未启用技能自动调用"));
    }

    #[tokio::test]
    async fn current_skill_hook_requires_provider_after_gate_allows() {
        let session_id = "skill-current-hook-missing-provider";
        set_skill_tool_session_access(session_id, true);

        let params = json!({ "skill": "research" });
        let context = create_context(session_id);

        let result = execute_current_skill_tool_request(SKILL_TOOL_NAME, &params, &context)
            .expect("Skill should be handled before Aster registry fallback");
        let error = result
            .await
            .expect_err("Skill execution without provider should fail");
        clear_skill_tool_session_access(session_id);

        assert!(error.message.contains("当前 turn 没有关联可用 provider"));
    }

    #[test]
    fn current_skill_hook_ignores_non_skill_tools() {
        let params = json!({ "command": "printf ignored" });
        let context = create_context("skill-current-hook-non-skill");

        assert!(execute_current_skill_tool_request("Bash", &params, &context).is_none());
    }
}
