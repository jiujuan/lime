use super::json_value_fields::json_string_field;
use super::thread_read_projection::{
    hydrate_thread_read_managed_objective, hydrate_thread_read_with_latest_model_delta_timing,
};
#[cfg(test)]
use super::thread_read_projection::{
    latest_model_delta_timing_from_run, merge_latest_model_delta_timing_into_thread_read,
};
use super::*;
use crate::commands::aster_agent_cmd::dto::AgentRuntimeSessionHistoryCursor;
use crate::database::lock_db;
use crate::services::agent_timeline_service::abort_running_turn_by_id;
use crate::services::runtime_analysis_handoff_service::{
    export_runtime_analysis_handoff_with_locale, RuntimeAnalysisHandoffExportResult,
};
use crate::services::runtime_evidence_pack_service::{
    export_runtime_evidence_pack_with_owner_runs_and_locale, resolve_runtime_export_workspace_root,
    RuntimeEvidencePackExportResult,
};
use crate::services::runtime_file_checkpoint_service::{
    diff_file_checkpoint, get_file_checkpoint, list_file_checkpoints,
};
use crate::services::runtime_handoff_artifact_service::{
    export_runtime_handoff_bundle, RuntimeHandoffBundleExportResult,
};
use crate::services::runtime_replay_case_service::{
    export_runtime_replay_case_with_locale, RuntimeReplayCaseExportResult,
};
use crate::services::runtime_review_decision_service::{
    export_runtime_review_decision_template_with_locale, save_runtime_review_decision_with_locale,
    RuntimeReviewDecisionContent, RuntimeReviewDecisionTemplateExportResult,
};
use crate::services::thread_reliability_projection_service::sync_thread_reliability_projection;
use aster::hooks::SessionSource;
use lime_core::database::dao::agent::AgentDao;
#[cfg(test)]
use lime_core::database::dao::agent_run::AgentRun;
use lime_core::database::dao::agent_run::AgentRunDao;
use lime_core::database::dao::agent_timeline::{AgentThreadItemStatus, AgentThreadTurnStatus};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::Manager;

const RUNTIME_INTERRUPT_MESSAGE: &str = "用户已停止当前执行";

const RUNTIME_SESSION_OPEN_HISTORY_LIMIT: usize = 40;
const RUNTIME_SESSION_MAX_HISTORY_LIMIT: usize = 2_000;
const TOOL_INVENTORY_AUX_TIMEOUT: Duration = Duration::from_secs(3);

fn normalize_runtime_session_history_limit(history_limit: Option<usize>) -> Option<usize> {
    match history_limit {
        // 兼容需要完整详情的调用者：显式传 0 表示不裁剪。
        Some(0) => None,
        Some(limit) => Some(limit.min(RUNTIME_SESSION_MAX_HISTORY_LIMIT)),
        None => Some(RUNTIME_SESSION_OPEN_HISTORY_LIMIT),
    }
}

fn normalize_runtime_session_history_offset(
    history_limit: Option<usize>,
    history_offset: Option<usize>,
) -> usize {
    if history_limit.is_none() {
        return 0;
    }

    history_offset.unwrap_or(0)
}

fn normalize_runtime_session_history_before_message_id(
    history_limit: Option<usize>,
    history_before_message_id: Option<i64>,
) -> Option<i64> {
    if history_limit.is_none() {
        return None;
    }

    history_before_message_id.filter(|message_id| *message_id > 0)
}

fn should_list_runtime_queue_snapshots(
    detail: &lime_agent::SessionDetail,
    history_limit: Option<usize>,
    history_offset: usize,
    history_before_message_id: Option<i64>,
) -> bool {
    if history_offset > 0 || history_before_message_id.is_some() {
        return false;
    }

    if detail.is_persisted_empty() {
        return false;
    }
    if history_limit.is_none() {
        return true;
    }

    detail
        .turns
        .iter()
        .any(|turn| matches!(turn.status, AgentThreadTurnStatus::Running))
        || detail
            .items
            .iter()
            .any(|item| matches!(item.status, AgentThreadItemStatus::InProgress))
}

async fn resume_runtime_queue_with_warning(
    runtime: &RuntimeCommandContext,
    session_id: &str,
    action_label: &str,
) {
    if let Err(error) = runtime
        .resume_runtime_queue_if_needed(session_id.to_string())
        .await
    {
        tracing::warn!(
            "[AsterAgent][Queue] {}恢复排队执行失败: session_id={}, error={}",
            action_label,
            session_id,
            error
        );
    }
}

#[tauri::command]
pub async fn agent_runtime_submit_turn(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    request: AgentRuntimeSubmitTurnRequest,
) -> Result<(), String> {
    let submit_started_at = Instant::now();
    let runtime = build_runtime_command_context(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
    );
    let skip_pre_submit_resume = request.skip_pre_submit_resume.unwrap_or(false);
    let runtime_request: AsterChatRequest = request.into();
    let queue_if_busy = runtime_request.queue_if_busy.unwrap_or(false);
    let session_id = runtime_request.session_id.clone();
    let event_name = runtime_request.event_name.clone();
    let message_chars = runtime_request.message.chars().count();
    let fast_response_routing =
        crate::commands::aster_agent_cmd::runtime_turn::request_metadata_has_fast_response_routing(
            runtime_request.metadata.as_ref(),
        );
    tracing::info!(
        "[AsterAgent][TTFT] submit_turn ingress: session_id={}, event_name={}, message_chars={}, queue_if_busy={}, skip_pre_submit_resume={}, fast_response_routing={}",
        session_id,
        event_name,
        message_chars,
        queue_if_busy,
        skip_pre_submit_resume,
        fast_response_routing
    );
    let queued_task = build_queued_turn_task(runtime_request)?;
    tracing::info!(
        "[AsterAgent][TTFT] submit_turn queued_task built: session_id={}, event_name={}, elapsed_ms={}",
        session_id,
        event_name,
        submit_started_at.elapsed().as_millis()
    );
    runtime
        .submit_runtime_turn(queued_task, queue_if_busy, skip_pre_submit_resume)
        .await
}

/// 统一运行时：中断当前 turn。
#[tauri::command]
pub async fn agent_runtime_interrupt_turn(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    request: AgentRuntimeInterruptTurnRequest,
) -> Result<bool, String> {
    let session_id = request.session_id;
    let requested_turn_id = request
        .turn_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    if requested_turn_id.is_some() {
        let _ = state
            .record_interrupt_request(&session_id, "user", "用户主动停止当前执行")
            .await;
    }
    let cancelled = state.cancel_session(&session_id).await;
    if cancelled && requested_turn_id.is_none() {
        let _ = state
            .record_interrupt_request(&session_id, "user", "用户主动停止当前执行")
            .await;
    }
    let aborted = if cancelled {
        false
    } else if let Some(turn_id) = requested_turn_id.as_deref() {
        let db = app.state::<DbConnection>();
        abort_running_turn_by_id(db.inner(), &session_id, turn_id, RUNTIME_INTERRUPT_MESSAGE)?
    } else {
        false
    };
    let gate_released = if let Some(turn_id) = requested_turn_id.as_deref() {
        finish_active_runtime_turn_if_matches_service(&session_id, turn_id)?
    } else {
        false
    };
    let cleared = clear_runtime_queue_service(&app, &session_id).await?;
    Ok(cancelled || aborted || gate_released || !cleared.is_empty())
}

/// 统一运行时：压缩当前会话上下文。
#[tauri::command]
pub async fn agent_runtime_compact_session(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    config_manager: State<'_, GlobalConfigManagerState>,
    request: AgentRuntimeCompactSessionRequest,
) -> Result<(), String> {
    crate::commands::aster_agent_cmd::runtime_turn::compact_runtime_session_internal(
        &app,
        state.inner(),
        db.inner(),
        config_manager.inner(),
        request,
    )
    .await
}

