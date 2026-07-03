use std::path::Path;
use std::time::Duration;

use serde_json::{json, Value};
use tokio::task::JoinSet;

use super::image_postprocess::infer_image_postprocess_outcome;
use super::image_request::request_single_image_generation_for_executor;
use super::image_task_audit::record_image_task_audit_event;
use super::image_task_input::{image_generation_request_input, prepare_image_task_input};
use super::image_worker_state::{
    apply_image_route_preflight, load_current_image_task, mark_image_task_failed, patch_image_task,
};
use super::{MediaRuntimeError, MediaTaskOutput, TaskErrorRecord};
use crate::{llm_events, TaskArtifactPatch};

pub const IMAGE_TASK_RUNNER_WORKER_ID: &str = "lime-image-api-worker";
pub const IMAGE_TASK_RUNNER_TIMEOUT_SECS: u64 = 300;
pub const AGNES_IMAGE_TASK_RUNNER_TIMEOUT_SECS: u64 = 120;
pub const IMAGE_TASK_MAX_PARALLEL_REQUESTS: usize = 3;
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImageGenerationRunnerConfig {
    pub endpoint: String,
    pub api_key: String,
    pub request_body_format: ImageGenerationRequestBodyFormat,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageGenerationRequestBodyFormat {
    OpenaiImages,
    AgnesImages,
}

pub(crate) fn image_task_runner_timeout_secs(
    request_body_format: ImageGenerationRequestBodyFormat,
) -> u64 {
    match request_body_format {
        ImageGenerationRequestBodyFormat::AgnesImages => AGNES_IMAGE_TASK_RUNNER_TIMEOUT_SECS,
        ImageGenerationRequestBodyFormat::OpenaiImages => IMAGE_TASK_RUNNER_TIMEOUT_SECS,
    }
}

impl Default for ImageGenerationRequestBodyFormat {
    fn default() -> Self {
        Self::OpenaiImages
    }
}

impl ImageGenerationRequestBodyFormat {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OpenaiImages => "openai_images",
            Self::AgnesImages => "agnes_images",
        }
    }
}

pub fn normalize_image_generation_service_host(host: &str) -> String {
    let trimmed = host.trim();
    if trimmed.is_empty() || trimmed == "0.0.0.0" || trimmed == "::" {
        return "127.0.0.1".to_string();
    }
    if trimmed.starts_with('[') && trimmed.ends_with(']') {
        return trimmed.to_string();
    }
    if trimmed.contains(':') {
        return format!("[{trimmed}]");
    }
    trimmed.to_string()
}

pub fn build_image_generation_endpoint(host: &str, port: u16) -> String {
    format!(
        "http://{}:{port}/v1/images/generations",
        normalize_image_generation_service_host(host)
    )
}

pub(crate) use super::image_worker_progress::{
    build_failed_slot_value, build_image_task_error, build_image_task_progress,
    build_image_task_progress_with_preview, build_image_task_result_value, build_preview_slots,
    build_running_image_task_message, decorate_generated_image_with_slot_with_postprocess_outcome,
    decorate_response_with_slot, flatten_task_slot_values,
};

#[cfg(test)]
pub(crate) use super::image_worker_progress::decorate_generated_image_with_slot;

pub async fn execute_image_generation_task(
    workspace_root: &Path,
    task_id: &str,
    runner_config: &ImageGenerationRunnerConfig,
) -> Result<MediaTaskOutput, MediaRuntimeError> {
    execute_image_generation_task_with_hook(workspace_root, task_id, runner_config, |_| {}).await
}

