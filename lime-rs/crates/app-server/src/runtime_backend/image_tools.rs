use crate::local_data_source::create_image_media_task_artifact;
use crate::runtime::ToolInventoryReadRequest;
use crate::{AppDataSource, RuntimeCoreError};
use app_server_protocol::{
    MediaTaskArtifactImageCreateParams, MediaTaskArtifactResponse, MediaTaskArtifactImageCompleteParams,
};
use aster::session_context::{current_action_scope, current_session_id, current_turn_context};
use aster::tools::{PermissionCheckResult, Tool, ToolContext, ToolError, ToolOptions, ToolResult};
use async_trait::async_trait;
use lime_agent::agent_tools::catalog::LIME_CREATE_IMAGE_TASK_TOOL_NAME;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

pub(crate) fn create_image_tools(app_data_source: Arc<dyn AppDataSource>) -> Vec<Box<dyn Tool>> {
    vec![Box::new(ImageGenerationTool::new(app_data_source))]
}

#[derive(Clone)]
struct ImageGenerationTool {
    app_data_source: Arc<dyn AppDataSource>,
}

impl ImageGenerationTool {
    fn new(app_data_source: Arc<dyn AppDataSource>) -> Self {
        Self { app_data_source }
    }

    fn parse_params(&self, params: Value, context: &ToolContext) -> Result<ImageToolInput, ToolError> {
        let prompt = required_string(&params, &["prompt"])?;
        let size = optional_string(&params, &["size"]);
        let style = optional_string(&params, &["style"]);
        let usage = optional_string(&params, &["usage"]);
        let mode = optional_string(&params, &["mode"]);
        let layout_hint = optional_string(&params, &["layoutHint", "layout_hint"]);
        let count = optional_u32(&params, &["count"]);
        let aspect_ratio = optional_string(&params, &["aspectRatio", "aspect_ratio"]);
        let provider_id = optional_string(&params, &["provider_id", "providerId"]);
        let model = optional_string(&params, &["model"]);
        let executor_mode = optional_string(&params, &["executor_mode", "executorMode"]);
        let outer_model = optional_string(&params, &["outer_model", "outerModel"]);
        let project_root_path = resolve_project_root_path(&params, context)?;
        let session_id = required_identity(
            optional_string(&params, &["session_id", "sessionId"])
                .or_else(current_session_id)
                .as_deref(),
            "session_id",
        )?;
        let thread_id = required_identity(
            optional_string(&params, &["thread_id", "threadId"])
                .or_else(|| current_action_scope().and_then(|scope| scope.thread_id))
                .as_deref(),
            "thread_id",
        )?;
        let turn_id = required_identity(
            optional_string(&params, &["turn_id", "turnId"])
                .or_else(|| current_action_scope().and_then(|scope| scope.turn_id))
                .or_else(|| current_turn_context().and_then(|ctx| ctx.metadata.get("turn_id").and_then(Value::as_str).map(str::to_string)))
                .as_deref(),
            "turn_id",
        )?;
        let project_id = optional_string(&params, &["project_id", "projectId"]);
        let content_id = optional_string(&params, &["content_id", "contentId"]);
        let entry_source = optional_string(&params, &["entry_source", "entrySource"]);
        let requested_target = optional_string(&params, &["requested_target", "requestedTarget"]);
        let modality_contract_key = optional_string(&params, &["modality_contract_key", "modalityContractKey"]);
        let modality = optional_string(&params, &["modality"]);
        let routing_slot = optional_string(&params, &["routing_slot", "routingSlot"]);
        let runtime_contract = params.get("runtime_contract").cloned().or_else(|| params.get("runtimeContract").cloned());
        let slot_id = optional_string(&params, &["slot_id", "slotId"]);
        let anchor_hint = optional_string(&params, &["anchor_hint", "anchorHint"]);
        let anchor_section_title =
            optional_string(&params, &["anchor_section_title", "anchorSectionTitle"]);
        let anchor_text = optional_string(&params, &["anchor_text", "anchorText"]);
        let target_output_id =
            optional_string(&params, &["target_output_id", "targetOutputId"]);
        let target_output_ref_id =
            optional_string(&params, &["target_output_ref_id", "targetOutputRefId"]);
        let title = optional_string(&params, &["title"]);
        let title_generation_result = params.get("title_generation_result").cloned().or_else(|| params.get("titleGenerationResult").cloned());
        let persona_context = params.get("persona_context").cloned().or_else(|| params.get("personaContext").cloned());
        let presentation = params.get("presentation").cloned();
        let taste_context = params.get("taste_context").cloned().or_else(|| params.get("tasteContext").cloned());
        let raw_text = optional_string(&params, &["raw_text", "rawText"]);
        let reference_images = string_vec(&params, &["reference_images", "referenceImages"]);
        let storyboard_slots = params
            .get("storyboard_slots")
            .or_else(|| params.get("storyboardSlots"))
            .cloned()
            .map(|value| serde_json::from_value(value).map_err(|error| ToolError::invalid_params(format!("storyboard_slots invalid: {error}"))))
            .transpose()?
            .unwrap_or_default();

        if prompt.trim().is_empty() {
            return Err(ToolError::invalid_params("prompt 不能为空"));
        }
        if size.as_deref().is_some_and(|value| value.trim().is_empty()) {
            return Err(ToolError::invalid_params("size 不能为空"));
        }
        if let Some(layout_hint) = layout_hint.as_deref() {
            if layout_hint == "storyboard_3x3" && storyboard_slots.is_empty() {
                return Err(ToolError::invalid_params(
                    "layout_hint=storyboard_3x3 时 storyboard_slots 不能为空",
                ));
            }
        }

        Ok(ImageToolInput {
            project_root_path,
            prompt,
            title,
            title_generation_result,
            persona_context,
            presentation,
            taste_context,
            mode,
            raw_text,
            layout_hint,
            size,
            aspect_ratio,
            count,
            usage,
            style,
            provider_id,
            model,
            executor_mode,
            outer_model,
            session_id,
            thread_id,
            turn_id,
            project_id,
            content_id,
            entry_source,
            modality_contract_key,
            modality,
            routing_slot,
            runtime_contract,
            requested_target,
            slot_id,
            anchor_hint,
            anchor_section_title,
            anchor_text,
            target_output_id,
            target_output_ref_id,
            reference_images,
            storyboard_slots,
        })
    }
}

