use crate::media_task;
use crate::media_task_payload::{image_model_task_request, video_model_task_request};
use crate::model_route_assembly::{resolved_route_from_task, ModelRouteSelection};
use crate::model_task_contract::{
    capability_snapshot_from_model_capabilities, MediaRouteAssessment,
};
use app_server_protocol::MediaTaskArtifactAudioCompleteParams;
use app_server_protocol::MediaTaskArtifactAudioCreateParams;
use app_server_protocol::MediaTaskArtifactImageCompleteParams;
use app_server_protocol::MediaTaskArtifactImageCreateParams;
use app_server_protocol::MediaTaskArtifactListParams;
use app_server_protocol::MediaTaskArtifactListResponse;
use app_server_protocol::MediaTaskArtifactLookupParams;
use app_server_protocol::MediaTaskArtifactResponse;
use app_server_protocol::MediaTaskArtifactVideoCreateParams;
use app_server_protocol::{ModelRefSource, ModelTaskRequest};
use lime_core::config::{Config, ConfigManager};
use lime_core::database::dao::api_key_provider::ProviderWithKeys;
use lime_core::database::DbConnection;
use lime_core::models::model_registry::EnhancedModelMetadata;
use lime_services::api_key_provider_service::ApiKeyProviderService;
use lime_services::model_registry_service::ModelRegistryService;
use serde_json::{json, Value};

pub(crate) fn create_image_media_task_artifact(
    params: MediaTaskArtifactImageCreateParams,
    route_assessment: Option<MediaRouteAssessment>,
) -> Result<MediaTaskArtifactResponse, String> {
    media_task::create_image_generation_task_artifact(params, route_assessment)
}

pub(crate) fn create_audio_media_task_artifact(
    params: MediaTaskArtifactAudioCreateParams,
) -> Result<MediaTaskArtifactResponse, String> {
    media_task::create_audio_generation_task_artifact(params)
}

pub(crate) fn create_video_media_task_artifact(
    params: MediaTaskArtifactVideoCreateParams,
    route_assessment: Option<MediaRouteAssessment>,
) -> Result<MediaTaskArtifactResponse, String> {
    media_task::create_video_generation_task_artifact(params, route_assessment)
}

pub(crate) fn complete_audio_media_task_artifact(
    params: MediaTaskArtifactAudioCompleteParams,
) -> Result<MediaTaskArtifactResponse, String> {
    media_task::complete_audio_generation_task_artifact(params)
}

pub(crate) fn complete_image_media_task_artifact(
    params: MediaTaskArtifactImageCompleteParams,
) -> Result<MediaTaskArtifactResponse, String> {
    media_task::complete_image_generation_task_artifact(params)
}

pub(crate) fn get_media_task_artifact(
    params: MediaTaskArtifactLookupParams,
) -> Result<MediaTaskArtifactResponse, String> {
    media_task::get_media_task_artifact(params)
}

pub(crate) fn list_media_task_artifacts(
    params: MediaTaskArtifactListParams,
) -> Result<MediaTaskArtifactListResponse, String> {
    media_task::list_media_task_artifacts(params)
}

pub(crate) fn cancel_media_task_artifact(
    params: MediaTaskArtifactLookupParams,
) -> Result<MediaTaskArtifactResponse, String> {
    media_task::cancel_media_task_artifact(params)
}

pub(crate) async fn assess_image_route(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    model_registry_service: &ModelRegistryService,
    params: &MediaTaskArtifactImageCreateParams,
) -> Option<MediaRouteAssessment> {
    assess_media_route(
        db,
        api_key_provider_service,
        model_registry_service,
        &image_model_task_request(params),
    )
    .await
}

pub(crate) fn normalize_image_create_params_for_task_submission(
    params: MediaTaskArtifactImageCreateParams,
) -> Result<MediaTaskArtifactImageCreateParams, String> {
    normalize_image_create_params_with_defaults(params, configured_image_generation_defaults())
}

