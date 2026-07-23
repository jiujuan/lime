use model_provider::lowering::{
    build_responses_image_generation_body, ResponsesImageGenerationInputShape,
    ResponsesImageGenerationOptions,
};
use reqwest::StatusCode;
use serde_json::{json, Value};

use crate::{ImageGenerationRunnerConfig, TaskErrorRecord};

use super::openai_images::build_openai_compatible_image_generation_llm_request;
use super::{
    build_image_provider_http_error, build_image_task_error, read_response_error_code,
    read_response_error_message, summarize_response_body, with_optional_bearer_auth,
    ImageGenerationRequestInput, IMAGE_EXECUTOR_MODE_RESPONSES_IMAGE_GENERATION,
};

pub(crate) fn build_responses_image_generation_endpoint(endpoint: &str) -> String {
    let trimmed = endpoint.trim().trim_end_matches('/');
    let (base, query) = trimmed
        .split_once('?')
        .map(|(left, right)| (left, Some(right)))
        .unwrap_or((trimmed, None));
    let responses_base = if base.ends_with("/v1/images/generations") {
        format!(
            "{}/v1/responses",
            base.trim_end_matches("/v1/images/generations")
        )
    } else if base.ends_with("/images/generations") {
        format!("{}/responses", base.trim_end_matches("/images/generations"))
    } else if base.ends_with("/v1") {
        format!("{base}/responses")
    } else if base.ends_with("/responses") || base.ends_with("/v1/responses") {
        base.to_string()
    } else {
        format!("{base}/responses")
    };

    match query {
        Some(value) if !value.is_empty() => format!("{responses_base}?{value}"),
        _ => responses_base,
    }
}

pub(super) async fn request_single_responses_image_generation(
    client: &reqwest::Client,
    runner_config: &ImageGenerationRunnerConfig,
    prepared_input: &ImageGenerationRequestInput,
    request_prompt: &str,
) -> Result<(Value, Value), TaskErrorRecord> {
    let (mut status, mut response_body_raw) = send_responses_image_generation_request(
        client,
        runner_config,
        prepared_input,
        request_prompt,
        false,
    )
    .await?;

    if should_retry_responses_image_generation_with_input_list(status, &response_body_raw) {
        let retry = send_responses_image_generation_request(
            client,
            runner_config,
            prepared_input,
            request_prompt,
            true,
        )
        .await?;
        status = retry.0;
        response_body_raw = retry.1;
    }

    if !status.is_success() {
        let endpoint_not_found =
            is_responses_image_generation_endpoint_not_found(status, &response_body_raw);
        let error_body: Value = serde_json::from_str(&response_body_raw).unwrap_or_else(|_| {
            json!({
                "error": {
                    "code": if endpoint_not_found {
                        "responses_image_generation_endpoint_not_found"
                    } else {
                        "responses_image_generation_failed"
                    },
                    "message": summarize_response_body(&response_body_raw),
                }
            })
        });
        let provider_code = read_response_error_code(&error_body, &[&["error", "code"], &["code"]]);
        let error_message =
            read_response_error_message(&error_body, &[&["error", "message"], &["message"]])
                .unwrap_or_else(|| summarize_response_body(&response_body_raw));
        return Err(build_image_provider_http_error(
            status,
            provider_code,
            error_message,
            "request",
            endpoint_not_found.then_some("responses_image_generation_endpoint_not_found"),
        ));
    }

    extract_responses_image_generation_result(&response_body_raw).map_err(|error| *error)
}

fn should_retry_responses_image_generation_with_input_list(status: StatusCode, body: &str) -> bool {
    status == StatusCode::BAD_REQUEST && body.to_ascii_lowercase().contains("input must be a list")
}

fn is_responses_image_generation_endpoint_not_found(status: StatusCode, body: &str) -> bool {
    if status == StatusCode::NOT_FOUND {
        return true;
    }

    let normalized = body.to_ascii_lowercase();
    normalized.contains("not found")
        || normalized.contains("page not found")
        || normalized.contains("cannot post")
        || body.contains("请求的接口不存在")
}

