use super::image_tools;
use super::request_context::{
    aster_chat_request_from_request, host_metadata_value, request_workspace_scope,
    RuntimeSessionScope,
};
use crate::{AppDataSource, ExecutionRequest, RuntimeCoreError, RuntimeEvent, RuntimeEventSink};
use app_server_protocol::{MediaTaskArtifactImageCreateParams, MediaTaskArtifactResponse};
use lime_agent::{agent_tools::catalog::LIME_CREATE_IMAGE_TASK_TOOL_NAME, AgentTokenUsage};
mod presentation;

use serde_json::{json, Value};
use std::path::PathBuf;
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

    if let Some(runtime_backend) = runtime_backend {
        match timeout(
            PRESENTATION_GENERATION_TIMEOUT,
            presentation::generate_image_task_presentation(runtime_backend, request, &intent),
        )
        .await
        {
            Ok(Ok(Some(generated_presentation))) => {
                let presentation_usage = generated_presentation.usage.clone();
                if let Some(planning_summary) = generated_presentation.planning_summary.as_deref() {
                    emit_planning_summary(&intent, planning_summary, sink)?;
                }
                if let Some(assistant_intro) = generated_presentation.assistant_intro.as_deref() {
                    emit_assistant_intro(&intent, assistant_intro, sink)?;
                }
                emit_presentation_generated(&intent, &generated_presentation, sink)?;
                intent.presentation = presentation::merge_generated_presentation(
                    intent.presentation,
                    &generated_presentation,
                );
                intent.presentation_usage = presentation_usage;
            }
            Ok(Ok(None)) => {
                emit_presentation_unavailable(&intent, "empty_or_invalid_model_output", sink)?;
            }
            Ok(Err(error)) => {
                let reason_code = presentation_unavailable_reason_code(&error);
                tracing::warn!(
                    session_id = %intent.scope.session_id,
                    thread_id = %intent.scope.thread_id,
                    turn_id = %intent.scope.turn_id,
                    workflow_run_id = %workflow_run_id(&intent.scope),
                    reason_code = reason_code,
                    error = %error,
                    "[RuntimeBackend] ImageCommandWorkflow presentation generation unavailable"
                );
                emit_presentation_unavailable(&intent, reason_code, sink)?;
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
                emit_presentation_unavailable(&intent, "presentation_generation_timeout", sink)?;
            }
        }
    }

    let tool_call_id = tool_call_id(scope);
    let create_params = intent.clone().into_create_params();
    emit_workflow_step_started(&intent, "create_tasks", "创建图片任务", None, sink)?;
    emit_tool_started(&tool_call_id, &create_params, sink)?;
    match app_data_source
        .create_image_media_task_artifact(create_params)
        .await
    {
        Ok(response) => {
            let task_id = response.task_id.clone();
            emit_task_created(
                &tool_call_id,
                response,
                intent.presentation_usage.as_ref(),
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
        }
        Err(error) => {
            emit_create_failed(
                &intent,
                "image_task_create_failed",
                &error.to_string(),
                sink,
            )?;
        }
    }
    Ok(true)
}

fn presentation_unavailable_reason_code(error: &RuntimeCoreError) -> &'static str {
    let message = error.to_string();
    if message.contains("presentation_text_model_unavailable") {
        return "presentation_text_model_unavailable";
    }
    if message.contains("presentation_text_route_unavailable") {
        return "presentation_text_route_unavailable";
    }
    "presentation_generation_failed"
}

#[derive(Debug, Clone, PartialEq)]
struct ImageCommandIntent {
    scope: RuntimeSessionScope,
    project_root_path: String,
    prompt: String,
    title: Option<String>,
    title_generation_result: Option<Value>,
    persona_context: Option<Value>,
    presentation: Option<Value>,
    taste_context: Option<Value>,
    mode: Option<String>,
    raw_text: Option<String>,
    layout_hint: Option<String>,
    size: Option<String>,
    aspect_ratio: Option<String>,
    count: Option<u32>,
    usage: Option<String>,
    style: Option<String>,
    provider_id: Option<String>,
    model: Option<String>,
    executor_mode: Option<String>,
    outer_model: Option<String>,
    project_id: Option<String>,
    content_id: Option<String>,
    entry_source: Option<String>,
    modality_contract_key: Option<String>,
    modality: Option<String>,
    required_capabilities: Vec<String>,
    routing_slot: Option<String>,
    runtime_contract: Option<Value>,
    requested_target: Option<String>,
    slot_id: Option<String>,
    anchor_hint: Option<String>,
    anchor_section_title: Option<String>,
    anchor_text: Option<String>,
    target_output_id: Option<String>,
    target_output_ref_id: Option<String>,
    reference_images: Vec<String>,
    storyboard_slots: Vec<app_server_protocol::ImageStoryboardSlotInput>,
    presentation_usage: Option<AgentTokenUsage>,
}

