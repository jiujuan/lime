use super::{CredentialBridgeError, RuntimeProviderConfig};
use crate::provider_safety::wrap_provider_with_safety;
use agent_protocol::ModelId;
use aster::conversation::message::Message as AsterMessage;
use aster::model::ModelConfig;
use aster::providers::base::{Provider, ProviderUsage};
use model_provider::router::{
    ContentBlock, Message as ProviderMessage, MessageRole, ProviderRequest, ProviderResponse,
    TokenUsage,
};
use model_provider::runtime_provider::RuntimeProvider;
use model_provider::{ModelProviderError, ModelProviderResult};
use serde_json::Value;
use std::sync::Arc;

use super::provider_env::{set_provider_env_vars, should_disable_provider_default_fast_model};

/// RuntimeProviderConfig 到 Aster runtime provider 的迁移期 factory adapter。
///
/// 仅供 Aster Agent `update_provider(...)` compat 边界使用。
pub(crate) async fn create_aster_runtime_provider(
    config: &RuntimeProviderConfig,
) -> Result<Arc<dyn Provider>, CredentialBridgeError> {
    create_aster_provider(config).await
}

/// RuntimeProviderConfig 到 Lime-owned runtime provider trait 的 factory facade。
///
/// Aster Provider trait 只保留在本模块的 adapter 内。
pub async fn create_model_runtime_provider(
    config: &RuntimeProviderConfig,
) -> Result<Arc<dyn RuntimeProvider>, CredentialBridgeError> {
    let provider = create_aster_provider(config).await?;
    Ok(Arc::new(AsterRuntimeProviderAdapter { provider }))
}

struct AsterRuntimeProviderAdapter {
    provider: Arc<dyn Provider>,
}

#[async_trait::async_trait]
impl RuntimeProvider for AsterRuntimeProviderAdapter {
    async fn complete(&self, request: &ProviderRequest) -> ModelProviderResult<ProviderResponse> {
        let (system_prompt, messages) =
            build_aster_completion_input(request).map_err(model_provider_error)?;

        let (response, usage) = self
            .provider
            .complete(&system_prompt, &messages, &[])
            .await
            .map_err(|e| ModelProviderError::new(format!("执行 Provider 请求失败: {e}")))?;

        Ok(build_provider_response(request, response, usage))
    }
}

fn model_provider_error(error: CredentialBridgeError) -> ModelProviderError {
    ModelProviderError::new(error.to_string())
}

/// RuntimeProviderConfig 到 Aster provider 的迁移期 adapter。
///
/// 设置环境变量并调用 aster::providers::create。
async fn create_aster_provider(
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

fn build_aster_completion_input(
    request: &ProviderRequest,
) -> Result<(String, Vec<AsterMessage>), CredentialBridgeError> {
    if request.stream {
        return Err(CredentialBridgeError::ProviderExecutionFailed(
            "迁移期 provider compat adapter 尚不支持 stream=true 请求".to_string(),
        ));
    }

    if request
        .tools
        .as_ref()
        .is_some_and(|tools| !tools.is_empty())
    {
        return Err(CredentialBridgeError::ProviderExecutionFailed(
            "迁移期 provider compat adapter 尚不支持 tools 请求".to_string(),
        ));
    }

    if request.tool_choice.is_some() {
        return Err(CredentialBridgeError::ProviderExecutionFailed(
            "迁移期 provider compat adapter 尚不支持 tool_choice 请求".to_string(),
        ));
    }

    let mut system_parts = Vec::new();
    let mut messages = Vec::new();

    for message in &request.messages {
        let text = extract_text_content(message)?;
        match message.role {
            MessageRole::System => system_parts.push(text),
            MessageRole::User => messages.push(AsterMessage::user().with_text(text)),
            MessageRole::Assistant => messages.push(AsterMessage::assistant().with_text(text)),
            MessageRole::Tool => {
                return Err(CredentialBridgeError::ProviderExecutionFailed(
                    "迁移期 provider compat adapter 尚不支持 tool role 消息".to_string(),
                ));
            }
        }
    }

    Ok((system_parts.join("\n\n"), messages))
}

fn extract_text_content(message: &ProviderMessage) -> Result<String, CredentialBridgeError> {
    let mut text_parts = Vec::new();

    for block in &message.content {
        match block {
            ContentBlock::Text { text } => text_parts.push(text.as_str()),
            _ => {
                return Err(CredentialBridgeError::ProviderExecutionFailed(
                    "迁移期 provider compat adapter 尚只支持 text content block".to_string(),
                ));
            }
        }
    }

    Ok(text_parts.join("\n"))
}

fn build_provider_response(
    request: &ProviderRequest,
    response: AsterMessage,
    usage: ProviderUsage,
) -> ProviderResponse {
    ProviderResponse {
        id: request.turn_id.to_string(),
        model: response_model(request, &usage),
        content: vec![ContentBlock::Text {
            text: response.as_concat_text(),
        }],
        usage: TokenUsage::new(
            non_negative_token_count(usage.usage.input_tokens),
            non_negative_token_count(usage.usage.output_tokens),
        ),
        stop_reason: None,
        metadata: Value::Null,
    }
}

fn response_model(request: &ProviderRequest, usage: &ProviderUsage) -> ModelId {
    if usage.model.is_empty() {
        request.model.clone()
    } else {
        ModelId::new(usage.model.clone())
    }
}

fn non_negative_token_count(value: Option<i32>) -> u32 {
    value.unwrap_or(0).max(0) as u32
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
    use super::{
        build_aster_completion_input, build_provider_model_config, non_negative_token_count,
    };
    use crate::{RuntimeProviderConfig, RuntimeProviderProtocol};
    use agent_protocol::{ModelId, TurnId};
    use model_provider::router::{ContentBlock, Message, MessageRole, ProviderRequest};
    use serde_json::Value;

    fn provider_request(messages: Vec<Message>) -> ProviderRequest {
        ProviderRequest {
            turn_id: TurnId::new("turn-1"),
            model: ModelId::new("claude-sonnet-4-20250514"),
            messages,
            stream: false,
            max_tokens: None,
            temperature: None,
            tools: None,
            tool_choice: None,
            metadata: Value::Null,
        }
    }

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

    #[test]
    fn test_build_aster_completion_input_maps_text_messages() {
        let request = provider_request(vec![
            Message {
                role: MessageRole::System,
                content: vec![ContentBlock::Text {
                    text: "系统提示".to_string(),
                }],
                metadata: Value::Null,
            },
            Message {
                role: MessageRole::User,
                content: vec![ContentBlock::Text {
                    text: "用户任务".to_string(),
                }],
                metadata: Value::Null,
            },
        ]);

        let (system_prompt, messages) =
            build_aster_completion_input(&request).expect("completion input");

        assert_eq!(system_prompt, "系统提示");
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].as_concat_text(), "用户任务");
    }

    #[test]
    fn test_build_aster_completion_input_rejects_tool_blocks() {
        let request = provider_request(vec![Message {
            role: MessageRole::User,
            content: vec![ContentBlock::ToolUse {
                id: "tool-1".to_string(),
                name: "read_file".to_string(),
                input: Value::Null,
            }],
            metadata: Value::Null,
        }]);

        let err = build_aster_completion_input(&request).expect_err("tool block should fail");

        assert!(err.to_string().contains("text content block"));
    }

    #[test]
    fn test_non_negative_token_count_clamps_negative_values() {
        assert_eq!(non_negative_token_count(Some(-5)), 0);
        assert_eq!(non_negative_token_count(Some(42)), 42);
        assert_eq!(non_negative_token_count(None), 0);
    }
}
