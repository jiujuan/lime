use crate::agent_tools::catalog::LIME_CREATE_IMAGE_TASK_TOOL_NAME;
use crate::runtime_facade::current_agent_turn_context;
use app_server_protocol::{MediaTaskArtifactImageCreateParams, MediaTaskArtifactResponse};
use aster::session_context::{current_action_scope, current_session_id};
use aster::tools::{PermissionCheckResult, Tool, ToolContext, ToolError, ToolOptions, ToolResult};
use async_trait::async_trait;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

#[async_trait]
pub trait ImageTaskGateway: Send + Sync {
    async fn create_image_media_task_artifact(
        &self,
        params: MediaTaskArtifactImageCreateParams,
    ) -> Result<MediaTaskArtifactResponse, String>;
}

pub(crate) fn create_image_tools(gateway: Arc<dyn ImageTaskGateway>) -> Vec<Box<dyn Tool>> {
    vec![Box::new(ImageGenerationTool::new(gateway))]
}

#[derive(Debug, Clone, PartialEq)]
pub struct NativeToolResultProjection {
    pub output: Option<String>,
    pub metadata: HashMap<String, Value>,
}

#[derive(Clone)]
struct ImageGenerationTool {
    gateway: Arc<dyn ImageTaskGateway>,
}

impl ImageGenerationTool {
    fn new(gateway: Arc<dyn ImageTaskGateway>) -> Self {
        Self { gateway }
    }

