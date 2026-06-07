use super::*;

#[path = "compaction/trigger.rs"]
mod trigger;
#[path = "compaction/usage.rs"]
mod usage;

pub(super) use self::trigger::{
    build_history_compaction_runtime_metadata, build_runtime_compaction_session_config,
    RuntimeSessionCompactionTrigger,
};
use self::trigger::{
    emit_context_compaction_skip, ensure_compaction_agent_initialized,
    resolve_context_compaction_conversation, resolve_pre_compact_current_tokens,
    resolve_pre_compact_hook_trigger,
};
pub(super) use self::usage::{
    persist_latest_assistant_message_usage, resolve_runtime_final_done_event,
    update_compaction_session_metrics,
};

pub(super) trait RuntimeCompactionEventPort: Send + Sync {
    fn emit_runtime_event(&self, event_name: &str, event: &RuntimeAgentEvent, error_label: &str);

    fn warn_runtime_event(&self, event_name: &str, event: &RuntimeAgentEvent, error_label: &str);

    fn emit_runtime_terminal_events(&self, event_name: &str, events: Vec<RuntimeAgentEvent>);
}

pub(super) trait RuntimeCompactionTimelineEventPort: Send + Sync {
    fn record_runtime_event(
        &self,
        event_name: &str,
        event: &RuntimeAgentEvent,
    ) -> Result<(), String>;
}

#[derive(Clone)]
pub(super) struct TauriRuntimeCompactionEventPort {
    app: AppHandle,
}

impl TauriRuntimeCompactionEventPort {
    pub(super) fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl RuntimeCompactionEventPort for TauriRuntimeCompactionEventPort {
    fn emit_runtime_event(&self, event_name: &str, event: &RuntimeAgentEvent, error_label: &str) {
        if let Err(error) = self.app.emit(event_name, event) {
            tracing::error!("[AsterAgent] {}: {}", error_label, error);
        }
    }

    fn warn_runtime_event(&self, event_name: &str, event: &RuntimeAgentEvent, error_label: &str) {
        if let Err(error) = self.app.emit(event_name, event) {
            tracing::warn!("[AsterAgent] {}: {}", error_label, error);
        }
    }

    fn emit_runtime_terminal_events(&self, event_name: &str, events: Vec<RuntimeAgentEvent>) {
        let event_port =
            crate::agent::runtime_queue_service::TauriRuntimeQueueEventPort::new(self.app.clone());
        let projection_port = TauriRuntimeProjectionEventPort::new(&self.app);
        emit_runtime_events(&event_port, &projection_port, event_name, events);
    }
}

pub(super) struct TauriRuntimeCompactionTimelineEventPort {
    app: AppHandle,
    timeline_recorder: Arc<Mutex<AgentTimelineRecorder>>,
}

impl TauriRuntimeCompactionTimelineEventPort {
    pub(super) fn new(
        app: AppHandle,
        timeline_recorder: Arc<Mutex<AgentTimelineRecorder>>,
    ) -> Self {
        Self {
            app,
            timeline_recorder,
        }
    }
}

impl RuntimeCompactionTimelineEventPort for TauriRuntimeCompactionTimelineEventPort {
    fn record_runtime_event(
        &self,
        event_name: &str,
        event: &RuntimeAgentEvent,
    ) -> Result<(), String> {
        let mut recorder = match self.timeline_recorder.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        recorder.record_runtime_event(&self.app, event_name, event, "")
    }
}

#[derive(Clone)]
pub(super) struct RuntimeCompactionHostContext<'a> {
    app: &'a AppHandle,
    event_port: Arc<dyn RuntimeCompactionEventPort + 'a>,
    timeline_port: Option<Arc<dyn RuntimeCompactionTimelineEventPort + 'a>>,
    state: &'a AsterAgentState,
    db: &'a DbConnection,
    config_manager: &'a GlobalConfigManagerState,
    mcp_manager: &'a McpManagerState,
}

impl<'a> RuntimeCompactionHostContext<'a> {
    pub(super) fn new(
        app: &'a AppHandle,
        state: &'a AsterAgentState,
        db: &'a DbConnection,
        config_manager: &'a GlobalConfigManagerState,
    ) -> Self {
        Self::with_event_port(
            app,
            Arc::new(TauriRuntimeCompactionEventPort::new(app.clone())),
            state,
            db,
            config_manager,
        )
    }

    pub(super) fn with_event_port(
        app: &'a AppHandle,
        event_port: Arc<dyn RuntimeCompactionEventPort + 'a>,
        state: &'a AsterAgentState,
        db: &'a DbConnection,
        config_manager: &'a GlobalConfigManagerState,
    ) -> Self {
        Self {
            app,
            event_port,
            timeline_port: None,
            state,
            db,
            config_manager,
            mcp_manager: app.state::<crate::mcp::McpManagerState>().inner(),
        }
    }

