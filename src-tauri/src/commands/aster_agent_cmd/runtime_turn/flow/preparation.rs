use super::*;

struct RuntimeTurnSessionPreparation {
    auto_continue_config: Option<AutoContinuePayload>,
    auto_continue_enabled: bool,
    session_state_snapshot: SessionStateSnapshot,
    session_recent_preferences: Option<lime_agent::SessionExecutionRuntimePreferences>,
    session_recent_team_selection: Option<lime_agent::SessionExecutionRuntimeRecentTeamSelection>,
}

pub(super) struct RuntimeTurnSubmitPreparation {
    pub(super) auto_continue_config: Option<AutoContinuePayload>,
    pub(super) auto_continue_enabled: bool,
    pub(super) session_state_snapshot: SessionStateSnapshot,
    pub(super) session_recent_preferences: Option<lime_agent::SessionExecutionRuntimePreferences>,
    pub(super) runtime_chat_mode: RuntimeChatMode,
    pub(super) include_context_trace: bool,
    pub(super) turn_input_builder: TurnInputEnvelopeBuilder,
    pub(super) request_tool_policy: RequestToolPolicy,
    pub(super) execution_profile: TurnExecutionProfile,
    pub(super) requested_strategy: AsterExecutionStrategy,
    pub(super) effective_strategy: AsterExecutionStrategy,
    pub(super) system_prompt: Option<String>,
    pub(super) system_prompt_source: TurnSystemPromptSource,
    pub(super) submit_bootstrap: RuntimeTurnSubmitBootstrap,
}

struct RuntimeTurnRequestPreparation {
    runtime_chat_mode: RuntimeChatMode,
    include_context_trace: bool,
    turn_input_builder: TurnInputEnvelopeBuilder,
}

struct RuntimeTurnPolicyPreparation {
    request_tool_policy: RequestToolPolicy,
    execution_profile: TurnExecutionProfile,
}

impl RuntimeTurnSubmitPreparation {
    pub(super) fn model_skill_tool_enabled(&self) -> bool {
        self.submit_bootstrap.model_skill_tool_enabled
    }

    pub(super) fn model_skill_tool_allowed_skill_sources(
        &self,
    ) -> Option<Vec<lime_agent::tools::SkillToolSessionSkillSource>> {
        self.submit_bootstrap
            .model_skill_tool_allowed_skill_sources
            .clone()
    }

    pub(super) fn model_skill_tool_allowed_skill_names(&self) -> Option<Vec<String>> {
        self.submit_bootstrap
            .model_skill_tool_allowed_skill_names
            .clone()
    }
}

async fn prepare_runtime_turn_session(
    app: &AppHandle,
    logs: &LogState,
    db: &DbConnection,
    request: &AsterChatRequest,
    session_id: &str,
    workspace_root: &str,
    workspace_repaired: bool,
    workspace_warning: Option<String>,
) -> Result<RuntimeTurnSessionPreparation, String> {
    let auto_continue_config = request
        .auto_continue
        .clone()
        .map(AutoContinuePayload::normalized);
    let auto_continue_enabled = auto_continue_config
        .as_ref()
        .map(|config| config.enabled)
        .unwrap_or(false);
    if let Some(config) = auto_continue_config
        .as_ref()
        .filter(|config| config.enabled)
    {
        tracing::info!(
            "[AsterAgent] 自动续写策略已启用: source={:?}, fast_mode={}, continuation_length={}, sensitivity={}",
            config.source,
            config.fast_mode_enabled,
            config.continuation_length,
            config.sensitivity
        );
    }

    if workspace_repaired {
        let warning_message = workspace_warning.unwrap_or_else(|| {
            format!(
                "检测到工作区目录缺失，已自动创建并继续执行: {}",
                workspace_root
            )
        });
        logs.write()
            .await
            .add("warn", &format!("[AsterAgent] {}", warning_message));
        let warning_event = RuntimeAgentEvent::Warning {
            code: Some(WORKSPACE_PATH_AUTO_CREATED_WARNING_CODE.to_string()),
            message: warning_message,
        };
        if let Err(error) = app.emit(&request.event_name, &warning_event) {
            tracing::error!("[AsterAgent] 发送工作区自动恢复提醒失败: {}", error);
        }
    }

    let mut session_state_snapshot = SessionStateSnapshot::from_persisted_metadata(
        session_id,
        AsterAgentWrapper::get_persisted_session_metadata_sync(db, session_id)?,
    );

    if session_state_snapshot.needs_working_dir_update(workspace_root) {
        tracing::info!(
            "[AsterAgent] workspace 变更，自动更新 session working_dir: {} -> {}",
            session_state_snapshot.working_dir().unwrap_or_default(),
            workspace_root
        );
        AsterAgentWrapper::update_session_working_dir_sync(db, session_id, workspace_root)?;
        session_state_snapshot =
            session_state_snapshot.with_working_dir(Some(workspace_root.to_string()));
    }

    let SessionRecentRuntimeContext {
        preferences: session_recent_preferences,
        team_selection: session_recent_team_selection,
    } = resolve_session_recent_runtime_context(session_id).await?;

    Ok(RuntimeTurnSessionPreparation {
        auto_continue_config,
        auto_continue_enabled,
        session_state_snapshot,
        session_recent_preferences,
        session_recent_team_selection,
    })
}

