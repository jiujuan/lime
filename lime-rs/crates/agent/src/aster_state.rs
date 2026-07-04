//! Aster Agent 状态管理
//!
//! 管理 Aster Agent 实例和相关状态
//! 提供 Tauri 应用与 Aster 框架的桥接
//! 支持从 Lime API Key Provider 自动选择凭证
//!
//! ## 重要：SessionStore 注入
//!
//! 为了让 Aster Agent 的消息存储到 Lime 数据库，必须在创建 Agent 时
//! 注入 `LimeSessionStore`，并统一通过 `init_agent_with_db()` 初始化。
//!
//! ## Agent 身份配置
//!
//! 通过 Aster 框架的 `AgentIdentity` API 设置 Lime 专属的 Agent 身份，
//! 包括名称、语言偏好、产品描述等。这是架构层面的正确做法，
//! 而不是简单地追加提示词。
//!
//! ## Skills 集成
//!
//! Agent 初始化时会自动加载 Lime 当前应用数据目录中的 Skills 到
//! aster-rust 的 global_registry，使 AI 能够自动发现和调用这些 Skills。
//!
//! 参考文档：`internal/prd/chat-architecture-redesign.md`

use aster::agents::Agent;
use aster::conversation::message::{
    ActionRequired, ActionRequiredData, ActionRequiredScope, Message, MessageContent,
};
use aster::permission::{Permission, PermissionConfirmation, PrincipalType};
#[cfg(test)]
use aster::skills::{global_registry, load_skills_from_directory, SkillSource};
use aster::tools::{create_shared_history, EditTool, Tool, WriteTool};
use chrono::Utc;
use futures::StreamExt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;

use crate::aster_session_store::LimeSessionStore;
use crate::credential_bridge::CredentialBridge;
use crate::protocol::AgentActionRequiredScope;
#[cfg(test)]
use crate::queued_turn::QueuedTurnSnapshot;
use lime_core::database::DbConnection;
use lime_mcp::McpBridgeSnapshot;
use std::collections::HashSet;

mod provider_config;
pub use provider_config::ProviderConfig;

async fn configure_lime_native_tool_overlay(agent: &mut Agent) {
    agent.add_tool_inspector(Box::new(
        crate::agent_tools::tool_policy_inspector::WorkspaceToolPolicyInspector::new(),
    ));
    // Aster 默认工具池由 Agent::with_tool_config -> register_all_tools 注册。
    // 这里只覆盖 Lime 需要改变策略或收口事实源的工具，不重复接管 Aster 默认工具。
    let shared_history = create_shared_history();
    let registry_arc = agent.tool_registry().clone();
    let mut registry = registry_arc.write().await;
    registry.register(Box::new(
        WriteTool::new(shared_history.clone()).with_require_read_before_overwrite(false),
    ));
    registry.register(Box::new(
        EditTool::new(shared_history).with_require_read_before_edit(false),
    ));
    registry.register(Box::new(crate::tools::ApplyPatchTool));
    registry.register(Box::new(crate::tools::SkillSearchTool));
    // 覆盖默认 SkillTool，避免通用对话默认暴露全部本地 Skills。
    registry.register(Box::new(crate::tools::LimeSkillTool::new()));
}

fn normalize_runtime_action_scope(
    scope: Option<AgentActionRequiredScope>,
) -> Option<ActionRequiredScope> {
    let scope = scope?;
    if scope.session_id.is_none() && scope.thread_id.is_none() && scope.turn_id.is_none() {
        return None;
    }

    Some(ActionRequiredScope {
        session_id: scope.session_id,
        thread_id: scope.thread_id,
        turn_id: scope.turn_id,
    })
}

/// 会话级 turn 排队任务
#[derive(Debug, Clone)]
pub struct QueuedTurnTask<T> {
    pub queued_turn_id: String,
    pub session_id: String,
    pub event_name: String,
    pub message_preview: String,
    pub message_text: String,
    pub created_at: i64,
    pub image_count: usize,
    pub payload: T,
}

