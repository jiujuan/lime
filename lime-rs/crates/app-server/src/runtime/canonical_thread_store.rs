use std::any::Any;
use std::collections::{HashMap, HashSet};

use agent_protocol::{
    CollabAgentState, CollabAgentStatus, SortDirection, Thread, ThreadActiveFlag,
    ThreadHistoryChangeSet, ThreadId, ThreadItem, ThreadStatus, ThreadTurnsView, Turn, TurnId,
    TurnItemsView, TurnStatus,
};
use app_server_protocol::{AgentEvent, AgentSessionStatus};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thread_store::{
    ApplyThreadHistoryParams, ApplyThreadHistoryResult, ArchiveThreadParams, CreateThreadParams,
    DeleteThreadParams, ItemPage, ListItemsParams, ListThreadsParams, ListTurnsParams,
    ReadThreadParams, StoreCursor, ThreadMetadataPatch, ThreadPage, ThreadSpawnEdgeStatus,
    ThreadStore, ThreadStoreError, ThreadStoreFuture, ThreadStoreResult, TurnPage,
    UpdateThreadMetadataParams,
};

use super::{ProjectionStore, StoredSession};

mod agent_graph;
mod persistence;
mod queries;

use persistence::{apply_change_set, create_thread_store_schema, refresh_thread_snapshot};
use queries::{
    ensure_thread_visible, hydrate_thread, hydrate_turn, persist_thread_snapshot, query_item_page,
    query_thread_page, query_turn_page, read_thread_row,
};

const MAX_PAGE_SIZE: u32 = 500;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum CursorKind {
    Threads,
    Turns,
    Items,
}

#[derive(Debug, Serialize, Deserialize)]
struct CursorValue {
    kind: CursorKind,
    position: i64,
    id: String,
}

impl ProjectionStore {
    pub(super) fn ensure_canonical_thread_store(&self) -> Result<(), String> {
        self.open_thread_store()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    pub(super) fn create_empty_canonical_thread(
        &self,
        stored: &StoredSession,
    ) -> Result<(), String> {
        self.create_thread_sync(CreateThreadParams {
            thread: canonical_thread_from_stored_session(stored),
        })
        .map_err(|error| error.to_string())
    }

    pub(super) fn apply_canonical_events(
        &self,
        stored: &StoredSession,
        events: &[AgentEvent],
    ) -> Result<(), String> {
        if events.is_empty() {
            return Ok(());
        }
        let thread_id = ThreadId::new(stored.session.thread_id.clone());
        let conn = self
            .open_thread_store()
            .map_err(|error| error.to_string())?;
        if read_thread_row(&conn, &thread_id)
            .map_err(|error| error.to_string())?
            .is_none()
        {
            self.create_empty_canonical_thread(stored)?;
        }
        let changes = super::thread_item_projection::materialize_events(
            events,
            &stored.session.session_id,
            &stored.session.thread_id,
        )
        .map_err(|error| error.to_string())?;
        if changes.sequence == 0 {
            return Ok(());
        }
        self.apply_history_sync(ApplyThreadHistoryParams {
            session_id: agent_protocol::SessionId::new(stored.session.session_id.clone()),
            thread_id,
            changes,
        })
        .map(|_| ())
        .map_err(|error| error.to_string())
    }

    pub(super) fn repair_canonical_history(
        &self,
        stored: &StoredSession,
        events: &[AgentEvent],
    ) -> Result<(), String> {
        let changes = super::thread_item_projection::materialize_events(
            events,
            &stored.session.session_id,
            &stored.session.thread_id,
        )
        .map_err(|error| error.to_string())?;
        let thread_id = ThreadId::new(stored.session.thread_id.clone());
        let current = self
            .read_thread_sync(ReadThreadParams {
                thread_id: thread_id.clone(),
                include_archived: true,
                turns_view: ThreadTurnsView::Full,
            })
            .map_err(|error| error.to_string())?;
        if current
            .as_ref()
            .is_some_and(|thread| canonical_history_matches(thread, &changes))
        {
            return Ok(());
        }

        self.replace_canonical_history(stored, thread_id, changes)
            .map_err(|error| error.to_string())
    }

    fn replace_canonical_history(
        &self,
        stored: &StoredSession,
        thread_id: ThreadId,
        changes: ThreadHistoryChangeSet,
    ) -> ThreadStoreResult<()> {
        let apply_params = ApplyThreadHistoryParams {
            session_id: agent_protocol::SessionId::new(stored.session.session_id.clone()),
            thread_id: thread_id.clone(),
            changes,
        };
        validate_change_set(&apply_params)?;
        let fingerprint = change_fingerprint(&apply_params)?;
        let mut conn = self.open_thread_store()?;
        let tx = conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(store_error)?;
        let existing = tx
            .query_row(
                "SELECT session_id, last_sequence FROM canonical_threads WHERE thread_id = ?1",
                params![thread_id.as_str()],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?)),
            )
            .optional()
            .map_err(store_error)?;

