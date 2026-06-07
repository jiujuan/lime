use crate::agent::AsterAgentState;
use crate::agent_tools::catalog::WorkspaceToolSurface;
use crate::agent_tools::execution::{
    build_workspace_execution_permissions, ToolExecutionResolverInput,
    WorkspaceExecutionPermissionInput,
};
use crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState;
use crate::commands::aster_agent_cmd::{
    append_subagent_tool_scope_session_permissions, ensure_browser_mcp_tools_registered,
    ensure_creation_task_tools_registered, ensure_social_image_tool_registered,
};
use crate::commands::skill_error::{
    format_skill_error, SKILL_ERR_PROVIDER_UNAVAILABLE, SKILL_ERR_SESSION_INIT_FAILED,
};
use crate::config::GlobalConfigManagerState;
use crate::database::dao::agent_run::AgentRunStatus;
use crate::database::DbConnection;
use crate::services::execution_tracker_service::RunFinishDecision;
use crate::services::memory_profile_prompt_service::{build_memory_prompt, MemoryPromptContext};
use aster::permission::{PermissionScope, ToolPermission, ToolPermissionManager};
use lime_skills::LoadedSkillDefinition;
use std::path::Path;
use std::sync::Arc;

use super::execution::SkillExecutionResult;
use super::execution_callback::TauriExecutionCallback;
use super::social_post::{infer_general_workbench_gate_key, is_content_post_skill_name};

#[cfg(test)]
use super::social_post::CONTENT_POST_WITH_COVER_SKILL_NAME;

#[derive(Debug, Clone)]
pub struct SkillProviderSelection {
    pub requested_provider: String,
    pub requested_model: String,
    pub resolved_provider: String,
    pub resolved_model: String,
}

pub struct PreparedSkillExecution {
    pub callback: TauriExecutionCallback,
    pub memory_prompt: Option<String>,
    pub provider_selection: SkillProviderSelection,
}

const DEFAULT_SKILL_PROVIDER: &str = "anthropic";
const DEFAULT_SKILL_MODEL: &str = "claude-sonnet-4-20250514";
const FALLBACK_TOOL_CAPABLE_PROVIDERS: &[(&str, &str)] = &[
    ("anthropic", "claude-sonnet-4-20250514"),
    ("openai", "gpt-4o"),
    ("gemini", "gemini-2.0-flash"),
];
fn build_skill_memory_prompt(
    db: &DbConnection,
    config_manager: &GlobalConfigManagerState,
    session_id: &str,
) -> Option<String> {
    let config = config_manager.config();
    let session_working_dir = lime_agent::get_session_sync(db, session_id)
        .ok()
        .and_then(|session| session.working_dir)
        .filter(|path| !path.trim().is_empty());
    let context = MemoryPromptContext {
        working_dir: session_working_dir.as_deref().map(Path::new),
        active_relative_path: None,
    };

    build_memory_prompt(&config, context)
}

fn resolve_skill_workspace_root(db: &DbConnection, session_id: &str) -> String {
    lime_agent::get_session_sync(db, session_id)
        .ok()
        .and_then(|session| session.working_dir)
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty())
        .or_else(|| {
            std::env::current_dir()
                .ok()
                .map(|path| path.to_string_lossy().to_string())
                .filter(|path| !path.trim().is_empty())
        })
        .unwrap_or_else(|| std::env::temp_dir().to_string_lossy().to_string())
}

fn build_skill_tool_scope_metadata(skill: &LoadedSkillDefinition) -> Option<serde_json::Value> {
    let allowed_tools = skill
        .allowed_tools
        .as_ref()
        .filter(|tools| !tools.is_empty())?;

    Some(serde_json::json!({
        "subagent": {
            "allowed_tools": allowed_tools,
        },
    }))
}

fn build_skill_workspace_permissions(
    skill: &LoadedSkillDefinition,
    session_id: &str,
    workspace_root: &str,
    config_manager: &GlobalConfigManagerState,
) -> Vec<ToolPermission> {
    let config = config_manager.config();
    let metadata = build_skill_tool_scope_metadata(skill);
    let mut permissions =
        build_workspace_execution_permissions(WorkspaceExecutionPermissionInput {
            surface: WorkspaceToolSurface::workbench(),
            workspace_root,
            explicit_read_only_paths: &[],
            auto_mode: false,
            bypass_restrictions: false,
            execution_policy_input: ToolExecutionResolverInput {
                persisted_policy: Some(&config.agent.tool_execution),
                request_metadata: metadata.as_ref(),
            },
        });
    append_subagent_tool_scope_session_permissions(&mut permissions, session_id, metadata.as_ref());
    permissions
}

