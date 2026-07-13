use super::image_tools;
use super::request_context::RuntimeSessionScope;
use crate::{AppDataSource, ExecutionRequest, RuntimeCoreError, RuntimeEvent, RuntimeEventSink};
use agent_protocol::{
    ItemId, ItemStatus, SessionId, ThreadId, ThreadItem, ThreadItemPayload, ToolArgument,
    ToolOutput, TurnId,
};
use app_server_protocol::{MediaTaskArtifactImageCreateParams, MediaTaskArtifactResponse};
use lime_agent::{agent_tools::catalog::LIME_CREATE_IMAGE_TASK_TOOL_NAME, AgentTokenUsage};
mod intent;
mod presentation;
mod presentation_soul;
#[cfg(test)]
mod tests;
use intent::{parse_image_command_intent, ImageCommandIntent};

use serde_json::{json, Value};
use std::sync::Arc;
use tokio::time::{timeout, Duration};

const WORKFLOW_SOURCE: &str = "image_command_workflow";
// Presentation is part of the user-visible turn. Live text providers can take
// longer than a few seconds on cold start or queueing, so keep this above the
// media task handoff fast path budget instead of dropping the assistant lead.
const PRESENTATION_GENERATION_TIMEOUT: Duration = Duration::from_secs(45);
const IMAGE_WORKFLOW_STEP_COUNT: usize = 5;
const IMAGE_WORKFLOW_STEPS: [ImageWorkflowStep; IMAGE_WORKFLOW_STEP_COUNT] = [
    ImageWorkflowStep {
        id: "intent",
        title: "解析图片需求",
        kind: "agent_task",
    },
    ImageWorkflowStep {
        id: "route",
        title: "确认图片模型",
        kind: "tool",
    },
    ImageWorkflowStep {
        id: "create_tasks",
        title: "创建图片任务",
        kind: "tool",
    },
    ImageWorkflowStep {
        id: "generate",
        title: "生成图片",
        kind: "connector",
    },
    ImageWorkflowStep {
        id: "persist_outputs",
        title: "保存结果",
        kind: "storage",
    },
];

#[derive(Debug, Clone, Copy)]
struct ImageWorkflowStep {
    id: &'static str,
    title: &'static str,
    kind: &'static str,
}

