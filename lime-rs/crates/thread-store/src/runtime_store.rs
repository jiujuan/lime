use crate::conversation_transcript::{
    is_runtime_transcript_item_record, next_runtime_item_sequence,
    project_runtime_conversation_record_from_item_record, ConversationMessageRecord,
};
use crate::runtime_snapshot::{
    RuntimeItemPayloadRecord, RuntimeItemSnapshotRecord, RuntimeItemStatusRecord,
    RuntimeSessionSnapshotRecord, RuntimeThreadSnapshotRecord, RuntimeTurnSnapshotRecord,
    RuntimeTurnStatusRecord,
};
use crate::{ThreadStoreError, ThreadStoreResult};
use agent_protocol::turn_context::{TurnContextOverride, TurnOutputSchemaRuntime};
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use uuid::Uuid;

pub type RuntimeStoreFuture<'a, T> =
    Pin<Box<dyn Future<Output = ThreadStoreResult<T>> + Send + 'a>>;

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeThreadRecord {
    pub id: String,
    pub session_id: String,
    pub working_dir: PathBuf,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub metadata: HashMap<String, Value>,
}

pub trait RuntimeStore: Send + Sync {
    fn list_threads<'a>(
        &'a self,
        session_id: &'a str,
    ) -> RuntimeStoreFuture<'a, Vec<RuntimeThreadRecord>>;

    fn list_turns<'a>(
        &'a self,
        thread_id: &'a str,
    ) -> RuntimeStoreFuture<'a, Vec<RuntimeTurnSnapshotRecord>>;

    fn list_items<'a>(
        &'a self,
        thread_id: &'a str,
    ) -> RuntimeStoreFuture<'a, Vec<RuntimeItemSnapshotRecord>>;
}

pub trait RuntimeThreadWriteStore: Send + Sync {
    fn upsert_thread<'a>(
        &'a self,
        thread: RuntimeThreadRecord,
    ) -> RuntimeStoreFuture<'a, RuntimeThreadRecord>;

    fn get_thread<'a>(
        &'a self,
        thread_id: &'a str,
    ) -> RuntimeStoreFuture<'a, Option<RuntimeThreadRecord>>;
}

pub trait RuntimeTurnWriteStore: Send + Sync {
    fn create_turn<'a>(
        &'a self,
        turn: RuntimeTurnSnapshotRecord,
    ) -> RuntimeStoreFuture<'a, RuntimeTurnSnapshotRecord>;

    fn update_turn<'a>(
        &'a self,
        turn: RuntimeTurnSnapshotRecord,
    ) -> RuntimeStoreFuture<'a, RuntimeTurnSnapshotRecord>;

    fn get_turn<'a>(
        &'a self,
        turn_id: &'a str,
    ) -> RuntimeStoreFuture<'a, Option<RuntimeTurnSnapshotRecord>>;
}

pub trait RuntimeThreadTurnStore:
    RuntimeStore + RuntimeThreadWriteStore + RuntimeTurnWriteStore
{
}

impl<T> RuntimeThreadTurnStore for T where
    T: RuntimeStore + RuntimeThreadWriteStore + RuntimeTurnWriteStore
{
}

pub trait RuntimeItemWriteStore: Send + Sync {
    fn create_item<'a>(
        &'a self,
        item: RuntimeItemSnapshotRecord,
    ) -> RuntimeStoreFuture<'a, RuntimeItemSnapshotRecord>;

    fn update_item<'a>(
        &'a self,
        item: RuntimeItemSnapshotRecord,
    ) -> RuntimeStoreFuture<'a, RuntimeItemSnapshotRecord>;

    fn get_item<'a>(
        &'a self,
        item_id: &'a str,
    ) -> RuntimeStoreFuture<'a, Option<RuntimeItemSnapshotRecord>>;

    fn delete_item<'a>(
        &'a self,
        item_id: &'a str,
    ) -> RuntimeStoreFuture<'a, Option<RuntimeItemSnapshotRecord>>;
}

