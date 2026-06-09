use app_server_protocol::MediaTaskArtifactAudioCompleteParams;
use app_server_protocol::MediaTaskArtifactAudioCreateParams;
use app_server_protocol::MediaTaskArtifactImageCreateParams;
use app_server_protocol::MediaTaskArtifactListFilters;
use app_server_protocol::MediaTaskArtifactListParams;
use app_server_protocol::MediaTaskArtifactListResponse;
use app_server_protocol::MediaTaskArtifactLookupParams;
use app_server_protocol::MediaTaskArtifactResponse;
use app_server_protocol::MediaTaskArtifactVideoCreateParams;
use lime_media_runtime::list_task_outputs;
use lime_media_runtime::load_task_output;
use lime_media_runtime::patch_task_artifact;
use lime_media_runtime::update_task_status;
use lime_media_runtime::write_task_artifact;
use lime_media_runtime::MediaTaskOutput;
use lime_media_runtime::MediaTaskType;
use lime_media_runtime::TaskArtifactPatch;
use lime_media_runtime::TaskRelationships;
use lime_media_runtime::TaskWriteOptions;
use lime_media_runtime::DEFAULT_ARTIFACT_ROOT;
use serde_json::json;
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::Path;

const AUDIO_TASK_DEFAULT_MIME_TYPE: &str = "audio/mpeg";
const AUDIO_TASK_COMPLETION_WORKER_ID: &str = "app-server-audio-output-writer";
const IMAGE_GENERATION_CONTRACT_KEY: &str = "image_generation";
const VIDEO_GENERATION_CONTRACT_KEY: &str = "video_generation";
const VOICE_GENERATION_CONTRACT_KEY: &str = "voice_generation";
const IMAGE_GENERATION_ROUTING_SLOT: &str = "image_generation_model";
const VIDEO_GENERATION_ROUTING_SLOT: &str = "video_generation_model";
const VOICE_GENERATION_ROUTING_SLOT: &str = "voice_generation_model";

fn data_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn normalize_required_string(value: &str, field_name: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(format!("{field_name} 不能为空"))
    } else {
        Ok(trimmed.to_string())
    }
}

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

fn maybe_json_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .and_then(|value| normalize_optional_string(Some(value.to_string())))
}

fn maybe_json_u64(value: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_u64)
}

fn build_image_idempotency_key(params: &MediaTaskArtifactImageCreateParams) -> String {
    let seed = json!({
        "kind": "image",
        "projectRootPath": params.project_root_path,
        "prompt": params.prompt,
        "mode": params.mode,
        "size": params.size,
        "aspectRatio": params.aspect_ratio,
        "count": params.count,
        "style": params.style,
        "providerId": params.provider_id,
        "model": params.model,
        "threadId": params.thread_id,
        "turnId": params.turn_id,
        "contentId": params.content_id,
        "targetOutputId": params.target_output_id,
        "targetOutputRefId": params.target_output_ref_id,
        "slotId": params.slot_id,
        "referenceImages": params.reference_images,
        "storyboardSlots": params.storyboard_slots,
    });
    format!("app-server:media:image:{:x}", sha256_json(&seed))
}

fn build_audio_idempotency_key(params: &MediaTaskArtifactAudioCreateParams) -> String {
    let seed = json!({
        "kind": "audio",
        "projectRootPath": params.project_root_path,
        "sourceText": params.source_text,
        "voice": params.voice,
        "voiceStyle": params.voice_style,
        "targetLanguage": params.target_language,
        "providerId": params.provider_id,
        "model": params.model,
        "threadId": params.thread_id,
        "turnId": params.turn_id,
        "contentId": params.content_id,
        "outputPath": params.output_path,
    });
    format!("app-server:media:audio:{:x}", sha256_json(&seed))
}

fn build_video_idempotency_key(params: &MediaTaskArtifactVideoCreateParams) -> String {
    let seed = json!({
        "kind": "video",
        "projectRootPath": params.project_root_path,
        "prompt": params.prompt,
        "providerId": params.provider_id,
        "model": params.model,
        "threadId": params.thread_id,
        "turnId": params.turn_id,
        "contentId": params.content_id,
        "aspectRatio": params.aspect_ratio,
        "resolution": params.resolution,
        "duration": params.duration,
        "imageUrl": params.image_url,
        "endImageUrl": params.end_image_url,
        "seed": params.seed,
        "generateAudio": params.generate_audio,
        "cameraFixed": params.camera_fixed,
        "outputPath": params.output_path,
    });
    format!("app-server:media:video:{:x}", sha256_json(&seed))
}