        if let Some((session_id, last_sequence)) = existing {
            if session_id != stored.session.session_id {
                return Err(error("session/thread identity mismatch"));
            }
            if last_sequence
                .is_some_and(|sequence| sequence.max(0) as u64 > apply_params.changes.sequence)
            {
                return Err(error(format!(
                    "canonical history advanced to {} while repairing sequence {}",
                    last_sequence.unwrap_or_default(),
                    apply_params.changes.sequence
                )));
            }
            tx.execute(
                "DELETE FROM canonical_turns WHERE thread_id = ?1",
                params![thread_id.as_str()],
            )
            .map_err(store_error)?;
            tx.execute(
                "DELETE FROM canonical_history_applies WHERE thread_id = ?1",
                params![thread_id.as_str()],
            )
            .map_err(store_error)?;
            tx.execute(
                "UPDATE canonical_threads SET last_sequence = NULL WHERE thread_id = ?1",
                params![thread_id.as_str()],
            )
            .map_err(store_error)?;
        } else {
            insert_thread_row(&tx, canonical_thread_from_stored_session(stored))?;
        }

        if apply_params.changes.sequence > 0 {
            apply_change_set(&tx, &apply_params)?;
            refresh_thread_snapshot(&tx, &thread_id, apply_params.changes.sequence)?;
            tx.execute(
                "INSERT INTO canonical_history_applies (thread_id, sequence, fingerprint)
                 VALUES (?1, ?2, ?3)",
                params![
                    thread_id.as_str(),
                    to_i64(apply_params.changes.sequence, "history sequence")?,
                    fingerprint,
                ],
            )
            .map_err(store_error)?;
        }
        tx.commit().map_err(store_error)
    }

    fn open_thread_store(&self) -> ThreadStoreResult<Connection> {
        let conn = Connection::open(self.path()).map_err(store_error)?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(store_error)?;
        create_thread_store_schema(&conn)?;
        Ok(conn)
    }

    fn create_thread_sync(&self, params: CreateThreadParams) -> ThreadStoreResult<()> {
        if !params.thread.turns.is_empty() {
            return Err(error("create_thread rejects embedded turns"));
        }
        let conn = self.open_thread_store()?;
        insert_thread_row(&conn, params.thread)
    }

    pub(crate) fn read_thread_sync(
        &self,
        params: ReadThreadParams,
    ) -> ThreadStoreResult<Option<Thread>> {
        let conn = self.open_thread_store()?;
        let Some((mut thread, archived)) = read_thread_row(&conn, &params.thread_id)? else {
            return Ok(None);
        };
        if archived && !params.include_archived {
            return Ok(None);
        }
        hydrate_thread(&conn, &mut thread, params.turns_view)?;
        self.enrich_thread_agent_context(&mut thread)?;
        Ok(Some(thread))
    }

    fn list_threads_sync(&self, params: ListThreadsParams) -> ThreadStoreResult<ThreadPage> {
        let conn = self.open_thread_store()?;
        let limit = page_limit(params.page.limit)?;
        let cursor = decode_cursor(params.page.cursor.as_ref(), CursorKind::Threads)?;
        let direction = params.page.sort_direction;
        let mut rows = query_thread_page(
            &conn,
            params.include_archived,
            direction,
            cursor.as_ref(),
            limit + 1,
        )?;
        let has_more = rows.len() > limit as usize;
        rows.truncate(limit as usize);
        let next_cursor = has_more
            .then(|| rows.last())
            .flatten()
            .map(|(_, position, id)| encode_cursor(CursorKind::Threads, *position, id))
            .transpose()?;
        let backwards_cursor = params
            .page
            .cursor
            .as_ref()
            .and_then(|_| rows.first())
            .map(|(_, position, id)| encode_cursor(CursorKind::Threads, *position, id))
            .transpose()?;
        for (thread, _, _) in &mut rows {
            self.enrich_thread_agent_context(thread)?;
        }
        Ok(ThreadPage {
            data: rows.into_iter().map(|(thread, _, _)| thread).collect(),
            next_cursor,
            backwards_cursor,
        })
    }

    fn enrich_thread_agent_context(&self, thread: &mut Thread) -> ThreadStoreResult<()> {
        thread.parent_thread_id = None;
        thread.agent_path = None;
        thread.agent_nickname = None;
        thread.agent_role = None;
        thread.last_task_message = None;
        thread.agent_state = None;
        let Some(parent) = self.read_thread_spawn_parent_sync(thread.thread_id.clone())? else {
            return Ok(());
        };
        thread.parent_thread_id = Some(parent.parent_thread_id.clone());
        if let Some(identity) = self.read_agent_identity_sync(thread.thread_id.clone())? {
            thread.agent_path = Some(identity.agent_path);
            thread.agent_nickname = non_empty_string(identity.nickname);
            thread.agent_role = non_empty_string(identity.role);
            thread.last_task_message = non_empty_string(identity.last_task_message);
        }
        thread.agent_state = Some(derive_agent_state(thread, parent.status));
        Ok(())
    }

    fn apply_history_sync(
        &self,
        params: ApplyThreadHistoryParams,
    ) -> ThreadStoreResult<ApplyThreadHistoryResult> {
        validate_change_set(&params)?;
        let fingerprint = change_fingerprint(&params)?;
        let mut conn = self.open_thread_store()?;
        let tx = conn.transaction().map_err(store_error)?;
        let (stored_session_id, last_sequence) = tx
            .query_row(
                "SELECT session_id, last_sequence FROM canonical_threads WHERE thread_id = ?1",
                params![params.thread_id.as_str()],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?)),
            )
            .optional()
            .map_err(store_error)?
            .ok_or_else(|| error(format!("thread {} does not exist", params.thread_id)))?;
        if stored_session_id != params.session_id.as_str() {
            return Err(error("session/thread identity mismatch"));
        }

        if let Some(existing) = tx
            .query_row(
                "SELECT fingerprint FROM canonical_history_applies
                 WHERE thread_id = ?1 AND sequence = ?2",
                params![
                    params.thread_id.as_str(),
                    to_i64(params.changes.sequence, "history sequence")?
                ],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(store_error)?
        {
            if existing == fingerprint {
                return Ok(ApplyThreadHistoryResult {
                    sequence: params.changes.sequence,
                    applied: false,
                });
            }
            return Err(error(format!(
                "history sequence collision at {}",
                params.changes.sequence
            )));
        }
        if last_sequence.is_some_and(|value| params.changes.sequence <= value.max(0) as u64) {
            return Err(error(format!(
                "stale history sequence {} after {}",
                params.changes.sequence,
                last_sequence.unwrap_or_default()
            )));
        }

        apply_change_set(&tx, &params)?;
        refresh_thread_snapshot(&tx, &params.thread_id, params.changes.sequence)?;
        tx.execute(
            "INSERT INTO canonical_history_applies (thread_id, sequence, fingerprint)
             VALUES (?1, ?2, ?3)",
            params![
                params.thread_id.as_str(),
                to_i64(params.changes.sequence, "history sequence")?,
                fingerprint,
            ],
        )
        .map_err(store_error)?;
        tx.commit().map_err(store_error)?;
        Ok(ApplyThreadHistoryResult {
            sequence: params.changes.sequence,
            applied: true,
        })
    }

    fn list_turns_sync(&self, params: ListTurnsParams) -> ThreadStoreResult<TurnPage> {
        let conn = self.open_thread_store()?;
        ensure_thread_visible(&conn, &params.thread_id, params.include_archived)?;
        let limit = page_limit(params.page.limit)?;
        let cursor = decode_cursor(params.page.cursor.as_ref(), CursorKind::Turns)?;
        let mut rows = query_turn_page(
            &conn,
            &params.thread_id,
            params.page.sort_direction,
            cursor.as_ref(),
            limit + 1,
        )?;
        let has_more = rows.len() > limit as usize;
        rows.truncate(limit as usize);
        for (turn, _, _) in &mut rows {
            hydrate_turn(&conn, turn, params.items_view)?;
        }
        let next_cursor = has_more
            .then(|| rows.last())
            .flatten()
            .map(|(_, ordinal, id)| encode_cursor(CursorKind::Turns, *ordinal, id))
            .transpose()?;
        let backwards_cursor = params
            .page
            .cursor
            .as_ref()
            .and_then(|_| rows.first())
            .map(|(_, ordinal, id)| encode_cursor(CursorKind::Turns, *ordinal, id))
            .transpose()?;
        Ok(TurnPage {
            data: rows.into_iter().map(|(turn, _, _)| turn).collect(),
            next_cursor,
            backwards_cursor,
        })
    }

    fn list_items_sync(&self, params: ListItemsParams) -> ThreadStoreResult<ItemPage> {
        let conn = self.open_thread_store()?;
        ensure_thread_visible(&conn, &params.thread_id, params.include_archived)?;
        let limit = page_limit(params.page.limit)?;
        let cursor = decode_cursor(params.page.cursor.as_ref(), CursorKind::Items)?;
        let mut rows = query_item_page(
            &conn,
            &params.thread_id,
            params.turn_id.as_ref(),
            params.page.sort_direction,
            cursor.as_ref(),
            limit + 1,
        )?;
        let has_more = rows.len() > limit as usize;
        rows.truncate(limit as usize);
        let next_cursor = has_more
            .then(|| rows.last())
            .flatten()
            .map(|(_, ordinal, id)| encode_cursor(CursorKind::Items, *ordinal, id))
            .transpose()?;
        let backwards_cursor = params
            .page
            .cursor
            .as_ref()
            .and_then(|_| rows.first())
            .map(|(_, ordinal, id)| encode_cursor(CursorKind::Items, *ordinal, id))
            .transpose()?;
        Ok(ItemPage {
            data: rows.into_iter().map(|(item, _, _)| item).collect(),
            next_cursor,
            backwards_cursor,
        })
    }

    fn update_thread_metadata_sync(
        &self,
        params: UpdateThreadMetadataParams,
    ) -> ThreadStoreResult<Thread> {
        let mut conn = self.open_thread_store()?;
        let tx = conn.transaction().map_err(store_error)?;
        let Some((mut thread, archived)) = read_thread_row(&tx, &params.thread_id)? else {
            return Err(error(format!("thread {} does not exist", params.thread_id)));
        };
        if archived && !params.include_archived {
            return Err(error(format!("thread {} is archived", params.thread_id)));
        }
        apply_metadata_patch(&mut thread, params.patch);
        persist_thread_snapshot(&tx, &thread)?;
        tx.commit().map_err(store_error)?;
        Ok(thread)
    }

    fn set_archived_sync(
        &self,
        params: ArchiveThreadParams,
        archived: bool,
    ) -> ThreadStoreResult<Option<Thread>> {
        let mut conn = self.open_thread_store()?;
        let tx = conn.transaction().map_err(store_error)?;
        let Some((mut thread, _)) = read_thread_row(&tx, &params.thread_id)? else {
            return Err(error(format!("thread {} does not exist", params.thread_id)));
        };
        thread.archived = archived;
        tx.execute(
            "UPDATE canonical_threads SET archived = ?2, thread_json = ?3 WHERE thread_id = ?1",
            params![
                params.thread_id.as_str(),
                i64::from(archived),
                encode_json(&thread)?,
            ],
        )
        .map_err(store_error)?;
        tx.commit().map_err(store_error)?;
        if archived {
            Ok(None)
        } else {
            Ok(Some(thread))
        }
    }

    fn delete_thread_sync(&self, params: DeleteThreadParams) -> ThreadStoreResult<()> {
        let conn = self.open_thread_store()?;
        conn.execute(
            "DELETE FROM canonical_threads WHERE thread_id = ?1",
            params![params.thread_id.as_str()],
        )
        .map_err(store_error)?;
        Ok(())
    }

    fn history_sequence_sync(&self, thread_id: ThreadId) -> ThreadStoreResult<Option<u64>> {
        let conn = self.open_thread_store()?;
        let value = conn
            .query_row(
                "SELECT last_sequence FROM canonical_threads WHERE thread_id = ?1",
                params![thread_id.as_str()],
                |row| row.get::<_, Option<i64>>(0),
            )
            .optional()
            .map_err(store_error)?
            .flatten();
        value
            .map(|sequence| from_i64(sequence, "history sequence"))
            .transpose()
    }
}

