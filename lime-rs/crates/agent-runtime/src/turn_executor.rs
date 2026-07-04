use agent_protocol::ModelId;
use model_provider::{ModelProviderProtocol, ModelRoute};
use serde::{Deserialize, Serialize};

/// Turn provider 配置。
///
/// 这是 current runtime 侧的 provider route 事实源；具体 provider runtime 注入由下游
/// adapter 负责，不在调用方重新拼 Aster session 配置。
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TurnProviderConfiguration {
    /// 已解析的 provider route
    pub route: ModelRoute,
    /// 推理强度覆盖（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
}

impl TurnProviderConfiguration {
    pub fn from_model_selection(
        provider: impl Into<String>,
        model: impl Into<String>,
        reasoning_effort: Option<String>,
    ) -> Self {
        let provider = provider.into();
        let model = model.into();
        Self {
            route: ModelRoute {
                provider,
                model: ModelId::new(model),
                protocol: ModelProviderProtocol::Custom("unspecified".to_string()),
                capabilities: Vec::new(),
                metadata: serde_json::json!({
                    "source": "model_selection",
                }),
            },
            reasoning_effort,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn turn_provider_configuration_projects_model_selection() {
        let configuration = TurnProviderConfiguration::from_model_selection(
            "openai",
            "gpt-4.1",
            Some("medium".to_string()),
        );

        assert_eq!(configuration.route.provider, "openai");
        assert_eq!(configuration.route.model.as_str(), "gpt-4.1");
        assert_eq!(
            configuration.route.protocol,
            ModelProviderProtocol::Custom("unspecified".to_string())
        );
        assert_eq!(configuration.reasoning_effort.as_deref(), Some("medium"));
    }
}
