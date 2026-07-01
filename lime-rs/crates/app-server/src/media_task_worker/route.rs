use super::ImageTaskWorkerContext;
use lime_core::database::dao::api_key_provider::{
    ApiKeyProvider, ApiProviderType, ProviderProtocolFamily,
};
use lime_media_runtime::{
    patch_task_artifact, ImageGenerationRunnerConfig, TaskArtifactPatch,
    IMAGE_TASK_RUNNER_WORKER_ID,
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
    let api_key_service = ApiKeyProviderService::new();
    let Some((key_id, api_key)) = api_key_service
        .get_next_api_key_entry(&context.db, &provider_id)
        .map_err(|error| format!("读取图片 Provider API Key 失败: {error}"))?
    else {
        return Err(format!("图片 Provider {provider_id} 没有可用 API Key"));
    };
    if let Err(error) = api_key_service.record_usage(&context.db, &key_id) {
        tracing::warn!(
            provider_id = %provider_id,
            key_id = %key_id,
            error = %error,
            "failed to record image provider api key usage"
        );
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
            })),
            current_attempt_worker_id: Some(Some(IMAGE_TASK_RUNNER_WORKER_ID.to_string())),
            ..TaskArtifactPatch::default()
        },
    )
    .map_err(|error| error.to_string())?;

    Ok(Some(ImageGenerationRunnerConfig { endpoint, api_key }))
}