    pub(super) fn with_timeline_port(
        mut self,
        timeline_port: Arc<dyn RuntimeCompactionTimelineEventPort + 'a>,
    ) -> Self {
        self.timeline_port = Some(timeline_port);
        self
    }

    pub(super) fn emit_runtime_event(
        &self,
        event_name: &str,
        event: &RuntimeAgentEvent,
        error_label: &str,
    ) {
        self.event_port
            .emit_runtime_event(event_name, event, error_label);
    }

    pub(super) fn warn_runtime_event(
        &self,
        event_name: &str,
        event: &RuntimeAgentEvent,
        error_label: &str,
    ) {
        self.event_port
            .warn_runtime_event(event_name, event, error_label);
    }

    fn record_and_emit_runtime_event(
        &self,
        event_name: &str,
        event: &RuntimeAgentEvent,
        timeline_warning_label: &str,
        emit_error_label: &str,
    ) {
        if let Some(timeline_port) = &self.timeline_port {
            if let Err(error) = timeline_port.record_runtime_event(event_name, event) {
                tracing::warn!(
                    "[AsterAgent] {}（已降级继续）: {}",
                    timeline_warning_label,
                    error
                );
            }
        }
        self.emit_runtime_event(event_name, event, emit_error_label);
    }

    fn emit_runtime_terminal_events(&self, event_name: &str, events: Vec<RuntimeAgentEvent>) {
        self.event_port
            .emit_runtime_terminal_events(event_name, events);
    }
}

async fn compact_messages_with_optional_timeout(
    provider: &dyn aster::providers::base::Provider,
    conversation: &aster::conversation::Conversation,
    manual_compact: bool,
    model_timeout: Option<Duration>,
) -> Result<
    (
        aster::conversation::Conversation,
        aster::providers::base::ProviderUsage,
    ),
    String,
