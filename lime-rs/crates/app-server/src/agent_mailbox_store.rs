use agent_protocol::ThreadId;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use thread_store::{
    AgentMailboxDeliveryMode, AgentMailboxDeliveryStatus, AgentMailboxMessage,
    AgentMailboxMessageKind, AgentMailboxResultStatus, AgentMailboxStore, AgentMailboxStoreFuture,
    AppendAgentMailboxMessageParams, PendingAgentMailboxTriggerRecipient, ThreadStoreError,
    ThreadStoreResult,
};

use crate::ProjectionStore;

const STATUS_PENDING: &str = "pending";
const STATUS_DELIVERED: &str = "delivered";

impl ProjectionStore {
    fn open_agent_mailbox_store(&self) -> ThreadStoreResult<Connection> {
        let conn = Connection::open(self.path()).map_err(store_error)?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS agent_mailbox_messages (
                message_id TEXT PRIMARY KEY,
                root_thread_id TEXT NOT NULL,
                sender_thread_id TEXT NOT NULL,
                recipient_thread_id TEXT NOT NULL,
                content TEXT NOT NULL,
                kind TEXT NOT NULL CHECK (kind IN ('message', 'result')),
                source_turn_id TEXT,
                result_status TEXT CHECK (result_status IN ('completed', 'failed')),
                delivery_mode TEXT NOT NULL CHECK (delivery_mode IN ('queue_only', 'trigger_turn')),
                delivery_status TEXT NOT NULL CHECK (delivery_status IN ('pending', 'delivered')),
                created_at_ms INTEGER NOT NULL,
                delivered_at_ms INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_agent_mailbox_pending_recipient
                ON agent_mailbox_messages (
                    root_thread_id,
                    recipient_thread_id,
                    delivery_status,
                    created_at_ms,
                    message_id
                );
            "#,
        )
        .map_err(store_error)?;
        ensure_agent_mailbox_column(&conn, "kind", "TEXT NOT NULL DEFAULT 'message'")?;
        ensure_agent_mailbox_column(&conn, "source_turn_id", "TEXT")?;
        ensure_agent_mailbox_column(&conn, "result_status", "TEXT")?;
        Ok(conn)
    }

