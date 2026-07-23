use serde_json::{json, Value};

use crate::{ImageGenerationRunnerConfig, TaskErrorRecord};

mod dashscope;
mod error;
mod gemini;
mod openai_images;
mod responses;
mod zhipu;

use dashscope::request_single_dashscope_image_generation;
use error::{
    build_image_provider_http_error, build_image_task_error, read_response_error_code,
    read_response_error_message,
};
use gemini::request_single_gemini_image_generation;
use openai_images::request_single_image_generation;
#[cfg(test)]
pub(crate) use responses::build_responses_image_generation_endpoint;
use responses::request_single_responses_image_generation;
use zhipu::request_single_zhipu_image_generation;

fn with_optional_bearer_auth(
    request: reqwest::RequestBuilder,
    api_key: &str,
) -> reqwest::RequestBuilder {
    let api_key = api_key.trim();
    if api_key.is_empty() {
        request
    } else {
        request.bearer_auth(api_key)
    }
}

pub(crate) const IMAGE_EXECUTOR_MODE_IMAGES_API: &str = "images_api";
pub(crate) const IMAGE_EXECUTOR_MODE_RESPONSES_IMAGE_GENERATION: &str =
    "responses_image_generation";
pub(crate) const IMAGE_EXECUTOR_MODE_GEMINI_GENERATE_CONTENT: &str = "gemini_generate_content";
pub(crate) const IMAGE_EXECUTOR_MODE_DASHSCOPE_IMAGES: &str = "dashscope_images";
pub(crate) const IMAGE_EXECUTOR_MODE_ZHIPU_IMAGES: &str = "zhipu_images";

#[derive(Debug, Clone)]
pub(super) struct ImageGenerationRequestInput {
    pub(super) model: String,
    pub(super) size: Option<String>,
    pub(super) style: Option<String>,
    pub(super) provider_id: Option<String>,
    pub(super) executor_mode: String,
    pub(super) outer_model: Option<String>,
    pub(super) reference_image_urls: Vec<String>,
}

pub(super) fn normalize_image_generation_executor_mode(value: Option<String>) -> String {
    match value
        .as_deref()
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(|item| item.to_ascii_lowercase().replace('-', "_"))
        .as_deref()
    {
        Some("responses")
        | Some("responses_api")
        | Some("response_api")
        | Some("image_generation_tool")
        | Some("responses_image_generation") => {
            IMAGE_EXECUTOR_MODE_RESPONSES_IMAGE_GENERATION.to_string()
        }
        Some("gemini")
        | Some("google")
        | Some("google_image_generation")
        | Some("gemini_generate_content") => {
            IMAGE_EXECUTOR_MODE_GEMINI_GENERATE_CONTENT.to_string()
        }
        Some("dashscope")
        | Some("dashscope_images")
        | Some("dashscope_image_generation")
        | Some("dashscope_multimodal_generation")
        | Some("alibaba")
        | Some("qwen_image")
        | Some("wanx")
        | Some("wanxiang") => IMAGE_EXECUTOR_MODE_DASHSCOPE_IMAGES.to_string(),
        Some("zhipu")
        | Some("zhipuai")
        | Some("zhipu_images")
        | Some("zhipu_image_generation")
        | Some("bigmodel")
        | Some("glm_image")
        | Some("cogview") => IMAGE_EXECUTOR_MODE_ZHIPU_IMAGES.to_string(),
        _ => IMAGE_EXECUTOR_MODE_IMAGES_API.to_string(),
    }
}

pub(super) async fn request_single_image_generation_for_executor(
    client: &reqwest::Client,
    runner_config: &ImageGenerationRunnerConfig,
    prepared_input: &ImageGenerationRequestInput,
    request_prompt: &str,
    task_id: &str,
) -> Result<(Value, Value), TaskErrorRecord> {
    if is_responses_image_generation_executor(&prepared_input.executor_mode) {
        return match request_single_responses_image_generation(
            client,
            runner_config,
            prepared_input,
            request_prompt,
        )
        .await
        {
            Ok(result) => Ok(result),
            Err(error) if error.code == "responses_image_generation_endpoint_not_found" => {
                let (mut image, response) = request_single_image_generation(
                    client,
                    runner_config,
                    prepared_input,
                    request_prompt,
                    task_id,
                )
                .await?;
                if let Some(image_object) = image.as_object_mut() {
                    image_object.insert(
                        "source".to_string(),
                        json!(IMAGE_EXECUTOR_MODE_RESPONSES_IMAGE_GENERATION),
                    );
                    image_object.insert(
                        "fallback_source".to_string(),
                        json!(IMAGE_EXECUTOR_MODE_IMAGES_API),
                    );
                }
                Ok((
                    image,
                    json!({
                        "executor_mode": IMAGE_EXECUTOR_MODE_RESPONSES_IMAGE_GENERATION,
                        "fallback_executor_mode": IMAGE_EXECUTOR_MODE_IMAGES_API,
                        "fallback_reason": error.message,
                        "response": response,
                    }),
                ))
            }
            Err(error) => Err(error),
        };
    }

    if is_gemini_generate_content_executor(&prepared_input.executor_mode) {
        return request_single_gemini_image_generation(
            client,
            runner_config,
            prepared_input,
            request_prompt,
        )
        .await;
    }

    if is_dashscope_images_executor(&prepared_input.executor_mode) {
        return request_single_dashscope_image_generation(
            client,
            runner_config,
            prepared_input,
            request_prompt,
        )
        .await;
    }

    if is_zhipu_images_executor(&prepared_input.executor_mode) {
        return request_single_zhipu_image_generation(
            client,
            runner_config,
            prepared_input,
            request_prompt,
            task_id,
        )
        .await;
    }

    request_single_image_generation(
        client,
        runner_config,
        prepared_input,
        request_prompt,
        task_id,
    )
    .await
}

fn is_responses_image_generation_executor(mode: &str) -> bool {
    mode == IMAGE_EXECUTOR_MODE_RESPONSES_IMAGE_GENERATION
}

fn is_gemini_generate_content_executor(mode: &str) -> bool {
    mode == IMAGE_EXECUTOR_MODE_GEMINI_GENERATE_CONTENT
}

fn is_zhipu_images_executor(mode: &str) -> bool {
    mode == IMAGE_EXECUTOR_MODE_ZHIPU_IMAGES
}

fn is_dashscope_images_executor(mode: &str) -> bool {
    mode == IMAGE_EXECUTOR_MODE_DASHSCOPE_IMAGES
}

pub(super) fn summarize_response_body(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return "响应体为空".to_string();
    }

    let preview: String = trimmed.chars().take(240).collect();
    if trimmed.chars().count() > preview.chars().count() {
        format!("{preview}...")
    } else {
        preview
    }
}

#[cfg(test)]
mod tests {
    use super::with_optional_bearer_auth;

    #[test]
    fn optional_bearer_auth_omits_header_for_keyless_route() {
        let client = reqwest::Client::new();
        let keyless = with_optional_bearer_auth(client.get("http://127.0.0.1"), "")
            .build()
            .expect("build keyless request");
        let authenticated = with_optional_bearer_auth(client.get("http://127.0.0.1"), "secret")
            .build()
            .expect("build authenticated request");

        assert!(!keyless
            .headers()
            .contains_key(reqwest::header::AUTHORIZATION));
        assert_eq!(
            authenticated
                .headers()
                .get(reqwest::header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok()),
            Some("Bearer secret")
        );
    }
}