async fn configure_skill_workspace_permissions(
    db: &DbConnection,
    config_manager: &GlobalConfigManagerState,
    aster_state: &AsterAgentState,
    skill: &LoadedSkillDefinition,
    session_id: &str,
) -> Result<(), String> {
    let workspace_root = resolve_skill_workspace_root(db, session_id);
    let permissions =
        build_skill_workspace_permissions(skill, session_id, &workspace_root, config_manager);
    let agent_arc = aster_state.get_agent_arc();
    let guard = agent_arc.read().await;
    let agent = guard
        .as_ref()
        .ok_or_else(|| "Agent not initialized".to_string())?;
    let registry_arc = agent.tool_registry().clone();
    drop(guard);

    let mut permission_manager = ToolPermissionManager::new(None);
    for permission in permissions {
        permission_manager.add_permission(permission, PermissionScope::Session);
    }
    registry_arc
        .write()
        .await
        .set_permission_manager(Arc::new(permission_manager));

    Ok(())
}

fn resolve_requested_provider(
    skill: &LoadedSkillDefinition,
    provider_override: Option<&str>,
    model_override: Option<&str>,
) -> (String, String) {
    let requested_provider = provider_override
        .map(|value| value.to_string())
        .or_else(|| skill.provider.clone())
        .unwrap_or_else(|| DEFAULT_SKILL_PROVIDER.to_string());
    let requested_model = model_override
        .map(|value| value.to_string())
        .or_else(|| skill.model.clone())
        .unwrap_or_else(|| DEFAULT_SKILL_MODEL.to_string());
    (requested_provider, requested_model)
}

async fn ensure_skill_agent_ready(
    app_handle: &tauri::AppHandle,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    config_manager: &GlobalConfigManagerState,
    aster_state: &AsterAgentState,
) -> Result<(), String> {
    if !aster_state.is_initialized().await {
        tracing::info!("[execute_skill] Agent 未初始化，开始初始化...");
        aster_state.init_agent_with_db(db).await.map_err(|error| {
            format_skill_error(
                SKILL_ERR_SESSION_INIT_FAILED,
                format!("初始化 Agent 失败: {error}"),
            )
        })?;
        tracing::info!("[execute_skill] Agent 初始化完成");
    }

    ensure_browser_mcp_tools_registered(aster_state, db)
        .await
        .map_err(|error| {
            format_skill_error(
                SKILL_ERR_SESSION_INIT_FAILED,
                format!("注册浏览器工具失败: {error}"),
            )
        })?;
    ensure_social_image_tool_registered(aster_state, config_manager)
        .await
        .map_err(|error| {
            format_skill_error(
                SKILL_ERR_SESSION_INIT_FAILED,
                format!("注册社媒生图工具失败: {error}"),
            )
        })?;
    ensure_creation_task_tools_registered(aster_state, db, api_key_provider_service, app_handle)
        .await
        .map_err(|error| {
            format_skill_error(
                SKILL_ERR_SESSION_INIT_FAILED,
                format!("注册创作任务工具失败: {error}"),
            )
        })?;

    Ok(())
}

