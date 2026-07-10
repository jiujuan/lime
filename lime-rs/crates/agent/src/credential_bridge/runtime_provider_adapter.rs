use super::provider_env::{set_provider_env_vars, should_disable_provider_default_fast_model};
use super::CredentialBridgeError;
use aster::{
    LeadWorkerProviderTrait, MessageStream, ModelConfig, Provider, ProviderError, ProviderMetadata,
    ProviderUsage, RetryConfig, SessionNameGenerationExecutionStrategy,
};
use aster::{Message, MessageContent};
use async_trait::async_trait;
use model_provider::provider_stream::{
    RuntimeProviderBackend, RuntimeReplyProviderBinding, RuntimeReplyProviderCapabilities,
    RuntimeReplyProviderHandle,
};
use model_provider::runtime_provider::RuntimeProviderConfig;
use model_provider::safety::{
    normalize_fast_model, normalize_provider_tool_messages, truncate_provider_text,
    ProviderToolContentProjection, ProviderToolMessageProjection, ProviderToolMessageRole,
};
use rmcp::model::Tool;
use std::sync::Arc;

/// 当前回合配置好的 reply provider。
///
/// 本 adapter 只负责创建 provider binding；Aster reply execution 留在
/// request_tool_policy 的 compat source adapter，等 current provider stream 接管后删除。
#[derive(Clone)]
pub(crate) struct ConfiguredReplyProvider {
    binding: RuntimeReplyProviderBinding<CompatAsterReplyProviderBackend>,
}

impl ConfiguredReplyProvider {
    pub(crate) fn runtime_handle(&self) -> &RuntimeReplyProviderHandle {
        self.binding.handle()
    }

    pub(crate) fn into_compat_provider(self) -> Arc<dyn Provider> {
        self.binding.into_backend().into_inner()
    }
}

pub(crate) async fn create_configured_reply_provider(
    config: &RuntimeProviderConfig,
) -> Result<ConfiguredReplyProvider, CredentialBridgeError> {
    let backend = CompatAsterReplyProviderBackend::from_config(config).await?;
    let capabilities = backend.capabilities();
    let handle =
        RuntimeReplyProviderHandle::from_config(config, RuntimeProviderBackend::AsterCompat)
            .with_capabilities(capabilities);

    Ok(ConfiguredReplyProvider {
        binding: RuntimeReplyProviderBinding::new(handle, backend),
    })
}

/// RuntimeProviderConfig 到 Aster provider trait object 的迁移期 backend。
///
/// 裸 Aster Provider 只允许停留在这里；外层只传递 RuntimeReplyProviderHandle。
#[derive(Clone)]
struct CompatAsterReplyProviderBackend {
    inner: Arc<dyn Provider>,
}

impl CompatAsterReplyProviderBackend {
    async fn from_config(config: &RuntimeProviderConfig) -> Result<Self, CredentialBridgeError> {
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

        aster::create_provider(&config.provider_name, model_config)
            .await
            .map(|provider| Self {
                inner: wrap_provider_with_safety(provider, disable_default_fast_model),
            })
            .map_err(|e| {
                CredentialBridgeError::ProviderCreationFailed(format!("创建 Provider 失败: {e}"))
            })
    }

    fn capabilities(&self) -> RuntimeReplyProviderCapabilities {
        RuntimeReplyProviderCapabilities {
            supports_streaming: self.inner.supports_streaming(),
            supports_embeddings: self.inner.supports_embeddings(),
            active_model_name: Some(self.inner.get_active_model_name()),
        }
    }