impl ImageCommandIntent {
    fn missing_parameters(&self) -> Option<&'static str> {
        if self.prompt.trim().is_empty() {
            return Some("prompt");
        }
        if self.project_root_path.trim().is_empty() {
            return Some("project_root_path");
        }
        let mode = self.mode.as_deref().unwrap_or("generate");
        if matches!(mode, "edit" | "variation")
            && self.reference_images.is_empty()
            && self.target_output_id.is_none()
            && self.target_output_ref_id.is_none()
        {
            return Some("reference_images");
        }
        None
    }

    fn into_create_params(self) -> MediaTaskArtifactImageCreateParams {
        MediaTaskArtifactImageCreateParams {
            project_root_path: self.project_root_path,
            prompt: self.prompt,
            title: self.title,
            title_generation_result: self.title_generation_result,
            persona_context: self.persona_context,
            presentation: self.presentation,
            taste_context: self.taste_context,
            mode: self.mode,
            raw_text: self.raw_text,
            layout_hint: self.layout_hint,
            size: self.size,
            aspect_ratio: self.aspect_ratio,
            count: self.count,
            usage: self.usage,
            style: self.style,
            provider_id: self.provider_id,
            model: self.model,
            executor_mode: self.executor_mode,
            outer_model: self.outer_model,
            session_id: Some(self.scope.session_id),
            thread_id: Some(self.scope.thread_id),
            turn_id: Some(self.scope.turn_id),
            project_id: self.project_id,
            content_id: self.content_id,
            entry_source: self.entry_source,
            modality_contract_key: self.modality_contract_key,
            modality: self.modality,
            required_capabilities: self.required_capabilities,
            routing_slot: self.routing_slot,
            runtime_contract: self.runtime_contract,
            requested_target: self.requested_target,
            slot_id: self.slot_id,
            anchor_hint: self.anchor_hint,
            anchor_section_title: self.anchor_section_title,
            anchor_text: self.anchor_text,
            target_output_id: self.target_output_id,
            target_output_ref_id: self.target_output_ref_id,
            reference_images: self.reference_images,
            storyboard_slots: self.storyboard_slots,
        }
    }
}

