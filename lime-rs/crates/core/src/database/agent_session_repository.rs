//! Agent 会话持久化访问边界。
//!
//! 统一收口 Agent session 的数据库读写与 workspace 绑定解析，
//! 避免上层 crate 继续散落 direct AgentDao 调用或手写 workspace SQL。

use crate::agent::types::AgentSession;
use crate::database::dao::agent::{AgentDao, AgentSessionOverviewRow, SessionArchiveFilter};
use crate::workspace::WorkspaceManager;
use rusqlite::{Connection, OptionalExtension};
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct SessionRecordOverview {
    pub id: String,
    pub model: String,
    pub system_prompt: Option<String>,
    pub title: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
    pub working_dir: Option<String>,
    pub workspace_id: Option<String>,
    pub execution_strategy: Option<String>,
    pub messages_count: usize,
}

#[derive(Debug, Clone)]
pub struct SessionRecordDetail {
    pub session: AgentSession,
    pub workspace_id: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct SessionRecordMetadata {
    pub system_prompt: Option<String>,
    pub working_dir: Option<String>,
    pub execution_strategy: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionRecordPreviewMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionCreateRecord {
    pub id: String,
    pub model: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub working_dir: String,
    pub execution_strategy: String,
    pub session_type: String,
    pub user_set_name: bool,
    pub extension_data_json: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SessionTokenStatsUpdate {
    pub schedule_id: Option<String>,
    pub total_tokens: Option<i32>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cached_input_tokens: Option<i32>,
    pub cache_creation_input_tokens: Option<i32>,
    pub accumulated_total_tokens: Option<i32>,
    pub accumulated_input_tokens: Option<i32>,
    pub accumulated_output_tokens: Option<i32>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SessionProviderConfigUpdate {
    pub provider_name: Option<String>,
    pub model_name: Option<String>,
    pub model_config_json: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SessionRecipeUpdate {
    pub recipe_json: Option<String>,
    pub user_recipe_values_json: Option<String>,
}

impl SessionTokenStatsUpdate {
    pub fn normalized_schedule_id(&self) -> Option<String> {
        normalize_optional_text(self.schedule_id.as_deref())
    }
}

impl SessionProviderConfigUpdate {
    pub fn new(
        provider_name: Option<String>,
        model_name: Option<String>,
        model_config_json: Option<String>,
    ) -> Self {
        Self {
            provider_name: normalize_optional_text(provider_name.as_deref()),
            model_name: normalize_optional_text(model_name.as_deref()),
            model_config_json,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.provider_name.is_none() && self.model_name.is_none()
    }
}

fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub fn normalize_session_working_dir(path: PathBuf) -> PathBuf {
    if path.is_absolute() {
        path
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(path)
    }
}

pub fn resolve_default_session_working_dir(conn: &Connection) -> PathBuf {
    if let Some(path) = WorkspaceManager::get_default_root_path_from_conn(conn)
        .ok()
        .flatten()
    {
        let normalized = normalize_session_working_dir(path);
        if !normalized.as_os_str().is_empty() {
            return normalized;
        }
    }

    if let Ok(default_project_dir) = crate::app_paths::resolve_default_project_dir() {
        return default_project_dir;
    }

    tracing::warn!(
        "[AgentSessionRepository] 解析默认 working_dir 失败，已回退当前目录；建议检查 app_paths 配置"
    );
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

pub fn resolve_persisted_session_working_dir(
    conn: &Connection,
    working_dir: Option<String>,
) -> PathBuf {
    match working_dir {
        Some(path) if !path.trim().is_empty() => normalize_session_working_dir(PathBuf::from(path)),
        _ => resolve_default_session_working_dir(conn),
    }
}

fn resolve_workspace_id_by_working_dir(
    conn: &Connection,
    working_dir: Option<&str>,
) -> Option<String> {
    let resolved_working_dir = working_dir?.trim();
    if resolved_working_dir.is_empty() {
        return None;
    }

    match conn
        .query_row(
            "SELECT id FROM workspaces WHERE root_path = ? LIMIT 1",
            [resolved_working_dir],
            |row| row.get::<_, String>(0),
        )
        .optional()
    {
        Ok(workspace_id) => workspace_id,
        Err(error) => {
            tracing::warn!(
                "[AgentSessionRepository] 解析 workspace_id 失败，已降级忽略: working_dir={}, error={}",
                resolved_working_dir,
                error
            );
            None
        }
    }
}

fn map_session_overview(overview: AgentSessionOverviewRow) -> SessionRecordOverview {
    let AgentSessionOverviewRow {
        session,
        messages_count,
        archived_at,
        workspace_id,
    } = overview;
    let AgentSession {
        id,
        model,
        system_prompt,
        title,
        created_at,
        updated_at,
        working_dir,
        execution_strategy,
        ..
    } = session;

    SessionRecordOverview {
        id,
        model,
        system_prompt,
        title,
        created_at,
        updated_at,
        archived_at,
        working_dir,
        workspace_id,
        execution_strategy,
        messages_count,
    }
}

pub fn create_session(conn: &Connection, session: &AgentSession) -> Result<(), String> {
    AgentDao::create_session(conn, session).map_err(|error| format!("创建会话失败: {error}"))
}

pub fn insert_session_record(
    conn: &Connection,
    record: &SessionCreateRecord,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO agent_sessions (
            id, model, system_prompt, title, created_at, updated_at, working_dir,
            execution_strategy, session_type, user_set_name, extension_data_json
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            record.id,
            record.model,
            None::<String>,
            record.title,
            record.created_at,
            record.updated_at,
            record.working_dir,
            record.execution_strategy,
            record.session_type,
            record.user_set_name,
            record.extension_data_json,
        ],
    )
    .map(|_| ())
    .map_err(|error| format!("创建会话失败: {error}"))
}

pub fn session_exists(conn: &Connection, session_id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM agent_sessions WHERE id = ?1",
        [session_id],
        |_| Ok(true),
    )
    .optional()
    .map(|value| value.unwrap_or(false))
    .map_err(|error| format!("检查会话是否存在失败: {error}"))
}

pub fn delete_session(conn: &Connection, session_id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM agent_sessions WHERE id = ?", [session_id])
        .map(|_| ())
        .map_err(|error| format!("删除会话失败: {error}"))
}

pub fn touch_session_updated_at(
    conn: &Connection,
    session_id: &str,
    updated_at: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE agent_sessions SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![updated_at, session_id],
    )
    .map(|_| ())
    .map_err(|error| format!("更新会话时间失败: {error}"))
}

pub fn list_session_overviews(
    conn: &Connection,
    archive_filter: SessionArchiveFilter,
    cwd_filters: &[String],
    limit: Option<usize>,
) -> Result<Vec<SessionRecordOverview>, String> {
    AgentDao::list_session_overviews(conn, archive_filter, cwd_filters, limit)
        .map(|rows| rows.into_iter().map(map_session_overview).collect())
        .map_err(|error| format!("获取会话列表失败: {error}"))
}

pub fn get_session_overview(
    conn: &Connection,
    session_id: &str,
) -> Result<Option<SessionRecordOverview>, String> {
    AgentDao::get_session_overview(conn, session_id)
        .map(|row| row.map(map_session_overview))
        .map_err(|error| format!("获取会话失败: {error}"))
}

pub fn get_session_without_messages(
    conn: &Connection,
    session_id: &str,
) -> Result<Option<SessionRecordDetail>, String> {
    AgentDao::get_session(conn, session_id)
        .map(|session| {
            session.map(|session| SessionRecordDetail {
                workspace_id: resolve_workspace_id_by_working_dir(
                    conn,
                    session.working_dir.as_deref(),
                ),
                session,
            })
        })
        .map_err(|error| format!("获取会话详情失败: {error}"))
}

pub fn get_persisted_session_metadata(
    conn: &Connection,
    session_id: &str,
) -> Result<Option<SessionRecordMetadata>, String> {
    get_session_overview(conn, session_id).map(|overview| {
        overview.map(|overview| SessionRecordMetadata {
            system_prompt: overview.system_prompt,
            working_dir: overview.working_dir,
            execution_strategy: overview.execution_strategy,
        })
    })
}

pub fn get_session_extension_data_json(
    conn: &Connection,
    session_id: &str,
) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT extension_data_json FROM agent_sessions WHERE id = ?1",
        [session_id],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|error| format!("读取会话 extension_data 失败: {error}"))
}

pub fn get_session_working_dir(
    conn: &Connection,
    session_id: &str,
) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT working_dir FROM agent_sessions WHERE id = ?1",
        [session_id],
        |row| row.get::<_, Option<String>>(0),
    )
    .optional()
    .map(|value| value.flatten())
    .map_err(|error| format!("读取会话工作目录失败: {error}"))
}