    fn into_inner(self) -> Arc<dyn Provider> {
        self.inner
    }
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

fn wrap_provider_with_safety(
    provider: Arc<dyn Provider>,
    disable_default_fast_model: bool,
) -> Arc<dyn Provider> {
    Arc::new(ProviderSafety {
        inner: provider,
        disable_default_fast_model,
    })
}

fn normalize_provider_messages(messages: &[Message]) -> Vec<Message> {
    let projections = messages
        .iter()
        .map(project_provider_tool_message)
        .collect::<Vec<_>>();
    let normalization = normalize_provider_tool_messages(&projections);
    let normalized_messages = messages
        .iter()
        .zip(normalization.messages.iter())
        .filter_map(|(message, message_normalization)| {
            let content = message_normalization
                .retained_content_indices
                .iter()
                .filter_map(|content_index| message.content.get(*content_index).cloned())
                .collect::<Vec<_>>();
            if content.is_empty() {
                return None;
            }
            let mut normalized = message.clone();
            normalized.content = content;
            Some(normalized)
        })
        .collect::<Vec<_>>();

    if normalization.removed_invalid_requests > 0 || normalization.removed_invalid_responses > 0 {
        tracing::warn!(
            removed_invalid_requests = normalization.removed_invalid_requests,
            removed_invalid_responses = normalization.removed_invalid_responses,
            "[ProviderSafety] 已在 provider 请求前归一化工具消息链"
        );
    }

    normalized_messages
}

fn project_provider_tool_message(message: &Message) -> ProviderToolMessageProjection {
    ProviderToolMessageProjection {
        role: match message.role {
            rmcp::model::Role::Assistant => ProviderToolMessageRole::Assistant,
            rmcp::model::Role::User => ProviderToolMessageRole::User,
        },
        contents: message
            .content
            .iter()
            .map(project_provider_tool_content)
            .collect(),
    }
}

fn project_provider_tool_content(content: &MessageContent) -> ProviderToolContentProjection {
    match content {
        MessageContent::ToolRequest(request) => ProviderToolContentProjection::ToolRequest {
            id: request.id.clone(),
            valid: request.tool_call.is_ok(),
        },
        MessageContent::FrontendToolRequest(request) => {
            ProviderToolContentProjection::FrontendToolRequest {
                id: request.id.clone(),
                valid: request.tool_call.is_ok(),
            }
        }
        MessageContent::ToolResponse(response) => ProviderToolContentProjection::ToolResponse {
            id: response.id.clone(),
        },
        _ => ProviderToolContentProjection::Other,
    }
}

fn normalize_provider_model_config(
    model_config: &ModelConfig,
    disable_default_fast_model: bool,
) -> ModelConfig {
    if !disable_default_fast_model || model_config.fast_model.is_none() {
        return model_config.clone();
    }

    let mut normalized = model_config.clone();
    normalized.fast_model = normalize_fast_model(normalized.fast_model, disable_default_fast_model);
    normalized
}

struct ProviderSafety {
    inner: Arc<dyn Provider>,
    disable_default_fast_model: bool,
}

#[async_trait]
impl Provider for ProviderSafety {
    fn metadata() -> ProviderMetadata
    where
        Self: Sized,
    {
        ProviderMetadata::empty()
    }

    fn get_name(&self) -> &str {
        self.inner.get_name()
    }

    async fn complete_with_model(
        &self,
        model_config: &ModelConfig,
        system: &str,
        messages: &[Message],
        tools: &[Tool],
    ) -> Result<(Message, ProviderUsage), ProviderError> {
        let normalized_messages = normalize_provider_messages(messages);
        let normalized_model_config =
            normalize_provider_model_config(model_config, self.disable_default_fast_model);
        self.inner
            .complete_with_model(
                &normalized_model_config,
                system,
                &normalized_messages,
                tools,
            )
            .await
    }

    fn get_model_config(&self) -> ModelConfig {
        normalize_provider_model_config(
            &self.inner.get_model_config(),
            self.disable_default_fast_model,
        )
    }

    fn retry_config(&self) -> RetryConfig {
        self.inner.retry_config()
    }

    async fn fetch_supported_models(&self) -> Result<Option<Vec<String>>, ProviderError> {
        self.inner.fetch_supported_models().await
    }

    async fn fetch_recommended_models(&self) -> Result<Option<Vec<String>>, ProviderError> {
        self.inner.fetch_recommended_models().await
    }

    async fn map_to_canonical_model(
        &self,
        provider_model: &str,
    ) -> Result<Option<String>, ProviderError> {
        self.inner.map_to_canonical_model(provider_model).await
    }

    fn supports_embeddings(&self) -> bool {
        self.inner.supports_embeddings()
    }

    async fn supports_cache_control(&self) -> bool {
        self.inner.supports_cache_control().await
    }

