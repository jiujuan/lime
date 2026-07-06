//! SessionRepository trait 实现
//!
//! 实现 thread_store::SessionRepository trait，将会话数据存储到 Lime 的 SQLite 数据库中。
//! 这是新的存储抽象层，不依赖 Aster。

use crate::session_record_sql::{
    load_session_record_row_by_id, load_session_record_rows_for_query,
};
use agent_protocol::SessionId;
use chrono::Utc;
use lime_core::database::{
    agent_session_repository::{
        delete_session as delete_session_record, rename_session as rename_session_record,
        update_session_extension_data as update_session_extension_data_record,
        update_session_user_set_name as update_session_user_set_name_record,
        update_session_working_dir_with_updated_at as update_session_working_dir_record,
    },
    DbConnection,
};
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

        let row = load_session_record_row_by_id(&conn, session_id.as_str())
            .map_err(|e| ThreadStoreError::new(format!("查询会话失败: {e}")))?;
        Ok(row.map(row_to_session_detail))
    }

    fn list_sessions(&self, query: &SessionListQuery) -> ThreadStoreResult<Vec<SessionDetail>> {
        let conn = self
            .db
            .lock()
            .map_err(|e| ThreadStoreError::new(format!("数据库锁定失败: {e}")))?;

        let rows = load_session_record_rows_for_query(&conn, query)
            .map_err(|e| ThreadStoreError::new(format!("查询失败: {e}")))?;
        Ok(rows.into_iter().map(row_to_session_detail).collect())
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
            rename_session_record(&conn, session_id.as_str(), title, &now)
                .map_err(ThreadStoreError::new)?;
        }

        if let Some(user_set_name) = update.user_set_name {
            update_session_user_set_name_record(&conn, session_id.as_str(), user_set_name, &now)
                .map_err(ThreadStoreError::new)?;
        }

        if let Some(ref working_dir) = update.working_dir {
            update_session_working_dir_record(&conn, session_id.as_str(), working_dir, &now)
                .map_err(ThreadStoreError::new)?;
        }

        if let Some(ref ext_data) = update.extension_data {
            let json = serde_json::to_string(ext_data)
                .map_err(|e| ThreadStoreError::new(format!("序列化 extension_data 失败: {e}")))?;
            update_session_extension_data_record(&conn, session_id.as_str(), &json, &now)
                .map_err(ThreadStoreError::new)?;
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

        delete_session_record(&conn, session_id.as_str()).map_err(ThreadStoreError::new)?;

        Ok(())
    }
}
