use super::*;
use serde_json::json;

#[test]
fn llm_events_map_to_current_runtime_event_names() {
    let cases = vec![
        (
            LlmEvent::MessageStart {
                role: LlmRole::Assistant,
            },
            "message.created",
            json!({ "role": "assistant" }),
        ),
        (
            LlmEvent::OutputDelta {
                part: LlmOutputPart::Text {
                    text: "hello".to_string(),
                },
            },
            "message.delta",
            json!({ "text": "hello" }),
        ),
        (
            LlmEvent::OutputDelta {
                part: LlmOutputPart::Reasoning {
                    text: "thinking".to_string(),
                },
            },
            "thinking.delta",
            json!({ "text": "thinking" }),
        ),
        (
            LlmEvent::Completed,
            "turn.completed",
            json!({ "backend": "llm_protocol" }),
        ),
    ];

    for (event, event_type, expected_fields) in cases {
        let runtime_event = runtime_event_from_llm_event(&event);
        assert_eq!(runtime_event.event_type, event_type);
        for (key, value) in expected_fields.as_object().expect("object") {
            assert_eq!(runtime_event.payload.get(key), Some(value));
        }
        assert_eq!(
            runtime_event.payload["runtimeEvent"]["type"],
            serde_json::to_value(&event).expect("event value")["type"]
        );
    }
}

#[test]
fn llm_tool_call_delta_maps_to_tool_args_delta_without_closing_tool() {
    let runtime_event = runtime_event_from_llm_event(&LlmEvent::ToolCallDelta {
        call_id: "call_1".to_string(),
        name: "read_file".to_string(),
        arguments_delta: "{\"path\"".to_string(),
    });

    assert_eq!(runtime_event.event_type, "tool.args.delta");
    assert_eq!(runtime_event.payload["toolCallId"].as_str(), Some("call_1"));
    assert_eq!(
        runtime_event.payload["toolName"].as_str(),
        Some("read_file")
    );
    assert_eq!(runtime_event.payload["delta"].as_str(), Some("{\"path\""));
    assert_eq!(
        runtime_event.payload["source"].as_str(),
        Some("llm_protocol")
    );
}

#[test]
fn llm_usage_maps_to_cost_recorded_event() {
    let runtime_event = runtime_event_from_llm_event(&LlmEvent::Usage {
        input_tokens: 12,
        output_tokens: 34,
    });

    assert_eq!(runtime_event.event_type, "cost.recorded");
    assert_eq!(runtime_event.payload["inputTokens"], json!(12));
    assert_eq!(runtime_event.payload["outputTokens"], json!(34));
    assert_eq!(runtime_event.payload["totalTokens"], json!(46));
    assert_eq!(
        runtime_event.payload["source"].as_str(),
        Some("llm_protocol_usage")
    );
}

#[test]
fn llm_failed_maps_to_current_turn_failed_event() {
    let runtime_event = runtime_event_from_llm_event(&LlmEvent::Failed {
        code: "rate_limited".to_string(),
        message: "try later".to_string(),
        retryable: true,
    });

    assert_eq!(runtime_event.event_type, "turn.failed");
    assert_eq!(runtime_event.payload["code"].as_str(), Some("rate_limited"));
    assert_eq!(runtime_event.payload["message"].as_str(), Some("try later"));
    assert_eq!(runtime_event.payload["retryable"], json!(true));
}

#[test]
fn llm_image_and_audio_outputs_map_to_runtime_content_message_delta() {
    let cases = [
        (
            LlmOutputPart::Image {
                image_url: "https://example.test/image.png".to_string(),
                mime_type: Some("image/png".to_string()),
            },
            "image",
            "https://example.test/image.png",
            "image/png",
        ),
        (
            LlmOutputPart::Audio {
                audio_url: "https://example.test/audio.mp3".to_string(),
                mime_type: Some("audio/mpeg".to_string()),
            },
            "audio",
            "https://example.test/audio.mp3",
            "audio/mpeg",
        ),
    ];

    for (part, kind, uri, mime_type) in cases {
        let runtime_event = runtime_event_from_llm_event(&LlmEvent::OutputDelta { part });

        assert_eq!(runtime_event.event_type, "message.delta");
        assert_eq!(
            runtime_event.payload["source"].as_str(),
            Some("llm_protocol_media_output")
        );
        assert_eq!(
            runtime_event.payload["backend"].as_str(),
            Some("llm_protocol")
        );

        let content_part = &runtime_event.payload["contentPart"];
        assert_eq!(content_part["type"], json!("media"));
        assert_eq!(content_part["kind"], json!(kind));
        assert_eq!(content_part["reference"]["uri"], json!(uri));
        assert_eq!(content_part["reference"]["mime_type"], json!(mime_type));

        let content_parts = runtime_event.payload["contentParts"]
            .as_array()
            .expect("content parts");
        assert_eq!(content_parts.len(), 1);
        assert_eq!(&content_parts[0], content_part);
        assert_eq!(
            runtime_event.payload["runtimeEvent"]["type"].as_str(),
            Some("output_delta")
        );
    }
}

#[test]
fn llm_media_outputs_stay_generic_without_reference_safe_mime() {
    for part in [
        LlmOutputPart::Image {
            image_url: "data:image/png;base64,abc".to_string(),
            mime_type: Some("image/png".to_string()),
        },
        LlmOutputPart::Image {
            image_url: "https://example.test/image.png".to_string(),
            mime_type: Some("text/plain".to_string()),
        },
        LlmOutputPart::Audio {
            audio_url: "https://example.test/audio.mp3".to_string(),
            mime_type: None,
        },
    ] {
        let runtime_event = runtime_event_from_llm_event(&LlmEvent::OutputDelta { part });

        assert_eq!(runtime_event.event_type, "runtime.event");
        assert_eq!(
            runtime_event.payload["kind"].as_str(),
            Some("llm_output_part")
        );
        assert!(runtime_event.payload.get("contentPart").is_none());
        assert!(runtime_event.payload.get("contentParts").is_none());
    }
}