    pub(crate) fn append_agent_mailbox_message_sync(
        &self,
        params: AppendAgentMailboxMessageParams,
    ) -> ThreadStoreResult<AgentMailboxMessage> {
        let message = params.message;
        validate_new_message(&message)?;
        let mut conn = self.open_agent_mailbox_store()?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(store_error)?;
        if let Some(existing) = read_message_by_id(&tx, &message.message_id)? {
            if same_immutable_message(&existing, &message) {
                return Ok(existing);
            }
            return Err(error(format!(
                "agent mailbox message id {} conflicts with its existing record",
                message.message_id
            )));
        }
        tx.execute(
            "INSERT INTO agent_mailbox_messages (
                message_id, root_thread_id, sender_thread_id, recipient_thread_id, content,
                kind, source_turn_id, result_status, delivery_mode, delivery_status,
                created_at_ms, delivered_at_ms
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL)",
            params![
                message.message_id,
                message.root_thread_id.as_str(),
                message.sender_thread_id.as_str(),
                message.recipient_thread_id.as_str(),
                message.content,
                message_kind_str(message.kind),
                message.source_turn_id.as_ref().map(|value| value.as_str()),
                message.result_status.map(result_status_str),
                delivery_mode_str(message.delivery_mode),
                STATUS_PENDING,
                message.created_at_ms,
            ],
        )
        .map_err(store_error)?;
        tx.commit().map_err(store_error)?;
        Ok(message)
    }

    fn list_pending_agent_mailbox_messages_sync(
        &self,
        root_thread_id: ThreadId,
        recipient_thread_id: ThreadId,
    ) -> ThreadStoreResult<Vec<AgentMailboxMessage>> {
        validate_thread_id(&root_thread_id, "root thread")?;
        validate_thread_id(&recipient_thread_id, "recipient thread")?;
        let conn = self.open_agent_mailbox_store()?;
        let mut statement = conn
            .prepare(
                "SELECT message_id, root_thread_id, sender_thread_id, recipient_thread_id, content,
                    kind, source_turn_id, result_status, delivery_mode, delivery_status,
                    created_at_ms, delivered_at_ms
                 FROM agent_mailbox_messages
                 WHERE root_thread_id = ?1 AND recipient_thread_id = ?2
                    AND delivery_status = ?3
                 ORDER BY created_at_ms ASC, message_id ASC",
            )
            .map_err(store_error)?;
        let rows = statement
            .query_map(
                params![
                    root_thread_id.as_str(),
                    recipient_thread_id.as_str(),
                    STATUS_PENDING
                ],
                row_to_message,
            )
            .map_err(store_error)?;
        rows.map(|row| row.map_err(store_error)).collect()
    }

    fn list_pending_agent_mailbox_trigger_recipients_sync(
        &self,
    ) -> ThreadStoreResult<Vec<PendingAgentMailboxTriggerRecipient>> {
        let conn = self.open_agent_mailbox_store()?;
        let mut statement = conn
            .prepare(
                "SELECT DISTINCT root_thread_id, recipient_thread_id
                 FROM agent_mailbox_messages
                 WHERE delivery_status = ?1 AND delivery_mode = ?2
                 ORDER BY root_thread_id ASC, recipient_thread_id ASC",
            )
            .map_err(store_error)?;
        let rows = statement
            .query_map(
                params![
                    STATUS_PENDING,
                    delivery_mode_str(AgentMailboxDeliveryMode::TriggerTurn)
                ],
                |row| {
                    Ok(PendingAgentMailboxTriggerRecipient {
                        root_thread_id: ThreadId::new(row.get::<_, String>(0)?),
                        recipient_thread_id: ThreadId::new(row.get::<_, String>(1)?),
                    })
                },
            )
            .map_err(store_error)?;
        rows.map(|row| row.map_err(store_error)).collect()
    }

    fn mark_agent_mailbox_message_delivered_sync(
        &self,
        root_thread_id: ThreadId,
        recipient_thread_id: ThreadId,
        message_id: String,
        delivered_at_ms: i64,
    ) -> ThreadStoreResult<Option<AgentMailboxMessage>> {
        validate_thread_id(&root_thread_id, "root thread")?;
        validate_thread_id(&recipient_thread_id, "recipient thread")?;
        validate_non_empty(&message_id, "message id")?;
        let mut conn = self.open_agent_mailbox_store()?;
        let tx = conn.transaction().map_err(store_error)?;
        let Some(existing) = read_message_by_id(&tx, &message_id)? else {
            return Ok(None);
        };
        if existing.root_thread_id != root_thread_id
            || existing.recipient_thread_id != recipient_thread_id
        {
            return Err(error(
                "agent mailbox delivery target does not own the message",
            ));
        }
        if existing.delivery_status == AgentMailboxDeliveryStatus::Delivered {
            return Ok(None);
        }
        let changed = tx
            .execute(
                "UPDATE agent_mailbox_messages
             SET delivery_status = ?2, delivered_at_ms = ?3
             WHERE message_id = ?1 AND delivery_status = ?4",
                params![
                    message_id,
                    STATUS_DELIVERED,
                    delivered_at_ms,
                    STATUS_PENDING
                ],
            )
            .map_err(store_error)?;
        if changed != 1 {
            return Ok(None);
        }
        tx.commit().map_err(store_error)?;
        Ok(Some(AgentMailboxMessage {
            delivery_status: AgentMailboxDeliveryStatus::Delivered,
            delivered_at_ms: Some(delivered_at_ms),
            ..existing
        }))
    }

    fn delete_agent_mailbox_messages_sync(
        &self,
        root_thread_id: ThreadId,
        recipient_thread_id: ThreadId,
    ) -> ThreadStoreResult<()> {
        validate_thread_id(&root_thread_id, "root thread")?;
        validate_thread_id(&recipient_thread_id, "recipient thread")?;
        let conn = self.open_agent_mailbox_store()?;
        conn.execute(
            "DELETE FROM agent_mailbox_messages
             WHERE root_thread_id = ?1 AND recipient_thread_id = ?2",
            params![root_thread_id.as_str(), recipient_thread_id.as_str()],
        )
        .map_err(store_error)?;
        Ok(())
    }
}

