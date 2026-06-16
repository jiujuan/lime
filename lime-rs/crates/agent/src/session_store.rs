//! Agent 会话存储服务
//!
//! 提供会话创建、列表查询、详情查询能力。
//! 数据事实源收敛到 lime_core::database::agent_session_repository + Lime 数据库。

use aster::model::ModelConfig;
use aster::session::{ExtensionState, Session as AsterSession};
#[cfg(test)]
use chrono::DateTime;
use chrono::Utc;
use lime_core::agent::types::AgentSession;
#[cfg(test)]
use lime_core::agent::types::{AgentMessage, ContentPart, MessageContent};
use lime_core::database::agent_session_repository::{
    self, SessionRecordDetail, SessionRecordMetadata,
};
use lime_core::database::dao::agent::SessionArchiveFilter;
use lime_core::database::dao::agent_timeline::AgentTimelineDao;
#[cfg(test)]
use lime_core::database::dao::agent_timeline::{AgentThreadTurn, AgentThreadTurnStatus};
use lime_core::database::DbConnection;
use lime_core::workspace::WorkspaceManager;
use lime_services::aster_session_store::LimeSessionStore;
use std::time::Instant;
use uuid::Uuid;

use crate::execution_strategy_compat::normalize_execution_strategy_to_react;
#[cfg(test)]
use crate::protocol::AgentMessageContent as RuntimeAgentMessageContent;

#[cfg(test)]
#[path = "session_store_history_visibility.rs"]
mod session_store_history_visibility;
#[cfg(test)]
#[path = "session_store_message_projection.rs"]
mod session_store_message_projection;
#[path = "session_store_runtime_detail.rs"]
mod session_store_runtime_detail;
#[path = "session_store_runtime_projection.rs"]
mod session_store_runtime_projection;
#[path = "session_store_subagent_context.rs"]
mod session_store_subagent_context;
#[path = "session_store_todo_projection.rs"]
mod session_store_todo_projection;
#[path = "session_store_types.rs"]
mod session_store_types;

#[cfg(test)]
use self::session_store_message_projection::{
    convert_agent_message, convert_agent_messages, convert_user_visible_agent_messages,
    parse_tool_call_arguments,
};
pub use self::session_store_runtime_detail::{
    get_runtime_session_detail, get_runtime_session_detail_with_history_limit,
    get_runtime_session_detail_with_history_page, get_runtime_session_detail_with_history_window,
};
use self::session_store_runtime_projection::build_runtime_session_info;

#[cfg(test)]
use self::session_store_subagent_context::{
    apply_runtime_status_to_child_subagent_session, build_child_subagent_session_summaries,
    build_child_subagent_session_summary, build_subagent_parent_context,
    resolve_child_subagent_runtime_status_from_snapshot, should_load_runtime_overlay,
    should_load_runtime_overlay_at, should_load_subagent_runtime_context,
    SubagentPresentationProjection,
};
pub use self::session_store_subagent_context::{
    ChildSubagentRuntimeStatus, ChildSubagentSession, SubagentParentContext,
};
use self::session_store_todo_projection::load_session_todo_items_from_conn;
use self::session_store_types::{
    normalize_optional_nonempty_body, normalize_optional_text, CreateSessionRecordInput,
};
pub use self::session_store_types::{
    PersistedSessionMetadata, SessionDetail, SessionInfo, SessionTitlePreviewMessage,
    SessionTodoItem, SessionTodoStatus,
};
#[cfg(test)]
use crate::subagent_control::SubagentRuntimeStatusKind;
#[cfg(test)]
use crate::subagent_profiles::{SubagentCustomizationState, SubagentSkillSummary};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct SessionProviderRoutingState {
    provider_selector: String,
}

impl ExtensionState for SessionProviderRoutingState {
    const EXTENSION_NAME: &'static str = "lime_provider_routing";
    const VERSION: &'static str = "v0";
}

fn resolve_session_provider_selector(session: &AsterSession) -> Option<String> {
    SessionProviderRoutingState::from_extension_data(&session.extension_data)
        .and_then(|state| normalize_optional_text(Some(state.provider_selector)))
}

