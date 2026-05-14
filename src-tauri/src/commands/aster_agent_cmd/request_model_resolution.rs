use super::*;
use crate::commands::aster_agent_cmd::service_skill_launch::extract_service_scene_launch_context;
use crate::commands::model_registry_cmd::ModelRegistryState;
use crate::config::GlobalConfigManagerState;
mod fast_response;
mod responsive_chat;
use fast_response::{
    extract_fast_response_fallback_preference, extract_fast_response_routing,
    extract_fast_response_routing_slot, extract_fast_response_service_model_slot,
};
use lime_core::database::dao::api_key_provider::{ApiProviderType, ProviderGroup};
use lime_core::models::model_registry::{
    EnhancedModelMetadata, ModelCapabilities, ModelDeploymentSource, ModelManagementPlane,
    ModelModality, ModelPricing, ModelRuntimeFeature, ModelSource, ModelTaskFamily, ModelTier,
    ProviderAliasConfig,
};
use responsive_chat::{
    resolve_responsive_chat_auto_preference, responsive_chat_model_sort,
    responsive_chat_setting_fallback_reason, targets_responsive_chat,
    RESPONSIVE_CHAT_SERVICE_MODEL_SLOT,
};
use std::collections::HashSet;
use tauri::Manager;

const LIME_RUNTIME_METADATA_KEY: &str = "lime_runtime";
const MODALITY_EXECUTION_PROFILES_JSON: &str =
    include_str!("../../../../src/lib/governance/modalityExecutionProfiles.json");

#[derive(Debug, Clone)]
struct ProviderResolutionContext {
    provider_selector: String,
    aster_provider_name: String,
    compatibility_provider_key: String,
    registry_provider_ids: Vec<String>,
    alias_key: String,
    custom_models: Vec<String>,
    is_custom_provider: bool,
    provider_type: Option<ApiProviderType>,
    provider_group: Option<ProviderGroup>,
    configured_api_host: Option<String>,
    has_credentials: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum RuntimeProviderConfigurationStrategy {
    Manual { base_url: Option<String> },
    ApiKeyProvider,
}

#[derive(Debug, Clone)]
pub(super) struct RuntimeRequestProviderResolution {
    pub provider_config: Option<ConfigureProviderRequest>,
    pub task_profile: lime_agent::SessionExecutionRuntimeTaskProfile,
    pub routing_decision: lime_agent::SessionExecutionRuntimeRoutingDecision,
    pub limit_state: lime_agent::SessionExecutionRuntimeLimitState,
    pub cost_state: lime_agent::SessionExecutionRuntimeCostState,
    pub permission_state: lime_agent::SessionExecutionRuntimePermissionState,
    pub limit_event: Option<lime_agent::SessionExecutionRuntimeLimitEvent>,
    pub oem_policy: Option<lime_agent::SessionExecutionRuntimeOemPolicy>,
    pub runtime_summary: lime_agent::SessionExecutionRuntimeSummary,
}

#[derive(Debug, Clone)]
struct ResolvedRuntimeProviderSelection {
    provider_config: ConfigureProviderRequest,
    provider_selector: String,
    requested_model: String,
    resolved_model: String,
    candidate_count: u32,
    estimated_cost_class: Option<String>,
    pricing: Option<ModelPricing>,
    capability_gap: Option<String>,
    capability_gap_source: Option<String>,
    fallback_chain: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RuntimeModelCapabilityRequirement {
    TextGeneration,
    VisionInput,
    ImageGeneration,
    AudioTranscription,
    VoiceGeneration,
    BrowserReasoning,
    StructuredDocumentGeneration,
    CheapSummary,
    ResponsiveChat,
}

impl RuntimeModelCapabilityRequirement {
    fn gap_code(self) -> &'static str {
        match self {
            Self::TextGeneration => "text_generation_candidate_missing",
            Self::VisionInput => "vision_candidate_missing",
            Self::ImageGeneration => "image_generation_candidate_missing",
            Self::AudioTranscription => "audio_transcription_candidate_missing",
            Self::VoiceGeneration => "voice_generation_candidate_missing",
            Self::BrowserReasoning => "browser_reasoning_candidate_missing",
            Self::StructuredDocumentGeneration => "structured_document_candidate_missing",
            Self::CheapSummary => "cheap_summary_candidate_missing",
            Self::ResponsiveChat => "responsive_chat_candidate_missing",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RequestOemRoutingContext {
    pub tenant_id: String,
    pub provider_source: Option<String>,
    pub provider_key: Option<String>,
    pub default_model: Option<String>,
    pub config_mode: Option<String>,
    pub offer_state: Option<String>,
    pub quota_status: Option<String>,
    pub fallback_to_local_allowed: Option<bool>,
    pub can_invoke: Option<bool>,
}

fn normalize_identifier(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn canonical_provider_selector(provider_selector: &str) -> String {
    match normalize_identifier(provider_selector).as_str() {
        "mimo" | "xiaomimimo" => "xiaomi".to_string(),
        normalized => normalized.to_string(),
    }
}

const XIAOMI_HOST_KEYWORDS: [&str; 1] = ["xiaomimimo.com"];
const PROVIDER_PERMISSION_RECOVERY_MODELS: [(&str, &str); 1] = [("openai", "gpt-4o-mini")];

fn provider_alias_config_key(provider_key: &str) -> String {
    match normalize_identifier(provider_key).as_str() {
        "gemini_api_key" => "gemini".to_string(),
        normalized => normalized.to_string(),
    }
}

fn provider_registry_id_from_key(provider_key: &str) -> String {
    match normalize_identifier(provider_key).as_str() {
        "openai" => "openai".to_string(),
        "anthropic" | "anthropic-compatible" | "claude" => "anthropic".to_string(),
        "gemini" | "gemini_api_key" => "gemini".to_string(),
        "azure-openai" => "openai".to_string(),
        "vertexai" => "google".to_string(),
        "ollama" => "ollama".to_string(),
        "fal" => "fal".to_string(),
        "qwen" => "alibaba".to_string(),
        "codex" => "codex".to_string(),
        "iflow" => "openai".to_string(),
        normalized => normalized.to_string(),
    }
}

fn provider_type_from_key(provider_key: &str) -> Option<ApiProviderType> {
    match normalize_identifier(provider_key).as_str() {
        "openai" | "iflow" => Some(ApiProviderType::Openai),
        "anthropic" | "claude" => Some(ApiProviderType::Anthropic),
        "anthropic-compatible" => Some(ApiProviderType::AnthropicCompatible),
        "gemini" | "gemini_api_key" => Some(ApiProviderType::Gemini),
        "azure-openai" => Some(ApiProviderType::AzureOpenai),
        "vertexai" => Some(ApiProviderType::Vertexai),
        "aws-bedrock" | "bedrock" => Some(ApiProviderType::AwsBedrock),
        "ollama" => Some(ApiProviderType::Ollama),
        "fal" => Some(ApiProviderType::Fal),
        "new-api" => Some(ApiProviderType::NewApi),
        "gateway" => Some(ApiProviderType::Gateway),
        "codex" => Some(ApiProviderType::Codex),
        _ => None,
    }
}

fn normalize_runtime_provider_base_url(
    provider_type: Option<ApiProviderType>,
    base_url: Option<String>,
) -> Option<String> {
    let normalized = normalize_optional_text(base_url)?;
    if provider_type != Some(ApiProviderType::Ollama) {
        return Some(normalized);
    }

    let trimmed = normalized.trim_end_matches('/').to_string();
    if let Some(without_version) = trimmed.strip_suffix("/v1") {
        return normalize_optional_text(Some(without_version.to_string())).or_else(|| {
            Some(
                ApiProviderType::Ollama
                    .runtime_spec()
                    .default_api_host
                    .to_string(),
            )
        });
    }

    Some(trimmed)
}

fn resolve_runtime_provider_configuration_strategy(
    context: &ProviderResolutionContext,
) -> RuntimeProviderConfigurationStrategy {
    let configured_base_url = normalize_runtime_provider_base_url(
        context.provider_type,
        context.configured_api_host.clone(),
    );
    let is_credentialless_local_provider =
        matches!(context.provider_group, Some(ProviderGroup::Local)) && !context.has_credentials;
    let should_use_manual_provider =
        is_credentialless_local_provider || context.provider_type == Some(ApiProviderType::Ollama);

    if !should_use_manual_provider {
        return RuntimeProviderConfigurationStrategy::ApiKeyProvider;
    }

    let fallback_base_url = context.provider_type.map(|provider_type| {
        normalize_runtime_provider_base_url(
            Some(provider_type),
            Some(provider_type.runtime_spec().default_api_host.to_string()),
        )
        .unwrap_or_else(|| provider_type.runtime_spec().default_api_host.to_string())
    });

    RuntimeProviderConfigurationStrategy::Manual {
        base_url: configured_base_url.or(fallback_base_url),
    }
}

fn infer_reasoning_capability(model_id: &str) -> bool {
    let normalized = normalize_identifier(model_id);
    normalized.contains("thinking") || normalized.contains("reasoning")
}

fn text_contains_any(text: &str, keywords: &[&str]) -> bool {
    keywords.iter().any(|keyword| text.contains(keyword))
}

fn model_id_has_openai_vision_capability(model_id: &str, text: &str) -> bool {
    let model = normalize_identifier(model_id);
    let model_tail = model.rsplit('/').next().unwrap_or(model.as_str());
    text_contains_any(
        text,
        &[
            "chatgpt-4o",
            "gpt-5",
            "gpt-4o",
            "gpt-4.1",
            "gpt-4.5",
            "gpt-4-turbo",
            "codex",
        ],
    ) || model_tail == "o1"
        || model_tail == "o1-pro"
        || model_tail.starts_with("o1-pro-")
        || model_tail.starts_with("o1-202")
        || model_tail == "o3"
        || (model_tail.starts_with("o3-") && !model_tail.starts_with("o3-mini"))
        || model_tail.starts_with("o4-mini")
}

fn model_id_has_qwen_vision_capability(model_id: &str, text: &str) -> bool {
    let model = normalize_identifier(model_id);
    let model_tail = model.rsplit('/').next().unwrap_or(model.as_str());
    (text.contains("qwen") && (text.contains("vl") || text.contains("vision")))
        || text.contains("qvq")
        || model_tail.starts_with("qwen3.5")
        || model_tail.starts_with("qwen3-5")
        || model_tail.starts_with("qwen3.6")
        || model_tail.starts_with("qwen3-6")
}

fn model_id_has_xai_vision_capability(model_id: &str) -> bool {
    let model = normalize_identifier(model_id);
    model.contains("grok-vision")
        || model.contains("grok-2-vision")
        || model.starts_with("grok-4-1")
        || model.starts_with("grok-4-fast")
        || model.starts_with("grok-4.20")
        || model.starts_with("grok-4.3")
}

fn model_id_has_mistral_vision_capability(model_id: &str, text: &str) -> bool {
    let model = normalize_identifier(model_id);
    let model_tail = model.rsplit('/').next().unwrap_or(model.as_str());
    text.contains("pixtral")
        || model_tail.starts_with("mistral-small-latest")
        || model_tail.starts_with("mistral-large-2512")
        || model_tail.starts_with("mistral-medium-3.1")
}

fn model_id_has_gemma_vision_capability(model_id: &str) -> bool {
    let model = normalize_identifier(model_id);
    let model_tail = model.rsplit('/').next().unwrap_or(model.as_str());
    model_tail.starts_with("gemma-3") && !model_tail.starts_with("gemma-3n")
}

fn model_id_has_llama_vision_capability(model_id: &str) -> bool {
    let model = normalize_identifier(model_id);
    model.contains("llama-4-maverick") || model.contains("llama-4-scout")
}

fn infer_vision_capability(
    model_id: &str,
    provider_id: Option<&str>,
    family: Option<&str>,
    description: Option<&str>,
) -> bool {
    let text = [
        normalize_identifier(model_id),
        family.map(normalize_identifier).unwrap_or_default(),
        description.map(normalize_identifier).unwrap_or_default(),
    ]
    .into_iter()
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join(" ");
    if text.is_empty() {
        return false;
    }

    let provider = provider_id.map(normalize_identifier).unwrap_or_default();

    if text_contains_any(
        &text,
        &[
            "embedding",
            "embed",
            "rerank",
            "tts",
            "stt",
            "transcribe",
            "transcription",
            "speech",
            "audio",
            "moderation",
            "imagen",
            "dall-e",
            "dalle",
            "stable diffusion",
            "stable-diffusion",
            "sdxl",
            "sd3",
            "midjourney",
            "image generation",
            "image-generation",
            "image-gen",
            "image-preview",
            "flux",
        ],
    ) {
        return false;
    }

    if text_contains_any(
        &text,
        &[
            "vision",
            "multimodal",
            "multi-modal",
            "omni",
            "image-input",
            "image understanding",
        ],
    ) {
        return true;
    }

    let openai_like = model_id_has_openai_vision_capability(model_id, &text);
    if provider == "openai" || provider == "codex" {
        return openai_like;
    }

    if provider == "gemini" || provider == "google" {
        return text.contains("gemini") || model_id_has_gemma_vision_capability(model_id);
    }

    if provider == "anthropic" || provider == "claude" {
        return text.contains("claude");
    }

    if provider == "qwen" || provider == "alibaba" {
        return model_id_has_qwen_vision_capability(model_id, &text);
    }

    if provider == "zhipuai" {
        return text.contains("glm-") && text.contains('v');
    }
    if provider == "xai" || provider == "x-ai" {
        return model_id_has_xai_vision_capability(model_id);
    }
    if provider == "mistral" || provider == "mistralai" {
        return model_id_has_mistral_vision_capability(model_id, &text);
    }
    if provider == "llama" || provider == "meta" || provider == "meta-llama" {
        return model_id_has_llama_vision_capability(model_id);
    }

    openai_like
        || text.contains("gemini")
        || text.contains("claude")
        || model_id_has_qwen_vision_capability(model_id, &text)
        || (text.contains("glm-") && text.contains('v'))
        || model_id_has_xai_vision_capability(model_id)
        || model_id_has_mistral_vision_capability(model_id, &text)
        || model_id_has_gemma_vision_capability(model_id)
        || model_id_has_llama_vision_capability(model_id)
}

fn infer_model_capabilities(
    model_id: &str,
    provider_id: Option<&str>,
    task_families: &[ModelTaskFamily],
    family: Option<&str>,
    description: Option<&str>,
) -> ModelCapabilities {
    let specialized_only = task_families.iter().any(|family| {
        matches!(
            family,
            ModelTaskFamily::ImageGeneration
                | ModelTaskFamily::ImageEdit
                | ModelTaskFamily::SpeechToText
                | ModelTaskFamily::TextToSpeech
                | ModelTaskFamily::Embedding
                | ModelTaskFamily::Rerank
        )
    });

    ModelCapabilities {
        vision: task_families.contains(&ModelTaskFamily::VisionUnderstanding)
            || infer_vision_capability(model_id, provider_id, family, description),
        tools: !task_families.contains(&ModelTaskFamily::ImageGeneration),
        streaming: true,
        json_mode: !specialized_only,
        function_calling: !task_families.contains(&ModelTaskFamily::ImageGeneration)
            && !task_families.contains(&ModelTaskFamily::ImageEdit)
            && !task_families.contains(&ModelTaskFamily::SpeechToText)
            && !task_families.contains(&ModelTaskFamily::TextToSpeech)
            && !task_families.contains(&ModelTaskFamily::Embedding)
            && !task_families.contains(&ModelTaskFamily::Rerank),
        reasoning: task_families.contains(&ModelTaskFamily::Reasoning)
            || infer_reasoning_capability(model_id)
            || provider_id.map(normalize_identifier).as_deref() == Some("codex"),
    }
}

fn infer_model_task_families(
    model_id: &str,
    provider_id: Option<&str>,
    family: Option<&str>,
    description: Option<&str>,
) -> Vec<ModelTaskFamily> {
    let text = [
        normalize_identifier(model_id),
        family.map(normalize_identifier).unwrap_or_default(),
        description.map(normalize_identifier).unwrap_or_default(),
    ]
    .into_iter()
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join(" ");
    let inferred_vision = infer_vision_capability(model_id, provider_id, family, description);
    let inferred_reasoning = infer_reasoning_capability(model_id);
    let is_embedding = text_contains_any(&text, &["embedding", "embed", "text-embedding"]);
    let is_rerank = text_contains_any(&text, &["rerank", "re-rank"]);
    let is_moderation = text_contains_any(&text, &["moderation"]);
    let is_speech_to_text = text_contains_any(
        &text,
        &[
            "stt",
            "asr",
            "speech-to-text",
            "speech to text",
            "transcribe",
            "transcription",
            "whisper",
        ],
    );
    let is_text_to_speech = text_contains_any(
        &text,
        &[
            "tts",
            "text-to-speech",
            "text to speech",
            "speech synthesis",
            "voice-synth",
        ],
    );
    let is_image_generation = text_contains_any(
        &text,
        &[
            "gpt-image",
            "gpt-images",
            "imagen",
            "dall-e",
            "dalle",
            "stable diffusion",
            "stable-diffusion",
            "sdxl",
            "sd3",
            "midjourney",
            "image generation",
            "image-generation",
            "image-gen",
            "image-preview",
            "flux",
            "nano-banana",
            "recraft",
            "ideogram",
            "seedream",
        ],
    );
    let is_image_edit = text_contains_any(
        &text,
        &[
            "edit",
            "inpaint",
            "outpaint",
            "img2img",
            "image-edit",
            "image_edit",
            "image edits",
        ],
    );

    let mut families = Vec::new();
    if is_embedding {
        families.push(ModelTaskFamily::Embedding);
    }
    if is_rerank {
        families.push(ModelTaskFamily::Rerank);
    }
    if is_moderation {
        families.push(ModelTaskFamily::Moderation);
    }
    if is_speech_to_text {
        families.push(ModelTaskFamily::SpeechToText);
    }
    if is_text_to_speech {
        families.push(ModelTaskFamily::TextToSpeech);
    }
    if is_image_generation {
        families.push(ModelTaskFamily::ImageGeneration);
    }
    if is_image_edit {
        families.push(ModelTaskFamily::ImageEdit);
    }
    if inferred_vision && !is_image_generation {
        families.push(ModelTaskFamily::VisionUnderstanding);
    }
    if inferred_reasoning {
        families.push(ModelTaskFamily::Reasoning);
    }

    let specialized_only = families.iter().any(|family| {
        matches!(
            family,
            ModelTaskFamily::Embedding
                | ModelTaskFamily::Rerank
                | ModelTaskFamily::Moderation
                | ModelTaskFamily::SpeechToText
                | ModelTaskFamily::TextToSpeech
                | ModelTaskFamily::ImageGeneration
                | ModelTaskFamily::ImageEdit
        )
    });
    if !specialized_only || inferred_vision || inferred_reasoning {
        families.push(ModelTaskFamily::Chat);
    }

    families
}

fn infer_input_modalities(task_families: &[ModelTaskFamily]) -> Vec<ModelModality> {
    let mut modalities = vec![ModelModality::Text];
    if task_families.contains(&ModelTaskFamily::SpeechToText) {
        modalities.push(ModelModality::Audio);
    }
    if task_families.contains(&ModelTaskFamily::ImageEdit)
        || task_families.contains(&ModelTaskFamily::VisionUnderstanding)
    {
        modalities.push(ModelModality::Image);
    }
    modalities
}

fn infer_output_modalities(
    task_families: &[ModelTaskFamily],
    capabilities: &ModelCapabilities,
) -> Vec<ModelModality> {
    let mut modalities = Vec::new();
    if task_families.iter().any(|family| {
        matches!(
            family,
            ModelTaskFamily::Chat
                | ModelTaskFamily::Reasoning
                | ModelTaskFamily::VisionUnderstanding
                | ModelTaskFamily::SpeechToText
                | ModelTaskFamily::Rerank
                | ModelTaskFamily::Moderation
        )
    }) {
        modalities.push(ModelModality::Text);
    }
    if task_families.contains(&ModelTaskFamily::ImageGeneration)
        || task_families.contains(&ModelTaskFamily::ImageEdit)
    {
        modalities.push(ModelModality::Image);
    }
    if task_families.contains(&ModelTaskFamily::TextToSpeech) {
        modalities.push(ModelModality::Audio);
    }
    if task_families.contains(&ModelTaskFamily::Embedding) {
        modalities.push(ModelModality::Embedding);
    }
    if capabilities.json_mode && !task_families.contains(&ModelTaskFamily::SpeechToText) {
        modalities.push(ModelModality::Json);
    }
    modalities
}

fn infer_runtime_features(
    provider_id: &str,
    task_families: &[ModelTaskFamily],
    capabilities: &ModelCapabilities,
) -> Vec<ModelRuntimeFeature> {
    let mut features = vec![ModelRuntimeFeature::Streaming];
    if capabilities.tools || capabilities.function_calling {
        features.push(ModelRuntimeFeature::ToolCalling);
    }
    if capabilities.json_mode {
        features.push(ModelRuntimeFeature::JsonSchema);
    }
    if capabilities.reasoning || task_families.contains(&ModelTaskFamily::Reasoning) {
        features.push(ModelRuntimeFeature::Reasoning);
    }
    match normalize_identifier(provider_id).as_str() {
        "codex" => features.push(ModelRuntimeFeature::ResponsesApi),
        "openai" | "new-api" | "azure-openai" | "gateway" => {
            features.push(ModelRuntimeFeature::ChatCompletionsApi)
        }
        _ => {}
    }
    if task_families.contains(&ModelTaskFamily::ImageGeneration)
        || task_families.contains(&ModelTaskFamily::ImageEdit)
    {
        features.push(ModelRuntimeFeature::ImagesApi);
    }
    features
}

fn infer_deployment_source(provider_id: &str) -> ModelDeploymentSource {
    let normalized = normalize_identifier(provider_id);
    if text_contains_any(
        &normalized,
        &["ollama", "lmstudio", "gpustack", "ovms", "comfyui"],
    ) {
        return ModelDeploymentSource::Local;
    }
    ModelDeploymentSource::UserCloud
}

fn build_inferred_model_metadata(
    model_id: &str,
    provider_id: &str,
    family: Option<String>,
    description: Option<String>,
) -> EnhancedModelMetadata {
    let now = chrono::Utc::now().timestamp();
    let task_families = infer_model_task_families(
        model_id,
        Some(provider_id),
        family.as_deref(),
        description.as_deref(),
    );
    let capabilities = infer_model_capabilities(
        model_id,
        Some(provider_id),
        &task_families,
        family.as_deref(),
        description.as_deref(),
    );
    let input_modalities = infer_input_modalities(&task_families);
    let output_modalities = infer_output_modalities(&task_families, &capabilities);
    let runtime_features = infer_runtime_features(provider_id, &task_families, &capabilities);
    let deployment_source = infer_deployment_source(provider_id);
    EnhancedModelMetadata {
        id: model_id.to_string(),
        display_name: model_id.to_string(),
        provider_id: provider_id.to_string(),
        provider_name: provider_id.to_string(),
        family: family.clone(),
        tier: ModelTier::Pro,
        capabilities,
        task_families,
        input_modalities,
        output_modalities,
        runtime_features,
        deployment_source,
        management_plane: ModelManagementPlane::LocalSettings,
        canonical_model_id: None,
        provider_model_id: Some(model_id.to_string()),
        alias_source: None,
        pricing: None,
        limits: Default::default(),
        status: Default::default(),
        release_date: None,
        is_latest: false,
        description,
        source: ModelSource::Custom,
        created_at: now,
        updated_at: now,
    }
}

fn merge_model_catalog(
    target: &mut Vec<EnhancedModelMetadata>,
    incoming: impl IntoIterator<Item = EnhancedModelMetadata>,
) {
    for candidate in incoming {
        let normalized_id = normalize_identifier(&candidate.id);
        if let Some(existing_index) = target
            .iter()
            .position(|model| normalize_identifier(&model.id) == normalized_id)
        {
            target[existing_index] = candidate;
        } else {
            target.push(candidate);
        }
    }
}

fn build_provider_resolution_context(
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    provider_selector: &str,
) -> Result<ProviderResolutionContext, String> {
    let provider_selector = canonical_provider_selector(provider_selector);
    let is_custom_provider =
        lime_core::models::provider_type::is_custom_provider_id(&provider_selector);
    let mut provider_type = provider_type_from_key(&provider_selector);
    let mut aster_provider_name = provider_type
        .map(|provider_type| provider_type.runtime_spec().aster_provider_name.to_string())
        .unwrap_or_else(|| provider_selector.clone());
    let mut compatibility_provider_key = provider_selector.clone();
    let mut registry_provider_ids = vec![
        provider_selector.clone(),
        provider_registry_id_from_key(&provider_selector),
    ];
    let mut custom_models = Vec::new();
    let mut provider_group = None;
    let mut configured_api_host = None;
    let mut has_credentials = false;

    if let Some(provider_with_keys) = api_key_provider_service
        .0
        .get_provider(db, &provider_selector)?
    {
        provider_type = Some(provider_with_keys.provider.provider_type);
        aster_provider_name = provider_with_keys
            .provider
            .provider_type
            .runtime_spec()
            .aster_provider_name
            .to_string();
        provider_group = Some(provider_with_keys.provider.group);
        configured_api_host =
            normalize_optional_text(Some(provider_with_keys.provider.api_host.clone()));
        has_credentials = !provider_with_keys.api_keys.is_empty();
        custom_models = provider_with_keys.provider.custom_models;

        if is_custom_provider {
            compatibility_provider_key = provider_with_keys.provider.provider_type.to_string();
            registry_provider_ids.push(provider_registry_id_from_key(&compatibility_provider_key));
        }
    }

    let mut seen = HashSet::new();
    registry_provider_ids.retain(|provider_id| {
        !provider_id.trim().is_empty() && seen.insert(normalize_identifier(provider_id))
    });

    let mut context = ProviderResolutionContext {
        aster_provider_name,
        alias_key: provider_alias_config_key(&provider_selector),
        compatibility_provider_key,
        custom_models,
        configured_api_host,
        has_credentials,
        is_custom_provider,
        provider_group,
        provider_type,
        provider_selector,
        registry_provider_ids,
    };
    context.custom_models = canonicalize_provider_custom_models(&context, &context.custom_models);

    Ok(context)
}

async fn load_model_registry_catalog(
    app: &AppHandle,
    context: &ProviderResolutionContext,
) -> (Vec<EnhancedModelMetadata>, Option<ProviderAliasConfig>) {
    let mut catalog = context
        .custom_models
        .iter()
        .map(|model_id| {
            build_inferred_model_metadata(model_id, &context.provider_selector, None, None)
        })
        .collect::<Vec<_>>();

    let model_registry_state = app.state::<ModelRegistryState>();
    let guard = model_registry_state.read().await;
    let Some(service) = guard.as_ref() else {
        return (catalog, None);
    };

    let all_models = service.get_all_models().await;
    let alias_config = service.get_provider_alias_config(&context.alias_key).await;
    drop(guard);

    if let Some(config) = alias_config.as_ref() {
        merge_model_catalog(
            &mut catalog,
            config.models.iter().map(|model_id| {
                let alias = config.aliases.get(model_id);
                build_inferred_model_metadata(
                    model_id,
                    &context.provider_selector,
                    alias.and_then(|item| item.provider.clone()),
                    alias.and_then(|item| item.description.clone()),
                )
            }),
        );
    }

    let registry_models = all_models.into_iter().filter(|model| {
        context
            .registry_provider_ids
            .iter()
            .any(|provider_id| provider_id == &normalize_identifier(&model.provider_id))
    });
    merge_model_catalog(&mut catalog, registry_models);

    (catalog, alias_config)
}

fn normalize_base_model_key(model_id: &str) -> String {
    let normalized_model_id = normalize_identifier(model_id);
    let tokens = normalized_model_id
        .split(|ch| ['.', '_', '-', '/'].contains(&ch))
        .filter(|token| !token.is_empty() && *token != "thinking" && *token != "reasoning")
        .collect::<Vec<_>>();
    tokens.join("-")
}

fn find_model_meta<'a>(
    model_id: &str,
    models: &'a [EnhancedModelMetadata],
) -> Option<&'a EnhancedModelMetadata> {
    let normalized = normalize_identifier(model_id);
    models
        .iter()
        .find(|model| normalize_identifier(&model.id) == normalized)
}

fn is_xiaomi_like_provider_context(context: &ProviderResolutionContext) -> bool {
    let provider_selector = normalize_identifier(&context.provider_selector);
    let compatibility_provider = normalize_identifier(&context.compatibility_provider_key);
    let provider_type = context
        .provider_type
        .map(|provider_type| normalize_identifier(&provider_type.to_string()))
        .unwrap_or_default();
    let api_host = context
        .configured_api_host
        .as_deref()
        .map(normalize_identifier)
        .unwrap_or_default();

    matches!(provider_selector.as_str(), "xiaomi" | "mimo" | "xiaomimimo")
        || matches!(
            compatibility_provider.as_str(),
            "xiaomi" | "mimo" | "xiaomimimo"
        )
        || matches!(provider_type.as_str(), "xiaomi" | "mimo" | "xiaomimimo")
        || XIAOMI_HOST_KEYWORDS
            .iter()
            .any(|keyword| api_host.contains(keyword))
}

fn canonicalize_xiaomi_model_id(model_id: &str) -> String {
    let trimmed = model_id.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    match normalize_identifier(trimmed).as_str() {
        "mimo-v2-pro" | "mimo-v2.5" | "mimo-v2.5-pro" => "mimo-v2.5-pro".to_string(),
        _ => trimmed.to_string(),
    }
}

fn canonicalize_known_provider_model_id(
    context: &ProviderResolutionContext,
    model_id: &str,
) -> String {
    let trimmed = model_id.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if is_xiaomi_like_provider_context(context) {
        return canonicalize_xiaomi_model_id(trimmed);
    }

    trimmed.to_string()
}

fn canonicalize_provider_custom_models(
    context: &ProviderResolutionContext,
    model_ids: &[String],
) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();

