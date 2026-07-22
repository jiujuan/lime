//! Process-local idle wall-clock accounting for canonical ThreadGoals.
//!
//! The durable goal row owns accumulated usage. This module owns only the live baseline and the
//! permit that keeps snapshot -> durable write -> baseline advancement atomic. Baselines are
//! intentionally not restored from wall time after a process restart.

use super::goal::{project_goal, read_goal, ThreadGoalStoreError};
use super::goal_accounting::{
    bind_goal_turn_in_tx, BindGoalTurn, GoalTurnBindOutcome, GoalTurnMode,
};
use super::goal_fork::{
    consume_thread_goal_continuation_deferral_in_tx, has_thread_goal_continuation_deferral,
};
use super::*;
use crate::runtime::thread_usage::TokenUsageSnapshot;
use app_server_protocol::protocol::v2::ThreadGoalUpdatedNotification;
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

#[derive(Debug, Default)]
pub(in crate::runtime) struct GoalAccountingState {
    idle: Mutex<HashMap<String, IdleGoalClock>>,
}

#[derive(Debug)]
struct IdleGoalClock {
    goal_id: String,
    last_accounted_at: Instant,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct IdleGoalProgressSnapshot {
    pub(super) expected_goal_id: String,
    pub(super) time_delta_seconds: i64,
}

pub(super) struct IdleGoalAccountingPermit<'a> {
    idle: MutexGuard<'a, HashMap<String, IdleGoalClock>>,
    thread_id: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum IdleGoalTurnAdmissionOutcome {
    Prepared { goal_matched: bool },
    Replayed,
}

pub(super) struct PrepareGoalTurnAdmission<'a> {
    pub(super) thread_id: &'a str,
    pub(super) turn_id: &'a str,
    pub(super) turn_mode: GoalTurnMode,
    pub(super) source_sequence: u64,
    pub(super) token_usage_at_start: &'a TokenUsageSnapshot,
    pub(super) started_at_ms: i64,
}

impl GoalAccountingState {
    pub(super) fn idle_permit(&self, thread_id: &str) -> IdleGoalAccountingPermit<'_> {
        IdleGoalAccountingPermit {
            idle: self.idle.lock().unwrap_or_else(PoisonError::into_inner),
            thread_id: thread_id.to_string(),
        }
    }
}

impl IdleGoalAccountingPermit<'_> {
    pub(super) fn snapshot(&self) -> Option<IdleGoalProgressSnapshot> {
        self.snapshot_before(Duration::ZERO)
    }

    pub(super) fn snapshot_at(&self, observed_at_ms: i64) -> Option<IdleGoalProgressSnapshot> {
        let event_age_ms = chrono::Utc::now()
            .timestamp_millis()
            .saturating_sub(observed_at_ms)
            .max(0);
        self.snapshot_before(Duration::from_millis(
            u64::try_from(event_age_ms).unwrap_or(u64::MAX),
        ))
    }

    fn snapshot_before(&self, event_age: Duration) -> Option<IdleGoalProgressSnapshot> {
        let clock = self.idle.get(&self.thread_id)?;
        let elapsed = clock.last_accounted_at.elapsed().saturating_sub(event_age);
        Some(IdleGoalProgressSnapshot {
            expected_goal_id: clock.goal_id.clone(),
            time_delta_seconds: i64::try_from(elapsed.as_secs()).unwrap_or(i64::MAX),
        })
    }

    pub(super) fn mark_accounted(&mut self, snapshot: &IdleGoalProgressSnapshot) {
        let Some(clock) = self.idle.get_mut(&self.thread_id) else {
            return;
        };
        if clock.goal_id != snapshot.expected_goal_id || snapshot.time_delta_seconds <= 0 {
            return;
        }
        let advance =
            Duration::from_secs(u64::try_from(snapshot.time_delta_seconds).unwrap_or(u64::MAX));
        clock.last_accounted_at = clock
            .last_accounted_at
            .checked_add(advance)
            .unwrap_or_else(Instant::now);
    }

    pub(super) fn mark_active(&mut self, goal_id: &str) {
        if self
            .idle
            .get(&self.thread_id)
            .is_some_and(|clock| clock.goal_id == goal_id)
        {
            return;
        }
        self.reset_active(goal_id);
    }

    pub(super) fn reset_active(&mut self, goal_id: &str) {
        self.idle.insert(
            self.thread_id.clone(),
            IdleGoalClock {
                goal_id: goal_id.to_string(),
                last_accounted_at: Instant::now(),
            },
        );
    }

    pub(super) fn clear(&mut self) {
        self.idle.remove(&self.thread_id);
    }

    #[cfg(test)]
    fn backdate(&mut self, elapsed: Duration) {
        if let Some(clock) = self.idle.get_mut(&self.thread_id) {
            clock.last_accounted_at = Instant::now()
                .checked_sub(elapsed)
                .unwrap_or_else(Instant::now);
        }
    }

    #[cfg(test)]
    fn is_active(&self) -> bool {
        self.idle.contains_key(&self.thread_id)
    }
}

