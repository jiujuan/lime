//! Agent runtime 支持模块
//!
//! 收口 Lime 对迁移期 thread runtime store 的访问边界，
//! 避免业务层散落依赖上游 free function。

use crate::aster_session_store::LimeSessionStore;
use crate::queued_turn::QueuedTurnSnapshot;
use crate::runtime_queue_aster_adapter::runtime_queue_service_from_store;
use crate::runtime_snapshot_adapter::{
    project_runtime_snapshot_record, RuntimeTimelineSnapshotProjection,
};
use crate::runtime_state::QueuedTurnTask;
use crate::runtime_store_aster_adapter::{
    initialize_aster_runtime_with_root, initialized_aster_runtime_root,
    load_aster_runtime_snapshot, require_aster_runtime_store, runtime_snapshot_record_from_aster,
    AsterThreadRuntimeStore,
};
use crate::session_execution_runtime::SessionExecutionRuntimeSnapshotProjection;
use crate::session_execution_runtime_adapter::project_session_execution_runtime_snapshot_record;
use crate::subagent_runtime_adapter::project_subagent_latest_turn_record;
use agent_runtime::runtime_queue::{RuntimeQueueService, RuntimeQueuedTurn};
use lime_core::app_paths;
use lime_core::database::DbConnection;
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};
use thread_store::runtime_snapshot::RuntimeSessionSnapshotRecord;

const QUEUED_TURN_EVENT_NAME_METADATA_KEY: &str = "event_name";
const DEFAULT_QUEUE_EVENT_NAME: &str = "agent_stream";
static ASTER_RUNTIME_ROOT: OnceLock<Result<PathBuf, String>> = OnceLock::new();
static RUNTIME_QUEUE_SERVICE: OnceLock<Arc<RuntimeQueueService>> = OnceLock::new();

pub(crate) type RuntimeSessionSnapshotOverlay =
    agent_runtime::session_execution::SessionRuntimeSnapshotOverlay<
        SessionExecutionRuntimeSnapshotProjection,
        RuntimeTimelineSnapshotProjection,
    >;

pub(crate) fn ensure_runtime_dirs() -> Result<PathBuf, String> {
    ASTER_RUNTIME_ROOT
        .get_or_init(initialize_runtime_dirs)
        .clone()
}

pub(crate) fn require_runtime_dirs() -> Result<PathBuf, String> {
    match ASTER_RUNTIME_ROOT.get() {
        Some(result) => result.clone(),
        None => {
            Err("Agent runtime尚未初始化；应在应用启动期先调用 ensure_runtime_dirs()".to_string())
        }
    }
}

#[cfg(test)]
pub(crate) fn ensure_runtime_dirs_with_root(root: PathBuf) -> Result<PathBuf, String> {
    ASTER_RUNTIME_ROOT
        .get_or_init(|| initialize_runtime_dirs_with_root(root))
        .clone()
}

/// 启动期显式初始化 Agent runtime 目录、共享 runtime store 与全局 session store。
pub fn initialize_agent_runtime(db: DbConnection) -> Result<(), String> {
    let runtime_root = ensure_runtime_dirs()?;
    let session_store = Arc::new(LimeSessionStore::new(db.clone()));

    block_on_runtime_init(async move {
        initialize_aster_runtime_with_root(runtime_root, Some(session_store)).await?;
        Ok(())
    })
}

fn block_on_runtime_init<F>(future: F) -> Result<(), String>
where
    F: Future<Output = Result<(), String>> + Send + 'static,
{
    if tokio::runtime::Handle::try_current().is_ok() {
        let join_handle = std::thread::Builder::new()
            .name("lime-runtime-init".to_string())
            .spawn(move || run_runtime_future(future))
            .map_err(|error| format!("创建 Agent runtime 初始化线程失败: {error}"))?;
        return join_handle
            .join()
            .map_err(|_| "Agent runtime 初始化线程异常退出".to_string())?;
    }

    run_runtime_future(future)
}

fn run_runtime_future<F>(future: F) -> Result<(), String>
where
    F: Future<Output = Result<(), String>>,
{
    #[cfg(target_os = "windows")]
    tracing::info!("[AgentRuntime] Windows 平台 - 创建 Tokio Runtime (IOCP)");

    #[cfg(target_os = "macos")]
    tracing::info!("[AgentRuntime] macOS 平台 - 创建 Tokio Runtime (kqueue)");

    #[cfg(target_os = "linux")]
    tracing::info!("[AgentRuntime] Linux 平台 - 创建 Tokio Runtime (epoll)");

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .thread_name("lime-runtime")
        .enable_io()
        .enable_time()
        .build()
        .map_err(|error| format!("创建 Tokio Runtime 失败: {error}"))?;
    runtime.block_on(future)
}

