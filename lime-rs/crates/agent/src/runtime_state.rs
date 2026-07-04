//! Agent runtime 状态管理
//!
//! 管理迁移期 Agent runtime 实例和相关状态
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
#[cfg(test)]
use aster::skills::{global_registry, load_skills_from_directory, SkillSource};
use aster::tools::{create_shared_history, EditTool, Tool, WriteTool};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;

use crate::aster_session_store::LimeSessionStore;
use crate::credential_bridge::CredentialBridge;
use crate::protocol::AgentActionRequiredScope;
#[cfg(test)]
use crate::queued_turn::QueuedTurnSnapshot;
use crate::request_tool_policy::{
    compat_aster_elicitation_response_message, confirm_aster_tool_action,
    resolve_request_tool_policy_with_mode, stream_aster_message_reply_with_policy,
    RequestToolPolicyMode,
};
use lime_core::database::DbConnection;
use lime_mcp::McpBridgeSnapshot;
use std::collections::HashSet;

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

/// Agent runtime 全局状态
///
/// 在 Tauri 应用中作为 managed state 使用
pub struct AgentRuntimeState {
    /// 迁移期 Agent 实例
    agent: Arc<RwLock<Option<Agent>>>,
    /// 当前活跃的取消令牌（用于中止正在进行的对话）
    cancel_tokens: Arc<RwLock<std::collections::HashMap<String, CancellationToken>>>,
    /// 凭证桥接器
    credential_bridge: CredentialBridge,
    /// Agent 初始化状态缓存（避免每次都获取锁）
    initialized_cache: Arc<AtomicBool>,
    /// 已同步到 Aster extension manager 的 MCP bridge extension 名称。
    registered_mcp_bridges: Arc<RwLock<HashSet<String>>>,
}

impl Clone for AgentRuntimeState {
    fn clone(&self) -> Self {
        Self {
            agent: self.agent.clone(),
            cancel_tokens: self.cancel_tokens.clone(),
            credential_bridge: CredentialBridge::new(),
            initialized_cache: self.initialized_cache.clone(),
            registered_mcp_bridges: self.registered_mcp_bridges.clone(),
        }
    }
}

