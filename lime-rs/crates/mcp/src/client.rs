//! MCP 客户端实现
//!
//! 实现 rmcp 的 ClientHandler trait，处理通知和回调。
//! 使用 DynEmitter 进行事件发射，与具体桌面宿主解耦。

#![allow(dead_code)]

use crate::active_time::ElicitationPauseState;
use crate::elicitation::{
    ElicitationOwnerGate, ElicitationOwnerGuard, ElicitationRequestRouter, ElicitationRouterError,
};
use crate::events::{McpResourceUpdatedPayload, McpResourcesUpdatedPayload};
use lime_core::DynEmitter;
use rmcp::{
    model::{
        ClientCapabilities, ClientInfo, CreateElicitationRequestParam, Implementation,
        LoggingMessageNotification, LoggingMessageNotificationMethod,
        LoggingMessageNotificationParam, ProgressNotification, ProgressNotificationMethod,
        ProgressNotificationParam, ProtocolVersion, ResourceUpdatedNotificationParam,
        ServerNotification,
    },
    service::NotificationContext,
    ClientHandler, RoleClient,
};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use tool_runtime::mcp_connection::McpCallScope;
use crate::McpRuntimeOwner;
use tracing::{debug, info, warn};

/// 进度通知事件 Payload
#[derive(Debug, Clone, serde::Serialize)]
pub struct McpProgressPayload {
    pub server_name: String,
    pub progress_token: String,
    pub progress: f64,
    pub total: Option<f64>,
    pub message: Option<String>,
}

/// 日志消息事件 Payload
#[derive(Debug, Clone, serde::Serialize)]
pub struct McpLogMessagePayload {
    pub server_name: String,
    pub level: String,
    pub logger: Option<String>,
    pub data: serde_json::Value,
}

/// Lime MCP 客户端处理器
pub struct LimeMcpClient {
    emitter: Option<DynEmitter>,
    server_name: String,
    notification_handlers: Arc<Mutex<Vec<mpsc::Sender<ServerNotification>>>>,
    elicitation_router: Option<ElicitationRequestRouter>,
    runtime_owner: Option<McpRuntimeOwner>,
    elicitation_pause_state: ElicitationPauseState,
    elicitation_owner: ElicitationOwnerGate,
}

impl LimeMcpClient {
    pub fn new(server_name: String, emitter: Option<DynEmitter>) -> Self {
        Self::from_parts(server_name, emitter, None, None)
    }

    pub fn with_elicitation_router(
        server_name: String,
        emitter: Option<DynEmitter>,
        elicitation_router: ElicitationRequestRouter,
    ) -> Self {
        Self::from_parts(server_name, emitter, Some(elicitation_router), None)
    }

    pub fn with_runtime_elicitation_router(
        server_name: String,
        emitter: Option<DynEmitter>,
        elicitation_router: ElicitationRequestRouter,
        runtime_owner: McpRuntimeOwner,
    ) -> Self {
        Self::from_parts(
            server_name,
            emitter,
            Some(elicitation_router),
            Some(runtime_owner),
        )
    }

    fn from_parts(
        server_name: String,
        emitter: Option<DynEmitter>,
        elicitation_router: Option<ElicitationRequestRouter>,
        runtime_owner: Option<McpRuntimeOwner>,
    ) -> Self {
        Self {
            emitter,
            server_name,
            notification_handlers: Arc::new(Mutex::new(Vec::new())),
            elicitation_router,
            runtime_owner,
            elicitation_pause_state: ElicitationPauseState::new(),
            elicitation_owner: ElicitationOwnerGate::default(),
        }
    }