impl<T> QueuedTurnTask<T> {
    #[cfg(test)]
    fn snapshot(&self, position: usize) -> QueuedTurnSnapshot {
        QueuedTurnSnapshot {
            queued_turn_id: self.queued_turn_id.clone(),
            message_preview: self.message_preview.clone(),
            message_text: self.message_text.clone(),
            created_at: self.created_at,
            image_count: self.image_count,
            position,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct RuntimeInterruptMarker {
    pub source: String,
    pub reason: String,
    pub requested_at: String,
}

/// Aster Agent 全局状态
///
/// 在 Tauri 应用中作为 managed state 使用
pub struct AsterAgentState {
    /// Aster Agent 实例
    agent: Arc<RwLock<Option<Agent>>>,
    /// 当前活跃的取消令牌（用于中止正在进行的对话）
    cancel_tokens: Arc<RwLock<std::collections::HashMap<String, CancellationToken>>>,
    /// 最近一次显式中断请求（用于 runtime 诊断）
    interrupt_markers: Arc<RwLock<std::collections::HashMap<String, RuntimeInterruptMarker>>>,
    /// 当前 Provider 配置
    current_provider_config: Arc<RwLock<Option<ProviderConfig>>>,
    /// 凭证桥接器
    credential_bridge: CredentialBridge,
    /// Agent 初始化状态缓存（避免每次都获取锁）
    initialized_cache: Arc<AtomicBool>,
    /// Provider 配置状态缓存（避免每次都获取锁）
    provider_configured_cache: Arc<AtomicBool>,
    /// 已同步到 Aster extension manager 的 MCP bridge extension 名称。
    registered_mcp_bridges: Arc<RwLock<HashSet<String>>>,
}

impl Clone for AsterAgentState {
    fn clone(&self) -> Self {
        Self {
            agent: self.agent.clone(),
            cancel_tokens: self.cancel_tokens.clone(),
            interrupt_markers: self.interrupt_markers.clone(),
            current_provider_config: self.current_provider_config.clone(),
            credential_bridge: CredentialBridge::new(),
            initialized_cache: self.initialized_cache.clone(),
            provider_configured_cache: self.provider_configured_cache.clone(),
            registered_mcp_bridges: self.registered_mcp_bridges.clone(),
        }
    }
}

impl Default for AsterAgentState {
    fn default() -> Self {
        Self::new()
    }
}

impl AsterAgentState {
    /// 创建新的 Aster Agent 状态
    pub fn new() -> Self {
        Self {
            agent: Arc::new(RwLock::new(None)),
            cancel_tokens: Arc::new(RwLock::new(std::collections::HashMap::new())),
            interrupt_markers: Arc::new(RwLock::new(std::collections::HashMap::new())),
            current_provider_config: Arc::new(RwLock::new(None)),
            credential_bridge: CredentialBridge::new(),
            initialized_cache: Arc::new(AtomicBool::new(false)),
            provider_configured_cache: Arc::new(AtomicBool::new(false)),
            registered_mcp_bridges: Arc::new(RwLock::new(HashSet::new())),
        }
    }

    /// 初始化 Agent（带数据库连接）
    ///
    /// 创建 Agent 并注入 LimeSessionStore，确保消息存储到 Lime 数据库。
    /// 同时设置 Lime 专属的 Agent 身份（名称、语言、描述）。
    /// 自动加载 Lime 当前应用数据目录中的 Skills 到 aster-rust 的 global_registry。
    ///
    /// 这是 Lime 当前唯一支持的 Agent 初始化入口。
    ///
    /// # 参数
    /// - `db`: 数据库连接，用于创建 SessionStore
    pub async fn init_agent_with_db(&self, db: &DbConnection) -> Result<(), String> {
        let runtime_root = crate::aster_runtime_support::require_aster_runtime_dirs()?;
        tracing::info!(
            "[AsterAgent] Aster 运行目录已准备: {}",
            runtime_root.to_string_lossy()
        );

        // 快速路径：检查缓存
        if self.initialized_cache.load(Ordering::Relaxed) {
            return Ok(());
        }

        let mut agent_guard = self.agent.write().await;
        if agent_guard.is_none() {
            // 创建 SessionStore
            let session_store = Arc::new(LimeSessionStore::new(db.clone()));
            tracing::info!("[AsterAgent] 创建 LimeSessionStore 成功");

            // 创建 Agent（启用 Ask/LSP 回调）并注入 SessionStore
            let tool_config = crate::create_lime_tool_config();
            let runtime_store = crate::aster_runtime_support::require_aster_runtime_store()?;
            let mut agent = Agent::with_tool_config(tool_config)
                .with_session_store(session_store)
                .with_thread_runtime_store(runtime_store);

            // 验证 session_store 是否被正确设置
            let has_store = agent.session_store().is_some();
            tracing::info!(
                "[AsterAgent] Agent 创建完成，session_store 已设置: {}",
                has_store
            );

            // 使用异步方法设置 Lime 专属身份
            let identity = crate::create_lime_identity();
            agent.set_identity(identity).await;
            configure_lime_native_tool_overlay(&mut agent).await;

            // 加载 Lime Skills 到 aster-rust 的 global_registry
            crate::reload_lime_skills();

            *agent_guard = Some(agent);

            // 更新缓存
            self.initialized_cache.store(true, Ordering::Relaxed);

            tracing::info!(
                "[AsterAgent] Agent 初始化成功，已注入 LimeSessionStore、Lime 身份和 Skills"
            );
        } else {
            // 更新缓存
            self.initialized_cache.store(true, Ordering::Relaxed);
            tracing::debug!("[AsterAgent] Agent 已初始化，跳过");
        }
        Ok(())
    }

    /// 重新加载 Lime Skills
    ///
    /// 当用户安装或卸载 Skills 后调用此方法刷新 registry。
    pub fn reload_lime_skills() {
        crate::reload_lime_skills();
    }

    /// 获取 Agent 的只读引用并执行同步操作
    pub async fn with_agent<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&Agent) -> R,
    {
        let guard = self.agent.read().await;
        match guard.as_ref() {
            Some(agent) => Ok(f(agent)),
            None => Err("Agent not initialized".to_string()),
        }
    }

    /// 获取 Agent 的可变引用并执行同步操作
    pub async fn with_agent_mut<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&mut Agent) -> R,
    {
        let mut guard = self.agent.write().await;
        match guard.as_mut() {
            Some(agent) => Ok(f(agent)),
            None => Err("Agent not initialized".to_string()),
        }
    }

    /// 获取 Agent 的 Arc 引用
    ///
    /// 用于需要长期持有 Agent 引用的场景
    pub fn get_agent_arc(&self) -> Arc<RwLock<Option<Agent>>> {
        self.agent.clone()
    }

    /// 注册 App Server current runtime 注入的 native tool。
    ///
    /// Agent 初始化后才能调用；调用方负责保证 tool 背后的事实源属于 current 主链。
    pub async fn register_native_tool(&self, tool: Box<dyn Tool>) -> Result<(), String> {
        let tool_name = tool.name().to_string();
        let registry_arc = {
            let agent_guard = self.agent.read().await;
            let agent = agent_guard.as_ref().ok_or("Agent not initialized")?;
            agent.tool_registry().clone()
        };
        let mut registry = registry_arc.write().await;
        registry.register(tool);
        tracing::info!("[AsterAgent] Native tool registered: {}", tool_name);
        Ok(())
    }

    /// 创建新的取消令牌
    pub async fn create_cancel_token(&self, session_id: &str) -> CancellationToken {
        let should_cancel_immediately = {
            let markers = self.interrupt_markers.read().await;
            markers.contains_key(session_id)
        };
        let token = CancellationToken::new();
        if should_cancel_immediately {
            token.cancel();
        }
        let mut tokens = self.cancel_tokens.write().await;
        tokens.insert(session_id.to_string(), token.clone());
        token
    }

    /// 取消指定会话的操作
    pub async fn cancel_session(&self, session_id: &str) -> bool {
        let tokens = self.cancel_tokens.read().await;
        if let Some(token) = tokens.get(session_id) {
            token.cancel();
            true
        } else {
            false
        }
    }

    /// 移除取消令牌
    pub async fn remove_cancel_token(&self, session_id: &str) {
        let mut tokens = self.cancel_tokens.write().await;
        tokens.remove(session_id);
    }

    pub async fn record_interrupt_request(
        &self,
        session_id: &str,
        source: &str,
        reason: &str,
    ) -> Option<RuntimeInterruptMarker> {
        let trimmed_session_id = session_id.trim();
        let trimmed_source = source.trim();
        let trimmed_reason = reason.trim();
        if trimmed_session_id.is_empty() || trimmed_source.is_empty() || trimmed_reason.is_empty() {
            return None;
        }

        let marker = RuntimeInterruptMarker {
            source: trimmed_source.to_string(),
            reason: trimmed_reason.to_string(),
            requested_at: Utc::now().to_rfc3339(),
        };
        let mut markers = self.interrupt_markers.write().await;
        markers.insert(trimmed_session_id.to_string(), marker.clone());
        Some(marker)
    }

    pub async fn get_interrupt_marker(&self, session_id: &str) -> Option<RuntimeInterruptMarker> {
        let trimmed_session_id = session_id.trim();
        if trimmed_session_id.is_empty() {
            return None;
        }

        let markers = self.interrupt_markers.read().await;
        markers.get(trimmed_session_id).cloned()
    }

    pub async fn clear_interrupt_marker(&self, session_id: &str) {
        let trimmed_session_id = session_id.trim();
        if trimmed_session_id.is_empty() {
            return;
        }

        let mut markers = self.interrupt_markers.write().await;
        markers.remove(trimmed_session_id);
    }

    /// 提交用户补充信息，恢复等待中的 ask_user / elicitation。
    pub async fn submit_elicitation_response(
        &self,
        session_id: &str,
        request_id: &str,
        user_data: serde_json::Value,
        action_scope: Option<AgentActionRequiredScope>,
    ) -> Result<(), String> {
        let trimmed_session_id = session_id.trim();
        if trimmed_session_id.is_empty() {
            return Err("session_id 不能为空".to_string());
        }
        let trimmed_request_id = request_id.trim();
        if trimmed_request_id.is_empty() {
            return Err("request_id 不能为空".to_string());
        }

        let message =
            Message::user().with_content(MessageContent::ActionRequired(ActionRequired {
                data: ActionRequiredData::ElicitationResponse {
                    id: trimmed_request_id.to_string(),
                    user_data,
                },
                scope: normalize_runtime_action_scope(action_scope),
            }));
        let session_config = SessionConfigBuilder::new(trimmed_session_id)
            .include_context_trace(true)
            .build();

        let agent_arc = self.get_agent_arc();
        let guard = agent_arc.read().await;
        let agent = guard.as_ref().ok_or("Agent not initialized")?;
        let mut stream = agent
            .reply(message, session_config, None)
            .await
            .map_err(|e| format!("提交 elicitation 响应失败: {e}"))?;

        while let Some(event_result) = stream.next().await {
            match event_result {
                Ok(aster::agents::AgentEvent::Message(message)) => {
                    let text = message.as_concat_text();
                    if text.contains("Failed to submit elicitation response")
                        || text.contains("Request not found")
                    {
                        return Err(format!("提交 elicitation 响应失败: {text}"));
                    }
                }
                Ok(_) => {}
                Err(error) => {
                    return Err(format!("提交 elicitation 响应失败: {error}"));
                }
            }
        }

        Ok(())
    }

    /// 提交工具确认结果，恢复等待中的 tool_confirmation。
    pub async fn confirm_tool_action(
        &self,
        request_id: &str,
        confirmed: bool,
    ) -> Result<(), String> {
        let trimmed_request_id = request_id.trim();
        if trimmed_request_id.is_empty() {
            return Err("request_id 不能为空".to_string());
        }

        let permission = if confirmed {
            Permission::AllowOnce
        } else {
            Permission::DenyOnce
        };
        let confirmation = PermissionConfirmation {
            principal_type: PrincipalType::Tool,
            permission,
        };

        let agent_arc = self.get_agent_arc();
        let guard = agent_arc.read().await;
        let agent = guard.as_ref().ok_or("Agent not initialized")?;
        agent
            .handle_confirmation(trimmed_request_id.to_string(), confirmation)
            .await;

        Ok(())
    }

    // ------------------------------------------------------------------------
    // 项目上下文支持
    // ------------------------------------------------------------------------

    /// 构建带项目上下文的 System Prompt
    ///
    /// 加载项目的人设、素材、模板配置，构建完整的 AI 提示词。
    ///
    /// # 参数
    /// - `db`: 数据库连接
    /// - `project_id`: 项目 ID
    ///
    /// # 返回
    /// - 成功返回构建好的 System Prompt
    /// - 失败返回错误信息
    pub fn build_project_system_prompt(
        db: &DbConnection,
        project_id: &str,
    ) -> Result<String, String> {
        crate::build_project_system_prompt(db, project_id)
    }

    pub async fn sync_mcp_bridges(&self, snapshots: Vec<McpBridgeSnapshot>) -> Result<(), String> {
        let agent_guard = self.agent.read().await;
        let Some(agent) = agent_guard.as_ref() else {
            return Ok(());
        };

        let mut active_bridge_names = HashSet::new();
        for snapshot in snapshots {
            let extension_name =
                crate::agent_tools::catalog::mcp_extension_runtime_name(&snapshot.server_name);
            let surface = crate::agent_tools::catalog::build_mcp_extension_surface(
                &extension_name,
                snapshot.description.clone(),
                &snapshot.tools,
            );
            if !surface.has_tools() {
                continue;
            }
            let bridge_name = surface.extension_name.clone();

            let client: Arc<
                tokio::sync::Mutex<Box<dyn aster::agents::mcp_client::McpClientTrait>>,
            > = Arc::new(tokio::sync::Mutex::new(Box::new(
                crate::mcp_bridge::McpBridgeClient::new(
                    snapshot.server_name.clone(),
                    snapshot.running_service,
                    snapshot.handler,
                    snapshot.server_info.clone(),
                ),
            )));
            let config = aster::agents::extension::ExtensionConfig::Builtin {
                name: bridge_name.clone(),
                display_name: Some(snapshot.server_name.clone()),
                description: surface.description,
                timeout: None,
                bundled: Some(false),
                available_tools: surface.available_tools,
                deferred_loading: surface.deferred_loading,
                always_expose_tools: surface.always_expose_tools,
                allowed_caller: surface.allowed_caller,
            };
            agent
                .extension_manager
                .add_client(
                    bridge_name.clone(),
                    config,
                    client,
                    snapshot.server_info,
                    None,
                )
                .await;
            active_bridge_names.insert(bridge_name);
        }

        let previous_bridge_names = self.registered_mcp_bridges.read().await.clone();
        for stale_name in previous_bridge_names.difference(&active_bridge_names) {
            if let Err(error) = agent.remove_extension(stale_name).await {
                tracing::warn!(
                    extension_name = %stale_name,
                    error = %error,
                    "[AsterAgent] 清理过期 MCP bridge 失败"
                );
            }
        }

        let bridge_count = active_bridge_names.len();
        *self.registered_mcp_bridges.write().await = active_bridge_names;
        tracing::info!(bridge_count, "[AsterAgent] MCP bridge 同步完成");
        Ok(())
    }

    /// 注册 MCP 桥接客户端。
    ///
    /// 该入口保留给测试和未来单点注册场景；生产主链使用 `sync_mcp_bridges`。
    pub async fn register_mcp_bridge(&self, snapshot: McpBridgeSnapshot) -> Result<(), String> {
        self.sync_mcp_bridges(vec![snapshot]).await
    }

    /// 检查 Agent 是否已初始化
    pub async fn is_initialized(&self) -> bool {
        // 快速路径：检查缓存
        if self.initialized_cache.load(Ordering::Relaxed) {
            return true;
        }

        // 慢速路径：检查实际状态
        let result = self.agent.read().await.is_some();
        self.initialized_cache.store(result, Ordering::Relaxed);
        result
    }
}

pub use crate::aster_state_support::{message_helpers, SessionConfigBuilder};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credential_bridge::RuntimeProviderProtocol;
    use crate::provider_continuation_state::{
        ProviderContinuationCapability, ProviderContinuationCapable, ProviderContinuationState,
    };
    use std::fs;
    use std::sync::{Arc, Mutex};
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_aster_state_init() {
        let state = AsterAgentState::new();
        assert!(!state.is_initialized().await);

        let runtime_dir = TempDir::new().unwrap();
        crate::aster_runtime_support::ensure_aster_runtime_dirs_with_root(
            runtime_dir.path().to_path_buf(),
        )
        .unwrap();

        let db: DbConnection =
            Arc::new(Mutex::new(rusqlite::Connection::open_in_memory().unwrap()));
        {
            let conn = db.lock().unwrap();
            lime_core::database::schema::create_tables(&conn).unwrap();
        }

        state.init_agent_with_db(&db).await.unwrap();
        assert!(state.is_initialized().await);

        let agent_arc = state.get_agent_arc();
        let agent_guard = agent_arc.read().await;
        let agent = agent_guard.as_ref().expect("agent should exist");
        let registry = agent.tool_registry().read().await;
        assert!(registry.contains_native("WebFetch"));
        assert!(registry.contains_native("WebSearch"));
    }

