//! 运行态会话详情装配。

use lime_core::database::DbConnection;
use std::time::Instant;

use super::get_session_sync_with_history_page;
use super::session_store_provider_routing::read_session_provider_selector;
use super::session_store_runtime_projection::{
    apply_runtime_snapshot, apply_runtime_usage_fallback_to_latest_assistant_message,
};
use super::session_store_subagent_context::{
    load_child_subagent_sessions, load_subagent_parent_context,
    should_load_runtime_overlay_for_runtime_detail,
    should_load_subagent_runtime_context_for_runtime_detail,
};
use super::session_store_types::SessionDetail;
use crate::protocol::AgentMessage as RuntimeAgentMessage;
use crate::runtime_support::load_runtime_snapshot_overlay;
use crate::session_execution_runtime::{
    build_session_execution_runtime, reconcile_session_execution_runtime_permission_fallback,
};
use crate::session_execution_runtime_query::read_session_execution_runtime_session_projection;
use crate::session_runtime_conversation_query::read_runtime_conversation_window;

pub(super) fn apply_current_runtime_conversation(
    detail: &mut SessionDetail,
    messages: Option<Vec<RuntimeAgentMessage>>,
    before_message_id: Option<i64>,
) {
    if before_message_id.is_some() {
        return;
    }

    if let Some(messages) = messages {
        detail.messages = messages;
    }
}

