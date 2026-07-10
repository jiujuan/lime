//! Aster runtime store adapter.
//!
//! Aster shared runtime store access stays behind this compat boundary; callers
//! should project snapshots into Lime-owned read models immediately.

use crate::aster_session_store::LimeSessionStore;
use crate::turn_context_configuration::to_agent_turn_context;
use agent_protocol::turn_context::{
    TurnOutputSchemaRuntime, TurnOutputSchemaSource, TurnOutputSchemaStrategy,
};
use aster::{
    initialize_shared_session_runtime_with_root, load_shared_session_runtime_snapshot,
    require_shared_session_runtime_store, ItemRuntime, ItemRuntimePayload, ItemStatus,
    SessionRuntimeSnapshot, SessionStore, ThreadRuntimeSnapshot, ThreadRuntimeStore,
    TurnOutputSchemaSource as AsterTurnOutputSchemaSource,
    TurnOutputSchemaStrategy as AsterTurnOutputSchemaStrategy, TurnRuntime as AsterTurnRuntime,
    TurnStatus,
};
use std::path::PathBuf;
use std::sync::Arc;
use thread_store::runtime_snapshot::{
    RuntimeItemPayloadRecord, RuntimeItemSnapshotRecord, RuntimeItemStatusRecord,
    RuntimeSessionSnapshotRecord, RuntimeThreadSnapshotRecord, RuntimeTurnSnapshotRecord,
    RuntimeTurnStatusRecord,
};

pub(crate) type AsterThreadRuntimeStore = dyn ThreadRuntimeStore;
pub(crate) type AsterSessionRuntimeSnapshot = SessionRuntimeSnapshot;

pub(crate) fn initialized_aster_runtime_root() -> Option<PathBuf> {
    aster::initialized_path_root()
}

pub(crate) async fn initialize_aster_runtime_with_root(
    root: PathBuf,
    session_store: Option<Arc<LimeSessionStore>>,
) -> Result<(), String> {
    let session_store: Option<Arc<dyn SessionStore>> =
        session_store.map(|store| store as Arc<dyn SessionStore>);
    initialize_shared_session_runtime_with_root(root, session_store)
        .await
        .map_err(|error| format!("初始化 Agent runtime 失败: {error}"))
}

pub(crate) fn require_aster_runtime_store() -> Result<Arc<AsterThreadRuntimeStore>, String> {
    require_shared_session_runtime_store().map_err(|error| error.to_string())
}

pub(crate) async fn load_aster_runtime_snapshot(
    session_id: &str,
) -> Result<AsterSessionRuntimeSnapshot, String> {
    load_shared_session_runtime_snapshot(session_id)
        .await
        .map_err(|error| format!("读取 runtime snapshot 失败: {error}"))
}

pub(crate) fn runtime_snapshot_record_from_aster(
    snapshot: &AsterSessionRuntimeSnapshot,
) -> RuntimeSessionSnapshotRecord {
    RuntimeSessionSnapshotRecord {
        session_id: snapshot.session_id.clone(),
        threads: snapshot
            .threads
            .iter()
            .map(runtime_thread_record_from_aster)
            .collect(),
    }
}

fn runtime_thread_record_from_aster(
    snapshot: &ThreadRuntimeSnapshot,
) -> RuntimeThreadSnapshotRecord {
    RuntimeThreadSnapshotRecord {
        id: snapshot.thread.id.clone(),
        session_id: snapshot.thread.session_id.clone(),
        working_dir: snapshot.thread.working_dir.clone(),
        created_at: snapshot.thread.created_at,
        updated_at: snapshot.thread.updated_at,
        metadata: snapshot.thread.metadata.clone(),
        turns: snapshot
            .turns
            .iter()
            .map(runtime_turn_record_from_aster)
            .collect(),
        items: snapshot
            .items
            .iter()
            .map(runtime_item_record_from_aster)
            .collect(),
    }
}

pub(crate) fn runtime_turn_record_from_aster(turn: &AsterTurnRuntime) -> RuntimeTurnSnapshotRecord {
    RuntimeTurnSnapshotRecord {
        id: turn.id.clone(),
        session_id: turn.session_id.clone(),
        thread_id: turn.thread_id.clone(),
        status: runtime_turn_status_from_aster(turn.status),
        input_text: turn.input_text.clone(),
        error_message: turn.error_message.clone(),
        context_override: turn.context_override.clone().map(to_agent_turn_context),
        output_schema_runtime: turn
            .output_schema_runtime
            .as_ref()
            .map(runtime_output_schema_from_aster),
        created_at: turn.created_at,
        started_at: turn.started_at,
        completed_at: turn.completed_at,
        updated_at: turn.updated_at,
    }
}