/// 统一运行时：恢复当前线程的排队执行。
#[tauri::command]
pub async fn agent_runtime_resume_thread(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    request: AgentRuntimeResumeThreadRequest,
) -> Result<bool, String> {
    let runtime = build_runtime_command_context(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
    );
    let session_id = request.session_id.trim().to_string();
    if session_id.is_empty() {
        return Ok(false);
    }

    runtime.resume_runtime_queue_if_needed(session_id).await
}

/// 统一运行时：获取会话详情。
#[tauri::command]
pub async fn agent_runtime_get_session(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    session_id: String,
    resume_session_start_hooks: Option<bool>,
    history_limit: Option<usize>,
    history_offset: Option<usize>,
    history_before_message_id: Option<i64>,
) -> Result<AgentRuntimeSessionDetail, String> {
    let started_at = Instant::now();
    let resume_hooks = resume_session_start_hooks.unwrap_or(false);
    let normalized_history_limit = normalize_runtime_session_history_limit(history_limit);
    let normalized_history_offset =
        normalize_runtime_session_history_offset(normalized_history_limit, history_offset);
    let normalized_history_before_message_id = normalize_runtime_session_history_before_message_id(
        normalized_history_limit,
        history_before_message_id,
    );
    let runtime = build_runtime_command_context(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
    );
    tracing::info!("[AsterAgent] 获取运行时会话: {}", session_id);
    let result = async {
        // 读取会话详情应保持只读，避免打开会话时顺带恢复排队执行。
        let resume_queue_ms = 0;

        let detail_started_at = Instant::now();
        let detail = AsterAgentWrapper::get_runtime_session_detail_with_history_page(
            runtime.db(),
            &session_id,
            normalized_history_limit,
            normalized_history_offset,
            normalized_history_before_message_id,
        )
        .await?;
        let detail_ms = detail_started_at.elapsed().as_millis();

        let hooks_ms = if resume_hooks {
            let hooks_started_at = Instant::now();
            crate::commands::aster_agent_cmd::runtime_project_hooks::run_runtime_session_start_project_hooks_for_session_with_runtime(
                runtime.db(),
                runtime.state(),
                runtime.mcp_manager(),
                &session_id,
                SessionSource::Resume,
            )
            .await;
            hooks_started_at.elapsed().as_millis()
        } else {
            0
        };

        let queue_snapshots_started_at = Instant::now();
        let list_runtime_queue_snapshots = should_list_runtime_queue_snapshots(
            &detail,
            normalized_history_limit,
            normalized_history_offset,
            normalized_history_before_message_id,
        );
        let queued_turns = if !list_runtime_queue_snapshots {
            Vec::new()
        } else {
            list_runtime_queue_snapshots_service(&session_id).await?
        };
        let queue_snapshots_ms = queue_snapshots_started_at.elapsed().as_millis();

        let interrupt_marker_started_at = Instant::now();
        let interrupt_marker = runtime.state().get_interrupt_marker(&session_id).await;
        let interrupt_marker_ms = interrupt_marker_started_at.elapsed().as_millis();

        let projection_started_at = Instant::now();
        let mut thread_read = if normalized_history_limit.is_some() {
            let pending_requests =
                crate::commands::aster_agent_cmd::build_pending_requests(&detail);
            let last_outcome = crate::commands::aster_agent_cmd::build_last_outcome(&detail);
            let incidents =
                crate::commands::aster_agent_cmd::build_incidents(&detail, &pending_requests);
            AgentRuntimeThreadReadModel::from_parts(
                &detail,
                &queued_turns,
                pending_requests,
                last_outcome,
                incidents,
                interrupt_marker.as_ref(),
            )
        } else {
            let projection = sync_thread_reliability_projection(runtime.db(), &detail)?;
            AgentRuntimeThreadReadModel::from_parts(
                &detail,
                &queued_turns,
                projection.pending_requests,
                projection.last_outcome,
                projection.incidents,
                interrupt_marker.as_ref(),
            )
        };
        if let Err(error) = hydrate_thread_read_with_latest_model_delta_timing(
            runtime.db(),
            &session_id,
            &mut thread_read,
        ) {
            tracing::warn!(
                "[AsterAgent] 读取 agent_runs 首字证据失败: session_id={}, error={}",
                session_id,
                error
            );
        }
        if let Err(error) =
            hydrate_thread_read_managed_objective(runtime.db(), &session_id, &mut thread_read)
        {
            tracing::warn!(
                "[AsterAgent] 读取 Managed Objective 投影失败: session_id={}, error={}",
                session_id,
                error
            );
        }
        let projection_ms = projection_started_at.elapsed().as_millis();

        let dto_started_at = Instant::now();
        let loaded_messages_count = detail.messages.len();
        let is_first_history_page = normalized_history_offset == 0
            && normalized_history_before_message_id.is_none();
        let messages_count = if is_first_history_page {
            Some(
                lime_agent::count_session_messages_sync(runtime.db(), &session_id)
                    .unwrap_or(loaded_messages_count),
            )
        } else {
            None
        };
        let mut response = AgentRuntimeSessionDetail::from_session_detail_with_thread_read(
            detail,
            queued_turns,
            thread_read,
        );
        response.messages_count = messages_count;
        response.history_limit = normalized_history_limit;
        response.history_offset = normalized_history_limit.map(|_| normalized_history_offset);
        response.history_cursor = if let Some(limit) = normalized_history_limit {
            let conn = runtime
                .db()
                .lock()
                .map_err(|error| format!("数据库锁定失败: {error}"))?;
            let window_info = AgentDao::get_message_window_info(
                &conn,
                &session_id,
                limit,
                normalized_history_offset,
                normalized_history_before_message_id,
            )
            .map_err(|error| format!("读取历史游标失败: {error}"))?;
            Some(AgentRuntimeSessionHistoryCursor {
                oldest_message_id: window_info.oldest_message_id,
                start_index: window_info.start_index,
                loaded_count: window_info.loaded_count,
            })
        } else {
            None
        };
        response.history_truncated = response
            .history_cursor
            .as_ref()
            .map(|cursor| cursor.start_index > 0)
            .unwrap_or(false);
        let dto_ms = dto_started_at.elapsed().as_millis();

        Ok::<_, String>((
            response,
            resume_queue_ms,
            detail_ms,
            hooks_ms,
            queue_snapshots_ms,
            projection_ms,
            interrupt_marker_ms,
            dto_ms,
        ))
    }
    .await;

    match result {
        Ok((
            response,
            resume_queue_ms,
            detail_ms,
            hooks_ms,
            queue_snapshots_ms,
            projection_ms,
            interrupt_marker_ms,
            dto_ms,
        )) => {
            let total_ms = started_at.elapsed().as_millis();
            tracing::info!(
                "[AsterAgent] 获取运行时会话完成: session_id={}, total_ms={}, resume_queue_ms={}, detail_ms={}, hooks_ms={}, queue_snapshots_ms={}, projection_ms={}, interrupt_marker_ms={}, dto_ms={}, history_limit={:?}, history_offset={}, history_before_message_id={:?}, messages={}, turns={}, items={}, queued_turns={}, resume_hooks={}",
                session_id,
                total_ms,
                resume_queue_ms,
                detail_ms,
                hooks_ms,
                queue_snapshots_ms,
                projection_ms,
                interrupt_marker_ms,
                dto_ms,
                normalized_history_limit,
                normalized_history_offset,
                normalized_history_before_message_id,
                response.messages.len(),
                response.turns.len(),
                response.items.len(),
                response.queued_turns.len(),
                resume_hooks,
            );
            Ok(response)
        }
        Err(error) => {
            let total_ms = started_at.elapsed().as_millis();
            tracing::error!(
                "[AsterAgent] 获取运行时会话失败: session_id={}, total_ms={}, resume_hooks={}, history_limit={:?}, history_offset={}, history_before_message_id={:?}, error={}",
                session_id,
                total_ms,
                resume_hooks,
                normalized_history_limit,
                normalized_history_offset,
                normalized_history_before_message_id,
                error
            );
            Err(error)
        }
    }
}