> {
    let compact_future =
        aster::context_mgmt::compact_messages(provider, conversation, manual_compact);
    match model_timeout {
        Some(timeout_duration) => {
            match tokio::time::timeout(timeout_duration, compact_future).await {
                Ok(result) => result.map_err(|error| format!("压缩上下文失败: {error}")),
                Err(_) => Err(format!(
                    "压缩上下文超过首字前预算 {}ms，已跳过本次自动压缩",
                    timeout_duration.as_millis()
                )),
            }
        }
        None => compact_future
            .await
            .map_err(|error| format!("压缩上下文失败: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aster::conversation::message::Message;
    use aster::model::ModelConfig;
    use aster::providers::base::{Provider, ProviderMetadata, ProviderUsage, Usage};
    use aster::providers::errors::ProviderError;
    use async_trait::async_trait;
    use rmcp::model::Tool;

    struct DelayedCompactionProvider {
        delay: Duration,
    }

    #[async_trait]
    impl Provider for DelayedCompactionProvider {
        fn metadata() -> ProviderMetadata {
            ProviderMetadata::new(
                "delayed-compaction-test",
                "Delayed Compaction Test",
                "用于测试首字前自动压缩超时",
                "delayed-compaction-test-model",
                vec!["delayed-compaction-test-model"],
                "",
                vec![],
            )
        }

        fn get_name(&self) -> &str {
            "delayed-compaction-test"
        }

        async fn complete_with_model(
            &self,
            model_config: &ModelConfig,
            _system: &str,
            _messages: &[Message],
            _tools: &[Tool],
        ) -> Result<(Message, ProviderUsage), ProviderError> {
            tokio::time::sleep(self.delay).await;
            Ok((
                Message::assistant().with_text("已压缩的测试摘要"),
                ProviderUsage::new(
                    model_config.model_name.clone(),
                    Usage::new(Some(1), Some(1), Some(2)),
                ),
            ))
        }

        fn get_model_config(&self) -> ModelConfig {
            ModelConfig {
                model_name: "delayed-compaction-test-model".to_string(),
                context_limit: Some(8_000),
                temperature: None,
                max_tokens: None,
                reasoning_effort: None,
                toolshim: false,
                toolshim_model: None,
                fast_model: None,
            }
        }
    }

    fn build_compaction_test_conversation() -> aster::conversation::Conversation {
        aster::conversation::Conversation::new_unvalidated(vec![
            Message::user().with_text("第一条用户消息"),
            Message::assistant().with_text("第一条助手回复"),
        ])
    }

    #[tokio::test]
    async fn compact_messages_with_optional_timeout_should_fail_fast_before_turn() {
        let provider = DelayedCompactionProvider {
            delay: Duration::from_millis(50),
        };
        let conversation = build_compaction_test_conversation();
        let started_at = Instant::now();

        let error = compact_messages_with_optional_timeout(
            &provider,
            &conversation,
            true,
            Some(Duration::from_millis(5)),
        )
        .await
        .expect_err("首字前自动压缩超时应降级为错误");

        assert!(error.contains("超过首字前预算 5ms"));
        assert!(
            started_at.elapsed() < Duration::from_secs(1),
            "自动压缩超时不应继续等待慢模型完成"
        );
    }
}

pub(in crate::commands::aster_agent_cmd::runtime_turn) async fn compact_runtime_session_with_trigger_and_model_timeout(
    host: RuntimeCompactionHostContext<'_>,
    session_id: String,
    event_name: String,
    trigger: RuntimeSessionCompactionTrigger,
    model_timeout: Option<Duration>,
) -> Result<(), String> {
    ensure_compaction_agent_initialized(host.state, host.db).await?;

    let session = read_session(&session_id, true, "读取会话失败").await?;
    let Some(conversation) = resolve_context_compaction_conversation(&session)? else {
        if trigger == RuntimeSessionCompactionTrigger::Manual {
            emit_context_compaction_skip(&host, &event_name, "当前会话还没有足够的历史可压缩");
        }
        return Ok(());
    };
    let pre_compact_current_tokens = resolve_pre_compact_current_tokens(&session);
    enforce_runtime_pre_compact_project_hooks_for_session_with_runtime(
        host.db,
        host.state,
        host.mcp_manager,
        &session_id,
        pre_compact_current_tokens,
        resolve_pre_compact_hook_trigger(trigger),
    )
    .await?;
    let provider_scope = prepare_auxiliary_provider_scope(
        host.state,
        host.db,
        host.config_manager,
        &session_id,
        AuxiliaryServiceModelSlot::HistoryCompress,
        &COMPACTION_FALLBACK_PROVIDER_CHAIN,
    )
    .await?;

    let cancel_token = host.state.create_cancel_token(&session_id).await;
    let agent_arc = host.state.get_agent_arc();

    let runtime_snapshot = {
        let guard = agent_arc.read().await;
        let agent = guard.as_ref().ok_or("Agent not initialized")?;
        match agent.runtime_snapshot(&session_id).await {
            Ok(snapshot) => Some(snapshot),
            Err(error) => {
                tracing::warn!(
                    "[AsterAgent] 压缩上下文前读取 runtime snapshot 失败，继续使用 session 默认线程: session_id={}, error={}",
                    session_id,
                    error
                );
                None
            }
        }
    };
    let runtime_projection_snapshot =
        RuntimeProjectionSnapshot::from_snapshot(&session_id, runtime_snapshot.as_ref());
    let resolved_thread_id = runtime_projection_snapshot
        .primary_thread_id()
        .map(str::to_string)
        .unwrap_or_else(|| session_id.clone());
    let resolved_turn_id = Uuid::new_v4().to_string();
    let timeline_recorder = Arc::new(Mutex::new(AgentTimelineRecorder::create(
        host.db.clone(),
        resolved_thread_id.clone(),
        resolved_turn_id.clone(),
        "压缩上下文",
    )?));
    let timeline_port = Arc::new(TauriRuntimeCompactionTimelineEventPort::new(
        host.app.clone(),
        Arc::clone(&timeline_recorder),
    ));
    let host = host.with_timeline_port(timeline_port);
    let compaction_request_metadata =
        build_history_compaction_runtime_metadata(trigger, provider_scope.resolution());
    let compaction_side_events =
        collect_runtime_request_resolution_side_events(compaction_request_metadata.as_ref());
    let session_config = build_runtime_compaction_session_config(
        &session_id,
        &resolved_thread_id,
        &resolved_turn_id,
        build_auxiliary_turn_context_override(compaction_request_metadata),
    );

    let final_result: Result<(), String> = {
        let guard = agent_arc.read().await;
        let agent = guard.as_ref().ok_or("Agent not initialized")?;
        let turn = agent
            .ensure_runtime_turn_initialized(&session_config, Some("压缩上下文".to_string()))
            .await
            .map_err(|error| format!("初始化压缩 turn 失败: {error}"))?;
        for event in lime_agent::project_runtime_event(AgentEvent::TurnStarted { turn }) {
            host.record_and_emit_runtime_event(
                &event_name,
                &event,
                "记录压缩时间线事件失败",
                "发送压缩事件失败",
            );
        }

        for event in compaction_side_events.iter().cloned() {
            host.record_and_emit_runtime_event(
                &event_name,
                &event,
                "记录压缩路由时间线事件失败",
                "发送压缩路由事件失败",
            );
        }

        let compaction_turn_id = session_config
            .turn_id
            .clone()
            .unwrap_or_else(|| session_id.clone());
        let compaction_item_id = format!("context_compaction:{compaction_turn_id}");
        let start_event = RuntimeAgentEvent::ContextCompactionStarted {
            item_id: compaction_item_id.clone(),
            trigger: trigger.as_str().to_string(),
            detail: Some(trigger.start_detail().to_string()),
        };
        host.record_and_emit_runtime_event(
            &event_name,
            &start_event,
            "记录压缩开始时间线失败",
            "发送压缩开始事件失败",
        );

        let provider = agent
            .provider()
            .await
            .map_err(|error| format!("读取 provider 失败: {error}"))?;
        let compact_result = compact_messages_with_optional_timeout(
            provider.as_ref(),
            conversation,
            true,
            model_timeout,
        )
        .await;
        let (compacted_conversation, usage) = match compact_result {
            Ok(result) => result,
            Err(error) => {
                let completed_event = RuntimeAgentEvent::ContextCompactionCompleted {
                    item_id: compaction_item_id,
                    trigger: trigger.as_str().to_string(),
                    detail: Some(format!("压缩未完成：{error}")),
                };
                host.record_and_emit_runtime_event(
                    &event_name,
                    &completed_event,
                    "记录压缩结束时间线失败",
                    "发送压缩结束事件失败",
                );
                return Err(error);
            }
        };
        replace_session_conversation(&session_id, &compacted_conversation, "写回压缩后的会话")
            .await?;
        update_compaction_session_metrics(&session_config, &usage).await?;

        let completed_event = RuntimeAgentEvent::ContextCompactionCompleted {
            item_id: compaction_item_id,
            trigger: trigger.as_str().to_string(),
            detail: Some(trigger.completed_detail().to_string()),
        };
        host.record_and_emit_runtime_event(
            &event_name,
            &completed_event,
            "记录压缩完成时间线失败",
            "发送压缩完成事件失败",
        );

        Ok(())
    };

    provider_scope.restore(host.state, host.db).await;

    match final_result {
        Ok(()) => {
            let terminal_events = {
                let mut recorder = match timeline_recorder.lock() {
                    Ok(guard) => guard,
                    Err(error) => error.into_inner(),
                };
                recorder.complete_turn_success()
            };
            if let Err(error) = &terminal_events {
                tracing::warn!(
                    "[AsterAgent] 完成压缩 turn 时间线失败（已降级继续）: {}",
                    error
                );
            }
            if let Ok(events) = terminal_events {
                host.emit_runtime_terminal_events(&event_name, events);
            }
            run_runtime_session_start_project_hooks_for_session_with_runtime(
                host.db,
                host.state,
                host.mcp_manager,
                &session_id,
                SessionSource::Compact,
            )
            .await;
            let done_event = resolve_runtime_final_done_event(&session_id, None).await;
            host.emit_runtime_event(&event_name, &done_event, "发送压缩完成事件失败");
        }
        Err(error) => {
            let terminal_events = {
                let mut recorder = match timeline_recorder.lock() {
                    Ok(guard) => guard,
                    Err(error) => error.into_inner(),
                };
                recorder.fail_turn(&error)
            };
            {
                if let Err(timeline_error) = &terminal_events {
                    tracing::warn!(
                        "[AsterAgent] 记录压缩失败 turn 时间线失败（已降级继续）: {}",
                        timeline_error
                    );
                }
            }
            if let Ok(events) = terminal_events {
                host.emit_runtime_terminal_events(&event_name, events);
            }
            let error_event = RuntimeAgentEvent::Error {
                message: error.clone(),
            };
            host.emit_runtime_event(&event_name, &error_event, "发送压缩错误事件失败");
            host.state.remove_cancel_token(&session_id).await;
            return Err(error);
        }
    }

    drop(cancel_token);
    host.state.remove_cancel_token(&session_id).await;
    Ok(())
}

pub(crate) async fn compact_runtime_session_internal(
    app: &AppHandle,
    state: &AsterAgentState,
    db: &DbConnection,
    config_manager: &GlobalConfigManagerState,
    request: AgentRuntimeCompactSessionRequest,
) -> Result<(), String> {
    let session_id = normalize_required_text(&request.session_id, "session_id")?;
    let event_name = normalize_required_text(&request.event_name, "event_name")?;
    let host = RuntimeCompactionHostContext::new(app, state, db, config_manager);
    compact_runtime_session_with_trigger_and_model_timeout(
        host,
        session_id,
        event_name,
        RuntimeSessionCompactionTrigger::Manual,
        None,
    )
    .await
}