    pub(crate) async fn handle_form_elicitation(
        &self,
        request: CreateElicitationRequestParam,
        scope: McpCallScope,
        meta: Option<serde_json::Value>,
        cancellation: tokio_util::sync::CancellationToken,
    ) -> Result<crate::elicitation::ElicitationResponse, ElicitationRouterError> {
        let router = self
            .elicitation_router
            .as_ref()
            .ok_or(ElicitationRouterError::NoRequestRouter)?;
        let runtime_owner = self
            .runtime_owner
            .as_ref()
            .ok_or(ElicitationRouterError::NoRequestRouter)?;
        let _pause = self.elicitation_pause_state.enter();
        router
            .request(
                self.server_name.clone(),
                runtime_owner.clone(),
                scope.turn_id().map(ToOwned::to_owned),
                request,
                meta,
                cancellation,
            )
            .await
    }

    pub(crate) async fn enter_elicitation_owner(
        &self,
        scope: Option<McpCallScope>,
    ) -> ElicitationOwnerGuard {
        self.elicitation_owner.enter(scope).await
    }

    pub(crate) fn resolve_elicitation_request_meta(
        &self,
        meta: rmcp::model::Meta,
    ) -> (Option<McpCallScope>, Option<serde_json::Value>) {
        self.elicitation_owner.resolve_request_meta(meta)
    }

    pub(crate) fn elicitation_pause_state(&self) -> ElicitationPauseState {
        self.elicitation_pause_state.clone()
    }

    pub fn notification_handlers(&self) -> Arc<Mutex<Vec<mpsc::Sender<ServerNotification>>>> {
        self.notification_handlers.clone()
    }

    pub async fn subscribe(&self) -> mpsc::Receiver<ServerNotification> {
        let (tx, rx) = mpsc::channel(16);
        self.notification_handlers.lock().await.push(tx);
        rx
    }

    /// 发送事件（通过 DynEmitter）
    fn emit_event<T: serde::Serialize>(&self, event: &str, payload: &T) {
        if let Some(ref emitter) = self.emitter {
            if let Ok(value) = serde_json::to_value(payload) {
                if let Err(e) = emitter.emit_event(event, &value) {
                    warn!(
                        server_name = %self.server_name,
                        event = %event,
                        error = %e,
                        "发送事件失败"
                    );
                }
            }
        }
    }
}

impl ClientHandler for LimeMcpClient {
    fn get_info(&self) -> ClientInfo {
        ClientInfo {
            protocol_version: ProtocolVersion::V_2025_03_26,
            capabilities: ClientCapabilities::default(),
            client_info: Implementation {
                name: "lime".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
                icons: None,
                title: Some("Lime MCP Client".to_string()),
                website_url: Some("https://github.com/aiclientproxy/lime".to_string()),
            },
        }
    }

    async fn on_progress(
        &self,
        params: ProgressNotificationParam,
        context: NotificationContext<RoleClient>,
    ) {
        debug!(
            server_name = %self.server_name,
            progress_token = ?params.progress_token,
            progress = params.progress,
            total = ?params.total,
            "收到 MCP 进度通知"
        );

        let payload = McpProgressPayload {
            server_name: self.server_name.clone(),
            progress_token: format!("{:?}", params.progress_token),
            progress: params.progress,
            total: params.total,
            message: None,
        };
        self.emit_event("mcp:progress", &payload);

        let notification = ServerNotification::ProgressNotification(ProgressNotification {
            params: params.clone(),
            method: ProgressNotificationMethod,
            extensions: context.extensions.clone(),
        });

        let handlers = self.notification_handlers.lock().await;
        for handler in handlers.iter() {
            let _ = handler.try_send(notification.clone());
        }
    }

