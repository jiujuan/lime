use crate::runtime_snapshot::{
    RuntimeItemPayloadRecord, RuntimeItemSnapshotRecord, RuntimeItemStatusRecord,
};
use crate::runtime_store::{
    next_runtime_item_sequence_for_thread, upsert_runtime_item_record, RuntimeItemStore,
};
use crate::ThreadStoreResult;
use chrono::Utc;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeStatusItemRecordInput {
    pub thread_id: String,
    pub turn_id: String,
    pub phase: String,
    pub title: String,
    pub detail: String,
    pub checkpoints: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeStatusItemEventKind {
    Started,
    Updated,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeStatusItemUpsertRecord {
    pub item: RuntimeItemSnapshotRecord,
    pub event_kind: RuntimeStatusItemEventKind,
}

pub async fn upsert_runtime_status_item_record(
    store: &(impl RuntimeItemStore + ?Sized),
    input: RuntimeStatusItemRecordInput,
) -> ThreadStoreResult<RuntimeStatusItemUpsertRecord> {
    let item_id = runtime_status_item_id(&input.turn_id);
    let now = Utc::now();
    let existing = store.get_item(&item_id).await?;
    let event_kind = if existing.is_some() {
        RuntimeStatusItemEventKind::Updated
    } else {
        RuntimeStatusItemEventKind::Started
    };
    let sequence = match &existing {
        Some(item) => item.sequence,
        None => next_runtime_item_sequence_for_thread(store, &input.thread_id).await?,
    };

    let item = RuntimeItemSnapshotRecord {
        id: item_id,
        thread_id: input.thread_id,
        turn_id: input.turn_id,
        sequence,
        status: RuntimeItemStatusRecord::InProgress,
        started_at: existing.as_ref().map(|item| item.started_at).unwrap_or(now),
        completed_at: None,
        updated_at: now,
        payload: RuntimeItemPayloadRecord::RuntimeStatus {
            phase: input.phase,
            title: input.title,
            detail: input.detail,
            checkpoints: input.checkpoints,
        },
    };

    let item = upsert_runtime_item_record(store, item).await?;
    Ok(RuntimeStatusItemUpsertRecord { item, event_kind })
}

fn runtime_status_item_id(turn_id: &str) -> String {
    format!("turn_summary:{turn_id}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime_snapshot::RuntimeItemPayloadRecord;
    use crate::runtime_snapshot::RuntimeTurnSnapshotRecord;
    use crate::runtime_store::{
        RuntimeItemWriteStore, RuntimeStore, RuntimeStoreFuture, RuntimeThreadRecord,
    };
    use chrono::Utc;
    use futures::executor::block_on;
    use std::collections::HashMap;
    use std::path::PathBuf;

    #[derive(Default)]
    struct MemoryRuntimeItemStore {
        threads: Vec<RuntimeThreadRecord>,
        items_by_thread: HashMap<String, Vec<RuntimeItemSnapshotRecord>>,
    }

    impl RuntimeStore for MemoryRuntimeItemStore {
        fn list_threads<'a>(
            &'a self,
            session_id: &'a str,
        ) -> RuntimeStoreFuture<'a, Vec<RuntimeThreadRecord>> {
            Box::pin(async move {
                Ok(self
                    .threads
                    .iter()
                    .filter(|thread| thread.session_id == session_id)
                    .cloned()
                    .collect())
            })
        }

        fn list_turns<'a>(
            &'a self,
            _thread_id: &'a str,
        ) -> RuntimeStoreFuture<'a, Vec<RuntimeTurnSnapshotRecord>> {
            Box::pin(async move { Ok(Vec::new()) })
        }

        fn list_items<'a>(
            &'a self,
            thread_id: &'a str,
        ) -> RuntimeStoreFuture<'a, Vec<RuntimeItemSnapshotRecord>> {
            Box::pin(async move {
                Ok(self
                    .items_by_thread
                    .get(thread_id)
                    .cloned()
                    .unwrap_or_default())
            })
        }
    }

    impl RuntimeItemWriteStore for MemoryRuntimeItemStore {
        fn create_item<'a>(
            &'a self,
            item: RuntimeItemSnapshotRecord,
        ) -> RuntimeStoreFuture<'a, RuntimeItemSnapshotRecord> {
            Box::pin(async move { Ok(item) })
        }

        fn update_item<'a>(
            &'a self,
            item: RuntimeItemSnapshotRecord,
        ) -> RuntimeStoreFuture<'a, RuntimeItemSnapshotRecord> {
            Box::pin(async move { Ok(item) })
        }

        fn get_item<'a>(
            &'a self,
            item_id: &'a str,
        ) -> RuntimeStoreFuture<'a, Option<RuntimeItemSnapshotRecord>> {
            Box::pin(async move {
                Ok(self
                    .items_by_thread
                    .values()
                    .flatten()
                    .find(|item| item.id == item_id)
                    .cloned())
            })
        }

        fn delete_item<'a>(
            &'a self,
            _item_id: &'a str,
        ) -> RuntimeStoreFuture<'a, Option<RuntimeItemSnapshotRecord>> {
            Box::pin(async move { Ok(None) })
        }
    }

    fn thread_record() -> RuntimeThreadRecord {
        let now = Utc::now();
        RuntimeThreadRecord {
            id: "thread-1".to_string(),
            session_id: "session-1".to_string(),
            working_dir: PathBuf::from("/tmp/workspace"),
            created_at: now,
            updated_at: now,
            metadata: HashMap::new(),
        }
    }

    fn input() -> RuntimeStatusItemRecordInput {
        RuntimeStatusItemRecordInput {
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            phase: "web_retrieval".to_string(),
            title: "正在整理网页结果".to_string(),
            detail: "汇总搜索结果".to_string(),
            checkpoints: vec!["搜索完成".to_string()],
        }
    }

    fn existing_status_item() -> RuntimeItemSnapshotRecord {
        let now = Utc::now();
        RuntimeItemSnapshotRecord {
            id: "turn_summary:turn-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 7,
            status: RuntimeItemStatusRecord::InProgress,
            started_at: now,
            completed_at: None,
            updated_at: now,
            payload: RuntimeItemPayloadRecord::RuntimeStatus {
                phase: "old".to_string(),
                title: "old".to_string(),
                detail: "old".to_string(),
                checkpoints: Vec::new(),
            },
        }
    }

    #[test]
    fn upsert_runtime_status_item_record_creates_status_payload() {
        let mut store = MemoryRuntimeItemStore {
            threads: vec![thread_record()],
            ..Default::default()
        };
        store.items_by_thread.insert(
            "thread-1".to_string(),
            vec![RuntimeItemSnapshotRecord {
                sequence: 3,
                ..existing_status_item()
            }],
        );
        store
            .items_by_thread
            .get_mut("thread-1")
            .expect("items")
            .first_mut()
            .expect("item")
            .id = "other-item".to_string();

        let record = block_on(upsert_runtime_status_item_record(&store, input()))
            .expect("upsert status item");

        assert_eq!(record.event_kind, RuntimeStatusItemEventKind::Started);
        assert_eq!(record.item.id, "turn_summary:turn-1");
        assert_eq!(record.item.sequence, 4);
        match record.item.payload {
            RuntimeItemPayloadRecord::RuntimeStatus {
                phase,
                title,
                detail,
                checkpoints,
            } => {
                assert_eq!(phase, "web_retrieval");
                assert_eq!(title, "正在整理网页结果");
                assert_eq!(detail, "汇总搜索结果");
                assert_eq!(checkpoints, vec!["搜索完成".to_string()]);
            }
            other => panic!("unexpected payload: {other:?}"),
        }
    }

    #[test]
    fn upsert_runtime_status_item_record_preserves_existing_sequence() {
        let mut store = MemoryRuntimeItemStore {
            threads: vec![thread_record()],
            ..Default::default()
        };
        store
            .items_by_thread
            .insert("thread-1".to_string(), vec![existing_status_item()]);

        let record = block_on(upsert_runtime_status_item_record(&store, input()))
            .expect("upsert status item");

        assert_eq!(record.event_kind, RuntimeStatusItemEventKind::Updated);
        assert_eq!(record.item.sequence, 7);
        assert_eq!(record.item.status, RuntimeItemStatusRecord::InProgress);
        assert!(record.item.completed_at.is_none());
    }
}
