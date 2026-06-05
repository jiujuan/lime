use super::super::super::reply_runtime::{build_runtime_user_message, stream_reply_once};
use super::super::runtime_turn_artifact_materialization::{
    materialize_agent_app_output_contract_artifact_after_stream,
    maybe_persist_artifact_document_after_stream,
};
use super::super::runtime_turn_image_policy::{
    build_runtime_image_input_unsupported_warning,
    merge_runtime_image_input_unsupported_system_prompt, resolve_runtime_forwarded_images,
};
use super::super::runtime_turn_memory::spawn_runtime_memory_capture_task;
use super::events::{
    record_runtime_stream_event, RuntimeStreamEventContext, RuntimeStreamTiming,
    RuntimeToolProfileState, TauriRuntimeStreamTimelineEventPort,
};
use super::*;
use crate::database::lock_db;
use lime_agent::request_tool_policy::{ReplyAttemptError, StreamReplyExecution};
use lime_core::database::dao::agent_timeline::{AgentThreadItem, AgentTimelineDao};
use std::path::Path;

fn normalize_agent_message_phase(phase: Option<&str>) -> Option<String> {
    let normalized = phase.map(str::trim).filter(|value| !value.is_empty())?;
    Some(normalized.to_ascii_lowercase())
}

fn resolve_final_agent_message_text_from_items(
    items: &[AgentThreadItem],
    turn_id: &str,
) -> Option<String> {
    let mut explicit_final_texts = Vec::new();
    let mut legacy_final_candidate: Option<(i64, &str)> = None;

    for item in items.iter().filter(|item| item.turn_id == turn_id) {
        let AgentThreadItemPayload::AgentMessage { text, phase } = &item.payload else {
            continue;
        };
        let trimmed = text.trim();
        if trimmed.is_empty() {
            continue;
        }

        match normalize_agent_message_phase(phase.as_deref()).as_deref() {
            Some("final_answer") => explicit_final_texts.push((item.sequence, trimmed)),
            Some(_) => {}
            None => match legacy_final_candidate {
                Some((sequence, _)) if sequence > item.sequence => {}
                _ => legacy_final_candidate = Some((item.sequence, trimmed)),
            },
        }
    }

    if !explicit_final_texts.is_empty() {
        explicit_final_texts.sort_by_key(|(sequence, _)| *sequence);
        let final_text = explicit_final_texts
            .into_iter()
            .map(|(_, text)| text)
            .collect::<Vec<_>>()
            .join("\n\n");
        return Some(final_text).filter(|text| !text.trim().is_empty());
    }

    legacy_final_candidate.map(|(_, text)| text.to_string())
}

fn resolve_runtime_turn_final_text_output(
    db: &DbConnection,
    thread_id: &str,
    turn_id: &str,
    fallback_text_output: &str,
) -> String {
    let fallback = fallback_text_output.to_string();
    let Ok(conn) = lock_db(db) else {
        return fallback;
    };
    let Ok(items) = AgentTimelineDao::list_items_by_thread(&conn, thread_id) else {
        return fallback;
    };

    resolve_final_agent_message_text_from_items(&items, turn_id).unwrap_or(fallback)
}

pub(super) struct RuntimeStreamAttemptContext<'a> {
    pub(super) event_port: Arc<dyn crate::agent::runtime_queue_service::RuntimeQueueEventPort>,
    pub(super) host: RuntimeStreamAttemptHostContext<'a>,
    pub(super) timeline_recorder: &'a Arc<Mutex<AgentTimelineRecorder>>,
    pub(super) run_observation: &'a Arc<Mutex<ChatRunObservation>>,
    pub(super) runtime_memory_config: &'a lime_core::config::MemoryConfig,
    pub(super) session_id: &'a str,
    pub(super) workspace_root: &'a str,
    pub(super) workspace_id: &'a str,
    pub(super) thread_id: &'a str,
    pub(super) turn_id: &'a str,
    pub(super) execution_profile: TurnExecutionProfile,
    pub(super) request_metadata: Option<&'a serde_json::Value>,
    pub(super) provider_continuation_capability: ProviderContinuationCapability,
    pub(super) profile_stream: AgentRuntimeProfileStream,
    pub(super) cancel_token: CancellationToken,
    pub(super) request_tool_policy: &'a RequestToolPolicy,
}