fn prepare_runtime_turn_policy(
    request: &AsterChatRequest,
    session_id: &str,
    session_recent_preferences: Option<&lime_agent::SessionExecutionRuntimePreferences>,
    auto_continue_enabled: bool,
    effective_strategy: AsterExecutionStrategy,
) -> RuntimeTurnPolicyPreparation {
    let runtime_chat_mode = resolve_runtime_chat_mode(request.metadata.as_ref());
    let mode_default_web_search = default_web_search_enabled_for_chat_mode(runtime_chat_mode);
    let resolved_request_web_search = resolve_request_web_search_preference_from_sources(
        request.web_search,
        request.metadata.as_ref(),
        session_recent_preferences,
    );
    let (request_web_search, request_search_mode) =
        apply_browser_requirement_to_request_tool_policy(
            request.metadata.as_ref(),
            resolved_request_web_search,
            request.search_mode,
        );
    let (request_web_search, request_search_mode) =
        apply_site_search_skill_launch_to_request_tool_policy(
            request.metadata.as_ref(),
            request_web_search,
            request_search_mode,
        );

    let request_tool_policy = resolve_request_tool_policy_with_mode(
        request_web_search,
        request_search_mode,
        mode_default_web_search,
    );
    tracing::info!(
        "[AsterAgent][WebSearchGuard] session={}, chat_mode={:?}, request_web_search={:?}, request_search_mode={:?}, effective_request_web_search={:?}, effective_request_search_mode={:?}, mode_default_web_search={}, effective_web_search={}, search_mode={}",
        session_id,
        runtime_chat_mode,
        request.web_search,
        request.search_mode,
        request_web_search,
        request_search_mode,
        mode_default_web_search,
        request_tool_policy.effective_web_search,
        request_tool_policy.search_mode.as_str()
    );

    let execution_profile = resolve_turn_execution_profile(
        request,
        runtime_chat_mode,
        &request_tool_policy,
        auto_continue_enabled,
        effective_strategy,
    );

    RuntimeTurnPolicyPreparation {
        request_tool_policy,
        execution_profile,
    }
}

