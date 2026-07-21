use super::goal::ThreadGoalStoreError;
use super::goal_accounting::{
    account_goal_turn_usage, bind_goal_turn, mark_goal_update_delivered,
    mark_thread_goal_updates_delivered_through, pending_goal_updates_for_thread,
    AccountGoalTurnUsage, BindGoalTurn, GoalTerminalStatus, GoalTurnMode,
};
use super::*;
use crate::runtime::thread_goal::GoalAccountingMode;
use crate::runtime::thread_usage::thread_token_usage_snapshot_from_events;
use crate::runtime::{RuntimeCoreError, RuntimeCoreEventAppender};
use agent_protocol::{ItemStatus, ThreadItemPayload};
use app_server_protocol::protocol::v2::ThreadGoalUpdatedNotification;

#[derive(Debug)]
pub(crate) struct PendingGoalUpdate {
    pub(crate) outbox_id: i64,
    pub(crate) notification: ThreadGoalUpdatedNotification,
}

impl ProjectionStore {
    pub(super) fn apply_goal_accounting_events_sync(
        &self,
        stored: &StoredSession,
        events: &[AgentEvent],
    ) -> Result<(), ThreadGoalStoreError> {
        if !events.iter().any(|event| {
            event.event_type == "turn.accepted" || event_can_produce_goal_update(event)
        }) {
            return Ok(());
        }

        let mut conn = self.open_thread_store().map_err(store_error)?;
        let thread_id = stored.session.thread_id.as_str();
        let mut cumulative_usage = thread_token_usage_snapshot_from_events(&stored.events)
            .map(|snapshot| snapshot.total_token_usage)
            .unwrap_or_default();

        for event in events {
            if let Some(snapshot) =
                thread_token_usage_snapshot_from_events(std::slice::from_ref(event))
            {
                cumulative_usage = snapshot.total_token_usage;
            }
            let Some(turn_id) = event_turn_id(event) else {
                continue;
            };
            match event.event_type.as_str() {
                "turn.accepted" => {
                    if bound_goal_id(&conn, thread_id, turn_id)?.is_some() {
                        continue;
                    }
                    let Some(goal_id) = active_goal_id(&conn, thread_id)? else {
                        continue;
                    };
                    let Some(started_at_ms) = event_timestamp_millis(event) else {
                        continue;
                    };
                    bind_goal_turn(
                        &mut conn,
                        BindGoalTurn {
                            thread_id,
                            turn_id,
                            expected_goal_id: &goal_id,
                            turn_mode: turn_mode(stored, event),
                            source_sequence: event.sequence,
                            token_usage_at_start: &cumulative_usage,
                            started_at_ms,
                        },
                    )?;
                }
                _ if event_can_produce_goal_update(event) => {
                    let Some(goal_id) = bound_goal_id(&conn, thread_id, turn_id)? else {
                        continue;
                    };
                    let Some(observed_at_ms) = event_timestamp_millis(event) else {
                        continue;
                    };
                    let terminal = event.event_type != "item.completed";
                    account_goal_turn_usage(
                        &mut conn,
                        AccountGoalTurnUsage {
                            thread_id,
                            turn_id,
                            expected_goal_id: &goal_id,
                            source_sequence: event.sequence,
                            token_usage: &cumulative_usage,
                            observed_at_ms,
                            status_scope: GoalAccountingMode::ActiveOnly,
                            terminal,
                            terminal_status: terminal
                                .then(|| terminal_goal_status(event))
                                .flatten(),
                        },
                    )?;
                }
                _ => {}
            }
        }
        Ok(())
    }

