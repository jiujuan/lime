use std::path::Path;
use std::time::Duration;

use chrono::Utc;
use model_provider::lowering::{build_fal_video_generation_body, ProtocolMappingError};
use runtime_core::CanonicalRequest;
use serde_json::{json, Map, Value};

use super::model_route;
use super::task_artifact::read_payload_string;
use super::{
    llm_events, load_task_output, patch_task_artifact, MediaRuntimeError, MediaTaskOutput,
    TaskArtifactPatch, TaskErrorRecord, TaskProgress,
};

pub const VIDEO_TASK_RUNNER_WORKER_ID: &str = "media-video-api-worker";
const VIDEO_TASK_RUNNER_TIMEOUT_SECS: u64 = 300;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VideoGenerationRunnerConfig {
    pub endpoint: String,
    pub api_key: String,
}

#[derive(Debug, Clone, PartialEq)]
struct PreparedVideoTaskInput {
    prompt: String,
    provider_id: Option<String>,
    model: Option<String>,
    aspect_ratio: Option<String>,
    resolution: Option<String>,
    duration: Option<u64>,
    image_url: Option<String>,
    end_image_url: Option<String>,
    seed: Option<Value>,
    generate_audio: Option<bool>,
    camera_fixed: Option<bool>,
}

pub async fn execute_video_generation_task(
    workspace_root: &Path,
    task_id: &str,
    runner_config: &VideoGenerationRunnerConfig,
) -> Result<MediaTaskOutput, MediaRuntimeError> {
    execute_video_generation_task_with_hook(workspace_root, task_id, runner_config, |_| {}).await
}

pub async fn execute_video_generation_task_with_hook<F>(
    workspace_root: &Path,
    task_id: &str,
    runner_config: &VideoGenerationRunnerConfig,
    mut on_update: F,
) -> Result<MediaTaskOutput, MediaRuntimeError>
where
    F: FnMut(&MediaTaskOutput) + Send,
{
    let current = load_current_video_task(workspace_root, task_id)?;
    if matches!(
        current.normalized_status.as_str(),
        "cancelled" | "failed" | "succeeded" | "partial"
    ) {
        return Ok(current);
    }

    let queued_output = if current.normalized_status == "pending" {
        let output = patch_video_task(
            workspace_root,
            task_id,
            TaskArtifactPatch {
                status: Some("queued".to_string()),
                progress: Some(build_video_task_progress(
                    "queued",
                    "视频任务已进入队列，等待视频服务响应。".to_string(),
                    Some(0),
                )),
                current_attempt_worker_id: Some(Some(VIDEO_TASK_RUNNER_WORKER_ID.to_string())),
                ..TaskArtifactPatch::default()
            },
        )?;
        on_update(&output);
        output
    } else {
        current
    };

    if queued_output.normalized_status == "cancelled" {
        return Ok(queued_output);
    }

    let routed_output = match apply_video_route_preflight(
        workspace_root,
        task_id,
        queued_output,
        &mut on_update,
    )? {
        Ok(output) => output,
        Err(task_error) => {
            return mark_video_task_failed(workspace_root, task_id, task_error, &mut on_update);
        }
    };

    let prepared_input = match prepare_video_task_input(&routed_output) {
        Ok(prepared_input) => prepared_input,
        Err(message) => {
            let task_error =
                build_video_task_error("invalid_video_task_payload", message, false, "payload");
            return mark_video_task_failed(workspace_root, task_id, task_error, &mut on_update);
        }
    };

    let running_output = patch_video_task(
        workspace_root,
        task_id,
        TaskArtifactPatch {
            status: Some("running".to_string()),
            payload_patch: Some(llm_events::video_running_payload_patch(
                &routed_output.record.payload,
            )),
            progress: Some(build_video_task_progress(
                "running",
                "视频生成中，结果会自动回填到对话与工作台。".to_string(),
                None,
            )),
            current_attempt_worker_id: Some(Some(VIDEO_TASK_RUNNER_WORKER_ID.to_string())),
            ..TaskArtifactPatch::default()
        },
    )?;
    on_update(&running_output);

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(VIDEO_TASK_RUNNER_TIMEOUT_SECS))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let response_body = match request_video_generation_for_executor(
        &client,
        runner_config,
        &prepared_input,
        task_id,
    )
    .await
    {
        Ok(response_body) => response_body,
        Err(task_error) => {
            return mark_video_task_failed(workspace_root, task_id, task_error, &mut on_update);
        }
    };

    let video = match extract_generated_video(&response_body) {
        Some(video) => video,
        None => {
            let task_error = build_video_task_error(
                "video_result_empty",
                "视频服务未返回可用结果",
                false,
                "result",
            );
            return mark_video_task_failed(workspace_root, task_id, task_error, &mut on_update);
        }
    };

    let latest = load_current_video_task(workspace_root, task_id)?;
    if latest.normalized_status == "cancelled" {
        return Ok(latest);
    }

    let completed = patch_video_task(
        workspace_root,
        task_id,
        TaskArtifactPatch {
            status: Some("succeeded".to_string()),
            payload_patch: Some(llm_events::video_completed_payload_patch(
                &latest.record.payload,
                video.get("url").and_then(Value::as_str),
            )),
            result: Some(Some(build_video_task_result_value(
                &prepared_input,
                video,
                response_body,
            ))),
            last_error: Some(None),
            progress: Some(build_video_task_progress(
                "succeeded",
                "视频任务已完成。".to_string(),
                Some(100),
            )),
            current_attempt_worker_id: Some(Some(VIDEO_TASK_RUNNER_WORKER_ID.to_string())),
            ..TaskArtifactPatch::default()
        },
    )?;
    on_update(&completed);
    Ok(completed)
}