fn non_empty_string(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.trim().is_empty())
}

fn derive_agent_state(thread: &Thread, edge_status: ThreadSpawnEdgeStatus) -> CollabAgentState {
    let latest_turn = thread.turns.iter().max_by(|left, right| {
        left.updated_at_ms
            .cmp(&right.updated_at_ms)
            .then_with(|| left.turn_id.as_str().cmp(right.turn_id.as_str()))
    });
    let status = if edge_status == ThreadSpawnEdgeStatus::Closed {
        CollabAgentStatus::Shutdown
    } else {
        match &thread.status {
            ThreadStatus::Active { .. } => CollabAgentStatus::Running,
            ThreadStatus::SystemError => CollabAgentStatus::Errored,
            ThreadStatus::NotLoaded | ThreadStatus::Idle => {
                match latest_turn.map(|turn| turn.status) {
                    Some(TurnStatus::InProgress) => CollabAgentStatus::Running,
                    Some(TurnStatus::Interrupted) => CollabAgentStatus::Interrupted,
                    Some(TurnStatus::Failed) => CollabAgentStatus::Errored,
                    Some(TurnStatus::Completed) => CollabAgentStatus::Completed,
                    None => CollabAgentStatus::PendingInit,
                }
            }
        }
    };
    let message = (status == CollabAgentStatus::Errored)
        .then(|| latest_turn.and_then(|turn| turn.error.as_ref()))
        .flatten()
        .map(|error| error.message.clone())
        .filter(|message| !message.trim().is_empty());
    CollabAgentState { status, message }
}

