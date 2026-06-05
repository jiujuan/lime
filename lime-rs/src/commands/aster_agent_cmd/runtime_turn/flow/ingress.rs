use super::*;

pub(super) struct RuntimeTurnIngressContext {
    pub(super) owned_session_id: String,
    pub(super) workspace_id: String,
    pub(super) workspace_root: String,
    pub(super) workspace_settings: WorkspaceSettings,
    pub(super) resolved_turn_id: String,
    pub(super) runtime_config: lime_core::config::Config,
    pub(super) session_recent_harness_context: SessionRecentHarnessContext,
    pub(super) workspace_repaired: bool,
    pub(super) workspace_warning: Option<String>,
}

pub(super) async fn prepare_runtime_turn_entry(
    app: &AppHandle,
    state: &AsterAgentState,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    mcp_manager: &McpManagerState,
) -> Result<(), String> {
    let is_init = state.is_initialized().await;
    tracing::warn!("[AsterAgent] Agent 初始化状态: {}", is_init);
    if !is_init {
        tracing::warn!("[AsterAgent] Agent 未初始化，开始初始化...");
        state.init_agent_with_db(db).await?;
        tracing::warn!("[AsterAgent] Agent 初始化完成");
    } else {
        tracing::warn!("[AsterAgent] Agent 已初始化，检查 session_store...");
        let agent_arc = state.get_agent_arc();
        let guard = agent_arc.read().await;
        if let Some(agent) = guard.as_ref() {
            let has_store = agent.session_store().is_some();
            tracing::warn!("[AsterAgent] session_store 存在: {}", has_store);
        }
    }

    ensure_host_backed_config_tool_registered(app, state).await?;
    ensure_runtime_permission_request_hook_handler_registered(state, db, mcp_manager).await?;
    ensure_runtime_support_tools_registered(app, state, db, api_key_provider_service, mcp_manager)
        .await
}

