use std::path::Path;

use agent_protocol::ThreadId;
use rusqlite::{params, OptionalExtension, Transaction, TransactionBehavior};

use super::{clear_session_in_tx, ProjectionStore};

pub(in crate::runtime) mod subtree;

pub(in crate::runtime) use subtree::ThreadDeleteSubtreeSnapshot;
use subtree::{
    required_thread_id, snapshot_session_ids, snapshot_thread_delete_subtree_in_conn,
    validate_snapshot,
};

impl ProjectionStore {
    pub(in crate::runtime) fn snapshot_thread_delete_subtree(
        &self,
        root_thread_id: &ThreadId,
    ) -> Result<ThreadDeleteSubtreeSnapshot, String> {
        let root_thread_id = required_thread_id(root_thread_id)?;
        let conn = self
            .open_thread_store()
            .map_err(|error| error.to_string())?;
        snapshot_thread_delete_subtree_in_conn(&conn, root_thread_id)
    }

    pub(in crate::runtime) fn delete_thread_subtree_data(
        &self,
        snapshot: &ThreadDeleteSubtreeSnapshot,
    ) -> Result<(), String> {
        validate_snapshot(snapshot)?;
        let mut conn = self
            .open_thread_store()
            .map_err(|error| error.to_string())?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|error| format!("failed to begin thread delete transaction: {error}"))?;
        let current =
            snapshot_thread_delete_subtree_in_conn(&tx, snapshot.root_thread_id.as_str())?;
        if &current != snapshot {
            return Err(format!(
                "thread delete subtree changed after snapshot: {}",
                snapshot.root_thread_id
            ));
        }

        let history_schema = history_schema(self);
        let projection_schema = projection_schema(self);
        for thread_id in &snapshot.thread_ids_deepest_first {
            delete_thread_rows(&tx, "thread_goal_update_outbox", thread_id.as_str())?;
            delete_thread_rows(&tx, "thread_goal_turn_accounting", thread_id.as_str())?;
            delete_thread_rows(&tx, "thread_goals", thread_id.as_str())?;
            delete_thread_rows(
                &tx,
                &format!("{history_schema}canonical_items"),
                thread_id.as_str(),
            )?;
            delete_thread_rows(
                &tx,
                &format!("{history_schema}canonical_turns"),
                thread_id.as_str(),
            )?;
            delete_thread_rows(
                &tx,
                &format!("{history_schema}canonical_history_applies"),
                thread_id.as_str(),
            )?;
        }
        for session_id in snapshot_session_ids(snapshot) {
            clear_projected_session_in_tx(&tx, projection_schema, session_id)?;
        }
        for thread_id in &snapshot.thread_ids_deepest_first {
            tx.execute(
                "DELETE FROM canonical_thread_spawn_edges
                 WHERE parent_thread_id = ?1 OR child_thread_id = ?1",
                params![thread_id.as_str()],
            )
            .map_err(|error| format!("failed to delete thread spawn edges: {error}"))?;
        }
        if attached_table_exists(&tx, projection_schema, "agent_identities")? {
            for thread_id in &snapshot.thread_ids_deepest_first {
                tx.execute(
                    &format!(
                        "DELETE FROM {projection_schema}agent_identities WHERE thread_id = ?1"
                    ),
                    params![thread_id.as_str()],
                )
                .map_err(|error| format!("failed to delete agent identity: {error}"))?;
            }
            tx.execute(
                &format!(
                    "DELETE FROM {projection_schema}agent_identities WHERE root_thread_id = ?1"
                ),
                params![snapshot.root_thread_id.as_str()],
            )
            .map_err(|error| format!("failed to delete rooted agent identities: {error}"))?;
        }
        if attached_table_exists(&tx, projection_schema, "agent_mailbox_messages")? {
            for thread_id in &snapshot.thread_ids_deepest_first {
                tx.execute(
                    &format!(
                        "DELETE FROM {projection_schema}agent_mailbox_messages
                         WHERE root_thread_id = ?1
                            OR sender_thread_id = ?1
                            OR recipient_thread_id = ?1"
                    ),
                    params![thread_id.as_str()],
                )
                .map_err(|error| format!("failed to delete agent mailbox messages: {error}"))?;
            }
        }
        for thread in &snapshot.persisted {
            let changed = tx
                .execute(
                    "DELETE FROM canonical_threads
                     WHERE thread_id = ?1 AND session_id = ?2",
                    params![thread.thread_id.as_str(), thread.session_id],
                )
                .map_err(|error| format!("failed to delete canonical thread: {error}"))?;
            if changed != 1 {
                return Err(format!(
                    "canonical thread changed during delete: {}",
                    thread.thread_id
                ));
            }
        }
        tx.commit()
            .map_err(|error| format!("failed to commit thread delete transaction: {error}"))?;

