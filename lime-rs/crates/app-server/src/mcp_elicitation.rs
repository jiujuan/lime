//! MCP elicitation adapter for the App Server reverse-request transport.

use crate::{AppServer, AppServerError, ServerRequestError};
use app_server_protocol::{
    error_codes, McpServerElicitationAction, McpServerElicitationRequest,
    McpServerElicitationRequestParams, McpServerElicitationResponse, ServerNotification,
    ServerRequestResolvedNotification, METHOD_MCP_SERVER_ELICITATION_REQUEST,
};
use lime_mcp::{
    ElicitationAction, ElicitationRequest, ElicitationRequestRouter, ElicitationResponse,
    ElicitationRouterError,
};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;

struct ElicitationRequestSubscription {
    router: ElicitationRequestRouter,
    receiver: mpsc::Receiver<ElicitationRequest>,
}

#[derive(Clone, Default)]
pub(crate) struct ElicitationRequestSource {
    subscription: Arc<Mutex<Option<ElicitationRequestSubscription>>>,
}

impl ElicitationRequestSource {
    pub(crate) fn subscribe(
        router: ElicitationRequestRouter,
    ) -> Result<Self, ElicitationRouterError> {
        let receiver = router.subscribe()?;
        router.defer_cancellation_to_consumer();
        Ok(Self {
            subscription: Arc::new(Mutex::new(Some(ElicitationRequestSubscription {
                router,
                receiver,
            }))),
        })
    }

    fn take(&self) -> Option<ElicitationRequestSubscription> {
        self.subscription
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take()
    }
}

pub(crate) async fn run_request_pump(
    server: AppServer,
    source: ElicitationRequestSource,
    shutdown: CancellationToken,
) {
    let Some(ElicitationRequestSubscription {
        router,
        mut receiver,
    }) = source.take()
    else {
        return;
    };
    let mut pending = JoinSet::new();
    loop {
        tokio::select! {
            _ = shutdown.cancelled() => {
                router.cancel_all();
                break;
            }
            request = receiver.recv() => {
                let Some(request) = request else {
                    break;
                };
                if !router.mark_forwarded(&request.id) {
                    continue;
                }
                let server = server.clone();
                let router = router.clone();
                pending.spawn(async move {
                    forward_request(server, router, request).await;
                });
            }
            Some(result) = pending.join_next(), if !pending.is_empty() => {
                if let Err(error) = result {
                    tracing::warn!(%error, "MCP elicitation adapter task failed");
                }
            }
        }
    }

    while let Some(result) = pending.join_next().await {
        if let Err(error) = result {
            tracing::warn!(%error, "MCP elicitation adapter task failed during shutdown");
        }
    }
}

async fn forward_request(
    server: AppServer,
    router: ElicitationRequestRouter,
    request: ElicitationRequest,
) {
    let request_id = request.id.clone();
    let params = match request_params(&request) {
        Ok(params) => params,
        Err(error) => {
            tracing::warn!(%request_id, %error, "declining invalid MCP elicitation request");
            resolve_router_response(&router, &request_id, ElicitationResponse::Decline).await;
            return;
        }
    };

    let pending = match server
        .begin_server_request(METHOD_MCP_SERVER_ELICITATION_REQUEST, params)
        .await
    {
        Ok(pending) => pending,
        Err(error) => {
            let response = response_for_server_error(&error);
            tracing::warn!(%request_id, %error, action = ?response, "settling MCP elicitation after client delivery failure");
            resolve_router_response(&router, &request_id, response).await;
            return;
        }
    };
    let terminal = wait_for_outer_terminal(pending, request.closed(), request_id.to_string()).await;
    settle_outer_terminal(&server, &router, &request_id, terminal).await;
}

struct OuterTerminal {
    response: Option<ElicitationResponse>,
    owner: crate::server_request::ServerRequestOwner,
    outer_request_id: app_server_protocol::RequestId,
}

async fn wait_for_outer_terminal(
    pending: crate::server_request::PendingServerRequest,
    closed: CancellationToken,
    domain_request_id: String,
) -> OuterTerminal {
    let outer_request_id = pending.id().clone();
    let owner = pending.owner();
    let outer_response = tokio::select! {
        biased;
        _ = closed.cancelled() => None,
        response = pending.wait() => Some(response.map_err(AppServerError::from)),
    };

    let response = match outer_response {
        Some(Ok(value)) => match parse_response(value) {
            Ok(response) => Some(response),
            Err(error) => {
                tracing::warn!(request_id = %domain_request_id, %error, "canceling invalid App Server MCP elicitation response");
                Some(ElicitationResponse::Cancel)
            }
        },
        Some(Err(error)) => {
            let response = response_for_server_error(&error);
            tracing::warn!(request_id = %domain_request_id, %error, action = ?response, "settling MCP elicitation after client response failure");
            Some(response)
        }
        None => None,
    };

    OuterTerminal {
        response,
        owner,
        outer_request_id,
    }
}

