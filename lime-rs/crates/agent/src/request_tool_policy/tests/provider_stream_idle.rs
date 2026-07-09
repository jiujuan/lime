use super::*;
use crate::request_tool_policy::aster_reply_adapter::AsterReplyRuntimeHost;
use agent_runtime::reply_stream::MIN_PROVIDER_STREAM_FIRST_EVENT_TIMEOUT;
use aster::conversation::message::Message;

const PROVIDER_STREAM_IDLE_TIMEOUT: Duration = Duration::from_millis(200);

struct IdleThenTextProvider {
    attempts: Arc<AtomicUsize>,
}

struct IdleTextThenIdleTextProvider {
    attempts: Arc<AtomicUsize>,
}

#[async_trait]
impl Provider for IdleThenTextProvider {
    fn metadata() -> ProviderMetadata
    where
        Self: Sized,
    {
        ProviderMetadata::empty()
    }

    fn get_name(&self) -> &str {
        "idle-then-text-provider"
    }

    async fn complete_with_model(
        &self,
        _model_config: &aster::model::ModelConfig,
        _system: &str,
        _messages: &[Message],
        _tools: &[rmcp::model::Tool],
    ) -> Result<(Message, ProviderUsage), ProviderError> {
        Ok((
            Message::assistant().with_text("非流式兜底不应被调用"),
            ProviderUsage::new("gpt-5.3-codex".to_string(), Usage::default()),
        ))
    }

    async fn stream(
        &self,
        _system: &str,
        _messages: &[Message],
        _tools: &[rmcp::model::Tool],
    ) -> Result<aster::providers::base::MessageStream, ProviderError> {
        let attempt = self.attempts.fetch_add(1, Ordering::SeqCst);
        Ok(Box::pin(async_stream::try_stream! {
            if attempt == 0 {
                yield (
                    Some(Message::assistant().with_text("已完成搜索，")),
                    None,
                );
                std::future::pending::<()>().await;
            } else {
                yield (
                    Some(Message::assistant().with_text("最终摘要已补齐。")),
                    Some(ProviderUsage::new("gpt-5.3-codex".to_string(), Usage::default())),
                );
            }
        }))
    }

    fn supports_streaming(&self) -> bool {
        true
    }

    fn get_model_config(&self) -> aster::model::ModelConfig {
        aster::model::ModelConfig::new("gpt-5.3-codex").expect("test model config")
    }
}

#[async_trait]
impl Provider for IdleTextThenIdleTextProvider {
    fn metadata() -> ProviderMetadata
    where
        Self: Sized,
    {
        ProviderMetadata::empty()
    }

    fn get_name(&self) -> &str {
        "idle-text-then-idle-text-provider"
    }

    async fn complete_with_model(
        &self,
        _model_config: &aster::model::ModelConfig,
        _system: &str,
        _messages: &[Message],
        _tools: &[rmcp::model::Tool],
    ) -> Result<(Message, ProviderUsage), ProviderError> {
        Ok((
            Message::assistant().with_text("非流式兜底不应被调用"),
            ProviderUsage::new("gpt-5.3-codex".to_string(), Usage::default()),
        ))
    }

    async fn stream(
        &self,
        _system: &str,
        _messages: &[Message],
        _tools: &[rmcp::model::Tool],
    ) -> Result<aster::providers::base::MessageStream, ProviderError> {
        let attempt = self.attempts.fetch_add(1, Ordering::SeqCst);
        Ok(Box::pin(async_stream::try_stream! {
            if attempt == 0 {
                yield (
                    Some(Message::assistant().with_text("你好，")),
                    None,
                );
            } else {
                yield (
                    Some(Message::assistant().with_text("可以的。")),
                    None,
                );
            }
            std::future::pending::<()>().await;
        }))
    }

    fn supports_streaming(&self) -> bool {
        true
    }

    fn get_model_config(&self) -> aster::model::ModelConfig {
        aster::model::ModelConfig::new("gpt-5.3-codex").expect("test model config")
    }
}

struct NeverStreamingProvider;

#[async_trait]
impl Provider for NeverStreamingProvider {
    fn metadata() -> ProviderMetadata
    where
        Self: Sized,
    {
        ProviderMetadata::empty()
    }

    fn get_name(&self) -> &str {
        "never-streaming-provider"
    }

    async fn complete_with_model(
        &self,
        _model_config: &aster::model::ModelConfig,
        _system: &str,
        _messages: &[Message],
        _tools: &[rmcp::model::Tool],
    ) -> Result<(Message, ProviderUsage), ProviderError> {
        Ok((
            Message::assistant().with_text("非流式兜底不应被调用"),
            ProviderUsage::new("gpt-5.3-codex".to_string(), Usage::default()),
        ))
    }

    async fn stream(
        &self,
        _system: &str,
        _messages: &[Message],
        _tools: &[rmcp::model::Tool],
    ) -> Result<aster::providers::base::MessageStream, ProviderError> {
        Ok(Box::pin(async_stream::try_stream! {
            std::future::pending::<()>().await;
            yield (
                Some(Message::assistant().with_text("不可到达")),
                Some(ProviderUsage::new("gpt-5.3-codex".to_string(), Usage::default())),
            );
        }))
    }

