//! Agent 会话持久化访问边界。
//!
//! 统一收口 Agent session 的数据库读写与 workspace 绑定解析，
//! 避免上层 crate 继续散落 direct AgentDao 调用或手写 workspace SQL。

use crate::agent::types::AgentSession;
use crate::database::dao::agent::{AgentDao, AgentSessionOverviewRow, SessionArchiveFilter};
use rusqlite::{Connection, OptionalExtension};

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

fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
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

pub fn delete_session(conn: &Connection, session_id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM agent_sessions WHERE id = ?", [session_id])
        .map(|_| ())
        .map_err(|error| format!("删除会话失败: {error}"))
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

pub fn update_session_working_dir(
    conn: &Connection,
    session_id: &str,
    working_dir: &str,
) -> Result<(), String> {
    AgentDao::update_working_dir(conn, session_id, working_dir)
        .map_err(|error| format!("更新 session working_dir 失败: {error}"))
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
    provider_name: Option<&str>,
    model_name: Option<&str>,
    model_config_json: Option<&str>,
    updated_at: &str,
) -> Result<(), String> {
    AgentDao::update_provider_config(
        conn,
        session_id,
        provider_name,
        model_name,
        model_config_json,
        updated_at,
    )
    .map_err(|error| format!("更新会话 provider/model 失败: {error}"))
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
    let schedule_id = normalize_optional_text(update.schedule_id.as_deref());
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
mod tests {
    use super::*;

    fn create_agent_sessions_table(conn: &Connection) {
        conn.execute(
            "CREATE TABLE agent_sessions (
                id TEXT PRIMARY KEY,
                total_tokens INTEGER,
                input_tokens INTEGER,
                output_tokens INTEGER,
                cached_input_tokens INTEGER,
                cache_creation_input_tokens INTEGER,
                accumulated_total_tokens INTEGER,
                accumulated_input_tokens INTEGER,
                accumulated_output_tokens INTEGER,
                schedule_id TEXT,
                updated_at TEXT
            )",
            [],
        )
        .expect("create agent_sessions");
    }

    #[test]
    fn delete_session_should_remove_session_record() {
        let conn = Connection::open_in_memory().expect("open db");
        conn.execute("CREATE TABLE agent_sessions (id TEXT PRIMARY KEY)", [])
            .expect("create agent_sessions");
        conn.execute("INSERT INTO agent_sessions (id) VALUES ('session-1')", [])
            .expect("insert session");

        delete_session(&conn, "session-1").expect("delete session");

        let remaining: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM agent_sessions WHERE id = 'session-1'",
                [],
                |row| row.get(0),
            )
            .expect("count sessions");
        assert_eq!(remaining, 0);
    }

    #[test]
    fn update_session_token_stats_should_preserve_none_fields() {
        let conn = Connection::open_in_memory().expect("open db");
        create_agent_sessions_table(&conn);
        conn.execute(
            "INSERT INTO agent_sessions (
                id, total_tokens, input_tokens, output_tokens, cached_input_tokens,
                cache_creation_input_tokens, accumulated_total_tokens,
                accumulated_input_tokens, accumulated_output_tokens, schedule_id, updated_at
             ) VALUES (?1, 10, 8, 2, 4, 5, 20, 18, 2, 'schedule-old', 'old')",
            ["session-1"],
        )
        .expect("insert session");

        update_session_token_stats(
            &conn,
            "session-1",
            &SessionTokenStatsUpdate {
                total_tokens: Some(31),
                input_tokens: Some(31),
                output_tokens: Some(0),
                cached_input_tokens: None,
                cache_creation_input_tokens: Some(7),
                accumulated_total_tokens: None,
                accumulated_input_tokens: Some(99),
                accumulated_output_tokens: None,
                schedule_id: None,
            },
            "now",
        )
        .expect("update stats");

        let row = conn
            .query_row(
                "SELECT total_tokens, input_tokens, output_tokens, cached_input_tokens,
                        cache_creation_input_tokens, accumulated_total_tokens,
                        accumulated_input_tokens, accumulated_output_tokens, schedule_id, updated_at
                 FROM agent_sessions WHERE id = 'session-1'",
                [],
                |row| {
                    Ok((
                        row.get::<_, Option<i32>>(0)?,
                        row.get::<_, Option<i32>>(1)?,
                        row.get::<_, Option<i32>>(2)?,
                        row.get::<_, Option<i32>>(3)?,
                        row.get::<_, Option<i32>>(4)?,
                        row.get::<_, Option<i32>>(5)?,
                        row.get::<_, Option<i32>>(6)?,
                        row.get::<_, Option<i32>>(7)?,
                        row.get::<_, Option<String>>(8)?,
                        row.get::<_, String>(9)?,
                    ))
                },
            )
            .expect("read session");

        assert_eq!(
            row,
            (
                Some(31),
                Some(31),
                Some(0),
                Some(4),
                Some(7),
                Some(20),
                Some(99),
                Some(2),
                Some("schedule-old".to_string()),
                "now".to_string(),
            )
        );
    }
}
