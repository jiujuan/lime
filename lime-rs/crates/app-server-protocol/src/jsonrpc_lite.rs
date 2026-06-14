use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::fmt;

pub const JSONRPC_VERSION: &str = "2.0";
pub const JSONRPC_SCHEMA_TYPE_NAMES: &[&str] = &[
    "RequestId",
    "JsonRpcMessage",
    "JsonRpcRequest",
    "JsonRpcNotification",
    "JsonRpcResponse",
    "JsonRpcErrorResponse",
    "JsonRpcError",
];

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(untagged)]
pub enum RequestId {
    Integer(i64),
    String(String),
}

impl fmt::Display for RequestId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Integer(value) => write!(f, "{value}"),
            Self::String(value) => f.write_str(value),
        }
    }
}

pub type RpcResult = serde_json::Value;

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize, JsonSchema)]
#[serde(untagged)]
pub enum JsonRpcMessage {
    Request(JsonRpcRequest),
    Notification(JsonRpcNotification),
    Response(JsonRpcResponse),
    Error(JsonRpcErrorResponse),
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcRequest {
    pub id: RequestId,
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcNotification {
    pub method: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcResponse {
    pub id: RequestId,
    pub result: RpcResult,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcErrorResponse {
    pub id: RequestId,
    pub error: JsonRpcError,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct JsonRpcError {
    pub code: i64,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

pub mod error_codes {
    pub const PARSE_ERROR: i64 = -32700;
    pub const INVALID_REQUEST: i64 = -32600;
    pub const METHOD_NOT_FOUND: i64 = -32601;
    pub const INVALID_PARAMS: i64 = -32602;
    pub const RUNTIME_ERROR: i64 = -32000;
    pub const NOT_INITIALIZED: i64 = -32002;
    pub const ALREADY_INITIALIZED: i64 = -32003;
    pub const SESSION_NOT_FOUND: i64 = -32010;
    pub const TURN_NOT_ACTIVE: i64 = -32011;
    pub const TURN_ALREADY_ACTIVE: i64 = -32012;
    pub const SESSION_ALREADY_EXISTS: i64 = -32013;
    pub const CAPABILITY_DENIED: i64 = -32020;
}

impl JsonRpcRequest {
    pub fn new(
        id: RequestId,
        method: impl Into<String>,
        params: Option<serde_json::Value>,
    ) -> Self {
        Self {
            id,
            method: method.into(),
            params,
        }
    }
}

impl JsonRpcNotification {
    pub fn new(method: impl Into<String>, params: Option<serde_json::Value>) -> Self {
        Self {
            method: method.into(),
            params,
        }
    }
}

impl JsonRpcResponse {
    pub fn new(id: RequestId, result: impl Serialize) -> Result<Self, serde_json::Error> {
        Ok(Self {
            id,
            result: serde_json::to_value(result)?,
        })
    }
}

impl JsonRpcError {
    pub fn new(code: i64, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }

    pub fn with_data(
        code: i64,
        message: impl Into<String>,
        data: impl Serialize,
    ) -> Result<Self, serde_json::Error> {
        Ok(Self {
            code,
            message: message.into(),
            data: Some(serde_json::to_value(data)?),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_id_display_is_stable() {
        assert_eq!(RequestId::Integer(7).to_string(), "7");
        assert_eq!(RequestId::String("req_1".to_string()).to_string(), "req_1");
    }
}
