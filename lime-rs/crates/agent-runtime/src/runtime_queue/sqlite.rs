use super::{RuntimeQueueResult, RuntimeQueueStore, RuntimeQueuedTurn};
use futures::future::{ready, BoxFuture, FutureExt};
use rusqlite::{params, Connection, OptionalExtension};
use std::sync::{Arc, Mutex, MutexGuard};

pub type SharedSqliteConnection = Arc<Mutex<Connection>>;

/// Queued Turn 的 current SQLite repository。
///
/// Execution gate 仍是进程内并发协调状态；等待执行的 Turn 本身持久化到 SQLite，
/// App Server 重启后可由 queue resumption 主链重新获取。
#[derive(Clone)]
pub struct SqliteRuntimeQueueStore {
    db: SharedSqliteConnection,
}

impl SqliteRuntimeQueueStore {
    pub fn new(db: SharedSqliteConnection) -> RuntimeQueueResult<Self> {
        let store = Self { db };
        store.initialize_schema()?;
        Ok(store)
    }

    fn initialize_schema(&self) -> RuntimeQueueResult<()> {
        self.connection()?
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS runtime_queued_turns (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    record_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_runtime_queued_turns_session_created
                    ON runtime_queued_turns(session_id, created_at, id);",
            )
            .map_err(sqlite_error)?;
        Ok(())
    }

    fn connection(&self) -> RuntimeQueueResult<MutexGuard<'_, Connection>> {
        self.db
            .lock()
            .map_err(|error| format!("runtime queue SQLite 锁已污染: {error}"))
    }
}

