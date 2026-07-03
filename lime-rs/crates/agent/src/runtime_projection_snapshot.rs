use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeProjectionSnapshotSource {
    pub threads: Vec<RuntimeProjectionThreadSnapshot>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeProjectionThreadSnapshot {
    pub thread_id: String,
    pub turns: Vec<RuntimeProjectionTurnSnapshot>,
    pub item_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeProjectionTurnSnapshot {
    pub id: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RuntimeProjectionSnapshot {
    pub session_id: String,
    pub has_runtime_snapshot: bool,
    pub thread_count: usize,
    pub primary_thread_id: Option<String>,
    pub turn_count: usize,
    pub item_count: usize,
    pub latest_turn_id: Option<String>,
}

impl RuntimeProjectionSnapshot {
    pub fn from_snapshot(
        session_id: impl Into<String>,
        snapshot: Option<&RuntimeProjectionSnapshotSource>,
    ) -> Self {
        let session_id = session_id.into();
        let Some(snapshot) = snapshot else {
            return Self {
                session_id,
                has_runtime_snapshot: false,
                thread_count: 0,
                primary_thread_id: None,
                turn_count: 0,
                item_count: 0,
                latest_turn_id: None,
            };
        };

        let thread_count = snapshot.threads.len();
        let primary_thread_id = snapshot
            .threads
            .first()
            .map(|thread| thread.thread_id.clone());
        let turn_count = snapshot
            .threads
            .iter()
            .map(|thread| thread.turns.len())
            .sum();
        let item_count = snapshot
            .threads
            .iter()
            .map(|thread| thread.item_count)
            .sum();
        let latest_turn_id = snapshot
            .threads
            .iter()
            .flat_map(|thread| thread.turns.iter())
            .max_by(|left, right| {
                left.updated_at_ms
                    .cmp(&right.updated_at_ms)
                    .then_with(|| left.created_at_ms.cmp(&right.created_at_ms))
                    .then_with(|| left.id.cmp(&right.id))
            })
            .map(|turn| turn.id.clone());

        Self {
            session_id,
            has_runtime_snapshot: true,
            thread_count,
            primary_thread_id,
            turn_count,
            item_count,
            latest_turn_id,
        }
    }

    pub fn primary_thread_id(&self) -> Option<&str> {
        self.primary_thread_id.as_deref()
    }
}

#[cfg(test)]
mod tests {
    use super::{
        RuntimeProjectionSnapshot, RuntimeProjectionSnapshotSource,
        RuntimeProjectionThreadSnapshot, RuntimeProjectionTurnSnapshot,
    };

    #[test]
    fn test_runtime_projection_snapshot_reads_primary_thread_and_latest_turn() {
        let snapshot = RuntimeProjectionSnapshotSource {
            threads: vec![RuntimeProjectionThreadSnapshot {
                thread_id: "thread-1".to_string(),
                turns: vec![
                    RuntimeProjectionTurnSnapshot {
                        id: "turn-old".to_string(),
                        created_at_ms: 100,
                        updated_at_ms: 200,
                    },
                    RuntimeProjectionTurnSnapshot {
                        id: "turn-new".to_string(),
                        created_at_ms: 300,
                        updated_at_ms: 400,
                    },
                ],
                item_count: 0,
            }],
        };

        let projection = RuntimeProjectionSnapshot::from_snapshot("session-1", Some(&snapshot));

        assert!(projection.has_runtime_snapshot);
        assert_eq!(projection.primary_thread_id(), Some("thread-1"));
        assert_eq!(projection.thread_count, 1);
        assert_eq!(projection.turn_count, 2);
        assert_eq!(projection.item_count, 0);
        assert_eq!(projection.latest_turn_id.as_deref(), Some("turn-new"));
    }

    #[test]
    fn test_runtime_projection_snapshot_handles_missing_snapshot() {
        let projection = RuntimeProjectionSnapshot::from_snapshot("session-2", None);

        assert!(!projection.has_runtime_snapshot);
        assert_eq!(projection.primary_thread_id(), None);
        assert_eq!(projection.turn_count, 0);
    }
}
