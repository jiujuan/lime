use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use super::{
    anthropic::AnthropicProvider,
    azure::AzureProvider,
    base::{Provider, ProviderMetadata},
    claude_code::ClaudeCodeProvider,
    codex::CodexProvider,
    codex_stateful::CodexStatefulProvider,
    cursor_agent::CursorAgentProvider,
    databricks::DatabricksProvider,
    gcpvertexai::GcpVertexAIProvider,
    gemini_cli::GeminiCliProvider,
    githubcopilot::GithubCopilotProvider,
    google::GoogleProvider,
    lead_worker::LeadWorkerProvider,
    litellm::LiteLLMProvider,
    ollama::OllamaProvider,
    openai::OpenAiProvider,
    openrouter::OpenRouterProvider,
    provider_registry::ProviderRegistry,
    snowflake::SnowflakeProvider,
    tetrate::TetrateProvider,
    venice::VeniceProvider,
    xai::XaiProvider,
};
#[cfg(feature = "provider-aws")]
use super::{bedrock::BedrockProvider, sagemaker_tgi::SageMakerTgiProvider};
use crate::model::ModelConfig;
use crate::providers::base::ProviderType;
use crate::{
    config::declarative_providers::register_declarative_providers,
    providers::provider_registry::ProviderEntry,
};
use anyhow::Result;
use tokio::sync::OnceCell;

const DEFAULT_LEAD_TURNS: usize = 3;
const DEFAULT_FAILURE_THRESHOLD: usize = 2;
const DEFAULT_FALLBACK_TURNS: usize = 2;

static REGISTRY: OnceCell<RwLock<ProviderRegistry>> = OnceCell::const_new();

async fn init_registry() -> RwLock<ProviderRegistry> {
    let mut registry = ProviderRegistry::new().with_providers(|registry| {
        registry
            .register::<AnthropicProvider, _>(|m| Box::pin(AnthropicProvider::from_env(m)), true);
        registry.register::<AzureProvider, _>(|m| Box::pin(AzureProvider::from_env(m)), false);
        #[cfg(feature = "provider-aws")]
        registry.register::<BedrockProvider, _>(|m| Box::pin(BedrockProvider::from_env(m)), false);
        registry
            .register::<ClaudeCodeProvider, _>(|m| Box::pin(ClaudeCodeProvider::from_env(m)), true);
        registry.register::<CodexProvider, _>(|m| Box::pin(CodexProvider::from_env(m)), true);
        registry.register::<CodexStatefulProvider, _>(
            |m| Box::pin(CodexStatefulProvider::from_env(m)),
            true,
        );
        registry.register::<CursorAgentProvider, _>(
            |m| Box::pin(CursorAgentProvider::from_env(m)),
            false,
        );
        registry
            .register::<DatabricksProvider, _>(|m| Box::pin(DatabricksProvider::from_env(m)), true);
        registry.register::<GcpVertexAIProvider, _>(
            |m| Box::pin(GcpVertexAIProvider::from_env(m)),
            false,
        );
        registry
            .register::<GeminiCliProvider, _>(|m| Box::pin(GeminiCliProvider::from_env(m)), false);
        registry.register::<GithubCopilotProvider, _>(
            |m| Box::pin(GithubCopilotProvider::from_env(m)),
            false,
        );
        registry.register::<GoogleProvider, _>(|m| Box::pin(GoogleProvider::from_env(m)), true);
        registry.register::<LiteLLMProvider, _>(|m| Box::pin(LiteLLMProvider::from_env(m)), false);
        registry.register::<OllamaProvider, _>(|m| Box::pin(OllamaProvider::from_env(m)), true);
        registry.register::<OpenAiProvider, _>(|m| Box::pin(OpenAiProvider::from_env(m)), true);
        registry
            .register::<OpenRouterProvider, _>(|m| Box::pin(OpenRouterProvider::from_env(m)), true);
        #[cfg(feature = "provider-aws")]
        registry.register::<SageMakerTgiProvider, _>(
            |m| Box::pin(SageMakerTgiProvider::from_env(m)),
            false,
        );
        registry
            .register::<SnowflakeProvider, _>(|m| Box::pin(SnowflakeProvider::from_env(m)), false);
        registry.register::<TetrateProvider, _>(|m| Box::pin(TetrateProvider::from_env(m)), true);
        registry.register::<VeniceProvider, _>(|m| Box::pin(VeniceProvider::from_env(m)), false);
        registry.register::<XaiProvider, _>(|m| Box::pin(XaiProvider::from_env(m)), false);
    });
    if let Err(e) = load_custom_providers_into_registry(&mut registry) {
        tracing::warn!("Failed to load custom providers: {}", e);
    }
    RwLock::new(registry)
}

fn load_custom_providers_into_registry(registry: &mut ProviderRegistry) -> Result<()> {
    register_declarative_providers(registry)
}

async fn get_registry() -> &'static RwLock<ProviderRegistry> {
    REGISTRY.get_or_init(init_registry).await
}