#[derive(Clone, Copy)]
pub(super) struct RuntimeStreamAttemptHostContext<'a> {
    pub(super) app: &'a AppHandle,
    pub(super) db: &'a DbConnection,
}

fn finalize_runtime_stream_success(
    context: &RuntimeStreamAttemptContext<'_>,
    event_name: &str,
    user_message: &str,
    execution: &StreamReplyExecution,
) -> String {
    let final_text_output = resolve_runtime_turn_final_text_output(
        context.host.db,
        context.thread_id,
        context.turn_id,
        execution.text_output.as_str(),
    );
    materialize_agent_app_output_contract_artifact_after_stream(
        context.host.app,
        event_name,
        context.timeline_recorder,
        context.run_observation,
        context.workspace_root,
        context.thread_id,
        context.turn_id,
        context.request_metadata,
        final_text_output.as_str(),
    );
    maybe_persist_artifact_document_after_stream(
        context.host.app,
        context.host.db,
        event_name,
        context.timeline_recorder,
        context.run_observation,
        context.workspace_root,
        context.workspace_id,
        context.thread_id,
        context.turn_id,
        context.execution_profile,
        context.request_metadata,
        final_text_output.as_str(),
    );
    spawn_runtime_memory_capture_task(
        context.host.app,
        context.host.db,
        context.runtime_memory_config.clone(),
        context.session_id,
        user_message,
        final_text_output.as_str(),
    );

    final_text_output
}

