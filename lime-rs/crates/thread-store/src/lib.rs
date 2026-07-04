pub mod conversation_transcript;
pub mod session_record;
pub mod session_repository;
pub mod subagent_tree;

use agent_protocol::{RuntimeEvent, RuntimeSnapshot, SessionId, ThreadId, TurnId};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;
use std::fmt;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct StoredThread {
    pub session_id: SessionId,
    pub thread_id: ThreadId,
    pub latest_turn_id: Option<TurnId>,
    #[serde(default)]
    pub metadata: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct StoredTurn {
    pub session_id: SessionId,
    pub thread_id: ThreadId,
    pub turn_id: TurnId,
    #[serde(default)]
    pub metadata: Value,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ThreadStoreError {
    message: String,
}

impl ThreadStoreError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for ThreadStoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for ThreadStoreError {}

pub type ThreadStoreResult<T> = Result<T, ThreadStoreError>;

pub trait ThreadStore {
    fn load_thread(
        &self,
        session_id: &SessionId,
        thread_id: &ThreadId,
    ) -> ThreadStoreResult<Option<RuntimeSnapshot>>;

    fn append_event(&self, event: RuntimeEvent) -> ThreadStoreResult<()>;
}
