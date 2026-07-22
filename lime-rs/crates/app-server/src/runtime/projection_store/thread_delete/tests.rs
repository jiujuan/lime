use super::*;
use rusqlite::Connection;

const ANCESTOR_THREAD: &str = "thread-ancestor";
const ROOT_THREAD: &str = "thread-root";
const CHILD_THREAD: &str = "thread-child";
const GRAND_THREAD: &str = "thread-grand";
const PENDING_THREAD: &str = "thread-pending";
const SIBLING_THREAD: &str = "thread-sibling";

const ANCESTOR_SESSION: &str = "session-ancestor";
const ROOT_SESSION: &str = "session-root";
const CHILD_SESSION: &str = "session-child";
const GRAND_SESSION: &str = "session-grand";
const PENDING_SESSION: &str = "session-pending";
const SIBLING_SESSION: &str = "session-sibling";

#[test]
fn subtree_snapshot_and_delete_clean_three_databases_but_keep_sibling() {
    let temp = tempfile::tempdir().expect("tempdir");
    let store = test_store(temp.path());
    seed_subtree(&store);

    let snapshot = store
        .snapshot_thread_delete_subtree(&ThreadId::new(ROOT_THREAD))
        .expect("snapshot delete subtree");
    assert_eq!(
        snapshot
            .persisted
            .iter()
            .map(|thread| thread.thread_id.as_str())
            .collect::<Vec<_>>(),
        vec![GRAND_THREAD, CHILD_THREAD, ROOT_THREAD]
    );
    assert_eq!(
        snapshot
            .pending_only
            .iter()
            .map(|thread| {
                (
                    thread.thread_id.as_str(),
                    thread.pending_session_id.as_str(),
                )
            })
            .collect::<Vec<_>>(),
        vec![(PENDING_THREAD, PENDING_SESSION)]
    );
    assert_eq!(
        snapshot.persisted[0].rollout_path.as_deref(),
        Some("sessions/2026/07/21/rollout-thread-grand.jsonl")
    );
    assert!(!snapshot.persisted[0].archived);
    assert_eq!(
        snapshot.persisted[2].rollout_path.as_deref(),
        Some("archived_sessions/rollout-thread-root.jsonl")
    );
    assert!(snapshot.persisted[2].archived);

    store
        .delete_thread_subtree_data(&snapshot)
        .expect("delete subtree data");

    let conn = store.open_thread_store().expect("open store");
    assert_target_rows_deleted(&store, &conn);
    assert_sibling_rows_preserved(&store, &conn);
    assert!(store
        .snapshot_thread_delete_subtree(&ThreadId::new(ROOT_THREAD))
        .expect_err("deleted root must be missing")
        .contains("thread not found"));
}