pub(super) async fn execute_runtime_stream_attempt(
    context: &RuntimeStreamAttemptContext<'_>,
    agent: &Agent,
    request: &AsterChatRequest,
    mut session_config: aster::agents::types::SessionConfig,
) -> Result<String, ReplyAttemptError> {
    let side_event_host = RuntimeSideEventHostContext::new(
        context.host.app,
        &request.event_name,
        context.timeline_recorder,
        context.workspace_root,
    );
    if let Some(warning_event) = build_runtime_image_input_unsupported_warning(request) {
        side_event_host.emit_side_event(warning_event);
    }
    session_config.system_prompt = merge_runtime_image_input_unsupported_system_prompt(
        session_config.system_prompt.take(),
        request,
    );
    let images_for_provider = resolve_runtime_forwarded_images(request);
    let stream_timing = RuntimeStreamTiming::new();
    let (provider_selector, provider_name, model_name) = describe_provider_request_attempt(request);
    let projection_port = TauriRuntimeProjectionEventPort::new(context.host.app);
    emit_agent_runtime_profile_event_with_port(
        &projection_port,
        &request.event_name,
        context
            .profile_stream
            .model_requested(&provider_selector, &provider_name, &model_name),
    );
    let tool_profile_state = Arc::new(Mutex::new(RuntimeToolProfileState::default()));

    let execution = match stream_reply_once(
        agent,
        context.host.app,
        &request.event_name,
        build_runtime_user_message(&request.message, images_for_provider),
        Some(Path::new(context.workspace_root)),
        session_config,
        context.cancel_token.clone(),
        context.request_tool_policy,
        {
            let run_observation = context.run_observation.clone();
            let app = context.host.app.clone();
            let event_name = request.event_name.clone();
            let timeline_recorder = context.timeline_recorder.clone();
            let stream_timing = stream_timing.clone();
            let profile_stream = context.profile_stream.clone();
            let tool_profile_state = tool_profile_state.clone();
            let event_port = context.event_port.clone();
            let workspace_root = context.workspace_root.to_string();
            let timeline_port = TauriRuntimeStreamTimelineEventPort::new(
                app.clone(),
                event_name.clone(),
                timeline_recorder.clone(),
                workspace_root.clone(),
            );
            let request_metadata = context.request_metadata;
            let provider_continuation_capability = context.provider_continuation_capability;
            move |event| {
                record_runtime_stream_event(
                    RuntimeStreamEventContext {
                        event_port: event_port.as_ref(),
                        projection_port: &projection_port,
                        timeline_port: &timeline_port,
                        run_observation: &run_observation,
                        event_name: &event_name,
                        workspace_root: workspace_root.as_str(),
                        request_metadata,
                        provider_continuation_capability,
                        stream_timing: &stream_timing,
                        profile_stream: &profile_stream,
                        tool_profile_state: &tool_profile_state,
                    },
                    event,
                )
            }
        },
    )
    .await
    {
        Ok(execution) => execution,
        Err(error) => {
            emit_agent_runtime_profile_event_with_port(
                &projection_port,
                &request.event_name,
                context.profile_stream.model_failed(
                    &provider_selector,
                    &provider_name,
                    &model_name,
                    profile_failure_category(&error.message),
                    &error.message,
                    true,
                ),
            );
            return Err(error);
        }
    };

    if execution.cancelled {
        emit_agent_runtime_profile_event_with_port(
            &projection_port,
            &request.event_name,
            context.profile_stream.model_failed(
                &provider_selector,
                &provider_name,
                &model_name,
                "cancelled",
                RUNTIME_TURN_CANCELLED_MESSAGE,
                false,
            ),
        );
        tracing::info!(
            "[AsterAgent] runtime turn cancelled before success finalization: session_id={}, event_name={}, emitted_any={}",
            context.session_id,
            request.event_name,
            execution.emitted_any
        );
        return Err(ReplyAttemptError {
            message: RUNTIME_TURN_CANCELLED_MESSAGE.to_string(),
            emitted_any: execution.emitted_any,
        });
    }

    let final_text_output =
        finalize_runtime_stream_success(context, &request.event_name, &request.message, &execution);

    emit_agent_runtime_profile_event_with_port(
        &projection_port,
        &request.event_name,
        context.profile_stream.model_completed(
            &provider_selector,
            &provider_name,
            &model_name,
            final_text_output.chars().count(),
        ),
    );

    Ok(final_text_output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use lime_core::database::dao::agent_timeline::AgentThreadItemStatus;

    fn agent_message_item(
        id: &str,
        sequence: i64,
        text: &str,
        phase: Option<&str>,
    ) -> AgentThreadItem {
        AgentThreadItem {
            id: id.to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence,
            status: AgentThreadItemStatus::Completed,
            started_at: "2026-06-02T10:00:00.000Z".to_string(),
            completed_at: Some("2026-06-02T10:00:01.000Z".to_string()),
            updated_at: "2026-06-02T10:00:01.000Z".to_string(),
            payload: AgentThreadItemPayload::AgentMessage {
                text: text.to_string(),
                phase: phase.map(str::to_string),
            },
        }
    }

    #[test]
    fn final_text_selection_prefers_explicit_final_answer_phase() {
        let items = vec![
            agent_message_item("process", 2, "先检索来源。", Some("commentary")),
            agent_message_item("final", 4, "## 最终简报", Some("final_answer")),
        ];

        assert_eq!(
            resolve_final_agent_message_text_from_items(&items, "turn-1").as_deref(),
            Some("## 最终简报")
        );
    }

    #[test]
    fn final_text_selection_uses_last_legacy_unphased_agent_message() {
        let items = vec![
            agent_message_item("process-search", 2, "先检索来源。", None),
            agent_message_item("process-fetch", 4, "再交叉核对。", None),
            agent_message_item("final", 6, "## 今日国际新闻简报", None),
        ];

        assert_eq!(
            resolve_final_agent_message_text_from_items(&items, "turn-1").as_deref(),
            Some("## 今日国际新闻简报")
        );
    }
}