impl AgentMailboxStore for ProjectionStore {
    fn append_agent_mailbox_message(
        &self,
        params: AppendAgentMailboxMessageParams,
    ) -> AgentMailboxStoreFuture<'_, AgentMailboxMessage> {
        let store = self.clone();
        Box::pin(async move { store.append_agent_mailbox_message_sync(params) })
    }

    fn list_pending_agent_mailbox_messages(
        &self,
        root_thread_id: ThreadId,
        recipient_thread_id: ThreadId,
    ) -> AgentMailboxStoreFuture<'_, Vec<AgentMailboxMessage>> {
        let store = self.clone();
        Box::pin(async move {
            store.list_pending_agent_mailbox_messages_sync(root_thread_id, recipient_thread_id)
        })
    }

    fn list_pending_agent_mailbox_trigger_recipients(
        &self,
    ) -> AgentMailboxStoreFuture<'_, Vec<PendingAgentMailboxTriggerRecipient>> {
        let store = self.clone();
        Box::pin(async move { store.list_pending_agent_mailbox_trigger_recipients_sync() })
    }

    fn mark_agent_mailbox_message_delivered(
        &self,
        root_thread_id: ThreadId,
        recipient_thread_id: ThreadId,
        message_id: String,
        delivered_at_ms: i64,
    ) -> AgentMailboxStoreFuture<'_, Option<AgentMailboxMessage>> {
        let store = self.clone();
        Box::pin(async move {
            store.mark_agent_mailbox_message_delivered_sync(
                root_thread_id,
                recipient_thread_id,
                message_id,
                delivered_at_ms,
            )
        })
    }

    fn delete_agent_mailbox_messages(
        &self,
        root_thread_id: ThreadId,
        recipient_thread_id: ThreadId,
    ) -> AgentMailboxStoreFuture<'_, ()> {
        let store = self.clone();
        Box::pin(async move {
            store.delete_agent_mailbox_messages_sync(root_thread_id, recipient_thread_id)
        })
    }
}

fn read_message_by_id(
    conn: &Connection,
    message_id: &str,
) -> ThreadStoreResult<Option<AgentMailboxMessage>> {
    conn.query_row(
        "SELECT message_id, root_thread_id, sender_thread_id, recipient_thread_id, content,
            kind, source_turn_id, result_status, delivery_mode, delivery_status,
            created_at_ms, delivered_at_ms
         FROM agent_mailbox_messages WHERE message_id = ?1",
        params![message_id],
        row_to_message,
    )
    .optional()
    .map_err(store_error)
}

fn row_to_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentMailboxMessage> {
    let kind = parse_message_kind(row.get::<_, String>(5)?).map_err(to_sql_error)?;
    let source_turn_id = row
        .get::<_, Option<String>>(6)?
        .map(agent_protocol::TurnId::new);
    let result_status = row
        .get::<_, Option<String>>(7)?
        .map(parse_result_status)
        .transpose()
        .map_err(to_sql_error)?;
    let delivery_mode = parse_delivery_mode(row.get::<_, String>(8)?).map_err(to_sql_error)?;
    let delivery_status = parse_delivery_status(row.get::<_, String>(9)?).map_err(to_sql_error)?;
    Ok(AgentMailboxMessage {
        message_id: row.get(0)?,
        root_thread_id: ThreadId::new(row.get::<_, String>(1)?),
        sender_thread_id: ThreadId::new(row.get::<_, String>(2)?),
        recipient_thread_id: ThreadId::new(row.get::<_, String>(3)?),
        content: row.get(4)?,
        kind,
        source_turn_id,
        result_status,
        delivery_mode,
        delivery_status,
        created_at_ms: row.get(10)?,
        delivered_at_ms: row.get(11)?,
    })
}