async fn notify_resolved(
    server: &AppServer,
    owner: crate::server_request::ServerRequestOwner,
    request_id: app_server_protocol::RequestId,
) {
    if let Err(error) = server
        .send_server_notification_to_owner(
            owner,
            ServerNotification::ServerRequestResolved(ServerRequestResolvedNotification {
                request_id: request_id.clone(),
            }),
        )
        .await
    {
        tracing::warn!(%request_id, %error, "failed to publish App Server server-request terminal notification");
    }
}

fn request_params(
    request: &ElicitationRequest,
) -> Result<McpServerElicitationRequestParams, serde_json::Error> {
    let requested_schema = serde_json::to_value(&request.requested_schema)?;
    let requested_schema = serde_json::from_value(requested_schema)?;
    Ok(McpServerElicitationRequestParams {
        thread_id: request.thread_id.clone(),
        turn_id: request.turn_id.clone(),
        server_name: request.server_name.clone(),
        request: McpServerElicitationRequest::Form {
            meta: request.meta.clone(),
            message: request.message.clone(),
            requested_schema,
        },
    })
}

fn parse_response(value: serde_json::Value) -> Result<ElicitationResponse, String> {
    let response: McpServerElicitationResponse =
        serde_json::from_value(value).map_err(|error| error.to_string())?;
    response.validate().map_err(str::to_string)?;
    let action = match response.action {
        McpServerElicitationAction::Accept => ElicitationAction::Accept,
        McpServerElicitationAction::Decline => ElicitationAction::Decline,
        McpServerElicitationAction::Cancel => ElicitationAction::Cancel,
    };
    ElicitationResponse::try_from_parts_with_meta(
        action,
        response.content,
        response.meta.map(serde_json::Value::Object),
    )
    .map_err(|error| error.to_string())
}

fn response_for_server_error(error: &AppServerError) -> ElicitationResponse {
    match error {
        AppServerError::ServerRequest(ServerRequestError::ClientRejected { error, .. })
            if error.code != error_codes::REQUEST_CANCELLED =>
        {
            ElicitationResponse::Decline
        }
        AppServerError::Json(_) => ElicitationResponse::Decline,
        _ => ElicitationResponse::Cancel,
    }
}

async fn resolve_router_response(
    router: &ElicitationRequestRouter,
    request_id: &lime_mcp::ElicitationRequestId,
    response: ElicitationResponse,
) {
    match router.resolve(request_id, response).await {
        Ok(()) | Err(ElicitationRouterError::UnknownRequest(_)) => {}
        Err(ElicitationRouterError::InvalidContent(error)) => {
            tracing::warn!(%request_id, %error, "declining MCP elicitation response rejected by its original schema");
            if let Err(error) = router
                .resolve(request_id, ElicitationResponse::Decline)
                .await
            {
                if !matches!(error, ElicitationRouterError::UnknownRequest(_)) {
                    tracing::warn!(%request_id, %error, "failed to decline MCP elicitation request");
                }
            }
        }
        Err(error) => {
            tracing::warn!(%request_id, %error, "failed to resolve MCP elicitation response");
        }
    }
}