pub(super) async fn handle_image_command_turn_if_present(
    runtime_backend: Option<&super::RuntimeBackend>,
    request: &ExecutionRequest,
    scope: &RuntimeSessionScope,
    app_data_source: Option<Arc<dyn AppDataSource>>,
    sink: &mut dyn RuntimeEventSink,
) -> Result<bool, RuntimeCoreError> {
    let Some(mut intent) = parse_image_command_intent(request, scope)? else {
        return Ok(false);
    };

    tracing::info!(
        session_id = %intent.scope.session_id,
        thread_id = %intent.scope.thread_id,
        turn_id = %intent.scope.turn_id,
        workflow_run_id = %workflow_run_id(&intent.scope),
        entry_source = ?intent.entry_source,
        provider_id = ?intent.provider_id,
        model = ?intent.model,
        "[RuntimeBackend] ImageCommandWorkflow accepted"
    );
    emit_workflow_run_started(&intent, sink)?;
    emit_intent_accepted(&intent, sink)?;
    emit_workflow_step_completed(&intent, "intent", "解析图片需求", "accepted", None, sink)?;

    if let Some(missing) = intent.missing_parameters() {
        emit_parameter_required(&intent, missing, sink)?;
        return Ok(true);
    }

    let Some(app_data_source) = app_data_source else {
        emit_create_failed(
            &intent,
            "app_data_source_unavailable",
            "App Server image command workflow requires AppDataSource",
            sink,
        )?;
        return Ok(true);
    };

    if let Some(existing_presentation) = presentation::normalize_existing_presentation(&intent) {
        apply_generated_presentation(&mut intent, existing_presentation, sink)?;
    } else if let Some(runtime_backend) = runtime_backend {
        match timeout(
            PRESENTATION_GENERATION_TIMEOUT,
            presentation::generate_image_task_presentation(runtime_backend, request, &intent),
        )
        .await
        {
            Ok(Ok(Some(generated_presentation))) => {
                apply_generated_presentation(&mut intent, generated_presentation, sink)?;
            }
            Ok(Ok(None)) => {
                emit_create_failed(
                    &intent,
                    "image_task_presentation_empty",
                    "Image command presentation returned empty or invalid model output",
                    sink,
                )?;
                return Ok(true);
            }
            Ok(Err(error)) => {
                let reason_code = presentation_failure_reason_code(&error);
                tracing::warn!(
                    session_id = %intent.scope.session_id,
                    thread_id = %intent.scope.thread_id,
                    turn_id = %intent.scope.turn_id,
                    workflow_run_id = %workflow_run_id(&intent.scope),
                    reason_code = reason_code,
                    error = %error,
                    "[RuntimeBackend] ImageCommandWorkflow presentation generation failed"
                );
                emit_create_failed(&intent, reason_code, &error.to_string(), sink)?;
                return Ok(true);
            }
            Err(_) => {
                tracing::warn!(
                    session_id = %intent.scope.session_id,
                    thread_id = %intent.scope.thread_id,
                    turn_id = %intent.scope.turn_id,
                    workflow_run_id = %workflow_run_id(&intent.scope),
                    timeout_ms = PRESENTATION_GENERATION_TIMEOUT.as_millis(),
                    "[RuntimeBackend] ImageCommandWorkflow presentation generation timed out"
                );
                emit_create_failed(
                    &intent,
                    "image_task_presentation_timeout",
                    "Image command presentation generation timed out",
                    sink,
                )?;
                return Ok(true);
            }
        }
    } else {
        emit_create_failed(
            &intent,
            "image_task_presentation_runtime_unavailable",
            "Image command presentation generation skipped because runtime backend is unavailable",
            sink,
        )?;
        return Ok(true);
    }

    let tool_call_id = tool_call_id(scope);
    let create_params = intent.clone().into_create_params();
    let tool_started_at_ms = chrono::Utc::now().timestamp_millis();
    emit_workflow_step_started(&intent, "create_tasks", "创建图片任务", None, sink)?;
    emit_tool_started(
        scope,
        &tool_call_id,
        &create_params,
        tool_started_at_ms,
        sink,
    )?;
    match app_data_source
        .create_image_media_task_artifact(create_params.clone())
        .await
    {
        Ok(response) => {
            let task_id = response.task_id.clone();
            let artifact_path = response.artifact_path.clone();
            emit_task_created(
                scope,
                &tool_call_id,
                &create_params,
                tool_started_at_ms,
                response,
                sink,
            )?;
            tracing::info!(
                session_id = %intent.scope.session_id,
                thread_id = %intent.scope.thread_id,
                turn_id = %intent.scope.turn_id,
                workflow_run_id = %workflow_run_id(&intent.scope),
                task_id = %task_id,
                "[RuntimeBackend] ImageCommandWorkflow task created"
            );
            emit_workflow_step_completed(
                &intent,
                "create_tasks",
                "创建图片任务",
                "task_created",
                Some(&task_id),
                sink,
            )?;
            emit_workflow_run_completed(&intent, "task_created", Some(&task_id), sink)?;
            emit_task_created_turn_completed(
                &task_id,
                &artifact_path,
                intent.presentation_usage.as_ref(),
                sink,
            )?;
        }
        Err(error) => {
            emit_create_failed_after_tool_started(
                &intent,
                &tool_call_id,
                &create_params,
                tool_started_at_ms,
                "image_task_create_failed",
                &error.to_string(),
                sink,
            )?;
        }
    }
    Ok(true)
}

fn apply_generated_presentation(
    intent: &mut ImageCommandIntent,
    generated_presentation: presentation::GeneratedImageTaskPresentation,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    let presentation_usage = generated_presentation.usage.clone();
    if let Some(planning_summary) = generated_presentation.planning_summary.as_deref() {
        emit_planning_summary(intent, planning_summary, sink)?;
    }
    if let Some(assistant_intro) = generated_presentation.assistant_intro.as_deref() {
        emit_assistant_intro(intent, assistant_intro, sink)?;
    }
    emit_presentation_generated(intent, &generated_presentation, sink)?;
    intent.presentation = presentation::merge_generated_presentation(
        intent.presentation.take(),
        &generated_presentation,
    );
    intent.presentation_usage = presentation_usage;
    Ok(())
}

