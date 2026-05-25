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
use super::events::{record_runtime_stream_event, RuntimeStreamTiming, RuntimeToolProfileState};
use super::*;
use lime_agent::request_tool_policy::{ReplyAttemptError, StreamReplyExecution};
use std::path::Path;

#[allow(clippy::too_many_arguments)]
fn finalize_runtime_stream_success(
    app: &AppHandle,
    db: &DbConnection,
    event_name: &str,
    timeline_recorder: &Arc<Mutex<AgentTimelineRecorder>>,
    run_observation: &Arc<Mutex<ChatRunObservation>>,
    runtime_memory_config: &lime_core::config::MemoryConfig,
    session_id: &str,
    user_message: &str,
    workspace_root: &str,
    workspace_id: &str,
    thread_id: &str,
    turn_id: &str,
    execution_profile: TurnExecutionProfile,
    request_metadata: Option<&serde_json::Value>,
    execution: &StreamReplyExecution,
) {
    materialize_agent_app_output_contract_artifact_after_stream(
        app,
        event_name,
        timeline_recorder,
        run_observation,
        workspace_root,
        thread_id,
        turn_id,
        request_metadata,
        execution.text_output.as_str(),
    );
    maybe_persist_artifact_document_after_stream(
        app,
        db,
        event_name,
        timeline_recorder,
        run_observation,
        workspace_root,
        workspace_id,
        thread_id,
        turn_id,
        execution_profile,
        request_metadata,
        execution.text_output.as_str(),
    );
    spawn_runtime_memory_capture_task(
        app,
        db,
        runtime_memory_config.clone(),
        session_id,
        user_message,
        execution.text_output.as_str(),
    );
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn execute_runtime_stream_attempt(
    agent: &Agent,
    app: &AppHandle,
    db: &DbConnection,
    request: &AsterChatRequest,
    timeline_recorder: &Arc<Mutex<AgentTimelineRecorder>>,
    run_observation: &Arc<Mutex<ChatRunObservation>>,
    runtime_memory_config: &lime_core::config::MemoryConfig,
    session_id: &str,
    workspace_root: &str,
    workspace_id: &str,
    thread_id: &str,
    turn_id: &str,
    execution_profile: TurnExecutionProfile,
    request_metadata: Option<&serde_json::Value>,
    provider_continuation_capability: ProviderContinuationCapability,
    profile_stream: AgentRuntimeProfileStream,
    mut session_config: aster::agents::types::SessionConfig,
    cancel_token: CancellationToken,
    request_tool_policy: &RequestToolPolicy,
) -> Result<String, ReplyAttemptError> {
    if let Some(warning_event) = build_runtime_image_input_unsupported_warning(request) {
        emit_runtime_side_event(
            app,
            &request.event_name,
            timeline_recorder,
            workspace_root,
            warning_event,
        );
    }
    session_config.system_prompt = merge_runtime_image_input_unsupported_system_prompt(
        session_config.system_prompt.take(),
        request,
    );
    let images_for_provider = resolve_runtime_forwarded_images(request);
    let stream_timing = RuntimeStreamTiming::new();
    let (provider_selector, provider_name, model_name) = describe_provider_request_attempt(request);
    emit_agent_runtime_profile_event(
        app,
        &request.event_name,
        profile_stream.model_requested(&provider_selector, &provider_name, &model_name),
    );
    let tool_profile_state = Arc::new(Mutex::new(RuntimeToolProfileState::default()));

    let execution = match stream_reply_once(
        agent,
        app,
        &request.event_name,
        build_runtime_user_message(&request.message, images_for_provider),
        Some(Path::new(workspace_root)),
        session_config,
        cancel_token,
        request_tool_policy,
        {
            let run_observation = run_observation.clone();
            let app = app.clone();
            let event_name = request.event_name.clone();
            let timeline_recorder = timeline_recorder.clone();
            let stream_timing = stream_timing.clone();
            let profile_stream = profile_stream.clone();
            let tool_profile_state = tool_profile_state.clone();
            move |event| {
                record_runtime_stream_event(
                    &run_observation,
                    &app,
                    &event_name,
                    &timeline_recorder,
                    workspace_root,
                    request_metadata,
                    provider_continuation_capability,
                    &stream_timing,
                    &profile_stream,
                    &tool_profile_state,
                    event,
                )
            }
        },
    )
    .await
    {
        Ok(execution) => execution,
        Err(error) => {
            emit_agent_runtime_profile_event(
                app,
                &request.event_name,
                profile_stream.model_failed(
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
        emit_agent_runtime_profile_event(
            app,
            &request.event_name,
            profile_stream.model_failed(
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
            session_id,
            request.event_name,
            execution.emitted_any
        );
        return Err(ReplyAttemptError {
            message: RUNTIME_TURN_CANCELLED_MESSAGE.to_string(),
            emitted_any: execution.emitted_any,
        });
    }

    finalize_runtime_stream_success(
        app,
        db,
        &request.event_name,
        timeline_recorder,
        run_observation,
        runtime_memory_config,
        session_id,
        &request.message,
        workspace_root,
        workspace_id,
        thread_id,
        turn_id,
        execution_profile,
        request_metadata,
        &execution,
    );

    emit_agent_runtime_profile_event(
        app,
        &request.event_name,
        profile_stream.model_completed(
            &provider_selector,
            &provider_name,
            &model_name,
            execution.text_output.chars().count(),
        ),
    );

    Ok(execution.text_output)
}