impl RuntimeQueueStore for SqliteRuntimeQueueStore {
    fn enqueue_turn(
        &self,
        queued_turn: RuntimeQueuedTurn,
    ) -> BoxFuture<'_, RuntimeQueueResult<RuntimeQueuedTurn>> {
        let result = (|| {
            let record_json = encode_turn(&queued_turn)?;
            self.connection()?
                .execute(
                    "INSERT INTO runtime_queued_turns (id, session_id, created_at, record_json)
                     VALUES (?1, ?2, ?3, ?4)
                     ON CONFLICT(id) DO UPDATE SET
                        session_id = excluded.session_id,
                        created_at = excluded.created_at,
                        record_json = excluded.record_json",
                    params![
                        queued_turn.queued_turn_id,
                        queued_turn.session_id,
                        queued_turn.created_at,
                        record_json,
                    ],
                )
                .map_err(sqlite_error)?;
            Ok(queued_turn)
        })();
        ready(result).boxed()
    }

    fn list_queued_turns<'a>(
        &'a self,
        session_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Vec<RuntimeQueuedTurn>>> {
        let result = (|| {
            let connection = self.connection()?;
            let mut statement = connection
                .prepare(
                    "SELECT record_json FROM runtime_queued_turns
                     WHERE session_id = ?1
                     ORDER BY created_at ASC, id ASC",
                )
                .map_err(sqlite_error)?;
            let rows = statement
                .query_map([session_id], |row| row.get::<_, String>(0))
                .map_err(sqlite_error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(sqlite_error)?;
            decode_turns(rows)
        })();
        ready(result).boxed()
    }

    fn list_queued_turn_session_ids(&self) -> BoxFuture<'_, RuntimeQueueResult<Vec<String>>> {
        let result = (|| {
            let connection = self.connection()?;
            let mut statement = connection
                .prepare(
                    "SELECT DISTINCT session_id FROM runtime_queued_turns
                     ORDER BY session_id ASC",
                )
                .map_err(sqlite_error)?;
            let session_ids = statement
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(sqlite_error)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(sqlite_error)?;
            Ok(session_ids)
        })();
        ready(result).boxed()
    }

    fn remove_queued_turn<'a>(
        &'a self,
        queued_turn_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Option<RuntimeQueuedTurn>>> {
        let result = (|| {
            let mut connection = self.connection()?;
            let transaction = connection.transaction().map_err(sqlite_error)?;
            let record = transaction
                .query_row(
                    "SELECT record_json FROM runtime_queued_turns WHERE id = ?1",
                    [queued_turn_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(sqlite_error)?;
            transaction
                .execute(
                    "DELETE FROM runtime_queued_turns WHERE id = ?1",
                    [queued_turn_id],
                )
                .map_err(sqlite_error)?;
            transaction.commit().map_err(sqlite_error)?;
            decode_optional_turn(record)
        })();
        ready(result).boxed()
    }

    fn take_next_queued_turn<'a>(
        &'a self,
        session_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Option<RuntimeQueuedTurn>>> {
        let result = (|| {
            let mut connection = self.connection()?;
            let transaction = connection.transaction().map_err(sqlite_error)?;
            let row = transaction
                .query_row(
                    "SELECT id, record_json FROM runtime_queued_turns
                     WHERE session_id = ?1
                     ORDER BY created_at ASC, id ASC
                     LIMIT 1",
                    [session_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .optional()
                .map_err(sqlite_error)?;
            if let Some((queued_turn_id, _)) = row.as_ref() {
                transaction
                    .execute(
                        "DELETE FROM runtime_queued_turns WHERE id = ?1",
                        [queued_turn_id],
                    )
                    .map_err(sqlite_error)?;
            }
            transaction.commit().map_err(sqlite_error)?;
            row.map(|(_, record)| decode_turn(record)).transpose()
        })();
        ready(result).boxed()
    }

    fn clear_queued_turns<'a>(
        &'a self,
        session_id: &'a str,
    ) -> BoxFuture<'a, RuntimeQueueResult<Vec<RuntimeQueuedTurn>>> {
        let result = (|| {
            let mut connection = self.connection()?;
            let transaction = connection.transaction().map_err(sqlite_error)?;
            let rows = {
                let mut statement = transaction
                    .prepare(
                        "SELECT record_json FROM runtime_queued_turns
                         WHERE session_id = ?1
                         ORDER BY created_at ASC, id ASC",
                    )
                    .map_err(sqlite_error)?;
                let records = statement
                    .query_map([session_id], |row| row.get::<_, String>(0))
                    .map_err(sqlite_error)?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(sqlite_error)?;
                records
            };
            transaction
                .execute(
                    "DELETE FROM runtime_queued_turns WHERE session_id = ?1",
                    [session_id],
                )
                .map_err(sqlite_error)?;
            transaction.commit().map_err(sqlite_error)?;
            decode_turns(rows)
        })();
        ready(result).boxed()
    }
}

fn encode_turn(queued_turn: &RuntimeQueuedTurn) -> RuntimeQueueResult<String> {
    serde_json::to_string(queued_turn)
        .map_err(|error| format!("序列化 queued runtime turn 失败: {error}"))
}

fn decode_turns(rows: Vec<String>) -> RuntimeQueueResult<Vec<RuntimeQueuedTurn>> {
    rows.into_iter().map(decode_turn).collect()
}

fn decode_optional_turn(record: Option<String>) -> RuntimeQueueResult<Option<RuntimeQueuedTurn>> {
    record.map(decode_turn).transpose()
}

fn decode_turn(record: String) -> RuntimeQueueResult<RuntimeQueuedTurn> {
    serde_json::from_str(&record)
        .map_err(|error| format!("反序列化 queued runtime turn 失败: {error}"))
}

fn sqlite_error(error: rusqlite::Error) -> String {
    format!("runtime queue SQLite 操作失败: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime_queue::RuntimeQueueStore;
    use serde_json::json;
    use std::collections::HashMap;

    fn queued_turn(id: &str, created_at: i64) -> RuntimeQueuedTurn {
        RuntimeQueuedTurn {
            queued_turn_id: id.to_string(),
            session_id: "session-1".to_string(),
            message_preview: format!("preview-{id}"),
            message_text: format!("message-{id}"),
            created_at,
            image_count: 1,
            payload: json!({"queuedTurnId": id}),
            metadata: HashMap::from([("event_name".to_string(), json!("agent_stream"))]),
        }
    }

    #[test]
    fn queued_turns_survive_repository_recreation_and_keep_fifo_order() {
        futures::executor::block_on(async {
            let path = std::env::temp_dir().join(format!(
                "lime-runtime-queue-{}.sqlite",
                uuid::Uuid::new_v4()
            ));
            {
                let db = Arc::new(Mutex::new(Connection::open(&path).expect("open sqlite")));
                let first = SqliteRuntimeQueueStore::new(db).expect("initialize queue store");
                first
                    .enqueue_turn(queued_turn("queued-2", 2))
                    .await
                    .expect("enqueue second");
                first
                    .enqueue_turn(queued_turn("queued-1", 1))
                    .await
                    .expect("enqueue first");
            }

            let db = Arc::new(Mutex::new(Connection::open(&path).expect("reopen sqlite")));
            let reopened = SqliteRuntimeQueueStore::new(db).expect("reopen queue store");
            let listed = reopened
                .list_queued_turns("session-1")
                .await
                .expect("list queue");
            assert_eq!(
                listed
                    .iter()
                    .map(|turn| turn.queued_turn_id.as_str())
                    .collect::<Vec<_>>(),
                vec!["queued-1", "queued-2"]
            );

            let next = reopened
                .take_next_queued_turn("session-1")
                .await
                .expect("take next")
                .expect("queued turn");
            assert_eq!(next.queued_turn_id, "queued-1");
            drop(reopened);
            std::fs::remove_file(path).expect("remove queue sqlite");
        });
    }
}