fn presentation_failure_reason_code(error: &RuntimeCoreError) -> &'static str {
    let message = error.to_string();
    if message.contains("presentation_text_model_unavailable") {
        return "image_task_presentation_text_model_unavailable";
    }
    if message.contains("presentation_text_route_unavailable") {
        return "image_task_presentation_text_route_unavailable";
    }
    "image_task_presentation_failed"
}

fn workflow_run_id(scope: &RuntimeSessionScope) -> String {
    format!("image-command-run-{}", scope.turn_id)
}

fn workflow_audit_payload(
    intent: &ImageCommandIntent,
    event: &str,
    status: &str,
    task_id: Option<&str>,
) -> Value {
    let run_id = workflow_run_id(&intent.scope);
    json!({
        "backend": "runtime",
        "source": WORKFLOW_SOURCE,
        "workflowRunId": run_id,
        "workflow_run_id": run_id,
        "run_id": run_id,
        "workflowKey": WORKFLOW_SOURCE,
        "workflow_key": WORKFLOW_SOURCE,
        "event": event,
        "status": status,
        "taskId": task_id,
        "task_id": task_id,
        "sessionId": intent.scope.session_id,
        "session_id": intent.scope.session_id,
        "threadId": intent.scope.thread_id,
        "thread_id": intent.scope.thread_id,
        "turnId": intent.scope.turn_id,
        "turn_id": intent.scope.turn_id,
        "entrySource": intent.entry_source,
        "entry_source": intent.entry_source,
        "providerId": intent.provider_id,
        "provider_id": intent.provider_id,
        "model": intent.model,
        "redaction": {
            "policy": "workflow_audit_metadata_only",
            "prompt": "omitted",
            "tool_result": "omitted"
        }
    })
}

fn emit_workflow_run_started(
    intent: &ImageCommandIntent,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    let mut payload = workflow_audit_payload(intent, "run_started", "running", None);
    payload["steps"] = json!(image_workflow_step_values());
    sink.emit(RuntimeEvent::new("workflow.run.started", payload))
}

fn emit_workflow_step_started(
    intent: &ImageCommandIntent,
    step_id: &str,
    title: &str,
    task_id: Option<&str>,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    let mut payload = workflow_audit_payload(intent, "step_started", "running", task_id);
    bind_image_workflow_step_payload(&mut payload, step_id, title, "running");
    sink.emit(RuntimeEvent::new("workflow.step.started", payload))
}

fn emit_workflow_step_completed(
    intent: &ImageCommandIntent,
    step_id: &str,
    title: &str,
    status: &str,
    task_id: Option<&str>,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    let mut payload = workflow_audit_payload(intent, "step_completed", status, task_id);
    bind_image_workflow_step_payload(&mut payload, step_id, title, status);
    sink.emit(RuntimeEvent::new("workflow.step.completed", payload))
}

fn emit_workflow_run_completed(
    intent: &ImageCommandIntent,
    status: &str,
    task_id: Option<&str>,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    let payload = workflow_audit_payload(intent, "run_completed", status, task_id);
    sink.emit(RuntimeEvent::new("workflow.run.completed", payload))
}

fn image_workflow_step_values() -> Vec<Value> {
    IMAGE_WORKFLOW_STEPS
        .iter()
        .enumerate()
        .map(|(index, step)| {
            json!({
                "id": step.id,
                "stepId": step.id,
                "step_id": step.id,
                "title": step.title,
                "stepTitle": step.title,
                "step_title": step.title,
                "kind": step.kind,
                "stepKind": step.kind,
                "step_kind": step.kind,
                "index": index,
                "stepIndex": index,
                "step_index": index,
                "stepCount": IMAGE_WORKFLOW_STEP_COUNT,
                "step_count": IMAGE_WORKFLOW_STEP_COUNT,
                "status": "queued"
            })
        })
        .collect()
}

