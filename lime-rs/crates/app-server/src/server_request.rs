use app_server_protocol::error_codes;
use app_server_protocol::JsonRpcError;
use app_server_protocol::JsonRpcRequest;
use app_server_protocol::RequestId;
use app_server_protocol::ServerNotification;
use app_server_transport::ConnectionId;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::AtomicU64;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::sync::Mutex;
use thiserror::Error;
use tokio::sync::oneshot;
use uuid::Uuid;

use crate::AppServer;
use crate::AppServerError;
use crate::JsonRpcMessage;

const SERVER_REQUEST_ID_PREFIX: &str = "app-server-request";

type ServerRequestResolution = Result<Value, JsonRpcError>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ServerRequestOwner {
    #[cfg(test)]
    Subscriber,
    Transport(ConnectionId),
}

struct PendingRoute {
    owner: ServerRequestOwner,
    sender: oneshot::Sender<ServerRequestResolution>,
}

#[derive(Clone, Default)]
pub(crate) struct ServerRequestRouter {
    inner: Arc<ServerRequestRouterInner>,
}

struct ServerRequestRouterInner {
    boot_nonce: Uuid,
    next_request_id: AtomicU64,
    pending: Mutex<HashMap<RequestId, PendingRoute>>,
}

pub(crate) struct PendingServerRequest {
    id: RequestId,
    owner: ServerRequestOwner,
    request: JsonRpcRequest,
    receiver: oneshot::Receiver<ServerRequestResolution>,
    router: ServerRequestRouter,
}

#[derive(Debug, Error)]
pub enum ServerRequestError {
    #[error("no App Server client is available for server request")]
    ClientUnavailable,
    #[error("server request has {client_count} possible App Server clients")]
    ClientAmbiguous { client_count: usize },
    #[error("server request response came from the wrong App Server client: {id}")]
    ClientMismatch { id: RequestId },
    #[error("App Server client rejected server request {id}: {error:?}")]
    ClientRejected { id: RequestId, error: JsonRpcError },
    #[error("server request response channel closed for {id}")]
    ResponseChannelClosed { id: RequestId },
    #[error("server request response does not match a pending request: {id}")]
    RequestNotFound { id: RequestId },
}

impl Default for ServerRequestRouterInner {
    fn default() -> Self {
        Self {
            boot_nonce: Uuid::new_v4(),
            next_request_id: AtomicU64::new(0),
            pending: Mutex::new(HashMap::new()),
        }
    }
}

impl ServerRequestRouter {
    #[cfg(test)]
    pub(crate) fn register(
        &self,
        method: impl Into<String>,
        params: Option<Value>,
    ) -> PendingServerRequest {
        self.register_for_owner(ServerRequestOwner::Subscriber, method, params)
    }

    pub(crate) fn register_for_owner(
        &self,
        owner: ServerRequestOwner,
        method: impl Into<String>,
        params: Option<Value>,
    ) -> PendingServerRequest {
        let id = RequestId::String(format!(
            "{SERVER_REQUEST_ID_PREFIX}:{}:{}",
            self.inner.boot_nonce,
            self.inner.next_request_id.fetch_add(1, Ordering::Relaxed)
        ));
        let request = JsonRpcRequest::new(id.clone(), method, params);
        let (sender, receiver) = oneshot::channel();
        let replaced = self
            .inner
            .pending
            .lock()
            .expect("server request router mutex poisoned")
            .insert(id.clone(), PendingRoute { owner, sender });
        debug_assert!(replaced.is_none(), "generated server request id collided");
        PendingServerRequest {
            id,
            owner,
            request,
            receiver,
            router: self.clone(),
        }
    }

    #[cfg(test)]
    fn with_boot_nonce(boot_nonce: Uuid) -> Self {
        Self {
            inner: Arc::new(ServerRequestRouterInner {
                boot_nonce,
                next_request_id: AtomicU64::new(0),
                pending: Mutex::new(HashMap::new()),
            }),
        }
    }

    #[cfg(test)]
    pub(crate) fn resolve_response(
        &self,
        id: RequestId,
        result: Value,
    ) -> Result<(), ServerRequestError> {
        self.resolve(ServerRequestOwner::Subscriber, id, Ok(result))
    }

