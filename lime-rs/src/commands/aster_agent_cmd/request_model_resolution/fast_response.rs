use super::{
    extract_harness_nested_object, extract_metadata_text, normalize_identifier,
    responsive_chat::{RESPONSIVE_CHAT_ROUTING_SLOT, RESPONSIVE_CHAT_SERVICE_MODEL_SLOT},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct FastResponseFallbackPreference {
    pub(super) provider_selector: String,
    pub(super) model_name: String,
}

pub(super) fn extract_fast_response_routing(
    request_metadata: Option<&serde_json::Value>,
) -> Option<&serde_json::Map<String, serde_json::Value>> {
    extract_harness_nested_object(
        request_metadata,
        &["fast_response_routing", "fastResponseRouting"],
    )
}

pub(super) fn extract_fast_response_service_model_slot(
    request_metadata: Option<&serde_json::Value>,
) -> Option<String> {
    let routing = extract_fast_response_routing(request_metadata)?;
    extract_metadata_text(routing, &["service_model_slot", "serviceModelSlot"])
        .filter(|slot| normalize_identifier(slot) == RESPONSIVE_CHAT_SERVICE_MODEL_SLOT)
        .or_else(|| Some(RESPONSIVE_CHAT_SERVICE_MODEL_SLOT.to_string()))
}

pub(super) fn extract_fast_response_routing_slot(
    request_metadata: Option<&serde_json::Value>,
) -> Option<String> {
    let routing = extract_fast_response_routing(request_metadata)?;
    extract_metadata_text(routing, &["routing_slot", "routingSlot"])
        .filter(|slot| normalize_identifier(slot) == RESPONSIVE_CHAT_ROUTING_SLOT)
        .or_else(|| Some(RESPONSIVE_CHAT_ROUTING_SLOT.to_string()))
}

pub(super) fn extract_fast_response_fallback_preference(
    request_metadata: Option<&serde_json::Value>,
) -> Option<FastResponseFallbackPreference> {
    let routing = extract_fast_response_routing(request_metadata)?;
    let provider_selector = extract_metadata_text(
        routing,
        &[
            "fallback_provider_preference",
            "fallbackProviderPreference",
            "fallback_provider",
            "fallbackProvider",
            "provider_preference",
            "providerPreference",
            "provider",
        ],
    )?;
    let model_name = extract_metadata_text(
        routing,
        &[
            "fallback_model_preference",
            "fallbackModelPreference",
            "fallback_model",
            "fallbackModel",
            "model_preference",
            "modelPreference",
            "model",
        ],
    )?;

    Some(FastResponseFallbackPreference {
        provider_selector,
        model_name,
    })
}
