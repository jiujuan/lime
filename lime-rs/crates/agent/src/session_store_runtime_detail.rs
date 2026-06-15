//! 运行态会话详情装配。

use lime_core::database::DbConnection;
use lime_core::database::agent_session_repository;
use std::time::Instant;

use super::session_store_runtime_projection::{
    apply_aster_runtime_snapshot, apply_runtime_usage_fallback_to_latest_assistant_message,
};
use super::session_store_subagent_context::{
    load_child_subagent_sessions, load_subagent_parent_context,
    should_load_runtime_overlay_for_runtime_detail,
    should_load_subagent_runtime_context_for_runtime_detail,
};
use super::session_store_types::SessionDetail;
use super::{get_session_sync_with_history_page, resolve_session_provider_selector};
use crate::aster_runtime_support::load_aster_runtime_snapshot;
use crate::event_converter::convert_to_tauri_message;
use crate::session_execution_runtime::{
    build_session_execution_runtime, reconcile_session_execution_runtime_permission_fallback,
};
use crate::session_query::read_session;

pub(super) fn apply_current_runtime_conversation(
    detail: &mut SessionDetail,
    session: &aster::session::Session,
    history_limit: Option<usize>,
    history_offset: usize,
    before_message_id: Option<i64>,
) {
    if before_message_id.is_some() {
        return;
    }

    let Some(conversation) = session.conversation.as_ref() else {
        return;
    };

    let mut messages = conversation
        .messages()
        .iter()
        .filter(|message| message.is_user_visible())
        .map(convert_to_tauri_message)
        .collect::<Vec<_>>();

    if let Some(limit) = history_limit {
        let len = messages.len();
        let end = len.saturating_sub(history_offset.min(len));
        let start = end.saturating_sub(limit);
        messages = messages[start..end].to_vec();
    }

    detail.messages = messages;
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
    let (session, runtime_snapshot) = if load_runtime_overlay {
        let include_messages = before_message_id.is_none();
        let (session_result, snapshot_result) = tokio::join!(
            read_session(session_id, include_messages, "读取运行态 session 失败"),
            load_aster_runtime_snapshot(session_id),
        );
        let session = match session_result {
            Ok(session) => Some(session),
            Err(error) => {
                tracing::warn!(
                    "[SessionStore] 读取运行态 session 失败，execution runtime 已降级忽略: session_id={}, error={}",
                    session_id,
                    error
                );
                None
            }
        };
        let snapshot = match snapshot_result {
            Ok(snapshot) => Some(snapshot),
            Err(error) => {
                tracing::warn!(
                    "[SessionStore] 读取 Aster runtime snapshot 失败: session_id={}, error={}",
                    session_id,
                    error
                );
                None
            }
        };
        (session, snapshot)
    } else {
        (None, None)
    };
    let overlay_ms = overlay_started_at.elapsed().as_millis();

    if let Some(session) = session.as_ref() {
        apply_current_runtime_conversation(
            &mut detail,
            session,
            history_limit,
            history_offset,
            before_message_id,
        );
    }

    let usage_fallback_started_at = Instant::now();
    if let Some(session) = session.as_ref() {
        if let Some(usage) =
            apply_runtime_usage_fallback_to_latest_assistant_message(&mut detail.messages, session)
        {
            match db.lock() {
                Ok(conn) => {
                    if let Err(error) =
                        agent_session_repository::update_latest_assistant_message_usage(
                            &conn,
                            session_id,
                            usage.input_tokens,
                            usage.output_tokens,
                            usage.cached_input_tokens,
                            usage.cache_creation_input_tokens,
                        )
                    {
                        tracing::warn!(
                            "[SessionStore] 运行态 usage 回填消息失败，已降级继续: session_id={}, error={}",
                            session_id,
                            error
                        );
                    }
                }
                Err(error) => {
                    tracing::warn!(
                        "[SessionStore] 运行态 usage 回填消息时数据库锁定失败，已降级继续: session_id={}, error={}",
                        session_id,
                        error
                    );
                }
            }
        }
    }
    let usage_fallback_ms = usage_fallback_started_at.elapsed().as_millis();

    let execution_runtime_started_at = Instant::now();
    detail.execution_runtime = build_session_execution_runtime(
        session_id,
        session.as_ref(),
        detail.execution_strategy.clone(),
        runtime_snapshot.as_ref(),
        session.as_ref().and_then(resolve_session_provider_selector),
    );
    let execution_runtime_ms = execution_runtime_started_at.elapsed().as_millis();

    let apply_snapshot_started_at = Instant::now();
    if let Some(snapshot) = runtime_snapshot.as_ref() {
        apply_aster_runtime_snapshot(&mut detail, snapshot);
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
        match load_subagent_parent_context(db, session_id, session.as_ref()).await {
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
