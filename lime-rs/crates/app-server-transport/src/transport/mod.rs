mod stdio;

use crate::decode_message;
use crate::encode_message;
use crate::ConnectionId;
use crate::ConnectionOrigin;
use crate::OutgoingMessage;
use crate::QueuedOutgoingMessage;
use app_server_protocol::JsonRpcError;
use app_server_protocol::JsonRpcErrorResponse;
use app_server_protocol::JsonRpcMessage;
use std::fmt;
use std::net::SocketAddr;
use std::path::Path;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::sync::mpsc;
use tokio::sync::mpsc::error::TrySendError;

pub use stdio::extract_stdio_initialize_client_name;
pub use stdio::start_stdio_connection;
pub use stdio::StdioConnection;

pub const OVERLOADED_ERROR_CODE: i64 = -32001;
pub const APP_SERVER_CONTROL_SOCKET_DIR_NAME: &str = "app-server-control";
pub const APP_SERVER_CONTROL_SOCKET_FILE_NAME: &str = "app-server-control.sock";
pub const APP_SERVER_STARTUP_LOCK_FILE_NAME: &str = "app-server-startup.lock";

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AppServerTransport {
    Stdio,
    UnixSocket { socket_path: PathBuf },
    WebSocket { bind_address: SocketAddr },
    Off,
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub enum AppServerTransportParseError {
    UnsupportedListenUrl(String),
    InvalidUnixSocketPath { listen_url: String, message: String },
    InvalidWebSocketListenUrl(String),
}

impl fmt::Display for AppServerTransportParseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedListenUrl(listen_url) => write!(
                formatter,
                "unsupported --listen URL `{listen_url}`; expected `stdio://`, `unix://PATH`, `ws://IP:PORT`, or `off`"
            ),
            Self::InvalidUnixSocketPath {
                listen_url,
                message,
            } => write!(
                formatter,
                "invalid unix socket --listen URL `{listen_url}`; failed to resolve socket path: {message}"
            ),
            Self::InvalidWebSocketListenUrl(listen_url) => write!(
                formatter,
                "invalid websocket --listen URL `{listen_url}`; expected `ws://IP:PORT`"
            ),
        }
    }
}

impl std::error::Error for AppServerTransportParseError {}

impl AppServerTransport {
    pub const DEFAULT_LISTEN_URL: &'static str = crate::DEFAULT_LISTEN_URL;

    pub fn from_listen_url(listen_url: &str) -> Result<Self, AppServerTransportParseError> {
        if listen_url == Self::DEFAULT_LISTEN_URL {
            return Ok(Self::Stdio);
        }

        if let Some(raw_socket_path) = listen_url.strip_prefix("unix://") {
            if raw_socket_path.trim().is_empty() {
                return Err(AppServerTransportParseError::InvalidUnixSocketPath {
                    listen_url: listen_url.to_string(),
                    message: "empty unix socket paths must be resolved by the host app".to_string(),
                });
            }
            return Ok(Self::UnixSocket {
                socket_path: PathBuf::from(raw_socket_path),
            });
        }

        if listen_url == "off" {
            return Ok(Self::Off);
        }

        if let Some(socket_addr) = listen_url.strip_prefix("ws://") {
            let bind_address = socket_addr.parse::<SocketAddr>().map_err(|_| {
                AppServerTransportParseError::InvalidWebSocketListenUrl(listen_url.to_string())
            })?;
            return Ok(Self::WebSocket { bind_address });
        }

        Err(AppServerTransportParseError::UnsupportedListenUrl(
            listen_url.to_string(),
        ))
    }
}

impl std::str::FromStr for AppServerTransport {
    type Err = AppServerTransportParseError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::from_listen_url(value)
    }
}

#[derive(Debug)]
pub enum TransportEvent {
    ConnectionOpened {
        connection_id: ConnectionId,
        origin: ConnectionOrigin,
        writer: mpsc::Sender<QueuedOutgoingMessage>,
    },
    StdioClientInitialized {
        connection_id: ConnectionId,
        client_name: String,
    },
    ConnectionClosed {
        connection_id: ConnectionId,
    },
    IncomingMessage {
        connection_id: ConnectionId,
        message: JsonRpcMessage,
    },
}

static CONNECTION_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

pub fn next_connection_id() -> ConnectionId {
    ConnectionId(CONNECTION_ID_COUNTER.fetch_add(1, Ordering::Relaxed))
}

pub fn app_server_control_socket_path(base_dir: &Path) -> PathBuf {
    base_dir
        .join(APP_SERVER_CONTROL_SOCKET_DIR_NAME)
        .join(APP_SERVER_CONTROL_SOCKET_FILE_NAME)
}

pub fn app_server_startup_lock_path(base_dir: &Path) -> PathBuf {
    base_dir
        .join(APP_SERVER_CONTROL_SOCKET_DIR_NAME)
        .join(APP_SERVER_STARTUP_LOCK_FILE_NAME)
}

pub async fn forward_incoming_message(
    transport_event_tx: &mpsc::Sender<TransportEvent>,
    writer: &mpsc::Sender<QueuedOutgoingMessage>,
    connection_id: ConnectionId,
    payload: &str,
) -> bool {
    match decode_message(payload) {
        Ok(message) => {
            enqueue_incoming_message(transport_event_tx, writer, connection_id, message).await
        }
        Err(_) => true,
    }
}

