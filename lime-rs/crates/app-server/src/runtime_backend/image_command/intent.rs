use super::super::request_context::{
    host_metadata_value, request_workspace_scope, runtime_request_from_request, RuntimeSessionScope,
};
use crate::{ExecutionRequest, RuntimeCoreError};
use app_server_protocol::MediaTaskArtifactImageCreateParams;
use lime_agent::AgentTokenUsage;
use serde_json::Value;
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq)]
pub(super) struct ImageCommandIntent {
    pub(super) scope: RuntimeSessionScope,
    pub(super) project_root_path: String,
    pub(super) prompt: String,
    pub(super) title: Option<String>,
    pub(super) title_generation_result: Option<Value>,
    pub(super) persona_context: Option<Value>,
    pub(super) presentation: Option<Value>,
    pub(super) taste_context: Option<Value>,
    pub(super) mode: Option<String>,
    pub(super) raw_text: Option<String>,
    pub(super) layout_hint: Option<String>,
    pub(super) size: Option<String>,
    pub(super) aspect_ratio: Option<String>,
    pub(super) count: Option<u32>,
    pub(super) usage: Option<String>,
    pub(super) style: Option<String>,
    pub(super) provider_id: Option<String>,
    pub(super) model: Option<String>,
    pub(super) executor_mode: Option<String>,
    pub(super) outer_model: Option<String>,
    pub(super) project_id: Option<String>,
    pub(super) content_id: Option<String>,
    pub(super) entry_source: Option<String>,
    pub(super) modality_contract_key: Option<String>,
    pub(super) modality: Option<String>,
    pub(super) required_capabilities: Vec<String>,
    pub(super) routing_slot: Option<String>,
    pub(super) runtime_contract: Option<Value>,
    pub(super) requested_target: Option<String>,
    pub(super) slot_id: Option<String>,
    pub(super) anchor_hint: Option<String>,
    pub(super) anchor_section_title: Option<String>,
    pub(super) anchor_text: Option<String>,
    pub(super) target_output_id: Option<String>,
    pub(super) target_output_ref_id: Option<String>,
    pub(super) reference_images: Vec<String>,
    pub(super) storyboard_slots: Vec<app_server_protocol::ImageStoryboardSlotInput>,
    pub(super) presentation_usage: Option<AgentTokenUsage>,
}

impl ImageCommandIntent {
    pub(super) fn missing_parameters(&self) -> Option<&'static str> {
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

    pub(super) fn into_create_params(self) -> MediaTaskArtifactImageCreateParams {
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

pub(super) fn parse_image_command_intent(
    request: &ExecutionRequest,
    scope: &RuntimeSessionScope,
) -> Result<Option<ImageCommandIntent>, RuntimeCoreError> {
    let Some((launch, image_task, source_kind)) = image_command_metadata(request) else {
        return Ok(None);
    };
    let launch = &launch;
    let image_task = &image_task;
    let host_request = runtime_request_from_request(request);
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
        .or_else(|| non_empty_string(&request.input.concat_text()));
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
        runtime_request_from_request(request).and_then(|host| host_metadata_value(&host))
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
    request.runtime_metadata().into_iter().collect()
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

pub(super) fn find_value<'a>(value: &'a Value, pointers: &[&str]) -> Option<&'a Value> {
    pointers.iter().find_map(|pointer| value.pointer(pointer))
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
