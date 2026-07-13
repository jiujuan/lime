use crate::credential_bridge::{ConfiguredReplyProvider, CredentialBridge};
use crate::protocol::AgentActionRequiredScope;
use agent_runtime::action_required::{
    ActionRequiredError, ActionTerminalStatus, PendingActionDescriptor, PendingActionRestoreOutcome,
};
use lime_core::database::DbConnection;
use lime_mcp::McpBridgeSnapshot;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;
use tool_runtime::gateway_dispatch_execution::RuntimeGatewayToolExecutionRegistry;
use tool_runtime::mcp_connection::McpConnectionRegistry;
use tool_runtime::tool_definition::RuntimeToolDefinition;

pub struct AgentRuntimeState {
    initialized: Arc<AtomicBool>,
    cancel_tokens: Arc<RwLock<HashMap<String, CancellationToken>>>,
    credential_bridge: CredentialBridge,
    provider: Arc<RwLock<Option<ConfiguredReplyProvider>>>,
    native_tool_definitions: Arc<RwLock<HashMap<String, RuntimeToolDefinition>>>,
    gateway_tools: RuntimeGatewayToolExecutionRegistry,
    mcp_connections: Arc<McpConnectionRegistry>,
    mcp_bridge_registry: Arc<crate::mcp_bridge::McpBridgeRuntimeRegistry>,
    action_required: Arc<agent_runtime::action_required::ActionRequiredState>,
    live_execution_gateway:
        Arc<RwLock<Option<Arc<dyn crate::live_execution_process::LiveExecutionProcessGateway>>>>,
}

impl Clone for AgentRuntimeState {
    fn clone(&self) -> Self {
        Self {
            initialized: Arc::clone(&self.initialized),
            cancel_tokens: Arc::clone(&self.cancel_tokens),
            credential_bridge: CredentialBridge::new(),
            provider: Arc::clone(&self.provider),
            native_tool_definitions: Arc::clone(&self.native_tool_definitions),
            gateway_tools: self.gateway_tools.clone(),
            mcp_connections: Arc::clone(&self.mcp_connections),
            mcp_bridge_registry: Arc::clone(&self.mcp_bridge_registry),
            action_required: Arc::clone(&self.action_required),
            live_execution_gateway: Arc::clone(&self.live_execution_gateway),
        }
    }
}