    #[tokio::test]
    async fn test_cancel_token() {
        let state = AsterAgentState::new();
        let session_id = "test-session";

        let token = state.create_cancel_token(session_id).await;
        assert!(!token.is_cancelled());

        assert!(state.cancel_session(session_id).await);
        assert!(token.is_cancelled());

        state.remove_cancel_token(session_id).await;
        assert!(!state.cancel_session(session_id).await);
    }

    #[tokio::test]
    async fn test_interrupt_marker_lifecycle() {
        let state = AsterAgentState::new();
        let session_id = "session-interrupt";

        let marker = state
            .record_interrupt_request(session_id, "user", "用户主动停止当前执行")
            .await
            .expect("应记录中断标记");
        assert_eq!(marker.source, "user");
        assert_eq!(marker.reason, "用户主动停止当前执行");
        assert_eq!(
            state
                .get_interrupt_marker(session_id)
                .await
                .as_ref()
                .map(|value| value.reason.as_str()),
            Some("用户主动停止当前执行")
        );

        let token = state.create_cancel_token(session_id).await;
        assert!(token.is_cancelled());
        assert!(state.get_interrupt_marker(session_id).await.is_some());

        state
            .record_interrupt_request(session_id, "user", "第二次停止")
            .await
            .expect("应重新记录中断标记");
        state.clear_interrupt_marker(session_id).await;
        assert!(state.get_interrupt_marker(session_id).await.is_none());
    }

