use super::*;

pub(in crate::commands::aster_agent_cmd::runtime_turn) async fn update_compaction_session_metrics(
    session_config: &aster::agents::SessionConfig,
    usage: &aster::providers::base::ProviderUsage,
) -> Result<(), String> {
    let session = read_session(&session_config.id, false, "读取会话 token 统计失败").await?;

    let update = build_compaction_session_metrics_update(&session, session_config, usage);
    persist_compaction_session_metrics_update(&session_config.id, &update).await
}

pub(in crate::commands::aster_agent_cmd::runtime_turn) fn resolve_runtime_message_usage_from_session(
    session: &aster::session::Session,
) -> Option<lime_agent::AgentTokenUsage> {
    match (session.input_tokens, session.output_tokens) {
        (Some(input_tokens), Some(output_tokens)) if input_tokens >= 0 && output_tokens >= 0 => {
            Some(lime_agent::AgentTokenUsage {
                input_tokens: input_tokens as u32,
                output_tokens: output_tokens as u32,
                cached_input_tokens: session
                    .cached_input_tokens
                    .filter(|value| *value >= 0)
                    .map(|value| value as u32),
                cache_creation_input_tokens: session
                    .cache_creation_input_tokens
                    .filter(|value| *value >= 0)
                    .map(|value| value as u32),
            })
        }
        _ => None,
    }
}

pub(in crate::commands::aster_agent_cmd::runtime_turn) fn resolve_runtime_message_usage_from_persisted_values(
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
    cached_input_tokens: Option<i64>,
    cache_creation_input_tokens: Option<i64>,
) -> Option<lime_agent::AgentTokenUsage> {
    match (input_tokens, output_tokens) {
        (Some(input_tokens), Some(output_tokens)) if input_tokens >= 0 && output_tokens >= 0 => {
            Some(lime_agent::AgentTokenUsage {
                input_tokens: input_tokens as u32,
                output_tokens: output_tokens as u32,
                cached_input_tokens: cached_input_tokens
                    .filter(|value| *value >= 0)
                    .map(|value| value as u32),
                cache_creation_input_tokens: cache_creation_input_tokens
                    .filter(|value| *value >= 0)
                    .map(|value| value as u32),
            })
        }
        _ => None,
    }
}

pub(in crate::commands::aster_agent_cmd::runtime_turn) fn resolve_runtime_message_usage_from_persisted_session(
    db: &DbConnection,
    session_id: &str,
) -> Option<lime_agent::AgentTokenUsage> {
    let conn = db.lock().ok()?;
    let usage_row = conn
        .query_row(
            "SELECT input_tokens, output_tokens, cached_input_tokens, cache_creation_input_tokens
             FROM agent_sessions
             WHERE id = ?1",
            [session_id],
            |row| {
                Ok((
                    row.get::<_, Option<i64>>(0)?,
                    row.get::<_, Option<i64>>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                    row.get::<_, Option<i64>>(3)?,
                ))
            },
        )
        .ok()?;

    resolve_runtime_message_usage_from_persisted_values(
        usage_row.0,
        usage_row.1,
        usage_row.2,
        usage_row.3,
    )
}

pub(in crate::commands::aster_agent_cmd::runtime_turn) async fn resolve_runtime_message_usage(
    session_id: &str,
    db: Option<&DbConnection>,
) -> Option<lime_agent::AgentTokenUsage> {
    if let Ok(session) = read_session(session_id, false, "读取会话 token 统计失败").await {
        if let Some(usage) = resolve_runtime_message_usage_from_session(&session) {
            return Some(usage);
        }
    }

    db.and_then(|value| resolve_runtime_message_usage_from_persisted_session(value, session_id))
}

pub(in crate::commands::aster_agent_cmd::runtime_turn) async fn resolve_runtime_final_done_event(
    session_id: &str,
    db: Option<&DbConnection>,
) -> RuntimeAgentEvent {
    RuntimeAgentEvent::FinalDone {
        usage: resolve_runtime_message_usage(session_id, db).await,
    }
}

pub(in crate::commands::aster_agent_cmd::runtime_turn) fn persist_latest_assistant_message_usage(
    db: &DbConnection,
    session_id: &str,
    usage: &lime_agent::AgentTokenUsage,
) -> Result<(), String> {
    let conn = db
        .lock()
        .map_err(|error| format!("更新消息 usage 时数据库锁定失败: {error}"))?;
    lime_core::database::agent_session_repository::update_latest_assistant_message_usage(
        &conn,
        session_id,
        usage.input_tokens,
        usage.output_tokens,
        usage.cached_input_tokens,
        usage.cache_creation_input_tokens,
    )?;
    Ok(())
}

fn build_compaction_session_metrics_update(
    session: &aster::session::Session,
    session_config: &aster::agents::SessionConfig,
    usage: &aster::providers::base::ProviderUsage,
) -> CompactionSessionMetricsUpdate {
    let schedule_id = session_config
        .schedule_id
        .clone()
        .or(session.schedule_id.clone());

    let accumulate = |current: Option<i32>, delta: Option<i32>| match (current, delta) {
        (Some(lhs), Some(rhs)) => Some(lhs + rhs),
        _ => current.or(delta),
    };

    let accumulated_total = accumulate(session.accumulated_total_tokens, usage.usage.total_tokens);
    let accumulated_input = accumulate(session.accumulated_input_tokens, usage.usage.input_tokens);
    let accumulated_output =
        accumulate(session.accumulated_output_tokens, usage.usage.output_tokens);
    let cached_input_tokens = if usage.usage.output_tokens.is_some() {
        usage.usage.cached_input_tokens
    } else {
        Some(0)
    };
    let cache_creation_input_tokens = if usage.usage.output_tokens.is_some() {
        usage.usage.cache_creation_input_tokens
    } else {
        Some(0)
    };

    let current_window_tokens = usage
        .usage
        .output_tokens
        .or(usage.usage.total_tokens)
        .unwrap_or(0);

    CompactionSessionMetricsUpdate {
        schedule_id,
        current_window_tokens,
        cached_input_tokens,
        cache_creation_input_tokens,
        accumulated_total_tokens: accumulated_total,
        accumulated_input_tokens: accumulated_input,
        accumulated_output_tokens: accumulated_output,
    }
}
