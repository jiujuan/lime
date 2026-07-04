use super::auto_compaction_projection::AutoCompactionProjectionState;
use super::policy_config::RequestToolPolicy;
use super::runtime_status::{
    build_web_retrieval_synthesis_runtime_status, emit_runtime_status_with_projection,
};
use super::stream_diagnostics::{update_stream_event_diagnostics, StreamEventDiagnostics};
use super::stream_idle::provider_stream_idle_timeout_message;
use super::stream_text_batcher::{emit_text_delta_batch, TextDeltaBatcher};
use super::web_retrieval_process::WebRetrievalProcessState;
use super::web_search_execution_tracker::WebSearchExecutionTracker;
use super::{ReplyAttemptError, ReplyInput, RuntimeAgentEvent, CANCELLED_TURN_CONTEXT_MARKER};
use crate::aster_runtime_projection::{
    project_aster_auto_compaction_event, project_aster_runtime_event,
};
use crate::credential_bridge::SessionProviderHandle;
use crate::protocol::TextDeltaBatchBoundary;
use crate::session_config_adapter::to_aster_session_config;
use crate::session_configuration::AgentSessionConfig;
use crate::write_artifact_events::WriteArtifactEventEmitter;
use agent_protocol::action_required::ActionRequiredScope as RuntimeActionRequiredScope;
use aster::agents::{Agent, AgentEvent as AsterAgentEvent};
use aster::conversation::message::{
    ActionRequired, ActionRequiredData, ActionRequiredScope, Message, MessageContent,
};
use aster::permission::{Permission, PermissionConfirmation, PrincipalType};
use aster::session::SessionManager;
use futures::StreamExt;
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

pub(crate) struct CompatAsterReplyMessage {
    message: Message,
}

pub(crate) fn compat_aster_reply_message(message: Message) -> CompatAsterReplyMessage {
    CompatAsterReplyMessage { message }
}

pub(crate) fn compat_aster_elicitation_response_message(
    request_id: impl Into<String>,
    user_data: serde_json::Value,
    scope: Option<RuntimeActionRequiredScope>,
) -> CompatAsterReplyMessage {
    compat_aster_reply_message(Message::user().with_content(MessageContent::ActionRequired(
        ActionRequired {
            data: ActionRequiredData::ElicitationResponse {
                id: request_id.into(),
                user_data,
            },
            scope: scope.and_then(to_aster_action_required_scope),
        },
    )))
}

pub(crate) async fn confirm_aster_tool_action(
    agent: &Agent,
    request_id: impl Into<String>,
    confirmed: bool,
) {
    let permission = if confirmed {
        Permission::AllowOnce
    } else {
        Permission::DenyOnce
    };
    let confirmation = PermissionConfirmation {
        principal_type: PrincipalType::Tool,
        permission,
    };

    agent
        .handle_confirmation(request_id.into(), confirmation)
        .await;
}

fn to_aster_action_required_scope(
    scope: RuntimeActionRequiredScope,
) -> Option<ActionRequiredScope> {
    if scope.session_id.is_none() && scope.thread_id.is_none() && scope.turn_id.is_none() {
        return None;
    }

    Some(ActionRequiredScope {
        session_id: scope.session_id,
        thread_id: scope.thread_id,
        turn_id: scope.turn_id,
    })
}

pub(super) enum ReplyAttemptInput {
    Current(ReplyInput),
    CompatAster(CompatAsterReplyMessage),
}

impl ReplyAttemptInput {
    pub(super) fn as_concat_text(&self) -> String {
        match self {
            Self::Current(input) => input.text.clone(),
            Self::CompatAster(input) => input.message.as_concat_text(),
        }
    }

    fn into_aster_message(self) -> Message {
        match self {
            Self::Current(input) => build_aster_user_message(input),
            Self::CompatAster(input) => input.message,
        }
    }
}

impl From<ReplyInput> for ReplyAttemptInput {
    fn from(input: ReplyInput) -> Self {
        Self::Current(input)
    }
}

