//! Aster runtime store adapter.
//!
//! Aster shared runtime store access stays behind this compat boundary; callers
//! should project snapshots into Lime-owned read models immediately.

use crate::turn_context_configuration::{to_agent_turn_context, to_aster_turn_context};
use agent_protocol::turn_context::{
    TurnOutputSchemaRuntime, TurnOutputSchemaSource, TurnOutputSchemaStrategy,
};
use agent_runtime::runtime_queue::{
    RuntimeQueueResult, RuntimeQueueService, RuntimeQueueStore, RuntimeQueuedTurn,
};
use aster::{
    initialize_shared_session_runtime_with_root, require_shared_session_runtime_store, ItemRuntime,
    ItemRuntimePayload, ItemStatus, QueuedTurnRuntime as AsterQueuedTurnRuntime, ThreadRuntime,
    ThreadRuntimeStore, TurnOutputSchemaSource as AsterTurnOutputSchemaSource,
    TurnOutputSchemaStrategy as AsterTurnOutputSchemaStrategy, TurnRuntime as AsterTurnRuntime,
    TurnStatus,
};
use futures::future::BoxFuture;
use std::path::PathBuf;
use std::sync::Arc;
use thread_store::runtime_snapshot::{
    RuntimeItemPayloadRecord, RuntimeItemSnapshotRecord, RuntimeItemStatusRecord,
    RuntimeTurnSnapshotRecord, RuntimeTurnStatusRecord,
};
use thread_store::runtime_store::{
    runtime_store_error, RuntimeItemStore, RuntimeItemWriteStore, RuntimeStore, RuntimeStoreFuture,
    RuntimeThreadRecord, RuntimeThreadTurnStore, RuntimeThreadWriteStore, RuntimeTurnWriteStore,
};

pub(crate) type AsterThreadRuntimeStore = dyn ThreadRuntimeStore;

pub(crate) fn initialized_aster_runtime_root() -> Option<PathBuf> {
    aster::initialized_path_root()
}

pub(crate) async fn initialize_aster_runtime_with_root(root: PathBuf) -> Result<(), String> {
    initialize_shared_session_runtime_with_root(root)
        .await
        .map_err(|error| format!("初始化 Agent runtime 失败: {error}"))
}

pub(crate) fn require_aster_runtime_store() -> Result<Arc<AsterThreadRuntimeStore>, String> {
    require_shared_session_runtime_store().map_err(|error| error.to_string())
}

pub(crate) fn runtime_read_store_from_aster(
    store: Arc<AsterThreadRuntimeStore>,
) -> Arc<dyn RuntimeStore> {
    Arc::new(AsterRuntimeStoreAdapter { store })
}

pub(crate) fn runtime_item_store_from_aster(
    store: Arc<AsterThreadRuntimeStore>,
) -> Arc<dyn RuntimeItemStore> {
    Arc::new(AsterRuntimeStoreAdapter { store })
}

pub(crate) fn runtime_thread_turn_store_from_aster(
    store: Arc<AsterThreadRuntimeStore>,
) -> Arc<dyn RuntimeThreadTurnStore> {
    Arc::new(AsterRuntimeStoreAdapter { store })
}

pub(crate) fn runtime_queue_store_from_aster(
    store: Arc<AsterThreadRuntimeStore>,
) -> Arc<dyn RuntimeQueueStore> {
    Arc::new(AsterRuntimeQueueStoreAdapter { store })
}

pub(crate) fn runtime_queue_service_from_store(
    store: Arc<dyn RuntimeQueueStore>,
) -> Arc<RuntimeQueueService> {
    Arc::new(RuntimeQueueService::new(store))
}

struct AsterRuntimeStoreAdapter {
    store: Arc<AsterThreadRuntimeStore>,
}

