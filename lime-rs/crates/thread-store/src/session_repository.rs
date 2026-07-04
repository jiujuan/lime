//! Session Repository trait and DTOs for thread-store.
//!
//! 此模块定义不依赖 Aster 的 session 仓储接口和 Lime-owned DTO。
//! 实现者可以选择任何存储后端（SQLite、内存、JSON 文件等）。

use crate::ThreadStoreResult;
use agent_protocol::{SessionId, ThreadId};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Session 基本元数据
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SessionMetadata {
    pub id: SessionId,
    pub title: String,
    pub model: String,
    pub session_type: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub working_dir: Option<String>,
    pub user_set_name: bool,
    pub provider_name: Option<String>,
    #[serde(default)]
    pub extension_data: Value,
}

/// Session 详细信息，包含元数据和统计数据
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SessionDetail {
    #[serde(flatten)]
    pub metadata: SessionMetadata,
    pub total_tokens: Option<i32>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cached_input_tokens: Option<i32>,
    pub cache_creation_input_tokens: Option<i32>,
    pub accumulated_total_tokens: Option<i32>,
    pub accumulated_input_tokens: Option<i32>,
    pub accumulated_output_tokens: Option<i32>,
    pub message_count: usize,
    pub schedule_id: Option<String>,
    pub recipe_json: Option<String>,
    pub user_recipe_values_json: Option<String>,
    pub model_config_json: Option<String>,
}

/// Conversation message 在 repository 层的表示
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ConversationMessage {
    pub role: String,
    pub content: Value,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub metadata: Value,
}

/// Session list 查询参数
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct SessionListQuery {
    pub session_type: Option<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
    pub order_by: Option<SessionOrderBy>,
}

/// Session 排序字段
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionOrderBy {
    CreatedAt,
    UpdatedAt,
    Title,
}

impl Default for SessionOrderBy {
    fn default() -> Self {
        Self::UpdatedAt
    }
}

/// 更新 session metadata 的请求
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct UpdateSessionMetadata {
    pub title: Option<String>,
    pub user_set_name: Option<bool>,
    pub working_dir: Option<String>,
    pub extension_data: Option<Value>,
}

/// 保存 conversation 的请求
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SaveConversationRequest {
    pub session_id: SessionId,
    pub thread_id: ThreadId,
    pub messages: Vec<ConversationMessage>,
}

/// Session Repository trait
///
/// 定义 session 存储和检索的核心接口，不依赖任何特定运行时。
pub trait SessionRepository {
    /// 根据 session_id 获取 session 详情
    ///
    /// 返回 None 表示 session 不存在
    fn get_session(&self, session_id: &SessionId) -> ThreadStoreResult<Option<SessionDetail>>;

    /// 列出 sessions，支持过滤和分页
    fn list_sessions(&self, query: &SessionListQuery) -> ThreadStoreResult<Vec<SessionDetail>>;

    /// 更新 session metadata
    ///
    /// 只更新请求中非 None 的字段
    fn update_metadata(
        &self,
        session_id: &SessionId,
        update: &UpdateSessionMetadata,
    ) -> ThreadStoreResult<()>;

    /// 保存 conversation messages
    ///
    /// 根据实现策略可以是追加、替换或合并
    fn save_conversation(&self, request: &SaveConversationRequest) -> ThreadStoreResult<()>;

    /// 获取 conversation messages
    fn get_conversation(
        &self,
        session_id: &SessionId,
        thread_id: &ThreadId,
    ) -> ThreadStoreResult<Vec<ConversationMessage>>;

    /// 删除 session 及其所有相关数据
    fn delete_session(&self, session_id: &SessionId) -> ThreadStoreResult<()>;

    /// 检查 session 是否存在
    fn session_exists(&self, session_id: &SessionId) -> ThreadStoreResult<bool> {
        self.get_session(session_id).map(|opt| opt.is_some())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_metadata_should_serialize_with_required_fields() {
        let metadata = SessionMetadata {
            id: SessionId::new("session-1"),
            title: "测试会话".to_string(),
            model: "claude-3-5-sonnet".to_string(),
            session_type: "user".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
            working_dir: Some("/tmp/workspace".to_string()),
            user_set_name: false,
            provider_name: Some("anthropic".to_string()),
            extension_data: serde_json::json!({}),
        };

        let encoded = serde_json::to_string(&metadata).expect("应该能序列化");
        assert!(encoded.contains("session-1"));
        assert!(encoded.contains("测试会话"));
    }

    #[test]
    fn session_list_query_defaults_should_be_empty() {
        let query = SessionListQuery::default();
        assert_eq!(query.session_type, None);
        assert_eq!(query.limit, None);
        assert_eq!(query.offset, None);
    }

    #[test]
    fn update_session_metadata_should_allow_partial_updates() {
        let update = UpdateSessionMetadata {
            title: Some("新标题".to_string()),
            user_set_name: None,
            working_dir: None,
            extension_data: None,
        };

        assert!(update.title.is_some());
        assert!(update.user_set_name.is_none());
    }

    #[test]
    fn conversation_message_should_serialize_role_and_content() {
        let message = ConversationMessage {
            role: "user".to_string(),
            content: serde_json::json!([{"type": "text", "text": "你好"}]),
            created_at: Utc::now(),
            metadata: serde_json::json!({"visible": true}),
        };

        let encoded = serde_json::to_string(&message).expect("应该能序列化");
        assert!(encoded.contains("user"));
        assert!(encoded.contains("你好"));
    }
}