/// 解析会话 working_dir（优先入参，其次 workspace_id）
fn resolve_session_working_dir(
    db: &DbConnection,
    working_dir: Option<String>,
    workspace_id: String,
) -> Result<Option<String>, String> {
    if let Some(path) = working_dir {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return Ok(Some(trimmed.to_string()));
        }
    }

    let workspace_id = workspace_id.trim().to_string();
    if workspace_id.is_empty() {
        return Err("workspace_id 必填，请先选择项目工作区".to_string());
    }

    let manager = WorkspaceManager::new(db.clone());
    if let Some(workspace) = manager.get(&workspace_id)? {
        return Ok(Some(workspace.root_path.to_string_lossy().to_string()));
    }

    Err(format!("Workspace 不存在: {}", workspace_id))
}

fn resolve_optional_session_working_dir(
    db: &DbConnection,
    working_dir: Option<String>,
    workspace_id: Option<String>,
) -> Result<Option<String>, String> {
    if let Some(path) = normalize_optional_text(working_dir) {
        return Ok(Some(path));
    }

    if let Some(workspace_id) = normalize_optional_text(workspace_id) {
        return resolve_session_working_dir(db, None, workspace_id);
    }

    Ok(None)
}

/// 创建并持久化会话记录
pub(crate) fn create_session_record_sync(
    db: &DbConnection,
    input: CreateSessionRecordInput,
) -> Result<AgentSession, String> {
    let now = Utc::now().to_rfc3339();
    let session = AgentSession {
        id: normalize_optional_text(input.session_id).unwrap_or_else(|| Uuid::new_v4().to_string()),
        model: normalize_optional_text(input.model).unwrap_or_else(|| "agent:default".to_string()),
        messages: Vec::new(),
        system_prompt: normalize_optional_nonempty_body(input.system_prompt),
        title: normalize_optional_text(input.title),
        working_dir: resolve_optional_session_working_dir(
            db,
            input.working_dir,
            input.workspace_id,
        )?,
        execution_strategy: Some(normalize_execution_strategy_to_react(
            input.execution_strategy.as_deref(),
        )),
        created_at: now.clone(),
        updated_at: now,
    };

    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
    agent_session_repository::create_session(&conn, &session)?;

    Ok(session)
}

/// 创建新会话
pub fn create_session_sync(
    db: &DbConnection,
    name: Option<String>,
    working_dir: Option<String>,
    workspace_id: String,
    execution_strategy: Option<String>,
) -> Result<String, String> {
    let session = create_session_record_sync(
        db,
        CreateSessionRecordInput {
            title: Some(normalize_optional_text(name).unwrap_or_else(|| "新对话".to_string())),
            working_dir,
            workspace_id: Some(workspace_id),
            execution_strategy,
            ..CreateSessionRecordInput::default()
        },
    )?;

    Ok(session.id)
}

/// 使用指定 ID 创建新会话。
///
/// 仅供内部运行时为非用户可见的辅助会话保留稳定前缀，普通入口应继续使用
/// `create_session_sync` 生成随机会话 ID。
pub fn create_session_with_id_sync(
    db: &DbConnection,
    session_id: String,
    name: Option<String>,
    working_dir: Option<String>,
    workspace_id: String,
    execution_strategy: Option<String>,
) -> Result<String, String> {
    let session_id = normalize_optional_text(Some(session_id))
        .ok_or_else(|| "session_id 不能为空".to_string())?;
    let session = create_session_record_sync(
        db,
        CreateSessionRecordInput {
            session_id: Some(session_id),
            title: Some(normalize_optional_text(name).unwrap_or_else(|| "新对话".to_string())),
            working_dir,
            workspace_id: Some(workspace_id),
            execution_strategy,
            ..CreateSessionRecordInput::default()
        },
    )?;

    Ok(session.id)
}

