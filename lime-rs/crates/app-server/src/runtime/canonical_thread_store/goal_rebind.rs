use super::goal::ThreadGoalStoreError;
use super::goal_accounting::{flush_goal_turn_usage_in_tx, AccountGoalTurnUsage};
use crate::runtime::thread_goal::GoalAccountingMode;
use crate::runtime::thread_usage::TokenUsageSnapshot;
use rusqlite::{params, Connection, OptionalExtension};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ActiveTurnGoalBinding {
    pub(crate) turn_id: String,
    pub(crate) plan_mode: bool,
    pub(crate) source_sequence: u64,
    pub(crate) token_usage: TokenUsageSnapshot,
    pub(crate) observed_at_ms: i64,
}

pub(super) fn flush_bound_goal_before_mutation(
    conn: &Connection,
    thread_id: &str,
    binding: &ActiveTurnGoalBinding,
) -> Result<(), ThreadGoalStoreError> {
    let (turn_id, _) = validate_binding(binding)?;
    let goal_id = conn
        .query_row(
            r#"SELECT goal_id FROM thread_goal_turn_accounting
               WHERE thread_id = ?1 AND turn_id = ?2"#,
            params![thread_id, turn_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(store_error)?;
    let Some(goal_id) = goal_id else {
        return Ok(());
    };
    flush_goal_turn_usage_in_tx(
        conn,
        AccountGoalTurnUsage {
            thread_id,
            turn_id: &binding.turn_id,
            expected_goal_id: &goal_id,
            source_sequence: binding.source_sequence,
            token_usage: &binding.token_usage,
            observed_at_ms: binding.observed_at_ms,
            status_scope: GoalAccountingMode::ActiveOnly,
            terminal: false,
            terminal_status: None,
        },
    )
}

pub(super) fn bind_or_reset_active_goal(
    conn: &Connection,
    thread_id: &str,
    goal_id: &str,
    binding: &ActiveTurnGoalBinding,
) -> Result<bool, ThreadGoalStoreError> {
    let (turn_id, source_sequence) = validate_binding(binding)?;

    let active_goal_exists = conn
        .query_row(
            r#"SELECT EXISTS(
                   SELECT 1 FROM thread_goals
                   WHERE thread_id = ?1 AND goal_id = ?2 AND status = 'active'
               )"#,
            params![thread_id, goal_id],
            |row| row.get::<_, bool>(0),
        )
        .map_err(store_error)?;
    if !active_goal_exists {
        return Ok(false);
    }
    if let Some((last_source_sequence, terminal_sequence)) = conn
        .query_row(
            r#"SELECT last_source_sequence, terminal_sequence
               FROM thread_goal_turn_accounting
               WHERE thread_id = ?1 AND turn_id = ?2"#,
            params![thread_id, turn_id],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<i64>>(1)?)),
        )
        .optional()
        .map_err(store_error)?
    {
        if terminal_sequence.is_some() {
            return Err(invalid_request(format!(
                "cannot rebind terminal goal turn {turn_id}"
            )));
        }
        if source_sequence < last_source_sequence {
            return Err(invalid_request(format!(
                "goal rebind source sequence {source_sequence} is before {last_source_sequence}"
            )));
        }
    }

    let changed = conn
        .execute(
            r#"INSERT INTO thread_goal_turn_accounting (
                   thread_id, turn_id, goal_id, turn_mode, started_at_ms,
                   last_accounted_time_seconds, last_input_tokens, last_cached_input_tokens,
                   last_output_tokens, last_reasoning_output_tokens, last_total_tokens,
                   last_source_sequence, terminal_sequence
               ) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8, ?9, ?10, ?11, NULL)
               ON CONFLICT(thread_id, turn_id) DO UPDATE SET
                   goal_id = excluded.goal_id,
                   turn_mode = excluded.turn_mode,
                   started_at_ms = excluded.started_at_ms,
                   last_accounted_time_seconds = 0,
                   last_input_tokens = excluded.last_input_tokens,
                   last_cached_input_tokens = excluded.last_cached_input_tokens,
                   last_output_tokens = excluded.last_output_tokens,
                   last_reasoning_output_tokens = excluded.last_reasoning_output_tokens,
                   last_total_tokens = excluded.last_total_tokens,
                   last_source_sequence = excluded.last_source_sequence,
                   terminal_sequence = NULL"#,
            params![
                thread_id,
                turn_id,
                goal_id,
                if binding.plan_mode { "plan" } else { "default" },
                binding.observed_at_ms,
                binding.token_usage.input_tokens,
                binding.token_usage.cached_input_tokens,
                binding.token_usage.output_tokens,
                binding.token_usage.reasoning_output_tokens,
                binding.token_usage.total_tokens,
                source_sequence,
            ],
        )
        .map_err(store_error)?;
    Ok(changed == 1)
}

fn validate_binding(binding: &ActiveTurnGoalBinding) -> Result<(&str, i64), ThreadGoalStoreError> {
    let turn_id = binding.turn_id.trim();
    if turn_id.is_empty() {
        return Err(invalid_request("goal rebind requires a turn id"));
    }
    if binding.observed_at_ms < 0 {
        return Err(invalid_request(
            "goal rebind observation time must not be negative",
        ));
    }
    let source_sequence = i64::try_from(binding.source_sequence)
        .map_err(|_| invalid_request("goal rebind source sequence exceeds SQLite range"))?;
    validate_usage(&binding.token_usage)?;
    Ok((turn_id, source_sequence))
}

pub(super) fn remove_turn_goal_binding(
    conn: &Connection,
    thread_id: &str,
    turn_id: &str,
) -> Result<(), ThreadGoalStoreError> {
    conn.execute(
        r#"DELETE FROM thread_goal_turn_accounting
           WHERE thread_id = ?1 AND turn_id = ?2"#,
        params![thread_id, turn_id],
    )
    .map_err(store_error)?;
    Ok(())
}

fn validate_usage(usage: &TokenUsageSnapshot) -> Result<(), ThreadGoalStoreError> {
    if [
        usage.input_tokens,
        usage.cached_input_tokens,
        usage.output_tokens,
        usage.reasoning_output_tokens,
        usage.total_tokens,
    ]
    .into_iter()
    .any(|value| value < 0)
    {
        return Err(invalid_request(
            "goal rebind token usage must not be negative",
        ));
    }
    Ok(())
}

fn invalid_request(message: impl Into<String>) -> ThreadGoalStoreError {
    ThreadGoalStoreError::InvalidRequest(message.into())
}

fn store_error(error: impl std::fmt::Display) -> ThreadGoalStoreError {
    ThreadGoalStoreError::Store(error.to_string())
}