impl Default for AgentRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentRuntimeState {
    pub fn new() -> Self {
        Self {
            initialized: Arc::new(AtomicBool::new(false)),
            cancel_tokens: Arc::new(RwLock::new(HashMap::new())),
            credential_bridge: CredentialBridge::new(),
            provider: Arc::new(RwLock::new(None)),
            native_tool_definitions: Arc::new(RwLock::new(HashMap::new())),
            gateway_tools: RuntimeGatewayToolExecutionRegistry::default(),
            mcp_connections: Arc::new(McpConnectionRegistry::new()),
            mcp_bridge_registry: Arc::new(crate::mcp_bridge::McpBridgeRuntimeRegistry::new()),
            action_required: Arc::new(
                agent_runtime::action_required::ActionRequiredState::default(),
            ),
            live_execution_gateway: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn init_agent_with_db(&self, _db: &DbConnection) -> Result<(), String> {
        if !self.initialized.swap(true, Ordering::AcqRel) {
            let definitions = crate::native_tools::current_native_tool_definitions();
            self.reset_native_tool_definitions(definitions).await;
            crate::runtime_state_support::reload_skills();
        }
        Ok(())
    }

    pub(crate) fn credential_bridge(&self) -> &CredentialBridge {
        &self.credential_bridge
    }

    pub(crate) async fn set_provider(&self, provider: ConfiguredReplyProvider) {
        *self.provider.write().await = Some(provider);
    }

    pub(crate) async fn provider(&self) -> Option<ConfiguredReplyProvider> {
        self.provider.read().await.clone()
    }

    pub(crate) fn gateway_tools(&self) -> &RuntimeGatewayToolExecutionRegistry {
        &self.gateway_tools
    }

    pub(crate) fn mcp_connections(&self) -> &McpConnectionRegistry {
        self.mcp_connections.as_ref()
    }

    pub(crate) fn action_required_state(
        &self,
    ) -> Arc<agent_runtime::action_required::ActionRequiredState> {
        Arc::clone(&self.action_required)
    }

    pub async fn pending_action_descriptors(&self) -> Vec<PendingActionDescriptor> {
        self.action_required.pending_action_descriptors().await
    }

    pub async fn restore_pending_action_descriptors(
        &self,
        descriptors: impl IntoIterator<Item = PendingActionDescriptor>,
    ) -> Vec<PendingActionRestoreOutcome> {
        self.action_required
            .restore_pending_actions(descriptors)
            .await
    }

    pub async fn contains_pending_action(&self, request_id: &str) -> bool {
        self.action_required.contains_action(request_id).await
    }

    pub async fn terminal_action_status(&self, request_id: &str) -> Option<ActionTerminalStatus> {
        self.action_required.terminal_status(request_id).await
    }

    async fn reset_native_tool_definitions(&self, definitions: Vec<RuntimeToolDefinition>) {
        let mut current = self.native_tool_definitions.write().await;
        current.clear();
        current.extend(
            definitions
                .into_iter()
                .map(|definition| (definition.name.clone(), definition)),
        );
    }

    pub async fn contains_native_tool(&self, tool_name: &str) -> bool {
        self.native_tool_definitions
            .read()
            .await
            .contains_key(tool_name)
    }

    pub(crate) async fn native_tool_definitions_snapshot(&self) -> Vec<RuntimeToolDefinition> {
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
        let definition = registration.definition();
        self.gateway_tools
            .register(registration.into_gateway_execution());
        self.native_tool_definitions
            .write()
            .await
            .insert(definition.name.clone(), definition);
        Ok(())
    }

    pub async fn register_memory_store_tools(
        &self,
        gateway: Arc<dyn tool_runtime::memory_store::MemoryStoreGateway>,
    ) -> Result<(), String> {
        for registration in crate::native_tools::create_memory_tools(gateway) {
            self.register_native_tool(registration).await?;
        }
        Ok(())
    }

    pub async fn register_image_task_tools(
        &self,
        gateway: Arc<dyn tool_runtime::image_task::ImageTaskGateway>,
    ) -> Result<(), String> {
        for registration in crate::native_tools::create_image_tools(gateway) {
            self.register_native_tool(registration).await?;
        }
        Ok(())
    }

    pub async fn register_tool_search_tools(
        &self,
        gateway: Arc<dyn tool_runtime::tool_search::ToolSearchGateway>,
    ) -> Result<(), String> {
        for registration in crate::native_tools::create_tool_search_tools(gateway) {
            self.register_native_tool(registration).await?;
        }
        Ok(())
    }

    pub async fn register_mcp_resource_tools(
        &self,
        gateway: Arc<dyn tool_runtime::mcp_resource::McpResourceGateway>,
    ) -> Result<(), String> {
        for registration in crate::native_tools::create_mcp_resource_tools(gateway) {
            self.register_native_tool(registration).await?;
        }
        Ok(())
    }

    pub async fn install_live_execution_process_gateway(
        &self,
        gateway: Arc<dyn crate::live_execution_process::LiveExecutionProcessGateway>,
    ) -> Result<(), String> {
        *self.live_execution_gateway.write().await = Some(gateway);
        Ok(())
    }

    pub async fn create_cancel_token(&self, session_id: &str) -> CancellationToken {
        let token = CancellationToken::new();
        self.cancel_tokens
            .write()
            .await
            .insert(session_id.to_string(), token.clone());
        token
    }

    pub async fn cancel_session(&self, session_id: &str) -> bool {
        let canceled = if let Some(token) = self.cancel_tokens.read().await.get(session_id) {
            token.cancel();
            true
        } else {
            false
        };
        if let Some(scope) =
            AgentActionRequiredScope::from_parts(Some(session_id.to_string()), None, None)
        {
            self.action_required.cancel_for_scope(&scope).await;
        }
        canceled
    }

    pub async fn remove_cancel_token(&self, session_id: &str) {
        self.cancel_tokens.write().await.remove(session_id);
    }

    pub async fn submit_elicitation_response(
        &self,
        session_id: &str,
        request_id: &str,
        user_data: serde_json::Value,
        action_scope: Option<AgentActionRequiredScope>,
    ) -> Result<(), ActionRequiredError> {
        let scope = require_action_scope(session_id, request_id, action_scope)?;
        self.action_required
            .submit_response(request_id, Some(&scope), user_data)
            .await
    }

    pub async fn ensure_action_resumable(
        &self,
        session_id: &str,
        request_id: &str,
        action_scope: Option<AgentActionRequiredScope>,
    ) -> Result<(), ActionRequiredError> {
        let scope = require_action_scope(session_id, request_id, action_scope)?;
        self.action_required
            .ensure_resumable(request_id, Some(&scope))
            .await
    }

    pub async fn cancel_action(
        &self,
        session_id: &str,
        request_id: &str,
        action_scope: Option<AgentActionRequiredScope>,
    ) -> Result<(), ActionRequiredError> {
        let scope = require_action_scope(session_id, request_id, action_scope)?;
        self.action_required
            .cancel_action(request_id, Some(&scope))
            .await
    }

    pub async fn confirm_tool_action(
        &self,
        session_id: &str,
        request_id: &str,
        confirmed: bool,
        action_scope: Option<AgentActionRequiredScope>,
    ) -> Result<(), ActionRequiredError> {
        let scope = require_action_scope(session_id, request_id, action_scope)?;
        self.action_required
            .submit_response(
                request_id,
                Some(&scope),
                serde_json::json!({ "confirmed": confirmed }),
            )
            .await
    }

    pub async fn sync_mcp_bridges(&self, snapshots: Vec<McpBridgeSnapshot>) -> Result<(), String> {
        let bridge_count = self
            .mcp_bridge_registry
            .sync(self.mcp_connections.as_ref(), snapshots)
            .await;
        tracing::info!(bridge_count, "[AgentRuntime] MCP bridge 同步完成");
        Ok(())
    }

    pub async fn is_initialized(&self) -> bool {
        self.initialized.load(Ordering::Acquire)
    }
}

fn require_action_scope(
    session_id: &str,
    request_id: &str,
    scope: Option<AgentActionRequiredScope>,
) -> Result<AgentActionRequiredScope, ActionRequiredError> {
    let scope = scope.ok_or_else(|| ActionRequiredError::ScopeMissing(request_id.to_string()))?;
    let complete = [
        scope.session_id.as_deref(),
        scope.thread_id.as_deref(),
        scope.turn_id.as_deref(),
    ]
    .into_iter()
    .all(|field| field.is_some_and(|value| !value.trim().is_empty()));
    if !complete || scope.session_id.as_deref() != Some(session_id) {
        return Err(ActionRequiredError::ScopeMismatch(request_id.to_string()));
    }
    Ok(scope)
}
