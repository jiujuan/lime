use crate::runtime_store_aster_adapter::{
    runtime_thread_turn_store_from_aster, runtime_turn_record_from_aster, AsterThreadRuntimeStore,
};
use agent_runtime::session_config::AgentSessionConfig;
use aster::AgentEvent as AsterAgentEvent;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use thread_store::runtime_snapshot::RuntimeTurnStatusRecord;
use thread_store::runtime_store::{
    complete_runtime_turn_record, ensure_runtime_turn_record, RuntimeTurnEnsureInput,
    RuntimeTurnScopeInput,
};

pub(super) async fn ensure_current_turn(
    runtime_store: Arc<AsterThreadRuntimeStore>,
    session_config: &AgentSessionConfig,
    input_text: Option<String>,
    working_directory: Option<&Path>,
) -> Result<Option<String>, String> {
    let turn_store = runtime_thread_turn_store_from_aster(runtime_store);
    let turn = ensure_runtime_turn_record(
        turn_store.as_ref(),
        RuntimeTurnEnsureInput {
            session_id: session_config.id.clone(),
            working_dir: resolved_working_dir(working_directory, &session_config.turn_context),
            scope: RuntimeTurnScopeInput {
                thread_id: session_config.thread_id.clone(),
                turn_id: session_config.turn_id.clone(),
            },
            input_text,
            context_override: session_config.turn_context.clone(),
            output_schema_runtime: None,
        },
    )
    .await
    .map_err(|error| error.to_string())?;

    Ok(Some(turn.id))
}

pub(super) async fn persist_aster_turn_started_event(
    runtime_store: Arc<AsterThreadRuntimeStore>,
    event: &AsterAgentEvent,
    working_directory: Option<&Path>,
) -> Result<Option<String>, String> {
    let turn = match event {
        AsterAgentEvent::TurnStarted { turn } => turn,
        _ => return Ok(None),
    };
    let record = runtime_turn_record_from_aster(turn);
    let turn_store = runtime_thread_turn_store_from_aster(runtime_store);
    let turn = ensure_runtime_turn_record(
        turn_store.as_ref(),
        RuntimeTurnEnsureInput {
            session_id: record.session_id.clone(),
            working_dir: resolved_working_dir(working_directory, &record.context_override),
            scope: RuntimeTurnScopeInput {
                thread_id: Some(record.thread_id.clone()),
                turn_id: Some(record.id.clone()),
            },
            input_text: record.input_text,
            context_override: record.context_override,
            output_schema_runtime: record.output_schema_runtime,
        },
    )
    .await
    .map_err(|error| error.to_string())?;

    Ok(Some(turn.id))
}

pub(super) async fn complete_aster_turn(
    runtime_store: Arc<AsterThreadRuntimeStore>,
    turn_id: &str,
    status: RuntimeTurnStatusRecord,
    error_message: Option<String>,
) -> Result<(), String> {
    let turn_store = runtime_thread_turn_store_from_aster(runtime_store);
    complete_runtime_turn_record(turn_store.as_ref(), turn_id, status, error_message)
        .await
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn resolved_working_dir(
    working_directory: Option<&Path>,
    context_override: &Option<agent_protocol::turn_context::TurnContextOverride>,
) -> PathBuf {
    working_directory
        .map(Path::to_path_buf)
        .or_else(|| {
            context_override
                .as_ref()
                .and_then(|context| context.cwd.clone())
        })
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}