fn runtime_turn_status_from_aster(status: TurnStatus) -> RuntimeTurnStatusRecord {
    match status {
        TurnStatus::Queued => RuntimeTurnStatusRecord::Queued,
        TurnStatus::Running => RuntimeTurnStatusRecord::Running,
        TurnStatus::Completed => RuntimeTurnStatusRecord::Completed,
        TurnStatus::Failed => RuntimeTurnStatusRecord::Failed,
        TurnStatus::Aborted => RuntimeTurnStatusRecord::Aborted,
    }
}

pub(crate) fn runtime_output_schema_from_aster(
    runtime: &aster::TurnOutputSchemaRuntime,
) -> TurnOutputSchemaRuntime {
    TurnOutputSchemaRuntime {
        source: match runtime.source {
            AsterTurnOutputSchemaSource::Session => TurnOutputSchemaSource::Session,
            AsterTurnOutputSchemaSource::Turn => TurnOutputSchemaSource::Turn,
        },
        strategy: match runtime.strategy {
            AsterTurnOutputSchemaStrategy::Native => TurnOutputSchemaStrategy::Native,
            AsterTurnOutputSchemaStrategy::FinalOutputTool => {
                TurnOutputSchemaStrategy::FinalOutputTool
            }
        },
        provider_name: runtime.provider_name.clone(),
        model_name: runtime.model_name.clone(),
    }
}

pub(crate) fn runtime_item_record_from_aster(item: &ItemRuntime) -> RuntimeItemSnapshotRecord {
    RuntimeItemSnapshotRecord {
        id: item.id.clone(),
        thread_id: item.thread_id.clone(),
        turn_id: item.turn_id.clone(),
        sequence: item.sequence,
        status: runtime_item_status_from_aster(item.status),
        started_at: item.started_at,
        completed_at: item.completed_at,
        updated_at: item.updated_at,
        payload: runtime_item_payload_from_aster(&item.payload),
    }
}

fn runtime_item_status_from_aster(status: ItemStatus) -> RuntimeItemStatusRecord {
    match status {
        ItemStatus::InProgress => RuntimeItemStatusRecord::InProgress,
        ItemStatus::Completed => RuntimeItemStatusRecord::Completed,
        ItemStatus::Failed => RuntimeItemStatusRecord::Failed,
    }
}

fn runtime_item_payload_from_aster(payload: &ItemRuntimePayload) -> RuntimeItemPayloadRecord {
    match payload {
        ItemRuntimePayload::TranscriptMessage { .. } => {
            RuntimeItemPayloadRecord::InternalTranscript
        }
        ItemRuntimePayload::UserMessage { content } => RuntimeItemPayloadRecord::UserMessage {
            content: content.clone(),
        },
        ItemRuntimePayload::AgentMessage { text } => {
            RuntimeItemPayloadRecord::AgentMessage { text: text.clone() }
        }
        ItemRuntimePayload::Plan { text } => RuntimeItemPayloadRecord::Plan { text: text.clone() },
        ItemRuntimePayload::RuntimeStatus {
            phase,
            title,
            detail,
            checkpoints,
        } => RuntimeItemPayloadRecord::RuntimeStatus {
            phase: phase.clone(),
            title: title.clone(),
            detail: detail.clone(),
            checkpoints: checkpoints.clone(),
        },
        ItemRuntimePayload::FileArtifact {
            path,
            source,
            content,
            metadata,
        } => RuntimeItemPayloadRecord::FileArtifact {
            path: path.clone(),
            source: source.clone(),
            content: content.clone(),
            metadata: metadata.clone(),
        },
        ItemRuntimePayload::Reasoning {
            text,
            summary,
            metadata,
        } => RuntimeItemPayloadRecord::Reasoning {
            text: text.clone(),
            summary: summary.clone(),
            metadata: metadata.clone(),
        },
        ItemRuntimePayload::ToolCall {
            tool_name,
            arguments,
            output,
            success,
            error,
            metadata,
        } => RuntimeItemPayloadRecord::ToolCall {
            tool_name: tool_name.clone(),
            arguments: arguments.clone(),
            output: output.clone(),
            success: *success,
            error: error.clone(),
            metadata: metadata.clone(),
        },
        ItemRuntimePayload::ApprovalRequest {
            request_id,
            action_type,
            prompt,
            tool_name,
            arguments,
            response,
        } => RuntimeItemPayloadRecord::ApprovalRequest {
            request_id: request_id.clone(),
            action_type: action_type.clone(),
            prompt: prompt.clone(),
            tool_name: tool_name.clone(),
            arguments: arguments.clone(),
            response: response.clone(),
        },
        ItemRuntimePayload::RequestUserInput {
            request_id,
            action_type,
            prompt,
            requested_schema,
            response,
        } => RuntimeItemPayloadRecord::RequestUserInput {
            request_id: request_id.clone(),
            action_type: action_type.clone(),
            prompt: prompt.clone(),
            requested_schema: requested_schema.clone(),
            response: response.clone(),
        },
    }
}
