use std::future::Future;
use std::pin::Pin;

use agent_protocol::ThreadId;
use serde::{Deserialize, Serialize};

use crate::{ThreadStoreError, ThreadStoreResult};

/// Durable identity for an agent thread inside one root-thread tree.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentIdentity {
    pub root_thread_id: ThreadId,
    pub thread_id: ThreadId,
    pub agent_path: String,
    pub nickname: Option<String>,
    pub role: Option<String>,
    pub last_task_message: Option<String>,
}

impl AgentIdentity {
    /// Derive the V2 task name from the final canonical path segment instead of storing it twice.
    pub fn task_name(&self) -> ThreadStoreResult<&str> {
        canonical_agent_path_task_name(&self.agent_path)
    }
}

/// Validates a canonical absolute agent path and returns its final task-name segment.
pub fn canonical_agent_path_task_name(agent_path: &str) -> ThreadStoreResult<&str> {
    if !agent_path.starts_with('/') || agent_path.len() <= 1 || agent_path.ends_with('/') {
        return Err(ThreadStoreError::new(
            "agent path must be a non-root canonical absolute path",
        ));
    }
    let task_name = agent_path
        .rsplit('/')
        .next()
        .filter(|segment| !segment.is_empty())
        .ok_or_else(|| ThreadStoreError::new("agent path is missing a task name"))?;
    if agent_path
        .split('/')
        .skip(1)
        .any(|segment| segment.is_empty() || matches!(segment, "." | ".."))
    {
        return Err(ThreadStoreError::new(
            "agent path contains an invalid segment",
        ));
    }
    Ok(task_name)
}

/// Future returned by [`AgentIdentityStore`] operations.
pub type AgentIdentityStoreFuture<'a, T> =
    Pin<Box<dyn Future<Output = ThreadStoreResult<T>> + Send + 'a>>;

/// Storage-neutral owner for durable agent identity and path resolution.
///
/// `thread_id` and `(root_thread_id, agent_path)` are both unique. Upsert may refresh display and
/// task-message fields, but it must not rebind an existing thread to a different root or path.
pub trait AgentIdentityStore: Send + Sync {
    fn upsert_agent_identity(
        &self,
        identity: AgentIdentity,
    ) -> AgentIdentityStoreFuture<'_, AgentIdentity>;

    fn read_agent_identity(
        &self,
        thread_id: ThreadId,
    ) -> AgentIdentityStoreFuture<'_, Option<AgentIdentity>>;

    /// Deletes a child identity during spawn compensation before it becomes usable.
    fn delete_agent_identity(&self, thread_id: ThreadId) -> AgentIdentityStoreFuture<'_, ()>;

    fn list_agent_identities(
        &self,
        root_thread_id: ThreadId,
    ) -> AgentIdentityStoreFuture<'_, Vec<AgentIdentity>>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_task_name_from_canonical_path() {
        assert_eq!(
            canonical_agent_path_task_name("/root/research/refactor_v2").expect("task name"),
            "refactor_v2"
        );
    }

    #[test]
    fn rejects_ambiguous_agent_paths() {
        for path in ["root/worker", "/root/", "/root//worker", "/root/../worker"] {
            assert!(canonical_agent_path_task_name(path).is_err(), "{path}");
        }
    }

    #[allow(dead_code)]
    fn assert_agent_identity_store_object_safe(store: &dyn AgentIdentityStore) {
        let _ = store;
    }
}