fn sha256_json(value: &Value) -> sha2::digest::Output<sha2::Sha256> {
    use sha2::Digest;
    sha2::Sha256::digest(serde_json::to_string(value).unwrap_or_default().as_bytes())
}

fn image_runtime_contract(params: &MediaTaskArtifactImageCreateParams) -> Value {
    params.runtime_contract.clone().unwrap_or_else(|| {
        json!({
            "contract_key": IMAGE_GENERATION_CONTRACT_KEY,
            "modality": "image",
            "routing_slot": IMAGE_GENERATION_ROUTING_SLOT,
            "required_capabilities": ["image_generation"],
            "execution_profile": {
                "profile_key": "image_generation_profile"
            },
            "executor_adapter": {
                "adapter_key": "app-server:media_task_artifact:image"
            },
            "executor_binding": {
                "executor_kind": "app_server",
                "binding_key": "mediaTaskArtifact/image/create"
            },
            "limecore_policy_refs": [
                "model_catalog",
                "provider_offer",
                "tenant_feature_flags"
            ]
        })
    })
}

fn audio_runtime_contract(params: &MediaTaskArtifactAudioCreateParams) -> Value {
    params.runtime_contract.clone().unwrap_or_else(|| {
        json!({
            "contract_key": VOICE_GENERATION_CONTRACT_KEY,
            "modality": "audio",
            "routing_slot": VOICE_GENERATION_ROUTING_SLOT,
            "required_capabilities": ["voice_generation"],
            "execution_profile": {
                "profile_key": "voice_generation_profile"
            },
            "executor_adapter": {
                "adapter_key": "app-server:media_task_artifact:audio"
            },
            "executor_binding": {
                "executor_kind": "app_server",
                "binding_key": "mediaTaskArtifact/audio/create"
            },
            "limecore_policy_refs": [
                "model_catalog",
                "provider_offer",
                "tenant_feature_flags"
            ]
        })
    })
}

fn video_runtime_contract(params: &MediaTaskArtifactVideoCreateParams) -> Value {
    params.runtime_contract.clone().unwrap_or_else(|| {
        json!({
            "contract_key": VIDEO_GENERATION_CONTRACT_KEY,
            "modality": "video",
            "routing_slot": VIDEO_GENERATION_ROUTING_SLOT,
            "required_capabilities": ["video_generation"],
            "execution_profile": {
                "profile_key": "video_generation_profile"
            },
            "executor_adapter": {
                "adapter_key": "app-server:media_task_artifact:video"
            },
            "executor_binding": {
                "executor_kind": "app_server",
                "binding_key": "mediaTaskArtifact/video/create"
            },
            "limecore_policy_refs": [
                "model_catalog",
                "provider_offer",
                "tenant_feature_flags"
            ]
        })
    })
}

fn create_image_payload(params: &MediaTaskArtifactImageCreateParams) -> Value {
    let modality_contract_key = normalize_optional_string(params.modality_contract_key.clone())
        .unwrap_or_else(|| IMAGE_GENERATION_CONTRACT_KEY.to_string());
    let modality =
        normalize_optional_string(params.modality.clone()).unwrap_or_else(|| "image".to_string());
    let routing_slot = normalize_optional_string(params.routing_slot.clone())
        .unwrap_or_else(|| IMAGE_GENERATION_ROUTING_SLOT.to_string());
    let required_capabilities = if params.required_capabilities.is_empty() {
        vec!["image_generation".to_string()]
    } else {
        normalize_string_list(params.required_capabilities.clone())
    };

    json!({
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
        "runtime_contract": image_runtime_contract(params),
        "requested_target": params.requested_target,
        "slot_id": params.slot_id,
        "anchor_hint": params.anchor_hint,
        "anchor_section_title": params.anchor_section_title,
        "anchor_text": params.anchor_text,
        "target_output_id": params.target_output_id,
        "target_output_ref_id": params.target_output_ref_id,
        "reference_images": params.reference_images,
        "storyboard_slots": params.storyboard_slots,
    })
}

