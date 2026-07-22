use std::collections::HashSet;

use agent_protocol::ThreadId;
use rusqlite::{params, Connection};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(in crate::runtime) struct PersistedThreadDelete {
    pub(in crate::runtime) thread_id: ThreadId,
    pub(in crate::runtime) session_id: String,
    pub(in crate::runtime) rollout_path: Option<String>,
    pub(in crate::runtime) archived: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(in crate::runtime) struct PendingThreadDelete {
    pub(in crate::runtime) thread_id: ThreadId,
    pub(in crate::runtime) pending_session_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(in crate::runtime) struct ThreadDeleteSubtreeSnapshot {
    pub(in crate::runtime) root_thread_id: ThreadId,
    pub(in crate::runtime) persisted: Vec<PersistedThreadDelete>,
    pub(in crate::runtime) pending_only: Vec<PendingThreadDelete>,
    pub(in crate::runtime) thread_ids_deepest_first: Vec<ThreadId>,
}

pub(super) fn snapshot_thread_delete_subtree_in_conn(
    conn: &Connection,
    root_thread_id: &str,
) -> Result<ThreadDeleteSubtreeSnapshot, String> {
    let root_thread_id = root_thread_id.trim();
    if root_thread_id.is_empty() {
        return Err("thread delete root thread id must not be empty".to_string());
    }
    let mut statement = conn
        .prepare(
            "WITH RECURSIVE subtree(thread_id, depth, spawn_status, pending_session_id) AS (
                SELECT ?1, 0, NULL, NULL
                UNION ALL
                SELECT edge.child_thread_id, subtree.depth + 1,
                       edge.status, edge.pending_session_id
                FROM canonical_thread_spawn_edges AS edge
                JOIN subtree ON edge.parent_thread_id = subtree.thread_id
             )
             SELECT subtree.thread_id, subtree.depth, subtree.spawn_status,
                    subtree.pending_session_id,
                    threads.session_id, threads.rollout_path, threads.archived
             FROM subtree
             LEFT JOIN canonical_threads AS threads
                ON threads.thread_id = subtree.thread_id
             ORDER BY subtree.depth DESC, subtree.thread_id DESC",
        )
        .map_err(|error| format!("failed to prepare thread delete subtree snapshot: {error}"))?;
    let rows = statement
        .query_map(params![root_thread_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<bool>>(6)?,
            ))
        })
        .map_err(|error| format!("failed to query thread delete subtree snapshot: {error}"))?;

    let mut persisted = Vec::new();
    let mut pending_only = Vec::new();
    let mut thread_ids_deepest_first = Vec::new();
    let mut seen = HashSet::new();
    for row in rows {
        let (
            thread_id,
            depth,
            spawn_status,
            pending_session_id,
            session_id,
            rollout_path,
            archived,
        ) =
            row.map_err(|error| format!("failed to read thread delete subtree snapshot: {error}"))?;
        if !seen.insert(thread_id.clone()) {
            return Err(format!(
                "thread delete subtree contains duplicate thread {thread_id}"
            ));
        }
        thread_ids_deepest_first.push(ThreadId::new(thread_id.clone()));
        if let Some(session_id) = session_id {
            let archived = archived
                .ok_or_else(|| format!("persisted thread {thread_id} has no archived state"))?;
            persisted.push(PersistedThreadDelete {
                thread_id: ThreadId::new(thread_id),
                session_id,
                rollout_path,
                archived,
            });
            continue;
        }
        if depth == 0 {
            return Err(format!("thread not found: {root_thread_id}"));
        }
        if spawn_status.as_deref() != Some("pending") {
            return Err(format!(
                "thread delete descendant {thread_id} is missing its canonical thread but is not pending"
            ));
        }
        let pending_session_id = pending_session_id
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                format!(
                    "thread delete descendant {thread_id} has neither canonical thread nor pending session"
                )
            })?;
        pending_only.push(PendingThreadDelete {
            thread_id: ThreadId::new(thread_id),
            pending_session_id,
        });
    }
    if persisted
        .iter()
        .all(|thread| thread.thread_id.as_str() != root_thread_id)
    {
        return Err(format!("thread not found: {root_thread_id}"));
    }
    let snapshot = ThreadDeleteSubtreeSnapshot {
        root_thread_id: ThreadId::new(root_thread_id),
        persisted,
        pending_only,
        thread_ids_deepest_first,
    };
    validate_snapshot(&snapshot)?;
    Ok(snapshot)
}

pub(super) fn validate_snapshot(snapshot: &ThreadDeleteSubtreeSnapshot) -> Result<(), String> {
    let root_thread_id = required_thread_id(&snapshot.root_thread_id)?;
    if snapshot.persisted.is_empty()
        || snapshot
            .persisted
            .iter()
            .all(|thread| thread.thread_id.as_str() != root_thread_id)
    {
        return Err(format!(
            "thread delete snapshot does not contain root thread {root_thread_id}"
        ));
    }
    let mut expected = HashSet::new();
    for thread in &snapshot.persisted {
        if thread.thread_id.as_str().trim().is_empty() || thread.session_id.trim().is_empty() {
            return Err("thread delete snapshot contains an empty persisted identity".to_string());
        }
        if !expected.insert(thread.thread_id.as_str()) {
            return Err(format!(
                "thread delete snapshot contains duplicate thread {}",
                thread.thread_id
            ));
        }
    }
    for thread in &snapshot.pending_only {
        if thread.thread_id.as_str().trim().is_empty()
            || thread.pending_session_id.trim().is_empty()
        {
            return Err("thread delete snapshot contains an empty pending identity".to_string());
        }
        if !expected.insert(thread.thread_id.as_str()) {
            return Err(format!(
                "thread delete snapshot contains duplicate thread {}",
                thread.thread_id
            ));
        }
    }
    let actual = snapshot
        .thread_ids_deepest_first
        .iter()
        .map(ThreadId::as_str)
        .collect::<HashSet<_>>();
    if actual.len() != snapshot.thread_ids_deepest_first.len() || actual != expected {
        return Err("thread delete snapshot order does not match its entries".to_string());
    }
    Ok(())
}

pub(super) fn required_thread_id(thread_id: &ThreadId) -> Result<&str, String> {
    let thread_id = thread_id.as_str().trim();
    if thread_id.is_empty() {
        return Err("thread delete root thread id must not be empty".to_string());
    }
    Ok(thread_id)
}

pub(super) fn snapshot_session_ids(snapshot: &ThreadDeleteSubtreeSnapshot) -> Vec<&str> {
    snapshot
        .persisted
        .iter()
        .map(|thread| thread.session_id.as_str())
        .chain(
            snapshot
                .pending_only
                .iter()
                .map(|thread| thread.pending_session_id.as_str()),
        )
        .collect()
}
