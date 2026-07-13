use crate::client::LimeMcpClient;
use rmcp::model::{
    CallToolRequest, CallToolRequestParam, CallToolResult, CancelledNotification,
    CancelledNotificationMethod, CancelledNotificationParam, ClientRequest, Extensions,
    GetPromptRequest, GetPromptRequestParam, GetPromptResult, InitializeResult, JsonObject,
    ListPromptsRequest, ListPromptsResult, ListResourcesRequest, ListResourcesResult,
    ListToolsRequest, ListToolsResult, PaginatedRequestParam, ReadResourceRequest,
    ReadResourceRequestParam, ReadResourceResult, ServerNotification, ServerResult,
};
use rmcp::service::{PeerRequestOptions, RunningService, ServiceError};
use rmcp::RoleClient;
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Clone)]
pub struct McpBridgeClient {
    service: Arc<RunningService<RoleClient, LimeMcpClient>>,
    handler: Arc<LimeMcpClient>,
    server_info: Option<InitializeResult>,
    request_timeout: Duration,
    tool_timeout: Duration,
}

impl McpBridgeClient {
    pub fn new(
        service: Arc<RunningService<RoleClient, LimeMcpClient>>,
        handler: Arc<LimeMcpClient>,
        server_info: Option<InitializeResult>,
        tool_timeout: Duration,
    ) -> Self {
        Self {
            service,
            handler,
            server_info,
            request_timeout: DEFAULT_REQUEST_TIMEOUT,
            tool_timeout,
        }
    }

    pub fn server_info(&self) -> Option<&InitializeResult> {
        self.server_info.as_ref()
    }

    pub async fn subscribe(&self) -> mpsc::Receiver<ServerNotification> {
        self.handler.subscribe().await
    }

    pub async fn list_resources(
        &self,
        cursor: Option<String>,
        extensions: Extensions,
        cancel_token: CancellationToken,
    ) -> Result<ListResourcesResult, ServiceError> {
        let res = self
            .send_request(
                ClientRequest::ListResourcesRequest(ListResourcesRequest {
                    params: Some(PaginatedRequestParam { cursor }),
                    method: Default::default(),
                    extensions,
                }),
                cancel_token,
                self.request_timeout,
            )
            .await?;

        match res {
            ServerResult::ListResourcesResult(result) => Ok(result),
            _ => Err(ServiceError::UnexpectedResponse),
        }
    }

    pub async fn read_resource(
        &self,
        uri: &str,
        extensions: Extensions,
        cancel_token: CancellationToken,
    ) -> Result<ReadResourceResult, ServiceError> {
        let res = self
            .send_request(
                ClientRequest::ReadResourceRequest(ReadResourceRequest {
                    params: ReadResourceRequestParam {
                        uri: uri.to_string(),
                    },
                    method: Default::default(),
                    extensions,
                }),
                cancel_token,
                self.request_timeout,
            )
            .await?;

        match res {
            ServerResult::ReadResourceResult(result) => Ok(result),
            _ => Err(ServiceError::UnexpectedResponse),
        }
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
        cancel_token: CancellationToken,
    ) -> Result<CallToolResult, ServiceError> {
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

    pub async fn list_prompts(
        &self,
        cursor: Option<String>,
        extensions: Extensions,
        cancel_token: CancellationToken,
    ) -> Result<ListPromptsResult, ServiceError> {
        let res = self
            .send_request(
                ClientRequest::ListPromptsRequest(ListPromptsRequest {
                    params: Some(PaginatedRequestParam { cursor }),
                    method: Default::default(),
                    extensions,
                }),
                cancel_token,
                self.request_timeout,
            )
            .await?;

        match res {
            ServerResult::ListPromptsResult(result) => Ok(result),
            _ => Err(ServiceError::UnexpectedResponse),
        }
    }

    pub async fn get_prompt(
        &self,
        name: &str,
        arguments: Value,
        extensions: Extensions,
        cancel_token: CancellationToken,
    ) -> Result<GetPromptResult, ServiceError> {
        let arguments = match arguments {
            Value::Object(map) => Some(map),
            _ => None,
        };
        let res = self
            .send_request(
                ClientRequest::GetPromptRequest(GetPromptRequest {
                    params: GetPromptRequestParam {
                        name: name.to_string(),
                        arguments,
                    },
                    method: Default::default(),
                    extensions,
                }),
                cancel_token,
                self.request_timeout,
            )
            .await?;

        match res {
            ServerResult::GetPromptResult(result) => Ok(result),
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

        tokio::select! {
            result = handle.rx => {
                result.map_err(|_e| ServiceError::TransportClosed)?
            }
            _ = tokio::time::sleep(timeout) => {
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