    async fn on_logging_message(
        &self,
        params: LoggingMessageNotificationParam,
        context: NotificationContext<RoleClient>,
    ) {
        let level_str = format!("{:?}", params.level);
        match params.level {
            rmcp::model::LoggingLevel::Debug => {
                debug!(server_name = %self.server_name, logger = ?params.logger, data = ?params.data, "MCP 服务器日志 [DEBUG]");
            }
            rmcp::model::LoggingLevel::Info => {
                info!(server_name = %self.server_name, logger = ?params.logger, data = ?params.data, "MCP 服务器日志 [INFO]");
            }
            rmcp::model::LoggingLevel::Notice => {
                info!(server_name = %self.server_name, logger = ?params.logger, data = ?params.data, "MCP 服务器日志 [NOTICE]");
            }
            rmcp::model::LoggingLevel::Warning => {
                warn!(server_name = %self.server_name, logger = ?params.logger, data = ?params.data, "MCP 服务器日志 [WARNING]");
            }
            _ => {
                tracing::error!(server_name = %self.server_name, logger = ?params.logger, data = ?params.data, level = %level_str, "MCP 服务器日志");
            }
        }

        let payload = McpLogMessagePayload {
            server_name: self.server_name.clone(),
            level: level_str,
            logger: params.logger.clone(),
            data: params.data.clone(),
        };
        self.emit_event("mcp:log_message", &payload);

        let notification =
            ServerNotification::LoggingMessageNotification(LoggingMessageNotification {
                params: params.clone(),
                method: LoggingMessageNotificationMethod,
                extensions: context.extensions.clone(),
            });

        let handlers = self.notification_handlers.lock().await;
        for handler in handlers.iter() {
            let _ = handler.try_send(notification.clone());
        }
    }

    async fn on_resource_updated(
        &self,
        params: ResourceUpdatedNotificationParam,
        context: NotificationContext<RoleClient>,
    ) {
        debug!(
            server_name = %self.server_name,
            uri = %params.uri,
            "收到 MCP 资源更新通知"
        );

        self.emit_event(
            "mcp:resource_updated",
            &McpResourceUpdatedPayload {
                server_name: self.server_name.clone(),
                uri: params.uri.clone(),
            },
        );

        let notification = ServerNotification::ResourceUpdatedNotification(
            rmcp::model::ResourceUpdatedNotification {
                params: params.clone(),
                method: rmcp::model::ResourceUpdatedNotificationMethod,
                extensions: context.extensions.clone(),
            },
        );

        let handlers = self.notification_handlers.lock().await;
        for handler in handlers.iter() {
            let _ = handler.try_send(notification.clone());
        }
    }

    async fn on_resource_list_changed(&self, context: NotificationContext<RoleClient>) {
        debug!(server_name = %self.server_name, "收到 MCP 资源列表更新通知");

        self.emit_event(
            "mcp:resources_updated",
            &McpResourcesUpdatedPayload {
                server_name: self.server_name.clone(),
            },
        );

        let notification = ServerNotification::ResourceListChangedNotification(
            rmcp::model::ResourceListChangedNotification {
                method: rmcp::model::ResourceListChangedNotificationMethod,
                extensions: context.extensions.clone(),
            },
        );

        let handlers = self.notification_handlers.lock().await;
        for handler in handlers.iter() {
            let _ = handler.try_send(notification.clone());
        }
    }
}

/// MCP 客户端包装器
pub struct McpClientWrapper {
    pub server_name: String,
    pub config: super::types::McpServerConfig,
    pub process: Option<tokio::process::Child>,
    pub server_info: Option<super::types::McpServerCapabilities>,
    pub running_service: Option<
        Arc<
            rmcp::service::RunningService<
                rmcp::RoleClient,
                crate::client_service::LimeMcpClientService,
            >,
        >,
    >,
}

impl McpClientWrapper {
    pub fn new(
        server_name: String,
        config: super::types::McpServerConfig,
        _emitter: Option<DynEmitter>,
    ) -> Self {
        Self {
            server_name,
            config,
            process: None,
            server_info: None,
            running_service: None,
        }
    }

    pub fn set_process(&mut self, process: tokio::process::Child) {
        self.process = Some(process);
    }

    pub fn set_server_info(&mut self, info: super::types::McpServerCapabilities) {
        self.server_info = Some(info);
    }

    pub fn set_running_service(
        &mut self,
        service: rmcp::service::RunningService<
            rmcp::RoleClient,
            crate::client_service::LimeMcpClientService,
        >,
    ) {
        self.running_service = Some(Arc::new(service));
    }

