use super::runtime_turn_image_policy::{
    merge_runtime_image_input_policy_metadata, resolve_runtime_image_input_policy,
};
use super::runtime_turn_prompt_composition::{
    apply_turn_prompt_stage, build_fast_chat_system_prompt, build_full_runtime_system_prompt,
};
use super::runtime_turn_request_metadata::{
    apply_code_orchestrated_runtime_defaults, backfill_runtime_access_policies,
    merge_runtime_turn_default_tool_surface_metadata, merge_runtime_turn_tool_surface_metadata,
    normalize_runtime_turn_request_metadata, resolve_fast_chat_tool_surface_mode,
    resolve_mcp_prewarm_skip_reason, resolve_runtime_turn_workspace_id,
    resolve_turn_execution_profile, should_prewarm_mcp_runtime,
};
use super::runtime_turn_stream::with_runtime_turn_session_scope;
use super::runtime_turn_submit_bootstrap::{
    prepare_runtime_turn_submit_bootstrap, RuntimeTurnSubmitBootstrap,
};
use super::*;

#[path = "flow/build.rs"]
mod build;
#[path = "flow/execution.rs"]
mod execution;
#[path = "flow/ingress.rs"]
mod ingress;
#[path = "flow/preparation.rs"]
mod preparation;
#[path = "flow/prompt.rs"]
mod prompt;

use self::build::prepare_runtime_turn_execution;
pub(super) use self::execution::{
    RuntimeTurnBuildArtifacts, RuntimeTurnExecutionContext, RuntimeTurnPreparedExecution,
    RuntimeTurnStreamSessionConfigState,
};
use self::ingress::{
    prepare_runtime_turn_entry, prepare_runtime_turn_ingress_context, RuntimeTurnIngressContext,
};
use self::preparation::{prepare_runtime_turn_submit_preparation, RuntimeTurnSubmitPreparation};
#[cfg(test)]
pub(super) use self::prompt::resolve_runtime_turn_base_system_prompt;
use self::prompt::{prepare_runtime_turn_prompt_strategy, RuntimeTurnPromptStrategy};
pub(crate) use self::prompt::{
    request_metadata_has_fast_response_routing, should_override_system_prompt_for_fast_response,
};

#[allow(clippy::too_many_arguments)]
async fn execute_runtime_turn_submit(
    app: &AppHandle,
    state: &AsterAgentState,
    db: &DbConnection,
    request: &AsterChatRequest,
    session_id: &str,
    workspace_id: &str,
    workspace_root: &str,
    resolved_turn_id: &str,
    submit_preparation: RuntimeTurnSubmitPreparation,
    cancel_token: CancellationToken,
) -> Result<(), String> {
    let started_at = Instant::now();
    let RuntimeTurnSubmitPreparation {
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
    } = submit_preparation;
    tracing::info!(
        "[AsterAgent][TTFT] turn execution submit start: session_id={}, event_name={}, profile={:?}, strategy={:?}, elapsed_ms=0",
        session_id,
        request.event_name,
        execution_profile,
        effective_strategy
    );

    sync_browser_assist_runtime_hint(session_id, submit_bootstrap.request_metadata.as_ref()).await;

    let agent_arc = state.get_agent_arc();
    let provider_model_name = request
        .provider_config
        .as_ref()
        .map(|config| config.model_name.as_str());
    let auto_continue_metadata = auto_continue_config.clone();
    let runtime_turn_prepared_execution = prepare_runtime_turn_execution(
        &agent_arc,
        db,
        request,
        session_id,
        workspace_id,
        resolved_turn_id,
        execution_profile,
        requested_strategy,
        effective_strategy,
        &request_tool_policy,
        include_context_trace,
        runtime_chat_mode,
        system_prompt_source,
        system_prompt,
        turn_input_builder,
        auto_continue_enabled,
        auto_continue_metadata.as_ref(),
        session_recent_preferences.as_ref(),
        &session_state_snapshot,
        submit_bootstrap.request_metadata.as_ref(),
    )
    .await?;
    tracing::info!(
        "[AsterAgent][TTFT] turn execution prepared: session_id={}, event_name={}, thread_id={}, turn_id={}, elapsed_ms={}",
        session_id,
        request.event_name,
        runtime_turn_prepared_execution.thread_id(),
        runtime_turn_prepared_execution.turn_id(),
        started_at.elapsed().as_millis()
    );
    runtime_turn_prepared_execution.emit_profile_turn_submitted(app, &request.event_name);
    runtime_turn_prepared_execution.emit_profile_task_started(app, &request.event_name);

    let guard = agent_arc.read().await;
    let Some(agent) = guard.as_ref() else {
        let error = "Agent not initialized".to_string();
        fail_runtime_turn_before_model_execution(
            app,
            &request.event_name,
            &runtime_turn_prepared_execution
                .runtime_turn_execution_context
                .timeline_recorder,
            &runtime_turn_prepared_execution
                .runtime_turn_execution_context
                .profile_stream,
            &runtime_turn_prepared_execution
                .runtime_turn_execution_context
                .task_profile_refs,
            &error,
        );
        return Err(error);
    };
    if let Err(error) = sync_runtime_skill_source_agent(session_id, agent).await {
        tracing::warn!(
            "[AsterAgent] 同步 runtime skill source agent 失败，已降级继续执行: {}",
            error
        );
    }
    tracing::info!(
        "[AsterAgent][TTFT] turn stream dispatch: session_id={}, event_name={}, elapsed_ms={}",
        session_id,
        request.event_name,
        started_at.elapsed().as_millis()
    );
    runtime_turn_prepared_execution
        .emit_prelude_and_execute(
            agent,
            &submit_bootstrap.tracker,
            app,
            state,
            db,
            request,
            &submit_bootstrap.runtime_memory_config,
            session_id,
            workspace_root,
            workspace_id,
            execution_profile,
            submit_bootstrap.request_metadata.as_ref(),
            submit_bootstrap.provider_continuation_capability,
            cancel_token,
            effective_strategy,
            &request_tool_policy,
            provider_model_name,
            session_recent_preferences.as_ref(),
        )
        .await
}

