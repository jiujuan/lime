use futures::future::BoxFuture;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

mod in_memory;
mod sqlite;

pub use in_memory::InMemoryRuntimeQueueStore;
pub use sqlite::SqliteRuntimeQueueStore;

pub type RuntimeQueueResult<T> = Result<T, String>;

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct RuntimeQueuedTurn {
    pub queued_turn_id: String,
    pub session_id: String,
    pub message_preview: String,
    pub message_text: String,
    pub created_at: i64,
    pub image_count: usize,
    pub payload: Value,
    pub metadata: HashMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum RuntimeQueueSubmitResult {
    StartNow,
    Busy,
    Enqueued {
        queued_turn: Box<RuntimeQueuedTurn>,
        position: usize,
    },
}

pub trait RuntimeQueueStore: Send + Sync {
    fn enqueue_turn(
        &self,
        queued_turn: RuntimeQueuedTurn,
    ) -> BoxFuture<'_, RuntimeQueueResult<RuntimeQueuedTurn>>;

    fn list_queued_turns<'a>(
        &'a self,
        session_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Vec<RuntimeQueuedTurn>>>;

    fn list_queued_turn_session_ids(&self) -> BoxFuture<'_, RuntimeQueueResult<Vec<String>>>;

    fn remove_queued_turn<'a>(
        &'a self,
        queued_turn_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Option<RuntimeQueuedTurn>>>;

    fn take_next_queued_turn<'a>(
        &'a self,
        session_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Option<RuntimeQueuedTurn>>>;

    fn clear_queued_turns<'a>(
        &'a self,
        session_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Vec<RuntimeQueuedTurn>>>;
}

#[derive(Debug, Clone)]
pub struct RuntimeExecutionGate {
    inner: Arc<Mutex<HashMap<String, String>>>,
}

impl Default for RuntimeExecutionGate {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl RuntimeExecutionGate {
    pub fn try_start(&self, session_id: &str) -> bool {
        self.try_start_turn(session_id, "")
    }

    pub fn try_start_turn(&self, session_id: &str, turn_id: &str) -> bool {
        let mut sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        if sessions.contains_key(session_id) {
            return false;
        }
        sessions.insert(session_id.to_string(), turn_id.to_string());
        true
    }

    pub fn set_active_turn_id(&self, session_id: &str, turn_id: &str) -> bool {
        let mut sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        let Some(active_turn_id) = sessions.get_mut(session_id) else {
            return false;
        };
        *active_turn_id = turn_id.to_string();
        true
    }

    pub fn finish(&self, session_id: &str) -> bool {
        let mut sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        sessions.remove(session_id).is_some()
    }

    pub fn finish_if_matches(&self, session_id: &str, turn_id: &str) -> bool {
        let mut sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        if sessions
            .get(session_id)
            .is_some_and(|active_turn_id| active_turn_id == turn_id)
        {
            sessions.remove(session_id);
            return true;
        }
        false
    }

    pub fn active_turn_id(&self, session_id: &str) -> Option<String> {
        let sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        sessions
            .get(session_id)
            .filter(|turn_id| !turn_id.is_empty())
            .cloned()
    }

    pub fn active_turn_matches(&self, session_id: &str, turn_id: &str) -> bool {
        let sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        sessions
            .get(session_id)
            .is_some_and(|active_turn_id| active_turn_id == turn_id)
    }

    pub fn is_active(&self, session_id: &str) -> bool {
        let sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        sessions.contains_key(session_id)
    }

    pub fn active_session_ids(&self) -> HashSet<String> {
        let sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        sessions.keys().cloned().collect()
    }
}

#[derive(Clone)]
pub struct RuntimeQueueService {
    store: Arc<dyn RuntimeQueueStore>,
    execution_gate: RuntimeExecutionGate,
}

impl RuntimeQueueService {
    pub fn new(store: Arc<dyn RuntimeQueueStore>) -> Self {
        Self::with_gate(store, RuntimeExecutionGate::default())
    }

    pub fn with_gate(
        store: Arc<dyn RuntimeQueueStore>,
        execution_gate: RuntimeExecutionGate,
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

    pub async fn list_live_session_ids(&self) -> RuntimeQueueResult<HashSet<String>> {
        let mut session_ids = self.execution_gate.active_session_ids();
        session_ids.extend(self.store.list_queued_turn_session_ids().await?);
        Ok(session_ids)
    }

    async fn take_next_turn_with_gate(
        &self,
        session_id: &str,
        acquire_gate: bool,
    ) -> RuntimeQueueResult<Option<RuntimeQueuedTurn>> {
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

    pub async fn resume_if_idle(
        &self,
        session_id: &str,
    ) -> RuntimeQueueResult<Option<RuntimeQueuedTurn>> {
        if self.has_active_turn(session_id) {
            return Ok(None);
        }

        self.take_next_turn_with_gate(session_id, true).await
    }

    pub async fn finish_turn_and_take_next(
        &self,
        session_id: &str,
    ) -> RuntimeQueueResult<Option<RuntimeQueuedTurn>> {
        self.take_next_turn_with_gate(session_id, false).await
    }

    pub async fn finish_matching_turn_and_take_next(
        &self,
        session_id: &str,
        turn_id: &str,
    ) -> RuntimeQueueResult<Option<RuntimeQueuedTurn>> {
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
        queued_turn: RuntimeQueuedTurn,
        queue_if_busy: bool,
    ) -> RuntimeQueueResult<RuntimeQueueSubmitResult> {
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

    pub async fn list_queued_turns(
        &self,
        session_id: &str,
    ) -> RuntimeQueueResult<Vec<RuntimeQueuedTurn>> {
        self.store.list_queued_turns(session_id).await
    }

    pub async fn list_queued_turn_session_ids(&self) -> RuntimeQueueResult<Vec<String>> {
        self.store.list_queued_turn_session_ids().await
    }

    pub async fn enqueue_turn(
        &self,
        queued_turn: RuntimeQueuedTurn,
    ) -> RuntimeQueueResult<RuntimeQueuedTurn> {
        self.store.enqueue_turn(queued_turn).await
    }

    pub async fn remove_queued_turn(
        &self,
        queued_turn_id: &str,
    ) -> RuntimeQueueResult<Option<RuntimeQueuedTurn>> {
        self.store.remove_queued_turn(queued_turn_id).await
    }

    pub async fn clear_queued_turns(
        &self,
        session_id: &str,
    ) -> RuntimeQueueResult<Vec<RuntimeQueuedTurn>> {
        self.store.clear_queued_turns(session_id).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn queued_turn(session_id: &str, queued_turn_id: &str, created_at: i64) -> RuntimeQueuedTurn {
        RuntimeQueuedTurn {
            queued_turn_id: queued_turn_id.to_string(),
            session_id: session_id.to_string(),
            message_preview: format!("preview-{queued_turn_id}"),
            message_text: format!("message-{queued_turn_id}"),
            created_at,
            image_count: 0,
            payload: serde_json::json!({ "queuedTurnId": queued_turn_id }),
            metadata: HashMap::new(),
        }
    }

    #[test]
    fn queued_turn_carries_runtime_queue_payload_without_backend_types() {
        let queued_turn = RuntimeQueuedTurn {
            queued_turn_id: "queued-1".to_string(),
            session_id: "session-1".to_string(),
            message_preview: "preview".to_string(),
            message_text: "message".to_string(),
            created_at: 123,
            image_count: 1,
            payload: serde_json::json!({ "queuedTurnId": "queued-1" }),
            metadata: HashMap::from([(
                "event_name".to_string(),
                Value::String("agent_stream".to_string()),
            )]),
        };

        assert_eq!(queued_turn.queued_turn_id, "queued-1");
        assert_eq!(queued_turn.session_id, "session-1");
        assert_eq!(queued_turn.image_count, 1);
    }

    #[test]
    fn submit_result_can_describe_enqueued_current_turn() {
        let queued_turn = RuntimeQueuedTurn {
            queued_turn_id: "queued-1".to_string(),
            session_id: "session-1".to_string(),
            message_preview: "preview".to_string(),
            message_text: "message".to_string(),
            created_at: 123,
            image_count: 0,
            payload: Value::Null,
            metadata: HashMap::new(),
        };

        let result = RuntimeQueueSubmitResult::Enqueued {
            queued_turn: Box::new(queued_turn),
            position: 2,
        };

        assert!(matches!(
            result,
            RuntimeQueueSubmitResult::Enqueued { position: 2, .. }
        ));
    }

    #[test]
    fn interrupted_active_turn_release_allows_follow_turn_to_start_now() {
        futures::executor::block_on(async {
            let service = RuntimeQueueService::new(Arc::new(InMemoryRuntimeQueueStore::new()));
            let first = service
                .submit_turn(queued_turn("session-release", "running", 1), true)
                .await
                .expect("submit first turn");

            assert_eq!(first, RuntimeQueueSubmitResult::StartNow);
            assert!(service.finish_active_turn_if_matches("session-release", "running"));
            let follow = service
                .submit_turn(queued_turn("session-release", "follow", 2), true)
                .await
                .expect("submit follow turn");

            assert_eq!(follow, RuntimeQueueSubmitResult::StartNow);
            assert_eq!(
                service.active_turn_id("session-release").as_deref(),
                Some("follow")
            );
        });
    }

    #[test]
    fn independent_sessions_start_without_blocking_each_other() {
        futures::executor::block_on(async {
            let store = Arc::new(InMemoryRuntimeQueueStore::new());
            let service = RuntimeQueueService::new(store.clone());
            let first = service
                .submit_turn(queued_turn("session-a", "a-running", 1), true)
                .await
                .expect("submit first session turn");
            let same_session_follow = service
                .submit_turn(queued_turn("session-a", "a-follow", 2), true)
                .await
                .expect("submit follow turn");
            let other_session = service
                .submit_turn(queued_turn("session-b", "b-running", 3), true)
                .await
                .expect("submit other session turn");

            assert_eq!(first, RuntimeQueueSubmitResult::StartNow);
            assert_eq!(
                same_session_follow,
                RuntimeQueueSubmitResult::Enqueued {
                    queued_turn: Box::new(queued_turn("session-a", "a-follow", 2)),
                    position: 1
                }
            );
            assert_eq!(other_session, RuntimeQueueSubmitResult::StartNow);
            assert_eq!(
                service.active_turn_id("session-a").as_deref(),
                Some("a-running")
            );
            assert_eq!(
                service.active_turn_id("session-b").as_deref(),
                Some("b-running")
            );
            assert_eq!(
                store
                    .list_queued_turns("session-a")
                    .await
                    .expect("list session-a queue")
                    .len(),
                1
            );
            assert!(store
                .list_queued_turns("session-b")
                .await
                .expect("list session-b queue")
                .is_empty());
        });
    }

    #[test]
    fn completed_active_turn_starts_next_queued_turn() {
        futures::executor::block_on(async {
            let store = Arc::new(InMemoryRuntimeQueueStore::new());
            let service = RuntimeQueueService::new(store.clone());
            let first = service
                .submit_turn(queued_turn("session-continue", "running", 1), true)
                .await
                .expect("submit first turn");

            assert_eq!(first, RuntimeQueueSubmitResult::StartNow);
            store
                .enqueue_turn(queued_turn("session-continue", "follow", 2))
                .await
                .expect("enqueue follow turn");

            let next = service
                .finish_matching_turn_and_take_next("session-continue", "running")
                .await
                .expect("finish running turn");

            assert_eq!(
                next.as_ref().map(|turn| turn.queued_turn_id.as_str()),
                Some("follow")
            );
            assert_eq!(
                service.active_turn_id("session-continue").as_deref(),
                Some("follow")
            );
        });
    }

    #[test]
    fn stale_turn_completion_does_not_release_new_active_turn() {
        futures::executor::block_on(async {
            let store = Arc::new(InMemoryRuntimeQueueStore::new());
            let service = RuntimeQueueService::new(store.clone());
            let _ = service
                .submit_turn(queued_turn("session-stale", "running", 1), true)
                .await
                .expect("submit first turn");
            assert!(service.finish_active_turn_if_matches("session-stale", "running"));
            let _ = service
                .submit_turn(queued_turn("session-stale", "follow", 2), true)
                .await
                .expect("submit follow turn");
            store
                .enqueue_turn(queued_turn("session-stale", "queued-after-follow", 3))
                .await
                .expect("enqueue follow-up queued turn");

            let next = service
                .finish_matching_turn_and_take_next("session-stale", "running")
                .await
                .expect("stale completion should be ignored");

            assert!(next.is_none());
            assert_eq!(
                service.active_turn_id("session-stale").as_deref(),
                Some("follow")
            );
            assert_eq!(
                store
                    .list_queued_turns("session-stale")
                    .await
                    .expect("list queued turns")
                    .len(),
                1
            );
        });
    }
}
