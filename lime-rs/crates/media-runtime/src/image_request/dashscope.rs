use reqwest::header::CONTENT_TYPE;
use serde_json::{json, Map, Value};

use crate::{ImageGenerationRunnerConfig, TaskErrorRecord};

use super::{
    build_image_provider_http_error, build_image_task_error, read_response_error_code,
    read_response_error_message, summarize_response_body, ImageGenerationRequestInput,
    IMAGE_EXECUTOR_MODE_DASHSCOPE_IMAGES,
};

pub(super) async fn request_single_dashscope_image_generation(
    client: &reqwest::Client,
    runner_config: &ImageGenerationRunnerConfig,
    prepared_input: &ImageGenerationRequestInput,
    request_prompt: &str,
) -> Result<(Value, Value), TaskErrorRecord> {
    let request_body =
        build_dashscope_image_generation_request_body(prepared_input, request_prompt);
    let endpoint = build_dashscope_multimodal_generation_endpoint(&runner_config.endpoint);
    let response = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", runner_config.api_key))
        .header(CONTENT_TYPE, "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|error| {
            build_image_task_error(
                "image_request_failed",
                format!("调用 DashScope 图片服务失败: {error}"),
                true,
                "request",
            )
        })?;

    let status = response.status();
    let response_body_raw = response.text().await.map_err(|error| {
        build_image_task_error(
            "image_response_read_failed",
            format!("读取 DashScope 图片服务响应失败: {error}"),
            false,
            "response",
        )
    })?;

    if !status.is_success() {
        let response_body: Option<Value> = serde_json::from_str(&response_body_raw).ok();
        let provider_code = response_body
            .as_ref()
            .and_then(|body| read_response_error_code(body, &[&["code"], &["error", "code"]]));
        let error_message = response_body
            .as_ref()
            .and_then(|body| {
                read_response_error_message(body, &[&["message"], &["error", "message"]])
            })
            .unwrap_or_else(|| summarize_response_body(&response_body_raw));
        return Err(build_image_provider_http_error(
            status,
            provider_code,
            error_message,
            "request",
            None,
        ));
    }

    let response_body: Value = serde_json::from_str(&response_body_raw).map_err(|error| {
        let detail = summarize_response_body(&response_body_raw);
        build_image_task_error(
            "image_response_parse_failed",
            format!("解析 DashScope 图片服务响应失败: {error}；{detail}"),
            false,
            "response",
        )
    })?;

    let Some(image) = collect_dashscope_generated_images(&response_body)
        .into_iter()
        .next()
    else {
        return Err(build_image_task_error(
            "image_result_empty",
            "DashScope 图片服务已返回成功，但没有可用的图片结果",
            false,
            "result",
        ));
    };

    Ok((image, response_body))
}

fn build_dashscope_image_generation_request_body(
    prepared_input: &ImageGenerationRequestInput,
    request_prompt: &str,
) -> Value {
    let mut content = vec![json!({ "text": request_prompt.trim() })];
    for image_url in &prepared_input.reference_image_urls {
        let trimmed = image_url.trim();
        if !trimmed.is_empty() {
            content.push(json!({ "image": trimmed }));
        }
    }

    let mut parameters = Map::new();
    if let Some(size) = normalize_dashscope_size(prepared_input.size.as_deref()) {
        parameters.insert("size".to_string(), json!(size));
    }
    if is_wan_image_model(&prepared_input.model) && prepared_input.reference_image_urls.is_empty() {
        parameters.insert("enable_interleave".to_string(), json!(true));
    }

    let mut body = json!({
        "model": normalize_dashscope_model(&prepared_input.model),
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": content,
                }
            ]
        }
    });
    if !parameters.is_empty() {
        body["parameters"] = Value::Object(parameters);
    }
    body
}

fn normalize_dashscope_model(model: &str) -> String {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        "qwen-image-2.0".to_string()
    } else {
        trimmed.to_string()
    }
}