fn initialize_runtime_dirs() -> Result<PathBuf, String> {
    if let Some(existing_root) = initialized_aster_runtime_root() {
        return initialize_runtime_dirs_with_root(existing_root);
    }

    initialize_runtime_dirs_with_root(app_paths::resolve_aster_dir()?)
}

fn initialize_runtime_dirs_with_root(root: PathBuf) -> Result<PathBuf, String> {
    let runtime_root = root.clone();
    block_on_runtime_init(
        async move { initialize_aster_runtime_with_root(runtime_root, None).await },
    )?;
    Ok(root)
}

/// 获取 Lime 当前统一使用的 Agent runtime store。
pub(crate) fn require_runtime_store() -> Result<Arc<AsterThreadRuntimeStore>, String> {
    ensure_runtime_dirs()?;
    require_aster_runtime_store()
}

async fn ensure_runtime_dirs_async() -> Result<PathBuf, String> {
    if ASTER_RUNTIME_ROOT.get().is_some() {
        return require_runtime_dirs();
    }

    tokio::task::spawn_blocking(ensure_runtime_dirs)
        .await
        .map_err(|error| format!("异步初始化 Agent runtime 失败: {error}"))?
}

async fn require_runtime_store_async() -> Result<Arc<AsterThreadRuntimeStore>, String> {
    ensure_runtime_dirs_async().await?;
    require_aster_runtime_store()
}

fn require_runtime_queue_service() -> Result<Arc<RuntimeQueueService>, String> {
    ensure_runtime_dirs()?;
    let store = require_aster_runtime_store()?;
    Ok(RUNTIME_QUEUE_SERVICE
        .get_or_init(|| runtime_queue_service_from_store(store))
        .clone())
}

async fn require_runtime_queue_service_async() -> Result<Arc<RuntimeQueueService>, String> {
    let store = require_runtime_store_async().await?;
    Ok(RUNTIME_QUEUE_SERVICE
        .get_or_init(|| runtime_queue_service_from_store(store))
        .clone())
}

/// 读取 runtime snapshot current record；Aster DTO 只在 store adapter 内短暂存在。
async fn load_runtime_snapshot_record(
    session_id: &str,
) -> Result<RuntimeSessionSnapshotRecord, String> {
    ensure_runtime_dirs_async().await?;
    let snapshot = load_aster_runtime_snapshot(session_id).await?;
    Ok(runtime_snapshot_record_from_aster(&snapshot))
}

/// 读取会话 runtime snapshot 并立即投影为 Lime current read model。
pub(crate) async fn load_runtime_snapshot_overlay(
    session_id: &str,
) -> Result<RuntimeSessionSnapshotOverlay, String> {
    let snapshot = load_runtime_snapshot_record(session_id).await?;
    Ok(RuntimeSessionSnapshotOverlay {
        execution_snapshot: project_session_execution_runtime_snapshot_record(&snapshot),
        timeline_snapshot: project_runtime_snapshot_record(&snapshot),
        subagent_latest_turn: project_subagent_latest_turn_record(&snapshot),
    })
}

pub(crate) async fn list_runtime_queued_turns(
    session_id: &str,
) -> Result<Vec<RuntimeQueuedTurn>, String> {
    let runtime_queue_service = require_runtime_queue_service_async().await?;
    runtime_queue_service
        .list_queued_turns(session_id)
        .await
        .map_err(|error| format!("读取 queued runtime turns 失败: {error}"))
}

async fn list_runtime_queued_turn_session_ids() -> Result<Vec<String>, String> {
    let runtime_queue_service = require_runtime_queue_service_async().await?;
    runtime_queue_service
        .list_queued_turn_session_ids()
        .await
        .map_err(|error| format!("读取 queued runtime session ids 失败: {error}"))
}

/// 启动恢复统一入口：只在这里完成当前 queued session 枚举。
pub(crate) async fn prepare_runtime_queue_resumption() -> Result<Vec<String>, String> {
    ensure_runtime_dirs_async().await?;
    list_runtime_queued_turn_session_ids().await
}

