use super::*;
use std::future::Future;

const RUNTIME_MCP_PREWARM_TTFT_BUDGET: Duration = Duration::from_millis(1500);

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

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct RuntimeMcpPrewarmOutcome {
    start_ok: usize,
    start_fail: usize,
    inject_ok: usize,
    inject_fail: usize,
    timed_out: bool,
}

impl RuntimeMcpPrewarmOutcome {
    fn timed_out() -> Self {
        Self {
            timed_out: true,
            ..Self::default()
        }
    }
}

async fn with_runtime_mcp_prewarm_budget<F, Fut>(
    timeout_duration: Duration,
    operation: F,
) -> RuntimeMcpPrewarmOutcome
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = RuntimeMcpPrewarmOutcome>,
{
    match tokio::time::timeout(timeout_duration, operation()).await {
        Ok(outcome) => outcome,
        Err(_) => RuntimeMcpPrewarmOutcome::timed_out(),
    }
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
        let prewarm_started_at = Instant::now();
        let outcome = with_runtime_mcp_prewarm_budget(RUNTIME_MCP_PREWARM_TTFT_BUDGET, || async {
            let (start_ok, start_fail) = ensure_lime_mcp_servers_running(db, mcp_manager).await;
            let (inject_ok, inject_fail) = inject_mcp_extensions(state, mcp_manager).await;
            RuntimeMcpPrewarmOutcome {
                start_ok,
                start_fail,
                inject_ok,
                inject_fail,
                timed_out: false,
            }
        })
        .await;

        if outcome.timed_out {
            tracing::warn!(
                "[AsterAgent][TTFT] MCP runtime 预热超过首字前预算，已跳过并继续当前 turn: session={}, budget_ms={}",
                session_id,
                RUNTIME_MCP_PREWARM_TTFT_BUDGET.as_millis()
            );
        } else {
            tracing::info!(
                "[AsterAgent][TTFT] MCP runtime 预热完成: session={}, start_ok={}, start_fail={}, inject_ok={}, inject_fail={}, elapsed_ms={}",
                session_id,
                outcome.start_ok,
                outcome.start_fail,
                outcome.inject_ok,
                outcome.inject_fail,
                prewarm_started_at.elapsed().as_millis()
            );
        }

        if outcome.start_fail > 0 {
            tracing::warn!(
                "[AsterAgent] 部分 MCP server 自动启动失败 ({} 失败)，后续可用工具可能不完整",
                outcome.start_fail
            );
        }
        if outcome.inject_fail > 0 {
            tracing::warn!(
                "[AsterAgent] 部分 MCP extension 注入失败 ({} 失败)，Agent 可能无法使用某些 MCP 工具",
                outcome.inject_fail
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
    }

    let image_input_policy = resolve_runtime_image_input_policy(request);
    request.metadata = merge_runtime_image_input_policy_metadata(
        request.metadata.take(),
        image_input_policy.as_ref(),
    );
    if let Some(metadata) = request.metadata.as_mut() {
        hydrate_limecore_policy_hits_from_request_metadata(metadata);
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

#[cfg(test)]
mod tests {
    use super::*;

    fn runtime_policy_test_request(
        message: &str,
        web_search: Option<bool>,
        search_mode: Option<RequestToolPolicyMode>,
        metadata: Option<serde_json::Value>,
    ) -> AsterChatRequest {
        AsterChatRequest {
            message: message.to_string(),
            session_id: "session-policy-test".to_string(),
            event_name: "agent_stream_policy_test".to_string(),
            images: None,
            provider_config: None,
            provider_preference: None,
            model_preference: None,
            reasoning_effort: None,
            thinking_enabled: None,
            approval_policy: None,
            sandbox_policy: None,
            project_id: None,
            workspace_id: "workspace-policy-test".to_string(),
            web_search,
            search_mode,
            execution_strategy: None,
            auto_continue: None,
            system_prompt: None,
            metadata,
            turn_id: None,
            queue_if_busy: None,
            queued_turn_id: None,
        }
    }

    #[test]
    fn default_web_search_tool_surface_should_be_allowed_for_plain_agent_turn() {
        let request = runtime_policy_test_request("需要时可以补充外部资料", None, None, None);

        let RuntimeTurnPolicyPreparation {
            request_tool_policy,
            ..
        } = prepare_runtime_turn_policy(
            &request,
            "session-policy-test",
            None,
            false,
            AsterExecutionStrategy::React,
        );

        assert_eq!(
            request_tool_policy.search_mode,
            RequestToolPolicyMode::Allowed
        );
        assert!(request_tool_policy.allows_web_search());
        assert!(!request_tool_policy.requires_web_search());
    }

    #[test]
    fn explicit_web_search_turn_should_stay_allowed_until_search_mode_requires_it() {
        let request = runtime_policy_test_request("需要时可以补充外部资料", Some(true), None, None);

        let RuntimeTurnPolicyPreparation {
            request_tool_policy,
            ..
        } = prepare_runtime_turn_policy(
            &request,
            "session-policy-test",
            None,
            false,
            AsterExecutionStrategy::React,
        );

        assert_eq!(
            request_tool_policy.search_mode,
            RequestToolPolicyMode::Allowed
        );
        assert!(request_tool_policy.allows_web_search());
        assert!(!request_tool_policy.requires_web_search());
    }

    #[test]
    fn default_web_search_tool_surface_should_be_allowed_for_general_workbench_turn() {
        let request = runtime_policy_test_request(
            "需要时可以补充外部资料",
            None,
            None,
            Some(serde_json::json!({
                "harness": {
                    "theme": "general",
                    "session_mode": "general_workbench"
                }
            })),
        );

        let RuntimeTurnPolicyPreparation {
            request_tool_policy,
            ..
        } = prepare_runtime_turn_policy(
            &request,
            "session-policy-test",
            None,
            false,
            AsterExecutionStrategy::React,
        );

        assert_eq!(
            request_tool_policy.search_mode,
            RequestToolPolicyMode::Allowed
        );
        assert!(request_tool_policy.allows_web_search());
        assert!(!request_tool_policy.requires_web_search());
    }

    #[test]
    fn explicit_web_search_disabled_flag_should_override_default_tool_surface() {
        let request =
            runtime_policy_test_request("需要时可以补充外部资料", Some(false), None, None);

        let RuntimeTurnPolicyPreparation {
            request_tool_policy,
            ..
        } = prepare_runtime_turn_policy(
            &request,
            "session-policy-test",
            None,
            false,
            AsterExecutionStrategy::React,
        );

        assert_eq!(
            request_tool_policy.search_mode,
            RequestToolPolicyMode::Disabled
        );
        assert!(!request_tool_policy.allows_web_search());
    }

    #[test]
    fn metadata_web_search_disabled_flag_should_not_override_default_tool_surface() {
        let request = runtime_policy_test_request(
            "需要时可以补充外部资料",
            None,
            None,
            Some(serde_json::json!({
                "harness": {
                    "preferences": {
                        "web_search": false
                    }
                }
            })),
        );

        let RuntimeTurnPolicyPreparation {
            request_tool_policy,
            ..
        } = prepare_runtime_turn_policy(
            &request,
            "session-policy-test",
            None,
            false,
            AsterExecutionStrategy::React,
        );

        assert_eq!(
            request_tool_policy.search_mode,
            RequestToolPolicyMode::Allowed
        );
        assert!(request_tool_policy.allows_web_search());
        assert!(!request_tool_policy.requires_web_search());
    }

    #[test]
    fn session_recent_web_search_disabled_flag_should_not_override_default_tool_surface() {
        let request = runtime_policy_test_request("需要时可以补充外部资料", None, None, None);
        let session_recent_preferences = lime_agent::SessionExecutionRuntimePreferences {
            web_search: Some(false),
            thinking: Some(false),
            task: false,
            subagent: false,
        };

        let RuntimeTurnPolicyPreparation {
            request_tool_policy,
            ..
        } = prepare_runtime_turn_policy(
            &request,
            "session-policy-test",
            Some(&session_recent_preferences),
            false,
            AsterExecutionStrategy::React,
        );

        assert_eq!(
            request_tool_policy.search_mode,
            RequestToolPolicyMode::Allowed
        );
        assert!(request_tool_policy.allows_web_search());
        assert!(!request_tool_policy.requires_web_search());
    }

    #[test]
    fn browser_required_policy_should_not_be_reopened_by_time_sensitive_search() {
        let request = runtime_policy_test_request(
            "请打开网页并检查今天的新闻",
            Some(true),
            Some(RequestToolPolicyMode::Allowed),
            Some(serde_json::json!({
                "harness": {
                    "browser_requirement": "required_with_user_step"
                }
            })),
        );

        let RuntimeTurnPolicyPreparation {
            request_tool_policy,
            ..
        } = prepare_runtime_turn_policy(
            &request,
            "session-policy-test",
            None,
            false,
            AsterExecutionStrategy::React,
        );

        assert_eq!(
            request_tool_policy.search_mode,
            RequestToolPolicyMode::Disabled
        );
        assert!(!request_tool_policy.allows_web_search());
    }

    #[test]
    fn site_search_skill_launch_policy_should_not_be_reopened_by_time_sensitive_search() {
        let request = runtime_policy_test_request(
            "请查一下今天这个站点的新闻",
            Some(true),
            Some(RequestToolPolicyMode::Allowed),
            Some(serde_json::json!({
                "harness": {
                    "site_search_skill_launch": {
                        "skill_name": "site_search",
                        "kind": "site_search_request",
                        "site_search_request": {
                            "site": "GitHub",
                            "query": "latest news"
                        }
                    }
                }
            })),
        );

        let RuntimeTurnPolicyPreparation {
            request_tool_policy,
            ..
        } = prepare_runtime_turn_policy(
            &request,
            "session-policy-test",
            None,
            false,
            AsterExecutionStrategy::React,
        );

        assert_eq!(
            request_tool_policy.search_mode,
            RequestToolPolicyMode::Disabled
        );
        assert!(!request_tool_policy.allows_web_search());
    }

    #[tokio::test]
    async fn runtime_mcp_prewarm_budget_should_timeout_before_first_token_path() {
        let started_at = Instant::now();

        let outcome = with_runtime_mcp_prewarm_budget(Duration::from_millis(5), || async {
            tokio::time::sleep(Duration::from_millis(50)).await;
            RuntimeMcpPrewarmOutcome {
                start_ok: 1,
                start_fail: 0,
                inject_ok: 1,
                inject_fail: 0,
                timed_out: false,
            }
        })
        .await;

        assert_eq!(outcome, RuntimeMcpPrewarmOutcome::timed_out());
        assert!(
            started_at.elapsed() < Duration::from_secs(1),
            "MCP runtime 预热超时后不应继续阻塞首字路径"
        );
    }

    #[tokio::test]
    async fn runtime_mcp_prewarm_budget_should_return_successful_outcome() {
        let outcome = with_runtime_mcp_prewarm_budget(Duration::from_millis(50), || async {
            RuntimeMcpPrewarmOutcome {
                start_ok: 2,
                start_fail: 1,
                inject_ok: 3,
                inject_fail: 0,
                timed_out: false,
            }
        })
        .await;

        assert_eq!(
            outcome,
            RuntimeMcpPrewarmOutcome {
                start_ok: 2,
                start_fail: 1,
                inject_ok: 3,
                inject_fail: 0,
                timed_out: false,
            }
        );
    }
}

fn fail_pending_runtime_permission_confirmation_before_provider_bootstrap(
    app: &AppHandle,
    db: &DbConnection,
    request: &AsterChatRequest,
    session_id: &str,
    workspace_root: &str,
    resolved_turn_id: &str,
) -> Result<(), String> {
    let Some(permission_state) = extract_runtime_resolution_payload::<
        lime_agent::SessionExecutionRuntimePermissionState,
    >(request.metadata.as_ref(), "permission_state") else {
        return Ok(());
    };
    if !permission_state_requires_turn_gating(&permission_state) {
        return Ok(());
    }

    let timeline_recorder = Arc::new(Mutex::new(AgentTimelineRecorder::create(
        db.clone(),
        session_id,
        resolved_turn_id,
        request.message.clone(),
    )?));
    maybe_emit_runtime_permission_confirmation_request(
        app,
        request,
        workspace_root,
        session_id,
        resolved_turn_id,
        &timeline_recorder,
        &permission_state,
    );

    let error = format_permission_turn_gating_error(&permission_state);
    let terminal_events = {
        let mut recorder = match timeline_recorder.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        recorder.fail_turn(&error)
    };
    if let Err(record_error) = &terminal_events {
        tracing::warn!(
            "[AsterAgent] 记录权限确认阻断 turn 时间线失败（已降级返回错误）: {}",
            record_error
        );
    }
    if let Ok(events) = terminal_events {
        emit_runtime_events(app, &request.event_name, events);
    }

    Err(error)
}

fn emit_provider_bootstrap_failure_runtime_events(
    app: &AppHandle,
    db: &DbConnection,
    request: &AsterChatRequest,
    session_id: &str,
    workspace_root: &str,
    resolved_turn_id: &str,
    error: &str,
) -> Result<(), String> {
    let timeline_recorder = Arc::new(Mutex::new(AgentTimelineRecorder::create(
        db.clone(),
        session_id,
        resolved_turn_id,
        request.message.clone(),
    )?));

    emit_runtime_request_resolution_events(
        app,
        &request.event_name,
        &timeline_recorder,
        workspace_root,
        request.metadata.as_ref(),
    );

    let terminal_events = {
        let mut recorder = match timeline_recorder.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        recorder.fail_turn(error)
    };
    if let Err(record_error) = &terminal_events {
        tracing::warn!(
            "[AsterAgent] 记录 provider bootstrap 阻断 turn 时间线失败（已降级返回错误）: {}",
            record_error
        );
    }
    if let Ok(events) = terminal_events {
        emit_runtime_events(app, &request.event_name, events);
    }

    let error_event = RuntimeAgentEvent::Error {
        message: error.to_string(),
    };
    if let Err(emit_error) = app.emit(&request.event_name, &error_event) {
        tracing::warn!(
            "[AsterAgent] 发送 provider bootstrap 阻断错误事件失败: {}",
            emit_error
        );
    }
    emit_agent_app_runtime_event_projection(app, &request.event_name, &error_event);

    Ok(())
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
    let effective_strategy = requested_strategy;

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

    fail_pending_runtime_permission_confirmation_before_provider_bootstrap(
        app,
        db,
        request,
        session_id,
        workspace_root,
        resolved_turn_id,
    )?;

    apply_runtime_turn_provider_config(
        state,
        db,
        session_id,
        request.provider_config.as_ref(),
        request.reasoning_effort.as_deref(),
    )
    .await?;

    let submit_bootstrap = match prepare_runtime_turn_submit_bootstrap(
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
        effective_strategy,
        &request_tool_policy,
        &mut turn_input_builder,
    )
    .await
    {
        Ok(submit_bootstrap) => submit_bootstrap,
        Err(error) => {
            if !state.is_provider_configured().await {
                if let Err(record_error) = emit_provider_bootstrap_failure_runtime_events(
                    app,
                    db,
                    request,
                    session_id,
                    workspace_root,
                    resolved_turn_id,
                    &error,
                ) {
                    tracing::warn!(
                        "[AsterAgent] provider bootstrap 阻断事件记录失败（已保留原始错误）: {}",
                        record_error
                    );
                }
            }
            return Err(error);
        }
    };
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
