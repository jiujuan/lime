use crate::{AsterAgentState, ProviderConfig, RuntimeProviderProtocol};
use app_server_protocol::ProtocolKind;
use lime_core::database::DbConnection;
use model_provider::ModelProviderProtocol;

pub struct ProviderConfigurationRequest<'a> {
    pub db: &'a DbConnection,
    pub session_id: &'a str,
    pub provider: &'a str,
    pub model: &'a str,
    pub reasoning_effort: Option<String>,
    pub route_protocol: Option<ProtocolKind>,
    pub direct_provider_config: Option<ProviderConfig>,
}

pub async fn configure_provider_for_session(
    agent_state: &AsterAgentState,
    request: ProviderConfigurationRequest<'_>,
) -> Result<ProviderConfig, String> {
    let protocol = runtime_provider_protocol_from_route_protocol(request.route_protocol);
    if let Some(mut config) = request.direct_provider_config {
        config.protocol = protocol.or(config.protocol);
        agent_state
            .configure_provider(config.clone(), request.session_id, request.db)
            .await?;
        return Ok(config);
    }

    let runtime_config = agent_state
        .configure_provider_from_pool(
            request.db,
            request.provider,
            request.model,
            request.session_id,
            request.reasoning_effort,
            protocol,
        )
        .await?;
    Ok(ProviderConfig {
        provider_name: runtime_config.provider_name,
        provider_selector: runtime_config.provider_selector,
        model_name: runtime_config.model_name,
        api_key: runtime_config.api_key,
        base_url: runtime_config.base_url,
        credential_uuid: Some(runtime_config.credential_uuid),
        reasoning_effort: runtime_config.reasoning_effort,
        protocol: runtime_config.protocol,
        toolshim: runtime_config.toolshim,
        toolshim_model: runtime_config.toolshim_model,
    })
}

pub fn route_protocol_from_provider_config(config: &ProviderConfig) -> Option<ProtocolKind> {
    route_protocol_from_model_provider_protocol(model_provider_protocol_from_runtime_protocol(
        config.protocol,
    ))
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
) -> Option<ModelProviderProtocol> {
    match protocol? {
        ProtocolKind::OpenaiResponses | ProtocolKind::CodexResponses => {
            Some(ModelProviderProtocol::Responses)
        }
        ProtocolKind::OpenaiChat => Some(ModelProviderProtocol::ChatCompletions),
        _ => None,
    }
}

fn runtime_provider_protocol_from_model_provider_protocol(
    protocol: Option<ModelProviderProtocol>,
) -> Option<RuntimeProviderProtocol> {
    match protocol {
        Some(ModelProviderProtocol::Responses) => Some(RuntimeProviderProtocol::Responses),
        Some(ModelProviderProtocol::ChatCompletions) => {
            Some(RuntimeProviderProtocol::ChatCompletions)
        }
        Some(ModelProviderProtocol::Custom(_)) | None => None,
    }
}

fn model_provider_protocol_from_runtime_protocol(
    protocol: Option<RuntimeProviderProtocol>,
) -> Option<ModelProviderProtocol> {
    match protocol {
        Some(RuntimeProviderProtocol::Responses) => Some(ModelProviderProtocol::Responses),
        Some(RuntimeProviderProtocol::ChatCompletions) => {
            Some(ModelProviderProtocol::ChatCompletions)
        }
        None => None,
    }
}

fn route_protocol_from_model_provider_protocol(
    protocol: Option<ModelProviderProtocol>,
) -> Option<ProtocolKind> {
    match protocol {
        Some(ModelProviderProtocol::Responses) => Some(ProtocolKind::OpenaiResponses),
        Some(ModelProviderProtocol::ChatCompletions) => Some(ProtocolKind::OpenaiChat),
        Some(ModelProviderProtocol::Custom(_)) | None => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn route_protocol_is_projected_to_model_provider_protocol() {
        assert_eq!(
            model_provider_protocol_from_route_protocol(Some(ProtocolKind::OpenaiResponses)),
            Some(ModelProviderProtocol::Responses)
        );
        assert_eq!(
            model_provider_protocol_from_route_protocol(Some(ProtocolKind::CodexResponses)),
            Some(ModelProviderProtocol::Responses)
        );
        assert_eq!(
            model_provider_protocol_from_route_protocol(Some(ProtocolKind::OpenaiChat)),
            Some(ModelProviderProtocol::ChatCompletions)
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
        let mut config = ProviderConfig {
            provider_name: "openai".to_string(),
            provider_selector: Some("openai".to_string()),
            model_name: "gpt-4.1".to_string(),
            api_key: None,
            base_url: None,
            credential_uuid: None,
            reasoning_effort: None,
            protocol: Some(RuntimeProviderProtocol::Responses),
            toolshim: false,
            toolshim_model: None,
        };
        assert_eq!(
            route_protocol_from_provider_config(&config),
            Some(ProtocolKind::OpenaiResponses)
        );

        config.protocol = Some(RuntimeProviderProtocol::ChatCompletions);
        assert_eq!(
            route_protocol_from_provider_config(&config),
            Some(ProtocolKind::OpenaiChat)
        );
    }
}
