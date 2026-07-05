use super::*;
use app_server_protocol::{
    AuthMaterialRef, CapabilitySnapshot, EndpointInfo, FramingKind, ModelRef, ModelRefSource,
    ProtocolKind, ResolvedModelRoute, RouteDefaults, RoutingDecision, TransportKind,
};
use serde_json::json;

fn route(protocol: ProtocolKind) -> ResolvedModelRoute {
    ResolvedModelRoute {
        model_ref: ModelRef {
            provider_id: "provider".to_string(),
            model_id: "model-1".to_string(),
            variant: None,
            routing_slot: Some("coding".to_string()),
            source: ModelRefSource::Explicit,
        },
        protocol,
        endpoint: EndpointInfo::default(),
        auth: AuthMaterialRef::default(),
        transport: TransportKind::Http,
        framing: FramingKind::Sse,
        defaults: RouteDefaults {
            reasoning_effort: Some("high".to_string()),
            ..RouteDefaults::default()
        },
        capability_snapshot: CapabilitySnapshot::default(),
        decision: RoutingDecision {
            routing_mode: "profile_slot".to_string(),
            decision_source: "test".to_string(),
            decision_reason: "fixture".to_string(),
            ..RoutingDecision::default()
        },
        failure: None,
    }
}

fn request() -> LlmRequest {
    LlmRequest {
        instructions: Some("You are an assistant".to_string()),
        messages: vec![
            LlmMessage::text(LlmRole::User, "Explain this image"),
            LlmMessage {
                role: LlmRole::User,
                parts: vec![LlmInputPart::Image {
                    image_url: "data:image/png;base64,abc".to_string(),
                    mime_type: Some("image/png".to_string()),
                    detail: Some("high".to_string()),
                }],
            },
        ],
        tools: vec![LlmToolDefinition {
            name: "read_file".to_string(),
            description: Some("Read a file".to_string()),
            parameters: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" }
                },
                "required": ["path"]
            }),
        }],
        temperature: Some(0.2),
        max_output_tokens: Some(1024),
        stream: true,
        reasoning_effort: None,
        metadata: Default::default(),
    }
}

#[test]
fn openai_responses_mapper_uses_codex_style_input_items() {
    let wire = build_provider_wire_request(&route(ProtocolKind::OpenaiResponses), &request())
        .expect("wire request");

    assert_eq!(wire.path, "responses");
    assert_eq!(wire.body["model"], json!("model-1"));
    assert_eq!(wire.body["stream"], json!(true));
    assert_eq!(wire.body["instructions"], json!("You are an assistant"));
    assert_eq!(wire.body["reasoning"]["effort"], json!("high"));
    assert_eq!(wire.body["input"][0]["type"], json!("message"));
    assert_eq!(
        wire.body["input"][0]["content"][0]["type"],
        json!("input_text")
    );
    assert_eq!(
        wire.body["input"][1]["content"][0]["type"],
        json!("input_image")
    );
    assert_eq!(wire.body["tools"][0]["type"], json!("function"));
    assert_eq!(wire.body["tools"][0]["name"], json!("read_file"));
}

#[test]
fn openai_chat_mapper_uses_chat_completions_shape() {
    let wire =
        build_provider_wire_request(&route(ProtocolKind::OpenaiChat), &request()).expect("wire");

    assert_eq!(wire.path, "chat/completions");
    assert_eq!(wire.body["messages"][0]["role"], json!("system"));
    assert_eq!(
        wire.body["messages"][1]["content"],
        json!("Explain this image")
    );
    assert_eq!(
        wire.body["messages"][2]["content"][0]["type"],
        json!("image_url")
    );
    assert_eq!(
        wire.body["tools"][0]["function"]["name"],
        json!("read_file")
    );
}

#[test]
fn anthropic_mapper_splits_system_and_messages() {
    let wire = build_provider_wire_request(&route(ProtocolKind::AnthropicMessages), &request())
        .expect("wire");

    assert_eq!(wire.path, "messages");
    assert_eq!(wire.body["system"], json!("You are an assistant"));
    assert_eq!(wire.body["messages"][0]["role"], json!("user"));
    assert_eq!(
        wire.body["messages"][1]["content"][0]["type"],
        json!("image")
    );
    assert_eq!(
        wire.body["tools"][0]["input_schema"]["properties"]["path"]["type"],
        json!("string")
    );
}