    pub(crate) fn resolve_transport_response(
        &self,
        connection_id: ConnectionId,
        id: RequestId,
        result: Value,
    ) -> Result<(), ServerRequestError> {
        self.resolve(ServerRequestOwner::Transport(connection_id), id, Ok(result))
    }

    #[cfg(test)]
    pub(crate) fn resolve_error(
        &self,
        id: RequestId,
        error: JsonRpcError,
    ) -> Result<(), ServerRequestError> {
        self.resolve(ServerRequestOwner::Subscriber, id, Err(error))
    }

    pub(crate) fn resolve_transport_error(
        &self,
        connection_id: ConnectionId,
        id: RequestId,
        error: JsonRpcError,
    ) -> Result<(), ServerRequestError> {
        self.resolve(ServerRequestOwner::Transport(connection_id), id, Err(error))
    }

    pub(crate) fn cancel_all(&self, reason: impl Into<String>) -> usize {
        let error = JsonRpcError::new(error_codes::REQUEST_CANCELLED, reason);
        let pending = self
            .inner
            .pending
            .lock()
            .expect("server request router mutex poisoned")
            .drain()
            .collect::<Vec<_>>();
        let count = pending.len();
        for (_, route) in pending {
            let _ = route.sender.send(Err(error.clone()));
        }
        count
    }

    pub(crate) fn cancel_owner(
        &self,
        owner: ServerRequestOwner,
        reason: impl Into<String>,
    ) -> usize {
        let error = JsonRpcError::new(error_codes::REQUEST_CANCELLED, reason);
        let mut pending = self
            .inner
            .pending
            .lock()
            .expect("server request router mutex poisoned");
        let request_ids = pending
            .iter()
            .filter_map(|(request_id, route)| (route.owner == owner).then_some(request_id.clone()))
            .collect::<Vec<_>>();
        let routes = request_ids
            .iter()
            .filter_map(|request_id| pending.remove(request_id))
            .collect::<Vec<_>>();
        drop(pending);
        let count = routes.len();
        for route in routes {
            let _ = route.sender.send(Err(error.clone()));
        }
        count
    }

    fn resolve(
        &self,
        owner: ServerRequestOwner,
        id: RequestId,
        resolution: ServerRequestResolution,
    ) -> Result<(), ServerRequestError> {
        let mut pending = self
            .inner
            .pending
            .lock()
            .expect("server request router mutex poisoned");
        let route = pending
            .get(&id)
            .ok_or_else(|| ServerRequestError::RequestNotFound { id: id.clone() })?;
        if route.owner != owner {
            return Err(ServerRequestError::ClientMismatch { id });
        }
        let route = pending
            .remove(&id)
            .expect("pending server request disappeared while locked");
        drop(pending);
        route
            .sender
            .send(resolution)
            .map_err(|_| ServerRequestError::ResponseChannelClosed { id })
    }

    fn cancel(&self, id: &RequestId) {
        self.inner
            .pending
            .lock()
            .expect("server request router mutex poisoned")
            .remove(id);
    }

    #[cfg(test)]
    fn pending_count(&self) -> usize {
        self.inner
            .pending
            .lock()
            .expect("server request router mutex poisoned")
            .len()
    }
}

impl PendingServerRequest {
    pub(crate) fn id(&self) -> &RequestId {
        &self.id
    }

    pub(crate) fn request(&self) -> &JsonRpcRequest {
        &self.request
    }

    pub(crate) fn owner(&self) -> ServerRequestOwner {
        self.owner
    }

    pub(crate) async fn wait(mut self) -> Result<Value, ServerRequestError> {
        match (&mut self.receiver).await {
            Ok(Ok(result)) => Ok(result),
            Ok(Err(error)) => Err(ServerRequestError::ClientRejected {
                id: self.id.clone(),
                error,
            }),
            Err(_) => Err(ServerRequestError::ResponseChannelClosed {
                id: self.id.clone(),
            }),
        }
    }
}