pub(super) fn image_generation_runner_config_from_task_provider(
    workspace_root: &Path,
    task_id: &str,
    context: &ImageTaskWorkerContext,
) -> Result<Option<ImageGenerationRunnerConfig>, String> {
    let task = lime_media_runtime::load_task_output(workspace_root, task_id, None)
        .map_err(|error| error.to_string())?;
    let payload = &task.record.payload;
    if route_failure_present(payload) {
        return Ok(None);
    }
    let Some(provider_id) = read_value_string(payload, &["provider_id", "providerId"]) else {
        return Ok(None);
    };
    let Some(model_id) = read_value_string(payload, &["model"]) else {
        return Ok(None);
    };

    let api_key_service = ApiKeyProviderService::new();
    let Some(provider) = api_key_service
        .get_provider(&context.db, &provider_id)
        .map_err(|error| format!("读取图片 Provider 失败: {error}"))?
    else {
        return Err(format!("图片 Provider {provider_id} 不存在"));
    };
    if !provider.provider.enabled {
        return Err(format!("图片 Provider {provider_id} 当前未启用"));
    }
    let Some(endpoint) =
        image_generation_endpoint_from_provider(&provider.provider, Some(model_id.as_str()))
    else {
        return Ok(None);
    };
    let Some((key_id, api_key)) = api_key_service
        .get_next_api_key_entry(&context.db, &provider_id)
        .map_err(|error| format!("读取图片 Provider API Key 失败: {error}"))?
    else {
        return Err(format!("图片 Provider {provider_id} 没有可用 API Key"));
    };
    if let Err(error) = api_key_service.record_usage(&context.db, &key_id) {
        tracing::warn!(
            provider_id = %provider_id,
            key_id = %key_id,
            error = %error,
            "failed to record image provider api key usage"
        );
    }

    patch_task_artifact(
        workspace_root,
        task_id,
        None,
        TaskArtifactPatch {
            payload_patch: Some(serde_json::json!({
                "executor_mode": image_executor_mode_from_provider(&provider.provider, Some(model_id.as_str())),
                "provider_id": provider_id,
                "model": model_id,
            })),
            current_attempt_worker_id: Some(Some(IMAGE_TASK_RUNNER_WORKER_ID.to_string())),
            ..TaskArtifactPatch::default()
        },
    )
    .map_err(|error| error.to_string())?;

    Ok(Some(ImageGenerationRunnerConfig { endpoint, api_key }))
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

fn image_generation_endpoint_from_provider(
    provider: &ApiKeyProvider,
    model_id: Option<&str>,
) -> Option<String> {
    if is_zhipu_image_provider(provider) {
        return Some(image_generation_endpoint_from_zhipu_base(
            &provider.api_host,
        ));
    }
    if is_dashscope_image_provider(provider, model_id) {
        return Some(image_generation_endpoint_from_dashscope_base(
            &provider.api_host,
        ));
    }

    let effective_type = provider.effective_provider_type();
    let spec = effective_type.runtime_spec();
    match effective_type {
        ApiProviderType::Openai
        | ApiProviderType::OpenaiResponse
        | ApiProviderType::Codex
        | ApiProviderType::NewApi
        | ApiProviderType::Gateway
            if spec.protocol_family == ProviderProtocolFamily::OpenAiCompatible
                || matches!(effective_type, ApiProviderType::Codex) =>
        {
            Some(image_generation_endpoint_from_openai_base(
                &provider.api_host,
            ))
        }
        ApiProviderType::Gemini if spec.protocol_family == ProviderProtocolFamily::Gemini => Some(
            image_generation_endpoint_from_gemini_base(&provider.api_host),
        ),
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

fn image_executor_mode_from_provider(
    provider: &ApiKeyProvider,
    model_id: Option<&str>,
) -> &'static str {
    if is_zhipu_image_provider(provider) {
        return "zhipu_images";
    }
    if is_dashscope_image_provider(provider, model_id) {
        return "dashscope_images";
    }

    match provider.effective_provider_type() {
        ApiProviderType::OpenaiResponse | ApiProviderType::Codex => "responses_image_generation",
        ApiProviderType::Gemini => "gemini_generate_content",
        _ => "images_api",
    }
}

fn is_zhipu_image_provider(provider: &ApiKeyProvider) -> bool {
    let provider_id = provider.id.to_ascii_lowercase();
    let provider_name = provider.name.to_ascii_lowercase();
    let api_host = provider.api_host.to_ascii_lowercase();
    let has_zhipu_identity = provider_id.contains("zhipu")
        || provider_id.contains("bigmodel")
        || provider_name.contains("zhipu")
        || provider_name.contains("智谱")
        || api_host.contains("bigmodel.cn/api/paas");
    let has_zhipu_model = provider.custom_models.iter().any(|model| {
        let normalized = model.trim().to_ascii_lowercase();
        matches!(
            normalized.as_str(),
            "glm-image" | "cogview-4-250304" | "cogview-4" | "cogview-3-flash"
        ) || normalized.contains("cogview")
            || normalized.contains("glm-image")
    });
    has_zhipu_identity || has_zhipu_model
}

fn is_dashscope_image_provider(provider: &ApiKeyProvider, model_id: Option<&str>) -> bool {
    let provider_id = provider.id.to_ascii_lowercase();
    let provider_name = provider.name.to_ascii_lowercase();
    let api_host = provider.api_host.to_ascii_lowercase();
    let has_dashscope_identity = provider_id.contains("dashscope")
        || provider_id.contains("alibaba")
        || provider_id.contains("qwen")
        || provider_id.contains("tongyi")
        || provider_name.contains("dashscope")
        || provider_name.contains("通义")
        || provider_name.contains("百炼")
        || api_host.contains("dashscope.aliyuncs.com")
        || api_host.contains("dashscope-intl.aliyuncs.com")
        || api_host.contains("maas.aliyuncs.com");
    let has_dashscope_image_model = model_id.map(is_dashscope_image_model_id).unwrap_or(false)
        || provider
            .custom_models
            .iter()
            .any(|model| is_dashscope_image_model_id(model));
    has_dashscope_identity && has_dashscope_image_model
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
            Some("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation")
        );
        assert_eq!(
            image_executor_mode_from_route(&dashscope_route, "openai_images"),
            "dashscope_images"
        );
        assert!(image_generation_endpoint_from_route(&zhipu_route, "anthropic_messages").is_none());
        assert!(image_generation_endpoint_from_route(&route, "anthropic_messages").is_none());
    }

    #[test]
    fn image_generation_endpoint_from_provider_supports_openai_compatible_image_api() {
        let mut provider = ApiKeyProvider {
            id: "custom-provider".to_string(),
            name: "Custom Images".to_string(),
            provider_type: ApiProviderType::NewApi,
            api_host: "https://gateway.example.com/proxy".to_string(),
            is_system: false,
            group: lime_core::database::dao::api_key_provider::ProviderGroup::Custom,
            enabled: true,
            sort_order: 0,
            api_version: None,
            project: None,
            location: None,
            region: None,
            custom_models: Vec::new(),
            prompt_cache_mode: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        assert_eq!(
            image_generation_endpoint_from_provider(&provider, Some("gpt-image-1")).as_deref(),
            Some("https://gateway.example.com/proxy/v1/images/generations")
        );
        assert_eq!(
            image_executor_mode_from_provider(&provider, Some("gpt-image-1")),
            "images_api"
        );

        provider.provider_type = ApiProviderType::OpenaiResponse;
        assert_eq!(
            image_executor_mode_from_provider(&provider, Some("gpt-images-2")),
            "responses_image_generation"
        );

        provider.provider_type = ApiProviderType::Gemini;
        provider.api_host = "https://generativelanguage.googleapis.com".to_string();
        assert_eq!(
            image_generation_endpoint_from_provider(&provider, Some("gemini-3-pro-image"))
                .as_deref(),
            Some("https://generativelanguage.googleapis.com/v1beta")
        );
        assert_eq!(
            image_executor_mode_from_provider(&provider, Some("gemini-3-pro-image")),
            "gemini_generate_content"
        );

        provider.id = "zhipuai".to_string();
        provider.name = "Zhipu AI".to_string();
        provider.provider_type = ApiProviderType::Openai;
        provider.api_host = "https://open.bigmodel.cn/api/paas/v4".to_string();
        provider.custom_models = vec!["glm-image".to_string()];
        assert_eq!(
            image_generation_endpoint_from_provider(&provider, Some("glm-image")).as_deref(),
            Some("https://open.bigmodel.cn/api/paas/v4/images/generations")
        );
        assert_eq!(
            image_executor_mode_from_provider(&provider, Some("glm-image")),
            "zhipu_images"
        );

        provider.id = "alibaba".to_string();
        provider.name = "百炼/通义千问 (DashScope)".to_string();
        provider.provider_type = ApiProviderType::Openai;
        provider.api_host = "https://dashscope.aliyuncs.com/compatible-mode/v1/".to_string();
        provider.custom_models = Vec::new();
        assert_eq!(
            image_generation_endpoint_from_provider(&provider, Some("qwen-image-plus")).as_deref(),
            Some("https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation")
        );
        assert_eq!(
            image_executor_mode_from_provider(&provider, Some("qwen-image-plus")),
            "dashscope_images"
        );

        provider.id = "anthropic".to_string();
        provider.name = "Anthropic".to_string();
        provider.provider_type = ApiProviderType::Anthropic;
        provider.api_host = "https://api.anthropic.com".to_string();
        provider.custom_models = Vec::new();
        assert!(
            image_generation_endpoint_from_provider(&provider, Some("claude-sonnet-4-5")).is_none()
        );
    }
}
