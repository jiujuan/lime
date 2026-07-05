use app_server_protocol::{ModelTaskKind, ResolvedModelRoute};
use serde_json::{json, Value};

pub(crate) fn media_route_execution_binding(
    payload: &Value,
    route: &ResolvedModelRoute,
) -> Option<Value> {
    let task_kind = task_kind_from_payload(payload)?;
    let binding = local_service_binding_for_task(task_kind)?;
    let provider_id = non_empty(Some(&route.model_ref.provider_id))?;
    let model_id = non_empty(Some(&route.model_ref.model_id))?;
    let protocol = serde_json::to_value(&route.protocol).unwrap_or_else(|_| json!("unknown"));

    Some(json!({
        "version": 1,
        "status": "ready",
        "executionOwner": "media_runtime_worker",
        "executor": {
            "kind": "local_lime_service",
            "bindingKey": binding.binding_key,
            "endpointSource": "runner_config",
            "method": "POST",
            "path": binding.path,
            "routeHeader": "X-Provider-Id"
        },
        "credentialResolver": {
            "owner": "local_lime_service",
            "source": "api_key_provider_store",
            "providerId": provider_id,
            "credentialRef": route.auth.credential_ref,
            "secretMaterialStatus": "not_embedded",
            "authHeaderName": route.auth.header_name,
            "authHeaderPrefix": route.auth.header_prefix
        },
        "route": {
            "providerId": provider_id,
            "modelId": model_id,
            "protocol": protocol
        }
    }))
}

struct LocalServiceBinding {
    binding_key: &'static str,
    path: &'static str,
}

fn local_service_binding_for_task(task_kind: ModelTaskKind) -> Option<LocalServiceBinding> {
    match task_kind {
        ModelTaskKind::ImageGenerate => Some(LocalServiceBinding {
            binding_key: "local_lime_service:/v1/images/generations",
            path: "/v1/images/generations",
        }),
        ModelTaskKind::VideoGenerate => Some(LocalServiceBinding {
            binding_key: "local_lime_service:/v1/videos/generations",
            path: "/v1/videos/generations",
        }),
        _ => None,
    }
}

fn task_kind_from_payload(payload: &Value) -> Option<ModelTaskKind> {
    let value = payload
        .pointer("/model_task_request/taskKind")
        .or_else(|| payload.pointer("/modelTaskRequest/taskKind"))
        .and_then(Value::as_str)?;
    serde_json::from_value(json!(value)).ok()
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::{
        AuthKind, AuthMaterialRef, CapabilitySnapshot, EndpointInfo, EndpointKind, FramingKind,
        ModelRef, ModelRefSource, ProtocolKind, RouteDefaults, RoutingDecision, TransportKind,
    };

    #[test]
    fn image_route_execution_binding_delegates_credentials_to_local_service() {
        let route = ResolvedModelRoute {
            model_ref: ModelRef {
                provider_id: "openai-images".to_string(),
                model_id: "gpt-image-2".to_string(),
                variant: None,
                routing_slot: Some("image_generation_model".to_string()),
                source: ModelRefSource::Task,
            },
            protocol: ProtocolKind::OpenaiImages,
            endpoint: EndpointInfo {
                kind: EndpointKind::OpenaiCompatible,
                base_url: Some("https://api.openai.com/v1".to_string()),
                api_version: None,
                project: None,
                location: None,
                region: None,
            },
            auth: AuthMaterialRef {
                kind: AuthKind::ApiKeyRef,
                provider_id: Some("openai-images".to_string()),
                credential_ref: Some("runtime-api-key-key-1".to_string()),
                header_name: Some("Authorization".to_string()),
                header_prefix: Some("Bearer".to_string()),
            },
            transport: TransportKind::Http,
            framing: FramingKind::Json,
            defaults: RouteDefaults::default(),
            capability_snapshot: CapabilitySnapshot::default(),
            decision: RoutingDecision {
                routing_mode: "task_route".to_string(),
                decision_source: "media_task_artifact".to_string(),
                decision_reason: "explicit_task_model".to_string(),
                settings_source: None,
                service_model_slot: Some("image_generation_model".to_string()),
                fallback_chain: Vec::new(),
                candidate_count: 1,
                capability_gap: None,
            },
            failure: None,
        };

        let binding = media_route_execution_binding(
            &json!({
                "model_task_request": {
                    "taskKind": "image_generate"
                }
            }),
            &route,
        )
        .expect("binding");

        assert_eq!(
            binding["executor"]["bindingKey"].as_str(),
            Some("local_lime_service:/v1/images/generations")
        );
        assert_eq!(
            binding["credentialResolver"]["owner"].as_str(),
            Some("local_lime_service")
        );
        assert_eq!(
            binding["credentialResolver"]["secretMaterialStatus"].as_str(),
            Some("not_embedded")
        );
        assert_eq!(
            binding["credentialResolver"]["credentialRef"].as_str(),
            Some("runtime-api-key-key-1")
        );
        assert_eq!(
            binding["credentialResolver"]["authHeaderName"].as_str(),
            Some("Authorization")
        );
        assert_eq!(
            binding["credentialResolver"]["authHeaderPrefix"].as_str(),
            Some("Bearer")
        );
        assert!(binding["executor"].get("baseUrl").is_none());
    }
}