/// 统一运行时：仅获取线程稳定读模型。
#[tauri::command]
pub async fn agent_runtime_get_thread_read(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    session_id: String,
) -> Result<AgentRuntimeThreadReadModel, String> {
    let runtime = build_runtime_command_context(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
    );
    tracing::info!("[AsterAgent] 获取运行时线程读模型: {}", session_id);

    let detail = AsterAgentWrapper::get_runtime_session_detail(runtime.db(), &session_id).await?;
    let queued_turns = if detail.is_persisted_empty() {
        Vec::new()
    } else {
        list_runtime_queue_snapshots_service(&session_id).await?
    };
    let projection = sync_thread_reliability_projection(runtime.db(), &detail)?;
    let interrupt_marker = runtime.state().get_interrupt_marker(&session_id).await;
    let mut thread_read = AgentRuntimeThreadReadModel::from_parts(
        &detail,
        &queued_turns,
        projection.pending_requests,
        projection.last_outcome,
        projection.incidents,
        interrupt_marker.as_ref(),
    );
    if let Err(error) = hydrate_thread_read_with_latest_model_delta_timing(
        runtime.db(),
        &session_id,
        &mut thread_read,
    ) {
        tracing::warn!(
            "[AsterAgent] 读取 agent_runs 首字证据失败: session_id={}, error={}",
            session_id,
            error
        );
    }
    if let Err(error) =
        hydrate_thread_read_managed_objective(runtime.db(), &session_id, &mut thread_read)
    {
        tracing::warn!(
            "[AsterAgent] 读取 Managed Objective 投影失败: session_id={}, error={}",
            session_id,
            error
        );
    }
    Ok(thread_read)
}

/// 统一运行时：列出当前线程的文件快照。
#[tauri::command]
pub async fn agent_runtime_list_file_checkpoints(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    request: AgentRuntimeListFileCheckpointsRequest,
) -> Result<AgentRuntimeFileCheckpointListResult, String> {
    let runtime = build_runtime_command_context(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
    );
    tracing::info!("[AsterAgent] 列出文件快照: {}", request.session_id);
    let context =
        load_runtime_export_context(&runtime, &request.session_id, "列出文件快照前").await?;
    Ok(list_file_checkpoints(&context.detail))
}

/// 统一运行时：获取单个文件快照详情。
#[tauri::command]
pub async fn agent_runtime_get_file_checkpoint(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    request: AgentRuntimeGetFileCheckpointRequest,
) -> Result<AgentRuntimeFileCheckpointDetail, String> {
    let runtime = build_runtime_command_context(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
    );
    tracing::info!(
        "[AsterAgent] 获取文件快照详情: session_id={}, checkpoint_id={}",
        request.session_id,
        request.checkpoint_id
    );
    let context =
        load_runtime_export_context(&runtime, &request.session_id, "获取文件快照详情前").await?;
    get_file_checkpoint(
        &context.detail,
        &context.workspace_root,
        request.checkpoint_id.as_str(),
    )
}

/// 统一运行时：获取单个文件快照 diff。
#[tauri::command]
pub async fn agent_runtime_diff_file_checkpoint(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    request: AgentRuntimeDiffFileCheckpointRequest,
) -> Result<AgentRuntimeFileCheckpointDiffResult, String> {
    let runtime = build_runtime_command_context(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
    );
    tracing::info!(
        "[AsterAgent] 获取文件快照 diff: session_id={}, checkpoint_id={}",
        request.session_id,
        request.checkpoint_id
    );
    let context =
        load_runtime_export_context(&runtime, &request.session_id, "获取文件快照 diff 前").await?;
    diff_file_checkpoint(&context.detail, request.checkpoint_id.as_str())
}

struct RuntimeExportContext {
    detail: SessionDetail,
    thread_read: AgentRuntimeThreadReadModel,
    workspace_root: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct AgentAppRuntimeExportProjectionScope {
    app_id: String,
    task_id: String,
    trace_id: Option<String>,
    task_kind: Option<String>,
}

async fn load_runtime_export_context(
    runtime: &RuntimeCommandContext,
    session_id: &str,
    action_label: &str,
) -> Result<RuntimeExportContext, String> {
    resume_runtime_queue_with_warning(runtime, session_id, action_label).await;

    let detail = AsterAgentWrapper::get_runtime_session_detail(runtime.db(), session_id).await?;
    let queued_turns = if detail.is_persisted_empty() {
        Vec::new()
    } else {
        list_runtime_queue_snapshots_service(session_id).await?
    };
    let projection = sync_thread_reliability_projection(runtime.db(), &detail)?;
    let interrupt_marker = runtime.state().get_interrupt_marker(session_id).await;
    let thread_read = AgentRuntimeThreadReadModel::from_parts(
        &detail,
        &queued_turns,
        projection.pending_requests,
        projection.last_outcome,
        projection.incidents,
        interrupt_marker.as_ref(),
    );
    let workspace_root = resolve_runtime_export_workspace_root(runtime.db(), &detail)?;

    Ok(RuntimeExportContext {
        detail,
        thread_read,
        workspace_root,
    })
}

fn normalize_agent_app_projection_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn agent_app_runtime_export_event_name(scope: &AgentAppRuntimeExportProjectionScope) -> String {
    format!("agent_app_runtime:{}:{}", scope.app_id, scope.task_id)
}

fn agent_app_runtime_export_scope_from_runtime_summary_value(
    summary: Option<&Value>,
) -> Option<AgentAppRuntimeExportProjectionScope> {
    let summary = summary?;
    let surface = json_string_field(summary, &["surface"])?;
    if surface != "agent_app" {
        return None;
    }

    Some(AgentAppRuntimeExportProjectionScope {
        app_id: json_string_field(summary, &["appId", "app_id"])?,
        task_id: json_string_field(summary, &["taskId", "task_id"])?,
        trace_id: json_string_field(summary, &["traceId", "trace_id"]),
        task_kind: json_string_field(summary, &["taskKind", "task_kind"]),
    })
}

fn agent_app_runtime_export_scope_from_execution_runtime(
    runtime: Option<&lime_agent::SessionExecutionRuntime>,
) -> Option<AgentAppRuntimeExportProjectionScope> {
    let summary = runtime?.runtime_summary.as_ref()?;
    if summary.surface.as_deref().map(str::trim) != Some("agent_app") {
        return None;
    }

    Some(AgentAppRuntimeExportProjectionScope {
        app_id: normalize_agent_app_projection_text(summary.app_id.as_deref())?,
        task_id: normalize_agent_app_projection_text(summary.task_id.as_deref())?,
        trace_id: normalize_agent_app_projection_text(summary.trace_id.as_deref()),
        task_kind: normalize_agent_app_projection_text(summary.task_kind.as_deref()),
    })
}

fn resolve_agent_app_runtime_export_projection_scope(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
) -> Option<AgentAppRuntimeExportProjectionScope> {
    agent_app_runtime_export_scope_from_runtime_summary_value(thread_read.runtime_summary.as_ref())
        .or_else(|| {
            agent_app_runtime_export_scope_from_execution_runtime(detail.execution_runtime.as_ref())
        })
}

fn json_array_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Vec<Value>> {
    keys.iter().find_map(|key| value.get(*key)?.as_array())
}

fn harness_export_kind_label(export_kind: &str) -> &'static str {
    match export_kind {
        "evidence_pack" => "Evidence Pack",
        "analysis_handoff" => "Analysis Handoff",
        "review_decision" => "Review Decision",
        _ => "Harness Export",
    }
}