fn canonical_thread_from_stored_session(stored: &StoredSession) -> Thread {
    let session = &stored.session;
    let title = session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.title.clone());
    let metadata = session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.clone())
        .unwrap_or(serde_json::Value::Null);
    let model_provider = metadata
        .get("providerName")
        .or_else(|| metadata.get("provider_name"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_string();
    Thread {
        session_id: agent_protocol::SessionId::new(session.session_id.clone()),
        thread_id: ThreadId::new(session.thread_id.clone()),
        status: match session.status {
            AgentSessionStatus::Running => ThreadStatus::Active {
                active_flags: Vec::new(),
            },
            AgentSessionStatus::WaitingAction => ThreadStatus::Active {
                active_flags: vec![ThreadActiveFlag::WaitingOnApproval],
            },
            AgentSessionStatus::Failed => ThreadStatus::SystemError,
            AgentSessionStatus::Idle
            | AgentSessionStatus::Completed
            | AgentSessionStatus::Canceled => ThreadStatus::Idle,
        },
        created_at_ms: timestamp_millis(&session.created_at),
        updated_at_ms: timestamp_millis(&session.updated_at),
        archived: false,
        recency_at_ms: Some(timestamp_millis(&session.updated_at)),
        parent_thread_id: None,
        agent_path: None,
        agent_nickname: None,
        agent_role: None,
        last_task_message: None,
        agent_state: None,
        forked_from_id: None,
        preview: title.clone().unwrap_or_default(),
        model_provider,
        product: (!session.app_id.trim().is_empty()).then(|| session.app_id.clone()),
        name: title,
        metadata,
        turns: Vec::new(),
        turns_view: ThreadTurnsView::NotLoaded,
    }
}

fn timestamp_millis(value: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.timestamp_millis())
        .unwrap_or_default()
}