#[test]
fn gemini_mapper_builds_generate_content_path() {
    let wire = build_provider_wire_request(&route(ProtocolKind::GeminiGenerateContent), &request())
        .expect("wire");

    assert_eq!(wire.path, "models/model-1:streamGenerateContent");
    assert_eq!(
        wire.body["system_instruction"]["parts"][0]["text"],
        json!("You are an assistant")
    );
    assert_eq!(wire.body["contents"][0]["role"], json!("user"));
    assert_eq!(
        wire.body["contents"][1]["parts"][0]["file_data"]["file_uri"],
        json!("data:image/png;base64,abc")
    );
    assert_eq!(
        wire.body["tools"][0]["function_declarations"][0]["name"],
        json!("read_file")
    );
}

#[test]
fn tool_call_history_maps_to_provider_shapes() {
    let request = LlmRequest {
        messages: vec![LlmMessage {
            role: LlmRole::Assistant,
            parts: vec![LlmInputPart::ToolCall {
                call_id: "call_1".to_string(),
                name: "read_file".to_string(),
                arguments: json!({ "path": "README.md" }),
            }],
        }],
        stream: true,
        ..request()
    };

    let responses = build_provider_wire_request(&route(ProtocolKind::OpenaiResponses), &request)
        .expect("responses wire");
    assert_eq!(responses.body["input"][0]["type"], json!("function_call"));
    assert_eq!(responses.body["input"][0]["name"], json!("read_file"));

    let chat =
        build_provider_wire_request(&route(ProtocolKind::OpenaiChat), &request).expect("chat");
    assert_eq!(
        chat.body["messages"][1]["tool_calls"][0]["function"]["name"],
        json!("read_file")
    );

    let anthropic = build_provider_wire_request(&route(ProtocolKind::AnthropicMessages), &request)
        .expect("anthropic");
    assert_eq!(
        anthropic.body["messages"][0]["content"][0]["type"],
        json!("tool_use")
    );

    let gemini = build_provider_wire_request(&route(ProtocolKind::GeminiGenerateContent), &request)
        .expect("gemini");
    assert_eq!(
        gemini.body["contents"][0]["parts"][0]["function_call"]["name"],
        json!("read_file")
    );
}

#[test]
fn ollama_mapper_rejects_non_text_parts_until_worker_support_exists() {
    let error = build_provider_wire_request(&route(ProtocolKind::OllamaChat), &request())
        .expect_err("ollama text-only boundary");

    assert_eq!(
        error,
        ProtocolMappingError::UnsupportedInputPart {
            protocol: ProtocolKind::OllamaChat,
            part_type: "image",
        }
    );
}

#[test]
fn openai_images_mapper_builds_images_generation_shape() {
    let mut metadata = std::collections::BTreeMap::new();
    metadata.insert("n".to_string(), json!(2));
    metadata.insert("size".to_string(), json!("1024x1024"));
    metadata.insert("quality".to_string(), json!("high"));
    metadata.insert("background".to_string(), json!("transparent"));
    metadata.insert("response_format".to_string(), json!("b64_json"));
    metadata.insert("trace_id".to_string(), json!("must-not-leak"));
    let request = LlmRequest {
        instructions: Some("Use a product photography style".to_string()),
        messages: vec![LlmMessage::text(
            LlmRole::User,
            "Draw a lime desktop app icon",
        )],
        metadata,
        ..LlmRequest {
            instructions: None,
            messages: Vec::new(),
            tools: Vec::new(),
            temperature: None,
            max_output_tokens: None,
            stream: false,
            reasoning_effort: None,
            metadata: Default::default(),
        }
    };

    let wire =
        build_provider_wire_request(&route(ProtocolKind::OpenaiImages), &request).expect("wire");

    assert_eq!(wire.path, "images/generations");
    assert_eq!(wire.body["model"], json!("model-1"));
    assert_eq!(
        wire.body["prompt"],
        json!("Use a product photography style\n\nDraw a lime desktop app icon")
    );
    assert_eq!(wire.body["n"], json!(2));
    assert_eq!(wire.body["size"], json!("1024x1024"));
    assert_eq!(wire.body["quality"], json!("high"));
    assert_eq!(wire.body["background"], json!("transparent"));
    assert_eq!(wire.body["response_format"], json!("b64_json"));
    assert!(wire.body.get("trace_id").is_none());
    assert!(wire.body.get("metadata").is_none());
}

#[test]
fn openai_images_mapper_keeps_reference_images_for_edit_body() {
    let mut metadata = std::collections::BTreeMap::new();
    metadata.insert(
        "reference_images".to_string(),
        json!([
            "https://cdn.example.test/ref.png",
            "",
            "data:image/png;base64,abc"
        ]),
    );
    let request = LlmRequest {
        messages: vec![LlmMessage::text(LlmRole::User, "Change the background")],
        metadata,
        ..empty_request()
    };

    let wire =
        build_provider_wire_request(&route(ProtocolKind::OpenaiImages), &request).expect("wire");

    assert_eq!(wire.path, "images/generations");
    assert_eq!(
        wire.body["images"],
        json!([
            { "image_url": "https://cdn.example.test/ref.png" },
            { "image_url": "data:image/png;base64,abc" }
        ])
    );
}

