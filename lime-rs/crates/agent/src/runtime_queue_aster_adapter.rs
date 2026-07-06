//! Aster runtime queue store adapter.
//!
//! Aster `ThreadRuntimeStore` / `QueuedTurnRuntime` stays behind this compat
//! boundary; callers receive `agent-runtime` queue service and DTOs.

use agent_runtime::runtime_queue::{
    RuntimeQueueResult, RuntimeQueueService, RuntimeQueueStore, RuntimeQueuedTurn,
};
use aster::session::{QueuedTurnRuntime as AsterQueuedTurnRuntime, ThreadRuntimeStore};
use futures::future::{BoxFuture, FutureExt};
use std::sync::Arc;

pub(crate) fn runtime_queue_service_from_store(
    store: Arc<dyn ThreadRuntimeStore>,
) -> Arc<RuntimeQueueService> {
    Arc::new(RuntimeQueueService::new(Arc::new(
        AsterRuntimeQueueStoreAdapter { store },
    )))
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

struct AsterRuntimeQueueStoreAdapter {
    store: Arc<dyn ThreadRuntimeStore>,
}

impl RuntimeQueueStore for AsterRuntimeQueueStoreAdapter {
    fn enqueue_turn(
        &self,
        queued_turn: RuntimeQueuedTurn,
    ) -> BoxFuture<'_, RuntimeQueueResult<RuntimeQueuedTurn>> {
        async move {
            self.store
                .enqueue_turn(aster_queued_turn_from_runtime(queued_turn))
                .await
                .map(runtime_queued_turn_from_aster)
                .map_err(|error| error.to_string())
        }
        .boxed()
    }

    fn list_queued_turns<'a>(
        &'a self,
        session_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Vec<RuntimeQueuedTurn>>> {
        async move {
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
        }
        .boxed()
    }

    fn list_queued_turn_session_ids(&self) -> BoxFuture<'_, RuntimeQueueResult<Vec<String>>> {
        async move {
            self.store
                .list_queued_turn_session_ids()
                .await
                .map_err(|error| error.to_string())
        }
        .boxed()
    }

    fn remove_queued_turn<'a>(
        &'a self,
        queued_turn_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Option<RuntimeQueuedTurn>>> {
        async move {
            self.store
                .remove_queued_turn(queued_turn_id)
                .await
                .map(|queued_turn| queued_turn.map(runtime_queued_turn_from_aster))
                .map_err(|error| error.to_string())
        }
        .boxed()
    }

    fn take_next_queued_turn<'a>(
        &'a self,
        session_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Option<RuntimeQueuedTurn>>> {
        async move {
            self.store
                .take_next_queued_turn(session_id)
                .await
                .map(|queued_turn| queued_turn.map(runtime_queued_turn_from_aster))
                .map_err(|error| error.to_string())
        }
        .boxed()
    }

    fn clear_queued_turns<'a>(
        &'a self,
        session_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Vec<RuntimeQueuedTurn>>> {
        async move {
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
        }
        .boxed()
    }
}
