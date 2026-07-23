use super::ImageTaskWorkerContext;
use lime_core::models::{runtime_api_key_id_from_credential_uuid, RuntimeCredentialData};
use lime_media_runtime::{
    patch_task_artifact, ImageGenerationRequestBodyFormat, ImageGenerationRunnerConfig,
    TaskArtifactPatch, IMAGE_TASK_RUNNER_WORKER_ID,
};
use lime_services::api_key_provider_service::ApiKeyProviderService;
use serde_json::Value;
use std::path::Path;

pub(super) fn image_generation_runner_config_from_resolved_route(
    workspace_root: &Path,
    task_id: &str,
    context: &ImageTaskWorkerContext,
) -> Result<Option<ImageGenerationRunnerConfig>, String> {
    let task = lime_media_runtime::load_task_output(workspace_root, task_id, None)
        .map_err(|error| error.to_string())?;
    let Some(route) = task.record.payload.get("resolved_route") else {
        return Ok(None);
    };
    if route_failure_present(&task.record.payload) {
        return Ok(None);
    }
    let Some(provider_id) = route_model_ref_string(route, &["providerId", "provider_id"]) else {
        return Ok(None);
    };
    let Some(model_id) = route_model_ref_string(route, &["modelId", "model_id"]) else {
        return Ok(None);
    };
    let Some(protocol) = read_value_string(route, &["protocol"]) else {
        return Ok(None);
    };
    let Some(endpoint) = image_generation_endpoint_from_route(route, &protocol) else {
        return Ok(None);
    };
    let request_body_format = image_request_body_format_from_route(route, &protocol);
    let api_key_service = ApiKeyProviderService::new();
    let (key_id, api_key) =
        image_api_key_from_resolved_route(route, &context.db, &api_key_service, &provider_id)?;
    if let Some(key_id) = key_id {
        if let Err(error) = api_key_service.record_usage(&context.db, &key_id) {
            tracing::warn!(
                provider_id = %provider_id,
                key_id = %key_id,
                error = %error,
                "failed to record image provider api key usage"
            );
        }
    }

    patch_task_artifact(
        workspace_root,
        task_id,
        None,
        TaskArtifactPatch {
            payload_patch: Some(serde_json::json!({
                "executor_mode": image_executor_mode_from_route(route, &protocol),
                "provider_id": provider_id,
                "model": model_id,
                "request_body_format": request_body_format.as_str(),
            })),
            current_attempt_worker_id: Some(Some(IMAGE_TASK_RUNNER_WORKER_ID.to_string())),
            ..TaskArtifactPatch::default()
        },
    )
    .map_err(|error| error.to_string())?;

    Ok(Some(ImageGenerationRunnerConfig {
        endpoint,
        api_key,
        request_body_format,
    }))
}

fn image_api_key_from_resolved_route(
    route: &Value,
    db: &lime_core::database::DbConnection,
    api_key_service: &ApiKeyProviderService,
    provider_id: &str,
) -> Result<(Option<String>, String), String> {
    let auth = route
        .get("auth")
        .ok_or_else(|| format!("图片 Provider {provider_id} 的 resolved route 缺少 auth"))?;
    let credential_ref = read_value_string(auth, &["credentialRef", "credential_ref"]);
    if credential_ref.is_none() && read_value_string(auth, &["kind"]).as_deref() == Some("no_auth")
    {
        return Ok((None, String::new()));
    }
    let credential_ref = credential_ref.ok_or_else(|| {
        format!("图片 Provider {provider_id} 的 resolved route 缺少 credentialRef")
    })?;
    let credential = api_key_service
        .select_runtime_credential_by_ref(db, provider_id, &credential_ref)
        .map_err(|error| format!("读取图片 Provider 精确凭证失败: {error}"))?
        .ok_or_else(|| format!("图片 Provider {provider_id} 的 resolved credential 不可用"))?;
    let key_id = runtime_api_key_id_from_credential_uuid(&credential.uuid)
        .ok_or_else(|| "图片 Provider resolved credentialRef 格式无效".to_string())?
        .to_string();
    let api_key = match credential.credential {
        RuntimeCredentialData::OpenAIKey { api_key, .. }
        | RuntimeCredentialData::ClaudeKey { api_key, .. }
        | RuntimeCredentialData::VertexKey { api_key, .. }
        | RuntimeCredentialData::GeminiApiKey { api_key, .. }
        | RuntimeCredentialData::AnthropicKey { api_key, .. } => api_key,
    };
    Ok((Some(key_id), api_key))
}

