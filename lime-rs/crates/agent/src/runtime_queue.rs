use crate::protocol::AgentEvent as RuntimeAgentEvent;
use crate::runtime_support::{
    clear_runtime_queued_turns, enqueue_runtime_turn, list_runtime_queued_turns,
    prepare_runtime_queue_resumption, queued_turn_event_name_from_runtime,
    queued_turn_runtime_from_task, queued_turn_snapshot_from_runtime,
    remove_runtime_queued_turn_from_store,
};
use crate::{QueuedTurnSnapshot, QueuedTurnTask};
use aster::session::{
    require_shared_session_runtime_queue_service, QueuedTurnRuntime, RuntimeQueueSubmitResult,
};
use futures::future::{BoxFuture, FutureExt};
use serde_json::Value;
use std::panic::AssertUnwindSafe;
use std::sync::Arc;
use std::time::Instant;

const RUNTIME_TURN_THREAD_STACK_SIZE: usize = 8 * 1024 * 1024;

pub type RuntimeQueueExecutor<C> =
    Arc<dyn Fn(C, Value) -> BoxFuture<'static, Result<(), String>> + Send + Sync>;

pub type RuntimeQueueEventEmitter = Arc<dyn Fn(String, RuntimeAgentEvent) + Send + Sync + 'static>;

fn emit_runtime_queue_event(
    emitter: &RuntimeQueueEventEmitter,
    event_name: &str,
    event: RuntimeAgentEvent,
) {
    emitter(event_name.to_string(), event);
}

fn runtime_turn_panic_message(error: Box<dyn std::any::Any + Send>) -> String {
    if let Some(message) = error.downcast_ref::<&str>() {
        return format!("runtime turn 后台任务 panic: {message}");
    }
    if let Some(message) = error.downcast_ref::<String>() {
        return format!("runtime turn 后台任务 panic: {message}");
    }
    "runtime turn 后台任务 panic: unknown panic payload".to_string()
}

fn release_runtime_turn_gate_after_start_failure(
    session_id: &str,
    queued_turn_id: &str,
) -> Result<bool, String> {
    let runtime_queue_service = require_shared_session_runtime_queue_service()
        .map_err(|error| format!("读取 runtime queue service 失败: {error}"))?;
    Ok(runtime_queue_service.finish_active_turn_if_matches(session_id, queued_turn_id))
}

async fn run_runtime_turn_and_continue<C>(
    session_id: String,
    event_name: String,
    queued_turn_id: String,
    context: C,
    executor: RuntimeQueueExecutor<C>,
    emitter: RuntimeQueueEventEmitter,
    payload: Value,
) where
    C: Clone + Send + Sync + 'static,
{
    let result = AssertUnwindSafe(executor(context.clone(), payload))
        .catch_unwind()
        .await;
    match result {
        Ok(Ok(())) => {}
        Ok(Err(error)) => {
            tracing::warn!("[AgentRuntime][Queue] 队列任务执行失败: {}", error);
            emit_runtime_queue_event(
                &emitter,
                &event_name,
                RuntimeAgentEvent::Error { message: error },
            );
        }
        Err(error) => {
            let message = runtime_turn_panic_message(error);
            tracing::error!("[AgentRuntime][Queue] {}", message);
            emit_runtime_queue_event(&emitter, &event_name, RuntimeAgentEvent::Error { message });
        }
    }
    if let Err(error) = continue_runtime_queue_after_turn(
        session_id,
        queued_turn_id,
        context.clone(),
        executor.clone(),
        emitter.clone(),
    )
    .await
    {
        tracing::warn!("[AgentRuntime][Queue] 调度下一条排队 turn 失败: {}", error);
    }
}