pub fn update_session_extension_data(
    conn: &Connection,
    session_id: &str,
    extension_data_json: &str,
    updated_at: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE agent_sessions SET extension_data_json = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![extension_data_json, updated_at, session_id],
    )
    .map(|_| ())
    .map_err(|error| format!("更新会话 extension_data 失败: {error}"))
}

pub fn count_session_messages(conn: &Connection, session_id: &str) -> Result<usize, String> {
    let _ = (conn, session_id);
    Ok(0)
}

pub fn list_title_preview_messages(
    conn: &Connection,
    session_id: &str,
    limit: usize,
) -> Result<Vec<SessionRecordPreviewMessage>, String> {
    let _ = (conn, session_id, limit);
    Ok(Vec::new())
}

pub fn rename_session(
    conn: &Connection,
    session_id: &str,
    title: &str,
    updated_at: &str,
) -> Result<(), String> {
    AgentDao::rename_session(conn, session_id, title, updated_at)
        .map_err(|error| format!("重命名会话失败: {error}"))
}

pub fn update_session_name(
    conn: &Connection,
    session_id: &str,
    title: &str,
    user_set_name: bool,
    updated_at: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE agent_sessions SET title = ?1, user_set_name = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![title, user_set_name, updated_at, session_id],
    )
    .map(|_| ())
    .map_err(|error| format!("更新会话名称失败: {error}"))
}

