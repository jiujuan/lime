use super::aster_event_adapter::RuntimeEventProjector;
use super::aster_reply_adapter::{
    extract_inline_agent_provider_error, AsterReplyRuntimeHost, ReplyAttemptInput,
};
use super::policy_config::RequestToolPolicy;
use super::runtime_status::build_web_retrieval_synthesis_runtime_status;
use super::stream_diagnostics::{update_stream_event_diagnostics, StreamEventDiagnostics};
use super::stream_idle::provider_stream_idle_timeout_message;
use super::stream_text_batcher::{emit_text_delta_batch, TextDeltaBatcher};
use super::web_retrieval_process::WebRetrievalProcessState;
use super::web_search_execution_tracker::WebSearchExecutionTracker;
use super::{ReplyAttemptError, RuntimeAgentEvent};
use crate::protocol::TextDeltaBatchBoundary;
use crate::session_configuration::AgentSessionConfig;
use crate::write_artifact_events::WriteArtifactEventEmitter;
use futures::StreamExt;
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

fn build_provider_stream_idle_timeout_error<F>(
    timeout: Duration,
    session_id: &str,
    emitted_any: &mut bool,
    diagnostics: &StreamEventDiagnostics,
    text_delta_batcher: &mut TextDeltaBatcher,
    on_event: &mut F,
) -> ReplyAttemptError
where
    F: FnMut(&RuntimeAgentEvent),
{
    emit_text_delta_batch(
        text_delta_batcher,
        TextDeltaBatchBoundary::Provider,
        emitted_any,
        on_event,
    );
    tracing::warn!(
        "[AgentRuntime][ReplyPolicy] provider stream idle timeout: session_id={}, timeout_ms={}, emitted_any={}, text_deltas={}, tool_ends={}",
        session_id,
        timeout.as_millis(),
        *emitted_any,
        diagnostics.text_delta_count,
        diagnostics.tool_end_count
    );
    ReplyAttemptError {
        message: provider_stream_idle_timeout_message(timeout),
        emitted_any: *emitted_any,
    }
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn stream_agent_reply_once<F>(
    host: &AsterReplyRuntimeHost<'_>,
    user_input: ReplyAttemptInput,
    session_config: &AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    stream_idle_timeout: Option<Duration>,
    request_tool_policy: &RequestToolPolicy,
    web_search_tracker: &mut WebSearchExecutionTracker,
    write_artifact_emitter: &mut WriteArtifactEventEmitter,
    emitted_any: &mut bool,
    text_chunks: &mut Vec<String>,
    event_errors: &mut Vec<String>,
    diagnostics: &mut StreamEventDiagnostics,
    on_event: &mut F,
) -> Result<(), ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent),
{
    let started_at = Instant::now();
    let mut runtime_event_projector = RuntimeEventProjector::new();
    let mut inline_provider_error = None;
    let mut text_delta_batcher = TextDeltaBatcher::default();
    let mut web_retrieval_process_state = WebRetrievalProcessState::default();
    let session_id = session_config.id.clone();
    let uses_pinned_provider = host.uses_pinned_provider();
    let cancel_probe = cancel_token.clone();
    let provider_cancel_token = cancel_token
        .clone()
        .or_else(|| stream_idle_timeout.map(|_| CancellationToken::new()));
    let (mut stream, message_chars) = host
        .start_reply_stream(
            user_input,
            session_config.clone(),
            provider_cancel_token,
            *emitted_any,
        )
        .await?;
    tracing::info!(
        "[AgentRuntime][TTFT] agent.reply start: session_id={}, message_chars={}, pinned_provider={}",
        session_id,
        message_chars,
        uses_pinned_provider
    );
    tracing::info!(
        "[AgentRuntime][TTFT] agent.reply stream created: elapsed_ms={}",
        started_at.elapsed().as_millis()
    );

    'stream_loop: loop {
        let event_result = match (cancel_probe.as_ref(), stream_idle_timeout) {
            (Some(token), Some(timeout)) => {
                tokio::select! {
                    _ = token.cancelled() => None,
                    next = tokio::time::timeout(timeout, stream.next()) => match next {
                        Ok(next) => next,
                        Err(_) => {
                            return Err(build_provider_stream_idle_timeout_error(
                                timeout,
                                &session_id,
                                emitted_any,
                                diagnostics,
                                &mut text_delta_batcher,
                                on_event,
                            ));
                        }
                    },
                }
            }
            (Some(token), None) => {
                tokio::select! {
                    _ = token.cancelled() => None,
                    next = stream.next() => next,
                }
            }
            (None, Some(timeout)) => match tokio::time::timeout(timeout, stream.next()).await {
                Ok(next) => next,
                Err(_) => {
                    return Err(build_provider_stream_idle_timeout_error(
                        timeout,
                        &session_id,
                        emitted_any,
                        diagnostics,
                        &mut text_delta_batcher,
                        on_event,
                    ));
                }
            },
            (None, None) => stream.next().await,
        };
        let Some(event_result) = event_result else {
            break;
        };
        match event_result {
            Ok(agent_event) => {
                if let Some(provider_error) = extract_inline_agent_provider_error(&agent_event) {
                    if inline_provider_error.is_none() {
                        inline_provider_error = Some(provider_error);
                    }
                    tracing::warn!(
                        "[AgentRuntime][ReplyPolicy] suppressed inline provider error text from runtime stream: session_id={}",
                        session_id
                    );
                    continue;
                }

                let runtime_events = runtime_event_projector.project(agent_event);
                for mut runtime_event in runtime_events {
                    let extra_events = write_artifact_emitter.process_event(&mut runtime_event);
                    for extra_event in &extra_events {
                        emit_text_delta_batch(
                            &mut text_delta_batcher,
                            TextDeltaBatchBoundary::Provider,
                            emitted_any,
                            on_event,
                        );
                        update_stream_event_diagnostics(diagnostics, extra_event);
                        *emitted_any = true;
                        on_event(extra_event);
                    }

                    match &runtime_event {
                        RuntimeAgentEvent::TextDelta { text } => {
                            if !text.is_empty() {
                                if diagnostics.text_delta_count == 0 {
                                    tracing::info!(
                                        "[AgentRuntime][TTFT] first runtime text delta observed in policy stream: elapsed_ms={}, chars={}",
                                        started_at.elapsed().as_millis(),
                                        text.chars().count()
                                    );
                                }
                                web_retrieval_process_state.observe_text_delta(text);
                                text_chunks.push(text.clone());
                            }
                        }
                        RuntimeAgentEvent::Error { message } => {
                            if !message.trim().is_empty() {
                                event_errors.push(message.clone());
                            }
                        }
                        RuntimeAgentEvent::ItemStarted { item }
                        | RuntimeAgentEvent::ItemUpdated { item } => {
                            web_search_tracker.record_tool_item(request_tool_policy, item, false);
                            web_retrieval_process_state.observe_tool_item(item, false);
                        }
                        RuntimeAgentEvent::ItemCompleted { item } => {
                            web_search_tracker.record_tool_item(request_tool_policy, item, true);
                            web_retrieval_process_state.observe_tool_item(item, true);
                        }
                        RuntimeAgentEvent::ToolStart {
                            tool_name, tool_id, ..
                        } => {
                            web_search_tracker.record_tool_start(
                                request_tool_policy,
                                tool_id,
                                tool_name,
                            );
                            web_retrieval_process_state.observe_tool_start(tool_id, tool_name);
                        }
                        RuntimeAgentEvent::ToolEnd { tool_id, result } => {
                            web_search_tracker.record_tool_end(
                                request_tool_policy,
                                tool_id,
                                result.success,
                                result.error.as_deref(),
                            );
                            web_retrieval_process_state.observe_tool_end(tool_id);
                        }
                        _ => {}
                    }
                    update_stream_event_diagnostics(diagnostics, &runtime_event);
                    let should_cutover_to_web_search_synthesis = matches!(
                        &runtime_event,
                        RuntimeAgentEvent::ToolEnd { .. } | RuntimeAgentEvent::ItemCompleted { .. }
                    )
                        && super::reply_retry::should_synthesize_web_search_after_enough_evidence(
                            request_tool_policy,
                            web_search_tracker,
                            diagnostics,
                        );
                    match runtime_event {
                        RuntimeAgentEvent::TextDelta { text } => {
                            if let Some(batch_event) = text_delta_batcher.push(text) {
                                *emitted_any = true;
                                on_event(&batch_event);
                            }
                        }
                        other_event => {
                            emit_text_delta_batch(
                                &mut text_delta_batcher,
                                TextDeltaBatchBoundary::Provider,
                                emitted_any,
                                on_event,
                            );
                            *emitted_any = true;
                            on_event(&other_event);
                        }
                    }
                    if web_retrieval_process_state.should_emit_synthesis_status() {
                        web_retrieval_process_state.mark_synthesis_status_emitted();
                        tracing::info!(
                            "[AgentRuntime][RuntimeStatus] emitting web retrieval synthesis status: session_id={}, completed_web_tools={}",
                            session_id,
                            web_retrieval_process_state.observed_completed_count
                        );
                        host.emit_runtime_status(
                            session_config,
                            build_web_retrieval_synthesis_runtime_status(
                                web_retrieval_process_state.observed_completed_count,
                            ),
                            on_event,
                        )
                        .await;
                    }
                    if should_cutover_to_web_search_synthesis {
                        tracing::warn!(
                            "[AgentRuntime][WebSearchSynthesis] cutting over after enough tool evidence: session_id={}, successful={}, completed={}, attempts={}",
                            session_id,
                            web_search_tracker
                                .successful_attempt_count_for_policy(request_tool_policy),
                            web_search_tracker
                                .completed_attempt_count_for_policy(request_tool_policy),
                            web_search_tracker.format_attempts()
                        );
                        break 'stream_loop;
                    }
                }
            }
            Err(e) => {
                emit_text_delta_batch(
                    &mut text_delta_batcher,
                    TextDeltaBatchBoundary::Provider,
                    emitted_any,
                    on_event,
                );
                return Err(ReplyAttemptError {
                    message: inline_provider_error.unwrap_or_else(|| format!("Stream error: {e}")),
                    emitted_any: *emitted_any,
                });
            }
        }
    }

    emit_text_delta_batch(
        &mut text_delta_batcher,
        TextDeltaBatchBoundary::Final,
        emitted_any,
        on_event,
    );

    if let Some(message) = inline_provider_error {
        return Err(ReplyAttemptError {
            message,
            emitted_any: *emitted_any,
        });
    }

    Ok(())
}
