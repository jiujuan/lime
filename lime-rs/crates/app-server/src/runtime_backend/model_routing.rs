use super::model_registry_metadata::RuntimeModelRegistryMetadata;
use super::request_context::RuntimeModelSelection;
use crate::ExecutionRequest;
use lime_agent::ProviderConfig;
use lime_core::database::dao::api_key_provider::{ApiProviderType, ProviderWithKeys};
use lime_core::database::DbConnection;
use lime_core::models::provider_type::is_custom_provider_id;
use lime_core::models::RuntimeProviderType;
use lime_services::api_key_provider_service::ApiKeyProviderService;
use serde_json::{json, Map, Value};
use std::str::FromStr;

const PROFILE_MODEL_SLOT_SOURCE: &str = "profile_model_slot";
const DERIVED_MODEL_SLOT_SOURCE: &str = "selection_derived";
const DEFAULT_CODING_SLOT: &str = "coding";
const REQUIRED_CODING_CAPABILITIES: &[&str] = &["coding", "tools", "streaming"];
const KNOWN_CODING_SLOTS: &[&str] = &["base", "coding", "review", "fast", "local"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ProfileModelSlot {
    pub(super) slot: String,
    pub(super) provider: Option<String>,
    pub(super) model: Option<String>,
    source: String,
    decision_reason: Option<String>,
    capability_tags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ModelRoutingDecision {
    service_model_slot: String,
    requested_provider: Option<String>,
    requested_model: Option<String>,
    settings_source: String,
    decision_reason: String,
    fallback_chain: Vec<String>,
    profile_slots: Vec<ProfileModelSlot>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ProviderReadiness {
    pub(super) ready: bool,
    status: &'static str,
    source: &'static str,
    reason_code: Option<&'static str>,
    provider_type: Option<String>,
    enabled: Option<bool>,
    enabled_key_count: Option<usize>,
    total_key_count: Option<usize>,
    direct_request_config: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct RoutingResolution {
    pub(super) selection: RuntimeModelSelection,
    pub(super) routing: ModelRoutingDecision,
    pub(super) readiness: ProviderReadiness,
    pub(super) attempted: Vec<RoutingAttempt>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct RoutingAttempt {
    slot: String,
    provider: String,
    model: String,
    source: String,
    readiness: ProviderReadiness,
}

pub(super) fn selection_from_profile_model_slot(
    request: &ExecutionRequest,
) -> Option<RuntimeModelSelection> {
    let slot = primary_profile_model_slot(request)?;
    Some(RuntimeModelSelection {
        provider: slot.provider?,
        model: slot.model?,
        source: PROFILE_MODEL_SLOT_SOURCE,
        reasoning_effort: super::request_context::reasoning_effort_from_request(request),
    })
}

pub(super) fn resolve_ready_routing(
    db: &DbConnection,
    service: &ApiKeyProviderService,
    request: &ExecutionRequest,
    selection: &RuntimeModelSelection,
    direct_provider_config: Option<&ProviderConfig>,
) -> Result<RoutingResolution, String> {
    let candidates = routing_candidates_from_request(request, selection);
    let mut attempted = Vec::new();
    let mut blocked_resolution = None;

    for candidate in candidates {
        let mut routing = resolve_model_routing_for_candidate(request, &candidate);
        let readiness =
            resolve_provider_readiness(db, service, &candidate, direct_provider_config)?;
        attempted.push(RoutingAttempt {
            slot: routing.service_model_slot.clone(),
            provider: candidate.provider.clone(),
            model: candidate.model.clone(),
            source: candidate.source.to_string(),
            readiness: readiness.clone(),
        });
        routing.fallback_chain = fallback_chain_from_attempts(&attempted);
        let resolution = RoutingResolution {
            selection: candidate,
            routing,
            readiness,
            attempted: attempted.clone(),
        };
        if resolution.readiness.ready {
            return Ok(resolution);
        }
        blocked_resolution = Some(resolution);
    }

    blocked_resolution.ok_or_else(|| {
        "App Server runtime backend could not build a model routing candidate".to_string()
    })
}

fn resolve_model_routing_for_candidate(
    request: &ExecutionRequest,
    selection: &RuntimeModelSelection,
) -> ModelRoutingDecision {
    let profile_slots = profile_model_slots_from_request(request);
    let primary_slot = profile_slots
        .iter()
        .find(|slot| {
            slot.slot == DEFAULT_CODING_SLOT
                && slot.provider.as_deref() == Some(selection.provider.as_str())
                && slot.model.as_deref() == Some(selection.model.as_str())
        })
        .or_else(|| {
            profile_slots.iter().find(|slot| {
                slot.provider.as_deref() == Some(selection.provider.as_str())
                    && slot.model.as_deref() == Some(selection.model.as_str())
            })
        })
        .or_else(|| {
            profile_slots
                .iter()
                .find(|slot| slot.slot == DEFAULT_CODING_SLOT)
        })
        .or_else(|| profile_slots.iter().find(|slot| slot.slot == "base"));
    let service_model_slot = primary_slot
        .map(|slot| slot.slot.clone())
        .unwrap_or_else(|| DEFAULT_CODING_SLOT.to_string());
    let requested_provider = primary_slot
        .and_then(|slot| slot.provider.clone())
        .or_else(|| Some(selection.provider.clone()));
    let requested_model = primary_slot
        .and_then(|slot| slot.model.clone())
        .or_else(|| Some(selection.model.clone()));
    let settings_source = primary_slot
        .map(|slot| slot.source.clone())
        .unwrap_or_else(|| DERIVED_MODEL_SLOT_SOURCE.to_string());
    let requested_pair =
        provider_model_pair(requested_provider.as_deref(), requested_model.as_deref());
    let selected_pair = provider_model_pair(Some(&selection.provider), Some(&selection.model));
    let fallback_chain = match (requested_pair.as_ref(), selected_pair.as_ref()) {
        (Some(requested), Some(selected)) if requested != selected => {
            vec![requested.clone(), selected.clone()]
        }
        _ => Vec::new(),
    };
    let decision_reason = primary_slot
        .and_then(|slot| slot.decision_reason.clone())
        .unwrap_or_else(|| {
            if profile_slots.is_empty() {
                "selection_derived_as_coding_slot".to_string()
            } else if selection.source == PROFILE_MODEL_SLOT_SOURCE {
                "profile_slot_selected".to_string()
            } else if fallback_chain.is_empty() {
                "selection_matches_profile_slot".to_string()
            } else {
                "selection_overrode_profile_slot".to_string()
            }
        });

    ModelRoutingDecision {
        service_model_slot,
        requested_provider,
        requested_model,
        settings_source,
        decision_reason,
        fallback_chain,
        profile_slots,
    }
}

pub(super) fn resolve_provider_readiness(
    db: &DbConnection,
    service: &ApiKeyProviderService,
    selection: &RuntimeModelSelection,
    direct_provider_config: Option<&ProviderConfig>,
) -> Result<ProviderReadiness, String> {
    if direct_provider_config.is_some() {
        return Ok(ProviderReadiness {
            ready: true,
            status: "ready",
            source: "direct_provider_config",
            reason_code: None,
            provider_type: None,
            enabled: None,
            enabled_key_count: None,
            total_key_count: None,
            direct_request_config: true,
        });
    }

    let providers = service.get_all_providers(db)?;
    if let Some(provider) = providers
        .iter()
        .find(|provider| provider.provider.id == selection.provider)
    {
        return Ok(readiness_from_configured_provider(provider));
    }

    if is_supported_builtin_runtime_provider(&selection.provider) {
        return Ok(ProviderReadiness {
            ready: true,
            status: "ready",
            source: "builtin_runtime_provider",
            reason_code: None,
            provider_type: Some(selection.provider.clone()),
            enabled: None,
            enabled_key_count: None,
            total_key_count: None,
            direct_request_config: false,
        });
    }

    Ok(ProviderReadiness {
        ready: false,
        status: "needs_setup",
        source: "provider_store",
        reason_code: Some("provider_not_configured"),
        provider_type: None,
        enabled: None,
        enabled_key_count: Some(0),
        total_key_count: Some(0),
        direct_request_config: false,
    })
}

pub(super) fn routing_decision_payload(
    selection: &RuntimeModelSelection,
    routing: &ModelRoutingDecision,
    readiness: &ProviderReadiness,
    model_registry: &RuntimeModelRegistryMetadata,
) -> Value {
    let selected_provider = selection.provider.clone();
    let selected_model = selection.model.clone();
    let requested_provider = routing
        .requested_provider
        .clone()
        .unwrap_or_else(|| selected_provider.clone());
    let requested_model = routing
        .requested_model
        .clone()
        .unwrap_or_else(|| selected_model.clone());
    let routing_decision = json!({
        "routingMode": "profile_slot",
        "routing_mode": "profile_slot",
        "decisionSource": selection.source,
        "decision_source": selection.source,
        "decisionReason": routing.decision_reason,
        "decision_reason": routing.decision_reason,
        "settingsSource": routing.settings_source,
        "settings_source": routing.settings_source,
        "serviceModelSlot": routing.service_model_slot,
        "service_model_slot": routing.service_model_slot,
        "selectedProvider": selected_provider,
        "selected_provider": selected_provider,
        "selectedModel": selected_model,
        "selected_model": selected_model,
        "requestedProvider": requested_provider,
        "requested_provider": requested_provider,
        "requestedModel": requested_model,
        "requested_model": requested_model,
        "fallbackChain": routing.fallback_chain,
        "fallback_chain": routing.fallback_chain,
        "requiredCapabilities": REQUIRED_CODING_CAPABILITIES,
        "required_capabilities": REQUIRED_CODING_CAPABILITIES,
        "modelRegistry": model_registry.payload(),
        "model_registry": model_registry.payload(),
    });
    let model_slot = model_slot_payload(routing, selection);

    json!({
        "backend": "runtime",
        "routingDecision": routing_decision,
        "routing_decision": routing_decision,
        "modelSlot": model_slot,
        "model_slot": model_slot,
        "providerReadiness": readiness.to_payload(),
        "provider_readiness": readiness.to_payload(),
        "modelRegistry": model_registry.payload(),
        "model_registry": model_registry.payload(),
        "provider": selected_provider,
        "model": selected_model,
        "source": selection.source,
        "decisionSource": selection.source,
        "decision_source": selection.source,
        "decisionReason": routing.decision_reason,
        "decision_reason": routing.decision_reason,
        "settingsSource": routing.settings_source,
        "settings_source": routing.settings_source,
        "serviceModelSlot": routing.service_model_slot,
        "service_model_slot": routing.service_model_slot,
        "selectedProvider": selected_provider,
        "selected_provider": selected_provider,
        "selectedModel": selected_model,
        "selected_model": selected_model,
        "requestedProvider": requested_provider,
        "requested_provider": requested_provider,
        "requestedModel": requested_model,
        "requested_model": requested_model,
        "fallbackChain": routing.fallback_chain,
        "fallback_chain": routing.fallback_chain,
        "requiredCapabilities": REQUIRED_CODING_CAPABILITIES,
        "required_capabilities": REQUIRED_CODING_CAPABILITIES,
    })
}

pub(super) fn routing_fallback_applied_payload(
    requested_selection: &RuntimeModelSelection,
    selection: &RuntimeModelSelection,
    routing: &ModelRoutingDecision,
    readiness: &ProviderReadiness,
    model_registry: &RuntimeModelRegistryMetadata,
    attempted: &[RoutingAttempt],
) -> Value {
    let mut payload = routing_decision_payload(selection, routing, readiness, model_registry);
    if let Some(object) = payload.as_object_mut() {
        object.insert("status".to_string(), Value::String("ready".to_string()));
        object.insert(
            "fallbackApplied".to_string(),
            Value::Bool(requested_selection != selection),
        );
        object.insert(
            "fallback_applied".to_string(),
            Value::Bool(requested_selection != selection),
        );
        object.insert(
            "requestedSelection".to_string(),
            selection_payload(requested_selection),
        );
        object.insert(
            "requested_selection".to_string(),
            selection_payload(requested_selection),
        );
        object.insert(
            "routingAttempts".to_string(),
            routing_attempts_payload(attempted),
        );
        object.insert(
            "routing_attempts".to_string(),
            routing_attempts_payload(attempted),
        );
    }
    payload
}

pub(super) fn routing_not_possible_payload(
    selection: &RuntimeModelSelection,
    routing: &ModelRoutingDecision,
    readiness: &ProviderReadiness,
    model_registry: &RuntimeModelRegistryMetadata,
) -> Value {
    let mut payload = routing_decision_payload(selection, routing, readiness, model_registry);
    if let Some(object) = payload.as_object_mut() {
        object.insert("status".to_string(), Value::String("blocked".to_string()));
        object.insert(
            "failureCategory".to_string(),
            Value::String("provider_needs_setup".to_string()),
        );
        object.insert(
            "failure_category".to_string(),
            Value::String("provider_needs_setup".to_string()),
        );
        if let Some(reason_code) = readiness.reason_code {
            object.insert(
                "reasonCode".to_string(),
                Value::String(reason_code.to_string()),
            );
            object.insert(
                "reason_code".to_string(),
                Value::String(reason_code.to_string()),
            );
        }
    }
    payload
}

pub(super) fn routing_not_possible_payload_with_attempts(
    selection: &RuntimeModelSelection,
    routing: &ModelRoutingDecision,
    readiness: &ProviderReadiness,
    model_registry: &RuntimeModelRegistryMetadata,
    attempted: &[RoutingAttempt],
) -> Value {
    let mut payload = routing_not_possible_payload(selection, routing, readiness, model_registry);
    if let Some(object) = payload.as_object_mut() {
        object.insert(
            "routingAttempts".to_string(),
            routing_attempts_payload(attempted),
        );
        object.insert(
            "routing_attempts".to_string(),
            routing_attempts_payload(attempted),
        );
    }
    payload
}

impl ProviderReadiness {
    pub(super) fn to_payload(&self) -> Value {
        json!({
            "ready": self.ready,
            "status": self.status,
            "source": self.source,
            "reasonCode": self.reason_code,
            "reason_code": self.reason_code,
            "providerType": self.provider_type,
            "provider_type": self.provider_type,
            "enabled": self.enabled,
            "enabledKeyCount": self.enabled_key_count,
            "enabled_key_count": self.enabled_key_count,
            "totalKeyCount": self.total_key_count,
            "total_key_count": self.total_key_count,
            "directRequestConfig": self.direct_request_config,
            "direct_request_config": self.direct_request_config,
        })
    }
}

impl ModelRoutingDecision {
    pub(super) fn service_model_slot(&self) -> &str {
        &self.service_model_slot
    }
}

impl RoutingAttempt {
    fn to_payload(&self) -> Value {
        json!({
            "slot": self.slot,
            "serviceModelSlot": self.slot,
            "service_model_slot": self.slot,
            "provider": self.provider,
            "model": self.model,
            "source": self.source,
            "providerReadiness": self.readiness.to_payload(),
            "provider_readiness": self.readiness.to_payload(),
        })
    }
}

fn readiness_from_configured_provider(provider: &ProviderWithKeys) -> ProviderReadiness {
    let enabled_key_count = provider.api_keys.iter().filter(|key| key.enabled).count();
    let total_key_count = provider.api_keys.len();
    let provider_type = Some(provider.provider.provider_type.to_string());
    if provider_looks_non_chat_candidate(provider) {
        return ProviderReadiness {
            ready: false,
            status: "blocked",
            source: "provider_store",
            reason_code: Some("provider_not_chat_capable"),
            provider_type,
            enabled: Some(provider.provider.enabled),
            enabled_key_count: Some(enabled_key_count),
            total_key_count: Some(total_key_count),
            direct_request_config: false,
        };
    }
    if !provider.provider.enabled {
        return ProviderReadiness {
            ready: false,
            status: "needs_setup",
            source: "provider_store",
            reason_code: Some("provider_disabled"),
            provider_type,
            enabled: Some(false),
            enabled_key_count: Some(enabled_key_count),
            total_key_count: Some(total_key_count),
            direct_request_config: false,
        };
    }
    if enabled_key_count == 0 {
        return ProviderReadiness {
            ready: false,
            status: "needs_setup",
            source: "provider_store",
            reason_code: Some("missing_enabled_api_key"),
            provider_type,
            enabled: Some(true),
            enabled_key_count: Some(enabled_key_count),
            total_key_count: Some(total_key_count),
            direct_request_config: false,
        };
    }

    ProviderReadiness {
        ready: true,
        status: "ready",
        source: "provider_store",
        reason_code: None,
        provider_type,
        enabled: Some(true),
        enabled_key_count: Some(enabled_key_count),
        total_key_count: Some(total_key_count),
        direct_request_config: false,
    }
}

fn profile_model_slots_from_request(request: &ExecutionRequest) -> Vec<ProfileModelSlot> {
    metadata_candidates(request)
        .into_iter()
        .find_map(profile_model_slots_from_metadata)
        .unwrap_or_default()
}

fn routing_candidates_from_request(
    request: &ExecutionRequest,
    selection: &RuntimeModelSelection,
) -> Vec<RuntimeModelSelection> {
    let mut candidates = Vec::new();
    push_unique_selection(&mut candidates, selection.clone());

    for slot in profile_model_slots_from_request(request) {
        if !candidate_fallback_slot(&slot.slot) {
            continue;
        }
        let Some(provider) = slot.provider else {
            continue;
        };
        let Some(model) = slot.model else {
            continue;
        };
        push_unique_selection(
            &mut candidates,
            RuntimeModelSelection {
                provider,
                model,
                source: PROFILE_MODEL_SLOT_SOURCE,
                reasoning_effort: selection.reasoning_effort.clone(),
            },
        );
    }

    candidates
}

fn push_unique_selection(
    candidates: &mut Vec<RuntimeModelSelection>,
    selection: RuntimeModelSelection,
) {
    if candidates.iter().any(|candidate| {
        candidate.provider == selection.provider && candidate.model == selection.model
    }) {
        return;
    }
    candidates.push(selection);
}

fn candidate_fallback_slot(slot: &str) -> bool {
    matches!(slot, DEFAULT_CODING_SLOT | "base" | "fast" | "local")
}

fn fallback_chain_from_attempts(attempts: &[RoutingAttempt]) -> Vec<String> {
    attempts
        .iter()
        .map(|attempt| format!("{}/{}", attempt.provider, attempt.model))
        .collect()
}

fn primary_profile_model_slot(request: &ExecutionRequest) -> Option<ProfileModelSlot> {
    let slots = profile_model_slots_from_request(request);
    slots
        .iter()
        .find(|slot| {
            slot.slot == DEFAULT_CODING_SLOT && slot.provider.is_some() && slot.model.is_some()
        })
        .or_else(|| {
            slots
                .iter()
                .find(|slot| slot.slot == "base" && slot.provider.is_some() && slot.model.is_some())
        })
        .cloned()
}

fn profile_model_slots_from_metadata(metadata: &Value) -> Option<Vec<ProfileModelSlot>> {
    let container = [
        "/harness/coding_model_slots",
        "/harness/codingModelSlots",
        "/harness/model_slots",
        "/harness/modelSlots",
        "/coding_model_slots",
        "/codingModelSlots",
        "/model_slots",
        "/modelSlots",
        "/coding_profile/model_slots",
        "/codingProfile/modelSlots",
    ]
    .iter()
    .find_map(|pointer| metadata.pointer(pointer))?;

    match container {
        Value::Object(object) => Some(slots_from_object(object)),
        Value::Array(items) => Some(slots_from_array(items)),
        _ => None,
    }
    .filter(|slots| !slots.is_empty())
}

fn slots_from_object(object: &Map<String, Value>) -> Vec<ProfileModelSlot> {
    KNOWN_CODING_SLOTS
        .iter()
        .filter_map(|slot| object.get(*slot).map(|value| (*slot, value)))
        .filter_map(|(slot, value)| profile_slot_from_value(slot, value))
        .collect()
}

fn slots_from_array(items: &[Value]) -> Vec<ProfileModelSlot> {
    items
        .iter()
        .filter_map(|value| {
            let slot = string_field(
                value,
                &[
                    "slot",
                    "id",
                    "name",
                    "serviceModelSlot",
                    "service_model_slot",
                ],
            )?;
            profile_slot_from_value(&slot, value)
        })
        .filter(|slot| KNOWN_CODING_SLOTS.contains(&slot.slot.as_str()))
        .collect()
}

fn profile_slot_from_value(slot: &str, value: &Value) -> Option<ProfileModelSlot> {
    let slot = normalized_slot_name(slot)?;
    let source = string_field(value, &["source", "settingsSource", "settings_source"])
        .unwrap_or_else(|| PROFILE_MODEL_SLOT_SOURCE.to_string());
    let capability_tags = string_array_field(
        value,
        &[
            "capabilityTags",
            "capability_tags",
            "capabilities",
            "requiredCapabilities",
            "required_capabilities",
        ],
    );
    Some(ProfileModelSlot {
        slot,
        provider: string_field(
            value,
            &[
                "provider",
                "providerId",
                "provider_id",
                "providerPreference",
                "provider_preference",
                "selectedProvider",
                "selected_provider",
            ],
        ),
        model: string_field(
            value,
            &[
                "model",
                "modelName",
                "model_name",
                "modelPreference",
                "model_preference",
                "selectedModel",
                "selected_model",
            ],
        ),
        source,
        decision_reason: string_field(
            value,
            &[
                "reason",
                "reasonCode",
                "reason_code",
                "decisionReason",
                "decision_reason",
            ],
        ),
        capability_tags,
    })
}

fn model_slot_payload(routing: &ModelRoutingDecision, selection: &RuntimeModelSelection) -> Value {
    json!({
        "serviceModelSlot": routing.service_model_slot,
        "service_model_slot": routing.service_model_slot,
        "selected": {
            "provider": selection.provider,
            "model": selection.model,
            "source": selection.source,
        },
        "requested": {
            "provider": routing.requested_provider,
            "model": routing.requested_model,
            "source": routing.settings_source,
        },
        "slots": routing
            .profile_slots
            .iter()
            .map(profile_slot_payload)
            .collect::<Vec<_>>(),
        "requiredCapabilities": REQUIRED_CODING_CAPABILITIES,
        "required_capabilities": REQUIRED_CODING_CAPABILITIES,
    })
}

fn profile_slot_payload(slot: &ProfileModelSlot) -> Value {
    json!({
        "slot": slot.slot,
        "provider": slot.provider,
        "model": slot.model,
        "source": slot.source,
        "decisionReason": slot.decision_reason,
        "decision_reason": slot.decision_reason,
        "capabilityTags": slot.capability_tags,
        "capability_tags": slot.capability_tags,
    })
}

fn metadata_candidates(request: &ExecutionRequest) -> Vec<&Value> {
    let mut values = Vec::new();
    if let Some(value) = request
        .runtime_options
        .as_ref()
        .and_then(|options| options.metadata.as_ref())
    {
        values.push(value);
    }
    if let Some(value) = request.metadata.as_ref() {
        values.push(value);
    }
    values
}

fn provider_model_pair(provider: Option<&str>, model: Option<&str>) -> Option<String> {
    Some(format!("{}/{}", non_empty(provider)?, non_empty(model)?))
}

fn routing_attempts_payload(attempted: &[RoutingAttempt]) -> Value {
    Value::Array(attempted.iter().map(RoutingAttempt::to_payload).collect())
}

fn selection_payload(selection: &RuntimeModelSelection) -> Value {
    json!({
        "provider": selection.provider,
        "model": selection.model,
        "source": selection.source,
        "reasoningEffort": selection.reasoning_effort,
        "reasoning_effort": selection.reasoning_effort,
    })
}

fn normalized_slot_name(value: &str) -> Option<String> {
    let value = value.trim().to_ascii_lowercase();
    KNOWN_CODING_SLOTS
        .contains(&value.as_str())
        .then_some(value)
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(|value| value.as_str().and_then(|value| non_empty(Some(value))))
}

fn string_array_field(value: &Value, keys: &[&str]) -> Vec<String> {
    let Some(object) = value.as_object() else {
        return Vec::new();
    };
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(|value| {
            value.as_array().map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .filter_map(|value| non_empty(Some(value)))
                    .collect::<Vec<_>>()
            })
        })
        .unwrap_or_default()
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn is_supported_builtin_runtime_provider(provider: &str) -> bool {
    !is_custom_provider_id(provider) && RuntimeProviderType::from_str(provider).is_ok()
}

fn provider_looks_non_chat_candidate(provider: &ProviderWithKeys) -> bool {
    matches!(provider.provider.provider_type, ApiProviderType::Fal)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime_backend::tests::request_for_test;
    use lime_core::database::dao::api_key_provider::ApiProviderType;
    use lime_core::database::schema::create_tables;
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};

    fn test_db() -> DbConnection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        create_tables(&conn).expect("create schema");
        Arc::new(Mutex::new(conn))
    }

    #[test]
    fn selection_from_coding_profile_slot_reads_harness_metadata() {
        let request = request_for_test(
            "hello",
            None,
            Some(json!({
                "harness": {
                    "coding_model_slots": {
                        "base": {
                            "provider": "openai",
                            "model": "gpt-4.1-mini"
                        },
                        "coding": {
                            "provider": "custom-coding",
                            "model": "coder-large",
                            "reason": "workspace_coding_profile",
                            "capabilityTags": ["coding", "tools"]
                        },
                        "review": {
                            "provider": "custom-review",
                            "model": "review-small"
                        }
                    }
                }
            })),
        );

        let selection = selection_from_profile_model_slot(&request).expect("slot selection");

        assert_eq!(selection.provider, "custom-coding");
        assert_eq!(selection.model, "coder-large");
        assert_eq!(selection.source, "profile_model_slot");
    }

    #[test]
    fn routing_payload_keeps_review_fast_local_as_diagnostics_only() {
        let request = request_for_test(
            "hello",
            None,
            Some(json!({
                "harness": {
                    "modelSlots": {
                        "coding": {
                            "providerPreference": "custom-coding",
                            "modelPreference": "coder-large"
                        },
                        "review": {
                            "providerPreference": "custom-review",
                            "modelPreference": "review-small"
                        },
                        "fast": {
                            "providerPreference": "openai",
                            "modelPreference": "gpt-4.1-mini"
                        },
                        "local": {
                            "providerPreference": "ollama",
                            "modelPreference": "qwen-coder"
                        }
                    }
                }
            })),
        );
        let selection = RuntimeModelSelection {
            provider: "custom-coding".to_string(),
            model: "coder-large".to_string(),
            source: "profile_model_slot",
            reasoning_effort: None,
        };
        let routing = resolve_model_routing_for_candidate(&request, &selection);
        let readiness = ProviderReadiness {
            ready: true,
            status: "ready",
            source: "direct_provider_config",
            reason_code: None,
            provider_type: None,
            enabled: None,
            enabled_key_count: None,
            total_key_count: None,
            direct_request_config: true,
        };
        let model_registry = RuntimeModelRegistryMetadata::from_payload(json!({
            "source": "provider_declared_model",
            "status": "matched",
            "reasonCode": "matched_provider_custom_models",
            "reason_code": "matched_provider_custom_models",
            "modelCapabilities": {
                "capabilities": {
                    "tools": true,
                    "streaming": true,
                    "reasoning": true
                },
                "taskFamilies": ["chat", "reasoning"],
                "runtimeFeatures": ["streaming", "tool_calling", "reasoning"]
            },
            "modelAlias": {
                "canonicalModelId": "coder-large",
                "providerModelId": "coder-large",
                "aliasSource": "local"
            },
            "reasoning": {
                "supported": true,
                "reasoningEffort": {
                    "supported": true,
                    "levels": ["low", "medium", "high"],
                    "default": "medium",
                    "source": "api"
                }
            }
        }));

        let payload = routing_decision_payload(&selection, &routing, &readiness, &model_registry);

        assert_eq!(payload["serviceModelSlot"].as_str(), Some("coding"));
        assert_eq!(payload["selectedProvider"].as_str(), Some("custom-coding"));
        assert_eq!(payload["selectedModel"].as_str(), Some("coder-large"));
        assert_eq!(payload["modelSlot"]["slots"].as_array().unwrap().len(), 4);
        assert!(payload["fallbackChain"].as_array().unwrap().is_empty());
        assert_eq!(
            payload["modelRegistry"]["reasonCode"].as_str(),
            Some("matched_provider_custom_models")
        );
        assert_eq!(
            payload["modelRegistry"]["modelCapabilities"]["capabilities"]["reasoning"].as_bool(),
            Some(true)
        );
    }

    #[test]
    fn ready_routing_falls_back_from_unready_coding_slot_to_base_slot() {
        let db = test_db();
        let service = ApiKeyProviderService::new();
        let custom = service
            .add_custom_provider(
                &db,
                "Workspace Coding Gateway".to_string(),
                ApiProviderType::Openai,
                "https://coding.example.com/v1".to_string(),
                None,
                None,
                None,
                None,
                None,
            )
            .expect("custom provider");
        let custom_id = custom.id.clone();
        service
            .initialize_system_providers(&db)
            .expect("system providers");
        service
            .add_api_key(
                &db,
                "openai",
                "sk-test",
                Some("OpenAI test".to_string()),
                true,
            )
            .expect("openai api key");
        let request = request_for_test(
            "hello",
            None,
            Some(json!({
                "harness": {
                    "coding_model_slots": {
                        "coding": {
                            "provider": custom_id,
                            "model": "missing-key-coder"
                        },
                        "base": {
                            "provider": "openai",
                            "model": "gpt-4.1-mini"
                        }
                    }
                }
            })),
        );
        let requested = selection_from_profile_model_slot(&request).expect("requested selection");

        let resolution = resolve_ready_routing(&db, &service, &request, &requested, None)
            .expect("routing resolution");

        assert_eq!(requested.provider, custom.id);
        assert_eq!(resolution.selection.provider, "openai");
        assert_eq!(resolution.selection.model, "gpt-4.1-mini");
        assert!(resolution.readiness.ready);
        assert_eq!(resolution.routing.service_model_slot(), "base");
        assert_eq!(resolution.attempted.len(), 2);
        assert_eq!(resolution.attempted[0].slot, "coding");
        assert!(!resolution.attempted[0].readiness.ready);
        assert_eq!(
            resolution.attempted[0].readiness.reason_code,
            Some("missing_enabled_api_key")
        );
        assert_eq!(
            resolution.routing.fallback_chain,
            vec![
                format!("{}/missing-key-coder", requested.provider),
                "openai/gpt-4.1-mini".to_string()
            ]
        );
    }
}