fn bind_image_workflow_step_payload(
    payload: &mut Value,
    step_id: &str,
    fallback_title: &str,
    status: &str,
) {
    let (step_index, id, title, kind) = image_workflow_step_by_id(step_id)
        .map(|(index, step)| (Some(index), step.id, step.title, step.kind))
        .unwrap_or((None, step_id, fallback_title, "agent_task"));
    payload["stepId"] = json!(id);
    payload["step_id"] = json!(id);
    payload["stepTitle"] = json!(title);
    payload["step_title"] = json!(title);
    payload["stepKind"] = json!(kind);
    payload["step_kind"] = json!(kind);
    payload["kind"] = json!(kind);
    payload["stepCount"] = json!(IMAGE_WORKFLOW_STEP_COUNT);
    payload["step_count"] = json!(IMAGE_WORKFLOW_STEP_COUNT);
    payload["status"] = json!(status);
    if let Some(index) = step_index {
        payload["stepIndex"] = json!(index);
        payload["step_index"] = json!(index);
        payload["index"] = json!(index);
    }
}

fn image_workflow_step_by_id(step_id: &str) -> Option<(usize, ImageWorkflowStep)> {
    IMAGE_WORKFLOW_STEPS
        .iter()
        .copied()
        .enumerate()
        .find(|(_, step)| step.id == step_id)
}

fn emit_intent_accepted(
    intent: &ImageCommandIntent,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    sink.emit(RuntimeEvent::new(
        "runtime.status",
        json!({
            "backend": "runtime",
            "source": WORKFLOW_SOURCE,
            "status": "image_command_intent_accepted",
            "sessionId": intent.scope.session_id,
            "threadId": intent.scope.thread_id,
            "turnId": intent.scope.turn_id,
            "prompt": intent.prompt,
            "entrySource": intent.entry_source,
            "entry_source": intent.entry_source,
        }),
    ))
}

fn emit_assistant_intro(
    intent: &ImageCommandIntent,
    assistant_intro: &str,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    let item_id = format!("{}:image-presentation:intro", intent.scope.turn_id);
    tracing::info!(
        session_id = %intent.scope.session_id,
        thread_id = %intent.scope.thread_id,
        turn_id = %intent.scope.turn_id,
        workflow_run_id = %workflow_run_id(&intent.scope),
        intro_chars = assistant_intro.chars().count(),
        "[RuntimeBackend] ImageCommandWorkflow presentation intro emitted"
    );
    sink.emit(RuntimeEvent::new(
        "message.delta",
        json!({
            "backend": "runtime",
            "source": WORKFLOW_SOURCE,
            "type": "text_delta",
            "text": assistant_intro,
            "delta": assistant_intro,
            "phase": "final_answer",
            "itemId": item_id.clone(),
            "item_id": item_id,
            "sessionId": intent.scope.session_id,
            "session_id": intent.scope.session_id,
            "threadId": intent.scope.thread_id,
            "thread_id": intent.scope.thread_id,
            "turnId": intent.scope.turn_id,
            "turn_id": intent.scope.turn_id,
        }),
    ))
}