fn normalize_dashscope_size(size: Option<&str>) -> Option<String> {
    size.map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.replace(['x', 'X'], "*"))
}

fn is_wan_image_model(model: &str) -> bool {
    let normalized = model.trim().to_ascii_lowercase();
    normalized.contains("wanx") || normalized.contains("wan2.")
}

pub(crate) fn build_dashscope_multimodal_generation_endpoint(endpoint: &str) -> String {
    let normalized = normalize_urlish_base(endpoint);
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

    let already_multimodal_generation = url
        .path()
        .trim_end_matches('/')
        .ends_with("/api/v1/services/aigc/multimodal-generation/generation");
    if already_multimodal_generation {
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

fn collect_dashscope_generated_images(response_body: &Value) -> Vec<Value> {
    let mut images = Vec::new();
    collect_images_from_multimodal_choices(response_body, &mut images);
    collect_images_from_array(response_body.pointer("/output/results"), &mut images);
    collect_images_from_array(response_body.pointer("/output/images"), &mut images);
    collect_images_from_array(response_body.get("data"), &mut images);
    if images.is_empty() {
        if let Some(image) = dashscope_image_value(response_body) {
            images.push(image);
        }
    }
    images
}

fn collect_images_from_multimodal_choices(response_body: &Value, images: &mut Vec<Value>) {
    if let Some(choices) = response_body
        .pointer("/output/choices")
        .and_then(Value::as_array)
    {
        for content in choices.iter().flat_map(|choice| {
            choice
                .pointer("/message/content")
                .and_then(Value::as_array)
                .into_iter()
                .flat_map(|items| items.iter())
        }) {
            if let Some(image) = dashscope_image_value(content) {
                images.push(image);
            }
        }
    }
}

fn collect_images_from_array(value: Option<&Value>, images: &mut Vec<Value>) {
    if let Some(items) = value.and_then(Value::as_array) {
        images.extend(items.iter().filter_map(dashscope_image_value));
    }
}

fn dashscope_image_value(value: &Value) -> Option<Value> {
    let url = if let Some(raw) = value.as_str() {
        raw.trim()
            .is_empty()
            .then_some(None)
            .unwrap_or_else(|| Some(raw.trim().to_string()))
    } else {
        [
            "image",
            "url",
            "image_url",
            "imageUrl",
            "download_url",
            "downloadUrl",
        ]
        .iter()
        .find_map(|key| {
            value
                .get(*key)
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|item| !item.is_empty())
        })
        .map(ToOwned::to_owned)
        .or_else(|| {
            value
                .get("b64_json")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(|item| format!("data:image/png;base64,{item}"))
        })
    }?;

    Some(json!({
        "url": url,
        "source": IMAGE_EXECUTOR_MODE_DASHSCOPE_IMAGES,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dashscope_endpoint_normalizes_compatible_and_native_hosts() {
        assert_eq!(
            build_dashscope_multimodal_generation_endpoint(
                "https://dashscope.aliyuncs.com/compatible-mode/v1"
            ),
            "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
        );
        assert_eq!(
            build_dashscope_multimodal_generation_endpoint(
                "https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1"
            ),
            "https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
        );
        assert_eq!(
            build_dashscope_multimodal_generation_endpoint(
                "https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation?ignored=1"
            ),
            "https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
        );
    }

    #[test]
    fn dashscope_response_collector_reads_multimodal_image_content() {
        let images = collect_dashscope_generated_images(&json!({
            "output": {
                "choices": [
                    {
                        "message": {
                            "content": [
                                { "text": "done" },
                                { "image": "https://cdn.example.test/qwen.png" }
                            ]
                        }
                    }
                ]
            }
        }));

        assert_eq!(images.len(), 1);
        assert_eq!(
            images[0].get("url").and_then(Value::as_str),
            Some("https://cdn.example.test/qwen.png")
        );
        assert_eq!(
            images[0].get("source").and_then(Value::as_str),
            Some(IMAGE_EXECUTOR_MODE_DASHSCOPE_IMAGES)
        );
    }
}
