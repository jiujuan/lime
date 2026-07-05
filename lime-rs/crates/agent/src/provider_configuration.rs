use crate::{
    credential_bridge::{create_configured_reply_provider, ConfiguredReplyProvider},
    AgentRuntimeState,
};
use agent_runtime::turn_executor::TurnProviderConfiguration;
use app_server_protocol::ProtocolKind;
use lime_core::database::DbConnection;
use model_provider::runtime_provider::{RuntimeProviderConfig, RuntimeProviderProtocol};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionProviderConfig {
    pub provider_name: String,
    pub provider_selector: Option<String>,
    pub model_name: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub credential_uuid: Option<String>,
    pub reasoning_effort: Option<String>,
    pub route_protocol: Option<ProtocolKind>,
    pub toolshim: bool,
    pub toolshim_model: Option<String>,
    pub model_capabilities: Option<Value>,
}

struct ProviderConfigurationRequest<'a> {
    pub db: &'a DbConnection,
    pub session_id: &'a str,
    pub provider: &'a str,
    pub model: &'a str,
    pub reasoning_effort: Option<String>,
    pub route_protocol: Option<ProtocolKind>,
    pub direct_provider_config: Option<SessionProviderConfig>,
}

pub(crate) struct ConfiguredSessionProvider {
    config: SessionProviderConfig,
    provider: ConfiguredReplyProvider,
}

impl ConfiguredSessionProvider {
    pub(crate) fn into_config(self) -> SessionProviderConfig {
        self.config
    }

    pub(crate) fn reply_provider(&self) -> ConfiguredReplyProvider {
        self.provider.clone()
    }
}

#[derive(Debug, Clone)]
pub struct ModelRouteProviderConfiguration {
    pub turn_provider: TurnProviderConfiguration,
    pub route_protocol: Option<ProtocolKind>,
    pub direct_provider_config: Option<SessionProviderConfig>,
}

pub(crate) fn provider_configuration_from_model_selection(
    provider: impl Into<String>,
    model: impl Into<String>,
    reasoning_effort: Option<String>,
    route_protocol: Option<ProtocolKind>,
) -> ModelRouteProviderConfiguration {
    ModelRouteProviderConfiguration {
        turn_provider: TurnProviderConfiguration::from_model_selection(
            provider,
            model,
            reasoning_effort,
        ),
        route_protocol,
        direct_provider_config: None,
    }
}

async fn configure_provider_for_session(
    agent_state: &AgentRuntimeState,
    request: ProviderConfigurationRequest<'_>,
) -> Result<ConfiguredSessionProvider, String> {
    agent_state.init_agent_with_db(request.db).await?;

    if let Some(mut config) = request.direct_provider_config {
        config.route_protocol = request.route_protocol.or(config.route_protocol);
        let runtime_config =
            session_provider_config_to_runtime_provider_config(&config, request.session_id);
        let provider = install_provider_for_session(&runtime_config).await?;
        return Ok(ConfiguredSessionProvider { config, provider });
    }

    let mut runtime_config = agent_state
        .credential_bridge()
        .select_and_configure(request.db, request.provider, request.model)
        .await
        .map_err(|error| format!("从 API Key Provider 选择凭证失败: {error}"))?;
    runtime_config.reasoning_effort = request.reasoning_effort;
    runtime_config.protocol = runtime_provider_protocol_from_route_protocol(request.route_protocol);

    let provider = install_provider_for_session(&runtime_config).await?;
    if let Err(error) = agent_state
        .credential_bridge()
        .record_usage(request.db, &runtime_config.credential_uuid)
    {
        tracing::warn!("[AgentRuntime] 记录凭证使用失败: {}", error);
    }

    let config = SessionProviderConfig {
        provider_name: runtime_config.provider_name,
        provider_selector: runtime_config.provider_selector,
        model_name: runtime_config.model_name,
        api_key: runtime_config.api_key,
        base_url: runtime_config.base_url,
        credential_uuid: Some(runtime_config.credential_uuid),
        reasoning_effort: runtime_config.reasoning_effort,
        route_protocol: route_protocol_from_runtime_provider_protocol(runtime_config.protocol),
        toolshim: runtime_config.toolshim,
        toolshim_model: runtime_config.toolshim_model,
        model_capabilities: None,
    };
    Ok(ConfiguredSessionProvider { config, provider })
}

async fn install_provider_for_session(
    runtime_config: &RuntimeProviderConfig,
) -> Result<ConfiguredReplyProvider, String> {
    create_configured_reply_provider(runtime_config)
        .await
        .map_err(|error| format!("创建 Provider 失败: {error}"))
}

pub(crate) async fn configure_model_route_provider_for_session(
    agent_state: &AgentRuntimeState,
    db: &DbConnection,
    session_id: &str,
    configuration: ModelRouteProviderConfiguration,
) -> Result<SessionProviderConfig, String> {
    configure_model_route_provider_for_session_with_provider(
        agent_state,
        db,
        session_id,
        configuration,
    )
    .await
    .map(ConfiguredSessionProvider::into_config)
}

pub(crate) async fn configure_model_route_provider_for_session_with_provider(
    agent_state: &AgentRuntimeState,
    db: &DbConnection,
    session_id: &str,
    configuration: ModelRouteProviderConfiguration,
) -> Result<ConfiguredSessionProvider, String> {
    configure_provider_for_session(
        agent_state,
        ProviderConfigurationRequest {
            db,
            session_id,
            provider: configuration.turn_provider.route.provider.as_str(),
            model: configuration.turn_provider.route.model.as_str(),
            reasoning_effort: configuration.turn_provider.reasoning_effort,
            route_protocol: configuration.route_protocol,
            direct_provider_config: configuration.direct_provider_config,
        },
    )
    .await
}