pub trait RuntimeItemStore: RuntimeStore + RuntimeItemWriteStore {}

impl<T> RuntimeItemStore for T where T: RuntimeStore + RuntimeItemWriteStore {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeTurnScopeInput {
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeTurnScopeRecord {
    pub thread_id: String,
    pub turn_id: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeTurnEnsureInput {
    pub session_id: String,
    pub working_dir: PathBuf,
    pub scope: RuntimeTurnScopeInput,
    pub input_text: Option<String>,
    pub context_override: Option<TurnContextOverride>,
    pub output_schema_runtime: Option<TurnOutputSchemaRuntime>,
}

pub fn resolve_runtime_turn_scope(
    session_id: &str,
    scope: RuntimeTurnScopeInput,
) -> RuntimeTurnScopeRecord {
    RuntimeTurnScopeRecord {
        thread_id: non_empty_string(scope.thread_id).unwrap_or_else(|| session_id.to_string()),
        turn_id: non_empty_string(scope.turn_id).unwrap_or_else(|| Uuid::new_v4().to_string()),
    }
}

pub async fn ensure_runtime_turn_record(
    store: &(impl RuntimeThreadTurnStore + ?Sized),
    input: RuntimeTurnEnsureInput,
) -> ThreadStoreResult<RuntimeTurnSnapshotRecord> {
    let scope = resolve_runtime_turn_scope(&input.session_id, input.scope);
    let now = Utc::now();
    let thread = store
        .get_thread(&scope.thread_id)
        .await?
        .unwrap_or_else(|| RuntimeThreadRecord {
            id: scope.thread_id.clone(),
            session_id: input.session_id.clone(),
            working_dir: input.working_dir,
            created_at: now,
            updated_at: now,
            metadata: HashMap::new(),
        });
    store.upsert_thread(thread).await?;

    if let Some(mut turn) = store.get_turn(&scope.turn_id).await? {
        let mut changed = false;
        if turn.input_text.is_none() && input.input_text.is_some() {
            turn.input_text = input.input_text;
            changed = true;
        }
        if turn.context_override.is_none() && input.context_override.is_some() {
            turn.context_override = input.context_override;
            changed = true;
        }
        if turn.output_schema_runtime.is_none() && input.output_schema_runtime.is_some() {
            turn.output_schema_runtime = input.output_schema_runtime;
            changed = true;
        }
        if changed {
            turn.updated_at = now;
            return store.update_turn(turn).await;
        }
        return Ok(turn);
    }

    store
        .create_turn(RuntimeTurnSnapshotRecord {
            id: scope.turn_id,
            session_id: input.session_id,
            thread_id: scope.thread_id,
            status: RuntimeTurnStatusRecord::Running,
            input_text: input.input_text,
            error_message: None,
            context_override: input.context_override,
            output_schema_runtime: input.output_schema_runtime,
            created_at: now,
            started_at: Some(now),
            completed_at: None,
            updated_at: now,
        })
        .await
}

pub async fn complete_runtime_turn_record(
    store: &(impl RuntimeTurnWriteStore + ?Sized),
    turn_id: &str,
    status: RuntimeTurnStatusRecord,
    error_message: Option<String>,
) -> ThreadStoreResult<Option<RuntimeTurnSnapshotRecord>> {
    let Some(mut turn) = store.get_turn(turn_id).await? else {
        return Ok(None);
    };

    let now = Utc::now();
    turn.status = status;
    turn.error_message = error_message;
    turn.completed_at = Some(now);
    turn.updated_at = now;
    store.update_turn(turn).await.map(Some)
}

pub async fn load_runtime_snapshot_record(
    store: &(impl RuntimeStore + ?Sized),
    session_id: &str,
) -> ThreadStoreResult<RuntimeSessionSnapshotRecord> {
    let threads = store.list_threads(session_id).await?;
    let mut snapshots = Vec::with_capacity(threads.len());

    for thread in threads {
        let turns = store.list_turns(&thread.id).await?;
        let items = store.list_items(&thread.id).await?;
        snapshots.push(RuntimeThreadSnapshotRecord {
            id: thread.id,
            session_id: thread.session_id,
            working_dir: thread.working_dir,
            created_at: thread.created_at,
            updated_at: thread.updated_at,
            metadata: thread.metadata,
            turns,
            items,
        });
    }

    Ok(RuntimeSessionSnapshotRecord {
        session_id: session_id.to_string(),
        threads: snapshots,
    })
}

pub async fn collect_runtime_conversation_records(
    store: &(impl RuntimeStore + ?Sized),
    session_id: &str,
) -> ThreadStoreResult<Vec<ConversationMessageRecord>> {
    let mut records = Vec::new();
    let threads = store.list_threads(session_id).await?;

    for thread in threads {
        for item in store.list_items(&thread.id).await? {
            if let Some(record) = project_runtime_conversation_record_from_item_record(&item) {
                records.push(record);
            }
        }
    }

    Ok(records)
}

pub async fn upsert_runtime_item_record(
    store: &(impl RuntimeItemWriteStore + ?Sized),
    item: RuntimeItemSnapshotRecord,
) -> ThreadStoreResult<RuntimeItemSnapshotRecord> {
    if store.get_item(&item.id).await?.is_some() {
        store.update_item(item).await
    } else {
        store.create_item(item).await
    }
}

pub async fn complete_runtime_request_item_record(
    store: &(impl RuntimeItemWriteStore + ?Sized),
    request_id: &str,
    response: Option<Value>,
) -> ThreadStoreResult<Option<RuntimeItemSnapshotRecord>> {
    let Some(mut item) = store.get_item(request_id).await? else {
        return Ok(None);
    };

    let now = Utc::now();
    item.status = RuntimeItemStatusRecord::Completed;
    item.completed_at = Some(now);
    item.updated_at = now;
    item.payload = match item.payload {
        RuntimeItemPayloadRecord::ApprovalRequest {
            request_id,
            action_type,
            prompt,
            tool_name,
            arguments,
            ..
        } => RuntimeItemPayloadRecord::ApprovalRequest {
            request_id,
            action_type,
            prompt,
            tool_name,
            arguments,
            response,
        },
        RuntimeItemPayloadRecord::RequestUserInput {
            request_id,
            action_type,
            prompt,
            requested_schema,
            ..
        } => RuntimeItemPayloadRecord::RequestUserInput {
            request_id,
            action_type,
            prompt,
            requested_schema,
            response,
        },
        payload => payload,
    };

    store.update_item(item).await.map(Some)
}

pub async fn next_runtime_item_sequence_for_thread(
    store: &(impl RuntimeStore + ?Sized),
    thread_id: &str,
) -> ThreadStoreResult<i64> {
    let items = store.list_items(thread_id).await?;
    Ok(next_runtime_item_sequence(
        items.iter().map(|item| item.sequence),
    ))
}

pub async fn delete_runtime_transcript_items(
    store: &(impl RuntimeItemStore + ?Sized),
    session_id: &str,
) -> ThreadStoreResult<()> {
    let threads = store.list_threads(session_id).await?;
    for thread in threads {
        for item in store.list_items(&thread.id).await? {
            if is_runtime_transcript_item_record(&item) {
                store.delete_item(&item.id).await?;
            }
        }
    }
    Ok(())
}

pub fn runtime_store_error(message: impl Into<String>) -> ThreadStoreError {
    ThreadStoreError::new(message)
}

fn non_empty_string(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| value)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::conversation_transcript::ConversationMessageRole;
    use crate::runtime_snapshot::{RuntimeItemPayloadRecord, RuntimeItemStatusRecord};
    use chrono::Utc;
    use futures::executor::block_on;
    use std::collections::HashMap;
    use std::sync::Mutex;

    #[derive(Default)]
    struct MemoryRuntimeStore {
        threads: Vec<RuntimeThreadRecord>,
        turns_by_thread: HashMap<String, Vec<RuntimeTurnSnapshotRecord>>,
        items_by_thread: HashMap<String, Vec<RuntimeItemSnapshotRecord>>,
        upserted_threads: Mutex<Vec<RuntimeThreadRecord>>,
        created_turns: Mutex<Vec<RuntimeTurnSnapshotRecord>>,
        deleted_item_ids: Mutex<Vec<String>>,
    }

    impl RuntimeStore for MemoryRuntimeStore {
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
            thread_id: &'a str,
        ) -> RuntimeStoreFuture<'a, Vec<RuntimeTurnSnapshotRecord>> {
            Box::pin(async move {
                Ok(self
                    .turns_by_thread
                    .get(thread_id)
                    .cloned()
                    .unwrap_or_default())
            })
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

    impl RuntimeThreadWriteStore for MemoryRuntimeStore {
        fn upsert_thread<'a>(
            &'a self,
            thread: RuntimeThreadRecord,
        ) -> RuntimeStoreFuture<'a, RuntimeThreadRecord> {
            Box::pin(async move {
                self.upserted_threads
                    .lock()
                    .expect("upserted threads")
                    .push(thread.clone());
                Ok(thread)
            })
        }