async fn configure_skill_provider_with_fallback(
    aster_state: &AsterAgentState,
    db: &DbConnection,
    session_id: &str,
    requested_provider: &str,
    requested_model: &str,
) -> Result<SkillProviderSelection, String> {
    let mut configure_result = aster_state
        .configure_provider_from_pool(db, requested_provider, requested_model, session_id, None)
        .await;

    if configure_result.is_err() {
        tracing::warn!(
            "[execute_skill] 首选 Provider {} 配置失败: {:?}，尝试 fallback",
            requested_provider,
            configure_result.as_ref().err()
        );

        for (fallback_provider, fallback_model) in FALLBACK_TOOL_CAPABLE_PROVIDERS {
            if *fallback_provider == requested_provider {
                continue;
            }
            match aster_state
                .configure_provider_from_pool(
                    db,
                    fallback_provider,
                    fallback_model,
                    session_id,
                    None,
                )
                .await
            {
                Ok(config) => {
                    tracing::info!(
                        "[execute_skill] Fallback 到 {} / {} 成功",
                        fallback_provider,
                        fallback_model
                    );
                    configure_result = Ok(config);
                    break;
                }
                Err(error) => {
                    tracing::warn!(
                        "[execute_skill] Fallback {} 也失败: {}",
                        fallback_provider,
                        error
                    );
                }
            }
        }
    }

    let configured_provider = configure_result.map_err(|error| {
        format_skill_error(
            SKILL_ERR_PROVIDER_UNAVAILABLE,
            format!(
                "无法配置任何可用的 Provider（需要支持工具调用的 Provider，如 Anthropic、OpenAI 或 Google）: {error}"
            ),
        )
    })?;

    Ok(SkillProviderSelection {
        requested_provider: requested_provider.to_string(),
        requested_model: requested_model.to_string(),
        resolved_provider: configured_provider.provider_name,
        resolved_model: configured_provider.model_name,
    })
}

pub async fn prepare_skill_execution(
    app_handle: &tauri::AppHandle,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    config_manager: &GlobalConfigManagerState,
    aster_state: &AsterAgentState,
    skill: &LoadedSkillDefinition,
    execution_id: &str,
    session_id: &str,
    provider_override: Option<&str>,
    model_override: Option<&str>,
) -> Result<PreparedSkillExecution, String> {
    ensure_skill_agent_ready(
        app_handle,
        db,
        api_key_provider_service,
        config_manager,
        aster_state,
    )
    .await?;
    configure_skill_workspace_permissions(db, config_manager, aster_state, skill, session_id)
        .await
        .map_err(|error| {
            format_skill_error(
                SKILL_ERR_SESSION_INIT_FAILED,
                format!("配置 Skill 工具权限失败: {error}"),
            )
        })?;

    let (requested_provider, requested_model) =
        resolve_requested_provider(skill, provider_override, model_override);
    let provider_selection = configure_skill_provider_with_fallback(
        aster_state,
        db,
        session_id,
        &requested_provider,
        &requested_model,
    )
    .await?;

    tracing::info!(
        "[execute_skill] Provider 配置成功: requested={} / {}, resolved={} / {}",
        provider_selection.requested_provider,
        provider_selection.requested_model,
        provider_selection.resolved_provider,
        provider_selection.resolved_model
    );

    Ok(PreparedSkillExecution {
        callback: TauriExecutionCallback::new(app_handle.clone(), execution_id.to_string()),
        memory_prompt: build_skill_memory_prompt(db, config_manager, session_id),
        provider_selection,
    })
}

#[cfg(test)]
mod permission_tests {
    use super::build_skill_workspace_permissions;
    use crate::agent_tools::catalog::LIME_CREATE_IMAGE_TASK_TOOL_NAME;
    use crate::config::GlobalConfigManager;
    use aster::permission::{PermissionContext, PermissionScope, ToolPermissionManager};
    use lime_core::config::Config;
    use lime_skills::LoadedSkillDefinition;
    use serde_json::json;
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::Arc;

    fn build_loaded_skill(allowed_tools: Option<Vec<&str>>) -> LoadedSkillDefinition {
        LoadedSkillDefinition {
            skill_name: "image_generate".to_string(),
            display_name: "配图".to_string(),
            description: "测试 skill".to_string(),
            markdown_content: "test".to_string(),
            license: None,
            compatibility: None,
            metadata: HashMap::new(),
            allowed_tools: allowed_tools.map(|tools| {
                tools
                    .into_iter()
                    .map(|tool| tool.to_string())
                    .collect::<Vec<_>>()
            }),
            argument_hint: None,
            when_to_use: None,
            when_to_use_config: None,
            model: None,
            provider: None,
            disable_model_invocation: false,
            execution_mode: "prompt".to_string(),
            workflow_ref: None,
            workflow_steps: Vec::new(),
            standard_compliance: Default::default(),
        }
    }

