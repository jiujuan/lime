use super::*;
use app_server_protocol::protocol::v2::{ThreadGoal, ThreadGoalSetParams, ThreadGoalStatus};
use thiserror::Error;
use uuid::Uuid;

const MAX_OBJECTIVE_CHARS: usize = 4_000;

#[derive(Debug, Error)]
pub(crate) enum ThreadGoalStoreError {
    #[error("{0}")]
    InvalidRequest(String),
    #[error("{0}")]
    Store(String),
}

#[derive(Debug)]
struct PersistedThreadGoal {
    thread_id: String,
    goal_id: String,
    objective: String,
    status: String,
    token_budget: Option<i64>,
    tokens_used: i64,
    time_used_seconds: i64,
    created_at_ms: i64,
    updated_at_ms: i64,
}

impl ProjectionStore {
    pub(crate) fn get_thread_goal_sync(
        &self,
        thread_id: &str,
    ) -> Result<Option<ThreadGoal>, ThreadGoalStoreError> {
        let thread_id = validate_thread_id(thread_id)?;
        let conn = self
            .open_thread_store()
            .map_err(|error| ThreadGoalStoreError::Store(error.to_string()))?;
        ensure_thread_exists(&conn, thread_id)?;
        read_goal(&conn, thread_id)?.map(project_goal).transpose()
    }

    pub(crate) fn set_thread_goal_sync(
        &self,
        params: ThreadGoalSetParams,
    ) -> Result<ThreadGoal, ThreadGoalStoreError> {
        self.set_thread_goal_with_active_turn_sync(params, None)
    }

    pub(crate) fn set_thread_goal_with_active_turn_sync(
        &self,
        params: ThreadGoalSetParams,
        active_turn: Option<&super::goal_rebind::ActiveTurnGoalBinding>,
    ) -> Result<ThreadGoal, ThreadGoalStoreError> {
        let thread_id = validate_thread_id(&params.thread_id)?.to_string();
        let objective = params
            .objective
            .as_deref()
            .map(validate_objective)
            .transpose()?;
        if let Some(Some(token_budget)) = params.token_budget {
            validate_token_budget(token_budget)?;
        }

        let mut conn = self
            .open_thread_store()
            .map_err(|error| ThreadGoalStoreError::Store(error.to_string()))?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(store_error)?;
        ensure_thread_exists(&tx, &thread_id)?;
        if let Some(active_turn) = active_turn {
            super::goal_rebind::flush_bound_goal_before_mutation(&tx, &thread_id, active_turn)?;
        }
        let existing = read_goal(&tx, &thread_id)?;
        let now_ms = chrono::Utc::now().timestamp_millis();
        let goal = match existing {
            Some(existing) => {
                let token_budget = params.token_budget.unwrap_or(existing.token_budget);
                let status = patched_status(
                    &existing.status,
                    params.status,
                    existing.tokens_used,
                    token_budget,
                )?;
                PersistedThreadGoal {
                    thread_id: thread_id.clone(),
                    goal_id: existing.goal_id,
                    objective: objective.unwrap_or(existing.objective),
                    status: status_as_str(status).to_string(),
                    token_budget,
                    tokens_used: existing.tokens_used,
                    time_used_seconds: existing.time_used_seconds,
                    created_at_ms: existing.created_at_ms,
                    updated_at_ms: now_ms,
                }
            }
            None => PersistedThreadGoal {
                thread_id: thread_id.clone(),
                goal_id: Uuid::new_v4().to_string(),
                objective: objective.ok_or_else(|| {
                    ThreadGoalStoreError::InvalidRequest(
                        "creating a thread goal requires a non-empty objective".to_string(),
                    )
                })?,
                status: status_as_str(params.status.unwrap_or(ThreadGoalStatus::Active))
                    .to_string(),
                token_budget: params.token_budget.flatten(),
                tokens_used: 0,
                time_used_seconds: 0,
                created_at_ms: now_ms,
                updated_at_ms: now_ms,
            },
        };
        write_goal(&tx, &goal)?;
        if goal.status == "active" {
            if let Some(active_turn) = active_turn {
                super::goal_rebind::bind_or_reset_active_goal(
                    &tx,
                    &thread_id,
                    &goal.goal_id,
                    active_turn,
                )?;
            }
        }
        tx.commit().map_err(store_error)?;
        project_goal(goal)
    }

