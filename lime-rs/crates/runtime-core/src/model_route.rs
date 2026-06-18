use crate::model_task::{capability_snapshot_from_model_capabilities, route_capability_gap};
use app_server_protocol::{
    AuthKind, AuthMaterialRef, CapabilitySnapshot, EndpointInfo, EndpointKind, FramingKind,
    ModelRef, ModelRefSource, ModelTaskKind, ModelTaskRequest, ProtocolKind, ResolvedModelRoute,
    RouteDefaults, RouteFailure, RouteFailureCategory, RoutingDecision, TransportKind,
};
use serde_json::Value;
use std::borrow::Cow;

pub struct ModelRouteSelection<'a> {
    pub provider_id: &'a str,
    pub model_id: &'a str,
    pub model_ref_source: ModelRefSource,
    pub reasoning_effort: Option<&'a str>,
}

pub struct DirectRouteConfig<'a> {
    pub provider_name: &'a str,
    pub api_key_present: bool,
    pub base_url: Option<&'a str>,
    pub credential_ref: Option<&'a str>,
    pub protocol: Option<ProtocolKind>,
    pub toolshim: bool,
    pub toolshim_model: Option<&'a str>,
}

pub struct ModelRouteProvider<'a> {
    pub provider_id: &'a str,
    pub provider_type: Cow<'a, str>,
    pub base_url: Option<&'a str>,
    pub api_version: Option<&'a str>,
    pub project: Option<&'a str>,
    pub location: Option<&'a str>,
    pub region: Option<&'a str>,
    pub credential_ref: Option<String>,
    pub auth_header: &'a str,
    pub auth_prefix: Option<&'a str>,
    pub prompt_cache_mode: Option<String>,
}

pub fn resolved_route_from_task(
    task_request: &ModelTaskRequest,
    selection: ModelRouteSelection<'_>,
    routing_payload: &Value,
    provider: Option<&ModelRouteProvider<'_>>,
    direct_config: Option<DirectRouteConfig<'_>>,
) -> ResolvedModelRoute {
    let readiness = routing_payload
        .get("providerReadiness")
        .or_else(|| routing_payload.get("provider_readiness"));
    let ready = readiness
        .and_then(|value| value.get("ready"))
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let capability_snapshot = capability_snapshot(routing_payload);
    let protocol = resolve_protocol(
        task_request,
        &capability_snapshot,
        &selection,
        provider,
        direct_config.as_ref(),
    );
    let capability_gap = if has_declared_capability_snapshot(routing_payload) {
        route_capability_gap(task_request, &capability_snapshot)
    } else {
        None
    };
    let mut decision = routing_decision(routing_payload);
    decision.capability_gap = capability_gap.clone();

    ResolvedModelRoute {
        model_ref: task_request.model_ref.clone().unwrap_or_else(|| ModelRef {
            provider_id: selection.provider_id.to_string(),
            model_id: selection.model_id.to_string(),
            variant: None,
            routing_slot: task_request.routing_slot.clone(),
            source: selection.model_ref_source.clone(),
        }),
        provider: None,
        model: None,
        protocol: protocol.clone(),
        endpoint: endpoint_info(provider, direct_config.as_ref()),
        auth: auth_ref(&selection, provider, direct_config.as_ref()),
        transport: TransportKind::Http,
        framing: framing_for_protocol(&protocol),
        defaults: route_defaults(&selection, provider, direct_config.as_ref()),
        capability_snapshot,
        decision,
        failure: if ready {
            capability_gap.map(|gap| capability_route_failure(&selection, gap))
        } else {
            Some(route_failure(&selection, readiness))
        },
    }
}