        fn get_thread<'a>(
            &'a self,
            thread_id: &'a str,
        ) -> RuntimeStoreFuture<'a, Option<RuntimeThreadRecord>> {
            Box::pin(async move {
                Ok(self
                    .threads
                    .iter()
                    .find(|thread| thread.id == thread_id)
                    .cloned())
            })
        }
    }

    impl RuntimeTurnWriteStore for MemoryRuntimeStore {
        fn create_turn<'a>(
            &'a self,
            turn: RuntimeTurnSnapshotRecord,
        ) -> RuntimeStoreFuture<'a, RuntimeTurnSnapshotRecord> {
            Box::pin(async move {
                self.created_turns
                    .lock()
                    .expect("created turns")
                    .push(turn.clone());
                Ok(turn)
            })
        }

        fn update_turn<'a>(
            &'a self,
            turn: RuntimeTurnSnapshotRecord,
        ) -> RuntimeStoreFuture<'a, RuntimeTurnSnapshotRecord> {
            Box::pin(async move { Ok(turn) })
        }

        fn get_turn<'a>(
            &'a self,
            turn_id: &'a str,
        ) -> RuntimeStoreFuture<'a, Option<RuntimeTurnSnapshotRecord>> {
            Box::pin(async move {
                Ok(self
                    .turns_by_thread
                    .values()
                    .flatten()
                    .find(|turn| turn.id == turn_id)
                    .cloned())
            })
        }
    }

    impl RuntimeItemWriteStore for MemoryRuntimeStore {
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
            item_id: &'a str,
        ) -> RuntimeStoreFuture<'a, Option<RuntimeItemSnapshotRecord>> {
            Box::pin(async move {
                self.deleted_item_ids
                    .lock()
                    .expect("deleted ids")
                    .push(item_id.to_string());
                Ok(self
                    .items_by_thread
                    .values()
                    .flatten()
                    .find(|item| item.id == item_id)
                    .cloned())
            })
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

    fn item_record(payload: RuntimeItemPayloadRecord) -> RuntimeItemSnapshotRecord {
        let now = Utc::now();
        RuntimeItemSnapshotRecord {
            id: "item-1".to_string(),
            thread_id: "thread-1".to_string(),
            turn_id: "turn-1".to_string(),
            sequence: 1,
            status: RuntimeItemStatusRecord::Completed,
            started_at: now,
            completed_at: Some(now),
            updated_at: now,
            payload,
        }
    }

    fn turn_record() -> RuntimeTurnSnapshotRecord {
        let now = Utc::now();
        RuntimeTurnSnapshotRecord {
            id: "turn-1".to_string(),
            session_id: "session-1".to_string(),
            thread_id: "thread-1".to_string(),
            status: RuntimeTurnStatusRecord::Running,
            input_text: None,
            error_message: None,
            context_override: None,
            output_schema_runtime: None,
            created_at: now,
            started_at: Some(now),
            completed_at: None,
            updated_at: now,
        }
    }

    #[test]
    fn load_runtime_snapshot_record_collects_current_records() {
        let mut store = MemoryRuntimeStore {
            threads: vec![thread_record()],
            ..Default::default()
        };
        store.items_by_thread.insert(
            "thread-1".to_string(),
            vec![item_record(RuntimeItemPayloadRecord::AgentMessage {
                text: "完成".to_string(),
            })],
        );

        let snapshot = block_on(load_runtime_snapshot_record(&store, "session-1")).expect("record");

        assert_eq!(snapshot.session_id, "session-1");
        assert_eq!(snapshot.threads.len(), 1);
        assert_eq!(snapshot.threads[0].items.len(), 1);
    }

    #[test]
    fn collect_runtime_conversation_records_projects_current_items() {
        let mut store = MemoryRuntimeStore {
            threads: vec![thread_record()],
            ..Default::default()
        };
        store.items_by_thread.insert(
            "thread-1".to_string(),
            vec![item_record(RuntimeItemPayloadRecord::UserMessage {
                content: " hello ".to_string(),
            })],
        );

        let records =
            block_on(collect_runtime_conversation_records(&store, "session-1")).expect("records");

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].role, ConversationMessageRole::User);
        assert_eq!(records[0].text.as_deref(), Some("hello"));
    }

    #[test]
    fn upsert_runtime_item_record_should_create_or_update_through_current_store() {
        let store = MemoryRuntimeStore {
            threads: vec![thread_record()],
            ..Default::default()
        };

        let item = block_on(upsert_runtime_item_record(
            &store,
            item_record(RuntimeItemPayloadRecord::AgentMessage {
                text: "new".to_string(),
            }),
        ))
        .expect("upsert item");

        assert_eq!(item.id, "item-1");
    }

    #[test]
    fn complete_runtime_request_item_record_updates_response_payload() {
        let mut store = MemoryRuntimeStore {
            threads: vec![thread_record()],
            ..Default::default()
        };
        store.items_by_thread.insert(
            "thread-1".to_string(),
            vec![item_record(RuntimeItemPayloadRecord::RequestUserInput {
                request_id: "item-1".to_string(),
                action_type: "elicitation".to_string(),
                prompt: Some("选择执行方式".to_string()),
                requested_schema: Some(serde_json::json!({ "type": "object" })),
                response: None,
            })],
        );

        let item = block_on(complete_runtime_request_item_record(
            &store,
            "item-1",
            Some(serde_json::json!({ "mode": "auto" })),
        ))
        .expect("complete request item")
        .expect("item");

        assert_eq!(item.status, RuntimeItemStatusRecord::Completed);
        assert!(item.completed_at.is_some());
        match item.payload {
            RuntimeItemPayloadRecord::RequestUserInput { response, .. } => {
                assert_eq!(response, Some(serde_json::json!({ "mode": "auto" })));
            }
            other => panic!("unexpected payload: {other:?}"),
        }
    }

    #[test]
    fn next_runtime_item_sequence_for_thread_should_use_current_store_items() {
        let mut store = MemoryRuntimeStore {
            threads: vec![thread_record()],
            ..Default::default()
        };
        let mut item = item_record(RuntimeItemPayloadRecord::AgentMessage {
            text: "old".to_string(),
        });
        item.sequence = 12;
        store
            .items_by_thread
            .insert("thread-1".to_string(), vec![item]);

        let next_sequence = block_on(next_runtime_item_sequence_for_thread(&store, "thread-1"))
            .expect("next sequence");

        assert_eq!(next_sequence, 13);
    }

    #[test]
    fn delete_runtime_transcript_items_should_use_current_payload_filter() {
        let mut store = MemoryRuntimeStore {
            threads: vec![thread_record()],
            ..Default::default()
        };
        store.items_by_thread.insert(
            "thread-1".to_string(),
            vec![item_record(RuntimeItemPayloadRecord::InternalTranscript {
                role: "assistant".to_string(),
                content_json: serde_json::json!([{ "type": "text", "text": "reply" }]),
                metadata_json: serde_json::json!({ "userVisible": true }),
                created_timestamp: 42,
            })],
        );

        block_on(delete_runtime_transcript_items(&store, "session-1")).expect("delete transcript");

        assert_eq!(
            store
                .deleted_item_ids
                .lock()
                .expect("deleted ids")
                .as_slice(),
            ["item-1"]
        );
    }

    #[test]
    fn resolve_runtime_turn_scope_uses_session_and_generated_turn_fallbacks() {
        let scope = resolve_runtime_turn_scope(
            "session-1",
            RuntimeTurnScopeInput {
                thread_id: Some("   ".to_string()),
                turn_id: Some(String::new()),
            },
        );

        assert_eq!(scope.thread_id, "session-1");
        assert!(!scope.turn_id.trim().is_empty());
    }

    #[test]
    fn ensure_runtime_turn_record_creates_missing_thread_and_turn() {
        let store = MemoryRuntimeStore::default();

        let turn = block_on(ensure_runtime_turn_record(
            &store,
            RuntimeTurnEnsureInput {
                session_id: "session-1".to_string(),
                working_dir: PathBuf::from("/tmp/workspace"),
                scope: RuntimeTurnScopeInput {
                    thread_id: Some("thread-1".to_string()),
                    turn_id: Some("turn-1".to_string()),
                },
                input_text: Some("hello".to_string()),
                context_override: None,
                output_schema_runtime: None,
            },
        ))
        .expect("ensure turn");

        assert_eq!(turn.id, "turn-1");
        assert_eq!(turn.thread_id, "thread-1");
        assert_eq!(turn.input_text.as_deref(), Some("hello"));
        assert_eq!(
            store
                .upserted_threads
                .lock()
                .expect("upserted threads")
                .len(),
            1
        );
        assert_eq!(store.created_turns.lock().expect("created turns").len(), 1);
    }

    #[test]
    fn ensure_runtime_turn_record_reuses_existing_turn() {
        let mut store = MemoryRuntimeStore {
            threads: vec![thread_record()],
            ..Default::default()
        };
        store
            .turns_by_thread
            .insert("thread-1".to_string(), vec![turn_record()]);

        let turn = block_on(ensure_runtime_turn_record(
            &store,
            RuntimeTurnEnsureInput {
                session_id: "session-1".to_string(),
                working_dir: PathBuf::from("/tmp/workspace"),
                scope: RuntimeTurnScopeInput {
                    thread_id: Some("thread-1".to_string()),
                    turn_id: Some("turn-1".to_string()),
                },
                input_text: None,
                context_override: None,
                output_schema_runtime: None,
            },
        ))
        .expect("ensure turn");

        assert_eq!(turn.id, "turn-1");
        assert!(store
            .created_turns
            .lock()
            .expect("created turns")
            .is_empty());
    }

    #[test]
    fn complete_runtime_turn_record_updates_existing_turn() {
        let mut store = MemoryRuntimeStore::default();
        store
            .turns_by_thread
            .insert("thread-1".to_string(), vec![turn_record()]);

        let turn = block_on(complete_runtime_turn_record(
            &store,
            "turn-1",
            RuntimeTurnStatusRecord::Failed,
            Some("boom".to_string()),
        ))
        .expect("complete turn")
        .expect("existing turn");

        assert_eq!(turn.status, RuntimeTurnStatusRecord::Failed);
        assert_eq!(turn.error_message.as_deref(), Some("boom"));
        assert!(turn.completed_at.is_some());
    }
}
