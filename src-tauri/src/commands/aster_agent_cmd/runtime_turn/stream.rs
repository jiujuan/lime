use super::*;

#[path = "stream/attempt.rs"]
mod attempt;
#[path = "stream/events.rs"]
mod events;
#[path = "stream/finalize.rs"]
mod finalize;
#[path = "stream/prelude.rs"]
mod prelude;
#[path = "stream/scope.rs"]
mod scope;
#[path = "stream/strategy.rs"]
mod strategy;

pub(super) use self::events::runtime_tool_name_from_result_metadata;
#[cfg(test)]
pub(super) use self::events::{
    project_runtime_tool_profile_events, should_emit_runtime_stream_event_directly,
    should_record_runtime_stream_event_on_timeline,
    timeline_recorder_emits_equivalent_runtime_event, RuntimeToolProfileState,
};
pub(super) use self::finalize::{build_runtime_run_finish_decision, finalize_runtime_turn_result};
pub(super) use self::prelude::prepare_runtime_turn_prelude;
pub(super) use self::scope::with_runtime_turn_session_scope;
pub(super) use self::strategy::execute_runtime_stream_with_strategy;

pub(super) async fn execute_aster_chat_request(
    app: &AppHandle,
    state: &AsterAgentState,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    logs: &LogState,
    config_manager: &GlobalConfigManagerState,
    mcp_manager: &McpManagerState,
    automation_state: &AutomationServiceState,
    request: AsterChatRequest,
) -> Result<(), String> {
    tracing::info!(
        "[AsterAgent] 发送流式消息: session={}, event={}",
        request.session_id,
        request.event_name
    );
    emit_submit_accepted_runtime_status(app, &request.event_name);
    let _keepalive_guard =
        RuntimeTurnKeepaliveGuard::start(app.clone(), request.event_name.clone());

    execute_runtime_turn_pipeline(
        app,
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
        request,
    )
    .await
}