#[test]
fn openai_images_mapper_rejects_non_text_prompt_parts() {
    let request = LlmRequest {
        messages: vec![LlmMessage {
            role: LlmRole::User,
            parts: vec![LlmInputPart::Image {
                image_url: "data:image/png;base64,abc".to_string(),
                mime_type: Some("image/png".to_string()),
                detail: Some("high".to_string()),
            }],
        }],
        ..LlmRequest {
            instructions: None,
            messages: Vec::new(),
            tools: Vec::new(),
            temperature: None,
            max_output_tokens: None,
            stream: false,
            reasoning_effort: None,
            metadata: Default::default(),
        }
    };

    let error = build_provider_wire_request(&route(ProtocolKind::OpenaiImages), &request)
        .expect_err("image generation prompt is text-only");

    assert_eq!(
        error,
        ProtocolMappingError::UnsupportedInputPart {
            protocol: ProtocolKind::OpenaiImages,
            part_type: "image",
        }
    );
}

#[test]
fn responses_image_generation_mapper_builds_tool_request_shape() {
    let mut route = route(ProtocolKind::OpenaiResponses);
    route.model_ref.model_id = "gpt-images-2".to_string();
    let request = LlmRequest {
        instructions: Some("Use a clean product render style".to_string()),
        messages: vec![LlmMessage::text(
            LlmRole::User,
            "Generate an app launcher image",
        )],
        ..empty_request()
    };

    let wire = build_responses_image_generation_wire_request(
        &route,
        &request,
        &ResponsesImageGenerationOptions {
            outer_model: Some(" gpt-5.5 ".to_string()),
            input_shape: ResponsesImageGenerationInputShape::PromptString,
            reference_image_urls: Vec::new(),
        },
    )
    .expect("responses image generation wire");

    assert_eq!(wire.path, "responses");
    assert_eq!(wire.body["model"], json!("gpt-5.5"));
    assert_eq!(
        wire.body["input"],
        json!("Use a clean product render style\n\nGenerate an app launcher image")
    );
    assert_eq!(wire.body["tools"][0]["type"], json!("image_generation"));
    assert_eq!(wire.body["tools"][0]["model"], json!("gpt-image-2"));
    assert_eq!(wire.body["stream"], json!(true));
}

#[test]
fn responses_image_generation_mapper_can_build_input_list_retry_shape() {
    let request = LlmRequest {
        messages: vec![LlmMessage::text(LlmRole::User, "Generate one image")],
        ..empty_request()
    };

    let wire = build_responses_image_generation_wire_request(
        &route(ProtocolKind::OpenaiResponses),
        &request,
        &ResponsesImageGenerationOptions {
            outer_model: None,
            input_shape: ResponsesImageGenerationInputShape::InputList,
            reference_image_urls: Vec::new(),
        },
    )
    .expect("responses image generation wire");

    assert_eq!(wire.body["model"], json!("gpt-5.5"));
    assert_eq!(
        wire.body["input"][0]["content"][0]["type"],
        json!("input_text")
    );
    assert_eq!(
        wire.body["input"][0]["content"][0]["text"],
        json!("Generate one image")
    );
}

#[test]
fn responses_image_generation_mapper_keeps_reference_images_in_input_list() {
    let request = LlmRequest {
        messages: vec![LlmMessage::text(LlmRole::User, "Edit this image")],
        ..empty_request()
    };

    let wire = build_responses_image_generation_wire_request(
        &route(ProtocolKind::OpenaiResponses),
        &request,
        &ResponsesImageGenerationOptions {
            outer_model: None,
            input_shape: ResponsesImageGenerationInputShape::PromptString,
            reference_image_urls: vec![
                "https://cdn.example.test/ref.png".to_string(),
                "data:image/png;base64,abc".to_string(),
            ],
        },
    )
    .expect("responses image generation wire");

    assert_eq!(
        wire.body["input"][0]["content"][0]["type"],
        json!("input_text")
    );
    assert_eq!(
        wire.body["input"][0]["content"][1]["type"],
        json!("input_image")
    );
    assert_eq!(
        wire.body["input"][0]["content"][1]["image_url"],
        json!("https://cdn.example.test/ref.png")
    );
    assert_eq!(
        wire.body["input"][0]["content"][2]["image_url"],
        json!("data:image/png;base64,abc")
    );
}

