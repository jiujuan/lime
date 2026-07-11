use crate::protocol::{AgentEvent as RuntimeAgentEvent, AgentRuntimeStatus};
use crate::runtime_store_aster_adapter::{
    runtime_item_store_from_aster, runtime_thread_turn_store_from_aster, AsterThreadRuntimeStore,
};
use agent_runtime::session_config::AgentSessionConfig;
use std::path::PathBuf;
use std::sync::Arc;
use thread_store::runtime_status_item::{
    upsert_runtime_status_item_record, RuntimeStatusItemEventKind, RuntimeStatusItemRecordInput,
};
use thread_store::runtime_store::{
    ensure_runtime_turn_record, RuntimeTurnEnsureInput, RuntimeTurnScopeInput,
};

pub(super) async fn upsert_runtime_status_item(
    runtime_store: Arc<AsterThreadRuntimeStore>,
    session_config: &AgentSessionConfig,
    status: &AgentRuntimeStatus,
) -> Result<Option<RuntimeAgentEvent>, String> {
    let turn_store = runtime_thread_turn_store_from_aster(runtime_store.clone());
    let item_store = runtime_item_store_from_aster(runtime_store);
    let thread_id = resolved_thread_id(session_config);
    if turn_store
        .get_thread(&thread_id)
        .await
        .map_err(|error| error.to_string())?
        .is_none()
    {
        return Ok(None);
    }
    let turn = ensure_runtime_turn_record(
        turn_store.as_ref(),
        RuntimeTurnEnsureInput {
            session_id: session_config.id.clone(),
            working_dir: resolved_working_dir(session_config),
            scope: RuntimeTurnScopeInput {
                thread_id: Some(thread_id),
                turn_id: session_config.turn_id.clone(),
            },
            input_text: None,
            context_override: session_config.turn_context.clone(),
            output_schema_runtime: None,
        },
    )
    .await
    .map_err(|error| error.to_string())?;
    let item = upsert_runtime_status_item_record(
        item_store.as_ref(),
        RuntimeStatusItemRecordInput {
            thread_id: turn.thread_id,
            turn_id: turn.id,
            phase: status.phase.clone(),
            title: status.title.clone(),
            detail: status.detail.clone(),
            checkpoints: status.checkpoints.clone(),
        },
    )
    .await
    .map_err(|error| error.to_string())?;
    let Some(projected_item) =
        crate::runtime_timeline_adapter::project_runtime_timeline_item_record(&item.item)
    else {
        return Ok(None);
    };
    let projected_item = crate::protocol_projection::project_item_runtime(projected_item);

    Ok(Some(match item.event_kind {
        RuntimeStatusItemEventKind::Started => RuntimeAgentEvent::ItemStarted {
            item: projected_item,
        },
        RuntimeStatusItemEventKind::Updated => RuntimeAgentEvent::ItemUpdated {
            item: projected_item,
        },
    }))
}

fn resolved_thread_id(session_config: &AgentSessionConfig) -> String {
    session_config
        .thread_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(&session_config.id)
        .to_string()
}

fn resolved_working_dir(session_config: &AgentSessionConfig) -> PathBuf {
    session_config
        .turn_context
        .as_ref()
        .and_then(|context| context.cwd.clone())
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}