    fn permission_manager_for_skill(
        skill: &LoadedSkillDefinition,
        session_id: &str,
    ) -> ToolPermissionManager {
        let manager = GlobalConfigManager::new(
            Config::default(),
            PathBuf::from("/tmp/lime-skill-config.yaml"),
        );
        let config_manager = crate::config::GlobalConfigManagerState(Arc::new(manager));
        let permissions = build_skill_workspace_permissions(
            skill,
            session_id,
            "/tmp/lime-skill",
            &config_manager,
        );
        let mut manager = ToolPermissionManager::new(None);
        for permission in permissions {
            manager.add_permission(permission, PermissionScope::Session);
        }
        manager
    }

    fn permission_context(session_id: &str) -> PermissionContext {
        PermissionContext {
            working_directory: PathBuf::from("/tmp/lime-skill"),
            session_id: session_id.to_string(),
            ..PermissionContext::default()
        }
    }

    #[test]
    fn skill_allowed_tools_allow_image_task_tool_in_current_session() {
        let skill = build_loaded_skill(Some(vec![LIME_CREATE_IMAGE_TASK_TOOL_NAME]));
        let manager = permission_manager_for_skill(&skill, "skill-session-1");

        let result = manager.is_allowed(
            LIME_CREATE_IMAGE_TASK_TOOL_NAME,
            &HashMap::new(),
            &permission_context("skill-session-1"),
        );

        assert!(
            result.allowed,
            "image_generate allowed-tools 应授权当前 skill session 调用图片任务工具: {:?}",
            result.reason
        );
    }

    #[test]
    fn skill_allowed_tools_keep_other_tools_denied_in_current_session() {
        let skill = build_loaded_skill(Some(vec![LIME_CREATE_IMAGE_TASK_TOOL_NAME]));
        let manager = permission_manager_for_skill(&skill, "skill-session-1");

        let result = manager.is_allowed(
            "WebSearch",
            &HashMap::new(),
            &permission_context("skill-session-1"),
        );

        assert!(!result.allowed);
        assert_eq!(
            result.reason,
            Some("subagent current surface 已启用 allowed_tools 白名单".to_string())
        );
    }

    #[test]
    fn skill_without_allowed_tools_keeps_workbench_defaults() {
        let skill = build_loaded_skill(None);
        let manager = permission_manager_for_skill(&skill, "skill-session-1");

        let result = manager.is_allowed(
            LIME_CREATE_IMAGE_TASK_TOOL_NAME,
            &HashMap::new(),
            &permission_context("skill-session-1"),
        );

        assert!(result.allowed);
    }

    #[test]
    fn skill_allowed_tools_do_not_allow_unknown_tools() {
        let skill = build_loaded_skill(Some(vec![LIME_CREATE_IMAGE_TASK_TOOL_NAME]));
        let manager = permission_manager_for_skill(&skill, "skill-session-1");

        let result = manager.is_allowed(
            "unknown_tool",
            &HashMap::from([("payload".to_string(), json!("test"))]),
            &permission_context("skill-session-1"),
        );

        assert!(!result.allowed);
    }
}

pub fn build_skill_run_start_metadata(
    skill_name: &str,
    execution_id: &str,
    user_input: &str,
    provider_override: Option<&str>,
    model_override: Option<&str>,
) -> serde_json::Value {
    serde_json::json!({
        "execution_id": execution_id,
        "skill_name": skill_name,
        "gate_key": infer_general_workbench_gate_key(skill_name, user_input),
        "provider_override": provider_override,
        "model_override": model_override,
    })
}

fn build_success_metadata(
    skill_name: &str,
    execution_id: &str,
    provider_override: Option<&str>,
    model_override: Option<&str>,
    provider_selection: Option<&SkillProviderSelection>,
    artifact_paths: Vec<String>,
) -> serde_json::Value {
    let mut metadata = serde_json::json!({
        "skill_name": skill_name,
        "execution_id": execution_id,
        "provider_override": provider_override,
        "model_override": model_override,
    });

    if let Some(selection) = provider_selection {
        metadata["requested_provider"] = serde_json::json!(selection.requested_provider);
        metadata["requested_model"] = serde_json::json!(selection.requested_model);
        metadata["resolved_provider"] = serde_json::json!(selection.resolved_provider);
        metadata["resolved_model"] = serde_json::json!(selection.resolved_model);
    } else {
        metadata["requested_provider"] = serde_json::json!(provider_override);
        metadata["requested_model"] = serde_json::json!(model_override);
    }

    if is_content_post_skill_name(skill_name) {
        metadata["workflow"] = serde_json::json!("content_pipeline_v1");
        metadata["version_id"] = serde_json::json!(execution_id);
        metadata["stages"] = serde_json::json!(["topic_select", "write_mode", "publish_confirm"]);
        metadata["artifact_paths"] = serde_json::json!(artifact_paths);
    }

    metadata
}

