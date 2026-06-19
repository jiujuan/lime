mod anthropic_messages;
mod common;
mod fal_video_generation;
mod gemini;
mod ollama_chat;
mod openai_chat;
mod openai_images;
mod openai_responses;
mod openai_responses_image_generation;

pub use common::ProtocolMappingError;

use super::types::{LlmRequest, ProviderWireRequest, ResponsesImageGenerationOptions};
use app_server_protocol::{ProtocolKind, ResolvedModelRoute};

pub fn build_provider_wire_request(
    route: &ResolvedModelRoute,
    request: &LlmRequest,
) -> Result<ProviderWireRequest, ProtocolMappingError> {
    match route.protocol {
        ProtocolKind::OpenaiResponses | ProtocolKind::CodexResponses => {
            openai_responses::build(route, request)
        }
        ProtocolKind::OpenaiChat => openai_chat::build(route, request),
        ProtocolKind::AnthropicMessages => anthropic_messages::build(route, request),
        ProtocolKind::GeminiGenerateContent | ProtocolKind::VertexGemini => {
            gemini::build(route, request)
        }
        ProtocolKind::OllamaChat => ollama_chat::build(route, request),
        ProtocolKind::OpenaiImages => openai_images::build(route, request),
        ProtocolKind::Fal | ProtocolKind::BedrockConverse | ProtocolKind::Unknown => Err(
            ProtocolMappingError::UnsupportedProtocol(route.protocol.clone()),
        ),
    }
}

pub fn build_responses_image_generation_wire_request(
    route: &ResolvedModelRoute,
    request: &LlmRequest,
    options: &ResponsesImageGenerationOptions,
) -> Result<ProviderWireRequest, ProtocolMappingError> {
    openai_responses_image_generation::build(route, request, options)
}

pub fn build_openai_images_generation_body(
    model_id: &str,
    request: &LlmRequest,
) -> Result<serde_json::Value, ProtocolMappingError> {
    openai_images::body_for_model(model_id, request)
}

pub fn build_fal_video_generation_body(
    model_id: &str,
    request: &LlmRequest,
) -> Result<serde_json::Value, ProtocolMappingError> {
    fal_video_generation::body_for_model(model_id, request)
}

pub fn build_responses_image_generation_body(
    model_id: &str,
    request: &LlmRequest,
    options: &ResponsesImageGenerationOptions,
) -> Result<serde_json::Value, ProtocolMappingError> {
    openai_responses_image_generation::body_for_model(model_id, request, options)
}
