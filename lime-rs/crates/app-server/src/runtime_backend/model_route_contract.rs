use super::request_context::RuntimeModelSelection;
use crate::model_route_assembly::{
    resolved_route_from_task, DirectRouteConfig, ModelRouteSelection,
};
use crate::model_task_contract::{build_model_task_request, ModelTaskRequestInput};
use crate::ExecutionRequest;
use app_server_protocol::{
    ModelRefSource, ModelTaskKind, ModelTaskRequest, ModelTaskSource, ResolvedModelRoute,
};
use lime_agent::{route_protocol_from_provider_config, ProviderConfig};
use lime_core::database::dao::api_key_provider::ProviderWithKeys;
use serde_json::Value;

pub(super) fn chat_task_request_from_runtime(
    request: &ExecutionRequest,
    selection: &RuntimeModelSelection,
    routing_payload: &Value,
) -> ModelTaskRequest {
    let routing_slot = string_field(routing_payload, &["serviceModelSlot", "service_model_slot"])
        .unwrap_or_else(|| "coding".to_string());
    let mut task_families = vec!["chat".to_string()];
    let mut input_modalities = vec!["text".to_string()];
    let output_modalities = vec!["text".to_string()];
    let runtime_features = vec!["streaming".to_string()];
    let mut capabilities = string_array_field(
        routing_payload,
        &["requiredCapabilities", "required_capabilities"],
    );

    if request
        .input
        .attachments
        .iter()
        .any(|attachment| attachment.kind.eq_ignore_ascii_case("image"))
    {
        push_unique(&mut task_families, "vision_understanding".to_string());
        push_unique(&mut input_modalities, "image".to_string());
        push_unique(&mut capabilities, "vision".to_string());
    }
    push_unique(&mut capabilities, "streaming".to_string());

    build_model_task_request(ModelTaskRequestInput {
        task_kind: ModelTaskKind::Chat,
        source: ModelTaskSource::AgentTurn,
        provider_id: Some(selection.provider.clone()),
        model_id: Some(selection.model.clone()),
        model_ref_source: model_ref_source(selection.source),
        modality_contract_key: Some("chat".to_string()),
        routing_slot: Some(routing_slot),
        task_families,
        input_modalities,
        output_modalities,
        runtime_features,
        capabilities,
        session_id: Some(request.session.session_id.clone()),
        thread_id: non_empty(Some(&request.turn.thread_id))
            .or_else(|| non_empty(Some(&request.session.thread_id))),
        turn_id: Some(request.turn.turn_id.clone()),
        content_id: None,
        trace_id: None,
    })
}

pub(super) fn resolved_route_from_runtime(
    task_request: &ModelTaskRequest,
    selection: &RuntimeModelSelection,
    routing_payload: &Value,
    provider: Option<&ProviderWithKeys>,
    direct_provider_config: Option<&ProviderConfig>,
) -> ResolvedModelRoute {
    resolved_route_from_task(
        task_request,
        ModelRouteSelection {
            provider_id: &selection.provider,
            model_id: &selection.model,
            model_ref_source: model_ref_source(selection.source),
            reasoning_effort: selection.reasoning_effort.as_deref(),
        },
        routing_payload,
        provider,
        direct_provider_config.map(direct_route_config),
    )
}