pub async fn providers() -> Vec<(ProviderMetadata, ProviderType)> {
    get_registry()
        .await
        .read()
        .unwrap()
        .all_metadata_with_types()
}

pub async fn refresh_custom_providers() -> Result<()> {
    let registry = get_registry().await;
    registry.write().unwrap().remove_custom_providers();

    if let Err(e) = load_custom_providers_into_registry(&mut registry.write().unwrap()) {
        tracing::warn!("Failed to refresh custom providers: {}", e);
        return Err(e);
    }

    tracing::info!("Custom providers refreshed");
    Ok(())
}

async fn get_from_registry(name: &str) -> Result<ProviderEntry> {
    // 将各种 Provider 名称映射到 Aster 支持的 Provider
    let mapped_name = map_provider_alias(name);

    #[cfg(not(feature = "provider-aws"))]
    if mapped_name == "bedrock" || mapped_name == "sagemaker_tgi" {
        return Err(anyhow::anyhow!(
            "Provider {} is disabled at compile time; rebuild with feature provider-aws",
            mapped_name
        ));
    }

    let guard = get_registry().await.read().unwrap();
    guard
        .entries
        .get(mapped_name.as_str())
        .ok_or_else(|| anyhow::anyhow!("Unknown provider: {} (mapped to: {})", name, mapped_name))
        .cloned()
}

/// 将各种 Provider 名称映射到 Aster 支持的 Provider
///
/// Aster 原生支持的 Provider:
/// - openai, anthropic, google, azure, bedrock, ollama, gcpvertexai
/// - openrouter, litellm, databricks, codex, xai, venice, tetrate
/// - snowflake, sagemaker_tgi, githubcopilot, gemini_cli, cursor_agent, claude_code
///
/// 其他 Provider 会映射到兼容的 Provider
fn parse_provider_alias_overrides(raw: &str) -> HashMap<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return HashMap::new();
    }

    if let Ok(json_map) = serde_json::from_str::<HashMap<String, String>>(trimmed) {
        return json_map
            .into_iter()
            .map(|(alias, target)| (alias.trim().to_lowercase(), target.trim().to_lowercase()))
            .filter(|(alias, target)| !alias.is_empty() && !target.is_empty())
            .collect();
    }

    let mut overrides = HashMap::new();
    for pair in trimmed.split(',') {
        let entry = pair.trim();
        if entry.is_empty() {
            continue;
        }

        let parsed = entry.split_once('=').or_else(|| entry.split_once(':'));

        if let Some((alias, target)) = parsed {
            let alias = alias.trim().to_lowercase();
            let target = target.trim().to_lowercase();
            if !alias.is_empty() && !target.is_empty() {
                overrides.insert(alias, target);
            }
        }
    }

    overrides
}

fn load_provider_alias_overrides() -> HashMap<String, String> {
    std::env::var("ASTER_PROVIDER_ALIAS_OVERRIDES")
        .ok()
        .map(|raw| parse_provider_alias_overrides(&raw))
        .unwrap_or_default()
}

fn map_provider_alias(name: &str) -> String {
    let normalized = name.trim().to_lowercase();

    if normalized.is_empty() {
        return normalized;
    }

    // 自定义 Provider（UUID 格式，如 custom-ba4e7574-dd00-4784-945a-0f383dfa1272）
    // 这些是用户通过 API Key Provider 添加的自定义服务，通常是 OpenAI 兼容的
    if normalized.starts_with("custom-") {
        return "openai".to_string();
    }

    // 应用层可通过环境变量覆盖别名映射，避免框架层频繁改代码
    if let Some(mapped) = load_provider_alias_overrides().get(normalized.as_str()) {
        return mapped.clone();
    }

    let mapped = match normalized.as_str() {
        // ========== OpenAI 兼容格式 ==========
        // 国内 AI 服务
        "deepseek" | "deep_seek" | "deep-seek" => "openai",
        "qwen" | "tongyi" | "dashscope" | "aliyun" => "openai",
        "zhipu" | "glm" | "chatglm" => "openai",
        "baichuan" => "openai",
        "moonshot" | "kimi" => "openai",
        "minimax" => "openai",
        "yi" | "01ai" | "lingyiwanwu" => "openai",
        "stepfun" | "step" => "openai",
        "bailian" | "百炼" => "openai",
        "doubao" | "豆包" => "openai",
        "spark" | "讯飞" | "xunfei" => "openai",
        "hunyuan" | "混元" => "openai",
        "ernie" | "文心" | "wenxin" => "openai",

        // 国际 AI 服务（OpenAI 兼容）
        "groq" => "openai",
        "together" | "togetherai" => "openai",
        "fireworks" | "fireworksai" => "openai",
        "perplexity" => "openai",
        "anyscale" => "openai",
        "lepton" | "leptonai" => "openai",
        "novita" | "novitaai" => "openai",
        "siliconflow" => "openai",
        "mistral" => "openai",
        "cohere" => "openai",

        // API 聚合服务
        "oneapi" | "one-api" | "one_api" => "openai",
        "newapi" | "new-api" | "new_api" => "openai",
        "vercel" | "vercel_ai" | "vercel-ai" => "openai",

        // 自定义/通用 OpenAI 兼容
        "custom" | "custom_openai" | "openai_compatible" => "openai",

        // ========== Anthropic 兼容格式 ==========
        "claude" => "anthropic",
        "anthropic_compatible" | "anthropic-compatible" => "anthropic",

        // ========== Google/Gemini 格式 ==========
        "gemini" | "gemini_api_key" => "google",
        "antigravity" => "google",

        // ========== 其他已支持的 Provider（保持原名） ==========
        "azure" | "azure_openai" | "azure-openai" => "azure",
        "vertex" | "vertexai" | "vertex_ai" => "gcpvertexai",
        "aws_bedrock" | "aws-bedrock" => "bedrock",
        "kiro" => "bedrock", // Kiro 使用 CodeWhisperer API

        // 默认返回小写原名称（让 Aster 原生处理）
        _ => normalized.as_str(),
    };

    mapped.to_string()
}