    #[test]
    fn test_session_turn_queue_manager_snapshot() {
        let task = QueuedTurnTask {
            queued_turn_id: "turn-restore-1".to_string(),
            session_id: "session-restore".to_string(),
            event_name: "event-restore-1".to_string(),
            message_preview: "restore-1".to_string(),
            message_text: "restore body 1".to_string(),
            created_at: 1_700_000_000_000,
            image_count: 0,
            payload: serde_json::json!({ "message": "restore-1" }),
        };

        let snapshot = task.snapshot(2);
        assert_eq!(snapshot.queued_turn_id, "turn-restore-1");
        assert_eq!(snapshot.position, 2);
        assert_eq!(snapshot.message_text, "restore body 1");
    }

    #[test]
    fn test_provider_config_treats_chat_completions_as_history_replay_only() {
        let config = ProviderConfig {
            provider_name: "openai".to_string(),
            provider_selector: Some("openai".to_string()),
            model_name: "gpt-5-codex".to_string(),
            api_key: None,
            base_url: None,
            credential_uuid: None,
            reasoning_effort: None,
            protocol: Some(RuntimeProviderProtocol::ChatCompletions),
            toolshim: false,
            toolshim_model: None,
        };

        assert_eq!(
            config.provider_continuation_capability(),
            ProviderContinuationCapability::HistoryReplayOnly
        );
        assert_eq!(
            config.provider_continuation_state(),
            ProviderContinuationState::HistoryReplayOnly
        );
    }

