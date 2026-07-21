use agent_runtime::session_loop::{
    RuntimeSessionInterAgentDeliveryMode, RuntimeSessionInterAgentInput,
    RuntimeSessionInterAgentMessageKind, RuntimeSessionInterAgentResultStatus,
};
use thread_store::{
    AgentMailboxDeliveryMode, AgentMailboxMessage, AgentMailboxMessageKind,
    AgentMailboxResultStatus,
};

pub(super) fn from_mailbox_message(message: &AgentMailboxMessage) -> RuntimeSessionInterAgentInput {
    RuntimeSessionInterAgentInput {
        message_id: message.message_id.clone(),
        root_thread_id: message.root_thread_id.to_string(),
        sender_thread_id: message.sender_thread_id.to_string(),
        recipient_thread_id: message.recipient_thread_id.to_string(),
        content: message.content.clone(),
        kind: match message.kind {
            AgentMailboxMessageKind::Message => RuntimeSessionInterAgentMessageKind::Message,
            AgentMailboxMessageKind::Result => RuntimeSessionInterAgentMessageKind::Result,
        },
        source_turn_id: message.source_turn_id.as_ref().map(ToString::to_string),
        result_status: message.result_status.map(|status| match status {
            AgentMailboxResultStatus::Completed => RuntimeSessionInterAgentResultStatus::Completed,
            AgentMailboxResultStatus::Failed => RuntimeSessionInterAgentResultStatus::Failed,
        }),
        delivery_mode: match message.delivery_mode {
            AgentMailboxDeliveryMode::QueueOnly => RuntimeSessionInterAgentDeliveryMode::QueueOnly,
            AgentMailboxDeliveryMode::TriggerTurn => {
                RuntimeSessionInterAgentDeliveryMode::TriggerTurn
            }
        },
    }
}
