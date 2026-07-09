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
//! `lime-skills` current registry，使 AI 能够自动发现和调用这些 Skills。
//!
//! 参考文档：`internal/prd/chat-architecture-redesign.md`

use aster::agents::Agent;
#[cfg(test)]
use lime_skills::{
    find_skill_by_name, is_registered_skill, load_skills_from_directory, register_skill_directory,
};
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
    action_required_response_input, resolve_request_tool_policy_with_mode,
    stream_runtime_action_required_response_with_policy, submit_runtime_tool_action_confirmation,
    RequestToolPolicyMode,
};
use lime_core::database::DbConnection;
use lime_mcp::McpBridgeSnapshot;

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
    /// Lime current native tool definitions，不再从 Aster ToolRegistry 反推 current surface。
    native_tool_definitions: Arc<
        RwLock<
            std::collections::HashMap<String, tool_runtime::tool_definition::RuntimeToolDefinition>,
        >,
    >,
    /// MCP bridge 运行时注册边界。
    mcp_bridge_registry: Arc<crate::mcp_bridge::McpBridgeRuntimeRegistry>,
}

impl Clone for AgentRuntimeState {
    fn clone(&self) -> Self {
        Self {
            agent: self.agent.clone(),
            cancel_tokens: self.cancel_tokens.clone(),
            credential_bridge: CredentialBridge::new(),
            initialized_cache: self.initialized_cache.clone(),
            native_tool_definitions: self.native_tool_definitions.clone(),
            mcp_bridge_registry: self.mcp_bridge_registry.clone(),
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
            native_tool_definitions: Arc::new(RwLock::new(std::collections::HashMap::new())),
            mcp_bridge_registry: Arc::new(crate::mcp_bridge::McpBridgeRuntimeRegistry::new()),
        }
    }

    /// 初始化 Agent（带数据库连接）
    ///
    /// 创建 Agent 并注入 LimeSessionStore，确保消息存储到 Lime 数据库。
    /// 同时设置 Lime 专属的 Agent 身份（名称、语言、描述）。
    /// 自动加载 Lime 当前应用数据目录中的 Skills 到 `lime-skills` current registry。
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

            // 创建 Agent（启用 Ask 回调）并注入 SessionStore
            let tool_config = crate::runtime_state_support::create_lime_tool_config();
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
            let identity = crate::runtime_state_support::create_lime_identity();
            agent.set_identity(identity).await;
            let native_tool_definitions =
                crate::native_tools::configure_lime_native_tool_overlay(&mut agent).await;
            self.reset_native_tool_definitions(native_tool_definitions)
                .await;

            // 加载 Skills 到 `lime-skills` current registry。
            crate::runtime_state_support::reload_skills();

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

    /// 获取 Agent 的 Arc 引用
    ///
    /// 用于需要长期持有 Agent 引用的场景
    pub(crate) fn get_agent_arc(&self) -> Arc<RwLock<Option<Agent>>> {
        self.agent.clone()
    }

    pub(crate) fn credential_bridge(&self) -> &CredentialBridge {
        &self.credential_bridge
    }

    async fn reset_native_tool_definitions(
        &self,
        definitions: Vec<tool_runtime::tool_definition::RuntimeToolDefinition>,
    ) {
        let mut native_tool_definitions = self.native_tool_definitions.write().await;
        native_tool_definitions.clear();
        for definition in definitions {
            native_tool_definitions.insert(definition.name.clone(), definition);
        }
    }

    pub async fn contains_native_tool(&self, tool_name: &str) -> bool {
        self.native_tool_definitions
            .read()
            .await
            .contains_key(tool_name)
    }

    pub(crate) async fn native_tool_definitions_snapshot(
        &self,
    ) -> Vec<tool_runtime::tool_definition::RuntimeToolDefinition> {
        let mut definitions = self
            .native_tool_definitions
            .read()
            .await
            .values()
            .cloned()
            .collect::<Vec<_>>();
        definitions.sort_by(|left, right| left.name.cmp(&right.name));
        definitions
    }