    async fn create_embeddings(&self, texts: Vec<String>) -> Result<Vec<Vec<f32>>, ProviderError> {
        self.inner.create_embeddings(texts).await
    }

    fn as_lead_worker(&self) -> Option<&dyn LeadWorkerProviderTrait> {
        self.inner.as_lead_worker()
    }

    async fn stream(
        &self,
        system: &str,
        messages: &[Message],
        tools: &[Tool],
    ) -> Result<MessageStream, ProviderError> {
        let normalized_messages = normalize_provider_messages(messages);
        self.inner.stream(system, &normalized_messages, tools).await
    }

    fn supports_streaming(&self) -> bool {
        self.inner.supports_streaming()
    }

    fn get_active_model_name(&self) -> String {
        self.inner.get_active_model_name()
    }

    async fn generate_session_name(
        &self,
        messages: &aster::Conversation,
    ) -> Result<String, ProviderError> {
        if !self.disable_default_fast_model {
            return self.inner.generate_session_name(messages).await;
        }

        let context = self.get_initial_user_messages(messages);
        let prompt = self.create_session_name_prompt(&context);
        let message = Message::user().with_text(&prompt);
        let result = self
            .complete_fast(
                "Reply with only a description in four words or less",
                &[message],
                &[],
            )
            .await?;

        let description = result
            .0
            .as_concat_text()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");

        Ok(truncate_provider_text(&description, 100))
    }

    fn session_name_generation_execution_strategy(&self) -> SessionNameGenerationExecutionStrategy {
        self.inner.session_name_generation_execution_strategy()
    }

    async fn configure_oauth(&self) -> Result<(), ProviderError> {
        self.inner.configure_oauth().await
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_provider_model_config, normalize_provider_messages, normalize_provider_model_config,
        wrap_provider_with_safety,
    };
    use aster::Conversation;
    use aster::{Message, MessageContent};
    use aster::{
        ModelConfig, Provider, ProviderError, ProviderMetadata, ProviderUsage,
        SessionNameGenerationExecutionStrategy, Usage,
    };
    use async_trait::async_trait;
    use model_provider::runtime_provider::{RuntimeProviderConfig, RuntimeProviderProtocol};
    use rmcp::model::{CallToolRequestParam, CallToolResult, ErrorCode, ErrorData, Tool};
    use rmcp::object;
    use std::sync::{Arc, Mutex};

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

    fn valid_tool_response() -> CallToolResult {
        CallToolResult {
            content: vec![],
            structured_content: None,
            is_error: Some(false),
            meta: None,
        }
    }

    fn invalid_tool_call_error(message: &str) -> ErrorData {
        ErrorData {
            code: ErrorCode::INTERNAL_ERROR,
            message: std::borrow::Cow::Owned(message.to_string()),
            data: None,
        }
    }

    #[test]
    fn normalize_provider_messages_should_preserve_valid_tool_chain() {
        let messages = vec![
            Message::user().with_text("帮我读一下项目结构"),
            Message::assistant()
                .with_text("我先检查目录。")
                .with_tool_request(
                    "tool-1",
                    Ok(CallToolRequestParam {
                        name: "read_dir".into(),
                        arguments: Some(object!({"path": "."})),
                    }),
                ),
            Message::user().with_tool_response("tool-1", Ok(valid_tool_response())),
            Message::assistant().with_text("目录读取完成。"),
        ];

        let normalized = normalize_provider_messages(&messages);

        assert_eq!(normalized, messages);
    }

    #[test]
    fn normalize_provider_model_config_should_strip_fast_model_when_disabled() {
        let model_config = ModelConfig::new("glm-5")
            .expect("create model config")
            .with_fast("gpt-4o-mini".to_string());

        let normalized = normalize_provider_model_config(&model_config, true);

        assert_eq!(normalized.model_name, "glm-5");
        assert_eq!(normalized.fast_model, None);
    }

    #[test]
    fn normalize_provider_model_config_should_preserve_fast_model_when_allowed() {
        let model_config = ModelConfig::new("gpt-4o")
            .expect("create model config")
            .with_fast("gpt-4o-mini".to_string());

        let normalized = normalize_provider_model_config(&model_config, false);

        assert_eq!(normalized.fast_model.as_deref(), Some("gpt-4o-mini"));
    }

