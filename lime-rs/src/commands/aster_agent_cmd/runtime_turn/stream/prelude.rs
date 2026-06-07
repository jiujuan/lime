use super::*;

#[allow(clippy::too_many_arguments)]
pub(in crate::commands::aster_agent_cmd::runtime_turn) async fn prepare_runtime_turn_prelude(
    agent: &Agent,
    host: RuntimeTurnHostContext<'_>,
    request: &AsterChatRequest,
    timeline_recorder: &Arc<Mutex<AgentTimelineRecorder>>,
    workspace_root: &str,
    runtime_status_session_config: &aster::agents::types::SessionConfig,
    effective_strategy: AsterExecutionStrategy,
    request_tool_policy: &RequestToolPolicy,
    model_name: Option<&str>,
    session_recent_preferences: Option<&lime_agent::SessionExecutionRuntimePreferences>,
    service_skill_preload: Option<&ServiceSkillLaunchPreloadExecution>,
) -> Result<(), String> {
    if let Err(error) = agent
        .ensure_runtime_turn_initialized(
            runtime_status_session_config,
            Some(request.message.clone()),
        )
        .await
    {
        tracing::warn!(
            "[AsterAgent] 初始化 runtime turn 失败，后续降级继续: {}",
            error
        );
    }

    let (initial_runtime_status, decided_runtime_status) = build_turn_runtime_statuses(
        request,
        effective_strategy,
        request_tool_policy,
        model_name,
        session_recent_preferences,
    )
    .await?;
    let project_runtime_status_to_timeline =
        should_project_runtime_status_to_timeline(request.metadata.as_ref());
    for status in [initial_runtime_status, decided_runtime_status] {
        emit_runtime_status_with_projection(
            agent,
            host.app,
            &request.event_name,
            timeline_recorder,
            workspace_root,
            runtime_status_session_config,
            status,
            project_runtime_status_to_timeline,
        )
        .await;
    }

    emit_runtime_request_resolution_events(
        host.app,
        &request.event_name,
        timeline_recorder,
        workspace_root,
        request.metadata.as_ref(),
    );

    if let Some(preload) = service_skill_preload {
        let skill_launch_host = RuntimeSkillLaunchHostContext::new(
            host.app,
            &request.event_name,
            timeline_recorder,
            workspace_root,
        );
        emit_service_skill_preload_runtime_events(skill_launch_host, preload);
    }

    Ok(())
}
