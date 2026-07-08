//! Skill 工具门禁包装器
//!
//! 目标：
//! - 避免通用对话默认向模型暴露全部本地 Skills
//! - 保留显式工作流对 Skill 工具的按会话放行能力

use aster::tools::{PermissionCheckResult, SkillTool, Tool, ToolContext, ToolError, ToolResult};
use async_trait::async_trait;
use serde_json::{json, Value};
use tool_runtime::skill_gate::{
    is_skill_allowed_for_session, is_skill_tool_enabled_for_session,
    normalize_skill_invocation_params, skill_tool_disabled_message, skill_tool_input_schema,
    skill_tool_not_allowed_message, workspace_skill_source_for_session_skill,
    SkillToolSessionSkillSource, SKILL_TOOL_DESCRIPTION, SKILL_TOOL_NAME,
};
use tool_runtime::skill_runtime_contract::{
    build_skill_runtime_contract_metadata, SkillRuntimeContractMetadata,
    SkillRuntimeContractPreflightError,
};

fn build_runtime_preflight_error_result(error: SkillRuntimeContractPreflightError) -> ToolResult {
    let code = error.code();
    let result_payload = error.result_payload();
    let metadata = error.metadata;
    let metadata_value = metadata.metadata_value();
    let runtime_contract = metadata.runtime_contract.clone();
    let skill_name = error.skill_name;
    let message = error.message;

    ToolResult::error(message)
        .with_metadata("tool_family", json!("skill"))
        .with_metadata("skill_name", json!(skill_name))
        .with_metadata("runtime_preflight", json!(true))
        .with_metadata("preflight_check", json!(code))
        .with_metadata(
            "last_error",
            json!({
                "code": code,
                "message": result_payload
                    .pointer("/error/message")
                    .and_then(Value::as_str),
                "stage": "runtime_preflight",
                "retryable": false,
            }),
        )
        .with_metadata("normalized_status", json!("failed"))
        .with_metadata("result", result_payload)
        .with_metadata(
            "modality_contract_key",
            json!(metadata.contract_key.as_str()),
        )
        .with_metadata("modality", json!(metadata.modality.as_str()))
        .with_metadata(
            "required_capabilities",
            json!(&metadata.required_capabilities),
        )
        .with_metadata("routing_slot", json!(metadata.routing_slot.as_str()))
        .with_metadata("runtime_contract", runtime_contract)
        .with_metadata("modality_runtime_contract", metadata_value)
}

fn attach_skill_runtime_contract_metadata(
    mut tool_result: ToolResult,
    metadata: Option<&SkillRuntimeContractMetadata>,
) -> ToolResult {
    let Some(metadata) = metadata else {
        return tool_result;
    };

    tool_result = tool_result
        .with_metadata("modality_contract_key", json!(metadata.contract_key))
        .with_metadata("modality", json!(metadata.modality))
        .with_metadata(
            "required_capabilities",
            json!(metadata.required_capabilities),
        )
        .with_metadata("routing_slot", json!(metadata.routing_slot))
        .with_metadata("runtime_contract", metadata.runtime_contract.clone())
        .with_metadata("modality_runtime_contract", metadata.metadata_value());
    if let Some(entry_source) = metadata.entry_source.as_ref() {
        tool_result = tool_result.with_metadata("entry_source", json!(entry_source));
    }
    tool_result
}

fn workspace_skill_source_metadata_value(source: &SkillToolSessionSkillSource) -> Value {
    json!({
        "workspaceRoot": source.workspace_root.as_str(),
        "source": source.source.as_str(),
        "approval": source.approval.as_str(),
        "authorizationScope": "session",
        "directory": source.directory.as_str(),
        "registeredSkillDirectory": source.registered_skill_directory.as_str(),
        "skillName": source.skill_name.as_str(),
        "sourceDraftId": source.source_draft_id.as_str(),
        "sourceVerificationReportId": source.source_verification_report_id.as_str(),
        "permissionSummary": &source.permission_summary,
    })
}