impl Default for AgentRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentRuntimeState {
    /// 创建新的 Agent runtime 状态
    pub fn new() -> Self {
        Self {
            agent: Arc::new(RwLock::new(None)),
            cancel_tokens: Arc::new(RwLock::new(std::collections::HashMap::new())),
            credential_bridge: CredentialBridge::new(),
            initialized_cache: Arc::new(AtomicBool::new(false)),
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
        let runtime_root = crate::runtime_support::require_runtime_dirs()?;
        tracing::info!(
            "[AgentRuntime] Aster 运行目录已准备: {}",
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
            tracing::info!("[AgentRuntime] 创建 LimeSessionStore 成功");

            // 创建 Agent（启用 Ask/LSP 回调）并注入 SessionStore
            let tool_config = crate::create_lime_tool_config();
            let runtime_store = crate::runtime_support::require_runtime_store()?;
            let mut agent = Agent::with_tool_config(tool_config)
                .with_session_store(session_store)
                .with_thread_runtime_store(runtime_store);

            // 验证 session_store 是否被正确设置
            let has_store = agent.session_store().is_some();
            tracing::info!(
                "[AgentRuntime] Agent 创建完成，session_store 已设置: {}",
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
                "[AgentRuntime] Agent 初始化成功，已注入 LimeSessionStore、Lime 身份和 Skills"
            );
        } else {
            // 更新缓存
            self.initialized_cache.store(true, Ordering::Relaxed);
            tracing::debug!("[AgentRuntime] Agent 已初始化，跳过");
        }
        Ok(())
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

    pub(crate) fn credential_bridge(&self) -> &CredentialBridge {
        &self.credential_bridge
    }

    pub(crate) async fn register_native_tool(&self, tool: Box<dyn Tool>) -> Result<(), String> {
        let tool_name = tool.name().to_string();
        let registry_arc = {
            let agent_guard = self.agent.read().await;
            let agent = agent_guard.as_ref().ok_or("Agent not initialized")?;
            agent.tool_registry().clone()
        };
        let mut registry = registry_arc.write().await;
        registry.register(tool);
        tracing::info!("[AgentRuntime] Native tool registered: {}", tool_name);
        Ok(())
    }

    /// 注册 App Server current 主链提供的 memory native tools。
    pub async fn register_memory_store_tools(
        &self,
        gateway: Arc<dyn crate::native_tools::MemoryStoreGateway>,
    ) -> Result<(), String> {
        for tool in crate::native_tools::create_memory_tools(gateway.clone()) {
            self.register_native_tool(tool).await?;
        }
        Ok(())
    }

    /// 注册 App Server current 主链提供的 image native tools。
    pub async fn register_image_task_tools(
        &self,
        gateway: Arc<dyn crate::native_tools::ImageTaskGateway>,
    ) -> Result<(), String> {
        for tool in crate::native_tools::create_image_tools(gateway.clone()) {
            self.register_native_tool(tool).await?;
        }
        Ok(())
    }

    /// 安装 current live execution process gateway，由 lime-agent 内部适配为 Aster hook。
    pub async fn install_live_execution_process_gateway(
        &self,
        gateway: Arc<dyn crate::live_execution_process::LiveExecutionProcessGateway>,
    ) -> Result<(), String> {
        let hook = crate::live_execution_process::RuntimeLiveExecutionProcessHook::new(gateway);
        self.with_agent_mut(|agent| agent.set_native_tool_execution_hook(Some(Arc::new(hook))))
            .await
            .map(|_| ())
    }

    /// 创建新的取消令牌
    pub async fn create_cancel_token(&self, session_id: &str) -> CancellationToken {
        let token = CancellationToken::new();
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

        let message = compat_aster_elicitation_response_message(
            trimmed_request_id.to_string(),
            user_data,
            action_scope,
        );
        let session_config = SessionConfigBuilder::new(trimmed_session_id)
            .include_context_trace(true)
            .build();

        let agent_arc = self.get_agent_arc();
        let guard = agent_arc.read().await;
        let agent = guard.as_ref().ok_or("Agent not initialized")?;
        let request_tool_policy = resolve_request_tool_policy_with_mode(
            Some(false),
            Some(RequestToolPolicyMode::Disabled),
        );
        let stream = stream_aster_message_reply_with_policy(
            agent,
            message,
            None,
            session_config,
            None,
            &request_tool_policy,
            |_| {},
        )
        .await
        .map_err(|error| format!("提交 elicitation 响应失败: {}", error.message))?;

        if stream
            .text_output
            .contains("Failed to submit elicitation response")
            || stream.text_output.contains("Request not found")
        {
            return Err(format!("提交 elicitation 响应失败: {}", stream.text_output));
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

        let agent_arc = self.get_agent_arc();
        let guard = agent_arc.read().await;
        let agent = guard.as_ref().ok_or("Agent not initialized")?;
        confirm_aster_tool_action(agent, trimmed_request_id.to_string(), confirmed).await;

        Ok(())
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
                    "[AgentRuntime] 清理过期 MCP bridge 失败"
                );
            }
        }

        let bridge_count = active_bridge_names.len();
        *self.registered_mcp_bridges.write().await = active_bridge_names;
        tracing::info!(bridge_count, "[AgentRuntime] MCP bridge 同步完成");
        Ok(())
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

pub use crate::runtime_state_support::SessionConfigBuilder;

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::{Arc, Mutex};
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_aster_state_init() {
        let state = AgentRuntimeState::new();
        assert!(!state.is_initialized().await);

        let runtime_dir = TempDir::new().unwrap();
        crate::runtime_support::ensure_runtime_dirs_with_root(runtime_dir.path().to_path_buf())
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
        let state = AgentRuntimeState::new();
        let session_id = "test-session";

        let token = state.create_cancel_token(session_id).await;
        assert!(!token.is_cancelled());

        assert!(state.cancel_session(session_id).await);
        assert!(token.is_cancelled());

        state.remove_cancel_token(session_id).await;
        assert!(!state.cancel_session(session_id).await);
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
}