fn harness_export_root_ref(export_kind: &str, export: &Value) -> Option<String> {
    match export_kind {
        "evidence_pack" => json_string_field(export, &["packRelativeRoot", "pack_relative_root"]),
        "analysis_handoff" => {
            json_string_field(export, &["analysisRelativeRoot", "analysis_relative_root"])
        }
        "review_decision" => {
            json_string_field(export, &["reviewRelativeRoot", "review_relative_root"])
        }
        _ => None,
    }
}

fn harness_exported_at(export: &Value) -> Option<String> {
    json_string_field(export, &["exportedAt", "exported_at"])
}

fn build_harness_export_root_task_event(export_kind: &str, export: &Value) -> Option<Value> {
    let root_ref = harness_export_root_ref(export_kind, export)?;
    let label = harness_export_kind_label(export_kind);
    let mut task_event = serde_json::Map::new();
    task_event.insert(
        "id".to_string(),
        json!(format!("harness:{export_kind}:exported")),
    );
    task_event.insert(
        "eventType".to_string(),
        json!(if export_kind == "evidence_pack" {
            "evidence:recorded"
        } else {
            "artifact:created"
        }),
    );
    task_event.insert(
        "status".to_string(),
        json!(if export_kind == "evidence_pack" {
            "recorded"
        } else {
            "created"
        }),
    );
    task_event.insert("message".to_string(), json!(format!("{label} 已导出")));
    task_event.insert("occurredAt".to_string(), json!(harness_exported_at(export)));
    task_event.insert(
        "payload".to_string(),
        json!({
            "exportKind": export_kind,
            "rootRef": root_ref.clone(),
            "export": export,
        }),
    );
    if export_kind == "evidence_pack" {
        task_event.insert("evidenceRef".to_string(), json!(root_ref));
    } else {
        task_event.insert("artifactRef".to_string(), json!(root_ref));
    }
    Some(Value::Object(task_event))
}

fn build_harness_export_artifact_task_event(
    export_kind: &str,
    source_key: &str,
    index: usize,
    artifact: &Value,
) -> Option<Value> {
    let artifact_ref = json_string_field(artifact, &["relativePath", "relative_path"])?;
    let label = harness_export_kind_label(export_kind);
    let mut task_event = serde_json::Map::new();
    task_event.insert(
        "id".to_string(),
        json!(format!("harness:{export_kind}:{source_key}:{index}")),
    );
    task_event.insert("eventType".to_string(), json!("artifact:created"));
    task_event.insert("status".to_string(), json!("created"));
    task_event.insert("message".to_string(), json!(format!("{label} 制品已导出")));
    task_event.insert("artifactRef".to_string(), json!(artifact_ref));
    task_event.insert(
        "payload".to_string(),
        json!({
            "exportKind": export_kind,
            "source": source_key,
            "artifact": artifact,
        }),
    );
    Some(Value::Object(task_event))
}

fn build_harness_export_completion_verified_event(
    export_kind: &str,
    export: &Value,
) -> Option<Value> {
    if export_kind != "evidence_pack" {
        return None;
    }
    let completion_audit_summary = export
        .get("completionAuditSummary")
        .or_else(|| export.get("completion_audit_summary"))?;
    let decision = json_string_field(completion_audit_summary, &["decision"])?;
    if decision != "completed" {
        return None;
    }

    let evidence_ref = harness_export_root_ref(export_kind, export);
    let mut task_event = serde_json::Map::new();
    task_event.insert(
        "id".to_string(),
        json!("harness:evidence_pack:completion_audit"),
    );
    task_event.insert("eventType".to_string(), json!("evidence:verified"));
    task_event.insert("status".to_string(), json!(decision));
    task_event.insert("message".to_string(), json!("Evidence Pack 完成审计已通过"));
    task_event.insert("occurredAt".to_string(), json!(harness_exported_at(export)));
    task_event.insert(
        "payload".to_string(),
        json!({
            "exportKind": export_kind,
            "completionAuditSummary": completion_audit_summary,
        }),
    );
    if let Some(evidence_ref) = evidence_ref {
        task_event.insert("evidenceRef".to_string(), json!(evidence_ref));
    }
    Some(Value::Object(task_event))
}

fn build_harness_export_task_events(export_kind: &str, export: &Value) -> Vec<Value> {
    let mut task_events = Vec::new();
    if let Some(task_event) = build_harness_export_root_task_event(export_kind, export) {
        task_events.push(task_event);
    }
    if let Some(artifacts) = json_array_field(export, &["artifacts"]) {
        for (index, artifact) in artifacts.iter().enumerate() {
            if let Some(task_event) =
                build_harness_export_artifact_task_event(export_kind, "artifacts", index, artifact)
            {
                task_events.push(task_event);
            }
        }
    }
    if let Some(artifacts) = json_array_field(export, &["analysisArtifacts", "analysis_artifacts"])
    {
        for (index, artifact) in artifacts.iter().enumerate() {
            if let Some(task_event) = build_harness_export_artifact_task_event(
                export_kind,
                "analysisArtifacts",
                index,
                artifact,
            ) {
                task_events.push(task_event);
            }
        }
    }
    if let Some(task_event) = build_harness_export_completion_verified_event(export_kind, export) {
        task_events.push(task_event);
    }
    task_events
}

fn build_agent_app_runtime_harness_export_projection_payload(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
    export_kind: &str,
    export: &Value,
) -> Option<Value> {
    let scope = resolve_agent_app_runtime_export_projection_scope(detail, thread_read)?;
    let task_events = build_harness_export_task_events(export_kind, export);
    if task_events.is_empty() {
        return None;
    }
    let runtime_event_name = agent_app_runtime_export_event_name(&scope);
    let status = task_events
        .first()
        .and_then(|event| event.get("status").and_then(Value::as_str))
        .unwrap_or("created")
        .to_string();

    Some(json!({
        "type": "agent_app_runtime:harnessExportProjection",
        "eventType": "task:runtimeEvent",
        "appId": scope.app_id,
        "taskId": scope.task_id,
        "traceId": scope.trace_id,
        "taskKind": scope.task_kind,
        "sessionId": detail.id.clone(),
        "threadId": detail.thread_id.clone(),
        "status": status,
        "exportKind": export_kind,
        "harnessExport": export,
        "runtimeEvent": {
            "type": "harnessExport",
            "exportKind": export_kind,
            "result": export,
        },
        "taskEvents": task_events,
        "runtimeEventName": runtime_event_name,
        "emittedAt": chrono::Utc::now().to_rfc3339(),
    }))
}

fn emit_agent_app_runtime_harness_export_projection<T: serde::Serialize>(
    app: &AppHandle,
    context: &RuntimeExportContext,
    export_kind: &str,
    export: &T,
) {
    let Ok(export_value) = serde_json::to_value(export) else {
        tracing::warn!(
            "[AsterAgent][AgentAppRuntime] 序列化 Harness export projection 失败: export_kind={}",
            export_kind
        );
        return;
    };
    let Some(scope) =
        resolve_agent_app_runtime_export_projection_scope(&context.detail, &context.thread_read)
    else {
        return;
    };
    let Some(payload) = build_agent_app_runtime_harness_export_projection_payload(
        &context.detail,
        &context.thread_read,
        export_kind,
        &export_value,
    ) else {
        return;
    };
    let event_name = agent_app_runtime_export_event_name(&scope);
    if let Err(error) = app.emit(&event_name, payload) {
        tracing::warn!(
            "[AsterAgent][AgentAppRuntime] 发送 Harness export projection 失败: event_name={}, export_kind={}, error={}",
            event_name,
            export_kind,
            error
        );
    }
}