    fn supports_streaming(&self) -> bool {
        true
    }

    fn get_model_config(&self) -> aster::model::ModelConfig {
        aster::model::ModelConfig::new("gpt-5.3-codex").expect("test model config")
    }
}

#[tokio::test]
async fn stream_message_reply_with_policy_should_retry_provider_stream_idle_after_partial_output() {
    let (store, session) = create_test_session_store("lime-provider-idle-retry");
    let agent = Agent::new().with_session_store(store.clone());
    let attempts = Arc::new(AtomicUsize::new(0));
    agent
        .update_provider(
            Arc::new(IdleThenTextProvider {
                attempts: attempts.clone(),
            }),
            &session.id,
        )
        .await
        .expect("应配置测试 provider");

    let session_config = test_session_config(&session.id, "turn-provider-idle-retry");
    let policy = resolve_request_tool_policy(Some(true));
    let mut runtime_events = Vec::new();
    let reply_host = AsterReplyRuntimeHost::new(&agent);

    let reply = stream_message_reply_with_policy_with_options(
        &reply_host,
        ReplyInput::text("整理今天的国际新闻").into(),
        None,
        session_config,
        None,
        &policy,
        |event| runtime_events.push(event.clone()),
        StreamReplyPolicyExecutionOptions {
            provider_stream_idle_timeout: Some(PROVIDER_STREAM_IDLE_TIMEOUT),
            persist_runtime_status: true,
        },
    )
    .await
    .expect("provider 首轮 idle 后应自动续写成功");

    assert_eq!(attempts.load(Ordering::SeqCst), 2);
    assert_eq!(reply.text_output, "已完成搜索，最终摘要已补齐。");
    assert!(runtime_events.iter().any(|event| matches!(
        event,
        RuntimeAgentEvent::RuntimeStatus { status }
            if status.title == "正在恢复模型输出"
    )));
}

#[tokio::test]
async fn stream_message_reply_with_policy_should_complete_plain_text_when_retry_idle_tail() {
    let (store, session) = create_test_session_store("lime-provider-idle-text-complete");
    let agent = Agent::new().with_session_store(store.clone());
    let attempts = Arc::new(AtomicUsize::new(0));
    agent
        .update_provider(
            Arc::new(IdleTextThenIdleTextProvider {
                attempts: attempts.clone(),
            }),
            &session.id,
        )
        .await
        .expect("应配置测试 provider");

    let session_config = test_session_config(&session.id, "turn-provider-idle-text-complete");
    let policy = resolve_request_tool_policy(Some(false));
    let mut runtime_events = Vec::new();
    let reply_host = AsterReplyRuntimeHost::new(&agent);

    let reply = stream_message_reply_with_policy_with_options(
        &reply_host,
        ReplyInput::text("你好").into(),
        None,
        session_config,
        None,
        &policy,
        |event| runtime_events.push(event.clone()),
        StreamReplyPolicyExecutionOptions {
            provider_stream_idle_timeout: Some(PROVIDER_STREAM_IDLE_TIMEOUT),
            persist_runtime_status: true,
        },
    )
    .await
    .expect("已有普通文本输出时 retry idle tail 不应把问候标成失败");

    assert_eq!(attempts.load(Ordering::SeqCst), 2);
    assert_eq!(reply.text_output, "你好，可以的。");
    assert!(reply.emitted_any);
    assert!(runtime_events.iter().any(|event| matches!(
        event,
        RuntimeAgentEvent::RuntimeStatus { status }
            if status.title == "正在恢复模型输出"
    )));
}

#[tokio::test]
async fn stream_message_reply_with_policy_should_fail_closed_when_provider_stream_idles_before_any_event(
) {
    let (store, session) = create_test_session_store("lime-provider-idle-before-event");
    let agent = Agent::new().with_session_store(store.clone());
    agent
        .update_provider(Arc::new(NeverStreamingProvider), &session.id)
        .await
        .expect("应配置测试 provider");

    let session_config = test_session_config(&session.id, "turn-provider-idle-before-event");
    let policy = resolve_request_tool_policy(Some(false));
    let mut runtime_events = Vec::new();
    let reply_host = AsterReplyRuntimeHost::new(&agent);

    let error = tokio::time::timeout(
        MIN_PROVIDER_STREAM_FIRST_EVENT_TIMEOUT + Duration::from_secs(3),
        stream_message_reply_with_policy_with_options(
            &reply_host,
            ReplyInput::text("请回复").into(),
            None,
            session_config,
            None,
            &policy,
            |event| runtime_events.push(event.clone()),
            StreamReplyPolicyExecutionOptions {
                provider_stream_idle_timeout: Some(PROVIDER_STREAM_IDLE_TIMEOUT),
                persist_runtime_status: true,
            },
        ),
    )
    .await
    .expect("idle guard 应在测试超时前收口")
    .expect_err("首事件前 provider idle 应失败收口");

    assert!(error
        .message
        .contains("Agent provider execution failed: stream idle timeout"));
    assert!(!runtime_events.iter().any(|event| matches!(
        event,
        RuntimeAgentEvent::TextDelta { .. } | RuntimeAgentEvent::TextDeltaBatch { .. }
    )));
}