    #[test]
    fn test_provider_config_detects_previous_response_id_capability_when_forced() {
        let config = ProviderConfig {
            provider_name: "openai".to_string(),
            provider_selector: Some("openai".to_string()),
            model_name: "gpt-4o".to_string(),
            api_key: None,
            base_url: None,
            credential_uuid: None,
            reasoning_effort: None,
            protocol: Some(RuntimeProviderProtocol::Responses),
            toolshim: false,
            toolshim_model: None,
        };

        assert_eq!(
            config.provider_continuation_capability(),
            ProviderContinuationCapability::PreviousResponseId
        );
        assert_eq!(
            config.provider_continuation_state(),
            ProviderContinuationState::HistoryReplayOnly
        );
    }

    #[test]
    fn test_provider_config_treats_retired_kiro_as_history_replay_only() {
        let config = ProviderConfig {
            provider_name: "kiro".to_string(),
            provider_selector: Some("kiro".to_string()),
            model_name: "claude-3.7-sonnet".to_string(),
            api_key: None,
            base_url: None,
            credential_uuid: None,
            reasoning_effort: None,
            protocol: None,
            toolshim: false,
            toolshim_model: None,
        };

        assert_eq!(
            config.provider_continuation_capability(),
            ProviderContinuationCapability::HistoryReplayOnly
        );
        assert_eq!(
            config.provider_continuation_state(),
            ProviderContinuationState::HistoryReplayOnly
        );
    }

