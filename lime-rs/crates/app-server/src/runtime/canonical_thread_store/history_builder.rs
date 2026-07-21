use agent_protocol::{SessionId, ThreadHistoryChangeSet, ThreadId, ThreadTurnsView, TurnId};
use rusqlite::{params, Connection};
use std::collections::HashMap;
use thread_store::{
    CanonicalHistory, ThreadHistoryBuilder, ThreadHistoryBuilderError, ThreadStoreResult,
};

use super::{error, from_i64, hydrate_thread, read_thread_row, store_error};

pub(super) fn normalize_replayed_change_set(
    session_id: &SessionId,
    thread_id: &ThreadId,
    changes: ThreadHistoryChangeSet,
) -> ThreadStoreResult<ThreadHistoryChangeSet> {
    ThreadHistoryBuilder::for_thread(session_id.clone(), thread_id.clone())
        .apply_change_set(changes)
        .map_err(|source: ThreadHistoryBuilderError| error(source.to_string()))
}

pub(super) fn normalize_persisted_change_set(
    conn: &Connection,
    session_id: &SessionId,
    thread_id: &ThreadId,
    last_sequence: Option<i64>,
    changes: ThreadHistoryChangeSet,
) -> ThreadStoreResult<ThreadHistoryChangeSet> {
    let Some((mut thread, _)) = read_thread_row(conn, thread_id)? else {
        return Err(error(format!("thread {thread_id} does not exist")));
    };
    if &thread.session_id != session_id {
        return Err(error("session/thread identity mismatch"));
    }
    hydrate_thread(conn, &mut thread, ThreadTurnsView::Full)?;
    let items = thread
        .turns
        .iter()
        .flat_map(|turn| turn.items.iter().cloned())
        .collect();
    let turn_sequences = read_turn_sequences(conn, thread_id)?;
    let sequence = last_sequence
        .map(|sequence| from_i64(sequence, "history sequence"))
        .transpose()?;
    let mut builder = ThreadHistoryBuilder::from_snapshot(CanonicalHistory {
        session_id: Some(session_id.clone()),
        thread_id: Some(thread_id.clone()),
        sequence,
        turns: thread.turns,
        turn_sequences,
        items,
    })
    .map_err(|source: ThreadHistoryBuilderError| error(source.to_string()))?;
    builder
        .apply_change_set(changes)
        .map_err(|source: ThreadHistoryBuilderError| error(source.to_string()))
}

fn read_turn_sequences(
    conn: &Connection,
    thread_id: &ThreadId,
) -> ThreadStoreResult<HashMap<TurnId, u64>> {
    let mut statement = conn
        .prepare(
            "SELECT turn_id, last_sequence FROM canonical_turns
             WHERE thread_id = ?1",
        )
        .map_err(store_error)?;
    let rows = statement
        .query_map(params![thread_id.as_str()], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(store_error)?;
    let mut sequences = HashMap::new();
    for row in rows {
        let (turn_id, sequence) = row.map_err(store_error)?;
        sequences.insert(TurnId::new(turn_id), from_i64(sequence, "turn sequence")?);
    }
    Ok(sequences)
}
