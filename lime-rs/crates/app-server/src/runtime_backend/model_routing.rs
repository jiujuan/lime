use super::model_registry_metadata::RuntimeModelRegistryMetadata;
use super::request_context::RuntimeModelSelection;
use crate::ExecutionRequest;
use lime_agent::ProviderConfig;
use lime_core::database::dao::api_key_provider::{ApiProviderType, ProviderWithKeys};
use lime_core::database::DbConnection;
use lime_core::models::provider_type::is_custom_provider_id;
use lime_core::models::RuntimeProviderType;
use lime_services::api_key_provider_service::ApiKeyProviderService;
use runtime_core::{
    resolve_ready_model_routing, ModelRoutingDecision, ProviderReadiness, RoutingAttempt,
    RoutingResolution,
};
use serde_json::Value;
use std::str::FromStr;

pub(super) fn selection_from_profile_model_slot(
    request: &ExecutionRequest,
) -> Option<RuntimeModelSelection> {
    let metadata_values = metadata_candidates(request);
    runtime_core::selection_from_profile_model_slot(
        &metadata_values,
        super::request_context::reasoning_effort_from_request(request),
    )
}

pub(super) fn resolve_ready_routing(
    db: &DbConnection,
    service: &ApiKeyProviderService,
    request: &ExecutionRequest,
    selection: &RuntimeModelSelection,
    direct_provider_config: Option<&ProviderConfig>,
) -> Result<RoutingResolution, String> {
    let metadata_values = metadata_candidates(request);
    resolve_ready_model_routing(&metadata_values, selection, |candidate| {
        resolve_provider_readiness(db, service, candidate, direct_provider_config)
    })
}

pub(super) fn resolve_provider_readiness(
    db: &DbConnection,
    service: &ApiKeyProviderService,
    selection: &RuntimeModelSelection,
    direct_provider_config: Option<&ProviderConfig>,
) -> Result<ProviderReadiness, String> {
    if direct_provider_config.is_some() {
        return Ok(ProviderReadiness::direct_request_ready());
    }

    let providers = service.get_all_providers(db)?;
    if let Some(provider) = providers
        .iter()
        .find(|provider| provider.provider.id == selection.provider)
    {
        return Ok(readiness_from_configured_provider(provider));
    }

    if is_supported_builtin_runtime_provider(&selection.provider) {
        return Ok(ProviderReadiness::builtin_provider_ready(
            selection.provider.clone(),
        ));
    }

    Ok(ProviderReadiness::provider_not_configured())
}

pub(super) fn routing_decision_payload(
    selection: &RuntimeModelSelection,
    routing: &ModelRoutingDecision,
    readiness: &ProviderReadiness,
    model_registry: &RuntimeModelRegistryMetadata,
) -> Value {
    runtime_core::routing_decision_payload(selection, routing, readiness, model_registry.payload())
}

pub(super) fn routing_fallback_applied_payload(
    requested_selection: &RuntimeModelSelection,
    selection: &RuntimeModelSelection,
    routing: &ModelRoutingDecision,
    readiness: &ProviderReadiness,
    model_registry: &RuntimeModelRegistryMetadata,
    attempted: &[RoutingAttempt],
) -> Value {
    runtime_core::routing_fallback_applied_payload(
        requested_selection,
        selection,
        routing,
        readiness,
        model_registry.payload(),
        attempted,
    )
}

pub(super) fn routing_not_possible_payload_with_attempts(
    selection: &RuntimeModelSelection,
    routing: &ModelRoutingDecision,
    readiness: &ProviderReadiness,
    model_registry: &RuntimeModelRegistryMetadata,
    attempted: &[RoutingAttempt],
) -> Value {
    runtime_core::routing_not_possible_payload_with_attempts(
        selection,
        routing,
        readiness,
        model_registry.payload(),
        attempted,
    )
}

fn readiness_from_configured_provider(provider: &ProviderWithKeys) -> ProviderReadiness {
    let enabled_key_count = provider.api_keys.iter().filter(|key| key.enabled).count();
    let total_key_count = provider.api_keys.len();
    let provider_type = Some(provider.provider.provider_type.to_string());
    if provider_looks_non_chat_candidate(provider) {
        return ProviderReadiness::provider_store_blocked(
            "provider_not_chat_capable",
            provider_type,
            Some(provider.provider.enabled),
            enabled_key_count,
            total_key_count,
        );
    }
    if !provider.provider.enabled {
        return ProviderReadiness::provider_store_needs_setup(
            "provider_disabled",
            provider_type,
            Some(false),
            enabled_key_count,
            total_key_count,
        );
    }
    if enabled_key_count == 0 {
        return ProviderReadiness::provider_store_needs_setup(
            "missing_enabled_api_key",
            provider_type,
            Some(true),
            enabled_key_count,
            total_key_count,
        );
    }

    ProviderReadiness::provider_store_ready(provider_type, enabled_key_count, total_key_count)
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
    use serde_json::json;
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
        let metadata_values = metadata_candidates(&request);
        let routing =
            runtime_core::resolve_model_routing_for_candidate(&metadata_values, &selection);
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
        assert_eq!(resolution.routing.service_model_slot, "base");
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
