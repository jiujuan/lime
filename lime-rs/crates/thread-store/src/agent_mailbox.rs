use std::future::Future;
use std::pin::Pin;

use agent_protocol::{ThreadId, TurnId};
use serde::{Deserialize, Serialize};

use crate::ThreadStoreResult;

/// Delivery behavior selected by the caller that appended a mailbox message.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentMailboxDeliveryMode {
    QueueOnly,
    TriggerTurn,
}

/// Durable delivery status. Delivered messages remain available for audit.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentMailboxDeliveryStatus {
    Pending,
    Delivered,
}

/// Semantic role of a durable mailbox record.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentMailboxMessageKind {
    Message,
    Result,
}

/// Terminal child outcome carried by a result record.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentMailboxResultStatus {
    Completed,
    Failed,
}

/// A root-tree-scoped message sent between canonical agent threads.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentMailboxMessage {
    pub message_id: String,
    pub root_thread_id: ThreadId,
    pub sender_thread_id: ThreadId,
    pub recipient_thread_id: ThreadId,
    pub content: String,
    pub kind: AgentMailboxMessageKind,
    pub source_turn_id: Option<TurnId>,
    pub result_status: Option<AgentMailboxResultStatus>,
    pub delivery_mode: AgentMailboxDeliveryMode,
    pub delivery_status: AgentMailboxDeliveryStatus,
    pub created_at_ms: i64,
    pub delivered_at_ms: Option<i64>,
}

/// Input for the append-only mailbox boundary.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AppendAgentMailboxMessageParams {
    pub message: AgentMailboxMessage,
}

/// Root/recipient pair with at least one durable TriggerTurn awaiting delivery.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PendingAgentMailboxTriggerRecipient {
    pub root_thread_id: ThreadId,
    pub recipient_thread_id: ThreadId,
}

/// Future returned by [`AgentMailboxStore`] operations.
pub type AgentMailboxStoreFuture<'a, T> =
    Pin<Box<dyn Future<Output = ThreadStoreResult<T>> + Send + 'a>>;

/// Storage-neutral owner for durable inter-agent mailbox records.
///
/// Appending the same message id with the same immutable record is idempotent. Reusing an id with
/// any different immutable field must fail. Pending delivery is isolated by root and recipient,
/// ordered by `(created_at_ms, message_id)`, and delivery preserves the audit record.
pub trait AgentMailboxStore: Send + Sync {
    fn append_agent_mailbox_message(
        &self,
        params: AppendAgentMailboxMessageParams,
    ) -> AgentMailboxStoreFuture<'_, AgentMailboxMessage>;

    fn list_pending_agent_mailbox_messages(
        &self,
        root_thread_id: ThreadId,
        recipient_thread_id: ThreadId,
    ) -> AgentMailboxStoreFuture<'_, Vec<AgentMailboxMessage>>;

    /// Lists distinct recipients whose durable TriggerTurn work must resume after restart.
    fn list_pending_agent_mailbox_trigger_recipients(
        &self,
    ) -> AgentMailboxStoreFuture<'_, Vec<PendingAgentMailboxTriggerRecipient>>;

    /// Atomically transitions a pending message to delivered. Returns the transitioned record;
    /// missing or already-delivered messages return `None` so concurrent consumers cannot both
    /// report the same activity.
    fn mark_agent_mailbox_message_delivered(
        &self,
        root_thread_id: ThreadId,
        recipient_thread_id: ThreadId,
        message_id: String,
        delivered_at_ms: i64,
    ) -> AgentMailboxStoreFuture<'_, Option<AgentMailboxMessage>>;

    /// Deletes never-delivered child records during spawn compensation.
    fn delete_agent_mailbox_messages(
        &self,
        root_thread_id: ThreadId,
        recipient_thread_id: ThreadId,
    ) -> AgentMailboxStoreFuture<'_, ()>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mailbox_enums_serialize_as_snake_case() {
        assert_eq!(
            serde_json::to_string(&AgentMailboxDeliveryMode::QueueOnly).expect("serialize"),
            "\"queue_only\""
        );
        assert_eq!(
            serde_json::to_string(&AgentMailboxDeliveryStatus::Delivered).expect("serialize"),
            "\"delivered\""
        );
        assert_eq!(
            serde_json::to_string(&AgentMailboxMessageKind::Result).expect("serialize"),
            "\"result\""
        );
        assert_eq!(
            serde_json::to_string(&AgentMailboxResultStatus::Failed).expect("serialize"),
            "\"failed\""
        );
    }

    #[allow(dead_code)]
    fn assert_agent_mailbox_store_object_safe(store: &dyn AgentMailboxStore) {
        let _ = store;
    }
}
