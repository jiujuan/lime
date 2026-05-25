use super::*;

#[path = "compaction/auto.rs"]
mod auto;
#[path = "compaction/trigger.rs"]
mod trigger;
#[path = "compaction/usage.rs"]
mod usage;

pub(super) use self::auto::maybe_auto_compact_runtime_session_before_turn;
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

pub(super) async fn compact_runtime_session_with_trigger(
    app: &AppHandle,
    state: &AsterAgentState,
    db: &DbConnection,
    config_manager: &GlobalConfigManagerState,
    session_id: String,
    event_name: String,
    trigger: RuntimeSessionCompactionTrigger,
) -> Result<(), String> {
    ensure_compaction_agent_initialized(state, db).await?;

    let session = read_session(&session_id, true, "读取会话失败").await?;
    let Some(conversation) = resolve_context_compaction_conversation(&session)? else {
        if trigger == RuntimeSessionCompactionTrigger::Manual {
            emit_context_compaction_skip(app, &event_name, "当前会话还没有足够的历史可压缩");
        }
        return Ok(());
    };
    let pre_compact_current_tokens = resolve_pre_compact_current_tokens(&session);
    enforce_runtime_pre_compact_project_hooks_for_session_with_runtime(
        db,
        state,
        app.state::<crate::mcp::McpManagerState>().inner(),
        &session_id,
        pre_compact_current_tokens,
        resolve_pre_compact_hook_trigger(trigger),
    )
    .await?;
    let provider_scope = prepare_auxiliary_provider_scope(
        state,
        db,
        config_manager,
        &session_id,
        AuxiliaryServiceModelSlot::HistoryCompress,
        &COMPACTION_FALLBACK_PROVIDER_CHAIN,
    )
    .await?;

    let cancel_token = state.create_cancel_token(&session_id).await;
    let agent_arc = state.get_agent_arc();

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
        db.clone(),
        resolved_thread_id.clone(),
        resolved_turn_id.clone(),
        "压缩上下文",
    )?));
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
            {
                let mut recorder = match timeline_recorder.lock() {
                    Ok(guard) => guard,
                    Err(error) => error.into_inner(),
                };
                if let Err(error) = recorder.record_runtime_event(app, &event_name, &event, "") {
                    tracing::warn!(
                        "[AsterAgent] 记录压缩时间线事件失败（已降级继续）: {}",
                        error
                    );
                }
            }
            if let Err(error) = app.emit(&event_name, &event) {
                tracing::error!("[AsterAgent] 发送压缩事件失败: {}", error);
            }
        }

        for event in compaction_side_events.iter().cloned() {
            {
                let mut recorder = match timeline_recorder.lock() {
                    Ok(guard) => guard,
                    Err(error) => error.into_inner(),
                };
                if let Err(error) = recorder.record_runtime_event(app, &event_name, &event, "") {
                    tracing::warn!(
                        "[AsterAgent] 记录压缩路由时间线事件失败（已降级继续）: {}",
                        error
                    );
                }
            }
            if let Err(error) = app.emit(&event_name, &event) {
                tracing::error!("[AsterAgent] 发送压缩路由事件失败: {}", error);
            }
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
        {
            let mut recorder = match timeline_recorder.lock() {
                Ok(guard) => guard,
                Err(error) => error.into_inner(),
            };
            if let Err(error) = recorder.record_runtime_event(app, &event_name, &start_event, "") {
                tracing::warn!(
                    "[AsterAgent] 记录压缩开始时间线失败（已降级继续）: {}",
                    error
                );
            }
        }
        if let Err(error) = app.emit(&event_name, &start_event) {
            tracing::error!("[AsterAgent] 发送压缩开始事件失败: {}", error);
        }

        let provider = agent
            .provider()
            .await
            .map_err(|error| format!("读取 provider 失败: {error}"))?;
        let (compacted_conversation, usage) =
            aster::context_mgmt::compact_messages(provider.as_ref(), conversation, true)
                .await
                .map_err(|error| format!("压缩上下文失败: {error}"))?;
        replace_session_conversation(&session_id, &compacted_conversation, "写回压缩后的会话")
            .await?;
        update_compaction_session_metrics(&session_config, &usage).await?;

        let completed_event = RuntimeAgentEvent::ContextCompactionCompleted {
            item_id: compaction_item_id,
            trigger: trigger.as_str().to_string(),
            detail: Some(trigger.completed_detail().to_string()),
        };
        {
            let mut recorder = match timeline_recorder.lock() {
                Ok(guard) => guard,
                Err(error) => error.into_inner(),
            };
            if let Err(error) =
                recorder.record_runtime_event(app, &event_name, &completed_event, "")
            {
                tracing::warn!(
                    "[AsterAgent] 记录压缩完成时间线失败（已降级继续）: {}",
                    error
                );
            }
        }
        if let Err(error) = app.emit(&event_name, &completed_event) {
            tracing::error!("[AsterAgent] 发送压缩完成事件失败: {}", error);
        }

        Ok(())
    };

    provider_scope.restore(state, db).await;

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
                emit_runtime_events(app, &event_name, events);
            }
            run_runtime_session_start_project_hooks_for_session_with_runtime(
                db,
                state,
                app.state::<crate::mcp::McpManagerState>().inner(),
                &session_id,
                SessionSource::Compact,
            )
            .await;
            let done_event = resolve_runtime_final_done_event(&session_id, None).await;
            if let Err(error) = app.emit(&event_name, &done_event) {
                tracing::error!("[AsterAgent] 发送压缩完成事件失败: {}", error);
            }
            reset_auto_compaction_failure(&session_id);
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
                emit_runtime_events(app, &event_name, events);
            }
            let error_event = RuntimeAgentEvent::Error {
                message: error.clone(),
            };
            if let Err(emit_error) = app.emit(&event_name, &error_event) {
                tracing::error!("[AsterAgent] 发送压缩错误事件失败: {}", emit_error);
            }
            state.remove_cancel_token(&session_id).await;
            return Err(error);
        }
    }

    drop(cancel_token);
    state.remove_cancel_token(&session_id).await;
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
    compact_runtime_session_with_trigger(
        app,
        state,
        db,
        config_manager,
        session_id,
        event_name,
        RuntimeSessionCompactionTrigger::Manual,
    )
    .await
}