pub async fn create(name: &str, model: ModelConfig) -> Result<Arc<dyn Provider>> {
    let config = crate::config::Config::global();

    if let Ok(lead_model_name) = config.get_param::<String>("ASTER_LEAD_MODEL") {
        tracing::info!("Creating lead/worker provider from environment variables");
        return create_lead_worker_from_env(name, &model, &lead_model_name).await;
    }

    let constructor = get_from_registry(name).await?.constructor.clone();
    constructor(model).await
}

pub async fn create_with_default_model(name: impl AsRef<str>) -> Result<Arc<dyn Provider>> {
    get_from_registry(name.as_ref())
        .await?
        .create_with_default_model()
        .await
}

pub async fn create_with_named_model(
    provider_name: &str,
    model_name: &str,
) -> Result<Arc<dyn Provider>> {
    let config = ModelConfig::new(model_name)?;
    create(provider_name, config).await
}

async fn create_lead_worker_from_env(
    default_provider_name: &str,
    default_model: &ModelConfig,
    lead_model_name: &str,
) -> Result<Arc<dyn Provider>> {
    let config = crate::config::Config::global();

    let lead_provider_name_raw = config
        .get_param::<String>("ASTER_LEAD_PROVIDER")
        .unwrap_or_else(|_| default_provider_name.to_string());
    let lead_provider_name = map_provider_alias(&lead_provider_name_raw);
    let worker_provider_name = map_provider_alias(default_provider_name);

    let lead_turns = config
        .get_param::<usize>("ASTER_LEAD_TURNS")
        .unwrap_or(DEFAULT_LEAD_TURNS);
    let failure_threshold = config
        .get_param::<usize>("ASTER_LEAD_FAILURE_THRESHOLD")
        .unwrap_or(DEFAULT_FAILURE_THRESHOLD);
    let fallback_turns = config
        .get_param::<usize>("ASTER_LEAD_FALLBACK_TURNS")
        .unwrap_or(DEFAULT_FALLBACK_TURNS);

    let lead_model_config = ModelConfig::new_with_context_env(
        lead_model_name.to_string(),
        Some("ASTER_LEAD_CONTEXT_LIMIT"),
    )?;

    let worker_model_config = create_worker_model_config(default_model)?;

    let registry = get_registry().await;

    let lead_constructor = {
        let guard = registry.read().unwrap();
        guard
            .entries
            .get(lead_provider_name.as_str())
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "Unknown provider: {} (mapped to: {})",
                    lead_provider_name_raw,
                    lead_provider_name
                )
            })?
            .constructor
            .clone()
    };

    let worker_constructor = {
        let guard = registry.read().unwrap();
        guard
            .entries
            .get(worker_provider_name.as_str())
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "Unknown provider: {} (mapped to: {})",
                    default_provider_name,
                    worker_provider_name
                )
            })?
            .constructor
            .clone()
    };

    let lead_provider = lead_constructor(lead_model_config).await?;
    let worker_provider = worker_constructor(worker_model_config).await?;

    Ok(Arc::new(LeadWorkerProvider::new_with_settings(
        lead_provider,
        worker_provider,
        lead_turns,
        failure_threshold,
        fallback_turns,
    )))
}

fn create_worker_model_config(default_model: &ModelConfig) -> Result<ModelConfig> {
    let mut worker_config = ModelConfig::new_or_fail(&default_model.model_name)
        .with_context_limit(default_model.context_limit)
        .with_temperature(default_model.temperature)
        .with_max_tokens(default_model.max_tokens)
        .with_toolshim(default_model.toolshim)
        .with_toolshim_model(default_model.toolshim_model.clone());

    let global_config = crate::config::Config::global();

    if let Ok(limit) = global_config.get_param::<usize>("ASTER_WORKER_CONTEXT_LIMIT") {
        worker_config = worker_config.with_context_limit(Some(limit));
    } else if let Ok(limit) = global_config.get_param::<usize>("ASTER_CONTEXT_LIMIT") {
        worker_config = worker_config.with_context_limit(Some(limit));
    }

    Ok(worker_config)
}