fn normalize_image_create_params_with_defaults(
    params: MediaTaskArtifactImageCreateParams,
    defaults: ImageGenerationDefaults,
) -> Result<MediaTaskArtifactImageCreateParams, String> {
    let mut normalized = params;
    normalized.mode = normalize_image_task_mode(normalized.mode);
    normalized.provider_id =
        normalize_optional_task_field(normalized.provider_id).or(defaults.provider_id);
    normalized.model = normalize_optional_task_field(normalized.model).or(defaults.model_id);
    normalized.executor_mode = normalize_image_executor_mode(normalized.executor_mode);
    normalized.outer_model = normalize_optional_task_field(normalized.outer_model);
    normalized.session_id = normalize_optional_task_field(normalized.session_id);
    normalized.thread_id = normalize_optional_task_field(normalized.thread_id);
    normalized.turn_id = normalize_optional_task_field(normalized.turn_id);
    normalized.project_id = normalize_optional_task_field(normalized.project_id);
    normalized.modality_contract_key =
        normalize_optional_task_field(normalized.modality_contract_key);
    normalized.modality = normalize_optional_task_field(normalized.modality);
    normalized.routing_slot = normalize_optional_task_field(normalized.routing_slot);
    normalized.requested_target = normalize_optional_task_field(normalized.requested_target);
    normalized.slot_id = normalize_optional_task_field(normalized.slot_id);
    normalized.target_output_id = normalize_optional_task_field(normalized.target_output_id);
    normalized.target_output_ref_id =
        normalize_optional_task_field(normalized.target_output_ref_id);

    if normalized.provider_id.is_none() || normalized.model.is_none() {
        return Err(
            "图片生成缺少默认 Provider 或模型，请在 设置 -> 媒体生成 -> 图片服务模型 选择可用图片模型后重试。"
                .to_string(),
        );
    }

    Ok(normalized)
}

fn normalize_image_task_mode(value: Option<String>) -> Option<String> {
    match normalize_optional_task_field(value).as_deref() {
        Some("generate") => Some("generate".to_string()),
        Some("edit") => Some("edit".to_string()),
        Some("variation") => Some("variation".to_string()),
        _ => None,
    }
}