fn emit_planning_summary(
    intent: &ImageCommandIntent,
    planning_summary: &str,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    let text = planning_summary.trim();
    if text.is_empty() {
        return Ok(());
    }
    let reasoning_id = format!("{}:image-presentation:planning", intent.scope.turn_id);
    let metadata = json!({
        "source": WORKFLOW_SOURCE,
        "presentation": "visible_process_summary",
        "workflowRunId": workflow_run_id(&intent.scope),
        "workflow_run_id": workflow_run_id(&intent.scope),
        "redaction": {
            "policy": "visible_summary_no_hidden_chain_of_thought",
            "internal_prompt": "omitted"
        }
    });
    tracing::info!(
        session_id = %intent.scope.session_id,
        thread_id = %intent.scope.thread_id,
        turn_id = %intent.scope.turn_id,
        workflow_run_id = %workflow_run_id(&intent.scope),
        planning_summary_chars = text.chars().count(),
        "[RuntimeBackend] ImageCommandWorkflow planning summary emitted"
    );
    let common_payload = |extra: Value| {
        let mut payload = json!({
            "backend": "runtime",
            "source": WORKFLOW_SOURCE,
            "reasoningId": reasoning_id.clone(),
            "reasoning_id": reasoning_id.clone(),
            "sessionId": intent.scope.session_id,
            "session_id": intent.scope.session_id,
            "threadId": intent.scope.thread_id,
            "thread_id": intent.scope.thread_id,
            "turnId": intent.scope.turn_id,
            "turn_id": intent.scope.turn_id,
            "metadata": metadata.clone(),
        });
        merge_json_object(&mut payload, extra);
        payload
    };
    sink.emit(RuntimeEvent::new(
        "reasoning.started",
        common_payload(json!({
            "status": "in_progress",
        })),
    ))?;
    sink.emit(RuntimeEvent::new(
        "reasoning.delta",
        common_payload(json!({
            "delta": text,
            "text": text,
        })),
    ))?;
    sink.emit(RuntimeEvent::new(
        "reasoning.final",
        common_payload(json!({
            "status": "completed",
            "text": text,
        })),
    ))?;
    sink.emit(RuntimeEvent::new(
        "reasoning.ended",
        common_payload(json!({
            "status": "completed",
        })),
    ))
}

fn merge_json_object(target: &mut Value, extra: Value) {
    let (Some(target), Some(extra)) = (target.as_object_mut(), extra.as_object()) else {
        return;
    };
    for (key, value) in extra {
        target.insert(key.clone(), value.clone());
    }
}

fn emit_presentation_generated(
    intent: &ImageCommandIntent,
    generated: &presentation::GeneratedImageTaskPresentation,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    tracing::info!(
        session_id = %intent.scope.session_id,
        thread_id = %intent.scope.thread_id,
        turn_id = %intent.scope.turn_id,
        workflow_run_id = %workflow_run_id(&intent.scope),
        has_assistant_intro = generated.assistant_intro.is_some(),
        has_completion_caption = generated.completion_caption.is_some(),
        has_usage = generated.usage.is_some(),
        "[RuntimeBackend] ImageCommandWorkflow presentation event emitted"
    );
    sink.emit(RuntimeEvent::new(
        "image_task.presentation.generated",
        json!({
            "backend": "runtime",
            "source": WORKFLOW_SOURCE,
            "status": "generated",
            "workflowRunId": workflow_run_id(&intent.scope),
            "workflow_run_id": workflow_run_id(&intent.scope),
            "sessionId": intent.scope.session_id,
            "session_id": intent.scope.session_id,
            "threadId": intent.scope.thread_id,
            "thread_id": intent.scope.thread_id,
            "turnId": intent.scope.turn_id,
            "turn_id": intent.scope.turn_id,
            "presentation": generated.payload,
            "redaction": {
                "policy": "presentation_text_only_no_internal_prompt",
                "internal_prompt": "omitted"
            }
        }),
    ))
}

fn emit_parameter_required(
    intent: &ImageCommandIntent,
    missing: &str,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    sink.emit(RuntimeEvent::new(
        "image_task.parameters.required",
        json!({
            "backend": "runtime",
            "source": WORKFLOW_SOURCE,
            "missing": [missing],
            "missingParameters": [missing],
            "sessionId": intent.scope.session_id,
            "threadId": intent.scope.thread_id,
            "turnId": intent.scope.turn_id,
            "prompt": "图片生成还需要补充必要信息。",
        }),
    ))?;
    emit_workflow_step_completed(
        intent,
        "intent",
        "解析图片需求",
        "requires_parameters",
        None,
        sink,
    )?;
    emit_workflow_run_completed(intent, "requires_parameters", None, sink)?;
    emit_turn_completed("requires_parameters", intent, sink)
}