    fn pending_goal_updates_for_event_sync(
        &self,
        thread_id: &str,
        turn_id: &str,
        source_sequence: u64,
    ) -> Result<Vec<PendingGoalUpdate>, ThreadGoalStoreError> {
        let source_sequence = i64::try_from(source_sequence).map_err(|_| {
            ThreadGoalStoreError::InvalidRequest(
                "goal update source sequence exceeds SQLite range".to_string(),
            )
        })?;
        let conn = self.open_thread_store().map_err(store_error)?;
        let through_outbox_id = conn
            .query_row(
                r#"SELECT outbox_id
               FROM thread_goal_update_outbox
               WHERE thread_id = ?1 AND turn_id = ?2 AND source_sequence = ?3"#,
                params![thread_id, turn_id, source_sequence],
                |row| row.get::<_, i64>(0),
            )
            .optional()
            .map_err(store_error)?;
        pending_goal_updates_for_thread(&conn, thread_id, through_outbox_id).map(|updates| {
            updates
                .into_iter()
                .map(|update| PendingGoalUpdate {
                    outbox_id: update.outbox_id,
                    notification: update.notification,
                })
                .collect()
        })
    }

    fn mark_goal_update_delivered_sync(
        &self,
        outbox_id: i64,
    ) -> Result<bool, ThreadGoalStoreError> {
        let conn = self.open_thread_store().map_err(store_error)?;
        mark_goal_update_delivered(&conn, outbox_id, chrono::Utc::now().timestamp_millis())
    }

    fn mark_goal_snapshot_delivered_sync(
        &self,
        thread_id: &str,
        through_outbox_id: i64,
    ) -> Result<usize, ThreadGoalStoreError> {
        let conn = self.open_thread_store().map_err(store_error)?;
        mark_thread_goal_updates_delivered_through(
            &conn,
            thread_id,
            through_outbox_id,
            chrono::Utc::now().timestamp_millis(),
        )
    }

    fn latest_goal_update_outbox_id_sync(
        &self,
        thread_id: &str,
    ) -> Result<Option<i64>, ThreadGoalStoreError> {
        let conn = self.open_thread_store().map_err(store_error)?;
        conn.query_row(
            "SELECT MAX(outbox_id) FROM thread_goal_update_outbox WHERE thread_id = ?1",
            params![thread_id],
            |row| row.get(0),
        )
        .map_err(store_error)
    }
}

impl RuntimeCoreEventAppender {
    pub(crate) fn pending_thread_goal_updates_for_event(
        &self,
        event: &AgentEvent,
    ) -> Result<Vec<PendingGoalUpdate>, RuntimeCoreError> {
        if !event_can_produce_goal_update(event) {
            return Ok(Vec::new());
        }
        let thread_id = event
            .thread_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                RuntimeCoreError::Backend(
                    "goal update lookup requires a canonical thread id".to_string(),
                )
            })?;
        let turn_id = event_turn_id(event).ok_or_else(|| {
            RuntimeCoreError::Backend("goal update lookup requires a canonical turn id".to_string())
        })?;
        let store = self.projection_store.as_deref().ok_or_else(|| {
            RuntimeCoreError::Backend("thread goal store is unavailable".to_string())
        })?;
        store
            .pending_goal_updates_for_event_sync(thread_id, turn_id, event.sequence)
            .map_err(map_goal_error)
    }

    pub(crate) fn mark_thread_goal_update_delivered(
        &self,
        outbox_id: i64,
    ) -> Result<bool, RuntimeCoreError> {
        let store = self.projection_store.as_deref().ok_or_else(|| {
            RuntimeCoreError::Backend("thread goal store is unavailable".to_string())
        })?;
        store
            .mark_goal_update_delivered_sync(outbox_id)
            .map_err(map_goal_error)
    }

    pub(crate) fn latest_thread_goal_update_outbox_id(
        &self,
        thread_id: &str,
    ) -> Result<Option<i64>, RuntimeCoreError> {
        let store = self.projection_store.as_deref().ok_or_else(|| {
            RuntimeCoreError::Backend("thread goal store is unavailable".to_string())
        })?;
        store
            .latest_goal_update_outbox_id_sync(thread_id)
            .map_err(map_goal_error)
    }

    pub(crate) fn mark_thread_goal_snapshot_delivered(
        &self,
        thread_id: &str,
        through_outbox_id: i64,
    ) -> Result<usize, RuntimeCoreError> {
        let store = self.projection_store.as_deref().ok_or_else(|| {
            RuntimeCoreError::Backend("thread goal store is unavailable".to_string())
        })?;
        store
            .mark_goal_snapshot_delivered_sync(thread_id, through_outbox_id)
            .map_err(map_goal_error)
    }
}

