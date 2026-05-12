use super::{
    extract_harness_nested_object, extract_metadata_text, normalize_identifier,
    responsive_chat::{RESPONSIVE_CHAT_ROUTING_SLOT, RESPONSIVE_CHAT_SERVICE_MODEL_SLOT},
};

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
