//! Session execution runtime snapshot adapter.
//!
//! The session execution runtime builder consumes Lime-owned snapshot records.

use agent_runtime::session_execution::{
    project_session_execution_runtime_snapshot, SessionExecutionRuntimeSnapshotSource,
    SessionExecutionRuntimeThreadSource, SessionExecutionRuntimeTurnSource,
};
use thread_store::runtime_snapshot::{
    RuntimeSessionSnapshotRecord, RuntimeTurnSnapshotRecord, RuntimeTurnStatusRecord,
};

use crate::runtime_store_aster_adapter::runtime_output_schema_from_aster;
use crate::session_execution_runtime::SessionExecutionRuntimeSnapshotProjection;

pub(crate) fn project_aster_output_schema_runtime(
    runtime: &aster::session::TurnOutputSchemaRuntime,
) -> agent_protocol::turn_context::TurnOutputSchemaRuntime {
    runtime_output_schema_from_aster(runtime)
}

pub(crate) fn project_session_execution_runtime_snapshot_record(
    snapshot: &RuntimeSessionSnapshotRecord,
) -> SessionExecutionRuntimeSnapshotProjection {
    project_session_execution_runtime_snapshot(&session_execution_runtime_snapshot_from_record(
        snapshot,
    ))
}

fn map_runtime_turn_status(status: RuntimeTurnStatusRecord) -> String {
    match status {
        RuntimeTurnStatusRecord::Queued => "queued".to_string(),
        RuntimeTurnStatusRecord::Running => "running".to_string(),
        RuntimeTurnStatusRecord::Completed => "completed".to_string(),
        RuntimeTurnStatusRecord::Failed => "failed".to_string(),
        RuntimeTurnStatusRecord::Aborted => "aborted".to_string(),
    }
}

fn session_execution_runtime_snapshot_from_record(
    snapshot: &RuntimeSessionSnapshotRecord,
) -> SessionExecutionRuntimeSnapshotSource<crate::turn_context_configuration::AgentTurnContext> {
    SessionExecutionRuntimeSnapshotSource {
        threads: snapshot
            .threads
            .iter()
            .map(|thread| SessionExecutionRuntimeThreadSource {
                updated_at_ms: thread.updated_at.timestamp_millis(),
                metadata: thread.metadata.clone(),
                turns: thread
                    .turns
                    .iter()
                    .map(session_execution_runtime_turn_from_record)
                    .collect(),
            })
            .collect(),
    }
}

fn session_execution_runtime_turn_from_record(
    turn: &RuntimeTurnSnapshotRecord,
) -> SessionExecutionRuntimeTurnSource<crate::turn_context_configuration::AgentTurnContext> {
    let context = turn.context_override.clone();
    let context_approval_policy = context
        .as_ref()
        .and_then(|value| value.approval_policy.clone());
    let context_sandbox_policy = context
        .as_ref()
        .and_then(|value| value.sandbox_policy.clone());
    let context_metadata = context
        .as_ref()
        .map(|value| value.metadata.clone())
        .unwrap_or_default();

    SessionExecutionRuntimeTurnSource {
        id: turn.id.clone(),
        status: map_runtime_turn_status(turn.status),
        context,
        output_schema_runtime: turn.output_schema_runtime.clone(),
        error_message: turn.error_message.clone(),
        created_at_ms: turn.created_at.timestamp_millis(),
        updated_at_ms: turn.updated_at.timestamp_millis(),
        context_approval_policy,
        context_sandbox_policy,
        context_metadata,
    }
}