impl AppServer {
    pub(crate) async fn begin_server_request(
        &self,
        method: impl Into<String>,
        params: impl serde::Serialize,
    ) -> Result<PendingServerRequest, AppServerError> {
        let client = self.server_request_client()?;
        let owner = ServerRequestOwner::Transport(client.connection_id);
        let pending = self.server_requests.register_for_owner(
            owner,
            method,
            Some(serde_json::to_value(params)?),
        );
        let message = JsonRpcMessage::Request(pending.request().clone());
        self.send_to_server_request_client(client, message).await?;
        Ok(pending)
    }

    #[cfg(test)]
    pub(crate) async fn begin_test_server_request(
        &self,
        method: impl Into<String>,
        params: impl serde::Serialize,
    ) -> Result<PendingServerRequest, AppServerError> {
        let pending = self.server_requests.register_for_owner(
            ServerRequestOwner::Subscriber,
            method,
            Some(serde_json::to_value(params)?),
        );
        self.outbound_messages
            .send(JsonRpcMessage::Request(pending.request().clone()))
            .map_err(|_| ServerRequestError::ClientUnavailable)?;
        Ok(pending)
    }

    pub(crate) async fn send_server_notification_to_owner(
        &self,
        owner: ServerRequestOwner,
        notification: ServerNotification,
    ) -> Result<(), AppServerError> {
        let message = JsonRpcMessage::Notification(notification.into());
        match owner {
            #[cfg(test)]
            ServerRequestOwner::Subscriber => self
                .outbound_messages
                .send(message)
                .map(|_| ())
                .map_err(|_| ServerRequestError::ClientUnavailable.into()),
            ServerRequestOwner::Transport(connection_id) => {
                self.send_to_transport_connection(connection_id, message)
                    .await
            }
        }
    }
}