    pub(crate) async fn register_native_tool(
        &self,
        registration: crate::native_tools::NativeRegistration,
    ) -> Result<(), String> {
        let definition =
            crate::native_tools::register_native_tool_on_agent(&self.agent, registration).await?;
        let tool_name = definition.name.clone();
        self.native_tool_definitions
            .write()
            .await
            .insert(tool_name.clone(), definition);
        tracing::info!("[AgentRuntime] Native tool registered: {}", tool_name);
        Ok(())
    }

    /// 注册 App Server current 主链提供的 memory native tools。
    pub async fn register_memory_store_tools(
        &self,
        gateway: Arc<dyn tool_runtime::memory_store::MemoryStoreGateway>,
    ) -> Result<(), String> {
        for tool in crate::native_tools::create_memory_tools(gateway.clone()) {
            self.register_native_tool(tool).await?;
        }
        Ok(())
    }

    /// 注册 App Server current 主链提供的 image native tools。
    pub async fn register_image_task_tools(
        &self,
        gateway: Arc<dyn tool_runtime::image_task::ImageTaskGateway>,
    ) -> Result<(), String> {
        for tool in crate::native_tools::create_image_tools(gateway.clone()) {
            self.register_native_tool(tool).await?;
        }
        Ok(())
    }

    /// 注册 App Server current 主链提供的 deferred tool search native tool。
    pub async fn register_tool_search_tools(
        &self,
        gateway: Arc<dyn tool_runtime::tool_search::ToolSearchGateway>,
    ) -> Result<(), String> {
        for tool in crate::native_tools::create_tool_search_tools(gateway.clone()) {
            self.register_native_tool(tool).await?;
        }
        Ok(())
    }

    /// 注册 App Server current 主链提供的 MCP resource native tools。
    pub async fn register_mcp_resource_tools(
        &self,
        gateway: Arc<dyn tool_runtime::mcp_resource::McpResourceGateway>,
    ) -> Result<(), String> {
        for tool in crate::native_tools::create_mcp_resource_tools(gateway.clone()) {
            self.register_native_tool(tool).await?;
        }
        Ok(())
    }

