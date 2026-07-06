//! 请求级工具策略与统一回复执行链
//!
//! 该模块沉淀“请求级工具策略（例如联网搜索）”与统一流式执行逻辑，
//! 供 aster_agent_cmd、scheduler、gateway 等入口复用同一条执行主链。

mod agent_reply_stream;
mod aster_event_adapter;
mod aster_reply_adapter;
pub(crate) mod auto_compaction_projection;
mod policy_config;
mod reply_retry;
mod runtime_status;
mod stream_diagnostics;
mod stream_idle;
mod stream_text_batcher;
mod web_retrieval_process;
mod web_search_execution_tracker;
mod web_search_preflight;

use self::agent_reply_stream::stream_agent_reply_once;
#[cfg(test)]
pub(crate) use self::aster_reply_adapter::stream_message_reply_with_policy;
pub use self::aster_reply_adapter::stream_reply_with_policy;
pub(crate) use self::aster_reply_adapter::{
    action_required_response_input, stream_runtime_action_required_response_with_policy,
    stream_runtime_message_reply_with_policy, stream_runtime_reply_with_configured_provider,
    stream_runtime_reply_with_configured_provider_for_direct_generation,
    stream_runtime_reply_with_policy, submit_runtime_tool_action_confirmation,
};
#[cfg(test)]
use self::auto_compaction_projection::{
    AutoCompactionEventProjection, AutoCompactionProjectionState,
    AutoCompactionSystemNotificationKind, ASTER_AUTO_COMPACTION_COMPLETE_TEXT,
    ASTER_AUTO_COMPACTION_DISABLED_TEXT, ASTER_AUTO_COMPACTION_THINKING_TEXT,
};
pub use self::policy_config::{
    merge_system_prompt_with_request_tool_policy,
    request_tool_policy_with_additional_required_tools, resolve_request_tool_policy,
    resolve_request_tool_policy_with_mode, RequestToolPolicy, RequestToolPolicyMode,
    REQUEST_TOOL_POLICY_MARKER,
};
use self::reply_retry::{
    build_empty_final_reply_error_message, resolve_reply_retry_mode, ReplyRetryMode,
};
#[cfg(test)]
use self::reply_retry::{
    looks_like_incomplete_tool_batch_summary, WEB_SEARCH_SYNTHESIS_MIN_COMPLETED_ATTEMPTS,
    WEB_SEARCH_SYNTHESIS_MIN_SUCCESSFUL_ATTEMPTS,
};
use self::runtime_status::{
    build_empty_reply_retry_runtime_status, build_incomplete_tool_batch_continue_runtime_status,
    build_provider_tail_failure_retry_runtime_status, build_web_search_synthesis_runtime_status,
};
use self::stream_diagnostics::{
    build_output_preserved_reply_fallback, retryable_provider_tail_failure_detail,
    should_downgrade_provider_tail_failure, should_retry_provider_tail_failure,
    StreamEventDiagnostics,
};
use self::stream_idle::resolve_provider_stream_idle_timeout;
#[cfg(test)]
use self::stream_text_batcher::TextDeltaBatcher;
pub use self::web_search_execution_tracker::WebSearchExecutionTracker;
pub(crate) use self::web_search_preflight::PreflightToolExecution;
use self::web_search_preflight::{
    execute_web_search_preflight_if_needed, merge_system_prompt_with_web_search_preflight_context,
    WebSearchPreflightRequest,
};
#[cfg(test)]
use crate::protocol::TextDeltaBatchBoundary;
use crate::protocol::{AgentEvent as RuntimeAgentEvent, AgentRuntimeStatus};
use crate::write_artifact_events::WriteArtifactEventEmitter;
pub use agent_runtime::reply_execution::{
    RuntimeReplyAttemptError as ReplyAttemptError, RuntimeReplyExecution as StreamReplyExecution,
};
use agent_runtime::reply_host::RuntimeReplyPolicyHost;
use agent_runtime::reply_input::RuntimeReplyAttemptInput as ReplyAttemptInput;
pub(crate) use agent_runtime::reply_input::{
    RuntimeReplyInput as ReplyInput, RuntimeReplyInputImage as ReplyInputImage,
};
use agent_runtime::session_config::AgentSessionConfig;
#[cfg(test)]
use lime_core::database::dao::agent_timeline::{AgentThreadItem, AgentThreadItemPayload};
use std::path::Path;
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

pub const WEB_SEARCH_PREFETCH_CONTEXT_MARKER: &str = "【联网预检索上下文】";
pub const WEB_SEARCH_SYNTHESIS_MARKER: &str = "【预检索后输出要求】";

const EMPTY_REPLY_DIRECT_ANSWER_RETRY_PROMPT: &str = "请继续。你上一条回复没有输出任何内容。不要重复调用工具，直接基于当前上下文给出最终答复；如果当前确实无法继续，请明确说明原因。输出时继续遵循当前会话的 Interaction Soul 口吻。";
const INCOMPLETE_TOOL_BATCH_CONTINUE_PROMPT: &str = "请继续。你上一条回复还是中间过程结论，不是最终答复。若仍缺关键证据，请立刻继续下一批必要工具调用；证据足够后直接给出完整结论。不要停在“还需要继续查看/读取/确认”的中间态，也不要重复上一批已经完成的工具。输出时继续遵循当前会话的 Interaction Soul 口吻。";
const PROVIDER_TAIL_FAILURE_CONTINUE_PROMPT: &str = "请继续。上一轮模型通道在尾段暂时中断，但当前对话中已有工具结果和部分输出。请基于已经完成的工具结果与上下文直接补齐最终答复；不要重复已经完成的工具调用，除非确实缺少关键证据。输出时继续遵循当前会话的 Interaction Soul 口吻。";
const WEB_SEARCH_EMPTY_REPLY_RETRY_PROMPT: &str = "请继续。你已经完成本回合所需的 WebSearch 预检索，现在必须直接给出最终答复，不要再次调用 WebSearch 或 WebFetch。请至少输出：1. 结论摘要；2. 主题归纳；3. 关键信息；4. 如有分歧，说明来源差异。输出时继续遵循当前会话的 Interaction Soul 口吻。";
pub(super) const CANCELLED_TURN_CONTEXT_MARKER: &str =
    "上一回合已被用户停止，不要继续回答被停止的请求；等待并仅处理后续用户消息。";

fn is_reply_cancelled(cancel_token: &Option<CancellationToken>) -> bool {
    cancel_token
        .as_ref()
        .is_some_and(CancellationToken::is_cancelled)
}

fn build_stream_reply_execution(
    text_output: String,
    event_errors: Vec<String>,
    emitted_any: bool,
    attempts_summary: String,
    cancelled: bool,
) -> StreamReplyExecution {
    StreamReplyExecution::new(
        text_output,
        event_errors,
        emitted_any,
        attempts_summary,
        cancelled,
    )
}

fn build_empty_final_reply_fallback(
    diagnostics: &StreamEventDiagnostics,
    emitted_any: bool,
) -> Option<String> {
    if !emitted_any {
        return None;
    }

    build_output_preserved_reply_fallback(diagnostics)
}

fn merge_system_prompt_with_web_search_synthesis_instruction(
    base_prompt: Option<String>,
) -> Option<String> {
    let synthesis_prompt = format!(
        "{WEB_SEARCH_SYNTHESIS_MARKER}\n\
- 你已经完成本回合所需的 WebSearch 预检索。\n\
- 现在必须直接输出最终答复，不要再次调用 WebSearch 或 WebFetch。\n\
- 至少给出：结论摘要、主题归纳、关键信息、来源分歧说明。\n\
- 绝不能只停留在搜索轨迹或工具状态。"
    );

    match base_prompt {
        Some(base) => {
            if base.contains(WEB_SEARCH_SYNTHESIS_MARKER) {
                Some(base)
            } else if base.trim().is_empty() {
                Some(synthesis_prompt)
            } else {
                Some(format!("{base}\n\n{synthesis_prompt}"))
            }
        }
        None => Some(synthesis_prompt),
    }
}

#[derive(Debug, Clone, Copy)]
struct StreamReplyPolicyExecutionOptions {
    provider_stream_idle_timeout: Option<Duration>,
    persist_runtime_status: bool,
}

impl StreamReplyPolicyExecutionOptions {
    fn from_env() -> Self {
        Self {
            provider_stream_idle_timeout: resolve_provider_stream_idle_timeout(),
            persist_runtime_status: true,
        }
    }

    fn direct_generation() -> Self {
        Self {
            provider_stream_idle_timeout: resolve_provider_stream_idle_timeout(),
            persist_runtime_status: false,
        }
    }
}

async fn maybe_emit_runtime_status<F>(
    host: &impl RuntimeReplyPolicyHost<RuntimeAgentEvent, AgentRuntimeStatus>,
    session_config: &AgentSessionConfig,
    status: AgentRuntimeStatus,
    options: &StreamReplyPolicyExecutionOptions,
    on_event: &mut F,
) where
    F: FnMut(&RuntimeAgentEvent) + Send,
{
    if options.persist_runtime_status {
        host.emit_runtime_status(session_config, status, on_event)
            .await;
        return;
    }

    let event = RuntimeAgentEvent::RuntimeStatus { status };
    on_event(&event);
}

