use super::provider_env::{set_provider_env_vars, should_disable_provider_default_fast_model};
use super::provider_safety::wrap_provider_with_safety;
use super::CredentialBridgeError;
use aster::agents::{Agent, AgentEvent as AsterAgentEvent};
use aster::conversation::message::Message as AsterMessage;
use aster::model::ModelConfig;
use aster::providers::base::Provider;
use futures::stream::BoxStream;
use model_provider::runtime_provider::RuntimeProviderConfig;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

/// 迁移期 session provider handle。
///
/// runtime provider trait 只在本 adapter 内部暴露；调用方只持有 handle，
/// 等 current runtime provider stream 接管后替换这里的内部实现。
#[derive(Clone)]
pub(crate) struct SessionProviderHandle {
    provider: Arc<dyn Provider>,
}

impl SessionProviderHandle {
    pub(crate) async fn reply_stream_with_agent<'a>(
        &self,
        agent: &'a Agent,
        user_message: AsterMessage,
        session_config: aster::agents::SessionConfig,
        cancel_token: Option<CancellationToken>,
    ) -> anyhow::Result<BoxStream<'a, anyhow::Result<AsterAgentEvent>>> {
        agent
            .reply_with_provider(
                user_message,
                session_config,
                cancel_token,
                self.provider.clone(),
            )
            .await
    }
}

pub(crate) async fn create_session_provider_handle(
    config: &RuntimeProviderConfig,
) -> Result<SessionProviderHandle, CredentialBridgeError> {
    create_runtime_provider_handle_inner(config)
        .await
        .map(|provider| SessionProviderHandle { provider })
}

/// RuntimeProviderConfig 到 runtime provider 的迁移期 adapter。
///
/// 设置环境变量并调用 aster::providers::create。
async fn create_runtime_provider_handle_inner(
    config: &RuntimeProviderConfig,
) -> Result<Arc<dyn Provider>, CredentialBridgeError> {
    let disable_default_fast_model = should_disable_provider_default_fast_model(config);

    if disable_default_fast_model {
        tracing::info!(
            provider_name = %config.provider_name,
            provider_selector = ?config.provider_selector,
            model_name = %config.model_name,
            "[CredentialBridge] 检测到 OpenAI 兼容非 OpenAI provider，已禁用默认 fast_model"
        );
    }

    set_provider_env_vars(config);

    let model_config = build_provider_model_config(config)?;

    aster::providers::create(&config.provider_name, model_config)
        .await
        .map(|provider| wrap_provider_with_safety(provider, disable_default_fast_model))
        .map_err(|e| {
            CredentialBridgeError::ProviderCreationFailed(format!("创建 Provider 失败: {e}"))
        })
}

fn build_provider_model_config(
    config: &RuntimeProviderConfig,
) -> Result<ModelConfig, CredentialBridgeError> {
    ModelConfig::new(&config.model_name)
        .map(|model_config| {
            model_config
                .with_toolshim(config.toolshim)
                .with_toolshim_model(config.toolshim_model.clone())
                .with_reasoning_effort(config.reasoning_effort.clone())
        })
        .map_err(|e| {
            CredentialBridgeError::ProviderCreationFailed(format!("创建 ModelConfig 失败: {e}"))
        })
}

#[cfg(test)]
mod tests {
    use super::build_provider_model_config;
    use model_provider::runtime_provider::{RuntimeProviderConfig, RuntimeProviderProtocol};

    #[test]
    fn test_build_provider_model_config_applies_toolshim_override() {
        let config = RuntimeProviderConfig {
            provider_name: "openai".to_string(),
            provider_selector: Some("ollama".to_string()),
            model_name: "gpt-4.1".to_string(),
            api_key: None,
            base_url: None,
            credential_uuid: "test-uuid".to_string(),
            reasoning_effort: Some("high".to_string()),
            protocol: Some(RuntimeProviderProtocol::ChatCompletions),
            toolshim: true,
            toolshim_model: Some("gpt-4o-mini".to_string()),
        };

        let model_config = build_provider_model_config(&config).expect("build model config");

        assert!(model_config.toolshim);
        assert_eq!(model_config.toolshim_model.as_deref(), Some("gpt-4o-mini"));
        assert_eq!(model_config.reasoning_effort.as_deref(), Some("high"));
    }
}