fn attach_workspace_skill_source_metadata(
    mut tool_result: ToolResult,
    source: Option<&SkillToolSessionSkillSource>,
) -> ToolResult {
    let Some(source) = source else {
        return tool_result;
    };

    tool_result = tool_result
        .with_metadata("tool_family", json!("skill"))
        .with_metadata("skill_name", json!(source.skill_name.as_str()))
        .with_metadata(
            "workspace_skill_source",
            workspace_skill_source_metadata_value(source),
        )
        .with_metadata(
            "workspace_skill_runtime_enable",
            json!({
                "source": source.source.as_str(),
                "approval": source.approval.as_str(),
                "authorization_scope": "session",
                "workspace_root": source.workspace_root.as_str(),
                "directory": source.directory.as_str(),
                "skill": source.skill_name.as_str(),
                "registered_skill_directory": source.registered_skill_directory.as_str(),
                "source_draft_id": source.source_draft_id.as_str(),
                "source_verification_report_id": source.source_verification_report_id.as_str(),
                "permission_summary": &source.permission_summary,
            }),
        );
    tool_result
}

pub struct LimeSkillTool {
    inner: SkillTool,
}

impl LimeSkillTool {
    pub fn new() -> Self {
        Self {
            inner: SkillTool::new(),
        }
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
        if !is_skill_tool_enabled_for_session(&context.session_id) {
            return Err(ToolError::execution_failed(skill_tool_disabled_message()));
        }
        if let Some(skill_name) = params.get("skill").and_then(Value::as_str) {
            if !is_skill_allowed_for_session(&context.session_id, skill_name) {
                return Err(ToolError::execution_failed(skill_tool_not_allowed_message(
                    skill_name,
                )));
            }
        }

        let workspace_skill_source =
            params
                .get("skill")
                .and_then(Value::as_str)
                .and_then(|skill_name| {
                    workspace_skill_source_for_session_skill(&context.session_id, skill_name)
                });
        let runtime_contract_metadata = match build_skill_runtime_contract_metadata(&params) {
            Ok(metadata) => metadata,
            Err(error) => {
                let tool_result = build_runtime_preflight_error_result(error);
                return Ok(attach_workspace_skill_source_metadata(
                    tool_result,
                    workspace_skill_source.as_ref(),
                ));
            }
        };
        let params = normalize_skill_invocation_params(params);
        self.inner
            .execute(params, context)
            .await
            .map(|tool_result| {
                let tool_result = attach_skill_runtime_contract_metadata(
                    tool_result,
                    runtime_contract_metadata.as_ref(),
                );
                attach_workspace_skill_source_metadata(tool_result, workspace_skill_source.as_ref())
            })
    }

    async fn check_permissions(
        &self,
        params: &Value,
        context: &ToolContext,
    ) -> PermissionCheckResult {
        if !is_skill_tool_enabled_for_session(&context.session_id) {
            return PermissionCheckResult::deny(skill_tool_disabled_message());
        }
        if let Some(skill_name) = params.get("skill").and_then(Value::as_str) {
            if !is_skill_allowed_for_session(&context.session_id, skill_name) {
                return PermissionCheckResult::deny(skill_tool_not_allowed_message(skill_name));
            }
        }

        self.inner.check_permissions(params, context).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aster::tools::PermissionBehavior;
    use tool_runtime::skill_gate::{
        add_skill_tool_session_allowed_capabilities, clear_skill_tool_session_access,
        set_skill_tool_session_access, set_skill_tool_session_allowed_skill_sources,
        set_skill_tool_session_allowed_skills, IMAGE_GENERATE_SKILL_NAME,
        IMAGE_GENERATION_CONTRACT_KEY,
    };

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
        let restored =
            workspace_skill_source_for_session_skill(session_id, "project:capability-report")
                .expect("source should be available for allowlisted skill");
        let tool_result =
            attach_workspace_skill_source_metadata(ToolResult::success("ok"), Some(&restored));

        clear_skill_tool_session_access(session_id);

        assert_eq!(allowed.behavior, PermissionBehavior::Allow);
        assert_eq!(restored, source);
        assert_eq!(
            tool_result.metadata.get("tool_family"),
            Some(&json!("skill"))
        );
        assert_eq!(
            tool_result
                .metadata
                .get("workspace_skill_source")
                .and_then(|value| value.get("sourceDraftId")),
            Some(&json!("capdraft-1"))
        );
        assert_eq!(
            tool_result
                .metadata
                .get("workspace_skill_runtime_enable")
                .and_then(|value| value.get("source_verification_report_id")),
            Some(&json!("capver-1"))
        );
    }

    #[test]
    fn skill_tool_params_should_use_current_normalization_for_inner_skill_tool() {
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
