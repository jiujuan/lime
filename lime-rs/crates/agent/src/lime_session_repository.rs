//! SessionRepository trait 实现
//!
//! 实现 thread_store::SessionRepository trait，将会话数据存储到 Lime 的 SQLite 数据库中。
//! 这是新的存储抽象层，不依赖 Aster。

use agent_protocol::SessionId;
use chrono::Utc;
use lime_core::database::DbConnection;
use lime_core::workspace::WorkspaceManager;
use rusqlite::Connection;
use std::path::PathBuf;
use thread_store::session_record::SessionRecordRow;
use thread_store::session_repository::{
    ConversationMessage, SaveConversationRequest, SessionDetail, SessionListQuery, SessionMetadata,
    SessionRepository, UpdateSessionMetadata,
};
use thread_store::{ThreadStoreError, ThreadStoreResult};

/// Lime SessionRepository 实现
pub struct LimeSessionRepository {
    db: DbConnection,
}

impl LimeSessionRepository {
    pub fn new(db: DbConnection) -> Self {
        Self { db }
    }

    #[allow(dead_code)]
    fn resolve_session_working_dir(conn: &Connection) -> PathBuf {
        if let Some(path) = WorkspaceManager::get_default_root_path_from_conn(conn)
            .ok()
            .flatten()
        {
            let normalized = normalize_working_dir(path);
            if !normalized.as_os_str().is_empty() {
                return normalized;
            }
        }

        if let Ok(dir) = lime_core::app_paths::resolve_default_project_dir() {
            return dir;
        }

        tracing::warn!("[SessionRepository] 解析默认 working_dir 失败，回退当前目录");
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    }
}

#[allow(dead_code)]
fn normalize_working_dir(path: PathBuf) -> PathBuf {
    if path.is_absolute() {
        path
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(path)
    }
}

fn map_session_listing_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SessionRecordRow> {
    Ok(SessionRecordRow {
        id: row.get(0)?,
        model: row.get(1)?,
        title: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        working_dir: row.get(5)?,
        session_type: row.get(6)?,
        user_set_name: row.get(7)?,
        extension_data_json: row.get(8)?,
        total_tokens: row.get(9)?,
        input_tokens: row.get(10)?,
        output_tokens: row.get(11)?,
        cached_input_tokens: row.get(12)?,
        cache_creation_input_tokens: row.get(13)?,
        accumulated_total_tokens: row.get(14)?,
        accumulated_input_tokens: row.get(15)?,
        accumulated_output_tokens: row.get(16)?,
        schedule_id: row.get(17)?,
        recipe_json: row.get(18)?,
        user_recipe_values_json: row.get(19)?,
        provider_name: row.get(20)?,
        model_config_json: row.get(21)?,
        message_count: row.get::<_, i64>(22)? as usize,
    })
}

fn row_to_session_detail(row: SessionRecordRow) -> SessionDetail {
    let projection = row.project();
    SessionDetail {
        metadata: SessionMetadata {
            id: SessionId::new(projection.id),
            title: projection.title,
            model: projection.model,
            session_type: projection.session_type,
            created_at: projection.created_at,
            updated_at: projection.updated_at,
            working_dir: projection.working_dir,
            user_set_name: projection.user_set_name,
            provider_name: projection.provider_name,
            extension_data: serde_json::from_str(&projection.extension_data_json)
                .unwrap_or(serde_json::Value::Object(serde_json::Map::new())),
        },
        total_tokens: projection.total_tokens,
        input_tokens: projection.input_tokens,
        output_tokens: projection.output_tokens,
        cached_input_tokens: projection.cached_input_tokens,
        cache_creation_input_tokens: projection.cache_creation_input_tokens,
        accumulated_total_tokens: projection.accumulated_total_tokens,
        accumulated_input_tokens: projection.accumulated_input_tokens,
        accumulated_output_tokens: projection.accumulated_output_tokens,
        message_count: projection.message_count,
        schedule_id: projection.schedule_id,
        recipe_json: projection.recipe_json,
        user_recipe_values_json: projection.user_recipe_values_json,
        model_config_json: projection.model_config_json,
    }
}

impl SessionRepository for LimeSessionRepository {
    fn get_session(&self, session_id: &SessionId) -> ThreadStoreResult<Option<SessionDetail>> {
        let conn = self
            .db
            .lock()
            .map_err(|e| ThreadStoreError::new(format!("数据库锁定失败: {e}")))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, model, title, created_at, updated_at, working_dir,
                        session_type, user_set_name, extension_data_json,
                        total_tokens, input_tokens, output_tokens, cached_input_tokens, cache_creation_input_tokens,
                        accumulated_total_tokens, accumulated_input_tokens, accumulated_output_tokens,
                        schedule_id, recipe_json, user_recipe_values_json,
                        provider_name, model_config_json,
                        0 AS message_count
                 FROM agent_sessions WHERE id = ?",
            )
            .map_err(|e| ThreadStoreError::new(format!("准备查询失败: {e}")))?;