    #[derive(Clone)]
    struct RecordingProvider {
        model_config: ModelConfig,
        seen_models: Arc<Mutex<Vec<String>>>,
    }

    #[async_trait]
    impl Provider for RecordingProvider {
        fn metadata() -> ProviderMetadata
        where
            Self: Sized,
        {
            ProviderMetadata::empty()
        }

        fn get_name(&self) -> &str {
            "recording"
        }

        async fn complete_with_model(
            &self,
            model_config: &ModelConfig,
            _system: &str,
            _messages: &[Message],
            _tools: &[Tool],
        ) -> Result<(Message, ProviderUsage), ProviderError> {
            self.seen_models
                .lock()
                .expect("record model config")
                .push(model_config.model_name.clone());
            Ok((
                Message::assistant().with_text("ok"),
                ProviderUsage::new(model_config.model_name.clone(), Usage::default()),
            ))
        }

        fn get_model_config(&self) -> ModelConfig {
            self.model_config.clone()
        }
    }

    #[derive(Clone)]
    struct SessionNamingProvider {
        model_config: ModelConfig,
    }

    #[async_trait]
    impl Provider for SessionNamingProvider {
        fn metadata() -> ProviderMetadata
        where
            Self: Sized,
        {
            ProviderMetadata::empty()
        }

        fn get_name(&self) -> &str {
            "session-naming"
        }

        async fn complete_with_model(
            &self,
            model_config: &ModelConfig,
            _system: &str,
            _messages: &[Message],
            _tools: &[Tool],
        ) -> Result<(Message, ProviderUsage), ProviderError> {
            Ok((
                Message::assistant().with_text("ok"),
                ProviderUsage::new(model_config.model_name.clone(), Usage::default()),
            ))
        }

        fn get_model_config(&self) -> ModelConfig {
            self.model_config.clone()
        }

        async fn generate_session_name(
            &self,
            _messages: &aster::Conversation,
        ) -> Result<String, ProviderError> {
            Ok("wrapped-title".to_string())
        }

        fn session_name_generation_execution_strategy(
            &self,
        ) -> SessionNameGenerationExecutionStrategy {
            SessionNameGenerationExecutionStrategy::AfterReply
        }
    }

    #[tokio::test]
    async fn wrap_provider_with_safety_should_disable_fast_model_for_complete_fast() {
        let seen_models = Arc::new(Mutex::new(Vec::new()));
        let provider = Arc::new(RecordingProvider {
            model_config: ModelConfig::new("glm-5")
                .expect("create model config")
                .with_fast("gpt-4o-mini".to_string()),
            seen_models: seen_models.clone(),
        });

        let wrapped = wrap_provider_with_safety(provider, true);
        let messages = [Message::user().with_text("hi")];
        let result = wrapped.complete_fast("", &messages, &[]);

        assert!(result.await.is_ok());
        assert_eq!(
            seen_models.lock().expect("read seen models").as_slice(),
            ["glm-5"]
        );
        assert_eq!(wrapped.get_model_config().fast_model, None);
    }

    #[tokio::test]
    async fn wrap_provider_with_safety_should_preserve_fast_model_when_not_disabled() {
        let seen_models = Arc::new(Mutex::new(Vec::new()));
        let provider = Arc::new(RecordingProvider {
            model_config: ModelConfig::new("gpt-4o")
                .expect("create model config")
                .with_fast("gpt-4o-mini".to_string()),
            seen_models: seen_models.clone(),
        });

        let wrapped = wrap_provider_with_safety(provider, false);
        let messages = [Message::user().with_text("hi")];
        let result = wrapped.complete_fast("", &messages, &[]);

        assert!(result.await.is_ok());
        assert_eq!(
            seen_models.lock().expect("read seen models").as_slice(),
            ["gpt-4o-mini"]
        );
        assert_eq!(
            wrapped.get_model_config().fast_model.as_deref(),
            Some("gpt-4o-mini")
        );
    }