#[async_trait]
impl Tool for ImageGenerationTool {
    fn name(&self) -> &str {
        LIME_CREATE_IMAGE_TASK_TOOL_NAME
    }

    fn description(&self) -> &str {
        "Create a real image generation task and return the App Server media task artifact response."
    }

    fn input_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "project_root_path": { "type": "string" },
                "prompt": { "type": "string" },
                "title": { "type": "string" },
                "title_generation_result": {},
                "persona_context": {},
                "presentation": {},
                "taste_context": {},
                "mode": { "type": "string" },
                "raw_text": { "type": "string" },
                "layout_hint": { "type": "string" },
                "size": { "type": "string" },
                "aspect_ratio": { "type": "string" },
                "count": { "type": "integer", "minimum": 1 },
                "usage": { "type": "string" },
                "style": { "type": "string" },
                "provider_id": { "type": "string" },
                "model": { "type": "string" },
                "executor_mode": { "type": "string" },
                "outer_model": { "type": "string" },
                "session_id": { "type": "string" },
                "thread_id": { "type": "string" },
                "turn_id": { "type": "string" },
                "project_id": { "type": "string" },
                "content_id": { "type": "string" },
                "entry_source": { "type": "string" },
                "modality_contract_key": { "type": "string" },
                "modality": { "type": "string" },
                "routing_slot": { "type": "string" },
                "runtime_contract": {},
                "requested_target": { "type": "string" },
                "slot_id": { "type": "string" },
                "anchor_hint": { "type": "string" },
                "anchor_section_title": { "type": "string" },
                "anchor_text": { "type": "string" },
                "target_output_id": { "type": "string" },
                "target_output_ref_id": { "type": "string" },
                "reference_images": { "type": "array", "items": { "type": "string" } },
                "storyboard_slots": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "prompt": { "type": "string" },
                            "slot_id": { "type": "string" },
                            "label": { "type": "string" },
                            "shot_type": { "type": "string" }
                        },
                        "required": ["prompt"]
                    }
                }
            },
            "required": ["project_root_path", "prompt"]
        })
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        if context.is_cancelled() {
            return Err(ToolError::Cancelled);
        }
        let input = self.parse_params(params, context)?;
        let response = self
            .app_data_source
            .create_image_media_task_artifact(build_create_params(input))
            .await
            .map_err(|error| ToolError::execution_failed(error.to_string()))?;
        Ok(tool_result_from_response(response))
    }

    async fn check_permissions(
        &self,
        params: &Value,
        context: &ToolContext,
    ) -> PermissionCheckResult {
        match self.parse_params(params.clone(), context) {
            Ok(_) => PermissionCheckResult::allow(),
            Err(error) => PermissionCheckResult::deny(error.to_string()),
        }
    }

    fn options(&self) -> ToolOptions {
        ToolOptions::new().with_max_retries(0)
    }
}

