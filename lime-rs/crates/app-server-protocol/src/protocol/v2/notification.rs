use crate::RequestId;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Emitted after a server-initiated request reaches a terminal state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ServerRequestResolvedNotification {
    pub thread_id: String,
    pub request_id: RequestId,
}
