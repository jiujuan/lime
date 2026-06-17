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
        provider: None,
        model: None,
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
fn mapper_rejects_media_only_protocols_for_canonical_llm_request() {
    let error = build_provider_wire_request(&route(ProtocolKind::OpenaiImages), &request())
        .expect_err("image protocol is not llm mapper");

    assert_eq!(
        error,
        ProtocolMappingError::UnsupportedProtocol(ProtocolKind::OpenaiImages)
    );
}
