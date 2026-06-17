use serde_json::{json, Value};

const LOCAL_LIME_SERVICE_EXECUTOR_KIND: &str = "local_lime_service";
const RUNNER_CONFIG_ENDPOINT_SOURCE: &str = "runner_config";
const LOCAL_LIME_SERVICE_CREDENTIAL_OWNER: &str = "local_lime_service";
const SECRET_NOT_EMBEDDED_STATUS: &str = "not_embedded";

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct ResolvedModelRouteProjection {
    pub(crate) provider_id: Option<String>,
    pub(crate) model_id: Option<String>,
    pub(crate) protocol: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ModelRouteFailureProjection {
    pub(crate) code: String,
    pub(crate) message: String,
    pub(crate) retryable: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct RoutePayloadPreflight {
    pub(crate) payload_patch: Option<Value>,
    pub(crate) failure: Option<ModelRouteFailureProjection>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LocalRouteExecutionSpec {
    pub(crate) binding_key: &'static str,
    pub(crate) path: &'static str,
    pub(crate) task_label: &'static str,
}

pub(crate) fn image_generation_local_execution_spec() -> LocalRouteExecutionSpec {
    LocalRouteExecutionSpec {
        binding_key: "local_lime_service:/v1/images/generations",
        path: "/v1/images/generations",
        task_label: "图片生成",
    }
}

pub(crate) fn video_generation_local_execution_spec() -> LocalRouteExecutionSpec {
    LocalRouteExecutionSpec {
        binding_key: "local_lime_service:/v1/videos/generations",
        path: "/v1/videos/generations",
        task_label: "视频生成",
    }
}

pub(crate) fn image_route_payload_preflight(payload: &Value) -> RoutePayloadPreflight {
    route_payload_preflight(
        payload,
        &image_generation_local_execution_spec(),
        supports_image_generation_route_protocol,
    )
}

pub(crate) fn video_route_payload_preflight(payload: &Value) -> RoutePayloadPreflight {
    route_payload_preflight(
        payload,
        &video_generation_local_execution_spec(),
        supports_video_generation_route_protocol,
    )
}

pub(crate) fn resolved_model_route_from_payload(
    payload: &Value,
) -> Option<ResolvedModelRouteProjection> {
    let route = resolved_route_value(payload)?;
    let model_ref = object_field(route, &["modelRef", "model_ref"]);
    let auth = object_field(route, &["auth"]);
    let provider = object_field(route, &["provider"]);
    let model = object_field(route, &["model"]);

    let provider_id = model_ref
        .and_then(|value| string_field(value, &["providerId", "provider_id"]))
        .or_else(|| auth.and_then(|value| string_field(value, &["providerId", "provider_id"])))
        .or_else(|| provider.and_then(|value| string_field(value, &["id"])));
    let model_id = model_ref
        .and_then(|value| string_field(value, &["modelId", "model_id"]))
        .or_else(|| model.and_then(|value| string_field(value, &["id"])));
    let protocol = string_field(route, &["protocol"]);

    if provider_id.is_none() && model_id.is_none() && protocol.is_none() {
        return None;
    }

    Some(ResolvedModelRouteProjection {
        provider_id,
        model_id,
        protocol,
    })
}

pub(crate) fn route_failure_from_payload(payload: &Value) -> Option<ModelRouteFailureProjection> {
    let failure = route_failure_value(payload);
    let code = failure
        .and_then(|value| string_field(value, &["reasonCode", "reason_code"]))
        .or_else(|| string_field(payload, &["failure_code", "failureCode"]))
        .or_else(|| failure.and_then(|value| string_field(value, &["category"])))?;
    let category = failure
        .and_then(|value| string_field(value, &["category"]))
        .or_else(|| string_field(payload, &["failure_category", "failureCategory"]));
    let capability_gap = failure
        .and_then(|value| string_field(value, &["capabilityGap", "capability_gap"]))
        .or_else(|| string_field(payload, &["capability_gap", "capabilityGap"]));
    let message = failure
        .and_then(|value| string_field(value, &["message"]))
        .unwrap_or_else(|| route_failure_message(&code, category.as_deref(), capability_gap));
    let retryable = failure
        .and_then(|value| bool_field(value, &["retryable"]))
        .unwrap_or(false);

    Some(ModelRouteFailureProjection {
        code,
        message,
        retryable,
    })
}

pub(crate) fn local_route_execution_patch_from_payload(
    payload: &Value,
    spec: &LocalRouteExecutionSpec,
) -> Option<Value> {
    resolved_model_route_from_payload(payload)?;
    if route_failure_from_payload(payload).is_some() {
        return None;
    }
    if route_execution_value(payload).is_some() {
        return None;
    }

    let binding = build_local_route_execution_binding(payload, spec)?;
    Some(json!({
        "model_route_execution": binding.clone(),
        "modelRouteExecution": binding
    }))
}

pub(crate) fn route_execution_failure_from_payload(
    payload: &Value,
    spec: &LocalRouteExecutionSpec,
) -> Option<ModelRouteFailureProjection> {
    let route = resolved_model_route_from_payload(payload)?;
    let Some(execution) = route_execution_value(payload) else {
        return Some(unsupported_route_execution_failure(
            spec,
            "缺少模型路由执行绑定",
        ));
    };

    let executor = object_field(execution, &["executor"]);
    let credential_resolver =
        object_field(execution, &["credentialResolver", "credential_resolver"]);
    let execution_route = object_field(execution, &["route"]);
    let executor_kind = executor.and_then(|value| string_field(value, &["kind"]));
    if normalized_token(executor_kind.as_deref()) != Some(LOCAL_LIME_SERVICE_EXECUTOR_KIND.into()) {
        return Some(unsupported_route_execution_failure(
            spec,
            "执行器必须是本地 Lime 服务",
        ));
    }

    let binding_key =
        executor.and_then(|value| string_field(value, &["bindingKey", "binding_key"]));
    if binding_key.as_deref() != Some(spec.binding_key) {
        return Some(unsupported_route_execution_failure(
            spec,
            "执行绑定与当前媒体任务不匹配",
        ));
    }

    let endpoint_source =
        executor.and_then(|value| string_field(value, &["endpointSource", "endpoint_source"]));
    if normalized_token(endpoint_source.as_deref()) != Some(RUNNER_CONFIG_ENDPOINT_SOURCE.into()) {
        return Some(unsupported_route_execution_failure(
            spec,
            "执行 endpoint 必须来自 runner config",
        ));
    }

    let credential_owner = credential_resolver.and_then(|value| string_field(value, &["owner"]));
    if normalized_token(credential_owner.as_deref())
        != Some(LOCAL_LIME_SERVICE_CREDENTIAL_OWNER.into())
    {
        return Some(unsupported_route_execution_failure(
            spec,
            "凭证解析 owner 必须是本地 Lime 服务",
        ));
    }

    let secret_status = credential_resolver
        .and_then(|value| string_field(value, &["secretMaterialStatus", "secret_material_status"]));
    if normalized_token(secret_status.as_deref()) != Some(SECRET_NOT_EMBEDDED_STATUS.into())
        || credential_resolver_has_embedded_secret(credential_resolver)
    {
        return Some(unsupported_route_execution_failure(
            spec,
            "执行绑定不能携带明文凭证",
        ));
    }

    if let Some(provider_id) =
        execution_route.and_then(|value| string_field(value, &["providerId", "provider_id"]))
    {
        if route.provider_id.as_deref() != Some(provider_id.as_str()) {
            return Some(unsupported_route_execution_failure(
                spec,
                "执行绑定 provider 与 resolved route 不一致",
            ));
        }
    }

    if let Some(model_id) =
        execution_route.and_then(|value| string_field(value, &["modelId", "model_id"]))
    {
        if route.model_id.as_deref() != Some(model_id.as_str()) {
            return Some(unsupported_route_execution_failure(
                spec,
                "执行绑定 model 与 resolved route 不一致",
            ));
        }
    }

    if let Some(protocol) = execution_route.and_then(|value| string_field(value, &["protocol"])) {
        if normalized_token(route.protocol.as_deref()) != normalized_token(Some(&protocol)) {
            return Some(unsupported_route_execution_failure(
                spec,
                "执行绑定 protocol 与 resolved route 不一致",
            ));
        }
    }

    None
}

fn route_payload_preflight(
    payload: &Value,
    spec: &LocalRouteExecutionSpec,
    supports_protocol: fn(Option<&str>) -> bool,
) -> RoutePayloadPreflight {
    if let Some(failure) = route_failure_from_payload(payload) {
        return RoutePayloadPreflight {
            payload_patch: None,
            failure: Some(failure),
        };
    }

    let Some(route) = resolved_model_route_from_payload(payload) else {
        return RoutePayloadPreflight::default();
    };

    if !supports_protocol(route.protocol.as_deref()) {
        return RoutePayloadPreflight {
            payload_patch: None,
            failure: Some(unsupported_protocol_failure(
                route.protocol.as_deref(),
                spec.task_label,
            )),
        };
    }

    if route_execution_value(payload).is_none() {
        if let Some(payload_patch) = local_route_execution_patch_from_payload(payload, spec) {
            return RoutePayloadPreflight {
                payload_patch: Some(payload_patch),
                failure: None,
            };
        }
    }

    RoutePayloadPreflight {
        payload_patch: None,
        failure: route_execution_failure_from_payload(payload, spec),
    }
}

pub(crate) fn image_executor_mode_from_route_protocol(
    protocol: Option<&str>,
) -> Option<&'static str> {
    match normalized_token(protocol)?.as_str() {
        "openai_responses" | "codex_responses" => Some("responses_image_generation"),
        "openai_images" | "fal" => Some("images_api"),
        _ => None,
    }
}

pub(crate) fn supports_image_generation_route_protocol(protocol: Option<&str>) -> bool {
    matches!(
        normalized_token(protocol).as_deref(),
        None | Some("openai_images" | "openai_responses" | "codex_responses" | "fal")
    )
}

pub(crate) fn supports_video_generation_route_protocol(protocol: Option<&str>) -> bool {
    matches!(normalized_token(protocol).as_deref(), None | Some("fal"))
}

pub(crate) fn unsupported_protocol_failure(
    protocol: Option<&str>,
    task: &str,
) -> ModelRouteFailureProjection {
    let protocol = protocol
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("unknown");
    ModelRouteFailureProjection {
        code: "unsupported_protocol".to_string(),
        message: format!("模型路由协议不支持当前{task}任务: {protocol}"),
        retryable: false,
    }
}

fn build_local_route_execution_binding(
    payload: &Value,
    spec: &LocalRouteExecutionSpec,
) -> Option<Value> {
    let route = resolved_model_route_from_payload(payload)?;
    let provider_id = route.provider_id?;
    let model_id = route.model_id?;
    let protocol = route.protocol.unwrap_or_else(|| "unknown".to_string());
    let auth = resolved_route_value(payload).and_then(|route| object_field(route, &["auth"]));
    let credential_ref =
        auth.and_then(|auth| string_field(auth, &["credentialRef", "credential_ref"]));
    let auth_header_name = auth.and_then(|auth| string_field(auth, &["headerName", "header_name"]));
    let auth_header_prefix =
        auth.and_then(|auth| string_field(auth, &["headerPrefix", "header_prefix"]));
    Some(json!({
        "version": 1,
        "status": "ready",
        "executionOwner": "media_runtime_worker",
        "executor": {
            "kind": LOCAL_LIME_SERVICE_EXECUTOR_KIND,
            "bindingKey": spec.binding_key,
            "endpointSource": RUNNER_CONFIG_ENDPOINT_SOURCE,
            "method": "POST",
            "path": spec.path,
            "routeHeader": "X-Provider-Id"
        },
        "credentialResolver": {
            "owner": LOCAL_LIME_SERVICE_CREDENTIAL_OWNER,
            "source": "api_key_provider_store",
            "providerId": provider_id,
            "credentialRef": credential_ref,
            "secretMaterialStatus": SECRET_NOT_EMBEDDED_STATUS,
            "authHeaderName": auth_header_name,
            "authHeaderPrefix": auth_header_prefix
        },
        "route": {
            "providerId": provider_id,
            "modelId": model_id,
            "protocol": protocol
        },
        "migration": {
            "source": "route_only_payload",
            "appliedBy": "media_runtime_worker"
        }
    }))
}

fn route_execution_value(payload: &Value) -> Option<&Value> {
    object_field(payload, &["model_route_execution", "modelRouteExecution"]).or_else(|| {
        object_field(payload, &["model_route_assessment", "modelRouteAssessment"])
            .and_then(|assessment| object_field(assessment, &["routeExecution", "route_execution"]))
    })
}

fn credential_resolver_has_embedded_secret(value: Option<&Value>) -> bool {
    let Some(value) = value else {
        return false;
    };
    [
        "secret",
        "apiKey",
        "api_key",
        "accessToken",
        "access_token",
        "authorization",
    ]
    .iter()
    .any(|key| value.get(*key).is_some_and(secret_value_present))
}

fn secret_value_present(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::String(value) => !value.trim().is_empty(),
        Value::Array(values) => values.iter().any(secret_value_present),
        Value::Object(values) => values.values().any(secret_value_present),
        _ => true,
    }
}

fn unsupported_route_execution_failure(
    spec: &LocalRouteExecutionSpec,
    reason: &str,
) -> ModelRouteFailureProjection {
    ModelRouteFailureProjection {
        code: "unsupported_route_execution".to_string(),
        message: format!(
            "模型路由执行绑定不支持当前{}任务: {reason}",
            spec.task_label
        ),
        retryable: false,
    }
}

fn route_failure_message(
    code: &str,
    category: Option<&str>,
    capability_gap: Option<String>,
) -> String {
    if code == "capability_gap" || category == Some("capability_gap") {
        return capability_gap
            .map(|gap| format!("模型能力不满足当前媒体任务要求: {gap}"))
            .unwrap_or_else(|| "模型能力不满足当前媒体任务要求".to_string());
    }

    match category {
        Some(category) if !category.is_empty() => {
            format!("模型路由不可用: {category} ({code})")
        }
        _ => format!("模型路由不可用: {code}"),
    }
}

fn resolved_route_value(payload: &Value) -> Option<&Value> {
    object_field(payload, &["resolved_route", "resolvedRoute"]).or_else(|| {
        object_field(payload, &["model_route_assessment", "modelRouteAssessment"])
            .and_then(|assessment| object_field(assessment, &["resolvedRoute", "resolved_route"]))
    })
}

fn route_failure_value(payload: &Value) -> Option<&Value> {
    object_field(payload, &["route_failure", "routeFailure"])
        .or_else(|| {
            resolved_route_value(payload).and_then(|route| object_field(route, &["failure"]))
        })
        .or_else(|| {
            object_field(payload, &["model_route_assessment", "modelRouteAssessment"])
                .and_then(|assessment| object_field(assessment, &["routeFailure", "route_failure"]))
        })
}

fn object_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find(|value| value.is_object())
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .and_then(normalize_string)
}