impl RuntimeStore for AsterRuntimeStoreAdapter {
    fn list_threads<'a>(
        &'a self,
        session_id: &'a str,
    ) -> RuntimeStoreFuture<'a, Vec<RuntimeThreadRecord>> {
        Box::pin(async move {
            self.store
                .list_threads(session_id)
                .await
                .map(|threads| {
                    threads
                        .iter()
                        .map(runtime_thread_record_from_aster)
                        .collect()
                })
                .map_err(|error| runtime_store_error(format!("读取 runtime threads 失败: {error}")))
        })
    }

    fn list_turns<'a>(
        &'a self,
        thread_id: &'a str,
    ) -> RuntimeStoreFuture<'a, Vec<RuntimeTurnSnapshotRecord>> {
        Box::pin(async move {
            self.store
                .list_turns(thread_id)
                .await
                .map(|turns| turns.iter().map(runtime_turn_record_from_aster).collect())
                .map_err(|error| runtime_store_error(format!("读取 runtime turns 失败: {error}")))
        })
    }

    fn list_items<'a>(
        &'a self,
        thread_id: &'a str,
    ) -> RuntimeStoreFuture<'a, Vec<RuntimeItemSnapshotRecord>> {
        Box::pin(async move {
            self.store
                .list_items(thread_id)
                .await
                .map(|items| items.iter().map(runtime_item_record_from_aster).collect())
                .map_err(|error| runtime_store_error(format!("读取 runtime items 失败: {error}")))
        })
    }
}

impl RuntimeThreadWriteStore for AsterRuntimeStoreAdapter {
    fn upsert_thread<'a>(
        &'a self,
        thread: RuntimeThreadRecord,
    ) -> RuntimeStoreFuture<'a, RuntimeThreadRecord> {
        Box::pin(async move {
            let thread = aster_thread_from_runtime_record(thread);
            self.store
                .upsert_thread(thread)
                .await
                .map(|thread| runtime_thread_record_from_aster(&thread))
                .map_err(|error| runtime_store_error(format!("写入 runtime thread 失败: {error}")))
        })
    }

    fn get_thread<'a>(
        &'a self,
        thread_id: &'a str,
    ) -> RuntimeStoreFuture<'a, Option<RuntimeThreadRecord>> {
        Box::pin(async move {
            self.store
                .get_thread(thread_id)
                .await
                .map(|thread| thread.as_ref().map(runtime_thread_record_from_aster))
                .map_err(|error| runtime_store_error(format!("读取 runtime thread 失败: {error}")))
        })
    }
}

impl RuntimeTurnWriteStore for AsterRuntimeStoreAdapter {
    fn create_turn<'a>(
        &'a self,
        turn: RuntimeTurnSnapshotRecord,
    ) -> RuntimeStoreFuture<'a, RuntimeTurnSnapshotRecord> {
        Box::pin(async move {
            let turn = aster_turn_from_runtime_record(turn);
            self.store
                .create_turn(turn)
                .await
                .map(|turn| runtime_turn_record_from_aster(&turn))
                .map_err(|error| runtime_store_error(format!("创建 runtime turn 失败: {error}")))
        })
    }

    fn update_turn<'a>(
        &'a self,
        turn: RuntimeTurnSnapshotRecord,
    ) -> RuntimeStoreFuture<'a, RuntimeTurnSnapshotRecord> {
        Box::pin(async move {
            let turn = aster_turn_from_runtime_record(turn);
            self.store
                .update_turn(turn)
                .await
                .map(|turn| runtime_turn_record_from_aster(&turn))
                .map_err(|error| runtime_store_error(format!("更新 runtime turn 失败: {error}")))
        })
    }

    fn get_turn<'a>(
        &'a self,
        turn_id: &'a str,
    ) -> RuntimeStoreFuture<'a, Option<RuntimeTurnSnapshotRecord>> {
        Box::pin(async move {
            self.store
                .get_turn(turn_id)
                .await
                .map(|turn| turn.as_ref().map(runtime_turn_record_from_aster))
                .map_err(|error| runtime_store_error(format!("读取 runtime turn 失败: {error}")))
        })
    }
}