impl ThreadStore for ProjectionStore {
    fn as_any(&self) -> &dyn Any {
        self
    }

    fn create_thread(&self, params: CreateThreadParams) -> ThreadStoreFuture<'_, ()> {
        let store = self.clone();
        Box::pin(async move { store.create_thread_sync(params) })
    }

    fn read_thread(&self, params: ReadThreadParams) -> ThreadStoreFuture<'_, Option<Thread>> {
        let store = self.clone();
        Box::pin(async move { store.read_thread_sync(params) })
    }

    fn list_threads(&self, params: ListThreadsParams) -> ThreadStoreFuture<'_, ThreadPage> {
        let store = self.clone();
        Box::pin(async move { store.list_threads_sync(params) })
    }

    fn apply_history(
        &self,
        params: ApplyThreadHistoryParams,
    ) -> ThreadStoreFuture<'_, ApplyThreadHistoryResult> {
        let store = self.clone();
        Box::pin(async move { store.apply_history_sync(params) })
    }

    fn list_turns(&self, params: ListTurnsParams) -> ThreadStoreFuture<'_, TurnPage> {
        let store = self.clone();
        Box::pin(async move { store.list_turns_sync(params) })
    }

    fn list_items(&self, params: ListItemsParams) -> ThreadStoreFuture<'_, ItemPage> {
        let store = self.clone();
        Box::pin(async move { store.list_items_sync(params) })
    }

    fn update_thread_metadata(
        &self,
        params: UpdateThreadMetadataParams,
    ) -> ThreadStoreFuture<'_, Thread> {
        let store = self.clone();
        Box::pin(async move { store.update_thread_metadata_sync(params) })
    }

    fn archive_thread(&self, params: ArchiveThreadParams) -> ThreadStoreFuture<'_, ()> {
        let store = self.clone();
        Box::pin(async move { store.set_archived_sync(params, true).map(|_| ()) })
    }

    fn unarchive_thread(&self, params: ArchiveThreadParams) -> ThreadStoreFuture<'_, Thread> {
        let store = self.clone();
        Box::pin(async move {
            store
                .set_archived_sync(params, false)?
                .ok_or_else(|| error("unarchive did not return a thread"))
        })
    }

    fn delete_thread(&self, params: DeleteThreadParams) -> ThreadStoreFuture<'_, ()> {
        let store = self.clone();
        Box::pin(async move { store.delete_thread_sync(params) })
    }

    fn history_sequence(&self, thread_id: ThreadId) -> ThreadStoreFuture<'_, Option<u64>> {
        let store = self.clone();
        Box::pin(async move { store.history_sequence_sync(thread_id) })
    }
}