        for thread_id in &snapshot.thread_ids_deepest_first {
            self.restore_thread_goal_accounting_sync(thread_id.as_str(), false)
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    pub(in crate::runtime) fn delete_session_data(&self, session_id: &str) -> Result<bool, String> {
        self.ensure_canonical_thread_store()?;
        let mut conn = self
            .open_thread_store()
            .map_err(|error| error.to_string())?;
        let thread = conn
            .query_row(
                "SELECT thread_id, rollout_path, archived
                 FROM canonical_threads WHERE session_id = ?1",
                params![session_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, bool>(2)?,
                    ))
                },
            )
            .optional()
            .map_err(|error| format!("无法定位 canonical thread: {error}"))?;

        if let (Some(store), Some((thread_id, rollout_path, archived))) =
            (self.rollout_store.as_ref(), thread.as_ref())
        {
            let rollout_path = rollout_path.as_deref().ok_or_else(|| {
                format!("thread {thread_id} has no rollout_path; migration is required")
            })?;
            store.delete(Path::new(rollout_path), session_id, thread_id, *archived)?;
        }

        let tx = conn
            .transaction()
            .map_err(|error| format!("无法开始 Projection DB 事务: {error}"))?;
        if let Some((thread_id, _, _)) = thread.as_ref() {
            for table in [
                "thread_goal_update_outbox",
                "thread_goal_turn_accounting",
                "thread_goals",
            ] {
                tx.execute(
                    &format!("DELETE FROM {table} WHERE thread_id = ?1"),
                    params![thread_id],
                )
                .map_err(|error| format!("无法清理 {table}: {error}"))?;
            }
            tx.execute(
                "DELETE FROM canonical_thread_spawn_edges
                 WHERE parent_thread_id = ?1 OR child_thread_id = ?1",
                params![thread_id],
            )
            .map_err(|error| format!("无法清理 canonical_thread_spawn_edges: {error}"))?;
            for table in [
                "canonical_items",
                "canonical_turns",
                "canonical_history_applies",
            ] {
                tx.execute(
                    &format!("DELETE FROM {table} WHERE thread_id = ?1"),
                    params![thread_id],
                )
                .map_err(|error| format!("无法清理 {table}: {error}"))?;
            }
            let projection_schema = if self.path == self.state_path {
                ""
            } else if self.path == self.thread_history_path {
                "thread_history."
            } else {
                "projection."
            };
            if attached_table_exists(&tx, projection_schema, "agent_identities")? {
                tx.execute(
                    &format!(
                        "DELETE FROM {projection_schema}agent_identities
                         WHERE thread_id = ?1 OR root_thread_id = ?1"
                    ),
                    params![thread_id],
                )
                .map_err(|error| format!("无法清理 agent_identities: {error}"))?;
            }
            if attached_table_exists(&tx, projection_schema, "agent_mailbox_messages")? {
                tx.execute(
                    &format!(
                        "DELETE FROM {projection_schema}agent_mailbox_messages
                         WHERE root_thread_id = ?1
                            OR sender_thread_id = ?1
                            OR recipient_thread_id = ?1"
                    ),
                    params![thread_id],
                )
                .map_err(|error| format!("无法清理 agent_mailbox_messages: {error}"))?;
            }
        }
        let deleted_canonical = tx
            .execute(
                "DELETE FROM canonical_threads WHERE session_id = ?1",
                params![session_id],
            )
            .map_err(|error| format!("无法清理 canonical_threads: {error}"))?
            > 0;
        clear_session_in_tx(&tx, session_id)?;
        tx.commit()
            .map_err(|error| format!("无法提交 Projection DB 事务: {error}"))?;
        Ok(deleted_canonical)
    }
}

fn history_schema(store: &ProjectionStore) -> &'static str {
    if store.state_path == store.thread_history_path {
        ""
    } else {
        "thread_history."
    }
}

fn projection_schema(store: &ProjectionStore) -> &'static str {
    if store.path == store.state_path {
        ""
    } else if store.path == store.thread_history_path {
        "thread_history."
    } else {
        "projection."
    }
}

fn delete_thread_rows(tx: &Transaction<'_>, table: &str, thread_id: &str) -> Result<(), String> {
    tx.execute(
        &format!("DELETE FROM {table} WHERE thread_id = ?1"),
        params![thread_id],
    )
    .map_err(|error| format!("failed to delete {table} rows: {error}"))?;
    Ok(())
}

fn clear_projected_session_in_tx(
    tx: &Transaction<'_>,
    schema: &str,
    session_id: &str,
) -> Result<(), String> {
    for table in [
        "projected_items",
        "projected_turns",
        "projection_watermarks",
        "projected_sessions",
    ] {
        tx.execute(
            &format!("DELETE FROM {schema}{table} WHERE session_id = ?1"),
            params![session_id],
        )
        .map_err(|error| format!("failed to delete {table} rows: {error}"))?;
    }
    Ok(())
}

fn attached_table_exists(
    conn: &rusqlite::Connection,
    schema: &str,
    table: &str,
) -> Result<bool, String> {
    conn.query_row(
        &format!(
            "SELECT EXISTS(
                SELECT 1 FROM {schema}sqlite_master WHERE type = 'table' AND name = ?1
             )"
        ),
        params![table],
        |row| row.get(0),
    )
    .map_err(|error| format!("无法检查 {table}: {error}"))
}

#[cfg(test)]
mod tests;