async fn prepare_runtime_turn_request(
    state: &AsterAgentState,
    db: &DbConnection,
    mcp_manager: &McpManagerState,
    request: &mut AsterChatRequest,
    session_id: &str,
    workspace_id: &str,
    workspace_root: &str,
    resolved_turn_id: &str,
    runtime_config: &lime_core::config::Config,
    workspace_settings: &WorkspaceSettings,
    request_tool_policy: &RequestToolPolicy,
    execution_profile: TurnExecutionProfile,
    session_state_snapshot: &SessionStateSnapshot,
    session_recent_harness_context: &SessionRecentHarnessContext,
) -> RuntimeTurnRequestPreparation {
    request.metadata = merge_runtime_turn_tool_surface_metadata(
        request.metadata.take(),
        resolve_fast_chat_tool_surface_mode(request, execution_profile, request_tool_policy),
    );
    let runtime_chat_mode = resolve_runtime_chat_mode(request.metadata.as_ref());

    if should_prewarm_mcp_runtime(
        request,
        execution_profile,
        runtime_chat_mode,
        request_tool_policy,
    ) {
        let (_start_ok, start_fail) = ensure_lime_mcp_servers_running(db, mcp_manager).await;
        let (_mcp_ok, mcp_fail) = inject_mcp_extensions(state, mcp_manager).await;

        if start_fail > 0 {
            tracing::warn!(
                "[AsterAgent] 部分 MCP server 自动启动失败 ({} 失败)，后续可用工具可能不完整",
                start_fail
            );
        }
        if mcp_fail > 0 {
            tracing::warn!(
                "[AsterAgent] 部分 MCP extension 注入失败 ({} 失败)，Agent 可能无法使用某些 MCP 工具",
                mcp_fail
            );
        }
    } else {
        tracing::info!(
            "[AsterAgent] 跳过 MCP runtime 预热: session={}, profile={:?}, search_mode={}, chat_mode={:?}, reason={}",
            session_id,
            execution_profile,
            request_tool_policy.search_mode.as_str(),
            runtime_chat_mode,
            resolve_mcp_prewarm_skip_reason(
                request,
                execution_profile,
                runtime_chat_mode,
                request_tool_policy,
            )
            .unwrap_or("not_required")
        );
    }

    if matches!(execution_profile, TurnExecutionProfile::FullRuntime) {
        request.metadata = prepare_image_skill_launch_request_metadata(
            Path::new(workspace_root),
            session_id,
            resolved_turn_id,
            request.metadata.as_ref(),
            request.images.as_deref(),
        );
        request.metadata = prepare_cover_skill_launch_request_metadata(request.metadata.as_ref());
        request.metadata =
            prepare_broadcast_skill_launch_request_metadata(request.metadata.as_ref());
        request.metadata =
            prepare_resource_search_skill_launch_request_metadata(request.metadata.as_ref());
        request.metadata =
            prepare_research_skill_launch_request_metadata(request.metadata.as_ref());
        request.metadata = prepare_report_skill_launch_request_metadata(request.metadata.as_ref());
        request.metadata =
            prepare_deep_search_skill_launch_request_metadata(request.metadata.as_ref());
        request.metadata =
            prepare_site_search_skill_launch_request_metadata(request.metadata.as_ref());
        request.metadata =
            prepare_pdf_read_skill_launch_request_metadata(request.metadata.as_ref());
        request.metadata =
            prepare_presentation_skill_launch_request_metadata(request.metadata.as_ref());
        request.metadata = prepare_form_skill_launch_request_metadata(request.metadata.as_ref());
        request.metadata = prepare_summary_skill_launch_request_metadata(request.metadata.as_ref());
        request.metadata =
            prepare_translation_skill_launch_request_metadata(request.metadata.as_ref());
        request.metadata =
            prepare_analysis_skill_launch_request_metadata(request.metadata.as_ref());
        request.metadata =
            prepare_transcription_skill_launch_request_metadata(request.metadata.as_ref());
        request.metadata =
            prepare_typesetting_skill_launch_request_metadata(request.metadata.as_ref());
        request.metadata = prepare_webpage_skill_launch_request_metadata(request.metadata.as_ref());
        request.metadata = prepare_service_scene_launch_request_metadata(request.metadata.as_ref());
        normalize_runtime_turn_request_metadata(
            request,
            session_recent_harness_context.theme.as_deref(),
            session_recent_harness_context.session_mode.as_deref(),
            session_recent_harness_context.gate_key.as_deref(),
            session_recent_harness_context.run_title.as_deref(),
            session_recent_harness_context.content_id.as_deref(),
            true,
        );
        let image_input_policy = resolve_runtime_image_input_policy(request);
        request.metadata = merge_runtime_image_input_policy_metadata(
            request.metadata.take(),
            image_input_policy.as_ref(),
        );
        if let Some(metadata) = request.metadata.as_mut() {
            hydrate_limecore_policy_hits_from_request_metadata(metadata);
        }
    }

    let runtime_chat_mode = resolve_runtime_chat_mode(request.metadata.as_ref());
    // `context_trace` 主要服务诊断面板；真实 GUI 回放里这条事件链会在主回复流中触发栈溢出。
    // 默认先关闭，只有显式打开调试开关时才继续发射，优先保证主聊天链稳定可交付。
    let include_context_trace =
        runtime_config.memory.enabled && std::env::var("LIME_ENABLE_CONTEXT_TRACE").is_ok();
    tracing::info!(
        "[AsterAgent] session_state_snapshot={}",
        serde_json::to_string(&session_state_snapshot).unwrap_or_else(|_| "{}".to_string())
    );
    let turn_context_snapshot =
        build_runtime_turn_context_snapshot(request.metadata.as_ref(), workspace_settings);
    let turn_context_metadata = build_runtime_turn_context_metadata_value(&turn_context_snapshot);

    let mut turn_input_builder = TurnInputEnvelopeBuilder::new(session_id, workspace_id);
    turn_input_builder
        .set_project_id(request.project_id.clone())
        .set_execution_profile(execution_profile)
        .set_has_persisted_session(session_state_snapshot.has_persisted_session())
        .set_request_tool_policy(Some(TurnRequestToolPolicySnapshot::from(
            request_tool_policy,
        )))
        .set_working_dir(Some(workspace_root.to_string()))
        .set_effective_user_message(request.message.clone())
        .set_include_context_trace(include_context_trace)
        .set_approval_policy(request.approval_policy.clone())
        .set_sandbox_policy(request.sandbox_policy.clone())
        .set_turn_output_schema(
            turn_context_snapshot.output_schema.clone(),
            turn_context_snapshot.output_schema_source,
        )
        .set_turn_context_metadata_from_value(turn_context_metadata.as_ref());

    RuntimeTurnRequestPreparation {
        runtime_chat_mode,
        include_context_trace,
        turn_input_builder,
    }
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn prepare_runtime_turn_submit_preparation(
    app: &AppHandle,
    state: &AsterAgentState,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    logs: &LogState,
    config_manager: &GlobalConfigManagerState,
    mcp_manager: &McpManagerState,
    automation_state: &AutomationServiceState,
    request: &mut AsterChatRequest,
    session_id: &str,
    workspace_id: &str,
    workspace_root: &str,
    resolved_turn_id: &str,
    workspace_settings: &WorkspaceSettings,
    runtime_config: &lime_core::config::Config,
    workspace_repaired: bool,
    workspace_warning: Option<String>,
    session_recent_harness_context: &SessionRecentHarnessContext,
) -> Result<RuntimeTurnSubmitPreparation, String> {
    let started_at = Instant::now();
    let RuntimeTurnSessionPreparation {
        auto_continue_config,
        auto_continue_enabled,
        session_state_snapshot,
        session_recent_preferences,
        session_recent_team_selection,
    } = prepare_runtime_turn_session(
        app,
        logs,
        db,
        request,
        session_id,
        workspace_root,
        workspace_repaired,
        workspace_warning,
    )
    .await?;

    let persisted_strategy =
        AsterExecutionStrategy::from_db_value(session_state_snapshot.execution_strategy());
    let requested_strategy = request.execution_strategy.unwrap_or(persisted_strategy);
    let effective_strategy = requested_strategy.effective_strategy();
    apply_code_orchestrated_runtime_defaults(request, effective_strategy);

    let RuntimeTurnPolicyPreparation {
        request_tool_policy,
        execution_profile,
    } = prepare_runtime_turn_policy(
        request,
        session_id,
        session_recent_preferences.as_ref(),
        auto_continue_enabled,
        effective_strategy,
    );

    let RuntimeTurnRequestPreparation {
        runtime_chat_mode,
        include_context_trace,
        mut turn_input_builder,
    } = prepare_runtime_turn_request(
        state,
        db,
        mcp_manager,
        request,
        session_id,
        workspace_id,
        workspace_root,
        resolved_turn_id,
        runtime_config,
        workspace_settings,
        &request_tool_policy,
        execution_profile,
        &session_state_snapshot,
        session_recent_harness_context,
    )
    .await;

    let RuntimeTurnPromptStrategy {
        system_prompt,
        requested_strategy,
        effective_strategy,
        system_prompt_source,
    } = prepare_runtime_turn_prompt_strategy(
        db,
        request,
        session_id,
        workspace_root,
        requested_strategy,
        effective_strategy,
        execution_profile,
        runtime_config,
        &request_tool_policy,
        &session_state_snapshot,
        session_recent_team_selection.as_ref(),
        session_recent_preferences.as_ref(),
        auto_continue_config.as_ref(),
        &mut turn_input_builder,
    );

    apply_runtime_turn_provider_config(state, db, session_id, request.provider_config.as_ref())
        .await?;

    let submit_bootstrap = prepare_runtime_turn_submit_bootstrap(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
        request,
        session_id,
        workspace_root,
        workspace_settings,
        runtime_config,
        runtime_chat_mode,
        execution_profile,
        requested_strategy,
        &request_tool_policy,
        &mut turn_input_builder,
    )
    .await?;
    tracing::info!(
        "[AsterAgent][TTFT] submit preparation complete: session_id={}, event_name={}, profile={:?}, strategy={:?}, search_mode={}, auto_continue={}, elapsed_ms={}",
        session_id,
        request.event_name,
        execution_profile,
        effective_strategy,
        request_tool_policy.search_mode.as_str(),
        auto_continue_enabled,
        started_at.elapsed().as_millis()
    );

    Ok(RuntimeTurnSubmitPreparation {
        auto_continue_config,
        auto_continue_enabled,
        session_state_snapshot,
        session_recent_preferences,
        runtime_chat_mode,
        include_context_trace,
        turn_input_builder,
        request_tool_policy,
        execution_profile,
        requested_strategy,
        effective_strategy,
        system_prompt,
        system_prompt_source,
        submit_bootstrap,
    })
}