/// 列出所有会话
pub fn list_sessions_sync(
    db: &DbConnection,
    archive_filter: SessionArchiveFilter,
    cwd_filters: &[String],
    limit: Option<usize>,
) -> Result<Vec<SessionInfo>, String> {
    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
    let sessions = agent_session_repository::list_session_overviews(
        &conn,
        archive_filter,
        cwd_filters,
        limit,
    )?;

    Ok(sessions
        .into_iter()
        .map(build_runtime_session_info)
        .collect())
}

pub fn get_persisted_session_metadata_sync(
    db: &DbConnection,
    session_id: &str,
) -> Result<Option<PersistedSessionMetadata>, String> {
    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
    let session = agent_session_repository::get_persisted_session_metadata(&conn, session_id)?;

    Ok(
        session.map(|metadata: SessionRecordMetadata| PersistedSessionMetadata {
            system_prompt: metadata.system_prompt,
            working_dir: metadata.working_dir,
            execution_strategy: metadata.execution_strategy,
        }),
    )
}

pub fn list_title_preview_messages_sync(
    db: &DbConnection,
    session_id: &str,
    limit: usize,
) -> Result<Vec<SessionTitlePreviewMessage>, String> {
    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
    let _ = (session_id, limit);
    drop(conn);
    Ok(Vec::new())
}

/// 获取会话详情
pub fn get_session_sync(db: &DbConnection, session_id: &str) -> Result<SessionDetail, String> {
    get_session_sync_with_history_limit(db, session_id, None)
}

pub fn count_session_messages_sync(db: &DbConnection, session_id: &str) -> Result<usize, String> {
    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
    agent_session_repository::count_session_messages(&conn, session_id)
}

/// 获取会话 timeline 详情，但不读取/投影 messages。
///
/// 文件 checkpoint、evidence 索引等只依赖 timeline item；走完整消息投影会触发
/// 历史 tool I/O token 估算，既慢，也会把轻量命令耦合到 tokenizer 初始化。
pub fn get_session_sync_with_full_timeline_without_messages(
    db: &DbConnection,
    session_id: &str,
) -> Result<SessionDetail, String> {
    let started_at = Instant::now();
    let (session_detail, turns, items, todo_items, session_ms, turns_ms, items_ms, todo_ms) = {
        let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;

        let session_started_at = Instant::now();
        let session_detail =
            agent_session_repository::get_session_without_messages(&conn, session_id)
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("会话不存在: {session_id}"))?;
        let session_ms = session_started_at.elapsed().as_millis();

        let turns_started_at = Instant::now();
        let turns = AgentTimelineDao::list_turns_by_thread(&conn, session_id)
            .map_err(|e| format!("获取 turn 历史失败: {e}"))?;
        let turns_ms = turns_started_at.elapsed().as_millis();

        let items_started_at = Instant::now();
        let items = AgentTimelineDao::list_items_by_thread(&conn, session_id)
            .map_err(|e| format!("获取 item 历史失败: {e}"))?;
        let items_ms = items_started_at.elapsed().as_millis();

        let todo_started_at = Instant::now();
        let todo_items = load_session_todo_items_from_conn(&conn, session_id);
        let todo_ms = todo_started_at.elapsed().as_millis();

        (
            session_detail,
            turns,
            items,
            todo_items,
            session_ms,
            turns_ms,
            items_ms,
            todo_ms,
        )
    };

    let SessionRecordDetail {
        session,
        workspace_id,
    } = session_detail;
    let total_ms = started_at.elapsed().as_millis();

    tracing::info!(
        "[SessionStore] get_session_sync_without_messages 完成: session_id={}, total_ms={}, session_ms={}, turns_ms={}, items_ms={}, todo_ms={}, turns_count={}, items_count={}, todo_count={}",
        session_id,
        total_ms,
        session_ms,
        turns_ms,
        items_ms,
        todo_ms,
        turns.len(),
        items.len(),
        todo_items.len(),
    );

    Ok(SessionDetail {
        id: session.id,
        name: session.title.unwrap_or_else(|| "未命名".to_string()),
        created_at: chrono::DateTime::parse_from_rfc3339(&session.created_at)
            .map(|dt| dt.timestamp())
            .unwrap_or(0),
        updated_at: chrono::DateTime::parse_from_rfc3339(&session.updated_at)
            .map(|dt| dt.timestamp())
            .unwrap_or(0),
        thread_id: session_id.to_string(),
        model: Some(session.model),
        working_dir: session.working_dir,
        workspace_id,
        messages: Vec::new(),
        execution_strategy: session.execution_strategy,
        execution_runtime: None,
        turns,
        items,
        todo_items,
        child_subagent_sessions: Vec::new(),
        subagent_parent_context: None,
    })
}

