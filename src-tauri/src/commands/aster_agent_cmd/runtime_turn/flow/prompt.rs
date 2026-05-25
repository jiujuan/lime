use super::*;

pub(super) struct RuntimeTurnPromptStrategy {
    pub(super) system_prompt: Option<String>,
    pub(super) requested_strategy: AsterExecutionStrategy,
    pub(super) effective_strategy: AsterExecutionStrategy,
    pub(super) system_prompt_source: TurnSystemPromptSource,
}

pub(crate) fn resolve_runtime_turn_base_system_prompt(
    execution_profile: TurnExecutionProfile,
    project_prompt: Option<String>,
    session_prompt: Option<String>,
    frontend_prompt: Option<&str>,
) -> (Option<String>, TurnSystemPromptSource) {
    let frontend_prompt = frontend_prompt
        .filter(|prompt| !prompt.trim().is_empty())
        .map(str::to_string);

    if matches!(execution_profile, TurnExecutionProfile::FastChat) {
        if let Some(frontend_prompt) = frontend_prompt {
            return (Some(frontend_prompt), TurnSystemPromptSource::Frontend);
        }
    }

    if let Some(project_prompt) = project_prompt {
        return (Some(project_prompt), TurnSystemPromptSource::Project);
    }

    if let Some(session_prompt) = session_prompt {
        return (Some(session_prompt), TurnSystemPromptSource::Session);
    }

    if let Some(frontend_prompt) = frontend_prompt {
        return (Some(frontend_prompt), TurnSystemPromptSource::Frontend);
    }

    (None, TurnSystemPromptSource::None)
}

pub(crate) fn request_metadata_has_fast_response_routing(
    request_metadata: Option<&serde_json::Value>,
) -> bool {
    extract_harness_nested_object(
        request_metadata,
        &["fast_response_routing", "fastResponseRouting"],
    )
    .is_some()
}

pub(crate) fn should_override_system_prompt_for_fast_response(
    execution_profile: TurnExecutionProfile,
    system_prompt_source: TurnSystemPromptSource,
    system_prompt: Option<&str>,
    request_metadata: Option<&serde_json::Value>,
) -> bool {
    if !matches!(execution_profile, TurnExecutionProfile::FastChat)
        || !matches!(system_prompt_source, TurnSystemPromptSource::Frontend)
        || !request_metadata_has_fast_response_routing(request_metadata)
    {
        return false;
    }

    system_prompt
        .map(str::trim)
        .filter(|prompt| !prompt.is_empty())
        .is_some_and(|prompt| {
            prompt.chars().count() <= FAST_RESPONSE_SYSTEM_PROMPT_OVERRIDE_MAX_CHARS
        })
}