fn load_current_video_task(
    workspace_root: &Path,
    task_id: &str,
) -> Result<MediaTaskOutput, MediaRuntimeError> {
    load_task_output(workspace_root, task_id, None)
}

fn patch_video_task(
    workspace_root: &Path,
    task_id: &str,
    patch: TaskArtifactPatch,
) -> Result<MediaTaskOutput, MediaRuntimeError> {
    patch_task_artifact(workspace_root, task_id, None, patch)
}

fn mark_video_task_failed<F>(
    workspace_root: &Path,
    task_id: &str,
    error: TaskErrorRecord,
    on_update: &mut F,
) -> Result<MediaTaskOutput, MediaRuntimeError>
where
    F: FnMut(&MediaTaskOutput),
{
    let current = load_current_video_task(workspace_root, task_id)?;
    if current.normalized_status == "cancelled" {
        return Ok(current);
    }

    let output = patch_video_task(
        workspace_root,
        task_id,
        TaskArtifactPatch {
            status: Some("failed".to_string()),
            payload_patch: Some(llm_events::video_failed_payload_patch(
                &current.record.payload,
                &error,
            )),
            last_error: Some(Some(error.clone())),
            progress: Some(build_video_task_progress(
                "failed",
                error.message.clone(),
                None,
            )),
            current_attempt_worker_id: Some(Some(VIDEO_TASK_RUNNER_WORKER_ID.to_string())),
            ..TaskArtifactPatch::default()
        },
    )?;
    on_update(&output);
    Ok(output)
}

fn prepare_video_task_input(task: &MediaTaskOutput) -> Result<PreparedVideoTaskInput, String> {
    let payload = &task.record.payload;
    let resolved_route = model_route::resolved_model_route_from_payload(payload);
    let prompt = read_payload_string(payload, &["prompt"])
        .ok_or_else(|| "视频任务缺少 prompt，无法继续执行".to_string())?;

    Ok(PreparedVideoTaskInput {
        prompt,
        provider_id: resolved_route
            .as_ref()
            .and_then(|route| route.provider_id.clone())
            .or_else(|| read_payload_string(payload, &["provider_id", "providerId"])),
        model: resolved_route
            .as_ref()
            .and_then(|route| route.model_id.clone())
            .or_else(|| read_payload_string(payload, &["model"])),
        aspect_ratio: read_payload_string(payload, &["aspect_ratio", "aspectRatio"]),
        resolution: read_payload_string(payload, &["resolution"]),
        duration: read_payload_u64(payload, &["duration"]),
        image_url: read_payload_string(payload, &["image_url", "imageUrl"]),
        end_image_url: read_payload_string(payload, &["end_image_url", "endImageUrl"]),
        seed: read_payload_scalar(payload, &["seed"]),
        generate_audio: read_payload_bool(payload, &["generate_audio", "generateAudio"]),
        camera_fixed: read_payload_bool(payload, &["camera_fixed", "cameraFixed"]),
    })
}