    for model_id in model_ids {
        let canonical = canonicalize_known_provider_model_id(context, model_id);
        if canonical.is_empty() {
            continue;
        }

        if seen.insert(normalize_identifier(&canonical)) {
            result.push(canonical);
        }
    }

    result
}

fn model_has_reasoning_capability(
    model: Option<&EnhancedModelMetadata>,
    fallback_model_id: &str,
) -> bool {
    model
        .map(|item| {
            item.capabilities.reasoning || item.supports_task_family(&ModelTaskFamily::Reasoning)
        })
        .unwrap_or(false)
        || infer_reasoning_capability(fallback_model_id)
}

fn compare_release_date_desc(left: &EnhancedModelMetadata, right: &EnhancedModelMetadata) -> i32 {
    match (left.release_date.as_deref(), right.release_date.as_deref()) {
        (Some(left_date), Some(right_date)) => right_date.cmp(left_date) as i32,
        (Some(_), None) => -1,
        (None, Some(_)) => 1,
        (None, None) => 0,
    }
}

fn sort_reasoning_candidates<'a>(
    mut candidates: Vec<&'a EnhancedModelMetadata>,
    current_model_id: &str,
) -> Vec<&'a EnhancedModelMetadata> {
    let normalized_current_id = normalize_identifier(current_model_id);
    let exact_preferred_ids = [
        format!("{normalized_current_id}-thinking"),
        format!("{normalized_current_id}_thinking"),
        format!("{normalized_current_id}-reasoning"),
        format!("{normalized_current_id}_reasoning"),
    ];

    candidates.sort_by(|left, right| {
        let left_exact = exact_preferred_ids
            .iter()
            .any(|candidate| candidate == &normalize_identifier(&left.id));
        let right_exact = exact_preferred_ids
            .iter()
            .any(|candidate| candidate == &normalize_identifier(&right.id));
        left_exact
            .cmp(&right_exact)
            .reverse()
            .then(left.is_latest.cmp(&right.is_latest).reverse())
            .then(compare_release_date_desc(left, right).cmp(&0))
            .then(left.id.cmp(&right.id))
    });

    candidates
}

fn resolve_thinking_model_id(current_model_id: &str, models: &[EnhancedModelMetadata]) -> String {
    let current_model = find_model_meta(current_model_id, models);
    if model_has_reasoning_capability(current_model, current_model_id) {
        return current_model
            .map(|model| model.id.clone())
            .unwrap_or_else(|| current_model_id.to_string());
    }

    let current_base_key = normalize_base_model_key(current_model_id);
    let candidates = models
        .iter()
        .filter(|candidate| {
            model_has_reasoning_capability(Some(candidate), &candidate.id)
                && normalize_base_model_key(&candidate.id) == current_base_key
        })
        .collect::<Vec<_>>();
    sort_reasoning_candidates(candidates, current_model_id)
        .into_iter()
        .next()
        .map(|model| model.id.clone())
        .unwrap_or_else(|| current_model_id.to_string())
}

