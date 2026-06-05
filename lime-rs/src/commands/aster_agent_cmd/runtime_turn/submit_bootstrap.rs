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

fn resolve_runtime_provider_continuation_state(
    _capability: ProviderContinuationCapability,
) -> ProviderContinuationState {
    ProviderContinuationState::history_replay_only()
}

fn non_empty_request_text(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn provider_not_configured_submit_error(request: &AsterChatRequest) -> String {
    let routing_decision = extract_runtime_resolution_payload::<
        lime_agent::SessionExecutionRuntimeRoutingDecision,
    >(request.metadata.as_ref(), "routing_decision");

    if let Some(decision) = routing_decision {
        if decision.routing_mode == "no_candidate" {
            return format!(
                "未找到可用的聊天模型，请先在模型选择器中选择已配置的 Provider 和模型后重试。{}",
                decision.decision_reason
            );
        }

        if decision.selected_provider.is_none() || decision.selected_model.is_none() {
            return format!(
                "当前聊天模型选择不完整，请先在模型选择器中选择已配置的 Provider 和模型后重试。{}",
                decision.decision_reason
            );
        }
    }

    let requested_provider = non_empty_request_text(request.provider_preference.as_deref());
    let requested_model = non_empty_request_text(request.model_preference.as_deref());
    match (requested_provider, requested_model) {
        (Some(provider), None) => format!(
            "当前只选择了 Provider {provider}，还缺少模型。请在模型选择器中选择完整的 Provider 和模型后重试。"
        ),
        (None, Some(model)) => format!(
            "当前只选择了模型 {model}，还缺少 Provider。请在模型选择器中选择完整的 Provider 和模型后重试。"
        ),
        _ => "未配置聊天模型，请先在模型选择器中选择已配置的 Provider 和模型后重试。".to_string(),
    }
}

pub(super) async fn prepare_runtime_turn_submit_bootstrap(
    host: RuntimeTurnHostContext<'_>,
    request: &AsterChatRequest,
    session_id: &str,
    workspace_root: &str,
    _workspace_settings: &WorkspaceSettings,
    runtime_config: &lime_core::config::Config,
    runtime_chat_mode: RuntimeChatMode,
    execution_profile: TurnExecutionProfile,
    effective_strategy: AsterExecutionStrategy,
    request_tool_policy: &RequestToolPolicy,
    turn_input_builder: &mut TurnInputEnvelopeBuilder,
) -> Result<RuntimeTurnSubmitBootstrap, String> {
    if !host.state.is_provider_configured().await {
        return Err(provider_not_configured_submit_error(request));
    }

    let effective_provider_config = host.state.get_provider_config().await;
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
    let provider_continuation_state =
        resolve_runtime_provider_continuation_state(provider_continuation_capability);
    if provider_continuation_capability.supports_remote_continuation() {
        tracing::info!(
            "[AsterAgent][TTFT] 当前回合按无状态模型交接执行，不恢复上一条 terminal run 的 provider continuation: session_id={}, capability={:?}",
            session_id,
            provider_continuation_capability
        );
    }
    turn_input_builder
        .set_provider_continuation_capability(provider_continuation_capability)
        .set_provider_continuation(provider_continuation_state);

    let request_metadata = request.metadata.clone();
    let bypass_workspace_restrictions = matches!(
        resolve_runtime_access_mode_from_request(request),
        Some(lime_agent::SessionExecutionRuntimeAccessMode::FullAccess)
    );
    let explicit_local_focus_paths =
        extract_explicit_local_focus_paths_from_message(&request.message);
    let sandbox_outcome = apply_workspace_sandbox_permissions(
        host.state,
        host.config_manager,
        host.db,
        host.api_key_provider_service,
        host.logs,
        host.mcp_manager,
        host.automation_state,
        host.app,
        session_id,
        request_metadata.as_ref(),
        workspace_root,
        runtime_chat_mode,
        execution_profile,
        request_tool_policy,
        effective_strategy,
        bypass_workspace_restrictions,
        &explicit_local_focus_paths,
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
                host.emit_runtime_event(
                    &request.event_name,
                    &warning_event,
                    "发送 sandbox 降级提醒失败",
                );
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
        tracker: ExecutionTracker::new(host.db.clone()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_runtime_provider_continuation_state_keeps_model_handoff_stateless() {
        assert_eq!(
            resolve_runtime_provider_continuation_state(
                ProviderContinuationCapability::PreviousResponseId,
            ),
            ProviderContinuationState::HistoryReplayOnly
        );
        assert_eq!(
            resolve_runtime_provider_continuation_state(
                ProviderContinuationCapability::ProviderSessionToken,
            ),
            ProviderContinuationState::HistoryReplayOnly
        );
    }

    #[test]
    fn provider_not_configured_submit_error_uses_routing_resolution_reason() {
        let request = AsterChatRequest {
            message: "分析本地文件夹".to_string(),
            session_id: "session-model-missing".to_string(),
            event_name: "agent-event".to_string(),
            images: None,
            provider_config: None,
            provider_preference: None,
            model_preference: Some("gpt-5.5".to_string()),
            reasoning_effort: None,
            thinking_enabled: None,
            approval_policy: None,
            sandbox_policy: None,
            project_id: None,
            workspace_id: "workspace-1".to_string(),
            web_search: None,
            search_mode: None,
            execution_strategy: None,
            auto_continue: None,
            system_prompt: None,
            metadata: Some(serde_json::json!({
                "lime_runtime": {
                    "routing_decision": {
                        "routingMode": "no_candidate",
                        "decisionSource": "request_override",
                        "decisionReason": "当前回合传入了 provider/model 偏好，但没有找到可恢复的 provider 默认值。",
                        "selectedProvider": null,
                        "selectedModel": null,
                        "requestedProvider": null,
                        "requestedModel": "gpt-5.5",
                        "candidateCount": 0,
                        "fallbackChain": [],
                        "serviceModelSlot": null
                    }
                }
            })),
            turn_id: None,
            queue_if_busy: None,
            queued_turn_id: None,
        };

        let message = provider_not_configured_submit_error(&request);

        assert!(message.contains("未找到可用的聊天模型"));
        assert!(message.contains("没有找到可恢复的 provider 默认值"));
        assert!(!message.contains("aster_agent_configure_provider"));
    }
}
