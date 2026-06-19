use crate::model_route;
use crate::TaskErrorRecord;
use runtime_core::{
    runtime_event_from_llm_event, LlmEvent, LlmOutputPart, LlmRole, LlmRuntimeEvent,
};
use serde_json::{json, Value};

pub(crate) fn image_running_payload_patch(
    payload: &Value,
    executor_mode: &str,
    completed_count: usize,
    failed_count: usize,
    requested_count: usize,
) -> Value {
    media_payload_patch(
        payload,
        "image_generation",
        executor_mode,
        &[LlmEvent::MessageStart {
            role: LlmRole::Assistant,
        }],
        json!({
            "status": "running",
            "completedCount": completed_count,
            "failedCount": failed_count,
            "requestedCount": requested_count,
        }),
    )
}

pub(crate) fn image_completed_payload_patch(
    payload: &Value,
    executor_mode: &str,
    image_count: usize,
    failed_count: usize,
) -> Value {
    media_payload_patch(
        payload,
        "image_generation",
        executor_mode,
        &[
            LlmEvent::OutputDelta {
                part: LlmOutputPart::Image {
                    image_url: format!("media-task://image-results/{image_count}"),
                    mime_type: Some("image/*".to_string()),
                },
            },
            LlmEvent::Completed,
        ],
        json!({
            "status": if failed_count > 0 { "partial" } else { "succeeded" },
            "imageCount": image_count,
            "failedCount": failed_count,
        }),
    )
}

pub(crate) fn image_failed_payload_patch(payload: &Value, error: &TaskErrorRecord) -> Value {
    let route = model_route::resolved_model_route_from_payload(payload);
    let executor_mode = route
        .as_ref()
        .and_then(|route| {
            model_route::image_executor_mode_from_route_protocol(route.protocol.as_deref())
        })
        .or_else(|| string_field(payload, &["executor_mode", "executorMode"]))
        .unwrap_or("images_api");
    failed_payload_patch(payload, "image_generation", executor_mode, error)
}

pub(crate) fn video_running_payload_patch(payload: &Value) -> Value {
    media_payload_patch(
        payload,
        "video_generation",
        "fal_video_generation",
        &[LlmEvent::MessageStart {
            role: LlmRole::Assistant,
        }],
        json!({
            "status": "running",
        }),
    )
}

pub(crate) fn video_completed_payload_patch(payload: &Value, video_url: Option<&str>) -> Value {
    media_payload_patch(
        payload,
        "video_generation",
        "fal_video_generation",
        &[
            LlmEvent::OutputDelta {
                part: LlmOutputPart::Text {
                    text: "video_generation_completed".to_string(),
                },
            },
            LlmEvent::Completed,
        ],
        json!({
            "status": "succeeded",
            "videoUrl": video_url,
        }),
    )
}

pub(crate) fn video_failed_payload_patch(payload: &Value, error: &TaskErrorRecord) -> Value {
    failed_payload_patch(payload, "video_generation", "fal_video_generation", error)
}

fn failed_payload_patch(
    payload: &Value,
    task_family: &str,
    executor_mode: &str,
    error: &TaskErrorRecord,
) -> Value {
    media_payload_patch(
        payload,
        task_family,
        executor_mode,
        &[LlmEvent::Failed {
            code: error.code.clone(),
            message: error.message.clone(),
            retryable: error.retryable,
        }],
        json!({
            "status": "failed",
            "errorCode": error.code,
            "errorStage": error.stage,
            "retryable": error.retryable,
        }),
    )
}

fn media_payload_patch(
    payload: &Value,
    task_family: &str,
    executor_mode: &str,
    events: &[LlmEvent],
    diagnostics: Value,
) -> Value {
    let runtime_events = events.iter().map(runtime_event_value).collect::<Vec<_>>();
    let route = model_route::resolved_model_route_from_payload(payload);
    let diagnostics = json!({
        "taskFamily": task_family,
        "executorMode": executor_mode,
        "providerId": route.as_ref().and_then(|route| route.provider_id.clone()),
        "modelId": route.as_ref().and_then(|route| route.model_id.clone()),
        "protocol": route.as_ref().and_then(|route| route.protocol.clone()),
        "transport": "local_lime_service",
        "credential": "not_embedded",
        "runtimeCoreMapper": true,
        "details": diagnostics,
    });

    json!({
        "llm_events": runtime_events.clone(),
        "llmEvents": runtime_events,
        "provider_diagnostics": diagnostics.clone(),
        "providerDiagnostics": diagnostics,
    })
}

fn runtime_event_value(event: &LlmEvent) -> Value {
    let LlmRuntimeEvent {
        event_type,
        payload,
    } = runtime_event_from_llm_event(event);
    json!({
        "type": event_type,
        "payload": payload,
    })
}

fn string_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|item| !item.is_empty())
    })
}