pub(super) fn flush_idle_goal_usage_in_tx(
    conn: &Connection,
    thread_id: &str,
    snapshot: &IdleGoalProgressSnapshot,
    observed_at_ms: i64,
) -> Result<bool, ThreadGoalStoreError> {
    if observed_at_ms < 0 {
        return Err(invalid_request(
            "goal idle accounting time must not be negative",
        ));
    }
    let Some(goal) = read_goal(conn, thread_id)? else {
        return Ok(false);
    };
    if goal.goal_id != snapshot.expected_goal_id || goal.status != "active" {
        return Ok(false);
    }
    if snapshot.time_delta_seconds <= 0 {
        return Ok(true);
    }
    let updated = conn
        .execute(
            r#"UPDATE thread_goals
               SET time_used_seconds = time_used_seconds + ?1,
                   updated_at_ms = MAX(updated_at_ms, ?2)
               WHERE thread_id = ?3 AND goal_id = ?4 AND status = 'active'"#,
            params![
                snapshot.time_delta_seconds,
                observed_at_ms,
                thread_id,
                snapshot.expected_goal_id,
            ],
        )
        .map_err(store_error)?;
    if updated != 1 {
        return Err(store_error(format!(
            "exact idle goal accounting update affected {updated} rows"
        )));
    }
    Ok(true)
}