    // =========================================================================
    // Skills 集成测试
    // =========================================================================

    /// 测试辅助函数：创建测试用的 Skill 目录
    fn create_test_skill(skills_dir: &std::path::Path, skill_name: &str, description: &str) {
        let skill_path = skills_dir.join(skill_name);
        fs::create_dir_all(&skill_path).unwrap();
        let skill_md = format!(
            r#"---
name: {}
description: {}
---

# {}

这是一个测试 Skill。
"#,
            skill_name, description, skill_name
        );
        fs::write(skill_path.join("SKILL.md"), skill_md).unwrap();
    }

    /// 测试：load_skills_from_directory 能正确加载 Skills
    #[test]
    fn test_load_skills_from_directory() {
        let temp_dir = TempDir::new().unwrap();
        let skills_dir = temp_dir.path();

        // 创建测试 Skills
        create_test_skill(skills_dir, "test-skill-1", "第一个测试技能");
        create_test_skill(skills_dir, "test-skill-2", "第二个测试技能");

        // 加载 Skills
        let skills = load_skills_from_directory(skills_dir, SkillSource::User);

        // 验证
        assert_eq!(skills.len(), 2);
        let names: Vec<_> = skills.iter().map(|s| s.display_name.as_str()).collect();
        assert!(names.contains(&"test-skill-1"));
        assert!(names.contains(&"test-skill-2"));
    }