fn apply_metadata_patch(thread: &mut Thread, patch: ThreadMetadataPatch) {
    if let Some(name) = patch.name {
        thread.name = name;
    }
    if let Some(preview) = patch.preview {
        thread.preview = preview;
    }
    if let Some(model_provider) = patch.model_provider {
        thread.model_provider = model_provider;
    }
    if let Some(product) = patch.product {
        thread.product = product;
    }
    if let Some(updated_at_ms) = patch.updated_at_ms {
        thread.updated_at_ms = updated_at_ms;
    }
    if let Some(recency_at_ms) = patch.advance_recency_at_ms {
        thread.recency_at_ms = Some(
            thread
                .recency_at_ms
                .map_or(recency_at_ms, |current| current.max(recency_at_ms)),
        );
    }
    if let Some(metadata) = patch.metadata {
        thread.metadata = metadata.unwrap_or(serde_json::Value::Null);
    }
}

fn validate_change_set(params: &ApplyThreadHistoryParams) -> ThreadStoreResult<()> {
    if params.changes.sequence > i64::MAX as u64 {
        return Err(error("history sequence exceeds SQLite range"));
    }
    if params
        .changes
        .rollback_to_sequence
        .is_some_and(|target| target >= params.changes.sequence)
    {
        return Err(error("rollback target must precede the applied sequence"));
    }
    for turn in &params.changes.changed_turns {
        if turn.session_id != params.session_id || turn.thread_id != params.thread_id {
            return Err(error("turn identity does not match history change set"));
        }
    }
    for item in &params.changes.changed_items {
        if item.session_id != params.session_id || item.thread_id != params.thread_id {
            return Err(error("item identity does not match history change set"));
        }
    }
    Ok(())
}

fn validate_thread_identity(thread: &Thread) -> ThreadStoreResult<()> {
    if thread.session_id.as_str().trim().is_empty() || thread.thread_id.as_str().trim().is_empty() {
        return Err(error("thread identity must not be empty"));
    }
    Ok(())
}

fn insert_thread_row(conn: &Connection, thread: Thread) -> ThreadStoreResult<()> {
    validate_thread_identity(&thread)?;
    let thread = thread_without_turns(thread);
    let encoded = encode_json(&thread)?;
    conn.execute(
        "INSERT INTO canonical_threads (
            thread_id, session_id, thread_json, created_at_ms, updated_at_ms,
            recency_at_ms, archived, last_sequence
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)",
        params![
            thread.thread_id.as_str(),
            thread.session_id.as_str(),
            encoded,
            thread.created_at_ms,
            thread.updated_at_ms,
            thread.recency_at_ms,
            i64::from(thread.archived),
        ],
    )
    .map_err(|source| error(format!("cannot create canonical thread: {source}")))?;
    Ok(())
}