fn active_goal_id(
    conn: &Connection,
    thread_id: &str,
) -> Result<Option<String>, ThreadGoalStoreError> {
    conn.query_row(
        r#"SELECT goal_id FROM thread_goals
           WHERE thread_id = ?1 AND status IN ('active', 'budget_limited')"#,
        params![thread_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(store_error)
}

fn bound_goal_id(
    conn: &Connection,
    thread_id: &str,
    turn_id: &str,
) -> Result<Option<String>, ThreadGoalStoreError> {
    conn.query_row(
        r#"SELECT goal_id FROM thread_goal_turn_accounting
           WHERE thread_id = ?1 AND turn_id = ?2"#,
        params![thread_id, turn_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(store_error)
}

fn turn_mode(stored: &StoredSession, event: &AgentEvent) -> GoalTurnMode {
    if let Some(mode) = event
        .payload
        .get("goalAccountingMode")
        .and_then(serde_json::Value::as_str)
    {
        return if mode == "plan" {
            GoalTurnMode::Plan
        } else {
            GoalTurnMode::Default
        };
    }
    if super::super::thread_goal::turn_uses_plan_mode(
        event
            .turn_id
            .as_deref()
            .and_then(|turn_id| stored.turn_runtime_options.get(turn_id)),
    ) {
        GoalTurnMode::Plan
    } else {
        GoalTurnMode::Default
    }
}

fn event_turn_id(event: &AgentEvent) -> Option<&str> {
    event
        .turn_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn event_timestamp_millis(event: &AgentEvent) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(&event.timestamp)
        .ok()
        .map(|timestamp| timestamp.timestamp_millis())
        .filter(|timestamp| *timestamp >= 0)
}

fn event_can_produce_goal_update(event: &AgentEvent) -> bool {
    matches!(
        event.event_type.as_str(),
        "turn.completed" | "turn.failed" | "turn.canceled"
    ) || tool_finish_counts_for_goal_progress(event)
}

fn tool_finish_counts_for_goal_progress(event: &AgentEvent) -> bool {
    if event.event_type != "item.completed" {
        return false;
    }
    let Ok(item) = serde_json::from_value::<ThreadItem>(
        event.payload.get("item").cloned().unwrap_or_default(),
    ) else {
        return false;
    };
    let is_tool = matches!(
        item.payload,
        ThreadItemPayload::Tool { .. }
            | ThreadItemPayload::McpToolCall { .. }
            | ThreadItemPayload::CollabAgentToolCall { .. }
            | ThreadItemPayload::Command { .. }
    );
    let handler_executed = item
        .metadata
        .get(tool_runtime::tool_result_projection::TOOL_HANDLER_EXECUTED_METADATA_KEY)
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    let aborted = item
        .metadata
        .get(tool_runtime::tool_result_projection::TOOL_OUTCOME_METADATA_KEY)
        .and_then(serde_json::Value::as_str)
        == Some(tool_runtime::tool_result_projection::TOOL_OUTCOME_ABORTED);

    is_tool
        && !aborted
        && (item.status == ItemStatus::Completed
            || (item.status == ItemStatus::Failed && handler_executed))
}

fn terminal_goal_status(event: &AgentEvent) -> Option<GoalTerminalStatus> {
    if event.event_type != "turn.failed" {
        return None;
    }
    if event
        .payload
        .get("reason")
        .and_then(serde_json::Value::as_str)
        == Some("usage_limit_exceeded")
    {
        Some(GoalTerminalStatus::UsageLimited)
    } else {
        Some(GoalTerminalStatus::Blocked)
    }
}

fn store_error(error: impl std::fmt::Display) -> ThreadGoalStoreError {
    ThreadGoalStoreError::Store(error.to_string())
}

fn map_goal_error(error: ThreadGoalStoreError) -> RuntimeCoreError {
    match error {
        ThreadGoalStoreError::InvalidRequest(message) => RuntimeCoreError::InvalidRequest(message),
        ThreadGoalStoreError::Store(message) => RuntimeCoreError::Backend(message),
    }
}