pub(crate) async fn enqueue_runtime_turn(
    queued_turn: RuntimeQueuedTurn,
) -> Result<RuntimeQueuedTurn, String> {
    let runtime_queue_service = require_runtime_queue_service_async().await?;
    runtime_queue_service
        .enqueue_turn(queued_turn)
        .await
        .map_err(|error| format!("写入 queued runtime turn 失败: {error}"))
}

pub(crate) async fn remove_runtime_queued_turn_from_store(
    queued_turn_id: &str,
) -> Result<Option<RuntimeQueuedTurn>, String> {
    let runtime_queue_service = require_runtime_queue_service_async().await?;
    runtime_queue_service
        .remove_queued_turn(queued_turn_id)
        .await
        .map_err(|error| format!("删除 queued runtime turn 失败: {error}"))
}

pub(crate) async fn clear_runtime_queued_turns(
    session_id: &str,
) -> Result<Vec<RuntimeQueuedTurn>, String> {
    let runtime_queue_service = require_runtime_queue_service_async().await?;
    runtime_queue_service
        .clear_queued_turns(session_id)
        .await
        .map_err(|error| format!("清空 queued runtime turns 失败: {error}"))
}

pub(crate) async fn submit_runtime_turn_to_queue(
    queued_turn: RuntimeQueuedTurn,
    queue_if_busy: bool,
) -> Result<agent_runtime::runtime_queue::RuntimeQueueSubmitResult, String> {
    let runtime_queue_service = require_runtime_queue_service_async().await?;
    runtime_queue_service
        .submit_turn(queued_turn, queue_if_busy)
        .await
        .map_err(|error| format!("提交 runtime queue turn 失败: {error}"))
}

pub(crate) async fn take_next_runtime_queued_turn(
    session_id: &str,
    acquire_gate: bool,
    completed_turn_id: Option<&str>,
) -> Result<Option<RuntimeQueuedTurn>, String> {
    let runtime_queue_service = require_runtime_queue_service_async().await?;
    let queued_turn = if acquire_gate {
        runtime_queue_service.resume_if_idle(session_id).await
    } else if let Some(turn_id) = completed_turn_id {
        runtime_queue_service
            .finish_matching_turn_and_take_next(session_id, turn_id)
            .await
    } else {
        runtime_queue_service
            .finish_turn_and_take_next(session_id)
            .await
    }
    .map_err(|error| format!("读取下一条 runtime queue turn 失败: {error}"))?;

    Ok(queued_turn)
}

pub(crate) fn runtime_queue_has_active_turn(session_id: &str) -> Result<bool, String> {
    let runtime_queue_service = require_runtime_queue_service()?;
    Ok(runtime_queue_service.has_active_turn(session_id))
}

pub(crate) fn finish_active_runtime_turn_in_queue_if_matches(
    session_id: &str,
    queued_turn_id: &str,
) -> Result<bool, String> {
    let runtime_queue_service = require_runtime_queue_service()?;
    Ok(runtime_queue_service.finish_active_turn_if_matches(session_id, queued_turn_id))
}

pub(crate) fn queued_turn_runtime_from_task(task: &QueuedTurnTask<Value>) -> RuntimeQueuedTurn {
    build_queued_turn_runtime(QueuedTurnRuntimeInput {
        queued_turn_id: &task.queued_turn_id,
        session_id: &task.session_id,
        event_name: &task.event_name,
        message_preview: &task.message_preview,
        message_text: &task.message_text,
        created_at: task.created_at,
        image_count: task.image_count,
        payload: task.payload.clone(),
    })
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

struct QueuedTurnRuntimeInput<'a> {
    queued_turn_id: &'a str,
    session_id: &'a str,
    event_name: &'a str,
    message_preview: &'a str,
    message_text: &'a str,
    created_at: i64,
    image_count: usize,
    payload: Value,
}

fn build_queued_turn_runtime(input: QueuedTurnRuntimeInput<'_>) -> RuntimeQueuedTurn {
    let QueuedTurnRuntimeInput {
        queued_turn_id,
        session_id,
        event_name,
        message_preview,
        message_text,
        created_at,
        image_count,
        payload,
    } = input;
    let mut metadata = HashMap::new();
    if !event_name.trim().is_empty() {
        metadata.insert(
            QUEUED_TURN_EVENT_NAME_METADATA_KEY.to_string(),
            Value::String(event_name.to_string()),
        );
    }

    RuntimeQueuedTurn {
        queued_turn_id: queued_turn_id.to_string(),
        session_id: session_id.to_string(),
        message_preview: message_preview.to_string(),
        message_text: message_text.to_string(),
        created_at,
        image_count,
        payload,
        metadata,
    }
}