fn is_session_archived_sync(db: &DbConnection, session_id: &str) -> Result<bool, String> {
    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
    let archived_at: Option<String> = conn
        .query_row(
            "SELECT archived_at FROM agent_sessions WHERE id = ?1",
            [session_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("读取会话归档状态失败: {e}"))?;

    Ok(archived_at
        .as_deref()
        .map(str::trim)
        .is_some_and(|value| !value.is_empty()))
}

pub async fn get_runtime_session_detail(
    db: &DbConnection,
    session_id: &str,
) -> Result<SessionDetail, String> {
    get_runtime_session_detail_with_history_limit(db, session_id, None).await
}

pub async fn get_runtime_session_detail_with_history_limit(
    db: &DbConnection,
    session_id: &str,
    history_limit: Option<usize>,
) -> Result<SessionDetail, String> {
    get_runtime_session_detail_with_history_window(db, session_id, history_limit, 0).await
}

pub async fn get_runtime_session_detail_with_history_window(
    db: &DbConnection,
    session_id: &str,
    history_limit: Option<usize>,
    history_offset: usize,
) -> Result<SessionDetail, String> {
    get_runtime_session_detail_with_history_page(
        db,
        session_id,
        history_limit,
        history_offset,
        None,
    )
    .await
}

pub async fn get_runtime_session_detail_with_history_page(
    db: &DbConnection,
    session_id: &str,
    history_limit: Option<usize>,
    history_offset: usize,
    before_message_id: Option<i64>,
) -> Result<SessionDetail, String> {
    let started_at = Instant::now();
    let detail_started_at = Instant::now();
    let mut detail = get_session_sync_with_history_page(
        db,
        session_id,
        history_limit,
        history_offset,
        before_message_id,
    )?;
    let detail_ms = detail_started_at.elapsed().as_millis();

    let archive_check_started_at = Instant::now();
    let is_archived = is_session_archived_sync(db, session_id)?;
    let archive_check_ms = archive_check_started_at.elapsed().as_millis();
    if is_archived {
        let total_ms = started_at.elapsed().as_millis();
        tracing::info!(
            "[SessionStore] get_runtime_session_detail 归档快路径完成: session_id={}, total_ms={}, detail_ms={}, archive_check_ms={}, history_limit={:?}, history_offset={}, before_message_id={:?}, messages_count={}, turns_count={}, items_count={}",
            session_id,
            total_ms,
            detail_ms,
            archive_check_ms,
            history_limit,
            history_offset,
            before_message_id,
            detail.messages.len(),
            detail.turns.len(),
            detail.items.len(),
        );
        return Ok(detail);
    }

    let was_persisted_empty = detail.is_persisted_empty();

    let load_runtime_overlay = history_offset == 0
        && before_message_id.is_none()
        && should_load_runtime_overlay_for_runtime_detail(&detail, history_limit);

    let overlay_started_at = Instant::now();
    let (runtime_messages, runtime_snapshot) = if load_runtime_overlay {
        let (conversation_result, overlay_result) = tokio::join!(
            read_runtime_conversation_window(session_id, history_limit, history_offset),
            load_runtime_snapshot_overlay(session_id),
        );
        let runtime_messages = match conversation_result {
            Ok(messages) => messages,
            Err(error) => {
                tracing::warn!(
                    "[SessionStore] 读取 current runtime conversation 失败，已降级忽略: session_id={}, error={}",
                    session_id,
                    error
                );
                None
            }
        };
        let overlay = match overlay_result {
            Ok(overlay) => Some(overlay),
            Err(error) => {
                tracing::warn!(
                    "[SessionStore] 读取 runtime snapshot overlay 失败: session_id={}, error={}",
                    session_id,
                    error
                );
                None
            }
        };
        (runtime_messages, overlay)
    } else {
        (None, None)
    };
    let overlay_ms = overlay_started_at.elapsed().as_millis();

    apply_current_runtime_conversation(&mut detail, runtime_messages, before_message_id);

    let has_execution_runtime_overlay = runtime_snapshot
        .as_ref()
        .is_some_and(|overlay| overlay.execution_snapshot.latest_turn.is_some());
    let should_load_execution_runtime_session =
        load_runtime_overlay && (!was_persisted_empty || has_execution_runtime_overlay);

    let usage_fallback_started_at = Instant::now();
    let execution_runtime_session = if should_load_execution_runtime_session {
        match read_session_execution_runtime_session_projection(db, session_id) {
            Ok(session) => session,
            Err(error) => {
                tracing::warn!(
                    "[SessionStore] 读取 current execution runtime session 失败，已降级忽略: session_id={}, error={}",
                    session_id,
                    error
                );
                None
            }
        }
    } else {
        None
    };
    if let Some(usage) = execution_runtime_session
        .as_ref()
        .and_then(|session| session.usage.clone())
    {
        apply_runtime_usage_fallback_to_latest_assistant_message(&mut detail.messages, Some(usage));
    }
    let usage_fallback_ms = usage_fallback_started_at.elapsed().as_millis();

    let execution_runtime_started_at = Instant::now();
    let provider_selector = if should_load_execution_runtime_session {
        match read_session_provider_selector(db, session_id) {
            Ok(provider_selector) => provider_selector,
            Err(error) => {
                tracing::warn!(
                    "[SessionStore] 读取 current provider routing metadata 失败: session_id={}, error={}",
                    session_id,
                    error
                );
                None
            }
        }
    } else {
        None
    };
    detail.execution_runtime = build_session_execution_runtime(
        session_id,
        execution_runtime_session.as_ref(),
        detail.execution_strategy.clone(),
        runtime_snapshot
            .as_ref()
            .map(|overlay| &overlay.execution_snapshot),
        provider_selector,
    );
    let execution_runtime_ms = execution_runtime_started_at.elapsed().as_millis();

    let apply_snapshot_started_at = Instant::now();
    if let Some(overlay) = runtime_snapshot.as_ref() {
        apply_runtime_snapshot(&mut detail, &overlay.timeline_snapshot);
    }
    if let Some(runtime) = detail.execution_runtime.as_mut() {
        reconcile_session_execution_runtime_permission_fallback(
            runtime,
            &detail.items,
            detail.model.as_deref(),
        );
    }
    let apply_snapshot_ms = apply_snapshot_started_at.elapsed().as_millis();

    let load_subagent_runtime_context = history_offset == 0
        && before_message_id.is_none()
        && (was_persisted_empty
            || should_load_subagent_runtime_context_for_runtime_detail(&detail, history_limit));

    let child_subagents_started_at = Instant::now();
    if load_subagent_runtime_context {
        match load_child_subagent_sessions(db, session_id).await {
            Ok(child_subagent_sessions) => {
                detail.child_subagent_sessions = child_subagent_sessions;
            }
            Err(error) => {
                tracing::warn!(
                    "[SessionStore] 读取 child subagent sessions 失败: session_id={}, error={}",
                    session_id,
                    error
                );
            }
        }
    }
    let child_subagents_ms = child_subagents_started_at.elapsed().as_millis();

    let parent_context_started_at = Instant::now();
    if load_subagent_runtime_context {
        match load_subagent_parent_context(db, session_id, None).await {
            Ok(subagent_parent_context) => {
                detail.subagent_parent_context = subagent_parent_context;
            }
            Err(error) => {
                tracing::warn!(
                    "[SessionStore] 读取 subagent parent context 失败: session_id={}, error={}",
                    session_id,
                    error
                );
            }
        }
    }
    let parent_context_ms = parent_context_started_at.elapsed().as_millis();

    if was_persisted_empty && detail.is_persisted_empty() {
        let total_ms = started_at.elapsed().as_millis();
        tracing::info!(
            "[SessionStore] get_runtime_session_detail 空会话快路径完成: session_id={}, total_ms={}, detail_ms={}, archive_check_ms={}, overlay_ms={}, child_subagents_ms={}, parent_context_ms={}, history_limit={:?}, history_offset={}, before_message_id={:?}",
            session_id,
            total_ms,
            detail_ms,
            archive_check_ms,
            overlay_ms,
            child_subagents_ms,
            parent_context_ms,
            history_limit,
            history_offset,
            before_message_id,
        );
        return Ok(detail);
    }
    let total_ms = started_at.elapsed().as_millis();

    tracing::info!(
        "[SessionStore] get_runtime_session_detail 完成: session_id={}, total_ms={}, detail_ms={}, overlay_ms={}, usage_fallback_ms={}, execution_runtime_ms={}, apply_snapshot_ms={}, child_subagents_ms={}, parent_context_ms={}, history_limit={:?}, history_offset={}, before_message_id={:?}, runtime_overlay_loaded={}, subagent_runtime_context_loaded={}, messages_count={}, turns_count={}, items_count={}, child_subagents_count={}, has_parent_context={}",
        session_id,
        total_ms,
        detail_ms,
        overlay_ms,
        usage_fallback_ms,
        execution_runtime_ms,
        apply_snapshot_ms,
        child_subagents_ms,
        parent_context_ms,
        history_limit,
        history_offset,
        before_message_id,
        load_runtime_overlay,
        load_subagent_runtime_context,
        detail.messages.len(),
        detail.turns.len(),
        detail.items.len(),
        detail.child_subagent_sessions.len(),
        detail.subagent_parent_context.is_some(),
    );

    Ok(detail)
}