    /// 安装 current live execution process gateway，由 lime-agent 内部适配为 Aster hook。
    pub async fn install_live_execution_process_gateway(
        &self,
        gateway: Arc<dyn crate::live_execution_process::LiveExecutionProcessGateway>,
    ) -> Result<(), String> {
        let mut agent_guard = self.agent.write().await;
        let Some(agent) = agent_guard.as_mut() else {
            return Err("Agent not initialized".to_string());
        };
        crate::live_execution_process::install_runtime_live_execution_process_hook(agent, gateway);
        Ok(())
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

        let response =
            action_required_response_input(trimmed_request_id.to_string(), user_data, action_scope);
        let session_config = SessionConfigBuilder::new(trimmed_session_id)
            .include_context_trace(true)
            .build();

        let request_tool_policy = resolve_request_tool_policy_with_mode(
            Some(false),
            Some(RequestToolPolicyMode::Disabled),
        );
        let stream = stream_runtime_action_required_response_with_policy(
            self,
            response,
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

        submit_runtime_tool_action_confirmation(self, trimmed_request_id.to_string(), confirmed)
            .await
            .map_err(|error| error.message)?;

        Ok(())
    }

    pub async fn sync_mcp_bridges(&self, snapshots: Vec<McpBridgeSnapshot>) -> Result<(), String> {
        let agent_guard = self.agent.read().await;
        let Some(agent) = agent_guard.as_ref() else {
            return Ok(());
        };

        let bridge_count = self.mcp_bridge_registry.sync(agent, snapshots).await;
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

pub use agent_runtime::session_config::SessionConfigBuilder;

#[cfg(test)]
mod tests {
    use super::*;
    use aster::conversation::message::{Message, MessageContent};
    use aster::model::ModelConfig;
    use aster::providers::base::{
        Provider, ProviderMetadata, ProviderUsage, SessionNameGenerationExecutionStrategy, Usage,
    };
    use aster::providers::errors::ProviderError;
    use aster::session::SessionType;
    use aster::tool_inspection::{InspectionAction, InspectionResult, ToolInspector};
    use async_trait::async_trait;
    use rmcp::model::CallToolRequestParam;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering as AtomicOrdering};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;
    use tempfile::TempDir;

    struct RuntimeApprovalResumeProvider {
        reply_calls: AtomicUsize,
    }

    impl RuntimeApprovalResumeProvider {
        fn new() -> Self {
            Self {
                reply_calls: AtomicUsize::new(0),
            }
        }

        fn usage(&self) -> ProviderUsage {
            ProviderUsage::new(
                "runtime-approval-resume-provider".to_string(),
                Usage::default(),
            )
        }

        fn observed_tool_response(messages: &[Message]) -> bool {
            messages
                .iter()
                .flat_map(|message| message.content.iter())
                .any(|content| match content {
                    MessageContent::ToolResponse(response) => {
                        response.id == "req-runtime-confirm"
                            && response.tool_result.as_ref().ok().is_some_and(|result| {
                                result.content.iter().any(|content| {
                                    content
                                        .as_text()
                                        .is_some_and(|text| text.text == "runtime-confirmed")
                                })
                            })
                    }
                    _ => false,
                })
        }
    }

    #[async_trait]
    impl Provider for RuntimeApprovalResumeProvider {
        fn metadata() -> ProviderMetadata
        where
            Self: Sized,
        {
            ProviderMetadata::empty()
        }

        fn get_name(&self) -> &str {
            "runtime-approval-resume-provider"
        }

        async fn complete_with_model(
            &self,
            _model_config: &ModelConfig,
            system: &str,
            messages: &[Message],
            tools: &[rmcp::model::Tool],
        ) -> Result<(Message, ProviderUsage), ProviderError> {
            if tools.is_empty() && system.contains("four words or less") {
                return Ok((
                    Message::assistant().with_text("approval resume"),
                    self.usage(),
                ));
            }

            if Self::observed_tool_response(messages) {
                return Ok((
                    Message::assistant().with_text("provider observed resumed tool"),
                    self.usage(),
                ));
            }

            self.reply_calls.fetch_add(1, AtomicOrdering::SeqCst);
            Ok((
                Message::assistant().with_tool_request(
                    "req-runtime-confirm",
                    Ok(CallToolRequestParam {
                        name: RUNTIME_APPROVAL_RESUME_TOOL_NAME.into(),
                        arguments: Some(serde_json::Map::new()),
                    }),
                ),
                self.usage(),
            ))
        }

        fn get_model_config(&self) -> ModelConfig {
            ModelConfig::new("test-model").expect("test model config")
        }

        fn session_name_generation_execution_strategy(
            &self,
        ) -> SessionNameGenerationExecutionStrategy {
            SessionNameGenerationExecutionStrategy::AfterReply
        }
    }

    struct RuntimeApprovalResumeTool;

    const RUNTIME_APPROVAL_RESUME_TOOL_NAME: &str = "memory_list";

    fn runtime_approval_resume_registration() -> crate::native_tools::NativeRegistration {
        crate::native_tools::NativeRegistration::new(
            tool_runtime::tool_definition::RuntimeToolDefinition::new(
                RUNTIME_APPROVAL_RESUME_TOOL_NAME,
                "runtime approval resume regression tool",
                serde_json::json!({
                    "type": "object",
                    "additionalProperties": false
                }),
            ),
            Box::new(RuntimeApprovalResumeTool),
        )
    }

    #[async_trait]
    impl aster::tools::Tool for RuntimeApprovalResumeTool {
        fn name(&self) -> &str {
            RUNTIME_APPROVAL_RESUME_TOOL_NAME
        }

        fn description(&self) -> &str {
            "runtime approval resume regression tool"
        }

        fn input_schema(&self) -> serde_json::Value {
            serde_json::json!({
                "type": "object",
                "additionalProperties": false
            })
        }

        async fn execute(
            &self,
            _params: serde_json::Value,
            _context: &aster::tools::ToolContext,
        ) -> Result<aster::tools::ToolResult, aster::tools::ToolError> {
            Ok(aster::tools::ToolResult::success("runtime-confirmed"))
        }
    }

    struct RuntimeApprovalResumeInspector;

    #[async_trait]
    impl ToolInspector for RuntimeApprovalResumeInspector {
        fn name(&self) -> &'static str {
            "runtime_approval_resume"
        }

        async fn inspect(
            &self,
            tool_requests: &[aster::conversation::message::ToolRequest],
            _messages: &[Message],
        ) -> anyhow::Result<Vec<InspectionResult>> {
            Ok(tool_requests
                .iter()
                .filter_map(|request| {
                    let tool_call = request.tool_call.as_ref().ok()?;
                    (tool_call.name == RUNTIME_APPROVAL_RESUME_TOOL_NAME).then(|| {
                        InspectionResult {
                            tool_request_id: request.id.clone(),
                            action: InspectionAction::RequireApproval(Some(
                                "runtime approval resume regression".to_string(),
                            )),
                            reason: "Runtime approval resume regression requires manual approval"
                                .to_string(),
                            confidence: 1.0,
                            inspector_name: self.name().to_string(),
                            finding_id: None,
                        }
                    })
                })
                .collect())
        }

        fn as_any(&self) -> &dyn std::any::Any {
            self
        }
    }

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
        assert!(state.contains_native_tool("WebFetch").await);
        assert!(state.contains_native_tool("WebSearch").await);
        assert!(state.contains_native_tool("update_plan").await);
        assert!(!state.contains_native_tool("TaskCreate").await);
    }

