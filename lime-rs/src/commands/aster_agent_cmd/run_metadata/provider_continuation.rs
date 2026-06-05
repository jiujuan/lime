use super::*;

fn extract_provider_continuation_value(
    metadata: &HashMap<String, serde_json::Value>,
    keys: &[&str],
) -> Option<String> {
    for key in keys {
        let value = metadata.get(*key).and_then(serde_json::Value::as_str);
        let Some(value) = normalize_optional_text(value.map(str::to_string)) else {
            continue;
        };
        return Some(value);
    }
    None
}

pub(super) fn extract_provider_continuation_from_metadata(
    metadata: &HashMap<String, serde_json::Value>,
    capability: ProviderContinuationCapability,
) -> Option<ProviderContinuationState> {
    match capability {
        ProviderContinuationCapability::HistoryReplayOnly => None,
        ProviderContinuationCapability::PreviousResponseId => extract_provider_continuation_value(
            metadata,
            &["previous_response_id", "previousResponseId"],
        )
        .map(ProviderContinuationState::previous_response_id),
        ProviderContinuationCapability::ProviderSessionToken => {
            extract_provider_continuation_value(
                metadata,
                &[
                    "provider_session_token",
                    "providerSessionToken",
                    "session_token",
                    "sessionToken",
                    "conversation_id",
                    "conversationId",
                ],
            )
            .map(ProviderContinuationState::provider_session_token)
        }
        ProviderContinuationCapability::StickyRoutingHint => {
            extract_provider_continuation_value(metadata, &["routing_hint", "routingHint"])
                .map(ProviderContinuationState::sticky_routing_hint)
        }
    }
}

pub(super) fn extract_provider_continuation_from_message(
    message: &AgentMessage,
    capability: ProviderContinuationCapability,
) -> Option<ProviderContinuationState> {
    for content in &message.content {
        if let AgentMessageContent::ToolResponse {
            metadata: Some(metadata),
            ..
        } = content
        {
            if let Some(provider_continuation) =
                extract_provider_continuation_from_metadata(metadata, capability)
            {
                return Some(provider_continuation);
            }
        }
    }

    if message.role == "assistant" {
        if capability == ProviderContinuationCapability::PreviousResponseId {
            return message
                .id
                .clone()
                .map(ProviderContinuationState::previous_response_id);
        }

        if capability == ProviderContinuationCapability::ProviderSessionToken {
            return message
                .id
                .clone()
                .map(ProviderContinuationState::provider_session_token);
        }
    }

    None
}