fn build_error_metadata(
    skill_name: &str,
    execution_id: &str,
    provider_override: Option<&str>,
    model_override: Option<&str>,
    provider_selection: Option<&SkillProviderSelection>,
    success: Option<bool>,
) -> serde_json::Value {
    let mut metadata = serde_json::json!({
        "skill_name": skill_name,
        "execution_id": execution_id,
        "provider_override": provider_override,
        "model_override": model_override,
    });

    if let Some(value) = success {
        metadata["success"] = serde_json::json!(value);
    }
    if let Some(selection) = provider_selection {
        metadata["requested_provider"] = serde_json::json!(selection.requested_provider);
        metadata["requested_model"] = serde_json::json!(selection.requested_model);
        metadata["resolved_provider"] = serde_json::json!(selection.resolved_provider);
        metadata["resolved_model"] = serde_json::json!(selection.resolved_model);
    } else {
        metadata["requested_provider"] = serde_json::json!(provider_override);
        metadata["requested_model"] = serde_json::json!(model_override);
    }

    metadata
}

pub fn build_skill_run_finish_decision(
    skill_name: &str,
    execution_id: &str,
    provider_override: Option<&str>,
    model_override: Option<&str>,
    provider_selection: Option<&SkillProviderSelection>,
    result: &Result<SkillExecutionResult, String>,
) -> RunFinishDecision {
    match result {
        Ok(execution) if execution.success => RunFinishDecision {
            status: AgentRunStatus::Success,
            error_code: None,
            error_message: None,
            metadata: Some(build_success_metadata(
                skill_name,
                execution_id,
                provider_override,
                model_override,
                provider_selection,
                execution.artifact_paths.clone(),
            )),
        },
        Ok(execution) => RunFinishDecision {
            status: AgentRunStatus::Error,
            error_code: Some("skill_execute_failed".to_string()),
            error_message: execution.error.clone(),
            metadata: Some(build_error_metadata(
                skill_name,
                execution_id,
                provider_override,
                model_override,
                provider_selection,
                Some(false),
            )),
        },
        Err(error) => RunFinishDecision {
            status: AgentRunStatus::Error,
            error_code: Some("skill_execute_failed".to_string()),
            error_message: Some(error.clone()),
            metadata: Some(build_error_metadata(
                skill_name,
                execution_id,
                provider_override,
                model_override,
                provider_selection,
                None,
            )),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skills::StepResult;

    #[test]
    fn test_build_skill_run_finish_decision_uses_execution_artifact_paths() {
        let result = Ok(SkillExecutionResult {
            success: true,
            output: Some("纯文本输出，不含 write_file block".to_string()),
            error: None,
            artifact_paths: vec![
                "content-posts/demo.md".to_string(),
                "content-posts/demo.cover.json".to_string(),
                "content-posts/demo.publish-pack.json".to_string(),
            ],
            steps_completed: vec![StepResult {
                step_id: "main".to_string(),
                step_name: "content_post_with_cover".to_string(),
                success: true,
                output: Some("done".to_string()),
                error: None,
            }],
        });

        let decision = build_skill_run_finish_decision(
            CONTENT_POST_WITH_COVER_SKILL_NAME,
            "exec-1",
            None,
            None,
            None,
            &result,
        );
        let metadata = decision.metadata.expect("metadata should exist");

        assert_eq!(
            metadata["artifact_paths"],
            serde_json::json!([
                "content-posts/demo.md",
                "content-posts/demo.cover.json",
                "content-posts/demo.publish-pack.json"
            ])
        );
    }
}