fn spawn_runtime_turn_task<C>(
    session_id: String,
    event_name: String,
    queued_turn_id: String,
    context: C,
    executor: RuntimeQueueExecutor<C>,
    emitter: RuntimeQueueEventEmitter,
    payload: Value,
) where
    C: Clone + Send + Sync + 'static,
{
    let thread_name = format!("lime-runtime-turn-{}", session_id);
    let event_name_for_thread = event_name.clone();
    let emitter_for_thread = emitter.clone();
    let fallback_session_id = session_id.clone();
    let fallback_event_name = event_name.clone();
    let fallback_queued_turn_id = queued_turn_id.clone();
    let fallback_context = context.clone();
    let fallback_executor = executor.clone();
    let fallback_emitter = emitter.clone();
    let fallback_payload = payload.clone();
    let spawn_result = std::thread::Builder::new()
        .name(thread_name)
        .stack_size(RUNTIME_TURN_THREAD_STACK_SIZE)
        .spawn(move || {
            let runtime = match tokio::runtime::Builder::new_multi_thread()
                .worker_threads(1)
                .thread_name("lime-runtime-turn-worker")
                .thread_stack_size(RUNTIME_TURN_THREAD_STACK_SIZE)
                .enable_io()
                .enable_time()
                .build()
            {
                Ok(runtime) => runtime,
                Err(error) => {
                    tracing::warn!(
                        "[AgentRuntime][Queue] 创建 runtime turn 专用运行时失败，尝试 current-thread 兜底: {}",
                        error
                    );
                    match tokio::runtime::Builder::new_current_thread()
                        .enable_io()
                        .enable_time()
                        .build()
                    {
                        Ok(runtime) => runtime,
                        Err(fallback_error) => {
                            let message = format!(
                                "创建 runtime turn 专用运行时失败: {error}; current-thread 兜底也失败: {fallback_error}"
                            );
                            tracing::error!("[AgentRuntime][Queue] {}", message);
                            emit_runtime_queue_event(
                                &emitter_for_thread,
                                &event_name_for_thread,
                                RuntimeAgentEvent::Error { message },
                            );
                            match release_runtime_turn_gate_after_start_failure(
                                &session_id,
                                &queued_turn_id,
                            ) {
                                Ok(true) => tracing::warn!(
                                    "[AgentRuntime][Queue] 已释放无法启动的 runtime turn gate: session_id={}, queued_turn_id={}",
                                    session_id,
                                    queued_turn_id
                                ),
                                Ok(false) => {}
                                Err(release_error) => tracing::warn!(
                                    "[AgentRuntime][Queue] 释放无法启动的 runtime turn gate 失败: session_id={}, queued_turn_id={}, error={}",
                                    session_id,
                                    queued_turn_id,
                                    release_error
                                ),
                            }
                            return;
                        }
                    }
                }
            };

            runtime.block_on(run_runtime_turn_and_continue(
                session_id,
                event_name_for_thread,
                queued_turn_id,
                context,
                executor,
                emitter_for_thread,
                payload,
            ));
        });

    if let Err(error) = spawn_result {
        let message = format!("启动 runtime turn 专用线程失败，回退到当前 Tokio runtime: {error}");
        tracing::error!("[AgentRuntime][Queue] {}", message);
        emit_runtime_queue_event(
            &fallback_emitter,
            &fallback_event_name,
            RuntimeAgentEvent::Warning {
                code: Some("runtime_turn_thread_spawn_failed".to_string()),
                message,
            },
        );
        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            handle.spawn(run_runtime_turn_and_continue(
                fallback_session_id,
                fallback_event_name,
                fallback_queued_turn_id,
                fallback_context,
                fallback_executor,
                fallback_emitter,
                fallback_payload,
            ));
        } else {
            emit_runtime_queue_event(
                &fallback_emitter,
                &fallback_event_name,
                RuntimeAgentEvent::Error {
                    message:
                        "启动 runtime turn 专用线程失败，且当前线程没有可用 Tokio runtime 兜底"
                            .to_string(),
                },
            );
            let release_result = if let Ok(runtime) = tokio::runtime::Builder::new_current_thread()
                .enable_io()
                .enable_time()
                .build()
            {
                runtime.block_on(continue_runtime_queue_after_turn(
                    fallback_session_id.clone(),
                    fallback_queued_turn_id.clone(),
                    fallback_context,
                    fallback_executor,
                    fallback_emitter,
                ))
            } else {
                let runtime_queue_service = require_shared_session_runtime_queue_service()
                    .map_err(|error| format!("读取 runtime queue service 失败: {error}"))
                    .map(|service| {
                        service.finish_active_turn_if_matches(
                            &fallback_session_id,
                            &fallback_queued_turn_id,
                        )
                    })
                    .map(|_| false);
                runtime_queue_service
            };
            if let Err(release_error) = release_result {
                tracing::warn!(
                    "[AgentRuntime][Queue] 释放无法启动的 runtime turn gate 失败: session_id={}, queued_turn_id={}, error={}",
                    fallback_session_id,
                    fallback_queued_turn_id,
                    release_error
                );
            }
        }
    }
}