fn bool_field(value: &Value, keys: &[&str]) -> Option<bool> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_bool)
}

fn normalize_string(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn normalized_token(value: Option<&str>) -> Option<String> {
    normalize_string(value?).map(|value| value.to_ascii_lowercase().replace('-', "_"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn route_projection_reads_top_level_resolved_route() {
        let route = resolved_model_route_from_payload(&json!({
            "resolvedRoute": {
                "modelRef": {
                    "providerId": "openai-images",
                    "modelId": "gpt-image-2"
                },
                "protocol": "openai_images"
            }
        }))
        .expect("route");

        assert_eq!(route.provider_id.as_deref(), Some("openai-images"));
        assert_eq!(route.model_id.as_deref(), Some("gpt-image-2"));
        assert_eq!(route.protocol.as_deref(), Some("openai_images"));
    }

    #[test]
    fn route_projection_reads_nested_assessment_route() {
        let route = resolved_model_route_from_payload(&json!({
            "model_route_assessment": {
                "resolvedRoute": {
                    "modelRef": {
                        "providerId": "fal",
                        "modelId": "fal-ai/nano-banana-pro"
                    },
                    "protocol": "fal"
                }
            }
        }))
        .expect("route");

        assert_eq!(route.provider_id.as_deref(), Some("fal"));
        assert_eq!(route.model_id.as_deref(), Some("fal-ai/nano-banana-pro"));
        assert_eq!(
            image_executor_mode_from_route_protocol(route.protocol.as_deref()),
            Some("images_api")
        );
    }

    #[test]
    fn route_failure_reads_capability_gap_message() {
        let failure = route_failure_from_payload(&json!({
            "failure_code": "capability_gap",
            "route_failure": {
                "category": "capability_gap",
                "reasonCode": "capability_gap",
                "capabilityGap": "task_family:image_generation"
            }
        }))
        .expect("failure");

        assert_eq!(failure.code, "capability_gap");
        assert!(failure.message.contains("task_family:image_generation"));
        assert!(!failure.retryable);
    }

    #[test]
    fn protocol_support_rejects_chat_for_media_tasks() {
        assert!(supports_image_generation_route_protocol(Some(
            "openai_images"
        )));
        assert!(supports_video_generation_route_protocol(Some("fal")));
        assert!(!supports_image_generation_route_protocol(Some(
            "openai_chat"
        )));
        assert!(!supports_video_generation_route_protocol(Some(
            "openai_chat"
        )));
    }

    #[test]
    fn local_execution_patch_migrates_route_only_image_payload() {
        let patch = local_route_execution_patch_from_payload(
            &json!({
                "resolvedRoute": {
                    "modelRef": {
                        "providerId": "openai-images",
                        "modelId": "gpt-image-2"
                    },
                    "protocol": "openai_images",
                    "auth": {
                        "credentialRef": "runtime-api-key-key-1",
                        "headerName": "X-Api-Key"
                    }
                }
            }),
            &image_generation_local_execution_spec(),
        )
        .expect("patch");

        assert_eq!(
            patch["model_route_execution"]["executor"]["bindingKey"].as_str(),
            Some("local_lime_service:/v1/images/generations")
        );
        assert_eq!(
            patch["model_route_execution"]["credentialResolver"]["secretMaterialStatus"].as_str(),
            Some("not_embedded")
        );
        assert_eq!(
            patch["model_route_execution"]["credentialResolver"]["credentialRef"].as_str(),
            Some("runtime-api-key-key-1")
        );
        assert_eq!(
            patch["model_route_execution"]["credentialResolver"]["authHeaderName"].as_str(),
            Some("X-Api-Key")
        );
        assert!(patch["model_route_execution"]["credentialResolver"]["authHeaderPrefix"].is_null());
    }

    #[test]
    fn image_route_preflight_migrates_route_only_payload() {
        let preflight = image_route_payload_preflight(&json!({
            "resolvedRoute": {
                "modelRef": {
                    "providerId": "openai-images",
                    "modelId": "gpt-image-2"
                },
                "protocol": "openai_images"
            }
        }));

        assert!(preflight.failure.is_none());
        assert_eq!(
            preflight
                .payload_patch
                .as_ref()
                .and_then(|patch| patch.pointer("/modelRouteExecution/executor/kind"))
                .and_then(Value::as_str),
            Some("local_lime_service")
        );
    }

    #[test]
    fn video_route_preflight_rejects_chat_protocol() {
        let preflight = video_route_payload_preflight(&json!({
            "resolvedRoute": {
                "modelRef": {
                    "providerId": "openai",
                    "modelId": "gpt-4.1"
                },
                "protocol": "openai_chat"
            }
        }));

        assert!(preflight.payload_patch.is_none());
        assert_eq!(
            preflight
                .failure
                .as_ref()
                .map(|failure| failure.code.as_str()),
            Some("unsupported_protocol")
        );
    }

    #[test]
    fn route_execution_validation_rejects_embedded_secret() {
        let failure = route_execution_failure_from_payload(
            &json!({
                "resolvedRoute": {
                    "modelRef": {
                        "providerId": "openai-images",
                        "modelId": "gpt-image-2"
                    },
                    "protocol": "openai_images"
                },
                "modelRouteExecution": {
                    "executor": {
                        "kind": "local_lime_service",
                        "bindingKey": "local_lime_service:/v1/images/generations",
                        "endpointSource": "runner_config"
                    },
                    "credentialResolver": {
                        "owner": "local_lime_service",
                        "secretMaterialStatus": "embedded",
                        "apiKey": "sk-test"
                    },
                    "route": {
                        "providerId": "openai-images",
                        "modelId": "gpt-image-2",
                        "protocol": "openai_images"
                    }
                }
            }),
            &image_generation_local_execution_spec(),
        )
        .expect("failure");

        assert_eq!(failure.code, "unsupported_route_execution");
        assert!(failure.message.contains("明文凭证"));
    }
}