#[derive(Debug, Clone)]
struct ImageToolInput {
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
    session_id: String,
    thread_id: String,
    turn_id: String,
    project_id: Option<String>,
    content_id: Option<String>,
    entry_source: Option<String>,
    modality_contract_key: Option<String>,
    modality: Option<String>,
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
}

fn build_create_params(input: ImageToolInput) -> MediaTaskArtifactImageCreateParams {
    MediaTaskArtifactImageCreateParams {
        project_root_path: input.project_root_path,
        prompt: input.prompt,
        title: input.title,
        title_generation_result: input.title_generation_result,
        persona_context: input.persona_context,
        presentation: input.presentation,
        taste_context: input.taste_context,
        mode: input.mode,
        raw_text: input.raw_text,
        layout_hint: input.layout_hint,
        size: input.size,
        aspect_ratio: input.aspect_ratio,
        count: input.count,
        usage: input.usage,
        style: input.style,
        provider_id: input.provider_id,
        model: input.model,
        executor_mode: input.executor_mode,
        outer_model: input.outer_model,
        session_id: Some(input.session_id),
        thread_id: Some(input.thread_id),
        turn_id: Some(input.turn_id),
        project_id: input.project_id,
        content_id: input.content_id,
        entry_source: input.entry_source,
        modality_contract_key: input.modality_contract_key,
        modality: input.modality,
        required_capabilities: Vec::new(),
        routing_slot: input.routing_slot,
        runtime_contract: input.runtime_contract,
        requested_target: input.requested_target,
        slot_id: input.slot_id,
        anchor_hint: input.anchor_hint,
        anchor_section_title: input.anchor_section_title,
        anchor_text: input.anchor_text,
        target_output_id: input.target_output_id,
        target_output_ref_id: input.target_output_ref_id,
        reference_images: input.reference_images,
        storyboard_slots: input.storyboard_slots,
    }
}

fn tool_result_from_response(response: MediaTaskArtifactResponse) -> ToolResult {
    let text = serde_json::to_string_pretty(&response).unwrap_or_else(|_| "{}".to_string());
    let mut result = ToolResult::success(text)
        .with_metadata("task_id", json!(response.task_id))
        .with_metadata("task_type", json!(response.task_type))
        .with_metadata("task_family", json!(response.task_family))
        .with_metadata("status", json!(response.status))
        .with_metadata("normalized_status", json!(response.normalized_status))
        .with_metadata("path", json!(response.path))
        .with_metadata("artifact_path", json!(response.artifact_path))
        .with_metadata("reused_existing", json!(response.reused_existing))
        .with_metadata("record", json!(response.record));
    if let Some(idempotency_key) = response.idempotency_key {
        result = result.with_metadata("idempotency_key", json!(idempotency_key));
    }
    result
}

fn resolve_project_root_path(params: &Value, context: &ToolContext) -> Result<String, ToolError> {
    if let Some(path) = optional_string(params, &["project_root_path", "projectRootPath"]) {
        return validate_absolute_path(&path);
    }

    let root = if context.working_directory.is_absolute() {
        context.working_directory.clone()
    } else {
        return Err(ToolError::invalid_params(
            "project_root_path requires an absolute working directory",
        ));
    };
    validate_absolute_path(&root.to_string_lossy())
}

fn validate_absolute_path(path: &str) -> Result<String, ToolError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(ToolError::invalid_params("project_root_path 不能为空"));
    }
    let candidate = PathBuf::from(trimmed);
    if !candidate.is_absolute() {
        return Err(ToolError::invalid_params(
            "project_root_path 必须是绝对路径",
        ));
    }
    Ok(candidate.to_string_lossy().to_string())
}

fn required_identity(value: Option<&str>, field: &str) -> Result<String, ToolError> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| ToolError::invalid_params(format!("{field} 不能为空")))
}

fn required_string(params: &Value, keys: &[&str]) -> Result<String, ToolError> {
    optional_string(params, keys).ok_or_else(|| {
        ToolError::invalid_params(format!("Missing required parameter: {}", keys[0]))
    })
}

fn optional_string(params: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| params.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn optional_u32(params: &Value, keys: &[&str]) -> Result<Option<u32>, ToolError> {
    let Some(value) = keys.iter().filter_map(|key| params.get(*key)).next() else {
        return Ok(None);
    };
    let Some(number) = value.as_u64() else {
        return Err(ToolError::invalid_params(format!(
            "{} must be a non-negative integer",
            keys[0]
        )));
    };
    u32::try_from(number)
        .map(Some)
        .map_err(|_| ToolError::invalid_params(format!("{} is too large", keys[0])))
}

fn string_vec(params: &Value, keys: &[&str]) -> Vec<String> {
    keys.iter()
        .filter_map(|key| params.get(*key))
        .find_map(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}
