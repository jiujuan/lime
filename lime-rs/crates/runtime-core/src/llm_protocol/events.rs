use super::types::{LlmEvent, LlmOutputPart, LlmRole};
use crate::runtime_content::{
    runtime_media_part_from_reference, RuntimeContentPart, RuntimeMediaPartInput,
    RuntimeMessageDeltaContent,
};
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
        LlmOutputPart::Text { text } => message_delta_runtime_event(
            RuntimeMessageDeltaContent::text(text.to_owned()),
            None,
            event,
        ),
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
        LlmOutputPart::Image { .. } | LlmOutputPart::Audio { .. } => {
            if let Some(content_part) = llm_media_output_content_part(part) {
                return message_delta_runtime_event(
                    RuntimeMessageDeltaContent::content_part(content_part),
                    Some("llm_protocol_media_output"),
                    event,
                );
            }
            generic_output_part_runtime_event(part, event)
        }
    }
}

fn llm_media_output_content_part(part: &LlmOutputPart) -> Option<RuntimeContentPart> {
    let (uri, mime_type) = match part {
        LlmOutputPart::Image {
            image_url,
            mime_type,
        } => (image_url, mime_type.as_deref()?),
        LlmOutputPart::Audio {
            audio_url,
            mime_type,
        } => (audio_url, mime_type.as_deref()?),
        _ => return None,
    };

    runtime_media_part_from_reference(RuntimeMediaPartInput {
        uri: uri.to_owned(),
        mime_type: mime_type.to_owned(),
        title: None,
        caption: None,
        source_uri: None,
        source_path: None,
        preview_url: None,
        sidecar_ref: None,
        sha256: None,
        byte_size: None,
    })
    .ok()
}

fn message_delta_runtime_event(
    content: RuntimeMessageDeltaContent,
    source: Option<&'static str>,
    event: &LlmEvent,
) -> LlmRuntimeEvent {
    let mut payload =
        serde_json::to_value(content).expect("runtime message delta content serializes");
    let payload_object = payload
        .as_object_mut()
        .expect("runtime message delta content serializes to object");
    if let Some(source) = source {
        payload_object.insert("source".to_string(), json!(source));
    }
    payload_object.insert("backend".to_string(), json!("llm_protocol"));
    payload_object.insert(
        "runtimeEvent".to_string(),
        serde_json::to_value(event).expect("llm event serializes"),
    );

    LlmRuntimeEvent {
        event_type: "message.delta",
        payload,
    }
}

fn generic_output_part_runtime_event(part: &LlmOutputPart, event: &LlmEvent) -> LlmRuntimeEvent {
    LlmRuntimeEvent {
        event_type: "runtime.event",
        payload: json!({
            "kind": "llm_output_part",
            "part": part,
            "backend": "llm_protocol",
            "runtimeEvent": event,
        }),
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
