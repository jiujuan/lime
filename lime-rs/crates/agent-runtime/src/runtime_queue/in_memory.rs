use super::{RuntimeQueueResult, RuntimeQueueStore, RuntimeQueuedTurn};
use futures::future::{ready, BoxFuture, FutureExt};
use std::sync::Mutex;

#[derive(Default)]
pub struct InMemoryRuntimeQueueStore {
    queued_turns: Mutex<Vec<RuntimeQueuedTurn>>,
}

impl InMemoryRuntimeQueueStore {
    pub fn new() -> Self {
        Self::default()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Vec<RuntimeQueuedTurn>> {
        self.queued_turns
            .lock()
            .unwrap_or_else(|error| error.into_inner())
    }
}

impl RuntimeQueueStore for InMemoryRuntimeQueueStore {
    fn enqueue_turn(
        &self,
        queued_turn: RuntimeQueuedTurn,
    ) -> BoxFuture<'_, RuntimeQueueResult<RuntimeQueuedTurn>> {
        self.lock().push(queued_turn.clone());
        ready(Ok(queued_turn)).boxed()
    }

    fn list_queued_turns<'a>(
        &'a self,
        session_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Vec<RuntimeQueuedTurn>>> {
        let queued_turns = self
            .lock()
            .iter()
            .filter(|queued_turn| queued_turn.session_id == session_id)
            .cloned()
            .collect();
        ready(Ok(queued_turns)).boxed()
    }

    fn list_queued_turn_session_ids(&self) -> BoxFuture<'_, RuntimeQueueResult<Vec<String>>> {
        let mut session_ids = self
            .lock()
            .iter()
            .map(|queued_turn| queued_turn.session_id.clone())
            .collect::<Vec<_>>();
        session_ids.sort();
        session_ids.dedup();
        ready(Ok(session_ids)).boxed()
    }

    fn remove_queued_turn<'a>(
        &'a self,
        queued_turn_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Option<RuntimeQueuedTurn>>> {
        let mut queued_turns = self.lock();
        let removed = queued_turns
            .iter()
            .position(|queued_turn| queued_turn.queued_turn_id == queued_turn_id)
            .map(|index| queued_turns.remove(index));
        ready(Ok(removed)).boxed()
    }

    fn take_next_queued_turn<'a>(
        &'a self,
        session_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Option<RuntimeQueuedTurn>>> {
        let mut queued_turns = self.lock();
        let next = queued_turns
            .iter()
            .position(|queued_turn| queued_turn.session_id == session_id)
            .map(|index| queued_turns.remove(index));
        ready(Ok(next)).boxed()
    }

    fn clear_queued_turns<'a>(
        &'a self,
        session_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Vec<RuntimeQueuedTurn>>> {
        let mut queued_turns = self.lock();
        let mut cleared = Vec::new();
        let mut retained = Vec::new();
        for queued_turn in queued_turns.drain(..) {
            if queued_turn.session_id == session_id {
                cleared.push(queued_turn);
            } else {
                retained.push(queued_turn);
            }
        }
        *queued_turns = retained;
        ready(Ok(cleared)).boxed()
    }
}
