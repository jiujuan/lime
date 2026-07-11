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
    RuntimeReplyResponseContext, RuntimeReplyResponseEvent, RuntimeReplyResponseMaterializer,
    RuntimeReplyResponseProjection, RuntimeReplyStreamEvent, RuntimeReplyStreamIdleTimeout,
    RuntimeReplyStreamState,
};
use agent_runtime::session_config::AgentSessionConfig;
use futures::StreamExt;
use model_provider::provider_stream::{
    apply_runtime_provider_metadata, RuntimeReplyProviderStreamEvent,
};
use serde_json::Value;
use std::path::Path;
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

const RESPONSE_RATE_LIMITS_RUNTIME_EVENT_KIND: &str = "provider_rate_limits";

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
    working_directory: Option<&Path>,
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
    let mut response_materializer =
        RuntimeReplyResponseMaterializer::new(runtime_response_context(session_config));
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
    )
    .with_working_directory(working_directory.map(Path::to_path_buf));
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
                    RuntimeReplyStreamEvent::ResponseEvent(response_event) => {
                        runtime_agent_events_from_response_event(
                            &mut response_materializer,
                            response_event,
                        )
                    }
                    RuntimeReplyStreamEvent::Event(runtime_event) => vec![runtime_event],
                };

                for mut runtime_event in runtime_events {
                    if let RuntimeAgentEvent::ProviderTrace { event } = &mut runtime_event {
                        apply_runtime_provider_metadata(event, reply_backend.provider_handle());
                    }
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

fn runtime_response_context(session_config: &AgentSessionConfig) -> RuntimeReplyResponseContext {
    RuntimeReplyResponseContext::new(
        session_config
            .thread_id
            .clone()
            .unwrap_or_else(|| session_config.id.clone()),
        session_config
            .turn_id
            .clone()
            .unwrap_or_else(|| session_config.id.clone()),
        chrono::Utc::now().to_rfc3339(),
    )
}

fn runtime_agent_events_from_response_event(
    materializer: &mut RuntimeReplyResponseMaterializer,
    response_event: RuntimeReplyResponseEvent,
) -> Vec<RuntimeAgentEvent> {
    materializer
        .project_event(response_event)
        .into_iter()
        .map(runtime_agent_event_from_response_projection)
        .collect()
}

fn runtime_agent_event_from_response_projection(
    projection: RuntimeReplyResponseProjection,
) -> RuntimeAgentEvent {
    match projection {
        RuntimeReplyResponseProjection::TextDelta { text } => RuntimeAgentEvent::TextDelta { text },
        RuntimeReplyResponseProjection::ThinkingDelta { text } => {
            RuntimeAgentEvent::ThinkingDelta { text }
        }
        RuntimeReplyResponseProjection::ToolInputDelta {
            tool_id,
            tool_name,
            delta,
            accumulated_arguments,
            provider,
        } => RuntimeAgentEvent::ToolInputDelta {
            tool_id,
            tool_name,
            delta,
            accumulated_arguments,
            provider,
        },
        RuntimeReplyResponseProjection::ItemStarted { item } => RuntimeAgentEvent::ItemStarted {
            item: crate::protocol_projection::project_item_runtime(item),
        },
        RuntimeReplyResponseProjection::ItemUpdated { item } => RuntimeAgentEvent::ItemUpdated {
            item: crate::protocol_projection::project_item_runtime(item),
        },
        RuntimeReplyResponseProjection::ItemCompleted { item } => {
            RuntimeAgentEvent::ItemCompleted {
                item: crate::protocol_projection::project_item_runtime(item),
            }
        }
        RuntimeReplyResponseProjection::Done { token_usage, .. } => RuntimeAgentEvent::Done {
            usage: project_response_token_usage(token_usage.as_ref()),
        },
        RuntimeReplyResponseProjection::RateLimits { payload } => {
            RuntimeAgentEvent::ProviderStreamEvent {
                runtime_event_kind: RESPONSE_RATE_LIMITS_RUNTIME_EVENT_KIND.to_string(),
                payload,
            }
        }
    }
}

fn project_response_token_usage(value: Option<&Value>) -> Option<crate::protocol::AgentTokenUsage> {
    let value = value?;
    crate::session_usage_projection::project_token_usage(
        read_i32_token_usage(value, &["input_tokens", "inputTokens", "prompt_tokens"]),
        read_i32_token_usage(
            value,
            &["output_tokens", "outputTokens", "completion_tokens"],
        ),
        read_i32_token_usage(value, &["cached_input_tokens", "cachedInputTokens"]),
        read_i32_token_usage(
            value,
            &["cache_creation_input_tokens", "cacheCreationInputTokens"],
        ),
    )
}

fn read_i32_token_usage(value: &Value, keys: &[&str]) -> Option<i32> {
    let object = value.as_object()?;
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(|entry| entry.as_i64().and_then(|number| i32::try_from(number).ok()))
}

fn runtime_agent_event_from_provider_stream_event(
    provider_event: RuntimeReplyProviderStreamEvent,
) -> RuntimeAgentEvent {
    RuntimeAgentEvent::ProviderStreamEvent {
        runtime_event_kind: provider_event.runtime_event_kind().to_string(),
        payload: provider_event.payload_json_value(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_protocol::turn_context::TurnContextOverride;
    use agent_runtime::reply_input::{RuntimeReplyInput, RuntimeReplyInputImage};
    use agent_runtime::reply_stream::{RuntimeReplyResponseItem, RuntimeReplyResponseItemPayload};
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

    fn response_materializer() -> RuntimeReplyResponseMaterializer {
        RuntimeReplyResponseMaterializer::new(RuntimeReplyResponseContext::new(
            "thread-response",
            "turn-response",
            "2026-07-09T00:00:00Z",
        ))
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
    fn response_text_delta_projects_agent_event() {
        let mut materializer = response_materializer();
        let events = runtime_agent_events_from_response_event(
            &mut materializer,
            RuntimeReplyResponseEvent::TextDelta {
                text: "hello".to_string(),
            },
        );

        assert_eq!(events.len(), 1);
        let RuntimeAgentEvent::TextDelta { text } = &events[0] else {
            panic!("expected text delta event");
        };
        assert_eq!(text, "hello");
    }

    #[test]
    fn response_completed_projects_done_with_usage() {
        let mut materializer = response_materializer();
        let events = runtime_agent_events_from_response_event(
            &mut materializer,
            RuntimeReplyResponseEvent::Completed {
                response_id: Some("resp-1".to_string()),
                end_turn: Some(true),
                token_usage: Some(json!({
                    "input_tokens": 12,
                    "output_tokens": 3,
                    "cachedInputTokens": 2
                })),
            },
        );

        assert_eq!(events.len(), 1);
        let RuntimeAgentEvent::Done { usage } = &events[0] else {
            panic!("expected done event");
        };
        assert_eq!(usage.as_ref().map(|usage| usage.input_tokens), Some(12));
        assert_eq!(usage.as_ref().map(|usage| usage.output_tokens), Some(3));
        assert_eq!(
            usage.as_ref().and_then(|usage| usage.cached_input_tokens),
            Some(2)
        );
    }

    #[test]
    fn response_reasoning_delta_projects_thinking_delta_and_item_update() {
        let mut materializer = response_materializer();
        let events = runtime_agent_events_from_response_event(
            &mut materializer,
            RuntimeReplyResponseEvent::ReasoningDelta {
                item_id: "reasoning-1".to_string(),
                delta: "thinking".to_string(),
            },
        );

        assert_eq!(events.len(), 2);
        let RuntimeAgentEvent::ThinkingDelta { text } = &events[0] else {
            panic!("expected thinking delta event");
        };
        assert_eq!(text, "thinking");
        let RuntimeAgentEvent::ItemUpdated { item } = &events[1] else {
            panic!("expected reasoning item update");
        };
        assert_eq!(item.id, "reasoning-1");
    }

    #[test]
    fn response_tool_call_input_delta_projects_tool_input_delta_and_item_update() {
        let mut materializer = response_materializer();
        let events = runtime_agent_events_from_response_event(
            &mut materializer,
            RuntimeReplyResponseEvent::ToolCallInputDelta {
                call_id: "call-1".to_string(),
                tool_name: Some("apply_patch".to_string()),
                delta: "{\"path\"".to_string(),
                accumulated_arguments: None,
                provider: Some("openai".to_string()),
            },
        );

        assert_eq!(events.len(), 2);
        let RuntimeAgentEvent::ToolInputDelta {
            tool_id,
            tool_name,
            delta,
            accumulated_arguments,
            provider,
        } = &events[0]
        else {
            panic!("expected tool input delta event");
        };
        assert_eq!(tool_id, "call-1");
        assert_eq!(tool_name.as_deref(), Some("apply_patch"));
        assert_eq!(delta, "{\"path\"");
        assert_eq!(accumulated_arguments.as_deref(), Some("{\"path\""));
        assert_eq!(provider.as_deref(), Some("openai"));
        let RuntimeAgentEvent::ItemUpdated { item } = &events[1] else {
            panic!("expected tool item update");
        };
        assert_eq!(item.id, "call-1");
        let lime_core::database::dao::agent_timeline::AgentThreadItemPayload::ToolCall {
            tool_name,
            arguments,
            ..
        } = &item.payload
        else {
            panic!("expected tool call item payload");
        };
        assert_eq!(tool_name, "apply_patch");
        assert_eq!(arguments, &Some(json!("{\"path\"")));
    }

    #[test]
    fn response_output_item_done_projects_timeline_item() {
        let mut materializer = response_materializer();
        let events = runtime_agent_events_from_response_event(
            &mut materializer,
            RuntimeReplyResponseEvent::OutputItemDone {
                item: RuntimeReplyResponseItem::new(
                    "call-1",
                    "function_call",
                    RuntimeReplyResponseItemPayload::ToolCall {
                        tool_name: "apply_patch".to_string(),
                        arguments: Some(json!({ "patch": "*** Begin Patch" })),
                        output: None,
                        success: None,
                        error: None,
                        metadata: None,
                    },
                ),
            },
        );

        assert_eq!(events.len(), 1);
        let RuntimeAgentEvent::ItemCompleted { item } = &events[0] else {
            panic!("expected item completed event");
        };
        assert_eq!(item.id, "call-1");
        let lime_core::database::dao::agent_timeline::AgentThreadItemPayload::ToolCall {
            tool_name,
            arguments,
            ..
        } = &item.payload
        else {
            panic!("expected tool call item payload");
        };
        assert_eq!(tool_name, "apply_patch");
        assert_eq!(
            arguments.as_ref().and_then(|value| value.get("patch")),
            Some(&json!("*** Begin Patch"))
        );
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