    #[cfg(test)]
    pub(crate) fn clear_thread_goal_sync(
        &self,
        thread_id: &str,
    ) -> Result<bool, ThreadGoalStoreError> {
        self.clear_thread_goal_with_active_turn_sync(thread_id, None)
    }

    pub(crate) fn clear_thread_goal_with_active_turn_sync(
        &self,
        thread_id: &str,
        active_turn: Option<&super::goal_rebind::ActiveTurnGoalBinding>,
    ) -> Result<bool, ThreadGoalStoreError> {
        let thread_id = validate_thread_id(thread_id)?;
        let mut conn = self
            .open_thread_store()
            .map_err(|error| ThreadGoalStoreError::Store(error.to_string()))?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(store_error)?;
        ensure_thread_exists(&tx, thread_id)?;
        if let Some(active_turn) = active_turn {
            super::goal_rebind::flush_bound_goal_before_mutation(&tx, thread_id, active_turn)?;
        }
        let cleared = tx
            .execute(
                "DELETE FROM thread_goals WHERE thread_id = ?1",
                params![thread_id],
            )
            .map_err(store_error)?
            > 0;
        if cleared {
            if let Some(active_turn) = active_turn {
                super::goal_rebind::remove_turn_goal_binding(&tx, thread_id, &active_turn.turn_id)?;
            }
        }
        tx.commit().map_err(store_error)?;
        Ok(cleared)
    }
}

fn ensure_thread_exists(conn: &Connection, thread_id: &str) -> Result<(), ThreadGoalStoreError> {
    let exists = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM canonical_threads WHERE thread_id = ?1)",
            params![thread_id],
            |row| row.get::<_, bool>(0),
        )
        .map_err(store_error)?;
    if exists {
        return Ok(());
    }
    Err(ThreadGoalStoreError::InvalidRequest(format!(
        "thread not found: {thread_id}"
    )))
}

fn read_goal(
    conn: &Connection,
    thread_id: &str,
) -> Result<Option<PersistedThreadGoal>, ThreadGoalStoreError> {
    conn.query_row(
        r#"SELECT thread_id, goal_id, objective, status, token_budget, tokens_used,
                  time_used_seconds, created_at_ms, updated_at_ms
           FROM thread_goals WHERE thread_id = ?1"#,
        params![thread_id],
        persisted_goal_from_row,
    )
    .optional()
    .map_err(store_error)
}

fn persisted_goal_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PersistedThreadGoal> {
    Ok(PersistedThreadGoal {
        thread_id: row.get(0)?,
        goal_id: row.get(1)?,
        objective: row.get(2)?,
        status: row.get(3)?,
        token_budget: row.get(4)?,
        tokens_used: row.get(5)?,
        time_used_seconds: row.get(6)?,
        created_at_ms: row.get(7)?,
        updated_at_ms: row.get(8)?,
    })
}

fn write_goal(conn: &Connection, goal: &PersistedThreadGoal) -> Result<(), ThreadGoalStoreError> {
    conn.execute(
        r#"INSERT INTO thread_goals (
             thread_id, goal_id, objective, status, token_budget, tokens_used,
             time_used_seconds, created_at_ms, updated_at_ms
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(thread_id) DO UPDATE SET
             objective = excluded.objective,
             status = excluded.status,
             token_budget = excluded.token_budget,
             tokens_used = excluded.tokens_used,
             time_used_seconds = excluded.time_used_seconds,
             updated_at_ms = excluded.updated_at_ms"#,
        params![
            goal.thread_id,
            goal.goal_id,
            goal.objective,
            goal.status,
            goal.token_budget,
            goal.tokens_used,
            goal.time_used_seconds,
            goal.created_at_ms,
            goal.updated_at_ms,
        ],
    )
    .map_err(store_error)?;
    Ok(())
}

fn project_goal(goal: PersistedThreadGoal) -> Result<ThreadGoal, ThreadGoalStoreError> {
    Ok(ThreadGoal {
        thread_id: goal.thread_id,
        objective: goal.objective,
        status: parse_status(&goal.status)?,
        token_budget: goal.token_budget,
        tokens_used: goal.tokens_used,
        time_used_seconds: goal.time_used_seconds,
        created_at: goal.created_at_ms.div_euclid(1_000),
        updated_at: goal.updated_at_ms.div_euclid(1_000),
    })
}

