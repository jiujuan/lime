use super::policy_config::RequestToolPolicy;
use super::runtime_status::build_web_retrieval_synthesis_runtime_status;
use super::stream_diagnostics::{update_stream_event_diagnostics, StreamEventDiagnostics};
use super::stream_text_batcher::{emit_text_delta_batch, TextDeltaBatcher};
use super::web_retrieval_process::WebRetrievalProcessState;
use super::web_search_execution_tracker::WebSearchExecutionTracker;
use super::{ReplyAttemptError, RuntimeAgentEvent};
use crate::model_request_policy::{
    input_modality_policy_allows_image_input, input_modality_policy_from_turn_context,
    runtime_reply_model_request_policy_from_turn_context,
};
use crate::protocol::TextDeltaBatchBoundary;
use crate::write_artifact_events::WriteArtifactEventEmitter;
use agent_runtime::reply_backend::RuntimeReplyBackend;
use agent_runtime::reply_execution::RuntimeReplyAttemptState;
use agent_runtime::reply_host::{RuntimeReplyPolicyHost, RuntimeReplyStartRequest};
use agent_runtime::reply_input::RuntimeReplyAttemptInput as ReplyAttemptInput;
use agent_runtime::reply_request::RuntimeReplyRequest;
use agent_runtime::reply_stream::{
    RuntimeReplyStreamEvent, RuntimeReplyStreamIdleTimeout, RuntimeReplyStreamState,
};
use agent_runtime::session_config::AgentSessionConfig;
use futures::StreamExt;
use model_provider::provider_stream::{
    RuntimeReplyProviderHandle, RuntimeReplyProviderStreamEvent,
};
use model_provider::ModelProviderProtocol;
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
    F: FnMut(&RuntimeAgentEvent) + Send,
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
        message: RuntimeReplyStreamIdleTimeout::new(timeout).message(),
        emitted_any: *emitted_any,
    }
}