fn model_ref_source(source: &str) -> ModelRefSource {
    match source {
        "runtime_options" => ModelRefSource::RuntimeOptions,
        "host_options_provider_config" => ModelRefSource::HostOptions,
        "profile_model_slot" => ModelRefSource::ProfileSlot,
        "session_default" => ModelRefSource::SessionDefault,
        "direct_provider_config" => ModelRefSource::DirectProviderConfig,
        _ => ModelRefSource::Explicit,
    }
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn direct_route_config(config: &ProviderConfig) -> DirectRouteConfig<'_> {
    DirectRouteConfig {
        provider_name: &config.provider_name,
        api_key_present: config
            .api_key
            .as_deref()
            .is_some_and(|key| !key.trim().is_empty()),
        base_url: config.base_url.as_deref(),
        credential_ref: config.credential_uuid.as_deref(),
        protocol: route_protocol_from_provider_config(config),
        toolshim: config.toolshim,
        toolshim_model: config.toolshim_model.as_deref(),
    }
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
    use crate::runtime_backend::tests::request_for_test;
    use app_server_protocol::RouteFailureCategory;
    use serde_json::json;

    #[test]
    fn chat_task_request_adds_vision_requirement_for_image_attachments() {
        let mut request = request_for_test("看图", None, None);
        request
            .input
            .attachments
            .push(app_server_protocol::AgentAttachment {
                kind: "image".to_string(),
                uri: Some("file:///tmp/poster.png".to_string()),
                metadata: None,
            });
        let selection = RuntimeModelSelection {
            provider: "openai".to_string(),
            model: "gpt-4.1".to_string(),
            source: "runtime_options",
            reasoning_effort: None,
        };
        let task_request = chat_task_request_from_runtime(
            &request,
            &selection,
            &json!({
                "serviceModelSlot": "coding",
                "requiredCapabilities": ["tools", "streaming"]
            }),
        );

        assert_eq!(task_request.task_kind, ModelTaskKind::Chat);
        assert!(task_request
            .requirements
            .task_families
            .contains(&"vision_understanding".to_string()));
        assert!(task_request
            .requirements
            .input_modalities
            .contains(&"image".to_string()));
        assert!(task_request
            .requirements
            .capabilities
            .contains(&"vision".to_string()));
    }

    #[test]
    fn resolved_route_reports_capability_gap_for_image_input_without_vision() {
        let mut request = request_for_test("看图", None, None);
        request
            .input
            .attachments
            .push(app_server_protocol::AgentAttachment {
                kind: "image".to_string(),
                uri: Some("file:///tmp/poster.png".to_string()),
                metadata: None,
            });
        let selection = RuntimeModelSelection {
            provider: "openai".to_string(),
            model: "text-only".to_string(),
            source: "runtime_options",
            reasoning_effort: None,
        };
        let routing_payload = json!({
            "providerReadiness": {
                "ready": true,
                "status": "ready"
            },
            "serviceModelSlot": "coding",
            "modelRegistry": {
                "source": "api",
                "reasonCode": "matched",
                "modelCapabilities": {
                    "capabilities": {
                        "vision": false,
                        "tools": true,
                        "streaming": true
                    },
                    "taskFamilies": ["chat"],
                    "inputModalities": ["text"],
                    "outputModalities": ["text"],
                    "runtimeFeatures": ["streaming", "tool_calling"]
                }
            }
        });
        let task_request = chat_task_request_from_runtime(&request, &selection, &routing_payload);
        let route =
            resolved_route_from_runtime(&task_request, &selection, &routing_payload, None, None);

        let failure = route.failure.expect("capability failure");
        assert_eq!(failure.category, RouteFailureCategory::CapabilityGap);
        assert_eq!(failure.reason_code, "capability_gap");
        assert_eq!(
            failure.capability_gap.as_deref(),
            Some("task_family:vision_understanding")
        );
        assert_eq!(
            route.decision.capability_gap.as_deref(),
            Some("task_family:vision_understanding")
        );
    }

    #[test]
    fn resolved_route_does_not_block_unknown_capability_snapshot() {
        let selection = RuntimeModelSelection {
            provider: "fixture-openai".to_string(),
            model: "fixture-model".to_string(),
            source: "host_options_provider_config",
            reasoning_effort: None,
        };
        let task_request = build_model_task_request(ModelTaskRequestInput {
            task_kind: ModelTaskKind::Chat,
            source: ModelTaskSource::AgentTurn,
            provider_id: Some(selection.provider.clone()),
            model_id: Some(selection.model.clone()),
            model_ref_source: ModelRefSource::HostOptions,
            modality_contract_key: Some("chat".to_string()),
            routing_slot: Some("coding".to_string()),
            task_families: vec!["chat".to_string(), "vision_understanding".to_string()],
            input_modalities: vec!["text".to_string(), "image".to_string()],
            output_modalities: vec!["text".to_string()],
            runtime_features: vec!["streaming".to_string()],
            capabilities: vec!["vision".to_string(), "streaming".to_string()],
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
            "modelRegistry": {
                "source": "direct_provider_config",
                "reasonCode": "direct_provider_config_not_in_registry",
                "modelCapabilities": null
            }
        });
        let route =
            resolved_route_from_runtime(&task_request, &selection, &routing_payload, None, None);

        assert!(route.failure.is_none());
        assert!(route.decision.capability_gap.is_none());
    }
}
