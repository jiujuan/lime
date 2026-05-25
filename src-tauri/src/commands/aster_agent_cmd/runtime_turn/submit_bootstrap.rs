use super::runtime_turn_agent_app_skill_contract::resolve_agent_app_required_skill_tool_allowlist;
use super::runtime_turn_request_metadata::resolve_runtime_access_mode_from_request;
use super::*;

pub(super) struct RuntimeTurnSubmitBootstrap {
    pub(super) request_metadata: Option<serde_json::Value>,
    pub(super) runtime_memory_config: lime_core::config::MemoryConfig,
    pub(super) provider_continuation_capability: ProviderContinuationCapability,
    pub(super) tracker: ExecutionTracker,
    pub(super) model_skill_tool_enabled: bool,
    pub(super) model_skill_tool_allowed_skill_names: Option<Vec<String>>,
    pub(super) model_skill_tool_allowed_skill_sources:
        Option<Vec<lime_agent::tools::SkillToolSessionSkillSource>>,
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn prepare_runtime_turn_submit_bootstrap(
    app: &AppHandle,
    state: &AsterAgentState,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    logs: &LogState,
    config_manager: &GlobalConfigManagerState,
    mcp_manager: &McpManagerState,
    automation_state: &AutomationServiceState,
    request: &AsterChatRequest,
    session_id: &str,
    workspace_root: &str,
    workspace_settings: &WorkspaceSettings,
    runtime_config: &lime_core::config::Config,
    runtime_chat_mode: RuntimeChatMode,
    execution_profile: TurnExecutionProfile,
    requested_strategy: AsterExecutionStrategy,
    request_tool_policy: &RequestToolPolicy,
    turn_input_builder: &mut TurnInputEnvelopeBuilder,
) -> Result<RuntimeTurnSubmitBootstrap, String> {
    if !state.is_provider_configured().await {
        return Err("Provider 未配置，请先调用 aster_agent_configure_provider".to_string());
    }

    maybe_auto_compact_runtime_session_before_turn(
        app,
        state,
        db,
        config_manager,
        session_id,
        &request.event_name,
        workspace_settings,
    )
    .await?;

    let effective_provider_config = state.get_provider_config().await;
    let provider_routing_snapshot =
        effective_provider_config
            .as_ref()
            .map(|config| TurnProviderRoutingSnapshot {
                provider_name: config.provider_name.clone(),
                provider_selector: config.provider_selector.clone(),
                model_name: config.model_name.clone(),
                credential_uuid: config.credential_uuid.clone(),
                configured_from_request: request.provider_config.is_some(),
                used_inline_api_key: request
                    .provider_config
                    .as_ref()
                    .and_then(|config| config.api_key.as_ref())
                    .is_some(),
            });
    turn_input_builder.set_provider_routing(provider_routing_snapshot.clone());

    let provider_continuation_capability = effective_provider_config
        .as_ref()
        .map(|config| config.provider_continuation_capability())
        .unwrap_or(ProviderContinuationCapability::HistoryReplayOnly);
    let configured_provider_continuation_state = effective_provider_config
        .as_ref()
        .map(|config| config.provider_continuation_state())
        .unwrap_or_else(ProviderContinuationState::history_replay_only);
    let restored_provider_continuation_state = load_previous_provider_continuation_state(
        db,
        session_id,
        provider_routing_snapshot.as_ref(),
        provider_continuation_capability,
    );
    let provider_continuation_state = if matches!(
        restored_provider_continuation_state,
        ProviderContinuationState::HistoryReplayOnly
    ) {
        configured_provider_continuation_state
    } else {
        tracing::info!(
            "[AsterAgent] 恢复上一条 terminal run 的 provider continuation: session_id={}, kind={}",
            session_id,
            restored_provider_continuation_state.kind()
        );
        restored_provider_continuation_state
    };
    turn_input_builder
        .set_provider_continuation_capability(provider_continuation_capability)
        .set_provider_continuation(provider_continuation_state);

    let request_metadata = request.metadata.clone();
    let bypass_workspace_restrictions = matches!(
        resolve_runtime_access_mode_from_request(request),
        Some(lime_agent::SessionExecutionRuntimeAccessMode::FullAccess)
    );
    let sandbox_outcome = apply_workspace_sandbox_permissions(
        state,
        config_manager,
        db,
        api_key_provider_service,
        logs,
        mcp_manager,
        automation_state,
        app,
        session_id,
        request_metadata.as_ref(),
        workspace_root,
        runtime_chat_mode,
        execution_profile,
        request_tool_policy,
        requested_strategy,
        bypass_workspace_restrictions,
    )
    .await
    .map_err(|error| format!("注入 workspace 安全策略失败: {error}"))?;

    match sandbox_outcome {
        WorkspaceSandboxApplyOutcome::Applied { sandbox_type } => {
            tracing::info!(
                "[AsterAgent] 已启用 workspace 本地 sandbox: root={}, type={}",
                workspace_root,
                sandbox_type
            );
        }
        WorkspaceSandboxApplyOutcome::DisabledByConfig => {
            tracing::info!(
                "[AsterAgent] workspace 本地 sandbox 已关闭，继续使用普通执行模式: root={}",
                workspace_root
            );
        }
        WorkspaceSandboxApplyOutcome::UnavailableFallback {
            warning_message,
            notify_user,
        } => {
            tracing::warn!(
                "[AsterAgent] workspace 本地 sandbox 不可用，已降级为普通执行: root={}, warning={}",
                workspace_root,
                warning_message
            );
            if notify_user {
                let warning_event = RuntimeAgentEvent::Warning {
                    code: Some(WORKSPACE_SANDBOX_FALLBACK_WARNING_CODE.to_string()),
                    message: warning_message,
                };
                if let Err(error) = app.emit(&request.event_name, &warning_event) {
                    tracing::error!("[AsterAgent] 发送 sandbox 降级提醒失败: {}", error);
                }
            }
        }
    }

    let workspace_skill_runtime_enable =
        crate::services::runtime_skill_binding_service::resolve_workspace_skill_runtime_enable(
            request_metadata.as_ref(),
            workspace_root,
        )?;
    let agent_app_required_skill_names =
        resolve_agent_app_required_skill_tool_allowlist(request_metadata.as_ref());
    let model_skill_tool_allowed_skill_sources =
        workspace_skill_runtime_enable.as_ref().map(|projection| {
            projection
                .bindings
                .iter()
                .map(|binding| lime_agent::tools::SkillToolSessionSkillSource {
                    workspace_root: projection.workspace_root.clone(),
                    source: projection.source.clone(),
                    approval: projection.approval.clone(),
                    directory: binding.directory.clone(),
                    registered_skill_directory: binding.registered_skill_directory.clone(),
                    skill_name: binding.skill_name.clone(),
                    source_draft_id: binding.source_draft_id.clone(),
                    source_verification_report_id: binding.source_verification_report_id.clone(),
                    permission_summary: binding.permission_summary.clone(),
                })
                .collect::<Vec<_>>()
        });
    if let Some(projection) = workspace_skill_runtime_enable.as_ref() {
        let loaded_skill_names = lime_agent::load_workspace_lime_skills(workspace_root)?;
        tracing::info!(
            "[AsterAgent] workspace skill runtime enable 已启用: workspace_root={}, bindings={}, allowed_skills={}, loaded_skills={}",
            projection.workspace_root,
            projection.bindings.len(),
            projection.allowed_skill_names.join(","),
            loaded_skill_names.join(",")
        );
    }

    Ok(RuntimeTurnSubmitBootstrap {
        model_skill_tool_enabled: matches!(execution_profile, TurnExecutionProfile::FullRuntime)
            && (should_enable_model_skill_tool(request_metadata.as_ref())
                || workspace_skill_runtime_enable.is_some()
                || agent_app_required_skill_names.is_some()),
        model_skill_tool_allowed_skill_names: agent_app_required_skill_names,
        model_skill_tool_allowed_skill_sources,
        request_metadata,
        runtime_memory_config: runtime_config.memory.clone(),
        provider_continuation_capability,
        tracker: ExecutionTracker::new(db.clone()),
    })
}