    /// 测试：空目录返回空列表
    #[test]
    fn test_load_skills_empty_directory() {
        let temp_dir = TempDir::new().unwrap();
        let skills = load_skills_from_directory(temp_dir.path(), SkillSource::User);
        assert!(skills.is_empty());
    }

    /// 测试：不存在的目录返回空列表
    #[test]
    fn test_load_skills_nonexistent_directory() {
        let nonexistent = std::path::Path::new("/nonexistent/path/to/skills");
        let skills = load_skills_from_directory(nonexistent, SkillSource::User);
        assert!(skills.is_empty());
    }

    /// 测试：global_registry 能正确注册和查找 Skills
    #[test]
    fn test_global_registry_register_and_find() {
        let temp_dir = TempDir::new().unwrap();
        let skills_dir = temp_dir.path();

        // 创建测试 Skill
        create_test_skill(skills_dir, "registry-test-skill", "注册表测试技能");

        // 加载并注册到 global_registry
        let skills = load_skills_from_directory(skills_dir, SkillSource::User);
        let registry = global_registry();

        if let Ok(mut registry_guard) = registry.write() {
            for skill in skills {
                registry_guard.register(skill);
            }
        }

        // 验证能找到注册的 Skill
        if let Ok(registry_guard) = registry.read() {
            let found = registry_guard.find("registry-test-skill");
            assert!(found.is_some());
            assert_eq!(found.unwrap().display_name, "registry-test-skill");
        }
    }

    /// 测试：reload_lime_skills 不会 panic（即使目录不存在）
    #[test]
    fn test_reload_lime_skills_no_panic() {
        // 这个测试确保 reload_lime_skills 在各种情况下都不会 panic
        // 即使当前 Skills 目录不存在
        AsterAgentState::reload_lime_skills();
        // 如果没有 panic，测试通过
    }
}