fn validate_reply_request_modalities(
    request: &RuntimeReplyRequest,
    session_config: &AgentSessionConfig,
    emitted_any: bool,
) -> Result<(), ReplyAttemptError> {
    if !request.message.has_images() {
        return Ok(());
    }
    let input_policy =
        input_modality_policy_from_turn_context(session_config.turn_context.as_ref());
    if input_modality_policy_allows_image_input(input_policy.as_ref()) {
        return Ok(());
    }

    Err(ReplyAttemptError {
        message: "当前选中模型的 input_modality_policy 不支持图片输入，已拒绝把 image 内容发送到 provider；请切换支持 image 的模型或移除图片。".to_string(),
        emitted_any,
    })
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn stream_agent_reply_once<F>(
    host: &impl RuntimeReplyPolicyHost<RuntimeAgentEvent, crate::protocol::AgentRuntimeStatus>,
    user_input: ReplyAttemptInput,
    session_config: &AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    stream_idle_timeout: Option<Duration>,
    request_tool_policy: &RequestToolPolicy,
    web_search_tracker: &mut WebSearchExecutionTracker,
    write_artifact_emitter: &mut WriteArtifactEventEmitter,
    attempt_state: &mut RuntimeReplyAttemptState,
    diagnostics: &mut StreamEventDiagnostics,
    on_event: &mut F,
) -> Result<(), ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent) + Send,
{
    let started_at = Instant::now();
    let mut stream_state = RuntimeReplyStreamState::new();
    let mut text_delta_batcher = TextDeltaBatcher::default();
    let mut web_retrieval_process_state = WebRetrievalProcessState::default();
    let session_id = session_config.id.clone();
    let reply_backend = host.reply_backend();
    let uses_pinned_provider = reply_backend.uses_pinned_provider();
    let cancel_probe = cancel_token.clone();
    let provider_cancel_token = cancel_token
        .clone()
        .or_else(|| stream_idle_timeout.map(|_| CancellationToken::new()));
    let idle_cancel_token = provider_cancel_token.clone();
    let model_request_policy =
        runtime_reply_model_request_policy_from_turn_context(session_config.turn_context.as_ref());
    let reply_request = RuntimeReplyRequest::from_attempt_input(
        session_id.clone(),
        user_input,
        reply_backend.provider_handle().cloned(),
        model_request_policy,
    );
    validate_reply_request_modalities(&reply_request, session_config, attempt_state.emitted_any())?;
    let start_request = RuntimeReplyStartRequest::new(
        reply_request,
        session_config.clone(),
        provider_cancel_token,
        attempt_state.emitted_any(),
    );
    let start_result = reply_backend.start_reply_stream(start_request).await;
    let (mut stream, message_chars) = start_result.map_err(ReplyAttemptError::from)?;
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
        let next_timeout = stream_state.next_timeout(stream_idle_timeout);
        let event_result = match (cancel_probe.as_ref(), next_timeout) {
            (Some(token), Some(timeout)) => {
                tokio::select! {
                    _ = token.cancelled() => None,
                    next = tokio::time::timeout(timeout, stream.next()) => match next {
                        Ok(next) => next,
                        Err(_) => {
                            return Err(build_provider_stream_idle_timeout_error(
                                timeout,
                                &session_id,
                                attempt_state.emitted_any_mut(),
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
                    if let Some(token) = idle_cancel_token.as_ref() {
                        token.cancel();
                    }
                    return Err(build_provider_stream_idle_timeout_error(
                        timeout,
                        &session_id,
                        attempt_state.emitted_any_mut(),
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
        stream_state.mark_stream_event_seen();
        match event_result {
            Ok(stream_event) => {
                let runtime_events = match stream_event {
                    RuntimeReplyStreamEvent::SuppressedInlineProviderError(provider_error) => {
                        stream_state.capture_inline_provider_error(provider_error);
                        tracing::warn!(
                            "[AgentRuntime][ReplyPolicy] suppressed inline provider error text from runtime stream: session_id={}",
                            session_id
                        );
                        continue;
                    }
                    RuntimeReplyStreamEvent::ProviderStreamEvent(provider_event) => {
                        vec![runtime_agent_event_from_provider_stream_event(
                            provider_event,
                        )]
                    }
                    RuntimeReplyStreamEvent::Event(runtime_event) => vec![runtime_event],
                };

                for mut runtime_event in runtime_events {
                    enrich_provider_trace_with_runtime_provider(
                        &mut runtime_event,
                        reply_backend.provider_handle(),
                    );
                    let extra_events = write_artifact_emitter.process_event(&mut runtime_event);
                    for extra_event in &extra_events {
                        emit_text_delta_batch(
                            &mut text_delta_batcher,
                            TextDeltaBatchBoundary::Provider,
                            attempt_state.emitted_any_mut(),
                            on_event,
                        );
                        update_stream_event_diagnostics(diagnostics, extra_event);
                        attempt_state.mark_emitted();
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
                                attempt_state.push_text(text);
                            }
                        }

                        RuntimeAgentEvent::Error { message } => {
                            if !message.trim().is_empty() {
                                attempt_state.push_error(message.clone());
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
                                attempt_state.mark_emitted();
                                on_event(&batch_event);
                            }
                        }
                        other_event => {
                            emit_text_delta_batch(
                                &mut text_delta_batcher,
                                TextDeltaBatchBoundary::Provider,
                                attempt_state.emitted_any_mut(),
                                on_event,
                            );
                            attempt_state.mark_emitted();
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
                    attempt_state.emitted_any_mut(),
                    on_event,
                );
                return Err(attempt_state.error(
                    stream_state
                        .take_inline_provider_error()
                        .unwrap_or_else(|| format!("Stream error: {e}")),
                ));
            }
        }
    }

    emit_text_delta_batch(
        &mut text_delta_batcher,
        TextDeltaBatchBoundary::Final,
        attempt_state.emitted_any_mut(),
        on_event,
    );

    if let Some(message) = stream_state.take_inline_provider_error() {
        return Err(attempt_state.error(message));
    }

    Ok(())
}

fn runtime_agent_event_from_provider_stream_event(
    provider_event: RuntimeReplyProviderStreamEvent,
) -> RuntimeAgentEvent {
    RuntimeAgentEvent::ProviderStreamEvent {
        runtime_event_kind: provider_event.runtime_event_kind().to_string(),
        payload: provider_event.payload_json_value(),
    }
}

fn enrich_provider_trace_with_runtime_provider(
    event: &mut RuntimeAgentEvent,
    provider: Option<&RuntimeReplyProviderHandle>,
) {
    let Some(provider) = provider else {
        return;
    };
    let RuntimeAgentEvent::ProviderTrace {
        provider: trace_provider,
        model,
        runtime_provider_backend,
        runtime_provider_selector,
        runtime_provider_protocol,
        runtime_provider_active_model,
        ..
    } = event
    else {
        return;
    };

    if trace_provider.trim().is_empty() {
        *trace_provider = provider.identity.provider_name.clone();
    }
    if model.trim().is_empty() {
        *model = provider.identity.model_name.clone();
    }
    *runtime_provider_backend = Some(provider.backend.as_wire_str().to_string());
    *runtime_provider_selector = provider.identity.provider_selector.clone();
    *runtime_provider_protocol = provider
        .identity
        .protocol
        .as_ref()
        .map(provider_protocol_wire_value);
    *runtime_provider_active_model = provider.capabilities.active_model_name.clone();
}

fn provider_protocol_wire_value(protocol: &ModelProviderProtocol) -> String {
    match protocol {
        ModelProviderProtocol::Responses => "responses".to_string(),
        ModelProviderProtocol::ChatCompletions => "chat_completions".to_string(),
        ModelProviderProtocol::Custom(value) => value.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_protocol::turn_context::TurnContextOverride;
    use agent_runtime::reply_input::{RuntimeReplyInput, RuntimeReplyInputImage};
    use model_provider::safety::{
        ProviderSafetyBufferingRetryModelSource, ProviderSafetyBufferingRuntimeEventPayload,
        SAFETY_BUFFERING_RUNTIME_EVENT_KIND,
    };
    use serde_json::json;
    use std::collections::HashMap;

    fn session_config_with_image_policy(supports_image_input: bool) -> AgentSessionConfig {
        AgentSessionConfig {
            id: "session-image-policy".to_string(),
            thread_id: None,
            turn_id: None,
            schedule_id: None,
            max_turns: None,
            system_prompt: None,
            system_prompt_override: None,
            include_context_trace: None,
            turn_context: Some(TurnContextOverride {
                metadata: HashMap::from([(
                    "runtime_options".to_string(),
                    json!({
                        "harness": {
                            "model_request_policy": {
                                "input_modality_policy": {
                                    "input_modalities": if supports_image_input {
                                        vec!["text", "image"]
                                    } else {
                                        vec!["text"]
                                    },
                                    "supports_image_input": supports_image_input
                                }
                            }
                        }
                    }),
                )]),
                ..TurnContextOverride::default()
            }),
        }
    }

    fn reply_request_with_image() -> RuntimeReplyRequest {
        let mut input = RuntimeReplyInput::text("解释这张图");
        input.images.push(RuntimeReplyInputImage {
            data: "aGVsbG8=".to_string(),
            media_type: "image/png".to_string(),
        });
        RuntimeReplyRequest::from_attempt_input("session-image-policy", input.into(), None, None)
    }

    #[test]
    fn provider_stream_reply_event_projects_agent_event() {
        let event = runtime_agent_event_from_provider_stream_event(
            RuntimeReplyProviderStreamEvent::SafetyBuffering(
                ProviderSafetyBufferingRuntimeEventPayload {
                    kind: SAFETY_BUFFERING_RUNTIME_EVENT_KIND,
                    provider: Some("openai".to_string()),
                    model: Some("gpt-5-codex".to_string()),
                    use_cases: vec!["policy".to_string()],
                    reasons: vec!["buffering".to_string()],
                    show_buffering_ui: true,
                    retry_model: Some("gpt-5-mini".to_string()),
                    fallback_header_model: None,
                    source: ProviderSafetyBufferingRetryModelSource::PayloadRetryModel,
                },
            ),
        );

        let RuntimeAgentEvent::ProviderStreamEvent {
            runtime_event_kind,
            payload,
        } = event
        else {
            panic!("expected provider stream event");
        };
        assert_eq!(runtime_event_kind, "provider_safety_buffering");
        assert_eq!(payload["retryModel"], json!("gpt-5-mini"));
        assert_eq!(payload["source"], json!("payload_retry_model"));
        assert!(payload.get("retry_model").is_none());
        assert!(payload.get("fasterModel").is_none());
    }

    #[test]
    fn reply_request_modalities_reject_image_when_selected_model_is_text_only() {
        let result = validate_reply_request_modalities(
            &reply_request_with_image(),
            &session_config_with_image_policy(false),
            false,
        );

        assert!(result.is_err());
        assert!(result
            .err()
            .unwrap()
            .message
            .contains("input_modality_policy 不支持图片输入"));
    }

    #[test]
    fn reply_request_modalities_allow_image_when_selected_model_supports_image() {
        let result = validate_reply_request_modalities(
            &reply_request_with_image(),
            &session_config_with_image_policy(true),
            false,
        );

        assert!(result.is_ok());
    }
}
