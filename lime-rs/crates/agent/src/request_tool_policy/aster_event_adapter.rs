use super::auto_compaction_projection::AutoCompactionProjectionState;
use crate::aster_runtime_projection::{
    project_aster_auto_compaction_event, project_aster_runtime_event,
};
use crate::protocol::AgentEvent as RuntimeAgentEvent;
use aster::agents::AgentEvent as AsterAgentEvent;

pub(super) struct RuntimeEventProjector {
    auto_compaction: AutoCompactionProjectionState,
}

impl RuntimeEventProjector {
    pub(super) fn new() -> Self {
        Self {
            auto_compaction: AutoCompactionProjectionState,
        }
    }

    pub(super) fn project(&mut self, event: AsterAgentEvent) -> Vec<RuntimeAgentEvent> {
        project_aster_auto_compaction_event(&event)
            .and_then(|event| self.auto_compaction.project_event(&event))
            .unwrap_or_else(|| project_aster_runtime_event(event))
    }
}