pub(super) fn prepare_goal_turn_admission(
    conn: &mut Connection,
    input: PrepareGoalTurnAdmission<'_>,
    snapshot: Option<&IdleGoalProgressSnapshot>,
) -> Result<IdleGoalTurnAdmissionOutcome, ThreadGoalStoreError> {
    let source_sequence = i64::try_from(input.source_sequence)
        .map_err(|_| invalid_request("source sequence exceeds SQLite range"))?;
    let thread_id = required_identity(input.thread_id, "thread id")?;
    let turn_id = required_identity(input.turn_id, "turn id")?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(store_error)?;
    let existing_goal_id = tx
        .query_row(
            r#"SELECT goal_id FROM thread_goal_turn_accounting
               WHERE thread_id = ?1 AND turn_id = ?2"#,
            params![thread_id, turn_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(store_error)?;
    if existing_goal_id.is_some() {
        tx.commit().map_err(store_error)?;
        return Ok(IdleGoalTurnAdmissionOutcome::Replayed);
    }
    consume_thread_goal_continuation_deferral_in_tx(&tx, thread_id)?;

    let goal_matched = if input.turn_mode == GoalTurnMode::Plan {
        false
    } else if let Some(snapshot) = snapshot {
        flush_idle_goal_usage_in_tx(&tx, thread_id, snapshot, input.started_at_ms)?
    } else {
        false
    };
    if goal_matched && snapshot.is_some_and(|snapshot| snapshot.time_delta_seconds > 0) {
        let snapshot = snapshot.expect("positive idle delta requires an idle snapshot");
        let goal = read_goal(&tx, thread_id)?
            .ok_or_else(|| store_error("idle-accounted goal disappeared"))?;
        let notification = ThreadGoalUpdatedNotification {
            thread_id: thread_id.to_string(),
            turn_id: Some(turn_id.to_string()),
            goal: project_goal(goal)?,
        };
        let notification_json = serde_json::to_string(&notification).map_err(store_error)?;
        tx.execute(
            r#"INSERT INTO thread_goal_update_outbox (
                   thread_id, turn_id, goal_id, source_sequence,
                   notification_json, created_at_ms
               ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#,
            params![
                thread_id,
                turn_id,
                snapshot.expected_goal_id,
                source_sequence,
                notification_json,
                input.started_at_ms,
            ],
        )
        .map_err(store_error)?;
    }
    let goal_id = tx
        .query_row(
            r#"SELECT goal_id FROM thread_goals
               WHERE thread_id = ?1 AND status IN ('active', 'budget_limited')"#,
            params![thread_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(store_error)?;
    if let Some(goal_id) = goal_id {
        let outcome = bind_goal_turn_in_tx(
            &tx,
            BindGoalTurn {
                thread_id,
                turn_id,
                expected_goal_id: &goal_id,
                turn_mode: input.turn_mode,
                source_sequence: input.source_sequence,
                token_usage_at_start: input.token_usage_at_start,
                started_at_ms: input.started_at_ms,
            },
        )?;
        if outcome != GoalTurnBindOutcome::Bound {
            return Err(store_error("new goal turn admission was not bound"));
        }
    }
    tx.commit().map_err(store_error)?;
    Ok(IdleGoalTurnAdmissionOutcome::Prepared { goal_matched })
}

pub(super) fn idle_active_goal_id(
    conn: &Connection,
    thread_id: &str,
) -> Result<Option<String>, ThreadGoalStoreError> {
    conn.query_row(
        "SELECT goal_id FROM thread_goals WHERE thread_id = ?1 AND status = 'active'",
        params![thread_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(store_error)
}

impl ProjectionStore {
    pub(crate) fn restore_thread_goal_accounting_sync(
        &self,
        thread_id: &str,
        thread_is_idle: bool,
    ) -> Result<(), ThreadGoalStoreError> {
        let mut permit = self.goal_accounting.idle_permit(thread_id);
        if !thread_is_idle {
            permit.clear();
            return Ok(());
        }
        let conn = self.open_thread_store().map_err(store_error)?;
        if has_thread_goal_continuation_deferral(&conn, thread_id)? {
            permit.clear();
            return Ok(());
        }
        match read_goal(&conn, thread_id)? {
            Some(goal) if goal.status == "active" => permit.mark_active(&goal.goal_id),
            Some(_) | None => permit.clear(),
        }
        Ok(())
    }

    #[cfg(test)]
    pub(super) fn backdate_thread_goal_idle_for_test(&self, thread_id: &str, seconds: u64) {
        self.goal_accounting
            .idle_permit(thread_id)
            .backdate(Duration::from_secs(seconds));
    }

    #[cfg(test)]
    pub(super) fn thread_goal_idle_is_active_for_test(&self, thread_id: &str) -> bool {
        self.goal_accounting.idle_permit(thread_id).is_active()
    }
}

fn required_identity<'a>(value: &'a str, field: &str) -> Result<&'a str, ThreadGoalStoreError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(invalid_request(format!("{field} must not be empty")));
    }
    Ok(value)
}

fn invalid_request(message: impl Into<String>) -> ThreadGoalStoreError {
    ThreadGoalStoreError::InvalidRequest(message.into())
}

fn store_error(source: impl std::fmt::Display) -> ThreadGoalStoreError {
    ThreadGoalStoreError::Store(source.to_string())
}