async fn settle_outer_terminal(
    server: &AppServer,
    router: &ElicitationRequestRouter,
    request_id: &lime_mcp::ElicitationRequestId,
    terminal: OuterTerminal,
) {
    let response = terminal.response.unwrap_or(ElicitationResponse::Cancel);
    let claim = match router.claim(request_id, response) {
        Ok(claim) => claim,
        Err(ElicitationRouterError::InvalidContent(error)) => {
            tracing::warn!(%request_id, %error, "declining MCP elicitation response rejected by its original schema");
            match router.claim(request_id, ElicitationResponse::Decline) {
                Ok(claim) => claim,
                Err(error) => {
                    tracing::warn!(%request_id, %error, "failed to claim declined MCP elicitation response");
                    return;
                }
            }
        }
        // The RMCP call may have canceled first, or App Server shutdown may
        // have already released the waiter. The outer request still has one
        // owner and must receive its terminal notification exactly once.
        Err(ElicitationRouterError::UnknownRequest(_)) => {
            notify_resolved(server, terminal.owner, terminal.outer_request_id).await;
            return;
        }
        Err(error) => {
            tracing::warn!(%request_id, %error, "failed to claim MCP elicitation terminal");
            return;
        }
    };
    notify_resolved(server, terminal.owner, terminal.outer_request_id).await;
    if let Err(error) = claim.consume() {
        tracing::warn!(%request_id, %error, "failed to consume claimed MCP elicitation terminal");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::{
        JsonRpcError, JsonRpcErrorResponse, JsonRpcMessage, JsonRpcRequest, JsonRpcResponse,
        METHOD_SERVER_REQUEST_RESOLVED,
    };
    use serde_json::json;
    use tokio::time::{timeout, Duration};

    async fn next_outer_request(
        outbound: &mut tokio::sync::broadcast::Receiver<JsonRpcMessage>,
    ) -> JsonRpcRequest {
        let JsonRpcMessage::Request(request) = timeout(Duration::from_secs(2), outbound.recv())
            .await
            .expect("outer request timeout")
            .expect("outer request")
        else {
            panic!("expected App Server reverse request");
        };
        request
    }

    async fn next_resolved(
        outbound: &mut tokio::sync::broadcast::Receiver<JsonRpcMessage>,
    ) -> ServerRequestResolvedNotification {
        let JsonRpcMessage::Notification(notification) =
            timeout(Duration::from_secs(2), outbound.recv())
                .await
                .expect("resolved notification timeout")
                .expect("resolved notification")
        else {
            panic!("expected App Server resolved notification");
        };
        assert_eq!(notification.method, METHOD_SERVER_REQUEST_RESOLVED);
        let ServerNotification::ServerRequestResolved(params) =
            ServerNotification::try_from(notification).expect("typed resolved notification")
        else {
            panic!("expected typed resolved notification");
        };
        params
    }

    async fn begin_outer_wait(
        server: &AppServer,
        outbound: &mut tokio::sync::broadcast::Receiver<JsonRpcMessage>,
        closed: CancellationToken,
    ) -> (
        JsonRpcRequest,
        tokio::task::JoinHandle<Option<ElicitationResponse>>,
    ) {
        let pending = server
            .begin_test_server_request(
                METHOD_MCP_SERVER_ELICITATION_REQUEST,
                json!({
                    "threadId": "thread-1",
                    "turnId": null,
                    "serverName": "form-server",
                    "mode": "form",
                    "_meta": null,
                    "message": "Choose a value",
                    "requestedSchema": {
                        "type": "object",
                        "properties": {}
                    }
                }),
            )
            .await
            .expect("begin outer request");
        let request = next_outer_request(outbound).await;
        let wait_server = server.clone();
        let terminal = tokio::spawn(async move {
            let terminal =
                wait_for_outer_terminal(pending, closed, "test-domain-request".to_string()).await;
            notify_resolved(&wait_server, terminal.owner, terminal.outer_request_id).await;
            terminal.response
        });
        (request, terminal)
    }

    async fn assert_no_duplicate(outbound: &mut tokio::sync::broadcast::Receiver<JsonRpcMessage>) {
        assert!(timeout(Duration::from_millis(100), outbound.recv())
            .await
            .is_err());
    }

    fn assert_private_identity_absent(value: &serde_json::Value) {
        match value {
            serde_json::Value::Array(values) => {
                for value in values {
                    assert_private_identity_absent(value);
                }
            }
            serde_json::Value::Object(fields) => {
                for (key, value) in fields {
                    assert_ne!(key, "limeai.run/mcp-call-scope");
                    assert_ne!(key, "rawRequestId");
                    assert_ne!(key, "mcpRequestId");
                    assert_private_identity_absent(value);
                }
            }
            _ => {}
        }
    }

    #[tokio::test]
    async fn codex_thread_owner_reaches_outer_request_without_invented_identity() {
        let server = AppServer::new();
        let mut outbound = server.subscribe_outbound_messages();
        let params = McpServerElicitationRequestParams {
            thread_id: "thread-7".to_string(),
            turn_id: Some("turn-7".to_string()),
            server_name: "form-server".to_string(),
            request: McpServerElicitationRequest::Form {
                meta: Some(json!({ "persist": ["session", "always"] })),
                message: "Choose a value".to_string(),
                requested_schema: serde_json::from_value(json!({
                    "type": "object",
                    "properties": { "confirmed": { "type": "boolean" } },
                    "required": ["confirmed"]
                }))
                .expect("object schema"),
            },
        };

        let pending = server
            .begin_test_server_request(
                METHOD_MCP_SERVER_ELICITATION_REQUEST,
                serde_json::to_value(params).expect("serialize elicitation params"),
            )
            .await
            .expect("begin outer request");
        let request = next_outer_request(&mut outbound).await;
        let request_params = request.params.as_ref().expect("outer request params");

        assert_eq!(
            request_params,
            &json!({
                "threadId": "thread-7",
                "turnId": "turn-7",
                "serverName": "form-server",
                "mode": "form",
                "_meta": { "persist": ["session", "always"] },
                "message": "Choose a value",
                "requestedSchema": {
                    "type": "object",
                    "properties": { "confirmed": { "type": "boolean" } },
                    "required": ["confirmed"]
                }
            })
        );
        assert!(request_params.get("sessionId").is_none());
        assert!(request_params.get("parentToolCallId").is_none());
        assert_private_identity_absent(request_params);
        drop(pending);
    }

    #[test]
    fn typed_outer_response_preserves_action_and_meta_contract() {
        assert_eq!(
            parse_response(json!({ "action": "decline" })).expect("decline"),
            ElicitationResponse::Decline
        );
        assert!(parse_response(json!({
            "action": "accept",
            "content": ["not", "an", "object"]
        }))
        .is_err());
        assert!(parse_response(json!({
            "action": "cancel",
            "content": { "unexpected": true }
        }))
        .is_err());
        assert!(parse_response(json!({
            "action": "decline",
            "_meta": { "trace": "declined" }
        }))
        .is_ok());
    }

    #[tokio::test]
    async fn normal_result_notifies_resolved_before_domain_response_once() {
        let server = AppServer::new();
        let mut outbound = server.subscribe_outbound_messages();
        let (request, terminal) =
            begin_outer_wait(&server, &mut outbound, CancellationToken::new()).await;
        let outer_request_id = request.id.clone();

        server
            .handle_message(JsonRpcMessage::Response(
                JsonRpcResponse::new(request.id, json!({ "action": "decline" }))
                    .expect("outer response"),
            ))
            .await
            .expect("handle outer response");

        assert_eq!(
            next_resolved(&mut outbound).await.request_id,
            outer_request_id
        );
        assert_eq!(
            terminal.await.expect("terminal join"),
            Some(ElicitationResponse::Decline)
        );
        assert_no_duplicate(&mut outbound).await;
    }

    #[tokio::test]
    async fn malformed_result_notifies_resolved_before_cancel_response_once() {
        let server = AppServer::new();
        let mut outbound = server.subscribe_outbound_messages();
        let (request, terminal) =
            begin_outer_wait(&server, &mut outbound, CancellationToken::new()).await;
        let outer_request_id = request.id.clone();

        server
            .handle_message(JsonRpcMessage::Response(
                JsonRpcResponse::new(
                    request.id,
                    json!({ "action": "accept", "content": ["not", "an", "object"] }),
                )
                .expect("outer response"),
            ))
            .await
            .expect("handle malformed outer response");

        assert_eq!(
            next_resolved(&mut outbound).await.request_id,
            outer_request_id
        );
        assert_eq!(
            terminal.await.expect("terminal join"),
            Some(ElicitationResponse::Cancel)
        );
        assert_no_duplicate(&mut outbound).await;
    }

    #[tokio::test]
    async fn json_rpc_error_notifies_resolved_before_domain_response_once() {
        let server = AppServer::new();
        let mut outbound = server.subscribe_outbound_messages();
        let (request, terminal) =
            begin_outer_wait(&server, &mut outbound, CancellationToken::new()).await;
        let outer_request_id = request.id.clone();

        server
            .handle_message(JsonRpcMessage::Error(JsonRpcErrorResponse {
                id: request.id,
                error: JsonRpcError::new(error_codes::INVALID_REQUEST, "invalid form response"),
            }))
            .await
            .expect("handle outer error");

        assert_eq!(
            next_resolved(&mut outbound).await.request_id,
            outer_request_id
        );
        assert_eq!(
            terminal.await.expect("terminal join"),
            Some(ElicitationResponse::Decline)
        );
        assert_no_duplicate(&mut outbound).await;
    }

    #[tokio::test]
    async fn request_cancel_error_notifies_resolved_before_cancel_response_once() {
        let server = AppServer::new();
        let mut outbound = server.subscribe_outbound_messages();
        let (request, terminal) =
            begin_outer_wait(&server, &mut outbound, CancellationToken::new()).await;
        let outer_request_id = request.id.clone();

        server
            .handle_message(JsonRpcMessage::Error(JsonRpcErrorResponse {
                id: request.id,
                error: JsonRpcError::new(error_codes::REQUEST_CANCELLED, "request cancelled"),
            }))
            .await
            .expect("handle outer cancellation");

        assert_eq!(
            next_resolved(&mut outbound).await.request_id,
            outer_request_id
        );
        assert_eq!(
            terminal.await.expect("terminal join"),
            Some(ElicitationResponse::Cancel)
        );
        assert_no_duplicate(&mut outbound).await;
    }

    #[tokio::test]
    async fn rmcp_closed_notifies_resolved_without_domain_resolve_once() {
        let server = AppServer::new();
        let mut outbound = server.subscribe_outbound_messages();
        let closed = CancellationToken::new();
        let (request, terminal) = begin_outer_wait(&server, &mut outbound, closed.clone()).await;
        let outer_request_id = request.id;

        closed.cancel();

        assert_eq!(
            next_resolved(&mut outbound).await.request_id,
            outer_request_id
        );
        assert_eq!(terminal.await.expect("terminal join"), None);
        assert_no_duplicate(&mut outbound).await;
    }
}