async fn continue_runtime_queue_after_turn<C>(
    session_id: String,
    completed_turn_id: String,
    context: C,
    executor: RuntimeQueueExecutor<C>,
    emitter: RuntimeQueueEventEmitter,
) -> Result<bool, String>
where
    C: Clone + Send + Sync + 'static,
{
    start_next_runtime_queue_turn(
        session_id,
        false,
        Some(completed_turn_id),
        context,
        executor,
        emitter,
    )
    .await
}

async fn start_next_runtime_queue_turn<C>(
    session_id: String,
    acquire_gate: bool,
    completed_turn_id: Option<String>,
    context: C,
    executor: RuntimeQueueExecutor<C>,
    emitter: RuntimeQueueEventEmitter,
) -> Result<bool, String>
where
    C: Clone + Send + Sync + 'static,
{
    let runtime_queue_service = require_shared_session_runtime_queue_service()
        .map_err(|error| format!("读取 runtime queue service 失败: {error}"))?;
    let next_queued_turn = match if acquire_gate {
        runtime_queue_service.resume_if_idle(&session_id).await
    } else if let Some(turn_id) = completed_turn_id.as_deref() {
        runtime_queue_service
            .finish_matching_turn_and_take_next(&session_id, turn_id)
            .await
    } else {
        runtime_queue_service
            .finish_turn_and_take_next(&session_id)
            .await
    } {
        Ok(next_queued_turn) => next_queued_turn,
        Err(error) => {
            return Err(format!("读取下一条 runtime queue turn 失败: {}", error));
        }
    };
    let Some(next_queued_turn) = next_queued_turn else {
        return Ok(false);
    };

    let event_name = queued_turn_event_name_from_runtime(&next_queued_turn);
    emit_runtime_queue_event(
        &emitter,
        &event_name,
        RuntimeAgentEvent::QueueStarted {
            session_id: session_id.clone(),
            queued_turn_id: next_queued_turn.queued_turn_id.clone(),
        },
    );

    spawn_runtime_turn_task(
        session_id,
        event_name,
        next_queued_turn.queued_turn_id,
        context,
        executor,
        emitter,
        next_queued_turn.payload,
    );
    Ok(true)
}

pub async fn resume_runtime_queue_if_needed<C>(
    session_id: String,
    context: C,
    executor: RuntimeQueueExecutor<C>,
    emitter: RuntimeQueueEventEmitter,
) -> Result<bool, String>
where
    C: Clone + Send + Sync + 'static,
{
    if list_runtime_queued_turns(&session_id).await?.is_empty() {
        return Ok(false);
    }

    start_next_runtime_queue_turn(session_id, true, None, context, executor, emitter).await
}