fn emit_tool_started(
    scope: &RuntimeSessionScope,
    tool_call_id: &str,
    params: &MediaTaskArtifactImageCreateParams,
    started_at_ms: i64,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    emit_tool_item(
        "item.started",
        scope,
        tool_call_id,
        params,
        ItemStatus::InProgress,
        None,
        json!({
            "backend": "runtime",
            "source": WORKFLOW_SOURCE,
        }),
        started_at_ms,
        started_at_ms,
        sink,
    )
}

fn emit_task_created(
    scope: &RuntimeSessionScope,
    tool_call_id: &str,
    params: &MediaTaskArtifactImageCreateParams,
    started_at_ms: i64,
    response: MediaTaskArtifactResponse,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    let task_id = response.task_id.clone();
    let artifact_path = response.artifact_path.clone();
    sink.emit(RuntimeEvent::new(
        "image_task.created",
        json!({
            "backend": "runtime",
            "source": WORKFLOW_SOURCE,
            "taskId": task_id,
            "task_id": task_id,
            "artifactPath": artifact_path,
            "artifact_path": artifact_path,
            "response": response.clone(),
        }),
    ))?;
    let structured_content = serde_json::to_value(&response).ok();
    let result = image_tools::tool_result_from_response(response);
    let mut metadata = serde_json::Map::from_iter(result.metadata);
    metadata.insert("backend".to_string(), json!("runtime"));
    metadata.insert("source".to_string(), json!(WORKFLOW_SOURCE));
    metadata.insert("success".to_string(), json!(true));
    emit_tool_item(
        "item.completed",
        scope,
        tool_call_id,
        params,
        ItemStatus::Completed,
        Some(ToolOutput {
            text: result.output,
            structured_content,
            error: None,
            duration_ms: None,
            truncated: false,
            output_ref: None,
        }),
        Value::Object(metadata),
        started_at_ms,
        chrono::Utc::now().timestamp_millis(),
        sink,
    )
}

fn emit_task_created_turn_completed(
    task_id: &str,
    artifact_path: &str,
    usage: Option<&AgentTokenUsage>,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    let mut payload = json!({
        "backend": "runtime",
        "source": WORKFLOW_SOURCE,
        "status": "task_created",
        "taskId": task_id,
        "task_id": task_id,
        "artifactPath": artifact_path,
        "artifact_path": artifact_path,
    });
    if let Some(usage) = usage {
        payload["usage"] = json!(usage);
    }
    sink.emit(RuntimeEvent::new("turn.completed", payload))
}

fn emit_create_failed(
    intent: &ImageCommandIntent,
    reason_code: &str,
    message: &str,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    let tool_call_id = tool_call_id(&intent.scope);
    let create_params = intent.clone().into_create_params();
    let tool_started_at_ms = chrono::Utc::now().timestamp_millis();
    tracing::warn!(
        session_id = %intent.scope.session_id,
        thread_id = %intent.scope.thread_id,
        turn_id = %intent.scope.turn_id,
        workflow_run_id = %workflow_run_id(&intent.scope),
        reason_code = %reason_code,
        "[RuntimeBackend] ImageCommandWorkflow task create failed"
    );
    emit_tool_started(
        &intent.scope,
        &tool_call_id,
        &create_params,
        tool_started_at_ms,
        sink,
    )?;
    emit_create_failed_after_tool_started(
        intent,
        &tool_call_id,
        &create_params,
        tool_started_at_ms,
        reason_code,
        message,
        sink,
    )
}

fn emit_create_failed_after_tool_started(
    intent: &ImageCommandIntent,
    tool_call_id: &str,
    params: &MediaTaskArtifactImageCreateParams,
    started_at_ms: i64,
    reason_code: &str,
    message: &str,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    emit_image_task_create_failed(intent, reason_code, message, sink)?;
    emit_workflow_step_completed(intent, "create_tasks", "创建图片任务", "failed", None, sink)?;
    emit_workflow_run_completed(intent, "create_failed", None, sink)?;
    emit_tool_failed(
        &intent.scope,
        tool_call_id,
        params,
        started_at_ms,
        reason_code,
        message,
        sink,
    )?;
    emit_turn_completed("create_failed", intent, sink)
}