pub(super) async fn prepare_runtime_turn_ingress_context(
    app: &AppHandle,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    logs: &LogState,
    config_manager: &GlobalConfigManagerState,
    request: &mut AsterChatRequest,
) -> Result<RuntimeTurnIngressContext, String> {
    let started_at = Instant::now();
    let session_id = request.session_id.clone();
    let event_name = request.event_name.clone();
    let should_resolve_session_recent_harness_context = extract_harness_string(
        request.metadata.as_ref(),
        &["theme", "harness_theme", "harnessTheme"],
    )
    .is_none()
        || extract_harness_string(request.metadata.as_ref(), &["session_mode", "sessionMode"])
            .is_none()
        || extract_harness_string(request.metadata.as_ref(), &["gate_key", "gateKey"]).is_none()
        || extract_harness_string(
            request.metadata.as_ref(),
            &["run_title", "runTitle", "title"],
        )
        .is_none()
        || extract_harness_string(request.metadata.as_ref(), &["content_id", "contentId"])
            .is_none();
    let user_lock_recovery_session_id = request.session_id.clone();
    merge_runtime_user_lock_capability_recovery_from_session(
        db,
        &user_lock_recovery_session_id,
        request,
    )
    .await;
    let provider_resolution_future =
        resolve_runtime_request_provider_resolution(app, db, api_key_provider_service, request);
    let session_recent_harness_context_future = async {
        if should_resolve_session_recent_harness_context {
            resolve_session_recent_harness_context(&request.session_id).await
        } else {
            Ok(SessionRecentHarnessContext::default())
        }
    };
    let (provider_resolution, session_recent_harness_context) = tokio::try_join!(
        provider_resolution_future,
        session_recent_harness_context_future
    )?;
    tracing::info!(
        "[AsterAgent][TTFT] ingress provider/session context resolved: session_id={}, event_name={}, elapsed_ms={}, resolved_recent_context={}",
        session_id,
        event_name,
        started_at.elapsed().as_millis(),
        should_resolve_session_recent_harness_context
    );

    request.metadata = merge_runtime_request_resolution_metadata(
        request.metadata.take(),
        &provider_resolution.task_profile,
        &provider_resolution.routing_decision,
        &provider_resolution.limit_state,
        &provider_resolution.cost_state,
        &provider_resolution.permission_state,
        provider_resolution.limit_event.as_ref(),
        provider_resolution.oem_policy.as_ref(),
        &provider_resolution.runtime_summary,
    );
    let permission_confirmation_session_id = request.session_id.clone();
    merge_runtime_permission_confirmation_from_session(
        db,
        &permission_confirmation_session_id,
        request,
    )
    .await;
    if let Some(resolved_provider_config) = provider_resolution.provider_config {
        request.provider_config = Some(resolved_provider_config);
    }
    if let Some(provider_config) = request.provider_config.as_mut() {
        ensure_provider_runtime_ready(provider_config).await?;
        let runtime_tool_call_decision =
            enrich_provider_config_with_runtime_tool_strategy(provider_config).await;
        if should_use_compact_native_tool_surface(provider_config) {
            request.metadata = merge_runtime_turn_default_tool_surface_metadata(
                request.metadata.take(),
                DEFAULT_NATIVE_TOOL_SURFACE_COMPACT,
            );
        }
        tracing::info!(
            "[AsterAgent] provider_config 运行时工具策略: provider_id={:?}, provider_name={}, model_name={}, strategy={:?}, toolshim_model={:?}, tools={}, function_calling={}, reasoning={}",
            provider_config.provider_id,
            provider_config.provider_name,
            provider_config.model_name,
            runtime_tool_call_decision.strategy,
            runtime_tool_call_decision.toolshim_model,
            runtime_tool_call_decision.capabilities.tools,
            runtime_tool_call_decision.capabilities.function_calling,
            runtime_tool_call_decision.capabilities.reasoning
        );
    }

    normalize_runtime_turn_request_metadata(
        request,
        session_recent_harness_context.theme.as_deref(),
        session_recent_harness_context.session_mode.as_deref(),
        session_recent_harness_context.gate_key.as_deref(),
        session_recent_harness_context.run_title.as_deref(),
        session_recent_harness_context.content_id.as_deref(),
        false,
    );
    backfill_runtime_access_policies(request);

    let owned_session_id = request.session_id.clone();

    let workspace_id = match resolve_runtime_turn_workspace_id(db, request) {
        Ok(workspace_id) => workspace_id,
        Err(message) => {
            logs.write()
                .await
                .add("error", &format!("[AsterAgent] {}", message));
            return Err(message);
        }
    };

    let manager = WorkspaceManager::new(db.clone());
    let workspace = match manager.get(&workspace_id) {
        Ok(Some(workspace)) => workspace,
        Ok(None) => {
            let message = format!("Workspace 不存在: {workspace_id}");
            logs.write()
                .await
                .add("error", &format!("[AsterAgent] {}", message));
            return Err(message);
        }
        Err(error) => {
            let message = format!("读取 workspace 失败: {error}");
            logs.write()
                .await
                .add("error", &format!("[AsterAgent] {}", message));
            return Err(message);
        }
    };
    let ensured = match ensure_workspace_ready_with_auto_relocate(&manager, &workspace) {
        Ok(result) => result,
        Err(message) => {
            logs.write()
                .await
                .add("error", &format!("[AsterAgent] {}", message));
            return Err(message);
        }
    };

    let runtime_config = config_manager.config();
    apply_web_search_runtime_env(&runtime_config);
    tracing::info!(
        "[AsterAgent][TTFT] ingress prepared: session_id={}, event_name={}, workspace_id={}, elapsed_ms={}",
        session_id,
        event_name,
        workspace_id,
        started_at.elapsed().as_millis()
    );

    Ok(RuntimeTurnIngressContext {
        owned_session_id,
        workspace_id,
        workspace_root: ensured.root_path.to_string_lossy().to_string(),
        workspace_settings: workspace.settings.clone(),
        resolved_turn_id: request
            .turn_id
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string()),
        runtime_config,
        session_recent_harness_context,
        workspace_repaired: ensured.repaired,
        workspace_warning: ensured.warning,
    })
}