fn resolve_protocol(
    task_request: &ModelTaskRequest,
    capability_snapshot: &CapabilitySnapshot,
    selection: &ModelRouteSelection<'_>,
    provider: Option<&ModelRouteProvider<'_>>,
    direct_config: Option<&DirectRouteConfig<'_>>,
) -> ProtocolKind {
    if let Some(config) = direct_config {
        return config
            .protocol
            .clone()
            .unwrap_or_else(|| protocol_from_provider_name(config.provider_name));
    }

    if route_has_runtime_feature(capability_snapshot, "responses_api") {
        return ProtocolKind::OpenaiResponses;
    }

    if task_request.task_kind == ModelTaskKind::ImageGenerate {
        if route_has_runtime_feature(capability_snapshot, "images_api") {
            return match provider {
                Some(provider) if provider_type_is(&provider.provider_type, "fal") => {
                    ProtocolKind::Fal
                }
                None if provider_name_is_fal(selection.provider_id) => ProtocolKind::Fal,
                _ => ProtocolKind::OpenaiImages,
            };
        }
    }

    if let Some(provider) = provider {
        return protocol_from_provider_type(&provider.provider_type);
    }

    protocol_from_provider_name(selection.provider_id)
}

fn protocol_from_provider_type(provider_type: &str) -> ProtocolKind {
    match normalize_token(provider_type).as_deref() {
        Some("openai_response") | Some("openai_responses") | Some("responses") => {
            ProtocolKind::OpenaiResponses
        }
        Some("codex") => ProtocolKind::CodexResponses,
        Some("anthropic") | Some("anthropic_compatible") => ProtocolKind::AnthropicMessages,
        Some("gemini") => ProtocolKind::GeminiGenerateContent,
        Some("vertexai") | Some("vertex_ai") | Some("gcpvertexai") => ProtocolKind::VertexGemini,
        Some("aws_bedrock") | Some("bedrock") => ProtocolKind::BedrockConverse,
        Some("ollama") => ProtocolKind::OllamaChat,
        Some("fal") => ProtocolKind::Fal,
        Some("openai") | Some("azure_openai") | Some("newapi") | Some("new_api")
        | Some("gateway") => ProtocolKind::OpenaiChat,
        _ => ProtocolKind::OpenaiChat,
    }
}

fn route_has_runtime_feature(snapshot: &CapabilitySnapshot, feature: &str) -> bool {
    normalize_string_values(&snapshot.runtime_features)
        .iter()
        .any(|value| value == feature)
}

fn normalize_string_values(values: &[String]) -> Vec<String> {
    values
        .iter()
        .filter_map(|value| normalize_token(value))
        .collect()
}