pub async fn enqueue_incoming_message(
    transport_event_tx: &mpsc::Sender<TransportEvent>,
    writer: &mpsc::Sender<QueuedOutgoingMessage>,
    connection_id: ConnectionId,
    message: JsonRpcMessage,
) -> bool {
    let event = TransportEvent::IncomingMessage {
        connection_id,
        message,
    };
    match transport_event_tx.try_send(event) {
        Ok(()) => true,
        Err(mpsc::error::TrySendError::Closed(_)) => false,
        Err(TrySendError::Full(TransportEvent::IncomingMessage {
            connection_id: _,
            message: JsonRpcMessage::Request(request),
        })) => {
            let overload = OutgoingMessage::Error(JsonRpcErrorResponse {
                id: request.id,
                error: JsonRpcError::new(OVERLOADED_ERROR_CODE, "Server overloaded; retry later."),
            });
            match writer.try_send(QueuedOutgoingMessage::new(overload)) {
                Ok(()) => true,
                Err(mpsc::error::TrySendError::Closed(_)) => false,
                Err(TrySendError::Full(_)) => true,
            }
        }
        Err(TrySendError::Full(event)) => transport_event_tx.send(event).await.is_ok(),
    }
}

pub fn serialize_outgoing_message(message: OutgoingMessage) -> Option<String> {
    encode_message(&message.into_json_rpc_message()).ok()
}

pub fn overload_error_for_request(
    request_id: app_server_protocol::RequestId,
) -> JsonRpcErrorResponse {
    JsonRpcErrorResponse {
        id: request_id,
        error: JsonRpcError::new(OVERLOADED_ERROR_CODE, "Server overloaded; retry later."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::JsonRpcNotification;
    use app_server_protocol::JsonRpcRequest;
    use app_server_protocol::JsonRpcResponse;
    use app_server_protocol::RequestId;
    use serde_json::json;

    #[test]
    fn listen_urls_parse_like_codex_transport_boundary() {
        assert_eq!(
            AppServerTransport::from_listen_url("stdio://"),
            Ok(AppServerTransport::Stdio)
        );
        assert_eq!(
            AppServerTransport::from_listen_url("off"),
            Ok(AppServerTransport::Off)
        );
        assert_eq!(
            AppServerTransport::from_listen_url("unix:///tmp/app.sock"),
            Ok(AppServerTransport::UnixSocket {
                socket_path: PathBuf::from("/tmp/app.sock")
            })
        );
        assert_eq!(
            AppServerTransport::from_listen_url("ws://127.0.0.1:4222"),
            Ok(AppServerTransport::WebSocket {
                bind_address: "127.0.0.1:4222".parse().expect("addr")
            })
        );
        assert!(matches!(
            AppServerTransport::from_listen_url("http://127.0.0.1"),
            Err(AppServerTransportParseError::UnsupportedListenUrl(_))
        ));
    }

    #[test]
    fn control_paths_are_host_relative_not_home_hardcoded() {
        let base = Path::new("/state");

        assert_eq!(
            app_server_control_socket_path(base),
            PathBuf::from("/state")
                .join("app-server-control")
                .join("app-server-control.sock")
        );
        assert_eq!(
            app_server_startup_lock_path(base),
            PathBuf::from("/state")
                .join("app-server-control")
                .join("app-server-startup.lock")
        );
    }

    #[tokio::test]
    async fn enqueue_incoming_request_returns_overload_error_when_queue_is_full() {
        let connection_id = ConnectionId(42);
        let (transport_event_tx, transport_event_rx) = mpsc::channel(1);
        let (writer_tx, mut writer_rx) = mpsc::channel(1);

        transport_event_tx
            .send(TransportEvent::IncomingMessage {
                connection_id,
                message: JsonRpcMessage::Notification(JsonRpcNotification::new(
                    "initialized",
                    None,
                )),
            })
            .await
            .expect("queue first event");

        let request = JsonRpcMessage::Request(JsonRpcRequest::new(
            RequestId::Integer(7),
            "capability/list",
            Some(json!({})),
        ));

        assert!(
            enqueue_incoming_message(&transport_event_tx, &writer_tx, connection_id, request).await
        );

        drop(transport_event_rx);
        let overload = writer_rx.recv().await.expect("overload");
        let overload_json =
            serde_json::to_value(overload.message.into_json_rpc_message()).expect("overload json");
        assert_eq!(
            overload_json,
            json!({
                "id": 7,
                "error": {
                    "code": OVERLOADED_ERROR_CODE,
                    "message": "Server overloaded; retry later."
                }
            })
        );
    }

    #[tokio::test]
    async fn enqueue_incoming_response_waits_instead_of_dropping_when_queue_is_full() {
        let connection_id = ConnectionId(42);
        let (transport_event_tx, mut transport_event_rx) = mpsc::channel(1);
        let (writer_tx, _writer_rx) = mpsc::channel(1);

        transport_event_tx
            .send(TransportEvent::IncomingMessage {
                connection_id,
                message: JsonRpcMessage::Notification(JsonRpcNotification::new(
                    "initialized",
                    None,
                )),
            })
            .await
            .expect("queue first event");

        let tx = transport_event_tx.clone();
        let writer = writer_tx.clone();
        let handle = tokio::spawn(async move {
            enqueue_incoming_message(
                &tx,
                &writer,
                connection_id,
                JsonRpcMessage::Response(
                    JsonRpcResponse::new(RequestId::Integer(7), json!({ "ok": true }))
                        .expect("response"),
                ),
            )
            .await
        });

        let _first = transport_event_rx.recv().await.expect("first event");
        assert!(handle.await.expect("enqueue task"));

        match transport_event_rx.recv().await.expect("forwarded") {
            TransportEvent::IncomingMessage {
                connection_id: actual_connection_id,
                message: JsonRpcMessage::Response(response),
            } => {
                assert_eq!(actual_connection_id, connection_id);
                assert_eq!(response.id, RequestId::Integer(7));
            }
            other => panic!("expected forwarded response, got {other:?}"),
        }
    }
}