fn parse_image_command_intent(
    request: &ExecutionRequest,
    scope: &RuntimeSessionScope,
) -> Result<Option<ImageCommandIntent>, RuntimeCoreError> {
    let Some((launch, image_task, source_kind)) = image_command_metadata(request) else {
        return Ok(None);
    };
    let launch = &launch;
    let image_task = &image_task;
    let host_request = aster_chat_request_from_request(request);
    let workspace_scope = request_workspace_scope(request, host_request.as_ref());
    let project_root_path = optional_string(
        image_task,
        &[
            "project_root_path",
            "projectRootPath",
            "workspace_root",
            "workspaceRoot",
            "project_root",
            "projectRoot",
        ],
    )
    .or_else(|| {
        optional_string(
            launch,
            &[
                "project_root_path",
                "projectRootPath",
                "workspace_root",
                "workspaceRoot",
                "project_root",
                "projectRoot",
            ],
        )
    })
    .or_else(|| absolute_path_string(workspace_scope.project_root.as_ref()))
    .or_else(|| absolute_path_string(workspace_scope.working_dir.as_ref()));
    let prompt = optional_string(image_task, &["prompt"])
        .or_else(|| optional_string(launch, &["prompt"]))
        .unwrap_or_default();
    let raw_text = optional_string(image_task, &["raw_text", "rawText"])
        .or_else(|| optional_string(launch, &["raw_text", "rawText"]))
        .or_else(|| non_empty_string(&request.input.text));
    let required_capabilities = string_vec(
        image_task,
        &["required_capabilities", "requiredCapabilities"],
    );
    let storyboard_slots = image_task
        .get("storyboard_slots")
        .or_else(|| image_task.get("storyboardSlots"))
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|error| {
            RuntimeCoreError::Backend(format!("image command storyboard_slots invalid: {error}"))
        })?
        .unwrap_or_default();

    Ok(Some(ImageCommandIntent {
        scope: scope.clone(),
        project_root_path: project_root_path.unwrap_or_default(),
        prompt,
        title: optional_string(image_task, &["title"]),
        title_generation_result: cloned_field(
            image_task,
            &["title_generation_result", "titleGenerationResult"],
        ),
        persona_context: cloned_field(image_task, &["persona_context", "personaContext"]),
        presentation: cloned_field(image_task, &["presentation"]),
        taste_context: cloned_field(image_task, &["taste_context", "tasteContext"]),
        mode: normalize_mode(optional_string(image_task, &["mode"])),
        raw_text,
        layout_hint: optional_string(image_task, &["layout_hint", "layoutHint"]),
        size: optional_string(image_task, &["size"]),
        aspect_ratio: optional_string(image_task, &["aspect_ratio", "aspectRatio"]),
        count: optional_u32(image_task, &["count"])?,
        usage: optional_string(image_task, &["usage"]),
        style: optional_string(image_task, &["style"]),
        provider_id: optional_string(image_task, &["provider_id", "providerId"]),
        model: optional_string(image_task, &["model"]),
        executor_mode: optional_string(image_task, &["executor_mode", "executorMode"]),
        outer_model: optional_string(image_task, &["outer_model", "outerModel"]),
        project_id: optional_string(image_task, &["project_id", "projectId"]),
        content_id: optional_string(image_task, &["content_id", "contentId"]),
        entry_source: optional_string(image_task, &["entry_source", "entrySource"])
            .or_else(|| optional_string(launch, &["entry_source", "entrySource"]))
            .or_else(|| Some(source_kind.to_string())),
        modality_contract_key: optional_string(
            image_task,
            &["modality_contract_key", "modalityContractKey"],
        ),
        modality: optional_string(image_task, &["modality"]),
        required_capabilities,
        routing_slot: optional_string(image_task, &["routing_slot", "routingSlot"]),
        runtime_contract: cloned_field(image_task, &["runtime_contract", "runtimeContract"]),
        requested_target: optional_string(image_task, &["requested_target", "requestedTarget"]),
        slot_id: optional_string(image_task, &["slot_id", "slotId"]),
        anchor_hint: optional_string(image_task, &["anchor_hint", "anchorHint"]),
        anchor_section_title: optional_string(
            image_task,
            &["anchor_section_title", "anchorSectionTitle"],
        ),
        anchor_text: optional_string(image_task, &["anchor_text", "anchorText"]),
        target_output_id: optional_string(image_task, &["target_output_id", "targetOutputId"]),
        target_output_ref_id: optional_string(
            image_task,
            &["target_output_ref_id", "targetOutputRefId"],
        ),
        reference_images: string_vec(image_task, &["reference_images", "referenceImages"]),
        storyboard_slots,
        presentation_usage: None,
    }))
}

fn image_command_metadata(request: &ExecutionRequest) -> Option<(Value, Value, &'static str)> {
    for metadata in request_metadata_values(request) {
        if let Some(intent) = find_value(
            metadata,
            &[
                "/harness/image_command_intent",
                "/harness/imageCommandIntent",
                "/image_command_intent",
                "/imageCommandIntent",
            ],
        ) {
            if let Some(image_task) = image_task_value(intent) {
                return Some((intent.clone(), image_task.clone(), "image_command_intent"));
            }
        }
    }
    if let Some(host_metadata) =
        aster_chat_request_from_request(request).and_then(|host| host_metadata_value(&host))
    {
        if let Some((launch, image_task, source)) =
            image_command_metadata_from_value(&host_metadata)
        {
            return Some((launch, image_task, source));
        }
    }
    None
}

fn request_metadata_values(request: &ExecutionRequest) -> Vec<&Value> {
    let mut values = Vec::new();
    if let Some(value) = request
        .runtime_options
        .as_ref()
        .and_then(|options| options.metadata.as_ref())
    {
        values.push(value);
    }
    if let Some(value) = request.metadata.as_ref() {
        values.push(value);
    }
    values
}

fn image_command_metadata_from_value(value: &Value) -> Option<(Value, Value, &'static str)> {
    if let Some(intent) = find_value(
        value,
        &[
            "/harness/image_command_intent",
            "/harness/imageCommandIntent",
            "/image_command_intent",
            "/imageCommandIntent",
        ],
    ) {
        if let Some(image_task) = image_task_value(intent) {
            return Some((intent.clone(), image_task.clone(), "image_command_intent"));
        }
    }
    None
}