fn normalize_token(value: &str) -> Option<String> {
    let normalized = value.trim().to_ascii_lowercase().replace(['-', ' '], "_");
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn protocol_from_provider_name(provider: &str) -> ProtocolKind {
    match normalize_token(provider).as_deref() {
        Some("openai_response") | Some("openai_responses") | Some("responses") => {
            ProtocolKind::OpenaiResponses
        }
        Some("codex") => ProtocolKind::CodexResponses,
        Some("anthropic") | Some("claude") | Some("anthropic_compatible") => {
            ProtocolKind::AnthropicMessages
        }
        Some("gemini") | Some("gemini_api_key") | Some("google") => {
            ProtocolKind::GeminiGenerateContent
        }
        Some("vertex") | Some("vertexai") | Some("vertex_ai") | Some("gcpvertexai") => {
            ProtocolKind::VertexGemini
        }
        Some("aws_bedrock") | Some("bedrock") => ProtocolKind::BedrockConverse,
        Some("ollama") => ProtocolKind::OllamaChat,
        Some("fal") => ProtocolKind::Fal,
        Some("openai") | Some("azure_openai") | Some("newapi") | Some("new_api")
        | Some("gateway") => ProtocolKind::OpenaiChat,
        _ => ProtocolKind::OpenaiChat,
    }
}

fn provider_type_is(provider_type: &str, expected: &str) -> bool {
    normalize_token(provider_type).as_deref() == Some(expected)
}

fn provider_name_is_fal(provider: &str) -> bool {
    let normalized = provider.trim().to_ascii_lowercase();
    normalized == "fal" || normalized.contains("fal.ai") || normalized.contains("fal-ai")
}

fn endpoint_info(
    provider: Option<&ModelRouteProvider<'_>>,
    direct_config: Option<&DirectRouteConfig<'_>>,
) -> EndpointInfo {
    if let Some(config) = direct_config {
        return EndpointInfo {
            kind: EndpointKind::DirectRequest,
            base_url: config.base_url.and_then(|value| non_empty(Some(value))),
            api_version: None,
            project: None,
            location: None,
            region: None,
        };
    }

    if let Some(provider) = provider {
        let base_url = provider.base_url.and_then(|value| non_empty(Some(value)));
        return EndpointInfo {
            kind: endpoint_kind_for_provider(&provider.provider_type, &base_url),
            base_url,
            api_version: provider.api_version.map(ToString::to_string),
            project: provider.project.map(ToString::to_string),
            location: provider.location.map(ToString::to_string),
            region: provider.region.map(ToString::to_string),
        };
    }

    EndpointInfo {
        kind: EndpointKind::ProviderBaseUrl,
        base_url: None,
        api_version: None,
        project: None,
        location: None,
        region: None,
    }
}

fn endpoint_kind_for_provider(provider_type: &str, base_url: &Option<String>) -> EndpointKind {
    if base_url.as_deref().is_some_and(is_local_base_url) {
        return EndpointKind::Local;
    }
    match normalize_token(provider_type).as_deref() {
        Some("openai")
        | Some("openai_response")
        | Some("openai_responses")
        | Some("codex")
        | Some("newapi")
        | Some("new_api")
        | Some("gateway")
        | Some("fal") => EndpointKind::OpenaiCompatible,
        _ => EndpointKind::ProviderBaseUrl,
    }
}

fn auth_ref(
    selection: &ModelRouteSelection<'_>,
    provider: Option<&ModelRouteProvider<'_>>,
    direct_config: Option<&DirectRouteConfig<'_>>,
) -> AuthMaterialRef {
    if let Some(config) = direct_config {
        return AuthMaterialRef {
            kind: if config.api_key_present {
                AuthKind::DirectApiKey
            } else {
                AuthKind::NoAuth
            },
            provider_id: Some(selection.provider_id.to_string()),
            credential_ref: config
                .credential_ref
                .and_then(|value| non_empty(Some(value))),
            header_name: Some("Authorization".to_string()),
            header_prefix: Some("Bearer".to_string()),
        };
    }

    if let Some(provider) = provider {
        return AuthMaterialRef {
            kind: if provider.credential_ref.is_some() {
                AuthKind::ApiKeyRef
            } else {
                AuthKind::NoAuth
            },
            provider_id: Some(provider.provider_id.to_string()),
            credential_ref: provider.credential_ref.clone(),
            header_name: Some(provider.auth_header.to_string()),
            header_prefix: provider.auth_prefix.map(ToString::to_string),
        };
    }

    AuthMaterialRef {
        kind: AuthKind::NoAuth,
        provider_id: Some(selection.provider_id.to_string()),
        credential_ref: None,
        header_name: None,
        header_prefix: None,
    }
}

fn route_defaults(
    selection: &ModelRouteSelection<'_>,
    provider: Option<&ModelRouteProvider<'_>>,
    direct_config: Option<&DirectRouteConfig<'_>>,
) -> RouteDefaults {
    RouteDefaults {
        reasoning_effort: selection.reasoning_effort.map(ToString::to_string),
        prompt_cache_mode: provider.and_then(|provider| provider.prompt_cache_mode.clone()),
        toolshim: direct_config.map(|config| config.toolshim),
        toolshim_model: direct_config
            .and_then(|config| config.toolshim_model)
            .map(ToString::to_string),
    }
}

fn capability_snapshot(routing_payload: &Value) -> CapabilitySnapshot {
    let registry = routing_payload
        .get("modelRegistry")
        .or_else(|| routing_payload.get("model_registry"));
    let model_capabilities = registry
        .and_then(|value| value.get("modelCapabilities"))
        .or_else(|| registry.and_then(|value| value.get("model_capabilities")));
    let mut snapshot =
        capability_snapshot_from_model_capabilities(model_capabilities.unwrap_or(&Value::Null));
    snapshot.source = registry.and_then(|value| string_field(value, &["source"]));
    snapshot.reason_code =
        registry.and_then(|value| string_field(value, &["reasonCode", "reason_code"]));
    snapshot
}

fn routing_decision(routing_payload: &Value) -> RoutingDecision {
    let fallback_chain = string_array_field(routing_payload, &["fallbackChain", "fallback_chain"]);
    let routing_attempts = routing_payload
        .get("routingAttempts")
        .or_else(|| routing_payload.get("routing_attempts"))
        .and_then(Value::as_array)
        .map(|items| items.len() as u32)
        .unwrap_or(0);
    RoutingDecision {
        routing_mode: string_field(routing_payload, &["routingMode", "routing_mode"])
            .unwrap_or_else(|| "profile_slot".to_string()),
        decision_source: string_field(routing_payload, &["decisionSource", "decision_source"])
            .unwrap_or_else(|| "runtime_selection".to_string()),
        decision_reason: string_field(routing_payload, &["decisionReason", "decision_reason"])
            .unwrap_or_default(),
        settings_source: string_field(routing_payload, &["settingsSource", "settings_source"]),
        service_model_slot: string_field(
            routing_payload,
            &["serviceModelSlot", "service_model_slot"],
        ),
        fallback_chain,
        candidate_count: if routing_attempts > 0 {
            routing_attempts
        } else {
            1
        },
        capability_gap: string_field(routing_payload, &["capabilityGap", "capability_gap"]),
    }
}

fn route_failure(selection: &ModelRouteSelection<'_>, readiness: Option<&Value>) -> RouteFailure {
    let reason_code = readiness
        .and_then(|value| string_field(value, &["reasonCode", "reason_code"]))
        .unwrap_or_else(|| "routing_not_ready".to_string());
    RouteFailure {
        category: route_failure_category(&reason_code),
        reason_code: reason_code.clone(),
        message: Some(reason_code),
        provider_id: Some(selection.provider_id.to_string()),
        model_id: Some(selection.model_id.to_string()),
        capability_gap: None,
        retryable: false,
    }
}

fn capability_route_failure(
    selection: &ModelRouteSelection<'_>,
    capability_gap: String,
) -> RouteFailure {
    RouteFailure {
        category: RouteFailureCategory::CapabilityGap,
        reason_code: "capability_gap".to_string(),
        message: Some(format!("model capability gap: {capability_gap}")),
        provider_id: Some(selection.provider_id.to_string()),
        model_id: Some(selection.model_id.to_string()),
        capability_gap: Some(capability_gap),
        retryable: false,
    }
}

fn route_failure_category(reason_code: &str) -> RouteFailureCategory {
    match reason_code {
        "provider_disabled" => RouteFailureCategory::ProviderDisabled,
        "missing_enabled_api_key" => RouteFailureCategory::MissingCredential,
        "provider_not_chat_capable" => RouteFailureCategory::CapabilityGap,
        "provider_not_configured" => RouteFailureCategory::ProviderNeedsSetup,
        _ => RouteFailureCategory::ProviderNeedsSetup,
    }
}

fn has_declared_capability_snapshot(routing_payload: &Value) -> bool {
    routing_payload
        .get("modelRegistry")
        .or_else(|| routing_payload.get("model_registry"))
        .and_then(|registry| {
            registry
                .get("modelCapabilities")
                .or_else(|| registry.get("model_capabilities"))
        })
        .is_some_and(Value::is_object)
}

fn framing_for_protocol(protocol: &ProtocolKind) -> FramingKind {
    match protocol {
        ProtocolKind::OllamaChat => FramingKind::Ndjson,
        ProtocolKind::Unknown => FramingKind::Json,
        _ => FramingKind::Sse,
    }
}

fn is_local_base_url(value: &str) -> bool {
    let value = value.trim().to_ascii_lowercase();
    value.starts_with("http://127.0.0.1")
        || value.starts_with("http://localhost")
        || value.starts_with("http://[::1]")
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .and_then(|value| non_empty(Some(value)))
}

fn string_array_field(value: &Value, keys: &[&str]) -> Vec<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .filter_map(|value| non_empty(Some(value)))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model_task::{build_model_task_request, ModelTaskRequestInput};
    use app_server_protocol::{ModelTaskKind, ModelTaskSource};
    use serde_json::json;

    #[test]
    fn image_task_route_preserves_task_model_ref_and_reports_capability_gap() {
        let task_request = build_model_task_request(ModelTaskRequestInput {
            task_kind: ModelTaskKind::ImageGenerate,
            source: ModelTaskSource::MediaTaskArtifact,
            provider_id: Some("openai".to_string()),
            model_id: Some("text-only".to_string()),
            model_ref_source: ModelRefSource::Task,
            modality_contract_key: Some("image_generation".to_string()),
            routing_slot: Some("image_generation_model".to_string()),
            task_families: vec!["image_generation".to_string()],
            input_modalities: vec!["text".to_string()],
            output_modalities: vec!["image".to_string()],
            runtime_features: Vec::new(),
            capabilities: vec!["image_generation".to_string()],
            session_id: None,
            thread_id: None,
            turn_id: None,
            content_id: None,
            trace_id: None,
        });
        let routing_payload = json!({
            "providerReadiness": {
                "ready": true,
                "status": "ready"
            },
            "routingMode": "task_route",
            "decisionSource": "media_task_artifact",
            "decisionReason": "explicit_task_model",
            "serviceModelSlot": "image_generation_model",
            "modelRegistry": {
                "source": "provider_declared_model",
                "reasonCode": "matched_provider_custom_models",
                "modelCapabilities": {
                    "capabilities": {
                        "vision": false,
                        "streaming": true
                    },
                    "taskFamilies": ["chat"],
                    "inputModalities": ["text"],
                    "outputModalities": ["text"],
                    "runtimeFeatures": ["streaming"]
                }
            }
        });

        let route = resolved_route_from_task(
            &task_request,
            ModelRouteSelection {
                provider_id: "openai",
                model_id: "text-only",
                model_ref_source: ModelRefSource::Task,
                reasoning_effort: None,
            },
            &routing_payload,
            None,
            None,
        );

        assert_eq!(route.model_ref.source, ModelRefSource::Task);
        assert_eq!(
            route.model_ref.routing_slot.as_deref(),
            Some("image_generation_model")
        );
        assert_eq!(route.decision.routing_mode, "task_route");
        assert_eq!(
            route.decision.capability_gap.as_deref(),
            Some("task_family:image_generation")
        );
        let failure = route.failure.expect("capability gap");
        assert_eq!(failure.category, RouteFailureCategory::CapabilityGap);
        assert_eq!(
            failure.capability_gap.as_deref(),
            Some("task_family:image_generation")
        );
    }

    #[test]
    fn image_task_route_uses_openai_images_protocol_for_images_api_feature() {
        let task_request = build_model_task_request(ModelTaskRequestInput {
            task_kind: ModelTaskKind::ImageGenerate,
            source: ModelTaskSource::MediaTaskArtifact,
            provider_id: Some("openai".to_string()),
            model_id: Some("gpt-image-2".to_string()),
            model_ref_source: ModelRefSource::Task,
            modality_contract_key: Some("image_generation".to_string()),
            routing_slot: Some("image_generation_model".to_string()),
            task_families: vec!["image_generation".to_string()],
            input_modalities: vec!["text".to_string()],
            output_modalities: vec!["image".to_string()],
            runtime_features: Vec::new(),
            capabilities: vec!["image_generation".to_string()],
            session_id: None,
            thread_id: None,
            turn_id: None,
            content_id: None,
            trace_id: None,
        });
        let route = resolved_route_from_task(
            &task_request,
            ModelRouteSelection {
                provider_id: "openai",
                model_id: "gpt-image-2",
                model_ref_source: ModelRefSource::Task,
                reasoning_effort: None,
            },
            &json!({
                "providerReadiness": {
                    "ready": true,
                    "status": "ready"
                },
                "routingMode": "task_route",
                "decisionSource": "media_task_artifact",
                "decisionReason": "explicit_task_model",
                "serviceModelSlot": "image_generation_model",
                "modelRegistry": {
                    "source": "api",
                    "reasonCode": "matched_media_task_model",
                    "modelCapabilities": {
                        "taskFamilies": ["image_generation"],
                        "inputModalities": ["text"],
                        "outputModalities": ["image"],
                        "runtimeFeatures": ["images_api"],
                        "capabilities": {
                            "vision": false
                        }
                    }
                }
            }),
            None,
            None,
        );

        assert_eq!(route.protocol, ProtocolKind::OpenaiImages);
        assert!(route.failure.is_none());
    }

    #[test]
    fn image_task_route_uses_openai_responses_protocol_for_responses_feature() {
        let task_request = build_model_task_request(ModelTaskRequestInput {
            task_kind: ModelTaskKind::ImageGenerate,
            source: ModelTaskSource::MediaTaskArtifact,
            provider_id: Some("openai-responses".to_string()),
            model_id: Some("gpt-images-2".to_string()),
            model_ref_source: ModelRefSource::Task,
            modality_contract_key: Some("image_generation".to_string()),
            routing_slot: Some("image_generation_model".to_string()),
            task_families: vec!["image_generation".to_string()],
            input_modalities: vec!["text".to_string()],
            output_modalities: vec!["image".to_string()],
            runtime_features: Vec::new(),
            capabilities: vec!["image_generation".to_string()],
            session_id: None,
            thread_id: None,
            turn_id: None,
            content_id: None,
            trace_id: None,
        });
        let route = resolved_route_from_task(
            &task_request,
            ModelRouteSelection {
                provider_id: "openai-responses",
                model_id: "gpt-images-2",
                model_ref_source: ModelRefSource::Task,
                reasoning_effort: None,
            },
            &json!({
                "providerReadiness": {
                    "ready": true,
                    "status": "ready"
                },
                "routingMode": "task_route",
                "decisionSource": "media_task_artifact",
                "decisionReason": "explicit_task_model",
                "serviceModelSlot": "image_generation_model",
                "modelRegistry": {
                    "source": "api",
                    "reasonCode": "matched_media_task_model",
                    "modelCapabilities": {
                        "taskFamilies": ["image_generation"],
                        "inputModalities": ["text"],
                        "outputModalities": ["image"],
                        "runtimeFeatures": ["responses_api"],
                        "capabilities": {
                            "vision": false
                        }
                    }
                }
            }),
            None,
            None,
        );

        assert_eq!(route.protocol, ProtocolKind::OpenaiResponses);
        assert!(route.failure.is_none());
    }

    #[test]
    fn chat_task_route_uses_responses_protocol_when_runtime_feature_declares_it() {
        let task_request = build_model_task_request(ModelTaskRequestInput {
            task_kind: ModelTaskKind::Chat,
            source: ModelTaskSource::AgentTurn,
            provider_id: Some("openai".to_string()),
            model_id: Some("gpt-4.1".to_string()),
            model_ref_source: ModelRefSource::Task,
            modality_contract_key: Some("chat".to_string()),
            routing_slot: Some("coding".to_string()),
            task_families: vec!["chat".to_string()],
            input_modalities: vec!["text".to_string()],
            output_modalities: vec!["text".to_string()],
            runtime_features: vec!["streaming".to_string()],
            capabilities: vec!["streaming".to_string()],
            session_id: None,
            thread_id: None,
            turn_id: None,
            content_id: None,
            trace_id: None,
        });
        let route = resolved_route_from_task(
            &task_request,
            ModelRouteSelection {
                provider_id: "openai",
                model_id: "gpt-4.1",
                model_ref_source: ModelRefSource::Task,
                reasoning_effort: None,
            },
            &json!({
                "providerReadiness": {
                    "ready": true,
                    "status": "ready"
                },
                "routingMode": "task_route",
                "decisionSource": "runtime_selection",
                "decisionReason": "explicit_task_model",
                "serviceModelSlot": "coding",
                "modelRegistry": {
                    "source": "api",
                    "reasonCode": "matched_model",
                    "modelCapabilities": {
                        "taskFamilies": ["chat"],
                        "inputModalities": ["text"],
                        "outputModalities": ["text"],
                        "runtimeFeatures": ["responses_api", "streaming"],
                        "capabilities": {
                            "vision": false,
                            "streaming": true
                        }
                    }
                }
            }),
            None,
            None,
        );

        assert_eq!(route.protocol, ProtocolKind::OpenaiResponses);
        assert!(route.failure.is_none());
    }
}