/// 统一运行时：导出当前会话的交接制品 bundle。
#[tauri::command]
pub async fn agent_runtime_export_handoff_bundle(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    session_id: String,
) -> Result<RuntimeHandoffBundleExportResult, String> {
    let runtime = build_runtime_command_context(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
    );
    tracing::info!("[AsterAgent] 导出 handoff bundle: {}", session_id);
    let context =
        load_runtime_export_context(&runtime, &session_id, "导出 handoff bundle 前").await?;

    export_runtime_handoff_bundle(
        &context.detail,
        &context.thread_read,
        &context.workspace_root,
    )
}

/// 统一运行时：导出当前会话的最小问题证据包。
#[tauri::command]
pub async fn agent_runtime_export_evidence_pack(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    session_id: String,
) -> Result<RuntimeEvidencePackExportResult, String> {
    let app_for_projection = app.clone();
    let db_handle = db.inner().clone();
    let evidence_locale = config_manager.0.config().language;
    let runtime = build_runtime_command_context(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
    );
    tracing::info!("[AsterAgent] 导出 evidence pack: {}", session_id);
    let context =
        load_runtime_export_context(&runtime, &session_id, "导出 evidence pack 前").await?;
    let owner_runs = {
        let conn = lock_db(&db_handle)?;
        AgentRunDao::list_runs_by_session(&conn, &session_id, 20)
            .map_err(|error| format!("查询 evidence pack owner runs 失败: {error}"))?
    };

    let export = export_runtime_evidence_pack_with_owner_runs_and_locale(
        &context.detail,
        &context.thread_read,
        &context.workspace_root,
        &owner_runs,
        Some(evidence_locale.as_str()),
    )?;
    emit_agent_app_runtime_harness_export_projection(
        &app_for_projection,
        &context,
        "evidence_pack",
        &export,
    );
    Ok(export)
}

/// 统一运行时：导出当前会话的外部分析交接包。
#[tauri::command]
pub async fn agent_runtime_export_analysis_handoff(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    session_id: String,
) -> Result<RuntimeAnalysisHandoffExportResult, String> {
    let app_for_projection = app.clone();
    let export_locale = config_manager.0.config().language;
    let runtime = build_runtime_command_context(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
    );
    tracing::info!("[AsterAgent] 导出 analysis handoff: {}", session_id);
    let context =
        load_runtime_export_context(&runtime, &session_id, "导出 analysis handoff 前").await?;

    let export = export_runtime_analysis_handoff_with_locale(
        &context.detail,
        &context.thread_read,
        &context.workspace_root,
        Some(export_locale.as_str()),
    )?;
    emit_agent_app_runtime_harness_export_projection(
        &app_for_projection,
        &context,
        "analysis_handoff",
        &export,
    );
    Ok(export)
}

/// 统一运行时：导出当前会话的人工审核记录模板。
#[tauri::command]
pub async fn agent_runtime_export_review_decision_template(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    session_id: String,
) -> Result<RuntimeReviewDecisionTemplateExportResult, String> {
    let app_for_projection = app.clone();
    let export_locale = config_manager.0.config().language;
    let runtime = build_runtime_command_context(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
    );
    tracing::info!("[AsterAgent] 导出 review decision 模板: {}", session_id);
    let context =
        load_runtime_export_context(&runtime, &session_id, "导出 review decision 模板前").await?;

    let export = export_runtime_review_decision_template_with_locale(
        &context.detail,
        &context.thread_read,
        &context.workspace_root,
        Some(export_locale.as_str()),
    )?;
    emit_agent_app_runtime_harness_export_projection(
        &app_for_projection,
        &context,
        "review_decision",
        &export,
    );
    Ok(export)
}

/// 统一运行时：保存当前会话的人工审核结果。
#[tauri::command]
pub async fn agent_runtime_save_review_decision(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    request: AgentRuntimeSaveReviewDecisionRequest,
) -> Result<RuntimeReviewDecisionTemplateExportResult, String> {
    let app_for_projection = app.clone();
    let export_locale = config_manager.0.config().language;
    let runtime = build_runtime_command_context(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
    );
    let session_id = request.session_id.trim().to_string();
    tracing::info!("[AsterAgent] 保存 review decision: {}", session_id);
    let context =
        load_runtime_export_context(&runtime, &session_id, "保存 review decision 前").await?;

    let saved = save_runtime_review_decision_with_locale(
        &context.detail,
        &context.thread_read,
        &context.workspace_root,
        RuntimeReviewDecisionContent {
            decision_status: request.decision_status,
            decision_summary: request.decision_summary,
            chosen_fix_strategy: request.chosen_fix_strategy,
            risk_level: request.risk_level,
            risk_tags: request.risk_tags,
            human_reviewer: request.human_reviewer,
            reviewed_at: request.reviewed_at,
            followup_actions: request.followup_actions,
            regression_requirements: request.regression_requirements,
            notes: request.notes,
        },
        Some(export_locale.as_str()),
    )?;

    emit_agent_app_runtime_harness_export_projection(
        &app_for_projection,
        &context,
        "review_decision",
        &saved,
    );
    Ok(saved)
}

/// 统一运行时：导出当前会话的 replay case。
#[tauri::command]
pub async fn agent_runtime_export_replay_case(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    session_id: String,
) -> Result<RuntimeReplayCaseExportResult, String> {
    let export_locale = config_manager.0.config().language;
    let runtime = build_runtime_command_context(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
    );
    tracing::info!("[AsterAgent] 导出 replay case: {}", session_id);
    let context = load_runtime_export_context(&runtime, &session_id, "导出 replay case 前").await?;

    export_runtime_replay_case_with_locale(
        &context.detail,
        &context.thread_read,
        &context.workspace_root,
        Some(export_locale.as_str()),
    )
}

/// 统一运行时：重新拉起指定 pending request 的前端交互载荷。
#[tauri::command]
pub async fn agent_runtime_replay_request(
    db: State<'_, DbConnection>,
    request: AgentRuntimeReplayRequestRequest,
) -> Result<Option<AgentRuntimeReplayedActionRequiredView>, String> {
    let session_id = request.session_id.trim().to_string();
    let request_id = request.request_id.trim().to_string();
    if session_id.is_empty() || request_id.is_empty() {
        return Ok(None);
    }

    let detail = AsterAgentWrapper::get_runtime_session_detail(db.inner(), &session_id).await?;
    Ok(AgentRuntimeReplayedActionRequiredView::from_session_detail(
        &detail,
        &request_id,
    ))
}

