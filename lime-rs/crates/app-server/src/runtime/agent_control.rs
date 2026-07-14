//! Canonical parent/child graph control backed by RuntimeCore and ProjectionStore.
//!
//! The graph is deliberately independent of legacy session metadata and Team state. A child is
//! usable only after its canonical session/thread exists and its Open edge has been persisted.

use super::agent_control_gateway_support::required_agent_control_id;
use super::*;
use agent_protocol::ThreadId;
use app_server_protocol::AgentSessionStartParams;
use thread_store::{AgentGraphStore, ThreadSpawnEdgeStatus};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AgentControlSpawnRequest {
    pub parent_session_id: String,
    pub child_session_id: Option<String>,
    pub child_thread_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct AgentControlSpawnResponse {
    pub session: AgentSession,
    pub parent_thread_id: String,
}

impl RuntimeCore {
    /// Creates a canonical child session/thread and persists its Open parent edge.
    ///
    /// A graph-enabled control path requires ProjectionStore. We fail before session creation
    /// when it is unavailable so an in-memory child cannot escape without durable topology.
    pub(crate) async fn spawn_agent_controlled(
        &self,
        request: AgentControlSpawnRequest,
    ) -> Result<AgentControlSpawnResponse, RuntimeCoreError> {
        let parent_session_id = required_agent_control_id(
            request.parent_session_id,
            "parent session id is required for agent control spawn",
        )?;
        let projection_store = self.projection_store.as_ref().ok_or_else(|| {
            RuntimeCoreError::Backend(
                "agent control requires canonical ProjectionStore".to_string(),
            )
        })?;
        let parent = self.loaded_agent_control_parent(&parent_session_id)?;
        let child_session_id = request
            .child_session_id
            .map(|value| required_agent_control_id(value, "child session id is empty"))
            .transpose()?;
        let child_thread_id = request
            .child_thread_id
            .map(|value| required_agent_control_id(value, "child thread id is empty"))
            .transpose()?;

        let response = self.start_session(AgentSessionStartParams {
            session_id: child_session_id,
            thread_id: child_thread_id,
            app_id: parent.app_id,
            workspace_id: parent.workspace_id,
            business_object_ref: None,
            locale: None,
        })?;
        if let Err(error) = projection_store
            .upsert_thread_spawn_edge(
                ThreadId::new(parent.thread_id.clone()),
                ThreadId::new(response.session.thread_id.clone()),
                ThreadSpawnEdgeStatus::Open,
            )
            .await
        {
            if let Err(cleanup_error) =
                self.delete_agent_control_child_after_edge_failure(&response.session.session_id)
            {
                return Err(RuntimeCoreError::Backend(format!(
                    "failed to persist canonical child thread edge: {error}; failed to remove unlinked child session: {cleanup_error}"
                )));
            }
            return Err(RuntimeCoreError::Backend(format!(
                "failed to persist canonical child thread edge: {error}"
            )));
        }

        Ok(AgentControlSpawnResponse {
            session: response.session,
            parent_thread_id: parent.thread_id,
        })
    }

    fn loaded_agent_control_parent(
        &self,
        session_id: &str,
    ) -> Result<AgentSession, RuntimeCoreError> {
        self.state
            .lock()
            .expect("runtime core state mutex poisoned")
            .sessions
            .get(session_id)
            .map(|stored| stored.session.clone())
            .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))
    }

    pub(in crate::runtime) fn delete_agent_control_child_after_edge_failure(
        &self,
        session_id: &str,
    ) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let Some(stored) = state.sessions.get(session_id) else {
            return Err("child session disappeared before graph failure cleanup".to_string());
        };
        let child_session_id = stored.session.session_id.clone();
        if let Some(projection_store) = self.projection_store.as_ref() {
            projection_store.delete_session_data(&child_session_id)?;
        }
        state.sessions.remove(session_id);
        Ok(())
    }
}

#[cfg(test)]
#[path = "tests/agent_control.rs"]
mod tests;