pub fn route_protocol_from_session_provider_config(
    config: &SessionProviderConfig,
) -> Option<ProtocolKind> {
    config.route_protocol.clone()
}

fn runtime_provider_protocol_from_route_protocol(
    protocol: Option<ProtocolKind>,
) -> Option<RuntimeProviderProtocol> {
    runtime_provider_protocol_from_model_provider_protocol(
        model_provider_protocol_from_route_protocol(protocol),
    )
}

fn model_provider_protocol_from_route_protocol(
    protocol: Option<ProtocolKind>,
) -> Option<model_provider::ModelProviderProtocol> {
    match protocol? {
        ProtocolKind::OpenaiResponses | ProtocolKind::CodexResponses => {
            Some(model_provider::ModelProviderProtocol::Responses)
        }
        ProtocolKind::OpenaiChat => Some(model_provider::ModelProviderProtocol::ChatCompletions),
        _ => None,
    }
}

fn runtime_provider_protocol_from_model_provider_protocol(
    protocol: Option<model_provider::ModelProviderProtocol>,
) -> Option<RuntimeProviderProtocol> {
    match protocol {
        Some(model_provider::ModelProviderProtocol::Responses) => {
            Some(RuntimeProviderProtocol::Responses)
        }
        Some(model_provider::ModelProviderProtocol::ChatCompletions) => {
            Some(RuntimeProviderProtocol::ChatCompletions)
        }
        Some(model_provider::ModelProviderProtocol::Custom(_)) | None => None,
    }
}

fn route_protocol_from_runtime_provider_protocol(
    protocol: Option<RuntimeProviderProtocol>,
) -> Option<ProtocolKind> {
    route_protocol_from_model_provider_protocol(
        protocol.map(RuntimeProviderProtocol::to_model_provider_protocol),
    )
}

fn session_provider_config_to_runtime_provider_config(
    config: &SessionProviderConfig,
    session_id: &str,
) -> RuntimeProviderConfig {
    RuntimeProviderConfig {
        provider_name: config.provider_name.clone(),
        provider_selector: config.provider_selector.clone(),
        model_name: config.model_name.clone(),
        api_key: config.api_key.clone(),
        base_url: config.base_url.clone(),
        credential_uuid: config
            .credential_uuid
            .clone()
            .unwrap_or_else(|| format!("manual:{session_id}")),
        reasoning_effort: config.reasoning_effort.clone(),
        protocol: runtime_provider_protocol_from_route_protocol(config.route_protocol.clone()),
        toolshim: config.toolshim,
        toolshim_model: config.toolshim_model.clone(),
    }
}

fn route_protocol_from_model_provider_protocol(
    protocol: Option<model_provider::ModelProviderProtocol>,
) -> Option<ProtocolKind> {
    match protocol {
        Some(model_provider::ModelProviderProtocol::Responses) => {
            Some(ProtocolKind::OpenaiResponses)
        }
        Some(model_provider::ModelProviderProtocol::ChatCompletions) => {
            Some(ProtocolKind::OpenaiChat)
        }
        Some(model_provider::ModelProviderProtocol::Custom(_)) | None => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn route_protocol_is_projected_to_model_provider_protocol() {
        assert_eq!(
            model_provider_protocol_from_route_protocol(Some(ProtocolKind::OpenaiResponses)),
            Some(model_provider::ModelProviderProtocol::Responses)
        );
        assert_eq!(
            model_provider_protocol_from_route_protocol(Some(ProtocolKind::CodexResponses)),
            Some(model_provider::ModelProviderProtocol::Responses)
        );
        assert_eq!(
            model_provider_protocol_from_route_protocol(Some(ProtocolKind::OpenaiChat)),
            Some(model_provider::ModelProviderProtocol::ChatCompletions)
        );
        assert_eq!(
            model_provider_protocol_from_route_protocol(Some(ProtocolKind::AnthropicMessages)),
            None
        );
    }

    #[test]
    fn model_provider_protocol_is_projected_to_runtime_adapter_protocol() {
        assert_eq!(
            runtime_provider_protocol_from_route_protocol(Some(ProtocolKind::OpenaiResponses)),
            Some(RuntimeProviderProtocol::Responses)
        );
        assert_eq!(
            runtime_provider_protocol_from_route_protocol(Some(ProtocolKind::CodexResponses)),
            Some(RuntimeProviderProtocol::Responses)
        );
        assert_eq!(
            runtime_provider_protocol_from_route_protocol(Some(ProtocolKind::OpenaiChat)),
            Some(RuntimeProviderProtocol::ChatCompletions)
        );
        assert_eq!(
            runtime_provider_protocol_from_route_protocol(Some(ProtocolKind::AnthropicMessages)),
            None
        );
    }

    #[test]
    fn provider_config_protocol_projects_to_route_protocol() {
        let mut config = SessionProviderConfig {
            provider_name: "openai".to_string(),
            provider_selector: Some("openai".to_string()),
            model_name: "gpt-4.1".to_string(),
            api_key: None,
            base_url: None,
            credential_uuid: None,
            reasoning_effort: None,
            route_protocol: Some(ProtocolKind::OpenaiResponses),
            toolshim: false,
            toolshim_model: None,
            model_capabilities: None,
        };
        assert_eq!(
            route_protocol_from_session_provider_config(&config),
            Some(ProtocolKind::OpenaiResponses)
        );

        config.route_protocol = Some(ProtocolKind::OpenaiChat);
        assert_eq!(
            route_protocol_from_session_provider_config(&config),
            Some(ProtocolKind::OpenaiChat)
        );
    }
}
