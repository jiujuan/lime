use app_server_protocol::JsonRpcErrorResponse;
use app_server_protocol::JsonRpcMessage;
use app_server_protocol::JsonRpcNotification;
use app_server_protocol::JsonRpcRequest;
use app_server_protocol::JsonRpcResponse;
use std::fmt;
use std::sync::mpsc;

pub const CHANNEL_CAPACITY: usize = 256;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct ConnectionId(pub u64);

impl fmt::Display for ConnectionId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.0)
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum ConnectionOrigin {
    Stdio,
    InProcess,
}

#[derive(Debug, Clone, PartialEq)]
pub enum OutgoingMessage {
    Request(JsonRpcRequest),
    Notification(JsonRpcNotification),
    Response(JsonRpcResponse),
    Error(JsonRpcErrorResponse),
}

impl OutgoingMessage {
    pub fn into_json_rpc_message(self) -> JsonRpcMessage {
        match self {
            Self::Request(request) => JsonRpcMessage::Request(request),
            Self::Notification(notification) => JsonRpcMessage::Notification(notification),
            Self::Response(response) => JsonRpcMessage::Response(response),
            Self::Error(error) => JsonRpcMessage::Error(error),
        }
    }
}

impl From<JsonRpcMessage> for OutgoingMessage {
    fn from(message: JsonRpcMessage) -> Self {
        match message {
            JsonRpcMessage::Request(request) => Self::Request(request),
            JsonRpcMessage::Notification(notification) => Self::Notification(notification),
            JsonRpcMessage::Response(response) => Self::Response(response),
            JsonRpcMessage::Error(error) => Self::Error(error),
        }
    }
}

#[derive(Debug)]
pub struct QueuedOutgoingMessage {
    pub message: OutgoingMessage,
    pub write_complete_tx: Option<mpsc::Sender<()>>,
}

impl QueuedOutgoingMessage {
    pub fn new(message: OutgoingMessage) -> Self {
        Self {
            message,
            write_complete_tx: None,
        }
    }

    pub fn with_write_complete_tx(
        message: OutgoingMessage,
        write_complete_tx: mpsc::Sender<()>,
    ) -> Self {
        Self {
            message,
            write_complete_tx: Some(write_complete_tx),
        }
    }
}
