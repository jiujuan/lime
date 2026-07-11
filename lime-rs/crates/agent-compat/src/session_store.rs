//! Session 存储抽象层。
//!
//! `SessionStore` 只作为 Aster reply/session 未迁完前的 compat blocker。
//! 新 session/read-model 能力必须进入 Lime current owner。

use crate::conversation::message::Message;
use crate::conversation::Conversation;
use crate::model::ModelConfig;
use crate::session::extension_data::ExtensionData;
use crate::session::session_record::{Session, SessionType};
use anyhow::Result;
use async_trait::async_trait;
use std::path::PathBuf;

/// Session 存储 trait。
///
/// 迁移期只允许 Lime 注入 current store adapter；不得把它重新作为
/// 对外可插拔 Aster storage API 演进。
#[async_trait]
pub trait SessionStore: Send + Sync {
    /// 创建新 session
    async fn create_session(
        &self,
        working_dir: PathBuf,
        name: String,
        session_type: SessionType,
    ) -> Result<Session>;

    /// 获取 session
    async fn get_session(&self, id: &str, include_messages: bool) -> Result<Session>;

    /// 添加消息到 session
    async fn add_message(&self, session_id: &str, message: &Message) -> Result<()>;

    /// 替换整个对话历史
    async fn replace_conversation(
        &self,
        session_id: &str,
        conversation: &Conversation,
    ) -> Result<()>;

    /// 按类型列出 session
    async fn list_sessions_by_types(&self, types: &[SessionType]) -> Result<Vec<Session>>;

    /// 更新 session 名称
    async fn update_session_name(
        &self,
        session_id: &str,
        name: String,
        user_set: bool,
    ) -> Result<()>;

    /// 更新 session 扩展数据
    async fn update_extension_data(
        &self,
        session_id: &str,
        extension_data: ExtensionData,
    ) -> Result<()>;

    /// 更新 session token 统计
    async fn update_token_stats(&self, session_id: &str, stats: TokenStatsUpdate) -> Result<()>;

    /// 更新 session 的 provider 和 model 配置
    async fn update_provider_config(
        &self,
        session_id: &str,
        provider_name: Option<String>,
        model_config: Option<ModelConfig>,
    ) -> Result<()>;

    /// 搜索聊天历史
    async fn search_chat_history(
        &self,
        query: &str,
        limit: Option<usize>,
        after_date: Option<chrono::DateTime<chrono::Utc>>,
        before_date: Option<chrono::DateTime<chrono::Utc>>,
        exclude_session_id: Option<String>,
    ) -> Result<Vec<ChatHistoryMatch>>;
}

/// 聊天历史搜索结果
#[derive(Debug, Clone)]
pub struct ChatHistoryMatch {
    pub session_id: String,
    pub session_name: String,
    pub message_role: String,
    pub message_content: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub relevance_score: f32,
}

/// Token 统计更新参数
#[derive(Debug, Clone, Default)]
pub struct TokenStatsUpdate {
    pub schedule_id: Option<String>,
    pub total_tokens: Option<i32>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cached_input_tokens: Option<i32>,
    pub cache_creation_input_tokens: Option<i32>,
    pub accumulated_total: Option<i32>,
    pub accumulated_input: Option<i32>,
    pub accumulated_output: Option<i32>,
}
