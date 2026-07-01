use serde_json::{json, Value};

use super::image_postprocess::{
    build_image_postprocess_value, build_image_result_postprocess_value, ImagePostprocessOutcome,
    PreparedImageTaskPostprocessPlan,
};
use super::image_task_input::PreparedImageTaskSlot;
use super::{TaskErrorRecord, TaskPreviewSlot, TaskProgress};

pub(crate) fn build_image_task_result_value(
    prepared_input: &super::image_task_input::PreparedImageTaskInput,
    requested_count: u32,
    images: &[Value],
    responses: &[Value],
    failures: &[Value],
) -> Value {
    json!({
        "prompt": prepared_input.prompt,
        "provider_id": prepared_input.provider_id,
        "executor_mode": prepared_input.executor_mode,
        "outer_model": prepared_input.outer_model,
        "model": if prepared_input.model.trim().is_empty() {
            None::<String>
        } else {
            Some(prepared_input.model.clone())
        },
        "size": prepared_input.size,
        "count": prepared_input.count,
        "layout_hint": prepared_input.layout_hint,
        "requested_count": requested_count,
        "received_count": images.len(),
        "images": images,
        "response": responses.first().cloned(),
        "responses": responses,
        "failures": failures,
        "postprocess": prepared_input
            .postprocess_plan
            .as_ref()
            .map(|plan| build_image_result_postprocess_value(plan, requested_count, images)),
        "storyboard_slots": prepared_input
            .request_slots
            .iter()
            .map(|slot| {
                json!({
                    "slot_index": slot.slot_index,
                    "slot_id": slot.slot_id,
                    "label": slot.label,
                    "prompt": slot.prompt,
                    "shot_type": slot.shot_type,
                })
            })
            .collect::<Vec<_>>(),
    })
}

pub(crate) fn build_running_image_task_message(
    requested_count: usize,
    success_count: usize,
    failed_count: usize,
) -> String {
    if failed_count == 0 {
        return format!("图片生成中，已返回 {success_count}/{requested_count} 张。");
    }

    format!("图片生成中，已返回 {success_count}/{requested_count} 张，另有 {failed_count} 张失败。")
}

pub(crate) fn build_image_task_progress(
    phase: &str,
    message: String,
    percent: Option<u32>,
) -> TaskProgress {
    build_image_task_progress_with_preview(phase, message, percent, Vec::new())
}

pub(crate) fn build_image_task_progress_with_preview(
    phase: &str,
    message: String,
    percent: Option<u32>,
    preview_slots: Vec<TaskPreviewSlot>,
) -> TaskProgress {
    TaskProgress {
        phase: Some(phase.to_string()),
        percent,
        message: Some(message),
        preview_slots,
    }
}

pub(crate) fn build_image_task_error(
    code: &str,
    message: impl Into<String>,
    retryable: bool,
    stage: &str,
) -> TaskErrorRecord {
    TaskErrorRecord {
        code: code.to_string(),
        message: message.into(),
        retryable,
        stage: Some(stage.to_string()),
        provider_code: None,
        occurred_at: Some(chrono::Utc::now().to_rfc3339()),
    }
}

pub(crate) fn build_preview_slots(
    request_slots: &[PreparedImageTaskSlot],
    slot_statuses: &[String],
) -> Vec<TaskPreviewSlot> {
    request_slots
        .iter()
        .enumerate()
        .map(|(index, slot)| TaskPreviewSlot {
            slot_id: slot.slot_id.clone(),
            slot_index: Some(slot.slot_index),
            label: slot.label.clone(),
            prompt: Some(slot.prompt.clone()),
            shot_type: slot.shot_type.clone(),
            status: slot_statuses
                .get(index)
                .cloned()
                .unwrap_or_else(|| "queued".to_string()),
        })
        .collect()
}

pub(crate) fn build_failed_slot_value(
    slot: &PreparedImageTaskSlot,
    error: TaskErrorRecord,
) -> Value {
    json!({
        "slot_index": slot.slot_index,
        "slot_id": slot.slot_id,
        "slot_label": slot.label,
        "slot_prompt": slot.prompt,
        "shot_type": slot.shot_type,
        "error": error,
    })
}

pub(crate) fn flatten_task_slot_values(values: &[Option<Value>]) -> Vec<Value> {
    values.iter().filter_map(|value| value.clone()).collect()
}

#[cfg(test)]
pub(crate) fn decorate_generated_image_with_slot(
    image: Value,
    slot: &PreparedImageTaskSlot,
    postprocess_plan: Option<&PreparedImageTaskPostprocessPlan>,
) -> Value {
    let postprocess_outcome = postprocess_plan.map(|plan| match &image {
        Value::Object(_) => {
            super::image_postprocess::infer_sync_image_postprocess_outcome(&image, plan)
        }
        _ => ImagePostprocessOutcome::failed("图片结果不是对象，无法读取 url 后处理"),
    });

    decorate_generated_image_with_slot_with_postprocess_outcome(
        image,
        slot,
        postprocess_plan,
        postprocess_outcome.as_ref(),
    )
}

pub(crate) fn decorate_generated_image_with_slot_with_postprocess_outcome(
    image: Value,
    slot: &PreparedImageTaskSlot,
    postprocess_plan: Option<&PreparedImageTaskPostprocessPlan>,
    postprocess_outcome: Option<&ImagePostprocessOutcome>,
) -> Value {
    match image {
        Value::Object(mut record) => {
            record.insert("slot_index".to_string(), json!(slot.slot_index));
            record.insert("slot_id".to_string(), json!(slot.slot_id));
            record.insert("slot_prompt".to_string(), json!(slot.prompt));
            if let Some(label) = slot.label.as_ref() {
                record.insert("slot_label".to_string(), json!(label));
            }
            if let Some(shot_type) = slot.shot_type.as_ref() {
                record.insert("shot_type".to_string(), json!(shot_type));
            }
            if let Some(plan) = postprocess_plan {
                if let Some(output_url) =
                    postprocess_outcome.and_then(|outcome| outcome.output_url.as_ref())
                {
                    record.insert("url".to_string(), json!(output_url));
                }
                record.insert(
                    "postprocess".to_string(),
                    build_image_postprocess_value(plan, postprocess_outcome),
                );
            }
            Value::Object(record)
        }
        other => {
            json!({
                "slot_index": slot.slot_index,
                "slot_id": slot.slot_id,
                "slot_label": slot.label,
                "slot_prompt": slot.prompt,
                "shot_type": slot.shot_type,
                "postprocess": postprocess_plan
                    .map(|plan| build_image_postprocess_value(plan, postprocess_outcome)),
                "image": other,
            })
        }
    }
}

pub(crate) fn decorate_response_with_slot(response: Value, slot: &PreparedImageTaskSlot) -> Value {
    match response {
        Value::Object(mut record) => {
            record.insert("slot_index".to_string(), json!(slot.slot_index));
            record.insert("slot_id".to_string(), json!(slot.slot_id));
            if let Some(label) = slot.label.as_ref() {
                record.insert("slot_label".to_string(), json!(label));
            }
            record.insert("slot_prompt".to_string(), json!(slot.prompt));
            if let Some(shot_type) = slot.shot_type.as_ref() {
                record.insert("shot_type".to_string(), json!(shot_type));
            }
            Value::Object(record)
        }
        other => json!({
            "slot_index": slot.slot_index,
            "slot_id": slot.slot_id,
            "slot_label": slot.label,
            "slot_prompt": slot.prompt,
            "shot_type": slot.shot_type,
            "response": other,
        }),
    }
}