/// 获取会话详情；传入 history_limit 时只读取 timeline 末尾历史，用于首屏恢复。
pub fn get_session_sync_with_history_limit(
    db: &DbConnection,
    session_id: &str,
    history_limit: Option<usize>,
) -> Result<SessionDetail, String> {
    get_session_sync_with_history_window(db, session_id, history_limit, 0)
}

/// 获取会话详情；传入 history_limit/history_offset 时从最新 timeline 向前分页读取历史。
pub fn get_session_sync_with_history_window(
    db: &DbConnection,
    session_id: &str,
    history_limit: Option<usize>,
    history_offset: usize,
) -> Result<SessionDetail, String> {
    get_session_sync_with_history_page(db, session_id, history_limit, history_offset, None)
}

/// 获取会话详情；传入 before_message_id 时走 timeline 游标读取更早历史。
pub fn get_session_sync_with_history_page(
    db: &DbConnection,
    session_id: &str,
    history_limit: Option<usize>,
    history_offset: usize,
    before_message_id: Option<i64>,
) -> Result<SessionDetail, String> {
    let started_at = Instant::now();

    let session_started_at = Instant::now();
    let (session_detail, turns, items, todo_items, session_ms, turns_ms, items_ms, todo_ms) = {
        let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
        let session_detail =
            agent_session_repository::get_session_without_messages(&conn, session_id)
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("会话不存在: {session_id}"))?;
        let session_ms = session_started_at.elapsed().as_millis();

        let turns_started_at = Instant::now();
        let turns = match (history_limit, before_message_id) {
            (Some(_), Some(_)) => Ok(Vec::new()),
            (Some(limit), None) => AgentTimelineDao::list_turns_by_thread_tail_page(
                &conn,
                session_id,
                limit,
                history_offset,
            ),
            (None, _) => AgentTimelineDao::list_turns_by_thread(&conn, session_id),
        }
        .map_err(|e| format!("获取 turn 历史失败: {e}"))?;
        let turns_ms = turns_started_at.elapsed().as_millis();

        let items_started_at = Instant::now();
        let items = match (history_limit, before_message_id) {
            (Some(_), Some(_)) => Ok(Vec::new()),
            (Some(limit), None) => AgentTimelineDao::list_items_by_thread_tail_page(
                &conn,
                session_id,
                limit,
                history_offset,
            ),
            (None, _) => AgentTimelineDao::list_items_by_thread(&conn, session_id),
        }
        .map_err(|e| format!("获取 item 历史失败: {e}"))?;
        let items_ms = items_started_at.elapsed().as_millis();

        let todo_started_at = Instant::now();
        let todo_items = load_session_todo_items_from_conn(&conn, session_id);
        let todo_ms = todo_started_at.elapsed().as_millis();

        (
            session_detail,
            turns,
            items,
            todo_items,
            session_ms,
            turns_ms,
            items_ms,
            todo_ms,
        )
    };

    let SessionRecordDetail {
        session,
        workspace_id,
    } = session_detail;
    let working_dir = session.working_dir.clone();
    let messages_started_at = Instant::now();
    let tauri_messages = Vec::new();
    let messages_ms = messages_started_at.elapsed().as_millis();
    let total_ms = started_at.elapsed().as_millis();

    tracing::info!(
        "[SessionStore] get_session_sync 完成: session_id={}, total_ms={}, session_ms={}, turns_ms={}, items_ms={}, todo_ms={}, messages_ms={}, history_limit={:?}, history_offset={}, before_message_id={:?}, messages_count={}, turns_count={}, items_count={}, todo_count={}",
        session_id,
        total_ms,
        session_ms,
        turns_ms,
        items_ms,
        todo_ms,
        messages_ms,
        history_limit,
        history_offset,
        before_message_id,
        tauri_messages.len(),
        turns.len(),
        items.len(),
        todo_items.len(),
    );

    Ok(SessionDetail {
        id: session.id,
        name: session.title.unwrap_or_else(|| "未命名".to_string()),
        created_at: chrono::DateTime::parse_from_rfc3339(&session.created_at)
            .map(|dt| dt.timestamp())
            .unwrap_or(0),
        updated_at: chrono::DateTime::parse_from_rfc3339(&session.updated_at)
            .map(|dt| dt.timestamp())
            .unwrap_or(0),
        thread_id: session_id.to_string(),
        model: Some(session.model),
        working_dir,
        workspace_id,
        messages: tauri_messages,
        execution_strategy: session.execution_strategy,
        execution_runtime: None,
        turns,
        items,
        todo_items,
        child_subagent_sessions: Vec::new(),
        subagent_parent_context: None,
    })
}