fn build_aster_user_message(input: ReplyInput) -> Message {
    let mut message = Message::user().with_text(input.text);
    for image in input.images {
        message = message.with_image(image.data, image.media_type);
    }
    if input.agent_only {
        message = message.agent_only();
    }
    message
}

fn cancelled_turn_context_marker_message() -> Message {
    Message::assistant()
        .with_text(CANCELLED_TURN_CONTEXT_MARKER)
        .agent_only()
}

pub(super) async fn persist_cancelled_turn_context_marker(agent: &Agent, session_id: &str) {
    let message = cancelled_turn_context_marker_message();
    let result = if let Some(store) = agent.session_store() {
        store.add_message(session_id, &message).await
    } else {
        SessionManager::add_message(session_id, &message).await
    };

    if let Err(error) = result {
        tracing::warn!(
            "[AgentRuntime][ReplyPolicy] 写入取消上下文标记失败，已降级继续: session_id={}, error={}",
            session_id,
            error
        );
    }
}

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
    agent: &Agent,
    provider: Option<SessionProviderHandle>,
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
    let mut auto_compaction_projection = AutoCompactionProjectionState;
    let mut inline_provider_error = None;
    let mut text_delta_batcher = TextDeltaBatcher::default();
    let mut web_retrieval_process_state = WebRetrievalProcessState::default();
    let session_id = session_config.id.clone();
    let aster_session_config = to_aster_session_config(session_config.clone());
    let user_message = user_input.into_aster_message();
    let uses_pinned_provider = provider.is_some();
    tracing::info!(
        "[AgentRuntime][TTFT] agent.reply start: session_id={}, message_chars={}, pinned_provider={}",
        session_id,
        user_message.as_concat_text().chars().count(),
        uses_pinned_provider
    );
    let cancel_probe = cancel_token.clone();
    let provider_cancel_token = cancel_token
        .clone()
        .or_else(|| stream_idle_timeout.map(|_| CancellationToken::new()));
    let mut stream = match provider {
        Some(provider) => {
            provider
                .reply_stream_with_agent(
                    agent,
                    user_message,
                    aster_session_config,
                    provider_cancel_token,
                )
                .await
        }
        None => {
            agent
                .reply(user_message, aster_session_config, provider_cancel_token)
                .await
        }
    }
    .map_err(|e| ReplyAttemptError {
        message: format!("Agent error: {e}"),
        emitted_any: *emitted_any,
    })?;
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
                let provider_error_for_event = match &agent_event {
                    AsterAgentEvent::Message(message) => {
                        extract_inline_agent_provider_error(message)
                    }
                    _ => None,
                };
                if let Some(provider_error) = provider_error_for_event {
                    if inline_provider_error.is_none() {
                        inline_provider_error = Some(provider_error);
                    }
                    tracing::warn!(
                        "[AgentRuntime][ReplyPolicy] suppressed inline provider error text from runtime stream: session_id={}",
                        session_id
                    );
                    continue;
                }

                let runtime_events = project_aster_auto_compaction_event(&agent_event)
                    .and_then(|event| auto_compaction_projection.project_event(&event))
                    .unwrap_or_else(|| project_aster_runtime_event(agent_event));
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
                        emit_runtime_status_with_projection(
                            agent,
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

fn extract_inline_agent_provider_error(message: &Message) -> Option<String> {
    let text = message.as_concat_text();
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    if !text.contains("Ran into this error:") {
        return None;
    }
    if !text.contains("Please retry if you think this is a transient or recoverable error.") {
        return None;
    }

    let after_prefix = text.split_once("Ran into this error:")?.1.trim();
    let detail = after_prefix
        .split_once("\n\nPlease retry if you think this is a transient or recoverable error.")
        .map(|(left, _)| left.trim())
        .unwrap_or(after_prefix)
        .trim_end_matches('.');

    if detail.is_empty() {
        return Some("Agent provider execution failed".to_string());
    }

    Some(format!("Agent provider execution failed: {detail}"))
}
