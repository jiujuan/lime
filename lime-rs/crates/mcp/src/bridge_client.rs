use crate::active_time::active_time_timeout;
use crate::client_service::LimeMcpClientService;
use rmcp::model::{
    CallToolRequest, CallToolRequestParam, CallToolResult, CancelledNotification,
    CancelledNotificationMethod, CancelledNotificationParam, ClientRequest, Extensions, JsonObject,
    ListToolsRequest, ListToolsResult, PaginatedRequestParam, ServerNotification, ServerResult,
};
use rmcp::service::{PeerRequestOptions, RunningService, ServiceError};
use rmcp::RoleClient;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tool_runtime::mcp_connection::McpCallScope;

const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Clone)]
pub struct McpBridgeClient {
    service: Arc<RunningService<RoleClient, LimeMcpClientService>>,
    request_timeout: Duration,
    tool_timeout: Duration,
}

impl McpBridgeClient {
    pub fn new(
        service: Arc<RunningService<RoleClient, LimeMcpClientService>>,
        tool_timeout: Duration,
    ) -> Self {
        Self {
            service,
            request_timeout: DEFAULT_REQUEST_TIMEOUT,
            tool_timeout,
        }
    }

    pub async fn subscribe(&self) -> mpsc::Receiver<ServerNotification> {
        self.service.service().handler().subscribe().await
    }

    pub async fn list_tools(
        &self,
        cursor: Option<String>,
        extensions: Extensions,
        cancel_token: CancellationToken,
    ) -> Result<ListToolsResult, ServiceError> {
        let res = self
            .send_request(
                ClientRequest::ListToolsRequest(ListToolsRequest {
                    params: Some(PaginatedRequestParam { cursor }),
                    method: Default::default(),
                    extensions,
                }),
                cancel_token,
                self.request_timeout,
            )
            .await?;

        match res {
            ServerResult::ListToolsResult(result) => Ok(result),
            _ => Err(ServiceError::UnexpectedResponse),
        }
    }

    pub async fn call_tool(
        &self,
        name: &str,
        arguments: Option<JsonObject>,
        extensions: Extensions,
        scope: Option<&McpCallScope>,
        cancel_token: CancellationToken,
    ) -> Result<CallToolResult, ServiceError> {
        let _owner = self
            .service
            .service()
            .handler()
            .enter_elicitation_owner(scope.cloned())
            .await;
        let res = self
            .send_request(
                ClientRequest::CallToolRequest(CallToolRequest {
                    params: CallToolRequestParam {
                        name: name.to_string().into(),
                        arguments,
                    },
                    method: Default::default(),
                    extensions,
                }),
                cancel_token,
                self.tool_timeout,
            )
            .await?;

        match res {
            ServerResult::CallToolResult(result) => Ok(result),
            _ => Err(ServiceError::UnexpectedResponse),
        }
    }

    async fn send_request(
        &self,
        request: ClientRequest,
        cancel_token: CancellationToken,
        timeout: Duration,
    ) -> Result<ServerResult, ServiceError> {
        let handle = self
            .service
            .send_cancellable_request(request, PeerRequestOptions::no_options())
            .await?;

        let request_id = handle.id;
        let peer = handle.peer.clone();
        let response = active_time_timeout(
            timeout,
            self.service
                .service()
                .handler()
                .elicitation_pause_state()
                .subscribe(),
            handle.rx,
        );
        tokio::pin!(response);

        tokio::select! {
            result = &mut response => match result {
                Ok(result) => result.map_err(|_error| ServiceError::TransportClosed)?,
                Err(()) => {
                let _ = peer.send_notification(
                    CancelledNotification {
                        params: CancelledNotificationParam {
                            request_id,
                            reason: Some("timed out".to_owned()),
                        },
                        method: CancelledNotificationMethod,
                        extensions: Default::default(),
                    }
                    .into(),
                ).await;
                Err(ServiceError::Timeout{timeout})
                }
            },
            _ = cancel_token.cancelled() => {
                let _ = peer.send_notification(
                    CancelledNotification {
                        params: CancelledNotificationParam {
                            request_id,
                            reason: Some("operation cancelled".to_owned()),
                        },
                        method: CancelledNotificationMethod,
                        extensions: Default::default(),
                    }
                    .into(),
                ).await;
                Err(ServiceError::Cancelled { reason: None })
            }
        }
    }
}
