pub mod agent_graph;
pub mod agent_identity;
pub mod agent_mailbox;
pub mod runtime_snapshot;
pub mod session_record;
pub mod session_repository;
pub mod store;
pub mod subagent_tree;
pub mod task_board;
pub mod types;

use std::error::Error;
use std::fmt;

pub use agent_graph::{
    AgentGraphStore, AgentGraphStoreFuture, ThreadSpawnEdgeStatus, ThreadSpawnParent,
};
pub use agent_identity::{
    canonical_agent_path_task_name, AgentIdentity, AgentIdentityStore, AgentIdentityStoreFuture,
};
pub use agent_mailbox::{
    AgentMailboxDeliveryMode, AgentMailboxDeliveryStatus, AgentMailboxMessage,
    AgentMailboxMessageKind, AgentMailboxResultStatus, AgentMailboxStore, AgentMailboxStoreFuture,
    AppendAgentMailboxMessageParams,
};
pub use store::{ThreadStore, ThreadStoreFuture};
pub use types::{
    ApplyThreadHistoryParams, ApplyThreadHistoryResult, ArchiveThreadParams, ClearableField,
    CreateThreadParams, DeleteThreadParams, ItemPage, ListItemsParams, ListThreadsParams,
    ListTurnsParams, PageRequest, ReadThreadParams, StoreCursor, ThreadMetadataPatch, ThreadPage,
    TurnPage, UpdateThreadMetadataParams,
};

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