#[test]
fn subtree_delete_rolls_back_every_database_when_final_thread_delete_fails() {
    let temp = tempfile::tempdir().expect("tempdir");
    let store = test_store(temp.path());
    seed_subtree(&store);
    let snapshot = store
        .snapshot_thread_delete_subtree(&ThreadId::new(ROOT_THREAD))
        .expect("snapshot delete subtree");
    let conn = store.open_thread_store().expect("open store");
    conn.execute_batch(
        "CREATE TRIGGER fail_root_thread_delete
         BEFORE DELETE ON canonical_threads
         WHEN OLD.thread_id = 'thread-root'
         BEGIN
             SELECT RAISE(ABORT, 'injected root delete failure');
         END;",
    )
    .expect("install delete failure trigger");
    drop(conn);

    let error = store
        .delete_thread_subtree_data(&snapshot)
        .expect_err("delete must fail");
    assert!(error.contains("injected root delete failure"));

    let conn = store.open_thread_store().expect("reopen store");
    assert_eq!(
        count(
            &conn,
            "SELECT COUNT(*) FROM canonical_threads
             WHERE thread_id IN ('thread-root', 'thread-child', 'thread-grand')"
        ),
        3
    );
    assert_eq!(
        count(
            &conn,
            "SELECT COUNT(*) FROM canonical_thread_spawn_edges
             WHERE parent_thread_id IN ('thread-root', 'thread-child', 'thread-grand')
                OR child_thread_id IN (
                    'thread-root', 'thread-child', 'thread-grand', 'thread-pending'
                )"
        ),
        4
    );
    assert_eq!(
        count(
            &conn,
            &format!(
                "SELECT COUNT(*) FROM {}canonical_turns
                 WHERE thread_id IN (
                     'thread-root', 'thread-child', 'thread-grand', 'thread-pending'
                 )",
                history_schema(&store)
            )
        ),
        4
    );
    assert_eq!(
        count(
            &conn,
            &format!(
                "SELECT COUNT(*) FROM {}projected_sessions
                 WHERE session_id IN (
                     'session-root', 'session-child', 'session-grand', 'session-pending'
                 )",
                projection_schema(&store)
            )
        ),
        4
    );
    assert_eq!(
        count(
            &conn,
            &format!(
                "SELECT COUNT(*) FROM {}agent_identities
                 WHERE thread_id IN (
                     'thread-root', 'thread-child', 'thread-grand', 'thread-pending',
                     'thread-stale-root'
                 )",
                projection_schema(&store)
            )
        ),
        5
    );
    assert_eq!(
        count(
            &conn,
            &format!(
                "SELECT COUNT(*) FROM {}agent_mailbox_messages
                 WHERE message_id IN ('message-inside', 'message-crossing', 'message-stale-root')",
                projection_schema(&store)
            )
        ),
        3
    );
}

fn test_store(root: &Path) -> ProjectionStore {
    ProjectionStore::initialize_with_storage_paths(
        root.join("runtime/projection_1.sqlite"),
        root.join("sqlite/state.sqlite"),
        root.join("sqlite/thread_history.sqlite"),
        root,
    )
    .expect("projection store")
}

