use std::path::Path;

use super::image_worker_progress::build_image_task_error;
use super::{
    llm_events, load_task_output, model_route, patch_task_artifact, MediaRuntimeError,
    MediaTaskOutput, TaskArtifactPatch, TaskErrorRecord,
};

use super::image_worker::IMAGE_TASK_RUNNER_WORKER_ID;

pub(crate) fn apply_image_route_preflight(
    workspace_root: &Path,
    task_id: &str,
    output: MediaTaskOutput,
    on_update: &mut impl FnMut(&MediaTaskOutput),
) -> Result<Result<MediaTaskOutput, TaskErrorRecord>, MediaRuntimeError> {
    let preflight = model_route::image_route_payload_preflight(&output.record.payload);
    if let Some(failure) = preflight.failure {
        return Ok(Err(build_image_task_error(
            &failure.code,
            failure.message,
            failure.retryable,
            "routing",
        )));
    };
    let Some(payload_patch) = preflight.payload_patch else {
        return Ok(Ok(output));
    };

    let migrated = patch_image_task(
        workspace_root,
        task_id,
        TaskArtifactPatch {
            payload_patch: Some(payload_patch),
            current_attempt_worker_id: Some(Some(IMAGE_TASK_RUNNER_WORKER_ID.to_string())),
            ..TaskArtifactPatch::default()
        },
    )?;
    on_update(&migrated);
    Ok(Ok(migrated))
}

pub(crate) fn load_current_image_task(
    workspace_root: &Path,
    task_id: &str,
) -> Result<MediaTaskOutput, MediaRuntimeError> {
    load_task_output(workspace_root, task_id, None)
}

pub(crate) fn patch_image_task(
    workspace_root: &Path,
    task_id: &str,
    patch: TaskArtifactPatch,
) -> Result<MediaTaskOutput, MediaRuntimeError> {
    patch_task_artifact(workspace_root, task_id, None, patch)
}

pub(crate) fn mark_image_task_failed<F>(
    workspace_root: &Path,
    task_id: &str,
    error: TaskErrorRecord,
    on_update: &mut F,
) -> Result<MediaTaskOutput, MediaRuntimeError>
where
    F: FnMut(&MediaTaskOutput),
{
    let current = load_current_image_task(workspace_root, task_id)?;
    if current.normalized_status == "cancelled" {
        return Ok(current);
    }

    let output = patch_image_task(
        workspace_root,
        task_id,
        TaskArtifactPatch {
            status: Some("failed".to_string()),
            payload_patch: Some(llm_events::image_failed_payload_patch(
                &current.record.payload,
                &error,
            )),
            last_error: Some(Some(error.clone())),
            progress: Some(super::image_worker_progress::build_image_task_progress(
                "failed",
                error.message.clone(),
                None,
            )),
            current_attempt_worker_id: Some(Some(IMAGE_TASK_RUNNER_WORKER_ID.to_string())),
            ..TaskArtifactPatch::default()
        },
    )?;
    on_update(&output);
    Ok(output)
}