/// 统一运行时：获取工具库存快照。
#[tauri::command]
pub async fn agent_runtime_get_tool_inventory(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    request: Option<AgentRuntimeToolInventoryRequest>,
) -> Result<crate::agent_tools::inventory::AgentToolInventorySnapshot, String> {
    let request = request.unwrap_or_default();
    let caller = lime_core::tool_calling::normalize_tool_caller(request.caller.as_deref())
        .unwrap_or_else(|| "assistant".to_string());
    let surface = match (request.workbench, request.browser_assist) {
        (true, true) => WorkspaceToolSurface::workbench_with_browser_assist(),
        (true, false) => WorkspaceToolSurface::workbench(),
        (false, true) => WorkspaceToolSurface::browser_assist(),
        (false, false) => WorkspaceToolSurface::core(),
    };
    let mut warnings = Vec::new();

    if state.is_initialized().await {
        match tokio::time::timeout(
            TOOL_INVENTORY_AUX_TIMEOUT,
            ensure_runtime_support_tools_registered(
                &app,
                state.inner(),
                db.inner(),
                api_key_provider_service.inner(),
                mcp_manager.inner(),
            ),
        )
        .await
        {
            Ok(Ok(())) => {}
            Ok(Err(error)) => warnings.push(format!("同步 runtime support tools 失败: {error}")),
            Err(_) => warnings
                .push("同步 runtime support tools 超时，已使用当前 registry 快照".to_string()),
        }
    }

    let (mcp_server_names, mcp_tools) = {
        let manager = mcp_manager.lock().await;
        let server_names =
            match tokio::time::timeout(TOOL_INVENTORY_AUX_TIMEOUT, manager.get_running_servers())
                .await
            {
                Ok(server_names) => server_names,
                Err(_) => {
                    warnings.push("读取 MCP 服务列表超时，已跳过 MCP 服务快照".to_string());
                    Vec::new()
                }
            };
        let tools =
            match tokio::time::timeout(TOOL_INVENTORY_AUX_TIMEOUT, manager.list_tools()).await {
                Ok(Ok(tools)) => tools,
                Ok(Err(error)) => {
                    warnings.push(format!("读取 MCP 工具列表失败: {error}"));
                    Vec::new()
                }
                Err(_) => {
                    warnings.push("读取 MCP 工具列表超时，已跳过 MCP 工具快照".to_string());
                    Vec::new()
                }
            };
        (server_names, tools)
    };

    let agent_arc = state.get_agent_arc();
    let guard = match tokio::time::timeout(TOOL_INVENTORY_AUX_TIMEOUT, agent_arc.read()).await {
        Ok(guard) => guard,
        Err(_) => {
            warnings.push("读取 Aster Agent 状态超时，runtime registry 快照为空".to_string());
            return Ok(build_tool_inventory(AgentToolInventoryBuildInput {
                surface,
                caller,
                agent_initialized: false,
                warnings,
                persisted_execution_policy: Some(config_manager.config().agent.tool_execution),
                request_metadata: request.metadata.clone(),
                mcp_server_names,
                mcp_tools,
                registry_definitions: Vec::new(),
                current_surface_tool_names: Vec::new(),
                extension_configs: Vec::new(),
                visible_extension_tools: Vec::new(),
                searchable_extension_tools: Vec::new(),
            }));
        }
    };
    let Some(agent) = guard.as_ref() else {
        warnings.push("Aster Agent 尚未初始化，runtime registry / extension 快照为空".to_string());
        return Ok(build_tool_inventory(AgentToolInventoryBuildInput {
            surface,
            caller,
            agent_initialized: false,
            warnings,
            persisted_execution_policy: Some(config_manager.config().agent.tool_execution),
            request_metadata: request.metadata.clone(),
            mcp_server_names,
            mcp_tools,
            registry_definitions: Vec::new(),
            current_surface_tool_names: Vec::new(),
            extension_configs: Vec::new(),
            visible_extension_tools: Vec::new(),
            searchable_extension_tools: Vec::new(),
        }));
    };

    let registry_arc = agent.tool_registry().clone();
    let registry = match tokio::time::timeout(TOOL_INVENTORY_AUX_TIMEOUT, registry_arc.read()).await
    {
        Ok(registry) => registry,
        Err(_) => {
            warnings.push("读取 runtime registry 超时，已返回空 registry 快照".to_string());
            return Ok(build_tool_inventory(AgentToolInventoryBuildInput {
                surface,
                caller,
                agent_initialized: true,
                warnings,
                persisted_execution_policy: Some(config_manager.config().agent.tool_execution),
                request_metadata: request.metadata.clone(),
                mcp_server_names,
                mcp_tools,
                registry_definitions: Vec::new(),
                current_surface_tool_names: Vec::new(),
                extension_configs: Vec::new(),
                visible_extension_tools: Vec::new(),
                searchable_extension_tools: Vec::new(),
            }));
        }
    };
    let mut registry_definitions = registry.get_definitions();
    drop(registry);

    let existing_runtime_tool_names = registry_definitions
        .iter()
        .map(|definition| definition.name.clone())
        .collect::<std::collections::HashSet<_>>();
    let mut current_surface_tool_names = Vec::new();
    for definition in crate::commands::aster_agent_cmd::tool_runtime::list_current_surface_tool_definitions_from_agent(agent)
        .await
    {
        if existing_runtime_tool_names.contains(&definition.name) {
            continue;
        }

        current_surface_tool_names.push(definition.name.clone());
        registry_definitions.push(definition);
    }

    let extension_configs = agent.get_extension_configs().await;
    let extension_manager = agent.extension_manager.clone();
    let visible_extension_tools = match tokio::time::timeout(
        TOOL_INVENTORY_AUX_TIMEOUT,
        extension_manager.get_prefixed_tools(None),
    )
    .await
    {
        Ok(Ok(tools)) => tools
            .into_iter()
            .map(|tool| ExtensionToolInventorySeed {
                name: tool.name.to_string(),
                description: tool.description.clone().unwrap_or_default().to_string(),
            })
            .collect(),
        Ok(Err(error)) => {
            warnings.push(format!("读取已加载 extension tools 失败: {error}"));
            Vec::new()
        }
        Err(_) => {
            warnings.push("读取已加载 extension tools 超时，已跳过 extension 工具快照".to_string());
            Vec::new()
        }
    };
    let searchable_extension_tools = match tokio::time::timeout(
        TOOL_INVENTORY_AUX_TIMEOUT,
        extension_manager.get_prefixed_tools_for_search(None),
    )
    .await
    {
        Ok(Ok(tools)) => tools
            .into_iter()
            .map(|tool| ExtensionToolInventorySeed {
                name: tool.name.to_string(),
                description: tool.description.clone().unwrap_or_default().to_string(),
            })
            .collect(),
        Ok(Err(error)) => {
            warnings.push(format!("读取 extension 搜索工具面失败: {error}"));
            Vec::new()
        }
        Err(_) => {
            warnings.push("读取 extension 搜索工具面超时，已跳过 extension 搜索快照".to_string());
            Vec::new()
        }
    };

    Ok(build_tool_inventory(AgentToolInventoryBuildInput {
        surface,
        caller,
        agent_initialized: true,
        warnings,
        persisted_execution_policy: Some(config_manager.config().agent.tool_execution),
        request_metadata: request.metadata.clone(),
        mcp_server_names,
        mcp_tools,
        registry_definitions,
        current_surface_tool_names,
        extension_configs,
        visible_extension_tools,
        searchable_extension_tools,
    }))
}

/// 统一运行时：获取当前 workspace 的 generated skill runtime binding readiness。
#[tauri::command]
pub async fn agent_runtime_list_workspace_skill_bindings(
    request: AgentRuntimeListWorkspaceSkillBindingsRequest,
) -> Result<AgentRuntimeWorkspaceSkillBindings, String> {
    crate::services::runtime_skill_binding_service::list_workspace_skill_bindings(request)
}

/// 统一运行时：移除单个排队 turn。
#[tauri::command]
pub async fn agent_runtime_remove_queued_turn(
    app: AppHandle,
    request: AgentRuntimeRemoveQueuedTurnRequest,
) -> Result<bool, String> {
    let session_id = request.session_id.trim().to_string();
    let queued_turn_id = request.queued_turn_id.trim().to_string();
    if session_id.is_empty() || queued_turn_id.is_empty() {
        return Ok(false);
    }

    remove_runtime_queued_turn_service(&app, &session_id, &queued_turn_id).await
}