fn create_video_payload(params: &MediaTaskArtifactVideoCreateParams) -> Value {
    let modality_contract_key = normalize_optional_string(params.modality_contract_key.clone())
        .unwrap_or_else(|| VIDEO_GENERATION_CONTRACT_KEY.to_string());
    let modality =
        normalize_optional_string(params.modality.clone()).unwrap_or_else(|| "video".to_string());
    let routing_slot = normalize_optional_string(params.routing_slot.clone())
        .unwrap_or_else(|| VIDEO_GENERATION_ROUTING_SLOT.to_string());
    let required_capabilities = if params.required_capabilities.is_empty() {
        vec!["video_generation".to_string()]
    } else {
        normalize_string_list(params.required_capabilities.clone())
    };

    json!({
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
        "runtime_contract": video_runtime_contract(params),
        "requested_target": normalize_optional_string(params.requested_target.clone()).unwrap_or_else(|| "video".to_string()),
    })
}

fn create_audio_payload(params: &MediaTaskArtifactAudioCreateParams) -> Value {
    let modality_contract_key = normalize_optional_string(params.modality_contract_key.clone())
        .unwrap_or_else(|| VOICE_GENERATION_CONTRACT_KEY.to_string());
    let modality =
        normalize_optional_string(params.modality.clone()).unwrap_or_else(|| "audio".to_string());
    let routing_slot = normalize_optional_string(params.routing_slot.clone())
        .unwrap_or_else(|| VOICE_GENERATION_ROUTING_SLOT.to_string());
    let required_capabilities = if params.required_capabilities.is_empty() {
        vec!["voice_generation".to_string()]
    } else {
        normalize_string_list(params.required_capabilities.clone())
    };
    let source_text = params.source_text.trim();
    let mime_type = normalize_optional_string(params.mime_type.clone())
        .unwrap_or_else(|| AUDIO_TASK_DEFAULT_MIME_TYPE.to_string());

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
        "runtime_contract": audio_runtime_contract(params),
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

fn response_from_output(output: MediaTaskOutput) -> Result<MediaTaskArtifactResponse, String> {
    let value = serde_json::to_value(output).map_err(data_error)?;
    serde_json::from_value(value).map_err(data_error)
}

fn response_vec_from_outputs(
    outputs: Vec<MediaTaskOutput>,
) -> Result<Vec<MediaTaskArtifactResponse>, String> {
    outputs.into_iter().map(response_from_output).collect()
}

fn build_audio_output_summary(
    payload: &Value,
    audio_path: &str,
    mime_type: &str,
    duration_ms: Option<u64>,
    provider_id: Option<&str>,
    model: Option<&str>,
) -> Value {
    json!({
        "kind": "audio_output",
        "status": "completed",
        "audio_path": audio_path,
        "mime_type": mime_type,
        "duration_ms": duration_ms,
        "source_text": maybe_json_string(payload, &["source_text", "sourceText", "prompt"]),
        "voice": maybe_json_string(payload, &["voice"]),
        "voice_style": maybe_json_string(payload, &["voice_style", "voiceStyle"]),
        "target_language": maybe_json_string(payload, &["target_language", "targetLanguage"]),
        "provider_id": provider_id,
        "model": model,
        "modality_contract_key": VOICE_GENERATION_CONTRACT_KEY,
        "modality": "audio",
        "routing_slot": VOICE_GENERATION_ROUTING_SLOT,
    })
}

fn build_audio_generation_result_value(audio_output: &Value) -> Value {
    json!({
        "kind": "audio_generation_result",
        "status": "completed",
        "audio_output": audio_output,
        "outputs": [audio_output],
        "audio_path": audio_output.get("audio_path").cloned().unwrap_or(Value::Null),
        "mime_type": audio_output.get("mime_type").cloned().unwrap_or(Value::Null),
        "duration_ms": audio_output.get("duration_ms").cloned().unwrap_or(Value::Null),
    })
}

fn task_payload(output: &MediaTaskOutput) -> &Value {
    &output.record.payload
}

fn media_task_contract_key(output: &MediaTaskOutput) -> Option<String> {
    maybe_json_string(
        task_payload(output),
        &["modality_contract_key", "modalityContractKey"],
    )
    .or_else(|| {
        task_payload(output)
            .get("runtime_contract")
            .or_else(|| task_payload(output).get("runtimeContract"))
            .and_then(|value| {
                value
                    .get("contract_key")
                    .or_else(|| value.get("contractKey"))
                    .and_then(Value::as_str)
            })
            .and_then(|value| normalize_optional_string(Some(value.to_string())))
    })
}

fn media_task_routing_outcome(output: &MediaTaskOutput) -> String {
    if output.normalized_status == "failed" {
        "failed".to_string()
    } else if maybe_json_string(task_payload(output), &["failure_code", "failureCode"]).is_some() {
        "blocked".to_string()
    } else {
        "accepted".to_string()
    }
}

fn media_task_matches_modality_filters(
    output: &MediaTaskOutput,
    contract_key: Option<&str>,
    routing_outcome: Option<&str>,
) -> bool {
    if let Some(contract_key) = contract_key {
        if media_task_contract_key(output).as_deref() != Some(contract_key) {
            return false;
        }
    }
    if let Some(routing_outcome) = routing_outcome {
        if media_task_routing_outcome(output) != routing_outcome {
            return false;
        }
    }
    true
}

fn add_unique(values: &mut Vec<String>, value: Option<String>) {
    if let Some(value) = value {
        if !values.iter().any(|existing| existing == &value) {
            values.push(value);
        }
    }
}

fn count_by(values: impl IntoIterator<Item = String>) -> Vec<Value> {
    let mut counts = BTreeMap::<String, usize>::new();
    for value in values {
        *counts.entry(value).or_default() += 1;
    }
    counts
        .into_iter()
        .map(|(status, count)| json!({ "status": status, "count": count }))
        .collect()
}

fn count_routing_outcomes(outputs: &[MediaTaskOutput]) -> Vec<Value> {
    let mut counts = BTreeMap::<String, usize>::new();
    for output in outputs {
        *counts
            .entry(media_task_routing_outcome(output))
            .or_default() += 1;
    }
    counts
        .into_iter()
        .map(|(outcome, count)| json!({ "outcome": outcome, "count": count }))
        .collect()
}

fn build_modality_runtime_contract_index(outputs: &[MediaTaskOutput]) -> Value {
    let mut contract_keys = Vec::new();
    let mut entry_keys = Vec::new();
    let mut thread_ids = Vec::new();
    let mut turn_ids = Vec::new();
    let mut content_ids = Vec::new();
    let mut modalities = Vec::new();
    let mut skill_ids = Vec::new();
    let mut model_ids = Vec::new();
    let mut execution_profile_keys = Vec::new();
    let mut executor_adapter_keys = Vec::new();
    let mut executor_kinds = Vec::new();
    let mut executor_binding_keys = Vec::new();
    let mut limecore_policy_refs = Vec::new();
    let mut snapshots = Vec::new();
    let mut audio_statuses = Vec::new();

    for output in outputs {
        let payload = task_payload(output);
        let runtime_contract = payload
            .get("runtime_contract")
            .or_else(|| payload.get("runtimeContract"));
        let contract_key = media_task_contract_key(output);
        let modality = maybe_json_string(payload, &["modality"]);
        let entry_key = maybe_json_string(
            payload,
            &["entry_key", "entryKey", "entry_source", "entrySource"],
        );
        let thread_id = maybe_json_string(payload, &["thread_id", "threadId"]);
        let turn_id = maybe_json_string(payload, &["turn_id", "turnId"]);
        let content_id = maybe_json_string(payload, &["content_id", "contentId"]);
        let model = maybe_json_string(payload, &["model"]);
        let routing_slot = maybe_json_string(payload, &["routing_slot", "routingSlot"]);
        let execution_profile_key = runtime_contract
            .and_then(|value| {
                value
                    .get("execution_profile")
                    .or_else(|| value.get("executionProfile"))
            })
            .and_then(|value| value.get("profile_key").or_else(|| value.get("profileKey")))
            .and_then(Value::as_str)
            .and_then(|value| normalize_optional_string(Some(value.to_string())));
        let executor_adapter_key = runtime_contract
            .and_then(|value| {
                value
                    .get("executor_adapter")
                    .or_else(|| value.get("executorAdapter"))
            })
            .and_then(|value| value.get("adapter_key").or_else(|| value.get("adapterKey")))
            .and_then(Value::as_str)
            .and_then(|value| normalize_optional_string(Some(value.to_string())));
        let executor_kind = runtime_contract
            .and_then(|value| {
                value
                    .get("executor_binding")
                    .or_else(|| value.get("executorBinding"))
            })
            .and_then(|value| {
                value
                    .get("executor_kind")
                    .or_else(|| value.get("executorKind"))
            })
            .and_then(Value::as_str)
            .and_then(|value| normalize_optional_string(Some(value.to_string())));
        let executor_binding_key = runtime_contract
            .and_then(|value| {
                value
                    .get("executor_binding")
                    .or_else(|| value.get("executorBinding"))
            })
            .and_then(|value| value.get("binding_key").or_else(|| value.get("bindingKey")))
            .and_then(Value::as_str)
            .and_then(|value| normalize_optional_string(Some(value.to_string())));
        let policy_refs = runtime_contract
            .and_then(|value| {
                value
                    .get("limecore_policy_refs")
                    .or_else(|| value.get("limecorePolicyRefs"))
            })
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .filter_map(|value| normalize_optional_string(Some(value.to_string())))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        let audio_output = payload
            .get("audio_output")
            .or_else(|| payload.get("audioOutput"));
        let audio_output_status =
            audio_output.and_then(|value| maybe_json_string(value, &["status"]));

        add_unique(&mut contract_keys, contract_key.clone());
        add_unique(&mut entry_keys, entry_key.clone());
        add_unique(&mut thread_ids, thread_id.clone());
        add_unique(&mut turn_ids, turn_id.clone());
        add_unique(&mut content_ids, content_id.clone());
        add_unique(&mut modalities, modality.clone());
        add_unique(&mut skill_ids, executor_binding_key.clone());
        add_unique(&mut model_ids, model.clone());
        add_unique(&mut execution_profile_keys, execution_profile_key.clone());
        add_unique(&mut executor_adapter_keys, executor_adapter_key.clone());
        add_unique(&mut executor_kinds, executor_kind.clone());
        add_unique(&mut executor_binding_keys, executor_binding_key.clone());
        for policy_ref in policy_refs.iter().cloned() {
            add_unique(&mut limecore_policy_refs, Some(policy_ref));
        }
        if let Some(status) = audio_output_status.clone() {
            audio_statuses.push(status);
        }

        snapshots.push(json!({
            "task_id": output.task_id,
            "task_type": output.task_type,
            "normalized_status": output.normalized_status,
            "contract_key": contract_key,
            "entry_key": entry_key,
            "thread_id": thread_id,
            "turn_id": turn_id,
            "content_id": content_id,
            "modality": modality,
            "skill_id": executor_binding_key,
            "model_id": model,
            "routing_slot": routing_slot,
            "provider_id": maybe_json_string(payload, &["provider_id", "providerId"]),
            "model": maybe_json_string(payload, &["model"]),
            "execution_profile_key": execution_profile_key,
            "executor_adapter_key": executor_adapter_key,
            "executor_kind": executor_kind,
            "executor_binding_key": executor_binding_key,
            "limecore_policy_refs": policy_refs,
            "routing_event": "model_routing_decision",
            "routing_outcome": media_task_routing_outcome(output),
            "failure_code": maybe_json_string(payload, &["failure_code", "failureCode"]),
            "audio_output_status": audio_output_status,
            "audio_output_path": audio_output.and_then(|value| maybe_json_string(value, &["audio_path", "audioPath"])),
            "audio_output_mime_type": audio_output.and_then(|value| maybe_json_string(value, &["mime_type", "mimeType"])),
            "audio_output_duration_ms": audio_output.and_then(|value| maybe_json_u64(value, &["duration_ms", "durationMs"])),
        }));
    }

    let mut index = serde_json::Map::new();
    index.insert("snapshot_count".to_string(), json!(outputs.len()));
    index.insert("contract_keys".to_string(), json!(contract_keys));
    index.insert("entry_keys".to_string(), json!(entry_keys));
    index.insert("thread_ids".to_string(), json!(thread_ids));
    index.insert("turn_ids".to_string(), json!(turn_ids));
    index.insert("content_ids".to_string(), json!(content_ids));
    index.insert("modalities".to_string(), json!(modalities));
    index.insert("skill_ids".to_string(), json!(skill_ids));
    index.insert("model_ids".to_string(), json!(model_ids));
    index.insert("cost_states".to_string(), json!([]));
    index.insert("limit_states".to_string(), json!([]));
    index.insert("estimated_cost_classes".to_string(), json!([]));
    index.insert("limit_event_kinds".to_string(), json!([]));
    index.insert("quota_low_count".to_string(), json!(0));
    index.insert(
        "execution_profile_keys".to_string(),
        json!(execution_profile_keys),
    );
    index.insert(
        "executor_adapter_keys".to_string(),
        json!(executor_adapter_keys),
    );
    index.insert("executor_kinds".to_string(), json!(executor_kinds));
    index.insert(
        "executor_binding_keys".to_string(),
        json!(executor_binding_keys),
    );
    index.insert(
        "limecore_policy_refs".to_string(),
        json!(limecore_policy_refs),
    );
    index.insert("limecore_policy_snapshot_count".to_string(), json!(0));
    index.insert("limecore_policy_snapshot_statuses".to_string(), json!([]));
    index.insert("limecore_policy_decisions".to_string(), json!([]));
    index.insert("limecore_policy_decision_sources".to_string(), json!([]));
    index.insert("limecore_policy_evaluation_statuses".to_string(), json!([]));
    index.insert(
        "limecore_policy_evaluation_decisions".to_string(),
        json!([]),
    );
    index.insert(
        "limecore_policy_evaluation_decision_sources".to_string(),
        json!([]),
    );
    index.insert(
        "limecore_policy_evaluation_blocking_refs".to_string(),
        json!([]),
    );
    index.insert("limecore_policy_evaluation_ask_refs".to_string(), json!([]));
    index.insert(
        "limecore_policy_evaluation_pending_refs".to_string(),
        json!([]),
    );
    index.insert("limecore_policy_unresolved_refs".to_string(), json!([]));
    index.insert("limecore_policy_missing_inputs".to_string(), json!([]));
    index.insert("limecore_policy_pending_hit_refs".to_string(), json!([]));
    index.insert("limecore_policy_value_hit_count".to_string(), json!(0));
    index.insert(
        "blocked_count".to_string(),
        json!(outputs
            .iter()
            .filter(|output| media_task_routing_outcome(output) == "blocked")
            .count()),
    );
    index.insert(
        "routing_outcomes".to_string(),
        Value::Array(count_routing_outcomes(outputs)),
    );
    index.insert("model_registry_assessment_count".to_string(), json!(0));
    index.insert(
        "audio_output_count".to_string(),
        json!(audio_statuses.len()),
    );
    index.insert(
        "audio_output_statuses".to_string(),
        Value::Array(count_by(audio_statuses)),
    );
    index.insert("audio_output_error_codes".to_string(), json!([]));
    index.insert("transcript_count".to_string(), json!(0));
    index.insert("transcript_statuses".to_string(), json!([]));
    index.insert("transcript_error_codes".to_string(), json!([]));
    index.insert("snapshots".to_string(), json!(snapshots));
    Value::Object(index)
}

pub fn create_image_generation_task_artifact(
    params: MediaTaskArtifactImageCreateParams,
) -> Result<MediaTaskArtifactResponse, String> {
    let workspace_root = normalize_required_string(&params.project_root_path, "projectRootPath")?;
    let prompt = normalize_required_string(&params.prompt, "prompt")?;
    let mut params = params;
    params.project_root_path = workspace_root.clone();
    params.prompt = prompt;
    let output = write_task_artifact(
        Path::new(&workspace_root),
        MediaTaskType::ImageGenerate,
        normalize_optional_string(params.title.clone()),
        create_image_payload(&params),
        TaskWriteOptions {
            status: Some("pending_submit".to_string()),
            output_path: None,
            artifact_dir: None,
            idempotency_key: Some(build_image_idempotency_key(&params).as_str()),
            relationships: TaskRelationships::default(),
        },
    )
    .map_err(data_error)?;
    response_from_output(output)
}

pub fn create_audio_generation_task_artifact(
    params: MediaTaskArtifactAudioCreateParams,
) -> Result<MediaTaskArtifactResponse, String> {
    let workspace_root = normalize_required_string(&params.project_root_path, "projectRootPath")?;
    let source_text = normalize_required_string(&params.source_text, "sourceText")?;
    let mut params = params;
    params.project_root_path = workspace_root.clone();
    params.source_text = source_text;
    let output_path = normalize_optional_string(params.output_path.clone());
    let output = write_task_artifact(
        Path::new(&workspace_root),
        MediaTaskType::AudioGenerate,
        normalize_optional_string(params.title.clone()),
        create_audio_payload(&params),
        TaskWriteOptions {
            status: Some("pending_submit".to_string()),
            output_path: output_path.as_deref(),
            artifact_dir: None,
            idempotency_key: Some(build_audio_idempotency_key(&params).as_str()),
            relationships: TaskRelationships::default(),
        },
    )
    .map_err(data_error)?;
    response_from_output(output)
}

pub fn create_video_generation_task_artifact(
    params: MediaTaskArtifactVideoCreateParams,
) -> Result<MediaTaskArtifactResponse, String> {
    let workspace_root = normalize_required_string(&params.project_root_path, "projectRootPath")?;
    let prompt = normalize_required_string(&params.prompt, "prompt")?;
    let mut params = params;
    params.project_root_path = workspace_root.clone();
    params.prompt = prompt;
    let output_path = normalize_optional_string(params.output_path.clone());
    let output = write_task_artifact(
        Path::new(&workspace_root),
        MediaTaskType::VideoGenerate,
        normalize_optional_string(params.title.clone()),
        create_video_payload(&params),
        TaskWriteOptions {
            status: Some("pending_submit".to_string()),
            output_path: output_path.as_deref(),
            artifact_dir: None,
            idempotency_key: Some(build_video_idempotency_key(&params).as_str()),
            relationships: TaskRelationships::default(),
        },
    )
    .map_err(data_error)?;
    response_from_output(output)
}

pub fn complete_audio_generation_task_artifact(
    params: MediaTaskArtifactAudioCompleteParams,
) -> Result<MediaTaskArtifactResponse, String> {
    let workspace_root = normalize_required_string(&params.project_root_path, "projectRootPath")?;
    let task_ref = normalize_required_string(&params.task_ref, "taskRef")?;
    let audio_path = normalize_required_string(&params.audio_path, "audioPath")?;
    let workspace_root_path = Path::new(&workspace_root);
    let current = load_task_output(workspace_root_path, &task_ref, None).map_err(data_error)?;

    if current.task_type != MediaTaskType::AudioGenerate.as_str() {
        return Err(format!(
            "只能完成 audio_generate 任务，当前任务类型为 {}",
            current.task_type
        ));
    }
    if matches!(current.normalized_status.as_str(), "cancelled" | "failed") {
        return Err(format!(
            "当前音频任务状态为 {}，不能直接写回完成态",
            current.normalized_status
        ));
    }

    let payload = task_payload(&current);
    let mime_type = normalize_optional_string(params.mime_type)
        .or_else(|| maybe_json_string(payload, &["mime_type", "mimeType"]))
        .unwrap_or_else(|| AUDIO_TASK_DEFAULT_MIME_TYPE.to_string());
    let provider_id = normalize_optional_string(params.provider_id)
        .or_else(|| maybe_json_string(payload, &["provider_id", "providerId"]));
    let model =
        normalize_optional_string(params.model).or_else(|| maybe_json_string(payload, &["model"]));
    let duration_ms = params.duration_ms.or_else(|| {
        maybe_json_u64(payload, &["duration_ms", "durationMs"]).or_else(|| {
            payload
                .get("audio_output")
                .or_else(|| payload.get("audioOutput"))
                .and_then(|audio| maybe_json_u64(audio, &["duration_ms", "durationMs"]))
        })
    });
    let audio_output = build_audio_output_summary(
        payload,
        &audio_path,
        &mime_type,
        duration_ms,
        provider_id.as_deref(),
        model.as_deref(),
    );
    let result = build_audio_generation_result_value(&audio_output);
    let output = patch_task_artifact(
        workspace_root_path,
        &task_ref,
        None,
        TaskArtifactPatch {
            status: Some("succeeded".to_string()),
            payload_patch: Some(json!({
                "audio_path": audio_path,
                "mime_type": mime_type,
                "duration_ms": duration_ms,
                "provider_id": provider_id,
                "model": model,
                "audio_output": audio_output,
            })),
            result: Some(Some(result)),
            last_error: Some(None),
            current_attempt_worker_id: Some(Some(AUDIO_TASK_COMPLETION_WORKER_ID.to_string())),
            ..TaskArtifactPatch::default()
        },
    )
    .map_err(data_error)?;
    response_from_output(output)
}

pub fn get_media_task_artifact(
    params: MediaTaskArtifactLookupParams,
) -> Result<MediaTaskArtifactResponse, String> {
    let workspace_root = normalize_required_string(&params.project_root_path, "projectRootPath")?;
    let task_ref = normalize_required_string(&params.task_ref, "taskRef")?;
    let output =
        load_task_output(Path::new(&workspace_root), &task_ref, None).map_err(data_error)?;
    response_from_output(output)
}

pub fn list_media_task_artifacts(
    params: MediaTaskArtifactListParams,
) -> Result<MediaTaskArtifactListResponse, String> {
    let workspace_root = normalize_required_string(&params.project_root_path, "projectRootPath")?;
    let status_filter = normalize_optional_string(params.status);
    let task_family_filter = normalize_optional_string(params.task_family);
    let task_type_filter = normalize_optional_string(params.task_type);
    let modality_contract_key_filter = normalize_optional_string(params.modality_contract_key);
    let routing_outcome_filter = normalize_optional_string(params.routing_outcome);
    let parsed_task_type = task_type_filter
        .as_deref()
        .map(|value| {
            value
                .parse::<MediaTaskType>()
                .map_err(|_| format!("不支持的 taskType: {value}"))
        })
        .transpose()?;
    let mut outputs = list_task_outputs(
        Path::new(&workspace_root),
        None,
        status_filter.as_deref(),
        task_family_filter.as_deref(),
        parsed_task_type,
        None,
    )
    .map_err(data_error)?;
    outputs.retain(|output| {
        media_task_matches_modality_filters(
            output,
            modality_contract_key_filter.as_deref(),
            routing_outcome_filter.as_deref(),
        )
    });
    if let Some(limit) = params.limit {
        outputs.truncate(limit);
    }
    let modality_runtime_contracts = build_modality_runtime_contract_index(&outputs);
    let tasks = response_vec_from_outputs(outputs)?;

    Ok(MediaTaskArtifactListResponse {
        success: true,
        workspace_root: workspace_root.clone(),
        artifact_root: Path::new(&workspace_root)
            .join(DEFAULT_ARTIFACT_ROOT)
            .to_string_lossy()
            .to_string(),
        filters: MediaTaskArtifactListFilters {
            status: status_filter,
            task_family: task_family_filter,
            task_type: parsed_task_type.map(|value| value.as_str().to_string()),
            modality_contract_key: modality_contract_key_filter,
            routing_outcome: routing_outcome_filter,
            limit: params.limit,
        },
        total: tasks.len(),
        modality_runtime_contracts,
        tasks,
    })
}

pub fn cancel_media_task_artifact(
    params: MediaTaskArtifactLookupParams,
) -> Result<MediaTaskArtifactResponse, String> {
    let workspace_root = normalize_required_string(&params.project_root_path, "projectRootPath")?;
    let task_ref = normalize_required_string(&params.task_ref, "taskRef")?;
    let output = update_task_status(Path::new(&workspace_root), &task_ref, None, "cancelled")
        .map_err(data_error)?;
    response_from_output(output)
}