fn resolve_base_model_on_thinking_off(
    current_model_id: &str,
    models: &[EnhancedModelMetadata],
) -> String {
    let current_model = find_model_meta(current_model_id, models);
    if !model_has_reasoning_capability(current_model, current_model_id) {
        return current_model
            .map(|model| model.id.clone())
            .unwrap_or_else(|| current_model_id.to_string());
    }

    let current_base_key = normalize_base_model_key(current_model_id);
    let candidates = models
        .iter()
        .filter(|candidate| {
            !model_has_reasoning_capability(Some(candidate), &candidate.id)
                && normalize_base_model_key(&candidate.id) == current_base_key
        })
        .collect::<Vec<_>>();

    sort_reasoning_candidates(candidates, current_model_id)
        .into_iter()
        .next()
        .map(|model| model.id.clone())
        .unwrap_or_else(|| current_model_id.to_string())
}

fn normalize_model_lineage_key(model_id: &str) -> String {
    let normalized = normalize_identifier(model_id);
    let primary = normalized
        .split('/')
        .find(|part| !part.is_empty())
        .unwrap_or(normalized.as_str());

    let mut lineage = String::new();
    for ch in primary.chars() {
        if ch.is_ascii_alphabetic() {
            lineage.push(ch);
            continue;
        }
        if !lineage.is_empty() {
            break;
        }
    }

    if !lineage.is_empty() {
        return lineage;
    }

    primary
        .split(|ch| ['.', '_', '-'].contains(&ch))
        .find(|part| !part.is_empty())
        .unwrap_or(primary)
        .to_string()
}

fn is_likely_non_chat_model(model: &EnhancedModelMetadata) -> bool {
    let has_specialized_non_chat_family = model.task_families.iter().any(|family| {
        matches!(
            family,
            ModelTaskFamily::Embedding
                | ModelTaskFamily::Rerank
                | ModelTaskFamily::Moderation
                | ModelTaskFamily::SpeechToText
                | ModelTaskFamily::TextToSpeech
                | ModelTaskFamily::ImageGeneration
                | ModelTaskFamily::ImageEdit
        )
    });
    if has_specialized_non_chat_family
        && !model.supports_task_family(&ModelTaskFamily::Chat)
        && !model.supports_task_family(&ModelTaskFamily::Reasoning)
        && !model.supports_task_family(&ModelTaskFamily::VisionUnderstanding)
    {
        return true;
    }

    let text = [
        normalize_identifier(&model.id),
        normalize_identifier(&model.display_name),
        model
            .family
            .as_deref()
            .map(normalize_identifier)
            .unwrap_or_default(),
        model
            .description
            .as_deref()
            .map(normalize_identifier)
            .unwrap_or_default(),
    ]
    .join(" ");

    is_likely_image_generation_model(model)
        || text_contains_any(
            &text,
            &[
                "embedding",
                "embed",
                "rerank",
                "tts",
                "stt",
                "transcribe",
                "transcription",
                "speech",
                "audio",
                "moderation",
            ],
        )
}

fn resolve_catalog_fallback_model_id(
    current_model_id: &str,
    models: &[EnhancedModelMetadata],
    prefer_reasoning: bool,
    prefer_vision: bool,
    runtime_requirements: &[RuntimeModelCapabilityRequirement],
) -> String {
    if let Some(current_model) = find_model_meta(current_model_id, models) {
        if is_runtime_candidate_model(
            current_model,
            prefer_reasoning,
            prefer_vision,
            runtime_requirements,
        ) {
            return current_model.id.clone();
        }
    }

    let current_base_key = normalize_base_model_key(current_model_id);
    let current_lineage_key = normalize_model_lineage_key(current_model_id);
    let mut candidates = models
        .iter()
        .filter(|candidate| {
            is_runtime_candidate_model(
                candidate,
                prefer_reasoning,
                prefer_vision,
                runtime_requirements,
            )
        })
        .collect::<Vec<_>>();

    if targets_responsive_chat(runtime_requirements) {
        candidates.sort_by(|left, right| responsive_chat_model_sort(left, right));
        return candidates
            .into_iter()
            .next()
            .map(|candidate| candidate.id.clone())
            .unwrap_or_else(|| current_model_id.to_string());
    }

    candidates.sort_by(|left, right| {
        let left_same_base = normalize_base_model_key(&left.id) == current_base_key;
        let right_same_base = normalize_base_model_key(&right.id) == current_base_key;
        let left_same_lineage = !current_lineage_key.is_empty()
            && normalize_model_lineage_key(&left.id) == current_lineage_key;
        let right_same_lineage = !current_lineage_key.is_empty()
            && normalize_model_lineage_key(&right.id) == current_lineage_key;
        let left_reasoning_match =
            model_has_reasoning_capability(Some(left), &left.id) == prefer_reasoning;
        let right_reasoning_match =
            model_has_reasoning_capability(Some(right), &right.id) == prefer_reasoning;
        let left_vision_match = supports_vision(Some(left), &left.id) == prefer_vision;
        let right_vision_match = supports_vision(Some(right), &right.id) == prefer_vision;

        left_same_base
            .cmp(&right_same_base)
            .reverse()
            .then(left_same_lineage.cmp(&right_same_lineage).reverse())
            .then(left_reasoning_match.cmp(&right_reasoning_match).reverse())
            .then(left_vision_match.cmp(&right_vision_match).reverse())
            .then(
                capability_score(left)
                    .cmp(&capability_score(right))
                    .reverse(),
            )
            .then(left.is_latest.cmp(&right.is_latest).reverse())
            .then(
                tier_weight(&left.tier)
                    .cmp(&tier_weight(&right.tier))
                    .reverse(),
            )
            .then(compare_release_date_desc(left, right).cmp(&0))
            .then(left.id.cmp(&right.id))
    });

    candidates
        .into_iter()
        .next()
        .map(|candidate| candidate.id.clone())
        .unwrap_or_else(|| current_model_id.to_string())
}

fn is_likely_image_generation_model(model: &EnhancedModelMetadata) -> bool {
    let can_return_text =
        model.output_modalities.is_empty() || model.has_output_modality(&ModelModality::Text);
    if model.supports_task_family(&ModelTaskFamily::VisionUnderstanding) && can_return_text {
        return false;
    }

    if model.supports_task_family(&ModelTaskFamily::ImageGeneration)
        || model.supports_task_family(&ModelTaskFamily::ImageEdit)
        || model.has_output_modality(&ModelModality::Image)
    {
        return true;
    }

    let text = [
        normalize_identifier(&model.id),
        normalize_identifier(&model.display_name),
        model
            .family
            .as_deref()
            .map(normalize_identifier)
            .unwrap_or_default(),
        model
            .description
            .as_deref()
            .map(normalize_identifier)
            .unwrap_or_default(),
    ]
    .join(" ");

    text_contains_any(
        &text,
        &[
            "imagen",
            "dall-e",
            "dalle",
            "stable-diffusion",
            "stable diffusion",
            "sdxl",
            "sd3",
            "midjourney",
            "image generation",
            "image-generation",
            "image-gen",
            "image-preview",
            "flux",
        ],
    ) && !model.capabilities.tools
        && !model.capabilities.function_calling
        && !model.capabilities.json_mode
}

fn supports_vision(model: Option<&EnhancedModelMetadata>, fallback_model_id: &str) -> bool {
    if let Some(item) = model {
        if item.capabilities.vision
            || item.supports_task_family(&ModelTaskFamily::VisionUnderstanding)
            || item.has_input_modality(&ModelModality::Image)
        {
            return true;
        }

        return infer_vision_capability(
            &item.id,
            Some(&item.provider_id),
            item.family.as_deref(),
            item.description.as_deref(),
        );
    }

    infer_vision_capability(fallback_model_id, None, None, None)
}

fn capability_score(model: &EnhancedModelMetadata) -> u8 {
    let mut score = 0;
    if model.capabilities.tools {
        score += 5;
    }
    if model.capabilities.function_calling {
        score += 4;
    }
    if model.capabilities.json_mode {
        score += 3;
    }
    if model.capabilities.reasoning {
        score += 2;
    }
    if model.capabilities.streaming {
        score += 1;
    }
    score
}

fn estimated_cost_rank(cost_class: Option<&str>) -> u8 {
    match cost_class.map(normalize_identifier).as_deref() {
        Some("low") => 3,
        Some("medium") => 2,
        Some("high") => 1,
        _ => 0,
    }
}

fn choose_best_multi_candidate_model(
    current_model_id: &str,
    models: &[EnhancedModelMetadata],
    thinking_enabled: bool,
    has_images: bool,
    runtime_requirements: &[RuntimeModelCapabilityRequirement],
) -> Option<String> {
    let current_model = find_model_meta(current_model_id, models);
    let current_family = current_model
        .and_then(|model| model.family.as_deref())
        .map(normalize_identifier)
        .unwrap_or_else(|| normalize_model_lineage_key(current_model_id));
    let current_lineage = normalize_model_lineage_key(current_model_id);

    let mut candidates = models
        .iter()
        .filter(|candidate| {
            is_runtime_candidate_model(
                candidate,
                thinking_enabled,
                has_images,
                runtime_requirements,
            )
        })
        .collect::<Vec<_>>();

    if candidates.is_empty() {
        return None;
    }

    if targets_responsive_chat(runtime_requirements) {
        candidates.sort_by(|left, right| responsive_chat_model_sort(left, right));
        return candidates.first().map(|model| model.id.clone());
    }

    candidates.sort_by(|left, right| {
        let left_same_family = !current_family.is_empty()
            && left.family.as_deref().map(normalize_identifier) == Some(current_family.clone());
        let right_same_family = !current_family.is_empty()
            && right.family.as_deref().map(normalize_identifier) == Some(current_family.clone());
        let left_same_lineage =
            !current_lineage.is_empty() && normalize_model_lineage_key(&left.id) == current_lineage;
        let right_same_lineage = !current_lineage.is_empty()
            && normalize_model_lineage_key(&right.id) == current_lineage;
        let left_reasoning = model_has_reasoning_capability(Some(left), &left.id);
        let right_reasoning = model_has_reasoning_capability(Some(right), &right.id);
        let left_vision = supports_vision(Some(left), &left.id);
        let right_vision = supports_vision(Some(right), &right.id);
        let left_cost = estimated_cost_rank(estimate_cost_class(&left.id, Some(left)).as_deref());
        let right_cost =
            estimated_cost_rank(estimate_cost_class(&right.id, Some(right)).as_deref());

        left_same_family
            .cmp(&right_same_family)
            .reverse()
            .then(left_same_lineage.cmp(&right_same_lineage).reverse())
            .then(
                (left_reasoning == thinking_enabled)
                    .cmp(&(right_reasoning == thinking_enabled))
                    .reverse(),
            )
            .then(
                (left_vision == has_images)
                    .cmp(&(right_vision == has_images))
                    .reverse(),
            )
            .then(
                capability_score(left)
                    .cmp(&capability_score(right))
                    .reverse(),
            )
            .then(left_cost.cmp(&right_cost).reverse())
            .then(left.is_latest.cmp(&right.is_latest).reverse())
            .then(
                tier_weight(&left.tier)
                    .cmp(&tier_weight(&right.tier))
                    .reverse(),
            )
            .then(compare_release_date_desc(left, right).cmp(&0))
            .then(left.id.cmp(&right.id))
    });

    candidates.first().map(|model| model.id.clone())
}

fn is_provider_custom_model(context: &ProviderResolutionContext, model_id: &str) -> bool {
    let normalized_model_id = normalize_identifier(model_id);
    context
        .custom_models
        .iter()
        .any(|custom_model| normalize_identifier(custom_model) == normalized_model_id)
}

fn choose_configured_custom_model_candidate(
    context: &ProviderResolutionContext,
    current_model_id: &str,
    models: &[EnhancedModelMetadata],
    thinking_enabled: bool,
    has_images: bool,
    runtime_requirements: &[RuntimeModelCapabilityRequirement],
) -> Option<String> {
    let normalized_current_id = normalize_identifier(current_model_id);

    context.custom_models.iter().find_map(|model_id| {
        let normalized_model_id = normalize_identifier(model_id);
        if normalized_model_id.is_empty() || normalized_model_id == normalized_current_id {
            return None;
        }

        let model = find_model_meta(model_id, models);
        if configured_custom_model_matches_runtime_request(
            model_id,
            model,
            thinking_enabled,
            has_images,
            runtime_requirements,
        ) {
            Some(
                model
                    .map(|item| item.id.clone())
                    .unwrap_or_else(|| model_id.to_string()),
            )
        } else {
            None
        }
    })
}

fn configured_custom_model_matches_runtime_request(
    model_id: &str,
    model: Option<&EnhancedModelMetadata>,
    thinking_enabled: bool,
    has_images: bool,
    runtime_requirements: &[RuntimeModelCapabilityRequirement],
) -> bool {
    if let Some(model) = model {
        return is_runtime_candidate_model(
            model,
            thinking_enabled,
            has_images,
            runtime_requirements,
        );
    }

    if has_images && !supports_vision(None, model_id) {
        return false;
    }
    if thinking_enabled && !model_has_reasoning_capability(None, model_id) {
        return false;
    }

    runtime_requirements
        .iter()
        .all(|requirement| match requirement {
            RuntimeModelCapabilityRequirement::TextGeneration
            | RuntimeModelCapabilityRequirement::CheapSummary
            | RuntimeModelCapabilityRequirement::ResponsiveChat => true,
            RuntimeModelCapabilityRequirement::VisionInput => supports_vision(None, model_id),
            RuntimeModelCapabilityRequirement::BrowserReasoning => {
                model_has_reasoning_capability(None, model_id)
            }
            RuntimeModelCapabilityRequirement::ImageGeneration
            | RuntimeModelCapabilityRequirement::AudioTranscription
            | RuntimeModelCapabilityRequirement::VoiceGeneration
            | RuntimeModelCapabilityRequirement::StructuredDocumentGeneration => false,
        })
}

fn should_auto_reselect_multi_candidate_model(context: &ProviderResolutionContext) -> bool {
    !context.is_custom_provider && context.custom_models.is_empty()
}

fn provider_matches_permission_recovery_selector(
    context: &ProviderResolutionContext,
    provider_selector: &str,
) -> bool {
    let target = canonical_provider_selector(provider_selector);
    let provider_selector = canonical_provider_selector(&context.provider_selector);
    !context.is_custom_provider && provider_selector == target
}

fn choose_known_provider_permission_recovery_model(
    context: &ProviderResolutionContext,
    current_model_id: &str,
    models: &[EnhancedModelMetadata],
    thinking_enabled: bool,
    has_images: bool,
) -> Option<String> {
    let normalized_current_id = normalize_identifier(current_model_id);
    let candidate_id =
        PROVIDER_PERMISSION_RECOVERY_MODELS
            .iter()
            .find_map(|(provider_selector, model_id)| {
                provider_matches_permission_recovery_selector(context, provider_selector)
                    .then_some(*model_id)
            })?;

    if normalize_identifier(candidate_id) == normalized_current_id {
        return None;
    }

    let model = find_model_meta(candidate_id, models);
    if !configured_custom_model_matches_runtime_request(
        candidate_id,
        model,
        thinking_enabled,
        has_images,
        &[RuntimeModelCapabilityRequirement::TextGeneration],
    ) {
        return None;
    }

    Some(
        model
            .map(|item| item.id.clone())
            .unwrap_or_else(|| candidate_id.to_string()),
    )
}