    fn parse_params(
        &self,
        params: Value,
        context: &ToolContext,
    ) -> Result<ImageToolInput, ToolError> {
        let prompt = required_string(&params, &["prompt"])?;
        let size = optional_string(&params, &["size"]);
        let style = optional_string(&params, &["style"]);
        let usage = optional_string(&params, &["usage"]);
        let mode = optional_string(&params, &["mode"]);
        let layout_hint = optional_string(&params, &["layoutHint", "layout_hint"]);
        let count = optional_u32(&params, &["count"])?;
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
                .or_else(|| {
                    current_agent_turn_context().and_then(|ctx| {
                        ctx.metadata
                            .get("turn_id")
                            .and_then(Value::as_str)
                            .map(str::to_string)
                    })
                })
                .as_deref(),
            "turn_id",
        )?;
        let project_id = optional_string(&params, &["project_id", "projectId"]);
        let content_id = optional_string(&params, &["content_id", "contentId"]);
        let entry_source = optional_string(&params, &["entry_source", "entrySource"]);
        let requested_target = optional_string(&params, &["requested_target", "requestedTarget"]);
        let modality_contract_key =
            optional_string(&params, &["modality_contract_key", "modalityContractKey"]);
        let modality = optional_string(&params, &["modality"]);
        let routing_slot = optional_string(&params, &["routing_slot", "routingSlot"]);
        let runtime_contract = params
            .get("runtime_contract")
            .cloned()
            .or_else(|| params.get("runtimeContract").cloned());
        let slot_id = optional_string(&params, &["slot_id", "slotId"]);
        let anchor_hint = optional_string(&params, &["anchor_hint", "anchorHint"]);
        let anchor_section_title =
            optional_string(&params, &["anchor_section_title", "anchorSectionTitle"]);
        let anchor_text = optional_string(&params, &["anchor_text", "anchorText"]);
        let target_output_id = optional_string(&params, &["target_output_id", "targetOutputId"]);
        let target_output_ref_id =
            optional_string(&params, &["target_output_ref_id", "targetOutputRefId"]);
        let title = optional_string(&params, &["title"]);
        let title_generation_result = params
            .get("title_generation_result")
            .cloned()
            .or_else(|| params.get("titleGenerationResult").cloned());
        let persona_context = params
            .get("persona_context")
            .cloned()
            .or_else(|| params.get("personaContext").cloned());
        let presentation = params.get("presentation").cloned();
        let taste_context = params
            .get("taste_context")
            .cloned()
            .or_else(|| params.get("tasteContext").cloned());
        let raw_text = optional_string(&params, &["raw_text", "rawText"]);
        let reference_images = string_vec(&params, &["reference_images", "referenceImages"]);
        let storyboard_slots: Vec<app_server_protocol::ImageStoryboardSlotInput> = params
            .get("storyboard_slots")
            .or_else(|| params.get("storyboardSlots"))
            .cloned()
            .map(|value| {
                serde_json::from_value(value).map_err(|error| {
                    ToolError::invalid_params(format!("storyboard_slots invalid: {error}"))
                })
            })
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
        let mut properties = Map::new();
        for key in [
            "project_root_path",
            "prompt",
            "title",
            "mode",
            "raw_text",
            "layout_hint",
            "size",
            "aspect_ratio",
            "usage",
            "style",
            "provider_id",
            "model",
            "executor_mode",
            "outer_model",
            "session_id",
            "thread_id",
            "turn_id",
            "project_id",
            "content_id",
            "entry_source",
            "modality_contract_key",
            "modality",
            "routing_slot",
            "requested_target",
            "slot_id",
            "anchor_hint",
            "anchor_section_title",
            "anchor_text",
            "target_output_id",
            "target_output_ref_id",
        ] {
            properties.insert(key.to_string(), json!({ "type": "string" }));
        }
        properties.insert("title_generation_result".to_string(), json!({}));
        properties.insert("persona_context".to_string(), json!({}));
        properties.insert("presentation".to_string(), json!({}));
        properties.insert("taste_context".to_string(), json!({}));
        properties.insert("runtime_contract".to_string(), json!({}));
        properties.insert(
            "count".to_string(),
            json!({ "type": "integer", "minimum": 1 }),
        );
        properties.insert(
            "reference_images".to_string(),
            json!({ "type": "array", "items": { "type": "string" } }),
        );
        properties.insert(
            "storyboard_slots".to_string(),
            json!({
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
            }),
        );
        json!({
            "type": "object",
            "properties": properties,
            "required": ["project_root_path", "prompt"]
        })
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        if context.is_cancelled() {
            return Err(ToolError::Cancelled);
        }
        let input = self.parse_params(params, context)?;
        let response = self
            .gateway
            .create_image_media_task_artifact(build_create_params(input))
            .await
            .map_err(ToolError::execution_failed)?;
        Ok(image_tool_result_from_response(response))
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

pub fn image_task_tool_result_projection(
    response: MediaTaskArtifactResponse,
) -> NativeToolResultProjection {
    let text = serde_json::to_string_pretty(&response).unwrap_or_else(|_| "{}".to_string());
    let mut metadata = HashMap::from([
        ("task_id".to_string(), json!(response.task_id)),
        ("task_type".to_string(), json!(response.task_type)),
        ("task_family".to_string(), json!(response.task_family)),
        ("status".to_string(), json!(response.status)),
        (
            "normalized_status".to_string(),
            json!(response.normalized_status),
        ),
        ("path".to_string(), json!(response.path)),
        ("artifact_path".to_string(), json!(response.artifact_path)),
        (
            "reused_existing".to_string(),
            json!(response.reused_existing),
        ),
        ("record".to_string(), json!(response.record)),
    ]);
    if let Some(idempotency_key) = response.idempotency_key {
        metadata.insert("idempotency_key".to_string(), json!(idempotency_key));
    }
    NativeToolResultProjection {
        output: Some(text),
        metadata,
    }
}

fn image_tool_result_from_response(response: MediaTaskArtifactResponse) -> ToolResult {
    let projection = image_task_tool_result_projection(response);
    ToolResult {
        success: true,
        output: projection.output,
        error: None,
        metadata: projection.metadata,
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use serde_json::json;
    use tempfile::TempDir;
    use tokio::sync::Mutex;

    #[derive(Default)]
    struct ImageToolTestGateway {
        last_params: Mutex<Option<MediaTaskArtifactImageCreateParams>>,
    }

    #[async_trait]
    impl ImageTaskGateway for ImageToolTestGateway {
        async fn create_image_media_task_artifact(
            &self,
            params: MediaTaskArtifactImageCreateParams,
        ) -> Result<MediaTaskArtifactResponse, String> {
            *self.last_params.lock().await = Some(params.clone());
            Ok(MediaTaskArtifactResponse {
                success: true,
                task_id: "task-image-1".to_string(),
                task_type: "image_generate".to_string(),
                task_family: "image".to_string(),
                status: "pending".to_string(),
                normalized_status: "pending".to_string(),
                artifact_path: ".lime/tasks/image_generate/task-image-1.json".to_string(),
                record: json!({
                    "task_type": "image_generate",
                    "payload": {
                        "provider_id": params.provider_id,
                        "model": params.model,
                        "executor_mode": params.executor_mode,
                        "entry_source": params.entry_source,
                        "modality_contract_key": params.modality_contract_key,
                        "routing_slot": params.routing_slot,
                        "usage": params.usage,
                        "slot_id": params.slot_id,
                        "anchor_section_title": params.anchor_section_title,
                        "anchor_text": params.anchor_text,
                        "model_task_request": {
                            "taskKind": "image_generate"
                        },
                        "runtime_contract": params.runtime_contract,
                    }
                }),
                ..MediaTaskArtifactResponse::default()
            })
        }
    }

    #[tokio::test]
    async fn image_tool_builds_standard_image_task_request() {
        let workspace = TempDir::new().expect("workspace");
        let gateway = Arc::new(ImageToolTestGateway::default());
        let tool = ImageGenerationTool::new(gateway.clone());
        let result = tool
            .execute(
                json!({
                    "project_root_path": workspace.path().to_string_lossy(),
                    "prompt": "生成一张青柠实验室封面",
                    "provider_id": "openai",
                    "model": "gpt-image-2",
                    "executor_mode": "images_api",
                    "session_id": "session-image-1",
                    "thread_id": "thread-image-1",
                    "turn_id": "turn-image-1",
                    "content_id": "content-image-1",
                    "entry_source": "at_image_command",
                    "modality_contract_key": "image_generation",
                    "modality": "image",
                    "routing_slot": "image_generation_model",
                    "runtime_contract": {
                        "contract_key": "image_generation",
                        "routing_slot": "image_generation_model"
                    },
                    "usage": "document-inline",
                    "slot_id": "document-image-slot-1",
                    "anchor_section_title": "产品愿景",
                    "anchor_text": "给这一段生成配图"
                }),
                &ToolContext::new(workspace.path().to_path_buf()),
            )
            .await
            .expect("image tool should call gateway");

        assert_eq!(
            result.metadata.get("task_type"),
            Some(&json!("image_generate"))
        );
        assert_eq!(result.metadata.get("task_family"), Some(&json!("image")));
        assert_eq!(
            result.metadata.get("normalized_status"),
            Some(&json!("pending"))
        );
        let artifact_path = result
            .metadata
            .get("artifact_path")
            .and_then(Value::as_str)
            .expect("artifact path");
        assert!(artifact_path.starts_with(".lime/tasks/image_generate/"));
        assert!(artifact_path.ends_with(".json"));

        let record = result.metadata.get("record").expect("record metadata");
        assert_eq!(record["task_type"].as_str(), Some("image_generate"));
        let payload = &record["payload"];
        assert_eq!(payload["provider_id"].as_str(), Some("openai"));
        assert_eq!(payload["model"].as_str(), Some("gpt-image-2"));
        assert_eq!(payload["executor_mode"].as_str(), Some("images_api"));
        assert_eq!(payload["entry_source"].as_str(), Some("at_image_command"));
        assert_eq!(
            payload["modality_contract_key"].as_str(),
            Some("image_generation")
        );
        assert_eq!(
            payload["routing_slot"].as_str(),
            Some("image_generation_model")
        );
        assert_eq!(payload["usage"].as_str(), Some("document-inline"));
        assert_eq!(payload["slot_id"].as_str(), Some("document-image-slot-1"));
        assert_eq!(payload["anchor_section_title"].as_str(), Some("产品愿景"));
        assert_eq!(payload["anchor_text"].as_str(), Some("给这一段生成配图"));
        assert_eq!(
            payload["model_task_request"]["taskKind"].as_str(),
            Some("image_generate")
        );
        assert_eq!(
            payload["runtime_contract"]["contract_key"].as_str(),
            Some("image_generation")
        );

        let params = gateway
            .last_params
            .lock()
            .await
            .clone()
            .expect("gateway params");
        assert_eq!(params.project_root_path, workspace.path().to_string_lossy());
        assert_eq!(params.session_id.as_deref(), Some("session-image-1"));
        assert_eq!(params.thread_id.as_deref(), Some("thread-image-1"));
        assert_eq!(params.turn_id.as_deref(), Some("turn-image-1"));
    }
}
