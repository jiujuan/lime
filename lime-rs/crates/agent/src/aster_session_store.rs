//! Aster SessionStore 实现
//!
//! 实现 aster::session::SessionStore trait，将 aster 的会话数据
//! 存储到 Lime 的 SQLite 数据库中。
//!
//! 这是应用层接管框架层存储的关键桥接模块。

use anyhow::{anyhow, Result};
use aster::session::extension_data::ExtensionData;
use aster::session::{Session, SessionType};
use chrono::Utc;
use lime_core::app_paths;
use lime_core::database::DbConnection;
use lime_core::workspace::WorkspaceManager;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex as StdMutex;
use thread_store::session_record::DEFAULT_MODEL_NAME;

mod aster_trait;
mod history_search;
mod legacy_conversation;
mod memory_stub;
mod runtime_conversation;
mod session_projection;

/// Lime 的 SessionStore 实现
///
/// 将 aster 的会话数据存储到 Lime 的 SQLite 数据库
pub struct LimeSessionStore {
    db: DbConnection,
    metadata_cache: StdMutex<HashMap<String, Session>>,
}

impl LimeSessionStore {
    /// 创建新的 SessionStore 实例
    pub fn new(db: DbConnection) -> Self {
        Self {
            db,
            metadata_cache: StdMutex::new(HashMap::new()),
        }
    }

    pub fn load_extension_data_from_conn(
        conn: &rusqlite::Connection,
        session_id: &str,
    ) -> Result<ExtensionData> {
        let extension_data_json: String = conn
            .query_row(
                "SELECT extension_data_json FROM agent_sessions WHERE id = ?1",
                rusqlite::params![session_id],
                |row| row.get(0),
            )
            .map_err(|e| anyhow!("读取 extension_data 失败: {e}"))?;

        Ok(serde_json::from_str(&extension_data_json).unwrap_or_default())
    }

    fn cache_session_metadata(&self, session: &Session) {
        let mut cached = session.clone();
        cached.conversation = None;

        if let Ok(mut metadata_cache) = self.metadata_cache.lock() {
            metadata_cache.insert(cached.id.clone(), cached);
        }
    }

    fn cached_session_metadata(&self, session_id: &str) -> Option<Session> {
        self.metadata_cache
            .lock()
            .ok()
            .and_then(|metadata_cache| metadata_cache.get(session_id).cloned())
    }

    fn invalidate_cached_session_metadata(&self, session_id: &str) {
        if let Ok(mut metadata_cache) = self.metadata_cache.lock() {
            metadata_cache.remove(session_id);
        }
    }

    fn update_cached_session_metadata(&self, session_id: &str, updater: impl FnOnce(&mut Session)) {
        if let Ok(mut metadata_cache) = self.metadata_cache.lock() {
            if let Some(session) = metadata_cache.get_mut(session_id) {
                updater(session);
            }
        }
    }

    fn default_model_name() -> String {
        DEFAULT_MODEL_NAME.to_string()
    }

    fn insert_session_row(
        conn: &rusqlite::Connection,
        id: &str,
        title: &str,
        working_dir: &Path,
        session_type: SessionType,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO agent_sessions (
                id, model, system_prompt, title, created_at, updated_at, working_dir,
                execution_strategy, session_type, user_set_name, extension_data_json
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                id,
                Self::default_model_name(),
                None::<String>,
                title,
                now,
                now,
                working_dir.to_string_lossy().to_string(),
                "react",
                session_type.to_string(),
                false,
                serde_json::to_string(&ExtensionData::default())
                    .map_err(|e| anyhow!("序列化 extension_data 失败: {e}"))?,
            ],
        )
        .map_err(|e| anyhow!("创建会话失败: {e}"))?;
        Ok(())
    }

    fn ensure_session_row(conn: &rusqlite::Connection, session_id: &str) -> Result<()> {
        let session_exists: bool = conn
            .query_row(
                "SELECT 1 FROM agent_sessions WHERE id = ?",
                [session_id],
                |_| Ok(true),
            )
            .unwrap_or(false);

        if session_exists {
            return Ok(());
        }

        let working_dir = Self::resolve_session_working_dir(conn);
        Self::insert_session_row(conn, session_id, "新对话", &working_dir, SessionType::User)
    }

    /// 解析会话 working_dir（优先默认 workspace，其次应用默认项目目录）
    fn resolve_session_working_dir(conn: &rusqlite::Connection) -> PathBuf {
        if let Some(path) = WorkspaceManager::get_default_root_path_from_conn(conn)
            .ok()
            .flatten()
        {
            let normalized = Self::normalize_working_dir(path);
            if !normalized.as_os_str().is_empty() {
                return normalized;
            }
        }

        if let Ok(default_project_dir) = app_paths::resolve_default_project_dir() {
            return default_project_dir;
        }

        tracing::warn!(
            "[SessionStore] 解析默认 working_dir 失败，已回退当前目录；建议检查 app_paths 配置"
        );
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    }

    /// 标准化 working_dir（相对路径转绝对路径）
    fn normalize_working_dir(path: PathBuf) -> PathBuf {
        if path.is_absolute() {
            path
        } else {
            std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join(path)
        }
    }

    async fn apply_runtime_message_counts(&self, sessions: &mut [Session]) {
        for session in sessions {
            if let Ok(Some(count)) = runtime_conversation::count_runtime_messages(&session.id).await
            {
                session.message_count = count;
            }
        }
    }

    fn load_session_working_dir(conn: &rusqlite::Connection, session_id: &str) -> Result<PathBuf> {
        let working_dir: Option<String> = conn
            .query_row(
                "SELECT working_dir FROM agent_sessions WHERE id = ?",
                [session_id],
                |row| row.get(0),
            )
            .map_err(|e| anyhow!("读取会话工作目录失败: {e}"))?;
        Ok(session_projection::parse_session_working_dir(
            conn,
            working_dir,
        ))
    }
}

#[cfg(test)]
#[path = "aster_session_store_tests.rs"]
mod tests;
