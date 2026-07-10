use anyhow::{anyhow, Result};
use std::collections::HashSet;
use std::sync::{Arc, OnceLock};

use super::runtime_store::{
    require_session_runtime_store, QueuedTurnRuntime, SessionExecutionGate, ThreadRuntimeStore,
};

static SHARED_SESSION_RUNTIME_QUEUE_SERVICE: OnceLock<Arc<SessionRuntimeQueueService>> =
    OnceLock::new();
const SHARED_SESSION_RUNTIME_QUEUE_SERVICE_INIT_ERROR: &str =
    "shared session runtime queue service is not initialized; call initialize_session_runtime_store first";

#[derive(Debug, Clone, PartialEq)]
pub enum RuntimeQueueSubmitResult {
    StartNow,
    Busy,
    Enqueued {
        queued_turn: Box<QueuedTurnRuntime>,
        position: usize,
    },
}

#[derive(Clone)]
pub struct SessionRuntimeQueueService {
    store: Arc<dyn ThreadRuntimeStore>,
    execution_gate: SessionExecutionGate,
}

impl SessionRuntimeQueueService {
    pub fn new(store: Arc<dyn ThreadRuntimeStore>) -> Self {
        Self::with_gate(store, SessionExecutionGate::default())
    }

    pub fn with_gate(
        store: Arc<dyn ThreadRuntimeStore>,
        execution_gate: SessionExecutionGate,
    ) -> Self {
        Self {
            store,
            execution_gate,
        }
    }

    pub fn has_active_turn(&self, session_id: &str) -> bool {
        self.execution_gate.is_active(session_id)
    }

    pub fn active_turn_id(&self, session_id: &str) -> Option<String> {
        self.execution_gate.active_turn_id(session_id)
    }

    pub async fn list_live_session_ids(&self) -> Result<HashSet<String>> {
        let mut session_ids = self.execution_gate.active_session_ids();
        session_ids.extend(self.store.list_queued_turn_session_ids().await?);
        Ok(session_ids)
    }

    async fn take_next_turn_with_gate(
        &self,
        session_id: &str,
        acquire_gate: bool,
    ) -> Result<Option<QueuedTurnRuntime>> {
        if acquire_gate && !self.execution_gate.try_start(session_id) {
            return Ok(None);
        }

        match self.store.take_next_queued_turn(session_id).await? {
            Some(queued_turn) => {
                self.execution_gate
                    .set_active_turn_id(session_id, &queued_turn.queued_turn_id);
                Ok(Some(queued_turn))
            }
            None => {
                self.execution_gate.finish(session_id);
                Ok(None)
            }
        }
    }

    pub async fn resume_if_idle(&self, session_id: &str) -> Result<Option<QueuedTurnRuntime>> {
        if self.has_active_turn(session_id) {
            return Ok(None);
        }

        self.take_next_turn_with_gate(session_id, true).await
    }

    pub async fn finish_turn_and_take_next(
        &self,
        session_id: &str,
    ) -> Result<Option<QueuedTurnRuntime>> {
        self.take_next_turn_with_gate(session_id, false).await
    }

    pub async fn finish_matching_turn_and_take_next(
        &self,
        session_id: &str,
        turn_id: &str,
    ) -> Result<Option<QueuedTurnRuntime>> {
        if !self.execution_gate.active_turn_matches(session_id, turn_id) {
            return Ok(None);
        }

        self.take_next_turn_with_gate(session_id, false).await
    }

    pub fn finish_active_turn_if_matches(&self, session_id: &str, turn_id: &str) -> bool {
        self.execution_gate.finish_if_matches(session_id, turn_id)
    }

    pub async fn submit_turn(
        &self,
        queued_turn: QueuedTurnRuntime,
        queue_if_busy: bool,
    ) -> Result<RuntimeQueueSubmitResult> {
        let session_id = queued_turn.session_id.clone();

        if !self.has_active_turn(&session_id)
            && self
                .execution_gate
                .try_start_turn(&session_id, &queued_turn.queued_turn_id)
        {
            return Ok(RuntimeQueueSubmitResult::StartNow);
        }

        if !queue_if_busy {
            return Ok(RuntimeQueueSubmitResult::Busy);
        }

        let persisted = self.store.enqueue_turn(queued_turn).await?;
        let queued_turns = self.store.list_queued_turns(&session_id).await?;
        let position = queued_turns
            .iter()
            .position(|existing| existing.queued_turn_id == persisted.queued_turn_id)
            .map(|index| index + 1)
            .unwrap_or(queued_turns.len());

        Ok(RuntimeQueueSubmitResult::Enqueued {
            queued_turn: Box::new(persisted),
            position,
        })
    }

    pub async fn list_queued_turns(&self, session_id: &str) -> Result<Vec<QueuedTurnRuntime>> {
        self.store.list_queued_turns(session_id).await
    }

    pub async fn list_queued_turn_session_ids(&self) -> Result<Vec<String>> {
        self.store.list_queued_turn_session_ids().await
    }

    pub async fn remove_queued_turn(
        &self,
        queued_turn_id: &str,
    ) -> Result<Option<QueuedTurnRuntime>> {
        self.store.remove_queued_turn(queued_turn_id).await
    }

    pub async fn clear_queued_turns(&self, session_id: &str) -> Result<Vec<QueuedTurnRuntime>> {
        self.store.clear_queued_turns(session_id).await
    }
}

pub(crate) fn initialize_session_runtime_queue_service(
    store: Arc<dyn ThreadRuntimeStore>,
) -> Arc<SessionRuntimeQueueService> {
    let _ =
        SHARED_SESSION_RUNTIME_QUEUE_SERVICE.set(Arc::new(SessionRuntimeQueueService::new(store)));
    SHARED_SESSION_RUNTIME_QUEUE_SERVICE
        .get()
        .expect("shared runtime queue service should be initialized")
        .clone()
}

pub fn require_shared_session_runtime_queue_service() -> Result<Arc<SessionRuntimeQueueService>> {
    require_session_runtime_store()?;
    SHARED_SESSION_RUNTIME_QUEUE_SERVICE
        .get()
        .cloned()
        .ok_or_else(|| anyhow!(SHARED_SESSION_RUNTIME_QUEUE_SERVICE_INIT_ERROR))
}