fn validate_new_message(message: &AgentMailboxMessage) -> ThreadStoreResult<()> {
    validate_non_empty(&message.message_id, "message id")?;
    validate_non_empty(&message.content, "message content")?;
    validate_thread_id(&message.root_thread_id, "root thread")?;
    validate_thread_id(&message.sender_thread_id, "sender thread")?;
    validate_thread_id(&message.recipient_thread_id, "recipient thread")?;
    if message.delivery_status != AgentMailboxDeliveryStatus::Pending
        || message.delivered_at_ms.is_some()
    {
        return Err(error(
            "new agent mailbox message must be pending without a delivery timestamp",
        ));
    }
    match (
        message.kind,
        message.source_turn_id.as_ref(),
        message.result_status,
        message.delivery_mode,
    ) {
        (AgentMailboxMessageKind::Message, None, None, _) => {}
        (
            AgentMailboxMessageKind::Result,
            Some(source_turn_id),
            Some(_),
            AgentMailboxDeliveryMode::QueueOnly,
        ) if !source_turn_id.as_str().trim().is_empty() => {}
        (AgentMailboxMessageKind::Result, ..) => {
            return Err(error(
                "agent result mailbox message requires source turn, result status, and queue-only delivery",
            ));
        }
        (AgentMailboxMessageKind::Message, ..) => {
            return Err(error(
                "ordinary agent mailbox message cannot carry result metadata",
            ));
        }
    }
    Ok(())
}

fn validate_thread_id(thread_id: &ThreadId, field: &str) -> ThreadStoreResult<()> {
    validate_non_empty(thread_id.as_str(), field)
}

fn validate_non_empty(value: &str, field: &str) -> ThreadStoreResult<()> {
    if value.trim().is_empty() {
        return Err(error(format!("agent mailbox {field} must not be empty")));
    }
    Ok(())
}

fn same_immutable_message(existing: &AgentMailboxMessage, candidate: &AgentMailboxMessage) -> bool {
    existing.message_id == candidate.message_id
        && existing.root_thread_id == candidate.root_thread_id
        && existing.sender_thread_id == candidate.sender_thread_id
        && existing.recipient_thread_id == candidate.recipient_thread_id
        && existing.content == candidate.content
        && existing.kind == candidate.kind
        && existing.source_turn_id == candidate.source_turn_id
        && existing.result_status == candidate.result_status
        && existing.delivery_mode == candidate.delivery_mode
        && existing.created_at_ms == candidate.created_at_ms
}

fn message_kind_str(kind: AgentMailboxMessageKind) -> &'static str {
    match kind {
        AgentMailboxMessageKind::Message => "message",
        AgentMailboxMessageKind::Result => "result",
    }
}

fn parse_message_kind(value: String) -> ThreadStoreResult<AgentMailboxMessageKind> {
    match value.as_str() {
        "message" => Ok(AgentMailboxMessageKind::Message),
        "result" => Ok(AgentMailboxMessageKind::Result),
        _ => Err(error(format!("unknown agent mailbox message kind {value}"))),
    }
}

fn result_status_str(status: AgentMailboxResultStatus) -> &'static str {
    match status {
        AgentMailboxResultStatus::Completed => "completed",
        AgentMailboxResultStatus::Failed => "failed",
    }
}

fn parse_result_status(value: String) -> ThreadStoreResult<AgentMailboxResultStatus> {
    match value.as_str() {
        "completed" => Ok(AgentMailboxResultStatus::Completed),
        "failed" => Ok(AgentMailboxResultStatus::Failed),
        _ => Err(error(format!(
            "unknown agent mailbox result status {value}"
        ))),
    }
}

fn delivery_mode_str(mode: AgentMailboxDeliveryMode) -> &'static str {
    match mode {
        AgentMailboxDeliveryMode::QueueOnly => "queue_only",
        AgentMailboxDeliveryMode::TriggerTurn => "trigger_turn",
    }
}