fn image_task_value(value: &Value) -> Option<&Value> {
    value
        .get("image_task")
        .or_else(|| value.get("imageTask"))
        .or_else(|| value.get("task"))
        .filter(|value| value.is_object())
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

fn find_value<'a>(value: &'a Value, pointers: &[&str]) -> Option<&'a Value> {
    pointers.iter().find_map(|pointer| value.pointer(pointer))
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

fn emit_presentation_unavailable(
    intent: &ImageCommandIntent,
    reason_code: &str,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    sink.emit(RuntimeEvent::new(
        "image_task.presentation.unavailable",
        json!({
            "backend": "runtime",
            "source": WORKFLOW_SOURCE,
            "status": "unavailable",
            "reasonCode": reason_code,
            "reason_code": reason_code,
            "workflowRunId": workflow_run_id(&intent.scope),
            "workflow_run_id": workflow_run_id(&intent.scope),
            "sessionId": intent.scope.session_id,
            "session_id": intent.scope.session_id,
            "threadId": intent.scope.thread_id,
            "thread_id": intent.scope.thread_id,
            "turnId": intent.scope.turn_id,
            "turn_id": intent.scope.turn_id,
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
    tool_call_id: &str,
    params: &MediaTaskArtifactImageCreateParams,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    let args = serde_json::to_value(params).unwrap_or_else(|_| json!({}));
    sink.emit(RuntimeEvent::new(
        "tool.started",
        json!({
            "backend": "runtime",
            "source": WORKFLOW_SOURCE,
            "toolCallId": tool_call_id,
            "toolName": LIME_CREATE_IMAGE_TASK_TOOL_NAME,
            "tool_name": LIME_CREATE_IMAGE_TASK_TOOL_NAME,
            "name": LIME_CREATE_IMAGE_TASK_TOOL_NAME,
            "arguments": args,
        }),
    ))?;
    sink.emit(RuntimeEvent::new(
        "tool.args",
        json!({
            "backend": "runtime",
            "source": WORKFLOW_SOURCE,
            "toolCallId": tool_call_id,
            "toolName": LIME_CREATE_IMAGE_TASK_TOOL_NAME,
            "tool_name": LIME_CREATE_IMAGE_TASK_TOOL_NAME,
            "args": args,
            "rawArgs": args,
        }),
    ))
}

fn emit_task_created(
    tool_call_id: &str,
    response: MediaTaskArtifactResponse,
    usage: Option<&AgentTokenUsage>,
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
    let result = image_tools::tool_result_from_response(response);
    sink.emit(RuntimeEvent::new(
        "tool.result",
        json!({
            "backend": "runtime",
            "source": WORKFLOW_SOURCE,
            "toolCallId": tool_call_id,
            "toolName": LIME_CREATE_IMAGE_TASK_TOOL_NAME,
            "tool_name": LIME_CREATE_IMAGE_TASK_TOOL_NAME,
            "name": LIME_CREATE_IMAGE_TASK_TOOL_NAME,
            "result": {
                "success": true,
                "output": result.output,
                "metadata": result.metadata,
            },
        }),
    ))?;
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
    tracing::warn!(
        session_id = %intent.scope.session_id,
        thread_id = %intent.scope.thread_id,
        turn_id = %intent.scope.turn_id,
        workflow_run_id = %workflow_run_id(&intent.scope),
        reason_code = %reason_code,
        "[RuntimeBackend] ImageCommandWorkflow task create failed"
    );
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
    ))?;
    emit_workflow_step_completed(intent, "create_tasks", "创建图片任务", "failed", None, sink)?;
    emit_workflow_run_completed(intent, "create_failed", None, sink)?;
    emit_tool_failed(&tool_call_id, reason_code, message, sink)?;
    emit_turn_completed("create_failed", intent, sink)
}

fn emit_tool_failed(
    tool_call_id: &str,
    reason_code: &str,
    message: &str,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    sink.emit(RuntimeEvent::new(
        "tool.failed",
        json!({
            "backend": "runtime",
            "source": WORKFLOW_SOURCE,
            "toolCallId": tool_call_id,
            "toolName": LIME_CREATE_IMAGE_TASK_TOOL_NAME,
            "tool_name": LIME_CREATE_IMAGE_TASK_TOOL_NAME,
            "name": LIME_CREATE_IMAGE_TASK_TOOL_NAME,
            "status": "failed",
            "failureCategory": reason_code,
            "failure_category": reason_code,
            "error": message,
            "result": {
                "success": false,
                "output": "",
                "error": message,
                "metadata": {
                    "reasonCode": reason_code,
                    "reason_code": reason_code,
                    "source": WORKFLOW_SOURCE,
                },
            },
        }),
    ))
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
    format!("image-command-create-task-{}", scope.turn_id)
}

fn normalize_mode(value: Option<String>) -> Option<String> {
    match value.as_deref() {
        Some("generate") => Some("generate".to_string()),
        Some("edit") => Some("edit".to_string()),
        Some("variation") => Some("variation".to_string()),
        _ => None,
    }
}

fn optional_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .and_then(non_empty_string)
}

fn non_empty_string(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn cloned_field(value: &Value, keys: &[&str]) -> Option<Value> {
    keys.iter().find_map(|key| value.get(*key)).cloned()
}

fn optional_u32(value: &Value, keys: &[&str]) -> Result<Option<u32>, RuntimeCoreError> {
    let Some(value) = keys.iter().filter_map(|key| value.get(*key)).next() else {
        return Ok(None);
    };
    let Some(number) = value.as_u64() else {
        return Err(RuntimeCoreError::Backend(format!(
            "image command {} must be a non-negative integer",
            keys[0]
        )));
    };
    u32::try_from(number)
        .map(Some)
        .map_err(|_| RuntimeCoreError::Backend(format!("image command {} is too large", keys[0])))
}

fn string_vec(value: &Value, keys: &[&str]) -> Vec<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .filter_map(non_empty_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn absolute_path_string(path: Option<&PathBuf>) -> Option<String> {
    let path = path?;
    path.is_absolute()
        .then(|| path.to_string_lossy().trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::RuntimeCoreError;
    use crate::{
        AutomationManagementAppDataSource, AutomationOverviewAppDataSource, ConnectAppDataSource,
        DiagnosticsAppDataSource, GatewayAppDataSource, KnowledgeAppDataSource, McpAppDataSource,
        MediaAppDataSource, MemoryAppDataSource, ModelProviderAppDataSource, PluginDataSource,
        RightSurfaceAppDataSource, SessionAppDataSource, SkillAppDataSource,
        UsageStatsAppDataSource, VoiceAppDataSource, WorkspaceAppDataSource,
        WorkspaceSkillBindingAppDataSource,
    };
    use app_server_protocol::{
        AgentInput, AgentSession, AgentSessionStatus, AgentTurn, AgentTurnStatus, RuntimeOptions,
    };
    use async_trait::async_trait;
    use std::sync::Mutex;
    use tempfile::TempDir;

    #[derive(Default)]
    struct TestSink {
        events: Vec<RuntimeEvent>,
    }

    impl RuntimeEventSink for TestSink {
        fn emit(&mut self, event: RuntimeEvent) -> Result<(), RuntimeCoreError> {
            self.events.push(event);
            Ok(())
        }
    }

    #[derive(Default)]
    struct ImageCommandTestDataSource {
        params: Mutex<Vec<MediaTaskArtifactImageCreateParams>>,
    }

    impl SessionAppDataSource for ImageCommandTestDataSource {}
    impl WorkspaceAppDataSource for ImageCommandTestDataSource {}
    impl SkillAppDataSource for ImageCommandTestDataSource {}
    impl WorkspaceSkillBindingAppDataSource for ImageCommandTestDataSource {}
    impl GatewayAppDataSource for ImageCommandTestDataSource {}
    impl VoiceAppDataSource for ImageCommandTestDataSource {}
    impl PluginDataSource for ImageCommandTestDataSource {}
    impl KnowledgeAppDataSource for ImageCommandTestDataSource {}
    impl AutomationOverviewAppDataSource for ImageCommandTestDataSource {}
    impl McpAppDataSource for ImageCommandTestDataSource {}
    impl AutomationManagementAppDataSource for ImageCommandTestDataSource {}
    impl MemoryAppDataSource for ImageCommandTestDataSource {}
    impl DiagnosticsAppDataSource for ImageCommandTestDataSource {}
    impl UsageStatsAppDataSource for ImageCommandTestDataSource {}
    impl ModelProviderAppDataSource for ImageCommandTestDataSource {}
    impl ConnectAppDataSource for ImageCommandTestDataSource {}
    impl RightSurfaceAppDataSource for ImageCommandTestDataSource {}

    #[async_trait]
    impl MediaAppDataSource for ImageCommandTestDataSource {
        async fn create_image_media_task_artifact(
            &self,
            params: MediaTaskArtifactImageCreateParams,
        ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
            self.params
                .lock()
                .expect("params lock")
                .push(params.clone());
            crate::media_task::create_image_generation_task_artifact(params, None)
                .map_err(RuntimeCoreError::Backend)
        }
    }

    #[tokio::test]
    async fn image_command_workflow_creates_task_from_current_intent_metadata() {
        let workspace = TempDir::new().expect("workspace");
        let request = request_with_metadata(json!({
            "harness": {
                "projectRoot": workspace.path().to_string_lossy(),
                "image_command_intent": {
                    "kind": "image_command",
                    "image_task": {
                        "prompt": "画一张广州夏天的图",
                        "mode": "generate",
                        "count": 2,
                        "provider_id": "openai",
                        "model": "gpt-image-2",
                        "executor_mode": "images_api",
                        "entry_source": "at_image_command"
                    }
                }
            }
        }));
        let scope = RuntimeSessionScope {
            session_id: "session-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            workspace_id: None,
        };
        let data_source = Arc::new(ImageCommandTestDataSource::default());
        let mut sink = TestSink::default();

        let handled = handle_image_command_turn_if_present(
            None,
            &request,
            &scope,
            Some(data_source.clone()),
            &mut sink,
        )
        .await
        .expect("workflow should run");

        assert!(handled);
        let stored = data_source.params.lock().expect("params lock");
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].prompt, "画一张广州夏天的图");
        assert_eq!(stored[0].session_id.as_deref(), Some("session-1"));
        assert_eq!(stored[0].thread_id.as_deref(), Some("thread-1"));
        assert_eq!(stored[0].turn_id.as_deref(), Some("turn-1"));
        assert_eq!(stored[0].provider_id.as_deref(), Some("openai"));
        assert_eq!(stored[0].model.as_deref(), Some("gpt-image-2"));
        assert_eq!(stored[0].entry_source.as_deref(), Some("at_image_command"));
        assert_eq!(
            sink.events
                .iter()
                .filter(|event| !event.event_type.starts_with("workflow."))
                .map(|event| event.event_type.as_str())
                .collect::<Vec<_>>(),
            vec![
                "runtime.status",
                "tool.started",
                "tool.args",
                "image_task.created",
                "tool.result",
                "turn.completed"
            ]
        );
        let workflow_event_types = sink
            .events
            .iter()
            .filter(|event| event.event_type.starts_with("workflow."))
            .map(|event| event.event_type.as_str())
            .collect::<Vec<_>>();
        assert_eq!(
            workflow_event_types,
            vec![
                "workflow.run.started",
                "workflow.step.completed",
                "workflow.step.started",
                "workflow.step.completed",
                "workflow.run.completed"
            ]
        );
        let workflow_completed = sink
            .events
            .iter()
            .find(|event| event.event_type == "workflow.run.completed")
            .expect("workflow run completed");
        assert_eq!(
            workflow_completed.payload["run_id"].as_str(),
            Some("image-command-run-turn-1")
        );
        assert_eq!(
            workflow_completed.payload["task_id"].as_str(),
            Some(
                sink.events
                    .iter()
                    .find(|event| event.event_type == "image_task.created")
                    .expect("created event")
                    .payload["task_id"]
                    .as_str()
                    .expect("created task id")
            )
        );
        assert_eq!(
            workflow_completed.payload["redaction"]["policy"].as_str(),
            Some("workflow_audit_metadata_only")
        );
        let workflow_started = sink
            .events
            .iter()
            .find(|event| event.event_type == "workflow.run.started")
            .expect("workflow run started");
        assert_eq!(
            workflow_started.payload["steps"].as_array().unwrap().len(),
            5
        );
        assert_eq!(
            workflow_started.payload["steps"][0]["status"].as_str(),
            Some("queued")
        );
        assert_eq!(
            workflow_started.payload["steps"][2]["id"].as_str(),
            Some("create_tasks")
        );
        let create_tasks_started = sink
            .events
            .iter()
            .find(|event| {
                event.event_type == "workflow.step.started"
                    && event.payload["stepId"].as_str() == Some("create_tasks")
            })
            .expect("create_tasks started");
        assert_eq!(create_tasks_started.payload["stepIndex"].as_u64(), Some(2));
        assert_eq!(create_tasks_started.payload["stepCount"].as_u64(), Some(5));
        assert_eq!(
            create_tasks_started.payload["stepKind"].as_str(),
            Some("tool")
        );
        let tool_result = sink
            .events
            .iter()
            .find(|event| event.event_type == "tool.result")
            .expect("tool result");
        assert_eq!(
            tool_result.payload["toolName"].as_str(),
            Some(LIME_CREATE_IMAGE_TASK_TOOL_NAME)
        );
        assert_eq!(
            tool_result.payload["result"]["metadata"]["task_type"].as_str(),
            Some("image_generate")
        );
        let created_event = sink
            .events
            .iter()
            .find(|event| event.event_type == "image_task.created")
            .expect("image task created event");
        let run_snapshot =
            &created_event.payload["response"]["record"]["payload"]["image_command_run"];
        assert_eq!(
            run_snapshot["run_id"].as_str(),
            Some("image-command-run-turn-1")
        );
        assert_eq!(run_snapshot["branches"].as_array().map(Vec::len), Some(2));
        assert_eq!(
            run_snapshot["branches"][0]["branch_id"].as_str(),
            Some("image-command-run-turn-1:branch:1")
        );
    }

    #[test]
    fn image_command_task_created_turn_completed_includes_presentation_usage() {
        let mut sink = TestSink::default();
        let usage = AgentTokenUsage {
            input_tokens: 31_000,
            output_tokens: 0,
            cached_input_tokens: Some(1_024),
            cache_creation_input_tokens: None,
        };
        let response = MediaTaskArtifactResponse {
            success: true,
            task_id: "task-image-usage".to_string(),
            task_type: "image_generate".to_string(),
            task_family: "image".to_string(),
            status: "pending_submit".to_string(),
            normalized_status: "pending".to_string(),
            artifact_path: ".lime/tasks/image_generate/task-image-usage.json".to_string(),
            record: json!({
                "task_type": "image_generate",
                "payload": {
                    "prompt": "从花城汇看广州塔的春天照片"
                }
            }),
            ..MediaTaskArtifactResponse::default()
        };

        emit_task_created("tool-image-usage", response, Some(&usage), &mut sink)
            .expect("task created events");

        let turn_completed = sink
            .events
            .iter()
            .find(|event| event.event_type == "turn.completed")
            .expect("turn completed");
        assert_eq!(
            turn_completed.payload["status"].as_str(),
            Some("task_created")
        );
        assert_eq!(
            turn_completed.payload["usage"]["input_tokens"].as_u64(),
            Some(31_000)
        );
        assert_eq!(
            turn_completed.payload["usage"]["output_tokens"].as_u64(),
            Some(0)
        );
        assert_eq!(
            turn_completed.payload["usage"]["cached_input_tokens"].as_u64(),
            Some(1_024)
        );
        assert!(turn_completed.payload["usage"]
            .get("cache_creation_input_tokens")
            .is_none());
    }

    #[tokio::test]
    async fn image_command_workflow_ignores_legacy_image_skill_launch_metadata() {
        let request = request_with_metadata(json!({
            "harness": {
                "image_skill_launch": {
                    "skill_name": "image_generate",
                    "kind": "image_task",
                    "image_task": {
                        "prompt": "画一张广州夏天的图",
                        "mode": "generate"
                    }
                }
            }
        }));
        let scope = RuntimeSessionScope {
            session_id: "session-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            workspace_id: None,
        };
        let data_source = Arc::new(ImageCommandTestDataSource::default());
        let mut sink = TestSink::default();

        let handled = handle_image_command_turn_if_present(
            None,
            &request,
            &scope,
            Some(data_source.clone()),
            &mut sink,
        )
        .await
        .expect("legacy image skill launch should be ignored");

        assert!(!handled);
        assert!(sink.events.is_empty());
        let stored = data_source.params.lock().expect("params lock");
        assert!(stored.is_empty());
    }

    #[tokio::test]
    async fn image_command_workflow_requires_project_root_instead_of_using_cwd() {
        let request = request_with_metadata(json!({
            "harness": {
                "image_command_intent": {
                    "kind": "image_command",
                    "image_task": {
                        "prompt": "画一张广州夏天的图",
                        "mode": "generate"
                    }
                }
            }
        }));
        let scope = RuntimeSessionScope {
            session_id: "session-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            workspace_id: None,
        };
        let data_source = Arc::new(ImageCommandTestDataSource::default());
        let mut sink = TestSink::default();

        let handled = handle_image_command_turn_if_present(
            None,
            &request,
            &scope,
            Some(data_source.clone()),
            &mut sink,
        )
        .await
        .expect("workflow should handle missing project root");

        assert!(handled);
        assert_eq!(
            sink.events
                .iter()
                .filter(|event| !event.event_type.starts_with("workflow."))
                .map(|event| event.event_type.as_str())
                .collect::<Vec<_>>(),
            vec![
                "runtime.status",
                "image_task.parameters.required",
                "turn.completed"
            ]
        );
        assert_eq!(
            sink.events
                .iter()
                .filter(|event| event.event_type.starts_with("workflow."))
                .map(|event| event.event_type.as_str())
                .collect::<Vec<_>>(),
            vec![
                "workflow.run.started",
                "workflow.step.completed",
                "workflow.step.completed",
                "workflow.run.completed"
            ]
        );
        let workflow_started = sink
            .events
            .iter()
            .find(|event| event.event_type == "workflow.run.started")
            .expect("workflow run started");
        assert_eq!(
            workflow_started.payload["steps"]
                .as_array()
                .expect("workflow steps")
                .len(),
            5
        );
        assert_eq!(
            workflow_started.payload["steps"][2]["id"].as_str(),
            Some("create_tasks")
        );
        assert_eq!(
            sink.events
                .iter()
                .find(|event| event.event_type == "image_task.parameters.required")
                .and_then(|event| event.payload["missing"][0].as_str()),
            Some("project_root_path")
        );
        let stored = data_source.params.lock().expect("params lock");
        assert!(stored.is_empty());
    }

    #[tokio::test]
    async fn image_command_workflow_requires_prompt_without_falling_through() {
        let request = request_with_metadata(json!({
            "harness": {
                "image_command_intent": {
                    "kind": "image_command",
                    "image_task": {
                        "mode": "generate"
                    }
                }
            }
        }));
        let scope = RuntimeSessionScope {
            session_id: "session-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            workspace_id: None,
        };
        let mut sink = TestSink::default();

        let handled = handle_image_command_turn_if_present(None, &request, &scope, None, &mut sink)
            .await
            .expect("workflow should handle missing prompt");

        assert!(handled);
        assert_eq!(
            sink.events
                .iter()
                .filter(|event| !event.event_type.starts_with("workflow."))
                .map(|event| event.event_type.as_str())
                .collect::<Vec<_>>(),
            vec![
                "runtime.status",
                "image_task.parameters.required",
                "turn.completed"
            ]
        );
        assert_eq!(
            sink.events
                .iter()
                .filter(|event| event.event_type.starts_with("workflow."))
                .map(|event| event.event_type.as_str())
                .collect::<Vec<_>>(),
            vec![
                "workflow.run.started",
                "workflow.step.completed",
                "workflow.step.completed",
                "workflow.run.completed"
            ]
        );
        assert!(
            sink.events
                .iter()
                .filter(|event| event.event_type.starts_with("workflow.step."))
                .all(|event| event.payload["stepId"].as_str() != Some("create_task")),
            "image workflow uses the current create_tasks step id"
        );
    }

    #[test]
    fn ordinary_chat_without_image_metadata_does_not_enter_workflow() {
        let request = request_with_metadata(json!({
            "harness": {
                "service_scene_launch": {
                    "scene": "article"
                }
            }
        }));
        let scope = RuntimeSessionScope {
            session_id: "session-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            workspace_id: None,
        };

        let parsed = parse_image_command_intent(&request, &scope).expect("parse");

        assert!(parsed.is_none());
    }

    fn request_with_metadata(metadata: Value) -> ExecutionRequest {
        ExecutionRequest {
            host: crate::RuntimeHostContext::default(),
            session: AgentSession {
                session_id: "session-1".to_string(),
                thread_id: "thread-1".to_string(),
                app_id: "content-studio".to_string(),
                workspace_id: Some("workspace-main".to_string()),
                business_object_ref: None,
                status: AgentSessionStatus::Running,
                created_at: "2026-06-07T00:00:00.000Z".to_string(),
                updated_at: "2026-06-07T00:00:00.000Z".to_string(),
            },
            turn: AgentTurn {
                turn_id: "turn-1".to_string(),
                session_id: "session-1".to_string(),
                thread_id: "thread-1".to_string(),
                status: AgentTurnStatus::Accepted,
                started_at: None,
                completed_at: None,
            },
            input: AgentInput {
                text: "画一张广州夏天的图".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                stream: true,
                metadata: Some(metadata),
                ..RuntimeOptions::default()
            }),
            expected_output: None,
            structured_output: None,
            output_schema: None,
            event_name: None,
            provider_preference: None,
            model_preference: None,
            metadata: None,
            queued_turn_id: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        }
    }
}
