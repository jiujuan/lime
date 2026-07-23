use serde_json::{json, Value};

use super::{resolved_model_route_from_payload, ModelRouteFailureProjection, RouteExecutionSpec};

const MEDIA_TASK_WORKER_EXECUTOR_KIND: &str = "media_task_worker";
const RESOLVED_ROUTE_ENDPOINT_SOURCE: &str = "resolved_route";
const MEDIA_TASK_WORKER_CREDENTIAL_OWNER: &str = "media_task_worker";
const SECRET_NOT_EMBEDDED_STATUS: &str = "not_embedded";

pub(super) fn unsupported_protocol_failure(
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

pub(super) fn build_route_execution_binding(
    payload: &Value,
    spec: &RouteExecutionSpec,
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
        "executionOwner": "media_task_worker",
        "executor": {
            "kind": MEDIA_TASK_WORKER_EXECUTOR_KIND,
            "bindingKey": spec.binding_key,
            "endpointSource": RESOLVED_ROUTE_ENDPOINT_SOURCE
        },
        "credentialResolver": {
            "owner": MEDIA_TASK_WORKER_CREDENTIAL_OWNER,
            "source": "resolved_route_credential_ref",
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
        }
    }))
}

pub(super) fn route_execution_value(payload: &Value) -> Option<&Value> {
    object_field(payload, &["model_route_execution", "modelRouteExecution"]).or_else(|| {
        object_field(payload, &["model_route_assessment", "modelRouteAssessment"])
            .and_then(|assessment| object_field(assessment, &["routeExecution", "route_execution"]))
    })
}

pub(super) fn credential_resolver_has_embedded_secret(value: Option<&Value>) -> bool {
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

pub(super) fn secret_value_present(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::String(value) => !value.trim().is_empty(),
        Value::Array(values) => values.iter().any(secret_value_present),
        Value::Object(values) => values.values().any(secret_value_present),
        _ => true,
    }
}

pub(super) fn unsupported_route_execution_failure(
    spec: &RouteExecutionSpec,
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

pub(super) fn route_failure_message(
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

pub(super) fn resolved_route_value(payload: &Value) -> Option<&Value> {
    object_field(payload, &["resolved_route", "resolvedRoute"]).or_else(|| {
        object_field(payload, &["model_route_assessment", "modelRouteAssessment"])
            .and_then(|assessment| object_field(assessment, &["resolvedRoute", "resolved_route"]))
    })
}

pub(super) fn route_failure_value(payload: &Value) -> Option<&Value> {
    object_field(payload, &["route_failure", "routeFailure"])
        .or_else(|| {
            resolved_route_value(payload).and_then(|route| object_field(route, &["failure"]))
        })
        .or_else(|| {
            object_field(payload, &["model_route_assessment", "modelRouteAssessment"])
                .and_then(|assessment| object_field(assessment, &["routeFailure", "route_failure"]))
        })
}

pub(super) fn object_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find(|value| value.is_object())
}

pub(super) fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .and_then(normalize_string)
}

pub(super) fn bool_field(value: &Value, keys: &[&str]) -> Option<bool> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_bool)
}

pub(super) fn normalize_string(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub(super) fn normalized_token(value: Option<&str>) -> Option<String> {
    normalize_string(value?).map(|value| value.to_ascii_lowercase().replace('-', "_"))
}
