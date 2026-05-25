use super::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::commands::aster_agent_cmd::runtime_turn) enum RuntimeSessionCompactionTrigger {
    Manual,
    Auto,
}

impl RuntimeSessionCompactionTrigger {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Auto => "auto",
        }
    }

    pub(super) fn start_detail(self) -> &'static str {
        match self {
            Self::Manual => "系统正在将较早消息整理为摘要，以释放上下文窗口。",
            Self::Auto => "检测到会话历史已接近上限，系统正在自动整理较早消息以释放上下文窗口。",
        }
    }

    pub(super) fn completed_detail(self) -> &'static str {
        match self {
            Self::Manual => "较早消息已替换为摘要，后续回复会基于压缩后的上下文继续。",
            Self::Auto => "较早消息已自动替换为摘要，本轮回复会基于压缩后的上下文继续。",
        }
    }
}

pub(super) fn resolve_pre_compact_hook_trigger(
    trigger: RuntimeSessionCompactionTrigger,
) -> CompactTrigger {
    match trigger {
        RuntimeSessionCompactionTrigger::Manual => CompactTrigger::Manual,
        RuntimeSessionCompactionTrigger::Auto => CompactTrigger::Auto,
    }
}

pub(super) async fn ensure_compaction_agent_initialized(
    state: &AsterAgentState,
    db: &DbConnection,
) -> Result<(), String> {
    state.init_agent_with_db(db).await
}

pub(super) fn resolve_context_compaction_conversation<'a>(
    session: &'a aster::session::Session,
) -> Result<Option<&'a aster::conversation::Conversation>, String> {
    let conversation = session
        .conversation
        .as_ref()
        .ok_or_else(|| "当前会话上下文尚未准备完成，请稍后再试".to_string())?;
    if session.message_count < 2 || conversation.messages().len() < 2 {
        return Ok(None);
    }
    Ok(Some(conversation))
}

pub(super) fn resolve_pre_compact_current_tokens(session: &aster::session::Session) -> Option<u64> {
    session
        .total_tokens
        .and_then(|value| u64::try_from(value).ok())
        .or_else(|| {
            session.conversation.as_ref().map(|conversation| {
                aster::context::TokenEstimator::estimate_total_tokens(conversation.messages())
                    as u64
            })
        })
}

pub(super) fn emit_context_compaction_skip(app: &AppHandle, event_name: &str, message: &str) {
    let warning_event = RuntimeAgentEvent::Warning {
        code: Some(CONTEXT_COMPACTION_NOT_NEEDED_WARNING_CODE.to_string()),
        message: message.to_string(),
    };
    if let Err(error) = app.emit(event_name, &warning_event) {
        tracing::warn!("[AsterAgent] 发送压缩跳过提醒失败: {}", error);
    }

    let done_event = RuntimeAgentEvent::FinalDone { usage: None };
    if let Err(error) = app.emit(event_name, &done_event) {
        tracing::warn!("[AsterAgent] 发送压缩跳过完成事件失败: {}", error);
    }
}

pub(in crate::commands::aster_agent_cmd::runtime_turn) fn build_runtime_compaction_session_config(
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
    turn_context: Option<TurnContextOverride>,
) -> aster::agents::types::SessionConfig {
    // 压缩控制回合只需要稳定 thread/turn 锚点来写时间线和 session metrics；
    // 它不会走常规 turn prompt / tool / turn_context 组包链，避免再造第二份输入真相。
    let mut session_config_builder = SessionConfigBuilder::new(session_id)
        .thread_id(thread_id.to_string())
        .turn_id(turn_id.to_string());
    if let Some(turn_context) = turn_context {
        session_config_builder = session_config_builder.turn_context(turn_context);
    }
    session_config_builder.build()
}

pub(in crate::commands::aster_agent_cmd::runtime_turn) fn build_history_compaction_runtime_metadata(
    trigger: RuntimeSessionCompactionTrigger,
    resolution: &AuxiliaryProviderResolution,
) -> Option<serde_json::Value> {
    build_auxiliary_runtime_metadata(
        resolution,
        &format!("context_compaction_{}", trigger.as_str()),
        Some(trigger.as_str()),
        &["service_model_slot", "internal_turn"],
        &["当前为内部辅助任务，运行时只会使用一条已解析的 provider/model 路线。"],
    )
}
