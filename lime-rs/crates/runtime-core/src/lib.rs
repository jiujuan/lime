pub mod llm_protocol;
pub mod model_route;
pub mod model_routing;
pub mod model_task;

pub use llm_protocol::{
    build_fal_video_generation_body, build_openai_images_generation_body,
    build_provider_wire_request, build_responses_image_generation_body,
    build_responses_image_generation_wire_request, runtime_event_from_llm_event, LlmEvent,
    LlmInputPart, LlmMessage, LlmOutputPart, LlmRequest, LlmRole, LlmRuntimeEvent,
    LlmToolDefinition, ProtocolMappingError, ProviderWireRequest,
    ResponsesImageGenerationInputShape, ResponsesImageGenerationOptions,
};
pub use model_route::{
    resolved_route_from_task, route_evidence_payload, route_resolution_evidence_payloads,
    DirectRouteConfig, ModelRouteProvider, ModelRouteSelection, RouteResolutionEvidencePayloads,
};
pub use model_routing::{
    resolve_model_routing_for_candidate, resolve_ready_model_routing, routing_decision_payload,
    routing_fallback_applied_payload, routing_not_possible_payload,
    routing_not_possible_payload_with_attempts, selection_from_profile_model_slot,
    ModelRoutingDecision, ProfileModelSlot, ProviderReadiness, RoutingAttempt, RoutingResolution,
    RuntimeModelSelection, PROFILE_MODEL_SLOT_SOURCE,
};
pub use model_task::{
    build_model_task_request, capability_snapshot_from_model_capabilities,
    model_task_request_value, route_capability_gap, ModelTaskRequestInput,
};
