use super::*;
use serde_json::json;

fn selection(provider: &str, model: &str) -> RuntimeModelSelection {
    RuntimeModelSelection {
        provider: provider.to_string(),
        model: model.to_string(),
        source: PROFILE_MODEL_SLOT_SOURCE,
        reasoning_effort: None,
    }
}

#[test]
fn selection_from_profile_slot_reads_harness_metadata() {
    let metadata = json!({
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
    });

    let selection = selection_from_profile_model_slot(&[&metadata], Some("medium".to_string()))
        .expect("slot selection");

    assert_eq!(selection.provider, "custom-coding");
    assert_eq!(selection.model, "coder-large");
    assert_eq!(selection.source, PROFILE_MODEL_SLOT_SOURCE);
    assert_eq!(selection.reasoning_effort.as_deref(), Some("medium"));
}

#[test]
fn routing_payload_keeps_review_fast_local_as_diagnostics_only() {
    let metadata = json!({
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
    });
    let selection = selection("custom-coding", "coder-large");
    let routing = resolve_model_routing_for_candidate(&[&metadata], &selection);
    let readiness = ProviderReadiness::direct_request_ready();
    let model_registry = json!({
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
    });

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
    let metadata = json!({
        "harness": {
            "coding_model_slots": {
                "coding": {
                    "provider": "custom-coding",
                    "model": "missing-key-coder"
                },
                "base": {
                    "provider": "openai",
                    "model": "gpt-4.1-mini"
                }
            }
        }
    });
    let requested =
        selection_from_profile_model_slot(&[&metadata], None).expect("requested selection");

    let resolution = resolve_ready_model_routing(&[&metadata], &requested, |candidate| {
        if candidate.provider == "openai" {
            Ok(ProviderReadiness::provider_store_ready(
                Some("openai".to_string()),
                1,
                1,
            ))
        } else {
            Ok(ProviderReadiness::provider_store_needs_setup(
                "missing_enabled_api_key",
                Some("openai".to_string()),
                Some(true),
                0,
                0,
            ))
        }
    })
    .expect("routing resolution");

    assert_eq!(requested.provider, "custom-coding");
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
            "custom-coding/missing-key-coder".to_string(),
            "openai/gpt-4.1-mini".to_string()
        ]
    );
}