impl RuntimeItemWriteStore for AsterRuntimeStoreAdapter {
    fn create_item<'a>(
        &'a self,
        item: RuntimeItemSnapshotRecord,
    ) -> RuntimeStoreFuture<'a, RuntimeItemSnapshotRecord> {
        Box::pin(async move {
            let item = aster_item_from_runtime_record(item).map_err(runtime_store_error)?;
            self.store
                .create_item(item)
                .await
                .map(|item| runtime_item_record_from_aster(&item))
                .map_err(|error| runtime_store_error(format!("创建 runtime item 失败: {error}")))
        })
    }

    fn update_item<'a>(
        &'a self,
        item: RuntimeItemSnapshotRecord,
    ) -> RuntimeStoreFuture<'a, RuntimeItemSnapshotRecord> {
        Box::pin(async move {
            let item = aster_item_from_runtime_record(item).map_err(runtime_store_error)?;
            self.store
                .update_item(item)
                .await
                .map(|item| runtime_item_record_from_aster(&item))
                .map_err(|error| runtime_store_error(format!("更新 runtime item 失败: {error}")))
        })
    }

    fn get_item<'a>(
        &'a self,
        item_id: &'a str,
    ) -> RuntimeStoreFuture<'a, Option<RuntimeItemSnapshotRecord>> {
        Box::pin(async move {
            self.store
                .get_item(item_id)
                .await
                .map(|item| item.as_ref().map(runtime_item_record_from_aster))
                .map_err(|error| runtime_store_error(format!("读取 runtime item 失败: {error}")))
        })
    }

    fn delete_item<'a>(
        &'a self,
        item_id: &'a str,
    ) -> RuntimeStoreFuture<'a, Option<RuntimeItemSnapshotRecord>> {
        Box::pin(async move {
            self.store
                .delete_item(item_id)
                .await
                .map(|item| item.as_ref().map(runtime_item_record_from_aster))
                .map_err(|error| runtime_store_error(format!("删除 runtime item 失败: {error}")))
        })
    }
}

struct AsterRuntimeQueueStoreAdapter {
    store: Arc<AsterThreadRuntimeStore>,
}

impl RuntimeQueueStore for AsterRuntimeQueueStoreAdapter {
    fn enqueue_turn(
        &self,
        queued_turn: RuntimeQueuedTurn,
    ) -> BoxFuture<'_, RuntimeQueueResult<RuntimeQueuedTurn>> {
        Box::pin(async move {
            self.store
                .enqueue_turn(aster_queued_turn_from_runtime(queued_turn))
                .await
                .map(runtime_queued_turn_from_aster)
                .map_err(|error| error.to_string())
        })
    }

    fn list_queued_turns<'a>(
        &'a self,
        session_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Vec<RuntimeQueuedTurn>>> {
        Box::pin(async move {
            self.store
                .list_queued_turns(session_id)
                .await
                .map(|queued_turns| {
                    queued_turns
                        .into_iter()
                        .map(runtime_queued_turn_from_aster)
                        .collect()
                })
                .map_err(|error| error.to_string())
        })
    }

    fn list_queued_turn_session_ids(&self) -> BoxFuture<'_, RuntimeQueueResult<Vec<String>>> {
        Box::pin(async move {
            self.store
                .list_queued_turn_session_ids()
                .await
                .map_err(|error| error.to_string())
        })
    }

    fn remove_queued_turn<'a>(
        &'a self,
        queued_turn_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Option<RuntimeQueuedTurn>>> {
        Box::pin(async move {
            self.store
                .remove_queued_turn(queued_turn_id)
                .await
                .map(|queued_turn| queued_turn.map(runtime_queued_turn_from_aster))
                .map_err(|error| error.to_string())
        })
    }

    fn take_next_queued_turn<'a>(
        &'a self,
        session_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Option<RuntimeQueuedTurn>>> {
        Box::pin(async move {
            self.store
                .take_next_queued_turn(session_id)
                .await
                .map(|queued_turn| queued_turn.map(runtime_queued_turn_from_aster))
                .map_err(|error| error.to_string())
        })
    }

    fn clear_queued_turns<'a>(
        &'a self,
        session_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Vec<RuntimeQueuedTurn>>> {
        Box::pin(async move {
            self.store
                .clear_queued_turns(session_id)
                .await
                .map(|queued_turns| {
                    queued_turns
                        .into_iter()
                        .map(runtime_queued_turn_from_aster)
                        .collect()
                })
                .map_err(|error| error.to_string())
        })
    }
}