pub async fn submit_runtime_turn<C>(
    queued_task: QueuedTurnTask<Value>,
    queue_if_busy: bool,
    skip_pre_submit_resume: bool,
    context: C,
    executor: RuntimeQueueExecutor<C>,
    emitter: RuntimeQueueEventEmitter,
) -> Result<(), String>
where
    C: Clone + Send + Sync + 'static,
{
    let submit_started_at = Instant::now();
    let runtime_queue_service = require_shared_session_runtime_queue_service()
        .map_err(|error| format!("读取 runtime queue service 失败: {error}"))?;
    let session_id = queued_task.session_id.clone();
    let resume_started_at = Instant::now();
    let resumed_queue =
        if skip_pre_submit_resume || runtime_queue_service.has_active_turn(&session_id) {
            false
        } else {
            resume_runtime_queue_if_needed(
                session_id.clone(),
                context.clone(),
                executor.clone(),
                emitter.clone(),
            )
            .await?
        };
    let resume_ms = resume_started_at.elapsed().as_millis();

    let queue_submit_started_at = Instant::now();
    match runtime_queue_service
        .submit_turn(queued_turn_runtime_from_task(&queued_task), queue_if_busy)
        .await
        .map_err(|error| format!("提交 runtime queue turn 失败: {error}"))?
    {
        RuntimeQueueSubmitResult::StartNow => {
            spawn_runtime_turn_task(
                session_id.clone(),
                queued_task.event_name,
                queued_task.queued_turn_id.clone(),
                context,
                executor,
                emitter,
                queued_task.payload,
            );
            tracing::info!(
                "[AgentRuntime][Queue] submit_runtime_turn accepted: session_id={}, queued_turn_id={}, result=start_now, resumed_queue={}, skip_pre_submit_resume={}, resume_ms={}, queue_submit_ms={}, total_ms={}",
                session_id,
                queued_task.queued_turn_id,
                resumed_queue,
                skip_pre_submit_resume,
                resume_ms,
                queue_submit_started_at.elapsed().as_millis(),
                submit_started_at.elapsed().as_millis()
            );
            Ok(())
        }
        RuntimeQueueSubmitResult::Busy => Err("当前会话仍在生成，无法立即开始执行".to_string()),
        RuntimeQueueSubmitResult::Enqueued {
            queued_turn,
            position,
        } => {
            emit_runtime_queue_event(
                &emitter,
                &queued_turn_event_name_from_runtime(&queued_turn),
                RuntimeAgentEvent::QueueAdded {
                    session_id: session_id.clone(),
                    queued_turn: queued_turn_snapshot_from_runtime(&queued_turn, position),
                },
            );
            tracing::info!(
                "[AgentRuntime][Queue] submit_runtime_turn accepted: session_id={}, queued_turn_id={}, result=enqueued, position={}, resumed_queue={}, skip_pre_submit_resume={}, resume_ms={}, queue_submit_ms={}, total_ms={}",
                session_id,
                queued_turn.queued_turn_id,
                position,
                resumed_queue,
                skip_pre_submit_resume,
                resume_ms,
                queue_submit_started_at.elapsed().as_millis(),
                submit_started_at.elapsed().as_millis()
            );
            Ok(())
        }
    }
}

pub async fn clear_runtime_queue(
    session_id: &str,
    emitter: RuntimeQueueEventEmitter,
) -> Result<Vec<QueuedTurnRuntime>, String> {
    let cleared = clear_runtime_queued_turns(session_id).await?;
    if cleared.is_empty() {
        return Ok(cleared);
    }

    let queued_turn_ids = cleared
        .iter()
        .map(|queued_turn| queued_turn.queued_turn_id.clone())
        .collect::<Vec<_>>();
    for queued_turn in &cleared {
        emit_runtime_queue_event(
            &emitter,
            &queued_turn_event_name_from_runtime(queued_turn),
            RuntimeAgentEvent::QueueCleared {
                session_id: session_id.to_string(),
                queued_turn_ids: queued_turn_ids.clone(),
            },
        );
    }

    Ok(cleared)
}

pub async fn list_runtime_queue_snapshots(
    session_id: &str,
) -> Result<Vec<QueuedTurnSnapshot>, String> {
    Ok(list_runtime_queued_turns(session_id)
        .await?
        .iter()
        .enumerate()
        .map(|(index, queued_turn)| queued_turn_snapshot_from_runtime(queued_turn, index + 1))
        .collect())
}

pub async fn remove_runtime_queued_turn(
    session_id: &str,
    queued_turn_id: &str,
    emitter: RuntimeQueueEventEmitter,
) -> Result<bool, String> {
    let queued_turns = list_runtime_queued_turns(session_id).await?;
    let Some(existing) = queued_turns
        .into_iter()
        .find(|queued_turn| queued_turn.queued_turn_id == queued_turn_id)
    else {
        return Ok(false);
    };

    let removed = remove_runtime_queued_turn_from_store(queued_turn_id).await?;
    let Some(queued_turn) = removed else {
        return Ok(false);
    };

    emit_runtime_queue_event(
        &emitter,
        &queued_turn_event_name_from_runtime(&existing),
        RuntimeAgentEvent::QueueRemoved {
            session_id: session_id.to_string(),
            queued_turn_id: queued_turn.queued_turn_id,
        },
    );
    Ok(true)
}

