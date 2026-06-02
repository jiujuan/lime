use super::attempt::execute_runtime_stream_attempt;
use super::finalize::is_runtime_turn_cancelled_error;
use super::*;

#[allow(clippy::too_many_arguments)]
pub(in crate::commands::aster_agent_cmd::runtime_turn) async fn execute_runtime_stream_with_strategy<
    F,
>(
    agent: &Agent,
    app: &AppHandle,
    state: &AsterAgentState,
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
    cancel_token: CancellationToken,
    request_tool_policy: &RequestToolPolicy,
    _effective_strategy: AsterExecutionStrategy,
    build_session_config: F,
) -> Result<String, String>
where
    F: Fn() -> aster::agents::types::SessionConfig,
{
    let primary_attempt_started_at = Instant::now();
    let (primary_provider_selector, primary_provider_name, primary_model_name) =
        describe_provider_request_attempt(request);
    tracing::info!(
        "[AsterAgent][TTFT] runtime stream primary attempt start: session_id={}, event_name={}, provider_selector={}, provider_name={}, model={}",
        session_id,
        request.event_name,
        primary_provider_selector,
        primary_provider_name,
        primary_model_name
    );
    let primary_result = execute_runtime_stream_attempt(
        agent,
        app,
        db,
        request,
        timeline_recorder,
        run_observation,
        runtime_memory_config,
        session_id,
        workspace_root,
        workspace_id,
        thread_id,
        turn_id,
        execution_profile,
        request_metadata,
        provider_continuation_capability,
        profile_stream.clone(),
        build_session_config(),
        cancel_token.clone(),
        request_tool_policy,
    )
    .await;

    let run_result = match primary_result {
        Ok(assistant_output) => {
            tracing::info!(
                "[AsterAgent][TTFT] runtime stream primary attempt success: session_id={}, event_name={}, provider_selector={}, provider_name={}, model={}, elapsed_ms={}",
                session_id,
                request.event_name,
                primary_provider_selector,
                primary_provider_name,
                primary_model_name,
                primary_attempt_started_at.elapsed().as_millis()
            );
            Ok(assistant_output)
        }
        Err(primary_error) if is_runtime_turn_cancelled_error(&primary_error.message) => {
            Err(primary_error.message)
        }
        Err(primary_error) if is_runtime_model_unavailable_error(&primary_error.message) => {
            let recovery_result: Result<Option<String>, String> = async {
                let Some(provider_config) = request.provider_config.as_ref() else {
                    return Ok(None);
                };
                let provider_selector = provider_config
                    .provider_id
                    .as_deref()
                    .unwrap_or(&provider_config.provider_name)
                    .trim();
                if provider_selector.is_empty() {
                    return Ok(None);
                }

                let api_key_provider_service = app.state::<ApiKeyProviderServiceState>();
                let Some(fallback_provider_config) = resolve_runtime_provider_model_recovery_config(
                    app,
                    db,
                    api_key_provider_service.inner(),
                    request,
                    provider_selector,
                    &provider_config.model_name,
                )
                .await?
                else {
                    return Ok(None);
                };

                tracing::warn!(
                    "[AsterAgent] 模型不可用，自动回退同 provider 候选: session={}, provider={}, failed_model={}, fallback_model={}",
                    session_id,
                    provider_selector,
                    provider_config.model_name,
                    fallback_provider_config.model_name
                );
                emit_runtime_side_event(
                    app,
                    &request.event_name,
                    timeline_recorder,
                    workspace_root,
                    RuntimeAgentEvent::Warning {
                        code: Some(RUNTIME_MODEL_PERMISSION_FALLBACK_WARNING_CODE.to_string()),
                        message: format!(
                            "当前模型暂不可用，已自动切换到同 Provider 的兼容候选模型 `{}` 后重试。",
                            fallback_provider_config.model_name
                        ),
                    },
                );

                apply_runtime_turn_provider_config(
                    state,
                    db,
                    session_id,
                    Some(&fallback_provider_config),
                )
                .await?;

                let mut fallback_request = request.clone();
                fallback_request.provider_config = Some(fallback_provider_config);
                let (fallback_provider_selector, fallback_provider_name, fallback_model_name) =
                    describe_provider_request_attempt(&fallback_request);
                let fallback_attempt_started_at = Instant::now();
                tracing::info!(
                    "[AsterAgent][TTFT] runtime stream model recovery attempt start: session_id={}, event_name={}, provider_selector={}, provider_name={}, failed_model={}, fallback_model={}",
                    session_id,
                    request.event_name,
                    fallback_provider_selector,
                    fallback_provider_name,
                    provider_config.model_name,
                    fallback_model_name
                );

                match execute_runtime_stream_attempt(
                    agent,
                    app,
                    db,
                    &fallback_request,
                    timeline_recorder,
                    run_observation,
                    runtime_memory_config,
                    session_id,
                    workspace_root,
                    workspace_id,
                    thread_id,
                    turn_id,
                    execution_profile,
                    request_metadata,
                    provider_continuation_capability,
                    profile_stream.clone(),
                    build_session_config(),
                    cancel_token.clone(),
                    request_tool_policy,
                )
                .await
                {
                    Ok(assistant_output) => {
                        tracing::info!(
                            "[AsterAgent][TTFT] runtime stream model recovery attempt success: session_id={}, event_name={}, provider_selector={}, provider_name={}, failed_model={}, fallback_model={}, elapsed_ms={}",
                            session_id,
                            request.event_name,
                            fallback_provider_selector,
                            fallback_provider_name,
                            provider_config.model_name,
                            fallback_model_name,
                            fallback_attempt_started_at.elapsed().as_millis()
                        );
                        Ok(Some(assistant_output))
                    }
                    Err(fallback_error) => {
                        let fallback_message =
                            build_runtime_model_recovery_failure_message(
                                &provider_config.model_name,
                                &fallback_model_name,
                                &fallback_error.message,
                            );
                        tracing::warn!(
                            "[AsterAgent][TTFT] runtime stream model recovery attempt failed: session_id={}, event_name={}, provider_selector={}, provider_name={}, failed_model={}, fallback_model={}, elapsed_ms={}, error={}",
                            session_id,
                            request.event_name,
                            fallback_provider_selector,
                            fallback_provider_name,
                            provider_config.model_name,
                            fallback_model_name,
                            fallback_attempt_started_at.elapsed().as_millis(),
                            fallback_error.message
                        );
                        emit_runtime_side_event(
                            app,
                            &request.event_name,
                            timeline_recorder,
                            workspace_root,
                            RuntimeAgentEvent::Warning {
                                code: Some(
                                    RUNTIME_MODEL_PERMISSION_FALLBACK_FAILED_WARNING_CODE
                                        .to_string(),
                                ),
                                message: fallback_message.clone(),
                            },
                        );
                        Err(fallback_message)
                    }
                }
            }
            .await;

            match recovery_result {
                Ok(Some(assistant_output)) => Ok(assistant_output),
                Ok(None) => Err(primary_error.message),
                Err(recovery_error) => Err(recovery_error),
            }
        }
        Err(primary_error) => Err(primary_error.message),
    };

    run_result
}
