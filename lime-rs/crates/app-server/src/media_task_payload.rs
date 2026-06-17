use crate::media_runtime_contract::{
    runtime_contract_or_default, MediaRuntimeContractKind, IMAGE_GENERATION_CONTRACT_KEY,
    IMAGE_GENERATION_ROUTING_SLOT, VIDEO_GENERATION_CONTRACT_KEY, VIDEO_GENERATION_ROUTING_SLOT,
    VOICE_GENERATION_CONTRACT_KEY, VOICE_GENERATION_ROUTING_SLOT,
};
use crate::model_task_contract::{
    apply_media_route_assessment_payload, build_model_task_request, model_task_request_value,
    MediaRouteAssessment, ModelTaskRequestInput,
};
use app_server_protocol::{
    MediaTaskArtifactAudioCreateParams, MediaTaskArtifactImageCreateParams,
    MediaTaskArtifactVideoCreateParams, ModelRefSource, ModelTaskKind, ModelTaskRequest,
    ModelTaskSource,
};
use serde_json::{json, Value};

pub(crate) const AUDIO_TASK_DEFAULT_MIME_TYPE: &str = "audio/mpeg";

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_string_list(values: Vec<String>) -> Vec<String> {
    values
        .into_iter()
        .filter_map(|value| normalize_optional_string(Some(value)))
        .collect()
}

fn image_required_capabilities(params: &MediaTaskArtifactImageCreateParams) -> Vec<String> {
    if params.required_capabilities.is_empty() {
        vec!["image_generation".to_string()]
    } else {
        normalize_string_list(params.required_capabilities.clone())
    }
}

pub(crate) fn image_model_task_request(
    params: &MediaTaskArtifactImageCreateParams,
) -> ModelTaskRequest {
    let modality_contract_key = normalize_optional_string(params.modality_contract_key.clone())
        .unwrap_or_else(|| IMAGE_GENERATION_CONTRACT_KEY.to_string());
    let routing_slot = normalize_optional_string(params.routing_slot.clone())
        .unwrap_or_else(|| IMAGE_GENERATION_ROUTING_SLOT.to_string());
    build_model_task_request(ModelTaskRequestInput {
        task_kind: ModelTaskKind::ImageGenerate,
        source: ModelTaskSource::MediaTaskArtifact,
        provider_id: params.provider_id.clone(),
        model_id: params.model.clone(),
        model_ref_source: ModelRefSource::Task,
        modality_contract_key: Some(modality_contract_key),
        routing_slot: Some(routing_slot),
        task_families: vec!["image_generation".to_string()],
        input_modalities: vec!["text".to_string(), "image".to_string()],
        output_modalities: vec!["image".to_string()],
        runtime_features: Vec::new(),
        capabilities: image_required_capabilities(params),
        session_id: params.session_id.clone(),
        thread_id: params.thread_id.clone(),
        turn_id: params.turn_id.clone(),
        content_id: params.content_id.clone(),
        trace_id: None,
    })
}