#[allow(clippy::too_many_arguments)]
async fn stream_message_reply_with_policy_with_options<F>(
    reply_host: &impl RuntimeReplyPolicyHost<RuntimeAgentEvent, AgentRuntimeStatus>,
    user_input: ReplyAttemptInput,
    working_directory: Option<&Path>,
    session_config: AgentSessionConfig,
    cancel_token: Option<CancellationToken>,
    request_tool_policy: &RequestToolPolicy,
    mut on_event: F,
    options: StreamReplyPolicyExecutionOptions,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent) + Send,
{
    let mut session_config = session_config;
    let started_at = Instant::now();
    let message_text = user_input.as_concat_text();
    let cancel_probe = cancel_token.clone();
    let mut web_search_tracker = WebSearchExecutionTracker::default();
    tracing::info!(
        "[AgentRuntime][TTFT] stream policy start: session_id={}, message_chars={}, search_mode={}",
        session_config.id,
        message_text.chars().count(),
        request_tool_policy.search_mode.as_str()
    );

    // preflight 默认关闭；Required 只表达工具必须完成，不应默认阻塞首字。
    let preflight = if request_tool_policy.requires_web_search() {
        execute_web_search_preflight_if_needed(
            WebSearchPreflightRequest {
                session_id: &session_config.id,
                message_text: &message_text,
                working_directory,
                cancel_token: cancel_token.clone(),
                turn_context: session_config.turn_context.clone(),
                policy: request_tool_policy,
            },
            &mut web_search_tracker,
        )
        .await
    } else {
        Ok(PreflightToolExecution::none())
    };
    let preflight_execution = match preflight {
        Ok(preflight_execution) => {
            session_config.system_prompt = merge_system_prompt_with_web_search_preflight_context(
                session_config.system_prompt.take(),
                preflight_execution.system_prompt_appendix.clone(),
            );
            for event in &preflight_execution.events {
                on_event(event);
            }
            tracing::info!(
                "[AgentRuntime][TTFT] stream policy preflight complete: session_id={}, events={}, elapsed_ms={}",
                session_config.id,
                preflight_execution.events.len(),
                started_at.elapsed().as_millis()
            );
            preflight_execution
        }
        Err(error) => {
            return Err(ReplyAttemptError {
                message: format!(
                    "{error}\n尝试记录: {}",
                    web_search_tracker.format_attempts()
                ),
                emitted_any: false,
            });
        }
    };

    let mut write_artifact_emitter = WriteArtifactEventEmitter::new(session_config.id.clone());
    let mut emitted_any = false;
    let mut text_chunks: Vec<String> = Vec::new();
    let mut event_errors: Vec<String> = Vec::new();
    let mut diagnostics = StreamEventDiagnostics::default();
    let first_attempt = stream_agent_reply_once(
        reply_host,
        user_input,
        &session_config,
        cancel_token.clone(),
        options.provider_stream_idle_timeout,
        request_tool_policy,
        &mut web_search_tracker,
        &mut write_artifact_emitter,
        &mut emitted_any,
        &mut text_chunks,
        &mut event_errors,
        &mut diagnostics,
        &mut on_event,
    )
    .await;
    tracing::info!(
        "[AgentRuntime][TTFT] stream policy first attempt complete: session_id={}, elapsed_ms={}, emitted_any={}, text_deltas={}",
        session_config.id,
        started_at.elapsed().as_millis(),
        emitted_any,
        diagnostics.text_delta_count
    );
    if let Err(error) = first_attempt {
        if should_downgrade_provider_tail_failure(&error.message, &diagnostics, emitted_any) {
            tracing::warn!(
                "[AgentRuntime][ReplyPolicy] provider tail failure downgraded after persisted output: tools={}, artifacts={}, saved_site={}",
                diagnostics.tool_end_count,
                diagnostics.persisted_artifact_count,
                diagnostics.saved_site_content_count
            );
            let fallback_text = text_chunks.join("").trim().to_string();
            return Ok(build_stream_reply_execution(
                if fallback_text.is_empty() {
                    match build_output_preserved_reply_fallback(&diagnostics) {
                        Some(output) => output,
                        None => return Err(error),
                    }
                } else {
                    fallback_text
                },
                event_errors,
                emitted_any,
                web_search_tracker.format_attempts(),
                is_reply_cancelled(&cancel_probe),
            ));
        }
        if let Some(error_detail) =
            retryable_provider_tail_failure_detail(&error.message).filter(|_| {
                should_retry_provider_tail_failure(&error.message, &diagnostics, emitted_any)
            })
        {
            tracing::warn!(
                "[AgentRuntime][ReplyPolicy] retrying after provider tail failure: tools={}, text_deltas={}, error={}",
                diagnostics.tool_end_count,
                diagnostics.text_delta_count,
                error_detail
            );
            maybe_emit_runtime_status(
                reply_host,
                &session_config,
                build_provider_tail_failure_retry_runtime_status(error_detail),
                &options,
                &mut on_event,
            )
            .await;
            let retry_attempt = stream_agent_reply_once(
                reply_host,
                ReplyInput::agent_only_text(PROVIDER_TAIL_FAILURE_CONTINUE_PROMPT).into(),
                &session_config,
                cancel_token.clone(),
                options.provider_stream_idle_timeout,
                request_tool_policy,
                &mut web_search_tracker,
                &mut write_artifact_emitter,
                &mut emitted_any,
                &mut text_chunks,
                &mut event_errors,
                &mut diagnostics,
                &mut on_event,
            )
            .await;
            if let Err(retry_error) = retry_attempt {
                if should_downgrade_provider_tail_failure(
                    &retry_error.message,
                    &diagnostics,
                    emitted_any,
                ) {
                    tracing::warn!(
                        "[AgentRuntime][ReplyPolicy] provider tail failure downgraded after tail-failure retry with persisted output: tools={}, artifacts={}, saved_site={}",
                        diagnostics.tool_end_count,
                        diagnostics.persisted_artifact_count,
                        diagnostics.saved_site_content_count
                    );
                    let Some(fallback_text) = build_output_preserved_reply_fallback(&diagnostics)
                    else {
                        return Err(retry_error);
                    };
                    return Ok(build_stream_reply_execution(
                        fallback_text,
                        event_errors,
                        emitted_any,
                        web_search_tracker.format_attempts(),
                        is_reply_cancelled(&cancel_probe),
                    ));
                }
                return Err(retry_error);
            }
        } else {
            return Err(error);
        }
    }

    if is_reply_cancelled(&cancel_probe) {
        reply_host
            .persist_cancelled_turn_context_marker(&session_config.id)
            .await;
        return Ok(build_stream_reply_execution(
            text_chunks.join(""),
            event_errors,
            emitted_any,
            web_search_tracker.format_attempts(),
            true,
        ));
    }

    let current_text_output = text_chunks.join("");
    match resolve_reply_retry_mode(
        &preflight_execution,
        &current_text_output,
        &web_search_tracker,
        &diagnostics,
        &event_errors,
    ) {
        ReplyRetryMode::WebSearchSynthesis => {
            tracing::warn!(
                "[AgentRuntime][WebSearchPrefetch] empty final text after preflight, retrying synthesis: session={}, attempts={}",
                session_config.id,
                web_search_tracker.format_attempts()
            );
            maybe_emit_runtime_status(
                reply_host,
                &session_config,
                build_web_search_synthesis_runtime_status(
                    preflight_execution.coverage_summary.as_deref(),
                ),
                &options,
                &mut on_event,
            )
            .await;
            session_config.system_prompt =
                merge_system_prompt_with_web_search_synthesis_instruction(
                    session_config.system_prompt.take(),
                );
            let retry_attempt = stream_agent_reply_once(
                reply_host,
                ReplyInput::agent_only_text(WEB_SEARCH_EMPTY_REPLY_RETRY_PROMPT).into(),
                &session_config,
                cancel_token,
                options.provider_stream_idle_timeout,
                request_tool_policy,
                &mut web_search_tracker,
                &mut write_artifact_emitter,
                &mut emitted_any,
                &mut text_chunks,
                &mut event_errors,
                &mut diagnostics,
                &mut on_event,
            )
            .await;
            if let Err(error) = retry_attempt {
                if should_downgrade_provider_tail_failure(&error.message, &diagnostics, emitted_any)
                {
                    tracing::warn!(
                        "[AgentRuntime][ReplyPolicy] provider tail failure downgraded after retry with persisted output: tools={}, artifacts={}, saved_site={}",
                        diagnostics.tool_end_count,
                        diagnostics.persisted_artifact_count,
                        diagnostics.saved_site_content_count
                    );
                    let Some(fallback_text) = build_output_preserved_reply_fallback(&diagnostics)
                    else {
                        return Err(error);
                    };
                    return Ok(build_stream_reply_execution(
                        fallback_text,
                        event_errors,
                        emitted_any,
                        web_search_tracker.format_attempts(),
                        is_reply_cancelled(&cancel_probe),
                    ));
                }
                return Err(error);
            }
        }
        ReplyRetryMode::DirectAnswer => {
            tracing::warn!(
                "[AgentRuntime][ReplyPolicy] empty final text without tool activity, retrying direct answer: session={}",
                session_config.id
            );
            maybe_emit_runtime_status(
                reply_host,
                &session_config,
                build_empty_reply_retry_runtime_status(),
                &options,
                &mut on_event,
            )
            .await;
            let retry_attempt = stream_agent_reply_once(
                reply_host,
                ReplyInput::agent_only_text(EMPTY_REPLY_DIRECT_ANSWER_RETRY_PROMPT).into(),
                &session_config,
                cancel_token,
                options.provider_stream_idle_timeout,
                request_tool_policy,
                &mut web_search_tracker,
                &mut write_artifact_emitter,
                &mut emitted_any,
                &mut text_chunks,
                &mut event_errors,
                &mut diagnostics,
                &mut on_event,
            )
            .await;
            if let Err(error) = retry_attempt {
                if should_downgrade_provider_tail_failure(&error.message, &diagnostics, emitted_any)
                {
                    tracing::warn!(
                        "[AgentRuntime][ReplyPolicy] provider tail failure downgraded after empty-reply retry with persisted output: tools={}, artifacts={}, saved_site={}",
                        diagnostics.tool_end_count,
                        diagnostics.persisted_artifact_count,
                        diagnostics.saved_site_content_count
                    );
                    let Some(fallback_text) = build_output_preserved_reply_fallback(&diagnostics)
                    else {
                        return Err(error);
                    };
                    return Ok(build_stream_reply_execution(
                        fallback_text,
                        event_errors,
                        emitted_any,
                        web_search_tracker.format_attempts(),
                        is_reply_cancelled(&cancel_probe),
                    ));
                }
                return Err(error);
            }
        }
        ReplyRetryMode::IntermediateConclusion => {
            tracing::warn!(
                "[AgentRuntime][ReplyPolicy] tool batch ended with intermediate conclusion, retrying continuation: session={}, tools={}",
                session_config.id,
                diagnostics.tool_end_count
            );
            maybe_emit_runtime_status(
                reply_host,
                &session_config,
                build_incomplete_tool_batch_continue_runtime_status(),
                &options,
                &mut on_event,
            )
            .await;
            let retry_attempt = stream_agent_reply_once(
                reply_host,
                ReplyInput::agent_only_text(INCOMPLETE_TOOL_BATCH_CONTINUE_PROMPT).into(),
                &session_config,
                cancel_token,
                options.provider_stream_idle_timeout,
                request_tool_policy,
                &mut web_search_tracker,
                &mut write_artifact_emitter,
                &mut emitted_any,
                &mut text_chunks,
                &mut event_errors,
                &mut diagnostics,
                &mut on_event,
            )
            .await;
            if let Err(error) = retry_attempt {
                if should_downgrade_provider_tail_failure(&error.message, &diagnostics, emitted_any)
                {
                    tracing::warn!(
                        "[AgentRuntime][ReplyPolicy] provider tail failure downgraded after intermediate-conclusion retry with persisted output: tools={}, artifacts={}, saved_site={}",
                        diagnostics.tool_end_count,
                        diagnostics.persisted_artifact_count,
                        diagnostics.saved_site_content_count
                    );
                    let Some(fallback_text) = build_output_preserved_reply_fallback(&diagnostics)
                    else {
                        return Err(error);
                    };
                    return Ok(build_stream_reply_execution(
                        fallback_text,
                        event_errors,
                        emitted_any,
                        web_search_tracker.format_attempts(),
                        is_reply_cancelled(&cancel_probe),
                    ));
                }
                return Err(error);
            }
        }
        ReplyRetryMode::None => {}
    }

    if is_reply_cancelled(&cancel_probe) {
        reply_host
            .persist_cancelled_turn_context_marker(&session_config.id)
            .await;
        return Ok(build_stream_reply_execution(
            text_chunks.join(""),
            event_errors,
            emitted_any,
            web_search_tracker.format_attempts(),
            true,
        ));
    }

    if let Err(validation_error) =
        web_search_tracker.validate_web_search_requirement(request_tool_policy)
    {
        return Err(ReplyAttemptError {
            message: validation_error,
            emitted_any,
        });
    }

    tracing::info!(
        "[AgentRuntime][Diag] stream summary: elapsed_ms={}, text_deltas={}, tool_starts={}, tool_ends={}, context_traces={}, errors={}, max_text_delta_chars={}, max_tool_output_chars={}, max_context_trace_steps={}",
        started_at.elapsed().as_millis(),
        diagnostics.text_delta_count,
        diagnostics.tool_start_count,
        diagnostics.tool_end_count,
        diagnostics.context_trace_events,
        diagnostics.error_count,
        diagnostics.max_text_delta_chars,
        diagnostics.max_tool_output_chars,
        diagnostics.max_context_trace_steps
    );

    let final_text_output = text_chunks.join("");
    if final_text_output.trim().is_empty() {
        if let Some(last_error) = event_errors.last() {
            return Err(ReplyAttemptError {
                message: last_error.clone(),
                emitted_any,
            });
        }
        if let Some(fallback_text) = build_empty_final_reply_fallback(&diagnostics, emitted_any) {
            tracing::warn!(
                "[AgentRuntime][ReplyPolicy] empty final text downgraded to synthesized fallback: emitted_any={}, tool_starts={}, tool_ends={}, attempts={}",
                emitted_any,
                diagnostics.tool_start_count,
                diagnostics.tool_end_count,
                web_search_tracker.format_attempts()
            );
            return Ok(build_stream_reply_execution(
                fallback_text,
                event_errors,
                emitted_any,
                web_search_tracker.format_attempts(),
                is_reply_cancelled(&cancel_probe),
            ));
        }
        return Err(ReplyAttemptError {
            message: build_empty_final_reply_error_message(&diagnostics, &web_search_tracker),
            emitted_any,
        });
    }

    Ok(build_stream_reply_execution(
        final_text_output,
        event_errors,
        emitted_any,
        web_search_tracker.format_attempts(),
        false,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::AgentToolResult;
    use crate::request_tool_policy::reply_retry::should_synthesize_web_search_after_enough_evidence;
    use crate::request_tool_policy::runtime_status::build_web_retrieval_synthesis_runtime_status;
    use crate::request_tool_policy::stream_diagnostics::update_stream_event_diagnostics;
    use crate::request_tool_policy::stream_text_batcher::TEXT_DELTA_BATCH_BACKLOG_CHARS;
    use crate::request_tool_policy::web_retrieval_process::WebRetrievalProcessState;
    use crate::turn_context_configuration::AgentTurnContext;
    mod provider_stream_idle;
    use aster::agents::Agent;
    use aster::conversation::message::Message;
    use aster::conversation::Conversation;
    use aster::providers::base::{Provider, ProviderMetadata, ProviderUsage, Usage};
    use aster::providers::errors::ProviderError;
    use aster::session::{
        ChatHistoryMatch, CommitOptions, CommitReport, MemoryCategory, MemoryHealth, MemoryRecord,
        MemorySearchResult, Session, SessionInsights, SessionStore, SessionType, TokenStatsUpdate,
        TurnStatus,
    };
    use async_trait::async_trait;
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;
    use uuid::Uuid;

    struct TestSessionStore {
        session: Mutex<Session>,
    }

    impl TestSessionStore {
        fn new(session: Session) -> Self {
            Self {
                session: Mutex::new(session),
            }
        }

        fn current_session(&self, include_messages: bool) -> Session {
            let mut session = self.session.lock().expect("锁测试 session").clone();
            if !include_messages {
                session.conversation = None;
            }
            session
        }
    }

    fn create_test_session_store(name: &str) -> (Arc<TestSessionStore>, Session) {
        let now = chrono::Utc::now();
        let session = Session {
            id: format!("test-{}-{}", name, Uuid::new_v4()),
            working_dir: PathBuf::default(),
            name: name.to_string(),
            user_set_name: false,
            session_type: SessionType::Hidden,
            created_at: now,
            updated_at: now,
            extension_data: Default::default(),
            total_tokens: None,
            input_tokens: None,
            output_tokens: None,
            cached_input_tokens: None,
            cache_creation_input_tokens: None,
            accumulated_total_tokens: None,
            accumulated_input_tokens: None,
            accumulated_output_tokens: None,
            schedule_id: None,
            recipe: None,
            user_recipe_values: None,
            conversation: Some(Conversation::default()),
            message_count: 0,
            provider_name: None,
            model_config: None,
        };
        (Arc::new(TestSessionStore::new(session.clone())), session)
    }

    #[async_trait]
    impl SessionStore for TestSessionStore {
        async fn create_session(
            &self,
            _working_dir: PathBuf,
            _name: String,
            _session_type: SessionType,
        ) -> anyhow::Result<Session> {
            Ok(self.current_session(true))
        }

        async fn get_session(&self, _id: &str, include_messages: bool) -> anyhow::Result<Session> {
            Ok(self.current_session(include_messages))
        }

        async fn add_message(&self, _session_id: &str, message: &Message) -> anyhow::Result<()> {
            let mut session = self.session.lock().expect("锁测试 session");
            let conversation = session
                .conversation
                .get_or_insert_with(Conversation::default);
            conversation.push(message.clone());
            session.message_count = conversation.len();
            session.updated_at = chrono::Utc::now();
            Ok(())
        }

        async fn replace_conversation(
            &self,
            _session_id: &str,
            conversation: &Conversation,
        ) -> anyhow::Result<()> {
            let mut session = self.session.lock().expect("锁测试 session");
            session.conversation = Some(conversation.clone());
            session.message_count = conversation.len();
            session.updated_at = chrono::Utc::now();
            Ok(())
        }

        async fn list_sessions(&self) -> anyhow::Result<Vec<Session>> {
            Ok(vec![self.current_session(false)])
        }

        async fn list_sessions_by_types(
            &self,
            _types: &[SessionType],
        ) -> anyhow::Result<Vec<Session>> {
            Ok(vec![self.current_session(false)])
        }

        async fn delete_session(&self, _id: &str) -> anyhow::Result<()> {
            Ok(())
        }

        async fn get_insights(&self) -> anyhow::Result<SessionInsights> {
            Ok(SessionInsights {
                total_sessions: 1,
                total_tokens: 0,
            })
        }

        async fn update_session_name(
            &self,
            _session_id: &str,
            name: String,
            user_set: bool,
        ) -> anyhow::Result<()> {
            let mut session = self.session.lock().expect("锁测试 session");
            session.name = name;
            session.user_set_name = user_set;
            session.updated_at = chrono::Utc::now();
            Ok(())
        }

        async fn update_working_dir(
            &self,
            _session_id: &str,
            working_dir: PathBuf,
        ) -> anyhow::Result<()> {
            let mut session = self.session.lock().expect("锁测试 session");
            session.working_dir = working_dir;
            session.updated_at = chrono::Utc::now();
            Ok(())
        }

        async fn update_session_type(
            &self,
            _session_id: &str,
            session_type: SessionType,
        ) -> anyhow::Result<()> {
            let mut session = self.session.lock().expect("锁测试 session");
            session.session_type = session_type;
            session.updated_at = chrono::Utc::now();
            Ok(())
        }

        async fn update_extension_data(
            &self,
            _session_id: &str,
            extension_data: aster::session::extension_data::ExtensionData,
        ) -> anyhow::Result<()> {
            let mut session = self.session.lock().expect("锁测试 session");
            session.extension_data = extension_data;
            session.updated_at = chrono::Utc::now();
            Ok(())
        }

        async fn update_token_stats(
            &self,
            _session_id: &str,
            _stats: TokenStatsUpdate,
        ) -> anyhow::Result<()> {
            Ok(())
        }

        async fn update_provider_config(
            &self,
            _session_id: &str,
            provider_name: Option<String>,
            model_config: Option<aster::model::ModelConfig>,
        ) -> anyhow::Result<()> {
            let mut session = self.session.lock().expect("锁测试 session");
            if let Some(provider_name) = provider_name {
                session.provider_name = Some(provider_name);
            }
            if let Some(model_config) = model_config {
                session.model_config = Some(model_config);
            }
            session.updated_at = chrono::Utc::now();
            Ok(())
        }

        async fn update_recipe(
            &self,
            _session_id: &str,
            _recipe: Option<aster::recipe::Recipe>,
            _user_recipe_values: Option<HashMap<String, String>>,
        ) -> anyhow::Result<()> {
            Ok(())
        }

        async fn search_chat_history(
            &self,
            _query: &str,
            _limit: Option<usize>,
            _after_date: Option<chrono::DateTime<chrono::Utc>>,
            _before_date: Option<chrono::DateTime<chrono::Utc>>,
            _exclude_session_id: Option<String>,
        ) -> anyhow::Result<Vec<ChatHistoryMatch>> {
            Ok(Vec::new())
        }

        async fn commit_session(
            &self,
            _id: &str,
            _options: CommitOptions,
        ) -> anyhow::Result<CommitReport> {
            Ok(CommitReport {
                session_id: "test-session-store".to_string(),
                messages_scanned: 0,
                memories_created: 0,
                memories_merged: 0,
                source_start_ts: None,
                source_end_ts: None,
                warnings: Vec::new(),
            })
        }

        async fn search_memories(
            &self,
            _query: &str,
            _limit: Option<usize>,
            _session_scope: Option<&str>,
            _categories: Option<Vec<MemoryCategory>>,
        ) -> anyhow::Result<Vec<MemorySearchResult>> {
            Ok(Vec::new())
        }

        async fn retrieve_context_memories(
            &self,
            _session_id: &str,
            _query: &str,
            _limit: usize,
        ) -> anyhow::Result<Vec<MemoryRecord>> {
            Ok(Vec::new())
        }

        async fn memory_stats(&self) -> anyhow::Result<aster::session::MemoryStats> {
            Ok(aster::session::MemoryStats::default())
        }

        async fn memory_health(&self) -> anyhow::Result<MemoryHealth> {
            Ok(MemoryHealth {
                healthy: true,
                message: "test session store".to_string(),
            })
        }
    }

    struct ContextLengthExceededProvider;

    #[async_trait]
    impl Provider for ContextLengthExceededProvider {
        fn metadata() -> ProviderMetadata
        where
            Self: Sized,
        {
            ProviderMetadata::empty()
        }

        fn get_name(&self) -> &str {
            "context-length-exceeded-provider"
        }

        async fn complete_with_model(
            &self,
            _model_config: &aster::model::ModelConfig,
            _system: &str,
            _messages: &[Message],
            _tools: &[rmcp::model::Tool],
        ) -> Result<(Message, ProviderUsage), ProviderError> {
            Err(ProviderError::ContextLengthExceeded(
                "mock context overflow".to_string(),
            ))
        }

        fn get_model_config(&self) -> aster::model::ModelConfig {
            aster::model::ModelConfig::new("gpt-5.3-codex").expect("test model config")
        }
    }

    struct EmptyReplyThenTextProvider {
        attempts: Arc<AtomicUsize>,
    }

    #[async_trait]
    impl Provider for EmptyReplyThenTextProvider {
        fn metadata() -> ProviderMetadata
        where
            Self: Sized,
        {
            ProviderMetadata::empty()
        }

        fn get_name(&self) -> &str {
            "empty-reply-then-text-provider"
        }

        async fn complete_with_model(
            &self,
            _model_config: &aster::model::ModelConfig,
            _system: &str,
            _messages: &[Message],
            _tools: &[rmcp::model::Tool],
        ) -> Result<(Message, ProviderUsage), ProviderError> {
            let attempt = self.attempts.fetch_add(1, Ordering::SeqCst);
            let message = if attempt == 0 {
                Message::assistant()
            } else {
                Message::assistant().with_text("这是补发的最终答复。")
            };

            Ok((
                message,
                ProviderUsage::new("gpt-5.3-codex".to_string(), Usage::default()),
            ))
        }

        fn get_model_config(&self) -> aster::model::ModelConfig {
            aster::model::ModelConfig::new("gpt-5.3-codex").expect("test model config")
        }
    }

    struct SlowStreamingProvider;

    #[async_trait]
    impl Provider for SlowStreamingProvider {
        fn metadata() -> ProviderMetadata
        where
            Self: Sized,
        {
            ProviderMetadata::empty()
        }

        fn get_name(&self) -> &str {
            "slow-streaming-provider"
        }

        async fn complete_with_model(
            &self,
            _model_config: &aster::model::ModelConfig,
            _system: &str,
            _messages: &[Message],
            _tools: &[rmcp::model::Tool],
        ) -> Result<(Message, ProviderUsage), ProviderError> {
            Ok((
                Message::assistant().with_text("非流式兜底不应被调用"),
                ProviderUsage::new("gpt-5.3-codex".to_string(), Usage::default()),
            ))
        }

        async fn stream(
            &self,
            _system: &str,
            _messages: &[Message],
            _tools: &[rmcp::model::Tool],
        ) -> Result<aster::providers::base::MessageStream, ProviderError> {
            Ok(Box::pin(async_stream::try_stream! {
                yield (
                    Some(Message::assistant().with_text("第一段")),
                    None,
                );
                tokio::time::sleep(Duration::from_secs(30)).await;
                yield (
                    Some(Message::assistant().with_text("第二段")),
                    Some(ProviderUsage::new("gpt-5.3-codex".to_string(), Usage::default())),
                );
            }))
        }

        fn supports_streaming(&self) -> bool {
            true
        }

        fn get_model_config(&self) -> aster::model::ModelConfig {
            aster::model::ModelConfig::new("gpt-5.3-codex").expect("test model config")
        }
    }

    struct TailFailureThenTextProvider {
        attempts: Arc<AtomicUsize>,
    }

    #[async_trait]
    impl Provider for TailFailureThenTextProvider {
        fn metadata() -> ProviderMetadata
        where
            Self: Sized,
        {
            ProviderMetadata::empty()
        }

        fn get_name(&self) -> &str {
            "tail-failure-then-text-provider"
        }

        async fn complete_with_model(
            &self,
            _model_config: &aster::model::ModelConfig,
            _system: &str,
            _messages: &[Message],
            _tools: &[rmcp::model::Tool],
        ) -> Result<(Message, ProviderUsage), ProviderError> {
            Ok((
                Message::assistant().with_text("非流式兜底不应被调用"),
                ProviderUsage::new("gpt-5.3-codex".to_string(), Usage::default()),
            ))
        }

        async fn stream(
            &self,
            _system: &str,
            _messages: &[Message],
            _tools: &[rmcp::model::Tool],
        ) -> Result<aster::providers::base::MessageStream, ProviderError> {
            let attempt = self.attempts.fetch_add(1, Ordering::SeqCst);
            Ok(Box::pin(async_stream::try_stream! {
                if attempt == 0 {
                    yield (
                        Some(Message::assistant().with_text("已完成搜索，")),
                        None,
                    );
                    Err(ProviderError::RequestFailed(
                        "error sending request for url (https://example.invalid/v1/messages) (failed to connect to example.invalid)".to_string(),
                    ))?;
                } else {
                    yield (
                        Some(Message::assistant().with_text("最终摘要已补齐。")),
                        Some(ProviderUsage::new("gpt-5.3-codex".to_string(), Usage::default())),
                    );
                }
            }))
        }

        fn supports_streaming(&self) -> bool {
            true
        }

        fn get_model_config(&self) -> aster::model::ModelConfig {
            aster::model::ModelConfig::new("gpt-5.3-codex").expect("test model config")
        }
    }

    struct AuthenticationErrorProvider;

    #[async_trait]
    impl Provider for AuthenticationErrorProvider {
        fn metadata() -> ProviderMetadata
        where
            Self: Sized,
        {
            ProviderMetadata::empty()
        }

        fn get_name(&self) -> &str {
            "authentication-error-provider"
        }

        async fn complete_with_model(
            &self,
            _model_config: &aster::model::ModelConfig,
            _system: &str,
            _messages: &[Message],
            _tools: &[rmcp::model::Tool],
        ) -> Result<(Message, ProviderUsage), ProviderError> {
            Err(ProviderError::Authentication(
                "Authentication failed. Status: 403 Forbidden. Response: Illegal access"
                    .to_string(),
            ))
        }

        fn get_model_config(&self) -> aster::model::ModelConfig {
            aster::model::ModelConfig::new("mimo-v2.5-pro").expect("test model config")
        }
    }

    fn test_session_config(session_id: &str, turn_id: &str) -> AgentSessionConfig {
        AgentSessionConfig {
            id: session_id.to_string(),
            thread_id: None,
            turn_id: Some(turn_id.to_string()),
            schedule_id: None,
            max_turns: None,
            system_prompt: None,
            system_prompt_override: None,
            include_context_trace: None,
            turn_context: None,
        }
    }

    fn test_session_config_with_turn_context(
        session_id: &str,
        turn_id: &str,
        turn_context: AgentTurnContext,
    ) -> AgentSessionConfig {
        AgentSessionConfig {
            turn_context: Some(turn_context),
            ..test_session_config(session_id, turn_id)
        }
    }

    fn build_auto_compaction_disabled_turn_context() -> AgentTurnContext {
        let mut metadata = HashMap::new();
        metadata.insert(
            "lime_runtime".to_string(),
            serde_json::json!({
                "auto_compact": false,
            }),
        );
        AgentTurnContext {
            metadata,
            ..AgentTurnContext::default()
        }
    }

    #[test]
    fn detects_incomplete_tool_batch_summary_text() {
        assert!(looks_like_incomplete_tool_batch_summary(
            "已确认 claudecode/src/tasks 下有 7 种 Task 类型。现在需要读取核心类型定义、调度框架和几个关键子 Task 的入口，才能和 Lime 的 task 系统做准确对比。"
        ));
        assert!(looks_like_incomplete_tool_batch_summary(
            "当前已经定位主入口，但还需要继续查看 task 调度和状态映射。"
        ));
        assert!(looks_like_incomplete_tool_batch_summary(
            "已确认主入口，但还需要继续查看 task 调度和状态映射。\n\n如果你希望我继续，我可以马上深入这两个模块。"
        ));
        assert!(!looks_like_incomplete_tool_batch_summary(
            "我已经完成对比。Claude Code 的任务面板更轻量，Lime 当前主要差异集中在任务展示位置、批次工具摘要和继续策略。"
        ));
        assert!(!looks_like_incomplete_tool_batch_summary(
            "已获得完整文件树，这是一个很大的 Claude Code CLI 项目。接下来需要看核心入口文件和关键模块来理解架构，才能对比 Lime 的优化点。\n\n## 一、Claude Code 项目概览\n这是 Claude Code CLI 的源码，主循环、工具注册、Task 系统与 compact 都已经识别清楚。\n\n## 二、Lime 当前还能继续对标优化的点\n优先补自动 compact、任务 runtime 和权限边界，然后再做长链路体验优化。"
        ));
    }

    #[test]
    fn resolves_retry_mode_for_incomplete_tool_batch_summary() {
        let diagnostics = StreamEventDiagnostics {
            tool_start_count: 2,
            tool_end_count: 2,
            ..StreamEventDiagnostics::default()
        };

        let mode = resolve_reply_retry_mode(
            &PreflightToolExecution::none(),
            "已确认 claudecode/src/tasks 下有 7 种 Task 类型。现在需要读取核心类型定义，才能和 Lime 的 task 系统做准确对比。",
            &WebSearchExecutionTracker::default(),
            &diagnostics,
            &[],
        );

        assert_eq!(mode, ReplyRetryMode::IntermediateConclusion);
    }

    #[test]
    fn diagnostics_detect_terminal_tool_search_no_retry_metadata() {
        let mut diagnostics = StreamEventDiagnostics::default();
        let mut metadata = HashMap::new();
        metadata.insert(
            "tool_search_retry_allowed".to_string(),
            serde_json::json!(false),
        );
        metadata.insert(
            "terminal_reason".to_string(),
            serde_json::json!("no_deferred_tool_match"),
        );

        update_stream_event_diagnostics(
            &mut diagnostics,
            &RuntimeAgentEvent::ToolEnd {
                tool_id: "toolsearch-terminal".to_string(),
                result: AgentToolResult {
                    success: true,
                    output: r#"{"matches":[],"retry_allowed":false}"#.to_string(),
                    error: None,
                    structured_content: None,
                    images: None,
                    metadata: Some(metadata),
                },
            },
        );

        assert!(diagnostics.terminal_tool_search_no_retry);
    }

    #[test]
    fn does_not_retry_intermediate_conclusion_after_terminal_tool_search_no_retry() {
        let diagnostics = StreamEventDiagnostics {
            tool_start_count: 1,
            tool_end_count: 1,
            terminal_tool_search_no_retry: true,
            ..StreamEventDiagnostics::default()
        };

        let mode = resolve_reply_retry_mode(
            &PreflightToolExecution::none(),
            "已确认可用工具 0 个。现在需要继续尝试 ToolSearch 才能找到 Context7 query docs 工具。",
            &WebSearchExecutionTracker::default(),
            &diagnostics,
            &[],
        );

        assert_eq!(mode, ReplyRetryMode::None);
    }

    #[test]
    fn does_not_retry_when_final_answer_follows_intermediate_process_summary() {
        let diagnostics = StreamEventDiagnostics {
            tool_start_count: 4,
            tool_end_count: 4,
            ..StreamEventDiagnostics::default()
        };

        let mode = resolve_reply_retry_mode(
            &PreflightToolExecution::none(),
            "已获得完整文件树，这是一个非常大的 Claude Code CLI 项目。接下来需要看核心入口文件和关键模块来理解架构，才能对比 Lime 的优化点。\n\n## 一、Claude Code 项目概览\n这是 Anthropic 官方的 Claude Code CLI 源码，主循环、工具体系、Task 系统和 compact 模块都已经识别清楚。\n\n## 二、Lime 当前还能继续对标优化的点\n优先补自动 compact、权限规则引擎和统一任务 runtime，再继续补子代理隔离与长链路体验。",
            &WebSearchExecutionTracker::default(),
            &diagnostics,
            &[],
        );

        assert_eq!(mode, ReplyRetryMode::None);
    }

    fn completed_tool_item(id: impl Into<String>, sequence: i64) -> AgentThreadItem {
        AgentThreadItem {
            id: id.into(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence,
            status: lime_core::database::dao::agent_timeline::AgentThreadItemStatus::Completed,
            started_at: "2026-06-18T00:00:00Z".to_string(),
            completed_at: Some("2026-06-18T00:00:01Z".to_string()),
            updated_at: "2026-06-18T00:00:01Z".to_string(),
            payload: AgentThreadItemPayload::ToolCall {
                tool_name: "WebSearch".to_string(),
                arguments: Some(serde_json::json!({ "query": "latest news" })),
                output: Some("results".to_string()),
                success: Some(true),
                error: None,
                metadata: None,
            },
        }
    }

    #[test]
    fn tracker_does_not_require_websearch_in_auto_mode() {
        let policy = resolve_request_tool_policy(Some(true));
        let mut tracker = WebSearchExecutionTracker::default();
        tracker.record_tool_start(&policy, "tool-1", "WebFetch");
        tracker.record_tool_end(&policy, "tool-1", true, None);
        assert!(tracker.validate_web_search_requirement(&policy).is_ok());
    }

    #[test]
    fn tracker_accepts_successful_required_websearch() {
        let policy = resolve_request_tool_policy_with_mode(
            Some(true),
            Some(RequestToolPolicyMode::Required),
        );
        let mut tracker = WebSearchExecutionTracker::default();
        tracker.record_tool_start(&policy, "tool-1", "WebSearch");
        tracker.record_tool_end(&policy, "tool-1", true, None);
        assert!(tracker.validate_web_search_requirement(&policy).is_ok());
    }

    #[test]
    fn tracker_requires_each_required_tool_to_succeed() {
        let policy = request_tool_policy_with_additional_required_tools(
            resolve_request_tool_policy_with_mode(
                Some(true),
                Some(RequestToolPolicyMode::Required),
            ),
            &["WebFetch"],
        );
        let mut tracker = WebSearchExecutionTracker::default();
        tracker.record_tool_start(&policy, "tool-search", "WebSearch");
        tracker.record_tool_end(&policy, "tool-search", true, None);

        let err = tracker
            .validate_web_search_requirement(&policy)
            .expect_err("missing WebFetch should fail");
        assert!(err.contains("WebFetch"));

        tracker.record_tool_start(&policy, "tool-fetch", "WebFetch");
        tracker.record_tool_end(&policy, "tool-fetch", true, None);
        assert!(tracker.validate_web_search_requirement(&policy).is_ok());
    }

    #[test]
    fn tracker_accepts_required_websearch_from_item_lifecycle() {
        let policy = resolve_request_tool_policy_with_mode(
            Some(true),
            Some(RequestToolPolicyMode::Required),
        );
        let mut tracker = WebSearchExecutionTracker::default();
        let item = completed_tool_item("tool-item-1", 1);

        tracker.record_tool_item(&policy, &item, true);

        assert!(tracker.validate_web_search_requirement(&policy).is_ok());
        assert_eq!(tracker.format_attempts(), "WebSearch#tool-item-1:success");
    }

    #[test]
    fn tracker_keeps_item_terminal_when_late_legacy_tool_end_conflicts() {
        let policy = resolve_request_tool_policy_with_mode(
            Some(true),
            Some(RequestToolPolicyMode::Required),
        );
        let mut tracker = WebSearchExecutionTracker::default();
        let item = completed_tool_item("tool-item-conflict", 1);

        tracker.record_tool_item(&policy, &item, true);
        tracker.record_tool_end(
            &policy,
            "tool-item-conflict",
            false,
            Some("legacy failure arrived late"),
        );

        assert!(tracker.validate_web_search_requirement(&policy).is_ok());
        assert_eq!(
            tracker.format_attempts(),
            "WebSearch#tool-item-conflict:success"
        );
    }

    #[test]
    fn tracker_reports_failure_record() {
        let policy = resolve_request_tool_policy_with_mode(
            Some(true),
            Some(RequestToolPolicyMode::Required),
        );
        let mut tracker = WebSearchExecutionTracker::default();
        tracker.record_tool_start(&policy, "tool-1", "WebSearch");
        tracker.record_tool_end(&policy, "tool-1", false, Some("network timeout"));
        let err = tracker
            .validate_web_search_requirement(&policy)
            .expect_err("failed required tool should fail");
        assert!(err.contains("network timeout"));
        assert!(err.contains("尝试记录"));
    }

    #[test]
    fn web_search_synthesis_boundary_triggers_after_enough_successful_attempts() {
        let policy = resolve_request_tool_policy(Some(true));
        let mut tracker = WebSearchExecutionTracker::default();
        for index in 0..WEB_SEARCH_SYNTHESIS_MIN_SUCCESSFUL_ATTEMPTS {
            let tool_id = format!("web-search-{index}");
            tracker.record_tool_start(&policy, &tool_id, "WebSearch");
            tracker.record_tool_end(&policy, &tool_id, true, None);
        }
        let diagnostics = StreamEventDiagnostics {
            tool_start_count: WEB_SEARCH_SYNTHESIS_MIN_SUCCESSFUL_ATTEMPTS,
            tool_end_count: WEB_SEARCH_SYNTHESIS_MIN_SUCCESSFUL_ATTEMPTS,
            ..StreamEventDiagnostics::default()
        };

        assert!(should_synthesize_web_search_after_enough_evidence(
            &policy,
            &tracker,
            &diagnostics
        ));
    }

    #[test]
    fn web_search_synthesis_boundary_accepts_item_lifecycle_counts() {
        let policy = resolve_request_tool_policy(Some(true));
        let mut tracker = WebSearchExecutionTracker::default();
        for index in 0..WEB_SEARCH_SYNTHESIS_MIN_SUCCESSFUL_ATTEMPTS {
            let tool_id = format!("web-search-item-{index}");
            let item = completed_tool_item(tool_id, index as i64);
            tracker.record_tool_item(&policy, &item, true);
        }
        let diagnostics = StreamEventDiagnostics {
            tool_item_start_count: WEB_SEARCH_SYNTHESIS_MIN_SUCCESSFUL_ATTEMPTS,
            tool_item_end_count: WEB_SEARCH_SYNTHESIS_MIN_SUCCESSFUL_ATTEMPTS,
            ..StreamEventDiagnostics::default()
        };

        assert!(should_synthesize_web_search_after_enough_evidence(
            &policy,
            &tracker,
            &diagnostics
        ));
    }

    #[test]
    fn web_search_synthesis_boundary_triggers_after_mixed_completed_attempts() {
        let policy = resolve_request_tool_policy(Some(true));
        let mut tracker = WebSearchExecutionTracker::default();
        for index in 0..WEB_SEARCH_SYNTHESIS_MIN_COMPLETED_ATTEMPTS {
            let tool_id = format!("web-fetch-{index}");
            tracker.record_tool_start(&policy, &tool_id, "WebFetch");
            tracker.record_tool_end(
                &policy,
                &tool_id,
                index == 0,
                (index != 0).then_some("fetch failed"),
            );
        }
        let diagnostics = StreamEventDiagnostics {
            tool_start_count: WEB_SEARCH_SYNTHESIS_MIN_COMPLETED_ATTEMPTS,
            tool_end_count: WEB_SEARCH_SYNTHESIS_MIN_COMPLETED_ATTEMPTS,
            ..StreamEventDiagnostics::default()
        };

        assert!(should_synthesize_web_search_after_enough_evidence(
            &policy,
            &tracker,
            &diagnostics
        ));
    }

    #[test]
    fn web_search_synthesis_boundary_waits_for_text_or_pending_tools() {
        let policy = resolve_request_tool_policy(Some(true));
        let mut tracker = WebSearchExecutionTracker::default();
        for index in 0..WEB_SEARCH_SYNTHESIS_MIN_SUCCESSFUL_ATTEMPTS {
            let tool_id = format!("web-search-{index}");
            tracker.record_tool_start(&policy, &tool_id, "WebSearch");
            tracker.record_tool_end(&policy, &tool_id, true, None);
        }

        let with_text = StreamEventDiagnostics {
            text_delta_count: 1,
            tool_start_count: WEB_SEARCH_SYNTHESIS_MIN_SUCCESSFUL_ATTEMPTS,
            tool_end_count: WEB_SEARCH_SYNTHESIS_MIN_SUCCESSFUL_ATTEMPTS,
            ..StreamEventDiagnostics::default()
        };
        assert!(!should_synthesize_web_search_after_enough_evidence(
            &policy, &tracker, &with_text
        ));

        let pending_tool = StreamEventDiagnostics {
            tool_start_count: WEB_SEARCH_SYNTHESIS_MIN_SUCCESSFUL_ATTEMPTS + 1,
            tool_end_count: WEB_SEARCH_SYNTHESIS_MIN_SUCCESSFUL_ATTEMPTS,
            ..StreamEventDiagnostics::default()
        };
        assert!(!should_synthesize_web_search_after_enough_evidence(
            &policy,
            &tracker,
            &pending_tool
        ));
    }

    #[test]
    fn required_web_search_synthesis_boundary_requires_successful_required_tool() {
        let policy = resolve_request_tool_policy_with_mode(
            Some(true),
            Some(RequestToolPolicyMode::Required),
        );
        let mut tracker = WebSearchExecutionTracker::default();
        for index in 0..WEB_SEARCH_SYNTHESIS_MIN_SUCCESSFUL_ATTEMPTS {
            let tool_id = format!("web-fetch-{index}");
            tracker.record_tool_start(&policy, &tool_id, "WebFetch");
            tracker.record_tool_end(&policy, &tool_id, true, None);
        }
        let diagnostics = StreamEventDiagnostics {
            tool_start_count: WEB_SEARCH_SYNTHESIS_MIN_SUCCESSFUL_ATTEMPTS,
            tool_end_count: WEB_SEARCH_SYNTHESIS_MIN_SUCCESSFUL_ATTEMPTS,
            ..StreamEventDiagnostics::default()
        };

        assert!(!should_synthesize_web_search_after_enough_evidence(
            &policy,
            &tracker,
            &diagnostics
        ));
    }

    #[test]
    fn web_retrieval_process_state_emits_once_after_web_tool_returns() {
        let mut state = WebRetrievalProcessState::default();

        state.observe_tool_start("tool-1", "WebSearch");
        assert!(!state.should_emit_synthesis_status());

        state.observe_tool_end("tool-1");
        assert!(state.should_emit_synthesis_status());
        let status = build_web_retrieval_synthesis_runtime_status(state.observed_completed_count);
        assert_eq!(status.phase, "synthesizing");
        assert_eq!(status.title, "正在整理联网结果");
        assert!(status.detail.contains("网页检索工具已返回结果"));

        state.mark_synthesis_status_emitted();
        assert!(!state.should_emit_synthesis_status());
    }

    #[test]
    fn web_retrieval_process_state_handles_item_lifecycle_without_double_counting() {
        let mut state = WebRetrievalProcessState::default();
        let item = completed_tool_item("web-item-1", 1);

        state.observe_tool_item(&item, false);
        state.observe_tool_item(&item, false);
        assert!(!state.should_emit_synthesis_status());

        state.observe_tool_item(&item, true);
        state.observe_tool_end("web-item-1");

        assert_eq!(state.observed_completed_count, 1);
        assert!(state.should_emit_synthesis_status());
    }

    #[test]
    fn web_retrieval_process_state_ignores_non_web_tools_and_final_text_started() {
        let mut state = WebRetrievalProcessState::default();
        state.observe_tool_start("tool-read", "Read");
        state.observe_tool_end("tool-read");
        assert!(!state.should_emit_synthesis_status());

        state.observe_tool_start("tool-fetch", "WebFetch");
        state.observe_text_delta("最终答复已经开始");
        state.observe_tool_end("tool-fetch");
        assert!(!state.should_emit_synthesis_status());
    }

    #[test]
    fn discarded_optional_preflight_attempt_should_not_force_synthesis_retry() {
        let diagnostics = StreamEventDiagnostics::default();

        let mode = resolve_reply_retry_mode(
            &PreflightToolExecution::none(),
            "",
            &WebSearchExecutionTracker::default(),
            &diagnostics,
            &[],
        );

        assert_eq!(mode, ReplyRetryMode::DirectAnswer);
    }

    #[test]
    fn empty_final_reply_with_only_tool_events_should_not_fallback() {
        let diagnostics = StreamEventDiagnostics {
            tool_start_count: 1,
            tool_end_count: 1,
            ..Default::default()
        };

        assert_eq!(build_empty_final_reply_fallback(&diagnostics, true), None);
    }

    #[test]
    fn empty_final_reply_without_any_emission_should_still_error() {
        let diagnostics = StreamEventDiagnostics::default();

        assert_eq!(build_empty_final_reply_fallback(&diagnostics, false), None);
    }

    #[test]
    fn empty_final_reply_with_saved_site_output_should_use_preserved_output_fallback() {
        let diagnostics = StreamEventDiagnostics {
            saved_site_content_count: 1,
            last_saved_markdown_path: Some("exports/x-article-export/article/index.md".to_string()),
            ..Default::default()
        };

        assert_eq!(
            build_empty_final_reply_fallback(&diagnostics, true).as_deref(),
            Some(
                "本轮站点内容已成功保存到项目文件中（Markdown：exports/x-article-export/article/index.md）。由于模型通道暂时不可用，未能补充最终总结；详细过程与产物已保留在当前对话中。"
            )
        );
    }

    #[test]
    fn empty_final_reply_without_tool_activity_should_report_precise_error() {
        let diagnostics = StreamEventDiagnostics::default();
        let tracker = WebSearchExecutionTracker::default();

        assert_eq!(
            build_empty_final_reply_error_message(&diagnostics, &tracker),
            "模型未输出最终答复，且未执行任何工具。\n尝试记录: 无工具调用"
        );
    }

    #[test]
    fn empty_final_reply_with_non_web_tools_should_not_claim_no_tool_calls() {
        let diagnostics = StreamEventDiagnostics {
            tool_start_count: 1,
            tool_end_count: 1,
            ..Default::default()
        };
        let tracker = WebSearchExecutionTracker::default();

        assert_eq!(
            build_empty_final_reply_error_message(&diagnostics, &tracker),
            "已完成当前回合的工具执行，但模型未输出最终答复。\n尝试记录: 已执行非联网工具（tool_start=1, tool_end=1）"
        );
    }

    #[test]
    fn provider_tail_failure_with_saved_site_content_should_downgrade() {
        let diagnostics = StreamEventDiagnostics {
            saved_site_content_count: 1,
            last_saved_markdown_path: Some("exports/x-article-export/article/index.md".to_string()),
            ..Default::default()
        };

        assert!(should_downgrade_provider_tail_failure(
            "Agent provider execution failed: Request failed: network timeout",
            &diagnostics,
            true,
        ));
        assert_eq!(
            build_output_preserved_reply_fallback(&diagnostics).as_deref(),
            Some(
                "本轮站点内容已成功保存到项目文件中（Markdown：exports/x-article-export/article/index.md）。由于模型通道暂时不可用，未能补充最终总结；详细过程与产物已保留在当前对话中。"
            )
        );
    }

    #[test]
    fn provider_tail_failure_with_persisted_artifact_should_downgrade() {
        let diagnostics = StreamEventDiagnostics {
            persisted_artifact_count: 1,
            last_persisted_artifact_path: Some("outputs/report.md".to_string()),
            ..Default::default()
        };

        assert!(should_downgrade_provider_tail_failure(
            "Agent provider execution failed: Request failed: channel unavailable",
            &diagnostics,
            true,
        ));
        assert_eq!(
            build_output_preserved_reply_fallback(&diagnostics).as_deref(),
            Some(
                "本轮输出文件已成功生成（文件：outputs/report.md）。由于模型通道暂时不可用，未能补充最终总结；详细过程与产物已保留在当前对话中。"
            )
        );
    }

    #[test]
    fn provider_tail_failure_without_persisted_output_should_not_downgrade() {
        let diagnostics = StreamEventDiagnostics {
            tool_end_count: 2,
            ..Default::default()
        };

        assert!(!should_downgrade_provider_tail_failure(
            "Agent provider execution failed: Request failed: network timeout",
            &diagnostics,
            true,
        ));
        assert_eq!(build_output_preserved_reply_fallback(&diagnostics), None);
    }

    #[test]
    fn text_delta_batcher_should_flush_on_newline_backlog_and_final() {
        let mut newline_batcher = TextDeltaBatcher::default();
        let first_event = newline_batcher
            .push("第一段".to_string())
            .expect("first text delta should flush immediately");
        assert!(matches!(
            first_event,
            RuntimeAgentEvent::TextDeltaBatch {
                ref text,
                ref chunks,
                boundary: TextDeltaBatchBoundary::Provider,
            } if text == "第一段" && chunks.len() == 1
        ));
        let newline_event = newline_batcher
            .push("\n".to_string())
            .expect("newline should flush batch");
        assert!(matches!(
            newline_event,
            RuntimeAgentEvent::TextDeltaBatch {
                ref text,
                ref chunks,
                boundary: TextDeltaBatchBoundary::Newline,
            } if text == "\n" && chunks.len() == 1
        ));

        let mut backlog_batcher = TextDeltaBatcher::default();
        let first_event = backlog_batcher
            .push("a".to_string())
            .expect("first text delta should flush before backlog batching");
        assert!(matches!(
            first_event,
            RuntimeAgentEvent::TextDeltaBatch {
                ref text,
                boundary: TextDeltaBatchBoundary::Provider,
                ..
            } if text == "a"
        ));
        let backlog_event = backlog_batcher
            .push("a".repeat(TEXT_DELTA_BATCH_BACKLOG_CHARS))
            .expect("backlog should flush batch");
        assert!(matches!(
            backlog_event,
            RuntimeAgentEvent::TextDeltaBatch {
                ref text,
                boundary: TextDeltaBatchBoundary::Backlog,
                ..
            } if text.chars().count() == TEXT_DELTA_BATCH_BACKLOG_CHARS
        ));

        let mut final_batcher = TextDeltaBatcher::default();
        let first_event = final_batcher
            .push("开头".to_string())
            .expect("first text delta should flush immediately");
        assert!(matches!(
            first_event,
            RuntimeAgentEvent::TextDeltaBatch {
                ref text,
                boundary: TextDeltaBatchBoundary::Provider,
                ..
            } if text == "开头"
        ));
        assert!(final_batcher.push("尾巴".to_string()).is_none());
        let final_event = final_batcher
            .flush(TextDeltaBatchBoundary::Final)
            .expect("final should flush pending text");
        assert!(matches!(
            final_event,
            RuntimeAgentEvent::TextDeltaBatch {
                ref text,
                boundary: TextDeltaBatchBoundary::Final,
                ..
            } if text == "尾巴"
        ));
    }

    #[test]
    fn appends_synthesis_instruction_without_duplication() {
        let merged =
            merge_system_prompt_with_web_search_synthesis_instruction(Some("base".to_string()))
                .expect("merged prompt should exist");
        assert!(merged.contains(WEB_SEARCH_SYNTHESIS_MARKER));
        assert!(merged.contains("不要再次调用 WebSearch"));

        let preserved =
            merge_system_prompt_with_web_search_synthesis_instruction(Some(merged.clone()))
                .expect("prompt should be preserved");
        assert_eq!(preserved, merged);
    }

    #[test]
    fn auto_compaction_projection_swallows_aster_compaction_system_notifications() {
        let mut state = AutoCompactionProjectionState;

        let start_events =
            state.project_event(&AutoCompactionEventProjection::SystemNotification {
                notification_type: AutoCompactionSystemNotificationKind::InlineMessage,
                text: "Exceeded auto-compact threshold of 80%. Performing auto-compaction..."
                    .to_string(),
            });
        assert!(matches!(start_events, Some(events) if events.is_empty()));

        let thinking_events = state
            .project_event(&AutoCompactionEventProjection::SystemNotification {
                notification_type: AutoCompactionSystemNotificationKind::ThinkingMessage,
                text: ASTER_AUTO_COMPACTION_THINKING_TEXT.to_string(),
            })
            .expect("应识别自动压缩 thinking 通知");
        assert!(thinking_events.is_empty());

        let complete_events = state
            .project_event(&AutoCompactionEventProjection::SystemNotification {
                notification_type: AutoCompactionSystemNotificationKind::InlineMessage,
                text: ASTER_AUTO_COMPACTION_COMPLETE_TEXT.to_string(),
            })
            .expect("应识别自动压缩完成通知");
        assert!(complete_events.is_empty());
    }

    #[test]
    fn auto_compaction_projection_surfaces_compaction_failure_as_error() {
        let mut state = AutoCompactionProjectionState;
        let _ = state.project_event(&AutoCompactionEventProjection::SystemNotification {
            notification_type: AutoCompactionSystemNotificationKind::InlineMessage,
            text: "Exceeded auto-compact threshold of 80%. Performing auto-compaction..."
                .to_string(),
        });

        let failure_events = state
            .project_event(&AutoCompactionEventProjection::Text {
                text: "Ran into this error trying to compact: context window exceeded.\n\nPlease try again or create a new session".to_string(),
            })
            .expect("应识别自动压缩失败事件");

        assert_eq!(failure_events.len(), 1);
        match &failure_events[0] {
            RuntimeAgentEvent::Error { message } => {
                assert_eq!(
                    message,
                    "自动压缩上下文失败，请重试或新建会话：context window exceeded"
                );
            }
            other => panic!("Expected compaction error event, got {other:?}"),
        }
    }

    #[test]
    fn auto_compaction_projection_surfaces_disabled_auto_compaction_limit_as_error() {
        let mut state = AutoCompactionProjectionState;

        let events = state
            .project_event(&AutoCompactionEventProjection::SystemNotification {
                notification_type: AutoCompactionSystemNotificationKind::InlineMessage,
                text: ASTER_AUTO_COMPACTION_DISABLED_TEXT.to_string(),
            })
            .expect("应识别自动压缩禁用后的上下文上限提示");

        assert_eq!(events.len(), 1);
        match &events[0] {
            RuntimeAgentEvent::Error { message } => {
                assert_eq!(
                    message,
                    "当前会话已达到上下文上限，但当前工作区已关闭自动压缩。请先手动压缩上下文或新建会话后重试。"
                );
            }
            other => panic!("Expected compaction disabled error event, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn stream_message_reply_with_policy_should_surface_disabled_auto_compaction_limit_from_aster(
    ) {
        let (store, session) = create_test_session_store("lime-auto-compact-disabled");
        let agent = Agent::new().with_session_store(store.clone());
        agent
            .update_provider(Arc::new(ContextLengthExceededProvider), &session.id)
            .await
            .expect("应配置测试 provider");

        let session_config = test_session_config_with_turn_context(
            &session.id,
            "turn-auto-compact-disabled",
            build_auto_compaction_disabled_turn_context(),
        );
        let policy = resolve_request_tool_policy(Some(false));
        let mut runtime_events = Vec::new();

        let error = stream_message_reply_with_policy(
            &agent,
            ReplyInput::text("继续处理"),
            None,
            session_config,
            None,
            &policy,
            |event| runtime_events.push(event.clone()),
        )
        .await
        .expect_err("禁用自动压缩时应透出上下文上限错误");

        assert_eq!(
            error.message,
            "当前会话已达到上下文上限，但当前工作区已关闭自动压缩。请先手动压缩上下文或新建会话后重试。"
        );
        assert!(
            runtime_events.iter().any(|event| matches!(
                event,
                RuntimeAgentEvent::Error { message }
                    if message
                        == "当前会话已达到上下文上限，但当前工作区已关闭自动压缩。请先手动压缩上下文或新建会话后重试。"
            )),
            "应向前端投影显式错误"
        );
        assert!(
            !runtime_events
                .iter()
                .any(|event| matches!(event, RuntimeAgentEvent::ContextCompactionStarted { .. })),
            "禁用自动压缩后，不应再投影 compaction started"
        );
        assert!(
            !runtime_events
                .iter()
                .any(|event| matches!(event, RuntimeAgentEvent::ContextCompactionCompleted { .. })),
            "禁用自动压缩后，不应再投影 compaction completed"
        );
    }

    #[tokio::test]
    async fn stream_message_reply_with_policy_should_retry_empty_reply_without_tool_activity() {
        let (store, session) = create_test_session_store("lime-empty-reply-retry");
        let agent = Agent::new().with_session_store(store.clone());
        let attempts = Arc::new(AtomicUsize::new(0));
        agent
            .update_provider(
                Arc::new(EmptyReplyThenTextProvider {
                    attempts: attempts.clone(),
                }),
                &session.id,
            )
            .await
            .expect("应配置测试 provider");

        let session_config = test_session_config(&session.id, "turn-empty-reply-retry");
        let policy = resolve_request_tool_policy(Some(false));
        let mut runtime_events = Vec::new();

        let reply = stream_message_reply_with_policy(
            &agent,
            ReplyInput::text("帮我总结一下这个项目"),
            None,
            session_config,
            None,
            &policy,
            |event| runtime_events.push(event.clone()),
        )
        .await
        .expect("空答复后应自动重试并成功");

        assert_eq!(reply.text_output, "这是补发的最终答复。");
        assert_eq!(attempts.load(Ordering::SeqCst), 2);
        assert!(
            runtime_events.iter().any(|event| matches!(
                event,
                RuntimeAgentEvent::RuntimeStatus { status }
                    if status.title == "正在重试生成答复"
            )),
            "应向前端投影空答复重试状态"
        );
    }

    #[tokio::test]
    async fn stream_message_reply_with_policy_should_retry_retryable_provider_tail_failure() {
        let (store, session) = create_test_session_store("lime-provider-tail-retry");
        let agent = Agent::new().with_session_store(store.clone());
        let attempts = Arc::new(AtomicUsize::new(0));
        agent
            .update_provider(
                Arc::new(TailFailureThenTextProvider {
                    attempts: attempts.clone(),
                }),
                &session.id,
            )
            .await
            .expect("应配置测试 provider");

        let session_config = test_session_config(&session.id, "turn-provider-tail-retry");
        let policy = resolve_request_tool_policy(Some(true));
        let mut runtime_events = Vec::new();

        let reply = stream_message_reply_with_policy(
            &agent,
            ReplyInput::text("整理今天的国际新闻"),
            None,
            session_config,
            None,
            &policy,
            |event| runtime_events.push(event.clone()),
        )
        .await
        .expect("尾段可重试 provider 失败后应续写成功");

        assert_eq!(attempts.load(Ordering::SeqCst), 2);
        assert_eq!(reply.text_output, "已完成搜索，最终摘要已补齐。");
        assert!(runtime_events.iter().any(|event| matches!(
            event,
            RuntimeAgentEvent::RuntimeStatus { status }
                if status.title == "正在恢复模型输出"
        )));
    }

    #[tokio::test]
    async fn stream_message_reply_with_policy_should_return_cancelled_without_waiting_next_chunk() {
        let (store, session) = create_test_session_store("lime-stream-cancel");
        let agent = Agent::new().with_session_store(store.clone());
        agent
            .update_provider(Arc::new(SlowStreamingProvider), &session.id)
            .await
            .expect("应配置测试 provider");

        let session_config = test_session_config(&session.id, "turn-stream-cancel");
        let policy = resolve_request_tool_policy(Some(false));
        let cancel_token = CancellationToken::new();
        let cancel_from_event = cancel_token.clone();

        let reply = tokio::time::timeout(
            Duration::from_secs(10),
            stream_message_reply_with_policy(
                &agent,
                ReplyInput::text("请流式输出"),
                None,
                session_config,
                Some(cancel_token),
                &policy,
                |event| {
                    if matches!(
                        event,
                        RuntimeAgentEvent::TextDeltaBatch { text, .. } if text == "第一段"
                    ) || matches!(event, RuntimeAgentEvent::TextDelta { text } if text == "第一段")
                    {
                        cancel_from_event.cancel();
                    }
                },
            ),
        )
        .await
        .expect("取消后不应继续等待 provider 下一段")
        .expect("取消应作为可识别执行结果返回");

        assert!(reply.cancelled);
        assert!(
            !reply.text_output.contains("第二段"),
            "取消后不应等待或拼接 provider 的后续分片"
        );

        let stored_session = store
            .get_session(&session.id, true)
            .await
            .expect("应读取取消后的 session");
        let stored_conversation = stored_session.conversation.expect("应有会话上下文");
        let stored_messages = stored_conversation.iter().collect::<Vec<_>>();
        assert_eq!(
            stored_messages
                .iter()
                .filter(|message| message.is_user_visible())
                .count(),
            1,
            "取消上下文标记不应作为普通用户消息展示"
        );
        assert!(
            stored_messages.iter().any(|message| {
                !message.is_user_visible()
                    && message.is_agent_visible()
                    && message.as_concat_text().contains("上一回合已被用户停止")
            }),
            "取消后应写入仅 Agent 可见的上下文标记，避免下一轮继续回答已停止请求"
        );
    }

    #[tokio::test]
    async fn stream_message_reply_with_policy_should_drain_inline_provider_error_and_mark_turn_failed(
    ) {
        let (store, session) = create_test_session_store("lime-inline-provider-error");
        let agent = Agent::new().with_session_store(store.clone());
        agent
            .update_provider(Arc::new(AuthenticationErrorProvider), &session.id)
            .await
            .expect("应配置测试 provider");

        let session_config = test_session_config(&session.id, "turn-inline-provider-error");
        let policy = resolve_request_tool_policy(Some(false));
        let mut runtime_events = Vec::new();

        let error = stream_message_reply_with_policy(
            &agent,
            ReplyInput::text("你好，回复1"),
            None,
            session_config,
            None,
            &policy,
            |event| runtime_events.push(event.clone()),
        )
        .await
        .expect_err("鉴权失败时应返回 provider 执行错误");

        assert!(error.message.contains("Agent provider execution failed"));
        assert!(error.message.contains("Authentication failed"));
        assert!(
            !runtime_events.iter().any(|event| matches!(
                event,
                RuntimeAgentEvent::TextDelta { text }
                    if text.contains("Ran into this error:")
                        && text.contains("Authentication failed")
            )),
            "不应把底层 provider inline 错误文本透传给前端"
        );

        let snapshot = agent
            .runtime_snapshot(&session.id)
            .await
            .expect("应读取 runtime snapshot");
        let latest_turn = snapshot
            .threads
            .iter()
            .flat_map(|thread| thread.turns.iter())
            .max_by_key(|turn| turn.updated_at.timestamp_millis())
            .expect("应存在 runtime turn");

        assert_ne!(latest_turn.status, TurnStatus::Running);
        assert!(
            matches!(
                latest_turn.status,
                TurnStatus::Completed | TurnStatus::Failed
            ),
            "turn 至少应进入终态，不能继续停留在 running"
        );
    }
}
