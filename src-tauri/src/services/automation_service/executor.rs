//! 自动化任务执行器
//!
//! 负责把结构化自动化任务映射到 Aster 执行链路。

use super::{AutomationJobRecord, AutomationPayload, BROWSER_AUTOMATION_RETIRED_MESSAGE};
use crate::agent::AsterAgentWrapper;
use crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState;
use crate::commands::aster_agent_cmd::{build_queued_turn_task, build_runtime_queue_executor};
use crate::config::GlobalConfigManagerState;
use crate::database::DbConnection;
use crate::mcp::McpManagerState;
use crate::services::automation_service::agent_turn_runtime_request::build_agent_turn_runtime_request;
use crate::services::automation_service::AutomationServiceState;
use crate::services::workspace_health_service::ensure_workspace_ready_with_auto_relocate;
use crate::workspace::WorkspaceManager;
use crate::LogState;
use lime_browser_runtime::CdpSessionState;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

#[derive(Debug)]
pub struct JobExecutionResult {
    pub output: String,
    pub output_data: Option<Value>,
    pub session_id: Option<String>,
    pub browser_session: Option<CdpSessionState>,
}

pub async fn execute_job(
    job: &AutomationJobRecord,
    db: &DbConnection,
    app_handle: &Option<AppHandle>,
) -> Result<JobExecutionResult, String> {
    match job.execution_mode {
        lime_core::config::AutomationExecutionMode::LogOnly => Ok(JobExecutionResult {
            output: "Log only mode".to_string(),
            output_data: Some(json!({
                "kind": "log_only",
                "job_id": job.id.clone(),
                "job_name": job.name.clone(),
                "workspace_id": job.workspace_id.clone(),
            })),
            session_id: None,
            browser_session: None,
        }),
        lime_core::config::AutomationExecutionMode::Intelligent
        | lime_core::config::AutomationExecutionMode::Skill => {
            let payload = serde_json::from_value::<AutomationPayload>(job.payload.clone())
                .map_err(|e| format!("解析自动化任务负载失败: {e}"))?;
            match payload {
                AutomationPayload::AgentTurn {
                    prompt,
                    system_prompt,
                    web_search,
                    approval_policy,
                    sandbox_policy,
                    provider_config,
                    provider_preference,
                    model_preference,
                    request_metadata,
                    content_id,
                } => {
                    execute_agent_turn(
                        job,
                        db,
                        app_handle,
                        prompt,
                        system_prompt,
                        web_search,
                        approval_policy,
                        sandbox_policy,
                        provider_config,
                        provider_preference,
                        model_preference,
                        request_metadata,
                        content_id,
                    )
                    .await
                }
                AutomationPayload::BrowserSession { .. } => {
                    Err(BROWSER_AUTOMATION_RETIRED_MESSAGE.to_string())
                }
            }
        }
    }
}

async fn execute_agent_turn(
    job: &AutomationJobRecord,
    db: &DbConnection,
    app_handle: &Option<AppHandle>,
    prompt: String,
    system_prompt: Option<String>,
    web_search: bool,
    approval_policy: Option<String>,
    sandbox_policy: Option<String>,
    provider_config: Option<crate::commands::aster_agent_cmd::ConfigureProviderRequest>,
    provider_preference: Option<String>,
    model_preference: Option<String>,
    request_metadata: Option<Value>,
    content_id: Option<String>,
) -> Result<JobExecutionResult, String> {
    let app = app_handle
        .as_ref()
        .ok_or_else(|| "应用句柄不可用，无法执行自动化任务".to_string())?;

    let workspace_manager = WorkspaceManager::new(db.clone());
    let workspace = workspace_manager
        .get(&job.workspace_id)
        .map_err(|e| format!("读取 workspace 失败: {e}"))?
        .ok_or_else(|| format!("Workspace 不存在: {}", job.workspace_id))?;
    let ensured = ensure_workspace_ready_with_auto_relocate(&workspace_manager, &workspace)?;
    let workspace_root = ensured.root_path.to_string_lossy().to_string();

    let session_name = format!("[自动化] {}", job.name);
    let session_id = AsterAgentWrapper::create_session_sync(
        db,
        Some(session_name),
        Some(workspace_root),
        job.workspace_id.clone(),
        Some("auto".to_string()),
    )?;
    let runtime_request = build_agent_turn_runtime_request(
        job,
        &session_id,
        prompt,
        system_prompt,
        web_search,
        approval_policy,
        sandbox_policy,
        provider_config,
        provider_preference,
        model_preference,
        request_metadata,
        content_id.clone(),
    )?;
    AsterAgentWrapper::persist_session_recent_access_mode(&session_id, runtime_request.access_mode)
        .await?;

    let agent_state = app
        .try_state::<crate::agent::AsterAgentState>()
        .ok_or_else(|| "AsterAgentState 未初始化".to_string())?;
    let api_key_provider_service = app
        .try_state::<ApiKeyProviderServiceState>()
        .ok_or_else(|| "ApiKeyProviderServiceState 未初始化".to_string())?;
    let logs = app
        .try_state::<LogState>()
        .ok_or_else(|| "LogState 未初始化".to_string())?;
    let config_manager = app
        .try_state::<GlobalConfigManagerState>()
        .ok_or_else(|| "GlobalConfigManagerState 未初始化".to_string())?;
    let mcp_manager = app
        .try_state::<McpManagerState>()
        .ok_or_else(|| "McpManagerState 未初始化".to_string())?;
    let automation_state = app
        .try_state::<AutomationServiceState>()
        .ok_or_else(|| "AutomationServiceState 未初始化".to_string())?;
    let queued_task = build_queued_turn_task(runtime_request.request)?;
    crate::agent::runtime_queue_service::submit_runtime_turn(
        app.clone(),
        agent_state.inner(),
        db,
        api_key_provider_service.inner(),
        logs.inner(),
        config_manager.inner(),
        mcp_manager.inner(),
        automation_state.inner(),
        queued_task,
        false,
        false,
        build_runtime_queue_executor(),
    )
    .await?;

    Ok(JobExecutionResult {
        output: "Agent 执行完成".to_string(),
        output_data: Some(json!({
            "kind": "agent_turn",
            "job_id": job.id.clone(),
            "job_name": job.name.clone(),
            "workspace_id": job.workspace_id.clone(),
            "session_id": session_id.clone(),
            "content_id": content_id,
            "status": "success",
        })),
        session_id: Some(session_id),
        browser_session: None,
    })
}