fn validate_thread_id(thread_id: &str) -> Result<&str, ThreadGoalStoreError> {
    let thread_id = thread_id.trim();
    if thread_id.is_empty() {
        return Err(ThreadGoalStoreError::InvalidRequest(
            "threadId must not be empty".to_string(),
        ));
    }
    Ok(thread_id)
}

fn validate_objective(objective: &str) -> Result<String, ThreadGoalStoreError> {
    let objective = objective.trim();
    if objective.is_empty() {
        return Err(ThreadGoalStoreError::InvalidRequest(
            "goal objective must not be empty".to_string(),
        ));
    }
    if objective.chars().count() > MAX_OBJECTIVE_CHARS {
        return Err(ThreadGoalStoreError::InvalidRequest(format!(
            "goal objective must be at most {MAX_OBJECTIVE_CHARS} characters"
        )));
    }
    Ok(objective.to_string())
}

fn validate_token_budget(token_budget: i64) -> Result<(), ThreadGoalStoreError> {
    if token_budget <= 0 {
        return Err(ThreadGoalStoreError::InvalidRequest(
            "goal budgets must be positive when provided".to_string(),
        ));
    }
    Ok(())
}

fn patched_status(
    existing_status: &str,
    requested_status: Option<ThreadGoalStatus>,
    tokens_used: i64,
    token_budget: Option<i64>,
) -> Result<ThreadGoalStatus, ThreadGoalStoreError> {
    let existing = parse_status(existing_status)?;
    let requested = requested_status.unwrap_or(existing);
    if existing == ThreadGoalStatus::BudgetLimited
        && matches!(
            requested,
            ThreadGoalStatus::Paused | ThreadGoalStatus::Blocked
        )
    {
        return Ok(existing);
    }
    if requested == ThreadGoalStatus::Active
        && token_budget.is_some_and(|budget| tokens_used >= budget)
    {
        return Ok(ThreadGoalStatus::BudgetLimited);
    }
    Ok(requested)
}

fn status_as_str(status: ThreadGoalStatus) -> &'static str {
    match status {
        ThreadGoalStatus::Active => "active",
        ThreadGoalStatus::Paused => "paused",
        ThreadGoalStatus::Blocked => "blocked",
        ThreadGoalStatus::UsageLimited => "usage_limited",
        ThreadGoalStatus::BudgetLimited => "budget_limited",
        ThreadGoalStatus::Complete => "complete",
    }
}

fn parse_status(status: &str) -> Result<ThreadGoalStatus, ThreadGoalStoreError> {
    match status {
        "active" => Ok(ThreadGoalStatus::Active),
        "paused" => Ok(ThreadGoalStatus::Paused),
        "blocked" => Ok(ThreadGoalStatus::Blocked),
        "usage_limited" => Ok(ThreadGoalStatus::UsageLimited),
        "budget_limited" => Ok(ThreadGoalStatus::BudgetLimited),
        "complete" => Ok(ThreadGoalStatus::Complete),
        _ => Err(ThreadGoalStoreError::Store(format!(
            "unknown thread goal status `{status}`"
        ))),
    }
}