fn route_failure_present(payload: &Value) -> bool {
    payload.get("route_failure").is_some()
        || payload.get("routeFailure").is_some()
        || payload
            .get("model_route_assessment")
            .or_else(|| payload.get("modelRouteAssessment"))
            .and_then(|assessment| read_value_string(assessment, &["status"]))
            .as_deref()
            == Some("blocked")
}

fn route_model_ref_string(route: &Value, keys: &[&str]) -> Option<String> {
    route
        .get("modelRef")
        .or_else(|| route.get("model_ref"))
        .and_then(|model_ref| read_value_string(model_ref, keys))
}

fn image_generation_endpoint_from_route(route: &Value, protocol: &str) -> Option<String> {
    if is_zhipu_image_route_for_protocol(route, protocol) {
        let base_url = route
            .get("endpoint")
            .and_then(|endpoint| read_value_string(endpoint, &["baseUrl", "base_url"]))
            .unwrap_or_else(|| "https://open.bigmodel.cn/api/paas/v4".to_string());
        return Some(image_generation_endpoint_from_zhipu_base(&base_url));
    }
    if is_dashscope_image_route_for_protocol(route, protocol) {
        let base_url = route
            .get("endpoint")
            .and_then(|endpoint| read_value_string(endpoint, &["baseUrl", "base_url"]))
            .unwrap_or_else(|| "https://dashscope.aliyuncs.com/compatible-mode/v1".to_string());
        return Some(image_generation_endpoint_from_dashscope_base(&base_url));
    }

    match protocol {
        "dashscope_multimodal_generation" => {
            let base_url = route
                .get("endpoint")
                .and_then(|endpoint| read_value_string(endpoint, &["baseUrl", "base_url"]))
                .unwrap_or_else(|| "https://dashscope.aliyuncs.com/compatible-mode/v1".to_string());
            Some(image_generation_endpoint_from_dashscope_base(&base_url))
        }
        "openai_images" | "openai_responses" | "codex_responses" => {
            let base_url = route
                .get("endpoint")
                .and_then(|endpoint| read_value_string(endpoint, &["baseUrl", "base_url"]))?;
            Some(image_generation_endpoint_from_openai_base(&base_url))
        }
        "gemini_generate_content" => {
            let base_url = route
                .get("endpoint")
                .and_then(|endpoint| read_value_string(endpoint, &["baseUrl", "base_url"]))?;
            Some(image_generation_endpoint_from_gemini_base(&base_url))
        }
        _ => None,
    }
}

fn image_generation_endpoint_from_openai_base(base_url: &str) -> String {
    let normalized = base_url.trim().trim_end_matches('/');
    if normalized.ends_with("/v1/images/generations") || normalized.ends_with("/images/generations")
    {
        return normalized.to_string();
    }
    if normalized.ends_with("/v1") {
        format!("{normalized}/images/generations")
    } else {
        format!("{normalized}/v1/images/generations")
    }
}

fn image_generation_endpoint_from_gemini_base(base_url: &str) -> String {
    let normalized = base_url.trim().trim_end_matches('/');
    if normalized.contains(":generateContent") {
        return normalized.to_string();
    }
    if normalized.ends_with("/v1") || normalized.ends_with("/v1beta") {
        return normalized.to_string();
    }
    format!("{normalized}/v1beta")
}