    #[tokio::test]
    async fn wrap_provider_with_safety_should_forward_session_name_generation() {
        let provider = Arc::new(SessionNamingProvider {
            model_config: ModelConfig::new("deepseek-r1:latest").expect("create model config"),
        });
        let wrapped = wrap_provider_with_safety(provider, false);
        let messages =
            Conversation::new(vec![Message::user().with_text("你好")]).expect("conversation");

        let generated = wrapped
            .generate_session_name(&messages)
            .await
            .expect("generate session name");

        assert_eq!(generated, "wrapped-title");
    }

    #[tokio::test]
    async fn wrap_provider_with_safety_should_disable_fast_model_for_session_name_generation() {
        let seen_models = Arc::new(Mutex::new(Vec::new()));
        let provider = Arc::new(RecordingProvider {
            model_config: ModelConfig::new("glm-5")
                .expect("create model config")
                .with_fast("gpt-4o-mini".to_string()),
            seen_models: seen_models.clone(),
        });
        let wrapped = wrap_provider_with_safety(provider, true);
        let messages = Conversation::new(vec![Message::user().with_text("你好，帮我画一张图")])
            .expect("conversation");

        let generated = wrapped
            .generate_session_name(&messages)
            .await
            .expect("generate session name");

        assert_eq!(generated, "ok");
        assert_eq!(
            seen_models.lock().expect("read seen models").as_slice(),
            ["glm-5"]
        );
    }

    #[test]
    fn wrap_provider_with_safety_should_forward_session_name_strategy() {
        let provider = Arc::new(SessionNamingProvider {
            model_config: ModelConfig::new("deepseek-r1:latest").expect("create model config"),
        });
        let wrapped = wrap_provider_with_safety(provider, false);

        assert_eq!(
            wrapped.session_name_generation_execution_strategy(),
            SessionNameGenerationExecutionStrategy::AfterReply
        );
    }

    #[test]
    fn normalize_provider_messages_should_remove_orphan_tool_response() {
        let messages = vec![
            Message::user().with_text("继续"),
            Message::user().with_tool_response("orphan-tool", Ok(valid_tool_response())),
            Message::assistant().with_text("我继续整理。"),
        ];

        let normalized = normalize_provider_messages(&messages);

        assert_eq!(normalized.len(), 2);
        assert!(normalized.iter().all(|message| {
            message
                .content
                .iter()
                .all(|content| !matches!(content, MessageContent::ToolResponse(_)))
        }));
    }

    #[test]
    fn normalize_provider_messages_should_drop_invalid_tool_request_and_following_response() {
        let messages = vec![
            Message::assistant()
                .with_text("我先尝试调用工具。")
                .with_tool_request(
                    "broken-tool",
                    Err(invalid_tool_call_error("工具参数解析失败")),
                ),
            Message::user().with_tool_response("broken-tool", Ok(valid_tool_response())),
            Message::assistant().with_text("工具失败后我继续主线程编排。"),
        ];

        let normalized = normalize_provider_messages(&messages);

        assert_eq!(normalized.len(), 2);
        assert_eq!(normalized[0].as_concat_text(), "我先尝试调用工具。");
        assert_eq!(
            normalized[1].as_concat_text(),
            "工具失败后我继续主线程编排。"
        );
        assert!(normalized.iter().all(|message| {
            message.content.iter().all(|content| {
                !matches!(
                    content,
                    MessageContent::ToolRequest(_) | MessageContent::ToolResponse(_)
                )
            })
        }));
    }

    #[test]
    fn normalize_provider_messages_should_drop_invalid_frontend_tool_request_and_response() {
        let messages = vec![
            Message::assistant()
                .with_text("我先打开确认框。")
                .with_frontend_tool_request(
                    "frontend-tool",
                    Err(invalid_tool_call_error("frontend 参数解析失败")),
                ),
            Message::user().with_tool_response("frontend-tool", Ok(valid_tool_response())),
            Message::assistant().with_text("继续。"),
        ];

        let normalized = normalize_provider_messages(&messages);

        assert_eq!(normalized.len(), 2);
        assert_eq!(normalized[0].as_concat_text(), "我先打开确认框。");
        assert_eq!(normalized[1].as_concat_text(), "继续。");
    }
}
