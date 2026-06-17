mod anthropic_messages;
mod common;
mod gemini;
mod ollama_chat;
mod openai_chat;
mod openai_responses;

pub use common::ProtocolMappingError;

use super::types::{LlmRequest, ProviderWireRequest};
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
        ProtocolKind::OpenaiImages
        | ProtocolKind::Fal
        | ProtocolKind::BedrockConverse
        | ProtocolKind::Unknown => Err(ProtocolMappingError::UnsupportedProtocol(
            route.protocol.clone(),
        )),
    }
}