    pub fn running_service(
        &self,
    ) -> Option<
        &Arc<
            rmcp::service::RunningService<
                rmcp::RoleClient,
                crate::client_service::LimeMcpClientService,
            >,
        >,
    > {
        self.running_service.as_ref()
    }

    pub fn running_service_arc(
        &self,
    ) -> Option<
        Arc<
            rmcp::service::RunningService<
                rmcp::RoleClient,
                crate::client_service::LimeMcpClientService,
            >,
        >,
    > {
        self.running_service.clone()
    }

    pub async fn kill_process(&mut self) -> Result<(), std::io::Error> {
        if let Some(ref mut process) = self.process {
            process.kill().await?;
        }
        self.process = None;
        self.running_service = None;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn active_time_real_handler_pauses_for_the_full_router_wait() {
        let router = ElicitationRequestRouter::default();
        let mut requests = router.subscribe().expect("request consumer");
        let client = Arc::new(LimeMcpClient::with_runtime_elicitation_router(
            "pause-server".to_string(),
            None,
            router.clone(),
            McpRuntimeOwner {
                session_id: "session-1".to_string(),
                thread_id: "thread-1".to_string(),
            },
        ));
        let mut paused = client.elicitation_pause_state().subscribe();
        let request_client = Arc::clone(&client);

        let waiter = tokio::spawn(async move {
            request_client
                .handle_form_elicitation(
                    CreateElicitationRequestParam {
                        message: "Confirm".to_string(),
                        requested_schema: rmcp::model::ElicitationSchema::builder()
                            .build()
                            .expect("empty object schema"),
                    },
                    tool_runtime::mcp_connection::McpCallScope::new(Some("turn-1"))
                        .expect("turn correlation"),
                    None,
                    tokio_util::sync::CancellationToken::new(),
                )
                .await
        });

        let request = requests.recv().await.expect("routed elicitation");
        paused.changed().await.expect("pause state remains open");
        assert!(*paused.borrow_and_update());

        router
            .resolve(&request.id, crate::elicitation::ElicitationResponse::Cancel)
            .await
            .expect("resolve exact waiter");
        waiter
            .await
            .expect("handler task")
            .expect("router response");
        paused.changed().await.expect("pause state remains open");
        assert!(!*paused.borrow_and_update());
    }

    #[test]
    fn test_client_info_does_not_advertise_unimplemented_sampling() {
        let client = LimeMcpClient::new("test-server".to_string(), None);
        let info = client.get_info();

        assert_eq!(info.client_info.name, "lime");
        assert_eq!(info.client_info.title, Some("Lime MCP Client".to_string()));
        assert_eq!(info.protocol_version, ProtocolVersion::V_2025_03_26);
        assert!(info.capabilities.sampling.is_none());
        assert!(info.capabilities.elicitation.is_none());
    }

    #[test]
    fn test_client_wrapper_creation() {
        let config = super::super::types::McpServerConfig {
            transport: super::super::types::McpServerTransport::Stdio {
                command: "test-command".to_string(),
                args: vec!["--arg1".to_string()],
                env: std::collections::HashMap::new(),
                cwd: None,
            },
            enabled: true,
            startup_timeout: 30,
            tool_timeout: None,
            enabled_tools: None,
            disabled_tools: Vec::new(),
            required: false,
            supports_parallel_tool_calls: false,
            scopes: None,
            oauth: None,
            oauth_resource: None,
        };

        let wrapper = McpClientWrapper::new("test-server".to_string(), config, None);

        assert_eq!(wrapper.server_name, "test-server");
        assert_eq!(wrapper.config.command(), "test-command");
        assert!(wrapper.process.is_none());
        assert!(wrapper.server_info.is_none());
    }

    #[tokio::test]
    async fn test_notification_subscription() {
        let client = LimeMcpClient::new("test-server".to_string(), None);

        let mut rx = client.subscribe().await;

        let handlers = client.notification_handlers.lock().await;
        assert_eq!(handlers.len(), 1);
        drop(handlers);

        assert!(rx.try_recv().is_err());
    }
}
