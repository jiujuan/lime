use crate::protocol::AgentEvent as RuntimeAgentEvent;
use crate::runtime_support::{
    clear_runtime_queued_turns, enqueue_runtime_turn,
    finish_active_runtime_turn_in_queue_if_matches, list_runtime_queued_turns,
    prepare_runtime_queue_resumption, queued_turn_event_name_from_runtime,
    queued_turn_snapshot_from_runtime, remove_runtime_queued_turn_from_store,
    runtime_queue_has_active_turn, submit_runtime_turn_to_queue, take_next_runtime_queued_turn,
};
use crate::QueuedTurnSnapshot;
use agent_runtime::runtime_queue::{RuntimeQueueSubmitResult, RuntimeQueuedTurn};
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
    finish_active_runtime_turn_in_queue_if_matches(session_id, queued_turn_id)
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
                finish_active_runtime_turn_in_queue_if_matches(
                    &fallback_session_id,
                    &fallback_queued_turn_id,
                )
                .map(|_| false)
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
    let next_queued_turn =
        take_next_runtime_queued_turn(&session_id, acquire_gate, completed_turn_id.as_deref())
            .await?;
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
    queued_turn: RuntimeQueuedTurn,
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
    let session_id = queued_turn.session_id.clone();
    let resume_started_at = Instant::now();
    let resumed_queue = if skip_pre_submit_resume || runtime_queue_has_active_turn(&session_id)? {
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
    match submit_runtime_turn_to_queue(queued_turn.clone(), queue_if_busy).await? {
        RuntimeQueueSubmitResult::StartNow => {
            spawn_runtime_turn_task(
                session_id.clone(),
                queued_turn_event_name_from_runtime(&queued_turn),
                queued_turn.queued_turn_id.clone(),
                context,
                executor,
                emitter,
                queued_turn.payload,
            );
            tracing::info!(
                "[AgentRuntime][Queue] submit_runtime_turn accepted: session_id={}, queued_turn_id={}, result=start_now, resumed_queue={}, skip_pre_submit_resume={}, resume_ms={}, queue_submit_ms={}, total_ms={}",
                session_id,
                queued_turn.queued_turn_id,
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
) -> Result<Vec<RuntimeQueuedTurn>, String> {
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
    finish_active_runtime_turn_in_queue_if_matches(session_id, turn_id)
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
