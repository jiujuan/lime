use super::*;

#[allow(clippy::too_many_arguments)]
async fn build_runtime_turn_artifacts(
    agent_arc: &Arc<tokio::sync::RwLock<Option<Agent>>>,
    session_id: &str,
    workspace_id: &str,
    resolved_turn_id: &str,
    execution_profile: TurnExecutionProfile,
    requested_strategy: AsterExecutionStrategy,
    effective_strategy: AsterExecutionStrategy,
    request_tool_policy: &RequestToolPolicy,
    include_context_trace: bool,
    runtime_chat_mode: RuntimeChatMode,
    system_prompt_source: TurnSystemPromptSource,
    mut turn_input_builder: TurnInputEnvelopeBuilder,
) -> Result<RuntimeTurnBuildArtifacts, String> {
    let runtime_snapshot = {
        let guard = agent_arc.read().await;
        let agent = guard.as_ref().ok_or("Agent not initialized")?;
        match agent.runtime_snapshot(session_id).await {
            Ok(snapshot) => Some(snapshot),
            Err(error) => {
                tracing::warn!(
                    "[AsterAgent] 提交 turn 前读取 runtime snapshot 失败: session_id={}, error={}",
                    session_id,
                    error
                );
                None
            }
        }
    };
    let runtime_projection_snapshot =
        RuntimeProjectionSnapshot::from_snapshot(session_id, runtime_snapshot.as_ref());
    if matches!(execution_profile, TurnExecutionProfile::FullRuntime) {
        tracing::info!(
            "[AsterAgent] runtime_projection_snapshot={}",
            serde_json::to_string(&runtime_projection_snapshot)
                .unwrap_or_else(|_| "{}".to_string())
        );
    }
    let resolved_thread_id = runtime_projection_snapshot
        .primary_thread_id()
        .map(str::to_string)
        .unwrap_or_else(|| session_id.to_string());
    let turn_state = TurnState::new(
        session_id,
        workspace_id,
        resolved_thread_id,
        resolved_turn_id,
        execution_profile,
        requested_strategy.as_db_value(),
        effective_strategy.as_db_value(),
        TurnRequestToolPolicySnapshot::from(request_tool_policy),
        include_context_trace,
        runtime_chat_mode_label(runtime_chat_mode),
    );
    turn_input_builder
        .set_thread_id(turn_state.thread_id.clone())
        .set_turn_id(turn_state.turn_id.clone());
    let turn_input_envelope = turn_input_builder.build();
    let turn_input_diagnostics = turn_input_envelope.diagnostics_snapshot();
    if matches!(execution_profile, TurnExecutionProfile::FullRuntime) {
        tracing::info!(
            "[AsterAgent] turn_state={}",
            serde_json::to_string(&turn_state).unwrap_or_else(|_| "{}".to_string())
        );
        tracing::info!(
            "[AsterAgent] turn_input_envelope={}",
            serde_json::to_string(&turn_input_diagnostics).unwrap_or_else(|_| "{}".to_string())
        );
    } else {
        tracing::info!(
            "[AsterAgent] fast_turn_summary={}",
            serde_json::json!({
                "session_id": session_id,
                "workspace_id": workspace_id,
                "thread_id": turn_state.thread_id.clone(),
                "turn_id": turn_state.turn_id.clone(),
                "execution_profile": execution_profile,
                "requested_execution_strategy": requested_strategy.as_db_value(),
                "effective_execution_strategy": effective_strategy.as_db_value(),
                "system_prompt_source": system_prompt_source,
                "final_system_prompt_len": turn_input_diagnostics.final_system_prompt_len,
                "has_turn_context_metadata": turn_input_diagnostics.has_turn_context_metadata,
            })
        );
    }

    Ok(RuntimeTurnBuildArtifacts {
        runtime_projection_snapshot,
        turn_state,
        turn_input_envelope,
        turn_input_diagnostics,
    })
}