fn choose_provider_permission_recovery_model(
    context: &ProviderResolutionContext,
    current_model_id: &str,
    models: &[EnhancedModelMetadata],
    thinking_enabled: bool,
    has_images: bool,
) -> Option<String> {
    if let Some(candidate) = choose_configured_custom_model_candidate(
        context,
        current_model_id,
        models,
        thinking_enabled,
        has_images,
        &[RuntimeModelCapabilityRequirement::TextGeneration],
    ) {
        return Some(candidate);
    }

    if let Some(candidate) = choose_known_provider_permission_recovery_model(
        context,
        current_model_id,
        models,
        thinking_enabled,
        has_images,
    ) {
        return Some(candidate);
    }

    if !context.is_custom_provider || !is_xiaomi_like_provider_context(context) {
        return None;
    }

    let normalized_current_id = normalize_identifier(current_model_id);
    let current_model = find_model_meta(current_model_id, models);
    let current_family = current_model
        .and_then(|model| model.family.as_deref())
        .map(normalize_identifier)
        .unwrap_or_else(|| normalize_model_lineage_key(current_model_id));
    let current_lineage = normalize_model_lineage_key(current_model_id);

    let mut candidates = models
        .iter()
        .filter(|candidate| normalize_identifier(&candidate.id) != normalized_current_id)
        .filter(|candidate| is_compatible_candidate_model(candidate, thinking_enabled, has_images))
        .filter(|candidate| !is_likely_non_chat_model(candidate))
        .collect::<Vec<_>>();

    if candidates.is_empty() {
        return None;
    }

    candidates.sort_by(|left, right| {
        let left_same_family = !current_family.is_empty()
            && left.family.as_deref().map(normalize_identifier) == Some(current_family.clone());
        let right_same_family = !current_family.is_empty()
            && right.family.as_deref().map(normalize_identifier) == Some(current_family.clone());
        let left_same_lineage =
            !current_lineage.is_empty() && normalize_model_lineage_key(&left.id) == current_lineage;
        let right_same_lineage = !current_lineage.is_empty()
            && normalize_model_lineage_key(&right.id) == current_lineage;
        let left_non_flash = !normalize_identifier(&left.id).contains("flash");
        let right_non_flash = !normalize_identifier(&right.id).contains("flash");
        let left_reasoning_match =
            model_has_reasoning_capability(Some(left), &left.id) == thinking_enabled;
        let right_reasoning_match =
            model_has_reasoning_capability(Some(right), &right.id) == thinking_enabled;
        let left_vision_match = supports_vision(Some(left), &left.id) == has_images;
        let right_vision_match = supports_vision(Some(right), &right.id) == has_images;

        left_same_family
            .cmp(&right_same_family)
            .reverse()
            .then(left_same_lineage.cmp(&right_same_lineage).reverse())
            .then(left_non_flash.cmp(&right_non_flash).reverse())
            .then(left_reasoning_match.cmp(&right_reasoning_match).reverse())
            .then(left_vision_match.cmp(&right_vision_match).reverse())
            .then(
                capability_score(left)
                    .cmp(&capability_score(right))
                    .reverse(),
            )
            .then(left.is_latest.cmp(&right.is_latest).reverse())
            .then(
                tier_weight(&left.tier)
                    .cmp(&tier_weight(&right.tier))
                    .reverse(),
            )
            .then(compare_release_date_desc(left, right).cmp(&0))
            .then(left.id.cmp(&right.id))
    });

    candidates.first().map(|candidate| candidate.id.clone())
}

fn tier_weight(tier: &ModelTier) -> u8 {
    match tier {
        ModelTier::Mini => 1,
        ModelTier::Pro => 2,
        ModelTier::Max => 3,
    }
}

fn resolve_vision_model_id(
    current_model_id: &str,
    models: &[EnhancedModelMetadata],
) -> Result<String, String> {
    let current_model = find_model_meta(current_model_id, models);
    if supports_vision(current_model, current_model_id)
        && !current_model
            .map(is_likely_image_generation_model)
            .unwrap_or(false)
    {
        return Ok(current_model
            .map(|model| model.id.clone())
            .unwrap_or_else(|| current_model_id.to_string()));
    }

    let current_family = current_model
        .and_then(|model| model.family.as_deref())
        .map(normalize_identifier)
        .unwrap_or_default();
    let mut candidates = models
        .iter()
        .filter(|candidate| {
            supports_vision(Some(candidate), &candidate.id)
                && !is_likely_image_generation_model(candidate)
        })
        .collect::<Vec<_>>();

    candidates.sort_by(|left, right| {
        let left_same_family = !current_family.is_empty()
            && left.family.as_deref().map(normalize_identifier) == Some(current_family.clone());
        let right_same_family = !current_family.is_empty()
            && right.family.as_deref().map(normalize_identifier) == Some(current_family.clone());

        left_same_family
            .cmp(&right_same_family)
            .reverse()
            .then(
                capability_score(left)
                    .cmp(&capability_score(right))
                    .reverse(),
            )
            .then(left.is_latest.cmp(&right.is_latest).reverse())
            .then(
                tier_weight(&left.tier)
                    .cmp(&tier_weight(&right.tier))
                    .reverse(),
            )
            .then(compare_release_date_desc(left, right).cmp(&0))
            .then(left.id.cmp(&right.id))
    });

    candidates
        .into_iter()
        .next()
        .map(|model| model.id.clone())
        .ok_or_else(|| {
            "当前 Provider 没有可用的多模态模型，请切换到支持多模态的 Provider 或模型后再发送图片"
                .to_string()
        })
}

fn resolve_provider_model_compatibility(
    context: &ProviderResolutionContext,
    model_id: &str,
) -> String {
    let normalized_provider = normalize_identifier(&context.compatibility_provider_key);
    let canonical_model = canonicalize_known_provider_model_id(context, model_id);
    let normalized_model = normalize_identifier(&canonical_model);

    if normalized_provider == "codex" && normalized_model == "gpt-5.3-codex" {
        return "gpt-5.2-codex".to_string();
    }

    canonical_model
}

fn extract_request_thinking_enabled(request: &AsterChatRequest) -> Option<bool> {
    request.thinking_enabled.or_else(|| {
        extract_harness_bool(
            request.metadata.as_ref(),
            &["thinking_enabled", "thinkingEnabled"],
        )
    })
}

async fn resolve_request_thinking_enabled(request: &AsterChatRequest) -> Result<bool, String> {
    if let Some(thinking_enabled) = extract_request_thinking_enabled(request) {
        return Ok(thinking_enabled);
    }

    Ok(resolve_session_recent_preferences(&request.session_id)
        .await?
        .map(|preferences| preferences.thinking)
        .unwrap_or(false))
}

fn push_unique_profile_trait(traits: &mut Vec<String>, value: &str) {
    let Some(value) = normalize_optional_text(Some(value.to_string())) else {
        return;
    };
    if !traits.iter().any(|existing| existing == &value) {
        traits.push(value);
    }
}

fn extract_metadata_text(
    object: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<String> {
    keys.iter().find_map(|key| {
        object
            .get(*key)
            .and_then(serde_json::Value::as_str)
            .and_then(|value| normalize_optional_text(Some(value.to_string())))
    })
}

fn extract_metadata_bool(
    object: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<bool> {
    keys.iter()
        .find_map(|key| object.get(*key).and_then(serde_json::Value::as_bool))
}

fn extract_turn_context_runtime(
    request_metadata: Option<&serde_json::Value>,
) -> Option<&serde_json::Map<String, serde_json::Value>> {
    request_metadata
        .and_then(serde_json::Value::as_object)
        .and_then(|root| root.get(LIME_RUNTIME_METADATA_KEY))
        .and_then(serde_json::Value::as_object)
        .and_then(|runtime| runtime.get("task_profile"))
        .and_then(serde_json::Value::as_object)
}

#[derive(Debug, Clone, Default)]
struct RuntimeTaskProfileBinding {
    modality_contract_key: Option<String>,
    routing_slot: Option<String>,
    execution_profile_key: Option<String>,
    executor_adapter_key: Option<String>,
    executor_kind: Option<String>,
    executor_binding_key: Option<String>,
    permission_profile_keys: Vec<String>,
    user_lock_policy: Option<String>,
}

fn extract_metadata_string_array(
    object: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Vec<String> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(serde_json::Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .filter_map(|value| normalize_optional_text(Some(value.to_string())))
                .collect()
        })
        .unwrap_or_default()
}

fn extract_nested_metadata_object<'a>(
    object: &'a serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<&'a serde_json::Map<String, serde_json::Value>> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(serde_json::Value::as_object)
}

fn extract_runtime_contract_from_metadata(
    request_metadata: Option<&serde_json::Value>,
) -> Option<&serde_json::Map<String, serde_json::Value>> {
    fn looks_like_runtime_contract(object: &serde_json::Map<String, serde_json::Value>) -> bool {
        [
            "contract_key",
            "contractKey",
            "execution_profile",
            "executionProfile",
            "executor_adapter",
            "executorAdapter",
            "executor_binding",
            "executorBinding",
        ]
        .iter()
        .any(|key| object.contains_key(*key))
    }

    fn find_runtime_contract(
        value: &serde_json::Value,
        depth: usize,
    ) -> Option<&serde_json::Map<String, serde_json::Value>> {
        if depth > 8 {
            return None;
        }
        let object = value.as_object()?;
        if looks_like_runtime_contract(object) {
            return Some(object);
        }
        for key in [
            "runtime_contract",
            "runtimeContract",
            "modality_runtime_contract",
            "modalityRuntimeContract",
        ] {
            if let Some(contract) = object
                .get(key)
                .and_then(|value| find_runtime_contract(value, depth + 1))
            {
                return Some(contract);
            }
        }
        object
            .values()
            .find_map(|value| find_runtime_contract(value, depth + 1))
    }

    find_runtime_contract(request_metadata?, 0)
}

fn lookup_execution_profile_record(
    profile_key: Option<&str>,
    contract_key: Option<&str>,
) -> Option<serde_json::Map<String, serde_json::Value>> {
    let registry: serde_json::Value =
        serde_json::from_str(MODALITY_EXECUTION_PROFILES_JSON).ok()?;
    let profiles = registry.get("profiles")?.as_array()?;
    profiles.iter().find_map(|profile| {
        let object = profile.as_object()?;
        let matches_profile_key = profile_key.is_some_and(|key| {
            extract_metadata_text(object, &["profile_key", "profileKey"]).as_deref() == Some(key)
        });
        let matches_contract_key = contract_key.is_some_and(|key| {
            extract_metadata_string_array(object, &["supported_contracts", "supportedContracts"])
                .iter()
                .any(|value| value == key)
        });
        (matches_profile_key || matches_contract_key).then(|| object.clone())
    })
}

fn runtime_task_profile_binding_from_metadata(
    request_metadata: Option<&serde_json::Value>,
) -> RuntimeTaskProfileBinding {
    let Some(contract) = extract_runtime_contract_from_metadata(request_metadata) else {
        return RuntimeTaskProfileBinding::default();
    };

    let execution_profile =
        extract_nested_metadata_object(contract, &["execution_profile", "executionProfile"]);
    let executor_adapter =
        extract_nested_metadata_object(contract, &["executor_adapter", "executorAdapter"]);
    let executor_binding =
        extract_nested_metadata_object(contract, &["executor_binding", "executorBinding"]);
    let modality_contract_key = extract_metadata_text(contract, &["contract_key", "contractKey"]);
    let execution_profile_key = execution_profile
        .and_then(|value| extract_metadata_text(value, &["profile_key", "profileKey"]));
    let profile_record = lookup_execution_profile_record(
        execution_profile_key.as_deref(),
        modality_contract_key.as_deref(),
    );
    let execution_profile_key = execution_profile_key.or_else(|| {
        profile_record
            .as_ref()
            .and_then(|value| extract_metadata_text(value, &["profile_key", "profileKey"]))
    });

    RuntimeTaskProfileBinding {
        modality_contract_key,
        routing_slot: extract_metadata_text(contract, &["routing_slot", "routingSlot"]),
        execution_profile_key,
        executor_adapter_key: executor_adapter
            .and_then(|value| extract_metadata_text(value, &["adapter_key", "adapterKey"])),
        executor_kind: executor_binding
            .and_then(|value| extract_metadata_text(value, &["executor_kind", "executorKind"])),
        executor_binding_key: executor_binding
            .and_then(|value| extract_metadata_text(value, &["binding_key", "bindingKey"])),
        permission_profile_keys: execution_profile
            .map(|value| {
                extract_metadata_string_array(
                    value,
                    &["permission_profile_keys", "permissionProfileKeys"],
                )
            })
            .filter(|values| !values.is_empty())
            .or_else(|| {
                profile_record.as_ref().map(|value| {
                    extract_metadata_string_array(
                        value,
                        &["permission_profile_keys", "permissionProfileKeys"],
                    )
                })
            })
            .unwrap_or_default(),
        user_lock_policy: execution_profile
            .and_then(|value| extract_metadata_text(value, &["user_lock_policy", "userLockPolicy"]))
            .or_else(|| {
                profile_record.as_ref().and_then(|value| {
                    extract_metadata_text(value, &["user_lock_policy", "userLockPolicy"])
                })
            }),
    }
}

fn build_runtime_task_profile_with_binding(
    kind: &str,
    source: &str,
    traits: Vec<String>,
    service_model_slot: Option<String>,
    scene_kind: Option<String>,
    scene_skill_id: Option<String>,
    entry_source: Option<String>,
    binding: &RuntimeTaskProfileBinding,
) -> lime_agent::SessionExecutionRuntimeTaskProfile {
    lime_agent::SessionExecutionRuntimeTaskProfile {
        kind: kind.to_string(),
        source: source.to_string(),
        traits,
        modality_contract_key: binding.modality_contract_key.clone(),
        routing_slot: binding.routing_slot.clone(),
        execution_profile_key: binding.execution_profile_key.clone(),
        executor_adapter_key: binding.executor_adapter_key.clone(),
        executor_kind: binding.executor_kind.clone(),
        executor_binding_key: binding.executor_binding_key.clone(),
        permission_profile_keys: binding.permission_profile_keys.clone(),
        user_lock_policy: binding.user_lock_policy.clone(),
        service_model_slot,
        scene_kind,
        scene_skill_id,
        entry_source,
    }
}

pub(crate) fn resolve_request_oem_routing_context(
    request_metadata: Option<&serde_json::Value>,
) -> Option<RequestOemRoutingContext> {
    let routing = extract_harness_nested_object(request_metadata, &["oem_routing", "oemRouting"])?;
    let tenant_id = extract_metadata_text(routing, &["tenant_id", "tenantId"])?;

    Some(RequestOemRoutingContext {
        tenant_id,
        provider_source: extract_metadata_text(routing, &["provider_source", "providerSource"]),
        provider_key: extract_metadata_text(routing, &["provider_key", "providerKey"]),
        default_model: extract_metadata_text(routing, &["default_model", "defaultModel"]),
        config_mode: extract_metadata_text(routing, &["config_mode", "configMode"]),
        offer_state: extract_metadata_text(routing, &["offer_state", "offerState"]),
        quota_status: extract_metadata_text(routing, &["quota_status", "quotaStatus"]),
        fallback_to_local_allowed: extract_metadata_bool(
            routing,
            &["fallback_to_local_allowed", "fallbackToLocalAllowed"],
        ),
        can_invoke: extract_metadata_bool(routing, &["can_invoke", "canInvoke"]),
    })
}

pub(crate) fn request_oem_routing_is_locked(context: Option<&RequestOemRoutingContext>) -> bool {
    context.is_some_and(|value| {
        matches!(value.config_mode.as_deref(), Some("managed"))
            || matches!(value.fallback_to_local_allowed, Some(false))
    })
}

fn build_request_oem_policy(
    context: Option<&RequestOemRoutingContext>,
) -> Option<lime_agent::SessionExecutionRuntimeOemPolicy> {
    let context = context?;
    Some(lime_agent::SessionExecutionRuntimeOemPolicy {
        tenant_id: context.tenant_id.clone(),
        provider_source: context.provider_source.clone(),
        provider_key: context.provider_key.clone(),
        default_model: context.default_model.clone(),
        config_mode: context.config_mode.clone(),
        offer_state: context.offer_state.clone(),
        quota_status: context.quota_status.clone(),
        fallback_to_local_allowed: context.fallback_to_local_allowed,
        can_invoke: context.can_invoke,
    })
}

