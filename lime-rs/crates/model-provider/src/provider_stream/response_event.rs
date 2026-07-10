use serde_json::Value;

#[derive(Clone, Debug, PartialEq)]
pub struct RuntimeReplyResponseItem {
    pub item_id: String,
    pub item_kind: String,
    pub payload: RuntimeReplyResponseItemPayload,
}

impl RuntimeReplyResponseItem {
    pub fn new(
        item_id: impl Into<String>,
        item_kind: impl Into<String>,
        payload: RuntimeReplyResponseItemPayload,
    ) -> Self {
        Self {
            item_id: item_id.into(),
            item_kind: item_kind.into(),
            payload,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum RuntimeReplyResponseItemPayload {
    AgentMessage {
        text: String,
        phase: Option<String>,
    },
    Reasoning {
        text: String,
        summary: Option<Vec<String>>,
        metadata: Option<Value>,
    },
    ToolCall {
        tool_name: String,
        arguments: Option<Value>,
        output: Option<String>,
        success: Option<bool>,
        error: Option<String>,
        metadata: Option<Value>,
    },
    Unknown {
        metadata: Option<Value>,
    },
}

#[derive(Clone, Debug, PartialEq)]
pub enum RuntimeReplyResponseEvent {
    OutputItemAdded {
        item: RuntimeReplyResponseItem,
    },
    OutputItemDone {
        item: RuntimeReplyResponseItem,
    },
    TextDelta {
        text: String,
    },
    ToolCallInputDelta {
        call_id: String,
        tool_name: Option<String>,
        delta: String,
        accumulated_arguments: Option<String>,
        provider: Option<String>,
    },
    ReasoningDelta {
        item_id: String,
        delta: String,
    },
    Completed {
        response_id: Option<String>,
        end_turn: Option<bool>,
        token_usage: Option<Value>,
    },
    RateLimits {
        payload: Value,
    },
}