fn parse_delivery_mode(value: String) -> ThreadStoreResult<AgentMailboxDeliveryMode> {
    match value.as_str() {
        "queue_only" => Ok(AgentMailboxDeliveryMode::QueueOnly),
        "trigger_turn" => Ok(AgentMailboxDeliveryMode::TriggerTurn),
        _ => Err(error(format!(
            "unknown agent mailbox delivery mode {value}"
        ))),
    }
}

fn parse_delivery_status(value: String) -> ThreadStoreResult<AgentMailboxDeliveryStatus> {
    match value.as_str() {
        STATUS_PENDING => Ok(AgentMailboxDeliveryStatus::Pending),
        STATUS_DELIVERED => Ok(AgentMailboxDeliveryStatus::Delivered),
        _ => Err(error(format!(
            "unknown agent mailbox delivery status {value}"
        ))),
    }
}

fn ensure_agent_mailbox_column(
    conn: &Connection,
    column: &str,
    definition: &str,
) -> ThreadStoreResult<()> {
    let mut statement = conn
        .prepare("PRAGMA table_info(agent_mailbox_messages)")
        .map_err(store_error)?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(store_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(store_error)?;
    if columns.iter().any(|existing| existing == column) {
        return Ok(());
    }
    conn.execute(
        &format!("ALTER TABLE agent_mailbox_messages ADD COLUMN {column} {definition}"),
        [],
    )
    .map_err(store_error)?;
    Ok(())
}

fn error(message: impl Into<String>) -> ThreadStoreError {
    ThreadStoreError::new(message)
}

fn store_error(source: impl std::fmt::Display) -> ThreadStoreError {
    error(source.to_string())
}

fn to_sql_error(error: ThreadStoreError) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
}

#[cfg(test)]
mod tests {
    use agent_protocol::{ThreadId, TurnId};
    use futures::executor::block_on;
    use rusqlite::Connection;
    use thread_store::{
        AgentMailboxDeliveryMode, AgentMailboxDeliveryStatus, AgentMailboxMessage,
        AgentMailboxMessageKind, AgentMailboxResultStatus, AgentMailboxStore,
        AppendAgentMailboxMessageParams,
    };

    use crate::ProjectionStore;

    fn message(
        id: &str,
        root: &str,
        sender: &str,
        recipient: &str,
        created_at_ms: i64,
        delivery_mode: AgentMailboxDeliveryMode,
    ) -> AgentMailboxMessage {
        AgentMailboxMessage {
            message_id: id.to_string(),
            root_thread_id: ThreadId::new(root),
            sender_thread_id: ThreadId::new(sender),
            recipient_thread_id: ThreadId::new(recipient),
            content: format!("message-{id}"),
            kind: AgentMailboxMessageKind::Message,
            source_turn_id: None,
            result_status: None,
            delivery_mode,
            delivery_status: AgentMailboxDeliveryStatus::Pending,
            created_at_ms,
            delivered_at_ms: None,
        }
    }

    fn result_message(id: &str, status: AgentMailboxResultStatus) -> AgentMailboxMessage {
        AgentMailboxMessage {
            message_id: id.to_string(),
            root_thread_id: ThreadId::new("root"),
            sender_thread_id: ThreadId::new("child"),
            recipient_thread_id: ThreadId::new("root"),
            content: format!("result-{id}"),
            kind: AgentMailboxMessageKind::Result,
            source_turn_id: Some(TurnId::new("child-turn")),
            result_status: Some(status),
            delivery_mode: AgentMailboxDeliveryMode::QueueOnly,
            delivery_status: AgentMailboxDeliveryStatus::Pending,
            created_at_ms: 7,
            delivered_at_ms: None,
        }
    }

    fn append(store: &ProjectionStore, message: AgentMailboxMessage) -> AgentMailboxMessage {
        block_on(store.append_agent_mailbox_message(AppendAgentMailboxMessageParams { message }))
            .expect("append mailbox message")
    }