fn seed_subtree(store: &ProjectionStore) {
    let conn = store.open_thread_store().expect("open store");
    let projection_schema = projection_schema(store);
    conn.execute_batch(&format!(
        "CREATE TABLE IF NOT EXISTS {projection_schema}agent_identities (
             thread_id TEXT PRIMARY KEY,
             root_thread_id TEXT NOT NULL,
             agent_path TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS {projection_schema}agent_mailbox_messages (
             message_id TEXT PRIMARY KEY,
             root_thread_id TEXT NOT NULL,
             sender_thread_id TEXT NOT NULL,
             recipient_thread_id TEXT NOT NULL
         );"
    ))
    .expect("agent tables");

    for (thread_id, session_id, rollout_path, archived) in [
        (
            ANCESTOR_THREAD,
            ANCESTOR_SESSION,
            "sessions/2026/07/21/rollout-thread-ancestor.jsonl",
            false,
        ),
        (
            ROOT_THREAD,
            ROOT_SESSION,
            "archived_sessions/rollout-thread-root.jsonl",
            true,
        ),
        (
            CHILD_THREAD,
            CHILD_SESSION,
            "sessions/2026/07/21/rollout-thread-child.jsonl",
            false,
        ),
        (
            GRAND_THREAD,
            GRAND_SESSION,
            "sessions/2026/07/21/rollout-thread-grand.jsonl",
            false,
        ),
        (
            SIBLING_THREAD,
            SIBLING_SESSION,
            "sessions/2026/07/21/rollout-thread-sibling.jsonl",
            false,
        ),
    ] {
        seed_persisted_thread(store, &conn, thread_id, session_id, rollout_path, archived);
    }
    seed_history(store, &conn, PENDING_THREAD);
    seed_projection(store, &conn, PENDING_SESSION, PENDING_THREAD);

    for (parent, child, status, pending_session_id) in [
        (ANCESTOR_THREAD, ROOT_THREAD, "open", None),
        (ANCESTOR_THREAD, SIBLING_THREAD, "open", None),
        (ROOT_THREAD, CHILD_THREAD, "open", None),
        (CHILD_THREAD, GRAND_THREAD, "open", None),
        (
            GRAND_THREAD,
            PENDING_THREAD,
            "pending",
            Some(PENDING_SESSION),
        ),
    ] {
        conn.execute(
            "INSERT INTO canonical_thread_spawn_edges (
                 parent_thread_id, child_thread_id, status, pending_session_id
             ) VALUES (?1, ?2, ?3, ?4)",
            params![parent, child, status, pending_session_id],
        )
        .expect("spawn edge");
    }

    for (thread_id, root_thread_id, path) in [
        (ROOT_THREAD, ROOT_THREAD, "/root"),
        (CHILD_THREAD, ROOT_THREAD, "/root/child"),
        (GRAND_THREAD, ROOT_THREAD, "/root/child/grand"),
        (PENDING_THREAD, ROOT_THREAD, "/root/child/grand/pending"),
        ("thread-stale-root", ROOT_THREAD, "/root/stale"),
        (SIBLING_THREAD, ANCESTOR_THREAD, "/ancestor/sibling"),
    ] {
        conn.execute(
            &format!(
                "INSERT INTO {projection_schema}agent_identities (
                     thread_id, root_thread_id, agent_path
                 ) VALUES (?1, ?2, ?3)"
            ),
            params![thread_id, root_thread_id, path],
        )
        .expect("agent identity");
    }
    for (message_id, root_thread_id, sender, recipient) in [
        ("message-inside", ROOT_THREAD, CHILD_THREAD, GRAND_THREAD),
        (
            "message-crossing",
            ANCESTOR_THREAD,
            CHILD_THREAD,
            SIBLING_THREAD,
        ),
        (
            "message-stale-root",
            ROOT_THREAD,
            "thread-missing-a",
            "thread-missing-b",
        ),
        (
            "message-sibling",
            ANCESTOR_THREAD,
            SIBLING_THREAD,
            ANCESTOR_THREAD,
        ),
    ] {
        conn.execute(
            &format!(
                "INSERT INTO {projection_schema}agent_mailbox_messages (
                     message_id, root_thread_id, sender_thread_id, recipient_thread_id
                 ) VALUES (?1, ?2, ?3, ?4)"
            ),
            params![message_id, root_thread_id, sender, recipient],
        )
        .expect("mailbox message");
    }
}

fn seed_persisted_thread(
    store: &ProjectionStore,
    conn: &Connection,
    thread_id: &str,
    session_id: &str,
    rollout_path: &str,
    archived: bool,
) {
    conn.execute(
        "INSERT INTO canonical_threads (
             thread_id, session_id, thread_json, created_at_ms, updated_at_ms,
             archived, rollout_path
         ) VALUES (?1, ?2, '{}', 1, 1, ?3, ?4)",
        params![thread_id, session_id, archived, rollout_path],
    )
    .expect("canonical thread");
    conn.execute(
        "INSERT INTO thread_goals (
             thread_id, goal_id, objective, status, token_budget, tokens_used,
             time_used_seconds, created_at_ms, updated_at_ms
         ) VALUES (?1, ?2, 'objective', 'active', NULL, 0, 0, 1, 1)",
        params![thread_id, format!("goal-{thread_id}")],
    )
    .expect("thread goal");
    conn.execute(
        "INSERT INTO thread_goal_turn_accounting (
             thread_id, turn_id, goal_id, turn_mode, started_at_ms,
             last_accounted_time_seconds, last_input_tokens, last_cached_input_tokens,
             last_output_tokens, last_reasoning_output_tokens, last_total_tokens,
             last_source_sequence, terminal_sequence
         ) VALUES (?1, ?2, ?3, 'default', 1, 0, 0, 0, 0, 0, 0, 1, NULL)",
        params![
            thread_id,
            format!("turn-{thread_id}"),
            format!("goal-{thread_id}")
        ],
    )
    .expect("goal accounting");
    conn.execute(
        "INSERT INTO thread_goal_update_outbox (
             thread_id, turn_id, goal_id, source_sequence, notification_json,
             created_at_ms, delivered_at_ms
         ) VALUES (?1, ?2, ?3, 1, '{}', 1, NULL)",
        params![
            thread_id,
            format!("turn-{thread_id}"),
            format!("goal-{thread_id}")
        ],
    )
    .expect("goal outbox");
    seed_history(store, conn, thread_id);
    seed_projection(store, conn, session_id, thread_id);
}

