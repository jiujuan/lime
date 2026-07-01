use serde_json::{json, Value};

use crate::{ImageGenerationRunnerConfig, TaskErrorRecord};

use super::{
    build_image_provider_http_error, build_image_task_error, read_response_error_code,
    read_response_error_message, summarize_response_body, ImageGenerationRequestInput,
    IMAGE_EXECUTOR_MODE_GEMINI_GENERATE_CONTENT,
};

pub(super) async fn request_single_gemini_image_generation(
    client: &reqwest::Client,
    runner_config: &ImageGenerationRunnerConfig,
    prepared_input: &ImageGenerationRequestInput,
    request_prompt: &str,
) -> Result<(Value, Value), TaskErrorRecord> {
    let request_body = build_gemini_image_generation_request_body(prepared_input, request_prompt);
    let endpoint =
        build_gemini_generate_content_endpoint(&runner_config.endpoint, &prepared_input.model);
    let response = client
        .post(&endpoint)
        .header("x-goog-api-key", &runner_config.api_key)
        .json(&request_body)
        .send()
        .await
        .map_err(|error| {
            build_image_task_error(
                "image_request_failed",
                format!("调用 Gemini 图片服务失败: {error}"),
                true,
                "request",
            )
        })?;

    let status = response.status();
    let response_body_raw = response.text().await.map_err(|error| {
        build_image_task_error(
            "image_response_read_failed",
            format!("读取 Gemini 图片服务响应失败: {error}"),
            false,
            "response",
        )
    })?;

    if !status.is_success() {
        let response_body: Option<Value> = serde_json::from_str(&response_body_raw).ok();
        let provider_code = response_body.as_ref().and_then(|body| {
            read_response_error_code(body, &[&["error", "status"], &["error", "code"], &["code"]])
        });
        let error_message = response_body
            .as_ref()
            .and_then(|body| {
                read_response_error_message(body, &[&["error", "message"], &["message"]])
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
            format!("解析 Gemini 图片服务响应失败: {error}；{detail}"),
            false,
            "response",
        )
    })?;

    let Some(image) = collect_gemini_generated_images(&response_body)
        .into_iter()
        .next()
    else {
        return Err(build_image_task_error(
            "image_result_empty",
            "Gemini 图片服务已返回成功，但没有可用的图片结果",
            false,
            "result",
        ));
    };

    Ok((image, response_body))
}

fn build_gemini_image_generation_request_body(
    prepared_input: &ImageGenerationRequestInput,
    request_prompt: &str,
) -> Value {
    let mut parts = vec![json!({ "text": request_prompt })];
    for image_url in &prepared_input.reference_image_urls {
        if let Some((mime_type, data)) = parse_data_url(image_url) {
            parts.push(json!({
                "inlineData": {
                    "mimeType": mime_type,
                    "data": data,
                },
            }));
        } else {
            parts.push(json!({
                "fileData": {
                    "mimeType": "image/png",
                    "fileUri": image_url,
                },
            }));
        }
    }

    json!({
        "contents": [
            {
                "role": "user",
                "parts": parts,
            }
        ],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
        }
    })
}

fn parse_data_url(value: &str) -> Option<(&str, &str)> {
    let rest = value.strip_prefix("data:")?;
    let (mime_type, data) = rest.split_once(";base64,")?;
    if mime_type.trim().is_empty() || data.trim().is_empty() {
        return None;
    }
    Some((mime_type.trim(), data.trim()))
}

fn build_gemini_generate_content_endpoint(endpoint: &str, model: &str) -> String {
    let trimmed = endpoint.trim().trim_end_matches('/');
    if trimmed.contains(":generateContent") {
        return trimmed.to_string();
    }

    let model = model.trim().trim_start_matches("models/");
    if trimmed.ends_with("/models") {
        return format!("{trimmed}/{model}:generateContent");
    }
    if trimmed.ends_with("/v1") || trimmed.ends_with("/v1beta") {
        return format!("{trimmed}/models/{model}:generateContent");
    }
    if trimmed.contains("/models/") {
        return format!("{trimmed}:generateContent");
    }
    format!("{trimmed}/v1beta/models/{model}:generateContent")
}

fn collect_gemini_generated_images(response_body: &Value) -> Vec<Value> {
    response_body
        .get("candidates")
        .and_then(Value::as_array)
        .map(|candidates| {
            candidates
                .iter()
                .flat_map(|candidate| {
                    candidate
                        .pointer("/content/parts")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flat_map(|parts| parts.iter())
                })
                .filter_map(gemini_image_part_value)
                .collect()
        })
        .unwrap_or_default()
}

fn gemini_image_part_value(part: &Value) -> Option<Value> {
    let inline_data = part.get("inlineData").or_else(|| part.get("inline_data"));
    if let Some(inline_data) = inline_data {
        let data = inline_data
            .get("data")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())?;
        let mime_type = inline_data
            .get("mimeType")
            .or_else(|| inline_data.get("mime_type"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("image/png");
        return Some(json!({
            "url": format!("data:{mime_type};base64,{data}"),
            "source": IMAGE_EXECUTOR_MODE_GEMINI_GENERATE_CONTENT,
        }));
    }

    let file_data = part.get("fileData").or_else(|| part.get("file_data"));
    let file_data = file_data?;
    let file_uri = file_data
        .get("fileUri")
        .or_else(|| file_data.get("file_uri"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    Some(json!({
        "url": file_uri,
        "source": IMAGE_EXECUTOR_MODE_GEMINI_GENERATE_CONTENT,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gemini_endpoint_appends_model_generate_content_path() {
        assert_eq!(
            build_gemini_generate_content_endpoint(
                "https://generativelanguage.googleapis.com/v1beta",
                "gemini-2.5-flash-image"
            ),
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent"
        );
        assert_eq!(
            build_gemini_generate_content_endpoint(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
                "ignored"
            ),
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent"
        );
    }

    #[test]
    fn gemini_response_collector_reads_inline_image() {
        let images = collect_gemini_generated_images(&json!({
            "candidates": [{
                "content": {
                    "parts": [
                        { "text": "done" },
                        {
                            "inlineData": {
                                "mimeType": "image/png",
                                "data": "ZmFrZS1pbWFnZQ=="
                            }
                        }
                    ]
                }
            }]
        }));

        assert_eq!(images.len(), 1);
        assert_eq!(
            images[0].get("url").and_then(Value::as_str),
            Some("data:image/png;base64,ZmFrZS1pbWFnZQ==")
        );
    }
}