fn apply_video_route_preflight(
    workspace_root: &Path,
    task_id: &str,
    output: MediaTaskOutput,
    on_update: &mut impl FnMut(&MediaTaskOutput),
) -> Result<Result<MediaTaskOutput, TaskErrorRecord>, MediaRuntimeError> {
    let preflight = model_route::video_route_payload_preflight(&output.record.payload);
    if let Some(failure) = preflight.failure {
        return Ok(Err(build_video_task_error(
            &failure.code,
            failure.message,
            failure.retryable,
            "routing",
        )));
    };
    let Some(payload_patch) = preflight.payload_patch else {
        return Ok(Ok(output));
    };

    let migrated = patch_video_task(
        workspace_root,
        task_id,
        TaskArtifactPatch {
            payload_patch: Some(payload_patch),
            current_attempt_worker_id: Some(Some(VIDEO_TASK_RUNNER_WORKER_ID.to_string())),
            ..TaskArtifactPatch::default()
        },
    )?;
    on_update(&migrated);
    Ok(Ok(migrated))
}

async fn request_video_generation_for_executor(
    client: &reqwest::Client,
    runner_config: &VideoGenerationRunnerConfig,
    prepared_input: &PreparedVideoTaskInput,
    task_id: &str,
) -> Result<Value, TaskErrorRecord> {
    let endpoint = runner_config.endpoint.trim();
    if endpoint.is_empty() {
        return Err(build_video_task_error(
            "video_endpoint_missing",
            "视频服务 endpoint 不能为空",
            false,
            "request",
        ));
    }

    let mut request = client
        .post(endpoint)
        .bearer_auth(runner_config.api_key.trim())
        .json(&build_video_generation_request_body(
            prepared_input,
            task_id,
        )?);
    if let Some(provider_id) = prepared_input.provider_id.as_deref() {
        request = request.header("X-Provider-Id", provider_id);
    }

    let response = request.send().await.map_err(|error| {
        build_video_task_error(
            "video_provider_request_error",
            format!("请求视频服务失败: {error}"),
            true,
            "request",
        )
    })?;
    let status = response.status();
    let response_text = response.text().await.map_err(|error| {
        build_video_task_error(
            "video_provider_response_read_error",
            format!("读取视频服务响应失败: {error}"),
            true,
            "response",
        )
    })?;

    if !status.is_success() {
        return Err(build_video_task_provider_error(
            "video_provider_request_failed",
            format!(
                "视频服务返回 HTTP {}: {}",
                status.as_u16(),
                summarize_provider_body(&response_text)
            ),
            status.is_server_error(),
            "request",
            Some(status.as_u16().to_string()),
        ));
    }

    serde_json::from_str::<Value>(&response_text).map_err(|error| {
        build_video_task_error(
            "video_provider_response_invalid",
            format!("解析视频服务响应失败: {error}"),
            false,
            "response",
        )
    })
}

fn build_video_generation_request_body(
    prepared_input: &PreparedVideoTaskInput,
    task_id: &str,
) -> Result<Value, TaskErrorRecord> {
    let request = video_generation_llm_request(prepared_input, task_id);
    build_fal_video_generation_body(prepared_input.model.as_deref().unwrap_or(""), &request)
        .map_err(|error| video_request_mapping_error(error))
}

fn video_generation_llm_request(
    prepared_input: &PreparedVideoTaskInput,
    task_id: &str,
) -> CanonicalRequest {
    let mut provider_options = std::collections::BTreeMap::new();
    insert_string_metadata(
        &mut provider_options,
        "provider_id",
        prepared_input.provider_id.as_deref(),
    );
    insert_string_metadata(
        &mut provider_options,
        "aspect_ratio",
        prepared_input.aspect_ratio.as_deref(),
    );
    insert_string_metadata(
        &mut provider_options,
        "resolution",
        prepared_input.resolution.as_deref(),
    );
    insert_string_metadata(
        &mut provider_options,
        "image_url",
        prepared_input.image_url.as_deref(),
    );
    insert_string_metadata(
        &mut provider_options,
        "end_image_url",
        prepared_input.end_image_url.as_deref(),
    );
    insert_string_metadata(&mut provider_options, "user", Some(task_id));
    if let Some(duration) = prepared_input.duration {
        provider_options.insert("duration".to_string(), json!(duration));
    }
    if let Some(seed) = prepared_input.seed.as_ref() {
        provider_options.insert("seed".to_string(), seed.clone());
    }
    if let Some(generate_audio) = prepared_input.generate_audio {
        provider_options.insert("generate_audio".to_string(), json!(generate_audio));
    }
    if let Some(camera_fixed) = prepared_input.camera_fixed {
        provider_options.insert("camera_fixed".to_string(), json!(camera_fixed));
    }

    let mut request = CanonicalRequest::text(
        prepared_input.model.as_deref().unwrap_or_default(),
        prepared_input.prompt.clone(),
    );
    request.provider_options = provider_options;
    request
}