fn seed_history(store: &ProjectionStore, conn: &Connection, thread_id: &str) {
    let schema = history_schema(store);
    let turn_id = format!("turn-{thread_id}");
    conn.execute(
        &format!(
            "INSERT INTO {schema}canonical_turns (
                 thread_id, turn_id, ordinal, last_sequence, turn_json
             ) VALUES (?1, ?2, 1, 1, '{{}}')"
        ),
        params![thread_id, turn_id],
    )
    .expect("canonical turn");
    conn.execute(
        &format!(
            "INSERT INTO {schema}canonical_items (
                 thread_id, turn_id, item_id, ordinal, sequence, item_json
             ) VALUES (?1, ?2, ?3, 1, 1, '{{}}')"
        ),
        params![thread_id, turn_id, format!("item-{thread_id}")],
    )
    .expect("canonical item");
    conn.execute(
        &format!(
            "INSERT INTO {schema}canonical_history_applies (
                 thread_id, sequence, fingerprint
             ) VALUES (?1, 1, ?2)"
        ),
        params![thread_id, format!("fingerprint-{thread_id}")],
    )
    .expect("canonical history apply");
}

fn seed_projection(store: &ProjectionStore, conn: &Connection, session_id: &str, thread_id: &str) {
    let schema = projection_schema(store);
    let turn_id = format!("projected-turn-{thread_id}");
    conn.execute(
        &format!(
            "INSERT INTO {schema}projected_sessions (
                 session_id, thread_id, status, updated_at, last_event_sequence
             ) VALUES (?1, ?2, 'idle', '2026-07-21T00:00:00Z', 1)"
        ),
        params![session_id, thread_id],
    )
    .expect("projected session");
    conn.execute(
        &format!(
            "INSERT INTO {schema}projected_turns (
                 turn_id, session_id, thread_id, status, last_event_sequence
             ) VALUES (?1, ?2, ?3, 'completed', 1)"
        ),
        params![turn_id, session_id, thread_id],
    )
    .expect("projected turn");
    conn.execute(
        &format!(
            "INSERT INTO {schema}projected_items (
                 event_id, session_id, thread_id, turn_id, sequence, item_type,
                 payload_summary_json, created_at
             ) VALUES (?1, ?2, ?3, ?4, 1, 'message', '{{}}',
                       '2026-07-21T00:00:00Z')"
        ),
        params![format!("event-{thread_id}"), session_id, thread_id, turn_id],
    )
    .expect("projected item");
    conn.execute(
        &format!(
            "INSERT INTO {schema}projection_watermarks (
                 session_id, last_sequence, last_event_id, updated_at
             ) VALUES (?1, 1, ?2, '2026-07-21T00:00:00Z')"
        ),
        params![session_id, format!("event-{thread_id}")],
    )
    .expect("projection watermark");
}