fn runtime_queued_turn_from_aster(queued_turn: AsterQueuedTurnRuntime) -> RuntimeQueuedTurn {
    RuntimeQueuedTurn {
        queued_turn_id: queued_turn.queued_turn_id,
        session_id: queued_turn.session_id,
        message_preview: queued_turn.message_preview,
        message_text: queued_turn.message_text,
        created_at: queued_turn.created_at,
        image_count: queued_turn.image_count,
        payload: queued_turn.payload,
        metadata: queued_turn.metadata,
    }
}

fn aster_queued_turn_from_runtime(queued_turn: RuntimeQueuedTurn) -> AsterQueuedTurnRuntime {
    AsterQueuedTurnRuntime {
        queued_turn_id: queued_turn.queued_turn_id,
        session_id: queued_turn.session_id,
        message_preview: queued_turn.message_preview,
        message_text: queued_turn.message_text,
        created_at: queued_turn.created_at,
        image_count: queued_turn.image_count,
        payload: queued_turn.payload,
        metadata: queued_turn.metadata,
    }
}

fn runtime_thread_record_from_aster(thread: &ThreadRuntime) -> RuntimeThreadRecord {
    RuntimeThreadRecord {
        id: thread.id.clone(),
        session_id: thread.session_id.clone(),
        working_dir: thread.working_dir.clone(),
        created_at: thread.created_at,
        updated_at: thread.updated_at,
        metadata: thread.metadata.clone(),
    }
}

