use model_provider::runtime_provider::RuntimeProviderProtocol;
use model_provider::ModelProviderProtocol;
use serde::{Deserialize, Serialize};

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    let text = value?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderContinuationCapability {
    HistoryReplayOnly,
    ProviderSessionToken,
    PreviousResponseId,
    StickyRoutingHint,
}

impl Default for ProviderContinuationCapability {
    fn default() -> Self {
        Self::HistoryReplayOnly
    }
}

impl ProviderContinuationCapability {
    pub fn supports_remote_continuation(self) -> bool {
        !matches!(self, Self::HistoryReplayOnly)
    }
}

pub fn resolve_provider_continuation_capability(
    protocol: Option<RuntimeProviderProtocol>,
) -> ProviderContinuationCapability {
    resolve_provider_continuation_capability_for_model_protocol(
        protocol.map(RuntimeProviderProtocol::to_model_provider_protocol),
    )
}

pub fn resolve_provider_continuation_capability_for_model_protocol(
    protocol: Option<ModelProviderProtocol>,
) -> ProviderContinuationCapability {
    if protocol
        .as_ref()
        .is_some_and(ModelProviderProtocol::uses_responses_api)
    {
        return ProviderContinuationCapability::PreviousResponseId;
    }

    ProviderContinuationCapability::HistoryReplayOnly
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ProviderContinuationState {
    HistoryReplayOnly,
    ProviderSessionToken { session_token: String },
    PreviousResponseId { previous_response_id: String },
    StickyRoutingHint { routing_hint: String },
}

impl Default for ProviderContinuationState {
    fn default() -> Self {
        Self::HistoryReplayOnly
    }
}

impl ProviderContinuationState {
    pub fn history_replay_only() -> Self {
        Self::HistoryReplayOnly
    }

    pub fn provider_session_token(session_token: impl Into<String>) -> Self {
        match normalize_optional_text(Some(session_token.into())) {
            Some(session_token) => Self::ProviderSessionToken { session_token },
            None => Self::HistoryReplayOnly,
        }
    }

    pub fn previous_response_id(previous_response_id: impl Into<String>) -> Self {
        match normalize_optional_text(Some(previous_response_id.into())) {
            Some(previous_response_id) => Self::PreviousResponseId {
                previous_response_id,
            },
            None => Self::HistoryReplayOnly,
        }
    }

    pub fn sticky_routing_hint(routing_hint: impl Into<String>) -> Self {
        match normalize_optional_text(Some(routing_hint.into())) {
            Some(routing_hint) => Self::StickyRoutingHint { routing_hint },
            None => Self::HistoryReplayOnly,
        }
    }

    pub fn kind(&self) -> &'static str {
        match self {
            Self::HistoryReplayOnly => "history_replay_only",
            Self::ProviderSessionToken { .. } => "provider_session_token",
            Self::PreviousResponseId { .. } => "previous_response_id",
            Self::StickyRoutingHint { .. } => "sticky_routing_hint",
        }
    }

    pub fn matches_capability(&self, capability: ProviderContinuationCapability) -> bool {
        match self {
            Self::HistoryReplayOnly => true,
            Self::ProviderSessionToken { .. } => {
                capability == ProviderContinuationCapability::ProviderSessionToken
            }
            Self::PreviousResponseId { .. } => {
                capability == ProviderContinuationCapability::PreviousResponseId
            }
            Self::StickyRoutingHint { .. } => {
                capability == ProviderContinuationCapability::StickyRoutingHint
            }
        }
    }
}

pub trait ProviderContinuationCapable {
    fn provider_continuation_capability(&self) -> ProviderContinuationCapability;

    fn provider_continuation_state(&self) -> ProviderContinuationState {
        ProviderContinuationState::history_replay_only()
    }
}

#[cfg(test)]
mod tests {
    use super::{
        resolve_provider_continuation_capability,
        resolve_provider_continuation_capability_for_model_protocol,
        ProviderContinuationCapability, ProviderContinuationState,
    };
    use model_provider::runtime_provider::RuntimeProviderProtocol;
    use model_provider::ModelProviderProtocol;

    #[test]
    fn test_provider_continuation_state_defaults_to_history_replay_only() {
        assert_eq!(
            ProviderContinuationState::default(),
            ProviderContinuationState::HistoryReplayOnly
        );
        assert_eq!(
            ProviderContinuationState::provider_session_token("   "),
            ProviderContinuationState::HistoryReplayOnly
        );
    }

    #[test]
    fn test_provider_continuation_state_serializes_tagged_shape() {
        let state = ProviderContinuationState::previous_response_id("resp-1");

        assert_eq!(state.kind(), "previous_response_id");
        assert_eq!(
            serde_json::to_value(&state).expect("serialize continuation state"),
            serde_json::json!({
                "kind": "previous_response_id",
                "previous_response_id": "resp-1"
            })
        );
    }

    #[test]
    fn test_provider_continuation_capability_distinguishes_optional_remote_modes() {
        assert!(!ProviderContinuationCapability::HistoryReplayOnly.supports_remote_continuation());
        assert!(ProviderContinuationCapability::PreviousResponseId.supports_remote_continuation());
        assert!(ProviderContinuationCapability::ProviderSessionToken.supports_remote_continuation());
    }

    #[test]
    fn test_provider_continuation_state_matches_capability() {
        assert!(ProviderContinuationState::previous_response_id("resp-1")
            .matches_capability(ProviderContinuationCapability::PreviousResponseId));
        assert!(!ProviderContinuationState::previous_response_id("resp-1")
            .matches_capability(ProviderContinuationCapability::ProviderSessionToken));
        assert!(ProviderContinuationState::history_replay_only()
            .matches_capability(ProviderContinuationCapability::ProviderSessionToken));
    }

    #[test]
    fn test_resolve_provider_continuation_capability_uses_route_protocol_only() {
        assert_eq!(
            resolve_provider_continuation_capability(Some(RuntimeProviderProtocol::Responses)),
            ProviderContinuationCapability::PreviousResponseId
        );
        assert_eq!(
            resolve_provider_continuation_capability(Some(
                RuntimeProviderProtocol::ChatCompletions
            )),
            ProviderContinuationCapability::HistoryReplayOnly
        );
        assert_eq!(
            resolve_provider_continuation_capability(None),
            ProviderContinuationCapability::HistoryReplayOnly
        );
    }

    #[test]
    fn test_resolve_provider_continuation_capability_uses_model_provider_protocol() {
        assert_eq!(
            resolve_provider_continuation_capability_for_model_protocol(Some(
                ModelProviderProtocol::Responses
            )),
            ProviderContinuationCapability::PreviousResponseId
        );
        assert_eq!(
            resolve_provider_continuation_capability_for_model_protocol(Some(
                ModelProviderProtocol::ChatCompletions
            )),
            ProviderContinuationCapability::HistoryReplayOnly
        );
        assert_eq!(
            resolve_provider_continuation_capability_for_model_protocol(None),
            ProviderContinuationCapability::HistoryReplayOnly
        );
    }
}