fn assert_target_rows_deleted(store: &ProjectionStore, conn: &Connection) {
    for table in [
        "thread_goals",
        "thread_goal_turn_accounting",
        "thread_goal_update_outbox",
    ] {
        assert_eq!(
            count(
                conn,
                &format!(
                    "SELECT COUNT(*) FROM {table}
                     WHERE thread_id IN ('thread-root', 'thread-child', 'thread-grand')"
                )
            ),
            0,
            "{table}"
        );
    }
    assert_eq!(
        count(
            conn,
            "SELECT COUNT(*) FROM canonical_threads
             WHERE thread_id IN ('thread-root', 'thread-child', 'thread-grand')"
        ),
        0
    );
    assert_eq!(
        count(
            conn,
            "SELECT COUNT(*) FROM canonical_thread_spawn_edges
             WHERE parent_thread_id IN ('thread-root', 'thread-child', 'thread-grand')
                OR child_thread_id IN (
                    'thread-root', 'thread-child', 'thread-grand', 'thread-pending'
                )"
        ),
        0
    );
    for table in [
        "canonical_items",
        "canonical_turns",
        "canonical_history_applies",
    ] {
        assert_eq!(
            count(
                conn,
                &format!(
                    "SELECT COUNT(*) FROM {}{table}
                     WHERE thread_id IN (
                         'thread-root', 'thread-child', 'thread-grand', 'thread-pending'
                     )",
                    history_schema(store)
                )
            ),
            0,
            "{table}"
        );
    }
    for table in [
        "projected_items",
        "projected_turns",
        "projection_watermarks",
        "projected_sessions",
    ] {
        assert_eq!(
            count(
                conn,
                &format!(
                    "SELECT COUNT(*) FROM {}{table}
                     WHERE session_id IN (
                         'session-root', 'session-child', 'session-grand', 'session-pending'
                     )",
                    projection_schema(store)
                )
            ),
            0,
            "{table}"
        );
    }
    assert_eq!(
        count(
            conn,
            &format!(
                "SELECT COUNT(*) FROM {}agent_identities
                 WHERE thread_id IN (
                     'thread-root', 'thread-child', 'thread-grand', 'thread-pending',
                     'thread-stale-root'
                 )",
                projection_schema(store)
            )
        ),
        0
    );
    assert_eq!(
        count(
            conn,
            &format!(
                "SELECT COUNT(*) FROM {}agent_mailbox_messages
                 WHERE message_id IN ('message-inside', 'message-crossing', 'message-stale-root')",
                projection_schema(store)
            )
        ),
        0
    );
}

fn assert_sibling_rows_preserved(store: &ProjectionStore, conn: &Connection) {
    assert_eq!(
        count(
            conn,
            "SELECT COUNT(*) FROM canonical_threads
             WHERE thread_id IN ('thread-ancestor', 'thread-sibling')"
        ),
        2
    );
    assert_eq!(
        count(
            conn,
            "SELECT COUNT(*) FROM canonical_thread_spawn_edges
             WHERE parent_thread_id = 'thread-ancestor'
               AND child_thread_id = 'thread-sibling'"
        ),
        1
    );
    assert_eq!(
        count(
            conn,
            &format!(
                "SELECT COUNT(*) FROM {}canonical_turns
                 WHERE thread_id = 'thread-sibling'",
                history_schema(store)
            )
        ),
        1
    );
    assert_eq!(
        count(
            conn,
            &format!(
                "SELECT COUNT(*) FROM {}projected_sessions
                 WHERE session_id = 'session-sibling'",
                projection_schema(store)
            )
        ),
        1
    );
    assert_eq!(
        count(
            conn,
            &format!(
                "SELECT COUNT(*) FROM {}agent_identities
                 WHERE thread_id = 'thread-sibling'",
                projection_schema(store)
            )
        ),
        1
    );
    assert_eq!(
        count(
            conn,
            &format!(
                "SELECT COUNT(*) FROM {}agent_mailbox_messages
                 WHERE message_id = 'message-sibling'",
                projection_schema(store)
            )
        ),
        1
    );
}

fn count(conn: &Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |row| row.get(0))
        .expect("count rows")
}
