#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeSessionInterAgentDeliveryMode {
    QueueOnly,
    TriggerTurn,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeSessionInterAgentMessageKind {
    Message,
    Result,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeSessionInterAgentResultStatus {
    Completed,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuntimeSessionInterAgentInput {
    pub message_id: String,
    pub root_thread_id: String,
    pub sender_thread_id: String,
    pub recipient_thread_id: String,
    pub content: String,
    pub kind: RuntimeSessionInterAgentMessageKind,
    pub source_turn_id: Option<String>,
    pub result_status: Option<RuntimeSessionInterAgentResultStatus>,
    pub delivery_mode: RuntimeSessionInterAgentDeliveryMode,
}