#[allow(clippy::too_many_arguments)]
async fn execute_runtime_turn_with_session_scope(
    app: &AppHandle,
    state: &AsterAgentState,
    db: &DbConnection,
    request: &AsterChatRequest,
    session_id: &str,
    workspace_id: &str,
    workspace_root: &str,
    resolved_turn_id: &str,
    submit_preparation: RuntimeTurnSubmitPreparation,
) -> Result<(), String> {
    let model_skill_tool_enabled = submit_preparation.model_skill_tool_enabled();
    let model_skill_tool_allowed_skill_names =
        submit_preparation.model_skill_tool_allowed_skill_names();
    let model_skill_tool_allowed_skill_sources =
        submit_preparation.model_skill_tool_allowed_skill_sources();
    with_runtime_turn_session_scope(
        state,
        session_id,
        model_skill_tool_enabled,
        model_skill_tool_allowed_skill_names,
        model_skill_tool_allowed_skill_sources,
        move |cancel_token| async move {
            execute_runtime_turn_submit(
                app,
                state,
                db,
                request,
                session_id,
                workspace_id,
                workspace_root,
                resolved_turn_id,
                submit_preparation,
                cancel_token,
            )
            .await
        },
    )
    .await
}

#[allow(clippy::too_many_arguments)]
pub(super) async fn execute_runtime_turn_pipeline(
    app: &AppHandle,
    state: &AsterAgentState,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    logs: &LogState,
    config_manager: &GlobalConfigManagerState,
    mcp_manager: &McpManagerState,
    automation_state: &AutomationServiceState,
    mut request: AsterChatRequest,
) -> Result<(), String> {
    prepare_runtime_turn_entry(app, state, db, api_key_provider_service, mcp_manager).await?;
    let RuntimeTurnIngressContext {
        owned_session_id,
        workspace_id,
        workspace_root,
        workspace_settings,
        resolved_turn_id,
        runtime_config,
        session_recent_harness_context,
        workspace_repaired,
        workspace_warning,
    } = prepare_runtime_turn_ingress_context(
        app,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        &mut request,
    )
    .await?;

    enforce_runtime_turn_user_prompt_submit_hooks_with_runtime(
        &request.message,
        owned_session_id.as_str(),
        workspace_root.as_str(),
        db,
        state,
        mcp_manager,
    )
    .await?;

    let session_id = owned_session_id.as_str();
    let submit_preparation = prepare_runtime_turn_submit_preparation(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
        &mut request,
        session_id,
        workspace_id.as_str(),
        workspace_root.as_str(),
        resolved_turn_id.as_str(),
        &workspace_settings,
        &runtime_config,
        workspace_repaired,
        workspace_warning,
        &session_recent_harness_context,
    )
    .await?;

    execute_runtime_turn_with_session_scope(
        app,
        state,
        db,
        &request,
        session_id,
        workspace_id.as_str(),
        workspace_root.as_str(),
        resolved_turn_id.as_str(),
        submit_preparation,
    )
    .await
}