impl Drop for PendingServerRequest {
    fn drop(&mut self) {
        self.router.cancel(&self.id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::finish_json_lines;
    use crate::run_json_lines;
    use crate::AppServer;
    use app_server_protocol::JsonRpcMessage;
    use serde_json::json;
    use std::time::Duration;
    use tokio::io::AsyncBufReadExt;
    use tokio::io::AsyncWriteExt;
    use tokio::io::BufReader;

    #[test]
    fn server_request_ids_are_unique_across_boot_scopes() {
        let first_router = ServerRequestRouter::with_boot_nonce(Uuid::from_u128(1));
        let second_router = ServerRequestRouter::with_boot_nonce(Uuid::from_u128(2));

        let first = first_router.register("test/request", None);
        let second = second_router.register("test/request", None);

        assert_ne!(first.id(), second.id());
        assert!(first.id().to_string().ends_with(":0"));
        assert!(second.id().to_string().ends_with(":0"));
    }

    #[tokio::test]
    async fn server_request_routes_concurrent_responses_by_exact_id() {
        let router = ServerRequestRouter::default();
        let first = router.register("first/request", Some(json!({ "index": 1 })));
        let second = router.register("second/request", Some(json!({ "index": 2 })));

        router
            .resolve_response(second.id().clone(), json!({ "accepted": 2 }))
            .expect("second response");
        assert_eq!(
            second.wait().await.expect("second result"),
            json!({ "accepted": 2 })
        );
        assert_eq!(router.pending_count(), 1);

        router
            .resolve_response(first.id().clone(), json!({ "accepted": 1 }))
            .expect("first response");
        assert_eq!(
            first.wait().await.expect("first result"),
            json!({ "accepted": 1 })
        );
        assert_eq!(router.pending_count(), 0);
    }

    #[tokio::test]
    async fn server_request_duplicate_and_unknown_responses_fail_closed() {
        let router = ServerRequestRouter::default();
        let pending = router.register("test/request", None);
        let id = pending.id().clone();

        router
            .resolve_response(id.clone(), json!({ "ok": true }))
            .expect("first response");
        assert!(matches!(
            router.resolve_response(id.clone(), json!({ "ok": false })),
            Err(ServerRequestError::RequestNotFound { id: missing }) if missing == id
        ));
        assert!(matches!(
            router.resolve_response(RequestId::String("unknown".to_string()), json!(null)),
            Err(ServerRequestError::RequestNotFound { .. })
        ));
        assert_eq!(
            pending.wait().await.expect("original result"),
            json!({ "ok": true })
        );
    }

    #[tokio::test]
    async fn server_request_drop_and_disconnect_cleanup_remove_exact_waiters() {
        let router = ServerRequestRouter::default();
        let dropped = router.register("drop/request", None);
        let dropped_id = dropped.id().clone();
        drop(dropped);
        assert!(matches!(
            router.resolve_response(dropped_id, json!(null)),
            Err(ServerRequestError::RequestNotFound { .. })
        ));

        let first = router.register("disconnect/first", None);
        let second = router.register("disconnect/second", None);
        assert_eq!(router.cancel_all("transport disconnected"), 2);
        for pending in [first, second] {
            assert!(matches!(
                pending.wait().await,
                Err(ServerRequestError::ClientRejected { error, .. })
                    if error.code == error_codes::REQUEST_CANCELLED
            ));
        }
        assert_eq!(router.pending_count(), 0);
    }

    #[tokio::test]
    async fn server_request_aborted_wait_removes_waiter_before_late_response() {
        let router = ServerRequestRouter::default();
        let pending = router.register("abort/request", None);
        let id = pending.id().clone();
        let waiting = tokio::spawn(pending.wait());

        assert_eq!(router.pending_count(), 1);
        waiting.abort();
        assert!(waiting
            .await
            .expect_err("wait task should abort")
            .is_cancelled());
        assert_eq!(router.pending_count(), 0);
        assert!(matches!(
            router.resolve_response(id, json!(null)),
            Err(ServerRequestError::RequestNotFound { .. })
        ));
    }

    #[tokio::test]
    async fn server_request_rejects_broadcast_subscribers_without_leaking_waiter() {
        let server = AppServer::new();
        let _first_client = server.subscribe_outbound_messages();
        let error = server
            .send_server_request("test/request", json!({}))
            .await
            .expect_err("broadcast subscribers must not own server requests");

        assert!(matches!(
            error,
            crate::AppServerError::ServerRequest(ServerRequestError::ClientUnavailable)
        ));
        assert_eq!(server.server_requests.pending_count(), 0);
    }

    #[tokio::test]
    async fn json_lines_error_exit_cleans_waiters_pump_and_transport_writer() {
        let server = AppServer::new();
        let (writer, _outbound) = tokio::sync::mpsc::channel(1);
        server
            .transport_writers
            .lock()
            .expect("transport writers")
            .insert(ConnectionId(1), writer);
        let pending = server.server_requests.register_for_owner(
            ServerRequestOwner::Transport(ConnectionId(1)),
            "test/request",
            None,
        );
        let shutdown = tokio_util::sync::CancellationToken::new();
        let pump_shutdown = shutdown.clone();
        let pump = tokio::spawn(async move {
            pump_shutdown.cancelled().await;
        });

        let error = finish_json_lines(
            &server,
            shutdown,
            pump,
            Err(AppServerError::ServerRequest(
                ServerRequestError::ClientUnavailable,
            )),
        )
        .await
        .expect_err("transport error must be preserved");

        assert!(matches!(
            error,
            AppServerError::ServerRequest(ServerRequestError::ClientUnavailable)
        ));
        assert!(matches!(
            pending.wait().await,
            Err(ServerRequestError::ClientRejected { error, .. })
                if error.code == error_codes::REQUEST_CANCELLED
        ));
        assert!(server
            .transport_writers
            .lock()
            .expect("transport writers")
            .is_empty());
        assert_eq!(server.server_requests.pending_count(), 0);
    }

    #[tokio::test]
    async fn server_request_owner_rejects_cross_connection_response_and_disconnect() {
        let router = ServerRequestRouter::default();
        let first = router.register_for_owner(
            ServerRequestOwner::Transport(ConnectionId(1)),
            "first/request",
            None,
        );
        let first_id = first.id().clone();
        let second = router.register_for_owner(
            ServerRequestOwner::Transport(ConnectionId(2)),
            "second/request",
            None,
        );

        assert!(matches!(
            router.resolve_transport_response(ConnectionId(2), first_id.clone(), json!(null)),
            Err(ServerRequestError::ClientMismatch { id }) if id == first_id
        ));
        assert_eq!(router.pending_count(), 2);
        assert_eq!(
            router.cancel_owner(
                ServerRequestOwner::Transport(ConnectionId(1)),
                "first disconnected",
            ),
            1
        );
        assert!(matches!(
            first.wait().await,
            Err(ServerRequestError::ClientRejected { error, .. })
                if error.code == error_codes::REQUEST_CANCELLED
        ));
        assert_eq!(router.pending_count(), 1);

        router
            .resolve_transport_response(ConnectionId(2), second.id().clone(), json!({ "ok": true }))
            .expect("second owner response");
        assert_eq!(
            second.wait().await.expect("second result"),
            json!({ "ok": true })
        );
    }

    #[tokio::test]
    async fn resolved_notification_targets_only_the_captured_connection_owner() {
        let server = AppServer::new();
        let (first_tx, mut first_rx) = tokio::sync::mpsc::channel(1);
        let (second_tx, mut second_rx) = tokio::sync::mpsc::channel(1);
        server
            .transport_writers
            .lock()
            .expect("transport writers")
            .extend([(ConnectionId(1), first_tx), (ConnectionId(2), second_tx)]);
        let request_id = RequestId::String("app-server-request:boot:7".to_string());

        server
            .send_server_notification_to_owner(
                ServerRequestOwner::Transport(ConnectionId(1)),
                ServerNotification::ServerRequestResolved(
                    app_server_protocol::ServerRequestResolvedNotification {
                        request_id: request_id.clone(),
                    },
                ),
            )
            .await
            .expect("send exact notification");

        let message = first_rx.recv().await.expect("first owner message");
        let JsonRpcMessage::Notification(notification) = message.message.into_json_rpc_message()
        else {
            panic!("expected resolved notification");
        };
        assert_eq!(
            ServerNotification::try_from(notification).expect("typed notification"),
            ServerNotification::ServerRequestResolved(
                app_server_protocol::ServerRequestResolvedNotification { request_id }
            )
        );
        assert!(matches!(
            second_rx.try_recv(),
            Err(tokio::sync::mpsc::error::TryRecvError::Empty)
        ));
    }

    #[tokio::test]
    async fn server_request_round_trips_through_json_lines_transport() {
        let server = AppServer::new();
        let (client_io, server_io) = tokio::io::duplex(16 * 1024);
        let (client_read, mut client_write) = tokio::io::split(client_io);
        let (server_read, server_write) = tokio::io::split(server_io);
        let running = tokio::spawn(run_json_lines(server.clone(), server_read, server_write));

        tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                if !server
                    .transport_writers
                    .lock()
                    .expect("transport writer mutex")
                    .is_empty()
                {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("transport should connect");

        let request_server = server.clone();
        let pending = tokio::spawn(async move {
            request_server
                .send_server_request(
                    "mcpServer/elicitation/request",
                    json!({
                        "server": "form-server",
                        "message": "Choose a value",
                        "requestedSchema": {
                            "type": "object",
                            "properties": {}
                        }
                    }),
                )
                .await
        });

        let mut lines = BufReader::new(client_read).lines();
        let line = tokio::time::timeout(Duration::from_secs(2), lines.next_line())
            .await
            .expect("server request should arrive")
            .expect("read server request")
            .expect("server request line");
        let JsonRpcMessage::Request(request) =
            serde_json::from_str::<JsonRpcMessage>(&line).expect("decode server request")
        else {
            panic!("expected server request");
        };
        assert_eq!(request.method, "mcpServer/elicitation/request");

        let response = JsonRpcMessage::Response(
            app_server_protocol::JsonRpcResponse::new(request.id, json!({ "action": "decline" }))
                .expect("serialize response"),
        );
        client_write
            .write_all(
                format!(
                    "{}\n",
                    serde_json::to_string(&response).expect("encode response")
                )
                .as_bytes(),
            )
            .await
            .expect("write response");

        assert_eq!(
            pending
                .await
                .expect("request task")
                .expect("server request result"),
            json!({ "action": "decline" })
        );

        drop(client_write);
        drop(lines);
        tokio::time::timeout(Duration::from_secs(2), running)
            .await
            .expect("transport should stop")
            .expect("transport task")
            .expect("transport result");
    }
}
