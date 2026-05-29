use super::trigger::RuntimeSessionCompactionTrigger;
use super::*;
use std::time::Duration;

const AUTO_COMPACTION_PRE_TURN_MODEL_TIMEOUT: Duration = Duration::from_secs(2);

fn build_auto_context_compaction_event_name(session_id: &str) -> String {
    format!(
        "{AUTO_CONTEXT_COMPACTION_EVENT_PREFIX}_{session_id}_{}",
        Uuid::new_v4()
    )
}

#[allow(clippy::too_many_arguments)]
pub(in crate::commands::aster_agent_cmd::runtime_turn) async fn maybe_auto_compact_runtime_session_before_turn(
    app: &AppHandle,
    state: &AsterAgentState,
    db: &DbConnection,
    config_manager: &GlobalConfigManagerState,
    session_id: &str,
    request_event_name: &str,
    workspace_settings: &WorkspaceSettings,
) -> Result<(), String> {
    let check_started_at = Instant::now();
    if should_skip_auto_compaction_for_failures(session_id) {
        tracing::warn!(
            "[AsterAgent][TTFT] 自动压缩已因连续失败暂时跳过: session_id={}, failures={}/{}",
            session_id,
            auto_compaction_failure_count(session_id),
            MAX_AUTO_COMPACTION_FAILURES
        );
        return Ok(());
    }

    let session = read_session(session_id, true, "读取自动压缩会话失败").await?;
    let provider_scope = prepare_auxiliary_provider_scope(
        state,
        db,
        config_manager,
        session_id,
        AuxiliaryServiceModelSlot::HistoryCompress,
        &COMPACTION_FALLBACK_PROVIDER_CHAIN,
    )
    .await?;
    let should_compact_result = async {
        let agent_arc = state.get_agent_arc();
        let guard = agent_arc.read().await;
        let agent = guard.as_ref().ok_or("Agent not initialized")?;
        let provider = agent
            .provider()
            .await
            .map_err(|error| format!("读取自动压缩 provider 失败: {error}"))?;
        let threshold_budget = resolve_auto_compaction_threshold_budget(provider.as_ref());
        let threshold_override = resolve_auto_compact_threshold_override(threshold_budget);
        tracing::debug!(
            "[AsterAgent][TTFT] 自动压缩阈值预算: session_id={}, context_limit={}, reserved_summary_output_tokens={}, continuation_buffer_tokens={}, threshold_tokens={}, threshold_ratio={:.3}",
            session_id,
            threshold_budget.context_limit,
            threshold_budget.reserved_summary_output_tokens,
            threshold_budget.continuation_buffer_tokens,
            threshold_budget.threshold_tokens,
            threshold_override
        );
        should_auto_compact_runtime_session(
            provider.as_ref(),
            &session,
            workspace_settings,
            Some(threshold_override),
        )
        .await
    }
    .await;
    provider_scope.restore(state, db).await;

    if !should_compact_result? {
        tracing::debug!(
            "[AsterAgent][TTFT] 自动压缩检查跳过: session_id={}, elapsed_ms={}",
            session_id,
            check_started_at.elapsed().as_millis()
        );
        return Ok(());
    }

    tracing::info!(
        "[AsterAgent][TTFT] 首字前限时自动压缩开始: session_id={}, check_elapsed_ms={}, model_timeout_ms={}",
        session_id,
        check_started_at.elapsed().as_millis(),
        AUTO_COMPACTION_PRE_TURN_MODEL_TIMEOUT.as_millis()
    );
    let compact_started_at = Instant::now();
    let auto_event_name = build_auto_context_compaction_event_name(session_id);
    match compact_runtime_session_with_trigger_and_model_timeout(
        app,
        state,
        db,
        config_manager,
        session_id.to_string(),
        auto_event_name,
        RuntimeSessionCompactionTrigger::Auto,
        Some(AUTO_COMPACTION_PRE_TURN_MODEL_TIMEOUT),
    )
    .await
    {
        Ok(()) => {
            reset_auto_compaction_failure(session_id);
            tracing::info!(
                "[AsterAgent][TTFT] 自动压缩完成，继续当前 turn: session_id={}, compact_elapsed_ms={}",
                session_id,
                compact_started_at.elapsed().as_millis()
            );
        }
        Err(error) => {
            let failure_count = record_auto_compaction_failure(session_id);
            tracing::warn!(
                "[AsterAgent] 自动压缩上下文失败，已降级继续当前 turn: session_id={}, failures={}/{}, elapsed_ms={}, error={}",
                session_id,
                failure_count,
                MAX_AUTO_COMPACTION_FAILURES,
                compact_started_at.elapsed().as_millis(),
                error
            );
            if failure_count >= MAX_AUTO_COMPACTION_FAILURES {
                tracing::warn!(
                    "[AsterAgent][TTFT] 自动压缩连续失败达到上限，后续 turn 将暂时跳过自动压缩: session_id={}, failures={}",
                    session_id,
                    failure_count
                );
            }
            let warning_event = RuntimeAgentEvent::Warning {
                code: Some(AUTO_CONTEXT_COMPACTION_FAILED_WARNING_CODE.to_string()),
                message: format!("自动压缩上下文失败，已继续当前请求：{error}"),
            };
            if let Err(emit_error) = app.emit(request_event_name, &warning_event) {
                tracing::warn!("[AsterAgent] 发送自动压缩失败提醒失败: {}", emit_error);
            }
        }
    }

    Ok(())
}
