use super::data_error;
use crate::RuntimeCoreError;
use crate::WorkspaceObjectCanvasSnapshot;
use crate::WorkspaceObjectCanvasSnapshotListParams;
use app_server_protocol::WorkspaceRightSurfacePendingListParams;
use app_server_protocol::WorkspaceRightSurfacePendingRequest;
use chrono::SecondsFormat;
use chrono::Utc;
use lime_core::database;
use lime_core::database::DbConnection;
use rusqlite::params;
use rusqlite::Row;

const STATUS_PENDING: &str = "pending";

pub(crate) fn save_object_canvas_snapshot(
    db: &DbConnection,
    snapshot: WorkspaceObjectCanvasSnapshot,
) -> Result<(), RuntimeCoreError> {
    let revision = i64::try_from(snapshot.revision).map_err(data_error)?;
    let snapshot_json = serde_json::to_string(&snapshot.snapshot_json).map_err(data_error)?;
    let now = now_timestamp();
    let conn = database::lock_db(db).map_err(data_error)?;
    ensure_table(&conn)?;
    conn.execute(
        "INSERT OR REPLACE INTO workspace_object_canvas_snapshots (
             snapshot_id, request_id, workspace_id, workspace_root, session_id,
             board_id, revision, persistence_key, candidate_id, object_id,
             object_kind, snapshot_json, created_at, updated_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            snapshot.snapshot_id,
            snapshot.request_id,
            snapshot.workspace_id,
            snapshot.workspace_root,
            snapshot.session_id,
            snapshot.board_id,
            revision,
            snapshot.persistence_key,
            snapshot.candidate_id,
            snapshot.object_id,
            snapshot.object_kind,
            snapshot_json,
            snapshot.created_at,
            now,
        ],
    )
    .map_err(data_error)?;
    Ok(())
}

pub(crate) fn list_object_canvas_snapshots(
    db: &DbConnection,
    params: WorkspaceObjectCanvasSnapshotListParams,
) -> Result<Vec<WorkspaceObjectCanvasSnapshot>, RuntimeCoreError> {
    let conn = database::lock_db(db).map_err(data_error)?;
    ensure_table(&conn)?;

    let mut stmt = conn
        .prepare(
            "SELECT snapshot_id, request_id, workspace_id, workspace_root, session_id,
                    board_id, revision, persistence_key, candidate_id, object_id,
                    object_kind, snapshot_json, created_at
             FROM workspace_object_canvas_snapshots
             ORDER BY created_at DESC, revision DESC",
        )
        .map_err(data_error)?;
    let mut snapshots = stmt
        .query_map([], row_to_object_canvas_snapshot)
        .map_err(data_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(data_error)?;

    let workspace_id = optional_trimmed(params.workspace_id);
    let workspace_root = optional_trimmed(params.workspace_root);
    let session_id = optional_trimmed(params.session_id);
    let board_id = optional_trimmed(params.board_id);
    let persistence_key = optional_trimmed(params.persistence_key);
    snapshots.retain(|snapshot| {
        optional_filter_matches(&workspace_id, snapshot.workspace_id.as_deref())
            && optional_filter_matches(&workspace_root, snapshot.workspace_root.as_deref())
            && optional_filter_matches(&session_id, snapshot.session_id.as_deref())
            && optional_filter_matches(&board_id, Some(snapshot.board_id.as_str()))
            && optional_filter_matches(&persistence_key, Some(snapshot.persistence_key.as_str()))
    });
    if let Some(limit) = params.limit.map(|value| value as usize) {
        snapshots.truncate(limit);
    }
    Ok(snapshots)
}

pub(crate) fn save_pending_request(
    db: &DbConnection,
    request: WorkspaceRightSurfacePendingRequest,
) -> Result<(), RuntimeCoreError> {
    let request_json = serde_json::to_string(&request).map_err(data_error)?;
    let conn = database::lock_db(db).map_err(data_error)?;
    ensure_table(&conn)?;
    conn.execute(
        "INSERT OR REPLACE INTO workspace_right_surface_pending_requests (
             request_id, workspace_id, workspace_root, session_id, surface_kind,
             status, requested_at, expires_at, request_json, updated_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            request.request_id,
            request.workspace_id,
            request.workspace_root,
            request.session_id,
            request.surface_kind,
            request.status,
            request.requested_at,
            request.expires_at,
            request_json,
            now_timestamp(),
        ],
    )
    .map_err(data_error)?;
    Ok(())
}