fn emit_image_task_create_failed(
    intent: &ImageCommandIntent,
    reason_code: &str,
    message: &str,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    sink.emit(RuntimeEvent::new(
        "image_task.create_failed",
        json!({
            "backend": "runtime",
            "source": WORKFLOW_SOURCE,
            "reasonCode": reason_code,
            "reason_code": reason_code,
            "message": message,
            "sessionId": intent.scope.session_id,
            "threadId": intent.scope.thread_id,
            "turnId": intent.scope.turn_id,
        }),
    ))
}

fn emit_tool_failed(
    scope: &RuntimeSessionScope,
    tool_call_id: &str,
    params: &MediaTaskArtifactImageCreateParams,
    started_at_ms: i64,
    reason_code: &str,
    message: &str,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    emit_tool_item(
        "item.completed",
        scope,
        tool_call_id,
        params,
        ItemStatus::Failed,
        Some(ToolOutput {
            text: None,
            structured_content: None,
            error: Some(message.to_string()),
            duration_ms: None,
            truncated: false,
            output_ref: None,
        }),
        json!({
            "backend": "runtime",
            "source": WORKFLOW_SOURCE,
            "success": false,
            "reasonCode": reason_code,
            "reason_code": reason_code,
        }),
        started_at_ms,
        chrono::Utc::now().timestamp_millis(),
        sink,
    )
}

#[allow(clippy::too_many_arguments)]
fn emit_tool_item(
    event_type: &str,
    scope: &RuntimeSessionScope,
    tool_call_id: &str,
    params: &MediaTaskArtifactImageCreateParams,
    status: ItemStatus,
    output: Option<ToolOutput>,
    metadata: Value,
    created_at_ms: i64,
    updated_at_ms: i64,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    let updated_at_ms = updated_at_ms.max(created_at_ms);
    let mut output = output;
    if status.is_terminal() {
        if let Some(output) = output.as_mut() {
            output.duration_ms = Some(
                u64::try_from(updated_at_ms.saturating_sub(created_at_ms)).unwrap_or_default(),
            );
        }
    }
    let payload = ThreadItemPayload::Tool {
        call_id: tool_call_id.to_string(),
        name: LIME_CREATE_IMAGE_TASK_TOOL_NAME.to_string(),
        arguments: tool_arguments(params),
        output,
    };
    let item = ThreadItem {
        session_id: SessionId::new(scope.session_id.clone()),
        thread_id: ThreadId::new(scope.thread_id.clone()),
        turn_id: TurnId::new(scope.turn_id.clone()),
        item_id: ItemId::new(tool_call_id),
        sequence: 0,
        ordinal: 0,
        created_at_ms,
        updated_at_ms,
        completed_at_ms: status.is_terminal().then_some(updated_at_ms),
        kind: payload.kind(),
        status,
        payload,
        metadata,
    };
    sink.emit(RuntimeEvent::new(event_type, json!({ "item": item })))
}

fn tool_arguments(params: &MediaTaskArtifactImageCreateParams) -> Vec<ToolArgument> {
    match serde_json::to_value(params).unwrap_or(Value::Null) {
        Value::Object(arguments) => arguments
            .into_iter()
            .map(|(name, value)| ToolArgument {
                name,
                value: match value {
                    Value::String(value) => value,
                    value => value.to_string(),
                },
            })
            .collect(),
        Value::Null => Vec::new(),
        value => vec![ToolArgument {
            name: "value".to_string(),
            value: value.to_string(),
        }],
    }
}

fn emit_turn_completed(
    status: &str,
    intent: &ImageCommandIntent,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    sink.emit(RuntimeEvent::new(
        "turn.completed",
        json!({
            "backend": "runtime",
            "source": WORKFLOW_SOURCE,
            "status": status,
            "sessionId": intent.scope.session_id,
            "threadId": intent.scope.thread_id,
            "turnId": intent.scope.turn_id,
        }),
    ))
}

fn tool_call_id(scope: &RuntimeSessionScope) -> String {
    ItemId::new(format!("image-command-create-task-{}", scope.turn_id)).to_string()
}