fn store_error(error: rusqlite::Error) -> ThreadGoalStoreError {
    ThreadGoalStoreError::Store(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn insert_thread(store: &ProjectionStore, thread_id: &str) {
        let conn = store.open_thread_store().expect("open canonical store");
        conn.execute(
            r#"INSERT INTO canonical_threads (
                 thread_id, session_id, thread_json, created_at_ms, updated_at_ms, archived
             ) VALUES (?1, ?2, '{}', 1, 1, 0)"#,
            params![thread_id, format!("session-{thread_id}")],
        )
        .expect("insert canonical thread");
    }

    fn set_params(
        thread_id: &str,
        objective: Option<&str>,
        status: Option<ThreadGoalStatus>,
        token_budget: Option<Option<i64>>,
    ) -> ThreadGoalSetParams {
        ThreadGoalSetParams {
            thread_id: thread_id.to_string(),
            objective: objective.map(str::to_string),
            status,
            token_budget,
        }
    }

    #[test]
    fn thread_goal_patch_restart_clear_and_thread_delete_are_durable() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("state.sqlite");
        let store = ProjectionStore::initialize(&path).expect("initialize store");
        insert_thread(&store, "thread-1");

        let created = store
            .set_thread_goal_sync(set_params(
                "thread-1",
                Some("  first objective  "),
                None,
                Some(Some(200)),
            ))
            .expect("create goal");
        assert_eq!(created.objective, "first objective");
        assert_eq!(created.status, ThreadGoalStatus::Active);
        assert_eq!(created.token_budget, Some(200));
        assert_eq!(created.tokens_used, 0);

        let conn = store.open_thread_store().expect("open canonical store");
        let (goal_id, created_at_ms): (String, i64) = conn
            .query_row(
                "SELECT goal_id, created_at_ms FROM thread_goals WHERE thread_id = ?1",
                params!["thread-1"],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read internal identity");
        conn.execute(
            r#"UPDATE thread_goals SET tokens_used = 75, time_used_seconds = 12
             WHERE thread_id = ?1"#,
            params!["thread-1"],
        )
        .expect("seed accounting");
        drop(conn);

        let patched = store
            .set_thread_goal_sync(set_params(
                "thread-1",
                Some("second objective"),
                Some(ThreadGoalStatus::Paused),
                None,
            ))
            .expect("patch goal");
        assert_eq!(patched.objective, "second objective");
        assert_eq!(patched.status, ThreadGoalStatus::Paused);
        assert_eq!(patched.token_budget, Some(200));
        assert_eq!(patched.tokens_used, 75);
        assert_eq!(patched.time_used_seconds, 12);

        let cleared_budget = store
            .set_thread_goal_sync(set_params("thread-1", None, None, Some(None)))
            .expect("clear budget");
        assert_eq!(cleared_budget.token_budget, None);
        let conn = store.open_thread_store().expect("open canonical store");
        let persisted_identity: (String, i64) = conn
            .query_row(
                "SELECT goal_id, created_at_ms FROM thread_goals WHERE thread_id = ?1",
                params!["thread-1"],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read preserved identity");
        assert_eq!(persisted_identity, (goal_id, created_at_ms));
        drop(conn);
        drop(store);

        let store = ProjectionStore::initialize(&path).expect("reopen store");
        assert_eq!(
            store
                .get_thread_goal_sync("thread-1")
                .expect("read after restart"),
            Some(cleared_budget)
        );
        assert!(store
            .clear_thread_goal_sync("thread-1")
            .expect("clear existing goal"));
        assert!(!store
            .clear_thread_goal_sync("thread-1")
            .expect("clear missing goal"));

        store
            .set_thread_goal_sync(set_params("thread-1", Some("delete me"), None, None))
            .expect("recreate goal");
        store
            .delete_thread_sync(DeleteThreadParams {
                thread_id: ThreadId::new("thread-1"),
            })
            .expect("delete canonical thread");
        let conn = store.open_thread_store().expect("open canonical store");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM thread_goals", [], |row| row.get(0))
            .expect("count goals after thread delete");
        assert_eq!(count, 0);
    }

    #[test]
    fn thread_goal_validation_fails_closed() {
        let temp = tempfile::tempdir().expect("tempdir");
        let store = ProjectionStore::initialize(temp.path().join("state.sqlite"))
            .expect("initialize store");
        insert_thread(&store, "thread-1");

        let missing = store
            .set_thread_goal_sync(set_params("missing", Some("goal"), None, None))
            .expect_err("missing thread must fail");
        assert!(matches!(missing, ThreadGoalStoreError::InvalidRequest(_)));

        let no_objective = store
            .set_thread_goal_sync(set_params("thread-1", None, None, None))
            .expect_err("new goal requires objective");
        assert!(no_objective
            .to_string()
            .contains("requires a non-empty objective"));

        for objective in ["", "   "] {
            let error = store
                .set_thread_goal_sync(set_params("thread-1", Some(objective), None, None))
                .expect_err("blank objective must fail");
            assert!(error.to_string().contains("must not be empty"));
        }
        let error = store
            .set_thread_goal_sync(set_params("thread-1", Some("goal"), None, Some(Some(0))))
            .expect_err("zero budget must fail");
        assert!(error.to_string().contains("must be positive"));
    }
}
