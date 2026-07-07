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
use lime_core::database::agent_session_repository::{
    get_session_extension_data_json, get_session_working_dir, insert_session_record,
    resolve_default_session_working_dir, resolve_persisted_session_working_dir, session_exists,
    SessionCreateRecord,
};
use lime_core::database::DbConnection;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex as StdMutex;
use thread_store::session_record::DEFAULT_MODEL_NAME;

mod aster_trait;
mod history_search;
mod legacy_conversation;
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
        let extension_data_json = get_session_extension_data_json(conn, session_id)
            .map_err(anyhow::Error::msg)?
            .ok_or_else(|| anyhow!("读取 extension_data 失败: 会话不存在"))?;

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
        let extension_data_json = serde_json::to_string(&ExtensionData::default())
            .map_err(|e| anyhow!("序列化 extension_data 失败: {e}"))?;
        insert_session_record(
            conn,
            &SessionCreateRecord {
                id: id.to_string(),
                model: Self::default_model_name(),
                title: title.to_string(),
                created_at: now.clone(),
                updated_at: now,
                working_dir: working_dir.to_string_lossy().to_string(),
                execution_strategy: "react".to_string(),
                session_type: session_type.to_string(),
                user_set_name: false,
                extension_data_json,
            },
        )
        .map_err(anyhow::Error::msg)
    }

    fn ensure_session_row(conn: &rusqlite::Connection, session_id: &str) -> Result<()> {
        if session_exists(conn, session_id).map_err(anyhow::Error::msg)? {
            return Ok(());
        }

        let working_dir = resolve_default_session_working_dir(conn);
        Self::insert_session_row(conn, session_id, "新对话", &working_dir, SessionType::User)
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
        let working_dir = get_session_working_dir(conn, session_id).map_err(anyhow::Error::msg)?;
        Ok(resolve_persisted_session_working_dir(conn, working_dir))
    }
}

#[cfg(test)]
#[path = "aster_session_store_tests.rs"]
mod tests;