pub(crate) fn create_image_payload(
    params: &MediaTaskArtifactImageCreateParams,
    route_assessment: Option<&MediaRouteAssessment>,
) -> Value {
    let modality_contract_key = normalize_optional_string(params.modality_contract_key.clone())
        .unwrap_or_else(|| IMAGE_GENERATION_CONTRACT_KEY.to_string());
    let modality =
        normalize_optional_string(params.modality.clone()).unwrap_or_else(|| "image".to_string());
    let routing_slot = normalize_optional_string(params.routing_slot.clone())
        .unwrap_or_else(|| IMAGE_GENERATION_ROUTING_SLOT.to_string());
    let required_capabilities = image_required_capabilities(params);
    let model_task_request = model_task_request_value(&image_model_task_request(params));

    let mut payload = json!({
        "prompt": params.prompt,
        "title_generation_result": params.title_generation_result,
        "persona_context": params.persona_context,
        "presentation": params.presentation,
        "taste_context": params.taste_context,
        "mode": params.mode,
        "raw_text": params.raw_text,
        "layout_hint": params.layout_hint,
        "size": params.size,
        "aspect_ratio": params.aspect_ratio,
        "count": params.count.unwrap_or(1),
        "usage": params.usage,
        "style": params.style,
        "provider_id": params.provider_id,
        "model": params.model,
        "executor_mode": params.executor_mode,
        "outer_model": params.outer_model,
        "session_id": params.session_id,
        "thread_id": params.thread_id,
        "turn_id": params.turn_id,
        "project_id": params.project_id,
        "content_id": params.content_id,
        "entry_source": normalize_optional_string(params.entry_source.clone()).unwrap_or_else(|| "at_image_command".to_string()),
        "modality_contract_key": modality_contract_key,
        "modality": modality,
        "required_capabilities": required_capabilities,
        "routing_slot": routing_slot,
        "model_task_request": model_task_request,
        "modelTaskRequest": model_task_request,
        "runtime_contract": runtime_contract_or_default(params.runtime_contract.as_ref(), MediaRuntimeContractKind::ImageGeneration),
        "requested_target": params.requested_target,
        "slot_id": params.slot_id,
        "anchor_hint": params.anchor_hint,
        "anchor_section_title": params.anchor_section_title,
        "anchor_text": params.anchor_text,
        "target_output_id": params.target_output_id,
        "target_output_ref_id": params.target_output_ref_id,
        "reference_images": params.reference_images,
        "storyboard_slots": params.storyboard_slots,
    });
    apply_media_route_assessment_payload(&mut payload, route_assessment);
    payload
}

fn video_required_capabilities(params: &MediaTaskArtifactVideoCreateParams) -> Vec<String> {
    if params.required_capabilities.is_empty() {
        vec!["video_generation".to_string()]
    } else {
        normalize_string_list(params.required_capabilities.clone())
    }
}

pub(crate) fn video_model_task_request(
    params: &MediaTaskArtifactVideoCreateParams,
) -> ModelTaskRequest {
    let modality_contract_key = normalize_optional_string(params.modality_contract_key.clone())
        .unwrap_or_else(|| VIDEO_GENERATION_CONTRACT_KEY.to_string());
    let routing_slot = normalize_optional_string(params.routing_slot.clone())
        .unwrap_or_else(|| VIDEO_GENERATION_ROUTING_SLOT.to_string());
    build_model_task_request(ModelTaskRequestInput {
        task_kind: ModelTaskKind::VideoGenerate,
        source: ModelTaskSource::MediaTaskArtifact,
        provider_id: params.provider_id.clone(),
        model_id: params.model.clone(),
        model_ref_source: ModelRefSource::Task,
        modality_contract_key: Some(modality_contract_key),
        routing_slot: Some(routing_slot),
        task_families: vec!["video_generation".to_string()],
        input_modalities: vec!["text".to_string(), "image".to_string()],
        output_modalities: vec!["video".to_string()],
        runtime_features: Vec::new(),
        capabilities: video_required_capabilities(params),
        session_id: params.session_id.clone(),
        thread_id: params.thread_id.clone(),
        turn_id: params.turn_id.clone(),
        content_id: params.content_id.clone(),
        trace_id: None,
    })
}