pub fn update_session_user_set_name(
    conn: &Connection,
    session_id: &str,
    user_set_name: bool,
    updated_at: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE agent_sessions SET user_set_name = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![user_set_name, updated_at, session_id],
    )
    .map(|_| ())
    .map_err(|error| format!("更新会话 user_set_name 失败: {error}"))
}

pub fn update_session_working_dir(
    conn: &Connection,
    session_id: &str,
    working_dir: &str,
) -> Result<(), String> {
    AgentDao::update_working_dir(conn, session_id, working_dir)
        .map_err(|error| format!("更新 session working_dir 失败: {error}"))
}

pub fn update_session_working_dir_with_updated_at(
    conn: &Connection,
    session_id: &str,
    working_dir: &str,
    updated_at: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE agent_sessions SET working_dir = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![working_dir, updated_at, session_id],
    )
    .map(|_| ())
    .map_err(|error| format!("更新 session working_dir 失败: {error}"))
}

pub fn update_session_type(
    conn: &Connection,
    session_id: &str,
    session_type: &str,
    updated_at: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE agent_sessions SET session_type = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![session_type, updated_at, session_id],
    )
    .map(|_| ())
    .map_err(|error| format!("更新会话类型失败: {error}"))
}

pub fn update_session_execution_strategy(
    conn: &Connection,
    session_id: &str,
    execution_strategy: &str,
) -> Result<(), String> {
    AgentDao::update_execution_strategy(conn, session_id, execution_strategy)
        .map_err(|error| format!("更新会话执行策略失败: {error}"))
}

pub fn update_session_provider_config(
    conn: &Connection,
    session_id: &str,
    update: &SessionProviderConfigUpdate,
    updated_at: &str,
) -> Result<(), String> {
    AgentDao::update_provider_config(
        conn,
        session_id,
        update.provider_name.as_deref(),
        update.model_name.as_deref(),
        update.model_config_json.as_deref(),
        updated_at,
    )
    .map_err(|error| format!("更新会话 provider/model 失败: {error}"))
}

pub fn update_session_recipe(
    conn: &Connection,
    session_id: &str,
    update: &SessionRecipeUpdate,
    updated_at: &str,
) -> Result<(), String> {
    conn.execute(
        "UPDATE agent_sessions SET
            recipe_json = ?1,
            user_recipe_values_json = ?2,
            updated_at = ?3
         WHERE id = ?4",
        rusqlite::params![
            update.recipe_json.as_deref(),
            update.user_recipe_values_json.as_deref(),
            updated_at,
            session_id,
        ],
    )
    .map(|_| ())
    .map_err(|error| format!("更新会话 recipe 失败: {error}"))
}

pub fn update_session_archived_at(
    conn: &Connection,
    session_id: &str,
    archived_at: Option<&str>,
    updated_at: &str,
) -> Result<(), String> {
    AgentDao::update_archived_at(conn, session_id, archived_at, updated_at)
        .map_err(|error| format!("更新会话归档状态失败: {error}"))
}

pub fn update_session_token_stats(
    conn: &Connection,
    session_id: &str,
    update: &SessionTokenStatsUpdate,
    updated_at: &str,
) -> Result<(), String> {
    let schedule_id = update.normalized_schedule_id();
    conn.execute(
        "UPDATE agent_sessions SET
            total_tokens = COALESCE(?1, total_tokens),
            input_tokens = COALESCE(?2, input_tokens),
            output_tokens = COALESCE(?3, output_tokens),
            cached_input_tokens = COALESCE(?4, cached_input_tokens),
            cache_creation_input_tokens = COALESCE(?5, cache_creation_input_tokens),
            accumulated_total_tokens = COALESCE(?6, accumulated_total_tokens),
            accumulated_input_tokens = COALESCE(?7, accumulated_input_tokens),
            accumulated_output_tokens = COALESCE(?8, accumulated_output_tokens),
            schedule_id = COALESCE(?9, schedule_id),
            updated_at = ?10
         WHERE id = ?11",
        rusqlite::params![
            update.total_tokens,
            update.input_tokens,
            update.output_tokens,
            update.cached_input_tokens,
            update.cache_creation_input_tokens,
            update.accumulated_total_tokens,
            update.accumulated_input_tokens,
            update.accumulated_output_tokens,
            schedule_id,
            updated_at,
            session_id,
        ],
    )
    .map(|_| ())
    .map_err(|error| format!("更新会话 token 统计失败: {error}"))
}

#[cfg(test)]
#[path = "agent_session_repository_tests.rs"]
mod tests;