fn build_runtime_summary(
    routing_decision: &lime_agent::SessionExecutionRuntimeRoutingDecision,
    limit_state: &lime_agent::SessionExecutionRuntimeLimitState,
    cost_state: &lime_agent::SessionExecutionRuntimeCostState,
    permission_state: &lime_agent::SessionExecutionRuntimePermissionState,
    limit_event: Option<&lime_agent::SessionExecutionRuntimeLimitEvent>,
) -> lime_agent::SessionExecutionRuntimeSummary {
    lime_agent::SessionExecutionRuntimeSummary {
        candidate_count: Some(routing_decision.candidate_count),
        routing_mode: Some(routing_decision.routing_mode.clone()),
        decision_source: Some(routing_decision.decision_source.clone()),
        decision_reason: Some(routing_decision.decision_reason.clone()),
        fallback_chain: routing_decision.fallback_chain.clone(),
        estimated_cost_class: routing_decision
            .estimated_cost_class
            .clone()
            .or_else(|| cost_state.estimated_cost_class.clone()),
        estimated_total_cost: cost_state.estimated_total_cost,
        limit_status: Some(limit_state.status.clone()),
        limit_event_kind: limit_event.map(|event| event.event_kind.clone()),
        limit_event_message: limit_event.map(|event| event.message.clone()),
        capability_gap: routing_decision
            .capability_gap
            .clone()
            .or_else(|| limit_state.capability_gap.clone()),
        single_candidate_only: Some(limit_state.single_candidate_only),
        oem_locked: Some(limit_state.oem_locked),
        quota_low: Some(matches!(
            limit_event.map(|event| event.event_kind.as_str()),
            Some("quota_low")
        )),
        permission_status: Some(permission_state.status.clone()),
        permission_ask_count: Some(permission_state.ask_profile_keys.len() as u32),
        permission_blocking_count: Some(permission_state.blocking_profile_keys.len() as u32),
    }
}

fn build_request_oem_limit_event(
    context: Option<&RequestOemRoutingContext>,
) -> Option<lime_agent::SessionExecutionRuntimeLimitEvent> {
    let context = context?;
    let quota_low = matches!(context.quota_status.as_deref(), Some("low"))
        || matches!(context.offer_state.as_deref(), Some("available_quota_low"));
    if !quota_low {
        return None;
    }

    let provider_label = context
        .provider_key
        .clone()
        .unwrap_or_else(|| "oem_cloud".to_string());
    Some(lime_agent::SessionExecutionRuntimeLimitEvent {
        event_kind: "quota_low".to_string(),
        message: format!(
            "OEM 云端 provider {provider_label} 当前额度偏低，后续请求可能触发配额风险。"
        ),
        retryable: true,
    })
}

fn resolve_request_service_model_slot(
    request_metadata: Option<&serde_json::Value>,
) -> Option<String> {
    if let Some(slot) = extract_turn_context_runtime(request_metadata)
        .and_then(|runtime| extract_metadata_text(runtime, &["service_model_slot"]))
    {
        return Some(slot);
    }

    if let Some(slot) = extract_fast_response_service_model_slot(request_metadata) {
        return Some(slot);
    }

    if extract_harness_nested_object(
        request_metadata,
        &["translation_skill_launch", "translationSkillLaunch"],
    )
    .is_some()
    {
        return Some("translation".to_string());
    }

    if extract_harness_nested_object(
        request_metadata,
        &["resource_search_skill_launch", "resourceSearchSkillLaunch"],
    )
    .is_some()
    {
        return Some("resource_prompt_rewrite".to_string());
    }

    if extract_harness_nested_object(
        request_metadata,
        &["topic_skill_launch", "topicSkillLaunch"],
    )
    .is_some()
    {
        return Some("topic".to_string());
    }

    if extract_harness_nested_object(
        request_metadata,
        &[
            "generation_topic_skill_launch",
            "generationTopicSkillLaunch",
        ],
    )
    .is_some()
    {
        return Some("generation_topic".to_string());
    }

    if extract_harness_nested_object(
        request_metadata,
        &["agent_meta_skill_launch", "agentMetaSkillLaunch"],
    )
    .is_some()
    {
        return Some("agent_meta".to_string());
    }

    if extract_harness_string(request_metadata, &["turn_purpose", "turnPurpose"])
        .as_deref()
        .is_some_and(is_prompt_rewrite_turn_purpose)
    {
        return Some("prompt_rewrite".to_string());
    }

    None
}

fn is_prompt_rewrite_turn_purpose(value: &str) -> bool {
    matches!(value, "style_rewrite" | "style_audit")
}

fn build_runtime_task_profile(
    request: &AsterChatRequest,
) -> lime_agent::SessionExecutionRuntimeTaskProfile {
    let request_metadata = request.metadata.as_ref();
    let service_model_slot = resolve_request_service_model_slot(request_metadata);
    let service_scene_context = extract_service_scene_launch_context(request_metadata);
    let request_oem_routing = resolve_request_oem_routing_context(request_metadata);
    let mut profile_binding = runtime_task_profile_binding_from_metadata(request_metadata);
    if profile_binding.routing_slot.is_none() {
        profile_binding.routing_slot = extract_fast_response_routing_slot(request_metadata);
    }
    let mut traits = Vec::new();

    if request
        .images
        .as_ref()
        .is_some_and(|images| !images.is_empty())
    {
        push_unique_profile_trait(&mut traits, "vision_input");
    }
    if extract_request_thinking_enabled(request).unwrap_or(false) {
        push_unique_profile_trait(&mut traits, "reasoning_requested");
    }
    if request.web_search.unwrap_or(false) || request.search_mode.is_some() {
        push_unique_profile_trait(&mut traits, "web_search_requested");
    }
    if extract_harness_bool(request_metadata, &["task_mode_enabled", "taskModeEnabled"])
        .unwrap_or(false)
    {
        push_unique_profile_trait(&mut traits, "task_mode_enabled");
    }
    if extract_harness_bool(
        request_metadata,
        &["subagent_mode_enabled", "subagentModeEnabled"],
    )
    .unwrap_or(false)
    {
        push_unique_profile_trait(&mut traits, "subagent_mode_enabled");
    }
    if service_model_slot.is_some() {
        push_unique_profile_trait(&mut traits, "service_model_slot");
    }
    if request_oem_routing.is_some() {
        push_unique_profile_trait(&mut traits, "oem_runtime");
    }
    if profile_binding.modality_contract_key.is_some() {
        push_unique_profile_trait(&mut traits, "modality_runtime_contract");
    }
    if extract_fast_response_routing(request_metadata).is_some() {
        push_unique_profile_trait(&mut traits, "fast_response_routing");
    }
    if profile_binding.execution_profile_key.is_some() {
        push_unique_profile_trait(&mut traits, "execution_profile");
    }
    if profile_binding.executor_adapter_key.is_some() {
        push_unique_profile_trait(&mut traits, "executor_adapter");
    }

    if let Some(context) = service_scene_context {
        push_unique_profile_trait(&mut traits, "service_scene_launch");
        if request_oem_routing.is_some()
            || context.oem_runtime.scene_base_url.is_some()
            || context.oem_runtime.session_token.is_some()
            || context.oem_runtime.tenant_id.is_some()
        {
            push_unique_profile_trait(&mut traits, "oem_runtime");
        }

        return build_runtime_task_profile_with_binding(
            "service_scene",
            "service_scene_launch",
            traits,
            service_model_slot,
            normalize_optional_text(Some(context.launch_kind)),
            normalize_optional_text(Some(context.service_skill_id)),
            context.entry_source,
            &profile_binding,
        );
    }

    if extract_harness_nested_object(
        request_metadata,
        &["translation_skill_launch", "translationSkillLaunch"],
    )
    .is_some()
    {
        return build_runtime_task_profile_with_binding(
            "translation",
            "translation_skill_launch",
            traits,
            service_model_slot,
            None,
            None,
            extract_harness_string(request_metadata, &["entry_source", "entrySource"]),
            &profile_binding,
        );
    }

    if extract_harness_nested_object(
        request_metadata,
        &["summary_skill_launch", "summarySkillLaunch"],
    )
    .is_some()
    {
        return build_runtime_task_profile_with_binding(
            "summary",
            "summary_skill_launch",
            traits,
            service_model_slot,
            None,
            None,
            extract_harness_string(request_metadata, &["entry_source", "entrySource"]),
            &profile_binding,
        );
    }

    if extract_harness_nested_object(
        request_metadata,
        &["resource_search_skill_launch", "resourceSearchSkillLaunch"],
    )
    .is_some()
    {
        return build_runtime_task_profile_with_binding(
            "resource_search",
            "resource_search_skill_launch",
            traits,
            service_model_slot,
            None,
            None,
            extract_harness_string(request_metadata, &["entry_source", "entrySource"]),
            &profile_binding,
        );
    }

    if extract_harness_nested_object(
        request_metadata,
        &["topic_skill_launch", "topicSkillLaunch"],
    )
    .is_some()
    {
        return build_runtime_task_profile_with_binding(
            "topic",
            "auxiliary_topic",
            traits,
            service_model_slot,
            None,
            None,
            extract_harness_string(request_metadata, &["entry_source", "entrySource"]),
            &profile_binding,
        );
    }

    if extract_harness_nested_object(
        request_metadata,
        &[
            "generation_topic_skill_launch",
            "generationTopicSkillLaunch",
        ],
    )
    .is_some()
    {
        return build_runtime_task_profile_with_binding(
            "generation_topic",
            "auxiliary_generation_topic",
            traits,
            service_model_slot,
            None,
            None,
            extract_harness_string(request_metadata, &["entry_source", "entrySource"]),
            &profile_binding,
        );
    }

    if extract_harness_nested_object(
        request_metadata,
        &["agent_meta_skill_launch", "agentMetaSkillLaunch"],
    )
    .is_some()
    {
        return build_runtime_task_profile_with_binding(
            "agent_meta",
            "auxiliary_agent_meta",
            traits,
            service_model_slot,
            None,
            None,
            extract_harness_string(request_metadata, &["entry_source", "entrySource"]),
            &profile_binding,
        );
    }

    if extract_harness_string(request_metadata, &["turn_purpose", "turnPurpose"])
        .as_deref()
        .is_some_and(is_prompt_rewrite_turn_purpose)
    {
        return build_runtime_task_profile_with_binding(
            "prompt_rewrite",
            "turn_purpose",
            traits,
            service_model_slot,
            None,
            None,
            None,
            &profile_binding,
        );
    }

    if extract_harness_nested_object(request_metadata, &["artifact"]).is_some() {
        return build_runtime_task_profile_with_binding(
            "artifact",
            "artifact_metadata",
            traits,
            service_model_slot,
            None,
            None,
            None,
            &profile_binding,
        );
    }

    if request
        .images
        .as_ref()
        .is_some_and(|images| !images.is_empty())
    {
        return build_runtime_task_profile_with_binding(
            "vision_chat",
            "request_images",
            traits,
            service_model_slot,
            None,
            None,
            None,
            &profile_binding,
        );
    }

    if request.web_search.unwrap_or(false) || request.search_mode.is_some() {
        return build_runtime_task_profile_with_binding(
            "search",
            "request_search",
            traits,
            service_model_slot,
            None,
            None,
            None,
            &profile_binding,
        );
    }

    if extract_harness_bool(request_metadata, &["task_mode_enabled", "taskModeEnabled"])
        .unwrap_or(false)
    {
        return build_runtime_task_profile_with_binding(
            "task",
            "task_mode",
            traits,
            service_model_slot,
            None,
            None,
            None,
            &profile_binding,
        );
    }

    if extract_fast_response_routing(request_metadata).is_some() {
        return build_runtime_task_profile_with_binding(
            "chat",
            "fast_response_routing",
            traits,
            service_model_slot,
            None,
            None,
            None,
            &profile_binding,
        );
    }

    build_runtime_task_profile_with_binding(
        "chat",
        "default_chat",
        traits,
        service_model_slot,
        None,
        None,
        None,
        &profile_binding,
    )
}

fn estimate_cost_class(
    model_id: &str,
    model_meta: Option<&EnhancedModelMetadata>,
) -> Option<String> {
    if let Some(model_meta) = model_meta {
        return Some(
            match model_meta.tier {
                ModelTier::Mini => "low",
                ModelTier::Pro => "medium",
                ModelTier::Max => "high",
            }
            .to_string(),
        );
    }

    let normalized = normalize_identifier(model_id);
    if normalized.contains("mini")
        || normalized.contains("haiku")
        || normalized.contains("flash")
        || normalized.contains("nano")
        || normalized.contains("small")
    {
        return Some("low".to_string());
    }
    if normalized.contains("opus")
        || normalized.contains("max")
        || normalized.contains("ultra")
        || normalized.contains("pro")
    {
        return Some("high".to_string());
    }

    Some("medium".to_string())
}

fn is_compatible_candidate_model(
    model: &EnhancedModelMetadata,
    thinking_enabled: bool,
    has_images: bool,
) -> bool {
    let supports_chat =
        model.task_families.is_empty() || model.task_families.contains(&ModelTaskFamily::Chat);
    let supports_reasoning =
        model.capabilities.reasoning || model.task_families.contains(&ModelTaskFamily::Reasoning);
    let has_vision_input = supports_vision(Some(model), &model.id);

    if has_images && !has_vision_input {
        return false;
    }
    if thinking_enabled && !supports_reasoning {
        return false;
    }

    supports_chat || (has_images && has_vision_input)
}

fn routing_slot_model_capability_requirements(
    routing_slot: Option<&str>,
) -> Vec<RuntimeModelCapabilityRequirement> {
    match routing_slot.map(normalize_identifier).as_deref() {
        Some("vision_input_model") => vec![RuntimeModelCapabilityRequirement::VisionInput],
        Some("image_generation_model") => vec![
            RuntimeModelCapabilityRequirement::ImageGeneration,
            RuntimeModelCapabilityRequirement::VisionInput,
        ],
        Some("image_edit_model") => vec![
            RuntimeModelCapabilityRequirement::ImageGeneration,
            RuntimeModelCapabilityRequirement::VisionInput,
        ],
        Some("audio_transcription_model") => {
            vec![RuntimeModelCapabilityRequirement::AudioTranscription]
        }
        Some("voice_generation_model") => vec![RuntimeModelCapabilityRequirement::VoiceGeneration],
        Some("browser_reasoning_model") => {
            vec![RuntimeModelCapabilityRequirement::BrowserReasoning]
        }
        Some("report_generation_model") => {
            vec![RuntimeModelCapabilityRequirement::StructuredDocumentGeneration]
        }
        Some("cheap_summary_model") => vec![RuntimeModelCapabilityRequirement::CheapSummary],
        Some("responsive_chat_model") => vec![RuntimeModelCapabilityRequirement::ResponsiveChat],
        Some("base_model") | None => vec![RuntimeModelCapabilityRequirement::TextGeneration],
        Some(_) => Vec::new(),
    }
}

fn model_satisfies_runtime_capability_requirement(
    model: &EnhancedModelMetadata,
    requirement: RuntimeModelCapabilityRequirement,
) -> bool {
    match requirement {
        RuntimeModelCapabilityRequirement::TextGeneration => {
            model.task_families.is_empty() || model.task_families.contains(&ModelTaskFamily::Chat)
        }
        RuntimeModelCapabilityRequirement::VisionInput => supports_vision(Some(model), &model.id),
        RuntimeModelCapabilityRequirement::ImageGeneration => model
            .task_families
            .contains(&ModelTaskFamily::ImageGeneration),
        RuntimeModelCapabilityRequirement::AudioTranscription => {
            model.task_families.contains(&ModelTaskFamily::SpeechToText)
        }
        RuntimeModelCapabilityRequirement::VoiceGeneration => {
            model.task_families.contains(&ModelTaskFamily::TextToSpeech)
        }
        RuntimeModelCapabilityRequirement::BrowserReasoning => {
            model.capabilities.reasoning
                || model.task_families.contains(&ModelTaskFamily::Reasoning)
        }
        RuntimeModelCapabilityRequirement::StructuredDocumentGeneration => {
            model.capabilities.json_mode
                && (model.task_families.is_empty()
                    || model.task_families.contains(&ModelTaskFamily::Chat))
        }
        RuntimeModelCapabilityRequirement::CheapSummary => {
            model.task_families.is_empty()
                || model.task_families.contains(&ModelTaskFamily::Chat)
                || model.task_families.contains(&ModelTaskFamily::Reasoning)
        }
        RuntimeModelCapabilityRequirement::ResponsiveChat => {
            model.task_families.is_empty() || model.task_families.contains(&ModelTaskFamily::Chat)
        }
    }
}

fn missing_runtime_model_capability_requirements(
    model: &EnhancedModelMetadata,
    requirements: &[RuntimeModelCapabilityRequirement],
) -> Vec<RuntimeModelCapabilityRequirement> {
    requirements
        .iter()
        .copied()
        .filter(|requirement| !model_satisfies_runtime_capability_requirement(model, *requirement))
        .collect()
}

