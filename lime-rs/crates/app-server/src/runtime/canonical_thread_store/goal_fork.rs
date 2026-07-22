use super::goal::{read_goal, write_goal, ThreadGoalStoreError};
use super::goal_idle::flush_idle_goal_usage_in_tx;
use super::*;

impl ProjectionStore {
    pub(in crate::runtime) fn inherit_thread_goal_for_fork_sync(
        &self,
        source_thread_id: &str,
        target_thread_id: &str,
    ) -> Result<bool, ThreadGoalStoreError> {
        let mut idle_permit = self.goal_accounting.idle_permit(source_thread_id);
        let idle_snapshot = idle_permit.snapshot();
        let mut conn = self.open_thread_store().map_err(store_error)?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(store_error)?;
        let idle_goal_matched = idle_snapshot
            .as_ref()
            .map(|snapshot| {
                flush_idle_goal_usage_in_tx(
                    &tx,
                    source_thread_id,
                    snapshot,
                    chrono::Utc::now().timestamp_millis(),
                )
            })
            .transpose()?;
        let Some(mut goal) = read_goal(&tx, source_thread_id)? else {
            tx.commit().map_err(store_error)?;
            idle_permit.clear();
            drop(idle_permit);
            self.goal_accounting.idle_permit(target_thread_id).clear();
            return Ok(false);
        };
        goal.thread_id = target_thread_id.to_string();
        write_goal(&tx, &goal)?;
        tx.execute(
            "INSERT INTO thread_goal_continuation_deferrals (thread_id)
             VALUES (?1)
             ON CONFLICT(thread_id) DO NOTHING",
            params![target_thread_id],
        )
        .map_err(store_error)?;
        tx.commit().map_err(store_error)?;

        match (idle_snapshot.as_ref(), idle_goal_matched) {
            (Some(snapshot), Some(true)) => idle_permit.mark_accounted(snapshot),
            (_, Some(false)) => idle_permit.clear(),
            _ => {}
        }
        drop(idle_permit);
        self.goal_accounting.idle_permit(target_thread_id).clear();
        Ok(true)
    }

    pub(in crate::runtime) fn has_thread_goal_continuation_deferral_sync(
        &self,
        thread_id: &str,
    ) -> Result<bool, ThreadGoalStoreError> {
        let conn = self.open_thread_store().map_err(store_error)?;
        has_thread_goal_continuation_deferral(&conn, thread_id)
    }
}

pub(super) fn has_thread_goal_continuation_deferral(
    conn: &Connection,
    thread_id: &str,
) -> Result<bool, ThreadGoalStoreError> {
    conn.query_row(
        "SELECT EXISTS(
             SELECT 1 FROM thread_goal_continuation_deferrals WHERE thread_id = ?1
         )",
        params![thread_id],
        |row| row.get(0),
    )
    .map_err(store_error)
}

pub(super) fn consume_thread_goal_continuation_deferral_in_tx(
    conn: &Connection,
    thread_id: &str,
) -> Result<bool, ThreadGoalStoreError> {
    conn.execute(
        "DELETE FROM thread_goal_continuation_deferrals WHERE thread_id = ?1",
        params![thread_id],
    )
    .map(|changed| changed > 0)
    .map_err(store_error)
}

fn store_error(source: impl std::fmt::Display) -> ThreadGoalStoreError {
    ThreadGoalStoreError::Store(source.to_string())
}