        let result = stmt.query_row([session_id.as_str()], map_session_listing_row);

        match result {
            Ok(row) => Ok(Some(row_to_session_detail(row))),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(ThreadStoreError::new(format!("查询会话失败: {e}"))),
        }
    }

    fn list_sessions(&self, query: &SessionListQuery) -> ThreadStoreResult<Vec<SessionDetail>> {
        let conn = self
            .db
            .lock()
            .map_err(|e| ThreadStoreError::new(format!("数据库锁定失败: {e}")))?;

        let mut sql = String::from(
            "SELECT id, model, title, created_at, updated_at, working_dir,
                    session_type, user_set_name, extension_data_json,
                    total_tokens, input_tokens, output_tokens, cached_input_tokens, cache_creation_input_tokens,
                    accumulated_total_tokens, accumulated_input_tokens, accumulated_output_tokens,
                    schedule_id, recipe_json, user_recipe_values_json,
                    provider_name, model_config_json,
                    0 AS message_count
             FROM agent_sessions",
        );

        if let Some(ref session_type) = query.session_type {
            sql.push_str(&format!(" WHERE session_type = '{}'", session_type));
        }

        sql.push_str(" ORDER BY updated_at DESC");

        if let Some(limit) = query.limit {
            sql.push_str(&format!(" LIMIT {}", limit));
        }

        if let Some(offset) = query.offset {
            sql.push_str(&format!(" OFFSET {}", offset));
        }

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| ThreadStoreError::new(format!("准备查询失败: {e}")))?;

        let rows = stmt
            .query_map([], map_session_listing_row)
            .map_err(|e| ThreadStoreError::new(format!("查询失败: {e}")))?;

        Ok(rows
            .filter_map(|r| r.ok())
            .map(row_to_session_detail)
            .collect())
    }

    fn update_metadata(
        &self,
        session_id: &SessionId,
        update: &UpdateSessionMetadata,
    ) -> ThreadStoreResult<()> {
        let conn = self
            .db
            .lock()
            .map_err(|e| ThreadStoreError::new(format!("数据库锁定失败: {e}")))?;

        let now = Utc::now().to_rfc3339();

        if let Some(ref title) = update.title {
            conn.execute(
                "UPDATE agent_sessions SET title = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![title, now, session_id.as_str()],
            )
            .map_err(|e| ThreadStoreError::new(format!("更新标题失败: {e}")))?;
        }

        if let Some(user_set_name) = update.user_set_name {
            conn.execute(
                "UPDATE agent_sessions SET user_set_name = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![user_set_name, now, session_id.as_str()],
            )
            .map_err(|e| ThreadStoreError::new(format!("更新 user_set_name 失败: {e}")))?;
        }

        if let Some(ref working_dir) = update.working_dir {
            conn.execute(
                "UPDATE agent_sessions SET working_dir = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![working_dir, now, session_id.as_str()],
            )
            .map_err(|e| ThreadStoreError::new(format!("更新工作目录失败: {e}")))?;
        }

        if let Some(ref ext_data) = update.extension_data {
            let json = serde_json::to_string(ext_data)
                .map_err(|e| ThreadStoreError::new(format!("序列化 extension_data 失败: {e}")))?;
            conn.execute(
                "UPDATE agent_sessions SET extension_data_json = ?1, updated_at = ?2 WHERE id = ?3",
                rusqlite::params![json, now, session_id.as_str()],
            )
            .map_err(|e| ThreadStoreError::new(format!("更新 extension_data 失败: {e}")))?;
        }

        Ok(())
    }

    fn save_conversation(&self, _request: &SaveConversationRequest) -> ThreadStoreResult<()> {
        // 暂未实现，当前使用 runtime_conversation 模块
        Ok(())
    }

    fn get_conversation(
        &self,
        _session_id: &SessionId,
        _thread_id: &agent_protocol::ThreadId,
    ) -> ThreadStoreResult<Vec<ConversationMessage>> {
        // 暂未实现，当前使用 runtime_conversation 模块
        Ok(Vec::new())
    }

    fn delete_session(&self, session_id: &SessionId) -> ThreadStoreResult<()> {
        let conn = self
            .db
            .lock()
            .map_err(|e| ThreadStoreError::new(format!("数据库锁定失败: {e}")))?;

        conn.execute(
            "DELETE FROM agent_sessions WHERE id = ?",
            [session_id.as_str()],
        )
        .map_err(|e| ThreadStoreError::new(format!("删除会话失败: {e}")))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_working_dir_should_convert_relative_to_absolute() {
        let relative = PathBuf::from("test");
        let normalized = normalize_working_dir(relative);
        assert!(normalized.is_absolute());
    }

    #[test]
    fn normalize_working_dir_should_preserve_absolute() {
        let absolute = PathBuf::from("/tmp/test");
        let normalized = normalize_working_dir(absolute.clone());
        assert_eq!(normalized, absolute);
    }
}
