//! Agent 会话存储 DTO 与轻量归一化工具。

use lime_core::database::dao::agent_timeline::{AgentThreadItem, AgentThreadTurn};

use super::session_store_subagent_context::{ChildSubagentSession, SubagentParentContext};
use crate::protocol::AgentMessage as RuntimeAgentMessage;
use crate::session_execution_runtime::SessionExecutionRuntime;

/// 会话信息（简化版）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<i64>,
    pub messages_count: usize,
    pub execution_strategy: Option<String>,
    pub model: Option<String>,
    pub working_dir: Option<String>,
    pub workspace_id: Option<String>,
}

/// 会话详情（包含消息）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SessionDetail {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub thread_id: String,
    pub model: Option<String>,
    pub working_dir: Option<String>,
    pub workspace_id: Option<String>,
    pub messages: Vec<RuntimeAgentMessage>,
    pub execution_strategy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_runtime: Option<SessionExecutionRuntime>,
    pub turns: Vec<AgentThreadTurn>,
    pub items: Vec<AgentThreadItem>,
    #[serde(default)]
    pub todo_items: Vec<SessionTodoItem>,
    #[serde(default)]
    pub child_subagent_sessions: Vec<ChildSubagentSession>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subagent_parent_context: Option<SubagentParentContext>,
}

impl SessionDetail {
    pub fn is_persisted_empty(&self) -> bool {
        self.messages.is_empty()
            && self.turns.is_empty()
            && self.items.is_empty()
            && self.todo_items.is_empty()
            && self.child_subagent_sessions.is_empty()
            && self.subagent_parent_context.is_none()
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionTodoStatus {
    Pending,
    InProgress,
    Completed,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct SessionTodoItem {
    pub content: String,
    pub status: SessionTodoStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_form: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct CreateSessionRecordInput {
    pub session_id: Option<String>,
    pub title: Option<String>,
    pub model: Option<String>,
    pub system_prompt: Option<String>,
    pub working_dir: Option<String>,
    pub workspace_id: Option<String>,
    pub execution_strategy: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct PersistedSessionMetadata {
    pub system_prompt: Option<String>,
    pub working_dir: Option<String>,
    pub execution_strategy: Option<String>,
}

pub(super) fn normalize_optional_text(value: Option<String>) -> Option<String> {
    let trimmed = value?.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

pub(super) fn normalize_optional_nonempty_body(value: Option<String>) -> Option<String> {
    let text = value?;
    if text.trim().is_empty() {
        None
    } else {
        Some(text)
    }
}