pub async fn promote_runtime_queued_turn(
    session_id: &str,
    queued_turn_id: &str,
) -> Result<bool, String> {
    let queued_turns = list_runtime_queued_turns(session_id).await?;
    if queued_turns.is_empty() {
        return Ok(false);
    }

    if queued_turns
        .first()
        .map(|queued_turn| queued_turn.queued_turn_id == queued_turn_id)
        .unwrap_or(false)
    {
        return Ok(true);
    }

    let Some(target_index) = queued_turns
        .iter()
        .position(|queued_turn| queued_turn.queued_turn_id == queued_turn_id)
    else {
        return Ok(false);
    };

    let mut reordered_turns = Vec::with_capacity(queued_turns.len());
    reordered_turns.push(queued_turns[target_index].clone());
    reordered_turns.extend(
        queued_turns
            .iter()
            .enumerate()
            .filter(|(index, _)| *index != target_index)
            .map(|(_, queued_turn)| queued_turn.clone()),
    );

    let original_turns = queued_turns;
    clear_runtime_queued_turns(session_id).await?;

    for queued_turn in &reordered_turns {
        if let Err(error) = enqueue_runtime_turn(queued_turn.clone()).await {
            clear_runtime_queued_turns(session_id).await?;
            for original_turn in original_turns {
                enqueue_runtime_turn(original_turn).await?;
            }
            return Err(error);
        }
    }

    Ok(true)
}

pub fn finish_active_runtime_turn_if_matches(
    session_id: &str,
    turn_id: &str,
) -> Result<bool, String> {
    let runtime_queue_service = require_shared_session_runtime_queue_service()
        .map_err(|error| format!("读取 runtime queue service 失败: {error}"))?;
    Ok(runtime_queue_service.finish_active_turn_if_matches(session_id, turn_id))
}

pub async fn resume_persisted_runtime_queues_on_startup<C>(
    context: C,
    executor: RuntimeQueueExecutor<C>,
    emitter: RuntimeQueueEventEmitter,
) -> Result<usize, String>
where
    C: Clone + Send + Sync + 'static,
{
    let session_ids = prepare_runtime_queue_resumption().await?;
    if session_ids.is_empty() {
        return Ok(0);
    }

    let mut resumed = 0usize;
    for session_id in session_ids {
        if resume_runtime_queue_if_needed(
            session_id.clone(),
            context.clone(),
            executor.clone(),
            emitter.clone(),
        )
        .await?
        {
            resumed += 1;
            tracing::info!(
                "[AgentRuntime][Queue] 启动阶段已恢复会话排队执行: session_id={}",
                session_id
            );
        }
    }

    Ok(resumed)
}

#[cfg(test)]
mod tests {
    use aster::session::{
        InMemoryThreadRuntimeStore, QueuedTurnRuntime, RuntimeQueueSubmitResult,
        SessionRuntimeQueueService, ThreadRuntimeStore,
    };
    use serde_json::json;
    use std::collections::HashMap;
    use std::sync::Arc;

    fn queued_turn(session_id: &str, queued_turn_id: &str, created_at: i64) -> QueuedTurnRuntime {
        QueuedTurnRuntime {
            queued_turn_id: queued_turn_id.to_string(),
            session_id: session_id.to_string(),
            message_preview: format!("preview-{queued_turn_id}"),
            message_text: format!("message-{queued_turn_id}"),
            created_at,
            image_count: 0,
            payload: json!({ "queuedTurnId": queued_turn_id }),
            metadata: HashMap::new(),
        }
    }

