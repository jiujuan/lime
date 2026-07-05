//! Aster runtime snapshot adapter.
//!
//! This module is a migration boundary. It converts Aster runtime snapshots
//! into Lime-owned timeline DTOs before session-store projection code sees them.

use aster::session::SessionRuntimeSnapshot;
use lime_core::database::dao::agent_timeline::{AgentThreadItem, AgentThreadTurn};

use crate::protocol_projection::{project_item_runtime, project_turn_runtime};

pub(crate) type RuntimeTimelineSnapshotProjection =
    agent_runtime::session_execution::RuntimeTimelineSnapshotProjection<
        AgentThreadTurn,
        AgentThreadItem,
    >;

pub(crate) fn project_aster_runtime_snapshot(
    snapshot: &SessionRuntimeSnapshot,
) -> RuntimeTimelineSnapshotProjection {
    let thread_id = snapshot
        .threads
        .first()
        .map(|thread| thread.thread.id.clone());
    let turns = snapshot
        .threads
        .iter()
        .flat_map(|thread| {
            thread
                .turns
                .iter()
                .cloned()
                .map(crate::runtime_timeline_adapter::convert_aster_turn_runtime)
                .map(project_turn_runtime)
        })
        .collect();
    let items = snapshot
        .threads
        .iter()
        .flat_map(|thread| {
            thread
                .items
                .iter()
                .cloned()
                .filter_map(crate::runtime_timeline_adapter::convert_aster_item_runtime)
                .map(project_item_runtime)
        })
        .collect();

    RuntimeTimelineSnapshotProjection {
        thread_id,
        turns,
        items,
    }
}