pub(crate) fn create_video_payload(
    params: &MediaTaskArtifactVideoCreateParams,
    route_assessment: Option<&MediaRouteAssessment>,
) -> Value {
    let modality_contract_key = normalize_optional_string(params.modality_contract_key.clone())
        .unwrap_or_else(|| VIDEO_GENERATION_CONTRACT_KEY.to_string());
    let modality =
        normalize_optional_string(params.modality.clone()).unwrap_or_else(|| "video".to_string());
    let routing_slot = normalize_optional_string(params.routing_slot.clone())
        .unwrap_or_else(|| VIDEO_GENERATION_ROUTING_SLOT.to_string());
    let required_capabilities = video_required_capabilities(params);
    let model_task_request = model_task_request_value(&video_model_task_request(params));

    let mut payload = json!({
        "prompt": params.prompt,
        "project_root_path": params.project_root_path,
        "raw_text": params.raw_text,
        "aspect_ratio": params.aspect_ratio,
        "resolution": params.resolution,
        "duration": params.duration,
        "image_url": params.image_url,
        "end_image_url": params.end_image_url,
        "seed": params.seed,
        "generate_audio": params.generate_audio,
        "camera_fixed": params.camera_fixed,
        "provider_id": params.provider_id,
        "model": params.model,
        "session_id": params.session_id,
        "thread_id": params.thread_id,
        "turn_id": params.turn_id,
        "project_id": params.project_id,
        "content_id": params.content_id,
        "entry_source": normalize_optional_string(params.entry_source.clone()).unwrap_or_else(|| "video_workspace".to_string()),
        "modality_contract_key": modality_contract_key,
        "modality": modality,
        "required_capabilities": required_capabilities,
        "routing_slot": routing_slot,
        "model_task_request": model_task_request,
        "modelTaskRequest": model_task_request,
        "runtime_contract": runtime_contract_or_default(params.runtime_contract.as_ref(), MediaRuntimeContractKind::VideoGeneration),
        "requested_target": normalize_optional_string(params.requested_target.clone()).unwrap_or_else(|| "video".to_string()),
    });
    apply_media_route_assessment_payload(&mut payload, route_assessment);
    payload
}

fn audio_required_capabilities(params: &MediaTaskArtifactAudioCreateParams) -> Vec<String> {
    if params.required_capabilities.is_empty() {
        vec!["voice_generation".to_string()]
    } else {
        normalize_string_list(params.required_capabilities.clone())
    }
}

pub(crate) fn audio_model_task_request(
    params: &MediaTaskArtifactAudioCreateParams,
) -> ModelTaskRequest {
    let modality_contract_key = normalize_optional_string(params.modality_contract_key.clone())
        .unwrap_or_else(|| VOICE_GENERATION_CONTRACT_KEY.to_string());
    let routing_slot = normalize_optional_string(params.routing_slot.clone())
        .unwrap_or_else(|| VOICE_GENERATION_ROUTING_SLOT.to_string());
    build_model_task_request(ModelTaskRequestInput {
        task_kind: ModelTaskKind::VoiceGenerate,
        source: ModelTaskSource::MediaTaskArtifact,
        provider_id: params.provider_id.clone(),
        model_id: params.model.clone(),
        model_ref_source: ModelRefSource::Task,
        modality_contract_key: Some(modality_contract_key),
        routing_slot: Some(routing_slot),
        task_families: vec!["text_to_speech".to_string()],
        input_modalities: vec!["text".to_string()],
        output_modalities: vec!["audio".to_string()],
        runtime_features: Vec::new(),
        capabilities: audio_required_capabilities(params),
        session_id: params.session_id.clone(),
        thread_id: params.thread_id.clone(),
        turn_id: params.turn_id.clone(),
        content_id: params.content_id.clone(),
        trace_id: None,
    })
}