fn image_generation_endpoint_from_zhipu_base(base_url: &str) -> String {
    let normalized = normalize_urlish_base(base_url);
    if normalized.is_empty() {
        return "https://open.bigmodel.cn/api/paas/v4/images/generations".to_string();
    }
    let Ok(mut url) = reqwest::Url::parse(&normalized) else {
        let base = normalized
            .strip_suffix("/images/generations")
            .unwrap_or(&normalized)
            .trim_end_matches('/');
        return if base.eq_ignore_ascii_case("https://open.bigmodel.cn") {
            "https://open.bigmodel.cn/api/paas/v4/images/generations".to_string()
        } else {
            format!("{base}/images/generations")
        };
    };

    let mut segments: Vec<String> = url
        .path_segments()
        .map(|items| {
            items
                .filter(|segment| !segment.is_empty())
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default();
    if segments.len() >= 2
        && segments[segments.len() - 2] == "images"
        && segments[segments.len() - 1] == "generations"
    {
        segments.truncate(segments.len() - 2);
    }
    if segments.is_empty() && url.host_str() == Some("open.bigmodel.cn") {
        segments = ["api", "paas", "v4"]
            .into_iter()
            .map(ToString::to_string)
            .collect();
    }
    let base_path = if segments.is_empty() {
        "/".to_string()
    } else {
        format!("/{}", segments.join("/"))
    };
    url.set_path(&base_path);
    url.set_query(None);
    url.set_fragment(None);

    let base = url.to_string().trim_end_matches('/').to_string();
    if base.eq_ignore_ascii_case("https://open.bigmodel.cn") {
        "https://open.bigmodel.cn/api/paas/v4/images/generations".to_string()
    } else {
        format!("{base}/images/generations")
    }
}

fn image_generation_endpoint_from_dashscope_base(base_url: &str) -> String {
    let normalized = normalize_urlish_base(base_url);
    if normalized.is_empty() {
        return "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
            .to_string();
    }
    let Ok(mut url) = reqwest::Url::parse(&normalized) else {
        let base = normalized
            .strip_suffix("/api/v1/services/aigc/multimodal-generation/generation")
            .unwrap_or(&normalized)
            .trim_end_matches('/');
        return format!("{base}/api/v1/services/aigc/multimodal-generation/generation");
    };

    if url
        .path()
        .trim_end_matches('/')
        .ends_with("/api/v1/services/aigc/multimodal-generation/generation")
    {
        url.set_query(None);
        url.set_fragment(None);
        return url.to_string().trim_end_matches('/').to_string();
    }

    url.set_path("/api/v1/services/aigc/multimodal-generation/generation");
    url.set_query(None);
    url.set_fragment(None);
    url.to_string().trim_end_matches('/').to_string()
}

fn normalize_urlish_base(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    }
}

fn image_executor_mode_from_route(route: &Value, protocol: &str) -> &'static str {
    if is_zhipu_image_route_for_protocol(route, protocol) {
        return "zhipu_images";
    }
    if is_dashscope_image_route_for_protocol(route, protocol)
        || protocol == "dashscope_multimodal_generation"
    {
        return "dashscope_images";
    }

    match protocol {
        "openai_responses" | "codex_responses" => "responses_image_generation",
        "gemini_generate_content" => "gemini_generate_content",
        _ => "images_api",
    }
}

fn image_request_body_format_from_route(
    route: &Value,
    protocol: &str,
) -> ImageGenerationRequestBodyFormat {
    if matches!(
        protocol,
        "openai_images" | "openai_responses" | "codex_responses"
    ) && is_agnes_image_route(route)
    {
        return ImageGenerationRequestBodyFormat::AgnesImages;
    }

    ImageGenerationRequestBodyFormat::OpenaiImages
}

fn is_zhipu_image_route(route: &Value) -> bool {
    let provider_id = route_model_ref_string(route, &["providerId", "provider_id"])
        .or_else(|| {
            route
                .get("provider")
                .and_then(|value| read_value_string(value, &["id", "providerId", "provider_id"]))
        })
        .unwrap_or_default()
        .to_ascii_lowercase();
    let model_id = route_model_ref_string(route, &["modelId", "model_id"])
        .or_else(|| {
            route
                .get("model")
                .and_then(|value| read_value_string(value, &["id", "modelId", "model_id"]))
        })
        .unwrap_or_default()
        .to_ascii_lowercase();
    let base_url = route
        .get("endpoint")
        .and_then(|endpoint| read_value_string(endpoint, &["baseUrl", "base_url"]))
        .unwrap_or_default()
        .to_ascii_lowercase();

    provider_id.contains("zhipu")
        || provider_id.contains("bigmodel")
        || base_url.contains("bigmodel.cn/api/paas")
        || matches!(
            model_id.as_str(),
            "glm-image" | "cogview-4-250304" | "cogview-4" | "cogview-3-flash"
        )
        || model_id.contains("cogview")
}