#[test]
fn responses_image_generation_mapper_rejects_non_responses_protocol() {
    let error = build_responses_image_generation_wire_request(
        &route(ProtocolKind::OpenaiImages),
        &LlmRequest {
            messages: vec![LlmMessage::text(LlmRole::User, "Generate one image")],
            ..empty_request()
        },
        &ResponsesImageGenerationOptions::default(),
    )
    .expect_err("responses image generation requires responses protocol");

    assert_eq!(
        error,
        ProtocolMappingError::UnsupportedProtocol(ProtocolKind::OpenaiImages)
    );
}

#[test]
fn fal_video_generation_mapper_builds_local_broker_shape() {
    let mut metadata = std::collections::BTreeMap::new();
    metadata.insert("provider_id".to_string(), json!("fal"));
    metadata.insert("aspect_ratio".to_string(), json!("16:9"));
    metadata.insert("resolution".to_string(), json!("1080p"));
    metadata.insert("duration".to_string(), json!(8));
    metadata.insert(
        "image_url".to_string(),
        json!("https://example.test/start.png"),
    );
    metadata.insert(
        "end_image_url".to_string(),
        json!("https://example.test/end.png"),
    );
    metadata.insert("seed".to_string(), json!(42));
    metadata.insert("generate_audio".to_string(), json!(true));
    metadata.insert("camera_fixed".to_string(), json!(false));
    metadata.insert("user".to_string(), json!("task-1"));
    metadata.insert("trace_id".to_string(), json!("must-not-leak"));
    let request = LlmRequest {
        messages: vec![LlmMessage::text(LlmRole::User, "生成一段青柠实验室短视频")],
        metadata,
        ..empty_request()
    };

    let body =
        build_fal_video_generation_body("fal-ai/video-model", &request).expect("fal video body");

    assert_eq!(body["prompt"], json!("生成一段青柠实验室短视频"));
    assert_eq!(body["provider_id"], json!("fal"));
    assert_eq!(body["model"], json!("fal-ai/video-model"));
    assert_eq!(body["aspect_ratio"], json!("16:9"));
    assert_eq!(body["resolution"], json!("1080p"));
    assert_eq!(body["duration"], json!(8));
    assert_eq!(body["image_url"], json!("https://example.test/start.png"));
    assert_eq!(body["end_image_url"], json!("https://example.test/end.png"));
    assert_eq!(body["seed"], json!(42));
    assert_eq!(body["generate_audio"], json!(true));
    assert_eq!(body["camera_fixed"], json!(false));
    assert_eq!(body["user"], json!("task-1"));
    assert!(body.get("trace_id").is_none());
}

#[test]
fn fal_video_generation_mapper_rejects_non_text_prompt_parts() {
    let request = LlmRequest {
        messages: vec![LlmMessage {
            role: LlmRole::User,
            parts: vec![LlmInputPart::Image {
                image_url: "data:image/png;base64,abc".to_string(),
                mime_type: Some("image/png".to_string()),
                detail: Some("high".to_string()),
            }],
        }],
        ..empty_request()
    };

    let error = build_fal_video_generation_body("fal-ai/video-model", &request)
        .expect_err("video generation prompt is text-only");

    assert_eq!(
        error,
        ProtocolMappingError::UnsupportedInputPart {
            protocol: ProtocolKind::Fal,
            part_type: "image",
        }
    );
}

#[test]
fn mapper_rejects_unsupported_media_protocols_for_canonical_request() {
    let error = build_provider_wire_request(&route(ProtocolKind::Fal), &request())
        .expect_err("fal protocol is not mapped yet");

    assert_eq!(
        error,
        ProtocolMappingError::UnsupportedProtocol(ProtocolKind::Fal)
    );
}

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
fn llm_image_and_audio_outputs_stay_generic_until_projection_exists() {
    for part in [
        LlmOutputPart::Image {
            image_url: "https://example.test/image.png".to_string(),
            mime_type: Some("image/png".to_string()),
        },
        LlmOutputPart::Audio {
            audio_url: "https://example.test/audio.mp3".to_string(),
            mime_type: Some("audio/mpeg".to_string()),
        },
    ] {
        let runtime_event = runtime_event_from_llm_event(&LlmEvent::OutputDelta { part });

        assert_eq!(runtime_event.event_type, "runtime.event");
        assert_eq!(
            runtime_event.payload["kind"].as_str(),
            Some("llm_output_part")
        );
    }
}

fn empty_request() -> LlmRequest {
    LlmRequest {
        instructions: None,
        messages: Vec::new(),
        tools: Vec::new(),
        temperature: None,
        max_output_tokens: None,
        stream: false,
        reasoning_effort: None,
        metadata: Default::default(),
    }
}