fn parse_sse_event(raw_event: &str) -> Option<(String, String)> {
    let mut event_name = String::new();
    let mut data_lines = Vec::new();

    for line in raw_event.lines() {
        let trimmed = line.trim_end_matches('\r');
        if let Some(rest) = trimmed.strip_prefix("event:") {
            event_name = rest.trim().to_string();
        } else if let Some(rest) = trimmed.strip_prefix("data:") {
            data_lines.push(rest.trim_start().to_string());
        }
    }

    if event_name.is_empty() || data_lines.is_empty() {
        return None;
    }

    Some((event_name, data_lines.join("\n")))
}

fn extract_responses_image_generation_result(
    response_body_raw: &str,
) -> Result<(Value, Value), Box<TaskErrorRecord>> {
    let mut event_count = 0u32;
    let mut output_item_count = 0u32;

    for raw_event in response_body_raw.split("\n\n") {
        let Some((event_name, data_text)) = parse_sse_event(raw_event) else {
            continue;
        };
        event_count += 1;
        if data_text.trim() == "[DONE]" {
            continue;
        }
        if event_name != "response.output_item.done" {
            continue;
        }

        let parsed: Value = match serde_json::from_str(&data_text) {
            Ok(value) => value,
            Err(_) => continue,
        };
        let Some(item) = parsed.get("item").and_then(Value::as_object) else {
            continue;
        };
        output_item_count += 1;
        if item.get("type").and_then(Value::as_str) != Some("image_generation_call") {
            continue;
        }
        let image_item_id = item
            .get("id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned);
        let Some(result) = item
            .get("result")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };

        return Ok((
            json!({
                "url": format!("data:image/png;base64,{result}"),
                "revised_prompt": item
                    .get("revised_prompt")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty()),
                "source": IMAGE_EXECUTOR_MODE_RESPONSES_IMAGE_GENERATION,
            }),
            json!({
                "executor_mode": IMAGE_EXECUTOR_MODE_RESPONSES_IMAGE_GENERATION,
                "event_count": event_count,
                "output_item_count": output_item_count,
                "image_item_id": image_item_id,
            }),
        ));
    }

    Err(Box::new(build_image_task_error(
        "image_result_empty",
        "Responses 图片生成已返回成功，但 SSE 流里没有 image_generation_call.result",
        false,
        "result",
    )))
}

fn build_responses_image_generation_request_body(
    prepared_input: &ImageGenerationRequestInput,
    request_prompt: &str,
    task_id: &str,
    use_input_list: bool,
) -> Result<Value, TaskErrorRecord> {
    let request = build_openai_compatible_image_generation_llm_request(
        prepared_input,
        request_prompt,
        task_id,
        None,
    )?;
    let options = ResponsesImageGenerationOptions {
        outer_model: prepared_input.outer_model.clone(),
        input_shape: if use_input_list {
            ResponsesImageGenerationInputShape::InputList
        } else {
            ResponsesImageGenerationInputShape::PromptString
        },
    };
    build_responses_image_generation_body(&prepared_input.model, &request, &options).map_err(
        |error| {
            build_image_task_error(
                "responses_image_request_mapping_failed",
                format!("构建 Responses 图片生成请求失败: {error}"),
                false,
                "request",
            )
        },
    )
}

async fn send_responses_image_generation_request(
    client: &reqwest::Client,
    runner_config: &ImageGenerationRunnerConfig,
    prepared_input: &ImageGenerationRequestInput,
    request_prompt: &str,
    use_input_list: bool,
) -> Result<(StatusCode, String), TaskErrorRecord> {
    let request_body = build_responses_image_generation_request_body(
        prepared_input,
        request_prompt,
        "",
        use_input_list,
    )?;
    let endpoint = build_responses_image_generation_endpoint(&runner_config.endpoint);
    let response = with_optional_bearer_auth(client.post(&endpoint), &runner_config.api_key)
        .header("Accept", "text/event-stream")
        .json(&request_body)
        .send()
        .await
        .map_err(|error| {
            build_image_task_error(
                "image_request_failed",
                format!("调用 Responses 图片服务失败: {error}"),
                true,
                "request",
            )
        })?;

    let status = response.status();
    let body = response.text().await.map_err(|error| {
        build_image_task_error(
            "image_response_read_failed",
            format!("读取 Responses 图片服务响应失败: {error}"),
            false,
            "response",
        )
    })?;

    Ok((status, body))
}
