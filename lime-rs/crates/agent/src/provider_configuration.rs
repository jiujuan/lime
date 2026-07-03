use crate::{AsterAgentState, AsterProviderProtocol, ProviderConfig};
use app_server_protocol::ProtocolKind;
use lime_core::database::DbConnection;

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
    let protocol = aster_provider_protocol_from_route_protocol(request.route_protocol);
    if let Some(mut config) = request.direct_provider_config {
        config.protocol = protocol.or(config.protocol);
        agent_state
            .configure_provider(config.clone(), request.session_id, request.db)
            .await?;
        return Ok(config);
    }

    let aster_config = agent_state
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
        provider_name: aster_config.provider_name,
        provider_selector: aster_config.provider_selector,
        model_name: aster_config.model_name,
        api_key: aster_config.api_key,
        base_url: aster_config.base_url,
        credential_uuid: Some(aster_config.credential_uuid),
        reasoning_effort: aster_config.reasoning_effort,
        protocol: aster_config.protocol,
        toolshim: aster_config.toolshim,
        toolshim_model: aster_config.toolshim_model,
    })
}

pub fn route_protocol_from_provider_config(config: &ProviderConfig) -> Option<ProtocolKind> {
    route_protocol_from_aster_protocol(config.protocol)
}

fn aster_provider_protocol_from_route_protocol(
    protocol: Option<ProtocolKind>,
) -> Option<AsterProviderProtocol> {
    match protocol? {
        ProtocolKind::OpenaiResponses | ProtocolKind::CodexResponses => {
            Some(AsterProviderProtocol::Responses)
        }
        ProtocolKind::OpenaiChat => Some(AsterProviderProtocol::ChatCompletions),
        _ => None,
    }
}

fn route_protocol_from_aster_protocol(
    protocol: Option<AsterProviderProtocol>,
) -> Option<ProtocolKind> {
    match protocol {
        Some(AsterProviderProtocol::Responses) => Some(ProtocolKind::OpenaiResponses),
        Some(AsterProviderProtocol::ChatCompletions) => Some(ProtocolKind::OpenaiChat),
        None => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn route_protocol_is_projected_to_aster_adapter_protocol() {
        assert_eq!(
            aster_provider_protocol_from_route_protocol(Some(ProtocolKind::OpenaiResponses)),
            Some(AsterProviderProtocol::Responses)
        );
        assert_eq!(
            aster_provider_protocol_from_route_protocol(Some(ProtocolKind::CodexResponses)),
            Some(AsterProviderProtocol::Responses)
        );
        assert_eq!(
            aster_provider_protocol_from_route_protocol(Some(ProtocolKind::OpenaiChat)),
            Some(AsterProviderProtocol::ChatCompletions)
        );
        assert_eq!(
            aster_provider_protocol_from_route_protocol(Some(ProtocolKind::AnthropicMessages)),
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
            protocol: Some(AsterProviderProtocol::Responses),
            toolshim: false,
            toolshim_model: None,
        };
        assert_eq!(
            route_protocol_from_provider_config(&config),
            Some(ProtocolKind::OpenaiResponses)
        );

        config.protocol = Some(AsterProviderProtocol::ChatCompletions);
        assert_eq!(
            route_protocol_from_provider_config(&config),
            Some(ProtocolKind::OpenaiChat)
        );
    }
}
