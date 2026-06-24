use super::*;

struct IdleThenTextProvider {
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

    let session_config = aster::agents::SessionConfig {
        id: session.id.clone(),
        thread_id: None,
        turn_id: Some("turn-provider-idle-retry".to_string()),
        schedule_id: None,
        max_turns: None,
        retry_config: None,
        system_prompt: None,
        system_prompt_override: None,
        include_context_trace: None,
        turn_context: None,
    };
    let policy = resolve_request_tool_policy(Some(true));
    let mut runtime_events = Vec::new();

    let reply = stream_message_reply_with_policy_with_options(
        &agent,
        Message::user().with_text("整理今天的国际新闻"),
        None,
        session_config,
        None,
        &policy,
        |event| runtime_events.push(event.clone()),
        StreamReplyPolicyExecutionOptions {
            provider_stream_idle_timeout: Some(Duration::from_millis(200)),
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
async fn stream_message_reply_with_policy_should_fail_closed_when_provider_stream_idles_before_any_event(
) {
    let (store, session) = create_test_session_store("lime-provider-idle-before-event");
    let agent = Agent::new().with_session_store(store.clone());
    agent
        .update_provider(Arc::new(NeverStreamingProvider), &session.id)
        .await
        .expect("应配置测试 provider");

    let session_config = aster::agents::SessionConfig {
        id: session.id.clone(),
        thread_id: None,
        turn_id: Some("turn-provider-idle-before-event".to_string()),
        schedule_id: None,
        max_turns: None,
        retry_config: None,
        system_prompt: None,
        system_prompt_override: None,
        include_context_trace: None,
        turn_context: None,
    };
    let policy = resolve_request_tool_policy(Some(false));
    let mut runtime_events = Vec::new();

    let error = tokio::time::timeout(
        Duration::from_secs(3),
        stream_message_reply_with_policy_with_options(
            &agent,
            Message::user().with_text("请回复"),
            None,
            session_config,
            None,
            &policy,
            |event| runtime_events.push(event.clone()),
            StreamReplyPolicyExecutionOptions {
                provider_stream_idle_timeout: Some(Duration::from_millis(200)),
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