fn canonical_history_matches(thread: &Thread, changes: &ThreadHistoryChangeSet) -> bool {
    let expected_turn_ids = changes
        .changed_turns
        .iter()
        .map(|turn| turn.turn_id.as_str())
        .collect::<HashSet<_>>();
    let actual_turn_ids = thread
        .turns
        .iter()
        .map(|turn| turn.turn_id.as_str())
        .collect::<HashSet<_>>();
    if expected_turn_ids != actual_turn_ids {
        return false;
    }

    let actual_items = thread
        .turns
        .iter()
        .flat_map(|turn| &turn.items)
        .map(|item| (item.item_id.as_str(), item))
        .collect::<HashMap<_, _>>();
    actual_items.len() == changes.changed_items.len()
        && changes.changed_items.iter().all(|expected| {
            actual_items
                .get(expected.item_id.as_str())
                .is_some_and(|actual| *actual == expected)
        })
}

fn thread_without_turns(mut thread: Thread) -> Thread {
    thread.turns.clear();
    thread.turns_view = ThreadTurnsView::NotLoaded;
    // Agent identity and status are joined from the durable graph/identity stores on read.
    thread.parent_thread_id = None;
    thread.agent_path = None;
    thread.agent_nickname = None;
    thread.agent_role = None;
    thread.last_task_message = None;
    thread.agent_state = None;
    thread
}

fn turn_without_items(mut turn: Turn) -> Turn {
    turn.items.clear();
    turn.items_view = TurnItemsView::NotLoaded;
    turn
}

fn page_limit(limit: u32) -> ThreadStoreResult<u32> {
    if limit == 0 || limit > MAX_PAGE_SIZE {
        return Err(error(format!(
            "page limit must be between 1 and {MAX_PAGE_SIZE}"
        )));
    }
    Ok(limit)
}

fn encode_cursor(kind: CursorKind, position: i64, id: &str) -> ThreadStoreResult<StoreCursor> {
    let json = serde_json::to_vec(&CursorValue {
        kind,
        position,
        id: id.to_string(),
    })
    .map_err(store_error)?;
    StoreCursor::new(URL_SAFE_NO_PAD.encode(json)).map_err(error)
}

fn decode_cursor(
    cursor: Option<&StoreCursor>,
    expected_kind: CursorKind,
) -> ThreadStoreResult<Option<CursorValue>> {
    let Some(cursor) = cursor else {
        return Ok(None);
    };
    let bytes = URL_SAFE_NO_PAD
        .decode(cursor.as_str())
        .map_err(|_| error("invalid store cursor"))?;
    let decoded: CursorValue =
        serde_json::from_slice(&bytes).map_err(|_| error("invalid store cursor"))?;
    if decoded.kind != expected_kind || decoded.id.is_empty() {
        return Err(error("store cursor belongs to another collection"));
    }
    Ok(Some(decoded))
}

fn change_fingerprint(params: &ApplyThreadHistoryParams) -> ThreadStoreResult<String> {
    let bytes = serde_json::to_vec(params).map_err(store_error)?;
    Ok(hex::encode(Sha256::digest(bytes)))
}

fn encode_json<T: Serialize>(value: &T) -> ThreadStoreResult<String> {
    serde_json::to_string(value).map_err(store_error)
}

fn decode_json<T: serde::de::DeserializeOwned>(value: &str) -> ThreadStoreResult<T> {
    serde_json::from_str(value).map_err(store_error)
}

fn to_i64(value: u64, field: &str) -> ThreadStoreResult<i64> {
    i64::try_from(value).map_err(|_| error(format!("{field} exceeds SQLite range")))
}

fn from_i64(value: i64, field: &str) -> ThreadStoreResult<u64> {
    u64::try_from(value).map_err(|_| error(format!("{field} is negative")))
}

fn error(message: impl Into<String>) -> ThreadStoreError {
    ThreadStoreError::new(message)
}

fn store_error(source: impl std::fmt::Display) -> ThreadStoreError {
    error(source.to_string())
}