pub async fn execute_image_generation_task_with_hook<F>(
    workspace_root: &Path,
    task_id: &str,
    runner_config: &ImageGenerationRunnerConfig,
    mut on_update: F,
) -> Result<MediaTaskOutput, MediaRuntimeError>
where
    F: FnMut(&MediaTaskOutput) + Send,
{
    let current = load_current_image_task(workspace_root, task_id)?;
    record_image_task_audit_event(
        workspace_root,
        &current,
        "worker_loaded",
        json!({
            "request_body_format": runner_config.request_body_format.as_str(),
        }),
    );
    if matches!(
        current.normalized_status.as_str(),
        "cancelled" | "failed" | "succeeded" | "partial"
    ) {
        record_image_task_audit_event(
            workspace_root,
            &current,
            "worker_skipped_terminal_task",
            json!({
                "reason": "terminal_status",
            }),
        );
        return Ok(current);
    }

    let queued_output = if current.normalized_status == "pending" {
        let output = patch_image_task(
            workspace_root,
            task_id,
            TaskArtifactPatch {
                status: Some("queued".to_string()),
                progress: Some(build_image_task_progress(
                    "queued",
                    "图片任务已进入队列，等待图片服务响应。".to_string(),
                    Some(0),
                )),
                current_attempt_worker_id: Some(Some(IMAGE_TASK_RUNNER_WORKER_ID.to_string())),
                ..TaskArtifactPatch::default()
            },
        )?;
        record_image_task_audit_event(
            workspace_root,
            &output,
            "task_queued",
            json!({
                "request_body_format": runner_config.request_body_format.as_str(),
            }),
        );
        on_update(&output);
        output
    } else {
        current
    };

    if queued_output.normalized_status == "cancelled" {
        return Ok(queued_output);
    }

    let routed_output = match apply_image_route_preflight(
        workspace_root,
        task_id,
        queued_output,
        &mut on_update,
    )? {
        Ok(output) => output,
        Err(task_error) => {
            let failed =
                mark_image_task_failed(workspace_root, task_id, task_error, &mut on_update)?;
            record_image_task_audit_event(
                workspace_root,
                &failed,
                "task_failed",
                json!({
                    "stage": "route_preflight",
                    "error": failed.last_error.clone(),
                }),
            );
            return Ok(failed);
        }
    };

    let prepared_input = match prepare_image_task_input(&routed_output) {
        Ok(prepared_input) => prepared_input,
        Err(message) => {
            let task_error =
                build_image_task_error("invalid_image_task_payload", message, false, "payload");
            let failed =
                mark_image_task_failed(workspace_root, task_id, task_error, &mut on_update)?;
            record_image_task_audit_event(
                workspace_root,
                &failed,
                "task_failed",
                json!({
                    "stage": "payload",
                    "error": failed.last_error.clone(),
                }),
            );
            return Ok(failed);
        }
    };

    let requested_count = prepared_input.request_slots.len().max(1);
    let running_output = patch_image_task(
        workspace_root,
        task_id,
        TaskArtifactPatch {
            status: Some("running".to_string()),
            progress: Some(build_image_task_progress_with_preview(
                "running",
                "图片生成中，结果会自动回填到对话与画布。".to_string(),
                None,
                build_preview_slots(
                    &prepared_input.request_slots,
                    &vec!["queued".to_string(); prepared_input.request_slots.len()],
                ),
            )),
            current_attempt_worker_id: Some(Some(IMAGE_TASK_RUNNER_WORKER_ID.to_string())),
            ..TaskArtifactPatch::default()
        },
    )?;
    record_image_task_audit_event(
        workspace_root,
        &running_output,
        "task_running",
        json!({
            "executor_mode": prepared_input.executor_mode.clone(),
            "request_body_format": runner_config.request_body_format.as_str(),
            "requested_count": requested_count,
            "reference_image_count": prepared_input.reference_images.len(),
        }),
    );
    on_update(&running_output);

    let request_timeout_secs = image_task_runner_timeout_secs(runner_config.request_body_format);
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(request_timeout_secs))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    let mut images: Vec<Option<Value>> = vec![None; requested_count];
    let mut responses: Vec<Option<Value>> = vec![None; requested_count];
    let mut failures: Vec<Option<Value>> = vec![None; requested_count];
    let mut slot_statuses = vec!["queued".to_string(); requested_count];
    let mut first_error: Option<TaskErrorRecord> = None;
    let request_input = image_generation_request_input(&prepared_input);

    for batch_start in (0..requested_count).step_by(IMAGE_TASK_MAX_PARALLEL_REQUESTS) {
        let latest = load_current_image_task(workspace_root, task_id)?;
        if latest.normalized_status == "cancelled" {
            return Ok(latest);
        }

        let mut join_set = JoinSet::new();
        let batch_end = (batch_start + IMAGE_TASK_MAX_PARALLEL_REQUESTS).min(requested_count);
        for request_slot in prepared_input.request_slots[batch_start..batch_end]
            .iter()
            .cloned()
        {
            record_image_task_audit_event(
                workspace_root,
                &latest,
                "request_slot_started",
                json!({
                    "slot_index": request_slot.slot_index,
                    "slot_id": request_slot.slot_id,
                    "request_body_format": runner_config.request_body_format.as_str(),
                    "executor_mode": prepared_input.executor_mode.clone(),
                    "prompt_chars": request_slot.prompt.chars().count(),
                }),
            );
            let client = client.clone();
            let runner_config = runner_config.clone();
            let request_input = request_input.clone();
            let task_id = task_id.to_string();
            join_set.spawn(async move {
                (
                    request_slot.clone(),
                    request_single_image_generation_for_executor(
                        &client,
                        &runner_config,
                        &request_input,
                        &request_slot.prompt,
                        &task_id,
                    )
                    .await,
                )
            });
        }

        let mut batch_saw_non_retryable_failure = false;
        while let Some(joined) = join_set.join_next().await {
            let (request_slot, result) = match joined {
                Ok(payload) => payload,
                Err(error) => {
                    let task_error = build_image_task_error(
                        "image_request_join_failed",
                        format!("等待图片服务任务失败: {error}"),
                        false,
                        "request",
                    );
                    let slot_index = batch_start;
                    if first_error.is_none() {
                        first_error = Some(task_error.clone());
                    }
                    if let Some(slot_status) = slot_statuses.get_mut(slot_index) {
                        *slot_status = "error".to_string();
                    }
                    failures[slot_index] = Some(json!({
                        "slot_index": slot_index + 1,
                        "error": task_error.clone(),
                    }));
                    let latest = load_current_image_task(workspace_root, task_id)?;
                    if latest.normalized_status == "cancelled" {
                        return Ok(latest);
                    }
                    let progress_message = build_running_image_task_message(
                        requested_count,
                        images.iter().filter(|value| value.is_some()).count(),
                        failures.iter().filter(|value| value.is_some()).count(),
                    );
                    let running_snapshot = patch_image_task(
                        workspace_root,
                        task_id,
                        TaskArtifactPatch {
                            payload_patch: Some(llm_events::image_running_payload_patch(
                                &latest.record.payload,
                                &prepared_input.executor_mode,
                                images.iter().filter(|value| value.is_some()).count(),
                                failures.iter().filter(|value| value.is_some()).count(),
                                requested_count,
                            )),
                            result: Some(Some(build_image_task_result_value(
                                &prepared_input,
                                requested_count as u32,
                                &flatten_task_slot_values(&images),
                                &flatten_task_slot_values(&responses),
                                &flatten_task_slot_values(&failures),
                            ))),
                            progress: Some(build_image_task_progress_with_preview(
                                "running",
                                progress_message,
                                Some(
                                    (((images.iter().filter(|value| value.is_some()).count()
                                        + failures.iter().filter(|value| value.is_some()).count())
                                        * 100)
                                        / requested_count)
                                        as u32,
                                ),
                                build_preview_slots(&prepared_input.request_slots, &slot_statuses),
                            )),
                            current_attempt_worker_id: Some(Some(
                                IMAGE_TASK_RUNNER_WORKER_ID.to_string(),
                            )),
                            ..TaskArtifactPatch::default()
                        },
                    )?;
                    record_image_task_audit_event(
                        workspace_root,
                        &running_snapshot,
                        "request_slot_failed",
                        json!({
                            "slot_index": slot_index + 1,
                            "stage": "join",
                            "error": task_error,
                            "completed_count": images.iter().filter(|value| value.is_some()).count(),
                            "failed_count": failures.iter().filter(|value| value.is_some()).count(),
                        }),
                    );
                    on_update(&running_snapshot);
                    continue;
                }
            };

            let slot_position = request_slot.slot_index.saturating_sub(1) as usize;
            let mut slot_audit_event = "request_slot_failed";
            let slot_audit_details: Value;
            match result {
                Ok((image, response_body)) => {
                    slot_audit_event = "request_slot_succeeded";
                    let image_url = image
                        .get("url")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(ToOwned::to_owned);
                    let response_data_count = response_body
                        .get("data")
                        .and_then(Value::as_array)
                        .map(Vec::len);
                    let postprocess_outcome =
                        if let Some(plan) = prepared_input.postprocess_plan.as_ref() {
                            Some(infer_image_postprocess_outcome(&client, &image, plan).await)
                        } else {
                            None
                        };
                    images[slot_position] =
                        Some(decorate_generated_image_with_slot_with_postprocess_outcome(
                            image,
                            &request_slot,
                            prepared_input.postprocess_plan.as_ref(),
                            postprocess_outcome.as_ref(),
                        ));
                    responses[slot_position] =
                        Some(decorate_response_with_slot(response_body, &request_slot));
                    slot_statuses[slot_position] = "complete".to_string();
                    slot_audit_details = json!({
                        "slot_index": request_slot.slot_index,
                        "slot_id": request_slot.slot_id,
                        "has_url": image_url.is_some(),
                        "response_data_count": response_data_count,
                    });
                }
                Err(task_error) => {
                    batch_saw_non_retryable_failure |= !task_error.retryable;
                    if first_error.is_none() {
                        first_error = Some(task_error.clone());
                    }
                    slot_statuses[slot_position] = "error".to_string();
                    slot_audit_details = json!({
                        "slot_index": request_slot.slot_index,
                        "slot_id": request_slot.slot_id,
                        "error": task_error.clone(),
                    });
                    failures[slot_position] =
                        Some(build_failed_slot_value(&request_slot, task_error));
                }
            }

            let latest = load_current_image_task(workspace_root, task_id)?;
            if latest.normalized_status == "cancelled" {
                return Ok(latest);
            }

            let progress_message = build_running_image_task_message(
                requested_count,
                images.iter().filter(|value| value.is_some()).count(),
                failures.iter().filter(|value| value.is_some()).count(),
            );
            let running_snapshot = patch_image_task(
                workspace_root,
                task_id,
                TaskArtifactPatch {
                    payload_patch: Some(llm_events::image_running_payload_patch(
                        &latest.record.payload,
                        &prepared_input.executor_mode,
                        images.iter().filter(|value| value.is_some()).count(),
                        failures.iter().filter(|value| value.is_some()).count(),
                        requested_count,
                    )),
                    result: Some(Some(build_image_task_result_value(
                        &prepared_input,
                        requested_count as u32,
                        &flatten_task_slot_values(&images),
                        &flatten_task_slot_values(&responses),
                        &flatten_task_slot_values(&failures),
                    ))),
                    progress: Some(build_image_task_progress_with_preview(
                        "running",
                        progress_message,
                        Some(
                            (((images.iter().filter(|value| value.is_some()).count()
                                + failures.iter().filter(|value| value.is_some()).count())
                                * 100)
                                / requested_count) as u32,
                        ),
                        build_preview_slots(&prepared_input.request_slots, &slot_statuses),
                    )),
                    current_attempt_worker_id: Some(Some(IMAGE_TASK_RUNNER_WORKER_ID.to_string())),
                    ..TaskArtifactPatch::default()
                },
            )?;
            record_image_task_audit_event(
                workspace_root,
                &running_snapshot,
                slot_audit_event,
                json!({
                    "slot": slot_audit_details,
                    "completed_count": images.iter().filter(|value| value.is_some()).count(),
                    "failed_count": failures.iter().filter(|value| value.is_some()).count(),
                    "requested_count": requested_count,
                }),
            );
            on_update(&running_snapshot);
        }

        if batch_saw_non_retryable_failure && images.iter().all(|value| value.is_none()) {
            break;
        }
    }

    let completed_images = flatten_task_slot_values(&images);
    let completed_responses = flatten_task_slot_values(&responses);
    let failed_slots = flatten_task_slot_values(&failures);

    if completed_images.is_empty() {
        let task_error = first_error.unwrap_or_else(|| {
            build_image_task_error(
                "image_result_empty",
                "图片服务未返回可用结果",
                false,
                "result",
            )
        });
        let failed = mark_image_task_failed(workspace_root, task_id, task_error, &mut on_update)?;
        record_image_task_audit_event(
            workspace_root,
            &failed,
            "task_failed",
            json!({
                "stage": "result",
                "requested_count": requested_count,
                "completed_count": 0,
                "failed_count": failed_slots.len(),
                "error": failed.last_error.clone(),
            }),
        );
        return Ok(failed);
    }

    let latest = load_current_image_task(workspace_root, task_id)?;
    if latest.normalized_status == "cancelled" {
        return Ok(latest);
    }

    let final_status = if completed_images.len() < requested_count {
        "partial"
    } else {
        "succeeded"
    };
    let result_value = build_image_task_result_value(
        &prepared_input,
        requested_count as u32,
        &completed_images,
        &completed_responses,
        &failed_slots,
    );
    let success_message = if final_status == "partial" {
        format!(
            "图片任务已返回 {}/{} 张，另有 {} 张失败。",
            completed_images.len(),
            requested_count,
            failed_slots.len()
        )
    } else {
        format!("图片任务已完成，共生成 {} 张。", completed_images.len())
    };
    let completed = patch_image_task(
        workspace_root,
        task_id,
        TaskArtifactPatch {
            status: Some(final_status.to_string()),
            payload_patch: Some(llm_events::image_completed_payload_patch(
                &latest.record.payload,
                &prepared_input.executor_mode,
                completed_images.len(),
                failed_slots.len(),
            )),
            result: Some(Some(result_value)),
            last_error: Some(None),
            progress: Some(build_image_task_progress_with_preview(
                final_status,
                success_message,
                Some(100),
                build_preview_slots(&prepared_input.request_slots, &slot_statuses),
            )),
            current_attempt_worker_id: Some(Some(IMAGE_TASK_RUNNER_WORKER_ID.to_string())),
            ..TaskArtifactPatch::default()
        },
    )?;
    record_image_task_audit_event(
        workspace_root,
        &completed,
        if final_status == "partial" {
            "task_partial"
        } else {
            "task_succeeded"
        },
        json!({
            "requested_count": requested_count,
            "completed_count": completed_images.len(),
            "failed_count": failed_slots.len(),
        }),
    );
    on_update(&completed);
    Ok(completed)
}