    #[tokio::test]
    async fn interrupted_active_turn_release_allows_follow_turn_to_start_now() {
        let store = Arc::new(InMemoryThreadRuntimeStore::default());
        let service = SessionRuntimeQueueService::new(store);
        let first = service
            .submit_turn(queued_turn("session-release", "running", 1), true)
            .await
            .expect("submit first turn");

        assert_eq!(first, RuntimeQueueSubmitResult::StartNow);
        assert!(service.finish_active_turn_if_matches("session-release", "running"));
        let follow = service
            .submit_turn(queued_turn("session-release", "follow", 2), true)
            .await
            .expect("submit follow turn");

        assert_eq!(follow, RuntimeQueueSubmitResult::StartNow);
        assert_eq!(
            service.active_turn_id("session-release").as_deref(),
            Some("follow")
        );
    }

    #[tokio::test]
    async fn independent_sessions_start_without_blocking_each_other() {
        let store = Arc::new(InMemoryThreadRuntimeStore::default());
        let service = SessionRuntimeQueueService::new(store.clone());
        let first = service
            .submit_turn(queued_turn("session-a", "a-running", 1), true)
            .await
            .expect("submit first session turn");
        let same_session_follow = service
            .submit_turn(queued_turn("session-a", "a-follow", 2), true)
            .await
            .expect("submit follow turn");
        let other_session = service
            .submit_turn(queued_turn("session-b", "b-running", 3), true)
            .await
            .expect("submit other session turn");

        assert_eq!(first, RuntimeQueueSubmitResult::StartNow);
        assert_eq!(
            same_session_follow,
            RuntimeQueueSubmitResult::Enqueued {
                queued_turn: Box::new(queued_turn("session-a", "a-follow", 2)),
                position: 1
            }
        );
        assert_eq!(other_session, RuntimeQueueSubmitResult::StartNow);
        assert_eq!(
            service.active_turn_id("session-a").as_deref(),
            Some("a-running")
        );
        assert_eq!(
            service.active_turn_id("session-b").as_deref(),
            Some("b-running")
        );
        assert_eq!(
            store
                .list_queued_turns("session-a")
                .await
                .expect("list session-a queue")
                .len(),
            1
        );
        assert!(store
            .list_queued_turns("session-b")
            .await
            .expect("list session-b queue")
            .is_empty());
    }

    #[tokio::test]
    async fn completed_active_turn_starts_next_queued_turn() {
        let store = Arc::new(InMemoryThreadRuntimeStore::default());
        let service = SessionRuntimeQueueService::new(store.clone());
        let first = service
            .submit_turn(queued_turn("session-continue", "running", 1), true)
            .await
            .expect("submit first turn");

        assert_eq!(first, RuntimeQueueSubmitResult::StartNow);
        store
            .enqueue_turn(queued_turn("session-continue", "follow", 2))
            .await
            .expect("enqueue follow turn");

        let next = service
            .finish_matching_turn_and_take_next("session-continue", "running")
            .await
            .expect("finish running turn");

        assert_eq!(
            next.as_ref().map(|turn| turn.queued_turn_id.as_str()),
            Some("follow")
        );
        assert_eq!(
            service.active_turn_id("session-continue").as_deref(),
            Some("follow")
        );
    }

    #[tokio::test]
    async fn stale_turn_completion_does_not_release_new_active_turn() {
        let store = Arc::new(InMemoryThreadRuntimeStore::default());
        let service = SessionRuntimeQueueService::new(store.clone());
        let _ = service
            .submit_turn(queued_turn("session-stale", "running", 1), true)
            .await
            .expect("submit first turn");
        assert!(service.finish_active_turn_if_matches("session-stale", "running"));
        let _ = service
            .submit_turn(queued_turn("session-stale", "follow", 2), true)
            .await
            .expect("submit follow turn");
        store
            .enqueue_turn(queued_turn("session-stale", "queued-after-follow", 3))
            .await
            .expect("enqueue follow-up queued turn");

        let next = service
            .finish_matching_turn_and_take_next("session-stale", "running")
            .await
            .expect("stale completion should be ignored");

        assert!(next.is_none());
        assert_eq!(
            service.active_turn_id("session-stale").as_deref(),
            Some("follow")
        );
        assert_eq!(
            store
                .list_queued_turns("session-stale")
                .await
                .expect("list queued turns")
                .len(),
            1
        );
    }
}
