use reqwest::header::CONTENT_TYPE;
use serde_json::{json, Value};

use crate::{ImageGenerationRunnerConfig, TaskErrorRecord};

use super::{
    build_image_provider_http_error, build_image_task_error, read_response_error_code,
    read_response_error_message, summarize_response_body, ImageGenerationRequestInput,
    IMAGE_EXECUTOR_MODE_ZHIPU_IMAGES,
};

pub(super) async fn request_single_zhipu_image_generation(
    client: &reqwest::Client,
    runner_config: &ImageGenerationRunnerConfig,
    prepared_input: &ImageGenerationRequestInput,
    request_prompt: &str,
    task_id: &str,
) -> Result<(Value, Value), TaskErrorRecord> {
    if !prepared_input.reference_image_urls.is_empty() {
        return Err(build_image_task_error(
            "zhipu_reference_images_unsupported",
            "智谱图片服务当前暂不支持参考图或修图请求",
            false,
            "request",
        ));
    }

    let request_body =
        build_zhipu_image_generation_request_body(prepared_input, request_prompt, task_id);
    let endpoint = build_zhipu_images_endpoint(&runner_config.endpoint);
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
                format!("调用智谱图片服务失败: {error}"),
                true,
                "request",
            )
        })?;

    let status = response.status();
    let response_body_raw = response.text().await.map_err(|error| {
        build_image_task_error(
            "image_response_read_failed",
            format!("读取智谱图片服务响应失败: {error}"),
            false,
            "response",
        )
    })?;

    if !status.is_success() {
        let response_body: Option<Value> = serde_json::from_str(&response_body_raw).ok();
        let provider_code = response_body
            .as_ref()
            .and_then(|body| read_response_error_code(body, &[&["error", "code"], &["code"]]));
        let error_message = response_body
            .as_ref()
            .and_then(|body| {
                read_response_error_message(body, &[&["error", "message"], &["message"], &["msg"]])
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
            format!("解析智谱图片服务响应失败: {error}；{detail}"),
            false,
            "response",
        )
    })?;

    let Some(image) = collect_zhipu_generated_images(&response_body)
        .into_iter()
        .next()
    else {
        return Err(build_image_task_error(
            "image_result_empty",
            "智谱图片服务已返回成功，但没有可用的图片结果",
            false,
            "result",
        ));
    };

    Ok((image, response_body))
}

fn build_zhipu_image_generation_request_body(
    prepared_input: &ImageGenerationRequestInput,
    request_prompt: &str,
    task_id: &str,
) -> Value {
    let model = normalize_zhipu_model(&prepared_input.model);
    let mut body = json!({
        "model": model,
        "prompt": request_prompt.trim(),
        "size": normalize_zhipu_size(&prepared_input.model, prepared_input.size.as_deref()),
    });

    if let Some(quality) = normalize_zhipu_quality(&prepared_input.model) {
        body["quality"] = Value::String(quality.to_string());
    }

    if (6..=128).contains(&task_id.len()) {
        body["user_id"] = Value::String(task_id.to_string());
    }

    body
}

fn normalize_zhipu_model(model: &str) -> String {
    let trimmed = model.trim();
    let normalized = trimmed.to_ascii_lowercase().replace(['_', ' '], "-");
    match normalized.as_str() {
        "glm-image" => "glm-image".to_string(),
        "cogview-4-250304" => "cogview-4-250304".to_string(),
        "cogview-4" => "cogview-4".to_string(),
        "cogview-3-flash" => "cogview-3-flash".to_string(),
        _ if !trimmed.is_empty() => trimmed.to_string(),
        _ => "glm-image".to_string(),
    }
}

fn normalize_zhipu_quality(model: &str) -> Option<&'static str> {
    (normalize_zhipu_model(model) == "glm-image").then_some("hd")
}

fn normalize_zhipu_size(model: &str, size: Option<&str>) -> String {
    if let Some(size) = size.map(str::trim).filter(|value| !value.is_empty()) {
        return size.to_string();
    }

    if normalize_zhipu_model(model) == "glm-image" {
        "1280x1280".to_string()
    } else {
        "1024x1024".to_string()
    }
}

pub(crate) fn build_zhipu_images_endpoint(endpoint: &str) -> String {
    let trimmed = endpoint.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return "https://open.bigmodel.cn/api/paas/v4/images/generations".to_string();
    }

    let normalized = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };

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

fn collect_zhipu_generated_images(response_body: &Value) -> Vec<Value> {
    let mut images = Vec::new();
    collect_images_from_array(response_body.get("data"), &mut images);
    collect_images_from_array(response_body.get("images"), &mut images);
    if images.is_empty() {
        if let Some(image) = zhipu_image_value(response_body) {
            images.push(image);
        }
    }
    images
}

fn collect_images_from_array(value: Option<&Value>, images: &mut Vec<Value>) {
    if let Some(items) = value.and_then(Value::as_array) {
        images.extend(items.iter().filter_map(zhipu_image_value));
    }
}

fn zhipu_image_value(value: &Value) -> Option<Value> {
    let url = [
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
    })?;

    Some(json!({
        "url": url,
        "source": IMAGE_EXECUTOR_MODE_ZHIPU_IMAGES,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zhipu_endpoint_uses_official_sync_endpoint() {
        assert_eq!(
            build_zhipu_images_endpoint("https://open.bigmodel.cn"),
            "https://open.bigmodel.cn/api/paas/v4/images/generations"
        );
        assert_eq!(
            build_zhipu_images_endpoint("https://open.bigmodel.cn/api/paas/v4"),
            "https://open.bigmodel.cn/api/paas/v4/images/generations"
        );
        assert_eq!(
            build_zhipu_images_endpoint("https://proxy.example.com/api/paas/v4/images/generations"),
            "https://proxy.example.com/api/paas/v4/images/generations"
        );
    }
}
