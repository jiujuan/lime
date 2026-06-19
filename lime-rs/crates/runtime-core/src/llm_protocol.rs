mod events;
mod mapper;
#[cfg(test)]
mod tests;
mod types;

pub use events::{runtime_event_from_llm_event, LlmRuntimeEvent};
pub use mapper::{
    build_fal_video_generation_body, build_openai_images_generation_body,
    build_provider_wire_request, build_responses_image_generation_body,
    build_responses_image_generation_wire_request, ProtocolMappingError,
};
pub use types::{
    LlmEvent, LlmInputPart, LlmMessage, LlmOutputPart, LlmRequest, LlmRole, LlmToolDefinition,
    ProviderWireRequest, ResponsesImageGenerationInputShape, ResponsesImageGenerationOptions,
};