/// 统一运行时：将指定排队 turn 提前到下一条执行。
#[tauri::command]
pub async fn agent_runtime_promote_queued_turn(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
    request: AgentRuntimePromoteQueuedTurnRequest,
) -> Result<bool, String> {
    let runtime = build_runtime_command_context(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
    );
    let session_id = request.session_id.trim().to_string();
    let queued_turn_id = request.queued_turn_id.trim().to_string();
    if session_id.is_empty() || queued_turn_id.is_empty() {
        return Ok(false);
    }

    let promoted = promote_runtime_queued_turn_service(&session_id, &queued_turn_id).await?;
    if !promoted {
        return Ok(false);
    }

    let _ = runtime.state().cancel_session(&session_id).await;
    let _ = runtime.resume_runtime_queue_if_needed(session_id).await?;

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn detail_with_turn_status(status: AgentThreadTurnStatus) -> lime_agent::SessionDetail {
        lime_agent::SessionDetail {
            id: "session-runtime-queue".to_string(),
            name: "队列快路径判定".to_string(),
            created_at: 0,
            updated_at: 0,
            thread_id: "session-runtime-queue".to_string(),
            model: Some("agent:test".to_string()),
            working_dir: None,
            workspace_id: None,
            messages: Vec::new(),
            execution_strategy: Some("react".to_string()),
            execution_runtime: None,
            turns: vec![lime_core::database::dao::agent_timeline::AgentThreadTurn {
                id: "turn-runtime-queue".to_string(),
                thread_id: "session-runtime-queue".to_string(),
                prompt_text: "测试".to_string(),
                status,
                started_at: "2026-03-18T08:00:00Z".to_string(),
                completed_at: None,
                error_message: None,
                created_at: "2026-03-18T08:00:00Z".to_string(),
                updated_at: "2026-03-18T08:00:00Z".to_string(),
            }],
            items: Vec::new(),
            todo_items: Vec::new(),
            child_subagent_sessions: Vec::new(),
            subagent_parent_context: None,
        }
    }

    fn thread_read_for_harness_projection(runtime_summary: Value) -> AgentRuntimeThreadReadModel {
        AgentRuntimeThreadReadModel {
            thread_id: "thread-agent-app".to_string(),
            status: "completed".to_string(),
            profile_status: "completed".to_string(),
            active_turn_id: None,
            turns: Vec::new(),
            pending_requests: Vec::new(),
            last_outcome: None,
            incidents: Vec::new(),
            queued_turns: Vec::new(),
            tool_calls: Vec::new(),
            artifacts: Vec::new(),
            model_routing: None,
            evidence_summary: Default::default(),
            telemetry_summary: Default::default(),
            context_summary: None,
            interrupt_state: None,
            updated_at: None,
            latest_compaction_boundary: None,
            file_checkpoint_summary: None,
            diagnostics: None,
            task_kind: None,
            service_model_slot: None,
            routing_mode: None,
            decision_source: None,
            decision_reason: None,
            candidate_count: None,
            fallback_chain: None,
            capability_gap: None,
            estimated_cost_class: None,
            single_candidate_only: None,
            oem_policy: None,
            runtime_summary: Some(runtime_summary),
            auxiliary_task_runtime: None,
            limit_state: None,
            cost_state: None,
            permission_state: None,
            limit_event: None,
            managed_objective: None,
        }
    }

    #[test]
    fn normalize_runtime_session_history_limit_should_default_to_open_tail() {
        assert_eq!(
            normalize_runtime_session_history_limit(None),
            Some(RUNTIME_SESSION_OPEN_HISTORY_LIMIT)
        );
    }

    #[test]
    fn normalize_runtime_session_history_limit_should_keep_zero_as_full_history() {
        assert_eq!(normalize_runtime_session_history_limit(Some(0)), None);
    }

    #[test]
    fn normalize_runtime_session_history_limit_should_clamp_large_values() {
        assert_eq!(
            normalize_runtime_session_history_limit(Some(9_999)),
            Some(RUNTIME_SESSION_MAX_HISTORY_LIMIT)
        );
    }

    #[test]
    fn normalize_runtime_session_history_offset_should_ignore_full_history() {
        assert_eq!(normalize_runtime_session_history_offset(None, Some(120)), 0);
    }

    #[test]
    fn normalize_runtime_session_history_offset_should_keep_limited_offset() {
        assert_eq!(
            normalize_runtime_session_history_offset(Some(50), Some(40)),
            40
        );
    }

    #[test]
    fn normalize_runtime_session_history_before_message_id_should_ignore_full_history() {
        assert_eq!(
            normalize_runtime_session_history_before_message_id(None, Some(120)),
            None
        );
    }

    #[test]
    fn normalize_runtime_session_history_before_message_id_should_keep_positive_cursor() {
        assert_eq!(
            normalize_runtime_session_history_before_message_id(Some(50), Some(120)),
            Some(120)
        );
    }

    #[test]
    fn should_skip_runtime_queue_snapshots_for_completed_limited_history() {
        let detail = detail_with_turn_status(AgentThreadTurnStatus::Completed);

        assert!(!should_list_runtime_queue_snapshots(
            &detail,
            Some(80),
            0,
            None
        ));
    }

    #[test]
    fn should_list_runtime_queue_snapshots_for_running_limited_history() {
        let detail = detail_with_turn_status(AgentThreadTurnStatus::Running);

        assert!(should_list_runtime_queue_snapshots(
            &detail,
            Some(80),
            0,
            None
        ));
    }

    #[test]
    fn should_skip_runtime_queue_snapshots_for_older_history_page() {
        let detail = detail_with_turn_status(AgentThreadTurnStatus::Running);

        assert!(!should_list_runtime_queue_snapshots(
            &detail,
            Some(80),
            40,
            None
        ));
    }

    #[test]
    fn should_skip_runtime_queue_snapshots_for_cursor_history_page() {
        let detail = detail_with_turn_status(AgentThreadTurnStatus::Running);

        assert!(!should_list_runtime_queue_snapshots(
            &detail,
            Some(80),
            0,
            Some(120)
        ));
    }

    #[test]
    fn should_list_runtime_queue_snapshots_for_full_history() {
        let detail = detail_with_turn_status(AgentThreadTurnStatus::Completed);

        assert!(should_list_runtime_queue_snapshots(&detail, None, 0, None));
    }

    #[test]
    fn agent_app_runtime_export_projection_extracts_scope_from_runtime_summary() {
        let scope = agent_app_runtime_export_scope_from_runtime_summary_value(Some(&json!({
            "surface": "agent_app",
            "appId": "content-factory-app",
            "taskId": "task-1",
            "traceId": "trace-1",
            "taskKind": "content_factory.copy.generate"
        })))
        .expect("agent app scope");

        assert_eq!(scope.app_id, "content-factory-app");
        assert_eq!(scope.task_id, "task-1");
        assert_eq!(scope.trace_id.as_deref(), Some("trace-1"));
        assert_eq!(
            scope.task_kind.as_deref(),
            Some("content_factory.copy.generate")
        );
        assert!(
            agent_app_runtime_export_scope_from_runtime_summary_value(Some(&json!({
                "surface": "chat",
                "appId": "content-factory-app",
                "taskId": "task-1"
            })))
            .is_none()
        );
    }

    #[test]
    fn agent_app_runtime_harness_export_projection_builds_evidence_task_events() {
        let detail = detail_with_turn_status(AgentThreadTurnStatus::Completed);
        let thread_read = thread_read_for_harness_projection(json!({
            "surface": "agent_app",
            "appId": "content-factory-app",
            "taskId": "task-1",
            "traceId": "trace-1",
            "taskKind": "content_factory.copy.generate"
        }));
        let export = json!({
            "sessionId": detail.id.clone(),
            "threadId": detail.thread_id.clone(),
            "packRelativeRoot": ".lime/harness/sessions/session-runtime-queue/evidence",
            "exportedAt": "2026-05-16T00:00:00Z",
            "completionAuditSummary": {
                "source": "runtime_evidence_pack_completion_audit",
                "decision": "completed"
            },
            "artifacts": [
                {
                    "kind": "summary",
                    "title": "Evidence summary",
                    "relativePath": ".lime/harness/sessions/session-runtime-queue/evidence/summary.md"
                }
            ]
        });

        let payload = build_agent_app_runtime_harness_export_projection_payload(
            &detail,
            &thread_read,
            "evidence_pack",
            &export,
        )
        .expect("projection payload");
        let task_events = payload
            .get("taskEvents")
            .and_then(Value::as_array)
            .expect("task events");

        assert_eq!(
            payload.get("type"),
            Some(&json!("agent_app_runtime:harnessExportProjection"))
        );
        assert_eq!(
            payload.get("runtimeEventName"),
            Some(&json!("agent_app_runtime:content-factory-app:task-1"))
        );
        assert!(task_events
            .iter()
            .any(|event| event.get("eventType") == Some(&json!("evidence:recorded"))));
        assert!(task_events
            .iter()
            .any(|event| event.get("eventType") == Some(&json!("artifact:created"))));
        assert!(task_events
            .iter()
            .any(|event| event.get("eventType") == Some(&json!("evidence:verified"))));
    }

    #[test]
    fn agent_app_runtime_harness_export_projection_builds_review_artifact_events() {
        let detail = detail_with_turn_status(AgentThreadTurnStatus::Completed);
        let thread_read = thread_read_for_harness_projection(json!({
            "surface": "agent_app",
            "appId": "content-factory-app",
            "taskId": "task-review"
        }));
        let export = json!({
            "sessionId": detail.id.clone(),
            "threadId": detail.thread_id.clone(),
            "reviewRelativeRoot": ".lime/harness/sessions/session-runtime-queue/review",
            "exportedAt": "2026-05-16T00:00:00Z",
            "analysisArtifacts": [
                {
                    "kind": "analysis_brief",
                    "title": "Analysis brief",
                    "relativePath": ".lime/harness/sessions/session-runtime-queue/analysis/analysis-brief.md"
                }
            ],
            "artifacts": [
                {
                    "kind": "review_decision_markdown",
                    "title": "Review decision",
                    "relativePath": ".lime/harness/sessions/session-runtime-queue/review/review-decision.md"
                }
            ]
        });

        let payload = build_agent_app_runtime_harness_export_projection_payload(
            &detail,
            &thread_read,
            "review_decision",
            &export,
        )
        .expect("review projection payload");
        let task_events = payload
            .get("taskEvents")
            .and_then(Value::as_array)
            .expect("task events");

        assert_eq!(
            task_events
                .first()
                .and_then(|event| event.get("eventType"))
                .and_then(Value::as_str),
            Some("artifact:created")
        );
        assert_eq!(
            task_events
                .iter()
                .filter(|event| event.get("eventType") == Some(&json!("artifact:created")))
                .count(),
            3
        );
    }

    #[test]
    fn latest_model_delta_timing_from_run_should_project_agent_run_metadata() {
        let run = AgentRun {
            id: "run-ttft-1".to_string(),
            source: "chat".to_string(),
            source_ref: Some("turn-1".to_string()),
            session_id: Some("session-ttft".to_string()),
            status: lime_core::database::dao::agent_run::AgentRunStatus::Success,
            started_at: "2026-05-12T02:48:34Z".to_string(),
            finished_at: Some("2026-05-12T02:48:36Z".to_string()),
            duration_ms: Some(1386),
            error_code: None,
            error_message: None,
            metadata: Some(
                json!({
                    "model_first_visible_delta_ms": 986,
                    "model_first_thinking_delta_ms": 986,
                    "model_first_text_delta_ms": 1377,
                    "request_metadata": {
                        "lime_runtime": {
                            "routing_decision": {
                                "decisionSource": "responsive_chat_auto",
                                "decisionReason": "service_models.responsive_chat 历史样本不满足低延迟目标，已继续进入自动 responsive_chat 候选。",
                                "fallbackChain": ["deepseek:deepseek-v4-pro", "deepseek:deepseek-v4-flash"],
                                "settingsSource": "service_models.responsive_chat:auto",
                                "serviceModelSlot": "responsive_chat",
                                "selectedProvider": "deepseek",
                                "selectedModel": "deepseek-v4-flash"
                            }
                        }
                    }
                })
                .to_string(),
            ),
            created_at: "2026-05-12T02:48:34Z".to_string(),
            updated_at: "2026-05-12T02:48:36Z".to_string(),
        };

        let timing = latest_model_delta_timing_from_run(&run).expect("应投影首字证据");

        assert_eq!(timing["source"], "agent_runs.metadata");
        assert_eq!(timing["runId"], "run-ttft-1");
        assert_eq!(timing["firstTextDeltaMs"], 1377);
        assert_eq!(timing["routing"]["decisionSource"], "responsive_chat_auto");
        assert_eq!(
            timing["routing"]["decisionReason"],
            "service_models.responsive_chat 历史样本不满足低延迟目标，已继续进入自动 responsive_chat 候选。"
        );
        assert_eq!(
            timing["routing"]["fallbackChain"],
            json!(["deepseek:deepseek-v4-pro", "deepseek:deepseek-v4-flash"])
        );
        assert_eq!(timing["routing"]["serviceModelSlot"], "responsive_chat");
        assert_eq!(timing["routing"]["selectedModel"], "deepseek-v4-flash");
    }

    #[test]
    fn merge_latest_model_delta_timing_should_keep_existing_model_routing() {
        let mut thread_read = AgentRuntimeThreadReadModel {
            thread_id: "thread-ttft".to_string(),
            status: "completed".to_string(),
            profile_status: "completed".to_string(),
            active_turn_id: None,
            turns: Vec::new(),
            pending_requests: Vec::new(),
            last_outcome: None,
            incidents: Vec::new(),
            queued_turns: Vec::new(),
            tool_calls: Vec::new(),
            artifacts: Vec::new(),
            model_routing: Some(json!({
                "decisionSource": "responsive_chat_auto",
                "selectedModel": "deepseek-v4-flash"
            })),
            evidence_summary: Default::default(),
            telemetry_summary: Default::default(),
            context_summary: None,
            interrupt_state: None,
            updated_at: None,
            latest_compaction_boundary: None,
            file_checkpoint_summary: None,
            diagnostics: None,
            task_kind: None,
            service_model_slot: None,
            routing_mode: None,
            decision_source: None,
            decision_reason: None,
            candidate_count: None,
            fallback_chain: None,
            capability_gap: None,
            estimated_cost_class: None,
            single_candidate_only: None,
            oem_policy: None,
            runtime_summary: None,
            auxiliary_task_runtime: None,
            limit_state: None,
            cost_state: None,
            permission_state: None,
            limit_event: None,
            managed_objective: None,
        };

        merge_latest_model_delta_timing_into_thread_read(
            &mut thread_read,
            json!({
                "source": "agent_runs.metadata",
                "firstTextDeltaMs": 1244
            }),
        );

        let model_routing = thread_read
            .model_routing
            .as_ref()
            .and_then(Value::as_object)
            .expect("应保留 model_routing");
        assert_eq!(model_routing["decisionSource"], "responsive_chat_auto");
        assert_eq!(model_routing["selectedModel"], "deepseek-v4-flash");
        assert_eq!(
            model_routing["latestModelDeltaTiming"]["firstTextDeltaMs"],
            1244
        );
    }
}