/// 重命名会话
pub fn rename_session_sync(db: &DbConnection, session_id: &str, name: &str) -> Result<(), String> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("会话名称不能为空".to_string());
    }

    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
    let now = Utc::now().to_rfc3339();
    agent_session_repository::rename_session(&conn, session_id, trimmed_name, &now)?;

    Ok(())
}

pub fn update_session_working_dir_sync(
    db: &DbConnection,
    session_id: &str,
    working_dir: &str,
) -> Result<(), String> {
    let trimmed_working_dir = working_dir.trim();
    if trimmed_working_dir.is_empty() {
        return Err("working_dir 不能为空".to_string());
    }

    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
    agent_session_repository::update_session_working_dir(&conn, session_id, trimmed_working_dir)?;

    Ok(())
}

pub fn update_session_execution_strategy_sync(
    db: &DbConnection,
    session_id: &str,
    execution_strategy: &str,
) -> Result<(), String> {
    let normalized_execution_strategy =
        normalize_execution_strategy_to_react(Some(execution_strategy));
    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
    agent_session_repository::update_session_execution_strategy(
        &conn,
        session_id,
        &normalized_execution_strategy,
    )?;
    Ok(())
}

pub fn update_session_provider_config_sync(
    db: &DbConnection,
    session_id: &str,
    provider_name: Option<&str>,
    model_name: Option<&str>,
) -> Result<(), String> {
    let normalized_provider_name = provider_name
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let normalized_model_name = model_name.map(str::trim).filter(|value| !value.is_empty());

    if normalized_provider_name.is_none() && normalized_model_name.is_none() {
        return Ok(());
    }

    let model_config_json = normalized_model_name
        .map(ModelConfig::new)
        .transpose()
        .map_err(|error| format!("构建 model_config 失败: {error}"))?
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(|error| format!("序列化 model_config 失败: {error}"))?;
    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
    let now = Utc::now().to_rfc3339();

    agent_session_repository::update_session_provider_config(
        &conn,
        session_id,
        normalized_provider_name,
        normalized_model_name,
        model_config_json.as_deref(),
        &now,
    )?;
    Ok(())
}

pub fn update_session_archived_state_sync(
    db: &DbConnection,
    session_id: &str,
    archived: bool,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
    let now = Utc::now().to_rfc3339();
    let archived_at = if archived { Some(now.as_str()) } else { None };
    agent_session_repository::update_session_archived_at(&conn, session_id, archived_at, &now)?;
    Ok(())
}

/// 删除会话
pub async fn delete_session(db: &DbConnection, session_id: &str) -> Result<(), String> {
    aster::session::SessionStore::delete_session(&LimeSessionStore::new(db.clone()), session_id)
        .await
        .map_err(|e| format!("删除会话失败: {e}"))
}

#[cfg(test)]
#[path = "session_store_tests.rs"]
mod tests;