pub(crate) fn list_pending_requests(
    db: &DbConnection,
    params: WorkspaceRightSurfacePendingListParams,
) -> Result<Vec<WorkspaceRightSurfacePendingRequest>, RuntimeCoreError> {
    let conn = database::lock_db(db).map_err(data_error)?;
    ensure_table(&conn)?;
    prune_expired(&conn)?;

    let mut stmt = conn
        .prepare(
            "SELECT request_json
             FROM workspace_right_surface_pending_requests
             WHERE status = ?1
             ORDER BY requested_at DESC",
        )
        .map_err(data_error)?;
    let mut requests = stmt
        .query_map(params![STATUS_PENDING], row_to_pending_request)
        .map_err(data_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(data_error)?;

    let workspace_id = optional_trimmed(params.workspace_id);
    let workspace_root = optional_trimmed(params.workspace_root);
    let session_id = optional_trimmed(params.session_id);
    let surface_kind = optional_trimmed(params.surface_kind);
    requests.retain(|request| {
        optional_filter_matches(&workspace_id, request.workspace_id.as_deref())
            && optional_filter_matches(&workspace_root, request.workspace_root.as_deref())
            && optional_filter_matches(&session_id, request.session_id.as_deref())
            && surface_kind
                .as_ref()
                .is_none_or(|value| request.surface_kind == *value)
    });
    if let Some(limit) = params.limit.map(|value| value as usize) {
        requests.truncate(limit);
    }
    Ok(requests)
}

pub(crate) fn delete_pending_requests(
    db: &DbConnection,
    request_ids: Vec<String>,
) -> Result<Vec<String>, RuntimeCoreError> {
    let conn = database::lock_db(db).map_err(data_error)?;
    ensure_table(&conn)?;

    let mut deleted = Vec::new();
    for request_id in request_ids {
        let request_id = request_id.trim();
        if request_id.is_empty() {
            continue;
        }
        let affected = conn
            .execute(
                "DELETE FROM workspace_right_surface_pending_requests WHERE request_id = ?1",
                params![request_id],
            )
            .map_err(data_error)?;
        if affected > 0 {
            deleted.push(request_id.to_string());
        }
    }
    Ok(deleted)
}

fn ensure_table(conn: &rusqlite::Connection) -> Result<(), RuntimeCoreError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS workspace_right_surface_pending_requests (
             request_id TEXT PRIMARY KEY,
             workspace_id TEXT,
             workspace_root TEXT,
             session_id TEXT,
             surface_kind TEXT NOT NULL,
             status TEXT NOT NULL,
             requested_at TEXT NOT NULL,
             expires_at TEXT,
             request_json TEXT NOT NULL,
             updated_at TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS idx_right_surface_pending_workspace
             ON workspace_right_surface_pending_requests(workspace_id, surface_kind, status);
         CREATE INDEX IF NOT EXISTS idx_right_surface_pending_session
             ON workspace_right_surface_pending_requests(session_id, surface_kind, status);
         CREATE INDEX IF NOT EXISTS idx_right_surface_pending_expires
             ON workspace_right_surface_pending_requests(status, expires_at);

         CREATE TABLE IF NOT EXISTS workspace_object_canvas_snapshots (
             snapshot_id TEXT PRIMARY KEY,
             request_id TEXT NOT NULL,
             workspace_id TEXT,
             workspace_root TEXT,
             session_id TEXT,
             board_id TEXT NOT NULL,
             revision INTEGER NOT NULL,
             persistence_key TEXT NOT NULL,
             candidate_id TEXT,
             object_id TEXT,
             object_kind TEXT,
             snapshot_json TEXT NOT NULL,
             created_at TEXT NOT NULL,
             updated_at TEXT NOT NULL,
             UNIQUE(persistence_key, revision)
         );
         CREATE INDEX IF NOT EXISTS idx_object_canvas_snapshots_workspace
             ON workspace_object_canvas_snapshots(workspace_id, board_id, created_at);
         CREATE INDEX IF NOT EXISTS idx_object_canvas_snapshots_session
             ON workspace_object_canvas_snapshots(session_id, board_id, created_at);
         CREATE INDEX IF NOT EXISTS idx_object_canvas_snapshots_persistence_key
             ON workspace_object_canvas_snapshots(persistence_key, revision);",
    )
    .map_err(data_error)?;
    Ok(())
}

fn prune_expired(conn: &rusqlite::Connection) -> Result<(), RuntimeCoreError> {
    conn.execute(
        "DELETE FROM workspace_right_surface_pending_requests
         WHERE status = ?1 AND expires_at IS NOT NULL AND expires_at <= ?2",
        params![STATUS_PENDING, now_timestamp()],
    )
    .map_err(data_error)?;
    Ok(())
}

fn row_to_pending_request(
    row: &Row<'_>,
) -> Result<WorkspaceRightSurfacePendingRequest, rusqlite::Error> {
    let request_json: String = row.get(0)?;
    serde_json::from_str(&request_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
    })
}

fn row_to_object_canvas_snapshot(
    row: &Row<'_>,
) -> Result<WorkspaceObjectCanvasSnapshot, rusqlite::Error> {
    let revision: i64 = row.get(6)?;
    let revision = u64::try_from(revision).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            6,
            rusqlite::types::Type::Integer,
            Box::new(error),
        )
    })?;
    let snapshot_json: String = row.get(11)?;
    let snapshot_json = serde_json::from_str(&snapshot_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(11, rusqlite::types::Type::Text, Box::new(error))
    })?;

    Ok(WorkspaceObjectCanvasSnapshot {
        snapshot_id: row.get(0)?,
        request_id: row.get(1)?,
        workspace_id: row.get(2)?,
        workspace_root: row.get(3)?,
        session_id: row.get(4)?,
        board_id: row.get(5)?,
        revision,
        persistence_key: row.get(7)?,
        candidate_id: row.get(8)?,
        object_id: row.get(9)?,
        object_kind: row.get(10)?,
        snapshot_json,
        created_at: row.get(12)?,
    })
}

fn now_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn optional_trimmed(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn optional_filter_matches(filter: &Option<String>, value: Option<&str>) -> bool {
    filter
        .as_ref()
        .is_none_or(|filter| value == Some(filter.as_str()))
}
