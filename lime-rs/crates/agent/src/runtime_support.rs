//! Agent runtime 支持模块。
//!
//! 这里只组合 queued Turn 的 durable store；Thread / Turn / Item 历史由 App Server
//! EventLogWriter + ProjectionStore 统一物化，不在 lime-agent 内建立第二套 transcript store。

use crate::queued_turn::QueuedTurnSnapshot;
use agent_runtime::runtime_queue::{
    RuntimeQueueService, RuntimeQueuedTurn, SqliteRuntimeQueueStore,
};
use lime_core::app_paths;
use lime_core::database::DbConnection;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

const QUEUED_TURN_EVENT_NAME_METADATA_KEY: &str = "event_name";
const DEFAULT_QUEUE_EVENT_NAME: &str = "agent_stream";
static RUNTIME_ROOT: OnceLock<Result<PathBuf, String>> = OnceLock::new();
static RUNTIME_QUEUE_SERVICE: OnceLock<Arc<RuntimeQueueService>> = OnceLock::new();

pub(crate) fn ensure_runtime_dirs() -> Result<PathBuf, String> {
    RUNTIME_ROOT
        .get_or_init(|| {
            let root = app_paths::resolve_sessions_dir()?.join("runtime");
            initialize_runtime_dirs(root)
        })
        .clone()
}

fn initialize_runtime_dirs(root: PathBuf) -> Result<PathBuf, String> {
    std::fs::create_dir_all(&root)
        .map_err(|error| format!("创建 Agent runtime 目录 {} 失败: {error}", root.display()))?;
    Ok(root)
}

/// 启动期显式初始化 Agent runtime 目录与 queued Turn durable store。
pub fn initialize_agent_runtime(db: DbConnection) -> Result<(), String> {
    ensure_runtime_dirs()?;
    if RUNTIME_QUEUE_SERVICE.get().is_none() {
        let store = SqliteRuntimeQueueStore::new(db)
            .map_err(|error| format!("初始化 runtime queue SQLite store 失败: {error}"))?;
        let _ = RUNTIME_QUEUE_SERVICE.set(Arc::new(RuntimeQueueService::new(Arc::new(store))));
    }
    Ok(())
}

fn require_runtime_queue_service() -> Result<Arc<RuntimeQueueService>, String> {
    RUNTIME_QUEUE_SERVICE
        .get()
        .cloned()
        .ok_or_else(|| "Agent runtime queue SQLite store 尚未初始化".to_string())
}

pub(crate) async fn list_runtime_queued_turns(
    session_id: &str,
) -> Result<Vec<RuntimeQueuedTurn>, String> {
    require_runtime_queue_service()?
        .list_queued_turns(session_id)
        .await
        .map_err(|error| format!("读取 queued runtime turns 失败: {error}"))
}

async fn list_runtime_queued_turn_session_ids() -> Result<Vec<String>, String> {
    require_runtime_queue_service()?
        .list_queued_turn_session_ids()
        .await
        .map_err(|error| format!("读取 queued runtime session ids 失败: {error}"))
}

pub(crate) async fn prepare_runtime_queue_resumption() -> Result<Vec<String>, String> {
    ensure_runtime_dirs()?;
    list_runtime_queued_turn_session_ids().await
}

pub(crate) async fn enqueue_runtime_turn(
    queued_turn: RuntimeQueuedTurn,
) -> Result<RuntimeQueuedTurn, String> {
    require_runtime_queue_service()?
        .enqueue_turn(queued_turn)
        .await
        .map_err(|error| format!("写入 queued runtime turn 失败: {error}"))
}

pub(crate) async fn remove_runtime_queued_turn_from_store(
    queued_turn_id: &str,
) -> Result<Option<RuntimeQueuedTurn>, String> {
    require_runtime_queue_service()?
        .remove_queued_turn(queued_turn_id)
        .await
        .map_err(|error| format!("删除 queued runtime turn 失败: {error}"))
}

pub(crate) async fn clear_runtime_queued_turns(
    session_id: &str,
) -> Result<Vec<RuntimeQueuedTurn>, String> {
    require_runtime_queue_service()?
        .clear_queued_turns(session_id)
        .await
        .map_err(|error| format!("清空 queued runtime turns 失败: {error}"))
}

pub(crate) async fn submit_runtime_turn_to_queue(
    queued_turn: RuntimeQueuedTurn,
    queue_if_busy: bool,
) -> Result<agent_runtime::runtime_queue::RuntimeQueueSubmitResult, String> {
    require_runtime_queue_service()?
        .submit_turn(queued_turn, queue_if_busy)
        .await
        .map_err(|error| format!("提交 runtime queue turn 失败: {error}"))
}

pub(crate) async fn take_next_runtime_queued_turn(
    session_id: &str,
    acquire_gate: bool,
    completed_turn_id: Option<&str>,
) -> Result<Option<RuntimeQueuedTurn>, String> {
    let queue = require_runtime_queue_service()?;
    let queued_turn = if acquire_gate {
        queue.resume_if_idle(session_id).await
    } else if let Some(turn_id) = completed_turn_id {
        queue
            .finish_matching_turn_and_take_next(session_id, turn_id)
            .await
    } else {
        queue.finish_turn_and_take_next(session_id).await
    }
    .map_err(|error| format!("读取下一条 runtime queue turn 失败: {error}"))?;
    Ok(queued_turn)
}

pub(crate) fn runtime_queue_has_active_turn(session_id: &str) -> Result<bool, String> {
    Ok(require_runtime_queue_service()?.has_active_turn(session_id))
}

pub(crate) fn finish_active_runtime_turn_in_queue_if_matches(
    session_id: &str,
    queued_turn_id: &str,
) -> Result<bool, String> {
    Ok(require_runtime_queue_service()?.finish_active_turn_if_matches(session_id, queued_turn_id))
}

pub(crate) fn queued_turn_event_name_from_runtime(queued_turn: &RuntimeQueuedTurn) -> String {
    queued_turn
        .metadata
        .get(QUEUED_TURN_EVENT_NAME_METADATA_KEY)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_QUEUE_EVENT_NAME)
        .to_string()
}

pub(crate) fn queued_turn_snapshot_from_runtime(
    queued_turn: &RuntimeQueuedTurn,
    position: usize,
) -> QueuedTurnSnapshot {
    QueuedTurnSnapshot {
        queued_turn_id: queued_turn.queued_turn_id.clone(),
        message_preview: queued_turn.message_preview.clone(),
        message_text: queued_turn.message_text.clone(),
        created_at: queued_turn.created_at,
        image_count: queued_turn.image_count,
        position,
    }
}