fn runtime_requirements_target_specialized_model(
    requirements: &[RuntimeModelCapabilityRequirement],
) -> bool {
    requirements.iter().any(|requirement| {
        matches!(
            requirement,
            RuntimeModelCapabilityRequirement::ImageGeneration
                | RuntimeModelCapabilityRequirement::AudioTranscription
                | RuntimeModelCapabilityRequirement::VoiceGeneration
        )
    })
}

fn is_runtime_candidate_model(
    model: &EnhancedModelMetadata,
    thinking_enabled: bool,
    has_images: bool,
    runtime_requirements: &[RuntimeModelCapabilityRequirement],
) -> bool {
    if !missing_runtime_model_capability_requirements(model, runtime_requirements).is_empty() {
        return false;
    }

    if runtime_requirements_target_specialized_model(runtime_requirements) {
        return true;
    }

    is_compatible_candidate_model(model, thinking_enabled, has_images)
        && !is_likely_non_chat_model(model)
}

fn runtime_model_capability_gap_for_model(
    model: Option<&EnhancedModelMetadata>,
    requirements: &[RuntimeModelCapabilityRequirement],
) -> Option<String> {
    model.and_then(|model| {
        missing_runtime_model_capability_requirements(model, requirements)
            .first()
            .map(|requirement| requirement.gap_code().to_string())
    })
}

fn honors_explicit_model_lock_with_capability_check(
    task_profile: &lime_agent::SessionExecutionRuntimeTaskProfile,
    model_preference_source: RequestPreferenceSource,
) -> bool {
    matches!(
        task_profile.user_lock_policy.as_deref(),
        Some("honor_explicit_model_lock_with_capability_check")
    ) && matches!(model_preference_source, RequestPreferenceSource::Request)
}

fn should_allow_cross_provider_runtime_fallback(
    provider_preference_source: RequestPreferenceSource,
    model_preference_source: RequestPreferenceSource,
) -> bool {
    !matches!(provider_preference_source, RequestPreferenceSource::Request)
        && !matches!(model_preference_source, RequestPreferenceSource::Request)
}

fn should_reselect_for_runtime_capability_gap(
    resolved_model: Option<&EnhancedModelMetadata>,
    compatible_candidate_count: u32,
    runtime_requirements: &[RuntimeModelCapabilityRequirement],
    honor_explicit_model_lock: bool,
) -> bool {
    !honor_explicit_model_lock
        && compatible_candidate_count > 0
        && runtime_model_capability_gap_for_model(resolved_model, runtime_requirements).is_some()
}

fn runtime_model_capability_gap_for_catalog(
    catalog: &[EnhancedModelMetadata],
    requirements: &[RuntimeModelCapabilityRequirement],
) -> Option<String> {
    requirements
        .iter()
        .copied()
        .find(|requirement| {
            !catalog
                .iter()
                .any(|model| model_satisfies_runtime_capability_requirement(model, *requirement))
        })
        .map(|requirement| requirement.gap_code().to_string())
}

fn count_compatible_candidate_models(
    catalog: &[EnhancedModelMetadata],
    thinking_enabled: bool,
    has_images: bool,
    runtime_requirements: &[RuntimeModelCapabilityRequirement],
) -> u32 {
    catalog
        .iter()
        .filter(|model| {
            is_runtime_candidate_model(model, thinking_enabled, has_images, runtime_requirements)
        })
        .count() as u32
}

fn build_limit_state(
    status: &str,
    candidate_count: u32,
    provider_locked: bool,
    settings_locked: bool,
    oem_locked: bool,
    capability_gap: Option<String>,
    notes: Vec<String>,
) -> lime_agent::SessionExecutionRuntimeLimitState {
    let mut notes = notes;
    if oem_locked
        && !notes
            .iter()
            .any(|value| value.contains("OEM") || value.contains("oem"))
    {
        notes.push("当前回合受 OEM 路由约束，自动策略仅会在 OEM 允许范围内工作。".to_string());
    }
    lime_agent::SessionExecutionRuntimeLimitState {
        status: status.to_string(),
        single_candidate_only: candidate_count <= 1,
        provider_locked,
        settings_locked,
        oem_locked,
        candidate_count,
        capability_gap,
        notes,
    }
}

fn runtime_limit_status_for_selection(
    selection: &ResolvedRuntimeProviderSelection,
) -> &'static str {
    if selection.capability_gap.is_some()
        && selection.capability_gap_source.as_deref() == Some("explicit_model_lock")
    {
        "user_locked_capability_gap"
    } else if selection.candidate_count <= 1 {
        "single_candidate_only"
    } else {
        "normal"
    }
}

fn build_cost_state(
    selection: Option<&ResolvedRuntimeProviderSelection>,
    fallback_cost_class: Option<String>,
    status: &str,
) -> lime_agent::SessionExecutionRuntimeCostState {
    let pricing = selection.and_then(|value| value.pricing.as_ref());

    lime_agent::SessionExecutionRuntimeCostState {
        status: status.to_string(),
        estimated_cost_class: selection
            .and_then(|value| value.estimated_cost_class.clone())
            .or(fallback_cost_class),
        input_per_million: pricing.and_then(|value| value.input_per_million),
        output_per_million: pricing.and_then(|value| value.output_per_million),
        cache_read_per_million: pricing.and_then(|value| value.cache_read_per_million),
        cache_write_per_million: pricing.and_then(|value| value.cache_write_per_million),
        currency: pricing.map(|value| value.currency.clone()),
        estimated_total_cost: None,
        input_tokens: None,
        output_tokens: None,
        total_tokens: None,
        cached_input_tokens: None,
        cache_creation_input_tokens: None,
    }
}

fn runtime_permission_profile_requires_confirmation(profile_key: &str) -> bool {
    matches!(
        profile_key,
        "browser_control"
            | "media_upload"
            | "service_api_call"
            | "read_files"
            | "write_artifacts"
            | "web_search"
    )
}

fn normalize_runtime_permission_profile_keys(values: &[String]) -> Vec<String> {
    let mut normalized = Vec::new();
    for value in values {
        let Some(value) = normalize_optional_text(Some(value.clone())) else {
            continue;
        };
        if !normalized.iter().any(|existing| existing == &value) {
            normalized.push(value);
        }
    }
    normalized
}

fn resolve_runtime_request_access_mode(
    request: &AsterChatRequest,
) -> Option<lime_agent::SessionExecutionRuntimeAccessMode> {
    lime_agent::SessionExecutionRuntimeAccessMode::from_runtime_policies(
        request.approval_policy.as_deref(),
        request.sandbox_policy.as_deref(),
    )
    .or_else(|| {
        let access_mode =
            extract_harness_string(request.metadata.as_ref(), &["access_mode", "accessMode"]);
        lime_agent::SessionExecutionRuntimeAccessMode::from_access_mode_text(access_mode.as_deref())
    })
}

fn build_permission_state(
    task_profile: &lime_agent::SessionExecutionRuntimeTaskProfile,
    access_mode: Option<lime_agent::SessionExecutionRuntimeAccessMode>,
) -> lime_agent::SessionExecutionRuntimePermissionState {
    let required_profile_keys =
        normalize_runtime_permission_profile_keys(&task_profile.permission_profile_keys);
    let mut ask_profile_keys = required_profile_keys
        .iter()
        .filter(|profile_key| runtime_permission_profile_requires_confirmation(profile_key))
        .cloned()
        .collect::<Vec<_>>();
    let preauthorized_by_full_access = matches!(
        access_mode,
        Some(lime_agent::SessionExecutionRuntimeAccessMode::FullAccess)
    ) && !ask_profile_keys.is_empty();
    let status = if required_profile_keys.is_empty() {
        "not_required"
    } else if ask_profile_keys.is_empty() || preauthorized_by_full_access {
        "declared_only"
    } else {
        "requires_confirmation"
    };
    if preauthorized_by_full_access {
        ask_profile_keys.clear();
    }
    let mut notes = Vec::new();
    if required_profile_keys.is_empty() {
        notes.push("当前 task profile 未声明 permissionProfileKeys。".to_string());
    } else if preauthorized_by_full_access {
        notes.push(
            "当前请求访问模式为 full-access（never + danger-full-access），风险权限声明已由本轮显式授权覆盖，不再创建二次确认。"
                .to_string(),
        );
    } else {
        notes.push(
            "permissionProfileKeys 已进入运行时判定摘要；需确认权限会在模型执行前阻断，直到真实确认 resolved。"
                .to_string(),
        );
    }
    if required_profile_keys
        .iter()
        .any(|profile_key| profile_key == "ask_user_question")
    {
        notes.push("ask_user_question 表示运行时可向用户补问，不视为风险权限。".to_string());
    }

    lime_agent::SessionExecutionRuntimePermissionState {
        status: status.to_string(),
        required_profile_keys,
        ask_profile_keys,
        blocking_profile_keys: Vec::new(),
        decision_source: "execution_profile_registry".to_string(),
        decision_scope: if preauthorized_by_full_access {
            "declared_permission_profiles_resolved_by_full_access".to_string()
        } else {
            "declared_permission_profiles_only".to_string()
        },
        confirmation_status: Some(
            if preauthorized_by_full_access {
                "resolved"
            } else {
                "not_requested"
            }
            .to_string(),
        ),
        confirmation_request_id: None,
        confirmation_source: Some(
            if preauthorized_by_full_access {
                "access_mode_full_access"
            } else {
                "declared_profile_only"
            }
            .to_string(),
        ),
        notes,
    }
}

fn build_routing_decision(
    task_profile: &lime_agent::SessionExecutionRuntimeTaskProfile,
    decision_source: &str,
    decision_reason: String,
    selection: Option<&ResolvedRuntimeProviderSelection>,
    requested_provider: Option<String>,
    requested_model: Option<String>,
    settings_source: Option<String>,
) -> lime_agent::SessionExecutionRuntimeRoutingDecision {
    let candidate_count = selection.map(|value| value.candidate_count).unwrap_or(0);
    let routing_mode = if candidate_count == 0 {
        "no_candidate"
    } else if candidate_count <= 1 {
        "single_candidate"
    } else {
        "multi_candidate"
    };

    lime_agent::SessionExecutionRuntimeRoutingDecision {
        routing_mode: routing_mode.to_string(),
        decision_source: decision_source.to_string(),
        decision_reason,
        selected_provider: selection.map(|value| value.provider_selector.clone()),
        selected_model: selection.map(|value| value.resolved_model.clone()),
        requested_provider,
        requested_model: requested_model
            .or_else(|| selection.map(|value| value.requested_model.clone())),
        candidate_count,
        estimated_cost_class: selection.and_then(|value| value.estimated_cost_class.clone()),
        capability_gap: selection.and_then(|value| value.capability_gap.clone()),
        fallback_chain: selection
            .map(|value| value.fallback_chain.clone())
            .unwrap_or_default(),
        settings_source,
        service_model_slot: task_profile.service_model_slot.clone(),
    }
}

fn compose_routing_decision_reason(
    base_reason: impl Into<String>,
    selection: Option<&ResolvedRuntimeProviderSelection>,
    oem_locked: bool,
    fallback_note: Option<&str>,
) -> String {
    let mut parts = vec![base_reason.into()];

    if let Some(selection) = selection {
        if selection.candidate_count > 1 {
            parts.push(format!(
                "当前 provider 候选池共有 {} 个兼容候选，已按连续性、能力与成本优选。",
                selection.candidate_count
            ));
        }
        if selection.fallback_chain.len() >= 2 {
            parts.push(format!(
                "回退链为 {}。",
                selection.fallback_chain.join(" -> ")
            ));
        }
        if let Some(gap) = selection.capability_gap.as_deref() {
            parts.push(format!("当前仍存在能力提示：{gap}。"));
        }
    }

    if oem_locked {
        parts.push("当前回合受 OEM 托管约束，自动策略不会越出 OEM 允许范围。".to_string());
    }

    if let Some(note) = fallback_note.map(str::trim).filter(|note| !note.is_empty()) {
        parts.push(note.to_string());
    }

    parts.join(" ")
}