fn is_dashscope_image_route(route: &Value) -> bool {
    let provider_id = route_model_ref_string(route, &["providerId", "provider_id"])
        .or_else(|| {
            route
                .get("provider")
                .and_then(|value| read_value_string(value, &["id", "providerId", "provider_id"]))
        })
        .unwrap_or_default()
        .to_ascii_lowercase();
    let model_id = route_model_ref_string(route, &["modelId", "model_id"])
        .or_else(|| {
            route
                .get("model")
                .and_then(|value| read_value_string(value, &["id", "modelId", "model_id"]))
        })
        .unwrap_or_default();
    let base_url = route
        .get("endpoint")
        .and_then(|endpoint| read_value_string(endpoint, &["baseUrl", "base_url"]))
        .unwrap_or_default()
        .to_ascii_lowercase();
    let provider_matches = provider_id.contains("dashscope")
        || provider_id.contains("alibaba")
        || provider_id.contains("qwen")
        || provider_id.contains("tongyi")
        || base_url.contains("dashscope.aliyuncs.com")
        || base_url.contains("dashscope-intl.aliyuncs.com")
        || base_url.contains("maas.aliyuncs.com");

    provider_matches && is_dashscope_image_model_id(&model_id)
}

fn is_dashscope_image_model_id(model_id: &str) -> bool {
    let normalized = model_id.trim().to_ascii_lowercase();
    normalized.contains("qwen-image")
        || normalized.contains("wanx")
        || normalized.contains("wan2.")
        || normalized.contains("wan2-")
}

fn is_agnes_image_route(route: &Value) -> bool {
    let provider_id = route_model_ref_string(route, &["providerId", "provider_id"])
        .or_else(|| {
            route
                .get("provider")
                .and_then(|value| read_value_string(value, &["id", "providerId", "provider_id"]))
        })
        .unwrap_or_default()
        .to_ascii_lowercase();
    let model_id = route_model_ref_string(route, &["modelId", "model_id"])
        .or_else(|| {
            route
                .get("model")
                .and_then(|value| read_value_string(value, &["id", "modelId", "model_id"]))
        })
        .unwrap_or_default();
    let base_url = route
        .get("endpoint")
        .and_then(|endpoint| read_value_string(endpoint, &["baseUrl", "base_url"]))
        .unwrap_or_default()
        .to_ascii_lowercase();

    provider_id.contains("agnes")
        || base_url.contains("agnes-ai.com")
        || is_agnes_image_model_id(&model_id)
}

fn is_agnes_image_model_id(model_id: &str) -> bool {
    model_id
        .trim()
        .to_ascii_lowercase()
        .starts_with("agnes-image-")
}

fn is_zhipu_image_route_for_protocol(route: &Value, protocol: &str) -> bool {
    matches!(
        protocol,
        "openai_images" | "openai_responses" | "codex_responses"
    ) && is_zhipu_image_route(route)
}

fn is_dashscope_image_route_for_protocol(route: &Value, protocol: &str) -> bool {
    matches!(
        protocol,
        "openai_images" | "openai_responses" | "codex_responses"
    ) && is_dashscope_image_route(route)
}

