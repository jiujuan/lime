//! Runtime snapshot projection adapter.
//!
//! This module maps Lime-owned runtime snapshot records into GUI DAO DTOs.

use lime_core::database::dao::agent_timeline::{AgentThreadItem, AgentThreadTurn};
use thread_store::runtime_snapshot::RuntimeSessionSnapshotRecord;

use crate::protocol_projection::{project_item_runtime, project_turn_runtime};
use crate::runtime_timeline_adapter::project_runtime_timeline_snapshot_record;

pub(crate) type RuntimeTimelineSnapshotProjection =
    agent_runtime::runtime_timeline::RuntimeTimelineSnapshotProjection<
        AgentThreadTurn,
        AgentThreadItem,
    >;

pub(crate) fn project_runtime_snapshot_record(
    snapshot: &RuntimeSessionSnapshotRecord,
) -> RuntimeTimelineSnapshotProjection {
    let current_snapshot = project_runtime_timeline_snapshot_record(snapshot);
    let turns = current_snapshot
        .turns
        .into_iter()
        .map(project_turn_runtime)
        .collect();
    let items = current_snapshot
        .items
        .into_iter()
        .map(project_item_runtime)
        .collect();

    RuntimeTimelineSnapshotProjection {
        thread_id: current_snapshot.thread_id,
        turns,
        items,
    }
}