fn build_no_candidate_resolution(
    task_profile: lime_agent::SessionExecutionRuntimeTaskProfile,
    access_mode: Option<lime_agent::SessionExecutionRuntimeAccessMode>,
    decision_source: &str,
    decision_reason: String,
    oem_locked: bool,
    limit_event: Option<lime_agent::SessionExecutionRuntimeLimitEvent>,
    oem_policy: Option<lime_agent::SessionExecutionRuntimeOemPolicy>,
) -> RuntimeRequestProviderResolution {
    let capability_gap = if task_profile.kind == "vision_chat" {
        Some("vision_candidate_missing".to_string())
    } else {
        None
    };
    let limit_state = build_limit_state(
        "no_candidate",
        0,
        false,
        false,
        oem_locked,
        capability_gap.clone(),
        vec!["当前请求没有可恢复的 provider/model 默认值".to_string()],
    );
    let routing_decision = build_routing_decision(
        &task_profile,
        decision_source,
        decision_reason,
        None,
        None,
        None,
        None,
    );
    let cost_state = build_cost_state(None, None, "unavailable");
    let permission_state = build_permission_state(&task_profile, access_mode);
    let runtime_summary = build_runtime_summary(
        &routing_decision,
        &limit_state,
        &cost_state,
        &permission_state,
        limit_event.as_ref(),
    );

    RuntimeRequestProviderResolution {
        provider_config: None,
        task_profile,
        routing_decision,
        limit_state,
        cost_state,
        permission_state,
        limit_event,
        oem_policy,
        runtime_summary,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RequestPreferenceSource {
    Request,
    ServiceSceneLaunch,
    Session,
    ServiceModelSetting,
    FastResponseFallback,
    ResponsiveChatAuto,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct SessionProviderModelContext {
    provider_selector: Option<String>,
    provider_name: Option<String>,
    model_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ServiceSceneModelPreferenceContext {
    provider_selector: String,
    model_name: String,
    allow_fallback: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ServiceModelSettingPreferenceContext {
    provider_selector: String,
    model_name: String,
    settings_source: String,
    service_model_slot: String,
}

impl SessionProviderModelContext {
    fn from_session(session: &aster::session::Session) -> Self {
        Self {
            provider_selector: resolve_session_provider_selector(session),
            provider_name: normalize_optional_text(session.provider_name.clone()),
            model_name: session
                .model_config
                .as_ref()
                .and_then(|config| normalize_optional_text(Some(config.model_name.clone()))),
        }
    }
}

fn resolve_service_scene_model_preference(
    request_metadata: Option<&serde_json::Value>,
) -> Option<ServiceSceneModelPreferenceContext> {
    let context = extract_service_scene_launch_context(request_metadata)?;
    let provider_selector = normalize_optional_text(context.preferred_provider_id)?;
    let model_name = normalize_optional_text(context.preferred_model_id)?;

    Some(ServiceSceneModelPreferenceContext {
        provider_selector,
        model_name,
        allow_fallback: context.allow_fallback.unwrap_or(true),
    })
}

fn resolve_service_model_setting_preference(
    app: &AppHandle,
    task_profile: &lime_agent::SessionExecutionRuntimeTaskProfile,
) -> Option<ServiceModelSettingPreferenceContext> {
    let slot = task_profile.service_model_slot.as_deref()?;
    let config_manager = app.try_state::<GlobalConfigManagerState>()?;
    let config = config_manager.config();
    let preference = match slot {
        "history_compress" => &config.workspace_preferences.service_models.history_compress,
        "prompt_rewrite" => &config.workspace_preferences.service_models.prompt_rewrite,
        "resource_prompt_rewrite" => {
            &config
                .workspace_preferences
                .service_models
                .resource_prompt_rewrite
        }
        "responsive_chat" => &config.workspace_preferences.service_models.responsive_chat,
        "translation" => &config.workspace_preferences.service_models.translation,
        _ => return None,
    };

    if !preference.enabled {
        return None;
    }

    Some(ServiceModelSettingPreferenceContext {
        provider_selector: normalize_optional_text(preference.preferred_provider_id.clone())?,
        model_name: normalize_optional_text(preference.preferred_model_id.clone())?,
        settings_source: format!("service_models.{slot}"),
        service_model_slot: slot.to_string(),
    })
}

fn resolve_provider_preference_with_session_fallback(
    requested_provider_preference: Option<String>,
    session_context: Option<&SessionProviderModelContext>,
) -> Option<(String, RequestPreferenceSource)> {
    if let Some(provider_preference) = normalize_optional_text(requested_provider_preference) {
        return Some((provider_preference, RequestPreferenceSource::Request));
    }

    session_context
        .and_then(|context| {
            context
                .provider_selector
                .clone()
                .or_else(|| context.provider_name.clone())
        })
        .map(|provider_selector| (provider_selector, RequestPreferenceSource::Session))
}

fn resolve_model_preference_with_session_fallback(
    requested_model_preference: Option<String>,
    requested_provider_selector: &str,
    session_context: Option<&SessionProviderModelContext>,
) -> Result<(String, RequestPreferenceSource), String> {
    if let Some(model_preference) = normalize_optional_text(requested_model_preference) {
        return Ok((model_preference, RequestPreferenceSource::Request));
    }

    let normalized_requested_provider = normalize_identifier(requested_provider_selector);
    let session_provider_matches = session_context
        .into_iter()
        .flat_map(|context| {
            [
                context.provider_selector.as_deref(),
                context.provider_name.as_deref(),
            ]
        })
        .flatten()
        .any(|candidate| normalize_identifier(candidate) == normalized_requested_provider);
    if !session_provider_matches {
        return Err("model_preference 不能为空；切换 provider 时必须显式提供模型".to_string());
    }

    let Some(session_model_name) = session_context
        .and_then(|context| context.model_name.clone())
        .and_then(|value| normalize_optional_text(Some(value)))
    else {
        return Err("model_preference 不能为空；当前会话尚未持久化模型".to_string());
    };

    Ok((session_model_name, RequestPreferenceSource::Session))
}

async fn load_session_provider_model_context(
    request: &AsterChatRequest,
) -> Result<SessionProviderModelContext, String> {
    let session = read_session(
        &request.session_id,
        false,
        "读取会话 provider/model 上下文失败",
    )
    .await?;
    Ok(SessionProviderModelContext::from_session(&session))
}

async fn build_runtime_request_provider_config_from_preference(
    app: &AppHandle,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    request: &AsterChatRequest,
    task_profile: &lime_agent::SessionExecutionRuntimeTaskProfile,
    provider_selector: &str,
    model_preference: &str,
    model_preference_source: RequestPreferenceSource,
    allow_runtime_fallback: bool,
) -> Result<ResolvedRuntimeProviderSelection, String> {
    let context =
        build_provider_resolution_context(db, api_key_provider_service, provider_selector)?;
    let (catalog, _alias_config) = load_model_registry_catalog(app, &context).await;
    let normalized_model_preference =
        canonicalize_known_provider_model_id(&context, model_preference);
    let thinking_enabled = resolve_request_thinking_enabled(request).await?;
    let has_images = request
        .images
        .as_ref()
        .map(|images| !images.is_empty())
        .unwrap_or(false);
    let runtime_requirements =
        routing_slot_model_capability_requirements(task_profile.routing_slot.as_deref());
    let responsive_chat_routing = targets_responsive_chat(&runtime_requirements);
    let compatible_candidate_count = count_compatible_candidate_models(
        &catalog,
        thinking_enabled,
        has_images,
        &runtime_requirements,
    );
    let honor_explicit_model_lock =
        honors_explicit_model_lock_with_capability_check(task_profile, model_preference_source);
    let reasoning_gap = thinking_enabled
        && !catalog.iter().any(|model| {
            model.capabilities.reasoning
                || model.task_families.contains(&ModelTaskFamily::Reasoning)
        });
    let vision_gap = has_images
        && !catalog
            .iter()
            .any(|model| supports_vision(Some(model), &model.id));

    let mut resolved_model = if thinking_enabled {
        resolve_thinking_model_id(&normalized_model_preference, &catalog)
    } else {
        resolve_base_model_on_thinking_off(&normalized_model_preference, &catalog)
    };
    let mut fallback_chain = Vec::new();
    if !context.custom_models.is_empty() && !is_provider_custom_model(&context, &resolved_model) {
        if let Some(configured_model) = choose_configured_custom_model_candidate(
            &context,
            &resolved_model,
            &catalog,
            thinking_enabled,
            has_images,
            &runtime_requirements,
        ) {
            tracing::info!(
                "[AsterAgent] 当前模型不在 Provider 已配置模型内，自动回落到配置模型: session={}, source={:?}, provider={}, stale_model={}, fallback_model={}",
                request.session_id,
                model_preference_source,
                context.provider_selector,
                resolved_model,
                configured_model
            );
            fallback_chain.push(format!("{}:{}", context.provider_selector, resolved_model));
            resolved_model = configured_model;
            fallback_chain.push(format!("{}:{}", context.provider_selector, resolved_model));
        }
    }
    let should_reselect_runtime_gap = should_reselect_for_runtime_capability_gap(
        find_model_meta(&resolved_model, &catalog),
        compatible_candidate_count,
        &runtime_requirements,
        honor_explicit_model_lock,
    );
    if !honor_explicit_model_lock
        && (should_auto_reselect_multi_candidate_model(&context) || responsive_chat_routing)
        && (compatible_candidate_count > 1 || should_reselect_runtime_gap)
    {
        if let Some(best_candidate) = choose_best_multi_candidate_model(
            &resolved_model,
            &catalog,
            thinking_enabled,
            has_images,
            &runtime_requirements,
        ) {
            if best_candidate != resolved_model {
                fallback_chain.push(format!("{}:{}", context.provider_selector, resolved_model));
                resolved_model = best_candidate;
                fallback_chain.push(format!("{}:{}", context.provider_selector, resolved_model));
            }
        }
    }

    let should_fallback_unknown_model = allow_runtime_fallback
        && !context.is_custom_provider
        && context.custom_models.is_empty()
        && find_model_meta(&resolved_model, &catalog).is_none();
    if should_fallback_unknown_model {
        let fallback_model = resolve_catalog_fallback_model_id(
            &resolved_model,
            &catalog,
            thinking_enabled,
            has_images,
            &runtime_requirements,
        );
        if fallback_model != resolved_model {
            tracing::info!(
                "[AsterAgent] 偏好模型已失效，自动回落到当前可用模型: session={}, source={:?}, provider={}, stale_model={}, fallback_model={}",
                request.session_id,
                model_preference_source,
                context.provider_selector,
                resolved_model,
                fallback_model
            );
            fallback_chain.push(format!("{}:{}", context.provider_selector, resolved_model));
            resolved_model = fallback_model;
            fallback_chain.push(format!("{}:{}", context.provider_selector, resolved_model));
        }
    }
    resolved_model = resolve_provider_model_compatibility(&context, &resolved_model);
    if has_images {
        resolved_model = resolve_vision_model_id(&resolved_model, &catalog)?;
    }

    if resolved_model != model_preference {
        tracing::info!(
            "[AsterAgent] 后端已解析请求模型: source={:?}, provider={}, requested_model={}, resolved_model={}, thinking_enabled={}, has_images={}",
            model_preference_source,
            context.provider_selector,
            model_preference,
            resolved_model,
            thinking_enabled,
            has_images
        );
    }

    let provider_strategy = resolve_runtime_provider_configuration_strategy(&context);
    let base_url = match provider_strategy {
        RuntimeProviderConfigurationStrategy::Manual { base_url } => base_url,
        RuntimeProviderConfigurationStrategy::ApiKeyProvider => None,
    };
    let model_meta = find_model_meta(&resolved_model, &catalog);
    let mut model_capabilities = model_meta
        .map(|model| model.capabilities.clone())
        .unwrap_or_else(|| {
            let inferred_task_families = infer_model_task_families(
                &resolved_model,
                Some(&context.provider_selector),
                None,
                None,
            );
            infer_model_capabilities(
                &resolved_model,
                Some(&context.provider_selector),
                &inferred_task_families,
                None,
                None,
            )
        });
    if supports_vision(model_meta, &resolved_model) {
        model_capabilities.vision = true;
    }

    let estimated_cost_class = estimate_cost_class(&resolved_model, model_meta);
    let runtime_capability_gap =
        runtime_model_capability_gap_for_catalog(&catalog, &runtime_requirements);
    let resolved_model_capability_gap =
        runtime_model_capability_gap_for_model(model_meta, &runtime_requirements);
    let locked_model_capability_gap = resolved_model_capability_gap
        .clone()
        .filter(|_| honor_explicit_model_lock);
    let (capability_gap, capability_gap_source) = if vision_gap {
        (
            Some("vision_candidate_missing".to_string()),
            Some("vision_input".to_string()),
        )
    } else if reasoning_gap {
        (
            Some("reasoning_candidate_missing".to_string()),
            Some("reasoning_input".to_string()),
        )
    } else if let Some(gap) = locked_model_capability_gap {
        (Some(gap), Some("explicit_model_lock".to_string()))
    } else if let Some(gap) = resolved_model_capability_gap {
        (Some(gap), Some("resolved_model".to_string()))
    } else if let Some(gap) = runtime_capability_gap {
        (Some(gap), Some("candidate_catalog".to_string()))
    } else {
        (None, None)
    };

    Ok(ResolvedRuntimeProviderSelection {
        provider_selector: context.provider_selector.clone(),
        requested_model: model_preference.to_string(),
        resolved_model: resolved_model.clone(),
        candidate_count: compatible_candidate_count.max(1),
        estimated_cost_class,
        pricing: model_meta.and_then(|model| model.pricing.clone()),
        capability_gap,
        capability_gap_source,
        fallback_chain,
        provider_config: ConfigureProviderRequest {
            provider_id: Some(context.provider_selector.clone()),
            provider_name: context.aster_provider_name,
            model_name: resolved_model,
            api_key: None,
            base_url,
            model_capabilities: Some(model_capabilities),
            tool_call_strategy: None,
            toolshim_model: None,
        },
    })
}

pub(super) async fn resolve_runtime_provider_auth_recovery_config(
    app: &AppHandle,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    request: &AsterChatRequest,
    provider_selector: &str,
    failed_model: &str,
) -> Result<Option<ConfigureProviderRequest>, String> {
    let context =
        build_provider_resolution_context(db, api_key_provider_service, provider_selector)?;
    let failed_model = canonicalize_known_provider_model_id(&context, failed_model);
    let (catalog, _alias_config) = load_model_registry_catalog(app, &context).await;
    let thinking_enabled = resolve_request_thinking_enabled(request).await?;
    let has_images = request
        .images
        .as_ref()
        .map(|images| !images.is_empty())
        .unwrap_or(false);

    let Some(fallback_model) = choose_provider_permission_recovery_model(
        &context,
        &failed_model,
        &catalog,
        thinking_enabled,
        has_images,
    ) else {
        return Ok(None);
    };

    if normalize_identifier(&fallback_model) == normalize_identifier(&failed_model) {
        return Ok(None);
    }

    let provider_strategy = resolve_runtime_provider_configuration_strategy(&context);
    let base_url = match provider_strategy {
        RuntimeProviderConfigurationStrategy::Manual { base_url } => base_url,
        RuntimeProviderConfigurationStrategy::ApiKeyProvider => None,
    };
    let model_meta = find_model_meta(&fallback_model, &catalog);
    let model_capabilities = model_meta
        .map(|model| model.capabilities.clone())
        .unwrap_or_else(|| {
            let inferred_task_families = infer_model_task_families(
                &fallback_model,
                Some(&context.provider_selector),
                None,
                None,
            );
            infer_model_capabilities(
                &fallback_model,
                Some(&context.provider_selector),
                &inferred_task_families,
                None,
                None,
            )
        });

    Ok(Some(ConfigureProviderRequest {
        provider_id: Some(context.provider_selector.clone()),
        provider_name: context.aster_provider_name,
        model_name: fallback_model,
        api_key: None,
        base_url,
        model_capabilities: Some(model_capabilities),
        tool_call_strategy: None,
        toolshim_model: None,
    }))
}

pub(super) async fn resolve_runtime_request_provider_resolution(
    app: &AppHandle,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    request: &AsterChatRequest,
) -> Result<RuntimeRequestProviderResolution, String> {
    let task_profile = build_runtime_task_profile(request);
    let request_runtime_requirements =
        routing_slot_model_capability_requirements(task_profile.routing_slot.as_deref());
    let request_targets_responsive_chat = targets_responsive_chat(&request_runtime_requirements)
        || task_profile
            .service_model_slot
            .as_deref()
            .is_some_and(|slot| normalize_identifier(slot) == RESPONSIVE_CHAT_SERVICE_MODEL_SLOT);
    let access_mode = resolve_runtime_request_access_mode(request);
    let permission_state = build_permission_state(&task_profile, access_mode);
    let request_oem_routing = resolve_request_oem_routing_context(request.metadata.as_ref());
    let oem_locked = request_oem_routing_is_locked(request_oem_routing.as_ref());
    let oem_limit_event = build_request_oem_limit_event(request_oem_routing.as_ref());
    let oem_policy = build_request_oem_policy(request_oem_routing.as_ref());

    if request.provider_config.is_some() {
        let explicit_provider = request.provider_config.as_ref().and_then(|config| {
            normalize_optional_text(
                config
                    .provider_id
                    .clone()
                    .or_else(|| Some(config.provider_name.clone())),
            )
        });
        let explicit_model = request
            .provider_config
            .as_ref()
            .and_then(|config| normalize_optional_text(Some(config.model_name.clone())));
        let limit_state = build_limit_state(
            "single_candidate_only",
            1,
            true,
            false,
            oem_locked,
            None,
            vec!["请求已显式传入 provider_config，自动路由不再改选 provider".to_string()],
        );
        let routing_decision = build_routing_decision(
            &task_profile,
            "provider_config",
            compose_routing_decision_reason(
                "请求已显式传入 provider_config，运行时仅补齐能力与工具策略。",
                None,
                oem_locked,
                None,
            ),
            None,
            explicit_provider.clone(),
            explicit_model.clone(),
            None,
        );

        let cost_state = build_cost_state(
            None,
            request
                .provider_config
                .as_ref()
                .and_then(|config| estimate_cost_class(&config.model_name, None)),
            "estimated",
        );
        let runtime_summary = build_runtime_summary(
            &routing_decision,
            &limit_state,
            &cost_state,
            &permission_state,
            oem_limit_event.as_ref(),
        );

        return Ok(RuntimeRequestProviderResolution {
            provider_config: None,
            task_profile,
            routing_decision: lime_agent::SessionExecutionRuntimeRoutingDecision {
                routing_mode: "single_candidate".to_string(),
                selected_provider: explicit_provider,
                selected_model: explicit_model,
                candidate_count: 1,
                estimated_cost_class: request
                    .provider_config
                    .as_ref()
                    .and_then(|config| estimate_cost_class(&config.model_name, None)),
                ..routing_decision
            },
            limit_state,
            cost_state,
            permission_state: permission_state.clone(),
            limit_event: oem_limit_event,
            oem_policy: oem_policy.clone(),
            runtime_summary,
        });
    }

    let service_scene_preference =
        resolve_service_scene_model_preference(request.metadata.as_ref());
    let service_model_setting_preference =
        resolve_service_model_setting_preference(app, &task_profile);
    let session_context =
        if request.provider_preference.is_some() && request.model_preference.is_some() {
            None
        } else {
            Some(load_session_provider_model_context(request).await?)
        };
    let mut fallback_note: Option<String> = None;

    if request.provider_preference.is_some() || request.model_preference.is_some() {
        let Some((provider_selector, provider_preference_source)) =
            resolve_provider_preference_with_session_fallback(
                request.provider_preference.clone(),
                session_context.as_ref(),
            )
        else {
            return Ok(build_no_candidate_resolution(
                task_profile,
                access_mode,
                "request_override",
                "当前回合传入了 provider/model 偏好，但没有找到可恢复的 provider 默认值。"
                    .to_string(),
                oem_locked,
                oem_limit_event.clone(),
                oem_policy.clone(),
            ));
        };
        let (model_preference, model_preference_source) =
            resolve_model_preference_with_session_fallback(
                request.model_preference.clone(),
                &provider_selector,
                session_context.as_ref(),
            )?;
        let allow_runtime_fallback = should_allow_cross_provider_runtime_fallback(
            provider_preference_source,
            model_preference_source,
        );

        if matches!(provider_preference_source, RequestPreferenceSource::Session) {
            tracing::info!(
                "[AsterAgent] 后端从会话恢复 provider 偏好: session={}, provider={}",
                request.session_id,
                provider_selector
            );
        }

        if matches!(model_preference_source, RequestPreferenceSource::Session) {
            tracing::info!(
                "[AsterAgent] 后端从会话恢复模型偏好: session={}, provider={}, model={}",
                request.session_id,
                provider_selector,
                model_preference
            );
        }

        let selection = build_runtime_request_provider_config_from_preference(
            app,
            db,
            api_key_provider_service,
            request,
            &task_profile,
            &provider_selector,
            &model_preference,
            model_preference_source,
            allow_runtime_fallback,
        )
        .await?;
        let limit_state = build_limit_state(
            runtime_limit_status_for_selection(&selection),
            selection.candidate_count,
            true,
            false,
            oem_locked,
            selection.capability_gap.clone(),
            {
                let mut notes = vec!["当前回合显式指定了 provider/model 偏好。".to_string()];
                if !allow_runtime_fallback {
                    notes.push(
                        "当前回合含显式 provider/model 选择，运行时不会静默切换到其他 Provider。"
                            .to_string(),
                    );
                }
                if selection.capability_gap_source.as_deref() == Some("explicit_model_lock") {
                    notes.push(
                            "显式用户模型锁定不满足当前 execution profile 的 routing slot，模型执行前必须阻断。"
                                .to_string(),
                        );
                }
                notes
            },
        );
        let routing_decision = build_routing_decision(
            &task_profile,
            if matches!(provider_preference_source, RequestPreferenceSource::Request)
                || matches!(model_preference_source, RequestPreferenceSource::Request)
            {
                "request_override"
            } else {
                "session_default"
            },
            "当前回合的 provider/model 选择优先遵循显式偏好，其次回退到会话默认。".to_string(),
            Some(&selection),
            Some(provider_selector.clone()),
            Some(model_preference.clone()),
            None,
        );

        let cost_state = build_cost_state(Some(&selection), None, "estimated");
        let runtime_summary = build_runtime_summary(
            &routing_decision,
            &limit_state,
            &cost_state,
            &permission_state,
            oem_limit_event.as_ref(),
        );

        return Ok(RuntimeRequestProviderResolution {
            provider_config: Some(selection.provider_config),
            task_profile,
            routing_decision,
            limit_state,
            cost_state,
            permission_state: permission_state.clone(),
            limit_event: oem_limit_event,
            oem_policy: oem_policy.clone(),
            runtime_summary,
        });
    }

    if let Some(scene_preference) = service_scene_preference.as_ref() {
        match build_runtime_request_provider_config_from_preference(
            app,
            db,
            api_key_provider_service,
            request,
            &task_profile,
            &scene_preference.provider_selector,
            &scene_preference.model_name,
            RequestPreferenceSource::ServiceSceneLaunch,
            scene_preference.allow_fallback,
        )
        .await
        {
            Ok(selection) => {
                tracing::info!(
                    "[AsterAgent] 后端从 service_scene_launch 恢复 provider/model 偏好: session={}, provider={}, model={}, allow_fallback={}",
                    request.session_id,
                    scene_preference.provider_selector,
                    scene_preference.model_name,
                    scene_preference.allow_fallback
                );
                let limit_state = build_limit_state(
                    runtime_limit_status_for_selection(&selection),
                    selection.candidate_count,
                    true,
                    true,
                    oem_locked,
                    selection.capability_gap.clone(),
                    vec!["命中 service_scene_launch 的 provider/model 约束。".to_string()],
                );
                let routing_decision = build_routing_decision(
                    &task_profile,
                    "service_scene_launch",
                    "当前回合由 service_scene_launch 指定 provider/model，自动仅在允许范围内做能力兼容。"
                        .to_string(),
                    Some(&selection),
                    Some(scene_preference.provider_selector.clone()),
                    Some(scene_preference.model_name.clone()),
                    Some("service_scene_launch".to_string()),
                );
                let cost_state = build_cost_state(Some(&selection), None, "estimated");
                let runtime_summary = build_runtime_summary(
                    &routing_decision,
                    &limit_state,
                    &cost_state,
                    &permission_state,
                    oem_limit_event.as_ref(),
                );

                return Ok(RuntimeRequestProviderResolution {
                    provider_config: Some(selection.provider_config),
                    task_profile,
                    routing_decision,
                    limit_state,
                    cost_state,
                    permission_state: permission_state.clone(),
                    limit_event: oem_limit_event,
                    oem_policy: oem_policy.clone(),
                    runtime_summary,
                });
            }
            Err(error) => {
                if !scene_preference.allow_fallback {
                    return Err(format!(
                        "service_scene_launch 首选服务不可用，且已关闭自动回退: {error}"
                    ));
                }
                tracing::warn!(
                    "[AsterAgent] service_scene_launch 首选 provider/model 不可用，已回退会话默认: session={}, provider={}, model={}, error={}",
                    request.session_id,
                    scene_preference.provider_selector,
                    scene_preference.model_name,
                    error
                );
                fallback_note = Some(
                    "service_scene_launch 首选 provider/model 不可用，已继续回退默认路由。"
                        .to_string(),
                );
            }
        }
    }

    if let Some(setting_preference) = service_model_setting_preference.as_ref() {
        match build_runtime_request_provider_config_from_preference(
            app,
            db,
            api_key_provider_service,
            request,
            &task_profile,
            &setting_preference.provider_selector,
            &setting_preference.model_name,
            RequestPreferenceSource::ServiceModelSetting,
            true,
        )
        .await
        {
            Ok(selection) => {
                let setting_latency_fallback = if request_targets_responsive_chat {
                    responsive_chat_setting_fallback_reason(
                        db,
                        &selection.provider_selector,
                        &selection.resolved_model,
                    )
                } else {
                    None
                };
                if let Some(reason) = setting_latency_fallback {
                    tracing::warn!(
                        "[AsterAgent] responsive_chat 设置模型历史样本不满足低延迟目标，继续进入自动候选: session={}, provider={}, model={}, reason={}",
                        request.session_id,
                        selection.provider_selector,
                        selection.resolved_model,
                        reason
                    );
                    if fallback_note.is_none() {
                        fallback_note = Some(format!(
                            "{} 历史样本不满足低延迟目标（{}），已继续进入自动 responsive_chat 候选。",
                            setting_preference.settings_source, reason
                        ));
                    }
                } else {
                    let mut notes = vec![format!(
                        "命中设置中的 {}，自动仅在当前 provider 候选池内做能力兼容。",
                        setting_preference.settings_source
                    )];
                    if let Some(note) = fallback_note.clone() {
                        notes.push(note);
                    }
                    let limit_state = build_limit_state(
                        runtime_limit_status_for_selection(&selection),
                        selection.candidate_count,
                        true,
                        true,
                        oem_locked,
                        selection.capability_gap.clone(),
                        notes,
                    );
                    let routing_decision = build_routing_decision(
                        &task_profile,
                        "service_model_setting",
                        compose_routing_decision_reason(
                            format!(
                                "当前回合命中 {}，优先使用设置中的 provider/model。",
                                setting_preference.settings_source
                            ),
                            Some(&selection),
                            oem_locked,
                            fallback_note.as_deref(),
                        ),
                        Some(&selection),
                        Some(setting_preference.provider_selector.clone()),
                        Some(setting_preference.model_name.clone()),
                        Some(setting_preference.settings_source.clone()),
                    );
                    let cost_state = build_cost_state(Some(&selection), None, "estimated");
                    let runtime_summary = build_runtime_summary(
                        &routing_decision,
                        &limit_state,
                        &cost_state,
                        &permission_state,
                        oem_limit_event.as_ref(),
                    );

                    return Ok(RuntimeRequestProviderResolution {
                        provider_config: Some(selection.provider_config),
                        task_profile,
                        routing_decision,
                        limit_state,
                        cost_state,
                        permission_state: permission_state.clone(),
                        limit_event: oem_limit_event,
                        oem_policy: oem_policy.clone(),
                        runtime_summary,
                    });
                }
            }
            Err(error) => {
                tracing::warn!(
                    "[AsterAgent] service_models 偏好不可用，继续回退会话默认: session={}, source={}, provider={}, model={}, error={}",
                    request.session_id,
                    setting_preference.settings_source,
                    setting_preference.provider_selector,
                    setting_preference.model_name,
                    error
                );
                if fallback_note.is_none() {
                    fallback_note = Some(format!(
                        "{} 不可用，已继续回退会话默认。",
                        setting_preference.settings_source
                    ));
                }
            }
        }
    }

    if !oem_locked {
        if let Some(auto_preference) = resolve_responsive_chat_auto_preference(
            app,
            db,
            api_key_provider_service,
            request,
            &task_profile,
        )
        .await?
        {
            let selection = build_runtime_request_provider_config_from_preference(
                app,
                db,
                api_key_provider_service,
                request,
                &task_profile,
                &auto_preference.provider_selector,
                &auto_preference.model_name,
                RequestPreferenceSource::ResponsiveChatAuto,
                true,
            )
            .await?;
            let auto_reason = if fallback_note.is_some() {
                "当前回合命中 responsive_chat_model，但显式服务模型不可用或历史首字样本不满足低延迟目标；运行时改按已启用 Provider 的模型元数据自动选择低延迟对话候选。"
            } else {
                "当前回合命中 responsive_chat_model，且未配置服务模型；运行时按已启用 Provider 的模型元数据自动选择低延迟对话候选。"
            };
            let mut notes = vec![format!(
                "responsive_chat 已从已启用 Provider 的模型元数据中自动选择低延迟候选；当前 Provider 兼容候选数为 {}。",
                auto_preference.compatible_candidate_count
            )];
            if let Some(note) = fallback_note.clone() {
                notes.push(note);
            }
            let limit_state = build_limit_state(
                runtime_limit_status_for_selection(&selection),
                selection.candidate_count,
                false,
                false,
                oem_locked,
                selection.capability_gap.clone(),
                notes,
            );
            let routing_decision = build_routing_decision(
                &task_profile,
                "responsive_chat_auto",
                compose_routing_decision_reason(
                    auto_reason,
                    Some(&selection),
                    oem_locked,
                    fallback_note.as_deref(),
                ),
                Some(&selection),
                Some(auto_preference.provider_selector),
                Some(auto_preference.model_name),
                Some("service_models.responsive_chat:auto".to_string()),
            );
            let cost_state = build_cost_state(Some(&selection), None, "estimated");
            let runtime_summary = build_runtime_summary(
                &routing_decision,
                &limit_state,
                &cost_state,
                &permission_state,
                oem_limit_event.as_ref(),
            );

            return Ok(RuntimeRequestProviderResolution {
                provider_config: Some(selection.provider_config),
                task_profile,
                routing_decision,
                limit_state,
                cost_state,
                permission_state: permission_state.clone(),
                limit_event: oem_limit_event,
                oem_policy: oem_policy.clone(),
                runtime_summary,
            });
        }
    }

    if request_targets_responsive_chat {
        if let Some(fallback_preference) =
            extract_fast_response_fallback_preference(request.metadata.as_ref())
        {
            match build_runtime_request_provider_config_from_preference(
                app,
                db,
                api_key_provider_service,
                request,
                &task_profile,
                &fallback_preference.provider_selector,
                &fallback_preference.model_name,
                RequestPreferenceSource::FastResponseFallback,
                true,
            )
            .await
            {
                Ok(selection) => {
                    tracing::info!(
                        "[AsterAgent] 快速响应后端候选不可用，回退当前工作区 provider/model: session={}, provider={}, model={}",
                        request.session_id,
                        fallback_preference.provider_selector,
                        fallback_preference.model_name
                    );
                    let mut notes = vec![
                        "快速响应后端候选不可用，已回退到当前工作区 provider/model。".to_string(),
                    ];
                    if let Some(note) = fallback_note.clone() {
                        notes.push(note);
                    }
                    let limit_state = build_limit_state(
                        runtime_limit_status_for_selection(&selection),
                        selection.candidate_count,
                        true,
                        false,
                        oem_locked,
                        selection.capability_gap.clone(),
                        notes,
                    );
                    let routing_decision = build_routing_decision(
                        &task_profile,
                        "fast_response_fallback",
                        compose_routing_decision_reason(
                            "当前回合命中快速响应路由，但后端服务模型或自动候选不可用；运行时回退到前端当前工作区模型。",
                            Some(&selection),
                            oem_locked,
                            fallback_note.as_deref(),
                        ),
                        Some(&selection),
                        Some(fallback_preference.provider_selector),
                        Some(fallback_preference.model_name),
                        Some("fast_response_routing.fallback".to_string()),
                    );
                    let cost_state = build_cost_state(Some(&selection), None, "estimated");
                    let runtime_summary = build_runtime_summary(
                        &routing_decision,
                        &limit_state,
                        &cost_state,
                        &permission_state,
                        oem_limit_event.as_ref(),
                    );

                    return Ok(RuntimeRequestProviderResolution {
                        provider_config: Some(selection.provider_config),
                        task_profile,
                        routing_decision,
                        limit_state,
                        cost_state,
                        permission_state: permission_state.clone(),
                        limit_event: oem_limit_event,
                        oem_policy: oem_policy.clone(),
                        runtime_summary,
                    });
                }
                Err(error) => {
                    tracing::warn!(
                        "[AsterAgent] 快速响应 fallback provider/model 不可用，继续回退会话默认: session={}, provider={}, model={}, error={}",
                        request.session_id,
                        fallback_preference.provider_selector,
                        fallback_preference.model_name,
                        error
                    );
                    if fallback_note.is_none() {
                        fallback_note = Some(
                            "快速响应 fallback provider/model 不可用，已继续回退会话默认。"
                                .to_string(),
                        );
                    }
                }
            }
        }
    }

    let Some((provider_selector, provider_preference_source)) =
        resolve_provider_preference_with_session_fallback(None, session_context.as_ref())
    else {
        return Ok(build_no_candidate_resolution(
            task_profile,
            access_mode,
            "auto_default",
            fallback_note.unwrap_or_else(|| {
                "当前会话没有 provider/model 默认值，自动路由没有候选可选。".to_string()
            }),
            oem_locked,
            oem_limit_event.clone(),
            oem_policy.clone(),
        ));
    };
    let (model_preference, model_preference_source) =
        resolve_model_preference_with_session_fallback(
            None,
            &provider_selector,
            session_context.as_ref(),
        )?;

    if matches!(provider_preference_source, RequestPreferenceSource::Session) {
        tracing::info!(
            "[AsterAgent] 后端从会话恢复 provider 偏好: session={}, provider={}",
            request.session_id,
            provider_selector
        );
    }
    if matches!(model_preference_source, RequestPreferenceSource::Session) {
        tracing::info!(
            "[AsterAgent] 后端从会话恢复模型偏好: session={}, provider={}, model={}",
            request.session_id,
            provider_selector,
            model_preference
        );
    }

    let selection = build_runtime_request_provider_config_from_preference(
        app,
        db,
        api_key_provider_service,
        request,
        &task_profile,
        &provider_selector,
        &model_preference,
        model_preference_source,
        true,
    )
    .await?;
    let mut notes = vec!["当前回合沿用会话最近一次持久化的 provider/model 默认值。".to_string()];
    if let Some(note) = fallback_note.as_ref() {
        notes.push(note.clone());
    }
    let limit_state = build_limit_state(
        runtime_limit_status_for_selection(&selection),
        selection.candidate_count,
        true,
        false,
        oem_locked,
        selection.capability_gap.clone(),
        notes,
    );
    let routing_decision = build_routing_decision(
        &task_profile,
        if matches!(provider_preference_source, RequestPreferenceSource::Session)
            || matches!(model_preference_source, RequestPreferenceSource::Session)
        {
            "session_default"
        } else {
            "auto_default"
        },
        compose_routing_decision_reason(
            "当前回合没有显式指定 provider/model，运行时沿用会话默认并在当前 provider 内做能力兼容。",
            Some(&selection),
            oem_locked,
            fallback_note.as_deref(),
        ),
        Some(&selection),
        Some(provider_selector),
        Some(model_preference),
        None,
    );

    let cost_state = build_cost_state(Some(&selection), None, "estimated");
    let runtime_summary = build_runtime_summary(
        &routing_decision,
        &limit_state,
        &cost_state,
        &permission_state,
        oem_limit_event.as_ref(),
    );

    Ok(RuntimeRequestProviderResolution {
        provider_config: Some(selection.provider_config),
        task_profile,
        routing_decision,
        limit_state,
        cost_state,
        permission_state,
        limit_event: oem_limit_event,
        oem_policy,
        runtime_summary,
    })
}

#[cfg(test)]
mod tests;