    #[tokio::test]
    async fn native_tool_availability_tracks_current_registration_names() {
        let state = AgentRuntimeState::new();
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
        assert!(state
            .native_tool_definitions_snapshot()
            .await
            .iter()
            .any(|definition| definition.name == "update_plan"));
        assert!(
            !state
                .contains_native_tool(RUNTIME_APPROVAL_RESUME_TOOL_NAME)
                .await
        );

        state
            .register_native_tool(runtime_approval_resume_registration())
            .await
            .unwrap();

        assert!(
            state
                .contains_native_tool(RUNTIME_APPROVAL_RESUME_TOOL_NAME)
                .await
        );
        assert!(state
            .native_tool_definitions_snapshot()
            .await
            .iter()
            .any(
                |definition| definition.name == RUNTIME_APPROVAL_RESUME_TOOL_NAME
                    && definition.description == "runtime approval resume regression tool"
            ));
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

    #[tokio::test]
    async fn confirm_tool_action_resumes_pending_aster_tool_execution() {
        let state = AgentRuntimeState::new();
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

        let session_id = {
            let agent_arc = state.get_agent_arc();
            let agent_guard = agent_arc.read().await;
            let agent = agent_guard.as_ref().expect("agent should exist");
            let store = agent.session_store().expect("session store").clone();
            let session = store
                .create_session(
                    runtime_dir.path().to_path_buf(),
                    "runtime approval resume".to_string(),
                    SessionType::User,
                )
                .await
                .expect("create session");
            session.id
        };

        state
            .register_native_tool(runtime_approval_resume_registration())
            .await
            .expect("register approval resume tool");

        {
            let agent_arc = state.get_agent_arc();
            let mut agent_guard = agent_arc.write().await;
            let agent = agent_guard.as_mut().expect("agent should exist");
            agent.add_tool_inspector(Box::new(RuntimeApprovalResumeInspector));
            agent
                .update_provider(Arc::new(RuntimeApprovalResumeProvider::new()), &session_id)
                .await
                .expect("update provider");
        }

        let events: Arc<Mutex<Vec<crate::protocol::AgentEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let (approval_tx, mut approval_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
        let stream_state = state.clone();
        let stream_events = events.clone();
        let stream_session_id = session_id.clone();
        let mut stream_task = tokio::spawn(async move {
            let session_config = SessionConfigBuilder::new(stream_session_id)
                .max_turns(3)
                .include_context_trace(true)
                .build();
            let request_tool_policy = resolve_request_tool_policy_with_mode(
                Some(false),
                Some(RequestToolPolicyMode::Disabled),
            );
            crate::request_tool_policy::stream_runtime_reply_with_policy(
                &stream_state,
                "run approval resume tool",
                None,
                session_config,
                None,
                &request_tool_policy,
                move |event| {
                    if let crate::protocol::AgentEvent::ActionRequired {
                        request_id,
                        action_type,
                        ..
                    } = event
                    {
                        if action_type == "tool_confirmation" {
                            let _ = approval_tx.send(request_id.clone());
                        }
                    }
                    stream_events.lock().unwrap().push(event.clone());
                },
            )
            .await
        });

        let request_id = tokio::select! {
            approval = approval_rx.recv() => match approval {
                Some(request_id) => request_id,
                None => {
                    let detail = if stream_task.is_finished() {
                        match stream_task.await.expect("stream task should join") {
                            Ok(execution) => execution.text_output,
                            Err(error) => error.message,
                        }
                    } else {
                        "approval channel closed before stream finished".to_string()
                    };
                    panic!(
                        "approval request channel closed before a tool confirmation arrived; detail={detail}; events={:?}",
                        events.lock().unwrap()
                    );
                }
            },
            stream = &mut stream_task => {
                let detail = match stream.expect("stream task should join") {
                    Ok(execution) => execution.text_output,
                    Err(error) => error.message,
                };
                panic!(
                    "approval request should arrive before stream finishes; detail={detail}; events={:?}",
                    events.lock().unwrap()
                );
            }
            _ = tokio::time::sleep(Duration::from_secs(5)) => {
                stream_task.abort();
                panic!(
                    "approval request should arrive before timeout; events={:?}",
                    events.lock().unwrap()
                );
            }
        };
        assert_eq!(request_id, "req-runtime-confirm");

        state
            .confirm_tool_action(&request_id, true)
            .await
            .expect("confirm tool action");

        let stream_result = tokio::time::timeout(Duration::from_secs(10), stream_task)
            .await
            .expect("stream should finish")
            .expect("stream task should join")
            .expect("stream should succeed");
        assert!(stream_result
            .text_output
            .contains("provider observed resumed tool"));

        let events = events.lock().unwrap();
        assert!(events.iter().any(|event| matches!(
            event,
            crate::protocol::AgentEvent::ActionRequired {
                request_id,
                action_type,
                ..
            } if request_id == "req-runtime-confirm" && action_type == "tool_confirmation"
        )));
        let resumed_tool = events.iter().find_map(|event| match event {
            crate::protocol::AgentEvent::ToolEnd { tool_id, result }
                if tool_id == "req-runtime-confirm" =>
            {
                Some(result)
            }
            _ => None,
        });
        let result = resumed_tool.expect("confirmed tool should finish");
        assert!(result.success);
        assert_eq!(result.output, "runtime-confirmed");
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
        let skills = load_skills_from_directory(skills_dir);

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
        let skills = load_skills_from_directory(temp_dir.path());
        assert!(skills.is_empty());
    }

    /// 测试：不存在的目录返回空列表
    #[test]
    fn test_load_skills_nonexistent_directory() {
        let nonexistent = std::path::Path::new("/nonexistent/path/to/skills");
        let skills = load_skills_from_directory(nonexistent);
        assert!(skills.is_empty());
    }

    /// 测试：`lime-skills` current registry 能正确注册和查找 Skills
    #[test]
    fn test_current_skill_registry_register_and_find() {
        let temp_dir = TempDir::new().unwrap();
        let skills_dir = temp_dir.path();

        // 创建测试 Skill
        create_test_skill(skills_dir, "registry-test-skill", "注册表测试技能");

        // 加载并注册到 current registry
        let skills = load_skills_from_directory(skills_dir);
        for skill in skills {
            register_skill_directory(&skill.skill_name, &skill.local_directory_path)
                .expect("register skill");
        }

        // 验证能找到注册的 Skill
        assert!(is_registered_skill("registry-test-skill"));
        let found = find_skill_by_name("registry-test-skill").expect("find skill");
        assert_eq!(found.display_name, "registry-test-skill");
    }
}