pub(crate) fn create_audio_payload(params: &MediaTaskArtifactAudioCreateParams) -> Value {
    let modality_contract_key = normalize_optional_string(params.modality_contract_key.clone())
        .unwrap_or_else(|| VOICE_GENERATION_CONTRACT_KEY.to_string());
    let modality =
        normalize_optional_string(params.modality.clone()).unwrap_or_else(|| "audio".to_string());
    let routing_slot = normalize_optional_string(params.routing_slot.clone())
        .unwrap_or_else(|| VOICE_GENERATION_ROUTING_SLOT.to_string());
    let required_capabilities = audio_required_capabilities(params);
    let source_text = params.source_text.trim();
    let mime_type = normalize_optional_string(params.mime_type.clone())
        .unwrap_or_else(|| AUDIO_TASK_DEFAULT_MIME_TYPE.to_string());
    let model_task_request = model_task_request_value(&audio_model_task_request(params));

    json!({
        "prompt": source_text,
        "source_text": source_text,
        "raw_text": params.raw_text,
        "voice": params.voice,
        "voice_style": params.voice_style,
        "target_language": params.target_language,
        "mime_type": mime_type,
        "audio_path": params.audio_path,
        "duration_ms": params.duration_ms,
        "provider_id": params.provider_id,
        "model": params.model,
        "session_id": params.session_id,
        "thread_id": params.thread_id,
        "turn_id": params.turn_id,
        "project_id": params.project_id,
        "content_id": params.content_id,
        "entry_source": normalize_optional_string(params.entry_source.clone()).unwrap_or_else(|| "at_voice_command".to_string()),
        "modality_contract_key": modality_contract_key,
        "modality": modality,
        "required_capabilities": required_capabilities,
        "routing_slot": routing_slot,
        "model_task_request": model_task_request,
        "modelTaskRequest": model_task_request,
        "runtime_contract": runtime_contract_or_default(params.runtime_contract.as_ref(), MediaRuntimeContractKind::VoiceGeneration),
        "requested_target": normalize_optional_string(params.requested_target.clone()).unwrap_or_else(|| "voice".to_string()),
        "audio_output": {
            "kind": "audio_output",
            "status": "pending",
            "audio_path": params.audio_path,
            "mime_type": mime_type,
            "duration_ms": params.duration_ms,
            "source_text": source_text,
            "voice": params.voice,
            "voice_style": params.voice_style,
            "target_language": params.target_language,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model_route_assembly::{resolved_route_from_task, ModelRouteSelection};
    use app_server_protocol::ModelRefSource;

    #[test]
    fn image_payload_contains_typed_model_task_request() {
        let payload = create_image_payload(
            &MediaTaskArtifactImageCreateParams {
                project_root_path: "/tmp/project".to_string(),
                prompt: "生成封面".to_string(),
                provider_id: Some("openai".to_string()),
                model: Some("gpt-image-2".to_string()),
                session_id: Some("session-1".to_string()),
                thread_id: Some("thread-1".to_string()),
                turn_id: Some("turn-1".to_string()),
                content_id: Some("content-1".to_string()),
                ..MediaTaskArtifactImageCreateParams::default()
            },
            None,
        );

        assert_eq!(
            payload["model_task_request"]["taskKind"].as_str(),
            Some("image_generate")
        );
        assert_eq!(
            payload["model_task_request"]["modelRef"]["providerId"].as_str(),
            Some("openai")
        );
        assert_eq!(
            payload["model_task_request"]["modelRef"]["modelId"].as_str(),
            Some("gpt-image-2")
        );
        assert_eq!(
            payload["model_task_request"]["routingSlot"].as_str(),
            Some(IMAGE_GENERATION_ROUTING_SLOT)
        );
        assert_eq!(
            payload["model_task_request"]["requirements"]["outputModalities"][0].as_str(),
            Some("image")
        );
    }

    #[test]
    fn image_payload_marks_route_failure_when_assessment_blocks() {
        let params = MediaTaskArtifactImageCreateParams {
            project_root_path: "/tmp/project".to_string(),
            prompt: "生成封面".to_string(),
            provider_id: Some("openai".to_string()),
            model: Some("text-only".to_string()),
            ..MediaTaskArtifactImageCreateParams::default()
        };
        let snapshot =
            crate::model_task_contract::capability_snapshot_from_model_capabilities(&json!({
                "capabilities": {
                    "vision": false,
                    "streaming": true
                },
                "taskFamilies": ["chat"],
                "inputModalities": ["text"],
                "outputModalities": ["text"],
                "runtimeFeatures": ["streaming"]
            }));
        let assessment =
            MediaRouteAssessment::from_snapshot(&image_model_task_request(&params), snapshot);
        let payload = create_image_payload(&params, Some(&assessment));

        assert_eq!(payload["failure_code"].as_str(), Some("capability_gap"));
        assert_eq!(payload["failureCode"].as_str(), Some("capability_gap"));
        assert_eq!(
            payload["route_failure"]["category"].as_str(),
            Some("capability_gap")
        );
        assert_eq!(
            payload["route_failure"]["capabilityGap"].as_str(),
            Some("task_family:image_generation")
        );
        assert_eq!(
            payload["model_route_assessment"]["status"].as_str(),
            Some("blocked")
        );
    }

    #[test]
    fn image_payload_contains_resolved_route_when_assessment_resolves_route() {
        let params = MediaTaskArtifactImageCreateParams {
            project_root_path: "/tmp/project".to_string(),
            prompt: "生成封面".to_string(),
            provider_id: Some("openai".to_string()),
            model: Some("gpt-image-2".to_string()),
            ..MediaTaskArtifactImageCreateParams::default()
        };
        let task_request = image_model_task_request(&params);
        let route = resolved_route_from_task(
            &task_request,
            ModelRouteSelection {
                provider_id: "openai",
                model_id: "gpt-image-2",
                model_ref_source: ModelRefSource::Task,
                reasoning_effort: None,
            },
            &json!({
                "providerReadiness": {
                    "ready": true,
                    "status": "ready"
                },
                "routingMode": "task_route",
                "decisionSource": "media_task_artifact",
                "decisionReason": "explicit_task_model",
                "serviceModelSlot": IMAGE_GENERATION_ROUTING_SLOT,
                "modelRegistry": {
                    "source": "api",
                    "reasonCode": "matched_media_task_model",
                    "modelCapabilities": {
                        "capabilities": {
                            "vision": true,
                            "streaming": false
                        },
                        "taskFamilies": ["image_generation"],
                        "inputModalities": ["text", "image"],
                        "outputModalities": ["image"],
                        "runtimeFeatures": ["images_api"]
                    }
                }
            }),
            None,
            None,
        );
        let assessment =
            MediaRouteAssessment::from_snapshot(&task_request, route.capability_snapshot.clone())
                .with_resolved_route(route);

        let payload = create_image_payload(&params, Some(&assessment));

        assert_eq!(
            payload["resolved_route"]["modelRef"]["source"].as_str(),
            Some("task")
        );
        assert_eq!(
            payload["resolvedRoute"]["modelRef"]["routingSlot"].as_str(),
            Some(IMAGE_GENERATION_ROUTING_SLOT)
        );
        assert_eq!(
            payload["model_route_assessment"]["resolvedRoute"]["decision"]["routingMode"].as_str(),
            Some("task_route")
        );
        assert_eq!(
            payload["resolved_route"]["protocol"].as_str(),
            Some("openai_images")
        );
        assert_eq!(
            payload["model_route_execution"]["executor"]["kind"].as_str(),
            Some("local_lime_service")
        );
        assert_eq!(
            payload["model_route_execution"]["executor"]["bindingKey"].as_str(),
            Some("local_lime_service:/v1/images/generations")
        );
        assert_eq!(
            payload["model_route_execution"]["credentialResolver"]["owner"].as_str(),
            Some("local_lime_service")
        );
        assert_eq!(
            payload["model_route_execution"]["credentialResolver"]["secretMaterialStatus"].as_str(),
            Some("not_embedded")
        );
        assert_eq!(
            payload["model_route_assessment"]["routeExecution"]["route"]["providerId"].as_str(),
            Some("openai")
        );
        assert!(payload["route_failure"].is_null());
    }

    #[test]
    fn audio_payload_keeps_task_request_without_executable_route() {
        let payload = create_audio_payload(&MediaTaskArtifactAudioCreateParams {
            project_root_path: "/tmp/project".to_string(),
            source_text: "朗读这段文字".to_string(),
            provider_id: Some("voice-provider".to_string()),
            model: Some("voice-model".to_string()),
            session_id: Some("session-1".to_string()),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
            content_id: Some("content-1".to_string()),
            ..MediaTaskArtifactAudioCreateParams::default()
        });

        assert_eq!(
            payload["model_task_request"]["taskKind"].as_str(),
            Some("voice_generate")
        );
        assert_eq!(
            payload["model_task_request"]["modelRef"]["providerId"].as_str(),
            Some("voice-provider")
        );
        assert_eq!(
            payload["model_task_request"]["routingSlot"].as_str(),
            Some(VOICE_GENERATION_ROUTING_SLOT)
        );
        assert_eq!(
            payload["model_task_request"]["requirements"]["outputModalities"][0].as_str(),
            Some("audio")
        );
        assert!(payload.get("resolved_route").is_none());
        assert!(payload.get("resolvedRoute").is_none());
        assert!(payload.get("model_route_execution").is_none());
        assert!(payload.get("modelRouteExecution").is_none());
    }
}