fn normalize_image_executor_mode(value: Option<String>) -> Option<String> {
    match normalize_optional_string(value).as_deref() {
        Some("images_api") => Some("images_api".to_string()),
        Some("responses_image_generation") => Some("responses_image_generation".to_string()),
        _ => None,
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

fn normalize_optional_task_field(value: Option<String>) -> Option<String> {
    normalize_optional_string(value).filter(|value| !is_placeholder_task_field(value))
}

fn is_placeholder_task_field(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "default"
            | "auto"
            | "automatic"
            | "system_default"
            | "system-default"
            | "__auto__"
            | "__default__"
    )
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct ImageGenerationDefaults {
    provider_id: Option<String>,
    model_id: Option<String>,
}

fn configured_image_generation_defaults() -> ImageGenerationDefaults {
    image_generation_defaults_from_config_file()
}

fn image_generation_defaults_from_config_file() -> ImageGenerationDefaults {
    let path = ConfigManager::default_config_path();
    ConfigManager::load(&path)
        .map(|manager| image_generation_defaults_from_config(manager.config()))
        .unwrap_or_default()
}

fn image_generation_defaults_from_config(config: &Config) -> ImageGenerationDefaults {
    let image = &config.workspace_preferences.media_defaults.image;

    ImageGenerationDefaults {
        provider_id: normalize_optional_task_field(image.preferred_provider_id.clone()),
        model_id: normalize_optional_task_field(image.preferred_model_id.clone()),
    }
}

pub(crate) async fn assess_video_route(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    model_registry_service: &ModelRegistryService,
    params: &MediaTaskArtifactVideoCreateParams,
) -> Option<MediaRouteAssessment> {
    assess_media_route(
        db,
        api_key_provider_service,
        model_registry_service,
        &video_model_task_request(params),
    )
    .await
}

async fn assess_media_route(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderService,
    model_registry_service: &ModelRegistryService,
    task_request: &ModelTaskRequest,
) -> Option<MediaRouteAssessment> {
    let model_ref = task_request.model_ref.as_ref()?;
    let provider = api_key_provider_service
        .get_provider(db, &model_ref.provider_id)
        .ok()
        .flatten()?;
    let models = model_registry_service
        .get_models_by_provider(&model_ref.provider_id)
        .await;
    let model = models
        .iter()
        .find(|model| model_matches(&model_ref.model_id, model))?;
    if !model_has_declared_capability_snapshot(model) {
        return None;
    }
    let snapshot = capability_snapshot_from_model_capabilities(&model_capabilities_value(model));
    let assessment = MediaRouteAssessment::from_snapshot(task_request, snapshot);
    let route = resolved_route_from_task(
        task_request,
        ModelRouteSelection {
            provider_id: &model_ref.provider_id,
            model_id: &model_ref.model_id,
            model_ref_source: ModelRefSource::Task,
            reasoning_effort: None,
        },
        &media_route_payload(task_request, model, &provider),
        Some(&provider),
        None,
    );
    Some(assessment.with_resolved_route(route))
}

fn model_has_declared_capability_snapshot(model: &EnhancedModelMetadata) -> bool {
    !model.task_families.is_empty()
        || !model.input_modalities.is_empty()
        || !model.output_modalities.is_empty()
        || !model.runtime_features.is_empty()
        || model.capabilities.vision
        || model.capabilities.tools
        || model.capabilities.streaming
        || model.capabilities.json_mode
        || model.capabilities.function_calling
        || model.capabilities.reasoning
        || model.capabilities.reasoning_effort.is_some()
}

fn model_matches(requested_model_id: &str, model: &EnhancedModelMetadata) -> bool {
    let requested = normalize_model_id(requested_model_id);
    [
        Some(model.id.as_str()),
        model.provider_model_id.as_deref(),
        model.canonical_model_id.as_deref(),
    ]
    .into_iter()
    .flatten()
    .any(|candidate| normalize_model_id(candidate) == requested)
}

fn normalize_model_id(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn model_capabilities_value(model: &EnhancedModelMetadata) -> Value {
    serde_json::to_value(model).unwrap_or(Value::Null)
}

fn media_route_payload(
    task_request: &ModelTaskRequest,
    model: &EnhancedModelMetadata,
    provider: &ProviderWithKeys,
) -> Value {
    let model_ref = task_request.model_ref.as_ref();
    let provider_readiness = readiness_payload(provider);
    let registry_payload = model_registry_payload(model);
    json!({
        "backend": "media_task_artifact",
        "routingMode": "task_route",
        "routing_mode": "task_route",
        "decisionSource": "media_task_artifact",
        "decision_source": "media_task_artifact",
        "decisionReason": "explicit_task_model",
        "decision_reason": "explicit_task_model",
        "settingsSource": "media_task_artifact",
        "settings_source": "media_task_artifact",
        "serviceModelSlot": task_request.routing_slot,
        "service_model_slot": task_request.routing_slot,
        "selectedProvider": model_ref.map(|model_ref| model_ref.provider_id.as_str()),
        "selected_provider": model_ref.map(|model_ref| model_ref.provider_id.as_str()),
        "selectedModel": model_ref.map(|model_ref| model_ref.model_id.as_str()),
        "selected_model": model_ref.map(|model_ref| model_ref.model_id.as_str()),
        "provider": model_ref.map(|model_ref| model_ref.provider_id.as_str()),
        "model": model_ref.map(|model_ref| model_ref.model_id.as_str()),
        "requiredCapabilities": task_request.requirements.capabilities,
        "required_capabilities": task_request.requirements.capabilities,
        "providerReadiness": provider_readiness,
        "provider_readiness": provider_readiness,
        "modelRegistry": registry_payload,
        "model_registry": registry_payload,
    })
}

fn readiness_payload(provider: &ProviderWithKeys) -> Value {
    let enabled_key_count = provider.api_keys.iter().filter(|key| key.enabled).count();
    let total_key_count = provider.api_keys.len();
    let ready = provider.provider.enabled && enabled_key_count > 0;
    let reason_code = if !provider.provider.enabled {
        Some("provider_disabled")
    } else if enabled_key_count == 0 {
        Some("missing_enabled_api_key")
    } else {
        None
    };
    json!({
        "ready": ready,
        "status": if ready { "ready" } else { "needs_setup" },
        "source": "provider_store",
        "reasonCode": reason_code,
        "reason_code": reason_code,
        "providerType": provider.provider.provider_type.to_string(),
        "provider_type": provider.provider.provider_type.to_string(),
        "enabled": provider.provider.enabled,
        "enabledKeyCount": enabled_key_count,
        "enabled_key_count": enabled_key_count,
        "totalKeyCount": total_key_count,
        "total_key_count": total_key_count,
        "directRequestConfig": false,
        "direct_request_config": false,
    })
}

fn model_registry_payload(model: &EnhancedModelMetadata) -> Value {
    let model_value = serde_json::to_value(model).unwrap_or(Value::Null);
    let capabilities = model_capabilities_value(model);
    json!({
        "source": model.source.to_string(),
        "sourceLabel": model.source.to_string(),
        "source_label": model.source.to_string(),
        "status": "matched",
        "reasonCode": "matched_media_task_model",
        "reason_code": "matched_media_task_model",
        "providerId": model.provider_id,
        "provider_id": model.provider_id,
        "requestedModelId": model.provider_model_id.as_deref().unwrap_or(model.id.as_str()),
        "requested_model_id": model.provider_model_id.as_deref().unwrap_or(model.id.as_str()),
        "matchedModelId": model.id,
        "matched_model_id": model.id,
        "model": model_value,
        "modelCapabilities": capabilities,
        "model_capabilities": capabilities,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn image_create_params() -> MediaTaskArtifactImageCreateParams {
        MediaTaskArtifactImageCreateParams {
            project_root_path: "/tmp/project".to_string(),
            prompt: "画一张广州夏天的图".to_string(),
            ..MediaTaskArtifactImageCreateParams::default()
        }
    }

    #[test]
    fn image_defaults_support_current_config_preferences() {
        let mut config = Config::default();
        config
            .workspace_preferences
            .media_defaults
            .image
            .preferred_provider_id = Some("custom-provider".to_string());
        config
            .workspace_preferences
            .media_defaults
            .image
            .preferred_model_id = Some("agnes-image-2.0-flash".to_string());

        let defaults = image_generation_defaults_from_config(&config);

        assert_eq!(defaults.provider_id.as_deref(), Some("custom-provider"));
        assert_eq!(defaults.model_id.as_deref(), Some("agnes-image-2.0-flash"));
    }

    #[test]
    fn image_task_submission_uses_config_defaults_and_cleans_direct_executor_mode() {
        let params = MediaTaskArtifactImageCreateParams {
            executor_mode: Some("direct".to_string()),
            ..image_create_params()
        };
        let normalized = normalize_image_create_params_with_defaults(
            params,
            ImageGenerationDefaults {
                provider_id: Some("custom-provider".to_string()),
                model_id: Some("agnes-image-2.0-flash".to_string()),
            },
        )
        .expect("normalized image params");

        assert_eq!(normalized.provider_id.as_deref(), Some("custom-provider"));
        assert_eq!(normalized.model.as_deref(), Some("agnes-image-2.0-flash"));
        assert_eq!(normalized.executor_mode, None);
    }

    #[test]
    fn image_task_submission_treats_default_model_as_config_fallback() {
        let params = MediaTaskArtifactImageCreateParams {
            mode: Some("default".to_string()),
            provider_id: Some("custom-provider".to_string()),
            model: Some("default".to_string()),
            outer_model: Some("default".to_string()),
            session_id: Some("default".to_string()),
            thread_id: Some("default".to_string()),
            turn_id: Some("default".to_string()),
            project_id: Some("default".to_string()),
            routing_slot: Some("default".to_string()),
            requested_target: Some("default".to_string()),
            slot_id: Some("default".to_string()),
            target_output_id: Some("default".to_string()),
            target_output_ref_id: Some("default".to_string()),
            ..image_create_params()
        };
        let normalized = normalize_image_create_params_with_defaults(
            params,
            ImageGenerationDefaults {
                provider_id: Some("custom-provider".to_string()),
                model_id: Some("agnes-image-2.1-flash".to_string()),
            },
        )
        .expect("normalized image params");

        assert_eq!(normalized.provider_id.as_deref(), Some("custom-provider"));
        assert_eq!(normalized.model.as_deref(), Some("agnes-image-2.1-flash"));
        assert_eq!(normalized.mode, None);
        assert_eq!(normalized.session_id, None);
        assert_eq!(normalized.thread_id, None);
        assert_eq!(normalized.turn_id, None);
        assert_eq!(normalized.project_id, None);
        assert_eq!(normalized.routing_slot, None);
        assert_eq!(normalized.requested_target, None);
        assert_eq!(normalized.slot_id, None);
        assert_eq!(normalized.target_output_id, None);
        assert_eq!(normalized.target_output_ref_id, None);
        assert_eq!(normalized.outer_model, None);
    }

    #[test]
    fn image_defaults_ignore_placeholder_values() {
        let mut config = Config::default();
        config
            .workspace_preferences
            .media_defaults
            .image
            .preferred_provider_id = Some("default".to_string());
        config
            .workspace_preferences
            .media_defaults
            .image
            .preferred_model_id = Some("auto".to_string());

        let defaults = image_generation_defaults_from_config(&config);

        assert_eq!(defaults, ImageGenerationDefaults::default());
    }

    #[test]
    fn image_task_submission_fails_without_explicit_or_default_model_ref() {
        let error =
            normalize_image_create_params_with_defaults(image_create_params(), Default::default())
                .expect_err("missing image defaults should fail closed");

        assert!(error.contains("图片生成缺少默认 Provider 或模型"));
    }
}
