use super::*;

pub(super) async fn sync_runtime_skill_source_agent(
    session_id: &str,
    agent: &Agent,
) -> Result<(), String> {
    let donor = Agent::new().with_shared_native_tool_surface_from(agent);
    donor
        .extension_manager
        .set_context(PlatformExtensionContext {
            session_id: Some(session_id.to_string()),
            extension_manager: Some(Arc::downgrade(&donor.extension_manager)),
        })
        .await;
    if let Err(error) = donor.inherit_runtime_tool_surface_from(agent).await {
        tracing::warn!(
            "[AsterAgent] 继承 runtime extension 工具面失败，保留 native 工具面供 Skill 使用: session={}, error={}",
            session_id,
            error
        );
    }
    SkillTool::register_source_agent_for_session(session_id.to_string(), Arc::new(donor)).await;
    Ok(())
}

pub(super) async fn ensure_host_backed_config_tool_registered(
    app: &AppHandle,
    state: &AsterAgentState,
) -> Result<(), String> {
    let agent_arc = state.get_agent_arc();
    let guard = agent_arc.read().await;
    let agent = guard
        .as_ref()
        .ok_or_else(|| "Agent not initialized".to_string())?;
    let registry_arc = agent.tool_registry().clone();
    drop(guard);

    let mut registry = registry_arc.write().await;
    if !registry.contains_native("Config") {
        return Ok(());
    }

    let write_app = app.clone();
    registry.register(Box::new(ConfigTool::new().with_voice_enabled_callbacks(
        Arc::new(move || {
            Box::pin(async move {
                let config = crate::voice::config::load_voice_config()?;
                Ok(config.enabled)
            })
        }),
        Arc::new(move |enabled| {
            let write_app = write_app.clone();
            Box::pin(async move { crate::voice::set_voice_input_enabled(&write_app, enabled) })
        }),
    )));

    Ok(())
}

pub(super) async fn ensure_runtime_permission_request_hook_handler_registered(
    state: &AsterAgentState,
    db: &DbConnection,
    mcp_manager: &McpManagerState,
) -> Result<(), String> {
    let db = db.clone();
    let hook_state = state.clone();
    let mcp_manager = mcp_manager.clone();

    state
        .with_agent_mut(move |agent| {
            let db = db.clone();
            let hook_state = hook_state.clone();
            let mcp_manager = mcp_manager.clone();

            agent.set_permission_request_hook_handler(Some(Arc::new(move |context| {
                let db = db.clone();
                let hook_state = hook_state.clone();
                let mcp_manager = mcp_manager.clone();
                Box::pin(async move {
                    decide_runtime_permission_request_project_hooks_for_session_with_runtime(
                        &db,
                        &hook_state,
                        &mcp_manager,
                        &context.session_id,
                        &context.tool_name,
                        context.tool_input,
                        &context.tool_use_id,
                        context.permission_mode,
                    )
                    .await
                })
            })));
        })
        .await
}