#[allow(clippy::too_many_arguments)]
pub(super) fn prepare_runtime_turn_prompt_strategy(
    db: &DbConnection,
    request: &AsterChatRequest,
    session_id: &str,
    workspace_root: &str,
    execution_profile: TurnExecutionProfile,
    runtime_config: &lime_core::config::Config,
    request_tool_policy: &RequestToolPolicy,
    session_state_snapshot: &SessionStateSnapshot,
    session_recent_team_selection: Option<&lime_agent::SessionExecutionRuntimeRecentTeamSelection>,
    session_recent_preferences: Option<&lime_agent::SessionExecutionRuntimePreferences>,
    auto_continue_config: Option<&AutoContinuePayload>,
    turn_input_builder: &mut TurnInputEnvelopeBuilder,
) -> RuntimeTurnPromptStrategy {
    let persisted_strategy =
        AsterExecutionStrategy::from_db_value(session_state_snapshot.execution_strategy());
    let session_prompt = if let Some(prompt) = session_state_snapshot.system_prompt() {
        tracing::debug!(
            "[AsterAgent] 找到 session，system_prompt: {:?}",
            Some(prompt.len())
        );
        Some(prompt.to_string())
    } else {
        if !session_state_snapshot.has_persisted_session() {
            tracing::debug!("[AsterAgent] Lime 数据库中未找到 session: {}", session_id);
        }
        None
    };

    let has_fast_chat_frontend_prompt = matches!(execution_profile, TurnExecutionProfile::FastChat)
        && request
            .system_prompt
            .as_deref()
            .is_some_and(|prompt| !prompt.trim().is_empty());
    let project_prompt = if has_fast_chat_frontend_prompt {
        None
    } else if let Some(ref project_id) = request.project_id {
        match AsterAgentState::build_project_system_prompt(db, project_id) {
            Ok(prompt) => {
                tracing::info!(
                    "[AsterAgent] 已加载项目上下文: project_id={}, prompt_len={}",
                    project_id,
                    prompt.len()
                );
                Some(prompt)
            }
            Err(error) => {
                tracing::warn!(
                    "[AsterAgent] 加载项目上下文失败: {}, 继续使用 session prompt",
                    error
                );
                None
            }
        }
    } else {
        None
    };

    let (resolved_prompt, system_prompt_source) = resolve_runtime_turn_base_system_prompt(
        execution_profile,
        project_prompt,
        session_prompt,
        request.system_prompt.as_deref(),
    );
    if matches!(system_prompt_source, TurnSystemPromptSource::Frontend) {
        tracing::info!(
            "[AsterAgent] 使用前端传入的 system_prompt, profile={:?}, len={}",
            execution_profile,
            resolved_prompt
                .as_ref()
                .map(|prompt| prompt.len())
                .unwrap_or(0)
        );
    }
    turn_input_builder.set_base_system_prompt(system_prompt_source, resolved_prompt.clone());

    let requested_strategy = request.execution_strategy.unwrap_or(persisted_strategy);
    let effective_strategy = requested_strategy.effective_for_message(&request.message);
    turn_input_builder
        .set_requested_execution_strategy(Some(requested_strategy.as_db_value().to_string()))
        .set_effective_execution_strategy(Some(effective_strategy.as_db_value().to_string()));

    if let Some(explicit_strategy) = request.execution_strategy {
        if session_state_snapshot.has_persisted_session() {
            if let Err(error) = AsterAgentWrapper::update_session_execution_strategy_sync(
                db,
                session_id,
                explicit_strategy.as_db_value(),
            ) {
                tracing::warn!(
                    "[AsterAgent] 更新会话执行策略失败: session={}, strategy={}, error={}",
                    session_id,
                    explicit_strategy.as_db_value(),
                    error
                );
            }
        }
    }

    if should_override_system_prompt_for_fast_response(
        execution_profile,
        system_prompt_source,
        resolved_prompt.as_deref(),
        request.metadata.as_ref(),
    ) {
        tracing::info!(
            "[AsterAgent] fast_response_prompt_short_circuit={}",
            serde_json::json!({
                "session_id": session_id,
                "system_prompt_source": system_prompt_source,
                "base_system_prompt_len": resolved_prompt.as_ref().map(|prompt| prompt.chars().count()),
            })
        );
        tracing::info!(
            "[AsterAgent] 执行策略: requested={:?}, effective={:?}",
            requested_strategy,
            effective_strategy
        );

        return RuntimeTurnPromptStrategy {
            system_prompt: resolved_prompt,
            requested_strategy,
            effective_strategy,
            system_prompt_source,
        };
    }

    let prompt_with_runtime_agents = merge_system_prompt_with_runtime_plugin_agents(
        merge_system_prompt_with_runtime_agents(resolved_prompt, Some(Path::new(workspace_root))),
        Path::new(workspace_root),
        dirs::home_dir().as_deref(),
    );
    turn_input_builder.apply_prompt_stage(
        TurnPromptAugmentationStageKind::RuntimeAgents,
        prompt_with_runtime_agents.clone(),
    );
    let prompt_with_runtime_environment = apply_turn_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::RuntimeEnvironment,
        prompt_with_runtime_agents,
        |prompt| merge_system_prompt_with_runtime_environment(prompt, workspace_root),
    );
    let prompt_with_local_path_focus = apply_turn_prompt_stage(
        turn_input_builder,
        TurnPromptAugmentationStageKind::ExplicitLocalPathFocus,
        prompt_with_runtime_environment,
        |prompt| {
            merge_system_prompt_with_explicit_local_path_focus(
                prompt,
                request.message.as_str(),
                workspace_root,
            )
        },
    );

    let system_prompt = if matches!(execution_profile, TurnExecutionProfile::FullRuntime) {
        build_full_runtime_system_prompt(
            turn_input_builder,
            prompt_with_local_path_focus,
            runtime_config,
            db,
            session_id,
            workspace_root,
            request,
            request_tool_policy,
            session_recent_team_selection,
            session_recent_preferences,
            auto_continue_config,
        )
    } else {
        build_fast_chat_system_prompt(
            turn_input_builder,
            prompt_with_local_path_focus,
            request_tool_policy,
        )
    };

    tracing::info!(
        "[AsterAgent] 执行策略: requested={:?}, effective={:?}",
        requested_strategy,
        effective_strategy
    );

    RuntimeTurnPromptStrategy {
        system_prompt,
        requested_strategy,
        effective_strategy,
        system_prompt_source,
    }
}