fn read_value_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use lime_core::database::dao::api_key_provider::ApiProviderType;
    use lime_core::database::schema::create_tables;
    use lime_core::models::runtime_api_key_credential_uuid;
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};

    #[test]
    fn resolved_route_uses_exact_credential_ref_instead_of_round_robin() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        create_tables(&conn).expect("create schema");
        let db = Arc::new(Mutex::new(conn));
        let service = ApiKeyProviderService::new();
        let provider = service
            .add_custom_provider(
                &db,
                "Exact Image Credential".to_string(),
                ApiProviderType::Openai,
                "https://images.example/v1".to_string(),
                None,
                None,
                None,
                None,
                None,
            )
            .expect("create provider");
        service
            .add_api_key(&db, &provider.id, "image-key-a", None, false)
            .expect("add key A");
        let key_b = service
            .add_api_key(&db, &provider.id, "image-key-b", None, false)
            .expect("add key B");
        let credential_ref = runtime_api_key_credential_uuid(&key_b.id);
        let route = serde_json::json!({
            "auth": {
                "credentialRef": credential_ref
            }
        });

        let (key_id, api_key) =
            image_api_key_from_resolved_route(&route, &db, &service, &provider.id)
                .expect("resolve exact image credential");

        assert_eq!(key_id.as_deref(), Some(key_b.id.as_str()));
        assert_eq!(api_key, "image-key-b");
    }

    #[test]
    fn resolved_no_auth_route_does_not_select_provider_credential() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        create_tables(&conn).expect("create schema");
        let db = Arc::new(Mutex::new(conn));
        let service = ApiKeyProviderService::new();
        let route = serde_json::json!({
            "auth": {
                "kind": "no_auth"
            }
        });

        let (key_id, api_key) =
            image_api_key_from_resolved_route(&route, &db, &service, "keyless-images")
                .expect("resolve no-auth image route");

        assert!(key_id.is_none());
        assert!(api_key.is_empty());
    }

    #[test]
    fn image_generation_endpoint_from_openai_base_normalizes_common_shapes() {
        assert_eq!(
            image_generation_endpoint_from_openai_base("https://api.openai.com/v1"),
            "https://api.openai.com/v1/images/generations"
        );
        assert_eq!(
            image_generation_endpoint_from_openai_base(
                "https://gateway.example.com/proxy/images/generations"
            ),
            "https://gateway.example.com/proxy/images/generations"
        );
        assert_eq!(
            image_generation_endpoint_from_openai_base("https://gateway.example.com/proxy"),
            "https://gateway.example.com/proxy/v1/images/generations"
        );
    }

    #[test]
    fn image_generation_endpoint_from_route_requires_image_protocol() {
        let route = serde_json::json!({
            "protocol": "openai_images",
            "endpoint": {
                "baseUrl": "https://api.openai.com/v1"
            }
        });
        assert_eq!(
            image_generation_endpoint_from_route(&route, "openai_images").as_deref(),
            Some("https://api.openai.com/v1/images/generations")
        );
        let gemini_route = serde_json::json!({
            "protocol": "gemini_generate_content",
            "endpoint": {
                "baseUrl": "https://generativelanguage.googleapis.com"
            }
        });
        assert_eq!(
            image_generation_endpoint_from_route(&gemini_route, "gemini_generate_content")
                .as_deref(),
            Some("https://generativelanguage.googleapis.com/v1beta")
        );
        let zhipu_route = serde_json::json!({
            "protocol": "openai_images",
            "modelRef": {
                "providerId": "zhipuai",
                "modelId": "glm-image"
            },
            "endpoint": {
                "baseUrl": "https://open.bigmodel.cn/api/paas/v4"
            }
        });
        assert_eq!(
            image_generation_endpoint_from_route(&zhipu_route, "openai_images").as_deref(),
            Some("https://open.bigmodel.cn/api/paas/v4/images/generations")
        );
        assert_eq!(
            image_executor_mode_from_route(&zhipu_route, "openai_images"),
            "zhipu_images"
        );
        let dashscope_route = serde_json::json!({
            "protocol": "openai_images",
            "modelRef": {
                "providerId": "alibaba",
                "modelId": "qwen-image-plus"
            },
            "endpoint": {
                "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1"
            }
        });
        assert_eq!(
            image_generation_endpoint_from_route(&dashscope_route, "openai_images").as_deref(),
            Some(
                "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
            )
        );
        assert_eq!(
            image_executor_mode_from_route(&dashscope_route, "openai_images"),
            "dashscope_images"
        );
        let agnes_route = serde_json::json!({
            "protocol": "openai_images",
            "modelRef": {
                "providerId": "agnes",
                "modelId": "agnes-image-2.1-flash"
            },
            "endpoint": {
                "baseUrl": "https://apihub.agnes-ai.com/v1"
            }
        });
        assert_eq!(
            image_generation_endpoint_from_route(&agnes_route, "openai_images").as_deref(),
            Some("https://apihub.agnes-ai.com/v1/images/generations")
        );
        assert_eq!(
            image_executor_mode_from_route(&agnes_route, "openai_images"),
            "images_api"
        );
        assert_eq!(
            image_request_body_format_from_route(&agnes_route, "openai_images"),
            ImageGenerationRequestBodyFormat::AgnesImages
        );
        assert!(image_generation_endpoint_from_route(&zhipu_route, "anthropic_messages").is_none());
        assert!(image_generation_endpoint_from_route(&route, "anthropic_messages").is_none());
    }
}
