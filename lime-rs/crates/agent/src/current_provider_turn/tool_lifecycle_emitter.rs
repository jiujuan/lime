use super::CurrentTurnHostEvent;
use crate::protocol::{
    canonical_tool_item_event, AgentEvent, CanonicalSubAgentActivity, ToolItemLifecycleContext,
};
use agent_protocol::{SessionId, ThreadId};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tokio::sync::mpsc::UnboundedSender;
use tool_runtime::tool_lifecycle::{
    ToolLifecycleEmissionFuture, ToolLifecycleEmitter, ToolLifecycleEvent, ToolLifecyclePhase,
};

pub(super) struct CurrentTurnToolLifecycleEmitter {
    event_sender: UnboundedSender<CurrentTurnHostEvent>,
    session_id: SessionId,
    thread_id: ThreadId,
    next_sequence: AtomicU64,
    next_ordinal: AtomicU64,
    items: Mutex<HashMap<String, ToolItemLifecycleState>>,
}

#[derive(Clone, Copy)]
struct ToolItemLifecycleState {
    ordinal: u64,
    created_at_ms: i64,
}

impl CurrentTurnToolLifecycleEmitter {
    pub(super) fn new(
        event_sender: UnboundedSender<CurrentTurnHostEvent>,
        session_id: impl Into<String>,
        thread_id: impl Into<String>,
    ) -> Self {
        Self {
            event_sender,
            session_id: SessionId::new(session_id),
            thread_id: ThreadId::new(thread_id),
            next_sequence: AtomicU64::new(0),
            next_ordinal: AtomicU64::new(0),
            items: Mutex::new(HashMap::new()),
        }
    }

    #[cfg(test)]
    pub(super) fn project(&self, event: ToolLifecycleEvent) -> Option<AgentEvent> {
        self.project_all(event).into_iter().next()
    }

    pub(super) fn project_all(&self, event: ToolLifecycleEvent) -> Vec<AgentEvent> {
        let terminal = matches!(event.phase, ToolLifecyclePhase::Completed);
        if terminal && event.output.is_none() {
            return Vec::new();
        }

        let subagent_activity = CanonicalSubAgentActivity::from_tool_event(&event);
        let now = chrono::Utc::now().timestamp_millis();
        let key = format!("{}\0{}", event.turn_id, event.call_id);
        let state = {
            let mut items = self
                .items
                .lock()
                .expect("tool item lifecycle mutex poisoned");
            let state = items.get(&key).copied().unwrap_or_else(|| {
                let state = ToolItemLifecycleState {
                    ordinal: self.next_ordinal.fetch_add(1, Ordering::Relaxed) + 1,
                    created_at_ms: now,
                };
                items.insert(key.clone(), state);
                state
            });
            if terminal {
                items.remove(&key);
            }
            state
        };
        let event_count = if subagent_activity.is_some() { 2 } else { 1 };
        let first_sequence = self.next_sequence.fetch_add(event_count, Ordering::Relaxed) + 1;
        let mut projected = Vec::with_capacity(event_count as usize);
        if let Some(event) = canonical_tool_item_event(
            event,
            ToolItemLifecycleContext {
                session_id: self.session_id.clone(),
                thread_id: self.thread_id.clone(),
                sequence: first_sequence,
                ordinal: state.ordinal,
                created_at_ms: state.created_at_ms,
                updated_at_ms: now,
            },
        ) {
            projected.push(event);
        }
        if let Some(activity) = subagent_activity {
            projected.push(activity.into_event(ToolItemLifecycleContext {
                session_id: self.session_id.clone(),
                thread_id: self.thread_id.clone(),
                sequence: first_sequence + 1,
                ordinal: self.next_ordinal.fetch_add(1, Ordering::Relaxed) + 1,
                created_at_ms: now,
                updated_at_ms: now,
            }));
        }
        projected
    }
}

impl ToolLifecycleEmitter for CurrentTurnToolLifecycleEmitter {
    fn emit<'a>(&'a self, event: ToolLifecycleEvent) -> ToolLifecycleEmissionFuture<'a> {
        Box::pin(async move {
            for event in self.project_all(event) {
                let _ = self
                    .event_sender
                    .send(CurrentTurnHostEvent::ToolLifecycle(event));
            }
        })
    }
}