fn video_request_mapping_error(error: ProtocolMappingError) -> TaskErrorRecord {
    build_video_task_error(
        "video_request_mapping_failed",
        format!("构建视频生成请求失败: {error}"),
        false,
        "request",
    )
}

fn extract_generated_video(response_body: &Value) -> Option<Value> {
    response_body
        .get("data")
        .and_then(Value::as_array)
        .and_then(|items| items.iter().find_map(extract_video_from_candidate))
        .or_else(|| {
            response_body
                .get("video")
                .and_then(extract_video_from_candidate)
        })
        .or_else(|| extract_video_from_candidate(response_body))
}

fn extract_video_from_candidate(candidate: &Value) -> Option<Value> {
    let record = candidate.as_object()?;
    let url = record
        .get("url")
        .or_else(|| record.get("video_url"))
        .or_else(|| record.get("videoUrl"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())?;

    let mut video = Map::new();
    video.insert("url".to_string(), json!(url));
    for key in [
        "id",
        "mime_type",
        "mimeType",
        "duration",
        "width",
        "height",
        "thumbnail_url",
        "thumbnailUrl",
    ] {
        if let Some(value) = record.get(key) {
            video.insert(key.to_string(), value.clone());
        }
    }
    Some(Value::Object(video))
}

fn build_video_task_result_value(
    prepared_input: &PreparedVideoTaskInput,
    video: Value,
    response_body: Value,
) -> Value {
    json!({
        "prompt": prepared_input.prompt,
        "provider_id": prepared_input.provider_id,
        "model": prepared_input.model,
        "video": video,
        "response": response_body,
    })
}

fn build_video_task_progress(phase: &str, message: String, percent: Option<u32>) -> TaskProgress {
    TaskProgress {
        phase: Some(phase.to_string()),
        percent,
        message: Some(message),
        preview_slots: Vec::new(),
    }
}

fn build_video_task_error(
    code: &str,
    message: impl Into<String>,
    retryable: bool,
    stage: &str,
) -> TaskErrorRecord {
    build_video_task_provider_error(code, message, retryable, stage, None)
}

fn build_video_task_provider_error(
    code: &str,
    message: impl Into<String>,
    retryable: bool,
    stage: &str,
    provider_code: Option<String>,
) -> TaskErrorRecord {
    TaskErrorRecord {
        code: code.to_string(),
        message: message.into(),
        retryable,
        stage: Some(stage.to_string()),
        provider_code,
        occurred_at: Some(Utc::now().to_rfc3339()),
    }
}

fn insert_string_metadata(
    map: &mut std::collections::BTreeMap<String, Value>,
    key: &str,
    value: Option<&str>,
) {
    if let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) {
        map.insert(key.to_string(), json!(value));
    }
}

fn read_payload_u64(payload: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter().find_map(|key| {
        let value = payload.get(*key)?;
        value
            .as_u64()
            .or_else(|| value.as_str().and_then(|item| item.trim().parse().ok()))
    })
}

fn read_payload_bool(payload: &Value, keys: &[&str]) -> Option<bool> {
    keys.iter().find_map(|key| {
        let value = payload.get(*key)?;
        value.as_bool().or_else(|| match value.as_str()?.trim() {
            "true" | "1" | "yes" => Some(true),
            "false" | "0" | "no" => Some(false),
            _ => None,
        })
    })
}

fn read_payload_scalar(payload: &Value, keys: &[&str]) -> Option<Value> {
    keys.iter().find_map(|key| {
        let value = payload.get(*key)?;
        match value {
            Value::Null | Value::Array(_) | Value::Object(_) => None,
            other => Some(other.clone()),
        }
    })
}

fn summarize_provider_body(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.chars().count() <= 240 {
        return trimmed.to_string();
    }

    let summary: String = trimmed.chars().take(240).collect();
    format!("{summary}...")
}