    #[test]
    fn pending_mailbox_is_durable_ordered_and_recipient_isolated() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("projection.sqlite");
        let store = ProjectionStore::initialize(&path).expect("projection store");
        append(
            &store,
            message(
                "b",
                "root-a",
                "sender",
                "recipient-a",
                10,
                AgentMailboxDeliveryMode::QueueOnly,
            ),
        );
        append(
            &store,
            message(
                "a",
                "root-a",
                "sender",
                "recipient-a",
                10,
                AgentMailboxDeliveryMode::TriggerTurn,
            ),
        );
        append(
            &store,
            message(
                "other",
                "root-a",
                "sender",
                "recipient-b",
                1,
                AgentMailboxDeliveryMode::QueueOnly,
            ),
        );
        append(
            &store,
            message(
                "root-b",
                "root-b",
                "sender",
                "recipient-a",
                1,
                AgentMailboxDeliveryMode::QueueOnly,
            ),
        );
        drop(store);

        let reopened = ProjectionStore::initialize(path).expect("reopen projection store");
        let messages = block_on(reopened.list_pending_agent_mailbox_messages(
            ThreadId::new("root-a"),
            ThreadId::new("recipient-a"),
        ))
        .expect("list pending");
        assert_eq!(
            messages
                .into_iter()
                .map(|message| message.message_id)
                .collect::<Vec<_>>(),
            vec!["a", "b"]
        );
    }

    #[test]
    fn append_is_idempotent_but_id_collisions_fail_closed() {
        let temp = tempfile::tempdir().expect("tempdir");
        let store = ProjectionStore::initialize(temp.path().join("projection.sqlite"))
            .expect("projection store");
        let original = message(
            "message-1",
            "root",
            "sender",
            "recipient",
            1,
            AgentMailboxDeliveryMode::QueueOnly,
        );
        assert_eq!(append(&store, original.clone()), original);
        assert_eq!(append(&store, original.clone()), original);

        let mut collision = original;
        collision.content = "different".to_string();
        assert!(append_result(&store, collision)
            .expect_err("content collision")
            .to_string()
            .contains("conflicts"));
    }

    #[test]
    fn delivery_preserves_audit_row_and_is_idempotent_after_reopen() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("projection.sqlite");
        let store = ProjectionStore::initialize(&path).expect("projection store");
        append(
            &store,
            message(
                "message-1",
                "root",
                "sender",
                "recipient",
                1,
                AgentMailboxDeliveryMode::QueueOnly,
            ),
        );
        let delivered = block_on(store.mark_agent_mailbox_message_delivered(
            ThreadId::new("root"),
            ThreadId::new("recipient"),
            "message-1".to_string(),
            9,
        ))
        .expect("deliver")
        .expect("message");
        assert_eq!(
            delivered.delivery_status,
            AgentMailboxDeliveryStatus::Delivered
        );
        assert_eq!(delivered.delivered_at_ms, Some(9));
        assert!(block_on(store.list_pending_agent_mailbox_messages(
            ThreadId::new("root"),
            ThreadId::new("recipient"),
        ))
        .expect("pending after delivery")
        .is_empty());
        drop(store);

        let reopened = ProjectionStore::initialize(path).expect("reopen projection store");
        let repeated = block_on(reopened.mark_agent_mailbox_message_delivered(
            ThreadId::new("root"),
            ThreadId::new("recipient"),
            "message-1".to_string(),
            99,
        ))
        .expect("repeat delivery");
        assert!(repeated.is_none());
        let delivered_at_ms = Connection::open(reopened.path())
            .expect("open projection database")
            .query_row(
                "SELECT delivered_at_ms FROM agent_mailbox_messages WHERE message_id = ?1",
                ["message-1"],
                |row| row.get::<_, Option<i64>>(0),
            )
            .expect("delivered audit timestamp");
        assert_eq!(delivered_at_ms, Some(9));
    }

    #[test]
    fn delivery_rejects_the_wrong_root_or_recipient() {
        let temp = tempfile::tempdir().expect("tempdir");
        let store = ProjectionStore::initialize(temp.path().join("projection.sqlite"))
            .expect("projection store");
        append(
            &store,
            message(
                "message-1",
                "root",
                "sender",
                "recipient",
                1,
                AgentMailboxDeliveryMode::QueueOnly,
            ),
        );
        let error = block_on(store.mark_agent_mailbox_message_delivered(
            ThreadId::new("other-root"),
            ThreadId::new("recipient"),
            "message-1".to_string(),
            2,
        ))
        .expect_err("wrong root");
        assert!(error.to_string().contains("does not own"));
    }

    #[test]
    fn result_metadata_is_durable_and_part_of_idempotency() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("projection.sqlite");
        let store = ProjectionStore::initialize(&path).expect("projection store");
        let result = result_message("result-1", AgentMailboxResultStatus::Completed);
        assert_eq!(append(&store, result.clone()), result);
        drop(store);

        let reopened = ProjectionStore::initialize(path).expect("reopen projection store");
        let pending = block_on(
            reopened
                .list_pending_agent_mailbox_messages(ThreadId::new("root"), ThreadId::new("root")),
        )
        .expect("pending results");
        assert_eq!(pending, vec![result.clone()]);

        let mut conflict = result;
        conflict.result_status = Some(AgentMailboxResultStatus::Failed);
        assert!(append_result(&reopened, conflict)
            .expect_err("result status collision")
            .to_string()
            .contains("conflicts"));
    }

    #[test]
    fn result_metadata_fails_closed_without_queue_only_source_and_status() {
        let temp = tempfile::tempdir().expect("tempdir");
        let store = ProjectionStore::initialize(temp.path().join("projection.sqlite"))
            .expect("projection store");
        let mut result = result_message("result-1", AgentMailboxResultStatus::Completed);
        result.delivery_mode = AgentMailboxDeliveryMode::TriggerTurn;
        assert!(append_result(&store, result)
            .expect_err("result cannot trigger parent")
            .to_string()
            .contains("requires source turn"));

        let mut ordinary = message(
            "message-1",
            "root",
            "child",
            "root",
            1,
            AgentMailboxDeliveryMode::QueueOnly,
        );
        ordinary.source_turn_id = Some(TurnId::new("child-turn"));
        assert!(append_result(&store, ordinary)
            .expect_err("ordinary message cannot carry result metadata")
            .to_string()
            .contains("cannot carry result metadata"));
    }

    #[test]
    fn legacy_development_table_is_migrated_to_the_current_result_schema() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("projection.sqlite");
        let store = ProjectionStore::initialize(&path).expect("projection store");
        Connection::open(&path)
            .expect("open projection database")
            .execute_batch(
                r#"
                CREATE TABLE agent_mailbox_messages (
                    message_id TEXT PRIMARY KEY,
                    root_thread_id TEXT NOT NULL,
                    sender_thread_id TEXT NOT NULL,
                    recipient_thread_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    delivery_mode TEXT NOT NULL,
                    delivery_status TEXT NOT NULL,
                    created_at_ms INTEGER NOT NULL,
                    delivered_at_ms INTEGER
                );
                "#,
            )
            .expect("legacy mailbox schema");

        let current = message(
            "message-1",
            "root",
            "sender",
            "recipient",
            1,
            AgentMailboxDeliveryMode::QueueOnly,
        );
        assert_eq!(append(&store, current.clone()), current);
        assert_eq!(
            block_on(store.list_pending_agent_mailbox_messages(
                ThreadId::new("root"),
                ThreadId::new("recipient"),
            ))
            .expect("migrated message"),
            vec![current]
        );
    }

    fn append_result(
        store: &ProjectionStore,
        message: AgentMailboxMessage,
    ) -> thread_store::ThreadStoreResult<AgentMailboxMessage> {
        block_on(store.append_agent_mailbox_message(AppendAgentMailboxMessageParams { message }))
    }
}
