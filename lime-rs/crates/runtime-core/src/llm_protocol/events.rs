use super::types::{LlmEvent, LlmOutputPart, LlmRole};
use serde_json::{json, Value};

#[derive(Debug, Clone, PartialEq)]
pub struct LlmRuntimeEvent {
    pub event_type: &'static str,
    pub payload: Value,
}

pub fn runtime_event_from_llm_event(event: &LlmEvent) -> LlmRuntimeEvent {
    match event {
        LlmEvent::MessageStart { role } => LlmRuntimeEvent {
            event_type: "message.created",
            payload: json!({
                "role": role_name(*role),
                "backend": "llm_protocol",
                "runtimeEvent": event,
            }),
        },
        LlmEvent::OutputDelta { part } => output_part_runtime_event(part, event),
        LlmEvent::ToolCallDelta {
            call_id,
            name,
            arguments_delta,
        } => LlmRuntimeEvent {
            event_type: "tool.args.delta",
            payload: json!({
                "toolCallId": call_id,
                "toolName": name,
                "delta": arguments_delta,
                "rawArgs": arguments_delta,
                "source": "llm_protocol",
                "backend": "llm_protocol",
                "runtimeEvent": event,
            }),
        },
        LlmEvent::Usage {
            input_tokens,
            output_tokens,
        } => LlmRuntimeEvent {
            event_type: "cost.recorded",
            payload: json!({
                "inputTokens": input_tokens,
                "outputTokens": output_tokens,
                "totalTokens": input_tokens.saturating_add(*output_tokens),
                "source": "llm_protocol_usage",
                "backend": "llm_protocol",
                "runtimeEvent": event,
            }),
        },
        LlmEvent::Completed => LlmRuntimeEvent {
            event_type: "turn.completed",
            payload: json!({
                "backend": "llm_protocol",
                "runtimeEvent": event,
            }),
        },
        LlmEvent::Failed {
            code,
            message,
            retryable,
        } => LlmRuntimeEvent {
            event_type: "turn.failed",
            payload: json!({
                "code": code,
                "message": message,
                "retryable": retryable,
                "backend": "llm_protocol",
                "runtimeEvent": event,
            }),
        },
    }
}

fn output_part_runtime_event(part: &LlmOutputPart, event: &LlmEvent) -> LlmRuntimeEvent {
    match part {
        LlmOutputPart::Text { text } => LlmRuntimeEvent {
            event_type: "message.delta",
            payload: json!({
                "text": text,
                "backend": "llm_protocol",
                "runtimeEvent": event,
            }),
        },
        LlmOutputPart::Reasoning { text } => LlmRuntimeEvent {
            event_type: "thinking.delta",
            payload: json!({
                "text": text,
                "backend": "llm_protocol",
                "runtimeEvent": event,
            }),
        },
        LlmOutputPart::ToolCall {
            call_id,
            name,
            arguments,
        } => LlmRuntimeEvent {
            event_type: "tool.started",
            payload: json!({
                "toolCallId": call_id,
                "toolName": name,
                "arguments": arguments,
                "source": "llm_protocol_tool_call",
                "backend": "llm_protocol",
                "runtimeEvent": event,
            }),
        },
        LlmOutputPart::Image { .. } | LlmOutputPart::Audio { .. } => LlmRuntimeEvent {
            event_type: "runtime.event",
            payload: json!({
                "kind": "llm_output_part",
                "part": part,
                "backend": "llm_protocol",
                "runtimeEvent": event,
            }),
        },
    }
}

fn role_name(role: LlmRole) -> &'static str {
    match role {
        LlmRole::System => "system",
        LlmRole::Developer => "developer",
        LlmRole::User => "user",
        LlmRole::Assistant => "assistant",
        LlmRole::Tool => "tool",
    }
}