fn aster_thread_from_runtime_record(thread: RuntimeThreadRecord) -> ThreadRuntime {
    let mut aster_thread = ThreadRuntime::new(thread.id, thread.session_id, thread.working_dir);
    aster_thread.created_at = thread.created_at;
    aster_thread.updated_at = thread.updated_at;
    aster_thread.metadata = thread.metadata;
    aster_thread
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

pub(crate) fn aster_turn_from_runtime_record(turn: RuntimeTurnSnapshotRecord) -> AsterTurnRuntime {
    AsterTurnRuntime {
        id: turn.id,
        session_id: turn.session_id,
        thread_id: turn.thread_id,
        status: aster_turn_status_from_runtime(turn.status),
        input_text: turn.input_text,
        error_message: turn.error_message,
        context_override: turn.context_override.map(to_aster_turn_context),
        output_schema_runtime: turn
            .output_schema_runtime
            .map(aster_output_schema_from_runtime),
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

fn aster_turn_status_from_runtime(status: RuntimeTurnStatusRecord) -> TurnStatus {
    match status {
        RuntimeTurnStatusRecord::Queued => TurnStatus::Queued,
        RuntimeTurnStatusRecord::Running => TurnStatus::Running,
        RuntimeTurnStatusRecord::Completed => TurnStatus::Completed,
        RuntimeTurnStatusRecord::Failed => TurnStatus::Failed,
        RuntimeTurnStatusRecord::Aborted => TurnStatus::Aborted,
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

fn aster_output_schema_from_runtime(
    runtime: TurnOutputSchemaRuntime,
) -> aster::TurnOutputSchemaRuntime {
    aster::TurnOutputSchemaRuntime {
        source: match runtime.source {
            TurnOutputSchemaSource::Session => AsterTurnOutputSchemaSource::Session,
            TurnOutputSchemaSource::Turn => AsterTurnOutputSchemaSource::Turn,
        },
        strategy: match runtime.strategy {
            TurnOutputSchemaStrategy::Native => AsterTurnOutputSchemaStrategy::Native,
            TurnOutputSchemaStrategy::FinalOutputTool => {
                AsterTurnOutputSchemaStrategy::FinalOutputTool
            }
        },
        provider_name: runtime.provider_name,
        model_name: runtime.model_name,
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
        ItemRuntimePayload::TranscriptMessage {
            role,
            content,
            metadata,
            created_timestamp,
        } => RuntimeItemPayloadRecord::InternalTranscript {
            role: role.clone(),
            content_json: serde_json::to_value(content).unwrap_or(serde_json::Value::Null),
            metadata_json: serde_json::to_value(metadata).unwrap_or(serde_json::Value::Null),
            created_timestamp: *created_timestamp,
        },
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

fn aster_item_from_runtime_record(item: RuntimeItemSnapshotRecord) -> Result<ItemRuntime, String> {
    Ok(ItemRuntime {
        id: item.id,
        thread_id: item.thread_id,
        turn_id: item.turn_id,
        sequence: item.sequence,
        status: aster_item_status_from_runtime(item.status),
        started_at: item.started_at,
        completed_at: item.completed_at,
        updated_at: item.updated_at,
        payload: aster_item_payload_from_runtime(item.payload)?,
    })
}

fn aster_item_status_from_runtime(status: RuntimeItemStatusRecord) -> ItemStatus {
    match status {
        RuntimeItemStatusRecord::InProgress => ItemStatus::InProgress,
        RuntimeItemStatusRecord::Completed => ItemStatus::Completed,
        RuntimeItemStatusRecord::Failed => ItemStatus::Failed,
    }
}

fn aster_item_payload_from_runtime(
    payload: RuntimeItemPayloadRecord,
) -> Result<ItemRuntimePayload, String> {
    match payload {
        RuntimeItemPayloadRecord::InternalTranscript {
            role,
            content_json,
            metadata_json,
            created_timestamp,
        } => Ok(ItemRuntimePayload::TranscriptMessage {
            role,
            content: serde_json::from_value(content_json)
                .map_err(|error| format!("解析 transcript content 失败: {error}"))?,
            metadata: serde_json::from_value(metadata_json)
                .map_err(|error| format!("解析 transcript metadata 失败: {error}"))?,
            created_timestamp,
        }),
        RuntimeItemPayloadRecord::UserMessage { content } => {
            Ok(ItemRuntimePayload::UserMessage { content })
        }
        RuntimeItemPayloadRecord::AgentMessage { text } => {
            Ok(ItemRuntimePayload::AgentMessage { text })
        }
        RuntimeItemPayloadRecord::Plan { text } => Ok(ItemRuntimePayload::Plan { text }),
        RuntimeItemPayloadRecord::RuntimeStatus {
            phase,
            title,
            detail,
            checkpoints,
        } => Ok(ItemRuntimePayload::RuntimeStatus {
            phase,
            title,
            detail,
            checkpoints,
        }),
        RuntimeItemPayloadRecord::FileArtifact {
            path,
            source,
            content,
            metadata,
        } => Ok(ItemRuntimePayload::FileArtifact {
            path,
            source,
            content,
            metadata,
        }),
        RuntimeItemPayloadRecord::Reasoning {
            text,
            summary,
            metadata,
        } => Ok(ItemRuntimePayload::Reasoning {
            text,
            summary,
            metadata,
        }),
        RuntimeItemPayloadRecord::ToolCall {
            tool_name,
            arguments,
            output,
            success,
            error,
            metadata,
        } => Ok(ItemRuntimePayload::ToolCall {
            tool_name,
            arguments,
            output,
            success,
            error,
            metadata,
        }),
        RuntimeItemPayloadRecord::ApprovalRequest {
            request_id,
            action_type,
            prompt,
            tool_name,
            arguments,
            response,
        } => Ok(ItemRuntimePayload::ApprovalRequest {
            request_id,
            action_type,
            prompt,
            tool_name,
            arguments,
            response,
        }),
        RuntimeItemPayloadRecord::RequestUserInput {
            request_id,
            action_type,
            prompt,
            requested_schema,
            response,
        } => Ok(ItemRuntimePayload::RequestUserInput {
            request_id,
            action_type,
            prompt,
            requested_schema,
            response,
        }),
    }
}