fn build_runtime_turn_execution_context(
    db: &DbConnection,
    request: &AsterChatRequest,
    session_id: &str,
    workspace_id: &str,
    effective_strategy: AsterExecutionStrategy,
    request_tool_policy: &RequestToolPolicy,
    auto_continue_enabled: bool,
    auto_continue_metadata: Option<&AutoContinuePayload>,
    session_recent_preferences: Option<&lime_agent::SessionExecutionRuntimePreferences>,
    session_state_snapshot: &SessionStateSnapshot,
    runtime_projection_snapshot: &RuntimeProjectionSnapshot,
    turn_state: &TurnState,
    turn_input_system_prompt: Option<String>,
    turn_input_include_context_trace: bool,
    turn_input_turn_context_override: Option<TurnContextOverride>,
    turn_input_diagnostics: &lime_agent::TurnDiagnosticsSnapshot,
    service_skill_preload: Option<&ServiceSkillLaunchPreloadExecution>,
) -> Result<RuntimeTurnExecutionContext, String> {
    let system_prompt_override = should_override_system_prompt_for_fast_response(
        turn_state.execution_profile,
        turn_input_diagnostics.system_prompt_source,
        turn_input_system_prompt.as_deref(),
        request.metadata.as_ref(),
    );
    if matches!(turn_state.execution_profile, TurnExecutionProfile::FastChat) {
        tracing::info!(
            "[AsterAgent] fast_response_prompt_override={}",
            serde_json::json!({
                "session_id": session_id,
                "thread_id": turn_state.thread_id.as_str(),
                "turn_id": turn_state.turn_id.as_str(),
                "enabled": system_prompt_override,
                "fast_response_routing": request_metadata_has_fast_response_routing(request.metadata.as_ref()),
                "system_prompt_source": turn_input_diagnostics.system_prompt_source,
                "system_prompt_len": turn_input_diagnostics.final_system_prompt_len,
            })
        );
    }
    let run_start_metadata = build_runtime_run_start_metadata(
        request,
        workspace_id,
        effective_strategy,
        request_tool_policy,
        auto_continue_enabled,
        auto_continue_metadata,
        session_recent_preferences,
        session_state_snapshot,
        runtime_projection_snapshot,
        turn_state,
        turn_input_diagnostics,
        service_skill_preload,
    );
    let timeline_recorder = Arc::new(Mutex::new(AgentTimelineRecorder::create(
        db.clone(),
        turn_state.thread_id.clone(),
        turn_state.turn_id.clone(),
        request.message.clone(),
    )?));
    let runtime_status_session_config = build_runtime_session_config(
        session_id,
        &turn_state.thread_id,
        &turn_state.turn_id,
        None,
        false,
        None,
        turn_input_turn_context_override.clone(),
    );
    let profile_stream = AgentRuntimeProfileStream::new(
        session_id,
        turn_state.thread_id.clone(),
        turn_state.turn_id.clone(),
    )?;
    let task_profile = extract_runtime_resolution_payload::<
        lime_agent::SessionExecutionRuntimeTaskProfile,
    >(request.metadata.as_ref(), "task_profile");
    let task_profile_refs = build_runtime_turn_task_profile_refs(
        &turn_state.thread_id,
        &turn_state.turn_id,
        turn_state.execution_profile,
        task_profile.as_ref(),
    );

    Ok(RuntimeTurnExecutionContext {
        run_start_metadata,
        run_observation: Arc::new(Mutex::new(ChatRunObservation::default())),
        timeline_recorder,
        profile_stream,
        task_profile_refs,
        runtime_status_session_config,
        stream_session_config_state: RuntimeTurnStreamSessionConfigState {
            session_id: session_id.to_string(),
            thread_id: turn_state.thread_id.clone(),
            turn_id: turn_state.turn_id.clone(),
            system_prompt: turn_input_system_prompt,
            system_prompt_override,
            include_context_trace: turn_input_include_context_trace,
            turn_context_override: turn_input_turn_context_override,
        },
    })
}

fn apply_service_skill_preload_prompt_stage(
    turn_input_builder: &mut TurnInputEnvelopeBuilder,
    execution_profile: TurnExecutionProfile,
    system_prompt: Option<String>,
    service_skill_preload: Option<&ServiceSkillLaunchPreloadExecution>,
) {
    if !matches!(execution_profile, TurnExecutionProfile::FullRuntime) {
        return;
    }

    let system_prompt =
        merge_system_prompt_with_service_skill_launch_preload(system_prompt, service_skill_preload);
    turn_input_builder.apply_prompt_stage(
        TurnPromptAugmentationStageKind::ServiceSkillLaunchPreload,
        system_prompt,
    );
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn prepare_runtime_turn_execution(
    agent_arc: &Arc<tokio::sync::RwLock<Option<Agent>>>,
    db: &DbConnection,
    request: &AsterChatRequest,
    session_id: &str,
    workspace_id: &str,
    resolved_turn_id: &str,
    execution_profile: TurnExecutionProfile,
    requested_strategy: AsterExecutionStrategy,
    effective_strategy: AsterExecutionStrategy,
    request_tool_policy: &RequestToolPolicy,
    include_context_trace: bool,
    runtime_chat_mode: RuntimeChatMode,
    system_prompt_source: TurnSystemPromptSource,
    system_prompt: Option<String>,
    mut turn_input_builder: TurnInputEnvelopeBuilder,
    auto_continue_enabled: bool,
    auto_continue_metadata: Option<&AutoContinuePayload>,
    session_recent_preferences: Option<&lime_agent::SessionExecutionRuntimePreferences>,
    session_state_snapshot: &SessionStateSnapshot,
    request_metadata: Option<&serde_json::Value>,
) -> Result<RuntimeTurnPreparedExecution, String> {
    let service_skill_preload = if matches!(execution_profile, TurnExecutionProfile::FullRuntime) {
        preload_service_skill_launch_execution(db, request_metadata)
            .await
            .map_err(|error| format!("站点技能预执行失败: {error}"))?
    } else {
        None
    };
    apply_service_skill_preload_prompt_stage(
        &mut turn_input_builder,
        execution_profile,
        system_prompt,
        service_skill_preload.as_ref(),
    );

    let runtime_turn_artifacts = build_runtime_turn_artifacts(
        agent_arc,
        session_id,
        workspace_id,
        resolved_turn_id,
        execution_profile,
        requested_strategy,
        effective_strategy,
        request_tool_policy,
        include_context_trace,
        runtime_chat_mode,
        system_prompt_source,
        turn_input_builder,
    )
    .await?;

    let runtime_turn_execution_context = build_runtime_turn_execution_context(
        db,
        request,
        session_id,
        workspace_id,
        effective_strategy,
        request_tool_policy,
        auto_continue_enabled,
        auto_continue_metadata,
        session_recent_preferences,
        session_state_snapshot,
        &runtime_turn_artifacts.runtime_projection_snapshot,
        &runtime_turn_artifacts.turn_state,
        runtime_turn_artifacts
            .turn_input_envelope
            .system_prompt()
            .map(str::to_string),
        runtime_turn_artifacts
            .turn_input_envelope
            .include_context_trace(),
        runtime_turn_artifacts
            .turn_input_envelope
            .turn_context_override(),
        &runtime_turn_artifacts.turn_input_diagnostics,
        service_skill_preload.as_ref(),
    )?;

    Ok(RuntimeTurnPreparedExecution {
        service_skill_preload,
        runtime_turn_artifacts,
        runtime_turn_execution_context,
    })
}
